# Card details endpoint

## Summary
- Base: `https://card.wb.ru/cards/v2/detail`
- Purpose: Fetch public product details (sizes, prices snapshot, meta) by `nm` ids.

## Auth and headers
- No auth (public endpoint)
- Query params required

## Rate limits and retries
- Follow general policy from `docs/README.md`.
- Pace requests conservatively (≈600–1000 ms between calls) and use exponential backoff on non-200 responses.
- Chunk `nm` batches to ~100 per call to avoid overfetching.

## Request (query params)
- `appType`: number (e.g., 1)
- `curr`: currency (e.g., `rub`)
- `dest`: destination (e.g., `-1257786`)
- `nm`: product id(s). Supports multiple values joined by `;`.

Example URL (single):
```
https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=<nmId>
```

Example URL (batched):
```
https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=123;456;789
```

## Response (truncated)
```json
{
  "data": {
    "products": [
      {
        "id": 223535350,
        "name": "Product title",
        "brand": "Brand name",
        "salePriceU": 82700,
        "priceU": 240000,
        "sizes": [
          {
            "name": "44-46",
            "origName": "M",
            "skus": ["barcode1"],
            "price": { "basic": 240000, "product": 81900, "total": 82700 }
          }
        ]
      }
    ]
  }
}
```

## Object details
- Product
  - `id` (nmID): number — WB product identifier.
  - `name`: string — product title.
  - `brand`: string — brand name.
  - `priceU`/`salePriceU`: number — price values in kopecks.
  - `sizes`: array — variations with sizes and price breakdown.

- Size
  - `name`: string — size shown on product card.
  - `origName`: string — canonical size label.
  - `skus`: string[] — barcodes.
  - `price`: object — `{ basic, product, total }` in kopecks.

## Notes
- If multiple products are returned, consumers typically use `data.products[0]` when a single nmID was requested.
- Guard against missing `sizes` or `price` fields.
- When combining with the prices endpoint, match card `sizes[].origName` to prices `sizes[].techSizeName`.


## Reference
- Public WB catalog endpoint: `https://card.wb.ru/cards/v2/detail`
