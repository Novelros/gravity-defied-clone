import { clamp, Vector } from '../physics.js';

const CELL_SIZE = 100;
const MAX_POINT_RADIUS = 20;
const NO_SEGMENTS = [];
const CURVE_STEP = 12;
const START_LENGTH = 400;
const START_OFFSET = 120;
const FINISH_LENGTH = 1200;
const PIT_WALL_SHARE = 0.3;
const PLATEAU_SLOPE_SHARE = 0.3;
const GAP_DEPTH = 2000;
const GAP_FALL = 40;
const CEILING_THICKNESS = 300;
const LOOP_MARGIN = 60;
const CRATE_BEVEL = 14;

const halfWave = ratio => (1 - Math.cos(Math.PI * ratio)) / 2;
const fullWave = ratio => (1 - Math.cos(2 * Math.PI * ratio)) / 2;
const cellIndex = x => Math.floor(x / CELL_SIZE);

export function createTrack(level) {
	return new TrackBuilder().build(level.sections);
}

class Segment {
	constructor(start, end, { isDeadly, loopSide }) {
		this.start = start;
		this.direction = end.subtract(start);
		this.lengthSquared = this.direction.dot(this.direction);
		this.normal = new Vector(this.direction.y, -this.direction.x)
			.normalize();
		this.left = Math.min(start.x, end.x);
		this.right = Math.max(start.x, end.x);
		this.isDeadly = isDeadly;
		this.loopSide = loopSide;
	}

	projectRatio(point) {
		const projection = point.subtract(this.start).dot(this.direction);
		return clamp(projection / this.lengthSquared, 0, 1);
	}

	pointAt(ratio) {
		return this.start.add(this.direction.scale(ratio));
	}
}

class Track {
	constructor(parts) {
		const { points, spikeEnds, ceilings, loops } = parts;
		this.points = points;
		this.gaps = parts.gaps;
		this.crates = parts.crates;
		this.ceilings = ceilings;
		this.loops = loops;
		this.start = parts.start;
		this.finish = parts.finish;
		this.lowestY = Math.max(...points.map(point => point.y));
		const ground = connect(points, { deadlyEnds: spikeEnds });
		const roofs = ceilings.flatMap(ceiling => connect(outline(ceiling)));
		const rings = loops.flatMap(loopSegments);
		this.spikes = ground.filter(segment => segment.isDeadly);
		this.cells = new Map();
		[...ground, ...roofs, ...rings]
			.forEach(segment => this.addToCells(segment));
	}

	addToCells(segment) {
		const first = cellIndex(segment.left - MAX_POINT_RADIUS);
		const last = cellIndex(segment.right + MAX_POINT_RADIUS);
		for (let index = first; index <= last; index++) {
			if (!this.cells.has(index)) {
				this.cells.set(index, []);
			}
			this.cells.get(index).push(segment);
		}
	}

	segmentsAt(x) {
		return this.cells.get(cellIndex(x)) ?? NO_SEGMENTS;
	}

	isInGap({ x, y }) {
		return this.gaps.some(gap =>
			x > gap.left && x < gap.right && y > gap.top + GAP_FALL
		);
	}

	loopSide(position, side) {
		const loop = this.loops.find(({ center, radius }) =>
			Math.abs(position.x - center.x) < radius + LOOP_MARGIN
		);
		if (!loop) {
			return 'rise';
		}
		const { center } = loop;
		const isPastTop = position.x < center.x && position.y < center.y;
		return isPastTop ? 'fall' : side;
	}
}

function connect(points, options = {}) {
	const { deadlyEnds = new Set(), loopSide = null } = options;
	return points.slice(1).map((end, index) =>
		new Segment(points[index], end, {
			isDeadly: deadlyEnds.has(index + 1),
			loopSide,
		})
	);
}

function loopSegments({ center, radius }) {
	const rise = arc(center, radius, Math.PI / 2, -Math.PI / 2);
	const fall = arc(center, radius, -Math.PI / 2, -Math.PI * 1.5);
	return [
		...connect(rise, { loopSide: 'rise' }),
		...connect(fall, { loopSide: 'fall' }),
	];
}

function arc(center, radius, from, to) {
	const count = Math.ceil(Math.abs(to - from) * radius / CURVE_STEP);
	return Array.from({ length: count + 1 }, (_, i) => {
		const angle = from + (to - from) * i / count;
		const direction = new Vector(Math.cos(angle), Math.sin(angle));
		return center.add(direction.scale(radius));
	});
}

