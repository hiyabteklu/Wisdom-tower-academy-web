import { supabase } from "@/lib/supabase";

/**
 * Client helpers to trigger approval / rejection notifications.
 * Actual sending runs server-side in /api/notify-approval.
 */

export type NotifyResult = {
  ok: boolean;
  email?: { sent: boolean; skipped?: boolean; error?: string };
  sms?: { sent: boolean; skipped?: boolean; error?: string };
  error?: string;
};

async function postApprovalNotification(orderId: string, type: "approved" | "rejected"): Promise<NotifyResult> {
  try {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) return { ok: false, error: "Admin sign-in required." };
    const res = await fetch("/api/notify-approval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId, type }),
    });
    const data = (await res.json()) as NotifyResult;
    if (!res.ok) {
      return {
        ...data,
        ok: false,
        error: data.error || "Notify failed",
      };
    }
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function notifyApproval(orderId: string): Promise<NotifyResult> {
  return postApprovalNotification(orderId, "approved");
}

export async function notifyRejection(orderId: string): Promise<NotifyResult> {
  return postApprovalNotification(orderId, "rejected");
}


export function formatNotifyToast(n: NotifyResult, verb: "Approved" | "Rejected"): string {
  if (!n.ok && n.error) return `${verb}, but notify failed: ${n.error}`;
  const parts: string[] = [verb];
  if (n.email?.sent) parts.push("email sent");
  else if (n.email?.skipped) parts.push("email skipped (no key/address)");
  else if (n.email?.error) parts.push(`email: ${n.email.error}`);
  if (n.sms?.sent) parts.push("SMS sent");
  else if (n.sms?.skipped) parts.push("SMS skipped (no key/phone)");
  else if (n.sms?.error) parts.push(`SMS: ${n.sms.error}`);
  return parts.join(" · ");
}
