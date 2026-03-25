import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useLocation, Navigate, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS, isUuidLike, type BudgetPolicySummary } from "@paperclipai/shared";
import { budgetsApi } from "../api/budgets";
import { projectsApi, type LocalPreviewDiscovery } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { heartbeatsApi } from "../api/heartbeats";
import { assetsApi } from "../api/assets";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ProjectProperties, type ProjectConfigFieldKey, type ProjectFieldSaveState } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { StatusBadge } from "../components/StatusBadge";
import { BudgetPolicyCard } from "../components/BudgetPolicyCard";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { projectRouteRef, issueUrl, cn, formatDate } from "../lib/utils";
import { Tabs } from "@/components/ui/tabs";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ExternalLink, FolderOpen, Github, ListTodo, LoaderCircle, PlaySquare, Square, Users } from "lucide-react";

/* ── Top-level tab types ── */

type ProjectBaseTab = "overview" | "list" | "configuration" | "budget";
type ProjectPluginTab = `plugin:${string}`;
type ProjectTab = ProjectBaseTab | ProjectPluginTab;

function isProjectPluginTab(value: string | null): value is ProjectPluginTab {
  return typeof value === "string" && value.startsWith("plugin:");
}

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "configuration") return "configuration";
  if (tab === "budget") return "budget";
  if (tab === "issues") return "list";
  return null;
}

/* ── Overview tab content ── */

