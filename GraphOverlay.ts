import { canvasEvent } from 'Canvas'
import cytoscape, { EdgeSingular, NodeSingular } from 'cytoscape'
// @ts-ignore
import cola from 'cytoscape-cola'

import { Vector } from 'Geometry'


export type GraphData = {
    nodes: NodeData[]
    edges: EdgeData[]
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

cytoscape.use(cola)

export class GraphOverlay {
    static instance: GraphOverlay | null

    private cy: cytoscape.Core
    private layout: cytoscape.Layouts | null

    constructor(container: HTMLElement) {
        this.cy = cytoscape({
            container,
            style: getCytoscapeStyles(),
        })
        this.layout = null
        this.trackCanvasElements()
    }

    trackCanvasElements() {
        canvasEvent.on('CANVAS_NODE_ADDED', (data) => {
            const node = this.cy.add({
                data: {
                    id: data.id,
                },
            })
            node.style('width', data.width).style('height', data.height)
            node.position({ x: data.x, y: data.y })
            this.cy.fit(undefined, 50)
        })
        canvasEvent.on('CANVAS_NODE_MOVED', (data) => {
            // Don't follow the canvas during layout, to avoid feedback loop
            if (this.layout) {
                return
            }
            const node = this.cy.getElementById(data.id)[0]
            if (!node) {
                return
            }
            node.position({ x: data.x, y: data.y })
            this.cy.fit(undefined, 50)
        })
        canvasEvent.on('CANVAS_NODE_REMOVED', (data) => {
            const node = this.cy.getElementById(data.id)[0]
            if (node) {
                node.remove()
            }
            this.cy.fit(undefined, 50)
        })

        canvasEvent.on('CANVAS_EDGE_REMOVED', (data) => {
            const edge = this.cy.getElementById(data.id)[0]
            if (edge) {
                edge.remove()
            }
        })
        canvasEvent.on('CANVAS_EDGE_CONNECTED', (data) => {
            this.cy.add({
                data: {
                    id: data.id,
                    source: data.from.node.id,
                    target: data.to.node.id,
                },
            })
        })
        canvasEvent.on('CANVAS_EDGE_DISCONNECTED', (data) => {
            const edge = this.cy.getElementById(data.id)[0]
            if (edge) {
                edge.remove()
            }
        })
    }

    async setData(data: GraphData) {
        this.cy.batch(() => {
            data.nodes.forEach(({id, position, width, height}) => {
                let node = this.cy.getElementById(id)[0]
                if (!node) {
                    node = this.cy.add({
                        data: {
                            id,
                        },
                    })
                }
                node.style('width', width).style('height', height)
                // Don't override position during layout
                if (!this.layout) {
                    node.position(position)
                }
            })
            data.edges.forEach(({source, target}) => {
                let edge = this.getEdge(source, target)
                if (!edge) {
                    edge = this.cy.add({
                        data: {
                            source,
                            target,
                        },
                    })
                }
            })
        })
        this.cy.fit(undefined, 50)
    }

    async runLayout(onLayoutChange: (node: NodeSingular) => void): Promise<any> {
        this.layout?.stop()
        this.layout = this.cy
            .layout({
                name: 'cola',
                // @ts-ignore
                fit: false,
                // @ts-ignore
                animate: true,
                // @ts-ignore don't actually shorten the simulation, otherwise it gets stuck prematurely
                maxSimulationTime: 4000,
                // @ts-ignore instead we skip frames
                refresh: 1,
                // @ts-ignore how tight the layout needs to be
                convergenceThreshold: 0.01,
                // @ts-ignore
                nodeSpacing: 100,
                // @ts-ignore
                centerGraph: false,
            })
            .run()

        this.cy.on('position', (event) => {
            onLayoutChange(event.target)
        })

        await this.waitForLayout()

        this.cy.off('position')

        return
    }

    private async waitForLayout() {
        if (this.layout) {
            await this.layout.promiseOn('layoutstop')
            this.layout = null
        }
    }

    private getEdge(source: string, target: string): EdgeSingular | undefined {
        return this.cy.$(`edge[source = "${source}"][target = "${target}"]`)[0]
    }

    cleanup() {
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
