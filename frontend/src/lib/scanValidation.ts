import { FileType } from "@/lib/types";

export const MAX_FILE_SIZE_BYTES = 1024 * 1024;

export function sanitizeProjectName(value: string): string {
  return value
    .replace(/[^\w ./@-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function validateDependencyContent(
  content: string,
  fileType: FileType,
): string | null {
  if (!content.trim()) {
    return "Provide dependency content before starting a scan.";
  }

  if (fileType === "package.json") {
    try {
      const parsed = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencyCount =
        Object.keys(parsed.dependencies ?? {}).length +
        Object.keys(parsed.devDependencies ?? {}).length;

      if (dependencyCount === 0) {
        return "package.json must include at least one dependency or devDependency.";
      }
    } catch {
      return "package.json must contain valid JSON before scanning.";
    }

    return null;
  }

  const packageLines = content
    .split(/\r?\n/)
    .map((line) => line.split("#", 1)[0].trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !line.startsWith("-r") &&
        !line.startsWith("--requirement"),
    );

  if (packageLines.length === 0) {
    return "requirements.txt must include at least one package requirement.";
  }

  return null;
}
