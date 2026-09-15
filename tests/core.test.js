import {productionGame,completeTechnologies} from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance,TRAIN_QUEUE_LIMIT} from '../src/core.js';
import {findPath,walkable,buildingCells} from '../src/pathfinding.js';
import {W,H,STATS,TECHNOLOGIES,isSlowTerrain,usedPop,createMapBalanced} from '../src/data.js';
const advance=(g,t)=>{for(let n=0;n<t/.05;n++)g.step(.05);};
test('各建筑采用当前建造成本，且统一为 5 点护甲',()=>{
  assert.deepEqual(
    ['base','mine','tower','factory','machineFactory'].map(type=>[type,STATS[type].ore,STATS[type].food]),
    [['base',400,300],['mine',200,200],['tower',150,150],['factory',200,200],['machineFactory',400,300]]
  );
  assert.ok(['base','mine','tower','factory','machineFactory'].every(type=>STATS[type].armor===5));
  assert.deepEqual([STATS.machineFactory.hp,STATS.machineFactory.buildTime,STATS.machineFactory.maxBuilders],[1200,480,8]);
});
test('铁甲兵和强弩兵继承基础兵种数值并应用强化与矿产加价',()=>{
  assert.deepEqual({...STATS.ironShield,name:null,hp:null,armor:null,damage:null,ore:null},{...STATS.shield,name:null,hp:null,armor:null,damage:null,ore:null});
  assert.equal(STATS.shield.hp,70);assert.equal(STATS.ironShield.hp,75);
  assert.equal(STATS.shield.armor,5);assert.equal(STATS.ironShield.armor,8);assert.equal(STATS.ironShield.damage,STATS.shield.damage+2);assert.equal(STATS.ironShield.ore,STATS.shield.ore+10);
  assert.deepEqual({...STATS.crossbow,name:null,damage:null,ore:null,food:null},{...STATS.archer,name:null,damage:null,ore:null,food:null});
  assert.equal(STATS.crossbow.damage,STATS.archer.damage+7);assert.equal(STATS.crossbow.ore,STATS.archer.ore+10);
});
test('科技完成后基础训练项产出铁盾兵和强弩兵，并仍按基础费用扣除',()=>{
  const g=completeTechnologies(new Game());g.units=[];g.food=g.ore=1000;
  assert.match(g.train('ironShield'),/不能训练/);assert.match(g.train('crossbow'),/不能训练/);
  assert.equal(g.train('shield'),null);assert.equal(g.train('archer'),null);
  assert.equal(g.food,890);assert.equal(g.ore,980);advance(g,10.1);
  assert.equal(g.units.filter(u=>u.type==='ironShield').length,1);assert.equal(g.units.filter(u=>u.type==='crossbow').length,1);
  g.units=[];const attacker=g.addUnit('crossbow',0,30,30),target=g.addUnit('ironShield',1,36,30);target.holdFire=true;g.updateVision();
  const hp=target.hp;g.step(.05);assert.equal(g.projectiles.length,1);assert.deepEqual(g.consumeAudioEvents(),[]);assert.equal(target.hp,hp);advance(g,.4);assert.equal(target.hp,hp-14);
  assert.ok(attacker.revealUntil>g.time-.5);
});
test('机械数值、训练费用与蒸汽步行机炮击符合设计',()=>{
  assert.equal(STATS.armoredCar.speed,STATS.wilddog.speed-.3);assert.equal(STATS.armoredCar.cooldown,.4);
  assert.equal(STATS.armoredCar.damage,STATS.crossbow.damage);assert.equal(STATS.armoredCar.range,8);
  assert.deepEqual([STATS.armoredCar.food,STATS.armoredCar.ore,STATS.armoredCar.armor,STATS.armoredCar.hp],[200,200,10,200]);
  assert.deepEqual([STATS.steamWalker.food,STATS.steamWalker.ore,STATS.steamWalker.armor,STATS.steamWalker.hp],[300,500,20,300]);
  assert.equal(STATS.steamWalker.damage,70);assert.equal(STATS.steamWalker.cooldown,1);assert.equal(STATS.steamWalker.speed,1.4);
  assert.equal(STATS.steamWalker.vision,13);assert.equal(STATS.steamWalker.range,STATS.archer.range+3);
  assert.equal(STATS.steamWalker.splashDamage,20);assert.equal(STATS.steamWalker.splashRadius,2);assert.equal(STATS.steamWalker.projectileKind,'cannonball');
  assert.equal(STATS.archer.audioEvent,undefined);assert.equal(STATS.crossbow.audioEvent,undefined);assert.equal(STATS.armoredCar.audioEvent,undefined);assert.equal(STATS.steamWalker.audioEvent,'cannonFire');
  assert.equal(STATS.armoredCar.trainTime,10);assert.equal(STATS.steamWalker.trainTime,30);
  const g=completeTechnologies(new Game());g.units=[];g.food=g.ore=1000;const factory=g.addBuilding('machineFactory',0,25,32);
  assert.equal(g.train('armoredCar',factory.id),null);assert.equal(g.train('steamWalker',factory.id),null);assert.equal(g.food,500);assert.equal(g.ore,300);
  g.queue=[];g.units=[];const attacker=g.addUnit('steamWalker',0,30,30),target=g.addUnit('armoredCar',1,39,30);target.holdFire=true;
  const nearby=g.addBuilding('mine',1,40.5,30),outside=g.addBuilding('mine',1,42,30),friendly=g.addBuilding('mine',0,39,31.5);
  const hp=target.hp,nearbyHp=nearby.hp,outsideHp=outside.hp,friendlyHp=friendly.hp;g.updateVision();g.step(.05);
  assert.equal(g.projectiles.length,1);assert.equal(g.projectiles[0].kind,'cannonball');assert.deepEqual(g.consumeAudioEvents(),['cannonFire']);assert.equal(target.hp,hp);
  advance(g,.5);assert.equal(target.hp,hp-70);assert.equal(nearby.hp,nearbyHp-15);assert.equal(outside.hp,outsideHp);assert.equal(friendly.hp,friendlyHp);
  assert.ok(g.effects.some(e=>e.kind==='explosion'&&e.radius===2));assert.ok(attacker.revealUntil>g.time-.6);
  const silent=new Game();silent.units=[];const car=silent.addUnit('armoredCar',0,30,30),enemy=silent.addUnit('shield',1,36,30);enemy.holdFire=true;silent.updateVision();silent.step(.05);
  assert.equal(silent.projectiles.length,1);assert.deepEqual(silent.consumeAudioEvents(),[]);assert.ok(car.revealUntil>silent.time);
});
test('机械采用更大的碰撞半径，蒸汽步行机大于铁甲车',()=>{
  assert.ok(STATS.steamWalker.visualSize>STATS.armoredCar.visualSize);assert.ok(STATS.armoredCar.visualSize>1);
  assert.ok(STATS.steamWalker.collisionRadius>STATS.armoredCar.collisionRadius);assert.ok(STATS.armoredCar.collisionRadius>.425);
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const car=g.addUnit('armoredCar',0,30,30),walker=g.addUnit('steamWalker',0,30.1,30);car.order=walker.order='move';
  for(let i=0;i<100;i++)g.separate(.05);
  assert.ok(distance(car,walker)>=STATS.armoredCar.collisionRadius+STATS.steamWalker.collisionRadius-.01);
});
test('科技按关卡初始化，机械与部队科技可并行研发并按各自时间完成',()=>{
  const tutorial=new Game('tutorial');
  assert.ok(Object.values(tutorial.technologies).every(tech=>tech.status==='locked'));
  for(const level of ['balanced','attack','defend'])assert.ok(Object.values(new Game(level).technologies).every(tech=>tech.status==='locked'));
  const g=new Game('balanced');g.ai=null;g.food=g.ore=5000;
  for(const id of Object.keys(TECHNOLOGIES))assert.equal(g.research(id),null);
  assert.equal(g.food,2900);assert.equal(g.ore,2300);
  g.step(60.1);assert.equal(g.technologies.castIron.status,'complete');assert.equal(g.technologies.compositeShield.status,'complete');assert.equal(g.technologies.precisionBolts.status,'complete');assert.equal(g.technologies.artillery.status,'researching');assert.equal(g.technologies.steamCore.status,'researching');
  g.step(60);assert.equal(g.technologies.artillery.status,'complete');assert.equal(g.technologies.steamCore.status,'researching');
  g.step(60);assert.equal(g.technologies.steamCore.status,'complete');
});
test('部队科技在出兵时替换基础单位，不影响战场已有单位',()=>{
  const g=new Game('balanced');g.ai=null;g.units=[];g.food=g.ore=5000;
  const oldShield=g.addUnit('shield',0,20,20),oldArcher=g.addUnit('archer',0,22,20),base=g.buildings.find(b=>b.team===0&&b.type==='base');
  assert.equal(g.train('shield',base.id),null);assert.equal(g.train('archer',base.id),null);
  for(const q of g.queue)q.remaining=100;
  assert.equal(g.research('compositeShield'),null);assert.equal(g.research('precisionBolts'),null);
  assert.equal(g.food,4290);assert.equal(g.ore,3780);
  g.step(60.1);
  assert.equal(g.units.find(u=>u.id===oldShield.id).type,'shield');assert.equal(g.units.find(u=>u.id===oldArcher.id).type,'archer');
  advance(g,145);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='ironShield').length,1);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='crossbow').length,1);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='shield').length,1);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='archer').length,1);
});
test('机械单位只在机械工厂生产，并受科技、独立队列和集结点约束',()=>{
  const locked=new Game('balanced');locked.ai=null;locked.food=locked.ore=5000;
  const lockedFactory=locked.addBuilding('machineFactory',0,25,32),base=locked.buildings.find(b=>b.team===0&&b.type==='base');
  assert.match(locked.train('armoredCar',lockedFactory.id),/铸铁装甲/);
  assert.equal(locked.research('castIron'),null);advance(locked,60.1);
  assert.match(locked.train('armoredCar',base.id),/机械工厂/);
  assert.match(locked.train('shield',lockedFactory.id),/基地/);
  assert.equal(locked.train('armoredCar',lockedFactory.id),null);
  assert.match(locked.train('steamWalker',lockedFactory.id),/火炮和蒸汽核心/);

  const g=completeTechnologies(new Game());g.units=[];g.food=g.ore=5000;
  const factory=g.addBuilding('machineFactory',0,25,32),before=new Set(g.units.map(u=>u.id));
  assert.equal(g.setRallyPoint(factory.id,{x:38,y:32}),null);
  assert.equal(g.train('armoredCar',factory.id),null);assert.equal(g.train('steamWalker',factory.id),null);
  advance(g,10.1);const car=g.units.find(u=>!before.has(u.id)&&u.type==='armoredCar');
  assert.ok(car);assert.equal(car.order,'move');assert.ok(distance(car.goal,factory.rallyPoint)<1);assert.equal(g.queue.filter(q=>q.baseId===factory.id).length,1);
  advance(g,30.1);assert.equal(g.units.filter(u=>u.type==='steamWalker').length,1);
});
test('机械工厂占地 4×4，允许最多 8 人按 480 人秒施工',()=>{
  const g=new Game(),cells=buildingCells({type:'machineFactory',x:30,y:32});
  assert.equal(cells.x1-cells.x0+1,4);assert.equal(cells.y1-cells.y0+1,4);
  g.units=[];for(let i=0;i<8;i++)g.addUnit('shield',0,23+i%4,27+Math.floor(i/4)*2);
  g.food=g.ore=5000;assert.equal(g.build(g.units.map(u=>u.id),'machineFactory',{x:30,y:32}),null);
  const factory=g.buildings.at(-1);advance(g,15);assert.ok(factory.activeBuilders<=8);assert.equal(factory.constructionPending,true);
  advance(g,70);assert.equal(factory.constructionPending,false);
});
test('所有近战兵种攻击均不产生音效事件',()=>{
  for(const type of ['shield','ironShield','wilddog']){
    const g=new Game();g.units=[];g.map.terrain.fill(0);const attacker=g.addUnit(type,0,30,30),target=g.addUnit('shield',1,31,30);target.holdFire=true;g.updateVision();g.step(.05);
    assert.ok(target.hp<target.maxHp);assert.deepEqual(g.consumeAudioEvents(),[],`${STATS[attacker.type].name}不应产生音效`);
  }
});
test('A* 绕过建筑且不斜穿墙角',()=>{
  const g=new Game();g.addBuilding('base',1,44,16);const path=findPath(g.map,g.buildings,{x:30,y:16},{x:58,y:16});assert.ok(path.length>0);assert.ok(path.some(p=>Math.abs(p.y-16)>2));
  let prev={x:30,y:16};for(const p of path){assert.ok(walkable(g.map,g.buildings,Math.floor(p.x),Math.floor(p.y)));const x=Math.floor(prev.x),y=Math.floor(prev.y),nx=Math.floor(p.x),ny=Math.floor(p.y);if(x!==nx&&y!==ny){assert.ok(walkable(g.map,g.buildings,nx,y));assert.ok(walkable(g.map,g.buildings,x,ny));}prev=p;}
});
test('建筑墙隔断时不可达终点安全返回空路径',()=>{const map={terrain:new Array(W*H).fill(0)},wall=[];for(let y=0;y<=H;y+=3)wall.push({x:4.5,y,hp:100});assert.deepEqual(findPath(map,wall,{x:1.5,y:1.5},{x:8.5,y:5.5}),[]);});
test('迷雾按阵营隔离，探索记录保留',()=>{const g=new Game(),enemy=g.units.find(u=>u.team===1),u=g.units.find(u=>u.team===0);assert.equal(g.canSee(0,enemy),false);u.x=enemy.x-3;u.y=enemy.y;g.updateVision();assert.equal(g.canSee(0,enemy),true);const i=Math.floor(enemy.y)*W+Math.floor(enemy.x);u.x=19;u.y=27;g.updateVision();assert.equal(g.visible[0][i],0);assert.equal(g.explored[0][i],1);});
test('S 停火不中断移动，新命令恢复交战',()=>{const g=new Game(),u=g.units.find(u=>u.team===0);g.command([u.id],'move',{x:35,y:32});advance(g,1);g.command([u.id],'stop');const p={x:u.x,y:u.y};advance(g,2);assert.equal(u.holdFire,true);assert.equal(u.targetId,null);assert.ok(distance(u,p)>1.5);g.command([u.id],'attack',{x:37,y:32});advance(g,2);assert.equal(u.holdFire,false);assert.ok(distance(u,p)>1.5);});
test('弓箭延迟伤害、护甲扣减和射击暴露',()=>{
  const g=new Game();g.units=[];const a=g.addUnit('archer',0,35,31),b=g.addUnit('shield',1,42,31),hp=b.hp;b.holdFire=true;g.updateVision();g.step(.05);
  assert.equal(g.projectiles.length,1);assert.equal(b.hp,hp);assert.ok(a.revealUntil>g.time);advance(g,.4);
  assert.equal(b.hp,hp-Math.max(1,STATS.archer.damage-STATS.shield.armor));
});
test('停火不使正常视野内单位隐身，射击暴露过期',()=>{const g=new Game();g.units=[];g.buildings=[];g.map.terrain.fill(0);const a=g.addUnit('shield',0,20,20),b=g.addUnit('shield',1,40,20);a.holdFire=true;g.updateVision();assert.equal(g.canSee(1,a),false);a.revealUntil=2;g.updateVision();assert.equal(g.canSee(1,a),true);g.time=3;g.updateVision();assert.equal(g.canSee(1,a),false);b.x=24;g.updateVision();assert.equal(g.canSee(1,a),true);});
test('训练扣费、出兵与人口上限',()=>{
  const g=productionGame();
  assert.equal(g.train('shield'),null);
  assert.equal(g.food,4950);assert.equal(g.ore,4990);
  advance(g,5.1);
  assert.equal(g.units.filter(u=>u.team===0).length,1);
  assert.equal(g.queue.length,0);
  g.food=0;assert.match(g.train('archer'),/资源不足/);
  g.food=g.ore=10000;
  while(usedPop(g.units,0)<g.popCap())g.addUnit('shield',0,18,36);
  assert.match(g.train('shield'),/人口/);
});
test('点击队列对应的取消逻辑会移除指定单位并全额退款',()=>{
  const g=productionGame(),base=g.buildings.find(b=>b.team===0&&b.type==='base');
  assert.equal(g.train('shield',base.id),null);assert.equal(g.train('archer',base.id),null);advance(g,1);
  assert.equal(g.cancelTraining(base.id,0),null);
  assert.deepEqual(g.queue.filter(q=>q.baseId===base.id).map(q=>q.type),['archer']);
  assert.equal(g.food,4940);assert.equal(g.ore,4990);
  assert.match(g.cancelTraining(base.id,8),/不存在/);
});
test('基地集结点独立保存，新单位出兵后自动前往',()=>{
  const g=productionGame(),base=g.buildings.find(b=>b.team===0&&b.type==='base'),before=new Set(g.units.map(u=>u.id));
  assert.equal(g.setRallyPoint(base.id,{x:35,y:32}),null);
  assert.deepEqual(base.rallyPoint,{x:35,y:32});
  assert.equal(g.train('shield',base.id),null);advance(g,5.1);
  const unit=g.units.find(u=>!before.has(u.id));
  assert.equal(unit.order,'move');assert.ok(unit.goal);assert.ok(distance(unit.goal,base.rallyPoint)<1);
  assert.match(g.setRallyPoint(base.id,{x:-1,y:2}),/地图范围/);
});
test('集结点出兵自动避让山地和森林',()=>{
  for(const terrain of [1,2]){
    const g=new Game();g.units=[];g.queue=[];g.map.terrain.fill(0);
    const base=g.buildings.find(b=>b.team===0&&b.type==='base'),rally={x:35.5,y:32.5};
    for(let x=20;x<=30;x++)g.map.terrain[32*W+x]=terrain;
    g.setRallyPoint(base.id,rally);
    g.queue.push({type:'shield',remaining:0,baseId:base.id});g.stepTrainingQueue(g.queue,0,.05);
    const u=g.units[0];assert.equal(u.allowMountains,false);assert.equal(u.allowForests,false);
    assert.deepEqual(u.goal,rally);assert.ok(u.path.length>0);
    assert.ok(u.path.every(p=>g.map.terrain[g.cellIndex(p.x,p.y)]!==terrain));
  }
});
test('每座基地独立并行训练，单基地队列上限为 50',()=>{
  const g=new Game();g.units=[];g.food=g.ore=100000;
  const first=g.buildings.find(b=>b.team===0&&b.type==='base'),second=g.addBuilding('base',0,30,50);
  for(let n=0;n<TRAIN_QUEUE_LIMIT;n++)assert.equal(g.train('wilddog',first.id),null);
  assert.match(g.train('wilddog',first.id),/队列已满/);
  assert.equal(g.train('wilddog',second.id),null);
  assert.equal(g.queue.filter(q=>q.baseId===first.id).length,50);
  assert.equal(g.queue.filter(q=>q.baseId===second.id).length,1);
  g.step(2.1);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='wilddog').length,2);
  assert.equal(g.queue.filter(q=>q.baseId===first.id).length,49);
  assert.equal(g.queue.filter(q=>q.baseId===second.id).length,0);
});
test('BOT 巡逻沿路线移动',()=>{const g=new Game(),u=g.units.find(u=>u.role==='patrol'),p={x:u.x,y:u.y};advance(g,10);assert.ok(distance(u,p)>3);assert.ok(u.patrolIndex>0);});
test('人口上限随基地数量叠加，施工中基地不提供人口',()=>{const g=productionGame();g.units=[];g.food=10000;g.ore=10000;
  assert.equal(g.popCap(),40);
  const b=g.addBuilding('base',0,30,50);b.constructionPending=true;b.constructionRemaining=10;
  assert.equal(g.popCap(),40); // 施工中的基地不提供人口
  b.constructionPending=false;
  assert.equal(g.popCap(),80);
  while(g.units.filter(u=>u.team===0).length<80)g.addUnit('shield',0,18,36);
  assert.match(g.train('shield'),/人口/);
});
test('建筑摧毁解除占地，胜负停止模拟',()=>{const g=new Game(),b=g.buildings.find(b=>b.team===1);assert.equal(walkable(g.map,g.buildings,b.x,b.y),false);g.damage(b,9999);assert.equal(walkable(g.map,g.buildings,b.x,b.y),true);for(const e of g.buildings.filter(b=>b.team===1))e.hp=0;g.step(.05);assert.equal(g.result,'victory');const time=g.time;g.step(1);assert.equal(g.time,time);const h=new Game();h.buildings[0].hp=0;h.step(.05);assert.equal(h.result,'defeat');});
test('完整进攻：部队配合训练增援可摧毁两处营地',()=>{const g=new Game();let stage=0;for(let n=0;n<12000&&!g.result;n++){if(n%200===0){const camp=g.buildings.filter(b=>b.team===1&&b.hp>0)[0];if(camp){g.command(g.units.filter(u=>u.team===0).map(u=>u.id),'attack',camp);stage++;}if(g.units.filter(u=>u.team===0).length<40)g.train(n%400===0?'shield':'archer');}g.step(.05);}assert.equal(g.result,'victory',`结果 ${g.result}, 剩余玩家 ${g.units.filter(u=>u.team===0).length}, 营地 ${g.buildings.filter(b=>b.team===1).map(b=>b.hp)}`);assert.ok(stage>1);});