export function outline({ left, right, top, bottom }) {
	return [
		new Vector(left, bottom),
		new Vector(left, top),
		new Vector(right, top),
		new Vector(right, bottom),
		new Vector(left, bottom),
	];
}

class TrackBuilder {
	constructor() {
		this.points = [new Vector(0, 0)];
		this.spikeEnds = new Set();
		this.gaps = [];
		this.crates = [];
		this.ceilings = [];
		this.loops = [];
	}

	get cursor() {
		return this.points[this.points.length - 1];
	}

	lineTo(dx, rise) {
		this.points.push(this.cursor.add(new Vector(dx, -rise)));
	}

	curve(length, shape) {
		const origin = this.cursor;
		const count = Math.ceil(length / CURVE_STEP);
		const curve = Array.from({ length: count }, (_, i) => {
			const ratio = (i + 1) / count;
			return origin.add(new Vector(length * ratio, -shape(ratio)));
		});
		this.points.push(...curve);
	}

	flat({ length }) {
		this.lineTo(length, 0);
	}

	slope({ length, height }) {
		this.lineTo(length, height);
	}

	smoothSlope({ length, height }) {
		this.curve(length, ratio => height * halfWave(ratio));
	}

	hill({ length, height }) {
		this.curve(length, ratio => height * fullWave(ratio));
	}

	valley({ length, depth }) {
		this.hill({ length, height: -depth });
	}

	waves({ count, length, height, growth = 0 }) {
		for (let i = 0; i < count; i++) {
			this.hill({ length, height: height + growth * i });
		}
	}

	pit({ length, depth }) {
		const wall = length * PIT_WALL_SHARE;
		this.smoothSlope({ length: wall, height: -depth });
		this.flat({ length: length - wall * 2 });
		this.smoothSlope({ length: wall, height: depth });
	}

	plateau({ length, height }) {
		const slope = length * PLATEAU_SLOPE_SHARE;
		this.smoothSlope({ length: slope, height });
		this.flat({ length: length - slope * 2 });
		this.smoothSlope({ length: slope, height: -height });
	}

	path({ points }) {
		const origin = this.cursor;
		this.points.push(
			...points.map(([dx, dy]) => origin.add(new Vector(dx, dy)))
		);
	}

	steps({ count, length, height }) {
		for (let i = 0; i < count; i++) {
			this.lineTo(0, height);
			this.lineTo(length, 0);
		}
	}

	jump({ length, height }) {
		this.curve(length, ratio => height * ratio * ratio);
		this.lineTo(0, -height);
	}

	spikes({ length }) {
		this.flat({ length });
		this.spikeEnds.add(this.points.length - 1);
	}

	spikePit({ length, depth }) {
		this.lineTo(0, -depth);
		this.spikes({ length });
		this.lineTo(0, depth);
	}

	gap({ length }) {
		const { x, y } = this.cursor;
		this.gaps.push({ left: x, right: x + length, top: y });
		this.lineTo(0, -GAP_DEPTH);
		this.flat({ length });
		this.lineTo(0, GAP_DEPTH);
	}

	box({ length, height }) {
		const { x, y } = this.cursor;
		const top = y - height;
		this.crates.push({ left: x, right: x + length, top, bottom: y });
		this.lineTo(CRATE_BEVEL, height);
		this.flat({ length: length - CRATE_BEVEL * 2 });
		this.lineTo(CRATE_BEVEL, -height);
	}

	tunnel({ length, height }) {
		const { x, y } = this.cursor;
		const bottom = y - height;
		const top = bottom - CEILING_THICKNESS;
		this.ceilings.push({ left: x, right: x + length, top, bottom });
		this.flat({ length });
	}

	loop({ radius }) {
		const center = this.cursor.add(new Vector(radius, -radius));
		this.loops.push({ center, radius });
		this.flat({ length: radius * 2 });
	}

	build(sections) {
		this.flat({ length: START_LENGTH });
		sections.forEach(section => this[section.type](section));
		const finish = this.cursor;
		this.flat({ length: FINISH_LENGTH });
		return new Track({
			points: this.points,
			spikeEnds: this.spikeEnds,
			gaps: this.gaps,
			crates: this.crates,
			ceilings: this.ceilings,
			loops: this.loops,
			start: new Vector(START_OFFSET, 0),
			finish,
		});
	}
}
