/**
 * Orders: Supabase primary + localStorage fallback for offline/guest edge cases.
 */

import type { PaymentMethodId } from "@/data/packages";
import { supabase } from "@/lib/supabase";
import { invalidate } from "@/lib/swr-cache";
import { notifyOrderVerified } from "@/lib/order-notify";

export type OrderStatus =
  | "pending_payment"
  | "pending_verification"
  | "verified"
  | "rejected";

export type ManualOrder = {
  id: string;
  packageId: string;
  packageName: string;
  amountEtb: number;
  status: OrderStatus;
  paymentMethod: PaymentMethodId;
  studentName: string;
  phone: string;
  email?: string;
  transactionRef: string;
  note?: string;
  /** Public URL of uploaded receipt (image or PDF) */
  receiptUrl?: string;
  createdAt: string;
  userId?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
};

/** Parse multi-package ids from order note (`packages:id1,id2`). */
export function packageIdsFromOrderNote(note?: string | null, fallbackId?: string): string[] {
  const ids: string[] = [];
  if (note) {
    const m = note.match(/packages:([a-z0-9_,-]+)/i);
    if (m) {
      for (const id of m[1].split(",")) {
        const t = id.trim();
        if (t && !ids.includes(t)) ids.push(t);
      }
    }
  }
  if (fallbackId && !ids.includes(fallbackId) && fallbackId !== "multi") {
    ids.unshift(fallbackId);
  }
  return ids;
}

const STORAGE_KEY = "wt_manual_orders_v1";

function readLocal(): ManualOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManualOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(orders: ManualOrder[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

/** Human-friendly order reference e.g. WT-A7K2M9 */
export function generateOrderRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "WT-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function statusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending_payment":
      return "Awaiting payment";
    case "pending_verification":
      return "Pending verification";
    case "verified":
      return "Verified · enrolled";
    case "rejected":
      return "Needs attention";
    default:
      return status;
  }
}

