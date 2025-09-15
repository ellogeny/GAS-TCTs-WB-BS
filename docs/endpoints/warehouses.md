# Warehouses endpoint

## Summary
- Base: `https://marketplace-api.wildberries.ru/api/v3/warehouses`
- Purpose: Manage and list seller warehouses (`officeId`, processing status, contacts)

## Auth and headers
```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

## Endpoints

### List warehouses
```
GET /api/v3/warehouses
```
Response (example):
```json
[
  {
    "name": "ул. Троицкая, Подольск, Московская обл.",
    "officeId": 15,
    "id": 1,
    "cargoType": 1,
    "deliveryType": 1,
    "isDeleting": false,
    "isProcessing": true
  }
]
```

### Create warehouse
```
POST /api/v3/warehouses
{ /* warehouse payload */ }
```
Response: `201 Created` on success.

### Update warehouse
```
PUT /api/v3/warehouses/{warehouseId}
{ /* warehouse payload */ }
```
Response: `200 OK` or `204 No Content` depending on API behavior.

### Delete warehouse
```
DELETE /api/v3/warehouses/{warehouseId}
```
Response: `204 No Content`.

### Contacts
```
GET  /api/v3/dbw/warehouses/{warehouseId}/contacts
PUT  /api/v3/dbw/warehouses/{warehouseId}/contacts
```

## Object details (list)
- Warehouse
  - `id`: number — internal id.
  - `officeId`: number — use as `warehouseId` in Stocks API.
  - `name`: string — address/name.
  - `cargoType`: number — cargo type code.
  - `deliveryType`: number — delivery type code.
  - `isProcessing`: boolean — can process shipments.
  - `isDeleting`: boolean — scheduled for deletion.

## Notes
- Use `officeId` as `warehouseId` for Stocks API calls.
- Prefer warehouses with `isProcessing = true`.
- Sort aggregated results globally before writing to sheets.

## Status codes
- 200 — OK
- 201 — Created (POST)
- 204 — No Content (DELETE)
- 400 — Bad Request
- 401 — Unauthorized
- 403 — Forbidden
- 404 — Not Found
- 429 — Too Many Requests

## Reference
- WB Warehouses v3: `https://dev.wildberries.ru/openapi/work-with-products#tag/Sklady-prodavtsa`
