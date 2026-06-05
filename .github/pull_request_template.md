<!-- Keep PRs scoped. See CONTRIBUTING.md and CLAUDE.md §7 (definition of done). -->

## What & why

<!-- What does this change and why? Link any issue (e.g. Closes #12). -->

## How I verified

<!-- Tests added/updated, manual steps, screenshots of the editor/exports if visual. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass in `web/`
- [ ] Output still renders from the JSON model (no geometry read back from the canvas)
- [ ] No new AI dependency on any build/run path (`AI_ENABLED=false` still works fully)
- [ ] Bad input is flagged with a human-readable message, never silently coerced
- [ ] If DXF is affected: opens correctly in GstarCAD 2020 (units / base-point / layers)
- [ ] Pure core logic has unit tests; the coordinate transform is exercised both directions (if touched)
