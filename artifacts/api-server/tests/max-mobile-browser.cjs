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
   // Seed a single due follow-up by the authorized member. This tests the
   // actual touch UI (not a mock) and leaves the real database untouched.
   const casesResponse=await context.request.get(base+"/api/askanus/cases");
   assert.equal(casesResponse.status(),200);
   const qaCases=await casesResponse.json();
   assert.ok(qaCases.length>0,"No synthetic personal case for reminder UI");
   const reminderDue=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
   const rem=await context.request.post(base+"/api/askanus/cases/"+qaCases[0].id+"/progress",{
     data:{action:"followup",note:"QA mobile MAX alarm",dueDate:reminderDue,
       dueTime:"08:00",timeZone:"America/New_York"}
   });
   assert.equal(rem.status(),200,"Failed to seed phone-sized reminder");
   const communications=await page.goto(base+"/communications",{waitUntil:"domcontentloaded"});
   assert.equal(communications?.status(),200,"Olam Hachesed MAX route failed");
   await page.locator("#max-today").waitFor({state:"visible",timeout:15000});
   const reminders=page.getByRole("region",{name:"MAX פערזענליכע דערמאנונגען"});
   await reminders.waitFor({state:"visible",timeout:15000});
   await reminders.getByText("QA mobile MAX alarm").waitFor({state:"visible",timeout:15000});
   await reminders.getByRole("button",{name:"דערמאן מארגן"}).click();
   await reminders.getByRole("button",{name:/צייטווייליג אפגעשטופט/}).click();
   await reminders.getByText("QA mobile MAX alarm").waitFor({state:"visible",timeout:15000});
   await reminders.getByRole("button",{name:"צוריק צום אינבאקס"}).click();
   await reminders.getByRole("button",{name:/יעצט/}).click();
   await reminders.getByRole("button",{name:"פארטיג"}).click();
   await reminders.getByText("QA mobile MAX alarm").waitFor({state:"hidden",timeout:15000});

   for(const id of ["max-today","max-call","max-contacts","max-projects","max-more"]){
     assert.ok(await page.locator("#"+id).isVisible(),id+" missing on phone screen");
   }
   const reports=page.getByRole("region",{name:"MAX פערזענליכע באריכטן"});
   await reports.getByRole("button",{name:"עפענען מיין באריכט"}).click();
   await reports.getByRole("button",{name:"30 טעג"}).waitFor({state:"visible",timeout:15000});
   await reports.getByText("QA Fundraising Project",{exact:true})
     .first().waitFor({state:"visible",timeout:15000});
   await page.locator('#max-contacts input[aria-label="נאמען"]').fill("QA Mobile-only Contact");
   await page.locator('#max-contacts input[aria-label="טעלעפאן"]').fill("8455550198");
   await page.locator('#max-contacts form button[type="submit"]').click();
   await page.waitForFunction(()=>Number(document.querySelector("#max-contact")?.value)>0,
     null,{timeout:15000});
   const selected=await page.locator("#max-contact").inputValue();
   assert.ok(Number(selected)>0,"Newly added contact was not selected");
   await page.getByRole("heading",{name:/נדבן 360/}).first().waitFor({timeout:15000});
   // Verify enriched MAX donor 360 can really be edited by touch on a phone.
   await page.getByRole("button",{name:"רופן־רשות, צייטן און באציאונגס־נאטיצן"}).click();
   await page.getByLabel("מוסד, ארגאניזאציע אדער געשעפט").fill("QA Mobile Association");
   await page.getByLabel("שטאט").fill("Monroe");
   await page.getByLabel("צייכענונגען (אפגעטיילט מיט א קאמע)").fill("priority, recurring");
   await page.getByRole("button",{name:"אפהיטן איינשטעלונגען"}).click();
   await page.getByText("QA Mobile Association",{exact:false})
     .first().waitFor({state:"visible",timeout:15000});
   const crmSearch=await context.request.get(base+"/api/askanus/contacts?q=QA%20Mobile%20Association");
   assert.equal(crmSearch.status(),200);
   const crmFound=await crmSearch.json();
   assert.ok(crmFound.some(c=>String(c.id)===selected&&c.city==="Monroe"
      &&c.tags==="priority, recurring"),"Private donor tags/organization not saved");
   // Owner-controlled override, tested on a real touch-sized browser viewport.
   const optOut=await context.request.patch(base+"/api/askanus/contacts/"+selected,{
     data:{doNotCall:true,optOutReason:"QA donor asked not to be called"}
   });
   assert.equal(optOut.status(),200,"Set opt-out");
   await page.reload({waitUntil:"domcontentloaded"});
   await page.locator("#max-today").waitFor({state:"visible"});
   await page.locator("#max-contact").selectOption(selected);
   await page.getByRole("button",{name:/דער עסקן וויל אראפנעמען/})
     .waitFor({state:"visible",timeout:15000});
   await page.getByRole("button",{name:/דער עסקן וויל אראפנעמען/}).click();
   page.once("dialog",dialog=>dialog.accept());
   await page.getByRole("button",{name:/באשטעטיגן און אראפנעמען דעם צייכן/}).click();
   await page.getByText(/דער עסקן האט אליין אראפגענומען דעם רופן־צייכן/)
     .first().waitFor({state:"visible",timeout:15000});
   const events=await context.request.get(base+"/api/askanus/contacts/"+selected+"/consents");
   assert.equal(events.status(),200,"Owner may inspect own audit");
   const list=await events.json();
   assert.equal(list[0].action,"owner_override");
   await page.screenshot({path:"/tmp/gavhah-max-contact-mobile.png",fullPage:true});
   const width=await page.evaluate(()=>({
     body:document.documentElement.scrollWidth,viewport:window.innerWidth
   }));
   assert.ok(width.body<=width.viewport+36,
     "Unexpected horizontal mobile overflow: "+JSON.stringify(width));
   assert.deepEqual(errors,[],"Browser reported uncaught JavaScript errors");
   console.log("PASS Mobile Chromium: signed-in member, MAX, donor 360, owner call-marker override, CRM tags, reports, reminders, no JS errors");
 }finally{
   await context.close();await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
