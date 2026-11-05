import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
type Case={case_id:number;charity_id:number;title:string;description:string;
 goal_amount:string;funds_promised:string;funds_received:string;case_status:string};
type Pledge={id:number;case_id:number;amount_cents:string;due_on:string;status:string;review_note:string|null};
type Donation={id:number;case_id:number;amount_cents:string|null;state:string;evidence_note:string|null};
type Data={cases:Case[];pledges:Pledge[];donations:Donation[]};
const dollars=(n:number|null|undefined)=>
 n===null||n===undefined?"נאכנישט באשטעטיגט":
 "$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export function DailyMemberCaseHub({highlightCase}:{highlightCase?:number|null}){
 const [data,setData]=useState<Data|null>(null);
 const [reported,setReported]=useState<Record<number,string>>({});
 const [proof,setProof]=useState<Record<number,string>>({});
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  try{
   const response=await fetch("/api/me/daily/workspace",{credentials:"same-origin",cache:"no-store"});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Your Today's Cause cases cannot be loaded");
   setData(result);setError("");
  }catch(e){setError(e instanceof Error?e.message:"מען קען יעצט נישט ליינען די קעיסן.");}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const submit=async(id:number)=>{
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch(`/api/me/daily/donations/${id}/report`,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({amount:Number(reported[id]),evidence:proof[id]})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"נישט געלונגען");
   setSuccess("די נדבה־באריכט איז געשיקט צום טיעם פאר אמתער באשטעטיגונג. עס איז נאך נישט פאררעכנט ווי באקומען געלט.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 if(!data?.cases?.length)return null;
 return <section dir="rtl" className="space-y-3">
  <h2 className="text-xl font-bold">היינטיגע צוועק — מיינע פריוואטע קעיסן</h2>
  <p className="text-sm text-muted-foreground">דאס איז באזונדער פון מתאחדים באהבה. יעדע אונטערנעמונג בל״נ און נדבה־בקשה בלייבט פארבונדן צום אייגענעם קעיס.</p>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {success&&<p role="status">{success}</p>}
  {data.cases.map(c=><article key={c.case_id}
   className={`rounded-xl border bg-card p-4 space-y-3 ${highlightCase===c.case_id?"ring-2 ring-primary":""}`}>
   <h3 className="font-bold">{c.title} · קעיס #{c.case_id}</h3>
   <div className="grid grid-cols-2 gap-2 text-sm">
    <p>צענטראלער גאל: <strong>{dollars(Number(c.goal_amount||0))}</strong></p>
    <p>מיינע בל״נ־צוזאגן: <strong>{dollars(Number(c.funds_promised||0))}</strong></p>
    <p>באשטעטיגט באקומען: <strong>{dollars(Number(c.funds_received||0))}</strong></p>
    <p>קעיס־סטאטוס: {c.case_status}</p>
   </div>
   <a href={`/my?case=${c.case_id}`} className="underline text-primary text-sm font-semibold">
    עפענען אלע טעסקס, נאטיצן און פאלא־אפס פונעם קעיס
   </a>
   {data.pledges.filter(p=>p.case_id===c.case_id).map(p=><div key={p.id} className="rounded-lg border p-3">
    <strong>בל״נ #{p.id} — {dollars(Number(p.amount_cents)/100)}</strong>
    <p className="text-sm">ביז {p.due_on} · {p.status==="pending_team"?
      "ווארט אויף טיעם־באשטעטיגונג":p.status==="rejected"?"אפגעווארפן":p.status}</p>
    {p.review_note&&<p className="text-xs">{p.review_note}</p>}
   </div>)}
   {data.donations.filter(d=>d.case_id===c.case_id).map(d=><div key={d.id} className="rounded-lg border p-3 space-y-2">
    <strong>נדבה־בקשה #{d.id}</strong>
    <p className="text-sm">סטאטוס: {d.state} — דאס מיינט נישט אז עס איז שוין באצאלט</p>
    {d.state==="instructions_only"&&<>
     <Input type="number" step="0.01" min="0.01" placeholder="וויפיל האסטו באמת געגעבן?"
      value={reported[d.id]||""} onChange={e=>setReported(o=>({...o,[d.id]:e.target.value}))}/>
     <Textarea placeholder="באצאל־רעפערענץ אדער באווייז־באשרייבונג"
      value={proof[d.id]||""} onChange={e=>setProof(o=>({...o,[d.id]:e.target.value}))}/>
     <Button disabled={busy||!reported[d.id]||(proof[d.id]||"").length<8} onClick={()=>void submit(d.id)}>
      אריינשיקן צום טיעם פאר באשטעטיגונג
     </Button>
    </>}
   </div>)}
  </article>)}
 </section>;
}
