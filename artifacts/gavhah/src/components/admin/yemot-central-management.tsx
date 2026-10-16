import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = {
  configured: boolean;
  enabled: boolean;
  verified: boolean;
  lineNumber: string | null;
  storageReady: boolean;
  lastVerifiedAt: string | null;
};
const initial: Status = { configured:false, enabled:false, verified:false, lineNumber:null, storageReady:false, lastVerifiedAt:null };

async function call(path: string, options?: RequestInit) {
  const response = await fetch("/api/admin/yemot/" + path, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "דער פארלאנג איז נישט געלונגען");
  return result;
}

/** One system-wide key; there are no organization-level credentials or controls. */
export function YemotCentralManagement() {
  const [status,setStatus] = useState<Status>(initial);
  const [hotline,setHotline] = useState("");
  const [token,setToken] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [loaded,setLoaded] = useState(false);

  const refresh = async () => {
    const s = await call("status") as Status;
    setStatus(s);
    setHotline(v => v || s.lineNumber || "");
    setLoaded(true);
  };
  useEffect(() => { void refresh().catch(e => { setError(e.message); setLoaded(true); }); }, []);
  async function work(fn: () => Promise<void>) {
    setBusy(true); setMessage(""); setError("");
    try { await fn(); await refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : "אומבאקאנטער פעלער"); }
    finally { setBusy(false); }
  }

  return <div dir="rtl" lang="yi" className="max-w-3xl space-y-5">
    <div className="rounded-xl border bg-card p-5 space-y-2">
      <h2 className="text-xl font-bold">ימות המשיח — איין צענטראלער API</h2>
      <p className="text-sm text-muted-foreground">
        בלויז דער גבהה־סופער־עדמין קען שטעלן דעם איינציגן ימות־שליסל. ביידע סיסטעמען נוצן דעם זעלבן האטליין.
        קיין מוסד אדער מאנשאפט קען נישט שטעלן אן אייגענעם API־שליסל.
      </p>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>שליסל: <strong>{status.configured ? "פארשפארט אפגעהיטן" : "נאכנישט אריינגעלייגט"}</strong></p>
        <p>מצב: <strong>{status.enabled ? "אנגעצונדן" : "אויסגעלאשן"}</strong></p>
        <p>API־טעסט: <strong>{status.verified ? "סוקסעספול" : "נאכנישט באשטעטיגט"}</strong></p>
        <p>האטליין: <strong dir="ltr">{status.lineNumber || "נאכנישט אויסגעקליבן"}</strong></p>
      </div>
      {!status.storageReady && loaded && <p role="alert" className="text-sm text-amber-700">
        איידער מען קען אפהיטן א שליסל דארף מען שטעלן YEMOT_ENCRYPTION_KEY אין די פריוואטע Render־איינשטעלונגען פון גבהה.
      </p>}
    </div>
    <form className="rounded-xl border bg-card p-5 space-y-3" onSubmit={e => {
      e.preventDefault();
      void work(async()=>{
        await call("connection", { method:"PUT", body:JSON.stringify({token,lineNumber:hotline}) });
        setToken("");
        setMessage("דער איינציגער שליסל איז ענקריפטירט אפגעהיטן. יעצט פרוביר דעם API־קשר.");
      });
    }}>
      <label htmlFor="yemot-global-hotline" className="block font-medium text-sm">נומער פונעם איינציגן האטליין</label>
      <Input id="yemot-global-hotline" type="tel" dir="ltr" inputMode="numeric"
        autoComplete="off" value={hotline} onChange={e=>setHotline(e.target.value.replace(/[^0-9]/g,""))}
        required minLength={7} maxLength={15} placeholder="נומער אן + אדער שטריכן"/>
      <label htmlFor="yemot-global-token" className="block font-medium text-sm">ימות API־שליסל</label>
      <Input id="yemot-global-token" type="password" dir="ltr" autoComplete="new-password"
        value={token} onChange={e=>setToken(e.target.value)} required minLength={12} maxLength={768}/>
      <Button type="submit" disabled={busy||!status.storageReady}>אפהיטן איינציגן API־שליסל</Button>
      <p className="text-xs text-muted-foreground">א נייעם שליסל אריינלייגן לעשט אוטאמאטיש די פריערדיגע באשטעטיגונג און אנצינדונג.</p>
    </form>
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h3 className="font-bold">פארבינדונגס־טעסט</h3>
      <p className="text-sm text-muted-foreground">דער טעסט לייענט בלויז דעם חשבון־מצב פון ימות. ער באשטעטיגט נישט אז דער אריינגעלייגטער האטליין־נומער געהערט צום שליסל. קיין רופן אדער שלוחות ווערן נישט געענדערט.</p>
      <div className="flex gap-2 flex-wrap">
        <Button disabled={busy||!status.configured} onClick={()=>void work(async()=>{
          const r=await call("test",{method:"POST",body:"{}"});
          setMessage("דער ימות־שליסל ארבעט! געפונען "+r.templateCount+" פארלאגן.");
        })}>פרובירן API־קשר</Button>
        <Button disabled={busy||!status.configured||status.enabled||!status.verified}
          onClick={()=>void work(async()=>{await call("enabled",{method:"PATCH",body:JSON.stringify({enabled:true})});setMessage("צענטראלע פארבינדונג אנגעצונדן.");})}>אנצינדן</Button>
        <Button variant="outline" disabled={busy||!status.enabled}
          onClick={()=>void work(async()=>{await call("enabled",{method:"PATCH",body:JSON.stringify({enabled:false})});setMessage("צענטראלע פארבינדונג אויסגעלאשן.");})}>אויסלעשן</Button>
        <Button variant="outline" disabled={busy||!status.configured}
          onClick={()=>{if(!window.confirm("זיכער אויסמעקן דעם איינציגן API־שליסל?"))return;
            void work(async()=>{await call("connection",{method:"DELETE",body:JSON.stringify({confirm:"REMOVE_GLOBAL_YEMOT_TOKEN"})});setToken("");setMessage("דער שליסל איז אויסגעמעקט.");});}}>אויסמעקן שליסל</Button>
      </div>
    </div>
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="font-bold">איין האטליין — צוויי אפטיילונגען</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border p-3"><strong>דרוק 1 — גבהה</strong><div className="text-sm text-muted-foreground" dir="ltr">/1</div></div>
        <div className="rounded-lg border p-3"><strong>דרוק 2 — קאמפיין סענטער</strong><div className="text-sm text-muted-foreground" dir="ltr">/2</div></div>
      </div>
      <p className="text-sm text-muted-foreground">
        דאס איז דער צוגעגרייטער מעניו־פלאן. די צוויי ימות־שלוחות, זייער קול־מעסעדזש און עכטע רופן־פונקציעס
        ווערן נאך נישט אוטאמאטיש געשטעלט. מען וועט קודם פרובירן דעם איינציגן שליסל און באשטעטיגן
        אז אן עקזיסטירנדער מעניו ווערט נישט איבערגעשריבן.
      </p>
    </div>
    {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
