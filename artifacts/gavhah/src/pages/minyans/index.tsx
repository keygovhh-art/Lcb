import { useState } from "react";
import { useListMinyans, useLikeMinyan, getListMinyansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, Heart, MapPin, Clock, Plus } from "lucide-react";
import { useCreateMinyan } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { MemberGate } from "@/components/shared/member-gate";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const COMMUNITIES = ["", "Chassidish", "Yeshivish", "Modern Orthodox", "Sephardic", "Other"];

function AddMinyanDialog({ onSuccess }: { onSuccess: () => void }) {
  const { isAuthenticated, isLoaded } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    synagogueName: "", community: "", city: "", country: "USA",
    address: "", shacharis: "", mincha: "", maariv: "", notes: "",
  });
  const create = useCreateMinyan();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ data: form as any }, {
      onSuccess: () => {
        setOpen(false);
        setForm({
          synagogueName: "", community: "", city: "", country: "USA",
          address: "", shacharis: "", mincha: "", maariv: "", notes: "",
        });
        onSuccess();
        toast({
          title: "Minyan submitted",
          description: "It is pending review and will appear publicly after approval.",
        });
      },
      onError: () => toast({
        title: "Could not submit minyan",
        description: "Please check the required fields and try again.",
        variant: "destructive",
      }),
    });
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate compact action="add a minyan">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Minyan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Add a Minyan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="font-semibold">Synagogue Name *</Label>
                <Input value={form.synagogueName} onChange={set("synagogueName")} placeholder="Beis Medrash..." className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Community</Label>
                <Select value={form.community || "none"} onValueChange={v => setForm(f => ({ ...f, community: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select community...</SelectItem>
                    {COMMUNITIES.filter(Boolean).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Country</Label>
                <Input value={form.country} onChange={set("country")} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">City *</Label>
                <Input value={form.city} onChange={set("city")} placeholder="Brooklyn" className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Address</Label>
                <Input value={form.address} onChange={set("address")} placeholder="123 Main St" className="h-11" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label className="font-semibold">Shacharis Times *</Label>
                <Input value={form.shacharis} onChange={set("shacharis")} placeholder="6:30 AM, 7:00 AM, 8:00 AM" className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Mincha Times *</Label>
                <Input value={form.mincha} onChange={set("mincha")} placeholder="2:00 PM (weekday)" className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Maariv Times *</Label>
                <Input value={form.maariv} onChange={set("maariv")} placeholder="9:00 PM" className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Additional Notes</Label>
                <Textarea value={form.notes} onChange={set("notes")} placeholder="Shabbos minyanim, special shiurim, etc." className="resize-none" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12" disabled={create.isPending}>
              {create.isPending ? "Submitting..." : "Submit for Review"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">Submissions are reviewed before appearing publicly.</p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Minyans() {
  const [city, setCity] = useState("");
  const [community, setCommunity] = useState("");
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const params = { city: city || undefined, community: community === "all" ? undefined : community || undefined };
  const { data: minyans, isLoading } = useListMinyans(params, {
    query: { queryKey: getListMinyansQueryKey(params) },
  });
  const like = useLikeMinyan();

  const refresh = () => qc.invalidateQueries({ queryKey: getListMinyansQueryKey(params) });

  const handleLike = (id: number) => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to like a minyan", description: "Join Gavhah free to support your favourite minyanim." });
      setLocation("/login");
      return;
    }
    like.mutate({ id }, { onSuccess: refresh });
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Minyan Center</h1>
              <p className="text-muted-foreground font-serif italic">
                Find minyan times for synagogues worldwide — contributed by the community.
              </p>
            </div>
            <AddMinyanDialog onSuccess={refresh} />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-11"
              placeholder="Search by city..."
              value={city}
              onChange={e => setCity(e.target.value)}
            />
          </div>
          <Select value={community || "all"} onValueChange={v => setCommunity(v === "all" ? "" : v)}>
            <SelectTrigger className="h-11 w-full sm:w-52">
              <SelectValue placeholder="All communities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All communities</SelectItem>
              {COMMUNITIES.filter(Boolean).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-6 space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {minyans?.map(minyan => (
              <div key={minyan.id} className="bg-card border rounded-xl p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-serif font-bold text-primary text-xl mb-1">{minyan.synagogueName}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {minyan.city}, {minyan.country}
                      </span>
                      {minyan.community && (
                        <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-full text-xs font-medium">
                          {minyan.community}
                        </span>
                      )}
                    </div>
                    {minyan.address && (
                      <p className="text-xs text-muted-foreground mt-1">{minyan.address}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleLike(minyan.id)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-secondary transition-colors shrink-0"
                    disabled={like.isPending}
                  >
                    <Heart className="h-4 w-4" />
                    <span>{minyan.likes}</span>
                  </button>
                </div>

                <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                      <Clock className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">Shacharis: </span>
                      <span className="text-muted-foreground">{minyan.shacharis}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                      <Clock className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">Mincha: </span>
                      <span className="text-muted-foreground">{minyan.mincha}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                      <Clock className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">Maariv: </span>
                      <span className="text-muted-foreground">{minyan.maariv}</span>
                    </div>
                  </div>
                  {minyan.notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2 mt-2 italic">{minyan.notes}</p>
                  )}
                </div>
              </div>
            ))}
            {minyans?.length === 0 && (
              <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground font-serif italic mb-4">No minyanim found for this search.</p>
                <AddMinyanDialog onSuccess={refresh} />
              </div>
            )}
          </div>
        )}

        <div className="text-center py-4 text-sm text-muted-foreground">
          Showing {minyans?.length ?? 0} minyanim · Know a minyan that's missing?{" "}
          <button onClick={() => {}} className="text-secondary hover:underline font-medium">Add it here</button>
        </div>
      </div>
    </Layout>
  );
}
