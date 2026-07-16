# Phase 7 Document Spacing Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Phase 7 document-page spacing, field alignment, card rhythm, and responsive margins using the existing Balanced spacing tokens.

**Architecture:** Keep the patch CSS-first. Add missing shared layout utilities and document-scoped form/card selectors in `src/app/globals.css`, with source-level regression tests in the existing Balanced spacing test file.

**Tech Stack:** Next.js 16.2.10, React 19.1.1, TypeScript 5.7.2, CSS, Node built-in test runner.

## Global Constraints

- Preserve all Phase 7 data flows, actions, permissions, routes, copy, colors, and typography.
- Use only the existing spacing tokens: `--space-section`, `--space-card`, `--space-related`, and `--space-compact`.
- Keep the patch scoped to layout and spacing.
- Preserve the approved 16px mobile card padding.
- Do not add dependencies.

---

### Task 1: Restore document layout rhythm

**Files:**
- Modify: `src/features/layout/balanced-spacing.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing Balanced spacing tokens and Phase 7 class names.
- Produces: defined `content-stack`, `section-heading`, and `block` utilities plus document form, card, permission, and responsive spacing rules.

- [ ] **Step 1: Add a failing source-level regression test**

Assert that the CSS defines the missing utilities, 18px document form gaps, grid-based document labels, full-width fields, internal document-card spacing, and structured permission controls.

- [ ] **Step 2: Run the targeted test and confirm failure**

```bash
node --no-warnings --test --experimental-strip-types src/features/layout/balanced-spacing.test.ts
```

Expected: failure because the missing utility and scoped document rules do not exist.

- [ ] **Step 3: Add the minimal CSS patch**

Define the missing utilities and scoped document selectors using the existing spacing variables. Add mobile alignment rules without changing component behavior.

- [ ] **Step 4: Run release validation**

```bash
node --no-warnings --test --experimental-strip-types src/features/layout/balanced-spacing.test.ts
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, TypeScript exits 0, and the production build succeeds.
