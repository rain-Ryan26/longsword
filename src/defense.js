export function defensePresentation(state,observer=false){
  if(state.level!=='defend'||!state.defense)return {text:'',canLaunch:false};
  const {wave,nextWaveAt}=state.defense;
  const enemies=state.units.filter(u=>u.team===1&&u.hp>0).length;
  const buildings=state.buildings.filter(b=>b.team===0&&b.hp>0).length;
  const waiting=wave<2&&nextWaveAt!==null&&(wave===0||enemies===0);
  const phase=waiting?(wave===0?'第一波准备':'第二波休整'):'第 '+wave+' / 2 波';
  const countdown=waiting?' · '+Math.max(0,Math.ceil(nextWaveAt-state.time))+' 秒后进攻':'';
  return {text:phase+countdown+' · 敌军 '+enemies+' · 我方建筑 '+buildings,canLaunch:!observer&&!state.result&&waiting};
}
export function startNextDefenseWave(game){
  if(!defensePresentation(game).canLaunch)return false;
  game.defense.nextWaveAt=game.time;
  return true;
}
