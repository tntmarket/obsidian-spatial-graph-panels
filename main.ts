import { GraphOverlay } from 'GraphOverlay';
import { App, Editor, FileView, MarkdownView, Plugin, TFile, Workspace, WorkspaceLeaf } from 'obsidian';
import { Box, Vector, closestInCone, getAngle, getDistance } from 'Geometry';
import { Canvas, getSingleSelectedNode, writeNodeIdsToDom, Node, getUnselectedNodes, moveSelectedNodes, spawnFileAsLeafOrPanToExisting, selectAndPanIntoView } from 'Canvas';
import { onNewChild, onAttributeChange } from 'observeDom';
import { log } from 'util';

export default class SpatialGraphPanels extends Plugin {
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
		repeatable: boolean = false,
	) {
		this.addCommand({
			id: `${id}-left`,
			name: `${name} left`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'left')
			},
			repeatable,
		});
		this.addCommand({
			id: `${id}-down`,
			name: `${name} down`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'down')
			},
			repeatable,
		});
		this.addCommand({
			id: `${id}-up`,
			name: `${name} up`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'up')
			},
			repeatable,
		});
		this.addCommand({
			id: `${id}-right`,
			name: `${name} right`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'right')
			},
			repeatable,
		});
	}

	maybeGetCanvas(): Canvas | null {
		const view = this.app.workspace.getActiveViewOfType(FileView)
		if (!view) {
			return null
		}
		// @ts-ignore
		return view.canvas
	}

	getActiveCanvas(): Canvas {
		const canvas = this.maybeGetCanvas()
		if (!canvas) {
			throw new Error('No canvas found')
		}
		return canvas
	}

	async onload() {
		this.registerEvent(
			// On opening the canvas
			this.app.workspace.on('active-leaf-change', () => {
				const canvas = this.maybeGetCanvas()
				if (!canvas) {
					return
				}
				this.saveCursorPositionForEachCanvasNode(canvas)
			})
		)

		// Add context menu item for links
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file: TFile, source) => {
				if (source !== 'link-context-menu') return;

				menu.addItem((item) => {
					item
						.setTitle('Add as new card in canvas')
						.setIcon('layout-cards')
						.onClick(async () => {
							spawnFileAsLeafOrPanToExisting(this.getActiveCanvas(), file)
						});
				});
			})
		);

		this.addCommand({
			id: 'open-link-in-canvas',
			name: 'Open link in canvas',
			editorCallback: (editor: Editor) => {
				const link = getLinkAtCursor(editor)
				if (!link) return
				const file = this.app.metadataCache.getFirstLinkpathDest(link, '')
				if (!file) return
				spawnFileAsLeafOrPanToExisting(this.getActiveCanvas(), file)
			}
		})

		this.addCommand({
			id: 'edit-node',
			name: 'Edit Currently Selected Node',
			callback: () => {
				const canvas = this.getActiveCanvas()
				const selectedNode = getSingleSelectedNode(canvas)
				if (!selectedNode) {
					return
				}

				let editor = selectedNode.child.editMode?.cm.cm
				if (!editor) {
					const editButton = canvas.wrapperEl.querySelector('.canvas-menu [aria-label="Edit"]') as HTMLButtonElement
					if (editButton) {
						editButton.click()
					}
					editor = selectedNode.child.editMode?.cm.cm
					if (!editor) {
						throw new Error('No editor found even after clicking edit button')
					}
					if (selectedNode.lastCursor) {
						editor.setCursor(selectedNode.lastCursor)
					}
				}
			}
		})

		this.addCommandForEachDirection(
			'pan-viewport',
			'Pan the canvas',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const canvas = this.getActiveCanvas()

				switch (direction) {
					case 'left':
						canvas.panBy(-10, 0)
						break;
					case 'down':
						canvas.panBy(0, 10)
						break;
					case 'up':
						canvas.panBy(0, -10)
						break;
					case 'right':
						canvas.panBy(10, 0)
						break;
				}
			},
			true
		)

		this.addCommandForEachDirection(
			'move-node',
			'Move the currently selected nodes',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const canvas = this.getActiveCanvas()

				switch (direction) {
					case 'left':
						moveSelectedNodes(canvas, -10, 0)
						break;
					case 'down':
						moveSelectedNodes(canvas, 0, 10)
						break;
					case 'up':
						moveSelectedNodes(canvas, 0, -10)
						break;
					case 'right':
						moveSelectedNodes(canvas, 10, 0)
						break;
				}
			},
			true
		)


		this.addCommandForEachDirection(
			'focus-panel',
			'Focus whatever panel is',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				const canvas = this.getActiveCanvas()

				function getOrigin() {
					// We can't use the cursor because it's stuck in an iframe
					const focusedPanel = getSingleSelectedNode(canvas)
					if (focusedPanel) {
						return centerOfNode(focusedPanel)
					}
					return {x: 0, y: 0}
				}
				const origin = getOrigin()

				const otherPanels = getUnselectedNodes(canvas)

				let panelToFocus: Node | undefined;
				switch (direction) {
					case 'left':
						panelToFocus = closestInCone(origin, otherPanels, 180, 140)
						break;
					case 'down':
						panelToFocus = closestInCone(origin, otherPanels, -90, 140)
						break;
					case 'up':
						panelToFocus = closestInCone(origin, otherPanels, 90, 140)
						break;
					case 'right':
						panelToFocus = closestInCone(origin, otherPanels, 0, 140)
						break;
				}
				if (panelToFocus) {
					selectAndPanIntoView(canvas, panelToFocus)
					editSelectedNode(canvas, panelToFocus)
				}
			}	
		)
	}

	saveCursorPositionForEachCanvasNode(canvas: Canvas) {
		const canvasEl = canvas.wrapperEl.querySelector('.canvas') as HTMLElement
		// Ensure all nodes have a data-node-id
		onNewChild(canvasEl, '.canvas-node', (nodeElement) => {
			writeNodeIdsToDom(canvas)
			const previewEl = nodeElement.querySelector('.canvas-node-content')?.firstChild as HTMLElement
			// Listen to when edit mode is activated
			onAttributeChange(previewEl, 'style', (style) => {
				// By reacting when the preview is hidden
				if (style.includes('display: none')) {
					// Look up the node that corresponds to the just opened editor
					const nodeEl = nodeElement.querySelector('[data-node-id]') as HTMLElement;
					const nodeId = nodeEl?.dataset.nodeId;
					if (!nodeId) {
						throw new Error('No node id found')
					}
					const node = canvas.nodes.get(nodeId)
					if (!node) {
						throw new Error('No node found')
					}
					const editor = node.child.editMode?.cm.cm
					if (!editor) {
						throw new Error('No editor found after entering edit mode')
					}
					// Remember the cursor position upon exiting edit mode
					editor.on('cursorActivity', () => {
						node.lastCursor = editor.getCursor()
					})
					// We can't just snapshot the cursor upon exiting edit mode,
					// because the editor is in an iframe that gets deleted when exiting edit mode
					// and there doesn't seem to be a way to capture the cursor position before it gets deleted
				}
			})
		})

	}

	onunload() {
	}
}

