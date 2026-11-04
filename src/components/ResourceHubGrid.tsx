"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import { resourceHubs, type ResourceHub } from "@/data/academy";
import ResourceHubCard from "@/components/ResourceHubCard";
import {
  getHubLockMode,
  unlockPackageIdsForPath,
  type HubLockMode,
} from "@/data/content-availability";
import { getOwnedPackageIds } from "@/lib/ownership";
import {
  resolveEffectiveLock,
  toHubLockMode,
} from "@/lib/content-locks";
import { supabase } from "@/lib/supabase";
import { listResources } from "@/lib/contentWithOffline";

type Props = {
  /** Path prefix without trailing slash, e.g. /academy/freshman/mathematics */
  basePath: string;
  /** Optional package id override for lock resolution */
  packageId?: string;
  /** Optional scope path override (e.g. freshman/math-natural) */
  scopePath?: string;
  /**
   * Optional custom hub list (e.g. the 4 UAT hubs). A hub's slug, when set, is the URL segment;
   * otherwise its id is used. Defaults to the generic six hubs.
   */
  hubs?: Array<ResourceHub & { slug?: string; imageFallback?: string }>;
};

function inferPackageAndScope(basePath: string): {
  packageId?: string;
  scopePath?: string;
} {
  const unlockIds = unlockPackageIdsForPath(basePath);
  let packageId = unlockIds[0];
  let scopePath: string | undefined;

  // /academy/freshman/{subject}
  const fresh = basePath.match(/\/academy\/freshman\/([^/]+)/);
  if (fresh) {
    packageId = packageId || "freshman";
    scopePath = `freshman/${fresh[1]}`;
  }

  // /academy/grades/{9|10|11|12}/{subject}
  const grade = basePath.match(/\/academy\/grades\/(9|10|11|12)\/([^/]+)/);
  if (grade) {
    packageId = packageId || `grade-${grade[1]}`;
    scopePath = `grade/${grade[1]}/${grade[2]}`;
  }

  // /academy/remedial/{subject}
  const rem = basePath.match(/\/academy\/remedial\/([^/]+)/);
  if (rem) {
    packageId = packageId || "remedial";
    scopePath = `remedial/${rem[1]}`;
  }

  // /academy/special-packages/.../sem-1/{course}
  const ece = basePath.match(
    /\/special-packages\/(?:electrical-computer-engineering|ece)\/(sem-[12])\/([^/]+)/
  );
  if (ece) {
    packageId =
      packageId || (ece[1] === "sem-1" ? "ece-y3-sem-1" : "ece-y3-sem-2");
    scopePath = `ece/${ece[1]}/${ece[2]}`;
  }

  // Branch root paths
  if (basePath.endsWith("/academy/coc")) {
    packageId = packageId || "coc";
    scopePath = scopePath || "coc";
  }
  if (basePath.endsWith("/academy/uat")) {
    packageId = packageId || "uat";
    scopePath = scopePath || "uat";
  }
  if (basePath.endsWith("/academy/gat")) {
    packageId = packageId || "gat";
    scopePath = scopePath || "gat";
  }
  if (basePath.endsWith("/academy/exit-exam")) {
    packageId = packageId || "exit-exam";
    scopePath = scopePath || "exit-exam";
  }

  return { packageId, scopePath };
}

export default function ResourceHubGrid({
  basePath,
  packageId: packageIdProp,
  scopePath: scopePathProp,
  hubs,
}: Props) {
  const inferred = inferPackageAndScope(basePath);
  const packageId = packageIdProp || inferred.packageId;
  const scopePath = scopePathProp || inferred.scopePath;

  const staticMode = getHubLockMode(basePath);
  const unlockIds = useMemo(() => unlockPackageIdsForPath(basePath), [basePath]);
  const purchasePackageId = unlockIds[0] || packageId || "freshman";

  const [lockMode, setLockMode] = useState<HubLockMode>(staticMode);
  const [owned, setOwned] = useState(false);
  const fetchHubCounts = useCallback(async (): Promise<Record<string, number>> => {
    if (!scopePath) return {};
    const res = await listResources({
      scopePath,
      publishedOnly: true,
      skipAuthCheck: true,
    });
    const counts: Record<string, number> = {
      books: 0,
      "short-notes": 0,
      flashcards: 0,
      "question-banks": 0,
      exams: 0,
      "life-savers": 0,
    };
    if (res.items) {
      for (const item of res.items) {
        const rawHub = String(item.hub);
        const h = rawHub === "references" ? "short-notes" : rawHub;
        if (counts[h] !== undefined) {
          counts[h] += 1;
        }
      }
    }
    return counts;
  }, [scopePath]);

  const { data: hubCounts = null } = useCachedQuery<Record<string, number>>(
    `hub-counts:${scopePath || basePath}`,
    fetchHubCounts,
    {
      scope: "public",
      enabled: Boolean(scopePath),
    }
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveMode() {
      const dyn = await resolveEffectiveLock({
        packageId,
        scopePath,
      });
      const mapped = toHubLockMode(dyn.mode);
      if (!cancelled) {
        setLockMode(mapped ?? staticMode);
      }
    }

    void resolveMode();
    return () => {
      cancelled = true;
    };
  }, [packageId, scopePath, staticMode]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (lockMode === "open") {
        if (!cancelled) setOwned(true);
        return;
      }
      if (lockMode === "coming_soon") {
        if (!cancelled) setOwned(false);
        return;
      }
      // require_purchase
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (!cancelled) setOwned(false);
        return;
      }
      const ids = await getOwnedPackageIds();
      const has = unlockIds.some((id) => ids.has(id));
      if (!cancelled) setOwned(has);
    }

    void check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [basePath, lockMode, unlockIds]);

  const list: Array<ResourceHub & { slug?: string; imageFallback?: string }> =
    hubs ?? resourceHubs;
  const colsClass = list.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <div
      className={`perspective-scene grid grid-cols-2 sm:grid-cols-2 ${colsClass} gap-3 sm:gap-4 md:gap-5 stagger-children`}
    >
      {list.map((hub) => (
        <ResourceHubCard
          key={hub.slug ?? hub.id}
          hub={hub}
          href={`${basePath}/${hub.slug ?? hub.id}`}
          owned={owned}
          lockMode={lockMode}
          purchasePackageId={purchasePackageId}
          itemCount={hubCounts ? (hubCounts[hub.id] ?? 0) : undefined}
          imageFallback={hub.imageFallback}
        />
      ))}
    </div>
  );
}
