import {pool} from "@workspace/db";
import {olamHebrewToCivil} from "./olam-contact-calendar";

/**
 * This is the SAME Contacts engine on Yemot and SignalWire, invoked ONLY after
 * their existing signed provider callback and full-call PIN authentication.
 * Neither caller ID nor a browser-provided user ID grants access.
 */
type Category="all"|"eligible"|"callbacks"|"pledge_pending"|"warm"|"do_not_call"|"missed"|"donations"|"no_answer"|"not_interested"|"asked_no_more"|"pledges"|"other"|"unreported"|"spoke";
type Stage="root"|"sort"|"more"|"browse"|"contact"|"history"|"search"|"search_calendar"|"search_input"|"edit"|"edit_phone"|"edit_name"|"edit_address"|"create_phone"|"create_name"|"create_address"|"archive_confirm"|"scope"|"months";
type State={stage:Stage;category:Category;sort:"ASC"|"DESC";index:number;historyIndex:number;ref:number|null;searchKind:""|"phone"|"date"|"id";dateSystem:"gregorian"|"hebrew"|"";searchValue:string;phone:string;scope:"person"|"same_purpose"|"new_purpose";message:string};
export type OlamContactsPhoneOutput={speech:string;mode:"menu"|"digits"|"record";maxDigits:number;finishOnKey:string;exitToParent:boolean;state:State};
const initial=():State=>({stage:"root",category:"all",sort:"DESC",index:0,historyIndex:0,ref:null,searchKind:"",dateSystem:"",searchValue:"",phone:"",scope:"person",message:""});
const categories:Category[]=["missed","donations","no_answer","not_interested","asked_no_more","pledges","other","unreported","spoke"];
const names:Record<Category,string>={all:"אלע קאנטאקטס",eligible:"מען קען שוין רופן",callbacks:"צוריקצורופן פאר א נדבה",pledge_pending:"אומפארענדיגטע התחייבותן",warm:"ווארעמע קאנטאקטן",do_not_call:"נישט רופן",missed:"פארפאסטע אריינקומענדיגע קאלס",donations:"געגעבן א נדבה",no_answer:"נישט געענטפערט",not_interested:"נישט אינטערעסירט",asked_no_more:"בעט נישט מער רופן",pledges:"צוגעזאגט",other:"אנדערע קאל־רעזולטאטן",unreported:"רעזולטאט נישט אריינגעלייגט",spoke:"גערעדט"};
const results:Record<string,string>={no_answer:"נישט געענטפערט",donation:"געגעבן א נדבה",pledge:"צוגעזאגט",callback:"צוריקצורופן",not_interested:"נישט אינטערעסירט",asked_no_more:"בעט נישט מער צו רופן",do_not_call:"נישט רופן",other:"אנדערע",spoke:"גערעדט"};
const filter:Record<Category,string>={
 all:"TRUE",
 eligible:"c.do_not_call=false AND EXISTS(SELECT 1 FROM public.max_contact_recontact_plans p WHERE p.user_id=$1 AND p.contact_id=c.id AND p.next_allowed_at<=now())",
 callbacks:"EXISTS(SELECT 1 FROM public.max_donor_recontact p WHERE p.user_id=$1 AND p.contact_id=c.id AND p.status='waiting' AND p.due_at<=now())",
 pledge_pending:"EXISTS(SELECT 1 FROM public.max_pledges p WHERE p.user_id=$1 AND p.contact_id=c.id AND p.amount>p.paid_amount AND p.status NOT IN ('cancelled','paid'))",
 warm:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND (e.details->>'mood'='friendly' OR e.details->'report'->>'donationWarmth' IN ('very_warm','very_generous','warm','generous')))",
 do_not_call:"c.do_not_call=true",
 missed:"(EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=$1 AND s.contact_id=c.id AND s.direction='inbound' AND s.status='no_answer') OR "+
 "EXISTS(SELECT 1 FROM public.max_return_calls rc JOIN public.max_return_alerts a ON a.return_call_id=rc.id AND a.owner_user_id=rc.owner_user_id "+
 "WHERE rc.owner_user_id=$1 AND public.olam_max_phone_equal(rc.incoming_from,c.phone) "+
 "AND a.kind IN ('missed','voicemail','busy','yemot')))",
 donations:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='donation')",
 no_answer:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='no_answer')",
 not_interested:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='not_interested')",
 asked_no_more:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='asked_no_more')",
 pledges:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='pledge')",
 other:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='other')",
 unreported:"EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=$1 AND s.contact_id=c.id AND s.outcome='')",
 spoke:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND e.outcome='spoke')"
};
const phone=(value:unknown)=>{const digits=String(value||"").replace(/\D/g,"");const us=digits.length===11&&digits[0]==="1"?digits.slice(1):digits;return /^[2-9]\d{2}[2-9]\d{6}$/.test(us)?"+1"+us:null;};
const date8=(key:string)=>/^\d{8}$/.test(key)?key.slice(0,4)+"-"+key.slice(4,6)+"-"+key.slice(6,8):null;
async function records(db:import("pg").PoolClient,uid:number,s:State){
 const search=s.searchKind,sval=s.searchValue;
 const d=search==="date"?(s.dateSystem==="hebrew"?
   olamHebrewToCivil(Number(sval.slice(0,4)),Number(sval.slice(4,6)),Number(sval.slice(6,8))):date8(sval)):null;
 const r=await db.query(
  "SELECT c.id,c.contact_ref,c.name,c.phone,c.do_not_call FROM public.communication_contacts c "+
  "WHERE c.user_id=$1 AND c.archived_at IS NULL AND ("+filter[s.category]+") "+
  "AND ($2::text IS NULL OR regexp_replace(c.phone,'[^0-9]','','g') LIKE $2) "+
  "AND ($3::int IS NULL OR c.contact_ref=$3) "+
  "AND ($4::date IS NULL OR EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=c.id AND (e.call_at AT TIME ZONE 'America/New_York')::date=$4::date)) "+
  "ORDER BY c.created_at "+s.sort+",c.id "+s.sort+" LIMIT 300",
  [uid,search==="phone"?"%"+sval.replace(/\D/g,"")+"%":null,search==="id"?Number(sval):null,d]);
 return r.rows;
}
async function selected(db:import("pg").PoolClient,uid:number,s:State){
 if(!s.ref)return null;
 const r=await db.query(
  "SELECT id,contact_ref,name,phone,postal_address,do_not_call FROM public.communication_contacts WHERE user_id=$1 AND contact_ref=$2 AND archived_at IS NULL",
  [uid,s.ref]);return r.rows[0]||null;
}
const resetList=(s:State,category:Category)=>({...s,category,stage:"browse" as Stage,index:0,ref:null,searchKind:"" as const,searchValue:""});
export async function olamContactsPhoneStep(uid:number,callHash:string,provider:"yemot"|"signalwire",key?:string):Promise<OlamContactsPhoneOutput>{
 if(!Number.isSafeInteger(uid)||uid<1||!/^[0-9a-f]{24,128}$/i.test(callHash))throw Error("Verified call hash and member required");
 const db=await pool.connect();let s=initial(),exit=false,mode:"menu"|"digits"|"record"="menu",maxDigits=1;
 try{
  await db.query("BEGIN");
  await db.query(
   "INSERT INTO public.max_contact_voice_sessions(call_hash,user_id,provider) VALUES($1,$2,$3) "+
   "ON CONFLICT(call_hash) DO NOTHING",[callHash,uid,provider]);
  const entry=(await db.query(
   "SELECT state,user_id,provider FROM public.max_contact_voice_sessions WHERE call_hash=$1 FOR UPDATE",[callHash])).rows[0];
  if(!entry||entry.user_id!==uid||entry.provider!==provider)throw Error("Call session ownership mismatch");
  s={...initial(),...(entry.state||{})};
  const digit=String(key??"");
  const go=(stage:Stage)=>{s.stage=stage;s.message="";};
  if(digit==="*"){
   if(s.stage==="root")exit=true;
   else if(s.stage==="browse"||s.stage==="sort"||s.stage==="more"||s.stage==="create_phone")go("root");
   else if(s.stage==="contact"||s.stage==="search")go("browse");
   else if(s.stage==="history"||s.stage==="edit"||s.stage==="archive_confirm"||s.stage==="scope")go("contact");
   else if(s.stage==="search_calendar"||s.stage==="search_input")go("search");
   else if(s.stage==="create_name"||s.stage==="create_address")go("root");
   else go("edit");
  }else if(key!==undefined){
   if(s.stage==="root"){
    if(digit==="1")go("sort");
    else if(digit==="2")go("create_phone");
    else if(digit==="3")go("search");
    else if(digit==="9")go("more");
    else{
     const opts:{[k:string]:Category}={"4":"eligible","5":"callbacks","6":"pledge_pending","7":"warm","8":"do_not_call"};
     if(opts[digit])s=resetList(s,opts[digit]);
    }
   }else if(s.stage==="sort"){
    if(digit==="1"||digit==="2"){s.sort=digit==="1"?"DESC":"ASC";s=resetList(s,"all");}
   }else if(s.stage==="more"){
    if(/^[1-9]$/.test(digit))s=resetList(s,categories[Number(digit)-1]);
   }else if(s.stage==="browse"){
    const rows=await records(db,uid,s);
    if(digit==="#"||digit==="None")s.index=Math.min(Math.max(0,rows.length-1),s.index+1);
    else if(digit==="9")s.index=Math.max(0,s.index-1);
    else if(digit==="1")go("search");
    else if(digit==="2"){
     const item=rows[s.index];if(item){s.ref=Number(item.contact_ref);go("contact");}
    }
   }else if(s.stage==="contact"){
    if(digit==="1")go("edit");
    else if(digit==="2"){s.historyIndex=0;go("history");}
    else if(digit==="3")go("archive_confirm");
   }else if(s.stage==="history"){
    const c=await selected(db,uid,s);
    const count=c?(await db.query(
     "SELECT count(*)::int AS n FROM public.max_contact_call_events WHERE user_id=$1 AND contact_id=$2",[uid,c.id])).rows[0]?.n:0;
    if(digit==="#"||digit==="None")s.historyIndex=Math.min(Math.max(0,count-1),s.historyIndex+1);
    else if(digit==="9")s.historyIndex=Math.max(0,s.historyIndex-1);
   }else if(s.stage==="archive_confirm"){
    if(digit==="1"){
     const c=await selected(db,uid,s);
     if(c)await db.query("UPDATE public.communication_contacts SET archived_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2",[c.id,uid]);
     s=resetList(s,s.category);s.message="קאנטאקט ארויסגענומען; קאל־היסטאריע און פינאנץ בלייבן.";
    }else if(digit==="2")go("contact");
   }else if(s.stage==="search"){
    if(digit==="1"){s.searchKind="phone";go("search_input");}
    if(digit==="2"){s.searchKind="date";go("search_calendar");}
    if(digit==="3"){s.searchKind="id";go("search_input");}
   }else if(s.stage==="search_calendar"){
    if(digit==="1"||digit==="2"){s.dateSystem=digit==="1"?"gregorian":"hebrew";go("search_input");}
   }else if(s.stage==="search_input"){
    const ok=s.searchKind==="phone"?!!phone(digit):
     s.searchKind==="id"?/^[1-9]\d{0,8}$/.test(digit):
     /^\d{8}$/.test(digit)&&!!(s.dateSystem==="hebrew"?
        olamHebrewToCivil(Number(digit.slice(0,4)),Number(digit.slice(4,6)),Number(digit.slice(6,8))):date8(digit));
    if(ok){s.searchValue=digit;s.index=0;go("browse");}
    else s.message="זוך־נומער אדער דאטום נישט גילטיג.";
   }else if(s.stage==="edit"){
    if(digit==="2")go("edit_phone");
    else if(digit==="3")go("edit_name");
    else if(digit==="4")go("edit_address");
    else if(digit==="8")go("scope");
    else if(digit==="1")go("edit_name");
    else s.message="דעם פעלד קען מען דערווייל פארענדיקן אינעם זעלבן וועב־קאנטאקט.";
   }else if(s.stage==="edit_phone"){
    const p=phone(digit),c=await selected(db,uid,s);
    if(p&&c){await db.query("UPDATE public.communication_contacts SET phone=$1,updated_at=now() WHERE user_id=$2 AND id=$3",[p,uid,c.id]);go("contact");s.message="דער נומער איז געענדערט.";}
    else s.message="גיט אריין א ריכטיגן טעלעפאן־נומער.";
   }else if(s.stage==="create_phone"){
    const p=phone(digit);if(!p){s.message="לייג אריין צען ציפערן."; }
    else{
     const row=(await db.query(
      "SELECT id,contact_ref FROM public.communication_contacts WHERE user_id=$1 AND public.olam_max_phone_equal(phone,$2) LIMIT 1",[uid,p])).rows[0];
     const c=row||(await db.query("INSERT INTO public.communication_contacts(user_id,name,phone) VALUES($1,'',$2) RETURNING id,contact_ref",[uid,p])).rows[0];
     s.ref=Number(c.contact_ref);s.phone=p;go("create_name");
    }
   }else if(s.stage==="create_name"){
    if(digit==="#"||digit==="None"){go("create_address");s.message="נאמען איבערגעהיפט.";}
    else s.message="נאמען קען ווערן רעקארדירט אדער אריינגעלייגט אינעם וועב־קאנטאקט.";
   }else if(s.stage==="create_address"){
    if(digit==="#"||digit==="None"){go("contact");s.message="אדרעס איבערגעהיפט.";}
    else s.message="אדרעס קען ווערן רעקארדירט אדער אריינגעלייגט אינעם וועב־קאנטאקט.";
   }else if(s.stage==="scope"){
    const options:{[key:string]:State["scope"]}={"1":"person","2":"same_purpose","3":"new_purpose"};
    if(options[digit]){s.scope=options[digit];go("months");}
   }else if(s.stage==="months"){
    const n=Number(digit),c=await selected(db,uid,s);
    if(Number.isInteger(n)&&n>=1&&n<=120&&c){
     await db.query("INSERT INTO public.max_contact_recontact_plans(user_id,contact_id,scope,purpose_type,purpose_key,interval_months,next_allowed_at) "+
      "VALUES($1,$2,$3,'none','',$4,now()+make_interval(months=>$4)) "+
      "ON CONFLICT(user_id,contact_id,scope,purpose_type,purpose_key) DO UPDATE SET interval_months=EXCLUDED.interval_months,next_allowed_at=EXCLUDED.next_allowed_at,updated_at=now()",[uid,c.id,s.scope,n]);
     go("contact");s.message="צוריקצורופן נאך "+n+" חדשים איז אפגעהיטן.";
    }else s.message="קלויבט א צאל פון איין ביז הונדערט און צוואנציג.";
   }
  }
  await db.query("UPDATE public.max_contact_voice_sessions SET state=$2::jsonb,updated_at=now() WHERE call_hash=$1",[callHash,JSON.stringify(s)]);
  let prompt=s.message?s.message+" ":"";
  if(exit)prompt+="צוריק צום וועלט־מעניו.";
  else if(s.stage==="root")prompt+="קאנטאקטס. ליסטע 1. נייע קאנטאקט 2. זוכן 3. מען קען שוין רופן 4. נדבה־צוריקצורופן 5. אפענע התחייבותן 6. ווארעמע קאנטאקטן 7. נישט רופן 8. אנדערע קאטעגאריעס 9. שטערנדל צוריק.";
  else if(s.stage==="sort")prompt+="פון ניי צו אלט דרוקט 1. פון אלט צו ניי דרוקט 2.";
  else if(s.stage==="more")prompt+=categories.map((x,i)=>names[x]+" דרוקט "+(i+1)).join(". ")+". שטערנדל צוריק.";
  else if(s.stage==="browse"){
   const rows=await records(db,uid,s),c=rows[s.index];
   prompt+=names[s.category]+". "+rows.length+" קאנטאקטן. "+(c?"קאנטאקט "+c.contact_ref+" "+(c.name||"אן א נאמען")+" נומער "+c.phone.split("").join(" ")+".":"קיין קאנטאקטן נישט געפונען.")+
     " ווארט אויפן ליין פאר דער ליסטע. פאר זוך אפציעס דרוקט 1. פאר דעם קאנטאקט דרוקט 2. נעקסטער שארף, פריערדיגער 9, שטערנדל צוריק.";
  }else if(s.stage==="contact"){
   const c=await selected(db,uid,s);
   prompt+=(c?"קאנטאקט "+c.contact_ref+" "+(c.name||"אן א נאמען")+" נומער "+c.phone.split("").join(" ")+". ":"קאנטאקט נישט געפונען. ")+
     "צו עדיטירן דרוקט 1. צו הערן אלע קאל־סטאטוסן דרוקט 2. צו ארויסנעמען דעם קאנטאקט דרוקט 3. שטערנדל צוריק.";
  }else if(s.stage==="history"){
   const c=await selected(db,uid,s);
   const q=c?await db.query("SELECT outcome,recorded_at,details,source,purpose_type FROM public.max_contact_call_events "+
     "WHERE user_id=$1 AND contact_id=$2 ORDER BY recorded_at DESC,id DESC LIMIT 300",[uid,c.id]):{rows:[]};
   const item=q.rows[s.historyIndex];
   prompt+=(item?"קאל־סטאטוס "+(s.historyIndex+1)+" פון "+q.rows.length+". "+(s.historyIndex===0?"איצטיגער סטאטוס. ":"פריערדיגער סטאטוס. ")+
     (results[item.outcome]||"נישט אריינגעלייגט")+". "+new Date(item.recorded_at).toLocaleDateString("en-US",{timeZone:"America/New_York"})+".":"קיין סטאטוסן נישט געפונען.")+
     " שארף פאר נעקסטן, 9 פאר פריערדיגן, שטערנדל צוריק.";
  }else if(s.stage==="archive_confirm")prompt+="אויסנעמען נאר דעם קאנטאקט פון דער ליסטע? קאל־היסטאריע בלייבט. באשטעטיגן 1, אפברעכן 2.";
  else if(s.stage==="search")prompt+="זוכן לויט טעלעפאן־נומער דרוקט 1. לויט דאטום דרוקט 2. לויט קאנטאקט איי־די דרוקט 3.";
  else if(s.stage==="search_calendar")prompt+="דאטום למספרם דרוקט 1. אידישע דאטום דרוקט 2.";
  else if(s.stage==="search_input"){mode="digits";maxDigits=s.searchKind==="phone"?11:s.searchKind==="date"?8:9;prompt+="גיט אריין "+(s.searchKind==="phone"?"טעלעפאן־נומער":s.searchKind==="id"?"קאנטאקט איי־די":"אכט ציפערן יאר חודש טאג")+" און דרוקט שארף.";}
  else if(s.stage==="edit")prompt+="אלע פעלדער 1. טעלעפאן 2. נאמען 3. אדרעס 4. אימעיל 5. נאטעס 6. נישט רופן 7. צוריקצורופן־כלל 8. שטערנדל צוריק.";
  else if(s.stage==="edit_phone"){mode="digits";maxDigits=11;prompt+="נייער טעלעפאן נומער און דרוקט שארף.";}
  else if(s.stage==="edit_name"||s.stage==="create_name"){mode="record";prompt+="ביטע זאגט דעם נאמען; צו סקיפן דרוקט שארף. אן באשטעטיגטע טראנסקריפציע טוישן מיר נישט דעם אפגעהיטענעם נאמען.";}
  else if(s.stage==="edit_address"||s.stage==="create_address"){mode="record";prompt+="ביטע זאגט דעם אדרעס; צו סקיפן דרוקט שארף. אן באשטעטיגטע טראנסקריפציע טוישן מיר נישט דעם אפגעהיטענעם אדרעס.";}
  else if(s.stage==="create_phone"){mode="digits";maxDigits=11;prompt+="לייגט אריין דעם טעלעפאן־נומער און דרוקט שארף.";}
  else if(s.stage==="scope")prompt+="צו דעם מענטש בכלל דרוקט 1. פארן זעלבן צוועק 2. פאר אן אנדערן צוועק 3.";
  else if(s.stage==="months"){mode="digits";maxDigits=3;prompt+="נאכן וויפיל חדשים מעג מען ווידער רופן? לייגט אריין פון 1 ביז 120 און דרוקט שארף.";}
  await db.query("COMMIT");
  return{speech:prompt,mode,maxDigits,finishOnKey:mode==="menu"?"":"#",exitToParent:exit,state:s};
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}finally{db.release();}
}
