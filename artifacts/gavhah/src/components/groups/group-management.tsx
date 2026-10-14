import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Flag, MessageSquare, Settings, Check, X, RefreshCw } from "lucide-react";

export type GroupOptions = {
  id: number; ownerId: number;
  allowReplies: boolean; replyApproval: boolean; postApproval: boolean;
  membersCanPost: boolean; membersCanReply: boolean; showViewCounts: boolean; allowDownvotes: boolean;
  lockedSettings?:string[];
  allowedCapabilities?:Record<string,boolean>;
};
type Membership = { id:number;userId:number;userName:string;status:string;role:string;protectedByPlatform?:boolean };
type PendingPost = {id:number;content:string;authorName:string;createdAt:string};
type PendingReply = {id:number;postId:number;content:string;authorName:string;createdAt:string};
type Report = {id:number;postId:number;groupId?:number;reason:string;postExcerpt?:string;status:string;createdAt:string};
type PublicSetting="allowReplies"|"replyApproval"|"postApproval"|"membersCanPost"|"membersCanReply"|"showViewCounts"|"allowDownvotes";
const labels:Array<[PublicSetting,string,string]> = [
  ["membersCanPost","מעמבערס מעגן פובלישן פאוסטס","ווען אויסגעלאשן קענען נאר אדמינס פאוסטן"],
  ["postApproval","פאוסטס מוזן אדמין־אפראוועל","נייע מעמבער־פאוסטס בלייבן פריוואט ביז באשטעטיגט"],
  ["allowReplies","דערלויבן רעפלייען","מען קען פארמאכן די רעפליי־אפטיילונג"],
  ["membersCanReply","מעמבערס מעגן רעפלייען","אדמינס קענען נאך אלץ רעפלייען"],
  ["replyApproval","רעפלייען מוזן אדמין־אפראוועל","רעפלייען ווערן נישט עפנטליך ביז באשטעטיגט"],
  ["showViewCounts","ווייזן וויאו־ציילער פארן ציבור","אומבאקאנטע באזוכער ווערן נישט געציילט; נאר איינגעשריבענע"],
  ["allowDownvotes","דערלויבן דאונוואוטס","ציילער נאר פאר גרופ־אדמינס און גבהה־מערכת"],
];
const statuses:Record<string,string> = {
 approved:"אקטיוו",pending:"ווארט אויף אפראוועל",rejected:"נישט באשטעטיגט",
 suspended:"סוספענדירט",removed:"אראפגענומען",
};
export function GroupManagement({group,members,canChangeRoles,staff,refresh}:{
  group:GroupOptions;members:Membership[];canChangeRoles:boolean;staff:boolean;refresh:()=>void;
}) {
  const { toast }=useToast();
  const [options,setOptions]=useState(group);
  const can=(key:string)=>staff||group.allowedCapabilities?.[key]!==false;
  const [saving,setSaving]=useState(false);
  const [nextOwner,setNextOwner]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState<{posts:PendingPost[];replies:PendingReply[]}>({posts:[],replies:[]});
  const [reports,setReports]=useState<Report[]>([]);
  const [staffReports,setStaffReports]=useState<Report[]>([]);
  const [tab,setTab]=useState<"settings"|"members"|"reviews"|"reports"|"staff">("settings");
  useEffect(()=>{setOptions(group);},[group]);
  const load=useCallback(async()=>{
    const calls=[
      can("moderatePosts")?fetch(`/api/groups/${group.id}/moderation`,{credentials:"include",cache:"no-store"}):null,
      can("viewGroupReports")?fetch(`/api/groups/${group.id}/reports`,{credentials:"include",cache:"no-store"}):null,
    ];
    if(staff)calls.push(fetch("/api/admin/group-reports",{credentials:"include",cache:"no-store"}));
    const responses=await Promise.all(calls);
    if(responses[0]&&!responses[0].ok)throw Error("Cannot load review dashboard");
    if(responses[1]&&!responses[1].ok)throw Error("Cannot load reports");
    setPending(responses[0]?await responses[0].json():{posts:[],replies:[]});
    setReports(responses[1]?await responses[1].json():[]);
    if(staff&&responses[2]?.ok)setStaffReports(await responses[2].json());
  },[group.id,staff]);
  useEffect(()=>{void load().catch(()=>{});},[load]);
  const update=async(path:string,data:unknown,method="PATCH")=>{
    setBusy(true);
    try{
      const res=await fetch(path,{method,credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(body.error||"Action failed");
      await load();refresh();
      toast({title:"אויפגעפרישט"});
      return true;
    }catch(e){toast({title:"נישט געלונגען",description:String(e),variant:"destructive"});return false;}
    finally{setBusy(false);}
  };
  const save=async()=>{
    setSaving(true);
    try{
      const fields=Object.fromEntries(labels.filter(([key])=>!group.lockedSettings?.includes(key)).map(([key])=>[key,options[key]]));
      const res=await fetch(`/api/groups/${group.id}`,{method:"PATCH",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(body.error||"Could not save");
      refresh();toast({title:"די גרופ־סעטינגס זענען אפגעהיטן"});
    }catch(e){toast({title:"נישט געלונגען אפצוהיטן",description:String(e),variant:"destructive"});}
    finally{setSaving(false);}
  };
  const buttons: Array<[typeof tab,string,React.ReactNode]>=[
    ...(can("manageGroupSettings")?[["settings","פארגעשריטענע סעטינגס",<Settings className="h-4 w-4"/>] as [typeof tab,string,React.ReactNode]]:[]),
    ["members","מעמבער־פארוואלטונג",<Users className="h-4 w-4"/>],
    ...(can("moderatePosts")?[["reviews",`רעוויאו (${pending.posts.length+pending.replies.length})`,<MessageSquare className="h-4 w-4"/>] as [typeof tab,string,React.ReactNode]]:[]),
    ...(can("viewGroupReports")?[["reports",`גרופ רעפארטס (${reports.filter(r=>r.status==="open").length})`,<Flag className="h-4 w-4"/>] as [typeof tab,string,React.ReactNode]]:[]),
    ...(staff?[["staff","גבהה־מערכת רעפארטס",<Shield className="h-4 w-4"/>] as [typeof tab,string,React.ReactNode]]:[]),
  ];
  return <section className="border rounded-2xl bg-card p-4 sm:p-6 space-y-5" dir="rtl">
    <div className="flex gap-2 items-center justify-between flex-wrap">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-secondary"/>
        <h2 className="font-serif font-bold text-xl">גרופ אדמיניסטראציע־דעשבאורד</h2>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void load()}><RefreshCw className="h-4 w-4 me-2"/>דערפרישן</Button>
    </div>
    <p className="text-sm text-muted-foreground">
      דער גרופ־גרינדער בלייבט דער באשיצטער הויפט־אדמין.
      קיינער קען אים נישט אראפנעמען אדער דעמאטן חוץ דער אפיציעלער גבהה־אדמיניסטראציע.
    </p>
    <div className="flex flex-wrap gap-2">
      {buttons.map(([key,title,icon])=><Button key={key} size="sm"
        variant={tab===key?"default":"outline"} onClick={()=>setTab(key)}
        className="min-h-10 whitespace-normal text-start gap-1">{icon}{title}</Button>)}
    </div>
    {tab==="settings"&&can("manageGroupSettings")&&<div className="space-y-3">
      {labels.map(([key,title,description])=><label key={key} className="flex gap-3 items-start rounded-xl border p-3 cursor-pointer">
        <input type="checkbox" className="accent-primary h-5 w-5 shrink-0 mt-0.5"
          checked={Boolean(options[key])} disabled={group.lockedSettings?.includes(key)}
          onChange={e=>setOptions(old=>({...old,[key]:e.target.checked}))}/>
        <span><span className="font-semibold text-sm block">{title}{group.lockedSettings?.includes(key)?" · גבהה־קאנטראלירט":""}</span>
          <span className="text-xs text-muted-foreground block mt-0.5">{description}</span></span>
      </label>)}
      <Button disabled={saving||labels.every(([k])=>group.lockedSettings?.includes(k))} onClick={()=>void save()}>{saving?"היט אפ...":"היט אפ אלע גרופ־סעטינגס"}</Button>
    </div>}
    {tab==="members"&&<div className="space-y-3">
      {staff&&canChangeRoles&&<div className="rounded-xl border border-amber-500/30 bg-muted/20 p-3 space-y-2">
        <p className="text-sm font-semibold">נאר גבהה־מערכת: איבערפירן הויפט־אדמין־רעכטן</p>
        <p className="text-xs text-muted-foreground">א פארגעשריטענער סיסטעם־שריט. דער גרינדער קען נישט ווערן ארויסגענומען דורך א גרופ־אדמין.</p>
        <select className="w-full rounded-lg border bg-background p-3" value={nextOwner??""}
          onChange={e=>setNextOwner(e.target.value?Number(e.target.value):null)}>
          <option value="">אויסקלייבן א נייער הויפט־אדמין</option>
          {members.filter(m=>m.status==="approved"&&m.userId!==group.ownerId)
            .map(m=><option key={m.id} value={m.userId}>{m.userName}</option>)}
        </select>
        <Button disabled={busy||!nextOwner} variant="outline" onClick={()=>{
          if(nextOwner&&window.confirm("איבערפירן די הויפט־אדמין־רעכטן צו דעם נייעם מעמבער?"))
            void update(`/api/admin/groups/${group.id}/owner`,{userId:nextOwner});
        }}>באשטעטיגן איבערפירן רעכטן</Button>
      </div>}
      {members.map(member=><div key={member.id} className="border rounded-xl p-3 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div><p className="font-semibold">{member.userName}</p>
            <p className="text-xs text-muted-foreground">{member.role==="owner"?"גרינדער · הויפט־אדמין":["admin","moderator"].includes(member.role)?"גרופ־אדמין":"מעמבער"} · {statuses[member.status]||member.status}</p></div>
          {(member.userId===group.ownerId||member.protectedByPlatform)&&<span className="text-xs text-secondary font-semibold">
            {member.userId===group.ownerId?"גרינדער · באשיצט":"באשיצט דורך גבהה"}
          </span>}
        </div>
        {member.userId!==group.ownerId&&<div className="flex flex-wrap gap-1.5">
          {can("approveMembers")&&member.status==="pending"&&<Button size="sm" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{status:"approved"})}>אפראווען</Button>}
          {can("suspendMembers")&&(!member.protectedByPlatform||staff)&&member.status==="approved"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{status:"suspended"})}>סוספענדירן</Button>}
          {can("restoreMembers")&&member.status==="suspended"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{status:"approved"})}>רעאקטיווירן</Button>}
          {can("restoreMembers")&&member.status==="removed"&&canChangeRoles&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{status:"approved"})}>צוריקנעמען</Button>}
          {can("removeMembers")&&(!member.protectedByPlatform||staff)&&member.status!=="removed"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>{if(window.confirm("זיכער אראפנעמען דעם מעמבער?"))void update(`/api/groups/${group.id}/members/${member.id}`,{status:"removed"});}}>אראפנעמען</Button>}
          {can("manageAdmins")&&canChangeRoles&&member.status==="approved"&&member.role!=="admin"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{role:"admin"})}>מאכן אדמין</Button>}
          {can("manageAdmins")&&canChangeRoles&&member.role==="admin"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void update(`/api/groups/${group.id}/members/${member.id}`,{role:"member"})}>אראפנעמען אדמין־רעכטן</Button>}
        </div>}
      </div>)}
    </div>}
    {tab==="reviews"&&can("moderatePosts")&&<div className="space-y-4">
      <h3 className="font-semibold">ווארטנדיגע פאוסטס ({pending.posts.length})</h3>
      {pending.posts.map(post=><div key={post.id} className="border rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold">{post.authorName}</p>
        <p className="text-sm whitespace-pre-wrap">{post.content}</p>
        <div className="flex gap-2">
          <Button disabled={busy} size="sm" onClick={()=>void update(`/api/groups/${group.id}/posts/${post.id}/review`,{status:"approved"})}><Check className="h-4 w-4"/>אפראווען</Button>
          <Button disabled={busy} size="sm" variant="outline" onClick={()=>void update(`/api/groups/${group.id}/posts/${post.id}/review`,{status:"rejected"})}><X className="h-4 w-4"/>אפווארפן</Button>
        </div>
      </div>)}
      <h3 className="font-semibold">ווארטנדיגע רעפלייען ({pending.replies.length})</h3>
      {pending.replies.map(reply=><div key={reply.id} className="border rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold">{reply.authorName} · פאוסט #{reply.postId}</p>
        <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
        <div className="flex gap-2">
          <Button disabled={busy} size="sm" onClick={()=>void update(`/api/groups/${group.id}/posts/${reply.postId}/replies/${reply.id}/review`,{status:"approved"})}>אפראווען</Button>
          <Button disabled={busy} size="sm" variant="outline" onClick={()=>void update(`/api/groups/${group.id}/posts/${reply.postId}/replies/${reply.id}/review`,{status:"rejected"})}>אפווארפן</Button>
        </div>
      </div>)}
      {!pending.posts.length&&!pending.replies.length&&<p className="text-sm text-muted-foreground">נישטא קיין ווארטנדיגע פאוסטס אדער רעפלייען.</p>}
    </div>}
    {tab==="reports"&&can("viewGroupReports")&&<div className="space-y-3">
      <p className="text-xs text-muted-foreground">דא זענען בלויז באריכטן וואס זענען געשיקט געווארן צו דער גרופ. פריוואטע גבהה־באריכטן ווערן קיינמאל נישט אויסגעוויזן.</p>
      {reports.map(report=><div key={report.id} className="rounded-xl border p-3 space-y-2">
        <p className="text-xs text-muted-foreground">פאוסט #{report.postId} · {report.createdAt.slice(0,10)}</p>
        <p className="text-sm whitespace-pre-wrap">{report.reason}</p>
        {report.postExcerpt&&<p className="rounded-lg border p-2 text-xs text-muted-foreground whitespace-pre-wrap">
          באריכטעטע אינהאלט: {report.postExcerpt}
        </p>}
        <div className="flex gap-2 items-center"><span className="text-xs">{report.status==="resolved"?"באהאנדלט":"ווארט אויף באהאנדלונג"}</span>
          {can("resolveGroupReports")&&report.status!=="resolved"&&<Button disabled={busy} size="sm" variant="outline"
            onClick={()=>void update(`/api/groups/${group.id}/reports/${report.id}`,{status:"resolved"})}>באשטעטיגן באהאנדלט</Button>}
        </div>
      </div>)}
      {!reports.length&&<p className="text-sm text-muted-foreground">דערווייל נישטא קיין גרופ־באריכטן.</p>}
    </div>}
    {tab==="staff"&&staff&&<div className="space-y-3">
      <p className="font-semibold text-sm">גבהה־מערכת באריכטן · נאר פאר סיסטעם־אדמיניסטראציע</p>
      {staffReports.map(report=><div key={report.id} className="border rounded-xl p-3 space-y-2">
        <p className="text-xs text-muted-foreground">גרופ #{report.groupId} · פאוסט #{report.postId}</p>
        <p className="text-sm">{report.reason}</p>
        <p className="text-xs">{report.status==="resolved"?"באהאנדלט":"אפן"}</p>
        {report.status!=="resolved"&&<Button variant="outline" size="sm" disabled={busy}
          onClick={()=>void update(`/api/admin/group-reports/${report.id}`,{status:"resolved"})}>מארקירן באהאנדלט</Button>}
      </div>)}
      {!staffReports.length&&<p className="text-xs text-muted-foreground">דערווייל נישטא קיין גבהה־באריכטן.</p>}
    </div>}
  </section>;
}
