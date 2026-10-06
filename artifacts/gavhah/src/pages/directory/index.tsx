import { useState } from "react";
import {
  useListVolunteers, useListHelpRequests, useGetFeaturedVolunteers, useGetFeaturedRequests,
  useCreateVolunteer, useCreateHelpRequest,
  getListVolunteersQueryKey, getListHelpRequestsQueryKey, getGetFeaturedVolunteersQueryKey, getGetFeaturedRequestsQueryKey,
  useListCommunityProjects, useCreateCommunityProject, useJoinCommunityProject, useListProjectMembers,
  getListCommunityProjectsQueryKey, getListProjectMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Users, HandHeart, MapPin, Clock, Star, AlertTriangle, AlertCircle,
  Minus, UserPlus, HelpCircle, FolderKanban, Plus, ChevronDown, ChevronUp,
  Megaphone, Target, Handshake, Gift, Pencil, Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/context/auth-context";
import { MemberGate } from "@/components/shared/member-gate";

// ---- Constants ----
const URGENCY_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", color: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  high: { label: "High", color: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
  medium: { label: "Medium", color: "default", icon: <Minus className="h-3 w-3" /> },
  low: { label: "Low", color: "outline", icon: <Minus className="h-3 w-3" /> },
};

const NEED_LABELS: Record<string, string> = {
  medical: "Medical", wedding: "Wedding / Simcha",
  food: "Food Assistance", housing: "Housing",
  transportation: "Transportation", financial: "Financial", other: "Other",
};

const SKILLS_OPTIONS = [
  "Bikur Cholim", "Hospital Visits", "Medical Transport", "Hachnosas Kallah",
  "Wedding Assistance", "Fundraising", "Housing Support", "Financial Aid",
  "Crisis Counseling", "Community Organizing", "Special Needs", "Food Distribution",
  "Driver / Transport", "Translation", "Government Liaison",
];

const PROJECT_TYPES = [
  { value: "all", label: "All Types", icon: FolderKanban },
  { value: "project", label: "Projects", icon: Target },
  { value: "campaign", label: "Campaigns", icon: Megaphone },
  { value: "initiative", label: "Initiatives", icon: Handshake },
  { value: "program", label: "Programs", icon: Gift },
];

const TYPE_COLORS: Record<string, string> = {
  project: "bg-blue-50 border-blue-200 text-blue-700",
  campaign: "bg-rose-50 border-rose-200 text-rose-700",
  initiative: "bg-green-50 border-green-200 text-green-700",
  program: "bg-purple-50 border-purple-200 text-purple-700",
};

const TYPE_BADGE: Record<string, string> = {
  project: "bg-blue-100 text-blue-800 border-blue-200",
  campaign: "bg-rose-100 text-rose-800 border-rose-200",
  initiative: "bg-green-100 text-green-800 border-green-200",
  program: "bg-purple-100 text-purple-800 border-purple-200",
};

const ROLE_LABELS: Record<string, string> = {
  volunteer: "Volunteer",
  supporter: "Supporter",
  organizer: "Co-organizer",
  donor: "Donor",
};

