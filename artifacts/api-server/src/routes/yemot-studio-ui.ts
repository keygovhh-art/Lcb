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
#choices{display:flex;flex-direction:column;gap:6px;margin-top:10px}.crumbs{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:9px 0 12px}.crumb{padding:6px 9px;background:#edf4fa;border-color:#dae7f1;font-size:13px}.crumb.current{background:#d8e9f6;border-color:#91b9d6;font-weight:700}.child-note{font-size:13px;background:#f1f6fa;border-radius:8px;padding:9px;color:#55758b}.choice{min-height:46px}.choice .num{min-width:40px;text-align:center}.branch-header{margin:12px 0 4px;font-weight:700}
.choice{width:100%;text-align:right;display:flex;gap:9px;align-items:center;justify-content:flex-start;background:#f7fafd;border-color:transparent;padding:9px;border-radius:8px}
.choice.active{background:#e8f3fa;border:1px solid #75accf}
.num{direction:ltr;font-size:12px;font-weight:700;white-space:nowrap;border-radius:6px;background:#e1edf6;padding:4px 7px;color:#144e77}
.info{border-radius:9px;background:#eff5fa;padding:10px 12px;color:#476780}
.status{margin:10px 0;border-radius:9px;padding:10px;background:#f0f5fa;min-height:20px;white-space:pre-wrap}
.good{background:#edf8f1;color:#176237}.error{background:#fff0f0;color:#a22929}
audio{width:100%;margin:11px 0}label{display:block;font-weight:650;margin:12px 0 5px}
.divider{border:0;border-top:1px solid #e1e9f1;margin:17px 0}
a{color:#175e91}#caption{font-weight:700}.current-message{padding:14px;margin:10px 0;border:1px solid #c2d4e5;background:#f8fbfe;border-radius:11px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left;min-height:52px}
@media(max-width:650px){.grid{grid-template-columns:1fr}#choices{max-height:none}header{padding:16px}h1{font-size:23px}}
</style></head><body>
<main>
<header><h1>גבהה — ימות האטליין־עדיטאר</h1>
<p>אויסקלייבן אן עקסטענשאן, שרייבן דעם נוסח אדער אריינרעקארדירן א שטימע. יעדע עקסטענשאן ווערט באזונדער אפגעהיטן.</p>
<div class="info">די פונקציעס פון די קנעפלעך בלייבן אומגעענדערט. דער עדיטאר איז פאר <b>מעניו־נוסחאות און רעקארדירונגען</b>. א רעקארדירונג ווערט נישט לייוו ביז מ'דרוקט באזונדער „פובליצירן“.</div>
<p class="hint" id="provider"></p>
<div class="actions"><a href="/api/admin/hotline-keypad-map">מעניו־מפתח</a> <a href="/api/admin/max/ivr-editor/voice-studio">עולם החסד SignalWire עדיטאר</a></div>
</header>
<div class="grid">
<section class="panel"><h2>דער מעניו־מפתח</h2><p class="hint">קלייב קודם א קנעפל פונעם הויפט־מעניו, דערנאך זיינע אונטער־קנעפלעך. <b>* = צוריק</b>.</p>
<input id="search" type="search" placeholder="זוך אן עקסטענשאן אין אלע שטאפלען" aria-label="זוך עקסטענשאן">
<div class="crumbs" id="crumbs" aria-label="מעניו־שטאפלען"></div>
<div class="actions"><button id="back" type="button">* צוריק איין מעניו</button><button id="main" type="button">הויפט־מעניו</button></div>
<div id="branch-title" class="branch-header">הויפט־מעניו</div>
<div id="choices" role="list"></div><p class="hint" id="quantity">ליינט די מעניוס...</p></section>
<section class="panel"><h2 id="heading">קלייב אן עקסטענשאן</h2>
<p id="details" class="hint"></p>
<div id="editor" hidden>
<h2>וואס דער האטליין זאגט יעצט</h2><div id="ttsOrigin" class="info">ליינט דעם יעצטיגן נוסח...</div><div id="nowText" class="current-message" dir="auto"></div><p class="hint">דינאמישע מעלדונגען קענען זיך טוישן לויטן רופער. דא זעסטו דעם מעניו־נוסח אדער דעם אייגענעם טעקסט.</p><label for="tts">רעדאקטיר דעם TTS־נוסח</label>
<textarea id="tts" maxlength="950" spellcheck="true" placeholder="Write the English telephone announcement here."></textarea>
<p class="hint">דער יעצטיגער TTS־מאָטאר פון ימות שטיצט אין דעם עדיטאר דערווייל נאר ענגלישע נוסחאות. דעם אידישן טעקסט אין די מעניו־קעפלעך קען מען זען, אבער דער TTS־אפלאוד וואלט נישט אנגענומען אידיש.</p>
<div class="actions"><button class="primary" id="saveTts" type="button">אפהיטן דעם נוסח</button><button id="suggest" type="button">לייג אריין דעם איינגעבויטן נוסח</button></div><div class="actions"><button id="resetTts" class="danger" type="button">אויסמעקן מיין נוסח — צוריק צום איינגעבויטן</button><button id="muteTts" class="danger" type="button">אינגאנצן שטיל מאכן דעם TTS</button></div><p class="hint">אויסמעקן דעם אייגענעם נוסח שטעלט צוריק דעם איינגעבויטן. שטיל מאכן גיט גאר קיין TTS; א לייווע רעקארדירונג דארף מען באזונדער אראפנעמען.</p>
<hr class="divider">
<h2>רעקארדירונג פאר דער עקסטענשאן</h2>
<label for="file">ארויפלייגן א רעקארדירונג (WAV, WEBM, OGG, MP3)</label>
<input id="file" type="file" accept="audio/wav,audio/wave,audio/webm,audio/ogg,audio/mpeg,audio/mp3">
<div class="actions"><button id="record" type="button">רעקארדירן פונעם מייקראפאן</button><button id="stop" type="button" disabled>אפשטעלן רעקארדירונג</button></div>
<audio controls id="player"></audio><div id="voiceLabSlot"></div><div class="actions"><button id="voiceLoadSaved" type="button">עפענען די אפגעהיטענע רעקארדירונג אינעם Voice Changer</button></div>
<div class="actions"><button class="primary" id="upload" type="button" disabled>אפהיטן רעקארדירונג אלס פריוואטע פארשלאג</button></div>
<div id="audioState" class="info">נאך נישט אויסגעקליבן קיין רעקארדירונג.</div><div class="actions"><button id="discardAudio" class="danger" type="button">אוועקווארפן די יעצטיגע רעקארדירונג</button><button id="deleteDraft" class="danger" type="button">אויסמעקן די אפגעהיטענע רעקארדירונג</button></div>
<div class="actions"><button id="publish" type="button" class="primary">פובליצירן די רעקארדירונג אויף ימות</button><button id="unpublish" type="button" class="danger">אראפנעמען די לייווע רעקארדירונג</button></div><div class="actions"><button id="deletePublished" class="danger" type="button">אויסמעקן דעם פובליצירטן פייל אויך ביי ימות</button></div>
<p class="hint">„אויסמעקן אויך ביי ימות“ מעקט בלויז דעם פייל פונעם אויסגעקליבענעם קנעפל אינעם באשטעטיגטן גבהה־מידיע־פאלדער. אנדערע רעקארדירונגען און דער הויפט־Callback ווערן נישט אנגערירט.</p>
</div><div id="status" class="status" role="status">די סיסטעם ליינט די מעניו־אינפארמאציע.</div>
</section></div></main>
<script src="/api/admin/voice-changer.js"></script>
<script>
"use strict";
const root="/api/admin/yemot/voice-studio",el=id=>document.getElementById(id);
let catalog=[],prompts=new Map(),selected=null,trail=[],blob=null,recorder=null,chunks=[],stream=null,objectUrl=null,busy=false,verifiedFolder=false,voiceLab=null,voiceLabPath=null;
const escapeNothing=s=>String(s||"");
function message(t,bad=false){const p=el("status");p.textContent=t;p.className="status "+(bad?"error":"good")}
function selectedApi(tail=""){return root+"/"+encodeURIComponent(selected.path)+tail}
function updateAudioControls(){
 const row=selected?prompts.get(selected.path):null;
 el("upload").disabled=!blob||busy;el("record").disabled=busy;
 el("stop").disabled=!recorder||recorder.state!=="recording";el("saveTts").disabled=busy;
 el("resetTts").disabled=busy;el("muteTts").disabled=busy;
 el("publish").disabled=busy||!row?.audio_size||selected?.path==="1856";el("unpublish").disabled=busy||!row?.published_path;
 el("discardAudio").disabled=busy||!blob;el("deleteDraft").disabled=busy||!row?.audio_size;
 el("deletePublished").disabled=busy||!row?.published_path;
}
function showCurrentSpeech(){
 if(!selected)return;const row=prompts.get(selected.path);
 const own=typeof row?.tts_text==="string"&&row.tts_text.trim(),muted=!!row?.tts_muted,published=!!row?.published_path;
 el("nowText").textContent=muted?"דער TTS איז יעצט שטילגעמאכט.":own?row.tts_text:selected.effectiveTts||selected.suggestedEnglish||"עס איז נישטא קיין איינגעבויטער נוסח.";
 el("ttsOrigin").textContent=published?"דער האטליין שפילט יעצט א פובליצירטע רעקארדירונג. דא איז דער TTS־פאלבאק:":muted?"TTS־אויסזאג איז אפגעשטעלט.":own?"דער אייגענער TTS־נוסח איז אקטיוו:":"דער איינגעבויטער מעניו־נוסח איז אקטיוו:";
 el("muteTts").textContent=muted?"צוריק אנצינדן דעם TTS":"אינגאנצן שטיל מאכן דעם TTS";
}
function rootChoices(){
 // On the phone, the main Gavhah menu offers 1-9. Internally this tree stores them under 1.
 const main=catalog.filter(n=>n.parent==="1").sort((a,b)=>Number(a.path)-Number(b.path));
 const choices=main.map(n=>({...n,displayDigit:n.path.slice(-1)}));
 const reg=catalog.find(n=>n.path==="185");
 if(reg)choices.unshift({...reg,displayDigit:"0",label:"אפיציעלע גבהה־מעמבער־רעגיסטראציע"});
 const campaign=catalog.find(n=>n.path==="2");
 if(campaign)choices.push({...campaign,displayDigit:"4444",label:"קאמפיין סענטער — 4444"});
 return choices;
}
function currentMenu(){return trail.length?trail[trail.length-1]:catalog.find(n=>n.path==="root")}
function breadcrumbs(){
 const elts=el("crumbs");elts.replaceChildren();
 const base=document.createElement("button");base.className="crumb"+(!trail.length?" current":"");base.textContent="הויפט־מעניו";base.onclick=()=>navigateTo(-1);elts.append(base);
 trail.forEach((n,i)=>{
  const b=document.createElement("button");b.className="crumb"+(i===trail.length-1?" current":"");
  b.textContent="← "+(n.displayDigit||n.path)+" "+n.label;b.onclick=()=>navigateTo(i);elts.append(b);
 });
}
function navigateTo(index){
 if(recorder&&recorder.state==="recording"){message("שטעל קודם אפ די רעקארדירונג.",true);return;}
 if(index<0)trail=[];else trail=trail.slice(0,index+1);
 el("search").value="";
 select(currentMenu());
}
function openItem(node){
 if(recorder&&recorder.state==="recording"){message("שטעל קודם אפ די רעקארדירונג.",true);return;}
 // Search results can open a deep extension directly; the back button still returns to the main menu.
 if(el("search").value.trim())trail=[];
 trail.push(node);
 el("search").value="";
 select(node);
}
function showOptions(){
 const search=el("search").value.trim().toLowerCase(),choices=el("choices");
 choices.replaceChildren();breadcrumbs();
 const atRoot=trail.length===0,section=currentMenu();
 let matches=search?
  catalog.filter(n=>(n.path+" "+n.label+" "+n.parent).toLowerCase().includes(search)):
  atRoot?rootChoices():catalog.filter(n=>n.parent===section.path).sort((a,b)=>Number(a.path)-Number(b.path));
 const names=search?"זוך־רעזולטאטן":atRoot?"הויפט־מעניו — קלייב 0–9 אדער 4444":section.label+" — אונטער־קנעפלעך";
 el("branch-title").textContent=names;
 el("quantity").textContent=matches.length+(search?" געפונענע עקסטענשאנס":" קנעפלעך אין דעם מעניו");
 el("back").disabled=!trail.length;el("main").disabled=!trail.length;
 if(!matches.length){const msg=document.createElement("p");msg.className="child-note";msg.textContent=search?"קיין פאסיגע עקסטענשאן נישט געפונען.":"דאס איז דער לעצטער קנעפל. זיינע אפציעס געפינען זיך אונטן אינעם עדיטאר.";choices.append(msg);return;}
 const fragment=document.createDocumentFragment();
 for(const node of matches){
  const button=document.createElement("button");button.type="button";button.className="choice"+(selected&&selected.path===node.path?" active":"");
  const id=document.createElement("span");id.className="num";id.textContent=search?node.path:(node.displayDigit||node.path.slice(-1));
  const text=document.createElement("span");text.textContent=node.label;
  const more=document.createElement("span");more.className="hint";more.textContent=catalog.some(k=>k.parent===node.path)?" ›":" ·";
  button.append(id,text,more);button.onclick=()=>openItem(node);fragment.append(button);
 }choices.append(fragment);
}
el("back").onclick=()=>navigateTo(trail.length-2);
el("main").onclick=()=>navigateTo(-1);
function setPreview(src){
 if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}
 el("player").removeAttribute("src");
 if(src){el("player").src=src;el("player").load()}
}
function select(node){
 if(voiceLab&&voiceLabPath!==node.path){voiceLab.clear();voiceLabPath=node.path;}
 if(recorder&&recorder.state==="recording"){message("שטעל קודם אפ די רעקארדירונג.",true);return}
 selected=node;blob=null;el("file").value="";el("editor").hidden=false;
 el("heading").textContent=(node.path==="root"?"הויפט־מעניו":"קנעפל "+(trail[trail.length-1]?.displayDigit||node.path.slice(-1))+" — "+node.label);
 el("details").textContent="טעכנישע עקסטענשאן: "+node.path+" · אונטער־מעניו: "+node.parent+" · "+(node.kind==="menu"?"אפטיילונג מיט קנעפלעך":"לעצטער קנעפל");
 const saved=prompts.get(node.path);el("tts").value=saved?.tts_text?.trim()?saved.tts_text:(node.effectiveTts||node.suggestedEnglish||"");showCurrentSpeech();
 el("audioState").textContent=saved?.published_path?"אויפן האטליין פובליצירט: "+saved.published_path+(saved?.audio_size?" · אויך דא א פריוואטע רעקארדירונג.":""):saved?.audio_size?"א פריוואטע רעקארדירונג איז אפגעהיטן, אבער נאך נישט פובליצירט.":"נאך נישט דא קיין אפגעהיטענע רעקארדירונג.";
 setPreview(saved?.audio_size?selectedApi("/audio"):null);
 if(node.path==="1856")el("audioState").textContent+=" דער 4־ציפערדיקער איי־די ווערט געשאפן פערזענליך ביים רוף. אויף דעם שריט נוצט דער האטליין TTS מיט {member_id}, נישט א סטאטישע רעקארדירונג.";
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
 trail=trail.map(node=>catalog.find(v=>v.path===node.path)?{...catalog.find(v=>v.path===node.path),displayDigit:node.displayDigit}:null).filter(Boolean);
 selected=currentMenu();
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
el("saveTts").onclick=async()=>{
 const n=selected;if(!n)return;const value=el("tts").value;
 if(!value.trim()){message("א ליידיגער נוסח? נוצ דעם שטיל־מאכן אדער צוריקשטעלן קנעפל.",true);return}
 const saved=await execute(()=>request(selectedApi(),"PUT",{ttsText:value}),"דער נוסח איז אפגעהיטן.");
 if(saved){prompts.set(n.path,{...prompts.get(n.path),tts_text:value,tts_muted:false});showCurrentSpeech();updateAudioControls();}
};
el("resetTts").onclick=async()=>{
 if(!selected||!confirm("אויסמעקן דיין אייגענעם טעקסט און צוריקשטעלן דעם איינגעבויטן נוסח?"))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/tts","DELETE",{confirm:"RESET_CUSTOM_TTS"}),"דער אייגענער נוסח איז אויסגעמעקט.");
 if(result)await refresh();
};
el("muteTts").onclick=async()=>{
 if(!selected)return;const muted=!!prompts.get(selected.path)?.tts_muted;
 if(!confirm(muted?"צוריק אנצינדן דעם TTS?":"גאר שטיל מאכן דעם TTS אין דעם עקסטענשאן?"))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/tts-muted","PUT",{muted:!muted,confirm:"SET_TTS_SILENCE"}),muted?"דער TTS איז צוריק אנגעצינדן.":"דער TTS איז שטילגעמאכט.");
 if(result)await refresh();
};
el("suggest").onclick=()=>{if(selected)el("tts").value=selected.effectiveTts||selected.suggestedEnglish||""};
el("discardAudio").onclick=()=>{
 if(!blob)return;blob=null;el("file").value="";const saved=selected?prompts.get(selected.path):null;
 setPreview(saved?.audio_size?selectedApi("/audio"):null);
 el("audioState").textContent="די יעצטיגע רעקארדירונג איז אוועקגעווארפן. דער אפגעהיטענער פייל בלייבט.";
 updateAudioControls();
};
el("deleteDraft").onclick=async()=>{
 if(!selected||!prompts.get(selected.path)?.audio_size)return;
 if(!confirm("אויסמעקן די אפגעהיטענע רעקארדירונג? א פובליצירטער פייל אויף ימות בלייבט פאר דערווייל."))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/audio","DELETE",{confirm:"DELETE_SAVED_DRAFT_AUDIO"}),"די אפגעהיטענע רעקארדירונג איז אויסגעמעקט.");
 if(result)await refresh();
};
el("deletePublished").onclick=async()=>{
 if(!selected||!prompts.get(selected.path)?.published_path)return;
 if(!confirm("אויסמעקן די פובליצירטע רעקארדירונג אויך פיזיש ביי ימות? דאס קען מען נישט צוריקדרייען."))return;
 const path=selected.path;const result=await execute(()=>request(root+"/"+encodeURIComponent(path)+"/delete-published","POST",{confirm:"DELETE_PUBLISHED_GAVHAH_AUDIO"}),"די פובליצירטע רעקארדירונג איז אויסגעמעקט ביי ימות.");
 if(result)await refresh();
};
el("file").onchange=()=>{const f=el("file").files[0];if(!f)return;if(f.size>3900000){message("די פייל איז צו גרויס. מאַקסימום בערך 4 MB.",true);return}blob=f;voiceLab?.setSource(blob);setPreview(URL.createObjectURL(blob));objectUrl=el("player").src;el("audioState").textContent="אויסגעקליבן: "+f.name+". דרוק אפהיטן כדי צו שיקן צום סערווער.";updateAudioControls()};
el("record").onclick=async()=>{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){message("דער בראוזער שטיצט נישט מייקראפאן־רעקארדירונג. קלייב אן א פייל.",true);return}
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const type=["audio/webm;codecs=opus","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
  recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});voiceLab?.setSource(blob);stream?.getTracks().forEach(t=>t.stop());stream=null;setPreview(URL.createObjectURL(blob));objectUrl=el("player").src;el("audioState").textContent="רעקארדירונג גרייט צום אפהיטן ("+Math.round(blob.size/1024)+" KB).";updateAudioControls()};
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
voiceLab=window.GavhahVoiceChanger?.mount(el("voiceLabSlot"),{
 getPath:()=>selected?.path||"root",
 save:async function(file){
  if(!selected)throw Error("קלייב אן עקסטענשאן");
  const path=selected.path;
  const response=await request(root+"/"+encodeURIComponent(path)+"/audio","POST",{mime:"audio/wav",base64:await asBase64(file)});
  if(response?.ok){await refresh();return true}
  return false;
 }
});
el("voiceLoadSaved").onclick=async()=>{
 if(!selected||!prompts.get(selected.path)?.audio_size)return message("פאר דעם קנעפל איז נישטא קיין אפגעהיטענע רעקארדירונג.",true);
 try{const response=await fetch(selectedApi("/audio"),{credentials:"same-origin"});if(!response.ok)throw Error("נישט צוטריטליך");voiceLab?.setSource(await response.blob());message("די אפגעהיטענע רעקארדירונג איז גרייט פאר קול־פארענדערונג.")}catch(e){message(e.message,true)}
};
refresh().then(()=>message("קלייב אן עקסטענשאן און עדיטיר די נוסחאות אדער רעקארדירונגען.")).catch(e=>message(e.message,true));
</script></body></html>`;
