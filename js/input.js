import { CONFIG } from './config.js';
import { Vector } from './physics.js';

const CONTROL_NAMES = ['gas', 'brake', 'leanBack', 'leanForward'];
const KNOB_TRAVEL = 0.55;

const CONTROL_KEYS = {
	gas: ['KeyW', 'ArrowUp'],
	brake: ['KeyS', 'ArrowDown'],
	leanBack: ['KeyA', 'ArrowLeft'],
	leanForward: ['KeyD', 'ArrowRight'],
};

const ACTION_KEYS = {
	KeyR: 'restart',
	Escape: 'pause',
	KeyP: 'pause',
	Enter: 'confirm',
};

const GAME_KEYS = new Set([
	...Object.values(CONTROL_KEYS).flat(),
	...Object.keys(ACTION_KEYS),
]);

function createControls(values = {}) {
	return {
		gas: 0,
		brake: 0,
		leanBack: 0,
		leanForward: 0,
		...values,
	};
}

export const BRAKE_CONTROLS = createControls({ brake: 1 });

export class InputManager {
	constructor(sources) {
		this.sources = sources;
	}

	read() {
		const readings = this.sources.map(source => source.read());
		return Object.fromEntries(CONTROL_NAMES.map(name => [
			name,
			Math.max(...readings.map(controls => controls[name])),
		]));
	}
}

export class KeyboardInput {
	constructor() {
		this.pressed = new Set();
		this.actionHandler = () => {};
		window.addEventListener('keydown', event => this.press(event));
		window.addEventListener('keyup', event => this.release(event));
		window.addEventListener('blur', () => this.pressed.clear());
	}

	onAction(handler) {
		this.actionHandler = handler;
	}

	press(event) {
		if (GAME_KEYS.has(event.code)) {
			event.preventDefault();
		}
		this.pressed.add(event.code);
		const action = ACTION_KEYS[event.code];
		if (action && !event.repeat) {
			this.actionHandler(action);
		}
	}

	release(event) {
		this.pressed.delete(event.code);
	}

	read() {
		return Object.fromEntries(CONTROL_NAMES.map(name => [
			name,
			CONTROL_KEYS[name].some(code => this.pressed.has(code)) ? 1 : 0,
		]));
	}
}

export class JoystickInput {
	constructor(base, knob) {
		this.base = base;
		this.knob = knob;
		this.direction = new Vector();
		this.pointerId = null;
		base.addEventListener('pointerdown', event => this.grab(event));
		base.addEventListener('pointermove', event => this.drag(event));
		base.addEventListener('pointerup', event => this.letGo(event));
		base.addEventListener('pointercancel', event => this.letGo(event));
		base.addEventListener('contextmenu', event => event.preventDefault());
	}

	grab(event) {
		event.preventDefault();
		this.pointerId = event.pointerId;
		this.base.setPointerCapture(event.pointerId);
		this.drag(event);
	}

	drag(event) {
		if (event.pointerId !== this.pointerId) {
			return;
		}
		const area = this.base.getBoundingClientRect();
		const radius = area.width / 2;
		const center = new Vector(area.left + radius, area.top + radius);
		const touch = new Vector(event.clientX, event.clientY);
		const offset = touch.subtract(center).scale(1 / radius);
		this.direction = offset.length() > 1 ? offset.normalize() : offset;
		this.moveKnob(radius);
	}

	letGo(event) {
		if (event.pointerId !== this.pointerId) {
			return;
		}
		this.pointerId = null;
		this.direction = new Vector();
		this.moveKnob(0);
	}

	moveKnob(radius) {
		const shift = this.direction.scale(radius * KNOB_TRAVEL);
		this.knob.style.transform =
			`translate(${shift.x}px, ${shift.y}px)`;
	}

	read() {
		const { x, y } = this.direction;
		return createControls({
			gas: axisValue(-y),
			brake: axisValue(y),
			leanBack: axisValue(-x),
			leanForward: axisValue(x),
		});
	}
}

function axisValue(value) {
	const deadZone = CONFIG.JOYSTICK_DEAD_ZONE;
	if (value <= deadZone) {
		return 0;
	}
	return Math.min((value - deadZone) / (1 - deadZone), 1);
}
