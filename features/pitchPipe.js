export class PitchPipeFeature {
    constructor(containerEl) {
        this.container = containerEl;
        this.audioCtx = null;
    }

    render() {
        this.container.innerHTML = `
            <div class="bg-zinc-950 border border-violet-500/30 p-4 rounded-2xl space-y-3">
                <h4 class="text-xs font-bold text-violet-400 flex items-center gap-1.5">🎵 Vocal Pitch Pipe</h4>
                <div class="flex flex-wrap gap-2">
                    ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map(note => `
                        <button class="pitch-pipe-btn px-3 py-1.5 bg-zinc-800 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-colors" data-note="${note}">
                            ${note}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        this.bindEvents();
    }

    bindEvents() {
        this.container.querySelectorAll('.pitch-pipe-btn').forEach(btn => {
            btn.addEventListener('click', () => this.playTone(btn.dataset.note));
        });
    }

    playTone(note) {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Play frequency logic here...
    }

    destroy() {
        // Cleanup AudioContext or event listeners when modal closes
        if (this.audioCtx) this.audioCtx.close();
        this.container.innerHTML = '';
    }
}
