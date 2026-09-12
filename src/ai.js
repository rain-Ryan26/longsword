import {STATS} from './data.js';
// 进攻关卡用联防 AI，防守关卡用两波总攻 AI。
// AI 只通过 game 提供的公开接口下达指令，不读取玩家视野。
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// 联防 AI：五个防区各自驻守；一处受袭时从其他防区抽调守军，平静后归队。
export class DefendAI{
  constructor(){this.timer=0;this.responders=new Set();}
  update(game,dt){
    this.timer-=dt;if(this.timer>0)return;this.timer=2;
    const army=game.units.filter(u=>u.team===1&&u.hp>0&&['shield','ironShield','archer','crossbow','armoredCar','steamWalker'].includes(u.type));
    const alive=new Set(army.map(u=>u.id));
    for(const id of this.responders)if(!alive.has(id))this.responders.delete(id);
    const own=game.entities().filter(e=>e.team===1);
    const recentlyHit=own.filter(e=>game.time-(e.lastDamagedAt??-Infinity)<=3)
      .sort((a,b)=>(b.lastDamagedAt??0)-(a.lastDamagedAt??0))[0];
    const visible=game.units.filter(u=>u.team===0&&u.hp>0&&game.canSee(1,u));
    const threatened=visible.map(enemy=>({enemy,anchor:own.filter(e=>e.building||e.role==='guard'||e.role==='reinforce')
      .sort((a,b)=>distance(a,enemy)-distance(b,enemy))[0]}))
      .filter(x=>x.anchor&&distance(x.enemy,x.anchor)<14).sort((a,b)=>distance(a.enemy,a.anchor)-distance(b.enemy,b.anchor))[0];
    const threat=recentlyHit||threatened?.enemy;
    if(!threat){
      const returning=army.filter(u=>this.responders.has(u.id));
      for(const u of returning){u.role='guard';u.aiOrderKey=null;}
      for(const u of returning)game.command([u.id],'move',u.home,null,false,false,1);
      this.responders.clear();
      return;
    }
    const towers=game.buildings.filter(b=>b.team===1&&b.type==='tower'&&b.hp>0);
    const sector=threat.defenseSector??towers.sort((a,b)=>distance(a,threat)-distance(b,threat))[0]?.defenseSector;
    const committed=army.filter(u=>u.defenseSector===sector||this.responders.has(u.id));
    const recruits=army.filter(u=>u.defenseSector!==sector&&!this.responders.has(u.id))
      .sort((a,b)=>distance(a,threat)-distance(b,threat)).slice(0,Math.max(0,24-committed.length));
    for(const u of recruits){u.role='reinforce';u.aiOrderKey=`reinforce:${sector}`;this.responders.add(u.id);}
    const response=army.filter(u=>this.responders.has(u.id));
    if(response.length)game.command(response.map(u=>u.id),'attack',{x:threat.x,y:threat.y},threat.team===0?threat.id:null,false,false,1);
  }
}

// 两波总攻：准备后出动，清场后休整；目标被毁后转攻剩余建筑。
export class AssaultAI{
  constructor(){this.targetId=null;}
  update(game){
    const state=game.defense;
    let army=game.units.filter(u=>u.team===1&&u.hp>0),launched=false;
    if(state.wave===0&&game.time>=state.nextWaveAt){
      state.wave=1;state.nextWaveAt=null;launched=true;
    }
    if(state.wave===1&&!army.length){
      if(state.nextWaveAt===null)state.nextWaveAt=game.time+30;
      if(game.time>=state.nextWaveAt){
        game.spawnDefenseArmy(state.sizes[1],1);
        army=game.units.filter(u=>u.team===1&&u.hp>0);
        state.wave=2;state.nextWaveAt=null;launched=true;
      }
    }
    if(state.wave===0||!army.length)return;
    const current=game.buildings.find(b=>b.id===this.targetId&&b.hp>0);
    if(current&&!launched)return;
    const buildings=game.buildings.filter(b=>b.team===0&&b.hp>0);
    const target=buildings.find(b=>b.primary)||buildings[0];
    if(!target)return;
    this.targetId=target.id;
    for(const u of army)u.role='attack';
    game.command(army.map(u=>u.id),'attack',{x:target.x,y:target.y},null,false,false,1);
  }
}

