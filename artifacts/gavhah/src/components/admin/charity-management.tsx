import { formatGregorianDateTime } from "@/lib/gregorian-date";
import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, CheckCircle2, Clock3, DollarSign, Heart, Pencil, Plus, RotateCcw, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/shared/image-upload-field";
import { CampaignDonationActions } from "@/components/shared/campaign-donation-actions";
import { NativeDonationSettings } from "@/components/admin/native-donation-settings";
import { useToast } from "@/hooks/use-toast";

type CampaignState = "live" | "queued" | "scheduled" | "archived";
type Charity = {
  id: number; name: string; description: string;
  successStories: string | null; imageUrl: string | null;
  goalAmount: number; raisedAmount: number;
  isTodaysFeatured: boolean; isActive: boolean; createdAt: string;
  publicationState: CampaignState; scheduledAt: string | null;
  phoneNumber: string | null; phoneExtension: string | null;
  phoneButtonText: string | null; donationUrl: string | null;
  linkButtonText: string | null; buttonStyle: string; buttonLayout: string;
  nativeDonationEnabled: boolean; nativeDonationButtonText: string | null;
  nativeDonationButtonStyle: string;
};
type CampaignForm = {
  name: string; description: string; successStories: string;
  imageUrl: string; goalAmount: string;
  phoneNumber: string; phoneExtension: string; phoneButtonText: string;
  donationUrl: string; linkButtonText: string;
  buttonStyle: string; buttonLayout: string; scheduledLocal: string; featured: boolean;
  nativeDonationEnabled: boolean; nativeDonationButtonText: string;
  nativeDonationButtonStyle: string;
};
const emptyForm: CampaignForm = {
  name: "", description: "", successStories: "", imageUrl: "", goalAmount: "",
  phoneNumber: "", phoneExtension: "", phoneButtonText: "Donate by Phone",
  donationUrl: "", linkButtonText: "Donate Online",
  buttonStyle: "classic", buttonLayout: "stacked",
  scheduledLocal: "", featured: false,
  nativeDonationEnabled: false, nativeDonationButtonText: "Donate Securely",
  nativeDonationButtonStyle: "gold",
};
function toLocal(utc: string | null): string {
  if (!utc) return "";
  const d = new Date(utc); if (!Number.isFinite(d.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toFutureIso(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) && d.getTime() > Date.now() ? d.toISOString() : null;
}
function formFrom(item: Charity): CampaignForm {
  return {
    name: item.name, description: item.description, successStories: item.successStories || "",
    imageUrl: item.imageUrl || "", goalAmount: String(item.goalAmount),
    phoneNumber: item.phoneNumber || "", phoneExtension: item.phoneExtension || "",
    phoneButtonText: item.phoneButtonText || "Donate by Phone",
    donationUrl: item.donationUrl || "", linkButtonText: item.linkButtonText || "Donate Online",
    buttonStyle: item.buttonStyle || "classic", buttonLayout: item.buttonLayout || "stacked",
    scheduledLocal: toLocal(item.scheduledAt), featured: !!item.isTodaysFeatured,
    nativeDonationEnabled: item.nativeDonationEnabled ?? false,
    nativeDonationButtonText: item.nativeDonationButtonText || "Donate Securely",
    nativeDonationButtonStyle: item.nativeDonationButtonStyle || "gold",
  };
}
function publicNow(item: Charity): boolean {
  return (item.publicationState === "live" && item.isActive) ||
    (item.publicationState === "scheduled" && !!item.scheduledAt && new Date(item.scheduledAt).getTime() <= Date.now());
}
function labelStatus(item: Charity) {
  return publicNow(item) ? (item.publicationState === "scheduled" ? "Live (scheduled)" : "Live") :
    item.publicationState === "queued" ? "Waiting Line" :
    item.publicationState === "scheduled" ? "Scheduled" : "Archived";
}

function CampaignFields({ form, onChange, showSchedule = false }: {
  form: CampaignForm; onChange: (patch: Partial<CampaignForm>) => void; showSchedule?: boolean;
}) {
  const input = (field: keyof CampaignForm, value: string | boolean) => onChange({ [field]: value });
  return <div className="space-y-5">
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><Label>Campaign Name *</Label>
        <Input value={form.name} maxLength={240} onChange={e => input("name", e.target.value)} /></div>
      <div className="sm:col-span-2"><Label>Description *</Label>
        <Textarea className="min-h-28" maxLength={30000} value={form.description} onChange={e => input("description", e.target.value)} /></div>
      <div className="sm:col-span-2"><Label>Success story / additional note</Label>
        <Textarea value={form.successStories} onChange={e => input("successStories", e.target.value)} /></div>
      <div><Label>Goal ($)</Label>
        <Input type="number" min="0" step="1" value={form.goalAmount} onChange={e => input("goalAmount", e.target.value)} /></div>
      <div className="sm:col-span-2">
        <ImageUploadField label="Campaign Image" value={form.imageUrl} onChange={v => input("imageUrl", v)} />
      </div>
    </div>

    <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
      <h4 className="font-semibold flex gap-2 items-center"><Heart className="h-4 w-4"/> Donation buttons (independent)</h4>
      <p className="text-xs text-muted-foreground">Leave a number or URL blank to hide that donation button. The website itself does not process card payments.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Phone number (e.g. +16053138165)</Label>
          <Input type="tel" dir="ltr" placeholder="+1 605 313 8165" value={form.phoneNumber} onChange={e => input("phoneNumber", e.target.value)}/></div>
        <div><Label>Dial extension (e.g. #3333)</Label>
          <Input type="text" dir="ltr" placeholder="#3333" maxLength={13} value={form.phoneExtension} onChange={e => input("phoneExtension", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Phone button wording</Label>
          <Input maxLength={65} value={form.phoneButtonText} onChange={e => input("phoneButtonText", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Direct donation link (https://...)</Label>
          <Input dir="ltr" type="url" placeholder="https://your-verified-donation-page.example/" value={form.donationUrl} onChange={e => input("donationUrl", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Direct-link button wording</Label>
          <Input maxLength={65} value={form.linkButtonText} onChange={e => input("linkButtonText", e.target.value)} /></div>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300">
        Use an authorized, verified donation phone line and HTTPS payment page. Mobile dialers may require manually entering the extension after the call connects.
      </p>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="campaign-button-design">Donation button design</Label>
        <select id="campaign-button-design" value={form.buttonStyle} onChange={e => input("buttonStyle", e.target.value)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="classic">Classic navy</option>
          <option value="gold">Gold</option>
          <option value="soft">Soft background</option>
          <option value="outline">Outlined</option>
        </select>
      </div>
      <div><Label htmlFor="campaign-button-layout">Buttons layout</Label>
        <select id="campaign-button-layout" value={form.buttonLayout} onChange={e => input("buttonLayout", e.target.value)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="stacked">One under the other</option>
          <option value="inline">Side by side (wide screens)</option>
        </select>
      </div>
    </div>
    <div className="rounded-xl border p-4 space-y-3">
      <p className="text-sm font-semibold">Live preview of donation buttons</p>
      <CampaignDonationActions campaign={form} />
    </div>
    <div className="rounded-xl border border-amber-600/30 p-4 bg-amber-50/30 dark:bg-amber-950/10 space-y-3">
      <h4 className="font-semibold">אונזער אייגענע נדבה־סיסטעם · Optional native checkout</h4>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.nativeDonationEnabled}
          onChange={e => input("nativeDonationEnabled", e.target.checked)} className="h-4 w-4 accent-primary" />
        Prepare this campaign for our own donation system (OFF unless activated)
      </label>
      <p className="text-xs text-muted-foreground">
        Setup is only saved for the future. No payment button appears to donors until a real
        native processor is implemented AND the system-wide master switch is explicitly enabled.
      </p>
      {form.nativeDonationEnabled && <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Own-system donation button wording</Label>
          <Input maxLength={65} value={form.nativeDonationButtonText}
            onChange={e => input("nativeDonationButtonText", e.target.value)}/></div>
        <div><Label>Own-system button design</Label>
          <select value={form.nativeDonationButtonStyle}
            onChange={e => input("nativeDonationButtonStyle", e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3">
            <option value="classic">Classic navy</option>
            <option value="gold">Gold</option>
            <option value="soft">Soft</option>
            <option value="outline">Outline</option>
          </select>
        </div>
        <button type="button" className="sm:col-span-2 rounded-xl bg-muted/30 border border-dashed p-3
          text-sm text-muted-foreground cursor-not-allowed" disabled>
          {form.nativeDonationButtonText || "Donate Securely"} · Preview only (unavailable)
        </button>
      </div>}
    </div>
    {showSchedule && <div className="rounded-xl border border-accent/50 p-4 space-y-2">
      <Label htmlFor="charity-publish-time">Publication date & time (your device's local timezone)</Label>
      <Input id="charity-publish-time" type="datetime-local" value={form.scheduledLocal}
        onChange={e => input("scheduledLocal", e.target.value)} />
      <p className="text-xs text-muted-foreground">The browser converts this local time to UTC. Campaign becomes public at the scheduled instant even if Render was asleep; the listing refreshes approximately once a minute.</p>
    </div>}
    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
      <input type="checkbox" checked={form.featured} onChange={e => input("featured", e.target.checked)} className="h-4 w-4 accent-primary"/>
      Feature as Today's Charity when this campaign goes live
    </label>
  </div>;
}

export function CharityManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<Charity[]>([]);
  const [filter, setFilter] = useState<"all" | "live" | "queued" | "scheduled" | "archived">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CampaignForm>(emptyForm);
  const [editState, setEditState] = useState<CampaignState>("live");
  const [donationId, setDonationId] = useState<number | null>(null);
  const [donationAmount, setDonationAmount] = useState("");
  const [donorName, setDonorName] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/admin/charity", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load campaigns");
      setItems(await res.json());
    } catch {
      toast({ title: "Could not load charity campaigns", variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => items.filter(item => {
    if (filter === "all") return true;
    if (filter === "live") return publicNow(item);
    if (filter === "scheduled") return item.publicationState === "scheduled" && !publicNow(item);
    return item.publicationState === filter;
  }), [items, filter]);
  const count = (tab: typeof filter) => items.filter(item =>
    tab === "all" ? true : tab === "live" ? publicNow(item) :
    tab === "scheduled" ? item.publicationState === "scheduled" && !publicNow(item) : item.publicationState === tab
  ).length;

  const formPayload = (draft: CampaignForm, mode: CampaignState, initial?: Charity) => {
    const goal = Number(draft.goalAmount || 0);
    if (!draft.name.trim() || !draft.description.trim() || !Number.isSafeInteger(goal) || goal < 0) {
      throw new Error("Campaign name, description and a valid whole-dollar goal are required.");
    }
    let scheduledAt: string | undefined;
    if (mode === "scheduled") {
      if (initial && draft.scheduledLocal === toLocal(initial.scheduledAt)) {
        // An already-published scheduled campaign may be edited without rescheduling.
        scheduledAt = undefined;
      } else {
        scheduledAt = toFutureIso(draft.scheduledLocal) || undefined;
        if (!scheduledAt) throw new Error("Please choose a FUTURE calendar date and time.");
      }
    }
    return {
      name: draft.name.trim(), description: draft.description.trim(),
      successStories: draft.successStories.trim() || null,
      imageUrl: draft.imageUrl.trim() || null, goalAmount: goal,
      phoneNumber: draft.phoneNumber.trim() || null,
      phoneExtension: draft.phoneExtension.trim() || null,
      phoneButtonText: draft.phoneButtonText.trim() || null,
      donationUrl: draft.donationUrl.trim() || null,
      linkButtonText: draft.linkButtonText.trim() || null,
      buttonStyle: draft.buttonStyle, buttonLayout: draft.buttonLayout,
      nativeDonationEnabled: draft.nativeDonationEnabled,
      nativeDonationButtonText: draft.nativeDonationButtonText.trim() || null,
      nativeDonationButtonStyle: draft.nativeDonationButtonStyle,
      publicationState: mode, ...(scheduledAt ? { scheduledAt } : {}),
      isTodaysFeatured: mode === "queued" || mode === "archived" ? false : draft.featured,
    };
  };

  const create = async (mode: "live" | "queued" | "scheduled") => {
    let payload;
    try { payload = formPayload(form, mode); }
    catch (e) { toast({ title: "Check campaign details", description: (e as Error).message, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/charity", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create campaign");
      setForm(emptyForm); setCreateOpen(false); setFilter(mode);
      await load();
      toast({ title: mode === "live" ? "Campaign live" : mode === "queued" ? "Added to waiting line" : "Campaign scheduled" });
    } catch (e) { toast({ title: "Could not save campaign", description: (e as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const beginEdit = (item: Charity, state = item.publicationState) => {
    setEditId(item.id); setEditForm(formFrom(item)); setEditState(state);
  };
  const update = async (id: number, patch: Record<string, unknown>, success: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/charity/${id}`, { method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update campaign");
      await load(); toast({ title: success }); return true;
    } catch (e) {
      toast({ title: "Could not update campaign", description: (e as Error).message, variant: "destructive" });
      return false;
    } finally { setSaving(false); }
  };
  const saveEdit = async (item: Charity) => {
    let payload;
    try { payload = formPayload(editForm, editState, item); }
    catch (e) { toast({ title: "Check campaign details", description: (e as Error).message, variant: "destructive" }); return; }
    if (await update(item.id, payload, "Campaign details updated")) setEditId(null);
  };
  const recordDonation = async (id: number) => {
    const amount = Number(donationAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast({ title: "Enter a positive whole-dollar donation", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/charity/${id}/donate`, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, donorName: donorName.trim() || null }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not record donation");
      setDonationId(null); setDonationAmount(""); setDonorName("");
      await load(); toast({ title: "Verified offline donation recorded" });
    } catch (e) { toast({ title: "Could not record donation", description: (e as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl font-bold text-primary">Today's Charity · Campaign Center</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the waiting line, future schedules, live campaigns, donations by phone and verified external payment links.
        </p>
      </div>
      <Button onClick={() => { setCreateOpen(v => !v); setEditId(null); }} className="gap-2">
        {createOpen ? <X className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}
        {createOpen ? "Close" : "New Campaign"}
      </Button>
    </div>

    {createOpen && <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-5">
      <h3 className="font-bold text-lg">Prepare a campaign</h3>
      <CampaignFields form={form} onChange={patch => setForm(v => ({ ...v, ...patch }))} showSchedule/>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t pt-4">
        <Button variant="outline" disabled={saving} onClick={() => void create("queued")}><Clock3 className="h-4 w-4 me-2"/>Add to Waiting Line</Button>
        <Button variant="outline" disabled={saving} onClick={() => void create("scheduled")}><CalendarClock className="h-4 w-4 me-2"/>Schedule for Later</Button>
        <Button disabled={saving} onClick={() => void create("live")}><CheckCircle2 className="h-4 w-4 me-2"/>Go Live Now</Button>
      </div>
    </div>}

    <NativeDonationSettings />
    <div className="rounded-xl bg-muted/20 border p-3 flex gap-2 flex-wrap" role="group" aria-label="Filter charity campaigns">
      {([
        ["all", "All"], ["queued", "Waiting Line"], ["scheduled", "Scheduled"],
        ["live", "Live"], ["archived", "Archived"],
      ] as const).map(([key, title]) => <Button key={key} size="sm" variant={filter === key ? "default" : "outline"}
        onClick={() => setFilter(key)}>{title} ({count(key)})</Button>)}
    </div>

    {loading ? <div className="p-8">Loading campaign center…</div> :
      visible.length === 0 ? <div className="rounded-xl border bg-muted/10 text-center text-muted-foreground p-8">
        No campaigns in this section.
      </div> :
      <div className="space-y-4">{visible.map(item => {
        const live = publicNow(item);
        return <div key={item.id} className="rounded-xl border bg-card overflow-hidden">
          {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-full max-h-48 object-cover"/>}
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={live ? "default" : "secondary"}>{labelStatus(item)}</Badge>
              {item.isTodaysFeatured && <Badge variant="secondary">
                <Star className="h-3 w-3 me-1"/>{live ? "Featured candidate" : "Featured when live"}
              </Badge>}
              {item.scheduledAt && item.publicationState === "scheduled" && <Badge variant="outline">
                <CalendarClock className="h-3 w-3 me-1"/> {formatGregorianDateTime(item.scheduledAt)}
              </Badge>}
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-primary">{item.name}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{item.description}</p>
              <p className="mt-2 text-sm font-semibold">${Number(item.raisedAmount).toLocaleString()} of ${Number(item.goalAmount).toLocaleString()} recorded</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={() => beginEdit(item)}><Pencil className="h-4 w-4 me-1"/>Edit</Button>
              {!live && item.publicationState !== "archived" && <Button size="sm" disabled={saving}
                onClick={() => void update(item.id, { publicationState: "live" }, "Campaign is live")}>
                <CheckCircle2 className="h-4 w-4 me-1"/>Go Live
              </Button>}
              {(item.publicationState === "queued" || item.publicationState === "scheduled") &&
                <Button size="sm" variant="outline" disabled={saving} onClick={() => beginEdit(item, "scheduled")}>
                  <CalendarClock className="h-4 w-4 me-1"/>Schedule / Reschedule
                </Button>}
              {item.publicationState !== "queued" && item.publicationState !== "archived" &&
                <Button size="sm" variant="outline" disabled={saving}
                  onClick={() => void update(item.id, { publicationState: "queued" }, "Moved to waiting line")}>
                  <Clock3 className="h-4 w-4 me-1"/>Move to Waiting Line
                </Button>}
              {live && <Button size="sm" variant="outline" disabled={saving}
                onClick={() => void update(item.id, { publicationState: "live", isTodaysFeatured: true }, "Today's featured campaign changed")}>
                <Star className="h-4 w-4 me-1"/>Feature Today
              </Button>}
              {item.publicationState !== "archived" ? <Button size="sm" variant="outline" disabled={saving}
                onClick={() => void update(item.id, { publicationState: "archived" }, "Campaign archived")}>
                <Archive className="h-4 w-4 me-1"/>Archive
              </Button> : <Button size="sm" variant="outline" disabled={saving}
                onClick={() => void update(item.id, { publicationState: "queued" }, "Restored to waiting line")}>
                <RotateCcw className="h-4 w-4 me-1"/>Restore to Waiting Line
              </Button>}
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setDonationId(donationId === item.id ? null : item.id)}>
                <DollarSign className="h-4 w-4 me-1"/>Record Offline Donation
              </Button>
            </div>

            {editId === item.id && <div className="border-t pt-4 space-y-4">
              <div className="flex justify-between items-center gap-2">
                <h4 className="font-semibold">Edit campaign · {item.name}</h4>
                <Button variant="ghost" size="icon" aria-label="Close editor" onClick={() => setEditId(null)}><X className="h-4 w-4"/></Button>
              </div>
              <div><Label>Next publication state</Label>
                <select value={editState} onChange={e => setEditState(e.target.value as CampaignState)}
                  className="h-10 rounded-md border bg-background px-3 w-full">
                  <option value="queued">Waiting Line (no date)</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live immediately</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <CampaignFields form={editForm} onChange={patch => setEditForm(v => ({ ...v, ...patch }))} showSchedule={editState === "scheduled"}/>
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => void saveEdit(item)}>Save Campaign & Status</Button>
                <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
              </div>
            </div>}

            {donationId === item.id && <div className="border-t pt-4 space-y-3">
              <p className="font-semibold text-sm">Record a VERIFIED offline donation only — never charges a card</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Amount ($)</Label><Input type="number" min="1" step="1" value={donationAmount} onChange={e => setDonationAmount(e.target.value)}/></div>
                <div><Label>Donor Name (optional)</Label><Input value={donorName} onChange={e => setDonorName(e.target.value)}/></div>
              </div>
              <div className="flex gap-2">
                <Button disabled={saving} onClick={() => void recordDonation(item.id)}>Record Donation</Button>
                <Button variant="ghost" onClick={() => setDonationId(null)}>Cancel</Button>
              </div>
            </div>}
          </div>
        </div>;
      })}</div>}
  </div>;
}
