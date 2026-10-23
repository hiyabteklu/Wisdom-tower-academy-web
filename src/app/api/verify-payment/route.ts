import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Automatic payment approval is OFF (owner order 2026-10-23): only admins approve payments.
 * This endpoint no longer verifies anything and never creates orders or enrollments.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      verified: false,
      error: "Automatic verification is turned off. Your order will be approved by an admin.",
      code: "NOT_CONFIGURED",
    },
    { status: 503 }
  );
}

export async function GET() {
  return NextResponse.json({ configured: false, banks: [] });
}
