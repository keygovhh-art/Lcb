import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Eye, MessageCircle, Flag, ThumbsDown, Pin, Lock, Unlock, Send, Trash2 } from "lucide-react";

type GroupInfo = {
  id:number; allowReplies:boolean; replyApproval:boolean; membersCanReply:boolean;
  showViewCounts:boolean; allowDownvotes:boolean;
  allowedCapabilities?:Record<string,boolean>;
};
type PostInfo = {
  id:number; authorId:number|null; isPinned?:boolean; isLocked?:boolean;
  moderationStatus?:string; views?:number|null; downvotes?:number;
};
type Reply = {id:number;postId:number;parentReplyId:number|null;authorId:number|null;
  authorName:string;content:string;moderationStatus:string;createdAt:string;deletedAt?:string|null};
type ThreadReply=Reply & {depth:number};
function threadedReplies(replies:Reply[]):ThreadReply[] {
  const children=new Map<number,Reply[]>();
  const ids=new Set(replies.map(r=>r.id));
  for(const r of replies){
    const parent=r.parentReplyId!==null&&ids.has(r.parentReplyId)&&r.parentReplyId!==r.id?r.parentReplyId:0;
    const siblings=children.get(parent)||[];siblings.push(r);children.set(parent,siblings);
  }
  const ordered:ThreadReply[]=[];const visited=new Set<number>();
  const stack=(children.get(0)||[]).slice().reverse().map(r=>({r,depth:0}));
  while(stack.length){
    const next=stack.pop()!;
    if(visited.has(next.r.id))continue;
    visited.add(next.r.id);ordered.push({...next.r,depth:next.depth});
    const kids=children.get(next.r.id)||[];
    for(let i=kids.length-1;i>=0;i--)stack.push({r:kids[i],depth:next.depth+1});
  }
  for(const r of replies)if(!visited.has(r.id))ordered.push({...r,depth:0});
  return ordered;
}
export function GroupPostExtras({group,post,manager,canReply,onChanged}:{
  group:GroupInfo;post:PostInfo;manager:boolean;canReply:boolean;onChanged:()=>void;
}) {
  const {user,isAuthenticated}=useAuth();
  const {toast}=useToast();
  const root=useRef<HTMLDivElement|null>(null);
  const seen=useRef(false);
  const [views,setViews]=useState(post.views);
  const [downvoted,setDownvoted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [repliesOpen,setRepliesOpen]=useState(false);
  const [replies,setReplies]=useState<Reply[]>([]);
  const [reply,setReply]=useState("");
  const [replyParent,setReplyParent]=useState<number|null>(null);
  const [reportOpen,setReportOpen]=useState(false);
  const [reportTo,setReportTo]=useState("group");
  const [reportReason,setReportReason]=useState("");

  useEffect(()=>setViews(post.views),[post.views]);
  useEffect(()=>{
    seen.current=false;
    if(!isAuthenticated||post.moderationStatus!=="approved"||!root.current)return;
    const observer=new IntersectionObserver(entries=>{
      if(seen.current||!entries.some(e=>e.isIntersecting))return;
      seen.current=true;
      void fetch(`/api/groups/${group.id}/posts/${post.id}/view`,{
        method:"POST",credentials:"include",cache:"no-store",
      }).then(r=>r.ok?r.json():null).then(data=>{
        if(data&&typeof data.views==="number")setViews(data.views);
      }).catch(()=>{});
      observer.disconnect();
    },{threshold:0.4});
    observer.observe(root.current);
    return ()=>observer.disconnect();
  },[group.id,post.id,post.moderationStatus,isAuthenticated,user?.id]);

  const loadReplies=async()=>{
    const response=await fetch(`/api/groups/${group.id}/posts/${post.id}/replies`,{credentials:"include",cache:"no-store"});
    if(!response.ok)throw Error("Could not read replies");
    setReplies(await response.json());
  };
  useEffect(()=>{if(repliesOpen)void loadReplies().catch(()=>{});},[repliesOpen,group.id,post.id]);
  useEffect(()=>{
    if(!isAuthenticated||!group.allowDownvotes)return;
    void fetch(`/api/groups/${group.id}/posts/${post.id}/downvote`,{credentials:"include",cache:"no-store"})
      .then(r=>r.ok?r.json():null).then(data=>{if(data&&typeof data.downvoted==="boolean")setDownvoted(data.downvoted);}).catch(()=>{});
  },[group.id,post.id,group.allowDownvotes,isAuthenticated,user?.id]);
  const api=async(path:string,method:string,body?:unknown)=>{
    setBusy(true);
    try{
      const response=await fetch(path,{method,credentials:"include",
        ...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||"Action failed");
      return data;
    }finally{setBusy(false);}
  };
  const createReply=async()=>{
    if(!reply.trim()||busy)return;
    try{
      const result=await api(`/api/groups/${group.id}/posts/${post.id}/replies`,"POST",
        {content:reply.trim(),parentReplyId:replyParent});
      setReply("");setReplyParent(null);await loadReplies();
      toast({title:result.moderationStatus==="pending"?"רעפליי ווארט אויף אדמין־רעוויאו":"רעפליי צוגעגעבן"});
    }catch(e){toast({title:"רעפליי נישט אריינגעגאנגען",description:String(e),variant:"destructive"});}
  };
  const removeReply=async(id:number)=>{
    if(!window.confirm("זיכער דעליט דעם רעפליי?"))return;
    try{
      await api(`/api/groups/${group.id}/posts/${post.id}/replies/${id}`,"DELETE");
      await loadReplies();
      toast({title:"רעפליי אויסגעמעקט"});
    }catch(e){toast({title:"נישט געלונגען",description:String(e),variant:"destructive"});}
  };
  const sendReport=async()=>{
    if(!reportReason.trim()||busy)return;
    try{
      await api(`/api/groups/${group.id}/posts/${post.id}/report`,"POST",
        {destination:reportTo,reason:reportReason.trim()});
      setReportOpen(false);setReportReason("");
      toast({title:"דער באריכט איז אפגעשיקט געווארן"});
    }catch(e){toast({title:"דער באריכט איז נישט געשיקט",description:String(e),variant:"destructive"});}
  };
  const vote=async()=>{
    if(!isAuthenticated){toast({title:"מען מוז זיין איינגעשריבן כדי צו שטימען"});return;}
    try{
      const d=await api(`/api/groups/${group.id}/posts/${post.id}/downvote`,"POST");
      setDownvoted(Boolean(d.downvoted));onChanged();
    }catch(e){toast({title:"שטימע נישט געלונגען",description:String(e),variant:"destructive"});}
  };
  const postOption=async(key:"isPinned"|"isLocked",value:boolean)=>{
    try{
      await api(`/api/groups/${group.id}/posts/${post.id}/options`,"PATCH",{[key]:value});
      onChanged();
    }catch(e){toast({title:"נישט געלונגען",description:String(e),variant:"destructive"});}
  };

  const threaded=threadedReplies(replies);
  const may=(key:string)=>manager && group.allowedCapabilities?.[key]!==false;
  return <div ref={root} className="space-y-3" dir="rtl">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {(group.showViewCounts||manager)&&typeof views==="number"&&
        <span className="flex items-center gap-1 text-muted-foreground" title="איינציגארטיגע איינגעשריבענע מעמבערס">
          <Eye className="h-4 w-4"/> {views} וויאוס
        </span>}
      {manager&&typeof post.downvotes==="number"&&
        <span className="flex items-center gap-1 text-muted-foreground"><ThumbsDown className="h-4 w-4"/>{post.downvotes} דאונוואוטס</span>}
      {group.allowDownvotes&&isAuthenticated&&post.moderationStatus==="approved"&&<Button
        type="button" size="sm" variant={downvoted?"secondary":"ghost"} disabled={busy}
        onClick={()=>void vote()} className="gap-1" title="דאונוואוט — דער ציילער איז נישט עפנטליך">
        <ThumbsDown className="h-4 w-4"/> {downvoted?"אויפהייבן דאונוואוט":"דאונוואוט"}
      </Button>}
      {group.allowReplies&&post.moderationStatus==="approved"&&<Button size="sm" variant="ghost"
        onClick={()=>setRepliesOpen(old=>!old)} className="gap-1">
        <MessageCircle className="h-4 w-4"/> רעפלייען {repliesOpen?"פארמאכן":"עפענען"}
      </Button>}
      {isAuthenticated&&post.moderationStatus==="approved"&&<Button size="sm" variant="ghost"
        onClick={()=>setReportOpen(old=>!old)} className="gap-1"><Flag className="h-4 w-4"/> רעפארטן</Button>}
      {may("pinPosts")&&<Button size="sm" variant="outline" disabled={busy}
        onClick={()=>void postOption("isPinned",!post.isPinned)} className="gap-1">
        <Pin className="h-3.5 w-3.5"/>{post.isPinned?"אוועקנעמען פין":"פינען פאוסט"}
      </Button>}
      {may("lockReplies")&&<Button size="sm" variant="outline" disabled={busy}
        onClick={()=>void postOption("isLocked",!post.isLocked)} className="gap-1">
        {post.isLocked?<Unlock className="h-3.5 w-3.5"/>:<Lock className="h-3.5 w-3.5"/>}
        {post.isLocked?"עפענען רעפלייען":"לאקן רעפלייען"}
      </Button>}
    </div>
    {repliesOpen&&group.allowReplies&&<div className="rounded-xl bg-muted/15 border p-3 space-y-3">
      <h4 className="font-semibold text-sm">רעפלייען</h4>
      {threaded.map(r=><div key={r.id} className="rounded-lg border bg-card p-3"
        style={{marginInlineStart:Math.min(r.depth,5)*12}}
        aria-label={`רעפליי שטאפל ${r.depth+1}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">{r.authorName}
            {r.moderationStatus==="pending"&&<span className="text-amber-600"> · ווארט אויף אפראוועל</span>}
          </span>
          {!r.deletedAt&&(may("deleteOthersReplies")||r.authorId===user?.id)&&
            <Button size="icon" variant="ghost" disabled={busy} className="h-8 w-8 text-destructive"
              onClick={()=>void removeReply(r.id)} aria-label="דעליט רעפליי"><Trash2 className="h-4 w-4"/></Button>}
        </div>
        <p className="text-sm whitespace-pre-wrap mt-1 break-words">{r.content}</p>
        {!r.deletedAt&&(canReply||manager)&&(!post.isLocked||manager)&&
          <Button size="sm" variant="ghost" className="mt-2 min-h-9"
            onClick={()=>{setReplyParent(r.id);setReply("");}}>ענטפער אויף דעם רעפליי</Button>}
      </div>)}
      {!replies.length&&<p className="text-xs text-muted-foreground">דערווייל נישטא קיין רעפלייען.</p>}
      {(canReply||manager)&&(!post.isLocked||manager)&&<div className="space-y-2 rounded-lg border bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">{replyParent===null?"נייער רעפליי":"ענטפער אויף רעפליי #"+replyParent}</p>
          {replyParent!==null&&<Button size="sm" variant="ghost" onClick={()=>setReplyParent(null)}>צוריק צום הויפט־פאוסט</Button>}
        </div>
        <Textarea placeholder="שרייב א רעפליי..." maxLength={3000} value={reply}
          onChange={e=>setReply(e.target.value)} className="min-h-20"/>
        <Button size="sm" disabled={!reply.trim()||busy} className="gap-1" onClick={()=>void createReply()}>
          <Send className="h-4 w-4"/> {busy?"שיקט...":"שיק רעפליי"}
        </Button>
        {group.replyApproval&&!manager&&<p className="text-xs text-muted-foreground">אדמין־אפראוועל איז פארלאנגט פארן פובליש.</p>}
      </div>}
    </div>}
    {reportOpen&&<div className="rounded-xl border p-3 space-y-3 bg-muted/10">
      <p className="font-semibold text-sm">צו וועמען שיקן דעם באריכט?</p>
      <select className="w-full rounded-md border bg-background p-3 min-h-11 text-sm"
        value={reportTo} onChange={e=>setReportTo(e.target.value)}>
        <option value="group">גרופ־אדמיניסטראציע</option>
        <option value="staff">גבהה־מערכת</option>
        <option value="both">צו ביידע</option>
      </select>
      <Textarea maxLength={2000} value={reportReason} onChange={e=>setReportReason(e.target.value)}
        placeholder="פארוואס רעפארטסטו דעם פאוסט?"/>
      <Button size="sm" disabled={!reportReason.trim()||busy} onClick={()=>void sendReport()}>שיק באריכט</Button>
    </div>}
  </div>;
}
