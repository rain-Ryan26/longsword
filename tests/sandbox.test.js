import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/core.js';
import {AssaultAI} from '../src/ai.js';
import {usedPop} from '../src/data.js';
import {placeSandboxUnit,deleteSandboxUnits,startSandboxBattle,restoreSandboxSetup,mirrorSandboxFormation} from '../src/sandbox.js';

test('沙盒切换到其他关卡后不会保留编辑暂停状态',()=>{
  const g=new Game('sandbox');Object.assign(g,new Game('tutorial'));g.step(.05);
  assert.equal(g.sandboxEditing,false);assert.equal(g.time,.05);
});

test('沙盒地图两座对称山体、中央通道无森林，编辑暂停模拟',()=>{
  const g=new Game('sandbox');assert.equal(g.units.length,0);assert.equal(g.buildings.length,0);
  assert.ok(g.map.terrain.includes(1));assert.ok(!g.map.terrain.includes(2));
  for(let y=0;y<64;y++)for(let x=0;x<96;x++)assert.equal(g.map.terrain[y*96+x],g.map.terrain[y*96+95-x]);
  assert.equal(g.map.terrain[32*96+48],0);assert.equal(g.map.terrain[10*96+48],1);
  g.step(1);assert.equal(g.time,0);assert.equal(g.result,null);
});
test('放置按左右归属，拒绝越界、山地与重叠，双方删除及人口统计',()=>{
  const g=new Game('sandbox');const a=placeSandboxUnit(g,'steamWalker',{x:20,y:32});
  const b=placeSandboxUnit(g,'archer',{x:76,y:32});assert.equal(a.team,0);assert.equal(b.team,1);
  assert.equal(usedPop(g.units,0),5);assert.equal(usedPop(g.units,1),1);
  assert.equal(placeSandboxUnit(g,'shield',{x:-1,y:5}),null);
  assert.equal(placeSandboxUnit(g,'shield',{x:48,y:10}),null);
  assert.equal(placeSandboxUnit(g,'shield',a),null);
  deleteSandboxUnits(g,[a.id,b.id]);assert.equal(g.units.length,0);
});
test('一键镜像覆盖红方且保持兵种、坐标、人口，重复操作不累加',()=>{
  const g=new Game('sandbox');placeSandboxUnit(g,'archer',{x:20,y:32});placeSandboxUnit(g,'steamWalker',{x:24,y:36});
  placeSandboxUnit(g,'wilddog',{x:80,y:40});mirrorSandboxFormation(g);mirrorSandboxFormation(g);
  assert.equal(g.units.length,4);assert.equal(usedPop(g.units,0),usedPop(g.units,1));
  for(const u of g.units.filter(u=>u.team===0))assert.ok(g.units.some(v=>v.team===1&&v.type===u.type&&v.x===96-u.x&&v.y===u.y));
});
test('开战复用总攻 AI，无补员，回编辑恢复布阵满血，可再次开战',()=>{
  const g=new Game('sandbox');assert.equal(startSandboxBattle(g),false);
  placeSandboxUnit(g,'shield',{x:20,y:32});placeSandboxUnit(g,'shield',{x:76,y:32});
  assert.equal(startSandboxBattle(g),true);assert.ok(g.ai instanceof AssaultAI);g.step(.05);
  assert.equal(g.units.find(u=>u.team===1).order,'attack');assert.equal(g.units.length,2);
  assert.equal(mirrorSandboxFormation(g),false);deleteSandboxUnits(g,g.units.map(u=>u.id));assert.equal(g.units.length,2);
  g.units.find(u=>u.team===1).hp=0;g.step(.05);assert.equal(g.result,'victory');
  const edit=new Game('sandbox');restoreSandboxSetup(edit,g.sandboxSetup);
  assert.equal(edit.units.length,2);assert.ok(edit.units.every(u=>u.hp===u.maxHp));assert.equal(edit.time,0);
  assert.equal(startSandboxBattle(edit),true);
});

test('编辑输入可框选双方并 D 删除，Shift 移动转交放置，开战后只能选蓝方',async()=>{
  const {bindInput}=await import('../src/input.js');
  const {InteractionState}=await import('../src/interaction.js');
  const {ControlGroups}=await import('../src/selection.js');
  const handlers=new Map(),elements=new Map(),previous=globalThis.window;
  const noop=()=>{};
  const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,addEventListener:(event,fn)=>handlers.set(id+':'+event,fn),getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),setPointerCapture:noop,hasPointerCapture:()=>false});return elements.get(id);};
  globalThis.window={addEventListener:(event,fn)=>handlers.set(event,fn)};
  const game=new Game('sandbox');placeSandboxUnit(game,'shield',{x:20,y:32});placeSandboxUnit(game,'archer',{x:76,y:32});
  const interaction=new InteractionState();let moves=0;
  const ctx={game,observer:false,view:1,state:game.snapshot(),selected:new Set(),drag:null,
    get sandboxEditing(){return game.sandboxEditing;},sandboxClick:()=>false,
    sandboxMove:(p,shift)=>{if(shift)moves++;},sandboxCancel:noop,
    sandboxDelete:()=>{deleteSandboxUnits(game,ctx.selected);ctx.selected.clear();ctx.state=game.snapshot();},
    renderer:{world:(x,y)=>({x,y}),screen:(x,y)=>({x,y}),width:100,height:100},
    interaction,$,toast:noop,closeBuild:()=>interaction.enter('select'),setAttack:noop,renderMode:noop,
    updateHud:noop,sendSnapshot:noop,previewAt:noop,enterRallyMode:noop,togglePause:noop,
    settingsPanel:$('settings'),setSettings:noop,controlGroups:new ControlGroups(),helpPanel:$('help-panel'),setHelp:noop,signal:noop};
  const event=(x,y,extra={})=>({button:0,clientX:x,clientY:y,pointerId:1,preventDefault:noop,...extra});
  const box=()=>{handlers.get('game:pointerdown')(event(10,20));handlers.get('game:pointermove')(event(85,40));handlers.get('game:pointerup')(event(85,40));};
  try{
    bindInput(ctx);handlers.get('game:pointermove')(event(20,32,{shiftKey:true}));assert.equal(moves,1);
    box();assert.equal(ctx.selected.size,2);
    handlers.get('keydown')({key:'d',target:{matches:()=>false},preventDefault:noop});assert.equal(game.units.length,0);
    placeSandboxUnit(game,'shield',{x:20,y:32});placeSandboxUnit(game,'archer',{x:76,y:32});
    startSandboxBattle(game);ctx.state=game.snapshot();box();assert.equal(ctx.selected.size,1);
    assert.equal(game.units.find(u=>ctx.selected.has(u.id)).team,0);
  }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
