# Stocks endpoint

## Summary
- Base: `https://marketplace-api.wildberries.ru/api/v3/stocks/{warehouseId}`
- Purpose: Manage and query seller stocks (get, update, delete) by SKUs for a warehouse

## Auth and headers
```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

## Rate limits and retries
- Per WB docs: 300 requests per minute per seller for Stocks group; burst 20; min interval ≈200ms. A `409` counts as 5 requests.
- Use exponential backoff on `409`, `429`, and 5xx. Respect server headers if present.

## Operations

### Get stocks
```
POST /api/v3/stocks/{warehouseId}
{
  "skus": ["BarcodeTest123"]
}
```
Response:
```json
{
  "stocks": [ { "sku": "BarcodeTest123", "amount": 10 } ]
}
```

### Update stocks
```
PUT /api/v3/stocks/{warehouseId}
{
  "stocks": [ { "sku": "BarcodeTest123", "amount": 10 } ]
}
```
Response: `204 No Content` on success.

Notes: Request parameter names are not validated; incorrect names return 204 but do nothing — double-check body keys.

### Delete stocks
```
DELETE /api/v3/stocks/{warehouseId}
{
  "skus": ["BarcodeTest123"]
}
```
Response: `204 No Content` on success.

## Object details
- Stock item
  - `sku`: string — barcode.
  - `amount`: number — stock quantity for the given warehouse.

## Notes
- Chunk SKU lists (e.g., 100 per call) and aggregate results client-side.
- `warehouseId` equals `officeId` from warehouses API.
- Sort results globally before writing to sheets.

## Status codes
- 200 — OK (GET stocks)
- 204 — No Content (update/delete success)
- 400 — Bad Request
- 401 — Unauthorized
- 403 — Forbidden
- 404 — Not Found
- 406 — Update blocked (for PUT)
- 409 — Conflict (counts as 5 requests)
- 429 — Too Many Requests

## Reference
- WB Stocks v3: `https://dev.wildberries.ru/openapi/work-with-products#tag/Ostatki-na-skladakh-prodavtsa`
