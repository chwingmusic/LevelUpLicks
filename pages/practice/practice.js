export function initPage() {
    console.log("Practice laboratory module active.");
    
    let audioCtx = null;
    let isPlaying = false;
    let bpm = 120;
    let timerId = null;

    const bpmDisplay = document.getElementById('metronomeBpmDisplay');
    const bpmSlider = document.getElementById('bpmSlider');
    const toggleBtn = document.getElementById('btnToggleMetronome');
    const btnMinus = document.getElementById('btnBpmMinus');
    const btnPlus = document.getElementById('btnBpmPlus');

    function playTick() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = 1000;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
    }

    function updateBpm(val) {
        bpm = Math.min(240, Math.max(40, val));
        if (bpmDisplay) bpmDisplay.innerText = bpm;
        if (bpmSlider) bpmSlider.value = bpm;
        if (isPlaying) {
            clearInterval(timerId);
            timerId = setInterval(playTick, (60 / bpm) * 1000);
        }
    }

    if (bpmSlider) bpmSlider.addEventListener('input', (e) => updateBpm(parseInt(e.target.value)));
    if (btnMinus) btnMinus.addEventListener('click', () => updateBpm(bpm - 5));
    if (btnPlus) btnPlus.addEventListener('click', () => updateBpm(bpm + 5));

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isPlaying = !isPlaying;
            if (isPlaying) {
                toggleBtn.innerText = "Pause Metronome ⏸";
                toggleBtn.className = "bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-sm px-8 py-2.5 rounded-xl border border-zinc-700";
                timerId = setInterval(playTick, (60 / bpm) * 1000);
            } else {
                toggleBtn.innerText = "Start Metronome ▶";
                toggleBtn.className = "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-sm px-8 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20";
                clearInterval(timerId);
            }
        });
    }

    // Populate topics dropdown
    const select = document.getElementById('practiceTopicSelect');
    if (select) {
        const topics = JSON.parse(localStorage.getItem('lul_topics') || '[]');
        select.innerHTML = topics.length ? topics.map(t => `<option value="${t.id}">${t.title} (${t.category})</option>`).join('') : '<option>Economy Picking Licks (Default)</option>';
    }

    // Practice Log Submit Action
    const logBtn = document.getElementById('btnSavePracticeSession');
    if (logBtn) {
        logBtn.addEventListener('click', () => {
            const topic = select ? select.value : 'Default Topic';
            const logBpm = document.getElementById('logBpmInput').value;
            const notes = document.getElementById('logNotes').value;
            alert(`Session Saved! Topic: ${topic} | Clean BPM: ${logBpm} | Notes: ${notes || 'None'}`);
            document.getElementById('logNotes').value = '';
        });
    }
}
