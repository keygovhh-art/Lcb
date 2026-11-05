import {useState} from "react";
import {useListCharities,getListCharitiesQueryKey} from "@workspace/api-client-react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Layout} from "@/components/layout/layout";
import {Progress} from "@/components/ui/progress";
import {Skeleton} from "@/components/ui/skeleton";
import {Button} from "@/components/ui/button";
import {useLanguage} from "@/context/language-context";
import {useAuth} from "@/context/auth-context";
import {MemberGate} from "@/components/shared/member-gate";
import {Heart,Star,TrendingUp,Users,HandHeart,CalendarClock} from "lucide-react";
import {CampaignDonationActions} from "@/components/shared/campaign-donation-actions";
import {JoinCauseDialog,SubmitCauseDialog} from "@/pages/united/index";

type DailyCause={
 enabled:boolean;channel:"daily";announcementMode:"tts"|"recording";
 joinMode:"tts"|"recording";paymentAdapter:string;checkoutAvailable:boolean;
 messages?:{announcement?:{textEn:string;hasAudio:boolean;audioUrl:string|null};
 join?:{textEn:string;hasAudio:boolean;audioUrl:string|null}};
 cause:{
  id:number;title:string;description:string;goalAmount:number;joinedCount:number;
  pledgedDollars:number|null;pendingApprovalPledgedDollars:number|null;
  verifiedRaisedDollars:number|null;location:string|null;phoneNumber:string|null;
  phoneExtension:string|null;donationUrl:string|null
 }|null;
};
type MyDaily={cases:Array<{case_id:number;charity_id:number;title:string}>};
const asMoney=(value:number|null|undefined)=>value===null||value===undefined?
 "דער באשטעטיגטער סכום איז נאך נישט איינגעשטעלט":
 "$"+value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function Charity(){
 const qc=useQueryClient(),{lang}=useLanguage(),yi=lang==="yi";
 const {isAuthenticated}=useAuth();
 const [joinOpen,setJoinOpen]=useState(false),[suggestOpen,setSuggestOpen]=useState(false);
 const {data:channel,isLoading:channelLoading}=useQuery<DailyCause|null>({
  queryKey:["/api/cause-channels","daily"],
  queryFn:async()=>{
   const r=await fetch("/api/cause-channels/daily",{cache:"no-store"});
   return r.ok?r.json():null;
  },refetchInterval:60000
 });
 const {data:allCharities,isLoading:allLoading}=useListCharities({
  query:{queryKey:getListCharitiesQueryKey(),refetchInterval:60000}
 });
 const {data:mine}=useQuery<MyDaily>({
  queryKey:["/api/me/daily/workspace"],
  queryFn:async()=>{
   const r=await fetch("/api/me/daily/workspace",{credentials:"same-origin",cache:"no-store"});
   if(!r.ok)throw Error("Your private Today's Cause cases could not be loaded");
   return r.json();
  },enabled:isAuthenticated,refetchInterval:60000
 });
 const cause=channel?.enabled?channel.cause:null;
 const verified=cause?.verifiedRaisedDollars??null;
 const pledged=cause?.pledgedDollars??null;
 const goal=Number(cause?.goalAmount||0);
 const pledgePct=goal>0&&pledged!==null?Math.min(100,Math.round(pledged/goal*100)):0;
 const receivedPct=goal>0&&verified!==null?Math.min(100,Math.round(verified/goal*100)):0;
 const activeCase=(mine?.cases||[]).find(c=>c.charity_id===cause?.id);
 const charity=allCharities?.find(x=>x.id===cause?.id);
 const details=channel?.messages?.announcement;
 const announcement=details?.textEn||cause?.description||"";
 const refresh=()=>{
  void qc.invalidateQueries({queryKey:["/api/cause-channels","daily"]});
  void qc.invalidateQueries({queryKey:["/api/me/daily/workspace"]});
  void qc.invalidateQueries({queryKey:getListCharitiesQueryKey()});
 };
 const speak=()=>{
  if(!("speechSynthesis" in window)||!announcement)return;
  window.speechSynthesis.cancel();
  const voice=new SpeechSynthesisUtterance(announcement);voice.lang="en-US";
  window.speechSynthesis.speak(voice);
 };
 return <Layout>
  <div className="bg-gradient-to-br from-amber-50/60 via-rose-50/30 to-transparent border-b">
   <div className="container mx-auto px-4 py-12">
    <div className="flex gap-3 items-center mb-3">
     <Star className="w-9 h-9 text-accent"/>
     <h1 className="font-serif text-4xl font-bold text-primary">
      {yi?"היינטיגע צוועק":"Today's Cause"}
     </h1>
    </div>
    <p className="text-muted-foreground font-serif italic">
     {yi?"אייגענע באשטעטיגטע צוועקן — אפגעטיילט פון מתאחדים באהבה.":
      "Today's Cause — an independent community campaign, with its own commitments and finances."}
    </p>
   </div>
  </div>
  <main dir={yi?"rtl":"ltr"} className="container mx-auto px-4 py-10 space-y-12">
   <div className="flex flex-wrap gap-2 items-center">
    <Button variant="outline" onClick={refresh}>דערפרישן צענטראלע סטאטוס</Button>
    {isAuthenticated?<Button variant="outline" onClick={()=>setSuggestOpen(true)}>
     <Star className="w-4 h-4 me-2"/> ווייסטו א צוועק וואס פארדינט די ספאטלייט?
    </Button>:<MemberGate gate="united" compact action="suggest a cause">{null}</MemberGate>}
   </div>
   {channelLoading?<div className="rounded-2xl border bg-card p-8 space-y-3">
    <Skeleton className="h-8 w-1/2"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-3/4"/>
   </div>:cause?<section className="rounded-2xl border bg-card overflow-hidden shadow-sm">
    <div className="h-3 bg-gradient-to-r from-primary via-secondary to-accent"/>
    {charity?.imageUrl&&<img src={charity.imageUrl} alt="" className="w-full max-h-72 object-cover"/>}
    <div className="p-6 sm:p-8 space-y-6">
     <div className="flex flex-col md:flex-row justify-between gap-5">
      <div className="space-y-3 flex-1">
       <p className="text-xs font-semibold tracking-wider text-muted-foreground">היינטיגע באשטעטיגטע צוועק</p>
       <h2 className="font-serif text-3xl font-bold text-primary">{cause.title}</h2>
       <p className="whitespace-pre-wrap text-base leading-relaxed">{cause.description}</p>
       {cause.location&&<p className="text-sm text-muted-foreground">{cause.location}</p>}
      </div>
      <div className="w-full md:w-72 flex flex-col gap-2">
       <Button className="h-12 text-base font-bold" onClick={()=>{
        if(!isAuthenticated){window.location.href="/login";return;}
        setJoinOpen(true);
       }}><Heart className="w-5 h-5 me-2"/> 1 — זיך אנשליסן / נדבה</Button>
       <Button variant="outline" className="h-12" onClick={()=>{
        if(!isAuthenticated){window.location.href="/login";return;}
        setSuggestOpen(true);
       }}><Star className="w-5 h-5 me-2"/> 2 — פארשלאגן א צוועק</Button>
       {activeCase&&<a href={`/my?case=${activeCase.case_id}`}
        className="border rounded-lg p-3 text-sm font-semibold text-primary underline">
        <HandHeart className="w-4 h-4 inline me-1"/> עפענען דעם צוועק אין מיין עסקנות — קעיס #{activeCase.case_id}
       </a>}
       {charity&&<CampaignDonationActions campaign={charity}/>}
      </div>
     </div>
     <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
      <h3 className="font-bold">אפיציעלע מעסעדזש — {cause.title}</h3>
      {channel?.announcementMode==="recording"&&details?.audioUrl?
       <audio controls preload="metadata" className="w-full" src={details.audioUrl}/>:
       <div className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{announcement}</p>
        <Button variant="outline" size="sm" onClick={speak}>הערן אין ענגלישע TTS</Button>
       </div>}
     </div>
     <div className="grid sm:grid-cols-3 gap-3">
      <div className="rounded-xl border p-4">
       <p className="text-sm text-muted-foreground">סך הכל שוין אונטערגענומען בל״נ</p>
       <strong className="block text-2xl text-secondary tabular-nums">{asMoney(pledged)}</strong>
       {Number(cause.pendingApprovalPledgedDollars||0)>0&&<p className="text-xs text-muted-foreground">
        {asMoney(cause.pendingApprovalPledgedDollars)} ווארט נאך אויף טיעם־באשטעטיגונג
       </p>}
      </div>
      <div className="rounded-xl border p-4">
       <p className="text-sm text-muted-foreground">סך הכל געלט שוין פאקטיש אריינגעקומען</p>
       <strong className="block text-2xl text-primary tabular-nums">{asMoney(verified)}</strong>
       <p className="text-xs text-muted-foreground">באשטעטיגטע נדבות, נישט בלויז צוזאגן</p>
      </div>
      <div className="rounded-xl border p-4">
       <p className="text-sm text-muted-foreground">מענטשן אנגעשלאסן</p>
       <strong className="block text-2xl text-primary tabular-nums">{cause.joinedCount}</strong>
      </div>
     </div>
     <div className="rounded-xl bg-muted/30 p-5 space-y-3">
      <div className="flex flex-wrap gap-3 justify-between text-sm font-semibold">
       <span>ציל: {asMoney(goal)}</span>
       <span>בל״נ {pledged!==null?pledgePct+"%":"נישט באשטעטיגט"}</span>
       <span>באצאלט {verified!==null?receivedPct+"%":"נישט באשטעטיגט"}</span>
      </div>
      <Progress value={pledgePct} className="h-3"/>
      <p className="text-xs text-muted-foreground">דער פלעדזש־פראגרעס איז נישט באצאלטע געלט. באקומען געלט ווערט געוויזן עקסטער אויבן.</p>
     </div>
    </div>
   </section>:<section className="rounded-2xl border p-10 text-center text-muted-foreground">
    דערווייל איז נישט אנגעשטעלט קיין היינטיגער צוועק. דער טיעם קען דאס אויסקלייבן אין „היינטיגע צוועק סעטינגס“.
   </section>}
   <section className="space-y-5">
    <h2 className="font-serif text-2xl font-bold text-primary flex gap-2 items-center">
     <TrendingUp className="w-5 h-5"/> {yi?"אנדערע באשטעטיגטע קאמפיינס":"Other approved campaigns"}
    </h2>
    {allLoading?<Skeleton className="h-40 w-full"/>:
     <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {(allCharities||[]).filter(c=>c.id!==cause?.id).map(c=><article key={c.id}
       className="border rounded-xl bg-card overflow-hidden flex flex-col">
       {c.imageUrl&&<img src={c.imageUrl} alt="" className="w-full h-36 object-cover"/>}
       <div className="p-4 space-y-2 flex-1">
        <h3 className="font-semibold">{c.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
        <p className="text-xs">באקאנט־געמאכטער ציל: {asMoney(Number(c.goalAmount||0))}</p>
        <CampaignDonationActions campaign={c} compact/>
       </div>
      </article>)}
     </div>}
   </section>
  </main>
  {cause&&<JoinCauseDialog causeId={cause.id} open={joinOpen}
    onClose={()=>{setJoinOpen(false);refresh()}} channelKey="daily"/>}
  <SubmitCauseDialog open={suggestOpen} onClose={()=>setSuggestOpen(false)} channelKey="daily"/>
 </Layout>;
}
