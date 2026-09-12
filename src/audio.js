const STORAGE_KEY='longsword-audio-settings';
const defaults={master:60,effects:70,muted:false};

export class AudioManager{
  constructor(){
    this.settings=this.load();this.unlocked=false;this.lastPlayed=new Map();
    this.sources={shieldAttack:'assets/audio/shield-attack.ogg',archerFire:'assets/audio/archer-fire.mp3'};
    document.addEventListener('pointerdown',()=>this.unlock(),{once:true});
  }
  load(){try{return {...defaults,...JSON.parse(localStorage.getItem(STORAGE_KEY))};}catch{return {...defaults};}}
  save(settings){this.settings={...this.settings,...settings};localStorage.setItem(STORAGE_KEY,JSON.stringify(this.settings));}
  unlock(){this.unlocked=true;}
  play(kind){
    const source=this.sources[kind],now=performance.now();
    if(!source||!this.unlocked||this.settings.muted||this.settings.master===0||this.settings.effects===0||now-(this.lastPlayed.get(kind)||0)<110)return;
    this.lastPlayed.set(kind,now);
    const sound=new Audio(source);sound.volume=this.settings.master/100*this.settings.effects/100;
    sound.play().catch(()=>{});
  }
}