test('侦测按视线消耗：观察者地形不改预算，平地半径、森林缩短、山地延长，双方一致',()=>{
  for(const team of [0,1]){
    const g=new Game();g.units=[];g.buildings=[];g.map.terrain.fill(0);
    const u=g.addUnit('shield',team,20,20);
    // 观察者脚下地形不再改变有效侦测距离（预算为基础值）
    for(const terrain of [0,1,2]){
      g.map.terrain[20*W+20]=terrain;g.updateVision();
      assert.equal(g.detectionRange(u),STATS.shield.vision);
    }
    // 平地：半径为预算（10 格）
    g.map.terrain.fill(0);g.updateVision();
    assert.equal(g.visible[team][20*W+29],1);
    assert.equal(g.visible[team][20*W+31],0);
    // 森林（系数 0.3，每格约消耗 3.33）：深度缩短到约 2 格
    g.map.terrain.fill(2);g.updateVision();
    assert.equal(g.visible[team][20*W+21],1);
    assert.equal(g.visible[team][20*W+22],1);
    assert.equal(g.visible[team][20*W+24],0);
    // 山地（系数 1.2，每格约消耗 0.83）：穿透延长到约 10 格
    g.map.terrain.fill(1);g.updateVision();
    assert.equal(g.visible[team][20*W+30],1);
    assert.equal(g.visible[team][20*W+31],0);
  }
});
test('森林缩短视线：看不清就不索敌，恢复平地后可索敌',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const u=g.addUnit('shield',0,30,30),enemy=g.addUnit('shield',1,36,30);
  enemy.holdFire=true;
  // 单位与目标之间整片森林：视线消耗超出侦测距离，不可见也不索敌
  for(let x=31;x<=36;x++)for(let y=22;y<=38;y++)g.map.terrain[y*W+x]=2;
  g.updateVision();assert.equal(g.canSee(0,enemy),false);g.step(.05);assert.equal(u.targetId,null);
  g.map.terrain.fill(0);g.updateVision();g.step(.05);assert.equal(u.targetId,enemy.id);
});


