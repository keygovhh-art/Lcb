// Bridge ONLY the telephone's scoped, authenticated Campaign Center actions.
// Campaign Center independently owns its Neon Auth members, PIN hashes,
// organization roles, and per-call authorization sessions. No G user ID or
// personal data is mapped or merged across products.
type RequestAction="login"|"snapshot"|"logout";
export type CampaignPhoneSnapshot={
 authenticated:boolean;
 owner?:string;
 organizationCount?:number;
 organizations?:Array<{id:string;name:string;role:string}>;
};
export async function campaignPhoneBridge(action:RequestAction,callHash:string,pin?:string):Promise<CampaignPhoneSnapshot>{
 const secret=process.env.YEMOT_CENTRAL_SHARED_SECRET||"";
 if(secret.length<32)throw Error("Campaign Center phone identity bridge is not configured");
 if(!/^[a-f0-9]{64}$/.test(callHash))throw Error("Invalid scoped call binding");
 const raw=process.env.CAMPAIGN_CENTER_PHONE_API_URL||"https://gavhah-campaign-center.onrender.com";
 const host=new URL(raw);
 // Do not use a user-supplied address or forward service secrets to other hosts.
 if(host.protocol!=="https:"||host.hostname!=="gavhah-campaign-center.onrender.com"||
   host.username||host.password||host.port||host.search||host.hash)
   throw Error("Invalid Campaign Center phone service origin");
 const endpoint=new URL("/api/phone/service/"+action,host.origin);
 const r=await fetch(endpoint,{
  method:"POST",headers:{"Content-Type":"application/json","x-gavhah-connect-secret":secret},
  body:JSON.stringify({callHash,...(action==="login"?{pin}: {})}),
  signal:AbortSignal.timeout(9000),cache:"no-store",redirect:"error"
 });
 const payload:unknown=await r.json().catch(()=>({authenticated:false}));
 const result:CampaignPhoneSnapshot=payload&&typeof payload==="object"&&"authenticated" in payload&&
  typeof payload.authenticated==="boolean" ? payload as CampaignPhoneSnapshot:{authenticated:false};
 if(!r.ok){
  if(r.status===401||r.status===403)return{authenticated:false};
  throw Error("Campaign Center telephone membership service unavailable");
 }
 return result;
}
