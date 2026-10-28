import { Router } from "express";
import { createHash } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    adminEmailEnrollmentUntil?: number;
    adminEmailEnrollmentUserId?: number;
    userRole?: string;
    linkedUserIds?: number[];
    linkedPasswordVersions?: Record<string,string>;
  }
}

const router = Router();
const MAX_LINKED_ACCOUNTS = 8;
const passwordVersion=(hash:string)=>createHash("sha256").update(hash).digest("hex");

const linkedUsers = (ids: unknown, current?: number) =>
  [...new Set([...(Array.isArray(ids) ? ids : []).filter(
    (id): id is number => Number.isSafeInteger(id) && id > 0
  ),...(current ? [current] : [])])].slice(-MAX_LINKED_ACCOUNTS);

function originMatches(req: import("express").Request): boolean {
  const origin=req.get("origin");
  if (!origin) return true;
  try {
    const url=new URL(origin);
    return url.host === (req.get("x-forwarded-host") || req.get("host"));
  } catch { return false; }
}

// Never authorize another account from a client-supplied userId alone.
// A linked account is registered only after verifying its password.
async function verifyAccount(identifier: unknown,password: unknown) {
  if(typeof identifier!=="string"||typeof password!=="string"||
     !identifier.trim() || !password || identifier.length>320) {
    return {error:"An account identifier and password are required",status:400 as const};
  }
  // Real phone-registered members can enter M + the 10-digit ID
  // received after double-confirming their private keypad password.
  // Caller ID is not a login identity; this is the same website users table.
  const memberNumber=/^M([0-9]{10})$/i.exec(identifier.trim());
  let user;
  if(memberNumber){
    const linked=await pool.query<{user_id:number}>(
      "SELECT user_id FROM public.gavhah_phone_member_logins WHERE member_no=$1",
      [memberNumber[1]]);
    if(linked.rows[0]){
      [user]=await db.select().from(usersTable).where(eq(usersTable.id,linked.rows[0].user_id));
    }
  }else{
    const isEmail=identifier.includes("@");
    [user]=await db.select().from(usersTable).where(
      isEmail?eq(usersTable.email,identifier.toLowerCase().trim()):
        eq(usersTable.phone,identifier.trim())
    );
  }
  // Same response for unknown identities and incorrect passwords.
  if(!user || !await verifyPassword(password,user.passwordHash))
    return {error:"Invalid credentials",status:401 as const};
  if(user.status === "banned"||user.status==="suspended")
    return {error:"Account unavailable",status:403 as const};
  return {user};
}


const loginLimiter = createRateLimiter({
  name: "login",
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});

function safeUser<T extends { passwordHash?: unknown }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user as T & { passwordHash?: unknown };
  return safe;
}

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.status === "banned" || user.status === "suspended") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account unavailable" });
    return;
  }
  req.session.userRole = user.role;
  res.json(safeUser(user));
});

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  if (!identifier || !password) {
    res.status(400).json({ error: "Email/phone and password are required" });
    return;
  }

  if(!originMatches(req)){res.status(403).json({error:"Invalid origin"});return;}
  const result=await verifyAccount(identifier,password);
  if(!result.user){res.status(result.status||401).json({error:result.error});return;}
  const user=result.user;
  const linked=linkedUsers(req.session.linkedUserIds,req.session.userId);
  const linkedVersions={...req.session.linkedPasswordVersions};
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve());
  });
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.linkedUserIds=linkedUsers([...linked,user.id]);
  req.session.linkedPasswordVersions={...linkedVersions,[user.id]:passwordVersion(user.passwordHash)};
  res.setHeader("Cache-Control","private, no-store");
  res.json({ user: safeUser(user) });
});

