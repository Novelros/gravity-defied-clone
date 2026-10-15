import { CONFIG } from '../config.js';
import { Point, Spring, Vector } from '../physics.js';
import { Ragdoll } from './rider.js';

const CHASSIS_HALF = 20;
const CHASSIS_MASS = 1.25;
const CHASSIS_RADIUS = 8;
const WHEEL_SPIN_KEPT = 0.1;

export class Wreck {
	constructor(bike) {
		const pose = bike.pose();
		const velocity = bike.velocity();
		this.model = bike.model;
		this.loopSide = bike.loopSide;
		this.rearWheel = bike.rearWheel;
		this.frontWheel = bike.frontWheel;
		this.tail = createChassisPart(
			pose.toWorld(new Vector(-CHASSIS_HALF, 0)), velocity
		);
		this.nose = createChassisPart(
			pose.toWorld(new Vector(CHASSIS_HALF, 0)), velocity
		);
		this.ragdoll = new Ragdoll(pose, velocity);
		this.scatterWheels(pose.forward);
		this.points = [
			this.rearWheel,
			this.frontWheel,
			this.tail,
			this.nose,
			...this.ragdoll.points,
		];
		this.springs = [
			new Spring(this.tail, this.nose),
			...this.ragdoll.springs,
		];
	}

	scatterWheels(forward) {
		const up = forward.perpendicular().scale(-1);
		const push = CONFIG.WRECK_PUSH;
		this.rearWheel.accelerate(forward.scale(-push).add(up.scale(push)));
		this.frontWheel.accelerate(forward.scale(push).add(up.scale(push)));
		this.rearWheel.loseDrive(WHEEL_SPIN_KEPT);
		this.frontWheel.loseDrive(WHEEL_SPIN_KEPT);
	}

	chassis(blend) {
		const tail = this.tail.positionAt(blend);
		const nose = this.nose.positionAt(blend);
		return {
			center: tail.lerp(nose, 0.5),
			angle: nose.subtract(tail).angle(),
		};
	}

	center(blend = 1) {
		return this.ragdoll.joints.hip.positionAt(blend);
	}

	velocity() {
		return this.ragdoll.joints.hip.velocity;
	}
}

function createChassisPart(position, velocity) {
	const part = new Point(
		position.x, position.y, CHASSIS_MASS, CHASSIS_RADIUS
	);
	part.accelerate(velocity);
	return part;
}
