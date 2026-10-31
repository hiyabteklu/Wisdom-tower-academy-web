import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const FALLBACK = "Wisdom Tower AI is currently unavailable.";

const PER_ATTEMPT_MS = 7000;

/**
 * Bump this when the tutor prompt changes on purpose: every question answer cached under the old version is
 * then ignored and asked again once. (Editing a question does NOT need a bump: see makeContextKey.)
 */
const PROMPT_VERSION = "v2";

const GROQ_MODELS = [
  process.env.AI_EXPLAIN_MODEL,
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
].filter((m): m is string => Boolean(m && m.trim()));

const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "openai/gpt-4o-mini";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
}

/** Collapse whitespace so a harmless re-format of a question does not look like a change. */
function norm(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Cache key shared across ALL students.
 *
 * Question explanations: the key is a fingerprint of the CONTENT of the question (text, the choices in their
 * order, the correct answer, the official solution). It deliberately ignores the student's own pick and the
 * resource id, so every student asking about the same question gets the same stored answer.
 * Because the key IS the content, a question that is edited or replaced produces a different key, so the old
 * answer is never served for it and the AI is asked again. Nothing has to be deleted by hand.
 *
 * Summaries / notes keep the original key shape on purpose so the rows already stored keep working.
 */
function makeContextKey(body: Record<string, unknown>): string {
  const mode = String(body.mode || "notes");

  if (mode === "question") {
    const choices = Array.isArray(body.choices)
      ? body.choices.map((c) => norm(c, 1000))
      : [];
    const payload = JSON.stringify({
      v: PROMPT_VERSION,
      mode,
      text: norm(body.text || body.question, 8000),
      choices,
      correct: norm(body.correctAnswer, 1000),
      solution: norm(body.solution, 3000),
    });
    return createHash("sha256").update(payload).digest("hex").slice(0, 56);
  }

  const payload = JSON.stringify({
    mode,
    text: String(body.text || body.question || "").slice(0, 8000),
    solution: body.solution ? String(body.solution).slice(0, 2000) : "",
    choices: Array.isArray(body.choices) ? body.choices.map(String) : [],
    studentAnswer: body.studentAnswer ? String(body.studentAnswer) : "",
    correctAnswer: body.correctAnswer ? String(body.correctAnswer) : "",
    resourceId: body.resourceId ? String(body.resourceId) : "",
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 56);
}

function parseResourceUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s
    )
  ) {
    return s;
  }
  return null;
}

async function readCache(contextKey: string) {
  const supabase = createServiceClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("ai_explanations")
      .select("explanation, model")
      .eq("context_key", contextKey)
      .maybeSingle();
    if (error || !data?.explanation) return null;
    return {
      explanation: String(data.explanation),
      model: data.model ? String(data.model) : undefined,
    };
  } catch (e) {
    console.warn("[ai/explain] cache read failed", errMsg(e));
    return null;
  }
}

async function writeCache(opts: {
  contextKey: string;
  explanation: string;
  model: string;
  mode: string;
  resourceId: string | null;
  promptPreview: string;
}) {
  const supabase = createServiceClient();
  if (!supabase) return;
  try {
    // Upsert on context_key (unique index ai_explanations_context_key_uidx exists)
    const row: Record<string, unknown> = {
      context_key: opts.contextKey,
      explanation: opts.explanation,
      model: opts.model,
      mode: opts.mode,
      prompt: opts.promptPreview.slice(0, 500),
      updated_at: new Date().toISOString(),
    };
    if (opts.resourceId) row.resource_id = opts.resourceId;

    const { error } = await supabase.from("ai_explanations").upsert(row, {
      onConflict: "context_key",
    });
    if (error) {
      // Fallback: plain insert if upsert constraint missing
      console.warn("[ai/explain] cache upsert failed, try insert", error.message);
      await supabase.from("ai_explanations").insert(row);
    }
  } catch (e) {
    console.warn("[ai/explain] cache write failed", errMsg(e));
  }
}

