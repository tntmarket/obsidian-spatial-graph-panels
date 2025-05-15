import { canvasEvent, Node, Edge } from 'Canvas'
import cytoscape, { EdgeSingular, NodeSingular } from 'cytoscape'
// @ts-ignore
import cola from 'cytoscape-cola'

import { getBoxCenter, Vector } from 'Geometry'


export type CytoscapeData = {
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
    id: string
    source: string
    target: string
}

const getCytoscapeStyles = () => {
    const color = '#333333'
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
                'width': 15,
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

export class Minimap {
    static instance: Minimap | null

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
            node.position(getBoxCenter(data))
            this.cy.fit(undefined, 50)
        })
        canvasEvent.on('CANVAS_NODE_CHANGED', (data) => {
            // Don't follow the canvas during layout, to avoid feedback loop
            if (this.layout) {
                return
            }
            const node = this.cy.getElementById(data.id)[0]
            if (!node) {
                return
            }
            node.style('width', data.width).style('height', data.height)
            node.position(getBoxCenter(data))
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

        canvasEvent.on('CANVAS_SELECT', (selection: Set<Node | Edge>) => {
            this.cy.$(':selected').unselect()
            selection.forEach((selected) => {
                this.cy.getElementById(selected.id).select()
            })
        })
    }

    async setData(data: CytoscapeData) {
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
            data.edges.forEach(({id, source, target}) => {
                let edge = this.getEdge(source, target)
                if (!edge) {
                    console.log('adding edge', id, source, target)
                    edge = this.cy.add({
                        data: {
                            id,
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
                animate: true,
                maxSimulationTime: 1000,
                nodeSpacing: 50,
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

    static get(container: HTMLElement): Minimap {
        if (!Minimap.instance) {
            Minimap.instance = new Minimap(container)
        }
        return Minimap.instance
    }

    static cleanup() {
        if (Minimap.instance) {
            Minimap.instance.cleanup()
            Minimap.instance = null
        }
    }
}

