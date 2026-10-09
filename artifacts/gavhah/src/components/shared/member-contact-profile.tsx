import { useEffect,useState } from "react";
import { ContactMethodPicker, initialContactMethods, type ContactMethodsForm } from "@/components/shared/contact-method-picker";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, ShieldCheck } from "lucide-react";

export function MemberContactProfile(){
  const {user,isAuthenticated}=useAuth(),{lang}=useLanguage(),yi=lang==="yi",{toast}=useToast();
  const [purpose,setPurpose]=useState<"volunteer"|"help">("volunteer");
  const [form,setForm]=useState<ContactMethodsForm>(initialContactMethods);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!isAuthenticated){setLoading(false);return;}
    let active=true;setLoading(true);
    fetch(`/api/me/contact-methods/${purpose}`,{credentials:"include",cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error("Could not load contact methods");return r.json();})
      .then(data=>{if(active)setForm(data.methods||initialContactMethods());})
      .catch(error=>{if(active)toast({title:String(error),variant:"destructive"});})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[purpose,isAuthenticated,user?.id]);
  const save=async()=>{
    if(!form.primaryValue.trim()||(form.backupMethod&&!form.backupValue?.trim()))return;
    if(!window.confirm(yi
      ?"דאס קען אפשטעלן שוין אפראוועטע פארבינדונגען ביז ביידע צדדים באשטעטיגן ווידער. ווייטער?"
      :"Changing these details may pause existing introductions until both people approve again. Continue?"))return;
    setBusy(true);
    try{
      const r=await fetch(`/api/me/contact-methods/${purpose}`,{
        method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(form),
      });
      if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"Could not update contact methods");}
      toast({title:yi?"דער קאנטאקט איז אפגעהיטן":"Private contact preferences saved"});
    }catch(e){toast({title:e instanceof Error?e.message:String(e),variant:"destructive"});}
    finally{setBusy(false);}
  };
  if(!isAuthenticated)return null;
  return <section className="border rounded-xl bg-card p-4 sm:p-6 space-y-4" dir={yi?"rtl":"ltr"}>
    <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
      <ShieldCheck className="h-5 w-5"/>
      {yi?"מיינע פריוואטע קאנטאקט־אויסוואלן":"My Private Contact Preferences"}
    </h2>
    <p className="text-xs text-muted-foreground">
      {yi?"די קאנטאקט־פראנט איז פארקניפט מיט דיר אלס עסקן אדער אלס הילף־בעטער. קיין נומער אדער אימעיל ווערט נישט ארויסגעגעבן אן באשטעטיגונג פון דיר און דער צווייטער צד."
        :"Maintain separate contact methods for volunteering or asking for help. Details are never released without personal approval from BOTH people."}
    </p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={purpose==="volunteer"?"default":"outline"}
        onClick={()=>setPurpose("volunteer")}>{yi?"איך העלף אנדערע":"I volunteer"}</Button>
      <Button type="button" variant={purpose==="help"?"default":"outline"}
        onClick={()=>setPurpose("help")}>{yi?"איך בעט הילף":"I request help"}</Button>
    </div>
    {loading?<p className="text-sm">{yi?"לאדנט...":"Loading..."}</p>:<>
      <ContactMethodPicker value={form} onChange={setForm}/>
      <Button disabled={busy||!form.primaryValue.trim()||(!!form.backupMethod&&!form.backupValue?.trim())}
        onClick={()=>void save()}>
        <Save className="h-4 w-4 me-2"/>{yi?"היט אפ מיין קאנטאקט":"Save Contact Preferences"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {yi?"באשטעטיגטע פארבינדונגען ווערן פריש איבערגעקוקט אויב דו טוישסט דיין קאנטאקט. א בעק־אפ איז נישט פארלאנגט.":
          "Changing contact details pauses open introductions until both parties agree again. Backup is never required."}
      </p>
    </>}
  </section>;
}
