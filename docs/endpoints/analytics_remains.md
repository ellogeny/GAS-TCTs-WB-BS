# Analytics: Warehouse remains

## Summary
- Create: `https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains?groupByNm=true&groupBySize=true`
- Status: `https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains/tasks/{task_id}/status`
- Download: `https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains/tasks/{task_id}/download`
- Purpose: Obtain WB warehouse remains grouped by `nmId` and `techSize`

## Auth and headers
```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

## Rate limits and retries
- Per WB docs: once per 5 seconds per seller; burst up to 5.
- Use polling with exponential backoff on `429`/5xx for status checks.

## Create task (GET)
Endpoint:
```
GET /api/v1/warehouse_remains?groupByNm=true&groupBySize=true
```
Response example:
```json
{ "data": { "taskId": "56ce26c9-e1d5-459a-b7d3-1cef82854f36" } }
```

## Check status (GET)
```
GET /api/v1/warehouse_remains/tasks/{task_id}/status
```
Response example:
```json
{
  "data": { "id": "cad56ec5-91ec-43a2-b5e8-efcf244cf309", "status": "done" }
}
```

Possible statuses: `new`, `processing`, `done`, `error`.

## Download (GET)
```
GET /api/v1/warehouse_remains/tasks/{task_id}/download
```
Call only after the status becomes `done`.

Response example (truncated):
```json
[
  {
    "nmId": 190892097,
    "techSize": "0",
    "volume": 1.46,
    "warehouses": [
      { "warehouseName": "Котовск", "quantity": 111 },
      { "warehouseName": "Всего находится на складах", "quantity": 111 }
    ]
  }
]
```

## Object details (download row)
- `nmId`: number — product id.
- `techSize`: string — technical size label.
- `volume`: number — size volume, used for logistics.
- `warehouses[]`: array — per-warehouse quantities (plus summary rows).

## Notes
- Always create a task, then poll status; download only when `status = done`.
- Poll no more than once per 5 seconds; handle `429/5xx` with retries and backoff.
- Sort aggregated results globally before writing to sheets.

## Status codes
- 200 — OK
- 400 — Bad Request
- 401 — Unauthorized
- 403 — Forbidden
- 404 — Not Found (task)
- 429 — Too Many Requests

## Reference
- WB Analytics — Warehouse remains: `https://dev.wildberries.ru/openapi/work-with-products#tag/Analitika-ostatkov`