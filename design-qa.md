# ORBIT missing-surface mockup design QA

## Source visual truth

- `apps/web/src/design-system/orbit-design-system.css`
- `apps/web/src/design-system/OrbitDesignSystemPage.tsx`
- Existing mockup header, cards, forms, rehearsal, editor, report, and live presentation patterns under `apps/web/src/features/mockups`
- ORBIT logo assets already selected by the current design system

## Implementation evidence

- Desktop viewport: 1440 × 1000
- Mobile viewport: 390 × 844
- Desktop captures: `/tmp/orbit-gap-audit/00-catalog.png` through `/tmp/orbit-gap-audit/07-ai-ppt-wizard.png`
- Mobile captures: `/tmp/orbit-gap-audit/mobile-viewport-*.png`
- Checked interactions: brief selections/save, practice goal selection, record/stop/retry, Q&A hint/input/feedback, audience passcode/room selection, version restore dialog, wizard navigation

## Findings and fixes

1. P1 — the isolated AI PPT page rendered as unstyled native HTML because it had no stylesheet import. Added a scoped ORBIT stylesheet and changed the icon set to Tabler.
2. P2 — version status pills inherited the snapshot icon selector and stacked vertically. Restricted the selector to the first direct child.
3. Responsive pass — all eight routes were measured at 390 × 844. `documentElement.scrollWidth` matched `clientWidth` for every route and viewport captures showed stable Korean wrapping and usable controls.
4. Desktop pass — page hierarchy, panel rhythm, ORBIT Lilac/Lime/Cream/Navy roles, border weight, pill actions, and logo/header treatment match the current system.
5. Asset pass — no custom SVG, placeholder art, emoji, gradient, or CSS illustration was added. Existing logo assets and library icons are used.

## Accepted intentional differences

- Audience entrance uses the darker live-presentation Navy surface because it is an unauthenticated session entry point.
- AI PPT retains its denser wizard information architecture, while typography, tokens, controls, and panel treatment now follow ORBIT.
- The new screens use realistic local mock state and do not call or mutate production APIs.

## Verification

- `pnpm --filter @orbit/web typecheck` — passed.
- Web test suite during the implementation pass — 122 files, 848 tests passed.
- Browser responsive overflow audit — passed for catalog, brief, practice plan, focused practice, challenge Q&A, audience, version history, and AI PPT.

final result: passed
