import { supabase } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase-server";
import { sendFcmPushToTokens, type FcmPushPayload } from "@/lib/firebase-admin";
import {
  WELCOME_BODY,
  WELCOME_CONTENT,
  WELCOME_NOTIFICATION_ID,
  WELCOME_TITLE,
} from "@/lib/welcome-notification";

// 2026-10-15 (notifications v2, R2): "contest" added. The three categories of the owner's order are
// admin (announcement), material and contest; "payment" and "general" stay for old rows.
export type NotificationType = "material" | "admin" | "payment" | "general" | "contest";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  target: "all" | string; // "all", userId, or email
  url?: string;
  createdAt: string;
  createdBy?: string;
  read?: boolean;
  metadata?: Record<string, unknown>;
};

export type DeviceTokenRecord = {
  id?: string;
  token: string;
  userId?: string | null;
  platform: "android" | "web" | "ios";
  deviceName?: string;
  updatedAt: string;
};

// Fallback in-memory cache for server execution if DB table is initializing
const localDeviceTokens = new Map<string, DeviceTokenRecord>();
const localNotifications: NotificationItem[] = [
  {
    // 2026-10-23: warm welcome with rich content (paragraphs, callout, dividers). Text lives in welcome-notification.ts.
    id: WELCOME_NOTIFICATION_ID,
    title: WELCOME_TITLE,
    body: WELCOME_BODY,
    type: "admin",
    target: "all",
    url: `/notifications?open=${WELCOME_NOTIFICATION_ID}`,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    read: false,
    metadata: { content: WELCOME_CONTENT },
  },
];

/**
 * Register or update an FCM device token (Android app or Web).
 */
export async function registerDeviceToken(params: {
  token: string;
  userId?: string | null;
  platform?: "android" | "web" | "ios";
  deviceName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { token, userId = null, platform = "android", deviceName } = params;

  if (!token) {
    return { ok: false, error: "FCM token is required" };
  }

  const record: DeviceTokenRecord = {
    token,
    userId,
    platform,
    deviceName,
    updatedAt: new Date().toISOString(),
  };

  // Always keep in local memory
  localDeviceTokens.set(token, record);

  // Try saving to Supabase
  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;

    const { error } = await client.from("user_device_tokens").upsert(
      {
        token,
        user_id: userId,
        platform,
        device_name: deviceName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );

    if (error) {
      console.warn("[Notifications] Supabase user_device_tokens error (using fallback):", error.message);
    }
  } catch (err) {
    console.warn("[Notifications] DB upsert failed, token stored in memory cache:", err);
  }

  return { ok: true };
}

/**
 * Unregister a device token (e.g. on logout or app uninstall).
 */
export async function unregisterDeviceToken(token: string): Promise<void> {
  localDeviceTokens.delete(token);

  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;
    await client.from("user_device_tokens").delete().eq("token", token);
  } catch {
    /* ignore */
  }
}

/**
 * Retrieve active device tokens for a given target ("all", specific userId, or email).
 */
export async function getDeviceTokensForTarget(target: string): Promise<string[]> {
  const tokens = new Set<string>();

  // 1. Check database
  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;

    let query = client.from("user_device_tokens").select("token, user_id");

    if (target !== "all") {
      query = query.eq("user_id", target);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        if (row.token) tokens.add(row.token);
      });
    }
  } catch {
    /* fallback to memory */
  }

  // 2. Also merge with in-memory tokens
  localDeviceTokens.forEach((rec) => {
    if (target === "all" || rec.userId === target) {
      tokens.add(rec.token);
    }
  });

  return Array.from(tokens);
}

/**
 * Where a notification opens when the sender gave no url (notifications v2):
 * announcement -> its reading view in the app's notification list, contest -> the trophy screen,
 * anything else -> the learning page (the old default).
 */
function defaultUrlFor(type: NotificationType, id: string): string {
  if (type === "admin") return `/notifications?open=${id}`;
  if (type === "contest") return "/competitions";
  return "/learning";
}

/**
 * Create a new notification and trigger FCM push to target devices.
 * `url` omitted = automatic (see defaultUrlFor). Callers that must keep the old behaviour pass
 * an explicit url (the legacy send and dispatch paths pass "/learning").
 */
