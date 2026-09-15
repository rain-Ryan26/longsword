import {walkable} from './pathfinding.js';
import {createMapRandomAttack} from './random-map.js';
import {createMap,createMapAttack,createMapBalanced,createMapDefend} from './data.js';

export const ATTACK_SETUP={
  playerPerType:60,sectorStrengths:[30,50,70],scouts:3,
  playerWings:[{x:23,y:47},{x:30,y:60},{x:40,y:78}],
  towers:[[{x:86,y:23},{x:96,y:16}],[{x:94,y:60},{x:104,y:71},{x:94,y:46}],[{x:106,y:22},{x:117,y:26},{x:102,y:8},{x:120,y:40}]]
};
export const LEVELS={
  sandbox:{title:'沙盒模式',desc:'左侧蓝方 · 右侧红方，自由布阵并试战。',toast:'右栏选择兵种；Shift 移动连续放置，选择工具框选后 D 删除。'},
  tutorial:{title:'新兵教程',desc:'跟随左上角的短主线掌握核心操作，最后摧毁两座敌方营地。',toast:'教程已开始：进阶操作可查看“操作速查”，也可随时跳过当前步骤。'},
  balanced:{title:'均衡对抗',desc:'扩张经济、集结部队，摧毁敌方全部建筑。',toast:'双方各 6 盾兵、6 弓箭兵；绿色食物点上的食物厂产量翻倍。'},
  attack:{title:'突破三处据点',desc:'60 盾兵、60 弓箭兵、2 装甲车、2 蒸汽步行机，摧毁敌方全部建筑。',toast:'三路部队从左下出发；敌方三据点驻守 30 / 50 / 70 人，共 9 座哨塔，野狗分路巡逻。'},
  randomAttack:{title:'随机进攻',desc:'在随机山林与资源布局中突破三处敌营，摧毁敌方全部建筑。',toast:'沿用进攻兵力与三据点联防；每次重开生成新的山林、资源和敌营。'},
  defend:{title:'抵御两波进攻',desc:'准备 120 秒，敌军首波 70 盾兵 + 70 弓兵，第二波 35 盾 + 35 弓。我方 60 盾 + 60 弓 + 2 蒸汽步行机 + 4 装甲车。保留建筑并全灭两波敌军。',toast:'趁准备期布防；第一波全灭后休整 30 秒迎接第二波。'}
};

export function createLevelMap(level,seed){
  if(level==='randomAttack')return createMapRandomAttack(seed);
  if(level==='sandbox'){const map={version:1,width:96,height:64,terrain:new Array(96*64).fill(0),resources:[],foodPoints:[],camps:[],patrol:[]};for(let y=0;y<64;y++)for(let x=0;x<96;x++)if(Math.abs(x+.5-48)<4&&(y<26||y>39))map.terrain[y*96+x]=1;return map;}
  const factory={balanced:createMapBalanced,attack:createMapAttack,defend:createMapDefend}[level]||createMap;
  return factory();
}

export function setupLevel(game){
    if(game.level==='sandbox'){game.sandboxEditing=true;game.sandboxSetup=[];return;}
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
    if(game.level==='tutorial'){
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
    if(game.level==='attack'||game.level==='randomAttack'){
      const home=game.map.spawns[0];
      game.addBuilding('base',0,home.x,home.y).primary=true;
      game.addBuilding('machineFactory',0,6,76);
      for(const team of [0,1]){
        const node=game.map.resources[team],food=game.map.foodPoints[team];
        const mine=game.addBuilding('mine',team,node.x+.5,node.y+.5);
        const factory=game.addBuilding('factory',team,food.x+.5,food.y+.5);
        if(team){mine.defenseSector=2;factory.defenseSector=2;}
      }
      game.map.camps.forEach((p,sector)=>{
        const base=game.addBuilding('base',1,p.x,p.y);base.defenseSector=sector;base.primary=sector===2;
        for(const site of (game.map.towers||ATTACK_SETUP.towers)[sector])game.addBuilding('tower',1,site.x,site.y).defenseSector=sector;
      });
      // 仅本关：初始编队落在最近的空闲平地，避开建筑、地形和其他出生单位。
      const occupied=new Set();
      const deploy=(type,team,x,y)=>{
        let best=null,score=Infinity;
        for(let yy=Math.max(0,Math.floor(y)-12);yy<Math.min(game.map.height,Math.floor(y)+13);yy++)
          for(let xx=Math.max(0,Math.floor(x)-12);xx<Math.min(game.map.width,Math.floor(x)+13);xx++){
            const cell=yy*game.map.width+xx,d=(xx+.5-x)**2+(yy+.5-y)**2;
            if(d<score&&!occupied.has(cell)&&game.map.terrain[cell]===0&&walkable(game.map,game.buildings,xx,yy)){
              best={x:xx+.5,y:yy+.5,cell};score=d;
            }
          }
        if(!best)throw new Error('进攻关卡出生区域没有可用平地');
        occupied.add(best.cell);return game.addUnit(type,team,best.x,best.y);
      };
      ATTACK_SETUP.playerWings.forEach((p,wing)=>{
        for(const type of ['shield','archer'])for(let n=0;n<ATTACK_SETUP.playerPerType/ATTACK_SETUP.playerWings.length;n++){
          const front=type==='shield';
          const u=deploy(type,0,p.x+(front?2:-6)+(n%5)*1.6,p.y+(front?-7:1)+Math.floor(n/5)*1.6);
          u.attackWing=wing;
        }
      });
      for(let n=0;n<2;n++)deploy('armoredCar',0,22+n*3,70);
      for(let n=0;n<2;n++)deploy('steamWalker',0,24+n*4,74);
      game.map.camps.forEach((p,sector)=>{
        const count=ATTACK_SETUP.sectorStrengths[sector],shields=count*.6;
        for(let n=0;n<count;n++){
          const front=n<shields,index=front?n:n-shields;
          const u=deploy(front?'shield':'archer',1,p.x+(front?-10:-2)+(index%6)*1.6,p.y+(front?4:-7)+Math.floor(index/6)*1.6);
          u.home={x:u.x,y:u.y};u.role='guard';u.defenseSector=sector;
        }
      });
      for(let n=0;n<ATTACK_SETUP.scouts;n++){
        const sector=[0,2,1][n],p=game.map.camps[sector],start=game.map.patrolRoutes[n][0];
        const u=deploy('wilddog',1,start.x,start.y);
        u.home={x:p.x-4,y:p.y+4};u.role='scout';u.scoutIndex=0;u.patrolRoute=n;
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
