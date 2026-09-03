import { AgenticWalletError, verifyWalletSignIn } from "@/lib/server/agentic-wallet";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { qrCodeId?: unknown };
    if (typeof body.qrCodeId !== "string") {
      throw new AgenticWalletError("Invalid wallet sign-in request.", "INVALID_QR_CODE_ID");
    }
    await verifyWalletSignIn(body.qrCodeId);
    return Response.json({ success: true });
  } catch (error) {
    const walletError = error instanceof AgenticWalletError ? error : new AgenticWalletError("Wallet verification failed.");
    const status = walletError.code === "INVALID_QR_CODE_ID" ? 400 : 502;
    return Response.json({ error: walletError.message, code: walletError.code }, { status });
  }
}
