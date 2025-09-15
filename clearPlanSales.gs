/**
 * Очищает ВСЕ значения (без форматов и проверок) на листе 'План_Продаж'
 * начиная с указанной строки и до конца листа по всем столбцам.
 */
function ClearPlanSalesRanges() {
  const SHEET_NAME = 'План_Продаж';
  const START_ROW = 13;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet 'План_Продаж' not found");
  }

  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  const numRows = Math.max(0, maxRows - START_ROW + 1);
  if (numRows <= 0) {
    Logger.log('Nothing to clear: no rows at or below START_ROW');
    return;
  }

  const range = sheet.getRange(START_ROW, 1, numRows, maxCols);
  range.clear({ contentsOnly: true });
  Logger.log(`Cleared values on ${SHEET_NAME} from row ${START_ROW} to ${maxRows}, columns 1..${maxCols}`);
}