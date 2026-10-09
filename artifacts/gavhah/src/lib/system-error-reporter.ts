type SystemErrorPayload = {
  type: string;
  route?: string;
  message: string;
  stack?: string;
  componentStack?: string;
  resource?: string;
  statusCode?: number | string;
  userAgent?: string;
};

const rawFetch = typeof window !== "undefined" ? window.fetch.bind(window) : null;
const QUEUE_KEY = "gavhah:system-error-queue";
const SEEN_KEY = "gavhah:system-error-seen";
const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_QUEUE = 25;

function currentRoute() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function safeText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function fingerprint(payload: SystemErrorPayload) {
  return [
    payload.type,
    payload.route || currentRoute(),
    payload.statusCode || "",
    payload.resource || "",
    payload.message.slice(0, 300),
  ].join("|");
}

function loadSeen(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function recentlyReported(payload: SystemErrorPayload) {
  if (typeof localStorage === "undefined") return false;
  const now = Date.now();
  const key = fingerprint(payload);
  const seen = loadSeen();
  for (const [entry, stamp] of Object.entries(seen)) {
    if (!Number.isFinite(stamp) || now - stamp > COOLDOWN_MS * 5) delete seen[entry];
  }
  if (seen[key] && now - seen[key] < COOLDOWN_MS) return true;
  seen[key] = now;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
  return false;
}

function queue(payload: SystemErrorPayload) {
  if (typeof localStorage === "undefined") return;
  try {
    const current = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    const items = Array.isArray(current) ? current : [];
    items.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {}
}

async function send(payload: SystemErrorPayload) {
  if (!rawFetch) return false;
  try {
    const response = await rawFetch("/api/system-errors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        route: payload.route || currentRoute(),
        userAgent: payload.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : ""),
      }),
    });
    return response.ok || (response.status >= 400 && response.status < 500);
  } catch {
    return false;
  }
}

export async function reportSystemError(payload: SystemErrorPayload) {
  const normalized: SystemErrorPayload = {
    ...payload,
    route: payload.route || currentRoute(),
    message: safeText(payload.message || "Unknown frontend error").slice(0, 1600),
    stack: payload.stack?.slice(0, 5000),
    componentStack: payload.componentStack?.slice(0, 4000),
    resource: payload.resource?.slice(0, 500),
  };

  if (recentlyReported(normalized)) return;
  const sent = await send(normalized);
  if (!sent) queue(normalized);
}

export async function flushQueuedSystemErrors() {
  if (!rawFetch || typeof localStorage === "undefined") return;
  let items: SystemErrorPayload[] = [];
  try {
    const current = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (Array.isArray(current)) items = current;
  } catch {}

  if (!items.length) return;

  const remaining: SystemErrorPayload[] = [];
  for (const item of items.slice(-MAX_QUEUE)) {
    const ok = await send(item);
    if (!ok) remaining.push(item);
  }

  try {
    if (remaining.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {}
}

export function installGlobalErrorReporting() {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent | Event) => {
    if (event instanceof ErrorEvent) {
      void reportSystemError({
        type: "window_error",
        message: event.message || "Unhandled browser error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        resource: event.filename,
      });
      return;
    }

    const target = event.target as HTMLElement | null;
    const resource =
      target instanceof HTMLScriptElement ? target.src :
      target instanceof HTMLLinkElement ? target.href :
      target instanceof HTMLImageElement ? target.src :
      "";

    if (resource) {
      void reportSystemError({
        type: "resource_load_error",
        message: "A page resource failed to load",
        resource,
      });
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    void reportSystemError({
      type: "unhandled_promise",
      message: safeText(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  };

  const onOnline = () => { void flushQueuedSystemErrors(); };

  const onSubmit = (event: SubmitEvent) => {
    const submitter = event.submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    if (submitter.hasAttribute("type")) return;

    event.preventDefault();
    event.stopPropagation();

    void reportSystemError({
      type: "accidental_form_submit_blocked",
      message: "Blocked a form refresh caused by a button without an explicit type.",
      resource: [
        submitter.id ? `#${submitter.id}` : "",
        submitter.name ? `name=${submitter.name}` : "",
        submitter.textContent?.trim().slice(0, 120) || "",
      ].filter(Boolean).join(" "),
    });
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("online", onOnline);
  window.addEventListener("submit", onSubmit, true);
  void flushQueuedSystemErrors();

  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("submit", onSubmit, true);
  };
}
