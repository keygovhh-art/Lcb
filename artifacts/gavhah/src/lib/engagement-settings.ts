import { useQuery } from "@tanstack/react-query";

export type ReplyMode = "instant" | "review" | "off";

export type EngagementSetting = {
  section: "forum" | "news";
  label: string;
  supportsReplies: boolean;
  replyMode: ReplyMode;
  showViews: boolean;
};

async function loadSettings(): Promise<EngagementSetting[]> {
  const res = await fetch("/api/engagement-settings", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load engagement settings");
  return res.json();
}

export function useEngagementSettings() {
  return useQuery({
    queryKey: ["/api/engagement-settings"],
    queryFn: loadSettings,
    staleTime: 30_000,
  });
}

export function settingFor(
  settings: EngagementSetting[] | undefined,
  section: EngagementSetting["section"],
): EngagementSetting {
  const fallback: Record<EngagementSetting["section"], EngagementSetting> = {
    forum: {
      section: "forum",
      label: "Askanim Forum",
      supportsReplies: true,
      replyMode: "instant",
      showViews: true,
    },
    news: {
      section: "news",
      label: "Chesed News",
      supportsReplies: false,
      replyMode: "off",
      showViews: true,
    },
  };
  return settings?.find(item => item.section === section) ?? fallback[section];
}
