import CategoryBackButton from "@/components/CategoryBackButton";
import CocStreamCards from "@/components/coc/CocStreamCards";
import { Award } from "lucide-react";

export default function CocPage() {
  return (
    <div className="relative min-h-[80vh]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30 bg-gradient-to-br from-indigo-500/25 via-blue-500/10 to-transparent" />
      </div>

      <div className="relative max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 md:py-14">
        <CategoryBackButton fallback="/learning" />

        {/* Header: Pathway name + icon only */}
        <div className="mb-6 sm:mb-8 animate-fade-up">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/10 text-indigo-400 shrink-0">
              <Award className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
                COC
              </h1>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs sm:text-sm font-semibold tracking-[0.15em] uppercase text-wisdom-muted">
            Choose your stream
          </p>
        </div>

        <CocStreamCards />
      </div>
    </div>
  );
}