test('山地和森林可作为移动终点并穿行',()=>{
  for(const terrain of [1,2]){
    const g=new Game();g.map.terrain.fill(terrain);
    assert.equal(walkable(g.map,[],40,32),true);
    const path=findPath(g.map,[],{x:30.5,y:32.5},{x:40.5,y:32.5});
    assert.equal(path.length,10);assert.deepEqual(path.at(-1),{x:40.5,y:32.5});
    assert.equal(walkable(g.map,g.buildings,12,32),false);
  }
});
test('双方两类单位按地形倍率移动，进入平地恢复速度',()=>{
  for(const team of [0,1])for(const type of ['shield','archer'])for(const [terrain,multiplier] of [[0,1],[1,.2],[2,.6]]){
    const g=new Game();g.units=[];g.map.terrain.fill(terrain);
    const u=g.addUnit(type,team,30,32),start={x:u.x,y:u.y};
    u.order='move';u.goal={x:45.5,y:32.5};u.path=findPath(g.map,g.buildings,u,u.goal);
    advance(g,1);
    assert.ok(Math.abs(distance(u,start)-STATS[type].speed*multiplier)<1e-8);
    // 将单位移至平地，下一模拟步即恢复基础速度。
    u.x=40.5;u.y=32.5;g.map.terrain.fill(0);
    u.path=findPath(g.map,g.buildings,u,u.goal);const before={x:u.x,y:u.y};
    g.step(.05);assert.ok(Math.abs(distance(u,before)-STATS[type].speed*.05)<1e-8);
  }
});


test('追加路径点按顺序行进，完成后警戒',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const u=g.addUnit('shield',0,30,30),a={x:34.5,y:30.5},b={x:34.5,y:38.5},c={x:27.5,y:38.5};
  g.command([u.id],'move',a,null,true);
  g.command([u.id],'move',b,null,true);g.command([u.id],'move',c,null,true);
  assert.deepEqual(u.goal,a);assert.deepEqual(u.waypoints,[b,c]);
  let visitedA=false,visitedB=false;
  for(let i=0;i<240;i++){
    if(distance(u,a)<.8)visitedA=true;
    if(distance(u,b)<.8){assert.ok(visitedA);visitedB=true;}
    if(distance(u,c)<.8)assert.ok(visitedB);
    g.step(.05);
  }
  assert.ok(visitedA&&visitedB);assert.ok(distance(u,c)<.8);
  assert.equal(u.goal,null);assert.deepEqual(u.waypoints,[]);assert.equal(u.order,'idle');
});
test('普通移动、攻击清空待经点，S 停火不中断移动',()=>{
  for(const kind of ['move','attack']){
    const g=new Game();g.units=[];const u=g.addUnit('shield',0,30,30);
    g.command([u.id],'move',{x:35.5,y:30.5});advance(g,.3);
    const current={...u.goal};g.command([u.id],'move',{x:40.5,y:35.5},null,true);
    assert.deepEqual(u.goal,current);assert.equal(u.waypoints.length,1);
    g.command([u.id],kind,{x:28.5,y:35.5});assert.deepEqual(u.waypoints,[]);
    assert.deepEqual(u.goal,{x:28.5,y:35.5});
  }
  const g=new Game();g.units=[];const u=g.addUnit('shield',0,30,30);
  g.command([u.id],'move',{x:35.5,y:30.5});advance(g,.3);
  const goal={...u.goal};g.command([u.id],'move',{x:40.5,y:35.5},null,true);
  g.command([u.id],'stop');
  assert.deepEqual(u.goal,goal);assert.equal(u.waypoints.length,1);assert.equal(u.holdFire,true);assert.equal(u.targetId,null);
});


