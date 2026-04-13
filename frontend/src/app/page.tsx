"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  GitBranch,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const analysisLayers = [
  {
    title: "CVE Detection",
    description:
      "Checks every package version against the OSV database so known exploits surface immediately.",
    icon: ShieldAlert,
  },
  {
    title: "Maintainer Monitoring",
    description:
      "Flags sudden ownership changes and suspicious release timing that often precede supply-chain compromise.",
    icon: Users,
  },
  {
    title: "Typosquat Detection",
    description:
      "Compares package names against popular registries to catch impersonators before they land in production.",
    icon: GitBranch,
  },
  {
    title: "AI Behavior Analysis",
    description:
      "Escalates risky packages into deeper diff review so unusual install hooks and suspicious behavior stand out fast.",
    icon: Bot,
  },
];

const statHighlights = [
  { value: "4", label: "layers of analysis" },
  { value: "200+", label: "popular packages monitored" },
  { value: "Real-time", label: "scanning for npm and PyPI" },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_48%),radial-gradient(circle_at_20%_20%,_rgba(239,68,68,0.12),_transparent_28%)]" />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center"
        >
          <div className="space-y-6">
            <Badge className="border-sky-500/30 bg-sky-500/10 font-mono text-sky-100 hover:bg-sky-500/10">
              AI-powered supply chain security scanner
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                ShadowAudit
              </h1>
              <p className="max-w-3xl text-2xl font-medium tracking-tight text-slate-200 sm:text-3xl">
                See what&apos;s hiding in your dependencies.
              </p>
              <p className="max-w-2xl text-lg leading-8 text-slate-400">
                ShadowAudit analyzes npm and PyPI dependency manifests in real
                time, combining vulnerability intelligence, maintainer takeover
                detection, typosquat checks, and AI-assisted behavior analysis
                in one workflow.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-sky-500 px-6 text-slate-950 hover:bg-sky-400"
              >
                <Link href="/scan">
                  Scan Now
                  <ArrowRight className="size-4" />
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/10 bg-slate-950/60 px-6 text-slate-100 hover:bg-white/5"
              >
                <a href="#demo">View Demo</a>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {statHighlights.map((stat) => (
              <Card
                key={stat.label}
                className="border border-white/10 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.72)]"
              >
                <CardContent className="px-6 py-5">
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        <section id="demo" className="space-y-6">
          <div className="space-y-3">
            <Badge
              variant="outline"
              className="border-white/10 bg-white/5 font-mono text-slate-300"
            >
              How It Works
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Four layers of supply chain analysis, one scan flow.
            </h2>
            <p className="max-w-3xl text-base leading-8 text-slate-400">
              ShadowAudit is built for fast triage: upload a manifest, review the
              risk score, then drill into the evidence that pushed a package into
              your queue.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {analysisLayers.map((layer, index) => {
              const Icon = layer.icon;

              return (
                <motion.div
                  key={layer.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ delay: index * 0.08, duration: 0.35 }}
                >
                  <Card className="h-full border border-white/10 bg-slate-950/70 shadow-[0_22px_60px_rgba(2,6,23,0.62)]">
                    <CardHeader className="space-y-4">
                      <div className="inline-flex size-12 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-200">
                        <Icon className="size-5" />
                      </div>
                      <CardTitle className="text-xl text-white">
                        {layer.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-7 text-slate-400">
                        {layer.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.8)] sm:grid-cols-3">
          {statHighlights.map((stat) => (
            <div
              key={`bottom-${stat.label}`}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {stat.value}
              </p>
            </div>
          ))}
        </section>
      </section>

      <footer className="border-t border-white/10 bg-slate-950/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>ShadowAudit helps teams surface dependency risk before it ships.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="transition hover:text-white">
              Home
            </Link>
            <Link href="/scan" className="transition hover:text-white">
              Scan
            </Link>
            <Link href="/dashboard" className="transition hover:text-white">
              Dashboard
            </Link>
            <a
              href="https://github.com/Phantasm0009/ShadowAudit"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-white"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
