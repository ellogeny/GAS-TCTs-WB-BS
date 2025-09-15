# Cards list endpoint

## Summary
- Base: `https://content-api.wildberries.ru/content/v2/get/cards/list`
- Purpose: List product cards using a cursor (pagination by `updatedAt` + `nmID`)

## Auth and headers
```
Authorization: Bearer <token>   
Content-Type: application/json
Accept: application/json
```
Notes: use the Content token.

## Rate limits and retries
- Follow general policy from `docs/README.md` (prefer server headers when present).
- On `429` or 5xx, use exponential backoff and resume from the last successful cursor.
- Pace requests conservatively (e.g., 3–5 RPS) if no headers are provided.

## Supported filters (settings.filter)
- `withPhoto`: number. -1 — all, 0 — without photo, 1 — with photo.
- `allowedCategoriesOnly`: boolean. Include only allowed categories for the seller.
- `objectIDs`: number[]. Subject IDs (предметы).
- `brandNames`: string[]. Exact brand names.
- `nmID`: number[]. Specific nmIDs.
- `vendorCodes`: string[]. Vendor codes (артикулы продавца).
- `tagIDs`: number[]. Label IDs assigned to cards.
- `textSearch`: string. Full-text search by title/vendor code.

Notes:
- Any filter field is optional; combine as needed.
- When multiple arrays are provided, filtering is ANDed across fields and ORed within a field.

## Request
```
POST /content/v2/get/cards/list
{
  "settings": {
    "cursor": { "limit": 1000, "updatedAt": 0, "nmID": 0 },
    "filter": {
      "withPhoto": -1,
      "allowedCategoriesOnly": true
      
      // Optional filters (examples):
      // "objectIDs": [123, 456],
      // "brandNames": ["Brand A", "Brand B"],
      // "nmID": [123456, 789012],
      // "vendorCodes": ["SKU-001", "SKU-002"],
      // "tagIDs": [1, 2],
      // "textSearch": "keyword"
    }
  }
}
```

## Response (truncated)
```json
{
  "cards": [
    {
      "nmID": 123456,
      "imtID": 987654321,
      "vendorCode": "SKU-001",
      "title": "Product title",
      "brand": "Brand name",
      "photos": [ { "big": "https://...", "small": "https://..." } ],
      "sizes": [
        {
          "techSize": "42",
          "wbSize": "M",
          "skus": ["barcode1", "barcode2"]
        }
      ]
    }
  ],
  "cursor": { "limit": 1000, "updatedAt": 1700000000, "nmID": 123456 }
}
```

## Object details
- Card
  - `nmID`: number — WB product identifier.
  - `imtID`: number — model identifier.
  - `vendorCode`: string — seller SKU.
  - `title`: string — product name.
  - `brand`: string — brand name.
  - `photos`: array — product images.
  - `sizes`: array — product sizes/variations.

- Photo
  - Example fields: `big`, `small` (URLs). Additional sizes may be present; do not rely on a fixed set.

- Size
  - `techSize`: string — technical size code used across WB APIs.
  - `wbSize`: string — localized WB size label.
  - `skus`: string[] — barcodes for this size.

## Paging
- Start with `cursor = { limit: 1000, updatedAt: 0, nmID: 0 }`.
- For the next page, pass `updatedAt` and `nmID` of the last item from the previous response.
- Stop when the returned number of `cards` is `< limit` or when the API indicates no more data.

## Notes
- Sort aggregated results globally before writing to sheets.
- Validate presence of `photos` and `sizes` arrays before accessing.
- Match `sizes[].techSize` to your internal size mapping if needed.

## Status codes
- 200 — OK
- 400 — Bad Request
- 401 — Unauthorized
- 403 — Forbidden
- 429 — Too Many Requests

## Reference
- Wildberries Dev Portal — Cards list: `https://dev.wildberries.ru/openapi/work-with-products#tag/Kartochki-tovarov`


