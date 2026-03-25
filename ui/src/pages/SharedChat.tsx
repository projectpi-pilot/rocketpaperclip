import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, MessageSquareText, RefreshCcw, Send, Tags, UserRound, Bot, AlertTriangle } from "lucide-react";
import type { Agent, HeartbeatRun, Issue, Project } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { cn, issueUrl, projectUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { Link } from "@/lib/router";

type RoomMessageRole = "operator" | "agent" | "system";

type RoomMessage = {
  id: string;
  role: RoomMessageRole;
  text: string;
  timestamp: string;
  state?: "pending" | "done" | "error";
  agentId?: string;
  mentions?: string[];
  route?: "mentions" | "fallback";
  runId?: string;
};

type StoredRoomState = {
  messages: RoomMessage[];
  updatedAt: string | null;
  activeProjectId?: string | null;
  activeIssueId?: string | null;
  lastClearedAt?: string | null;
};

type MentionResolution = {
  requested: Agent[];
  unknown: string[];
  resolvedAliases: Array<{ input: string; resolved: string }>;
};

const DEFAULT_FALLBACK_AGENT = "agents-orchestrator";
const MAX_ROOM_MESSAGES = 120;
const RUN_POLL_INTERVAL_MS = 800;
const RUN_TIMEOUT_MS = 240_000;
const LIVE_PROGRESS_POLL_INTERVAL_MS = 2000;
const INLINE_MENTION_LIMIT = 8;
const TRANSCRIPT_MESSAGE_LIMIT = 6;
const MAX_ORCHESTRATION_ROUNDS = 8;
const MAX_AGENT_ATTEMPTS_PER_TURN = 3;
const OPEN_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const FIVE_MINUTE_MVP_OBJECTIVE =
  "Ship the thinnest working MVP in 5 minutes or less, then improve from the live baseline.";
const PRE_REVENUE_OBJECTIVE =
  "Keep the project moving past the first build until launch motion, virality, and the first revenue signal are in place.";

function roomStorageKey(companyId: string) {
  return `paperclip.shared-room.${companyId}`;
}

function buildMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readRoomState(companyId: string): StoredRoomState {
  if (typeof window === "undefined") {
    return { messages: [], updatedAt: null };
  }

  try {
    const raw = window.localStorage.getItem(roomStorageKey(companyId));
    if (!raw) {
      return { messages: [], updatedAt: null };
    }
    const parsed = JSON.parse(raw) as Partial<StoredRoomState>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      activeProjectId: typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : null,
      activeIssueId: typeof parsed.activeIssueId === "string" ? parsed.activeIssueId : null,
      lastClearedAt: typeof parsed.lastClearedAt === "string" ? parsed.lastClearedAt : null,
    };
  } catch {
    return { messages: [], updatedAt: null };
  }
}

function writeRoomState(companyId: string, state: StoredRoomState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(roomStorageKey(companyId), JSON.stringify(state));
}

function tokenizeAgentHandle(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function findFuzzyAgentMatch(token: string, agents: Agent[]) {
  const tokenParts = tokenizeAgentHandle(token);
  if (tokenParts.length < 2) return null;

  let best: { agent: Agent; score: number } | null = null;
  for (const agent of agents) {
    const agentParts = tokenizeAgentHandle(agent.name);
    if (agentParts.length === 0) continue;

    const overlap = tokenParts.filter((part) => agentParts.includes(part)).length;
    if (overlap === 0) continue;

    const union = new Set([...tokenParts, ...agentParts]).size;
    const score = overlap / union;
    const sameSet = overlap === tokenParts.length && overlap === agentParts.length;
    const acceptable = sameSet || (overlap >= 2 && score >= 0.5);
    if (!acceptable) continue;

    if (!best || score > best.score) {
      best = { agent, score };
    }
  }

  return best?.agent ?? null;
}

function normalizeAgentMentions(message: string, agents: Agent[]) {
  if (!message) {
    return { text: message, resolvedAliases: [] as Array<{ input: string; resolved: string }> };
  }

  const byName = new Map(agents.map((agent) => [agent.name.toLowerCase(), agent]));
  const seen = new Set<string>();
  const resolvedAliases: Array<{ input: string; resolved: string }> = [];

  const text = message.replace(/@([a-z0-9][a-z0-9-_]*)/gi, (fullMatch, rawToken: string) => {
    const token = rawToken.toLowerCase();
    const exact = byName.get(token);
    if (exact) {
      return `@${exact.name}`;
    }

    const fuzzy = findFuzzyAgentMatch(token, agents);
    if (!fuzzy) {
      return fullMatch;
    }

    const resolutionKey = `${token}->${fuzzy.name.toLowerCase()}`;
    if (!seen.has(resolutionKey)) {
      seen.add(resolutionKey);
      resolvedAliases.push({ input: token, resolved: fuzzy.name });
    }

    return `@${fuzzy.name}`;
  });

  return { text, resolvedAliases };
}

function parseMentions(message: string, agents: Agent[]): MentionResolution {
  const byName = new Map(agents.map((agent) => [agent.name.toLowerCase(), agent]));
  const matches = message.matchAll(/@([a-z0-9][a-z0-9-_]*)/gi);
  const requested: Agent[] = [];
  const unknown: string[] = [];
  const resolvedAliases: Array<{ input: string; resolved: string }> = [];
  const seen = new Set<string>();
  const seenResolved = new Set<string>();

  for (const match of matches) {
    const token = match[1].toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);

    const agent = byName.get(token);
    if (agent) {
      requested.push(agent);
      seenResolved.add(agent.name.toLowerCase());
      continue;
    }

    const fuzzyMatch = findFuzzyAgentMatch(token, agents);
    if (fuzzyMatch) {
      if (!seenResolved.has(fuzzyMatch.name.toLowerCase())) {
        requested.push(fuzzyMatch);
        seenResolved.add(fuzzyMatch.name.toLowerCase());
      }
      resolvedAliases.push({ input: token, resolved: fuzzyMatch.name });
    } else {
      unknown.push(token);
    }
  }

  return { requested, unknown, resolvedAliases };
}

function getMentionContext(message: string, cursorPosition: number) {
  const cursor = Math.max(0, Math.min(cursorPosition, message.length));
  const beforeCursor = message.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9-_]*)$/i);
  if (!match) {
    return null;
  }

  const query = match[2] ?? "";

  return {
    query,
    start: cursor - query.length - 1,
    end: cursor,
  };
}

function formatTranscript(messages: RoomMessage[], limit = 10) {
  return messages
    .filter((message) => message.state !== "pending")
    .slice(-limit)
    .map((message) => {
      const speaker =
        message.role === "operator"
          ? "operator"
          : message.role === "agent"
            ? message.agentId || "agent"
            : "system";
      return `${speaker}: ${message.text}`;
    })
    .join("\n");
}

function stripMentions(value: string) {
  return value.replace(/@([a-z0-9][a-z0-9-_]*)/gi, "").replace(/\s+/g, " ").trim();
}

function looksLikeStatusFollowUp(message: string) {
  const normalized = stripMentions(message).toLowerCase();
  if (!normalized) return false;

  return (
    /^(is|are|was|were|where|what|when|why|how|so|ok|okay|status|did|does|do|can|could|should|it|we)\b/.test(
      normalized,
    ) ||
    /\b(where is|is the|are we|did we|what happened|deployment status|is it deployed|is the product deployed)\b/.test(
      normalized,
    )
  );
}

function looksLikeBuildIntent(message: string) {
  const normalized = stripMentions(message).toLowerCase();
  if (!normalized || looksLikeStatusFollowUp(message)) return false;

  const explicitIntent =
    /(^|\b)(build|create|make|launch|ship|prototype|scaffold|start|spin up|kick off|turn into)\b/.test(normalized);
  const productIntent =
    /\b(mvp|new app|new site|new dashboard|new product|new platform|new tool|app for|site for|dashboard for|product for|platform for|tool for)\b/.test(
      normalized,
    );

  return explicitIntent || productIntent;
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveProjectNameFromMessage(message: string) {
  const stripped = stripMentions(message)
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
    .replace(/^(please\s+)?(help me\s+)?(build|create|make|launch|ship)\s+/i, "")
    .replace(/^(an?\s+|the\s+)/i, "");

  const primaryClause = stripped.split(/[.!?\n]/)[0]?.trim() ?? "";
  const compact = primaryClause
    .replace(/\b(for|with|using|that|which|where)\b.*$/i, "")
    .trim();
  const words = compact.split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) {
    return "New Project";
  }
  return toTitleCase(words.join(" "));
}