test('默认绕行山地且不斜穿山地墙角，双击模式允许进入',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  for(let x=40;x<=52;x++)g.map.terrain[16*W+x]=1;
  const u=g.addUnit('shield',0,30,16);
  g.command([u.id],'move',{x:58.5,y:16.5});
  assert.ok(u.path.length>0);
  let prev=u;
  for(const p of u.path){
    assert.notEqual(g.map.terrain[Math.floor(p.y)*W+Math.floor(p.x)],1);
    const x=Math.floor(prev.x),y=Math.floor(prev.y),nx=Math.floor(p.x),ny=Math.floor(p.y);
    if(x!==nx&&y!==ny){assert.notEqual(g.map.terrain[y*W+nx],1);assert.notEqual(g.map.terrain[ny*W+x],1);}
    prev=p;
  }
  g.command([u.id],'move',{x:44.5,y:16.5});
  assert.notEqual(g.map.terrain[Math.floor(u.goal.y)*W+Math.floor(u.goal.x)],1);
  g.command([u.id],'move',{x:44.5,y:16.5},null,false,true);
  assert.equal(u.allowMountains,true);assert.deepEqual(u.goal,{x:44.5,y:16.5});
  assert.ok(u.path.some(p=>g.map.terrain[Math.floor(p.y)*W+Math.floor(p.x)]===1));
  advance(g,40);assert.ok(distance(u,{x:44.5,y:16.5})<.8);assert.equal(u.allowMountains,false);
  assert.equal(g.movementSpeed(u),STATS.shield.speed*.2);
});
test('默认绕行森林且不斜穿森林墙角，双击模式允许进入',()=>{
  assert.equal(isSlowTerrain(0),false);assert.equal(isSlowTerrain(1),true);assert.equal(isSlowTerrain(2),true);
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  for(let x=40;x<=52;x++)g.map.terrain[16*W+x]=2;
  const u=g.addUnit('shield',0,30,16);
  g.command([u.id],'move',{x:58.5,y:16.5});
  assert.ok(u.path.length>0);
  for(const p of u.path)assert.notEqual(g.map.terrain[Math.floor(p.y)*W+Math.floor(p.x)],2);
  g.command([u.id],'move',{x:44.5,y:16.5},null,false,true);
  assert.equal(u.allowMountains,true);assert.deepEqual(u.goal,{x:44.5,y:16.5});
  assert.ok(u.path.some(p=>g.map.terrain[Math.floor(p.y)*W+Math.floor(p.x)]===2));
  advance(g,40);assert.ok(distance(u,{x:44.5,y:16.5})<.8);assert.equal(u.allowMountains,false);
  assert.equal(g.movementSpeed(u),STATS.shield.speed*.6);
});
test('山地中可出山，出山后绕开下一片山地',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  for(let y=28;y<=34;y++)for(const x of [30,31,34,35])g.map.terrain[y*W+x]=1;
  const u=g.addUnit('shield',0,30,31);g.command([u.id],'move',{x:40.5,y:31.5});
  let exited=false;
  for(let i=0;i<400;i++){
    g.step(.05);const mountain=g.map.terrain[Math.floor(u.y)*W+Math.floor(u.x)]===1;
    if(exited)assert.equal(mountain,false);else if(!mountain)exited=true;
  }
  assert.ok(exited);assert.ok(distance(u,{x:40.5,y:31.5})<.8);
});
test('强制穿山随追加路线保留，普通命令清除',()=>{
  for(const kind of ['move','attack']){
    const g=new Game(),u=g.units.find(u=>u.team===0);
    g.command([u.id],'move',{x:44.5,y:16.5},null,false,true);
    g.command([u.id],'move',{x:58.5,y:16.5},null,true);assert.equal(u.allowMountains,true);
    assert.equal(u.waypoints.length,1);
    g.command([u.id],kind,{x:30.5,y:32.5});assert.equal(u.allowMountains,false);
    assert.deepEqual(u.waypoints,[]);
  }
});
test('BOT 寻路自动避让山地但允许穿越森林',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const u=g.addUnit('shield',1,30,16),target={x:58.5,y:16.5};
  for(let x=40;x<=52;x++)g.map.terrain[16*W+x]=1;
  g.command([u.id],'attack',target,null,false,false,1);
  assert.equal(u.allowMountains,false);assert.equal(u.allowForests,false);
  assert.deepEqual(g.terrainAvoidance(u),[true,false]);
  assert.ok(u.path.length>0);assert.ok(u.path.every(p=>g.map.terrain[g.cellIndex(p.x,p.y)]!==1));
  g.map.terrain.fill(0);for(let x=40;x<=52;x++)g.map.terrain[16*W+x]=2;
  u.x=30;u.y=16;g.command([u.id],'move',target,null,false,false,1);
  assert.ok(u.path.some(p=>g.map.terrain[g.cellIndex(p.x,p.y)]===2));
});


