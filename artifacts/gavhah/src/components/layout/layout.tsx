import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Search, Menu, X, Globe, MessageSquare, HandHeart, Heart, Clock, Users, BarChart3, Shield, Home, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEPARTMENTS = [
  { label: "Home", href: "/", icon: <Home className="h-4 w-4" /> },
  { label: "Chesed News", href: "/news", icon: <Globe className="h-4 w-4" /> },
  { label: "Askanim Forum", href: "/forum", icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Directory", href: "/directory", icon: <HandHeart className="h-4 w-4" /> },
  { label: "Charity", href: "/charity", icon: <Heart className="h-4 w-4" /> },
  { label: "Minyans", href: "/minyans", icon: <Clock className="h-4 w-4" /> },
  { label: "Groups", href: "/groups", icon: <Users className="h-4 w-4" /> },
  { label: "Dashboard", href: "/dashboard", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Administration", href: "/admin", icon: <Shield className="h-4 w-4" /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <span className="font-serif text-2xl font-bold text-primary">Gavhah</span>
          </Link>

          {/* Desktop Nav — all 9 departments */}
          <nav className="hidden xl:flex items-center gap-0.5 flex-1 justify-center">
            {DEPARTMENTS.map((d) => (
              <Link key={d.href} href={d.href}>
                <span
                  className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive(d.href)
                      ? "bg-primary/8 text-primary font-semibold"
                      : "text-muted-foreground hover:text-primary hover:bg-muted/60"
                  }`}
                >
                  {d.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Compact nav for lg (not xl) screens */}
          <nav className="hidden lg:flex xl:hidden items-center gap-0.5 flex-1 justify-center">
            {DEPARTMENTS.filter(d => d.href !== "/").map((d) => (
              <Link key={d.href} href={d.href}>
                <span
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive(d.href)
                      ? "bg-primary/8 text-primary font-semibold"
                      : "text-muted-foreground hover:text-primary hover:bg-muted/60"
                  }`}
                >
                  {d.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="hidden sm:flex h-9 w-9">
              <Search className="h-4 w-4" />
            </Button>
            <Link href="/my">
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
              </Button>
            </Link>
            <Link href="/login" className="hidden sm:flex">
              <Button variant="outline" size="sm" className="font-serif">Sign In</Button>
            </Link>
            <Link href="/register" className="hidden sm:flex">
              <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white font-serif">Join Kehilla</Button>
            </Link>
            {/* Hamburger — shown below xl */}
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden h-9 w-9"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Active department indicator bar */}
        <div className="hidden xl:flex border-t border-muted/40">
          <div className="container mx-auto px-4 flex">
            {DEPARTMENTS.map((d) =>
              isActive(d.href) ? (
                <div
                  key={d.href}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary font-semibold border-b-2 border-primary -mb-px bg-transparent"
                >
                  {d.icon}
                  {d.label}
                </div>
              ) : null
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] xl:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer panel */}
          <div className="absolute top-0 left-0 h-full w-72 bg-background border-r shadow-2xl flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-serif text-xl font-bold text-primary">Gavhah</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* All 9 departments */}
            <div className="flex-1 overflow-y-auto py-3">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                All Departments
              </p>
              <nav className="space-y-0.5 px-2">
                {DEPARTMENTS.map((d) => (
                  <Link key={d.href} href={d.href}>
                    <div
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                        isActive(d.href)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted/60 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isActive(d.href) ? "text-primary-foreground" : "text-muted-foreground"}>
                          {d.icon}
                        </span>
                        <span className="font-medium text-sm">{d.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </div>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Auth buttons */}
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

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-12 mt-auto border-t border-primary-foreground/10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-sm">
            <div>
              <p className="font-serif font-bold text-accent text-lg mb-3">Gavhah</p>
              <p className="text-primary-foreground/60 font-serif italic leading-relaxed">
                Connecting communities worldwide through acts of loving-kindness.
              </p>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Community</p>
              <nav className="space-y-2">
                <Link href="/news" className="block text-primary-foreground/60 hover:text-accent transition-colors">Chesed News</Link>
                <Link href="/forum" className="block text-primary-foreground/60 hover:text-accent transition-colors">Askanim Forum</Link>
                <Link href="/groups" className="block text-primary-foreground/60 hover:text-accent transition-colors">Groups</Link>
                <Link href="/directory" className="block text-primary-foreground/60 hover:text-accent transition-colors">Directory</Link>
              </nav>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Services</p>
              <nav className="space-y-2">
                <Link href="/charity" className="block text-primary-foreground/60 hover:text-accent transition-colors">Today's Charity</Link>
                <Link href="/minyans" className="block text-primary-foreground/60 hover:text-accent transition-colors">Minyan Center</Link>
                <Link href="/dashboard" className="block text-primary-foreground/60 hover:text-accent transition-colors">Dashboard</Link>
                <Link href="/admin" className="block text-primary-foreground/60 hover:text-accent transition-colors">Administration</Link>
              </nav>
            </div>
            <div>
              <p className="font-semibold text-primary-foreground/80 mb-3 uppercase tracking-wider text-xs">Account</p>
              <nav className="space-y-2">
                <Link href="/login" className="block text-primary-foreground/60 hover:text-accent transition-colors">Sign In</Link>
                <Link href="/register" className="block text-primary-foreground/60 hover:text-accent transition-colors">Join Kehilla</Link>
                <Link href="/my" className="block text-primary-foreground/60 hover:text-accent transition-colors">My Profile</Link>
              </nav>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-primary-foreground/40">
            <p>&copy; {new Date().getFullYear()} Gavhah Community Platform. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-accent transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-accent transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
