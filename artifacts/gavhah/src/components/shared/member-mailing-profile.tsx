import { useEffect, useState } from "react";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, ShieldCheck, Trash2, Save } from "lucide-react";

type Address = {recipient:string;addressLine1:string;addressLine2:string;city:string;state:string;postalCode:string;country:string};
const EMPTY:Address={recipient:"",addressLine1:"",addressLine2:"",city:"",state:"",postalCode:"",country:"US"};
export function MemberMailingProfile() {
  const {user,isAuthenticated}=useAuth(),{lang}=useLanguage(),yi=lang==="yi",{toast}=useToast();
  const [address,setAddress]=useState<Address>(EMPTY);
  const [exists,setExists]=useState(false),[permission,setPermission]=useState<"yes"|"no">("no");
  const [status,setStatus]=useState("no_address"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!isAuthenticated){setLoading(false);return;}
    let active=true;
    fetch("/api/me/mailing-address",{credentials:"include",cache:"no-store"})
      .then(r=>r.ok?r.json():Promise.reject(new Error("Could not load address")))
      .then(data=>{if(!active)return;setStatus(data.status);setExists(!!data.address);
        if(data.address){setAddress({
          recipient:data.address.recipient||"",addressLine1:data.address.addressLine1||"",
          addressLine2:data.address.addressLine2||"",city:data.address.city||"",
          state:data.address.state||"",postalCode:data.address.postalCode||"",country:"US",
        });setPermission(data.address.uspsConsent?"yes":"no");}
      }).catch(()=>{if(active)toast({title:yi?"נישט געקענט לאדן היים־אדרעס":"Could not load postal address",variant:"destructive"});})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[isAuthenticated,user?.id,lang]);
  const set=(key:keyof Address)=>(value:string)=>setAddress(a=>({...a,[key]:value}));
  const valid=Boolean(address.recipient.trim()&&address.addressLine1.trim()&&address.city.trim()&&address.state.trim()&&address.postalCode.trim());
  const save=async()=>{
    if(!valid)return;
    if(permission==="yes"&&!window.confirm(yi
      ?"איך געב בפירוש רשות פאר דער מערכת צו שיקן USPS־פאסט צו דער איצטיגער אדרעס. ווייטער?"
      :"I explicitly authorize USPS mail to this current address. Continue?"))return;
    setBusy(true);
    try{
      const r=await fetch("/api/me/mailing-address",{
        method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...address,uspsConsent:permission==="yes",confirmNewAddressConsent:permission==="yes"}),
      });
      if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"Could not save address");}
      const result=await r.json();setStatus(result.status);setExists(true);
      toast({title:yi?"די אדרעס און רשות זענען אפגעהיטן":"Mailing address and permission saved"});
    }catch(error){toast({title:String(error),variant:"destructive"});}
    finally{setBusy(false);}
  };
  const remove=async()=>{
    if(!window.confirm(yi?"ביסטו זיכער? דאס מעקט די אדרעס און לייגט דיך אויף 'נישט שיקן'.":
      "Delete the stored address and withdraw postal permission?"))return;
    setBusy(true);
    try{
      const r=await fetch("/api/me/mailing-address",{method:"DELETE",credentials:"include"});
      if(!r.ok)throw Error("Could not delete address");
      setAddress(EMPTY);setExists(false);setPermission("no");setStatus("no_address");
      toast({title:yi?"די אדרעס איז געמעקט":"Address deleted"});
    }catch(error){toast({title:String(error),variant:"destructive"});}
    finally{setBusy(false);}
  };
  if(!isAuthenticated)return null;
  const f=(key:keyof Address,label:string,auto?:string)=><div className="space-y-1">
    <Label>{label}</Label><Input value={address[key]} onChange={e=>set(key)(e.target.value)} autoComplete={auto}/>
  </div>;
  return <section className="border rounded-xl p-4 sm:p-6 bg-card space-y-4">
    <h2 className="font-semibold text-xl text-primary flex items-center gap-2"><Mail className="h-5 w-5"/>
      {yi?"מיין פריוואטע היים־אדרעס און USPS־רשות":"My Private Mailing Address & USPS Consent"}
    </h2>
    <p className="text-xs text-muted-foreground">
      {yi?"אלעס אפטיאָנעל. די אדרעס איז נישט עפנטליך. דו קענסט שפעטער טוישן דיין רשות אדער אויסמעקן דיין אדרעס.":
        "Completely optional and never public. You can change your consent or delete your address later."}
    </p>
    {loading?<p>{yi?"לאדנט...":"Loading..."}</p>:<>
      <p className="rounded-lg border px-3 py-2 text-sm font-medium bg-muted/20">
        {status==="permission_yes"?(yi?"יא — USPS־פאסט ערלויבט":"YES — USPS permitted"):
          status==="on_hold"?(yi?"אדמין האט אפגעשטעלט דאס שיקן":"Admin mailing hold"):
          status==="do_not_send"?(yi?"נישט שיקן":"DO NOT SEND"):
          (yi?"קיין אדרעס אפגעהיטן — נישט שיקן":"No address — do not mail")}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {f("recipient",yi?"נאמען צום שיקן":"Recipient name","name")}
        {f("addressLine1",yi?"גאס און הויז־נומער":"Street address","address-line1")}
        {f("addressLine2",yi?"דירה / סוויט (אפטיאָנעל)":"Apartment (optional)","address-line2")}
        {f("city",yi?"שטאט":"City","address-level2")}
        {f("state",yi?"סטעיט":"State","address-level1")}
        {f("postalCode",yi?"זיפ קאוד":"ZIP code","postal-code")}
      </div>
      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-semibold text-sm px-1">
          {yi?"מעג די מערכת שיקן USPS צו דער אדרעס?" : "May the organization send USPS mail to this address?"}
        </legend>
        <label className="flex gap-2 items-center text-sm">
          <input type="radio" name="profile-usps" checked={permission==="yes"} onChange={()=>setPermission("yes")}/>
          {yi?"יא — איך געב בפירוש רשות":"Yes — I explicitly consent"}
        </label>
        <label className="flex gap-2 items-center text-sm">
          <input type="radio" name="profile-usps" checked={permission==="no"} onChange={()=>setPermission("no")}/>
          {yi?"ניין — היט אפ די אדרעס, אבער נישט שיקן":"No — save address but DO NOT SEND"}
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button onClick={()=>void save()} disabled={busy||!valid}><Save className="h-4 w-4 me-2"/>{yi?"היט אפ":"Save address and permission"}</Button>
        {exists&&<Button variant="outline" onClick={()=>void remove()} disabled={busy}>
          <Trash2 className="h-4 w-4 me-2"/>{yi?"מעק אדרעס":"Delete address"}
        </Button>}
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0"/>
        {yi?"די מערכת קען זען די פריוואטע אדרעס; זי וועט נישט ערשיינען אין דיין פובליק־פראפיל.":
          "Authorized administration can view the private address; it is not part of the public profile."}
      </p>
    </>}
  </section>;
}
