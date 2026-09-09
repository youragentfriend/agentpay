import { x402ErrorResponse } from "@/lib/server/x402";
import { runX402ChatTurn, isX402Confirmation, isX402Decline } from "@/lib/server/x402-chat-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export { isX402Confirmation, isX402Decline };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown; action?: unknown };
    const result = await runX402ChatTurn({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      action: body.action === "cancel" ? "cancel" : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return x402ErrorResponse(error);
  }
}
