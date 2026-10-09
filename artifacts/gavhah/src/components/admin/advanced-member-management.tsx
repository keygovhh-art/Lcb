import { useEffect, useState } from "react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, RefreshCcw, Search, ShieldAlert, Users } from "lucide-react";

type MemberAddress = {
  recipient:string;addressLine1:string;addressLine2:string|null;city:string;
  state:string;postalCode:string;country:string;uspsConsent:boolean;
  consentAt:string|null;mailingHold:boolean;adminNote:string|null;
};
type MemberRecord = {
  id:number; name:string; nickname:string|null; email:string|null; phone:string|null;
  role:string;status:string;location:string|null;createdAt:string;
  mailStatus:"no_address"|"do_not_send"|"permission_yes"|"on_hold";
  address:MemberAddress|null;
};
const STATUS_LABELS: Record<MemberRecord["mailStatus"],[string,string]> = {
  no_address:["קיין אדרעס","No address"],
  do_not_send:["נישט שיקן","DO NOT SEND"],
  permission_yes:["יא — USPS־רשות","YES — USPS permitted"],
  on_hold:["אפגעשטעלט דורך אדמין","ADMIN HOLD"],
};
export function AdvancedMemberManagement() {
  const {lang}=useLanguage(), yi=lang==="yi";
  const {toast}=useToast();
  const [items,setItems]=useState<MemberRecord[]>([]);
  const [counts,setCounts]=useState({total:0,permissionYes:0,doNotSend:0,noAddress:0,onHold:0});
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [roleFilter,setRoleFilter]=useState("all");
  const [accountFilter,setAccountFilter]=useState("all");
  const [open,setOpen]=useState<number|null>(null);
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState<number|null>(null);
  const load=async()=>{
    setLoading(true);
    try {
      const p=new URLSearchParams({search,mailStatus:filter});
      const r=await fetch("/api/admin/members/mailing?"+p.toString(),{credentials:"include",cache:"no-store"});
      if(!r.ok)throw Error("Could not access member mailing records");
      const data=await r.json();
      setItems(data.items||[]);setCounts(data.counts);
      setNotes(prev=>{const copy={...prev};for(const m of data.items||[])if(copy[m.id]===undefined)copy[m.id]=m.address?.adminNote||"";return copy;});
    }catch(err){toast({title:err instanceof Error?err.message:"Could not load members",variant:"destructive"});}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[filter]);
  const save=async(item:MemberRecord, hold:boolean)=>{
    setBusy(item.id);
    try{
      const r=await fetch(`/api/admin/members/${item.id}/mailing`,{
        method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mailingHold:hold,adminNote:notes[item.id]||""}),
      });
      if(!r.ok){const error=await r.json().catch(()=>({}));throw Error(error.error||"Could not save");}
      toast({title:yi?"אדמין־איינשטעלונג אפגעהיטן":"Administrative mailing setting saved"});
      await load();
    }catch(error){toast({title:String(error),variant:"destructive"});}
    finally{setBusy(null);}
  };
  const safeCount=(n:number)=>Number.isFinite(n)?n:0;
  const displayed = items.filter(member =>
    (roleFilter==="all" || member.role===roleFilter) &&
    (accountFilter==="all" || member.status===accountFilter)
  );
  return <section className="space-y-5" dir={yi?"rtl":"ltr"}>
    <div>
      <h2 className="flex gap-2 items-center font-semibold text-2xl text-primary"><Users className="h-6 w-6"/>
        {yi?"פארגעשריטענע מעמבער־פארוואלטונג":"Advanced Member Management"}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        {yi?"אלע מעמבערס, פריוואטע היים־אדרעסן און זייער גענויע USPS־רשות. נאר מעמבערס אליין קענען געבן רשות; אדמין קען אפשטעלן דאס שיקן.":
          "Member registry and private postal permissions. Only members can grant USPS permission; staff can place a mailing hold."}
      </p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        [yi?"אלע מעמבערס":"Members",counts.total],
        [yi?"יא, שיקן ערלויבט":"YES permitted",counts.permissionYes],
        [yi?"נישט שיקן":"DO NOT SEND",counts.doNotSend],
        [yi?"קיין אדרעס":"No address",counts.noAddress],
        [yi?"אדמין אפשטעל":"On hold",counts.onHold],
      ].map(([label,value],i)=><div key={i} className="border rounded-lg p-3 bg-card">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-xl mt-2">{safeCount(Number(value))}</p>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[12rem]">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
        <Input placeholder={yi?"זוך נאמען, אימעיל, נומער אדער מעמבער־איי־די":"Search name, email, phone or member ID"}
          value={search} onChange={e=>setSearch(e.target.value)} className="pl-9"
          onKeyDown={e=>{if(e.key==="Enter")void load();}}/>
      </div>
      <select value={filter} onChange={e=>setFilter(e.target.value)}
        className="h-10 border rounded-md px-2 bg-background">
        <option value="all">{yi?"אלע":"All"}</option>
        {Object.entries(STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label[yi?0:1]}</option>)}
      </select>
      <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}
        className="h-10 border rounded-md px-2 bg-background">
        <option value="all">{yi?"אלע ראלעס":"All roles"}</option>
        {["member","moderator","admin","super_admin","group_owner"].map(role=><option key={role} value={role}>{role}</option>)}
      </select>
      <select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}
        className="h-10 border rounded-md px-2 bg-background">
        <option value="all">{yi?"אלע אקאונט־מצבים":"All account statuses"}</option>
        {["active","suspended","banned"].map(status=><option key={status} value={status}>{status}</option>)}
      </select>
      <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCcw className="h-4 w-4"/></Button>
    </div>
    {loading?<p className="border rounded-xl p-8">{yi?"לאדנט מעמבערס...":"Loading members..."}</p>:
      displayed.length===0?<p className="border rounded-xl p-8 text-muted-foreground">{yi?"קיינער נישט געפונען":"No members match"}</p>:
      <div className="space-y-2">
        {displayed.map(member=><article key={member.id} className="border rounded-xl bg-card p-4 space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div>
              <p className="font-semibold">{member.nickname||member.name} <span className="text-xs text-muted-foreground">#{member.id}</span></p>
              <p className="text-xs text-muted-foreground break-all">{member.email||member.phone||"—"}</p>
              <p className="text-xs text-muted-foreground">{member.role} · {member.status} · {new Date(member.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={member.mailStatus==="permission_yes"?"default":"secondary"}>
                {STATUS_LABELS[member.mailStatus][yi?0:1]}
              </Badge>
              <Button variant="outline" size="sm" onClick={()=>setOpen(open===member.id?null:member.id)}>
                {open===member.id?(yi?"צומאכן":"Close"):(yi?"זע פרטים און פארוואלט":"Details / Manage")}
              </Button>
            </div>
          </div>
          {open===member.id&&<div className="mt-3 pt-3 border-t space-y-3">
            {member.address?<div className="space-y-2">
              <div className="text-sm leading-relaxed whitespace-pre-line border rounded-lg p-3 bg-muted/20" dir="ltr">
                {[
                  member.address.recipient,member.address.addressLine1,
                  member.address.addressLine2,
                  [member.address.city,member.address.state,member.address.postalCode].filter(Boolean).join(", "),
                  member.address.country,
                ].filter(Boolean).join("\n")}
              </div>
              <p className="text-xs text-muted-foreground">
                {yi?"מעמבער האט USPS־רשות געגעבן: ":"Member consent: "}
                <strong>{member.address.uspsConsent?(yi?"יא":"Yes"):(yi?"ניין — נישט שיקן":"NO — do not send")}</strong>
                {member.address.consentAt && " · "+new Date(member.address.consentAt).toLocaleString()}
              </p>
              <label className="block space-y-1">
                <span className="text-sm">{yi?"אינערליכע אדמין־נאטיץ":"Private staff note"}</span>
                <Textarea value={notes[member.id]||""} rows={2}
                  onChange={e=>setNotes(prev=>({...prev,[member.id]:e.target.value}))}/>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy!==null} onClick={()=>void save(member,member.address!.mailingHold)}>
                  <Check className="h-4 w-4 me-1"/>{yi?"היט אפ נאטיץ":"Save staff note"}
                </Button>
                <Button variant="outline" disabled={busy!==null} onClick={()=>void save(member,!member.address!.mailingHold)}>
                  <ShieldAlert className="h-4 w-4 me-1"/>
                  {member.address.mailingHold?(yi?"נעם אראפ אדמין־אפשטעל":"Release administrative hold"):
                    (yi?"שטעל אפ דאס שיקן":"Place DO NOT MAIL hold")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {yi?"וויכטיג: אראפנעמען אן אדמין־אפשטעל טוישט נישט דעם מעמבערס 'ניין' צו 'יא'.":
                  "Removing a staff hold never overrides a member's 'No' permission."}
              </p>
            </div>:
              <p className="text-sm text-muted-foreground">
                {yi?"דאס מעמבער האט נישט אריינגעשריבן קיין היים־אדרעס. מ'טאר נישט שיקן פאסט.":
                  "No home mailing address was supplied. Do not send postal mail."}
              </p>}
          </div>}
        </article>)}
      </div>}
  </section>;
}
