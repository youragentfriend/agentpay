import type { ActivitySource } from "@/lib/server/activity-store";

export type SpendingRangePreset = "today" | "week" | "month" | "quarter" | "year" | "custom";
export interface SpendingBreakdown { key: string; label: string; totalUsd: string; count: number; percentage: number; }
export interface SpendingTrendPoint { date: string; totalUsd: string; pendingUsd: string; count: number; }
export interface SpendingCalendarDay { date: string; day: number; totalUsd: string; count: number; future: boolean; }
export interface SpendingReportTransaction { id: string; source: ActivitySource; title: string; summary: string; status: string; spendState: "settled" | "pending"; amount?: string; asset?: string; amountUsd: string; occurredAt: string; reference?: string; }
export interface SpendingReport {
  generatedAt: string;
  timezone: string;
  range: { preset: SpendingRangePreset; from: string; to: string; label: string };
  filters: { sources: ActivitySource[]; asset?: string; includePending: boolean };
  summary: { settledTotalUsd: string; pendingTotalUsd: string; transactionCount: number; pendingCount: number; averageUsd: string; largestUsd: string; unvaluedCount: number };
  bySource: SpendingBreakdown[];
  byAsset: SpendingBreakdown[];
  trend: SpendingTrendPoint[];
  calendar: { month: string; label: string; days: SpendingCalendarDay[] };
  transactions: SpendingReportTransaction[];
}
