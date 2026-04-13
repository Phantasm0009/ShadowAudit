import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { QueryProvider } from "@/components/providers/QueryProvider";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShadowAudit",
  description: "AI-powered supply chain security scanner for npm and PyPI.",
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/scan", label: "Scan" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${jetBrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#020617_50%,_#030712_100%)] text-slate-50">
        <QueryProvider>
          <TooltipProvider>
            <ErrorBoundary>
              <div className="flex min-h-screen flex-col">
                <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
                  <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                    <Link
                      href="/"
                      className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-100"
                    >
                      <span className="inline-flex size-9 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/10 font-mono text-sky-300">
                        SA
                      </span>
                      ShadowAudit
                    </Link>

                    <nav className="flex items-center gap-2">
                      {navLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="rounded-full px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </nav>
                  </div>
                </header>

                <main className="flex-1">{children}</main>
              </div>
            </ErrorBoundary>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
