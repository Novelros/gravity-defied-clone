import { CONFIG } from '../config.js';
import { clamp, Vector } from '../physics.js';

const VIEW_LIFT = 60;
const MAX_LOOK_AHEAD = 220;

export class Camera {
	constructor(zoomScale = 1) {
		this.position = new Vector();
		this.zoomScale = zoomScale;
		this.zoom = 1;
		this.width = 0;
		this.height = 0;
	}

	resize(width, height) {
		this.width = width;
		this.height = height;
		const scale = Math.min(width, height) / CONFIG.CAMERA_BASE_SIZE;
		const zoom = clamp(
			scale,
			CONFIG.CAMERA_MIN_ZOOM,
			CONFIG.CAMERA_MAX_ZOOM
		);
		this.zoom = zoom * this.zoomScale;
	}

	jumpTo(target) {
		this.position = this.lift(target);
	}

	moveBy(offset) {
		this.position = this.position.add(offset);
	}

	screenToWorld(screenX, screenY) {
		return new Vector(
			this.left + screenX / this.zoom,
			this.top + screenY / this.zoom
		);
	}

	follow(target, velocity, dt) {
		const ahead = velocity.scale(CONFIG.CAMERA_LOOK_AHEAD);
		const limited = ahead.length() > MAX_LOOK_AHEAD
			? ahead.normalize().scale(MAX_LOOK_AHEAD)
			: ahead;
		const goal = this.lift(target.add(limited));
		const amount = 1 - Math.exp(-CONFIG.CAMERA_SMOOTHING * dt);
		this.position = this.position.lerp(goal, amount);
	}

	lift(target) {
		return target.add(new Vector(0, -VIEW_LIFT));
	}

	get left() {
		return this.position.x - this.width / 2 / this.zoom;
	}

	get right() {
		return this.position.x + this.width / 2 / this.zoom;
	}

	get top() {
		return this.position.y - this.height / 2 / this.zoom;
	}

	get bottom() {
		return this.position.y + this.height / 2 / this.zoom;
	}

	applyTo(context, pixelRatio) {
		const scale = this.zoom * pixelRatio;
		context.setTransform(
			scale, 0, 0, scale,
			(this.width / 2 - this.position.x * this.zoom) * pixelRatio,
			(this.height / 2 - this.position.y * this.zoom) * pixelRatio
		);
	}
}
