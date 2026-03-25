import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createProjectSchema,
  createProjectWorkspaceSchema,
  isUuidLike,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { projectService, logActivity } from "../services/index.js";
import { conflict } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const execFileAsync = promisify(execFile);

type LocalPreviewSurface = {
  id: string;
  title: string;
  url: string;
  meta: string;
  framework: string;
  source: "workspace_process";
};

type LocalPreviewDiscovery = {
  workspacePath: string | null;
  framework: string | null;
  packageManager: string | null;
  suggestedStartCommand: string | null;
  surfaces: LocalPreviewSurface[];
  notes: string[];
  managedProcess: ManagedPreviewProcess | null;
};

type LocalProjectManifest = {
  framework: string | null;
  packageManager: string | null;
  suggestedStartCommand: string | null;
};

type ManagedPreviewProcess = {
  pid: number | null;
  command: string | null;
  logPath: string | null;
  startedAt: string | null;
  framework: string | null;
  port: number | null;
  status: "starting" | "running" | "stopped";
};

type ListenerProcess = {
  pid: string;
  command: string | null;
  cwd: string | null;
};

const FRAMEWORK_LABELS: Record<string, string> = {
  expo: "Expo",
  nextjs: "Next.js",
  vite: "Vite",
  cra: "Create React App",
  static: "Static web app",
};

const FRAMEWORK_PORTS: Record<string, number[]> = {
  expo: [8081],
  nextjs: [3000, 3001, 3002],
  vite: [5173, 4173, 4174],
  cra: [3000, 3001],
  static: [4173, 3000],
};
const MANAGED_PREVIEW_STATE_FILE = ".msx-preview.json";
const MANAGED_PREVIEW_LOG_FILE = ".msx-preview.log";
const PREVIEW_BOOT_TIMEOUT_MS = 30_000;
const PREVIEW_BOOT_POLL_INTERVAL_MS = 1_000;

