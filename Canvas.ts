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
}

export function getSingleSelectedNode(canvas: Canvas): Node | null {
	if (canvas.selection.size !== 1) {
		return null;
	}
	const element = Array.from(canvas.selection)[0];
	// @ts-ignore
	if (element.nodeEl) {
		return element as Node;
	}
	return null;
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

