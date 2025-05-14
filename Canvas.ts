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

export interface Node {
	id: NodeId;
	height: number;
	width: number;
	x: number;
	y: number;
	nodeEl: HTMLElement;
	containerEl: HTMLElement;

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
		console.log(node)
	})
}

export function getUnselectedNodes(canvas: Canvas): Node[] {
	return Array.from(canvas.nodes.values()).filter((node) => {
		return !canvas.selection.has(node);
	});
}

export function writeNodeIdsToDom(canvas: Canvas) {
	canvas.nodes.forEach((node) => {
		node.containerEl.dataset.nodeId = node.id;
	});
}

