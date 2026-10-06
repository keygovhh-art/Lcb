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
import { Radio, Phone, MessageSquare, Voicemail, Users, Send, Megaphone, Clock, CheckCircle, AlertCircle } from "lucide-react";

const CALL_LOG = [
  { id: 1, caller: "Rabbi Y. Friedman", number: "+1 (718) 555-0142", type: "inbound", duration: "4m 32s", time: "Today, 10:15 AM", status: "completed" },
  { id: 2, caller: "Devorah Katz", number: "+1 (732) 555-0088", type: "outbound", duration: "2m 11s", time: "Today, 9:40 AM", status: "completed" },
  { id: 3, caller: "Unknown", number: "+1 (845) 555-0310", type: "inbound", duration: "—", time: "Yesterday, 3:22 PM", status: "missed" },
  { id: 4, caller: "Shmuel Weiss", number: "+1 (718) 555-0267", type: "inbound", duration: "8m 50s", time: "Yesterday, 11:05 AM", status: "completed" },
];

const SMS_LOG = [
  { from: "Devorah Katz", message: "Thank you for the referral — family has been connected.", time: "2 hours ago", unread: true },
  { from: "Community Alert", message: "Urgent: Medical transport needed tonight in Boro Park.", time: "5 hours ago", unread: true },
  { from: "Shmuel Weiss", message: "Confirmed — donation processed successfully.", time: "Yesterday", unread: false },
];

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

      <MemberGate action="access the communications platform">
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
          <TabsList className="bg-muted/50 h-auto p-1 flex flex-wrap gap-1">
            <TabsTrigger value="calls" className="gap-2" disabled><Phone className="h-4 w-4" /> Calls — Not Connected</TabsTrigger>
            <TabsTrigger value="sms" className="gap-2" disabled><MessageSquare className="h-4 w-4" /> SMS — Not Connected</TabsTrigger>
            <TabsTrigger value="voicemail" className="gap-2" disabled><Voicemail className="h-4 w-4" /> Voicemail — Not Connected</TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-2"><Megaphone className="h-4 w-4" /> Broadcast</TabsTrigger>
            <TabsTrigger value="conference" className="gap-2" disabled><Users className="h-4 w-4" /> Conference — Not Connected</TabsTrigger>
          </TabsList>

          {/* Call Log */}
          <TabsContent value="calls" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Call Log</h2>
              <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                <Phone className="h-4 w-4" /> New Call
              </Button>
            </div>
            <div className="bg-card border rounded-xl divide-y">
              {CALL_LOG.map(call => (
                <div key={call.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    call.status === "missed" ? "bg-destructive/10 text-destructive" :
                    call.type === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{call.caller}</span>
                      <Badge variant={call.status === "missed" ? "destructive" : "outline"} className="text-xs capitalize">{call.status}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{call.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{call.number} · {call.time} · {call.duration}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      <Phone className="h-3 w-3" /> Call Back
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SMS */}
          <TabsContent value="sms" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">SMS Messages</h2>
              <div className="flex gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-500" /> Activation Pending
                </Badge>
                <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                  <Send className="h-4 w-4" /> New SMS
                </Button>
              </div>
            </div>
            <div className="bg-card border rounded-xl divide-y">
              {SMS_LOG.map((sms, i) => (
                <div key={i} className={`flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors ${sms.unread ? "bg-accent/5" : ""}`}>
                  <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-sm shrink-0">
                    {sms.from[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-foreground">{sms.from}</span>
                      {sms.unread && <div className="w-2 h-2 bg-accent rounded-full" />}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{sms.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sms.time}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs">Reply</Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Voicemail */}
          <TabsContent value="voicemail" className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-primary">Voicemail Inbox</h2>
            <div className="bg-card border rounded-xl divide-y">
              {[
                { from: "Unknown Caller", duration: "1m 15s", time: "Today, 8:30 AM", transcription: "Shalom, I am looking for help with transportation for a medical appointment on Thursday..." },
                { from: "+1 (718) 555-0142", duration: "0m 45s", time: "Yesterday, 4:15 PM", transcription: "This is Rabbi Goldstein calling regarding the Bikur Cholim coordination meeting..." },
                { from: "Unknown Caller", duration: "2m 02s", time: "Yesterday, 1:00 PM", transcription: "I need urgent assistance — please call back as soon as possible..." },
                { from: "+1 (845) 555-0310", duration: "0m 30s", time: "2 days ago", transcription: "Calling about the group activity announcement..." },
              ].map((vm, i) => (
                <div key={i} className={`p-5 hover:bg-muted/20 transition-colors ${i < 2 ? "bg-accent/5" : ""}`}>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{vm.from}</span>
                        {i < 2 && <Badge className="bg-accent/20 text-accent-foreground text-xs">New</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{vm.time} · {vm.duration}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="text-xs gap-1">
                        <Phone className="h-3 w-3" /> Play
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1">
                        <Phone className="h-3 w-3" /> Call Back
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground italic">
                    AI Transcription: "{vm.transcription}"
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

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

          {/* Conference */}
          <TabsContent value="conference" className="space-y-6">
            <h2 className="font-serif text-2xl font-bold text-primary">Conference Calls</h2>
            <div className="bg-card border rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Schedule Conference Call</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-semibold">Meeting Title</Label>
                  <Input className="h-11" placeholder="e.g. Bikur Cholim Coordinators Call" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">Date & Time</Label>
                  <Input type="datetime-local" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">Participants</Label>
                  <Input className="h-11" placeholder="Add participants by name or email" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">Duration</Label>
                  <Select>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2">
                <Users className="h-4 w-4" /> Schedule Conference
              </Button>
            </div>
            <div className="bg-muted/30 border rounded-xl p-8 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-serif text-muted-foreground italic">No upcoming conferences scheduled.</p>
              <p className="text-xs text-muted-foreground mt-2">Schedule a conference call above to coordinate with your team.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </MemberGate>
    </Layout>
  );
}
