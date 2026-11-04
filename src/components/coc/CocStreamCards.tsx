"use client";

import { useCallback, useState } from "react";
import { ArrowRight } from "lucide-react";
import ComingSoonModal from "@/components/ComingSoonModal";
import { ENTRANCE_STREAMS } from "@/data/entrance-questions";

/**
 * COC landing: Natural Science and Social Science cards (same images as the
 * Entrance Questions streams). Both open an "under development" pop-up until
 * COC material exists. Stream data comes from src/data/entrance-questions.ts.
 */
export default function CocStreamCards() {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const close = useCallback(() => setOpenLabel(null), []);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-6">
        {ENTRANCE_STREAMS.map((stream) => (
          <button
            key={stream.id}
            type="button"
            onClick={() => setOpenLabel(stream.label)}
            className="card-modern group flex flex-col h-full justify-between text-left w-full cursor-pointer shadow-md shadow-black/25 overflow-hidden rounded-xl sm:rounded-2xl"
          >
            <div className="card-media-wrap aspect-video block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stream.image}
                alt={stream.label}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
            <div className="p-2 sm:p-2.5 md:p-3.5 flex items-center justify-between gap-1.5 sm:gap-2 border-t border-white/8 flex-1 w-full">
              <span
                className={`block font-display text-xs sm:text-sm md:text-base font-bold ${stream.accent} truncate min-w-0 flex-1`}
              >
                {stream.label}
              </span>
              <span className="btn-open shrink-0">
                <span>Open</span>
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </span>
            </div>
          </button>
        ))}
      </div>

      <ComingSoonModal
        open={openLabel !== null}
        onClose={close}
        hubName={openLabel ?? undefined}
        badge="Under development"
        title="Under development"
        body="We are building the COC material for this stream. It will appear here when it is ready."
        buttonLabel="Got it"
      />
    </>
  );
}
