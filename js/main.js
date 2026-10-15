import { TrackEditor } from './editor/track-editor.js';
import { Game } from './game/game.js';
import { GameLoop } from './game/game-loop.js';
import { GhostStore, Progress, Records } from './game/results.js';
import { InputManager, JoystickInput, KeyboardInput } from './input.js';
import { Renderer } from './render/renderer.js';
import { LEAGUES } from './track/levels.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

const byId = id => document.getElementById(id);

const canvas = byId('game-canvas');
const keyboard = new KeyboardInput();
const joystick = new JoystickInput(byId('joystick'), byId('joystick-knob'));
const records = new Records();
const editor = new TrackEditor(canvas);
const screens = new Screens();

const game = new Game({
	input: new InputManager([keyboard, joystick]),
	renderer: new Renderer(canvas),
	hud: new Hud(),
	screens,
	records,
	ghosts: new GhostStore(),
	progress: new Progress(LEAGUES, records),
	editor,
});

keyboard.onAction(action => game.handleAction(action));

bindActions(document.body, {
	start: ({ track }) => game.startTrack(track),
	bike: ({ bike }) => game.selectBike(Number(bike)),
	pause: () => game.togglePause(),
	resume: () => game.resume(),
	restart: () => game.restart(),
	next: () => game.nextTrack(),
	menu: () => game.showMenu(),
	rules: () => screens.show('rules'),
	editor: () => game.openEditor(),
	'editor-mode': ({ mode }) => {
		editor.setMode(mode);
		screens.setEditorMode(mode);
	},
	'editor-add': ({ section }) => editor.addSection(section),
	'editor-undo': () => editor.undo(),
	'editor-clear': () => editor.clear(),
	'editor-ride': () => game.rideCustomTrack(),
});

document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		game.pause();
	}
});

new GameLoop(
	dt => game.update(dt),
	(dt, blend) => game.render(dt, blend)
).start();

function bindActions(root, handlers) {
	root.addEventListener('click', event => {
		const button = event.target.closest('[data-action]');
		if (!button) {
			return;
		}
		button.blur();
		handlers[button.dataset.action](button.dataset);
	});
}
