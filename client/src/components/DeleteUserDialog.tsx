import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import type { UserListItem } from "core/schemas/users.ts";
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

type DeleteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserListItem;
};

// Confirmation modal for (soft) deleting a user. On confirm it DELETEs the user
// and invalidates the ["users"] list so the row disappears.
export default function DeleteUserDialog({
  open,
  onOpenChange,
  user,
}: DeleteUserDialogProps) {
  const queryClient = useQueryClient();

  const deleteUser = useMutation({
    mutationFn: () => api.delete(`/api/users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            Delete{" "}
            <span className="text-foreground font-medium">{user.name}</span> (
            {user.email})? They'll lose access immediately. Their account is
            deactivated, not permanently erased.
          </DialogDescription>
        </DialogHeader>

        {deleteUser.isError && (
          <ErrorAlert error={deleteUser.error} fallback="Failed to delete user" />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteUser.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteUser.mutate()}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending && <Loader2 className="animate-spin" />}
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
