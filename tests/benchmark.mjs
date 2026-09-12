import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Game} from '../src/core.js';

// npm run benchmark -- <改动前源码目录> 可同时比较耗时和最终快照。
const Before=process.argv[2]?(await import(pathToFileURL(path.resolve(process.argv[2],'src/core.js')).href)).Game:null;
const scenarios=[['demo',false],['attack',false],['balanced',false],['attack',true]];
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
function run(Type,level,move,steps=200){
  const game=new Type(level);
  const commandStart=performance.now();
  if(move)game.command(game.units.filter(u=>u.team===0).map(u=>u.id),'attack',{x:84,y:32});
  const commandMs=performance.now()-commandStart,start=performance.now();
  for(let step=0;step<steps;step++)game.step(.05);
  return {simulationMs:performance.now()-start,commandMs,state:game.snapshot()};
}
for(const [level,move] of scenarios){
  run(Game,level,move,20);if(Before)run(Before,level,move,20);
  const current=[],baseline=[],commands=[],oldCommands=[];
  for(let repeat=0;repeat<3;repeat++){
    const old=Before&&run(Before,level,move),now=run(Game,level,move);
    if(old){assert.deepEqual(now.state,old.state);baseline.push(old.simulationMs);oldCommands.push(old.commandMs);}
    current.push(now.simulationMs);commands.push(now.commandMs);
  }
  console.log(JSON.stringify({scenario:level+(move?'-group-attack':''),steps:200,repeats:3,
    simulationMs:Math.round(median(current)),commandMs:+median(commands).toFixed(2),
    ...(Before?{baselineMs:Math.round(median(baseline)),baselineCommandMs:+median(oldCommands).toFixed(2),snapshotsEqual:true}:{})}));
}
