import { gatewayAuth, gatewayDb } from '../../main.js';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

const KEYS_LIST = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
const MODES_LIST = ["Ionian (Major)", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian (Minor)", "Locrian", "Harmonic Minor", "Melodic Minor"];

let activeUser = null;
let personalDb = null;
let currentSelectedDate = "";
let currentInstrument = "";
let activeCatalog = [];
let activeSessionItems = [];
let activeCardEditing = null;

// Audio & Timer State
let audioCtx = null;
let metronomeInterval = null;
let isMetronomePlaying = false;
let isTimerRunning = false;
let timerInterval = null;
let elapsedSeconds = 0;

function getLogicalDateString(dateObj = new Date()) {
    const adjusted = new Date(dateObj.getTime() - (4 * 60 * 60 * 1000));
    return adjusted.toISOString().split('T')[0];
}

export async function initPage() {
    activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    personalDb = await getPersonalDatabaseInstance(activeUser);

    currentSelectedDate = getLogicalDateString();
    document.getElementById('practiceDatePicker').value = currentSelectedDate;

    await setupInstrumentOptions();
    setupEventListeners();
    await loadDailySession();
}

async function getPersonalDatabaseInstance(user) {
    try {
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", user.uid));
        if (snapshot.exists()) {
            const configKeys = snapshot.data();
            const existingApps = getApps();
            let personalApp = existingApps.find(a => a.name === "userPersonalInstance");
            if (!personalApp) {
                personalApp = initializeApp(configKeys, "userPersonalInstance");
            }
            return getFirestore(personalApp);
        }
    } catch (e) {
        console.error("Personal DB Error:", e);
    }
    return gatewayDb;
}

async function setupInstrumentOptions() {
    const instSelect = document.getElementById('practiceInstrumentSelect');
    
    // Path to user settings
    const settingsRef = doc(personalDb || gatewayDb, `users/${activeUser.uid}/settings`, "practice_config");
    const fallbackRef = doc(personalDb || gatewayDb, `users/${activeUser.uid}/settings`, "dropdown_options");
    
    let userInstruments = [];

    try {
        // 1. Try reading the user's explicit practice configuration
        const snap = await getDoc(settingsRef);
        if (snap.exists() && snap.data().activeInstruments && snap.data().activeInstruments.length > 0) {
            userInstruments = snap.data().activeInstruments;
        } else {
            // 2. Fallback to general dropdown options if practice_config isn't set
            const fallbackSnap = await getDoc(fallbackRef);
            if (fallbackSnap.exists() && fallbackSnap.data().instruments && fallbackSnap.data().instruments.length > 0) {
                userInstruments = fallbackSnap.data().instruments;
            }
        }
    } catch (e) {
        console.error("Error fetching user instrument config:", e);
    }

    // 3. Fallback default if no configuration is found in DB
    if (userInstruments.length === 0) {
        userInstruments = ["Electric Guitar"];
    }

    // Populate ONLY the user's configured instruments
    instSelect.innerHTML = userInstruments.map(i => `<option value="${i}">${i}</option>`).join('');
    currentInstrument = instSelect.value;

    // Trigger load when switching between configured instruments
    instSelect.addEventListener('change', async () => {
        currentInstrument = instSelect.value;
        await loadDailySession();
    });
}

function setupEventListeners() {
    document.getElementById('practiceDatePicker').addEventListener('change', async (e) => {
        currentSelectedDate = e.target.value;
        await loadDailySession();
    });

    document.getElementById('btnAddTopicManual').addEventListener('click', openAddTopicModal);
    document.getElementById('btnCloseTopicModal').addEventListener('click', () => {
        document.getElementById('addTopicModal').classList.add('hidden');
    });

    document.getElementById('btnGenerateRoutine').addEventListener('click', generateRandomRoutine);
    document.getElementById('btnClearRoutine').addEventListener('click', clearDailyRoutine);

    document.getElementById('btnCloseFocusModal').addEventListener('click', closeFocusModal);
    document.getElementById('btnSaveCardPartial').addEventListener('click', () => saveFocusCard(false));
    document.getElementById('btnCompleteCard').addEventListener('click', () => saveFocusCard(true));

    // Metronome BPM Sync
    const bpmSlider = document.getElementById('metroBpmSlider');
    const singleBpmInput = document.getElementById('focusSingleBpm');

    bpmSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('metroBpmDisplay').innerText = `${val} BPM`;
        singleBpmInput.value = val;
        if (isMetronomePlaying) restartMetronome();
    });

    singleBpmInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) || 120;
        bpmSlider.value = val;
        document.getElementById('metroBpmDisplay').innerText = `${val} BPM`;
        if (isMetronomePlaying) restartMetronome();
    });

    document.getElementById('focusTimeSigSelect').addEventListener('change', updateMetronomePulseLabel);
    document.getElementById('btnToggleMetronome').addEventListener('click', toggleMetronome);

    // Simplified Stopwatch Toggle & Reset
    document.getElementById('btnToggleTimer').addEventListener('click', toggleTimer);
    document.getElementById('btnResetTimer').addEventListener('click', resetTimer);
}

