export class GuitarTunerFeature {
    constructor(containerEl) {
        this.container = containerEl;
    }

    render() {
        this.container.innerHTML = `
            <div class="bg-zinc-950 border border-emerald-500/30 p-4 rounded-2xl text-xs space-y-2">
                <h4 class="font-bold text-emerald-400">🎸 Guitar Chromatic Tuner</h4>
                <div class="text-center font-mono text-lg text-white" id="tunerNoteDisplay">--</div>
                <button id="btnStartTuner" class="w-full py-1.5 bg-emerald-500/20 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/30">
                    🎤 Enable Mic Tuner
                </button>
            </div>
        `;
    }

    destroy() {
        this.container.innerHTML = '';
    }
}
