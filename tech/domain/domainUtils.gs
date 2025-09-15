/**
 * Domain utilities: normalization, parsing, and comparators.
 */
function createDomainUtils() {
	return {
		/**
		 * Normalize warehouse names to stable keys used in sheets.
		 */
		normalizeWarehouseName(name) {
			const n = (name || '').toString().trim();
			switch (n) {
				case 'Всего находится на складах':
					return 'totalAvailable';
				case 'В пути до получателей':
					return 'inWayToClients';
				case 'В пути возвраты на склад WB':
					return 'inWayFromClients';
				default:
					return n;
			}
		},

		/**
		 * Parse number from a value that might be a text with a leading apostrophe.
		 * Returns 0 if not parseable.
		 */
		parseNumericFromText(value) {
			const s = (value === null || value === undefined) ? '' : value.toString();
			const raw = s.charAt(0) === "'" ? s.slice(1) : s;
			const n = Number(raw);
			return isNaN(n) ? 0 : n;
		},

		/**
		 * Comparator for rows shaped like [sellerId, nmId, techSize, warehouse, ...]
		 * Sorts by nmId (numeric), then sellerId, then techSize, then warehouse.
		 */
		sortByNmIdThenSellerThenSizeThenWarehouse(a, b) {
			const parseNum = (v) => {
				const s = (v || '').toString();
				return Number(s.charAt(0) === "'" ? s.slice(1) : s) || 0;
			};
			const an = parseNum(a[1]);
			const bn = parseNum(b[1]);
			if (an !== bn) return an - bn;
			if (a[0] !== b[0]) return (a[0] || '').toString().localeCompare((b[0] || '').toString());
			if (a[2] !== b[2]) return (a[2] || '').toString().localeCompare((b[2] || '').toString());
			return (a[3] || '').toString().localeCompare((b[3] || '').toString());
		}
	};
}


