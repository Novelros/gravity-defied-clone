import { CONFIG } from '../config.js';
import { loadJson, saveJson } from '../game/results.js';
import { Vector } from '../physics.js';
import { Camera } from '../render/camera.js';
import { createTrack } from '../track/track.js';

export const CUSTOM_TRACK_ID = 'custom';
export const CUSTOM_TRACK_NAME = 'Своя трасса';

const EDGE_SIZE = 60;
const EDGE_SCROLL = 10;
const OPEN_SHIFT = 0.25;

const PREFABS = {
	flat: { type: 'flat', length: 300 },
	jump: { type: 'jump', length: 220, height: 90 },
	box: { type: 'box', length: 60, height: 25 },
	spikes: { type: 'spikes', length: 160 },
	spikePit: { type: 'spikePit', length: 200, depth: 120 },
	gap: { type: 'gap', length: 220 },
	tunnel: { type: 'tunnel', length: 600, height: 150 },
	loop: { type: 'loop', radius: 150 },
};

export class TrackEditor {
	constructor(canvas) {
		this.canvas = canvas;
		this.camera = new Camera(CONFIG.EDITOR_ZOOM_SCALE);
		this.sections = loadJson(CONFIG.STORAGE_KEYS.customTrack, []);
		this.mode = 'draw';
		this.isActive = false;
		this.pointerId = null;
		this.lastPointer = null;
		this.strokeOrigin = null;
		this.preview = null;
		this.changeHandler = () => {};
		this.listen();
	}

	listen() {
		const { canvas } = this;
		canvas.addEventListener('pointerdown', event => this.press(event));
		canvas.addEventListener('pointermove', event => this.drag(event));
		canvas.addEventListener('pointerup', event => this.release(event));
		canvas.addEventListener('pointercancel', event => this.release(event));
		canvas.addEventListener('wheel', event => this.scroll(event),
			{ passive: false });
		window.addEventListener('resize', () => this.resize());
	}

	onChange(handler) {
		this.changeHandler = handler;
	}

	open() {
		this.isActive = true;
		this.resize();
		this.showEnd();
	}

	close() {
		this.isActive = false;
		this.pointerId = null;
	}

	resize() {
		this.camera.resize(this.canvas.clientWidth, this.canvas.clientHeight);
	}

	showEnd() {
		const visibleWidth = this.camera.right - this.camera.left;
		const shift = new Vector(visibleWidth * OPEN_SHIFT, 0);
		this.camera.jumpTo(this.endPoint().add(shift));
	}

	setMode(mode) {
		this.mode = mode;
	}

	endPoint() {
		return this.previewTrack().finish;
	}

	hasTrack() {
		return this.sections.length > 0;
	}

	press(event) {
		if (!this.isActive) {
			return;
		}
		event.preventDefault();
		this.pointerId = event.pointerId;
		this.canvas.setPointerCapture(event.pointerId);
		this.lastPointer = pointerPosition(event);
		if (this.mode === 'draw') {
			this.strokeOrigin = this.endPoint();
			this.sections.push({ type: 'path', points: [] });
			this.addPoint(event);
		}
	}

	drag(event) {
		if (!this.isActive || event.pointerId !== this.pointerId) {
			return;
		}
		if (this.mode === 'draw') {
			this.scrollAtEdge(event);
			this.addPoint(event);
			return;
		}
		const pointer = pointerPosition(event);
		const shift = this.lastPointer.subtract(pointer);
		this.camera.moveBy(shift.scale(1 / this.camera.zoom));
		this.lastPointer = pointer;
	}

	release(event) {
		if (event.pointerId !== this.pointerId) {
			return;
		}
		this.pointerId = null;
		if (this.mode !== 'draw') {
			return;
		}
		if (this.sections[this.sections.length - 1].points.length === 0) {
			this.sections.pop();
		}
		this.commit();
	}

	scroll(event) {
		if (!this.isActive) {
			return;
		}
		event.preventDefault();
		const delta = event.deltaX || event.deltaY;
		this.camera.moveBy(new Vector(delta / this.camera.zoom, 0));
	}

	scrollAtEdge(event) {
		const area = this.canvas.getBoundingClientRect();
		if (event.clientX > area.right - EDGE_SIZE) {
			this.camera.moveBy(new Vector(EDGE_SCROLL / this.camera.zoom, 0));
		}
	}

	addPoint(event) {
		const area = this.canvas.getBoundingClientRect();
		const point = this.camera.screenToWorld(
			event.clientX - area.left,
			event.clientY - area.top
		);
		if (point.x < this.endPoint().x + CONFIG.EDITOR_MIN_STEP) {
			return;
		}
		const { x, y } = point.subtract(this.strokeOrigin);
		const stroke = this.sections[this.sections.length - 1];
		stroke.points.push([Math.round(x), Math.round(y)]);
		this.preview = null;
	}

	addSection(name) {
		this.sections.push(PREFABS[name]);
		this.commit();
		this.showEnd();
	}

	undo() {
		this.sections.pop();
		this.commit();
	}

	clear() {
		this.sections = [];
		this.commit();
	}

	commit() {
		this.preview = null;
		saveJson(CONFIG.STORAGE_KEYS.customTrack, this.sections);
		this.changeHandler();
	}

	toLevel() {
		return {
			id: CUSTOM_TRACK_ID,
			name: CUSTOM_TRACK_NAME,
			sections: this.sections,
		};
	}

	previewTrack() {
		if (!this.preview) {
			this.preview = createTrack(this.toLevel());
		}
		return this.preview;
	}
}

function pointerPosition(event) {
	return new Vector(event.clientX, event.clientY);
}
