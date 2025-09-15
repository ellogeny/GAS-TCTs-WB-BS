/** @OnlyCurrentDoc */

// Entry point FIRST for easy Run selection in GAS
function updateFixPlan() {
	return ProcessFixPlan({ dryRun: false });
}

function ProcessFixPlan(options) {
	options = options || {};
	const dryRun = !!options.dryRun;
	const writeMode = (options.writeMode === 'incremental' || options.writeMode === 'full') ? options.writeMode : 'auto';
	const effectiveThreshold = (typeof options.threshold === 'number' && options.threshold >= 0 && options.threshold <= 1)
		? options.threshold
		: undefined;

	// Config (local only, no globals)
	const SOURCE_SHEET = 'План_Продаж';
	const RESULT_SHEET = 'ФиксПлан';
	const PERIOD_FROM = 'C4';
	const PERIOD_TO = 'C5';
	const TZ = 'Europe/Moscow';
	const NEW_MONTHS_BACK = 2; // current month and previous N months are treated as "new"; all future months are also "new"
	const SOURCE_ROWS_CHUNK_SIZE = 400; // process source rows in chunks to avoid timeouts on large datasets
	const INCREMENTAL_CHANGE_THRESHOLD = 0.3; // default threshold for auto mode

	// Column descriptor — single source of truth
	const HEAD_START = ['Дата (день)', 'idНед', 'idМес'];
	const COLS = [
		// Dims (6)
		{ header: 'Номенклатура ВБ', var: 'sku',           type: 'dim',    isText: true },
		{ header: 'предмет',          var: 'subject',       type: 'dim',    isText: true },
		{ header: 'бренд',            var: 'brand',         type: 'dim',    isText: true },
		{ header: 'ID Кабинета',      var: 'cabinetId',     type: 'dim',    isText: true },
		{ header: 'Склейка',          var: 'mergeKey',      type: 'dim',    isText: true },
		{ header: 'Теги',             var: 'tegs',          type: 'dim',    isText: true },
		// Metrics (19)
		{ header: 'Прибыль, руб',            var: 'profitRub',         type: 'metric', decimals: 0 },
		{ header: 'Заказы, шт',              var: 'ordersQty',         type: 'metric', decimals: 2 },
		{ header: 'Заказы, руб',             var: 'ordersRub',         type: 'metric', decimals: 0 },
		{ header: 'Выкупы, шт',              var: 'purchasesQty',      type: 'metric', decimals: 2 },
		{ header: 'Выкупы, руб',             var: 'purchasesRub',      type: 'metric', decimals: 0 },
		{ header: 'Просмотры',               var: 'views',             type: 'metric', decimals: 0 },
		{ header: 'Клики',                   var: 'clicks',            type: 'metric', decimals: 0 },
		{ header: 'Корзины',                 var: 'attbs',             type: 'metric', decimals: 0 },
		{ header: 'ВБ.Продвижение, руб',     var: 'wbPromotionRub',    type: 'metric', decimals: 0 },
		{ header: 'Показы РК',               var: 'adsViews',          type: 'metric', decimals: 0 },
		{ header: 'Клики РК',                var: 'adsClicks',         type: 'metric', decimals: 0 },
		{ header: 'Прочее, руб (ПЛАН)',      var: 'AdsOtherRub',       type: 'metric', decimals: 0 },
		{ header: 'Себестоимость, руб',      var: 'costRub',           type: 'metric', decimals: 0 },
		{ header: 'Комисcия + экв, руб',     var: 'ComsEquivRub',      type: 'metric', decimals: 0 },
		{ header: 'Доставка, руб',           var: 'deliveryRub',       type: 'metric', decimals: 0 },
		{ header: 'Хранение, руб',           var: 'storageRub',        type: 'metric', decimals: 0 },
		{ header: 'Приемка,руб',             var: 'acceptanceRub',     type: 'metric', decimals: 0 },
		{ header: 'Возвраты, руб',           var: 'returnsRub',        type: 'metric', decimals: 0 },
		{ header: 'Налог, руб',              var: 'taxRub',            type: 'metric', decimals: 0 }
	];
	const DIM_COLS = COLS.filter(function (c) { return c.type === 'dim'; });
	const METRIC_COLS_DESC = COLS.filter(function (c) { return c.type === 'metric'; });
	const HEADERS = HEAD_START.concat(COLS.map(function (c) { return c.header; }));
	const METRIC_DECIMALS = METRIC_COLS_DESC.map(function (c) { return Number(c.decimals) || 0; });
	const FORCE_TEXT_COLS = [1, 2].concat(DIM_COLS.map(function (_, idx) { return HEAD_START.length + idx; }));

	// Source mapping
	const SOURCE_START_ROW = 15;

	// Early descriptor consistency check
	validateDescriptorConsistency(HEAD_START, DIM_COLS.length, METRIC_COLS_DESC.length, HEADERS.length);
	// Variable mapping row (source sheet): variables are placed in row 11
	const VARS_ROW_INDEX = 11;

	// Services
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const src = ss.getSheetByName(SOURCE_SHEET);
	const dst = ss.getSheetByName(RESULT_SHEET) || ss.insertSheet(RESULT_SHEET);

	// 1) Period
	const periodFrom = getDateOnly(src.getRange(PERIOD_FROM).getValue());
	const periodTo = getDateOnly(src.getRange(PERIOD_TO).getValue());
	if (!periodFrom || !periodTo || periodTo < periodFrom) {
		try { updateRunTimestampWithNote('UpdateFixPlan', periodFrom, periodTo, 0, TZ, undefined, 'Неверно задан период в План_Продаж!C4:C5'); } catch (e) {}
		Logger.log('Неверно задан период в План_Продаж!C4:C5');
		return;
	}
	const daysAll = enumerateDaysInclusive(periodFrom, periodTo);
	if (daysAll.length === 0) {
		writeTimestamps(0, periodFrom, periodTo, TZ);
		Logger.log('Период пуст — записано 0 sku.');
		return;
	}
	Logger.log('Входной период: %s → %s (дней: %s)', dateKey(periodFrom, TZ), dateKey(periodTo, TZ), daysAll.length);
	const isNewMonth = buildNewMonthPredicateFromToday(TZ, NEW_MONTHS_BACK);
	const daysNew = daysAll.filter(function (d) { return isNewMonth(d); });
	const daysOld = daysAll.filter(function (d) { return !isNewMonth(d); });
	const hasNew = daysNew.length > 0;
	const hasOld = daysOld.length > 0;

	// 2) Validate old months -> full-month coverage
	try {
		validateOldMonthsCoverage(daysAll, isNewMonth, TZ);
	} catch (err) {
		try { updateRunTimestampWithNote('UpdateFixPlan', periodFrom, periodTo, 0, TZ, undefined, (err && err.message) || String(err)); } catch (e) {}
		Logger.log('Ошибка проверки периода: ' + err);
		return;
	}

	// 3) Read source
	// Build mapping from variable names (row 11) to column indexes
	const varIndexMap = buildVariableIndexMap(src, VARS_ROW_INDEX);
	const requiredVars = COLS.map(function (c) { return c.var; });
	const missingVars = requiredVars.filter(function (v) { return !(v in varIndexMap); });
	if (missingVars.length > 0) {
		Logger.log('Отсутствуют переменные в строке ' + VARS_ROW_INDEX + ': ' + missingVars.join(', '));
		try { updateRunTimestampWithNote('UpdateFixPlan', periodFrom, periodTo, 0, TZ, undefined, 'Нет переменных: ' + missingVars.join(', ')); } catch (e) {}
		return;
	}
	const SRC_COLS_DIM_AND_METRICS = DIM_COLS.map(function (c) { return varIndexMap[c.var]; })
		.concat(METRIC_COLS_DESC.map(function (c) { return varIndexMap[c.var]; }));
	const SRC_COL_B = varIndexMap['sku'];
	const SRC_COL_U = varIndexMap['profitRub'];
	const sourceRows = readSourceRows(src, SOURCE_START_ROW, SRC_COLS_DIM_AND_METRICS, SRC_COL_B, SRC_COL_U, DIM_COLS.length);
	if (sourceRows.length === 0) {
		writeTimestamps(0, periodFrom, periodTo, TZ);
		Logger.log('Нет валидных строк источника — записано 0 sku.');
		return;
	}

	// 4) Overlap keys
	const daysSetNewMonths = new Set(daysNew.map(function (d) { return dateKey(d, TZ); }));
	const monthsSetNew = new Set(monthsFromDays(daysNew, TZ));
	const monthsSetOld = new Set(monthsFromDays(daysOld, TZ));
	const monthsNewArr = Array.from(monthsSetNew).sort();
	const monthsOldArr = Array.from(monthsSetOld).sort();
	Logger.log('Новые месяцы (YYYYMM): %s', monthsNewArr.join(','));
	Logger.log('Старые месяцы (YYYYMM): %s', monthsOldArr.join(','));

	// 5) Existing result filtering
	ensureHeaders(dst, HEADERS);
	const existing = readExistingResult(dst, HEADERS.length);
	const existingMonthsArr = Array.from(new Set(existing.map(function (row) { return (row[2] || '').toString().trim(); }).filter(function (v) { return !!v; }))).sort();
	const monthsRewriteSet = new Set(monthsNewArr.concat(monthsOldArr));
	const monthsLeftArr = existingMonthsArr.filter(function (m) { return !monthsRewriteSet.has(m); });
	Logger.log('Перезаписываем месяцы (YYYYMM): %s', Array.from(monthsRewriteSet).sort().join(','));
	Logger.log('Оставляем без изменений месяцы (YYYYMM): %s', monthsLeftArr.join(','));
	function shouldKeepExistingRow(row) {
		const dateVal = row[0];
		const idMes = (row[2] || '').toString().trim();
		if (dateVal) {
			const dk = dateKey(getDateOnly(dateVal), TZ);
			if (daysSetNewMonths.has(dk)) return false;
			if (idMes && monthsSetOld.has(idMes)) return false;
			return true;
		}
		if (idMes && (monthsSetNew.has(idMes) || monthsSetOld.has(idMes))) return false;
		return true;
	}
	const deleteRowFlags = new Array(existing.length).fill(false);
	const kept = [];
	for (let i = 0; i < existing.length; i++) {
		const row = existing[i];
		const keep = shouldKeepExistingRow(row);
		if (keep) kept.push(row); else deleteRowFlags[i] = true;
	}

	// 6) Build new rows
	const dailyRowsNew = [];
	const monthlyAggMap = {}; // key = monthId||dims.join('||') -> { sum:[], cnt, head[] }
	const cacheIds = {};

	// Pre-fill ID cache for all days to avoid repeated makeIds calls
	if (hasNew) {
		for (let j = 0; j < daysNew.length; j++) {
			const d = daysNew[j];
			cacheIds[d.getTime()] = makeIds(d, TZ);
		}
	}
	if (hasOld) {
		for (let j = 0; j < daysOld.length; j++) {
			const d = daysOld[j];
			cacheIds[d.getTime()] = cacheIds[d.getTime()] || makeIds(d, TZ);
		}
	}

	for (let offset = 0; offset < sourceRows.length; offset += SOURCE_ROWS_CHUNK_SIZE) {
		const end = Math.min(sourceRows.length, offset + SOURCE_ROWS_CHUNK_SIZE);
		for (let i = offset; i < end; i++) {
			const rec = sourceRows[i];
			const dims = rec.dims;
			const metricsDailyRaw = divideMetrics(rec.metrics, daysAll.length);
			const metricsDailyRounded = hasNew ? roundMetricsByIndex(metricsDailyRaw, METRIC_DECIMALS) : null;
			const mdLen = metricsDailyRaw.length;

			// Daily rows for new months only
			if (hasNew) {
				for (let j = 0; j < daysNew.length; j++) {
					const d = daysNew[j];
					const ids = cacheIds[d.getTime()];
					const base = [d, ids.weekId, ids.monthId].concat(dims);
					dailyRowsNew.push(base.concat(metricsDailyRounded));
				}
			}

			// Monthly aggregation for old months only
			if (hasOld) {
				for (let j = 0; j < daysOld.length; j++) {
					const d = daysOld[j];
					const ids = cacheIds[d.getTime()];
					const baseHead = ['', '', ids.monthId].concat(dims);
					const mkey = ids.monthId + '||' + dims.join('||');
					let acc = monthlyAggMap[mkey];
					if (!acc) {
						acc = { sum: new Array(mdLen).fill(0), cnt: 0, head: baseHead.slice(0, 9) };
						monthlyAggMap[mkey] = acc;
					}
					const sumArr = acc.sum;
					for (let k = 0; k < mdLen; k++) sumArr[k] += metricsDailyRaw[k];
					acc.cnt += 1;
				}
			}
		}
		// Optional: Utilities.sleep(1); // tiny yield for very large datasets
	}

	const monthlyRowsOld = [];
	for (const key in monthlyAggMap) if (Object.prototype.hasOwnProperty.call(monthlyAggMap, key)) {
		const ag = monthlyAggMap[key];
		const avg = roundMetricsByIndex(ag.sum.map(v => ag.cnt ? (v / ag.cnt) : 0), METRIC_DECIMALS);
		monthlyRowsOld.push(ag.head.concat(avg));
	}
	Logger.log('К записи подготовлено: месячных строк=%s, дневных строк=%s', monthlyRowsOld.length, dailyRowsNew.length);

	// 7) No sorting: keep original order for speed
	const newRows = monthlyRowsOld.concat(dailyRowsNew);
	const uniqueSkuCount = uniqueCount(newRows.map(function (r) { return (r[3] || '').toString(); }));
	if (newRows.length === 0) {
		writeTimestamps(0, periodFrom, periodTo, TZ);
		Logger.log('Нет строк к записи — записано 0 sku.');
		return;
	}

	// 8) Choose write mode: incremental vs full rewrite
	const totalExisting = existing.length;
	const toDeleteCount = deleteRowFlags.reduce(function (acc, f) { return acc + (f ? 1 : 0); }, 0);
	const toAddCount = newRows.length;
	const changeRatio = totalExisting > 0 ? (toDeleteCount + toAddCount) / totalExisting : 1;
	let useIncremental;
	let modeExplain;
	if (writeMode === 'incremental') { useIncremental = true; modeExplain = 'forced:incremental'; }
	else if (writeMode === 'full') { useIncremental = false; modeExplain = 'forced:full'; }
	else {
		const thr = (effectiveThreshold !== undefined) ? effectiveThreshold : INCREMENTAL_CHANGE_THRESHOLD;
		useIncremental = totalExisting > 0 && changeRatio <= thr;
		modeExplain = 'auto (threshold=' + thr + ')';
	}
	Logger.log('Режим записи: ' + (useIncremental ? 'инкрементальный' : 'полная перезапись') + ' [' + modeExplain + ']; удаляем=' + toDeleteCount + ', добавляем=' + toAddCount + ', существовало=' + totalExisting + ', ratio=' + changeRatio.toFixed(3));

	if (dryRun) {
		const finalLen = kept.length + newRows.length;
		Logger.log('dryRun ' + (useIncremental ? '[incremental]' : '[full]') + ' ' + '[' + modeExplain + ']' + ': удаляем=' + toDeleteCount + ', добавляем=' + toAddCount + ', итог: ' + finalLen + ', SKU: ' + uniqueSkuCount);
		writeTimestamps(uniqueSkuCount, periodFrom, periodTo, TZ);
		return;
	}

	ensureHeaders(dst, HEADERS);
	const sheetUtils = (typeof createSheetUtils === 'function') ? createSheetUtils() : null;
	if (useIncremental) {
		// Delete intersecting rows only (bottom-up, grouped ranges)
		const rowsToDelete = [];
		for (let i = 0; i < deleteRowFlags.length; i++) if (deleteRowFlags[i]) rowsToDelete.push(i + 2); // body starts at row 2
		const ranges = sheetUtils ? sheetUtils.buildContiguousRanges(rowsToDelete) : buildContiguousRanges(rowsToDelete);
		for (let r = ranges.length - 1; r >= 0; r--) {
			const range = ranges[r];
			dst.deleteRows(range.start, range.count);
		}
		// Append new rows at the end
		const formatted = sheetUtils ? sheetUtils.formatRowsForWrite(newRows, HEADERS.length, FORCE_TEXT_COLS) : formatRowsForWrite(newRows, HEADERS.length, FORCE_TEXT_COLS);
		const lastRow = dst.getLastRow();
		if (sheetUtils) sheetUtils.ensureCapacityRows(dst, lastRow + formatted.length); else ensureCapacityRows(dst, lastRow + formatted.length);
		if (formatted.length > 0) dst.getRange(lastRow + 1, 1, formatted.length, HEADERS.length).setValues(formatted);
		Logger.log('Инкрементальная запись: удалено строк=' + toDeleteCount + ', добавлено строк=' + toAddCount + ', итоговый размер тела: ' + (dst.getLastRow() - 1));
	} else {
		// Full rewrite for speed on large changes
		const finalRows = kept.concat(newRows);
		writeResultSafely(dst, finalRows, HEADERS.length, FORCE_TEXT_COLS);
		Logger.log('Полная перезапись: добавлено строк=' + newRows.length + ', итоговый размер: ' + finalRows.length);
	}

	writeTimestamps(uniqueSkuCount, periodFrom, periodTo, TZ);

	// ===== Helpers (scoped to function) =====
	function ensureHeaders(sheet, headers) {
		if (sheet.getLastRow() === 0) {
			sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
			return;
		}
		const have = sheet.getRange(1, 1, 1, headers.length).getValues()[0] || [];
		const same = have.length === headers.length && have.every((v, i) => (v || '').toString() === headers[i]);
		if (!same) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
	}

	// fallback local implementations kept for compatibility if tech/sheetUtils is not loaded
	function formatRowsForWrite(rows, colCount, forceTextCols) {
		const set = new Set(forceTextCols || []);
		const rowsNormalized = (rows || []).map(function (r) {
			const base = Array.isArray(r) ? r.slice(0, colCount) : [];
			while (base.length < colCount) base.push('');
			return base;
		});
		return rowsNormalized.map(function (r) {
			const out = new Array(r.length);
			for (let i = 0; i < r.length; i++) {
				const v = r[i];
				if (set.has(i)) {
					if (v === null || v === undefined || v === '') out[i] = '';
					else {
						const s = v.toString();
						out[i] = s.charAt(0) === "'" ? s : ("'" + s);
					}
				} else {
					out[i] = v;
				}
			}
			return out;
		});
	}

	function buildContiguousRanges(rowsAsc) {
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
				ranges.push({ start: start, count: count });
				start = cur;
				count = 1;
			}
			prev = cur;
		}
		ranges.push({ start: start, count: count });
		return ranges;
	}

	function buildVariableIndexMap(sheet, varsRow) {
		const lastCol = sheet.getLastColumn();
		if (lastCol <= 0) return {};
		const row = sheet.getRange(varsRow, 1, 1, lastCol).getValues()[0] || [];
		const map = {};
		for (let i = 0; i < row.length; i++) {
			const raw = row[i];
			if (raw === null || raw === undefined || raw === '') continue;
			const key = raw.toString().trim();
			if (!key) continue;
			if (!(key in map)) map[key] = i + 1; // 1-based column index
		}
		return map;
	}

	function readExistingResult(dstSheet, colCount) {
		const lastRow = dstSheet.getLastRow();
		if (lastRow <= 1) return [];
		return dstSheet.getRange(2, 1, lastRow - 1, colCount).getValues();
	}

	function readSourceRows(srcSheet, startRow, pickCols, colB, colU, dimsCount) {
		const lastRow = srcSheet.getLastRow();
		if (lastRow < startRow) return [];
		const lastCol = Math.max.apply(null, pickCols.concat([colB, colU]));
		const values = srcSheet.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getValues();
		const seenDims = new Set();
		const rows = [];
		let skippedEmptyB = 0, skippedZeroU = 0, duplicates = 0, total = values.length;
		for (let r = 0; r < values.length; r++) {
			const row = values[r];
			const b = (row[colB - 1] || '').toString().trim();
			if (!b) { skippedEmptyB++; continue; }
			const u = toNumber(row[colU - 1]);
			if (!isFinite(u) || u === 0) { skippedZeroU++; continue; }
			const picked = [];
			for (let i = 0; i < pickCols.length; i++) picked.push(row[pickCols[i] - 1]);
			const dims = picked.slice(0, dimsCount).map(v => (v === null || v === undefined) ? '' : v);
			const dimsKey = dims.join('\u241F');
			if (seenDims.has(dimsKey)) { duplicates++; continue; }
			const metrics = picked.slice(dimsCount).map(v => toNumber(v));
			seenDims.add(dimsKey);
			rows.push({ dims, metrics });
		}
		Logger.log('readSourceRows: total=' + total + ', kept=' + rows.length + ', skippedEmptyB=' + skippedEmptyB + ', skippedZeroU=' + skippedZeroU + ', duplicates=' + duplicates);
		return rows;
	}

	function divideMetrics(metrics, denom) {
		if (!denom) return metrics.map(v => toNumber(v));
		return metrics.map(v => toNumber(v) / denom);
	}

	// round0 was unused; removed

	function toNumber(v) {
		if (v === null || v === undefined || v === '') return 0;
		if (typeof v === 'number') return isFinite(v) ? v : 0;
		const s = String(v).replace(/\s|\u00A0|\u202F/g, '').replace(',', '.');
		const num = parseFloat(s);
		return isFinite(num) ? num : 0;
	}

	function roundNumber(n, decimals) {
		const num = Number(n) || 0;
		const d = Math.max(0, decimals || 0);
		const factor = Math.pow(10, d);
		return Math.round(num * factor) / factor;
	}

	function roundMetricsByIndex(values, decimalsMap) {
		const out = new Array(values.length);
		for (let i = 0; i < values.length; i++) {
			const dec = (decimalsMap && typeof decimalsMap[i] === 'number') ? decimalsMap[i] : 0;
			out[i] = roundNumber(values[i], dec);
		}
		return out;
	}

	function validateDescriptorConsistency(headStart, dimsCount, metricsCount, headersLen) {
		const expectedLen = headStart.length + dimsCount + metricsCount;
		if (headersLen !== expectedLen) throw new Error('Descriptor mismatch: headers length ' + headersLen + ' != expected ' + expectedLen);
		if (METRIC_DECIMALS.length !== metricsCount) throw new Error('Descriptor mismatch: METRIC_DECIMALS length ' + METRIC_DECIMALS.length + ' != metrics ' + metricsCount);
	}

	function enumerateDaysInclusive(d1, d2) {
		const out = [];
		const cur = new Date(d1.getTime());
		cur.setHours(0, 0, 0, 0);
		const end = new Date(d2.getTime());
		end.setHours(0, 0, 0, 0);
		while (cur.getTime() <= end.getTime()) {
			out.push(new Date(cur.getTime()));
			cur.setDate(cur.getDate() + 1);
		}
		return out;
	}

	function getDateOnly(v) {
		if (!v) return null;
		const d = (v instanceof Date) ? new Date(v.getTime()) : new Date(v);
		if (isNaN(d.getTime())) return null;
		d.setHours(0, 0, 0, 0);
		return d;
	}

	function dateKey(d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
	function monthKeyFromDate(d, tz) { return Utilities.formatDate(d, tz, 'yyyyMM'); }
	function monthsFromDays(days, tz) {
		const set = new Set();
		for (let i = 0; i < days.length; i++) set.add(monthKeyFromDate(days[i], tz));
		return Array.from(set);
	}

	function buildNewMonthPredicateFromToday(tz, backMonths) {
		// Anchor to today's month in tz; include future months and previous backMonths months
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const currentYYYYMM = Utilities.formatDate(today, tz, 'yyyyMM');
		const currentYear = Number(currentYYYYMM.slice(0, 4));
		const currentMonth = Number(currentYYYYMM.slice(4)); // 01..12
		const prevSet = new Set();
		const n = Math.max(0, Number(backMonths) || 0);
		for (let i = 0; i <= n; i++) {
			const date = new Date(currentYear, (currentMonth - 1) - i, 1);
			prevSet.add(Utilities.formatDate(date, tz, 'yyyyMM'));
		}
		return function (d) {
			const mk = monthKeyFromDate(d, tz);
			if (mk >= currentYYYYMM) return true; // current and future months
			return prevSet.has(mk); // previous N months
		};
	}

	function validateOldMonthsCoverage(daysAll, isNewMonth, tz) {
		const byMonth = {};
		for (let i = 0; i < daysAll.length; i++) {
			const d = daysAll[i];
			if (isNewMonth(d)) continue;
			const mk = monthKeyFromDate(d, tz);
			(byMonth[mk] = byMonth[mk] || []).push(d);
		}
		for (const mk in byMonth) if (Object.prototype.hasOwnProperty.call(byMonth, mk)) {
			const days = byMonth[mk];
			if (!days || days.length === 0) continue;
			const sample = days[0];
			const year = sample.getFullYear();
			const month = sample.getMonth();
			const monthDaysCount = new Date(year, month + 1, 0).getDate();
			if (days.length !== monthDaysCount) throw new Error('Период пересекает старый месяц ' + mk + ' не полностью. Укажите полный месяц для перезаписи.');
		}
	}

	function makeIds(d, tz) {
		const monthId = Utilities.formatDate(d, tz, 'yyyyMM');
		const weekId = calcWeekIdCustom(d, tz);
		return { monthId, weekId };
	}

	// Monday-Sunday; week 1 is any week containing at least 1 day of the new year.
	function calcWeekIdCustom(d, tz) {
		const dd = getDateOnly(d);
		const dow = (dd.getDay() + 6) % 7; // 0..6, 0=Mon
		const weekStart = new Date(dd.getTime());
		weekStart.setDate(dd.getDate() - dow);
		const weekEnd = new Date(weekStart.getTime());
		weekEnd.setDate(weekStart.getDate() + 6);

		const y = dd.getFullYear();
		const jan1_y = new Date(y, 0, 1);
		const jan1_next = new Date(y + 1, 0, 1);

		let weekYear;
		if (weekStart.getTime() <= jan1_next.getTime() && jan1_next.getTime() <= weekEnd.getTime()) weekYear = y + 1;
		else if (weekStart.getTime() <= jan1_y.getTime() && jan1_y.getTime() <= weekEnd.getTime()) weekYear = y;
		else weekYear = y;

		const jan1_wy = new Date(weekYear, 0, 1);
		const wy_dow = (jan1_wy.getDay() + 6) % 7;
		const wy_weekStart = new Date(jan1_wy.getTime());
		wy_weekStart.setDate(jan1_wy.getDate() - wy_dow);

		let weeks = Math.floor((weekStart - wy_weekStart) / (7 * 24 * 3600 * 1000)) + 1;
		if (weeks < 1) weeks = 1;
		const ww = ('0' + weeks).slice(-2);
		return '' + weekYear + ww;
	}

	function uniqueCount(arr) {
		const s = new Set();
		for (let i = 0; i < arr.length; i++) if (arr[i]) s.add(arr[i]);
		return s.size;
	}

	function writeResultSafely(sheet, rows, colCount, forceTextCols) {
		const formatted = formatRowsForWrite(rows, colCount, forceTextCols);
		ensureCapacityRows(sheet, 1 + Math.max(formatted.length, 1));
		if (formatted.length > 0) sheet.getRange(2, 1, formatted.length, colCount).setValues(formatted);
		const lastRow = sheet.getLastRow();
		const oldBody = Math.max(0, lastRow - 1);
		if (oldBody > formatted.length) sheet.getRange(2 + formatted.length, 1, oldBody - formatted.length, colCount).clearContent();
	}

	function ensureCapacityRows(sheet, needRows) {
		const maxRows = sheet.getMaxRows();
		if (maxRows < needRows) sheet.insertRowsAfter(maxRows, needRows - maxRows);
	}

	function writeTimestamps(skuCount, fromDate, toDate, tz) {
		try {
			if (typeof updateRunTimestampWithNote === 'function') {
				const user = (Session.getActiveUser && Session.getActiveUser().getEmail()) || 'user';
				updateRunTimestampWithNote('UpdateFixPlan', fromDate, toDate, skuCount, tz, user);
			} else {
				Logger.log('updateRunTimestampWithNote not available; skipping timestamp write.');
			}
		} catch (e) {
			Logger.log('Failed to write timestamp: ' + e);
		}
	}
}


