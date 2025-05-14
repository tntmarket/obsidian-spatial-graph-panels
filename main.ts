import { GraphOverlay } from 'GraphOverlay';
import { App, Editor, FileView, MarkdownView, Plugin, Workspace, WorkspaceLeaf } from 'obsidian';
import { Box, Vector, closestInCone, getAngle, getDistance } from 'Geometry';
import { Canvas, getSingleSelectedNode, writeNodeIdsToDom } from 'Canvas';
import { onNewChild, onAttributeChange } from 'observeDom';

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
	) {
		this.addCommand({
			id: `${id}-left`,
			name: `${name} left`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'left')
			}
		});
		this.addCommand({
			id: `${id}-down`,
			name: `${name} down`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'down')
			}
		});
		this.addCommand({
			id: `${id}-up`,
			name: `${name} up`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'up')
			}
		});
		this.addCommand({
			id: `${id}-right`,
			name: `${name} right`,
			callback: () => {
				manipulateElement(this.app.workspace.containerEl, 'right')
			}
		});
	}

	getActiveCanvas(): Canvas {
		const view = this.app.workspace.getActiveViewOfType(FileView)
		// @ts-ignore
		if (!view?.canvas) {
			throw new Error('No canvas found')
		}
		// @ts-ignore
		return view.canvas
	}


	async onload() {
		this.saveCursorPositionForEachCanvasNode()

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
			'focus-panel',
			'Focus the panel to the',
			(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down') => {
				function getOrigin() {
					const cursor = element.querySelector('.cm-cursor-primary');
					if (cursor) {
						return {
							x: cursor.getBoundingClientRect().left,
							y: cursor.getBoundingClientRect().top,
						}
					}
					const focusedPanel = element.querySelector('.is-focused')
					if (focusedPanel) {
						return {
							x: focusedPanel.getBoundingClientRect().left,
							y: focusedPanel.getBoundingClientRect().top,
						}
					}
					return {x: 0, y: 0}
				}

				const origin = getOrigin()

				const otherPanels = Array.from(element.querySelectorAll('.canvas-node'))
					.filter(panel => !panel.classList.contains('is-focused'))
					.map(panel => panel as HTMLElement)

				function boxForPanel(panel: HTMLElement): Box {
					return {
						x: panel.getBoundingClientRect().left,
						y: panel.getBoundingClientRect().top,
						width: panel.getBoundingClientRect().width,
						height: panel.getBoundingClientRect().height,
					}
				}

				let panelToFocus: HTMLElement | undefined;
				switch (direction) {
					case 'left':
						panelToFocus = closestInCone(origin, otherPanels, boxForPanel, 180, 140)
						break;
					case 'down':
						panelToFocus = closestInCone(origin, otherPanels, boxForPanel, -90, 140)
						break;
					case 'up':
						panelToFocus = closestInCone(origin, otherPanels, boxForPanel, 90, 140)
						break;
					case 'right':
						panelToFocus = closestInCone(origin, otherPanels, boxForPanel, 0, 140)
						break;
				}
				if (panelToFocus) {
					panelToFocus.click()
				}
			}	
		)
	}

	saveCursorPositionForEachCanvasNode() {
		// On opening the canvas
		this.app.workspace.on('active-leaf-change', (leaf) => {
			const canvas = this.getActiveCanvas()
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
						const nodeId = nodeElement.querySelector('[data-node-id]')?.dataset.nodeId
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
		});

	}

	onunload() {
	}
}

function logAndReturn<T>(value: T): T {
	console.log(value)
	return value
}	
