"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ResourceHub } from "@/data/academy";
import type { HubLockMode } from "@/data/content-availability";
import ComingSoonModal from "@/components/ComingSoonModal";
import PurchaseRequiredModal from "@/components/PurchaseRequiredModal";

type Props = {
  hub: ResourceHub;
  href: string;
  /** If true, user owns the package: navigate freely */
  owned?: boolean;
  lockMode?: HubLockMode;
  /** Package to buy when lockMode is require_purchase */
  purchasePackageId?: string;
  /** Number of published items in this hub */
  itemCount?: number;
  /** Shown if hub.image fails to load (e.g. a placeholder until the real image is uploaded) */
  imageFallback?: string;
};

export default function ResourceHubCard({
  hub,
  href,
  owned = false,
  lockMode = "open",
  purchasePackageId = "freshman",
  imageFallback,
}: Props) {
  const [soonOpen, setSoonOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const swapToFallback = useCallback(() => {
    const el = imgRef.current;
    if (!el || !imageFallback || el.dataset.fallback === "1") return;
    el.dataset.fallback = "1";
    el.src = imageFallback;
  }, [imageFallback]);

  // The image can fail before React hydrates, so onError alone would miss it.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) swapToFallback();
  }, [swapToFallback]);

  const blocked = !owned && lockMode !== "open";

  const body = (
    <>
      <div className="card-media-wrap aspect-video">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={hub.image}
          alt={hub.name}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={swapToFallback}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>

      <div className="p-2 sm:p-2.5 md:p-3.5 flex flex-col flex-1 border-t border-white/8 justify-between">
        <div>
          <h2 className="font-display text-xs sm:text-base md:text-lg font-bold tracking-tight text-white group-hover:text-cyan-200 transition-colors line-clamp-2">
            {hub.name}
          </h2>

          {hub.description && (
            <p className="hidden sm:block text-xs text-wisdom-muted leading-relaxed line-clamp-2 mt-1 mb-2">
              {hub.description}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5">
          <span className="btn-open">
            <span>
              {owned || lockMode === "open"
                ? "Open"
                : lockMode === "require_purchase"
                  ? "Unlock"
                  : "Preview"}
            </span>
            <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </>
  );

  if (blocked) {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            lockMode === "require_purchase" ? setBuyOpen(true) : setSoonOpen(true)
          }
          className="card-modern group flex flex-col h-full justify-between text-left w-full cursor-pointer shadow-md overflow-hidden rounded-xl sm:rounded-2xl"
        >
          {body}
        </button>
        <ComingSoonModal open={soonOpen} onClose={() => setSoonOpen(false)} hubName={hub.name} />
        <PurchaseRequiredModal
          open={buyOpen}
          onClose={() => setBuyOpen(false)}
          packageId={purchasePackageId}
          hubName={hub.name}
        />
      </>
    );
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className="card-modern group flex flex-col h-full justify-between shadow-md overflow-hidden rounded-xl sm:rounded-2xl"
    >
      {body}
    </Link>
  );
}
