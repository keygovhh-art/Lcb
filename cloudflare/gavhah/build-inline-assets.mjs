/**
 * Generate static SPA assets embedded directly into the standalone Cloudflare
 * Worker. No CDN, Render proxy, separate Pages project or asset upload needed.
 * The generated TypeScript file is build output, not checked into Git.
 */
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import {resolve,relative,join,extname} from "node:path";
import {gzipSync} from "node:zlib";
const root=resolve("artifacts/gavhah/dist/public");
const target=resolve("cloudflare/gavhah/generated-static-assets.ts");
const mime={
 ".html":"text/html; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",
 ".json":"application/json; charset=utf-8",
 ".svg":"image/svg+xml",
 ".png":"image/png",
 ".jpg":"image/jpeg",
 ".jpeg":"image/jpeg",
 ".webp":"image/webp",
 ".ico":"image/x-icon",
 ".woff":"font/woff",
 ".woff2":"font/woff2",
 ".txt":"text/plain; charset=utf-8",
 ".webmanifest":"application/manifest+json",
 ".pdf":"application/pdf",
 ".gif":"image/gif",
 ".mp4":"video/mp4"
};
const entries={};let originalSize=0,compressedSize=0;
async function walk(dir){
 for(const dirent of await readdir(dir,{withFileTypes:true})){
  const filename=join(dir,dirent.name);
  if(dirent.isDirectory()){await walk(filename);continue;}
  if(!dirent.isFile())continue;
  const route="/"+relative(root,filename).split("\\").join("/");
  if(route.includes(".."))throw Error("asset directory traversal");
  const data=await readFile(filename);
  originalSize+=data.length;
  if(data.length>30*1024*1024)throw Error("file unexpectedly exceeds static asset limit "+route);
  const packed=gzipSync(data,{level:9});
  compressedSize+=packed.length;
  entries[route]={base64:packed.toString("base64"),mime:mime[extname(route).toLowerCase()]||"application/octet-stream"};
 }
}
await walk(root);
if(!entries["/index.html"])throw Error("Vite index.html not built");
await mkdir(resolve("cloudflare/gavhah"),{recursive:true});
await writeFile(target,"// AUTOMATIC GENERATED BUILD FILE. Do not commit secrets.\\n"+
 "export const inlineAssets:Record<string,{base64:string;mime:string}>="+JSON.stringify(entries)+";\\n");
console.log("Cloudflare embedded static assets:",Object.keys(entries).length,"uncompressed:",originalSize,"gzip:",compressedSize);
