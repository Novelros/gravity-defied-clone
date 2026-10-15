import { CONFIG } from '../config.js';
import { BIKE_MODELS, BikePose } from '../entities/bike.js';
import { Vector } from '../physics.js';

const GHOST_PRECISION = 2;

export function loadJson(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback;
	} catch {
		return fallback;
	}
}

export function saveJson(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {}
}

export class Records {
	constructor() {
		this.times = loadJson(CONFIG.STORAGE_KEYS.records, {});
	}

	getBest(trackId) {
		return this.times[trackId] ?? null;
	}

	submit(trackId, time) {
		const best = this.getBest(trackId);
		if (best !== null && best <= time) {
			return false;
		}
		this.times[trackId] = time;
		this.save();
		return true;
	}

	reset(trackId) {
		delete this.times[trackId];
		this.save();
	}

	save() {
		saveJson(CONFIG.STORAGE_KEYS.records, this.times);
	}
}

export class Progress {
	constructor(leagues, records) {
		this.leagues = leagues;
		this.records = records;
		this.tracks = leagues.flatMap(league => league.tracks);
	}

	firstTrack() {
		return this.tracks[0];
	}

	findTrack(trackId) {
		return this.tracks.find(track => track.id === trackId);
	}

	nextTrack(trackId) {
		const index = this.indexOf(trackId);
		return index === -1 ? null : this.tracks[index + 1] ?? null;
	}

	indexOf(trackId) {
		return this.tracks.findIndex(track => track.id === trackId);
	}

	isCompleted(trackId) {
		return this.records.getBest(trackId) !== null;
	}

	isTrackOpen(trackId) {
		const index = this.indexOf(trackId);
		return index === 0 || this.isCompleted(this.tracks[index - 1].id);
	}

	isLeagueCompleted(leagueIndex) {
		return this.leagues[leagueIndex].tracks
			.every(track => this.isCompleted(track.id));
	}

	isBikeOpen(bikeIndex) {
		return bikeIndex === 0 || this.isLeagueCompleted(bikeIndex - 1);
	}
}

export class GhostRecorder {
	constructor(bikeIndex) {
		this.bikeIndex = bikeIndex;
		this.frames = [];
		this.nextTime = 0;
	}

	record(bike, time) {
		if (time < this.nextTime) {
			return;
		}
		this.frames.push(encodePose(bike.pose()));
		this.nextTime += 1 / CONFIG.GHOST_SAMPLE_RATE;
	}
}

class GhostPlayer {
	constructor(frames, model) {
		this.frames = frames;
		this.model = model;
	}

	poseAt(time) {
		const position = Math.max(time, 0) * CONFIG.GHOST_SAMPLE_RATE;
		const index = Math.floor(position);
		const last = this.frames.length - 1;
		if (index >= last) {
			return decodePose(this.frames[last], this.model);
		}
		const ratio = position - index;
		const next = this.frames[index + 1];
		const values = this.frames[index]
			.map((value, i) => value + (next[i] - value) * ratio);
		return decodePose(values, this.model);
	}
}

export class GhostStore {
	load(trackId) {
		const ghost = loadJson(ghostKey(trackId), null);
		return ghost && new GhostPlayer(ghost.frames, BIKE_MODELS[ghost.bike]);
	}

	save(trackId, recorder) {
		saveJson(ghostKey(trackId), {
			bike: recorder.bikeIndex,
			frames: recorder.frames,
		});
	}

	remove(trackId) {
		saveJson(ghostKey(trackId), null);
	}
}

function ghostKey(trackId) {
	return CONFIG.STORAGE_KEYS.ghostPrefix + trackId;
}

function encodePose({ rearWheel, frontWheel, frame, head }) {
	return [
		rearWheel.position.x, rearWheel.position.y, rearWheel.angle,
		frontWheel.position.x, frontWheel.position.y, frontWheel.angle,
		frame.x, frame.y,
		head.x, head.y,
	].map(value => Number(value.toFixed(GHOST_PRECISION)));
}

function decodePose(values, model) {
	const [rearX, rearY, rearAngle, frontX, frontY, frontAngle,
		frameX, frameY, headX, headY] = values;
	const radius = CONFIG.WHEEL_RADIUS * model.size;
	return new BikePose({
		model,
		rearWheel: {
			position: new Vector(rearX, rearY), angle: rearAngle, radius,
		},
		frontWheel: {
			position: new Vector(frontX, frontY), angle: frontAngle, radius,
		},
		frame: new Vector(frameX, frameY),
		head: new Vector(headX, headY),
	});
}
