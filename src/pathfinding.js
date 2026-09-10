import {W,H} from './data.js';
export const index=(x,y)=>Math.floor(y)*W+Math.floor(x);
export function walkable(map,buildings,x,y){
  if(x<0||y<0||x>=W||y>=H||map.terrain[index(x,y)]===1)return false;
  return !buildings.some(b=>b.hp>0&&Math.abs(x+.5-b.x)<2&&Math.abs(y+.5-b.y)<2);
}
export function nearestFree(map,buildings,x,y){
  x=Math.max(0,Math.min(W-1,Math.floor(x))); y=Math.max(0,Math.min(H-1,Math.floor(y)));
  for(let r=0;r<12;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    if(walkable(map,buildings,x+dx,y+dy))return {x:x+dx+.5,y:y+dy+.5};
  }
  return null;
}
class Heap{
  a=[];
  push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
  pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=last.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return first;}
}
export function findPath(map,buildings,start,end){
  const dest=nearestFree(map,buildings,end.x,end.y);if(!dest)return [];
  const sx=Math.floor(start.x),sy=Math.floor(start.y),tx=Math.floor(dest.x),ty=Math.floor(dest.y),goal=ty*W+tx;
  const heap=new Heap(),g=new Float64Array(W*H).fill(Infinity),parent=new Int32Array(W*H).fill(-1),closed=new Uint8Array(W*H);
  const origin=sy*W+sx;g[origin]=0;heap.push({i:origin,f:0});
  while(heap.a.length){
    const {i}=heap.pop();if(closed[i])continue;if(i===goal){const out=[];let p=i;while(p!==origin){out.push({x:p%W+.5,y:Math.floor(p/W)+.5});p=parent[p];}return out.reverse();}closed[i]=1;
    const x=i%W,y=Math.floor(i/W);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
      if(!walkable(map,buildings,nx,ny))continue;
      if(dx&&dy&&(!walkable(map,buildings,x+dx,y)||!walkable(map,buildings,x,y+dy)))continue;
      const ni=ny*W+nx,ng=g[i]+(dx&&dy?Math.SQRT2:1);if(ng>=g[ni])continue;
      g[ni]=ng;parent[ni]=i;const ax=Math.abs(tx-nx),ay=Math.abs(ty-ny);heap.push({i:ni,f:ng+Math.max(ax,ay)+(Math.SQRT2-1)*Math.min(ax,ay)});
    }
  }
  return [];
}
