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
import { useLanguage } from "@/context/language-context";
import { ContactMethodPicker, initialContactMethods, type ContactMethodsForm } from "@/components/shared/contact-method-picker";

// ---- Constants ----
  const contactReady = (contact: ContactMethodsForm) =>
    contact.primaryValue.trim() && !!contact.mayConsiderSharing && (!contact.backupMethod || (contact.backupValue||"").trim());
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
  const [requestOpen, setRequestOpen] = useState(false);
  const [contactMethods, setContactMethods] = useState<ContactMethodsForm>(initialContactMethods);
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
          skills: editForm.skills.split(",").map((x: string) => x.trim()).filter(Boolean),
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

  const openContactRequest = async () => {
    if(!isAuthenticated){
      toast({title:"Sign in to request contact",description:"Join Gavhah free to contact volunteers."});
      return;
    }
    setRequestOpen(true);
    try{
      const r=await fetch("/api/me/contact-methods/help",{credentials:"include",cache:"no-store"});
      if(r.ok){const x=await r.json();if(x.methods)setContactMethods(x.methods);}
    }catch{/* Allow a new entry if a saved method is unavailable. */}
  };

  const requestContact = async () => {
    if (!isAuthenticated || !contactReady(contactMethods)) {
      toast({ title: "Please enter your primary contact method", variant:"destructive" });return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/member-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "volunteer_contact",
          volunteerId: vol.id,
          contactMethods,
          subject: `Volunteer contact request: ${vol.userName}`,
          message: `Member requested contact with volunteer #${vol.id} (${vol.userName}) in ${vol.location}.`,
        }),
      });
      if (res.ok) {
        setOpen(false);setRequestOpen(false);
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
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void openContactRequest()} disabled={sending}>
              {sending ? "Sending..." : "Request Contact via Gavhah"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ask Gavhah to Arrange Contact</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Gavhah will check your request. The volunteer and you must EACH personally approve sharing any details.
          </p>
          <ContactMethodPicker value={contactMethods} onChange={setContactMethods} />
          <Button type="button" disabled={sending || !contactReady(contactMethods)}
            onClick={() => void requestContact()}>
            {sending ? "Submitting..." : "Send Request for Staff Review"}
          </Button>
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
  const [contactMethods, setContactMethods] = useState<ContactMethodsForm>(initialContactMethods);
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
    if (!contactReady(contactMethods)) {
      toast({ title: "Enter the main contact method and any selected backup", variant: "destructive" });return;
    }
    createVol.mutate(
      { data: { userName: form.userName, location: form.location, availability: form.availability, bio: form.bio || undefined, skills: selectedSkills, contactMethods } as any },
      {
        onSuccess: (volunteer) => {
          // The volunteer registry is private to administration. Never populate a public cache.
          setOpen(false);
          setForm({ userName: nickname, location: "", availability: "weekends", bio: "" });
          setSelectedSkills([]);
          setContactMethods(initialContactMethods());
          toast({ title: "Application received", description: "Your private volunteer registration is available to Gavhah staff only." });
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
    return <MemberGate gate="volunteer" action="register as a volunteer">{null}</MemberGate>;
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
            <ContactMethodPicker value={contactMethods} onChange={setContactMethods} />
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createVol.isPending || selectedSkills.length === 0 || !form.location.trim() || !contactReady(contactMethods)}>
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
  const [contactMethods, setContactMethods] = useState<ContactMethodsForm>(initialContactMethods);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description) return;
    if (!contactReady(contactMethods)) {
      toast({ title: "Enter your main contact method and any selected backup", variant: "destructive" });return;
    }
    createReq.mutate(
      { data: { name: form.name, description: form.description, needType: form.needType, urgency: form.urgency, location: form.location || undefined, contactMethods } as any },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", description: "", needType: "medical", urgency: "medium", location: "" });
          setContactMethods(initialContactMethods());
          toast({
            title: "Request submitted for review",
            description: "Your request stays private. Gavhah staff will review and look for a suitable helper.",
          });
        },
        onError: () => toast({ title: "Could not submit request", description: "Please check the form and try again.", variant: "destructive" }),
      }
    );
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate gate="help" action="submit a help request">{null}</MemberGate>;
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
            <ContactMethodPicker value={contactMethods} onChange={setContactMethods} />
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createReq.isPending || !contactReady(contactMethods)}>
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
    return <MemberGate gate="projects" action="create a project">{null}</MemberGate>;
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
            <MemberGate gate="projects" action="join this project">{null}</MemberGate>
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

