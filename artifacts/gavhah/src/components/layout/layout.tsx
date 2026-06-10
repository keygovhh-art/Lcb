import { ReactNode } from "react";
import { Link } from "wouter";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-serif text-2xl font-bold text-primary">Gavhah</span>
            </Link>
            <nav className="hidden lg:flex gap-4 xl:gap-6">
              <Link href="/news" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">News</Link>
              <Link href="/forum" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Forum</Link>
              <Link href="/directory" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Directory</Link>
              <Link href="/charity" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Charity</Link>
              <Link href="/minyans" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Minyans</Link>
              <Link href="/groups" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Groups</Link>
              <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </Button>
            <Link href="/login" className="hidden sm:flex">
              <Button variant="outline" className="font-serif">Sign In</Button>
            </Link>
            <Link href="/register" className="hidden sm:flex">
              <Button className="bg-secondary hover:bg-secondary/90 text-white font-serif">Join Kehilla</Button>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="bg-primary text-primary-foreground py-12 mt-auto border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 text-center">
          <span className="font-serif text-2xl font-bold text-accent mb-4 block">Gavhah</span>
          <p className="text-primary-foreground/60 max-w-md mx-auto mb-8 font-serif italic">
            Connecting communities worldwide through acts of loving-kindness.
          </p>
          <div className="flex justify-center gap-6 mb-8 text-sm">
            <Link href="/about" className="hover:text-accent transition-colors">About Us</Link>
            <Link href="/contact" className="hover:text-accent transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-accent transition-colors">Terms</Link>
          </div>
          <p className="text-sm text-primary-foreground/40">
            &copy; {new Date().getFullYear()} Gavhah Community Platform. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
