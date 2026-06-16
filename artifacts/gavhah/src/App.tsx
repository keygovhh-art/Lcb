import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/context/language-context";
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

const queryClient = new QueryClient();

function Router() {
  return (
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
      <Route path="/admin" component={SystemCenter} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
