import { CONFIG } from '../config.js';
import { BIKE_SHAPE } from '../entities/bike.js';
import { buildSkeleton } from '../entities/rider.js';
import { Vector } from '../physics.js';
import { outline } from '../track/track.js';
import { Camera } from './camera.js';

const COLORS = {
	skyTop: '#6fb7e3',
	skyBottom: '#e3f2fa',
	farHills: '#a6cbe0',
	nearHills: '#8fbfa4',

	groundTop: '#6b5240',
	groundBottom: '#3b2c22',
	grass: '#3f9b46',
	grassLight: '#7ccf6e',

	tire: '#1c1c1c',
	rim: '#a0a4a8',
	spoke: '#d6d9dc',
	metal: '#5d6166',
	metalDark: '#3a3d41',
	seat: '#222222',
	light: '#ffe082',

	rider: '#171717',
	helmet: '#f4511e',
	visor: '#9fd3f7',

	pole: '#f5f5f5',
	startFlag: '#43a047',
	finishLight: '#ffffff',
	finishDark: '#151515',

	void: '#0b1015',
	crate: '#b5824a',
	crateEdge: '#6d4a26',
	spike: '#d9dde1',
	rock: '#4e3d30',
};

const VIEW_MARGIN = 100;
const HILL_STEP = 16;
const PEN_RADIUS = 7;
const SPOKES = 6;
const BODY_WIDTH = 5;
const LIMB_WIDTH = 4;
const SPIKE_WIDTH = 16;
const SPIKE_HEIGHT = 14;
const LOOP_WIDTH = 16;

const HILLS = [
	{
		parallax: 0.1,
		level: 0.58,
		height: 90,
		seed: 1,
		color: COLORS.farHills,
	},
	{
		parallax: 0.25,
		level: 0.72,
		height: 70,
		seed: 4,
		color: COLORS.nearHills,
	},
];

const FLAG = {
	pole: 90,
	width: 36,
	height: 24,
	checker: 6,
};

const toPoints = pairs => pairs.map(([x, y]) => new Vector(x, y));

const PARTS = {
	engine: toPoints([[-10, 4], [12, 4], [14, 18], [-8, 20]]),
	tank: toPoints([[-4, -4], [4, -11], [20, -11], [24, -4], [12, 4]]),
	seat: toPoints([[-30, -8], [-4, -8], [-2, -3], [-26, -2]]),
	tail: toPoints([[-34, -10], [-26, -8], [-26, -2], [-36, -4]]),
	exhaust: toPoints([[2, 16], [-14, 14], [-30, 6]]),
};

const EXTRAS = {
	fender: toPoints([[28, 9], [38, 3], [54, 6], [52, 9], [38, 7]]),
	fairing: toPoints([[18, -12], [26, -18], [36, -10], [34, 2], [22, 6]]),
};

const VISOR = toPoints([[2, -4], [9, -3], [9, 3], [3, 2]]);

export class Renderer {
	constructor(canvas) {
		this.canvas = canvas;
		this.context = canvas.getContext('2d');
		this.camera = new Camera();
		this.pixelRatio = 1;
		this.resize();
		window.addEventListener('resize', () => this.resize());
	}

	resize() {
		const { clientWidth, clientHeight } = this.canvas;
		this.pixelRatio = window.devicePixelRatio;
		this.canvas.width = Math.round(clientWidth * this.pixelRatio);
		this.canvas.height = Math.round(clientHeight * this.pixelRatio);
		this.camera.resize(clientWidth, clientHeight);
	}

	focus(bike) {
		this.camera.jumpTo(bike.center());
	}

	draw({ track, bike, wreck, ghost, blend }, dt) {
		const { context, camera } = this;
		const target = wreck ?? bike;
		camera.follow(target.center(blend), target.velocity(), dt);
		this.drawWorld(camera, track);

		if (ghost) {
			context.save();
			context.globalAlpha = CONFIG.GHOST_ALPHA;
			drawBikeWithRider(context, ghost);
			context.restore();
		}
		if (wreck) {
			drawWreck(context, wreck, blend);
		} else {
			drawBikeWithRider(context, bike.pose(blend));
		}
	}

	drawEditor(editor) {
		const { camera } = editor;
		this.drawWorld(camera, editor.previewTrack());
		const penRadius = PEN_RADIUS / camera.zoom;
		fillCircle(this.context, editor.endPoint(), penRadius, COLORS.helmet);
	}

	drawWorld(camera, track) {
		const { context, pixelRatio } = this;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		drawBackground(context, camera);
		camera.applyTo(context, pixelRatio);
		drawTrack(context, track, camera);
	}
}

function drawBackground(context, camera) {
	const { width, height } = camera;
	context.fillStyle = verticalGradient(
		context, 0, height, COLORS.skyTop, COLORS.skyBottom
	);
	context.fillRect(0, 0, width, height);
	HILLS.forEach(hills => drawHills(context, camera, hills));
}

