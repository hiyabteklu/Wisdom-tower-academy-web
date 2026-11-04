"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScopeStats } from "@/lib/content";
import { UAT_SCOPES, uatSlugFor } from "@/data/uat-hubs";

type Target = { href: string; title: string };
type Best = { at: string; target: Target };

/**
 * Main action on the UAT card.
 * Returning student: jumps straight back into the item they opened last.
 * New student (or signed out): starts with Tips.
 */
export default function UatContinueCard() {
  const [target, setTarget] = useState<Target | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const results = await Promise.all(
          UAT_SCOPES.map((scopePath) => getScopeStats({ scopePath }))
        );
        let best: Best | null = null;
        for (let i = 0; i < UAT_SCOPES.length; i++) {
          const scopePath = UAT_SCOPES[i];
          for (const row of results[i].stats.rows) {
            if (!row.lastOpenedAt) continue;
            const slug = uatSlugFor(scopePath, row.hub);
            if (!slug) continue;
            if (!best || row.lastOpenedAt > best.at) {
              best = {
                at: row.lastOpenedAt,
                target: {
                  href: `/academy/uat/${slug}?res=${encodeURIComponent(row.resourceId)}`,
                  title: row.title,
                },
              };
            }
          }
        }
        if (!cancelled) setTarget(best ? best.target : null);
      } catch {
        if (!cancelled) setTarget(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        aria-hidden
        className="h-[76px] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse"
      />
    );
  }

  const href = target ? target.href : "/academy/uat/tips";
  const eyebrow = target ? "Continue where you left off" : "New to the UAT?";
  const title = target ? target.title : "Start with Tips";
  const sub = target ? null : "How the test is built and how to pace it";

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3.5 sm:px-5 sm:py-4 hover:border-emerald-400/55 hover:bg-emerald-500/15 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-300">
          {eyebrow}
        </p>
        <p className="font-display text-base sm:text-lg font-bold text-white truncate mt-0.5">
          {title}
        </p>
        {sub && <p className="text-xs text-wisdom-muted mt-0.5">{sub}</p>}
      </div>
      <ArrowRight className="w-5 h-5 shrink-0 text-emerald-300 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
