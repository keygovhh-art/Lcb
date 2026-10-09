import { Link } from "wouter";
import { useGetCommunityStats, useGetTodaysCharity, getGetCommunityStatsQueryKey, getGetTodaysCharityQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PinnedAnnouncementBar } from "@/components/shared/pinned-announcement-bar";
import {
  Heart, Users, MessageSquare, Globe, Clock, HandHeart, ArrowRight, Star,
  Network, Radio, CalendarDays, Shield, BarChart3
} from "lucide-react";

const DEPARTMENTS = [
  {
    label: "Chesed News Center",
    desc: "Inspiring kindness stories from our global community",
    href: "/news",
    icon: <Globe className="h-7 w-7" />,
    color: "from-primary/10 to-primary/5 border-primary/15",
    iconColor: "bg-primary/10 text-primary",
  },
  {
    label: "Askanim Discussion Center",
    desc: "Discuss, advise, and collaborate with activists",
    href: "/forum",
    icon: <MessageSquare className="h-7 w-7" />,
    color: "from-secondary/10 to-secondary/5 border-secondary/15",
    iconColor: "bg-secondary/10 text-secondary",
  },
  {
    label: "Activists Directory",
    desc: "Find volunteers and submit help requests",
    href: "/directory",
    icon: <HandHeart className="h-7 w-7" />,
    color: "from-accent/15 to-accent/5 border-accent/20",
    iconColor: "bg-accent/20 text-accent-foreground",
  },
  {
    label: "United In Kindness",
    desc: "Professional networking for chesed leaders",
    href: "/united",
    icon: <Network className="h-7 w-7" />,
    color: "from-primary/8 to-transparent border-primary/10",
    iconColor: "bg-primary/10 text-primary",
  },
  {
    label: "Olam Hachesed Communications",
    desc: "Unified phone, SMS, and broadcast system",
    href: "/communications",
    icon: <Radio className="h-7 w-7" />,
    color: "from-secondary/8 to-transparent border-secondary/10",
    iconColor: "bg-secondary/10 text-secondary",
  },
  {
    label: "Today's Cause",
    desc: "Daily featured charity — support today's campaign",
    href: "/charity",
    icon: <Heart className="h-7 w-7" />,
    color: "from-destructive/8 to-transparent border-destructive/10",
    iconColor: "bg-destructive/10 text-destructive",
  },
  {
    label: "Minyan Directory",
    desc: "Worldwide minyan times contributed by the community",
    href: "/minyans",
    icon: <Clock className="h-7 w-7" />,
    color: "from-primary/8 to-transparent border-primary/10",
    iconColor: "bg-primary/10 text-primary",
  },
  {
    label: "Group Center",
    desc: "Join public, private, and local community groups",
    href: "/groups",
    icon: <Users className="h-7 w-7" />,
    color: "from-secondary/8 to-transparent border-secondary/10",
    iconColor: "bg-secondary/10 text-secondary",
  },
  {
    label: "My Askanus",
    desc: "Personal case management and activism tracking",
    href: "/my",
    icon: <Star className="h-7 w-7" />,
    color: "from-accent/15 to-accent/5 border-accent/20",
    iconColor: "bg-accent/20 text-accent-foreground",
    featured: true,
  },
  {
    label: "Office Reservations",
    desc: "Book time with the Gavhah team",
    href: "/reservations",
    icon: <CalendarDays className="h-7 w-7" />,
    color: "from-primary/8 to-transparent border-primary/10",
    iconColor: "bg-primary/10 text-primary",
  },
  {
    label: "System Center",
    desc: "Support, moderation, FAQ, and platform settings",
    href: "/system",
    icon: <Shield className="h-7 w-7" />,
    color: "from-secondary/8 to-transparent border-secondary/10",
    iconColor: "bg-secondary/10 text-secondary",
  },
  {
    label: "Koach Harabim",
    desc: "Live community impact dashboard and analytics",
    href: "/dashboard",
    icon: <BarChart3 className="h-7 w-7" />,
    color: "from-primary/10 to-primary/5 border-primary/15",
    iconColor: "bg-primary/10 text-primary",
  },
];

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetCommunityStats({ query: { queryKey: getGetCommunityStatsQueryKey() } });
  const { data: todayCharity } = useGetTodaysCharity({ query: { queryKey: getGetTodaysCharityQueryKey() } });

  const pct = (raised: number, goal: number) => goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(200,160,80,0.3),transparent)]" />
        <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center">
          <div className="mb-4">
            <p className="text-accent font-serif text-lg mb-1 tracking-widest opacity-80" dir="rtl">עולם חסד יבנה</p>
            <p className="text-primary-foreground/50 text-xs tracking-widest uppercase">A Thousand Steps For Yourself · Ten Thousand Steps For Another</p>
          </div>
          <h1 className="font-serif text-6xl md:text-8xl font-bold mb-4 tracking-tight">
            GAVHAH
          </h1>
          <p className="text-2xl md:text-3xl text-accent font-serif italic mb-3">
            Raising Kindness Worldwide
          </p>
          <p className="text-base text-primary-foreground/70 max-w-2xl mb-10">
            The global platform for Orthodox Jewish community activists — connect, organize, volunteer, and build a world of chesed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link href="/directory">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-primary font-bold px-8 h-13 w-full sm:w-auto gap-2">
                <HandHeart className="h-5 w-5" /> I Want To Help
              </Button>
            </Link>
            <Link href="/directory">
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent px-8 h-13 w-full sm:w-auto gap-2">
                <Heart className="h-5 w-5" /> I Need Help
              </Button>
            </Link>
            <Link href="/my">
              <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-white font-bold px-8 h-13 w-full sm:w-auto gap-2">
                <Star className="h-5 w-5" /> My Askanus
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="py-12 bg-background border-b">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-6">Live Community Statistics</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statsLoading ? [...Array(4)].map((_, i) => (
              <div key={i} className="text-center p-5 bg-card border rounded-xl"><Skeleton className="h-10 w-1/2 mx-auto mb-2" /><Skeleton className="h-4 w-2/3 mx-auto" /></div>
            )) : [
              { label: "Members Worldwide", value: `${(stats?.totalMembers ?? 0).toLocaleString()}` },
              { label: "Acts of Chesed", value: `${(stats?.totalPeopleHelped ?? 0).toLocaleString()}` },
              { label: "Active Volunteers", value: `${(stats?.activeVolunteers ?? 0).toLocaleString()}` },
              { label: "Recorded Donations", value: `$${Number(stats?.donationsRaised ?? 0).toLocaleString()}` },
            ].map((stat, i) => (
              <div key={i} className="text-center p-5 bg-card border rounded-xl shadow-sm">
                <div className="text-4xl font-serif font-bold text-secondary mb-1">{stat.value}</div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pinned News Announcements */}
      <PinnedAnnouncementBar />

      {/* Today's Charity Spotlight */}
      {todayCharity && (
        <section className="py-14 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-6">
              <Star className="h-5 w-5 text-accent fill-accent" />
              <h2 className="font-serif text-2xl font-bold text-primary">Today's Featured Cause</h2>
            </div>
            <div className="bg-card border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start shadow-sm">
              <div className="flex-1 space-y-4">
                <h3 className="font-serif text-2xl font-bold text-primary">{todayCharity.name}</h3>
                <p className="text-muted-foreground leading-relaxed">{todayCharity.description}</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-secondary">${Number(todayCharity.raisedAmount).toLocaleString()} raised</span>
                    <span className="text-muted-foreground">Goal: ${Number(todayCharity.goalAmount).toLocaleString()}</span>
                  </div>
                  <Progress value={pct(Number(todayCharity.raisedAmount), Number(todayCharity.goalAmount))} className="h-2.5" />
                </div>
              </div>
              <div className="flex flex-col gap-3 shrink-0">
                {[18, 36, 100, 180].map(amt => (
                  <Link key={amt} href="/charity">
                    <Button variant="outline" className="w-32 border-secondary/30 hover:bg-secondary/10 text-secondary hover:border-secondary font-semibold">${amt}</Button>
                  </Link>
                ))}
                <Link href="/charity">
                  <Button className="w-32 bg-secondary hover:bg-secondary/90 text-white gap-2"><Heart className="h-4 w-4" /> Donate</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 12 Departments */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold text-primary mb-3">12 Departments</h2>
            <div className="w-16 h-1 bg-accent mx-auto" />
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Everything your community needs — from daily chesed to long-term activism infrastructure.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {DEPARTMENTS.map((dept, i) => (
              <Link key={i} href={dept.href}>
                <div className={`bg-gradient-to-br ${dept.color} border rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer group h-full flex flex-col relative`}>
                  {dept.featured && (
                    <div className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                      <Star className="h-2.5 w-2.5 fill-current" /> Flagship
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-xl ${dept.iconColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    {dept.icon}
                  </div>
                  <h3 className="font-serif font-bold text-primary text-base mb-2 leading-tight">{dept.label}</h3>
                  <p className="text-muted-foreground text-xs flex-1 leading-relaxed">{dept.desc}</p>
                  <div className="flex items-center gap-1 text-accent-foreground/70 font-semibold text-xs mt-4 group-hover:gap-2 transition-all">
                    Explore <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <p className="font-serif italic text-accent text-lg mb-3">כי הוא יסד על ימים ארצו</p>
          <h2 className="font-serif text-4xl font-bold mb-4">Join the Kehilla</h2>
          <p className="text-primary-foreground/70 max-w-lg mx-auto mb-8 font-serif italic">
            Thousands of activists worldwide are using Gavhah to organize their chesed work. Be part of the movement.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-primary font-bold px-10 h-13 gap-2">
                <Users className="h-5 w-5" /> Join Today — Free
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent px-10 h-13 gap-2">
                <BarChart3 className="h-5 w-5" /> Koach Harabim
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
