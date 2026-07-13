import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { PersistentPages } from "@/components/PersistentPages";
import { ClassificadorJobProvider } from "@/contexts/ClassificadorJobContext";

export default function App() {
  return (
    <BrowserRouter>
      <ClassificadorJobProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Layout>
          <PersistentPages />
        </Layout>
      </ClassificadorJobProvider>
    </BrowserRouter>
  );
}
