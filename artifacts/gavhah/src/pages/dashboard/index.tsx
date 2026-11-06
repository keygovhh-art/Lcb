import { useGetCommunityStats, useGetActivityStats, getGetCommunityStatsQueryKey, getGetActivityStatsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Users, MessageSquare, HandHeart, Heart, Globe, BarChart3, Activity, Clock, Newspaper, FolderKanban, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAuth } from "@/context/auth-context";

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetCommunityStats({
    query: { queryKey: getGetCommunityStatsQueryKey() },
  });
  const { data: chartData } = useGetActivityStats({}, {
    query: { queryKey: getGetActivityStatsQueryKey({}) },
  });

  const statCards = [
    { label: "Total Members", value: stats?.totalMembers ?? 0, icon: <Users className="h-6 w-6" />, link: "/directory", color: "text-primary bg-primary/10" },
    { label: "Active Discussions", value: stats?.totalDiscussions ?? 0, icon: <MessageSquare className="h-6 w-6" />, link: "/forum", color: "text-secondary bg-secondary/10" },
    { label: "Community Groups", value: stats?.activeGroups ?? 0, icon: <Globe className="h-6 w-6" />, link: "/groups", color: "text-primary bg-primary/10" },
    { label: "Public News Updates", value: (stats as {totalNewsArticles?: number} | undefined)?.totalNewsArticles ?? 0, icon: <Newspaper className="h-6 w-6" />, link: "/news", color: "text-accent bg-accent/10" },
    { label: "Member-Recorded Donations", value: "$" + Number((stats as {memberRecordedDonations?:number}|undefined)?.memberRecordedDonations ?? 0).toLocaleString(), icon: <Heart className="h-6 w-6" />, link: "/my", color: "text-accent bg-accent/10" },
  ];

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">Community Dashboard</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11">
            A live overview of our global community's acts of chesed.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 space-y-12">
        {/* Stats Grid */}
        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-6">Platform Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {statsLoading
              ? [...Array(5)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))
              : statCards.map((s, i) => (
                  <Link key={i} href={s.link}>
                    <div className="bg-card border rounded-xl p-5 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${s.color}`}>
                        {s.icon}
                      </div>
                      <div className="text-3xl font-serif font-bold text-primary mb-1">{s.value}</div>
                      <div className="text-sm text-muted-foreground">{s.label}</div>
                    </div>
                  </Link>
                ))}
          </div>
        </section>

        {/* Activity Chart */}
        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-6">Weekly Activity</h2>
          <div className="bg-card border rounded-xl p-6">
            {chartData ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData as any[]}>
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  />
                  <Legend />
                  <Bar dataKey="discussions" name="Discussions" fill="hsl(214,70%,13%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="helpRequests" name="Help Requests" fill="hsl(345,57%,26%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="volunteers" name="Volunteers" fill="hsl(38,45%,55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="donations" name="Recorded Donations" fill="hsl(214,20%,40%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            )}
          </div>
        </section>

        {/* Department Links */}
        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-6">All Departments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[
              { label: "Global Chesed News", href: "/news", icon: <Activity className="h-5 w-5" /> },
              { label: "Askanim Forum", href: "/forum", icon: <MessageSquare className="h-5 w-5" /> },
              { label: "Private Assistance", href: "/directory", icon: <HandHeart className="h-5 w-5" /> },
              { label: "Today's Charity", href: "/charity", icon: <Heart className="h-5 w-5" /> },
              { label: "Minyan Center", href: "/minyans", icon: <Clock className="h-5 w-5" /> },
              { label: "Group Center", href: "/groups", icon: <Globe className="h-5 w-5" /> },
              { label: "My Gavhah", href: "/my", icon: <Users className="h-5 w-5" /> },
              ...(isAdmin ? [{ label: "Administration", href: "/founder", icon: <BarChart3 className="h-5 w-5" /> }] : []),
            ].map((dept, i) => (
              <Link key={i} href={dept.href}>
                <div className="bg-card border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer flex flex-col items-center text-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {dept.icon}
                  </div>
                  <span className="text-sm font-semibold text-foreground leading-tight">{dept.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>


      </div>
    </Layout>
  );
}