export async function createAndPushNotification(params: {
  title: string;
  body: string;
  type: NotificationType;
  target?: "all" | string;
  url?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  notification: NotificationItem;
  fcm: {
    sentCount: number;
    failureCount: number;
    skipped?: boolean;
    reason?: string;
  };
}> {
  const target = params.target || "all";
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();
  const type: NotificationType = params.type || "general";

  const notification: NotificationItem = {
    id,
    title: params.title.trim(),
    body: params.body.trim(),
    type,
    target,
    url: params.url?.trim() || defaultUrlFor(type, id),
    createdAt,
    createdBy: params.createdBy,
    metadata: params.metadata,
    read: false,
  };

  // 1. Save to in-memory list
  localNotifications.unshift(notification);

  // 2. Persist in database
  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;

    const { error } = await client.from("notifications").insert({
      id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      target: notification.target,
      url: notification.url,
      created_by: notification.createdBy || null,
      created_at: createdAt,
      metadata: notification.metadata || {},
    });

    if (error) {
      console.warn("[Notifications] Supabase notifications insert error:", error.message);
    }
  } catch (err) {
    console.warn("[Notifications] DB insert failed, notification stored in memory:", err);
  }

  // 3. Fetch device tokens and send FCM push
  // The push never carries the rich content (FCM data limit is 4 KB): only title, plain preview, type, id and url.
  const targetTokens = await getDeviceTokensForTarget(target);
  const fcmPayload: FcmPushPayload = {
    title: notification.title,
    body: notification.body,
    url: notification.url,
    type: notification.type,
    id: notification.id,
  };

  const fcmResult = await sendFcmPushToTokens(targetTokens, fcmPayload);

  // Clean up any tokens that FCM flagged as invalid / unregistered
  if (fcmResult.invalidTokens && fcmResult.invalidTokens.length > 0) {
    for (const badToken of fcmResult.invalidTokens) {
      void unregisterDeviceToken(badToken);
    }
  }

  return {
    ok: true,
    notification,
    fcm: {
      sentCount: fcmResult.sentCount,
      failureCount: fcmResult.failureCount,
      skipped: fcmResult.skipped,
      reason: fcmResult.reason,
    },
  };
}

function rowToItem(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    type: (row.type as NotificationType) || "general",
    target: String(row.target || "all"),
    url: row.url ? String(row.url) : "/learning",
    createdAt: String(row.created_at || new Date().toISOString()),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    metadata: (row.metadata as Record<string, unknown> | null) || {},
    read: false,
  };
}

// Targeted notices of these types may be read with only a user id / e-mail in the query (the app does not
// send a token yet). Anything else targeted at one student (payment, general) needs a verified token.
const PUBLIC_TARGETED_TYPES: NotificationType[] = ["admin", "material", "contest"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s,()"']+@[^\s,()"']+$/;

/**
 * List notifications for the current student.
 * Returns notifications where target is "all" OR matches the user's ID/email.
 *
 * 2026-10-15 (notifications v2): rows addressed to ONE student (audience sends create one row per student)
 * are invisible to the public key because of row security, so the server reads with the service client
 * for the matching user id / e-mail. `verified` = the caller proved who they are with an access token
 * (see api/notifications GET); without it only admin / material / contest rows are returned for a
 * targeted student, never payment or general ones.
 */
export async function listNotificationsForUser(
  userId?: string | null,
  email?: string | null,
  verified = false
): Promise<NotificationItem[]> {
  const map = new Map<string, NotificationItem>();

  // In-memory fallback items
  localNotifications.forEach((n) => {
    if (
      n.target === "all" ||
      (userId && n.target === userId) ||
      (email && n.target.toLowerCase() === email.toLowerCase())
    ) {
      map.set(n.id, n);
    }
  });

  // Query Supabase
  try {
    let rows: Record<string, unknown>[] | null = null;

    const service = createServiceClient();
    const safeUserId = userId && UUID_RE.test(userId) ? userId : null;
    const safeEmail = email && EMAIL_RE.test(email) ? email : null;
    if (service && (safeUserId || safeEmail)) {
      const filters = ["target.eq.all"];
      if (safeUserId) filters.push(`target.eq.${safeUserId}`);
      if (safeEmail) filters.push(`target.ilike.${safeEmail}`);
      const { data, error } = await service
        .from("notifications")
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error && Array.isArray(data)) rows = data as Record<string, unknown>[];
    }

    if (!rows) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && Array.isArray(data)) rows = data as Record<string, unknown>[];
    }

    (rows ?? []).forEach((row) => {
      const item = rowToItem(row);
      if (item.target === "all") {
        map.set(item.id, item);
        return;
      }
      const isMine =
        (!!userId && item.target === userId) ||
        (!!email && item.target.toLowerCase() === email.toLowerCase());
      if (isMine && (verified || PUBLIC_TARGETED_TYPES.includes(item.type))) {
        map.set(item.id, item);
      }
    });
  } catch {
    /* fallback to memory items */
  }

  return Array.from(map.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * List all notifications (for Admin console).
 */
export async function listAllNotificationsForAdmin(): Promise<NotificationItem[]> {
  const map = new Map<string, NotificationItem>();

  localNotifications.forEach((n) => map.set(n.id, n));

  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;

    const { data, error } = await client
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        map.set(String(row.id), {
          id: String(row.id),
          title: String(row.title),
          body: String(row.body),
          type: (row.type as NotificationType) || "general",
          target: String(row.target || "all"),
          url: row.url ? String(row.url) : "/learning",
          createdAt: String(row.created_at || new Date().toISOString()),
          createdBy: row.created_by ? String(row.created_by) : undefined,
          metadata: row.metadata || {},
          read: false,
        });
      });
    }
  } catch {
    /* fallback to memory */
  }

  return Array.from(map.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * Delete a notification (admin).
 */
export async function deleteNotification(id: string): Promise<boolean> {
  const idx = localNotifications.findIndex((n) => n.id === id);
  if (idx !== -1) localNotifications.splice(idx, 1);

  try {
    const adminClient = createServiceClient();
    const client = adminClient || supabase;
    await client.from("notifications").delete().eq("id", id);
    return true;
  } catch {
    return true;
  }
}
