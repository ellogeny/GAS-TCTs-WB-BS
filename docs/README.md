# Documentation

## Overview
This project integrates Google Sheets with multiple Wildberries APIs using Google Apps Script. It focuses on:
- Dependency Injection for services (`createApiUtils`, `createWildberriesApi`, `createSheetUtils`).
- Reliable networking: retries with exponential backoff and rate-limit awareness.
- Consistent data handling: global sort before writing to sheets and forcing text for grouping keys (e.g., sellerId, nmID, SKU, size, warehouse, min/max label).

## When to consult which documents
- Endpoints reference (API specifics): see `docs/endpoints/*.md` when you need request/response shapes, headers, and endpoint-specific notes.
  - `docs/endpoints/cards_list.md`: Cards list (Content API) with cursor-based paging and filters.
  - `docs/endpoints/card.md`: Public card details and batching behavior.
  - `docs/endpoints/prices.md`: Discounted prices with pagination.
  - `docs/endpoints/warehouses.md`: Seller warehouses (`officeId`).
  - `docs/endpoints/stocks.md`: Stocks by `warehouseId` (equals `officeId`).
  - `docs/endpoints/analytics_remains.md`: Create/status/download flow for remains.
- Code architecture & behaviors:
  - `apiClient.gs`: Retry/backoff, rate limits, and how to configure them (Script Properties).
  - `wildberriesApi.gs`: WB-specific helpers and data normalization.
  - `sheetUtils.gs`: Sheet initialization and batch write with forced-text columns.
  - `timestamps.gs`: How scripts log last successful run; timestamps are written to the `TIMESTAMps` sheet; see inline comments for usage.

Use the endpoint docs whenever you add or modify API calls. Use the module source files (with comments) when changing data flow, formatting, or configuration.

## Conventions (high-level)
- Keep endpoint-specific details in `docs/endpoints/<name>.md`.
- Keep module-specific usage and nuances as comments near the relevant code.
- Update the documentation together with code changes.

## Data formatting in Sheets (global policy)
- Store textual values with a leading apostrophe `'` for all grouping keys to prevent auto-number formatting.
- Typical grouping keys: sellerId, nmID, SKU, size names (techSize), warehouse names, min/max type labels.

## Rate limits and retries (global policy)
- Prefer server-provided headers when available:
  - `X-Ratelimit-Remaining`, `X-Ratelimit-Retry`, `X-Ratelimit-Reset`, `X-Ratelimit-Limit`.
  - On `429`, wait as instructed by headers before retrying.
- If headers are absent, use conservative pacing (≈ 3–5 RPS) and exponential backoff on non-200 responses.
- Marketplace specifics: statuses like `409` may still be retryable and can consume multiple units.

## Tokens and host mapping
- Content API (cards list, directories): `Authorization: Bearer <Content token>`; host: `content-api.wildberries.ru`.
- Marketplace API (stocks, warehouses): `Authorization: Bearer <Marketplace token>`; host: `marketplace-api.wildberries.ru`.
- Discounts/Prices API (prices): `Authorization: Bearer <Prices token>`; host: `discounts-prices-api.wildberries.ru`.
- Public catalog (card details): no auth; host: `card.wb.ru`.
- Analytics API (warehouse remains): `Authorization: Bearer <Analytics token>`; host: `seller-analytics-api.wildberries.ru`.

## Configuration (Script Properties)
- `API_MAX_RETRIES` (default: 3)
- `API_INITIAL_DELAY_MS` (default: 500)
- `API_BACKOFF_FACTOR` (default: 2)
- `API_REQUESTS_PER_SECOND` (default: 5)

These keys influence `createApiUtils` behavior for retries, pacing, and backoff. If unset, defaults above are used.

## Adding a new endpoint
1) Create `docs/endpoints/<name>.md` following the existing templates (summary, auth, limits, request/response, notes).
2) Implement calls in `wildberriesApi.gs` or consuming scripts.
3) If new configuration is needed, document Script Properties here and reference them in code comments.
