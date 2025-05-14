import cytoscape, { EdgeSingular } from 'cytoscape'
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
console.log(cola)

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
                    console.log('adding node', node)
                }
                node.position(position).style('width', width).style('height', height)
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
                    console.log('adding edge', edge)
                }
            })
        })
        this.cy.fit(undefined, 50)
    }

    runLayout(): Promise<any> {
        console.log('running layout')
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
            })
            .run()

        return this.waitForLayout()
    }

    private async waitForLayout() {
        if (this.layout) {
            console.log('layout started')
            await this.layout.promiseOn('layoutstop')
            console.log('layout stopped')
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
