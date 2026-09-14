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
  for(const [type,count] of [[1,7],[2,12]])for(let n=0;n<count;n++){
    const p=point(28,118,7,80),rx=integer(type===1?4:5,type===1?8:10),ry=integer(4,11);
    for(let y=Math.max(0,p.y-ry);y<Math.min(height,p.y+ry+1);y++)for(let x=Math.max(0,p.x-rx);x<Math.min(width,p.x+rx+1);x++)
      if(((x-p.x)/rx)**2+((y-p.y)/ry)**2<1)terrain[y*width+x]=type;
  }
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
  const junction={x:55,y:44};
  for(const p of [...spawns,...resources,...foodPoints,{x:23,y:47},{x:30,y:60},{x:40,y:78},...camps.map(p=>({x:p.x-14,y:p.y+6}))])road(p,junction);
  for(const route of patrolRoutes)for(let i=0;i<route.length;i++)road(route[i],route[(i+1)%route.length]);
  // 清路可能削去大部分山林；在未预留的平地补成片地形，不覆盖任何通路。
  for(const type of [1,2]){
    let count=terrain.filter(t=>t===type).length;
    for(const p of candidates){
      if(count>=120)break;
      for(let y=Math.max(0,p.y-4);y<Math.min(height,p.y+5);y++)for(let x=Math.max(0,p.x-4);x<Math.min(width,p.x+5);x++){
        const cell=y*width+x;
        if((x-p.x)**2+(y-p.y)**2<20&&!protectedCells[cell]&&terrain[cell]===0){terrain[cell]=type;count++;}
      }
    }
  }
  return {version:1,seed,width,height,terrain,resources,foodPoints,camps,spawns,towers,patrolRoutes,patrol:patrolRoutes.flat()};
}
