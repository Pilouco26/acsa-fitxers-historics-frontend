import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings, ApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
} from "@/constants/geminiModels";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inputFolder, setInputFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeyBackup, setGeminiKeyBackup] = useState("");
  const [geminiModel, setGeminiModel] = useState<string>(DEFAULT_GEMINI_MODEL);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (!data) return;
    setInputFolder(data.input_folder);
    setOutputFolder(data.output_folder);
    setGeminiModel(data.gemini_model || DEFAULT_GEMINI_MODEL);
  }, [data]);

  const modelInList = GEMINI_MODEL_OPTIONS.some(
    (option) => option.value === geminiModel,
  );

  const mutation = useMutation({
    mutationFn: () =>
      updateSettings({
        input_folder: inputFolder,
        output_folder: outputFolder,
        gemini_api_key: geminiKey || undefined,
        gemini_api_key_backup: geminiKeyBackup || undefined,
        gemini_model: geminiModel || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setGeminiKey("");
      setGeminiKeyBackup("");
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
        description="Carpetes d'entrada i sortida, claus API de Gemini (principal i de reserva) i model d'IA."
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
          <label htmlFor="gemini-key-backup">
            Clau API Gemini de reserva{" "}
            {data?.gemini_configured && data.gemini_api_key_backup && (
              <span style={{ color: "var(--color-success)" }}>
                (configurada: {data.gemini_api_key_backup})
              </span>
            )}
          </label>
          <input
            id="gemini-key-backup"
            type="password"
            placeholder="Deixeu en blanc per no canviar"
            value={geminiKeyBackup}
            onChange={(e) => setGeminiKeyBackup(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="gemini-model">Model Gemini</label>
          <select
            id="gemini-model"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
          >
            {!modelInList && geminiModel && (
              <option value={geminiModel}>{geminiModel}</option>
            )}
            {GEMINI_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
