"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, FileJson2, FileText, UploadCloud } from "lucide-react";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { FileType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MAX_FILE_SIZE_BYTES } from "@/lib/scanValidation";
import { cn } from "@/lib/utils";

export interface UploadedDependencyFile {
  fileName: string;
  fileType: FileType;
  content: string;
  size: number;
}

interface FileUploaderProps {
  onFileAccepted: (file: UploadedDependencyFile) => void;
}

function detectFileType(fileName: string): FileType | null {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".json")) {
    return "package.json";
  }

  if (normalizedName.endsWith(".txt")) {
    return "requirements.txt";
  }

  return null;
}

export function FileUploader({ onFileAccepted }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedDependencyFile | null>(
    null,
  );

  const dropZoneState = useMemo(() => {
    if (errorMessage) {
      return "error";
    }
    if (uploadedFile) {
      return "uploaded";
    }
    if (isDragging) {
      return "drag-over";
    }
    return "idle";
  }, [errorMessage, isDragging, uploadedFile]);

  const handleFile = async (file: File) => {
    const detectedType = detectFileType(file.name);
    if (!detectedType) {
      setUploadedFile(null);
      setErrorMessage("Only .json and .txt dependency files are supported.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadedFile(null);
      setErrorMessage("File is too large. Maximum supported size is 1MB.");
      return;
    }

    const content = await file.text();
    if (!content.trim()) {
      setUploadedFile(null);
      setErrorMessage("The selected dependency file is empty.");
      return;
    }

    const nextFile = {
      fileName: file.name,
      fileType: detectedType,
      content,
      size: file.size,
    } satisfies UploadedDependencyFile;

    setErrorMessage(null);
    setUploadedFile(nextFile);
    onFileAccepted(nextFile);
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleFile(file);
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await handleFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".json,.txt"
        className="hidden"
        onChange={onInputChange}
      />

      <motion.div
        layout
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        data-state={dropZoneState}
        className={cn(
          "relative overflow-hidden rounded-3xl border border-dashed p-8 transition-colors",
          "bg-slate-950/70 backdrop-blur-xl",
          "data-[state=idle]:border-slate-800 data-[state=idle]:hover:border-sky-400/60",
          "data-[state=drag-over]:border-sky-400 data-[state=drag-over]:bg-sky-500/10",
          "data-[state=uploaded]:border-emerald-400/60 data-[state=uploaded]:bg-emerald-500/10",
          "data-[state=error]:border-rose-500/70 data-[state=error]:bg-rose-500/10",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_45%)]" />

        <div className="relative flex flex-col items-center gap-4 text-center">
          <div
            className={cn(
              "rounded-2xl border p-4",
              dropZoneState === "uploaded"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : dropZoneState === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-slate-800 bg-slate-900/80 text-sky-300",
            )}
          >
            {uploadedFile ? (
              <CheckCircle2 className="size-7" />
            ) : errorMessage ? (
              <AlertCircle className="size-7" />
            ) : (
              <UploadCloud className="size-7" />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-50">
              Drop your dependency file here
            </h3>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-400">
              Supports <span className="font-mono text-slate-200">package.json</span>{" "}
              and <span className="font-mono text-slate-200">requirements.txt</span>
              . Files larger than 1MB are rejected.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge
              variant="outline"
              className="border-slate-700 bg-slate-900/70 font-mono text-slate-300"
            >
              <FileJson2 className="mr-1.5 size-3.5" />
              .json
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-700 bg-slate-900/70 font-mono text-slate-300"
            >
              <FileText className="mr-1.5 size-3.5" />
              .txt
            </Badge>
          </div>

          <Button
            type="button"
            size="lg"
            className="h-11 rounded-full bg-sky-500 px-5 text-slate-950 hover:bg-sky-400"
            onClick={() => inputRef.current?.click()}
          >
            Choose File
          </Button>

          <AnimatePresence mode="wait">
            {uploadedFile ? (
              <motion.div
                key="uploaded"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"
              >
                <Badge className="bg-emerald-400/15 font-mono text-emerald-200 hover:bg-emerald-400/15">
                  {uploadedFile.fileType}
                </Badge>
                <span className="text-sm text-slate-100">{uploadedFile.fileName}</span>
                <span className="font-mono text-xs text-slate-400">
                  {(uploadedFile.size / 1024).toFixed(1)} KB
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {errorMessage ? (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-sm text-rose-300"
              >
                {errorMessage}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
