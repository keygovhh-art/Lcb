import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { defaultGateDesign, GateWelcome, type GateDesign, type MemberGateSection } from "@/components/shared/member-gate";
import { useLanguage } from "@/context/language-context";
import { Eye, Paintbrush, Save, Send, Lock } from "lucide-react";

const SECTIONS: Array<{ key: MemberGateSection; en: string; yi: string }> = [
  { key:"forum",en:"Askanim Forum",yi:"עסקנים פארום" },
  { key:"volunteer",en:"Become a Volunteer",yi:"ווערן אן עסקן" },
  { key:"help",en:"Request Help",yi:"בעטן הילף" },
  { key:"projects",en:"Community Projects",yi:"קהילה פראיעקטן" },
  { key:"groups",en:"Member Groups",yi:"גרופעס" },
  { key:"connections",en:"Member Connections",yi:"פארבינדונגען" },
  { key:"communications",en:"Communications",yi:"קאמוניקאציע" },
  { key:"minyans",en:"Minyan Directory",yi:"מנינים" },
  { key:"united",en:"United In Kindness",yi:"אחדות און חסד" },
  { key:"profile",en:"My Profile",yi:"מיין פראפיל" },
  { key:"general",en:"Other Membership Gates",yi:"אנדערע מעמבערשיפ־טויערן" },
];
type GateResponse = { fallback:GateDesign; draft:GateDesign|null; published:GateDesign|null; publishedAt:string|null };
export function MembershipGateManagement() {
  const { toast } = useToast();
  const { lang: appLang } = useLanguage();
  const yi = appLang === "yi";
  const [section,setSection] = useState<MemberGateSection>("forum");
  const [lang,setLang] = useState<"yi"|"en">("yi");
  const [design,setDesign] = useState<GateDesign>(()=>defaultGateDesign("forum","yi"));
  const [published,setPublished] = useState<GateDesign|null>(null);
  const [publishedAt,setPublishedAt] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [dirty,setDirty] = useState(false);
  useEffect(()=>{
    let active=true;
    setLoading(true);setDirty(false);
    fetch(`/api/admin/membership-gates/${section}/${lang}`,{credentials:"include",cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error("Could not load membership design");return r.json() as Promise<GateResponse>;})
      .then(data=>{if(!active)return;setDesign(data.draft||data.published||data.fallback);setPublished(data.published);setPublishedAt(data.publishedAt);})
      .catch(error=>{if(active){setDesign(defaultGateDesign(section,lang));toast({title:String(error),variant:"destructive"});}})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false};
  },[section,lang]);
  const update=<K extends keyof GateDesign>(key:K,value:GateDesign[K])=>{
    setDesign(prev=>({...prev,[key]:value}));setDirty(true);
  };
  const save=async(publishNow=false)=>{
    setBusy(true);
    try{
      const path=`/api/admin/membership-gates/${section}/${lang}`;
      const res=await fetch(path,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(design)});
      if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.error||"Could not save draft");}
      if(publishNow){
        if(!window.confirm(yi?"די ברוכים־הבאים־בלאט וועט ווערן אויטאמאטיש פאר אלע נייע באזוכער ווען די סיסטעם איז שוין לייוו. ווייטער?":"Publish this welcome page to visitors after deployment?"))return;
        const publishedResult=await fetch(path+"/publish",{method:"POST",credentials:"include"});
        if(!publishedResult.ok)throw Error("Could not publish gate design");
        setPublished(design);setPublishedAt(new Date().toISOString());
      }
      setDirty(false);
      toast({title:publishNow?(yi?"ברוכים־הבאים־בלאט פובלישירט":"Gate page published"):(yi?"דראפט אפגעהיטן — נישט פובלישירט":"Draft saved — not published")});
    }catch(error){toast({title:error instanceof Error?error.message:"Failed to save",variant:"destructive"});}
    finally{setBusy(false);}
  };
  const field=(key:keyof Pick<GateDesign,"title"|"subtitle"|"body"|"footnote"|"joinText"|"signInText"|"imageUrl">,
    label:string,long=false)=>(
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {long?
        <Textarea rows={key==="body"?5:2} value={String(design[key])}
          onChange={e=>update(key,e.target.value)} dir={lang==="yi"?"rtl":"ltr"}/>:
        <Input value={String(design[key])} onChange={e=>update(key,e.target.value)}
          dir={lang==="yi"?"rtl":"ltr"}/>}
    </div>
  );
  return <section className="space-y-5" dir={yi?"rtl":"ltr"}>
    <div>
      <h2 className="text-2xl font-semibold text-primary flex items-center gap-2"><Paintbrush className="h-6 w-6"/>
        {yi?"ברוכים־הבאים־בלעטער — באזונדער פאר יעדע אפטיילונג":"Membership Welcome Page Designer"}
      </h2>
      <p className="text-sm text-muted-foreground mt-2">
        {yi?"שטעל אויס דעם טעקסט און אויסזען פאר יעדע אפטיילונג און שפראך באזונדער. 'דראפט אפהיטן' טוישט גארנישט פאר די באזוכער.":
          "Customize each section and language independently. Saving a draft never changes the visitor's current page."}
      </p>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="space-y-1"><span className="text-sm">{yi?"אפטיילונג":"Section"}</span>
        <select value={section} onChange={e=>{if(dirty&&!window.confirm("Discard unsaved changes?"))return;setSection(e.target.value as MemberGateSection);}}
          className="w-full h-10 border rounded-md bg-background px-3">
          {SECTIONS.map(item=><option key={item.key} value={item.key}>{yi?item.yi:item.en}</option>)}
        </select>
      </label>
      <label className="space-y-1"><span className="text-sm">{yi?"שפראך":"Language"}</span>
        <select value={lang} onChange={e=>{if(dirty&&!window.confirm("Discard unsaved changes?"))return;setLang(e.target.value as "en"|"yi");}}
          className="w-full h-10 border rounded-md bg-background px-3">
          <option value="yi">אידיש</option><option value="en">English</option>
        </select>
      </label>
    </div>
    {loading?<p className="p-8 border rounded-lg">{yi?"לאדנט...":"Loading..."}</p>:<>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-4 border rounded-xl p-4">
          {field("title",yi?"הויפט־טיטל":"Main heading")}
          {field("subtitle",yi?"אונטער־טיטל":"Subtitle")}
          {field("body",yi?"דערקלערונג":"Welcome message",true)}
          {field("footnote",yi?"קליינע באמערקונג אונטן":"Footer note",true)}
          {field("joinText",yi?"טעקסט אויפן 'ווערן מעמבער' קנעפל":"Join button text")}
          {field("signInText",yi?"טעקסט אויפן 'אריינלאגן' קנעפל":"Sign-in button text")}
          {field("imageUrl",yi?"בילד־לינק (אפטשענעל, https)":"Optional HTTPS image URL")}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-sm">{yi?"קאלירן":"Colors"}</span>
              <select className="w-full h-10 rounded-md border bg-background px-2"
                value={design.theme} onChange={e=>update("theme",e.target.value as GateDesign["theme"])}>
                <option value="warm">{yi?"ווארעם":"Warm"}</option>
                <option value="gold">{yi?"גאלד":"Gold"}</option>
                <option value="blue">{yi?"בלוי":"Blue"}</option>
                <option value="plain">{yi?"פשוט":"Plain"}</option>
              </select></label>
            <label className="space-y-1"><span className="text-sm">{yi?"אויסשטעל":"Layout"}</span>
              <select className="w-full h-10 rounded-md border bg-background px-2"
                value={design.layout} onChange={e=>update("layout",e.target.value as GateDesign["layout"])}>
                <option value="centered">{yi?"צענטרירט":"Centered"}</option>
                <option value="split">{yi?"בילד אין זייט":"Side image"}</option>
                <option value="minimal">{yi?"מינימאל":"Minimal"}</option>
              </select></label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={design.showIcon} onChange={e=>update("showIcon",e.target.checked)} />
            {yi?"ווייזן די מעמבערשיפ־אייקאן":"Show membership icon"}
          </label>
        </div>
        <div className="space-y-3">
          <h3 className="flex gap-2 items-center text-sm font-semibold"><Eye className="h-4 w-4" />{yi?"לייוו־פאראויסקוק (נאר פאר דיר)":"Private preview"}</h3>
          <GateWelcome design={design} preview returnTo={section==="forum"?"/forum":"/directory"} />
          <p className="text-xs text-muted-foreground">{yi?"דער פאראויסקוק איז נאר פאר אדמין. אנדערע מענטשן זעען ביז פובליקירן דעם אלטן אויסשטעל.":"Only the admin sees this preview; visitors still see the old design until publication."}</p>
          {publishedAt&&<p className="text-xs text-muted-foreground flex gap-1"><Lock className="h-3.5 w-3.5"/>{yi?"לעצטע פובליקאציע":"Last published"}: {new Date(publishedAt).toLocaleString()}</p>}
          {published&&!dirty&&<p className="text-xs text-muted-foreground">{yi?"דראפט באזירט אויף דעם לעצטן אויסשטעל":"Current saved/published design loaded"}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy||!design.title||!design.body} onClick={()=>void save(false)}>
          <Save className="h-4 w-4 me-2"/>{yi?"היט אפ א דראפט — נישט פובלישירן":"Save draft — don't publish"}
        </Button>
        <Button variant="outline" disabled={busy||!design.title||!design.body} onClick={()=>void save(true)}>
          <Send className="h-4 w-4 me-2"/>{yi?"פובלישיר בלויז דעם אויסשטעל (שפעטער)":"Publish this page (later)"}
        </Button>
      </div>
    </>}
  </section>;
}
