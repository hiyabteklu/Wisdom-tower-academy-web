import type { NotificationContent } from "@/lib/notification-v2";

/**
 * The welcome notice every student sees in the bell (new and returning).
 * Rich content uses the notifications v2 block shape (see notification-v2.ts): paragraphs, a callout
 * and dividers. `{first_name}` in the title is filled per student by fillFirstName (api/notifications GET);
 * with no known name it is simply dropped ("Hey, you made it").
 */
export const WELCOME_NOTIFICATION_ID = "notif_welcome_system";

export const WELCOME_TITLE = "Hey {first_name}, you made it \u{1F499}";

// Plain preview shown on the card / lock screen: the first lines of the content below.
export const WELCOME_BODY =
  "Welcome to Wisdom Tower Academy! We're genuinely happy you're here. There's a better way to learn, and we're here to keep finding it.";

export const WELCOME_CONTENT: NotificationContent = {
  v: 1,
  blocks: [
    {
      t: "p",
      runs: [
        { text: "Welcome to " },
        { text: "Wisdom Tower Academy", b: true },
        { text: "! We're genuinely happy you're here." },
      ],
    },
    { t: "divider" },
    {
      t: "callout",
      runs: [{ text: "There's a better way to learn, and we're here to keep finding it." }],
    },
    {
      t: "p",
      runs: [
        {
          text: "We're building this academy with students in mind, and we'll keep improving it, listening, and finding better ways to make learning work for you.",
        },
      ],
    },
    { t: "divider" },
    { t: "p", runs: [{ text: "\u2014 Wisdom Tower Academy", b: true }] },
  ],
};

/** Fills `{first_name}`; with no name the token (and the space before it) is removed. */
export function fillFirstName(text: string, firstName?: string | null): string {
  if (!text.includes("{first_name}")) return text;
  const name = firstName?.trim();
  return text.replace(/\s*\{first_name\}/g, name ? ` ${name}` : "").trim();
}
