import { useEffect, useState } from "react";
import { BadgeCheck, CreditCard, LockKeyhole, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type NativeSettings = {
  enabled: boolean; integrationReady: boolean; defaultButtonText: string;
  minimumAmount: number; maximumAmount: number; suggestedAmounts: string;
  allowCustomAmount: boolean; allowRecurring: boolean; allowAnonymous: boolean;
  sendReceipt: boolean;
};

export function NativeDonationSettings() {
  const { toast } = useToast();
  const [value, setValue] = useState<NativeSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/charity/native-settings", { credentials: "include", cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Could not load settings"); return r.json(); })
      .then((data: NativeSettings) => { if (active) setValue(data); })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  const update = (patch: Partial<NativeSettings>) => setValue(s => s ? { ...s, ...patch } : s);
  const save = async () => {
    if (!value) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/charity/native-settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: value.enabled,
          defaultButtonText: value.defaultButtonText,
          minimumAmount: value.minimumAmount,
          maximumAmount: value.maximumAmount,
          suggestedAmounts: value.suggestedAmounts,
          allowCustomAmount: value.allowCustomAmount,
          allowRecurring: value.allowRecurring,
          allowAnonymous: value.allowAnonymous,
          sendReceipt: value.sendReceipt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save settings");
      setValue(body);
      toast({ title: "Own donation preferences saved", description: "No payments have been enabled." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed");
      toast({ title: "Could not save", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return <section className="rounded-2xl border bg-card p-4 sm:p-6 space-y-5" aria-label="Own donation system settings">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-serif text-xl font-bold text-primary flex gap-2 items-center">
          <CreditCard className="h-5 w-5" /> אונזער אייגענע נדבה־סיסטעם
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Optional preparation for a future native checkout — never automatically enables payments.
        </p>
      </div>
      <span className="text-xs rounded-full border px-3 py-1 inline-flex items-center gap-1">
        <LockKeyhole className="h-3 w-3" />
        {value?.integrationReady ? "Integration ready" : "Not yet connected"}
      </span>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value ? <p className="text-sm text-muted-foreground">Loading optional payment settings…</p> : <>
      {!value.integrationReady && <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm flex gap-2">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <span>
          The checkout and payment processor have NOT been built or connected.
          You can prepare preferences here, but the system-wide activation remains locked.
          No card, bank data, charge, recurring donation, receipt or payment record is collected.
        </span>
      </div>}
      <label className="flex gap-3 items-center rounded-xl border p-3">
        <input type="checkbox" checked={value.enabled} disabled={!value.integrationReady || busy}
          className="h-5 w-5 accent-primary" onChange={e => update({ enabled: e.target.checked })} />
        <span className="text-sm font-semibold">Enable own donation checkout across the website</span>
      </label>
      <p className="text-xs text-muted-foreground">
        Once the integration is actually implemented and verified, both this master switch
        AND each campaign's own checkbox must be explicitly enabled. Until then, all remain optional and disabled.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Default donation button label (can be overridden per campaign)</Label>
          <Input maxLength={65} value={value.defaultButtonText} onChange={e => update({ defaultButtonText: e.target.value })} />
        </div>
        <div><Label>Minimum donation ($)</Label>
          <Input type="number" min="1" max="1000000" step="1" value={value.minimumAmount}
            onChange={e => update({ minimumAmount: Number(e.target.value) })}/></div>
        <div><Label>Maximum donation ($)</Label>
          <Input type="number" min="1" max="1000000" step="1" value={value.maximumAmount}
            onChange={e => update({ maximumAmount: Number(e.target.value) })}/></div>
        <div className="sm:col-span-2"><Label>Suggested donation amounts (comma separated, up to 8)</Label>
          <Input dir="ltr" placeholder="18,36,72,180" value={value.suggestedAmounts}
            onChange={e => update({ suggestedAmounts: e.target.value })}/></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {([
          ["allowCustomAmount", "Allow custom amount"],
          ["allowRecurring", "Offer recurring gifts (when supported)"],
          ["allowAnonymous", "Allow anonymous donations"],
          ["sendReceipt", "Offer receipts (when a receipt service exists)"],
        ] as const).map(([key, title]) => <label key={key} className="rounded-xl border p-3 flex gap-2 items-center text-sm">
          <input type="checkbox" checked={value[key]} disabled={busy} className="h-4 w-4 accent-primary"
            onChange={e => update({ [key]: e.target.checked })} />{title}
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">
        These settings do not create payment processing, automatically charge donors,
        produce receipts, or connect to an external processor.
        Payment authorization, webhooks, refunds, security and compliance must be built and tested separately.
      </p>
      <Button onClick={() => void save()} disabled={busy} className="gap-2">
        <Save className="h-4 w-4"/>{busy ? "Saving..." : "Save future native donation preferences"}
      </Button>
    </>}
  </section>;
}
