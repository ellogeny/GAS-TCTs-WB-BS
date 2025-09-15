/**
 * Centralized endpoint access by URL.
 * Usage:
 *   const eps = getEndpoints();
 *   const CARD = eps.endpoint('https://card.wb.ru/cards/v2/detail');
 */
function getEndpoints() {
  const endpoints = {
    'https://card.wb.ru/cards/v2/detail': 'https://card.wb.ru/cards/v2/detail',
    'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter': 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter',
    // Seller warehouses and stocks
    'https://marketplace-api.wildberries.ru/api/v3/warehouses': 'https://marketplace-api.wildberries.ru/api/v3/warehouses',
    'https://marketplace-api.wildberries.ru/api/v3/stocks': 'https://marketplace-api.wildberries.ru/api/v3/stocks',
    // Analytics remains task endpoints
    'https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains': 'https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains',
    'https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains/tasks': 'https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains/tasks'
  };

  return {
    endpoint(url) {
      return endpoints[url];
    },
    list() {
      return Object.keys(endpoints);
    }
  };
}




