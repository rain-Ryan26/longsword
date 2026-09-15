// 分区抽样保留攻坚方向；清空部署区并连接资源，避免随机地形封死机械单位。
export function createMapRandomAttack(seed=Math.floor(Math.random()*4294967296)){
  seed=seed>>>0;
  let state=seed;
  const random=()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
  const integer=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
  const point=(x0,x1,y0,y1)=>({x:integer(x0,x1),y:integer(y0,y1)});
  const width=128,height=88,terrain=new Array(width*height).fill(0);
  const camps=[point(76,82,16,23),point(98,110,63,71),point(111,115,19,26)];
  const towers=camps.map((p,i)=>[[-10,0],[0,11],[8,5],[0,-11]].slice(0,i+2).map(([x,y])=>({x:p.x+x,y:p.y+y})));
  const spawns=[{x:12,y:76},{...camps[2]}];
  const resources=[point(17,21,73,77),{x:camps[2].x+7,y:camps[2].y-7}];
  const foodPoints=[point(8,12,63,67),{x:camps[2].x+7,y:camps[2].y+12}];
  const reserved=[...spawns,...camps,...towers.flat(),{x:6,y:76},...resources,...foodPoints];
  // 有界候选洗牌，所有资源彼此留出经济建筑和通行空间。
  const candidates=[];
  for(let y=6;y<82;y++)for(let x=7;x<121;x++)candidates.push({x,y});
  for(let i=candidates.length-1;i>0;i--){const j=integer(0,i);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  for(const p of candidates){
    if(reserved.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<9))continue;
    (resources.length<=foodPoints.length?resources:foodPoints).push(p);reserved.push(p);
    if(resources.length===9&&foodPoints.length===9)break;
  }
  if(resources.length!==9||foodPoints.length!==9)throw new Error('随机进攻资源布局空间不足');
  const protectedCells=new Uint8Array(width*height);
  const clear=(p,rx,ry=rx)=>{
    for(let y=Math.max(0,Math.floor(p.y-ry));y<Math.min(height,Math.ceil(p.y+ry));y++)
      for(let x=Math.max(0,Math.floor(p.x-rx));x<Math.min(width,Math.ceil(p.x+rx));x++){terrain[y*width+x]=0;protectedCells[y*width+x]=1;}
  };
  const road=(a,b)=>{
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));
    for(let n=0;n<=steps;n++){const t=steps?n/steps:0;clear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},3);}
  };
  for(const p of reserved)clear(p,5);
  for(const p of camps)clear(p,15);
  for(const p of [{x:23,y:47},{x:30,y:60},{x:40,y:78}])clear(p,12,10);
  clear({x:22,y:74},12,8);
  // 每个营地的巡逻四边形向西伸出，野狗仍按北、中、南路归属原防区。
  const patrolRoutes=[0,2,1].map(i=>{
    const p=camps[i];return [{x:p.x-14,y:p.y+6},{x:p.x-28,y:p.y+6},{x:p.x-28,y:p.y-9},{x:p.x-14,y:p.y-9}];
  });
  const junctions=[{x:45,y:31},{x:82,y:31},{x:45,y:58},{x:82,y:58}];
  const roadTargets=[...spawns,...resources,...foodPoints,{x:23,y:47},{x:30,y:60},{x:40,y:78},...camps.map(p=>({x:p.x-14,y:p.y+6}))];
  for(const p of roadTargets){
    const junction=junctions.reduce((best,q)=>Math.hypot(p.x-q.x,p.y-q.y)<Math.hypot(p.x-best.x,p.y-best.y)?q:best);
    road(p,junction);
  }
  for(const [a,b] of [[0,1],[0,2],[1,3],[2,3]])road(junctions[a],junctions[b]);
  for(const route of patrolRoutes)for(let i=0;i<route.length;i++)road(route[i],route[(i+1)%route.length]);
  // 在道路确定后生成地貌，避免先画再清造成碎岛。每块地貌沿缓慢转向的轴线叠加椭圆，
  // 只保留最大的连续部分；因此轮廓可以弯曲，但不会用零散小圆凑覆盖率。
  const largestComponent=cells=>{
    let largest=[];
    while(cells.size){
      const first=cells.values().next().value,queue=[first];cells.delete(first);
      for(let i=0;i<queue.length;i++){
        const cell=queue[i],x=cell%width,y=Math.floor(cell/width);
        for(const next of [cell-1,cell+1,cell-width,cell+width]){
          if((next===cell-1&&x===0)||(next===cell+1&&x===width-1)||(next===cell-width&&y===0)||(next===cell+width&&y===height-1))continue;
          if(cells.delete(next))queue.push(next);
        }
      }
      if(queue.length>largest.length)largest=queue;
    }
    return largest;
  };
  const makeLandmass=(type,bounds={x0:8,x1:width-9,y0:6,y1:height-7})=>{
    let x=integer(bounds.x0,bounds.x1),y=integer(bounds.y0,bounds.y1),angle=random()*Math.PI*2;
    const cells=new Set(),stamps=integer(type===1?3:4,type===1?6:8);
    for(let n=0;n<stamps;n++){
      angle+=(random()-.5)*(type===1?.8:1.05);
      const along=integer(type===1?4:5,type===1?7:8),across=integer(type===1?2:3,type===1?4:5);
      const cos=Math.cos(angle),sin=Math.sin(angle),radius=along+1;
      for(let yy=Math.max(0,Math.floor(y-radius));yy<Math.min(height,Math.ceil(y+radius+1));yy++)for(let xx=Math.max(0,Math.floor(x-radius));xx<Math.min(width,Math.ceil(x+radius+1));xx++){
        const dx=xx-x,dy=yy-y,u=(dx*cos+dy*sin)/along,v=(-dx*sin+dy*cos)/across;
        const edge=1+.08*Math.sin(xx*.9+yy*1.3+n);
        const cell=yy*width+xx;
        if(u*u+v*v<edge&&!protectedCells[cell]&&terrain[cell]===0)cells.add(cell);
      }
      const step=integer(3,6);x+=Math.cos(angle)*step;y+=Math.sin(angle)*step;
    }
    const component=largestComponent(cells);
    if(component.length<24)return [];
    let minX=width,maxX=0,minY=height,maxY=0;
    for(const cell of component){const cx=cell%width,cy=Math.floor(cell/width);minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);}
    const spanX=maxX-minX+1,spanY=maxY-minY+1;
    return spanX>=4&&spanY>=4&&Math.max(spanX,spanY)>=8?component:[];
  };
  const center={x0:Math.floor(width/4),x1:Math.ceil(width*3/4)-1,y0:Math.floor(height/4),y1:Math.ceil(height*3/4)-1};
  const inCenter=cell=>{const x=cell%width,y=Math.floor(cell/width);return x>=center.x0&&x<=center.x1&&y>=center.y0&&y<=center.y1;};
  const specs=[[1,.08],[2,.12]],counts=new Map(),centerCounts=new Map();
  // 先满足中央山林总配额，避免汇入中央枢纽的道路把全部地貌挤到地图外圈。
  const centerTarget=Math.ceil((center.x1-center.x0+1)*(center.y1-center.y0+1)*.10);let centerCount=0,centerAttempts=0;
  while(centerCount<centerTarget&&centerAttempts++<2000){
    const mountainShare=centerCount?(centerCounts.get(1)||0)/centerCount:0,type=mountainShare<.4?1:2;
    const component=makeLandmass(type,center);
    for(const cell of component){
      terrain[cell]=type;counts.set(type,(counts.get(type)||0)+1);
      if(inCenter(cell)){centerCount++;centerCounts.set(type,(centerCounts.get(type)||0)+1);}
    }
  }
  if(centerCount<centerTarget)throw new Error('随机进攻中央连续地形生成空间不足');
  for(const [type,ratio] of specs){
    const target=Math.ceil(width*height*ratio);let attempts=0;
    while((counts.get(type)||0)<target&&attempts++<1000){
      const component=makeLandmass(type);
      for(const cell of component){terrain[cell]=type;counts.set(type,(counts.get(type)||0)+1);}
    }
    if((counts.get(type)||0)<target)throw new Error(`随机进攻地形 ${type} 连续区域生成空间不足`);
  }
  return {version:1,seed,width,height,terrain,resources,foodPoints,camps,spawns,towers,patrolRoutes,patrol:patrolRoutes.flat()};
}
