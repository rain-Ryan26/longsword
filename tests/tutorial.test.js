import test from 'node:test';
import assert from 'node:assert/strict';
import {Tutorial,TUTORIAL_STEPS} from '../src/tutorial.js';

const context=(overrides={})=>({state:{result:null},...overrides});

test('教程主线保持精简，并把完整操作留给速查',()=>{
  assert.equal(TUTORIAL_STEPS.length,13);
  assert.deepEqual([...new Set(TUTORIAL_STEPS.map(step=>step.phase))],['基础操作','建造与经济','战斗','界面','目标']);
});

test('提前发生的操作不会跳过尚未展示的步骤',()=>{
  const tutorial=new Tutorial();
  tutorial.signal('move');
  tutorial.signal('pick');
  assert.equal(tutorial.update(context()),true);
  assert.equal(tutorial.index,1);
  assert.equal(tutorial.update(context()),false);
  tutorial.signal('move');
  assert.equal(tutorial.update(context()),true);
  assert.equal(tutorial.index,2);
});

test('组合步骤需要在当前提示后完成全部动作',()=>{
  const tutorial=new Tutorial([TUTORIAL_STEPS[2]]);
  tutorial.signal('zoom');
  assert.equal(tutorial.update(context()),false);
  tutorial.signal('pan');
  assert.equal(tutorial.update(context()),true);
  assert.equal(tutorial.finished,true);
});

test('跳过会建立新基线，完成后保持稳定的完成态',()=>{
  const tutorial=new Tutorial(TUTORIAL_STEPS.slice(0,2));
  tutorial.signal('move');
  assert.equal(tutorial.skip(),false);
  assert.equal(tutorial.update(context()),false);
  tutorial.signal('move');
  assert.equal(tutorial.update(context()),true);
  assert.equal(tutorial.skip(),true);
  assert.deepEqual(tutorial.presentation(),{
    progress:'2 / 2',
    text:'教程已完成：可以在本关自由练习，或点击「更换关卡」挑战其他战局。'
  });
});
