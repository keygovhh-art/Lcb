import { Router, type Request, type Response } from "express";
import { handleYemotApp } from "../lib/yemot-api-driven-phone";
import {forwardCampaign4444} from "../lib/yemot-campaign-bridge";

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
  "2":group("Campaign Center",{
    "1":group("Campaigns",{
      "1":leaf("My campaigns","/"),"2":leaf("Campaign dashboard","/"),
      "3":leaf("Campaign goals and status","/"),"4":leaf("Campaign settings","/")
    }),
    "2":group("Tasks and follow ups",{
      "1":leaf("My work today","/"),"2":leaf("Assigned tasks","/"),
      "3":leaf("Callbacks and follow ups","/"),"4":leaf("Activity history","/")
    }),
    "3":group("Contacts and calls",{
      "1":leaf("Donor contacts","/"),"2":leaf("Call lists","/"),
      "3":leaf("Claim or release a lead","/"),"4":leaf("Manual call results","/"),
      "5":leaf("Do Not Call protection","/")
    }),
    "4":group("Donations and finance",{
      "1":leaf("Pledges","/"),"2":leaf("Manual receipts","/"),
      "3":leaf("Net campaign reporting","/"),"4":leaf("Corrections and audit","/")
    }),
    "5":group("Teams and members",{
      "1":leaf("Team dashboard","/"),"2":leaf("Squads and departments","/"),
      "3":leaf("Invitations and permissions","/"),"4":leaf("Member progress","/")
    }),
    "6":group("Virtual fundraising hall",{
      "1":leaf("Open fundraising hall","/"),"2":leaf("Live room check in","/"),
      "3":leaf("Program schedule","/"),"4":leaf("Help desk","/"),
      "5":leaf("Audio or video stream","/")
    }),
    "7":group("Hitkabtzu conferences",{
      "1":leaf("Conference directory","/"),"2":leaf("Join an assembly","/"),
      "3":leaf("Speaker controls","/"),"4":leaf("Access and moderation","/")
    }),
    "8":group("Reports and management",{
      "1":leaf("Manager overview","/"),"2":leaf("Activity log","/"),
      "3":leaf("Export or import","/"),"4":leaf("Campaign accounting","/")
    }),
    "9":group("Plans and connections",{
      "1":group("Six upgrade plans",{
        "1":leaf("Askan Plus plan","/"),
        "2":leaf("Chesed Quick plan","/"),
        "3":leaf("Askan Pro plan","/"),
        "4":leaf("Gabbai Pro plan","/"),
        "5":leaf("Organization plan","/"),
        "6":leaf("Custom plan","/")
      }),"2":leaf("Gavhah MAX Connect","/"),
      "3":leaf("Central Yemot phone status","/"),"4":leaf("Special integrations","/")
    })
  })
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
  const pre=path==="1" ? "Gavhah." : path==="2" ? "Campaign Center." : path==="" ? "Welcome to Gavhah and Campaign Center." : "";
  const choices=Object.entries(children).map(([digit,item])=>"Press "+digit+" for "+item.label+".").join(" ");
  return [pre,choices,path?"Press zero to go back.":""].filter(Boolean).join(" ").replace(/[&=,\r\n]/g," ").slice(0,1200);
}
const router=Router();
// Exactly one Yemot API callback; all menus, filters, and per-call steps live
// in our own application and Neon DB. No provider-side child menu required.
router.all("/yemot/ivr",(req:Request,res:Response,next)=>{
  void handleYemotApp(req,res,phoneTree).catch(next);
});
// Campaign Center on the old line is a separate, authenticated /4444 callback.
router.all("/yemot/ivr/4444",(req:Request,res:Response,next)=>{
  // Roll out safely: old read-only Campaign menu until BOTH services have
  // the deliberately configured shared secret; then use CC's separate DB.
  const connected=(process.env.CC_GAVHAH_BRIDGE_SECRET||"").length>=40;
  void (connected?forwardCampaign4444(req,res):handleYemotApp(req,res,phoneTree)).catch(next);
});
// Isolated replacement-line sandbox: same Gavhah logic and Neon data,
// DIFFERENT callback digest; does not invoke Yemot provider settings.
router.all("/yemot/next-ivr",(req:Request,res:Response,next)=>{
  void handleYemotApp(req,res,phoneTree).catch(next);
});
export default router;
