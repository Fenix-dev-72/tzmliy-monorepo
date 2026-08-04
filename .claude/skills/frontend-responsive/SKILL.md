---
name: frontend-responsive
description: Conventions for responsive layout and scroll behavior in the Tzmliy frontend (mobile / laptop / desktop). Use whenever adding or editing a page, layout, or nav component under frontend/src.
---

# Frontend responsive & scroll conventions

This repo's frontend (`frontend/src`) targets three breakpoints with Tailwind's default scale:
mobile (`<lg`, i.e. below 1024px), laptop, and desktop (`lg:` and up). Follow the patterns already
in use — don't introduce a second responsive system (no custom media queries, no `window.innerWidth`
checks in React state).

## Breakpoint pattern: desktop hover-rail sidebar + mobile/tablet bottom nav (2026-07-27 redesign)

The nav *structure itself* still forks at `lg` (1024px) — this matches the source design mockup's
own `isDesktop`/`isMobile` split exactly (`isMobile = width < 1024`), so don't collapse it into one
shape for every breakpoint. Three components share one source of truth,
`DashboardSidebar.tsx`'s `useNavItems()` (a permission-filtered, ordered list) — never hand-roll a
second copy of the nav list:

- **Desktop (`lg:` and up)**: `DashboardSidebar` — a `fixed` hover-expand icon rail, collapsed at
  68px (icons only, centered), expanding to 236px (labels fade in, left-aligned) on
  `onMouseEnter`/`onMouseLeave`. Renders the **full** `useNavItems()` list, no overflow menu needed
  — `DashboardLayout.tsx` reserves a matching `lg:w-[68px]` static spacer before it so page content
  doesn't jump when the rail expands over it on hover.
- **Mobile/tablet (below `lg`)**: `DashboardBottomNav` — a `fixed inset-x-0 bottom-0 lg:hidden` bar
  with the first 4 items (`useNavItems().slice(0, 4)`: Bosh sahifa/Savdolar/Mijozlar/Moliya) plus a
  "Boshqa" tab that opens `DashboardMoreSheet` (`useNavItems().slice(4)` in a grid bottom-sheet).
- `DashboardHeader.tsx` no longer takes an `onMenuClick` prop — neither surface above is
  header-triggered any more (no hamburger, no drawer).

If a new dashboard-shell nav surface is needed, extend `useNavItems()` rather than adding a fourth
place the item list is duplicated. Breakpoint-gating elsewhere (e.g. a stat-card grid going from 1
to 4 columns) is unrelated and still fine — this section is specifically about primary navigation.

## Scroll containment

- Page-level horizontal scroll guard: the landing page root wraps everything in
  `overflow-x-hidden` (`LandingPage.tsx`) to stop wide decorative elements (blurred gradient blobs,
  marquees) from creating horizontal scrollbars on mobile.
- Flex children that hold text/tables and must not force their parent wider than the viewport need
  `min-w-0` — see `DashboardLayout.tsx`'s `<div className="min-w-0 flex-1 pb-24 lg:pb-10">` next to
  `<DashboardSidebar />` in the flex row. Omitting `min-w-0` on a flex child is the most common
  cause of unwanted horizontal scroll on narrow screens.
- Internal scrollable panels (a fixed-height list inside a card, not the whole page) use
  `max-h-<n> overflow-y-auto` — see `NotificationsPage.tsx`'s `max-h-40 overflow-y-auto` schedule
  list, or `DashboardMoreSheet.tsx`'s `max-h-[75vh] overflow-y-auto` on the sheet itself. Use this
  for any bounded list/log/sheet; don't let it grow the page instead.
- Sticky headers pair with `top-16` (matches `DashboardHeader`'s height) — reuse that offset for
  any new sticky element under the header rather than guessing a new value.
- `DashboardBottomNav` is `fixed`, not part of layout flow, so page content needs bottom clearance
  *below `lg` only* — `DashboardLayout.tsx`'s `pb-24 lg:pb-10` on the outlet wrapper covers this
  (desktop's hover-rail sidebar doesn't eat vertical space, so it only needs a small `lg:pb-10`,
  not the mobile bottom-nav clearance). Don't add a competing bottom-padding hack inside a page.

## Adding a new dashboard page

1. It renders inside `DashboardLayout`'s `<Outlet />`, already inside the `min-w-0 flex-1` wrapper
   with bottom clearance for the fixed mobile nav — don't re-wrap in another `min-h-screen` or
   re-add padding meant for the shell.
2. For any table or wide content, wrap it in its own `overflow-x-auto` container rather than letting
   it push the whole layout — check on a narrow (375px) viewport, not just resizing a desktop
   browser, since touch scrolling behaves differently.
3. Test breakpoints in this order: mobile (375px) → laptop (1024px, the `lg:` cutoff) → desktop
   (1440px+). The `lg:` cutoff is where the nav structure itself swaps (bottom bar+sheet →
   hover-rail sidebar), so it's the one most likely to break — verify both the nav swap and any
   page-level grid reflow at that width.
