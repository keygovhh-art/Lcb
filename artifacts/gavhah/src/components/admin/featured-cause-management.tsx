import { useEffect, useState } from "react";
import { CheckCircle, Pencil, Plus, RotateCcw, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/shared/image-upload-field";
import { useToast } from "@/hooks/use-toast";

type FeaturedCause = {
  id: number;
  title: string;
  description: string;
  organizerName?: string | null;
  goalAmount?: string | number | null;
  amountRaised: string | number;
  supporterCount: number;
  status: string;
  imageUrl?: string | null;
  location?: string | null;
  deadline?: string | null;
  createdAt: string;
};

const blank = {
  title: "",
  description: "",
  organizerName: "",
  goalAmount: "",
  imageUrl: "",
  location: "",
  deadline: "",
};

export function FeaturedCauseManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<FeaturedCause[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(blank);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/featured-causes", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load featured causes");
      setItems(await res.json());
    } catch {
      toast({ title: "Could not load featured causes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const normalizeGoal = (value: string) => {
    if (!value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  const createCause = async (status: "pending" | "active") => {
    const goalAmount = normalizeGoal(form.goalAmount);
    if (!form.title.trim() || !form.description.trim() || Number.isNaN(goalAmount)) {
      toast({ title: "Check the cause fields", description: "Title, description, and a valid goal are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/featured-causes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          organizerName: form.organizerName.trim() || null,
          goalAmount,
          status,
          imageUrl: form.imageUrl.trim() || null,
          location: form.location.trim() || null,
          deadline: form.deadline.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create cause");
      }
      setForm(blank);
      setCreateOpen(false);
      await load();
      toast({ title: status === "active" ? "Cause created and activated" : "Cause draft created" });
    } catch (err) {
      toast({ title: "Could not create cause", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (item: FeaturedCause) => {
    setEditId(item.id);
    setEditForm({
      title: item.title,
      description: item.description,
      organizerName: item.organizerName ?? "",
      goalAmount: item.goalAmount == null ? "" : String(item.goalAmount),
      imageUrl: item.imageUrl ?? "",
      location: item.location ?? "",
      deadline: item.deadline ?? "",
    });
  };

  const saveEdit = async (id: number) => {
    const goalAmount = normalizeGoal(editForm.goalAmount);
    if (!editForm.title.trim() || !editForm.description.trim() || Number.isNaN(goalAmount)) {
      toast({ title: "Check the cause fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/featured-causes/" + id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          organizerName: editForm.organizerName.trim() || null,
          goalAmount,
          imageUrl: editForm.imageUrl.trim() || null,
          location: editForm.location.trim() || null,
          deadline: editForm.deadline.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update cause");
      }
      setEditId(null);
      await load();
      toast({ title: "Featured cause updated" });
    } catch (err) {
      toast({ title: "Could not update cause", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: "active" | "completed") => {
    const res = await fetch("/api/featured-causes/" + id, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Could not change cause status", description: body.error, variant: "destructive" });
      return;
    }
    await load();
    toast({ title: status === "active" ? "Cause activated" : "Cause marked completed" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Featured Cause Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the United In Kindness cause. Financial amounts here are supporter pledges, not website-processed payments.
          </p>
        </div>
        <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => setCreateOpen(v => !v)}>
          {createOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {createOpen ? "Close" : "New Cause"}
        </Button>
      </div>

      {createOpen && (
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Create Featured Cause</h3>
          <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea className="min-h-28" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Organizer</Label><Input value={form.organizerName} onChange={e => setForm(f => ({ ...f, organizerName: e.target.value }))} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Pledge Goal ($)</Label><Input type="number" min="0" step="0.01" value={form.goalAmount} onChange={e => setForm(f => ({ ...f, goalAmount: e.target.value }))} /></div>
            <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div>
          </div>
          <ImageUploadField label="Cause Image (optional)" value={form.imageUrl} onChange={imageUrl => setForm(f => ({ ...f, imageUrl }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void createCause("pending")} disabled={saving}>Save Draft</Button>
            <Button className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void createCause("active")} disabled={saving}>
              <Star className="h-4 w-4 mr-2" /> Create & Activate
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading causes...</p>
      ) : items.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-muted-foreground">No featured causes yet.</div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
              {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-36 object-cover" />}
              <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant={item.status === "active" ? "default" : "secondary"} className="capitalize">{item.status}</Badge>
                      {item.status === "active" && <Badge className="gap-1"><Star className="h-3 w-3" /> Live</Badge>}
                    </div>
                    <h3 className="font-serif text-xl font-bold text-primary">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
                      <span>{item.supporterCount} supporters</span>
                      <span>{"$"}{Number(item.amountRaised || 0).toLocaleString()} pledged</span>
                      {item.goalAmount != null && <span>Goal: {"$"}{Number(item.goalAmount).toLocaleString()}</span>}
                      {item.location && <span>{item.location}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    {item.status === "active" ? (
                      <Button size="sm" variant="outline" onClick={() => void setStatus(item.id, "completed")}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void setStatus(item.id, "active")}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Activate
                      </Button>
                    )}
                  </div>
                </div>

                {editId === item.id && (
                  <div className="border-t pt-4 space-y-4">
                    <div><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
                    <div><Label>Description</Label><Textarea className="min-h-28" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>Organizer</Label><Input value={editForm.organizerName} onChange={e => setEditForm(f => ({ ...f, organizerName: e.target.value }))} /></div>
                      <div><Label>Location</Label><Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>Pledge Goal ($)</Label><Input type="number" min="0" step="0.01" value={editForm.goalAmount} onChange={e => setEditForm(f => ({ ...f, goalAmount: e.target.value }))} /></div>
                      <div><Label>Deadline</Label><Input type="date" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))} /></div>
                    </div>
                    <ImageUploadField label="Cause Image" value={editForm.imageUrl} onChange={imageUrl => setEditForm(f => ({ ...f, imageUrl }))} />
                    <div className="flex gap-2">
                      <Button className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveEdit(item.id)} disabled={saving}>Save Changes</Button>
                      <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
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
