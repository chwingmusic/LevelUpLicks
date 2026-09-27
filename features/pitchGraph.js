export class PitchGraphFeature {
    constructor(container) {
        this.container = container;
        this.audioCtx = null;
        this.analyser = null;
        this.micStream = null;
        this.animFrameId = null;
        this.pitchHistory = []; // Stores recent pitch data points for scrolling graph
        this.maxHistoryLength = 150;
        this.isListening = false;
    }

    render() {
        this.container.innerHTML = `
            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider">🎙️ Real-Time Pitch Detector & Graph</h4>
                        <p class="text-[11px] text-zinc-400">Sing into your mic to track your pitch live</p>
                    </div>
                    <button id="btnTogglePitchGraph" class="px-3 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-colors">
                        Start Microphone
                    </button>
                </div>

                <!-- Display Info -->
                <div class="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 rounded-xl px-4 py-2">
                    <div>
                        <span class="text-[10px] text-zinc-500 block uppercase">Detected Note</span>
                        <span id="detectedNoteDisplay" class="text-xl font-extrabold text-amber-400">--</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-zinc-500 block uppercase">Frequency</span>
                        <span id="detectedFreqDisplay" class="text-sm font-mono text-zinc-300">0 Hz</span>
                    </div>
                </div>

                <!-- Live Rolling Canvas Graph -->
                <div class="relative w-full h-36 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
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
        // Handle high DPI displays
        canvas.width = canvas.clientWidth * window.devicePixelRatio || 600;
        canvas.height = canvas.clientHeight * window.devicePixelRatio || 150;
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
                btn.innerText = "Stop Microphone";
                btn.className = "px-3 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs rounded-xl hover:bg-rose-500/30 transition-colors";
            }

            this.processAudio();
        } catch (err) {
            console.error("Microphone access error:", err);
            alert("Could not access microphone. Please allow microphone permissions.");
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
            btn.innerText = "Start Microphone";
            btn.className = "px-3 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-colors";
        }

        document.getElementById('detectedNoteDisplay').innerText = "--";
        document.getElementById('detectedFreqDisplay').innerText = "0 Hz";
        this.drawEmptyCanvas();
    }

    processAudio() {
        if (!this.isListening) return;

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);

        const pitchHz = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

        if (pitchHz !== -1 && pitchHz > 50 && pitchHz < 1200) { // Singing range: ~50Hz - 1200Hz
            const noteData = this.freqToNote(pitchHz);
            document.getElementById('detectedNoteDisplay').innerText = noteData.note;
            document.getElementById('detectedFreqDisplay').innerText = `${Math.round(pitchHz)} Hz`;
            this.pitchHistory.push(pitchHz);
        } else {
            this.pitchHistory.push(null); // Silent / Unvoiced frame
        }

        if (this.pitchHistory.length > this.maxHistoryLength) {
            this.pitchHistory.shift();
        }

        this.drawGraph();
        this.animFrameId = requestAnimationFrame(() => this.processAudio());
    }

    // Autocorrelation algorithm to find fundamental frequency (pitch)
    autoCorrelate(buffer, sampleRate) {
        let SIZE = buffer.length;
        let rms = 0;

        for (let i = 0; i < SIZE; i++) {
            let val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        if (rms < 0.01) return -1; // Volume too low

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
        const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const midiNum = Math.round(12 * (Math.log(freq / 440) / Math.log(2))) + 69;
        const noteIndex = (midiNum % 12 + 12) % 12;
        const octave = Math.floor(midiNum / 12) - 1;
        return { note: `${noteNames[noteIndex]}${octave}`, midi: midiNum };
    }

    drawEmptyCanvas() {
        const canvas = document.getElementById('pitchCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#52525b";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Click 'Start Microphone' to begin pitch tracking", canvas.width / 2, canvas.height / 2);
    }

    drawGraph() {
        const canvas = document.getElementById('pitchCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Grid lines (Min 80Hz ~ C2, Max 800Hz ~ G5)
        const minFreq = 80;
        const maxFreq = 800;

        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1;
        for (let f = 100; f <= 700; f += 100) {
            const y = h - ((f - minFreq) / (maxFreq - minFreq)) * h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Pitch Line
        ctx.beginPath();
        ctx.strokeStyle = '#f59e0b'; // Amber-500
        ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
        ctx.lineJoin = 'round';

        let isDrawing = false;
        const stepX = w / (this.maxHistoryLength - 1);

        for (let i = 0; i < this.pitchHistory.length; i++) {
            const pitch = this.pitchHistory[i];
            const x = i * stepX;

            if (pitch !== null) {
                // Map pitch on log scale for equal musical interval representation
                const clampedPitch = Math.min(Math.max(pitch, minFreq), maxFreq);
                const y = h - ((clampedPitch - minFreq) / (maxFreq - minFreq)) * h;

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
    }
}
