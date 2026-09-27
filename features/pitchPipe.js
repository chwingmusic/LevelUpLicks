export class PitchPipeFeature {
    constructor(containerEl) {
        this.container = containerEl;
        this.audioCtx = null;
        this.activeOscillator = null;
        this.activeGainNode = null;
        this.activeNote = null;

        // Frequencies for Octave 4 reference tones
        this.frequencies = {
            "C": 261.63,  "C#": 277.18, "D": 293.66,  "D#": 311.13,
            "E": 329.63,  "F": 349.23,  "F#": 369.99, "G": 392.00,
            "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88
        };
    }

    render() {
        this.container.innerHTML = `
            <div class="bg-zinc-950 border border-violet-500/30 p-4 rounded-2xl space-y-3">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-violet-400 flex items-center gap-1.5">🎵 Vocal Pitch Pipe</h4>
                    <span id="pitchPipeStatus" class="text-[11px] font-mono text-zinc-500">Off</span>
                </div>
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

    async playTone(note) {
        // 1. Initialize audio context if not created yet
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 2. Resume context if suspended by browser autoplay policy
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        // 3. Toggle off if clicking the currently playing note
        if (this.activeNote === note) {
            this.stopTone();
            return;
        }

        // 4. Stop any currently active note before starting a new one
        this.stopTone();

        const freq = this.frequencies[note];
        if (!freq) return;

        // 5. Create Web Audio Nodes
        this.activeOscillator = this.audioCtx.createOscillator();
        this.activeGainNode = this.audioCtx.createGain();

        // Sine wave gives a clean, clear tone suitable for vocal reference
        this.activeOscillator.type = 'sine';
        this.activeOscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        // Smooth fade-in to prevent clicking artifacts
        this.activeGainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.activeGainNode.gain.linearRampToValueAtTime(0.3, this.audioCtx.currentTime + 0.05);

        // Connect nodes to speakers
        this.activeOscillator.connect(this.activeGainNode);
        this.activeGainNode.connect(this.audioCtx.destination);

        this.activeOscillator.start();
        this.activeNote = note;

        // 6. Update Button UI & Status Text
        const statusEl = this.container.querySelector('#pitchPipeStatus');
        if (statusEl) {
            statusEl.innerText = `Playing: ${note}`;
            statusEl.className = "text-[11px] font-mono font-bold text-violet-400";
        }

        this.container.querySelectorAll('.pitch-pipe-btn').forEach(btn => {
            if (btn.dataset.note === note) {
                btn.classList.add('bg-violet-600', 'ring-2', 'ring-violet-400');
                btn.classList.remove('bg-zinc-800');
            } else {
                btn.classList.remove('bg-violet-600', 'ring-2', 'ring-violet-400');
                btn.classList.add('bg-zinc-800');
            }
        });
    }

    stopTone() {
        if (this.activeGainNode && this.audioCtx) {
            // Smooth fade-out before stopping
            this.activeGainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.05);
            setTimeout(() => {
                if (this.activeOscillator) {
                    this.activeOscillator.stop();
                    this.activeOscillator.disconnect();
                    this.activeOscillator = null;
                }
            }, 50);
        }

        this.activeNote = null;

        const statusEl = this.container.querySelector('#pitchPipeStatus');
        if (statusEl) {
            statusEl.innerText = "Off";
            statusEl.className = "text-[11px] font-mono text-zinc-500";
        }

        this.container.querySelectorAll('.pitch-pipe-btn').forEach(btn => {
            btn.classList.remove('bg-violet-600', 'ring-2', 'ring-violet-400');
            btn.classList.add('bg-zinc-800');
        });
    }

    destroy() {
        this.stopTone();
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.container.innerHTML = '';
    }
}
