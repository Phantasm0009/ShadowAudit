"use client";

import { ChevronLeft, ChevronRight, FolderSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatRelativeTime,
  getRiskBadgeClass,
} from "@/lib/dashboardUtils";
import { RecentScanSummary } from "@/lib/types";

interface ScanHistoryTableProps {
  scans: RecentScanSummary[];
}

const PAGE_SIZE = 10;

export function ScanHistoryTable({ scans }: ScanHistoryTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(scans.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return scans.slice(start, start + PAGE_SIZE);
  }, [currentPage, scans]);

  if (scans.length === 0) {
    return (
      <Card className="border border-white/10 bg-slate-950/70">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
          <div className="rounded-full border border-white/10 bg-white/5 p-4">
            <FolderSearch className="size-8 text-sky-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">No scans yet</h3>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              Run your first ShadowAudit scan to start building a history of risk
              trends, common CVEs, and dependency posture over time.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-white">Scan history</CardTitle>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Click any row to jump into that scan's detailed results.
          </p>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
          Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, scans.length)} of {scans.length}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-4 py-3">Packages</th>
                <th className="px-4 py-3">Vulnerabilities</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((scan) => (
                <tr
                  key={scan.scan_id}
                  className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.03]"
                  onClick={() => router.push(`/scan/${scan.scan_id}`)}
                >
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-white">
                        {scan.project_name || "Unnamed project"}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {scan.scan_id}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge
                      variant="outline"
                      className={getRiskBadgeClass(scan.overall_risk_score)}
                    >
                      {scan.overall_risk_score.toFixed(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-slate-200">{scan.package_count}</td>
                  <td className="px-4 py-4 text-slate-200">{scan.vulnerability_count}</td>
                  <td className="px-4 py-4 text-slate-300">
                    {formatRelativeTime(scan.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-slate-900/70 text-slate-200 hover:bg-white/5"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-slate-900/70 text-slate-200 hover:bg-white/5"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
