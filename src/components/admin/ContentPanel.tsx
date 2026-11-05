"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_CONTENT_TREE,
  HUB_CONTENT_DEFAULTS,
  scopeUsesAppwrite,
  type AdminNavNode,
} from "@/data/admin-nav";
import {
  listResources,
  upsertResource,
  deleteResource,
  uploadLearningFile,
  APPWRITE_PATH_PREFIX,
  type HubId,
  type LearningResource,
  type ContentType,
} from "@/lib/content";
import {
  ChevronRight,
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  Save,
  Upload,
  BookOpen,
  RefreshCw,
  Cloud,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminField,
  AdminInput,
  AdminPageHeader,
  AdminPill,
  AdminSheet,
  AdminTextarea,
  AdminTile,
  AdminTileGrid,
  AdminToast,
} from "./ui";

/**
 * Admin Content library tab.
 *
 * 2026-10-15 (Admin mobile redesign, slice A10): LAYOUT ONLY (2-column folder grid, 44 px targets).
 *
 * 2026-10-16 (Admin UI V2, slice U9 part 3): LAYOUT ONLY. Kit page header, folders as kit tiles (the Appwrite
 * tag is a kit badge), the breadcrumb is a plain div (the kit forbids nav elements), item cards with Edit and
 * Delete pills. The editor (New item / Edit item) is a kit bottom sheet with Save in its footer, and the browser
 * confirm before Delete is a kit bottom sheet (same sentence). Messages are the kit slim toast, which sits above
 * the sheet, so a save error is visible while the editor is open (8 s, as before). The file picker is no longer a
 * label nested inside a label. Navigation (crumbs, enter, goTo), loading, saving, deleting, the Appwrite file id
 * logic, the Meta JSON check and every visible text are unchanged.
 */

type Crumb = { id: string; label: string; node: AdminNavNode };

const AREA = "font-mono break-words";

