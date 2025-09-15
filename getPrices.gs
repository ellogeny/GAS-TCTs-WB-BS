function GetPricesWb() {
  const SHEET_NAMES = {
    SOURCE: 'Товары_ПОРЯДОК',
    PRICES: 'Prices'
  };

  const RANGES = {
    NM_IDS: 'A2:A',
    SELLER_IDS: 'E2:E'
  };

  const HEADERS = ['Seller ID', 'nmID', 'min/max', 'discountedPrice', 'clubDiscountedPrice', 'total'];
  
  // Timestamp target for last successful run
  const TIMESTAMP_TARGET = getTimestampTarget('GetPricesWb');
  
  // Initialize utilities
  const apiUtils = createApiUtils();
  const wbApi = createWildberriesApi(apiUtils);
  const sheetUtils = createSheetUtils();

  // Initialize sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SHEET_NAMES.SOURCE);
  const pricesSheet = ss.getSheetByName(SHEET_NAMES.PRICES);
  
  // Initialize prices sheet
  sheetUtils.initSheet(pricesSheet, HEADERS);

  // Get items to process
  const data = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, 5).getValues();
  const items = data
    .filter(row => row[0] && row[4])
    .map(row => ({
      nmId: row[0].toString(),
      sellerId: row[4].toString(),
      displayNmId: row[0].toString(),
      displaySellerId: row[4].toString()
    }));

  Logger.log(`Processing ${items.length} items`);
  
  // Get API keys and group items by seller
  const uniqueSellerIds = [...new Set(items.map(item => item.sellerId))];
  const sellerApiKeys = sheetUtils.getSellerApiKeys(uniqueSellerIds);
  
  // Group items by seller
  const itemsBySeller = items.reduce((acc, item) => {
    if (!acc[item.sellerId]) {
      acc[item.sellerId] = [];
    }
    acc[item.sellerId].push(item);
    return acc;
  }, {});

  let resultsToWrite = [];

  // Process each seller
  Object.entries(itemsBySeller).forEach(([sellerId, sellerItems]) => {
    try {
      Logger.log(`Processing seller ${sellerId} with ${sellerItems.length} items`);
      
      const nmIdsForSeller = sellerItems.map(it => it.nmId);

      // Batch get card data and prices for only required nmIds
      const cardMap = wbApi.getCardsData(nmIdsForSeller);
      const pricesMap = wbApi.getAllPricesData(sellerApiKeys[sellerId], new Set(nmIdsForSeller));
      if (!pricesMap) {
        Logger.log(`Failed to get prices for seller ${sellerId}`);
        return;
      }
      
      // Process each item for this seller
      sellerItems.forEach(item => {
        try {
          const cardData = cardMap.get(item.nmId);
          const priceData = pricesMap.get(item.nmId);
          
          if (cardData || priceData) {
            const results = wbApi.processPriceData(sellerId, item.nmId, cardData, priceData, item.displaySellerId, item.displayNmId);
            resultsToWrite = resultsToWrite.concat(results);
          } else {
            Logger.log(`No data found for nmId ${item.nmId}`);
          }
        } catch (error) {
          Logger.log(`Error processing nmId ${item.nmId}: ${error.toString()}`);
        }
      });
      
      // Add small delay between sellers
      Utilities.sleep(500);
      
    } catch (error) {
      Logger.log(`Error processing seller ${sellerId}: ${error.toString()}`);
    }
  });

  // Sort all results by nmId ascending, then by type (max before min)
  if (resultsToWrite.length > 0) {
    const parseNm = (value) => {
      const str = (value || '').toString();
      return Number(str.charAt(0) === "'" ? str.slice(1) : str) || 0;
    };
    const typeOrder = { 'max': 0, 'min': 1 };
    resultsToWrite.sort((a, b) => {
      const aNm = parseNm(a[1]);
      const bNm = parseNm(b[1]);
      if (aNm !== bNm) return aNm - bNm;
      const aType = typeOrder[a[2]] !== undefined ? typeOrder[a[2]] : 2;
      const bType = typeOrder[b[2]] !== undefined ? typeOrder[b[2]] : 2;
      return aType - bType;
    });

    // Force text for grouping keys: sellerId, nmId, type
    sheetUtils.writeBatch(pricesSheet, resultsToWrite, { forceTextCols: [0, 1, 2] });
  }
  
  // Write last successful run timestamp
  updateLastRunTimestamp('GetPricesWb');

  Logger.log('Processing completed');
}

// Test runners removed; run GetPricesWb() directly