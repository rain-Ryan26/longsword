import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../src/core.js';
import {findPath,walkable} from '../src/pathfinding.js';
import {W,H,STATS} from '../src/data.js';
const advance=(g,t)=>{for(let n=0;n<t/.05;n++)g.step(.05);};
test('A* 绕过建筑且不斜穿墙角',()=>{
  const g=new Game();g.addBuilding('camp',1,44,16);const path=findPath(g.map,g.buildings,{x:30,y:16},{x:58,y:16});assert.ok(path.length>0);assert.ok(path.some(p=>Math.abs(p.y-16)>2));
  let prev={x:30,y:16};for(const p of path){assert.ok(walkable(g.map,g.buildings,Math.floor(p.x),Math.floor(p.y)));const x=Math.floor(prev.x),y=Math.floor(prev.y),nx=Math.floor(p.x),ny=Math.floor(p.y);if(x!==nx&&y!==ny){assert.ok(walkable(g.map,g.buildings,nx,y));assert.ok(walkable(g.map,g.buildings,x,ny));}prev=p;}
});
test('建筑墙隔断时不可达终点安全返回空路径',()=>{const map={terrain:new Array(W*H).fill(0)},wall=[];for(let y=0;y<=H;y+=3)wall.push({x:4.5,y,hp:100});assert.deepEqual(findPath(map,wall,{x:1.5,y:1.5},{x:8.5,y:5.5}),[]);});
test('迷雾按阵营隔离，探索记录保留',()=>{const g=new Game(),enemy=g.units.find(u=>u.team===1),u=g.units.find(u=>u.team===0);assert.equal(g.canSee(0,enemy),false);u.x=enemy.x-3;u.y=enemy.y;g.updateVision();assert.equal(g.canSee(0,enemy),true);const i=Math.floor(enemy.y)*W+Math.floor(enemy.x);u.x=19;u.y=27;g.updateVision();assert.equal(g.visible[0][i],0);assert.equal(g.explored[0][i],1);});
test('S 停止移动与开火，新命令恢复',()=>{const g=new Game(),u=g.units.find(u=>u.team===0);g.command([u.id],'move',{x:35,y:32});advance(g,1);g.command([u.id],'stop');const p={x:u.x,y:u.y};advance(g,2);assert.ok(distance(u,p)<.01);assert.equal(u.holdFire,true);assert.equal(u.targetId,null);g.command([u.id],'attack',{x:37,y:32});advance(g,2);assert.equal(u.holdFire,false);assert.ok(distance(u,p)>3);});
test('弓箭延迟伤害、护甲扣减和射击暴露',()=>{const g=new Game();g.units=[];const a=g.addUnit('archer',0,35,31),b=g.addUnit('shield',1,42,31);b.holdFire=true;g.updateVision();g.step(.05);assert.equal(g.projectiles.length,1);assert.equal(b.hp,150);assert.ok(a.revealUntil>g.time);advance(g,.4);assert.equal(b.hp,141);});
test('停火不使正常视野内单位隐身，射击暴露过期',()=>{const g=new Game();g.units=[];g.buildings=[];g.map.terrain.fill(0);const a=g.addUnit('shield',0,20,20),b=g.addUnit('shield',1,40,20);a.holdFire=true;g.updateVision();assert.equal(g.canSee(1,a),false);a.revealUntil=2;g.updateVision();assert.equal(g.canSee(1,a),true);g.time=3;g.updateVision();assert.equal(g.canSee(1,a),false);b.x=24;g.updateVision();assert.equal(g.canSee(1,a),true);});
test('训练扣费、出兵与人口上限',()=>{const g=new Game();assert.equal(g.train('shield'),null);assert.equal(g.food,145);assert.equal(g.ore,100);advance(g,3.1);assert.equal(g.units.filter(u=>u.team===0).length,15);assert.equal(g.queue.length,0);g.food=0;assert.match(g.train('archer'),/资源不足/);g.food=10000;g.ore=10000;while(g.units.filter(u=>u.team===0).length<40)g.addUnit('shield',0,18,36);assert.match(g.train('shield'),/人口/);});
test('BOT 巡逻沿路线移动',()=>{const g=new Game(),u=g.units.find(u=>u.role==='patrol'),p={x:u.x,y:u.y};advance(g,10);assert.ok(distance(u,p)>3);assert.ok(u.patrolIndex>0);});
test('建筑摧毁解除占地，胜负停止模拟',()=>{const g=new Game(),b=g.buildings.find(b=>b.team===1);assert.equal(walkable(g.map,g.buildings,b.x,b.y),false);g.damage(b,9999);assert.equal(walkable(g.map,g.buildings,b.x,b.y),true);for(const e of g.buildings.filter(b=>b.team===1))e.hp=0;g.step(.05);assert.equal(g.result,'victory');const time=g.time;g.step(1);assert.equal(g.time,time);const h=new Game();h.buildings[0].hp=0;h.step(.05);assert.equal(h.result,'defeat');});
test('完整进攻：部队配合训练增援可摧毁两处营地',()=>{const g=new Game();let stage=0;for(let n=0;n<12000&&!g.result;n++){if(n%200===0){const camp=g.buildings.filter(b=>b.team===1&&b.hp>0)[0];if(camp){g.command(g.units.filter(u=>u.team===0).map(u=>u.id),'attack',camp);stage++;}if(g.units.filter(u=>u.team===0).length<25)g.train(n%400===0?'shield':'archer');}g.step(.05);}assert.equal(g.result,'victory',`结果 ${g.result}, 剩余玩家 ${g.units.filter(u=>u.team===0).length}, 营地 ${g.buildings.filter(b=>b.team===1).map(b=>b.hp)}`);assert.ok(stage>1);});