async function loadDailySession() {
    const dbToUse = personalDb || gatewayDb;
    const sessionPath = `users/${activeUser.uid}/practice_sessions/${currentSelectedDate}_${encodeURIComponent(currentInstrument)}/items`;

    try {
        const snap = await getDocs(collection(dbToUse, sessionPath));
        activeSessionItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderSessionDeck();
        updateDailyStats();
    } catch (err) {
        console.error("Error loading session:", err);
    }
}

function formatCardTitle(item) {
    const keyStr = item.key && item.key !== '(None)' ? item.key : '';
    const modeStr = item.mode && item.mode !== '(None)' ? item.mode : '';
    const timeSigStr = item.timeSignature && item.timeSignature !== '(None)' ? item.timeSignature : '';
    const bpmStr = item.targetBpm ? `${item.targetBpm} BPM` : '';

    const metaParts = [keyStr, modeStr, timeSigStr, bpmStr].filter(Boolean).join(' ');
    return metaParts ? `${item.title} — ${metaParts}` : item.title;
}

function renderSessionDeck() {
    const container = document.getElementById('practiceCardDeck');

    if (activeSessionItems.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded-3xl">
                <p class="text-xs text-zinc-500">No topics scheduled for ${currentInstrument} on ${currentSelectedDate}.</p>
                <p class="text-xs text-amber-500/80 mt-1">Click "Add Topic" or "Auto-Generate Routine" to start!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activeSessionItems.map(item => `
        <div onclick="openFocusModal('${item.id}')" class="cursor-pointer bg-zinc-900/70 hover:bg-zinc-900 border ${item.completed ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-zinc-800/80'} rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all hover:border-zinc-700">
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded ${item.completed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">${item.tag || 'Routine'}</span>
                    <span class="text-xs font-semibold ${item.completed ? 'text-emerald-400' : 'text-zinc-500'}">${item.completed ? '✅ Done' : '⏳ Pending'}</span>
                </div>
                <h4 class="text-sm font-bold text-white tracking-tight leading-snug">${formatCardTitle(item)}</h4>
                <p class="text-xs text-zinc-400">${item.category} • ${item.subCategory || 'General'}</p>
            </div>
            <div class="border-t border-zinc-800/60 pt-2 flex items-center justify-between text-[11px] text-zinc-400">
                <span>⏱️ ${item.durationMins || 0} mins spent</span>
                <span class="text-amber-400 font-semibold hover:underline">Practice →</span>
            </div>
        </div>
    `).join('');
}

function updateDailyStats() {
    const completed = activeSessionItems.filter(x => x.completed).length;
    const totalMins = activeSessionItems.reduce((acc, x) => acc + (parseInt(x.durationMins) || 0), 0);

    document.getElementById('statCompletedCount').innerText = `${completed}/${activeSessionItems.length}`;
    document.getElementById('statTotalTime').innerText = `${totalMins}m`;
}

async function generateRandomRoutine() {
    const dbToUse = personalDb || gatewayDb;
    const snap = await getDocs(collection(dbToUse, `users/${activeUser.uid}/topics`));
    // Filter catalog by instrument AND require the "Daily Routine" tag
    const catalog = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => (!t.instrument || t.instrument === currentInstrument) && t.tag === 'Daily Routine');

    if (catalog.length === 0) {
        alert(`No topics found for ${currentInstrument} in catalog.`);
        return;
    }

    const count = parseInt(prompt("How many practice topics would you like to generate?", "5")) || 5;
    const sessionPath = `users/${activeUser.uid}/practice_sessions/${currentSelectedDate}_${encodeURIComponent(currentInstrument)}/items`;

    for (let i = 0; i < count; i++) {
        const randomTopic = catalog[Math.floor(Math.random() * catalog.length)];
        const randomKey = KEYS_LIST[Math.floor(Math.random() * KEYS_LIST.length)];
        const randomMode = MODES_LIST[Math.floor(Math.random() * MODES_LIST.length)];

        const itemPayload = {
            topicId: randomTopic.id,
            title: randomTopic.title,
            category: randomTopic.category,
            subCategory: randomTopic.subCategory || '',
            tag: randomTopic.tag || 'Routine',
            key: randomTopic.key && randomTopic.key !== '(None)' ? randomTopic.key : randomKey,
            mode: randomTopic.mode && randomTopic.mode !== '(None)' ? randomTopic.mode : randomMode,
            timeSignature: randomTopic.timeSignature || '4/4',
            targetMinutes: randomTopic.targetMinutes || 15,
            targetBpm: randomTopic.targetBpm || 120,
            resourceUrl: randomTopic.resourceUrl || '',
            notes: randomTopic.notes || '',
            attachments: randomTopic.attachments || [],
            completed: false,
            durationMins: 0,
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(collection(dbToUse, sessionPath)), itemPayload);
    }

    await loadDailySession();
}

