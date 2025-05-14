export function minBy<T>(items: T[], sortKey: (item: T) => number): T {
	return items.reduce((min, item) => sortKey(item) < sortKey(min) ? item : min, items[0]);
}
