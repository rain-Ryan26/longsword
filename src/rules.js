import {STATS,TECHNOLOGIES,usedPop} from './data.js';
import {coversCell} from './pathfinding.js';

export const TRAIN_QUEUE_LIMIT=50;
export const TRAINABLE_TYPES=['shield','archer','wilddog','pigeon','armoredCar','steamWalker'];
export const BUILDING_TYPES=['base','mine','tower','factory','machineFactory'];
const AI_TRAINABLE_TYPES=[...TRAINABLE_TYPES,'ironShield','crossbow'];
const REQUIRED_TECH={armoredCar:['castIron'],steamWalker:['castIron','artillery','steamCore']};

export function productionType(type,technologies,team=0){
  if(team!==0)return type;
  if(type==='shield'&&technologies?.compositeShield?.status==='complete')return 'ironShield';
  if(type==='archer'&&technologies?.precisionBolts?.status==='complete')return 'crossbow';
  return type;
}

export function towerGarrisonType(state,team=0){return productionType('archer',state.technologies,team);}

export function populationCap(state,team=0){
  if(['attack','randomAttack','tutorial'].includes(state.level))return 200;
  if(state.level==='defend')return 200;
  return state.buildings.reduce((total,b)=>total+(b.team===team&&b.hp>0&&!b.constructionPending?(STATS[b.type].pop||0):0),0);
}

export function researchError(state,id){
  if(state.result||!TECHNOLOGIES[id])return '当前不能研发';
  const tech=state.technologies[id];
  if(tech.status==='complete')return '科技已完成';
  if(tech.status==='researching')return '科技正在研发';
  const cost=TECHNOLOGIES[id];
  if(state.food<cost.food||state.ore<cost.ore)return '资源不足';
  return null;
}

export function trainingPlan(state,type,producerId=null,team=0){
  const allowed=team===0?TRAINABLE_TYPES:AI_TRAINABLE_TYPES;
  if(!allowed.includes(type)||state.result)return {error:'当前不能训练'};
  // AI 保留既有规则：不受玩家科技限制，自动选择最短队列的生产建筑。
  if(team===0&&(REQUIRED_TECH[type]||[]).some(id=>state.technologies[id].status!=='complete')){
    return {error:type==='armoredCar'?'需要先完成铸铁装甲':'需要先完成铸铁装甲、火炮和蒸汽核心'};
  }
  const machine=!!STATS[type].machine,producerType=machine?'machineFactory':'base';
  const queue=team===0?state.queue:state.aiQueue;
  const counts=new Map();
  for(const entry of queue)counts.set(entry.baseId,(counts.get(entry.baseId)||0)+1);
  const producers=state.buildings.filter(b=>b.type===producerType&&b.team===team&&b.hp>0&&!b.constructionPending&&(producerId===null||b.id===producerId));
  if(team===1)producers.sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0)||a.id-b.id);
  const producer=producers[0];
  if(!producer)return {error:team===1?(machine?'AI 无可用机械工厂':'AI 无可用基地'):(machine?'请选择已完工的机械工厂':'请选择已完工的基地')};
  if(usedPop(state.units,team,queue)>=populationCap(state,team))return {error:'人口已达上限'};
  if((counts.get(producer.id)||0)>=TRAIN_QUEUE_LIMIT)return {error:team===0?'所选生产建筑队列已满':'训练队列已满'};
  const foodKey=team===0?'food':'aiFood',oreKey=team===0?'ore':'aiOre',cost=STATS[type];
  if(state[foodKey]<cost.food||state[oreKey]<cost.ore)return {error:'资源不足'};
  return {error:null,producer,queue,foodKey,oreKey,cost};
}

export function foodRate(map,building){
  return (map.foodPoints||[]).some(node=>coversCell(building,node))?STATS.factory.foodRate:STATS.factory.foodRateOff;
}

const ARMY_TYPES=new Set(['shield','ironShield','archer','crossbow','armoredCar','steamWalker']);
export const isArmyUnit=unit=>ARMY_TYPES.has(unit.type);
