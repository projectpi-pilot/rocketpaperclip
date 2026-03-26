import fs from "node:fs/promises";
import path from "node:path";

const CORE_DIRECTORIES = [
  "academic",
  "design",
  "engineering",
  "game-development",
  "marketing",
  "paid-media",
  "product",
  "project-management",
  "sales",
  "spatial-computing",
  "specialized",
  "support",
  "testing",
];

const EXTRA_AGENT_FILES = ["integrations/mcp-memory/backend-architect-with-memory.md"];

const MSX_STUDIO_OPERATING_STANDARD = [
  "## MSX Studio Operating Standard",
  "",
  "- Do not stop at a prototype, runnable build, or MVP label.",
  "- Ship the thinnest credible slice fast, then keep refining until real end users can pay.",
  "- Treat premium quality, modern execution, virality readiness, retention readiness, and monetization readiness as required.",
  "- If the core product works but still feels rough, keep iterating on UX, positioning, pricing, conversion, and growth loops.",
  "- Escalate only when a true external blocker prevents progress; otherwise continue driving the company forward.",
  "",
].join("\n");

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return { data: {}, body: source };
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: source };
  }

  const raw = source.slice(4, end).split("\n");
  const data = {};

  for (const line of raw) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = stripQuotes(match[2].trim());
  }

  return { data, body: source.slice(end + 5) };
}

function toTitleCaseFromSlug(value) {
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugFromRelativePath(relativePath) {
  return relativePath.replace(/\.md$/i, "").replace(/[\\/]/g, "-").toLowerCase();
}

async function collectMarkdownFiles(rootDir, relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(rootDir, relativePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function buildCompanyMarkdown(agentCount) {
  return [
    "---",
    'schema: "agentcompanies/v1"',
    'name: "Agency Agents"',
    'slug: "agency-agents"',
    'description: "Imported AI specialist roster converted from the agency-agents repository for local MSX use."',
    "---",
    "",
    "# Agency Agents",
    "",
    `Portable company package generated from the \`agency-agents\` repository with ${agentCount} agent definitions.`,
    "",
    "This package preserves each source agent's markdown instructions as the imported agent body.",
    "",
    MSX_STUDIO_OPERATING_STANDARD,
    "",
  ].join("\n");
}

function buildAgentMarkdown({ name, title, description, sourcePath, body }) {
  const lines = [
    "---",
    `name: ${JSON.stringify(name)}`,
  ];

  if (title) {
    lines.push(`title: ${JSON.stringify(title)}`);
  }
  if (description) {
    lines.push(`description: ${JSON.stringify(description)}`);
  }

  lines.push("---", "", `# ${name}`, "");
  lines.push(`Imported from \`${sourcePath}\` in the source agency repo.`, "");
  lines.push(MSX_STUDIO_OPERATING_STANDARD, "");
  lines.push(body.trim(), "");
  return lines.join("\n");
}

async function main() {
  const [, , sourceRepoArg, outputDirArg] = process.argv;
  if (!sourceRepoArg || !outputDirArg) {
    console.error("Usage: node scripts/convert-agency-agents-to-msx-package.mjs <source-repo-dir> <output-dir>");
    process.exit(1);
  }

  const sourceRepoDir = path.resolve(sourceRepoArg);
  const outputDir = path.resolve(outputDirArg);

  const discovered = [];
  for (const relativeDir of CORE_DIRECTORIES) {
    discovered.push(...(await collectMarkdownFiles(sourceRepoDir, relativeDir)));
  }
  discovered.push(...EXTRA_AGENT_FILES);

  const uniqueFiles = [...new Set(discovered)].sort();

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "agents"), { recursive: true });
  await fs.writeFile(path.join(outputDir, "COMPANY.md"), buildCompanyMarkdown(uniqueFiles.length), "utf8");

  for (const relativeFile of uniqueFiles) {
    const absoluteFile = path.join(sourceRepoDir, relativeFile);
    const raw = await fs.readFile(absoluteFile, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const slug = slugFromRelativePath(relativeFile);
    const agentName = data.name || toTitleCaseFromSlug(path.basename(relativeFile, ".md"));
    const title = data.name || toTitleCaseFromSlug(path.dirname(relativeFile).split(path.sep).pop() || "Agent");
    const description = data.description || `Imported from ${relativeFile}`;
    const agentDir = path.join(outputDir, "agents", slug);

    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "AGENTS.md"),
      buildAgentMarkdown({
        name: agentName,
        title,
        description,
        sourcePath: relativeFile,
        body,
      }),
      "utf8",
    );
  }

  console.log(`Generated ${uniqueFiles.length} agents in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
