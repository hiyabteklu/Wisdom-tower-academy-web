import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 20;

type NotifyType = "approved" | "rejected";

type ChannelResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

function siteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://wisdom-tower-academy.live";
  return fromEnv.replace(/\/$/, "");
}

function toE164(phone: string): string | null {
  const d = phone.replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return d;
  if (d.startsWith("251") && d.length >= 12) return `+${d}`;
  if (d.startsWith("0") && d.length === 10) return `+251${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("9")) return `+251${d}`;
  return `+${d}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

async function sendEmailResend(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { sent: false, skipped: true, error: "RESEND_API_KEY not set" };
  }

  const from = process.env.RESEND_FROM || "Wisdom Tower <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return { sent: false, error: body.message || `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}

async function sendSms(opts: { to: string; message: string }): Promise<ChannelResult> {
  const e164 = toE164(opts.to);
  if (!e164) return { sent: false, skipped: true, error: "Invalid phone" };

  const atKey = process.env.AFRICASTALKING_API_KEY;
  const atUser = process.env.AFRICASTALKING_USERNAME;
  if (atKey && atUser) {
    try {
      const body = new URLSearchParams({
        username: atUser,
        to: e164,
        message: opts.message,
      });
      if (process.env.AFRICASTALKING_FROM) {
        body.set("from", process.env.AFRICASTALKING_FROM);
      }
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          apiKey: atKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        return { sent: false, error: text.slice(0, 200) || `HTTP ${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : "SMS failed" };
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (sid && token && from) {
    try {
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const body = new URLSearchParams({
        To: e164,
        From: from,
        Body: opts.message,
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        return { sent: false, error: data.message || `HTTP ${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : "SMS failed" };
    }
  }

  return {
    sent: false,
    skipped: true,
    error: "No SMS provider configured (AFRICASTALKING_* or TWILIO_*)",
  };
}

function buildApprovedEmail(opts: {
  name: string;
  packageName: string;
  amount: string;
  orderId: string;
  learningUrl: string;
  ordersUrl: string;
}): { subject: string; text: string; html: string } {
  const { name, packageName, amount, orderId, learningUrl, ordersUrl } = opts;
  const subject = `Payment approved - ${packageName} is unlocked`;
  const text = [
    `Hi ${name},`,
    ``,
    `Your payment for ${packageName}${amount ? ` (${amount})` : ""} was verified.`,
    ``,
    `Order: ${orderId}`,
    `Open My Learning: ${learningUrl}`,
    ``,
    `- Wisdom Tower Academy`,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">`,
    `<h1 style="font-size:20px;margin:0 0 12px">Payment approved</h1>`,
    `<p>Hi ${escapeHtml(name)},</p>`,
    `<p>Your payment for <strong>${escapeHtml(packageName)}</strong>${
      amount ? ` (${escapeHtml(amount)})` : ""
    } was verified.</p>`,
    `<p style="font-family:ui-monospace,monospace;background:#f1f5f9;padding:10px 12px;border-radius:8px">Order: ${escapeHtml(
      orderId
    )}</p>`,
    `<p><a href="${learningUrl}" style="display:inline-block;background:#f59e0b;color:#0a0f1a;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Open My Learning</a></p>`,
    `<p style="color:#64748b;font-size:13px">Or view orders: <a href="${ordersUrl}">${ordersUrl}</a></p>`,
    `<p style="color:#64748b;font-size:13px;margin-top:24px">- Wisdom Tower Academy</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

function buildRejectedEmail(opts: {
  name: string;
  packageName: string;
  orderId: string;
}): { subject: string; text: string; html: string } {
  const { name, packageName, orderId } = opts;
  const subject = `Payment update - ${packageName}`;
  const text = [
    `Hi ${name},`,
    ``,
    `We could not verify your payment for ${packageName} (order ${orderId}).`,
    `Please contact us with your receipt or try again from checkout.`,
    ``,
    `- Wisdom Tower Academy`,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">`,
    `<h1 style="font-size:20px;margin:0 0 12px">Payment needs attention</h1>`,
    `<p>Hi ${escapeHtml(name)},</p>`,
    `<p>We could not verify your payment for <strong>${escapeHtml(
      packageName
    )}</strong> (order <code>${escapeHtml(orderId)}</code>).</p>`,
    `<p>Reply with your receipt or contact support from the website.</p>`,
    `<p style="color:#64748b;font-size:13px;margin-top:24px">- Wisdom Tower Academy</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = String(body.orderId || "").trim();
    if (!orderId || orderId.length > 128) {
      return NextResponse.json({ ok: false, error: "A valid orderId is required." }, { status: 400 });
    }
    if (body.type !== "approved" && body.type !== "rejected") {
      return NextResponse.json({ ok: false, error: "Invalid notification type." }, { status: 400 });
    }
    const type: NotifyType = body.type;

    // This endpoint sends real email/SMS messages. Require a fresh Supabase JWT
    // and a server-verified admin check before using the service-role client.
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Admin sign-in required." }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
    }

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ ok: false, error: "Admin session expired. Sign in again." }, { status: 401 });
    }
    const { data: isAdmin, error: adminError } = await authClient.rpc("am_i_admin");
    if (adminError || isAdmin !== true) {
      return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
    }

    // Privileged order lookup is now behind the fresh admin check above.
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error } = await adminClient
      .from("orders")
      .select("id,status,student_name,package_name,amount_etb,email,phone")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    const expectedStatus = type === "approved" ? "verified" : "rejected";
    if (order.status !== expectedStatus) {
      return NextResponse.json(
        { ok: false, error: "The order status does not match this notification action." },
        { status: 409 }
      );
    }

    const name = String(order.student_name || "Student");
    const packageName = String(order.package_name || "package");
    const amount = order.amount_etb != null ? `${order.amount_etb} ETB` : "";
    const learningUrl = `${siteUrl()}/learning`;
    const ordersUrl = `${siteUrl()}/orders`;

    let emailResult: ChannelResult = { sent: false, skipped: true };
    let smsResult: ChannelResult = { sent: false, skipped: true };

    if (type === "approved") {
      const mail = buildApprovedEmail({
        name,
        packageName,
        amount,
        orderId,
        learningUrl,
        ordersUrl,
      });

      if (order.email) {
        emailResult = await sendEmailResend({
          to: String(order.email),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      } else {
        emailResult = { sent: false, skipped: true, error: "No email on order" };
      }

      const smsMsg = `Wisdom Tower Academy: Payment approved for ${packageName}. Order ${orderId}. Open My Learning: ${learningUrl}`;
      if (order.phone) {
        smsResult = await sendSms({ to: String(order.phone), message: smsMsg });
      } else {
        smsResult = { sent: false, skipped: true, error: "No phone on order" };
      }
    } else {
      const mail = buildRejectedEmail({ name, packageName, orderId });

      if (order.email) {
        emailResult = await sendEmailResend({
          to: String(order.email),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      } else {
        emailResult = { sent: false, skipped: true, error: "No email on order" };
      }

      const smsMsg = `Wisdom Tower Academy: Payment for ${packageName} (order ${orderId}) needs attention. Contact support with your receipt.`;
      if (order.phone) {
        smsResult = await sendSms({ to: String(order.phone), message: smsMsg });
      } else {
        smsResult = { sent: false, skipped: true, error: "No phone on order" };
      }
    }

    return NextResponse.json({
      ok: true,
      email: emailResult,
      sms: smsResult,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
