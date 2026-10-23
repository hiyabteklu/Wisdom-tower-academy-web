/**
 * Renders a 9:16 student status card to a JPEG and triggers download.
 * Uses only data already computed by computeStudentAnalytics — no new APIs.
 */
import type { StudentAnalyticsResult } from "@/lib/student-knowledge-base";

const W = 1080;
const H = 1920;

export interface StatusCardInput {
  studentName: string;
  userId: string;
  analytics: StudentAnalyticsResult;
  weekLabel?: string;
}

function shortId(userId: string): string {
  const clean = (userId || "guest").replace(/[^a-zA-Z0-9]/g, "");
  const tail = clean.slice(-8).toUpperCase() || "GUEST";
  return `WTA-${tail}`;
}

function weekOfLabel(d = new Date()): string {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)} ${d.getFullYear()}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  pct: number,
  color: string,
  label: string,
  value: string
) {
  const start = -Math.PI * 0.75;
  const end = Math.PI * 0.75;
  const clamped = Math.max(0, Math.min(100, pct)) / 100;

  ctx.lineWidth = 14;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.arc(cx, cy, radius, start, start + (end - start) * clamped);
  ctx.stroke();

  ctx.fillStyle = "#f4f7fb";
  ctx.font = "bold 36px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(value, cx, cy + 8);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(label.toUpperCase(), cx, cy + radius + 36);
}

function humanTip(analytics: StudentAnalyticsResult): { title: string; body: string } {
  const weak = [...analytics.courseBreakdown].sort(
    (a, b) => a.calculatedMasteryPct - b.calculatedMasteryPct
  )[0];

  if (weak && (weak.status === "Urgent Attention" || weak.calculatedMasteryPct < 50)) {
    const step =
      analytics.recommendations[0]?.actionableStep ||
      analytics.tailoredDirectives?.urgentTask ||
      `Open ${weak.name} and finish one chapter set of drills this week.`;
    return {
      title: `Needs work: ${weak.name}`,
      body: step.replace(/\s+/g, " ").trim().slice(0, 160),
    };
  }

  const rec = analytics.recommendations[0];
  if (rec) {
    return {
      title: rec.title.slice(0, 48),
      body: (rec.actionableStep || rec.description).replace(/\s+/g, " ").trim().slice(0, 160),
    };
  }

  return {
    title: "Keep going",
    body:
      analytics.tailoredDirectives?.scheduleAdvice ||
      "Hit your daily minutes and protect the streak.",
  };
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/images/brand/logo.png";
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, yy);
      line = words[n] + " ";
      yy += lineHeight;
      if (yy > y + lineHeight * 2) break;
    } else {
      line = test;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), x, yy);
}

