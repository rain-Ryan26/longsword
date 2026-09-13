import {W,STATS} from './data.js';
export const index=(x,y,width=W)=>Math.floor(y)*width+Math.floor(x);
// 建筑占地格：center±halfSize 取整后的连续格子区间，兼容奇数尺寸（3×3）。
export const buildingCells=b=>{const r=STATS[b.type]?.halfSize||2;return {x0:Math.round(b.x-r),x1:Math.round(b.x+r)-1,y0:Math.round(b.y-r),y1:Math.round(b.y+r)-1};};
export const coversCell=(building,cell)=>{const c=buildingCells(building);return cell.x>=c.x0&&cell.x<=c.x1&&cell.y>=c.y0&&cell.y<=c.y1;};
const occupancyCache=new WeakMap();

// 一次搜索只校验一次建筑状态；支持调用者直接修改数组、位置、类型和生命值。
export function createWalkability(map,buildings){
  const width=map.width??96,height=map.height??64;
  const signature=buildings.map(b=>b.hp>0?`${b.type}:${b.x}:${b.y}:${STATS[b.type]?.halfSize||2}`:'dead').join('|');
  let cache=occupancyCache.get(buildings);
  if(!cache||cache.width!==width||cache.height!==height||cache.signature!==signature){
    const blocked=new Uint8Array(width*height);
    for(const building of buildings){
      if(building.hp<=0)continue;
      const c=buildingCells(building);
      for(let y=Math.max(0,c.y0);y<=Math.min(height-1,c.y1);y++){
        for(let x=Math.max(0,c.x0);x<=Math.min(width-1,c.x1);x++)blocked[y*width+x]=1;
      }
    }
    cache={width,height,signature,blocked};
    occupancyCache.set(buildings,cache);
  }
  return (x,y,avoidMountains=false,avoidForests=avoidMountains)=>{
    if(x<0||y<0||x>=width||y>=height)return false;
    const cell=y*width+x,terrain=map.terrain[cell];
    return !cache.blocked[cell]&&!(avoidMountains&&terrain===1)&&!(avoidForests&&terrain===2);
  };
}
export function walkable(map,buildings,x,y,avoidMountains=false,avoidForests=avoidMountains){
  const W=map.width??96,H=map.height??64;
  if(x<0||y<0||x>=W||y>=H)return false;
  const terrain=map.terrain[index(x,y,W)];
  if((avoidMountains&&terrain===1)||(avoidForests&&terrain===2))return false;
  return !buildings.some(b=>{if(b.hp<=0)return false;const c=buildingCells(b);return x>=c.x0&&x<=c.x1&&y>=c.y0&&y<=c.y1;});
}
export function nearestFree(map,buildings,x,y,avoidMountains=false,avoidForests=avoidMountains,canWalk=createWalkability(map,buildings)){
  const W=map.width??96,H=map.height??64;
  x=Math.max(0,Math.min(W-1,Math.floor(x))); y=Math.max(0,Math.min(H-1,Math.floor(y)));
  for(let r=0;r<12;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    if(canWalk(x+dx,y+dy,avoidMountains,avoidForests))return {x:x+dx+.5,y:y+dy+.5};
  }
  return null;
}
// 单位生成点：回血圈内优先平地（非山地/森林），富余时按 salt 错开连续出生的单位
export function spawnPoint(map,buildings,base,salt=0){
  const canWalk=createWalkability(map,buildings);
  const r=STATS.base?.healRange??6;
  const W=map.width??96,H=map.height??64;
  const bx=Math.round(base.x),by=Math.round(base.y);
  const flats=[],anys=[];
  for(let y=Math.max(0,by-r);y<=Math.min(H-1,by+r);y++)
    for(let x=Math.max(0,bx-r);x<=Math.min(W-1,bx+r);x++){
      const d=Math.hypot(x+.5-base.x,y+.5-base.y);
      if(d>r||!canWalk(x,y))continue;
      (map.terrain[index(x,y,W)]===0?flats:anys).push({x:x+.5,y:y+.5,d});
    }
  const pool=(flats.length?flats:anys.length?anys:null)?.sort((a,b)=>a.d-b.d);
  if(pool?.length)return pool[salt%pool.length];
  return nearestFree(map,buildings,base.x,base.y)||{x:base.x,y:base.y};
}
class Heap{
  a=[];
  push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
  pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=last.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return first;}
}
// 拥挤代价：密度超过 1（排除寻路单位自身）后按 CROWD_K 计代价，CROWD_CAP 封顶，
// 保证存在替代路线时自动分流、只有一条路时不会无谓绕远。
// 分流靠"密度反馈 + 周期重寻路"随时间自然形成，无需随机扰动。
const CROWD_K=.7,CROWD_CAP=4;
const searchBuffers=new WeakMap();
function searchBuffer(map,size){
  let buffer=searchBuffers.get(map);
  if(!buffer||buffer.g.length!==size){
    buffer={heap:new Heap(),g:new Float64Array(size),parent:new Int32Array(size),closed:new Uint8Array(size)};
    searchBuffers.set(map,buffer);
  }
  buffer.g.fill(Infinity);buffer.closed.fill(0);buffer.heap.a.length=0;
  return buffer;
}
export function findPath(map,buildings,start,end,avoidMountains=false,avoidForests=avoidMountains,density=null){
  const W=map.width??96,H=map.height??64;
  const canWalk=createWalkability(map,buildings);
  const dest=nearestFree(map,buildings,end.x,end.y,avoidMountains,avoidForests,canWalk);if(!dest)return [];
  const sx=Math.floor(start.x),sy=Math.floor(start.y),tx=Math.floor(dest.x),ty=Math.floor(dest.y),goal=ty*W+tx;
  const {heap,g,parent,closed}=searchBuffer(map,W*H);
  const origin=sy*W+sx;g[origin]=0;heap.push({i:origin,f:0});
  while(heap.a.length){
    const {i}=heap.pop();if(closed[i])continue;if(i===goal){const out=[];let p=i;while(p!==origin){out.push({x:p%W+.5,y:Math.floor(p/W)+.5});p=parent[p];}return out.reverse();}closed[i]=1;
    const x=i%W,y=Math.floor(i/W);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
      if(!canWalk(nx,ny,avoidMountains,avoidForests))continue;
      if(dx&&dy&&(!canWalk(x+dx,y,avoidMountains,avoidForests)||!canWalk(x,y+dy,avoidMountains,avoidForests)))continue;
      const ni=ny*W+nx;
      let step=dx&&dy?Math.SQRT2:1;
      if(density){
        const crowd=density[ni]-1;
        if(crowd>0)step+=Math.min(crowd*CROWD_K,CROWD_CAP);
      }
      const ng=g[i]+step;if(ng>=g[ni])continue;
      g[ni]=ng;parent[ni]=i;const ax=Math.abs(tx-nx),ay=Math.abs(ty-ny);heap.push({i:ni,f:ng+Math.max(ax,ay)+(Math.SQRT2-1)*Math.min(ax,ay)});
    }
  }
  return [];
}
