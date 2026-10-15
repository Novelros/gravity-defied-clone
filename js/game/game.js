import { CONFIG } from '../config.js';
import {
	CUSTOM_TRACK_ID,
	CUSTOM_TRACK_NAME,
} from '../editor/track-editor.js';
import { Bike, BIKE_MODELS } from '../entities/bike.js';
import { Wreck } from '../entities/wreck.js';
import { BRAKE_CONTROLS } from '../input.js';
import { Simulation } from '../physics.js';
import { createTrack } from '../track/track.js';
import { GhostRecorder, loadJson, saveJson } from './results.js';

const STATE = {
	MENU: 'menu',
	PLAYING: 'playing',
	PAUSED: 'paused',
	CRASHED: 'crashed',
	FINISHED: 'finished',
	EDITOR: 'editor',
};

const FROZEN_STATES = [STATE.MENU, STATE.PAUSED, STATE.EDITOR];
const CRASH_SCREEN_DELAY = 1.2;

export class Game {
	constructor(dependencies) {
		const {
			input, renderer, hud, screens, records, ghosts, progress, editor,
		} = dependencies;
		this.input = input;
		this.renderer = renderer;
		this.hud = hud;
		this.screens = screens;
		this.records = records;
		this.ghosts = ghosts;
		this.progress = progress;
		this.editor = editor;
		this.simulation = new Simulation();
		this.bikeIndex = this.loadBikeIndex();
		this.editor.onChange(() => this.resetResults(CUSTOM_TRACK_ID));
		this.loadTrack(this.progress.firstTrack());
		this.showMenu();
	}

	setState(state) {
		this.state = state;
		this.stateTime = 0;
		this.hud.setState(state);
	}

	loadBikeIndex() {
		const saved = loadJson(CONFIG.STORAGE_KEYS.bike, 0);
		return this.progress.isBikeOpen(saved) ? saved : 0;
	}

	selectBike(index) {
		this.bikeIndex = index;
		saveJson(CONFIG.STORAGE_KEYS.bike, index);
		this.loadTrack(this.definition);
		this.showMenu();
	}

	showMenu() {
		this.editor.close();
		this.setState(STATE.MENU);
		this.screens.showMenu(this.menuModel());
	}

	menuModel() {
		const { progress, records, editor } = this;
		return {
			bikes: BIKE_MODELS.map((model, index) => {
				const isOpen = progress.isBikeOpen(index);
				return {
					index,
					name: model.name,
					color: model.color,
					isOpen,
					isSelected: index === this.bikeIndex,
					lockedBy: isOpen ? null : progress.leagues[index - 1].name,
				};
			}),
			leagues: progress.leagues.map(league => ({
				name: league.name,
				tracks: league.tracks.map(track => ({
					id: track.id,
					name: track.name,
					best: records.getBest(track.id),
					isOpen: progress.isTrackOpen(track.id),
				})),
			})),
			custom: editor.hasTrack()
				? {
					id: CUSTOM_TRACK_ID,
					name: CUSTOM_TRACK_NAME,
					best: records.getBest(CUSTOM_TRACK_ID),
					isOpen: true,
				}
				: null,
		};
	}

	findTrack(trackId) {
		return trackId === CUSTOM_TRACK_ID
			? this.editor.toLevel()
			: this.progress.findTrack(trackId);
	}

	loadTrack(definition) {
		const model = BIKE_MODELS[this.bikeIndex];
		this.definition = definition;
		this.track = createTrack(definition);
		this.bike = new Bike(this.track.start, model);
		this.wreck = null;
		this.elapsed = 0;
		this.recorder = new GhostRecorder(this.bikeIndex);
		this.ghost = this.ghosts.load(definition.id);
		this.hud.setLevel(`${definition.name} · ${model.name}`);
		this.hud.setTime(0);
		this.renderer.focus(this.bike);
	}

	startTrack(trackId) {
		this.editor.close();
		this.loadTrack(this.findTrack(trackId));
		this.screens.hide();
		this.setState(STATE.PLAYING);
	}

	rideCustomTrack() {
		if (this.editor.hasTrack()) {
			this.startTrack(CUSTOM_TRACK_ID);
		}
	}

	restart() {
		if (this.state !== STATE.MENU && this.state !== STATE.EDITOR) {
			this.startTrack(this.definition.id);
		}
	}

	nextTrack() {
		const next = this.progress.nextTrack(this.definition.id);
		if (next) {
			this.startTrack(next.id);
		} else {
			this.showMenu();
		}
	}

