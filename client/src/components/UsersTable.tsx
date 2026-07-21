import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, UserX } from "lucide-react";

import { Role } from "core/constants/role.ts";
import type { UserListItem, UserListResponse } from "core/schemas/users.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import UserFormDialog from "@/components/UserFormDialog";
import DeleteUserDialog from "@/components/DeleteUserDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Shared column header — the loading skeleton and the loaded table use the same
// columns, so keep them in one place to avoid drift. The trailing column holds
// the per-row edit action (header label is visually hidden).
function UsersTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Joined</TableHead>
        <TableHead className="text-right">
          <span className="sr-only">Actions</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

// The admin-only user list. Owns its own ["users"] query so the page stays a
// thin layout; CreateUserDialog / UserFormDialog invalidate the same key, which
// refetches this table automatically after a create or edit.
export default function UsersTable() {
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserListItem | null>(null);

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () =>
      (await api.get<UserListResponse>("/api/users")).data.users,
  });

  if (users.isPending) {
    return (
      <div className="rounded-md border">
        <Table>
          <UsersTableHeader />
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (users.isError) {
    return <ErrorAlert error={users.error} fallback="Failed to load users." />;
  }

  if (users.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-12">
        <UserX className="text-muted-foreground size-6" aria-hidden />
        <span className="text-muted-foreground text-sm">No users found.</span>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <UsersTableHeader />
          <TableBody>
            {users.data.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground u-data text-xs">
                  {user.email}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      user.role === Role.admin
                        ? "u-chip bg-evergreen-surface border-evergreen-border text-primary"
                        : "u-chip bg-muted border-border text-muted-foreground"
                    }
                  >
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground u-data text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${user.name}`}
                      onClick={() => setEditingUser(user)}
                    >
                      <Pencil />
                    </Button>
                    {/* Admins can't be deleted, so they get no delete button. */}
                    {user.role !== Role.admin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${user.name}`}
                        onClick={() => setDeletingUser(user)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Keyed + conditionally rendered so each edit opens a freshly populated
          form and closing fully unmounts it (no stale/flashing content). */}
      {editingUser && (
        <UserFormDialog
          key={editingUser.id}
          user={editingUser}
          open
          onOpenChange={(open) => {
            if (!open) setEditingUser(null);
          }}
        />
      )}

      {deletingUser && (
        <DeleteUserDialog
          key={deletingUser.id}
          user={deletingUser}
          open
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null);
          }}
        />
      )}
    </>
  );
}
