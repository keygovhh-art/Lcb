import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Always executed in the regular authenticated Gavhah WEBSITE session.
// No password is sent to Yemot, and the underlying normal web password is
// separate from the phone-only numerical PIN.
export function GavhahPhonePinPanel(){
 const [pin,setPin]=useState("");
 const [password,setPassword]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const save=async()=>{
  setBusy(true);setMessage("");
  try{
   if(!/^[0-9]{12,16}$/.test(pin))throw Error("Use 12 to 16 digits.");
   const response=await fetch("/api/account/phone-pin",{
    method:"PUT",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({pin,currentPassword:password})
   });
   const value=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(value.error||"Could not save your hotline PIN");
   setMessage("Your Gavhah hotline PIN is securely linked to this Gavhah website account. Campaign Center needs its own separate PIN.");
   setPin("");setPassword("");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not save your PIN");}
  finally{setBusy(false);}
 };
 return <section className="mt-4 rounded-xl border p-4 space-y-3">
  <h3 className="font-semibold text-lg">Gavhah — My permanent hotline PIN</h3>
  <p className="text-sm text-muted-foreground">Choose a separate numerical PIN for the hotline. It does not replace your website password. Use at least twelve digits, and keep the PIN private.</p>
  <label htmlFor="gavhah-phone-secret" className="text-sm font-medium block">12–16 digit telephone PIN</label>
  <Input id="gavhah-phone-secret" type="password" dir="ltr" inputMode="numeric"
   autoComplete="new-password" pattern="[0-9]{12,16}" minLength={12} maxLength={16}
   value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,""))}
   placeholder="Twelve to sixteen digits"/>
  <label htmlFor="gavhah-current-password" className="text-sm font-medium block">Confirm your current Gavhah website password</label>
  <Input id="gavhah-current-password" type="password" dir="ltr" autoComplete="current-password"
   value={password} onChange={e=>setPassword(e.target.value)}/>
  <Button type="button" disabled={busy||!password||!/^[0-9]{12,16}$/.test(pin)} onClick={()=>void save()}>
   {busy?"Saving...":"Save private Gavhah hotline PIN"}
  </Button>
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
export function GavhahAdminPhonePinPanel(){
 const [memberId,setMemberId]=useState("");
 const [pin,setPin]=useState("");
 const [password,setPassword]=useState("");
 const [response,setResponse]=useState("");
 const [busy,setBusy]=useState(false);
 const assign=async()=>{
  setBusy(true);setResponse("");
  try{
   const r=await fetch("/api/admin/phone/member-pin",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({userId:Number(memberId),adminPassword:password,...(pin?{pin}:{})})
   });
   const value=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(value.error||"Could not issue a PIN");
   setResponse(value.oneTimePin?"One-time private PIN: "+value.oneTimePin:
    "Member hotline PIN updated.");
   setPin("");setPassword("");
  }catch(e){setResponse(e instanceof Error?e.message:"PIN assignment failed");}
  finally{setBusy(false);}
 };
 return <section className="rounded-xl border p-4 space-y-2">
  <h3 className="font-semibold">Member Hotline PIN — Gavhah administration</h3>
  <p className="text-sm">Assign or reset ONLY a Gavhah member's PIN. Campaign Center accounts are administered separately on the Campaign Center website.</p>
  <Input type="number" min="1" placeholder="Gavhah member ID" value={memberId} onChange={e=>setMemberId(e.target.value)}/>
  <Input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Optional 12–16 digit custom PIN, or leave blank to generate" maxLength={16}
   value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/>
  <Input type="password" autoComplete="current-password" placeholder="Your own administrator website password"
   value={password} onChange={e=>setPassword(e.target.value)}/>
  <Button disabled={busy||!memberId||!password||(!!pin&&!/^[0-9]{12,16}$/.test(pin))}
   onClick={()=>void assign()}>{busy?"Saving...":"Issue / Replace Gavhah member PIN"}</Button>
  {response&&<p className="text-sm" role="status">{response}</p>}
 </section>;
}
