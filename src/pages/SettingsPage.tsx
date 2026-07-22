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

function pathStatusLabel(
  exists: boolean | undefined,
  writable: boolean | undefined,
): string | null {
  if (exists === undefined && writable === undefined) return null;
  const existence =
    exists === undefined ? null : exists ? "existeix" : "no trobada";
  const write =
    writable === undefined
      ? null
      : writable
        ? "escriptura OK"
        : "sense escriptura";
  return [existence, write].filter(Boolean).join(" · ");
}

export function SettingsPage() {
  const { canConfigure, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inputFolder, setInputFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [archivePath, setArchivePath] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [documentsPath, setDocumentsPath] = useState("");
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
    setStoragePath(data.storage_path ?? "");
    setArchivePath(data.archive_path ?? "");
    setMediaPath(data.media_path ?? "");
    setDocumentsPath(data.documents_path ?? "");
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
        storage_path: storagePath,
        archive_path: archivePath,
        media_path: mediaPath,
        documents_path: documentsPath,
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

  const status = configStatusQuery.data;
  const storageStatus = pathStatusLabel(
    status?.storage_path_exists,
    status?.storage_path_writable,
  );
  const archiveStatus = pathStatusLabel(
    status?.archive_path_exists,
    status?.archive_path_writable,
  );
  const mediaStatus = pathStatusLabel(
    status?.media_path_exists,
    status?.media_path_writable,
  );
  const documentsStatus = pathStatusLabel(
    status?.documents_path_exists,
    status?.documents_path_writable,
  );

  return (
    <>
      <PageHeader
        title="Configuració"
        description={
          canConfigure
            ? "Rutes del sistema, carpetes d'entrada i sortida, claus API de Gemini i model d'IA."
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
        <h3>Rutes del sistema</h3>
        <div className="field">
          <label htmlFor="storage-path">
            Emmagatzematge (ruta real de <code>/app/storage</code>)
          </label>
          <input
            id="storage-path"
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="/mnt/acsa/storage"
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>

        <div className="field">
          <label htmlFor="archive-path">
            Arxiu (ruta real de <code>/data/archive</code>)
          </label>
          <input
            id="archive-path"
            value={archivePath}
            onChange={(e) => setArchivePath(e.target.value)}
            placeholder="/mnt/acsa/archive"
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>

        <div className="field">
          <label htmlFor="media-path">Carpeta de mèdia (ruta absoluta)</label>
          <input
            id="media-path"
            value={mediaPath}
            onChange={(e) => setMediaPath(e.target.value)}
            placeholder="/mnt/acsa/storage/media"
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>

        <div className="field">
          <label htmlFor="documents-path">
            Carpeta de documents (ruta absoluta)
          </label>
          <input
            id="documents-path"
            value={documentsPath}
            onChange={(e) => setDocumentsPath(e.target.value)}
            placeholder="/mnt/acsa/storage/documents"
            readOnly={!canConfigure}
            disabled={!canConfigure}
          />
        </div>
      </div>

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

      {isAdmin && status ? (
        <div className="card admin-config-status">
          <h3>Estat del sistema</h3>
          <ul className="admin-config-status-list">
            <li>
              Carpeta d&apos;entrada:{" "}
              {status.input_folder_exists ? "existeix" : "no trobada"}
              {status.input_folder_writable
                ? " · escriptura OK"
                : " · sense escriptura"}
            </li>
            <li>
              Carpeta de sortida:{" "}
              {status.output_folder_exists ? "existeix" : "no trobada"}
              {status.output_folder_writable
                ? " · escriptura OK"
                : " · sense escriptura"}
            </li>
            {storageStatus ? (
              <li>Emmagatzematge: {storageStatus}</li>
            ) : null}
            {archiveStatus ? <li>Arxiu: {archiveStatus}</li> : null}
            {mediaStatus ? <li>Mèdia: {mediaStatus}</li> : null}
            {documentsStatus ? (
              <li>Documents: {documentsStatus}</li>
            ) : null}
            <li>
              Gemini:{" "}
              {status.gemini_configured ? "configurat" : "pendent"}
              {status.gemini_backup_configured ? " · reserva OK" : ""}
            </li>
            {status.app_version ? (
              <li>Versió: {status.app_version}</li>
            ) : null}
            {status.git_sha ? <li>Git: {status.git_sha}</li> : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
