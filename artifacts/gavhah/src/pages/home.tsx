import { Link, useLocation } from "wouter";
import { useGetCommunityStats, useGetTodaysCharity, getGetCommunityStatsQueryKey, getGetTodaysCharityQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Users, MessageSquare, Globe, Clock, HandHeart, ArrowRight, Star } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetCommunityStats({
    query: { queryKey: getGetCommunityStatsQueryKey() },
  });
  const { data: todayCharity } = useGetTodaysCharity({
    query: { queryKey: getGetTodaysCharityQueryKey() },
  });

  const pct = (raised: number, goal: number) =>
    goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  const DEPARTMENTS = [
    { label: "Global Chesed News", desc: "Inspiring stories from our community", href: "/news", icon: <Globe className="h-6 w-6" />, color: "from-primary/10 to-primary/5" },
    { label: "Askanim Forum", desc: "Discuss and get advice from activists", href: "/forum", icon: <MessageSquare className="h-6 w-6" />, color: "from-secondary/10 to-secondary/5" },
    { label: "Activists Directory", desc: "Find volunteers and request help", href: "/directory", icon: <HandHeart className="h-6 w-6" />, color: "from-accent/20 to-accent/5" },
    { label: "Today's Charity", desc: "Support today's featured cause", href: "/charity", icon: <Heart className="h-6 w-6" />, color: "from-secondary/10 to-secondary/5" },
    { label: "Minyan Center", desc: "Worldwide minyan times directory", href: "/minyans", icon: <Clock className="h-6 w-6" />, color: "from-primary/10 to-primary/5" },
    { label: "Group Center", desc: "Join community organizations", href: "/groups", icon: <Users className="h-6 w-6" />, color: "from-accent/20 to-accent/5" },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent via-transparent to-transparent" />
        <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center">
          <p className="text-accent font-serif italic text-lg mb-4 tracking-wide">עולם חסד יבנה</p>
          <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 max-w-4xl leading-tight">
            Olam Chesed Yibaneh
          </h1>
          <p className="text-xl md:text-2xl text-primary-foreground/80 max-w-2xl mb-12 font-serif italic">
            The world is built through kindness. Connect, volunteer, and support our global community.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/directory">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-primary font-bold text-lg px-8 h-14 w-full sm:w-auto gap-2">
                <HandHeart className="h-5 w-5" /> I Want To Help
              </Button>
            </Link>
            <Link href="/directory?tab=requests">
              <Button size="lg" variant="outline" className="text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10 text-lg px-8 h-14 bg-transparent w-full sm:w-auto gap-2">
                <Heart className="h-5 w-5" /> I Need Help
              </Button>
            </Link>
            <Link href="/charity">
              <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-white font-bold text-lg px-8 h-14 w-full sm:w-auto gap-2">
                <Star className="h-5 w-5" /> Today's Charity
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {statsLoading
              ? [...Array(4)].map((_, i) => (
                  <div key={i} className="text-center p-6 bg-card border rounded-xl space-y-2">
                    <Skeleton className="h-10 w-1/2 mx-auto" />
                    <Skeleton className="h-4 w-2/3 mx-auto" />
                  </div>
                ))
              : [
                  { label: "People Helped", value: stats ? `${stats.totalPeopleHelped}+` : "..." },
                  { label: "Active Volunteers", value: stats ? stats.activeVolunteers.toLocaleString() : "..." },
                  { label: "Community Groups", value: stats ? stats.activeGroups.toLocaleString() : "..." },
                  { label: "Donations Raised", value: stats ? `$${Number(stats.donationsRaised).toLocaleString()}` : "..." },
                ].map((stat, i) => (
                  <div key={i} className="text-center p-6 bg-card border rounded-xl shadow-sm">
                    <div className="text-4xl font-serif font-bold text-secondary mb-2">{stat.value}</div>
                    <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* Today's Charity Spotlight */}
      {todayCharity && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-6">
              <Star className="h-5 w-5 text-accent fill-accent" />
              <h2 className="font-serif text-2xl font-bold text-primary">Today's Featured Charity</h2>
            </div>
            <div className="bg-card border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start shadow-sm">
              <div className="flex-1 space-y-3">
                <h3 className="font-serif text-2xl font-bold text-primary">{todayCharity.name}</h3>
                <p className="text-muted-foreground leading-relaxed">{todayCharity.description}</p>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-secondary">${Number(todayCharity.raisedAmount).toLocaleString()} raised</span>
                    <span className="text-muted-foreground">Goal: ${Number(todayCharity.goalAmount).toLocaleString()}</span>
                  </div>
                  <Progress value={pct(Number(todayCharity.raisedAmount), Number(todayCharity.goalAmount))} className="h-2.5" />
                </div>
              </div>
              <Link href="/charity">
                <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 h-12 px-8 shrink-0">
                  <Heart className="h-5 w-5" /> Donate Now
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Departments */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold text-primary mb-3">Our Departments</h2>
            <div className="w-16 h-1 bg-accent mx-auto" />
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Six centers of community life, all in one place.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEPARTMENTS.map((dept, i) => (
              <Link key={i} href={dept.href}>
                <div className={`bg-gradient-to-br ${dept.color} border rounded-2xl p-6 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group h-full flex flex-col`}>
                  <div className="w-12 h-12 rounded-xl bg-card border flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                    {dept.icon}
                  </div>
                  <h3 className="font-serif font-bold text-primary text-lg mb-2">{dept.label}</h3>
                  <p className="text-muted-foreground text-sm flex-1">{dept.desc}</p>
                  <div className="flex items-center gap-1 text-accent font-semibold text-sm mt-4 group-hover:gap-2 transition-all">
                    Explore <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold mb-4">Be Part of the Kehilla</h2>
          <p className="text-primary-foreground/70 text-lg max-w-xl mx-auto mb-8 font-serif italic">
            Every act of chesed strengthens our community. Join thousands of volunteers making a difference every day.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-primary font-bold h-13 px-10 text-lg gap-2">
                <Users className="h-5 w-5" /> Join Today — It's Free
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent h-13 px-10 text-lg gap-2">
                <Globe className="h-5 w-5" /> View Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
