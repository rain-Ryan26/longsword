import {NearbyIndex} from './queries.js';
import {isArmyUnit} from './rules.js';
import {coversCell} from './pathfinding.js';
import {STATS} from './data.js';
// 进攻关卡用联防 AI，防守关卡用两波总攻 AI。
// AI 只通过 game 提供的公开接口下达指令，不读取玩家视野。
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// 据点联防：仅根据本方可见敌军及受袭信息出动，保留驻军。
export class DefendAI{
  constructor(){this.timer=0;this.responders=new Set();this.contact=null;}
  update(game,dt){
    this.timer-=dt;if(this.timer>0)return;this.timer=2;
    const army=game.units.filter(u=>u.team===1&&u.hp>0&&isArmyUnit(u));
    const alive=new Set(army.map(u=>u.id));
    for(const id of this.responders)if(!alive.has(id))this.responders.delete(id);
    const own=game.entities().filter(e=>e.team===1);
    const visible=game.units.filter(u=>u.team===0&&u.hp>0&&game.canSee(1,u));
    const hit=own.filter(e=>game.time-(e.lastDamagedAt??-Infinity)<=3)
      .sort((a,b)=>b.lastDamagedAt-a.lastDamagedAt)[0];
    const visibleIndex=new NearbyIndex(visible);
    const countNear=point=>visibleIndex.nearby(point,16,false).filter(u=>distance(u,point)<16).length;
    let seen=null;
    for(const enemy of visible){
      const count=countNear(enemy);
      if(!seen||count>seen.count)seen={enemy,count};
    }
    if(hit||seen){
      const p=hit||seen.enemy;
      const count=countNear(p);
      const wanted=hit?Math.max(40,Math.ceil(count*1.25)):count>=12?Math.ceil(count*1.25):8;
      this.contact={x:p.x,y:p.y,wanted:Math.min(75,wanted),until:game.time+12};
    }
    this.scout(game,own.filter(u=>u.type==='wilddog'),visible);
    if(!this.contact||game.time>this.contact.until){
      const returning=army.filter(u=>this.responders.has(u.id));
      for(const u of returning){u.role='guard';u.aiOrderKey=null;game.command([u.id],'move',u.home,null,false,false,1);}
      this.responders.clear();this.contact=null;return;
    }
    const target=this.contact;
    // 每点保留一半存活驻军，优先从离威胁最近的点抽调。
    const candidates=[];
    for(const sector of new Set(army.map(u=>u.defenseSector))){
      const local=army.filter(u=>u.defenseSector===sector);
      const keep=Math.min(local.length,Math.max(10,Math.ceil(local.length/2)));
      candidates.push(...local.sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,local.length-keep));
    }
    const response=candidates.sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,target.wanted);
    const chosen=new Set(response.map(u=>u.id));
    for(const u of army.filter(u=>this.responders.has(u.id)&&!chosen.has(u.id))){
      u.role='guard';u.aiOrderKey=null;game.command([u.id],'move',u.home,null,false,false,1);
    }
    this.responders=chosen;
    const key=`respond:${Math.round(target.x/5)}:${Math.round(target.y/5)}`;
    const selected=response.filter(u=>u.aiOrderKey!==key||(!u.goal&&u.targetId==null&&distance(u,target)>5));
    for(const u of response){u.role='reinforce';u.aiOrderKey=key;}
    if(selected.length)game.command(selected.map(u=>u.id),'attack',{x:target.x,y:target.y},null,false,false,1);
  }
  scout(game,dogs,visible){
    const points=game.map.patrol;
    if(!points.length)return;
    dogs.forEach(u=>{
      if(visible.some(e=>distance(u,e)<8)){
        if(!u.goal||distance(u.goal,u.home)>2)game.command([u.id],'move',u.home,null,false,false,1);
        return;
      }
      if(u.goal&&distance(u,u.goal)>2)return;
      const p=points[u.scoutIndex%points.length];u.scoutIndex=(u.scoutIndex+1)%points.length;
      game.command([u.id],'move',p,null,false,false,1);
    });
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
        game.spawnDefenseArmy(state.sizes[1].shield,state.sizes[1].archer,1);
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
  constructor(team=1){this.team=team;this.timer=0;this.attacking=false;this.knownBuildings=new Map();this.sweep=0;}
  foodOf(game){return game[this.team===0?'food':'aiFood'];}
  oreOf(game){return game[this.team===0?'ore':'aiOre'];}
  queueOf(game){return game[this.team===0?'queue':'aiQueue'];}
  update(game,dt){
    this.timer-=dt;if(this.timer>0)return;this.timer=3;
    const context=this.collectSituation(game);
    if(!context)return;
    const military=this.updateMilitary(game,context);
    this.updateEconomy(game,{...context,...military});
  }
  collectSituation(game){
    const t=this.team;
    const own=game.buildings.filter(b=>b.team===t&&b.hp>0);
    const base=own.find(b=>b.primary)||own.find(b=>b.type==='base'&&!b.constructionPending)||own[0];
    if(!base)return;
    const units=game.units.filter(u=>u.team===t&&u.hp>0);
    const army=units.filter(u=>isArmyUnit(u));
    const visible=game.entities().filter(e=>e.team!==t&&game.canSee(t,e));
    for(const b of visible.filter(e=>e.building))this.knownBuildings.set(b.id,{id:b.id,x:b.x,y:b.y});
    const visibleIds=new Set(visible.map(e=>e.id));
    for(const [id,p] of this.knownBuildings){
      if(game.visible[t][game.cellIndex(p.x,p.y)]&&!visibleIds.has(id))this.knownBuildings.delete(id);
    }
    return {t,own,base,units,army,visible};
  }
  updateMilitary(game,{t,own,base,units,army,visible}){
    const dx=t===0?8:-8;
    const rally={x:base.x+dx,y:base.y-dx};
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
        const points=[game.map.spawns[t],...game.map.resources,...game.map.foodPoints];
        target=points[this.sweep%points.length];
        if(main.some(u=>distance(u,target)<6)){this.sweep++;target=points[this.sweep%points.length];}
      }
    }
    this.orderGroup(game,main,mode,target);
    this.scout(game,units.filter(u=>u.type==='wilddog'),visible,rally);

    return {main,threat};
  }
  updateEconomy(game,{t,own,base,units,army,main,threat}){
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
      if(job&&this.foodOf(game)>=STATS[job.type].food&&this.oreOf(game)>=STATS[job.type].ore){
        if(!game.build(workers,job.type,job,t))job=null;
      }
    }
    if(this.queueOf(game).length>=2)return;
    const dogs=units.filter(u=>u.type==='wilddog').length+this.queueOf(game).filter(q=>q.type==='wilddog').length;
    const archers=army.filter(u=>u.type==='archer'||u.type==='crossbow'||u.type==='armoredCar'||u.type==='steamWalker').length;
    const type=dogs<2&&!threat?'wilddog':archers<army.length*.4?'archer':'shield';
    // 防守告急时可花建设预留；平时先为下一座经济建筑积累资源。
    const reserve=job&&!threat?STATS[job.type]:{food:0,ore:0};
    if(this.foodOf(game)>=STATS[type].food+reserve.food&&this.oreOf(game)>=STATS[type].ore+reserve.ore)game.enqueueTraining(type,null,t);
  }
  orderGroup(game,units,mode,target){
    const key=`${mode}:${Math.round(target.x/5)}:${Math.round(target.y/5)}`;
    const selected=units.filter(u=>u.aiOrderKey!==key||(!u.goal&&u.targetId==null&&distance(u,target)>8));
    if(!selected.length)return;
    for(const u of selected){u.role='army';u.aiOrderKey=key;}
    game.command(selected.map(u=>u.id),'attack',target,null,false,false,this.team);
  }
  scout(game,dogs,enemies,rally){
    const nodes=[...game.map.resources].sort((a,b)=>distance(a,rally)-distance(b,rally));
    dogs.forEach((u,i)=>{
      if(u.order==='build'||u.leavingId!=null)return;
      u.role='scout';
      if(enemies.some(e=>!e.building&&distance(u,e)<8)){
        if(!u.goal||distance(u.goal,rally)>3)game.command([u.id],'move',rally,null,false,false,this.team);
        return;
      }
      if(u.goal&&distance(u,u.goal)>2)return;
      u.scoutIndex=u.scoutIndex==null?i+1:(u.scoutIndex+1)%nodes.length;
      const p=nodes[u.scoutIndex%nodes.length];
      game.command([u.id],'move',{x:p.x+.5,y:p.y+.5},null,false,false,this.team);
    });
  }
  economicPriority(game){
    // 以 6 盾 + 4 弓的一批补员和下一座基地作为储备标尺，比较两种资源的相对短缺。
    const foodNeed=STATS.base.food+6*STATS.shield.food+4*STATS.archer.food;
    const oreNeed=STATS.base.ore+6*STATS.shield.ore+4*STATS.archer.ore;
    return this.foodOf(game)/foodNeed<=this.oreOf(game)/oreNeed?'factory':'mine';
  }
  planBuilding(game,own,units,base){
    const t=this.team;
    const count=type=>own.filter(b=>b.type===type).length;
    const cap=own.reduce((n,b)=>n+(!b.constructionPending?(STATS[b.type].pop||0):0),0);
    const nearby=type=>this.nearbySite(game,type,base,t);
    const resource=(type,nodes)=>this.resourceSite(game,type,nodes,base,own,t);
    const towerAt=group=>this.towerSite(game,group,own,t);
    const preferred=this.economicPriority(game);
    const economyJob=(type,nodes)=>resource(type,nodes)||(type==='factory'?nearby(type):null);
    if(!count('factory')&&!count('mine')){
      const first=preferred==='factory'
        ?economyJob('factory',game.map.foodPoints)
        :economyJob('mine',game.map.resources);
      return first||(preferred==='factory'
        ?economyJob('mine',game.map.resources)
        :economyJob('factory',game.map.foodPoints));
    }
    if(!count('factory'))return economyJob('factory',game.map.foodPoints);
    if(!count('mine'))return economyJob('mine',game.map.resources);
    const ownSpawn=game.map.spawns[t],oppSpawn=game.map.spawns[1-t];
    const groups=game.map.resources.map((mine,i)=>({mine,food:game.map.foodPoints[i]}))
      .filter(g=>g.food&&distance({x:(g.mine.x+g.food.x)/2,y:(g.mine.y+g.food.y)/2},ownSpawn)<distance({x:(g.mine.x+g.food.x)/2,y:(g.mine.y+g.food.y)/2},oppSpawn))
      .sort((a,b)=>distance(a.mine,ownSpawn)-distance(b.mine,ownSpawn));
    // 尽早把第二组经济落到另一个点位，其中先建当前更短缺的资源建筑。
    if(count('factory')<2&&count('mine')<2){
      const first=preferred==='factory'
        ?resource('factory',groups.map(g=>g.food))
        :resource('mine',groups.map(g=>g.mine));
      if(first)return first;
    }
    if(count('factory')<2){const factory=resource('factory',groups.map(g=>g.food));if(factory)return factory;}
    if(count('mine')<2){const mine=resource('mine',groups.map(g=>g.mine));if(mine)return mine;}
    if(units.length+this.queueOf(game).length>=cap-8)return nearby('base');
    for(const group of groups){
      const hasMine=own.some(b=>b.type==='mine'&&coversCell(b,group.mine));
      const hasFactory=own.some(b=>b.type==='factory'&&coversCell(b,group.food));
      if(!hasMine&&!hasFactory&&preferred==='factory'){
        const factory=game.placement('factory',{x:group.food.x+.5,y:group.food.y+.5},t);
        if(!factory.error)return {...factory,type:'factory'};
      }
      if(!hasMine){
        const mine=game.placement('mine',{x:group.mine.x+.5,y:group.mine.y+.5},t);
        if(!mine.error)return {...mine,type:'mine'};
        continue;
      }
      if(!hasFactory){
        const factory=game.placement('factory',{x:group.food.x+.5,y:group.food.y+.5},t);
        if(!factory.error)return {...factory,type:'factory'};
        continue;
      }
      const tower=towerAt(group);
      if(tower)return tower;
    }
    return null;
  }
  nearbySite(game,type,base,t){
      for(const r of [7,11,15])for(const [dx,dy] of [[-1,0],[0,1],[-1,1],[1,0],[0,-1],[1,1]]){
        const p=game.placement(type,{x:base.x+dx*r,y:base.y+dy*r},t);
        if(!p.error)return {...p,type};
      }
      return null;
  }
  resourceSite(game,type,nodes,base,own,t){
      for(const n of [...nodes].sort((a,b)=>distance(a,base)-distance(b,base))){
        // 已被己方对应建筑覆盖的食物点不重复建设。
        if(own.some(b=>b.type===type&&coversCell(b,n)))continue;
        const p=game.placement(type,{x:n.x+.5,y:n.y+.5},t);
        if(!p.error)return {...p,type};
      }
      return null;
  }
  towerSite(game,group,own,t){
      const center={x:(group.mine.x+group.food.x)/2+0.5,y:(group.mine.y+group.food.y)/2+0.5};
      if(own.some(b=>b.type==='tower'&&distance(b,center)<=8))return null;
      for(const [dx,dy] of [[0,0],[5,0],[0,5],[-5,0],[0,-5],[5,5],[-5,5],[5,-5],[-5,-5]]){
        const p=game.placement('tower',{x:center.x+dx,y:center.y+dy},t);
        if(!p.error)return {...p,type:'tower'};
      }
      return null;
  }
}
