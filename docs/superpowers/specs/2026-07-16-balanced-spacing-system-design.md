# Balanced Spacing System Design

## Goal

Apply one consistent spacing and layout system across the HRIS without changing business behavior, data flow, permissions, or route structure.

## Approved spacing scale

- Desktop page padding: 28px
- Tablet page padding: 24px
- Mobile page padding: 18px 14px
- Major section gap: 24px
- Card and form internal spacing: 18px
- Related control gap: 12px
- Compact related text gap: 6px to 8px
- Table cell vertical padding: 11px
- Table cell horizontal padding: 12px

## Scope

- Define every layout class referenced by production components.
- Standardize root page flow, forms, cards, metric grids, detail grids, empty states, policy lists, filters, leave administration, attendance, overtime, and responsive lists.
- Fix sidebar overflow and preserve its dark rail across long pages.
- Tighten responsive layouts on tablet and mobile.
- Keep all existing colors, typography hierarchy, component behavior, routes, and data contracts.

## Constraints

- CSS-first implementation; JSX changes only when a class boundary is missing or semantically incorrect.
- No database or Supabase migration changes.
- No visual redesign beyond spacing, density, alignment, and overflow.
- Tables remain readable and horizontally scrollable where required.
- Touch targets remain at least 42px to 44px where already established.

## Verification

- Static test verifies all approved layout classes are defined.
- Static test verifies spacing tokens, responsive page padding, metric/detail grids, form spacing, and sidebar overflow.
- Full automated test suite, TypeScript check, and production build must pass.
