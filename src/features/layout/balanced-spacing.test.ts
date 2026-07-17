import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

const requiredClasses = [
  "attendance-policy-form",
  "attendance-responsive-list",
  "attendance-schedule-summary",
  "attendance-status-stack",
  "card-header-row",
  "conflict-resolution-form",
  "correction-request-form",
  "danger-zone-form",
  "detail-grid",
  "empty-state",
  "field-label",
  "filter-tabs",
  "form-card",
  "holiday-card",
  "info-callout",
  "leave-admin-filters",
  "leave-admin-form-grid",
  "leave-admin-quick-links",
  "leave-policy-checkboxes",
  "leave-policy-version-list",
  "leave-review-panel",
  "leave-type-form",
  "leave-year-opening-grid",
  "metrics-grid",
  "policy-card",
  "private-reason",
  "section-title",
  "stack-list",
] as const;

test("balanced spacing tokens encode the approved desktop scale", () => {
  assert.match(css, /--space-page:\s*28px/);
  assert.match(css, /--space-section:\s*24px/);
  assert.match(css, /--space-card:\s*18px/);
  assert.match(css, /--space-related:\s*12px/);
  assert.match(css, /--table-cell-y:\s*11px/);
});

test("every production layout class has a global CSS definition", () => {
  for (const className of requiredClasses) {
    assert.match(css, new RegExp(`\\.${className}(?:[\\s.{:#,>]|$)`), className);
  }
});

test("shared layouts use balanced grids and form spacing", () => {
  assert.match(css, /\.content\s*\{[\s\S]*?gap:\s*var\(--space-section\)/);
  assert.match(css, /\.form-card\s*\{[\s\S]*?display:\s*grid[\s\S]*?gap:\s*var\(--space-card\)/);
  assert.match(css, /\.metrics-grid\s*\{[\s\S]*?display:\s*grid[\s\S]*?gap:/);
  assert.match(css, /\.detail-grid\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.leave-admin-quick-links\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:/);
});

test("tables and responsive page padding stay compact and readable", () => {
  assert.match(css, /th,\s*td\s*\{[\s\S]*?padding:\s*var\(--table-cell-y\)\s+var\(--table-cell-x\)/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.content\s*\{[\s\S]*?padding:\s*24px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.content\s*\{[\s\S]*?padding:\s*18px\s+14px/);
});

test("sidebar handles long navigation without exposing a short dark rail", () => {
  assert.match(css, /\.app-shell\s*\{[\s\S]*?background:\s*linear-gradient/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?overscroll-behavior:\s*contain/);
});

test("document layouts use the shared balanced spacing system", () => {
  for (const className of [
    "document-portal-grid", "document-summary-grid", "document-filter-grid",
    "document-upload-form", "document-requirement-grid", "document-admin-quick-links",
    "document-detail-grid", "document-version-list", "document-review-layout",
    "document-field-builder", "manager-document-compliance-grid",
  ]) assert.match(css, new RegExp(`\\.${className}\\s*\\{`));
  assert.match(css, /document-portal-grid[\s\S]*gap:\s*var\(--space-section\)/);
});

test("document pages restore missing stack, form, card, and permission spacing", () => {
  assert.match(css, /\.content-stack\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*var\(--space-card\)/);
  assert.match(css, /\.section-heading\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*var\(--space-card\)/);
  assert.match(css, /\.block\s*\{[\s\S]*?display:\s*block/);
  assert.match(css, /\.document-upload-form[\s\S]*?label:not\(\.checkbox-row\)[\s\S]*?\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*var\(--space-compact\)/);
  assert.match(css, /\.document-category-form[\s\S]*?\.field[\s\S]*?\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.document-requirement-grid\s*>\s*\.card[\s\S]*?\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*var\(--space-card\)/);
  assert.match(css, /\.permission-control\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:/);
});

test("dashboard analytics use the shared balanced spacing system", () => {
  for (const className of [
    "dashboard-period-filter",
    "dashboard-custom-range",
    "dashboard-metric-grid",
    "dashboard-metric-card",
    "dashboard-analytics-grid",
    "dashboard-chart-card",
    "dashboard-chart-legend",
    "dashboard-breakdown-list",
    "dashboard-action-list",
    "dashboard-balance-grid",
  ]) assert.match(css, new RegExp(`\\.${className}\\s*\\{`));
  assert.match(css, /dashboard-analytics-grid[\s\S]*gap:\s*var\(--space-section\)/);
  assert.match(css, /dashboard-period-filter[\s\S]*gap:\s*var\(--space-related\)/);
});
