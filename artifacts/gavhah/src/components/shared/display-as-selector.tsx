import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";

export type DisplayAs = "nickname" | "realname" | "anonymous";

interface DisplayAsSelectorProps {
  value: DisplayAs;
  onChange: (value: DisplayAs) => void;
}

export function getDisplayName(displayAs: DisplayAs, user: { name?: string | null; nickname?: string | null } | null): string {
  if (!user) return "Anonymous";
  if (displayAs === "anonymous") return "Anonymous";
  if (displayAs === "realname") return user.name || user.nickname || "Anonymous";
  return user.nickname || user.name || "Anonymous";
}

export function DisplayAsSelector({ value, onChange }: DisplayAsSelectorProps) {
  const { user } = useAuth();
  if (!user) return null;

  const hasRealName = user.name && user.name !== (user as any).nickname;

  const options: { id: DisplayAs; label: string; sub: string }[] = [
    ...(hasRealName ? [{ id: "realname" as DisplayAs, label: user.name!, sub: "Your full name" }] : []),
    { id: "nickname", label: (user as any).nickname || user.name || "Nickname", sub: "Your community nickname" },
    { id: "anonymous", label: "Anonymous", sub: "No name shown" },
  ];

  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">Display As</Label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
              value === opt.id
                ? "border-secondary bg-secondary/5 text-secondary"
                : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            <span className="text-sm font-semibold leading-tight">{opt.label}</span>
            <span className="text-xs opacity-70">{opt.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
