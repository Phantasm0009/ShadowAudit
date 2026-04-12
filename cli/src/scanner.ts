import { readFile } from "node:fs/promises";
import path from "node:path";

import axios from "axios";
import chalk from "chalk";
import ora from "ora";

import {
  formatFindingsTable,
  formatFindingHeadline,
  formatRiskScore,
  formatSummary,
  formatTimestamp,
} from "./formatter.js";
import type { FileType, ScanRequest, ScanResult } from "./types.js";

const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15000;

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export interface PreparedScanInput {
  content: string;
  fileType: FileType;
  filePath?: string;
}

export interface ScanExecutionOptions {
  content: string;
  fileType: FileType;
  filePath?: string;
  projectName?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

export function detectFileType(fileName: string): FileType | null {
  const normalized = fileName.toLowerCase();
  const basename = path.basename(normalized);

  if (basename === "package.json" || normalized.endsWith(".json")) {
    return "package.json";
  }

  if (
    basename === "requirements.txt" ||
    normalized.endsWith(".txt")
  ) {
    return "requirements.txt";
  }

  return null;
}

export async function resolveDefaultManifestPath(
  cwd: string = process.cwd(),
): Promise<string | null> {
  const candidates = ["package.json", "requirements.txt"];

  for (const candidate of candidates) {
    const absolutePath = path.join(cwd, candidate);

    try {
      await readFile(absolutePath, "utf8");
      return absolutePath;
    } catch {
      continue;
    }
  }

  return null;
}

export async function readScanFile(
  filePath: string,
  providedType?: FileType,
): Promise<PreparedScanInput> {
  const resolvedPath = path.resolve(filePath);
  let content: string;

  try {
    content = await readFile(resolvedPath, "utf8");
  } catch {
    throw new CliError(`Unable to read dependency file: ${resolvedPath}`);
  }

  const fileType = providedType ?? detectFileType(resolvedPath);

  if (!fileType) {
    throw new CliError(
      `Unable to detect dependency file type for "${filePath}". Use --type package.json or --type requirements.txt.`,
    );
  }

  if (content.trim().length === 0) {
    throw new CliError(`Dependency file is empty: ${resolvedPath}`);
  }

  return {
    content,
    fileType,
    filePath: resolvedPath,
  };
}

export async function readFromStdin(fileType?: FileType): Promise<PreparedScanInput> {
  if (!fileType) {
    throw new CliError(
      "The --type flag is required when using --stdin. Choose package.json or requirements.txt.",
    );
  }

  if (process.stdin.isTTY) {
    throw new CliError("No piped input detected on stdin.");
  }

  const chunks: string[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  const content = chunks.join("");

  if (content.trim().length === 0) {
    throw new CliError("Received empty input from stdin.");
  }

  return {
    content,
    fileType,
  };
}

function buildProjectName(filePath?: string): string | undefined {
  if (filePath) {
    return path.basename(path.dirname(filePath));
  }

  return path.basename(process.cwd());
}

function extractApiErrorMessage(error: unknown, apiUrl: string, timeoutMs: number): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    if (status && detail) {
      return `ShadowAudit API rejected the scan (${status}): ${String(detail)}`;
    }

    if (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNREFUSED"
    ) {
      return `ShadowAudit API request timed out or the server is unavailable at ${apiUrl} (timeout ${timeoutMs}ms).`;
    }

    if (!error.response) {
      return `ShadowAudit API request timed out or the server is unavailable at ${apiUrl} (timeout ${timeoutMs}ms).`;
    }
  }

  return "Unexpected error while contacting the ShadowAudit API.";
}

export function printScanResult(scanResult: ScanResult): void {
  console.log("");
  console.log(chalk.bold("ShadowAudit Scan Complete"));
  console.log(chalk.gray(`Scan ID: ${scanResult.scan_id}`));
  console.log(chalk.gray(`Timestamp: ${formatTimestamp(scanResult.timestamp)}`));
  console.log("");
  console.log(`${chalk.bold("Overall risk score:")} ${formatRiskScore(scanResult.overall_risk_score)}`);
  console.log(chalk.white(formatSummary(scanResult)));

  const findingsTable = formatFindingsTable(scanResult);

  if (findingsTable) {
    console.log("");
    console.log(chalk.bold(formatFindingHeadline(scanResult)));
    console.log(findingsTable);
  } else {
    console.log("");
    console.log(chalk.greenBright("No critical or high findings detected."));
  }
}

export async function executeScan({
  content,
  fileType,
  filePath,
  projectName,
  apiUrl = process.env.SHADOWAUDIT_API ?? DEFAULT_API_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ScanExecutionOptions): Promise<ScanResult> {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  const spinner = ora({
    text: `Scanning ${filePath ? path.basename(filePath) : "stdin input"} with ShadowAudit...`,
    isEnabled: process.stdout.isTTY,
  }).start();

  try {
    const payload: ScanRequest = {
      file_content: content,
      file_type: fileType,
      project_name: projectName ?? buildProjectName(filePath),
    };
    const response = await axios.post<ScanResult>(
      `${normalizedApiUrl}/api/v1/scan`,
      payload,
      {
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    spinner.succeed("Scan complete.");
    return response.data;
  } catch (error) {
    spinner.fail("Scan failed.");
    throw new CliError(extractApiErrorMessage(error, normalizedApiUrl, timeoutMs));
  }
}
