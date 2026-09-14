import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/core.js';
import {DefendAI} from '../src/ai.js';
import {createMapRandomAttack} from '../src/random-map.js';
import {buildingCells,createWalkability} from '../src/pathfinding.js';
import {SnapshotHost,SnapshotReceiver} from '../src/sync.js';

test('随机进攻：种子可复现，地形、资源、敌营随种子变化',()=>{
  const a=createMapRandomAttack(17),b=createMapRandomAttack(18);
  assert.deepEqual(a,createMapRandomAttack(17));
  for(const key of ['terrain','resources','foodPoints','camps','towers','patrolRoutes'])assert.notDeepEqual(a[key],b[key]);
  const original=Math.random;
  try{
    Math.random=()=>.25;const first=new Game('randomAttack').map;
    Math.random=()=>.75;const second=new Game('randomAttack').map;
    assert.notEqual(first.seed,second.seed);assert.notDeepEqual(first.terrain,second.terrain);
  }finally{Math.random=original;}
});

test('随机进攻：64 个种子的部署、建筑占地和无山林通路有效',()=>{
  for(let seed=0;seed<64;seed++){
    const g=new Game('randomAttack',{seed}),m=g.map,label=`seed=${seed}`;
    assert.equal(m.width,128);assert.equal(m.height,88);
    assert.equal(m.resources.length,9);assert.equal(m.foodPoints.length,9);
    for(const type of [1,2])assert.ok(m.terrain.filter(t=>t===type).length>40,`${label} 缺少地形 ${type}`);
    const occupied=new Set();
    for(const b of g.buildings){
      const c=buildingCells(b);
      for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){
        assert.ok(x>=0&&x<m.width&&y>=0&&y<m.height,label);
        const cell=y*m.width+x;assert.equal(m.terrain[cell],0,label);
        assert.ok(!occupied.has(cell),`${label} 建筑重叠`);occupied.add(cell);
      }
    }
    const canWalk=createWalkability(m,g.buildings),start=g.units.find(u=>u.team===0);
    const seen=new Set([g.cellIndex(start.x,start.y)]),queue=[{x:Math.floor(start.x),y:Math.floor(start.y)}];
    for(let i=0;i<queue.length;i++){
      const p=queue[i];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=p.x+dx,y=p.y+dy,cell=y*m.width+x;
        if(!seen.has(cell)&&canWalk(x,y,true,true)){seen.add(cell);queue.push({x,y});}
      }
    }
    const cells=new Set();
    for(const u of g.units){
      const cell=g.cellIndex(u.x,u.y);assert.ok(!cells.has(cell),`${label} 单位重叠`);cells.add(cell);
      assert.ok(seen.has(cell),`${label} ${u.type} 出生点不可达`);
    }
    for(const p of [...m.patrol,...m.camps.map(p=>({x:p.x-4,y:p.y+4}))])
      assert.ok(seen.has(g.cellIndex(p.x,p.y)),`${label} 巡逻或敌营不可达`);
    for(const p of [...m.resources,...m.foodPoints]){
      // 已有经济建筑占据中心，检验其外侧施工/通行圈。
      for(const [dx,dy] of [[-3,0],[3,0],[0,-3],[0,3]])
        assert.ok(seen.has(g.cellIndex(p.x+dx,p.y+dy)),`${label} 资源不可达`);
    }
  }
});

test('随机进攻：继承兵力、经济、科技、联防及胜负，快照传递随机地图',()=>{
  const g=new Game('randomAttack',{seed:123}),fixed=new Game('attack');
  const counts=game=>game.units.reduce((out,u)=>{const key=`${u.team}:${u.type}`;out[key]=(out[key]||0)+1;return out;},{});
  assert.deepEqual(counts(g),counts(fixed));
  assert.deepEqual(g.technologies,fixed.technologies);
  for(const key of ['food','ore','aiFood','aiOre'])assert.equal(g[key],fixed[key]);
  assert.equal(g.popCap(),200);assert.equal(g.popCap(1),200);assert.ok(g.ai instanceof DefendAI);
  assert.deepEqual([0,1,2].map(i=>g.units.filter(u=>u.defenseSector===i).length),[30,50,70]);
  assert.deepEqual([0,1,2].map(i=>g.buildings.filter(b=>b.type==='tower'&&b.defenseSector===i).length),[2,3,4]);
  for(let i=0;i<20;i++)g.step(.05);
  assert.equal(g.aiQueue.length,0);assert.equal(g.units.filter(u=>u.team===1).length,153);
  g.damage(g.buildings.find(b=>b.type==='tower'),10);g.ai.timer=0;g.ai.update(g,.1);
  assert.equal(g.ai.responders.size,40);
  const receiver=new SnapshotReceiver('test'),host=new SnapshotHost(message=>receiver.receive(structuredClone(message)),'host');
  host.receive(receiver.message(),0);host.publish(g.snapshot(),false,1,0);
  assert.equal(receiver.state.level,'randomAttack');assert.deepEqual(receiver.state.map,g.map);
  g.damage(g.buildings.find(b=>b.team===1&&b.primary),99999);g.step(.05);assert.equal(g.result,null);
  for(const b of g.buildings.filter(b=>b.team===1))g.damage(b,99999);
  g.step(.05);assert.equal(g.result,'victory');
  const loss=new Game('randomAttack',{seed:456});loss.damage(loss.buildings.find(b=>b.team===0&&b.primary),99999);loss.step(.05);
  assert.equal(loss.result,'defeat');
});
