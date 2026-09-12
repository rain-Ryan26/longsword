import {separateUnits} from './separation.js';
import {createLevelMap,setupLevel} from './levels.js';
import {productionType,populationCap,researchError,trainingPlan,foodRate,BUILDING_TYPES} from './rules.js';
export {TRAIN_QUEUE_LIMIT} from './rules.js';
import {VisionSystem} from './vision.js';
import {STATS,TECHNOLOGIES,MOVEMENT_MULTIPLIERS} from './data.js';
import {findPath,nearestFree,walkable,buildingCells,spawnPoint} from './pathfinding.js';
import {DefendAI,AssaultAI,BalancedAI} from './ai.js';
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class Game{
  constructor(level='demo'){
    this.level=level;this.defense=null;
    this.vision=new VisionSystem();
    this.map=createLevelMap(level);
    this.units=[];this.buildings=[];this.projectiles=[];this.effects=[];this.audioEvents=[];this.time=0;this.nextId=1;
    const playerStart=(level==='attack'||level==='defend'||level==='demo')?5000:1000,aiStart=(level==='attack'||level==='defend')?2000:1000;
    this.food=playerStart;this.ore=playerStart;this.queue=[];this.aiFood=aiStart;this.aiOre=aiStart;this.aiQueue=[];
    this.technologies=Object.fromEntries(Object.keys(TECHNOLOGIES).map(id=>[id,{status:level==='demo'?'complete':'locked',remaining:0}]));
    this.result=null;this.visionTimer=0;this.revision=0;this.visionVersion=0;
    this.visible=[new Array(this.map.width*this.map.height).fill(0),new Array(this.map.width*this.map.height).fill(0)];this.explored=[new Array(this.map.width*this.map.height).fill(0),new Array(this.map.width*this.map.height).fill(0)];
    this.ghosts=[{buildings:new Map(),units:new Map()},{buildings:new Map(),units:new Map()}];
    if(level==='balanced'){this.aiFood=500;this.aiOre=500;}
    this.density=new Float32Array(this.map.width*this.map.height);
    this.setupLevel();
    this.ai=level==='balanced'?new BalancedAI():level==='attack'?new DefendAI():level==='defend'?new AssaultAI():null;
    this.playerAI=level==='balanced'?new BalancedAI(0):null;
    this.playerAIControl=false;
    this.updateVision();
  }
  cellIndex(x,y){return Math.floor(y)*this.map.width+Math.floor(x);}
  setupLevel(){setupLevel(this);}
  spawnDefenseArmy(shields,archers,team){
    // 每列十人，盾兵在朝向战场的一侧，弓兵在后；避开己方经济建筑。
    for(const [type,count,baseX] of [['shield',shields,team?74:30],['archer',archers,team?84:22]]){
      for(let n=0;n<count;n++){
        const depth=Math.floor(n/10),x=team?baseX+depth*2:baseX-depth*2;
        const u=this.addUnit(type,team,x,24+(n%10)*2);
        if(team){u.home={x:u.x,y:u.y};u.role='guard';}
      }
    }
  }
  addBuilding(type,team,x,y){const b={id:this.nextId++,type,team,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,building:true,revealUntil:0,cooldown:0};this.buildings.push(b);return b;}
  addUnit(type,team,x,y){const p=nearestFree(this.map,this.buildings,x,y)||{x,y};const u={id:this.nextId++,type,team,...p,hp:STATS[type].hp,maxHp:STATS[type].hp,order:'idle',path:[],waypoints:[],allowMountains:false,allowForests:false,goal:null,targetId:null,cooldown:0,repath:0,holdFire:false,revealUntil:0,facing:0,flying:!!STATS[type].air};if(u.flying&&(u.x<5||u.x>this.map.width-5||u.y<5||u.y>this.map.height-5))u.facing=Math.atan2(this.map.height/2-u.y,this.map.width/2-u.x);this.units.push(u);return u;}
  entities(){return [...this.units,...this.buildings].filter(e=>e.hp>0);}
  canSee(team,e){return e.team===team||!!this.visible[team][this.cellIndex(e.x,e.y)];}
  detectionRange(e){return this.isFlying(e)||!('visionGround' in STATS[e.type])?STATS[e.type].vision:STATS[e.type].visionGround;}
  movementSpeed(u){if(STATS[u.type].air)return this.isFlying(u)?STATS[u.type].speed:0;return STATS[u.type].speed*(MOVEMENT_MULTIPLIERS[this.map.terrain[this.cellIndex(u.x,u.y)]]??1);}
  // 分别返回是否避让山地、森林；BOT 默认可穿森林，单位在慢速地形中时先允许走出。
  terrainAvoidance(u){return this.isFlying(u)||this.map.terrain[this.cellIndex(u.x,u.y)]!==0?[false,false]:[!u.allowMountains,!(u.allowForests||u.team===1)];}
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
    const [avoidMountains,avoidForests]=this.terrainAvoidance(u);
    const buildings=u.leavingId!=null?this.buildings.filter(b=>b.id!==u.leavingId):this.buildings;
    if((avoidMountains||avoidForests)&&end===u.goal){const p=nearestFree(this.map,buildings,end.x,end.y,avoidMountains,avoidForests);if(p){u.goal=p;end=p;}}
    return findPath(this.map,buildings,u,end,avoidMountains,avoidForests,this.density);
  }
  // 拥挤密度网格：每 tick 重建，供寻路代价与移动减速使用
  updateDensity(){
    const size=this.map.width*this.map.height;
    if(!this.density||this.density.length!==size)this.density=new Float32Array(size);else this.density.fill(0);
    for(const u of this.units)if(u.hp>0&&!this.isFlying(u))this.density[this.cellIndex(u.x,u.y)]++;
  }
  updateVision(){this.vision.update(this);}
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
      if(!append){u.allowMountains=kind!=='stop'&&allowMountains;u.allowForests=kind!=='stop'&&allowMountains;}
      const avoidance=this.terrainAvoidance(u);
      const p=kind==='stop'?null:this.isFlying(u)?{x:point.x,y:point.y}:nearestFree(this.map,this.buildings,point.x+(i%cols-(cols-1)/2)*1.2,point.y+(Math.floor(i/cols)-(Math.ceil(selected.length/cols)-1)/2)*1.2,...avoidance);
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
    if(!BUILDING_TYPES.includes(type))return {error:'未知建筑'};
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
      const dests=evictees.map(u=>{u.allowMountains=true;u.allowForests=true;return {u,target:this.evictTarget(site,u,list)};});
      if(dests.some(d=>!d.target)){for(const d of dests){d.u.allowMountains=false;d.u.allowForests=false;}return '请先移开占地内的部队';}
      this[team===0?'food':'aiFood']-=s.food;this[team===0?'ore':'aiOre']-=s.ore;const b=this.addBuilding(type,team,p.x,p.y);
      b.constructionRemaining=s.buildTime||0;b.constructionPending=true;b.awaitingEviction=true;b.activeBuilders=0;b.builderIds=ids;
      for(const {u,target} of dests){u.buildingId=null;u.waypoints=[];u.targetId=null;u.holdFire=false;u.leavingId=b.id;u.order='move';u.goal=target;u.path=this.pathFor(u,target);u.repath=1.5;}
    }
    this.revision++;this.updateVision();return null;
  }
  evictTarget(b,u,list=this.buildings){
    const r=STATS[b.type].halfSize||2,dx=u.x-b.x,dy=u.y-b.y,d=Math.hypot(dx,dy);
    return nearestFree(this.map,list,b.x+(d>1e-6?dx/d:1)*(r+2),b.y+(d>1e-6?dy/d:0)*(r+2),...this.terrainAvoidance(u));
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
    for(const {u,p,path} of assignments){u.buildingId=b.id;u.order='build';u.goal=p;u.path=path;u.waypoints=[];u.targetId=null;u.holdFire=false;u.allowMountains=true;u.allowForests=true;u.repath=1;}
  }
  assistBuild(ids,id){
    if(this.result)return '战局已结束';
    const b=this.buildings.find(b=>b.id===id&&b.team===0&&b.hp>0&&b.constructionPending);
    if(!b)return '请选择未完工的己方建筑';
    const assignments=this.builderAssignments(ids,b);
    if(!assignments.length)return '施工人员已满或选中部队无法到达';
    this.dispatchBuilders(b,assignments);this.revision++;return null;
  }
  releaseBuilder(u){u.buildingId=null;u.order='idle';u.goal=null;u.path=[];u.waypoints=[];u.allowMountains=false;u.allowForests=false;u.holdFire=false;}
  releaseBuilders(b){for(const u of this.units){if(u.buildingId===b.id)this.releaseBuilder(u);else if(u.leavingId===b.id){u.leavingId=null;u.allowMountains=false;u.allowForests=false;}}}
  demolish(id){
    if(this.result)return '战局已结束';
    const b=this.buildings.find(b=>b.id===id&&b.team===0&&b.hp>0);
    if(!b)return '请选择己方建筑';
    b.hp=0;this.releaseBuilders(b);if(b.primary&&!['defend','balanced'].includes(this.level)){this.queue=[];this.result='defeat';}
    if(['defend','balanced'].includes(this.level)&&!this.buildings.some(b=>b.team===0&&b.hp>0))this.result='defeat';
    this.revision++;this.updateVision();return null;
  }
  popCap(team=0){return populationCap(this,team);}
  technologyComplete(id){return this.technologies[id]?.status==='complete';}
  research(id){
    const error=researchError(this,id);
    if(error)return error;
    const tech=this.technologies[id],s=TECHNOLOGIES[id];
    this.food-=s.food;this.ore-=s.ore;tech.status='researching';tech.remaining=s.researchTime;this.revision++;return null;
  }
  stepTechnologies(dt){
    for(const tech of Object.values(this.technologies))if(tech.status==='researching'){
      tech.remaining=Math.max(0,tech.remaining-dt);
      if(tech.remaining<=0){tech.remaining=0;tech.status='complete';}
    }
  }
  productionType(type,team=0){return productionType(type,this.technologies,team);}
  train(type,producerId=null){return this.enqueueTraining(type,producerId,0);}
  enqueueTraining(type,producerId,team){
    const plan=trainingPlan(this,type,producerId,team);
    if(plan.error)return plan.error;
    const {cost,queue,producer,foodKey,oreKey}=plan;
    this[foodKey]-=cost.food;
    this[oreKey]-=cost.ore;
    queue.push({type,remaining:cost.trainTime||3,baseId:producer.id});
    this.revision++;
    return null;
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
  aiTrain(type){return this.enqueueTraining(type,null,1);}
  setPlayerAIControl(on){this.playerAIControl=!!on&&this.playerAI!=null;}
  foodRate(building){return foodRate(this.map,building);}
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
    if(this.result)return;
    this.revision++;
    this.time+=dt;
    this.stepTechnologies(dt);
    this.stepBuildings(dt);
    this.stepTrainingQueue(this.queue,0,dt);
    this.stepTrainingQueue(this.aiQueue,1,dt);
    if(this.ai)this.ai.update(this,dt);
    if(this.playerAI&&this.playerAIControl)this.playerAI.update(this,dt);
    this.visionTimer-=dt;
    if(this.visionTimer<=0){this.updateVision();this.visionTimer=.15;}
    this.updateDensity();
    const entities=this.entities(),entityById=new Map(entities.map(e=>[e.id,e]));
    this.stepUnits(dt,entities,entityById);
    this.stepTowers(dt,entities);
    this.separate(dt);
    this.stepProjectiles(dt,entities,entityById);
    this.cleanup(dt);
    this.updateResult();
  }
  stepBuildings(dt){
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
              if(target){u.buildingId=null;u.waypoints=[];u.targetId=null;u.holdFire=false;u.allowMountains=true;u.allowForests=true;u.order='move';u.goal=target;u.path=this.pathFor(u,target);u.repath=1.5;}
            }
          }
          continue;
        }
        b.awaitingEviction=false;
        for(const u of this.units)if(u.leavingId===b.id){u.leavingId=null;u.allowMountains=false;u.allowForests=false;}
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
  }
  stepUnits(dt,entities,entityById){
    for(const u of this.units){
      if(u.hp<=0)continue;const s=STATS[u.type];u.cooldown=Math.max(0,u.cooldown-dt);u.repath-=dt;
      if(this.isFlying(u)){this.stepFlight(u,dt,entities,entityById);continue;}
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
      let target=entityById.get(u.targetId);
      if(target&&(target.hp<=0||!this.canSee(u.team,target)||!this.canEngage(u,target)))target=null;
      if(target&&u.role==='guard'&&distance(u,u.home)>11)target=null;
      if(target&&u.role==='patrol'&&distance(u,target)>14)target=null;
      if(!target){u.targetId=null;
        if(u.order!=='move'){
          target=this.acquireTarget(u,entities,{guard:true,preferUnits:true});
          if(target)u.targetId=target.id;
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
        }else if(u.goal){if(distance(u,u.goal)<.8&&!this.stillLeaving(u)){u.goal=u.waypoints.shift()||null;u.path=u.goal?this.pathFor(u,u.goal):[];u.order=u.goal?'move':'idle';if(!u.goal){u.allowMountains=false;u.allowForests=false;}u.repath=1.5;}else if(!u.path.length||u.repath<=0){u.path=this.pathFor(u,u.goal);u.repath=1.5;}}
        else if(u.targetId===null&&u.order==='idle')u.path=[];
      }
      this.move(u,this.movementSpeed(u)*dt);
    }
  }
  stepTowers(dt,entities){
    for(const tower of this.buildings.filter(b=>b.type==='tower'&&b.hp>0&&!b.constructionPending)){
      const s=STATS.tower;tower.cooldown=Math.max(0,tower.cooldown-dt);
      const target=this.acquireTarget(tower,entities,{tower:true});
      if(target&&tower.cooldown<=0){tower.cooldown=s.cooldown;tower.revealUntil=this.time+2;
        this.projectiles.push({x:tower.x,y:tower.y,fromX:tower.x,fromY:tower.y,targetId:target.id,team:tower.team,damage:this.attackDamage(tower,target),life:2});
      }
    }
  }
  stepProjectiles(dt,entities,entityById){
    for(const projectile of this.projectiles){
      const target=entityById.get(projectile.targetId);
      if(!target||target.hp<=0){projectile.life=0;continue;}
      const d=distance(projectile,target),step=22*dt;
      projectile.life-=dt;
      if(d<=step){
        projectile.x=target.x;projectile.y=target.y;
        this.damage(target,projectile.damage);
        if(projectile.splashDamage&&projectile.splashRadius){
          for(const entity of entities){
            if(entity.team!==projectile.team&&entity.hp>0&&distance(projectile,entity)<=projectile.splashRadius)this.damage(entity,projectile.splashDamage);
          }
          this.effects.push({x:projectile.x,y:projectile.y,team:projectile.team,kind:'explosion',radius:projectile.splashRadius,life:.45,maxLife:.45});
        }else this.effects.push({x:projectile.x,y:projectile.y,team:projectile.team,kind:'hit',life:.3,maxLife:.3});
        projectile.life=0;
      }else{
        projectile.x+=(target.x-projectile.x)/d*step;
        projectile.y+=(target.y-projectile.y)/d*step;
      }
    }
  }
  cleanup(dt){
    this.projectiles=this.projectiles.filter(p=>p.life>0);
    this.effects.forEach(e=>e.life-=dt);
    this.effects=this.effects.filter(e=>e.life>0);
    this.units=this.units.filter(u=>u.hp>0);
  }
  updateResult(){
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
  stepFlight(u,dt,entities,entityById){
    const s=STATS[u.type],r=s.orbitRadius;
    let target=!u.holdFire&&!u.landing&&entityById.get(u.targetId);
    if(target&&(target.hp<=0||!this.canSee(u.team,target)||!this.canEngage(u,target)))target=null;
    if(!target&&!u.holdFire&&!u.landing&&u.order!=='move')target=this.acquireTarget(u,entities);
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
    // 拥挤减速：同格超过 2 个单位才生效（下限 55%），窄口形成车流式通行而非互相推挤
    const crowd=this.density[this.cellIndex(u.x,u.y)];
    if(crowd>2)amount*=Math.max(.55,1-(crowd-2)*.12);
    const buildings=u.leavingId!=null?this.buildings.filter(b=>b.id!==u.leavingId):this.buildings;
    const wasInSlow=this.map.terrain[this.cellIndex(u.x,u.y)]!==0;
    // 路径走廊跳过：被挤偏后只要仍在"当前路点→下一路点"线段旁的走廊内，就跳过当前路点，
    // 顺着前方路点继续走，避免斜着回去够原格子中心、往回顶住后方单位
    while(u.path.length>1){
      const a=u.path[0],b=u.path[1],abx=b.x-a.x,aby=b.y-a.y,len2=abx*abx+aby*aby;
      const t=len2?Math.max(0,Math.min(1,((u.x-a.x)*abx+(u.y-a.y)*aby)/len2)):0;
      const px=a.x+abx*t,py=a.y+aby*t,dx=u.x-px,dy=u.y-py;
      if(dx*dx+dy*dy>.25)break;
      u.path.shift();
    }
    while(u.path.length&&amount>0){const p=u.path[0],d=distance(u,p);if(!walkable(this.map,buildings,Math.floor(p.x),Math.floor(p.y),...this.terrainAvoidance(u))){u.path=[];u.repath=0;return;}u.facing=Math.atan2(p.y-u.y,p.x-u.x);if(d<=amount){u.x=p.x;u.y=p.y;u.path.shift();amount-=d;}else{u.x+=(p.x-u.x)/d*amount;u.y+=(p.y-u.y)/d*amount;amount=0;}}
    const avoidance=this.terrainAvoidance(u);if(wasInSlow&&(avoidance[0]||avoidance[1])){u.path=[];u.repath=0;}
  }
  separate(dt){separateUnits(this,dt);}
  acquireTarget(source,entities,{guard=false,preferUnits=false,tower=false}={}){
    const range=this.detectionRange(source);
    if(guard&&source.role==='guard'&&distance(source,source.home)>11)return null;
    let best=null,bestScore=Infinity;
    for(const entity of entities){
      if(entity.team===source.team||entity.hp<=0||!this.canSee(source.team,entity)||!this.canEngage(source,entity))continue;
      const d=distance(source,entity);
      if(d>range||(tower&&d>this.attackRange(source,entity)))continue;
      if(guard&&source.role==='guard'&&distance(entity,source.home)>=13)continue;
      const score=d+(preferUnits&&entity.building?3:0);
      // 相等分数保留数组中较早的实体，维持原稳定排序的选择顺序。
      if(score<bestScore){best=entity;bestScore=score;}
    }
    return best;
  }
  snapshot(){return {revision:this.revision,visionVersion:this.visionVersion,level:this.level,defense:this.defense?{...this.defense,sizes:[...this.defense.sizes]}:null,map:this.map,units:this.units,buildings:this.buildings,projectiles:this.projectiles,effects:this.effects,time:this.time,food:this.food,ore:this.ore,aiFood:this.aiFood,aiOre:this.aiOre,popCap:this.popCap(),queue:this.queue,technologies:this.technologies,result:this.result,visible:this.visible,explored:this.explored,ghosts:[0,1].map(t=>({buildings:[...this.ghosts[t].buildings.values()],units:[...this.ghosts[t].units.values()]}))};}
}
