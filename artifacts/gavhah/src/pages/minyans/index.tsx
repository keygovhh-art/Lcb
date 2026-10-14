import { useState } from "react";
import { useListMinyans, useLikeMinyan, getListMinyansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, Heart, MapPin, Clock, Plus, X } from "lucide-react";
import { useCreateMinyan } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { ActiveAccountIdentity } from "@/components/shared/account-switcher";
import { MemberGate } from "@/components/shared/member-gate";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type Prayer = "shacharis" | "mincha" | "maariv";
type Entry = { time: string; days: number[] };
type PrayerTimes = Record<Prayer, Entry[]>;
const EVERY_WEEKDAY = [0,1,2,3,4,5];
const DAY_NAMES = ["זונטאג","מאנטאג","דינסטאג","מיטוואך","דאנערשטאג","פרייטאג"];
const freshEntry = (): Entry => ({ time: "", days: [...EVERY_WEEKDAY] });
const freshTimes = (): PrayerTimes => ({ shacharis: [freshEntry()], mincha: [freshEntry()], maariv: [freshEntry()] });
const PRAYERS: Array<{ key: Prayer; label: string; hint: string }> = [
  { key: "shacharis", label: "שחרית", hint: "6:30 אינדערפרי" },
  { key: "mincha", label: "מנחה", hint: "2:00 נאכמיטאג" },
  { key: "maariv", label: "מעריב", hint: "9:00 ביינאכט" },
];
const timeEntries = (lines: Entry[]): string => lines.map(v => v.time.trim()).filter(Boolean).join("\n");
const preparedSchedule = (times: PrayerTimes): PrayerTimes =>
  Object.fromEntries((["shacharis","mincha","maariv"] as Prayer[]).map(key =>
    [key,times[key].filter(v => v.time.trim()).map(v=>({time:v.time.trim(),days:[...v.days].sort((a,b)=>a-b)}))],
  )) as PrayerTimes;

