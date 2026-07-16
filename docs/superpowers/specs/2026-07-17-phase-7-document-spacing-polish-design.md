# Phase 7 Document Spacing Polish Design

## Goal

Restore the approved Balanced spacing system across the Phase 7 employee and administration document screens without changing data behavior, permissions, copy, or visual identity.

## Observed issues

- `content-stack`, `section-heading`, and `block` are used in Phase 7 markup but have no CSS definitions.
- Document form labels render inline, so labels, fields, and helper text collide.
- Document category, requirement, and permission cards do not establish an internal layout gap.
- Permission controls have no layout definition beyond `min-width: 0`.
- Fields do not consistently fill their available grid column.

## Design

Use a CSS-first patch in `src/app/globals.css` based on the existing spacing tokens:

- `--space-section: 24px` for major page and column separation.
- `--space-card: 18px` for card and form groups.
- `--space-related: 12px` for closely related controls.
- `--space-compact: 8px` for labels, metadata, and compact rows.

Add the missing shared utilities, scope form label and field rules to document components, make category/requirement/permission cards explicit grids, and provide responsive behavior below 760px. Existing Phase 1–7 functionality remains unchanged.

## Validation

Extend `src/features/layout/balanced-spacing.test.ts` with source-level assertions for the new utilities and scoped Phase 7 form/card rules. Run the targeted test, the full test suite, TypeScript validation, and the production build.