// ---- Volunteer Card ----
function VolunteerCard({ vol }: { vol: any }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    location: vol.location ?? "",
    availability: vol.availability ?? "weekends",
    bio: vol.bio ?? "",
    skills: Array.isArray(vol.skills) ? vol.skills.join(", ") : "",
  });
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = !!user && (vol.userId === user.id || isAdmin);

  const openVolunteerEdit = () => {
    setEditForm({
      location: vol.location ?? "",
      availability: vol.availability ?? "weekends",
      bio: vol.bio ?? "",
      skills: Array.isArray(vol.skills) ? vol.skills.join(", ") : "",
    });
    setEditOpen(true);
  };

  const saveVolunteerEdit = async () => {
    if (!editForm.location.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/volunteers/${vol.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: vol.userName,
          location: editForm.location.trim(),
          availability: editForm.availability,
          bio: editForm.bio.trim() || null,
          skills: editForm.skills.split(",").map(x => x.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueriesData({ queryKey: ["/api/volunteers"] }, (current: any) =>
        Array.isArray(current) ? current.map((item: any) => item.id === vol.id ? updated : item) : current
      );
      void qc.invalidateQueries({ queryKey: ["/api/volunteers"] });
      setEditOpen(false);
      toast({ title: "Volunteer profile updated" });
    } catch {
      toast({ title: "Could not update volunteer profile", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteVolunteer = async () => {
    if (!window.confirm("Remove your volunteer profile?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/volunteers/${vol.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("delete failed");
      qc.setQueriesData({ queryKey: ["/api/volunteers"] }, (current: any) =>
        Array.isArray(current) ? current.filter((item: any) => item.id !== vol.id) : current
      );
      void qc.invalidateQueries({ queryKey: getGetFeaturedVolunteersQueryKey() });
      setOpen(false);
      toast({ title: "Volunteer profile removed" });
    } catch {
      toast({ title: "Could not remove volunteer profile", variant: "destructive" });
      setDeleting(false);
    }
  };

    const requestContact = async () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to request contact", description: "Join Gavhah free to contact volunteers." });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/member-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "volunteer_contact",
          subject: `Volunteer contact request: ${vol.userName}`,
          message: `Member requested contact with volunteer #${vol.id} (${vol.userName}) in ${vol.location}.`,
        }),
      });
      if (res.ok) {
        setOpen(false);
        toast({ title: "Request sent", description: "Gavhah administrators received your contact request." });
      } else {
        toast({ title: "Could not send request", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-xl shrink-0">
            {(vol.userName || "?")[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-foreground">{vol.userName}</span>
              {vol.isFeatured && <Star className="h-4 w-4 text-accent fill-accent" />}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <MapPin className="h-3 w-3" /> {vol.location}
            </div>
            <div className="flex flex-wrap gap-1">
              {(vol.skills || []).slice(0, 3).map((skill: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{skill}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground border-t pt-3">
          <Clock className="h-3 w-3" /> {vol.availability}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">{vol.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><MapPin className="h-4 w-4" /> {vol.location}</div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Clock className="h-4 w-4" /> Available: {vol.availability}</div>
            {vol.skills?.length > 0 && (
              <div>
                <p className="font-semibold text-foreground text-sm mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">{vol.skills.map((s: string, i: number) => <Badge key={i} variant="outline">{s}</Badge>)}</div>
              </div>
            )}
            {vol.bio && (
              <div>
                <p className="font-semibold text-foreground text-sm mb-1">About</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{vol.bio}</p>
              </div>
            )}
            <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground">
              Contact is facilitated through Gavhah to protect privacy.
            </div>
            {canManage && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={openVolunteerEdit} className="gap-2">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/20"
                  onClick={() => void deleteVolunteer()}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" /> {deleting ? "Removing..." : "Remove"}
                </Button>
              </div>
            )}
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={requestContact} disabled={sending}>
              {sending ? "Sending..." : "Request Contact via Gavhah"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Volunteer Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>City / Community *</Label><Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} /></div>
            <div>
              <Label>Availability</Label>
              <Select value={editForm.availability} onValueChange={availability => setEditForm(f => ({ ...f, availability }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="evenings">Evenings</SelectItem>
                  <SelectItem value="weekends">Weekends</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                  <SelectItem value="on_call">On Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Skills</Label><Input value={editForm.skills} onChange={e => setEditForm(f => ({ ...f, skills: e.target.value }))} placeholder="Separate skills with commas" /></div>
            <div><Label>About</Label><Textarea className="min-h-24" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} /></div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveVolunteerEdit()} disabled={savingEdit || !editForm.location.trim()}>
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Help Request Card ----
function HelpRequestCard({ req }: { req: any }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    name: req.name ?? "",
    location: req.location ?? "",
    needType: req.needType ?? "other",
    description: req.description ?? "",
    urgency: req.urgency ?? "medium",
  });
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = !!user && (req.userId === user.id || isAdmin);
  const urgency = URGENCY_MAP[req.urgency] ?? URGENCY_MAP.medium;

  const openHelpEdit = () => {
    setEditForm({
      name: req.name ?? "",
      location: req.location ?? "",
      needType: req.needType ?? "other",
      description: req.description ?? "",
      urgency: req.urgency ?? "medium",
    });
    setEditOpen(true);
  };

  const saveHelpEdit = async () => {
    if (!editForm.name.trim() || !editForm.description.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/help-requests/${req.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          location: editForm.location.trim() || null,
          needType: editForm.needType,
          description: editForm.description.trim(),
          urgency: editForm.urgency,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueriesData({ queryKey: ["/api/help-requests"] }, (current: any) =>
        Array.isArray(current) ? current.map((item: any) => item.id === req.id ? updated : item) : current
      );
      void qc.invalidateQueries({ queryKey: ["/api/help-requests"] });
      setEditOpen(false);
      toast({ title: "Help request updated" });
    } catch {
      toast({ title: "Could not update help request", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteHelpRequest = async () => {
    if (!window.confirm("Delete this help request?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/help-requests/${req.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("delete failed");
      qc.setQueriesData({ queryKey: ["/api/help-requests"] }, (current: any) =>
        Array.isArray(current) ? current.filter((item: any) => item.id !== req.id) : current
      );
      void qc.invalidateQueries({ queryKey: getGetFeaturedRequestsQueryKey() });
      setOpen(false);
      toast({ title: "Help request deleted" });
    } catch {
      toast({ title: "Could not delete help request", variant: "destructive" });
      setDeleting(false);
    }
  };

    const offerHelp = async () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to offer help", description: "Join Gavhah free to respond to help requests." });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/member-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "help_offer",
          subject: `Offer to help: ${req.name}`,
          message: `Member offered help for request #${req.id}: ${req.description}`,
        }),
      });
      if (res.ok) {
        setOpen(false);
        toast({ title: "Offer sent", description: "Gavhah administrators received your offer to help." });
      } else {
        toast({ title: "Could not send offer", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant={urgency.color as any} className="gap-1 text-xs">{urgency.icon} {urgency.label}</Badge>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">{NEED_LABELS[req.needType] || req.needType}</span>
            </div>
            <p className="font-semibold text-foreground">{req.name}</p>
          </div>
          {req.isFeatured && <Star className="h-4 w-4 text-accent fill-accent shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{req.description}</p>
        <div className="flex items-center justify-between pt-2 border-t">
          <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize text-xs">{req.status}</Badge>
          <span className="text-xs text-muted-foreground">Contact via Gavhah</span>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif text-2xl text-primary">Help Request</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={urgency.color as any} className="gap-1">{urgency.icon} {urgency.label} Urgency</Badge>
              <Badge variant="outline">{NEED_LABELS[req.needType] || req.needType}</Badge>
              <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize">{req.status}</Badge>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">{req.name}</p>
              <p className="text-foreground leading-relaxed">{req.description}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
              To maintain privacy, all contact is handled through Gavhah administrators.
            </div>
            {canManage && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={openHelpEdit} className="gap-2">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/20"
                  onClick={() => void deleteHelpRequest()}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            )}
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={offerHelp} disabled={sending}>
              {sending ? "Sending..." : "I Can Help With This"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Help Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Location</Label><Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} /></div>
            <div>
              <Label>Need Type</Label>
              <Select value={editForm.needType} onValueChange={needType => setEditForm(f => ({ ...f, needType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="wedding">Wedding / Simcha</SelectItem>
                  <SelectItem value="food">Food Assistance</SelectItem>
                  <SelectItem value="housing">Housing</SelectItem>
                  <SelectItem value="transportation">Transportation</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urgency</Label>
              <Select value={editForm.urgency} onValueChange={urgency => setEditForm(f => ({ ...f, urgency }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea className="min-h-28" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveHelpEdit()} disabled={savingEdit || !editForm.name.trim() || !editForm.description.trim()}>
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Register Volunteer Dialog ----
// Activists Directory special rule: always show Nickname only
function RegisterVolunteerDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded, user } = useAuth();
  const [open, setOpen] = useState(false);

  const nickname = (user as any)?.nickname || user?.name || "";
  const [form, setForm] = useState({ userName: "", location: "", availability: "weekends", bio: "" });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const createVol = useCreateVolunteer();

  const handleOpen = () => {
    // Pre-fill userName with nickname (Activists Directory always uses nickname)
    setForm(f => ({ ...f, userName: nickname }));
    setOpen(true);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const toggleSkill = (skill: string) =>
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userName.trim() || !form.location.trim() || selectedSkills.length === 0) {
      toast({ title: "Please complete the required fields", description: "Display name, location, and at least one area of help are required.", variant: "destructive" });
      return;
    }
    createVol.mutate(
      { data: { userName: form.userName, location: form.location, availability: form.availability, bio: form.bio || undefined, skills: selectedSkills } },
      {
        onSuccess: (volunteer) => {
          qc.setQueryData(getListVolunteersQueryKey({}), (current: any) => {
            const items = Array.isArray(current) ? current : [];
            return [volunteer, ...items.filter((item: any) => item.id !== volunteer.id)];
          });
          void qc.invalidateQueries({ queryKey: ["/api/volunteers"] });
          void qc.invalidateQueries({ queryKey: getGetFeaturedVolunteersQueryKey() });
          setOpen(false);
          setForm({ userName: nickname, location: "", availability: "weekends", bio: "" });
          setSelectedSkills([]);
          toast({ title: "Thank you!", description: "You have been registered as a volunteer." });
        },
        onError: (error: any) => toast({
          title: "Could not register",
          description: error?.message?.includes("409") ? "You are already registered as a volunteer." : "Please check the form and try again.",
          variant: "destructive",
        }),
      }
    );
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate compact action="register as a volunteer">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={handleOpen}>
        <UserPlus className="h-4 w-4" /> Become a Volunteer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-2xl text-primary">Register as a Volunteer</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="font-semibold">Display Name</Label>
              <Input value={form.userName} onChange={set("userName")} placeholder="Your nickname" className="h-11" required />
              <p className="text-xs text-muted-foreground">Activists Directory shows nicknames only to protect privacy.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">City / Community *</Label>
              <Input value={form.location} onChange={set("location")} placeholder="Brooklyn, NY" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Availability</Label>
              <Select value={form.availability} onValueChange={set("availability")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekends">Weekends</SelectItem>
                  <SelectItem value="evenings">Evenings</SelectItem>
                  <SelectItem value="anytime">Anytime</SelectItem>
                  <SelectItem value="by_appointment">By Appointment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Areas of Help *</Label>
              <p className="text-xs text-muted-foreground">Select all that apply</p>
              <div className="flex flex-wrap gap-2">
                {SKILLS_OPTIONS.map(skill => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selectedSkills.includes(skill) ? "bg-secondary text-white border-secondary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Brief Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={form.bio} onChange={set("bio")} placeholder="A few words about your background or how you like to help..." className="resize-none min-h-20" />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createVol.isPending || selectedSkills.length === 0 || !form.location.trim()}>
              {createVol.isPending ? "Registering..." : "Register as Volunteer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Submit Request Dialog ----
function SubmitRequestDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", needType: "medical", urgency: "medium", location: "" });
  const createReq = useCreateHelpRequest();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description) return;
    createReq.mutate(
      { data: { name: form.name, description: form.description, needType: form.needType, urgency: form.urgency, location: form.location || undefined } },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", description: "", needType: "medical", urgency: "medium", location: "" });
          toast({
            title: "Request submitted for review",
            description: "It is private until Gavhah staff approves it for the public directory.",
          });
        },
        onError: () => toast({ title: "Could not submit request", description: "Please check the form and try again.", variant: "destructive" }),
      }
    );
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate compact action="submit a help request">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0" onClick={() => setOpen(true)}>
        <HelpCircle className="h-4 w-4" /> Request Help
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-2xl text-primary">Submit a Help Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Your request will be reviewed by Gavhah staff. All information is handled with full discretion.</p>
            <div className="space-y-1.5">
              <Label className="font-semibold">Name / Reference *</Label>
              <Input value={form.name} onChange={set("name")} placeholder="First name or family name only" className="h-11" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-semibold">Type of Need</Label>
                <Select value={form.needType} onValueChange={set("needType")}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="wedding">Wedding / Simcha</SelectItem>
                    <SelectItem value="food">Food Assistance</SelectItem>
                    <SelectItem value="housing">Housing</SelectItem>
                    <SelectItem value="transportation">Transportation</SelectItem>
                    <SelectItem value="financial">Financial</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Urgency</Label>
                <Select value={form.urgency} onValueChange={set("urgency")}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={form.location} onChange={set("location")} placeholder="City or neighborhood" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Description *</Label>
              <Textarea value={form.description} onChange={set("description")} placeholder="Describe the situation and what kind of help is needed..." className="resize-none min-h-28" required />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createReq.isPending}>
              {createReq.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Create Project Dialog ----
function CreateProjectDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded, user } = useAuth();
  const [open, setOpen] = useState(false);

  const displayName = (user as any)?.nickname || user?.name || "";
  const [form, setForm] = useState({ title: "", description: "", type: "project", organizerName: "", location: "", goalDescription: "" });
  const createProject = useCreateCommunityProject();

  const handleOpen = () => {
    setForm(f => ({ ...f, organizerName: f.organizerName || displayName }));
    setOpen(true);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.organizerName) return;
    createProject.mutate(
      { data: { title: form.title, description: form.description, type: form.type, organizerName: form.organizerName, location: form.location || undefined, goalDescription: form.goalDescription || undefined } },
      {
        onSuccess: (project) => {
          qc.setQueryData(getListCommunityProjectsQueryKey({}), (current: any) => {
            const items = Array.isArray(current) ? current : [];
            return [project, ...items.filter((item: any) => item.id !== project.id)];
          });
          void qc.invalidateQueries({ queryKey: ["/api/community-projects"] });
          setOpen(false);
          setForm({ title: "", description: "", type: "project", organizerName: displayName, location: "", goalDescription: "" });
          toast({ title: "Project created", description: "Your project is now listed in the directory." });
        },
        onError: () => toast({ title: "Error", description: "Could not create project.", variant: "destructive" }),
      }
    );
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate compact action="create a project">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={handleOpen}>
        <Plus className="h-4 w-4" /> Create Project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Create a Community Project</DialogTitle>
            <p className="text-sm text-muted-foreground">Start a project, campaign, initiative, or assistance program for the community.</p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-semibold">Type</Label>
                <Select value={form.type} onValueChange={set("type")}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="campaign">Campaign</SelectItem>
                    <SelectItem value="initiative">Initiative</SelectItem>
                    <SelectItem value="program">Program</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Location</Label>
                <Input value={form.location} onChange={set("location")} placeholder="City or region" className="h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Title *</Label>
              <Input value={form.title} onChange={set("title")} placeholder="Clear, descriptive project name" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Organizer Name *</Label>
              <Input value={form.organizerName} onChange={set("organizerName")} placeholder="Your name or organization" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Description *</Label>
              <Textarea value={form.description} onChange={set("description")} placeholder="What is this project about? Who does it help? What is the plan?" className="resize-none min-h-28" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Goal / What You Need <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={form.goalDescription} onChange={set("goalDescription")} placeholder="e.g. 10 drivers, $5,000, 20 volunteers..." className="h-11" />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={createProject.isPending}>
              <FolderKanban className="h-4 w-4" />
              {createProject.isPending ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Project Card ----
function ProjectCard({ project }: { project: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded, user, isAdmin } = useAuth();
  const [joinOpen, setJoinOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editForm, setEditForm] = useState({
    title: project.title ?? "",
    description: project.description ?? "",
    type: project.type ?? "project",
    location: project.location ?? "",
    goalDescription: project.goalDescription ?? "",
    status: project.status ?? "active",
  });

  const nickname = (user as any)?.nickname || user?.name || "";
  const [joinForm, setJoinForm] = useState({ name: "", role: "volunteer", message: "" });
  const joinProject = useJoinCommunityProject();

  const { data: members } = useListProjectMembers(
    project.id,
    { query: { queryKey: getListProjectMembersQueryKey(project.id), enabled: showMembers } }
  );

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setJoinForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const canManageProject = !!user && (project.ownerId === user.id || isAdmin);

  const openProjectEdit = () => {
    setEditForm({
      title: project.title ?? "",
      description: project.description ?? "",
      type: project.type ?? "project",
      location: project.location ?? "",
      goalDescription: project.goalDescription ?? "",
      status: project.status ?? "active",
    });
    setEditOpen(true);
  };

  const saveProjectEdit = async () => {
    if (!editForm.title.trim() || !editForm.description.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/community-projects/${project.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          type: editForm.type,
          organizerName: project.organizerName,
          location: editForm.location.trim() || null,
          goalDescription: editForm.goalDescription.trim() || null,
          status: editForm.status,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueriesData({ queryKey: ["/api/community-projects"] }, (current: any) =>
        Array.isArray(current) ? current.map((item: any) => item.id === project.id ? updated : item) : current
      );
      void qc.invalidateQueries({ queryKey: ["/api/community-projects"] });
      setEditOpen(false);
      toast({ title: "Project updated" });
    } catch {
      toast({ title: "Could not update project", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteProject = async () => {
    if (!window.confirm("Delete this community project?")) return;
    setDeletingProject(true);
    try {
      const res = await fetch(`/api/community-projects/${project.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      qc.setQueriesData({ queryKey: ["/api/community-projects"] }, (current: any) =>
        Array.isArray(current) ? current.filter((item: any) => item.id !== project.id) : current
      );
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Could not delete project", variant: "destructive" });
      setDeletingProject(false);
    }
  };

    const handleJoinOpen = () => {
    setJoinForm(f => ({ ...f, name: f.name || nickname }));
    setJoinOpen(true);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinForm.name) return;
    joinProject.mutate(
      { id: project.id, data: { name: joinForm.name, role: joinForm.role, message: joinForm.message || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectMembersQueryKey(project.id) });
          setJoinOpen(false);
          setJoinForm({ name: nickname, role: "volunteer", message: "" });
          toast({ title: "You have joined this project", description: "The organizer will be in touch to coordinate." });
        },
        onError: () => toast({ title: "Error", description: "Could not join.", variant: "destructive" }),
      }
    );
  };

  const typeColor = TYPE_COLORS[project.type] ?? TYPE_COLORS.project;
  const typeBadge = TYPE_BADGE[project.type] ?? TYPE_BADGE.project;

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${typeColor} hover:shadow-md transition-shadow`}>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${typeBadge}`}>
                {project.type}
              </span>
              {project.status !== "active" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border capitalize">{project.status}</span>
              )}
            </div>
            <h3 className="font-serif font-bold text-lg leading-tight">{project.title}</h3>
          </div>
          {canManageProject && (
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={openProjectEdit} title="Edit project">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => void deleteProject()}
                disabled={deletingProject}
                title="Delete project"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 text-xs text-current opacity-70">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {project.organizerName}</span>
          {project.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {project.location}</span>}
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {format(new Date(project.createdAt), "MMM d, yyyy")}</span>
        </div>

        <p className="text-sm leading-relaxed opacity-80 line-clamp-3">{project.description}</p>

        {project.goalDescription && (
          <div className="text-xs font-medium flex items-center gap-1.5 opacity-80">
            <Target className="h-3.5 w-3.5" /> Goal: {project.goalDescription}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isLoaded && !isAuthenticated ? (
            <MemberGate compact action="join this project">{null}</MemberGate>
          ) : (
            <Button size="sm" className="flex-1 bg-secondary hover:bg-secondary/90 text-white gap-1.5" onClick={handleJoinOpen}>
              <UserPlus className="h-3.5 w-3.5" /> Join / Volunteer
            </Button>
          )}
          <Button size="sm" variant="outline" className="bg-white/50 gap-1.5" onClick={() => setShowMembers(v => !v)}>
            {showMembers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Members
          </Button>
        </div>
      </div>

      {/* Members list */}
      {showMembers && (
        <div className="border-t border-white/40 bg-white/30 px-6 py-4 space-y-2">
          {!members ? (
            <p className="text-xs opacity-60 italic">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-xs opacity-60 italic">No members yet — be the first to join!</p>
          ) : (
            members.slice(0, 6).map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0" />
                <span className="font-medium">{m.name}</span>
                <span className="text-xs opacity-60">{ROLE_LABELS[m.role] ?? m.role}</span>
                {m.message && <span className="text-xs opacity-50 italic truncate">— {m.message}</span>}
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-lg text-primary">Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea className="min-h-32" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div>
              <Label>Type</Label>
              <Select value={editForm.type} onValueChange={type => setEditForm(f => ({ ...f, type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="campaign">Campaign</SelectItem>
                  <SelectItem value="initiative">Initiative</SelectItem>
                  <SelectItem value="program">Program</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location</Label><Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} /></div>
            <div><Label>Goal</Label><Input value={editForm.goalDescription} onChange={e => setEditForm(f => ({ ...f, goalDescription: e.target.value }))} /></div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveProjectEdit()} disabled={savingEdit || !editForm.title.trim() || !editForm.description.trim()}>
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join dialog */}
      <Dialog open={joinOpen} onOpenChange={v => !v && setJoinOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-primary">Join: {project.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="font-semibold">Your Name *</Label>
              <Input value={joinForm.name} onChange={setF("name")} placeholder="Name or nickname" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Role</Label>
              <Select value={joinForm.role} onValueChange={setF("role")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="volunteer">Volunteer</SelectItem>
                  <SelectItem value="supporter">Supporter</SelectItem>
                  <SelectItem value="organizer">Co-organizer</SelectItem>
                  <SelectItem value="donor">Donor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Message <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={joinForm.message} onChange={setF("message")} placeholder="How can you contribute?" className="resize-none min-h-20" />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-11 font-semibold gap-2" disabled={joinProject.isPending}>
              <UserPlus className="h-4 w-4" /> {joinProject.isPending ? "Joining..." : "Join Project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Main Page ----
export default function Directory() {
  const [volSearch, setVolSearch] = useState("");
  const [reqType, setReqType] = useState("");
  const [projectType, setProjectType] = useState("all");

  const volParams = { search: volSearch || undefined };
  const reqParams = { type: reqType || undefined };
  const projParams = { type: projectType === "all" ? undefined : projectType };

  const { data: volunteers, isLoading: volLoading } = useListVolunteers(volParams, { query: { queryKey: getListVolunteersQueryKey(volParams) } });
  const { data: requests, isLoading: reqLoading } = useListHelpRequests(reqParams, { query: { queryKey: getListHelpRequestsQueryKey(reqParams) } });
  const { data: featuredVols } = useGetFeaturedVolunteers({ query: { queryKey: getGetFeaturedVolunteersQueryKey() } });
  const { data: featuredReqs } = useGetFeaturedRequests({ query: { queryKey: getGetFeaturedRequestsQueryKey() } });
  const { data: projects, isLoading: projLoading } = useListCommunityProjects(projParams, { query: { queryKey: getListCommunityProjectsQueryKey(projParams) } });

  const NEED_TYPES = [
    { value: "", label: "All" }, { value: "medical", label: "Medical" },
    { value: "wedding", label: "Wedding" }, { value: "food", label: "Food" },
    { value: "housing", label: "Housing" }, { value: "transportation", label: "Transport" },
    { value: "financial", label: "Financial" },
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b">
        <div className="container mx-auto px-4 py-12">
          <h1 className="font-serif text-4xl font-bold text-primary mb-2">Activists Directory</h1>
          <p className="text-muted-foreground font-serif italic">
            Volunteers, help requests, and community-led projects — all in one place.
          </p>
          <p className="text-xs text-muted-foreground mt-2">All names shown are nicknames to protect privacy.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="volunteers" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1">
            <TabsTrigger value="volunteers" className="gap-2 px-5 py-2.5">
              <Users className="h-4 w-4" /> Volunteers
              {volunteers && <span className="ml-1 text-xs text-muted-foreground">({volunteers.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 px-5 py-2.5">
              <HandHeart className="h-4 w-4" /> Help Requests
              {requests && <span className="ml-1 text-xs text-muted-foreground">({requests.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 px-5 py-2.5">
              <FolderKanban className="h-4 w-4" /> Community Projects
              {projects && <span className="ml-1 text-xs text-muted-foreground">({projects.length})</span>}
            </TabsTrigger>
          </TabsList>

          {/* ---- Volunteers Tab ---- */}
          <TabsContent value="volunteers" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-10 h-11" placeholder="Search volunteers by name..." value={volSearch} onChange={e => setVolSearch(e.target.value)} />
              </div>
              <RegisterVolunteerDialog />
            </div>

            {featuredVols && featuredVols.length > 0 && !volSearch && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-accent fill-accent" />
                  <h3 className="font-serif font-bold text-primary">Featured Volunteers</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {featuredVols.map((vol: any) => <VolunteerCard key={vol.id} vol={vol} />)}
                </div>
                <hr />
              </div>
            )}

            {volLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
                    <div className="flex gap-3"><Skeleton className="w-12 h-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {volunteers?.map((vol: any) => <VolunteerCard key={vol.id} vol={vol} />)}
                {volunteers?.length === 0 && (
                  <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                    No volunteers yet. Be the first to register!
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ---- Help Requests Tab ---- */}
          <TabsContent value="requests" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex gap-2 flex-wrap flex-1">
                {NEED_TYPES.map(t => (
                  <Button key={t.value} variant={reqType === t.value ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setReqType(t.value)}>
                    {t.label}
                  </Button>
                ))}
              </div>
              <SubmitRequestDialog />
            </div>

            {featuredReqs && featuredReqs.length > 0 && !reqType && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="font-serif font-bold text-primary">Urgent Needs</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {featuredReqs.map((req: any) => <HelpRequestCard key={req.id} req={req} />)}
                </div>
                <hr />
              </div>
            )}

            {reqLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="bg-card border rounded-xl p-5 space-y-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {requests?.map((req: any) => <HelpRequestCard key={req.id} req={req} />)}
                {requests?.length === 0 && (
                  <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                    No help requests at the moment.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ---- Community Projects Tab ---- */}
          <TabsContent value="projects" className="space-y-6">
            {/* Sub-header */}
            <div className="bg-muted/30 rounded-xl p-5 border">
              <h2 className="font-serif text-xl font-bold text-primary mb-1">Community Projects & Initiatives</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Activists create projects, campaigns, and programs for the community to join.
                Browse what is underway and volunteer your time, skills, or support.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Type filters */}
              <div className="flex gap-2 flex-wrap">
                {PROJECT_TYPES.map(t => (
                  <Button
                    key={t.value}
                    variant={projectType === t.value ? "default" : "outline"}
                    size="sm"
                    className="rounded-full gap-1.5"
                    onClick={() => setProjectType(t.value)}
                  >
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </Button>
                ))}
              </div>
              <CreateProjectDialog />
            </div>

            {projLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {projects?.map((p: any) => <ProjectCard key={p.id} project={p} />)}
                {projects?.length === 0 && (
                  <div className="col-span-full text-center py-20 border-2 border-dashed rounded-xl bg-muted/10 text-muted-foreground">
                    <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-serif italic text-lg">No projects yet.</p>
                    <p className="text-sm mt-1">Be the first activist to create a community project.</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}
