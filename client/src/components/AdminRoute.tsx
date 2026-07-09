import { Navigate, Outlet } from "react-router-dom";

import { Role } from "core/constants/role.ts";
import { useSession } from "@/lib/auth-client";
import FullPageSpinner from "@/components/FullPageSpinner";

// Guards admin-only routes: redirects unauthenticated users to /login and
// non-admins to the home page.
export default function AdminRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== Role.admin) return <Navigate to="/" replace />;

  return <Outlet />;
}
