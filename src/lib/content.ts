/** Learning content CRUD + progress (Supabase metadata + hybrid storage). */

import {
  supabase,
  cleanCorruptAuthTokens,
  getAnonSupabaseClient,
} from "@/lib/supabase";
import { scopeUsesAppwrite } from "@/data/admin-nav";

export type HubId =
  | "books"
  | "short-notes"
  | "videos"
  | "flashcards"
  | "question-banks"
  | "exams"
  | "life-savers";

export type ContentType =
  | "pdf"
  | "markdown"
  | "video_url"
  | "quiz"
  | "exam"
  | "flashcard_deck";

export type LearningResource = {
  id: string;
  packageId: string;
  scopePath: string;
  hub: HubId;
  title: string;
  chapter: number | null;
  sortOrder: number;
  contentType: ContentType;
  storagePath: string | null;
  bodyMd: string | null;
  meta: Record<string, unknown>;
  published: boolean;
  createdAt?: string;
};

export type ResourceInput = {
  id?: string;
  packageId: string;
  scopePath: string;
  hub: HubId;
  title: string;
  chapter?: number | null;
  sortOrder?: number;
  contentType: ContentType;
  storagePath?: string | null;
  bodyMd?: string | null;
  meta?: Record<string, unknown>;
  published?: boolean;
};

export type ProgressMeta = {
  quiz?: {
    attempted: number;
    correct: number;
    total: number;
    accuracy: number;
    submitted?: boolean;
    wrong?: number;
    skipped?: number;
    elapsedSec?: number;
  };
  flashcards?: {
    know: number;
    learning: number;
    again: number;
    seen: number;
    total: number;
    accuracy: number;
  };
  video?: {
    watchSeconds: number;
    lastPosition?: number;
  };
  [key: string]: unknown;
};

export type ScopeProgressRow = {
  resourceId: string;
  title: string;
  hub: HubId;
  contentType: ContentType;
  progressPct: number;
  totalSeconds: number;
  focusSeconds: number;
  lastOpenedAt: string | null;
  meta: ProgressMeta;
};

export type ScopeStats = {
  rows: ScopeProgressRow[];
  totalStudySeconds: number;
  totalFocusSeconds: number;
  avgProgressPct: number;
  avgFocusLabel: string;
  quizAttempted: number;
  quizCorrect: number;
  quizWrong: number;
  flashKnow: number;
  flashAgain: number;
  flashLearning: number;
  videoWatchSeconds: number;
  examScores: number[];
  avgExamPercent: number;
  streakDays: number;
};

export function focusStatusLabel(focusSec: number, totalSec: number): string {
  if (totalSec < 20) return "Getting started";
  const ratio = focusSec / Math.max(1, totalSec);
  if (ratio >= 0.75) return "Focused";
  if (ratio >= 0.5) return "Steady";
  if (ratio >= 0.25) return "Skimming";
  return "Distracted";
}

