export const SUPERDESIGN_APP_URL = "https://app.superdesign.dev/";
export const SUPERDESIGN_DOCS_URL = "https://docs.superdesign.dev/";
export const SUPERDESIGN_REPO_URL = "https://github.com/superdesigndev/superdesign-platform";
export const SUPERDESIGN_SKILL_COMMAND = "/superdesign";

export type SuperdesignDeviceMode = "mobile" | "tablet" | "desktop";

export function inferSuperdesignDeviceMode(options: {
  framework?: string | null;
  previewUrl?: string | null;
}): SuperdesignDeviceMode {
  const framework = (options.framework ?? "").toLowerCase();
  const previewUrl = (options.previewUrl ?? "").toLowerCase();

  if (framework.includes("expo") || framework.includes("react-native")) {
    return "mobile";
  }

  if (previewUrl.includes("mobile") || previewUrl.includes("iphone")) {
    return "mobile";
  }

  return "desktop";
}

export function buildSuperdesignCreateProjectCommand(
  title: string,
  device: SuperdesignDeviceMode,
) {
  return `superdesign create-project --title ${JSON.stringify(title)} --device ${device}`;
}

export function buildSuperdesignInitCommand() {
  return "superdesign init";
}

export function buildSuperdesignBrandGuideCommand(url: string) {
  return `superdesign extract-brand-guide --url ${JSON.stringify(url)}`;
}

export function buildSuperdesignSkillPrompt(target: string) {
  return `${SUPERDESIGN_SKILL_COMMAND} help me design ${target}`;
}
