import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import { API_URL } from "@/lib/config";

// Better Auth is served cross-origin (client :3000 → server :3001), so cookies
// must be sent with every request. `inferAdditionalFields` teaches the client
// about the server's custom `role` field so `session.user.role` is typed.
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: "include" },
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string" },
      },
    }),
  ],
});

export const { signIn, signOut, useSession } = authClient;
