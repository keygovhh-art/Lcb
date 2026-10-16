import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

type VoiceReply={id:string;postedAt:string;audioUrl:string};
type Pending={id:string;newsId:number;newsTitle:string;postedAt:string;audioUrl:string};
export function NewsVoiceReplies({newsId}:{newsId:number}){
 const [items,setItems]=useState<VoiceReply[]>([]);
 const [pending,setPending]=useState<Pending[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const {isAdmin}=useAuth();
 const refresh=async()=>{
  const news=await fetch("/api/news/"+newsId+"/voice-replies",{credentials:"same-origin"});
  if(news.ok)setItems(await news.json());
  if(isAdmin){
   const queue=await fetch("/api/admin/news/voice-replies",{credentials:"same-origin"});
   if(queue.ok)setPending((await queue.json()).filter((x:Pending)=>x.newsId===newsId));
  }
 };
 useEffect(()=>{void refresh();},[newsId,isAdmin]);
 const decide=async(id:string,decision:"approved"|"rejected")=>{
  setBusy(id);
  try{
   const res=await fetch("/api/admin/news/voice-replies/"+encodeURIComponent(id)+"/review",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({decision})
   });
   if(res.ok)await refresh();
  }finally{setBusy(null);}
 };
 return <section className="mt-10 pt-6 border-t" aria-label="Telephone audio replies">
  <h2 className="font-serif text-xl font-bold mb-2">Telephone Voice Replies</h2>
  <p className="text-sm text-muted-foreground mb-4">Telephone replies are reviewed before appearing publicly. News upvotes are the same on the website and the hotline.</p>
  {items.length===0?<p className="text-sm text-muted-foreground">No approved voice replies yet.</p>:
   <div className="space-y-3">{items.map(item=><div key={item.id} className="rounded-lg border p-3">
    <p className="text-sm mb-2">Audio reply · {new Date(item.postedAt).toLocaleDateString()}</p>
    <audio controls preload="none" className="w-full" src={item.audioUrl}>Your browser does not support audio.</audio>
   </div>)}</div>}
  {isAdmin&&pending.length>0&&<section className="mt-5 rounded-xl border p-3">
   <h3 className="font-semibold mb-2">Pending Telephone Voice Replies — Admin Review</h3>
   {pending.map(p=><div key={p.id} className="rounded-lg border p-3 mb-3">
    <p className="text-sm mb-2">From phone · {new Date(p.postedAt).toLocaleString()}</p>
    <audio controls preload="none" className="w-full" src={p.audioUrl}>Audio playback unavailable</audio>
    <div className="flex gap-2 mt-3">
     <Button size="sm" disabled={busy===p.id} onClick={()=>void decide(p.id,"approved")}>Approve</Button>
     <Button size="sm" variant="outline" disabled={busy===p.id} onClick={()=>void decide(p.id,"rejected")}>Reject</Button>
    </div>
   </div>)}
  </section>}
 </section>;
}