export async function downloadStatusCard(input: StatusCardInput): Promise<void> {
  const { studentName, userId, analytics } = input;
  const weekLabel = input.weekLabel || weekOfLabel();
  const id = shortId(userId);
  const tip = humanTip(analytics);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#050811");
  bg.addColorStop(0.45, "#0b1730");
  bg.addColorStop(1, "#060e1d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 4;
  roundRect(ctx, 24, 24, W - 48, H - 48, 40);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  roundRect(ctx, 40, 40, W - 80, H - 80, 32);
  ctx.stroke();

  let y = 72;

  const logo = await loadLogo();
  if (logo) {
    ctx.drawImage(logo, 72, y, 64, 64);
  } else {
    ctx.fillStyle = "#22d3ee";
    roundRect(ctx, 72, y, 64, 64, 16);
    ctx.fill();
  }
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Wisdom Tower Academy", 152, y + 28);
  ctx.fillStyle = "#67e8f9";
  ctx.font = "600 20px system-ui, -apple-system, sans-serif";
  ctx.fillText("Weekly status · Gallery save", 152, y + 56);

  y += 100;

  roundRect(ctx, 64, y, W - 128, 168, 24);
  ctx.fillStyle = "rgba(14, 165, 233, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#f4f7fb";
  ctx.font = "bold 44px system-ui, -apple-system, sans-serif";
  ctx.fillText(studentName || "Scholar", 88, y + 56);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.fillText(`ID  ${id}`, 88, y + 96);

  ctx.fillStyle = "#67e8f9";
  ctx.font = "600 22px system-ui, -apple-system, sans-serif";
  const track = analytics.trackBenchmark.trackName.slice(0, 42);
  ctx.fillText(track, 88, y + 136);

  const standing = analytics.masteryTier;
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  const sw = ctx.measureText(standing).width + 28;
  const sx = W - 64 - sw - 24;
  roundRect(ctx, sx, y + 28, sw, 36, 18);
  ctx.fillStyle = "rgba(34, 211, 238, 0.15)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
  ctx.stroke();
  ctx.fillStyle = "#67e8f9";
  ctx.textAlign = "center";
  ctx.fillText(standing, sx + sw / 2, y + 52);
  ctx.textAlign = "left";

  y += 200;

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
  ctx.fillText("This week at a glance", 72, y);
  y += 28;

  const gauges = [
    {
      pct: analytics.weeklyProgressPct,
      color:
        analytics.weeklyProgressPct >= 75
          ? "#34d399"
          : analytics.weeklyProgressPct >= 50
          ? "#fbbf24"
          : "#fb7185",
      label: "Study time",
      value: `${analytics.totalStudyHours}h`,
    },
    {
      pct: analytics.questionAccuracyPct,
      color:
        analytics.questionAccuracyPct >= 75
          ? "#34d399"
          : analytics.questionAccuracyPct >= 50
          ? "#fbbf24"
          : "#fb7185",
      label: "Accuracy",
      value: `${analytics.questionAccuracyPct}%`,
    },
    {
      pct: Math.min(100, analytics.currentStreakDays * 12),
      color:
        analytics.currentStreakDays >= 7
          ? "#34d399"
          : analytics.currentStreakDays >= 3
          ? "#fbbf24"
          : "#fb7185",
      label: "Streak",
      value: `${analytics.currentStreakDays}d`,
    },
    {
      pct: analytics.focusRatioPct,
      color:
        analytics.focusRatioPct >= 85
          ? "#34d399"
          : analytics.focusRatioPct >= 70
          ? "#fbbf24"
          : "#fb7185",
      label: "Focus",
      value: `${analytics.focusRatioPct}%`,
    },
  ];

  const gY = y + 110;
  const positions = [
    [W * 0.28, gY],
    [W * 0.72, gY],
    [W * 0.28, gY + 220],
    [W * 0.72, gY + 220],
  ] as const;

  gauges.forEach((g, i) => {
    drawGauge(ctx, positions[i][0], positions[i][1], 78, g.pct, g.color, g.label, g.value);
  });

  y = gY + 360;

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
  ctx.fillText("Subjects", 72, y);
  y += 20;

  const subjects = [...analytics.courseBreakdown]
    .sort((a, b) => b.studyMinutes - a.studyMinutes)
    .slice(0, 5);

  if (subjects.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 22px system-ui, -apple-system, sans-serif";
    ctx.fillText("Open a few chapters this week to fill this list.", 72, y + 40);
    y += 80;
  } else {
    for (const s of subjects) {
      y += 18;
      roundRect(ctx, 64, y, W - 128, 72, 16);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#f1f5f9";
      ctx.font = "600 24px system-ui, -apple-system, sans-serif";
      const name = s.name.length > 28 ? s.name.slice(0, 26) + "…" : s.name;
      ctx.fillText(name, 84, y + 32);

      const pct = Math.round(s.calculatedMasteryPct);
      ctx.fillStyle = pct >= 75 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#fb7185";
      ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, W - 84, y + 32);
      ctx.textAlign = "left";

      const bx = 84;
      const by = y + 48;
      const bw = W - 168;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, bx, by, bw, 10, 5);
      ctx.fill();
      ctx.fillStyle = pct >= 75 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#fb7185";
      roundRect(ctx, bx, by, Math.max(8, (bw * pct) / 100), 10, 5);
      ctx.fill();

      y += 72;
    }
  }

  y += 28;

  roundRect(ctx, 64, y, W - 128, 200, 24);
  ctx.fillStyle = "rgba(251, 113, 133, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 113, 133, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#fda4af";
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("FOCUS THIS WEEK", 88, y + 40);

  ctx.fillStyle = "#f4f7fb";
  ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(tip.title.slice(0, 40), 88, y + 82);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "500 24px system-ui, -apple-system, sans-serif";
  wrapText(ctx, tip.body, 88, y + 120, W - 176, 32);

  ctx.fillStyle = "#64748b";
  ctx.font = "500 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Week of ${weekLabel}`, W / 2, H - 88);
  ctx.fillStyle = "#475569";
  ctx.font = "500 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("wisdom-tower-academy.live  ·  My Learning", W / 2, H - 56);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not create image");

  const safeName =
    (studentName || "student").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-") ||
    "student";
  const filename = `WTA-status-${safeName}-${new Date().toISOString().slice(0, 10)}.jpg`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
