"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloudUpload, X } from "lucide-react";
import { COMING_SOON_BODY, COMING_SOON_TITLE } from "@/data/content-availability";

type Props = {
  open: boolean;
  onClose: () => void;
  hubName?: string;
  /** Optional wording overrides (defaults keep the standard Coming soon text) */
  badge?: string;
  title?: string;
  body?: string;
  buttonLabel?: string;
};

export default function ComingSoonModal({
  open,
  onClose,
  hubName,
  badge,
  title,
  body,
  buttonLabel,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed left-0 top-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coming-soon-title"
    >
      {/* Dim only: no heavy blur that fights scroll position */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-[min(24rem,calc(100vw-2rem))] max-h-[min(90dvh,32rem)] overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-gradient-to-b from-[#121a2e] to-[#0a0f1a] shadow-2xl shadow-black/50">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full border border-white/10 p-2 text-wisdom-muted hover:text-white hover:bg-white/5"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-5 pt-9 pb-7 text-center sm:px-8 sm:pt-10 sm:pb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
            <CloudUpload className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>

          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {badge ?? "Coming soon"}
          </p>

          <h2
            id="coming-soon-title"
            className="font-display text-lg sm:text-2xl font-extrabold text-white tracking-tight mb-2 sm:mb-3"
          >
            {title ?? COMING_SOON_TITLE}
          </h2>

          {hubName && (
            <p className="text-sm font-semibold text-cyan-300/90 mb-2">{hubName}</p>
          )}

          <p className="text-sm text-wisdom-muted leading-relaxed max-w-sm mx-auto mb-6">
            {body ?? COMING_SOON_BODY}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="btn-accent min-h-[44px] w-full sm:w-auto px-6 py-2.5 text-sm"
          >
            {buttonLabel ?? "Got it: check back later"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