// The chooser contains only identities already authenticated within this
// server-side session, and never returns another account's private profile.
router.get("/auth/accounts", requireAuth, async(req,res):Promise<void>=>{
  res.setHeader("Cache-Control","private, no-store");
  const ids=linkedUsers(req.session.linkedUserIds,req.session.userId);
  const accounts: Array<{id:number;nickname:string|null;name:string;role:string;active:boolean}>=[];
  for(const id of ids){
    const [user]=await db.select({
      id:usersTable.id,nickname:usersTable.nickname,name:usersTable.name,
      role:usersTable.role,status:usersTable.status,passwordHash:usersTable.passwordHash,
    }).from(usersTable).where(eq(usersTable.id,id));
    if(user && user.status!=="suspended" && user.status!=="banned" &&
       (id===req.session.userId ||
        req.session.linkedPasswordVersions?.[id]===passwordVersion(user.passwordHash))){
      accounts.push({id:user.id,nickname:user.nickname,name:user.name,role:user.role,active:user.id===req.session.userId});
    }
  }
  res.json({accounts,max:MAX_LINKED_ACCOUNTS});
});

router.post("/auth/accounts/add",requireAuth,loginLimiter,async(req,res):Promise<void>=>{
  if(!originMatches(req)){res.status(403).json({error:"Invalid origin"});return;}
  const linked=linkedUsers(req.session.linkedUserIds,req.session.userId);
  if(linked.length>=MAX_LINKED_ACCOUNTS){
    res.status(409).json({error:"Remove another account before adding more"});return;
  }
  const result=await verifyAccount(req.body?.identifier,req.body?.password);
  if(!result.user){res.status(result.status||401).json({error:result.error});return;}
  req.session.linkedUserIds=linkedUsers([...linked,result.user.id]);
  req.session.linkedPasswordVersions={...(req.session.linkedPasswordVersions||{}),[result.user.id]:passwordVersion(result.user.passwordHash)};
  await new Promise<void>((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
  res.setHeader("Cache-Control","private, no-store");
  res.json({ok:true,id:result.user.id,nickname:result.user.nickname});
});

// Switching changes authorization for *all* APIs, therefore rotate the
// session cookie and require clients to clear their old account's query cache.
router.post("/auth/accounts/switch",requireAuth,async(req,res):Promise<void>=>{
  if(!originMatches(req)){res.status(403).json({error:"Invalid origin"});return;}
  const id=Number(req.body?.userId);
  const linked=linkedUsers(req.session.linkedUserIds,req.session.userId);
  if(!Number.isSafeInteger(id)||!linked.includes(id)){
    res.status(403).json({error:"This account was not verified in your session"});return;
  }
  const [user]=await db.select().from(usersTable).where(eq(usersTable.id,id));
  if(!user||user.status==="banned"||user.status==="suspended"){
    res.status(403).json({error:"Account unavailable"});return;
  }
  if(req.session.linkedPasswordVersions?.[id]!==passwordVersion(user.passwordHash)){
    res.status(403).json({error:"Account password changed; please verify this account again"});return;
  }
  const verifiedVersions={...req.session.linkedPasswordVersions};
  await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.userId=user.id;
  req.session.userRole=user.role;
  req.session.linkedUserIds=linked;
  req.session.linkedPasswordVersions=verifiedVersions;
  await new Promise<void>((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
  res.setHeader("Cache-Control","private, no-store");
  res.json({ok:true,user:safeUser(user)});
});

router.post("/auth/accounts/remove",requireAuth,async(req,res):Promise<void>=>{
  if(!originMatches(req)){res.status(403).json({error:"Invalid origin"});return;}
  const id=Number(req.body?.userId);
  if(!Number.isSafeInteger(id)||id===req.session.userId){
    res.status(400).json({error:"You cannot remove your current account; switch first"});return;
  }
  const ids=linkedUsers(req.session.linkedUserIds,req.session.userId);
  if(!ids.includes(id)){res.status(404).json({error:"Linked account not found"});return;}
  req.session.linkedUserIds=ids.filter(v=>v!==id);
  if(req.session.linkedPasswordVersions)delete req.session.linkedPasswordVersions[id];
  res.setHeader("Cache-Control","private, no-store");
  res.json({ok:true});
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "New password must be different" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  req.session.linkedPasswordVersions={...(req.session.linkedPasswordVersions||{}),[userId]:passwordVersion(passwordHash)};
  res.json({ ok: true });
});


/**
 * Owner email enrollment to the SAME, preexisting super_admin account.
 * No extra role or password creation, no login without the CURRENT password.
 * Proof is limited to 10 minutes, one email update per verified session.
 */
const adminEmailSetupLimiter=createRateLimiter({
 name:"admin-email-enrollment",windowMs:10*60*1000,max:5,
 message:"Too many authentication attempts; wait before retrying."
});
router.post("/auth/admin-email-enrollment/start",adminEmailSetupLimiter,async(req,res,next)=>{
 try{
  if(!originMatches(req))return void res.status(403).json({error:"Invalid origin"});
  const password=typeof req.body?.password==="string"?req.body.password:"";
  if(password.length<8||password.length>256)
   return void res.status(400).json({error:"Enter your existing administrator password"});
  const result=await pool.query<{id:number;password_hash:string;role:string;status:string}>(
   "SELECT id,password_hash,role,status FROM public.users WHERE role='super_admin' AND status='active' LIMIT 2"
  );
  const owner=result.rows.length===1?result.rows[0]:null;
  // Identical error for unknown owner and invalid password.
  if(!owner||!await verifyPassword(password,owner.password_hash))
   return void res.status(401).json({error:"Existing administrator password is incorrect"});
  await new Promise<void>((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
  req.session.userId=owner.id;
  req.session.userRole="super_admin";
  req.session.linkedUserIds=[owner.id];
  req.session.linkedPasswordVersions={[owner.id]:passwordVersion(owner.password_hash)};
  req.session.adminEmailEnrollmentUserId=owner.id;
  req.session.adminEmailEnrollmentUntil=Date.now()+10*60*1000;
  await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
  res.setHeader("Cache-Control","no-store");
  res.json({ok:true,validForSeconds:600,next:"/founder/connect-email"});
 }catch(error){next(error);}
});
function enrolled(req:import("express").Request){
 return Number.isSafeInteger(req.session.userId)&&
  req.session.userId===req.session.adminEmailEnrollmentUserId&&
  typeof req.session.adminEmailEnrollmentUntil==="number"&&
  req.session.adminEmailEnrollmentUntil>Date.now();
}
router.get("/auth/admin-email-enrollment/status",requireAuth,async(req,res,next)=>{
 try{
  if(!enrolled(req))return void res.status(403).json({error:"The 10-minute email setup has expired"});
  const list=await pool.query<{id:number;email:string|null}>(
   "SELECT id,email FROM public.users WHERE id=$1 AND role='super_admin' AND status='active'",
   [req.session.userId]);
  if(list.rows.length!==1)return void res.status(403).json({error:"Only the existing super-admin can change this email"});
  res.setHeader("Cache-Control","private,no-store");
  res.json({ok:true,existingEmail:list.rows[0].email||null,
   expiresAt:req.session.adminEmailEnrollmentUntil});
 }catch(error){next(error);}
});
router.post("/auth/admin-email-enrollment/save",requireAuth,async(req,res,next)=>{
 try{
  if(!originMatches(req))return void res.status(403).json({error:"Invalid origin"});
  if(!enrolled(req))return void res.status(403).json({error:"The one-time setup is no longer valid"});
  const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   return void res.status(400).json({error:"Provide a valid email address"});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const row=await client.query<{id:number;email:string|null}>(
    "SELECT id,email FROM public.users WHERE id=$1 AND role='super_admin' AND status='active' FOR UPDATE",
    [req.session.userId]);
   if(row.rows.length!==1)throw Error("Super-admin account missing");
   await client.query(
    "UPDATE public.users SET email=$1 WHERE id=$2 AND role='super_admin' AND status='active'",
    [email,req.session.userId]);
   await client.query("COMMIT");
  }catch(error){
   await client.query("ROLLBACK").catch(()=>{});
   if((error as {code?:string}).code==="23505")return void res.status(409).json({error:"This email already belongs to another account"});
   throw error;
  }finally{client.release();}
  req.session.adminEmailEnrollmentUntil=undefined;
  req.session.adminEmailEnrollmentUserId=undefined;
  await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
  res.setHeader("Cache-Control","private,no-store");
  res.json({ok:true,accountUnchanged:true,passwordUnchanged:true,role:"super_admin",
   message:"Existing super-admin email saved. The one-time 10-minute setup was consumed."});
 }catch(error){next(error);}
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => { res.json({ ok: true }); });
});

export { hashPassword };
export default router;
