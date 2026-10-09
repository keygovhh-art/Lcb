import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, UserPlus, CheckCircle, Mail, Phone, MapPin, Package } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";

type ContactMethod = "email" | "phone";

export default function Register() {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const [mailing, setMailing] = useState({
    recipient:"",addressLine1:"",addressLine2:"",city:"",state:"",postalCode:"",country:"US",
  });
  const [uspsPermission, setUspsPermission] = useState<"yes" | "no" | "">("");
  const [showAddress, setShowAddress] = useState(false);
  const [method, setMethod] = useState<ContactMethod>("email");
  const [form, setForm] = useState({
    nickname: "", name: "", email: "", phone: "",
    location: "", password: "", confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nickname.trim()) e.nickname = "Nickname is required";
    if (method === "email" && !form.email.includes("@")) e.contact = "A valid email address is required";
    if (method === "phone" && form.phone.replace(/\D/g, "").length < 7) e.contact = "A valid phone number is required";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    if (form.password !== form.confirm) e.confirm = "Passwords do not match";
    const hasAddress=Object.values(mailing).some((v,i)=>i!==6 && v.trim());
    if (hasAddress && (!mailing.recipient.trim() || !mailing.addressLine1.trim() || !mailing.city.trim() || !mailing.state.trim() || !mailing.postalCode.trim())) {
      e.mailing = "To save an address, please provide recipient, street, city, state and ZIP. Otherwise clear the optional address fields.";
    }
    if (hasAddress && uspsPermission === "") e.permission = "Please explicitly choose Yes or No for USPS mail to this address.";
    if (!hasAddress && uspsPermission === "yes") e.permission = "Enter a complete address first or choose No.";
    return e;
  };

  const hasMailingAddress=Object.entries(mailing).some(([key,value])=>key!=="country" && Boolean(value.trim()));



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        nickname: form.nickname.trim(),
        password: form.password,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(method === "email" ? { email: form.email.trim() } : { phone: form.phone.trim() }),
        ...(hasMailingAddress ? {
          mailingAddress: {
            ...mailing,
            recipient: mailing.recipient.trim(), addressLine1: mailing.addressLine1.trim(),
            addressLine2: mailing.addressLine2.trim(), city: mailing.city.trim(),
            state: mailing.state.trim(), postalCode: mailing.postalCode.trim(),
            uspsConsent: uspsPermission === "yes",
          },
        } : {}),
      };
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const user = await res.json();
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            identifier: method === "email" ? form.email.trim() : form.phone.trim(),
            password: form.password,
          }),
        });
        toast({ title: `Welcome, ${user.nickname}!`, description: "Your Gavhah membership is active." });
        if (loginRes.ok) {
          const requested = new URLSearchParams(window.location.search).get("return") || "/";
          const safeReturn = requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") ? requested : "/";
          const separator = safeReturn.includes("?") ? "&" : "?";
          window.location.replace(`${safeReturn}${separator}auth=${Date.now()}`);
        } else {
          window.location.assign("/login");
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Registration failed", description: data.error ?? "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const strength = form.password.length === 0 ? 0
    : form.password.length < 8 ? 1
    : form.password.length < 12 ? 2 : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"];
  const strengthColor = ["", "bg-destructive", "bg-accent", "bg-green-500"];

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="font-serif text-3xl font-bold text-accent">Gavhah</span>
            <h1 className="font-serif text-2xl font-bold text-primary mt-2 mb-1">Join the Kehilla</h1>
            <p className="text-muted-foreground font-serif italic text-sm">Membership is free</p>
          </div>

          <div className="bg-card border rounded-2xl p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Nickname — required, public */}
              <div className="space-y-2">
                <Label htmlFor="nickname" className="font-semibold">
                  Nickname <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1 text-xs">(shown publicly)</span>
                </Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={set("nickname")}
                  placeholder="How the community will know you"
                  className="h-12"
                  autoComplete="username"
                />
                {errors.nickname && <p className="text-xs text-destructive">{errors.nickname}</p>}
              </div>

              {/* Real Name — optional, private */}
              <div className="space-y-2">
                <Label htmlFor="name" className="font-semibold">
                  Real Name <span className="text-muted-foreground font-normal">(optional, kept private)</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Your full name"
                  className="h-12"
                  autoComplete="name"
                />
              </div>

              {/* Contact method */}
              <div className="space-y-2">
                <Label className="font-semibold">
                  Contact Method <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMethod("email")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${method === "email" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Mail className="h-4 w-4" /> Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("phone")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${method === "phone" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Phone className="h-4 w-4" /> Phone
                  </button>
                </div>
                {method === "email" ? (
                  <Input type="email" value={form.email} onChange={set("email")} placeholder="your@email.com" className="h-12" autoComplete="email" />
                ) : (
                  <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="+1 (718) 555-0100" className="h-12" autoComplete="tel" />
                )}
                {errors.contact && <p className="text-xs text-destructive">{errors.contact}</p>}
              </div>

              {/* Location — optional */}
              <div className="space-y-2">
                <Label htmlFor="location" className="font-semibold">
                  City / Community <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input id="location" value={form.location} onChange={set("location")} placeholder="Brooklyn, NY" className="h-12" />
              </div>

              {/* Optional home mailing address: never mandatory for signup */}
              <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
                <div className="flex items-start gap-2">
                  <Package className="h-5 w-5 text-primary shrink-0 mt-0.5"/>
                  <div>
                    <p className="font-semibold text-primary">
                      {yi ? "היים־אדרעס פאר וויכטיגע מעמבער־פאסט — אפטיאָנעל" : "Optional home address for important member mail"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {yi
                        ? "די מערכת קען אמאל שיקן ספעציעלע וויכטיגע סחורה פאר מעמבערס. דו מוזט נישט געבן קיין אדרעס צו ווערן א מעמבער."
                        : "We may occasionally have important member materials to mail. Providing a home address is completely optional and never required for membership."}
                    </p>
                  </div>
                </div>
                <label className="flex gap-2 items-center text-sm">
                  <input type="checkbox" checked={showAddress}
                    onChange={e=>{setShowAddress(e.target.checked);if(!e.target.checked){setMailing({recipient:"",addressLine1:"",addressLine2:"",city:"",state:"",postalCode:"",country:"US"});setUspsPermission("");}}}/>
                  {yi ? "איך וויל אפטיאָנעל אריינלייגן מיין היים־אדרעס" : "I'd like to optionally provide my home address"}
                </label>
                {showAddress && <>
                  <div className="grid gap-3">
                    <div><Label>{yi?"אויף וועמענס נאמען":"Recipient name"}</Label>
                      <Input autoComplete="name" value={mailing.recipient} onChange={e=>setMailing(m=>({...m,recipient:e.target.value}))}/>
                    </div>
                    <div><Label>{yi?"הויז־נומער און גאס":"Street address"}</Label>
                      <Input autoComplete="address-line1" value={mailing.addressLine1} onChange={e=>setMailing(m=>({...m,addressLine1:e.target.value}))}/>
                    </div>
                    <div><Label>{yi?"דירה / סוויט (אויב שייך)":"Apartment / suite (optional)"}</Label>
                      <Input autoComplete="address-line2" value={mailing.addressLine2} onChange={e=>setMailing(m=>({...m,addressLine2:e.target.value}))}/>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>{yi?"שטאט":"City"}</Label>
                        <Input autoComplete="address-level2" value={mailing.city} onChange={e=>setMailing(m=>({...m,city:e.target.value}))}/>
                      </div>
                      <div><Label>{yi?"סטעיט":"State"}</Label>
                        <Input autoComplete="address-level1" value={mailing.state} onChange={e=>setMailing(m=>({...m,state:e.target.value}))}/>
                      </div>
                    </div>
                    <div><Label>{yi?"זיפ קאוד":"ZIP code"}</Label>
                      <Input autoComplete="postal-code" value={mailing.postalCode} onChange={e=>setMailing(m=>({...m,postalCode:e.target.value}))}/>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 bg-background space-y-2">
                    <p className="font-semibold text-sm">
                      {yi?"געבסטו בפירוש רשות אז די מערכת מעג שיקן USPS־פאסט צו דער אדרעס?" :
                        "Do you explicitly permit Gavhah to send USPS mail to this home address?"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {yi?"אויב דו ווילסט נישט, ווערט די אדרעס אפגעהיטן מיטן לעבעל 'נישט שיקן'. מען קען דאס שפעטער טוישן." :
                        "If No, your address will be saved as DO NOT SEND. You may change this permission later."}
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="usps-consent" checked={uspsPermission==="yes"} onChange={()=>setUspsPermission("yes")}/>
                      {yi?"יא, איך בין מסכים צו באקומען USPS־פאסט":"Yes, USPS mail is permitted"}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="usps-consent" checked={uspsPermission==="no"} onChange={()=>setUspsPermission("no")}/>
                      {yi?"ניין, היט אפ מיין אדרעס, אבער שיק גארנישט":"No — save address but DO NOT SEND"}
                    </label>
                    {errors.permission && <p className="text-xs text-destructive">{errors.permission}</p>}
                  </div>
                  {errors.mailing && <p className="text-xs text-destructive">{errors.mailing}</p>}
                </>}
                <p className="text-xs text-muted-foreground">
                  {yi?"די אדרעס איז פריוואט, נאר פארן בארעכטיגטן אדמין, און ווערט נישט געוויזן אינעם פובליק־פראפיל." :
                    "Address is private, available only to authorized staff, never displayed in your public profile."}
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="font-semibold">Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    placeholder="Minimum 8 characters"
                    className="h-12 pr-11"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {form.password && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${strengthColor[strength]}`} style={{ width: `${(strength / 3) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{strengthLabel[strength]}</span>
                  </div>
                )}
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {/* Confirm password */}
              <div className="space-y-2">
                <Label htmlFor="confirm" className="font-semibold">Confirm Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type="password"
                    value={form.confirm}
                    onChange={set("confirm")}
                    placeholder="Repeat your password"
                    className="h-12 pr-11"
                    autoComplete="new-password"
                  />
                  {form.confirm && form.confirm === form.password && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                  )}
                </div>
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-secondary hover:bg-secondary/90 text-white font-semibold text-base gap-2"
                disabled={loading}
              >
                {loading ? "Creating account..." : <><UserPlus className="h-5 w-5" /> Create Free Account</>}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href={`/login?return=${encodeURIComponent(new URLSearchParams(window.location.search).get("return") || "/")}`} className="text-secondary font-semibold hover:underline">Sign in</Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            By joining, you agree to maintain Torah-appropriate conduct in all community interactions.
          </p>
        </div>
      </div>
    </Layout>
  );
}
