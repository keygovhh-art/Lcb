import { useState } from "react";
import {
  useListVolunteers, useListHelpRequests, useGetFeaturedVolunteers, useGetFeaturedRequests,
  getListVolunteersQueryKey, getListHelpRequestsQueryKey, getGetFeaturedVolunteersQueryKey, getGetFeaturedRequestsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Users, HandHeart, MapPin, Clock, Star, AlertTriangle, AlertCircle, Minus } from "lucide-react";

const URGENCY_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", color: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  high: { label: "High", color: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
  medium: { label: "Medium", color: "default", icon: <Minus className="h-3 w-3" /> },
  low: { label: "Low", color: "outline", icon: <Minus className="h-3 w-3" /> },
};

const NEED_LABELS: Record<string, string> = {
  medical: "Medical", wedding: "Wedding / Simcha",
  food: "Food Assistance", housing: "Housing",
  transportation: "Transportation", financial: "Financial", other: "Other",
};

function VolunteerCard({ vol }: { vol: any }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-xl shrink-0">
              {vol.userName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{vol.userName}</span>
                {vol.isFeatured && <Star className="h-4 w-4 text-accent fill-accent" />}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <MapPin className="h-3 w-3" /> {vol.location}
              </div>
              <div className="flex flex-wrap gap-1">
                {(vol.skills || []).slice(0, 3).map((skill: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">{skill}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground border-t pt-3">
            <Clock className="h-3 w-3" /> {vol.availability}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-primary">{vol.userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <MapPin className="h-4 w-4" /> {vol.location}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" /> Available: {vol.availability}
          </div>
          {vol.skills?.length > 0 && (
            <div>
              <p className="font-semibold text-foreground text-sm mb-2">Skills</p>
              <div className="flex flex-wrap gap-2">
                {vol.skills.map((s: string, i: number) => (
                  <Badge key={i} variant="outline">{s}</Badge>
                ))}
              </div>
            </div>
          )}
          {vol.areasOfInterest?.length > 0 && (
            <div>
              <p className="font-semibold text-foreground text-sm mb-2">Areas of Interest</p>
              <div className="flex flex-wrap gap-2">
                {vol.areasOfInterest.map((a: string, i: number) => (
                  <Badge key={i} className="bg-secondary/10 text-secondary border-secondary/20">{a}</Badge>
                ))}
              </div>
            </div>
          )}
          {vol.labels?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {vol.labels.map((l: string, i: number) => (
                <Badge key={i} className="bg-accent/20 text-accent-foreground">{l}</Badge>
              ))}
            </div>
          )}
          <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
            Contact Volunteer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpRequestCard({ req }: { req: any }) {
  const urgency = URGENCY_MAP[req.urgency] ?? URGENCY_MAP.medium;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant={urgency.color as any} className="gap-1 text-xs">
                  {urgency.icon} {urgency.label}
                </Badge>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
                  {NEED_LABELS[req.needType] || req.needType}
                </span>
              </div>
              <p className="font-semibold text-foreground">{req.name}</p>
            </div>
            {req.isFeatured && <Star className="h-4 w-4 text-accent fill-accent shrink-0" />}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{req.description}</p>
          <div className="flex items-center justify-between pt-2 border-t">
            <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize text-xs">
              {req.status}
            </Badge>
            <span className="text-xs text-muted-foreground">Contact via Gavhah</span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-primary">Help Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant={urgency.color as any} className="gap-1">
              {urgency.icon} {urgency.label} Urgency
            </Badge>
            <Badge variant="outline">{NEED_LABELS[req.needType] || req.needType}</Badge>
            <Badge variant={req.status === "open" ? "default" : "secondary"} className="capitalize">
              {req.status}
            </Badge>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">{req.name}</p>
            <p className="text-foreground leading-relaxed">{req.description}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
            To maintain privacy, all contact is handled through Gavhah administrators.
          </div>
          <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
            I Can Help With This
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Directory() {
  const [volSearch, setVolSearch] = useState("");
  const [reqType, setReqType] = useState("");

  const volParams = { search: volSearch || undefined };
  const reqParams = { type: reqType || undefined };

  const { data: volunteers, isLoading: volLoading } = useListVolunteers(volParams, {
    query: { queryKey: getListVolunteersQueryKey(volParams) },
  });
  const { data: requests, isLoading: reqLoading } = useListHelpRequests(reqParams, {
    query: { queryKey: getListHelpRequestsQueryKey(reqParams) },
  });
  const { data: featuredVols } = useGetFeaturedVolunteers({
    query: { queryKey: getGetFeaturedVolunteersQueryKey() },
  });
  const { data: featuredReqs } = useGetFeaturedRequests({
    query: { queryKey: getGetFeaturedRequestsQueryKey() },
  });

  const NEED_TYPES = [
    { value: "", label: "All" },
    { value: "medical", label: "Medical" },
    { value: "wedding", label: "Wedding" },
    { value: "food", label: "Food" },
    { value: "housing", label: "Housing" },
    { value: "transportation", label: "Transport" },
    { value: "financial", label: "Financial" },
  ];

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <h1 className="font-serif text-4xl font-bold text-primary mb-2">Activists Directory</h1>
          <p className="text-muted-foreground font-serif italic">
            Connect volunteers with families in need across the global Jewish community.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="volunteers" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1">
            <TabsTrigger value="volunteers" className="gap-2 px-6 py-2.5">
              <Users className="h-4 w-4" /> Volunteers
              {volunteers && <span className="ml-1 text-xs text-muted-foreground">({volunteers.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 px-6 py-2.5">
              <HandHeart className="h-4 w-4" /> Help Requests
              {requests && <span className="ml-1 text-xs text-muted-foreground">({requests.length})</span>}
            </TabsTrigger>
          </TabsList>

          {/* Volunteers Tab */}
          <TabsContent value="volunteers" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10 h-11"
                  placeholder="Search volunteers by name..."
                  value={volSearch}
                  onChange={e => setVolSearch(e.target.value)}
                />
              </div>
              <Button className="bg-secondary hover:bg-secondary/90 text-white">
                Register as Volunteer
              </Button>
            </div>

            {featuredVols && featuredVols.length > 0 && !volSearch && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-accent fill-accent" />
                  <h3 className="font-serif font-bold text-primary">Featured Volunteers</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {featuredVols.map((vol: any) => <VolunteerCard key={vol.id} vol={vol} />)}
                </div>
                <hr />
              </div>
            )}

            {volLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
                    <div className="flex gap-3">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {volunteers?.map((vol: any) => <VolunteerCard key={vol.id} vol={vol} />)}
                {volunteers?.length === 0 && (
                  <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                    No volunteers found.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Help Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex gap-2 flex-wrap">
                {NEED_TYPES.map(t => (
                  <Button
                    key={t.value}
                    variant={reqType === t.value ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setReqType(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
              <Button className="sm:ml-auto bg-secondary hover:bg-secondary/90 text-white shrink-0">
                Submit a Request
              </Button>
            </div>

            {featuredReqs && featuredReqs.length > 0 && !reqType && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="font-serif font-bold text-primary">Urgent Needs</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {featuredReqs.map((req: any) => <HelpRequestCard key={req.id} req={req} />)}
                </div>
                <hr />
              </div>
            )}

            {reqLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {requests?.map((req: any) => <HelpRequestCard key={req.id} req={req} />)}
                {requests?.length === 0 && (
                  <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                    No help requests found.
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
