import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Handshake, Mail, Phone, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

type Connection = {
  id: number;
  stage: "new" | "invited" | "accepted" | "contact_problem" | "declined" | "connected" | "closed_unfulfilled";
  role: "requester" | "volunteer";
  subject: string;
  volunteerName: string;
  requesterName: string;
  contact: string | null;
  guidance: string;
  closureReason: string | null;
  contactIssue: string | null;
  createdAt: string;
};

function contactLink(contact: string): string | null {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return `mailto:${contact}`;
  const cleaned = contact.replace(/[()\s.\-]/g, "");
  return /^\+?\d{7,16}$/.test(cleaned) ? `tel:${cleaned}` : null;
}

function stageLabel(stage: Connection["stage"], yi: boolean): string {
  const labels: Record<Connection["stage"], [string, string]> = {
    new: ["ווארט אויף אדמין", "Waiting for administrator"],
    invited: ["ווארט אויף רשות", "Waiting for volunteer consent"],
    accepted: ["רשות געגעבן — פארבינד זיך", "Consent granted — make contact"],
    contact_problem: ["קאנטאקט־פראבלעם — אדמין העלפט", "Contact problem — staff follow-up"],
    declined: ["וואלונטיר האט נישט מסכים געווען", "Volunteer declined"],
    connected: ["פארבינדונג באשטעטיגט", "Connection confirmed"],
    closed_unfulfilled: ["נישט געלונגען", "Could not complete"],
  };
  return labels[stage][yi ? 0 : 1];
}

