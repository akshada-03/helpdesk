import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Home from "@/pages/Home";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
      </Route>

      {/* Unknown paths fall back to the home route (which itself guards auth). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
