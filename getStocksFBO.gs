/**
 * GetStocksFBO: Fetch WB warehouse remains (FBO) and write to Stocks
 * Output columns: [Seller ID, nmID, techSize, warehouse, amount]
 */
function GetStocksFBO() {
	const TIMESTAMP_TARGET = getTimestampTarget('GetStocksFBO');
	const SHEET_NAME = 'Stocks';

	const apiUtils = createApiUtils();
	const wbApi = createWildberriesApi(apiUtils);
	const sheetUtils = createSheetUtils();
	const domain = createDomainUtils();

	// Collect sellerIds from source sheet
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const source = ss.getSheetByName('Товары_ПОРЯДОК');
	if (!source) throw new Error("Sheet 'Товары_ПОРЯДОК' not found");
	const data = source.getRange(2, 1, Math.max(0, source.getLastRow() - 1), 5).getValues();
	const sellerIds = [...new Set(data.filter(r => r[4]).map(r => r[4].toString()))];

	// Prepare target sheet
	const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
	const HEADERS = ['Seller ID', 'nmID', 'techSize', 'warehouse', 'amount'];
	sheetUtils.initSheet(sheet, HEADERS);

	const allRows = [];

	// Phase 1: create tasks for all sellers (batch get API keys + light staggering)
	const tasks = [];
	const apiKeyMap = sheetUtils.getSellerApiKeys(sellerIds);
	sellerIds.forEach((sellerId, idx) => {
		const apiKey = apiKeyMap && apiKeyMap[sellerId];
		if (!apiKey) { Logger.log('No API key for seller ' + sellerId); return; }
		const taskId = wbApi.createRemainsTask(apiKey);
		if (!taskId) { Logger.log('Failed to create remains task for ' + sellerId); return; }
		// Initialize nextAllowed time for status polling immediately (eligible now)
		tasks.push({ sellerId: sellerId, apiKey: apiKey, taskId: taskId, done: false, nextStatusAt: Date.now() });
		// Stagger next creation a bit to avoid exact alignment
		Utilities.sleep(150);
	});
	// Phase 1 created tasks for all sellers

	// Phase 2: dynamic per-seller polling using nextAllowedAt (>= 5s per seller)
	while (true) {
		// Check if any pending tasks remain
		const pending = tasks.filter(t => !t.done);
		if (pending.length === 0) break;
		const now = Date.now();
		let ranAny = false;
		let nextDueInMs = 60000; // default wait bound
		for (let i = 0; i < tasks.length; i++) {
			const t = tasks[i];
			if (t.done) continue;
			const dueIn = Math.max(0, (t.nextStatusAt || 0) - now);
			if (dueIn > 0) {
				nextDueInMs = Math.min(nextDueInMs, dueIn);
				continue;
			}
			// Eligible to poll status
			ranAny = true;
			const status = wbApi.getRemainsTaskStatus(t.apiKey, t.taskId);
			const s = (status && status.toString) ? status.toString().toLowerCase() : '';
			if (s.indexOf('ready') >= 0 || s.indexOf('done') >= 0 || s.indexOf('finished') >= 0 || s.indexOf('completed') >= 0) {
				const remains = wbApi.downloadRemains(t.apiKey, t.taskId) || [];
				if (Array.isArray(remains) && remains.length > 0) {
					remains.forEach(item => {
						const nmId = item && item.nmId ? item.nmId.toString() : null;
						const techSize = item && item.techSize ? item.techSize.toString() : '';
						const warehouses = (item && item.warehouses) || [];
						warehouses.forEach(w => {
							if (!nmId) return;
							const warehouseName = domain.normalizeWarehouseName((w && w.warehouseName) || '');
							const qty = (w && typeof w.quantity === 'number') ? w.quantity : 0;
							allRows.push([t.sellerId, nmId, techSize, warehouseName, qty]);
						});
					});
				}
				t.done = true;
			} else if (s.indexOf('error') >= 0 || s.indexOf('failed') >= 0 || s.indexOf('cancel') >= 0) {
				Logger.log('Remains task failed for ' + t.sellerId + ' status ' + s);
				t.done = true;
			} else {
				// Not ready yet; schedule next check no sooner than 5s later
				t.nextStatusAt = now + 5000;
				nextDueInMs = Math.min(nextDueInMs, 5000);
			}
		}
		if (!ranAny) {
			Utilities.sleep(Math.max(100, nextDueInMs));
		}
	}

	// Global sort: nmId, sellerId, techSize, warehouse
	const parseNum = (v) => {
		const s = (v || '').toString();
		return Number(s.charAt(0) === "'" ? s.slice(1) : s) || 0;
	};
	allRows.sort((a, b) => {
		const an = parseNum(a[1]);
		const bn = parseNum(b[1]);
		if (an !== bn) return an - bn;
		if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
		if (a[2] !== b[2]) return (a[2] || '').localeCompare(b[2] || '');
		return (a[3] || '').localeCompare(b[3] || '');
	});

	// Ensure grouping keys are text: sellerId, nmId, techSize, warehouse
	const formatted = allRows.map(r => [r[0], r[1], (r[2] ? ("'" + r[2]) : r[2]), r[3], r[4]]);
	sheetUtils.writeBatch(sheet, formatted, { forceTextCols: [0, 1, 2, 3] });

	updateLastRunTimestamp('GetStocksFBO');
}

// Test helper was removed by request. Use GetStocksFBO() directly if needed.