async function clearDailyRoutine() {
    if (!confirm("Are you sure you want to clear all practice cards for today?")) return;
    const dbToUse = personalDb || gatewayDb;
    const sessionPath = `users/${activeUser.uid}/practice_sessions/${currentSelectedDate}_${encodeURIComponent(currentInstrument)}/items`;

    for (let item of activeSessionItems) {
        await deleteDoc(doc(dbToUse, `${sessionPath}/${item.id}`));
    }
    await loadDailySession();
}

async function openAddTopicModal() {
    const dbToUse = personalDb || gatewayDb;
    const snap = await getDocs(collection(dbToUse, `users/${activeUser.uid}/topics`));
    activeCatalog = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.instrument || t.instrument === currentInstrument);

    const listContainer = document.getElementById('topicSelectionList');
    document.getElementById('addTopicModal').classList.remove('hidden');

    listContainer.innerHTML = activeCatalog.map(t => `
        <div onclick="addSingleTopicToSession('${t.id}')" class="cursor-pointer bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 p-3 rounded-xl flex items-center justify-between transition-colors">
            <div>
                <h5 class="text-xs font-bold text-white">${t.title}</h5>
                <p class="text-[10px] text-zinc-400">${t.category} • ${t.subCategory || 'General'}</p>
            </div>
            <span class="text-xs text-amber-400 font-bold">+ Add</span>
        </div>
    `).join('');
}

window.addSingleTopicToSession = async (topicId) => {
    const t = activeCatalog.find(x => x.id === topicId);
    if (!t) return;

    const dbToUse = personalDb || gatewayDb;
    const sessionPath = `users/${activeUser.uid}/practice_sessions/${currentSelectedDate}_${encodeURIComponent(currentInstrument)}/items`;

    const itemPayload = {
        topicId: t.id,
        title: t.title,
        category: t.category,
        subCategory: t.subCategory || '',
        tag: t.tag || 'Routine',
        key: t.key || '(None)',
        mode: t.mode || '(None)',
        timeSignature: t.timeSignature || '4/4',
        targetMinutes: t.targetMinutes || 15,
        targetBpm: t.targetBpm || 120,
        resourceUrl: t.resourceUrl || '',
        notes: t.notes || '',
        attachments: t.attachments || [],
        completed: false,
        durationMins: 0,
        createdAt: new Date().toISOString()
    };

    await setDoc(doc(collection(dbToUse, sessionPath)), itemPayload);
    document.getElementById('addTopicModal').classList.add('hidden');
    await loadDailySession();
};

