/**
 * GetStocksFBS: Fetch Seller (FBS) stocks by SKUs per warehouse and write to StocksFBS
 * Output columns: [Skus, warehouseName, amount]
 */
function GetStocksFBS() {
	const TIMESTAMP_TARGET = getTimestampTarget('GetStocksFBS');
	const SHEET_NAME = 'StocksFBS';

	const apiUtils = createApiUtils();
	const wbApi = createWildberriesApi(apiUtils);
	const sheetUtils = createSheetUtils();
	const domain = createDomainUtils();

	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const source = ss.getSheetByName('Товары_ПОРЯДОК');
	const nomen = ss.getSheetByName('2. БД#Номенклатура');
	if (!source) throw new Error("Sheet 'Товары_ПОРЯДОК' not found");
	if (!nomen) throw new Error("Sheet '2. БД#Номенклатура' not found");

	// Build SKU list per seller
	const srcData = source.getRange(2, 1, Math.max(0, source.getLastRow() - 1), 5).getValues();
	const items = srcData.filter(r => r[0] && r[4]).map(r => ({ nmId: r[0].toString(), sellerId: r[4].toString() }));
	const last = nomen.getLastRow();
	const nomData = last > 1 ? nomen.getRange(2, 2, last - 1, 13).getValues() : [];
	// 0:B nmid, 1:C sellerID, 9:K techSize, 11:M skus
	const byNm = new Map();
	nomData.forEach(r => {
		const nm = r[0] && r[0].toString();
		const seller = r[1] && r[1].toString();
		const skusCell = r[11];
		if (!nm || !seller) return;
		const skus = typeof skusCell === 'string'
			? skusCell.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
			: Array.isArray(skusCell) ? skusCell.map(s => (s || '').toString()).filter(Boolean)
			: (skusCell ? [(skusCell || '').toString()] : []);
		if (!byNm.has(nm)) byNm.set(nm, []);
		byNm.get(nm).push({ sellerId: seller, skus: skus });
	});

	const bySeller = {};
	items.forEach(it => {
		const rows = byNm.get(it.nmId) || [];
		const forSeller = rows.filter(x => x.sellerId === it.sellerId);
		const chosen = forSeller.length ? forSeller : rows;
		const mergedSkus = [...new Set([].concat(...chosen.map(x => x.skus)))].filter(Boolean);
		if (mergedSkus.length === 0) return;
		if (!bySeller[it.sellerId]) bySeller[it.sellerId] = new Set();
		mergedSkus.forEach(s => bySeller[it.sellerId].add(s));
	});

	const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
	const HEADERS = ['Skus', 'warehouse', 'amount'];
	sheetUtils.initSheet(sheet, HEADERS);

	const allRows = [];
	Object.keys(bySeller).forEach(sellerId => {
		const apiKey = sheetUtils.getSellerApiKeys([sellerId])[sellerId];
		if (!apiKey) return;
		const warehouses = wbApi.getSellerWarehouses(apiKey);
		const officeIds = warehouses
			.filter(w => w && w.id)
			.map(w => ({ id: w.id, name: w.name || String(w.id) }));
		const skus = [...bySeller[sellerId]];
		const SKU_CHUNK = 100; // per docs recommendation
		const REQ_BATCH = 10; // keep under rate limits

		// Build task list: each task is one POST stocks request
		const tasks = [];
		officeIds.forEach(wh => {
			for (let i = 0; i < skus.length; i += SKU_CHUNK) {
				tasks.push({ warehouseId: wh.id, warehouseName: wh.name, skus: skus.slice(i, i + SKU_CHUNK) });
			}
		});

		for (let t = 0; t < tasks.length; t += REQ_BATCH) {
			const batch = tasks.slice(t, t + REQ_BATCH);
			const requests = batch.map(task => ({
				url: 'https://marketplace-api.wildberries.ru/api/v3/stocks/' + task.warehouseId,
				requestOptions: {
					method: 'post',
					payload: JSON.stringify({ skus: task.skus }),
					contentType: 'application/json',
					headers: {
						'Authorization': 'Bearer ' + apiKey,
						'Content-Type': 'application/json',
						'Accept': 'application/json'
					}
				},
				errorMessage: 'Failed to fetch stocks for warehouse ' + task.warehouseId
			}));

			const responses = apiUtils.fetchAll(requests) || [];
			for (let i = 0; i < responses.length; i++) {
				const data = responses[i];
				const task = batch[i];
				const list = data && data.stocks ? data.stocks : [];
				for (let j = 0; j < list.length; j++) {
					const s = list[j];
					const key = s && s.sku ? s.sku.toString() : null;
					const amount = (s && typeof s.amount === 'number') ? s.amount : 0;
					if (key && amount > 0) {
						allRows.push([key, task.warehouseName, amount]);
					}
				}
			}
			// sleep a bit between batches to respect rate limits
			Utilities.sleep(1200);
		}
	});

	// Sort: by SKU (text asc), then warehouse (text asc)
	allRows.sort((a, b) => {
		const aSku = (a[0] || '').toString();
		const bSku = (b[0] || '').toString();
		if (aSku !== bSku) return aSku.localeCompare(bSku);
		const aWh = (a[1] || '').toString();
		const bWh = (b[1] || '').toString();
		return aWh.localeCompare(bWh);
	});

	// Single write with forced text for grouping keys: sku and warehouse
	sheetUtils.writeBatch(sheet, allRows, { forceTextCols: [0, 1] });

	updateLastRunTimestamp('GetStocksFBS');
}

 


