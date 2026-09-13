import {stepGarrison} from './garrison.js';
import {updateEntityIndex} from './queries.js';
import {STATS} from './data.js';
import {createWalkability} from './pathfinding.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

const movementChecks=new WeakMap();
const activePhases=new WeakSet();
export function invalidateMovement(game){movementChecks.delete(game);}
function movementCheck(game,buildings){
  if(buildings!==game.buildings)return createWalkability(game.map,buildings);
  let canWalk=movementChecks.get(game);
  if(!canWalk){canWalk=createWalkability(game.map,buildings);movementChecks.set(game,canWalk);}
  return canWalk;
}
export function stepUnits(game,dt,entities,entityById){
  invalidateMovement(game);activePhases.add(game);
  try{
    for(const u of game.units){
      stepUnit(game,u,dt,entities,entityById);
      updateEntityIndex(entities,u);
    }
  }finally{invalidateMovement(game);activePhases.delete(game);}
}
function stepUnit(game,u,dt,entities,entityById){
  if(u.hp<=0||u.garrisonId)return;
  u.cooldown=Math.max(0,u.cooldown-dt);
  u.repath-=dt;
  if(u.garrisonTarget){stepGarrison(game,u,dt);return;}
  if(game.isFlying(u)){game.stepFlight(u,dt,entities,entityById);return;}
  if(u.order==='build'){stepBuilder(game,u,dt,entityById);return;}
  let target=u.holdFire?null:entityById.get(u.targetId);
  if(target&&(target.hp<=0||!game.canSee(u.team,target)||!game.canEngage(u,target)))target=null;
  if(target&&u.role==='guard'&&distance(u,u.home)>11)target=null;
  if(target&&u.role==='patrol'&&distance(u,target)>14)target=null;
  if(!target){u.targetId=null;
    if(!u.holdFire&&u.order!=='move'){
      target=game.acquireTarget(u,entities,{guard:true,preferUnits:true});
      if(target)u.targetId=target.id;
    }
  }
  if(target){
    if(distance(u,target)<=game.attackRange(u,target)){
      u.facing=Math.atan2(target.y-u.y,target.x-u.x);
      if(u.cooldown<=0)performAttack(game,u,target);
      return;
    }
    if(u.repath<=0){u.path=game.pathFor(u,target);u.repath=.8;}
  }else{updateGroundRoute(game,u);}
  game.move(u,game.movementSpeed(u)*dt);

}

export function move(game,u,amount){
  if(STATS[u.type].air&&!game.isFlying(u))return;
  // 拥挤减速：同格超过 2 个单位才生效（下限 55%），窄口形成车流式通行而非互相推挤
  const crowd=game.density[game.cellIndex(u.x,u.y)];
  if(crowd>2)amount*=Math.max(.55,1-(crowd-2)*.12);
  const buildings=u.leavingId!=null?game.buildings.filter(b=>b.id!==u.leavingId):game.buildings;
  const canWalk=u.path.length&&amount>0?(activePhases.has(game)?movementCheck(game,buildings):createWalkability(game.map,buildings)):null;
  const wasInSlow=game.map.terrain[game.cellIndex(u.x,u.y)]!==0;
  // 路径走廊跳过：被挤偏后只要仍在"当前路点→下一路点"线段旁的走廊内，就跳过当前路点，
  // 顺着前方路点继续走，避免斜着回去够原格子中心、往回顶住后方单位
  while(u.path.length>1){
    const a=u.path[0],b=u.path[1],abx=b.x-a.x,aby=b.y-a.y,len2=abx*abx+aby*aby;
    const t=len2?Math.max(0,Math.min(1,((u.x-a.x)*abx+(u.y-a.y)*aby)/len2)):0;
    const px=a.x+abx*t,py=a.y+aby*t,dx=u.x-px,dy=u.y-py;
    if(dx*dx+dy*dy>.25)break;
    u.path.shift();
  }
  while(u.path.length&&amount>0){
    const p=u.path[0],d=distance(u,p);
    if(!canWalk(Math.floor(p.x),Math.floor(p.y),...game.terrainAvoidance(u))){
      u.path=[];u.repath=0;return;
    }
    u.facing=Math.atan2(p.y-u.y,p.x-u.x);
    if(d<=amount){
      u.x=p.x;u.y=p.y;u.path.shift();amount-=d;
    }else{
      u.x+=(p.x-u.x)/d*amount;u.y+=(p.y-u.y)/d*amount;amount=0;
    }
  }
  const avoidance=game.terrainAvoidance(u);if(wasInSlow&&(avoidance[0]||avoidance[1])){u.path=[];u.repath=0;}
}

// 攻击执行共用冷却、暴露和效果；空中近战保持即时命中。
export function performAttack(game,u,target,{direct=false}={}){
  const stats=STATS[u.type];
  u.cooldown=stats.cooldown;
  u.revealUntil=game.time+2;
  const damage=game.attackDamage(u,target);
  if(stats.ranged&&!direct){
    game.projectiles.push({x:u.x,y:u.y,fromX:u.x,fromY:u.y,targetId:target.id,team:u.team,damage,kind:stats.projectileKind||'arrow',splashDamage:stats.splashDamage||0,splashRadius:stats.splashRadius||0,life:2});
    if(stats.audioEvent)game.audioEvents.push(stats.audioEvent);
  }else{
    game.damage(target,damage);
    game.effects.push({x:target.x,y:target.y,team:u.team,kind:'hit',life:.22,maxLife:.22});
  }
}

function stepBuilder(game,u,dt,entityById){
  const b=entityById.get(u.buildingId);
  if(!b||b.hp<=0||!b.constructionPending){game.releaseBuilder(u);return;}
  if(u.goal&&distance(u,u.goal)>.65){
    if(u.repath<=0){u.path=game.pathFor(u,u.goal);u.repath=1;}
    game.move(u,game.movementSpeed(u)*dt);
  }else{u.path=[];u.facing=Math.atan2(b.y-u.y,b.x-u.x);}
  return;
}

function updateGroundRoute(game,u){
  if(u.role==='guard'&&u.order!=='move'&&distance(u,u.home)>1){
    if(u.repath<=0){u.path=game.pathFor(u,u.home);u.repath=1;}
  }
  else if(u.role==='patrol'){
    const p=game.map.patrol[u.patrolIndex];if(distance(u,p)<2)u.patrolIndex=(u.patrolIndex+1)%game.map.patrol.length;
    if(!u.path.length||u.repath<=0){u.path=game.pathFor(u,game.map.patrol[u.patrolIndex]);u.repath=2;}
  }else if(u.goal){
    if(distance(u,u.goal)<.8&&!game.stillLeaving(u)){
      u.goal=u.waypoints.shift()||null;
      u.path=u.goal?game.pathFor(u,u.goal):[];
      u.order=u.goal?'move':'idle';
      if(!u.goal){u.allowMountains=false;u.allowForests=false;}
      u.repath=1.5;
    }else if(!u.path.length||u.repath<=0){
      u.path=game.pathFor(u,u.goal);u.repath=1.5;
    }
  }
  else if(u.targetId===null&&u.order==='idle')u.path=[];
}
