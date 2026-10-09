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

// Volunteer and help applications are confidential to Gavhah.
// Old public profile/request card components and their preset edit menus were
// removed. Campaign/project cards remain complete below.

// ---- Register Volunteer Dialog ----
// Activists Directory special rule: always show Nickname only
function RegisterVolunteerDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded, user } = useAuth();
  const [open, setOpen] = useState(false);

  const nickname = (user as any)?.nickname || user?.name || "";
  const { lang } = useLanguage(), yi = lang === "yi";
  const [form, setForm] = useState({ userName: "", location: "", availability: "anytime", bio: "" });
  const [skillsText, setSkillsText] = useState("");
  const [contactMethods, setContactMethods] = useState<ContactMethodsForm>(initialContactMethods);
  const createVol = useCreateVolunteer();

  const handleOpen = () => {
    // Pre-fill userName with nickname (Activists Directory always uses nickname)
    setForm(f => ({ ...f, userName: nickname }));
    setOpen(true);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const skills = skillsText.split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean).slice(0,30);
    if (!form.userName.trim() || !form.location.trim() || skills.length === 0) {
      toast({ title: "Please complete the required fields", description: yi ? "נאמען, געגנט און אן אייגענע קאטאגאריע זענען פארלאנגט." : "Name, location, and your custom area of help are required.", variant: "destructive" });
      return;
    }
    if (!contactReady(contactMethods)) {
      toast({ title: "Enter the main contact method and any selected backup", variant: "destructive" });return;
    }
    createVol.mutate(
      { data: { userName: form.userName, location: form.location, availability: "anytime", bio: form.bio || undefined, skills, contactMethods } as any },
      {
        onSuccess: (volunteer) => {
          // The volunteer registry is private to administration. Never populate a public cache.
          setOpen(false);
          setForm({ userName: nickname, location: "", availability: "anytime", bio: "" });
          setSkillsText("");
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
              <p className="text-xs text-muted-foreground">This is a private application. Only Gavhah staff sees your details.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">City / Community *</Label>
              <Input value={form.location} onChange={set("location")} placeholder="Brooklyn, NY" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">{yi ? "ווען קענסטו העלפן?" : "Availability"}</Label>
              <div className="border rounded-md bg-muted/20 p-3 text-sm font-medium">
                {yi ? "אין יעדע צייט" : "Anytime"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">{yi ? "אין וועלכע זאכן קענסטו העלפן? *" : "Your own areas of help *"}</Label>
              <Textarea value={skillsText} onChange={e=>setSkillsText(e.target.value)} maxLength={1800}
                className="min-h-24" dir="auto" required
                placeholder={yi ? "שרייב אליין די קאטאגאריע אדער קענטענישן, אויף באזונדערע שורות." : "Write your own help category or skills, one per line."} />
              <p className="text-xs text-muted-foreground">{yi ? "קיין פארגעשריבענע קאטאגאריעס. נאר די מערכת זעט די פרטים." : "No preset categories. Staff only; not published."}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Brief Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={form.bio} onChange={set("bio")} placeholder="A few words about your background or how you like to help..." className="resize-none min-h-20" />
            </div>
            <ContactMethodPicker value={contactMethods} onChange={setContactMethods} />
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createVol.isPending || !skillsText.trim() || !form.location.trim() || !contactReady(contactMethods)}>
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
  const { lang } = useLanguage(), yi = lang === "yi";
  const [form, setForm] = useState({ name: "", description: "", needType: "", urgency: "medium", location: "" });
  const createReq = useCreateHelpRequest();
  const [contactMethods, setContactMethods] = useState<ContactMethodsForm>(initialContactMethods);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.needType.trim()) {
      toast({title: yi ? "שרייב דיין קאטאגאריע און די בקשה" : "Enter a custom category and request description",variant:"destructive"}); return;
    }
    if (!contactReady(contactMethods)) {
      toast({ title: "Enter your main contact method and any selected backup", variant: "destructive" });return;
    }
    createReq.mutate(
      { data: { name: form.name, description: form.description, needType: form.needType, urgency: form.urgency, location: form.location || undefined, contactMethods } as any },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", description: "", needType: "", urgency: "medium", location: "" });
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
            <div className="space-y-1.5">
              <Label className="font-semibold">{yi ? "וואס פאר הילף דארפסטו? — אייגענע קאטאגאריע *" : "Kind of help — write your own category *"}</Label>
              <Input value={form.needType} onChange={set("needType")} dir="auto" maxLength={120}
                placeholder={yi ? "שרייב אליין וואס דו דארפסט" : "Describe the kind of help in your own words"}
                className="h-11" required />
              <p className="text-xs text-muted-foreground">{yi ? "גארנישט ווערט נישט פובליק." : "Private to Gavhah; no preset categories."}</p>
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
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createReq.isPending || !form.needType.trim() || !contactReady(contactMethods)}>
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

// ---- Public community projects / campaigns / initiatives / programs ----
// This section is NOT the confidential help or volunteer registry.
function CommunityProjectsContent() {
  const [projectType,setProjectType]=useState("all");
  const projParams={type:projectType==="all"?undefined:projectType};
  const {data:projects,isLoading}=useListCommunityProjects(projParams,{
    query:{queryKey:getListCommunityProjectsQueryKey(projParams)},
  });
  return <section id="community-projects" className="space-y-6 scroll-mt-20">
    <div className="rounded-xl border bg-muted/20 p-5 space-y-2">
      <div className="flex items-center gap-2">
        <FolderKanban className="h-6 w-6 text-primary" />
        <h2 className="font-serif text-2xl font-bold text-primary">Community Projects, Campaigns & Programs</h2>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Create and manage community projects, campaigns, initiatives and programs.
        Browse what is underway, see the goals, join, volunteer your time or offer support.
        This public project area is separate from private assistance applications.
      </p>
    </div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-wrap gap-2">
        {PROJECT_TYPES.map(t=><Button key={t.value} size="sm" className="rounded-full gap-1.5"
          variant={projectType===t.value?"default":"outline"} onClick={()=>setProjectType(t.value)}>
          <t.icon className="h-3.5 w-3.5" />{t.label}
        </Button>)}
      </div>
      <CreateProjectDialog/>
    </div>
    {isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {[...Array(4)].map((_,i)=><Skeleton key={i} className="h-56 rounded-xl" />)}
    </div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {projects?.map((p:any)=><ProjectCard key={p.id} project={p}/>)}
      {projects?.length===0&&<div className="col-span-full text-center py-16 border-2 border-dashed rounded-xl bg-muted/10">
        <FolderKanban className="h-10 w-10 mx-auto mb-3 text-muted-foreground"/>
        <p className="font-serif italic text-lg">No projects yet.</p>
        <p className="text-sm text-muted-foreground">Start a campaign, program or project for your community.</p>
      </div>}
    </div>}
  </section>;
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

      <CommunityProjectsContent />
    </div>
  </Layout>;
}

/** Dedicated URL for the same complete project and campaign center. */
export function CommunityProjectsPage(){
  return <Layout>
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <CommunityProjectsContent/>
    </div>
  </Layout>;
}
