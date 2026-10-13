import { useGetTodaysCharity, useListCharities, getGetTodaysCharityQueryKey, getListCharitiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/context/language-context";
import { Heart, Star, TrendingUp, Users } from "lucide-react";
import { CampaignDonationActions } from "@/components/shared/campaign-donation-actions";

export default function Charity() {
  const qc = useQueryClient();
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { data: today, isLoading: todayLoading } = useGetTodaysCharity({
    query: { queryKey: getGetTodaysCharityQueryKey(), refetchInterval: 60_000 },
  });
  const { data: allCharities, isLoading: allLoading } = useListCharities({
    query: { queryKey: getListCharitiesQueryKey(), refetchInterval: 60_000 },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getGetTodaysCharityQueryKey() });
    void qc.invalidateQueries({ queryKey: getListCharitiesQueryKey() });
  };
  const pct = (raised: number, goal: number) =>
    goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Star className="h-7 w-7 text-accent fill-accent" />
            <h1 className="font-serif text-4xl font-bold text-primary">{yi ? "היינטיגע צדקה" : "Today's Charity"}</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-10">
            {yi ? "שטיצט די קאמפיינס וואס זענען באשטעטיגט געווארן דורך די מערכת." :
              "Support verified campaigns and help our community thrive — one act of tzedakah at a time."}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 space-y-16" dir={yi ? "rtl" : "ltr"}>
        <section>
          <div className="mb-6">
            <span className="bg-accent/20 text-accent-foreground text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full border border-accent/30">
              {yi ? "היינט אין צענטער" : "Featured Today"}
            </span>
          </div>
          {todayLoading ? (
            <div className="bg-card border rounded-2xl p-8 space-y-4">
              <Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
            </div>
          ) : today ? (
            <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-br from-primary to-secondary h-3" />
              {today.imageUrl && <img src={today.imageUrl} alt={today.name} className="w-full max-h-72 object-cover" />}
              <div className="p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                  <div className="flex-1 space-y-4 min-w-0">
                    <h2 className="font-serif text-3xl font-bold text-primary">{today.name}</h2>
                    <p className="text-foreground leading-relaxed text-lg whitespace-pre-wrap">{today.description}</p>
                    {today.successStories && (
                      <blockquote className="border-s-4 border-accent ps-6 font-serif italic text-muted-foreground">
                        {today.successStories}
                      </blockquote>
                    )}
                    <div className="space-y-2 pt-2">
                      <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                        <span className="text-secondary">${Number(today.raisedAmount).toLocaleString()} {yi ? "אריינגעקומען" : "raised"}</span>
                        <span className="text-muted-foreground">{yi ? "ציל" : "Goal"}: ${Number(today.goalAmount).toLocaleString()}</span>
                      </div>
                      <Progress value={pct(Number(today.raisedAmount), Number(today.goalAmount))} className="h-3" />
                      <p className="text-xs text-muted-foreground">{pct(Number(today.raisedAmount), Number(today.goalAmount))}% {yi ? "פונעם ציל" : "of goal reached"}</p>
                    </div>
                  </div>
                  <div className="w-full lg:w-64 shrink-0">
                    <CampaignDonationActions campaign={today} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border rounded-2xl bg-muted/20 text-muted-foreground">
              {yi ? "דערווייל איז נישט אויסגעקליבן א היינטיגער קאמפיין." : "No featured charity today."}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">{yi ? "אלע קאמפיינס" : "All Campaigns"}</h2>
          </div>
          {allLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[0,1,2].map(i => <div key={i} className="bg-card border rounded-xl p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" />
              </div>)}
            </div>
          ) : !allCharities?.length ? (
            <p className="rounded-xl border p-8 text-center text-muted-foreground">{yi ? "נאך נישטא קיין לייוו קאמפיינס." : "No published campaigns yet."}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allCharities.map(charity => (
                <div key={charity.id} className="bg-card border rounded-xl flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                  {charity.imageUrl && <img src={charity.imageUrl} alt={charity.name} className="w-full h-44 object-cover" />}
                  <div className="p-6 flex flex-col gap-4 flex-1">
                    <div>
                      <h3 className="font-serif font-bold text-primary text-lg mb-2">{charity.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap leading-relaxed">{charity.description}</p>
                    </div>
                    <div className="mt-auto space-y-3">
                      <div className="flex flex-wrap justify-between gap-1 text-xs font-semibold">
                        <span className="text-secondary">${Number(charity.raisedAmount).toLocaleString()} {yi ? "אריינגעקומען" : "raised"}</span>
                        <span className="text-muted-foreground">{yi ? "פון" : "of"} ${Number(charity.goalAmount).toLocaleString()}</span>
                      </div>
                      <Progress value={pct(Number(charity.raisedAmount), Number(charity.goalAmount))} className="h-2" />
                      <CampaignDonationActions campaign={charity} compact />
                    </div>
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
