export class PitchGraphFeature {
    constructor(container) {
        this.container = container;
        this.audioCtx = null;
        this.analyser = null;
        this.micStream = null;
        this.animFrameId = null;
        
        // Expanded history length for wider X-axis (~8-10 seconds of singing phrase history)
        this.pitchHistory = []; 
        this.maxHistoryLength = 350;

        // Dynamic Pitch Range (Y-Axis)
        this.targetMinFreq = 130; // ~C3
        this.targetMaxFreq = 523; // ~C5
        this.currentMinFreq = 130;
        this.currentMaxFreq = 523;

        this.isListening = false;
        this.noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    }

    render() {
        this.container.innerHTML = `
            <div class="bg-zinc-950 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                            📊 Dynamic Pitch Phrase Tracker
                        </h4>
                        <p class="text-[11px] text-zinc-400">Live scrolling graph with pitch note guides</p>
                    </div>
                    <button id="btnTogglePitchGraph" class="px-3.5 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-all">
                        Start Mic
                    </button>
                </div>

                <!-- Live Note Readout -->
                <div class="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2">
                    <div>
                        <span class="text-[10px] text-zinc-500 block uppercase font-medium">Current Pitch</span>
                        <span id="detectedNoteDisplay" class="text-xl font-extrabold text-amber-400">--</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-zinc-500 block uppercase font-medium">Frequency</span>
                        <span id="detectedFreqDisplay" class="text-sm font-mono text-zinc-300">0 Hz</span>
                    </div>
                </div>

                <!-- Wide Canvas Container -->
                <div class="relative w-full h-48 bg-zinc-900/90 rounded-xl border border-zinc-800/80 overflow-hidden">
                    <canvas id="pitchCanvas" class="w-full h-full block"></canvas>
                </div>
            </div>
        `;

        document.getElementById('btnTogglePitchGraph').addEventListener('click', () => this.toggleListening());
        this.initCanvas();
    }

    initCanvas() {
        const canvas = document.getElementById('pitchCanvas');
        if (!canvas) return;
        canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
        canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
        this.drawEmptyCanvas();
    }

