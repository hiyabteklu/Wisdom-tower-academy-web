import { NextRequest, NextResponse } from "next/server";
import {
  listNotificationsForUser,
  listAllNotificationsForAdmin,
  deleteNotification,
} from "@/lib/notifications";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { fillFirstName } from "@/lib/welcome-notification";

export const dynamic = "force-dynamic";

// 2026-10-15: listing ALL notifications (admin=true) and deleting one now need the admin's
// access token (Authorization: Bearer ...). Before, both were open to anyone who knew the address.
// The normal per-student list (no admin flag) is unchanged.
//
// 2026-10-15 (notifications v2, R2): the per-student list also accepts the student's own access token
// (Authorization: Bearer ...). With a valid token the user id / e-mail come from the TOKEN (the query
// values are ignored) and every notice addressed to that student is returned. Without a token the old
// ?userId=&email= behaviour stays (the app does not send a token yet), limited to admin / material /
// contest notices. Known gap: see WEBSITE_CHANGES.md section 3 (the app should send its token).
//
// 2026-10-23: `{first_name}` in a notice title/body is filled from the verified student's profile name;
// without a token the name is unknown, so the token is dropped ("Hey, you made it").

async function verifiedStudent(
  req: NextRequest
): Promise<{ id: string; email: string | null; firstName: string | null } | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(match[1].trim());
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = [meta.first_name, meta.full_name, meta.name].find(
    (v) => typeof v === "string" && v.trim().length > 0
  );
  const firstName = typeof rawName === "string" ? rawName.trim().split(/\s+/)[0] : null;
  return { id: data.user.id, email: data.user.email ?? null, firstName };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("userId") || undefined;
    const email = searchParams.get("email") || undefined;
    const isAdmin = searchParams.get("admin") === "true";

    if (isAdmin) {
      const check = await requireAdmin(req);
      if (!check.ok) return check.response;
      const items = await listAllNotificationsForAdmin();
      return NextResponse.json({ ok: true, notifications: items });
    }

    const me = await verifiedStudent(req);
    const items = me
      ? await listNotificationsForUser(me.id, me.email, true)
      : await listNotificationsForUser(userId, email, false);
    const personal = items.map((n) => ({
      ...n,
      title: fillFirstName(n.title, me?.firstName),
      body: fillFirstName(n.body, me?.firstName),
    }));
    return NextResponse.json({ ok: true, notifications: personal });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load notifications";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing notification id" }, { status: 400 });
    }

    const ok = await deleteNotification(id);
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete notification";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
