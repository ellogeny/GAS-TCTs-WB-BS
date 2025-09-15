/**
 * Spreadsheet utilities
 */
function createSheetUtils() {
  return {
    initSheet(sheet, headers) {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clear();
      }
      
      if (sheet.getRange(1, 1).getValue() === '') {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    },

    /**
     * Ensures sheet has at least needRows rows.
     */
    ensureCapacityRows(sheet, needRows) {
      const maxRows = sheet.getMaxRows();
      if (maxRows < needRows) sheet.insertRowsAfter(maxRows, needRows - maxRows);
    },

    /**
     * Normalizes width and applies forced text to specified column indexes (0-based).
     */
    formatRowsForWrite(rows, colCount, forceTextCols) {
      const set = new Set(forceTextCols || []);
      const rowsNormalized = (rows || []).map(row => {
        const base = Array.isArray(row) ? row.slice(0, colCount) : [];
        while (base.length < colCount) base.push('');
        return base;
      });
      return rowsNormalized.map(r => r.map((cell, idx) => {
        if (set.has(idx)) {
          if (cell === null || cell === undefined || cell === '') return '';
          const s = cell.toString();
          return s.charAt(0) === "'" ? s : ("'" + s);
        }
        return cell;
      }));
    },

    /**
     * Groups ascending row indexes into contiguous ranges {start, count}.
     */
    buildContiguousRanges(rowsAsc) {
      const ranges = [];
      if (!rowsAsc || rowsAsc.length === 0) return ranges;
      let start = rowsAsc[0];
      let prev = rowsAsc[0];
      let count = 1;
      for (let i = 1; i < rowsAsc.length; i++) {
        const cur = rowsAsc[i];
        if (cur === prev + 1) {
          count++;
        } else {
          ranges.push({ start, count });
          start = cur;
          count = 1;
        }
        prev = cur;
      }
      ranges.push({ start, count });
      return ranges;
    },

    /**
     * Appends rows to the sheet with optional forced-text columns.
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
     * @param {any[][]} data
     * @param {{ forceTextCols?: number[] }} options
     */
    writeBatch(sheet, data, options) {
      if (!Array.isArray(data) || data.length === 0) return;
      const forceCols = (options && Array.isArray(options.forceTextCols))
        ? options.forceTextCols
        : [0, 1]; // default: first two columns (sellerId, nmId)

      const forceSet = new Set(forceCols);
      const formattedData = data.map(row => row.map((cell, idx) => {
        if (forceSet.has(idx) && cell !== null && cell !== undefined && cell !== '') {
          const s = cell.toString();
          return s.charAt(0) === "'" ? s : ("'" + s);
        }
        return cell;
      }));

      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, formattedData.length, formattedData[0].length).setValues(formattedData);
    },

    getSellerApiKeys(sellerIds) {
      const scriptProperties = PropertiesService.getScriptProperties();
      const apiKeys = {};
      
      sellerIds.forEach(sellerId => {
        const apiKey = scriptProperties.getProperty(sellerId);
        if (apiKey) {
          apiKeys[sellerId] = apiKey;
          Logger.log(`Found API key for seller ${sellerId}`);
        } else {
          Logger.log(`Warning: API key not found for seller ${sellerId}`);
        }
      });
      
      return apiKeys;
    }
  };
}





