export const W = 96, H = 64;
// 地形编号：0 平地、1 山地、2 森林。
// 侦测系数：陆地视线每经过一格消耗 1/系数 的侦测距离（森林贵、山地省）。
export const DETECTION_MULTIPLIERS = [1, 1.2, 0.3];
export const MOVEMENT_MULTIPLIERS = [1, 0.2, 0.6];
export const isSlowTerrain = terrain=>terrain===1||terrain===2;
export const TECHNOLOGIES = {
  castIron:{name:'铸铁装甲',section:'机械',food:300,ore:300,researchTime:60},
  artillery:{name:'火炮',section:'机械',food:500,ore:500,researchTime:120},
  steamCore:{name:'蒸汽核心',section:'机械',food:700,ore:700,researchTime:180},
  compositeShield:{name:'复合盾牌',section:'部队',food:300,ore:600,researchTime:60},
  precisionBolts:{name:'精巧弩箭',section:'部队',food:300,ore:600,researchTime:60}
};
export const STATS = {
  shield:{name:'盾兵',hp:70,armor:5,damage:14,cooldown:.85,range:1.5,speed:1.75,vision:9,food:50,ore:10,trainTime:5,movable:true,air:false},
  ironShield:{name:'铁甲兵',hp:75,armor:8,damage:16,cooldown:.85,range:1.5,speed:1.75,vision:9,food:50,ore:20,trainTime:5,movable:true,air:false},
  archer:{name:'弓箭兵',hp:50,armor:1,damage:15,cooldown:1.2,range:7,speed:1.6,vision:9,food:60,ore:10,trainTime:5,movable:true,air:false,antiAir:true,ranged:true},
  crossbow:{name:'强弩兵',hp:50,armor:1,damage:22,cooldown:1.2,range:7,speed:1.6,vision:9,food:60,ore:20,trainTime:5,movable:true,air:false,antiAir:true,ranged:true},
  armoredCar:{name:'装甲车',hp:200,armor:12,damage:22,cooldown:.6,range:8,speed:2.45,vision:10,food:150,ore:150,trainTime:10,pop:3,movable:true,air:false,ranged:true,machine:true,visualSize:1.2,collisionRadius:.55},
  steamWalker:{name:'蒸汽步行机',hp:300,armor:20,damage:70,cooldown:1,range:10,speed:1.4,vision:13,food:300,ore:500,trainTime:30,pop:5,movable:true,air:false,ranged:true,machine:true,noMountains:true,visualSize:1.35,collisionRadius:.65,projectileKind:'cannonball',splashDamage:20,splashRadius:2,audioEvent:'cannonFire'},
  wilddog:{name:'野狗',hp:55,armor:0,damage:9,cooldown:.5,range:1.5,speed:2.75,vision:10,food:30,ore:0,trainTime:2,movable:true,air:false},
  pigeon:{name:'信鸽',hp:40,armor:0,damage:4,cooldown:.8,range:1.5,speed:5,vision:15,visionGround:5,food:60,ore:0,trainTime:2,movable:true,air:true,airOnly:true,minTurnRadius:2,orbitRadius:4},
  base:{name:'前线基地',hp:2000,armor:5,vision:10,food:300,ore:400,buildTime:240,maxBuilders:6,healRange:6,healRate:2,healTargets:5,pop:40},
  mine:{name:'采矿场',hp:1000,armor:5,vision:10,food:200,ore:200,buildTime:180,halfSize:1.5},
  tower:{name:'哨塔',hp:600,armor:5,vision:10*1.3,range:7+1,damage:15,cooldown:1.2,food:150,ore:150,buildTime:45,maxBuilders:2,halfSize:1,antiAir:true,antiAirRange:2+4},
  factory:{name:'食物厂',hp:1000,armor:5,vision:10,food:200,ore:200,buildTime:180,halfSize:1.5},
  machineFactory:{name:'机械工厂',hp:1200,armor:5,vision:10,food:300,ore:400,buildTime:480,maxBuilders:8},
};
export const popOf=t=>STATS[t].pop||1;
export const usedPop=(units,team,queue=[])=>units.reduce((n,u)=>n+(u.team===team&&u.hp>0?popOf(u.type):0),0)+queue.reduce((n,q)=>n+popOf(q.type),0);
export function createMap(){
  const terrain = new Array(W*H).fill(0);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const mountain = ((x-44)/5)**2+((y-16)/11)**2<1 || ((x-49)/6)**2+((y-49)/9)**2<1 || ((x-25)/7)**2+((y-53)/4)**2<1;
    const forest = ((x-27)/8)**2+((y-15)/6)**2<1 || ((x-62)/7)**2+((y-33)/8)**2<1 || ((x-84)/7)**2+((y-51)/5)**2<1;
    terrain[y*W+x]=mountain?1:forest?2:0;
  }
  // resources 坐标为资源区块（格子）编号，矿点覆盖该 1×1 格子
  return {version:1,width:W,height:H,terrain,resources:[{x:24,y:40}],camps:[{x:76,y:18},{x:77,y:46}],patrol:[{x:57,y:25},{x:70,y:27},{x:72,y:37},{x:58,y:38}]};
}
// 进攻关卡复用均衡地形与资源，仅添加攻坚据点和分路巡逻。
export function createMapAttack(){
  const map=createMapBalanced();
  map.camps=[{x:86,y:12},{x:104,y:60},{x:116,y:12}];
  map.patrolRoutes=[
    [{x:86,y:24},{x:61,y:27},{x:49,y:18},{x:85,y:8}],
    [{x:100,y:30},{x:91,y:42},{x:68,y:44},{x:94,y:24}],
    [{x:104,y:72},{x:75,y:77},{x:67,y:59},{x:96,y:64}]
  ];
  map.patrol=map.patrolRoutes.flat();
  return map;
}
// 防守关卡：中部山体纵墙仅留缺口，敌军须经缺口进攻我方基地
export function createMapDefend(){
  const terrain=new Array(W*H).fill(0);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const wall=Math.abs(x-50)<4&&(y<26||y>40);
    const mountain=wall||((x-30)/6)**2+((y-10)/6)**2<1||((x-70)/6)**2+((y-54)/6)**2<1;
    const forest=((x-38)/8)**2+((y-50)/6)**2<1||((x-62)/7)**2+((y-12)/6)**2<1;
    terrain[y*W+x]=mountain?1:forest?2:0;
  }
  return {version:1,width:W,height:H,terrain,resources:[{x:22,y:40}],camps:[],patrol:[]};
}

// 九组伴生资源：四组及其旋转对应点，外加中央错开的一组。
export function createMapBalanced(){
  const width=128,height=88,terrain=new Array(width*height).fill(0);
  const pairs=points=>points.flatMap(p=>[p,{x:width-1-p.x,y:height-1-p.y}]);
  const resources=[...pairs([{x:18,y:74},{x:39,y:66},{x:21,y:37},{x:48,y:18}]),{x:60,y:43}];
  const foodPoints=[...pairs([{x:10,y:66},{x:33,y:60},{x:27,y:31},{x:42,y:12}]),{x:67,y:44}];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const ellipse=(cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<1;
    const mountain=ellipse(44,35,6,12)||ellipse(83,52,6,12)||ellipse(72,18,10,5)||ellipse(55,69,10,5);
    const forest=ellipse(17,49,6,5)||ellipse(110,38,6,5)||ellipse(49,51,5,4)||ellipse(78,36,5,4);
    terrain[y*width+x]=mountain?1:forest?2:0;
  }
  return {version:1,width,height,terrain,resources,foodPoints,camps:[],patrol:[],spawns:[{x:12,y:76},{x:116,y:12}]};
}
