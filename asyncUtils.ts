
export function waitForPropertyToExist(obj: any, property: string): Promise<void> {
	return new Promise((resolve) => {
		const interval = setInterval(() => {
			if (obj[property]) {
				clearInterval(interval);
				resolve();
			}
		}, 50);
	});
}
