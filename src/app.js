import {startNextDefenseWave} from './defense.js';
import {bindInput} from './input.js';
import {ControlGroups} from './selection.js';
import {LEVELS} from './levels.js';
import {InteractionState} from './interaction.js';
import {createHud} from './hud.js';
import {TRAINABLE_TYPES,BUILDING_TYPES} from './rules.js';
import {Game} from './core.js';
import {Renderer} from './renderer.js';
import {SnapshotHost,SnapshotReceiver} from './sync.js';
import {STATS,TECHNOLOGIES,W,H} from './data.js';
import {AudioManager} from './audio.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),observer=params.has('observe');
const session=params.get('session')||crypto.randomUUID();
if(!params.has('session')){params.set('session',session);history.replaceState(null,'',`?${params}`);}
const channel=new BroadcastChannel(`longsword-${session}`),game=observer?null:new Game('demo');
let level='demo';
const host=observer?null:new SnapshotHost(message=>channel.postMessage(message),crypto.randomUUID());
const receiver=observer?new SnapshotReceiver(crypto.randomUUID()):null;
let lastHello=-Infinity;
const controlGroups=new ControlGroups();
let aiControl=false;
let lastUnitClick=null,lastRightClick=null;
const interaction=new InteractionState();
let state=game?.snapshot(),selected=new Set(),view=observer?1:0,drag=null,marker=null,paused=false,speed=1,last=performance.now(),acc=0,lastSnapshot=0,lastReceived=0,lastHud=0,toastTimer,missionIntroTimer,headerTimer;
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
function selectingLevel(){return !observer&&!$('level-select').hidden;}
function sendSnapshot(){if(game)host.publish(game.snapshot(),paused||selectingLevel(),speed,performance.now());}
channel.onmessage=event=>{
  const msg=event.data;
  if(observer&&msg.type==='state'&&msg.to===receiver.id){
    if(!receiver.receive(msg)){channel.postMessage(receiver.message());return;}
    const changed=state?.map!==receiver.state.map;state=receiver.state;if(changed){renderer.camera={x:state.map.width/2,y:state.map.height/2,zoom:Math.max(5,Math.min(renderer.width/state.map.width,renderer.height/state.map.height)*.88)};level=state.level;applyLevel();}paused=msg.paused;speed=msg.speed;lastReceived=performance.now();$('connection').hidden=true;
    channel.postMessage(receiver.message('ack'));
  }else if(!observer&&host.receive(msg,performance.now()))sendSnapshot();
};
window.addEventListener('pagehide',()=>{if(receiver)channel.postMessage(receiver.message('bye'));});
if(observer){document.title='longsword · 独立观察';$('connection').hidden=false;for(const id of ['pause','speed','restart','again'])$(id).disabled=true;$('level-select').hidden=true;channel.postMessage(receiver.message());setAttack(false);}
function togglePause(){if(observer||selectingLevel())return;paused=!paused;acc=0;last=performance.now();sendSnapshot();updateHud();}
$('pause').onclick=togglePause;
$('speed').onclick=()=>{if(observer||selectingLevel())return;speed=speed===1?2:speed===2?4:1;sendSnapshot();updateHud();};
$('ai-control').onclick=()=>{
  if(observer)return;
  aiControl=!aiControl;
  game.setPlayerAIControl(aiControl);
  $('ai-control').classList.toggle('active',aiControl);
  $('ai-control').textContent=aiControl?'AI 控制 · 开':'AI 控制';
  toast(aiControl?'AI 托管已开启：AI 接管经济与部队':'已关闭 AI 托管');
};
$('launch-attack').onclick=()=>{
  if(observer||!startNextDefenseWave(game))return;
  toast('已立即开启进攻，敌军将马上出动！');
  sendSnapshot();updateHud();
};
$('ai-control').hidden=observer||level!=='balanced';
function resetHeader(){clearTimeout(headerTimer);document.querySelector('header').classList.remove('compact');}
function applyLevel(){resetHeader();headerTimer=setTimeout(()=>document.querySelector('header').classList.add('compact'),5000);const info=LEVELS[level],intro=$('mission-intro');$('mission-title').textContent=info.title;$('mission-desc').textContent=info.desc;clearTimeout(missionIntroTimer);intro.classList.remove('hidden');missionIntroTimer=setTimeout(()=>intro.classList.add('hidden'),3000);$('ai-control').hidden=observer||level!=='balanced';}
function restart(){if(observer||selectingLevel())return;Object.assign(game,new Game(level));closeBuild();selected.clear();controlGroups.clear();lastUnitClick=null;lastRightClick=null;aiControl=false;$('ai-control').classList.remove('active');$('ai-control').textContent='AI 控制';game.setPlayerAIControl(false);paused=false;speed=1;acc=0;last=performance.now();state=game.snapshot();renderer.camera=['balanced','attack'].includes(level)?{x:24,y:66,zoom:13}:{x:25,y:32,zoom:13};setAttack(false);applyLevel();sendSnapshot();updateHud();toast('新行动开始');}
$('restart').onclick=restart;$('again').onclick=restart;
$('choose-level').onclick=()=>{if(observer)return;$('level-select').hidden=false;resetHeader();acc=0;last=performance.now();closeBuild();drag=null;clearTimeout(missionIntroTimer);clearTimeout(toastTimer);$('toast').classList.remove('visible');sendSnapshot();updateHud();};
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
bindInput({
  game,observer,renderer,interaction,$,toast,closeBuild,setAttack,renderMode,updateHud,
  sendSnapshot,previewAt,enterRallyMode,togglePause,settingsPanel,setSettings,controlGroups,
  get selectingLevel(){return selectingLevel();},
  get view(){return view;},
  get state(){return state;},set state(value){state=value;},
  get selected(){return selected;},set selected(value){selected=value;},
  get drag(){return drag;},set drag(value){drag=value;},
  get marker(){return marker;},set marker(value){marker=value;},
  get lastUnitClick(){return lastUnitClick;},set lastUnitClick(value){lastUnitClick=value;},
  get lastRightClick(){return lastRightClick;},set lastRightClick(value){lastRightClick=value;},
});
const hud=createHud({$,observer,renderer});
function updateHud(){
  if(!state)return;
  if(game)state=game.snapshot();
  const living=new Set(state.units.filter(u=>u.hp>0&&!u.garrisonId).map(u=>u.id));
  for(const id of selected)if(!living.has(id))selected.delete(id);
  const building=state.buildings.find(b=>b.id===interaction.selectedBuilding&&b.hp>0);
  if((interaction.selectedBuilding&&!building)||(interaction.buildMenu&&!selected.size)||
    (state.result&&interaction.mode!=='select'))closeBuild();
  hud.update({state,selected,view,paused,speed,level,interaction});
  for(const id of ['pause','speed','restart'])$(id).disabled=observer||selectingLevel();
  if(selectingLevel())$('launch-attack').hidden=true;
}
// Simulation uses a timer so an observer can remain foreground while the host is hidden.
setInterval(()=>{const now=performance.now();if(observer&&now-lastHello>=1000){channel.postMessage(receiver.message());lastHello=now;}const elapsed=Math.min((now-last)/1000,1);last=now;if(game){if(!selectingLevel()&&!paused&&!game.result){acc+=elapsed*speed;let steps=0;while(acc>=.05&&steps++<40){game.step(.05);acc-=.05;}for(const event of game.consumeAudioEvents())audio.play(event);}else acc=0;state=game.snapshot();if(now-lastSnapshot>=100){sendSnapshot();lastSnapshot=now;}}else if(now-lastReceived>3000){$('connection').hidden=false;$('connection').textContent=lastReceived?'主窗口未响应，请保持主窗口打开。':'等待主窗口的战局数据…';}if(now-lastHud>=150){updateHud();lastHud=now;}},50);
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
requestAnimationFrame(frame);updateHud();
