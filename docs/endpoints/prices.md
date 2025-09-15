# Prices endpoint

## Summary
- Base: `https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter`
- Purpose: Fetch prices and discounts for goods with offset-based pagination

## Auth and headers
```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

## Rate limits and retries
- Prefer server rate-limit headers when present: `X-Ratelimit-Remaining`, `X-Ratelimit-Retry`, `X-Ratelimit-Reset`, `X-Ratelimit-Limit`.
- On `429`, wait per headers before retry. Use exponential backoff on 5xx.
- If headers are absent, pace requests conservatively (≈3–5 RPS).

## Request parameters
- `limit`: number (<= 1000)
- `offset`: number (>= 0)

Notes:
- Endpoint returns pages of goods; filtering by arbitrary `nmID` set is not supported. Fetch pages and filter client-side if needed.

## Response (truncated)
```json
{
  "data": {
    "listGoods": [
      {
        "nmID": 123456,
        "imtID": 987654321,
        "sizes": [
          {
            "techSizeName": "42",
            "discountedPrice": 1799,
            "clubDiscountedPrice": 1699,
            "price": 1999
          }
        ]
      }
    ]
  }
}
```

## Object details
- Good
  - `nmID`: number — product identifier.
  - `imtID`: number — model identifier.
  - `sizes`: array — list of size-level prices.

- Size price
  - `techSizeName`: string — technical size label to match with other APIs.
  - `price`: number — base price.
  - `discountedPrice`: number — discounted price.
  - `clubDiscountedPrice`: number — WB Club discounted price.

## Paging example
```
GET /api/v2/list/goods/filter?limit=1000&offset=0
GET /api/v2/list/goods/filter?limit=1000&offset=1000
...
```

## Notes
- Stop paging when the returned item count is `< limit`.
- Sort aggregated results globally before writing to sheets.

## Status codes
- 200 — OK
- 400 — Bad Request
- 401 — Unauthorized
- 403 — Forbidden
- 429 — Too Many Requests

## Reference
- WB Prices v2: `https://dev.wildberries.ru/openapi/work-with-products#tag/TSeny-i-skidki`
