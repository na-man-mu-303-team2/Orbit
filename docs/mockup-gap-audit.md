# ORBIT mockup gap audit

## Scope

Production routes, API/shared contracts, and standalone Web surfaces were compared with the routes under `apps/web/src/features/mockups`. The result is a connected catalog plus seven previously missing product surfaces.

## Implemented gaps

| Gap type | Product evidence | Added mockup | Route | Main state covered |
| --- | --- | --- | --- | --- |
| Production screen without mockup | `FocusedPracticePage`, focused-practice route/contracts | Focused practice | `/mockup/focused-practice` | record, stop, retry, attempt history |
| Production screen without mockup | challenge Q&A route and shared/API contracts | Challenge Q&A | `/mockup/challenge-qna` | voice/text modes, tiered hint, answer feedback |
| Production screen without mockup | coaching output used by rehearsal | Next practice plan | `/mockup/practice-plan` | choose a goal, review success criteria, continue |
| Production screen without mockup | `AudienceSessionPage`; `docs/orbit-ui-migration-plan.md` explicitly recorded no mockup | Audience entrance | `/mockup/audience` | passcode verification, room choice, join readiness |
| Backend/shared contract without product surface | presentation brief and evaluator lens modules/schemas | Presentation brief | `/mockup/brief` | audience, purpose, lens, required message, save |
| Backend API without product surface | `GET /snapshots`, `POST /snapshots/:snapshotId/restore` | Version history | `/mockup/version-history` | compare versions, restore confirmation, success state |
| Isolated independent page | `AiPptMockupPage` existed without an app route or design-system stylesheet | AI PPT wizard | `/mockup/ai-ppt` | brief, style, color, references, review, deck sequence |

`/mockup/catalog` is the entry point for the new surfaces and records why each item was added.

## Exclusions

- The Share dialog and AI editor assistant already have equivalent states in the editor mockup, so they were not duplicated.
- `semantic-cue-nli-benchmark.html` is explicitly a developer-only benchmark page and is not a customer product surface.
- No backend contract, production route behavior, or data persistence logic was changed as part of this mockup pass.

## Design-system alignment

- Uses the canonical tokens from `apps/web/src/design-system/orbit-design-system.css`.
- Reuses `OrbitButton`, `OrbitStatus`, `OrbitField`, the ORBIT raster logo, Pretendard/Inter typography, pill actions, and panel radii.
- Uses Tabler icons consistently; the previously isolated AI PPT page was migrated from Lucide icons and given a scoped ORBIT stylesheet.
- Desktop and 390 × 844 responsive states avoid horizontal overflow.

## Flow health

1. Catalog — healthy: all seven destinations are reachable from one map.
2. Presentation brief — healthy: selection and save states work.
3. Practice plan — healthy: goals can be selected and forwarded to focused practice or Q&A.
4. Focused practice — healthy: record/stop/retry states update locally.
5. Challenge Q&A — healthy: hints, input modes, submission, and feedback work.
6. Audience entrance — healthy: four-digit verification and room selection work.
7. Version history — healthy: selection, confirmation, and restore success states work.
8. AI PPT wizard — healthy: the previously isolated wizard is routed and visually aligned with ORBIT.

## Verification evidence

- Desktop captures: `/tmp/orbit-gap-audit/00-catalog.png` through `/tmp/orbit-gap-audit/07-ai-ppt-wizard.png`
- Mobile viewport captures: `/tmp/orbit-gap-audit/mobile-viewport-catalog.png`, `mobile-viewport-brief.png`, `mobile-viewport-challenge-qna.png`, `mobile-viewport-audience.png`, and `mobile-viewport-ai-ppt.png`
- Typecheck: `pnpm --filter @orbit/web typecheck`
- Web tests: 122 files, 848 tests passed during the implementation pass.