export default function ContentPanel() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [hub, setHub] = useState<HubId | null>(null);
  const [items, setItems] = useState<LearningResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<LearningResource | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [chapter, setChapter] = useState("");
  const [metaJson, setMetaJson] = useState("{}");
  const [published, setPublished] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [appwriteFileId, setAppwriteFileId] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const current = crumbs[crumbs.length - 1]?.node;
  const scopePath = current?.scopePath;
  const packageId = current?.packageId || "freshman";
  const onAppwrite = scopeUsesAppwrite(scopePath);

  const hubIds = [
    "books",
    "short-notes",
    "videos",
    "flashcards",
    "question-banks",
    "exams",
    "life-savers",
  ];
  const isOnHub =
    Boolean(scopePath) && hubIds.includes(current?.id || "") && Boolean(hub);

  const loadItems = useCallback(async () => {
    if (!scopePath || !hub) return;
    setLoading(true);
    const res = await listResources({ scopePath, hub, skipAuthCheck: true, adminView: true });
    setItems(res.items);
    if (res.error) setToast(res.error);
    setLoading(false);
  }, [scopePath, hub]);

  useEffect(() => {
    if (isOnHub) void loadItems();
  }, [isOnHub, loadItems]);

  function enter(node: AdminNavNode) {
    setCrumbs((c) => [...c, { id: node.id, label: node.label, node }]);
    if (hubIds.includes(node.id)) {
      setHub(node.id as HubId);
    } else {
      setHub(null);
      setItems([]);
    }
    setEditing(null);
  }

  function goTo(index: number) {
    setCrumbs((c) => c.slice(0, index + 1));
    const node = crumbs[index]?.node;
    if (node && hubIds.includes(node.id)) setHub(node.id as HubId);
    else {
      setHub(null);
      setItems([]);
    }
    setEditing(null);
  }

  function resetRoot() {
    setCrumbs([]);
    setHub(null);
    setItems([]);
    setEditing(null);
  }

  function openNew() {
    if (!hub || !scopePath) return;
    const def = HUB_CONTENT_DEFAULTS[hub];
    setIsNew(true);
    setEditing({
      id: "",
      packageId,
      scopePath,
      hub,
      title: "",
      chapter: null,
      sortOrder: items.length * 10,
      contentType: (def?.contentType || "markdown") as ContentType,
      storagePath: null,
      bodyMd: "",
      meta: {},
      published: false,
    });
    setTitle("");
    setBodyMd("");
    setChapter("");
    setMetaJson(
      hub === "flashcards"
        ? JSON.stringify({ cards: [{ front: "Term", back: "Definition" }] }, null, 2)
        : hub === "question-banks" || hub === "exams"
          ? JSON.stringify(
              {
                durationMin: hub === "exams" ? 60 : undefined,
                questions: [
                  {
                    prompt: "Sample question?",
                    choices: ["A", "B", "C", "D"],
                    correct: 0,
                    solution: "Explanation…",
                  },
                ],
              },
              null,
              2
            )
          : "{}"
    );
    setPublished(false);
    setFile(null);
    setAppwriteFileId("");
  }

  function openEdit(item: LearningResource) {
    setIsNew(false);
    setEditing(item);
    setTitle(item.title);
    setBodyMd(item.bodyMd || "");
    setChapter(item.chapter != null ? String(item.chapter) : "");
    setMetaJson(JSON.stringify(item.meta || {}, null, 2));
    setPublished(item.published);
    setFile(null);
    const existingId =
      item.storagePath?.startsWith(APPWRITE_PATH_PREFIX)
        ? item.storagePath.slice(APPWRITE_PATH_PREFIX.length)
        : "";
    setAppwriteFileId(existingId);
  }

  async function save() {
    if (!editing || !hub || !scopePath) return;
    setSaving(true);
    let storagePath = editing.storagePath;

    // Prefer pasted Appwrite file ID (for large textbooks)
    const pastedId = appwriteFileId.trim();
    if (onAppwrite && pastedId) {
      storagePath = `${APPWRITE_PATH_PREFIX}${pastedId}`;
    } else if (file) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${scopePath}/${hub}/${Date.now()}-${safe}`;
      const up = await uploadLearningFile(path, file, { scopePath });
      if (up.error) {
        setToast(up.error);
        setSaving(false);
        return;
      }
      storagePath = up.path || path;
    }

    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(metaJson || "{}");
    } catch {
      setToast("Meta JSON is invalid");
      setSaving(false);
      return;
    }
    const def = HUB_CONTENT_DEFAULTS[hub];
    const res = await upsertResource({
      id: isNew ? undefined : editing.id,
      packageId,
      scopePath,
      hub,
      title: title.trim() || "Untitled",
      chapter: chapter ? Number(chapter) : null,
      sortOrder: editing.sortOrder,
      contentType: (def?.contentType || editing.contentType) as ContentType,
      storagePath,
      bodyMd: bodyMd || null,
      meta,
      published,
    });
    setSaving(false);
    if (!res.ok) {
      setToast(res.error || "Save failed: run learning-content-setup.sql?");
      return;
    }
    setToast(
      published
        ? onAppwrite
          ? "Saved & published (Appwrite)"
          : "Saved & published"
        : onAppwrite
          ? "Saved draft (Appwrite)"
          : "Saved (draft)"
    );
    setEditing(null);
    void loadItems();
  }

  async function remove(id: string) {
    const res = await deleteResource(id);
    if (!res.ok) setToast(res.error || "Delete failed");
    else {
      setToast("Deleted");
      void loadItems();
    }
  }

  async function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (id) await remove(id);
  }

  const listNodes =
    crumbs.length === 0 ? ADMIN_CONTENT_TREE : current?.children || [];

  const fileLabel =
    (hub === "books" || hub === "life-savers" ? "PDF file" : "Optional file") +
    (onAppwrite ? " (Appwrite · max ~4 MB via site)" : "");

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader
        icon={BookOpen}
        title="Content library"
        subtitle="All package PDFs/files → Appwrite · catalog & auth stay on Supabase"
      />

      {isOnHub && (
        <div className="grid grid-cols-2 gap-2">
          <AdminPill icon={RefreshCw} onClick={() => void loadItems()}>
            Refresh
          </AdminPill>
          <AdminPill tone="primary" icon={Plus} onClick={openNew}>
            Add item
          </AdminPill>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-x-1 text-sm">
        <button
          type="button"
          onClick={resetRoot}
          className="inline-flex min-h-[44px] cursor-pointer items-center px-1 font-medium text-amber-300"
        >
          Academy
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id + i} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-wisdom-muted" />
            <button
              type="button"
              onClick={() => goTo(i)}
              className={`inline-flex min-h-[44px] cursor-pointer items-center break-words px-1 text-left ${
                i === crumbs.length - 1 ? "font-semibold text-white" : "text-cyan-300"
              }`}
            >
              {c.label}
            </button>
          </span>
        ))}
      </div>

      {isOnHub && onAppwrite && (
        <AdminCard className="flex items-start gap-1.5">
          <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span className="min-w-0 break-words text-xs text-cyan-200">
            Files upload to Appwrite · large PDFs: paste File ID
          </span>
        </AdminCard>
      )}

      {!isOnHub && (
        <AdminTileGrid>
          {listNodes.map((node) => (
            <AdminTile
              key={node.id}
              icon={FolderOpen}
              label={node.label}
              badge={node.useAppwrite ? <AdminBadge tone="cyan">Appwrite</AdminBadge> : undefined}
              onClick={() => enter(node)}
            />
          ))}
        </AdminTileGrid>
      )}

      {isOnHub && (
        <div className="space-y-3">
          <p className="break-words text-xs text-wisdom-muted">
            Scope <code className="break-all text-cyan-300">{scopePath}</code> · hub{" "}
            <code className="break-all text-cyan-300">{hub}</code>
            {" · "}
            {HUB_CONTENT_DEFAULTS[hub || ""]?.hint}
          </p>

          {loading && <p className="py-6 text-center text-sm text-wisdom-muted">Loading…</p>}
          {!loading && items.length === 0 && !editing && (
            <AdminCard>
              <p className="px-3 py-6 text-center text-sm text-wisdom-muted">
                No items yet. Tap <strong className="text-white">Add item</strong>.
              </p>
            </AdminCard>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <AdminCard key={item.id} className="space-y-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 break-words text-xs text-wisdom-muted">
                    {item.contentType}
                    {item.chapter != null ? ` · ch ${item.chapter}` : ""}
                    {item.published ? " · published" : " · draft"}
                    {item.storagePath?.startsWith("appwrite:") ? " · Appwrite" : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AdminPill tone="gold" icon={Pencil} onClick={() => openEdit(item)}>
                    Edit
                  </AdminPill>
                  <AdminPill tone="danger" icon={Trash2} aria-label="Delete" onClick={() => setPendingDelete(item.id)}>
                    Delete
                  </AdminPill>
                </div>
              </AdminCard>
            ))}
          </div>
        </div>
      )}

      {/* Editor sheet */}
      <AdminSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New item" : "Edit item"}
        footer={
          <AdminPill fullWidth tone="primary" icon={Save} disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </AdminPill>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <AdminField label="Title">
              <AdminInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </AdminField>
            <AdminField label="Chapter # (optional)">
              <AdminInput value={chapter} onChange={(e) => setChapter(e.target.value)} />
            </AdminField>
            {(hub === "books" || hub === "life-savers" || hub === "videos") && (
              <>
                <div className="min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-wisdom-muted">{fileLabel}</span>
                  <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-white">
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-all">{file ? file.name : "Choose file"}</span>
                    <input
                      type="file"
                      accept={hub === "books" || hub === "life-savers" ? "application/pdf" : "*/*"}
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                {onAppwrite && (
                  <AdminField
                    label={`Appwrite File ID ${hub === "life-savers" ? "(for Life Saver PDFs)" : "(for large textbooks)"}`}
                    hint="Upload the PDF in Appwrite → Storage → your bucket → Create file, then copy the File ID here. Skips the 4 MB site limit."
                  >
                    <AdminInput
                      value={appwriteFileId}
                      onChange={(e) => setAppwriteFileId(e.target.value)}
                      placeholder="Paste file ID from Appwrite Console"
                      className="font-mono"
                    />
                  </AdminField>
                )}
              </>
            )}
            {(hub === "short-notes" || hub === "videos") && (
              <AdminField label={hub === "videos" ? "Video URL (or notes)" : "Short notes (Markdown)"}>
                <AdminTextarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  rows={8}
                  className={AREA}
                  placeholder={
                    hub === "videos"
                      ? "https://youtube.com/..."
                      : "## Topic\n\nYour short notes…"
                  }
                />
              </AdminField>
            )}
            {(hub === "flashcards" ||
              hub === "question-banks" ||
              hub === "exams") && (
              <AdminField label="Content JSON (meta)">
                <AdminTextarea
                  value={metaJson}
                  onChange={(e) => setMetaJson(e.target.value)}
                  rows={10}
                  className={AREA}
                />
              </AdminField>
            )}
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-white/90">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-amber-400"
              />
              <span className="min-w-0 break-words">
                Published (visible to students who own the package)
              </span>
            </label>
          </div>
        ) : null}
      </AdminSheet>

      {/* Confirm before deleting */}
      <AdminSheet
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete item"
        footer={
          <div className="flex gap-2">
            <AdminPill fullWidth onClick={() => setPendingDelete(null)}>
              Back
            </AdminPill>
            <AdminPill fullWidth tone="danger" icon={Trash2} onClick={() => void confirmDelete()}>
              Delete
            </AdminPill>
          </div>
        }
      >
        <p className="text-sm text-wisdom-muted">Delete this content item?</p>
      </AdminSheet>

      <AdminToast message={toast || null} onClose={() => setToast("")} durationMs={8000} />
    </div>
  );
}