test('采矿场选址、扣费、产矿、拆除与矿点复用',()=>{
  const g=new Game();g.addUnit('shield',0,24,36);g.updateVision();const ids=[g.units.find(u=>u.team===0).id],node=g.map.resources[0];
  assert.ok(node.x<W/2);g.food=200;g.ore=200;
  assert.match(g.build(ids,'mine',{x:30,y:30}),/矿产资源点/);
  assert.equal(g.food,200);assert.equal(g.ore,200);
  assert.equal(g.build(ids,'mine',node),null);
  const mine=g.buildings.at(-1);assert.equal(mine.type,'mine');assert.equal(g.food,0);assert.equal(g.ore,0);
  assert.equal(walkable(g.map,g.buildings,node.x,node.y),false);
  g.step(.5);assert.equal(g.ore,0);assert.equal(g.food,0);assert.equal(mine.constructionRemaining,180);
  const builder=g.units.find(u=>u.buildingId===mine.id);builder.x=builder.goal.x;builder.y=builder.goal.y;
  mine.constructionRemaining=.25;g.step(.5);assert.equal(mine.constructionRemaining,0);assert.equal(g.ore,1.25);
  g.food=1000;g.ore=1000;assert.match(g.build(ids,'mine',node),/冲突/);
  assert.equal(g.demolish(mine.id),null);assert.equal(g.ore,1000);assert.equal(g.map.resources.length,1);
  assert.equal(walkable(g.map,g.buildings,node.x,node.y),true);
  g.step(.5);assert.equal(g.ore,1000); // 基地不产矿，无采矿场时矿产不再增长
  assert.equal(g.build(ids,'mine',node),null);
});
test('建造拒绝越界、建筑重叠、部队占地、资源不足与无有效选兵',()=>{
  const g=new Game(),u=g.units.find(u=>u.team===0),ids=[u.id];g.food=1000;g.ore=1000;
  assert.match(g.build([], 'tower',{x:24,y:40}),/选择部队/);
  assert.match(g.build(ids,'tower',{x:0,y:0}),/超出地图/);
  assert.match(g.build(ids,'tower',{x:12,y:32}),/冲突/);
  const enemy=g.units.find(u=>u.team===1);enemy.x=u.x+2;enemy.y=u.y;
  assert.match(g.build(ids,'tower',enemy),/移开/);
  g.ore=0;assert.match(g.build(ids,'tower',{x:24,y:40}),/资源不足/);
  assert.equal(g.food,1000);assert.equal(g.buildings.length,4);
  assert.match(g.demolish(g.buildings.find(b=>b.team===1).id),/己方/);
});
test('建造允许我方单位自动让位，清空占地后才开始施工',()=>{
  const g=new Game(),u=g.units.find(u=>u.team===0);g.food=1000;g.ore=1000;
  assert.equal(g.build([u.id],'tower',u),null);
  const tower=g.buildings.at(-1);
  assert.equal(tower.awaitingEviction,true);
  assert.equal(tower.constructionPending,true);
  assert.equal(u.leavingId,tower.id);
  assert.equal(g.food,850);assert.equal(g.ore,850); // 下达命令即扣费（哨塔 150 食物 / 150 矿产）
  let n=0;while(tower.awaitingEviction&&n++<400)g.step(.05);
  assert.ok(n<400,'让位应在有限步内完成');
  assert.equal(tower.awaitingEviction,false);
  assert.equal(u.leavingId,null);
  assert.equal(u.buildingId,tower.id);
  assert.equal(u.order,'build'); // 让位结束后自动被派为施工人员
});
test('施工点位沿建筑四边生成，建筑中心 x≠y 时不再偏移',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);g.food=9999;g.ore=9999;
  const scout=g.addUnit('shield',0,30,46);g.updateVision();
  const us=[];for(let n=0;n<6;n++)us.push(g.addUnit('shield',0,24+(n%3)*1.5,29+Math.floor(n/3)*1.5));
  assert.equal(g.build(us.map(u=>u.id),'base',{x:30,y:50}),null);
  const b=g.buildings.at(-1),edge=STATS.base.halfSize||2;
  assert.equal(us.filter(u=>u.order==='build').length,6);
  for(const u of us){
    const onSide=Math.abs(u.goal.x-(b.x-edge-.5))<.01||Math.abs(u.goal.x-(b.x+edge+.5))<.01
      ||Math.abs(u.goal.y-(b.y-edge-.5))<.01||Math.abs(u.goal.y-(b.y+edge+.5))<.01;
    assert.ok(onSide,`施工位 (${u.goal.x},${u.goal.y}) 应紧贴建筑 (x=${b.x},y=${b.y}) 边缘`);
  }
});
test('哨塔固定驻兵使用增强射程、视野和弹道，拆除后停止攻击',()=>{
  const g=new Game('balanced');g.ai=g.playerAI=null;g.units=[];g.map.terrain.fill(0);
  const tower=g.addBuilding('tower',0,35,32),enemy=g.addUnit('shield',1,43,32);enemy.x=43;enemy.y=32;enemy.holdFire=true;
  assert.equal(tower.hp,STATS.tower.hp);assert.equal(g.detectionRange(tower),STATS.tower.vision);
  assert.equal(STATS.tower.range,STATS.archer.range+1);g.updateVision();
  const hp=enemy.hp;g.step(.05);assert.equal(g.projectiles.length,1);assert.equal(enemy.hp,hp);
  advance(g,.5);assert.equal(enemy.hp,hp-Math.max(1,STATS.tower.damage-STATS.shield.armor));assert.equal(tower.x,35);assert.equal(g.units.length,1);
  enemy.x=46;g.projectiles=[];tower.cooldown=0;g.updateVision();g.step(.05);assert.equal(g.projectiles.length,0);
  enemy.x=43;assert.equal(g.demolish(tower.id),null);g.step(.05);assert.equal(g.projectiles.length,0);
});
test('基地拆除立即判负，重开恢复初始建筑与矿点',()=>{
  const g=new Game();g.train('shield');assert.equal(g.demolish(g.buildings[0].id),null);
  assert.equal(g.result,'defeat');assert.equal(g.queue.length,0);const ore=g.ore;g.step(1);assert.equal(g.ore,ore);
  const fresh=new Game();assert.equal(fresh.buildings.length,4);assert.equal(fresh.map.resources.length,1);assert.equal(fresh.result,null);
});
test('信鸽为空中单位：无视地形移速与侦测，可直穿山地',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(1);
  const u=g.addUnit('pigeon',0,30,32);
  assert.equal(g.movementSpeed(u),STATS.pigeon.speed);
  assert.equal(g.detectionRange(u),STATS.pigeon.vision);
  g.command([u.id],'move',{x:40.5,y:32.5});
  assert.equal(u.path.length,0); // 飞行采用连续转向，不走地面 A*
  advance(g,30);assert.ok(Math.abs(distance(u,u.goal)-4)<.03);
  const foodBefore=g.food;assert.equal(g.train('pigeon'),null);assert.ok(Math.abs(g.food-(foodBefore-60))<1e-9);
});
test('飞行单位经过森林时只看见正下方格子的地面单位',()=>{
  const g=new Game();g.units=[];g.buildings=[];g.map.terrain.fill(2);
  g.addUnit('pigeon',0,30.25,32.25);
  const under=g.addUnit('shield',1,30.75,32.75),nearby=g.addUnit('shield',1,31.25,32.25);
  under.holdFire=true;nearby.holdFire=true;g.updateVision();
  assert.equal(g.canSee(0,under),true);
  assert.equal(g.canSee(0,nearby),false);
  assert.equal(g.visible[0][g.cellIndex(30.25,32.25)],1);
  assert.equal(g.explored[0][g.cellIndex(31.25,32.25)],1);
});
test('地面近战不能攻击空中单位',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const u=g.addUnit('shield',0,30,30),pigeon=g.addUnit('pigeon',1,31.5,30);pigeon.holdFire=true;
  g.updateVision();g.step(.05);
  assert.equal(g.canSee(0,pigeon),true);assert.equal(u.targetId,null);
  g.command([u.id],'attack',{x:pigeon.x,y:pigeon.y},pigeon.id);assert.equal(u.targetId,null);
});
test('地面单位自动索敌跳过飞行目标，仍索敌落地信鸽',()=>{
  for(const type of ['shield','ironShield','wilddog','archer','crossbow','armoredCar','steamWalker']){
    const g=new Game();g.units=[];g.map.terrain.fill(0);
    const u=g.addUnit(type,0,30,30),bird=g.addUnit('pigeon',1,31.5,30);
    bird.holdFire=true;g.updateVision();g.step(.05);
    assert.equal(u.targetId,null,type);
    const ground=g.addUnit('shield',1,34,30);ground.holdFire=true;g.updateVision();
    assert.equal(g.acquireTarget(u,g.entities()),ground,type);
    ground.hp=0;bird.flying=false;g.updateVision();g.step(.05);
    assert.equal(u.targetId,bird.id,type);
  }
});
test('弓箭兵手动对空射程 2、伤害减半，对地不变',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const a=g.addUnit('archer',0,30,30),pigeon=g.addUnit('pigeon',1,34.5,30);pigeon.holdFire=true;
  g.updateVision();g.step(.05);
  assert.equal(a.targetId,null); // 不主动索敌空中目标
  g.command([a.id],'attack',pigeon,pigeon.id);
  assert.equal(a.targetId,pigeon.id); // 手动指定仍可对空
  assert.equal(pigeon.hp,STATS.pigeon.hp); // 距离超出对空射程，未受击
  pigeon.x=31.5;g.step(.05);advance(g,.1);
  assert.equal(pigeon.hp,STATS.pigeon.hp-7.5); // 对空伤害减半 15/2=7.5
  pigeon.hp=0; // 移除空中目标后对地伤害不变
  const ground=g.addUnit('shield',1,31.5,30),hp=ground.hp;ground.holdFire=true;a.cooldown=0;a.targetId=null;
  advance(g,.4);assert.equal(ground.hp,hp-Math.max(1,STATS.archer.damage-STATS.shield.armor));
});
test('哨塔可对空：防空射程 6、伤害减半',()=>{
  const g=new Game('balanced');g.ai=g.playerAI=null;g.units=[];g.map.terrain.fill(0);
  const tower=g.addBuilding('tower',0,35,32),pigeon=g.addUnit('pigeon',1,44,32);pigeon.holdFire=true;
  g.updateVision();g.step(.05);assert.equal(g.projectiles.length,0); // 距离 9 超出对空射程 6
  pigeon.x=40;g.step(.05);assert.equal(g.projectiles.length,1);assert.equal(g.projectiles[0].damage,7.5);
  advance(g,.4);assert.equal(pigeon.hp,STATS.pigeon.hp-7.5);
});

test('信鸽持续飞行，急转弯半径不小于 2，目标点盘旋半径为 4',()=>{
  const g=new Game();g.units=[];const u=g.addUnit('pigeon',0,40,30),goal={x:28,y:30};
  g.command([u.id],'move',goal);
  for(let i=0;i<3000;i++){
    const p={x:u.x,y:u.y},heading=u.facing;g.step(.02);
    const turn=Math.abs(Math.atan2(Math.sin(u.facing-heading),Math.cos(u.facing-heading)));
    assert.ok(turn<=STATS.pigeon.speed*.02/2+1e-9);
    assert.ok(distance(u,p)>.0999,'每步都以基础速度前进');
    if(i>2000)assert.ok(Math.abs(distance(u,goal)-4)<.01);
  }
  g.command([u.id],'stop');const p={x:u.x,y:u.y};advance(g,1);
  assert.ok(distance(u,p)>1);assert.equal(u.holdFire,true);
});

test('信鸽起降、地面受击、地形修正与飞行越过建筑',()=>{
  const g=new Game();g.units=[];const u=g.addUnit('pigeon',0,30,30),ground=g.addUnit('shield',0,20,20);
  g.toggleFlight([u.id,ground.id],{x:35,y:32});advance(g,15);
  assert.equal(u.flying,false);assert.ok(distance(u,{x:35.5,y:32.5})<.3);assert.equal(ground.flying,false);
  assert.equal(g.canEngage(ground,u),true);
  g.map.terrain[Math.floor(u.y)*W+Math.floor(u.x)]=2;
  assert.equal(g.movementSpeed(u),0);
  assert.equal(g.detectionRange(u),STATS.pigeon.visionGround);
  g.toggleFlight([u.id],{x:12,y:32});assert.equal(u.flying,true);assert.equal(g.canEngage(ground,u),false);
  advance(g,30);assert.ok(Math.abs(distance(u,u.goal)-4)<.03);
  g.toggleFlight([u.id],{x:12,y:32});advance(g,30);
  assert.equal(u.flying,false);assert.equal(walkable(g.map,g.buildings,Math.floor(u.x),Math.floor(u.y)),true);
});

