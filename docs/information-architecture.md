# AgentPay Information Architecture — Redesign Specification

**Status:** Proposed for Mark's approval; not yet implemented  
**Prepared:** 2026-09-04  
**Target release:** AgentPay v0.4.0  

## Product principle

AgentPay has two equally important interfaces:

1. **Conversation-first:** the Overview assistant can access every supported action through natural language and attachments.
2. **Dashboard-first:** focused pages let users inspect accounts, manually prepare actions, manage rules, and review records without using chat.

Chat appears only on Overview. Focused pages must not contain duplicate conversational composers.

## Final navigation

- **Overview**
- **Binance**
  - Binance Pay
- **Agentic Wallet**
  - x402
- **Activity**
- **Settings**

Behavior:

- Binance and Agentic Wallet are clickable parent destinations.
- Their chevrons expand/collapse the submenu independently so clicking a chevron does not unexpectedly navigate.
- Desktop uses the persistent sidebar.
- Mobile uses a drawer; the highest-frequency destinations may later receive a compact bottom navigation.
- Rules and Connections are removed from the main menu and moved into Settings.
- The separate Chat and Pay menu items are removed.

## 1. Overview

### Row 1 layout

Desktop grid: approximately **68% assistant / 32% Recent Activity**.

Tablet and mobile: stack the assistant first, then Recent Activity.

### Universal AgentPay assistant

Recommended heading:

> **What can AgentPay do for you?**

Recommended supporting copy:

> Ask AgentPay to check balances, prepare payments, scan QR codes, buy x402 services, or review activity. It chooses the right rail, validates every detail, and asks before funds move.

Recommended input placeholder:

> Ask AgentPay to pay, receive, scan a QR, check balances, or find a service…

Alternative headings:

- Move money, check balances, and pay—just ask.
- What would you like AgentPay to handle?
- Your payments, wallets, and activity in one command center.

The first option is recommended because it is broad, direct, and does not imply that every request must be a payment.

### Assistant capabilities

The Overview assistant must eventually support:

1. **Unified intent routing** — identify Binance Pay, Agentic Wallet transfer, x402 purchase, balance lookup, activity query, receive request, settings/rule request, or unsupported intent.
2. **Explainable rail selection** — state which rail was selected and why before presenting approval.
3. **Inline action cards** — balances, payee, amount, asset, network, merchant, fees, rules, warnings, and approval button appear inside the conversation.
4. **Contextual correction** — “change it to USDT,” “use BSC,” “make it 5 dollars,” or “cancel” updates the current draft instead of starting over.
5. **Approval-first execution** — natural language can prepare but never silently bypass the review state.
6. **Result and receipt cards** — success, failure, pending, transaction receipt, purchased x402 data, and useful next actions.
7. **Activity questions** — examples: “show failed x402 payments,” “how much did I spend this week?” after normalized reporting exists.
8. **Balance questions** — Binance account and Agentic Wallet balances after read-only portfolio connections exist.
9. **Smart suggestions** — contextual chips based on connected services, not static marketing prompts.
10. **Conversation continuity** — resume pending approvals and reference the immediately preceding result safely.
11. **Unsupported-action clarity** — explain unavailable actions and route users to the relevant setup instead of hallucinating capability.
12. **Attachment support** — QR/image first; receipts and other safe payment documents may follow.

### Attach QR

Place **Attach QR** at the lower-left of the composer. It must be a real file input with drag-and-drop support.

Flow:

1. Upload and validate image type/size locally.
2. Decode using the existing Binance Pay QR pipeline.
3. Display an inline review drawer on desktop and a bottom sheet on mobile.
4. Show payee/merchant information, payment type, currency, amount, compatible link, and warnings.
5. If the QR locks the amount, show a read-only amount.
6. If the QR requires an amount, show an amount textbox with currency validation.
7. Label QR-provided merchant text as **Untrusted information**.
8. Present the same approval button and backend flow used by the Binance Pay page.
9. Show a compatibility fallback if the QR cannot be paid directly.
10. Return the final receipt to both the conversation and Activity.

This reuses the Binance Pay workflow; it must not become a second independent implementation.

### Recent Activity panel

- Title: **Recent Activity**, never “Payment History.”
- Show the latest ten normalized records.
- Use a fixed-height compact list aligned with the assistant card; allow internal scrolling if necessary.
- Each row shows icon/source, short action, amount when relevant, normalized status, and relative time.
- Clicking a row opens its detail drawer.
- **View all** navigates to Activity while preserving an optional source/status filter.
- Never show full addresses, order IDs, or transaction hashes in the compact panel.

### Row 2 — reserved for later

