import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminConfigStatus,
  getSettings,
  updateSettings,
  ApiError,
} from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
  normalizeGeminiModelId,
} from "@/constants/geminiModels";
import { useAuth } from "@/contexts/AuthContext";

export function SettingsPage() {
  const { canConfigure, isAdmin } = useAuth();
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

  const configStatusQuery = useQuery({
    queryKey: ["admin-config-status"],
    queryFn: getAdminConfigStatus,
    enabled: isAdmin,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setInputFolder(data.input_folder);
    setOutputFolder(data.output_folder);
    setGeminiModel(
      normalizeGeminiModelId(data.gemini_model || DEFAULT_GEMINI_MODEL) ||
        DEFAULT_GEMINI_MODEL,
    );
  }, [data]);

  const mutation = useMutation({
    mutationFn: (model: string) =>
      updateSettings({
        input_folder: inputFolder,
        output_folder: outputFolder,
        gemini_api_key: geminiKey || undefined,
        gemini_api_key_backup: geminiKeyBackup || undefined,
        gemini_model: model || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-config-status"] });
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
        description={
          canConfigure
            ? "Carpetes d'entrada i sortida, claus API de Gemini (principal i de reserva) i model d'IA."
            : "Consulta de la configuració del sistema (només lectura)."
        }
      />

      {!canConfigure && (
        <div className="alert alert-info">
          Només els usuaris amb rol d&apos;administrador poden modificar la
          configuració.
        </div>
      )}

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
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>

        <div className="field">
          <label htmlFor="output-folder">Carpeta de sortida</label>
          <input
            id="output-folder"
            value={outputFolder}
            onChange={(e) => setOutputFolder(e.target.value)}
            readOnly={!canConfigure}
            disabled={!canConfigure}
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
            readOnly={!canConfigure}
            disabled={!canConfigure}
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
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>

        <div className="field">
          <label htmlFor="gemini-model">Model Gemini</label>
          <select
            id="gemini-model"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            disabled={!canConfigure}
          >
            {!GEMINI_MODEL_OPTIONS.some((o) => o.value === geminiModel) &&
              geminiModel && (
                <option value={geminiModel}>{geminiModel}</option>
              )}
            {GEMINI_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {canConfigure ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={mutation.isPending}
              onClick={() => {
                const model = normalizeGeminiModelId(geminiModel);
                setGeminiModel(model);
                mutation.mutate(model);
              }}
            >
              Desar configuració
            </button>
          </div>
        ) : null}
      </div>

      {isAdmin && configStatusQuery.data ? (
        <div className="card admin-config-status">
          <h3>Estat del sistema</h3>
          <ul className="admin-config-status-list">
            <li>
              Carpeta d&apos;entrada:{" "}
              {configStatusQuery.data.input_folder_exists ? "existeix" : "no trobada"}
              {configStatusQuery.data.input_folder_writable
                ? " · escriptura OK"
                : " · sense escriptura"}
            </li>
            <li>
              Carpeta de sortida:{" "}
              {configStatusQuery.data.output_folder_exists ? "existeix" : "no trobada"}
              {configStatusQuery.data.output_folder_writable
                ? " · escriptura OK"
                : " · sense escriptura"}
            </li>
            <li>
              Gemini:{" "}
              {configStatusQuery.data.gemini_configured
                ? "configurat"
                : "pendent"}
              {configStatusQuery.data.gemini_backup_configured
                ? " · reserva OK"
                : ""}
            </li>
            {configStatusQuery.data.app_version ? (
              <li>Versió: {configStatusQuery.data.app_version}</li>
            ) : null}
            {configStatusQuery.data.git_sha ? (
              <li>Git: {configStatusQuery.data.git_sha}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
