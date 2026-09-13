// 查询结果保留原实体顺序，索敌同分时仍选择原先的目标。
const indexes=new WeakMap();
export class NearbyIndex{
  constructor(entities,cellSize=8){
    this.entities=entities;this.cellSize=cellSize;this.buckets=new Map();this.keys=new Map();
    this.order=new Map(entities.map((entity,index)=>[entity,index]));
    for(const entity of entities)this.update(entity);
  }
  update(entity){
    const key=`${Math.floor(entity.x/this.cellSize)},${Math.floor(entity.y/this.cellSize)}`;
    const previous=this.keys.get(entity);
    if(previous===key)return;
    if(previous!==undefined)this.buckets.get(previous).delete(entity);
    if(!this.buckets.has(key))this.buckets.set(key,new Set());
    this.buckets.get(key).add(entity);this.keys.set(entity,key);
  }
  nearby(point,radius,ordered=true){
    const result=[],size=this.cellSize;
    for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++){
      for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
        for(const entity of this.buckets.get(`${x},${y}`)||[])result.push(entity);
      }
    }
    return ordered?result.sort((a,b)=>this.order.get(a)-this.order.get(b)):result;
  }
}
export function indexEntities(entities){
  const index=new NearbyIndex(entities);indexes.set(entities,index);return index;
}
export function nearbyEntities(entities,point,radius){
  return indexes.get(entities)?.nearby(point,radius,false)??entities;
}
export function updateEntityIndex(entities,entity){indexes.get(entities)?.update(entity);}

export function earlierEntity(entities,candidate,current){
  const index=indexes.get(entities);
  return index&&index.order.get(candidate)<index.order.get(current);
}
