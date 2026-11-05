"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  listResources,
  saveProgress,
  getMyProgress,
  focusStatusLabel,
  type LearningResource,
  type HubId,
  type ProgressMeta,
} from "@/lib/contentWithOffline";
import { getResourceById, getPaidBookUrl } from "@/lib/content";
import { getSeenResourceIds, markResourceSeen } from "@/lib/seenItems";
import { isFreeForRegistered, isPackageOwned } from "@/lib/ownership";
import { cleanCorruptAuthTokens } from "@/lib/supabase";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import {
  BookOpen,
  Clock,
  FileText,
  Play,
  HelpCircle,
  Timer,
  Layers,
  BarChart3,
  Gauge,
  ChevronRight,
  ArrowLeft,
  LogIn,
  UserPlus,
  Gamepad2,
  Crosshair,
  Trophy,
  LifeBuoy,
} from "lucide-react";
import NotesViewer from "@/components/learning/NotesViewer";
import QuizExamViewer from "@/components/learning/QuizExamViewer";
import FlashcardViewer from "@/components/learning/FlashcardViewer";
import PdfReader from "@/components/learning/PdfReader";

type Props = {
  scopePath: string;
  hub: HubId;
  packageId: string;
  accent?: string;
  trackerScopeId?: string;
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s}s`;
}

function completionLabel(pct: number) {
  if (pct >= 85) return "Nearly done";
  if (pct >= 40) return "In progress";
  if (pct > 0) return "Just started";
  return "Not started";
}

function hubIcon(hub: HubId, className = "w-7 h-7") {
  if (hub === "exams") return <Timer className={`${className} text-emerald-400`} />;
  if (hub === "question-banks") return <HelpCircle className={`${className} text-cyan-400`} />;
  if (hub === "flashcards") return <Layers className={`${className} text-violet-400`} />;
  if (hub === "videos") return <Play className={`${className} text-rose-400`} />;
  if (hub === "short-notes") return <FileText className={`${className} text-sky-400`} />;
  if (hub === "life-savers") return <LifeBuoy className={`${className} text-rose-400`} />;
  return <BookOpen className={`${className} text-amber-400`} />;
}

function hubAccentClass(hub: HubId) {
  if (hub === "exams") return "text-emerald-300";
  if (hub === "question-banks") return "text-cyan-300";
  if (hub === "flashcards") return "text-violet-300";
  if (hub === "videos") return "text-rose-300";
  if (hub === "short-notes") return "text-sky-300";
  if (hub === "life-savers") return "text-rose-300";
  return "text-amber-300";
}

function hubItemsLabel(hub: HubId) {
  if (hub === "books") return "all books";
  if (hub === "short-notes") return "all notes";
  if (hub === "videos") return "all videos";
  if (hub === "flashcards") return "all decks";
  if (hub === "question-banks") return "all question banks";
  if (hub === "exams") return "all exams";
  if (hub === "life-savers") return "all life savers";
  return "all items";
}

export default function HubContentView({
  scopePath,
  hub,
  packageId,
  accent = "text-amber-300",
  trackerScopeId,
}: Props) {
  const pathname = usePathname();
  const [owned, setOwned] = useState(false);
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [active, setActive] = useState<LearningResource | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [openingItem, setOpeningItem] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [progMeta, setProgMeta] = useState<ProgressMeta>({});
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const videoWatchRef = useRef(0);
  const freeForRegistered = isFreeForRegistered(packageId);

  useEffect(() => {
    setSeenIds(getSeenResourceIds());
  }, []);

  const fetchResources = useCallback(async (): Promise<LearningResource[]> => {
    const res = await listResources({
      scopePath,
      hub,
      publishedOnly: true,
    });
    if (res.error) setFetchError(res.error);
    else setFetchError(null);
    return res.items || [];
  }, [scopePath, hub]);

  const {
    data: cachedItems,
    isLoading: isResourcesLoading,
    refresh: refreshResources,
  } = useCachedQuery<LearningResource[]>(
    `hub-content:${scopePath}:${hub}`,
    fetchResources,
    {
      scope: "public",
    }
  );

  const items = useMemo(() => cachedItems || [], [cachedItems]);
  const loading = !ownedLoaded && isResourcesLoading;

  useEffect(() => {
    let cancelled = false;
    isPackageOwned(packageId).then((has) => {
      if (!cancelled) {
        setOwned(has);
        setOwnedLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  // Auto-restore active item from ?res= or ?item= in URL
  useEffect(() => {
    if (items.length > 0 && !active && typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get("res") || params.get("item");
        if (targetId) {
          const match = items.find((i) => i.id === targetId);
          if (match) {
            void openItem(match);
          }
        }
      } catch {}
    }
  }, [items, active]);

  useEffect(() => {
    if (!active || !owned) return;
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      setSeconds((s) => s + 1);
      if (document.visibilityState === "visible") {
        setFocusSeconds((f) => f + 1);
      }
      if (active.contentType === "video_url") {
        videoWatchRef.current += 1;
      }
      if (tick % 30 === 0) {
        const videoMeta =
          active.contentType === "video_url"
            ? {
                video: {
                  watchSeconds:
                    (Number(progMeta.video?.watchSeconds || 0) || 0) +
                    videoWatchRef.current,
                },
              }
            : undefined;
        if (videoMeta) videoWatchRef.current = 0;
        void saveProgress({
          resourceId: active.id,
          progressPct,
          addSeconds: 30,
          addFocusSeconds: document.visibilityState === "visible" ? 30 : 0,
          meta: videoMeta,
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, owned, progressPct, progMeta.video?.watchSeconds]);

  useEffect(() => {
    if (active) {
      window.__wtaInPageBack = () => {
        backToItems();
        return true;
      };
    } else {
      if (typeof window !== "undefined" && window.__wtaInPageBack) {
        window.__wtaInPageBack = undefined;
      }
    }
    return () => {
      if (typeof window !== "undefined" && window.__wtaInPageBack) {
        window.__wtaInPageBack = undefined;
      }
    };
  }, [active]);

  async function openItem(item: LearningResource) {
    if (openingItem) return;
    setOpeningItem(true);
    setFetchError(null);
    try {
      // List rows are deliberately light. The per-item RPC rechecks sign-in, device
      // status, publication and entitlement before returning note/question content.
      const checked = await getResourceById(item.id);
      if (!checked.item) {
        setFetchError(checked.error || "This material could not be opened.");
        return;
      }
      const openedItem = checked.item;
      let nextPdfUrl: string | null = null;

      if (openedItem.contentType === "pdf" && openedItem.storagePath) {
        if (openedItem.storagePath.toLowerCase().startsWith("appwrite-paid:")) {
          const paid = await getPaidBookUrl(openedItem.id);
          if (!paid.url) {
            setFetchError(paid.error || "This paid PDF could not be opened.");
            return;
          }
          nextPdfUrl = paid.url;
        } else {
          nextPdfUrl = `/api/content/pdf?path=${encodeURIComponent(openedItem.storagePath)}`;
        }
      }

      markResourceSeen(openedItem.id);
      setSeenIds(getSeenResourceIds());
      setActive(openedItem);
      videoWatchRef.current = 0;
      const prog = await getMyProgress(openedItem.id);
      setProgressPct(prog.pct);
      setSeconds(prog.totalSeconds);
      setFocusSeconds(prog.focusSeconds);
      setProgMeta(prog.meta || {});
      setPdfUrl(nextPdfUrl);

      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("res", openedItem.id);
          window.history.replaceState(null, "", url.pathname + url.search);
          sessionStorage.setItem("wt_prior_study_route", url.pathname + url.search);
        } catch {}
      }
    } finally {
      setOpeningItem(false);
    }
  }

  function backToItems() {
    setActive(null);
    setPdfUrl(null);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("res");
        url.searchParams.delete("item");
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
        sessionStorage.setItem("wt_prior_study_route", url.pathname + (url.search ? url.search : ""));
      } catch {}
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 py-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/10 bg-wisdom-card/60 p-5 animate-pulse space-y-3"
          >
            <div className="h-4 w-1/3 bg-white/10 rounded" />
            <div className="h-3 w-3/4 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!owned) {
    if (freeForRegistered) {
      return (
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-6 text-center">
          <p className="text-white font-semibold mb-2">Sign in to open</p>
          <p className="text-sm text-wisdom-muted mb-4">
            Create a free account to unlock books, notes, questions, and exams. No payment required for
            registered students.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/login?next=${encodeURIComponent(pathname || "/learning")}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-wisdom-dark hover:bg-cyan-400 shadow-md"
            >
              <LogIn className="w-4 h-4" />
              Sign In Free
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(pathname || "/learning")}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              <UserPlus className="w-4 h-4 text-amber-300" />
              Create Free Account
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-6 text-center">
        <p className="text-white font-semibold mb-2">Purchase required</p>
        <p className="text-sm text-wisdom-muted mb-4">
          Unlock this package to open books, notes, questions, and exams.
        </p>
        <Link
          href={`/checkout/${packageId}`}
          className="inline-flex rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-wisdom-dark"
        >
          Buy package
        </Link>
      </div>
    );
  }

  if (openingItem && !active) {
    return (
      <div className="rounded-2xl border border-cyan-400/20 bg-wisdom-card p-8 text-center text-sm text-wisdom-muted">
        Checking your access and opening the material…
      </div>
    );
  }

  if (active) {
    const quiz = progMeta.quiz;
    const fc = progMeta.flashcards;
    const vid = progMeta.video;
    const isBookLike = hub === "books" || hub === "life-savers" || active.contentType === "pdf";
    const isNotes = hub === "short-notes" || active.contentType === "markdown";
    const focusNow = focusStatusLabel(focusSeconds, seconds);
    const isQuizOrExam =
      active.contentType === "quiz" || active.contentType === "exam";

    return (
      <div className={`w-full max-w-full ${isQuizOrExam ? "space-y-3" : "space-y-4"}`}>
        <button
          type="button"
          onClick={backToItems}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-wisdom-dark/80 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15 hover:border-cyan-400/50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to {hubItemsLabel(hub)}
        </button>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2
            className={`font-display font-bold leading-snug ${accent} ${
              isQuizOrExam ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"
            }`}
          >
            {active.title}
          </h2>
        </div>

        {!isQuizOrExam && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {(isBookLike || isNotes) && (
                <>
                  <Chip tone="cyan">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Reading {formatTime(seconds)}
                  </Chip>
                  <Chip tone="amber">
                    <Gauge className="w-3 h-3 inline mr-1" />
                    Focus: {focusNow}
                  </Chip>
                  <Chip>Session: {completionLabel(progressPct)}</Chip>
                  <Chip tone="emerald">
                    <BarChart3 className="w-3 h-3 inline mr-1" />
                    {Math.round(progressPct)}% complete
                  </Chip>
                </>
              )}

              {hub === "videos" && (
                <>
                  <Chip tone="cyan">
                    Watch {formatTime(Number(vid?.watchSeconds || seconds))}
                  </Chip>
                  <Chip tone="amber">{Math.round(progressPct)}%</Chip>
                </>
              )}

              {hub === "flashcards" && fc && (
                <>
                  <Chip>
                    Cards {fc.seen}/{fc.total}
                  </Chip>
                  <Chip tone="emerald">Know {fc.know}</Chip>
                  <Chip tone="amber">Learning {fc.learning}</Chip>
                  <Chip tone="rose">Again {fc.again}</Chip>
                  <Chip tone="cyan">Mastery {fc.accuracy}%</Chip>
                </>
              )}

              {(hub === "question-banks" || hub === "exams") && quiz && (
                <>
                  <Chip>
                    Attempted {quiz.attempted}/{quiz.total}
                  </Chip>
                  <Chip tone="emerald">Correct {quiz.correct}</Chip>
                  {"wrong" in quiz && (
                    <Chip tone="rose">
                      Wrong {Number((quiz as { wrong?: number }).wrong || 0)}
                    </Chip>
                  )}
                  {"skipped" in quiz && (
                    <Chip>
                      Skipped {Number((quiz as { skipped?: number }).skipped || 0)}
                    </Chip>
                  )}
                  <Chip tone="amber">Accuracy {quiz.accuracy}%</Chip>
                  {"elapsedSec" in quiz && (
                    <Chip tone="cyan">
                      Time{" "}
                      {formatTime(Number((quiz as { elapsedSec?: number }).elapsedSec || 0))}
                    </Chip>
                  )}
                </>
              )}
            </div>

            <div className="h-2 rounded-full bg-white/[0.06] border border-white/[0.04] p-0.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 transition-all duration-500 shadow-[0_0_8px_rgba(34,211,238,0.25)]"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </>
        )}

        {active.contentType === "pdf" && pdfUrl && (
          <PdfReader
            url={pdfUrl}
            title={active.title}
            onOpened={() => {
              setProgressPct((p) => Math.max(p, 5));
              void saveProgress({
                resourceId: active.id,
                progressPct: Math.max(progressPct, 5),
                addSeconds: 0,
              });
            }}
          />
        )}

        {active.contentType === "pdf" && !pdfUrl && (
          <p className="text-sm text-wisdom-muted">Could not load this PDF.</p>
        )}

        {active.contentType === "markdown" && (
          <NotesViewer
            body={active.bodyMd || ""}
            resourceId={active.id}
            onProgress={(pct) => {
              setProgressPct(pct);
              void saveProgress({ resourceId: active.id, progressPct: pct });
            }}
          />
        )}

        {active.contentType === "video_url" && (
          <div className="rounded-2xl border border-white/12 p-4">
            <p className="text-sm text-wisdom-muted mb-2 flex items-center gap-1">
              <Play className="w-4 h-4" /> Video
            </p>
            {active.bodyMd?.includes("youtube") || active.bodyMd?.includes("youtu.be") ? (
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  className="w-full h-full"
                  src={toEmbed(active.bodyMd)}
                  allowFullScreen
                  title={active.title}
                  onLoad={() => setProgressPct((p) => Math.max(p, 10))}
                />
              </div>
            ) : (
              <a
                href={active.bodyMd || "#"}
                className="text-cyan-300 underline text-sm"
                target="_blank"
                rel="noreferrer"
              >
                {active.bodyMd || "No URL"}
              </a>
            )}
          </div>
        )}

        {active.contentType === "flashcard_deck" && (
          <FlashcardViewer meta={active.meta} resourceId={active.id} />
        )}

        {(active.contentType === "quiz" || active.contentType === "exam") && (
          <QuizExamViewer
            meta={active.meta}
            isExam={active.contentType === "exam"}
            resourceId={active.id}
            title={active.title}
            trackerScopeId={trackerScopeId}
          />
        )}
      </div>
    );
  }

  if (items.length === 0) {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const isTechnical =
      Boolean(fetchError) &&
      (fetchError!.toLowerCase().includes("key") ||
        fetchError!.toLowerCase().includes("crypto") ||
        fetchError!.toLowerCase().includes("token") ||
        fetchError!.toLowerCase().includes("pgrst") ||
        fetchError!.toLowerCase().includes("jwt") ||
        fetchError!.toLowerCase().includes("syntax") ||
        fetchError!.toLowerCase().includes("relation") ||
        fetchError!.toLowerCase().includes("exception") ||
        fetchError!.toLowerCase().includes("undefined"));

    const displayMsg = isTechnical
      ? "Unable to load materials right now. Tap Retry to reconnect."
      : fetchError ||
        (isOffline
          ? "You are currently offline. Connect to the internet to load materials."
          : "No published materials in this hub yet. Check back soon.");

    return (
      <div className="rounded-2xl border border-white/12 bg-wisdom-card p-8 text-center text-wisdom-muted text-sm space-y-3">
        <FileText className="w-8 h-8 mx-auto mb-1 opacity-50" />
        <p className="max-w-md mx-auto leading-relaxed">{displayMsg}</p>
        {fetchError && (
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                cleanCorruptAuthTokens();
                setFetchError(null);
                void refreshResources();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                cleanCorruptAuthTokens();
                window.location.reload();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-transparent hover:bg-white/5 text-[11px] text-wisdom-muted hover:text-white transition-colors cursor-pointer"
            >
              Refresh page
            </button>
          </div>
        )}
      </div>
    );
  }

  const titleAccent = accent || hubAccentClass(hub);

  return (
    <div className="space-y-4 w-full max-w-full">
      {fetchError && (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {fetchError}
          <button type="button" onClick={() => setFetchError(null)} className="ml-3 underline text-xs">Dismiss</button>
        </div>
      )}
      {/* Featured Game Banners in Learning Hubs (Hidden/Commented per preference) */}
      {/*
      {hub === "exams" && (
        <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-950/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300">
              <Crosshair className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm sm:text-base font-bold text-white">
                  Wisdom Defense: Exam Battle Arcade
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px] font-mono text-cyan-300 font-bold border border-cyan-400/30">
                  Game
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Defend the Knowledge Tower! Shoot down real exam questions with your machine-gun answers.
              </p>
            </div>
          </div>
          <Link
            href="/games/tower-defense"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-md shadow-cyan-500/20 shrink-0 self-start sm:self-auto"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Play Defense</span>
          </Link>
        </div>
      )}

      {hub === "question-banks" && (
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-950/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm sm:text-base font-bold text-white">
                  Tower Climb: The Scholar&apos;s Ascent
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-mono text-amber-300 font-bold border border-amber-400/30">
                  Game
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Climb floor by floor with your lantern owl mascot by conquering chapter question banks!
              </p>
            </div>
          </div>
          <Link
            href="/games/tower-climb"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20 shrink-0 self-start sm:self-auto"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Play Tower Climb</span>
          </Link>
        </div>
      )}
      */}

      <ul className="space-y-3 w-full max-w-full">
      {items.map((item) => {
        const isNew = !seenIds.has(item.id);
        const cardCount = Array.isArray(item.meta?.cards) ? item.meta.cards.length : 0;
        const qCount = Array.isArray(item.meta?.questions) ? item.meta.questions.length : 0;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => void openItem(item)}
              className="w-full flex items-center gap-4 rounded-2xl border border-white/12 bg-wisdom-card px-4 py-4 sm:px-5 sm:py-5 text-left hover:border-amber-400/40 hover:bg-wisdom-card/90 transition-colors shadow-sm group cursor-pointer"
            >
              <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-wisdom-dark/50">
                {hubIcon(hub, "w-7 h-7 sm:w-8 sm:h-8")}
                {isNew && (
                  <span className="absolute -top-1.5 -right-1.5 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
                    New
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-display text-base sm:text-lg font-bold truncate ${titleAccent}`}>
                    {item.title}
                  </p>
                  {isNew && (
                    <span className="shrink-0 rounded-md border border-rose-400/40 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200">
                      New
                    </span>
                  )}
                </div>

                {/* Show chapter and exact count for flashcards, question banks, and exams */}
                {(hub === "flashcards" || hub === "question-banks" || hub === "exams") ? (
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {item.chapter != null && (
                      <span className="text-xs sm:text-sm text-wisdom-muted font-medium">
                        Chapter {item.chapter}
                      </span>
                    )}
                    {item.chapter != null && (
                      <span className="text-white/20 text-xs font-bold">·</span>
                    )}
                    {hub === "flashcards" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 border border-violet-400/30 text-violet-200 shadow-sm">
                        <Layers className="w-3 h-3 text-violet-300" />
                        <span>{cardCount} {cardCount === 1 ? "card" : "cards"}</span>
                      </span>
                    )}
                    {hub === "question-banks" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 shadow-sm">
                        <HelpCircle className="w-3 h-3 text-cyan-300" />
                        <span>{qCount} {qCount === 1 ? "question" : "questions"}</span>
                      </span>
                    )}
                    {hub === "exams" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 shadow-sm">
                        <Timer className="w-3 h-3 text-emerald-300" />
                        <span>{qCount} {qCount === 1 ? "question" : "questions"}</span>
                      </span>
                    )}
                  </div>
                ) : (
                  item.chapter != null && (
                    <p className="text-xs sm:text-sm text-wisdom-muted mt-0.5">
                      Chapter {item.chapter}
                    </p>
                  )
                )}
              </div>

              {/* Extra badge on large screens */}
              <div className="hidden sm:flex items-center shrink-0">
                {hub === "flashcards" && (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-white/[0.05] border border-white/10 text-violet-200">
                    {cardCount} {cardCount === 1 ? "card" : "cards"}
                  </span>
                )}
                {hub === "question-banks" && (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-white/[0.05] border border-white/10 text-cyan-200">
                    {qCount} {qCount === 1 ? "question" : "questions"}
                  </span>
                )}
                {hub === "exams" && (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-white/[0.05] border border-white/10 text-emerald-200">
                    {qCount} {qCount === 1 ? "question" : "questions"}
                  </span>
                )}
              </div>

              <ChevronRight className="w-5 h-5 text-wisdom-muted shrink-0 group-hover:text-amber-300 transition-colors" />
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "emerald" | "amber" | "rose" | "cyan";
}) {
  const map = {
    muted: "border-white/10 text-slate-300 bg-white/[0.03]",
    emerald: "border-emerald-400/25 text-emerald-200 bg-emerald-500/10",
    amber: "border-amber-400/25 text-amber-200 bg-amber-500/10",
    rose: "border-rose-400/25 text-rose-200 bg-rose-500/10",
    cyan: "border-cyan-400/25 text-cyan-200 bg-cyan-500/10",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function toEmbed(url: string) {
  try {
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split(/[?&]/)[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
  } catch {
    /* ignore */
  }
  return url;
}
