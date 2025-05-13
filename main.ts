import { GraphOverlay } from 'GraphOverlay';
import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { Vector, getAngle, getDistance } from 'Vector';


interface SpatialGraphPanelsSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: SpatialGraphPanelsSettings = {
	mySetting: 'default'
}

function moveElement(element: HTMLElement, x: number, y: number) {
	element.style.left = `${(parseInt(element.style.left, 10) || 0) + x}px`;
	element.style.top = `${(parseInt(element.style.top, 10) || 0) + y}px`;
}

function minBy<T>(items: T[], sortKey: (item: T) => number): T {
	return items.reduce((min, item) => sortKey(item) < sortKey(min) ? item : min, items[0]);
}


function getPanelCenter(panel: HTMLElement): Vector {
	const rect = panel.getBoundingClientRect();
	return {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	}
}	


function closestPanelInCone(
	origin: Vector,
	otherPanels: WorkspaceLeaf[],
	coneCenter: number, 
	coneWidth: number, 
	doublingAngle = 70,
): WorkspaceLeaf | undefined {
	const lowerAngle = coneCenter - coneWidth / 2
	const higherAngle = coneCenter + coneWidth / 2
	const polarDistances = otherPanels.map((otherPanel) => ({
		panel: otherPanel,
		angle: getAngle(origin, getPanelCenter(otherPanel.view.containerEl), lowerAngle),
		distance: getDistance(origin, getPanelCenter(otherPanel.view.containerEl)),
	}))

	// Treat nodes offset by the doublingAngle as twice as far away
	const adjustedDistance = (distance: number, offsetFromConeCenter: number) =>
		(distance * (doublingAngle + Math.abs(offsetFromConeCenter))) / doublingAngle

	const polarDistancesInCone = polarDistances.filter(({angle}) => lowerAngle < angle && angle < higherAngle)

	return minBy(
		polarDistancesInCone, 
		({distance, angle}) => adjustedDistance(distance, angle - coneCenter)
	)?.panel
}




export default class SpatialGraphPanels extends Plugin {
	settings: SpatialGraphPanelsSettings;

	getGraph(): GraphOverlay {
		let graphOverlay = this.app.workspace.containerEl.querySelector('.spatial-graph-overlay')
		if (!graphOverlay) {
			const overlayContainer = this.app.workspace.containerEl.querySelector('.mod-root')
			if (!overlayContainer) {
				throw new Error('Container for graph overlay not instantiated yet')
			}
			graphOverlay = overlayContainer.createEl('div', {cls: 'spatial-graph-overlay'})
		}
		return GraphOverlay.get(graphOverlay as HTMLElement)
	}

