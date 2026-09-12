import {createMap,createMapAttack,createMapBalanced,createMapDefend} from './data.js';

export const ATTACK_SETUP={playerPerType:60,defenderShield:8,defenderArcher:10,sectorY:[8,20,32,44,56]};
export const LEVELS={
  demo:{title:'夺下双营地',desc:'侦察东部资源点，摧毁两座敌方营地。',toast:'框选蓝色部队，按 A 后点击目的地。'},
  balanced:{title:'均衡对抗',desc:'扩张经济、集结部队，摧毁敌方全部建筑。',toast:'双方各 6 盾兵、6 弓箭兵；绿色食物点上的食物厂产量翻倍。'},
  attack:{title:'突破五塔联防',desc:`率领 ${ATTACK_SETUP.playerPerType} 盾兵、${ATTACK_SETUP.playerPerType} 弓箭兵，摧毁敌方全部建筑。`,toast:`敌军有 ${ATTACK_SETUP.defenderShield*ATTACK_SETUP.sectorY.length} 盾、${ATTACK_SETUP.defenderArcher*ATTACK_SETUP.sectorY.length} 弓且不能补员；攻击一处防区会引来其他守军增援。`},
  defend:{title:'抵御两波进攻',desc:'准备 120 秒，敌军 40+20 或 60+30 人。我方与第一波等量，保留建筑并全灭两波敌军。',toast:'趁准备期布防；第一波全灭后休整 30 秒迎接第二波。'}
};

export function createLevelMap(level){
  const factory={balanced:createMapBalanced,attack:createMapAttack,defend:createMapDefend}[level]||createMap;
  return factory();
}

export function setupLevel(game){
    if(game.level==='balanced'){
      for(const team of [0,1]){
        const p=game.map.spawns[team];
        game.addBuilding('base',team,p.x,p.y).primary=true;
        const node=game.map.resources[team],food=game.map.foodPoints[team];
        game.addBuilding('mine',team,node.x+.5,node.y+.5);
        game.addBuilding('factory',team,food.x+.5,food.y+.5);
        for(let n=0;n<12;n++){
          const x=20+(n%4)*2,y=66+Math.floor(n/4)*2;
          game.addUnit(n<6?'shield':'archer',team,team?game.map.width-x:x,team?game.map.height-y:y);
        }
      }
      return;
    }
    if(game.level==='demo'){
      game.addBuilding('base',0,12,32).primary=true;
      game.addBuilding('machineFactory',0,6,32);
      game.map.camps.forEach((p,i)=>{game.addBuilding('camp',1,p.x,p.y);for(let n=0;n<30;n++){const u=game.addUnit(n<17?'shield':'archer',1,p.x-6+(n%3)*2,p.y-4+Math.floor(n/3)*3);u.home={x:u.x,y:u.y};u.role='guard';u.camp=i;}});
      for(let n=0;n<30;n++)game.addUnit(n<17?'shield':'archer',0,19+(n%6)*2,27+Math.floor(n/6)*2.2);
      for(const type of ['armoredCar','steamWalker'])for(let n=0;n<2;n++)game.addUnit(type,0,24+n*2.5,33+n*2);
      for(let n=0;n<10;n++){const u=game.addUnit(n<6?'shield':'archer',1,57+n*1.3,29);u.role='patrol';u.patrolIndex=0;}
      return;
    }
    if(game.level==='defend'){
      const firstWave=Math.random()<.5?40:60;
      game.defense={sizes:[firstWave,firstWave/2],wave:0,nextWaveAt:120};
      game.addBuilding('base',0,12,32).primary=true;
      game.addBuilding('machineFactory',0,6,32);
      game.addBuilding('mine',0,22.5,40.5);
      game.addBuilding('factory',0,16.5,22.5);
      game.spawnDefenseArmy(firstWave,0);
      game.spawnDefenseArmy(firstWave,1);
      return;
    }
    // 双方经济建筑直接完工。
    game.addBuilding('base',0,12,32).primary=true;
    game.addBuilding('machineFactory',0,6,32);
    game.addBuilding('mine',0,22.5,40.5);
    game.addBuilding('factory',0,16.5,22.5);
    game.addBuilding('base',1,84,32).primary=true;
    game.addBuilding('mine',1,72.5,24.5);
    game.addBuilding('factory',1,79.5,22.5);
    if(game.level==='attack'){
      const {playerPerType,defenderShield,defenderArcher,sectorY}=ATTACK_SETUP;
      for(const type of ['shield','archer'])for(let n=0;n<playerPerType;n++){
        const front=type==='shield',x=(front?30:18)+Math.floor(n/12)*2,y=4+(n%12)*5;
        game.addUnit(type,0,x,y);
      }
      // 玩家默认机械：3 装甲车、2 蒸汽步行机，置于其后半场。
      for(let n=0;n<3;n++)game.addUnit('armoredCar',0,40+n*3,62);
      for(let n=0;n<2;n++)game.addUnit('steamWalker',0,40+n*4,66);
      // 防区兵力与介绍读取同一份配置。
      for(const [sector,y] of sectorY.entries()){
        const tower=game.addBuilding('tower',1,68,y);tower.defenseSector=sector;
        for(const [type,count,x] of [['shield',defenderShield,63],['archer',defenderArcher,72]])for(let n=0;n<count;n++){
          const u=game.addUnit(type,1,x+(n%2)*1.6,y-4.8+Math.floor(n/2)*2.2);
          u.home={x:u.x,y:u.y};u.role='guard';u.defenseSector=sector;
        }
      }
      return;
    }
    for(let n=0;n<20;n++)game.addUnit(n<10?'shield':'archer',0,19+(n%4)*2,27+Math.floor(n/4)*2.2);
    for(let n=0;n<22;n++){
      const u=game.addUnit(n<14?'shield':'archer',1,78+(n%4)*2,27+Math.floor(n/4)*2.2);
      u.home={x:u.x,y:u.y};u.role='guard';
    }
  }
