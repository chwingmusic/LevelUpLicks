import { gatewayAuth, gatewayDb } from '../../main.js';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

const KEYS_LIST = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
const MODES_LIST = ["Ionian (Major)", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian (Minor)", "Locrian", "Harmonic Minor", "Melodic Minor"];

let activeUser = null;
let personalDb = null;
let songsCatalog = [];
let editingSongId = null;
let currentAttachments = [];

export async function initPage() {
    activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    personalDb = await getPersonalDatabaseInstance(activeUser);

    fillSelectOptions('songKeySelect', KEYS_LIST);
    fillSelectOptions('songModeSelect', MODES_LIST);

    await setupInstrumentOptions();
    setupEventListeners();
    await loadSongs();
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
    const dbToUse = personalDb || gatewayDb;
    let detectedInstruments = [];

    try {
        const snap = await getDocs(collection(dbToUse, `users/${activeUser.uid}/topics`));
        const instrumentSet = new Set();
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.instrument && data.instrument.trim() !== '') {
                instrumentSet.add(data.instrument.trim());
            }
        });
        detectedInstruments = Array.from(instrumentSet).sort();
    } catch (e) {
        console.error("Error detecting instruments:", e);
    }

    if (detectedInstruments.length === 0) {
        detectedInstruments = ["Electric Guitar", "Bass Guitar", "Vocals"];
    }

    const selectModal = document.getElementById('songInstrumentSelect');
    const selectFilter = document.getElementById('songInstrumentFilter');

    selectModal.innerHTML = detectedInstruments.map(i => `<option value="${i}">${i}</option>`).join('');
    selectFilter.innerHTML = `<option value="ALL">All Instruments</option>` + 
        detectedInstruments.map(i => `<option value="${i}">${i}</option>`).join('');
}

function setupEventListeners() {
    document.getElementById('btnAddNewSong').addEventListener('click', () => openSongModal(null));
    document.getElementById('btnCloseSongModal').addEventListener('click', closeSongModal);
    document.getElementById('btnCancelSongModal').addEventListener('click', closeSongModal);
    document.getElementById('songForm').addEventListener('submit', handleSaveSong);
    document.getElementById('btnDeleteSong').addEventListener('click', handleDeleteSong);

    document.getElementById('songSearchInput').addEventListener('input', renderSongGrid);
    document.getElementById('songInstrumentFilter').addEventListener('change', renderSongGrid);

    // Live rating display update & score recalculation
    const ratingInput = document.getElementById('songUserRatingInput');
    ratingInput.addEventListener('input', (e) => {
        document.getElementById('ratingValDisplay').innerText = `${e.target.value} / 5`;
        updateMasteryScorePreview();
    });

    document.getElementById('songTargetBpmInput').addEventListener('input', updateMasteryScorePreview);
    document.getElementById('songMasteredBpmInput').addEventListener('input', updateMasteryScorePreview);

    // Multiple file uploads handler (Convert to Base64)
    document.getElementById('songSheetFileInput').addEventListener('change', handleFileUploads);
}

async function loadSongs() {
    const dbToUse = personalDb || gatewayDb;
    try {
        const snap = await getDocs(collection(dbToUse, `users/${activeUser.uid}/songs`));
        songsCatalog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderSongGrid();
    } catch (err) {
        console.error("Error loading songs:", err);
    }
}

/**
 * Calculates Mastery Score (0 - 10)
 * 50% = (Mastered BPM / Target BPM) capped at 5.0
 * 50% = User Input Rating (0.0 to 5.0)
 */
function calculateMasteryLevel(targetBpm, masteredBpm, userRating) {
    const target = parseFloat(targetBpm) || 120;
    const mastered = parseFloat(masteredBpm) || 0;
    const rating = parseFloat(userRating) || 0;

    const bpmRatio = Math.min(mastered / target, 1.0);
    const bpmScore = bpmRatio * 5.0;

    const total = (bpmScore + rating).toFixed(1);
    return Math.min(parseFloat(total), 10.0);
}

function updateMasteryScorePreview() {
    const target = document.getElementById('songTargetBpmInput').value;
    const mastered = document.getElementById('songMasteredBpmInput').value;
    const rating = document.getElementById('songUserRatingInput').value;

    const score = calculateMasteryLevel(target, mastered, rating);
    document.getElementById('calculatedMasteryScore').innerText = `${score} / 10`;
}

