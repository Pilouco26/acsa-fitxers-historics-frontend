import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ClassificadorPage } from "@/pages/ClassificadorPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { RevisioPage } from "@/pages/RevisioPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UploadPage } from "@/pages/UploadPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/classificador" element={<ClassificadorPage />} />
          <Route path="/revisio" element={<RevisioPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/comparador"
            element={
              <PlaceholderPage
                title="Comparador"
                description="Cerca de duplicats per SSIM i empremtes digitals."
                endpoint="POST /api/compare"
              />
            }
          />
          <Route
            path="/admin/analisi"
            element={
              <PlaceholderPage
                title="Anàlisi"
                description="Anàlisi per lots amb filtres de carpeta."
                endpoint="POST /api/jobs/analyze"
              />
            }
          />
          <Route
            path="/admin/edicions"
            element={
              <PlaceholderPage
                title="Edicions"
                description="Aplicar i revertir canvis de nom aprovats."
                endpoint="POST /api/apply, POST /api/revert"
              />
            }
          />
          <Route
            path="/correus"
            element={
              <PlaceholderPage
                title="Correus"
                description="Anàlisi i assignació de correus .eml."
                endpoint="POST /api/jobs/email-analyze, POST /api/emails/assign"
              />
            }
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
