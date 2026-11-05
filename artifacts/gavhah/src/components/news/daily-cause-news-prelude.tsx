import {useEffect,useRef,useState} from "react";
import {Link} from "wouter";
import {Button} from "@/components/ui/button";

type Daily={
 enabled:boolean;websiteBeforeNews:boolean;websiteAutoplay:boolean;announcementMode:string;
 cause:{id:number;title:string;description:string;goalAmount:number;reportedRaisedDollars:number}|null;
 messages:{announcement?:{textEn:string;hasAudio:boolean;audioUrl:string|null}};
};
export function DailyCauseNewsPrelude(){
 const [settings,setSettings]=useState<Daily|null>(null);
 const [speakError,setSpeakError]=useState("");
 const audio=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{
  let cancelled=false;
  fetch("/api/cause-channels/daily",{cache:"no-store"}).then(r=>r.ok?r.json():null)
    .then(data=>{if(!cancelled)setSettings(data);})
    .catch(()=>{});
  return()=>{cancelled=true;window.speechSynthesis?.cancel();};
 },[]);
 const m=settings?.messages?.announcement;
 const url=settings?.announcementMode==="recording"&&m?.hasAudio?m.audioUrl:null;
 useEffect(()=>{
  if(settings?.websiteAutoplay&&url&&audio.current){
   void audio.current.play().catch(()=>setSpeakError("דרוק Play צו הערן די רעקארדירונג."));
  }
 },[url,settings?.websiteAutoplay]);
 function speak(){
  if(!settings)return;
  const text=m?.textEn||settings.cause?.description||"";
  if(!text)return;
  if(!("speechSynthesis" in window)){setSpeakError("דיין בראוזער שטעלט נישט צו שטימע־פארליינונג.");return;}
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang="en-US";u.rate=1;window.speechSynthesis.speak(u);
 }
 if(!settings?.enabled||!settings.websiteBeforeNews||!settings.cause)return null;
 return <section dir="rtl" className="rounded-xl border bg-card p-5 space-y-3 mb-5">
  <div className="font-semibold text-xl">היינטיגע צוועק</div>
  <h2 className="font-bold">{settings.cause.title}</h2>
  <p className="text-sm text-muted-foreground">{settings.cause.description}</p>
  {url?<audio ref={audio} controls preload="none" className="w-full" src={url} aria-label="היינטיגע צוועק רעקארדירונג"/>:
   <Button size="sm" variant="outline" onClick={speak}>הערן די מעסעדזש אין ענגליש</Button>}
  {speakError&&<p role="status" className="text-xs">{speakError}</p>}
  <Link href={`/charity/${settings.cause.id}`} className="text-primary underline font-semibold">
   עפענען די היינטיגע צוועק
  </Link>
 </section>;
}
