/**
 * Independent Cloudflare-only Express bootstrap.
 *
 * Uses the exact Gavhah application routers/Neon database and persistent
 * session-store as Render, WITHOUT importing Render's pino-http middleware:
 * pino-http's CJS logger initialization crashes in workerd (stringifySym).
 *
 * This app owns its own HTTP listener on the Cloudflare nodejs compatibility
 * port; it never proxies or fetches Render.
 */
import express,{type Express,type ErrorRequestHandler} from "express";
import cors from "cors";
import session from "express-session";
import {randomUUID} from "node:crypto";
import router from "./routes";
import {pool} from "@workspace/db";
import {PostgresSessionStore} from "./lib/postgres-session-store";
import {sessionOptions,usesPostgresSessions} from "./lib/session-options";

const app:Express=express();
app.set("trust proxy",1);

// Cloudflare-only structured incident tracker. Does not log identifiers,
// cookies, request bodies, SQL, passwords, or untrusted exception messages.
function errorCategory(error:unknown):string{
 const obj=error&&typeof error==="object"?error as {message?:unknown;code?:unknown}:null;
 const msg=typeof obj?.message==="string"?obj.message:"";
 const code=typeof obj?.code==="string"?obj.code:"";
 if(code==="ETIMEDOUT"||/timeout/i.test(msg))return "db_timeout";
 if(code==="ECONNRESET"||code==="ECONNREFUSED"||/connection terminated|connection closed|not queryable/i.test(msg))return "db_connection";
 if(/different request|request context/i.test(msg))return "worker_io_context";
 if(/app_sessions|session store/i.test(msg))return "session_store";
 if(/^28P01$|^3D000$|^42P01$/.test(code))return "db_configuration";
 if(code.startsWith("08"))return "db_connection";
 return "unclassified";
}
function safeErrorCode(error:unknown):string|undefined{
 const code=error&&typeof error==="object"&&(error as {code?:unknown}).code;
 return typeof code==="string"&&/^[A-Za-z0-9_]{2,16}$/.test(code)?code:undefined;
}
app.use((req,res,next)=>{
 const started=Date.now();
 const requestId=randomUUID();
 res.locals.gavhahRequestId=requestId;
 res.locals.gavhahStage="request.initial";
 res.setHeader("X-Request-ID",requestId);
 (req as unknown as {log:{error:(info:unknown,message:string)=>void}}).log={
  error(info:unknown,_message:string){
   const error=info&&typeof info==="object"&&"err" in info?
     (info as {err?:unknown}).err:undefined;
   console.error(JSON.stringify({
    event:"gavhah.api.error",requestId,at:new Date().toISOString(),
    stage:String(res.locals.gavhahStage||"unknown").slice(0,72),
    method:req.method,route:req.path,status:res.statusCode,
    category:errorCategory(error),code:safeErrorCode(error),
    durationMs:Date.now()-started
   }));
  }
 };
 res.once("finish",()=>{
  if(res.statusCode>=500){
   console.error(JSON.stringify({
    event:"gavhah.api.http_5xx",requestId,at:new Date().toISOString(),
    stage:String(res.locals.gavhahStage||"unknown").slice(0,72),
    method:req.method,route:req.path,status:res.statusCode,
    durationMs:Date.now()-started
   }));
  }
 });
 next();
});
if(process.env.NODE_ENV!=="production")
 app.use(cors({origin:true,credentials:true}));
app.use((_req,res,next)=>{
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("X-Frame-Options","SAMEORIGIN");
 res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
 if(process.env.NODE_ENV==="production")
  res.setHeader("Strict-Transport-Security","max-age=15552000");
 next();
});
app.use(express.json({limit:"8mb"}));
app.use(express.urlencoded({extended:true,limit:"100kb"}));

const env=process.env;
if(env.CF_WORKER_RUNTIME==="1"){
 if(env.SESSION_STORE!=="postgres")throw Error("Native Cloudflare requires SESSION_STORE=postgres");
 if(env.SESSION_COOKIE_SECURE!=="true")throw Error("Native Cloudflare requires secure session cookies");
}
app.use((req,res,next)=>{
 if(env.CF_WORKER_RUNTIME==="1")res.locals.gavhahStage="session.load";
 next();
});
app.use(session({
 ...sessionOptions(env),
 ...(usesPostgresSessions(env)?{store:new PostgresSessionStore(pool)}:{})
}));
app.use("/api",router);
app.use("/api",(_req,res)=>{res.status(404).json({error:"API route not found"});});
app.use(((err,req,res,next)=>{
 req.log.error({err},"Request failed");
 if(res.headersSent)return next(err);
 res.setHeader("Cache-Control","no-store");
 res.status(500).json({
  error:"Internal server error",
  requestId:res.locals.gavhahRequestId,
  category:errorCategory(err),
 });
}) as ErrorRequestHandler);
export default app;
