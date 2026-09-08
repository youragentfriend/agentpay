import packageJson from "@/package.json";
import type { BinancePortfolio } from "@/lib/binance-portfolio-types";
import type { AgentPayDiagnostics } from "@/lib/diagnostics-types";
import type { WalletConnectionStatus } from "@/lib/wallet-types";
import { getWalletStatus } from "@/lib/server/agentic-wallet";
import { getBinancePayCapability } from "@/lib/server/binance-pay";
import { getBinanceAccountStatus, loadBinancePortfolio } from "@/lib/server/binance-readonly";
import { walletSendEnabled } from "@/lib/server/payment-store";
import { checkSettingsDatabaseHealth } from "@/lib/server/settings-store";
import { x402Capability } from "@/lib/server/x402";

export type DiagnosticsDependencies = {
  now: () => Date;
  uptime: () => number;
  databaseHealth: () => boolean | Promise<boolean>;
  walletStatus: () => Promise<WalletConnectionStatus>;
  binancePayCapability: () => Promise<{ configured: boolean; executionEnabled: boolean; imageDecodeReady: boolean }>;
  binanceAccountStatus: () => { configured: boolean; readOnly: true };
  binancePortfolio: () => Promise<BinancePortfolio>;
  x402Capability: () => { executionEnabled: boolean; allowedHosts: string[] };
  walletExecutionEnabled: () => boolean;
  buildVersion: string;
  environment: "development" | "production" | "test";
};

async function settled<T>(load: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try { return { ok: true, value: await load() }; }
  catch { return { ok: false }; }
}

export async function aggregateDiagnostics(dependencies: DiagnosticsDependencies): Promise<AgentPayDiagnostics> {
  const [database, wallet, binancePay, binanceAccount, x402] = await Promise.all([
    settled(dependencies.databaseHealth),
    settled(dependencies.walletStatus),
    settled(async () => dependencies.binancePayCapability()),
    settled(async () => {
      const status = dependencies.binanceAccountStatus();
      return { status, portfolio: status.configured ? await dependencies.binancePortfolio() : null };
    }),
    settled(dependencies.x402Capability),
  ]);

  const walletExecution = dependencies.walletExecutionEnabled();
  const binancePayExecution = binancePay.ok ? binancePay.value.executionEnabled : false;
  const x402Execution = x402.ok ? x402.value.executionEnabled : false;
  const walletState = !wallet.ok ? "unavailable" as const
    : wallet.value === "CONNECTED" ? "connected" as const
      : wallet.value === "CREATING" ? "creating" as const : "not_connected" as const;
  const accountState = !binanceAccount.ok ? "unavailable" as const
    : !binanceAccount.value.status.configured ? "not_configured" as const
      : binanceAccount.value.portfolio?.connection ?? "error" as const;
  const degraded = !database.ok || !database.value || !wallet.ok || !binancePay.ok || !binanceAccount.ok || !x402.ok
    || accountState === "partial" || accountState === "error";

  return {
    generatedAt: dependencies.now().toISOString(),
    state: degraded ? "degraded" : "operational",
    system: {
      uptimeSeconds: Math.max(0, Math.floor(dependencies.uptime())),
      buildVersion: dependencies.buildVersion,
      environment: dependencies.environment,
    },
    database: { state: database.ok && database.value ? "available" : "unavailable" },
    connections: {
      agenticWallet: { state: walletState, executionEnabled: walletExecution },
      binancePay: {
        state: !binancePay.ok ? "unavailable" : binancePay.value.configured ? "configured" : "not_configured",
        executionEnabled: binancePayExecution,
        imageDecodeReady: binancePay.ok && binancePay.value.imageDecodeReady,
      },
      binanceAccount: {
        state: accountState,
        configured: binanceAccount.ok && binanceAccount.value.status.configured,
        readOnly: true,
        sources: binanceAccount.ok && binanceAccount.value.portfolio
          ? binanceAccount.value.portfolio.sources.map(({ source, state }) => ({ source, state }))
          : [],
      },
      x402: {
        state: !x402.ok ? "unavailable" : x402.value.allowedHosts.length ? "ready" : "not_configured",
        executionEnabled: x402Execution,
        allowedHostCount: x402.ok ? x402.value.allowedHosts.length : 0,
      },
    },
    execution: {
      approvalRequired: true,
      agenticWallet: walletExecution,
      binancePay: binancePayExecution,
      x402: x402Execution,
    },
  };
}

function environment(): "development" | "production" | "test" {
  return process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test" ? process.env.NODE_ENV : "development";
}

export function getAgentPayDiagnostics(): Promise<AgentPayDiagnostics> {
  return aggregateDiagnostics({
    now: () => new Date(),
    uptime: () => process.uptime(),
    databaseHealth: checkSettingsDatabaseHealth,
    walletStatus: getWalletStatus,
    binancePayCapability: getBinancePayCapability,
    binanceAccountStatus: getBinanceAccountStatus,
    binancePortfolio: loadBinancePortfolio,
    x402Capability,
    walletExecutionEnabled: walletSendEnabled,
    buildVersion: packageJson.version,
    environment: environment(),
  });
}