export default function ConnectionsPage() {
  const { isAuthenticated, isLoaded } = useAuth();
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { toast } = useToast();
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [problemDrafts, setProblemDrafts] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/member-connections/mine", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Could not retrieve connection requests");
      setItems(await response.json());
    } catch (error) {
      toast({ title: yi ? "נישט געקענט לאדן פארבינדונגען" : "Could not load connections",
        description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setLoading(false); }
  }, [isAuthenticated, yi, toast]);

  useEffect(() => { if (isLoaded) void load(); }, [isLoaded, load]);

  const action = async (item: Connection, path: string, body: unknown) => {
    setBusy(item.id);
    try {
      const response = await fetch(`/api/member-connections/${item.id}/${path}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Request failed");
      }
      toast({ title: yi ? "די ענדערונג איז אפגעהיטן" : "Connection status updated" });
      await load();
    } catch (error) {
      toast({ title: yi ? "די אקציע האט נישט געארבעט" : "Action failed",
        description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div>
            <h1 className="font-serif text-3xl text-primary font-bold flex gap-2 items-center">
              <Handshake className="h-7 w-7" />
              {yi ? "מיינע פארבינדונגען" : "My Connections"}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {yi
                ? "דא זעט מען יעדן שריט ביז די פארבינדונג איז טאקע געלונגען. בלויז ווען דער וואלונטיר גיט רשות ווערן זיינע קאנטאקט־פרטים געוויזן."
                : "Track each request until real contact succeeds. Volunteer contact details remain private until explicit consent."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || !isAuthenticated}>
            <RefreshCcw className="h-4 w-4 me-2" /> {yi ? "דערפריש" : "Refresh"}
          </Button>
        </div>

        {!isLoaded || loading ? (
          <p className="rounded-lg border p-8 text-muted-foreground">{yi ? "לאדנט..." : "Loading..."}</p>
        ) : !isAuthenticated ? (
          <div className="rounded-xl border bg-card p-6">
            <p>{yi ? "מען דארף זיך אריינלאגן כדי צו זען פארבינדונגען." : "Sign in to view your connections."}</p>
            <Link href="/login"><Button className="mt-3">{yi ? "אריינלאגן" : "Sign in"}</Button></Link>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-card p-6">
            <p>{yi ? "דערווייל זענען נישטא קיין פארבינדונג־בקשות." : "No connection requests yet."}</p>
            <Link href="/directory"><Button variant="outline" className="mt-3">{yi ? "זוך א וואלונטיר" : "Browse volunteers"}</Button></Link>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <article key={item.id} className="rounded-xl bg-card border p-4 sm:p-6 space-y-4">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-lg">{item.role === "requester" ? item.volunteerName : item.requesterName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {item.role === "requester"
                        ? (yi ? "וואלונטיר פון וועמען דו בעטסט א פארבינדונג" : "Volunteer you requested")
                        : (yi ? "מיטגליד וואס בעט א פארבינדונג מיט דיר" : "Member asking to contact you")}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold h-fit">
                    {stageLabel(item.stage, yi)}
                  </span>
                </div>

                {item.stage === "new" && <p className="text-sm text-muted-foreground">
                  {yi ? "דער אדמין דארף איבערנעמען די בקשה און בעטן רשות פונעם וואלונטיר." : "An administrator must take this request and ask the volunteer for consent."}
                </p>}
                {item.stage === "invited" && <p className="text-sm text-muted-foreground">
                  {item.role === "volunteer"
                    ? (yi ? "דו קענסט יא אדער ניין זאגן. אויב דו ביסט מסכים, וועט דער בעטער זען דיינע קאנטאקט־פרטים." : "You may agree or decline. If you agree, the requester will see your profile contact details.")
                    : (yi ? "מיר ווארטן אויף דעם וואלונטירס רשות. קיין פריוואטע פרטים זענען נאכנישט ארויסגעגעבן." : "Waiting for the volunteer's permission. No private contact details have been shared.")}
                </p>}

                {item.stage === "invited" && item.role === "volunteer" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex gap-2 items-start">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      {yi ? "ביים מסכים זיין געבסטו רשות צו טיילן דיין טעלעפאן אדער אימעיל וואס איז אויפן אקאונט מיט דעם בעטער." : "Accepting authorizes this requester to see the phone number or email on your account."}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button disabled={busy !== null} onClick={() => {
                        if (window.confirm(yi ? "ביסטו זיכער אז דו ווילסט דעם בעטער געבן דיינע קאנטאקט־פרטים?" : "Share your account contact details with this requester?")) {
                          void action(item, "respond", { decision: "accept" });
                        }
                      }}><CheckCircle2 className="h-4 w-4 me-2" />{yi ? "איך בין מסכים" : "I agree"}</Button>
                      <Button disabled={busy !== null} variant="outline" onClick={() => void action(item, "respond", { decision: "decline" })}>
                        <XCircle className="h-4 w-4 me-2" />{yi ? "איך וויל נישט" : "Decline"}
                      </Button>
                    </div>
                  </div>
                )}

                {item.stage === "accepted" && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="font-semibold">{yi ? "די רשות איז שוין געגעבן!" : "Permission has been granted."}</p>
                    {item.contact && (
                      <>
                        <p className="text-sm break-all">{item.contact}</p>
                        {contactLink(item.contact) && (
                          <a className="inline-flex items-center gap-2 underline text-primary font-medium"
                             href={contactLink(item.contact)!}>
                            {item.contact.includes("@") ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                            {yi ? "פארבינד זיך יעצט" : "Contact now"}
                          </a>
                        )}
                      </>
                    )}
                    {!item.contact && <p className="text-sm text-destructive">
                      {yi ? "די קאנטאקט־פרטים זענען נישט פאראן; בעט דעם אדמין נאך הילף." : "Contact details are unavailable; ask the administrator for help."}
                    </p>}
                    {item.role === "requester" && <div className="pt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        {yi ? "דרוק נאר נאכדעם וואס דו האסט זיך פאקטיש געקענט פארבינדן." : "Confirm only after actual contact has succeeded."}
                      </p>
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {yi ? "קען זיך נישט פארבינדן? שרייב וואס איז נישט געגאנגען, און דער אדמין וועט זען אז דער פאל דארף נאך הילף." :
                            "Could not reach the volunteer? Explain the problem; staff will keep the case open for follow-up."}
                        </p>
                        <textarea
                          rows={2} maxLength={500}
                          value={problemDrafts[item.id] || ""}
                          onChange={e => setProblemDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={yi ? "וואס איז געשען ביים פרובירן זיך צו פארבינדן?" : "What happened when you tried to make contact?"}
                          className="w-full rounded-md border bg-background p-2 text-sm"
                        />
                        <Button type="button" variant="outline"
                          disabled={busy !== null || (problemDrafts[item.id] || "").trim().length < 10}
                          onClick={() => void action(item, "problem", { description: problemDrafts[item.id].trim() })}>
                          {yi ? "איך קען זיך נישט פארבינדן — בעט הילף" : "I couldn't connect — request follow-up"}
                        </Button>
                      </div>
                      <Button disabled={busy !== null || !item.contact} onClick={() => {
                        if (window.confirm(yi ? "האסטו זיך טאקע מצליח געווען צו פארבינדן מיט דעם וואלונטיר?" : "Did you actually make contact with the volunteer?")) {
                          void action(item, "confirm", {});
                        }
                      }}>
                        <CheckCircle2 className="h-4 w-4 me-2" />{yi ? "יא, מיר האבן זיך פארבונדן" : "Yes, contact succeeded"}
                      </Button>
                    </div>}
                  </div>
                )}

                {item.stage === "contact_problem" && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-sm font-semibold">{yi ? "דער פאל בלייבט אפן. דער אדמין דארף נאך העלפן." : "This case stays open while staff helps resolve the contact problem."}</p>
                    {item.contactIssue && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.contactIssue}</p>}
                    {item.contact && <p className="text-xs text-muted-foreground break-all">
                      {yi ? "דער קאנטאקט איז שוין געגעבן געווארן: " : "Previously shared contact: "}{item.contact}
                    </p>}
                  </div>
                )}
                {item.stage === "declined" && <p className="text-sm text-muted-foreground">
                  {yi ? "דער וואלונטיר האט נישט געגעבן רשות. דער אדמין קען ווייטער באהאנדלען דעם פאל, אבער קיין קאנטאקט איז נישט געשיקט געווארן." : "The volunteer declined. Administrators may follow up, but no contact details were shared."}
                </p>}
                {item.stage === "connected" && <p className="text-sm flex gap-2 items-center">
                  <CheckCircle2 className="h-5 w-5 text-green-700" />
                  {yi ? "דער בעטער האט באשטעטיגט אז די פארבינדונג איז טאקע געלונגען." : "The requester confirmed successful contact."}
                </p>}
                {item.stage === "closed_unfulfilled" && <div className="text-sm space-y-1">
                  <p className="font-semibold">{yi ? "דער פאל איז פארמאכט אלס נישט געלונגען." : "Closed as unsuccessful."}</p>
                  {item.closureReason && <p className="text-muted-foreground whitespace-pre-wrap">{item.closureReason}</p>}
                </div>}
              </article>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          {yi ? "מעלדונגען קומען דערווייל אין דיין וועבסייט־אינבאקס; טעקסט־מעסעדזשעס און אימעיל־אוטאמאציע זענען נאך נישט פארבונדן." : "For now, updates arrive in your website inbox. SMS and automated email are not connected."}
        </p>
      </section>
    </Layout>
  );
}
