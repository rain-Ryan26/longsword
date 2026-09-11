export const W = 96, H = 64;
// 地形编号：0 平地、1 山地、2 森林。
export const DETECTION_MULTIPLIERS = [1, 1.2, 0.3];
export const MOVEMENT_MULTIPLIERS = [1, 0.2, 0.6];
export const STATS = {
  shield:{name:'盾兵',hp:150,armor:5,damage:18,cooldown:.85,range:1.5,speed:3.2,vision:10,food:35,ore:20},
  archer:{name:'弓箭兵',hp:75,armor:1,damage:14,cooldown:1.2,range:8,speed:3.5,vision:12,food:40,ore:15},
  base:{name:'前线基地',hp:900,armor:4,vision:14,food:300,ore:600,buildTime:240,maxBuilders:6,healRange:6,healRate:2,healTargets:5},
  mine:{name:'采矿场',hp:550,armor:3,vision:11,food:300,ore:400,buildTime:180},
  tower:{name:'哨塔',hp:450,armor:5,vision:12*1.3,range:8*1.3,damage:14,cooldown:1.2,food:100,ore:200,buildTime:120,maxBuilders:2,halfSize:1},
  factory:{name:'食物厂',hp:550,armor:3,vision:11,food:200,ore:100,buildTime:180},
  camp:{name:'资源营地',hp:550,armor:3,vision:11}
};
export function createMap(){
  const terrain = new Array(W*H).fill(0);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const mountain = ((x-44)/5)**2+((y-16)/11)**2<1 || ((x-49)/6)**2+((y-49)/9)**2<1 || ((x-25)/7)**2+((y-53)/4)**2<1;
    const forest = ((x-27)/8)**2+((y-15)/6)**2<1 || ((x-62)/7)**2+((y-33)/8)**2<1 || ((x-84)/7)**2+((y-51)/5)**2<1;
    terrain[y*W+x]=mountain?1:forest?2:0;
  }
  return {version:1,width:W,height:H,terrain,resources:[{x:24,y:40}],camps:[{x:76,y:18},{x:77,y:46}],patrol:[{x:57,y:25},{x:70,y:27},{x:72,y:37},{x:58,y:38}]};
}
