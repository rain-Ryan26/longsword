import {createMap,createMapAttack,createMapBalanced,createMapDefend} from './data.js';

export const ATTACK_SETUP={playerPerType:60,sectorStrengths:[30,50,70],scouts:3};
export const LEVELS={
  demo:{title:'夺下双营地',desc:'侦察东部资源点，摧毁两座敌方营地。',toast:'框选蓝色部队，按 A 后点击目的地。'},
  balanced:{title:'均衡对抗',desc:'扩张经济、集结部队，摧毁敌方全部建筑。',toast:'双方各 6 盾兵、6 弓箭兵；绿色食物点上的食物厂产量翻倍。'},
  attack:{title:'突破三处据点',desc:'60 盾兵、60 弓箭兵、2 装甲车、2 蒸汽步行机，摧毁敌方全部建筑。',toast:'150 名敌军随机驻守三处基地，野狗侦察发现大部队会引来增援。'},
  defend:{title:'抵御两波进攻',desc:'准备 120 秒，敌军首波 70 盾兵 + 70 弓兵，第二波 35 盾 + 35 弓。我方 60 盾 + 60 弓 + 2 蒸汽步行机 + 4 装甲车。保留建筑并全灭两波敌军。',toast:'趁准备期布防；第一波全灭后休整 30 秒迎接第二波。'}
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
      game.map.camps.forEach((p,i)=>{game.addBuilding('base',1,p.x,p.y);for(let n=0;n<30;n++){const u=game.addUnit(n<17?'shield':'archer',1,p.x-6+(n%3)*2,p.y-4+Math.floor(n/3)*3);u.home={x:u.x,y:u.y};u.role='guard';u.camp=i;}});
      for(let n=0;n<30;n++)game.addUnit(n<17?'shield':'archer',0,19+(n%6)*2,27+Math.floor(n/6)*2.2);
      for(const type of ['armoredCar','steamWalker'])for(let n=0;n<2;n++)game.addUnit(type,0,24+n*2.5,33+n*2);
      for(let n=0;n<10;n++){const u=game.addUnit(n<6?'shield':'archer',1,57+n*1.3,29);u.role='patrol';u.patrolIndex=0;}
      return;
    }
    if(game.level==='defend'){
      game.defense={sizes:[{shield:70,archer:70},{shield:35,archer:35}],wave:0,nextWaveAt:120};
      game.addBuilding('base',0,12,32).primary=true;
      game.addBuilding('machineFactory',0,6,32);
      game.addBuilding('mine',0,22.5,40.5);
      game.addBuilding('factory',0,16.5,22.5);
      game.spawnDefenseArmy(60,60,0);
      game.spawnDefenseArmy(70,70,1);
      for(let n=0;n<4;n++)game.addUnit('armoredCar',0,22+n*3,18);
      for(let n=0;n<2;n++)game.addUnit('steamWalker',0,25+n*4,15);
      return;
    }
    if(game.level==='attack'){
      game.addBuilding('base',0,12,44).primary=true;
      game.addBuilding('machineFactory',0,6,44);
      game.addBuilding('mine',0,22.5,52.5);
      game.addBuilding('factory',0,16.5,34.5);
      for(const type of ['shield','archer'])for(let n=0;n<ATTACK_SETUP.playerPerType;n++)
        game.addUnit(type,0,(type==='shield'?30:18)+Math.floor(n/12)*2,10+(n%12)*5);
      for(let n=0;n<2;n++)game.addUnit('armoredCar',0,26+n*3,72);
      for(let n=0;n<2;n++)game.addUnit('steamWalker',0,26+n*4,76);
      const strengths=[...ATTACK_SETUP.sectorStrengths];
      for(let i=strengths.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[strengths[i],strengths[j]]=[strengths[j],strengths[i]];}
      game.map.camps.forEach((p,sector)=>{
        const base=game.addBuilding('base',1,p.x,p.y);base.defenseSector=sector;base.primary=sector===1;
        game.addBuilding('tower',1,p.x-9,p.y).defenseSector=sector;
        const count=strengths[sector],shields=count*.6;
        for(let n=0;n<count;n++){
          const front=n<shields,index=front?n:n-shields;
          const u=game.addUnit(front?'shield':'archer',1,p.x+(front?-7:4)+(index%6)*1.4,p.y-6+Math.floor(index/6)*2);
          u.home={x:u.x,y:u.y};u.role='guard';u.defenseSector=sector;
        }
      });
      game.addBuilding('mine',1,114.5,44.5).defenseSector=1;
      game.addBuilding('factory',1,115.5,36.5).defenseSector=1;
      for(let n=0;n<ATTACK_SETUP.scouts;n++){
        const p=game.map.camps[n],u=game.addUnit('wilddog',1,p.x-14,p.y);
        u.home={x:p.x-4,y:p.y};u.role='scout';u.scoutIndex=n*3;
      }
      return;
    }
    game.addBuilding('base',0,12,32).primary=true;
    game.addBuilding('machineFactory',0,6,32);
    game.addBuilding('mine',0,22.5,40.5);
    game.addBuilding('factory',0,16.5,22.5);
    game.addBuilding('base',1,84,32).primary=true;
    game.addBuilding('mine',1,72.5,24.5);
    game.addBuilding('factory',1,79.5,22.5);
    for(let n=0;n<20;n++)game.addUnit(n<10?'shield':'archer',0,19+(n%4)*2,27+Math.floor(n/4)*2.2);
    for(let n=0;n<22;n++){
      const u=game.addUnit(n<14?'shield':'archer',1,78+(n%4)*2,27+Math.floor(n/4)*2.2);
      u.home={x:u.x,y:u.y};u.role='guard';
    }
  }
