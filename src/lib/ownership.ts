/**
 * Which packages the signed-in user already owns
 * (enrollments, verified orders, or admin access grants).
 * ECE Year 3 Semester 1, Freshman, Grades 9–12 and Entrance Questions are free for any registered user.
 */
import { listMyEnrollments, listMyOrders } from "@/lib/orders";
import {
  listMyAccessGrants,
  ALL_PACKAGES_ID,
} from "@/lib/access-grants";
import { academyPackages } from "@/data/packages";
import { supabase } from "@/lib/supabase";

export type OwnershipMap = Set<string>;

/**
 * MASTER FEATURE FLAG: FREE MODE (for Play Store review)
 * Switched from Vercel, no code push: set the environment variable NEXT_PUBLIC_PAID_MODE to "true"
 * (Vercel > Project > Settings > Environment Variables) and redeploy. Anything else, or the variable
 * missing, keeps FREE MODE on (safe default for Play Store review).
 * NEXT_PUBLIC_ is required so the value reaches the browser; it is fixed at build time, so a redeploy
 * is needed after changing it.
 * When free mode is on (true):
 * - All authenticated/signed-in users receive 100% full content access to all learning hubs,
 *   books, notes, questions, and exams without payment walls or ownership requirements.
 * - Guest users MUST sign in to access protected content (navigation/previews remain public).
 * - All payment, purchase, price (ETB), checkout, and cart UI elements are hidden.
 * When free mode is off (false):
 * - Original paid ownership and manual order verification logic resumes seamlessly.
 */
export const IS_FREE_MODE = process.env.NEXT_PUBLIC_PAID_MODE !== "true";

/** Packages unlocked automatically for every signed-in user (no payment). */
export const FREE_FOR_REGISTERED_PACKAGE_IDS = [
  "ece-y3-sem-1",
  "ece-y3-sem-2",
  "freshman",
  "grade-9",
  "grade-10",
  "grade-11",
  "grade-12",
  // Not sold in the catalog (not in academyPackages), always free for registered users
  "entrance-questions",
] as const;

/** Soft-lock flag for UI (landing + academy). Content remains closed until this is flipped. */
export const FRESHMAN_LOCKED_UNTIL_OPENING = false;

let cache: { at: number; ids: OwnershipMap; userId: string | null } | null = null;
const TTL_MS = 30_000;

export function clearOwnershipCache() {
  cache = null;
}

function freePackageSet(): OwnershipMap {
  return new Set<string>(FREE_FOR_REGISTERED_PACKAGE_IDS);
}

function allCatalogIds(): string[] {
  return academyPackages.map((p) => p.id);
}

export async function getOwnedPackageIds(force = false): Promise<OwnershipMap> {
  try {
    let userId: string | null = null;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    } catch {
      /* ignore crypto/jwt error */
    }

    if (!userId && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("wt-academy-auth-v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          userId = parsed?.user?.id ?? null;
        }
      } catch {}
    }

    if (!userId) {
      cache = null;
      return new Set();
    }

    if (
      !force &&
      cache &&
      cache.userId === userId &&
      Date.now() - cache.at < TTL_MS
    ) {
      return cache.ids;
    }

    // When FREE_MODE is active: Authenticated users have immediate full access to all curriculum packages
    if (IS_FREE_MODE) {
      const allIds = new Set<string>(allCatalogIds());
      for (const id of FREE_FOR_REGISTERED_PACKAGE_IDS) allIds.add(id);
      allIds.add(ALL_PACKAGES_ID);
      cache = { at: Date.now(), ids: allIds, userId };
      return allIds;
    }

    // Always grant free packages first — never blocked by enroll/order errors
    const ids = freePackageSet();

    try {
      const [enrolls, orders, grants] = await Promise.all([
        listMyEnrollments(),
        listMyOrders(),
        listMyAccessGrants(),
      ]);

      for (const e of enrolls || []) {
        if (e.packageId === ALL_PACKAGES_ID) {
          for (const id of allCatalogIds()) ids.add(id);
          ids.add(ALL_PACKAGES_ID);
        } else if (e.packageId) {
          ids.add(e.packageId);
        }
      }

      for (const o of orders || []) {
        if (o.status === "verified" && o.packageId) ids.add(o.packageId);
      }

      for (const g of grants || []) {
        if (g.packageId === ALL_PACKAGES_ID) {
          for (const id of allCatalogIds()) ids.add(id);
          ids.add(ALL_PACKAGES_ID);
        } else if (g.packageId) {
          ids.add(g.packageId);
        }
      }
    } catch {
      // keep free packages only
    }

    cache = { at: Date.now(), ids, userId };
    return ids;
  } catch {
    return new Set();
  }
}

export async function isPackageOwned(packageId: string): Promise<boolean> {
  const ids = await getOwnedPackageIds();
  if (ids.has(ALL_PACKAGES_ID)) return true;
  if (packageId === "ece-y3-sem-1" || packageId === "ece-y3-sem-2") {
    if (ids.has("ece-y3-sem-1") || ids.has("ece-y3-sem-2")) return true;
  }
  return ids.has(packageId);
}

/** True when this package unlocks for any signed-in user (no payment). */
export function isFreeForRegistered(packageId: string): boolean {
  if (IS_FREE_MODE) return true;
  return (FREE_FOR_REGISTERED_PACKAGE_IDS as readonly string[]).includes(packageId);
}
