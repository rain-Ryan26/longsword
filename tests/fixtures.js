import {Game} from '../src/core.js';

// 规则测试只保留一座已完工基地；不依赖教程关兵力、AI 或科技配置。
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

// 所有关卡开局科技均未研发；需要高级兵或机械的测试自行补上已完成状态。
export function completeTechnologies(game){
  for(const tech of Object.values(game.technologies)){tech.status='complete';tech.remaining=0;}
  return game;
}
