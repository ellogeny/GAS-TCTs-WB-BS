/**
 * Centralized GAS tests. All test functions live in this file.
 * Each test creates or clears a sheet named FunctionName+Test and writes a small table.
 */

function Test_NormalizeWarehouseName() {
	const utils = createDomainUtils();
	const cases = [
		['Всего находится на складах', 'totalAvailable'],
		['В пути до получателей', 'inWayToClients'],
		['В пути возвраты на склад WB', 'inWayFromClients'],
		['Склад Иваново', 'Склад Иваново']
	];

	const rows = [['Input', 'Expected', 'Actual', 'Pass']];
	for (let i = 0; i < cases.length; i++) {
		const input = cases[i][0];
		const expected = cases[i][1];
		const actual = utils.normalizeWarehouseName(input);
		rows.push([input, expected, actual, actual === expected]);
	}

	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const name = 'NormalizeWarehouseNameTest';
	let sheet = ss.getSheetByName(name);
	if (!sheet) sheet = ss.insertSheet(name); else sheet.clear();
	const range = sheet.getRange(1, 1, rows.length, rows[0].length);
	range.setValues(rows);
	sheet.setFrozenRows(1);
}

function Test_ParseNumericFromText() {
	const utils = createDomainUtils();
	const cases = [
		["'12345", 12345],
		['0123', 123],
		['', 0],
		['abc', 0],
		[" '678' ", 0]
	];

	const rows = [['Input', 'Expected', 'Actual', 'Pass']];
	for (let i = 0; i < cases.length; i++) {
		const input = cases[i][0];
		const expected = cases[i][1];
		const actual = utils.parseNumericFromText(input);
		rows.push([input, expected, actual, actual === expected]);
	}

	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const name = 'ParseNumericFromTextTest';
	let sheet = ss.getSheetByName(name);
	if (!sheet) sheet = ss.insertSheet(name); else sheet.clear();
	const range = sheet.getRange(1, 1, rows.length, rows[0].length);
	range.setValues(rows);
	sheet.setFrozenRows(1);
}

function Test_SortComparator() {
	const utils = createDomainUtils();
	const rows = [
		['sellerB', "'2", 'L', 'WH2'],
		['sellerA', "'1", 'M', 'WH1'],
		['sellerA', "'1", 'L', 'WH1'],
		['sellerA', "'1", 'L', 'WH2']
	];
	const sorted = rows.slice().sort(utils.sortByNmIdThenSellerThenSizeThenWarehouse);
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const name = 'SortComparatorTest';
	let sheet = ss.getSheetByName(name);
	if (!sheet) sheet = ss.insertSheet(name); else sheet.clear();
	const header = [['sellerId', 'nmId', 'techSize', 'warehouse']];
	const range = sheet.getRange(1, 1, header.length + sorted.length, header[0].length);
	range.setValues(header.concat(sorted));
	sheet.setFrozenRows(1);
}



