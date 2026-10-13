import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, RefreshCw, ExternalLink, LockKeyhole, HeartHandshake, Users, HandHeart } from "lucide-react";

type OwnedType = "campaign"|"community_project"|"cause_submission"|"charity_campaign"|
  "group"|"case"|"minyan"|"forum_post"|"group_post"|"volunteer_registration"|"help_request";
type Item = {type:OwnedType;id:number;title:string;status:string;url:string;private:boolean;createdAt:string};
type OwnedResponse = {items:Item[];total:number;roles:{offersHelp:boolean;needsHelp:boolean;helpRequestCount:number}};
const meta:Record<OwnedType,{label:string;section:string}> = {
 campaign:{label:"קאמפיין",section:"campaigns"},
 community_project:{label:"פראיעקט",section:"campaigns"},
 cause_submission:{label:"אפיציעלע צוועק־פארשלאג",section:"campaigns"},
 charity_campaign:{label:"Today's Charity קאמפיין",section:"campaigns"},
 group:{label:"גרופ",section:"groups"},
 case:{label:"פריוואטער עסקנות־קעיס",section:"cases"},
 minyan:{label:"מנין",section:"minyanim"},
 forum_post:{label:"פארום־פאוסט",section:"posts"},
 group_post:{label:"גרופ־פאוסט",section:"posts"},
 volunteer_registration:{label:"איך וויל העלפן",section:"help"},
 help_request:{label:"איך דארף הילף",section:"help"},
};
const sections = [
 ["all","אלעס"],["campaigns","קאמפיינס און פראיעקטן"],
 ["groups","גרופעס"],["cases","מיין עסקנות"],["minyanim","מנינים"],
 ["posts","פאוסטס"],["help","הילף־אנמעלדונגען"],
] as const;
const statuses:Record<string,string> = {
 live:"לייוו", queued:"ווארט־ליניע",scheduled:"געסקעדזשועלט",active:"אקטיוו",
 approved:"אפראוועט",pending:"ווארט אויף רעוויאו",rejected:"נישט אפראוועט",
 public:"עפנטליך",private:"פריוואט",archived:"ארכיוו",
 open:"אפן",closed:"פארמאכט",in_progress:"אין פראגרעס",
 registered:"איינגעשריבן",created:"געעפנט",
};

export function MyCreatedContent() {
  const {user,isAuthenticated}=useAuth();
  const [category,setCategory]=useState("all");
  const {data,isLoading,isError,refetch}=useQuery<OwnedResponse>({
    queryKey:["/api/me/created-content",user?.id],
    enabled:isAuthenticated&&!!user?.id,
    staleTime:15000,
    queryFn:async()=>{
      const response=await fetch("/api/me/created-content",{credentials:"include",cache:"no-store"});
      if(!response.ok)throw Error("Could not load your private profile items");
      return response.json() as Promise<OwnedResponse>;
    },
  });
  const items=(data?.items||[]).filter(item=>category==="all"||meta[item.type]?.section===category);
  const totalIn=(key:string)=>(data?.items||[]).filter(item=>meta[item.type]?.section===key).length;

  return <section className="space-y-5" dir="rtl">
    <div className="border rounded-xl bg-card p-4 sm:p-6 space-y-3">
      <h2 className="text-xl font-serif font-bold text-primary flex items-center gap-2">
        <HeartHandshake className="h-5 w-5"/> איך דארף הילף און איך וויל העלפן
      </h2>
      <p className="text-sm text-muted-foreground">
        דער זעלבער מעמבער קען סיי בעטן הילף און סיי העלפן אנדערע.
        די צוויי אנמעלדונגען זענען באזונדער און שפארן זיך נישט אויס איינע די אנדערע.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border rounded-lg bg-muted/10 p-3 space-y-3">
          <strong className="flex items-center gap-2 text-sm">
            <HeartHandshake className="h-4 w-4"/> איך דארף הילף
          </strong>
          <p className="text-xs text-muted-foreground">
            {data?.roles.needsHelp
              ? `${data.roles.helpRequestCount} פריוואטע הילף־בקשות אריינגעשיקט`
              : "נאך נישט אריינגעשיקט קיין הילף־בקשה"}
          </p>
          <Link href="/directory#help-center"><Button variant="outline" className="w-full min-h-10">
            {data?.roles.needsHelp?"שיק נאך א בקשה":"איך דארף הילף — זיך אנגעבן"}
          </Button></Link>
        </div>
        <div className="border rounded-lg bg-muted/10 p-3 space-y-3">
          <strong className="flex items-center gap-2 text-sm"><Users className="h-4 w-4"/> איך וויל העלפן</strong>
          <p className="text-xs text-muted-foreground">
            {data?.roles.offersHelp?"איינגעשריבן אין דער פריוואטער עסקן־ליסטע":"נאך נישט איינגעשריבן אלס עסקן"}
          </p>
          <Link href="/directory#help-center"><Button variant="outline" className="w-full min-h-10">
            <HandHeart className="h-4 w-4 me-2"/>
            {data?.roles.offersHelp?"עפענען הילף־צענטער":"איך וויל העלפן — זיך אנגעבן"}
          </Button></Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <LockKeyhole className="h-4 w-4 shrink-0"/> די הילף־פרטים ווערן נישט געוויזן פארן ציבור.
      </p>
    </div>
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h2 className="text-xl font-serif font-bold text-primary flex items-center gap-2">
          <FolderOpen className="h-5 w-5"/> וואס איך האב שוין געעפנט
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          מיינע קאמפיינס, פראיעקטן, גרופעס, קעיסעס, פאוסטס, מנינים און אנמעלדונגען.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={isLoading} onClick={()=>void refetch()}>
        <RefreshCw className="h-4 w-4 me-2"/> דערפרישן
      </Button>
    </div>
    <div className="flex flex-wrap gap-2">
      {sections.map(([key,label])=><Button key={key} size="sm"
        variant={category===key?"default":"outline"}
        className="min-h-9 whitespace-normal"
        onClick={()=>setCategory(key)}>{label}
        {data&&<span className="ms-1 opacity-75">({key==="all"?data.total:totalIn(key)})</span>}
      </Button>)}
    </div>
    {isLoading&&<p className="border rounded-xl p-4 text-sm text-muted-foreground">לאדט דיינע אייגענע זאכן...</p>}
    {isError&&<p className="border rounded-xl p-4 text-sm text-destructive">
      נישט געלונגען צו לאדן. <Button variant="outline" size="sm" onClick={()=>void refetch()}>פרוביר נאכאמאל</Button>
    </p>}
    {!isLoading&&!isError&&!items.length&&<div className="rounded-xl border bg-muted/15 p-6 text-center space-y-2">
      <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/40"/>
      <p className="font-semibold">נאך נישטא קיין געעפנטע זאכן אין דער אויסגעקליבענער אפטיילונג.</p>
      <p className="text-sm text-muted-foreground">נייע זאכן וועלן זיך דא ווייזן אויטאמאטיש.</p>
    </div>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map(item=>{
        const info=meta[item.type];
        return <article key={item.type+":"+item.id} className="rounded-xl border bg-card p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-secondary">{info?.label||item.type}</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{statuses[item.status]||item.status}</Badge>
              {item.private&&<Badge variant="secondary">פריוואט</Badge>}
            </div>
          </div>
          <p className="font-semibold break-words" dir="auto">{item.title}</p>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <time className="text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleDateString("en-US")}
            </time>
            <Link href={item.url}><Button size="sm" variant="outline" className="gap-1 min-h-9">
              <ExternalLink className="h-4 w-4"/> עפענען אפטיילונג
            </Button></Link>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
