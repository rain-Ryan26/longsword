import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/core.js';
import {Renderer} from '../src/renderer.js';
import {SnapshotHost,SnapshotReceiver} from '../src/sync.js';

function fixture(){
  const calls=[];let rect={width:800,height:600},reads=0,resize;
  function canvas(label){
    const context=new Proxy({}, {get(_,name){return (...args)=>{calls.push({label,name,args});if(name==='createImageData')return {data:new Uint8ClampedArray(args[0]*args[1]*4)};};},set(){return true;}});
    return {width:288,height:192,getContext:()=>context,getBoundingClientRect(){reads++;return rect;}};
  }
  globalThis.window={devicePixelRatio:1};
  globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}};
  globalThis.document={createElement:()=>canvas('cache')};
  const renderer=new Renderer(canvas('main'),canvas('mini')),game=new Game(),selected=new Set();
  const draw=(view=0,marker=null)=>renderer.draw(game.snapshot(),view,selected,null,marker);
  return {renderer,game,selected,draw,calls,reads:()=>reads,resize(){rect={width:900,height:600};resize();}};
}

test('静止画面不重绘，镜头变化复用迷雾及小地图缓存',()=>{
  const f=fixture();assert.equal(f.draw(),true);f.calls.length=0;
  assert.equal(f.draw(),false);assert.equal(f.calls.length,0);
  f.renderer.camera.x++;assert.equal(f.draw(),true);assert.equal(f.reads(),1);
  assert.equal(f.calls.filter(c=>c.label==='cache').length,0);
  f.game.step(.05);f.calls.length=0;assert.equal(f.draw(),true);
  f.calls.length=0;f.game.step(.05);f.draw();
  assert.equal(f.calls.some(c=>c.name==='putImageData'),false);
});

test('切换大地图重建迷雾尺寸，小地图坐标与观察窗口同步匹配',()=>{
  const f=fixture();f.draw();Object.assign(f.game,new Game('balanced'));f.draw();
  assert.equal(f.renderer.fogCanvas.width,128);assert.equal(f.renderer.fogCanvas.height,88);
  f.renderer.camera={x:120,y:84,zoom:13};f.renderer.clamp();assert.equal(f.renderer.camera.x,120);
  let message;const host=new SnapshotHost(m=>message=structuredClone(m),'host'),receiver=new SnapshotReceiver('large');
  host.receive(receiver.message(),0);host.publish(f.game.snapshot(),false,1,0);receiver.receive(message);
  assert.equal(receiver.state.map.width,128);assert.equal(receiver.state.visible[1].length,128*88);
  assert.equal(receiver.state.map.foodPoints.length,9);
  Object.assign(f.game,new Game());f.draw();assert.equal(f.renderer.fogCanvas.width,96);assert.equal(f.renderer.fogCanvas.height,64);
});

test('视野原地修改、切换阵营、地图替换使缓存更新',()=>{
  const f=fixture();f.draw();
  f.game.updateVision();f.calls.length=0;f.draw();assert.equal(f.calls.filter(c=>c.name==='putImageData').length,1);
  f.calls.length=0;f.draw(2);assert.equal(f.calls.filter(c=>c.name==='putImageData').length,1);
  f.calls.length=0;Object.assign(f.game,new Game());f.draw(2);assert.equal(f.calls.filter(c=>c.name==='putImageData').length,1);
  f.draw(1);f.calls.length=0;f.draw(0);assert.equal(f.calls.filter(c=>c.name==='putImageData').length,1);
});

test('尺寸与像素比变化更新画布，标记到期清除且暂停可选择',()=>{
  const f=fixture();f.draw();f.resize();assert.equal(f.draw(),true);assert.equal(f.reads(),2);
  window.devicePixelRatio=2;assert.equal(f.draw(),true);assert.equal(f.renderer.canvas.width,1800);
  f.selected.add(f.game.units[0].id);assert.equal(f.draw(),true);
  const marker={x:20,y:30,until:performance.now()+10000};assert.equal(f.draw(0,marker),true);assert.equal(f.draw(0,marker),true);
  marker.until=0;assert.equal(f.draw(0,marker),true);assert.equal(f.draw(0,marker),false);
});

