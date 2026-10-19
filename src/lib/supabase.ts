import { createClient, type SupportedStorage } from "@supabase/supabase-js";

/**
 * Browser Supabase client — session persists in localStorage.
 *
 * IMPORTANT: storage methods must read window at call time (not once at
 * module init). Evaluating localStorage during SSR leaves storage=undefined
 * and users must sign in every visit.
 */
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://placeholder.supabase.co";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

export const STORAGE_KEY = "wt-academy-auth-v1";

/**
 * True only inside the Wisdom Tower Android app's WebView (never plain browsers,
 * and never other apps' in-app browsers such as Telegram or Facebook).
 * Same signals the app already uses: the "WisdomTowerApp" user-agent token, the
 * JavaScript bridge objects the app injects, or the window.__wtaNativeApp flag the
 * app sets when it pushes the session into the page.
 *
 * Evaluated at CALL time (not once at import), so it does not matter whether the
 * app's injected script ran before or after this module loaded.
 */
function isWisdomTowerAppShell(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  try {
    if (/WisdomTowerApp/i.test(navigator.userAgent || "")) return true;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(
      w.Android ||
        w.AndroidBridge ||
        w.WisdomTower ||
        w.wtaNative ||
        w.__wtaNativeApp,
    );
  } catch {
    return false;
  }
}

/**
 * HOW LOGIN REFRESH WORKS INSIDE THE ANDROID APP
 *
 * Supabase refresh tokens are single-use. When the native app and this page
 * both refreshed with the same token, one of them hit
 * "refresh_token_already_used", Supabase revoked the whole session, and both
 * sides then retried the dead token every 2 seconds (the signed in/out flicker).
 *
 * So inside the app the NATIVE code is the only refresher. It renews the login
 * about 5 minutes before expiry (checked every 45 s while the app is visible,
 * and on every return to the foreground) and writes the fresh session into this
 * page's localStorage. This page never calls Supabase to refresh. Instead, when
 * supabase-js wants to refresh (its timer, or getSession on an expired token),
 * the request is answered locally with the session the app already pushed, so
 * the page stays signed in however long a student reads. If the app has not
 * delivered a fresh session yet, the request waits briefly and then fails with a
 * network-style error: supabase-js treats that as retryable and KEEPS the stored
 * session (it only deletes it on a real server rejection).
 *
 * Plain browsers are unaffected: every request goes straight to Supabase.
 */
const MIN_VALID_SECONDS = 60;
const NATIVE_REFRESH_WAIT_MS = 4000;
const NATIVE_REFRESH_POLL_MS = 250;

function readFreshNativeSession(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    if (
      isCorruptOrSyntheticToken(s.access_token) ||
      typeof s.refresh_token !== "string" ||
      !s.refresh_token ||
      !s.user
    ) {
      return null;
    }
    const left = (Number(s.expires_at) || 0) - Math.floor(Date.now() / 1000);
    if (left < MIN_VALID_SECONDS) return null;
    return { ...s, token_type: s.token_type || "bearer", expires_in: left };
  } catch {
    return null;
  }
}

async function answerRefreshFromNativeSession(): Promise<Response> {
  const deadline = Date.now() + NATIVE_REFRESH_WAIT_MS;
  for (;;) {
    const session = readFreshNativeSession();
    if (session) {
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, NATIVE_REFRESH_POLL_MS));
  }
  throw new TypeError("Token refresh is handled by the Wisdom Tower app");
}

const appAwareFetch: typeof fetch = (input, init) => {
  try {
    if (isWisdomTowerAppShell()) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      if (
        url.includes("/auth/v1/token") &&
        url.includes("grant_type=refresh_token")
      ) {
        return answerRefreshFromNativeSession();
      }
    }
  } catch {
    /* fall through to the real fetch */
  }
  return fetch(input, init);
};

/**
 * Checks if a JWT token is synthetic, placeholder, or has an invalid signature
 * that would fail cryptographic verification in PostgREST (causing "No suitable key or wrong key type").
 */
export function isCorruptOrSyntheticToken(token: unknown): boolean {
  if (typeof token !== "string" || !token.trim()) return true;
  const t = token.trim();
  if (
    t.includes("sig_") ||
    t.includes("c2lnX") ||
    t.startsWith("wt-token-") ||
    t.startsWith("mock-") ||
    t.includes("placeholder")
  ) {
    return true;
  }
  const parts = t.split(".");
  if (parts.length !== 3) return true;
  // If the signature part decodes to something starting with "sig_"
  if (parts[2].startsWith("c2lnX")) return true;
  return false;
}

/**
 * Purges corrupt or synthetic tokens from local storage while preserving student identity.
 */
export function cleanCorruptAuthTokens(): void {
  if (typeof window === "undefined") return;
  try {
    // 1. Inspect wt-academy-auth-v1
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (isCorruptOrSyntheticToken(parsed.access_token)) {
            // Keep local user profile so user stays logged in locally, but remove broken tokens
            delete parsed.access_token;
            delete parsed.refresh_token;
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    // 2. Inspect and clean any Supabase default keys (sb-*-auth-token)
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const item = window.localStorage.getItem(k);
        if (
          item &&
          (item.includes("c2lnX") ||
            item.includes("sig_") ||
            item.includes("wt-token-"))
        ) {
          window.localStorage.removeItem(k);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

// Clean on module load if in browser
if (typeof window !== "undefined") {
  cleanCorruptAuthTokens();
}

/** Always touch localStorage at read/write time (safe on server + client). */
const authStorage: SupportedStorage = {
  getItem: (key) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      if (key === STORAGE_KEY) {
        try {
          const parsed = JSON.parse(raw);
          // If access_token is synthetic/corrupt, don't pass it to Supabase client
          // because Supabase will attach it as Bearer header, triggering PostgREST "No suitable key"
          if (isCorruptOrSyntheticToken(parsed?.access_token)) {
            return null;
          }
        } catch {
          return null;
        }
      }
      return raw;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode / quota */
    }
  },
  removeItem: (key) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storage: authStorage,
    storageKey: STORAGE_KEY,
  },
  // Browser only: lets the Android app answer refresh requests itself (see above).
  // Passes every other request, and every request outside the app, straight through.
  ...(typeof window !== "undefined" ? { global: { fetch: appAwareFetch } } : {}),
});

let _anonClient: ReturnType<typeof createClient> | null = null;

/**
 * Isolated anonymous Supabase client that never reads or sends stored auth tokens.
 * Guaranteed to succeed on public/published rows without encountering "No suitable key or wrong key type".
 */
export function getAnonSupabaseClient() {
  if (!_anonClient) {
    _anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _anonClient;
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  return Boolean(url) && !url.includes("placeholder");
}

export async function recoverSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.warn("[auth] getSession", error.message);
    // Proactively refresh if session exists but access token may be stale
    if (data.session) {
      const expiresAt = data.session.expires_at ?? 0;
      const soon = Math.floor(Date.now() / 1000) + 60;
      if (expiresAt < soon) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        return refreshed.session ?? data.session;
      }
    }
    return data.session;
  } catch (e) {
    console.warn("[auth] recoverSession", e);
    return null;
  }
}
