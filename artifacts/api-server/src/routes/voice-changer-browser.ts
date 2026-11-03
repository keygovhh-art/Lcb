export const sharedVoiceChangerBrowserSource = String.raw`/* Gavhah Voice Studio, self-contained browser audio processor.
   Preview and export use the same WAV buffer; no remote audio transfer until Save.
   Independent pitch (WSOLA) and spectral-envelope/formant transformation + EQ + compression.
   Does not claim identity obfuscation or true AI voice cloning. */
(function(){
"use strict";
const opt=(id)=>document.getElementById(id);
const presets=[{"id":"original","name":"אריגינעל — רייניקונג","pitch":1,"formant":1,"hp":90,"lp":6700,"bass":0,"mid":1,"output":0.93},{"id":"deep","name":"טיפער, נאטירליכער מאנסקול","pitch":0.8,"formant":0.87,"hp":65,"lp":5600,"bass":2,"mid":1,"output":0.91},{"id":"warm","name":"ווארעמער און רואיגער קול","pitch":0.92,"formant":0.91,"hp":85,"lp":6100,"bass":1.7,"mid":0.4,"output":0.92},{"id":"broadcast","name":"ראדיא־פראפעסיאנעל — אן אנדערער טאן","pitch":0.88,"formant":1.045,"hp":88,"lp":6500,"bass":1.6,"mid":1.5,"output":0.91},{"id":"clear","name":"קלאר און פארזיכערט — בעזר ה׳","pitch":1.075,"formant":1.1,"hp":105,"lp":6800,"bass":-0.8,"mid":2.7,"output":0.9},{"id":"different","name":"ממש אנדערער נאטירליכער קול — טיפער","pitch":0.76,"formant":0.85,"hp":75,"lp":5950,"bass":2.2,"mid":1.15,"output":0.92},{"id":"differentBright","name":"ממש אנדערער נאטירליכער קול — העכער","pitch":1.22,"formant":1.16,"hp":100,"lp":6850,"bass":-1.4,"mid":2.1,"output":0.88},{"id":"baritone","name":"ברייטער באריטאן־קול","pitch":0.83,"formant":0.96,"hp":75,"lp":6250,"bass":2.5,"mid":1,"output":0.91},{"id":"mature","name":"ערנסטער, דערוואקסענער קול","pitch":0.87,"formant":0.83,"hp":85,"lp":5900,"bass":1.5,"mid":0.35,"output":0.91}];
const style="margin:12px 0;padding:14px;background:#f4f9fc;border:1px solid #c7d8e7;border-radius:12px";
function clampVoice(x,a,b){return Math.min(b,Math.max(a,x))}
function gainWindow(i,size){return .5-.5*Math.cos(2*Math.PI*i/(size-1))}
async function stretchVoiceWsola(input,factor){
 if(Math.abs(factor-1)<.003)return Float32Array.from(input);
 const sourceLength=input.length,outputLength=Math.max(1,Math.round(sourceLength*factor));
 const frameSize=512,hop=160,overlap=frameSize-hop,search=112;
 const result=new Float32Array(outputLength),weight=new Float32Array(outputLength),window=new Float32Array(frameSize);
 for(let i=0;i<frameSize;i++)window[i]=gainWindow(i,frameSize);
 let previous=0,frames=0;
 for(let target=0;target<outputLength;target+=hop){
  const predicted=clampVoice(Math.round(target/factor),0,Math.max(0,sourceLength-frameSize));
  let best=predicted,bestScore=-Infinity;
  if(target>0){
   const left=Math.max(0,predicted-search),right=Math.min(Math.max(0,sourceLength-frameSize),predicted+search);
   for(let candidate=left;candidate<=right;candidate+=4){
    let correlation=0,a2=.000001,b2=.000001;
    for(let j=0;j<overlap;j+=4){
     const first=input[Math.min(sourceLength-1,previous+hop+j)],second=input[candidate+j];
     correlation+=first*second;a2+=first*first;b2+=second*second;
    }
    const score=correlation/Math.sqrt(a2*b2)-.025*Math.abs(candidate-predicted)/search;
    if(score>bestScore){bestScore=score;best=candidate}
   }
  }
  for(let j=0;j<frameSize&&target+j<outputLength;j++){
   const w=window[j],sample=input[Math.min(sourceLength-1,best+j)];
   result[target+j]+=w*sample;weight[target+j]+=w;
  }
  previous=best;frames++;
  if(frames%110===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(let i=0;i<outputLength;i++)result[i]=weight[i]>.00001?result[i]/weight[i]:input[Math.min(sourceLength-1,Math.floor(i/factor))];
 return result;
}
async function naturalVoicePitch(input,ratio){
 if(Math.abs(ratio-1)<.004)return Float32Array.from(input);
 const stretched=await stretchVoiceWsola(input,ratio),result=new Float32Array(input.length);
 for(let i=0;i<result.length;i++){
  const point=Math.min(stretched.length-1,i*ratio),j=Math.floor(point),t=point-j;
  result[i]=stretched[j]*(1-t)+stretched[Math.min(j+1,stretched.length-1)]*t;
 }
 return result;
}
function voiceFft(real,imag,inverse){
 const length=real.length;
 for(let i=1,j=0;i<length;i++){
  let bit=length>>1;
  for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){let tmp=real[i];real[i]=real[j];real[j]=tmp;tmp=imag[i];imag[i]=imag[j];imag[j]=tmp}
 }
 for(let size=2;size<=length;size<<=1){
  const theta=(inverse?2:-2)*Math.PI/size,wReal=Math.cos(theta),wImag=Math.sin(theta),half=size>>1;
  for(let start=0;start<length;start+=size){
   let c=1,d=0;
   for(let k=0;k<half;k++){
    const a=start+k,b=a+half,vr=real[b]*c-imag[b]*d,vi=real[b]*d+imag[b]*c;
    real[b]=real[a]-vr;imag[b]=imag[a]-vi;real[a]+=vr;imag[a]+=vi;
    const next=c*wReal-d*wImag;d=c*wImag+d*wReal;c=next;
   }
  }
 }
 if(inverse)for(let i=0;i<length;i++){real[i]/=length;imag[i]/=length}
}
async function shapeVoiceFormants(input,formantRatio,amount){
 if(Math.abs(formantRatio-1)<.005||amount<.08)return Float32Array.from(input);
 const windowSize=1024,hop=256,half=windowSize/2,length=input.length,window=new Float32Array(windowSize);
 for(let i=0;i<windowSize;i++)window[i]=Math.sqrt(gainWindow(i,windowSize));
 const output=new Float32Array(length),weight=new Float32Array(length);
 const real=new Float64Array(windowSize),imag=new Float64Array(windowSize),envelope=new Float64Array(half+1),prefix=new Float64Array(half+2);
 let frames=0;
 for(let start=-windowSize/2;start<length;start+=hop){
  for(let j=0;j<windowSize;j++){const pos=start+j;real[j]=pos>=0&&pos<length?input[pos]*window[j]:0;imag[j]=0}
  voiceFft(real,imag,false);prefix[0]=0;
  for(let k=0;k<=half;k++)prefix[k+1]=prefix[k]+Math.log(Math.hypot(real[k],imag[k])+.002);
  for(let k=0;k<=half;k++){
   const radius=k<15?5:9,lo=Math.max(0,k-radius),hi=Math.min(half,k+radius);
   envelope[k]=(prefix[hi+1]-prefix[lo])/(hi-lo+1);
  }
  for(let k=3;k<half;k++){
   const frequency=k*16000/windowSize;if(frequency>5800)continue;
   const point=clampVoice(k/formantRatio,0,half-1.0001),j=Math.floor(point),fraction=point-j;
   const shifted=envelope[j]*(1-fraction)+envelope[j+1]*fraction;
   const highFade=clampVoice((5800-frequency)/1700,0,1);
   const gain=clampVoice(Math.exp((shifted-envelope[k])*amount*highFade*1.35),.54,1.94);
   real[k]*=gain;imag[k]*=gain;real[windowSize-k]*=gain;imag[windowSize-k]*=gain;
  }
  voiceFft(real,imag,true);
  for(let j=0;j<windowSize;j++){const pos=start+j;if(pos<0||pos>=length)continue;output[pos]+=real[j]*window[j];weight[pos]+=window[j]*window[j]}
  frames++;if(frames%65===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(let i=0;i<length;i++)output[i]=weight[i]>.0001?output[i]/weight[i]:input[i];
 return output;
}
function voiceSafeNormalize(samples){
 let peak=0,total=0;
 for(let i=0;i<samples.length;i++){const abs=Math.abs(samples[i]);if(abs>peak)peak=abs;total+=samples[i]*samples[i]}
 const rms=Math.sqrt(total/Math.max(1,samples.length));
 const gain=Math.min(1.75,.94/Math.max(.01,peak),.145/Math.max(.01,rms));
 const result=new Float32Array(samples.length);
 for(let i=0;i<samples.length;i++)result[i]=clampVoice(samples[i]*gain,-.965,.965);
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
 const sampleRate=16000,source=downmix(buffer,sampleRate);
 const ratio=clampVoice(1+(preset.pitch-1)*amount,.72,1.28);
 const formants=clampVoice(1+(preset.formant-1)*amount,.78,1.22);
 const pitched=await naturalVoicePitch(source,ratio);
 const samples=await shapeVoiceFormants(pitched,formants,amount);
 const offline=new OfflineAudioContext(1,samples.length,sampleRate);
 const audio=offline.createBuffer(1,samples.length,sampleRate);audio.copyToChannel(samples,0);
 const input=offline.createBufferSource();input.buffer=audio;
 const high=offline.createBiquadFilter();high.type="highpass";high.frequency.value=preset.hp;
 const low=offline.createBiquadFilter();low.type="lowshelf";low.frequency.value=185;low.gain.value=preset.bass*amount;
 const presence=offline.createBiquadFilter();presence.type="peaking";presence.frequency.value=2550;presence.Q.value=1;presence.gain.value=preset.mid*amount+brightness*.035;
 const cut=offline.createBiquadFilter();cut.type="lowpass";cut.frequency.value=Math.max(2200,Math.min(7400,preset.lp+brightness*25));
 const comp=offline.createDynamicsCompressor();comp.threshold.value=-22;comp.knee.value=12;comp.ratio.value=2.7;comp.attack.value=.007;comp.release.value=.16;
 const output=offline.createGain();output.gain.value=preset.output;
 input.connect(high);high.connect(low);low.connect(presence);presence.connect(cut);cut.connect(comp);comp.connect(output);output.connect(offline.destination);
 input.start(0);
 const rendered=await offline.startRendering();
 return voiceSafeNormalize(rendered.getChannelData(0));
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
 '<p style="font-size:13px;color:#536c82">נייע שטימע־פארמונג: די סיסטעם טוישט באזונדער דעם טאן און די פארמאנטן פונעם קול, נישט בלויז די גיכקייט אדער EQ. קלייב דעם קול נאכן רעקארדירן, און טויש אים אפילו אינמיטן אויסהערן.</p>'+
 '<div class="gv-actions" style="display:flex;flex-wrap:wrap;gap:9px;margin:12px 0"><label>אודיא ארויפלייגן <input class="gv-file" type="file" accept="audio/*"></label>'+
 '<button type="button" class="gv-record">רעקארדירן</button><button type="button" class="gv-stop" disabled>אפשטעלן</button></div>'+
 '<label style="display:block;margin:10px 0">קלייב א קול <select class="gv-preset" style="width:100%;padding:10px"></select></label>'+
 '<label style="display:block;margin:8px 0">וויפיל פארענדערן <output class="gv-percent">95%</output><input class="gv-amount" style="width:100%" type="range" min="0" max="100" step="5" value="95"></label>'+
 '<label style="display:block;margin:8px 0">קלארקייט פונעם קלאנג <output class="gv-tone">0</output><input class="gv-bright" style="width:100%" type="range" min="-50" max="50" step="5" value="0"></label>'+
 '<label style="display:block;margin-top:12px">אריגינעלער קול — פארגלייך</label><audio class="gv-original" controls style="display:block;width:100%;margin:7px 0"></audio><label style="display:block;margin-top:12px">פארענדערטער קול — פריוויו</label><audio class="gv-play" controls style="display:block;width:100%;margin:7px 0 12px"></audio>'+
 '<div class="gv-actions" style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="gv-apply">צוגרייטן די פארענדערטע רעקארדירונג</button>'+
 '<button type="button" class="gv-save">אפהיטן פאר דעם עקסטענשאן</button>'+
 '<button type="button" class="gv-download">אראפלאָדן WAV</button></div>'+
 '<p class="gv-status" role="status" style="font-size:13px;white-space:pre-wrap;margin:12px 0"></p>'+
 '<p style="font-size:12px;color:#58728a">דער שטימע־טויש ארבעט לאקאל אויפן טעלעפאן: פיטש און פארמאנטן ווערן באזונדער געטוישט. עס איז נישט קיין AI־שטימע־קלאָנונג, און מ\'קען נישט גאראנטירן אז א מענטש וועט נישט דערקענען די שטימע.</p>';
 host.append(wrap);
 const q=x=>wrap.querySelector(".gv-"+x);
 let source=null,rendered=null,renderUrl=null,originalUrl=null,ctx=null,original=null,recording=null,stream=null,parts=[];
 let working=false,serial=0,debounce=null,sourceKey=null;
 for(const p of presets){const o=document.createElement("option");o.value=p.id;o.textContent=p.name;q("preset").append(o)}
 q("preset").value="different";
 const note=(s)=>{q("status").textContent=s};
 const release=()=>{if(renderUrl){URL.revokeObjectURL(renderUrl);renderUrl=null}};
 const reset=()=>{serial++;rendered=null;release();q("play").removeAttribute("src");q("play").load();};
 function setSource(file){
  if(!file)return;
  if(file.size>9e6){note("דער פייל איז צו גרויס פארן Android־בראוזער.");return}
  if(recording&&recording.state==="recording"){note("שטעל קודם אפ די רעקארדירונג.");return}
  original=file;source=null;sourceKey=config.getPath?.()||null;reset();if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=URL.createObjectURL(file);q("original").src=originalUrl;q("original").load();
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
 return {setSource,clear(){reset();if(originalUrl){URL.revokeObjectURL(originalUrl);originalUrl=null}q("original").removeAttribute("src");q("original").load();source=null;original=null;sourceKey=null;note("קלייב א פייל אדער רעקארדיר א נייעם קול.")},getFile(){return rendered}};
}
window.GavhahVoiceChanger={mount:build,encodeWav,presets};
})();`;
