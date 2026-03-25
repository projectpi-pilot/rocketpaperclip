#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PAPERCLIP_BASE_URL = normalizeBaseUrl(
  process.env.PAPERCLIP_BASE_URL ?? "http://127.0.0.1:3100",
);
const OPENCLAW_CONFIG_PATH =
  process.env.OPENCLAW_CONFIG_PATH ?? path.join(os.homedir(), ".openclaw", "openclaw.json");
const FLEET_RUNTIME = (process.env.PAPERCLIP_FLEET_RUNTIME ?? "codex_local").trim();
const COMPANY_NAME = process.env.PAPERCLIP_COMPANY_NAME ?? "OpenClaw Fleet";
const COMPANY_DESCRIPTION =
  process.env.PAPERCLIP_COMPANY_DESCRIPTION
  ?? "Local Paperclip mirror of the OpenClaw fleet.";
const PRIMARY_MANAGER_IDS = new Set([
  "main",
  "agents-orchestrator",
  "social-media-strategist",
  "finance-tracker",
]);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function log(message) {
  console.log(`[sync-openclaw-fleet] ${message}`);
}

function readNestedRecord(record, key) {
  const value = record?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function inferGatewayUrl(openclawConfig) {
  const gateway = readNestedRecord(openclawConfig, "gateway");
  const port = Number(gateway.port ?? 18789);
  const bind = String(gateway.bind ?? "loopback").toLowerCase();
  const host = bind === "loopback" ? "127.0.0.1" : "localhost";
  return process.env.OPENCLAW_GATEWAY_URL ?? `ws://${host}:${port}`;
}

async function resolveGatewayToken(openclawConfig) {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  const gateway = readNestedRecord(openclawConfig, "gateway");
  const auth = readNestedRecord(gateway, "auth");
  const inlineToken = typeof auth.token === "string" ? auth.token.trim() : "";
  if (inlineToken) {
    return inlineToken;
  }

  const tokenFile = typeof auth.tokenFile === "string" ? auth.tokenFile.trim() : "";
  if (tokenFile) {
    return (await readFile(tokenFile, "utf8")).trim();
  }

  throw new Error(
    `Could not resolve an OpenClaw gateway token from ${OPENCLAW_CONFIG_PATH}. ` +
      "Set OPENCLAW_GATEWAY_TOKEN to override.",
  );
}

function loadOpenClawAgentsFromCli() {
  try {
    const stdout = execFileSync("openclaw", ["agents", "list", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(stdout);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`Falling back to the OpenClaw config file because the CLI probe failed: ${reason}`);
    return null;
  }
}

function loadOpenClawAgentsFromConfig(openclawConfig) {
  const agents = readNestedRecord(openclawConfig, "agents");
  const list = Array.isArray(agents.list) ? agents.list : [];
  return list.map((entry) => ({
    id: entry.id,
    name: entry.name ?? entry.id,
    workspace: entry.workspace ?? null,
    agentDir: entry.agentDir ?? null,
    model: null,
    bindings: 0,
    isDefault: entry.id === "main",
    routes: entry.id === "main" ? ["default (no explicit rules)"] : [],
  }));
}

function dedupeAgents(agents) {
  const seen = new Set();
  return agents.filter((agent) => {
    if (!agent?.id || seen.has(agent.id)) {
      return false;
    }
    seen.add(agent.id);
    return true;
  });
}

function sortFleet(agents) {
  const priority = new Map([
    ["main", 0],
    ["agents-orchestrator", 1],
    ["social-media-strategist", 2],
    ["finance-tracker", 3],
  ]);
  return [...agents].sort((left, right) => {
    const leftPriority = priority.get(left.id) ?? 100;
    const rightPriority = priority.get(right.id) ?? 100;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return String(left.id).localeCompare(String(right.id));
  });
}

function humanizeAgentId(agentId) {
  if (agentId === "main") {
    return "OpenClaw Main";
  }
  return agentId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 3) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function inferRole(agentId) {
  if (agentId === "main") return "ceo";
  if (agentId === "agents-orchestrator") return "cto";
  if (agentId === "social-media-strategist") return "cmo";
  if (agentId === "finance-tracker") return "cfo";

  const value = agentId.toLowerCase();
  const tokens = value.split(/[-_]/g).filter(Boolean);
  const hasToken = (...needles) => needles.some((needle) => tokens.includes(needle));

  if (hasToken("designer", "visual", "artist", "ux", "ui", "storyteller", "brand", "narrative", "level")) {
    return "designer";
  }
  if (hasToken("qa", "tester", "reviewer", "auditor", "checker", "benchmarker")) {
    return "qa";
  }
  if (hasToken("devops", "sre", "infrastructure", "operations", "maintainer", "pipeline")) {
    return "devops";
  }
  if (hasToken("manager", "producer", "prioritizer", "shepherd", "orchestrator", "owner")) {
    return "pm";
  }
  if (hasToken(
    "engineer",
    "developer",
    "architect",
    "builder",
    "scripter",
    "firmware",
    "backend",
    "frontend",
    "mobile",
    "unity",
    "unreal",
    "godot",
    "blender",
    "roblox",
    "solidity",
    "metal",
    "shader",
    "database",
    "api",
    "mcp",
    "lsp",
  )) {
    return "engineer";
  }
  if (hasToken(
    "researcher",
    "analyst",
    "strategist",
    "coach",
    "navigator",
    "advisor",
    "specialist",
    "tracker",
    "synthesizer",
    "collector",
    "historian",
    "anthropologist",
    "psychologist",
    "geographer",
    "reporter",
    "evaluator",
  )) {
    return "researcher";
  }

  return "general";
}

function inferManagerAgentId(agentId, fleetIds) {
  if (agentId === "main") {
    return null;
  }

  if (PRIMARY_MANAGER_IDS.has(agentId)) {
    return fleetIds.has("main") ? "main" : null;
  }

  if (fleetIds.has("agents-orchestrator")) {
    return "agents-orchestrator";
  }

  return fleetIds.has("main") ? "main" : null;
}

function buildCapabilities(agentId) {
  if (agentId === "main") {
    return "Primary OpenClaw executive agent mirrored into Paperclip.";
  }
  if (agentId === "agents-orchestrator") {
    return "Fleet orchestrator that coordinates the mirrored OpenClaw specialist agents.";
  }
  return `Mirrored OpenClaw specialist available through the local gateway as ${agentId}.`;
}

function buildMetadata(existingMetadata, agent, syncedAt) {
  const metadata = existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
    ? { ...existingMetadata }
    : {};
  const existingOpenClaw = readNestedRecord(metadata, "openclaw");

  return {
    ...metadata,
    source: "openclaw_sync",
    openclawAgentId: agent.id,
    syncedAt,
    paperclipRuntime: FLEET_RUNTIME,
    openclaw: {
      ...existingOpenClaw,
      agentId: agent.id,
      workspace: agent.workspace ?? null,
      agentDir: agent.agentDir ?? null,
      model: agent.model ?? null,
      bindings: Number(agent.bindings ?? 0),
      isDefault: agent.isDefault === true,
      routes: Array.isArray(agent.routes) ? agent.routes : [],
    },
  };
}

function buildAdapterConfig(agentId, gatewayUrl, gatewayToken, existingAdapterConfig = null) {
  const existing =
    existingAdapterConfig && typeof existingAdapterConfig === "object" && !Array.isArray(existingAdapterConfig)
      ? existingAdapterConfig
      : {};

  const next = {
    url: gatewayUrl,
    authToken: gatewayToken,
    agentId,
    clientId: "gateway-client",
    clientMode: "backend",
    clientVersion: "sync-openclaw-fleet",
    role: "operator",
    scopes: ["operator.admin"],
    sessionKeyStrategy: "issue",
    timeoutSec: 120,
    autoPairOnFirstConnect: true,
    paperclipApiUrl: PAPERCLIP_BASE_URL,
  };

  if (typeof existing.devicePrivateKeyPem === "string" && existing.devicePrivateKeyPem.trim()) {
    next.devicePrivateKeyPem = existing.devicePrivateKeyPem;
  }

  return next;
}

function normalizeCodexModel(agent) {
  const raw = typeof agent.model === "string" ? agent.model.trim() : "";
  if (!raw) {
    return "gpt-5.4";
  }
  return raw.replace(/^openai-codex\//, "");
}

function resolveCodexTimeoutSec(agent) {
  const agentId = String(agent.id ?? "").toLowerCase();

  if (
    /(engineer|developer|architect|builder|prototyper|backend|frontend|mobile|security|database|devops|sre|firmware|mcp|lsp|api|reviewer|tester|qa|auditor|optimizer|performance|sales-engineer)/.test(
      agentId,
    )
  ) {
    return 600;
  }

  if (/(manager|orchestrator|strategist|coach|researcher|reporter|writer|designer|artist)/.test(agentId)) {
    return 300;
  }

  return 420;
}

function buildCodexBootstrapPrompt() {
  return [
    "You are {{agent.title}} ({{agent.name}}) running inside an MSX/Paperclip heartbeat.",
    "Operate as a focused specialist, not a generic assistant and not a broad orchestrator unless your handle explicitly says so.",
    "The assigned Paperclip task, issue thread, and attached project workspace are the source of truth.",
    "The imported OpenClaw home is background reference only. Do not work there unless the wake explicitly asks for it.",
    "Do not restart identity setup, reread large persona files, or do broad repo discovery before acting.",
    "When implementation work is assigned, make concrete progress in the provided workspace, verify what you can, and return a crisp handoff.",
  ].join("\\n");
}

function buildCodexLocalConfig(agent, existingAdapterConfig = null) {
  const existing =
    existingAdapterConfig && typeof existingAdapterConfig === "object" && !Array.isArray(existingAdapterConfig)
      ? existingAdapterConfig
      : {};
  const workspace = typeof agent.workspace === "string" && agent.workspace.trim()
    ? path.resolve(agent.workspace)
    : path.resolve(os.homedir(), ".openclaw", "workspace");

  return {
    cwd: workspace,
    command: "codex",
    model: normalizeCodexModel(agent),
    timeoutSec: resolveCodexTimeoutSec(agent),
    dangerouslyBypassApprovalsAndSandbox: true,
    extraArgs: ["--skip-git-repo-check"],
    bootstrapPromptTemplate: buildCodexBootstrapPrompt(),
    promptTemplate: [
      "You are running inside a Paperclip heartbeat for the imported OpenClaw agent {{agent.name}}.",
      "Prioritize the Paperclip task and wake context over generic workspace startup rituals.",
      "Start with the injected Paperclip skill and the provided wake context instead of broad discovery.",
      "If {{context.wakeReason}} is non-empty, treat it as the primary instruction for this run.",
      "If a Paperclip project workspace is attached, edit and run code there rather than in your imported OpenClaw home.",
      "Do not begin by asking who you are, following BOOTSTRAP.md, or scanning unrelated folders unless the wake explicitly requires that.",
      "If the wake contains a direct request with an exact-output requirement, satisfy it directly and exit once complete.",
      "If you are blocked, return the blocker, what you tried, and the next exact @agent-id or external dependency.",
      "",
      "Current wake reason:",
      "{{context.wakeReason}}",
    ].join("\\n"),
    ...(typeof existing.modelReasoningEffort === "string" && existing.modelReasoningEffort.trim()
      ? { modelReasoningEffort: existing.modelReasoningEffort.trim() }
      : {}),
  };
}

function resolveFleetAdapter(agent, gatewayUrl, gatewayToken, existingAgent = null) {
  const existingAdapterConfig = existingAgent?.adapterConfig ?? null;

  if (FLEET_RUNTIME === "openclaw_gateway") {
    return {
      adapterType: "openclaw_gateway",
      adapterConfig: buildAdapterConfig(agent.id, gatewayUrl, gatewayToken, existingAdapterConfig),
    };
  }

  if (FLEET_RUNTIME === "codex_local") {
    return {
      adapterType: "codex_local",
      adapterConfig: buildCodexLocalConfig(agent, existingAdapterConfig),
    };
  }

  throw new Error(
    `Unsupported PAPERCLIP_FLEET_RUNTIME=${FLEET_RUNTIME}. Use "codex_local" or "openclaw_gateway".`,
  );
}

async function requestJson(apiPath, init = {}) {
  const url = `${PAPERCLIP_BASE_URL}${apiPath}`;
  const headers = {
    accept: "application/json",
    ...(init.headers ?? {}),
  };

  let body = init.body;
  if (body !== undefined && typeof body !== "string") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${init.method ?? "GET"} ${apiPath} failed (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

async function findMirroredCompany(companies) {
  const mirrorChecks = await Promise.all(
    (Array.isArray(companies) ? companies : []).map(async (company) => {
      try {
        const agents = await requestJson(`/api/companies/${company.id}/agents`);
        const hasMirrorAgents = Array.isArray(agents)
          && agents.some((agent) => readNestedRecord(agent, "metadata").source === "openclaw_sync");
        return hasMirrorAgents ? company : null;
      } catch {
        return null;
      }
    }),
  );

  const candidates = mirrorChecks.filter(Boolean);
  return candidates.length === 1 ? candidates[0] : null;
}

function getExistingSourceKey(agent) {
  const metadata = readNestedRecord(agent, "metadata");
  const topLevel = typeof metadata.openclawAgentId === "string" ? metadata.openclawAgentId : "";
  if (topLevel) {
    return topLevel;
  }
  const nested = readNestedRecord(metadata, "openclaw");
  if (typeof nested.agentId === "string" && nested.agentId.trim()) {
    return nested.agentId.trim();
  }
  return typeof agent.name === "string" ? agent.name : "";
}

async function ensureCompany() {
  const companies = await requestJson("/api/companies");
  const explicitCompanyId = process.env.PAPERCLIP_COMPANY_ID?.trim();

  if (explicitCompanyId) {
    const explicitMatch = Array.isArray(companies)
      ? companies.find((company) => company.id === explicitCompanyId)
      : null;
    if (!explicitMatch) {
      throw new Error(`PAPERCLIP_COMPANY_ID=${explicitCompanyId} did not match an existing company.`);
    }
    log(`Using explicit company ${explicitMatch.name} (${explicitMatch.id}).`);
    return explicitMatch;
  }

  const existing = Array.isArray(companies)
    ? companies.find((company) => company.name === COMPANY_NAME)
    : null;

  if (existing) {
    log(`Using existing company "${COMPANY_NAME}" (${existing.id}).`);
    return existing;
  }

  const mirrored = await findMirroredCompany(companies);
  if (mirrored) {
    log(`Using existing mirrored company "${mirrored.name}" (${mirrored.id}).`);
    return mirrored;
  }

  const created = await requestJson("/api/companies", {
    method: "POST",
    body: {
      name: COMPANY_NAME,
      description: COMPANY_DESCRIPTION,
      budgetMonthlyCents: 0,
    },
  });
  log(`Created company "${COMPANY_NAME}" (${created.id}).`);
  return created;
}

async function syncFleet() {
  if (!existsSync(OPENCLAW_CONFIG_PATH)) {
    throw new Error(`OpenClaw config not found: ${OPENCLAW_CONFIG_PATH}`);
  }

  const openclawConfig = await readJson(OPENCLAW_CONFIG_PATH);
  const gatewayUrl = inferGatewayUrl(openclawConfig);
  const gatewayToken = await resolveGatewayToken(openclawConfig);
  const syncedAt = new Date().toISOString();
  const cliAgents = loadOpenClawAgentsFromCli();
  const rawAgents = cliAgents ?? loadOpenClawAgentsFromConfig(openclawConfig);
  const fleet = sortFleet(dedupeAgents(rawAgents));
  const fleetIds = new Set(fleet.map((agent) => agent.id));

  if (fleet.length === 0) {
    throw new Error("No OpenClaw agents were found to sync.");
  }

  log(`Discovered ${fleet.length} OpenClaw agents.`);
  log(`Using Paperclip fleet runtime: ${FLEET_RUNTIME}`);
  const company = await ensureCompany();
  const existingAgents = await requestJson(`/api/companies/${company.id}/agents`);
  const existingBySourceKey = new Map(
    (Array.isArray(existingAgents) ? existingAgents : [])
      .map((agent) => [getExistingSourceKey(agent), agent])
      .filter(([key]) => Boolean(key)),
  );

  const paperclipIdByOpenClawId = new Map();
  let createdCount = 0;
  let updatedCount = 0;
  let permissionUpdates = 0;

  for (const agent of fleet) {
    const existing = existingBySourceKey.get(agent.id) ?? null;
    const role = inferRole(agent.id);
    const canCreateAgents = agent.id === "main" || agent.id === "agents-orchestrator";
    const adapter = resolveFleetAdapter(agent, gatewayUrl, gatewayToken, existing);
    const payload = {
      name: agent.id,
      title: humanizeAgentId(agent.id),
      role,
      reportsTo: null,
      capabilities: buildCapabilities(agent.id),
      adapterType: adapter.adapterType,
      adapterConfig: adapter.adapterConfig,
      runtimeConfig: {},
      budgetMonthlyCents: 0,
      metadata: buildMetadata(existing?.metadata, agent, syncedAt),
    };

    if (existing) {
      const updated = await requestJson(`/api/agents/${existing.id}`, {
        method: "PATCH",
        body: {
          ...payload,
          replaceAdapterConfig: true,
        },
      });
      paperclipIdByOpenClawId.set(agent.id, updated.id);
      updatedCount += 1;
    } else {
      const created = await requestJson(`/api/companies/${company.id}/agents`, {
        method: "POST",
        body: {
          ...payload,
          permissions: {
            canCreateAgents,
          },
        },
      });
      paperclipIdByOpenClawId.set(agent.id, created.id);
      createdCount += 1;
    }

    if (canCreateAgents) {
      await requestJson(`/api/agents/${paperclipIdByOpenClawId.get(agent.id)}/permissions`, {
        method: "PATCH",
        body: {
          canCreateAgents: true,
          canAssignTasks: true,
        },
      });
      permissionUpdates += 1;
    }
  }

  let relationshipUpdates = 0;

  for (const agent of fleet) {
    const paperclipId = paperclipIdByOpenClawId.get(agent.id);
    if (!paperclipId) {
      continue;
    }
    const managerOpenClawId = inferManagerAgentId(agent.id, fleetIds);
    const managerPaperclipId = managerOpenClawId ? paperclipIdByOpenClawId.get(managerOpenClawId) ?? null : null;

    await requestJson(`/api/agents/${paperclipId}`, {
      method: "PATCH",
      body: {
        reportsTo: managerPaperclipId,
      },
    });
    relationshipUpdates += 1;
  }

  const finalAgents = await requestJson(`/api/companies/${company.id}/agents`);
  const org = await requestJson(`/api/companies/${company.id}/org`);
  const environmentCheck = await requestJson(
    `/api/companies/${company.id}/adapters/${FLEET_RUNTIME}/test-environment`,
    {
      method: "POST",
      body: {
        adapterConfig:
          FLEET_RUNTIME === "openclaw_gateway"
            ? buildAdapterConfig("main", gatewayUrl, gatewayToken)
            : buildCodexLocalConfig(
                { id: "main", workspace: path.resolve(os.homedir(), ".openclaw", "workspace"), model: "gpt-5.4" },
                null,
              ),
      },
    },
  );

  const summary = {
    companyId: company.id,
    companyName: company.name,
    runtime: FLEET_RUNTIME,
    syncedAt,
    discoveredAgents: fleet.length,
    createdCount,
    updatedCount,
    permissionUpdates,
    relationshipUpdates,
    finalAgentCount: Array.isArray(finalAgents) ? finalAgents.length : 0,
    orgRootCount: Array.isArray(org) ? org.length : 0,
    environmentCheckStatus: environmentCheck?.status ?? "unknown",
  };

  log(`Sync complete: ${JSON.stringify(summary)}`);
  return summary;
}

syncFleet().catch((error) => {
  console.error(
    `[sync-openclaw-fleet] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
