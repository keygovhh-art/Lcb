import { useEffect, useState } from "react";
import { Eye, EyeOff, MessageCircle, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";

type Setting = {
  section: "forum" | "news";
  label: string;
  supportsReplies: boolean;
  replyMode: "instant" | "review" | "off";
  showViews: boolean;
};

type Overview = {
  settings: Setting[];
  stats: {
    forum: { views: number; comments: number; discussions: number };
    news: { views: number; articles: number };
    pendingComments: number;
  };
  top: {
    forum: Array<{ id: number; title: string; views: number; commentCount: number }>;
    news: Array<{ id: number; title: string; views: number }>;
  };
};

export function EngagementManagement() {
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { toast } = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/engagement-overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load engagement controls");
      setData(await res.json());
    } catch (error) {
      toast({
        title: yi ? "מען האט נישט געקענט לאדן" : "Could not load controls",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const update = async (
    section: Setting["section"],
    patch: Partial<Pick<Setting, "replyMode" | "showViews">>,
  ) => {
    setBusy(section);
    try {
      const res = await fetch(`/api/admin/engagement-settings/${section}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save setting");
      toast({ title: yi ? "אפגעהיטן" : "Saved" });
      await load();
    } catch (error) {
      toast({
        title: yi ? "מען האט נישט געקענט אפהיטן" : "Could not save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) {
    return <div className="rounded-xl border p-10 text-center text-muted-foreground">{yi ? "לאדנט..." : "Loading..."}</div>;
  }

  const forum = data?.settings.find(item => item.section === "forum");
  const news = data?.settings.find(item => item.section === "news");

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">
              {yi ? "קאמענטארן, ריפלייס און וויאוס" : "Comments, Replies & Views"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {yi
              ? "שטעל אן ווי ריפלייס זאלן ארויפגיין און צי דער ציבור זאל זען די אויגן־אייקאן און וויאוס. די מערכת זעט די ציפערן אלעמאל."
              : "Control reply moderation and whether public view counters are visible. Staff always retains the internal counts."}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          {yi ? "פריש לאדן" : "Refresh"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{yi ? "פארום וויאוס" : "Forum Views"}</p>
          <p className="text-2xl font-bold text-primary mt-1">{data?.stats.forum.views ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{yi ? "פארום קאמענטארן" : "Forum Comments"}</p>
          <p className="text-2xl font-bold text-primary mt-1">{data?.stats.forum.comments ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{yi ? "ווארט אויף ריוויו" : "Waiting for Review"}</p>
          <p className="text-2xl font-bold text-primary mt-1">{data?.stats.pendingComments ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{yi ? "נייעס וויאוס" : "News Views"}</p>
          <p className="text-2xl font-bold text-primary mt-1">{data?.stats.news.views ?? 0}</p>
        </div>
      </div>

      {forum && (
        <div className="rounded-2xl border bg-card p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-lg">{yi ? "עסקנים פארום" : "Askanim Forum"}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {yi ? "די זעלבע אנשטעלונג גייט אויף הויפט קאמענטארן און אויף אלע טיפע ריפלייס." : "The same policy applies to top-level comments and every nested reply depth."}
              </p>
            </div>
            <Badge variant="outline">
              {data?.stats.forum.discussions ?? 0} {yi ? "שמועסן" : "discussions"}
            </Badge>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-xl border p-4">
              <p className="font-semibold text-sm mb-3">{yi ? "וואס זאל פאסירן ווען איינער ריפלייט?" : "What happens when someone replies?"}</p>
              <select
                value={forum.replyMode}
                disabled={busy === "forum"}
                onChange={e => void update("forum", { replyMode: e.target.value as Setting["replyMode"] })}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="instant">{yi ? "גלייך ארויפגיין" : "Publish immediately"}</option>
                <option value="review">{yi ? "ווארטן פאר ריוויו" : "Hold for staff review"}</option>
                <option value="off">{yi ? "גארנישט ערלויבן" : "Turn replies off"}</option>
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                {forum.replyMode === "instant"
                  ? (yi ? "יעדער ערלויבטער ריפליי ווערט גלייך פובליק." : "Allowed replies appear immediately.")
                  : forum.replyMode === "review"
                    ? (yi ? "דער ריפליי גייט ערשט צום Operations Inbox." : "Replies go to the Operations Inbox before publication.")
                    : (yi ? "דער ציבור זעט בכלל נישט קיין ריפליי־פאָרם." : "The public reply form is hidden entirely.")}
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="font-semibold text-sm mb-3">{yi ? "וויאוס פארן ציבור" : "Public view counter"}</p>
              <Button
                variant={forum.showViews ? "default" : "outline"}
                disabled={busy === "forum"}
                onClick={() => void update("forum", { showViews: !forum.showViews })}
                className="gap-2"
              >
                {forum.showViews ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {forum.showViews ? (yi ? "אויגן + צאל וויאוס ווייזן" : "Show eye + view count") : (yi ? "באהאלטן פונעם ציבור" : "Hidden from public")}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {yi ? "אפילו ווען עס איז באהאלטן, זעט די מערכת ווייטער אלע ציפערן דא." : "Even when hidden publicly, staff still sees all counts here."}
              </p>
            </div>
          </div>
        </div>
      )}

      {news && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">{yi ? "חסד נייעס" : "Chesed News"}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.stats.news.articles ?? 0} {yi ? "ארטיקלען" : "articles"} · {yi ? "די מערכת זעט די וויאוס אלעמאל." : "Staff always retains view statistics."}
              </p>
            </div>
            <Button
              variant={news.showViews ? "default" : "outline"}
              disabled={busy === "news"}
              onClick={() => void update("news", { showViews: !news.showViews })}
              className="gap-2"
            >
              {news.showViews ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {news.showViews ? (yi ? "ווייז וויאוס פארן ציבור" : "Show public views") : (yi ? "באהאלט פובליק" : "Hide publicly")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            <h3 className="font-semibold">{yi ? "מערסט געזענע פארום־שמועסן" : "Most Viewed Forum Discussions"}</h3>
          </div>
          <div className="space-y-2">
            {(data?.top.forum ?? []).map(item => (
              <div key={item.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0 flex-1 truncate">{item.title}</div>
                <span className="text-xs text-muted-foreground shrink-0">{item.views} 👁 · {item.commentCount} 💬</span>
              </div>
            ))}
            {(data?.top.forum?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">{yi ? "נאך נישטא קיין דאטע." : "No data yet."}</p>}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            <h3 className="font-semibold">{yi ? "מערסט געזענע נייעס" : "Most Viewed News"}</h3>
          </div>
          <div className="space-y-2">
            {(data?.top.news ?? []).map(item => (
              <div key={item.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0 flex-1 truncate">{item.title}</div>
                <span className="text-xs text-muted-foreground shrink-0">{item.views} 👁</span>
              </div>
            ))}
            {(data?.top.news?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">{yi ? "נאך נישטא קיין דאטע." : "No data yet."}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
