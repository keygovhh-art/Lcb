import {
  useGetUserDashboard, useListDiscussions, useListNotifications, useMarkAllNotificationsRead, useListGroups,
  getGetUserDashboardQueryKey, getListDiscussionCommentsQueryKey, getListNotificationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Bell, MessageSquare, Users, Heart, BookmarkCheck, Activity, CheckCheck } from "lucide-react";
import { format } from "date-fns";

export default function MyGavhah() {
  const qc = useQueryClient();
  const userId = 1;

  const { data: dashboard } = useGetUserDashboard(userId, {
    query: { queryKey: getGetUserDashboardQueryKey(userId) },
  });
  const { data: notifications } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey() },
  });

  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const notifTypeIcon = (type: string) => {
    if (type === "reply" || type === "group_activity") return <MessageSquare className="h-4 w-4" />;
    if (type === "volunteer_match") return <Heart className="h-4 w-4" />;
    return <Bell className="h-4 w-4" />;
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <h1 className="font-serif text-4xl font-bold text-primary mb-2">My Gavhah</h1>
          <p className="text-muted-foreground font-serif italic">Your personal community dashboard.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "My Discussions", value: dashboard?.discussionCount ?? 0, icon: <MessageSquare className="h-5 w-5 text-secondary" /> },
            { label: "My Groups", value: dashboard?.groupCount ?? 0, icon: <Users className="h-5 w-5 text-secondary" /> },
            { label: "Notifications", value: unreadCount, icon: <Bell className="h-5 w-5 text-secondary" /> },
            { label: "Saved Items", value: dashboard?.savedCount ?? 0, icon: <BookmarkCheck className="h-5 w-5 text-secondary" /> },
          ].map((stat, i) => (
            <div key={i} className="bg-card border rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                {stat.icon}
              </div>
              <div>
                <div className="text-2xl font-serif font-bold text-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList className="bg-muted/50 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" /> Notifications
              {unreadCount > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="discussions" className="gap-2"><MessageSquare className="h-4 w-4" /> My Discussions</TabsTrigger>
            <TabsTrigger value="groups" className="gap-2"><Users className="h-4 w-4" /> My Groups</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><Activity className="h-4 w-4" /> Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-primary">Notifications</h2>
              {unreadCount > 0 && (
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => markAllRead.mutate({}, {
                    onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
                  })}
                  disabled={markAllRead.isPending}
                >
                  <CheckCheck className="h-4 w-4" /> Mark all read
                </Button>
              )}
            </div>
            {notifications?.map(notif => (
              <div key={notif.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${!notif.isRead ? "bg-accent/5 border-accent/20" : "bg-card"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!notif.isRead ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>
                  {notifTypeIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!notif.isRead ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {notif.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(notif.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
                {!notif.isRead && (
                  <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
                )}
              </div>
            ))}
            {notifications?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
                No notifications yet.
              </div>
            )}
          </TabsContent>

          <TabsContent value="discussions" className="space-y-4">
            <h2 className="font-serif text-xl font-bold text-primary">My Discussions</h2>
            {dashboard?.recentDiscussions?.map(disc => (
              <Link key={disc.id} href={`/forum/${disc.id}`}>
                <div className="bg-card border rounded-xl p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                  <h3 className="font-serif font-bold text-primary mb-1">{disc.title}</h3>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="capitalize">{disc.category}</span>
                    <span>{disc.likes} likes · {disc.commentCount} replies</span>
                  </div>
                </div>
              </Link>
            ))}
            {(dashboard?.recentDiscussions?.length === 0 || !dashboard?.recentDiscussions) && (
              <div className="text-center py-12 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground font-serif italic mb-4">You have not started any discussions yet.</p>
                <Link href="/forum/new">
                  <Button className="bg-secondary hover:bg-secondary/90 text-white">Start a Discussion</Button>
                </Link>
              </div>
            )}
          </TabsContent>

          <TabsContent value="groups" className="space-y-4">
            <h2 className="font-serif text-xl font-bold text-primary">My Groups</h2>
            {dashboard?.recentGroups?.map(group => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <div className="bg-card border rounded-xl p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                  <h3 className="font-serif font-bold text-primary mb-1">{group.name}</h3>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="capitalize">{group.privacy.replace("_", " ")}</span>
                    <span>{group.memberCount} members</span>
                  </div>
                </div>
              </Link>
            ))}
            {(dashboard?.recentGroups?.length === 0 || !dashboard?.recentGroups) && (
              <div className="text-center py-12 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground font-serif italic mb-4">You have not joined any groups yet.</p>
                <Link href="/groups">
                  <Button className="bg-secondary hover:bg-secondary/90 text-white">Browse Groups</Button>
                </Link>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-primary">Recent Activity</h2>
            <div className="text-center py-12 border rounded-xl bg-muted/20">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-serif italic">Activity history will appear here.</p>
              <Link href="/directory">
                <Button className="mt-4 bg-secondary hover:bg-secondary/90 text-white">Get Involved</Button>
              </Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
