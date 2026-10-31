/**
 * Tells a student that their order was verified and the package is unlocked.
 *
 * Best effort: it never throws and never blocks the verification. It uses the admin's own session token to call
 * the admin-only route POST /api/notifications/send (legacy mode: type, target user id, url), which writes the
 * in-app notification and sends the push to every device registered for that user.
 *
 * Type is "admin" on purpose: the app does not send a login token when it lists notifications, and the server only
 * shows a notice addressed to ONE student without a token for the types admin, material and contest (see
 * PUBLIC_TARGETED_TYPES in lib/notifications.ts). A "payment" notice would be saved but never appear in the bell.
 */
import { supabase } from "@/lib/supabase";

export type OrderNotifyResult = { ok: boolean; pushed?: number; error?: string };

export async function notifyOrderVerified(opts: {
  userId?: string | null;
  packageName?: string | null;
}): Promise<OrderNotifyResult> {
  const userId = (opts.userId || "").trim();
  if (!userId) return { ok: false, error: "Order has no user id" };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "No admin session" };

    const pkg = (opts.packageName || "").trim();
    const res = await fetch("/api/notifications/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "✨ Wisdom Tower Academy ✨",
        body: pkg
          ? `Your package is unlocked 🔓 ${pkg} is ready. Enjoy your package 🫡`
          : "Your package is unlocked 🔓 Enjoy your package 🫡",
        type: "admin",
        target: userId,
        url: "/learning",
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      fcm?: { sentCount?: number };
    };
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true, pushed: json.fcm?.sentCount ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Notify failed" };
  }
}
