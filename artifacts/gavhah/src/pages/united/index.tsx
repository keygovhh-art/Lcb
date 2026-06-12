import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, Search, Users, BookOpen, MessageCircle, Handshake, MapPin, Star, Send } from "lucide-react";

const PROFILES = [
  { id: 1, name: "Rabbi Moshe Goldstein", location: "Brooklyn, NY", role: "Bikur Cholim Coordinator", skills: ["Hospital visits", "Medical transport", "Crisis counseling"], bio: "20+ years coordinating hospital chesed in the NY area. Available to connect activists nationwide.", featured: true },
  { id: 2, name: "Devorah Katz", location: "Lakewood, NJ", role: "Hachnosas Kallah Director", skills: ["Shidduchim support", "Wedding coordination", "Fundraising"], bio: "Director of a 200-family Hachnosas Kallah fund. Happy to advise and connect.", featured: true },
  { id: 3, name: "Yitzchok Friedman", location: "Monsey, NY", role: "Askan — General", skills: ["Community organizing", "Government liaison", "Housing"], bio: "15 years of community activism across Rockland County.", featured: false },
  { id: 4, name: "Shmuel Weiss", location: "Boro Park, Brooklyn", role: "Chesed Fund Manager", skills: ["Financial assistance", "Grant writing", "Donor relations"], bio: "Managing a community chesed fund since 2009.", featured: false },
  { id: 5, name: "Chana Berger", location: "Passaic, NJ", role: "Special Needs Advocate", skills: ["Special education", "IEP navigation", "Family support"], bio: "Advocate for special needs families throughout NJ.", featured: true },
  { id: 6, name: "Avigdor Rubin", location: "Jerusalem, Israel", role: "International Chesed Connector", skills: ["International networking", "Aliyah support", "Emergency response"], bio: "Connecting chesed organizations across Israel and the diaspora.", featured: false },
];

const RESOURCES = [
  { title: "How to Start a Bikur Cholim Organization", category: "Guide", author: "R. Moshe Goldstein", reads: 312 },
  { title: "Hachnosas Kallah: Practical Templates", category: "Template", author: "Devorah Katz", reads: 218 },
  { title: "Grant Writing for Jewish Charities", category: "Guide", author: "Shmuel Weiss", reads: 175 },
  { title: "Working with Government Agencies as an Askan", category: "Training", author: "Yitzchok Friedman", reads: 143 },
  { title: "Crisis Intervention for Community Leaders", category: "Training", author: "Chana Berger", reads: 189 },
];

const CATEGORIES = ["All", "Bikur Cholim", "Hachnosas Kallah", "Housing", "Education", "Financial", "Special Needs", "International"];

function ProfileCard({ p }: { p: typeof PROFILES[0] }) {
  const [msgOpen, setMsgOpen] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="bg-card border rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-xl shrink-0">
          {p.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{p.name}</span>
            {p.featured && <Star className="h-3.5 w-3.5 text-accent fill-accent" />}
          </div>
          <p className="text-xs text-secondary font-medium">{p.role}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" /> {p.location}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{p.bio}</p>
      <div className="flex flex-wrap gap-1">
        {p.skills.map((s, i) => <Badge key={i} variant="outline" className="text-xs">{s}</Badge>)}
      </div>
      <div className="flex gap-2 pt-1">
        <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white gap-1.5 flex-1">
              <MessageCircle className="h-3.5 w-3.5" /> Connect
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-primary">Connect with {p.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">Send a collaboration request. All contact is reviewed by Gavhah staff before delivery.</p>
              <Textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Describe your chesed initiative and how you'd like to collaborate..." className="min-h-28 resize-none" />
              <Button className="w-full bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => { setMsgOpen(false); setMsg(""); }}>
                <Send className="h-4 w-4" /> Send Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function United() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = PROFILES.filter(p =>
    (category === "All" || p.skills.some(s => s.toLowerCase().includes(category.toLowerCase())) || p.role.toLowerCase().includes(category.toLowerCase())) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.role.toLowerCase().includes(search.toLowerCase()) || p.location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 via-secondary/5 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Network className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">United In Kindness</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-xl">
            A professional networking hub for activists and chesed organizations worldwide. Connect, collaborate, and amplify your impact.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="network" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1 flex flex-wrap gap-1">
            <TabsTrigger value="network" className="gap-2"><Users className="h-4 w-4" /> Activist Network</TabsTrigger>
            <TabsTrigger value="resources" className="gap-2"><BookOpen className="h-4 w-4" /> Resource Library</TabsTrigger>
            <TabsTrigger value="collaborate" className="gap-2"><Handshake className="h-4 w-4" /> Collaboration Board</TabsTrigger>
          </TabsList>

          {/* Activist Network */}
          <TabsContent value="network" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-10 h-11" placeholder="Search activists, skills, or location..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 w-full sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                <Users className="h-4 w-4" /> Join Network
              </Button>
            </div>

            {/* Featured */}
            {!search && category === "All" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-accent fill-accent" />
                  <h3 className="font-serif font-bold text-primary">Featured Activists</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PROFILES.filter(p => p.featured).map(p => <ProfileCard key={p.id} p={p} />)}
                </div>
                <hr className="my-4" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => <ProfileCard key={p.id} p={p} />)}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                  No activists found for this search.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Resource Library */}
          <TabsContent value="resources" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Resource Library</h2>
              <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                <BookOpen className="h-4 w-4" /> Share Resource
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">Guides, templates, and training materials contributed by our activist network.</p>
            <div className="space-y-3">
              {RESOURCES.map((r, i) => (
                <div key={i} className="bg-card border rounded-xl p-5 flex items-start justify-between gap-4 hover:border-primary/20 hover:shadow-sm transition-all">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{r.category}</Badge>
                    </div>
                    <h3 className="font-serif font-semibold text-primary mb-1">{r.title}</h3>
                    <p className="text-xs text-muted-foreground">By {r.author} · {r.reads} reads</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0">View</Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Collaboration Board */}
          <TabsContent value="collaborate" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Collaboration Board</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                    <Handshake className="h-4 w-4" /> Post Request
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-2xl text-primary">Post Collaboration Request</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label className="font-semibold">Title</Label>
                      <Input placeholder="What kind of collaboration are you seeking?" className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Category</Label>
                      <Select>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter(c => c !== "All").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Description</Label>
                      <Textarea placeholder="Describe the project and what you need..." className="min-h-24 resize-none" />
                    </div>
                    <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">Post Request</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "Seeking: Medical Transport Volunteers — Brooklyn", category: "Bikur Cholim", org: "Bikur Cholim of Brooklyn", urgent: true },
                { title: "Seeking: Fundraising Partner for Hachnosas Kallah Fund", category: "Hachnosas Kallah", org: "Anshei Chesed Foundation", urgent: false },
                { title: "Looking to Expand: Special Needs Summer Program", category: "Special Needs", org: "Yad B'Yad NJ", urgent: false },
                { title: "Seeking: Housing Contacts in Lakewood Area", category: "Housing", org: "Community Askan Network", urgent: true },
              ].map((item, i) => (
                <div key={i} className="bg-card border rounded-xl p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    {item.urgent && <Badge variant="destructive" className="text-xs">Urgent</Badge>}
                    <Badge variant="outline" className="text-xs">{item.category}</Badge>
                  </div>
                  <h3 className="font-serif font-semibold text-primary mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{item.org}</p>
                  <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white gap-1.5 w-full">
                    <MessageCircle className="h-3.5 w-3.5" /> Respond
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
