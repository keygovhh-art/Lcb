import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateReport, getListReportsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  const createReport = useCreateReport();

  const handleSubmit = () => {
    if (!reason) return;
    createReport.mutate(
      { data: { contentType, contentId, reason, description } },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          setDescription("");
          qc.invalidateQueries({ queryKey: getListReportsQueryKey({}) });
          toast({ title: "Report submitted", description: "Our moderation team will review this." });
        },
      }
    );
  };

  return (
    <>
      <Button variant={variant} size={size} className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)}>
        <Flag className="h-3.5 w-3.5" />
        {label ?? "Report"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Submit a Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Reason</p>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Additional details (optional)</p>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue..."
                className="resize-none min-h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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
