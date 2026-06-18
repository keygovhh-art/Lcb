import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCheckSaved, useCreateSavedItem, useDeleteSavedItem,
  getCheckSavedQueryKey, getListSavedItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";

interface SaveButtonProps {
  contentType: string;
  contentId: number;
  contentTitle: string;
  contentUrl?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default" | "icon";
  showLabel?: boolean;
}

export function SaveButton({ contentType, contentId, contentTitle, contentUrl = "", variant = "ghost", size = "icon", showLabel = false }: SaveButtonProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoaded } = useAuth();
  const [, setLocation] = useLocation();
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const { data } = useCheckSaved(
    { contentType, contentId },
    { query: { queryKey: getCheckSavedQueryKey({ contentType, contentId }), enabled: isAuthenticated } }
  );

  useEffect(() => {
    if (data) {
      setSaved(data.saved);
      setSavedId(data.savedId ?? null);
    }
  }, [data]);

  const createSaved = useCreateSavedItem();
  const deleteSaved = useDeleteSavedItem();

  const handleToggle = () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in to save",
        description: "Join Gavhah free to save articles and resources.",
      });
      setLocation("/login");
      return;
    }
    if (saved && savedId !== null) {
      deleteSaved.mutate({ id: savedId }, {
        onSuccess: () => {
          setSaved(false);
          setSavedId(null);
          qc.invalidateQueries({ queryKey: getListSavedItemsQueryKey() });
          toast({ title: "Removed from saved" });
        },
      });
    } else {
      createSaved.mutate(
        { data: { contentType, contentId, contentTitle, contentUrl } },
        {
          onSuccess: (res) => {
            setSaved(true);
            setSavedId(res.id);
            qc.invalidateQueries({ queryKey: getListSavedItemsQueryKey() });
            toast({ title: "Saved", description: `${contentTitle} added to your saved items.` });
          },
        }
      );
    }
  };

  if (!isLoaded) return null;

  const isPending = createSaved.isPending || deleteSaved.isPending;

  return (
    <Button
      variant={saved ? "secondary" : variant}
      size={size}
      className={`gap-1.5 ${saved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
      onClick={handleToggle}
      disabled={isPending}
      title={saved ? "Remove from saved" : "Save"}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {showLabel && (saved ? "Saved" : "Save")}
    </Button>
  );
}
