"use client";

// Admin UI V2, slice U9 part 4 (2026-10-16): LAYOUT ONLY, kit look. Logic, state, data calls and texts are unchanged.
// Earlier layout slice A11 (2026-10-15) is kept in spirit: no horizontal scrolling, 44 px touch targets, no animate-* / blur / shadow.
// Changes now: kit page header, kit cards, fields, pills and badges; the page chips stay a 2-column grid of buttons (they carry
// a status icon) in the kit gold; the item editor is a kit bottom sheet with Save in its footer; the browser confirm before
// Delete is a kit bottom sheet (same sentence); messages are the kit slim toast (above the sheet, 4.5 s, as before).
// 2026-10-19: the two save-failed fallback messages no longer tell admins to run the old setup SQL script (it must not be run on the live database).

import { useCallback, useEffect, useState } from "react";
import {
  FREE_RESOURCE_LABELS,
  FREE_RESOURCE_SLUGS,
  PAGE_ITEM_KIND,
  NOTE_ONLY_SLUGS,
  listFreeResourcePages,
  listFreeResourceItems,
  upsertFreeResourcePage,
  upsertFreeResourceItem,
  deleteFreeResourceItem,
  uploadFreeResourceFile,
  freeResourcePublicUrl,
  type FreeResourcePage,
  type FreeResourceItem,
  type FreeResourceSlug,
  type FreeResourceItemKind,
} from "@/lib/free-resources";
import { universities } from "@/data/universities";
import {
  BookOpen,
  Save,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Circle,
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
  Star,
  StickyNote,
} from "lucide-react";
import {
  AdminCard,
  AdminField,
  AdminInput,
  AdminPageHeader,
  AdminPill,
  AdminSectionTitle,
  AdminSelect,
  AdminSheet,
  AdminTextarea,
  AdminToast,
} from "./ui";

const CHECK_ROW = "flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-white";
const CHECK_BOX = "h-5 w-5 shrink-0 accent-amber-400";

function emptyMetaFor(kind: FreeResourceItemKind, slug: FreeResourceSlug): Record<string, unknown> {
  if (kind === "success_story") {
    return { studentName: "", program: "", result: "", year: "", quote: "" };
  }
  if (kind === "scholarship") {
    return { organization: "", amount: "", eligibility: "", status: "open" };
  }
  if (kind === "university" || slug === "universities") {
    return { universityId: "" };
  }
  if (kind === "department" || slug === "departments") {
    return { departmentId: "" };
  }
  return {};
}

