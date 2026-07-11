import { useQuery } from "@tanstack/react-query";

import { Role } from "core/constants/role.ts";
import type { UserListResponse } from "core/schemas/users.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
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
// columns, so keep them in one place to avoid drift.
function UsersTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Joined</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// The admin-only user list. Owns its own ["users"] query so the page stays a
// thin layout; CreateUserDialog invalidates the same key, which refetches this
// table automatically after a new user is created.
export default function UsersTable() {
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
      <span className="text-muted-foreground text-sm">No users found.</span>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <UsersTableHeader />
        <TableBody>
          {users.data.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {user.email}
              </TableCell>
              <TableCell>
                <Badge
                  variant={user.role === Role.admin ? "default" : "secondary"}
                >
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
