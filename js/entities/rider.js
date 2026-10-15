import { CONFIG } from '../config.js';
import { Point, Spring } from '../physics.js';
import { BIKE_SHAPE } from './bike.js';

const LIMBS = {
	upperArm: 16,
	forearm: 16,
	thigh: 19,
	shin: 18,
};

const SHOULDER_RATIO = 0.72;

const JOINTS = {
	head: { mass: 1, radius: CONFIG.HEAD_RADIUS },
	shoulder: { mass: 1, radius: 4 },
	hip: { mass: 1.2, radius: 5 },
	elbow: { mass: 0.4, radius: 3 },
	hand: { mass: 0.3, radius: 3 },
	knee: { mass: 0.5, radius: 3 },
	foot: { mass: 0.4, radius: 3 },
};

const BONES = [
	['hip', 'shoulder'],
	['shoulder', 'head'],
	['shoulder', 'elbow'],
	['elbow', 'hand'],
	['hip', 'knee'],
	['knee', 'foot'],
];

const BONE = { damping: 0.05 };
const POSTURE = { stiffness: 150, damping: 0.05 };

export function buildSkeleton(pose) {
	const { size } = pose.model;
	const head = pose.head;
	const hip = pose.toWorld(BIKE_SHAPE.seat);
	const hand = pose.toWorld(BIKE_SHAPE.handlebar);
	const foot = pose.toWorld(BIKE_SHAPE.footPeg);
	const shoulder = hip.lerp(head, SHOULDER_RATIO);
	return {
		head,
		shoulder,
		hip,
		hand,
		foot,
		knee: bendJoint(
			hip, foot, LIMBS.thigh * size, LIMBS.shin * size, pose.forward
		),
		elbow: bendJoint(
			shoulder, hand, LIMBS.upperArm * size, LIMBS.forearm * size,
			pose.down
		),
	};
}

function bendJoint(start, end, firstLength, secondLength, hint) {
	const offset = end.subtract(start);
	const distance = Math.min(offset.length(), firstLength + secondLength);
	const direction = offset.normalize();
	const along = (firstLength ** 2 - secondLength ** 2 + distance ** 2)
		/ (2 * distance);
	const height = Math.sqrt(Math.max(firstLength ** 2 - along ** 2, 0));
	const side = direction.perpendicular();
	const bend = side.dot(hint) >= 0 ? side : side.scale(-1);
	return start.add(direction.scale(along)).add(bend.scale(height));
}

export class Ragdoll {
	constructor(pose, velocity) {
		const { size } = pose.model;
		const skeleton = buildSkeleton(pose);
		this.joints = Object.fromEntries(
			Object.entries(JOINTS).map(([name, { mass, radius }]) => {
				const { x, y } = skeleton[name];
				const joint = new Point(x, y, mass, radius * size);
				joint.accelerate(velocity);
				return [name, joint];
			})
		);
		this.points = Object.values(this.joints);
		this.springs = [
			...BONES.map(([from, to]) =>
				new Spring(this.joints[from], this.joints[to], BONE)
			),
			new Spring(this.joints.hip, this.joints.head, POSTURE),
		];
	}

	headRadius() {
		return this.joints.head.radius;
	}

	positions(blend) {
		return Object.fromEntries(
			Object.entries(this.joints)
				.map(([name, joint]) => [name, joint.positionAt(blend)])
		);
	}
}
