import {STATS} from './data.js';
import {buildingCells,coversCell} from './pathfinding.js';
const TEAM=['#85d7e3','#e59678'];
export class Renderer{
  constructor(canvas,minimap){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.minimap=minimap;this.mc=minimap.getContext('2d');this.camera={x:25,y:32,zoom:13};this.width=1;this.height=1;this.terrainCanvas=null;this.lastMap=null;this.sizeDirty=true;
    this.resizeObserver=new ResizeObserver(()=>{this.sizeDirty=true;});this.resizeObserver.observe(canvas);
  }
  resize(){this.sizeDirty=false;this.dpr=window.devicePixelRatio||1;const r=this.canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;this.width=r.width;this.height=r.height;if(this.canvas.width!==Math.round(r.width*dpr)||this.canvas.height!==Math.round(r.height*dpr)){this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);}this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  world(x,y){return {x:(x-this.width/2)/this.camera.zoom+this.camera.x,y:(y-this.height/2)/this.camera.zoom+this.camera.y};}
  screen(x,y){return {x:(x-this.camera.x)*this.camera.zoom+this.width/2,y:(y-this.camera.y)*this.camera.zoom+this.height/2};}
  clamp(){const W=this.lastMap?.width??96,H=this.lastMap?.height??64;this.camera.x=Math.max(0,Math.min(W,this.camera.x));this.camera.y=Math.max(0,Math.min(H,this.camera.y));}
  zoomAt(x,y,factor){const before=this.world(x,y);this.camera.zoom=Math.max(5,Math.min(36,this.camera.zoom*factor));const after=this.world(x,y);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.clamp();}
  bake(map){
    const {width:W,height:H}=map;
    this.terrainCanvas=document.createElement('canvas');const c=this.terrainCanvas;c.width=W*16;c.height=H*16;const ctx=c.getContext('2d');
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const t=map.terrain[y*W+x],n=((x*37+y*71)%13);ctx.fillStyle=t===1?'#4b5547':t===2?'#2c402d':'#46573b';ctx.fillRect(x*16,y*16,16,16);
      if(t===1){ctx.fillStyle='#69705a';ctx.beginPath();ctx.moveTo(x*16+1,y*16+14);ctx.lineTo(x*16+7,y*16+3);ctx.lineTo(x*16+15,y*16+14);ctx.fill();ctx.fillStyle='#3b493d';ctx.beginPath();ctx.moveTo(x*16+7,y*16+3);ctx.lineTo(x*16+7,y*16+14);ctx.lineTo(x*16+15,y*16+14);ctx.fill();}
      else if(t===2&&n%2===0){ctx.fillStyle='#1e3227';ctx.beginPath();ctx.arc(x*16+8,y*16+8,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3b5236';ctx.beginPath();ctx.arc(x*16+7,y*16+6,3,0,Math.PI*2);ctx.fill();}
      else if(n===1){ctx.fillStyle='#7e835139';ctx.fillRect(x*16+7,y*16+8,2,3);}
    }
    ctx.strokeStyle='#b5c18c35';ctx.lineWidth=1.5;ctx.beginPath();for(let x=0;x<=W;x+=8){ctx.moveTo(x*16,0);ctx.lineTo(x*16,H*16);}for(let y=0;y<=H;y+=8){ctx.moveTo(0,y*16);ctx.lineTo(W*16,y*16);}ctx.stroke();
    this.lastMap=map;this.fogCanvas=null;this.fogKey=null;this.miniBackgroundKey=null;this.miniUnitsKey=null;
  }
  draw(state,view,selected,drag,marker,selectedBuilding=null,buildPreview=null){
    const {width:W,height:H}=state.map;
    if(this.sizeDirty||this.dpr!==(window.devicePixelRatio||1))this.resize();
    const mapChanged=this.lastMap!==state.map;
    const now=performance.now(),animated=!!marker&&marker.until>now;
    const key=JSON.stringify([state.revision,state.time,state.visionVersion,view,this.camera,this.width,this.height,this.dpr,this.minimap.width,this.minimap.height,[...selected],drag,animated?marker:null,selectedBuilding,buildPreview]);
    if(!mapChanged&&key===this.frameKey&&!animated)return false;
    this.frameKey=key;
    if(mapChanged)this.bake(state.map);
    this.prepareFog(state,view);
    const c=this.ctx,z=this.camera.zoom,team=view===2?1:0,all=view===1,visible=state.visible[team],explored=state.explored[team];
    c.fillStyle='#101b17';c.fillRect(0,0,this.width,this.height);c.save();c.translate(this.width/2-this.camera.x*z,this.height/2-this.camera.y*z);c.scale(z,z);
    c.drawImage(this.terrainCanvas,0,0,W,H);
    const mined=node=>state.buildings.some(b=>b.type==='mine'&&b.hp>0&&!b.constructionPending&&coversCell(b,node));
    for(const node of state.map.resources||[]){
      if(mined(node))continue;
      if(!all&&!explored[Math.floor(node.y)*W+Math.floor(node.x)])continue;
      c.fillStyle='#f2ce45';c.fillRect(node.x,node.y,1,1);
      c.textAlign='center';c.font='.75px "Microsoft YaHei"';c.fillText('矿产资源点',node.x+.5,node.y+3);
    }
    for(const node of state.map.foodPoints||[]){
      if(!all&&!explored[node.y*W+node.x])continue;
      if(state.buildings.some(b=>b.type==='factory'&&b.hp>0&&!b.constructionPending&&coversCell(b,node)))continue;
      c.fillStyle='#a6dc74';c.fillRect(node.x,node.y,1,1);
      c.textAlign='center';c.font='.75px "Microsoft YaHei"';c.fillText('食物点 ×2',node.x+.5,node.y+3);
    }
    // Paths and entities are clipped by the same fog painted at the end.
    for(const b of state.buildings){
      if(!this.inView(b,7))continue;
      if(b.hp<=0){if(b.type==='mine')continue;if(all||explored[Math.floor(b.y)*W+Math.floor(b.x)]){c.fillStyle='#303329';const r=(STATS[b.type].halfSize||2)*.85;c.fillRect(b.x-r,b.y-r,r*2,r*2);}continue;}
      if(!all&&b.team!==team&&!visible[Math.floor(b.y)*W+Math.floor(b.x)])continue;
      if(b.type==='base'&&b.id===selectedBuilding&&!b.constructionPending){
        c.strokeStyle='#9de6a080';c.lineWidth=.1;c.beginPath();c.arc(b.x,b.y,STATS.base.healRange,0,Math.PI*2);c.stroke();
      }
      if(b.type==='mine'){
        c.save();c.translate(b.x,b.y);c.fillStyle='#0c171880';c.fillRect(-1.2,-1.05,2.7,2.7);c.fillStyle='#35515a';c.strokeStyle=TEAM[b.team];c.lineWidth=.12;c.fillRect(-1.35,-1.35,2.7,2.7);c.strokeRect(-1.35,-1.35,2.7,2.7);c.fillStyle='#f2ce45';c.fillRect(-.65,-.65,1.3,1.3);
        if(b.id===selectedBuilding){c.strokeStyle='#e0ebac';c.lineWidth=.15;c.strokeRect(-2,-2,4,4);}
        this.bar(c,0,-1.8,2.7,b.hp/b.maxHp,b.team);
        c.fillStyle='#e0dfb7';c.textAlign='center';c.font=`${Math.max(.65,10/z)}px "Microsoft YaHei"`;
        c.fillText(b.awaitingEviction?'采矿场 · 等待部队离开':b.constructionPending?(b.activeBuilders?`采矿场 · ${b.activeBuilders} 人 · ${Math.ceil(b.constructionRemaining/b.activeBuilders)} 秒`:'采矿场 · 等待施工'):'采矿场',0,b.constructionPending?1.8:2.8);
        c.restore();continue;
      }
      if(b.type==='factory'){
        c.save();c.translate(b.x,b.y);c.fillStyle='#0c171880';c.fillRect(-1.2,-1.05,2.7,2.7);c.fillStyle='#35515a';c.strokeStyle=TEAM[b.team];c.lineWidth=.12;c.fillRect(-1.35,-1.35,2.7,2.7);c.strokeRect(-1.35,-1.35,2.7,2.7);c.fillStyle='#f2ce45';c.beginPath();c.arc(0,0,.75,0,Math.PI*2);c.fill();
        if(b.id===selectedBuilding){c.strokeStyle='#e0ebac';c.lineWidth=.15;c.strokeRect(-2,-2,4,4);}
        this.bar(c,0,-1.8,2.7,b.hp/b.maxHp,b.team);
        c.fillStyle='#e0dfb7';c.textAlign='center';c.font=`${Math.max(.65,10/z)}px "Microsoft YaHei"`;
        c.fillText(b.awaitingEviction?'食物厂 · 等待部队离开':b.constructionPending?(b.activeBuilders?`食物厂 · ${b.activeBuilders} 人 · ${Math.ceil(b.constructionRemaining/b.activeBuilders)} 秒`:'食物厂 · 等待施工'):(state.map.foodPoints||[]).some(n=>coversCell(b,n))?'食物厂 ×2':'食物厂',0,b.constructionPending?1.8:2.8);
        c.restore();continue;
      }
      if(b.type==='tower'){
        c.save();c.translate(b.x,b.y);
        c.fillStyle='#0c171880';c.fillRect(-.9,-.6,1.8,1.5);
        c.fillStyle='#35515a';c.strokeStyle=TEAM[b.team];c.lineWidth=.1;
        c.fillRect(-.5,-2,.95,2.7);c.strokeRect(-.5,-2,.95,2.7);
        c.fillStyle='#72999b';c.fillRect(-.85,-2.2,1.7,.5);c.strokeRect(-.85,-2.2,1.7,.5);
        c.beginPath();c.moveTo(-.4,.5);c.lineTo(.4,-1.6);c.moveTo(.4,.5);c.lineTo(-.4,-1.6);c.stroke();
        if(b.id===selectedBuilding){c.strokeStyle='#e0ebac';c.strokeRect(-1,-1,2,2);}
        if(!b.constructionPending){c.fillStyle=TEAM[b.team];c.beginPath();c.arc(0,-2.45,.25,0,Math.PI*2);c.fill();c.strokeStyle='#f4dfaa';c.beginPath();c.moveTo(-.45,-2.4);c.lineTo(.45,-2.4);c.moveTo(0,-2.75);c.lineTo(0,-2.05);c.stroke();}
        this.bar(c,0,-3.1,2,b.hp/b.maxHp,b.team);
        c.fillStyle='#e0dfb7';c.textAlign='center';c.font=`${Math.max(.65,10/z)}px "Microsoft YaHei"`;
        c.fillText('哨塔'+(b.awaitingEviction?' · 等待部队离开':b.constructionPending?(b.activeBuilders?` · ${b.activeBuilders} 人 · ${Math.ceil(b.constructionRemaining/b.activeBuilders)} 秒`:' · 等待施工'):''),0,1.8);
        c.restore();continue;
      }
      c.save();c.translate(b.x,b.y);c.fillStyle='#0c171880';c.fillRect(-1.7,-1.4,4,3.8);c.fillStyle=b.team===0?'#35515a':'#644b3a';c.strokeStyle=TEAM[b.team];c.lineWidth=.12;c.fillRect(-1.8,-1.8,3.6,3.6);c.strokeRect(-1.8,-1.8,3.6,3.6);c.fillStyle=b.team===0?'#72999b':'#af8660';c.beginPath();c.moveTo(-2,-.7);c.lineTo(0,-2.4);c.lineTo(2,-.7);c.closePath();c.fill();c.fillStyle='#1d2c27';c.fillRect(-.45,.1,.9,1.7);c.strokeStyle=TEAM[b.team];c.beginPath();c.moveTo(1,-1.7);c.lineTo(1,-3.3);c.stroke();c.fillStyle=TEAM[b.team];c.fillRect(1,-3.3,1,.55);this.bar(c,0,-3.8,4,b.hp/b.maxHp,b.team);c.fillStyle='#e0dfb7';c.textAlign='center';c.font=`${Math.max(.65,10/z)}px "Microsoft YaHei"`;c.fillText(STATS[b.type].name+(b.awaitingEviction?' · 等待部队离开':b.constructionPending?(b.activeBuilders?` · ${b.activeBuilders} 人 · ${Math.ceil(b.constructionRemaining/b.activeBuilders)} 秒`:' · 等待施工'):''),0,2.8);
      if(b.id===selectedBuilding){c.strokeStyle='#e0ebac';c.lineWidth=.18;c.strokeRect(-2.1,-2.1,4.2,4.2);}
      if(b.type==='tower'&&!b.constructionPending){c.fillStyle='#85d7e3';c.beginPath();c.arc(0,-1.1,.45,0,Math.PI*2);c.fill();c.strokeStyle='#f4dfaa';c.lineWidth=.14;c.beginPath();c.moveTo(-.65,-1.1);c.lineTo(.65,-1.1);c.moveTo(0,-1.7);c.lineTo(0,-.5);c.stroke();}
      c.restore();
      if(b.team===1){c.fillStyle='#bdbb80';for(let i=0;i<4;i++){c.save();c.translate(b.x+3+i*.6,b.y+2+(i%2)*.4);c.rotate(.5);c.fillRect(-.25,-.35,.5,.7);c.restore();}}
    }
    for(const u of state.units){
      if(!all&&u.team!==team&&!visible[Math.floor(u.y)*W+Math.floor(u.x)])continue;
      const chosen=selected.has(u.id);if(chosen&&u.path.length){c.strokeStyle='#b4d6a94a';c.lineWidth=.08;c.setLineDash([.3,.3]);c.beginPath();c.moveTo(u.x,u.y);for(const p of u.path)c.lineTo(p.x,p.y);for(const p of (u.waypoints||[]))c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);}
      if(u.type==='pigeon'&&u.flying!==false&&!u.landing){
        const r=STATS.pigeon.orbitRadius,idle=!u.waypoints.length&&(!u.goal||Math.hypot(u.goal.x-u.x,u.goal.y-u.y)<=r);
        if(idle){const center=u.goal||u.orbit||{x:u.x,y:u.y};c.strokeStyle=chosen?'#b4d6a9c0':'#b4d6a950';c.lineWidth=.08;c.beginPath();c.arc(Math.max(5,Math.min(W-5,center.x)),Math.max(5,Math.min(H-5,center.y)),r,0,Math.PI*2);c.stroke();}
      }
      if(!this.inView(u,2))continue;
      const size=STATS[u.type].visualSize||1,isMachine=!!STATS[u.type].machine;
      c.save();c.translate(u.x,u.y);c.fillStyle='#07161166';c.beginPath();c.ellipse(.15,.3,.62*size,.4*size,0,0,Math.PI*2);c.fill();
      if(chosen){c.strokeStyle='#e0ebac';c.lineWidth=.06;c.beginPath();c.arc(0,0,.77*size,0,Math.PI*2);c.stroke();}
      c.fillStyle=u.team===0?'#2c626c':'#8a513d';c.strokeStyle=TEAM[u.team];c.lineWidth=.12;c.beginPath();
      if(isMachine){c.moveTo(0,-.7*size);c.lineTo(.42*size,0);c.lineTo(0,.7*size);c.lineTo(-.42*size,0);c.closePath();}else c.arc(0,0,.5,0,Math.PI*2);
      c.fill();c.stroke();
      c.save();c.rotate(u.facing);c.strokeStyle='#e6e6c4';c.fillStyle=u.type==='ironShield'?'#9ea9a6':'#d4dcc0';c.lineWidth=.1;c.beginPath();if(isMachine){c.moveTo(-.28*size,0);c.lineTo(.28*size,0);c.moveTo(0,-.38*size);c.lineTo(0,.38*size);if(u.type==='steamWalker'){c.moveTo(-.2*size,-.18*size);c.lineTo(.2*size,.18*size);c.moveTo(-.2*size,.18*size);c.lineTo(.2*size,-.18*size);}c.stroke();}else if(u.type==='shield'||u.type==='ironShield'){c.moveTo(.05,-.3);c.lineTo(.3,-.22);c.lineTo(.28,.18);c.lineTo(.06,.34);c.lineTo(-.17,.18);c.lineTo(-.17,-.22);c.closePath();c.fill();if(u.type==='ironShield'){c.beginPath();c.moveTo(-.08,-.22);c.lineTo(.16,.24);c.stroke();}}else if(u.type==='wilddog'){c.arc(-.04,0,.28,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(.1,-.06);c.lineTo(.3,-.24);c.moveTo(.1,-.02);c.lineTo(.34,0);c.moveTo(.1,.06);c.lineTo(.3,.24);c.stroke();}else if(u.type==='pigeon'){c.arc(-.08,0,.2,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(.08,0);c.lineTo(.32,-.06);c.lineTo(.32,.06);c.closePath();c.fill();c.moveTo(-.06,-.04);c.lineTo(-.26,-.3);c.moveTo(-.02,-.02);c.lineTo(-.32,-.22);c.moveTo(-.06,.04);c.lineTo(-.26,.3);c.moveTo(-.02,.02);c.lineTo(-.32,.22);c.stroke();}else{c.arc(-.16,0,.33,-1.2,1.2);c.stroke();c.beginPath();c.moveTo(-.04,-.3);c.lineTo(-.04,.3);c.moveTo(-.22,0);c.lineTo(.38,0);if(u.type==='crossbow'){c.moveTo(-.1,-.22);c.lineTo(.22,.22);c.moveTo(-.1,.22);c.lineTo(.22,-.22);}c.stroke();}c.restore();
      if(u.hp<u.maxHp||chosen)this.bar(c,0,-.96*size,1.35*size,u.hp/u.maxHp,u.team);
      if(u.type==='pigeon'){c.fillStyle='#ece0ad';c.font='.55px sans-serif';c.textAlign='center';c.fillText(u.flying===false?'地面':u.landing?'降落中':'飞行',0,-1.35);}
      if(u.healing){c.fillStyle='#a6ef95';c.font='.9px sans-serif';c.textAlign='center';c.fillText('+',.9,-.5);}
      if(u.order==='build'){c.fillStyle='#f2ce45';c.font='.65px sans-serif';c.textAlign='center';c.fillText('建',0,1.4);}
      if(u.holdFire){c.fillStyle='#ece0ad';c.font='.65px sans-serif';c.textAlign='center';c.fillText('Ⅱ',0,1.4);}c.restore();
    }
    for(const p of state.projectiles){if(!this.inView(p,2))continue;if(!all&&!visible[Math.floor(p.y)*W+Math.floor(p.x)])continue;c.save();c.translate(p.x,p.y);if(p.kind==='cannonball'){c.fillStyle='#262b29';c.strokeStyle='#e3cfa4';c.lineWidth=.07;c.beginPath();c.arc(0,0,.27,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#f4dfaa99';c.beginPath();c.arc(-.08,-.08,.07,0,Math.PI*2);c.fill();}else{const a=Math.atan2(p.y-p.fromY,p.x-p.fromX);c.rotate(a);c.strokeStyle='#f4dfaa';c.lineWidth=.09;c.beginPath();c.moveTo(-.8,0);c.lineTo(.2,0);c.lineTo(-.1,-.15);c.moveTo(.2,0);c.lineTo(-.1,.15);c.stroke();}c.restore();}
    for(const e of state.effects){if(!this.inView(e,2))continue;if(!all&&!visible[Math.floor(e.y)*W+Math.floor(e.x)])continue;const alpha=e.life/e.maxLife;if(e.kind==='explosion'){c.fillStyle=`rgba(255,120,110,${.18*alpha})`;c.strokeStyle=`rgba(255,155,145,${.55*alpha})`;c.lineWidth=.1;c.beginPath();c.arc(e.x,e.y,e.radius,0,Math.PI*2);c.fill();c.stroke();}else{c.strokeStyle=`rgba(247,218,151,${alpha})`;c.lineWidth=.13;c.beginPath();c.arc(e.x,e.y,(1-alpha)*.8+.2,0,Math.PI*2);c.stroke();}}
    // 残影：在已探索但非当前视野处绘制最后看到的敌方实体剪影（建筑永久、部队随时间淡化）。
    if(!all&&state.ghosts?.[team]){
      for(const g of state.ghosts[team].buildings||[]){
        const i=Math.floor(g.y)*W+Math.floor(g.x);if(visible[i]||!explored[i])continue;
        const r=STATS[g.type]?.halfSize||2;c.save();c.translate(g.x,g.y);
        c.fillStyle='#5a2828';c.strokeStyle='#c05555';c.lineWidth=.1;c.fillRect(-r,-r,r*2,r*2);c.strokeRect(-r,-r,r*2,r*2);
        c.fillStyle='#e8b0b0';c.textAlign='center';c.font=`${Math.max(.6,9/z)}px "Microsoft YaHei"`;c.fillText(STATS[g.type].name,0,0);
        c.restore();
      }
      for(const g of state.ghosts[team].units||[]){
        const i=Math.floor(g.y)*W+Math.floor(g.x);if(visible[i]||!explored[i])continue;
        const age=state.time-g.seenAt;if(age>=60)continue;
        const size=STATS[g.type]?.visualSize||1;c.save();c.translate(g.x,g.y);c.globalAlpha=age<30?1:.5;
        c.fillStyle='#5a2d2d';c.strokeStyle='#c55a5a';c.lineWidth=.09;c.beginPath();
        if(STATS[g.type]?.machine){c.moveTo(0,-.5*size);c.lineTo(.36*size,0);c.lineTo(0,.5*size);c.lineTo(-.36*size,0);c.closePath();}else c.arc(0,0,.4*size,0,Math.PI*2);
        c.fill();c.stroke();c.fillStyle='#e8b0b0';c.textAlign='center';c.font='.5px "Microsoft YaHei"';c.fillText(STATS[g.type].name,0,1.05);
        c.restore();
      }
    }
    if(!all){
      c.imageSmoothingEnabled=false;c.drawImage(this.fogCanvas,0,0,W,H);
    }
    const selectedProducer=state.buildings.find(b=>b.id===selectedBuilding&&['base','machineFactory'].includes(b.type)&&b.hp>0&&b.rallyPoint);
    if(selectedProducer){
      const p=selectedProducer.rallyPoint;c.strokeStyle='#dce99bcc';c.fillStyle='#dce99b';c.lineWidth=.12;c.setLineDash([.35,.3]);c.beginPath();c.moveTo(selectedProducer.x,selectedProducer.y);c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);
      c.beginPath();c.moveTo(p.x,p.y-1);c.lineTo(p.x,p.y+1);c.stroke();c.beginPath();c.moveTo(p.x,p.y-1);c.lineTo(p.x+1.1,p.y-.65);c.lineTo(p.x,p.y-.3);c.closePath();c.fill();
    }
    if(buildPreview&&Number.isFinite(buildPreview.x)&&Number.isFinite(buildPreview.y)){
      const p=buildPreview,r=p.halfSize||2;c.fillStyle=p.error?'#e66d6355':'#b8e67a55';c.strokeStyle=p.error?'#f09080':'#dcff9e';c.lineWidth=.15;c.fillRect(p.x-r,p.y-r,r*2,r*2);c.strokeRect(p.x-r,p.y-r,r*2,r*2);
      c.fillStyle='#fff1d2';c.textAlign='center';c.font=`${Math.max(.8,12/z)}px "Microsoft YaHei"`;c.fillText(p.error||(p.evict?'单位将自动让位':'左键建造'),p.x,p.y+3);
    }
    if(marker&&marker.until>performance.now()){c.strokeStyle=marker.attack?'#f3b38a':'#d8e9a3';c.lineWidth=.12;const r=.7+(marker.until-performance.now())/1800;c.beginPath();c.arc(marker.x,marker.y,r,0,Math.PI*2);c.moveTo(marker.x-r-0.3,marker.y);c.lineTo(marker.x+r+.3,marker.y);c.moveTo(marker.x,marker.y-r-.3);c.lineTo(marker.x,marker.y+r+.3);c.stroke();}
    c.strokeStyle='#8c9b5e88';c.lineWidth=.12;c.strokeRect(0,0,W,H);c.restore();
    if(drag&&drag.kind==='select'){c.fillStyle='#c2dc8920';c.strokeStyle='#d6e4a5';c.lineWidth=1;c.fillRect(drag.sx,drag.sy,drag.x-drag.sx,drag.y-drag.sy);c.strokeRect(drag.sx,drag.sy,drag.x-drag.sx,drag.y-drag.sy);}
    this.drawMini(state,view);
    return true;
  }
  bar(c,x,y,w,f,team){c.fillStyle='#121d17';c.fillRect(x-w/2-.05,y-.05,w+.1,.24);c.fillStyle=f<.3?'#e6a36c':TEAM[team];c.fillRect(x-w/2,y,w*f,.14);}
  inView(e,margin){const z=this.camera.zoom;return Math.abs(e.x-this.camera.x)<=this.width/(2*z)+margin&&Math.abs(e.y-this.camera.y)<=this.height/(2*z)+margin;}
  layer(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
  prepareFog(state,view){
    const {width:W,height:H}=state.map;
    if(view===1)return;
    const key=`${view}:${state.visionVersion}`;if(this.fogKey===key)return;
    if(!this.fogCanvas){this.fogCanvas=this.layer(W,H);this.fogContext=this.fogCanvas.getContext('2d');this.fogPixels=this.fogContext.createImageData(W,H);}
    const team=view===2?1:0,pixels=this.fogPixels.data;
    for(let i=0;i<W*H;i++){pixels[i*4]=16;pixels[i*4+1]=27;pixels[i*4+2]=23;pixels[i*4+3]=state.visible[team][i]?0:state.explored[team][i]?184:255;}
    this.fogContext.putImageData(this.fogPixels,0,0);this.fogKey=key;
  }
  drawMini(state,view){
    const {width:W,height:H}=state.map;
    const width=this.minimap.width,height=this.minimap.height,s=width/W,sy=height/H,team=view===2?1:0,all=view===1;
    const backgroundKey=`${view}:${state.visionVersion}:${width}:${height}`;
    if(this.miniBackgroundKey!==backgroundKey){
      if(!this.miniBackground||this.miniBackground.width!==width||this.miniBackground.height!==height){this.miniBackground=this.layer(width,height);this.miniUnits=this.layer(width,height);}
      const c=this.miniBackground.getContext('2d');c.drawImage(this.terrainCanvas,0,0,width,height);
      if(!all)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!state.visible[team][i]){c.fillStyle=state.explored[team][i]?'#0b171ac0':'#101b17';c.fillRect(x*s,y*sy,s,sy);}}
      this.miniBackgroundKey=backgroundKey;this.miniUnitsKey=null;
    }
    const unitsKey=`${backgroundKey}:${state.revision}:${state.time}`;
    if(this.miniUnitsKey!==unitsKey){
      const c=this.miniUnits.getContext('2d');c.drawImage(this.miniBackground,0,0);
      for(const n of state.map.resources||[])if(!state.buildings.some(b=>b.type==='mine'&&b.hp>0&&!b.constructionPending&&coversCell(b,n))&&(all||state.explored[team][Math.floor(n.y)*W+Math.floor(n.x)])){c.fillStyle='#dfbd64';c.fillRect(n.x*s-2,n.y*sy-2,s+4,s+4);}
      for(const n of state.map.foodPoints||[])if(all||state.explored[team][n.y*W+n.x]){c.fillStyle='#a6dc74';c.fillRect(n.x*s-2,n.y*sy-2,s+4,sy+4);}
      for(const e of [...state.buildings,...state.units])if(e.hp>0&&(all||e.team===team||state.visible[team][Math.floor(e.y)*W+Math.floor(e.x)])){c.fillStyle=e.type==='mine'?'#f2ce45':TEAM[e.team];const r=e.building?(e.type==='tower'?2:3):1.5;c.fillRect(e.x*s-r,e.y*sy-r,r*2,r*2);}
      if(!all&&state.ghosts?.[team])for(const g of state.ghosts[team].buildings||[]){const i=Math.floor(g.y)*W+Math.floor(g.x);if(state.explored[team][i]&&!state.visible[team][i]){c.fillStyle='#c05555';const r=g.type==='tower'?2:3;c.fillRect(g.x*s-r,g.y*sy-r,r*2,r*2);}}
      if(!all&&state.ghosts?.[team])for(const g of state.ghosts[team].units||[]){const i=Math.floor(g.y)*W+Math.floor(g.x);if(state.explored[team][i]&&!state.visible[team][i]&&state.time-g.seenAt<60){c.fillStyle='#d06060';c.globalAlpha=state.time-g.seenAt<30?1:.5;c.fillRect(g.x*s-1.5,g.y*sy-1.5,s+3,sy+3);c.globalAlpha=1;}}
      this.miniUnitsKey=unitsKey;
    }
    const c=this.mc;c.drawImage(this.miniUnits,0,0);
    const tl=this.world(0,0);c.strokeStyle='#e1e4ba';c.lineWidth=1;c.strokeRect(tl.x*s,tl.y*sy,this.width/this.camera.zoom*s,this.height/this.camera.zoom*sy);
  }
}
