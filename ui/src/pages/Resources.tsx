import { useEffect } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  Code2,
  Database,
  Lightbulb,
  Radio,
  Sparkles,
  Swords,
  Tv,
} from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Link } from "@/lib/router";
import {
  SUPERDESIGN_APP_URL,
  SUPERDESIGN_DOCS_URL,
  SUPERDESIGN_REPO_URL,
} from "../lib/superdesign";

const resourceCards = [
  {
    title: "Signals",
    description: "Market pain points and real-world demand signals that can drive new builds.",
    stat: "datasets",
    icon: Radio,
    href: "https://github.com/longevusmarcus/msxbot",
    external: true,
  },
  {
    title: "Ideas",
    description: "Startup ideas, product directions, and simulated product concepts from MSX.",
    stat: "opportunities",
    icon: Lightbulb,
    href: "https://github.com/longevusmarcus/msxbot",
    external: true,
  },
  {
    title: "Live Ecosystem",
    description: "See the live MSX command layer for agents, products, and workspace activity.",
    stat: "msx.bot",
    icon: Activity,
    href: "https://msx.bot",
    external: true,
  },
  {
    title: "Streaming",
    description: "Broadcast-style entry point for watching builders ship in real time.",
    stat: "live",
    icon: Tv,
    href: "https://msx.bot",
    external: true,
  },
  {
    title: "Arena",
    description: "The product discovery layer for shipped agent-built apps.",
    stat: "msx.gg",
    icon: Swords,
    href: "https://msx.gg",
    external: true,
  },
  {
    title: "Technical Docs",
    description: "Reference the public UI patterns and control-room structure from mothership-glow.",
    stat: "source",
    icon: BookOpen,
    href: "https://github.com/longevusmarcus/mothership-glow",
    external: true,
  },
  {
    title: "Design System",
    description: "Use the installed Superdesign skill and CLI first, then open the app when you need manual visual exploration or export review.",
    stat: "superdesign",
    icon: Sparkles,
    href: SUPERDESIGN_APP_URL,
    external: true,
  },
];

const serviceCards = [
  {
    label: "api.msx.dev",
    description: "API layer for signals, product actions, and workspace services.",
    icon: Database,
    href: "https://api.msx.dev",
  },
  {
    label: "msx.bot",
    description: "Live terminal surface for agent activity and product movement.",
    icon: Bot,
    href: "https://msx.bot",
  },
  {
    label: "msx.dev",
    description: "Human control room for goals, budgets, agents, and company operations.",
    icon: Code2,
    href: "https://msx.dev",
  },
  {
    label: "app.superdesign.dev",
    description: "Design lane for importing previews, iterating UI direction, and exporting polished HTML.",
    icon: Sparkles,
    href: SUPERDESIGN_APP_URL,
  },
];

export function Resources() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Resources" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompany) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
        Select a company to open the MSX resource hub.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card/70 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              MSX resource layer
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Explore the MSX ecosystem</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {selectedCompany.name} runs inside the MSX startup studio model: signals feed ideas,
              ideas become companies, and agents turn those companies into shipped products.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
            Source language from{" "}
            <a
              href={SUPERDESIGN_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              superdesign-platform
            </a>{" "}
            plus{" "}
            <a
              href="https://github.com/longevusmarcus/mothership-glow"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              mothership-glow
            </a>
            .
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {serviceCards.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.label}
              href={card.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/25 hover:bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/80">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">{card.label}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </a>
          );
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">MSX resources</h2>
            <p className="text-sm text-muted-foreground">
              Reference links, datasets, and ecosystem entry points for discovery, operations, and product design.
            </p>
          </div>
          <Link
            to="/company/settings"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Open MSX settings
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resourceCards.map((card) => {
            const Icon = card.icon;
            return (
              <a
                key={card.title}
                href={card.href}
                target={card.external ? "_blank" : undefined}
                rel={card.external ? "noreferrer" : undefined}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/25 hover:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {card.stat}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <h3 className="font-medium">{card.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                </div>
                <div className="mt-auto pt-5 text-sm text-foreground/80 transition-colors group-hover:text-foreground">
                  Open resource
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
