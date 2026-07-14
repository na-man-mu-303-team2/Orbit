# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Selected Brief UX Direction

- Use the contextual right-side Brief drawer selected in Product Design option 1.
- Show the full Brief only during AI deck creation and PPTX import review.
- After a deck exists, expose Brief as a document-level `발표 기준` action inside the editor rather than a permanent primary mode.
- Brief edits affect future AI suggestions and rehearsal feedback; existing slides remain unchanged until the user explicitly applies a new AI suggestion.
