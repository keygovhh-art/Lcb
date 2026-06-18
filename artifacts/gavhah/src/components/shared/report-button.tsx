import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreateReport, getListReportsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface ReportButtonProps {
  contentType: string;
  contentId: number;
  variant?: "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  label?: string;
}

const REASONS = [
  { value: "spam", label: "Spam or irrelevant" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misinformation", label: "Misinformation" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "other", label: "Other" },
];

export function ReportButton({ contentType, contentId, variant = "ghost", size = "sm", label }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const createReport = useCreateReport();

  function handleClose() {
    setOpen(false);
    setReason("");
    setDescription("");
  }

  function handleOpen() {
    if (!isAuthenticated) {
      toast({ title: "Sign in to report content", description: "Join Gavhah free to help moderate the community." });
      setLocation("/login");
      return;
    }
    setOpen(true);
  }

  const handleSubmit = () => {
    if (!reason) return;
    createReport.mutate(
      { data: { contentType, contentId, reason, description } },
      {
        onSuccess: () => {
          handleClose();
          qc.invalidateQueries({ queryKey: getListReportsQueryKey({}) });
          toast({ title: "Report submitted", description: "Our moderation team will review this." });
        },
      }
    );
  };

  return (
    <>
      <Button variant={variant} size={size} className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={handleOpen}>
        <Flag className="h-3.5 w-3.5" />
        {label ?? "Report"}
      </Button>

      <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else setOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Submit a Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Reason</p>
              <div className="space-y-2">
                {REASONS.map(r => (
                  <Label
                    key={r.value}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors",
                      reason === r.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{r.label}</span>
                  </Label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Additional details (optional)</p>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue..."
                className="resize-none min-h-20"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!reason || createReport.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {createReport.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
