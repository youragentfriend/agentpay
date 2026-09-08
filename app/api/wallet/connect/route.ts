import { AgenticWalletError, startWalletSignIn } from "@/lib/server/agentic-wallet";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(await startWalletSignIn(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const walletError = error instanceof AgenticWalletError ? error : new AgenticWalletError("Wallet sign-in failed.");
    return Response.json({ error: walletError.message, code: walletError.code }, { status: 502 });
  }
}
