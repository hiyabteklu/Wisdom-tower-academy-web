import { notFound, redirect } from "next/navigation";
import CategoryBackButton from "@/components/CategoryBackButton";
import AcademicResultSaver from "@/components/AcademicResultSaver";
import HubContentView from "@/components/learning/HubContentView";
import UatHubChips from "@/components/uat/UatHubChips";
import { UAT_HUBS, getUatHub, uatLegacyRedirect } from "@/data/uat-hubs";

export function generateStaticParams() {
  return UAT_HUBS.map((h) => ({ resource: h.slug }));
}

export default async function UatResourcePage({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource: slug } = await params;

  // Old generic-hub URLs (/academy/uat/exams, /academy/uat/short-notes, ...)
  const legacy = uatLegacyRedirect(slug);
  if (legacy) redirect(legacy);

  const hubDef = getUatHub(slug);
  if (!hubDef) notFound();

  return (
    <div className="relative min-h-[75vh]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-25 bg-gradient-to-br from-emerald-500/20 via-teal-500/5 to-transparent" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        <CategoryBackButton fallback="/academy/uat" />

        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400 mb-1">
            UAT
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            <span className={hubDef.accent}>{hubDef.name}</span>
          </h1>
          <p className="text-sm text-wisdom-muted">{hubDef.description}</p>
        </div>

        <div className="mb-8">
          <AcademicResultSaver
            scopeId={hubDef.trackerScopeId}
            scopeLabel={`UAT · ${hubDef.name}`}
            accent={hubDef.accent}
            scopePath={hubDef.scopePath}
            hub={hubDef.id}
          />
        </div>

        <HubContentView
          scopePath={hubDef.scopePath}
          hub={hubDef.id}
          packageId="uat"
          accent={hubDef.accent}
          trackerScopeId={hubDef.trackerScopeId}
        />

        <UatHubChips activeSlug={hubDef.slug} />
      </div>
    </div>
  );
}
