import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";

type CopyOverride = {
  page: string;
  lang: "en" | "yi";
  source: string;
  value: string;
};

type SelectedText = {
  source: string;
  displayed: string;
  kind: "text" | "placeholder" | "title" | "aria-label" | "alt";
};

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function skipElement(el: Element | null) {
  if (!el) return true;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "script" ||
    tag === "style" ||
    tag === "code" ||
    tag === "pre" ||
    Boolean(el.closest("[data-site-copy-skip]"))
  );
}

function preserveWhitespace(original: string, replacement: string) {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return leading + replacement + trailing;
}

function findEditableText(el: HTMLElement): { value: string; kind: SelectedText["kind"] } | null {
  if (skipElement(el)) return null;

  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder.trim()) {
    return { value: el.placeholder.trim(), kind: "placeholder" };
  }

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue?.trim() ?? "";
    if (!text || text.length > 4000 || skipElement(node.parentElement)) continue;
    return { value: text, kind: "text" };
  }

  for (const attr of ["title", "aria-label", "alt"] as const) {
    const value = el.getAttribute(attr)?.trim();
    if (value) return { value, kind: attr };
  }

  return null;
}

export function SiteCopyLayer() {
  const [location] = useLocation();
  const { lang } = useLanguage();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<CopyOverride[]>([]);
  const [selected, setSelected] = useState<SelectedText | null>(null);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<"page" | "global">("page");
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<number | null>(null);
  const overridesRef = useRef<CopyOverride[]>([]);

  const editMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("siteEdit") === "1" && isAdmin;
  }, [isAdmin, location]);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/site-copy?page=${encodeURIComponent(location || "/")}&lang=${encodeURIComponent(lang)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) return;
      const rows = (await res.json()) as CopyOverride[];
      overridesRef.current = rows;
      setOverrides(rows);
    } catch {
      // The site still works normally if the copy service is temporarily unavailable.
    }
  }, [location, lang]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const replacementMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of overrides) map.set(item.source, item.value);
    return map;
  }, [overrides]);

  const reverseMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of overrides) {
      if (!map.has(item.value)) map.set(item.value, item.source);
    }
    return map;
  }, [overrides]);

  const applyOverrides = useCallback(() => {
    if (typeof document === "undefined") return;
    const map = replacementMap;
    if (!map.size) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);

    for (const textNode of nodes) {
      if (skipElement(textNode.parentElement)) continue;
      const raw = textNode.nodeValue ?? "";
      const core = raw.trim();
      const replacement = map.get(core);
      if (replacement !== undefined && replacement !== core) {
        textNode.nodeValue = preserveWhitespace(raw, replacement);
      }
    }

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      if (skipElement(el)) continue;
      for (const attr of ATTRS) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const replacement = map.get(raw.trim());
        if (replacement !== undefined && replacement !== raw.trim()) {
          el.setAttribute(attr, replacement);
        }
      }
    }
  }, [replacementMap]);

  useEffect(() => {
    applyOverrides();
    const first = window.setTimeout(applyOverrides, 0);
    const second = window.setTimeout(applyOverrides, 80);

    const observer = new MutationObserver(() => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        applyOverrides();
      }, 25);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      window.clearTimeout(first);
      window.clearTimeout(second);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [applyOverrides, location, lang]);

  useEffect(() => {
    if (!editMode) return;

    const previousCursor = document.body.style.cursor;

    const onMove = (event: MouseEvent) => {
      const el = event.target instanceof HTMLElement ? event.target : null;
      if (!el || skipElement(el)) return;
      document.querySelectorAll("[data-site-copy-hover]").forEach(node => {
        node.removeAttribute("data-site-copy-hover");
        (node as HTMLElement).style.outline = "";
        (node as HTMLElement).style.outlineOffset = "";
      });
      const candidate = findEditableText(el);
      if (candidate) {
        el.setAttribute("data-site-copy-hover", "1");
        el.style.outline = "2px dashed #d97706";
        el.style.outlineOffset = "3px";
      }
    };

    const onClick = (event: MouseEvent) => {
      const el = event.target instanceof HTMLElement ? event.target : null;
      if (!el || skipElement(el)) return;
      const candidate = findEditableText(el);
      if (!candidate) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const source = reverseMap.get(candidate.value) ?? candidate.value;
      setSelected({
        source,
        displayed: candidate.value,
        kind: candidate.kind,
      });
      setDraft(candidate.value);
    };

    document.body.style.cursor = "crosshair";
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.body.style.cursor = previousCursor;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.querySelectorAll("[data-site-copy-hover]").forEach(node => {
        node.removeAttribute("data-site-copy-hover");
        (node as HTMLElement).style.outline = "";
        (node as HTMLElement).style.outlineOffset = "";
      });
    };
  }, [editMode, reverseMap]);

  const save = async (publish: boolean) => {
    if (!selected || !draft.trim()) return;
    setSaving(true);
    const page = scope === "global" ? "*" : (location || "/");
    try {
      const saveRes = await fetch("/api/admin/site-copy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          lang,
          source: selected.source,
          value: draft,
        }),
      });
      if (!saveRes.ok) throw new Error("save failed");

      if (publish) {
        const publishRes = await fetch("/api/admin/site-copy/publish", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page,
            lang,
            source: selected.source,
          }),
        });
        if (!publishRes.ok) {
          const error = await publishRes.json().catch(() => ({}));
          throw new Error(error.error || "publish failed");
        }
        toast({ title: lang === "yi" ? "פובליקירט" : "Published", description: lang === "yi" ? "די ענדערונג איז יעצט לייוו." : "The change is now live." });
        await loadOverrides();
        setSelected(null);
      } else {
        toast({ title: lang === "yi" ? "טיוטע אפגעהיטן" : "Draft saved" });
      }
    } catch (error) {
      toast({
        title: lang === "yi" ? "עס האט זיך נישט אפגעהיט" : "Could not save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!editMode) return null;

  const exitEditor = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("siteEdit");
    window.location.href = url.pathname + url.search + url.hash;
  };

  return (
    <div data-site-copy-skip>
      <div className="fixed top-20 right-3 z-[9998] flex items-center gap-2 rounded-xl border bg-background/95 shadow-xl px-3 py-2 backdrop-blur">
        <span className="text-xs font-bold text-amber-700">
          {lang === "yi" ? "✏️ לייוו עדיטאר" : "✏️ LIVE EDITOR"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {lang === "yi" ? "דרוק אויף א טעקסט" : "Click any text"}
        </span>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
          onClick={exitEditor}
        >
          {lang === "yi" ? "פארמאך" : "Exit"}
        </button>
      </div>

      {selected && (
        <div className="fixed inset-x-2 bottom-2 z-[9999] mx-auto max-w-2xl rounded-2xl border bg-background shadow-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-bold text-sm">
                {lang === "yi" ? "רעדאקטיר דעם לייוון טעקסט" : "Edit live text"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {lang === "yi" ? "איצט:" : "Current:"} {selected.displayed}
              </p>
            </div>
            <button type="button" className="text-xl leading-none px-2" onClick={() => setSelected(null)}>×</button>
          </div>

          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="w-full min-h-24 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            dir={lang === "yi" ? "rtl" : "ltr"}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setScope("page")}
                className={`px-3 py-2 ${scope === "page" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {lang === "yi" ? "נאר אויף דעם בלאט" : "This page"}
              </button>
              <button
                type="button"
                onClick={() => setScope("global")}
                className={`px-3 py-2 ${scope === "global" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {lang === "yi" ? "איבעראל אויפן סייט" : "Everywhere"}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !draft.trim()}
                onClick={() => void save(false)}
                className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                {lang === "yi" ? "היט אלס טיוטע" : "Save draft"}
              </button>
              <button
                type="button"
                disabled={saving || !draft.trim()}
                onClick={() => void save(true)}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (lang === "yi" ? "היט..." : "Saving...") : (lang === "yi" ? "פובליקיר לייוו" : "Publish live")}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-3">
            {lang === "yi"
              ? "דער ענגלישער און אידישער נוסח ווערן באזונדער אפגעהיטן. דער זעלבער טעקסט קען מען טוישן נאר אויף דעם בלאט אדער איבעראל."
              : "English and Yiddish are saved separately. You can apply this text only on this page or across the whole site."}
          </p>
        </div>
      )}
    </div>
  );
}
