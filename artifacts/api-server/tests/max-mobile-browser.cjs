const assert=require("node:assert/strict");
const {createRequire}=require("node:module");
const requireBrowser=createRequire("/tmp/gavhah-browser-qa/package.json");
const {chromium}=requireBrowser("playwright");
(async()=>{
 const base="http://127.0.0.1:35148";
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,locale:"en-US"});
 const errors=[];
 const page=await context.newPage();
 page.on("pageerror",e=>errors.push(String(e)));
 try{
   const login=await context.request.post(base+"/api/auth/login",{
     data:{identifier:"qa-max-a@example.invalid",password:"QA-PASSWORD-ONLY-NONPROD-2026"}
   });
   assert.equal(login.status(),200,"Synthetic browser member login failed");
   const my=await page.goto(base+"/my",{waitUntil:"domcontentloaded"});
   assert.equal(my?.status(),200,"My Askanus did not load");
   await page.locator("body").waitFor();
   const myBody=await page.locator("body").innerText();
   assert.ok(myBody.length>100,"My Askanus rendered a blank page");
   await page.screenshot({path:"/tmp/gavhah-max-my-mobile.png",fullPage:true});
   const communications=await page.goto(base+"/communications",{waitUntil:"domcontentloaded"});
   assert.equal(communications?.status(),200,"Olam Hachesed MAX route failed");
   await page.locator("#max-today").waitFor({state:"visible",timeout:15000});
   for(const id of ["max-today","max-call","max-contacts","max-projects","max-more"]){
     assert.ok(await page.locator("#"+id).isVisible(),id+" missing on phone screen");
   }
   await page.locator('#max-contacts input[aria-label="נאמען"]').fill("QA Mobile-only Contact");
   await page.locator('#max-contacts input[aria-label="טעלעפאן"]').fill("8455550198");
   await page.locator('#max-contacts form button[type="submit"]').click();
   await page.getByText("QA Mobile-only Contact",{exact:false}).first().waitFor({timeout:15000});
   await page.getByRole("heading",{name:/נדבן 360/}).first().waitFor({timeout:15000});
   await page.screenshot({path:"/tmp/gavhah-max-contact-mobile.png",fullPage:true});
   const width=await page.evaluate(()=>({
     body:document.documentElement.scrollWidth,viewport:window.innerWidth
   }));
   assert.ok(width.body<=width.viewport+36,
     "Unexpected horizontal mobile overflow: "+JSON.stringify(width));
   assert.deepEqual(errors,[],"Browser reported uncaught JavaScript errors");
   console.log("PASS Mobile Chromium: signed-in personal case, MAX tabs, contact create, donor 360, viewport width and no JS exceptions");
 }finally{
   await context.close();await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
