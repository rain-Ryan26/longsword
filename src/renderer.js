import {W,H} from './data.js';
const TEAM=['#85d7e3','#e59678'];
export class Renderer{
  constructor(canvas,minimap){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.minimap=minimap;this.mc=minimap.getContext('2d');this.camera={x:25,y:32,zoom:13};this.width=1;this.height=1;this.terrainCanvas=null;this.lastMap=null;}
  resize(){const r=this.canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;this.width=r.width;this.height=r.height;if(this.canvas.width!==Math.round(r.width*dpr)||this.canvas.height!==Math.round(r.height*dpr)){this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);}this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  world(x,y){return {x:(x-this.width/2)/this.camera.zoom+this.camera.x,y:(y-this.height/2)/this.camera.zoom+this.camera.y};}
  screen(x,y){return {x:(x-this.camera.x)*this.camera.zoom+this.width/2,y:(y-this.camera.y)*this.camera.zoom+this.height/2};}
  clamp(){this.camera.x=Math.max(0,Math.min(W,this.camera.x));this.camera.y=Math.max(0,Math.min(H,this.camera.y));}
  zoomAt(x,y,factor){const before=this.world(x,y);this.camera.zoom=Math.max(5,Math.min(36,this.camera.zoom*factor));const after=this.world(x,y);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.clamp();}
  bake(map){
    this.terrainCanvas=document.createElement('canvas');const c=this.terrainCanvas;c.width=W*16;c.height=H*16;const ctx=c.getContext('2d');
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const t=map.terrain[y*W+x],n=((x*37+y*71)%13);ctx.fillStyle=t===1?'#4b5547':t===2?'#2c402d':'#46573b';ctx.fillRect(x*16,y*16,16,16);
      if(t===1){ctx.fillStyle='#69705a';ctx.beginPath();ctx.moveTo(x*16+1,y*16+14);ctx.lineTo(x*16+7,y*16+3);ctx.lineTo(x*16+15,y*16+14);ctx.fill();ctx.fillStyle='#3b493d';ctx.beginPath();ctx.moveTo(x*16+7,y*16+3);ctx.lineTo(x*16+7,y*16+14);ctx.lineTo(x*16+15,y*16+14);ctx.fill();}
      else if(t===2&&n%2===0){ctx.fillStyle='#1e3227';ctx.beginPath();ctx.arc(x*16+8,y*16+8,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3b5236';ctx.beginPath();ctx.arc(x*16+7,y*16+6,3,0,Math.PI*2);ctx.fill();}
      else if(n===1){ctx.fillStyle='#7e835139';ctx.fillRect(x*16+7,y*16+8,2,3);}
    }
    ctx.strokeStyle='#b5c18c35';ctx.lineWidth=1.5;ctx.beginPath();for(let x=0;x<=W;x+=8){ctx.moveTo(x*16,0);ctx.lineTo(x*16,H*16);}for(let y=0;y<=H;y+=8){ctx.moveTo(0,y*16);ctx.lineTo(W*16,y*16);}ctx.stroke();
    this.lastMap=map;
  }
  draw(state,view,selected,drag,marker){
    this.resize();if(!this.terrainCanvas)this.bake(state.map);
    const c=this.ctx,z=this.camera.zoom,team=view===2?1:0,all=view===1,visible=state.visible[team],explored=state.explored[team];
    c.fillStyle='#101b17';c.fillRect(0,0,this.width,this.height);c.save();c.translate(this.width/2-this.camera.x*z,this.height/2-this.camera.y*z);c.scale(z,z);
    c.drawImage(this.terrainCanvas,0,0,W,H);
    // Paths and entities are clipped by the same fog painted at the end.
    for(const b of state.buildings){
      if(b.hp<=0){if(all||explored[Math.floor(b.y)*W+Math.floor(b.x)]){c.fillStyle='#303329';c.fillRect(b.x-1.7,b.y-1.7,3.4,3.4);}continue;}
      if(!all&&b.team!==team&&!visible[Math.floor(b.y)*W+Math.floor(b.x)])continue;
      c.save();c.translate(b.x,b.y);c.fillStyle='#0c171880';c.fillRect(-1.7,-1.4,4,3.8);c.fillStyle=b.team===0?'#35515a':'#644b3a';c.strokeStyle=TEAM[b.team];c.lineWidth=.12;c.fillRect(-1.8,-1.8,3.6,3.6);c.strokeRect(-1.8,-1.8,3.6,3.6);c.fillStyle=b.team===0?'#72999b':'#af8660';c.beginPath();c.moveTo(-2,-.7);c.lineTo(0,-2.4);c.lineTo(2,-.7);c.closePath();c.fill();c.fillStyle='#1d2c27';c.fillRect(-.45,.1,.9,1.7);c.strokeStyle=TEAM[b.team];c.beginPath();c.moveTo(1,-1.7);c.lineTo(1,-3.3);c.stroke();c.fillStyle=TEAM[b.team];c.fillRect(1,-3.3,1,.55);this.bar(c,0,-3.8,4,b.hp/b.maxHp,b.team);c.fillStyle='#e0dfb7';c.textAlign='center';c.font=`${Math.max(.65,10/z)}px "Microsoft YaHei"`;c.fillText(b.team===0?'前线基地':'资源营地',0,2.8);c.restore();
      if(b.team===1){c.fillStyle='#bdbb80';for(let i=0;i<4;i++){c.save();c.translate(b.x+3+i*.6,b.y+2+(i%2)*.4);c.rotate(.5);c.fillRect(-.25,-.35,.5,.7);c.restore();}}
    }
    for(const u of state.units){
      if(!all&&u.team!==team&&!visible[Math.floor(u.y)*W+Math.floor(u.x)])continue;
      const chosen=selected.has(u.id);if(chosen&&u.path.length){c.strokeStyle='#b4d6a94a';c.lineWidth=.08;c.setLineDash([.3,.3]);c.beginPath();c.moveTo(u.x,u.y);for(const p of u.path)c.lineTo(p.x,p.y);for(const p of (u.waypoints||[]))c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);}
      c.save();c.translate(u.x,u.y);c.fillStyle='#07161166';c.beginPath();c.ellipse(.15,.3,.62,.4,0,0,Math.PI*2);c.fill();
      if(chosen){c.strokeStyle='#e0ebac';c.lineWidth=.12;c.beginPath();c.arc(0,0,.77,0,Math.PI*2);c.stroke();}
      c.fillStyle=u.team===0?'#2c626c':'#8a513d';c.strokeStyle=TEAM[u.team];c.lineWidth=.12;c.beginPath();c.arc(0,0,.5,0,Math.PI*2);c.fill();c.stroke();
      c.save();c.rotate(u.facing);c.strokeStyle='#e6e6c4';c.fillStyle='#d4dcc0';c.lineWidth=.1;c.beginPath();if(u.type==='shield'){c.moveTo(.05,-.3);c.lineTo(.3,-.22);c.lineTo(.28,.18);c.lineTo(.06,.34);c.lineTo(-.17,.18);c.lineTo(-.17,-.22);c.closePath();c.fill();}else{c.arc(-.16,0,.33,-1.2,1.2);c.stroke();c.beginPath();c.moveTo(-.04,-.3);c.lineTo(-.04,.3);c.moveTo(-.22,0);c.lineTo(.38,0);c.stroke();}c.restore();
      if(u.hp<u.maxHp||chosen)this.bar(c,0,-.96,1.35,u.hp/u.maxHp,u.team);
      if(u.holdFire){c.fillStyle='#ece0ad';c.font='.65px sans-serif';c.textAlign='center';c.fillText('Ⅱ',0,1.4);}c.restore();
    }
    for(const p of state.projectiles){if(!all&&!visible[Math.floor(p.y)*W+Math.floor(p.x)])continue;const a=Math.atan2(p.y-p.fromY,p.x-p.fromX);c.save();c.translate(p.x,p.y);c.rotate(a);c.strokeStyle='#f4dfaa';c.lineWidth=.09;c.beginPath();c.moveTo(-.8,0);c.lineTo(.2,0);c.lineTo(-.1,-.15);c.moveTo(.2,0);c.lineTo(-.1,.15);c.stroke();c.restore();}
    for(const e of state.effects){if(!all&&!visible[Math.floor(e.y)*W+Math.floor(e.x)])continue;c.strokeStyle=`rgba(247,218,151,${e.life/e.maxLife})`;c.lineWidth=.13;c.beginPath();c.arc(e.x,e.y,(1-e.life/e.maxLife)*.8+.2,0,Math.PI*2);c.stroke();}
    if(!all){
      if(!this.fogCanvas){this.fogCanvas=document.createElement('canvas');this.fogCanvas.width=W;this.fogCanvas.height=H;this.fogContext=this.fogCanvas.getContext('2d');this.fogPixels=this.fogContext.createImageData(W,H);}
      const pixels=this.fogPixels.data;for(let i=0;i<W*H;i++){pixels[i*4]=16;pixels[i*4+1]=27;pixels[i*4+2]=23;pixels[i*4+3]=visible[i]?0:explored[i]?184:255;}
      this.fogContext.putImageData(this.fogPixels,0,0);c.imageSmoothingEnabled=false;c.drawImage(this.fogCanvas,0,0,W,H);
    }
    if(marker&&marker.until>performance.now()){c.strokeStyle=marker.attack?'#f3b38a':'#d8e9a3';c.lineWidth=.12;const r=.7+(marker.until-performance.now())/1800;c.beginPath();c.arc(marker.x,marker.y,r,0,Math.PI*2);c.moveTo(marker.x-r-0.3,marker.y);c.lineTo(marker.x+r+.3,marker.y);c.moveTo(marker.x,marker.y-r-.3);c.lineTo(marker.x,marker.y+r+.3);c.stroke();}
    c.strokeStyle='#8c9b5e88';c.lineWidth=.12;c.strokeRect(0,0,W,H);c.restore();
    if(drag&&drag.kind==='select'){c.fillStyle='#c2dc8920';c.strokeStyle='#d6e4a5';c.lineWidth=1;c.fillRect(drag.sx,drag.sy,drag.x-drag.sx,drag.y-drag.sy);c.strokeRect(drag.sx,drag.sy,drag.x-drag.sx,drag.y-drag.sy);}
    this.drawMini(state,view);
  }
  bar(c,x,y,w,f,team){c.fillStyle='#121d17';c.fillRect(x-w/2-.05,y-.05,w+.1,.24);c.fillStyle=f<.3?'#e6a36c':TEAM[team];c.fillRect(x-w/2,y,w*f,.14);}
  drawMini(state,view){
    const c=this.mc,s=this.minimap.width/W,team=view===2?1:0,all=view===1;c.drawImage(this.terrainCanvas,0,0,this.minimap.width,this.minimap.height);
    if(!all)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!state.visible[team][i]){c.fillStyle=state.explored[team][i]?'#0b171ac0':'#101b17';c.fillRect(x*s,y*s,s,s);}}
    for(const e of [...state.buildings,...state.units])if(e.hp>0&&(all||e.team===team||state.visible[team][Math.floor(e.y)*W+Math.floor(e.x)])){c.fillStyle=TEAM[e.team];const r=e.building?3:1.5;c.fillRect(e.x*s-r,e.y*s-r,r*2,r*2);}
    const tl=this.world(0,0);c.strokeStyle='#e1e4ba';c.lineWidth=1;c.strokeRect(tl.x*s,tl.y*s,this.width/this.camera.zoom*s,this.height/this.camera.zoom*s);
  }
}