    async toggleListening() {
        if (this.isListening) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;

            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            source.connect(this.analyser);

            this.isListening = true;
            const btn = document.getElementById('btnTogglePitchGraph');
            if (btn) {
                btn.innerText = "Stop Mic";
                btn.className = "px-3.5 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs rounded-xl hover:bg-rose-500/30 transition-all";
            }

            this.processAudio();
        } catch (err) {
            console.error("Microphone access error:", err);
            alert("Unable to access microphone. Please check permissions.");
        }
    }

    stop() {
        this.isListening = false;
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioCtx) {
            this.audioCtx.close();
        }

        const btn = document.getElementById('btnTogglePitchGraph');
        if (btn) {
            btn.innerText = "Start Mic";
            btn.className = "px-3.5 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-all";
        }

        const noteEl = document.getElementById('detectedNoteDisplay');
        const freqEl = document.getElementById('detectedFreqDisplay');
        if (noteEl) noteEl.innerText = "--";
        if (freqEl) freqEl.innerText = "0 Hz";

        this.drawEmptyCanvas();
    }

    processAudio() {
        if (!this.isListening) return;

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);

        const pitchHz = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

        if (pitchHz !== -1 && pitchHz >= 60 && pitchHz <= 1100) { // Vocal range (C2 to C6)
            const noteData = this.freqToNote(pitchHz);
            
            const noteEl = document.getElementById('detectedNoteDisplay');
            const freqEl = document.getElementById('detectedFreqDisplay');
            if (noteEl) noteEl.innerText = noteData.note;
            if (freqEl) freqEl.innerText = `${Math.round(pitchHz)} Hz`;

            this.pitchHistory.push(pitchHz);
            this.updateDynamicYBounds(pitchHz);
        } else {
            this.pitchHistory.push(null);
        }

        if (this.pitchHistory.length > this.maxHistoryLength) {
            this.pitchHistory.shift();
        }

        // Smooth transition for dynamic Y-axis bounds
        this.currentMinFreq += (this.targetMinFreq - this.currentMinFreq) * 0.1;
        this.currentMaxFreq += (this.targetMaxFreq - this.currentMaxFreq) * 0.1;

        this.drawGraph();
        this.animFrameId = requestAnimationFrame(() => this.processAudio());
    }

    // Adjust Y-axis scale smoothly based on singing register
    updateDynamicYBounds(latestPitch) {
        const validPitches = this.pitchHistory.filter(p => p !== null);
        if (validPitches.length < 5) return;

        const minRecorded = Math.min(...validPitches);
        const maxRecorded = Math.max(...validPitches);

        // Add 15% breathing room above and below
        this.targetMinFreq = Math.max(50, minRecorded * 0.85);
        this.targetMaxFreq = Math.min(1200, maxRecorded * 1.15);
    }

    autoCorrelate(buffer, sampleRate) {
        let SIZE = buffer.length;
        let rms = 0;

        for (let i = 0; i < SIZE; i++) {
            let val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        if (rms < 0.015) return -1; // Ignore background ambient noise

        let r1 = 0, r2 = SIZE - 1, thres = 0.2;
        for (let i = 0; i < SIZE / 2; i++) {
            if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < SIZE / 2; i++) {
            if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
        }

        buffer = buffer.slice(r1, r2);
        SIZE = buffer.length;

        let c = new Float32Array(SIZE);
        for (let i = 0; i < SIZE; i++) {
            for (let j = 0; j < SIZE - i; j++) {
                c[i] = c[i] + buffer[j] * buffer[j + i];
            }
        }

        let d = 0; while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < SIZE; i++) {
            if (c[i] > maxval) {
                maxval = c[i];
                maxpos = i;
            }
        }
        let T0 = maxpos;

        let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
        let a = (x1 + x3 - 2 * x2) / 2;
        let b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);

        return sampleRate / T0;
    }

    freqToNote(freq) {
        const midiNum = Math.round(12 * (Math.log(freq / 440) / Math.log(2))) + 69;
        const noteIndex = (midiNum % 12 + 12) % 12;
        const octave = Math.floor(midiNum / 12) - 1;
        return { note: `${this.noteNames[noteIndex]}${octave}`, midi: midiNum };
    }

    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    drawEmptyCanvas() {
        const canvas = document.getElementById('pitchCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#71717a";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Click 'Start Mic' to track singing phrases", canvas.width / 2, canvas.height / 2);
    }

    drawGraph() {
        const canvas = document.getElementById('pitchCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        const minF = this.currentMinFreq;
        const maxF = this.currentMaxFreq;

        // --- DRAW Y-AXIS GRID LINES WITH NOTE NAMES ---
        const minMidi = Math.ceil(12 * (Math.log(minF / 440) / Math.log(2)) + 69);
        const maxMidi = Math.floor(12 * (Math.log(maxF / 440) / Math.log(2)) + 69);

        ctx.lineWidth = 1;
        ctx.font = `${10 * (window.devicePixelRatio || 1)}px monospace`;
        ctx.textAlign = "left";

        for (let m = minMidi; m <= maxMidi; m++) {
            const freq = this.midiToFreq(m);
            const noteName = `${this.noteNames[(m % 12 + 12) % 12]}${Math.floor(m / 12) - 1}`;
            const isNatural = !noteName.includes('#');

            // Logarithmic mapping for musical pitch
            const y = h - ((Math.log2(freq) - Math.log2(minF)) / (Math.log2(maxF) - Math.log2(minF))) * h;

            if (y >= 10 && y <= h - 10) {
                ctx.strokeStyle = isNatural ? '#3f3f46' : '#27272a';
                ctx.beginPath();
                ctx.moveTo(35 * (window.devicePixelRatio || 1), y);
                ctx.lineTo(w, y);
                ctx.stroke();

                ctx.fillStyle = isNatural ? '#fbbf24' : '#71717a';
                ctx.fillText(noteName, 5 * (window.devicePixelRatio || 1), y + 3 * (window.devicePixelRatio || 1));
            }
        }

        // Y-axis separator
        ctx.strokeStyle = '#3f3f46';
        ctx.beginPath();
        ctx.moveTo(32 * (window.devicePixelRatio || 1), 0);
        ctx.lineTo(32 * (window.devicePixelRatio || 1), h);
        ctx.stroke();

        // --- DRAW PITCH TRAIL ---
        ctx.beginPath();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
        ctx.lineJoin = 'round';

        const paddingLeft = 35 * (window.devicePixelRatio || 1);
        const graphWidth = w - paddingLeft;
        const stepX = graphWidth / (this.maxHistoryLength - 1);

        let isDrawing = false;

        for (let i = 0; i < this.pitchHistory.length; i++) {
            const pitch = this.pitchHistory[i];
            const x = paddingLeft + (i * stepX);

            if (pitch !== null) {
                const clampedPitch = Math.min(Math.max(pitch, minF), maxF);
                const y = h - ((Math.log2(clampedPitch) - Math.log2(minF)) / (Math.log2(maxF) - Math.log2(minF))) * h;

                if (!isDrawing) {
                    ctx.moveTo(x, y);
                    isDrawing = true;
                } else {
                    ctx.lineTo(x, y);
                }
            } else {
                isDrawing = false;
            }
        }
        ctx.stroke();
    }

    destroy() {
        this.stop();
        this.container.innerHTML = '';
    }
}
