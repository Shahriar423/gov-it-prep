import { Navigate, Outlet, useLocation } from "react-router-dom";

import Loader from "../components/common/Loader";
import { useAuth } from "../hooks/useAuth";

// Only logged-in users may pass. Everyone else is sent to /login.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
