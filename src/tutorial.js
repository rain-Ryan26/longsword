// 教程关卡的短主线：每一步由玩家实际操作（信号）或战局状态触发，完成后自动进入下一步。
// 信号名由 input.js / app.js 上报；完整快捷操作仍保留在「操作速查」。
const did=action=>(context,since)=>(context.signals[action]||0)>(since[action]||0);
const didAny=(...actions)=>(context,since)=>actions.some(action=>did(action)(context,since));
const didAll=(...actions)=>(context,since)=>actions.every(action=>did(action)(context,since));

export const TUTORIAL_STEPS=[
  {phase:'基础操作',text:'左键点击蓝色单位，或按住左键拖动来框选部队。',done:didAny('pick','box')},
  {phase:'基础操作',text:'右键点击地面，让选中部队移动过去；到达后它们会自动警戒。',done:did('move')},
  {phase:'基础操作',text:'滚轮缩放镜头，再按住鼠标中键拖动来平移镜头。',done:didAll('zoom','pan')},
  {phase:'基础操作',text:'先按 Ctrl + 1 保存当前选择，再按 1 召回编队。更多选兵方式可查看「操作速查」。',done:didAll('groupSave','groupRecall')},
  {phase:'建造与经济',text:'选中己方部队后按 B，打开右侧栏的建造菜单。',done:did('buildMenu')},
  {phase:'建造与经济',text:'按 R 选择采矿场，再左键点击黄色矿点；采矿场会自动吸附到矿点。',done:did('build-mine')},
  {phase:'建造与经济',text:'只选一名部队，按 B、Q 并左键放置哨塔；然后选中其他部队，右键哨塔工地补派施工。',done:didAll('build-tower','assist')},
  {phase:'建造与经济',text:'左键点选已完工基地，在右侧栏训练任意一名部队。',done:did('train')},
  {phase:'建造与经济',text:'点击空地取消选择，按 R 打开科技面板，再开始任意一项研发。',done:did('research')},
  {phase:'建造与经济',text:'选中基地后按 Y，再左键点击地面，为新训练的部队设置集结点。',done:did('rally')},
  {phase:'战斗',text:'选中部队，按 A 后左键点击东侧地面；部队会边前进边攻击。',done:did('attackMove')},
  {phase:'界面',text:'按空格暂停战局，再点击顶栏倍速按钮切换一次速度；完成后可继续战斗。',done:didAll('pause','speed')},
  {phase:'目标',text:'综合演练：摧毁东侧两座敌方营地，完成教程。',done:context=>context.state?.result==='victory'}
];

export class Tutorial{
  constructor(steps=TUTORIAL_STEPS){this.steps=steps;this.reset();}
  reset(){this.index=0;this.signals={};this.since={};}
  signal(action){this.signals[action]=(this.signals[action]||0)+1;}
  get total(){return this.steps.length;}
  get finished(){return this.index>=this.total;}
  enterNext(){this.index++;this.since={...this.signals};}
  skip(){if(!this.finished)this.enterNext();return this.finished;}
  // 操作信号只相对进入当前步骤时的计数判断，避免提前操作跳过后续提示。
  update(context){
    let advanced=false;
    while(!this.finished&&this.steps[this.index].done({...context,signals:this.signals},this.since)){this.enterNext();advanced=true;}
    return advanced;
  }
  presentation(){
    if(this.finished)return {progress:`${this.total} / ${this.total}`,text:'教程已完成：可以在本关自由练习，或点击「更换关卡」挑战其他战局。'};
    const step=this.steps[this.index];
    return {progress:`${step.phase} · ${this.index+1} / ${this.total}`,text:step.text};
  }
}
