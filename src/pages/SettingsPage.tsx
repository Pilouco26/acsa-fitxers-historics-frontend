import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings, ApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inputFolder, setInputFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (!data) return;
    setInputFolder(data.input_folder);
    setOutputFolder(data.output_folder);
    setGeminiModel(data.gemini_model);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateSettings({
        input_folder: inputFolder,
        output_folder: outputFolder,
        gemini_api_key: geminiKey || undefined,
        gemini_model: geminiModel || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setGeminiKey("");
      setSuccess(true);
      setError(null);
      window.setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en desar la configuració");
      setSuccess(false);
    },
  });

  if (isLoading) {
    return <p className="empty-state">Carregant configuració…</p>;
  }

  return (
    <>
      <PageHeader
        title="Configuració"
        description="Carpetes d'entrada i sortida, clau API de Gemini i model d'IA."
      />

      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-success">Configuració desada correctament.</div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="input-folder">Carpeta d'entrada</label>
          <input
            id="input-folder"
            value={inputFolder}
            onChange={(e) => setInputFolder(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="output-folder">Carpeta de sortida</label>
          <input
            id="output-folder"
            value={outputFolder}
            onChange={(e) => setOutputFolder(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="gemini-key">
            Clau API Gemini{" "}
            {data?.gemini_configured && (
              <span style={{ color: "var(--color-success)" }}>
                (configurada: {data.gemini_api_key})
              </span>
            )}
          </label>
          <input
            id="gemini-key"
            type="password"
            placeholder="Deixeu en blanc per no canviar"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="gemini-model">Model Gemini</label>
          <input
            id="gemini-model"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            placeholder="gemini-2.5-flash-lite"
          />
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Desar configuració
          </button>
        </div>
      </div>
    </>
  );
}
