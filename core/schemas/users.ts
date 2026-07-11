import { z } from "zod/v4";

import { Role } from "../constants/role.ts";

// Request body for POST /api/users (admin creates a user). Shared between the
// client form (React Hook Form resolver) and the server route so the validation
// rules stay in one place. Role is required — the admin picks admin or agent.
export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().trim().min(8, "Password must be at least 8 characters"),
  role: z.enum([Role.admin, Role.agent], { message: "Please select a role" }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Request body for PATCH /api/users/:id (admin edits a user). Name, email, and
// role follow the same rules as creation. The password is optional — an empty
// string means "keep the current password", otherwise it must meet the same
// length rule and resets the user's password.
export const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.union([
    z.literal(""),
    z.string().trim().min(8, "Password must be at least 8 characters"),
  ]),
  role: z.enum([Role.admin, Role.agent], { message: "Please select a role" }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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
