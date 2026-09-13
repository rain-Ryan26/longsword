import {STATS} from './data.js';
import {walkable,nearestFree} from './pathfinding.js';
import {performAttack} from './units.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function stepFlight(game,u,dt,entities,entityById){
  const s=STATS[u.type],r=s.orbitRadius;
  let target=!u.holdFire&&!u.landing&&entityById.get(u.targetId);
  if(target&&(target.hp<=0||!game.canSee(u.team,target)||!game.canEngage(u,target)))target=null;
  if(!target&&!u.holdFire&&!u.landing&&u.order!=='move')target=game.acquireTarget(u,entities);
  u.targetId=target?.id??null;
  if(target&&distance(u,target)<=game.attackRange(u,target)&&u.cooldown<=0){
    performAttack(game,u,target,{direct:true});
  }
  const angleDiff=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // 小步圆弧积分：弧长 / 转角始终不小于最小转弯半径。
  for(let remaining=dt;remaining>1e-9;){
    const h=Math.min(remaining,.02);remaining-=h;
    if(u.waypoints.length&&u.goal&&distance(u,u.goal)<.8)u.goal=u.waypoints.shift();
    let goal=target||u.landing||(u.waypoints.length?u.goal:(u.goal&&distance(u,u.goal)>r?u.goal:null)),desired;
    if(goal){
      desired=Math.atan2(goal.y-u.y,goal.x-u.x);
      if(u.landing){
        const d=distance(u,goal);
        if(d<4&&Math.abs(angleDiff(desired-u.facing))>Math.PI/3)u.landingEscape=true;
        if(d>5)u.landingEscape=false;
        if(u.landingEscape)desired=u.facing;
      }
    }else{
      if(!u.orbit)u.orbit={x:u.x-Math.sin(u.facing)*r,y:u.y+Math.cos(u.facing)*r};
      const center=u.goal||u.orbit;
      const cx=Math.max(r+1,Math.min(game.map.width-r-1,center.x)),cy=Math.max(r+1,Math.min(game.map.height-r-1,center.y));
      const dx=u.x-cx,dy=u.y-cy,d=Math.hypot(dx,dy);
      desired=Math.atan2(dy,dx)+Math.PI/2+s.speed*h/Math.max(d,.5)+Math.atan((d-r)/(r*0.5));
    }
    // 提前朝地图内部转弯，不通过夹紧位置或瞬间掉头破坏曲率约束。
    const margin=s.minTurnRadius*2+1;
    const landingAligned=u.landing&&Math.abs(angleDiff(Math.atan2(u.landing.y-u.y,u.landing.x-u.x)-u.facing))<.4;
    if(!landingAligned&&((u.x<margin&&Math.cos(u.facing)<0)||(u.x>game.map.width-margin&&Math.cos(u.facing)>0)||(u.y<margin&&Math.sin(u.facing)<0)||(u.y>game.map.height-margin&&Math.sin(u.facing)>0)))u.boundaryReturn=true;
    if(landingAligned||(u.x>margin&&u.x<game.map.width-margin&&u.y>margin&&u.y<game.map.height-margin))u.boundaryReturn=false;
    if(u.boundaryReturn)desired=Math.atan2(game.map.height/2-u.y,game.map.width/2-u.x);
    const length=s.speed*h,limit=length/s.minTurnRadius,turn=Math.max(-limit,Math.min(limit,angleDiff(desired-u.facing)));
    const heading=u.facing;
    if(Math.abs(turn)<1e-9){u.x+=Math.cos(heading)*length;u.y+=Math.sin(heading)*length;}
    else{u.x+=length/turn*(Math.sin(heading+turn)-Math.sin(heading));u.y+=length/turn*(Math.cos(heading)-Math.cos(heading+turn));}
    u.facing=angleDiff(heading+turn);
    if(u.landing&&distance(u,u.landing)<.25&&walkable(game.map,game.buildings,Math.floor(u.x),Math.floor(u.y))){
      u.flying=false;u.landing=null;u.goal=null;u.orbit=null;u.path=[];u.order='idle';u.targetId=null;break;
    }
    if(u.landing&&!walkable(game.map,game.buildings,Math.floor(u.landing.x),Math.floor(u.landing.y)))u.landing=nearestFree(game.map,game.buildings,u.landing.x,u.landing.y);
  }
}

