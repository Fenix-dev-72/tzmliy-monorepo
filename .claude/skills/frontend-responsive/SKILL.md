---
name: frontend-responsive
description: Conventions for responsive layout and scroll behavior in the Tzmliy frontend (mobile / laptop / desktop). Use whenever adding or editing a page, layout, or nav component under frontend/src.
---

# Frontend responsive & scroll conventions

This repo's frontend (`frontend/src`) targets three breakpoints with Tailwind's default scale:
mobile (`<lg`, i.e. below 1024px), laptop, and desktop (`lg:` and up). Follow the patterns already
in use — don't introduce a second responsive system (no custom media queries, no `window.innerWidth`
checks in React state).

## Breakpoint pattern: mobile drawer + desktop sidebar

`DashboardSidebar.tsx` is the reference implementation:

- Desktop/laptop: `<aside className="hidden w-60 shrink-0 border-r lg:block">` with
  `<div className="sticky top-16 py-6">` inside — sticky, not fixed, so it scrolls with the page
  but stays pinned once reached.
- Mobile: a separate `DashboardMobileDrawer` component, toggled by `DashboardHeader`'s hamburger
  button, rendered as `<div className="fixed inset-0 z-50 lg:hidden">`.

Never try to make one element serve both roles with conditional classes alone — render two
components (desktop `aside`, mobile drawer) gated by `lg:block`/`lg:hidden`, matching this file.

## Scroll containment

- Page-level horizontal scroll guard: the landing page root wraps everything in
  `overflow-x-hidden` (`LandingPage.tsx`) to stop wide decorative elements (blurred gradient blobs,
  marquees) from creating horizontal scrollbars on mobile.
- Flex children that hold text/tables and must not force their parent wider than the viewport need
  `min-w-0` — see `DashboardLayout.tsx`'s `<div className="min-w-0 flex-1">` next to the sidebar.
  Omitting `min-w-0` on a flex child is the most common cause of unwanted horizontal scroll on
  narrow screens.
- Internal scrollable panels (a fixed-height list inside a card, not the whole page) use
  `max-h-<n> overflow-y-auto` — see `NotificationsPage.tsx`'s `max-h-40 overflow-y-auto` schedule
  list. Use this for any bounded list/log inside a card; don't let it grow the page instead.
- Sticky headers pair with `top-16` (matches `DashboardHeader`'s height) — reuse that offset for
  any new sticky element under the header rather than guessing a new value.

## Adding a new dashboard page

1. It renders inside `DashboardLayout`'s `<Outlet />`, already inside the `min-w-0 flex-1` wrapper —
   don't re-wrap in another `min-h-screen` or re-add horizontal padding meant for the shell.
2. For any table or wide content, wrap it in its own `overflow-x-auto` container rather than letting
   it push the whole layout — check on a narrow (375px) viewport, not just resizing a desktop
   browser, since touch scrolling behaves differently.
3. Test breakpoints in this order: mobile (375px) → laptop (1024px, the `lg:` cutoff) → desktop
   (1440px+). The `lg:` cutoff is where sidebar/drawer swap, so it's the one most likely to break.
