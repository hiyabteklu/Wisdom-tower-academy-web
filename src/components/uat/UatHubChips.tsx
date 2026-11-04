"use client";

import Link from "next/link";
import {
  ClipboardList,
  FileText,
  Lightbulb,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { UAT_HUBS } from "@/data/uat-hubs";

const ICONS: Record<string, LucideIcon> = {
  tips: Lightbulb,
  "revision-notes": FileText,
  "previous-exams": ClipboardList,
  resources: LifeBuoy,
};

type Props = {
  /** Slug of the hub currently open */
  activeSlug: string;
};

/** Hub switcher for the UAT pages (same look as ResourceHubChips). */
export default function UatHubChips({ activeSlug }: Props) {
  return (
    <nav
      className="mt-10 flex flex-wrap justify-center gap-2.5 sm:gap-3"
      aria-label="UAT hubs"
    >
      {UAT_HUBS.map((h) => {
        const Icon = ICONS[h.slug] || FileText;
        const active = h.slug === activeSlug;
        return (
          <Link
            key={h.slug}
            href={`/academy/uat/${h.slug}`}
            className={`inline-flex items-center gap-2 min-h-[2.85rem] rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? "border-cyan-400/55 bg-cyan-500/15 text-cyan-50 shadow-md shadow-cyan-500/15"
                : "border-white/12 bg-white/[0.04] text-white/75 hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            <Icon
              className={`w-5 h-5 shrink-0 ${
                active ? "text-cyan-300" : "text-white/45"
              }`}
              aria-hidden
            />
            <span>{h.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
