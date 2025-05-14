import { Editor, Position } from 'codemirror';
import { Box } from 'Geometry';
import { TFile } from 'obsidian';

type NodeId = string;
type EdgeId = string;

abstract class Edge {
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

export function writeNodeIdsToDom(canvas: Canvas) {
	canvas.nodes.forEach((node) => {
		node.containerEl.dataset.nodeId = node.id;
	});
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

	const edge = canvas.edges.get(`${selectedNode.id}-${destinationNode.id}`)
	if (!edge) {
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

