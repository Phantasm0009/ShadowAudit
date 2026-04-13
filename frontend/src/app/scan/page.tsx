"use client";

import { motion } from "framer-motion";
import { ArrowRight, FileCode2, Sparkles, TerminalSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { FileUploader, UploadedDependencyFile } from "@/components/scan/FileUploader";
import { ScanProgress } from "@/components/scan/ScanProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useScan } from "@/hooks/useScan";
import { normalizeError } from "@/lib/errors";
import { MAX_FILE_SIZE_BYTES, sanitizeProjectName, validateDependencyContent } from "@/lib/scanValidation";
import { FileType, ScanRequest } from "@/lib/types";

const PACKAGE_JSON_EXAMPLE = `{
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "axios": "^1.7.0"
  }
}`;

const REQUIREMENTS_EXAMPLE = `fastapi==0.104.1
uvicorn>=0.24.0
requests==2.32.3`;

export default function ScanPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("upload");
  const [projectName, setProjectName] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedDependencyFile | null>(
    null,
  );
  const [pastedContent, setPastedContent] = useState("");
  const [selectedFileType, setSelectedFileType] =
    useState<FileType>("package.json");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate, isLoading, error, reset } = useScan();
  const { didReceiveOfflineEvent } = useNetworkStatus();

  const currentContent =
    activeTab === "upload" ? uploadedFile?.content ?? "" : pastedContent;
  const currentFileType =
    activeTab === "upload"
      ? uploadedFile?.fileType ?? selectedFileType
      : selectedFileType;

  const isSubmitDisabled = useMemo(
    () => isLoading || currentContent.trim().length === 0,
    [currentContent, isLoading],
  );

  const submitScan = () => {
    reset();
    setValidationError(null);

    const validationMessage = validateDependencyContent(
      currentContent,
      currentFileType,
    );
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }

    const payload: ScanRequest = {
      file_content: currentContent,
      file_type: currentFileType,
      project_name: sanitizeProjectName(projectName) || undefined,
    };

    mutate(payload, {
      onSuccess: (scanResult) => {
        router.push(`/scan/${scanResult.scan_id}`);
      },
    });
  };

  const normalizedError = error
    ? normalizeError(error, "ShadowAudit could not start this scan.")
    : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-8">
          <div className="space-y-5">
            <Badge className="bg-sky-500/15 font-mono text-sky-200 hover:bg-sky-500/15">
              <Sparkles className="mr-1.5 size-3.5" />
              Live dependency intake
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Upload or paste your manifest, then let ShadowAudit trace what
                your dependencies are hiding.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-400">
                This workflow accepts npm and PyPI dependency definitions,
                forwards them to the FastAPI backend, and routes you to a
                per-scan result page as soon as analysis starts.
              </p>
            </div>
          </div>

          <Card className="border border-white/10 bg-slate-950/75 shadow-[0_24px_80px_rgba(2,6,23,0.8)]">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-white">Start a new scan</CardTitle>
                  <CardDescription className="text-slate-400">
                    Choose a file or paste raw dependency content below.
                  </CardDescription>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="border-slate-700 bg-slate-900 font-mono text-slate-300"
                    >
                      {currentFileType}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    File type auto-detects from the uploaded extension.
                  </TooltipContent>
                </Tooltip>
              </div>

              <Input
                value={projectName}
                onChange={(event) => {
                  setProjectName(sanitizeProjectName(event.target.value));
                  setValidationError(null);
                }}
                placeholder="Optional project name"
                className="h-11 border-white/10 bg-slate-900/80 text-white placeholder:text-slate-500"
              />
            </CardHeader>

            <CardContent className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList
                  variant="line"
                  className="w-full justify-start border-b border-white/10 p-0"
                >
                  <TabsTrigger value="upload" className="rounded-b-none px-4">
                    Upload File
                  </TabsTrigger>
                  <TabsTrigger value="paste" className="rounded-b-none px-4">
                    Paste Content
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="pt-6">
                  <FileUploader
                    onFileAccepted={(file) => {
                      setUploadedFile(file);
                      setSelectedFileType(file.fileType);
                      setValidationError(null);
                      reset();
                    }}
                  />
                </TabsContent>

                <TabsContent value="paste" className="space-y-4 pt-6">
                  <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="font-medium">Dependency file type</span>
                      <select
                        value={selectedFileType}
                        onChange={(event) => {
                          setSelectedFileType(event.target.value as FileType);
                          setValidationError(null);
                        }}
                        className="h-11 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 font-mono text-sm text-white outline-none transition focus:border-sky-400"
                      >
                        <option value="package.json">package.json</option>
                        <option value="requirements.txt">
                          requirements.txt
                        </option>
                      </select>
                    </label>

                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-4 py-3">
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Example
                      </p>
                      <pre className="mt-2 overflow-x-auto text-sm leading-6 text-slate-300">
                        {selectedFileType === "package.json"
                          ? PACKAGE_JSON_EXAMPLE
                          : REQUIREMENTS_EXAMPLE}
                      </pre>
                    </div>
                  </div>

                  <Textarea
                    value={pastedContent}
                    onChange={(event) => {
                      setPastedContent(event.target.value);
                      setValidationError(null);
                      reset();
                    }}
                    placeholder={
                      selectedFileType === "package.json"
                        ? PACKAGE_JSON_EXAMPLE
                        : REQUIREMENTS_EXAMPLE
                    }
                    className="min-h-[320px] border-white/10 bg-slate-950 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </TabsContent>
              </Tabs>

              {validationError ? (
                <ErrorAlert
                  title="Input validation failed"
                  message={validationError}
                  icon={<TerminalSquare className="size-4" />}
                />
              ) : didReceiveOfflineEvent ? (
                <ErrorAlert
                  title="Offline"
                  message="You appear to be offline. Reconnect before trying again."
                  icon={<TerminalSquare className="size-4" />}
                />
              ) : normalizedError ? (
                <ErrorAlert
                  title="Scan failed"
                  message={normalizedError.message}
                  retryLabel="Retry scan"
                  onRetry={submitScan}
                  icon={<TerminalSquare className="size-4" />}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="lg"
                  className="h-12 rounded-full bg-sky-500 px-6 text-slate-950 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500"
                  disabled={isSubmitDisabled}
                  onClick={submitScan}
                >
                  {isLoading ? "Scanning..." : "Scan Dependencies"}
                  <ArrowRight className="size-4" />
                </Button>

                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Submits to <span className="text-slate-300">/api/v1/scan</span>
                </p>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-600">
                  Max upload size {Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.8)]"
          >
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sky-300">
              Intake checklist
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <li className="flex items-start gap-3">
                <FileCode2 className="mt-1 size-4 text-sky-300" />
                Drag-and-drop validates extension and file size before upload.
              </li>
              <li className="flex items-start gap-3">
                <FileCode2 className="mt-1 size-4 text-sky-300" />
                Paste mode supports both npm and PyPI formats with syntax-like
                formatting.
              </li>
              <li className="flex items-start gap-3">
                <FileCode2 className="mt-1 size-4 text-sky-300" />
                Successful submissions redirect to a dedicated scan result route.
              </li>
            </ul>
          </motion.div>

          {isLoading ? (
            <ScanProgress />
          ) : (
            <Card className="border border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">What happens next</CardTitle>
                <CardDescription className="text-slate-400">
                  ShadowAudit stages scans in the same order as the backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-300">
                <p>
                  1. Parse your dependency manifest and map the package tree.
                </p>
                <p>2. Check vulnerabilities, maintainer drift, and typosquats.</p>
                <p>3. Escalate suspicious packages into GPT-backed behavior review.</p>
                <p>4. Redirect you into a scan-specific result page.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
