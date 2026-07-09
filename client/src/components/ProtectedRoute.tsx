import { Navigate, Outlet } from "react-router-dom";

import { useSession } from "@/lib/auth-client";
import FullPageSpinner from "@/components/FullPageSpinner";

// Guards authenticated routes: redirects to /login when there is no session.
export default function ProtectedRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
