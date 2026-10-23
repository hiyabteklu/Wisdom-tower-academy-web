"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Gauge,
  GraduationCap,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import CustomSelect from "@/components/ui/CustomSelect";
import StatusSaveButton from "@/components/StatusSaveButton";
import {
  computeStudentAnalytics,
  type StudentAnalyticsResult,
  resolveStudentTrackBenchmark,
  ACADEMIC_KNOWLEDGE_BASE,
} from "@/lib/student-knowledge-base";

export interface StudentAnalyticsProps {
  userId: string;
  studentName?: string;
  educationLevel?: string | null;
  stream?: string | null;
  userCreatedAt?: string;
  dailyGoalMinutes?: number;
  enrolledPackageIds?: string[];
  className?: string;
}

export default function StudentAnalyticsDashboard({
  userId,
  studentName = "Scholar",
  educationLevel,
  stream,
  userCreatedAt,
  dailyGoalMinutes = 45,
  enrolledPackageIds = [],
  className = "",
}: StudentAnalyticsProps) {
  const [selectedTrackKey, setSelectedTrackKey] = useState<string>("");

  // Fetch real user progress from Supabase with user-scoped SWR caching
  const fetchProgress = useCallback(async () => {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from("learning_progress")
        .select("resource_id, progress_pct, total_seconds, focus_seconds, last_opened_at, meta")
        .eq("user_id", userId);

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn("[StudentAnalytics] Failed to fetch learning_progress:", err);
    }
    return [];
  }, [userId]);

  const { data: rawProgress = [], isLoading: loading } = useCachedQuery(
    `analytics-progress:${userId}`,
    fetchProgress,
    {
      initialData: [],
      scope: "user",
      enabled: Boolean(userId),
    }
  );

  // Determine initial benchmark track key based on auto-read registration
  const defaultResolvedTrack = useMemo(() => {
    const touched = rawProgress.map((p) => p.resource_id);
    return resolveStudentTrackBenchmark(educationLevel, stream, enrolledPackageIds, touched);
  }, [educationLevel, stream, enrolledPackageIds, rawProgress]);

  useEffect(() => {
    if (!selectedTrackKey) {
      setSelectedTrackKey(defaultResolvedTrack.trackId);
    }
  }, [defaultResolvedTrack.trackId, selectedTrackKey]);

  // Compute rich dynamic analytics evaluated against real records
  const analytics: StudentAnalyticsResult = useMemo(() => {
    const effectiveEduLevel = selectedTrackKey || educationLevel;
    return computeStudentAnalytics(
      rawProgress,
      studentName,
      effectiveEduLevel,
      stream,
      userCreatedAt,
      enrolledPackageIds
    );
  }, [rawProgress, studentName, selectedTrackKey, educationLevel, stream, userCreatedAt, enrolledPackageIds]);

  const trackOptions = Object.values(ACADEMIC_KNOWLEDGE_BASE).map((t) => ({
    value: t.trackId,
    label: t.trackId === defaultResolvedTrack.trackId ? `${t.trackName} (Enrolled)` : t.trackName,
    description: `${t.category} · ${t.weeklyTargetHours}h / week target`,
  }));

  return (
    <div className={`space-y-5 sm:space-y-7 ${className}`}>
      {/* ========================================================= */}
      {/* 1. STUDENT STATUS HEADER & TRACK BENCHMARK                */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-sky-500/20 bg-gradient-to-br from-[#071124]/85 via-[#0b1730]/80 to-[#060e1d]/85 backdrop-blur-2xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.3)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-400/30">
              <GraduationCap className="w-4 h-4 text-sky-400" />
              Your status
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium text-slate-300 bg-white/[0.04] border border-white/10">
              Standing: <strong className="text-cyan-300 font-bold">{analytics.masteryTier}</strong>
            </span>
          </div>

          {/* Save status + Academic Track Benchmark Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusSaveButton
              studentName={studentName}
              userId={userId}
              analytics={analytics}
              disabled={loading}
            />
            <div className="w-56 sm:w-64">
              <CustomSelect
                value={selectedTrackKey || defaultResolvedTrack.trackId}
                onChange={(val) => setSelectedTrackKey(val)}
                options={trackOptions}
                searchable={false}
              />
            </div>
          </div>
        </div>

        {/* Study progress summary */}
        <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] backdrop-blur-md space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Study progress summary</span>
          </p>
          <p className="text-xs sm:text-sm text-slate-100 font-normal leading-relaxed">
            Your cumulative study time is{" "}
            <strong className="text-white font-semibold">{analytics.studyTimeAnalysis.totalStudyHours} hours</strong> (
            {analytics.studyTimeAnalysis.totalStudyMinutes} minutes). You are tracking at{" "}
            <strong className="text-cyan-300 font-semibold">{analytics.weeklyProgressPct}%</strong> of your{" "}
            {analytics.weeklyTargetHours}-hour weekly target with an active streak of{" "}
            <strong className="text-amber-300 font-semibold">{analytics.currentStreakDays} days</strong>.
          </p>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. FOUR HIGH-CONTRAST LEVEL-COLORED HUD METRICS            */}
      {/* ========================================================= */}
      {(() => {
        // Study Time Level
        const timeLevel =
          analytics.weeklyProgressPct >= 75
            ? { text: "text-emerald-400", border: "border-emerald-500/30 hover:border-emerald-400/50", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", status: "On Target" }
            : analytics.weeklyProgressPct >= 50
            ? { text: "text-amber-400", border: "border-amber-500/30 hover:border-amber-400/50", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", status: "Moderate Pace" }
            : { text: "text-rose-400", border: "border-rose-500/30 hover:border-rose-400/50", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30", status: "Under Goal" };

        // Reading Speed Ratio
        const speedRatio = Math.round(
          (analytics.readingSpeedWpm / (analytics.trackBenchmark.expectedReadingWpm || 180)) * 100
        );
        const speedLevel =
          speedRatio >= 90
            ? { text: "text-emerald-400", border: "border-emerald-500/30 hover:border-emerald-400/50", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", status: "High Velocity" }
            : speedRatio >= 65
            ? { text: "text-amber-400", border: "border-amber-500/30 hover:border-amber-400/50", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", status: "Standard Pace" }
            : { text: "text-rose-400", border: "border-rose-500/30 hover:border-rose-400/50", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30", status: "Pacing Warning" };

        // Question Accuracy Level
        const accuracyLevel =
          analytics.questionAccuracyPct >= 75
            ? { text: "text-emerald-400", border: "border-emerald-500/30 hover:border-emerald-400/50", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", status: "Mastery Level" }
            : analytics.questionAccuracyPct >= 50
            ? { text: "text-amber-400", border: "border-amber-500/30 hover:border-amber-400/50", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", status: "Developing" }
            : { text: "text-rose-400", border: "border-rose-500/30 hover:border-rose-400/50", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30", status: "Needs Review" };

        // Streak Level
        const streakLevel =
          analytics.currentStreakDays >= 7
            ? { text: "text-emerald-400", border: "border-emerald-500/30 hover:border-emerald-400/50", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
            : analytics.currentStreakDays >= 3
            ? { text: "text-amber-400", border: "border-amber-500/30 hover:border-amber-400/50", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" }
            : { text: "text-rose-400", border: "border-rose-500/30 hover:border-rose-400/50", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30" };

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Study Time */}
            <div className={`p-4 sm:p-5 rounded-2xl border bg-[#0b1329]/75 backdrop-blur-xl shadow-[0_6px_25px_rgba(0,0,0,0.2)] flex flex-col justify-between ${timeLevel.border} transition-all duration-300`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Study Time
                    </span>
                  </div>
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${timeLevel.badge}`}>
                    {timeLevel.status}
                  </span>
                </div>
                <p className={`font-display text-2xl sm:text-3xl font-extrabold ${timeLevel.text}`}>
                  {analytics.totalStudyHours}
                  <span className="text-sm font-normal text-slate-400 ml-1">hrs</span>
                </p>
                <p className="text-[11px] text-slate-300 font-medium mt-1">
                  Target: {analytics.weeklyTargetHours} hrs/wk ({analytics.weeklyProgressPct}%)
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-white/[0.08] text-[11px] text-slate-400 leading-snug">
                {analytics.hoursRemainingThisWeek > 0
                  ? `${analytics.hoursRemainingThisWeek} hrs remaining to hit weekly quota.`
                  : "Weekly institutional study quota reached."}
              </div>
            </div>

            {/* Card 2: Reading Speed & Focus */}
            <div className={`p-4 sm:p-5 rounded-2xl border bg-[#0b1329]/75 backdrop-blur-xl shadow-[0_6px_25px_rgba(0,0,0,0.2)] flex flex-col justify-between ${speedLevel.border} transition-all duration-300`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                      <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Reading Speed
                    </span>
                  </div>
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${speedLevel.badge}`}>
                    {analytics.readingAnalysis.method.split("/")[0].trim()}
                  </span>
                </div>
                <p className={`font-display text-2xl sm:text-3xl font-extrabold ${speedLevel.text}`}>
                  {analytics.readingSpeedWpm}
                  <span className="text-xs font-normal text-slate-400 ml-1">WPM</span>
                </p>
                <p className="text-[11px] text-slate-300 font-medium mt-1">
                  Focus Dwell Ratio: <strong className="text-white">{analytics.focusRatioPct}%</strong>
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-white/[0.08] text-[11px] text-slate-400 leading-snug">
                Benchmark: {analytics.trackBenchmark.expectedReadingWpm} WPM for {analytics.trackBenchmark.trackName}.
              </div>
            </div>

            {/* Card 3: Question Accuracy */}
            <div className={`p-4 sm:p-5 rounded-2xl border bg-[#0b1329]/75 backdrop-blur-xl shadow-[0_6px_25px_rgba(0,0,0,0.2)] flex flex-col justify-between ${accuracyLevel.border} transition-all duration-300`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                      <Target className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Accuracy
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${accuracyLevel.badge}`}>
                    {accuracyLevel.status}
                  </span>
                </div>
                <p className={`font-display text-2xl sm:text-3xl font-extrabold ${accuracyLevel.text}`}>
                  {analytics.questionAccuracyPct}%
                </p>
                <p className="text-[11px] text-slate-300 font-medium mt-1">
                  Solved: {analytics.questionsCorrect} of {analytics.questionsAttempted} drills
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-white/[0.08] text-[11px] text-slate-400 leading-snug">
                Retention Index: <strong className="text-white">{analytics.retentionAnalysis.retentionIndexPct}%</strong>
              </div>
            </div>

            {/* Card 4: Active Streak */}
            <div className={`p-4 sm:p-5 rounded-2xl border bg-[#0b1329]/75 backdrop-blur-xl shadow-[0_6px_25px_rgba(0,0,0,0.2)] flex flex-col justify-between ${streakLevel.border} transition-all duration-300`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Active Streak
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${streakLevel.badge}`}>
                    {analytics.currentStreakDays >= 7 ? "Unbroken" : "Active"}
                  </span>
                </div>
                <p className={`font-display text-2xl sm:text-3xl font-extrabold ${streakLevel.text}`}>
                  {analytics.currentStreakDays}
                  <span className="text-sm font-normal text-slate-400 ml-1">days</span>
                </p>
                <p className="text-[11px] text-slate-300 font-medium mt-1">
                  Daily active learning recorded
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-white/[0.08] text-[11px] text-slate-400 leading-snug">
                Daily goal: {dailyGoalMinutes} mins / day.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 3. READING SPEED & READING METHOD IN-DEPTH DIAGNOSTIC       */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0b1329]/75 backdrop-blur-xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-400/30">
                Cognitive Reading Diagnostic
              </span>
              <span className="text-xs text-slate-400">
                Evaluated across syllabus chapters & lecture notes
              </span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Your Reading Speed & Method Analysis
            </h3>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className={`text-xs font-semibold px-3.5 py-1 rounded-full border ${analytics.readingAnalysis.methodColor}`}>
              Method: {analytics.readingAnalysis.method}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-xs">
          {/* Diagnostic 1: Reading Velocity */}
          <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md space-y-2 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-center justify-between text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Gauge className="w-3.5 h-3.5" />
                Velocity Rate
              </span>
              <span className="font-mono text-white text-xs sm:text-sm font-semibold">{analytics.readingAnalysis.speedWpm} WPM</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs">
              Your reading velocity is calculated at <strong>{analytics.readingAnalysis.speedWpm} Words Per Minute</strong>. 
              {analytics.readingAnalysis.speedWpm >= 285
                ? " This falls in the rapid scanning category. You transition through text quickly."
                : analytics.readingAnalysis.speedWpm >= 180
                ? " This is an optimal pace for technical and academic comprehension."
                : " This is a deliberate, step-by-step pace ideal for formulas and derivations."}
            </p>
          </div>

          {/* Diagnostic 2: Reading Method Classification */}
          <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md space-y-2 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-center justify-between text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Compass className="w-3.5 h-3.5" />
                Detected Method
              </span>
              <span className="font-semibold text-amber-300">{analytics.readingAnalysis.methodBadge}</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs">
              {analytics.readingAnalysis.methodDescription}
            </p>
          </div>

          {/* Diagnostic 3: Retention Impact */}
          <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md space-y-2 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-center justify-between text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <Zap className="w-3.5 h-3.5" />
                Retention Impact
              </span>
              <span className="font-mono text-emerald-400 font-semibold">{analytics.focusRatioPct}% Focus</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs">
              {analytics.readingAnalysis.retentionImpact}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. RETENTION & ACCURACY DIAGNOSIS                          */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0b1329]/75 backdrop-blur-xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                Retention & Exam Accuracy
              </span>
              <span className="text-xs text-slate-400">
                Derived from drills, chapter checks, and question sets
              </span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Active Recall & Question Precision
            </h3>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className={`text-xs font-semibold px-3.5 py-1 rounded-full border ${analytics.retentionAnalysis.ratingColor}`}>
              {analytics.retentionAnalysis.rating}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs">
          {/* Accuracy Breakdown */}
          <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md space-y-2.5 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                Accuracy & Solved Volume
              </span>
              <span className="font-mono text-cyan-300 font-bold text-sm">
                {analytics.retentionAnalysis.accuracyPct}%
              </span>
            </div>

            <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden p-0.5">
              <div
                style={{ width: `${analytics.retentionAnalysis.accuracyPct}%` }}
                className={`h-full rounded-full transition-all duration-700 ${
                  analytics.retentionAnalysis.accuracyPct >= 75
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : analytics.retentionAnalysis.accuracyPct >= 50
                    ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                    : "bg-gradient-to-r from-rose-500 to-red-400"
                }`}
              />
            </div>

            <div className="flex items-center justify-between text-slate-300 text-xs pt-0.5">
              <span>
                Correct: <strong className="text-white font-mono">{analytics.retentionAnalysis.questionsCorrect}</strong>
              </span>
              <span>
                Total: <strong className="text-white font-mono">{analytics.retentionAnalysis.questionsAttempted}</strong>
              </span>
            </div>

            <p className="text-slate-300 leading-relaxed text-xs">
              {analytics.retentionAnalysis.explanation}
            </p>
          </div>

          {/* Exam Pacing Diagnostic */}
          <div className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md space-y-2.5 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-amber-400" />
                Exam Solve Pacing
              </span>
              <span className="font-mono text-amber-300 font-bold text-sm">
                {analytics.averageMinutesPerQuestion} min/q
              </span>
            </div>

            <div className="p-3 rounded-xl border border-white/8 bg-black/30 text-xs text-slate-300 leading-relaxed">
              {analytics.pacingDiagnosis.message}
            </div>

            <div className="flex items-center justify-between text-slate-400 text-xs pt-0.5">
              <span>National Target: <strong>{analytics.trackBenchmark.targetMinutesPerQuestion}m</strong></span>
              <span className={analytics.pacingDiagnosis.status === "Optimal" ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                Status: {analytics.pacingDiagnosis.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5. RECOMMENDATIONS                                         */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#061226]/85 via-[#091836]/80 to-[#050e20]/85 backdrop-blur-xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                Study Recommendations
              </span>
              <span className="text-xs text-slate-300">
                Personalized study guidance for {studentName}
              </span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Recommended Study Routine Adjustments
            </h3>
          </div>

          <span className="text-xs font-mono font-bold text-cyan-300 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 self-start sm:self-center">
            {analytics.recommendations.length} Recommendations
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs">
          {analytics.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md hover:border-cyan-400/40 hover:bg-white/[0.05] transition-all duration-300 space-y-2.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                    {rec.category}
                  </span>
                </div>
                <h4 className="font-display text-sm font-bold text-white">
                  {rec.title}
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed mt-1">
                  {rec.description}
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] text-xs text-cyan-200 font-medium">
                <strong className="text-cyan-300 block text-[10px] uppercase tracking-wider mb-0.5">
                  Actionable Step:
                </strong>
                {rec.actionableStep}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 6. STUDY ALERTS & HABIT ADJUSTMENTS                       */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-rose-500/20 bg-[#0b1329]/75 backdrop-blur-xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                Study Alerts
              </span>
              <span className="text-xs text-slate-400">
                Based on your recent study patterns
              </span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Habits & Pacing to Adjust
            </h3>
          </div>

          <span className="text-xs font-mono font-bold text-rose-300 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 self-start sm:self-center">
            {analytics.immediatelyStopSignals.length} Alerts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs">
          {analytics.immediatelyStopSignals.map((sig) => (
            <div
              key={sig.id}
              className="p-3.5 sm:p-4.5 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md hover:border-rose-400/40 hover:bg-white/[0.05] transition-all duration-300 space-y-2.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    {sig.severity} Alert
                  </span>
                </div>
                <h4 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{sig.signal}</span>
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed mt-1">
                  <strong className="text-white">Observed Data: </strong>
                  {sig.observedData}
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-200 font-medium">
                <strong className="text-rose-400 block text-[10px] uppercase tracking-wider mb-0.5">
                  Immediate Corrective Action:
                </strong>
                {sig.immediateAction}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 7. WEEKLY READING TIME & DAILY STUDY RHYTHM CHART          */}
      {/* ========================================================= */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0b1329]/75 backdrop-blur-xl p-4 sm:p-6 md:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              Weekly Reading Time & Daily Study Rhythm
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified daily distribution of your reading sessions and question practice (Monday – Sunday).
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-cyan-300 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 self-start sm:self-center">
            {analytics.totalStudyHours} hrs logged this week
          </span>
        </div>

        <div className="h-36 sm:h-40 flex items-end justify-between gap-2 sm:gap-4 px-2 pt-2">
          {analytics.dailyDistribution.map((d) => {
            const max = 120;
            const heightPct = Math.min(100, Math.max(14, Math.round((d.minutes / max) * 100)));
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-[10px] font-mono font-bold text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.minutes}m
                </span>
                <div className="w-full max-w-[2.25rem] bg-white/[0.04] rounded-t-xl overflow-hidden h-24 sm:h-28 flex items-end p-0.5">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-gradient-to-t from-cyan-600 via-sky-500 to-amber-300 rounded-t-lg transition-all duration-500 group-hover:brightness-110 shadow-sm"
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-300">{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
