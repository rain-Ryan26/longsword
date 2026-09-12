import test from 'node:test';
import assert from 'node:assert/strict';
import {VisionSystem} from '../src/vision.js';
import {DETECTION_MULTIPLIERS} from '../src/data.js';
import {productionGame} from './fixtures.js';
import {InteractionState} from '../src/interaction.js';
import {STATS} from '../src/data.js';
import {createWalkability,walkable,findPath} from '../src/pathfinding.js';
import {trainingPlan,productionType} from '../src/rules.js';

test('训练预检与实际扣费共用规则，玩家科技不影响 AI',()=>{
  const game=productionGame(),base=game.buildings.find(b=>b.team===0);
  const machine=game.addBuilding('machineFactory',0,30,30);
  game.addBuilding('machineFactory',1,80,30);
  const snapshot=game.snapshot();
  const error=trainingPlan(snapshot,'armoredCar',machine.id).error;
  assert.match(error,/铸铁/);assert.equal(game.train('armoredCar',machine.id),error);
  assert.equal(game.aiTrain('armoredCar'),null);
  game.technologies.castIron.status='complete';
  assert.equal(trainingPlan(game.snapshot(),'armoredCar',machine.id).error,null);
  assert.equal(game.train('armoredCar',machine.id),null);
  assert.equal(game.food,5000-STATS.armoredCar.food);
  assert.equal(game.ore,5000-STATS.armoredCar.ore);
  assert.match(trainingPlan(game.snapshot(),'armoredCar',base.id).error,/机械工厂/);
  game.technologies.compositeShield.status='complete';
  assert.equal(productionType('shield',game.technologies),'ironShield');
  assert.equal(productionType('shield',game.technologies,1),'shield');
});

test('建筑占地缓存反映死亡、位置、尺寸、数组增删、换图和让位列表',()=>{
  const map={width:20,height:20,terrain:Array(400).fill(0)};
  const building={type:'base',x:8,y:8,hp:100},buildings=[building];
  function verify(list=buildings,currentMap=map){
    const cached=createWalkability(currentMap,list);
    for(let y=-1;y<=currentMap.height;y++)for(let x=-1;x<=currentMap.width;x++){
      for(const avoid of [false,true])assert.equal(cached(x,y,avoid),walkable(currentMap,list,x,y,avoid));
    }
  }
  verify();building.hp=0;verify();building.hp=100;verify();
  building.x=12;verify();building.type='mine';verify();
  buildings.push({type:'tower',x:4,y:4,hp:100});verify();
  verify(buildings.filter(b=>b!==building));
  buildings.splice(0,1);verify();
  map.terrain.fill(2);verify();
  verify(buildings,{width:24,height:18,terrain:Array(24*18).fill(0)});
  const wall=Array.from({length:5},(_,i)=>({type:'base',x:10,y:2+i*4,hp:100}));
  assert.deepEqual(findPath(map,wall,{x:2,y:10},{x:18,y:10}),[]);
  wall[2].hp=0;
  assert.ok(findPath(map,wall,{x:2,y:10},{x:18,y:10}).length);
});

// 保留原全对比较作为结果参考，避免空间分桶改变挤动顺序。
function referenceSeparate(game,dt){
  const rest=u=>u.targetId==null&&u.path.length===0&&u.order==='idle';
  for(let i=0;i<game.units.length;i++)for(let j=i+1;j<game.units.length;j++){
    const a=game.units[i],b=game.units[j];
    if(game.isFlying(a)||game.isFlying(b))continue;
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    const collision=(STATS[a.type].collisionRadius||.425)+(STATS[b.type].collisionRadius||.425);
    const gap=rest(a)&&rest(b)?Math.max(1.6,collision):collision;
    if(d>=gap)continue;
    const dx=d>.001?(a.x-b.x)/d:1,dy=d>.001?(a.y-b.y)/d:0,k=Math.min((gap-d)*.5,dt*1.5);
    for(const [u,sign] of [[a,1],[b,-1]]){
      if(STATS[u.type].air)continue;
      const x=u.x+dx*k*sign,y=u.y+dy*k*sign;
      if(walkable(game.map,game.buildings,Math.floor(x),Math.floor(y),...game.terrainAvoidance(u))){u.x=x;u.y=y;}
    }
  }
}

