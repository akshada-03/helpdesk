import type { Role } from "../constants/role.ts";

// Shape of a user as returned by GET /api/users (the admin-only user list).
// Excludes auth-sensitive fields (passwords live on the Account model, never
// the User model). `createdAt` is serialized to an ISO string over JSON.
export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
};

export type UserListResponse = {
  users: UserListItem[];
};
