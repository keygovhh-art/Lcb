import { useGetCommunityStats, useGetRecentActivity, useGetActivityStats, getGetCommunityStatsQueryKey, getGetRecentActivityQueryKey, getGetActivityStatsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Users, MessageSquare, HandHeart, Heart, Globe, BarChart3, Activity, Clock, Newspaper, FolderKanban, Star } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAuth } from "@/context/auth-context";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  volunteer: <Users className="h-4 w-4 text-secondary" />,
  help_request: <HandHeart className="h-4 w-4 text-destructive" />,
  discussion: <MessageSquare className="h-4 w-4 text-primary" />,
  group: <Globe className="h-4 w-4 text-accent" />,
  donation: <Heart className="h-4 w-4 text-secondary" />,
  minyan: <Clock className="h-4 w-4 text-muted-foreground" />,
  announcement: <Activity className="h-4 w-4 text-primary" />,
  news: <Newspaper className="h-4 w-4 text-primary" />,
  project: <FolderKanban className="h-4 w-4 text-secondary" />,
  cause: <Star className="h-4 w-4 text-accent" />,
};

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetCommunityStats({
    query: { queryKey: getGetCommunityStatsQueryKey() },
  });
  const { data: activity, isLoading: actLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });
  const { data: chartData } = useGetActivityStats({}, {
    query: { queryKey: getGetActivityStatsQueryKey({}) },
  });

  const statCards = [
    { label: "Total Members", value: stats?.totalMembers ?? 0, icon: <Users className="h-6 w-6" />, link: "/directory", color: "text-primary bg-primary/10" },
    { label: "Active Discussions", value: stats?.totalDiscussions ?? 0, icon: <MessageSquare className="h-6 w-6" />, link: "/forum", color: "text-secondary bg-secondary/10" },
    { label: "Active Volunteers", value: stats?.activeVolunteers ?? 0, icon: <HandHeart className="h-6 w-6" />, link: "/directory", color: "text-accent bg-accent/10" },
    { label: "Community Groups", value: stats?.activeGroups ?? 0, icon: <Globe className="h-6 w-6" />, link: "/groups", color: "text-primary bg-primary/10" },
    { label: "People Helped", value: stats?.totalPeopleHelped ?? 0, icon: <Heart className="h-6 w-6" />, link: "/directory", color: "text-secondary bg-secondary/10" },
    { label: "Recorded Donations", value: `$${Number(stats?.donationsRaised ?? 0).toLocaleString()}`, icon: <Activity className="h-6 w-6" />, link: "/charity", color: "text-accent bg-accent/10" },
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
              ? [...Array(6)].map((_, i) => (
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
              { label: "Activists Directory", href: "/directory", icon: <HandHeart className="h-5 w-5" /> },
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

        {/* Recent Activity */}
        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-6">Recent Activity</h2>
          <div className="bg-card border rounded-xl divide-y">
            {actLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))
            ) : (
              activity?.map((item: any) => (
                <div key={item.id} className="flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {ACTIVITY_ICONS[item.type] ?? <Activity className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.actorName} · {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
            {!actLoading && (!activity || activity.length === 0) && (
              <div className="text-center py-12 text-muted-foreground font-serif italic">
                No recent activity.
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
