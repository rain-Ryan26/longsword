export const W = 96, H = 64;
export const STATS = {
  shield:{name:'盾兵',hp:150,armor:5,damage:18,cooldown:.85,range:1.5,speed:3.2,vision:10,food:35,ore:20},
  archer:{name:'弓箭兵',hp:75,armor:1,damage:14,cooldown:1.2,range:8,speed:3.5,vision:12,food:40,ore:15},
  base:{name:'前线基地',hp:900,armor:4,vision:14},
  camp:{name:'资源营地',hp:550,armor:3,vision:11}
};
export function createMap(){
  const terrain = new Array(W*H).fill(0);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const mountain = ((x-44)/5)**2+((y-16)/11)**2<1 || ((x-49)/6)**2+((y-49)/9)**2<1 || ((x-25)/7)**2+((y-53)/4)**2<1;
    const forest = ((x-27)/8)**2+((y-15)/6)**2<1 || ((x-62)/7)**2+((y-33)/8)**2<1 || ((x-84)/7)**2+((y-51)/5)**2<1;
    terrain[y*W+x]=mountain?1:forest?2:0;
  }
  return {version:1,width:W,height:H,terrain,camps:[{x:76,y:18},{x:77,y:46}],patrol:[{x:57,y:25},{x:70,y:27},{x:72,y:37},{x:58,y:38}]};
}
