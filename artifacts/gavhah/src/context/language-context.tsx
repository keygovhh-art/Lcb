import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try { return (localStorage.getItem("gavhah:lang") as Language) || "en"; } catch { return "en"; }
  });

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try { localStorage.setItem("gavhah:lang", l); } catch {}
    document.documentElement.dir = l === "yi" ? "rtl" : "ltr";
    document.documentElement.lang = l === "yi" ? "yi" : "en";
  }, []);

  const t = useCallback((en: string, yi?: string) => {
    if (lang === "yi" && yi) return yi;
    return en;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL: lang === "yi" }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
