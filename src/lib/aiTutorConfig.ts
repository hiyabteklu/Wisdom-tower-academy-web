// U2b (docs/PLAN_2026-11-06_URGENT_FIVE_FIXES.md in the app repo): which AI models answer the main AI tutor,
// read from the Supabase table `ai_config` so the owner can change it WITHOUT an app update or a redeploy.
//
// Rules:
// - No API keys here or in the table. Keys stay in the host's environment variables.
// - The table is read with the service role key on the server only (RLS lets only academy admins read it otherwise).
// - A change goes live in about 60 seconds (short in-memory cache per server instance).
// - If the table is off (enabled = false), empty, or cannot be read in time, the built-in default order is used.
// - The built-in defaults are always kept at the END of the list, so a short or wrong list never leaves the tutor with nothing.

export type TutorProvider = "gateway" | "gemini" | "groq";
export type TutorCandidate = { provider: TutorProvider; model: string; timeoutMs?: number };

const CACHE_OK_MS = 60_000; // a good read is reused for 60 s
const CACHE_FAIL_MS = 15_000; // a failed read is not retried on every request
const READ_TIMEOUT_MS = 1_500; // never hold a student's question for long
const GATEWAY_TIMEOUT_MS = 7_000; // same as the built-in gateway candidate

const PROVIDERS = new Set<string>(["gateway", "gemini", "groq"]);
const MODEL_RE = /^[A-Za-z0-9._:\/-]{1,80}$/;

type Cached = { at: number; ttl: number; configured: TutorCandidate[] | null };
let cache: Cached | null = null;

function toCandidate(provider: unknown, model: unknown): TutorCandidate | null {
  if (typeof provider !== "string" || typeof model !== "string") return null;
  const p = provider.trim().toLowerCase();
  const m = model.trim();
  if (!PROVIDERS.has(p) || !MODEL_RE.test(m)) return null;
  const c: TutorCandidate = { provider: p as TutorProvider, model: m };
  if (p === "gateway") c.timeoutMs = GATEWAY_TIMEOUT_MS;
  return c;
}

/** Reads the single ai_config row. Returns the owner's list (primary first), or null when the switch is off or unreadable. */
async function readConfigured(): Promise<TutorCandidate[] | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${base.replace(/\/+$/, "")}/rest/v1/ai_config?id=eq.true&select=enabled,primary_provider,primary_model,fallback_order&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.enabled !== true) return null;

    const list: TutorCandidate[] = [];
    const primary = toCandidate(row.primary_provider, row.primary_model);
    if (primary) list.push(primary);
    if (Array.isArray(row.fallback_order)) {
      for (const item of row.fallback_order) {
        const c = toCandidate(item?.provider, item?.model);
        if (c) list.push(c);
      }
    }
    return list.length > 0 ? list : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The tutor's provider/model order for this request: the owner's list from `ai_config` (when enabled), then the built-in
 * defaults, without duplicates. Never throws.
 */
export async function getTutorCandidates(defaults: TutorCandidate[]): Promise<TutorCandidate[]> {
  try {
    const now = Date.now();
    if (!cache || now - cache.at > cache.ttl) {
      const configured = await readConfigured();
      cache = { at: Date.now(), ttl: configured ? CACHE_OK_MS : CACHE_FAIL_MS, configured };
    }
    if (!cache.configured) return defaults;

    const seen = new Set<string>();
    const merged: TutorCandidate[] = [];
    for (const c of [...cache.configured, ...defaults]) {
      const k = `${c.provider}|${c.model}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(c);
    }
    return merged;
  } catch {
    return defaults;
  }
}
