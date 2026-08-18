import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ErrorAlert from "@/components/ErrorAlert";

type DeleteTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketDetailData;
};

// Confirmation modal for deleting a ticket (Admin only). On confirm it DELETEs
// the ticket, invalidates the ["tickets"] query, and navigates back to /tickets.
export default function DeleteTicketDialog({
  open,
  onOpenChange,
  ticket,
}: DeleteTicketDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const deleteTicket = useMutation({
    mutationFn: () => api.delete(`/api/tickets/${ticket.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onOpenChange(false);
      navigate("/tickets");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete ticket</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete ticket{" "}
            <span className="font-semibold text-foreground">#{ticket.id}</span> (
            <span className="italic">{ticket.subject}</span>)? This action is permanent and will remove the ticket and all its replies.
          </DialogDescription>
        </DialogHeader>

        {deleteTicket.isError && (
          <ErrorAlert error={deleteTicket.error} fallback="Failed to delete ticket" />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteTicket.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteTicket.mutate()}
            disabled={deleteTicket.isPending}
          >
            {deleteTicket.isPending && <Loader2 className="animate-spin size-4 mr-1" />}
            Delete ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
