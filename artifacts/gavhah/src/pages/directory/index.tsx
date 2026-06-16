import { useState } from "react";
import {
  useListVolunteers, useListHelpRequests, useGetFeaturedVolunteers, useGetFeaturedRequests,
  useCreateVolunteer, useCreateHelpRequest,
  getListVolunteersQueryKey, getListHelpRequestsQueryKey, getGetFeaturedVolunteersQueryKey, getGetFeaturedRequestsQueryKey,
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
import { Search, Users, HandHeart, MapPin, Clock, Star, AlertTriangle, AlertCircle, Minus, UserPlus, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const SKILLS_OPTIONS = ["Bikur Cholim", "Hospital Visits", "Medical Transport", "Hachnosas Kallah", "Wedding Assistance", "Fundraising", "Housing Support", "Financial Aid", "Crisis Counseling", "Community Organizing", "Special Needs", "Food Distribution", "Driver / Transport", "Translation", "Government Liaison"];

function VolunteerCard({ vol }: { vol: any }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
      >
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
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <MapPin className="h-4 w-4" /> {vol.location}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" /> Available: {vol.availability}
            </div>
            {vol.skills?.length > 0 && (
              <div>
                <p className="font-semibold text-foreground text-sm mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {vol.skills.map((s: string, i: number) => <Badge key={i} variant="outline">{s}</Badge>)}
                </div>
              </div>
            )}
            <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground">
              Contact is facilitated through Gavhah to protect privacy.
            </div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
              Request Contact via Gavhah
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HelpRequestCard({ req }: { req: any }) {
  const [open, setOpen] = useState(false);
  const urgency = URGENCY_MAP[req.urgency] ?? URGENCY_MAP.medium;
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant={urgency.color as any} className="gap-1 text-xs">
                {urgency.icon} {urgency.label}
              </Badge>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
                {NEED_LABELS[req.needType] || req.needType}
              </span>
            </div>
            <p className="font-semibold text-foreground">{req.name}</p>
          </div>
          {req.isFeatured && <Star className="h-4 w-4 text-accent fill-accent shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{req.description}</p>
        <div className="flex items-center justify-between pt-2 border-t">
          <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize text-xs">
            {req.status}
          </Badge>
          <span className="text-xs text-muted-foreground">Contact via Gavhah</span>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Help Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={urgency.color as any} className="gap-1">
                {urgency.icon} {urgency.label} Urgency
              </Badge>
              <Badge variant="outline">{NEED_LABELS[req.needType] || req.needType}</Badge>
              <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize">
                {req.status}
              </Badge>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">{req.name}</p>
              <p className="text-foreground leading-relaxed">{req.description}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
              To maintain privacy, all contact is handled through Gavhah administrators.
            </div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
              I Can Help With This
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegisterVolunteerDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userName: "", location: "", availability: "weekends", bio: "" });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const createVol = useCreateVolunteer();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const toggleSkill = (skill: string) =>
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userName || selectedSkills.length === 0) return;
    createVol.mutate(
      { data: { userName: form.userName, location: form.location, availability: form.availability, bio: form.bio || undefined, skills: selectedSkills } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVolunteersQueryKey({}) });
          qc.invalidateQueries({ queryKey: getGetFeaturedVolunteersQueryKey() });
          setOpen(false);
          setForm({ userName: "", location: "", availability: "weekends", bio: "" });
          setSelectedSkills([]);
          toast({ title: "Thank you!", description: "You have been registered as a volunteer." });
        },
        onError: () => toast({ title: "Error", description: "Could not register. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Become a Volunteer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Register as a Volunteer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="font-semibold">Display Name *</Label>
              <Input value={form.userName} onChange={set("userName")} placeholder="Name shown publicly (nickname is fine)" className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">City / Community</Label>
              <Input value={form.location} onChange={set("location")} placeholder="Brooklyn, NY" className="h-11" />
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
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selectedSkills.includes(skill) ? "bg-secondary text-white border-secondary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
              {selectedSkills.length === 0 && <p className="text-xs text-muted-foreground italic">Select at least one area</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Brief Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={form.bio} onChange={set("bio")} placeholder="A few words about your background or how you like to help..." className="resize-none min-h-20" />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold" disabled={createVol.isPending || selectedSkills.length === 0}>
              {createVol.isPending ? "Registering..." : "Register as Volunteer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubmitRequestDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
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
          qc.invalidateQueries({ queryKey: getListHelpRequestsQueryKey({}) });
          qc.invalidateQueries({ queryKey: getGetFeaturedRequestsQueryKey() });
          setOpen(false);
          setForm({ name: "", description: "", needType: "medical", urgency: "medium", location: "" });
          toast({ title: "Request submitted", description: "Gavhah staff will be in touch to coordinate assistance." });
        },
        onError: () => toast({ title: "Error", description: "Could not submit. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0" onClick={() => setOpen(true)}>
        <HelpCircle className="h-4 w-4" /> Request Help
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Submit a Help Request</DialogTitle>
          </DialogHeader>
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

export default function Directory() {
  const [volSearch, setVolSearch] = useState("");
  const [reqType, setReqType] = useState("");

  const volParams = { search: volSearch || undefined };
  const reqParams = { type: reqType || undefined };

  const { data: volunteers, isLoading: volLoading } = useListVolunteers(volParams, {
    query: { queryKey: getListVolunteersQueryKey(volParams) },
  });
  const { data: requests, isLoading: reqLoading } = useListHelpRequests(reqParams, {
    query: { queryKey: getListHelpRequestsQueryKey(reqParams) },
  });
  const { data: featuredVols } = useGetFeaturedVolunteers({
    query: { queryKey: getGetFeaturedVolunteersQueryKey() },
  });
  const { data: featuredReqs } = useGetFeaturedRequests({
    query: { queryKey: getGetFeaturedRequestsQueryKey() },
  });

  const NEED_TYPES = [
    { value: "", label: "All" },
    { value: "medical", label: "Medical" },
    { value: "wedding", label: "Wedding" },
    { value: "food", label: "Food" },
    { value: "housing", label: "Housing" },
    { value: "transportation", label: "Transport" },
    { value: "financial", label: "Financial" },
  ];

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b">
        <div className="container mx-auto px-4 py-12">
          <h1 className="font-serif text-4xl font-bold text-primary mb-2">Activists Directory</h1>
          <p className="text-muted-foreground font-serif italic">
            Connect volunteers with families in need across the global Jewish community.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            All names shown are nicknames to protect privacy.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="volunteers" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1">
            <TabsTrigger value="volunteers" className="gap-2 px-6 py-2.5">
              <Users className="h-4 w-4" /> Volunteers
              {volunteers && <span className="ml-1 text-xs text-muted-foreground">({volunteers.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 px-6 py-2.5">
              <HandHeart className="h-4 w-4" /> Help Requests
              {requests && <span className="ml-1 text-xs text-muted-foreground">({requests.length})</span>}
            </TabsTrigger>
          </TabsList>

          {/* Volunteers Tab */}
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
                    <div className="flex gap-3">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
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

          {/* Help Requests Tab */}
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
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {requests?.map((req: any) => <HelpRequestCard key={req.id} req={req} />)}
                {requests?.length === 0 && (
                  <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                    No open requests. The community is doing well!
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
