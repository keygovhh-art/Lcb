import { useState } from "react";
import { useGetTodaysCharity, useListCharities, useDonateToCharity, getGetTodaysCharityQueryKey, getListCharitiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heart, Star, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { MemberGate } from "@/components/shared/member-gate";

function DonateDialog({ charityId, charityName, onSuccess }: { charityId: number; charityName: string; onSuccess: () => void }) {
  const { isAuthenticated, isLoaded } = useAuth();
  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [open, setOpen] = useState(false);
  const donate = useDonateToCharity();

  const presets = [18, 36, 54, 100, 180, 360];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;
    donate.mutate(
      { id: charityId, data: { amount: Number(amount), donorName: donorName || "Anonymous" } },
      {
        onSuccess: () => {
          setOpen(false);
          setAmount("");
          setDonorName("");
          onSuccess();
        },
      }
    );
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate compact action="donate to this campaign">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 h-12 px-8 text-base" onClick={() => setOpen(true)}>
        <Heart className="h-5 w-5" /> Donate Now
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Donate to {charityName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="font-semibold">Select or enter an amount ($)</Label>
              <div className="grid grid-cols-3 gap-2">
                {presets.map(p => (
                  <Button
                    key={p}
                    type="button"
                    variant={amount === String(p) ? "default" : "outline"}
                    className="h-10"
                    onClick={() => setAmount(String(p))}
                  >
                    ${p}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Or enter custom amount..."
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Your name (optional)</Label>
              <Input
                value={donorName}
                onChange={e => setDonorName(e.target.value)}
                placeholder="Anonymous"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 text-base font-semibold"
              disabled={donate.isPending || !amount}
            >
              {donate.isPending ? "Processing..." : `Donate $${amount || "..."}`}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Every donation goes directly to the cause. Tizku l'mitzvos.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Charity() {
  const qc = useQueryClient();
  const { data: today, isLoading: todayLoading } = useGetTodaysCharity({
    query: { queryKey: getGetTodaysCharityQueryKey() },
  });
  const { data: allCharities, isLoading: allLoading } = useListCharities({
    query: { queryKey: getListCharitiesQueryKey() },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetTodaysCharityQueryKey() });
    qc.invalidateQueries({ queryKey: getListCharitiesQueryKey() });
  };

  const pct = (raised: number, goal: number) =>
    goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Star className="h-7 w-7 text-accent fill-accent" />
            <h1 className="font-serif text-4xl font-bold text-primary">Today's Charity</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-10">
            Support verified campaigns and help our community thrive — one act of tzedakah at a time.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 space-y-16">
        {/* Featured Today */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <span className="bg-accent/20 text-accent-foreground text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full border border-accent/30">
              Featured Today
            </span>
          </div>
          {todayLoading ? (
            <div className="bg-card border rounded-2xl p-8 space-y-4">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : today ? (
            <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-br from-primary to-secondary h-3" />
              <div className="p-8">
                <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                  <div className="flex-1 space-y-4">
                    <h2 className="font-serif text-3xl font-bold text-primary">{today.name}</h2>
                    <p className="text-foreground leading-relaxed text-lg">{today.description}</p>
                    {today.successStories && (
                      <blockquote className="border-l-4 border-accent pl-6 font-serif italic text-muted-foreground">
                        {today.successStories}
                      </blockquote>
                    )}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-secondary">${Number(today.raisedAmount).toLocaleString()} raised</span>
                        <span className="text-muted-foreground">Goal: ${Number(today.goalAmount).toLocaleString()}</span>
                      </div>
                      <Progress value={pct(Number(today.raisedAmount), Number(today.goalAmount))} className="h-3" />
                      <p className="text-xs text-muted-foreground">
                        {pct(Number(today.raisedAmount), Number(today.goalAmount))}% of goal reached
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4 lg:min-w-48">
                    <DonateDialog charityId={today.id} charityName={today.name} onSuccess={refresh} />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Many donors this month</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border rounded-2xl bg-muted/20 text-muted-foreground font-serif italic">
              No featured charity today.
            </div>
          )}
        </section>

        {/* All Charities */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">All Campaigns</h2>
          </div>
          {allLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card border rounded-xl p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allCharities?.map(charity => (
                <div key={charity.id} className="bg-card border rounded-xl p-6 flex flex-col gap-4 hover:shadow-md transition-shadow">
                  <div>
                    <h3 className="font-serif font-bold text-primary text-lg mb-2">{charity.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{charity.description}</p>
                  </div>
                  <div className="mt-auto space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-secondary">${Number(charity.raisedAmount).toLocaleString()} raised</span>
                      <span className="text-muted-foreground">of ${Number(charity.goalAmount).toLocaleString()}</span>
                    </div>
                    <Progress value={pct(Number(charity.raisedAmount), Number(charity.goalAmount))} className="h-2" />
                    <DonateDialog charityId={charity.id} charityName={charity.name} onSuccess={refresh} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
