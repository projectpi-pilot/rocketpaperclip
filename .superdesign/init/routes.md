# Route Map

## Framework and routing
- Framework: React 19
- Bundler: Vite
- Router: React Router via `ui/src/lib/router.tsx`
- Route registration: `ui/src/App.tsx`

## Key board routes
- `/dashboard` → Dashboard
- `/companies` → Companies
- `/agents/*` → Agents and Agent Detail
- `/projects` → Projects
- `/projects/:projectId/overview` → Project detail overview
- `/issues` → Issues
- `/goals` → Goals
- `/chat` → Shared chat
- `/costs` → Costs
- `/activity` → Activity
- `/revenues` → Revenues
- `/analytics` → Analytics
- `/resources` → Resources
- `/company/settings` → Settings

## Onboarding flow
- `/onboarding` does not render a dedicated page shell for the flow.
- The onboarding experience is primarily driven by `ui/src/components/OnboardingWizard.tsx`.
- `OnboardingRoutePage` in `ui/src/App.tsx` opens the wizard and frames activation copy:
  - “Activate your first studio company”
  - “Activate another studio company”
  - “Add another agent”

## Prefix behavior
- Company/project environments are addressed by a prefix in the URL.
- `ui/src/lib/router.tsx` resolves links through the active company prefix.
- Invalid company prefixes fall back to the selected company instead of trapping the user in a broken route.