	openEditor() {
		this.setState(STATE.EDITOR);
		this.screens.hide();
		this.editor.open();
	}

	pause() {
		if (this.state === STATE.PLAYING) {
			this.setState(STATE.PAUSED);
			this.screens.show('pause');
		}
	}

	resume() {
		if (this.state === STATE.PAUSED) {
			this.screens.hide();
			this.setState(STATE.PLAYING);
		}
	}

	togglePause() {
		if (this.state === STATE.PAUSED) {
			this.resume();
		} else {
			this.pause();
		}
	}

	handleAction(action) {
		if (action === 'restart') {
			this.restart();
		} else if (action === 'pause') {
			this.handleEscape();
		} else if (action === 'confirm') {
			this.confirm();
		}
	}

	handleEscape() {
		if (this.state === STATE.EDITOR) {
			this.showMenu();
		} else {
			this.togglePause();
		}
	}

	confirm() {
		if (this.state === STATE.CRASHED) {
			this.restart();
		} else if (this.state === STATE.FINISHED) {
			this.nextTrack();
		}
	}

	resetResults(trackId) {
		this.records.reset(trackId);
		this.ghosts.remove(trackId);
	}

	update(dt) {
		if (FROZEN_STATES.includes(this.state)) {
			return;
		}
		this.stateTime += dt;
		if (this.wreck) {
			this.simulation.step(this.wreck, this.track, dt);
			if (this.isCrashScreenDue(dt)) {
				this.screens.show('crash');
			}
			return;
		}
		this.bike.control(this.currentControls(), dt);
		this.simulation.step(this.bike, this.track, dt);
		if (this.state === STATE.PLAYING) {
			this.updateRace(dt);
		}
	}

	currentControls() {
		return this.state === STATE.PLAYING
			? this.input.read()
			: BRAKE_CONTROLS;
	}

	updateRace(dt) {
		this.elapsed += dt;
		this.hud.setTime(this.elapsed);
		this.recorder.record(this.bike, this.elapsed);
		if (this.isCrashed()) {
			this.crash();
		} else if (this.isFinished()) {
			this.finish();
		}
	}

	isCrashed() {
		const center = this.bike.center();
		const fallLine = this.track.lowestY + CONFIG.FALL_LIMIT;
		return this.bike.isHurt()
			|| this.track.isInGap(center)
			|| center.y > fallLine;
	}

	isFinished() {
		return this.bike.frontWheel.position.x >= this.track.finish.x;
	}

	isCrashScreenDue(dt) {
		const wasWaiting = this.stateTime - dt < CRASH_SCREEN_DELAY;
		return wasWaiting && this.stateTime >= CRASH_SCREEN_DELAY;
	}

	crash() {
		this.wreck = new Wreck(this.bike);
		this.setState(STATE.CRASHED);
	}

	finish() {
		const trackId = this.definition.id;
		const bikesBefore = this.openBikeCount();
		this.setState(STATE.FINISHED);
		const isRecord = this.records.submit(trackId, this.elapsed);
		if (isRecord) {
			this.ghosts.save(trackId, this.recorder);
		}
		const bikesAfter = this.openBikeCount();
		this.screens.showFinish({
			time: this.elapsed,
			best: this.records.getBest(trackId),
			isRecord,
			hasNext: this.progress.nextTrack(trackId) !== null,
			unlockedBike: bikesAfter > bikesBefore
				? BIKE_MODELS[bikesAfter - 1].name
				: null,
		});
	}

	openBikeCount() {
		return BIKE_MODELS
			.filter((model, index) => this.progress.isBikeOpen(index))
			.length;
	}

	render(dt, blend) {
		if (this.state === STATE.EDITOR) {
			this.renderer.drawEditor(this.editor);
			return;
		}
		const smooth = FROZEN_STATES.includes(this.state) ? 1 : blend;
		this.renderer.draw({
			track: this.track,
			bike: this.bike,
			wreck: this.wreck,
			ghost: this.ghostPose(smooth),
			blend: smooth,
		}, dt);
	}

	ghostPose(blend) {
		if (!this.ghost || this.state === STATE.MENU) {
			return null;
		}
		const isRacing = this.state === STATE.PLAYING;
		const lag = isRacing ? (1 - blend) * CONFIG.FIXED_STEP : 0;
		return this.ghost.poseAt(this.elapsed - lag);
	}
}
