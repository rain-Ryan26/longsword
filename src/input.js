import {STATS} from './data.js';
import {isOffensiveMovableUnit,nearestEntity} from './selection.js';

export function bindInput(ctx){
  const {game,observer,renderer,interaction,$,toast,closeBuild,setAttack,renderMode,updateHud,
    sendSnapshot,previewAt,enterRallyMode,togglePause,settingsPanel,setSettings,controlGroups,helpPanel,setHelp,signal,stop}=ctx;
  if(!observer)game.onBuildersDispatched=ids=>{for(const id of ids)ctx.selected.delete(id);};
  function local(event){const rect=$('game').getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function visibleToView(e){const team=ctx.view===2?1:0;return ctx.view===1||e.team===team||ctx.state.visible[team][Math.floor(e.y)*ctx.state.map.width+Math.floor(e.x)];}
  function issue(p,attack,append=false,allowMountains=false,groundOnly=false){
    ctx.lastUnitClick=null;
    if(!ctx.selected.size){toast('请先选择部队');setAttack(false);return;}
    const unitsById=new Map(game.units.map(u=>[u.id,u]));
    const ids=[...ctx.selected].filter(id=>!groundOnly||!STATS[unitsById.get(id)?.type]?.air);
    if(!ids.length){setAttack(false);return;}
    const world=renderer.world(p.x,p.y);
    if(world.x<0||world.y<0||world.x>=ctx.state.map.width||world.y>=ctx.state.map.height){toast('请在地图范围内下达指令');return;}
    const site=!attack&&!append&&!allowMountains&&game.buildings.find(b=>b.team===0&&b.hp>0&&b.constructionPending&&Math.abs(b.x-world.x)<(STATS[b.type].halfSize||2)&&Math.abs(b.y-world.y)<(STATS[b.type].halfSize||2));
    if(site){const airIds=ids.filter(id=>STATS[unitsById.get(id)?.type]?.air),builders=ids.filter(id=>!airIds.includes(id));if(airIds.length)game.command(airIds,'move',world);if(builders.length){const error=game.assistBuild(builders,site.id);if(!error)signal('assist');toast(error||'已派遣部队前往施工');}setAttack(false);updateHud();return;}
    const tower=!attack&&!append&&!allowMountains&&game.buildings.find(b=>b.team===0&&b.hp>0&&b.type==='tower'&&!b.constructionPending&&Math.abs(b.x-world.x)<STATS.tower.halfSize&&Math.abs(b.y-world.y)<STATS.tower.halfSize);
    if(tower){const error=game.enterTower(ids,tower.id);if(!error)signal('garrison');toast(error||'已派遣部队入驻哨塔');setAttack(false);updateHud();return;}
    const target=append||allowMountains?null:game.entities().find(e=>e.team===1&&game.canSee(0,e)&&Math.hypot(e.x-world.x,e.y-world.y)<(e.building?(STATS[e.type].halfSize||2):1));
    game.command(ids,attack?'attack':target?'attack':'move',world,target?.id,append,allowMountains);
    signal(attack?'attackMove':target?'attackTarget':append?'path':'move');
    if(allowMountains)toast('本次路线允许穿越山地/森林');else if(append)toast('已追加移动路径点');
    const markerStartedAt=performance.now(),markerDuration=760;
    ctx.marker={...world,attack:attack||!!target,startedAt:markerStartedAt,duration:markerDuration,until:markerStartedAt+markerDuration};setAttack(false);
  }
  const canvas=$('game');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function onPointerDown(e){
    if(!ctx.state||ctx.selectingLevel)return;
    const p=local(e);
    if(e.button!==2)ctx.lastRightClick=null;
    if(e.button===1){
      e.preventDefault();
      ctx.drag={kind:'pan',sx:p.x,sy:p.y,x:p.x,y:p.y,cx:renderer.camera.x,cy:renderer.camera.y};
      canvas.setPointerCapture(e.pointerId);return;
    }
    if(observer)return;
    if(e.button===2)onRightClick(e,p);
    else if(e.button===0)onPrimaryClick(e,p);
  }
  function onRightClick(e,p){
    if(ctx.sandboxEditing){ctx.sandboxCancel();return;}
    e.preventDefault();
    if(interaction.buildMenu||interaction.buildType||interaction.rallyBaseId){
      closeBuild();updateHud();return;
    }
    const world=renderer.world(p.x,p.y),now=performance.now();
    const inMap=world.x>=0&&world.x<ctx.state.map.width&&world.y>=0&&world.y<ctx.state.map.height;
    const doubleClick=!e.shiftKey&&ctx.selected.size>0&&ctx.lastRightClick&&now-ctx.lastRightClick.time<350&&Math.hypot(p.x-ctx.lastRightClick.x,p.y-ctx.lastRightClick.y)<6;
    const flyingBefore=game.units.filter(u=>ctx.selected.has(u.id)&&game.isFlying(u)).map(u=>u.id);
    if(doubleClick&&inMap){
      const previousFlying=new Set(ctx.lastRightClick.flyingIds);
      game.toggleFlight(flyingBefore.filter(id=>previousFlying.has(id)),world);
    }
    issue(p,false,e.shiftKey,!!doubleClick,!!doubleClick);
    ctx.lastRightClick=!e.shiftKey&&inMap&&!doubleClick?{x:p.x,y:p.y,time:now,flyingIds:flyingBefore}:null;
  }
  function onPrimaryClick(e,p){
    if(ctx.sandboxEditing&&ctx.sandboxClick(p))return;
    if(interaction.rallyBaseId){
      const error=game.setRallyPoint(interaction.rallyBaseId,renderer.world(p.x,p.y));
      toast(error||'集结点已设置');
      if(!error){interaction.enter('select',{buildingId:interaction.selectedBuilding});renderMode();signal('rally');}
      sendSnapshot();updateHud();return;
    }
    if(interaction.buildType){
      const buildType=interaction.buildType,evict=!!interaction.buildPreview?.evict;
      const error=game.build([...ctx.selected],buildType,renderer.world(p.x,p.y));
      toast(error||(evict?'区域内单位将自动让位，随后开始施工':`已派遣最多 ${STATS[buildType].maxBuilders||4} 名选中部队前往施工`));
      if(!error){closeBuild();signal('build');signal(`build-${buildType}`);}else previewAt(p);
      sendSnapshot();updateHud();return;
    }
    if(interaction.attackMode){issue(p,true);return;}
    ctx.drag={kind:'select',sx:p.x,sy:p.y,x:p.x,y:p.y,shift:e.shiftKey};
    canvas.setPointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',e=>{if(ctx.sandboxEditing&&!ctx.drag)ctx.sandboxMove(local(e),e.shiftKey);if(interaction.buildType&&game)previewAt(local(e));if(!ctx.drag)return;const p=local(e);ctx.drag.x=p.x;ctx.drag.y=p.y;if(ctx.drag.kind==='pan'){renderer.camera.x=ctx.drag.cx-(p.x-ctx.drag.sx)/renderer.camera.zoom;renderer.camera.y=ctx.drag.cy-(p.y-ctx.drag.sy)/renderer.camera.zoom;renderer.clamp();}});
  canvas.addEventListener('pointerup',e=>{if(!ctx.drag)return;if(ctx.drag.kind==='select'){
    closeBuild();if(!ctx.drag.shift)ctx.selected.clear();const click=Math.hypot(ctx.drag.x-ctx.drag.sx,ctx.drag.y-ctx.drag.sy)<5;
    const choices=ctx.state.units.filter(u=>(ctx.sandboxEditing||u.team===0)&&u.hp>0&&!u.garrisonId&&visibleToView(u));
    if(click){
      const p=renderer.world(ctx.drag.x,ctx.drag.y);
      const u=nearestEntity(choices,p);
      if(u&&Math.hypot(u.x-p.x,u.y-p.y)<1){
        const now=performance.now();
        if(ctx.lastUnitClick?.id===u.id&&now-ctx.lastUnitClick.time<350&&Math.hypot(ctx.drag.x-ctx.lastUnitClick.x,ctx.drag.y-ctx.lastUnitClick.y)<5){
          ctx.selected=new Set(choices.filter(other=>{const s=renderer.screen(other.x,other.y);return other.type===u.type&&s.x>=0&&s.x<renderer.width&&s.y>=0&&s.y<renderer.height;}).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).map(other=>other.id));
          ctx.lastUnitClick=null;signal('doublePick');toast(`已选择画面内 ${ctx.selected.size} 名${STATS[u.type].name}`);
        }else{
          const removing=ctx.drag.shift&&ctx.selected.has(u.id);
          if(removing)ctx.selected.delete(u.id);else ctx.selected.add(u.id);
          ctx.lastUnitClick={id:u.id,time:now,x:ctx.drag.x,y:ctx.drag.y};
          if(!removing)signal(ctx.drag.shift?'shiftPick':'pick');
        }
      }else {
        ctx.lastUnitClick=null;
        const b=ctx.state.buildings.find(b=>b.team===0&&b.hp>0&&visibleToView(b)&&Math.abs(b.x-p.x)<(STATS[b.type].halfSize||2)&&Math.abs(b.y-p.y)<(STATS[b.type].halfSize||2));
        if(b){ctx.selected.clear();interaction.enter('select',{buildingId:b.id});renderMode();}
      }
    }else{
      ctx.lastUnitClick=null;
      const before=ctx.selected.size;
      for(const u of choices){const p=renderer.screen(u.x,u.y);if(p.x>=Math.min(ctx.drag.sx,ctx.drag.x)&&p.x<=Math.max(ctx.drag.sx,ctx.drag.x)&&p.y>=Math.min(ctx.drag.sy,ctx.drag.y)&&p.y<=Math.max(ctx.drag.sy,ctx.drag.y))ctx.selected.add(u.id);}
      if(ctx.selected.size>before)signal('box');
    }
    updateHud();
  }else if(ctx.drag.kind==='pan'&&Math.hypot(ctx.drag.x-ctx.drag.sx,ctx.drag.y-ctx.drag.sy)>=5)signal('pan');ctx.drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointercancel',()=>ctx.drag=null);
  canvas.addEventListener('wheel',e=>{ctx.lastRightClick=null;e.preventDefault();const p=local(e);renderer.zoomAt(p.x,p.y,Math.exp(-e.deltaY*.001));signal('zoom');},{passive:false});
  $('minimap').addEventListener('pointerdown',e=>{ctx.lastRightClick=null;const r=$('minimap').getBoundingClientRect();if(!ctx.state||ctx.selectingLevel)return;renderer.camera.x=(e.clientX-r.left)/r.width*ctx.state.map.width;renderer.camera.y=(e.clientY-r.top)/r.height*ctx.state.map.height;renderer.clamp();signal('minimap');});
  window.addEventListener('keydown',e=>{
    ctx.lastRightClick=null;
    if(e.key==='Escape'&&!settingsPanel.hidden){e.preventDefault();setSettings(false);return;}
    if(e.key==='Escape'&&!helpPanel.hidden){e.preventDefault();setHelp(false);return;}
    if(ctx.selectingLevel)return;
    if(e.target.matches('input, textarea, select')||e.target.isContentEditable)return;
    const key=e.key.toLowerCase();
    if(ctx.sandboxEditing&&!observer){if(key==='d'){e.preventDefault();ctx.sandboxDelete();return;}if(key==='escape'){ctx.sandboxCancel();ctx.drag=null;return;}if(![' '].includes(key))return;}
    if(/^[0-9]$/.test(key)&&!e.altKey&&!e.metaKey&&!e.shiftKey){
      e.preventDefault();
      if(observer||e.repeat)return;
      ctx.lastUnitClick=null;
      const living=new Set(game.units.filter(u=>u.team===0&&u.hp>0&&!u.garrisonId).map(u=>u.id));
      if(e.ctrlKey){
        const ids=controlGroups.save(key,ctx.selected,living);
        if(ids.length){signal('groupSave');toast(`编队 ${key} 已保存 · ${ids.length} 人`);}else toast('请先选择部队再编队');
      }else{
        const ids=controlGroups.recall(key,living);
        if(ids.length){signal('groupRecall');closeBuild();ctx.selected=new Set(ids);setAttack(false);toast(`已选择编队 ${key} · ${ids.length} 人`);updateHud();}else toast(`编队 ${key} 没有存活单位`);
      }
      return;
    }
    if(key===' '){e.preventDefault();if(!e.repeat)togglePause();return;}
    if(key==='f2'){
      e.preventDefault();
      if(observer||e.repeat)return;
      closeBuild();ctx.lastUnitClick=null;
      ctx.selected=new Set(game.units.filter(isOffensiveMovableUnit).map(u=>u.id));
      if(ctx.selected.size)signal('selectAll');
      toast(ctx.selected.size?`已选择全部进攻单位 · ${ctx.selected.size} 人`:'没有可选择的进攻单位');
      updateHud();return;
    }
    if(key==='escape'){closeBuild();ctx.drag=null;updateHud();}
    if(observer||e.repeat)return;
    if(interaction.buildMenu&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&['c','r','q','f','m'].includes(key)){
      e.preventDefault();const type={c:'base',r:'mine',q:'tower',f:'factory',m:'machineFactory'}[key];
      if(game.result)return;
      if(game.food<STATS[type].food||game.ore<STATS[type].ore){toast('资源不足');return;}
      $('build-'+type).click();return;
    }
    if(key==='b'){e.preventDefault();closeBuild();if([...ctx.selected].some(id=>game.units.some(u=>u.id===id&&u.team===0&&u.hp>0))){signal('buildMenu');interaction.enter('build');renderMode();updateHud();}else toast('请先选择部队');}
    if(key==='r'){
      const base=game.buildings.find(b=>b.id===interaction.selectedBuilding&&b.team===0&&b.type==='base'&&b.hp>0);
      if(!ctx.selected.size&&(!interaction.selectedBuilding||base)){
        e.preventDefault();interaction.enter(interaction.techMenu?'select':'technology',{buildingId:interaction.selectedBuilding});renderMode();updateHud();
      }
    }
    if(key==='e'&&interaction.selectedBuilding&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();const error=game.exitTower(interaction.selectedBuilding);if(!error)signal('exitTower');toast(error||'哨塔驻兵已退出');sendSnapshot();updateHud();return;}
    if(key==='y'){e.preventDefault();enterRallyMode();}
    if(key==='a'){e.preventDefault();if(ctx.selected.size)setAttack(true);else toast('请先选择部队');}
    if(key==='s'){e.preventDefault();stop();}
  });
  window.addEventListener('keyup',e=>{if(e.key==='Shift'&&ctx.sandboxEditing)ctx.sandboxMove({x:0,y:0},false);});
  canvas.addEventListener('pointerleave',()=>{if(ctx.sandboxEditing)ctx.sandboxMove({x:0,y:0},false);});
  window.addEventListener('blur',()=>{ctx.drag=null;ctx.lastUnitClick=null;ctx.lastRightClick=null;});
}
