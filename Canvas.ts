import { Editor, Position } from 'codemirror';
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

abstract class Node {
	id: NodeId;
	height: number;
	width: number;
	x: number;
	y: number;
	containerEl: HTMLElement;

	child: {
		editMode?: {
			cm: {
				cm: Editor;
			};
		};
	};

	// Mutable state	
	lastCursor?: Position;
}

abstract class FileNode extends Node {
	file: TFile;
}

export abstract class Canvas {
	edges: Map<EdgeId, Edge>;
	nodes: Map<NodeId, Node>;
	selection: Set<Node | Edge>;

	wrapperEl: HTMLElement;
	x: number;
	y: number;
	scale: number;
}

export function getSingleSelectedNode(canvas: Canvas): FileNode | null {
	if (canvas.selection.size !== 1) {
		return null;
	}
	const element = Array.from(canvas.selection)[0];
	// @ts-ignore
	if (element.file) {
		return element as FileNode;
	}
	return null;
}export function writeNodeIdsToDom(canvas: Canvas) {
	canvas.nodes.forEach((node) => {
		node.containerEl.dataset.nodeId = node.id;
	});
}

