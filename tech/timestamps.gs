/** @OnlyCurrentDoc */
/**
 * @typedef {{ SHEET: string, RANGE: string }} TimestampTarget
 */
const TIMESTAMP_REGISTRY = Object.freeze({
	GetPricesWb: { SHEET: 'TIMESTAMps', RANGE: 'C3' },
	GetStocksFBO: { SHEET: 'TIMESTAMps', RANGE: 'C4' },
	GetStocksFBS: { SHEET: 'TIMESTAMps', RANGE: 'C5' },
	UpdateFixPlan: { SHEET: 'TIMESTAMps', RANGE: 'C6' }
});

/**
 * Returns target sheet and cell for timestamp by script key.
 * @param {string} scriptKey
 * @returns {TimestampTarget}
 */
function getTimestampTarget(scriptKey) {
	const target = TIMESTAMP_REGISTRY[scriptKey];
	if (!target) {
		throw new Error(`Timestamp target not configured for: ${scriptKey}`);
	}
	return target;
}

/**
 * Writes current datetime to the timestamp cell for the script.
 * @param {string} scriptKey
 */
function updateLastRunTimestamp(scriptKey) {
	const target = getTimestampTarget(scriptKey);
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	try {
		const infoSheet = ss.getSheetByName(target.SHEET) || ss.insertSheet(target.SHEET);
		const cRange = infoSheet.getRange(target.RANGE);
		cRange.setValue(new Date());
		const row = cRange.getRow();
		// Write script name to column B next to the timestamp
		infoSheet.getRange(row, 2).setValue(scriptKey);
	} catch (e) {
		Logger.log(`Failed to write last run timestamp to ${target.SHEET}!${target.RANGE}: ${e}`);
	}
}


/**
 * Writes timestamp to the registry C-cell and a note to the adjacent D-cell.
 * @param {string} scriptKey - key in TIMESTAMP_REGISTRY
 * @param {Date} periodFrom
 * @param {Date} periodTo
 * @param {number} skuCount
 * @param {string=} tz - e.g. 'Europe/Moscow'; defaults to spreadsheet TZ
 * @param {string=} userEmail - optional explicit user email
 * @param {string=} errorMessage - optional error text; if provided, note will contain ERROR
 */
function updateRunTimestampWithNote(scriptKey, periodFrom, periodTo, skuCount, tz, userEmail, errorMessage) {
	const target = getTimestampTarget(scriptKey);
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const infoSheet = ss.getSheetByName(target.SHEET) || ss.insertSheet(target.SHEET);
	const cRange = infoSheet.getRange(target.RANGE);
	// Write current datetime to C-cell
	cRange.setValue(new Date());
	// Compute D-cell at the same row
	const row = cRange.getRow();
	// Write script name to column B next to the timestamp
	infoSheet.getRange(row, 2).setValue(scriptKey);
	const tzToUse = tz || ss.getSpreadsheetTimeZone() || 'Europe/Moscow';
	const isValidDate = d => d && typeof d.getTime === 'function' && !isNaN(d.getTime());
	const fromStr = isValidDate(periodFrom) ? Utilities.formatDate(periodFrom, tzToUse, 'dd.MM') : 'n/a';
	const toStr = isValidDate(periodTo) ? Utilities.formatDate(periodTo, tzToUse, 'dd.MM.yy') : 'n/a';
	const user = userEmail || (Session.getActiveUser && Session.getActiveUser().getEmail()) || 'user';
	const note = errorMessage
		? `период ${fromStr} - ${toStr} , ERROR: ${errorMessage} ${user}`
		: `период ${fromStr} - ${toStr} , записано ${skuCount} sku ${user}`;
	infoSheet.getRange(row, 4).setValue(note); // column D
}