	addCommandForEachDirection(
		id: string,
		name: string,
		manipulateElement: (panelEl: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => void,
	) {
		this.addCommand({
			id: `${id}-left`,
			name: `${name} left`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				manipulateElement(view.containerEl, 'left')
			}
		});
		this.addCommand({
			id: `${id}-down`,
			name: `${name} down`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				manipulateElement(view.containerEl, 'down')
			}
		});
		this.addCommand({
			id: `${id}-up`,
			name: `${name} up`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				manipulateElement(view.containerEl, 'up')
			}
		});
		this.addCommand({
			id: `${id}-right`,
			name: `${name} right`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				manipulateElement(view.containerEl, 'right')
			}
		});
	}

	allPanels(): WorkspaceLeaf[] {
		const panels: WorkspaceLeaf[] = []
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (
				leaf.view.getViewType() === 'markdown' &&
				leaf.view.containerEl.getBoundingClientRect().width > 0
			) {
				panels.push(leaf)
			}
		});
		return panels
	}

	async onload() {
		await this.loadSettings();

		this.addCommandForEachDirection(
			'pan', 
			'Pan the spatial graph camera', 
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const camera = element.closest('.mod-root') as HTMLElement; 
				switch (direction) {
					case 'left':
						camera.scrollBy(-50, 0)
						break;
					case 'down':
						camera.scrollBy(0, 50)
						break;
					case 'up':
						camera.scrollBy(0, -50)
						break;
					case 'right':
						camera.scrollBy(50, 0)
						break;
				}
			}
		)

		this.addCommandForEachDirection(
			'move-panel',
			'Move the currently focused panel',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const panel = element.closest('.workspace-tabs') as HTMLElement;
				switch (direction) {
					case 'left':
						moveElement(panel, -50, 0)
						break;
					case 'down':
						moveElement(panel, 0, 50)
						break;
					case 'up':
						moveElement(panel, 0, -50)
						break;
					case 'right':
						moveElement(panel, 50, 0)
						break;
				}
			}	
		)

		this.addCommandForEachDirection(
			'focus-panel',
			'Focus the panel to the',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const cursor = element.querySelector('.cm-cursor-primary') as HTMLElement;
				const cursorPosition = {
					x: cursor.getBoundingClientRect().left,
					y: cursor.getBoundingClientRect().top,
				}
				const otherPanels = this.allPanels().filter(
					leaf => !leaf.view.containerEl.contains(cursor)
				);

				let panelToFocus: WorkspaceLeaf | undefined;
				switch (direction) {
					case 'left':
						panelToFocus = closestPanelInCone(cursorPosition, otherPanels, 180, 140)
						break;
					case 'down':
						panelToFocus = closestPanelInCone(cursorPosition, otherPanels, -90, 140)
						break;
					case 'up':
						panelToFocus = closestPanelInCone(cursorPosition, otherPanels, 90, 140)
						break;
					case 'right':
						panelToFocus = closestPanelInCone(cursorPosition, otherPanels, 0, 140)
						break;
				}
				if (panelToFocus) {
					this.app.workspace.setActiveLeaf(panelToFocus, {focus: true})
				}
			}	
		)

		this.addCommand({
			id: 'jump-to-panel-for-link',
			name: "Jump to an existing panel for the link under the cursor, or create a new one if it doesn't exist yet",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const link = getLinkAtCursor(editor)
				if (link) {
					const linkPath = `${link}.md`
					const existingPanel = this.allPanels().find(
						leaf => leaf.getViewState().state?.file === linkPath
					)
					if (existingPanel) {
						this.app.workspace.setActiveLeaf(existingPanel, {focus: true})
					} else {
						this.app.workspace.openLinkText(link, linkPath, 'split')
					}

					this.getGraph().addNode(linkPath, view.file?.path)
				}
			}
		})

		this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf) => {
			if (leaf.view.getViewType() === 'markdown') {
				const panelElement = leaf.view.containerEl.closest('.workspace-tabs') as HTMLElement
				console.log(leaf.getViewState().state)
			}
		})


		this.app.workspace.on('file-open', (file: TFile) => {
			const graph = this.getGraph()
			graph.addNode(file.path)

			const panelsByFileName = new Map<string, WorkspaceLeaf>()
			this.allPanels().forEach(leaf => {
				console.log(leaf.getViewState().state)
				panelsByFileName.set(leaf.getViewState().state?.file as string, leaf)
			})

			graph.runLayout((nodeId: string) => {
				const panel = panelsByFileName.get(nodeId)
				if (!panel) {
					throw new Error(`Panel for ${nodeId} not found`)
				}
				console.log(panel.view.containerEl)
				return panel.view.containerEl.getBoundingClientRect()
			})
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		GraphOverlay.cleanup()
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


function logAndReturn<T>(value: T): T {
	console.log(value)
	return value
}	

class SampleSettingTab extends PluginSettingTab {
	plugin: SpatialGraphPanels;

	constructor(app: App, plugin: SpatialGraphPanels) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

function getLinkAtCursor(editor: Editor): string | null {
    const cursor = editor.getCursor();
    
    const line = editor.getLine(cursor.line);
    
    const ch = cursor.ch;
    
    const wikiLinkRegex = /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    
    while ((match = wikiLinkRegex.exec(line)) !== null) {
        const linkStart = match.index;
        const linkEnd = linkStart + match[0].length;
        
        if (ch >= linkStart && ch <= linkEnd) {
            return match[1]
		}
    }
    
    return null;
}
