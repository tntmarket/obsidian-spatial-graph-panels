import cytoscape from 'cytoscape'
import {EdgeSingular, NodeSingular} from 'cytoscape'
// @ts-ignore
import cola from 'cytoscape-cola'
import { GraphDomSynchronizer } from 'GraphDomSynchronizer'
import { GraphViewport } from 'GraphViewport'
import { Vector } from 'Geometry'


export type GraphData = {
    nodes: NodeData[]
    edges: EdgeData[]
    zoom: number
    pan: Vector
}
type NodeData = {
    id: string
    position: Vector
    width: number
    height: number
}
type EdgeData = {
    source: string
    target: string
}

const getCytoscapeStyles = () => {
    const color = '#000000'
    const selectionColor = '#000000'
    return [
        {
            selector: 'node',
            css: {
                shape: 'roundrectangle',
                'background-color': color,
            },
        },
        {
            selector: 'edge',
            css: {
                'line-color': color,
                'target-arrow-color': color,
                'source-arrow-color': color,
                'curve-style': 'bezier',
                'target-arrow-shape': 'triangle',
            },
        },
        {
            selector: ':selected',
            css: {
                'background-color': selectionColor,
                'line-color': selectionColor,
                'target-arrow-color': selectionColor,
                'source-arrow-color': selectionColor,
            },
        },
    ]
}

type NodeId = string

cytoscape.use(cola)

export class GraphOverlay {
    static instance: GraphOverlay | null

    private cy: cytoscape.Core
    private layout: cytoscape.Layouts | null
    private synchronizer: GraphDomSynchronizer
    viewport: GraphViewport

    constructor(container: HTMLElement) {
        this.cy = cytoscape({
            container,
            style: getCytoscapeStyles(),
        })
        this.layout = null
        this.synchronizer = new GraphDomSynchronizer(this.cy)
        this.viewport = new GraphViewport(this.cy)
    }

    addNode(to: NodeId, from: NodeId | null = null) {
        let node = this.cy.getElementById(to)
        if (node.length === 0) {
            node = this.cy.add({
                data: {
                    id: to,
                },
            })

            if (from) {
                const fromNode = this.cy.getElementById(from)
                node.position({
                    // Grow the graph towards the right
                    x: fromNode.position().x + fromNode.width() + 100,
                    // Place the node in the top right, so they stack vertically
                    y: fromNode.position().y - fromNode.height() / 2,
                })
            } else {
                node.position(this.cy.pan())
            }
        }

        if (
            // Don't add an edge if you're air-dropping into an orphan page (e.g. search)
            from &&
            // Don't attach edges back to self
            from !== to &&
            // Don't attach redundant edges
            !this.getEdge(from, to)
        ) {
            this.cy.edges().unselect()
            this.cy
                .add({
                    data: {
                        source: from,
                        target: to,
                    },
                })
                .select()
        }
    }

    replaceNodeNames(before: string, after: string) {
        if (before === after) {
            return
        }
        // Replace the main node itself
        this.renameNode(this.cy.getElementById(before), after)
        // Replace usages in complex pages
        this.cy.nodes().forEach(node => {
            if (node.id().includes(`[[${before}]]`)) {
                this.renameNode(node, node.id().replace(`[[${before}]]`, `[[${after}]]`))
            }
        })
    }

    private renameNode(node: NodeSingular, name: string) {
        // node ids are immutable. We have to create a new one
        const newNode = this.cy.add({
            data: {
                id: name,
            },
        })
        newNode.position(node.position())
        newNode.style('width', node.style('width'))
        newNode.style('height', node.style('height'))
        node.connectedEdges(`[source = "${node.id()}"]`).forEach(edge => {
            this.cy.add({
                data: {
                    source: name,
                    target: edge.target().id(),
                },
            })
        })
        node.connectedEdges(`[target = "${node.id()}"]`).forEach(edge => {
            this.cy.add({
                data: {
                    source: edge.source().id(),
                    target: name,
                },
            })
        })
        node.remove()
    }

    removeNode(nodeId: NodeId) {
        this.cy.getElementById(nodeId).remove()
    }

    runLayout(
        getInitialNodePositions: (nodeId: NodeId) => {x: number, y: number, width: number, height: number},
        firstRender: boolean = false, 
    ): Promise<any> {
        this.cy.batch(() => {
            this.cy.nodes().forEach(node => {
                const panelBox = getInitialNodePositions(node.id())
                if (panelBox) {
                    setStyleIfDifferentEnough(node, 'width', panelBox.width)
                    setStyleIfDifferentEnough(node, 'height', panelBox.height)
                }
            })
        });

        const layoutDuration = 100;
        this.layout?.stop()
        this.layout = this.cy
            .layout({
                name: 'cola',
                // @ts-ignore
                fit: false,
                // @ts-ignore randomize when laying out for the first time, to avoid seizures from all the nodes being jammed on the same space
                randomize: firstRender,
                // @ts-ignore
                animate: layoutDuration > 0,
                // @ts-ignore don't actually shorten the simulation, otherwise it gets stuck prematurely
                maxSimulationTime: 1000,
                // @ts-ignore instead we skip frames
                refresh: 1000 / (layoutDuration || 1),
                // @ts-ignore how tight the layout needs to be
                convergenceThreshold: 0.01,
                // @ts-ignore
                nodeSpacing: 10,
            })
            .run()

        return this.waitForLayout()
    }

    private async waitForLayout() {
        if (this.layout) {
            await this.layout.promiseOn('layoutstop')
            this.layout = null
        }
    }

    private getEdge(source: string, target: string): EdgeSingular {
        return this.cy.$(`edge[source = "${source}"][target = "${target}"]`)[0]
    }

    cleanup() {
        this.synchronizer.resetStyles()
        // Clean up lingering handlers
        this.cy.destroy()
    }

    static get(container: HTMLElement): GraphOverlay {
        if (!GraphOverlay.instance) {
            GraphOverlay.instance = new GraphOverlay(container)
        }
        return GraphOverlay.instance
    }

    static cleanup() {
        if (GraphOverlay.instance) {
            GraphOverlay.instance.cleanup()
            GraphOverlay.instance = null
        }
    }
}


/**
 * Ignore 1px changes, so the panels don't flicker when you enter/exit blocks
 */
const setStyleIfDifferentEnough = (node: NodeSingular, propertyName: string, value: number) => {
    const style = node.style(propertyName)
    if (!style || Math.abs(parseInt(style, 10) - value) > 5) {
        node.style(propertyName, value)
    }
}


