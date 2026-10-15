import { CONFIG } from '../config.js';

export class GameLoop {
	constructor(update, render) {
		this.update = update;
		this.render = render;
		this.accumulator = 0;
		this.lastTime = null;
		this.tick = this.tick.bind(this);
	}

	start() {
		requestAnimationFrame(this.tick);
	}

	tick(time) {
		const elapsed = this.lastTime === null
			? 0
			: (time - this.lastTime) / 1000;
		const frameTime = Math.min(elapsed, CONFIG.MAX_FRAME_TIME);
		this.lastTime = time;
		this.accumulator += frameTime;
		while (this.accumulator >= CONFIG.FIXED_STEP) {
			this.update(CONFIG.FIXED_STEP);
			this.accumulator -= CONFIG.FIXED_STEP;
		}
		this.render(frameTime, this.accumulator / CONFIG.FIXED_STEP);
		requestAnimationFrame(this.tick);
	}
}