test('裁剪屏幕外单位仍保留经过画面的选中路径',()=>{
  const f=fixture(),u=f.game.units.find(u=>u.team===0);u.x=90;u.y=60;u.path=[{x:25,y:32}];f.selected.add(u.id);
  f.draw(1);
  assert.equal(f.calls.some(c=>c.label==='main'&&c.name==='translate'&&c.args[0]===90&&c.args[1]===60),false);
  assert.equal(f.calls.some(c=>c.label==='main'&&c.name==='moveTo'&&c.args[0]===90&&c.args[1]===60),true);
});

test('无观察页不发送，多接收方独立确认、超时及退出',()=>{
  const messages=[],host=new SnapshotHost(m=>messages.push(structuredClone(m)),'host'),g=new Game();
  host.publish(g.snapshot(),false,1,0);assert.equal(messages.length,0);
  const a=new SnapshotReceiver('a'),b=new SnapshotReceiver('b');
  host.receive(a.message(),0);host.publish(g.snapshot(),false,1,0);
  assert.equal(a.receive(messages.pop()),true);host.receive(a.message('ack'),1);
  host.receive(b.message(),1);host.publish(g.snapshot(),false,1,2);
  assert.equal(messages.find(m=>m.to==='a').state.map,undefined);
  assert.ok(messages.find(m=>m.to==='b').state.map);
  assert.equal(messages.find(m=>m.to==='a').state.visible,undefined);
  assert.equal(b.receive(messages.find(m=>m.to==='b')),true);
  messages.length=0;host.receive(a.message('bye'),3);host.publish(g.snapshot(),true,2,6000);
  assert.equal(messages.length,0);assert.equal(host.peers.size,0);
});

test('观察页更新视野、重开和主窗口重载后恢复地图',()=>{
  let message;const host=new SnapshotHost(m=>message=structuredClone(m),'host'),r=new SnapshotReceiver('a'),g=new Game();
  host.receive(r.message(),0);host.publish(g.snapshot(),false,1,0);r.receive(message);
  const originalMap=r.state.map;host.receive(r.message('ack'),1);g.step(.05);host.publish(g.snapshot(),false,1,2);
  assert.equal(message.state.map,undefined);assert.ok(message.state.visible);assert.equal(r.receive(message),true);assert.equal(r.state.map,originalMap);
  Object.assign(g,new Game());host.publish(g.snapshot(),false,1,3);assert.ok(message.state.map);assert.equal(r.receive(message),true);assert.notEqual(r.state.map,originalMap);
  const restarted=new SnapshotHost(m=>message=structuredClone(m),'new-host');restarted.receive(r.message(),4);restarted.publish(g.snapshot(),false,1,4);
  assert.ok(message.state.map);assert.equal(r.receive(message),true);
  const lost=new SnapshotReceiver('a');assert.equal(lost.receive({...message,state:{revision:1,visionVersion:1}}),false);
  restarted.receive(lost.message(),5);restarted.publish(g.snapshot(),false,1,5);assert.equal(lost.receive(message),true);
});

test('己方预定区域填充与标签绘制在迷雾之上，敌方预定隐藏',()=>{
  const f=fixture();f.game.buildPlans=[{type:'tower',team:0,x:50,y:30},{type:'tower',team:1,x:55,y:30}];
  f.draw();const calls=f.calls.filter(c=>c.label==='main');
  const fog=calls.findIndex(c=>c.name==='drawImage'&&c.args[0]===f.renderer.fogCanvas);
  const fill=calls.findIndex(c=>c.name==='fillRect'&&c.args[0]===49&&c.args[1]===29&&c.args[2]===2);
  const labels=calls.filter(c=>c.name==='fillText'&&c.args[0]==='预定建筑');
  assert.ok(fill>fog);assert.equal(labels.length,1);
});
