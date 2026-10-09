import { ArrowBigUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  active: boolean;
  count?: number;
  pending?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  title?: string;
  className?: string;
};

export function UpvoteButton({
  active,
  count,
  pending = false,
  onClick,
  label,
  title,
  className = "",
}: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Button
        type="button"
        variant={active ? "secondary" : "ghost"}
        size="icon"
        className={active ? "text-primary" : "text-muted-foreground hover:text-primary"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick(event);
        }}
        disabled={pending}
        title={title || (active ? "Remove upvote" : "Upvote")}
        aria-pressed={active}
      >
        <ArrowBigUp className="h-4 w-4" />
      </Button>
      {typeof count === "number" && (
        <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
      )}
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}
