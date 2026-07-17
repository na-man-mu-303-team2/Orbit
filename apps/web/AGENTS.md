# Orbit Web UI Rules

These rules govern the ongoing UI redesign only, built around the
**Redesign System** described in `apps/web/DESIGN.md`. They describe a new
set of files to build under the paths below and do not apply to the existing
`apps/web/src/design-system/` folder (`orbit-design-system.css`, `tokens.ts`,
`components.tsx`, etc.), which is a separate, currently-shipping design
system and must not be modified as part of this work.

## UI architecture

- `apps/web/src/components/ui` is the shared primitive folder for the Redesign System.
- Keep each primitive in its own component and style files, and expose its public API through `apps/web/src/components/ui/index.ts`.
- Product-level reusable patterns belong in `apps/web/src/components/patterns`.
- Feature-specific components belong in their own `apps/web/src/features/<feature-name>` folder (e.g. `features/rehearsal`, `features/editor`), matching the existing feature layout.
- `components/ui` must never import from `features`.

## Styling

- Use CSS variables from `apps/web/src/styles/tokens.css`.
- Do not add literal hex colors outside `tokens.css`.
- Do not add arbitrary spacing values when an existing spacing token fits.
- Do not add inline styles except for dynamically calculated coordinates.
- New reusable components must support `className`.

## TypeScript

- Do not use `any`.
- Do not use `as unknown as`.
- Prefer explicit props over complex generics.
- Extend native element props with `ComponentPropsWithoutRef`.
- Keep API and domain types inside their feature.

## Refactoring

- UI refactoring must not change API calls, Zustand state, routing, or report schema.
- Do not mix visual redesign and business-logic changes in the same task.
- Keep each change buildable.
- Run the existing lint, typecheck, and build scripts before finishing.

## Accessibility

- Interactive elements must be buttons or links.
- Preserve keyboard focus styles.
- Icon-only buttons require `aria-label`.
- Do not communicate status using color alone.
