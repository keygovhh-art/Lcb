export const yemotStudioUI = String.raw`<!doctype html>
<html lang="yi" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f4f8fc"><title>גבהה — ימות האטליין־עדיטאר</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#1e354e;font:16px/1.55 system-ui,Arial,sans-serif}main{max-width:1100px;margin:auto;padding:14px 12px 45px}
header{padding:21px;background:#fff;border:1px solid #dce6ef;border-radius:16px;margin-bottom:13px}
h1{font-size:25px;margin:2px 0 8px}h2{font-size:19px;margin:3px 0 11px}h3{font-size:16px;margin:0}p{margin:6px 0 11px}
small,.hint{color:#617b92;font-size:13px}.grid{display:grid;grid-template-columns:minmax(210px,1fr) minmax(280px,1.7fr);gap:14px}
.panel{background:#fff;border:1px solid #dce6ef;border-radius:14px;padding:15px}
input,textarea,select{width:100%;font:inherit;padding:11px;border:1px solid #b9ccdf;border-radius:9px;background:#fff;color:#233951}
textarea{min-height:140px;resize:vertical;direction:ltr;text-align:left}
button{font:inherit;padding:10px 13px;border-radius:9px;background:#eaf2f8;border:1px solid #c2d4e4;color:#205477;cursor:pointer}button.primary{background:#175e91;color:white;border-color:#175e91}button:disabled{opacity:.48;cursor:not-allowed}
button.danger{color:#993b3b;border-color:#e0bdbd;background:#fff8f8}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:11px 0}
#choices{max-height:67vh;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-top:10px}
.choice{width:100%;text-align:right;display:flex;gap:9px;align-items:center;justify-content:flex-start;background:#f7fafd;border-color:transparent;padding:9px;border-radius:8px}
.choice.active{background:#e8f3fa;border:1px solid #75accf}
.num{direction:ltr;font-size:12px;font-weight:700;white-space:nowrap;border-radius:6px;background:#e1edf6;padding:4px 7px;color:#144e77}
.info{border-radius:9px;background:#eff5fa;padding:10px 12px;color:#476780}
.status{margin:10px 0;border-radius:9px;padding:10px;background:#f0f5fa;min-height:20px;white-space:pre-wrap}
.good{background:#edf8f1;color:#176237}.error{background:#fff0f0;color:#a22929}
audio{width:100%;margin:11px 0}label{display:block;font-weight:650;margin:12px 0 5px}
.divider{border:0;border-top:1px solid #e1e9f1;margin:17px 0}
a{color:#175e91}#caption{font-weight:700}
@media(max-width:650px){.grid{grid-template-columns:1fr}#choices{max-height:240px}header{padding:16px}h1{font-size:23px}}
</style></head><body>
<main>
<header><h1>גבהה — ימות האטליין־עדיטאר</h1>
<p>אויסקלייבן אן עקסטענשאן, שרייבן דעם נוסח אדער אריינרעקארדירן א שטימע. יעדע עקסטענשאן ווערט באזונדער אפגעהיטן.</p>
<div class="info">די פונקציעס פון די קנעפלעך בלייבן אומגעענדערט. דער עדיטאר איז פאר <b>מעניו־נוסחאות און רעקארדירונגען</b>. א רעקארדירונג ווערט נישט לייוו ביז מ'דרוקט באזונדער „פובליצירן“.</div>
<p class="hint" id="provider"></p>
<div class="actions"><a href="/api/admin/hotline-keypad-map">מעניו־מפתח</a> <a href="/api/admin/max/ivr-editor/voice-studio">עולם החסד SignalWire עדיטאר</a></div>
</header>
<div class="grid">
<section class="panel"><h2>קלייב אן עקסטענשאן</h2>
<input id="search" type="search" placeholder="זוך נומער אדער נאמען" aria-label="זוך עקסטענשאן">
<div id="choices" role="list"></div><p class="hint" id="quantity">ליינט די מעניוס...</p></section>
<section class="panel"><h2 id="heading">קלייב אן עקסטענשאן</h2>
<p id="details" class="hint"></p>
<div id="editor" hidden>
<label for="tts">נוסח וואס דער האטליין זאל זאגן</label>
<textarea id="tts" maxlength="950" spellcheck="true" placeholder="Write the English telephone announcement here."></textarea>
<p class="hint">דער יעצטיגער TTS־מאָטאר פון ימות שטיצט אין דעם עדיטאר דערווייל נאר ענגלישע נוסחאות. דעם אידישן טעקסט אין די מעניו־קעפלעך קען מען זען, אבער דער TTS־אפלאוד וואלט נישט אנגענומען אידיש.</p>
<div class="actions"><button class="primary" id="saveTts" type="button">אפהיטן דעם נוסח</button><button id="suggest" type="button">ניצן דעם פארגעשלאגענעם נוסח</button></div>
<hr class="divider">
<h2>רעקארדירונג פאר דער עקסטענשאן</h2>
<label for="file">ארויפלייגן א רעקארדירונג (WAV, WEBM, OGG, MP3)</label>
<input id="file" type="file" accept="audio/wav,audio/wave,audio/webm,audio/ogg,audio/mpeg,audio/mp3">
<div class="actions"><button id="record" type="button">רעקארדירן פונעם מייקראפאן</button><button id="stop" type="button" disabled>אפשטעלן רעקארדירונג</button></div>
<audio controls id="player"></audio>
<div class="actions"><button class="primary" id="upload" type="button" disabled>אפהיטן רעקארדירונג אלס פריוואטע פארשלאג</button></div>
<div id="audioState" class="info">נאך נישט אויסגעקליבן קיין רעקארדירונג.</div>
<div class="actions"><button id="publish" type="button" class="primary">פובליצירן די רעקארדירונג אויף ימות</button><button id="unpublish" type="button" class="danger">צוריקשטעלן TTS אנשטאט רעקארדירונג</button></div>
<p class="hint">אויפן אמתן ימות ווערט נאר פובליצירט נאכן פארזיכטיגן באשטעטיגונג. די סיסטעם טאר נישט אויסמעקן אלטע רעקארדירונגען אדער ענדערן דעם הויפט־Callback.</p>
</div><div id="status" class="status" role="status">די סיסטעם ליינט די מעניו־אינפארמאציע.</div>
</section></div></main>
<script>
"use strict";
const root="/api/admin/yemot/voice-studio",el=id=>document.getElementById(id);
let catalog=[],prompts=new Map(),selected=null,blob=null,recorder=null,chunks=[],stream=null,objectUrl=null,busy=false,verifiedFolder=false;
const escapeNothing=s=>String(s||"");
function message(t,bad=false){const p=el("status");p.textContent=t;p.className="status "+(bad?"error":"good")}
function selectedApi(tail=""){return root+"/"+encodeURIComponent(selected.path)+tail}
function updateAudioControls(){el("upload").disabled=!blob||busy;el("record").disabled=busy;el("stop").disabled=!recorder||recorder.state!=="recording";el("saveTts").disabled=busy;el("publish").disabled=busy;el("unpublish").disabled=busy}
function showOptions(){
 const search=el("search").value.trim().toLowerCase(),choices=el("choices");choices.replaceChildren();
 const matches=catalog.filter(v=>(v.path+" "+v.label+" "+v.parent).toLowerCase().includes(search));
 el("quantity").textContent=matches.length+" עקסטענשאנס";
 const fragment=document.createDocumentFragment();
 for(const node of matches){
  const button=document.createElement("button");button.type="button";button.className="choice"+(selected&&selected.path===node.path?" active":"");
  const id=document.createElement("span");id.className="num";id.textContent=node.path;
  const text=document.createElement("span");text.textContent=(node.depth>1?"· ":"")+node.label;
  button.append(id,text);button.onclick=()=>select(node);fragment.append(button);
 }choices.append(fragment);
}
function setPreview(src){
 if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}
 el("player").removeAttribute("src");
 if(src){el("player").src=src;el("player").load()}
}
function select(node){
 if(recorder&&recorder.state==="recording"){message("שטעל קודם אפ די רעקארדירונג.",true);return}
 selected=node;blob=null;el("file").value="";el("editor").hidden=false;
 el("heading").textContent="עקסטענשאן "+node.path+" — "+node.label;
 el("details").textContent="טייל: "+node.parent+" · סארט: "+(node.kind==="menu"?"מעניו":"קנעפל");
 const saved=prompts.get(node.path);el("tts").value=saved?.tts_text||"";
 el("audioState").textContent=saved?.published_path?"אויפן האטליין פובליצירט: "+saved.published_path:saved?.audio_size?"א פריוואטע רעקארדירונג איז אפגעהיטן, אבער נאך נישט פובליצירט.":"נאך נישט דא קיין אפגעהיטענע רעקארדירונג.";
 setPreview(saved?.audio_size?selectedApi("/audio"):null);
 message("אויסגעקליבן "+node.path+".");
 showOptions();updateAudioControls();
}
async function refresh(){
 const res=await fetch(root+"?data=1",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});
 if(!res.ok)throw Error(res.status===403?"עס פעלט אדמיניסטראציע־רעכטן.":"די מעניו־אינפארמאציע איז נישט צוטריטליך ("+res.status+").");
 const data=await res.json();
 if(!Array.isArray(data.catalogue))throw Error("דער סערווער האט נישט צוריקגעגעבן א מעניו־ליסטע");
 catalog=data.catalogue;prompts=new Map((data.prompts||[]).map(v=>[v.path,v]));
 verifiedFolder=!!data.provider?.approvedFolder;el("provider").textContent="ימות־מעדיע־פאלדער: "+(data.provider?.approvedFolder||"נאך נישט איינגעשטעלט. פובליצירן פאדערט דעם באשטעטיגטן מידיע־פאלדער.");
 if(selected)selected=catalog.find(v=>v.path===selected.path)||catalog[0];else selected=catalog.find(v=>v.path==="root")||catalog[0];
 showOptions();if(selected)select(selected);
}
async function request(url,method,body){
 const res=await fetch(url,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||data.message||"א סערווער־פעלער ("+res.status+")");
 return data;
}
async function execute(task,success){
 if(busy||!selected)return;busy=true;updateAudioControls();message("ארבעט...");
 try{const answer=await task();message(success||"סוקסעספול אפגעהיטן.");return answer}
 catch(e){message(e.message||"נישט געלונגען",true)}
 finally{busy=false;updateAudioControls()}
}
el("search").oninput=showOptions;
el("saveTts").onclick=async()=>{const n=selected;if(!n)return;const result=await execute(()=>request(selectedApi(),"PUT",{ttsText:el("tts").value}),"דער נוסח איז אפגעהיטן.");if(result)prompts.set(n.path,{...prompts.get(n.path),tts_text:el("tts").value})};
el("suggest").onclick=()=>{if(selected)el("tts").value=selected.suggestedEnglish||""};
el("file").onchange=()=>{const f=el("file").files[0];if(!f)return;if(f.size>3900000){message("די פייל איז צו גרויס. מאַקסימום בערך 4 MB.",true);return}blob=f;setPreview(URL.createObjectURL(blob));objectUrl=el("player").src;el("audioState").textContent="אויסגעקליבן: "+f.name+". דרוק אפהיטן כדי צו שיקן צום סערווער.";updateAudioControls()};
el("record").onclick=async()=>{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){message("דער בראוזער שטיצט נישט מייקראפאן־רעקארדירונג. קלייב אן א פייל.",true);return}
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const type=["audio/webm;codecs=opus","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
  recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});stream?.getTracks().forEach(t=>t.stop());stream=null;setPreview(URL.createObjectURL(blob));objectUrl=el("player").src;el("audioState").textContent="רעקארדירונג גרייט צום אפהיטן ("+Math.round(blob.size/1024)+" KB).";updateAudioControls()};
  recorder.start();message("דער מייקראפאן רעקארדירט יעצט.");updateAudioControls();
 }catch(e){stream?.getTracks().forEach(t=>t.stop());message("מייקראפאן נישט צוטריטליך: "+e.message,true)}
};
el("stop").onclick=()=>{if(recorder&&recorder.state==="recording")recorder.stop();updateAudioControls()};
function asBase64(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result).split(",")[1]||"");fr.onerror=()=>reject(Error("קען נישט לייענען די רעקארדירונג"));fr.readAsDataURL(file)})}
el("upload").onclick=async()=>{if(!blob||!selected)return;if(blob.size>3900000){message("די רעקארדירונג איז צו גרויס",true);return}
 const path=selected.path;
 const output=await execute(async()=>request(root+"/"+encodeURIComponent(path)+"/audio","POST",{mime:(blob.type||"audio/webm").split(";")[0],base64:await asBase64(blob)}),"די רעקארדירונג איז פריוואט אפגעהיטן; נאך נישט לייוו.");
 if(output){prompts.set(path,{...prompts.get(path),audio_size:blob.size});el("audioState").textContent="פריוואטע רעקארדירונג אפגעהיטן. פובליציר נאר אויב דו ביסט גרייט."}
};
el("publish").onclick=async()=>{
 if(!verifiedFolder){message("פארן פובליצירן דארף מען אויפשטעלן דעם אפיציעלן, באשטעטיגטן ימות־מידיע־פאלדער.",true);return}
 if(!confirm("ביסטו זיכער אז די רעקארדירונג זאל ווערן לייוו אויף דער אויסגעקליבענער ימות־עקסטענשאן?"))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/publish","POST",{confirm:"PUBLISH_TO_APPROVED_YEMOT_FOLDER"}),"די רעקארדירונג איז פובליצירט און נאכגעקוקט אין ימות.");
 if(result)await refresh();
};
el("unpublish").onclick=async()=>{
 if(!confirm("צוריקשטעלן TTS פאר דער עקסטענשאן? די אלטע רעקארדירונג ווערט נישט אויסגעמעקט."))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/published","DELETE",{confirm:"USE_TTS_INSTEAD_OF_AUDIO"}),"TTS איז ווידער אקטיוו. די רעקארדירונג איז נישט אויסגעמעקט.");
 if(result)await refresh();
};
refresh().then(()=>message("קלייב אן עקסטענשאן און עדיטיר די נוסחאות אדער רעקארדירונגען.")).catch(e=>message(e.message,true));
</script></body></html>`;