function rowToResource(row: Record<string, unknown>): LearningResource {
  const rawHub = String(row.hub);
  const hub = (rawHub === "references" ? "short-notes" : rawHub) as HubId;
  return {
    id: String(row.id),
    packageId: String(row.package_id),
    scopePath: String(row.scope_path),
    hub,
    title: String(row.title),
    chapter: row.chapter != null ? Number(row.chapter) : null,
    sortOrder: Number(row.sort_order ?? 0),
    contentType: row.content_type as ContentType,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    bodyMd: row.body_md != null ? String(row.body_md) : null,
    meta: (row.meta as Record<string, unknown>) || {},
    published: Boolean(row.published),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

function isCryptoOrTokenError(msg?: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("no suitable key") ||
    m.includes("wrong key type") ||
    m.includes("crypto") ||
    m.includes("jwt") ||
    m.includes("token") ||
    m.includes("key type") ||
    m.includes("pgrst301") ||
    m.includes("jwk") ||
    m.includes("signature")
  );
}

export async function listResources(opts: {
  scopePath?: string;
  hub?: HubId;
  packageId?: string;
  publishedOnly?: boolean;
  skipAuthCheck?: boolean;
}): Promise<{ items: LearningResource[]; error?: string }> {
  try {
    if (!opts.skipAuthCheck) {
      let hasUser = false;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        hasUser = Boolean(session?.user);
      } catch {
        cleanCorruptAuthTokens();
      }
      if (!hasUser && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("wt-academy-auth-v1");
          if (raw && JSON.parse(raw)?.user) hasUser = true;
        } catch {}
      }
      if (!hasUser) {
        return {
          items: [],
          error: "Sign in required to access learning content.",
        };
      }
    }

    let q = supabase.from("learning_resources").select("*").order("sort_order", {
      ascending: true,
    });

    const eceMatch = opts.scopePath?.match(/^ece\/(sem-[12])\/([^/]+)$/);
    if (opts.scopePath) {
      if (eceMatch) {
        const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
        const swappedPath = `ece/${otherSem}/${eceMatch[2]}`;
        q = q.in("scope_path", [opts.scopePath, swappedPath]);
      } else if (
        opts.scopePath === "freshman/math-natural" ||
        opts.scopePath === "freshman/mathematics"
      ) {
        q = q.in("scope_path", ["freshman/math-natural", "freshman/mathematics"]);
      } else {
        q = q.eq("scope_path", opts.scopePath);
      }
    }
    if (opts.hub === "short-notes") {
      q = q.in("hub", ["short-notes", "references"]);
    } else if (opts.hub) {
      q = q.eq("hub", opts.hub);
    }
    if (opts.packageId) {
      if (opts.packageId === "ece-y3-sem-1" || opts.packageId === "ece-y3-sem-2") {
        q = q.in("package_id", ["ece-y3-sem-1", "ece-y3-sem-2"]);
      } else {
        q = q.eq("package_id", opts.packageId);
      }
    }
    if (opts.publishedOnly) q = q.eq("published", true);

    let { data, error } = await q;

    // If PostgREST rejected because of a corrupt/invalid JWT token, retry with clean anonymous client
    if (error && isCryptoOrTokenError(error.message)) {
      cleanCorruptAuthTokens();
      try {
        const anon = getAnonSupabaseClient();
        let retryQ = anon.from("learning_resources").select("*").order("sort_order", {
          ascending: true,
        });
        if (opts.scopePath) {
          if (eceMatch) {
            const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
            const swappedPath = `ece/${otherSem}/${eceMatch[2]}`;
            retryQ = retryQ.in("scope_path", [opts.scopePath, swappedPath]);
          } else if (
            opts.scopePath === "freshman/math-natural" ||
            opts.scopePath === "freshman/mathematics"
          ) {
            retryQ = retryQ.in("scope_path", ["freshman/math-natural", "freshman/mathematics"]);
          } else {
            retryQ = retryQ.eq("scope_path", opts.scopePath);
          }
        }
        if (opts.hub === "short-notes") {
          retryQ = retryQ.in("hub", ["short-notes", "references"]);
        } else if (opts.hub) {
          retryQ = retryQ.eq("hub", opts.hub);
        }
        if (opts.packageId) {
          if (opts.packageId === "ece-y3-sem-1" || opts.packageId === "ece-y3-sem-2") {
            retryQ = retryQ.in("package_id", ["ece-y3-sem-1", "ece-y3-sem-2"]);
          } else {
            retryQ = retryQ.eq("package_id", opts.packageId);
          }
        }
        if (opts.publishedOnly) retryQ = retryQ.eq("published", true);

        const retryRes = await retryQ;
        if (retryRes.data && retryRes.data.length > 0) {
          data = retryRes.data;
          error = null;
        } else if (!retryRes.error) {
          data = retryRes.data || [];
          error = null;
        }
      } catch {
        /* ignore */
      }
    }

    // Fallback: If no items found for an ECE course, search by course slug
    if ((!data || data.length === 0) && eceMatch) {
      const courseSlug = eceMatch[2];
      let fallbackQ = supabase
        .from("learning_resources")
        .select("*")
        .ilike("scope_path", `%${courseSlug}%`)
        .order("sort_order", { ascending: true });

      if (opts.hub === "short-notes") {
        fallbackQ = fallbackQ.in("hub", ["short-notes", "references"]);
      } else if (opts.hub) {
        fallbackQ = fallbackQ.eq("hub", opts.hub);
      }
      if (opts.publishedOnly) fallbackQ = fallbackQ.eq("published", true);

      let fallbackRes = await fallbackQ;
      if (fallbackRes.error && isCryptoOrTokenError(fallbackRes.error.message)) {
        cleanCorruptAuthTokens();
        try {
          const anon = getAnonSupabaseClient();
          let anonFallbackQ = anon
            .from("learning_resources")
            .select("*")
            .ilike("scope_path", `%${courseSlug}%`)
            .order("sort_order", { ascending: true });
          if (opts.hub === "short-notes") {
            anonFallbackQ = anonFallbackQ.in("hub", ["short-notes", "references"]);
          } else if (opts.hub) {
            anonFallbackQ = anonFallbackQ.eq("hub", opts.hub);
          }
          if (opts.publishedOnly) anonFallbackQ = anonFallbackQ.eq("published", true);
          fallbackRes = await anonFallbackQ;
        } catch {
          /* ignore */
        }
      }
      if (fallbackRes.data && fallbackRes.data.length > 0) {
        data = fallbackRes.data;
        error = null;
      }
    }

    // Server-side API fallback: if client queries returned 0 items or errored, fetch via same-origin route
    if ((!data || data.length === 0 || error) && typeof window !== "undefined") {
      try {
        const params = new URLSearchParams();
        if (opts.scopePath) params.set("scopePath", opts.scopePath);
        if (opts.hub) params.set("hub", opts.hub);
        if (opts.packageId) params.set("packageId", opts.packageId);
        if (opts.publishedOnly) params.set("publishedOnly", "true");
        const { data: authData } = await supabase.auth.getSession();
        const accessToken = authData.session?.access_token;
        const apiRes = await fetch(`/api/content/resources?${params.toString()}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          cache: "no-store",
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (Array.isArray(json?.items) && json.items.length > 0) {
            return { items: json.items };
          }
        }
      } catch {
        /* ignore fetch failure */
      }
    }

    if (error) {
      if (isCryptoOrTokenError(error.message)) {
        cleanCorruptAuthTokens();
        return {
          items: [],
          error: "Unable to load materials right now. Tap Retry to reconnect.",
        };
      }
      return {
        items: [],
        error: "Unable to load materials right now. Please check your connection and retry.",
      };
    }

    // Auto-heal in background: if any ECE items still had the old scope_path or package_id, normalize them
    if (data && data.length > 0 && eceMatch && opts.scopePath) {
      try {
        const targetScope = opts.scopePath;
        const targetPackage = eceMatch[1] === "sem-1" ? "ece-y3-sem-1" : "ece-y3-sem-2";
        for (const row of data) {
          const r = row as Record<string, unknown>;
          if (r.scope_path !== targetScope || r.package_id !== targetPackage) {
            void supabase
              .from("learning_resources")
              .update({
                scope_path: targetScope,
                package_id: targetPackage,
                updated_at: new Date().toISOString(),
              })
              .eq("id", r.id);
          }
        }
      } catch {
        /* background heal is non-critical */
      }
    }

    return {
      items: (data || []).map((r) => {
        const item = rowToResource(r as Record<string, unknown>);
        if (eceMatch && opts.scopePath) {
          item.scopePath = opts.scopePath;
          item.packageId = eceMatch[1] === "sem-1" ? "ece-y3-sem-1" : "ece-y3-sem-2";
        }
        return item;
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (isCryptoOrTokenError(msg)) {
      cleanCorruptAuthTokens();
      return {
        items: [],
        error: "Unable to load materials right now. Tap Retry to reconnect.",
      };
    }
    return {
      items: [],
      error: "Unable to load materials right now. Please check your connection and retry.",
    };
  }
}

export async function getResourceById(
  id: string
): Promise<{ item?: LearningResource; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("open_resource_web", { p_id: id });
    if (error) return { error: "Unable to verify access to this material. Please retry." };
    const answer = data as Record<string, unknown> | null;
    const status = String(answer?.status || "");
    if (status === "not_signed_in") return { error: "Sign in to open this material." };
    if (status === "device_not_active") return { error: "This account is active on another device. Review your account device settings." };
    if (status === "not_found") return { error: "This material is no longer available." };
    if (status === "locked") {
      return {
        error: answer?.gate === "package_required"
          ? "Purchase or unlock the required package to open this material."
          : "This material is not available yet.",
      };
    }
    if (status !== "ok" || !answer?.row || typeof answer.row !== "object") {
      return { error: "The server returned an unexpected access response." };
    }
    return { item: rowToResource(answer.row as Record<string, unknown>) };
  } catch {
    return { error: "Unable to verify access to this material. Please retry." };
  }
}

/** Requests a short-lived Appwrite URL for a paid PDF through the JWT-verified Edge Function. */
export async function getPaidBookUrl(
  resourceId: string
): Promise<{ url?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("book-url", {
      body: { id: resourceId, client_type: "web" },
    });
    if (error) return { error: "Unable to verify access to this paid PDF. Please retry." };
    const answer = data as Record<string, unknown> | null;
    if (answer?.status === "ok" && typeof answer.url === "string" && answer.url.startsWith("https://")) {
      return { url: answer.url };
    }
    if (answer?.status === "locked") return { error: "Purchase or unlock the required package to open this PDF." };
    if (answer?.status === "device_not_active") return { error: "This account is active on another device. Review your account device settings." };
    if (answer?.status === "not_signed_in") return { error: "Sign in to open this PDF." };
    return { error: "This paid PDF is not available right now." };
  } catch {
    return { error: "Unable to open this paid PDF. Please retry." };
  }
}

export async function upsertResource(
  input: ResourceInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload: Record<string, unknown> = {
    package_id: input.packageId,
    scope_path: input.scopePath,
    hub: input.hub,
    title: input.title.trim(),
    chapter: input.chapter ?? null,
    sort_order: input.sortOrder ?? 0,
    content_type: input.contentType,
    storage_path: input.storagePath || null,
    body_md: input.bodyMd || null,
    meta: input.meta || {},
    published: input.published ?? false,
    updated_at: new Date().toISOString(),
  };
  if (input.id) payload.id = input.id;

  const { data, error } = await supabase
    .from("learning_resources")
    .upsert(payload)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id ? String(data.id) : input.id };
}

export async function deleteResource(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("learning_resources").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Prefix used when a file lives on Appwrite */
export const APPWRITE_PATH_PREFIX = "appwrite:";

/** Vercel serverless request body limit is ~4.5 MB */
const APPWRITE_PROXY_MAX_BYTES = 4 * 1024 * 1024;

export function isAppwriteStoragePath(path: string | null | undefined): boolean {
  return Boolean(path && path.startsWith(APPWRITE_PATH_PREFIX));
}

export function parseAppwriteFileId(path: string): string | null {
  if (!isAppwriteStoragePath(path)) return null;
  return path.slice(APPWRITE_PATH_PREFIX.length).split("|")[0] || null;
}

/**
 * Upload a learning file.
 * - Freshman / special packages → Supabase storage
 * - Grades 9–12 → Appwrite (via API route)
 *
 * Note: Vercel limits request body to ~4.5MB. Larger PDFs should be uploaded
 * in the Appwrite console, then linked with storagePath = appwrite:FILE_ID
 */
export async function uploadLearningFile(
  path: string,
  file: File,
  opts?: { scopePath?: string }
): Promise<{ path?: string; error?: string }> {
  if (file.size > 100 * 1024 * 1024) {
    return { error: "Max file size 100 MB" };
  }

  const useAppwrite =
    opts?.scopePath != null
      ? scopeUsesAppwrite(opts.scopePath)
      : path.startsWith("grade/");

  if (useAppwrite) {
    if (file.size > APPWRITE_PROXY_MAX_BYTES) {
      return {
        error:
          "File is larger than 4 MB (Vercel limit). Upload it in Appwrite Console → Storage → your bucket, copy the File ID, and paste it in the \"Appwrite File ID\" field below.",
      };
    }

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scopePath", opts?.scopePath || path);

      const res = await fetch("/api/storage/upload", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let data: { error?: string; fileId?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (text.includes("Request Entity Too Large") || res.status === 413) {
          return {
            error:
              "File too large for server upload (max ~4 MB). Upload in Appwrite Console and paste the File ID instead.",
          };
        }
        return {
          error: `Upload failed (${res.status}). ${text.slice(0, 120)}`,
        };
      }

      if (!res.ok) {
        return { error: data.error || "Appwrite upload failed" };
      }
      if (!data.fileId) {
        return { error: "Upload succeeded but no file ID returned" };
      }
      return { path: `${APPWRITE_PATH_PREFIX}${data.fileId}` };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Appwrite upload failed",
      };
    }
  }

  // Default: Supabase storage (freshman, special packages)
  if (file.size > 40 * 1024 * 1024) {
    return { error: "Max file size 40 MB on Supabase storage" };
  }
  const { error } = await supabase.storage.from("learning-content").upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) return { error: error.message };
  return { path };
}

/**
 * Resolve a playable / downloadable URL for a storage path.
 * Supports both Supabase signed URLs and Appwrite public view URLs.
 */
export async function getSignedContentUrl(
  storagePath: string,
  expiresSec = 3600
): Promise<{ url?: string; error?: string }> {
  if (isAppwriteStoragePath(storagePath)) {
    const fileId = parseAppwriteFileId(storagePath);
    if (!fileId) return { error: "Invalid Appwrite file reference" };

    const endpoint =
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";
    const bucketId =
      process.env.APPWRITE_BUCKET_ID ||
      process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID ||
      "";

    if (!projectId || !bucketId) {
      return { error: "Appwrite env vars missing" };
    }

    const url = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
    return { url };
  }

  const { data, error } = await supabase.storage
    .from("learning-content")
    .createSignedUrl(storagePath, expiresSec);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function saveProgress(opts: {
  resourceId: string;
  progressPct: number;
  lastPage?: number;
  addSeconds?: number;
  addFocusSeconds?: number;
  meta?: ProgressMeta;
}): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { ok: false, error: "Not signed in" };

  const userId = session.user.id;
  const { data: existing } = await supabase
    .from("learning_progress")
    .select("total_seconds, focus_seconds, meta, progress_pct")
    .eq("user_id", userId)
    .eq("resource_id", opts.resourceId)
    .maybeSingle();

  const total =
    Number(existing?.total_seconds || 0) + Math.max(0, opts.addSeconds || 0);
  const focus =
    Number(existing?.focus_seconds || 0) + Math.max(0, opts.addFocusSeconds || 0);

  const prevMeta = (existing?.meta as Record<string, unknown>) || {};
  const nextMeta = opts.meta ? { ...prevMeta, ...opts.meta } : prevMeta;

  const nextPct = Math.max(
    Number(existing?.progress_pct || 0),
    Math.min(100, opts.progressPct)
  );

  const { error } = await supabase.from("learning_progress").upsert(
    {
      user_id: userId,
      resource_id: opts.resourceId,
      progress_pct: nextPct,
      last_page: opts.lastPage ?? null,
      total_seconds: total,
      focus_seconds: focus,
      last_opened_at: new Date().toISOString(),
      meta: nextMeta,
    },
    { onConflict: "user_id,resource_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getMyProgress(
  resourceId: string
): Promise<{
  pct: number;
  lastPage: number | null;
  totalSeconds: number;
  focusSeconds: number;
  meta: ProgressMeta;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { pct: 0, lastPage: null, totalSeconds: 0, focusSeconds: 0, meta: {} };
  }

  const { data } = await supabase
    .from("learning_progress")
    .select("progress_pct, last_page, total_seconds, focus_seconds, meta")
    .eq("user_id", session.user.id)
    .eq("resource_id", resourceId)
    .maybeSingle();

  return {
    pct: Number(data?.progress_pct || 0),
    lastPage: data?.last_page != null ? Number(data.last_page) : null,
    totalSeconds: Number(data?.total_seconds || 0),
    focusSeconds: Number(data?.focus_seconds || 0),
    meta: (data?.meta as ProgressMeta) || {},
  };
}

export async function saveExamAttempt(opts: {
  resourceId: string;
  score: number;
  total: number;
  answers: Record<number, number>;
  title?: string;
  scopeId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.from("exam_attempts").insert({
    user_id: session.user.id,
    resource_id: opts.resourceId,
    submitted_at: new Date().toISOString(),
    score: opts.score,
    answers: opts.answers,
    meta: { total: opts.total },
  });

  if (opts.scopeId && opts.total > 0) {
    const missed = Math.max(0, opts.total - opts.score);
    const percent = Math.round((opts.score / opts.total) * 1000) / 10;
    await supabase.from("academic_results").insert({
      user_id: session.user.id,
      scope_id: opts.scopeId,
      title: opts.title || "Exam attempt",
      total: opts.total,
      correct: opts.score,
      missed,
      percent,
    });
  }

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getScopeStats(opts: {
  scopePath: string;
  hub?: HubId;
}): Promise<{ stats: ScopeStats; error?: string }> {
  const empty: ScopeStats = {
    rows: [],
    totalStudySeconds: 0,
    totalFocusSeconds: 0,
    avgProgressPct: 0,
    avgFocusLabel: "-",
    quizAttempted: 0,
    quizCorrect: 0,
    quizWrong: 0,
    flashKnow: 0,
    flashAgain: 0,
    flashLearning: 0,
    videoWatchSeconds: 0,
    examScores: [],
    avgExamPercent: 0,
    streakDays: 0,
  };

  let sessionUser = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    sessionUser = session?.user || null;
  } catch {
    cleanCorruptAuthTokens();
  }
  if (!sessionUser) return { stats: empty };

  const eceMatch = opts.scopePath?.match(/^ece\/(sem-[12])\/([^/]+)$/);
  let rq = supabase
    .from("learning_resources")
    .select("id, title, hub, content_type, scope_path");

  if (eceMatch) {
    const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
    rq = rq.in("scope_path", [opts.scopePath, `ece/${otherSem}/${eceMatch[2]}`]);
  } else {
    rq = rq.eq("scope_path", opts.scopePath);
  }

  if (opts.hub === "short-notes") {
    rq = rq.in("hub", ["short-notes", "references"]);
  } else if (opts.hub) {
    rq = rq.eq("hub", opts.hub);
  }

  let { data: resources, error: rErr } = await rq;

  if (rErr && isCryptoOrTokenError(rErr.message)) {
    cleanCorruptAuthTokens();
    try {
      const anon = getAnonSupabaseClient();
      let retryRq = anon
        .from("learning_resources")
        .select("id, title, hub, content_type, scope_path");
      if (eceMatch) {
        const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
        retryRq = retryRq.in("scope_path", [opts.scopePath, `ece/${otherSem}/${eceMatch[2]}`]);
      } else {
        retryRq = retryRq.eq("scope_path", opts.scopePath);
      }
      if (opts.hub === "short-notes") {
        retryRq = retryRq.in("hub", ["short-notes", "references"]);
      } else if (opts.hub) {
        retryRq = retryRq.eq("hub", opts.hub);
      }
      const retryRes = await retryRq;
      if (retryRes.data?.length) {
        resources = retryRes.data;
        rErr = null;
      }
    } catch {
      /* ignore */
    }
  }

  if ((!resources || resources.length === 0) && eceMatch) {
    const courseSlug = eceMatch[2];
    let fallbackRq = supabase
      .from("learning_resources")
      .select("id, title, hub, content_type, scope_path")
      .ilike("scope_path", `%${courseSlug}%`);

    if (opts.hub === "short-notes") {
      fallbackRq = fallbackRq.in("hub", ["short-notes", "references"]);
    } else if (opts.hub) {
      fallbackRq = fallbackRq.eq("hub", opts.hub);
    }
    const fb = await fallbackRq;
    if (fb.data?.length) {
      resources = fb.data;
      rErr = null;
    }
  }
  if (rErr) return { stats: empty };
  if (!resources?.length) return { stats: empty };

  const ids = resources.map((r) => String(r.id));
  const byId = new Map(
    resources.map((r) => {
      const rawHub = String(r.hub);
      const hub = (rawHub === "references" ? "short-notes" : rawHub) as HubId;
      return [
        String(r.id),
        {
          title: String(r.title),
          hub,
          contentType: r.content_type as ContentType,
        },
      ];
    })
  );

  const { data: prog, error: pErr } = await supabase
    .from("learning_progress")
    .select(
      "resource_id, progress_pct, total_seconds, focus_seconds, last_opened_at, meta"
    )
    .eq("user_id", sessionUser.id)
    .in("resource_id", ids);

  if (pErr) return { stats: empty, error: pErr.message };

  const rows: ScopeProgressRow[] = (prog || []).map((p) => {
    const info = byId.get(String(p.resource_id));
    return {
      resourceId: String(p.resource_id),
      title: info?.title || "Item",
      hub: info?.hub || "books",
      contentType: info?.contentType || "pdf",
      progressPct: Number(p.progress_pct || 0),
      totalSeconds: Number(p.total_seconds || 0),
      focusSeconds: Number(p.focus_seconds || 0),
      lastOpenedAt: p.last_opened_at ? String(p.last_opened_at) : null,
      meta: (p.meta as ProgressMeta) || {},
    };
  });

  let totalStudySeconds = 0;
  let totalFocusSeconds = 0;
  let pctSum = 0;
  let quizAttempted = 0;
  let quizCorrect = 0;
  let quizWrong = 0;
  let flashKnow = 0;
  let flashAgain = 0;
  let flashLearning = 0;
  let videoWatchSeconds = 0;
  const examScores: number[] = [];
  const daySet = new Set<string>();

  for (const r of rows) {
    totalStudySeconds += r.totalSeconds;
    totalFocusSeconds += r.focusSeconds;
    pctSum += r.progressPct;
    const q = r.meta.quiz;
    if (q) {
      quizAttempted += Number(q.attempted || 0);
      quizCorrect += Number(q.correct || 0);
      quizWrong =
        q.wrong != null
          ? Number(q.wrong)
          : Math.max(0, Number(q.attempted || 0) - Number(q.correct || 0));
      if (q.submitted && q.total) {
        examScores.push(
          Math.round((Number(q.correct || 0) / Number(q.total)) * 1000) / 10
        );
      }
    }
    const f = r.meta.flashcards;
    if (f) {
      flashKnow += Number(f.know || 0);
      flashAgain += Number(f.again || 0);
      flashLearning += Number(f.learning || 0);
    }
    if (r.meta.video?.watchSeconds) {
      videoWatchSeconds += Number(r.meta.video.watchSeconds || 0);
    }
    if (r.lastOpenedAt) {
      daySet.add(r.lastOpenedAt.slice(0, 10));
    }
  }

  const days = Array.from(daySet).sort().reverse();
  let streakDays = 0;
  if (days.length) {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let cursor = iso(today);
    if (!daySet.has(cursor)) {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      cursor = iso(y);
    }
    while (daySet.has(cursor)) {
      streakDays += 1;
      const d = new Date(cursor + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
  }

  const avgExamPercent =
    examScores.length > 0
      ? Math.round(
          (examScores.reduce((a, b) => a + b, 0) / examScores.length) * 10
        ) / 10
      : 0;

  return {
    stats: {
      rows,
      totalStudySeconds,
      totalFocusSeconds,
      avgProgressPct: rows.length
        ? Math.round((pctSum / rows.length) * 10) / 10
        : 0,
      avgFocusLabel: focusStatusLabel(totalFocusSeconds, totalStudySeconds),
      quizAttempted,
      quizCorrect,
      quizWrong,
      flashKnow,
      flashAgain,
      flashLearning,
      videoWatchSeconds,
      examScores,
      avgExamPercent,
      streakDays,
    },
  };
}

export function freshmanScope(subjectId: string): string {
  return `freshman/${subjectId}`;
}

export function eceScope(semId: string, courseSlug: string): string {
  return `ece/${semId}/${courseSlug}`;
}

export function gradeScope(gradeId: string, subjectId?: string): string {
  return subjectId ? `grade/${gradeId}/${subjectId}` : `grade/${gradeId}`;
}
