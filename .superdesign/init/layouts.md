# Shared Layout Components

## `ui/src/components/Layout.tsx`
- Primary app shell.
- Composes `CompanyRail`, `Sidebar`, breadcrumbs, properties panel, dialogs, and the mobile navigation behavior.
- Owns route/company synchronization and the onboarding auto-open when no companies exist.

## `ui/src/components/Sidebar.tsx`
- Main left navigation for the selected project environment.
- Sections:
  - core board links
  - Work
  - Agents
  - Projects
  - HQ
- Visual style is compact, operator-focused, and monochrome.

## `ui/src/components/CompanyRail.tsx`
- Narrow left rail for switching project environments.
- Shows selection state, drag-reorder, live-agent dot, unread inbox dot.
- The plus action should feel like “activate a new studio company,” not generic CRUD.

## `ui/src/components/OnboardingWizard.tsx`
- Modal onboarding flow with a fixed split-screen layout.
- Desktop pattern:
  - left half: activation form
  - right half: ASCII studio animation
- Current design intent:
  - Step 1 is the swipeable studio feed
  - Later steps stay more form-like and operational

