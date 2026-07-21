import {

  useCallback,

  useEffect,

  useMemo,

  useLayoutEffect,

  useRef,

  useState,

  type PointerEvent as ReactPointerEvent,

  type WheelEvent as ReactWheelEvent,

} from "react";

import {

  bringNoteToFront,

  createNote,

  deleteNote,

  listNotes,

  updateNote,

} from "@/api/client";

import type { NoteOut, NoteUpdate } from "@/api/types";

import { PageHeader } from "@/components/PageHeader";

import { PostItNote } from "@/components/PostItNote";



const MIN_BOARD_W = 20000;

const MIN_BOARD_H = 15000;

const BOARD_PADDING = 8000;

const MIN_ZOOM = 0.45;

const MAX_ZOOM = 1.6;

const ZOOM_STEP = 0.1;

const PERSIST_DEBOUNCE_MS = 400;

const MIN_W = 160;

const MIN_H = 140;



/** Survives keep-alive hide/show and remounts within the same session. */

const notesViewportState = {

  scrollLeft: 0,

  scrollTop: 0,

  zoom: 1,

};



function saveNotesViewport(el: HTMLDivElement | null, zoom: number) {

  if (!el) return;

  notesViewportState.scrollLeft = el.scrollLeft;

  notesViewportState.scrollTop = el.scrollTop;

  notesViewportState.zoom = zoom;

}



function clampPatch(patch: NoteUpdate): NoteUpdate {

  const next = { ...patch };

  if (next.x != null) next.x = Math.max(0, next.x);

  if (next.y != null) next.y = Math.max(0, next.y);

  if (next.width != null) next.width = Math.max(MIN_W, next.width);

  if (next.height != null) next.height = Math.max(MIN_H, next.height);

  return next;

}



/** Keep on-screen placement when API responses echo grid-snapped geometry. */

function withLocalGeometry(local: NoteOut, remote: NoteOut): NoteOut {

  return {

    ...remote,

    x: local.x,

    y: local.y,

    width: local.width,

    height: local.height,

  };

}