function rowToOrder(row: Record<string, unknown>): ManualOrder {
  return {
    id: String(row.id),
    packageId: String(row.package_id),
    packageName: String(row.package_name),
    amountEtb: Number(row.amount_etb),
    status: row.status as OrderStatus,
    paymentMethod: row.payment_method as PaymentMethodId,
    studentName: String(row.student_name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    transactionRef: String(row.transaction_ref),
    note: row.note ? String(row.note) : undefined,
    receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
    createdAt: String(row.created_at),
    userId: row.user_id ? String(row.user_id) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    verifiedBy: row.verified_by ? String(row.verified_by) : null,
  };
}

/** Upload receipt image/PDF to Supabase Storage. Returns public URL or error. */
export async function uploadPaymentReceipt(
  orderId: string,
  file: File
): Promise<{ url?: string; error?: string }> {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ];
  if (!allowed.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|pdf|heic)$/i)) {
    return { error: "Use a photo (JPG/PNG) or PDF only." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "File too large (max 8 MB)." };
  }

  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (file.type === "application/pdf" ? "pdf" : "jpg");
  const path = `${orderId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("payment-receipts").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    console.warn("[receipt upload]", error.message);
    return { error: error.message };
  }

  const { data } = supabase.storage.from("payment-receipts").getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Save order to Supabase + localStorage backup */
export async function saveOrder(order: ManualOrder): Promise<{ ok: boolean; error?: string }> {
  const all = readLocal().filter((o) => o.id !== order.id);
  all.unshift(order);
  writeLocal(all);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? order.userId ?? null;

    const { error } = await supabase.from("orders").upsert(
      {
        id: order.id,
        user_id: userId,
        package_id: order.packageId,
        package_name: order.packageName,
        amount_etb: order.amountEtb,
        status: order.status,
        payment_method: order.paymentMethod,
        student_name: order.studentName,
        phone: order.phone,
        email: order.email || session?.user?.email || null,
        transaction_ref: order.transactionRef,
        note: order.note || null,
        receipt_url: order.receiptUrl || null,
        created_at: order.createdAt,
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn("[orders] supabase save failed, local only:", error.message);
      invalidate("orders:mine");
      invalidate("notifications:list");
      return { ok: true, error: error.message };
    }
    invalidate("orders:mine");
    invalidate("notifications:list");
    return { ok: true };
  } catch (e) {
    console.warn("[orders] save exception:", e);
    invalidate("orders:mine");
    invalidate("notifications:list");
    return { ok: true, error: e instanceof Error ? e.message : "offline" };
  }
}

export function listLocalOrders(): ManualOrder[] {
  return readLocal().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLocalOrder(id: string): ManualOrder | undefined {
  return readLocal().find((o) => o.id === id);
}

/** List orders from Supabase (admin or own). Falls back to local. */
export async function listOrdersFromDb(): Promise<ManualOrder[]> {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[orders] list failed:", error.message);
      return listLocalOrders();
    }
    return (data || []).map((r) => rowToOrder(r as Record<string, unknown>));
  } catch {
    return listLocalOrders();
  }
}

/** Orders for the signed-in user (by user_id or email) + local merge */
export async function listMyOrders(): Promise<ManualOrder[]> {
  const local = listLocalOrders();
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return local;

    const email = session.user.email;
    let q = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (email) {
      q = q.or(`user_id.eq.${session.user.id},email.eq.${email}`);
    } else {
      q = q.eq("user_id", session.user.id);
    }

    const { data, error } = await q;
    if (error) {
      console.warn("[my-orders]", error.message);
      return local;
    }

    const fromDb = (data || []).map((r) => rowToOrder(r as Record<string, unknown>));
    const map = new Map<string, ManualOrder>();
    for (const o of [...fromDb, ...local]) {
      const prev = map.get(o.id);
      if (!prev || o.createdAt >= prev.createdAt) map.set(o.id, o);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return local;
  }
}

/**
 * Approve order + create enrollment(s) for single or multi-package cart.
 * 2026-10-31: after a successful approval the student gets an "unlocked" notification (in-app + push). That step
 * is best effort: if it fails the order stays verified and `notified` is false.
 */
export async function verifyOrder(
  orderId: string,
  adminEmail: string
): Promise<{ ok: boolean; error?: string; notified?: boolean }> {
  try {
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return { ok: false, error: fetchErr?.message || "Order not found" };
    }

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: adminEmail,
      })
      .eq("id", orderId);

    if (updErr) return { ok: false, error: updErr.message };

    const pkgIds = packageIdsFromOrderNote(
      order.note ? String(order.note) : null,
      String(order.package_id)
    );
    for (const pid of pkgIds) {
      const enrollPayload: Record<string, unknown> = {
        order_id: orderId,
        package_id: pid,
        package_name: String(order.package_name),
        email: order.email || null,
        user_id: order.user_id || null,
      };
      const { error: enrErr } = await supabase.from("enrollments").upsert(enrollPayload, {
        onConflict: order.user_id ? "user_id,package_id" : undefined,
        ignoreDuplicates: true,
      });
      if (enrErr) {
        console.warn("[orders] enrollment:", enrErr.message);
      }
    }

    invalidate("orders:mine");
    invalidate("notifications:list");
    invalidate("ownership");

    const notify = await notifyOrderVerified({
      userId: order.user_id ? String(order.user_id) : null,
      packageName: order.package_name ? String(order.package_name) : null,
    });
    if (!notify.ok) {
      console.warn("[orders] student notification not sent:", notify.error);
    }
    return { ok: true, notified: notify.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function rejectOrder(
  orderId: string,
  adminEmail: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "rejected",
        verified_at: new Date().toISOString(),
        verified_by: adminEmail,
      })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };
    invalidate("orders:mine");
    invalidate("notifications:list");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Enrollments for current user (My Learning) */
export async function listMyEnrollments(): Promise<
  { packageId: string; packageName: string; createdAt: string }[]
> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const email = session.user.email;
    let query = supabase
      .from("enrollments")
      .select("package_id, package_name, created_at")
      .order("created_at", { ascending: false });

    if (email) {
      query = query.or(`user_id.eq.${session.user.id},email.eq.${email}`);
    } else {
      query = query.eq("user_id", session.user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("[enrollments]", error.message);
      return [];
    }

    const seen = new Set<string>();
    const out: { packageId: string; packageName: string; createdAt: string }[] = [];
    for (const r of data || []) {
      const id = String(r.package_id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        packageId: id,
        packageName: String(r.package_name),
        createdAt: String(r.created_at),
      });
    }
    return out;
  } catch {
    return [];
  }
}
