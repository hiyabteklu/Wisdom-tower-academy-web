"use client";

/**
 * Notifications v2, slices R3-b2 to R3-b4 (sessions R3-C, R3-D, R3-E). `[~]` NOT compiled, not opened in a browser.
 *
 * The composer for the admin Notifications tab. Three categories only (owner order 2026-10-15):
 *   Admin announcement -> students read it inside Notifications (no navigation)
 *   New material release -> opens the subject or hub picked with the path selector
 *   Contest -> opens the Contest (trophy) screen; the server forces the url to /competitions
 * Steps: 1 Category, 2 Write (block editor + gold preview), 3 Destination, 4 Audience (chips with live counts,
 * or one student), 5 When (send now, or schedule in Ethiopia time).
 * Send now: POST /api/notifications/send (v2 mode). Schedule / edit: the database functions
 * admin_schedule_notification_v2 / admin_update_scheduled_notification_v2 (admin's own session).
 * Scheduling works for groups of students only (the scheduler has no single-student target).
 * Editing a waiting row (`editRow`) loads it into the form; saving updates that row.
 *
 * 2026-10-15 (Admin mobile redesign, slice A6 part 2): LAYOUT ONLY (compact category tiles, 44 px controls,
 * full-width submit pill). Logic, state, validation and API calls are unchanged.
 *
 * 2026-10-16 (Admin UI V2, slice U4 part 3c): LAYOUT ONLY. Kit card, kit fields (AdminField / AdminInput /
 * AdminSelect), gold selected category tile, kit primary pill, and a bottom sheet instead of the browser
 * confirm box before "Send now" (same message; pressing Send runs the same checks again and then sends).
 * One small change: scrolling to the form when Edit is pressed is no longer animated (the admin layout turns
 * smooth scrolling off because it may fight touch scrolling in the WebView).
 *
 * 2026-11-06 (Drafts): a "Drafts" card above step 1 (NotificationDraftsPicker, data in
 * src/lib/notification-drafts.ts). Load fills category, title, blocks and destination; it never sends and
 * never picks an audience. Hidden while a scheduled row is being edited. Send / schedule logic unchanged.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, Clock, Megaphone, Send, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  isNotificationCategory,
  previewFromContent,
  sanitizeContent,
  type NotificationCategory,
} from "@/lib/notification-v2";
import {
  contentToEditor,
  editorToContent,
  newEditorBlock,
  type EditorBlock,
} from "@/lib/notification-authoring";
import {
  NOTIFICATION_PATH_TREE,
  findNotificationPath,
  type NotificationPathNode,
} from "@/lib/notification-paths";
import type { NotificationDraft } from "@/lib/notification-drafts";
import { NotificationBlockEditor, NotificationPreview } from "./NotificationBlockEditor";
import NotificationAudiencePicker from "./NotificationAudiencePicker";
import NotificationDraftsPicker from "./NotificationDraftsPicker";
import {
  formatEat,
  friendlyScheduleError,
  type ScheduledRowV2,
} from "./ScheduledNotificationsPanel";
import { AdminCard, AdminField, AdminInput, AdminPill, AdminSelect, AdminSheet } from "./ui";

const EAT_OFFSET = "+03:00";

const CATEGORIES: {
  id: NotificationCategory;
  label: string;
  hint: string;
  Icon: typeof Megaphone;
}[] = [
  {
    id: "admin",
    label: "Admin announcement",
    hint: "Students read it inside Notifications. It does not take them anywhere.",
    Icon: Megaphone,
  },
  {
    id: "material",
    label: "New material release",
    hint: "Opens the subject or hub you pick below.",
    Icon: BookOpen,
  },
  {
    id: "contest",
    label: "Contest",
    hint: "Opens the Contest (trophy) screen. Nothing to choose.",
    Icon: Trophy,
  },
];

const RADIO_LABEL_CLASS =
  "inline-flex items-center gap-2 min-h-[44px] cursor-pointer text-sm text-white";

const STEP_TITLE = "text-sm font-bold text-white";

function childrenAfter(trail: string[]): NotificationPathNode[] {
  let level = NOTIFICATION_PATH_TREE;
  for (const id of trail) {
    const node = level.find((n) => n.id === id);
    if (!node || !node.children) return [];
    level = node.children;
  }
  return level;
}

/** The deepest chosen node that has a public path. */
function pathFromTrail(trail: string[]): string | null {
  let level = NOTIFICATION_PATH_TREE;
  let path: string | null = null;
  for (const id of trail) {
    const node = level.find((n) => n.id === id);
    if (!node) break;
    if (node.path) path = node.path;
    level = node.children ?? [];
  }
  return path;
}