function drawHills(context, camera, hills) {
	const { width, height, zoom } = camera;
	const shift = camera.position.x * hills.parallax * zoom;
	const count = Math.ceil(width / HILL_STEP) + 1;
	const ridgeLine = Array.from({ length: count }, (_, i) => {
		const x = i * HILL_STEP;
		const wave = ridge((x + shift) / zoom, hills.seed);
		return new Vector(x, height * hills.level - wave * hills.height);
	});
	fillPolygon(context, [
		new Vector(0, height),
		...ridgeLine,
		new Vector(width, height),
	], hills.color);
}

function ridge(x, seed) {
	const wide = Math.sin(x * 0.003 + seed);
	const narrow = Math.sin(x * 0.008 + seed * 2) * 0.5;
	return (wide + narrow + 1.5) / 3;
}

function drawTrack(context, track, camera) {
	const points = findVisiblePoints(track, camera);
	if (points.length < 2) {
		return;
	}
	const bottom = camera.bottom + VIEW_MARGIN;
	const first = points[0];
	const last = points[points.length - 1];
	const ground = verticalGradient(
		context, camera.top, camera.bottom,
		COLORS.groundTop, COLORS.groundBottom
	);
	fillPolygon(context, [
		new Vector(first.x, bottom),
		...points,
		new Vector(last.x, bottom),
	], ground);
	strokeLine(context, points, COLORS.grass, 8);
	strokeLine(context, points, COLORS.grassLight, 2);
	track.gaps.forEach(gap => drawGap(context, gap, bottom));
	track.crates.forEach(crate => drawCrate(context, crate));
	track.spikes.forEach(segment => drawSpikes(context, segment));
	track.ceilings.forEach(ceiling => drawCeiling(context, ceiling));
	track.loops.forEach(loop => drawLoop(context, loop));
	drawStartFlag(context, track.start);
	drawFinishFlag(context, track.finish);
}

function drawGap(context, { left, right, top }, bottom) {
	context.fillStyle = COLORS.void;
	context.fillRect(left, top, right - left, bottom - top);
}

function drawCrate(context, crate) {
	const edges = outline(crate);
	const [bottomLeft, topLeft, topRight, bottomRight] = edges;
	fillPolygon(context, edges, COLORS.crate);
	strokeLine(context, edges, COLORS.crateEdge, 3);
	strokeLine(context, [topLeft, bottomRight], COLORS.crateEdge, 2);
	strokeLine(context, [bottomLeft, topRight], COLORS.crateEdge, 2);
}

function drawSpikes(context, { start, direction, normal }) {
	const count = Math.round(direction.length() / SPIKE_WIDTH);
	const step = direction.scale(1 / count);
	const tip = normal.scale(SPIKE_HEIGHT);
	const teeth = Array.from({ length: count }, (_, i) => [
		start.add(step.scale(i)),
		start.add(step.scale(i + 0.5)).add(tip),
	]);
	fillPolygon(context, [...teeth.flat(), start.add(direction)],
		COLORS.spike);
}

function drawLoop(context, { center, radius }) {
	strokeCircle(context, center, radius + LOOP_WIDTH / 2, COLORS.groundTop,
		LOOP_WIDTH);
	strokeCircle(context, center, radius, COLORS.grass, 4);
}

function drawCeiling(context, ceiling) {
	const edges = outline(ceiling);
	const [bottomLeft, , , bottomRight] = edges;
	fillPolygon(context, edges, COLORS.rock);
	strokeLine(context, [bottomLeft, bottomRight], COLORS.groundBottom, 4);
}

function findVisiblePoints(track, camera) {
	const { points } = track;
	const left = camera.left - VIEW_MARGIN;
	const right = camera.right + VIEW_MARGIN;
	const first = points.findIndex(point => point.x >= left);
	if (first === -1) {
		return [];
	}
	const last = points.findIndex(point => point.x > right);
	const end = last === -1 ? points.length : last + 1;
	return points.slice(Math.max(first - 1, 0), end);
}

function drawPole(context, base) {
	const top = new Vector(base.x, base.y - FLAG.pole);
	strokeLine(context, [base, top], COLORS.pole, 3);
	return top;
}

function drawStartFlag(context, base) {
	const top = drawPole(context, base);
	fillPolygon(context, [
		top,
		top.add(new Vector(FLAG.width, FLAG.height / 2)),
		top.add(new Vector(0, FLAG.height)),
	], COLORS.startFlag);
}

function drawFinishFlag(context, base) {
	const top = drawPole(context, base);
	const size = FLAG.checker;
	for (let row = 0; row < FLAG.height / size; row++) {
		for (let column = 0; column < FLAG.width / size; column++) {
			const isDark = (row + column) % 2 === 0;
			context.fillStyle = isDark
				? COLORS.finishDark
				: COLORS.finishLight;
			context.fillRect(
				top.x + column * size, top.y + row * size, size, size
			);
		}
	}
}

