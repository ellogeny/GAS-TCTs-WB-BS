# Wildberries API Integration Project

## Overview
Google Apps Script (GAS) project integrating Google Sheets with multiple Wildberries API endpoints. Testing is performed directly in GAS via small per-function test runners appended after the main code.

## Current Structure
```
├── getPrices.gs         # Orchestration for fetching/writing prices
├── wildberriesApi.gs    # WB-specific API adapter (cards, prices)
├── apiClient.gs         # HTTP client with retries/backoff and pacing
├── sheetUtils.gs        # Google Sheets helpers
├── endpoints.gs         # Centralized endpoint registry
├── src/
│   └── domain/          # (planned) Pure domain functions
├── docs/
│   ├── README.md
│   └── endpoints/
│       ├── cards_list.md
│       ├── card.md
│       ├── prices.md
│       ├── warehouses.md
│       ├── stocks.md
│       └── analytics_remains.md
└── README.md
```

## Principles
1. Single Responsibility per module
2. Keep business logic pure and testable (domain functions)
3. Add retries with exponential backoff for network calls and respect rate limits
4. Consistent logging (Logger and optional log sheet)
5. Globally sort aggregated results by nmID asc before writing to sheets

## WB API rate limits
General policy (see `docs/README.md` for details):

- Prefer server-provided headers when available:
  - `X-Ratelimit-Remaining`, `X-Ratelimit-Retry`, `X-Ratelimit-Reset`, `X-Ratelimit-Limit`.
- On `429 Too Many Requests`, wait according to headers before retrying.
- If headers are absent, use conservative pacing (≈ 3–5 RPS) and exponential backoff on non-200 responses.
- Marketplace specifics: some statuses like `409` may consume multiple request units; account for this at the API client level.

## Documentation layout
Endpoint-specific docs live under `docs/endpoints/`:
- `cards_list.md` — Cards list (Content API) with cursor paging and filters
- `card.md` — Public card details (`https://card.wb.ru/cards/v2/detail`)
- `prices.md` — Prices/discounts (`https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter`)
- `warehouses.md` — Seller warehouses (`/api/v3/warehouses`)
- `stocks.md` — Stocks for a warehouse (`/api/v3/stocks/{warehouseId}`)
- `analytics_remains.md` — Analytics task flow for warehouse remains

## Multi-seller
API keys are stored in Script Properties and indexed by `sellerId`. The script groups rows by seller, loads data per seller, aggregates, sorts globally, and writes in one batch.



## Testing
- All tests live in `tests.gs`.
- Each test creates a sheet named `FunctionName+Test` and writes a compact table with results.
- Keep tests small: limit processed items, use Logger, avoid large dumps.

## Mandatory testing policy
- Every code change must be verified by running the corresponding GAS test function(s).
- You will not be paid until the code works and the GAS test run completes successfully with correct output.

## Endpoint documentation policy
- If an endpoint is not documented under `docs/endpoints/`, first request and add documentation for it (URL, auth, limits, request/response) before coding.
## Next steps
- Extract domain functions into `src/domain/` for better testability
- Enhance `apiClient` to parse rate-limit headers and handle 429/409 precisely
- Add a small logging module (optional sheet mirroring, log levels)
