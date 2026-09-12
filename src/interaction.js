// 鼠标和快捷键共用同一个互斥模式；建筑选择与放置预览也在此重置。
export class InteractionState{
  constructor(){this.enter('select');}

  enter(mode,{type=null,buildingId=null}={}){
    this.mode=mode;
    this.type=mode==='place'?type:null;
    this.selectedBuilding=['select','technology','rally'].includes(mode)?buildingId:null;
    this.buildPreview=null;
  }

  get buildMenu(){return this.mode==='build'||this.mode==='place';}
  get buildType(){return this.type;}
  get techMenu(){return this.mode==='technology';}
  get attackMode(){return this.mode==='attack';}
  get rallyBaseId(){return this.mode==='rally'?this.selectedBuilding:null;}

  presentation(observer,buildingName=''){
    if(observer)return {cursor:'default',hint:'观察窗口 · 滚轮缩放 · 中键拖动'};
    if(this.mode==='attack')return {cursor:'crosshair',hint:'攻击移动：左键指定位置 · Esc 取消'};
    if(this.mode==='place')return {cursor:'crosshair',hint:`放置${buildingName}：左键建造 · 右键 / Esc 取消`};
    if(this.mode==='rally')return {cursor:'crosshair',hint:'设置集结点：左键点击地图 · Esc 取消'};
    return {cursor:'default',hint:'左键选择 · 右键移动'};
  }
}
