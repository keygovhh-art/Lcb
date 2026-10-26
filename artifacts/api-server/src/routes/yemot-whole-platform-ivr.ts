import { Router, type Request, type Response } from "express";
import { handleYemotApp } from "../lib/yemot-api-driven-phone";

// Complete PHONE NAVIGATION MAP, not a claim of completed phone features.
// The menu currently ONLY names modules. Caller phone numbers are NOT identity.
type Item = { label: string; details?: string; web?: string; children?: Record<string, Item>; phone: "menu" | "roadmap" };
const group=(label:string,children:Record<string,Item>):Item=>({label,children,phone:"menu"});
const leaf=(label:string,web:string,details="This module is mapped. Private actions require a separately verified telephone sign-in."):Item=>({label,web,details,phone:"roadmap"});
export const phoneTree: Record<string,Item> = {
  "1":group("Gavhah. Global Kindness Network",{
    "1":group("News and updates",{
      "1":leaf("All updates, newest first","/news"),
      "2":group("Browse news categories",{
        "1":leaf("Emergency appeals","/news"),"2":leaf("Fundraising","/news"),
        "3":leaf("Announcements","/news"),"4":leaf("Volunteer calls","/news"),
        "5":leaf("Community alerts","/news"),"6":leaf("Organization updates","/news"),
        "7":leaf("Bikur Cholim","/news"),"8":leaf("Community","/news"),
        "9":leaf("Medical and wedding news","/news")
      }),
      "3":leaf("Important and critical news","/news"),
      "4":leaf("Featured updates","/news"),
      "5":leaf("Read an update by its article number","/news/:id")
    }),
    "2":group("My Askanus and MAX",{
      "1":leaf("My tasks, including marking complete","/my"),
      "2":leaf("My personal cases and goals","/my"),
      "3":leaf("My private notes","/my"),
      "4":leaf("My personal dashboard","/my"),
      "5":leaf("Securely link my website account by eight-digit code","/my"),
      "6":leaf("Log out of this phone session","/my")
    }),
    "3":group("People and contacts",{
      "1":leaf("Donor 360","/communications"),"2":leaf("Contacts","/communications"),
      "3":leaf("Pledges and receipts","/communications"),"4":leaf("Follow ups","/communications")
    }),
    "4":group("Calling center",{
      "1":leaf("My call queue","/communications"),"2":leaf("Call history","/communications"),
      "3":leaf("Calling permissions","/communications"),"4":leaf("Caller ID and provider status","/communications")
    }),
    "5":group("Kindness and help",{
      "1":leaf("Charity and campaigns","/charity"),"2":leaf("Ask for assistance","/united"),
      "3":leaf("Volunteer to help","/united"),"4":leaf("Community projects","/community-projects")
    }),
    "6":group("Community",{
      "1":leaf("Groups","/groups"),"2":leaf("Discussion forum","/forum"),
      "3":leaf("Directory","/directory"),"4":leaf("Connections","/connections"),
      "5":leaf("Create a forum post","/forum/new"),"6":leaf("Read a selected forum topic","/forum/:id"),
      "7":leaf("Open a selected group","/groups/:id")
    }),
    "7":group("Minyans and appointments",{
      "1":leaf("Minyan directory","/minyans"),"2":leaf("Reservations","/reservations")
    }),
    "8":group("Messages and account",{
      "1":leaf("Notifications","/notifications"),"2":leaf("My profile","/profile"),
      "3":leaf("Search","/search"),"4":leaf("Sign in or link my account","/login","For an existing Gavhah website account choose My Askanus, then press 5 and enter your one-time website pairing code. To create a new member entirely on the phone press 5 in this account menu."),
      "5":leaf("Create a Gavhah website member by phone","/register","Real keypad signup: choose and confirm your twelve to sixteen digit secret code to receive a member ID beginning with M. Website login accepts this member ID and your chosen code. Not a Campaign Center account."),"6":leaf("Privacy information","/privacy"),
      "7":leaf("Terms and conditions","/terms"),"8":leaf("Gavhah welcome homepage","/")
    }),
    "9":group("Management and reports",{
      "1":leaf("Personal overview","/dashboard"),"2":leaf("System center","/system"),
      "3":leaf("Super administrator","/founder"),
      "4":leaf("Group and staff settings","/group-team")
    })
  }),
  // A legacy digit 2 is informational ONLY. All Campaign Center menus and
  // credentials belong on its future independent phone number.
  "2":leaf("Campaign Center uses a separate phone number","/",
    "Campaign Center is no longer on this Gavhah line. Please call the separate Campaign Center number. Press zero to return to Gavhah.")
};
export function phoneNode(path:string):Item|undefined {
  let current:Item|undefined;
  let children=phoneTree;
  for(const part of path){
    current=children[part];
    if(!current)return;
    children=current.children||{};
  }
  return current;
}
export function phonePrompt(path:string):string {
  const children=path ? phoneNode(path)?.children : phoneTree;
  if(!children)return "This option is not available.";
  const pre=path==="1" ? "Gavhah." : path==="2" ? "Campaign Center moved." : path==="" ? "Welcome to Gavhah." : "";
  const choices=Object.entries(children).map(([digit,item])=>"Press "+digit+" for "+item.label+".").join(" ");
  return [pre,choices,path?"Press zero to go back.":""].filter(Boolean).join(" ").replace(/[&=,\r\n]/g," ").slice(0,1200);
}
const router=Router();
// Exactly one Yemot API callback; all menus, filters, and per-call steps live
// in our own application and Neon DB. No provider-side child menu required.
router.all("/yemot/ivr",(req:Request,res:Response,next)=>{
  void handleYemotApp(req,res,phoneTree).catch(next);
});
export default router;