// ---- Confidential intake only: no applicant lists on the website ----
export default function Directory() {
  const {lang}=useLanguage(),yi=lang==="yi";
  const {isAuthenticated,isLoaded}=useAuth();
  return <Layout>
    <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b">
      <div className="container mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary">
          {yi ? "גבהה — פריוואטע הילף און עסקנות" : "Gavhah — Private Assistance"}
        </h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          {yi ? "דארפסטו הילף, אדער ווילסטו העלפן אנדערע? שיק אריין א פריוואטע בקשה. די מערכת זוכט פאסיגע עסקנים און פירט די גאנצע פארבינדונג. קיין בקשות אדער עסקנים־ליסטעס ווערן נישט פובליק געמאכט." :
            "Need help or want to assist others? Submit a confidential request. Gavhah staff will find a suitable person and manage the introduction. No member, volunteer, or help-request list is published."}
        </p>
      </div>
    </div>
    <div className="container mx-auto px-4 py-10 max-w-4xl space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <section className="border rounded-xl bg-card p-6 space-y-4">
          <div className="flex gap-2 items-center text-primary">
            <HandHeart className="h-7 w-7"/><h2 className="font-serif font-bold text-xl">
              {yi ? "איך דארף הילף" : "I Need Help"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {yi ? "נאר די מערכת זעט דיין בקשה. מיר זוכן פאר דיר א פאסיגן עסקן אין אונזער פריוואטער ליסטע. די בקשה גייט נישט ארויף אויפן וועבסייט." :
              "Only Gavhah staff will review your request and search the private volunteer registry. Nothing you submit is published."}
          </p>
          {isLoaded && (isAuthenticated ? <SubmitRequestDialog/> :
            <MemberGate gate="help" action="submit a help request"/>)}
        </section>
        <section className="border rounded-xl bg-card p-6 space-y-4">
          <div className="flex gap-2 items-center text-primary">
            <Users className="h-7 w-7"/><h2 className="font-serif font-bold text-xl">
              {yi ? "איך וויל העלפן" : "I Want to Help"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {yi ? "גיב אן דיינע קענטענישן און ווען דו ביסט אוועילעבל. נאר די מערכת וועט דאס זען און דיך אנפרעגן אויב זי געפינט א פאסיגן פאל." :
              "Privately provide your skills, area and availability. Only Gavhah staff sees your application and will approach you about a suitable case."}
          </p>
          {isLoaded && (isAuthenticated ? <RegisterVolunteerDialog/> :
            <MemberGate gate="volunteer" action="register as a volunteer"/>)}
        </section>
      </div>
      <div className="rounded-xl border p-4 text-sm text-muted-foreground space-y-2 bg-muted/10">
        <p className="font-semibold text-primary">{yi ? "וויכטיג וועגן פריוואטקייט" : "Your privacy matters"}</p>
        <p>{yi ? "פארבינדונגען ווערן געהאנדלט בלויז דורך גבהה. דער בעטער און דער עסקן דארפן ביידע מסכים זיין; דערנאך מוז די מערכת געבן א באזונדערע לעצטע ערלויבעניש איידער פרטים ווערן איבערגעגעבן." :
          "Introductions are coordinated by Gavhah only. Both participants must personally consent, followed by separate final Gavhah authorization, before any contact details are shared."}</p>
      </div>
    </div>
  </Layout>;
}

/** Community projects are a separate feature, not a directory of help-seekers or volunteers. */
export function CommunityProjectsPage(){
  const [projectType,setProjectType]=useState("all");
  const projParams={type:projectType==="all"?undefined:projectType};
  const {data:projects,isLoading}=useListCommunityProjects(projParams,{
    query:{queryKey:getListCommunityProjectsQueryKey(projParams)},
  });
  return <Layout>
    <section className="container mx-auto max-w-5xl px-4 py-10 space-y-6">
      <h1 className="text-3xl font-serif font-bold text-primary">Community Projects & Initiatives</h1>
      <p className="text-sm text-muted-foreground">
        Community projects are separate from Gavhah's strictly confidential volunteer and private-assistance system.
        No private help requests or volunteer applications are displayed here.
      </p>
      <div className="flex flex-wrap gap-2">
        {PROJECT_TYPES.map(t=><Button key={t.value} size="sm"
          variant={projectType===t.value?"default":"outline"}
          onClick={()=>setProjectType(t.value)}><t.icon className="h-4 w-4 me-1"/>{t.label}</Button>)}
      </div>
      <CreateProjectDialog/>
      <div className="grid md:grid-cols-2 gap-4">
        {isLoading?<p>Loading projects...</p>:
          projects?.map((p:any)=><ProjectCard key={p.id} project={p}/>)}
      </div>
    </section>
  </Layout>;
}
