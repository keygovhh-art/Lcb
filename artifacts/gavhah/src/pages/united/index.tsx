import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, Users, HandHeart, Stethoscope, Home, AlertTriangle, Crown, Plus, ChevronRight } from "lucide-react";
import { useListHelpRequests, useCreateHelpRequest, getListHelpRequestsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CAUSES = [
  {
    id: "chassan",
    label: "Chassan / Kallah Support",
    description: "Help newlyweds start their lives with dignity. Furniture, household essentials, and simcha expenses.",
    icon: Crown,
    color: "bg-rose-50 border-rose-200 text-rose-700",
    iconColor: "text-rose-500",
    needType: "wedding",
  },
  {
    id: "almana",
    label: "Almana / Widow Support",
    description: "Standing beside widows with practical help, emotional support, and ongoing assistance.",
    icon: Heart,
    color: "bg-purple-50 border-purple-200 text-purple-700",
    iconColor: "text-purple-500",
    needType: "other",
  },
  {
    id: "yasom",
    label: "Yasom / Orphan Support",
    description: "Ensuring orphaned children have what they need — school support, Yom Tov needs, and more.",
    icon: Users,
    color: "bg-blue-50 border-blue-200 text-blue-700",
    iconColor: "text-blue-500",
    needType: "financial",
  },
  {
    id: "medical",
    label: "Medical / Bikur Cholim",
    description: "Hospital visits, medical transport, meals for patients' families, and crisis support.",
    icon: Stethoscope,
    color: "bg-green-50 border-green-200 text-green-700",
    iconColor: "text-green-500",
    needType: "medical",
  },
  {
    id: "emergency",
    label: "Emergency Assistance",
    description: "Rapid response for urgent situations — fire, flood, sudden loss of income, or family crisis.",
    icon: AlertTriangle,
    color: "bg-orange-50 border-orange-200 text-orange-700",
    iconColor: "text-orange-500",
    needType: "other",
  },
  {
    id: "housing",
    label: "Housing / Parnassa",
    description: "Food assistance, housing support, and help for families struggling with basic needs.",
    icon: Home,
    color: "bg-amber-50 border-amber-200 text-amber-700",
    iconColor: "text-amber-500",
    needType: "housing",
  },
];

function CauseCard({ cause, onSupport, onRequest, count }: {
  cause: typeof CAUSES[0];
  onSupport: () => void;
  onRequest: () => void;
  count: number;
}) {
  const Icon = cause.icon;
  return (
    <div className={`border-2 rounded-2xl p-6 ${cause.color} flex flex-col gap-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0`}>
          <Icon className={`h-6 w-6 ${cause.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-serif font-bold text-lg mb-1">{cause.label}</h3>
          <p className="text-sm opacity-80 leading-relaxed">{cause.description}</p>
        </div>
      </div>
      {count > 0 && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-70">
          <HandHeart className="h-3.5 w-3.5" />
          {count} {count === 1 ? "family" : "families"} currently need support
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1 bg-white/60 border-current gap-1.5 font-medium" onClick={onSupport}>
          <Heart className="h-3.5 w-3.5" /> I Want to Help
        </Button>
        <Button size="sm" variant="outline" className="flex-1 bg-white/60 border-current gap-1.5 font-medium" onClick={onRequest}>
          <ChevronRight className="h-3.5 w-3.5" /> Request Support
        </Button>
      </div>
    </div>
  );
}

function SupportDialog({ cause, mode, open, onClose }: {
  cause: typeof CAUSES[0] | null;
  mode: "support" | "request";
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const createReq = useCreateHelpRequest();
  const [form, setForm] = useState({ name: "", description: "", urgency: "medium", location: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description || !cause) return;
    const description = mode === "support"
      ? `[VOLUNTEER TO HELP] ${form.description}`
      : form.description;
    createReq.mutate(
      { data: { name: form.name, description, needType: cause.needType, urgency: form.urgency, location: form.location || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListHelpRequestsQueryKey({}) });
          onClose();
          setForm({ name: "", description: "", urgency: "medium", location: "" });
          toast({
            title: mode === "support" ? "Thank you for stepping up!" : "Your request has been received",
            description: mode === "support"
              ? "Gavhah will connect you with a family that needs your help."
              : "Our team will be in touch discreetly to coordinate assistance.",
          });
        },
        onError: () => toast({ title: "Error", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  const isSupport = mode === "support";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-primary">
            {isSupport ? `Help with ${cause?.label}` : `Request ${cause?.label} Support`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {!isSupport && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground">
              Your information will be handled with complete discretion by Gavhah staff.
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-semibold">{isSupport ? "Your Name / Nickname" : "Name / Reference"} *</Label>
            <Input value={form.name} onChange={set("name")} placeholder={isSupport ? "How should we address you?" : "First name is fine"} className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={set("location")} placeholder="City or neighborhood" className="h-11" />
          </div>
          {!isSupport && (
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
          )}
          <div className="space-y-1.5">
            <Label className="font-semibold">{isSupport ? "How can you help?" : "What do you need?"} *</Label>
            <Textarea
              value={form.description}
              onChange={set("description")}
              placeholder={isSupport
                ? "Describe your availability, skills, or what you can contribute..."
                : "Describe your situation and what kind of support would help most..."}
              className="resize-none min-h-28"
              required
            />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={createReq.isPending}>
            <Heart className="h-4 w-4" />
            {createReq.isPending ? "Submitting..." : isSupport ? "Submit Offer to Help" : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function United() {
  const [dialogCause, setDialogCause] = useState<typeof CAUSES[0] | null>(null);
  const [dialogMode, setDialogMode] = useState<"support" | "request">("support");

  const { data: allRequests } = useListHelpRequests({}, { query: { queryKey: getListHelpRequestsQueryKey({}) } });

  const getCount = (needType: string) =>
    allRequests?.filter((r: any) => r.needType === needType && r.status === "open" && !r.description?.startsWith("[VOLUNTEER")).length ?? 0;

  const openDialog = (cause: typeof CAUSES[0], mode: "support" | "request") => {
    setDialogCause(cause);
    setDialogMode(mode);
  };

  return (
    <Layout>
      <div className="bg-gradient-to-br from-rose-50 via-amber-50/30 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-3">
            <Heart className="h-8 w-8 text-rose-500 fill-rose-100" />
            <h1 className="font-serif text-4xl font-bold text-primary">United In Kindness</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-2xl">
            Communities uniting around those who need us most. Every family in need has a community ready to help.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="mb-8 text-center max-w-2xl mx-auto">
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">Choose a Cause</h2>
          <p className="text-muted-foreground text-sm">
            Whether you need help or want to give it — find your place in the community's circle of support.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAUSES.map(cause => (
            <CauseCard
              key={cause.id}
              cause={cause}
              count={getCount(cause.needType)}
              onSupport={() => openDialog(cause, "support")}
              onRequest={() => openDialog(cause, "request")}
            />
          ))}
        </div>

        {/* How it works */}
        <div className="mt-16 bg-muted/30 rounded-2xl p-8 border">
          <h3 className="font-serif text-xl font-bold text-primary mb-6 text-center">How United In Kindness Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {[
              { step: "1", title: "Identify the Need", desc: "A family reaches out through Gavhah — confidentially and with dignity." },
              { step: "2", title: "Community Responds", desc: "Volunteers from across the world step up to help in whatever way they can." },
              { step: "3", title: "Gavhah Coordinates", desc: "Our team connects helpers with those in need, protecting everyone's privacy." },
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

        {/* Open requests banner */}
        {allRequests && allRequests.filter((r: any) => r.status === "open" && !r.description?.startsWith("[VOLUNTEER")).length > 0 && (
          <div className="mt-8 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800">
                  {allRequests.filter((r: any) => r.status === "open" && !r.description?.startsWith("[VOLUNTEER")).length} families are currently waiting for help
                </p>
                <p className="text-sm text-amber-700">Every act of chesed matters.</p>
              </div>
            </div>
            <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0" onClick={() => openDialog(CAUSES[3], "support")}>
              <Plus className="h-4 w-4" /> I Want to Help
            </Button>
          </div>
        )}
      </div>

      <SupportDialog
        cause={dialogCause}
        mode={dialogMode}
        open={dialogCause !== null}
        onClose={() => setDialogCause(null)}
      />
    </Layout>
  );
}
