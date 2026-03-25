import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Bot, Clock3, ListTodo, Plus } from "lucide-react";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, projectUrl } from "../lib/utils";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";

function daysActive(createdAt: Date | string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(1, Math.ceil((now - created) / (1000 * 60 * 60 * 24)));
}

export function Projects() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

    const projects = useMemo(
      () => (projectsQuery.data ?? []).filter((project) => !project.archivedAt),
    [projectsQuery.data],
  );

  const projectMetrics = useMemo(() => {
    const issues = issuesQuery.data ?? [];
    return new Map(
      projects.map((project) => {
        const projectIssues = issues.filter((issue) => issue.projectId === project.id);
        const workingIssues = projectIssues.filter(
          (issue) => issue.status === "todo" || issue.status === "in_progress" || issue.status === "blocked",
        );
        const agentIds = new Set(
          projectIssues
            .map((issue) => issue.assigneeAgentId)
            .concat(project.leadAgentId)
            .filter((value): value is string => Boolean(value)),
        );

        return [
          project.id,
          {
            totalIssues: projectIssues.length,
            activeIssues: workingIssues.length,
            agentCount: agentIds.size,
          },
        ];
      }),
    );
  }, [projects, issuesQuery.data]);

  if (!selectedCompanyId || !selectedCompany) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
        Select an environment to see its projects.
      </div>
    );
  }

  if (projectsQuery.isLoading || issuesQuery.isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card/70 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Project registry
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {selectedCompany.name} is the active environment. Inside it, projects can split cleanly
              into product build, marketing, virality, revenue, or any other agent-owned lane.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewProject}>
            <Plus className="mr-1 h-4 w-4" />
            Add Project
          </Button>
        </div>
      </section>

      {projectsQuery.error && (
        <p className="text-sm text-destructive">{projectsQuery.error.message}</p>
      )}

      {issuesQuery.error && (
        <p className="text-sm text-destructive">{issuesQuery.error.message}</p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background/80">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-medium">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create the first project in this environment and start assigning agents, goals, and tasks.
          </p>
          <Button className="mt-5" size="sm" onClick={openNewProject}>
            Add Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const metrics = projectMetrics.get(project.id) ?? {
              totalIssues: 0,
              activeIssues: 0,
              agentCount: project.leadAgentId ? 1 : 0,
            };

            return (
              <Link
                key={project.id}
                to={projectUrl(project)}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/25 hover:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border"
                      style={{ backgroundColor: `${project.color ?? "#6366f1"}20` }}
                    >
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-medium">{project.name}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {project.description?.trim() || "No project brief yet."}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" />
                      Agents
                    </div>
                    <div className="mt-2 text-lg font-semibold">{metrics.agentCount}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ListTodo className="h-3.5 w-3.5" />
                      Tasks
                    </div>
                    <div className="mt-2 text-lg font-semibold">{metrics.totalIssues}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Active
                    </div>
                    <div className="mt-2 text-lg font-semibold">{metrics.activeIssues}</div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>{daysActive(project.createdAt)}d active</span>
                  <span>{project.targetDate ? `Target ${formatDate(project.targetDate)}` : "Rolling roadmap"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
