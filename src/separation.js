import {STATS} from './data.js';
import {createWalkability} from './pathfinding.js';

const CELL_SIZE=2;
const atRest=u=>u.targetId==null&&u.path.length===0&&u.order==='idle';
const bucketKey=u=>`${Math.floor(u.x/CELL_SIZE)},${Math.floor(u.y/CELL_SIZE)}`;

export function separateUnits(game,dt){
  const units=game.units,buckets=new Map(),keys=[];
  const canWalk=createWalkability(game.map,game.buildings);
  let maxRadius=.425;
  function update(index){
    const key=bucketKey(units[index]);
    if(keys[index]===key)return;
    if(keys[index]!==undefined)buckets.get(keys[index]).delete(index);
    if(!buckets.has(key))buckets.set(key,new Set());
    buckets.get(key).add(index);keys[index]=key;
  }
  for(let i=0;i<units.length;i++){
    if(game.isFlying(units[i]))continue;
    maxRadius=Math.max(maxRadius,STATS[units[i].type].collisionRadius||.425);
    update(i);
  }
  const reach=Math.max(1.6,maxRadius*2);
  const bounds=u=>[Math.floor((u.x-reach)/CELL_SIZE),Math.floor((u.x+reach)/CELL_SIZE),Math.floor((u.y-reach)/CELL_SIZE),Math.floor((u.y+reach)/CELL_SIZE)];
  for(let i=0;i<units.length;i++){
    const a=units[i];
    if(game.isFlying(a))continue;
    let cursor=i;
    // 按原数组顺序处理；自身被挤出查询区时重新查询，避免遗漏随后才靠近的单位。
    while(true){
      const area=bounds(a),candidates=[];
      for(let y=area[2];y<=area[3];y++)for(let x=area[0];x<=area[1];x++){
        for(const j of buckets.get(`${x},${y}`)||[])if(j>cursor)candidates.push(j);
      }
      candidates.sort((a,b)=>a-b);
      let changedArea=false;
      for(const j of candidates){
        cursor=j;
        const b=units[j],d=Math.hypot(a.x-b.x,a.y-b.y);
        const collisionGap=(STATS[a.type].collisionRadius||.425)+(STATS[b.type].collisionRadius||.425);
        const gap=atRest(a)&&atRest(b)?Math.max(1.6,collisionGap):collisionGap;
        if(d>=gap)continue;
        const dx=d>.001?(a.x-b.x)/d:1,dy=d>.001?(a.y-b.y)/d:0;
        const k=Math.min((gap-d)*.5,dt*1.5);
        for(const [index,sign] of [[i,1],[j,-1]]){
          const u=units[index];
          if(STATS[u.type].air)continue;
          const x=u.x+dx*k*sign,y=u.y+dy*k*sign;
          if(canWalk(Math.floor(x),Math.floor(y),...game.terrainAvoidance(u))){
            u.x=x;u.y=y;update(index);
          }
        }
        changedArea=bounds(a).some((value,index)=>value!==area[index]);
        if(changedArea)break;
      }
      if(!changedArea)break;
    }
  }
}
