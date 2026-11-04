import type { ResourceHub } from "@/data/academy";

/**
 * UAT has its own hub set (4 hubs) instead of the generic six.
 *
 * No new database hub ids: learning_resources.hub has a CHECK constraint, so every UAT hub
 * stores under an existing id and is told apart by scope_path.
 *
 *   Tips            hub short-notes   scope uat/tips
 *   Revision Notes  hub short-notes   scope uat
 *   Previous Exams  hub exams         scope uat
 *   Resources       hub life-savers   scope uat   (PDFs, same Appwrite bucket as Life Savers)
 *
 * Hub images: upload 16:9 JPGs to public/images/uat-hubs/{slug}.jpg
 * Until then the SVG placeholder public/images/uat-hubs/{slug}.svg is shown.
 */

export type UatHub = ResourceHub & {
  /** URL segment under /academy/uat/ */
  slug: string;
  /** learning_resources.scope_path this hub reads from */
  scopePath: string;
  /** Id used by the academic results tracker (kept stable for existing history) */
  trackerScopeId: string;
  /** Shown while the uploaded .jpg does not exist yet */
  imageFallback: string;
};

const IMG_DIR = "/images/uat-hubs";

function img(slug: string) {
  return `${IMG_DIR}/${slug}.jpg`;
}

function placeholder(slug: string) {
  return `${IMG_DIR}/${slug}.svg`;
}

/** Order is the order students see: orientation first, reference last. */
export const UAT_HUBS: UatHub[] = [
  {
    id: "short-notes",
    slug: "tips",
    scopePath: "uat/tips",
    trackerScopeId: "uat-tips",
    name: "Tips",
    description: "How the exam is built, how to pace it, and what to do on the day",
    accent: "text-amber-400",
    glow: "group-hover:shadow-amber-500/20",
    icon: "lightbulb",
    image: img("tips"),
    imageFallback: placeholder("tips"),
  },
  {
    id: "short-notes",
    slug: "revision-notes",
    scopePath: "uat",
    trackerScopeId: "uat-short-notes",
    name: "Revision Notes",
    description: "Quantitative and Verbal topics in short, exam-focused notes",
    accent: "text-violet-400",
    glow: "group-hover:shadow-violet-500/20",
    icon: "library",
    image: img("revision-notes"),
    imageFallback: placeholder("revision-notes"),
  },
  {
    id: "exams",
    slug: "previous-exams",
    scopePath: "uat",
    trackerScopeId: "uat-exams",
    name: "Previous Exams",
    description: "Past UAT papers to sit under timed conditions",
    accent: "text-emerald-400",
    glow: "group-hover:shadow-emerald-500/20",
    icon: "clipboard",
    image: img("previous-exams"),
    imageFallback: placeholder("previous-exams"),
  },
  {
    id: "life-savers",
    slug: "resources",
    scopePath: "uat",
    trackerScopeId: "uat-life-savers",
    name: "Resources",
    description: "PDFs, formula sheets, and reference files",
    accent: "text-rose-400",
    glow: "group-hover:shadow-rose-500/20",
    icon: "life-buoy",
    image: img("resources"),
    imageFallback: placeholder("resources"),
  },
];

/** Scopes that hold UAT learning content (used by the Continue card). */
export const UAT_SCOPES = ["uat", "uat/tips"] as const;

/**
 * Facts strip on the UAT card. Edit here if AAU changes the format.
 * Verify against the official AAU announcement before each admission cycle.
 */
export const UAT_FACTS = ["100 questions", "150 minutes", "Computer-based"];

export function getUatHub(slug: string): UatHub | undefined {
  return UAT_HUBS.find((h) => h.slug === slug);
}

/** Which UAT page a stored (scope, hub) pair belongs to. */
export function uatSlugFor(scopePath: string, hub: string): string | null {
  if (scopePath === "uat/tips" && hub === "short-notes") return "tips";
  if (scopePath !== "uat") return null;
  if (hub === "short-notes" || hub === "references") return "revision-notes";
  if (hub === "exams") return "previous-exams";
  if (hub === "life-savers") return "resources";
  return null;
}

const LEGACY_REDIRECTS = new Map<string, string>([
  ["short-notes", "/academy/uat/revision-notes"],
  ["short-note", "/academy/uat/revision-notes"],
  ["references", "/academy/uat/revision-notes"],
  ["notes", "/academy/uat/revision-notes"],
  ["exams", "/academy/uat/previous-exams"],
  ["exam", "/academy/uat/previous-exams"],
  ["question-banks", "/academy/uat/previous-exams"],
  ["question-bank", "/academy/uat/previous-exams"],
  ["questions", "/academy/uat/previous-exams"],
  ["life-savers", "/academy/uat/resources"],
  ["life-saver", "/academy/uat/resources"],
  ["lifesavers", "/academy/uat/resources"],
  ["lifesaver", "/academy/uat/resources"],
  ["books", "/academy/uat"],
  ["book", "/academy/uat"],
  ["textbooks", "/academy/uat"],
  ["textbook", "/academy/uat"],
  ["flashcards", "/academy/uat"],
  ["flashcard", "/academy/uat"],
  ["cards", "/academy/uat"],
  ["videos", "/academy/uat"],
]);

/** Old generic-hub URLs (/academy/uat/exams etc.) keep working by redirecting. */
export function uatLegacyRedirect(slug: string): string | null {
  return LEGACY_REDIRECTS.get(slug.toLowerCase()) ?? null;
}
