import { useState } from "react";
import { Link } from "wouter";
import { useListGroups, useJoinGroup, getListGroupsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Users, Lock, Globe, KeyRound, MessageCircle } from "lucide-react";

export default function GroupsList() {
  const [search, setSearch] = useState("");
  const [privacy, setPrivacy] = useState("");
  const qc = useQueryClient();

  const params = { search: search || undefined, privacy: privacy || undefined };
  const { data: groups, isLoading } = useListGroups(params, {
    query: { queryKey: getListGroupsQueryKey(params) },
  });
  const join = useJoinGroup();

  const privacyIcon = (p: string) => {
    if (p === "private") return <Lock className="h-4 w-4 text-muted-foreground" />;
    if (p === "password_protected") return <KeyRound className="h-4 w-4 text-muted-foreground" />;
    return <Globe className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Community Groups</h1>
              <p className="text-muted-foreground font-serif italic">
                Join organizations, neighborhoods, and cause groups across the global Jewish community.
              </p>
            </div>
            <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Create Group
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-11"
              placeholder="Search groups..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {[{ value: "", label: "All" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }].map(opt => (
              <Button
                key={opt.value}
                variant={privacy === opt.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setPrivacy(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-6 space-y-4">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups?.map(group => (
              <div key={group.id} className="bg-card border rounded-xl overflow-hidden hover:border-primary/20 hover:shadow-md transition-all flex flex-col">
                <div className="aspect-[3/1] bg-gradient-to-br from-primary/10 to-secondary/10 relative flex items-center justify-center">
                  {group.imageUrl ? (
                    <img src={group.imageUrl} alt={group.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="font-serif font-bold text-primary text-xl">{group.name[0]}</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className="bg-background/90 backdrop-blur px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                      {privacyIcon(group.privacy)}
                      <span className="text-foreground capitalize">{group.privacy.replace("_", " ")}</span>
                    </span>
                  </div>
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-serif font-bold text-primary text-lg mb-1">{group.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{group.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {group.memberCount} members</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {group.postCount} posts</span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/groups/${group.id}`} className="flex-1">
                      <Button variant="outline" className="w-full text-sm">View Group</Button>
                    </Link>
                    <Button
                      className="flex-1 text-sm bg-secondary hover:bg-secondary/90 text-white"
                      onClick={() => join.mutate({ id: group.id }, {
                        onSuccess: () => qc.invalidateQueries({ queryKey: getListGroupsQueryKey(params) })
                      })}
                      disabled={join.isPending}
                    >
                      Join
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {groups?.length === 0 && (
              <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20">
                <p className="font-serif italic text-muted-foreground">No groups found.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