function findPreferredAgent(agents: Agent[] | undefined, preferredNames: string[]) {
  if (!agents?.length) return null;
  for (const name of preferredNames) {
    const match = agents.find((agent) => agent.name === name);
    if (match) return match;
  }
  return null;
}

function buildProjectContextSummary(project: Project | null, issues: Issue[]) {
  if (!project) return null;

  const openIssues = issues.filter((issue) => OPEN_ISSUE_STATUSES.has(issue.status));
  const doneIssues = issues.filter((issue) => issue.status === "done");
  const openLanes = openIssues
    .slice(0, 4)
    .map((issue) => `- [${issue.status}] ${issue.title}`)
    .join("\n");

  return [
    `Active project: ${project.name}`,
    `Project status: ${project.status}`,
    `First ship rule: ${FIVE_MINUTE_MVP_OBJECTIVE}`,
    `Operating objective: ${PRE_REVENUE_OBJECTIVE}`,
    `Task counts: ${openIssues.length} open, ${doneIssues.length} done, ${issues.length} total.`,
    openLanes
      ? `Open project lanes:\n${openLanes}`
      : "No open project lanes remain. If the product is already built, create the next launch, virality, or revenue task instead of stopping.",
  ].join("\n");
}

function extractDelegatedAgents(reply: string, currentAgentName: string, agents: Agent[]) {
  return parseMentions(reply, agents).requested.filter((candidate) => candidate.name !== currentAgentName);
}

function hasBlockerSignal(reply: string) {
  const normalized = reply.toLowerCase();
  return [
    "blocker",
    "blocked",
    "waiting on",
    "missing",
    "still need",
    "needs ",
    "need ",
    "pending ",
    "handoff",
    "qa next",
    "before qa",
    "can't continue",
    "cannot continue",
  ].some((token) => normalized.includes(token));
}

function buildPrompt(
  agentId: string,
  message: string,
  transcript: string,
  mentions: string[],
  options?: {
    taggedBy?: string;
    operatorMessage?: string;
    handoffMessage?: string;
    routingGuide?: string;
    projectContext?: string | null;
  },
) {
  const tagged = mentions.length ? mentions.map((entry) => `@${entry}`).join(", ") : "none";

  if (agentId === DEFAULT_FALLBACK_AGENT && !options?.taggedBy) {
    return [
      "You are agents-orchestrator inside a shared operator room in MSX.",
      "When no agent is explicitly tagged, act as the conductor and keep ownership until the project is shipped, launched, and has reached first revenue or hit a true external blocker.",
      "First priority: get a deployed or previewable MVP live in 5 minutes or less.",
      "Ruthlessly cut scope to the thinnest working slice if the request is bigger than that window.",
      "Do the fastest shippable version first, then route follow-up improvements after something real is live.",
      "All digital products must clear a design bar, not just a functional bar.",
      "If a build works but the interface still feels rough, route the right UI/UX specialist and use the installed /superdesign workflow before calling it shipped.",
      "Do not treat 'built', 'implemented', or 'runnable' as the finish line.",
      "After the product works, continue project operations: launch prep, analytics, positioning, virality, distribution, pricing, conversion, follow-up, and monetization.",
      "For real product implementation, prefer hands-on engineering agents for code delivery before design-only agents.",
      "For mobile or Expo app code work, favor exact registered handles like @rapid-prototyper, @frontend-developer, @senior-developer, and @software-architect before @mobile-app-builder unless the task is explicitly mobile UX or UI design.",
      "If a specialist should speak next, mention them with an exact registered @agent-id in your reply.",
      "Do not ask the operator to manually remove blockers if another registered agent can solve them.",
      "If a deliverable is incomplete, you may re-tag the same agent or a different exact registered @agent-id to unblock it.",
      "Only surface a blocker to the operator if it requires a true external dependency outside the room.",
      "Never invent, rename, camel-case, or paraphrase agent handles.",
      "Stay concise and action-oriented.",
      options?.routingGuide ? `Routing guide:\n${options.routingGuide}` : "",
      "",
      `Tagged agents this turn: ${tagged}`,
      "Recent room transcript:",
      transcript || "No prior room history.",
      options?.projectContext ? `\nLive project context:\n${options.projectContext}` : "",
      "",
      "Latest operator message:",
      message,
    ].join("\n");
  }

  if (options?.taggedBy) {
    return [
      `You are ${agentId}, replying inside a shared operator room in MSX.`,
      `You were tagged by @${options.taggedBy} to handle this request.`,
      "Reply directly to the operator with the concrete deliverable they need.",
      "Assume the room expects a 5-minute MVP ship window for the first slice.",
      "If the requested scope is too large, cut it to the smallest working and previewable version you can complete first.",
      "If you touch a digital product UI, leave it with a coherent visual system and a clean preview that can be refined further with /superdesign and the local Superdesign CLI.",
      "Stay within your specialty and do not restart onboarding or identity setup.",
      "If you are blocked by another specialty inside the room, mention the exact registered @agent-id that should take the next step.",
      "If you finished your slice, return a clean implementation handoff or completion note.",
      "",
      `Tagged agents this turn: ${tagged}`,
      "Recent room transcript:",
      transcript || "No prior room history.",
      options?.projectContext ? `\nLive project context:\n${options.projectContext}` : "",
      "",
      "Original operator request:",
      options.operatorMessage || message,
      "",
      `Handoff note from @${options.taggedBy}:`,
      options.handoffMessage || message,
      "",
      "If your slice is done but the project is still pre-revenue, mention the next exact registered @agent-id needed for launch, virality, analytics, growth, sales, or monetization.",
    ].join("\n");
  }

  return [
    `You are ${agentId}, replying inside a shared operator room in MSX.`,
    "You were explicitly tagged by the operator.",
    "Default to the thinnest shippable MVP slice first, ideally something that can be previewed or deployed in 5 minutes or less.",
    "If the work is a digital product, make the shipped slice visually intentional, not just functional, and leave a preview ready for /superdesign by default.",
    "Reply only as yourself and stay within your specialty.",
    "Do not start with identity/bootstrap setup.",
    "",
    `Tagged agents this turn: ${tagged}`,
    "Recent room transcript:",
    transcript || "No prior room history.",
    options?.projectContext ? `\nLive project context:\n${options.projectContext}` : "",
    "",
    "Latest operator message:",
    message,
  ].join("\n");
}

function extractRunReply(run: HeartbeatRun) {
  const stdout = typeof run.resultJson?.stdout === "string" ? run.resultJson.stdout : "";
  if (!stdout) return "";

  const parts: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; text?: string };
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
        parts.push(parsed.item.text.trim());
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return parts.join("\n\n").trim();
}

function extractLiveProgress(logContent: string) {
  if (!logContent) return null;

  let latestAgentMessage: string | null = null;
  let latestTodo: string | null = null;

  for (const outerLine of logContent.split("\n")) {
    const trimmedOuter = outerLine.trim();
    if (!trimmedOuter) continue;

    let outerChunk = "";
    try {
      const parsedOuter = JSON.parse(trimmedOuter) as { chunk?: unknown };
      outerChunk = typeof parsedOuter.chunk === "string" ? parsedOuter.chunk : "";
    } catch {
      continue;
    }
    if (!outerChunk) continue;

    for (const innerLine of outerChunk.split("\n")) {
      const trimmedInner = innerLine.trim();
      if (!trimmedInner) continue;

      try {
        const parsedInner = JSON.parse(trimmedInner) as {
          type?: string;
          item?: {
            type?: string;
            text?: string;
            items?: Array<{ text?: string; completed?: boolean }>;
          };
        };

        if (
          parsedInner.type === "item.completed" &&
          parsedInner.item?.type === "agent_message" &&
          parsedInner.item.text
        ) {
          latestAgentMessage = parsedInner.item.text.trim();
          continue;
        }

        if (
          parsedInner.type === "item.completed" &&
          parsedInner.item?.type === "todo_list" &&
          Array.isArray(parsedInner.item.items)
        ) {
          const nextIncomplete = parsedInner.item.items.find((entry) => entry.completed !== true && entry.text?.trim());
          if (nextIncomplete?.text) {
            latestTodo = `In progress: ${nextIncomplete.text.trim()}`;
          }
        }
      } catch {
        // Ignore malformed transcript rows.
      }
    }
  }

  return latestAgentMessage ?? latestTodo;
}

function extractWakeReason(run: HeartbeatRun) {
  const snapshot = run.contextSnapshot as { wakeReason?: string } | null;
  return typeof snapshot?.wakeReason === "string" ? snapshot.wakeReason : "";
}