function isSubpath(candidatePath: string, parentPath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function detectLocalProjectManifest(workspacePath: string): Promise<LocalProjectManifest> {
  const packageJsonPath = path.join(workspacePath, "package.json");
  const packageJson = await readJsonFile(packageJsonPath);
  const scripts =
    packageJson && typeof packageJson.scripts === "object" && packageJson.scripts !== null
      ? (packageJson.scripts as Record<string, unknown>)
      : {};
  const scriptNames = new Set(
    Object.keys(scripts).filter((key) => typeof scripts[key] === "string"),
  );
  const dependencies = new Set([
    ...Object.keys(
      packageJson && typeof packageJson.dependencies === "object" && packageJson.dependencies !== null
        ? (packageJson.dependencies as Record<string, unknown>)
        : {},
    ),
    ...Object.keys(
      packageJson && typeof packageJson.devDependencies === "object" && packageJson.devDependencies !== null
        ? (packageJson.devDependencies as Record<string, unknown>)
        : {},
    ),
  ]);

  let packageManager: string | null = null;
  if (await fileExists(path.join(workspacePath, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (await fileExists(path.join(workspacePath, "yarn.lock"))) packageManager = "yarn";
  else if (await fileExists(path.join(workspacePath, "package-lock.json"))) packageManager = "npm";
  else if (await fileExists(path.join(workspacePath, "bun.lockb"))) packageManager = "bun";

  let framework: string | null = null;
  if (
    dependencies.has("expo") ||
    (await fileExists(path.join(workspacePath, "app.json"))) ||
    (await fileExists(path.join(workspacePath, "expo.json")))
  ) {
    framework = "expo";
  } else if (dependencies.has("next")) {
    framework = "nextjs";
  } else if (
    dependencies.has("vite") ||
    (await fileExists(path.join(workspacePath, "vite.config.ts"))) ||
    (await fileExists(path.join(workspacePath, "vite.config.js"))) ||
    (await fileExists(path.join(workspacePath, "vite.config.mjs")))
  ) {
    framework = "vite";
  } else if (dependencies.has("react-scripts")) {
    framework = "cra";
  } else if (await fileExists(path.join(workspacePath, "index.html"))) {
    framework = "static";
  }

  let suggestedStartCommand: string | null = null;
  if (framework === "expo") {
    if (scriptNames.has("web")) suggestedStartCommand = `${packageManager ?? "npm"} run web`;
    else if (scriptNames.has("start")) suggestedStartCommand = `${packageManager ?? "npm"} start -- --web`;
    else suggestedStartCommand = "npx expo start --web";
  } else if (framework === "nextjs" || framework === "vite" || framework === "cra") {
    if (scriptNames.has("dev")) suggestedStartCommand = `${packageManager ?? "npm"} run dev`;
    else if (scriptNames.has("start")) suggestedStartCommand = `${packageManager ?? "npm"} start`;
  } else if (framework === "static") {
    suggestedStartCommand = "npx serve .";
  }

  return { framework, packageManager, suggestedStartCommand };
}

function buildScriptCommand(packageManager: string | null, script: string, args: string[] = []) {
  const safeArgs = args.join(" ");
  if (packageManager === "yarn") {
    return `yarn ${script}${safeArgs ? ` ${safeArgs}` : ""}`;
  }
  if (packageManager === "pnpm") {
    return `pnpm run ${script}${safeArgs ? ` -- ${safeArgs}` : ""}`;
  }
  if (packageManager === "bun") {
    return `bun run ${script}${safeArgs ? ` -- ${safeArgs}` : ""}`;
  }
  return `npm run ${script}${safeArgs ? ` -- ${safeArgs}` : ""}`;
}

function firstFrameworkPort(framework: string | null) {
  return framework ? (FRAMEWORK_PORTS[framework]?.[0] ?? null) : null;
}

function buildManagedPreviewCommand(manifest: LocalProjectManifest) {
  const packageManager = manifest.packageManager;

  switch (manifest.framework) {
    case "expo":
      if (packageManager === "pnpm") return "pnpm exec expo start --web --port 8081";
      if (packageManager === "yarn") return "yarn expo start --web --port 8081";
      if (packageManager === "bun") return "bunx expo start --web --port 8081";
      return "npx expo start --web --port 8081";
    case "nextjs":
      return buildScriptCommand(packageManager, "dev", ["--hostname", "127.0.0.1", "--port", "3000"]);
    case "vite":
      return buildScriptCommand(packageManager, "dev", ["--host", "127.0.0.1", "--port", "5173"]);
    case "cra": {
      const runner =
        packageManager === "yarn"
          ? "yarn start"
          : packageManager === "pnpm"
            ? "pnpm start"
            : packageManager === "bun"
              ? "bun run start"
              : "npm start";
      return `HOST=127.0.0.1 PORT=3000 ${runner}`;
    }
    case "static":
      return "npx serve . -l 4173";
    default:
      return manifest.suggestedStartCommand;
  }
}

async function pidIsRunning(pid: number | null) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function previewStatePath(workspacePath: string) {
  return path.join(workspacePath, MANAGED_PREVIEW_STATE_FILE);
}

async function readManagedPreviewState(workspacePath: string): Promise<ManagedPreviewProcess | null> {
  const raw = await readJsonFile(previewStatePath(workspacePath));
  if (!raw) return null;
  return {
    pid: typeof raw.pid === "number" ? raw.pid : null,
    command: typeof raw.command === "string" ? raw.command : null,
    logPath: typeof raw.logPath === "string" ? raw.logPath : null,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    framework: typeof raw.framework === "string" ? raw.framework : null,
    port: typeof raw.port === "number" ? raw.port : null,
    status:
      raw.status === "running" || raw.status === "stopped" || raw.status === "starting"
        ? raw.status
        : "stopped",
  };
}

async function writeManagedPreviewState(workspacePath: string, state: ManagedPreviewProcess) {
  await fs.writeFile(previewStatePath(workspacePath), JSON.stringify(state, null, 2), "utf8");
}

async function clearManagedPreviewState(workspacePath: string) {
  await fs.rm(previewStatePath(workspacePath), { force: true });
}

async function terminateManagedPreviewProcess(pid: number | null) {
  if (!pid) return;

  const tryKill = (targetPid: number, signal: NodeJS.Signals | number) => {
    try {
      process.kill(targetPid, signal);
      return true;
    } catch {
      return false;
    }
  };

  if (process.platform !== "win32") {
    tryKill(-pid, "SIGTERM");
  }
  tryKill(pid, "SIGTERM");

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (!(await pidIsRunning(pid))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (process.platform !== "win32") {
    tryKill(-pid, "SIGKILL");
  }
  tryKill(pid, "SIGKILL");
}

async function listListeningProcessesForPort(port: number): Promise<ListenerProcess[]> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"]);
    const pids = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("p"))
      .map((line) => line.slice(1))
      .filter(Boolean);

    return await Promise.all(
      pids.map(async (pid) => {
        let cwd: string | null = null;
        let command: string | null = null;

        try {
          const cwdResult = await execFileAsync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
          cwd =
            cwdResult.stdout
              .split("\n")
              .map((line) => line.trim())
              .find((line) => line.startsWith("n"))
              ?.slice(1)
              .trim() ?? null;
        } catch {
          cwd = null;
        }

        try {
          const commandResult = await execFileAsync("ps", ["-p", pid, "-o", "command="]);
          command = commandResult.stdout.trim() || null;
        } catch {
          command = null;
        }

        return { pid, cwd, command };
      }),
    );
  } catch {
    return [];
  }
}

function processLooksLikeVisualPreview(framework: string, process: ListenerProcess) {
  const command = process.command?.toLowerCase() ?? "";
  if (framework === "expo") {
    return command.includes("expo") && command.includes("web");
  }
  if (framework === "nextjs") return command.includes("next");
  if (framework === "vite") return command.includes("vite");
  if (framework === "cra") return command.includes("react-scripts");
  return true;
}

async function discoverLocalPreview(project: Awaited<ReturnType<ReturnType<typeof projectService>["getById"]>>): Promise<LocalPreviewDiscovery> {
  const workspacePath = project?.codebase.effectiveLocalFolder ?? null;
  if (!project || !workspacePath) {
    return {
      workspacePath: null,
      framework: null,
      packageManager: null,
      suggestedStartCommand: null,
      surfaces: [],
      notes: [],
      managedProcess: null,
    };
  }

  const resolvedWorkspacePath = await fs.realpath(workspacePath).catch(() => path.resolve(workspacePath));
  const manifest = await detectLocalProjectManifest(resolvedWorkspacePath);
  const framework = manifest.framework;
  const ports = framework ? FRAMEWORK_PORTS[framework] ?? [] : [];
  const surfaces: LocalPreviewSurface[] = [];
  const notes: string[] = [];
  let managedProcess = await readManagedPreviewState(resolvedWorkspacePath);

  if (managedProcess?.pid && !(await pidIsRunning(managedProcess.pid))) {
    managedProcess = {
      ...managedProcess,
      status: "stopped",
    };
    await clearManagedPreviewState(resolvedWorkspacePath);
  }

  for (const port of ports) {
    const processes = await listListeningProcessesForPort(port);
    const matchedProcess = processes.find((process) => {
      if (!process.cwd) return false;
      return isSubpath(process.cwd, resolvedWorkspacePath) && processLooksLikeVisualPreview(framework ?? "", process);
    });
    if (!matchedProcess) continue;

    const frameworkLabel = framework ? FRAMEWORK_LABELS[framework] ?? framework : "Local";
    surfaces.push({
      id: `local-preview:${port}`,
      title: `${frameworkLabel} local preview`,
      url: `http://127.0.0.1:${port}`,
      meta: `Matched workspace process on port ${port}${matchedProcess.command ? ` · ${matchedProcess.command}` : ""}`,
      framework: framework ?? "unknown",
      source: "workspace_process",
    });
  }

  if (!framework) {
    notes.push("No recognized local app framework was detected in this workspace yet.");
  } else if (surfaces.length === 0) {
    notes.push(`${FRAMEWORK_LABELS[framework] ?? framework} workspace detected, but no matching local preview process is running yet.`);
  }

  if (managedProcess) {
    const hasLiveSurface = surfaces.some((surface) => surface.source === "workspace_process");
    managedProcess = {
      ...managedProcess,
      status: hasLiveSurface
        ? "running"
        : managedProcess.status === "stopped"
          ? "stopped"
          : "starting",
    };

    if (managedProcess.status === "starting") {
      notes.unshift("MSX is starting a managed local preview for this company.");
    }
  }

  return {
    workspacePath: resolvedWorkspacePath,
    framework,
    packageManager: manifest.packageManager,
    suggestedStartCommand: manifest.suggestedStartCommand,
    surfaces,
    notes,
    managedProcess,
  };
}

async function startManagedLocalPreview(
  project: Awaited<ReturnType<ReturnType<typeof projectService>["getById"]>>,
) {
  if (!project?.codebase.effectiveLocalFolder) {
    throw conflict("Project does not have a local workspace to preview.");
  }

  const resolvedWorkspacePath = await fs
    .realpath(project.codebase.effectiveLocalFolder)
    .catch(() => path.resolve(project.codebase.effectiveLocalFolder));
  const manifest = await detectLocalProjectManifest(resolvedWorkspacePath);
  const command = buildManagedPreviewCommand(manifest);

  if (!command) {
    throw conflict("No supported local preview command was detected for this workspace.");
  }

  const existingState = await readManagedPreviewState(resolvedWorkspacePath);
  if (existingState?.pid && (await pidIsRunning(existingState.pid))) {
    return discoverLocalPreview(project);
  }

  const logPath = path.join(resolvedWorkspacePath, MANAGED_PREVIEW_LOG_FILE);
  const logHandle = await fs.open(logPath, "a");

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const child = spawn(shell, ["-lc", command], {
      cwd: resolvedWorkspacePath,
      env: {
        ...process.env,
        BROWSER: "none",
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        FORCE_COLOR: "0",
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", logHandle.fd, logHandle.fd],
    });

    if (!child.pid) {
      throw conflict("Preview process failed to start.");
    }

    child.unref();

    await writeManagedPreviewState(resolvedWorkspacePath, {
      pid: child.pid,
      command,
      logPath,
      startedAt: new Date().toISOString(),
      framework: manifest.framework,
      port: firstFrameworkPort(manifest.framework),
      status: "starting",
    });
  } finally {
    await logHandle.close().catch(() => undefined);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < PREVIEW_BOOT_TIMEOUT_MS) {
    const discovery = await discoverLocalPreview(project);
    if (discovery.surfaces.length > 0) {
      return discovery;
    }
    await new Promise((resolve) => setTimeout(resolve, PREVIEW_BOOT_POLL_INTERVAL_MS));
  }

  return discoverLocalPreview(project);
}

async function stopManagedLocalPreview(
  project: Awaited<ReturnType<ReturnType<typeof projectService>["getById"]>>,
) {
  if (!project?.codebase.effectiveLocalFolder) {
    return discoverLocalPreview(project);
  }

  const resolvedWorkspacePath = await fs
    .realpath(project.codebase.effectiveLocalFolder)
    .catch(() => path.resolve(project.codebase.effectiveLocalFolder));
  const state = await readManagedPreviewState(resolvedWorkspacePath);

  if (state?.pid) {
    await terminateManagedPreviewProcess(state.pid);
  }
  await clearManagedPreviewState(resolvedWorkspacePath);

  return discoverLocalPreview(project);
}

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(project);
  });

  router.get("/projects/:id/local-preview", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    const discovery = await discoverLocalPreview(project);
    res.json(discovery);
  });

  router.post("/projects/:id/local-preview/start", async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);
      const discovery = await startManagedLocalPreview(project);
      res.json(discovery);
    } catch (error) {
      next(error);
    }
  });

  router.post("/projects/:id/local-preview/stop", async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);
      const discovery = await stopManagedLocalPreview(project);
      res.json(discovery);
    } catch (error) {
      next(error);
    }
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    const project = await svc.create(companyId, projectData);
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project;

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
      },
    });
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const body = { ...req.body };
    if (typeof body.archivedAt === "string") {
      body.archivedAt = new Date(body.archivedAt);
    }
    const project = await svc.update(id, body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: req.body,
    });

    res.json(project);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
