import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../src/core.js';
import {findPath,buildingCells} from '../src/pathfinding.js';
import {STATS} from '../src/data.js';
const advance=(g,t)=>{for(let i=0;i<t*10&&!g.result;i++)g.step(.1);};

test('均衡地图：四片山脉、九组资源、对角出生与独立地图尺寸',()=>{
  const g=new Game('balanced'),{width:w,height:h,terrain,resources,foodPoints}=g.map;
  assert.equal(w,128);assert.equal(h,88);assert.equal(resources.length,9);assert.equal(foodPoints.length,9);
  assert.equal(new Set([...resources,...foodPoints].map(p=>`${p.x},${p.y}`)).size,18);
  assert.equal(g.visible[0].length,w*h);
  for(let i=0;i<terrain.length;i++)assert.equal(terrain[i],terrain[terrain.length-1-i]);
  const seen=new Set();let mountains=0;
  for(let i=0;i<terrain.length;i++)if(terrain[i]===1&&!seen.has(i)){
    mountains++;const todo=[i];seen.add(i);
    while(todo.length){const j=todo.pop(),x=j%w,y=Math.floor(j/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&terrain[k]===1&&!seen.has(k)){seen.add(k);todo.push(k);}
    }}
  }
  assert.equal(mountains,4);
  for(const team of [0,1]){
    const units=g.units.filter(u=>u.team===team);
    assert.equal(units.filter(u=>u.type==='shield').length,6);assert.equal(units.filter(u=>u.type==='archer').length,6);
    assert.equal(g.foodRate(g.buildings.find(b=>b.team===team&&b.type==='factory')),6);
    for(const p of [...resources,...foodPoints])assert.ok(findPath(g.map,g.buildings,units[0],p,true).length>0);
  }
  assert.equal(g.aiFood,500);assert.equal(g.aiOre,500);assert.equal(g.food,1000);assert.equal(g.ore,1000);
  const demo=new Game();assert.equal(demo.map.width,96);
  const path=findPath(g.map,g.buildings,{x:100,y:80},{x:124,y:84});assert.ok(path.length>0);
  assert.ok(path.at(-1).x>120); // 创建普通关卡不会改变已有大地图的寻路宽度。
});

test('均衡对抗：初始基地失去不判负，己方建筑全毁才失败',()=>{
  for(const demolish of [true,false]){
    const g=new Game('balanced');g.ai=null;
    const buildings=g.buildings.filter(b=>b.team===0),base=buildings.find(b=>b.primary);
    if(demolish)assert.equal(g.demolish(base.id),null);else g.damage(base,99999);
    g.step(.05);assert.equal(g.result,null);
    for(const b of buildings.filter(b=>!b.primary)){
      if(demolish)assert.equal(g.demolish(b.id),null);else g.damage(b,99999);
    }
    if(!demolish)g.step(.05);
    assert.equal(g.result,'defeat');
  }
});

test('食物点：双方翻倍、普通产出、施工不产出、拆毁后资源保留',()=>{
  const g=new Game('balanced');g.ai=null;
  const factories=g.buildings.filter(b=>b.type==='factory');
  const normal=g.addBuilding('factory',0,35.5,75.5);assert.equal(g.foodRate(normal),3);
  const f0=g.food,f1=g.aiFood;advance(g,1);
  assert.ok(Math.abs(g.food-f0-9)<1e-6);assert.ok(Math.abs(g.aiFood-f1-6)<1e-6);
  factories[1].constructionPending=true;factories[1].constructionRemaining=180;
  const before=g.aiFood;advance(g,1);assert.equal(g.aiFood,before);
  const node={...g.map.foodPoints[0]};factories[0].hp=0;
  assert.deepEqual(g.map.foodPoints[0],node);
  assert.equal(g.foodRate(g.addBuilding('factory',0,node.x+.5,node.y+.5)),6);
});

test('AI 建造同样检查视野、敌方占地、独立扣费，自动让位并完成施工',()=>{
  const g=new Game('balanced');g.ai=null;
  const units=g.units.filter(u=>u.team===1),p={x:units[0].x,y:units[0].y};
  assert.match(g.build(units.map(u=>u.id),'factory',{x:64,y:70},1),/视野/);
  const intruder=g.addUnit('shield',0,p.x,p.y);assert.match(g.placement('factory',p,1).error,/移开/);intruder.hp=0;
  const food=g.food,ore=g.ore,aiFood=g.aiFood,aiOre=g.aiOre;
  assert.equal(g.build(units.map(u=>u.id),'factory',p,1),null);
  const b=g.buildings.at(-1);assert.equal(b.team,1);assert.equal(b.awaitingEviction,true);
  assert.equal(g.food,food);assert.equal(g.ore,ore);assert.equal(g.aiFood,aiFood-STATS.factory.food);assert.equal(g.aiOre,aiOre-STATS.factory.ore);
  advance(g,100);assert.equal(b.constructionPending,false);
  const c=buildingCells(b);assert.ok(!g.units.some(u=>u.hp>0&&u.x>=c.x0&&u.x<c.x1+1&&u.y>=c.y0&&u.y<c.y1+1));
});

