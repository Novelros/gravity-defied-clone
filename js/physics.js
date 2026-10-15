import { CONFIG } from './config.js';

export class Vector {
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	add(other) {
		return new Vector(this.x + other.x, this.y + other.y);
	}

	subtract(other) {
		return new Vector(this.x - other.x, this.y - other.y);
	}

	scale(factor) {
		return new Vector(this.x * factor, this.y * factor);
	}

	dot(other) {
		return this.x * other.x + this.y * other.y;
	}

	length() {
		return Math.hypot(this.x, this.y);
	}

	normalize() {
		return this.scale(1 / this.length());
	}

	perpendicular() {
		return new Vector(-this.y, this.x);
	}

	rotate(angle) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		return new Vector(
			this.x * cos - this.y * sin,
			this.x * sin + this.y * cos
		);
	}

	angle() {
		return Math.atan2(this.y, this.x);
	}

	lerp(target, amount) {
		return this.add(target.subtract(this).scale(amount));
	}
}

export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

export class Point {
	constructor(x, y, mass, radius) {
		this.position = new Vector(x, y);
		this.previous = this.position;
		this.velocity = new Vector();
		this.mass = mass;
		this.inverseMass = 1 / mass;
		this.radius = radius;
		this.contact = null;
		this.isHurt = false;
	}

	integrate(gravity, dt) {
		this.velocity = this.velocity.add(gravity.scale(dt));
		this.previous = this.position;
		this.position = this.position.add(this.velocity.scale(dt));
		this.contact = null;
		this.isHurt = false;
	}

	updateVelocity(dt) {
		const shift = this.position.subtract(this.previous);
		this.velocity = shift.scale(1 / dt);
	}

	positionAt(blend) {
		return this.previous.lerp(this.position, blend);
	}

	move(offset) {
		this.position = this.position.add(offset);
	}

	moveTo(position) {
		this.position = position;
	}

	accelerate(change) {
		this.velocity = this.velocity.add(change);
	}

	touch(normal, isDeadly) {
		this.contact = normal;
		this.isHurt = this.isHurt || isDeadly;
	}

	applyContact() {
		if (!this.contact) {
			return;
		}
		const tangent = this.contact.perpendicular();
		const slide = this.velocity.dot(tangent) * CONFIG.BODY_FRICTION;
		this.accelerate(tangent.scale(-slide));
	}
}

export class Wheel extends Point {
	constructor(x, y, mass, radius) {
		super(x, y, mass, radius);
		this.spin = 0;
		this.angle = 0;
		this.previousAngle = 0;
	}

	integrate(gravity, dt) {
		if (!this.contact) {
			this.brake(CONFIG.AIR_SPIN_DAMPING, dt);
		}
		super.integrate(gravity, dt);
		this.previousAngle = this.angle;
		this.angle += this.spin * dt;
	}

	stateAt(blend) {
		const turn = this.angle - this.previousAngle;
		return {
			position: this.positionAt(blend),
			angle: this.previousAngle + turn * blend,
			radius: this.radius,
		};
	}

	drive(power, topSpeed, dt) {
		const maxSpin = topSpeed / this.radius;
		if (this.spin < maxSpin) {
			const spinUp = power / this.radius * dt;
			this.spin = Math.min(this.spin + spinUp, maxSpin);
		}
	}

	brake(power, dt) {
		this.spin *= 1 - power * dt;
	}

	loseDrive(share) {
		this.spin *= share;
	}

	applyContact() {
		if (!this.contact) {
			return;
		}
		const tangent = this.contact.perpendicular();
		const rimSpeed = this.spin * this.radius;
		const slip = this.velocity.dot(tangent) - rimSpeed;
		const impulse = slip * CONFIG.WHEEL_GRIP / 2;
		this.accelerate(tangent.scale(-impulse));
		this.spin += impulse / this.radius;
	}
}

export class Spring {
	constructor(start, end, { stiffness = Infinity, damping = 0 } = {}) {
		this.start = start;
		this.end = end;
		this.compliance = 1 / stiffness;
		this.damping = damping;
		this.baseLength = end.position.subtract(start.position).length();
		this.restLength = this.baseLength;
		this.totalInverseMass = start.inverseMass + end.inverseMass;
		this.tension = 0;
	}

	stretch(factor) {
		this.restLength = this.baseLength * factor;
	}

	prepare() {
		this.tension = 0;
	}

	solve(dt) {
		const delta = this.end.position.subtract(this.start.position);
		const distance = delta.length();
		const error = distance - this.restLength;
		const softness = this.compliance / (dt * dt);
		const weight = this.totalInverseMass + softness;
		const change = (-error - softness * this.tension) / weight;
		this.tension += change;

		const direction = delta.scale(1 / distance);
		this.start.move(direction.scale(-change * this.start.inverseMass));
		this.end.move(direction.scale(change * this.end.inverseMass));
	}

	damp() {
		const axis = this.end.position
			.subtract(this.start.position)
			.normalize();
		const relative = this.end.velocity.subtract(this.start.velocity);
		const speed = relative.dot(axis) * this.damping;
		const share = axis.scale(speed / this.totalInverseMass);
		this.start.accelerate(share.scale(this.start.inverseMass));
		this.end.accelerate(share.scale(-this.end.inverseMass));
	}
}

export class Simulation {
	constructor() {
		this.gravity = new Vector(0, CONFIG.GRAVITY);
	}

	step(body, track, dt) {
		const { points, springs } = body;
		points.forEach(point => point.integrate(this.gravity, dt));
		springs.forEach(spring => spring.prepare());
		for (let i = 0; i < CONFIG.SOLVER_ITERATIONS; i++) {
			springs.forEach(spring => spring.solve(dt));
			points.forEach(point => {
				resolveCollision(point, track, body.loopSide);
			});
		}
		points.forEach(point => point.updateVelocity(dt));
		springs.forEach(spring => spring.damp());
		points.forEach(point => point.applyContact());
		body.loopSide = track.loopSide(body.center(), body.loopSide);
	}
}

function resolveCollision(point, track, loopSide) {
	track.segmentsAt(point.position.x).forEach(segment => {
		if (segment.loopSide === null || segment.loopSide === loopSide) {
			pushOutOfSegment(point, segment);
		}
	});
}

function pushOutOfSegment(point, segment) {
	const ratio = segment.projectRatio(point.position);
	const closest = segment.pointAt(ratio);
	const offset = point.position.subtract(closest);
	const distance = offset.length();
	if (distance >= point.radius) {
		return;
	}
	const isInner = ratio > 0 && ratio < 1;
	const isBehind = isInner && offset.dot(segment.normal) < 0;
	const normal = isBehind ? segment.normal : offset.scale(1 / distance);
	point.moveTo(closest.add(normal.scale(point.radius)));
	point.touch(normal, segment.isDeadly);
}
