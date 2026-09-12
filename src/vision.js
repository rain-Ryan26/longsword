import {DETECTION_MULTIPLIERS} from './data.js';

const TERRAIN_COST=DETECTION_MULTIPLIERS.map(value=>1/value);

export class VisionSystem{
  constructor(){
    this.distances=new Float64Array(0);
    this.stamps=new Uint32Array(0);
    this.generation=0;
    this.heap=[];
  }

  push(cell,cost){
    const entry={cell,cost},heap=this.heap;
    let i=heap.length;
    heap.push(entry);
    while(i){
      const parent=(i-1)>>1;
      if(heap[parent].cost<=cost)break;
      heap[i]=heap[parent];i=parent;
    }
    heap[i]=entry;
  }

  pop(){
    const heap=this.heap,first=heap[0],last=heap.pop();
    if(heap.length){
      let i=0;
      while(i*2+1<heap.length){
        let child=i*2+1;
        if(child+1<heap.length&&heap[child+1].cost<heap[child].cost)child++;
        if(heap[child].cost>=last.cost)break;
        heap[i]=heap[child];i=child;
      }
      heap[i]=last;
    }
    return first;
  }

  ground(map,visible,x,y,budget){
    const {width,height,terrain}=map,size=width*height;
    if(this.distances.length!==size){
      this.distances=new Float64Array(size);
      this.stamps=new Uint32Array(size);
    }
    this.generation=(this.generation+1)>>>0;
    if(!this.generation){this.stamps.fill(0);this.generation=1;}
    const generation=this.generation,dist=this.distances,stamps=this.stamps;
    const ox=Math.max(0,Math.min(width-1,Math.floor(x)));
    const oy=Math.max(0,Math.min(height-1,Math.floor(y)));
    const origin=oy*width+ox;
    this.heap.length=0;
    dist[origin]=0;stamps[origin]=generation;visible[origin]=1;
    this.push(origin,0);
    while(this.heap.length){
      const {cell,cost}=this.pop();
      if(cost!==dist[cell])continue;
      const cx=cell%width,cy=Math.floor(cell/width);
      for(let sy=-1;sy<=1;sy++)for(let sx=-1;sx<=1;sx++){
        if(!sx&&!sy)continue;
        const nx=cx+sx,ny=cy+sy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const next=ny*width+nx;
        const nextCost=cost+(sx&&sy?Math.SQRT2:1)*TERRAIN_COST[terrain[next]];
        if(nextCost>budget||(stamps[next]===generation&&nextCost>=dist[next]))continue;
        stamps[next]=generation;dist[next]=nextCost;visible[next]=1;
        this.push(next,nextCost);
      }
    }
  }

  circle(game,team,x,y,radius,airScout=false){
    const {width,height,terrain}=game.map;
    const underX=Math.floor(x),underY=Math.floor(y);
    for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(height-1,Math.ceil(y+radius));yy++){
      for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(width-1,Math.ceil(x+radius));xx++){
        if((xx+.5-x)**2+(yy+.5-y)**2>radius*radius)continue;
        const cell=yy*width+xx;
        if(airScout&&terrain[cell]===2&&(xx!==underX||yy!==underY))game.explored[team][cell]=1;
        else game.visible[team][cell]=1;
      }
    }
  }

  update(game){
    game.visionVersion++;
    for(const visible of game.visible)visible.fill(0);
    // 只在本次更新内去重；地形、实体或视野参数变化后不会沿用旧结果。
    const origins=[new Map(),new Map()];
    for(const entity of game.entities()){
      if(entity.building&&entity.constructionPending)continue;
      const radius=game.detectionRange(entity),team=entity.team;
      if(game.isFlying(entity))this.circle(game,team,entity.x,entity.y,radius,true);
      else{
        const cell=game.cellIndex(entity.x,entity.y);
        if((origins[team].get(cell)??-Infinity)<radius){
          this.ground(game.map,game.visible[team],entity.x,entity.y,radius);
          origins[team].set(cell,radius);
        }
      }
      if(entity.revealUntil>game.time)this.circle(game,1-team,entity.x,entity.y,2);
    }
    for(let team=0;team<2;team++){
      for(let cell=0;cell<game.visible[team].length;cell++){
        if(game.visible[team][cell])game.explored[team][cell]=1;
      }
    }
    game.updateGhosts();
  }
}
