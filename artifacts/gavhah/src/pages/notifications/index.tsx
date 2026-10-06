import { Link } from "wouter";
import {
  useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead,
  getListNotificationsQueryKey, getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, MessageSquare, Heart, Users, Megaphone, Star, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/context/auth-context";
import { MemberGate } from "@/components/shared/member-gate";

const TYPE_ICON: Record<string, React.ReactNode> = {
  comment: <MessageSquare className="h-4 w-4" />,
  reply: <MessageSquare className="h-4 w-4" />,
  cause_support: <Heart className="h-4 w-4" />,
  project_join: <Users className="h-4 w-4" />,
  group_activity: <Users className="h-4 w-4" />,
  volunteer_match: <Star className="h-4 w-4" />,
  announcement: <Megaphone className="h-4 w-4" />,
  help_response: <Star className="h-4 w-4" />,
  charity_update: <Heart className="h-4 w-4" />,
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { isAuthenticated, isLoaded } = useAuth();
  const { data: notifications, isLoading } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: isAuthenticated }
  });

  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      }
    });
  };

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      }
    });
  };

  if (isLoaded && !isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <MemberGate action="view your notifications">{null}</MemberGate>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Bell className="h-8 w-8 text-secondary" />
              <div>
                <h1 className="font-serif text-4xl font-bold text-primary">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-muted-foreground font-serif italic mt-1">{unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}</p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={handleMarkAll} disabled={markAll.isPending}>
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-2xl">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && notifications?.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="font-serif text-xl font-semibold text-primary mb-2">No notifications yet</p>
            <p className="text-sm">Activity from the community will appear here.</p>
          </div>
        )}

        <div className="space-y-2">
          {notifications?.map(notif => (
            <div
              key={notif.id}
              className={`relative flex items-start gap-4 p-4 rounded-xl border transition-colors ${notif.isRead ? "bg-card" : "bg-primary/5 border-primary/20"}`}
            >
              {!notif.isRead && (
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-secondary" />
              )}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${notif.isRead ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                {TYPE_ICON[notif.type] ?? <Bell className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-relaxed ${notif.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                  {notif.message}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(notif.createdAt), "MMM d, h:mm a")}
                  </span>
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkRead(notif.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                  {notif.linkUrl && (
                    <Link href={notif.linkUrl}>
                      <span className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer">
                        View <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-xs shrink-0 capitalize hidden sm:flex">
                {notif.type.replace("_", " ")}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
