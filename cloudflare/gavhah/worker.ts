/**
 * Independent full Cloudflare Gavhah application: original Express API and
 * React SPA static assets live in ONE Cloudflare Worker. No Render proxy.
 * Uses the existing Neon PostgreSQL database with Worker runtime secrets.
 * Real phone callbacks require provider-secret and number verification.
 */
import {httpServerHandler} from "cloudflare:node";
import app from "../../artifacts/api-server/src/app-cloudflare";
import {inlineAssets} from "./generated-static-assets";

app.listen(8787);
const api=httpServerHandler({port:8787});
const mimeCache="public, max-age=600";
export default {
 async fetch(request:Request,env:unknown,ctx:unknown):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==="/api"||url.pathname.startsWith("/api/")){
   return api.fetch(request,env,ctx);
  }
  if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const path=url.pathname;
  const file=inlineAssets[path] || (path.startsWith("/assets/")?undefined:inlineAssets["/index.html"]);
  if(!file)return new Response("Not found",{status:404});
  // Build output is gzip-compressed and inlined into the Worker script itself;
  // no Cloudflare Pages, Render, CDN, or separate assets upload is required.
  const raw=atob(file.base64);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const gzipAccepted=/\\bgzip\\b/.test(request.headers.get("accept-encoding")||"");
  const headers=new Headers({
    "Content-Type":file.mime,
    "Cache-Control":path.startsWith("/assets/")?mimeCache:"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "Vary":"Accept-Encoding"
  });
  const body=gzipAccepted?bytes:new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  if(gzipAccepted)headers.set("Content-Encoding","gzip");
  return new Response(request.method==="HEAD"?null:body,{status:200,headers});
 }
};
