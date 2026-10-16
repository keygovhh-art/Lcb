import { useState } from "react";
import { Button } from "@/components/ui/button";
type VoiceNote={id:number;title:string;createdAt:string;audioUrl:string};
export function PrivatePhoneVoiceNotes(){
 const [notes,setNotes]=useState<VoiceNote[]>([]);
 const [loading,setLoading]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const load=async()=>{
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/askanus/phone-voice-notes",{credentials:"same-origin",cache:"no-store"});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(body.error||"Voice notes could not be loaded");
   setNotes(Array.isArray(body)?body:[]);setLoaded(true);
  }catch(e){setError(e instanceof Error?e.message:"Voice notes unavailable");}
  finally{setLoading(false);}
 };
 return <section className="rounded-xl border bg-card p-5 space-y-3">
   <h3 className="font-semibold text-lg">My private hotline voice notes</h3>
   <p className="text-sm text-muted-foreground">
     Record a voice note from your verified Gavhah phone account. Only you can open the audio through this site's authenticated My Askanus page.
     A recording is not public news, a group message, or a shared Campaign Center account.
   </p>
   <Button type="button" variant="outline" disabled={loading} onClick={()=>void load()}>
    {loading?"Loading private notes...":"Refresh my hotline voice notes"}
   </Button>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {loaded&&!loading&&!notes.length&&<p className="text-sm text-muted-foreground">No telephone recordings have been saved to your Gavhah account.</p>}
   {notes.map(note=><div key={note.id} className="rounded-lg border p-3 space-y-2">
    <p className="font-medium">{note.title} — #{note.id}</p>
    <audio controls preload="none" className="w-full" src={note.audioUrl} aria-label={"Private phone voice note "+note.id}/>
   </div>)}
 </section>;
}