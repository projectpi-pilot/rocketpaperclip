# MSX

MSX is an agent-native startup studio and control plane.

For developers and local operators, this repository gives you the local board, local project workspaces, local previews, and local/gateway agent execution. It does not grant access to the full MSX studio subscription layer.

## What This Repo Is

This codebase is the local MSX application:

- a board UI for running companies and projects locally
- a control plane for agent tasks, approvals, budgets, and previews
- a local-first runtime for OpenClaw and other supported agent adapters
- a developer environment for building the MSX product itself

It is useful for:

- contributors building MSX
- operators running local experiments
- humans directing local agent work in a private environment
- teams connecting their own local OpenClaw fleet to the board

## What This Repo Is Not

Running this repo locally does not include the licensed MSX studio network.

The subscription layer covers things like:

- proprietary signals and market intelligence feeds
- curated idea pipelines and simulated product opportunities
- MSX-managed products and studio company inventory
- MSX-managed agentic teams and studio orchestration
- studio resources, growth surfaces, and distribution support
- financial incentive systems, acceleration paths, and studio-level monetization rails

In other words:

- local repo: run your own board and your own agents
- subscription MSX: access the full studio ecosystem

## Local Usage Model

Local users should bring their own agents.

Today that usually means:

- install and configure your own OpenClaw agents locally
- connect that fleet to your local MSX board
- run companies, tasks, previews, and workspaces from your own machine

The local product is for operating with your own fleet, not for automatically unlocking the full MSX studio catalog.

## Developer And Human Guide

### For developers

Use this repo if you are building or modifying MSX itself.

Typical workflow:

1. clone the repo
2. install dependencies
3. onboard a local instance
4. run the app locally
5. connect your local agent runtime

```bash
git clone <your-msx-repo-url>
cd <your-msx-repo-folder>
pnpm install
pnpm msx onboard --yes
pnpm dev
```

This starts the local board at [http://localhost:3100](http://localhost:3100).

### For human operators

Use the local app to direct work, review outcomes, and run private agent operations.

What you can do locally:

- create or import companies
- run projects and issues
- connect local or gateway agents
- inspect activity, budgets, approvals, and previews
- operate your own workspaces and your own execution lanes

What you should not assume from local-only access:

- automatic access to MSX signals
- automatic access to MSX ideas and product inventory
- automatic access to MSX-managed growth and launch infrastructure
- automatic access to MSX-managed agentic teams or studio orchestration

## OpenClaw Fleet

The repo does not ship the actual agent fleet.

MSX mirrors whatever OpenClaw fleet exists on the machine or in the environment you connect to. If you want agents locally, you need to provide them locally.

Once OpenClaw and your local fleet are present, use the relevant setup and sync flow from this repo.

See:

- [doc/FLEET_SETUP.md](/Users/borg/Documents/New%20project/msxstudionew/doc/FLEET_SETUP.md)
- [doc/DEVELOPING.md](/Users/borg/Documents/New%20project/msxstudionew/doc/DEVELOPING.md)

## Core Product Model

MSX treats a company as a long-running operating environment.

- a company can contain multiple projects
- one project may be the core product build
- other projects can cover launch, virality, revenue, support, or operations
- agents can continue working after the first MVP instead of stopping at prototype stage

## Core Surfaces

- `Dashboard`: live operator overview with activity, costs, and revenues
- `Shared Chat`: one room to direct agents and orchestrate work with `@tags`
- `Projects`: local environments where agents build and preview products
- `HQ`: settings, resources, analytics, and operating controls
- `Resources`: local references and connected ecosystem links

## Commands

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

If you have a local OpenClaw fleet bootstrap flow in your environment, use that too.

## Verification

For engineering handoff, the expected verification commands in this repo are:

```bash
pnpm typecheck
pnpm test:run
pnpm build
```

## Design Expectation

MSX should not stop at a raw prototype.

- ship the thinnest working MVP fast
- start the preview immediately
- keep launch, growth, and revenue lanes active after the first build
- use strong product and design judgment instead of placeholder UX

## License And Access Boundary

The repository code is one thing.
The MSX studio subscription and operating network are another.

Owning or running this repo locally does not by itself license:

- the studio signal layer
- the studio idea layer
- the studio product catalog
- studio-managed agentic teams
- studio distribution and growth systems
- studio financial rewards or incentive rails

Those are commercial or subscription access concerns, not repository contents.

## More Docs

- [AGENTS.md](/Users/borg/Documents/New%20project/msxstudionew/AGENTS.md)
- [doc/DEVELOPING.md](/Users/borg/Documents/New%20project/msxstudionew/doc/DEVELOPING.md)
- [doc/SPEC-implementation.md](/Users/borg/Documents/New%20project/msxstudionew/doc/SPEC-implementation.md)

## License

[MIT](/Users/borg/Documents/New%20project/msxstudionew/LICENSE)
