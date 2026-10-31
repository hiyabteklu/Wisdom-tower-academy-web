import { NextRequest, NextResponse } from "next/server";
import { registerDeviceToken, unregisterDeviceToken } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/notifications/register-device
 *
 * 2026-10-31: the phone app never sent a user id, so every row in user_device_tokens had user_id = null and
 * pushes addressed to one student (target = user id) reached nobody. Now:
 *  - The student is read ONLY from the `Authorization: Bearer <access token>` header (verified with Supabase).
 *    A `userId` in the body is ignored: trusting it would let anyone attach their phone to another student.
 *  - Signed-in call: the token row is saved WITH that user id (also moves a shared phone to the new student).
 *  - Anonymous call (no or invalid token): the row is only created if the token is new. An existing row,
 *    and the user link it may already have, is never overwritten by an anonymous call.
 *  - action "unlink": removes the user link (sign-out), the phone keeps receiving broadcast ("all") pushes.
 *  - action "unregister": deletes the token row (unchanged).
 */

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, platform = "android", deviceName, action } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid FCM registration token" },
        { status: 400 }
      );
    }

    if (action === "unregister") {
      await unregisterDeviceToken(token);
      return NextResponse.json({
        ok: true,
        message: "Device token unregistered successfully",
      });
    }

    const service = createServiceClient();

    if (action === "unlink") {
      if (service) {
        await service
          .from("user_device_tokens")
          .update({ user_id: null, updated_at: new Date().toISOString() })
          .eq("token", token);
      }
      return NextResponse.json({ ok: true, message: "Device unlinked from the student" });
    }

    const devicePlatform = platform === "ios" || platform === "web" ? platform : "android";

    // Who is calling? Only the verified access token counts.
    let userId: string | null = null;
    const access = bearerToken(req);
    if (access && service) {
      const { data, error } = await service.auth.getUser(access);
      if (!error && data.user) userId = data.user.id;
    }

    if (!service) {
      // No server credentials: old behaviour (memory + public key), anonymous only.
      const res = await registerDeviceToken({
        token,
        userId: null,
        platform: devicePlatform,
        deviceName: deviceName || undefined,
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: res.error || "Failed to register token" },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, message: "Device registered for push notifications", platform });
    }

    const row: Record<string, unknown> = {
      token,
      platform: devicePlatform,
      device_name: deviceName || null,
      updated_at: new Date().toISOString(),
    };
    if (userId) row.user_id = userId;

    const { error: upsertError } = await service
      .from("user_device_tokens")
      .upsert(row, { onConflict: "token", ignoreDuplicates: !userId });

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message || "Failed to register token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Device registered for push notifications",
      platform,
      linked: !!userId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token parameter" }, { status: 400 });
  }
  await unregisterDeviceToken(token);
  return NextResponse.json({ ok: true, message: "Device unregistered" });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
