import {W,H,STATS,createMap} from './data.js';
import {findPath,nearestFree,walkable,index} from './pathfinding.js';
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class Game{
  constructor(){
    this.map=createMap();this.units=[];this.buildings=[];this.projectiles=[];this.effects=[];this.time=0;this.nextId=1;this.food=180;this.ore=120;this.queue=[];this.result=null;this.visionTimer=0;
    this.visible=[new Array(W*H).fill(0),new Array(W*H).fill(0)];this.explored=[new Array(W*H).fill(0),new Array(W*H).fill(0)];
    this.addBuilding('base',0,12,32);
    this.map.camps.forEach((p,i)=>{this.addBuilding('camp',1,p.x,p.y);for(let n=0;n<7;n++){const u=this.addUnit(n<4?'shield':'archer',1,p.x-6+(n%3)*2,p.y-4+Math.floor(n/3)*3);u.home={x:u.x,y:u.y};u.role='guard';u.camp=i;}});
    for(let n=0;n<14;n++)this.addUnit(n<8?'shield':'archer',0,19+(n%4)*2,27+Math.floor(n/4)*2.2);
    for(let n=0;n<5;n++){const u=this.addUnit(n<3?'shield':'archer',1,57+n*1.3,29);u.role='patrol';u.patrolIndex=0;}
    this.updateVision();
  }
  addBuilding(type,team,x,y){const b={id:this.nextId++,type,team,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,building:true,revealUntil:0};this.buildings.push(b);return b;}
  addUnit(type,team,x,y){const p=nearestFree(this.map,this.buildings,x,y)||{x,y};const u={id:this.nextId++,type,team,...p,hp:STATS[type].hp,maxHp:STATS[type].hp,order:'idle',path:[],goal:null,targetId:null,cooldown:0,repath:0,holdFire:false,revealUntil:0,facing:0};this.units.push(u);return u;}
  entities(){return [...this.units,...this.buildings].filter(e=>e.hp>0);}
  canSee(team,e){return e.team===team||!!this.visible[team][index(e.x,e.y)];}
  updateVision(){
    for(const v of this.visible)v.fill(0);
    const paint=(team,x,y,r)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(H-1,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(W-1,Math.ceil(x+r));xx++)if((xx+.5-x)**2+(yy+.5-y)**2<=r*r)this.visible[team][yy*W+xx]=1;};
    for(const e of this.entities()){paint(e.team,e.x,e.y,STATS[e.type].vision);if(e.revealUntil>this.time)paint(1-e.team,e.x,e.y,2);}
    for(let t=0;t<2;t++)for(let i=0;i<W*H;i++)if(this.visible[t][i])this.explored[t][i]=1;
  }
  command(ids,kind,point,targetId=null){
    if(this.result)return;
    const selected=this.units.filter(u=>ids.includes(u.id)&&u.team===0&&u.hp>0),cols=Math.ceil(Math.sqrt(selected.length));
    selected.forEach((u,i)=>{
      u.targetId=null;u.path=[];u.goal=null;u.holdFire=kind==='stop';u.order=kind==='stop'?'hold':kind;u.repath=0;
      if(kind==='stop')return;
      if(targetId){const target=this.entities().find(e=>e.id===targetId&&e.team!==0&&this.canSee(0,e));if(target)u.targetId=target.id;}
      const p=nearestFree(this.map,this.buildings,point.x+(i%cols-(cols-1)/2)*1.2,point.y+(Math.floor(i/cols)-(Math.ceil(selected.length/cols)-1)/2)*1.2);
      if(p){u.goal=p;u.path=findPath(this.map,this.buildings,u,p);}
    });
  }
  train(type){
    if(!['shield','archer'].includes(type)||this.result)return '当前不能训练';
    const s=STATS[type];if(this.units.filter(u=>u.team===0&&u.hp>0).length+this.queue.length>=40)return '人口已达上限';
    if(this.queue.length>=8)return '训练队列已满';if(this.food<s.food||this.ore<s.ore)return '资源不足，基地正在持续生产';
    this.food-=s.food;this.ore-=s.ore;this.queue.push({type,remaining:3});return null;
  }
  step(dt){
    if(this.result)return;this.time+=dt;this.food+=3*dt;this.ore+=2*dt;
    if(this.queue.length){this.queue[0].remaining-=dt;if(this.queue[0].remaining<=0){const q=this.queue.shift();const n=this.units.filter(u=>u.team===0).length;this.addUnit(q.type,0,15+n%3,35+Math.floor(n%9/3));}}
    this.visionTimer-=dt;if(this.visionTimer<=0){this.updateVision();this.visionTimer=.15;}
    const entities=this.entities();
    for(const u of this.units){
      if(u.hp<=0)continue;const s=STATS[u.type];u.cooldown=Math.max(0,u.cooldown-dt);u.repath-=dt;
      if(u.holdFire)continue;
      let target=entities.find(e=>e.id===u.targetId&&e.hp>0&&this.canSee(u.team,e));
      if(target&&u.role==='guard'&&distance(u,u.home)>11)target=null;
      if(target&&u.role==='patrol'&&distance(u,target)>14)target=null;
      if(!target){u.targetId=null;
        if(u.order!=='move'){
          const candidates=entities.filter(e=>e.team!==u.team&&e.hp>0&&this.canSee(u.team,e)&&distance(u,e)<=s.vision&&(u.role!=='guard'||(distance(u,u.home)<=11&&distance(e,u.home)<13)));
          candidates.sort((a,b)=>(distance(u,a)+(a.building?3:0))-(distance(u,b)+(b.building?3:0)));target=candidates[0];if(target)u.targetId=target.id;
        }
      }
      if(target){
        const reach=s.range+(target.building?1.5:0);
        if(distance(u,target)<=reach){
          u.facing=Math.atan2(target.y-u.y,target.x-u.x);
          if(u.cooldown<=0){u.cooldown=s.cooldown;u.revealUntil=this.time+2;
            if(u.type==='archer')this.projectiles.push({x:u.x,y:u.y,fromX:u.x,fromY:u.y,targetId:target.id,team:u.team,damage:s.damage,life:2});
            else{this.damage(target,s.damage);this.effects.push({x:target.x,y:target.y,team:u.team,kind:'hit',life:.22,maxLife:.22});}
          }
          continue;
        }
        if(u.repath<=0){u.path=findPath(this.map,this.buildings,u,target);u.repath=.8;}
      }else{
        if(u.role==='guard'&&distance(u,u.home)>1){if(u.repath<=0){u.path=findPath(this.map,this.buildings,u,u.home);u.repath=1;}}
        else if(u.role==='patrol'){
          const p=this.map.patrol[u.patrolIndex];if(distance(u,p)<2)u.patrolIndex=(u.patrolIndex+1)%this.map.patrol.length;
          if(!u.path.length||u.repath<=0){u.path=findPath(this.map,this.buildings,u,this.map.patrol[u.patrolIndex]);u.repath=2;}
        }else if(u.goal){if(distance(u,u.goal)<.8){u.goal=null;u.path=[];u.order='idle';}else if(!u.path.length||u.repath<=0){u.path=findPath(this.map,this.buildings,u,u.goal);u.repath=1.5;}}
        else if(u.targetId===null&&u.order==='idle')u.path=[];
      }
      this.move(u,s.speed*dt);
    }
    this.separate(dt);
    for(const p of this.projectiles){const target=entities.find(e=>e.id===p.targetId&&e.hp>0);if(!target){p.life=0;continue;}const d=distance(p,target),step=22*dt;p.life-=dt;if(d<=step){p.x=target.x;p.y=target.y;this.damage(target,p.damage);this.effects.push({x:p.x,y:p.y,team:p.team,kind:'hit',life:.3,maxLife:.3});p.life=0;}else{p.x+=(target.x-p.x)/d*step;p.y+=(target.y-p.y)/d*step;}}
    this.projectiles=this.projectiles.filter(p=>p.life>0);this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
    this.units=this.units.filter(u=>u.hp>0);
    if(this.buildings.find(b=>b.team===0).hp<=0)this.result='defeat';else if(this.buildings.filter(b=>b.team===1).every(b=>b.hp<=0))this.result='victory';
  }
  damage(e,amount){e.hp=Math.max(0,e.hp-Math.max(1,amount-STATS[e.type].armor));}
  move(u,amount){
    while(u.path.length&&amount>0){const p=u.path[0],d=distance(u,p);if(!walkable(this.map,this.buildings,Math.floor(p.x),Math.floor(p.y))){u.path=[];return;}u.facing=Math.atan2(p.y-u.y,p.x-u.x);if(d<=amount){u.x=p.x;u.y=p.y;u.path.shift();amount-=d;}else{u.x+=(p.x-u.x)/d*amount;u.y+=(p.y-u.y)/d*amount;amount=0;}}
  }
  separate(dt){
    for(let i=0;i<this.units.length;i++)for(let j=i+1;j<this.units.length;j++){
      const a=this.units[i],b=this.units[j],d=distance(a,b);if(d>=.85)continue;
      const dx=d>.001?(a.x-b.x)/d:1,dy=d>.001?(a.y-b.y)/d:0,k=Math.min((.85-d)*.5,dt*1.5);
      for(const [u,sign]of [[a,1],[b,-1]]){const x=u.x+dx*k*sign,y=u.y+dy*k*sign;if(walkable(this.map,this.buildings,Math.floor(x),Math.floor(y))){u.x=x;u.y=y;}}
    }
  }
  snapshot(){return {map:this.map,units:this.units,buildings:this.buildings,projectiles:this.projectiles,effects:this.effects,time:this.time,food:this.food,ore:this.ore,queue:this.queue,result:this.result,visible:this.visible,explored:this.explored};}
}