function extractPromptSection(source: string, label: string) {
  const marker = `${label}:\n`;
  const markerIndex = source.lastIndexOf(marker);
  if (markerIndex < 0) return null;

  const trailing = source.slice(markerIndex + marker.length);
  const nextHeaderMatch = trailing.match(
    /\n\n(?:Handoff note from @|If your slice is done|Latest operator message:|Original operator request:|Live (?:company|project) context:|Tagged agents this turn:)/,
  );
  const value = (nextHeaderMatch ? trailing.slice(0, nextHeaderMatch.index) : trailing).trim();
  return value || null;
}

function extractOperatorPrompt(run: HeartbeatRun) {
  const wakeReason = extractWakeReason(run);
  if (!wakeReason) return null;

  return (
    extractPromptSection(wakeReason, "Latest operator message") ??
    extractPromptSection(wakeReason, "Original operator request")
  );
}

function buildRestoredRoomMessages(runs: HeartbeatRun[], agents: Agent[]) {
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const recentRuns = [...runs]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(-8);

  const restoredMessages: RoomMessage[] = [];
  let lastOperatorText = "";

  for (const run of recentRuns) {
    const timestamp = new Date(run.createdAt).toISOString();
    const operatorText = extractOperatorPrompt(run);
    if (operatorText && operatorText !== lastOperatorText) {
      restoredMessages.push({
        id: buildMessageId("restore-operator"),
        role: "operator",
        text: operatorText,
        timestamp,
        state: "done",
      });
      lastOperatorText = operatorText;
    }

    const agentName = agentNameById.get(run.agentId) ?? "agent";
    if (run.status === "queued" || run.status === "running") {
      restoredMessages.push({
        id: buildMessageId("restore-agent"),
        role: "agent",
        agentId: agentName,
        text: "Still working on the latest handoff…",
        timestamp,
        state: "pending",
        runId: run.id,
      });
      continue;
    }

    if (run.status !== "succeeded") {
      restoredMessages.push({
        id: buildMessageId("restore-agent"),
        role: "agent",
        agentId: agentName,
        text: `${agentName}: ${run.error || `run ended with status ${run.status}`}.`,
        timestamp,
        state: "error",
        runId: run.id,
      });
      continue;
    }

    const reply = extractRunReply(run);
    if (!reply) {
      continue;
    }

    const normalizedReply = normalizeAgentMentions(reply, agents);
    restoredMessages.push({
      id: buildMessageId("restore-agent"),
      role: "agent",
      agentId: agentName,
      text: normalizedReply.text,
      timestamp,
      state: "done",
      runId: run.id,
      mentions: extractDelegatedAgents(normalizedReply.text, agentName, agents).map((agent) => agent.name),
    });
  }

  return restoredMessages;
}

function findMatchingPendingRun(
  message: RoomMessage,
  runs: HeartbeatRun[],
  agentNameById: Map<string, string>,
) {
  if (message.state !== "pending" || !message.agentId) return null;

  const pendingTimestamp = new Date(message.timestamp).getTime();
  return [...runs]
    .filter(
      (run) =>
        agentNameById.get(run.agentId) === message.agentId &&
        new Date(run.createdAt).getTime() >= pendingTimestamp - 5_000,
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;
}

async function waitForRun(runId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RUN_TIMEOUT_MS) {
    const run = await heartbeatsApi.get(runId);
    if (run.status !== "queued" && run.status !== "running") {
      return run;
    }
    await new Promise((resolve) => window.setTimeout(resolve, RUN_POLL_INTERVAL_MS));
  }

  throw new Error(`Run ${runId} timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s.`);
}