function centerOfNode(node: Node): Vector {
	return {
		x: node.x + node.width / 2,
		y: node.y + node.height / 2,
	}
}

function logAndReturn<T>(value: T): T {
	console.log(value)
	return value
}	

async function editSelectedNode(canvas: Canvas, selectedNode: Node) {
	let menu = canvas.wrapperEl.querySelector('.canvas-menu-container') as HTMLElement
	if (menu) {
		// If the menu is already open, wait for it to switch over to the newly selected node
		// before editing. Otherwise we'll immediately enter edit mode on the old node.
		await new Promise<void>(resolve => {
			const unsub = onAttributeChange(menu, 'style', () => {
				unsub()
				resolve()
			})
		})
	} else {
		// If the menu is hidden, wait for it to be shown
		await new Promise<void>(resolve => {
			const unsub = onNewChild(canvas.wrapperEl, '.canvas-menu-container', () => {
				unsub()
				resolve()
			})
		})
		menu = canvas.wrapperEl.querySelector('.canvas-menu-container') as HTMLElement
	}

	let editor = selectedNode.child.editMode?.cm.cm;
	if (!editor) {
		const editButton = menu.querySelector('[aria-label="Edit"]') as HTMLButtonElement;
		editButton.click();
		editor = selectedNode.child.editMode?.cm.cm;
	}
	if (!editor) {
		throw new Error("No editor found even after clicking edit button");
	}
	if (selectedNode.lastCursor) {
		editor.setCursor(selectedNode.lastCursor);
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