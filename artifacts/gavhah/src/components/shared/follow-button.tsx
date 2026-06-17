import { useEffect, useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCheckFollow, useCreateFollow, useDeleteFollow,
  getCheckFollowQueryKey, getListFollowsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface FollowButtonProps {
  entityType: string;
  entityId: number;
  entityTitle: string;
  entityUrl?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
}

export function FollowButton({ entityType, entityId, entityTitle, entityUrl = "", variant = "outline", size = "sm" }: FollowButtonProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [followId, setFollowId] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);

  const { data } = useCheckFollow(
    { entityType, entityId },
    { query: { queryKey: getCheckFollowQueryKey({ entityType, entityId }) } }
  );

  useEffect(() => {
    if (data) {
      setFollowing(data.following);
      setFollowId(data.followId ?? null);
    }
  }, [data]);

  const createFollow = useCreateFollow();
  const deleteFollow = useDeleteFollow();

  const handleToggle = () => {
    if (following && followId !== null) {
      deleteFollow.mutate({ id: followId }, {
        onSuccess: () => {
          setFollowing(false);
          setFollowId(null);
          qc.invalidateQueries({ queryKey: getListFollowsQueryKey() });
          toast({ title: "Unfollowed", description: `You are no longer following ${entityTitle}.` });
        },
      });
    } else {
      createFollow.mutate(
        { data: { entityType, entityId, entityTitle, entityUrl } },
        {
          onSuccess: (res) => {
            setFollowing(true);
            setFollowId(res.id);
            qc.invalidateQueries({ queryKey: getListFollowsQueryKey() });
            toast({ title: "Following", description: `You are now following ${entityTitle}.` });
          },
        }
      );
    }
  };

  const isPending = createFollow.isPending || deleteFollow.isPending;

  return (
    <Button
      variant={following ? "secondary" : variant}
      size={size}
      className="gap-1.5"
      onClick={handleToggle}
      disabled={isPending}
    >
      {following ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