test('信鸽拒绝地面和建筑目标，攻击空中目标时不停飞，目标降落后解除锁定',()=>{
  const g=new Game();g.units=[];const u=g.addUnit('pigeon',0,30,30),enemy=g.addUnit('pigeon',1,31,30),ground=g.addUnit('shield',1,32,30);
  enemy.holdFire=true;ground.holdFire=true;g.updateVision();
  assert.equal(g.canEngage(u,ground),false);assert.equal(g.canEngage(u,g.buildings[1]),false);
  g.command([u.id],'attack',ground,ground.id);assert.equal(u.targetId,null);
  g.command([u.id],'attack',enemy,enemy.id);const p={x:u.x,y:u.y};g.step(.02);
  assert.equal(enemy.hp,STATS.pigeon.hp-4);assert.ok(distance(u,p)>.09);
  enemy.flying=false;g.step(.02);assert.equal(u.targetId,null);
  u.flying=false;enemy.flying=true;assert.equal(g.canEngage(u,enemy),false);
});

test('信鸽追加路线经过中间点后盘旋，边缘起降和盘旋不越界',()=>{
  const g=new Game();g.units=[];const u=g.addUnit('pigeon',0,30,30),a={x:40,y:30},b={x:45,y:40};
  g.command([u.id],'move',a);g.command([u.id],'move',b,null,true);
  advance(g,40);assert.equal(u.waypoints.length,0);assert.ok(Math.abs(distance(u,b)-4)<.03);
  for(const point of [{x:1,y:1},{x:95,y:63},{x:1,y:63},{x:95,y:1}]){
    g.toggleFlight([u.id],point);advance(g,40);assert.equal(u.flying,false);
    g.toggleFlight([u.id],point);
    for(let i=0;i<800;i++){g.step(.05);assert.ok(u.x>=0&&u.x<W&&u.y>=0&&u.y<H,`${u.x}, ${u.y}`);}
  }
});

test('无敌人时单位间默认距离增大，交战中收缩为轻微分离',()=>{
  // 无敌人：两单位被推开到更宽松的默认间距
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const a=g.addUnit('shield',0,30,30),b=g.addUnit('shield',0,30.2,30);
  a.holdFire=true;b.holdFire=true;
  for(let i=0;i<200;i++)g.step(.05);
  assert.ok(distance(a,b)>=1.59,`无敌人时单位间距应增大，实际 ${distance(a,b).toFixed(3)}`);
  // 非待命（有移动任务）中：间距维持在轻微分离范围，不再外扩
  const h=new Game();h.units=[];h.map.terrain.fill(0);
  const c=h.addUnit('shield',0,30,30),d=h.addUnit('shield',0,30.2,30);
  c.order='move';d.order='move';
  for(let i=0;i<200;i++)h.step(.05);
  assert.ok(distance(c,d)<1.0,`非待命单位间距应收缩，实际 ${distance(c,d).toFixed(3)}`);
});
test('落地信鸽不能移动或被挤动，位置和攻击命令先起飞',()=>{
  for(const kind of ['move','attack']){
    const g=new Game();g.units=[];const u=g.addUnit('pigeon',0,30,30);u.flying=false;
    const other=g.addUnit('shield',0,30,30);other.holdFire=true;
    const p={x:u.x,y:u.y};u.path=[{x:35,y:30}];g.move(u,5);advance(g,1);
    assert.equal(distance(u,p),0);assert.equal(g.movementSpeed(u),0);
    g.command([u.id],'stop');assert.equal(u.flying,false);
    g.command([u.id],kind,{x:40,y:30});assert.equal(u.flying,true);
    assert.equal(u.path.length,0);assert.deepEqual(u.goal,{x:40,y:30});
    advance(g,.1);assert.ok(distance(u,p)>.4);
  }
});

test('进攻关卡：固定兵力、三据点联防、AI 不补员，摧毁敌方全部建筑获胜',()=>{
  const g=new Game('attack');
  assert.equal(g.level,'attack');
  assert.equal(g.food,5000);assert.equal(g.ore,5000);assert.equal(g.aiFood,2000);assert.equal(g.aiOre,2000);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='shield').length,60);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='archer').length,60);
  assert.equal(g.units.filter(u=>u.team===1&&u.type==='shield').length,90);
  assert.equal(g.units.filter(u=>u.team===1&&u.type==='archer').length,60);
  assert.equal(g.buildings.filter(b=>b.team===1&&b.type==='tower').length,9);
  assert.equal(g.popCap(),200);assert.equal(g.popCap(1),200);
  // 双方保留主基地、采矿场、食物厂
  for(const team of [0,1]){
    assert.equal(g.buildings.filter(b=>b.team===team&&b.type==='base').length,team?3:1);
    assert.equal(g.buildings.filter(b=>b.team===team&&b.type==='mine').length,1);
    assert.equal(g.buildings.filter(b=>b.team===team&&b.type==='factory').length,1);
  }
  advance(g,10);
  assert.equal(g.aiQueue.length,0);assert.equal(g.units.filter(u=>u.team===1).length,153);
  // 仅摧毁主基地不获胜，需摧毁敌方全部建筑
  const enemyBase=g.buildings.find(b=>b.team===1&&b.primary);
  g.damage(enemyBase,99999);g.step(.05);
  assert.equal(g.result,null);
  for(const b of g.buildings)if(b.team===1)g.damage(b,99999);
  g.step(.05);
  assert.equal(g.result,'victory');
});

test('进攻关卡：受袭调兵、保留各点驻军，失联后归队',()=>{
  const g=new Game('attack'),tower=g.buildings.find(b=>b.team===1&&b.type==='tower');
  g.damage(tower,10);g.ai.update(g,.1);
  const response=g.units.filter(u=>u.team===1&&u.role==='reinforce');
  assert.equal(response.length,40);
  assert.ok(response.some(u=>u.defenseSector!==tower.defenseSector));
  assert.ok(response.every(u=>u.order==='attack'));
  for(let sector=0;sector<3;sector++){
    const local=g.units.filter(u=>u.team===1&&u.defenseSector===sector);
    assert.ok(local.filter(u=>u.role==='guard').length>=Math.ceil(local.length/2));
  }
  g.time=13;g.ai.timer=0;g.ai.update(g,.1);
  assert.equal(g.ai.responders.size,0);
  assert.ok(response.every(u=>u.role==='guard'&&u.order==='move'));
});

test('进攻关卡：复用均衡地图、三路兵力、固定据点配兵及独立巡逻',()=>{
  const g=new Game('attack'),balanced=createMapBalanced();
  for(const key of ['width','height','terrain','resources','foodPoints','spawns'])assert.deepEqual(g.map[key],balanced[key]);
  assert.deepEqual(g.map.camps,[{x:86,y:12},{x:104,y:60},{x:116,y:12}]);
  for(const type of ['armoredCar','steamWalker'])assert.equal(g.units.filter(u=>u.team===0&&u.type===type).length,2);
  assert.deepEqual([0,1,2].map(i=>g.units.filter(u=>u.team===1&&u.defenseSector===i).length),[30,50,70]);
  for(const wing of [0,1,2])for(const type of ['shield','archer'])
    assert.equal(g.units.filter(u=>u.team===0&&u.attackWing===wing&&u.type===type).length,20);
  assert.deepEqual([0,1,2].map(i=>g.buildings.filter(b=>b.type==='tower'&&b.defenseSector===i).length),[2,3,4]);
  const cells=new Set();
  for(const u of g.units){
    const cell=g.cellIndex(u.x,u.y);assert.equal(g.map.terrain[cell],0);
    assert.ok(walkable(g.map,g.buildings,Math.floor(u.x),Math.floor(u.y)));
    assert.ok(!cells.has(cell));cells.add(cell);
  }
  for(const b of g.buildings){
    const c=buildingCells(b);
    for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++)assert.equal(g.map.terrain[g.cellIndex(x,y)],0);
  }
  const dogs=g.units.filter(u=>u.type==='wilddog');assert.equal(dogs.length,3);
  g.ai.update(g,.1);
  for(const dog of dogs){
    const route=g.map.patrolRoutes[dog.patrolRoute];assert.equal(route.length,4);
    assert.ok(dog.goal&&dog.order==='move');
    for(let i=0;i<route.length;i++){
      const a=route[i],b=route[(i+1)%route.length];
      assert.equal(g.map.terrain[g.cellIndex(a.x,a.y)],0);
      assert.ok(findPath(g.map,g.buildings,a,b,true,false).length,'巡逻路线须绕山连通');
      dog.x=dog.goal.x;dog.y=dog.goal.y;
      g.ai.scout(g,[dog],[]);
      assert.ok(route.some(p=>Math.hypot(dog.goal.x-p.x,dog.goal.y-p.y)<1));
    }
    assert.ok(findPath(g.map,g.buildings,route[0],dog.home,true,false).length,'撤回据点路线须连通');
  }
  const start=g.units.find(u=>u.team===0&&u.type==='shield');
  for(const camp of g.map.camps)assert.ok(findPath(g.map,g.buildings,start,{x:camp.x-4,y:camp.y+4},true,true).length,'我方可绕开山林抵达据点');
});

