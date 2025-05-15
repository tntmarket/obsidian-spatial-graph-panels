import { Editor, Position } from 'codemirror';
import { Box } from 'Geometry';
import { EventRef, Events, TFile } from 'obsidian';
import { around } from 'monkey-around';
import { waitForPropertyToExist } from 'asyncUtils';

type NodeId = string;
type EdgeId = string;

export interface Edge {
	id: EdgeId;
	from: {
		node: Node;
	};
	to: {
		node: Node;
	};
}

type CanvasData = {
	edges: {
		id: string;
		fromNode: string;
		fromSide: 'left' | 'right' | 'top' | 'bottom';
		toNode: string;
		toSide: 'left' | 'right' | 'top' | 'bottom';
	}[];
};

export interface Node {
	id: NodeId;
	height: number;
	width: number;
	x: number;
	y: number;
	nodeEl: HTMLElement;
	containerEl: HTMLElement;
	file?: TFile;

	child: {
		editMode?: {
			cm: {
				cm: Editor;
			};
		};
	};

	getBBox(): Box;
	moveTo(position: { x: number; y: number }): void;

	// Mutable state	
	lastCursor?: Position;
}

abstract class FileNode extends Node {
	file: TFile;
}

export interface Canvas {
	edges: Map<EdgeId, Edge>;
	nodes: Map<NodeId, Node>;
	selection: Set<Node | Edge>;
	edgeFrom: Map<Node, Set<Node>>;

	wrapperEl: HTMLElement;
	x: number;
	y: number;
	scale: number;

	panIntoView(box: Box): void;
	panBy(x: number, y: number): void;
	createFileNode(options: { file: TFile; pos: { x: number; y: number } }): Node;
	addEdge(options: { from: { node: Node }; to: { node: Node } }): Edge;
	getData(): CanvasData;
	importData(data: CanvasData): void;
	requestSave(): void;
}

export function getSingleSelectedNode(canvas: Canvas): Node | null {
	const nodes = getSelectedNodes(canvas);
	if (nodes.length === 1) {
		return nodes[0];
	}
	return null;
}

export function getSelectedNodes(canvas: Canvas): Node[] {
	const selectedNodes = Array.from(canvas.selection).filter((element) => {
		// @ts-ignore
		return element.nodeEl;
	});
	return selectedNodes as Node[];
}

export function moveSelectedNodes(canvas: Canvas, x: number, y: number) {
	const nodes = getSelectedNodes(canvas);
	nodes.forEach((node) => {
		node.moveTo({
			x: node.x + x,
			y: node.y + y,
		})
		canvas.panIntoView(node.getBBox())
	})
	canvas.requestSave()
}

export function findNodeByFile(canvas: Canvas, filepath: string): Node | undefined {
	return Array.from(canvas.nodes.values()).find((node) => {
		return node.file?.path === filepath;
	});
}

export function getUnselectedNodes(canvas: Canvas): Node[] {
	return getNodes(canvas).filter((node) => {
		return !canvas.selection.has(node);
	});
}

export function getNodes(canvas: Canvas): Node[] {
	return Array.from(canvas.nodes.values());
}

export function getEdges(canvas: Canvas): Edge[] {
	return Array.from(canvas.edges.values());
}

export function spawnFileAsLeafOrPanToExisting(canvas: Canvas, file: TFile) {
	let destinationNode: Node | undefined = findNodeByFile(canvas, file.path)
	const selectedNode = getSingleSelectedNode(canvas)
	if (!selectedNode) {
		throw new Error('No selected node')
	}
	if (!destinationNode) {
		destinationNode = canvas.createFileNode({
			file,
			pos: {
				x: selectedNode.x + selectedNode.width + 100,
				y: selectedNode.y - 100,
			},
		});
	}

	const existingEdges = canvas.edgeFrom.get(selectedNode)
	if (!existingEdges?.has(destinationNode)) {
		// There's no public constructor for Edge, so we workaround by importing a new edge
		const canvasData = canvas.getData()
		canvas.importData({
			...canvasData,
			edges: [
				...canvasData.edges,
				{
					id: `${selectedNode.id}-${destinationNode.id}`,
					fromNode: selectedNode.id,
					fromSide: 'right',
					toNode: destinationNode.id,
					toSide: 'left',
				}
			]
		})
	}
	selectAndPanIntoView(canvas, destinationNode)
	canvas.requestSave()
}


