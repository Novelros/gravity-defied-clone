import { formatTime } from './hud.js';

const SCREEN_IDS = {
	menu: 'screen-menu',
	rules: 'screen-rules',
	pause: 'screen-pause',
	crash: 'screen-crash',
	finish: 'screen-finish',
};

const CUSTOM_MARK = '★';

const byId = id => document.getElementById(id);

export class Screens {
	constructor() {
		this.screens = Object.fromEntries(
			Object.entries(SCREEN_IDS).map(([name, id]) => [name, byId(id)])
		);
		this.bikePicker = byId('bike-picker');
		this.leagueList = byId('league-list');
		this.customTrack = byId('custom-track');
		this.finishTime = byId('finish-time');
		this.finishBest = byId('finish-best');
		this.finishRecord = byId('finish-record');
		this.finishUnlock = byId('finish-unlock');
		this.nextButton = byId('next-button');
		this.editorModes = [
			...document.querySelectorAll('[data-action="editor-mode"]'),
		];
	}

	show(name) {
		Object.entries(this.screens).forEach(([key, screen]) => {
			screen.hidden = key !== name;
		});
	}

	hide() {
		this.show(null);
	}

	showMenu({ bikes, leagues, custom }) {
		this.bikePicker.replaceChildren(...bikes.map(createBikeChip));
		let number = 0;
		const sections = leagues.map((league, index) => {
			const buttons = league.tracks.map(track =>
				createTrackButton(track, String(++number))
			);
			return createLeague(league.name, index, buttons);
		});
		this.leagueList.replaceChildren(...sections);
		const customButton = custom
			? [createTrackButton(custom, CUSTOM_MARK)]
			: [];
		this.customTrack.replaceChildren(...customButton);
		this.show('menu');
	}

	showFinish({ time, best, isRecord, hasNext, unlockedBike }) {
		this.finishTime.textContent = formatTime(time);
		this.finishBest.textContent = formatTime(best);
		this.finishRecord.hidden = !isRecord;
		this.finishUnlock.hidden = !unlockedBike;
		this.finishUnlock.textContent = unlockedBike
			? `Открыт мотоцикл ${unlockedBike}!`
			: '';
		this.nextButton.hidden = !hasNext;
		this.show('finish');
	}

	setEditorMode(mode) {
		this.editorModes.forEach(button => {
			button.classList.toggle('is-active', button.dataset.mode === mode);
		});
	}
}

function createBikeChip(bike) {
	const { index, name, color, isOpen, isSelected, lockedBy } = bike;
	const chip = document.createElement('button');
	chip.className = 'button bike-chip';
	chip.classList.toggle('is-active', isSelected);
	chip.style.setProperty('--bike-color', color);
	chip.dataset.action = 'bike';
	chip.dataset.bike = index;
	chip.disabled = !isOpen;
	chip.textContent = name;
	if (lockedBy) {
		chip.title = `Откроется после лиги «${lockedBy}»`;
	}
	return chip;
}

function createLeague(name, index, buttons) {
	const section = document.createElement('section');
	section.className = 'league';
	const title = document.createElement('h2');
	title.className = 'league-title';
	title.append(
		createText('league-number', `Лига ${index + 1}`),
		createText('league-name', name)
	);
	const list = document.createElement('div');
	list.className = 'level-list';
	list.append(...buttons);
	section.append(title, list);
	return section;
}

function createTrackButton({ id, name, best, isOpen }, mark) {
	const button = document.createElement('button');
	button.className = 'button level-button';
	button.dataset.action = 'start';
	button.dataset.track = id;
	button.disabled = !isOpen;
	button.append(
		createText('level-number', mark),
		createText('level-name', name),
		createText('level-best',
			best === null ? '—' : formatTime(best))
	);
	return button;
}

function createText(className, text) {
	const element = document.createElement('span');
	element.className = className;
	element.textContent = text;
	return element;
}
