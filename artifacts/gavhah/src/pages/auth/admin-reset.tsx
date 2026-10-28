import {useState} from "react";
import {Link} from "wouter";
import {Layout} from "@/components/layout/layout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

function captureToken(){
 if(typeof window==="undefined")return "";
 const fragment=window.location.hash;
 const cfToken=fragment.match(/^#cloudflare=([a-fA-F0-9]{64})$/)?.[1]||"";
 const token=cfToken||fragment.match(/^#token=([a-fA-F0-9]{64})$/)?.[1]||"";
 // A secret in the URL fragment never reaches the server, history or referral.
 // Remove it from the address bar immediately after loading the reset form.
 if(fragment)window.history.replaceState(null,"",window.location.pathname);
 return {token,cloudflare:!!cfToken};
}
export default function AdminResetPage(){
 const [{token,cloudflare}]=useState(captureToken);
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false);
 const [complete,setComplete]=useState(false);
 const [error,setError]=useState("");
 async function submit(event:React.FormEvent){
  event.preventDefault();
  if(!token){setError("דער איינמאליגער לינק פעלט אדער איז שוין אוועקגענומען.");return;}
  if(password.length<12){setError("דער נייער פעסווארד מוז זיין צום ווייניגסטנס 12 צייכנס.");return;}
  if(password!==confirm){setError("ביידע פעסווארדער שטימען נישט.");return;}
  setBusy(true);setError("");
  try{
   const response=await fetch(cloudflare?"/api/auth/admin-reset/cloudflare":"/api/auth/admin-reset/complete",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token,newPassword:password})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"די איינמאליגע לינק ארבעט נישט אדער איז שוין אויסגעלאפן.");
   setComplete(true);setPassword("");setConfirm("");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 }
 return <Layout><main className="mx-auto max-w-lg px-4 py-16 space-y-5" lang="yi" dir="rtl">
  <h1 className="text-2xl font-bold">גבהה — איינמאליגער אדמין־פעסווארד</h1>
  {complete?<div className="border rounded-xl p-5 space-y-4">
   <p className="font-semibold">דער פעסווארד איז סוקסעספול געביטן!</p>
   <p>דער לינק איז פארברענט. אלע אלטע אדמין־סעסיעס זענען אפגעשלאסן. לאג זיך אריין נאכאמאל.</p>
   <Link href="/login" className="underline font-semibold">אריינלאגן מיטן נייעם פעסווארד</Link>
  </div>:<div className="border rounded-xl p-5 space-y-4">
   <p className="text-sm text-muted-foreground">דער איינמאליגער לינק איז גילטיג בלויז אין די 10 מינוט וואס דער אייגנטימער האט באשטימט אין Cloudflare, און קען ווערן גענוצט נאר איין מאל.</p>
   {!token?<p role="alert" className="text-red-700">דער איינמאליגער Cloudflare־שליסל פעלט. עפן דעם גאנצן בעל־הבית־לינק נאך דעם וואס דער שליסל איז אקטיוו אין Cloudflare.</p>:
   <form onSubmit={submit} className="space-y-4">
    <label className="block space-y-2"><span className="font-semibold">נייער פעסווארד (מינדestens 12 צייכנס)</span>
      <Input type="password" autoComplete="new-password" value={password} minLength={12} maxLength={256} required onChange={e=>setPassword(e.target.value)}/></label>
    <label className="block space-y-2"><span className="font-semibold">שרייב איבער דעם נייעם פעסווארד</span>
      <Input type="password" autoComplete="new-password" value={confirm} minLength={12} maxLength={256} required onChange={e=>setConfirm(e.target.value)}/></label>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <Button type="submit" disabled={busy||password.length<12||password!==confirm} className="w-full">
     {busy?"מען טוישט...":"טוישן דעם אדמין־פעסווארד"}
    </Button>
   </form>}
  </div>}
  <p className="text-sm text-muted-foreground">ביים Cloudflare־וועג דארף דער בעל־הבית קודם זעלבסט אריינלייגן דעם איינמאליגן געהיימען באווייז אין די Worker־איינשטעלונגען. עס ווערט נישט געשיקט קיין אימעיל. טייל דעם לינק נישט מיט קיינעם.</p>
 </main></Layout>;
}
