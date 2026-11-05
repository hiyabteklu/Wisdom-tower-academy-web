import { NextRequest, NextResponse } from "next/server";
import {
  APPWRITE_PATH_PREFIX,
  isAppwriteStoragePath,
  parseAppwriteFileId,
} from "@/lib/content";

/**
 * Proxy a learning-content PDF through our origin so the in-app reader
 * can use a same-origin blob (mobile-friendly).
 * Query: ?path=<storage_path>
 *
 * Supports:
 * - appwrite:FILE_ID (all packages)
 * - legacy Supabase storage paths (if any remain)
 *
 * HEAD: returns Content-Length when possible (size probe before download).
 */

function appwriteConfig() {
  const endpoint =
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";
  const bucketId =
    process.env.APPWRITE_BUCKET_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID ||
    "";
  return { endpoint, projectId, bucketId };
}

function appwriteViewUrl(fileId: string) {
  const { endpoint, projectId, bucketId } = appwriteConfig();
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
}

/** HEAD: size probe only; do not download body when possible. */
export async function HEAD(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) {
    return new NextResponse(null, { status: 400 });
  }
  // Paid Appwrite PDFs must only be opened through the authenticated book-url
  // Edge Function, which checks entitlement and issues a short-lived token.
  if (path.toLowerCase().startsWith("appwrite-paid:")) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  if (isAppwriteStoragePath(path) || path.startsWith(APPWRITE_PATH_PREFIX)) {
    const fileId =
      parseAppwriteFileId(path) || path.replace(/^appwrite:/i, "").trim();
    if (!fileId) return new NextResponse(null, { status: 400 });

    const { projectId, bucketId } = appwriteConfig();
    if (!projectId || !bucketId) return new NextResponse(null, { status: 500 });

    const viewUrl = appwriteViewUrl(fileId);
    try {
      // Prefer upstream HEAD
      let upstream = await fetch(viewUrl, {
        method: "HEAD",
        headers: { Accept: "application/pdf,*/*" },
        cache: "no-store",
      });
      let len = upstream.headers.get("Content-Length");

      // Some Appwrite setups ignore HEAD: try Range
      if ((!len || !upstream.ok) && upstream.status !== 404) {
        upstream = await fetch(viewUrl, {
          method: "GET",
          headers: { Accept: "application/pdf,*/*", Range: "bytes=0-0" },
          cache: "no-store",
        });
        const cr = upstream.headers.get("Content-Range");
        const m = cr?.match(/\/(\d+)\s*$/);
        if (m) len = m[1];
        else len = upstream.headers.get("Content-Length");
        // Drain tiny body so connection can close
        await upstream.arrayBuffer().catch(() => null);
      }

      if (!upstream.ok && upstream.status !== 206) {
        return new NextResponse(null, {
          status: upstream.status === 404 ? 404 : 502,
        });
      }

      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      });
      if (len) headers.set("Content-Length", len);
      return new NextResponse(null, { status: 200, headers });
    } catch {
      return new NextResponse(null, { status: 502 });
    }
  }

  // No legacy Supabase-backed PDF rows remain. Reject arbitrary storage paths.
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Paid Appwrite PDFs must never be proxied through this public route.
  // Their only supported path is the authenticated book-url Edge Function.
  if (path.toLowerCase().startsWith("appwrite-paid:")) {
    return NextResponse.json(
      { error: "Paid PDFs require an authenticated access check." },
      { status: 403, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  }

  // --- Public Appwrite files (free books only) ---
  if (isAppwriteStoragePath(path) || path.startsWith(APPWRITE_PATH_PREFIX)) {
    const fileId =
      parseAppwriteFileId(path) || path.replace(/^appwrite:/i, "").trim();
    if (!fileId) {
      return NextResponse.json({ error: "Invalid Appwrite file id" }, { status: 400 });
    }

    const { projectId, bucketId } = appwriteConfig();

    if (!projectId || !bucketId) {
      return NextResponse.json(
        {
          error:
            "Appwrite env missing. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_BUCKET_ID on the host.",
        },
        { status: 500 }
      );
    }

    const viewUrl = appwriteViewUrl(fileId);

    try {
      const upstream = await fetch(viewUrl, {
        headers: { Accept: "application/pdf,*/*" },
        cache: "no-store",
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json(
          {
            error: `Appwrite file not readable (${upstream.status}). Check bucket id, file id, and that role "Any" has READ.`,
            detail: detail.slice(0, 200),
          },
          { status: upstream.status === 404 ? 404 : 502 }
        );
      }

      const buf = await upstream.arrayBuffer();
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(buf.byteLength),
          "Content-Disposition": 'inline; filename="document.pdf"',
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
          "Accept-Ranges": "bytes",
        },
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "Failed to fetch Appwrite file",
        },
        { status: 502 }
      );
    }
  }

  // No legacy Supabase-backed PDF rows remain. Reject arbitrary storage paths;
  // never use a service-role key to proxy an unverified path.
  return NextResponse.json(
    { error: "This PDF storage path is not supported." },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}
