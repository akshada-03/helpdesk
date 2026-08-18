import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Tickets from "@/pages/Tickets";
import TicketDetail from "@/pages/TicketDetail";
import Users from "@/pages/Users";
import KnowledgeBase from "@/pages/KnowledgeBase";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/knowledge-base" element={<KnowledgeBase />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/users" element={<Users />} />
      </Route>

      {/* Unknown paths fall back to the home route (which itself guards auth). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
