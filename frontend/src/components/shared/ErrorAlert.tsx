"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorAlertProps {
  title: string;
  message: string;
  icon?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorAlert({
  title,
  message,
  icon,
  retryLabel,
  onRetry,
  className,
}: ErrorAlertProps) {
  return (
    <Alert
      variant="destructive"
      className={`border-rose-500/30 bg-rose-500/10 text-rose-100 ${className ?? ""}`.trim()}
    >
      {icon ?? <AlertTriangle className="size-4" />}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </div>

        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            className="border-rose-500/30 bg-rose-500/5 text-rose-100 hover:bg-rose-500/10 hover:text-white"
            onClick={onRetry}
          >
            <RefreshCcw className="mr-2 size-4" />
            {retryLabel ?? "Retry"}
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
