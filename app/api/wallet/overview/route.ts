import { AgenticWalletError, getWalletOverview } from "@/lib/server/agentic-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getWalletOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const walletError = error instanceof AgenticWalletError ? error : new AgenticWalletError("Wallet overview failed.");
    return Response.json({ error: walletError.message, code: walletError.code }, { status: 502 });
  }
}