function AddMinyanDialog({ onSuccess }: { onSuccess: () => void }) {
  const { isAuthenticated, isLoaded } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    synagogueName: "", city: "", country: "USA",
    address: "", notes: "",
  });
  const [times, setTimes] = useState<PrayerTimes>(freshTimes);
  const [validationError, setValidationError] = useState("");
  const create = useCreateMinyan();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const changeTime = (key: Prayer, index: number, value: string) => {
    setTimes(old => ({ ...old, [key]: old[key].map((item, i) => i === index ? {...item,time:value} : item) }));
    setValidationError("");
  };
  const toggleDay = (key: Prayer,index:number,day:number) => {
    setTimes(old=>({...old,[key]:old[key].map((entry,i)=>{
      if(i!==index)return entry;
      const days=entry.days.includes(day)?entry.days.filter(d=>d!==day):[...entry.days,day];
      return {...entry,days};
    })}));
    setValidationError("");
  };
  const setAllDays = (key: Prayer,index:number) => {
    setTimes(old=>({...old,[key]:old[key].map((entry,i)=>i===index?{...entry,days:[...EVERY_WEEKDAY]}:entry)}));
  };
  const addTime = (key: Prayer) => setTimes(old =>
    old[key].length >= 24 ? old : { ...old, [key]: [...old[key], freshEntry()] }
  );
  const removeTime = (key: Prayer, index: number) => setTimes(old => ({
    ...old, [key]: old[key].length === 1 ? [freshEntry()] : old[key].filter((_, i) => i !== index),
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const shacharis = timeEntries(times.shacharis);
    const mincha = timeEntries(times.mincha);
    const maariv = timeEntries(times.maariv);
    if (!shacharis && !mincha && !maariv) {
      setValidationError("מען מוז אויספילן לכל הפחות איין זמן — שחרית, מנחה אדער מעריב.");
      return;
    }
    const weekdaySchedules=preparedSchedule(times);
    if ((["shacharis","mincha","maariv"] as Prayer[]).some(key=>weekdaySchedules[key].some(entry=>entry.days.length===0))) {
      setValidationError("ביי יעדן מנין מוז מען אויסקלייבן לכל הפחות איין וואכנטאג.");
      return;
    }
    setValidationError("");
    create.mutate({ data: { ...form, shacharis, mincha, maariv, weekdaySchedules } }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ synagogueName: "", city: "", country: "USA", address: "", notes: "" });
        setTimes(freshTimes());
        setValidationError("");
        onSuccess();
        toast({
          title: "Minyan submitted",
          description: "It is pending review and will appear publicly after approval.",
        });
      },
      onError: () => toast({
        title: "Could not submit minyan",
        description: "Please check the required fields and try again.",
        variant: "destructive",
      }),
    });
  };

  if (isLoaded && !isAuthenticated) {
    return <MemberGate gate="minyans" compact action="add a minyan">{null}</MemberGate>;
  }

  return (
    <>
      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Minyan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Add a Minyan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <ActiveAccountIdentity label="Submitting as account" />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="font-semibold">Synagogue Name *</Label>
                <Input value={form.synagogueName} onChange={set("synagogueName")} placeholder="Beis Medrash..." className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Country</Label>
                <Input value={form.country} onChange={set("country")} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">City *</Label>
                <Input value={form.city} onChange={set("city")} placeholder="Brooklyn" className="h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Address</Label>
                <Input value={form.address} onChange={set("address")} placeholder="123 Main St" className="h-11" />
              </div>
            </div>
            <div className="space-y-5">
              <p className="text-sm font-medium text-foreground">
                זמני מנינים — לכל הפחות איינס פון די דריי תפילות מוז זיין אויסגעפילט.
              </p>
              {PRAYERS.map(({ key, label, hint }) => (
                <div key={key} className="rounded-xl border bg-muted/20 p-3 space-y-3">
                  <div className="flex justify-between items-center gap-2">
                    <Label className="font-semibold text-base">{label}</Label>
                    <span className="text-xs text-muted-foreground">נישט מחויב אויב אן אנדער זמן איז אויסגעפילט</span>
                  </div>
                  {times[key].map((entry, index) => (
                    <div key={index} className="space-y-2 rounded-lg border bg-background/80 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={entry.time}
                          onChange={e => changeTime(key, index, e.target.value)}
                          placeholder={hint}
                          aria-label={`${label} — מנין ${index + 1}`}
                          maxLength={100}
                          className="h-11 min-w-0 flex-1"
                          dir="auto"
                        />
                        {times[key].length > 1 && (
                          <Button type="button" size="icon" variant="outline"
                            aria-label={`נעם אראפ ${label} מנין ${index + 1}`}
                            onClick={() => removeTime(key, index)} className="shrink-0 h-11 w-11">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-semibold">וועלכע טעג איז דער מנין?</span>
                          <button type="button" onClick={() => setAllDays(key,index)}
                            className="text-xs underline underline-offset-4 text-secondary">יעדן וואכנטאג</button>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="group"
                          aria-label={`${label} מנין ${index+1} וואכנטעג`}>
                          {DAY_NAMES.map((dayName,dayIndex) => (
                            <button key={dayName} type="button" aria-pressed={entry.days.includes(dayIndex)}
                              onClick={() => toggleDay(key,index,dayIndex)}
                              className={`min-h-10 rounded-lg border text-xs font-medium px-1 ${entry.days.includes(dayIndex)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground hover:bg-muted"}`}>
                              {dayName}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm"
                    className="gap-2 h-10 w-full sm:w-auto"
                    onClick={() => addTime(key)} disabled={times[key].length >= 24}>
                    <Plus className="h-4 w-4" /> + לייג צו נאך א מנין
                  </Button>
                </div>
              ))}
              {validationError && <p role="alert" className="text-sm text-destructive font-semibold">{validationError}</p>}
              <div className="space-y-1.5">
                <Label className="font-semibold">Additional Notes</Label>
                <Textarea value={form.notes} onChange={set("notes")} placeholder="ספעציעלע אנווייזונגען אדער פרטים..." className="resize-none" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12" disabled={create.isPending}>
              {create.isPending ? "Submitting..." : "Submit for Review"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">Submissions are reviewed before appearing publicly.</p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Minyans() {
  const [city, setCity] = useState("");
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const params = { city: city || undefined };
  const { data: minyans, isLoading } = useListMinyans(params, {
    query: { queryKey: getListMinyansQueryKey(params) },
  });
  const like = useLikeMinyan();

  const refresh = () => qc.invalidateQueries({ queryKey: getListMinyansQueryKey(params) });

  const handleLike = (id: number) => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to like a minyan", description: "Join Gavhah free to support your favourite minyanim." });
      setLocation("/login");
      return;
    }
    like.mutate({ id }, { onSuccess: refresh });
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Minyan Center</h1>
              <p className="text-muted-foreground font-serif italic">
                Find minyan times for synagogues worldwide — contributed by the community.
              </p>
            </div>
            <AddMinyanDialog onSuccess={refresh} />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-11"
              placeholder="Search by city..."
              value={city}
              onChange={e => setCity(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-6 space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {minyans?.map(minyan => (
              <div key={minyan.id} className="bg-card border rounded-xl p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-serif font-bold text-primary text-xl mb-1">{minyan.synagogueName}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {minyan.city}, {minyan.country}
                      </span>
                    </div>
                    {minyan.address && (
                      <p className="text-xs text-muted-foreground mt-1">{minyan.address}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleLike(minyan.id)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-secondary transition-colors shrink-0"
                    disabled={like.isPending}
                  >
                    <Heart className="h-4 w-4" />
                    <span>{minyan.likes}</span>
                  </button>
                </div>

                <div className="bg-muted/40 rounded-lg p-4 space-y-3">
                  {PRAYERS.filter(({ key }) => Boolean(minyan[key]?.trim())).map(({ key, label }) => (
                    <div key={key} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                        <Clock className="h-3 w-3 text-primary" />
                      </div>
                      <div className="text-sm min-w-0 flex-1">
                        <span className="font-semibold text-foreground">{label}:</span>
                        <div className="space-y-1 mt-1">
                          {(minyan.weekdaySchedules?.[key] || minyan[key].split(/\r?\n/).filter(Boolean)
                            .map((time:string) => ({time, days:[...EVERY_WEEKDAY]}))).map((entry, i) =>
                            <div key={i} className="rounded-lg bg-background/60 px-2 py-2 space-y-1">
                              <p className="text-foreground font-medium break-words" dir="auto">{entry.time}</p>
                              <p className="text-xs text-muted-foreground" dir="rtl">
                                {entry.days.length===6 ? "יעדן וואכנטאג" :
                                  entry.days.map((day:number)=>DAY_NAMES[day]).filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {minyan.notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2 mt-2 italic">{minyan.notes}</p>
                  )}
                </div>
              </div>
            ))}
            {minyans?.length === 0 && (
              <div className="col-span-full text-center py-16 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground font-serif italic mb-4">No minyanim found for this search.</p>
                <AddMinyanDialog onSuccess={refresh} />
              </div>
            )}
          </div>
        )}

        <div className="text-center py-4 text-sm text-muted-foreground space-y-3">
          <p>Showing {minyans?.length ?? 0} minyanim · Know a minyan that's missing?</p>
          <div className="flex justify-center">
            <AddMinyanDialog onSuccess={refresh} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
