import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ApiError,
  deletePicture,
  deleteVideo,
  uploadBatch,
  uploadMediaBatch,
} from "@/api/client";
import { MediaPreview } from "@/components/MediaPreview";
import { PageHeader } from "@/components/PageHeader";
import type { MediaUploadOut, UploadOut } from "@/api/types";

type ContentKind = "documents" | "media";

const DOCUMENT_STEPS = [
  "Prepareu els documents en format PDF al vostre ordinador.",
  "Arrossegueu fitxers o una carpeta aquí, o trieu-los amb els botons.",
  "Confirmeu que els fitxers es pugen a la safata d'entrada (_PENDENTS).",
] as const;

const MEDIA_STEPS = [
  "Prepareu fotos (.jpg, .png, .webp) o vídeos (.mp4, .mov, .webm).",
  "Arrossegueu fitxers o una carpeta aquí, o trieu-los amb els botons.",
  "Un cop pujats, analitzeu-los al Classificador i reviseu-los a Revisió.",
] as const;

const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

const MEDIA_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);

function isPdfFile(file: File): boolean {
  if (!file.name.toLowerCase().endsWith(".pdf")) return false;
  const mime = file.type.toLowerCase();
  return !mime || PDF_MIME_TYPES.has(mime);
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isMediaFile(file: File): boolean {
  const ext = fileExt(file.name);
  return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

function readDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function readFileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function collectFilesFromEntry(
  entry: FileSystemEntry,
  pathPrefix = "",
): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileFromEntry(entry as FileSystemFileEntry);
    const relativePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: relativePath,
    });
    return [file];
  }

  if (!entry.isDirectory) return [];

  const dir = entry as FileSystemDirectoryEntry;
  const children = await readDirectoryEntries(dir.createReader());
  const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
  const nested = await Promise.all(
    children.map((child) => collectFilesFromEntry(child, nextPrefix)),
  );
  return nested.flat();
}

async function filesFromDataTransfer(data: DataTransfer): Promise<File[]> {
  const items = data.items;
  if (items?.length) {
    const entries = Array.from(items)
      .map((item) =>
        item.kind === "file" ? item.webkitGetAsEntry() : null,
      )
      .filter((entry): entry is FileSystemEntry => entry != null);

    if (entries.length > 0) {
      const nested = await Promise.all(
        entries.map((entry) => collectFilesFromEntry(entry)),
      );
      return nested.flat();
    }
  }

  return Array.from(data.files);
}

function clearFileInputs(
  ...inputs: Array<HTMLInputElement | null | undefined>
) {
  for (const input of inputs) {
    if (input) input.value = "";
  }
}

