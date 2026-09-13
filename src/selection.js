import {STATS} from './data.js';
export const isOffensiveMovableUnit=u=>u.team===0&&u.hp>0&&u.type!=='pigeon'&&STATS[u.type]?.movable===true&&STATS[u.type].damage>0;

export class ControlGroups{
  constructor(){this.groups=new Map();}
  clear(){this.groups.clear();}
  save(key,selected,living){
    const ids=[...selected].filter(id=>living.has(id));
    if(ids.length)this.groups.set(key,ids);
    return ids;
  }
  recall(key,living){
    const ids=(this.groups.get(key)||[]).filter(id=>living.has(id));
    this.groups.set(key,ids);
    return ids;
  }
}

export function nearestEntity(entities,point){
  let best=null,bestDistance=Infinity;
  for(const entity of entities){
    const distance=Math.hypot(entity.x-point.x,entity.y-point.y);
    if(distance<bestDistance){best=entity;bestDistance=distance;}
  }
  return best;
}
