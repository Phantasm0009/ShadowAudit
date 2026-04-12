#!/usr/bin/env node

import { Command, Option } from "commander";
import chalk from "chalk";

import {
  CliError,
  detectFileType,
  executeScan,
  readFromStdin,
  readScanFile,
  resolveDefaultManifestPath,
  printScanResult,
} from "./scanner.js";
import type { FileType } from "./types.js";

interface ScanCommandOptions {
  stdin?: boolean;
  type?: FileType;
}

async function runScanCommand(file: string | undefined, options: ScanCommandOptions) {
  if (options.stdin && file) {
    throw new CliError("Provide either a file path or --stdin, not both.");
  }

  const preparedInput = options.stdin
    ? await readFromStdin(options.type)
    : await readScanFile(
        file ?? ((await resolveDefaultManifestPath()) as string),
        options.type,
      );

  if (!preparedInput.filePath && !options.stdin) {
    throw new CliError(
      "No dependency file found in the current directory. Looked for package.json and requirements.txt.",
    );
  }

  const scanResult = await executeScan({
    content: preparedInput.content,
    fileType: preparedInput.fileType,
    filePath: preparedInput.filePath,
  });

  printScanResult(scanResult);
}

function createProgram(): Command {
  const program = new Command();

  program
    .name("shadowaudit")
    .description("CLI for scanning npm and PyPI dependency manifests with ShadowAudit.")
    .version("1.0.0");

  program
    .command("scan")
    .argument("[file]", "Path to package.json or requirements.txt")
    .option("--stdin", "Read manifest content from stdin")
    .addOption(
      new Option("--type <type>", "Manifest type when using --stdin")
        .choices(["package.json", "requirements.txt"]),
    )
    .action(async (file: string | undefined, options: ScanCommandOptions) => {
      if (!file && !options.stdin) {
        const defaultFile = await resolveDefaultManifestPath();

        if (!defaultFile) {
          throw new CliError(
            "No dependency file found in the current directory. Looked for package.json and requirements.txt.",
          );
        }

        await runScanCommand(defaultFile, options);
        return;
      }

      if (file && !options.type) {
        const detectedType = detectFileType(file);

        if (!detectedType && !options.stdin) {
          throw new CliError(
            `Unable to detect dependency file type for "${file}". Use --type package.json or --type requirements.txt.`,
          );
        }
      }

      await runScanCommand(file, options);
    });

  return program;
}

const program = createProgram();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown ShadowAudit CLI error.";

  console.error(chalk.red(`Error: ${message}`));
  process.exitCode = 1;
});
