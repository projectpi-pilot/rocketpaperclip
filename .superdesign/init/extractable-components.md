# Extractable Components

## CompanyRail
- Source: `ui/src/components/CompanyRail.tsx`
- Category: layout
- Description: Left rail for switching project environments and activating a new one
- Extractable props: selectedCompanyId, companies
- Hardcoded: compact rail layout, live dot placement, plus-button behavior

## Sidebar
- Source: `ui/src/components/Sidebar.tsx`
- Category: layout
- Description: Main navigation stack for Work, Agents, Projects, and HQ
- Extractable props: selectedCompany, liveRunCount, inboxBadge
- Hardcoded: section ordering, typography scale, monochrome nav style

## OnboardingWizard Step 1 Feed
- Source: `ui/src/components/OnboardingWizard.tsx`
- Category: layout
- Description: Swipeable studio feed with industry chips, source filters, activation packet, and simulated swarm rail
- Extractable props: selectedOpportunity, selectedIndustry, selectedFeedFilter, visibleSwarmUpdates
- Hardcoded: split-screen modal shell, operator copy, `/superdesign` expectation

## CompanyPatternIcon
- Source: `ui/src/components/CompanyPatternIcon.tsx`
- Category: basic
- Description: Visual identity tile for project environments in the rail
- Extractable props: companyName, logoUrl, brandColor
- Hardcoded: dithering and pattern behavior
