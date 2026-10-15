export function formatTime(seconds) {
	const totalHundredths = Math.floor(seconds * 100);
	const minutes = Math.floor(totalHundredths / 6000);
	const secondsPart = Math.floor(totalHundredths / 100) % 60;
	const hundredths = totalHundredths % 100;
	const pad = value => String(value).padStart(2, '0');
	return `${minutes}:${pad(secondsPart)}.${pad(hundredths)}`;
}

export class Hud {
	constructor() {
		this.levelLabel = document.getElementById('hud-level');
		this.timeLabel = document.getElementById('hud-time');
		this.shownTime = '';
	}

	setState(state) {
		document.body.dataset.state = state;
	}

	setLevel(name) {
		this.levelLabel.textContent = name;
	}

	setTime(seconds) {
		const text = formatTime(seconds);
		if (text === this.shownTime) {
			return;
		}
		this.shownTime = text;
		this.timeLabel.textContent = text;
	}
}