// Open Practice Workspace Modal
window.openFocusModal = (cardId) => {
    activeCardEditing = activeSessionItems.find(x => x.id === cardId);
    if (!activeCardEditing) return;

    document.getElementById('focusTitle').innerText = activeCardEditing.title;
    document.getElementById('focusTag').innerText = activeCardEditing.tag || 'Routine';
    document.getElementById('focusCategory').innerText = `${activeCardEditing.category} • ${activeCardEditing.subCategory || 'General'}`;

    fillSelectOptions('focusKeySelect', KEYS_LIST, activeCardEditing.key);
    fillSelectOptions('focusModeSelect', MODES_LIST, activeCardEditing.mode);
    fillSelectOptions('focusTimeSigSelect', ["4/4", "3/4", "6/8", "12/8", "5/4", "7/8"], activeCardEditing.timeSignature);

    const initialBpm = activeCardEditing.targetBpm || 120;
    document.getElementById('focusTargetMins').value = activeCardEditing.targetMinutes || 15;
    document.getElementById('focusSingleBpm').value = initialBpm;
    document.getElementById('metroBpmSlider').value = initialBpm;
    document.getElementById('metroBpmDisplay').innerText = `${initialBpm} BPM`;

    document.getElementById('focusDurationMins').value = activeCardEditing.durationMins || '';
    document.getElementById('focusSessionNotes').value = activeCardEditing.sessionNotes || activeCardEditing.notes || '';

    // Render Attachments
    const resContainer = document.getElementById('focusResourcesContainer');
    resContainer.innerHTML = `
        ${activeCardEditing.resourceUrl ? `<p>🔗 <strong>URL:</strong> <a href="${activeCardEditing.resourceUrl}" target="_blank" class="text-amber-400 underline">${activeCardEditing.resourceUrl}</a></p>` : ''}
        ${activeCardEditing.attachments && activeCardEditing.attachments.length > 0 ? `
            <div class="space-y-1">
                <strong>Attachments:</strong>
                <div class="flex flex-wrap gap-2">
                    ${activeCardEditing.attachments.map(a => `<a href="${a.data}" download="${a.name}" class="bg-zinc-800 text-amber-300 border border-zinc-700 px-2 py-1 rounded text-[10px]">📄 ${a.name}</a>`).join('')}
                </div>
            </div>
        ` : ''}
    `;

    updateMetronomePulseLabel();
    resetTimer(); // Timer initialized at 00:00 without auto-starting

    document.getElementById('focusPracticeModal').classList.remove('hidden');
};

function fillSelectOptions(elementId, list, selected) {
    const el = document.getElementById(elementId);
    el.innerHTML = ['(None)', ...list].map(i => `<option value="${i}" ${i === selected ? 'selected' : ''}>${i}</option>`).join('');
}

function closeFocusModal() {
    stopTimer();
    stopMetronome();
    document.getElementById('focusPracticeModal').classList.add('hidden');
}

async function saveFocusCard(isCompleted) {
    if (!activeCardEditing) return;

    const manualMins = parseInt(document.getElementById('focusDurationMins').value) || Math.ceil(elapsedSeconds / 60);

    const payload = {
        key: document.getElementById('focusKeySelect').value,
        mode: document.getElementById('focusModeSelect').value,
        timeSignature: document.getElementById('focusTimeSigSelect').value,
        targetMinutes: parseInt(document.getElementById('focusTargetMins').value) || 15,
        targetBpm: parseInt(document.getElementById('focusSingleBpm').value) || 120,
        durationMins: manualMins,
        sessionNotes: document.getElementById('focusSessionNotes').value.trim(),
        completed: isCompleted,
        updatedAt: new Date().toISOString()
    };

    const dbToUse = personalDb || gatewayDb;
    const itemPath = `users/${activeUser.uid}/practice_sessions/${currentSelectedDate}_${encodeURIComponent(currentInstrument)}/items/${activeCardEditing.id}`;

    await setDoc(doc(dbToUse, itemPath), payload, { merge: true });

    closeFocusModal();
    await loadDailySession();
}

// Time Signature & Metronome Pulse Logic
function updateMetronomePulseLabel() {
    const sig = document.getElementById('focusTimeSigSelect').value;
    const label = document.getElementById('metroPulseNoteType');

    if (sig === '6/8' || sig === '12/8') {
        label.innerText = '♩. = Dotted Quarter Note';
    } else {
        label.innerText = '♩ = Quarter Note';
    }
}