test('AI 发现基地受袭后集结反击，不响应远处未见敌军',()=>{
  const g=new Game('balanced');g.aiFood=0;g.aiOre=0;
  const base=g.buildings.find(b=>b.team===1&&b.primary);
  const foe=g.units.find(u=>u.team===0);foe.x=base.x-9;foe.y=base.y+6;foe.holdFire=true;g.updateVision();
  g.ai.update(g,3);
  const main=g.units.filter(u=>u.team===1&&u.type!=='wilddog');
  assert.ok(main.length>=10);assert.ok(main.every(u=>u.aiOrderKey.startsWith('respond:')));
  advance(g,12);assert.ok(foe.hp<foe.maxHp,'支援部队应实际造成伤害');
  foe.x=15;foe.y=70;g.updateVision();g.ai.timer=0;g.ai.update(g,3);
  assert.ok(g.units.filter(u=>u.team===1).every(u=>!u.aiOrderKey?.startsWith('respond:')));
});

test('AI 达到四十五名主力才主动出击，重损后回防',()=>{
  const g=new Game('balanced');g.aiFood=0;g.aiOre=0;
  while(g.units.filter(u=>u.team===1).length<44)g.addUnit('shield',1,100,25);
  g.ai.update(g,3);assert.equal(g.ai.attacking,false);
  g.addUnit('shield',1,100,25);g.ai.timer=0;g.ai.update(g,3);assert.equal(g.ai.attacking,true);
  assert.ok(g.units.filter(u=>u.team===1).every(u=>u.aiOrderKey.startsWith('attack:')));
  g.units=g.units.filter(u=>u.team===0).concat(g.units.filter(u=>u.team===1).slice(0,19));
  g.ai.timer=0;g.ai.update(g,3);assert.equal(g.ai.attacking,false);
  assert.ok(g.units.filter(u=>u.team===1).every(u=>u.aiOrderKey.startsWith('defend:')));
});

test('AI 根据当前资源短缺优先建设对应经济建筑',()=>{
  const nextJob=(food,ore)=>{
    const g=new Game('balanced');g.visible[1].fill(1);g.aiFood=food;g.aiOre=ore;
    const own=g.buildings.filter(b=>b.team===1&&b.hp>0),base=own.find(b=>b.primary);
    return g.ai.planBuilding(g,own,g.units.filter(u=>u.team===1),base);
  };
  assert.equal(nextJob(50,1000).type,'factory','食物储备明显不足时应先建食物厂');
  assert.equal(nextJob(1000,50).type,'mine','矿产储备明显不足时应先建采矿场');
});

test('AI 建筑规划覆盖敌方半场四组资源，并为每组配置哨塔',()=>{
  const g=new Game('balanced');g.visible[1].fill(1);g.units=[];
  for(let i=0;i<20;i++){
    const own=g.buildings.filter(b=>b.team===1&&b.hp>0),base=own.find(b=>b.primary);
    const job=g.ai.planBuilding(g,own,[],base);
    if(!job)break;
    g.addBuilding(job.type,1,job.x,job.y);
  }
  const own=g.buildings.filter(b=>b.team===1&&b.hp>0),spawn=g.map.spawns[1],other=g.map.spawns[0];
  const groups=g.map.resources.map((mine,i)=>({mine,food:g.map.foodPoints[i]}))
    .filter(g=>distance({x:(g.mine.x+g.food.x)/2,y:(g.mine.y+g.food.y)/2},spawn)<distance({x:(g.mine.x+g.food.x)/2,y:(g.mine.y+g.food.y)/2},other));
  const covers=(b,n)=>{const c=buildingCells(b);return n.x>=c.x0&&n.x<=c.x1&&n.y>=c.y0&&n.y<=c.y1;};
  assert.equal(groups.length,4);
  for(const group of groups){
    assert.ok(own.some(b=>b.type==='mine'&&covers(b,group.mine)));
    assert.ok(own.some(b=>b.type==='factory'&&covers(b,group.food)));
    const center={x:(group.mine.x+group.food.x)/2+.5,y:(group.mine.y+group.food.y)/2+.5};
    assert.ok(own.some(b=>b.type==='tower'&&distance(b,center)<=8));
  }
});

test('自然经济长局：探图、多点扩张、哨塔、扩人口、积兵进攻与胜负',()=>{
  const g=new Game('balanced');let scouted=false,pushed=false,builtMine=false,builtTower=false;
  for(let i=0;i<6000&&!g.result;i++){
    g.step(.1);
    scouted ||=g.units.some(u=>u.team===1&&u.type==='wilddog'&&distance(u,g.map.spawns[1])>35);
    pushed ||=g.ai.attacking;
    builtMine ||=g.buildings.filter(b=>b.team===1&&b.type==='mine').length>1;
    builtTower ||=g.buildings.some(b=>b.team===1&&b.type==='tower'&&!b.constructionPending);
  }
  assert.ok(scouted);assert.ok(pushed);assert.ok(builtMine);
  assert.ok(builtTower);
  assert.ok(g.buildings.filter(b=>b.team===1&&b.type==='base'&&!b.constructionPending).length>=2);
  assert.ok(g.buildings.filter(b=>b.team===1&&b.type==='factory'&&!b.constructionPending).length>=2);
  assert.equal(g.result,'defeat','玩家不操作时，BOT 应能完成进攻摧毁主基地');
  const h=new Game('balanced');h.ai=null;
  h.buildings.find(b=>b.team===1&&b.primary).hp=0;h.step(.1);assert.equal(h.result,null);
  for(const b of h.buildings)if(b.team===1)b.hp=0;h.step(.1);assert.equal(h.result,'victory');
});
