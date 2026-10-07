import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type Language = "en" | "yi";

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (en: string, yi?: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (en) => en,
  isRTL: false,
});

export function LanguageProvider({ children, forceLanguage }: { children: ReactNode; forceLanguage?: Language }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (forceLanguage) return forceLanguage;
    try { return (localStorage.getItem("gavhah:lang") as Language) || "en"; } catch { return "en"; }
  });
  const activeLang = forceLanguage ?? lang;

  useEffect(() => {
    document.documentElement.dir = activeLang === "yi" ? "rtl" : "ltr";
    document.documentElement.lang = activeLang === "yi" ? "yi" : "en";
  }, [activeLang]);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try { localStorage.setItem("gavhah:lang", l); } catch {}
    document.documentElement.dir = l === "yi" ? "rtl" : "ltr";
    document.documentElement.lang = l === "yi" ? "yi" : "en";
  }, []);

  const t = useCallback((en: string, yi?: string) => {
    if (activeLang === "yi" && yi) return yi;
    return en;
  }, [activeLang]);

  return (
    <LanguageContext.Provider value={{ lang: activeLang, setLang, t, isRTL: activeLang === "yi" }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
