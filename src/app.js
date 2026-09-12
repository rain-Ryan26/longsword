import {LEVELS} from './levels.js';
import {InteractionState} from './interaction.js';
import {createHud} from './hud.js';
import {TRAINABLE_TYPES,BUILDING_TYPES} from './rules.js';
import {Game} from './core.js';
import {Renderer} from './renderer.js';
import {SnapshotHost,SnapshotReceiver} from './sync.js';
import {STATS,TECHNOLOGIES,W,H,isSlowTerrain} from './data.js';
import {AudioManager} from './audio.js';
const $=id=>document.getElementById(id);
const isOffensiveMovableUnit=u=>u.team===0&&u.hp>0&&u.type!=='pigeon'&&STATS[u.type]?.movable===true&&STATS[u.type].damage>0;
const params=new URLSearchParams(location.search),observer=params.has('observe');
const session=params.get('session')||crypto.randomUUID();
if(!params.has('session')){params.set('session',session);history.replaceState(null,'',`?${params}`);}
const channel=new BroadcastChannel(`longsword-${session}`),game=observer?null:new Game('demo');
let level='demo';
const host=observer?null:new SnapshotHost(message=>channel.postMessage(message),crypto.randomUUID());
const receiver=observer?new SnapshotReceiver(crypto.randomUUID()):null;
let lastHello=-Infinity;
const controlGroups=new Map();
let aiControl=false;
let lastUnitClick=null,lastRightClick=null;
const interaction=new InteractionState();
let state=game?.snapshot(),selected=new Set(),view=observer?1:0,drag=null,marker=null,paused=false,speed=1,last=performance.now(),acc=0,lastSnapshot=0,lastReceived=0,lastHud=0,toastTimer,missionIntroTimer;
const renderer=new Renderer($('game'),$('minimap'));renderer.resize();if(observer)renderer.camera={x:W/2,y:H/2,zoom:Math.max(5,Math.min(renderer.width/W,renderer.height/H)*.88)};$('perspective').value=view;
const audio=new AudioManager(),settingsPanel=$('settings-panel');
function syncAudioSettings(){const {master,effects,muted}=audio.settings;$('master-volume').value=master;$('effects-volume').value=effects;$('sound-muted').checked=muted;$('master-volume-value').textContent=`${master}%`;$('effects-volume-value').textContent=`${effects}%`;}
function setSettings(open){settingsPanel.hidden=!open;$('settings').setAttribute('aria-expanded',String(open));if(open)$('master-volume').focus();else $('settings').focus();}
$('settings').onclick=()=>setSettings(true);$('settings-close').onclick=()=>setSettings(false);
for(const id of ['master-volume','effects-volume'])$(id).addEventListener('input',()=>{audio.save({[id==='master-volume'?'master':'effects']:Number($(id).value)});syncAudioSettings();});
$('sound-muted').addEventListener('change',()=>{audio.save({muted:$('sound-muted').checked});syncAudioSettings();});
$('test-cannon-sound').onclick=()=>{audio.unlock();audio.play('cannonFire');};syncAudioSettings();
for(const type of BUILDING_TYPES)$(`build-${type}`).textContent=`${STATS[type].name} [${{base:'C',mine:'R',tower:'Q',factory:'F',machineFactory:'M'}[type]}] · ${STATS[type].ore} 矿 / ${STATS[type].food} 食物`;
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function renderMode(){
  const {cursor,hint}=interaction.presentation(observer,STATS[interaction.buildType]?.name);
  $('game').style.cursor=cursor;$('mode-hint').textContent=hint;
}
function setAttack(on){
  if(on)interaction.enter('attack');
  else if(interaction.attackMode)interaction.enter('select');
  renderMode();
}
function closeBuild(){interaction.enter('select');renderMode();}
function enterRallyMode(){
  const producer=game.buildings.find(b=>b.id===interaction.selectedBuilding&&b.team===0&&['base','machineFactory'].includes(b.type)&&b.hp>0&&!b.constructionPending);
  if(!producer){toast('请先选中己方已完工基地或机械工厂');return;}
  interaction.enter('rally',{buildingId:producer.id});renderMode();
}
function previewAt(p){
  const placement=game.placement(interaction.buildType,renderer.world(p.x,p.y)),s=STATS[interaction.buildType];
  interaction.buildPreview={...placement,halfSize:s.halfSize||2,error:placement.error||(game.food<s.food||game.ore<s.ore?'资源不足':null),evict:!placement.error&&placement.evict};
}
$('cancel-build').onclick=()=>{closeBuild();updateHud();};
for(const type of BUILDING_TYPES)$('build-'+type).onclick=()=>{
  if(observer)return;interaction.enter('place',{type});renderMode();
  updateHud();
};
$('demolish').onclick=()=>{if(observer)return;const error=game.demolish(interaction.selectedBuilding);toast(error||'建筑已拆除，不退还资源');if(!error)closeBuild();sendSnapshot();updateHud();};
function syncView(){lastRightClick=null;view=Number($('perspective').value);$('view-name').textContent=['玩家视角','全局视角','BOT 视角'][view];}
$('perspective').addEventListener('input',syncView);syncView();
function sendSnapshot(){if(game)host.publish(game.snapshot(),paused,speed,performance.now());}
channel.onmessage=event=>{
  const msg=event.data;
  if(observer&&msg.type==='state'&&msg.to===receiver.id){
    if(!receiver.receive(msg)){channel.postMessage(receiver.message());return;}
    const changed=state?.map!==receiver.state.map;state=receiver.state;if(changed){renderer.camera={x:state.map.width/2,y:state.map.height/2,zoom:Math.max(5,Math.min(renderer.width/state.map.width,renderer.height/state.map.height)*.88)};level=state.level;applyLevel();}paused=msg.paused;speed=msg.speed;lastReceived=performance.now();$('connection').hidden=true;
    channel.postMessage(receiver.message('ack'));
  }else if(!observer&&host.receive(msg,performance.now()))sendSnapshot();
};
window.addEventListener('pagehide',()=>{if(receiver)channel.postMessage(receiver.message('bye'));});
if(observer){document.title='longsword · 独立观察';$('session-label').textContent='独立观察 · 共享战局';$('connection').hidden=false;for(const id of ['pause','speed','restart','again'])$(id).disabled=true;$('level-select').hidden=true;channel.postMessage(receiver.message());setAttack(false);}
function togglePause(){if(observer)return;paused=!paused;acc=0;last=performance.now();sendSnapshot();updateHud();}
$('pause').onclick=togglePause;
$('speed').onclick=()=>{speed=speed===1?2:1;sendSnapshot();updateHud();};
$('ai-control').onclick=()=>{
  if(observer)return;
  aiControl=!aiControl;
  game.setPlayerAIControl(aiControl);
  $('ai-control').classList.toggle('active',aiControl);
  $('ai-control').textContent=aiControl?'AI 控制 · 开':'AI 控制';
  toast(aiControl?'AI 托管已开启：AI 接管经济与部队':'已关闭 AI 托管');
};
$('launch-attack').onclick=()=>{
  if(observer||game.defense.wave!==0)return;
  game.defense.nextWaveAt=game.time;
  toast('已立即开启进攻，敌军将马上出动！');
  sendSnapshot();updateHud();
};
$('ai-control').hidden=observer||level!=='balanced';
function applyLevel(){const info=LEVELS[level],intro=$('mission-intro');$('mission-title').textContent=info.title;$('mission-desc').textContent=info.desc;clearTimeout(missionIntroTimer);intro.classList.remove('hidden');missionIntroTimer=setTimeout(()=>intro.classList.add('hidden'),3000);$('ai-control').hidden=observer||level!=='balanced';}
function restart(){if(observer)return;Object.assign(game,new Game(level));closeBuild();selected.clear();controlGroups.clear();lastUnitClick=null;lastRightClick=null;aiControl=false;$('ai-control').classList.remove('active');$('ai-control').textContent='AI 控制';game.setPlayerAIControl(false);paused=false;speed=1;acc=0;state=game.snapshot();renderer.camera=level==='balanced'?{x:24,y:66,zoom:13}:{x:25,y:32,zoom:13};setAttack(false);applyLevel();sendSnapshot();updateHud();toast('新行动开始');}
$('restart').onclick=restart;$('again').onclick=restart;
$('choose-level').onclick=()=>{if(observer)return;$('level-select').hidden=false;};
for(const card of document.querySelectorAll('.level-card'))card.onclick=()=>{
  if(observer)return;level=card.dataset.level;$('level-select').hidden=true;restart();toast(LEVELS[level].toast);
};
function stop(){if(observer)return;closeBuild();game.command([...selected],'stop');setAttack(false);toast(selected.size?'已停火':'请先选择部队');}
for(const type of TRAINABLE_TYPES)$('base-train-'+type).onclick=()=>{
  if(observer)return;
  const produced=game.productionType(type),error=game.train(type,interaction.selectedBuilding);toast(error||`${STATS[produced].name}已加入所选基地训练队列`);updateHud();
};
for(const id of Object.keys(TECHNOLOGIES))$('research-'+id).onclick=()=>{
  if(observer)return;const error=game.research(id);toast(error||`${TECHNOLOGIES[id].name}已开始研发`);sendSnapshot();updateHud();
};
$('base-queue').addEventListener('click',event=>{
  const button=event.target.closest('.queue-unit');if(!button||observer)return;
  const index=Number(button.dataset.queueIndex),entry=game.queue.filter(q=>q.baseId===interaction.selectedBuilding)[index];
  const error=game.cancelTraining(interaction.selectedBuilding,index);
  toast(error||`已取消${STATS[game.productionType(entry.type)].name}训练并全额退款`);if(!error)sendSnapshot();updateHud();
});
function local(event){const rect=$('game').getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function visibleToView(e){const team=view===2?1:0;return view===1||e.team===team||state.visible[team][Math.floor(e.y)*state.map.width+Math.floor(e.x)];}
function issue(p,attack,append=false,allowMountains=false,groundOnly=false){
  lastUnitClick=null;
  if(!selected.size){toast('请先选择部队');setAttack(false);return;}
  const ids=[...selected].filter(id=>!groundOnly||!STATS[game.units.find(u=>u.id===id)?.type]?.air);
  if(!ids.length){setAttack(false);return;}
  const world=renderer.world(p.x,p.y);
  if(world.x<0||world.y<0||world.x>=state.map.width||world.y>=state.map.height){toast('请在地图范围内下达指令');return;}
  const site=!attack&&!append&&!allowMountains&&game.buildings.find(b=>b.team===0&&b.hp>0&&b.constructionPending&&Math.abs(b.x-world.x)<(STATS[b.type].halfSize||2)&&Math.abs(b.y-world.y)<(STATS[b.type].halfSize||2));
  if(site){const airIds=ids.filter(id=>STATS[game.units.find(u=>u.id===id)?.type]?.air),builders=ids.filter(id=>!airIds.includes(id));if(airIds.length)game.command(airIds,'move',world);if(builders.length)toast(game.assistBuild(builders,site.id)||'已派遣部队前往施工');setAttack(false);updateHud();return;}
  const target=append||allowMountains?null:game.entities().find(e=>e.team===1&&game.canSee(0,e)&&Math.hypot(e.x-world.x,e.y-world.y)<(e.building?(STATS[e.type].halfSize||2):1));
  game.command(ids,attack?'attack':target?'attack':'move',world,target?.id,append,allowMountains);
  if(allowMountains)toast('本次路线允许穿越山地/森林');else if(append)toast('已追加移动路径点');
  marker={...world,attack:attack||!!target,until:performance.now()+1000};setAttack(false);
}
const canvas=$('game');
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(!state)return;const p=local(e);if(e.button!==2)lastRightClick=null;if(e.button===1){e.preventDefault();drag={kind:'pan',sx:p.x,sy:p.y,x:p.x,y:p.y,cx:renderer.camera.x,cy:renderer.camera.y};canvas.setPointerCapture(e.pointerId);return;}if(observer)return;if(e.button===2){
  e.preventDefault();if(interaction.buildMenu||interaction.buildType||interaction.rallyBaseId){closeBuild();updateHud();return;}const world=renderer.world(p.x,p.y),now=performance.now();
  const slowTerrain=world.x>=0&&world.x<state.map.width&&world.y>=0&&world.y<state.map.height&&isSlowTerrain(state.map.terrain[Math.floor(world.y)*state.map.width+Math.floor(world.x)]);
  const doubleClick=!e.shiftKey&&selected.size>0&&lastRightClick&&now-lastRightClick.time<350&&Math.hypot(p.x-lastRightClick.x,p.y-lastRightClick.y)<6;
  const inMap=world.x>=0&&world.x<state.map.width&&world.y>=0&&world.y<state.map.height;
  const flyingBefore=game.units.filter(u=>selected.has(u.id)&&game.isFlying(u)).map(u=>u.id);
  if(doubleClick&&inMap)game.toggleFlight(flyingBefore.filter(id=>lastRightClick.flyingIds.includes(id)),world);
  issue(p,false,e.shiftKey,!!doubleClick&&slowTerrain,!!doubleClick);
  lastRightClick=!e.shiftKey&&inMap&&!doubleClick?{x:p.x,y:p.y,time:now,flyingIds:flyingBefore}:null;
  return;
}if(e.button===0){if(interaction.rallyBaseId){const error=game.setRallyPoint(interaction.rallyBaseId,renderer.world(p.x,p.y));toast(error||'集结点已设置');if(!error){interaction.enter('select',{buildingId:interaction.selectedBuilding});renderMode();}sendSnapshot();updateHud();return;}if(interaction.buildType){const evict=!!interaction.buildPreview?.evict;const error=game.build([...selected],interaction.buildType,renderer.world(p.x,p.y));toast(error||(evict?'区域内单位将自动让位，随后开始施工':`已派遣最多 ${STATS[interaction.buildType].maxBuilders||4} 名选中部队前往施工`));if(!error)closeBuild();else previewAt(p);sendSnapshot();updateHud();return;}if(interaction.attackMode){issue(p,true);return;}drag={kind:'select',sx:p.x,sy:p.y,x:p.x,y:p.y,shift:e.shiftKey};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(interaction.buildType&&game)previewAt(local(e));if(!drag)return;const p=local(e);drag.x=p.x;drag.y=p.y;if(drag.kind==='pan'){renderer.camera.x=drag.cx-(p.x-drag.sx)/renderer.camera.zoom;renderer.camera.y=drag.cy-(p.y-drag.sy)/renderer.camera.zoom;renderer.clamp();}});
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
      const b=state.buildings.find(b=>b.team===0&&b.hp>0&&visibleToView(b)&&Math.abs(b.x-p.x)<(STATS[b.type].halfSize||2)&&Math.abs(b.y-p.y)<(STATS[b.type].halfSize||2));
      if(b){selected.clear();interaction.enter('select',{buildingId:b.id});renderMode();}
    }
  }else{
    lastUnitClick=null;
    for(const u of choices){const p=renderer.screen(u.x,u.y);if(p.x>=Math.min(drag.sx,drag.x)&&p.x<=Math.max(drag.sx,drag.x)&&p.y>=Math.min(drag.sy,drag.y)&&p.y<=Math.max(drag.sy,drag.y))selected.add(u.id);}
  }
  updateHud();
}drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{lastRightClick=null;e.preventDefault();const p=local(e);renderer.zoomAt(p.x,p.y,Math.exp(-e.deltaY*.001));},{passive:false});
$('minimap').addEventListener('pointerdown',e=>{lastRightClick=null;const r=$('minimap').getBoundingClientRect();if(!state)return;renderer.camera.x=(e.clientX-r.left)/r.width*state.map.width;renderer.camera.y=(e.clientY-r.top)/r.height*state.map.height;renderer.clamp();});
window.addEventListener('keydown',e=>{
  lastRightClick=null;
  if(e.key==='Escape'&&!settingsPanel.hidden){e.preventDefault();setSettings(false);return;}
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
  if(key==='f2'){
    e.preventDefault();
    if(observer||e.repeat)return;
    closeBuild();lastUnitClick=null;
    selected=new Set(game.units.filter(isOffensiveMovableUnit).map(u=>u.id));
    toast(selected.size?`已选择全部进攻单位 · ${selected.size} 人`:'没有可选择的进攻单位');
    updateHud();return;
  }
  if(key==='escape'){closeBuild();drag=null;updateHud();}
  if(observer||e.repeat)return;
  if(interaction.buildMenu&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&['c','r','q','f','m'].includes(key)){
    e.preventDefault();const type={c:'base',r:'mine',q:'tower',f:'factory',m:'machineFactory'}[key];
    if(game.result)return;
    if(game.food<STATS[type].food||game.ore<STATS[type].ore){toast('资源不足');return;}
    $('build-'+type).click();return;
  }
  if(key==='b'){e.preventDefault();closeBuild();if([...selected].some(id=>game.units.some(u=>u.id===id&&u.team===0&&u.hp>0))){interaction.enter('build');renderMode();updateHud();}else toast('请先选择部队');}
  if(key==='r'){
    const base=game.buildings.find(b=>b.id===interaction.selectedBuilding&&b.team===0&&b.type==='base'&&b.hp>0);
    if(!selected.size&&(!interaction.selectedBuilding||base)){
      e.preventDefault();interaction.enter(interaction.techMenu?'select':'technology',{buildingId:interaction.selectedBuilding});renderMode();updateHud();
    }
  }
  if(key==='y'){e.preventDefault();enterRallyMode();}
  if(key==='a'){e.preventDefault();if(selected.size)setAttack(true);else toast('请先选择部队');}
  if(key==='s'){e.preventDefault();stop();}
});
window.addEventListener('blur',()=>{drag=null;lastUnitClick=null;lastRightClick=null;});
const hud=createHud({$,observer,renderer});
function updateHud(){
  if(!state)return;
  if(game)state=game.snapshot();
  const living=new Set(state.units.map(u=>u.id));
  for(const id of selected)if(!living.has(id))selected.delete(id);
  const building=state.buildings.find(b=>b.id===interaction.selectedBuilding&&b.hp>0);
  if((interaction.selectedBuilding&&!building)||(interaction.buildMenu&&!selected.size)||
    (state.result&&interaction.mode!=='select'))closeBuild();
  hud.update({state,selected,view,paused,speed,level,interaction});
}
// Simulation uses a timer so an observer can remain foreground while the host is hidden.
setInterval(()=>{const now=performance.now();if(observer&&now-lastHello>=1000){channel.postMessage(receiver.message());lastHello=now;}const elapsed=Math.min((now-last)/1000,1);last=now;if(game){if(!paused&&!game.result){acc+=elapsed*speed;let steps=0;while(acc>=.05&&steps++<40){game.step(.05);acc-=.05;}for(const event of game.consumeAudioEvents())audio.play(event);}else acc=0;state=game.snapshot();if(now-lastSnapshot>=100){sendSnapshot();lastSnapshot=now;}}else if(now-lastReceived>3000){$('connection').hidden=false;$('connection').textContent=lastReceived?'主窗口未响应，请保持主窗口打开。':'等待主窗口的战局数据…';}if(now-lastHud>=150){updateHud();lastHud=now;}},50);
const frameInterval=1000/120;
let lastFrame=null;
function frame(now){
  const elapsed=lastFrame===null?frameInterval:now-lastFrame;
  if(elapsed>=frameInterval-.001){
    if(state)renderer.draw(state,view,selected,drag,marker,interaction.selectedBuilding,interaction.buildPreview);
    // Preserve the remainder without replaying frames after a slow or hidden tab.
    lastFrame=now-Math.max(0,elapsed-Math.floor((elapsed+.001)/frameInterval)*frameInterval);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);updateHud();if(!observer)toast('框选蓝色部队，按 A 后点击目的地。');
