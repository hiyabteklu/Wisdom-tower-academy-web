"use client";

/**
 * The "Drafts" card at the top of the notification composer. Lists the ready-made messages from
 * src/lib/notification-drafts.ts; Load hands one to the composer, which fills the whole form.
 * Sending is NOT done here. `[~]` NOT compiled.
 */

import { FileText } from "lucide-react";
import { NOTIFICATION_DRAFTS, type NotificationDraft } from "@/lib/notification-drafts";
import { AdminPill } from "./ui";

export default function NotificationDraftsPicker({
  onLoad,
}: {
  onLoad: (draft: NotificationDraft) => void;
}) {
  if (NOTIFICATION_DRAFTS.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-white">Drafts</p>
      <p className="text-xs leading-relaxed text-wisdom-muted">
        Ready-made messages. Tap Load to fill the form below, check it, then press Send now.
      </p>
      <div className="space-y-2">
        {NOTIFICATION_DRAFTS.map((draft) => (
          <div
            key={draft.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-wisdom-card p-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <FileText className="h-5 w-5 shrink-0 text-amber-300" />
              <span className="min-w-0 break-words text-sm font-semibold text-white">{draft.name}</span>
            </div>
            <AdminPill className="shrink-0" onClick={() => onLoad(draft)}>
              Load
            </AdminPill>
          </div>
        ))}
      </div>
    </div>
  );
}
