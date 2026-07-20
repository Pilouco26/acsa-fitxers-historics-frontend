import { BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { PersistentPages } from "@/components/PersistentPages";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ClassificadorJobProvider } from "@/contexts/ClassificadorJobContext";
import { LoginPage } from "@/pages/LoginPage";

function AuthenticatedApp() {
  return (
    <ClassificadorJobProvider>
      <Layout>
        <PersistentPages />
      </Layout>
    </ClassificadorJobProvider>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (location.pathname === "/login") {
    return <LoginPage />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