Potential modules:

- Combined estimated balance.
- Binance vs Agentic Wallet allocation.
- Send and Receive quick actions.
- Seven-day spending graph.
- Pending approvals.
- Connection health.

Do not build Row 2 until Row 1 is stable and the portfolio APIs exist.

## 2. Binance

This page means the centralized **Binance account**, not Binance Web3 Wallet or Agentic Wallet.

### Purpose

A read-only portfolio dashboard showing the user's estimated Binance account balances. It is not a trading interface.

### Header summary

- **Estimated total balance (USD)**.
- Last synchronized timestamp.
- Refresh action.
- Connection/permission state.
- Account-type breakdown: Spot, Funding, Futures, Earn, Margin when available.
- Clear explanation that prices are estimates and futures “balance” may represent equity rather than withdrawable cash.

### Account navigation

Recommended desktop control: segmented tabs.

- All
- Spot
- Funding
- Futures
- Earn
- Margin

Mobile: equivalent dropdown to avoid horizontal overflow.

Tabs are preferred over one filter dropdown because account type changes the meaning of available, locked, equity, and unrealized values. Tabs provide clearer context and preserve pagination per account.

### Asset table

- Sort by USD value descending.
- Exclude assets below **$0.10 USD** by default.
- Ten assets per page with pagination.
- Columns: Asset, Available, Locked/Committed, Total or Equity, USD Price, USD Value, Allocation.
- Hide irrelevant columns per account type.
- Do not add trading buttons, candlestick charts, buy/sell, leverage, or market discovery.
- Add a **Show dust** toggle later if useful.
- Prices and total values include an “as of” timestamp.

### Technical prerequisite

The current Binance Pay integration does not automatically grant read access to Spot, Funding, Futures, Earn, or Margin balances. Portfolio support requires a separate least-privilege, read-only Binance account connection. Credentials must be entered through protected secret storage, never chat, and the UI must show granted/absent scopes without exposing secrets.

### Binance Pay submenu

Move the existing Binance Pay workflow here without changing its proven backend behavior.

Recommended internal tabs:

- Pay QR / Link
- Receive

The Overview QR attachment and this page must call the same shared components and APIs.

## 3. Agentic Wallet

Use the same visual framework as Binance so users can compare them, but reflect on-chain concepts.

### Header summary

- Estimated total wallet value in USD.
- Wallet connection state.
- Last refresh.
- **Send** and **Receive** primary quick actions.
- Network allocation summary.

### Network navigation

- All Networks
- BNB Smart Chain
- Base
- Solana
- Other supported networks

Use tabs on desktop and a dropdown on mobile.

### Asset list

- Ten assets per page, USD value descending.
- Columns: Asset, Network, Balance, USD Price, USD Value, Allocation.
- Optional dust toggle rather than permanently hiding all small on-chain balances.
- Clearly distinguish native gas assets from tokens.

### Send

Open the existing approval-first transfer workflow as a drawer or focused panel. Do not add another chat composer.

### Receive

Show the selected network address and QR code, with copy control and network warning. Avoid implying that one address supports every network.

### Recent transactions

Show the latest five Agentic Wallet transactions with **View all**, linking to Activity filtered to Agentic Wallet.

### x402 submenu

Move the existing x402 workflow here without changing the verified backend behavior.

Keep its internal tabs:

- BNB Bazaar
- Direct URL

The Overview assistant can search and purchase x402 services, but this focused page remains the manual discovery/inspection interface.

## 4. Activity

### Current state

AgentPay already persists its three proven payment flows in SQLite at `data/agentpay.sqlite`:

- `payment_intents` — Agentic Wallet transfer drafts, approvals, submissions, confirmations, failures, and transaction hashes.
- `binance_pay_orders` — Binance Pay checkout/order status and receipt information.
- `x402_intents` — x402 requirements, selected option, request method/body, approval/settlement evidence, response, and failure state.

Activity is therefore **not dependent only on Binance history**. However, the current endpoint returns three separate arrays and the frontend renders them sequentially. It is not yet a normalized activity ledger and currently has no true server-side filtering, pagination, reporting, or export.

### Recommended data architecture

Keep the source-specific tables for detailed workflow state and add a normalized append-friendly `activity_events` projection.

Suggested fields:

