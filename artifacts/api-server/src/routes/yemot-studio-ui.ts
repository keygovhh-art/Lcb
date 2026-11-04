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
.record-guide{direction:rtl;text-align:right;padding:13px 15px;margin:13px 0 7px;border:1px solid #b5cede;border-right:4px solid #35769b;border-radius:12px;background:#f6fafc;overflow-wrap:anywhere}.record-guide .guide-title{font-size:16px;font-weight:750;margin-bottom:6px;color:#174d73}.record-guide .guide-text{font-size:17px;line-height:1.9;white-space:pre-wrap;color:#263a4d}.record-guide .guide-hint{font-size:12px;margin-top:8px;color:#576d80}.record-guide.recording{position:sticky;top:7px;z-index:8;max-height:40vh;overflow:auto;box-shadow:0 7px 18px #183f5c30;background:#fff}audio{width:100%;margin:11px 0}label{display:block;font-weight:650;margin:12px 0 5px}
.divider{border:0;border-top:1px solid #e1e9f1;margin:17px 0}
a{color:#175e91}#caption{font-weight:700}.current-message{padding:14px;margin:10px 0;border:1px solid #c2d4e5;background:#f8fbfe;border-radius:11px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left;min-height:52px}
@media(max-width:650px){.grid{grid-template-columns:1fr}#choices{max-height:none}header{padding:16px}h1{font-size:23px}}
</style></head><body>
<main>
<header><h1>גבהה — ימות האטליין־עדיטאר</h1>
<p>אויסקלייבן אן עקסטענשאן, שרייבן דעם נוסח אדער אריינרעקארדירן א שטימע. יעדע עקסטענשאן ווערט באזונדער אפגעהיטן.</p>
<div class="info">די פונקציעס פון די קנעפלעך בלייבן אומגעענדערט. דער עדיטאר איז פאר <b>מעניו־נוסחאות און רעקארדירונגען</b>. א רעקארדירונג ווערט נישט לייוו ביז מ'דרוקט באזונדער „פובליצירן“.</div>
<p class="hint" id="provider"></p>
<div class="actions"><a href="/api/admin/hotline/speech-library">אלע גערעדטע מעלדונגען — רעדאקטירן</a> <a href="/api/admin/hotline-keypad-map">מעניו־מפתח</a> <a href="/api/admin/max/ivr-editor/voice-studio">עולם החסד SignalWire עדיטאר</a></div>
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
<aside id="recordGuide" class="record-guide" aria-label="אידישער ביישפיל פאר די רעקארדירונג"><div class="guide-title">ביישפיל: וואס דו קענסט זאגן ביים רעקארדירן</div><div id="recordGuideText" class="guide-text" dir="rtl"></div><p class="guide-hint">דאס איז בלויז אן אידישער פארשלאג, נישט א לייווע מעלדונג. ער בלייבט זעבאר בשעתן רעקארדירן.</p></aside><div class="actions"><button id="record" type="button">רעקארדירן פונעם מייקראפאן</button><button id="stop" type="button" disabled>אפשטעלן רעקארדירונג</button></div>
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

const recYiddishSamples={
"root":"ברוכים הבאים צו גבהה. פאר חסד־נייעס דרוקט 1. פאר עסקנים־שמועסן דרוקט 2. פאר קאמיוניטי פראיעקטן און פריוואטע עסקנים־פארבינדונגען דרוקט 3. פאר מתאחדים באהבה דרוקט 4. פאר עולם החסד קאמיוניקאציע דרוקט 5. פאר היינטיגע צוועק דרוקט 6. פאר מנינים דרוקט 7. פאר גרופעס דרוקט 8. פאר מיין עסקנות דרוקט 9. פאר זוכן גיט אריין 11. פאר מעלדונגען 12. פאר מיינע פארבינדונגען 13. פאר כח הרבים 14. פאר מיין פראפיל 15. פאר מער אפטיילונגען 77. פאר קאמפיין סענטער 4444. פאר גבהה־רעגיסטראציע דרוקט 0.",
"11":"צו הערן אלע אפדעיטס, ווארט אויפן ליין. פאר אנדערע אפציעס, דרוק 1.",
"9702":"צו הערן עסקנים־שמועסן ווארט אויפן ליין. פאר אפציעס דרוקט יעצט 1.",
"97021":"צו אריינזאגן א שמועס, דרוקט 1.",
"970211":"רעדט אריין דעם שמועס נאך דעם טאן, און ענדיגט מיט שארף. נאכן רעקארדירן קענט איר איבערהערן אדער אויסמעקן פארן פובליצירן.",
"9703":"פאר פראיעקטן, קאמפיינס וכדומה ווארט אויפן ליין. פאר אפציעס דרוקט 1.",
"97031":"זיך איינצושרייבן אין דער פריוואטער גבהה־ליסטע אלס עסקן אדער צו בעטן עסקנים פאר א קאמפיין — דרוקט 1. צו אויפשטעלן א קאמפיין אדער פראיעקט פארן טיעם'ס באשטעטיגונג — דרוקט 2.",
"970311":"די ליסטעס זענען פריוואט און ווערן געהאנדלט בלויז דורך דער גבהה־מערכת. קלייבט אייער סארט בקשה און פאלגט די קיפעד־אנווייזונגען. פרייע דעטאלן זאגט מען אריין נאך דעם טאן און ענדיגט מיט שארף.",
"970312":"צו שיקן א פראיעקט אדער קאמפיין קלייבט דעם סארט, רעקארדירט דעם נאמען, באשרייבונג, געגנט און ציל. שיקט עס אריין צום טיעם. עס ווערט נישט פובליצירט אן באשטעטיגונג.",
"9704":"מתאחדים באהבה — יונייטעד אין קינדנעס. הערט דעם אקטיוון צוועק, די באשטעטיגטע אויפגעברענגטע נדבות און וויפיל מענטשן האבן זיך אנגעשלאסן. צו דזשוינען דרוקט 1. צו פארשלאגן א צוועק דרוקט 2.",
"97041":"צו אונטערנעמען בל״נ א סכום דרוקט 1. צו געבן א נדבה יעצט אדער הערן נדבה־אנווייזונגען דרוקט 2.",
"970411":"די אונטערנעמונג איז בל״נ. לייגט אריין דעם סכום און די דאטום; מער ווי צוויי חדשים דארף דער טיעם באשטעטיגן.",
"970412":"איר קענט הערן וויאזוי צו געבן א נדבה אדער אריינגעבן א סכום פארן קעיס. קיין קארטל אינפארמאציע ווערט נישט גענומען דורך דעם ליין.",
"97042":"ווייסט איר א צוועק וואס פארדינט די ספאטלייט? רעקארדירט דעם נאמען און אלע פרטים מיט שארף נאכן רעקארדירן. די מערכת דארף דאס באשטעטיגן פארן פובליצירן.",
"9706":"היינטיגע צוועק — טאדעיס קעיס. סך הכל שוין אונטערגענומען בל״נ און סך הכל געלט שוין אריינגעקומען ווערן פארגעזאגט באזונדער. איר הערט דעם יעצטיגן צוועק. זיך אנשליסן דרוקט 1. פארשלאגן א צוועק דרוקט 2.",
"9707":"מנינים־צענטער. צו הערן, זוכן און פלאנירן מנינים דרוקט 1. צו אריינלייגן א נייעם מנין דרוקט 2.",
"97061":"צו אונטערנעמען א סכום בל״נ דרוקט 1. צו געבן א נדבה יעצט אדער הערן נדבה־אנווייזונגען דרוקט 2.",
"97062":"ווייסט איר א צוועק וואס פארדינט די ספאטלייט? רעדט אריין דעם נאמען, די באשרייבונג און די אנדערע פרטים; אלעס גייט צום טיעם פאר באשטעטיגונג.",
"97071":"צו הערן מנינים לויט שטאט דרוקט 1. פון אייער געסעיווטער ליסטע דרוקט 2. זוכן דורך סיי וועלכע אינפארמאציע דרוקט 3. פלאן די הייליגע מצוה דרוקט 4. דורך א דריי־אדער פיר־ציפער נומער דרוקט 5.",
"97072":"אריינלייגן א נייעם מנין. נאמען דורך שטימע אדער קיפעד; שטאט, אדרעס, שחרית, מנחה, מעריב אדער מנחה־מעריב צוזאמען; דאטום און צייט, אדער פאר ר״ת. צולייגן נאך א מנין מיט קנעפל 1. אלעס ווארט אויף דער מערכת־באשטעטיגונג.",
"970611":"די אונטערנעמונג איז בל״נ. לייגט אריין דעם סכום און ביז ווען איר ווילט עס געבן. א טערמין לענגער ווי צוויי חדשים דארף דער טיעם באשטעטיגן.",
"970612":"איר קענט הערן וויאזוי צו געבן די נדבה אדער אריינגעבן א סכום אינעם פערזענליכן קעיס. קיין קארטל־דעטאלן ווערן נישט פארלאנגט אויפן ליין.",
"970711":"פאר וויליאמסבורג דרוקט 1, מאנסי 2, קרית יואל 3, בארא פארק 4 און לעיקוואד 5. דערנאך קענט איר קלייבן א אדרעס אדער איין מנין נאכן צווייטן.",
"970712":"איר הערט די באשטעטיגטע מנינים. פארן קומענדיגן דרוקט 1. צו סעיוון אין אייער ליסטע דרוקט 3. צו פלאנירן א וועג צו דעם מנין דרוקט 4.",
"970713":"צו אריינזאגן א נאמען אדער אדרעס דרוקט 1. צו טייפן דורך Multi-tap דרוקט 2. רעדט אדער טייפט אריין און ענדיגט מיט שארף.",
"970714":"פלאן די הייליגע מצוה. צו הערן וויאזוי עס ארבעט דרוקט 1. אריינלייגן א אדרעס דרוקט 2. דערנאך קלייבט א דאטום אדער יעצט, א צייט, און מיט קאר אדער צופיס. דער סיסטעם דארף אמתע רייזע־צייטן פונעם פארבונדענעם פראוויידער.",
"970715":"לייגט אריין דעם דריי־אדער פיר־ציפער איי די פון א בית המדרש און דרוקט שארף.",
"97111":"פאר וויכטיגע נייעס דרוקט 1. פאר אן ארטיקל לויטן נומער דרוקט 3. פאר אלע אפדעיטס דרוקט 4.",
"111":"איר הערט יעצט די לעצטע אפדעיטס. בלייבט אויפן ליין פארן נעקסטן.",
"113":"איר הערט די וויכטיגע און דרינגענדע נייעס. בלייבט אויפן ליין פארן נעקסטן.",
"115":"גיט אריין דעם נומער פונעם ארטיקל וואס איר ווילט הערן, און דרוקט שארף.",
"185":"ברוכים הבאים צו גבהה־רעגיסטראציע. קלייבט א פערזענליכן פעסווארד פון זעקס ביז צוועלף ציפערן און דרוקט שארף.",
"1851":"צו ווערן א גבהה־מעמבער קלייבט א פריוואטן פעסווארד פון זעקס ביז צוועלף ציפערן, און דרוקט שארף.",
"1852":"לייגט נאכאמאל אריין דעם זעלבן פעסווארד און דרוקט שארף.",
"1853":"די צוויי פעסווארדס שטימען נישט. ביטע פרובירט נאכאמאל.",
"1854":"ביטע קלייבט אן אנדערן פעסווארד פון זעקס ביז צוועלף ציפערן.",
"1855":"די רעגיסטראציע איז צייטווייליג נישט צוטריטליך. ביטע פרובירט שפעטער נאכאמאל.",
"1856":"איר זענט יעצט איינגעשריבן אלס גבהה־מעמבער. דער האטליין וועט אויטאמאטיש אויסזאגן און איבערחזרן אייער פערזענליכן פיר־ציפערדיקן איי־די.",
"1857":"עס זענען געווען צו פיל אומריכטיגע פרואוון. הייבט אן נאכאמאל.",
"1858":"איר זענט שוין איינגעשריבן אלס גבהה־מעמבער.",
"1251":"לייגט אריין אייער פריוואטן גבהה־פעסווארד פון זעקס ביז צוועלף ציפערן, און דרוקט שארף.",
"1252":"לייגט אריין אייער צווייטן זיכערהייט־קאד, און דרוקט שארף.",
"1253":"לייגט אריין אייער פיר־ציפערדיקן גבהה־איי־די, און דרוקט שארף.",
"1254":"ברוכים הבאים צוריק. אייער אקאונט איז באשטעטיגט.",
"97181":"פאר אומגעלייענטע מעלדונגען דרוקט 1. פאר אלע מעלדונגען דרוקט 2. צו אנצייכענען אלע אלס געלייענט דרוקט 3. פאר מעלדונגען לויטן סארט דרוקט 4.",
"971811":"דא הערט איר אומגעלייענטע מעלדונגען. פאר דער נעקסטער דרוקט 1, פאר דער פריערדיגער 2, און צו אנצייכענען געלייענט דרוקט 5 צוויי מאל.",
"971812":"דא הערט איר אלע מעלדונגען. פאר דער נעקסטער דרוקט 1, פאר דער פריערדיגער 2, און צו אנצייכענען געלייענט דרוקט 5 צוויי מאל.",
"971813":"צו אנצייכענען אלע מעלדונגען אלס געלייענט, דרוקט 1 צוויי מאל צו באשטעטיגן.",
"971814":"פאר אפקלאנגען דרוקט 1. פאר צדקה דרוקט 2. פאר גרופעס דרוקט 3. פאר אנאנסן דרוקט 4. פאר הילף דרוקט 5.",
"97190":"פאר נייעס לויט א נומער דרוקט 1. פאר שמועסן דרוקט 2. פאר צדקה דרוקט 3. פאר גרופעס דרוקט 4. פאר מנינים דרוקט 5.",
"97193":"פאר מיינע פארבינדונגען דרוקט 1. פאר פאלן וואס ווארטן אויף מיין באשטעטיגונג דרוקט 2. פאר נאכגעפאלגטע אפדעיטס דרוקט 3.",
"159":"ברוכים הבאים צו עולם החסד קאמיוניקאציע. פאלגט די אנווייזונגען פאר רופן, קאנטאקטן און באריכטן.",
"182":"דא קענט איר הערן אייערע אקאונט־פרטים און אייער פערזענליכן גבהה־איי־די.",
"19":"ברוכים הבאים צום כח הרבים־דעשבאורד. דא קענט איר הערן באריכטן און פארוואלטונגס־אפציעס.",
"12":"ברוכים הבאים צו מיין עסקנות. דא קענט איר פירן אייערע אויפגאבן, נאטיצן און ענינים.",
"9777":"פאר רעזערוואציעס דרוקט 1. פארן סיסטעם־צענטער דרוקט 2. פאר כח הרבים דרוקט 3. פאר קאנטאקטן דרוקט 4. פאר רופן דרוקט 5. פאר חסד דרוקט 6. פאר קהילה דרוקט 7. פאר מנינים דרוקט 8."
};
const recYiddishWords=[
["important and critical news","וויכטיגע נייעס"],["all updates","אלע אפדעיטס"],["emergency appeals","דרינגענדע הילף־רופן"],["fundraising","צדקה־זאמלונגען"],["organization updates","ארגאניזאציע־אפדעיטס"],["community alerts","ציבורישע מעלדונגען"],["volunteer calls","וואלונטיר־רופן"],["news","נייעס"],["announcement","מעלדונגען"],["bikur cholim","ביקור חולים"],["wedding","חתונה־נייעס"],["donor","נדבנים"],["pledges","צוזאגן"],["contacts","קאנטאקטן"],["follow","צוריקרופן"],["call","רופן"],["tasks","אויפגאבן"],["notes","נאטיצן"],["personal","פערזענליכע ענינים"],["charity","צדקה"],["campaign","קאמפיינס"],["community","קהילה"],["group","גרופעס"],["forum","שמועסן"],["discussion","שמועסן"],["connection","פארבינדונגען"],["minyan","מנינים"],["reservation","רעזערוואציעס"],["notification","מעלדונגען"],["profile","פראפיל"],["register","איינשרייבן"],["password","פעסווארד"],["security","זיכערהייט"],["account","אקאונט"],["report","באריכטן"],["management","פארוואלטונג"],["team","מאנשאפט"],["volunteer","וואלונטירן"],["search","זוכן"],["directory","רשימה"],["assistance","הילף"],["support","הילף"],["privacy","פריוואטקייט"],["settings","איינשטעלונגען"],["system","סיסטעם"],["koach","כח הרבים"],["olam","עולם החסד"],["messages","מעלדונגען"],["help","הילף"],["updates","אפדעיטס"]
];
function recYiddishName(n){
 let v=String(n?.label||"").replace(/^\s*\d+\s*[—–-]\s*/,"").trim();
 if(/[\u0590-\u05ff]/u.test(v)){const p=v.split(/[—–]/).map(x=>x.trim()).find(x=>/[\u0590-\u05ff]/u.test(x));if(p)return p.slice(0,110)}
 for(const pair of recYiddishWords)if(v.toLowerCase().includes(pair[0]))return pair[1];
 return "די אויסגעקליבענע אפטיילונג";
}
function recYiddishExample(n){
 if(!n)return "קלייבט א קנעפל פאר א פאסיגן אידישן ביישפיל.";
 if(recYiddishSamples[n.path])return recYiddishSamples[n.path];
 const children=catalog.filter(x=>x.parent===n.path&&x.path!==n.path).filter((x,i,all)=>all.findIndex(v=>v.path===x.path)===i);
 if(children.length){
  const notes=children.slice(0,16).map((x,i)=>{
   const m=String(x.label||"").match(/^\s*(\d+)\s*[—–-]/);
   return "פאר "+recYiddishName(x)+" דרוקט "+(x.displayDigit||m?.[1]||x.path.slice(-1)||String(i+1))+".";
  });
  return "ברוכים הבאים צו "+recYiddishName(n)+". "+notes.join(" ")+" צו גיין צוריק דרוקט שטערנדל.";
 }
 return "איר האט אויסגעקליבן "+recYiddishName(n)+". פאלגט די ווייטערדיגע אנווייזונגען. צוריק צום פריערדיגן מעניו, דרוקט שטערנדל.";
}
function showRecYiddish(n){el("recordGuideText").textContent=recYiddishExample(n)}

function message(t,bad=false){const p=el("status");p.textContent=t;p.className="status "+(bad?"error":"good")}
function selectedApi(tail=""){return root+"/"+encodeURIComponent(selected.path)+tail}
function updateAudioControls(){
 const row=selected?prompts.get(selected.path):null;
 el("recordGuide").classList.toggle("recording",!!recorder&&recorder.state==="recording");
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
 const entry=[
  ["1","11","צדקה־נייעס — Chesed News"],
  ["2","9702","עסקנים־שמועסן — Discussion Center"],
  ["3","9703","פריוואטע הילף־בקשות"],
  ["4","9704","התקבצו לטובה — United in Kindness"],
  ["5","159","עולם החסד קאמיוניקאציע"],
  ["6","9706","היינטיגע צדקה"],
  ["7","17","מנינים"],
  ["8","9708","גרופעס"],
  ["9","12","מיין עסקנות"],
  ["11","97190","זוכן — Search"],
  ["12","97181","מעלדונגען — Notifications"],
  ["13","97193","מיינע פארבינדונגען — My Connections"],
  ["14","19","כח הרבים דעשבאורד — Koach Harabim"],
  ["15","182","מיין פראפיל — My Profile"],
  ["77","9777","מער אפטיילונגען — רעזערוואציעס, סיסטעם־צענטער, און אלע פריערדיגע פונקציעס"],
  ["88","88","פארגעשריטענע מיין עסקנות־כלים"],
  ["4444","2","קאמפיין סענטער"],
  ["0","185","אויפשרייבן אלס גבהה־מעמבער"]
 ];
 return entry.map(([digit,path,label])=>{
  const orig=catalog.find(x=>x.path===path);
  return {...(orig||{path,kind:"menu",depth:1,parent:"root",suggestedEnglish:""}),displayDigit:digit,label};
 });
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
 const names=search?"זוך־רעזולטאטן":atRoot?"הויפט־מעניו — 1 ביז 9; זוכן 11, מעלדונגען 12, פארבינדונגען 13, כח הרבים 14, פראפיל 15; מער 77":section.label+" — אונטער־קנעפלעך";
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
 selected=node;showRecYiddish(node);blob=null;el("file").value="";el("editor").hidden=false;
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
