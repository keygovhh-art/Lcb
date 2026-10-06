import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, UserPlus, CheckCircle, Mail, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ContactMethod = "email" | "phone";

export default function Register() {
  const { toast } = useToast();
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
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        nickname: form.nickname.trim(),
        password: form.password,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(method === "email" ? { email: form.email.trim() } : { phone: form.phone.trim() }),
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
          window.location.replace(`/?auth=${Date.now()}`);
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
                <Link href="/login" className="text-secondary font-semibold hover:underline">Sign in</Link>
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
