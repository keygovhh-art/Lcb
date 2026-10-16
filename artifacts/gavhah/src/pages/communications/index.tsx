import { formatGregorianDateTime } from "@/lib/gregorian-date";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { MaxCallDesk } from "@/components/communications/max-call-desk";
import { HotlineMemberInbox } from "@/components/communications/hotline-member-inbox";
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
    channel:"website",
    subject: "",
    message: "",
  });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastRequestId,setBroadcastRequestId]=useState(()=>crypto.randomUUID());

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
          channel:broadcastForm.channel,
          requestId:broadcastRequestId,
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
      setBroadcastForm({recipientGroup:"all",channel:"website",subject:"",message:""});
      setBroadcastRequestId(crypto.randomUUID());
      toast({ title: "מעסעדזשעס אפגעהיטן", description: `${sent.recipientCount} מיטגלידער · קיין SMS אדער ארויסרופן.` });
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
            <h1 className="font-serif text-4xl font-bold text-primary">עולם החסד — קאמוניקאציע MAX</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-xl">
            דער פערזענליכער נדבן־און־רופן־ארבעטס־צענטער איז גרייט פאר מאנועלע באריכטן. אמת׳ע טעלעפאן־רופן, טעקסט־מעלדונגען און קאנפערענצן דארפן נאך א טעלעפאן־סערוויס.
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

        <Tabs defaultValue="calls" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1 flex flex-wrap gap-1">
            <TabsTrigger value="calls" className="gap-2"><Phone className="h-4 w-4" /> מיין MAX רופן־צענטער</TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-2">
              <Megaphone className="h-4 w-4" /> מעלדונגען
            </TabsTrigger>
            <TabsTrigger value="hotline-inbox" className="gap-2"><Voicemail className="h-4 w-4" /> מיין האטליין־אינבאקס</TabsTrigger>
          </TabsList>

          <TabsContent value="calls" className="space-y-6"><MaxCallDesk /></TabsContent>
          <TabsContent value="hotline-inbox" className="space-y-6"><HotlineMemberInbox/></TabsContent>

          {/* Broadcast */}
          <TabsContent value="broadcast" className="space-y-6">
            <h2 className="font-serif text-2xl font-bold text-primary">מעלדונגען פאר מיטגלידער</h2>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">שיקן א מעלדונג צו מיטגלידער</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-semibold">צו וועלכע מיטגלידער?</Label>
                    <Select value={broadcastForm.recipientGroup} onValueChange={v => setBroadcastForm(f => ({ ...f, recipientGroup: v }))}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">אלע מיטגלידער</SelectItem>
                        <SelectItem value="volunteers">נאר עסקנים</SelectItem>
                        <SelectItem value="admins">נאר מנהלים</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">וואו זאל די מעלדונג אנקומען?</Label>
                    <Select value={broadcastForm.channel} onValueChange={channel=>setBroadcastForm(f=>({...f,channel}))}>
                      <SelectTrigger className="h-11"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="website">בלויז וועבזייטל־מעלדונג</SelectItem>
                        <SelectItem value="hotline_inbox">בלויז פערזענליכער האטליין־אינבאקס</SelectItem>
                        <SelectItem value="both">וועבזייטל און האטליין־אינבאקס</SelectItem>
                      </SelectContent>                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">קעפל</Label>
                  <Input
                    className="h-11"
                    placeholder="Message subject..."
                    value={broadcastForm.subject}
                    onChange={e => setBroadcastForm(f => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold">מעסעדזש</Label>
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
                  <Send className="h-4 w-4" /> {broadcastSending ? "שיקט…" : "אפהיטן אינבאקס־מעסעדזשעס"}
                </Button>
                <p className="text-xs text-muted-foreground">דאס איז אן אינערליכער האטליין־אינבאקס. קיין רוף אדער SMS ווערט נישט ארויסגעשיקט; טעלעפאן־אודיא דארף נאך א זיכערער IVR־פארבינדונג.</p>
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
                      {formatGregorianDateTime(b.createdAt)} · {b.recipientCount} מיטגלידער · {b.channel==="both"?"ביידע אינבאקסן":b.channel==="hotline_inbox"?"האטליין־אינבאקס":"וועבזייטל"}
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