test('空间分桶与全对分离逐步一致，覆盖密集队列、格界、地形和起降单位',()=>{
  const game=productionGame();game.buildings=[];
  const types=['shield','steamWalker','armoredCar','pigeon'];
  for(let i=0;i<90;i++){
    const u=game.addUnit(types[i%4],i%2,20,20);
    u.x=20+(i%10)*.43;u.y=20+Math.floor(i/10)*.43;
    if(i%3===0)u.order='move';
    if(u.type==='pigeon')u.flying=i%8===3;
  }
  game.map.terrain[game.cellIndex(19,20)]=2;
  game.addBuilding('tower',0,24,24);
  const reference=Object.assign(Object.create(Object.getPrototypeOf(game)),game,{units:structuredClone(game.units)});
  for(const dt of [.05,.05,.3,.05,.8,.05]){
    referenceSeparate(reference,dt);game.separate(dt);
    assert.deepEqual(game.units,reference.units);
  }
});

test('索敌同分保留实体顺序，已有目标死亡后弹道及时失效',()=>{
  const game=productionGame();game.buildings=[];
  const unit=game.addUnit('shield',0,20,20);
  const first=game.addUnit('shield',1,22,20),second=game.addUnit('shield',1,18,20);
  game.updateVision();
  assert.equal(game.acquireTarget(unit,game.entities()).id,first.id);
  first.hp=0;
  assert.equal(game.acquireTarget(unit,game.entities()).id,second.id);
  game.projectiles=[{x:20,y:20,targetId:second.id,life:2}];
  const entities=game.entities(),lookup=new Map(entities.map(e=>[e.id,e]));
  second.hp=0;game.stepProjectiles(.05,entities,lookup);
  assert.equal(game.projectiles[0].life,0);
});

test('交互模式互斥，取消和重开清除预览，集结及科技保留建筑选择',()=>{
  const state=new InteractionState();
  state.enter('place',{type:'tower'});state.buildPreview={x:10,y:10};
  state.enter('attack');
  assert.equal(state.buildMenu,false);assert.equal(state.buildType,null);
  assert.equal(state.buildPreview,null);assert.equal(state.attackMode,true);
  state.enter('select');
  assert.equal(state.presentation(false).cursor,'default');
  state.enter('rally',{buildingId:4});assert.equal(state.rallyBaseId,4);
  state.enter('technology',{buildingId:4});
  assert.equal(state.rallyBaseId,null);assert.equal(state.selectedBuilding,4);
  state.enter('select');assert.equal(state.selectedBuilding,null);
  assert.equal(state.techMenu,false);
  assert.equal(state.presentation(true).cursor,'default');
});

// 小地图参考实现用线性选择最短距离，不依赖生产代码的堆、戳记或去重。
function referenceGround(map,x,y,budget){
  const size=map.width*map.height,dist=Array(size).fill(Infinity),done=new Set();
  dist[Math.floor(y)*map.width+Math.floor(x)]=0;
  while(true){
    let current=-1;
    for(let i=0;i<size;i++)if(!done.has(i)&&dist[i]<=budget&&(current<0||dist[i]<dist[current]))current=i;
    if(current<0)break;
    done.add(current);
    const x=current%map.width,y=Math.floor(current/map.width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if((!dx&&!dy)||nx<0||ny<0||nx>=map.width||ny>=map.height)continue;
      const cell=ny*map.width+nx;
      dist[cell]=Math.min(dist[cell],dist[current]+(dx&&dy?Math.SQRT2:1)/DETECTION_MULTIPLIERS[map.terrain[cell]]);
    }
  }
  return dist.map(cost=>Number(cost<=budget));
}

test('视野缓冲复用在混合地形、边缘、原地改地形和换图后与参考算法一致',()=>{
  const vision=new VisionSystem();
  for(const [width,height] of [[17,13],[17,13],[13,17],[9,7]]){
    const map={width,height,terrain:Array.from({length:width*height},(_,i)=>(i*17+Math.floor(i/width))%3)};
    for(const [x,y,budget] of [[.5,.5,5],[8.5,6.5,7],[width-.5,height-.5,3],[8.5,6.5,2]]){
      const visible=Array(width*height).fill(0);
      vision.ground(map,visible,x,y,budget);
      assert.deepEqual(visible,referenceGround(map,x,y,budget));
    }
    map.terrain.fill(2);
    const visible=Array(width*height).fill(0);
    vision.ground(map,visible,.5,.5,6);
    assert.deepEqual(visible,referenceGround(map,.5,.5,6));
  }
});

test('同格视野去重保留较大预算、阵营隔离与探索记忆',()=>{
  const game=productionGame();game.buildings=[];
  game.addUnit('shield',0,20,20);game.addUnit('steamWalker',0,20,20);
  game.addUnit('shield',1,20,20);
  game.updateVision();
  assert.equal(game.visible[0][game.cellIndex(32,20)],1);
  assert.equal(game.visible[1][game.cellIndex(32,20)],0);
  game.units=[];game.updateVision();
  assert.equal(game.visible[0][game.cellIndex(32,20)],0);
  assert.equal(game.explored[0][game.cellIndex(32,20)],1);
});
