import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

// Hides admin pages from students. This is only for a good user experience:
// the real protection is the check the backend does on every admin request.
export default function AdminRoute() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">403 · Admin access only</h1>
        <p className="mt-2 text-red-700">
          Your account does not have permission to view this page.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-blue-700 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <Outlet />;
}