test('进攻关卡：侦察仅按视野派兵，大部队加派，野狗近敌撤退',()=>{
  const g=new Game('attack');g.units=g.units.filter(u=>u.team===1);g.map.terrain.fill(0);
  const dog=g.units.find(u=>u.type==='wilddog');dog.x=48.5;dog.y=44.5;dog.goal=null;
  const enemies=[];
  for(let i=0;i<20;i++)enemies.push(g.addUnit('shield',0,51+i%4,42+Math.floor(i/4)));
  const update=()=>{g.updateVision();g.ai.timer=0;g.ai.update(g,.1);};
  update();assert.equal(g.ai.responders.size,25);assert.ok(distance(dog.goal,dog.home)<2);
  for(const u of enemies.slice(1))u.hp=0;
  update();assert.equal(g.ai.responders.size,8);
  for(const u of enemies)u.hp=0;
  const hidden=g.addUnit('shield',0,8,8);update();assert.equal(g.canSee(1,hidden),false);
  g.time=13;update();assert.equal(g.ai.responders.size,0);
});

test(`防守：固定兵力开局、两波、准备和休整计时、保留建筑胜利`,()=>{
  const g=new Game('defend');
  assert.equal(g.food,5000);assert.equal(g.ore,5000);assert.equal(g.aiFood,2000);assert.equal(g.aiOre,2000);
  assert.deepEqual(g.defense.sizes,[{shield:70,archer:70},{shield:35,archer:35}]);
  assert.equal(g.buildings.filter(b=>b.team===1).length,0);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='shield').length,60);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='archer').length,60);
  assert.equal(g.units.filter(u=>u.team===1&&u.type==='shield').length,70);
  assert.equal(g.units.filter(u=>u.team===1&&u.type==='archer').length,70);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='armoredCar').length,4);
  assert.equal(g.units.filter(u=>u.team===0&&u.type==='steamWalker').length,2);
  g.time=119.9;g.step(.05);assert.equal(g.defense.wave,0);
  assert.ok(g.units.filter(u=>u.team===1).every(u=>u.role==='guard'));
  g.time=120;g.step(.05);assert.equal(g.defense.wave,1);
  assert.ok(g.units.filter(u=>u.team===1).every(u=>u.order==='attack'));
  const base=g.buildings.find(b=>b.team===0&&b.primary);
  g.damage(base,99999);g.step(.05);assert.equal(g.result,null);
  assert.notEqual(g.ai.targetId,base.id,'主基地毁后转攻其他建筑');
  for(const u of g.units)if(u.team===1)u.hp=0;
  g.step(.05);assert.equal(g.result,null);
  const next=g.defense.nextWaveAt;assert.ok(next>g.time);
  assert.equal(g.snapshot().defense.nextWaveAt,next);
  g.time=next-.1;g.step(.05);assert.equal(g.defense.wave,1);
  g.time=next;g.step(.05);assert.equal(g.defense.wave,2);
  const wave=g.units.filter(u=>u.team===1);
  assert.equal(wave.filter(u=>u.type==='shield').length,35);
  assert.equal(wave.filter(u=>u.type==='archer').length,35);
  assert.ok(wave.every(u=>u.role==='attack'&&u.order==='attack'));
  assert.equal(g.aiQueue.length,0);
  for(const u of wave)u.hp=0;
  g.step(.05);assert.equal(g.result,'victory');
});

test('防守：提前清场仍保留完整准备期和休整期',()=>{
  const g=new Game('defend');
  for(const u of g.units)if(u.team===1)u.hp=0;
  g.step(.05);assert.equal(g.result,null);assert.equal(g.defense.nextWaveAt,120);
  g.time=120;g.step(.05);assert.equal(g.defense.wave,1);
  assert.equal(g.defense.nextWaveAt,g.time+30);
  assert.equal(g.result,null);
});

test('防守：拆除主基地可继续，最后一座建筑被毁判负',()=>{
  for(const demolish of [true,false]){
    const g=new Game('defend'),buildings=g.buildings.filter(b=>b.team===0);
    const base=buildings.find(b=>b.primary);
    if(demolish)assert.equal(g.demolish(base.id),null);else g.damage(base,99999);
    g.step(.05);assert.equal(g.result,null);
    for(const b of buildings.filter(b=>!b.primary)){
      if(demolish)g.demolish(b.id);else g.damage(b,99999);
    }
    g.defense.wave=2;for(const u of g.units)if(u.team===1)u.hp=0;
    g.step(.05);assert.equal(g.result,'defeat');
  }
});

test('进攻关卡初始基地被毁判负',()=>{
  const g=new Game('attack');g.damage(g.buildings.find(b=>b.team===0&&b.primary),99999);
  g.step(.05);assert.equal(g.result,'defeat');
});

test('教程、进攻与防守关卡的玩家初始食物和矿产均为 5000',()=>{
  for(const level of ['attack','defend']){
    const g=new Game(level);assert.equal(g.food,5000);assert.equal(g.ore,5000);
  }
  const tutorial=new Game('tutorial'),balanced=new Game('balanced');
  assert.equal(tutorial.food,5000);assert.equal(tutorial.ore,5000);assert.equal(balanced.food,1000);assert.equal(balanced.ore,1000);
});

test('防守重开重置波次，切换关卡清除波次状态',()=>{
  const g=new Game('defend');g.defense.wave=2;g.defense.nextWaveAt=null;
  Object.assign(g,new Game('defend'));
  assert.equal(g.defense.wave,0);assert.equal(g.defense.nextWaveAt,120);
  Object.assign(g,new Game('tutorial'));assert.equal(g.snapshot().defense,null);
});

test('进攻与防守固定 200 人口，双方训练计入排队人数',()=>{
  for(const level of ['attack','defend']){
    const g=new Game(level);
    const cap=200;
    assert.equal(g.snapshot().popCap,cap);assert.equal(g.popCap(1),cap);
    const extra=g.addBuilding('base',0,10,10);
    assert.equal(g.popCap(),cap);extra.hp=0;assert.equal(g.popCap(),cap);
    g.food=g.ore=g.aiFood=g.aiOre=10000;
    g.units=[];
    for(const team of [0,1]){
      if(!g.buildings.some(b=>b.team===team&&b.type==='base'))g.addBuilding('base',team,84,32);
      while(g.units.filter(u=>u.team===team).length<cap-1)g.addUnit('shield',team,team?80:20,30);
      const train=()=>team?g.aiTrain('shield'):g.train('shield');
      assert.equal(train(),null);assert.match(train(),/人口/);
    }
    for(const b of g.buildings)if(b.type==='base')b.hp=0;
    assert.equal(g.popCap(),cap);assert.equal(g.popCap(1),cap);
    assert.match(g.train('shield'),/基地/);assert.match(g.aiTrain('shield'),/基地/);
  }
});


