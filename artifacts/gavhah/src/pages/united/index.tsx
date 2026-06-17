import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Heart, Users, HandHeart, Stethoscope, Home, AlertTriangle,
  Crown, Plus, ChevronDown, ChevronUp, CheckCircle, DollarSign, UserPlus
} from "lucide-react";
import {
  useListHelpRequests, useCreateHelpRequest, getListHelpRequestsQueryKey,
  useListCauseSupporters, useJoinCause, getListCauseSupportersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CAUSES = [
  {
    id: "chassan",
    label: "Chassan / Kallah Support",
    description: "Help newlyweds start their lives with dignity — furniture, household essentials, simcha expenses, and ongoing support.",
    icon: Crown,
    color: "bg-rose-50 border-rose-200",
    headerColor: "bg-rose-600",
    textColor: "text-rose-700",
    iconColor: "text-rose-500",
    badgeColor: "bg-rose-100 text-rose-800 border-rose-200",
    needType: "wedding",
  },
  {
    id: "almana",
    label: "Almana / Widow Support",
    description: "Standing beside widows with practical help, emotional support, childcare, and ongoing assistance through difficult times.",
    icon: Heart,
    color: "bg-purple-50 border-purple-200",
    headerColor: "bg-purple-600",
    textColor: "text-purple-700",
    iconColor: "text-purple-500",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    needType: "other",
  },
  {
    id: "yasom",
    label: "Yasom / Orphan Support",
    description: "Ensuring orphaned children have what they need — school support, Yom Tov essentials, Bar/Bat Mitzvah help, and more.",
    icon: Users,
    color: "bg-blue-50 border-blue-200",
    headerColor: "bg-blue-600",
    textColor: "text-blue-700",
    iconColor: "text-blue-500",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    needType: "financial",
  },
  {
    id: "medical",
    label: "Medical / Bikur Cholim",
    description: "Hospital visits, medical transport, meals for patients' families, and crisis support for those facing illness.",
    icon: Stethoscope,
    color: "bg-green-50 border-green-200",
    headerColor: "bg-green-600",
    textColor: "text-green-700",
    iconColor: "text-green-500",
    badgeColor: "bg-green-100 text-green-800 border-green-200",
    needType: "medical",
  },
  {
    id: "emergency",
    label: "Emergency Assistance",
    description: "Rapid response for urgent situations — fire, flood, sudden loss of income, eviction, or unexpected family crisis.",
    icon: AlertTriangle,
    color: "bg-orange-50 border-orange-200",
    headerColor: "bg-orange-600",
    textColor: "text-orange-700",
    iconColor: "text-orange-500",
    badgeColor: "bg-orange-100 text-orange-800 border-orange-200",
    needType: "other",
  },
  {
    id: "housing",
    label: "Housing / Parnassa",
    description: "Food assistance, rent support, job placement help, and support for families struggling with basic daily needs.",
    icon: Home,
    color: "bg-amber-50 border-amber-200",
    headerColor: "bg-amber-600",
    textColor: "text-amber-700",
    iconColor: "text-amber-500",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    needType: "housing",
  },
];

type Cause = typeof CAUSES[0];

const PLEDGE_LABELS: Record<string, string> = {
  financial: "Financial Support",
  volunteer: "Volunteer Time",
  both: "Financial + Volunteer",
  items: "Goods / Items",
  coordination: "Coordination Help",
};

function JoinCauseDialog({ cause, open, onClose }: { cause: Cause; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const joinCause = useJoinCause();
  const [form, setForm] = useState({ name: "", pledgeType: "volunteer", pledgeAmount: "", message: "", location: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.pledgeType) return;
    joinCause.mutate(
      {
        data: {
          causeType: cause.id,
          name: form.name,
          pledgeType: form.pledgeType,
          pledgeAmount: form.pledgeAmount ? Number(form.pledgeAmount) : undefined,
          message: form.message || undefined,
          location: form.location || undefined,
        }
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListCauseSupportersQueryKey({}) });
          onClose();
          setForm({ name: "", pledgeType: "volunteer", pledgeAmount: "", message: "", location: "" });
          toast({ title: "You have joined this cause", description: `Thank you for committing to ${cause.label}. Gavhah will be in touch to coordinate.` });
        },
        onError: () => toast({ title: "Error", description: "Could not register. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">Join: {cause.label}</DialogTitle>
          <p className="text-sm text-muted-foreground">Register your commitment to this cause. Gavhah will coordinate with you.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="font-semibold">Your Name / Nickname *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="How should we address you?" className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={set("location")} placeholder="City or neighborhood" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">How Can You Help?</Label>
            <Select value={form.pledgeType} onValueChange={set("pledgeType")}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volunteer">Volunteer Time</SelectItem>
                <SelectItem value="financial">Financial Support</SelectItem>
                <SelectItem value="both">Financial + Volunteer</SelectItem>
                <SelectItem value="items">Goods / Items</SelectItem>
                <SelectItem value="coordination">Coordination Help</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(form.pledgeType === "financial" || form.pledgeType === "both") && (
            <div className="space-y-1.5">
              <Label className="font-semibold">Approximate Pledge Amount ($) <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input type="number" min="0" value={form.pledgeAmount} onChange={set("pledgeAmount")} placeholder="0" className="h-11" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-semibold">Message / What You Offer <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea value={form.message} onChange={set("message")} placeholder="Describe your availability, skills, or specific offer..." className="resize-none min-h-24" />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={joinCause.isPending}>
            <UserPlus className="h-4 w-4" />
            {joinCause.isPending ? "Registering..." : "Join This Cause"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestSupportDialog({ cause, open, onClose }: { cause: Cause; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const createReq = useCreateHelpRequest();
  const [form, setForm] = useState({ name: "", description: "", urgency: "medium", location: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description) return;
    createReq.mutate(
      { data: { name: form.name, description: form.description, needType: cause.needType, urgency: form.urgency, location: form.location || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListHelpRequestsQueryKey({}) });
          onClose();
          setForm({ name: "", description: "", urgency: "medium", location: "" });
          toast({ title: "Request received", description: "Our team will be in touch discreetly to coordinate assistance." });
        },
        onError: () => toast({ title: "Error", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">Request {cause.label} Support</DialogTitle>
          <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 mt-1">
            Your information will be handled with complete discretion by Gavhah staff.
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="font-semibold">Name / Reference *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="First name is fine" className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={set("location")} placeholder="City or neighborhood" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Urgency</Label>
            <Select value={form.urgency} onValueChange={set("urgency")}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical — Immediate</SelectItem>
                <SelectItem value="high">High — Within days</SelectItem>
                <SelectItem value="medium">Medium — Within weeks</SelectItem>
                <SelectItem value="low">Low — Ongoing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">What do you need? *</Label>
            <Textarea value={form.description} onChange={set("description")} placeholder="Describe your situation and what kind of support would help most..." className="resize-none min-h-28" required />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={createReq.isPending}>
            <Heart className="h-4 w-4" />
            {createReq.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CauseCard({
  cause, supporters, needCount,
}: {
  cause: Cause;
  supporters: any[];
  needCount: number;
}) {
  const Icon = cause.icon;
  const [expanded, setExpanded] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const supporterCount = supporters.length;
  const pledgedFinancial = supporters.filter(s => s.pledgeType === "financial" || s.pledgeType === "both");
  const totalPledged = pledgedFinancial.reduce((a: number, s: any) => a + (Number(s.pledgeAmount) || 0), 0);
  const recentSupporters = supporters.slice(0, 4);

  return (
    <div className={`border-2 rounded-2xl overflow-hidden ${cause.color} transition-shadow hover:shadow-md`}>
      {/* Card header with icon + title */}
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
            <Icon className={`h-6 w-6 ${cause.iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className={`font-serif font-bold text-lg mb-1 ${cause.textColor}`}>{cause.label}</h3>
            <p className={`text-sm leading-relaxed opacity-80 ${cause.textColor}`}>{cause.description}</p>
          </div>
        </div>

        {/* Live stats */}
        <div className="flex gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cause.badgeColor}`}>
            <UserPlus className="h-3.5 w-3.5" />
            {supporterCount} {supporterCount === 1 ? "supporter" : "supporters"} joined
          </div>
          {needCount > 0 && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cause.badgeColor}`}>
              <HandHeart className="h-3.5 w-3.5" />
              {needCount} {needCount === 1 ? "family" : "families"} waiting
            </div>
          )}
          {totalPledged > 0 && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cause.badgeColor}`}>
              <DollarSign className="h-3.5 w-3.5" />
              ${totalPledged.toLocaleString()} pledged
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-secondary hover:bg-secondary/90 text-white gap-1.5 font-medium"
            onClick={() => setJoinOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" /> Join This Cause
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 bg-white/60 border-current gap-1.5 font-medium"
            onClick={() => setRequestOpen(true)}
          >
            <HandHeart className="h-3.5 w-3.5" /> Request Support
          </Button>
        </div>

        {/* Toggle supporters */}
        {supporterCount > 0 && (
          <button
            className={`text-xs font-medium flex items-center gap-1.5 ${cause.textColor} opacity-70 hover:opacity-100 transition-opacity`}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Hide supporters" : "See who is helping"}
          </button>
        )}
      </div>

      {/* Expanded: recent supporters */}
      {expanded && supporters.length > 0 && (
        <div className="border-t border-white/40 bg-white/30 p-5 space-y-3">
          <p className={`text-xs font-bold uppercase tracking-wider ${cause.textColor} opacity-70`}>
            Recent Supporters
          </p>
          {recentSupporters.map((s: any) => (
            <div key={s.id} className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full bg-white/60 flex items-center justify-center shrink-0`}>
                <CheckCircle className={`h-4 w-4 ${cause.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${cause.textColor}`}>{s.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${cause.badgeColor}`}>
                    {PLEDGE_LABELS[s.pledgeType] ?? s.pledgeType}
                    {s.pledgeAmount && ` · $${Number(s.pledgeAmount).toLocaleString()}`}
                  </span>
                  {s.location && <span className={`text-xs opacity-60 ${cause.textColor}`}>{s.location}</span>}
                </div>
                {s.message && (
                  <p className={`text-xs mt-1 leading-relaxed opacity-70 ${cause.textColor} line-clamp-2`}>
                    "{s.message}"
                  </p>
                )}
              </div>
            </div>
          ))}
          {supporters.length > 4 && (
            <p className={`text-xs ${cause.textColor} opacity-60 font-medium`}>
              + {supporters.length - 4} more supporters…
            </p>
          )}
        </div>
      )}

      <JoinCauseDialog cause={cause} open={joinOpen} onClose={() => setJoinOpen(false)} />
      <RequestSupportDialog cause={cause} open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}

export default function United() {
  const { data: allRequests } = useListHelpRequests({}, { query: { queryKey: getListHelpRequestsQueryKey({}) } });
  const { data: allSupporters } = useListCauseSupporters({}, { query: { queryKey: getListCauseSupportersQueryKey({}) } });

  const getCount = (needType: string) =>
    allRequests?.filter((r: any) => r.needType === needType && r.status === "open").length ?? 0;

  const getSupporters = (causeId: string) =>
    (allSupporters ?? []).filter((s: any) => s.causeType === causeId);

  const totalSupporters = allSupporters?.length ?? 0;
  const totalNeeds = allRequests?.filter((r: any) => r.status === "open").length ?? 0;

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-br from-rose-50 via-amber-50/30 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-3">
            <Heart className="h-8 w-8 text-rose-500 fill-rose-100" />
            <h1 className="font-serif text-4xl font-bold text-primary">United In Kindness</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-2xl">
            Join a cause, pledge your support, and coordinate with others — together we can help every family in need.
          </p>

          {/* Platform stats */}
          {(totalSupporters > 0 || totalNeeds > 0) && (
            <div className="mt-6 ml-11 flex flex-wrap gap-4">
              {totalSupporters > 0 && (
                <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                  <UserPlus className="h-4 w-4" />
                  <span>{totalSupporters} people have joined a cause</span>
                </div>
              )}
              {totalNeeds > 0 && (
                <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                  <HandHeart className="h-4 w-4" />
                  <span>{totalNeeds} {totalNeeds === 1 ? "family" : "families"} currently seeking help</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="mb-8 max-w-2xl">
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">Choose Your Cause</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Each cause unites people around a shared commitment. Join a cause to register your pledge and connect with others who share your dedication. If your family needs help, you can also request support through any cause.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAUSES.map(cause => (
            <CauseCard
              key={cause.id}
              cause={cause}
              supporters={getSupporters(cause.id)}
              needCount={getCount(cause.needType)}
            />
          ))}
        </div>

        {/* How it works */}
        <div className="mt-16 bg-muted/30 rounded-2xl p-8 border">
          <h3 className="font-serif text-xl font-bold text-primary mb-6 text-center">How United In Kindness Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {[
              { step: "1", title: "Join a Cause", desc: "Choose the area you care about and register your commitment — financial, volunteer time, or both." },
              { step: "2", title: "Coordinate Together", desc: "Gavhah connects you with others in the same cause, matching helpers with families that need support." },
              { step: "3", title: "Make It Happen", desc: "Act together with your cause group. Track progress, share updates, and see the impact you create." },
            ].map(s => (
              <div key={s.step} className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-secondary text-white font-serif font-bold text-lg flex items-center justify-center mx-auto">
                  {s.step}
                </div>
                <h4 className="font-semibold text-primary">{s.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