export class BalancedAI{
  constructor(){this.timer=0;this.attacking=false;this.knownBuildings=new Map();this.sweep=0;}
  update(game,dt){
    this.timer-=dt;if(this.timer>0)return;this.timer=3;
    const own=game.buildings.filter(b=>b.team===1&&b.hp>0);
    const base=own.find(b=>b.primary)||own.find(b=>b.type==='base'&&!b.constructionPending)||own[0];
    if(!base)return;
    const units=game.units.filter(u=>u.team===1&&u.hp>0);
    const army=units.filter(u=>['shield','ironShield','archer','crossbow','armoredCar','steamWalker'].includes(u.type));
    const visible=game.entities().filter(e=>e.team===0&&game.canSee(1,e));
    for(const b of visible.filter(e=>e.building))this.knownBuildings.set(b.id,{id:b.id,x:b.x,y:b.y});
    for(const [id,p] of this.knownBuildings){
      if(game.visible[1][game.cellIndex(p.x,p.y)]&&!visible.some(e=>e.id===id))this.knownBuildings.delete(id);
    }
    const rally={x:base.x-8,y:base.y+8};
    const threat=visible.filter(e=>(!e.building||STATS[e.type].damage)&&(
      own.some(b=>distance(b,e)<16)||army.some(u=>distance(u,e)<10)
    )).sort((a,b)=>distance(a,base)-distance(b,base))[0];
    const main=army.filter(u=>u.order!=='build'&&u.leavingId==null);
    if(main.length<20)this.attacking=false;
    if(main.length>=45)this.attacking=true;
    let target=rally,mode='defend';
    if(threat){target=threat;mode='respond';}
    else if(this.attacking){
      mode='attack';
      target=[...this.knownBuildings.values()].sort((a,b)=>distance(a,base)-distance(b,base))[0];
      if(!target){
        const points=[game.map.spawns[0],...game.map.resources,...game.map.foodPoints];
        target=points[this.sweep%points.length];
        if(main.some(u=>distance(u,target)<6)){this.sweep++;target=points[this.sweep%points.length];}
      }
    }
    this.orderGroup(game,main,mode,target);
    this.scout(game,units.filter(u=>u.type==='wilddog'),visible,rally);

    // 平时保留十名主力；经济或训练基地断档时允许少量残兵恢复建设。
    const recovering=['base','mine','factory'].some(type=>!own.some(b=>b.type===type));
    const workers=main.slice(0,Math.min(4,recovering?main.length:Math.max(0,main.length-10))).map(u=>u.id);
    const site=own.find(b=>b.constructionPending);
    let job=null;
    if(site){
      const assigned=units.filter(u=>u.buildingId===site.id&&u.order==='build').length;
      if(!site.awaitingEviction&&assigned<4&&workers.length&&!threat){
        game.dispatchBuilders(site,game.builderAssignments(workers,site));
      }
    }else if(!threat&&workers.length){
      job=this.planBuilding(game,own,units,base);
      if(job&&game.aiFood>=STATS[job.type].food&&game.aiOre>=STATS[job.type].ore){
        if(!game.build(workers,job.type,job,1))job=null;
      }
    }
    if(game.aiQueue.length>=2)return;
    const dogs=units.filter(u=>u.type==='wilddog').length+game.aiQueue.filter(q=>q.type==='wilddog').length;
    const archers=army.filter(u=>u.type==='archer'||u.type==='crossbow'||u.type==='armoredCar'||u.type==='steamWalker').length;
    const type=dogs<2&&!threat?'wilddog':archers<army.length*.4?'archer':'shield';
    // 防守告急时可花建设预留；平时先为下一座经济建筑积累资源。
    const reserve=job&&!threat?STATS[job.type]:{food:0,ore:0};
    if(game.aiFood>=STATS[type].food+reserve.food&&game.aiOre>=STATS[type].ore+reserve.ore)game.aiTrain(type);
  }
  orderGroup(game,units,mode,target){
    const key=`${mode}:${Math.round(target.x/5)}:${Math.round(target.y/5)}`;
    const selected=units.filter(u=>u.aiOrderKey!==key||(!u.goal&&u.targetId==null&&distance(u,target)>8));
    if(!selected.length)return;
    for(const u of selected){u.role='army';u.aiOrderKey=key;}
    game.command(selected.map(u=>u.id),'attack',target,null,false,false,1);
  }
  scout(game,dogs,enemies,rally){
    const nodes=[...game.map.resources].sort((a,b)=>distance(a,rally)-distance(b,rally));
    dogs.forEach((u,i)=>{
      if(u.order==='build'||u.leavingId!=null)return;
      u.role='scout';
      if(enemies.some(e=>!e.building&&distance(u,e)<8)){
        if(!u.goal||distance(u.goal,rally)>3)game.command([u.id],'move',rally,null,false,false,1);
        return;
      }
      if(u.goal&&distance(u,u.goal)>2)return;
      u.scoutIndex=u.scoutIndex==null?i+1:(u.scoutIndex+1)%nodes.length;
      const p=nodes[u.scoutIndex%nodes.length];
      game.command([u.id],'move',{x:p.x+.5,y:p.y+.5},null,false,false,1);
    });
  }
  planBuilding(game,own,units,base){
    const count=type=>own.filter(b=>b.type===type).length;
    const cap=own.reduce((n,b)=>n+(!b.constructionPending?(STATS[b.type].pop||0):0),0);
    const nearby=type=>{
      for(const r of [7,11,15])for(const [dx,dy] of [[-1,0],[0,1],[-1,1],[1,0],[0,-1],[1,1]]){
        const p=game.placement(type,{x:base.x+dx*r,y:base.y+dy*r},1);
        if(!p.error)return {...p,type};
      }
      return null;
    };
    const resource=(type,nodes)=>{
      for(const n of [...nodes].sort((a,b)=>distance(a,base)-distance(b,base))){
        // 已被己方对应建筑覆盖的食物点不重复建设。
        if(own.some(b=>b.type===type&&Math.abs(b.x-n.x-.5)<2&&Math.abs(b.y-n.y-.5)<2))continue;
        const p=game.placement(type,{x:n.x+.5,y:n.y+.5},1);
        if(!p.error)return {...p,type};
      }
      return null;
    };
    if(!count('factory'))return resource('factory',game.map.foodPoints)||nearby('factory');
    if(!count('mine'))return resource('mine',game.map.resources);
    if(units.length+game.aiQueue.length>=cap-8)return nearby('base');
    if(count('factory')<2)return resource('factory',game.map.foodPoints)||nearby('factory');
    if(count('mine')<3){const mine=resource('mine',game.map.resources);if(mine)return mine;}
    if(count('factory')<4)return resource('factory',game.map.foodPoints)||nearby('factory');
    return null;
  }
}
