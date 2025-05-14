import { minBy } from "collectionUtils";

export type Vector = { x: number; y: number; };

export function getDistance(v1: Vector, v2: Vector): number {
	return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
}

// degrees from startingAt -> startingAt + 360
export function getAngle(v1: Vector, v2: Vector, startingAt = 0): number {
	// Normally, it'd be v2.y - v1.y, but the y axis is flipped
	const radians = Math.atan2(v1.y - v2.y, v2.x - v1.x);
	const degrees = (radians * 360) / (2 * Math.PI);
	return ((degrees + 360 - startingAt) % 360) + startingAt;
}

export function getBoxCenter(box: Box): Vector {
	return {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2,
	}
}	

export type Box = {
	x: number
	y: number
	width: number
	height: number
}

export function closestInCone<T extends Box>(
	origin: Vector,
	items: T[],
	coneCenter: number, 
	coneWidth: number, 
	doublingAngle = 70,
): T | undefined {
	const lowerAngle = coneCenter - coneWidth / 2
	const higherAngle = coneCenter + coneWidth / 2
	const polarDistances = items.map((item) => ({
		item,
		angle: getAngle(origin, getBoxCenter(item), lowerAngle),
		distance: getDistance(origin, getBoxCenter(item)),
	}))

	// Treat nodes offset by the doublingAngle as twice as far away
	const adjustedDistance = (distance: number, offsetFromConeCenter: number) =>
		(distance * (doublingAngle + Math.abs(offsetFromConeCenter))) / doublingAngle

	const polarDistancesInCone = polarDistances.filter(({angle}) => lowerAngle < angle && angle < higherAngle)

	const shortestDistance = minBy(
		polarDistancesInCone, 
		({distance, angle}) => adjustedDistance(distance, angle - coneCenter)
	)

	return shortestDistance?.item
}

