import { useEffect, useState } from "react";
import { Heart, Pencil, Plus, RotateCcw, Archive, Star, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/shared/image-upload-field";
import { useToast } from "@/hooks/use-toast";

type Charity = {
  id: number;
  name: string;
  description: string;
  successStories?: string | null;
  imageUrl?: string | null;
  goalAmount: number;
  raisedAmount: number;
  isTodaysFeatured: boolean;
  isActive: boolean;
  createdAt: string;
};

const emptyForm = {
  name: "",
  description: "",
  successStories: "",
  imageUrl: "",
  goalAmount: "",
};

export function CharityManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<Charity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [donationId, setDonationId] = useState<number | null>(null);
  const [donationAmount, setDonationAmount] = useState("");
  const [donorName, setDonorName] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/admin/charity", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load campaigns");
      setItems(await res.json());
    } catch {
      toast({ title: "Could not load charity campaigns", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createCampaign = async (featureToday: boolean) => {
    const goalAmount = Number(form.goalAmount || 0);
    if (!form.name.trim() || !form.description.trim() || !Number.isInteger(goalAmount) || goalAmount < 0) {
      toast({ title: "Check the campaign fields", description: "Name, description, and a valid whole-dollar goal are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/charity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          successStories: form.successStories.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          goalAmount,
          isTodaysFeatured: featureToday,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create campaign");
      }
      setForm(emptyForm);
      setCreateOpen(false);
      await load();
      toast({ title: featureToday ? "Campaign created and featured today" : "Campaign created" });
    } catch (err) {
      toast({ title: "Could not create campaign", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (item: Charity) => {
    setEditId(item.id);
    setEditForm({
      name: item.name,
      description: item.description,
      successStories: item.successStories ?? "",
      imageUrl: item.imageUrl ?? "",
      goalAmount: String(item.goalAmount ?? 0),
    });
  };

  const saveEdit = async (id: number) => {
    const goalAmount = Number(editForm.goalAmount || 0);
    if (!editForm.name.trim() || !editForm.description.trim() || !Number.isInteger(goalAmount) || goalAmount < 0) {
      toast({ title: "Check the campaign fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/charity/" + id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          successStories: editForm.successStories.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
          goalAmount,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save campaign");
      }
      setEditId(null);
      await load();
      toast({ title: "Campaign updated" });
    } catch (err) {
      toast({ title: "Could not update campaign", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const patchCampaign = async (id: number, patch: Record<string, unknown>, success: string) => {
    const res = await fetch("/api/charity/" + id, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Could not update campaign", description: body.error, variant: "destructive" });
      return;
    }
    await load();
    toast({ title: success });
  };

  const recordDonation = async (id: number) => {
    const amount = Number(donationAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast({ title: "Enter a positive whole-dollar amount", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/charity/" + id + "/donate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, donorName: donorName.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not record donation");
      }
      setDonationId(null);
      setDonationAmount("");
      setDonorName("");
      await load();
      toast({ title: "Offline donation recorded", description: "$" + amount.toLocaleString() + " added to the campaign total." });
    } catch (err) {
      toast({ title: "Could not record donation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Today's Charity Management</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage charity spotlights and manually record verified offline donations. Online card payments are not connected.</p>
        </div>
        <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => setCreateOpen(v => !v)}>
          {createOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {createOpen ? "Close" : "New Campaign"}
        </Button>
      </div>

      {createOpen && (
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Create Charity Campaign</h3>
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea className="min-h-28" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><Label>Success Story / Note (optional)</Label><Textarea value={form.successStories} onChange={e => setForm(f => ({ ...f, successStories: e.target.value }))} /></div>
          <div><Label>Goal ($)</Label><Input type="number" min="0" step="1" value={form.goalAmount} onChange={e => setForm(f => ({ ...f, goalAmount: e.target.value }))} /></div>
          <ImageUploadField label="Campaign Image (optional)" value={form.imageUrl} onChange={imageUrl => setForm(f => ({ ...f, imageUrl }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void createCampaign(false)} disabled={saving}>Create Campaign</Button>
            <Button className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void createCampaign(true)} disabled={saving}>
              <Star className="h-4 w-4 mr-2" /> Create & Feature Today
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading campaigns...</div>
      ) : items.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-muted-foreground">No charity campaigns yet.</div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
              {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-full h-36 object-cover" />}
              <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Archived"}</Badge>
                      {item.isTodaysFeatured && <Badge className="gap-1"><Star className="h-3 w-3" /> Today's Featured</Badge>}
                    </div>
                    <h3 className="font-serif text-xl font-bold text-primary">{item.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    <p className="text-sm font-semibold mt-3">
                      {"$"}{Number(item.raisedAmount).toLocaleString()} recorded of {"$"}{Number(item.goalAmount).toLocaleString()} goal
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    {item.isActive && !item.isTodaysFeatured && (
                      <Button size="sm" variant="outline" onClick={() => void patchCampaign(item.id, { isTodaysFeatured: true }, "Featured charity updated")}>
                        <Star className="h-3.5 w-3.5 mr-1" /> Feature Today
                      </Button>
                    )}
                    {item.isActive ? (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/20" onClick={() => void patchCampaign(item.id, { isActive: false }, "Campaign archived")}>
                        <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void patchCampaign(item.id, { isActive: true }, "Campaign reactivated")}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reactivate
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setDonationId(donationId === item.id ? null : item.id)}>
                      <DollarSign className="h-3.5 w-3.5 mr-1" /> Record Offline Donation
                    </Button>
                  </div>
                </div>

                {editId === item.id && (
                  <div className="border-t pt-4 space-y-4">
                    <div><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><Label>Description</Label><Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
                    <div><Label>Success Story / Note</Label><Textarea value={editForm.successStories} onChange={e => setEditForm(f => ({ ...f, successStories: e.target.value }))} /></div>
                    <div><Label>Goal ($)</Label><Input type="number" min="0" step="1" value={editForm.goalAmount} onChange={e => setEditForm(f => ({ ...f, goalAmount: e.target.value }))} /></div>
                    <ImageUploadField label="Campaign Image" value={editForm.imageUrl} onChange={imageUrl => setEditForm(f => ({ ...f, imageUrl }))} />
                    <div className="flex gap-2">
                      <Button className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveEdit(item.id)} disabled={saving}>Save Changes</Button>
                      <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {donationId === item.id && (
                  <div className="border-t pt-4">
                    <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-secondary" />
                        <p className="font-semibold text-sm">Record a verified offline donation</p>
                      </div>
                      <p className="text-xs text-muted-foreground">This does not charge a card or bank account. Use it only for money received outside the website.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><Label>Amount ($)</Label><Input type="number" min="1" step="1" value={donationAmount} onChange={e => setDonationAmount(e.target.value)} /></div>
                        <div><Label>Donor Name (optional)</Label><Input value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Anonymous" /></div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void recordDonation(item.id)} disabled={saving}>Record Donation</Button>
                        <Button variant="ghost" onClick={() => setDonationId(null)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
