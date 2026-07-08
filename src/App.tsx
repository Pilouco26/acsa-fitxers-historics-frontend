import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { ClassificadorJobProvider } from "@/contexts/ClassificadorJobContext";
import { AnalisiPage } from "@/pages/AnalisiPage";
import { ClassificadorPage } from "@/pages/ClassificadorPage";
import { ComparadorPage } from "@/pages/ComparadorPage";
import { CorreusPage } from "@/pages/CorreusPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { EdicionsPage } from "@/pages/EdicionsPage";
import { RevisioPage } from "@/pages/RevisioPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UploadPage } from "@/pages/UploadPage";

export default function App() {
  return (
    <BrowserRouter>
      <ClassificadorJobProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Layout>
          <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/classificador" element={<ClassificadorPage />} />
          <Route path="/revisio" element={<RevisioPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/comparador" element={<ComparadorPage />} />
          <Route path="/admin/analisi" element={<AnalisiPage />} />
          <Route path="/admin/edicions" element={<EdicionsPage />} />
          <Route path="/correus" element={<CorreusPage />} />
          </Routes>
        </Layout>
      </ClassificadorJobProvider>
    </BrowserRouter>
  );
}
