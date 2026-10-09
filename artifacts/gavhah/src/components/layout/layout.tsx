import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell, Search, Menu, X, Globe, MessageSquare, HandHeart, Heart, Clock,
  Users, BarChart3, Shield, Home, ChevronRight, ChevronDown, Network,
  Radio, CalendarDays, Star, User, LogOut, Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import {
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";

const PRIMARY_DEPTS = [
  { label: "News", fullLabel: "Chesed News Center", href: "/news", icon: <Globe className="h-4 w-4" /> },
  { label: "Forum", fullLabel: "Askanim Discussion Center", href: "/forum", icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Help", fullLabel: "Private Assistance Intake", href: "/directory", icon: <HandHeart className="h-4 w-4" /> },
  { label: "United", fullLabel: "United In Kindness", href: "/united", icon: <Network className="h-4 w-4" /> },
  { label: "Today's Cause", fullLabel: "Today's Cause", href: "/charity", icon: <Heart className="h-4 w-4" /> },
  { label: "Minyans", fullLabel: "Minyan Directory", href: "/minyans", icon: <Clock className="h-4 w-4" /> },
  { label: "Groups", fullLabel: "Group Center", href: "/groups", icon: <Users className="h-4 w-4" /> },
  { label: "My Askanus", fullLabel: "My Askanus", href: "/my", icon: <Star className="h-4 w-4" /> },
];

const MORE_DEPTS = [
  { label: "Communications", fullLabel: "Olam Hachesed Communications", href: "/communications", icon: <Radio className="h-4 w-4" /> },
  { label: "Reservations", fullLabel: "Gavhah Office Reservations", href: "/reservations", icon: <CalendarDays className="h-4 w-4" /> },
  { label: "My Connections", fullLabel: "Volunteer Connections", href: "/connections", icon: <Handshake className="h-4 w-4" /> },
  { label: "Koach Harabim", fullLabel: "Koach Harabim Dashboard", href: "/dashboard", icon: <BarChart3 className="h-4 w-4" /> },
];

const ADMIN_DEPT = { label: "Founder Dashboard", fullLabel: "Founder & Admin Dashboard", href: "/founder", icon: <Shield className="h-4 w-4" /> };

const ALL_PUBLIC_DEPTS = [...PRIMARY_DEPTS, ...MORE_DEPTS];

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: unreadData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled: isAuthenticated,
      refetchInterval: isAuthenticated ? 30_000 : false,
    }
  });
  const unreadCount = unreadData?.count ?? 0;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const visibleMoreDepts = isAdmin ? [...MORE_DEPTS, ADMIN_DEPT] : MORE_DEPTS;
  const allDepts = [...PRIMARY_DEPTS, ...visibleMoreDepts];
  const activeMoreDept = visibleMoreDepts.find(d => isActive(d.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayName = user?.nickname || user?.name || "Account";

  const browserPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const isYiddish = browserPath === "/yi" || browserPath.startsWith("/yi/");
  const englishPath = isYiddish ? (browserPath.replace(/^\/yi(?=\/|$)/, "") || "/") : browserPath;
  const yiddishPath = isYiddish ? browserPath : `/yi${browserPath === "/" ? "" : browserPath}`;
  const browserSuffix = typeof window !== "undefined" ? window.location.search + window.location.hash : "";

  return (
    <div className="min-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-14 min-w-0 max-w-full flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <span className="font-serif text-xl font-bold text-primary tracking-wide">GAVHAH</span>
          </Link>

          {/* Desktop Nav */}
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
                    {isAdmin && (
                      <>
                        <div className="my-1 border-t" />
                        <Link href="/founder">
                          <div
                            onClick={() => setMoreOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                              isActive("/founder") ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                            }`}
                          >
                            <span className="text-muted-foreground"><Shield className="h-4 w-4" /></span>
                            Founder Dashboard
                          </div>
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="hidden sm:flex items-center rounded-md border border-border overflow-hidden text-[11px] font-semibold" data-no-yiddish>
              <a
                href={englishPath + browserSuffix}
                className={`px-2.5 py-1.5 transition-colors ${!isYiddish ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
                lang="en"
                dir="ltr"
              >
                English
              </a>
              <a
                href={yiddishPath + browserSuffix}
                className={`px-2.5 py-1.5 transition-colors ${isYiddish ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
                lang="yi"
                dir="rtl"
              >
                אידיש
              </a>
            </div>

            <Link href="/search">
              <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8" title="Search">
                <Search className="h-4 w-4" />
              </Button>
            </Link>

            {/* Bell */}
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

            {isAuthenticated ? (
              /* Logged-in user menu */
              <div className="relative hidden md:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-primary border border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-[100px] truncate">{displayName}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {userOpen && (
                  <div className="absolute top-full mt-1 right-0 z-50 bg-card border rounded-xl shadow-lg py-1 min-w-48">
                    <div className="px-4 py-2 border-b mb-1">
                      <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                      {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    </div>
                    {[
                      { label: "My Profile", href: "/profile" },
                      { label: "My Askanus", href: "/my" },
                      { label: "My Connections", href: "/connections" },
                      { label: "Notifications", href: "/notifications" },
                      { label: "Help & Support", href: "/system" },
                    ].map(item => (
                      <Link key={item.href} href={item.href}>
                        <div onClick={() => setUserOpen(false)} className="px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer text-foreground">
                          {item.label}
                        </div>
                      </Link>
                    ))}
                    {isAdmin && (
                      <>
                        <div className="my-1 border-t" />
                        <Link href="/founder">
                          <div onClick={() => setUserOpen(false)} className="px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer text-foreground flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                            Founder Dashboard
                          </div>
                        </Link>
                      </>
                    )}
                    <div className="my-1 border-t" />
                    <button
                      onClick={async () => { setUserOpen(false); await logout(); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer text-destructive flex items-center gap-2"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Guest buttons */
              <div className="hidden md:flex items-center gap-1">
                <Link href="/login">
                  <Button variant="outline" size="sm" className="font-serif h-8 text-xs px-3">Sign In</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white font-serif h-8 text-xs px-3">Join</Button>
                </Link>
              </div>
            )}

            <Button
              variant="ghost" size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Breadcrumb */}
        {location !== "/" && (
          <div className="border-t border-muted/40 bg-muted/20">
            <div className="container mx-auto px-4 flex items-center gap-2 py-1.5">
              <Link href="/"><span className="text-xs text-muted-foreground hover:text-primary cursor-pointer">Home</span></Link>
              {allDepts.filter(d => isActive(d.href)).map(d => (
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
              <div className="mx-4 mt-3 mb-2 flex items-center rounded-md border border-border overflow-hidden text-xs font-semibold" data-no-yiddish>
                <a
                  href={englishPath + browserSuffix}
                  className={`flex-1 text-center px-3 py-2 transition-colors ${!isYiddish ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
                  lang="en"
                  dir="ltr"
                >
                  English
                </a>
                <a
                  href={yiddishPath + browserSuffix}
                  className={`flex-1 text-center px-3 py-2 transition-colors ${isYiddish ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
                  lang="yi"
                  dir="rtl"
                >
                  אידיש
                </a>
              </div>
              <p className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Departments</p>
              <nav className="space-y-0.5 px-2">
                {ALL_PUBLIC_DEPTS.map((d) => (
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
                {isAdmin && (
                  <Link href="/founder">
                    <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive("/founder") ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                      <div className="flex items-center gap-3">
                        <Shield className={`h-4 w-4 ${isActive("/founder") ? "text-primary-foreground" : "text-muted-foreground"}`} />
                        <span className="font-medium text-sm">Founder Dashboard</span>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </div>
                  </Link>
                )}
              </nav>
              <div className="border-t mt-3 pt-3 px-2 space-y-0.5">
                <Link href="/search">
                  <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive("/search") ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                    <div className="flex items-center gap-3">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Search</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-40" />
                  </div>
                </Link>
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
                <Link href="/connections">
                  <div onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive("/connections") ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"}`}>
                    <div className="flex items-center gap-3">
                      <Handshake className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">My Connections</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-40" />
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
              {isAuthenticated ? (
                <>
                  <div className="px-2 py-1 text-sm text-muted-foreground font-medium truncate">
                    Signed in as <span className="text-foreground font-semibold">{displayName}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={async () => { setMobileOpen(false); await logout(); }}
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full font-serif">Sign In</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full bg-secondary hover:bg-secondary/90 text-white font-serif">Join Kehilla</Button>
                  </Link>
                </>
              )}
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
                {[["Private Assistance", "/directory"], ["Today's Cause", "/charity"], ["Minyan Directory", "/minyans"], ["Reservations", "/reservations"]].map(([l, h]) => (
                  <Link key={h} href={h} className="block text-primary-foreground/60 hover:text-accent transition-colors text-xs">{l}</Link>
                ))}
              </nav>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Platform</p>
              <nav className="space-y-1.5">
                {[["My Askanus", "/my"], ["My Connections", "/connections"], ["Koach Harabim", "/dashboard"], ["Notifications", "/notifications"], ["My Profile", "/profile"]].map(([l, h]) => (
                  <Link key={h} href={h} className="block text-primary-foreground/60 hover:text-accent transition-colors text-xs">{l}</Link>
                ))}
              </nav>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-primary-foreground/40">
            <p>&copy; {new Date().getFullYear()} Gavhah Global Community Platform. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/system" className="hover:text-accent transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-accent transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