function OverviewContent({
  project,
  companyId,
  onUpdate,
  imageUploadHandler,
}: {
  project: {
    id: string;
    name: string;
    goalIds: string[];
    goals: Array<{ id: string; title: string }>;
    description: string | null;
    status: string;
    targetDate: string | null;
    createdAt: string | Date;
    codebase: {
      repoUrl: string | null;
      effectiveLocalFolder: string;
    };
    leadAgentId: string | null;
    primaryWorkspace: {
      runtimeServices?: Array<{
        id: string;
        serviceName: string;
        url: string | null;
        status: string;
      }>;
    } | null;
  };
  companyId: string;
  onUpdate: (data: Record<string, unknown>) => void;
  imageUploadHandler?: (file: File) => Promise<string>;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const autoPreviewAttemptedRef = useRef(false);
  const localPreviewQueryKey = useMemo(
    () => [...queryKeys.projects.detail(project.id), companyId, "local-preview"],
    [companyId, project.id],
  );
  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });
  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, project.id),
    queryFn: () => issuesApi.list(companyId, { projectId: project.id }),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const { data: liveRuns = [] } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const { data: localPreview } = useQuery({
    queryKey: localPreviewQueryKey,
    queryFn: () => projectsApi.localPreview(project.id, companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const { data: allGoals = [] } = useQuery({
    queryKey: queryKeys.goals.list(companyId),
    queryFn: () => goalsApi.list(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const startPreviewMutation = useMutation({
    mutationFn: ({ announce = true }: { announce?: boolean } = {}) =>
      projectsApi.startLocalPreview(project.id, companyId).then((result) => ({ result, announce })),
    onSuccess: ({ result, announce }) => {
      queryClient.setQueryData(localPreviewQueryKey, result);
      queryClient.invalidateQueries({ queryKey: localPreviewQueryKey });
      if (announce) {
        pushToast({
          title: result.surfaces.length > 0 ? "Local preview is live." : "Starting local preview…",
          tone: "success",
        });
      }
    },
    onError: (error, variables) => {
      if (variables?.announce !== false) {
        pushToast({
          title: error instanceof Error ? error.message : "Failed to start the local preview.",
          tone: "error",
        });
      }
    },
  });
  const stopPreviewMutation = useMutation({
    mutationFn: () => projectsApi.stopLocalPreview(project.id, companyId),
    onMutate: () => {
      autoPreviewAttemptedRef.current = true;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(localPreviewQueryKey, result);
      queryClient.invalidateQueries({ queryKey: localPreviewQueryKey });
      pushToast({
        title: "Local preview stopped.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: error instanceof Error ? error.message : "Failed to stop the local preview.",
        tone: "error",
      });
    },
  });

  const issueIdSet = useMemo(() => new Set(issues.map((issue) => issue.id)), [issues]);
  const projectLiveRuns = useMemo(
    () => liveRuns.filter((run) => run.issueId && issueIdSet.has(run.issueId)),
    [issueIdSet, liveRuns],
  );
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const involvedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    if (project.leadAgentId) ids.add(project.leadAgentId);
    for (const issue of issues) {
      if (issue.assigneeAgentId) ids.add(issue.assigneeAgentId);
    }
    for (const run of projectLiveRuns) {
      if (run.agentId) ids.add(run.agentId);
    }
    return [...ids];
  }, [issues, project.leadAgentId, projectLiveRuns]);
  const activeAgents = useMemo(
    () => involvedAgentIds.map((agentId) => agentById.get(agentId)).filter(Boolean),
    [agentById, involvedAgentIds],
  );
  const previewSurfaces = useMemo(() => {
    const seen = new Set<string>();
    const entries: Array<{
      id: string;
      title: string;
      url: string | null;
      type: "preview" | "repo" | "workspace" | "local";
      meta: string;
    }> = [];

    for (const surface of localPreview?.surfaces ?? []) {
      if (!surface.url || seen.has(surface.url)) continue;
      entries.push({
        id: `local:${surface.id}`,
        title: surface.title,
        url: surface.url,
        type: "local",
        meta: surface.meta,
      });
      seen.add(surface.url);
    }

    if (project.codebase.repoUrl) {
      entries.push({
        id: `repo:${project.codebase.repoUrl}`,
        title: "Source repository",
        url: project.codebase.repoUrl,
        type: "repo",
        meta: "GitHub source of truth",
      });
      seen.add(project.codebase.repoUrl);
    }

    for (const service of project.primaryWorkspace?.runtimeServices ?? []) {
      if (service.url && !seen.has(service.url)) {
        entries.push({
          id: `runtime:${service.id}`,
          title: service.serviceName,
          url: service.url,
          type: "preview",
          meta: `Runtime service · ${service.status}`,
        });
        seen.add(service.url);
      }
    }

    for (const issue of issues) {
      for (const product of issue.workProducts ?? []) {
        if (!product.url || seen.has(product.url)) continue;
        if (product.type !== "preview_url" && product.type !== "runtime_service") continue;
        entries.push({
          id: `work-product:${product.id}`,
          title: product.title,
          url: product.url,
          type: "preview",
          meta: `${product.provider} · ${product.status}`,
        });
        seen.add(product.url);
      }
    }

    entries.push({
      id: "workspace",
      title: "Workspace folder",
      url: null,
      type: "workspace",
      meta: project.codebase.effectiveLocalFolder,
    });

    return entries;
  }, [
    issues,
    localPreview?.surfaces,
    project.codebase.effectiveLocalFolder,
    project.codebase.repoUrl,
    project.primaryWorkspace?.runtimeServices,
  ]);

  const primaryPreview =
    previewSurfaces.find((surface) => (surface.type === "local" || surface.type === "preview") && surface.url) ?? null;
  const blockedCount = issues.filter((issue) => issue.status === "blocked").length;
  const doneCount = issues.filter((issue) => issue.status === "done").length;
  const activeTaskCount = issues.filter((issue) =>
    ["todo", "in_progress", "in_review", "blocked", "backlog"].includes(issue.status),
  ).length;
  const recentIssues = [...issues]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 6);
  const localPreviewHints = useMemo(() => {
    const discovery = localPreview as LocalPreviewDiscovery | undefined;
    if (!discovery) return [];

    const hints: string[] = [];
    if (discovery.framework) {
      hints.push(`Detected ${discovery.framework} workspace`);
    }
    if (discovery.suggestedStartCommand) {
      hints.push(`Start locally with: ${discovery.suggestedStartCommand}`);
    }
    return [...hints, ...(discovery.notes ?? [])];
  }, [localPreview]);
  const managedPreview = localPreview?.managedProcess ?? null;
  const linkedGoalIds = project.goalIds.length > 0
    ? project.goalIds
    : project.goals.map((goal) => goal.id);
  const successTracks = linkedGoalIds
    .map((goalId) => allGoals.find((goal) => goal.id === goalId))
    .filter(
      (
        goal
      ): goal is (typeof allGoals)[number] => Boolean(goal)
    );
  const previewStartAvailable = Boolean(localPreview?.workspacePath && localPreview?.framework);
  const previewIsStarting = startPreviewMutation.isPending || managedPreview?.status === "starting";
  const previewIsRunning = Boolean(primaryPreview?.url) || managedPreview?.status === "running";
  const previewBusy = startPreviewMutation.isPending || stopPreviewMutation.isPending;

  useEffect(() => {
    autoPreviewAttemptedRef.current = false;
  }, [companyId, project.id]);

  useEffect(() => {
    if (!previewStartAvailable) return;
    if (previewIsRunning || previewIsStarting) return;
    if (previewBusy) return;
    if (autoPreviewAttemptedRef.current) return;

    autoPreviewAttemptedRef.current = true;
    startPreviewMutation.mutate({ announce: false });
  }, [
    previewStartAvailable,
    previewIsRunning,
    previewIsStarting,
    previewBusy,
    startPreviewMutation,
  ]);

  return (
    <div className="space-y-6">
      <InlineEditor
        value={project.description ?? ""}
        onSave={(description) => onUpdate({ description })}
        as="p"
        className="text-sm text-muted-foreground"
        placeholder="Add a description..."
        multiline
        imageUploadHandler={imageUploadHandler}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Status", value: <StatusBadge status={project.status} />, icon: Activity, hint: project.targetDate ? `Target ${formatDate(project.targetDate)}` : undefined },
          { label: "Tasks", value: String(issues.length), icon: ListTodo, hint: `${activeTaskCount} active · ${doneCount} done` },
          { label: "Agents", value: String(activeAgents.length), icon: Users, hint: `${projectLiveRuns.length} live runs` },
          {
            label: "Preview surfaces",
            value: String(previewSurfaces.filter((surface) => surface.url).length),
            icon: PlaySquare,
            hint: `Started ${formatDate(project.createdAt)}`,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="gap-3 rounded-2xl py-4">
              <CardContent className="flex items-start justify-between px-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</div>
                  <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                  {metric.hint ? <div className="mt-1 text-xs text-muted-foreground">{metric.hint}</div> : null}
                </div>
                <div className="rounded-xl border border-border p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="gap-0 overflow-hidden rounded-2xl">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              Visual surfaces detected from runtime services, preview URLs, and the primary codebase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              {previewStartAvailable ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => startPreviewMutation.mutate({ announce: true })}
                  disabled={previewBusy || previewIsStarting}
                >
                  {previewIsStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlaySquare className="h-4 w-4" />}
                  {previewIsStarting ? "Starting preview" : "Start preview"}
                </Button>
              ) : null}
              {managedPreview ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => stopPreviewMutation.mutate()}
                  disabled={previewBusy || managedPreview.status === "stopped"}
                >
                  <Square className="h-4 w-4" />
                  Stop preview
                </Button>
              ) : null}
              {primaryPreview?.url ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={primaryPreview.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open live
                  </a>
                </Button>
              ) : null}
              {managedPreview ? (
                <Badge variant="secondary" className="capitalize">
                  preview {managedPreview.status}
                </Badge>
              ) : null}
            </div>

            {primaryPreview?.url ? (
              <div className="overflow-hidden rounded-xl border border-border bg-white">
                <iframe
                  title={`${primaryPreview.title} preview`}
                  src={primaryPreview.url}
                  className="h-[360px] w-full"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                <div>No live preview URL yet.</div>
                <div className="mt-2">
                  {previewIsStarting
                    ? "MSX is spinning up the local preview now. This panel will refresh into the app automatically."
                    : "MSX will automatically spin up runtime services or a local web preview for previewable apps and show them here."}
                </div>
                {localPreviewHints.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {localPreviewHints.map((hint) => (
                      <div key={hint} className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-xs">
                        {hint}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {localPreview && (localPreview.framework || localPreview.workspacePath) ? (
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium">Local app detection</div>
                  {localPreview.framework ? <Badge variant="secondary">{localPreview.framework}</Badge> : null}
                  {localPreview.packageManager ? <Badge variant="secondary">{localPreview.packageManager}</Badge> : null}
                </div>
                {localPreview.workspacePath ? (
                  <div className="mt-3 text-xs text-muted-foreground break-all font-mono">
                    {localPreview.workspacePath}
                  </div>
                ) : null}
                {managedPreview?.command ? (
                  <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs font-mono">
                    {managedPreview.command}
                  </div>
                ) : localPreview.suggestedStartCommand ? (
                  <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs font-mono">
                    {localPreview.suggestedStartCommand}
                  </div>
                ) : null}
                {managedPreview?.logPath ? (
                  <div className="mt-3 text-xs text-muted-foreground break-all font-mono">
                    log: {managedPreview.logPath}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card/60 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Design automation
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  MSX routes landing pages and digital product UI through the installed
                  <span className="mx-1 font-mono text-foreground">/superdesign</span>
                  skill by default. Agents should initialize, iterate against the live preview,
                  and ship a polished surface without operator copy-paste.
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Workflow
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    Superdesign is the default design pass
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Landing pages should go through the skill automatically before being called shipped.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Preview target
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {primaryPreview?.url ? "Live preview detected" : "Waiting on local preview"}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {primaryPreview?.url
                      ? "Agents should design against the shipped surface that is already running."
                      : "Once the preview is up, agents should use that live surface as the design reference."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Enforcement
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    Required before polished ship
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    MSX should treat rough UI as unfinished and keep routing design refinement automatically.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {previewSurfaces.map((surface) => (
                <div key={surface.id} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="text-sm font-medium">{surface.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{surface.meta}</div>
                  {surface.url ? (
                    <a
                      href={surface.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-4"
                    >
                      Open
                      {surface.type === "repo" ? <Github className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    </a>
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="break-all font-mono">{surface.meta}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-2xl">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Agents working here</CardTitle>
            <CardDescription>
              Lead ownership, assignees, and live activity touching this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {activeAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No agents are linked yet. Assign tasks or set a lead agent to populate this lane.
              </div>
            ) : (
              activeAgents.map((agent) => {
                if (!agent) return null;
                const liveCount = projectLiveRuns.filter((run) => run.agentId === agent.id).length;
                return (
                  <div key={agent.id} className="rounded-xl border border-border bg-card/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">@{agent.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{agent.title ?? agent.role}</div>
                      </div>
                      <Badge variant="secondary" className="capitalize">
                        {liveCount > 0 ? `${liveCount} live` : agent.status}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <div className="text-sm font-medium">Success tracks</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Separate the core product build from launch, virality, and revenue work.
                </div>
              </div>
              {successTracks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No success tracks linked yet. Attach goals to this project to make build, marketing,
                  virality, and revenue lanes explicit.
                </div>
              ) : (
                successTracks.map((goal) => (
                  <div key={goal.id} className="rounded-xl border border-border bg-card/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link to={`/goals/${goal.id}`} className="font-medium hover:underline">
                          {goal.title}
                        </Link>
                        {goal.description ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {goal.description}
                          </div>
                        ) : null}
                      </div>
                      <StatusBadge status={goal.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Tasks and metrics</CardTitle>
          <CardDescription>
            Track the build queue, blockers, and recent work moving through this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{activeTaskCount} active</Badge>
            <Badge variant="secondary">{blockedCount} blocked</Badge>
            <Badge variant="secondary">{doneCount} done</Badge>
          </div>

          {recentIssues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
              No tasks yet. When the orchestrator or a specialist creates issues for this project, they will show here.
            </div>
          ) : (
            <div className="space-y-3">
              {recentIssues.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Link to={issueUrl(issue)} className="font-medium hover:underline">
                        {issue.title}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Updated {formatDate(issue.updatedAt)}
                        {issue.assigneeAgentId && agentById.get(issue.assigneeAgentId)
                          ? ` · @${agentById.get(issue.assigneeAgentId)?.name}`
                          : ""}
                      </div>
                    </div>
                    <StatusBadge status={issue.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 h-5 w-5 rounded-md cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-[box-shadow]"
        style={{ backgroundColor: currentColor }}
        aria-label="Change project color"
      />
      {open && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-popover border border-border rounded-lg shadow-lg z-50 w-max">
          <div className="grid grid-cols-5 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-110 ${
                  color === currentColor
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-2 hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List (issues) tab content ── */

function ProjectIssuesList({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`paperclip:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ProjectConfigFieldKey, ProjectFieldSaveState>>>({});
  const fieldSaveRequestIds = useRef<Partial<Record<ProjectConfigFieldKey, number>>>({});
  const fieldSaveTimers = useRef<Partial<Record<ProjectConfigFieldKey, ReturnType<typeof setTimeout>>>>({});
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));
  const activeRouteTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;
  const pluginTabFromSearch = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return isProjectPluginTab(tab) ? tab : null;
  }, [location.search]);
  const activeTab = activeRouteTab ?? pluginTabFromSearch;

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;
  const {
    slots: pluginDetailSlots,
    isLoading: pluginDetailSlotsLoading,
  } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "project",
    companyId: resolvedCompanyId,
    enabled: !!resolvedCompanyId,
  });
  const pluginTabItems = useMemo(
    () => pluginDetailSlots.map((slot) => ({
      value: `plugin:${slot.pluginKey}:${slot.id}` as ProjectPluginTab,
      label: slot.displayName,
      slot,
    })),
    [pluginDetailSlots],
  );
  const activePluginTab = pluginTabItems.find((item) => item.value === activeTab) ?? null;

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const archiveProject = useMutation({
    mutationFn: (archived: boolean) =>
      projectsApi.update(
        projectLookupRef,
        { archivedAt: archived ? new Date().toISOString() : null },
        resolvedCompanyId ?? lookupCompanyId,
      ),
    onSuccess: (updatedProject, archived) => {
      invalidateProject();
      const name = updatedProject?.name ?? project?.name ?? "Project";
      if (archived) {
        pushToast({ title: `"${name}" has been archived`, tone: "success" });
        navigate("/dashboard");
      } else {
        pushToast({ title: `"${name}" has been unarchived`, tone: "success" });
      }
    },
    onError: (_, archived) => {
        pushToast({
        title: archived ? "Failed to archive project" : "Failed to unarchive project",
        tone: "error",
      });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
  });

  const { data: budgetOverview } = useQuery({
    queryKey: queryKeys.budgets.overview(resolvedCompanyId ?? "__none__"),
    queryFn: () => budgetsApi.overview(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? "Project" },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef]);

  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (isProjectPluginTab(activeTab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(activeTab)}`, { replace: true });
      return;
    }
    if (activeTab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`, { replace: true });
      return;
    }
    if (activeTab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`, { replace: true });
      return;
    }
    if (activeTab === "budget") {
      navigate(`/projects/${canonicalProjectRef}/budget`, { replace: true });
      return;
    }
    if (activeTab === "list") {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, [closePanel]);

  useEffect(() => {
    return () => {
      Object.values(fieldSaveTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setFieldState = useCallback((field: ProjectConfigFieldKey, state: ProjectFieldSaveState) => {
    setFieldSaveStates((current) => ({ ...current, [field]: state }));
  }, []);

  const scheduleFieldReset = useCallback((field: ProjectConfigFieldKey, delayMs: number) => {
    const existing = fieldSaveTimers.current[field];
    if (existing) clearTimeout(existing);
    fieldSaveTimers.current[field] = setTimeout(() => {
      setFieldSaveStates((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      delete fieldSaveTimers.current[field];
    }, delayMs);
  }, []);

  const updateProjectField = useCallback(async (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    const requestId = (fieldSaveRequestIds.current[field] ?? 0) + 1;
    fieldSaveRequestIds.current[field] = requestId;
    setFieldState(field, "saving");
    try {
      await projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId);
      invalidateProject();
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "saved");
      scheduleFieldReset(field, 1800);
    } catch (error) {
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "error");
      scheduleFieldReset(field, 3000);
      throw error;
    }
  }, [invalidateProject, lookupCompanyId, projectLookupRef, resolvedCompanyId, scheduleFieldReset, setFieldState]);

  const projectBudgetSummary = useMemo(() => {
    const matched = budgetOverview?.policies.find(
      (policy) => policy.scopeType === "project" && policy.scopeId === (project?.id ?? routeProjectRef),
    );
    if (matched) return matched;
    return {
      policyId: "",
      companyId: resolvedCompanyId ?? "",
      scopeType: "project",
      scopeId: project?.id ?? routeProjectRef,
      scopeName: project?.name ?? "Project",
      metric: "billed_cents",
      windowKind: "lifetime",
      amount: 0,
      observedAmount: 0,
      remainingAmount: 0,
      utilizationPercent: 0,
      warnPercent: 80,
      hardStopEnabled: true,
      notifyEnabled: true,
      isActive: false,
      status: "ok",
      paused: Boolean(project?.pausedAt),
      pauseReason: project?.pauseReason ?? null,
      windowStart: new Date(),
      windowEnd: new Date(),
    } satisfies BudgetPolicySummary;
  }, [budgetOverview?.policies, project, resolvedCompanyId, routeProjectRef]);

  const budgetMutation = useMutation({
    mutationFn: (amount: number) =>
      budgetsApi.upsertPolicy(resolvedCompanyId!, {
        scopeType: "project",
        scopeId: project?.id ?? routeProjectRef,
        amount,
        windowKind: "lifetime",
      }),
    onSuccess: () => {
      if (!resolvedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(resolvedCompanyId) });
    },
  });

  if (pluginTabFromSearch && !pluginDetailSlotsLoading && !activePluginTab) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  // Redirect bare /projects/:id to cached tab or default /issues
  if (routeProjectRef && activeTab === null) {
    let cachedTab: string | null = null;
    if (project?.id) {
      try { cachedTab = localStorage.getItem(`paperclip:project-tab:${project.id}`); } catch {}
    }
    if (cachedTab === "overview") {
      return <Navigate to={`/projects/${canonicalProjectRef}/overview`} replace />;
    }
    if (cachedTab === "configuration") {
      return <Navigate to={`/projects/${canonicalProjectRef}/configuration`} replace />;
    }
    if (cachedTab === "budget") {
      return <Navigate to={`/projects/${canonicalProjectRef}/budget`} replace />;
    }
    if (isProjectPluginTab(cachedTab)) {
      return <Navigate to={`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(cachedTab)}`} replace />;
    }
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const handleTabChange = (tab: ProjectTab) => {
    // Cache the active tab per project
    if (project?.id) {
      try { localStorage.setItem(`paperclip:project-tab:${project.id}`, tab); } catch {}
    }
    if (isProjectPluginTab(tab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(tab)}`);
      return;
    }
    if (tab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`);
    } else if (tab === "budget") {
      navigate(`/projects/${canonicalProjectRef}/budget`);
    } else if (tab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`);
    } else {
      navigate(`/projects/${canonicalProjectRef}/issues`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-7 flex items-center">
          <ColorPicker
            currentColor={project.color ?? "#6366f1"}
            onSelect={(color) => updateProject.mutate({ color })}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <InlineEditor
            value={project.name}
            onSave={(name) => updateProject.mutate({ name })}
            as="h2"
            className="text-xl font-bold"
          />
          {project.pauseReason === "budget" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-200">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Paused by budget hard stop
            </div>
          ) : null}
        </div>
      </div>

      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />

      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <Tabs value={activeTab ?? "list"} onValueChange={(value) => handleTabChange(value as ProjectTab)}>
        <PageTabBar
          items={[
            { value: "list", label: "Issues" },
            { value: "overview", label: "Overview" },
            { value: "configuration", label: "Configuration" },
            { value: "budget", label: "Budget" },
            ...pluginTabItems.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          ]}
          align="start"
          value={activeTab ?? "list"}
          onValueChange={(value) => handleTabChange(value as ProjectTab)}
        />
      </Tabs>

      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          companyId={resolvedCompanyId!}
          onUpdate={(data) => updateProject.mutate(data)}
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      )}

      {activeTab === "list" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} />
      )}

      {activeTab === "configuration" && (
        <div className="max-w-4xl">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
            onFieldUpdate={updateProjectField}
            getFieldSaveState={(field) => fieldSaveStates[field] ?? "idle"}
            onArchive={(archived) => archiveProject.mutate(archived)}
            archivePending={archiveProject.isPending}
          />
        </div>
      )}

      {activeTab === "budget" && resolvedCompanyId ? (
        <div className="max-w-3xl">
          <BudgetPolicyCard
            summary={projectBudgetSummary}
            variant="plain"
            isSaving={budgetMutation.isPending}
            onSave={(amount) => budgetMutation.mutate(amount)}
          />
        </div>
      ) : null}

      {activePluginTab && (
        <PluginSlotMount
          slot={activePluginTab.slot}
          context={{
            companyId: resolvedCompanyId,
            companyPrefix: companyPrefix ?? null,
            projectId: project.id,
            projectRef: canonicalProjectRef,
            entityId: project.id,
            entityType: "project",
          }}
          missingBehavior="placeholder"
        />
      )}
    </div>
  );
}
