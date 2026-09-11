import {Game} from './core.js';
import {Renderer} from './renderer.js';
import {SnapshotHost,SnapshotReceiver} from './sync.js';
import {STATS,W,H} from './data.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),observer=params.has('observe');
const session=params.get('session')||crypto.randomUUID();
if(!params.has('session')){params.set('session',session);history.replaceState(null,'',`?${params}`);}
const channel=new BroadcastChannel(`longsword-${session}`),game=observer?null:new Game();
const host=observer?null:new SnapshotHost(message=>channel.postMessage(message),crypto.randomUUID());
const receiver=observer?new SnapshotReceiver(crypto.randomUUID()):null;
let lastHello=-Infinity;
const controlGroups=new Map();
let lastUnitClick=null,lastRightClick=null;
let buildMenu=false,buildType=null,selectedBuilding=null,buildPreview=null;
let state=game?.snapshot(),selected=new Set(),view=observer?1:0,attackMode=false,drag=null,marker=null,paused=false,speed=1,last=performance.now(),acc=0,lastSnapshot=0,lastReceived=0,lastHud=0,toastTimer;
const renderer=new Renderer($('game'),$('minimap'));renderer.resize();if(observer)renderer.camera={x:W/2,y:H/2,zoom:Math.max(5,Math.min(renderer.width/W,renderer.height/H)*.88)};$('perspective').value=view;
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function setAttack(on){if(on)closeBuild();attackMode=on;$('game').style.cursor=on?'crosshair':'default';$('mode-hint').textContent=observer?'观察窗口 · 滚轮缩放 · 中键拖动':on?'攻击移动：左键指定位置 · Esc 取消':'左键选择 · 右键移动';}
function closeBuild(){buildMenu=false;buildType=null;selectedBuilding=null;buildPreview=null;setAttack(false);}
function previewAt(p){
  const placement=game.placement(buildType,renderer.world(p.x,p.y)),s=STATS[buildType];
  buildPreview={...placement,error:placement.error||(game.food<s.food||game.ore<s.ore?'资源不足':null)};
}
$('cancel-build').onclick=()=>{closeBuild();updateHud();};
for(const type of ['mine','tower'])$('build-'+type).onclick=()=>{
  if(observer)return;buildType=type;buildPreview=null;setAttack(false);
  canvas.style.cursor='crosshair';$('mode-hint').textContent=`放置${STATS[type].name}：左键建造 · 右键 / Esc 取消`;
  updateHud();
};
$('demolish').onclick=()=>{if(observer)return;const error=game.demolish(selectedBuilding);toast(error||'建筑已拆除，不退还资源');if(!error)closeBuild();sendSnapshot();updateHud();};
function syncView(){lastRightClick=null;view=Number($('perspective').value);$('view-name').textContent=['玩家视角','全局视角','BOT 视角'][view];}
$('perspective').addEventListener('input',syncView);syncView();
function sendSnapshot(){if(game)host.publish(game.snapshot(),paused,speed,performance.now());}
channel.onmessage=event=>{
  const msg=event.data;
  if(observer&&msg.type==='state'&&msg.to===receiver.id){
    if(!receiver.receive(msg)){channel.postMessage(receiver.message());return;}
    state=receiver.state;paused=msg.paused;speed=msg.speed;lastReceived=performance.now();$('connection').hidden=true;
    channel.postMessage(receiver.message('ack'));
  }else if(!observer&&host.receive(msg,performance.now()))sendSnapshot();
};
window.addEventListener('pagehide',()=>{if(receiver)channel.postMessage(receiver.message('bye'));});
if(observer){document.title='longsword · 独立观察';$('session-label').textContent='独立观察 · 共享战局';$('connection').hidden=false;for(const id of ['pause','speed','restart','again','train-shield','train-archer','observer'])$(id).disabled=true;channel.postMessage(receiver.message());setAttack(false);}
$('observer').onclick=()=>{const url=new URL(location.href);url.searchParams.set('observe','1');const popup=window.open(url.href,`longsword-observer-${session}`,'popup,width=1280,height=850');let link=document.getElementById('observer-link');if(!link){link=document.createElement('a');link.id='observer-link';link.target='_blank';link.textContent='观察页备用链接（可复制到新窗口）';$('observer').after(link);}link.href=url.href;if(!popup)toast('浏览器未打开弹窗，请使用下方观察页链接');};
function togglePause(){if(observer)return;paused=!paused;acc=0;last=performance.now();sendSnapshot();updateHud();}
$('pause').onclick=togglePause;
$('speed').onclick=()=>{speed=speed===1?2:1;sendSnapshot();updateHud();};
function restart(){if(observer)return;Object.assign(game,new Game());closeBuild();selected.clear();controlGroups.clear();lastUnitClick=null;lastRightClick=null;paused=false;speed=1;acc=0;state=game.snapshot();renderer.camera={x:25,y:32,zoom:13};setAttack(false);sendSnapshot();updateHud();toast('新行动开始');}
$('restart').onclick=restart;$('again').onclick=restart;
function stop(){if(observer)return;closeBuild();game.command([...selected],'stop');setAttack(false);toast(selected.size?'已停止移动并停火':'请先选择部队');}
for(const type of ['shield','archer'])$('train-'+type).onclick=()=>{const error=game.train(type);toast(error||`${STATS[type].name}已加入训练队列`);updateHud();};
function local(event){const rect=$('game').getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function visibleToView(e){const team=view===2?1:0;return view===1||e.team===team||state.visible[team][Math.floor(e.y)*W+Math.floor(e.x)];}
function issue(p,attack,append=false,allowMountains=false){lastUnitClick=null;if(!selected.size){toast('请先选择部队');setAttack(false);return;}const world=renderer.world(p.x,p.y);if(world.x<0||world.y<0||world.x>=W||world.y>=H){toast('请在地图范围内下达指令');return;}const target=append||allowMountains?null:game.entities().find(e=>e.team===1&&game.canSee(0,e)&&Math.hypot(e.x-world.x,e.y-world.y)<(e.building?2:1));game.command([...selected],attack?'attack':target?'attack':'move',world,target?.id,append,allowMountains);if(allowMountains)toast('本次路线允许穿越山地');else if(append)toast('已追加移动路径点');marker={...world,attack:attack||!!target,until:performance.now()+1000};setAttack(false);}
const canvas=$('game');
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(!state)return;const p=local(e);if(e.button!==2)lastRightClick=null;if(e.button===1){e.preventDefault();drag={kind:'pan',sx:p.x,sy:p.y,x:p.x,y:p.y,cx:renderer.camera.x,cy:renderer.camera.y};canvas.setPointerCapture(e.pointerId);return;}if(observer)return;if(e.button===2){
  e.preventDefault();if(buildMenu||buildType){closeBuild();updateHud();return;}const world=renderer.world(p.x,p.y),now=performance.now();
  const mountain=world.x>=0&&world.x<W&&world.y>=0&&world.y<H&&state.map.terrain[Math.floor(world.y)*W+Math.floor(world.x)]===1;
  const doubleClick=!e.shiftKey&&mountain&&selected.size>0&&lastRightClick&&now-lastRightClick.time<350&&Math.hypot(p.x-lastRightClick.x,p.y-lastRightClick.y)<6;
  issue(p,false,e.shiftKey,!!doubleClick);
  lastRightClick=!e.shiftKey&&mountain&&!doubleClick?{x:p.x,y:p.y,time:now}:null;
  return;
}if(e.button===0){if(buildType){const error=game.build([...selected],buildType,renderer.world(p.x,p.y));toast(error||(buildType==='mine'?'采矿场开始施工 · 60 秒':`${STATS[buildType].name}已建成`));if(!error)closeBuild();else previewAt(p);sendSnapshot();updateHud();return;}if(attackMode){issue(p,true);return;}drag={kind:'select',sx:p.x,sy:p.y,x:p.x,y:p.y,shift:e.shiftKey};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(buildType&&game)previewAt(local(e));if(!drag)return;const p=local(e);drag.x=p.x;drag.y=p.y;if(drag.kind==='pan'){renderer.camera.x=drag.cx-(p.x-drag.sx)/renderer.camera.zoom;renderer.camera.y=drag.cy-(p.y-drag.sy)/renderer.camera.zoom;renderer.clamp();}});
canvas.addEventListener('pointerup',e=>{if(!drag)return;if(drag.kind==='select'){
  closeBuild();if(!drag.shift)selected.clear();const click=Math.hypot(drag.x-drag.sx,drag.y-drag.sy)<5;
  const choices=state.units.filter(u=>u.team===0&&u.hp>0&&visibleToView(u));
  if(click){
    const p=renderer.world(drag.x,drag.y);
    const u=choices.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(u&&Math.hypot(u.x-p.x,u.y-p.y)<1){
      const now=performance.now();
      if(lastUnitClick?.id===u.id&&now-lastUnitClick.time<350&&Math.hypot(drag.x-lastUnitClick.x,drag.y-lastUnitClick.y)<5){
        selected=new Set(choices.filter(other=>{const s=renderer.screen(other.x,other.y);return other.type===u.type&&s.x>=0&&s.x<renderer.width&&s.y>=0&&s.y<renderer.height;}).map(other=>other.id));
        lastUnitClick=null;toast(`已选择画面内 ${selected.size} 名${STATS[u.type].name}`);
      }else{
        if(drag.shift&&selected.has(u.id))selected.delete(u.id);else selected.add(u.id);
        lastUnitClick={id:u.id,time:now,x:drag.x,y:drag.y};
      }
    }else {
      lastUnitClick=null;
      const b=state.buildings.find(b=>b.team===0&&b.hp>0&&visibleToView(b)&&Math.abs(b.x-p.x)<2&&Math.abs(b.y-p.y)<2);
      if(b){selected.clear();selectedBuilding=b.id;}
    }
  }else{
    lastUnitClick=null;
    for(const u of choices){const p=renderer.screen(u.x,u.y);if(p.x>=Math.min(drag.sx,drag.x)&&p.x<=Math.max(drag.sx,drag.x)&&p.y>=Math.min(drag.sy,drag.y)&&p.y<=Math.max(drag.sy,drag.y))selected.add(u.id);}
  }
  updateHud();
}drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{lastRightClick=null;e.preventDefault();const p=local(e);renderer.zoomAt(p.x,p.y,Math.exp(-e.deltaY*.001));},{passive:false});
$('minimap').addEventListener('pointerdown',e=>{lastRightClick=null;const r=$('minimap').getBoundingClientRect();renderer.camera.x=(e.clientX-r.left)/r.width*W;renderer.camera.y=(e.clientY-r.top)/r.height*H;renderer.clamp();});
window.addEventListener('keydown',e=>{
  lastRightClick=null;
  if(e.target.matches('input, textarea, select')||e.target.isContentEditable)return;
  const key=e.key.toLowerCase();
  if(/^[0-9]$/.test(key)&&!e.altKey&&!e.metaKey&&!e.shiftKey){
    e.preventDefault();
    if(observer||e.repeat)return;
    lastUnitClick=null;
    const living=new Set(game.units.filter(u=>u.team===0&&u.hp>0).map(u=>u.id));
    if(e.ctrlKey){
      const ids=[...selected].filter(id=>living.has(id));
      if(ids.length){controlGroups.set(key,ids);toast(`编队 ${key} 已保存 · ${ids.length} 人`);}else toast('请先选择部队再编队');
    }else{
      const ids=(controlGroups.get(key)||[]).filter(id=>living.has(id));
      controlGroups.set(key,ids);
      if(ids.length){closeBuild();selected=new Set(ids);setAttack(false);toast(`已选择编队 ${key} · ${ids.length} 人`);updateHud();}else toast(`编队 ${key} 没有存活单位`);
    }
    return;
  }
  if(key===' '){e.preventDefault();if(!e.repeat)togglePause();return;}
  if(key==='escape'){closeBuild();drag=null;updateHud();}
  if(observer||e.repeat)return;
  if(key==='b'){e.preventDefault();closeBuild();if([...selected].some(id=>game.units.some(u=>u.id===id&&u.team===0&&u.hp>0))){buildMenu=true;updateHud();}else toast('请先选择部队');}
  if(key==='a'){e.preventDefault();if(selected.size)setAttack(true);else toast('请先选择部队');}
  if(key==='s'){e.preventDefault();stop();}
});
window.addEventListener('blur',()=>{drag=null;lastUnitClick=null;lastRightClick=null;});
function updateHud(){
  if(!state)return;if(game)state=game.snapshot();
  for(const id of selected)if(!state.units.some(u=>u.id===id))selected.delete(id);
  $('food').textContent=Math.floor(state.food);$('ore').textContent=Math.floor(state.ore);$('population').textContent=`${state.units.filter(u=>u.team===0).length} / 40`;
  const seconds=Math.floor(state.time);$('clock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('pause').textContent=paused?'继续':'暂停';$('pause').classList.toggle('active',paused);$('speed').textContent=speed+'×';$('objective').textContent=`敌方营地 ${state.buildings.filter(b=>b.team===1&&b.hp>0).length} / 2`;
  const units=state.units.filter(u=>selected.has(u.id)),shields=units.filter(u=>u.type==='shield').length,archers=units.length-shields;
  $('selection-title').textContent=observer?'观察模式':units.length?'已选择部队':'未选择部队';$('selection-count').textContent=units.length;
  $('selection-info').textContent=observer?'只观察共享战局，指令请在主窗口下达。':units.length?`${shields} 盾兵 · ${archers} 弓箭兵 · ${units.filter(u=>u.holdFire).length} 停火\n总生命 ${Math.ceil(units.reduce((n,u)=>n+u.hp,0))}`:'左键拖动，框选蓝色部队。';
  const building=state.buildings.find(b=>b.id===selectedBuilding&&b.hp>0);
  if(selectedBuilding&&!building)closeBuild();
  if(buildMenu&&!units.length)closeBuild();
  if(state.result&&(buildMenu||buildType))closeBuild();
  $('building-actions').hidden=observer||(!buildMenu&&!building);
  $('build-options').hidden=!buildMenu;$('demolish').hidden=!building;
  $('demolish').disabled=!!state.result;
  $('building-title').textContent=building?STATS[building.type].name:'建造菜单 · B';
  $('building-info').textContent=building?`生命 ${Math.ceil(building.hp)} / ${building.maxHp} · ${building.type==='base'?'每秒 +3 食物、+2 矿产；可训练部队。拆除基地将判负。':building.type==='mine'?(building.constructionRemaining>0?`施工中 · 剩余 ${Math.ceil(building.constructionRemaining)} 秒，完工后每秒 +2 矿产`:'每秒 +2 矿产'):'驻守弓箭兵 · 视野 15.6 / 射程 10.4'}`:buildType?`左键放置${STATS[buildType].name}，绿色可建 / 红色不可建。`:'选择建筑后左键选址；采矿场只能建在金色矿点上。';
  if(building){$('selection-title').textContent=STATS[building.type].name;$('selection-count').textContent='1';$('selection-info').textContent='右下角可拆除建筑。';}
  for(const type of ['mine','tower'])$('build-'+type).disabled=!!state.result||state.food<STATS[type].food||state.ore<STATS[type].ore;
  $('queue').textContent=state.queue.length?`训练 ${STATS[state.queue[0].type].name} · ${Math.max(0,state.queue[0].remaining).toFixed(1)} 秒 ｜ 排队 ${state.queue.length} 人`:'训练队列为空';
  $('result').hidden=!state.result;if(state.result){$('result-title').textContent=state.result==='victory'?'敌营已摧毁':'基地已失守';$('result-copy').textContent=state.result==='victory'?'两座敌营已摧毁，本次行动胜利。':'调整阵型，保护弓箭兵，再试一次。';}
  $('zoom-label').textContent=Math.round(renderer.camera.zoom/13*100)+'%';
}
// Simulation uses a timer so an observer can remain foreground while the host is hidden.
setInterval(()=>{const now=performance.now();if(observer&&now-lastHello>=1000){channel.postMessage(receiver.message());lastHello=now;}const elapsed=Math.min((now-last)/1000,1);last=now;if(game){if(!paused&&!game.result){acc+=elapsed*speed;let steps=0;while(acc>=.05&&steps++<40){game.step(.05);acc-=.05;}}else acc=0;state=game.snapshot();if(now-lastSnapshot>=100){sendSnapshot();lastSnapshot=now;}}else if(now-lastReceived>3000){$('connection').hidden=false;$('connection').textContent=lastReceived?'主窗口未响应，请保持主窗口打开。':'等待主窗口的战局数据…';}if(now-lastHud>=150){updateHud();lastHud=now;}},50);
const frameInterval=1000/120;
let lastFrame=null;
function frame(now){
  const elapsed=lastFrame===null?frameInterval:now-lastFrame;
  if(elapsed>=frameInterval-.001){
    if(state)renderer.draw(state,view,selected,drag,marker,selectedBuilding,buildPreview);
    // Preserve the remainder without replaying frames after a slow or hidden tab.
    lastFrame=now-Math.max(0,elapsed-Math.floor((elapsed+.001)/frameInterval)*frameInterval);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);updateHud();if(!observer)toast('框选蓝色部队，按 A 后点击目的地。');
