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
    assert.equal(g.foodRate(g.buildings.find(b=>b.team===team&&b.type==='factory')),5);
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

test('食物点：双方加成、普通产出、施工不产出、拆毁后资源保留',()=>{
  const g=new Game('balanced');g.ai=null;
  const factories=g.buildings.filter(b=>b.type==='factory');
  for(const factory of factories)assert.equal(g.foodRate(factory),5);
  const normal=g.addBuilding('factory',0,35.5,75.5);assert.equal(g.foodRate(normal),2);
  const f0=g.food,f1=g.aiFood;advance(g,1);
  assert.ok(Math.abs(g.food-f0-7)<1e-6);assert.ok(Math.abs(g.aiFood-f1-5)<1e-6);
  factories[1].constructionPending=true;factories[1].constructionRemaining=180;
  const before=g.aiFood;advance(g,1);assert.equal(g.aiFood,before);
  const node={...g.map.foodPoints[0]};factories[0].hp=0;
  assert.deepEqual(g.map.foodPoints[0],node);
  assert.equal(g.foodRate(g.addBuilding('factory',0,node.x+.5,node.y+.5)),5);
});

test('AI 建造允许预定、检查敌方占地、独立扣费，自动让位并完成施工',()=>{
  const g=new Game('balanced');g.ai=null;
  const units=g.units.filter(u=>u.team===1),p={x:units[0].x,y:units[0].y};
  assert.equal(g.placement('factory',{x:64,y:70},1).reserved,true);
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
  // 单独验证军事阈值；建设分工与进攻并行另有集成测试。
  g.ai.updateEconomy=()=>null;
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

test('AI 安全开局优先经济并派足四名就近工人',()=>{
  const g=new Game('balanced');g.visible[1].fill(1);
  const own=g.buildings.filter(b=>b.team===1),units=g.units.filter(u=>u.team===1);
  const job=g.ai.planBuilding(g,own,units,own.find(b=>b.primary));
  const nearest=[...units].sort((a,b)=>distance(a,job)-distance(b,job)).slice(0,4).map(u=>u.id).sort();
  g.ai.update(g,3);
  const site=g.buildings.find(b=>b.team===1&&b.constructionPending);
  assert.ok(['factory','mine'].includes(site.type));
  assert.deepEqual(units.filter(u=>u.order==='build').map(u=>u.id).sort(),nearest);
});

test('AI 跳过可见重兵经济点，敌军离开后恢复该点，迷雾部队不参与判断',()=>{
  for(const team of [0,1]){
    const g=new Game('balanced');g.visible[team].fill(1);
    const ai=team===1?g.ai:new g.ai.constructor(0);
    const own=g.buildings.filter(b=>b.team===team),base=own.find(b=>b.primary);
    const plan=()=>ai.planBuilding(g,own,g.units.filter(u=>u.team===team),base);
    const first=plan();
    const enemies=Array.from({length:4},(_,i)=>g.addUnit('shield',1-team,first.x+6+i,first.y));
    const alternative=plan();
    assert.ok(alternative,'危险点不能阻塞所有安全扩张');
    assert.ok(distance(first,alternative)>=10);
    for(const enemy of enemies)g.visible[team][g.cellIndex(enemy.x,enemy.y)]=0;
    assert.deepEqual(plan(),first,'不得利用迷雾中的敌军位置');
    g.visible[team].fill(1);
    for(const enemy of enemies){enemy.x=64;enemy.y=44;}
    assert.deepEqual(plan(),first,'威胁离开后可重新规划该点');
  }
});

test('AI 零散接敌仍建安全经济，基地重兵压境时暂停新建',()=>{
  for(const count of [1,4]){
    const g=new Game('balanced');g.visible[1].fill(1);
    const base=g.buildings.find(b=>b.team===1&&b.primary);
    for(let i=0;i<count;i++)g.addUnit('shield',0,base.x-9,base.y+6+i);
    g.ai.update(g,3);
    assert.equal(g.buildings.some(b=>b.team===1&&b.constructionPending),count===1);
    assert.ok(g.aiQueue.length,'受威胁时继续补兵');
  }
});

test('AI 经济选址避开可见敌方哨塔射程',()=>{
  const g=new Game('balanced');g.visible[1].fill(1);
  const own=g.buildings.filter(b=>b.team===1),base=own.find(b=>b.primary);
  const plan=()=>g.ai.planBuilding(g,own,[],base);
  const first=plan();g.addBuilding('tower',0,first.x+6,first.y);
  const job=plan();assert.ok(job);assert.ok(distance(first,job)>10);
});

test('缺粮进攻：没有可用食物点时留钱、分工并实际完成普通食物厂',()=>{
  const g=new Game('balanced');
  // 只保留双方已被初始食物厂覆盖的点，侦察后也不会出现空闲食物点。
  g.map.foodPoints=g.map.foodPoints.slice(0,2);
  const base=g.buildings.find(b=>b.team===1&&b.primary);
  // 保留本土视野，前线主力持续进攻；加固玩家建筑让验证不被提前结算打断。
  for(const b of g.buildings.filter(b=>b.team===0))b.hp=b.maxHp=1e8;
  while(g.units.filter(u=>u.team===1).length<55)g.addUnit('shield',1,base.x-8,base.y+8);
  g.aiFood=80;g.aiOre=3000;g.ai.attacking=true;
  const before=g.buildings.filter(b=>b.team===1&&b.type==='factory').length;
  g.ai.update(g,3);
  assert.equal(g.aiQueue.length,0,'先攒够食物厂的 200 食物，不被补兵消费');
  assert.equal(g.ai.economicWorkers.size,4);
  assert.ok(g.units.filter(u=>u.team===1&&!g.ai.economicWorkers.has(u.id)).some(u=>u.aiOrderKey?.startsWith('attack:')));
  advance(g,90);
  const factories=g.buildings.filter(b=>b.team===1&&b.type==='factory'&&!b.constructionPending);
  assert.ok(factories.length>before,'必须实际完工，不能只检查 planBuilding 返回值');
  assert.ok(factories.some(b=>g.foodRate(b)===2),'普通地块也能补食物产能');
  assert.ok(g.ai.attacking,'建设不能停止主力进攻');
});

test('严重缺粮优先于第三组配套矿场和人口扩基，食物产能足够后停止应急补厂',()=>{
  const g=new Game('balanced');g.visible[1].fill(1);g.aiFood=50;g.aiOre=4000;
  const base=g.buildings.find(b=>b.team===1&&b.primary);
  g.addBuilding('factory',1,base.x-7,base.y);
  while(g.units.filter(u=>u.team===1).length<40)g.addUnit('shield',1,base.x-8,base.y+8);
  const own=()=>g.buildings.filter(b=>b.team===1);
  assert.equal(g.ai.planBuilding(g,own(),g.units.filter(u=>u.team===1),base).type,'factory');
  for(const node of g.map.foodPoints.slice(0,4))g.addBuilding('factory',1,node.x+.5,node.y+.5);
  assert.equal(g.ai.foodShortage(g,own()),false,'产能已够时不能仅因矿石多而无限补厂');
});

test('危险的旧工地不阻塞后方缺粮救急，且不重复开启更多工地',()=>{
  const g=new Game('balanced');g.visible[1].fill(1);g.aiFood=200;g.aiOre=3000;
  const site=g.addBuilding('mine',1,64.5,44.5);site.constructionPending=true;site.constructionRemaining=180;
  for(let i=0;i<4;i++)g.addUnit('shield',0,site.x+6+i,site.y);
  g.ai.update(g,3);
  const sites=g.buildings.filter(b=>b.team===1&&b.constructionPending);
  assert.equal(sites.length,2);assert.ok(sites.some(b=>b.type==='factory'));
  assert.ok(g.units.filter(u=>u.order==='build').every(u=>u.buildingId!==site.id));
  g.aiFood=1000;g.ai.update(g,3);
  assert.equal(g.buildings.filter(b=>b.team===1&&b.constructionPending).length,2);
});

test('缺粮但暂时没有合法选址时仍保留建设预算',()=>{
  const g=new Game('balanced');g.aiFood=80;g.aiOre=3000;g.visible[1].fill(0);
  g.ai.update(g,3);
  assert.equal(g.aiQueue.length,0);assert.equal(g.aiFood,80);
  assert.equal(g.buildPlans.length,0,'AI 不偷偷在无视野处预建');
});

test('双方富余资源时在食物厂施工期间同轮扩建基地，三组工人独立并实际完工',()=>{
  for(const t of [0,1]){
    const g=new Game('balanced'),ai=t===1?g.ai:g.playerAI;
    g.ai=t===1?ai:null;g.playerAIControl=t===0;
    for(const b of g.buildings.filter(b=>b.team!==t))b.hp=b.maxHp=1e8;
    const base=g.buildings.find(b=>b.team===t&&b.primary);
    while(g.units.filter(u=>u.team===t).length<52)g.addUnit('shield',t,base.x+(t?-8:8),base.y+(t?8:-8));
    g[t?'aiFood':'food']=3000;g[t?'aiOre':'ore']=3000;g.updateVision();
    const factory=ai.nearbySite(g,'factory',base,t);
    assert.ok(factory);
    assert.equal(g.build(g.units.filter(u=>u.team===t).slice(0,4).map(u=>u.id),'factory',factory,t),null);
    const original=g.buildings.at(-1);
    ai.update(g,3);
    const sites=g.buildings.filter(b=>b.team===t&&b.constructionPending);
    assert.equal(sites.length,3);
    assert.equal(sites.filter(b=>b.type==='base').length,2,'不能等食物厂完工才扩基');
    for(const site of sites){
      const count=site.awaitingEviction?site.builderIds.length:g.units.filter(u=>u.team===t&&u.order==='build'&&u.buildingId===site.id).length;
      assert.ok(count>=2&&count<=4,'清场中的部队不能重复派遣，每处仍需独立工人');
    }
    assert.ok(ai.economicWorkers.size<=12);
    assert.ok(g.units.filter(u=>u.team===t&&!ai.economicWorkers.has(u.id)).length>=40);
    const afterSpend=[g[t?'aiFood':'food'],g[t?'aiOre':'ore']];
    ai.update(g,3);
    assert.equal(g.buildings.filter(b=>b.team===t&&b.type==='base').length,3,'在建基地计入需求，不重复扩基');
    assert.deepEqual([g[t?'aiFood':'food'],g[t?'aiOre':'ore']],afterSpend,'人口已满时不重复扣费');
    advance(g,12);
    for(const site of sites)assert.equal(g.units.filter(u=>u.team===t&&u.order==='build'&&u.buildingId===site.id).length,4,'清场后各组工人应进入自己的工地');
    advance(g,138);
    assert.ok(sites.every(b=>!b.constructionPending),'原来三座工地都应完成，而非只创建建筑对象');
    assert.equal(original.type,'factory');
  }
});

test('多基地分别补训练队列，并遵守建设预算、人口和各基地队列目标',()=>{
  for(const t of [0,1]){
    const g=new Game('balanced'),ai=t===1?g.ai:g.playerAI;
    g.ai=null;g.playerAIControl=false;
    const base=g.buildings.find(b=>b.team===t&&b.primary);
    g.addBuilding('base',t,base.x+(t?-12:12),base.y);
    g.addBuilding('base',t,base.x,base.y+(t?12:-12));
    g[t?'aiFood':'food']=2000;g[t?'aiOre':'ore']=2000;
    const context=ai.collectSituation(g),reserve={food:100,ore:200};
    ai.updateTraining(g,context,reserve);
    const queue=ai.queueOf(g),bases=g.buildings.filter(b=>b.team===t&&b.type==='base');
    assert.equal(queue.length,6);
    for(const b of bases)assert.equal(queue.filter(q=>q.baseId===b.id).length,2);
    assert.equal(queue.filter(q=>q.type==='wilddog').length,2,'侦察兵目标是全阵营两只');
    ai.updateTraining(g,context,reserve);assert.equal(queue.length,6);
    const count=g.units.filter(u=>u.team===t).length;
    advance(g,6);assert.ok(g.units.filter(u=>u.team===t).length>=count+4,'不同基地实际并行出兵');
    queue.splice(0);g[t?'aiFood':'food']=100;g[t?'aiOre':'ore']=200;
    ai.updateTraining(g,ai.collectSituation(g),reserve);assert.equal(queue.length,0);
  }
});

test('并行规划计入安全在建食物收入，工人不足时不铺空工地',()=>{
  const g=new Game('balanced');g.aiFood=50;g.aiOre=3000;
  const own=g.buildings.filter(b=>b.team===1);
  assert.equal(g.ai.foodShortage(g,own),true);
  // 已有资源点产能 5，加七座普通在建厂后为 19，仍低于 20 的需求。
  for(let i=0;i<7;i++)own.push({type:'factory',x:96+i*3,y:30,team:1,constructionPending:true});
  assert.equal(g.ai.foodShortage(g,own),true);
  own.push({type:'factory',x:117,y:30,team:1,constructionPending:true});
  assert.equal(g.ai.foodShortage(g,own),false);
  const h=new Game('balanced');h.aiFood=3000;h.aiOre=3000;
  h.ai.update(h,3);
  assert.equal(h.buildings.filter(b=>b.team===1&&b.constructionPending).length,1,'十二名初始主力只能分出一组四人工人');
  assert.equal(h.ai.economicWorkers.size,4,'清场待工人员也计入建设分工');
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