async function groqOnce(model: string, system: string, user: string, key: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${raw.slice(0, 180)}`);
  const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Groq empty");
  return { text, model: `groq/${model}` };
}

async function tryGroq(system: string, user: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");
  let last = "";
  for (const model of GROQ_MODELS) {
    try {
      return await withTimeout(groqOnce(model, system, user, key), PER_ATTEMPT_MS, model);
    } catch (e) {
      last = errMsg(e);
      console.warn("[ai/explain] groq fail", model, last);
    }
  }
  throw new Error(last || "Groq failed");
}

async function tryGateway(system: string, user: string) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY missing");
  const { text } = await withTimeout(
    generateText({
      model: GATEWAY_MODEL,
      system,
      prompt: user,
      temperature: 0.35,
    }),
    PER_ATTEMPT_MS,
    "gateway"
  );
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Gateway empty");
  return { text: trimmed, model: `gateway/${GATEWAY_MODEL}` };
}

async function raceProviders(system: string, user: string) {
  const jobs: Promise<{ text: string; model: string }>[] = [];
  if (process.env.GROQ_API_KEY) jobs.push(tryGroq(system, user));
  if (process.env.AI_GATEWAY_API_KEY) jobs.push(tryGateway(system, user));
  if (!jobs.length) throw new Error("No AI keys configured");
  return Promise.any(jobs);
}

function buildMessages(body: Record<string, unknown>) {
  const mode = String(body.mode || "notes");
  const text = String(body.text || body.question || "").slice(0, 8000);
  const solution = body.solution ? String(body.solution).slice(0, 3000) : "";
  const choices = Array.isArray(body.choices) ? body.choices.map(String) : [];
  const correctAnswer = body.correctAnswer ? String(body.correctAnswer) : "";

  if (mode === "summarize" || mode === "notes") {
    return {
      system:
        "You are a study coach for Ethiopian university students. Summarize the notes in clear English. Use short paragraphs and bullet points. Highlight only terms that appear in the notes. No invented glossary. Max ~220 words.",
      user: `Summarize these study notes for revision:\n\n${text}`,
    };
  }

  if (mode === "question") {
    const choiceLines = choices
      .map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`)
      .join("\n");
    // The student's own pick is NOT part of the prompt: the answer is stored and shared by every student,
    // so it explains the correct option and why each wrong option fails, for whoever asks.
    return {
      system:
        "You are a patient tutor. Explain why the correct option is right and why each wrong option fails. Plain paragraphs, max ~200 words. Use LaTeX as \\(...\\) when needed.",
      user: `Question:\n${text}\n\nChoices:\n${choiceLines || "(none)"}\n\nCorrect answer: ${correctAnswer || solution || "(see solution)"}\n\nOfficial solution:\n${solution || "(none)"}`,
    };
  }

  return {
    system: "You are a helpful tutor. Be concise and clear.",
    user: text,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mode = String(body.mode || "notes");
    const sourceText = String(body.text || body.question || "").trim();
    if (!sourceText) {
      return NextResponse.json({ error: "Nothing to explain" }, { status: 400 });
    }

    const contextKey = makeContextKey(body);
    const resourceId = parseResourceUuid(body.resourceId);

    // 1) Serve from the shared database cache when this exact question/note was already answered
    const cached = await readCache(contextKey);
    if (cached) {
      return NextResponse.json({
        explanation: cached.explanation,
        model: cached.model,
        fallback: false,
        cached: true,
      });
    }

    const { system, user } = buildMessages(body);

    try {
      const result = await raceProviders(system, user);

      // 2) Persist for everyone. AWAITED on purpose: on Vercel the function can be frozen the moment the
      // response is sent, so a fire-and-forget write (`void writeCache`) is often lost and the next student
      // would hit the AI again.
      await writeCache({
        contextKey,
        explanation: result.text,
        model: result.model,
        mode,
        resourceId,
        promptPreview: user,
      });

      return NextResponse.json({
        explanation: result.text,
        model: result.model,
        fallback: false,
        cached: false,
      });
    } catch (e) {
      console.error("[ai/explain] all providers failed", errMsg(e));
      // Never cached, and flagged so the app does not keep it on the phone either.
      return NextResponse.json({
        explanation: FALLBACK,
        fallback: true,
        cached: false,
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