function toggleMetronome() {
    if (isMetronomePlaying) stopMetronome();
    else startMetronome();
}

function restartMetronome() {
    if (isMetronomePlaying) {
        stopMetronome();
        startMetronome();
    }
}

function startMetronome() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    isMetronomePlaying = true;

    const btn = document.getElementById('btnToggleMetronome');
    btn.innerText = "⏸ Stop Metronome";
    btn.className = "w-full py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-400 transition-colors";

    const playPulse = () => {
        const bpm = parseInt(document.getElementById('metroBpmSlider').value) || 120;
        const timeSig = document.getElementById('focusTimeSigSelect').value;

        // Interval calculation based on meter
        let intervalMs;
        if (timeSig === '6/8' || timeSig === '12/8') {
            // Compound meter: BPM represents dotted quarter notes
            intervalMs = (60 / bpm) * 1000;
        } else {
            // Simple meter: BPM represents quarter notes
            intervalMs = (60 / bpm) * 1000;
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.frequency.value = 1000;
        gain.gain.value = 0.8;

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);

        const indicator = document.getElementById('metroBeatIndicator');
        indicator.className = "h-3 w-3 rounded-full bg-amber-400 shadow-md shadow-amber-400/50";
        setTimeout(() => {
            indicator.className = "h-3 w-3 rounded-full bg-zinc-700 transition-all";
        }, 100);

        metronomeInterval = setTimeout(playPulse, intervalMs);
    };

    playPulse();
}

function stopMetronome() {
    isMetronomePlaying = false;
    clearTimeout(metronomeInterval);
    const btn = document.getElementById('btnToggleMetronome');
    if (btn) {
        btn.innerText = "▶ Start Metronome";
        btn.className = "w-full py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition-colors";
    }
}

// Stopwatch Control Logic
function toggleTimer() {
    if (isTimerRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    isTimerRunning = true;
    const btn = document.getElementById('btnToggleTimer');
    btn.innerText = "⏸ Pause Timer";
    btn.className = "flex-1 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-xs hover:bg-amber-500/30";

    timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;

    const btn = document.getElementById('btnToggleTimer');
    if (btn) {
        btn.innerText = "▶ Start Timer";
        btn.className = "flex-1 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs hover:bg-emerald-500/30";
    }

    // Auto-update duration spent upon stopping/pausing stopwatch
    if (elapsedSeconds > 0) {
        const computedMins = Math.ceil(elapsedSeconds / 60);
        document.getElementById('focusDurationMins').value = computedMins;
    }
}

function resetTimer() {
    stopTimer();
    elapsedSeconds = 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    document.getElementById('focusTimerDisplay').innerText = `${mins}:${secs}`;
}

let currentActiveFeatureInstance = null;

async function loadInstrumentFeatures(instrument, topicTag) {
    const container = document.getElementById('dynamicFeatureContainer');
    
    // 1. Clean up any previously loaded feature module
    if (currentActiveFeatureInstance && typeof currentActiveFeatureInstance.destroy === 'function') {
        currentActiveFeatureInstance.destroy();
        currentActiveFeatureInstance = null;
    }

    // 2. Import modules directly from the root `/features/` folder
    try {
        if (instrument === 'Vocals') {
            // Path: pages/practice/ -> practice/ -> root / features / pitchPipe.js
            const { PitchPipeFeature } = await import('../../features/pitchPipe.js');
            currentActiveFeatureInstance = new PitchPipeFeature(container);
            currentActiveFeatureInstance.render();

        } else if (['Electric Guitar', 'Acoustic Guitar', 'Bass Guitar'].includes(instrument)) {
            const { GuitarTunerFeature } = await import('../../features/guitarTuner.js');
            currentActiveFeatureInstance = new GuitarTunerFeature(container);
            currentActiveFeatureInstance.render();

        } else if (topicTag === 'Scale Pitch Analysis') {
            const { PitchGraphFeature } = await import('../../features/pitchGraph.js');
            currentActiveFeatureInstance = new PitchGraphFeature(container);
            currentActiveFeatureInstance.render();
        }
    } catch (err) {
        console.error("Failed to load root feature module:", err);
    }
}
