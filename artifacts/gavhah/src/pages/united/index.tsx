import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Heart, Users, MapPin, Clock, DollarSign, CheckCircle,
  UserPlus, Share2, ChevronDown, ChevronUp, SendHorizonal, Star
} from "lucide-react";
import {
  useGetActiveFeaturedCause,
  useJoinFeaturedCause,
  useListFeaturedCauseSupporters,
  useSubmitCause,
  getGetActiveFeaturedCauseQueryKey,
  getListFeaturedCauseSupportersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const PLEDGE_LABELS: Record<string, string> = {
  financial: "Financial Support",
  volunteer: "Volunteer Time",
  both: "Financial + Volunteer",
  items: "Goods / Items",
  coordination: "Coordination Help",
};

// ---- Join Cause Dialog ----
function JoinCauseDialog({ causeId, open, onClose }: { causeId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const joinCause = useJoinFeaturedCause();
  const [form, setForm] = useState({ name: "", pledgeType: "volunteer", pledgeAmount: "", message: "", location: "" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    joinCause.mutate(
      {
        id: causeId,
        data: {
          name: form.name,
          pledgeType: form.pledgeType,
          pledgeAmount: form.pledgeAmount ? Number(form.pledgeAmount) : undefined,
          message: form.message || undefined,
          location: form.location || undefined,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetActiveFeaturedCauseQueryKey() });
          qc.invalidateQueries({ queryKey: getListFeaturedCauseSupportersQueryKey(causeId) });
          onClose();
          setForm({ name: "", pledgeType: "volunteer", pledgeAmount: "", message: "", location: "" });
          toast({ title: "Thank you for joining this cause", description: "Your commitment has been recorded. Gavhah will be in touch to coordinate." });
        },
        onError: () => toast({ title: "Error", description: "Could not register. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">Join This Cause</DialogTitle>
          <p className="text-sm text-muted-foreground">Register your commitment. Gavhah will coordinate with you directly.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="font-semibold">Your Name *</Label>
            <Input value={form.name} onChange={s("name")} placeholder="First name or nickname" className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={s("location")} placeholder="City or neighborhood" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">How Will You Help?</Label>
            <Select value={form.pledgeType} onValueChange={s("pledgeType")}>
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
              <Label className="font-semibold">Pledge Amount ($) <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input type="number" min="0" value={form.pledgeAmount} onChange={s("pledgeAmount")} placeholder="0" className="h-11" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-semibold">Message <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea value={form.message} onChange={s("message")} placeholder="Words of support or what you can offer..." className="resize-none min-h-20" />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={joinCause.isPending}>
            <Heart className="h-4 w-4 fill-current" />
            {joinCause.isPending ? "Registering..." : "Join This Cause"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Submit Future Cause Dialog ----
function SubmitCauseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const submitCause = useSubmitCause();
  const [form, setForm] = useState({ title: "", description: "", submittedBy: "", location: "", urgency: "normal" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.submittedBy) return;
    submitCause.mutate(
      { data: { title: form.title, description: form.description, submittedBy: form.submittedBy, location: form.location || undefined, urgency: form.urgency } },
      {
        onSuccess: () => {
          onClose();
          setForm({ title: "", description: "", submittedBy: "", location: "", urgency: "normal" });
          toast({ title: "Cause submitted for review", description: "The Gavhah committee will review your submission and be in touch." });
        },
        onError: () => toast({ title: "Error", description: "Could not submit. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">Submit a Future Cause</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Know of a need that the entire community should rally around? Submit it for consideration as a future featured cause.
            The Gavhah committee reviews all submissions and selects causes based on urgency and community impact.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="font-semibold">Cause Title *</Label>
            <Input value={form.title} onChange={s("title")} placeholder="Brief, clear name for the cause" className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Your Name *</Label>
            <Input value={form.submittedBy} onChange={s("submittedBy")} placeholder="Who is submitting this?" className="h-11" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-semibold">Location</Label>
              <Input value={form.location} onChange={s("location")} placeholder="City / community" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Urgency</Label>
              <Select value={form.urgency} onValueChange={s("urgency")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Description *</Label>
            <Textarea value={form.description} onChange={s("description")} placeholder="Describe the need, the community affected, and why this cause deserves featured status..." className="resize-none min-h-28" required />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={submitCause.isPending}>
            <SendHorizonal className="h-4 w-4" />
            {submitCause.isPending ? "Submitting..." : "Submit for Review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Supporter row ----
function SupporterRow({ supporter }: { supporter: any }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
        <CheckCircle className="h-4 w-4 text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{supporter.name}</span>
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            {PLEDGE_LABELS[supporter.pledgeType] ?? supporter.pledgeType}
            {supporter.pledgeAmount && ` · $${Number(supporter.pledgeAmount).toLocaleString()}`}
          </span>
          {supporter.location && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {supporter.location}
            </span>
          )}
        </div>
        {supporter.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{supporter.message}"</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {format(new Date(supporter.createdAt), "MMM d")}
      </span>
    </div>
  );
}

// ---- Main Page ----
export default function United() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [showAllSupporters, setShowAllSupporters] = useState(false);

  const { data: cause, isLoading } = useGetActiveFeaturedCause({
    query: { queryKey: getGetActiveFeaturedCauseQueryKey() },
  });

  const causeId = cause?.id ?? 0;
  const { data: supporters } = useListFeaturedCauseSupporters(
    causeId,
    { query: { queryKey: getListFeaturedCauseSupportersQueryKey(causeId), enabled: !!causeId } }
  );

  const goal = Number(cause?.goalAmount ?? 0);
  const raised = Number(cause?.amountRaised ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - raised);

  const displayedSupporters = showAllSupporters ? (supporters ?? []) : (supporters ?? []).slice(0, 6);

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-br from-rose-50 via-amber-50/40 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="h-8 w-8 text-rose-500 fill-rose-100" />
            <h1 className="font-serif text-4xl font-bold text-primary">United In Kindness</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-2xl">
            The entire Gavhah community uniting around one cause at a time — focused, powerful, and effective.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-6 w-full rounded-full" />
            <div className="flex gap-4">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 flex-1" />
            </div>
          </div>
        ) : !cause ? (
          <div className="text-center py-20 space-y-4">
            <Star className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <h2 className="font-serif text-2xl font-bold text-primary">No Active Cause Right Now</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              The Gavhah committee selects one community cause at a time. Submit a cause for consideration below.
            </p>
            <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 mt-4" onClick={() => setSubmitOpen(true)}>
              <SendHorizonal className="h-4 w-4" /> Submit a Cause for Review
            </Button>
          </div>
        ) : (
          <div className="space-y-10">

            {/* Featured cause card */}
            <div className="bg-card border-2 border-secondary/20 rounded-2xl overflow-hidden shadow-sm">
              {/* Top banner */}
              <div className="bg-gradient-to-r from-secondary to-primary px-8 py-4 flex items-center gap-3">
                <Star className="h-5 w-5 text-white/80 fill-white/40" />
                <span className="text-white font-semibold text-sm uppercase tracking-wider">Community Featured Cause</span>
              </div>

              <div className="p-8 space-y-6">
                {/* Title + organizer */}
                <div>
                  <h2 className="font-serif text-3xl font-bold text-primary mb-2">{cause.title}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {cause.organizerName && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" /> {cause.organizerName}
                      </span>
                    )}
                    {cause.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> {cause.location}
                      </span>
                    )}
                    {cause.deadline && (
                      <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                        <Clock className="h-4 w-4" /> Deadline: {cause.deadline}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-foreground leading-relaxed text-base">{cause.description}</p>

                {/* Progress */}
                <div className="bg-muted/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Funds Raised</p>
                      <p className="font-serif text-3xl font-bold text-secondary">${raised.toLocaleString()}</p>
                      {goal > 0 && (
                        <p className="text-sm text-muted-foreground">of ${goal.toLocaleString()} goal</p>
                      )}
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supporters</p>
                      <p className="font-serif text-3xl font-bold text-primary">{cause.supporterCount.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">people joined</p>
                    </div>
                    {goal > 0 && remaining > 0 && (
                      <div className="space-y-1 text-right">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Still Needed</p>
                        <p className="font-serif text-3xl font-bold text-amber-600">${remaining.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{pct}% reached</p>
                      </div>
                    )}
                  </div>

                  {goal > 0 && (
                    <div className="space-y-1.5">
                      <Progress value={pct} className="h-3" />
                      <p className="text-right text-xs text-muted-foreground">{pct}% of goal</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1 bg-secondary hover:bg-secondary/90 text-white h-13 text-base font-semibold gap-2 py-3"
                    onClick={() => setJoinOpen(true)}
                  >
                    <Heart className="h-5 w-5 fill-current" /> Join This Cause
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-13 text-base font-semibold gap-2 py-3 border-primary/30 hover:border-primary/50"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: cause.title, text: cause.description, url: window.location.href });
                      } else {
                        navigator.clipboard?.writeText(window.location.href);
                        // toast would be nice but no context here
                      }
                    }}
                  >
                    <Share2 className="h-5 w-5" /> Share This Cause
                  </Button>
                </div>

                {/* Financial stat strip */}
                {goal > 0 && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                    {[
                      { icon: DollarSign, label: "Raised", value: `$${raised.toLocaleString()}`, color: "text-secondary" },
                      { icon: DollarSign, label: "Goal", value: `$${goal.toLocaleString()}`, color: "text-primary" },
                      { icon: DollarSign, label: "Needed", value: `$${remaining.toLocaleString()}`, color: "text-amber-600" },
                    ].map(stat => (
                      <div key={stat.label} className="text-center space-y-0.5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                        <p className={`font-serif font-bold text-lg ${stat.color}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Supporters section */}
            {(supporters ?? []).length > 0 && (
              <div className="bg-card border rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-bold text-primary">
                    Community Supporters
                    <span className="ml-2 text-base font-normal text-muted-foreground">({(supporters ?? []).length})</span>
                  </h3>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setJoinOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Join Them
                  </Button>
                </div>

                <div className="divide-y">
                  {displayedSupporters.map((s: any) => (
                    <SupporterRow key={s.id} supporter={s} />
                  ))}
                </div>

                {(supporters ?? []).length > 6 && (
                  <button
                    className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-secondary/80 transition-colors"
                    onClick={() => setShowAllSupporters(v => !v)}
                  >
                    {showAllSupporters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {showAllSupporters ? "Show fewer" : `See all ${(supporters ?? []).length} supporters`}
                  </button>
                )}
              </div>
            )}

            {/* Submit future cause */}
            <div className="border border-dashed border-primary/20 rounded-2xl p-8 text-center space-y-4 bg-muted/10">
              <h3 className="font-serif text-xl font-bold text-primary">Know a Cause That Deserves This Spotlight?</h3>
              <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
                The Gavhah committee selects one cause at a time based on urgency and community impact.
                Submit a cause and we will review it for future consideration.
              </p>
              <Button
                variant="outline"
                className="gap-2 border-secondary/30 text-secondary hover:bg-secondary/5"
                onClick={() => setSubmitOpen(true)}
              >
                <SendHorizonal className="h-4 w-4" /> Submit a Future Cause
              </Button>
            </div>

          </div>
        )}
      </div>

      <JoinCauseDialog causeId={causeId} open={joinOpen} onClose={() => setJoinOpen(false)} />
      <SubmitCauseDialog open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </Layout>
  );
}
