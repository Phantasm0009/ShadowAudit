"use client";

import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ANALYSIS_STEPS = [
  "Parsing dependencies...",
  "Scanning for vulnerabilities...",
  "Checking maintainer history...",
  "Running AI behavioral analysis...",
];

export function ScanProgress() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentStepIndex((previous) =>
        previous < ANALYSIS_STEPS.length - 1 ? previous + 1 : previous,
      );
    }, 1200);

    return () => window.clearInterval(interval);
  }, []);

  const progressValue = useMemo(
    () => ((currentStepIndex + 1) / ANALYSIS_STEPS.length) * 100,
    [currentStepIndex],
  );

  const estimatedSecondsRemaining = Math.max(8, 32 - currentStepIndex * 7);

  return (
    <Card className="border border-sky-500/20 bg-slate-950/80 shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_24px_80px_rgba(2,6,23,0.8)]">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-slate-50">ShadowAudit is scanning</CardTitle>
          <Badge className="bg-sky-500/15 font-mono text-sky-200 hover:bg-sky-500/15">
            {currentStepIndex + 1}/4
          </Badge>
        </div>
        <Progress
          value={progressValue}
          className="h-2 bg-slate-900 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-sky-500 [&_[data-slot=progress-indicator]]:to-rose-500"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {ANALYSIS_STEPS.map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <motion.div
              key={step}
              animate={isCurrent ? { opacity: [0.75, 1, 0.75] } : { opacity: 1 }}
              transition={
                isCurrent
                  ? { duration: 1.2, repeat: Number.POSITIVE_INFINITY }
                  : undefined
              }
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3",
                isComplete
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                  : isCurrent
                    ? "border-sky-400/35 bg-sky-500/10 text-sky-100"
                    : "border-slate-800 bg-slate-900/70 text-slate-400",
              )}
            >
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-semibold",
                  isComplete
                    ? "border-emerald-400/20 bg-emerald-400/10"
                    : isCurrent
                      ? "border-sky-400/30 bg-sky-400/10"
                      : "border-slate-700 bg-slate-950",
                )}
              >
                {isCurrent ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span>{step}</span>
            </motion.div>
          );
        })}

        <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
          Estimated time remaining: {estimatedSecondsRemaining}s
        </p>
      </CardContent>
    </Card>
  );
}
