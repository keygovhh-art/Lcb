export const sharedVoiceChangerBrowserSource = String.raw`/* Gavhah Voice Studio, self-contained browser audio processor.
   Preview and export use the same WAV buffer; no remote audio transfer until Save.
   Moderate pitch shift (granular overlap-add) + EQ + compression.
   Does not claim identity obfuscation or true AI voice cloning. */
(function(){
"use strict";
const opt=(id)=>document.getElementById(id);
const presets=[
{id:"original",name:"אריגינעל — רייניקונג",pitch:1.00,hp:90,lp:6500,bass:0,mid:1,output:.91},
{id:"deep",name:"טיפער, רואיגער קול",pitch:.90,hp:76,lp:4900,bass:2,mid:1,output:.90},
{id:"warm",name:"ווארעמער און נאטירליך",pitch:.96,hp:78,lp:5400,bass:2.5,mid:-.5,output:.94},
{id:"broadcast",name:"ראדיא־פראפעסיאנעל",pitch:.94,hp:100,lp:6200,bass:1.2,mid:2.3,output:.89},
{id:"clear",name:"קלאר און פארזיכערט",pitch:1.04,hp:120,lp:6900,bass:-1,mid:3,output:.87},
{id:"different",name:"באדייטנד אנדערער קלאנג",pitch:.84,hp:92,lp:4400,bass:-.5,mid:1.5,output:.88}
];
const style="margin:12px 0;padding:14px;background:#f4f9fc;border:1px solid #c7d8e7;border-radius:12px";
function gainWindow(i,size){const x=i/(size-1);return .5-.5*Math.cos(Math.PI*2*x)}
function shiftPitch(input,rate){
 if(Math.abs(rate-1)<.004)return Float32Array.from(input);
 const count=input.length,result=new Float32Array(count),weight=new Float32Array(count);
 const size=1024,hop=256,window=new Float32Array(size);
 for(let i=0;i<size;i++)window[i]=gainWindow(i,size);
 for(let start=-size;start<count;start+=hop){
  for(let i=0;i<size;i++){
   const to=start+i;if(to<0||to>=count)continue;
   const point=start+size/2+(i-size/2)*rate;
   if(point<0||point>=count-1)continue;
   const index=Math.floor(point),mix=point-index,w=window[i];
   result[to]+=(input[index]*(1-mix)+input[index+1]*mix)*w;
   weight[to]+=w;
  }
 }
 for(let i=0;i<count;i++)result[i]/=weight[i]>.0001?weight[i]:1;
 return result;
}
function downmix(original,sampleRate){
 const length=Math.ceil(original.duration*sampleRate),arr=new Float32Array(length);
 const channels=original.numberOfChannels;
 for(let i=0;i<length;i++){
  const position=i*original.sampleRate/sampleRate,index=Math.floor(position),blend=position-index;
  let sum=0;
  for(let c=0;c<channels;c++){
   const samples=original.getChannelData(c);
   sum+=(samples[index]||0)*(1-blend)+(samples[Math.min(index+1,samples.length-1)]||0)*blend;
  }
  arr[i]=Math.max(-1,Math.min(1,sum/channels));
 }
 return arr;
}
async function process(buffer,preset,amount,brightness){
 const sampleRate=16000,source=downmix(buffer,sampleRate),ratio=1+(preset.pitch-1)*amount;
 const samples=shiftPitch(source,ratio);
 const offline=new OfflineAudioContext(1,samples.length,sampleRate);
 const audio=offline.createBuffer(1,samples.length,sampleRate);
 audio.copyToChannel(samples,0);
 const input=offline.createBufferSource();input.buffer=audio;
 const high=offline.createBiquadFilter();high.type="highpass";high.frequency.value=preset.hp;
 const low=offline.createBiquadFilter();low.type="lowshelf";low.frequency.value=185;low.gain.value=preset.bass*amount;
 const presence=offline.createBiquadFilter();presence.type="peaking";presence.frequency.value=2550;presence.Q.value=1;presence.gain.value=preset.mid*amount+brightness*.04;
 const cut=offline.createBiquadFilter();cut.type="lowpass";cut.frequency.value=Math.max(2200,Math.min(7600,preset.lp+brightness*32));
 const comp=offline.createDynamicsCompressor();
 comp.threshold.value=-22;comp.knee.value=14;comp.ratio.value=2.8;comp.attack.value=.006;comp.release.value=.16;
 const output=offline.createGain();output.gain.value=preset.output;
 input.connect(high);high.connect(low);low.connect(presence);presence.connect(cut);cut.connect(comp);comp.connect(output);output.connect(offline.destination);
 input.start(0);const result=await offline.startRendering();return result.getChannelData(0);
}
function encodeWav(samples,rate){
 const bytes=44+samples.length*2,buffer=new ArrayBuffer(bytes),view=new DataView(buffer);
 const word=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i))};
 word(0,"RIFF");view.setUint32(4,bytes-8,true);word(8,"WAVE");word(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);
 view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 word(36,"data");view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+2*i,value<0?value*32768:value*32767,true);
 }
 return new Blob([buffer],{type:"audio/wav"});
}
function build(host,config={}){
 const wrap=document.createElement("section");wrap.className="gavhah-vc";wrap.style.cssText=style;
 wrap.innerHTML='<h2 style="margin:0 0 8px">פראפעסיאנעלער Voice Changer</h2>'+
 '<p style="font-size:13px;color:#536c82">קלייב דעם קול נאכן רעקארדירן. דו קענסט טוישן אינמיטן אויסהערן און גלייך הערן דעם נייעם קלאנג.</p>'+
 '<div class="gv-actions" style="display:flex;flex-wrap:wrap;gap:9px;margin:12px 0"><label>אודיא ארויפלייגן <input class="gv-file" type="file" accept="audio/*"></label>'+
 '<button type="button" class="gv-record">רעקארדירן</button><button type="button" class="gv-stop" disabled>אפשטעלן</button></div>'+
 '<label style="display:block;margin:10px 0">קלייב א קול <select class="gv-preset" style="width:100%;padding:10px"></select></label>'+
 '<label style="display:block;margin:8px 0">וויפיל פארענדערן <output class="gv-percent">70%</output><input class="gv-amount" style="width:100%" type="range" min="0" max="100" step="5" value="70"></label>'+
 '<label style="display:block;margin:8px 0">קלארקייט פונעם קלאנג <output class="gv-tone">0</output><input class="gv-bright" style="width:100%" type="range" min="-50" max="50" step="5" value="0"></label>'+
 '<audio class="gv-play" controls style="display:block;width:100%;margin:12px 0"></audio>'+
 '<div class="gv-actions" style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="gv-apply">צוגרייטן די פארענדערטע רעקארדירונג</button>'+
 '<button type="button" class="gv-save">אפהיטן פאר דעם עקסטענשאן</button>'+
 '<button type="button" class="gv-download">אראפלאָדן WAV</button></div>'+
 '<p class="gv-status" role="status" style="font-size:13px;white-space:pre-wrap;margin:12px 0"></p>'+
 '<p style="font-size:12px;color:#58728a">די פארענדערונג ארבעט לאקאל אויפן טעלעפאן. עס איז נישט קיין AI־שטימע־קלאָנונג, און מ\'קען נישט גאראנטירן אז א מענטש וועט נישט דערקענען די שטימע.</p>';
 host.append(wrap);
 const q=x=>wrap.querySelector(".gv-"+x);
 let source=null,rendered=null,renderUrl=null,ctx=null,original=null,recording=null,stream=null,parts=[];
 let working=false,serial=0,debounce=null,sourceKey=null;
 for(const p of presets){const o=document.createElement("option");o.value=p.id;o.textContent=p.name;q("preset").append(o)}
 q("preset").value="broadcast";
 const note=(s)=>{q("status").textContent=s};
 const release=()=>{if(renderUrl){URL.revokeObjectURL(renderUrl);renderUrl=null}};
 const reset=()=>{serial++;rendered=null;release();q("play").removeAttribute("src");q("play").load();};
 function setSource(file){
  if(!file)return;
  if(file.size>9e6){note("דער פייל איז צו גרויס פארן Android־בראוזער.");return}
  if(recording&&recording.state==="recording"){note("שטעל קודם אפ די רעקארדירונג.");return}
  original=file;source=null;sourceKey=config.getPath?.()||null;reset();
  note("רעקארדירונג גרייט. קלייב א קול; דער פריוויו ווערט צוגעגרייט.");
  renderSoon();
 }
 async function getAudio(){
  if(source)return source;
  ctx=ctx||new(window.AudioContext||window.webkitAudioContext)();
  const bytes=await original.arrayBuffer();source=await ctx.decodeAudioData(bytes.slice(0));
  if(source.duration>112)throw Error("די רעקארדירונג איז צו לאנג (מאַקסימום 112 סעקונדעס). צעטייל זי אין קלענערע חלקים.");
  if(source.duration<=0)throw Error("דער פייל האט נישט קיין גילטיגע שטימע.");
  return source;
 }
 async function render(preserve=true){
  if(!original)return note("קודם רעקארדיר אדער קלייב א פייל.");
  const generation=++serial;
  if(working)return;working=true;
  const wasPlaying=!q("play").paused&&!!q("play").src,position=q("play").currentTime||0;
  note("פארארבעט דעם קול אויף דיין טעלעפאן...");
  try{
   const buffer=await getAudio(),preset=presets.find(p=>p.id===q("preset").value)||presets[0],
    amount=Number(q("amount").value)/100,brightness=Number(q("bright").value);
   const data=await process(buffer,preset,amount,brightness);
   const file=encodeWav(data,16000);
   if(generation!==serial)return;
   if(file.size>3900000)throw Error("דער פארענדערטער פייל איז צו גרויס צום אפהיטן. קורץ די רעקארדירונג.");
   rendered=file;release();renderUrl=URL.createObjectURL(rendered);
   q("play").src=renderUrl;q("play").load();
   if(wasPlaying&&preserve){
    q("play").addEventListener("loadedmetadata",function once(){q("play").removeEventListener("loadedmetadata",once);q("play").currentTime=Math.min(position,q("play").duration||position);q("play").play().catch(()=>{})},{once:true});
   }
   note("גרייט: "+preset.name+". צו הערן, דרוק Play. צו טוישן קען מען קלייבן אן אנדער קול אפילו אינמיטן שפילן.");
  }catch(e){note("דער קול קען נישט ווערן פארארבעט: "+(e?.message||e));rendered=null}
  finally{working=false;if(serial!==generation)renderSoon()}
 }
 function renderSoon(){if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{if(!working)render();else serial++},220)}
 q("preset").onchange=renderSoon;
 q("amount").oninput=()=>{q("percent").textContent=q("amount").value+"%";renderSoon()};
 q("bright").oninput=()=>{q("tone").textContent=q("bright").value;renderSoon()};
 q("file").onchange=()=>{if(q("file").files?.[0])setSource(q("file").files[0])};
 q("record").onclick=async()=>{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return note("דער בראוזער האט נישט קיין מייקראפאן־רעקארדירונג.");
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:true});
   const type=["audio/webm;codecs=opus","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
   recording=new MediaRecorder(stream,type?{mimeType:type}:undefined);parts=[];
   recording.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
   recording.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());const f=new Blob(parts,{type:recording.mimeType||"audio/webm"});recording=null;q("stop").disabled=true;q("record").disabled=false;setSource(f)};
   recording.start();q("record").disabled=true;q("stop").disabled=false;note("רעקארדירט... דרוק אפשטעלן");
  }catch(e){note("קען נישט עפענען דעם מייקראפאן: "+e.message);stream?.getTracks().forEach(t=>t.stop())}
 };
 q("stop").onclick=()=>{if(recording?.state==="recording")recording.stop()};
 q("apply").onclick=()=>render(false);
 q("download").onclick=async()=>{if(!rendered)await render(false);if(!rendered)return;const link=document.createElement("a");link.href=renderUrl;link.download="gavhah-voice-"+(config.getPath?.()||"menu")+".wav";link.click()};
 q("save").onclick=async()=>{if(!rendered)await render(false);if(!rendered)return;
   if(sourceKey!==null&&sourceKey!==config.getPath?.())return note("דו האסט שוין געטוישט עקסטענשאן. רעקארדיר נאכאמאל פאר דעם יעצטיגן קנעפל.");
   try{q("save").disabled=true;note("היט אפ דעם פארענדערטן קול...");
     const result=await config.save?.(rendered);
     if(!result)throw Error("דער אפהיטער האט נישט באשטעטיגט הצלחה");
     note("די פארענדערטע רעקארדירונג איז אפגעהיטן פאר "+(config.getPath?.()||"דעם קנעפל")+". פובליצירן איז א באזונדערער שריט.");
   }catch(e){note("אפהיטן נישט געלונגען: "+(e?.message||e))}
   finally{q("save").disabled=false}
 };
 return {setSource,clear(){reset();source=null;original=null;sourceKey=null;note("קלייב א פייל אדער רעקארדיר א נייעם קול.")},getFile(){return rendered}};
}
window.GavhahVoiceChanger={mount:build,encodeWav,presets};
})();`;
