import type { Project, ProjectWorkspace } from "@paperclipai/shared";
import { api } from "./client";

export interface LocalPreviewSurface {
  id: string;
  title: string;
  url: string;
  meta: string;
  framework: string;
  source: "workspace_process";
}

export interface LocalPreviewDiscovery {
  workspacePath: string | null;
  framework: string | null;
  packageManager: string | null;
  suggestedStartCommand: string | null;
  surfaces: LocalPreviewSurface[];
  notes: string[];
  managedProcess: {
    pid: number | null;
    command: string | null;
    logPath: string | null;
    startedAt: string | null;
    framework: string | null;
    port: number | null;
    status: "starting" | "running" | "stopped";
  } | null;
}

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  localPreview: (projectId: string, companyId?: string) =>
    api.get<LocalPreviewDiscovery>(projectPath(projectId, companyId, "/local-preview")),
  startLocalPreview: (projectId: string, companyId?: string) =>
    api.post<LocalPreviewDiscovery>(projectPath(projectId, companyId, "/local-preview/start"), {}),
  stopLocalPreview: (projectId: string, companyId?: string) =>
    api.post<LocalPreviewDiscovery>(projectPath(projectId, companyId, "/local-preview/stop"), {}),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
};
