# MSX

Startup studio for agents.

MSX is a local-first control room for launching and running agent-built companies. It gives you a studio feed for opportunities, agent pods for activation, shared chat orchestration, project environments, live previews, budgets, resources, and operator visibility from one board.

## What MSX does

- Surfaces signals, ideas, and validated product outcomes in a studio-style onboarding flow
- Lets operators activate a company with starter pods, budgets, and outcome targets
- Orchestrates local and gateway-connected agents across projects, tasks, and operating lanes
- Keeps design quality in the loop with Superdesign as the default product-design path
- Shows live project state: previews, tasks, active agents, inbox, activity, costs, revenues, analytics, and resources
- Supports company portability, exports, and OpenClaw fleet imports

## Product model

MSX treats a company as a long-running operating environment.

- A company can contain multiple projects
- One project may be the core product build
- Other projects can cover launch, virality, revenue, support, or operations
- Agents keep working beyond the first MVP until the company is organized, launched, and moving toward revenue

## Core surfaces

- `Dashboard`: live operator overview with activity, costs, and revenues
- `Shared Chat`: one room to direct agents and orchestrate multi-agent work with `@tags`
- `Projects`: local environments where agents build and preview products
- `HQ`: settings, resources, analytics, and operating controls
- `Resources`: signals, ideas, live ecosystem, streaming, arena, docs, and design system

## Quickstart

Requirements:

- Node.js 20+
- pnpm 9+

Install and run:

```bash
git clone <your-msx-repo-url>
cd <your-msx-repo-folder>
pnpm install
pnpm msx onboard --yes
pnpm dev
```

This starts the MSX board at `http://localhost:3100`.

## Useful commands

```bash
pnpm dev
pnpm dev:server
pnpm dev:ui
pnpm build
pnpm typecheck
pnpm test:run
pnpm msx onboard --yes
pnpm msx auth bootstrap-ceo
pnpm msx company import <github-url-or-folder>
pnpm msx company export <company-id>
pnpm sync:openclaw-fleet
```

## Design workflow

Digital products in MSX should not stop at a raw prototype.

- Ship the thinnest working MVP fast
- Start the local preview immediately
- Use Superdesign by default to push the shipped UI into a polished product surface
- Keep launch, growth, and revenue work moving after the first ship

## Local development

```bash
pnpm dev              # API + UI in watch mode
pnpm dev:once         # full dev without file watching
pnpm dev:server       # server only
pnpm dev:ui           # UI only
pnpm build            # build all packages
pnpm typecheck        # type checking
pnpm test:run         # run tests
pnpm db:generate      # generate DB migration
pnpm db:migrate       # apply migrations
```

See [doc/DEVELOPING.md](./doc/DEVELOPING.md) for the deeper engineering guide.

## Notes

- Some upstream package namespaces remain as internal implementation details for now.
- The product, UI, and docs branding in this fork is MSX.

## License

[MIT](./LICENSE)
