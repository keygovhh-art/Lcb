import { Router, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";

// Complete PHONE NAVIGATION MAP, not a claim of completed phone features.
// The menu currently ONLY names modules. Caller phone numbers are NOT identity.
type Item = { label: string; details?: string; web?: string; children?: Record<string, Item>; phone: "menu" | "roadmap" };
const group=(label:string,children:Record<string,Item>):Item=>({label,children,phone:"menu"});
const leaf=(label:string,web:string,details="This module is mapped. Private actions require a separately verified telephone sign-in."):Item=>({label,web,details,phone:"roadmap"});
export const phoneTree: Record<string,Item> = {
  "1":group("Gavhah. Global Kindness Network",{
    "1":group("News and updates",{
      "1":leaf("Latest news","/news"),"2":leaf("Community notices","/news"),"3":leaf("Important alerts","/notifications"),
      "4":leaf("Open a selected news article","/news/:id")
    }),
    "2":group("My Askanus and MAX",{
      "1":leaf("Today's tasks","/my"),"2":leaf("Projects and goals","/my"),
      "3":leaf("Personal history","/my"),"4":leaf("MAX personal dashboard","/communications")
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
      "3":leaf("Search","/search"),"4":leaf("Sign in or link my account","/login"),
      "5":leaf("Create an account","/register"),"6":leaf("Privacy information","/privacy"),
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
        "1":leaf("Personal Askan plan","/"),
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
router.all("/yemot/ivr",async(req:Request,res:Response)=>{
  // This is intentionally public-information ONLY, with a separate provider
  // callback secret. Never query users, donations, or account private data.
  const supplied=String(req.body?.entryKey??req.query.entryKey??"");
  if(!/^[a-f0-9]{64}$/.test(supplied))
    return res.status(403).type("text/plain").send("Access denied");
  const stored=await pool.query("SELECT callback_hash,state FROM public.gavhah_yemot_ivr_install WHERE id=1");
  const known=stored.rows[0]?.callback_hash;
  const claimed=stored.rows[0]?.state;
  const hashed=createHash("sha256").update(supplied).digest("hex");
  if(typeof known!=="string" || !["installing","live"].includes(claimed) ||
     known.length!==hashed.length || !timingSafeEqual(Buffer.from(known),Buffer.from(hashed)))
    return res.status(403).type("text/plain").send("Access denied");
  const active=await pool.query("SELECT enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1");
  if(!active.rows[0]?.enabled||!active.rows[0]?.last_verified_at)
    return res.status(503).type("text/plain").send("Hotline integration not yet enabled");
  // Each read uses a fresh parameter name; provider sends all earlier
  // values back. Never treat a phone number or ApiCallId as a login.
  let path="";
  for(let step=0;step<4;step++){
    const value=req.body?.["nav"+step]??req.query["nav"+step];
    if(value===undefined||value===null)break;
    const digit=String(value);
    if(!/^[0-9]$/.test(digit))break;
    if(digit==="0"){path=path.slice(0,-1);continue;}
    const next=path+digit;
    if(!phoneNode(next))break;
    path=next;
  }
  const current=path?phoneNode(path):undefined;
  res.set("Cache-Control","no-store").type("text/plain; charset=utf-8");
  if(current&&!current.children){
    const details=(current.details||"This section is online only for now.")+" Returning to your menu.";
    // Complete the voice message and let Yemot return to the configured menu.
    return res.send("id_list_message=t-"+details.replace(/[&=,\r\n]/g," ").slice(0,350));
  }
  const depth=Math.min(path.length,4);
  // Yemot's read contract: variable, confirm, digits count, minimum count,
  // wait timeout, data type and repetition. Keep it deliberately minimal:
  // nav0,no,1,1,8,Digits,yes (documented provider API response pattern).
  const readOptions=["nav"+depth,"no","1","1","8","Digits","yes"].join(",");
  return res.send("read=t-"+phonePrompt(path)+"="+readOptions);
});
export default router;
