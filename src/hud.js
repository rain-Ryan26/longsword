import {STATS,TECHNOLOGIES,usedPop} from './data.js';
import {TRAIN_QUEUE_LIMIT,TRAINABLE_TYPES,BUILDING_TYPES,productionType,trainingPlan,researchError,foodRate} from './rules.js';
const UNIT_ICONS={shield:'🛡',ironShield:'🛡️',archer:'🏹',crossbow:'🎯',armoredCar:'',steamWalker:'',wilddog:'🐕',pigeon:'🕊'};
export function createHud({$,observer,renderer}){
function renderTrainingQueue(queue,state){
  const root=$('base-queue'),signature=queue.map(q=>productionType(q.type,state.technologies)).join(',');
  if(root.dataset.queueSignature===signature){const time=root.querySelector('.queue-time');if(time)time.textContent=`${Math.max(0,Math.ceil(queue[0].remaining))}s`;return;}
  root.dataset.queueSignature=signature;root.replaceChildren();
  if(!queue.length){root.textContent='队列为空';return;}
  queue.forEach((q,index)=>{
    const type=productionType(q.type,state.technologies);
    const button=document.createElement('button');button.type='button';button.className='queue-unit';button.dataset.queueIndex=index;
    button.setAttribute('aria-label',`取消训练${STATS[type].name}，全额退款`);button.title=`取消训练${STATS[type].name}并全额退款`;
    const icon=document.createElement('span');icon.className=`unit-icon${STATS[type].machine?` machine-icon ${type}-icon`:''}`;icon.setAttribute('aria-hidden','true');icon.textContent=UNIT_ICONS[type];
    const position=document.createElement('span');position.className='queue-position';position.textContent=index+1;
    button.append(icon,position);
    if(index===0){const time=document.createElement('span');time.className='queue-time';time.textContent=`${Math.max(0,Math.ceil(q.remaining))}s`;button.append(time);}
    root.append(button);
  });
}
function update({state,selected,view,paused,speed,level,interaction}){
  const {selectedBuilding,buildMenu,buildType,techMenu}=interaction;
  $('food').textContent=Math.floor(state.food);$('ore').textContent=Math.floor(state.ore);$('population').textContent=`${usedPop(state.units,0)} / ${state.popCap}`;
  const botView=view===2;$('bot-resources').hidden=!botView;if(botView){$('bot-food').textContent=Math.floor(state.aiFood);$('bot-ore').textContent=Math.floor(state.aiOre);$('bot-population').textContent=usedPop(state.units,1);}
  const seconds=Math.floor(state.time);$('clock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('pause').textContent=paused?'继续':'暂停';$('pause').classList.toggle('active',paused);$('speed').textContent=speed+'×';
  $('launch-attack').hidden=observer||state.level!=='defend'||state.defense.wave!==0;
  const units=state.units.filter(u=>selected.has(u.id)),counts={};for(const u of units)counts[STATS[u.type].name]=(counts[STATS[u.type].name]||0)+1;
  const label=Object.entries(counts).map(([name,count])=>`${count} ${name}`).join(' · ');
  $('selection-title').textContent=observer?'观察模式':units.length?'已选择部队':'未选择部队';$('selection-count').textContent=units.length;
  $('selection-info').textContent=observer?'只观察共享战局，指令请在主窗口下达。':units.length?`${label} · ${units.filter(u=>u.holdFire).length} 停火\n总生命 ${Math.ceil(units.reduce((n,u)=>n+u.hp,0))}`:'左键拖动，框选蓝色部队。';
  const building=state.buildings.find(b=>b.id===selectedBuilding&&b.hp>0);
  $('building-actions').hidden=observer||(!buildMenu&&!building&&!techMenu);
  $('build-options').hidden=!buildMenu;$('technology-panel').hidden=!techMenu;$('demolish').hidden=!building||techMenu;
  $('demolish').disabled=!!state.result;
  const readyProducer=building&&!building.constructionPending&&['base','machineFactory'].includes(building.type);
  $('base-training').hidden=observer||techMenu||!readyProducer||building.type!=='base';
  $('machine-training').hidden=observer||techMenu||!readyProducer||building.type!=='machineFactory';
  $('production-queue').hidden=observer||techMenu||!readyProducer;
  const baseQueue=readyProducer?state.queue.filter(q=>q.baseId===building.id):[];
  $('base-queue-count').textContent=`${baseQueue.length} / ${TRAIN_QUEUE_LIMIT}`;
  renderTrainingQueue(baseQueue,state);
  for(const type of TRAINABLE_TYPES){
    const button=$('base-train-'+type);
    const error=readyProducer?trainingPlan(state,type,building.id).error:'请选择已完工的生产建筑';
    button.disabled=!!error;
    button.title=error||'';
  }
  const shieldType=productionType('shield',state.technologies),archerType=productionType('archer',state.technologies);
  $('base-train-shield').querySelector('span:last-child').textContent=`训练${STATS[shieldType].name} · ${STATS.shield.food} 食物 / ${STATS.shield.ore} 矿`;
  $('base-train-archer').querySelector('span:last-child').textContent=`训练${STATS[archerType].name} · ${STATS.archer.food} 食物 / ${STATS.archer.ore} 矿`;
  for(const [id,s] of Object.entries(TECHNOLOGIES)){
    const tech=state.technologies[id],button=$('research-'+id),status=tech.status==='complete'?'已完成':tech.status==='researching'?`研发中 · ${Math.ceil(tech.remaining)} 秒`:`${s.food} 食物 / ${s.ore} 矿 · ${s.researchTime} 秒`;
    const unlock={castIron:'解锁装甲车',artillery:'蒸汽步行机前置',steamCore:'蒸汽步行机前置',compositeShield:'盾兵升级为铁盾兵',precisionBolts:'弓箭兵升级为强弩兵'}[id];
    button.textContent=`${s.name}（${unlock}）· ${status}`;button.disabled=!!researchError(state,id);
  }

  $('building-title').textContent=techMenu?'科技研发 · R':building?STATS[building.type].name:'建造菜单 · B';
  $('building-info').textContent=techMenu?'机械与部队科技均可并行研发；开始即扣除资源。':building?`生命 ${Math.ceil(building.hp)} / ${building.maxHp} · 护甲 ${STATS[building.type].armor} · ${building.awaitingEviction?'等待区域内部队离开，随后自动施工':building.constructionPending?(building.activeBuilders?`施工 ${building.activeBuilders} 人 · 预计剩余 ${Math.ceil(building.constructionRemaining/building.activeBuilders)} 秒`:'等待施工人员到场 · 可选中部队右键补派'):building.type==='base'?`不产资源；${STATS.base.healRange} 格内最多治疗 ${STATS.base.healTargets} 人，每人每秒 +${STATS.base.healRate} 生命。${['attack','defend','demo'].includes(state.level)?`本关固定 ${state.popCap} 人口。`:`提供 ${STATS.base.pop} 人口。`}按 Y 设置集结点${building.rallyPoint?` · 当前 ${building.rallyPoint.x.toFixed(1)}, ${building.rallyPoint.y.toFixed(1)}`:''}。`:building.type==='machineFactory'?`生产机械单位。按 Y 设置集结点${building.rallyPoint?` · 当前 ${building.rallyPoint.x.toFixed(1)}, ${building.rallyPoint.y.toFixed(1)}`:''}。`:building.type==='mine'?'每秒 +5 矿产':building.type==='factory'?`每秒 +${foodRate(state.map,building)===6?'6 食物（食物点 ×2）':'3 食物'}`:`驻守弓箭兵 · 视野 ${STATS.tower.vision} / 射程 ${STATS.tower.range}`}`:buildType?`左键放置${STATS[buildType].name}，绿色可建 / 红色不可建。`:'C 基地 / R 采矿场 / Q 哨塔 / F 食物厂 / M 机械工厂。';
  if(building){$('selection-title').textContent=STATS[building.type].name;$('selection-count').textContent='1';$('selection-info').textContent='侧栏面板可拆除建筑。';}
  for(const type of BUILDING_TYPES)$('build-'+type).disabled=!!state.result||state.food<STATS[type].food||state.ore<STATS[type].ore;
  $('result').hidden=!state.result;if(state.result){
    const copy={balanced:['敌建筑全毁','敌方全部建筑已摧毁，均衡对抗胜利。','保护经济建筑，集结部队后再出击。'],demo:['敌营已摧毁','两座敌营已摧毁，本次行动胜利。','调整阵型，保护弓箭兵，再试一次。'],attack:['敌建筑全毁','敌方建筑全部摧毁，进攻胜利。','敌军防守严密，尝试先削弱其经济或集火逐个击破。'],defend:['防线守住了','两波敌军已全部消灭，我方仍有建筑存活。','防线被突破，试试哨塔与弓箭兵配合。']}[state.level||level];
    $('result-title').textContent=state.result==='victory'?copy[0]:(['defend','balanced'].includes(state.level)?'我方建筑全毁':'基地已失守');$('result-copy').textContent=state.result==='victory'?copy[1]:copy[2];}
  $('zoom-label').textContent=Math.round(renderer.camera.zoom/13*100)+'%';
}
  return {update};
}
