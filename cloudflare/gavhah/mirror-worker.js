/**
 * Public, guest-only READ-ONLY Cloudflare preview of Gavhah.
 * This is not the independently hosted Worker API.
 * Live Render upstream stays active. Neon and provider numbers unchanged.
 */
const ORIGIN="https://gavhah.onrender.com";
addEventListener("fetch",e=>e.respondWith(handle(e.request)));
async function handle(request){
 const url=new URL(request.url);
 if(request.method!=="GET"&&request.method!=="HEAD"){
  return new Response("This Cloudflare preview is read-only. Use gavhah.onrender.com for account changes.",{status:405,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Allow":"GET, HEAD"}});
 }
 if(url.pathname.startsWith("/api/admin")||url.pathname.startsWith("/api/yemot")||url.pathname.startsWith("/api/signalwire")||url.pathname.startsWith("/api/provider")||url.pathname.startsWith("/api/phone")){
  return new Response("Not exposed in the public read-only preview.",{status:403,headers:{"Cache-Control":"no-store"}});
 }
 const target=new URL(url.pathname+url.search,ORIGIN);
 const headers=new Headers();
 headers.set("Accept",request.headers.get("Accept")||"*/*");
 headers.set("Accept-Language",request.headers.get("Accept-Language")||"en");
 headers.set("User-Agent","Gavhah-Cloudflare-ReadOnly-Preview/1.0");
 let upstream;
 try{upstream=await fetch(target.toString(),{method:request.method,headers,redirect:"manual",cf:{cacheTtl:0}})}
 catch{return new Response("Read-only preview origin temporarily unreachable.",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})}
 const responseHeaders=new Headers(upstream.headers);
 for(const name of ["Set-Cookie","Clear-Site-Data","Strict-Transport-Security","Report-To","NEL","X-Powered-By"])responseHeaders.delete(name);
 responseHeaders.set("Cache-Control","private, no-store");
 responseHeaders.set("X-Gavhah-Copy-Mode","public-read-only-preview");
 const location=responseHeaders.get("Location");
 if(location){try{const redirect=new URL(location,ORIGIN);if(redirect.origin===ORIGIN)responseHeaders.set("Location",url.origin+redirect.pathname+redirect.search);else responseHeaders.set("Location",redirect.href)}catch{responseHeaders.delete("Location")}}
 return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
}
