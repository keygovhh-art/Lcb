import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { MemberGate } from "@/components/shared/member-gate";
import { Layout } from "@/components/layout/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Phone, MessageSquare, Voicemail, Users, Send, Megaphone, CheckCircle, AlertCircle } from "lucide-react";

export default function Communications() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [broadcastForm, setBroadcastForm] = useState({
    recipientGroup: "all",
    subject: "",
    message: "",
  });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [broadcastSending, setBroadcastSending] = useState(false);

  const loadBroadcasts = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/broadcasts", { credentials: "include" });
      if (res.ok) setBroadcasts(await res.json());
    } catch {}
  };

  useEffect(() => {
    void loadBroadcasts();
  }, [isAdmin]);

  const sendWebsiteBroadcast = async () => {
    if (!broadcastForm.subject.trim() || !broadcastForm.message.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientGroup: broadcastForm.recipientGroup,
          channel: "website",
          subject: broadcastForm.subject.trim(),
          message: broadcastForm.message.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Could not send broadcast", description: body.error, variant: "destructive" });
        return;
      }
      const sent = await res.json();
      setBroadcasts(current => [sent, ...current.filter((b: any) => b.id !== sent.id)]);
      setBroadcastForm({ recipientGroup: "all", subject: "", message: "" });
      toast({ title: "Broadcast sent", description: `Delivered to ${sent.recipientCount} website notification inboxes.` });
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Radio className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">Olam Hachesed Communications</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-xl">
            Website broadcasts are active. Phone, SMS, voicemail, and conference features will activate after a communications provider is connected.
          </p>
          <div className="ml-11 mt-4 flex flex-wrap gap-2">
            <Badge className="bg-green-100 text-green-800 border border-green-200 gap-1.5">
              <CheckCircle className="h-3 w-3" /> Website Notifications Active
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <AlertCircle className="h-3 w-3" /> Phone / SMS Provider Not Connected
            </Badge>
          </div>
        </div>
      </div>

      <MemberGate gate="communications" action="access the communications platform">
      <div className="container mx-auto px-4 py-10">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Calls", value: "—", sub: "Provider not connected", icon: <Phone className="h-5 w-5 text-primary" />, color: "bg-primary/10" },
            { label: "SMS", value: "—", sub: "Provider not connected", icon: <MessageSquare className="h-5 w-5 text-secondary" />, color: "bg-secondary/10" },
            { label: "Voicemail", value: "—", sub: "Provider not connected", icon: <Voicemail className="h-5 w-5 text-accent" />, color: "bg-accent/10" },
            { label: "Website Broadcasts", value: String(broadcasts.length), sub: "saved broadcasts", icon: <Megaphone className="h-5 w-5 text-primary" />, color: "bg-primary/10" },
          ].map((s, i) => (
            <div key={i} className="bg-card border rounded-xl p-5">
              <div className={`w-10 h-10 rounded-full ${s.color} flex items-center justify-center mb-3`}>{s.icon}</div>
              <div className="text-2xl font-serif font-bold text-primary">{s.value}</div>
              <div className="text-sm font-medium text-foreground">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="broadcast" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1">
            <TabsTrigger value="broadcast" className="gap-2">
              <Megaphone className="h-4 w-4" /> Website Broadcast
            </TabsTrigger>
          </TabsList>

          {/* Broadcast */}
          <TabsContent value="broadcast" className="space-y-6">
            <h2 className="font-serif text-2xl font-bold text-primary">Broadcast Messaging</h2>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Send Broadcast Message</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Recipient Group</Label>
                    <Select value={broadcastForm.recipientGroup} onValueChange={v => setBroadcastForm(f => ({ ...f, recipientGroup: v }))}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Members</SelectItem>
                        <SelectItem value="volunteers">Volunteers Only</SelectItem>
                        <SelectItem value="admins">Admins Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Channel</Label>
                    <Select value="website">
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="website">Website Notification</SelectItem>
                        <SelectItem value="email" disabled>Email — not connected</SelectItem>
                        <SelectItem value="sms" disabled>SMS — not connected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">Subject</Label>
                  <Input
                    className="h-11"
                    placeholder="Message subject..."
                    value={broadcastForm.subject}
                    onChange={e => setBroadcastForm(f => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">Message</Label>
                  <Textarea
                    placeholder="Your broadcast message..."
                    className="min-h-28 resize-none"
                    value={broadcastForm.message}
                    onChange={e => setBroadcastForm(f => ({ ...f, message: e.target.value }))}
                  />
                </div>
                <Button
                  className="bg-secondary hover:bg-secondary/90 text-white gap-2"
                  onClick={() => void sendWebsiteBroadcast()}
                  disabled={!isAdmin || broadcastSending}
                >
                  <Send className="h-4 w-4" /> {broadcastSending ? "Sending..." : "Send Website Broadcast"}
                </Button>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">Only administrators can send platform-wide broadcasts.</p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Recent Broadcasts</h3>
              {isAdmin && broadcasts.map((b: any) => (
                <div key={b.id} className="bg-card border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{b.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString()} · {b.recipientCount} recipients · Website
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs gap-1">
                    <CheckCircle className="h-3 w-3 text-green-600" /> Delivered
                  </Badge>
                </div>
              ))}
              {isAdmin && broadcasts.length === 0 && (
                <div className="bg-muted/20 border rounded-xl p-6 text-center text-sm text-muted-foreground">
                  No website broadcasts sent yet.
                </div>
              )}
            </div>
          </TabsContent>


        </Tabs>

        <section className="mt-10 space-y-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-primary">Provider-Dependent Modules</h2>
            <p className="text-sm text-muted-foreground mt-1">
              These modules will activate only after a phone/SMS provider is connected. No demo traffic is shown as real activity.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Phone Calls", icon: <Phone className="h-5 w-5" /> },
              { label: "SMS", icon: <MessageSquare className="h-5 w-5" /> },
              { label: "Voicemail", icon: <Voicemail className="h-5 w-5" /> },
              { label: "Conference Calls", icon: <Users className="h-5 w-5" /> },
            ].map(module => (
              <div key={module.label} className="bg-card border rounded-xl p-5">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                  {module.icon}
                </div>
                <p className="font-semibold text-foreground">{module.label}</p>
                <Badge variant="outline" className="mt-2 gap-1.5 text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5" /> Provider not connected
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
      </MemberGate>
    </Layout>
  );
}