function renderSongGrid() {
    const grid = document.getElementById('songCardGrid');
    const searchTerm = document.getElementById('songSearchInput').value.trim().toLowerCase();
    const instFilter = document.getElementById('songInstrumentFilter').value;

    // Filter by Instrument & Search Keyword
    let filtered = songsCatalog.filter(song => {
        const matchInst = instFilter === 'ALL' || song.instrument === instFilter;
        const matchText = song.title.toLowerCase().includes(searchTerm) || 
                          (song.notes && song.notes.toLowerCase().includes(searchTerm));
        return matchInst && matchText;
    });

    // Sort songs A-Z alphabetically by title
    filtered.sort((a, b) => a.title.localeCompare(b.title));

    document.getElementById('songCountBadge').innerText = `${filtered.length} Songs`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded-3xl">
                <p class="text-xs text-zinc-500">No songs found in your repertoire.</p>
                <p class="text-xs text-amber-500/80 mt-1">Click "+ Add New Song" to build your song list!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(song => {
        const masteryScore = calculateMasteryLevel(song.targetBpm, song.masteredBpm, song.userRating);
        
        return `
            <div class="bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all shadow-md">
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">${song.instrument}</span>
                        <span class="text-xs font-black text-amber-400 bg-zinc-950 px-2 py-0.5 rounded-lg border border-zinc-800">
                            ⭐ ${masteryScore} / 10
                        </span>
                    </div>

                    <h4 class="text-sm font-bold text-white tracking-tight leading-snug cursor-pointer hover:text-amber-400" onclick="openSongModal('${song.id}')">
                        ${song.title}
                    </h4>

                    // Inside renderSongGrid() in songlist.js
                    <div class="text-[11px] text-zinc-400 space-y-1">
                        <p>🎵 Key: <strong class="text-zinc-200">${song.key || 'N/A'} ${song.mode && song.mode !== '(None)' ? song.mode : ''} (${song.timeSignature || '4/4'})</strong></p>
                        <p>⚡ BPM: <strong class="text-zinc-200">${song.masteredBpm || 0} / ${song.targetBpm} BPM</strong></p>
                    </div>
                </div>

                <!-- Attachments & Links Bar -->
                <div class="border-t border-zinc-800/80 pt-3 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1 overflow-x-auto max-w-[70%]">
                        ${song.videoLink ? `
                            <a href="${song.videoLink}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                                🎬 Video ↗
                            </a>
                        ` : ''}

                        ${song.attachments && song.attachments.length > 0 ? song.attachments.map((a, idx) => `
                            <button type="button" onclick="event.stopPropagation(); openSheetFile('${song.id}',${idx})" class="bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 px-2 py-1 rounded text-[10px] cursor-pointer flex items-center gap-1 shrink-0">
                                📄 ${a.name}
                            </button>
                        `).join('') : ''}
                    </div>

                    <button onclick="openSongModal('${song.id}')" class="text-xs text-amber-400 font-bold hover:underline shrink-0">
                        Edit →
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.openSheetFile = function(songId, attachmentIndex) {
    const song = songsCatalog.find(s => s.id === songId);
    if (!song || !song.attachments || !song.attachments[attachmentIndex]) return;

    const file = song.attachments[attachmentIndex];
    if (file.data && file.data.startsWith('data:')) {
        window.openBase64File(file.data);
    } else {
        window.open(file.data, '_blank', 'noopener,noreferrer');
    }
};

window.openBase64File = function(dataUrl) {
    if (!dataUrl) return;
    try {
        const parts = dataUrl.split(';base64,');
        const contentType = parts[0].replace('data:', '') || 'application/pdf';
        const byteCharacters = atob(parts[1]);
        
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        
        const win = window.open(blobUrl, '_blank');
        if (!win) alert('Please allow pop-ups for this website to view attachments.');
    } catch (e) {
        console.error('Error opening attachment:', e);
        alert('Failed to preview attachment.');
    }
};

window.openSongModal = function(songId) {
    editingSongId = songId;
    const modal = document.getElementById('songModal');
    const isEdit = !!songId;

    document.getElementById('songModalTitle').innerText = isEdit ? '✏️ Edit Song' : '🎵 Add New Song';
    document.getElementById('btnDeleteSong').classList.toggle('hidden', !isEdit);
    
    // Toggle Fields 7 & 8 (Only visible during edit mode)
    document.getElementById('masteredBpmContainer').classList.toggle('hidden', !isEdit);
    document.getElementById('masteryRatingContainer').classList.toggle('hidden', !isEdit);
    document.getElementById('masteryLevelDisplayContainer').classList.toggle('hidden', !isEdit);

    if (isEdit) {
        const song = songsCatalog.find(s => s.id === songId);
        if (!song) return;

        document.getElementById('songTitleInput').value = song.title || '';
        document.getElementById('songInstrumentSelect').value = song.instrument || '';
        document.getElementById('songVideoLinkInput').value = song.videoLink || '';
        document.getElementById('songKeySelect').value = song.key || '(None)';
        document.getElementById('songModeSelect').value = song.mode || '(None)';
        document.getElementById('songTargetBpmInput').value = song.targetBpm || 120;
        document.getElementById('songMasteredBpmInput').value = song.masteredBpm || 0;
        document.getElementById('songUserRatingInput').value = song.userRating || 0;
        document.getElementById('ratingValDisplay').innerText = `${song.userRating || 0} / 5`;
        
        currentAttachments = song.attachments ? [...song.attachments] : [];
        updateMasteryScorePreview();
    } else {
        document.getElementById('songForm').reset();
        currentAttachments = [];
    }

    renderAttachmentsList();
    modal.classList.remove('hidden');
};

function closeSongModal() {
    document.getElementById('songModal').classList.add('hidden');
    editingSongId = null;
    currentAttachments = [];
}

async function handleFileUploads(e) {
    const files = Array.from(e.target.files);
    for (let file of files) {
        const base64 = await readFileAsBase64(file);
        currentAttachments.push({
            name: file.name,
            data: base64
        });
    }
    renderAttachmentsList();
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderAttachmentsList() {
    const container = document.getElementById('sheetAttachmentsList');
    container.innerHTML = currentAttachments.map((a, idx) => `
        <span class="bg-zinc-800 text-amber-300 border border-zinc-700 px-2 py-1 rounded text-[10px] flex items-center gap-1">
            📄 ${a.name}
            <button type="button" onclick="removeAttachment(${idx})" class="text-rose-400 hover:text-rose-300 font-bold ml-1">✕</button>
        </span>
    `).join('');
}

window.removeAttachment = function(index) {
    currentAttachments.splice(index, 1);
    renderAttachmentsList();
};

async function handleSaveSong(e) {
    e.preventDefault();

    const dbToUse = personalDb || gatewayDb;
    const title = document.getElementById('songTitleInput').value.trim();
    const instrument = document.getElementById('songInstrumentSelect').value;
    const videoLink = document.getElementById('songVideoLinkInput').value.trim();
    const key = document.getElementById('songKeySelect').value;
    const mode = document.getElementById('songModeSelect').value;
    const targetBpm = parseInt(document.getElementById('songTargetBpmInput').value) || 120;
    
    // Fields 7 & 8 payload values
    const masteredBpm = editingSongId ? (parseInt(document.getElementById('songMasteredBpmInput').value) || 0) : 0;
    const userRating = editingSongId ? (parseFloat(document.getElementById('songUserRatingInput').value) || 0) : 0;

    const payload = {
        title,
        instrument,
        videoLink,
        key,
        mode,
        targetBpm,
        masteredBpm,
        userRating,
        attachments: currentAttachments,
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingSongId) {
            const songRef = doc(dbToUse, `users/${activeUser.uid}/songs/${editingSongId}`);
            await setDoc(songRef, payload, { merge: true });
        } else {
            payload.createdAt = new Date().toISOString();
            const songsColRef = collection(dbToUse, `users/${activeUser.uid}/songs`);
            await setDoc(doc(songsColRef), payload);
        }

        closeSongModal();
        await loadSongs();
    } catch (err) {
        console.error("Error saving song:", err);
        alert("Failed to save song.");
    }
}

async function handleDeleteSong() {
    if (!editingSongId) return;
    if (!confirm("Are you sure you want to delete this song from your repertoire?")) return;

    const dbToUse = personalDb || gatewayDb;
    try {
        await deleteDoc(doc(dbToUse, `users/${activeUser.uid}/songs/${editingSongId}`));
        closeSongModal();
        await loadSongs();
    } catch (err) {
        console.error("Error deleting song:", err);
        alert("Failed to delete song.");
    }
}

function fillSelectOptions(elementId, list) {
    const el = document.getElementById(elementId);
    el.innerHTML = ['(None)', ...list].map(i => `<option value="${i}">${i}</option>`).join('');
}
