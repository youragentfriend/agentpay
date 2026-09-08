import { SettingsValidationError, updatePaymentExecutionControls } from "@/lib/server/settings-store";
import { getPaymentExecutionState } from "@/lib/server/payment-execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getPaymentExecutionState(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  try {
    updatePaymentExecutionControls(await request.json());
    return Response.json(getPaymentExecutionState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SettingsValidationError) return Response.json({ error: error.message, code: "INVALID_PAYMENT_EXECUTION_CONTROLS" }, { status: 400 });
    return Response.json({ error: "Unable to update payment execution controls.", code: "PAYMENT_EXECUTION_UPDATE_FAILED" }, { status: 500 });
  }
}
