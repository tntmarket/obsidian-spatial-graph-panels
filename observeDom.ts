export function onNewChild(
	element: HTMLElement,
	selector: string,
	callback: (child: HTMLElement) => void) {
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if ((node as HTMLElement).matches(selector)) {
					callback(node as HTMLElement);
				}
			});
		});
	});
	observer.observe(element, { childList: true, subtree: false });
}
export function onAttributeChange(element: HTMLElement, attribute: string, callback: (value: string) => void) {
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.attributeName === attribute) {
				callback((mutation.target as HTMLElement).getAttribute(attribute) ?? '');
			}
		});
	});
	observer.observe(element, { attributes: true, subtree: false });
}
