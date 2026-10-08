import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/context/language-context";
import { AuthProvider } from "@/context/auth-context";
import { YiddishMirror } from "@/components/shared/yiddish-mirror";
import { SiteCopyLayer } from "@/components/shared/site-copy-layer";
import { AppErrorBoundary } from "@/components/shared/app-error-boundary";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import NewsList from "@/pages/news/index";
import NewsDetail from "@/pages/news/detail";
import ForumList from "@/pages/forum/index";
import ForumDetail from "@/pages/forum/detail";
import ForumNew from "@/pages/forum/new";
import Directory from "@/pages/directory/index";
import United from "@/pages/united/index";
import Communications from "@/pages/communications/index";
import Charity from "@/pages/charity/index";
import Minyans from "@/pages/minyans/index";
import GroupsList from "@/pages/groups/index";
import GroupDetail from "@/pages/groups/detail";
import MyAskanus from "@/pages/my/index";
import Reservations from "@/pages/reservations/index";
import SystemCenter from "@/pages/system/index";
import Dashboard from "@/pages/dashboard/index";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import FounderDashboard from "@/pages/admin/index";
import NotificationsPage from "@/pages/notifications/index";
import ProfilePage from "@/pages/profile/index";
import SearchPage from "@/pages/search/index";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    },
  },
});

if (typeof window !== "undefined" && !(window as any).__gavhahApiRefetchInstalled) {
  (window as any).__gavhahApiRefetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (
      response.ok &&
      url.includes("/api/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(method)
    ) {
      queueMicrotask(() => {
        void queryClient.invalidateQueries({ refetchType: "active" });
      });
    }

    return response;
  };
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    const frame = window.requestAnimationFrame(reset);
    const timer = window.setTimeout(reset, 0);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [location]);

  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/news" component={NewsList} />
      <Route path="/news/:id" component={NewsDetail} />
      <Route path="/forum" component={ForumList} />
      <Route path="/forum/new" component={ForumNew} />
      <Route path="/forum/:id" component={ForumDetail} />
      <Route path="/directory" component={Directory} />
      <Route path="/united" component={United} />
      <Route path="/communications" component={Communications} />
      <Route path="/charity" component={Charity} />
      <Route path="/minyans" component={Minyans} />
      <Route path="/groups" component={GroupsList} />
      <Route path="/groups/:id" component={GroupDetail} />
      <Route path="/my" component={MyAskanus} />
      <Route path="/reservations" component={Reservations} />
      <Route path="/system" component={SystemCenter} />
      <Route path="/founder" component={FounderDashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  const baseRoot = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isYiddishMirror = typeof window !== "undefined" &&
    (window.location.pathname === "/yi" || window.location.pathname.startsWith("/yi/"));
  const routerBase = `${baseRoot}${isYiddishMirror ? "/yi" : ""}`;

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider forceLanguage={isYiddishMirror ? "yi" : undefined}>
          <AuthProvider>
            <YiddishMirror active={isYiddishMirror}>
              <TooltipProvider>
                <WouterRouter base={routerBase}>
                  <SiteCopyLayer />
                  <Router />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </YiddishMirror>
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
