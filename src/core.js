import {STATS,TECHNOLOGIES,createMap,createMapAttack,createMapBalanced,createMapDefend,DETECTION_MULTIPLIERS,MOVEMENT_MULTIPLIERS,usedPop} from './data.js';
import {findPath,nearestFree,walkable,buildingCells,spawnPoint} from './pathfinding.js';
import {DefendAI,AssaultAI,BalancedAI} from './ai.js';
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const TRAIN_QUEUE_LIMIT=50;
// 视线消耗系数：陆地视野经过每格时消耗 1/侦测系数 的有效侦测距离
const TERRAIN_COST=DETECTION_MULTIPLIERS.map(m=>1/m);
export class Game{
  constructor(level='demo'){
    this.level=level;this.defense=null;
    this.map=level==='balanced'?createMapBalanced():level==='attack'?createMapAttack():level==='defend'?createMapDefend():createMap();
    this.units=[];this.buildings=[];this.projectiles=[];this.effects=[];this.audioEvents=[];this.time=0;this.nextId=1;
    const playerStart=(level==='attack'||level==='defend'||level==='demo')?5000:1000,aiStart=(level==='attack'||level==='defend')?2000:1000;
    this.food=playerStart;this.ore=playerStart;this.queue=[];this.aiFood=aiStart;this.aiOre=aiStart;this.aiQueue=[];
    this.technologies=Object.fromEntries(Object.keys(TECHNOLOGIES).map(id=>[id,{status:level==='demo'?'complete':'locked',remaining:0}]));
    this.result=null;this.visionTimer=0;this.revision=0;this.visionVersion=0;
    this.visible=[new Array(this.map.width*this.map.height).fill(0),new Array(this.map.width*this.map.height).fill(0)];this.explored=[new Array(this.map.width*this.map.height).fill(0),new Array(this.map.width*this.map.height).fill(0)];
    this.ghosts=[{buildings:new Map(),units:new Map()},{buildings:new Map(),units:new Map()}];
    if(level==='balanced'){this.aiFood=500;this.aiOre=500;}
    this.setupLevel();
    this.ai=level==='balanced'?new BalancedAI():level==='attack'?new DefendAI():level==='defend'?new AssaultAI():null;
    this.updateVision();
  }
  cellIndex(x,y){return Math.floor(y)*this.map.width+Math.floor(x);}
  setupLevel(){
    if(this.level==='balanced'){
      for(const team of [0,1]){
        const p=this.map.spawns[team];
        this.addBuilding('base',team,p.x,p.y).primary=true;
        const node=this.map.resources[team],food=this.map.foodPoints[team];
        this.addBuilding('mine',team,node.x+.5,node.y+.5);
        this.addBuilding('factory',team,food.x+.5,food.y+.5);
        for(let n=0;n<12;n++){
          const x=20+(n%4)*2,y=66+Math.floor(n/4)*2;
          this.addUnit(n<6?'shield':'archer',team,team?this.map.width-x:x,team?this.map.height-y:y);
        }
      }
      return;
    }
    if(this.level==='demo'){
      this.addBuilding('base',0,12,32).primary=true;
      this.addBuilding('machineFactory',0,6,32);
      this.map.camps.forEach((p,i)=>{this.addBuilding('camp',1,p.x,p.y);for(let n=0;n<30;n++){const u=this.addUnit(n<17?'shield':'archer',1,p.x-6+(n%3)*2,p.y-4+Math.floor(n/3)*3);u.home={x:u.x,y:u.y};u.role='guard';u.camp=i;}});
      for(let n=0;n<30;n++)this.addUnit(n<17?'shield':'archer',0,19+(n%6)*2,27+Math.floor(n/6)*2.2);
      for(let n=0;n<10;n++){const u=this.addUnit(n<6?'shield':'archer',1,57+n*1.3,29);u.role='patrol';u.patrolIndex=0;}
      return;
    }
    if(this.level==='defend'){
      const firstWave=Math.random()<.5?40:60;
      this.defense={sizes:[firstWave,firstWave/2],wave:0,nextWaveAt:120};
      this.addBuilding('base',0,12,32).primary=true;
      this.addBuilding('machineFactory',0,6,32);
      this.addBuilding('mine',0,22.5,40.5);
      this.addBuilding('factory',0,16.5,22.5);
      this.spawnDefenseArmy(firstWave,0);
      this.spawnDefenseArmy(firstWave,1);
      return;
    }
    // 双方经济建筑直接完工。
    this.addBuilding('base',0,12,32).primary=true;
    this.addBuilding('machineFactory',0,6,32);
    this.addBuilding('mine',0,22.5,40.5);
    this.addBuilding('factory',0,16.5,22.5);
    this.addBuilding('base',1,84,32).primary=true;
    this.addBuilding('mine',1,72.5,24.5);
    this.addBuilding('factory',1,79.5,22.5);
    if(this.level==='attack'){
      // 我方 50 盾、50 弓，沿西侧展开。
      for(const type of ['shield','archer'])for(let n=0;n<50;n++){
        const front=type==='shield',x=(front?30:18)+Math.floor(n/12)*2,y=4+(n%12)*5;
        this.addUnit(type,0,x,y);
      }
      // 五个防区各有一座哨塔、8 盾、8 弓。
      for(const [sector,y] of [8,20,32,44,56].entries()){
        const tower=this.addBuilding('tower',1,68,y);tower.defenseSector=sector;
        for(const [type,count,x] of [['shield',8,63],['archer',8,72]])for(let n=0;n<count;n++){
          const u=this.addUnit(type,1,x+(n%2)*1.6,y-4.8+Math.floor(n/2)*2.2);
          u.home={x:u.x,y:u.y};u.role='guard';u.defenseSector=sector;
        }
      }
      return;
    }
    for(let n=0;n<20;n++)this.addUnit(n<10?'shield':'archer',0,19+(n%4)*2,27+Math.floor(n/4)*2.2);
    for(let n=0;n<22;n++){
      const u=this.addUnit(n<14?'shield':'archer',1,78+(n%4)*2,27+Math.floor(n/4)*2.2);
      u.home={x:u.x,y:u.y};u.role='guard';
    }
  }
  spawnDefenseArmy(count,team){
    const shields=Math.round(count*1.2/2.2);
    for(let n=0;n<count;n++){
      // 每列十人，盾兵在朝向战场的一侧，弓兵在后；避开己方经济建筑。
      const front=n<shields,index=front?n:n-shields;
      const depth=Math.floor(index/10),x=team?(front?74+depth*2:84+depth*2):(front?30-depth*2:22-depth*2);
      const u=this.addUnit(front?'shield':'archer',team,x,24+(index%10)*2);
      if(team){u.home={x:u.x,y:u.y};u.role='guard';}
    }
  }
  addBuilding(type,team,x,y){const b={id:this.nextId++,type,team,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,building:true,revealUntil:0,cooldown:0};this.buildings.push(b);return b;}
  addUnit(type,team,x,y){const p=nearestFree(this.map,this.buildings,x,y)||{x,y};const u={id:this.nextId++,type,team,...p,hp:STATS[type].hp,maxHp:STATS[type].hp,order:'idle',path:[],waypoints:[],allowMountains:false,goal:null,targetId:null,cooldown:0,repath:0,holdFire:false,revealUntil:0,facing:0,flying:!!STATS[type].air};if(u.flying&&(u.x<5||u.x>this.map.width-5||u.y<5||u.y>this.map.height-5))u.facing=Math.atan2(this.map.height/2-u.y,this.map.width/2-u.x);this.units.push(u);return u;}
  entities(){return [...this.units,...this.buildings].filter(e=>e.hp>0);}
  canSee(team,e){return e.team===team||!!this.visible[team][this.cellIndex(e.x,e.y)];}
  detectionRange(e){return this.isFlying(e)||!('visionGround' in STATS[e.type])?STATS[e.type].vision:STATS[e.type].visionGround;}
  movementSpeed(u){if(STATS[u.type].air)return this.isFlying(u)?STATS[u.type].speed:0;return STATS[u.type].speed*(MOVEMENT_MULTIPLIERS[this.map.terrain[this.cellIndex(u.x,u.y)]]??1);}
  // 是否应避让慢速地形（山地、森林）：非飞行、未开启穿越，且脚下在平地上（便于从慢速地形中走出）
  avoidsMountains(u){return !this.isFlying(u)&&!u.allowMountains&&this.map.terrain[this.cellIndex(u.x,u.y)]===0;}
  isFlying(u){return !!STATS[u.type].air&&u.flying!==false;}
  canEngage(u,e){if(STATS[u.type].airOnly)return this.isFlying(u)&&this.isFlying(e);return !this.isFlying(e)||this.isFlying(u)||!!STATS[u.type].antiAir;}
  toggleFlight(ids,point){
    if(this.result)return;
    for(const u of this.units.filter(u=>ids.includes(u.id)&&u.team===0&&u.hp>0&&STATS[u.type].air)){
      const landing=this.isFlying(u);
      this.command([u.id],'move',point);
      if(landing){u.landing=nearestFree(this.map,this.buildings,point.x,point.y);u.goal=u.landing;}
      else{u.flying=true;u.path=[];u.buildingId=null;u.goal={...point};if(u.x<5||u.x>this.map.width-5||u.y<5||u.y>this.map.height-5)u.facing=Math.atan2(this.map.height/2-u.y,this.map.width/2-u.x);}
    }
    this.revision++;this.updateVision();
  }
  // 对空射程与伤害：弓箭兵、强弩兵对空射程 2，哨塔 6；伤害减半；空中近战用自身射程和伤害
  attackRange(u,e){const s=STATS[u.type];return this.isFlying(e)&&s.antiAir?(s.antiAirRange??2):s.range+(e.building?(STATS[e.type].halfSize||2)-.5:0);}
  attackDamage(u,e){const s=STATS[u.type];return this.isFlying(e)&&s.antiAir?s.damage/2:s.damage;}
  pathFor(u,end){
    if(this.isFlying(u))return [];
    const avoid=this.avoidsMountains(u);
    const buildings=u.leavingId!=null?this.buildings.filter(b=>b.id!==u.leavingId):this.buildings;
    if(avoid&&end===u.goal){const p=nearestFree(this.map,buildings,end.x,end.y,true);if(p){u.goal=p;end=p;}}
    return findPath(this.map,buildings,u,end,avoid);
  }
  updateVision(){
    this.visionVersion++;
    for(const v of this.visible)v.fill(0);
    // 森林格对飞行侦察（信鸽）只累加为已探索：能看见森林地形，但看不到藏在其中的敌人；其余单位正常照亮。
    const circle=(team,x,y,r,pigeonOnly=false)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(this.map.height-1,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(this.map.width-1,Math.ceil(x+r));xx++)if((xx+.5-x)**2+(yy+.5-y)**2<=r*r){const idx=yy*this.map.width+xx;if(pigeonOnly&&this.map.terrain[idx]===2)this.explored[team][idx]=1;else this.visible[team][idx]=1;}};
    // 陆地视野按视线消耗：以侦测距离为预算，每进入一格消耗 1/侦测系数（森林贵、山地省）
    const sight=(team,x,y,budget)=>{
      const vis=this.visible[team],terrain=this.map.terrain;
      const dist=new Float64Array(this.map.width*this.map.height);dist.fill(Infinity);
      const ox=Math.max(0,Math.min(this.map.width-1,Math.floor(x))),oy=Math.max(0,Math.min(this.map.height-1,Math.floor(y)));
      const heap=[[0,ox,oy]],push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=n[0])break;heap[i]=heap[p];i=p;}heap[i]=n;},pop=()=>{const t=heap[0],l=heap.pop();if(heap.length){let i=0;while(true){let m=i,a=i*2+1,b=a+1;if(a<heap.length&&heap[a][0]<heap[m][0])m=a;if(b<heap.length&&heap[b][0]<heap[m][0])m=b;if(m===i)break;heap[i]=heap[m];i=m;}heap[i]=l;}return t;};
      dist[oy*this.map.width+ox]=0;vis[oy*this.map.width+ox]=1;
      while(heap.length){
        const [c,x,y]=pop();
        for(let sy=-1;sy<=1;sy++)for(let sx=-1;sx<=1;sx++){
          if(!sx&&!sy)continue;const nx=x+sx,ny=y+sy;
          if(nx<0||ny<0||nx>=this.map.width||ny>=this.map.height)continue;
          const nc=c+(sx&&sy?Math.SQRT2:1)*TERRAIN_COST[terrain[ny*this.map.width+nx]];
          if(nc<=budget&&nc<dist[ny*this.map.width+nx]){dist[ny*this.map.width+nx]=nc;vis[ny*this.map.width+nx]=1;push([nc,nx,ny]);}
        }
      }
    };
    for(const e of this.entities()){if(e.building&&e.constructionPending)continue;const r=this.detectionRange(e);if(this.isFlying(e))circle(e.team,e.x,e.y,r,true);else sight(e.team,e.x,e.y,r);if(e.revealUntil>this.time)circle(1-e.team,e.x,e.y,2);}
    for(let t=0;t<2;t++)for(let i=0;i<this.map.width*this.map.height;i++)if(this.visible[t][i])this.explored[t][i]=1;
    this.updateGhosts();
  }
  // 残影：离开视野后保留最后一次看到的敌方实体快照；建筑永久保留，部队 60 秒淡化。
  updateGhosts(){
    for(let t=0;t<2;t++){
      const vis=this.visible[t],enemy=1-t,{buildings:bmap,units:umap}=this.ghosts[t];
      for(const [id,g] of bmap)if(vis[this.cellIndex(g.x,g.y)]&&!this.buildings.some(b=>b.id===id&&b.hp>0))bmap.delete(id);
      for(const [idx,g] of umap){
        if(this.time-g.seenAt>60){umap.delete(idx);continue;}
        if(vis[idx]&&!this.units.some(u=>u.hp>0&&u.team===enemy&&this.cellIndex(u.x,u.y)===idx))umap.delete(idx);
      }
    }
    for(const e of this.entities()){
      const t=1-e.team;if(!this.visible[t][this.cellIndex(e.x,e.y)])continue;
      if(e.building)this.ghosts[t].buildings.set(e.id,{type:e.type,x:e.x,y:e.y});
      else this.ghosts[t].units.set(this.cellIndex(e.x,e.y),{type:e.type,x:e.x,y:e.y,seenAt:this.time});
    }
  }
  command(ids,kind,point,targetId=null,append=false,allowMountains=false,team=0){
    if(this.result)return;this.revision++;
    const selected=this.units.filter(u=>ids.includes(u.id)&&u.team===team&&u.hp>0),cols=Math.ceil(Math.sqrt(selected.length));
    selected.forEach((u,i)=>{
      if(STATS[u.type].air&&!this.isFlying(u)&&(kind==='move'||kind==='attack')){u.flying=true;if(u.x<5||u.x>this.map.width-5||u.y<5||u.y>this.map.height-5)u.facing=Math.atan2(this.map.height/2-u.y,this.map.width/2-u.x);}
      u.buildingId=null;u.landing=null;u.orbit=null;u.landingEscape=false;
      if(!append)u.allowMountains=allowMountains&&kind==='move';
      const p=kind==='stop'?null:this.isFlying(u)?{x:point.x,y:point.y}:nearestFree(this.map,this.buildings,point.x+(i%cols-(cols-1)/2)*1.2,point.y+(Math.floor(i/cols)-(Math.ceil(selected.length/cols)-1)/2)*1.2,this.avoidsMountains(u));
      if(append&&kind==='move'&&u.goal&&p){
        u.waypoints.push(p);u.order='move';u.holdFire=false;u.targetId=null;
        u.path=this.pathFor(u,u.goal);u.repath=1.5;
        return;
      }
      u.waypoints=[];
      u.targetId=null;u.path=[];u.goal=null;u.holdFire=kind==='stop';u.order=kind==='stop'?'hold':kind;u.repath=0;
      if(kind==='stop')return;
      if(targetId){const target=this.entities().find(e=>e.id===targetId&&e.team!==team&&this.canSee(team,e));if(target&&this.canEngage(u,target))u.targetId=target.id;}
      if(p){u.goal=p;u.path=this.pathFor(u,p);}
    });
  }
  placement(type,point,team=0){
    if(!['base','mine','tower','factory','machineFactory'].includes(type))return {error:'未知建筑'};
    const r=STATS[type].halfSize||2,odd=(r*2)%2===1;
    // 建筑按区块（整格）占地：奇数尺寸中心在区块中心（x.5），偶数尺寸中心在格点上
    let p={x:odd?Math.floor(point.x)+.5:Math.round(point.x),y:odd?Math.floor(point.y)+.5:Math.round(point.y)};
    if(type==='mine'){
      const node=this.map.resources.find(n=>distance({x:n.x+.5,y:n.y+.5},point)<=2.5);
      if(!node)return {error:'采矿场只能建在矿产资源点上',...p};
      // 矿点为区块：奇数尺寸中心对齐区块中心；偶数尺寸取区块四角中离点击最近的格点为中心
      p=odd?{x:node.x+.5,y:node.y+.5}:{x:Math.abs(node.x+1-point.x)<Math.abs(node.x-point.x)?node.x+1:node.x,y:Math.abs(node.y+1-point.y)<Math.abs(node.y-point.y)?node.y+1:node.y};
    }
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<r||p.y<r||p.x>this.map.width-r||p.y>this.map.height-r)return {...p,error:'建筑不能超出地图'};
    const c=buildingCells({type,x:p.x,y:p.y});
    if(this.buildings.some(b=>{if(b.hp<=0)return false;const o=buildingCells(b);return c.x0<=o.x1&&o.x0<=c.x1&&c.y0<=o.y1&&o.y0<=c.y1;}))return {...p,error:'与现有建筑冲突'};
    for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++)if(!this.visible[team][this.cellIndex(x,y)])return {...p,error:'请在己方当前视野内建造'};
    const inCells=u=>u.hp>0&&!this.isFlying(u)&&Math.floor(u.x)>=c.x0&&Math.floor(u.x)<=c.x1&&Math.floor(u.y)>=c.y0&&Math.floor(u.y)<=c.y1;
    if(this.units.some(u=>inCells(u)&&(u.team!==team||STATS[u.type].movable===false||STATS[u.type].air)))return {...p,error:'请先移开占地内的部队'};
    return {...p,evict:this.units.some(u=>inCells(u))};
  }
  build(ids,type,point,team=0){
    if(this.result)return '战局已结束';
    if(!this.units.some(u=>ids.includes(u.id)&&u.team===team&&u.hp>0))return '请先选择部队';
    const p=this.placement(type,point,team);if(p.error)return p.error;
    const s=STATS[type];if(this[team===0?'food':'aiFood']<s.food||this[team===0?'ore':'aiOre']<s.ore)return '资源不足';
    const site={...p,hp:s.hp,team,type},c=buildingCells(site);
    const evictees=this.units.filter(u=>u.hp>0&&!this.isFlying(u)&&u.team===team&&STATS[u.type].movable!==false&&Math.floor(u.x)>=c.x0&&Math.floor(u.x)<=c.x1&&Math.floor(u.y)>=c.y0&&Math.floor(u.y)<=c.y1);
    if(!evictees.length){
      const assignments=this.builderAssignments(ids,site);
      if(!assignments.length)return '选中部队无法到达建筑周边';
      this[team===0?'food':'aiFood']-=s.food;this[team===0?'ore':'aiOre']-=s.ore;const b=this.addBuilding(type,team,p.x,p.y);
      b.constructionRemaining=s.buildTime||0;b.constructionPending=true;b.activeBuilders=0;
      this.dispatchBuilders(b,assignments);
    }else{
      const list=[...this.buildings,site];
      const dests=evictees.map(u=>{u.allowMountains=true;return {u,target:this.evictTarget(site,u,list)};});
      if(dests.some(d=>!d.target)){for(const d of dests)d.u.allowMountains=false;return '请先移开占地内的部队';}
      this[team===0?'food':'aiFood']-=s.food;this[team===0?'ore':'aiOre']-=s.ore;const b=this.addBuilding(type,team,p.x,p.y);
      b.constructionRemaining=s.buildTime||0;b.constructionPending=true;b.awaitingEviction=true;b.activeBuilders=0;b.builderIds=ids;
      for(const {u,target} of dests){u.buildingId=null;u.waypoints=[];u.targetId=null;u.holdFire=false;u.leavingId=b.id;u.order='move';u.goal=target;u.path=this.pathFor(u,target);u.repath=1.5;}
    }
    this.revision++;this.updateVision();return null;
  }
  evictTarget(b,u,list=this.buildings){
    const r=STATS[b.type].halfSize||2,dx=u.x-b.x,dy=u.y-b.y,d=Math.hypot(dx,dy);
    return nearestFree(this.map,list,b.x+(d>1e-6?dx/d:1)*(r+2),b.y+(d>1e-6?dy/d:0)*(r+2),this.avoidsMountains(u));
  }
  stillLeaving(u){
    if(u.leavingId==null)return false;
    const b=this.buildings.find(b=>b.id===u.leavingId&&b.hp>0);
    if(!b)return false;
    const c=buildingCells(b);
    return Math.floor(u.x)>=c.x0&&Math.floor(u.x)<=c.x1&&Math.floor(u.y)>=c.y0&&Math.floor(u.y)<=c.y1;
  }
  builderAssignments(ids,b){
    const assigned=this.units.filter(u=>u.hp>0&&!STATS[u.type].air&&u.buildingId===b.id&&u.order==='build');
    const buildings=this.buildings.includes(b)?this.buildings:[...this.buildings,b],spots=[];
    const r=STATS[b.type].halfSize||2,c=buildingCells(b);
    for(let i=c.x0;i<=c.x1;i++)for(const p of [{x:i+.5,y:b.y-r-.5},{x:i+.5,y:b.y+r+.5}]){
      if(!spots.some(q=>distance(p,q)<.1)&&!assigned.some(u=>u.goal&&distance(u.goal,p)<.8))spots.push(p);
    }
    for(let j=c.y0;j<=c.y1;j++)for(const p of [{x:b.x-r-.5,y:j+.5},{x:b.x+r+.5,y:j+.5}]){
      if(!spots.some(q=>distance(p,q)<.1)&&!assigned.some(u=>u.goal&&distance(u.goal,p)<.8))spots.push(p);
    }
    const result=[];
    for(const u of this.units.filter(u=>ids.includes(u.id)&&u.team===b.team&&u.hp>0&&!STATS[u.type].air&&!assigned.includes(u)).sort((a,c)=>distance(a,b)-distance(c,b))){
      if(result.length+assigned.length>=(STATS[b.type].maxBuilders||4))break;
      for(const p of [...spots].sort((a,c)=>distance(a,u)-distance(c,u))){
        if(!walkable(this.map,buildings,Math.floor(p.x),Math.floor(p.y)))continue;
        const path=findPath(this.map,buildings,u,p,false);
        if(!path.length&&distance(u,p)>.65)continue;
        result.push({u,p,path});spots.splice(spots.indexOf(p),1);break;
      }
    }
    return result;
  }
  dispatchBuilders(b,assignments){
    for(const {u,p,path} of assignments){u.buildingId=b.id;u.order='build';u.goal=p;u.path=path;u.waypoints=[];u.targetId=null;u.holdFire=false;u.allowMountains=true;u.repath=1;}
  }
  assistBuild(ids,id){
    if(this.result)return '战局已结束';
    const b=this.buildings.find(b=>b.id===id&&b.team===0&&b.hp>0&&b.constructionPending);
    if(!b)return '请选择未完工的己方建筑';
    const assignments=this.builderAssignments(ids,b);
    if(!assignments.length)return '施工人员已满或选中部队无法到达';
    this.dispatchBuilders(b,assignments);this.revision++;return null;
  }
  releaseBuilder(u){u.buildingId=null;u.order='idle';u.goal=null;u.path=[];u.waypoints=[];u.allowMountains=false;u.holdFire=false;}
  releaseBuilders(b){for(const u of this.units){if(u.buildingId===b.id)this.releaseBuilder(u);else if(u.leavingId===b.id){u.leavingId=null;u.allowMountains=false;}}}
  demolish(id){
    if(this.result)return '战局已结束';
    const b=this.buildings.find(b=>b.id===id&&b.team===0&&b.hp>0);
    if(!b)return '请选择己方建筑';
    b.hp=0;this.releaseBuilders(b);if(b.primary&&!['defend','balanced'].includes(this.level)){this.queue=[];this.result='defeat';}
    if(['defend','balanced'].includes(this.level)&&!this.buildings.some(b=>b.team===0&&b.hp>0))this.result='defeat';
    this.revision++;this.updateVision();return null;
  }
  // 进攻固定 200 人口、防守固定 100 人口；其他模式按已完工且存活的基地叠加。
  popCap(team=0){
    if(this.level==='attack')return 200;
    if(this.level==='defend')return 100;
    return this.buildings.reduce((n,b)=>n+(b.team===team&&b.hp>0&&!b.constructionPending?STATS[b.type].pop||0:0),0);
  }
  technologyComplete(id){return this.technologies[id]?.status==='complete';}
  research(id){
    if(this.result||!TECHNOLOGIES[id])return '当前不能研发';
    const tech=this.technologies[id];
    if(tech.status==='complete')return '科技已完成';
    if(tech.status==='researching')return '科技正在研发';
    const s=TECHNOLOGIES[id];if(this.food<s.food||this.ore<s.ore)return '资源不足';
    this.food-=s.food;this.ore-=s.ore;tech.status='researching';tech.remaining=s.researchTime;this.revision++;return null;
  }
  stepTechnologies(dt){
    for(const tech of Object.values(this.technologies))if(tech.status==='researching'){
      tech.remaining=Math.max(0,tech.remaining-dt);
      if(tech.remaining<=0){tech.remaining=0;tech.status='complete';}
    }
  }
  productionType(type,team=0){
    if(team!==0)return type;
    if(type==='shield'&&this.technologyComplete('compositeShield'))return 'ironShield';
    if(type==='archer'&&this.technologyComplete('precisionBolts'))return 'crossbow';
    return type;
  }
  train(type,producerId=null){
    if(!['shield','archer','armoredCar','steamWalker','wilddog','pigeon'].includes(type)||this.result)return '当前不能训练';
    const machine=!!STATS[type].machine,producerType=machine?'machineFactory':'base';
    if(type==='armoredCar'&&!this.technologyComplete('castIron'))return '需要先完成铸铁装甲';
    if(type==='steamWalker'&&!['castIron','artillery','steamCore'].every(id=>this.technologyComplete(id)))return '需要先完成铸铁装甲、火炮和蒸汽核心';
    const producer=this.buildings.find(b=>b.type===producerType&&b.team===0&&b.hp>0&&!b.constructionPending&&(producerId===null||b.id===producerId));
    if(!producer)return machine?'请选择已完工的机械工厂':'请选择已完工的基地';
    const s=STATS[type];if(usedPop(this.units,0,this.queue)>=this.popCap())return '人口已达上限';
    if(this.queue.filter(q=>q.baseId===producer.id).length>=TRAIN_QUEUE_LIMIT)return '所选生产建筑队列已满';if(this.food<s.food||this.ore<s.ore)return '资源不足';
    this.food-=s.food;this.ore-=s.ore;this.queue.push({type,remaining:s.trainTime||3,baseId:producer.id});this.revision++;return null;
  }
  cancelTraining(producerId,queueIndex){
    if(this.result)return '战局已结束';
    const producer=this.buildings.find(b=>b.id===producerId&&['base','machineFactory'].includes(b.type)&&b.team===0&&b.hp>0&&!b.constructionPending);
    if(!producer)return '请选择已完工的生产建筑';
    const entries=this.queue.filter(q=>q.baseId===producer.id),q=entries[queueIndex];
    if(!q)return '训练项目不存在';
    this.queue.splice(this.queue.indexOf(q),1);
    this.food+=STATS[q.type].food;this.ore+=STATS[q.type].ore;this.revision++;return null;
  }
  setRallyPoint(producerId,point,team=0){
    if(this.result)return '战局已结束';
    const producer=this.buildings.find(b=>b.id===producerId&&['base','machineFactory'].includes(b.type)&&b.team===team&&b.hp>0&&!b.constructionPending);
    if(!producer)return '请选择已完工的己方生产建筑';
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>=this.map.width||point.y>=this.map.height)return '请在地图范围内设置集结点';
    producer.rallyPoint={x:point.x,y:point.y};this.revision++;return null;
  }
  // AI 训练：与玩家相同的费用、人口与队列规则，使用 AI 自己的资源
  aiTrain(type){
    if(!['shield','ironShield','archer','crossbow','armoredCar','steamWalker','wilddog','pigeon'].includes(type)||this.result)return '当前不能训练';
    const producerType=STATS[type].machine?'machineFactory':'base';
    const producers=this.buildings.filter(b=>b.type===producerType&&b.team===1&&b.hp>0&&!b.constructionPending);
    const base=producers.sort((a,b)=>this.aiQueue.filter(q=>q.baseId===a.id).length-this.aiQueue.filter(q=>q.baseId===b.id).length||a.id-b.id)[0];
    if(!base)return producerType==='base'?'AI 无可用基地':'AI 无可用机械工厂';
    const s=STATS[type];
    const cap=this.popCap(1);
    if(usedPop(this.units,1,this.aiQueue)>=cap)return '人口已达上限';
    if(this.aiQueue.filter(q=>q.baseId===base.id).length>=TRAIN_QUEUE_LIMIT)return '训练队列已满';
    if(this.aiFood<s.food||this.aiOre<s.ore)return '资源不足';
    this.aiFood-=s.food;this.aiOre-=s.ore;this.aiQueue.push({type,remaining:s.trainTime||3,baseId:base.id});this.revision++;return null;
  }
  foodRate(b){
    const c=buildingCells(b);
    return (this.map.foodPoints||[]).some(n=>n.x>=c.x0&&n.x<=c.x1&&n.y>=c.y0&&n.y<=c.y1)?6:3;
  }
  stepTrainingQueue(queue,team,dt){
    const producers=this.buildings.filter(b=>['base','machineFactory'].includes(b.type)&&b.team===team&&b.hp>0&&!b.constructionPending);
    const liveIds=new Set(producers.map(b=>b.id));
    for(let i=queue.length-1;i>=0;i--)if(!liveIds.has(queue[i].baseId))queue.splice(i,1);
    for(const producer of producers){
      const index=queue.findIndex(q=>q.baseId===producer.id);if(index<0)continue;
      const q=queue[index];q.remaining-=dt;
      if(q.remaining>0)continue;
      queue.splice(index,1);
      const n=this.units.filter(u=>u.team===team).length;
      const p=spawnPoint(this.map,this.buildings,producer,n);
      const u=this.addUnit(this.productionType(q.type,team),team,p.x,p.y);
      if(team===1){u.home={x:u.x,y:u.y};u.role=this.level==='balanced'?'army':'guard';}
      if(producer.rallyPoint)this.command([u.id],'move',producer.rallyPoint,null,false,false,team);
    }
  }
  step(dt){
    if(this.result)return;this.revision++;this.time+=dt;
    this.stepTechnologies(dt);
    const healed=new Set();
    for(const u of this.units)u.healing=false;
    for(const b of this.buildings){
      if(b.hp<=0){this.releaseBuilders(b);continue;}
      let productionTime=dt;
      if(b.awaitingEviction){
        const c=buildingCells(b);
        const any=this.units.some(u=>u.hp>0&&!this.isFlying(u)&&Math.floor(u.x)>=c.x0&&Math.floor(u.x)<=c.x1&&Math.floor(u.y)>=c.y0&&Math.floor(u.y)<=c.y1);
        if(any){
          for(const u of this.units.filter(u=>u.hp>0&&!this.isFlying(u)&&u.team===b.team&&Math.floor(u.x)>=c.x0&&Math.floor(u.x)<=c.x1&&Math.floor(u.y)>=c.y0&&Math.floor(u.y)<=c.y1)){
            u.leavingId=b.id;
            if(u.order!=='move'||!u.path.length){
              const target=this.evictTarget(b,u);
              if(target){u.buildingId=null;u.waypoints=[];u.targetId=null;u.holdFire=false;u.allowMountains=true;u.order='move';u.goal=target;u.path=this.pathFor(u,target);u.repath=1.5;}
            }
          }
          continue;
        }
        b.awaitingEviction=false;
        for(const u of this.units)if(u.leavingId===b.id){u.leavingId=null;u.allowMountains=false;}
        const assignments=this.builderAssignments(b.builderIds,b);
        if(assignments.length)this.dispatchBuilders(b,assignments);
        continue;
      }
      if(b.constructionPending){
        const workers=this.units.filter(u=>u.hp>0&&u.team===b.team&&u.order==='build'&&u.buildingId===b.id&&u.goal&&distance(u,u.goal)<=.65).slice(0,STATS[b.type].maxBuilders||4);
        b.activeBuilders=workers.length;productionTime=0;
        if(workers.length){
          const finishTime=b.constructionRemaining/workers.length;
          b.constructionRemaining=Math.max(0,b.constructionRemaining-dt*workers.length);
          if(b.constructionRemaining<=1e-8){b.constructionRemaining=0;b.constructionPending=false;b.activeBuilders=0;productionTime=Math.max(0,dt-finishTime);this.releaseBuilders(b);}
        }
      }
      if(b.type==='mine'){if(b.team===0)this.ore+=5*productionTime;else this.aiOre+=5*productionTime;}
      if(b.type==='factory'){const amount=this.foodRate(b)*productionTime;if(b.team===0)this.food+=amount;else this.aiFood+=amount;}
      // 基地本身不生产任何资源，食物与矿产均需依赖采矿场 / 食物厂。
      if(b.type==='base'&&productionTime>0){
        const s=STATS.base;
        const patients=this.units.filter(u=>u.team===b.team&&u.hp>0&&u.hp<u.maxHp&&!healed.has(u.id)&&distance(u,b)<=s.healRange)
          .sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||a.id-c.id).slice(0,s.healTargets);
        for(const u of patients){u.hp=Math.min(u.maxHp,u.hp+s.healRate*productionTime);u.healing=true;healed.add(u.id);}
      }
    }
    this.stepTrainingQueue(this.queue,0,dt);
    this.stepTrainingQueue(this.aiQueue,1,dt);
    if(this.ai)this.ai.update(this,dt);
    this.visionTimer-=dt;if(this.visionTimer<=0){this.updateVision();this.visionTimer=.15;}
    const entities=this.entities();
    for(const u of this.units){
      if(u.hp<=0)continue;const s=STATS[u.type];u.cooldown=Math.max(0,u.cooldown-dt);u.repath-=dt;
      if(this.isFlying(u)){this.stepFlight(u,dt,entities);continue;}
      if(u.order==='build'){
        const b=this.buildings.find(b=>b.id===u.buildingId&&b.hp>0&&b.constructionPending);
        if(!b){this.releaseBuilder(u);continue;}
        if(u.goal&&distance(u,u.goal)>.65){
          if(u.repath<=0){u.path=this.pathFor(u,u.goal);u.repath=1;}
          this.move(u,this.movementSpeed(u)*dt);
        }else{u.path=[];u.facing=Math.atan2(b.y-u.y,b.x-u.x);}
        continue;
      }
      if(u.holdFire)continue;
      let target=entities.find(e=>e.id===u.targetId&&e.hp>0&&this.canSee(u.team,e)&&this.canEngage(u,e));
      if(target&&u.role==='guard'&&distance(u,u.home)>11)target=null;
      if(target&&u.role==='patrol'&&distance(u,target)>14)target=null;
      if(!target){u.targetId=null;
        if(u.order!=='move'){
          const candidates=entities.filter(e=>e.team!==u.team&&e.hp>0&&this.canSee(u.team,e)&&this.canEngage(u,e)&&distance(u,e)<=this.detectionRange(u)&&(u.role!=='guard'||(distance(u,u.home)<=11&&distance(e,u.home)<13)));
          candidates.sort((a,b)=>(distance(u,a)+(a.building?3:0))-(distance(u,b)+(b.building?3:0)));target=candidates[0];if(target)u.targetId=target.id;
        }
      }
      if(target){
        if(distance(u,target)<=this.attackRange(u,target)){
          u.facing=Math.atan2(target.y-u.y,target.x-u.x);
          if(u.cooldown<=0){u.cooldown=s.cooldown;u.revealUntil=this.time+2;
            const dmg=this.attackDamage(u,target);
            if(s.ranged){this.projectiles.push({x:u.x,y:u.y,fromX:u.x,fromY:u.y,targetId:target.id,team:u.team,damage:dmg,kind:s.projectileKind||'arrow',splashDamage:s.splashDamage||0,splashRadius:s.splashRadius||0,life:2});if(s.audioEvent)this.audioEvents.push(s.audioEvent);}
            else{this.damage(target,dmg);this.effects.push({x:target.x,y:target.y,team:u.team,kind:'hit',life:.22,maxLife:.22});}
          }
          continue;
        }
        if(u.repath<=0){u.path=this.pathFor(u,target);u.repath=.8;}
      }else{
        if(u.role==='guard'&&u.order!=='move'&&distance(u,u.home)>1){if(u.repath<=0){u.path=this.pathFor(u,u.home);u.repath=1;}}
        else if(u.role==='patrol'){
          const p=this.map.patrol[u.patrolIndex];if(distance(u,p)<2)u.patrolIndex=(u.patrolIndex+1)%this.map.patrol.length;
          if(!u.path.length||u.repath<=0){u.path=this.pathFor(u,this.map.patrol[u.patrolIndex]);u.repath=2;}
        }else if(u.goal){if(distance(u,u.goal)<.8&&!this.stillLeaving(u)){u.goal=u.waypoints.shift()||null;u.path=u.goal?this.pathFor(u,u.goal):[];u.order=u.goal?'move':'idle';if(!u.goal)u.allowMountains=false;u.repath=1.5;}else if(!u.path.length||u.repath<=0){u.path=this.pathFor(u,u.goal);u.repath=1.5;}}
        else if(u.targetId===null&&u.order==='idle')u.path=[];
      }
      this.move(u,this.movementSpeed(u)*dt);
    }
    for(const tower of this.buildings.filter(b=>b.type==='tower'&&b.hp>0&&!b.constructionPending)){
      const s=STATS.tower;tower.cooldown=Math.max(0,tower.cooldown-dt);
      const target=entities.filter(e=>e.team!==tower.team&&e.hp>0&&this.canSee(tower.team,e)&&this.canEngage(tower,e)&&distance(tower,e)<=this.detectionRange(tower)&&distance(tower,e)<=this.attackRange(tower,e)).sort((a,b)=>distance(tower,a)-distance(tower,b))[0];
      if(target&&tower.cooldown<=0){tower.cooldown=s.cooldown;tower.revealUntil=this.time+2;
        this.projectiles.push({x:tower.x,y:tower.y,fromX:tower.x,fromY:tower.y,targetId:target.id,team:tower.team,damage:this.attackDamage(tower,target),life:2});
      }
    }
    this.separate(dt);
    for(const p of this.projectiles){const target=entities.find(e=>e.id===p.targetId&&e.hp>0);if(!target){p.life=0;continue;}const d=distance(p,target),step=22*dt;p.life-=dt;if(d<=step){p.x=target.x;p.y=target.y;this.damage(target,p.damage);if(p.splashDamage&&p.splashRadius){for(const e of entities)if(e.team!==p.team&&e.hp>0&&distance(p,e)<=p.splashRadius)this.damage(e,p.splashDamage);this.effects.push({x:p.x,y:p.y,team:p.team,kind:'explosion',radius:p.splashRadius,life:.45,maxLife:.45});}else this.effects.push({x:p.x,y:p.y,team:p.team,kind:'hit',life:.3,maxLife:.3});p.life=0;}else{p.x+=(target.x-p.x)/d*step;p.y+=(target.y-p.y)/d*step;}}
    this.projectiles=this.projectiles.filter(p=>p.life>0);this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
    this.units=this.units.filter(u=>u.hp>0);
    const primary=b=>this.buildings.find(x=>x.team===b&&x.primary);
    if(this.level==='defend'){
      if(!this.buildings.some(b=>b.team===0&&b.hp>0))this.result='defeat';
      else if(this.defense.wave===2&&!this.units.some(u=>u.team===1&&u.hp>0))this.result='victory';
    }
    else if(this.level==='balanced'){
      if(!this.buildings.some(b=>b.team===0&&b.hp>0))this.result='defeat';
      else if(this.buildings.filter(b=>b.team===1).every(b=>b.hp<=0))this.result='victory';
    }
    else if(primary(0).hp<=0)this.result='defeat';
    else if(this.buildings.filter(b=>b.team===1).every(b=>b.hp<=0))this.result='victory';
  }
  stepFlight(u,dt,entities){
    const s=STATS[u.type],r=s.orbitRadius;
    let target=!u.holdFire&&!u.landing&&entities.find(e=>e.id===u.targetId&&e.hp>0&&this.canSee(u.team,e)&&this.canEngage(u,e));
    if(!target&&!u.holdFire&&!u.landing&&u.order!=='move')target=entities.filter(e=>e.team!==u.team&&e.hp>0&&this.canSee(u.team,e)&&this.canEngage(u,e)&&distance(u,e)<=this.detectionRange(u)).sort((a,b)=>distance(u,a)-distance(u,b))[0];
    u.targetId=target?.id??null;
    if(target&&distance(u,target)<=this.attackRange(u,target)&&u.cooldown<=0){
      u.cooldown=s.cooldown;u.revealUntil=this.time+2;this.damage(target,this.attackDamage(u,target));
      this.effects.push({x:target.x,y:target.y,team:u.team,kind:'hit',life:.22,maxLife:.22});
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
        const cx=Math.max(r+1,Math.min(this.map.width-r-1,center.x)),cy=Math.max(r+1,Math.min(this.map.height-r-1,center.y));
        const dx=u.x-cx,dy=u.y-cy,d=Math.hypot(dx,dy);
        desired=Math.atan2(dy,dx)+Math.PI/2+s.speed*h/Math.max(d,.5)+Math.atan((d-r)/(r*0.5));
      }
      // 提前朝地图内部转弯，不通过夹紧位置或瞬间掉头破坏曲率约束。
      const margin=s.minTurnRadius*2+1;
      const landingAligned=u.landing&&Math.abs(angleDiff(Math.atan2(u.landing.y-u.y,u.landing.x-u.x)-u.facing))<.4;
      if(!landingAligned&&((u.x<margin&&Math.cos(u.facing)<0)||(u.x>this.map.width-margin&&Math.cos(u.facing)>0)||(u.y<margin&&Math.sin(u.facing)<0)||(u.y>this.map.height-margin&&Math.sin(u.facing)>0)))u.boundaryReturn=true;
      if(landingAligned||(u.x>margin&&u.x<this.map.width-margin&&u.y>margin&&u.y<this.map.height-margin))u.boundaryReturn=false;
      if(u.boundaryReturn)desired=Math.atan2(this.map.height/2-u.y,this.map.width/2-u.x);
      const length=s.speed*h,limit=length/s.minTurnRadius,turn=Math.max(-limit,Math.min(limit,angleDiff(desired-u.facing)));
      const heading=u.facing;
      if(Math.abs(turn)<1e-9){u.x+=Math.cos(heading)*length;u.y+=Math.sin(heading)*length;}
      else{u.x+=length/turn*(Math.sin(heading+turn)-Math.sin(heading));u.y+=length/turn*(Math.cos(heading)-Math.cos(heading+turn));}
      u.facing=angleDiff(heading+turn);
      if(u.landing&&distance(u,u.landing)<.25&&walkable(this.map,this.buildings,Math.floor(u.x),Math.floor(u.y))){
        u.flying=false;u.landing=null;u.goal=null;u.orbit=null;u.path=[];u.order='idle';u.targetId=null;break;
      }
      if(u.landing&&!walkable(this.map,this.buildings,Math.floor(u.landing.x),Math.floor(u.landing.y)))u.landing=nearestFree(this.map,this.buildings,u.landing.x,u.landing.y);
    }
  }
  damage(e,amount){e.hp=Math.max(0,e.hp-Math.max(1,amount-STATS[e.type].armor));e.lastDamagedAt=this.time;}
  consumeAudioEvents(){const events=this.audioEvents;this.audioEvents=[];return events;}
  move(u,amount){
    if(STATS[u.type].air&&!this.isFlying(u))return;
    const buildings=u.leavingId!=null?this.buildings.filter(b=>b.id!==u.leavingId):this.buildings;
    const wasInSlow=this.map.terrain[this.cellIndex(u.x,u.y)]!==0;
    while(u.path.length&&amount>0){const p=u.path[0],d=distance(u,p);if(!walkable(this.map,buildings,Math.floor(p.x),Math.floor(p.y),this.avoidsMountains(u))){u.path=[];u.repath=0;return;}u.facing=Math.atan2(p.y-u.y,p.x-u.x);if(d<=amount){u.x=p.x;u.y=p.y;u.path.shift();amount-=d;}else{u.x+=(p.x-u.x)/d*amount;u.y+=(p.y-u.y)/d*amount;amount=0;}}
    if(wasInSlow&&this.avoidsMountains(u)){u.path=[];u.repath=0;}
  }
  separate(dt){
    // 待机（无目标、无路径、未受令）的单位彼此保持更宽松的默认间距，行动或交战时收缩为轻微分离
    const atRest=u=>u.targetId==null&&u.path.length===0&&u.order==='idle';
    for(let i=0;i<this.units.length;i++)for(let j=i+1;j<this.units.length;j++){
      const a=this.units[i],b=this.units[j];if(this.isFlying(a)||this.isFlying(b))continue;
      const d=distance(a,b),collisionGap=(STATS[a.type].collisionRadius||.425)+(STATS[b.type].collisionRadius||.425),gap=atRest(a)&&atRest(b)?Math.max(1.6,collisionGap):collisionGap;
      if(d>=gap)continue;
      const dx=d>.001?(a.x-b.x)/d:1,dy=d>.001?(a.y-b.y)/d:0,k=Math.min((gap-d)*.5,dt*1.5);
      for(const [u,sign]of [[a,1],[b,-1]]){if(STATS[u.type].air)continue;const x=u.x+dx*k*sign,y=u.y+dy*k*sign;if(walkable(this.map,this.buildings,Math.floor(x),Math.floor(y),this.avoidsMountains(u))){u.x=x;u.y=y;}}
    }
  }
  snapshot(){return {revision:this.revision,visionVersion:this.visionVersion,level:this.level,defense:this.defense?{...this.defense,sizes:[...this.defense.sizes]}:null,map:this.map,units:this.units,buildings:this.buildings,projectiles:this.projectiles,effects:this.effects,time:this.time,food:this.food,ore:this.ore,aiFood:this.aiFood,aiOre:this.aiOre,popCap:this.popCap(),queue:this.queue,technologies:this.technologies,result:this.result,visible:this.visible,explored:this.explored,ghosts:[0,1].map(t=>({buildings:[...this.ghosts[t].buildings.values()],units:[...this.ghosts[t].units.values()]}))};}
}