export function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [contentKind, setContentKind] = useState<ContentKind>("documents");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadOut[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<MediaUploadOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collectingDrop, setCollectingDrop] = useState(false);

  const clearInputs = useCallback(() => {
    clearFileInputs(fileInputRef.current, folderInputRef.current);
  }, []);

  const docMutation = useMutation({
    mutationFn: (files: File[]) => uploadBatch(files),
    onSuccess: (data) => {
      setUploadedDocs((prev) => [...data.files, ...prev]);
      setError(null);
      clearInputs();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error de pujada");
    },
  });

  const mediaMutation = useMutation({
    mutationFn: (files: File[]) => uploadMediaBatch(files),
    onSuccess: (data) => {
      setUploadedMedia((prev) => [...data.files, ...prev]);
      setError(null);
      clearInputs();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error de pujada");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (file: MediaUploadOut) =>
      file.media_kind === "video"
        ? deleteVideo(file.id)
        : deletePicture(file.id),
    onSuccess: (_data, file) => {
      setUploadedMedia((prev) =>
        prev.filter(
          (f) => !(f.id === file.id && f.media_kind === file.media_kind),
        ),
      );
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Error en eliminar el fitxer",
      );
    },
  });

  const isPending =
    collectingDrop ||
    (contentKind === "documents"
      ? docMutation.isPending
      : mediaMutation.isPending);

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList) return;

      const files = Array.from(fileList);
      if (!files.length) return;

      if (contentKind === "documents") {
        const pdfs = files.filter(isPdfFile);
        const rejected = files.filter((f) => !isPdfFile(f));

        if (!pdfs.length) {
          setError("Només es permeten fitxers PDF");
          clearInputs();
          return;
        }

        if (rejected.length > 0) {
          setError(
            `S'han ignorat ${rejected.length} fitxer(s) no PDF: ${rejected.map((f) => f.name).join(", ")}`,
          );
        } else {
          setError(null);
        }

        docMutation.mutate(pdfs);
        return;
      }

      const media = files.filter(isMediaFile);
      const rejected = files.filter((f) => !isMediaFile(f));

      if (!media.length) {
        setError(
          "Només es permeten imatges (.jpg, .png, .webp) i vídeos (.mp4, .mov, .webm)",
        );
        clearInputs();
        return;
      }

      if (rejected.length > 0) {
        setError(
          `S'han ignorat ${rejected.length} fitxer(s) no admesos: ${rejected.map((f) => f.name).join(", ")}`,
        );
      } else {
        setError(null);
      }

      mediaMutation.mutate(media);
    },
    [clearInputs, contentKind, docMutation, mediaMutation],
  );

  async function handleDrop(data: DataTransfer) {
    setCollectingDrop(true);
    try {
      const files = await filesFromDataTransfer(data);
      handleFiles(files);
    } catch {
      setError("No s'ha pogut llegir la carpeta o els fitxers arrossegats");
    } finally {
      setCollectingDrop(false);
    }
  }

  function selectKind(kind: ContentKind) {
    if (kind === contentKind) return;
    setContentKind(kind);
    setError(null);
    setDragOver(false);
    clearInputs();
  }

  const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;
  const steps = contentKind === "documents" ? DOCUMENT_STEPS : MEDIA_STEPS;

  return (
    <>
      <PageHeader
        title="Pujar"
        description="Trieu si pugeu documents PDF o fotos i vídeos — fitxers solts o una carpeta sencera."
      />

      <div className="field" style={{ marginBottom: "1rem" }}>
        <label>Tipus de contingut</label>
        <div className="segmented-control" role="group" aria-label="Tipus de contingut">
          <button
            type="button"
            className={contentKind === "documents" ? "active" : undefined}
            onClick={() => selectKind("documents")}
            disabled={isPending}
          >
            Documents
          </button>
          <button
            type="button"
            className={contentKind === "media" ? "active" : undefined}
            onClick={() => selectKind("media")}
            disabled={isPending}
          >
            Fotos / vídeos
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="scan-layout">
        <div className="card">
          <h3 className="card-title">
            {contentKind === "documents"
              ? "Com pujar documents"
              : "Com pujar mitjans"}
          </h3>
          <ol className="scan-steps">
            {steps.map((step, index) => (
              <li key={step}>
                <span className="scan-step-num">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="scan-hint">
            {contentKind === "documents" ? (
              <>
                Assegureu-vos que el format dels fitxers és <strong>PDF</strong>.
              </>
            ) : (
              <>
                Imatges: <strong>JPG, PNG, WebP</strong> · Vídeos:{" "}
                <strong>MP4, MOV, WebM</strong>
              </>
            )}
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">
            {contentKind === "documents"
              ? "Pujar PDF"
              : "Pujar fotos i vídeos"}
          </h3>

          <div
            className={`drop-zone${dragOver ? " drag-over" : ""}`}
            style={{ cursor: "default" }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleDrop(e.dataTransfer);
            }}
          >
            <p>
              Arrossegueu{" "}
              <strong>
                {contentKind === "documents" ? "PDFs" : "fotos i vídeos"}
              </strong>{" "}
              o una <strong>carpeta</strong> aquí
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              {contentKind === "documents"
                ? "Màxim 50 MB per fitxer · Fitxers individuals o carpeta sencera"
                : "Es permeten diversos fitxers o una carpeta sencera"}
            </p>
            <div
              className="drop-zone-actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                Seleccionar fitxers
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isPending}
                onClick={() => folderInputRef.current?.click()}
              >
                Seleccionar carpeta
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={
              contentKind === "documents"
                ? ".pdf,application/pdf"
                : MEDIA_ACCEPT
            }
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({
              webkitdirectory: "",
              directory: "",
            } as Record<string, string>)}
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />

          {isPending && (
            <div className="alert alert-info" style={{ marginTop: "1rem" }}>
              {collectingDrop ? "Llegint carpeta…" : "Pujant fitxers…"}
            </div>
          )}
        </div>
      </div>

      {contentKind === "documents" && uploadedDocs.length > 0 && (
        <div className="card">
          <h3 className="card-title">PDFs pujats ({uploadedDocs.length})</h3>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Ruta relativa</th>
                </tr>
              </thead>
              <tbody>
                {uploadedDocs.map((f) => (
                  <tr key={f.relative_path}>
                    <td>{f.filename}</td>
                    <td style={{ color: "var(--color-text-secondary)" }}>
                      {f.relative_path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {contentKind === "media" && uploadedMedia.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 className="card-title">
            Fitxers pujats ({uploadedMedia.length})
          </h3>
          <div className="media-upload-list">
            {uploadedMedia.map((f) => {
              const isDeleting =
                deletingId?.id === f.id &&
                deletingId?.media_kind === f.media_kind;
              return (
                <div
                  key={`${f.media_kind}-${f.id}`}
                  className="media-upload-row"
                >
                  <button
                    type="button"
                    className="media-upload-thumb"
                    disabled={isPending || isDeleting}
                    onClick={() => deleteMutation.mutate(f)}
                    aria-label={`Eliminar ${f.filename}`}
                    title="Eliminar"
                  >
                    {f.media_kind === "picture" ? (
                      <MediaPreview
                        kind="picture"
                        id={f.id}
                        filePath={f.relative_path}
                        title={f.filename}
                        thumb
                      />
                    ) : (
                      <div
                        className="media-preview-shell media-preview-shell--thumb"
                        aria-hidden
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Vídeo
                        </span>
                      </div>
                    )}
                    <span className="media-upload-thumb-remove" aria-hidden>
                      ×
                    </span>
                  </button>
                  <div className="media-upload-meta">
                    <strong>{f.filename}</strong>
                    <span>
                      {f.media_kind === "picture" ? "Imatge" : "Vídeo"} · id{" "}
                      {f.id}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
