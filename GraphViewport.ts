import cytoscape, {NodeCollection, NodeDefinition, NodeSingular} from 'cytoscape'
import { getAngle, getDistance } from 'Vector'


type NodeId = string

/**
 * Responsible for moving the camera and selecting elements.
 * Doesn't actually mutate nodes and edges.
 */
export class GraphViewport {
    private cy: cytoscape.Core

    constructor(cy: cytoscape.Core) {
        this.cy = cy
        this.cy.maxZoom(1)
        this.cy.minZoom(0.2)
    }

    panTo(to: NodeId, from: NodeId | null, behavior: 'pan' | 'panZoom'): Promise<any> {
        let nodesToFocus = this.cy.getElementById(to)
        if (from) {
            nodesToFocus = nodesToFocus.union(this.cy.getElementById(from))
        }
        this.cy.stop(true, true) // stop the previous animation
        const panOptions =
            behavior === 'pan'
                ? {
                      center: {
                          eles: nodesToFocus,
                      },
                  }
                : {
                      fit: {
                          eles: nodesToFocus,
                          padding: 50,
                      },
                  }
        return new Promise<any>(resolve => {
            this.cy.animate({
                ...panOptions,
                easing: 'ease-out',
                duration: 100,
                complete: () => resolve(null),
            })
        })
    }

    panToSelectionIfNeeded(padding: number = 50) {
        const selectionBox = this.selectedNodes().boundingBox({})
        const viewport = this.cy.extent()

        const overflowRight = Math.max(0, selectionBox.x2 - viewport.x2 + padding)
        const overflowLeft = Math.max(0, viewport.x1 - selectionBox.x1 + padding)
        const overflowTop = Math.max(0, viewport.y1 - selectionBox.y1 + padding)
        const overflowBottom = Math.max(0, selectionBox.y2 - viewport.y2 + padding)

        this.panBy((overflowRight || -overflowLeft) * this.cy.zoom(), (overflowBottom || -overflowTop) * this.cy.zoom())
    }

    zoomBy(scale: number) {
        this.cy.zoom({
            level: this.cy.zoom() * scale,
            renderedPosition: {
                x: this.cy.width() / 2,
                y: this.cy.height() / 2,
            },
        })
    }

    zoomOutCompletely() {
        this.cy.fit(undefined, 50)
    }

    panBy(x: number, y: number) {
        // cy.panBy pans the whole layout, rather than the camera,
        // which is kinda unintuitive
        this.cy.panBy({x: -x, y: -y})
    }

    zoomIntoSelection() {
        this.zoomBy(10)
        this.cy.center(this.selectedNodes())
    }

    selectedNodes(): NodeCollection {
        return this.cy.nodes(':selected')
    }

    selectNode(node: NodeSingular) {
        this.cy.edges().unselect()
        this.cy.nodes().unselect()
        node.select().edges().select()
    }

    selectNodeById(nodeId: NodeId) {
        this.selectNode(this.cy.getElementById(nodeId))
    }

    selectRight() {
        this.selectClosestInCone(0, 140)
    }

    selectUp() {
        this.selectClosestInCone(90, 140)
    }

    selectLeft() {
        this.selectClosestInCone(180, 140)
    }

    selectDown() {
        this.selectClosestInCone(-90, 140)
    }

    private selectClosestInCone(coneCenter: number, coneWidth: number, doublingAngle = 70) {
        const selection = this.selectedNodes().first()
        const lowerAngle = coneCenter - coneWidth / 2
        const higherAngle = coneCenter + coneWidth / 2
        const polarDistances = this.cy
            .nodes()
            .filter(node => node.id() !== selection.id())
            .map((node: NodeSingular) => ({
                node,
                angle: getAngle(selection.position(), node.position(), lowerAngle),
                distance: getDistance(selection.position(), node.position()),
            }))

        // Treat nodes offset by the doublingAngle as twice as far away
        const adjustedDistance = (distance: number, offsetFromConeCenter: number) =>
            (distance * (doublingAngle + Math.abs(offsetFromConeCenter))) / doublingAngle
        const closestInCone = minBy(
            polarDistances.filter(({angle}) => lowerAngle < angle && angle < higherAngle),
            ({distance, angle}) => adjustedDistance(distance, angle - coneCenter)
        )?.node
        if (closestInCone) {
            this.selectNode(closestInCone)
            this.panToSelectionIfNeeded()
        }
    }

    private nodeInMiddleOfViewport(): NodeSingular {
        const viewport = this.cy.extent()
        const viewportMiddle = {
            x: viewport.x1 + viewport.w / 2,
            y: viewport.y1 + viewport.h / 2,
        }
        return minBy(
            this.cy.nodes().map(node => node),
            node => getDistance(viewportMiddle, node.position())
        )
    }

    private selectMiddleOfViewport() {
        const middleNode = this.nodeInMiddleOfViewport()
        this.selectNode(middleNode)
    }

    ensureNodeIsSelected() {
        if (this.selectedNodes().length === 0) {
            this.selectMiddleOfViewport()
        }
    }

    onSelectNode(handleSelect: (nodeId: NodeId) => void) {
        this.cy.on('select', () => {
            const node = this.cy.nodes(':selected').first()
            if (node.length > 0) {
                handleSelect(node.id())
            }
        })
    }

    dragSelectionBy(x: number, y: number) {
        const zoom = this.cy.zoom()
        this.selectedNodes().shift({x: x / zoom, y: y / zoom})
        this.panToSelectionIfNeeded()
    }
}

function minBy<T>(items: T[], sortKey: (item: T) => number): T {
	return items.reduce((min, item) => sortKey(item) < sortKey(min) ? item : min, items[0]);
}