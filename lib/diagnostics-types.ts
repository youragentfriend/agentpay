export type DiagnosticAvailability = "available" | "unavailable";
export type DiagnosticsOverallState = "operational" | "degraded";

export type SourceDiagnostic = {
  source: "spot" | "funding" | "futures" | "earn" | "margin";
  state: "available" | "empty" | "unavailable" | "error";
};

export type AgentPayDiagnostics = {
  generatedAt: string;
  state: DiagnosticsOverallState;
  system: {
    uptimeSeconds: number;
    buildVersion: string;
    environment: "development" | "production" | "test";
  };
  database: {
    state: DiagnosticAvailability;
  };
  connections: {
    agenticWallet: {
      state: "connected" | "not_connected" | "creating" | "unavailable";
      executionEnabled: boolean;
    };
    binancePay: {
      state: "configured" | "not_configured" | "unavailable";
      executionEnabled: boolean;
      imageDecodeReady: boolean;
    };
    binanceAccount: {
      state: "connected" | "partial" | "error" | "not_configured" | "unavailable";
      configured: boolean;
      readOnly: true;
      sources: SourceDiagnostic[];
    };
    x402: {
      state: "ready" | "not_configured" | "unavailable";
      executionEnabled: boolean;
      allowedHostCount: number;
    };
  };
  execution: {
    approvalRequired: true;
    agenticWallet: boolean;
    binancePay: boolean;
    x402: boolean;
  };
};