/** Picker trail (node ids) that ends on the node with this public path, or null. */
function trailForPath(
  path: string,
  nodes: NotificationPathNode[] = NOTIFICATION_PATH_TREE,
  trail: string[] = []
): string[] | null {
  for (const node of nodes) {
    const next = [...trail, node.id];
    if (node.path === path) return next;
    if (node.children) {
      const found = trailForPath(path, node.children, next);
      if (found) return found;
    }
  }
  return null;
}

/** ISO instant -> the value of a datetime-local input in Ethiopia time (UTC+3). */
function toEatInput(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function initialBlocks(): EditorBlock[] {
  return [newEditorBlock("title"), newEditorBlock("p")];
}

export default function NotificationComposerV2({
  onSent,
  onScheduled,
  editRow,
  onEditDone,
}: {
  onSent?: () => void;
  onScheduled?: () => void;
  editRow?: ScheduledRowV2 | null;
  onEditDone?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [category, setCategory] = useState<NotificationCategory>("admin");
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks);
  const [trail, setTrail] = useState<string[]>([]);
  const [mode, setMode] = useState<"groups" | "user">("groups");
  const [groups, setGroups] = useState<string[]>([]);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [targetUser, setTargetUser] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAtLocal, setSendAtLocal] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmWho, setConfirmWho] = useState<string | null>(null);

  const editing = Boolean(editRow);
  const pickedPath = category === "material" ? pathFromTrail(trail) : null;
  const pickedChoice = pickedPath ? findNotificationPath(pickedPath) : undefined;

  // Load a waiting row into the form when the admin presses Edit.
  useEffect(() => {
    if (!editRow) return;
    setCategory(isNotificationCategory(editRow.category) ? editRow.category : "admin");
    setTitle(editRow.title);
    const parsed = editRow.content ? sanitizeContent(editRow.content) : null;
    setBlocks(
      parsed && parsed.ok ? contentToEditor(parsed.content) : [newEditorBlock("p", editRow.body)]
    );
    setTrail(editRow.url ? trailForPath(editRow.url) ?? [] : []);
    setMode("groups");
    setGroups(editRow.audiences ?? []);
    setWhen("later");
    setSendAtLocal(toEatInput(editRow.send_at));
    setFeedback(null);
    rootRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [editRow]);

  function setLevel(depth: number, id: string) {
    const next = trail.slice(0, depth);
    if (id) next.push(id);
    setTrail(next);
  }

  function resetForm() {
    setTitle("");
    setBlocks(initialBlocks());
    setSendAtLocal("");
  }

  // Fill the whole form from a ready-made draft. Never sends; the audience is left for the admin to pick.
  function loadDraft(draft: NotificationDraft) {
    setCategory(draft.category);
    setTitle(draft.title);
    setBlocks(draft.blocks.map((b) => newEditorBlock(b.t, b.text ?? "")));
    setTrail(draft.category === "material" && draft.url ? trailForPath(draft.url) ?? [] : []);
    setMode("groups");
    setGroups([]);
    setTargetUser("");
    setWhen("now");
    setSendAtLocal("");
    setFeedback({
      ok: true,
      message: `Draft "${draft.name}" loaded. Check it, choose the audience, then press Send now.`,
    });
    rootRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  // skipConfirm is true only when the admin pressed Send in the confirm sheet (the checks run again).
  async function handleSubmit(skipConfirm = false) {
    setFeedback(null);
    const content = editorToContent(blocks);
    if (!title.trim()) {
      setFeedback({ ok: false, message: "Write the notification title first." });
      return;
    }
    if (!content) {
      setFeedback({ ok: false, message: "Write the message (add a paragraph with some text)." });
      return;
    }
    if (category === "material" && !pickedPath) {
      setFeedback({ ok: false, message: "Pick where this material notice should open." });
      return;
    }
    const later = when === "later" || editing;
    if (later && mode === "user") {
      setFeedback({
        ok: false,
        message: "Scheduling works for groups of students. Use Send now for one student.",
      });
      return;
    }
    if (mode === "user" && !targetUser.trim()) {
      setFeedback({ ok: false, message: "Enter the student's user id." });
      return;
    }

    let sendAtIso = "";
    if (later) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sendAtLocal)) {
        setFeedback({ ok: false, message: "Pick the date and time to send (Ethiopia time)." });
        return;
      }
      const sendAt = new Date(`${sendAtLocal}:00${EAT_OFFSET}`);
      if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now() + 60_000) {
        setFeedback({
          ok: false,
          message: "Pick a time at least one minute from now (Ethiopia time).",
        });
        return;
      }
      sendAtIso = sendAt.toISOString();
    } else if (mode === "groups" && !skipConfirm) {
      const who =
        groups.length === 0
          ? "EVERY student"
          : groupCount === null
          ? "the selected groups"
          : `${groupCount} student(s)`;
      setConfirmWho(who);
      return;
    }

    setSending(true);
    try {
      if (later) {
        const preview = previewFromContent(content) || title.trim();
        const common = {
          p_title: title.trim(),
          p_body: preview,
          p_send_at: sendAtIso,
          p_category: category,
          p_content: content,
          p_url: category === "material" ? pickedPath : null,
          p_audiences: groups.length > 0 ? groups : null,
        };
        const { error } = editRow
          ? await supabase.rpc("admin_update_scheduled_notification_v2", { p_id: editRow.id, ...common })
          : await supabase.rpc("admin_schedule_notification_v2", common);
        if (error) {
          setFeedback({ ok: false, message: friendlyScheduleError(error.message) });
          return;
        }
        setFeedback({
          ok: true,
          message: `${editing ? "Changes saved. " : "Scheduled. "}It goes out at ${formatEat(
            sendAtIso
          )} (within a minute after that).`,
        });
        resetForm();
        setWhen("now");
        onScheduled?.();
        onEditDone?.();
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setFeedback({ ok: false, message: "Your admin session has expired. Please sign in again." });
        return;
      }

      const payload: Record<string, unknown> = {
        title: title.trim(),
        category,
        content,
      };
      if (category === "material" && pickedPath) payload.url = pickedPath;
      if (mode === "user") payload.target = targetUser.trim();
      else payload.audiences = groups;

      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setFeedback({ ok: false, message: data.error || "Failed to send the notification." });
        return;
      }

      const recipients = typeof data.recipients === "number" ? data.recipients : 0;
      const pushed = typeof data.pushed === "number" ? data.pushed : null;
      setFeedback({
        ok: true,
        message:
          "Sent. " +
          (data.broadcast ? "Everyone can see it. " : recipients > 0 ? `Students reached: ${recipients}. ` : "") +
          (pushed !== null ? `Push sent to ${pushed} device(s).` : ""),
      });
      resetForm();
      onSent?.();
    } catch (err: unknown) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSending(false);
    }
  }

  const levels: NotificationPathNode[][] = [];
  if (category === "material") {
    for (let depth = 0; depth <= trail.length; depth += 1) {
      const options = childrenAfter(trail.slice(0, depth));
      if (options.length === 0) break;
      levels.push(options);
    }
  }

  const later = when === "later" || editing;
  const activeCategory = CATEGORIES.find((c) => c.id === category);

  return (
    <div ref={rootRef}>
      <AdminCard className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">
              {editing ? "Edit scheduled notification" : "New notification"}
            </h3>
            <p className="mt-0.5 text-xs text-wisdom-muted">
              1 Category, 2 Write, 3 Destination, 4 Audience, 5 When, then send.
            </p>
          </div>
          {editing && (
            <AdminPill
              className="shrink-0"
              onClick={() => {
                resetForm();
                setWhen("now");
                setFeedback(null);
                onEditDone?.();
              }}
            >
              Stop editing
            </AdminPill>
          )}
        </div>

        {feedback && (
          <div
            className={`flex items-start gap-2.5 rounded-2xl border p-3 text-xs ${
              feedback.ok
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-400/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 break-words">{feedback.message}</span>
          </div>
        )}

        {/* Drafts (ready-made messages; Load only fills the form) */}
        {!editing && <NotificationDraftsPicker onLoad={loadDraft} />}

        {/* 1 Category */}
        <div className="space-y-2">
          <p className={STEP_TITLE}>1. Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(({ id, label, Icon }) => {
              const active = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2 text-center ${
                    active
                      ? "border-amber-400/40 bg-amber-500/15"
                      : "border-white/10 bg-wisdom-card active:bg-white/10"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "text-amber-300" : "text-wisdom-muted"}`} />
                  <span className="block text-xs font-bold leading-tight text-white">{label}</span>
                </button>
              );
            })}
          </div>
          {activeCategory && (
            <p className="text-xs leading-relaxed text-wisdom-muted">{activeCategory.hint}</p>
          )}
        </div>

        {/* 2 Write */}
        <div className="space-y-3">
          <p className={STEP_TITLE}>2. Write</p>
          <AdminField label="Notification title (shown on the phone and in the list) *">
            <AdminInput
              type="text"
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Exam schedule update"
            />
          </AdminField>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <NotificationBlockEditor value={blocks} onChange={setBlocks} />
            <div>
              <p className="mb-2 text-xs text-wisdom-muted">Live preview (reading view)</p>
              <NotificationPreview blocks={blocks} />
            </div>
          </div>
        </div>

        {/* 3 Destination */}
        <div className="space-y-2">
          <p className={STEP_TITLE}>3. Destination</p>
          {category === "admin" && (
            <p className="text-xs text-wisdom-muted">
              None. A tap opens the full-screen reading view inside Notifications.
            </p>
          )}
          {category === "contest" && (
            <p className="text-xs text-wisdom-muted">
              Automatic: a tap opens the Contest (trophy) screen.
            </p>
          )}
          {category === "material" && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                {levels.map((options, depth) => (
                  <AdminSelect
                    key={depth}
                    value={trail[depth] ?? ""}
                    onChange={(e) => setLevel(depth, e.target.value)}
                  >
                    <option value="">
                      {depth === 0 ? "Choose a group…" : "Choose (optional, deeper)…"}
                    </option>
                    {options.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </AdminSelect>
                ))}
              </div>
              <p className="break-words text-xs text-slate-400">
                This opens:{" "}
                {pickedChoice ? (
                  <>
                    <span className="text-amber-300">{pickedChoice.crumbs.join(" › ")}</span>{" "}
                    <span className="break-all font-mono text-slate-500">({pickedChoice.path})</span>
                  </>
                ) : (
                  <span className="text-slate-500">nothing picked yet (choose at least a subject or course)</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* 4 Audience */}
        <div className="space-y-2">
          <p className={STEP_TITLE}>4. Audience</p>
          <div className="flex flex-wrap gap-x-5">
            <label className={RADIO_LABEL_CLASS}>
              <input
                type="radio"
                name="v2audience"
                checked={mode === "groups"}
                onChange={() => setMode("groups")}
                className="h-5 w-5 accent-amber-300"
              />
              <span>Groups of students</span>
            </label>
            {!later && (
              <label className={RADIO_LABEL_CLASS}>
                <input
                  type="radio"
                  name="v2audience"
                  checked={mode === "user"}
                  onChange={() => setMode("user")}
                  className="h-5 w-5 accent-amber-300"
                />
                <span>One student (user id)</span>
              </label>
            )}
          </div>
          {mode === "groups" || later ? (
            <NotificationAudiencePicker
              value={groups}
              onChange={setGroups}
              onCountChange={setGroupCount}
            />
          ) : (
            <AdminInput
              type="text"
              value={targetUser}
              onChange={(e) => setTargetUser(e.target.value)}
              placeholder="Student user id (UUID)"
            />
          )}
        </div>

        {/* 5 When */}
        <div className="space-y-2">
          <p className={STEP_TITLE}>5. When</p>
          {!editing && (
            <div className="flex flex-wrap gap-x-5">
              <label className={RADIO_LABEL_CLASS}>
                <input
                  type="radio"
                  name="v2when"
                  checked={when === "now"}
                  onChange={() => setWhen("now")}
                  className="h-5 w-5 accent-amber-300"
                />
                <span>Send now</span>
              </label>
              <label className={RADIO_LABEL_CLASS}>
                <input
                  type="radio"
                  name="v2when"
                  checked={when === "later"}
                  onChange={() => {
                    setWhen("later");
                    setMode("groups");
                  }}
                  className="h-5 w-5 accent-amber-300"
                />
                <span>Schedule for later</span>
              </label>
            </div>
          )}
          {later && (
            <AdminField
              label="Send at (Ethiopia time)"
              hint="Checked every minute. Whatever the time zone of this device, the time typed here is Ethiopia time."
            >
              <AdminInput
                type="datetime-local"
                value={sendAtLocal}
                onChange={(e) => setSendAtLocal(e.target.value)}
              />
            </AdminField>
          )}
        </div>

        <AdminPill
          tone="primary"
          fullWidth
          icon={later ? Clock : Send}
          onClick={() => void handleSubmit()}
          disabled={sending}
        >
          {sending ? "Working..." : editing ? "Save changes" : later ? "Schedule" : "Send now"}
        </AdminPill>
      </AdminCard>

      {/* Confirm before sending to students now */}
      <AdminSheet
        open={confirmWho !== null}
        onClose={() => setConfirmWho(null)}
        title="Send now"
        footer={
          <div className="flex gap-2">
            <AdminPill fullWidth onClick={() => setConfirmWho(null)}>
              Cancel
            </AdminPill>
            <AdminPill
              fullWidth
              tone="primary"
              icon={Send}
              onClick={() => {
                setConfirmWho(null);
                void handleSubmit(true);
              }}
            >
              Send
            </AdminPill>
          </div>
        }
      >
        <p className="break-words text-sm text-white">Send this to {confirmWho} now? This cannot be undone.</p>
      </AdminSheet>
    </div>
  );
}
