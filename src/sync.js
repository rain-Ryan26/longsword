// Transport-independent observer protocol; receivers acknowledge cache versions.
export class SnapshotHost{
  constructor(send,instance){this.send=send;this.instance=instance;this.peers=new Map();this.map=null;this.generation=0;}
  receive(message,now){
    if(!message.id)return false;
    if(message.type==='bye'){this.peers.delete(message.id);return false;}
    if(message.type!=='hello'&&message.type!=='ack')return false;
    this.peers.set(message.id,{seen:now,mapVersion:message.mapVersion,visionVersion:message.visionVersion});
    return message.type==='hello';
  }
  publish(state,paused,speed,now){
    if(this.map!==state.map){this.map=state.map;this.mapVersion=`${this.instance}:${++this.generation}`;}
    for(const [id,peer] of this.peers){
      if(now-peer.seen>5000){this.peers.delete(id);continue;}
      const {map,visible,explored,...dynamic}=state;
      const full=peer.mapVersion!==this.mapVersion;
      if(full)dynamic.map=map;
      if(full||peer.visionVersion!==state.visionVersion){dynamic.visible=visible;dynamic.explored=explored;}
      this.send({type:'state',to:id,mapVersion:this.mapVersion,state:dynamic,paused,speed});
    }
  }
}

export class SnapshotReceiver{
  constructor(id){this.id=id;this.state=null;this.mapVersion=null;}
  message(type='hello'){return {type,id:this.id,mapVersion:this.mapVersion,visionVersion:this.state?.visionVersion};}
  receive(message){
    if(message.type!=='state'||message.to!==this.id)return false;
    const next=message.state,base=this.mapVersion===message.mapVersion?this.state:null;
    const merged={...base,...next};
    if(!merged.map||!merged.visible||!merged.explored||(!next.visible&&base?.visionVersion!==next.visionVersion)){
      this.mapVersion=null;this.state=null;return false;
    }
    // Repeated full messages must not invalidate terrain caches within one map generation.
    if(base)merged.map=base.map;
    this.state=merged;this.mapVersion=message.mapVersion;return true;
  }
}
