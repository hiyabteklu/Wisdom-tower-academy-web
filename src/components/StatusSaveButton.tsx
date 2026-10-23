"use client";

import { useState, useCallback } from "react";
import { Download } from "lucide-react";
import type { StudentAnalyticsResult } from "@/lib/student-knowledge-base";
import { downloadStatusCard } from "@/lib/status-card-download";

export default function StatusSaveButton({
  studentName,
  userId,
  analytics,
  disabled = false,
}: {
  studentName: string;
  userId: string;
  analytics: StudentAnalyticsResult;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await downloadStatusCard({ studentName, userId, analytics });
    } catch (err) {
      console.warn("[StatusSaveButton] download failed:", err);
    } finally {
      setSaving(false);
    }
  }, [saving, studentName, userId, analytics]);

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-cyan-400/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 hover:border-cyan-300/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
      title="Save a 9:16 status card to your gallery"
    >
      <Download className="w-3.5 h-3.5" />
      <span>{saving ? "Saving…" : "Save status"}</span>
    </button>
  );
}
