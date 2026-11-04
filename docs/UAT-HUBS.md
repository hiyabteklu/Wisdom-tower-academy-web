# UAT hubs

UAT does not use the generic six hubs. It has four, defined in `src/data/uat-hubs.ts`.

| Hub | URL | Stored as (hub, scope) | Content type |
|-----|-----|------------------------|--------------|
| Tips | `/academy/uat/tips` | `short-notes`, `uat/tips` | markdown |
| Revision Notes | `/academy/uat/revision-notes` | `short-notes`, `uat` | markdown |
| Previous Exams | `/academy/uat/previous-exams` | `exams`, `uat` | exam JSON in `meta` |
| Resources | `/academy/uat/resources` | `life-savers`, `uat` | PDF (Appwrite, same bucket as Life Savers) |

Question banks are not part of UAT. Old URLs such as `/academy/uat/exams` and `/academy/uat/question-banks` redirect to the new pages.

## Why the stored ids look odd

`learning_resources.hub` has a CHECK constraint (see `docs/learning-content-setup.sql`), so a new hub id would need a SQL migration on the live database. UAT reuses existing ids and separates Tips from Revision Notes by `scope_path`. Do not add a `tips` hub id unless the constraint is migrated first.

## Admin

Content library > UAT > Tips / Revision Notes / Previous Exams / Resources. Tips live under the Tips folder (`Tip articles`) because Tips and Revision Notes share the `short-notes` editor.

Items already stored under `uat` with hub `question-banks`, `books`, `flashcards` or `videos` stay in the database but no longer appear anywhere in the UAT UI.

## First-open screen (`/academy/uat`)

1. Exam facts strip (`UAT_FACTS` in `uat-hubs.ts`, verify against the AAU announcement each cycle)
2. Continue card (`UatContinueCard`): last opened UAT item, or Start with Tips for a new student
3. Progress, collapsed
4. Four hub cards
5. Leaderboard

## Hub card images

Upload 16:9 JPGs (1280 x 720 recommended) to:

- `public/images/uat-hubs/tips.jpg`
- `public/images/uat-hubs/revision-notes.jpg`
- `public/images/uat-hubs/previous-exams.jpg`
- `public/images/uat-hubs/resources.jpg`

Until a JPG exists, the matching `.svg` placeholder in the same folder is shown automatically. Do not delete the SVGs; they are the fallback.