export function NotesPage() {

  const [notes, setNotes] = useState<NoteOut[]>([]);

  const [loading, setLoading] = useState(true);

  const [zoom, setZoom] = useState(() => notesViewportState.zoom);

  const [panning, setPanning] = useState(false);

  const [spaceDown, setSpaceDown] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  const panOrigin = useRef({ px: 0, py: 0, scrollLeft: 0, scrollTop: 0 });

  const didRestoreScroll = useRef(false);

  const persistTimers = useRef<Map<string, number>>(new Map());

  const pendingPatches = useRef<Map<string, NoteUpdate>>(new Map());



  const refresh = useCallback(async () => {

    setLoading(true);

    try {

      const res = await listNotes();

      setNotes(res.items);

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  const boardW = useMemo(() => {

    const extent = notes.reduce((m, n) => Math.max(m, n.x + n.width), 0);

    return Math.max(MIN_BOARD_W, extent + BOARD_PADDING);

  }, [notes]);



  const boardH = useMemo(() => {

    const extent = notes.reduce((m, n) => Math.max(m, n.y + n.height), 0);

    return Math.max(MIN_BOARD_H, extent + BOARD_PADDING);

  }, [notes]);



  const resetViewport = useCallback(() => {

    const el = viewportRef.current;

    if (!el) return;

    notesViewportState.scrollLeft = 0;

    notesViewportState.scrollTop = 0;

    notesViewportState.zoom = 1;

    setZoom(1);

    requestAnimationFrame(() => {

      el.scrollLeft = 0;

      el.scrollTop = 0;

    });

  }, []);



  useLayoutEffect(() => {

    if (loading) return;

    const el = viewportRef.current;

    if (!el || didRestoreScroll.current) return;

    didRestoreScroll.current = true;

    requestAnimationFrame(() => {

      el.scrollLeft = notesViewportState.scrollLeft;

      el.scrollTop = notesViewportState.scrollTop;

    });

  }, [loading, boardW, boardH, zoom]);



  useEffect(() => {

    const el = viewportRef.current;

    if (!el || loading) return;



    const handleScroll = () => {

      saveNotesViewport(el, zoom);

    };



    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {

      saveNotesViewport(el, zoom);

      el.removeEventListener("scroll", handleScroll);

    };

  }, [loading, zoom]);



  useEffect(() => {

    notesViewportState.zoom = zoom;

  }, [zoom]);



  useEffect(() => {

    const timers = persistTimers.current;

    const patches = pendingPatches.current;

    return () => {

      for (const handle of timers.values()) window.clearTimeout(handle);

      timers.clear();

      patches.clear();

    };

  }, []);



  useEffect(() => {

    function onKeyDown(e: KeyboardEvent) {

      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {

        setSpaceDown(true);

        e.preventDefault();

      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {

        e.preventDefault();

        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 10) / 10));

      }

      if ((e.ctrlKey || e.metaKey) && e.key === "-") {

        e.preventDefault();

        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 10) / 10));

      }

      if ((e.ctrlKey || e.metaKey) && e.key === "0") {

        e.preventDefault();

        setZoom(1);

        resetViewport();

      }

    }

    function onKeyUp(e: KeyboardEvent) {

      if (e.code === "Space") setSpaceDown(false);

    }

    window.addEventListener("keydown", onKeyDown);

    window.addEventListener("keyup", onKeyUp);

    return () => {

      window.removeEventListener("keydown", onKeyDown);

      window.removeEventListener("keyup", onKeyUp);

    };

  }, [resetViewport]);



  function schedulePersist(id: string, patch: NoteUpdate) {

    const merged = { ...(pendingPatches.current.get(id) ?? {}), ...patch };

    pendingPatches.current.set(id, merged);

    const existing = persistTimers.current.get(id);

    if (existing) window.clearTimeout(existing);

    const handle = window.setTimeout(() => {

      const body = pendingPatches.current.get(id);

      pendingPatches.current.delete(id);

      persistTimers.current.delete(id);

      if (!body || Object.keys(body).length === 0) return;

      void updateNote(id, body)

        .then((updated) => {

          setNotes((prev) =>

            prev.map((n) =>

              n.id === id ? withLocalGeometry(n, updated) : n,

            ),

          );

        })

        .catch(() => {

          void refresh();

        });

    }, PERSIST_DEBOUNCE_MS);

    persistTimers.current.set(id, handle);

  }



  function handleChange(id: string, patch: NoteUpdate) {

    const clamped = clampPatch(patch);

    setNotes((prev) =>

      prev.map((n) =>

        n.id === id

          ? { ...n, ...clamped, updated_at: new Date().toISOString() }

          : n,

      ),

    );

    schedulePersist(id, clamped);

  }



  async function handleBringFront(id: string) {

    setNotes((prev) => {

      const maxZ = prev.reduce((m, n) => Math.max(m, n.z_index), 0);

      return prev.map((n) =>

        n.id === id ? { ...n, z_index: maxZ + 1 } : n,

      );

    });

    try {

      const updated = await bringNoteToFront(id);

      setNotes((prev) =>

        prev.map((n) =>

          n.id === id ? withLocalGeometry(n, updated) : n,

        ),

      );

    } catch {

      void refresh();

    }

  }



  async function handleDelete(id: string) {

    const ok = window.confirm("Vols eliminar aquest post-it?");

    if (!ok) return;

    try {

      await deleteNote(id);

      setNotes((prev) => prev.filter((n) => n.id !== id));

      const timer = persistTimers.current.get(id);

      if (timer) window.clearTimeout(timer);

      persistTimers.current.delete(id);

      pendingPatches.current.delete(id);

    } catch {

      /* toast from client; keep note */

    }

  }



  async function handleCreate(at?: { x: number; y: number }) {

    const pos = at

      ? { x: Math.max(0, at.x), y: Math.max(0, at.y) }

      : undefined;

    const note = await createNote(pos ?? {});

    const placed = pos ? { ...note, ...pos } : note;

    setNotes((prev) => [...prev, placed]);

    if (

      pos &&

      (note.x !== pos.x || note.y !== pos.y)

    ) {

      schedulePersist(note.id, pos);

    }

  }



  function boardPointFromClient(clientX: number, clientY: number) {

    const board = boardRef.current;

    if (!board) return { x: 0, y: 0 };

    const rect = board.getBoundingClientRect();

    return {

      x: (clientX - rect.left) / zoom,

      y: (clientY - rect.top) / zoom,

    };

  }



  function onViewportWheel(e: ReactWheelEvent) {

    if (!(e.ctrlKey || e.metaKey)) return;

    e.preventDefault();

    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;

    setZoom((z) =>

      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 10) / 10)),

    );

  }



  function onViewportPointerDown(e: ReactPointerEvent) {

    const viewport = viewportRef.current;

    if (!viewport) return;

    if (e.button === 1 || (e.button === 0 && spaceDown)) {

      e.preventDefault();

      setPanning(true);

      panOrigin.current = {

        px: e.clientX,

        py: e.clientY,

        scrollLeft: viewport.scrollLeft,

        scrollTop: viewport.scrollTop,

      };

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    }

  }



  function onViewportPointerMove(e: ReactPointerEvent) {

    const viewport = viewportRef.current;

    if (!panning || !viewport) return;

    viewport.scrollLeft =

      panOrigin.current.scrollLeft - (e.clientX - panOrigin.current.px);

    viewport.scrollTop =

      panOrigin.current.scrollTop - (e.clientY - panOrigin.current.py);

  }



  function onViewportPointerUp(e: ReactPointerEvent) {

    if (!panning) return;

    setPanning(false);

    try {

      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    } catch {

      /* already released */

    }

  }



  if (loading) {

    return <p className="empty-state">Carregant tauler de notes…</p>;

  }



  return (

    <div className="page-fill notes-page">

      <PageHeader

        title="Notes"

        description="Tauler tipus post-it: arrossega, edita, redimensiona i organitza idees."

      />



      <div className="notes-toolbar toolbar-row">

        <button

          type="button"

          className="btn btn-primary"

          onClick={() => void handleCreate()}

        >

          Nou post-it

        </button>

        <div className="notes-zoom-controls" role="group" aria-label="Zoom">

          <button

            type="button"

            className="btn btn-secondary btn-sm"

            onClick={() =>

              setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 10) / 10))

            }

            aria-label="Allunyar"

          >

            −

          </button>

          <span className="notes-zoom-label">{Math.round(zoom * 100)}%</span>

          <button

            type="button"

            className="btn btn-secondary btn-sm"

            onClick={() =>

              setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 10) / 10))

            }

            aria-label="Apropar"

          >

            +

          </button>

          <button

            type="button"

            className="btn btn-secondary btn-sm"

            onClick={resetViewport}

          >

            Reiniciar vista

          </button>

        </div>

        <p className="notes-hint">

          Doble clic al tauler per crear · Scroll o Espai + arrossegar per desplaçar · Ctrl/Cmd + roda per zoom

        </p>

      </div>



      <div

        ref={viewportRef}

        className={`notes-viewport${panning ? " notes-viewport--panning" : ""}${spaceDown ? " notes-viewport--space" : ""}`}

        onWheel={onViewportWheel}

        onPointerDown={onViewportPointerDown}

        onPointerMove={onViewportPointerMove}

        onPointerUp={onViewportPointerUp}

        onPointerCancel={onViewportPointerUp}

        onDoubleClick={(e) => {

          if ((e.target as HTMLElement).closest(".post-it")) return;

          const pt = boardPointFromClient(e.clientX, e.clientY);

          void handleCreate({

            x: Math.max(0, pt.x - 110),

            y: Math.max(0, pt.y - 40),

          });

        }}

      >

        <div

          className="notes-scroll-surface"

          style={{

            width: `max(100%, ${Math.ceil(boardW * zoom)}px)`,

            height: `max(100%, ${Math.ceil(boardH * zoom)}px)`,

          }}

        >

          <div

            className="notes-board-zoom"

            style={{

              width: Math.ceil(boardW * zoom),

              height: Math.ceil(boardH * zoom),

            }}

          >

            <div

              ref={boardRef}

              className="notes-board"

              style={{

                width: boardW,

                height: boardH,

                transform: `scale(${zoom})`,

              }}

            >

              {notes.map((note) => (

                <PostItNote

                  key={note.id}

                  note={note}

                  scale={zoom}

                  onChange={handleChange}

                  onBringFront={(id) => void handleBringFront(id)}

                  onDelete={(id) => void handleDelete(id)}

                />

              ))}

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}


