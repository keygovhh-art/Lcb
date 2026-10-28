import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NextHotlineMigration } from "./next-hotline-migration";
import { YemotVoiceStudio } from "./yemot-voice-studio";

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
  const [directory,setDirectory] = useState<{path:string;entries:Array<{name:string;type:string}>;providerTotal:number;preflight?:{canInstall:boolean;counts:Record<string,number|null>;reason:string;settingKeys:string[];iniNames:string[]}}|null>(null);
  const [install,setInstall] = useState<{state:string;safe_message?:string;target_path?:string;provider_summary?:{reservedChild?:string}}|null>(null);

  const refresh = async () => {
    const s = await call("status") as Status;
    setStatus(s);
    setInstall(await call("installation").catch(()=>null));
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
        דאס איז דער יעצטיגער גבהה־שליסל. נישט איבערשרייבן אים בשעת דער צוגרייטונג צו א נייעם האטליין.
        די צוגרייטונג אונטן איז באזונדער און טוישט נישט דעם אלטן נומער אדער קאמפיין־סענטער.
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
    <YemotVoiceStudio />
    <NextHotlineMigration />
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
      <h3 className="font-bold">דער עקזיסטירנדער ימות־מעניו</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border p-3"><strong>דרוק 1 — גבהה</strong><div className="text-sm text-muted-foreground" dir="ltr">Gavhah API</div></div>
        <div className="rounded-lg border p-3"><strong>דרוק 2 — קאמפיין סענטער</strong><div className="text-sm text-muted-foreground" dir="ltr">Campaign Center API</div></div>
      </div>
      <p className="text-sm text-muted-foreground">
        די גאנצע טעלעפאן־נאוויגאציע קומט פון אונזער איינציגן גבהה־API, נישט פון צוויי באזונדערע ימות־שלוחות.
      </p>
    </div>
    <div className="rounded-xl border bg-card p-5 space-y-3" dir="ltr" lang="en">
      <h3 className="font-bold">English hotline preview and extension safety check</h3>
      <p className="text-sm text-muted-foreground">Planned telephone menu: Press 1 for Gavhah, or 2 for Campaign Center.
      Each has complete nested menus for its sections. Private actions require a separate verified telephone login.
      No live provider extensions are changed by this panel.</p>
      <Button variant="outline" disabled={busy || !status.configured}
        onClick={()=>void work(async()=>{const r=await call("provider-directory?path=%2F");
          setDirectory(r);setMessage("Current provider root folder inspected, with no changes.");})}>
        Inspect the existing provider root folder (read-only)
      </Button>
      {directory&&<div className="text-sm rounded-lg border p-3">
        <strong>Existing directory: {directory.path} ({directory.providerTotal} entries)</strong>
        {directory.preflight&&<div className="mt-2 space-y-1">
          <p>Safe default-only root: <strong>{directory.preflight.canInstall?"Yes — provider default config only":"Not confirmed — check the items below"}</strong></p>
          <p>{directory.preflight.reason}</p>
          <p>Items: folders {directory.preflight.counts.dirs ?? "?"}, files {directory.preflight.counts.files ?? "?"}, settings {directory.preflight.counts.ini ?? "?"}, audio {directory.preflight.counts.messages ?? "?"}, reports {directory.preflight.counts.html ?? "?"}</p>
          <p>Root setting names: {directory.preflight.settingKeys.join(", ")||"(none)"}</p>
        </div>}
        {directory.entries.length?<ul className="list-disc ps-5 mt-2">
          {directory.entries.map((f,i)=><li key={i}><span dir="ltr">{f.name}</span> — {f.type}</li>)}
        </ul>:<p>No file or folder names were listed by the provider.</p>}
      </div>}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="font-semibold">Main menu — Gavhah and Campaign Center</h4>
        <p className="text-sm text-muted-foreground">
          The hotline owner approved the root menu. Press 1 for Gavhah or 2 for
          Campaign Center. The one central API controls all menu options and actions.
          Existing recordings, messages, folders, and unrelated ext.ini keys are NOT
          deleted. Updating the root's type affects what callers hear, not the stored files.
        </p>
        <p className="text-sm">Installation status: <strong>{install?.state || "not checked"}</strong></p>
        {install?.safe_message && <p role="status" className="text-sm">{install.safe_message}</p>}
        <Button variant="outline" disabled={busy}
          onClick={()=>void work(async()=>{
            const state=await call("installation");
            setInstall(state);
            setMessage(state.safe_message || "Installation status refreshed.");
          })}>Refresh root installation status</Button>
        <p className="text-xs text-muted-foreground">
          Only the named API settings are updated. Original hotline files remain
          intact. Provider acknowledgement does not substitute for a physical call test.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        The installation is queued once on the backend and runs after the Gavhah
        server is ready. No manual API token or separate extension is required.
      </p>
    </div>
    {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
