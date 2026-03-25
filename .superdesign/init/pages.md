# Page Dependency Trees

## Onboarding activation flow
Entry: `ui/src/components/OnboardingWizard.tsx`

Dependencies:
- `ui/src/components/OnboardingWizard.tsx`
  - `ui/src/components/AsciiArtAnimation.tsx`
  - `ui/src/components/OpenCodeLogoIcon.tsx`
  - `ui/src/components/ui/dialog.tsx`
  - `ui/src/components/ui/popover.tsx`
  - `ui/src/components/ui/button.tsx`
  - `ui/src/context/DialogContext.tsx`
  - `ui/src/context/CompanyContext.tsx`
  - `ui/src/lib/router.tsx`
  - `ui/src/lib/model-utils.ts`
  - `ui/src/lib/onboarding-goal.ts`
  - `ui/src/lib/onboarding-launch.ts`
  - `ui/src/lib/onboarding-route.ts`
  - `ui/src/lib/queryKeys.ts`
  - `ui/src/lib/utils.ts`
  - `ui/src/adapters/index.ts`
  - `ui/src/components/agent-config-defaults.ts`
  - `ui/src/api/companies.ts`
  - `ui/src/api/goals.ts`
  - `ui/src/api/agents.ts`
  - `ui/src/api/issues.ts`
  - `ui/src/api/projects.ts`

## App shell
Entry: `ui/src/components/Layout.tsx`

Dependencies:
- `ui/src/components/Layout.tsx`
  - `ui/src/components/CompanyRail.tsx`
  - `ui/src/components/Sidebar.tsx`
  - `ui/src/components/InstanceSidebar.tsx`
  - `ui/src/components/BreadcrumbBar.tsx`
  - `ui/src/components/PropertiesPanel.tsx`
  - `ui/src/components/CommandPalette.tsx`
  - `ui/src/components/NewIssueDialog.tsx`
  - `ui/src/components/NewProjectDialog.tsx`
  - `ui/src/components/NewGoalDialog.tsx`
  - `ui/src/components/NewAgentDialog.tsx`
  - `ui/src/components/ToastViewport.tsx`
  - `ui/src/components/MobileBottomNav.tsx`
  - `ui/src/components/WorktreeBanner.tsx`
  - `ui/src/components/DevRestartBanner.tsx`
  - `ui/src/context/*`
  - `ui/src/hooks/*`

