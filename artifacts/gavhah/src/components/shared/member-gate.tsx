import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { Lock } from "lucide-react";

interface MemberGateProps {
  children: React.ReactNode;
  action?: string;
  compact?: boolean;
}

export function MemberGate({ children, action = "participate", compact = false }: MemberGateProps) {
  const { user, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (user) return <>{children}</>;

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed bg-muted/30">
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          <Link href="/login" className="text-secondary font-semibold hover:underline">Sign in</Link>
          {" "}or{" "}
          <Link href="/register" className="text-secondary font-semibold hover:underline">join free</Link>
          {" "}to {action}.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Lock className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-serif text-xl font-bold text-primary mb-2">Members Only</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
        Join the Gavhah community to {action}. Membership is free and open to all.
      </p>
      <div className="flex gap-3 justify-center">
        <Link href="/register">
          <Button className="bg-secondary hover:bg-secondary/90 text-white font-serif">Join Free</Button>
        </Link>
        <Link href="/login">
          <Button variant="outline" className="font-serif">Sign In</Button>
        </Link>
      </div>
    </div>
  );
}