export function selectAndPanIntoView(canvas: Canvas, node: Node) {
	canvas.panIntoView(node.getBBox())
	node.containerEl?.click()
}

interface CanvasEvent extends Events {
	on(name: 'CANVAS_NODE_ADDED', callback: (data: Node) => any, ctx?: any): EventRef;
	on(name: 'CANVAS_NODE_REMOVED', callback: (data: Node) => any, ctx?: any): EventRef;
	on(name: 'CANVAS_NODE_CHANGED', callback: (data: Node) => any, ctx?: any): EventRef;

	on(name: 'CANVAS_EDGE_ADDED', callback: (data: Edge) => any, ctx?: any): EventRef;
	on(name: 'CANVAS_EDGE_REMOVED', callback: (data: Edge) => any, ctx?: any): EventRef;	
	on(name: 'CANVAS_EDGE_CONNECTED', callback: (data: Edge) => any, ctx?: any): EventRef;
	on(name: 'CANVAS_EDGE_DISCONNECTED', callback: (data: Edge) => any, ctx?: any): EventRef;

	on(name: 'CANVAS_NODE_MOVED', callback: (data: Node) => any, ctx?: any): EventRef;
	on(name: 'CANVAS_SELECT', callback: (selection: Set<Node | Edge>) => any, ctx?: any): EventRef;

	on(name: 'CANVAS_VIEWPORT_CHANGED', callback: () => any, ctx?: any): EventRef;
}
export const canvasEvent = new Events() as CanvasEvent
let canvasPatched = false
const unconnectedEdgeIds = new Set<EdgeId>()

export function patchCanvasToDetectChanges(canvas: Canvas): CanvasEvent {
	console.log(canvas.constructor.prototype)
	if(!canvasPatched) {
		const uninstaller = around(canvas.constructor.prototype, {
			addNode: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_NODE_ADDED', ...args)
				return result
			},
			addEdge: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_EDGE_ADDED', ...args)
				unconnectedEdgeIds.add(args[0].id)
				return result
			},
			removeNode: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_NODE_REMOVED', ...args)
				return result
			},
			removeEdge: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_EDGE_REMOVED', ...args)
				unconnectedEdgeIds.delete(args[0].id)
				return result
			},
			updateSelection: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_SELECT', this.selection)
				return result
			},
			markMoved: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				const item = args[0]

				if (item.nodeEl) {
					canvasEvent.trigger('CANVAS_NODE_CHANGED', ...args)
				}

				function isConnectedEdge(edge: Edge) {
					return (
						!edge.to?.node.nodeEl.classList.contains('is-dummy') &&
						!edge.from?.node.nodeEl.classList.contains('is-dummy')
					)
				}
				if(unconnectedEdgeIds.has(item.id) && isConnectedEdge(item)) {
					unconnectedEdgeIds.delete(item.id)
					canvasEvent.trigger('CANVAS_EDGE_CONNECTED', ...args)
				} else if (!unconnectedEdgeIds.has(item.id) && !isConnectedEdge(item)) {
					unconnectedEdgeIds.add(item.id)
					canvasEvent.trigger('CANVAS_EDGE_DISCONNECTED', ...args)
				}
				return result
			},
			markViewportChanged: (original: any) => function(...args: any[]) {
				const result = original.apply(this, args);
				canvasEvent.trigger('CANVAS_VIEWPORT_CHANGED', ...args)
				return result
			},
		});
		canvasPatched = true
		return canvasEvent
	}
	return canvasEvent;
}

