"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getPackage, formatEtb } from "@/data/packages";
import { getPackageResolved, listSellablePackages } from "@/lib/catalog";
import { isPackagePurchasable } from "@/data/content-availability";
import { CloudUpload, ArrowLeft, Gift, BookOpen } from "lucide-react";
import { IS_FREE_MODE } from "@/lib/ownership";
import CheckoutForm from "@/components/CheckoutForm";

/** Gate: only purchasable packages reach CheckoutForm. */
export default function CheckoutPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = use(params);
  const pkg = getPackageResolved(packageId) || getPackage(packageId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load the admin catalog first so the checkout shows the dashboard price (same price as the packages page).
    let cancelled = false;
    listSellablePackages()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-wisdom-muted text-sm">
        Loading…
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-white font-semibold mb-2">Package not found</p>
        <Link href="/packages" className="text-amber-300 text-sm hover:underline">
          Back to packages
        </Link>
      </div>
    );
  }

  if (IS_FREE_MODE) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl border border-white/10 bg-wisdom-card p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
            <Gift className="w-8 h-8" />
          </div>
          <h1 className="font-display text-2xl font-black text-white mb-2">
            {pkg.name} is Unlocked
          </h1>
          <p className="text-sm text-wisdom-muted leading-relaxed mb-6">
            All materials for this pathway are available for registered students.
            No checkout, payment, or verification is required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={pkg.href || "/learning"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 shadow-sm transition-all active:scale-[0.98]"
            >
              <BookOpen className="w-4 h-4" />
              <span>Start Learning Now</span>
            </Link>
            <Link
              href="/packages"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Tracks</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isPackagePurchasable(packageId)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl border border-amber-400/25 bg-wisdom-card p-8 shadow-card-3d">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
            <CloudUpload className="w-7 h-7" />
          </div>
          <h1 className="font-display text-xl font-bold text-white mb-2">Not available yet</h1>
          <p className="text-sm text-wisdom-muted leading-relaxed mb-2">{pkg.name}</p>
          <p className="text-sm text-wisdom-muted leading-relaxed mb-6">
            Resources for this track are still being uploaded. Checkout is locked until materials
            are ready. You can still explore the pathway on Academy.
          </p>
          <p className="text-xs text-wisdom-muted mb-6">{formatEtb(pkg.priceEtb)} · coming soon</p>
          <div className="flex flex-col gap-2">
            <Link
              href={pkg.href}
              className="inline-flex justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-wisdom-dark hover:bg-amber-400"
            >
              Explore pathway
            </Link>
            <Link
              href="/packages"
              className="inline-flex items-center justify-center gap-1 text-sm text-wisdom-muted hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              All packages
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <CheckoutForm packageId={packageId} />;
}
