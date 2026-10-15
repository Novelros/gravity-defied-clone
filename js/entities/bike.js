import { CONFIG } from '../config.js';
import { clamp, Point, Spring, Vector, Wheel } from '../physics.js';

const BASE_MODEL = {
	power: 3000,
	topSpeed: 780,
	leanTorque: 6,
	flipSpeed: 9,
	size: 1,
	color: '#d32f2f',
	trim: '#8e1c1c',
	extras: [],
};

export const BIKE_MODELS = [
	{ name: '100cc' },
	{
		name: '175cc',
		power: 3600,
		topSpeed: 930,
		flipSpeed: 8.5,
		size: 1.06,
		color: '#1e88e5',
		trim: '#0d47a1',
		extras: ['fender'],
	},
	{
		name: '220cc',
		power: 4300,
		topSpeed: 1100,
		flipSpeed: 9.5,
		size: 1.12,
		color: '#fdd835',
		trim: '#263238',
		extras: ['fairing'],
	},
].map(model => ({ ...BASE_MODEL, ...model }));

export const BIKE_SHAPE = {
	swingArmPivot: new Vector(-6, 12),
	forkTop: new Vector(24, -10),
	handlebar: new Vector(18, -20),
	seat: new Vector(-12, -8),
	footPeg: new Vector(-2, 14),
	headlight: new Vector(28, -5),
};

const LAYOUT = {
	rearWheel: new Vector(-36, 0),
	frontWheel: new Vector(36, 0),
	frame: new Vector(-4, -26),
	head: new Vector(-2, -74),
};

const MASS = {
	wheel: 1,
	frame: 2.5,
	head: 1,
};

const SPRINGS = {
	wheelBase: { damping: 0.1 },
	suspension: { stiffness: 400, damping: 0.08 },
	body: { stiffness: 3000, damping: 0.1 },
	rider: { stiffness: 1500, damping: 0.1 },
};

export class BikePose {
	constructor({ model, rearWheel, frontWheel, frame, head }) {
		this.model = model;
		this.rearWheel = rearWheel;
		this.frontWheel = frontWheel;
		this.frame = frame;
		this.head = head;
		this.forward = frontWheel.position
			.subtract(rearWheel.position)
			.normalize();
		this.down = this.forward.perpendicular();
		this.angle = this.forward.angle();
	}

	toWorld(local) {
		const { x, y } = local.scale(this.model.size);
		return this.frame
			.add(this.forward.scale(x))
			.add(this.down.scale(y));
	}
}

export class Bike {
	constructor(groundPoint, model) {
		const { size } = model;
		const wheelRadius = CONFIG.WHEEL_RADIUS * size;
		const center = groundPoint.add(new Vector(0, -wheelRadius));
		const place = offset => center.add(offset.scale(size));

		this.model = model;
		this.rearWheel = createWheel(place(LAYOUT.rearWheel), wheelRadius);
		this.frontWheel = createWheel(place(LAYOUT.frontWheel), wheelRadius);
		this.frame = createPoint(place(LAYOUT.frame), MASS.frame,
			CONFIG.FRAME_RADIUS * size);
		this.head = createPoint(place(LAYOUT.head), MASS.head,
			CONFIG.HEAD_RADIUS * size);
		this.points = [
			this.rearWheel,
			this.frontWheel,
			this.frame,
			this.head,
		];
		this.totalMass = this.points
			.reduce((sum, point) => sum + point.mass, 0);
		this.leanAmount = 0;
		this.loopSide = 'rise';
		this.createSprings();
	}

	createSprings() {
		const { rearWheel, frontWheel, frame, head } = this;
		this.rearToHead = new Spring(rearWheel, head, SPRINGS.rider);
		this.frontToHead = new Spring(frontWheel, head, SPRINGS.rider);
		this.springs = [
			new Spring(rearWheel, frontWheel, SPRINGS.wheelBase),
			new Spring(rearWheel, frame, SPRINGS.suspension),
			new Spring(frontWheel, frame, SPRINGS.suspension),
			new Spring(frame, head, SPRINGS.body),
			this.rearToHead,
			this.frontToHead,
		];
	}

	control(controls, dt) {
		const { power, topSpeed } = this.model;
		if (controls.gas > 0) {
			this.rearWheel.drive(power * controls.gas, topSpeed, dt);
		}
		if (controls.brake > 0) {
			const force = CONFIG.BRAKE_POWER * controls.brake;
			this.rearWheel.brake(force, dt);
			this.frontWheel.brake(force, dt);
		}
		this.lean(controls.leanForward - controls.leanBack, dt);
	}

	lean(target, dt) {
		const limit = CONFIG.LEAN_SPEED * dt;
		const change = target - this.leanAmount;
		this.leanAmount += clamp(change, -limit, limit);

		const shift = this.leanAmount * CONFIG.LEAN_SHIFT;
		this.rearToHead.stretch(1 + shift);
		this.frontToHead.stretch(1 - shift);
		this.rotate(this.isFlying()
			? this.flipTurn(dt)
			: this.leanAmount * this.model.leanTorque * dt);
	}

	flipTurn(dt) {
		const wanted = this.leanAmount * this.model.flipSpeed;
		const limit = CONFIG.FLIP_TORQUE * dt;
		return clamp(wanted - this.rotationSpeed(), -limit, limit);
	}

	rotate(turn) {
		const center = this.center();
		this.points.forEach(point => {
			const arm = point.position.subtract(center);
			point.accelerate(arm.perpendicular().scale(turn));
		});
	}

	rotationSpeed() {
		const { rearWheel, frontWheel } = this;
		const base = frontWheel.position.subtract(rearWheel.position);
		const motion = frontWheel.velocity.subtract(rearWheel.velocity);
		return (base.x * motion.y - base.y * motion.x) / base.dot(base);
	}

	isFlying() {
		return this.points.every(point => point.contact === null);
	}

	center(blend = 1) {
		const weighted = this.points.reduce(
			(sum, point) => sum.add(point.positionAt(blend).scale(point.mass)),
			new Vector()
		);
		return weighted.scale(1 / this.totalMass);
	}

	velocity() {
		return this.frame.velocity;
	}

	pose(blend = 1) {
		return new BikePose({
			model: this.model,
			rearWheel: this.rearWheel.stateAt(blend),
			frontWheel: this.frontWheel.stateAt(blend),
			frame: this.frame.positionAt(blend),
			head: this.head.positionAt(blend),
		});
	}

	isHurt() {
		return this.head.contact !== null
			|| this.points.some(point => point.isHurt);
	}
}

function createWheel(position, radius) {
	return new Wheel(position.x, position.y, MASS.wheel, radius);
}

function createPoint(position, mass, radius) {
	return new Point(position.x, position.y, mass, radius);
}
