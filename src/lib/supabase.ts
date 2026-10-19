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
 * Same signals the app already uses: the "WisdomTowerApp" user-agent token or
 * the JavaScript bridge objects the app injects.
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
 * Inside the app the NATIVE code is the only thing allowed to refresh the login.
 * Supabase refresh tokens are single-use: when the native app and this page
 * both refreshed with the same token, one of them hit
 * "refresh_token_already_used", Supabase revoked the session, and both sides
 * then retried the dead token every 2 seconds (the signed in/out flicker).
 * The native app refreshes on every app resume and before its own data calls,
 * then writes the fresh session into this page's localStorage.
 *
 * Blocking is done by failing the refresh request locally with a network-style
 * error. supabase-js treats that as retryable and KEEPS the stored session
 * (it only deletes the session on a real server rejection).
 */
const IN_NATIVE_APP = isWisdomTowerAppShell();

const appAwareFetch: typeof fetch = (input, init) => {
  try {
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
      return Promise.reject(
        new TypeError("Token refresh is handled by the Wisdom Tower app"),
      );
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
    // In the Android app the native code owns token refresh (see above).
    autoRefreshToken: !IN_NATIVE_APP,
    detectSessionInUrl: true,
    flowType: "implicit",
    storage: authStorage,
    storageKey: STORAGE_KEY,
  },
  ...(IN_NATIVE_APP ? { global: { fetch: appAwareFetch } } : {}),
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
