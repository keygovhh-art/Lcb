import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { Lock, Sparkles } from "lucide-react";

export type MemberGateSection = "forum" | "volunteer" | "help" | "projects" | "groups" | "connections" | "general";
export type GateDesign = {
  title: string; subtitle: string; body: string; footnote: string;
  joinText: string; signInText: string;
  theme: "warm" | "gold" | "blue" | "plain";
  layout: "centered" | "split" | "minimal";
  imageUrl: string; showIcon: boolean;
};
export function defaultGateDesign(section: MemberGateSection, lang: "yi" | "en"): GateDesign {
  const yi = lang === "yi";
  const titles: Record<MemberGateSection,[string,string]> = {
    forum: ["עסקנים פארום", "Askanim Forum"],
    volunteer: ["ווערן אן עסקן", "Become a Volunteer"],
    help: ["בעטן הילף", "Request Assistance"],
    projects: ["קהילה פראיעקטן", "Community Projects"],
    groups: ["גרופעס", "Member Groups"],
    connections: ["פארבינדונגען", "Member Connections"],
    general: ["מעמבער־צוטריט", "Member Access"],
  };
  return {
    title: yi ? `ברוכים הבאים צום ${titles[section][0]}` : `Welcome to ${titles[section][1]}`,
    subtitle: yi ? "די גבהה קהילה" : "The Gavhah Community",
    body: yi
      ? "כדי צו קענען אנטייל נעמען אין דעם אפטיילונג דארף מען זיין א רעגיסטרירטער מעמבער. מעמבערשיפ איז אומזיסט. נאכן זיך אריינשרייבן וועסטו קענען ווייטערגיין."
      : "To participate in this section, please sign in or join the community. Membership is free; you can continue after joining.",
    footnote: yi ? "היים־אדרעס איז אפטיאָנעל. קיין פאסט וועט נישט געשיקט ווערן אן באזונדערע רשות." :
      "A home address is optional; postal mail is never sent without separate permission.",
    joinText: yi ? "ווערן א מעמבער — אומזיסט" : "Join Free",
    signInText: yi ? "איך בין שוין א מעמבער" : "Already a member? Sign in",
    theme: "warm", layout: "centered", imageUrl: "", showIcon: true,
  };
}
const themes: Record<GateDesign["theme"], string> = {
  warm: "bg-gradient-to-br from-amber-50/80 via-white to-stone-50 border-stone-200",
  gold: "bg-gradient-to-br from-amber-100 via-yellow-50 to-white border-amber-300",
  blue: "bg-gradient-to-br from-sky-50 via-white to-indigo-50 border-sky-200",
  plain: "bg-card border-border",
};
export function GateWelcome({ design, returnTo = "/forum", preview = false }:
  { design: GateDesign; returnTo?: string; preview?: boolean }) {
  const join = `/register?return=${encodeURIComponent(returnTo)}`;
  const login = `/login?return=${encodeURIComponent(returnTo)}`;
  const split = design.layout === "split" && Boolean(design.imageUrl);
  const dir = /[\u0590-\u05FF]/.test(design.title) ? "rtl" : undefined;
  return (
    <div className={`rounded-2xl border p-6 sm:p-10 shadow-sm w-full ${themes[design.theme] || themes.warm}`}
      dir={dir}>
      <div className={split ? "grid md:grid-cols-2 gap-7 items-center" : "w-full"}>
        {design.imageUrl && <img src={design.imageUrl} alt="" loading="lazy"
          className={split ? "w-full rounded-xl aspect-[4/3] object-cover" : "w-full max-h-52 rounded-xl object-cover mb-5"} />}
        <div className={`space-y-4 ${!split && design.layout !== "minimal" ? "text-center" : ""}`}>
          {design.showIcon && <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary`}>
            <Lock className="h-6 w-6" />
          </div>}
          <div className="space-y-2">
            {design.subtitle && <p className="text-xs tracking-wide font-semibold text-secondary">{design.subtitle}</p>}
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-primary">{design.title}</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{design.body}</p>
          <div className={`flex flex-wrap gap-3 pt-2 ${!split && design.layout !== "minimal" ? "justify-center" : ""}`}>
            {preview ? <>
              <Button type="button" disabled>{design.joinText}</Button>
              <Button type="button" variant="outline" disabled>{design.signInText}</Button>
            </> : <>
              <Link href={join}><Button type="button" className="bg-secondary hover:bg-secondary/90 text-white">{design.joinText}</Button></Link>
              <Link href={login}><Button type="button" variant="outline">{design.signInText}</Button></Link>
            </>}
          </div>
          {design.footnote && <p className="text-xs text-muted-foreground">{design.footnote}</p>}
        </div>
      </div>
    </div>
  );
}

export function MemberGate({ children, gate = "general" }:
  { children?: React.ReactNode; action?: string; compact?: boolean; gate?: MemberGateSection }) {
  const { user, isLoaded } = useAuth();
  const { lang } = useLanguage();
  const [location] = useLocation();
  const selectedLang = lang === "yi" ? "yi" : "en";
  const [design, setDesign] = useState<GateDesign>(() => defaultGateDesign(gate,selectedLang));
  useEffect(() => {
    let active = true;
    setDesign(defaultGateDesign(gate,selectedLang));
    fetch(`/api/membership-gates/${gate}/${selectedLang}`, { cache:"no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if(active && data?.title && data?.body) setDesign(data); })
      .catch(() => {});
    return () => { active = false; };
  },[gate,selectedLang]);
  if (!isLoaded) return null;
  if (user) return <>{children}</>;
  // Preserve the /yi language prefix and current section after joining.
  const currentPath = typeof window !== "undefined" ? window.location.pathname : location;
  const returnTo = currentPath && currentPath.startsWith("/") && !currentPath.startsWith("//") ? currentPath : "/";
  return <div className="w-full max-w-4xl mx-auto my-4" data-membership-gate={gate}>
    <GateWelcome design={design} returnTo={returnTo} />
  </div>;
}
