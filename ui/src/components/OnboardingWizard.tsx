import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import {
  extractModelName,
  extractProviderIdWithFallback
} from "../lib/model-utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import { parseOnboardingGoalInput } from "../lib/onboarding-goal";
import {
  buildOnboardingIssuePayload,
  buildOnboardingProjectPayload,
  selectDefaultCompanyGoalId
} from "../lib/onboarding-launch";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { resolveRouteOnboardingOptions } from "../lib/onboarding-route";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import {
  Building2,
  Bot,
  Code,
  Gem,
  ListTodo,
  Rocket,
  Activity,
  ArrowLeft,
  ArrowRight,
  Terminal,
  Sparkles,
  MousePointer2,
  Check,
  Loader2,
  ChevronDown,
  TrendingUp,
  X
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;
type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "http"
  | "openclaw_gateway";

type StudioOpportunitySource =
  | "market_signal"
  | "raw_idea"
  | "validated_outcome";
type StudioBuildMode =
  | "market_driven"
  | "product_driven"
  | "api_driven";
type StudioFeedFilter = StudioBuildMode | "all";
type StudioIndustry =
  | "all"
  | "care"
  | "creator"
  | "local_smb"
  | "commerce"
  | "ops"
  | "fintech";

type StudioOpportunityMetric = {
  label: string;
  value: string;
};

type StudioOpportunityInsight = {
  label: string;
  value: string;
};

type StudioSwarmUpdate = {
  agent: string;
  action: string;
  eta: string;
  status: "live" | "queued" | "ready";
};

type StudioOpportunity = {
  id: string;
  source: StudioOpportunitySource;
  buildMode: StudioBuildMode;
  industry: Exclude<StudioIndustry, "all">;
  title: string;
  tagline: string;
  summary: string;
  signal: string;
  companyName: string;
  goal: string;
  budgetUsd: string;
  initialTaskTitle: string;
  recommendedTemplateId: string;
  proofPoints: string[];
  metrics: StudioOpportunityMetric[];
  sourceInsights: StudioOpportunityInsight[];
  swarmUpdates: StudioSwarmUpdate[];
};

type StarterTeamTemplate = {
  id: string;
  title: string;
  summary: string;
  defaultAgentName: string;
  founderBrief: string;
};

type StudioAccordionSection = "queue" | "brief" | "simulation";

const STUDIO_OPPORTUNITIES: StudioOpportunity[] = [
  {
    id: "elder-memory-mobile",
    source: "validated_outcome",
    buildMode: "product_driven",
    industry: "care",
    title: "Elder Memory Mobile",
    tagline: "Calm memory support for elders and caregivers.",
    summary:
      "A dementia-friendly memory support app for older adults and caregivers.",
    signal: "Caregiving demand, aging population, family coordination pain",
    companyName: "Elder Memory Mobile",
    goal:
      "Ship a calm, highly accessible elder memory app, launch it cleanly, and get to first revenue fast.",
    budgetUsd: "750",
    initialTaskTitle:
      "Activate Elder Memory Mobile and ship the first public MVP",
    recommendedTemplateId: "product-design-pod",
    proofPoints: [
      "Accessibility and trust are core product moats.",
      "Caregiver coordination is urgent and repeatable.",
      "A narrow first workflow can monetize fast."
    ],
    metrics: [
      { label: "Industry", value: "Care + health" },
      { label: "First revenue", value: "Caregiver subscription" },
      { label: "Launch path", value: "Mobile preview" }
    ],
    sourceInsights: [
      { label: "Preliminary MVP", value: "Shared memory stream, reminder rituals, caregiver mode" },
      { label: "Simulated 12-mo revenue", value: "$180k ARR on 1.2k paying caregiver households" },
      { label: "Market size", value: "$1.4B global caregiver support software wedge" },
    ],
    swarmUpdates: [
      {
        agent: "trend-scanner",
        action: "matching caregiver pain clusters with aging-demand proofs",
        eta: "live now",
        status: "live"
      },
      {
        agent: "ux-architect",
        action: "compressing reminders into a low-friction daily home surface",
        eta: "2 min",
        status: "queued"
      },
      {
        agent: "mobile-app-builder",
        action: "prepping the first Expo-ready memory support slice",
        eta: "4 min",
        status: "queued"
      },
      {
        agent: "growth-operator",
        action: "drafting the caregiver positioning and first pricing angle",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "trend-to-product-engine",
    source: "market_signal",
    buildMode: "market_driven",
    industry: "creator",
    title: "Trend-to-Product Engine",
    tagline: "Ship products directly from trend velocity.",
    summary:
      "Turn TikTok, creator, and market trend signals into fast-shipped micro SaaS products.",
    signal: "Short-form content velocity, trend arbitrage, creator demand",
    companyName: "Trend Product Engine",
    goal:
      "Continuously turn live signals into polished product experiments with clear launch and monetization loops.",
    budgetUsd: "1200",
    initialTaskTitle: "Launch the first signal-driven product experiment",
    recommendedTemplateId: "growth-revenue-pod",
    proofPoints: [
      "Trend timing is a distribution advantage.",
      "Short product cycles create reusable launch systems.",
      "Virality and monetization need to start together."
    ],
    metrics: [
      { label: "Industry", value: "Creator + media" },
      { label: "First revenue", value: "Paid launch templates" },
      { label: "Launch path", value: "Web dashboard" }
    ],
    sourceInsights: [
      { label: "TikTok velocity", value: "3 rising creator workflows with >22% week-over-week content lift" },
      { label: "Reddit pull", value: "Founders asking for repeatable trend-to-product workflows in 18 active threads" },
      { label: "Signal score", value: "High urgency, medium defensibility, strong distribution potential" },
    ],
    swarmUpdates: [
      {
        agent: "signal-hunter",
        action: "ranking creator trends by monetizable demand",
        eta: "live now",
        status: "live"
      },
      {
        agent: "rapid-prototyper",
        action: "assembling the first trend-ingestion console",
        eta: "3 min",
        status: "queued"
      },
      {
        agent: "social-media-strategist",
        action: "drafting distribution hooks around trend proof",
        eta: "5 min",
        status: "queued"
      },
      {
        agent: "pricing-operator",
        action: "lining up the first template bundle offer",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "local-lead-studio",
    source: "raw_idea",
    buildMode: "product_driven",
    industry: "local_smb",
    title: "Local Lead Studio",
    tagline: "Fix missed inbound leads for neglected local SMBs.",
    summary:
      "An agentic lead-gen and follow-up system for local businesses with weak digital ops.",
    signal: "Local SMB follow-up gaps, missed inbound leads, low automation adoption",
    companyName: "Local Lead Studio",
    goal:
      "Build a profitable local-business lead engine with strong positioning, conversion paths, and repeatable outbound growth.",
    budgetUsd: "950",
    initialTaskTitle: "Activate the first local lead generation MVP",
    recommendedTemplateId: "lean-launch-pod",
    proofPoints: [
      "Lead leakage is easy to explain and easy to value.",
      "A single vertical can validate the full system quickly.",
      "Revenue can start with operator-assisted setups."
    ],
    metrics: [
      { label: "Industry", value: "Local SMB" },
      { label: "First revenue", value: "Done-for-you pilot" },
      { label: "Launch path", value: "Operator dashboard" }
    ],
    sourceInsights: [
      { label: "Problem", value: "Local SMBs lose inbound demand because leads sit untouched for hours or days" },
      { label: "Customer", value: "Owner-operators in service businesses with weak follow-up systems" },
      { label: "Offer shape", value: "Lead capture, instant reply, triage dashboard, and pilot onboarding service" },
    ],
    swarmUpdates: [
      {
        agent: "market-mapper",
        action: "clustering the easiest local verticals to attack first",
        eta: "live now",
        status: "live"
      },
      {
        agent: "backend-builder",
        action: "wiring lead capture and response routing for the first niche",
        eta: "4 min",
        status: "queued"
      },
      {
        agent: "sales-operator",
        action: "preparing the outreach script for first pilots",
        eta: "6 min",
        status: "queued"
      },
      {
        agent: "revops-agent",
        action: "shaping onboarding plus monthly retainer packaging",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "storefront-concierge",
    source: "validated_outcome",
    buildMode: "product_driven",
    industry: "commerce",
    title: "Storefront Concierge",
    tagline: "Turn abandoned browse traffic into guided checkout.",
    summary:
      "A high-conversion product advisor for small commerce brands with weak merchandising and no onsite guidance.",
    signal: "Merch fatigue, low conversion, demand for guided shopping",
    companyName: "Storefront Concierge",
    goal:
      "Ship a high-conversion guided shopping assistant, prove uplift with live previews, and monetize through merchant subscriptions.",
    budgetUsd: "1100",
    initialTaskTitle: "Activate Storefront Concierge and ship the first shopper guidance MVP",
    recommendedTemplateId: "product-design-pod",
    proofPoints: [
      "Merchants can feel conversion pain immediately.",
      "Strong UX and product taste matter at the point of sale.",
      "A clear AOV or conversion uplift makes pricing simple."
    ],
    metrics: [
      { label: "Industry", value: "Commerce" },
      { label: "First revenue", value: "Merchant SaaS" },
      { label: "Launch path", value: "Embedded storefront widget" }
    ],
    sourceInsights: [
      { label: "Preliminary MVP", value: "Guided product quiz, recommendation drawer, merchant analytics panel" },
      { label: "Simulated 12-mo revenue", value: "$240k ARR from 85 stores on conversion-linked pricing" },
      { label: "Market size", value: "$900M SMB merchandising and conversion tooling wedge" },
    ],
    swarmUpdates: [
      {
        agent: "commerce-scout",
        action: "ranking categories where guided shopping wins fastest",
        eta: "live now",
        status: "live"
      },
      {
        agent: "ui-designer",
        action: "tightening the assistive product card system for mobile",
        eta: "2 min",
        status: "queued"
      },
      {
        agent: "frontend-developer",
        action: "building a lightweight storefront preview shell",
        eta: "5 min",
        status: "queued"
      },
      {
        agent: "growth-hacker",
        action: "writing the uplift-first merchant landing angle",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "compliance-hotline-copilot",
    source: "market_signal",
    buildMode: "market_driven",
    industry: "ops",
    title: "Compliance Hotline Copilot",
    tagline: "Resolve repetitive compliance ops before they become tickets.",
    summary:
      "A guided compliance assistant for teams overwhelmed by policy questions, vendor forms, and repeat internal tickets.",
    signal: "Security reviews, compliance fatigue, repeat ops interruptions",
    companyName: "Compliance Hotline Copilot",
    goal:
      "Launch a narrow compliance copilot that clears repetitive requests, prove internal time savings, and convert it into a recurring B2B ops product.",
    budgetUsd: "1400",
    initialTaskTitle: "Launch the first compliance copilot workflow",
    recommendedTemplateId: "lean-launch-pod",
    proofPoints: [
      "Ops pain is measurable in hours and interruptions.",
      "The first wedge can be a single recurring workflow.",
      "Enterprise-facing UX still needs clarity and trust."
    ],
    metrics: [
      { label: "Industry", value: "Ops + compliance" },
      { label: "First revenue", value: "Internal team pilot" },
      { label: "Launch path", value: "Web command center" }
    ],
    sourceInsights: [
      { label: "Reddit pull", value: "Security and compliance operators repeatedly cite repetitive request fatigue" },
      { label: "Buyer pain signal", value: "Vendor-review backlog and policy Q&A volume keep climbing" },
      { label: "Signal score", value: "High pain, medium urgency, strong B2B pilot fit" },
    ],
    swarmUpdates: [
      {
        agent: "ops-researcher",
        action: "mapping the first high-frequency compliance request cluster",
        eta: "live now",
        status: "live"
      },
      {
        agent: "agents-orchestrator",
        action: "splitting the workflow into triage, evidence, and response lanes",
        eta: "2 min",
        status: "queued"
      },
      {
        agent: "senior-developer",
        action: "building the first request triage workspace",
        eta: "5 min",
        status: "queued"
      },
      {
        agent: "analytics-operator",
        action: "instrumenting time-saved reporting for the first buyers",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "invoice-cashflow-companion",
    source: "raw_idea",
    buildMode: "product_driven",
    industry: "fintech",
    title: "Invoice Cashflow Companion",
    tagline: "Give small teams a calmer weekly cashflow control room.",
    summary:
      "A lightweight operating console for invoices, expected cash, and short-horizon runway decisions for tiny teams.",
    signal: "Founder cash anxiety, late invoices, no lightweight finance view",
    companyName: "Invoice Cashflow Companion",
    goal:
      "Build a calm finance cockpit for small teams, launch with a weekly cashflow ritual, and get to the first paid operators quickly.",
    budgetUsd: "1000",
    initialTaskTitle: "Activate the first cashflow companion MVP",
    recommendedTemplateId: "growth-revenue-pod",
    proofPoints: [
      "Founders understand the pain instantly.",
      "The first product slice is narrow but sticky.",
      "Monetization can happen before deep integrations."
    ],
    metrics: [
      { label: "Industry", value: "Fintech ops" },
      { label: "First revenue", value: "Operator subscription" },
      { label: "Launch path", value: "Web finance cockpit" }
    ],
    sourceInsights: [
      { label: "Problem", value: "Small teams cannot see runway, invoice timing, and weekly cash decisions in one calm place" },
      { label: "Customer", value: "Tiny founder-led teams managing cash manually in spreadsheets" },
      { label: "Offer shape", value: "Weekly cashflow ritual, invoice tracker, and lightweight forecast cockpit" },
    ],
    swarmUpdates: [
      {
        agent: "finance-tracker",
        action: "shaping the minimum runway and invoice views",
        eta: "live now",
        status: "live"
      },
      {
        agent: "rapid-prototyper",
        action: "prepping the weekly cash ritual surface",
        eta: "3 min",
        status: "queued"
      },
      {
        agent: "content-creator",
        action: "framing the founder anxiety narrative for launch",
        eta: "5 min",
        status: "queued"
      },
      {
        agent: "paid-social-strategist",
        action: "lining up the first CAC experiment for finance operators",
        eta: "ready",
        status: "ready"
      }
    ]
  },
  {
    id: "listing-graph-sim",
    source: "raw_idea",
    buildMode: "api_driven",
    industry: "commerce",
    title: "Listing Graph Sim",
    tagline: "Unbundle a Zillow-like experience into an API-native simulation layer.",
    summary:
      "A simulated property discovery and pricing workflow built by reverse-engineering public product behavior, browsing flows, and endpoint patterns instead of relying on official platform access.",
    signal: "High-intent real-estate discovery, listing data demand, and repeated user frustration with closed workflows",
    companyName: "Listing Graph Sim",
    goal:
      "Build an API-driven property discovery company that simulates the core Zillow-like game loop, ships fast, and monetizes from day one through premium access and lead packages.",
    budgetUsd: "1350",
    initialTaskTitle: "Activate the first API-driven listing simulation MVP",
    recommendedTemplateId: "ops-systems-pod",
    proofPoints: [
      "Users already understand the category and the workflow instantly.",
      "A simulated version can validate demand before deep infrastructure spend.",
      "Endpoint research and unbundled UX create a clear technical moat."
    ],
    metrics: [
      { label: "Industry", value: "Proptech + API products" },
      { label: "First revenue", value: "Premium search and lead access" },
      { label: "Launch path", value: "Web simulation console" }
    ],
    sourceInsights: [
      { label: "Reverse-engineering plan", value: "Map browse flows, observe network behavior, and model reusable endpoint patterns" },
      { label: "API leverage", value: "Blend public data, enrichment APIs, and simulated listing intelligence into one surface" },
      { label: "Simulated 12-mo revenue", value: "$320k ARR from premium buyer tools and broker lead packages" },
    ],
    swarmUpdates: [
      {
        agent: "api-scout",
        action: "mapping public product flows and candidate endpoint surfaces",
        eta: "live now",
        status: "live"
      },
      {
        agent: "backend-builder",
        action: "shaping a simulated listing graph and valuation service",
        eta: "4 min",
        status: "queued"
      },
      {
        agent: "frontend-developer",
        action: "assembling a Zillow-like browse and compare interface",
        eta: "6 min",
        status: "queued"
      },
      {
        agent: "growth-operator",
        action: "testing premium access and broker-facing monetization angles",
        eta: "ready",
        status: "ready"
      }
    ]
  },
];

const STARTER_TEAM_TEMPLATES: StarterTeamTemplate[] = [
  {
    id: "lean-launch-pod",
    title: "Lean launch pod",
    summary: "Builder-heavy pod for shipping a credible MVP quickly, then layering launch and revenue.",
    defaultAgentName: "Studio CEO",
    founderBrief:
      "Recruit a lean founding pod around product delivery first: one engineering lead, one design-minded product operator, and one launch/growth operator.",
  },
  {
    id: "product-design-pod",
    title: "Product and design pod",
    summary: "Use when the product surface matters as much as the implementation.",
    defaultAgentName: "Product Lead",
    founderBrief:
      "Recruit a pod with strong product taste: engineering, UX/UI, and a PM-quality operator who protects scope and clarity.",
  },
  {
    id: "growth-revenue-pod",
    title: "Growth and revenue pod",
    summary: "Use when distribution, virality, pricing, and first sales matter immediately.",
    defaultAgentName: "Growth Lead",
    founderBrief:
      "Recruit a founding pod that treats launch, virality, pricing, and monetization as first-class work from day one.",
  },
  {
    id: "ops-systems-pod",
    title: "Ops and systems pod",
    summary: "Use when the company needs strong automations, service ops, and execution systems from the first week.",
    defaultAgentName: "Operations Lead",
    founderBrief:
      "Recruit a systems-heavy pod that keeps delivery organized, automates repetitive work, and builds the operating backbone for support, analytics, and scale.",
  },
];

const STUDIO_PRIVILEGES = [
  "Operator access to the MSX resource layer, signals, and ideas.",
  "Distribution and launch leverage across studio surfaces.",
  "Funding and momentum pathways once a company shows traction.",
];

const STUDIO_INDUSTRY_OPTIONS: Array<{
  id: StudioIndustry;
  label: string;
}> = [
  { id: "all", label: "All industries" },
  { id: "care", label: "Care" },
  { id: "creator", label: "Creator" },
  { id: "local_smb", label: "Local SMB" },
  { id: "commerce", label: "Commerce" },
  { id: "ops", label: "Ops" },
  { id: "fintech", label: "Fintech" },
];

const STUDIO_FEED_FILTERS: Array<{
  id: StudioFeedFilter;
  label: string;
}> = [
  { id: "all", label: "All modes" },
  { id: "market_driven", label: "Market-driven" },
  { id: "product_driven", label: "Product-driven" },
  { id: "api_driven", label: "API-driven" },
];

const DEFAULT_STUDIO_OPPORTUNITY = STUDIO_OPPORTUNITIES[0];
const DEFAULT_STARTER_TEAM_TEMPLATE =
  STARTER_TEAM_TEMPLATES.find(
    (entry) => entry.id === DEFAULT_STUDIO_OPPORTUNITY.recommendedTemplateId
  ) ?? STARTER_TEAM_TEMPLATES[0];
const STARTER_POD_MONTHLY_PRICE_USD = 58;
const STARTER_POD_ALL_ACCESS_PRICE_USD = 148;

function sourceLabel(source: StudioOpportunitySource) {
  if (source === "market_signal") return "Market signal";
  if (source === "raw_idea") return "Raw idea";
  return "Validated outcome";
}

function buildModeLabel(mode: StudioBuildMode) {
  if (mode === "market_driven") return "Market-driven";
  if (mode === "product_driven") return "Product-driven";
  return "API-driven";
}

function buildModeDescription(mode: StudioBuildMode) {
  if (mode === "market_driven") {
    return "Start from live demand signals, audience pull, and market urgency.";
  }
  if (mode === "product_driven") {
    return "Start from a structured product concept, wedge, or validated product outcome.";
  }
  return "Start from a human-supplied API idea, reverse-engineered workflows, and leverageable endpoint patterns.";
}

function industryLabel(industry: Exclude<StudioIndustry, "all">) {
  return (
    STUDIO_INDUSTRY_OPTIONS.find((entry) => entry.id === industry)?.label ??
    "Studio"
  );
}

function opportunityMetricValue(opportunity: StudioOpportunity, label: string) {
  return opportunity.metrics.find((metric) => metric.label === label)?.value ?? null;
}

function sourceInsightHeading(opportunity: StudioOpportunity) {
  if (opportunity.buildMode === "api_driven") {
    return "API reverse-engineering frame";
  }
  if (opportunity.source === "market_signal") return "Channel and signal metrics";
  if (opportunity.source === "raw_idea") return "Structured idea frame";
  return "Preliminary outcome model";
}

function parseUsdToCents(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "").trim();
  if (!normalized) return 0;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function calculateStarterPodMonthlyPriceUsd(selectedCount: number) {
  if (selectedCount >= STARTER_TEAM_TEMPLATES.length) {
    return STARTER_POD_ALL_ACCESS_PRICE_USD;
  }
  return selectedCount * STARTER_POD_MONTHLY_PRICE_USD;
}

function buildActivationTaskDescription(input: {
  opportunity: StudioOpportunity;
  templates: StarterTeamTemplate[];
  companyName: string;
  goal: string;
  budgetUsd: string;
}) {
  const selectedTemplateLines = input.templates.map(
    (template) => `- ${template.title}: ${template.founderBrief}`
  );
  return [
    `You are activating ${input.companyName} inside the MSX startup studio.`,
    "",
    `Build path: ${buildModeLabel(input.opportunity.buildMode)}.`,
    `Studio source: ${sourceLabel(input.opportunity.source)}.`,
    `Opportunity: ${input.opportunity.title}.`,
    `Signal cluster: ${input.opportunity.signal}.`,
    `Target outcome: ${input.goal}.`,
    input.budgetUsd.trim() ? `Activation budget: $${input.budgetUsd.trim()} monthly.` : null,
    "",
    "Active starter pods:",
    ...selectedTemplateLines,
    "",
    "Execution rules:",
    "- Ship the thinnest credible product fast, then keep refining it until real end users can pay.",
    "- Use the installed /superdesign skill and local Superdesign CLI by default for app and product design work.",
    "- Run `superdesign init`, spin up a preview immediately, and use `/superdesign help me design the shipped UI` to push for a premium, modern interface instead of a generic placeholder UI.",
    "- Keep the company premium, modern, viral-ready, and monetization-ready across product, growth, and pricing decisions.",
    "- Organize the next project lanes after the core build: refinement, launch, virality, monetization, and retention.",
    "",
    "Return a concrete activation plan, create the first delivery tasks, and start delegating.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  const routeOnboardingOptions =
    companyPrefix && companiesLoading
      ? null
      : resolveRouteOnboardingOptions({
          pathname: location.pathname,
          companyPrefix,
          companies,
        });
  const effectiveOnboardingOpen =
    onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen
    ? onboardingOptions
    : routeOnboardingOptions ?? {};

  const initialStep = effectiveOnboardingOptions.initialStep ?? 1;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const formScrollRef = useRef<HTMLDivElement | null>(null);
  const studioDeckTouchStartXRef = useRef<number | null>(null);

  // Step 1
  const [selectedIndustry, setSelectedIndustry] =
    useState<StudioIndustry>("all");
  const [selectedFeedFilter, setSelectedFeedFilter] =
    useState<StudioFeedFilter>("all");
  const [swarmFrame, setSwarmFrame] = useState(0);
  const [openStudioSections, setOpenStudioSections] = useState<
    StudioAccordionSection[]
  >(["queue", "brief", "simulation"]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(
    DEFAULT_STUDIO_OPPORTUNITY.id
  );
  const [selectedStarterTeamTemplateIds, setSelectedStarterTeamTemplateIds] =
    useState([DEFAULT_STARTER_TEAM_TEMPLATE.id]);
  const [companyName, setCompanyName] = useState(
    DEFAULT_STUDIO_OPPORTUNITY.companyName
  );
  const [companyGoal, setCompanyGoal] = useState(
    DEFAULT_STUDIO_OPPORTUNITY.goal
  );
  const [activationBudgetUsd, setActivationBudgetUsd] = useState(
    String(calculateStarterPodMonthlyPriceUsd(1))
  );

  // Step 2
  const [agentName, setAgentName] = useState(
    DEFAULT_STARTER_TEAM_TEMPLATE.defaultAgentName
  );
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  // Step 3
  const [taskTitle, setTaskTitle] = useState(
    DEFAULT_STUDIO_OPPORTUNITY.initialTaskTitle
  );
  const [taskDescription, setTaskDescription] = useState(
    buildActivationTaskDescription({
      opportunity: DEFAULT_STUDIO_OPPORTUNITY,
      templates: [DEFAULT_STARTER_TEAM_TEMPLATE],
      companyName: DEFAULT_STUDIO_OPPORTUNITY.companyName,
      goal: DEFAULT_STUDIO_OPPORTUNITY.goal,
      budgetUsd: String(calculateStarterPodMonthlyPriceUsd(1)),
    })
  );
  const [taskDescriptionTouched, setTaskDescriptionTouched] = useState(false);

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdCompanyGoalId, setCreatedCompanyGoalId] = useState<string | null>(
    null
  );
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  const selectedOpportunity = useMemo(
    () =>
      STUDIO_OPPORTUNITIES.find((entry) => entry.id === selectedOpportunityId) ??
      DEFAULT_STUDIO_OPPORTUNITY,
    [selectedOpportunityId]
  );
  const filteredStudioOpportunities = useMemo(() => {
    const next = STUDIO_OPPORTUNITIES.filter((entry) => {
      if (selectedIndustry !== "all" && entry.industry !== selectedIndustry) {
        return false;
      }
  if (selectedFeedFilter !== "all" && entry.buildMode !== selectedFeedFilter) {
        return false;
      }
      return true;
    });

    return next.length > 0 ? next : STUDIO_OPPORTUNITIES;
  }, [selectedFeedFilter, selectedIndustry]);
  const selectedStarterPods = useMemo(() => {
    const next = selectedStarterTeamTemplateIds
      .map((id) => STARTER_TEAM_TEMPLATES.find((entry) => entry.id === id))
      .filter(
        (
          template
        ): template is StarterTeamTemplate => Boolean(template)
      );

    return next.length > 0 ? next : [DEFAULT_STARTER_TEAM_TEMPLATE];
  }, [selectedStarterTeamTemplateIds]);
  const selectedStarterPodMonthlyUsd = useMemo(
    () => calculateStarterPodMonthlyPriceUsd(selectedStarterPods.length),
    [selectedStarterPods.length]
  );
  const selectedStarterPodTitles = useMemo(
    () => selectedStarterPods.map((template) => template.title).join(", "),
    [selectedStarterPods]
  );
  const allStarterPodsSelected =
    selectedStarterPods.length >= STARTER_TEAM_TEMPLATES.length;
  const selectedStarterPodCountLabel = `${selectedStarterPods.length} pod${
    selectedStarterPods.length === 1 ? "" : "s"
  } active`;
  const selectedStarterPodPriceLabel = allStarterPodsSelected
    ? `$${STARTER_POD_ALL_ACCESS_PRICE_USD} / month`
    : `$${selectedStarterPodMonthlyUsd} / month`;
  const selectedOpportunityIndex = useMemo(
    () =>
      Math.max(
        0,
        filteredStudioOpportunities.findIndex(
          (entry) => entry.id === selectedOpportunity.id
        )
      ),
    [filteredStudioOpportunities, selectedOpportunity.id]
  );
  const visibleSwarmUpdates = useMemo(() => {
    const updates = selectedOpportunity.swarmUpdates;
    if (updates.length === 0) return [];
    return Array.from({ length: Math.min(4, updates.length) }).map((_, index) => {
      return updates[(swarmFrame + index) % updates.length]!;
    });
  }, [selectedOpportunity.swarmUpdates, swarmFrame]);
  const applyStudioConfiguration = useCallback(
    (opportunityId: string, templateIds?: string[]) => {
      const opportunity =
        STUDIO_OPPORTUNITIES.find((entry) => entry.id === opportunityId) ??
        DEFAULT_STUDIO_OPPORTUNITY;
      const nextTemplateIds =
        templateIds ?? [opportunity.recommendedTemplateId];
      const templates = nextTemplateIds
        .map((id) => STARTER_TEAM_TEMPLATES.find((entry) => entry.id === id))
        .filter(
          (
            template
          ): template is StarterTeamTemplate => Boolean(template)
        );
      const activeTemplates =
        templates.length > 0 ? templates : [DEFAULT_STARTER_TEAM_TEMPLATE];
      const primaryTemplate = activeTemplates[0] ?? DEFAULT_STARTER_TEAM_TEMPLATE;

      setSelectedOpportunityId(opportunity.id);
      setSelectedStarterTeamTemplateIds(activeTemplates.map((template) => template.id));
      setCompanyName(opportunity.companyName);
      setCompanyGoal(opportunity.goal);
      setAgentName(primaryTemplate.defaultAgentName);
      setTaskTitle(opportunity.initialTaskTitle);
      setTaskDescriptionTouched(false);
      setTaskDescription(
        buildActivationTaskDescription({
          opportunity,
          templates: activeTemplates,
          companyName: opportunity.companyName,
          goal: opportunity.goal,
          budgetUsd: String(
            calculateStarterPodMonthlyPriceUsd(activeTemplates.length)
          ),
        })
      );
    },
    []
  );
  const toggleStudioSection = useCallback((section: StudioAccordionSection) => {
    setOpenStudioSections((current) =>
      current.includes(section)
        ? current.filter((entry) => entry !== section)
        : [...current, section]
    );
  }, []);

  const cycleStudioOpportunity = useCallback(
    (direction: -1 | 1) => {
      if (filteredStudioOpportunities.length <= 1) return;
      const nextIndex =
        (selectedOpportunityIndex + direction + filteredStudioOpportunities.length) %
        filteredStudioOpportunities.length;
      const nextOpportunity = filteredStudioOpportunities[nextIndex];
      if (!nextOpportunity) return;
      applyStudioConfiguration(nextOpportunity.id);
    },
    [
      applyStudioConfiguration,
      filteredStudioOpportunities,
      selectedOpportunityIndex,
    ]
  );

  const handleStudioDeckTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      studioDeckTouchStartXRef.current = event.touches[0]?.clientX ?? null;
    },
    []
  );

  const handleStudioDeckTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const startX = studioDeckTouchStartXRef.current;
      studioDeckTouchStartXRef.current = null;
      if (startX === null) return;

      const endX = event.changedTouches[0]?.clientX ?? startX;
      const deltaX = endX - startX;
      if (Math.abs(deltaX) < 42) return;

      cycleStudioOpportunity(deltaX > 0 ? -1 : 1);
    },
    [cycleStudioOpportunity]
  );

  const toggleStarterTeamTemplate = useCallback(
    (templateId: string) => {
      const currentPrimary = selectedStarterPods[0] ?? DEFAULT_STARTER_TEAM_TEMPLATE;
      const nextIds = selectedStarterTeamTemplateIds.includes(templateId)
        ? selectedStarterTeamTemplateIds.length === 1
          ? selectedStarterTeamTemplateIds
          : selectedStarterTeamTemplateIds.filter((id) => id !== templateId)
        : [...selectedStarterTeamTemplateIds, templateId];
      const orderedIds = STARTER_TEAM_TEMPLATES.map((template) => template.id).filter(
        (id) => nextIds.includes(id)
      );
      const nextTemplates = orderedIds
        .map((id) => STARTER_TEAM_TEMPLATES.find((template) => template.id === id))
        .filter(
          (
            template
          ): template is StarterTeamTemplate => Boolean(template)
        );
      const nextPrimary = nextTemplates[0] ?? DEFAULT_STARTER_TEAM_TEMPLATE;

      setSelectedStarterTeamTemplateIds(orderedIds);
      setAgentName((current) => {
        const trimmedCurrent = current.trim();
        if (!trimmedCurrent || trimmedCurrent === currentPrimary.defaultAgentName) {
          return nextPrimary.defaultAgentName;
        }
        return current;
      });
    },
    [selectedStarterPods, selectedStarterTeamTemplateIds]
  );

  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const cId = effectiveOnboardingOptions.companyId ?? null;
    setStep(effectiveOnboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedProjectId(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
    setSelectedIndustry("all");
    setSelectedFeedFilter("all");
    setSwarmFrame(0);
    if (!cId) {
      applyStudioConfiguration(
        DEFAULT_STUDIO_OPPORTUNITY.id,
        [DEFAULT_STARTER_TEAM_TEMPLATE.id]
      );
    }
  }, [
    effectiveOnboardingOpen,
    applyStudioConfiguration,
    effectiveOnboardingOptions.companyId,
    effectiveOnboardingOptions.initialStep
  ]);

  useEffect(() => {
    if (!effectiveOnboardingOpen || step !== 1) return;
    const timer = window.setInterval(() => {
      setSwarmFrame((current) => current + 1);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [effectiveOnboardingOpen, step]);

  useEffect(() => {
    if (
      filteredStudioOpportunities.some(
        (entry) => entry.id === selectedOpportunityId
      )
    ) {
      return;
    }

    const nextOpportunity = filteredStudioOpportunities[0];
    if (!nextOpportunity) return;
    applyStudioConfiguration(nextOpportunity.id);
  }, [
    applyStudioConfiguration,
    filteredStudioOpportunities,
    selectedOpportunityId,
  ]);

  useEffect(() => {
    setActivationBudgetUsd(String(selectedStarterPodMonthlyUsd));
  }, [selectedStarterPodMonthlyUsd]);

  useEffect(() => {
    if (!effectiveOnboardingOpen || step === 4 || taskDescriptionTouched) return;
    setTaskDescription(
      buildActivationTaskDescription({
        opportunity: selectedOpportunity,
        templates: selectedStarterPods,
        companyName: companyName.trim() || selectedOpportunity.companyName,
        goal: companyGoal.trim() || selectedOpportunity.goal,
        budgetUsd: String(selectedStarterPodMonthlyUsd),
      })
    );
  }, [
    companyGoal,
    companyName,
    effectiveOnboardingOpen,
    selectedOpportunity,
    selectedStarterPodMonthlyUsd,
    selectedStarterPods,
    step,
    taskDescriptionTouched,
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!effectiveOnboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [effectiveOnboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    formScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [effectiveOnboardingOpen, step]);

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching
  } = useQuery({
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 2
  });
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local"
      ? "codex"
      : adapterType === "gemini_local"
        ? "gemini"
      : adapterType === "pi_local"
      ? "pi"
      : adapterType === "cursor"
      ? "agent"
      : adapterType === "opencode_local"
      ? "opencode"
      : "claude");

  useEffect(() => {
    if (step !== 2) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, model, command, args, url]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);
  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id))
        }
      ];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id))
      }));
  }, [filteredModels, adapterType]);

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setTaskDescriptionTouched(false);
    setSelectedIndustry("all");
    setSelectedFeedFilter("all");
    setSwarmFrame(0);
    applyStudioConfiguration(
      DEFAULT_STUDIO_OPPORTUNITY.id,
      [DEFAULT_STARTER_TEAM_TEMPLATE.id]
    );
    setAdapterType("claude_local");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedAgentId(null);
    setCreatedProjectId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType,
      model:
        adapterType === "codex_local"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "gemini_local"
            ? model || DEFAULT_GEMINI_LOCAL_MODEL
          : adapterType === "cursor"
          ? model || DEFAULT_CURSOR_LOCAL_MODEL
          : model,
      command,
      args,
      url,
      dangerouslySkipPermissions: adapterType === "claude_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        "Create or select a company before testing adapter environment."
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error ? err.message : "Adapter environment test failed"
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const trimmedCompanyName = companyName.trim();
      const trimmedGoal = companyGoal.trim();
      const activationBudgetCents = parseUsdToCents(activationBudgetUsd);
      const studioDescription = [
        `${sourceLabel(selectedOpportunity.source)}: ${selectedOpportunity.title}.`,
        selectedOpportunity.summary,
        `Signal cluster: ${selectedOpportunity.signal}.`,
        trimmedGoal ? `Current outcome: ${trimmedGoal}.` : null,
        `Starter pods: ${selectedStarterPodTitles}.`,
        "Activated inside the MSX startup studio.",
      ]
        .filter(Boolean)
        .join(" ");

      setTaskDescription(
        buildActivationTaskDescription({
          opportunity: selectedOpportunity,
          templates: selectedStarterPods,
          companyName: trimmedCompanyName,
          goal: trimmedGoal || selectedOpportunity.goal,
          budgetUsd: String(selectedStarterPodMonthlyUsd),
        })
      );

      const company = await companiesApi.create({
        name: trimmedCompanyName,
        description: studioDescription,
        ...(activationBudgetCents > 0
          ? { budgetMonthlyCents: activationBudgetCents }
          : {}),
      });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (trimmedGoal) {
        const parsedGoal = parseOnboardingGoalInput(trimmedGoal);
        const goal = await goalsApi.create(company.id, {
          title: parsedGoal.title,
          ...(parsedGoal.description
            ? { description: parsedGoal.description }
            : {}),
          level: "company",
          status: "active"
        });
        setCreatedCompanyGoalId(goal.id);
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id)
        });
      } else {
        setCreatedCompanyGoalId(null);
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (adapterType === "opencode_local") {
        const selectedModelId = model.trim();
        if (!selectedModelId) {
          setError(
            "OpenCode requires an explicit model in provider/model format."
          );
          return;
        }
        if (adapterModelsError) {
          setError(
            adapterModelsError instanceof Error
              ? adapterModelsError.message
              : "Failed to load OpenCode models."
          );
          return;
        }
        if (adapterModelsLoading || adapterModelsFetching) {
          setError(
            "OpenCode models are still loading. Please wait and try again."
          );
          return;
        }
        const discoveredModels = adapterModels ?? [];
        if (!discoveredModels.some((entry) => entry.id === selectedModelId)) {
          setError(
            discoveredModels.length === 0
              ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
              : `Configured OpenCode model is unavailable: ${selectedModelId}`
          );
          return;
        }
      }

      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }

      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1
          }
        }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId)
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(
          "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to unset ANTHROPIC_API_KEY and retry."
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setError(null);
    setStep(4);
  }

  async function handleLaunch() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      let goalId = createdCompanyGoalId;
      if (!goalId) {
        const goals = await goalsApi.list(createdCompanyId);
        goalId = selectDefaultCompanyGoalId(goals);
        setCreatedCompanyGoalId(goalId);
      }

      let projectId = createdProjectId;
      if (!projectId) {
        const project = await projectsApi.create(
          createdCompanyId,
          buildOnboardingProjectPayload(goalId)
        );
        projectId = project.id;
        setCreatedProjectId(projectId);
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.list(createdCompanyId)
        });
      }

      let issueRef = createdIssueRef;
      if (!issueRef) {
        const issue = await issuesApi.create(
          createdCompanyId,
          buildOnboardingIssuePayload({
            title: taskTitle,
            description: taskDescription,
            assigneeAgentId: createdAgentId,
            projectId,
            goalId
          })
        );
        issueRef = issue.identifier ?? issue.id;
        setCreatedIssueRef(issueRef);
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.list(createdCompanyId)
        });
      }

      setSelectedCompanyId(createdCompanyId);
      reset();
      closeOnboarding();
      navigate(
        createdCompanyPrefix
          ? `/${createdCompanyPrefix}/issues/${issueRef}`
          : `/issues/${issueRef}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) handleStep1Next();
      else if (step === 2 && agentName.trim()) handleStep2Next();
      else if (step === 3 && taskTitle.trim()) handleStep3Next();
      else if (step === 4) handleLaunch();
    }
  }

  if (!effectiveOnboardingOpen) return null;

  return (
    <Dialog
      open={effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRouteDismissed(true);
          handleClose();
        }
      }}
    >
      <DialogPortal>
        {/* Plain div instead of DialogOverlay — Radix's overlay wraps in
            RemoveScroll which blocks wheel events on our custom (non-DialogContent)
            scroll container. A plain div preserves the background without scroll-locking. */}
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          {/* Left half — form */}
          <div
            ref={formScrollRef}
            className={cn(
              "w-full flex flex-col overflow-y-auto transition-[width] duration-500 ease-in-out",
              "md:w-1/2"
            )}
          >
            <div
              className="w-full max-w-4xl mx-auto my-auto px-8 py-12 shrink-0"
            >
              {/* Progress tabs */}
              <div className="flex items-center gap-0 mb-8 border-b border-border">
                {(
                  [
                    { step: 1 as Step, label: "Studio", icon: Building2 },
                    { step: 2 as Step, label: "Lead", icon: Bot },
                    { step: 3 as Step, label: "Outcomes", icon: ListTodo },
                    { step: 4 as Step, label: "Activate", icon: Rocket }
                  ] as const
                ).map(({ step: s, label, icon: Icon }) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                      s === step
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground/70 hover:border-border"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Step content */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="mb-1 space-y-2 border-b border-border pb-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      Studio
                    </div>
                    <h3 className="text-[2rem] font-semibold tracking-tight">
                      Choose a studio direction
                    </h3>
                    <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
                      MSX is the agent-native startup studio that turns agents into
                      formidable founders, and humans into formidable patrons. It
                      surfaces problems, research, ideas, simulated product outcomes,
                      and early revenue models first, then enables human operators to
                      deploy and direct autonomous build lanes with distribution
                      leverage and financial incentives across the studio.
                    </p>
                    <p className="max-w-4xl text-xs leading-6 text-muted-foreground/85">
                      A company can start from live market demand, from a product
                      concept that a human wants to pursue, or from an API-driven
                      idea built by studying public product behavior, unbundling
                      workflows, and simulating the core experience fast.
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Industry focus
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {STUDIO_INDUSTRY_OPTIONS.map((industry) => {
                          const isActive = industry.id === selectedIndustry;
                          return (
                            <button
                              key={industry.id}
                              type="button"
                              onClick={() => setSelectedIndustry(industry.id)}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                isActive
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                              )}
                            >
                              {industry.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Studio lanes
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {STUDIO_FEED_FILTERS.map((filter) => {
                          const isActive = filter.id === selectedFeedFilter;
                          return (
                            <button
                              key={filter.id}
                              type="button"
                              onClick={() => setSelectedFeedFilter(filter.id)}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                isActive
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                              )}
                            >
                              {filter.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card/60">
                    <button
                      type="button"
                      onClick={() => toggleStudioSection("queue")}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                    >
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Studio queue
                        </div>
                        <h4 className="mt-1 text-base font-medium">
                          Select the market-driven, product-driven, or API-driven company to activate now
                        </h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Pick one direction explicitly. The queue can start from
                          market demand, a product idea, or a custom API-driven
                          concept supplied by the human operator.
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          openStudioSections.includes("queue") && "rotate-180"
                        )}
                      />
                    </button>
                    {openStudioSections.includes("queue") && (
                      <div className="grid gap-2 border-t border-border px-4 py-4 sm:grid-cols-2">
                        {filteredStudioOpportunities.map((opportunity) => {
                          const isSelected = opportunity.id === selectedOpportunity.id;
                          return (
                            <button
                              key={opportunity.id}
                              type="button"
                              onClick={() => applyStudioConfiguration(opportunity.id)}
                              className={cn(
                                "rounded-2xl border px-4 py-4 text-left transition-colors",
                                isSelected
                                  ? "border-foreground bg-accent/40"
                                  : "border-border bg-background/70 hover:bg-accent/30"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                    {buildModeLabel(opportunity.buildMode)}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                                    {sourceLabel(opportunity.source)}
                                  </span>
                                </div>
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                                    isSelected
                                      ? "bg-foreground text-background"
                                      : "border border-border text-muted-foreground"
                                  )}
                                >
                                  {isSelected ? "Selected" : "Select"}
                                </span>
                              </div>
                              <div className="mt-3 text-sm font-medium">
                                {opportunity.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {opportunity.tagline}
                              </div>
                              <div className="mt-3 text-[11px] leading-5 text-muted-foreground">
                                {buildModeDescription(opportunity.buildMode)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[28px] border border-border bg-gradient-to-br from-background via-background to-accent/40 shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleStudioSection("brief")}
                      className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {buildModeLabel(selectedOpportunity.buildMode)}
                          </span>
                          <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {sourceLabel(selectedOpportunity.source)}
                          </span>
                          <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {industryLabel(selectedOpportunity.industry)}
                          </span>
                          <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            Selected now
                          </span>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                            Studio brief
                          </div>
                          <h4 className="mt-2 text-2xl font-semibold tracking-tight">
                            {selectedOpportunity.title}
                          </h4>
                          <p className="mt-1 text-sm font-medium text-foreground/85">
                            {selectedOpportunity.tagline}
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          openStudioSections.includes("brief") && "rotate-180"
                        )}
                      />
                    </button>

                    {openStudioSections.includes("brief") && (
                      <div
                        className="border-t border-border px-5 py-5"
                        onTouchStart={handleStudioDeckTouchStart}
                        onTouchEnd={handleStudioDeckTouchEnd}
                      >
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => cycleStudioOpportunity(-1)}
                            className="rounded-full border border-border bg-background/80 p-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/60"
                            aria-label="Previous opportunity"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => cycleStudioOpportunity(1)}
                            className="rounded-full border border-border bg-background/80 p-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/60"
                            aria-label="Next opportunity"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_220px]">
                          <div className="space-y-4">
                            <p className="text-sm leading-6 text-muted-foreground">
                              {selectedOpportunity.summary}
                            </p>
                            <div className="rounded-2xl border border-border bg-background/80 p-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Build path
                              </div>
                              <p className="mt-2 text-sm leading-6">
                                {buildModeDescription(selectedOpportunity.buildMode)}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-border bg-background/80 p-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Signal cluster
                              </div>
                              <p className="mt-2 text-sm leading-6">
                                {selectedOpportunity.signal}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-border bg-background/80 p-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                {sourceInsightHeading(selectedOpportunity)}
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                {selectedOpportunity.sourceInsights.map((insight) => (
                                  <div
                                    key={insight.label}
                                    className="rounded-2xl border border-border bg-card/60 px-3 py-3"
                                  >
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                      {insight.label}
                                    </div>
                                    <div className="mt-2 text-sm leading-5">
                                      {insight.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                              {selectedOpportunity.proofPoints.map((point) => (
                                <div
                                  key={point}
                                  className="rounded-2xl border border-border bg-background/80 px-3 py-3 text-xs leading-5 text-muted-foreground"
                                >
                                  {point}
                                </div>
                              ))}
                            </div>
                            <div className="rounded-2xl border border-border bg-background/80 p-4">
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                <TrendingUp className="h-3.5 w-3.5" />
                                First activation
                              </div>
                              <p className="mt-2 text-sm font-medium">
                                {selectedOpportunity.initialTaskTitle}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-border bg-background/80 p-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Studio thesis
                              </div>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                MSX should preliminarily identify the problem, pressure-test the
                                idea, simulate the likely product outcome, map the first
                                revenue path, and keep refining the company until real users are
                                ready to pay before a human founder or team is brought in.
                              </p>
                              {selectedOpportunity.buildMode === "api_driven" && (
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                  In API-driven lanes, that means a human can provide the
                                  starting concept while MSX maps the behavior, endpoints,
                                  reusable data flows, and monetizable wedge before the
                                  first build pod is deployed.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-2">
                            {selectedOpportunity.metrics.map((metric) => (
                              <div
                                key={metric.label}
                                className="rounded-2xl border border-border bg-background/80 px-4 py-4"
                              >
                                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {metric.label}
                                </div>
                                <div className="mt-2 text-sm font-medium">
                                  {metric.value}
                                </div>
                              </div>
                            ))}
                            <div className="rounded-2xl border border-border bg-background/80 px-4 py-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Projected first revenue
                              </div>
                              <div className="mt-2 text-sm font-medium">
                                {opportunityMetricValue(selectedOpportunity, "First revenue") ?? "To be modeled"}
                              </div>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                Treated as a preliminary studio forecast, not a promise. The goal
                                is to know what to test before capital and people are committed.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-border bg-background/80 px-4 py-4">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Human activation
                              </div>
                              <div className="mt-2 text-sm font-medium">
                                Founder in residence + operator pod
                              </div>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                Once a direction looks credible, MSX can bring in the human lead,
                                then spin up the agentic team, workspace, dashboard, funding lane,
                                and acceleration support around them without lowering the bar on
                                product quality, growth readiness, or monetization readiness.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card/60">
                    <button
                      type="button"
                      onClick={() => toggleStudioSection("simulation")}
                      className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
                    >
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Studio simulation
                        </div>
                        <h4 className="mt-2 text-base font-medium">
                          What MSX is already modeling
                        </h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Open this to see the research, product, growth, and revenue
                          simulation around the selected studio direction.
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          openStudioSections.includes("simulation") && "rotate-180"
                        )}
                      />
                    </button>
                    {openStudioSections.includes("simulation") && (
                      <div className="border-t border-border px-4 py-4">
                        <div className="space-y-2">
                          {visibleSwarmUpdates.map((update, index) => (
                            <div
                              key={`${update.agent}-${update.action}`}
                              className="rounded-2xl border border-border bg-background/80 px-3 py-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full",
                                      update.status === "live"
                                        ? "bg-green-500 animate-pulse"
                                        : update.status === "queued"
                                        ? "bg-amber-500"
                                        : "bg-sky-500"
                                    )}
                                  />
                                  @{update.agent}
                                </div>
                                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                  {index === 0 ? "in progress" : update.eta}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                {update.action}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-2xl border border-border bg-background/80 px-3 py-3 text-center">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Research lanes
                            </div>
                            <div className="mt-2 text-sm font-medium">04</div>
                          </div>
                          <div className="rounded-2xl border border-border bg-background/80 px-3 py-3 text-center">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Simulated outcome
                            </div>
                            <div className="mt-2 text-sm font-medium">
                              Premium product fit
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border bg-background/80 px-3 py-3 text-center">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Revenue model
                            </div>
                            <div className="mt-2 text-sm font-medium">
                              {opportunityMetricValue(selectedOpportunity, "First revenue") ?? "In review"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-border pt-4 space-y-2">
                          {STUDIO_PRIVILEGES.map((privilege) => (
                            <div
                              key={privilege}
                              className="flex items-start gap-2 text-sm"
                            >
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                              <span>{privilege}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Choose the founding lead</h3>
                      <p className="text-xs text-muted-foreground">
                        Pick the starter team template first, then choose the lead who keeps the company moving until the product is polished, launchable, and ready for paid users.
                      </p>
                    </div>
                  </div>
                    <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Starter team pods
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        $58 / month each · all 4 for $148
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {STARTER_TEAM_TEMPLATES.map((template) => {
                        const isSelected =
                          selectedStarterTeamTemplateIds.includes(template.id);
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => toggleStarterTeamTemplate(template.id)}
                            aria-pressed={isSelected}
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left transition-colors",
                              isSelected
                                ? "border-foreground bg-accent"
                                : "border-border hover:bg-accent/40"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">
                                  {template.title}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {template.summary}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                  $58 / mo
                                </span>
                                {template.id ===
                                  selectedOpportunity.recommendedTemplateId && (
                                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                    Recommended
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 text-[11px] text-muted-foreground">
                              {template.founderBrief}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-accent/30 p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Selected starter pods
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {selectedStarterPodCountLabel}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {selectedStarterPodPriceLabel}
                      </span>
                      {allStarterPodsSelected && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          All-access bundle
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selectedStarterPodTitles}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Lead name
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="Studio CEO"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Adapter type radio cards */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Adapter type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          value: "claude_local" as const,
                          label: "Claude Code",
                          icon: Sparkles,
                          desc: "Local Claude agent",
                          recommended: true
                        },
                        {
                          value: "codex_local" as const,
                          label: "Codex",
                          icon: Code,
                          desc: "Local Codex agent",
                          recommended: true
                        }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                            adapterType === opt.value
                              ? "border-foreground bg-accent"
                              : "border-border hover:bg-accent/50"
                          )}
                          onClick={() => {
                            const nextType = opt.value as AdapterType;
                            setAdapterType(nextType);
                            if (nextType === "codex_local" && !model) {
                              setModel(DEFAULT_CODEX_LOCAL_MODEL);
                            }
                            if (nextType !== "codex_local") {
                              setModel("");
                            }
                          }}
                        >
                          {opt.recommended && (
                            <span className="absolute -top-1.5 right-1.5 bg-green-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                              Recommended
                            </span>
                          )}
                          <opt.icon className="h-4 w-4" />
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {opt.desc}
                          </span>
                        </button>
                      ))}
                    </div>

                    <button
                      className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowMoreAdapters((v) => !v)}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          showMoreAdapters ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      More Agent Adapter Types
                    </button>

                    {showMoreAdapters && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {[
                          {
                            value: "gemini_local" as const,
                            label: "Gemini CLI",
                            icon: Gem,
                            desc: "Local Gemini agent"
                          },
                          {
                            value: "opencode_local" as const,
                            label: "OpenCode",
                            icon: OpenCodeLogoIcon,
                            desc: "Local multi-provider agent"
                          },
                          {
                            value: "pi_local" as const,
                            label: "Pi",
                            icon: Terminal,
                            desc: "Local Pi agent"
                          },
                          {
                            value: "cursor" as const,
                            label: "Cursor",
                            icon: MousePointer2,
                            desc: "Local Cursor agent"
                          },
                          {
                            value: "openclaw_gateway" as const,
                            label: "OpenClaw Gateway",
                            icon: Bot,
                            desc: "Invoke OpenClaw via gateway protocol",
                            comingSoon: true,
                            disabledLabel: "Configure OpenClaw within the App"
                          }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            disabled={!!opt.comingSoon}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                              opt.comingSoon
                                ? "border-border opacity-40 cursor-not-allowed"
                                : adapterType === opt.value
                                ? "border-foreground bg-accent"
                                : "border-border hover:bg-accent/50"
                            )}
                            onClick={() => {
                              if (opt.comingSoon) return;
                              const nextType = opt.value as AdapterType;
                              setAdapterType(nextType);
                              if (nextType === "gemini_local" && !model) {
                                setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                                return;
                              }
                              if (nextType === "cursor" && !model) {
                                setModel(DEFAULT_CURSOR_LOCAL_MODEL);
                                return;
                              }
                              if (nextType === "opencode_local") {
                                if (!model.includes("/")) {
                                  setModel("");
                                }
                                return;
                              }
                              setModel("");
                            }}
                          >
                            <opt.icon className="h-4 w-4" />
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-muted-foreground text-[10px]">
                              {opt.comingSoon
                                ? (opt as { disabledLabel?: string })
                                    .disabledLabel ?? "Coming soon"
                                : opt.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Conditional adapter fields */}
                  {(adapterType === "claude_local" ||
                    adapterType === "codex_local" ||
                    adapterType === "gemini_local" ||
                    adapterType === "opencode_local" ||
                    adapterType === "pi_local" ||
                    adapterType === "cursor") && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Model
                        </label>
                        <Popover
                          open={modelOpen}
                          onOpenChange={(next) => {
                            setModelOpen(next);
                            if (!next) setModelSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
                              <span
                                className={cn(
                                  !model && "text-muted-foreground"
                                )}
                              >
                                {selectedModel
                                  ? selectedModel.label
                                  : model ||
                                    (adapterType === "opencode_local"
                                      ? "Select model (required)"
                                      : "Default")}
                              </span>
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-1"
                            align="start"
                          >
                            <input
                              className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                              placeholder="Search models..."
                              value={modelSearch}
                              onChange={(e) => setModelSearch(e.target.value)}
                              autoFocus
                            />
                            {adapterType !== "opencode_local" && (
                              <button
                                className={cn(
                                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                  !model && "bg-accent"
                                )}
                                onClick={() => {
                                  setModel("");
                                  setModelOpen(false);
                                }}
                              >
                                Default
                              </button>
                            )}
                            <div className="max-h-[240px] overflow-y-auto">
                              {groupedModels.map((group) => (
                                <div
                                  key={group.provider}
                                  className="mb-1 last:mb-0"
                                >
                                  {adapterType === "opencode_local" && (
                                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                      {group.provider} ({group.entries.length})
                                    </div>
                                  )}
                                  {group.entries.map((m) => (
                                    <button
                                      key={m.id}
                                      className={cn(
                                        "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                        m.id === model && "bg-accent"
                                      )}
                                      onClick={() => {
                                        setModel(m.id);
                                        setModelOpen(false);
                                      }}
                                    >
                                      <span
                                        className="block w-full text-left truncate"
                                        title={m.id}
                                      >
                                        {adapterType === "opencode_local"
                                          ? extractModelName(m.id)
                                          : m.label}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                            {filteredModels.length === 0 && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                No models discovered.
                              </p>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}

                  {isLocalAdapter && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">
                            Adapter environment check
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Runs a live probe that asks the adapter CLI to
                            respond with hello.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading ? "Testing..." : "Test now"}
                        </Button>
                      </div>

                      {adapterEnvError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                          {adapterEnvError}
                        </div>
                      )}

                      {adapterEnvResult &&
                      adapterEnvResult.status === "pass" ? (
                        <div className="flex items-center gap-2 rounded-md border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">Passed</span>
                        </div>
                      ) : adapterEnvResult ? (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      ) : null}

                      {shouldSuggestUnsetAnthropicApiKey && (
                        <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 space-y-2">
                          <p className="text-[11px] text-amber-900/90 leading-relaxed">
                            Claude failed while{" "}
                            <span className="font-mono">ANTHROPIC_API_KEY</span>{" "}
                            is set. You can clear it in this CEO adapter config
                            and retry the probe.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={
                              adapterEnvLoading || unsetAnthropicLoading
                            }
                            onClick={() => void handleUnsetAnthropicApiKey()}
                          >
                            {unsetAnthropicLoading
                              ? "Retrying..."
                              : "Unset ANTHROPIC_API_KEY"}
                          </Button>
                        </div>
                      )}

                      {adapterEnvResult && adapterEnvResult.status === "fail" && (
                        <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5">
                          <p className="font-medium">Manual debug</p>
                          <p className="text-muted-foreground font-mono break-all">
                            {adapterType === "cursor"
                              ? `${effectiveAdapterCommand} -p --mode ask --output-format json \"Respond with hello.\"`
                              : adapterType === "codex_local"
                              ? `${effectiveAdapterCommand} exec --json -`
                              : adapterType === "gemini_local"
                                ? `${effectiveAdapterCommand} --output-format json "Respond with hello."`
                              : adapterType === "opencode_local"
                                ? `${effectiveAdapterCommand} run --format json "Respond with hello."`
                              : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
                          </p>
                          <p className="text-muted-foreground">
                            Prompt:{" "}
                            <span className="font-mono">Respond with hello.</span>
                          </p>
                          {adapterType === "cursor" ||
                          adapterType === "codex_local" ||
                          adapterType === "gemini_local" ||
                          adapterType === "opencode_local" ? (
                            <p className="text-muted-foreground">
                              If auth fails, set{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "CURSOR_API_KEY"
                                  : adapterType === "gemini_local"
                                    ? "GEMINI_API_KEY"
                                    : "OPENAI_API_KEY"}
                              </span>{" "}
                              in env or run{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "agent login"
                                  : adapterType === "codex_local"
                                    ? "codex login"
                                    : adapterType === "gemini_local"
                                      ? "gemini auth"
                                      : "opencode auth login"}
                              </span>
                              .
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              If login is required, run{" "}
                              <span className="font-mono">claude login</span>{" "}
                              and retry.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(adapterType === "http" ||
                    adapterType === "openclaw_gateway") && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {adapterType === "openclaw_gateway"
                          ? "Gateway URL"
                          : "Webhook URL"}
                      </label>
                      <input
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                        placeholder={
                          adapterType === "openclaw_gateway"
                            ? "ws://127.0.0.1:18789"
                            : "https://..."
                        }
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <ListTodo className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Set goals and outcomes</h3>
                      <p className="text-xs text-muted-foreground">
                        Lock the project goal first, then refine the activation brief the founding lead receives. This is where premium product quality, growth intent, and monetization expectations get set.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Goals and outcomes
                    </label>
                    <textarea
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[96px]"
                      placeholder="What is this project trying to ship, prove, and monetize first?"
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="rounded-xl border border-border bg-accent/30 p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Design rule
                    </div>
                    <p className="mt-2 text-sm">
                      Generate the first usable preview quickly, then use Superdesign to turn it into a polished product surface.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Activation brief title
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="e.g. Activate Elder Memory Mobile and ship the first public MVP"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Activation instructions
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
                      placeholder="Tell the lead how to activate the company, refine it into a premium product, and organize the growth, virality, monetization, and retention lanes."
                      value={taskDescription}
                      onChange={(e) => {
                        setTaskDescriptionTouched(true);
                        setTaskDescription(e.target.value);
                      }}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Rocket className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Ready to activate</h3>
                      <p className="text-xs text-muted-foreground">
                        Activating now will create the studio company, seed the activation lane, wake the lead, and start refinement toward paid adoption.
                      </p>
                    </div>
                  </div>
                  <div className="border border-border divide-y divide-border">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">Studio company</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {selectedOpportunity.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sourceLabel(selectedOpportunity.source)} · {selectedOpportunity.signal}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {agentName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedStarterPodCountLabel} · {getUIAdapter(adapterType).label}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {taskTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">Activation brief</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Rocket className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {selectedStarterPodPriceLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Starter pod plan · Superdesign expected in the design loop
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      disabled={
                        !agentName.trim() || loading || adapterEnvLoading
                      }
                      onClick={handleStep2Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button size="sm" disabled={loading} onClick={handleLaunch}>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Activating..." : "Activate company"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right half — ASCII art (hidden on mobile) */}
          <div
            className={cn(
              "hidden md:block overflow-hidden bg-[#1d1d1d] transition-[width,opacity] duration-500 ease-in-out",
              "w-1/2 opacity-100"
            )}
          >
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function AdapterEnvironmentResult({
  result
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const statusLabel =
    result.status === "pass"
      ? "Passed"
      : result.status === "warn"
      ? "Warnings"
      : "Failed";
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
      ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
      : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[11px] ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{statusLabel}</span>
        <span className="opacity-80">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {result.checks.map((check, idx) => (
          <div
            key={`${check.code}-${idx}`}
            className="leading-relaxed break-words"
          >
            <span className="font-medium uppercase tracking-wide opacity-80">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="block opacity-75 break-all">
                ({check.detail})
              </span>
            )}
            {check.hint && (
              <span className="block opacity-90 break-words">
                Hint: {check.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
