import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isVerifyEtConfigured,
  mapPaymentMethodToBank,
  verifyTransaction,
} from "@/lib/verify-et";
import { getPackage, type PaymentMethodId } from "@/data/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Body = {
  orderId?: string;
  packageId?: string;
  packageIds?: string[];
  packageName?: string;
  amountEtb?: number;
  paymentMethod?: PaymentMethodId;
  transactionRef?: string;
  studentName?: string;
  phone?: string;
  email?: string;
  note?: string;
  userId?: string | null;
  dryRun?: boolean;
};

type PriceResult =
  | { ok: true; totalEtb: number; ids: string[] }
  | { ok: false; error: string; code: string; status: number };

/**
 * The price is decided HERE, never by the browser (P6, owner approved 2026-10-23).
 * Same rule as the checkout page: the admin catalog price (catalog_items.price_etb) wins when above 0,
 * the static packages.ts price is used only when there is no catalog row or its price is 0.
 * Any unknown package, or a price that cannot be read, returns an error and nothing is auto-verified.
 */
async function serverPrice(body: Body): Promise<PriceResult> {
  const raw =
    Array.isArray(body.packageIds) && body.packageIds.length > 0
      ? body.packageIds
      : body.packageId
        ? [body.packageId]
        : [];
  const ids = Array.from(
    new Set(raw.map((s) => String(s || "").trim()).filter(Boolean))
  );

  if (ids.length === 0 || ids.length > 12) {
    return {
      ok: false,
      error: "packageId or packageIds is required",
      code: "BAD_PACKAGES",
      status: 400,
    };
  }

  const db = adminClient();
  if (!db) {
    return {
      ok: false,
      error: "Price check is not available right now. Your order will be reviewed by an admin.",
      code: "PRICE_UNAVAILABLE",
      status: 503,
    };
  }

  const { data, error } = await db
    .from("catalog_items")
    .select("id, price_etb, active")
    .in("id", ids);

  if (error) {
    console.warn("[verify-payment] catalog read", error.message);
    return {
      ok: false,
      error: "Price check is not available right now. Your order will be reviewed by an admin.",
      code: "PRICE_UNAVAILABLE",
      status: 503,
    };
  }

  const rows = new Map<string, { price: number; active: boolean }>();
  for (const r of (data || []) as { id: string; price_etb: number | null; active: boolean | null }[]) {
    rows.set(r.id, { price: Number(r.price_etb) || 0, active: r.active !== false });
  }

  let total = 0;
  for (const id of ids) {
    const row = rows.get(id);
    if (row && !row.active) {
      return {
        ok: false,
        error: `Package ${id} is not for sale.`,
        code: "PACKAGE_NOT_FOR_SALE",
        status: 400,
      };
    }
    const price = row && row.price > 0 ? row.price : getPackage(id)?.priceEtb ?? 0;
    if (!Number.isFinite(price) || price <= 0) {
      return {
        ok: false,
        error: `Package ${id} has no price.`,
        code: "UNKNOWN_PACKAGE",
        status: 400,
      };
    }
    total += price;
  }

  return { ok: true, totalEtb: total, ids };
}

export async function POST(req: NextRequest) {
  if (!isVerifyEtConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Automatic verification is not configured yet. Upload a receipt or enter details for manual review.",
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const method = body.paymentMethod;
  const ref = (body.transactionRef || "").trim();
  const orderId = (body.orderId || "").trim();

  if (!method || !ref) {
    return NextResponse.json(
      { ok: false, error: "paymentMethod and transactionRef are required" },
      { status: 400 }
    );
  }

  if (!mapPaymentMethodToBank(method)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This bank is not supported for automatic verification. Use Telebirr, CBE, or Abyssinia, or upload a receipt.",
        code: "UNSUPPORTED_BANK",
      },
      { status: 400 }
    );
  }

  // The amount sent by the browser is IGNORED. The expected amount is the server price.
  const price = await serverPrice(body);
  if (!price.ok) {
    return NextResponse.json(
      { ok: false, error: price.error, code: price.code },
      { status: price.status }
    );
  }
  const amountEtb = price.totalEtb;
  const packageIds = price.ids;

  const result = await verifyTransaction({
    method,
    reference: ref,
    expectedAmountEtb: amountEtb,
    idempotencyKey: orderId ? `order-${orderId}` : undefined,
  });

  if (body.dryRun) {
    return NextResponse.json({
      ok: result.ok,
      verified: result.verified,
      pending: result.pending,
      amount: result.amount,
      requestId: result.requestId,
      message: result.message,
      error: result.error,
    });
  }

  if (orderId && body.packageId && body.packageName) {
    const db = adminClient();
    const status = result.verified ? "verified" : "pending_verification";
    const now = new Date().toISOString();

    const row: Record<string, unknown> = {
      id: orderId,
      user_id: body.userId || null,
      package_id: body.packageId,
      package_name: body.packageName,
      amount_etb: amountEtb,
      status,
      payment_method: method,
      student_name: body.studentName || "",
      phone: body.phone || "",
      email: body.email || null,
      transaction_ref: ref,
      note: [
        body.note || "",
        result.requestId ? `verify.et requestId=${result.requestId}` : "",
        result.amount != null ? `verify.et amount=${result.amount}` : "",
        result.verified ? "auto-verified by Verify.ET" : "",
        result.error ? `verify.et: ${result.error}` : "",
      ]
        .filter(Boolean)
        .join(" | ") || null,
      created_at: now,
    };

    if (result.verified) {
      row.verified_at = now;
      row.verified_by = "verify.et";
    }

    if (db) {
      const { error } = await db.from("orders").upsert(row, { onConflict: "id" });
      if (error) {
        console.warn("[verify-payment] order upsert", error.message);
      }

      if (result.verified) {
        for (const pid of packageIds) {
          const enroll: Record<string, unknown> = {
            order_id: orderId,
            package_id: pid,
            package_name: body.packageName,
            email: body.email || null,
            user_id: body.userId || null,
          };
          const { error: enrErr } = await db.from("enrollments").upsert(enroll, {
            ignoreDuplicates: true,
          });
          if (enrErr) console.warn("[verify-payment] enrollment", enrErr.message);
        }
      }
    }
  }

  return NextResponse.json({
    ok: result.ok,
    verified: result.verified,
    pending: result.pending,
    amount: result.amount,
    requestId: result.requestId,
    message: result.message,
    error: result.error,
    status: result.verified ? "verified" : "pending_verification",
  });
}

export async function GET() {
  return NextResponse.json({
    configured: isVerifyEtConfigured(),
    banks: ["telebirr", "cbe", "abyssinia"],
  });
}
