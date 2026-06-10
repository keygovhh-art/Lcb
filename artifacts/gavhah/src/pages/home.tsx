import { Link } from "wouter";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-serif text-2xl font-bold text-primary">Gavhah</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link href="/news" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">News</Link>
              <Link href="/forum" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Forum</Link>
              <Link href="/directory" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Directory</Link>
              <Link href="/charity" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Charity</Link>
              <Link href="/minyans" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Minyans</Link>
              <Link href="/groups" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Groups</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="hidden md:flex">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="outline" className="hidden md:flex font-serif">Sign In</Button>
            <Button className="hidden md:flex bg-secondary hover:bg-secondary/90 text-white font-serif">Join Kehilla</Button>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-primary text-primary-foreground py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1599882672332-9011933ba17d?q=80&w=2000&auto=format&fit=crop')] opacity-10 mix-blend-overlay bg-cover bg-center" />
          <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center">
            <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 max-w-4xl leading-tight">
              Olam Chesed Yibaneh
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/80 max-w-2xl mb-12 font-serif italic">
              The world is built through kindness. Connect, volunteer, and support our global community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-primary font-bold text-lg px-8 h-14">
                I Want To Help
              </Button>
              <Button size="lg" variant="outline" className="text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10 text-lg px-8 h-14 bg-transparent">
                I Need Help
              </Button>
              <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-white font-bold text-lg px-8 h-14">
                Today's Charity
              </Button>
            </div>
          </div>
        </section>

        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl font-bold text-primary mb-4">Community Activity</h2>
              <div className="w-24 h-1 bg-accent mx-auto" />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { label: "People Helped", value: "12,450+" },
                { label: "Active Volunteers", value: "3,200" },
                { label: "Minyans Listed", value: "850" },
                { label: "Donations Raised", value: "$2.4M" },
              ].map((stat, i) => (
                <div key={i} className="text-center p-6 bg-card border rounded-lg shadow-sm">
                  <div className="text-4xl font-serif font-bold text-secondary mb-2">{stat.value}</div>
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-primary text-primary-foreground py-12 mt-auto border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 text-center">
          <span className="font-serif text-2xl font-bold text-accent mb-4 block">Gavhah</span>
          <p className="text-primary-foreground/60 max-w-md mx-auto mb-8 font-serif italic">
            Connecting communities worldwide through acts of loving-kindness.
          </p>
          <p className="text-sm text-primary-foreground/40">
            &copy; {new Date().getFullYear()} Gavhah Community Platform. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
