import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, Clock, CheckCircle, X, ChevronLeft, ChevronRight, User } from "lucide-react";

const HOURS = ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Availability = {
  reservationDate: string;
  reservationTime: string;
};

type Reservation = {
  id: number;
  name: string;
  reservationDate: string;
  reservationTime: string;
  purpose: string;
  notes?: string | null;
  status: string;
  createdAt: string;
};

function Calendar({
  selected,
  onSelect,
  bookedDates,
}: {
  selected: string;
  onSelect: (d: string) => void;
  bookedDates: Set<string>;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const dateStr = (day: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const isClosedDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day).getDay();
    return d === 5 || d === 6;
  };
  const isPast = (day: number) => new Date(viewYear, viewMonth, day) < today;

  const prev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };
  const next = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-serif font-bold text-primary">{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={next} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className={`text-center text-xs font-semibold py-1 ${d === "Fri" || d === "Sat" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = dateStr(day);
          const disabled = isClosedDay(day) || isPast(day);
          const booked = bookedDates.has(ds);
          const isSelected = selected === ds;
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => !disabled && onSelect(ds)}
              className={`aspect-square flex items-center justify-center text-xs rounded-lg transition-colors ${
                disabled ? "text-muted-foreground/30 cursor-not-allowed" :
                isSelected ? "bg-secondary text-white font-bold" :
                booked ? "bg-accent/20 text-foreground hover:bg-accent/30" :
                "hover:bg-primary/10 text-foreground"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-accent/20" /> Has bookings</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-secondary" /> Selected</div>
      </div>
    </div>
  );
}

export default function Reservations() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [form, setForm] = useState({ name: "", purpose: "", notes: "" });
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [myBookings, setMyBookings] = useState<Reservation[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAvailability = async () => {
    try {
      const res = await fetch("/api/reservations/availability");
      if (res.ok) setAvailability(await res.json());
    } catch {}
  };

  const loadMyBookings = async () => {
    if (!isAuthenticated) {
      setMyBookings([]);
      return;
    }
    try {
      const res = await fetch("/api/reservations", { credentials: "include" });
      if (res.ok) setMyBookings(await res.json());
    } catch {}
  };

  useEffect(() => {
    void loadAvailability();
    void loadMyBookings();
  }, [isAuthenticated]);

  const bookedDates = useMemo(
    () => new Set(availability.map(a => a.reservationDate)),
    [availability]
  );

  const bookedSlots = useMemo(
    () => selectedDate
      ? availability.filter(a => a.reservationDate === selectedDate).map(a => a.reservationTime)
      : [],
    [availability, selectedDate]
  );

  const available = HOURS.filter(h => !bookedSlots.includes(h));

  const handleBookClick = () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to book a slot", description: "Join Gavhah free to make reservations." });
      return;
    }
    setForm(f => ({ ...f, name: f.name || user?.nickname || user?.name || "" }));
    setBookingOpen(true);
  };

  const confirmReservation = async () => {
    if (!form.name.trim() || !form.purpose || !selectedDate || !selectedTime) {
      toast({ title: "Please complete the required fields", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          reservationDate: selectedDate,
          reservationTime: selectedTime,
          purpose: form.purpose,
          notes: form.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: res.status === 409 ? "That slot was just taken" : "Could not save reservation",
          description: body.error,
          variant: "destructive",
        });
        await loadAvailability();
        return;
      }

      setBookingOpen(false);
      setSelectedTime("");
      setForm({ name: user?.nickname || user?.name || "", purpose: "", notes: "" });
      await Promise.all([loadAvailability(), loadMyBookings()]);
      toast({ title: "Reservation confirmed", description: "Your appointment is now saved." });
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async (id: number) => {
    const res = await fetch(`/api/reservations/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      await Promise.all([loadAvailability(), loadMyBookings()]);
      toast({ title: "Reservation cancelled" });
    } else {
      toast({ title: "Could not cancel reservation", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <CalendarDays className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">Gavhah Office Reservations</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11 max-w-xl">
            Schedule time with the Gavhah team. Office hours: Sunday–Thursday, 9:00 AM – 5:00 PM.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <h2 className="font-serif text-xl font-bold text-primary">Select a Date</h2>
            <Calendar selected={selectedDate} onSelect={d => { setSelectedDate(d); setSelectedTime(""); }} bookedDates={bookedDates} />
          </div>

          <div className="lg:col-span-2 space-y-6">
            {!selectedDate ? (
              <div className="border rounded-xl bg-muted/20 p-16 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-serif text-muted-foreground italic">Select a date to view available time slots.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-serif text-xl font-bold text-primary">
                    Available Times — {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </h2>
                  <Badge variant="outline">{available.length} slots available</Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {HOURS.map(h => {
                    const isBooked = bookedSlots.includes(h);
                    const isSelected = selectedTime === h;
                    return (
                      <button
                        key={h}
                        disabled={isBooked}
                        onClick={() => !isBooked && setSelectedTime(h)}
                        className={`rounded-xl py-3 text-sm font-medium border transition-all ${
                          isBooked ? "bg-muted/50 text-muted-foreground/40 cursor-not-allowed border-transparent" :
                          isSelected ? "bg-secondary text-white border-secondary shadow-md" :
                          "bg-card hover:border-secondary/40 hover:bg-secondary/5 text-foreground"
                        }`}
                      >
                        {isBooked ? <span className="flex items-center justify-center gap-1"><X className="h-3 w-3" />{h}</span> : h}
                      </button>
                    );
                  })}
                </div>

                {selectedTime && (
                  <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground mb-1">Selected Appointment</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />
                            {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                          </span>
                          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {selectedTime}</span>
                        </div>
                      </div>
                      <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0" onClick={handleBookClick}>
                        <CheckCircle className="h-4 w-4" /> Book This Slot
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl text-primary">Confirm Reservation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="bg-muted/40 rounded-lg p-4 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="h-4 w-4 text-secondary" />
                      <span className="font-semibold">{selectedDate ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-secondary" />
                      <span className="font-semibold">{selectedTime} (30 minutes)</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Your Name</Label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Purpose of Visit</Label>
                    <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consultation">Consultation</SelectItem>
                        <SelectItem value="case_review">Case Review</SelectItem>
                        <SelectItem value="planning">Community Planning</SelectItem>
                        <SelectItem value="training">Training / Onboarding</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Additional Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any details we should know..." className="resize-none" />
                  </div>
                  <Button
                    className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2"
                    onClick={confirmReservation}
                    disabled={saving}
                  >
                    <CheckCircle className="h-5 w-5" /> {saving ? "Saving..." : "Confirm Reservation"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <h3 className="font-serif text-xl font-bold text-primary">My Reservations</h3>
              </div>
              {!isAuthenticated ? (
                <div className="border rounded-xl bg-muted/20 p-6 text-sm text-muted-foreground">
                  Sign in to view and manage your reservations.
                </div>
              ) : myBookings.length === 0 ? (
                <div className="border rounded-xl bg-muted/20 p-6 text-sm text-muted-foreground">
                  No reservations yet.
                </div>
              ) : myBookings.map(b => (
                <div key={b.id} className="bg-card border rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground text-sm">
                        {new Date(b.reservationDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      </span>
                      <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="capitalize text-xs">
                        {b.status === "confirmed" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {b.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {b.reservationTime} · {b.purpose.replace("_", " ")}
                    </p>
                  </div>
                  {b.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-destructive hover:text-destructive border-destructive/20 text-xs"
                      onClick={() => void cancelReservation(b.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
