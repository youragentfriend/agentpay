import { transactionExplorer } from "@/lib/transaction-explorer";

export function TransactionExplorerLink({ chainId, transactionHash, className = "" }: { chainId: string; transactionHash: string; className?: string }) {
  const explorer = transactionExplorer(chainId, transactionHash);
  if (!explorer) return <span className={className}>{transactionHash}</span>;
  return <a className={`transaction-explorer-link ${className}`.trim()} href={explorer.url} target="_blank" rel="noopener noreferrer" title={`View transaction on ${explorer.name}`}><span>{transactionHash}</span><b aria-hidden="true">↗</b></a>;
}
