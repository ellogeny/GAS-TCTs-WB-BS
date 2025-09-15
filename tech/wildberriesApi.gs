/**
 * Wildberries API specific utilities
 */
function createWildberriesApi(apiUtils) {
  const eps = getEndpoints();
  const CARD = eps.endpoint('https://card.wb.ru/cards/v2/detail');
  const PRICES = eps.endpoint('https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter');
  const WAREHOUSES = eps.endpoint('https://marketplace-api.wildberries.ru/api/v3/warehouses');
  const STOCKS_BASE = eps.endpoint('https://marketplace-api.wildberries.ru/api/v3/stocks');
  const REMAINS_TASK = eps.endpoint('https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains');
  const REMAINS_TASKS_BASE = eps.endpoint('https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains/tasks');

  return {
    getCardData(nmId) {
      const url = `${CARD}?appType=1&curr=rub&dest=-1257786&nm=${nmId}`;
      const data = apiUtils.fetch(url, {}, `Failed to fetch card data for nmId ${nmId}`);
      return data?.data?.products?.[0] || null;
    },

    /**
     * Batch fetch card data for many nmIds using cards API multi-nm support.
     * Returns Map<string, product>
     */
    getCardsData(nmIds) {
      if (!Array.isArray(nmIds) || nmIds.length === 0) {
        return new Map();
      }

      // WB cards API accepts multiple nm separated by ';'. Chunk to be safe.
      const CHUNK_SIZE = 100;
      const resultMap = new Map();
      for (let i = 0; i < nmIds.length; i += CHUNK_SIZE) {
        const chunk = nmIds.slice(i, i + CHUNK_SIZE);
        const joined = chunk.join(';');
        const url = `${CARD}?appType=1&curr=rub&dest=-1257786&nm=${joined}`;
        const data = apiUtils.fetch(url, {}, `Failed to fetch card data for ${chunk.length} nmIds`);
        const products = data?.data?.products || [];
        products.forEach(p => {
          if (p?.id) {
            resultMap.set(p.id.toString(), p);
          }
        });
        // conservative pacing for public endpoint
        Utilities.sleep(600);
      }

      return resultMap;
    },

    getAllPricesData(apiKey, targetNmIdsSet) {
      if (!apiKey) {
        Logger.log('No API key provided');
        return null;
      }

      const pricesMap = new Map();
      let offset = 0;
      let hasMore = true;
      const needFilter = targetNmIdsSet && typeof targetNmIdsSet.has === 'function' && targetNmIdsSet.size > 0;

      while (hasMore) {
        const url = `${PRICES}?limit=1000&offset=${offset}`;
        const options = {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        };

        const data = apiUtils.fetch(url, options, `Failed to fetch prices data at offset ${offset}`);
        
        if (!data?.data?.listGoods || data.data.listGoods.length === 0) {
          hasMore = false;
          continue;
        }

        data.data.listGoods.forEach(item => {
          const key = item.nmID && item.nmID.toString();
          if (!key) return;
          if (!needFilter || targetNmIdsSet.has(key)) {
            pricesMap.set(key, item);
          }
        });

        // Early stop: if we only need a subset and already collected all of them
        if (needFilter && pricesMap.size >= targetNmIdsSet.size) {
          hasMore = false;
        } else if (data.data.listGoods.length < 1000) {
          hasMore = false;
        } else {
          offset += 1000;
          Utilities.sleep(600);
        }
      }

      return pricesMap;
    },

    /**
     * Get seller warehouses (returns array of { name, officeId, id, ... })
     */
    getSellerWarehouses(apiKey) {
      if (!apiKey) return [];
      const options = {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      };
      const data = apiUtils.fetch(WAREHOUSES, options, 'Failed to fetch seller warehouses');
      return Array.isArray(data) ? data : [];
    },

    /**
     * Get stocks for given warehouseId (officeId) and skus array.
     * Returns map sku -> amount
     */
    getSellerStocks(apiKey, warehouseId, skus) {
      if (!apiKey || !warehouseId || !Array.isArray(skus) || skus.length === 0) return new Map();
      const url = `${STOCKS_BASE}/${warehouseId}`;
      const body = { skus: skus };
      const options = {
        method: 'post',
        payload: JSON.stringify(body),
        contentType: 'application/json',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      const data = apiUtils.fetch(url, options, `Failed to fetch stocks for warehouse ${warehouseId}`);
      const result = new Map();
      const list = data && data.stocks ? data.stocks : [];
      list.forEach(s => {
        const key = s && s.sku ? s.sku.toString() : null;
        const amount = (s && typeof s.amount === 'number') ? s.amount : 0;
        if (key) result.set(key, amount);
      });
      return result;
    },

    /**
     * Create analytics remains task. Returns taskId or null.
     */
    createRemainsTask(apiKey) {
      if (!apiKey) return null;
      const url = `${REMAINS_TASK}?groupByNm=true&groupBySize=true`;
      const options = {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      const data = apiUtils.fetch(url, options, 'Failed to create remains task');
      return data && data.data && data.data.taskId ? data.data.taskId : null;
    },

    /**
     * Download analytics remains by task id. Returns array of items.
     */
    downloadRemains(apiKey, taskId) {
      if (!apiKey || !taskId) return [];
      const url = `${REMAINS_TASKS_BASE}/${taskId}/download`;
      const options = {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      const data = apiUtils.fetch(url, options, `Failed to download remains for task ${taskId}`);
      return Array.isArray(data) ? data : [];
    },

    /**
     * Check analytics remains task status.
     * Returns normalized status string if possible, else raw object.
     */
    getRemainsTaskStatus(apiKey, taskId) {
      if (!apiKey || !taskId) return null;
      const url = `${REMAINS_TASKS_BASE}/${taskId}/status`;
      const options = {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      const data = apiUtils.fetch(url, options, `Failed to get status for task ${taskId}`);
      // Try to normalize common shapes
      const status = (data && (data.status || (data.data && data.data.status))) || null;
      return status || data || null;
    },

    processPriceData(sellerId, nmId, cardData, priceData, displaySellerId, displayNmId) {
      const safeSeller = displaySellerId || sellerId;
      const safeNm = displayNmId || nmId;

      const cardSizes = cardData?.sizes || [];
      const priceSizes = priceData?.sizes || [];

      if (!cardSizes.length || !priceSizes.length) {
        return [[safeSeller, safeNm, 'max', 0, 0, 0]];
      }

      const pairs = [];
      cardSizes.forEach(cardSize => {
        const orig = cardSize?.origName;
        const total = cardSize?.price?.total ? (cardSize.price.total / 100) : 0;
        if (!orig || total <= 0) return;
        const priceSize = priceSizes.find(ps => ps.techSizeName === orig);
        if (priceSize) {
          pairs.push({
            techSizeName: priceSize.techSizeName,
            discountedPrice: priceSize.discountedPrice || 0,
            clubDiscountedPrice: priceSize.clubDiscountedPrice || 0,
            total
          });
        }
      });

      if (!pairs.length) {
        return [[safeSeller, safeNm, 'max', 0, 0, 0]];
      }

      pairs.sort((a, b) => b.total - a.total);

      const results = [];
      const max = pairs[0];
      results.push([safeSeller, safeNm, 'max', max.discountedPrice, max.clubDiscountedPrice, max.total]);

      const min = pairs[pairs.length - 1];
      if (pairs.length > 1 && min.total < max.total) {
        results.push([safeSeller, safeNm, 'min', min.discountedPrice, min.clubDiscountedPrice, min.total]);
      }

      return results;
    }
  };
}





