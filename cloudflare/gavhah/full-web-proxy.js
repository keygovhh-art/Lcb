/* Full website copy on Cloudflare; shared Render backend, Neon and phone routes untouched. */
const PREVIEW="https://gavhah-cloudflare-copy.keygovhh.workers.dev";
const UPSTREAM="https://gavhah.onrender.com";
const SAFE_METHODS=new Set(["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"]);
const ALLOWED_HEADERS=["accept","accept-language","authorization","cache-control","content-type","cookie","if-match","if-none-match","if-modified-since","range","user-agent","x-requested-with","x-csrf-token","x-xsrf-token","x-csrf"];
const PROVIDER_CALLBACK=/^\/api\/(?:signalwire\/|yemot\/(?:next-ivr|[^/]*hook|app))/i;
const PROVIDER_CONTROL=/^\/api\/admin\/hotline-migration(?:\/|$)/i;
addEventListener("fetch",event=>event.respondWith(handle(event.request)));
async function handle(request){
 const incoming=new URL(request.url);
 if(incoming.origin!==PREVIEW)return plain(421,"Unrecognized preview origin");
 if(!SAFE_METHODS.has(request.method))return plain(405,"Method not allowed",{"Allow":Array.from(SAFE_METHODS).join(", ")});
 if(PROVIDER_CALLBACK.test(incoming.pathname))return plain(403,"Phone callbacks remain on the original live hotline.");
 if(PROVIDER_CONTROL.test(incoming.pathname)&&!["GET","HEAD","OPTIONS"].includes(request.method))
  return plain(403,"Phone provider settings must be changed only from the live owner dashboard.");
 const isMutation=!["GET","HEAD","OPTIONS"].includes(request.method);
 if(isMutation){
  if(request.headers.get("Origin")!==PREVIEW)return plain(403,"Same-origin browser request required");
  const site=request.headers.get("Sec-Fetch-Site");
  if(site&&site!=="same-origin"&&site!=="none")return plain(403,"Cross-site request refused");
 }
 const upstreamUrl=new URL(incoming.pathname+incoming.search,UPSTREAM);
 const headers=new Headers();
 for(const name of ALLOWED_HEADERS){
  const value=request.headers.get(name);
  if(value!==null)headers.set(name,value);
 }
 if(isMutation)headers.set("Origin",UPSTREAM);
 const referer=request.headers.get("Referer");
 if(referer){
  try{
   const original=new URL(referer);
   if(original.origin!==PREVIEW)return plain(403,"Cross-site referer refused");
   headers.set("Referer",new URL(original.pathname+original.search,UPSTREAM).toString());
  }catch{return plain(403,"Invalid referer");}
 }
 headers.set("X-Forwarded-Host",new URL(UPSTREAM).host);
 headers.set("X-Forwarded-Proto","https");
 const options={method:request.method,headers,redirect:"manual",cf:{cacheTtl:0}};
 if(!["GET","HEAD"].includes(request.method))options.body=request.body;
 let upstream;
 try{upstream=await fetch(upstreamUrl.toString(),options);}
 catch{return plain(502,"The original Gavhah server is temporarily unavailable");}
 const responseHeaders=new Headers(upstream.headers);
 for(const name of ["Content-Length","Transfer-Encoding","Connection","Report-To","NEL"])
  responseHeaders.delete(name);
 responseHeaders.set("Cache-Control","private, no-store");
 responseHeaders.set("X-Gavhah-Copy-Mode","functional-web-shared-render-backend");
 responseHeaders.set("X-Content-Type-Options","nosniff");
 const redirect=responseHeaders.get("Location");
 if(redirect){
  try{
   const target=new URL(redirect,UPSTREAM);
   if(target.origin===UPSTREAM)
    responseHeaders.set("Location",new URL(target.pathname+target.search+target.hash,PREVIEW).toString());
  }catch{responseHeaders.delete("Location");}
 }
 return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
}
function plain(status,message,additional={}){
 return new Response(message,{status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store",...additional}});
}