export default function FreeResourcesPanel() {
  const [pages, setPages] = useState<FreeResourcePage[]>([]);
  const [items, setItems] = useState<FreeResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [activeSlug, setActiveSlug] = useState<FreeResourceSlug>("success-stories");

  const [pageTitle, setPageTitle] = useState("");
  const [pageSubtitle, setPageSubtitle] = useState("");
  const [pageBody, setPageBody] = useState("");
  const [pagePublished, setPagePublished] = useState(false);
  const [pageId, setPageId] = useState<string | undefined>();
  const [savingPage, setSavingPage] = useState(false);

  const [editing, setEditing] = useState<FreeResourceItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [itTitle, setItTitle] = useState("");
  const [itSubtitle, setItSubtitle] = useState("");
  const [itBody, setItBody] = useState("");
  const [itMeta, setItMeta] = useState<Record<string, unknown>>({});
  const [itPublished, setItPublished] = useState(false);
  const [itFeatured, setItFeatured] = useState(false);
  const [itDeadline, setItDeadline] = useState("");
  const [itUrl, setItUrl] = useState("");
  const [itImagePath, setItImagePath] = useState<string | null>(null);
  const [itFile, setItFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const itemKind = PAGE_ITEM_KIND[activeSlug];
  const isNoteOnly = NOTE_ONLY_SLUGS.includes(activeSlug);
  const hasItemList = Boolean(itemKind);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, iRes] = await Promise.all([
      listFreeResourcePages(),
      listFreeResourceItems({ pageSlug: activeSlug }),
    ]);
    setPages(pRes.items);
    setItems(iRes.items);
    if (pRes.error) setToast(pRes.error);
    else if (iRes.error) setToast(iRes.error);
    setLoading(false);
  }, [activeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const page = pages.find((p) => p.slug === activeSlug);
    if (page) {
      setPageId(page.id);
      setPageTitle(page.title);
      setPageSubtitle(page.subtitle || "");
      setPageBody(page.bodyMd || "");
      setPagePublished(page.published);
    } else {
      setPageId(undefined);
      setPageTitle(FREE_RESOURCE_LABELS[activeSlug]);
      setPageSubtitle("");
      setPageBody("");
      setPagePublished(false);
    }
    setEditing(null);
    setIsNew(false);
  }, [activeSlug, pages]);

  async function savePage() {
    setSavingPage(true);
    const res = await upsertFreeResourcePage({
      id: pageId,
      slug: activeSlug,
      title: pageTitle.trim() || FREE_RESOURCE_LABELS[activeSlug],
      subtitle: pageSubtitle.trim() || null,
      bodyMd: pageBody,
      published: pagePublished,
      sortOrder: (FREE_RESOURCE_SLUGS.indexOf(activeSlug) + 1) * 10,
    });
    setSavingPage(false);
    if (!res.ok) {
      setToast(res.error || "Page save failed. Tell the database owner. Do not run the old setup scripts.");
      return;
    }
    setToast(pagePublished ? "Page saved and published" : "Page saved (draft)");
    await load();
  }

  function openNewItem() {
    if (!itemKind) return;
    setIsNew(true);
    setEditing({
      id: "",
      pageSlug: activeSlug,
      kind: itemKind,
      title: "",
      subtitle: null,
      bodyMd: "",
      imagePath: null,
      meta: emptyMetaFor(itemKind, activeSlug),
      featured: false,
      published: false,
      sortOrder: items.length * 10,
      deadline: null,
      externalUrl: null,
      createdAt: "",
      updatedAt: "",
    });
    setItTitle("");
    setItSubtitle("");
    setItBody("");
    setItMeta(emptyMetaFor(itemKind, activeSlug));
    setItPublished(false);
    setItFeatured(false);
    setItDeadline("");
    setItUrl("");
    setItImagePath(null);
    setItFile(null);
  }

  function openEditItem(item: FreeResourceItem) {
    setIsNew(false);
    setEditing(item);
    setItTitle(item.title);
    setItSubtitle(item.subtitle || "");
    setItBody(item.bodyMd || "");
    setItMeta({ ...emptyMetaFor(item.kind, activeSlug), ...item.meta });
    setItPublished(item.published);
    setItFeatured(item.featured);
    setItDeadline(item.deadline || "");
    setItUrl(item.externalUrl || "");
    setItImagePath(item.imagePath);
    setItFile(null);
  }

  async function saveItem() {
    if (!editing || !itemKind) return;
    setSavingItem(true);
    let imagePath = itImagePath;
    if (itFile) {
      const safe = itFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${activeSlug}/${Date.now()}-${safe}`;
      const up = await uploadFreeResourceFile(path, itFile);
      if (up.error) {
        setToast(up.error);
        setSavingItem(false);
        return;
      }
      imagePath = up.path || path;
    }
    const res = await upsertFreeResourceItem({
      id: isNew ? undefined : editing.id,
      pageSlug: activeSlug,
      kind: itemKind,
      title: itTitle.trim() || "Untitled",
      subtitle: itSubtitle.trim() || null,
      bodyMd: itBody,
      imagePath,
      meta: itMeta,
      featured: itFeatured,
      published: itPublished,
      sortOrder: editing.sortOrder,
      deadline: itDeadline || null,
      externalUrl: itUrl.trim() || null,
    });
    setSavingItem(false);
    if (!res.ok) {
      setToast(res.error || "Item save failed. Tell the database owner. Do not run the old setup scripts.");
      return;
    }
    setToast(itPublished ? "Item published" : "Item saved as draft");
    setEditing(null);
    setIsNew(false);
    await load();
  }

  async function removeItem(id: string) {
    const res = await deleteFreeResourceItem(id);
    if (!res.ok) setToast(res.error || "Delete failed");
    else {
      setToast("Deleted");
      if (editing?.id === id) setEditing(null);
      await load();
    }
  }

  async function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (id) await removeItem(id);
  }

  function setMetaField(key: string, value: unknown) {
    setItMeta((m) => ({ ...m, [key]: value }));
  }

  const addLabel =
    itemKind === "success_story"
      ? "Add story"
      : itemKind === "scholarship"
        ? "Add opportunity"
        : "Add note";

  return (
    <div className="min-w-0 space-y-4 break-words">
      <AdminPageHeader
        icon={BookOpen}
        title="Free resources"
        subtitle="Stories and scholarships are full cards. University, department, campus life, and study technique notes only append at the end of the hard-coded guides."
      />

      <AdminPill fullWidth icon={RefreshCw} onClick={() => void load()}>
        {loading ? "Refreshing…" : "Refresh"}
      </AdminPill>

      <div className="grid grid-cols-2 gap-2">
        {FREE_RESOURCE_SLUGS.map((slug) => {
          const page = pages.find((p) => p.slug === slug);
          const isActive = activeSlug === slug;
          const noteOnly = NOTE_ONLY_SLUGS.includes(slug);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setActiveSlug(slug)}
              aria-pressed={isActive}
              className={`flex min-h-[44px] min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-semibold leading-tight ${
                isActive
                  ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                  : "border-white/10 bg-wisdom-card text-wisdom-muted active:bg-white/10"
              }`}
            >
              {noteOnly ? (
                <StickyNote className="h-4 w-4 shrink-0 text-amber-300" />
              ) : page?.published ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 opacity-50" />
              )}
              <span className="min-w-0 break-words">{FREE_RESOURCE_LABELS[slug]}</span>
            </button>
          );
        })}
      </div>

      {!isNoteOnly && (
        <AdminCard className="space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-wisdom-muted">
            Page settings · <code className="break-all normal-case text-cyan-300">{activeSlug}</code>
          </p>
          <a
            href={`/academy/${activeSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-cyan-300"
          >
            Open live page <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <AdminField label="Page title">
            <AdminInput value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
          </AdminField>
          <AdminField label="Subtitle">
            <AdminInput
              value={pageSubtitle}
              onChange={(e) => setPageSubtitle(e.target.value)}
              placeholder="One line under the title"
            />
          </AdminField>

          <AdminField
            label={activeSlug === "scholarships" ? "Tips and guidance (Markdown)" : "Intro blurb (Markdown, optional)"}
          >
            <AdminTextarea
              className="font-mono leading-relaxed"
              rows={activeSlug === "scholarships" ? 10 : 4}
              value={pageBody}
              onChange={(e) => setPageBody(e.target.value)}
              placeholder={"## Heading\n\nYour content…"}
            />
          </AdminField>

          <label className={CHECK_ROW}>
            <input
              type="checkbox"
              className={CHECK_BOX}
              checked={pagePublished}
              onChange={(e) => setPagePublished(e.target.checked)}
            />
            Page published
          </label>
          <AdminPill fullWidth tone="primary" icon={Save} disabled={savingPage} onClick={() => void savePage()}>
            {savingPage ? "Saving…" : "Save page"}
          </AdminPill>
        </AdminCard>
      )}

      {isNoteOnly && (
        <AdminCard tone="gold" className="text-sm text-wisdom-muted">
          <p className="mb-1 flex items-center gap-2 font-semibold text-amber-200">
            <StickyNote className="h-4 w-4 shrink-0" />
            Additive notes only
          </p>
          <p>
            Hard-coded page content stays in code. Notes you publish here appear at the end of the
            matching card or section on the live page.
          </p>
          <a
            href={`/academy/${activeSlug === "universities" ? "universities" : activeSlug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-cyan-300"
          >
            Open live page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </AdminCard>
      )}

      {hasItemList && (
        <div className="space-y-3">
          <AdminSectionTitle>
            {itemKind === "success_story" && "Student stories"}
            {itemKind === "scholarship" && "Opportunity listings"}
            {isNoteOnly && "Published notes"}
            <span className="ml-2 font-normal normal-case">
              {items.length} · {items.filter((i) => i.published).length} live
            </span>
          </AdminSectionTitle>
          <AdminPill fullWidth tone="primary" icon={Plus} onClick={openNewItem}>
            {addLabel}
          </AdminPill>

          {loading && <p className="py-6 text-center text-sm text-wisdom-muted">Loading…</p>}

          {!loading && items.length === 0 && !editing && (
            <AdminCard>
              <p className="py-8 text-center text-sm text-wisdom-muted">
                No items yet. Tap <strong className="text-white">Add</strong> to create the first one.
              </p>
            </AdminCard>
          )}

          <div className="space-y-2">
            {items.map((item) => {
              const uniId = String(item.meta?.universityId || "");
              const uni = universities.find((u) => u.id === uniId);
              return (
                <AdminCard key={item.id} className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                      {item.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={freeResourcePublicUrl(item.imagePath)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-wisdom-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-start gap-2 text-sm font-semibold text-white">
                        <span className="min-w-0 break-words">{item.title}</span>
                        {item.featured && <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                      </p>
                      <p className="break-words text-xs text-wisdom-muted">
                        {uni ? `${uni.abbr} · ${uni.name}` : item.subtitle || item.kind}
                        {item.published ? " · published" : " · draft"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AdminPill tone="gold" icon={Pencil} onClick={() => openEditItem(item)}>
                      Edit
                    </AdminPill>
                    <AdminPill tone="danger" icon={Trash2} aria-label="Delete item" onClick={() => setPendingDelete(item.id)}>
                      Delete
                    </AdminPill>
                  </div>
                </AdminCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Item editor sheet */}
      <AdminSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New item" : "Edit item"}
        footer={
          <AdminPill fullWidth tone="primary" icon={Save} disabled={savingItem} onClick={() => void saveItem()}>
            {savingItem ? "Saving…" : "Save item"}
          </AdminPill>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <AdminField label="Title *">
              <AdminInput value={itTitle} onChange={(e) => setItTitle(e.target.value)} />
            </AdminField>
            <AdminField label="Subtitle">
              <AdminInput value={itSubtitle} onChange={(e) => setItSubtitle(e.target.value)} />
            </AdminField>

            {activeSlug === "universities" && (
              <AdminField label="University *">
                <AdminSelect
                  value={String(itMeta.universityId || "")}
                  onChange={(e) => setMetaField("universityId", e.target.value)}
                >
                  <option value="">Select university…</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.abbr} · {u.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            )}

            {itemKind === "success_story" && (
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Student name">
                  <AdminInput
                    value={String(itMeta.studentName || "")}
                    onChange={(e) => setMetaField("studentName", e.target.value)}
                  />
                </AdminField>
                <AdminField label="Result / score">
                  <AdminInput
                    value={String(itMeta.result || "")}
                    onChange={(e) => setMetaField("result", e.target.value)}
                    placeholder="e.g. 600/600"
                  />
                </AdminField>
                <AdminField label="Program">
                  <AdminInput
                    value={String(itMeta.program || "")}
                    onChange={(e) => setMetaField("program", e.target.value)}
                  />
                </AdminField>
                <AdminField label="Year">
                  <AdminInput
                    value={String(itMeta.year || "")}
                    onChange={(e) => setMetaField("year", e.target.value)}
                  />
                </AdminField>
                <div className="col-span-2">
                  <AdminField label="Quote">
                    <AdminInput
                      value={String(itMeta.quote || "")}
                      onChange={(e) => setMetaField("quote", e.target.value)}
                    />
                  </AdminField>
                </div>
              </div>
            )}

            {itemKind === "scholarship" && (
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Organization">
                  <AdminInput
                    value={String(itMeta.organization || "")}
                    onChange={(e) => setMetaField("organization", e.target.value)}
                  />
                </AdminField>
                <AdminField label="Amount">
                  <AdminInput
                    value={String(itMeta.amount || "")}
                    onChange={(e) => setMetaField("amount", e.target.value)}
                  />
                </AdminField>
                <div className="col-span-2">
                  <AdminField label="Deadline">
                    <AdminInput type="date" value={itDeadline} onChange={(e) => setItDeadline(e.target.value)} />
                  </AdminField>
                </div>
                <div className="col-span-2">
                  <AdminField label="External URL">
                    <AdminInput
                      value={itUrl}
                      onChange={(e) => setItUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </AdminField>
                </div>
                <div className="col-span-2">
                  <AdminField label="Eligibility">
                    <AdminTextarea
                      rows={2}
                      value={String(itMeta.eligibility || "")}
                      onChange={(e) => setMetaField("eligibility", e.target.value)}
                    />
                  </AdminField>
                </div>
              </div>
            )}

            <AdminField label={isNoteOnly ? "Note body (Markdown)" : "Full text / story (Markdown)"}>
              <AdminTextarea
                className="font-mono"
                rows={6}
                value={itBody}
                onChange={(e) => setItBody(e.target.value)}
              />
            </AdminField>

            {!isNoteOnly && (
              <AdminField label="Photo">
                <AdminInput
                  type="file"
                  accept="image/*"
                  className="file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1 file:text-cyan-200"
                  onChange={(e) => setItFile(e.target.files?.[0] || null)}
                />
              </AdminField>
            )}

            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                className={CHECK_BOX}
                checked={itPublished}
                onChange={(e) => setItPublished(e.target.checked)}
              />
              Published
            </label>
            {!isNoteOnly && (
              <label className={CHECK_ROW}>
                <input
                  type="checkbox"
                  className={CHECK_BOX}
                  checked={itFeatured}
                  onChange={(e) => setItFeatured(e.target.checked)}
                />
                Featured
              </label>
            )}
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
        <p className="text-sm text-wisdom-muted">Delete this item permanently?</p>
      </AdminSheet>

      <AdminToast message={toast || null} onClose={() => setToast("")} durationMs={4500} />
    </div>
  );
}
