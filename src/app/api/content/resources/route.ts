import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS =
  "id,package_id,scope_path,hub,title,chapter,sort_order,content_type,storage_path,published,created_at,item_count,size_bytes,description";

function clientFor(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const scopePath = searchParams.get("scopePath") || undefined;
    const hub = searchParams.get("hub") || undefined;
    const packageId = searchParams.get("packageId") || undefined;
    const requestedPublishedOnly = searchParams.get("publishedOnly") !== "false";

    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (authHeader && !bearer) {
      return NextResponse.json({ items: [], error: "Invalid authorization header." }, { status: 401 });
    }

    const supabase = clientFor(bearer);
    let isAdmin = false;
    if (bearer) {
      const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !authData.user) {
        return NextResponse.json({ items: [], error: "Sign in again to load learning materials." }, { status: 401 });
      }
      const { data: adminResult, error: adminError } = await supabase.rpc("am_i_admin");
      if (adminError) {
        return NextResponse.json({ items: [], error: "Could not verify account permissions." }, { status: 503 });
      }
      isAdmin = adminResult === true;
    }

    // Students and signed-out visitors receive catalog metadata only. Full note text,
    // questions and flashcard JSON are returned only by the per-resource checked door.
    // Admin editors use the admin-only view, which checks private.is_admin() server-side.
    const source = isAdmin ? "learning_resources_admin" : "learning_resources";
    const columns = isAdmin ? "*" : PUBLIC_COLUMNS;
    let q = supabase.from(source).select(columns).order("sort_order", { ascending: true });

    const eceMatch = scopePath?.match(/^ece\/(sem-[12])\/([^/]+)$/);
    if (scopePath) {
      if (eceMatch) {
        const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
        q = q.in("scope_path", [scopePath, `ece/${otherSem}/${eceMatch[2]}`]);
      } else if (scopePath === "freshman/math-natural" || scopePath === "freshman/mathematics") {
        q = q.in("scope_path", ["freshman/math-natural", "freshman/mathematics"]);
      } else {
        q = q.eq("scope_path", scopePath);
      }
    }
    if (hub === "short-notes") q = q.in("hub", ["short-notes", "references"]);
    else if (hub) q = q.eq("hub", hub);

    if (packageId) {
      if (packageId === "ece-y3-sem-1" || packageId === "ece-y3-sem-2") {
        q = q.in("package_id", ["ece-y3-sem-1", "ece-y3-sem-2"]);
      } else {
        q = q.eq("package_id", packageId);
      }
    }

    if (!isAdmin || requestedPublishedOnly) q = q.eq("published", true);

    let { data, error } = await q;

    // ECE fallback if no rows returned.
    if ((!data || data.length === 0) && eceMatch) {
      const courseSlug = eceMatch[2];
      let fallbackQ = supabase
        .from(source)
        .select(columns)
        .ilike("scope_path", `%${courseSlug}%`)
        .order("sort_order", { ascending: true });
      if (hub === "short-notes") fallbackQ = fallbackQ.in("hub", ["short-notes", "references"]);
      else if (hub) fallbackQ = fallbackQ.eq("hub", hub);
      if (!isAdmin || requestedPublishedOnly) fallbackQ = fallbackQ.eq("published", true);
      const fallback = await fallbackQ;
      if (fallback.data && fallback.data.length > 0) {
        data = fallback.data;
        error = null;
      }
    }

    if (error) {
      return NextResponse.json(
        { items: [], error: "Unable to load materials at this time." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const items = (data || []).map((row: Record<string, unknown>) => {
      const rawHub = String(row.hub);
      return {
        id: String(row.id),
        packageId: String(row.package_id),
        scopePath: String(row.scope_path),
        hub: rawHub === "references" ? "short-notes" : rawHub,
        title: String(row.title),
        chapter: row.chapter != null ? Number(row.chapter) : null,
        sortOrder: Number(row.sort_order ?? 0),
        contentType: row.content_type,
        storagePath: row.storage_path ? String(row.storage_path) : null,
        bodyMd: isAdmin && row.body_md != null ? String(row.body_md) : null,
        meta: isAdmin ? ((row.meta as Record<string, unknown>) || {}) : {},
        published: Boolean(row.published),
        createdAt: row.created_at ? String(row.created_at) : undefined,
      };
    });

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" } }
    );
  } catch {
    return NextResponse.json(
      { items: [], error: "Unable to load materials at this time." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