function MentionTray({
  agents,
  filter,
  onFilterChange,
  onMentionClick,
}: {
  agents: Agent[];
  filter: string;
  onFilterChange: (value: string) => void;
  onMentionClick: (agentId: string) => void;
}) {
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return agents.slice(0, 48);
    return agents
      .filter((agent) =>
        [agent.name, agent.title ?? "", agent.role].some((value) => value.toLowerCase().includes(query)),
      )
      .slice(0, 48);
  }, [agents, filter]);

  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="h-4 w-4" />
          Tag agents
        </CardTitle>
        <CardDescription>Insert an <code>@agent-id</code> tag into the room composer.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="space-y-3">
          <Input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter agents"
          />
          <ScrollArea className="h-[28rem] rounded-md border border-border">
            <div className="space-y-2 p-3">
              {filtered.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No agents match this filter.
                </div>
              ) : (
                filtered.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onMentionClick(agent.name)}
                    className="flex w-full items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">@{agent.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {agent.title ?? agent.role}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {agent.role}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function isSkippedWakeRoomMessage(message: RoomMessage) {
  return (
    message.role === "system" &&
    typeof message.text === "string" &&
    message.text.includes("wakeup was skipped by MSX policy")
  );
}

function resolveDispatchScope({
  agent,
  activeIssue,
  issueId,
  projectId,
}: {
  agent: Agent;
  activeIssue: Issue | null;
  issueId?: string | null;
  projectId?: string | null;
}) {
  const resolvedProjectId = projectId ?? activeIssue?.projectId ?? null;

  if (!issueId || !activeIssue) {
    return {
      issueId: null,
      projectId: resolvedProjectId,
      scopeLabel: resolvedProjectId ? "project" : "room",
    };
  }

  if (activeIssue.assigneeAgentId === agent.id) {
    return {
      issueId,
      projectId: resolvedProjectId,
      scopeLabel: "issue",
    };
  }

  return {
    issueId: null,
    projectId: resolvedProjectId,
    scopeLabel: resolvedProjectId ? "project" : "room",
  };
}

export function SharedChat() {
  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [room, setRoom] = useState<StoredRoomState>({ messages: [], updatedAt: null });
  const [messageInput, setMessageInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [fallbackAgent, setFallbackAgent] = useState(DEFAULT_FALLBACK_AGENT);
  const [status, setStatus] = useState("Room ready.");
  const [isSending, setIsSending] = useState(false);
  const [roomHydrated, setRoomHydrated] = useState(false);
  const [runProgressById, setRunProgressById] = useState<Map<string, string>>(new Map());
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: companyIssues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const activeProject = useMemo(
    () => projects.find((project) => project.id === room.activeProjectId) ?? null,
    [projects, room.activeProjectId],
  );
  const { data: activeProjectIssues = [] } = useQuery({
    queryKey: queryKeys.issues.listByProject(selectedCompanyId ?? "__none__", room.activeProjectId ?? "__none__"),
    queryFn: () => issuesApi.list(selectedCompanyId!, { projectId: room.activeProjectId! }),
    enabled: !!selectedCompanyId && !!room.activeProjectId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Shared Chat" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setRoomHydrated(false);
    const nextRoom = readRoomState(selectedCompanyId);
    setRoom(nextRoom);
    setRoomHydrated(true);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || !roomHydrated) return;
    writeRoomState(selectedCompanyId, room);
  }, [room, roomHydrated, selectedCompanyId]);

  useEffect(() => {
    if (!room.activeProjectId) return;
    if (projects.length === 0) return;
    if (projects.some((project) => project.id === room.activeProjectId)) return;
    setRoom((current) => ({ ...current, activeProjectId: null, activeIssueId: null, updatedAt: new Date().toISOString() }));
  }, [projects, room.activeProjectId]);

  const hasPendingMessages = room.messages.some((message) => message.state === "pending");
  const { data: roomRuns = [] } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 24),
    enabled: !!selectedCompanyId,
    refetchInterval: hasPendingMessages ? 3000 : false,
  });

  useEffect(() => {
    if (!hasPendingMessages || !agents?.length) {
      setRunProgressById(new Map());
      return;
    }

    const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
    const activeRuns = room.messages
      .map((message) => findMatchingPendingRun(message, roomRuns, agentNameById))
      .filter((run): run is HeartbeatRun => run !== null && (run.status === "queued" || run.status === "running"));

    if (activeRuns.length === 0) {
      setRunProgressById(new Map());
      return;
    }

    let cancelled = false;

    const readProgress = async () => {
      const updates = await Promise.all(
        activeRuns.map(async (run) => {
          try {
            const result = await heartbeatsApi.log(run.id, 0, 96_000);
            return [run.id, extractLiveProgress(result.content)] as const;
          } catch {
            return [run.id, null] as const;
          }
        }),
      );

      if (cancelled) return;

      setRunProgressById(() => {
        const next = new Map<string, string>();
        for (const [runId, progress] of updates) {
          if (progress) {
            next.set(runId, progress);
          }
        }
        return next;
      });
    };

    void readProgress();
    const timer = window.setInterval(() => {
      void readProgress();
    }, LIVE_PROGRESS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agents, hasPendingMessages, room.messages, roomRuns]);

  useEffect(() => {
    if (!selectedCompanyId || !roomHydrated || !agents?.length) return;
    if (room.messages.length > 0) return;
    if (projects.length === 0 && roomRuns.length === 0) return;

    const clearedAt = room.lastClearedAt ? new Date(room.lastClearedAt).getTime() : 0;
    const restorableRuns = roomRuns.filter((run) => new Date(run.createdAt).getTime() > clearedAt);
    const restoredProject =
      room.activeProjectId && projects.some((project) => project.id === room.activeProjectId)
        ? (projects.find((project) => project.id === room.activeProjectId) ?? null)
        : [...projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null;
    const restoredProjectIssues = restoredProject
      ? companyIssues.filter((issue) => issue.projectId === restoredProject.id)
      : [];
    const restoredIssue =
      restoredProjectIssues.length > 0
        ? [...restoredProjectIssues].sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
          )[0]
        : null;
    const restoredMessages = buildRestoredRoomMessages(restorableRuns, agents);

    if (restoredMessages.length === 0 && !restoredProject) return;

    const seededMessages =
      restoredMessages.length > 0
        ? restoredMessages
        : [
            {
              id: buildMessageId("restore-system"),
              role: "system" as const,
              text: restoredProject
                ? `Recovered the latest project context for ${restoredProject.name}. The room is ready to continue from the current task state.`
                : "Recovered the latest project context from backend activity.",
              timestamp: new Date().toISOString(),
              state: "done" as const,
            },
          ];

    setRoom((current) => {
      if (current.messages.length > 0) return current;
      return {
        ...current,
        messages: seededMessages,
        updatedAt: new Date().toISOString(),
        activeProjectId: restoredProject?.id ?? current.activeProjectId ?? null,
        activeIssueId: restoredIssue?.id ?? current.activeIssueId ?? null,
      };
    });
    setStatus(
      restoredProject
        ? `Recovered ${restoredProject.name} from backend activity.`
        : "Recovered recent room activity from backend.",
    );
  }, [
    agents,
    companyIssues,
    projects,
    room.activeProjectId,
    room.lastClearedAt,
    room.messages.length,
    roomHydrated,
    roomRuns,
    selectedCompanyId,
  ]);

  useEffect(() => {
    if (room.activeProjectId) return;
    if (projects.length === 0) return;
    if (room.messages.length === 0) return;

    const latestProject = [...projects].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0];
    if (!latestProject) return;

    setRoom((current) => {
      if (current.activeProjectId) return current;
      return {
        ...current,
        activeProjectId: latestProject.id,
        updatedAt: new Date().toISOString(),
      };
    });
    setStatus(`Restored project context: ${latestProject.name}.`);
  }, [projects, room.activeProjectId, room.messages.length]);

  useEffect(() => {
    if (!room.activeProjectId || room.activeIssueId || activeProjectIssues.length === 0) return;

    const latestIssue = [...activeProjectIssues].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0];
    if (!latestIssue) return;

    setRoom((current) => {
      if (current.activeIssueId) return current;
      return {
        ...current,
        activeIssueId: latestIssue.id,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [activeProjectIssues, room.activeIssueId, room.activeProjectId]);

  useEffect(() => {
    if (!selectedCompanyId || !roomHydrated || !hasPendingMessages) return;

    const timer = window.setInterval(() => {
      const nextRoom = readRoomState(selectedCompanyId);
      if (nextRoom.updatedAt && nextRoom.updatedAt !== room.updatedAt) {
        setRoom(nextRoom);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasPendingMessages, room.updatedAt, roomHydrated, selectedCompanyId]);

  useEffect(() => {
    if (!hasPendingMessages || !agents?.length) return;

    const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
    let changed = false;

    const nextMessages = room.messages.map((message) => {
      if (message.state !== "pending" || !message.agentId) return message;

      const matchingRun = findMatchingPendingRun(message, roomRuns, agentNameById);

      if (!matchingRun) {
        if (Date.now() - new Date(message.timestamp).getTime() < RUN_TIMEOUT_MS + 15_000) {
          return message;
        }

        changed = true;
        return {
          ...message,
          text: `${message.agentId}: Timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s.`,
          state: "error" as const,
        };
      }

      if (matchingRun.status === "queued" || matchingRun.status === "running") {
        const liveProgress = runProgressById.get(matchingRun.id);
        if (message.runId !== matchingRun.id || (liveProgress && liveProgress !== message.text)) {
          changed = true;
          return {
            ...message,
            runId: matchingRun.id,
            text: liveProgress ?? message.text,
          };
        }
        return message;
      }

      changed = true;
      if (matchingRun.status !== "succeeded") {
        return {
          ...message,
          text: `${message.agentId}: ${matchingRun.error || `run ended with status ${matchingRun.status}`}.`,
          state: "error" as const,
          runId: matchingRun.id,
        };
      }

      const rawReply = extractRunReply(matchingRun);
      const normalizedReply = normalizeAgentMentions(rawReply, agents);
      const delegatedAgents = extractDelegatedAgents(normalizedReply.text, message.agentId, agents);

      return {
        ...message,
        text:
          normalizedReply.text ||
          `@${message.agentId} completed the run but did not emit a final room summary. Open the task or preview to inspect the latest output.`,
        state: "done" as const,
        runId: matchingRun.id,
        mentions: delegatedAgents.map((agent) => agent.name),
      };
    });

    if (!changed) return;

    commitRoom(nextMessages);
  }, [agents, hasPendingMessages, room.messages, roomRuns, runProgressById]);

  useEffect(() => {
    const availableNames = new Set((agents ?? []).map((agent) => agent.name));
    if (!availableNames.size) return;
    if (!availableNames.has(fallbackAgent)) {
      setFallbackAgent(availableNames.has(DEFAULT_FALLBACK_AGENT) ? DEFAULT_FALLBACK_AGENT : (agents?.[0]?.name ?? DEFAULT_FALLBACK_AGENT));
    }
  }, [agents, fallbackAgent]);

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector("[data-slot='scroll-area-viewport']") as HTMLDivElement | null;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [room.messages.length]);

  const fallbackOptions = agents ?? [];
  const mentionContext = useMemo(
    () => getMentionContext(messageInput, cursorPosition),
    [cursorPosition, messageInput],
  );
  const inlineMentionSuggestions = useMemo(() => {
    if (!agents?.length || !mentionContext) return [];
    const query = mentionContext.query.trim().toLowerCase();
    const matches = [...agents].filter((agent) => {
      const fields = [agent.name, agent.title ?? "", agent.role].map((value) => value.toLowerCase());
      if (!query) return true;
      return fields.some((value) => value.includes(query));
    });

    return matches
      .sort((left, right) => {
        const leftStarts = left.name.toLowerCase().startsWith(query) ? 0 : 1;
        const rightStarts = right.name.toLowerCase().startsWith(query) ? 0 : 1;
        if (leftStarts !== rightStarts) return leftStarts - rightStarts;
        return left.name.localeCompare(right.name);
      })
      .slice(0, INLINE_MENTION_LIMIT);
  }, [agents, mentionContext]);
  const detectedMentions = useMemo(() => {
    if (!agents?.length) return [];
    return parseMentions(messageInput, agents).requested.map((agent) => agent.name);
  }, [agents, messageInput]);
  const companyName = selectedCompanyId
    ? companies.find((company) => company.id === selectedCompanyId)?.name ?? "selected company"
    : null;
  const activeProjectContext = useMemo(
    () => buildProjectContextSummary(activeProject, activeProjectIssues),
    [activeProject, activeProjectIssues],
  );

  useEffect(() => {
    setActiveMentionIndex(0);
    setMentionMenuOpen(Boolean(mentionContext));
  }, [mentionContext?.query]);

  function commitRoom(nextMessages: RoomMessage[], patch?: Partial<StoredRoomState>) {
    setRoom((current) => ({
      ...current,
      ...patch,
      messages: nextMessages.slice(-MAX_ROOM_MESSAGES),
      updatedAt: new Date().toISOString(),
      lastClearedAt:
        nextMessages.length > 0
          ? null
          : patch?.lastClearedAt !== undefined
            ? patch.lastClearedAt
            : current.lastClearedAt ?? null,
    }));
  }

  function focusComposer(nextCursorPosition?: number) {
    window.requestAnimationFrame(() => {
      const textarea = document.getElementById("paperclip-shared-chat-composer") as HTMLTextAreaElement | null;
      if (!textarea) return;
      textarea.focus();
      if (typeof nextCursorPosition === "number") {
        textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
        setCursorPosition(nextCursorPosition);
      }
    });
  }

  function insertMention(agentId: string) {
    const context = getMentionContext(messageInput, cursorPosition);
    if (context) {
      const nextValue =
        `${messageInput.slice(0, context.start)}@${agentId} ${messageInput.slice(context.end)}`;
      const nextCursor = context.start + agentId.length + 2;
      setMessageInput(nextValue);
      setMentionMenuOpen(false);
      focusComposer(nextCursor);
      return;
    }

    const mention = `@${agentId} `;
    const separator = messageInput.endsWith(" ") || messageInput.length === 0 ? "" : " ";
    const nextValue = `${messageInput}${separator}${mention}`;
    setMessageInput(nextValue);
    setMentionMenuOpen(false);
    focusComposer(nextValue.length);
  }

  function resetRoom() {
    commitRoom([], {
      activeProjectId: null,
      activeIssueId: null,
      lastClearedAt: new Date().toISOString(),
    });
    setStatus("Room reset.");
  }

  async function ensureRoomProjectContext(message: string, chosenAgent: Agent | null) {
    if (!selectedCompanyId || room.activeProjectId || !looksLikeBuildIntent(message)) {
      return null;
    }

    const primaryBuildAgent = chosenAgent?.name === DEFAULT_FALLBACK_AGENT ? null : chosenAgent;
    const launchOpsAgent = findPreferredAgent(agents, [
      "project-shepherd",
      "product-manager",
      "senior-project-manager",
      "social-media-strategist",
      "content-creator",
    ]);
    const viralityAgent = findPreferredAgent(agents, [
      "growth-hacker",
      "paid-social-strategist",
      "social-media-strategist",
      "content-creator",
      "trend-researcher",
    ]);
    const revenueAgent = findPreferredAgent(agents, [
      "sales-coach",
      "analytics-reporter",
      "finance-tracker",
      "growth-hacker",
      "social-media-strategist",
      "paid-social-strategist",
    ]);

    const createdProject = await projectsApi.create(selectedCompanyId, {
      name: deriveProjectNameFromMessage(message),
      description: [
        message,
        "",
        `First ship rule: ${FIVE_MINUTE_MVP_OBJECTIVE}`,
        `Operating objective: ${PRE_REVENUE_OBJECTIVE}`,
        "Success tracks: core product, launch, virality, and revenue.",
      ].join("\n"),
      status: "in_progress",
      ...(primaryBuildAgent ? { leadAgentId: primaryBuildAgent.id } : {}),
    });

    const rootGoal = await goalsApi.create(selectedCompanyId, {
      title: `${createdProject.name} success system`,
      description: "Keep this project moving across build, launch, virality, and revenue until it is a real operating product.",
      level: "team",
      status: "active",
    });

    const goalSpecs = [
      {
        title: `Ship the core product for ${createdProject.name}`,
        description:
          "Success = a live preview or deployed MVP exists, the core user flow works, and the experience is credible enough to show externally.",
        ownerAgentId: primaryBuildAgent?.id ?? null,
        status: "active",
      },
      {
        title: `Launch and positioning for ${createdProject.name}`,
        description:
          "Success = the project has clear messaging, a launch angle, and operator-ready marketing materials or launch steps.",
        ownerAgentId: launchOpsAgent?.id ?? null,
        status: "planned",
      },
      {
        title: `Virality loop for ${createdProject.name}`,
        description:
          "Success = at least one concrete sharing, referral, content, or growth loop exists and is ready to test.",
        ownerAgentId: viralityAgent?.id ?? null,
        status: "planned",
      },
      {
        title: `Revenue path for ${createdProject.name}`,
        description:
          "Success = pricing, monetization surfaces, and a direct path to first revenue are clear and executable.",
        ownerAgentId: revenueAgent?.id ?? null,
        status: "planned",
      },
    ] as const;

    const createdGoals = await Promise.all(
      goalSpecs.map((spec) =>
        goalsApi.create(selectedCompanyId, {
          ...spec,
          level: "task",
          parentId: rootGoal.id,
        }),
      ),
    );

    const linkedGoalIds = createdGoals.map((goal) => goal.id);
    const projectWithGoals =
      linkedGoalIds.length > 0
        ? await projectsApi.update(createdProject.id, { goalIds: linkedGoalIds }, selectedCompanyId)
        : createdProject;

    const seedIssueSpecs = [
      {
        title: `Ship 5-minute MVP for ${createdProject.name}`,
        description: [
          message,
          "",
          `First ship rule: ${FIVE_MINUTE_MVP_OBJECTIVE}`,
          "Goal: get the first working version live, previewable, usable, and ready for launch handoff.",
          "If the requested product is too large, cut to the smallest believable MVP and ship that first.",
          "Design rule: even the first slice should have strong typography, spacing, contrast, and a preview ready for /superdesign and superdesign init by default.",
        ].join("\n"),
        status: primaryBuildAgent ? "in_progress" : "todo",
        priority: "critical",
        ...(primaryBuildAgent ? { assigneeAgentId: primaryBuildAgent.id } : {}),
      },
      {
        title: `Launch and positioning for ${createdProject.name}`,
        description: [
          "Set up launch messaging, a simple marketing angle, and the first operator-facing launch checklist.",
          "Success = someone can explain what the product is, who it is for, and how it gets introduced to the world.",
        ].join("\n"),
        status: "backlog",
        priority: "high",
        ...(launchOpsAgent ? { assigneeAgentId: launchOpsAgent.id } : {}),
      },
      {
        title: `Design the virality loop for ${createdProject.name}`,
        description: [
          "Build the first growth loop around the project: sharing, referrals, content hooks, or another repeatable acquisition mechanic.",
          "Success = the project has a concrete path for people to bring in more people.",
        ].join("\n"),
        status: "backlog",
        priority: "high",
        ...(viralityAgent ? { assigneeAgentId: viralityAgent.id } : {}),
      },
      {
        title: `Reach first revenue for ${createdProject.name}`,
        description: [
          "Push the project from launched to earning.",
          "Cover pricing, monetization surfaces, follow-up, sales motion, and closing the first revenue event.",
          "Do not mark the project done before first money unless there is a true external blocker.",
        ].join("\n"),
        status: "backlog",
        priority: "high",
        ...(revenueAgent ? { assigneeAgentId: revenueAgent.id } : {}),
      },
    ] as const;

    const createdIssues = await Promise.allSettled(
      seedIssueSpecs.map((spec) =>
        issuesApi.create(selectedCompanyId, {
          ...spec,
          projectId: createdProject.id,
        }),
      ),
    );

    const primaryCreatedIssue = createdIssues.find(
      (result): result is PromiseFulfilledResult<Issue> => result.status === "fulfilled",
    );
    const createdIssueId = primaryCreatedIssue?.value.id ?? null;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(createdProject.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(selectedCompanyId, createdProject.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(selectedCompanyId) }),
    ]);

    return { project: projectWithGoals, issueId: createdIssueId };
  }

  function findActiveRunForAgent(agentId: string) {
    return [...roomRuns]
      .filter(
        (run) =>
          run.agentId === agentId &&
          (run.status === "queued" || run.status === "running")
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )[0] ?? null;
  }

  async function buildSuccessfulTurnResult(agent: Agent, completedRun: HeartbeatRun) {
    let rawReply = extractRunReply(completedRun);
    if (!rawReply) {
      try {
        const log = await heartbeatsApi.log(completedRun.id, 0, 96_000);
        rawReply = extractLiveProgress(log.content) ?? "";
      } catch {
        rawReply = "";
      }
    }

    const normalizedReply = agents?.length
      ? normalizeAgentMentions(rawReply, agents)
      : { text: rawReply, resolvedAliases: [] as Array<{ input: string; resolved: string }> };
    const reply =
      normalizedReply.text ||
      `@${agent.name} completed the run but did not emit a final room summary. Open the task or preview to inspect the latest output.`;
    const delegatedAgents = agents?.length
      ? extractDelegatedAgents(reply, agent.name, agents)
      : [];

    return {
      roomMessage: {
        id: buildMessageId("agent"),
        role: "agent" as const,
        agentId: agent.name,
        text: reply,
        timestamp: new Date().toISOString(),
        state: "done" as const,
        runId: completedRun.id,
        mentions: delegatedAgents.map((candidate) => candidate.name),
      },
      reply,
      delegatedAgents,
      resolvedAliases: normalizedReply.resolvedAliases,
    };
  }

  async function runAgentTurn({
    agent,
    latestMessage,
    transcript,
    mentions,
    taggedBy,
    operatorMessage,
    handoffMessage,
    routingGuide,
    projectContext,
    issueId,
    projectId,
  }: {
    agent: Agent;
    latestMessage: string;
    transcript: string;
    mentions: string[];
    taggedBy?: string;
    operatorMessage?: string;
    handoffMessage?: string;
    routingGuide?: string;
    projectContext?: string | null;
    issueId?: string | null;
    projectId?: string | null;
  }) {
    const wakeReason = buildPrompt(agent.name, latestMessage, transcript, mentions, {
      taggedBy,
      operatorMessage,
      handoffMessage,
      routingGuide,
      projectContext,
    });
    const run = await agentsApi.wakeup(
      agent.id,
      {
        source: "on_demand",
        triggerDetail: "manual",
        reason: wakeReason,
        payload:
          issueId || projectId
            ? {
                ...(issueId ? { issueId } : {}),
                ...(projectId ? { projectId } : {}),
              }
            : null,
      },
      selectedCompanyId!,
    );

    if ("status" in run && run.status === "skipped") {
      const activeRun = findActiveRunForAgent(agent.id);
      if (activeRun) {
        const completedRun = await waitForRun(activeRun.id);
        if (completedRun.status === "succeeded") {
          return buildSuccessfulTurnResult(agent, completedRun);
        }

        const rawReply = extractRunReply(completedRun);
        const normalizedReply = agents?.length
          ? normalizeAgentMentions(rawReply, agents)
          : { text: rawReply, resolvedAliases: [] as Array<{ input: string; resolved: string }> };

        return {
          roomMessage: {
            id: buildMessageId("system"),
            role: "system" as const,
            text: `${agent.name}: attached to the existing live run, but it ended with ${completedRun.error || completedRun.status}.`,
            timestamp: new Date().toISOString(),
            state: "error" as const,
          },
          reply: normalizedReply.text,
          delegatedAgents: [] as Agent[],
          resolvedAliases: normalizedReply.resolvedAliases,
        };
      }

      return {
        roomMessage: {
          id: buildMessageId("system"),
          role: "system" as const,
          text: `${agent.name}: wakeup was skipped by MSX policy or concurrency limits.`,
          timestamp: new Date().toISOString(),
          state: "error" as const,
        },
        reply: "",
        delegatedAgents: [] as Agent[],
        resolvedAliases: [] as Array<{ input: string; resolved: string }>,
      };
    }

    const completedRun = await waitForRun(run.id);
    if (completedRun.status !== "succeeded") {
      const rawReply = extractRunReply(completedRun);
      const normalizedReply = agents?.length
        ? normalizeAgentMentions(rawReply, agents)
        : { text: rawReply, resolvedAliases: [] as Array<{ input: string; resolved: string }> };
      return {
        roomMessage: {
          id: buildMessageId("system"),
          role: "system" as const,
          text: `${agent.name}: ${completedRun.error || `run ended with status ${completedRun.status}`}.`,
          timestamp: new Date().toISOString(),
          state: "error" as const,
        },
        reply: normalizedReply.text,
        delegatedAgents: [] as Agent[],
        resolvedAliases: normalizedReply.resolvedAliases,
      };
    }

    return buildSuccessfulTurnResult(agent, completedRun);
  }

  async function sendMessage() {
    if (!selectedCompanyId || !agents?.length) return;
    if (isSending) return;
    const trimmed = messageInput.trim();
    if (!trimmed) {
      setStatus("Type a message before sending.");
      return;
    }

    const { requested, unknown, resolvedAliases } = parseMentions(trimmed, agents);
    const chosenAgents = requested.length
      ? requested
      : agents.find((agent) => agent.name === fallbackAgent)
        ? [agents.find((agent) => agent.name === fallbackAgent)!]
        : agents.find((agent) => agent.name === DEFAULT_FALLBACK_AGENT)
          ? [agents.find((agent) => agent.name === DEFAULT_FALLBACK_AGENT)!]
          : [];

    if (chosenAgents.length === 0) {
      setStatus("No routable agent was found.");
      return;
    }

    setIsSending(true);
    let autoProjectContext: { project: Project; issueId: string | null } | null = null;
    try {
      autoProjectContext = await ensureRoomProjectContext(trimmed, chosenAgents[0] ?? null);
    } catch (projectError) {
      const message =
        projectError instanceof Error
          ? projectError.message
          : "Failed to initialize the project context for this room.";
      setStatus(message);
    }

    const userMessage: RoomMessage = {
      id: buildMessageId("user"),
      role: "operator",
      text: trimmed,
      timestamp: new Date().toISOString(),
      mentions: requested.map((agent) => agent.name),
      route: requested.length ? "mentions" : "fallback",
    };

    const nextMessages = [...room.messages, userMessage];
    if (unknown.length) {
      nextMessages.push({
        id: buildMessageId("system"),
        role: "system",
        text: `Unknown tag${unknown.length === 1 ? "" : "s"}: ${unknown.map((entry) => `@${entry}`).join(", ")}`,
        timestamp: new Date().toISOString(),
      });
    }
    if (resolvedAliases.length) {
      nextMessages.push({
        id: buildMessageId("system"),
        role: "system",
        text: resolvedAliases
          .map((entry) => `Resolved @${entry.input} to @${entry.resolved}.`)
          .join(" "),
        timestamp: new Date().toISOString(),
      });
    }

    if (autoProjectContext) {
      nextMessages.push({
        id: buildMessageId("system"),
        role: "system",
        text: [
            `Created @sidebar project "${autoProjectContext.project.name}" automatically for this build thread.`,
          autoProjectContext.issueId
            ? "Seeded build, launch, virality, and revenue tasks so the project keeps moving after the first MVP is live."
            : "Project shell created, but the lifecycle tasks could not be created automatically.",
        ].join(" "),
        timestamp: new Date().toISOString(),
      });
    }

    commitRoom(nextMessages, {
      activeProjectId: autoProjectContext?.project.id ?? room.activeProjectId ?? null,
      activeIssueId: autoProjectContext?.issueId ?? room.activeIssueId ?? null,
    });
    setMessageInput("");
    setCursorPosition(0);
    setStatus(
      autoProjectContext
        ? `Created ${autoProjectContext.project.name} and routing work…`
        : requested.length
        ? `Routing to ${requested.map((agent) => `@${agent.name}`).join(", ")}…`
        : `Routing to @${chosenAgents[0]!.name}…`,
    );

    let workingMessages = [...nextMessages];
    const issueIdForTurn = autoProjectContext?.issueId ?? room.activeIssueId ?? null;
    const projectIdForTurn = autoProjectContext?.project.id ?? room.activeProjectId ?? null;
    const activeIssueForTurn =
      (issueIdForTurn
        ? activeProjectIssues.find((issue) => issue.id === issueIdForTurn)
        : null) ??
      (issueIdForTurn ? companyIssues.find((issue) => issue.id === issueIdForTurn) ?? null : null);

    try {
      const mentions = requested.map((agent) => agent.name);
      const deliveredAgents: string[] = [];
      const agentAttemptCounts = new Map<string, number>();
      const routingGuide = [
        "Use these exact registered handles when relevant:",
        "- planning: @senior-project-manager, @product-manager, @project-shepherd, @sprint-prioritizer",
        "- app implementation: @rapid-prototyper, @frontend-developer, @senior-developer, @software-architect, @backend-architect",
        "- mobile ux/product design: @ux-architect, @ux-researcher, @ui-designer, @mobile-app-builder",
        "- launch/growth: @growth-hacker, @social-media-strategist, @content-creator, @paid-social-strategist",
        "- revenue/ops: @sales-coach, @analytics-reporter, @finance-tracker, @trend-researcher",
      ].join("\n");

      const appendRoomMessages = (...messagesToAdd: RoomMessage[]) => {
        workingMessages = [...workingMessages, ...messagesToAdd];
        commitRoom(workingMessages);
      };

      const replaceRoomMessage = (messageId: string, nextMessage: RoomMessage) => {
        workingMessages = workingMessages.map((message) => (message.id === messageId ? nextMessage : message));
        commitRoom(workingMessages);
      };

      const markDelivered = (agentName: string) => {
        if (!deliveredAgents.includes(agentName)) {
          deliveredAgents.push(agentName);
        }
      };

      const canDispatchAgent = (agentName: string) =>
        (agentAttemptCounts.get(agentName) ?? 0) < MAX_AGENT_ATTEMPTS_PER_TURN;

      const markDispatched = (agentName: string) => {
        agentAttemptCounts.set(agentName, (agentAttemptCounts.get(agentName) ?? 0) + 1);
      };

      const runVisibleAgentTurn = async ({
        agent,
        latestMessage,
        mentionsForTurn,
        pendingText,
        taggedBy,
        operatorMessage,
        handoffMessage,
      }: {
        agent: Agent;
        latestMessage: string;
        mentionsForTurn: string[];
        pendingText: string;
        taggedBy?: string;
        operatorMessage?: string;
        handoffMessage?: string;
      }) => {
        markDispatched(agent.name);
        setStatus(`Waiting on @${agent.name}…`);
        const pendingMessageId = buildMessageId("pending");
        const initialScope = resolveDispatchScope({
          agent,
          activeIssue: activeIssueForTurn,
          issueId: issueIdForTurn,
          projectId: projectIdForTurn,
        });
        appendRoomMessages({
          id: pendingMessageId,
          role: "agent",
          agentId: agent.name,
          text: pendingText,
          timestamp: new Date().toISOString(),
          state: "pending",
        });

        let result = await runAgentTurn({
          agent,
          latestMessage,
          transcript: formatTranscript(workingMessages, TRANSCRIPT_MESSAGE_LIMIT),
          mentions: mentionsForTurn,
          taggedBy,
          operatorMessage,
          handoffMessage,
          routingGuide,
          projectContext: activeProjectContext,
          issueId: initialScope.issueId,
          projectId: initialScope.projectId,
        });

        if (
          initialScope.issueId &&
          initialScope.projectId &&
          isSkippedWakeRoomMessage(result.roomMessage)
        ) {
          appendRoomMessages({
            id: buildMessageId("system"),
            role: "system",
            text: `Retrying @${agent.name} at project scope so the room can keep moving while the current issue execution is locked.`,
            timestamp: new Date().toISOString(),
            state: "done",
          });

          result = await runAgentTurn({
            agent,
            latestMessage,
            transcript: formatTranscript(workingMessages, TRANSCRIPT_MESSAGE_LIMIT),
            mentions: mentionsForTurn,
            taggedBy,
            operatorMessage,
            handoffMessage,
            routingGuide,
            projectContext: activeProjectContext,
            issueId: null,
            projectId: initialScope.projectId,
          });
        }

        replaceRoomMessage(pendingMessageId, result.roomMessage);
        if (result.resolvedAliases.length) {
          appendRoomMessages({
            id: buildMessageId("system"),
            role: "system",
            text: result.resolvedAliases
              .map((entry) => `Resolved @${entry.input} to @${entry.resolved} from @${agent.name}.`)
              .join(" "),
            timestamp: new Date().toISOString(),
            state: "done",
          });
        }
        markDelivered(agent.name);
        return result;
      };

      const dispatchDelegatedAgents = async ({
        handoffBy,
        delegatedAgents,
        handoffMessage,
      }: {
        handoffBy: string;
        delegatedAgents: Agent[];
        handoffMessage: string;
      }) => {
        const seenThisDispatch = new Set<string>();
        const freshDelegates = delegatedAgents.filter((candidate) => {
          if (seenThisDispatch.has(candidate.name)) return false;
          seenThisDispatch.add(candidate.name);
          return canDispatchAgent(candidate.name);
        });

        if (freshDelegates.length === 0) {
          const exhaustedDelegates = delegatedAgents
            .filter((candidate) => !canDispatchAgent(candidate.name))
            .map((candidate) => `@${candidate.name}`);
          if (exhaustedDelegates.length > 0) {
            appendRoomMessages({
              id: buildMessageId("system"),
              role: "system",
              text: `Retry limit reached for ${exhaustedDelegates.join(", ")} in this room turn.`,
              timestamp: new Date().toISOString(),
              state: "error",
            });
          }
          return [];
        }
        appendRoomMessages({
          id: buildMessageId("system"),
          role: "system",
          text: `@${handoffBy} handed this off to ${freshDelegates.map((candidate) => `@${candidate.name}`).join(", ")}.`,
          timestamp: new Date().toISOString(),
          state: "done",
        });

        setStatus(`Auto-routing to ${freshDelegates.map((candidate) => `@${candidate.name}`).join(", ")}…`);

        return await Promise.all(
          freshDelegates.map((delegatedAgent) =>
            runVisibleAgentTurn({
              agent: delegatedAgent,
              latestMessage: trimmed,
              mentionsForTurn: freshDelegates.map((candidate) => candidate.name),
              pendingText: `Waiting on handoff from @${handoffBy}…`,
              taggedBy: handoffBy,
              operatorMessage: trimmed,
              handoffMessage,
            }).then((result) => ({ agent: delegatedAgent, result })),
          ),
        );
      };

      const continueOrchestratorLoop = async ({
        orchestratorAgent,
        initialResult,
      }: {
        orchestratorAgent: Agent;
        initialResult: Awaited<ReturnType<typeof runVisibleAgentTurn>>;
      }) => {
        let orchestrationRound = 0;
        let orchestratorResult = initialResult;
        let nextDelegates = orchestratorResult.delegatedAgents;

        while (nextDelegates.length > 0 && orchestrationRound < MAX_ORCHESTRATION_ROUNDS) {
          const delegatedResults = await dispatchDelegatedAgents({
            handoffBy: orchestratorAgent.name,
            delegatedAgents: nextDelegates,
            handoffMessage: orchestratorResult.reply || trimmed,
          });

          if (delegatedResults.length === 0) {
            break;
          }

          orchestrationRound += 1;
          const specialistSummary = delegatedResults
            .map(({ agent, result }) => `@${agent.name}:\n${result.reply || result.roomMessage.text}`)
            .join("\n\n");
          const specialistSuggestedDelegates = delegatedResults.flatMap(({ result }) => result.delegatedAgents);

          orchestratorResult = await runVisibleAgentTurn({
            agent: orchestratorAgent,
            latestMessage: [
              "Specialist updates are in.",
              "Summarize what changed for the operator in one concise pass.",
              "Choose the next best registered agent if another step is needed.",
              "If the build is complete but launch, organization, or first-revenue work remains, do not stop. Route the next best registered agent.",
              "Only reply as complete when the project is truly at a first-revenue milestone or blocked by an external dependency outside the room.",
              "",
              specialistSummary,
            ].join("\n"),
            mentionsForTurn: delegatedResults.map(({ agent }) => agent.name),
            pendingText: "Reviewing specialist output…",
            operatorMessage: trimmed,
            handoffMessage: specialistSummary,
          });

          nextDelegates = orchestratorResult.delegatedAgents;

          if (
            nextDelegates.length === 0 &&
            hasBlockerSignal(orchestratorResult.reply || "") &&
            specialistSuggestedDelegates.length > 0
          ) {
            appendRoomMessages({
              id: buildMessageId("system"),
              role: "system",
              text: `Auto-unblocking with specialist-suggested route: ${specialistSuggestedDelegates.map((agent) => `@${agent.name}`).join(", ")}.`,
              timestamp: new Date().toISOString(),
              state: "done",
            });
            nextDelegates = specialistSuggestedDelegates;
            continue;
          }

          if (
            nextDelegates.length === 0 &&
            hasBlockerSignal(orchestratorResult.reply || "") &&
            orchestrationRound < MAX_ORCHESTRATION_ROUNDS
          ) {
            orchestratorResult = await runVisibleAgentTurn({
              agent: orchestratorAgent,
              latestMessage: [
                "A blocker remains and the workflow is not finished yet.",
                "Choose the next exact registered @agent-id to remove it now.",
                "Only tell the operator about the blocker if it depends on an external action outside the room.",
                "If the product is already built, use this turn to keep launch, operations, and first-revenue work moving.",
                "",
                orchestratorResult.reply || specialistSummary,
              ].join("\n"),
              mentionsForTurn: mentions,
              pendingText: "Resolving blocker…",
              operatorMessage: trimmed,
              handoffMessage: specialistSummary,
            });
            nextDelegates = orchestratorResult.delegatedAgents;
          }
        }
      };

      if (requested.length > 0) {
        const explicitResults: Array<{ agent: Agent; result: Awaited<ReturnType<typeof runVisibleAgentTurn>> }> = [];
        for (const agent of chosenAgents) {
          const result = await runVisibleAgentTurn({
            agent,
            latestMessage: trimmed,
            mentionsForTurn: mentions,
            pendingText: "Thinking…",
            operatorMessage: trimmed,
          });
          explicitResults.push({ agent, result });
        }

        const orchestratorAgent =
          agents.find((agent) => agent.name === fallbackAgent)
          ?? agents.find((agent) => agent.name === DEFAULT_FALLBACK_AGENT)
          ?? null;
        const shouldAutoReviewWithOrchestrator =
          Boolean(issueIdForTurn || projectIdForTurn)
          && Boolean(orchestratorAgent)
          && !chosenAgents.some((agent) => agent.name === orchestratorAgent?.name);

        if (shouldAutoReviewWithOrchestrator && orchestratorAgent) {
          const specialistSummary = explicitResults
            .map(({ agent, result }) => `@${agent.name}:\n${result.reply || result.roomMessage.text}`)
            .join("\n\n");
          const orchestratorResult = await runVisibleAgentTurn({
            agent: orchestratorAgent,
            latestMessage: [
              "Specialist updates are in.",
              "Summarize what changed for the operator in one concise pass.",
              "If more work remains on this active project task, choose the next best registered agent and hand it off now.",
              "Keep the room moving until the project objective is complete or a true outside blocker exists.",
              "",
              specialistSummary,
            ].join("\n"),
            mentionsForTurn: explicitResults.map(({ agent }) => agent.name),
            pendingText: "Summarizing progress and routing next step…",
            operatorMessage: trimmed,
            handoffMessage: specialistSummary,
          });
          await continueOrchestratorLoop({
            orchestratorAgent,
            initialResult: orchestratorResult,
          });
        }
      } else {
        const orchestratorAgent = chosenAgents[0]!;
        const orchestratorResult = await runVisibleAgentTurn({
          agent: orchestratorAgent,
          latestMessage: trimmed,
          mentionsForTurn: mentions,
          pendingText: "Thinking…",
          operatorMessage: trimmed,
        });
        await continueOrchestratorLoop({
          orchestratorAgent,
          initialResult: orchestratorResult,
        });
      }

      setStatus(`Delivered to ${deliveredAgents.map((agentName) => `@${agentName}`).join(", ")}.`);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Failed to send room message.";
      commitRoom([
        ...workingMessages,
        {
          id: buildMessageId("system"),
          role: "system",
          text: message,
          timestamp: new Date().toISOString(),
          state: "error",
        },
      ]);
      setStatus(message);
    } finally {
      setIsSending(false);
    }
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={MessageSquareText} message="Select an environment to open the shared chat room." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!agents?.length) {
    return (
      <EmptyState
        icon={MessageSquareText}
        message="This environment has no agents yet. Add agents first, then you can tag them from one shared room."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0">
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquareText className="h-4 w-4" />
                  Shared room
                </CardTitle>
                <CardDescription>
                  One shared room for {companyName}. Tag agents with <code>@agent-id</code>. Untagged messages go to{" "}
                  <code>@{fallbackAgent}</code>.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={resetRoom}>
                <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                Reset room
              </Button>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 pt-5">
            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Untagged route
                </div>
                <select
                  value={fallbackAgent}
                  onChange={(event) => setFallbackAgent(event.target.value)}
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                >
                  {fallbackOptions.map((agent) => (
                    <option key={agent.id} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                Tip: tag more than one specialist in the same message, like{" "}
                <code>@social-media-strategist @ui-designer build this together</code>.
              </div>
            </div>

            {activeProject ? (
              <div className="rounded-xl border border-border bg-card/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <FolderKanban className="h-3.5 w-3.5" />
                      Live project context
                    </div>
                    <div>
                      <div className="text-base font-medium">{activeProject.name}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeProject.description?.trim() || "This room is actively building and operating inside this environment."}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Objective: stay in motion through launch and first revenue, not just a finished build.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{activeProjectIssues.length} tasks</Badge>
                      <Badge variant="secondary">
                        {
                          activeProjectIssues.filter((issue) =>
                            ["todo", "in_progress", "in_review", "blocked", "backlog"].includes(issue.status),
                          ).length
                        }{" "}
                        active
                      </Badge>
                      {(activeProject.primaryWorkspace?.runtimeServices ?? []).filter((service) => service.url).length > 0 ? (
                        <Badge variant="secondary">
                          {
                            (activeProject.primaryWorkspace?.runtimeServices ?? []).filter((service) => service.url)
                              .length
                          }{" "}
                          previews
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={projectUrl(activeProject)}>Open project</Link>
                    </Button>
                    {room.activeIssueId ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={issueUrl({ id: room.activeIssueId })}>Open seed task</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={scrollRootRef}>
              <ScrollArea className="h-[30rem] rounded-md border border-border">
                <div className="space-y-3 p-4">
                {room.messages.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    No room messages yet. Start with <code>@main</code> or let{" "}
                    <code>@{fallbackAgent}</code> conduct the room.
                  </div>
                ) : (
                  room.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "rounded-md border px-4 py-3",
                        message.role === "operator" && "border-border bg-accent/40",
                        message.role === "agent" && "border-border bg-card",
                        message.role === "system" && "border-amber-500/20 bg-amber-500/5",
                        message.state === "pending" && "opacity-75",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {message.role === "operator" ? (
                            <UserRound className="h-3.5 w-3.5" />
                          ) : message.role === "agent" ? (
                            <Bot className="h-3.5 w-3.5" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {message.role === "operator"
                              ? "operator"
                              : message.role === "agent"
                                ? `@${message.agentId}`
                                : "system"}
                          </span>
                        </div>
                        <span>{timeAgo(message.timestamp)}</span>
                      </div>
                      <div
                        className={cn(
                          "whitespace-pre-wrap text-sm leading-6",
                          message.state === "pending" && "animate-pulse text-muted-foreground",
                        )}
                      >
                        {message.text}
                      </div>
                      {message.mentions?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.mentions.map((mention) => (
                            <Badge key={mention} variant="secondary">
                              @{mention}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                </div>
              </ScrollArea>
            </div>

            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <Textarea
                id="paperclip-shared-chat-composer"
                value={messageInput}
                onChange={(event) => {
                  setMessageInput(event.target.value);
                  const nextCursor = event.target.selectionStart ?? event.target.value.length;
                  setCursorPosition(nextCursor);
                  setMentionMenuOpen(Boolean(getMentionContext(event.target.value, nextCursor)));
                }}
                onClick={(event) => {
                  const nextCursor = event.currentTarget.selectionStart ?? cursorPosition;
                  setCursorPosition(nextCursor);
                  setMentionMenuOpen(Boolean(getMentionContext(event.currentTarget.value, nextCursor)));
                }}
                onKeyUp={(event) => {
                  const nextCursor = event.currentTarget.selectionStart ?? cursorPosition;
                  setCursorPosition(nextCursor);
                  setMentionMenuOpen(Boolean(getMentionContext(event.currentTarget.value, nextCursor)));
                }}
                onSelect={(event) => {
                  const nextCursor = event.currentTarget.selectionStart ?? cursorPosition;
                  setCursorPosition(nextCursor);
                  setMentionMenuOpen(Boolean(getMentionContext(event.currentTarget.value, nextCursor)));
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) {
                    return;
                  }

                  if (mentionMenuOpen && inlineMentionSuggestions.length > 0 && mentionContext) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMentionIndex((current) => (current + 1) % inlineMentionSuggestions.length);
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveMentionIndex((current) =>
                        current === 0 ? inlineMentionSuggestions.length - 1 : current - 1,
                      );
                      return;
                    }

                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      const choice = inlineMentionSuggestions[activeMentionIndex] ?? inlineMentionSuggestions[0];
                      if (choice) {
                        insertMention(choice.name);
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMentionMenuOpen(false);
                      return;
                    }
                  }

                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={5}
                placeholder="Type a room message. Example: @social-media-strategist give me three hooks for the crypto alert product."
              />
              {mentionMenuOpen && inlineMentionSuggestions.length > 0 && mentionContext ? (
                <div className="rounded-md border border-border bg-card shadow-sm">
                  <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Tag an agent
                  </div>
                  <div className="space-y-1 p-2">
                    {inlineMentionSuggestions.map((agent, index) => (
                      <button
                        key={agent.id}
                        type="button"
                        onMouseDown={(mouseEvent) => {
                          mouseEvent.preventDefault();
                          insertMention(agent.name);
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors",
                          index === activeMentionIndex ? "bg-accent text-foreground" : "hover:bg-accent/70",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">@{agent.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {agent.title ?? agent.role}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 capitalize">
                          {agent.role}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {detectedMentions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detectedMentions.map((mention) => (
                    <Badge key={mention} variant="secondary">
                      @{mention}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {status} <span className="text-xs">Enter sends. Shift+Enter adds a new line.</span>
                </div>
                <Button type="submit" disabled={isSending}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSending ? "Sending…" : "Send to room"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <MentionTray
          agents={agents}
          filter={mentionFilter}
          onFilterChange={setMentionFilter}
          onMentionClick={insertMention}
        />
      </div>
    </div>
  );
}
