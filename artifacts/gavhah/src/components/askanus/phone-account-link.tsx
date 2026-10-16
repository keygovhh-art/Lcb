import { useState } from "react";
import { Button } from "@/components/ui/button";

// One-time site session -> telephone bridge. The code is generated only on the
// authenticated website, never sent to the user's phone by an outside service.
export function PhoneAccountLink(){
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const create=async()=>{
  setBusy(true);setCode("");setMessage("");
  try{
   const res=await fetch("/api/phone/account-code",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
   const result=await res.json();
   if(!res.ok)throw Error(String(result.error||"Could not create code"));
   setCode(result.code);
   setMessage("Code expires in five minutes. Call 605-562-1286, press 1 for Gavhah, 2 for My Askanus, then 5 to securely link your session. Never share the code.");
  }catch(e){setMessage(e instanceof Error?e.message:"Phone linking is temporarily unavailable");}
  finally{setBusy(false);}
 };
 return <section className="border rounded-xl bg-card p-4 mt-4" aria-label="Connect my phone">
  <h3 className="text-base font-semibold text-foreground mb-1">Connect My Askanus to the hotline</h3>
  <p className="text-sm text-muted-foreground">Use a temporary code to access only your own tasks, cases and notes on the phone. The code expires after five minutes. Voice controls use English during testing.</p>
  <div className="mt-3 flex flex-wrap gap-3 items-center">
   <Button onClick={create} disabled={busy}>{busy?"Preparing secure code...":"Generate 8-digit phone code"}</Button>
   {code&&<span role="status" className="font-mono text-2xl tracking-widest text-foreground select-text">{code}</span>}
  </div>
  {message&&<p role="status" className="text-sm mt-2 text-foreground">{message}</p>}
 </section>;
}
