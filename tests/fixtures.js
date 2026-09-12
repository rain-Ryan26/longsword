import {Game} from '../src/core.js';

// 规则测试只保留一座已完工基地；不依赖演示关兵力、AI 或科技配置。
export function productionGame(){
  const game=new Game('balanced');
  game.units=[];
  game.buildings=[];
  game.queue=[];
  game.aiQueue=[];
  game.ai=null;
  game.map.terrain.fill(0);
  game.food=5000;
  game.ore=5000;
  game.addBuilding('base',0,12,32).primary=true;
  game.addBuilding('base',1,110,70).primary=true;
  game.updateVision();
  return game;
}
