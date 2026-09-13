import {STATS} from './data.js';

export const SANDBOX_TYPES=Object.keys(STATS).filter(type=>STATS[type].movable);
export const SANDBOX_SPACING=2;

export function placeSandboxUnit(game,type,point){
  if(game.level!=='sandbox'||!game.sandboxEditing||!SANDBOX_TYPES.includes(type))return null;
  const {width,height}=game.map;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>=width||point.y>=height)return null;
  if(!STATS[type].air&&game.map.terrain[Math.floor(point.y)*width+Math.floor(point.x)]===1)return null;
  if(game.units.some(u=>Math.hypot(u.x-point.x,u.y-point.y)<.8))return null;
  const unit=game.addUnit(type,point.x<width/2?0:1,point.x,point.y);
  game.revision++;game.updateVision();return unit;
}

export function deleteSandboxUnits(game,ids){
  if(game.level!=='sandbox'||!game.sandboxEditing)return;
  const selected=new Set(ids);game.units=game.units.filter(u=>!selected.has(u.id));
  game.revision++;game.updateVision();
}

export function startSandboxBattle(game){
  if(!game.sandboxEditing||![0,1].every(team=>game.units.some(u=>u.team===team)))return false;
  game.sandboxSetup=game.units.map(({type,team,x,y})=>({type,team,x,y}));
  game.sandboxEditing=false;game.revision++;return true;
}

export function restoreSandboxSetup(game,setup){
  for(const unit of setup)game.addUnit(unit.type,unit.team,unit.x,unit.y);
  game.updateVision();
}

export function mirrorSandboxFormation(game){
  if(game.level!=='sandbox'||!game.sandboxEditing)return false;
  const left=game.units.filter(u=>u.team===0&&u.hp>0);
  game.units=[...left];
  for(const u of left){const copy=game.addUnit(u.type,1,game.map.width-u.x,u.y);copy.x=game.map.width-u.x;copy.y=u.y;}
  game.revision++;game.updateVision();return true;
}
