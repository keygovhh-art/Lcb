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
import router from "./routes";
import {pool} from "@workspace/db";
import {PostgresSessionStore} from "./lib/postgres-session-store";
import {sessionOptions,usesPostgresSessions} from "./lib/session-options";

const app:Express=express();
app.set("trust proxy",1);

// A Cloudflare-native, non-pino request logger avoids CJS pino-http startup
// defects while keeping req.log.error usable in our current error middleware.
app.use((req,_res,next)=>{
 (req as typeof req & {log:{error:(info:unknown,message:string)=>void}}).log={
  error(info:unknown,message:string){
   const error=info&&typeof info==="object"&&"err" in info?
    (info as {err?:{message?:string}}).err?.message:"";
   console.error("Gavhah Cloudflare API",message,String(error||"error"));
  }
 };
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
app.use(express.json({limit:"3mb"}));
app.use(express.urlencoded({extended:true,limit:"100kb"}));

const env=process.env;
if(env.CF_WORKER_RUNTIME==="1"){
 if(env.SESSION_STORE!=="postgres")throw Error("Native Cloudflare requires SESSION_STORE=postgres");
 if(env.SESSION_COOKIE_SECURE!=="true")throw Error("Native Cloudflare requires secure session cookies");
}
app.use(session({
 ...sessionOptions(env),
 ...(usesPostgresSessions(env)?{store:new PostgresSessionStore(pool)}:{})
}));
app.use("/api",router);
app.use("/api",(_req,res)=>{res.status(404).json({error:"API route not found"});});
app.use(((err,req,res,next)=>{
 req.log.error({err},"Request failed");
 if(res.headersSent)return next(err);
 res.status(500).json({error:"Internal server error"});
}) as ErrorRequestHandler);
export default app;
