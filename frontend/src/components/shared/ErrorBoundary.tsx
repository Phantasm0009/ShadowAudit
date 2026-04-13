"use client";

import { Component, ReactNode } from "react";

import { ErrorAlert } from "@/components/shared/ErrorAlert";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message:
        error.message ||
        "ShadowAudit ran into an unexpected UI error while rendering this page.",
    };
  }

  componentDidCatch(error: Error) {
    console.error("ShadowAudit UI error boundary caught an error:", error);
  }

  resetBoundary = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto w-full max-w-4xl px-6 py-16">
          <ErrorAlert
            title="Unexpected interface error"
            message={this.state.message}
            retryLabel="Try again"
            onRetry={this.resetBoundary}
          />
        </section>
      );
    }

    return this.props.children;
  }
}
