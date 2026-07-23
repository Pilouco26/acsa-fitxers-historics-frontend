import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminConfigStatus,
  getSettings,
  updateSettings,
  ApiError,
} from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PanelLoading } from "@/components/PanelStatus";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
  normalizeGeminiModelId,
} from "@/constants/geminiModels";
import { useAuth } from "@/contexts/AuthContext";

type PathTone = "ok" | "warn" | "error" | "neutral";

function pathTone(
  exists: boolean | undefined,
  writable: boolean | undefined,
): PathTone {
  if (exists === undefined && writable === undefined) return "neutral";
  if (exists === false) return "error";
  if (writable === false) return "warn";
  if (exists === true && writable === true) return "ok";
  if (exists === true) return "ok";
  return "neutral";
}

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

function badgeClassForTone(tone: PathTone): string {
  if (tone === "ok") return "badge badge-ok";
  if (tone === "warn") return "badge badge-revisio";
  if (tone === "error") return "badge badge-error";
  return "badge badge-pending";
}

function StatusRow({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: string;
  tone: PathTone;
}) {
  return (
    <li className="settings-status-row">
      <span className="settings-status-label">{label}</span>
      <span className={badgeClassForTone(tone)}>{detail}</span>
    </li>
  );
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
    return <PanelLoading label="Carregant configuració…" />;
  }

  const status = configStatusQuery.data;
  const storageDetail = pathStatusLabel(
    status?.storage_path_exists,
    status?.storage_path_writable,
  );
  const archiveDetail = pathStatusLabel(
    status?.archive_path_exists,
    status?.archive_path_writable,
  );
  const mediaDetail = pathStatusLabel(
    status?.media_path_exists,
    status?.media_path_writable,
  );
  const documentsDetail = pathStatusLabel(
    status?.documents_path_exists,
    status?.documents_path_writable,
  );

  return (
    <div className="page-fill settings-page">
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

      <div className="settings-layout">
        <div className="settings-main">
          <section className="card settings-section">
            <div className="settings-section-head">
              <h3 className="card-title">Rutes del sistema</h3>
              <p className="settings-section-desc">
                Emmagatzematge persistent, arxiu i carpetes de contingut.
              </p>
            </div>

            <div className="field-grid settings-field-grid">
              <div className="field">
                <label htmlFor="storage-path">
                  Emmagatzematge{" "}
                  <span className="settings-field-hint">
                    (<code>/app/storage</code>
                  </span>
                </label>
                <input
                  id="storage-path"
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                  placeholder="/mnt/acsa/storage"
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  spellCheck={false}
                />
              </div>

              <div className="field">
                <label htmlFor="archive-path">
                  Arxiu{" "}
                  <span className="settings-field-hint">
                    <code>/data/archive</code>
                  </span>
                </label>
                <input
                  id="archive-path"
                  value={archivePath}
                  onChange={(e) => setArchivePath(e.target.value)}
                  placeholder="/mnt/acsa/archive"
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  spellCheck={false}
                />
              </div>

              <div className="field">
                <label htmlFor="media-path">Carpeta de mèdia</label>
                <input
                  id="media-path"
                  value={mediaPath}
                  onChange={(e) => setMediaPath(e.target.value)}
                  placeholder="/mnt/acsa/storage/media"
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  spellCheck={false}
                />
              </div>

              <div className="field">
                <label htmlFor="documents-path">Carpeta de documents</label>
                <input
                  id="documents-path"
                  value={documentsPath}
                  onChange={(e) => setDocumentsPath(e.target.value)}
                  placeholder="/mnt/acsa/storage/documents"
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  spellCheck={false}
                />
              </div>
            </div>
          </section>

          <section className="card settings-section">
            <div className="settings-section-head">
              <h3 className="card-title">Carpetes de treball</h3>
              <p className="settings-section-desc">
                Origen i destí per al flux diari de processament.
              </p>
            </div>

            <div className="field-grid settings-field-grid">
              <div className="field">
                <label htmlFor="input-folder">Carpeta d&apos;entrada</label>
                <input
                  id="input-folder"
                  value={inputFolder}
                  onChange={(e) => setInputFolder(e.target.value)}
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  spellCheck={false}
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
                  spellCheck={false}
                />
              </div>
            </div>
          </section>

          <section className="card settings-section">
            <div className="settings-section-head">
              <h3 className="card-title">Gemini</h3>
              <p className="settings-section-desc">
                Claus API i model d&apos;IA. Deixeu les claus en blanc per no
                canviar-les.
              </p>
            </div>

            <div className="field-grid settings-field-grid">
              <div className="field">
                <label htmlFor="gemini-key">
                  Clau API Gemini
                  {data?.gemini_configured ? (
                    <span className="settings-key-status">
                      configurada: {data.gemini_api_key}
                    </span>
                  ) : null}
                </label>
                <input
                  id="gemini-key"
                  type="password"
                  placeholder="Deixeu en blanc per no canviar"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="gemini-key-backup">
                  Clau API de reserva
                  {data?.gemini_configured && data.gemini_api_key_backup ? (
                    <span className="settings-key-status">
                      configurada: {data.gemini_api_key_backup}
                    </span>
                  ) : null}
                </label>
                <input
                  id="gemini-key-backup"
                  type="password"
                  placeholder="Deixeu en blanc per no canviar"
                  value={geminiKeyBackup}
                  onChange={(e) => setGeminiKeyBackup(e.target.value)}
                  readOnly={!canConfigure}
                  disabled={!canConfigure}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="field settings-model-field">
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
              <div className="btn-row settings-actions">
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
                  {mutation.isPending ? "Desant…" : "Desar configuració"}
                </button>
              </div>
            ) : null}
          </section>
        </div>

        {isAdmin && status ? (
          <aside className="card settings-status-panel admin-config-status">
            <div className="settings-section-head">
              <h3 className="card-title">Estat del sistema</h3>
              <p className="settings-section-desc">
                Comprovació de rutes, permisos i Gemini.
              </p>
            </div>

            <ul className="settings-status-list">
              <StatusRow
                label="Entrada"
                detail={
                  status.input_folder_exists
                    ? status.input_folder_writable
                      ? "existeix · escriptura OK"
                      : "existeix · sense escriptura"
                    : "no trobada"
                }
                tone={pathTone(
                  status.input_folder_exists,
                  status.input_folder_writable,
                )}
              />
              <StatusRow
                label="Sortida"
                detail={
                  status.output_folder_exists
                    ? status.output_folder_writable
                      ? "existeix · escriptura OK"
                      : "existeix · sense escriptura"
                    : "no trobada"
                }
                tone={pathTone(
                  status.output_folder_exists,
                  status.output_folder_writable,
                )}
              />
              {storageDetail ? (
                <StatusRow
                  label="Emmagatzematge"
                  detail={storageDetail}
                  tone={pathTone(
                    status.storage_path_exists,
                    status.storage_path_writable,
                  )}
                />
              ) : null}
              {archiveDetail ? (
                <StatusRow
                  label="Arxiu"
                  detail={archiveDetail}
                  tone={pathTone(
                    status.archive_path_exists,
                    status.archive_path_writable,
                  )}
                />
              ) : null}
              {mediaDetail ? (
                <StatusRow
                  label="Mèdia"
                  detail={mediaDetail}
                  tone={pathTone(
                    status.media_path_exists,
                    status.media_path_writable,
                  )}
                />
              ) : null}
              {documentsDetail ? (
                <StatusRow
                  label="Documents"
                  detail={documentsDetail}
                  tone={pathTone(
                    status.documents_path_exists,
                    status.documents_path_writable,
                  )}
                />
              ) : null}
              <StatusRow
                label="Gemini"
                detail={
                  status.gemini_configured
                    ? status.gemini_backup_configured
                      ? "configurat · reserva OK"
                      : "configurat"
                    : "pendent"
                }
                tone={
                  status.gemini_configured
                    ? status.gemini_backup_configured
                      ? "ok"
                      : "warn"
                    : "error"
                }
              />
            </ul>

            {(status.app_version || status.git_sha) && (
              <dl className="settings-meta">
                {status.app_version ? (
                  <div className="settings-meta-row">
                    <dt>Versió</dt>
                    <dd>{status.app_version}</dd>
                  </div>
                ) : null}
                {status.git_sha ? (
                  <div className="settings-meta-row">
                    <dt>Git</dt>
                    <dd>
                      <code>{status.git_sha}</code>
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
