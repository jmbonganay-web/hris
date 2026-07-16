# Balanced Spacing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Balanced spacing system across the full HRIS and remove undefined layout-class behavior.

**Architecture:** Centralize spacing tokens and shared layout primitives in `src/app/globals.css`, then add focused regression tests that read production CSS and component class usage. Keep page and component markup stable unless a CSS boundary cannot express the required layout.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS, Node test runner.

## Global Constraints

- Desktop page padding is 28px.
- Tablet page padding is 24px.
- Mobile page padding is 18px 14px.
- Major section gap is 24px.
- Card and form internal spacing is 18px.
- Related control gap is 12px.
- Table cell padding is 11px 12px.
- No business logic, route, permission, database, or Supabase changes.

---

### Task 1: Add failing layout regression tests

**Files:**
- Create: `src/features/layout/balanced-spacing.test.ts`

- [ ] Assert approved spacing tokens and responsive values.
- [ ] Assert all referenced system layout classes have CSS definitions.
- [ ] Assert metric grids, detail grids, forms, empty states, and sidebar overflow use the approved layout behavior.
- [ ] Run the focused test and confirm it fails before CSS changes.

### Task 2: Implement shared balanced spacing primitives

**Files:**
- Modify: `src/app/globals.css`

- [ ] Add spacing tokens.
- [ ] Normalize content flow, cards, forms, tables, headings, and responsive padding.
- [ ] Define every missing production layout class.
- [ ] Add responsive behavior for grids, filters, forms, policy cards, and quick links.
- [ ] Fix sidebar scrolling and long-page dark-rail coverage.
- [ ] Run focused tests until green.

### Task 3: Full-system verification and packaging

**Files:**
- Modify only if verification finds a spacing regression.

- [ ] Scan static class usage for undefined layout classes.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Remove generated artifacts and create a clean full repository ZIP.
