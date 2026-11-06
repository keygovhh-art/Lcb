import {useEffect,useState} from "react";
import {AvailabilityFields,defaultAvailability,type VolunteerAvailabilitySchedule} from "./availability-fields";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {useAuth} from "@/context/auth-context";
import {useLanguage} from "@/context/language-context";
import {useToast} from "@/hooks/use-toast";

export function EditMyVolunteerAvailability(){
 const {isAuthenticated,isLoaded}=useAuth();
 const {lang}=useLanguage(),yi=lang==="yi", {toast}=useToast();
 const [exists,setExists]=useState(false),[open,setOpen]=useState(false),[saving,setSaving]=useState(false);
 const [schedule,setSchedule]=useState<VolunteerAvailabilitySchedule>(defaultAvailability);
 useEffect(()=>{
  if(!isLoaded||!isAuthenticated){setExists(false);return;}
  let active=true;
  void fetch("/api/volunteers/mine",{credentials:"include",cache:"no-store"}).then(async response=>{
   if(!active)return;
   if(response.status===404){setExists(false);return;}
   if(!response.ok)return;
   const data=await response.json();
   if(!active)return;
   setExists(true);
   setSchedule(data.availabilitySchedule?.mode?data.availabilitySchedule:
    {...defaultAvailability(),mode:data.availability==="anytime"?"anytime":"daily"});
  }).catch(()=>{});
  return()=>{active=false};
 },[isLoaded,isAuthenticated]);
 if(!exists)return null;
 const save=async()=>{
  setSaving(true);
  try{
   const response=await fetch("/api/volunteers/mine/availability",{
    method:"PATCH",credentials:"include",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({availabilitySchedule:schedule})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(data.error||"Could not update"));
   setOpen(false);
   toast({title:yi?"די צייטן זענען אפגעהיטן":"Availability updated"});
  }catch(e){toast({title:yi?"נישט געלונגען":"Could not save",description:e instanceof Error?e.message:"",variant:"destructive"});}
  finally{setSaving(false);}
 };
 return <>
  <Button variant="outline" onClick={()=>setOpen(true)}>
   {yi?"טויש מיינע העלפן־צייטן":"Edit My Availability"}
  </Button>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir={yi?"rtl":"ltr"}>
    <DialogHeader><DialogTitle>{yi?"מיינע העלפן־צייטן":"My Volunteer Availability"}</DialogTitle></DialogHeader>
    <AvailabilityFields yi={yi} value={schedule} onChange={setSchedule}/>
    <Button disabled={saving} onClick={()=>void save()}>
     {saving?(yi?"היט אפ...":"Saving..."):(yi?"אפהיטן":"Save")}
    </Button>
   </DialogContent>
  </Dialog>
 </>;
}
