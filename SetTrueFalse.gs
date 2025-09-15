/** @OnlyCurrentDoc */

/**
 * Writes a boolean value into a specific cell on a specific sheet.
 * @param {string} sheetName
 * @param {string} a1Range - Single-cell A1 notation (e.g., "A1", "C3")
 * @param {boolean} value
 */
function setBooleanInCell(sheetName, a1Range, value) {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = ss.getSheetByName(sheetName);
	if (!sheet) {
		Logger.log(`Sheet not found: ${sheetName}`);
		return;
	}
	const range = sheet.getRange(a1Range);
	range.setValue(!!value);
	Logger.log(`Set ${!!value} in ${sheetName}!${a1Range}`);
}

/**
 * Entry point: define target sheet and cell, set TRUE.
 */
function SetTrueSalesPlan() {
	const SHEET = 'План_Продаж';
	const RANGE = 'A1';
	setBooleanInCell(SHEET, RANGE, true);
}

function SetFalseSalesPlan() {
	const SHEET = 'План_Продаж';
	const RANGE = 'A1';
	setBooleanInCell(SHEET, RANGE, false);
}
