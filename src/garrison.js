import {STATS} from './data.js';
import {walkable,findPath} from './pathfinding.js';

export const GARRISON_LIMIT=4;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const towerFor=(game,id,team)=>game.buildings.find(b=>b.id===id&&b.team===team&&b.type==='tower'&&b.hp>0&&!b.constructionPending);
export const occupants=(game,id)=>game.units.filter(u=>u.hp>0&&u.garrisonId===id);
function spots(game,b){
  const points=[];
  for(let y=b.y-1.5;y<=b.y+1.5;y++)for(let x=b.x-1.5;x<=b.x+1.5;x++){
    if(walkable(game.map,game.buildings,Math.floor(x),Math.floor(y)))points.push({x,y});
  }
  return points;
}
export function enterTower(game,ids,id,team=0){
  if(game.result)return '战局已结束';
  const b=towerFor(game,id,team);
  if(!b)return '请选择己方已完工哨塔';
  let available=GARRISON_LIMIT-occupants(game,id).length-game.units.filter(u=>u.hp>0&&u.garrisonTarget===id).length;
  if(available<=0)return '哨塔入驻名额已满（最多 4 人）';
  let dispatched=0;
  for(const u of game.units.filter(u=>ids.includes(u.id)&&u.team===team&&u.hp>0&&!u.garrisonId&&!u.garrisonTarget&&!STATS[u.type].air&&STATS[u.type].movable!==false).sort((a,c)=>distance(a,b)-distance(c,b))){
    if(!available)break;
    for(const p of spots(game,b).sort((a,c)=>distance(a,u)-distance(c,u))){
      const path=findPath(game.map,game.buildings,u,p,...game.terrainAvoidance(u));
      if(!path.length&&distance(u,p)>.65)continue;
      game.releaseBuilder(u);u.leavingId=null;u.garrisonTarget=id;u.order='garrison';u.goal=p;u.path=path;u.targetId=null;u.repath=1;
      dispatched++;available--;break;
    }
  }
  game.revision++;
  return dispatched?null:'请选择能到达哨塔的可移动地面单位';
}
export function stepGarrison(game,u,dt){
  const b=towerFor(game,u.garrisonTarget,u.team);
  if(!b){u.garrisonTarget=null;game.releaseBuilder(u);return;}
  if(distance(u,u.goal)>.65){
    if(u.repath<=0||!u.path.length){u.path=game.pathFor(u,u.goal);u.repath=1;}
    game.move(u,game.movementSpeed(u)*dt);return;
  }
  if(occupants(game,b.id).length>=GARRISON_LIMIT){u.garrisonTarget=null;game.releaseBuilder(u);return;}
  game.releaseBuilder(u);u.garrisonTarget=null;u.garrisonId=b.id;u.x=b.x;u.y=b.y;u.targetId=null;
  game.revision++;
}
export function exitTower(game,id,team=0){
  if(game.result)return '战局已结束';
  const b=towerFor(game,id,team);
  if(!b)return '请选择己方已完工哨塔';
  for(const u of game.units)if(u.garrisonTarget===id){u.garrisonTarget=null;game.releaseBuilder(u);}
  for(const u of occupants(game,id)){
    const p=spots(game,b).find(p=>!game.units.some(other=>other.hp>0&&!other.garrisonId&&!game.isFlying(other)&&distance(p,other)<(STATS[u.type].collisionRadius||.425)+(STATS[other.type].collisionRadius||.425)));
    if(!p)continue;
    u.garrisonId=null;u.x=p.x;u.y=p.y;game.releaseBuilder(u);
  }
  game.revision++;game.updateVision();
  return occupants(game,id).length?'周边没有足够空地，部分驻兵仍在塔内':null;
}
export function destroyGarrison(game,id){
  for(const u of occupants(game,id))u.hp=0;
  for(const u of game.units)if(u.garrisonTarget===id){u.garrisonTarget=null;game.releaseBuilder(u);}
}
