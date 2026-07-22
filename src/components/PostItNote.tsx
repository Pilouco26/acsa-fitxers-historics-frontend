import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { NoteColor, NoteOut, NoteUpdate } from "@/api/types";

const COLORS: { id: NoteColor; label: string }[] = [
  { id: "yellow", label: "Groc" },
  { id: "pink", label: "Rosa" },
  { id: "blue", label: "Blau" },
  { id: "green", label: "Verd" },
  { id: "orange", label: "Taronja" },
  { id: "purple", label: "Lila" },
];

const MIN_W = 160;
const MIN_H = 140;

type DragMode = "move" | "resize" | null;

interface PostItNoteProps {
  note: NoteOut;
  scale: number;
  onChange: (id: string, patch: NoteUpdate) => void;
  onBringFront: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PostItNote({
  note,
  scale,
  onChange,
  onBringFront,
  onDelete,
}: PostItNoteProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [dragging, setDragging] = useState(false);
  const dragMode = useRef<DragMode>(null);
  const dragPointerId = useRef<number | null>(null);
  const dragOrigin = useRef({
    px: 0,
    py: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });
  const noteRef = useRef(note);
  const scaleRef = useRef(scale);
  const onChangeRef = useRef(onChange);
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusFieldRef = useRef<"title" | "body">("title");
  const dragListeners = useRef<{
    move: ((e: PointerEvent) => void) | null;
    up: ((e: PointerEvent) => void) | null;
  }>({ move: null, up: null });

  noteRef.current = note;
  scaleRef.current = scale;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editing) {
      setTitle(note.title);
      setBody(note.body);
    }
  }, [note.title, note.body, editing]);

  useEffect(() => {
    if (!editing) return;
    const el =
      focusFieldRef.current === "body" ? bodyRef.current : titleRef.current;
    el?.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (dragPointerId.current !== e.pointerId || !dragMode.current) return;
      const dx = (e.clientX - dragOrigin.current.px) / scaleRef.current;
      const dy = (e.clientY - dragOrigin.current.py) / scaleRef.current;
      const id = noteRef.current.id;
      if (dragMode.current === "move") {
        onChangeRef.current(id, {
          x: Math.max(0, dragOrigin.current.x + dx),
          y: Math.max(0, dragOrigin.current.y + dy),
        });
      } else {
        onChangeRef.current(id, {
          width: Math.max(MIN_W, dragOrigin.current.w + dx),
          height: Math.max(MIN_H, dragOrigin.current.h + dy),
        });
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (dragPointerId.current !== e.pointerId) return;
      dragMode.current = null;
      dragPointerId.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      const el = rootRef.current;
      if (el?.hasPointerCapture(e.pointerId)) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
    }

    // Stable for this mount — startDrag attaches these synchronously.
    dragListeners.current = { move: onPointerMove, up: onPointerUp };

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dragListeners.current = { move: null, up: null };
    };
  }, []);

  function startDrag(
    e: ReactPointerEvent,
    mode: Exclude<DragMode, null>,
  ) {
    if (editing) return;
    // Touch / pen report button 0; ignore non-primary mouse buttons only.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onBringFront(note.id);
    dragMode.current = mode;
    dragPointerId.current = e.pointerId;
    setDragging(true);
    dragOrigin.current = {
      px: e.clientX,
      py: e.clientY,
      x: note.x,
      y: note.y,
      w: note.width,
      h: note.height,
    };
    const { move, up } = dragListeners.current;
    if (move && up) {
      // Attach immediately so the first touch moves aren't lost waiting for a re-render.
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }
    rootRef.current?.setPointerCapture(e.pointerId);
  }

  function commitEdit() {
    setEditing(false);
    if (title !== note.title || body !== note.body) {
      onChange(note.id, { title, body });
    }
  }

  /** Only leave edit mode when focus leaves the whole post-it. */
  function handleFieldBlur(e: ReactFocusEvent<HTMLElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;

    // relatedTarget is often null when clicking another control in the same note
    window.setTimeout(() => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(document.activeElement)) return;
      commitEdit();
    }, 0);
  }

  function beginEdit(field: "title" | "body") {
    focusFieldRef.current = field;
    onBringFront(note.id);
    setEditing(true);
  }

  return (
    <article
      ref={rootRef}
      className={`post-it post-it--${note.color}${dragging ? " post-it--dragging" : ""}${editing ? " post-it--editing" : ""}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: note.z_index,
        transform: `rotate(${note.rotation}deg)`,
      }}
      onPointerDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            ".post-it-actions, .post-it-resize, .post-it-colors, .post-it-title-input, .post-it-body-input",
          )
        ) {
          return;
        }
        if (!editing) startDrag(e, "move");
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        beginEdit(
          target.closest(".post-it-body, .post-it-body-input")
            ? "body"
            : "title",
        );
      }}
      onClick={() => onBringFront(note.id)}
    >
      <div className="post-it-tape" aria-hidden />
      <header className="post-it-header">
        {editing ? (
          <input
            ref={titleRef}
            className="post-it-title-input"
            value={title}
            placeholder="Títol"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleFieldBlur}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                bodyRef.current?.focus();
              }
              if (e.key === "Escape") {
                setTitle(note.title);
                setBody(note.body);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h3 className="post-it-title">{note.title || "Sense títol"}</h3>
        )}
        <div className="post-it-actions">
          <button
            type="button"
            className="post-it-icon-btn"
            title="Editar"
            aria-label="Editar nota"
            onClick={(e) => {
              e.stopPropagation();
              beginEdit("title");
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="post-it-icon-btn post-it-icon-btn--danger"
            title="Eliminar"
            aria-label="Eliminar nota"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
          >
            ×
          </button>
        </div>
      </header>

      {editing ? (
        <textarea
          ref={bodyRef}
          className="post-it-body-input"
          value={body}
          placeholder="Escriu aquí…"
          onChange={(e) => setBody(e.target.value)}
          onBlur={handleFieldBlur}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle(note.title);
              setBody(note.body);
              setEditing(false);
            }
          }}
        />
      ) : (
        <p className="post-it-body">{note.body || "Doble clic per editar"}</p>
      )}

      <div
        className="post-it-colors"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`post-it-swatch post-it-swatch--${c.id}${note.color === c.id ? " is-active" : ""}`}
            title={c.label}
            aria-label={`Color ${c.label}`}
            onClick={() => onChange(note.id, { color: c.id })}
          />
        ))}
      </div>

      <button
        type="button"
        className="post-it-resize"
        aria-label="Redimensionar"
        title="Redimensionar"
        onPointerDown={(e) => {
          startDrag(e, "resize");
        }}
      />
    </article>
  );
}