- `id`
- `source_type` — agentic_wallet, binance_pay, x402, binance_account
- `feature_type` — transfer, qr_payment, receive_link, approval, service_purchase, balance_sync
- `source_record_id`
- `status_raw`
- `status_group` — awaiting_approval, pending, successful, failed, cancelled, expired
- `direction` — outgoing, incoming, neutral
- `asset`
- `amount_asset`
- `amount_usd`
- `fee_asset`, `fee_amount`, `fee_usd`
- `network_or_account`
- `counterparty_display`
- `external_reference` — protected/truncated in APIs
- `title`, `description`
- `error_code`, `error_message`
- `occurred_at`, `created_at`, `updated_at`
- `metadata_json`

Add a separate `balance_snapshots` table for future charts and reports:

- source/account/network
- asset
- balance
- USD price
- USD value
- captured timestamp

This enables daily/weekly/monthly spending, portfolio-history charts, account allocation, CSV/JSON export, and future printable reports without repeatedly querying live providers.

### Activity interface

Toolbar:

- Search.
- Status: All, Awaiting approval, Pending, Successful, Failed, Cancelled/Expired.
- Source: All, Agentic Wallet, Binance Pay, x402, Binance Account.
- Activity type: Transfers, Payments, Approvals, Purchases, Receive actions, Balance sync.
- Date range.
- Asset.
- Sort: Newest, Oldest, Highest amount, Lowest amount.
- Clear filters.

Results:

- 25 rows per page by default.
- Server-side filtering and pagination.
- Compact table on desktop; stacked cards on mobile.
- Detail drawer containing the full timeline, normalized status, rail/source, amount, fee, network/account, safe reference, errors, and receipt data.
- Status mapping normalizes `SUCCESS`, `confirmed`, and `completed` to **Successful**, while retaining the raw provider status in details.
- Export filtered results as CSV and JSON after the normalized table exists.
- PDF/printable reports and spending charts belong to a later reporting increment.

Diagnostics and ordinary balance refreshes should not flood the default transaction list. They can be hidden behind Activity Type or placed in Diagnostics.

## 5. Settings

Settings should use internal tabs or anchored sections rather than adding more sidebar menu items.

### General

- Display currency — USD initially.
- Appearance — dark default, light optional.
- Language and timezone later.
- Version and environment summary.

### Rules & Approvals

Move the current Rules page here.

- Per-transaction limit.
- Daily limit.
- Allowed networks/assets.
- Trusted/blocked recipients or merchant hosts.
- Require approval toggles.
- Execution flags shown read-only unless a safe administrative flow is built.

### Connections

Move the current Connections content here.

- Agentic Wallet status.
- Binance Pay status.
- Future read-only Binance Account portfolio connection.
- Granted scopes and last successful sync.
- Connect, reconnect, and disconnect actions without exposing credentials.

### Diagnostics

- API/provider health.
- Database health.
- Last refresh/sync status.
- Execution-disabled indicators.
- App version and build information.
- Sanitized errors and downloadable support report later.

### Data & Privacy — later

- Export Activity.
- Data retention.
- Clear local drafts/history with explicit destructive confirmation.
- Backup/restore after the schema stabilizes.

## Version plan

The code currently declares `0.1.0`, which no longer reflects the product.

Recommended history:

- `0.1.0` — initial AgentPay prototype and basic wallet flow.
- `0.2.0` — Binance Pay integration and persisted receipts.
- `0.3.0` — x402/Bazaar, three real payment proofs, brand foundation.
- `0.4.0` — this navigation, Overview command center, portfolio dashboards, normalized Activity, and redesigned interface.

Update the current application to **v0.3.0** before redesign. Make the completed redesign release **v0.4.0**. Render the version from package/build metadata rather than a hardcoded JSX string.

## Implementation order after approval

1. Update version to v0.3.0 and centralize build/version metadata.
2. Add the normalized Activity schema and migration before redesigning Activity or Recent Activity.
3. Extract shared Binance Pay QR and payment-review components for reuse in Overview.
4. Replace navigation and page routing/state with the approved hierarchy.
5. Build Overview Row 1 with the universal assistant shell, Attach QR, and Recent Activity.
6. Build Binance portfolio UI with connection-required placeholders until read-only APIs are configured.
7. Restructure Agentic Wallet and move x402 beneath it.
8. Rebuild Activity filters, pagination, detail drawer, and export-ready API.
9. Consolidate Rules, Connections, and Diagnostics under Settings.
10. Apply the approved AgentPay brand tokens and responsive design.
11. Run payment regression, accessibility, mobile, empty/error/loading, privacy, test, and production-build gates.

## Explicitly out of scope for this redesign increment

- Trading, market orders, futures controls, leverage, or investment advice.
- Automatic payments without user approval.
- Multiple duplicated chat composers.
- Full reporting/PDF generation before normalized Activity and balance snapshots exist.
- Overview Row 2 analytics before portfolio connections and data history exist.
