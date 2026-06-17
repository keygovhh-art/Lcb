import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell, Search, Menu, X, Globe, MessageSquare, HandHeart, Heart, Clock,
  Users, BarChart3, Shield, Home, ChevronRight, ChevronDown, Network,
  Radio, CalendarDays, Star, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import {
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";

const PRIMARY_DEPTS = [
  { label: "News", fullLabel: "Chesed News Center", href: "/news", icon: <Globe className="h-4 w-4" /> },
  { label: "Forum", fullLabel: "Askanim Discussion Center", href: "/forum", icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Directory", fullLabel: "Activists Directory", href: "/directory", icon: <HandHeart className="h-4 w-4" /> },
  { label: "United", fullLabel: "United In Kindness", href: "/united", icon: <Network className="h-4 w-4" /> },
  { label: "Today's Cause", fullLabel: "Today's Cause", href: "/charity", icon: <Heart className="h-4 w-4" /> },
  { label: "Minyans", fullLabel: "Minyan Directory", href: "/minyans", icon: <Clock className="h-4 w-4" /> },
  { label: "Groups", fullLabel: "Group Center", href: "/groups", icon: <Users className="h-4 w-4" /> },
  { label: "My Askanus", fullLabel: "My Askanus", href: "/my", icon: <Star className="h-4 w-4" /> },
];

const MORE_DEPTS = [
  { label: "Communications", fullLabel: "Olam Hachesed Communications", href: "/communications", icon: <Radio className="h-4 w-4" /> },
  { label: "Reservations", fullLabel: "Gavhah Office Reservations", href: "/reservations", icon: <CalendarDays className="h-4 w-4" /> },
  { label: "Admin Center", fullLabel: "Administration Center", href: "/admin", icon: <Shield className="h-4 w-4" /> },
  { label: "Koach Harabim", fullLabel: "Koach Harabim Dashboard", href: "/dashboard", icon: <BarChart3 className="h-4 w-4" /> },
];

const ALL_DEPTS = [...PRIMARY_DEPTS, ...MORE_DEPTS];

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [location] = useLocation();
  const { lang, setLang } = useLanguage();

  const { data: unreadData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      refetchInterval: 30_000,
    }
  });
  const unreadCount = unreadData?.count ?? 0;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const activeMoreDept = MORE_DEPTS.find(d => isActive(d.href));

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <span className="font-serif text-xl font-bold text-primary tracking-wide">GAVHAH</span>
          </Link>

          {/* Desktop Nav — 8 primary + More dropdown */}
          <nav className="hidden lg:flex items-center gap-0 flex-1 justify-center">
            {PRIMARY_DEPTS.map((d) => (
              <Link key={d.href} href={d.href}>
                <span className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer block ${
                  isActive(d.href)
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-primary hover:bg-muted/60"
                }`}>
                  {d.label}
                </span>
              </Link>
            ))}

            {/* More dropdown */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeMoreDept
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-primary hover:bg-muted/60"
                }`}
              >
                {activeMoreDept ? activeMoreDept.label : "More"}
                <ChevronDown className="h-3 w-3" />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute top-full mt-1 right-0 z-50 bg-card border rounded-xl shadow-lg py-1 min-w-52">
                    {MORE_DEPTS.map(d => (
                      <Link key={d.href} href={d.href}>
                        <div
                          onClick={() => setMoreOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                            isActive(d.href) ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                          }`}
                        >
                          <span className="text-muted-foreground">{d.icon}</span>
                          {d.fullLabel}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8">
              <Search className="h-4 w-4" />
            </Button>
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "yi" : "en")}
              className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-muted hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
              title={lang === "en" ? "Switch to Yiddish" : "Switch to English"}
            >
              {lang === "en" ? "עי" : "EN"}
            </button>

            {/* Bell — links to notifications, shows real unread count */}
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* Profile */}
            <Link href="/profile" className="hidden md:flex">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <User className="h-4 w-4" />
              </Button>
            </Link>

            <Link href="/login" className="hidden md:flex">
              <Button variant="outline" size="sm" className="font-serif h-8 text-xs px-3">Sign In</Button>
            </Link>
            <Link href="/register" className="hidden md:flex">
              <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white font-serif h-8 text-xs px-3">Join</Button>
            </Link>
            <Button
              variant="ghost" size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Active department breadcrumb */}
        {location !== "/" && (
          <div className="border-t border-muted/40 bg-muted/20">
            <div className="container mx-auto px-4 flex items-center gap-2 py-1.5">
              <Link href="/"><span className="text-xs text-muted-foreground hover:text-primary cursor-pointer">Home</span></Link>
              {ALL_DEPTS.filter(d => isActive(d.href)).map(d => (
                <div key={d.href} className="flex items-center gap-2">
                  <span className="text-muted-foreground/40 text-xs">/</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary">{d.icon}</span>
                    <span className="text-xs font-semibold text-primary">{d.fullLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-72 bg-background border-r shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-serif text-xl font-bold text-primary tracking-wide">GAVHAH</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-8 w-8">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <Link href="/">
                <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors ${location === "/" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}>
                  <div className="flex items-center gap-3">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Home</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-40" />
                </div>
              </Link>
              <p className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Departments</p>
              <nav className="space-y-0.5 px-2">
                {ALL_DEPTS.map((d) => (
                  <Link key={d.href} href={d.href}>
                    <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive(d.href) ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                      <div className="flex items-center gap-3">
                        <span className={isActive(d.href) ? "text-primary-foreground" : "text-muted-foreground"}>{d.icon}</span>
                        <span className="font-medium text-sm">{d.fullLabel}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </div>
                  </Link>
                ))}
              </nav>
              <div className="border-t mt-3 pt-3 px-2 space-y-0.5">
                <Link href="/notifications">
                  <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive("/notifications") ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                    <div className="flex items-center gap-3">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Notifications</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
                    )}
                  </div>
                </Link>
                <Link href="/profile">
                  <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive("/profile") ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">My Profile</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-40" />
                  </div>
                </Link>
              </div>
            </div>
            <div className="p-4 border-t space-y-2">
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full font-serif">Sign In</Button>
              </Link>
              <Link href="/register" onClick={() => setMobileOpen(false)}>
                <Button className="w-full bg-secondary hover:bg-secondary/90 text-white font-serif">Join Kehilla</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col">{children}</main>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-12 mt-auto">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-sm">
            <div>
              <p className="font-serif font-bold text-accent text-xl mb-3 tracking-wide">GAVHAH</p>
              <p className="text-primary-foreground/60 font-serif italic leading-relaxed text-xs">
                Raising Kindness Worldwide.<br />Olam Chesed Yibaneh.
              </p>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Community</p>
              <nav className="space-y-1.5">
                {[["Chesed News", "/news"], ["Askanim Forum", "/forum"], ["Groups", "/groups"], ["United In Kindness", "/united"]].map(([l, h]) => (
                  <Link key={h} href={h} className="block text-primary-foreground/60 hover:text-accent transition-colors text-xs">{l}</Link>
                ))}
              </nav>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Services</p>
              <nav className="space-y-1.5">
                {[["Directory", "/directory"], ["Today's Cause", "/charity"], ["Minyan Directory", "/minyans"], ["Reservations", "/reservations"]].map(([l, h]) => (
                  <Link key={h} href={h} className="block text-primary-foreground/60 hover:text-accent transition-colors text-xs">{l}</Link>
                ))}
              </nav>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Platform</p>
              <nav className="space-y-1.5">
                {[["My Askanus", "/my"], ["Koach Harabim", "/dashboard"], ["Notifications", "/notifications"], ["My Profile", "/profile"], ["Admin Center", "/admin"]].map(([l, h]) => (
                  <Link key={h} href={h} className="block text-primary-foreground/60 hover:text-accent transition-colors text-xs">{l}</Link>
                ))}
              </nav>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-primary-foreground/40">
            <p>&copy; {new Date().getFullYear()} Gavhah Global Community Platform. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/system" className="hover:text-accent transition-colors">Support</Link>
              <span className="hover:text-accent transition-colors cursor-pointer">Privacy</span>
              <span className="hover:text-accent transition-colors cursor-pointer">Terms</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