test('哨塔自带一人且最多另入驻三人，到场隐藏且仍占人口，退出保留生命并回到可走空地',()=>{
  const g=productionGame(),tower=g.addBuilding('tower',0,25,32);
  const units=Array.from({length:5},(_,i)=>g.addUnit('shield',0,20,29+i));
  units[0].hp=35;
  assert.equal(g.enterTower(units.map(u=>u.id),tower.id),null);
  assert.equal(units.filter(u=>u.garrisonTarget===tower.id).length,3);
  assert.match(g.enterTower(units.map(u=>u.id),tower.id),/已满/);
  assert.equal(units.filter(u=>u.garrisonId).length,0);
  advance(g,12);
  const inside=units.filter(u=>u.garrisonId===tower.id);
  assert.equal(inside.length,3);assert.equal(usedPop(g.units,0),5);
  assert.ok(inside.every(u=>!g.entities().includes(u)));
  const hp=inside.map(u=>u.hp);
  inside.forEach(u=>g.damage(u,500));
  g.command(inside.map(u=>u.id),'move',{x:40,y:32});advance(g,1);
  assert.deepEqual(inside.map(u=>u.hp),hp);
  assert.ok(inside.every(u=>u.x===tower.x&&u.y===tower.y));
  assert.equal(g.exitTower(tower.id),null);
  assert.ok(inside.every(u=>!u.garrisonId&&walkable(g.map,g.buildings,Math.floor(u.x),Math.floor(u.y))));
  assert.equal(new Set(inside.map(u=>`${u.x},${u.y}`)).size,3);
  assert.deepEqual(inside.map(u=>u.hp),hp);
});
test('载具不能入驻或预留哨塔名额，混选时其他地面单位仍可入驻',()=>{
  const g=productionGame(),tower=g.addBuilding('tower',0,25,32);
  const vehicles=['armoredCar','steamWalker'].map((type,i)=>g.addUnit(type,0,23.5,31.5+i));
  for(const u of vehicles){
    g.command([u.id],'move',{x:20,y:32});
    assert.match(g.enterTower([u.id],tower.id),/载具/);
    assert.equal(u.order,'move');assert.ok(!u.garrisonTarget&&!u.garrisonId);
  }
  const infantry=Array.from({length:4},(_,i)=>g.addUnit(i%2?'archer':'shield',0,20,29+i));
  assert.equal(g.enterTower([...vehicles,...infantry].map(u=>u.id),tower.id),null);
  assert.equal(infantry.filter(u=>u.garrisonTarget===tower.id).length,3);
  assert.ok(vehicles.every(u=>u.order==='move'&&!u.garrisonTarget&&!u.garrisonId));
  advance(g,12);
  assert.equal(infantry.filter(u=>u.garrisonId===tower.id).length,3);
  assert.ok(vehicles.every(u=>!u.garrisonTarget&&!u.garrisonId));
});
test('入驻只接受己方完工哨塔；改令、退出和塔毁取消赶路预留',()=>{
  const g=productionGame(),tower=g.addBuilding('tower',0,30,32),u=g.addUnit('archer',0,20,32);
  tower.constructionPending=true;assert.match(g.enterTower([u.id],tower.id),/已完工/);
  tower.constructionPending=false;tower.team=1;assert.match(g.enterTower([u.id],tower.id),/己方/);tower.team=0;
  const bird=g.addUnit('pigeon',0,20,30);assert.match(g.enterTower([bird.id],tower.id),/地面/);
  assert.equal(g.enterTower([u.id],tower.id),null);
  g.command([u.id],'move',{x:18,y:32});assert.equal(u.garrisonTarget,null);
  g.enterTower([u.id],tower.id);g.exitTower(tower.id);assert.equal(u.garrisonTarget,null);
  g.enterTower([u.id],tower.id);g.damage(tower,1000);assert.equal(u.garrisonTarget,null);assert.ok(u.hp>0);
});
test('哨塔摧毁和拆除均使驻兵阵亡，入驻后在途弹丸不能伤及驻兵',()=>{
  for(const demolish of [false,true]){
    const g=productionGame(),tower=g.addBuilding('tower',0,25,32),u=g.addUnit('archer',0,23.5,32.5);
    g.enterTower([u.id],tower.id);advance(g,2);assert.equal(u.garrisonId,tower.id);
    g.projectiles.push({x:u.x,y:u.y,targetId:u.id,damage:500,life:2});
    g.stepProjectiles(.1,[u,tower],new Map([[u.id,u],[tower.id,tower]]));assert.ok(u.hp>0);
    if(demolish)g.demolish(tower.id);else g.damage(tower,1000);
    assert.equal(u.hp,0);assert.equal(usedPop(g.units,0),0);
  }
});

test('哨塔出口被占时保留驻兵，清空后可再次退出',()=>{
  const g=productionGame(),tower=g.addBuilding('tower',0,25,32),u=g.addUnit('shield',0,23.5,32.5);
  g.enterTower([u.id],tower.id);advance(g,2);
  const blockers=[];
  for(let y=30.5;y<=33.5;y++)for(let x=23.5;x<=26.5;x++){
    if(walkable(g.map,g.buildings,Math.floor(x),Math.floor(y)))blockers.push(g.addUnit('shield',0,x,y));
  }
  assert.match(g.exitTower(tower.id),/空地/);assert.equal(u.garrisonId,tower.id);
  blockers.forEach(b=>b.hp=0);assert.equal(g.exitTower(tower.id),null);assert.equal(u.garrisonId,null);
});

 test('迷雾建筑预定抵达后取消并退款，仅提示一次',()=>{
  const g=new Game();g.ai=null;g.units=[];g.buildings=[];g.map.terrain.fill(0);g.food=1000;g.ore=1000;
  const u=g.addUnit('shield',0,10,10),enemy=g.addUnit('shield',1,50,30);g.updateVision();
  assert.equal(g.build([u.id],'tower',{x:50,y:30}),null);
  assert.equal(g.buildPlans.length,1);assert.equal(g.buildings.length,0);
  u.x=48.5;u.y=30;g.stepBuildPlans();
  assert.equal(g.buildPlans.length,0);assert.equal(g.buildings.length,0);
  assert.equal(g.food,1000);assert.equal(g.ore,1000);
  assert.deepEqual(g.consumeNotifications(),['一个建筑指令被取消']);
  g.stepBuildPlans();assert.deepEqual(g.consumeNotifications(),[]);
  enemy.x=70;u.x=10;g.updateVision();
  assert.equal(g.build([u.id],'tower',{x:50,y:30}),null);
  u.x=48.5;g.stepBuildPlans();assert.equal(g.buildPlans.length,0);assert.equal(g.buildings.length,1);
  assert.equal(g.buildings[0].constructionPending,true);assert.equal(u.order,'build');
 });

test('哨塔自带驻兵随精巧弩箭升级，已有与新建塔生效且不影响敌方',()=>{
  const g=new Game('balanced');g.ai=g.playerAI=null;g.units=[];g.buildings=[];g.map.terrain.fill(0);
  const tower=g.addBuilding('tower',0,35,32),enemy=g.addUnit('shield',1,42,32);enemy.holdFire=true;
  assert.equal(g.attackDamage(tower,enemy),15);
  g.food=g.ore=1000;assert.equal(g.research('precisionBolts'),null);
  assert.equal(g.attackDamage(tower,enemy),15);g.step(60.1);
  assert.equal(g.attackDamage(tower,enemy),22);
  const fresh=g.addBuilding('tower',0,25,32),opponent=g.addBuilding('tower',1,50,32);
  assert.equal(g.attackDamage(fresh,enemy),22);assert.equal(g.attackDamage(opponent,tower),15);
  const bird=g.addUnit('pigeon',1,40,32);assert.equal(g.attackDamage(tower,bird),11);
  g.result=null;enemy.hp=enemy.maxHp;bird.x=60;bird.y=40;g.projectiles=[];tower.cooldown=0;g.updateVision();g.step(.05);
  assert.ok(g.projectiles.some(p=>p.fromX===tower.x&&p.damage===22));
  assert.equal(g.units.length,2);assert.equal(g.exitTower(tower.id),null);assert.equal(g.units.length,2);
});

test('每帧消费音效不丢失预定与通知，单位自然抵达后开始并完成施工',()=>{
  const g=productionGame();g.food=g.ore=1000;
  const u=g.addUnit('shield',0,10,30);g.updateVision();
  assert.equal(g.build([u.id],'tower',{x:50,y:30}),null);
  g.notifications.push('保留通知');g.consumeAudioEvents();
  assert.equal(g.buildPlans.length,1);assert.deepEqual(g.consumeNotifications(),['保留通知']);
  for(let i=0;i<4000;i++){g.step(.05);g.consumeAudioEvents();}
  assert.equal(g.buildPlans.length,0);
  const tower=g.buildings.find(b=>b.type==='tower');assert.ok(tower);
  assert.equal(tower.constructionPending,false);assert.ok(Math.abs(tower.hp-tower.maxHp)<1e-6);
  assert.equal(g.food,850);assert.equal(g.ore,850);
});
test('建筑生命从5%起随施工增长，停工暂停增长且保留施工伤害',()=>{
  for(const type of ['tower','base','factory','machineFactory']){
    const g=productionGame(),u=g.addUnit('shield',0,20,30);g.updateVision();
    assert.equal(g.build([u.id],type,{x:25,y:30}),null);
    const b=g.buildings.at(-1),total=STATS[type].buildTime;
    assert.equal(b.hp,b.maxHp*.05);
    u.x=u.goal.x;u.y=u.goal.y;g.stepBuildings(total*.04);assert.equal(b.hp,b.maxHp*.05);
    g.stepBuildings(total*.06);assert.ok(Math.abs(b.hp-b.maxHp*.1)<1e-6);
    g.damage(b,10+STATS[type].armor);const damaged=b.hp;
    g.command([u.id],'move',{x:10,y:10});g.stepBuildings(total*.2);assert.equal(b.hp,damaged);
    assert.equal(g.assistBuild([u.id],b.id),null);u.x=u.goal.x;u.y=u.goal.y;
    g.stepBuildings(total);assert.equal(b.constructionPending,false);
    assert.ok(Math.abs(b.hp-(b.maxHp-10))<1e-6);
  }
});
