import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * METADATA ONLY (titles, chapters, storage_path, item_count).
 *
 * Since 2026-10-20 (app change S4) the database no longer lets the public or
 * signed-in roles read learning_resources.body_md / meta directly. Full content
 * is served only by the database function open_resource(), which applies the
 * content locks. This route uses the service key, so it must NEVER return
 * body_md / meta: that would hand every locked note, flashcard deck and exam
 * to anyone who calls this URL.
 */
const LIGHT_COLUMNS =
  "id,package_id,scope_path,hub,title,chapter,sort_order,content_type,storage_path,published,created_at,item_count";

function getServiceOrAnonClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "https://placeholder.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const scopePath = searchParams.get("scopePath") || undefined;
    const hub = searchParams.get("hub") || undefined;
    const packageId = searchParams.get("packageId") || undefined;
    const publishedOnly = searchParams.get("publishedOnly") !== "false";

    const supabase = getServiceOrAnonClient();
    let q = supabase.from("learning_resources").select(LIGHT_COLUMNS).order("sort_order", {
      ascending: true,
    });

    const eceMatch = scopePath?.match(/^ece\/(sem-[12])\/([^/]+)$/);
    if (scopePath) {
      if (eceMatch) {
        const otherSem = eceMatch[1] === "sem-1" ? "sem-2" : "sem-1";
        const swappedPath = `ece/${otherSem}/${eceMatch[2]}`;
        q = q.in("scope_path", [scopePath, swappedPath]);
      } else if (scopePath === "freshman/math-natural" || scopePath === "freshman/mathematics") {
        q = q.in("scope_path", ["freshman/math-natural", "freshman/mathematics"]);
      } else {
        q = q.eq("scope_path", scopePath);
      }
    }

    if (hub === "short-notes") {
      q = q.in("hub", ["short-notes", "references"]);
    } else if (hub) {
      q = q.eq("hub", hub);
    }

    if (packageId) {
      if (packageId === "ece-y3-sem-1" || packageId === "ece-y3-sem-2") {
        q = q.in("package_id", ["ece-y3-sem-1", "ece-y3-sem-2"]);
      } else {
        q = q.eq("package_id", packageId);
      }
    }

    if (publishedOnly) {
      q = q.eq("published", true);
    }

    let { data, error } = await q;

    // ECE fallback if 0 rows returned
    if ((!data || data.length === 0) && eceMatch) {
      const courseSlug = eceMatch[2];
      let fallbackQ = supabase
        .from("learning_resources")
        .select(LIGHT_COLUMNS)
        .ilike("scope_path", `%${courseSlug}%`)
        .order("sort_order", { ascending: true });

      if (hub === "short-notes") {
        fallbackQ = fallbackQ.in("hub", ["short-notes", "references"]);
      } else if (hub) {
        fallbackQ = fallbackQ.eq("hub", hub);
      }
      if (publishedOnly) {
        fallbackQ = fallbackQ.eq("published", true);
      }

      const fb = await fallbackQ;
      if (fb.data && fb.data.length > 0) {
        data = fb.data;
        error = null;
      }
    }

    if (error) {
      return NextResponse.json(
        { items: [], error: "Unable to load materials at this time." },
        { status: 500 }
      );
    }

    const items = (data || []).map((row: Record<string, unknown>) => {
      const rawHub = String(row.hub);
      const mappedHub = rawHub === "references" ? "short-notes" : rawHub;
      return {
        id: String(row.id),
        packageId: String(row.package_id),
        scopePath: String(row.scope_path),
        hub: mappedHub,
        title: String(row.title),
        chapter: row.chapter != null ? Number(row.chapter) : null,
        sortOrder: Number(row.sort_order ?? 0),
        contentType: row.content_type,
        storagePath: row.storage_path ? String(row.storage_path) : null,
        // Heavy content is fetched per item through open_resource() (lock-checked).
        bodyMd: null,
        meta: {},
        itemCount: row.item_count != null ? Number(row.item_count) : null,
        published: Boolean(row.published),
        createdAt: row.created_at ? String(row.created_at) : undefined,
      };
    });

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { items: [], error: "Unable to load materials at this time." },
      { status: 500 }
    );
  }
}