test('侦测按观察者地形修正，离开后恢复，双方一致',()=>{
  for(const team of [0,1]){
    const g=new Game();g.units=[];g.buildings=[];g.map.terrain.fill(0);
    const u=g.addUnit('shield',team,20,20),enemy=g.addUnit('shield',1-team,26,20);
    const tile=Math.floor(u.y)*W+Math.floor(u.x);
    for(const [terrain,range,seen] of [[0,10,true],[1,12,true],[2,3,false],[0,10,true]]){
      g.map.terrain[tile]=terrain;g.updateVision();
      assert.equal(g.detectionRange(u),range);assert.equal(g.canSee(team,enemy),seen);
      assert.equal(g.visible[team][20*W+23],1);
      assert.equal(g.visible[team][20*W+20+range],1);
      assert.equal(g.visible[team][20*W+20+range+1],0);
    }
    g.map.terrain[Math.floor(enemy.y)*W+Math.floor(enemy.x)]=2;g.updateVision();
    assert.equal(g.canSee(team,enemy),true,'目标脚下森林不缩短观察者侦测距离');
    const archer=g.addUnit('archer',team,30,30);g.map.terrain[30*W+30]=2;
    assert.ok(Math.abs(g.detectionRange(archer)-3.6)<1e-9);
  }
});
test('森林中自动索敌使用缩短后的距离，即使友军提供视野',()=>{
  const g=new Game();g.units=[];g.map.terrain.fill(0);
  const u=g.addUnit('shield',0,30,30),scout=g.addUnit('shield',0,35,32),enemy=g.addUnit('shield',1,35,30);
  scout.holdFire=true;enemy.holdFire=true;g.map.terrain[30*W+30]=2;
  g.updateVision();assert.equal(g.canSee(0,enemy),true);g.step(.05);assert.equal(u.targetId,null);
  g.map.terrain[30*W+30]=0;g.step(.05);assert.equal(u.targetId,enemy.id);
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
test('普通移动、攻击和停止清空待经点，追加不会覆盖正在移动的目标',()=>{
  for(const kind of ['move','attack','stop']){
    const g=new Game();g.units=[];const u=g.addUnit('shield',0,30,30);
    g.command([u.id],'move',{x:35.5,y:30.5});advance(g,.3);
    const current={...u.goal};g.command([u.id],'move',{x:40.5,y:35.5},null,true);
    assert.deepEqual(u.goal,current);assert.equal(u.waypoints.length,1);
    g.command([u.id],kind,{x:28.5,y:35.5});assert.deepEqual(u.waypoints,[]);
    if(kind==='stop'){assert.equal(u.goal,null);assert.equal(u.holdFire,true);}
    else assert.deepEqual(u.goal,{x:28.5,y:35.5});
  }
});


test('默认绕行山地且不斜穿山地墙角，双击模式允许进入',()=>{
  const g=new Game();g.units=[];
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
test('强制穿山随追加路线保留，普通命令和停止清除',()=>{
  for(const kind of ['move','attack','stop']){
    const g=new Game(),u=g.units.find(u=>u.team===0);
    g.command([u.id],'move',{x:44.5,y:16.5},null,false,true);
    g.command([u.id],'move',{x:58.5,y:16.5},null,true);assert.equal(u.allowMountains,true);
    assert.equal(u.waypoints.length,1);
    g.command([u.id],kind,{x:30.5,y:32.5});assert.equal(u.allowMountains,false);
    assert.deepEqual(u.waypoints,[]);
  }
});
