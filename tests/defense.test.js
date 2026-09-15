import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/core.js';
import {defensePresentation,startNextDefenseWave} from '../src/defense.js';
test('防守界面与提前出动：准备、交战、休整倒计时、第二波和结束',()=>{
  const g=new Game('defend');
  assert.match(defensePresentation(g.snapshot()).text,/第一波准备 · 120 秒后进攻/);
  assert.equal(defensePresentation(g,true).canLaunch,false);
  assert.equal(startNextDefenseWave(g),true);g.step(.05);
  assert.equal(g.defense.wave,1);assert.equal(defensePresentation(g).canLaunch,false);
  assert.equal(startNextDefenseWave(g),false);
  for(const u of g.units)if(u.team===1)u.hp=0;
  g.step(.05);
  assert.match(defensePresentation(g.snapshot()).text,/第二波休整 · 30 秒后进攻/);
  assert.equal(defensePresentation(g).canLaunch,true);
  g.time+=10;
  assert.match(defensePresentation(g).text,/20 秒后进攻/);
  assert.equal(startNextDefenseWave(g),true);g.step(.05);
  assert.equal(g.defense.wave,2);assert.equal(g.units.filter(u=>u.team===1&&u.hp>0).length,70);
  assert.equal(defensePresentation(g).canLaunch,false);
  for(const u of g.units)if(u.team===1)u.hp=0;
  g.step(.05);assert.equal(g.result,'victory');assert.equal(startNextDefenseWave(g),false);
});
test('结束与其他关卡不可提前出动',()=>{
  const g=new Game('defend');g.result='defeat';assert.equal(startNextDefenseWave(g),false);
  const tutorial=new Game('tutorial');assert.deepEqual(defensePresentation(tutorial),{text:'',canLaunch:false});assert.equal(startNextDefenseWave(tutorial),false);
});
