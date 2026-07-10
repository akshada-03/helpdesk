import { useQuery } from "@tanstack/react-query";

import { Role } from "core/constants/role.ts";
import type { UserListResponse } from "core/schemas/users.ts";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Users() {
  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserListResponse>("/api/users")).data.users,
  });

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground mt-1">
          Everyone with access to the helpdesk.
        </p>

        <div className="mt-6">
          {users.isPending && (
            <span className="text-muted-foreground text-sm">Loading users…</span>
          )}

          {users.isError && (
            <ErrorAlert error={users.error} fallback="Failed to load users." />
          )}

          {users.isSuccess &&
            (users.data.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                No users found.
              </span>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.data.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.role === Role.admin ? "default" : "secondary"
                            }
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
            ))}
        </div>
      </main>
    </div>
  );
}
