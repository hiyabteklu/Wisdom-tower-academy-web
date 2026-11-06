/**
 * Notification drafts (ready-made messages for the admin Notifications composer).
 *
 * HOW IT WORKS: each draft below is a message that was written for you (by Claude, or by hand) in the exact
 * shape of the composer: a category, a title, and blocks. In the admin Notifications tab, the "Drafts" card
 * lists them; tapping Load fills the whole form (category, title, every block). You then check it, pick the
 * audience, and press Send now. NOTHING is sent from here.
 *
 * Block text uses the same authoring marks as the composer: **bold**, ==highlight==, and for `list` one
 * bullet per line. `divider` needs no text.
 *
 * To add a draft: add one object to NOTIFICATION_DRAFTS (newest first) and deploy. To remove one: delete it.
 */

import type { NotificationCategory } from "@/lib/notification-v2";
import type { EditorBlockType } from "@/lib/notification-authoring";

export type NotificationDraft = {
  /** Unique, never shown to students. */
  id: string;
  /** Name shown in the Drafts list (admin only). */
  name: string;
  category: NotificationCategory;
  /** The notification title (top field of step 2). */
  title: string;
  blocks: { t: EditorBlockType; text?: string }[];
  /** Only for category "material": the public path to open (for example /learning). */
  url?: string;
};

export const NOTIFICATION_DRAFTS: NotificationDraft[] = [
  {
    id: "app-update-1-1-2",
    name: "App update 1.1.2 (Telegram post)",
    category: "admin",
    title: "🏆 New Wisdom Tower Academy update is here!",
    blocks: [
      { t: "title", text: "🏆 A new Wisdom Tower Academy update is here!" },
      { t: "subtitle", text: "Update the app to 1.1.2" },
      {
        t: "p",
        text: "We've got some **exciting improvements** waiting for you. Update your app and experience ==what's new==!",
      },
      { t: "divider" },
      { t: "subtitle", text: "What's new in the app" },
      {
        t: "list",
        text: [
          "advanced progress tracker",
          "AI tutor inside Notes",
          "Smarter Learning Experience",
          "In-App Updater",
          "Smoother Animations",
          "Live Games for ECE",
        ].join("\n"),
      },
      {
        t: "callout",
        text: "🔮 **Older versions will be discontinued soon**, so don't wait until the last minute. Make sure you're running the latest version to keep enjoying everything Wisdom Tower Academy has to offer.",
      },
      { t: "divider" },
      {
        t: "p",
        text: "👇 ==**Update now**==\nhttps://t.me/wisdom_tower_academy",
      },
    ],
  },
];
