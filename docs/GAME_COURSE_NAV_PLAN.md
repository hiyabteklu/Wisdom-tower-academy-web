# GAME COURSE NAVIGATION PLAN (owner order 2026-10-22)

> Third live task. Owner order 2026-10-22 overrides every "competition only / admin only" sentence in the app repo's HANDOFF.md.
> The work is done in THIS website repo (`hiyabteklu/Wisdom-tower-academy`). The Android app is a WebView shell for these pages, so nothing changes in the app repo. A copy of this file sits in `hiyabteklu/Wisdom-tower-academy-app-packed`, `docs/GAME_COURSE_NAV_PLAN.md`.
> The repo is PUBLIC: no secrets, no student data.

## 1. Owner words (2026-10-22, verbatim)

"currently course navigation into the game is different than course navigation into the hubs in normal learning section. Can it be the same as it, the thumbnails etc. Only the difference is the items in the hub."
Follow-up: "Just push it to main yourself" (about writing this plan into the repo).

Meaning, in plain words: choosing a course for a game must look and work exactly like choosing a course in the normal learning section (same category pages, same thumbnail cards). The only thing that differs is what is inside the course page: game items instead of Books / Notes / Flashcards / Question banks / Exams / Life savers.

## 2. Verified facts (code read in the app repo's `website-reference/` snapshot, app commit 4dcd544; RE-CHECK in this repo before coding, the snapshot may be stale)

1. Normal learning flow: category page (for example `src/app/academy/freshman/page.tsx`) shows a grid of `SubjectCard` (`src/components/SubjectCard.tsx`): 16:9 thumbnail (`card-media-wrap aspect-video`), course name, an "Open" button. Course data and thumbnails come from `src/data/freshman.ts`, `grade-subjects.ts`, `remedial.ts`, `special-packages.ts` (image path pattern `/images/freshman/{id}.jpg`). A course page then shows `ResourceHubGrid` (`src/components/ResourceHubGrid.tsx`), which renders `ResourceHubCard`s with counts and lock handling.
2. Tower Climb picker: `src/components/games/tower-climb/TowerSelector.tsx`. One flat list of dark slate text-only cards, NO thumbnails, no category pages. Its data comes from `getPlayableCourseTowers()` in `src/lib/games/tower-climb/tower-courses.ts`. Navigation between picker, tower map and floor play is in-page state in `TowerClimbApp.tsx` (no URLs).
3. Tower Defense has its own picker: `src/components/games/tower-defense/TowerSelector.tsx` (not read yet: read it in G0).
4. Routes today: `/games/tower-climb`, `/academy/tower-climb`, `/games/tower-defense`, `/academy/exit-exam/tower-defense`.
5. Question sources are fixed by `docs/GAMES-ROADMAP.md`: Tower Climb = question banks only, Tower Defense = exams only. This must not change.
6. In `tower-courses.ts`, the towers "Bastion of Mechanics & Thermodynamics" (`freshman/physics`) and "Spire of Matriculation Calculus" (`grade/12/mathematics`) are built by copying the Freshman Math questions under a different subject name. That is invented content (hypothesis on intent, fact on the code).

## 3. Target design

- The game entry opens the SAME category pages and the SAME `SubjectCard` grid as the normal learning section (Freshman, Grades 9 to 12, Remedial, Special packages, and so on), using the same data files and thumbnails. No new thumbnails, no new card design.
- A course appears in a game's grid only when it has real playable content for that game (Climb: question-bank questions, current rule is at least 8; Defense: exam questions). Courses without content are not shown (do not invent placeholders).
- Tapping a course opens a course page that has the same header/back behaviour as the normal course page, but its body shows the game's items (for Climb: the tower map and its Daily Climb / Review Attic entries; for Defense: its modes) instead of the six hub cards.
- Back button and the app's WebView back behaviour work at every level, as in the normal learning section.

## 4. Slices (one per chat, in order; log each in section 7 before moving on)

- **G0 Inspect, no code.** In this repo confirm sections 2.1 to 2.6, read Tower Defense's `TowerSelector.tsx` and how `src/app/academy/page.tsx` links to the games, list every file that must change, and write the findings and the proposed file/route layout under section 7. Ask the owner only genuinely new questions (for example whether to keep the old URLs working).
- **G1 Shared course picker.** One reusable component that renders the existing category pages / `SubjectCard` grid for a game, with a per-game "has playable content" filter. Reuse `SubjectCard` as is.
- **G2 Tower Climb wired to it.** Replace the old flat picker with G1. Keep `TowerMap`, `FloorPlayView` and all gameplay untouched.
- **G3 Tower Defense wired to it.** Same for Defense.
- **G4 Remove invented towers.** Remove (or hide) the copied physics and Grade 12 towers from `tower-courses.ts`. Do not delete files.
- **G5 Verify.** Run the phone checklist in section 6 and log the evidence.

## 5. Constraints (hard)

1. Navigation and cards only. Do NOT change gameplay, scoring, stars, XP, streaks, hearts, timers, floor/wave logic, question-source rules (Climb = question banks only, Defense = exams only) or the saved-progress keys/shape in `src/lib/games/*/store.ts` (existing players keep their progress).
2. Reuse `SubjectCard`, the existing data files and existing thumbnails. No new dependencies, no new image hosts, no new network calls beyond what the normal learning section already makes.
3. Do not delete or rename any existing file or asset; keep old URLs working (redirect or render the same page) unless the owner says otherwise.
4. Never edit `.env.example` (it must stay exactly the public `NEXT_PUBLIC_*` keys), `.github/`, build/signing files, or `next.config.ts` unless the owner's task says so.
5. Never invent text, counts, course names or content. Every label comes from the existing data files or the owner's words.
6. Inspect before changing, small focused commits, say what could not be verified. Mark code `[~]` until the build is green AND the owner has tested it on the phone.
7. Keep the existing lock/ownership rules of each course (`resolveEffectiveLock`, `isPackageOwned`, `isFreeForRegistered`); the game must not unlock anything the normal section keeps locked.

## 6. Phone checklist (owner)

Open the game from its entry; the first screen shows the same category pages as Learning; course cards look identical (thumbnail, name, Open); a course without content is not listed; opening a course shows the game's items (not the six hubs); back works at every level, also with the phone back button; old links to the games still open; a game started before the change still shows its saved stars/streak; airplane mode behaves like the normal section.

## 7. Status log (append-only)

- 2026-10-22: plan written from a code read of the app repo's `website-reference/` snapshot. Nothing implemented. Next: G0.
