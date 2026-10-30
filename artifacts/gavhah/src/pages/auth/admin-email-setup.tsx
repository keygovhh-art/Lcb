import {useEffect,useState} from "react";
import {Link} from "wouter";
import {Layout} from "@/components/layout/layout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type State={ok:boolean;existingEmail:string|null;expiresAt:number};
async function api(endpoint:string,options?:RequestInit){
 const response=await fetch("/api/auth/admin-email-enrollment/"+endpoint,{
  credentials:"same-origin",cache:"no-store",
  ...(options||{}),headers:{"Content-Type":"application/json",...(options?.headers||{})}
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"די פעולה איז נישט געלונגען");
 return result;
}
export default function AdminEmailSetup(){
 const [step,setStep]=useState<"password"|"email"|"complete">("password");
 const [existing,setExisting]=useState<string|null>(null);
 const [expires,setExpires]=useState<number|null>(null);
 const [password,setPassword]=useState("");
 const [email,setEmail]=useState("");
 const [confirmReplacement,setConfirmReplacement]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{void api("status").then((r:State)=>{
  setExisting(r.existingEmail);setExpires(r.expiresAt);setStep("email");
 }).catch(()=>{});},[]);
 async function start(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   await api("start",{method:"POST",body:JSON.stringify({password})});
   setPassword("");
   const result=await api("status") as State;
   setExisting(result.existingEmail);setExpires(result.expiresAt);
   setStep("email");
  }catch(e){setError(e instanceof Error?e.message:"אומבאקאנטער פעלער");}
  finally{setBusy(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   await api("save",{method:"POST",body:JSON.stringify({email})});
   setStep("complete");setEmail("");
  }catch(e){setError(e instanceof Error?e.message:"אומבאקאנטער פעלער");}
  finally{setBusy(false);}
 }
 return <Layout>
  <main dir="rtl" lang="yi" className="mx-auto max-w-lg px-4 py-10 space-y-5">
   <h1 className="font-bold text-2xl">גבהה — צולייגן אן אימעיל צום עקזיסטירנדן אדמין</h1>
   <p className="text-sm text-muted-foreground">
    דאס מאכט <strong>נישט</strong> קיין נייעם אקאונט און טוישט <strong>נישט</strong> דיין פעסווארד.
   </p>
   {step==="password"?<form className="rounded-2xl border p-5 space-y-4" onSubmit={start}>
    <h2 className="font-semibold">שריט 1 — באשטעטיג דעם עקזיסטירנדן אדמין־פעסווארד</h2>
    <p className="text-sm text-muted-foreground">
     דא דארף מען נישט קיין אימעיל, טעלעפאן אדער ID. נאר דער פעסווארד וואס געהערט צום עקזיסטירנדן Super Admin.
    </p>
    <label className="block space-y-2">
     <span>עקזיסטירנדער פעסווארד</span>
     <Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}
      minLength={8} maxLength={256} required/>
    </label>
    <Button disabled={busy||password.length<8} type="submit" className="w-full">
     {busy?"מען באשטעטיגט...":"באשטעטיגן און גיין צו אימעיל"}
    </Button>
   </form>:step==="email"?<form className="rounded-2xl border p-5 space-y-4" onSubmit={save}>
    <h2 className="font-semibold">שריט 2 — צולייגן די אימעיל־אדרעס</h2>
    <p className="text-sm">דו ביסט שוין איינגעשריבן אויף דעם עקזיסטירנדן סופער־עדמין. די איינמאליגע ערלויבעניש איז גילטיג 10 מינוט.</p>
    {expires&&<p className="text-xs text-muted-foreground">גילטיג ביז: {new Date(expires).toLocaleTimeString("en-US")}</p>}
    {existing&&<div className="rounded-lg border p-3 space-y-3">
     <p className="text-sm">עס איז שוין פארהאן אן אימעיל אויף דעם אקאונט: <strong dir="ltr">{existing}</strong>.</p>
     <label className="flex gap-2 items-start text-sm">
      <input type="checkbox" checked={confirmReplacement} onChange={e=>setConfirmReplacement(e.target.checked)}
       className="mt-1"/>
      <span>איך באשטעטיג אז דער נייער אימעיל וועט ערזעצן דעם פריערדיגן אויפן זעלבן אקאונט.</span>
     </label>
    </div>}
    <label className="block space-y-2">
     <span>אימעיל־אדרעס</span>
     <Input type="email" inputMode="email" dir="ltr" autoComplete="email" value={email}
      onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="example@gmail.com"/>
    </label>
    <Button type="submit" className="w-full"
     disabled={busy||!email.includes("@")||(!!existing&&!confirmReplacement)}>
     {busy?"מען היט אפ...":"אפהיטן אימעיל אויף מיינעם אדמין־אקאונט"}
    </Button>
   </form>:<div className="rounded-2xl border p-5 space-y-3">
    <h2 className="font-semibold">די אימעיל־אדרעס איז אפגעהיטן!</h2>
    <p>דער פעסווארד און די סופער־עדמין־רעכטן זענען געבליבן אומגעענדערט. די איינמאליגע 10־מינוטיגע ערלויבעניש איז פארמאכט.</p>
    <Link href="/founder" className="underline font-semibold">צוריק צום אדמין־דעשבאורד</Link>
   </div>}
   {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
   <p className="text-xs text-muted-foreground">
    פאר זיכערהייט דארף דער עקזיסטירנדער פעסווארד שטימען מיטן אקאונט. אן אומבאקאנטן קאוד קען נישט געבן סופער־עדמין־רעכטן.
   </p>
  </main>
 </Layout>;
}
