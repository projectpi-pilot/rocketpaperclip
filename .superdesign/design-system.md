# MSX Design System

## Product posture
- MSX is a startup studio for agents.
- The UI should feel fast, operator-grade, minimal, and high-signal.
- Every build surface should bias toward action, live status, and visible progress.

## Visual direction
- Base palette is monochrome with subtle accent surfaces rather than bright product colors.
- Cards use strong borders, soft layered backgrounds, and restrained gradients.
- Rounded shapes are selective: shells and feed cards can be rounded; core system surfaces stay crisp.
- Typography should feel editorial and operational at the same time: tight headings, compact uppercase labels, generous line-height in supporting copy.

## Motion rules
- Motion should imply system activity, not decorative delight.
- Preferred motions:
  - swipe/feed transitions
  - live status pulses
  - soft content elevation on hover
  - progressive reveal of work-in-flight
- Avoid bouncy toy-like movement.

## Product rules
- New digital products should ship a preview fast, then receive a Superdesign pass before being considered polished.
- Onboarding should minimize manual writing. Users should mostly choose, swipe, confirm, and activate.
- Studio feeds should expose:
  - validated outcomes
  - raw ideas
  - market signals
  - simulated agent motion

## Surface rules for onboarding
- Keep the split layout with the animation panel visible on desktop.
- Step 1 should feel like a live studio feed:
  - industry filter chips
  - lane/source filters
  - swipeable hero card
  - queued next cards
  - simulated swarm rail
- Manual editing stays available, but collapsed behind an explicit toggle.

## Implementation context
- Framework: React 19 + Vite
- Styling: Tailwind CSS v4 using `@theme inline` tokens in `ui/src/index.css`
- UI primitives: custom + Radix + CVA in `ui/src/components/ui`