function drawBikeWithRider(context, pose) {
	drawWheel(context, pose.rearWheel);
	drawWheel(context, pose.frontWheel);
	const pivot = pose.toWorld(BIKE_SHAPE.swingArmPivot);
	const forkTop = pose.toWorld(BIKE_SHAPE.forkTop);
	strokeLine(context, [pose.rearWheel.position, pivot], COLORS.metal, 4);
	strokeLine(context, [pose.frontWheel.position, forkTop], COLORS.metal, 4);
	drawChassis(context, pose.frame, pose.angle, pose.model, true);

	const headRadius = CONFIG.HEAD_RADIUS * pose.model.size;
	drawRider(context, buildSkeleton(pose), pose.angle, headRadius);
}

function drawWreck(context, wreck, blend) {
	const { center, angle } = wreck.chassis(blend);
	drawWheel(context, wreck.rearWheel.stateAt(blend));
	drawWheel(context, wreck.frontWheel.stateAt(blend));
	drawChassis(context, center, angle, wreck.model, false);

	const joints = wreck.ragdoll.positions(blend);
	const neck = joints.head.subtract(joints.shoulder);
	drawRider(context, joints, neck.angle() + Math.PI / 2,
		wreck.ragdoll.headRadius());
}

function drawWheel(context, wheel) {
	const center = new Vector();
	const rimRadius = wheel.radius - 6;
	drawLocal(context, wheel.position, wheel.angle, 1, () => {
		for (let i = 0; i < SPOKES; i++) {
			const end = new Vector(rimRadius, 0)
				.rotate(i * Math.PI * 2 / SPOKES);
			strokeLine(context, [center, end], COLORS.spoke, 1.2);
		}
		strokeCircle(context, center, wheel.radius - 2.5, COLORS.tire, 5);
		strokeCircle(context, center, rimRadius, COLORS.rim, 1.5);
		fillCircle(context, center, 2.5, COLORS.metalDark);
	});
}

function drawChassis(context, origin, angle, model, hasLight) {
	drawLocal(context, origin, angle, model.size, () => {
		strokeLine(context, PARTS.exhaust, COLORS.metalDark, 3);
		fillPolygon(context, PARTS.engine, COLORS.metal);
		fillPolygon(context, PARTS.tail, model.trim);
		fillPolygon(context, PARTS.tank, model.color);
		model.extras.forEach(name => {
			fillPolygon(context, EXTRAS[name], model.color);
		});
		fillPolygon(context, PARTS.seat, COLORS.seat);
		strokeLine(context, [BIKE_SHAPE.forkTop, BIKE_SHAPE.handlebar],
			COLORS.metalDark, 3);
		if (hasLight) {
			fillCircle(context, BIKE_SHAPE.headlight, 3.5, COLORS.light);
		}
	});
}

function drawRider(context, joints, headAngle, headRadius) {
	const { hip, knee, foot, shoulder, head, elbow, hand } = joints;
	strokeLine(context, [hip, knee, foot], COLORS.rider, LIMB_WIDTH);
	strokeLine(context, [hip, shoulder, head], COLORS.rider, BODY_WIDTH);
	strokeLine(context, [shoulder, elbow, hand], COLORS.rider, LIMB_WIDTH);
	fillCircle(context, head, headRadius, COLORS.helmet);
	const scale = headRadius / CONFIG.HEAD_RADIUS;
	drawLocal(context, head, headAngle, scale, () => {
		fillPolygon(context, VISOR, COLORS.visor);
	});
}

function drawLocal(context, origin, angle, scale, draw) {
	context.save();
	context.translate(origin.x, origin.y);
	context.rotate(angle);
	context.scale(scale, scale);
	draw();
	context.restore();
}

function verticalGradient(context, top, bottom, topColor, bottomColor) {
	const gradient = context.createLinearGradient(0, top, 0, bottom);
	gradient.addColorStop(0, topColor);
	gradient.addColorStop(1, bottomColor);
	return gradient;
}

function tracePath(context, points) {
	context.beginPath();
	context.moveTo(points[0].x, points[0].y);
	points.slice(1).forEach(point => context.lineTo(point.x, point.y));
}

function strokeLine(context, points, color, width) {
	tracePath(context, points);
	context.strokeStyle = color;
	context.lineWidth = width;
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.stroke();
}

function fillPolygon(context, points, color) {
	tracePath(context, points);
	context.closePath();
	context.fillStyle = color;
	context.fill();
}

function fillCircle(context, center, radius, color) {
	context.beginPath();
	context.arc(center.x, center.y, radius, 0, Math.PI * 2);
	context.fillStyle = color;
	context.fill();
}

function strokeCircle(context, center, radius, color, width) {
	context.beginPath();
	context.arc(center.x, center.y, radius, 0, Math.PI * 2);
	context.strokeStyle = color;
	context.lineWidth = width;
	context.stroke();
}
