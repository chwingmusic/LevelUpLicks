import { gatewayAuth, gatewayDb } from '../../main.js';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

const SYSTEM_DROPDOWNS_DEFAULT = {
    categories: {
        "Scale": ["Major / Minor", "Pentatonic", "Blues", "Diatonic Modes", "Symmetric", "Bebop"],
        "Arpeggio": ["Triads", "7th Chords", "Extended (9th/11th)", "Sweep Shapes"],
        "Technique": ["Alternate Picking", "Legato", "Sweeping", "Tapping", "Hybrid Picking", "Rhythm & Grooves", "Bending / Vibrato"],
        "Songs / Repertoire": ["Full Track", "Lick / Riff", "Solo", "Rhythm Part", "Intro / Outro"],
        "Theory & Ear": ["Chord Progression", "Interval Training", "Sight Reading", "Transcription"]
    },
    keys: ["(None)", "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"],
    modes: ["(None)", "Ionian (Major)", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian (Minor)", "Locrian", "Harmonic Minor", "Melodic Minor", "Phrygian Dominant", "Altered Scale", "Major Pentatonic", "Minor Pentatonic", "Blues Scale"],
    timeSignatures: ["(None)", "4/4", "3/4", "6/8", "12/8", "5/4", "7/8"],
    routineTags: ["Daily Routine", "Active Focus", "Maintenance", "Paused"]
};

let activeDropdowns = null;
let activeTopicsList = [];
let personalDb = null;
let existingAttachments = [];

export async function initPage() {
    const activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    const tabUser = document.getElementById('tab-user-config');
    const tabPractice = document.getElementById('tab-practice-config');
    const panelUser = document.getElementById('panel-user-config');
    const panelPractice = document.getElementById('panel-practice-config');

    // Helper function to switch tabs
    const switchToUserTab = () => {
        tabUser.className = "w-full text-center py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700/50";
        tabPractice.className = "w-full text-center py-2 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200";
        panelUser.classList.remove('hidden');
        panelPractice.classList.add('hidden');
    };

    const switchToPracticeTab = async () => {
        tabPractice.className = "w-full text-center py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700/50";
        tabUser.className = "w-full text-center py-2 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200";
        panelPractice.classList.remove('hidden');
        panelUser.classList.add('hidden');

        const dbToUse = personalDb || gatewayDb;
        await setupDropdownOptions(activeUser, dbToUse);
        await renderTopicsCatalog(activeUser, dbToUse);
    };

    // Attach click listeners
    tabUser.addEventListener('click', switchToUserTab);
    tabPractice.addEventListener('click', switchToPracticeTab);

    // Setup Connection & Load configuration check
    const hasConfiguredDb = await setupConnectionTab(activeUser);

    // Smart Routing: If user already setup database, default to Topic Management!
    if (hasConfiguredDb) {
        await switchToPracticeTab();
    } else {
        switchToUserTab();
    }

    setupTopicFormListeners(activeUser);
}

// Fetch user's saved config and return a dedicated Firestore instance
async function getPersonalDatabaseInstance(activeUser) {
    try {
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
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
        console.error("Could not initialize personal DB instance, falling back:", e);
    }
    return gatewayDb;
}

// System Connection Handlers
async function setupConnectionTab(activeUser) {
    const inputArea = document.getElementById('configJsonInput');
    const statusText = document.getElementById('statusMessageText');
    const saveBtn = document.getElementById('btnSaveConfig');
    let hasConnection = false;

    try {
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
        if (snapshot.exists()) {
            inputArea.value = JSON.stringify(snapshot.data(), null, 2);
            statusText.innerText = "Personal Database Connection Synchronized.";
            statusText.previousElementSibling.className = "h-2 w-2 rounded-full bg-emerald-500";
            
            // Initialize database instance for practice panel loading
            personalDb = await getPersonalDatabaseInstance(activeUser);
            hasConnection = true;
        }
    } catch (e) {
        console.error("Config fetch error:", e);
    }

    saveBtn.addEventListener('click', async () => {
        try {
            let rawInput = inputArea.value.trim();
            if (!rawInput.startsWith('{')) rawInput = `{${rawInput}}`;
            const jsonString = rawInput.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');
            const compiledKeys = JSON.parse(jsonString);

            statusText.innerText = "Saving configuration parameters...";
            statusText.previousElementSibling.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";

            const personalApp = initializeApp(compiledKeys, "userPersonalInstance");
            personalDb = getFirestore(personalApp);

            await setDoc(doc(gatewayDb, "user_configs", activeUser.uid), compiledKeys);
            
            statusText.innerText = "Database connection verified and registered!";
            statusText.previousElementSibling.className = "h-2 w-2 rounded-full bg-emerald-500";
        } catch (err) {
            alert("Validation failed. Please ensure standard JSON object formatting.");
            statusText.innerText = "Connection validation rejected.";
            statusText.previousElementSibling.className = "h-2 w-2 rounded-full bg-rose-500";
        }
    });

    return hasConnection;
}

// Fetch or Seed Dropdowns
async function setupDropdownOptions(activeUser, db) {
    const dropdownDocRef = doc(db, `users/${activeUser.uid}/settings`, "dropdown_options");
    try {
        const snap = await getDoc(dropdownDocRef);
        if (snap.exists()) {
            activeDropdowns = snap.data();
        } else {
            await setDoc(dropdownDocRef, SYSTEM_DROPDOWNS_DEFAULT);
            activeDropdowns = JSON.parse(JSON.stringify(SYSTEM_DROPDOWNS_DEFAULT));
        }
    } catch (e) {
        console.error("Error loading dropdown options:", e);
        activeDropdowns = SYSTEM_DROPDOWNS_DEFAULT;
    }

    populateSelectMenus();
}

function populateSelectMenus() {
    const catSelect = document.getElementById('topicCategory');
    catSelect.innerHTML = Object.keys(activeDropdowns.categories).map(c => `<option value="${c}">${c}</option>`).join('') + `<option value="OTHERS">+ Others (Custom)</option>`;
    
    catSelect.addEventListener('change', () => {
        const isOthers = catSelect.value === 'OTHERS';
        document.getElementById('topicCategoryCustom').classList.toggle('hidden', !isOthers);
        updateSubCategories();
    });

    updateSubCategories();

    fillSimpleSelect('topicKey', activeDropdowns.keys);
    fillSimpleSelect('topicMode', activeDropdowns.modes);
    fillSimpleSelect('topicTimeSig', activeDropdowns.timeSignatures);
    fillSimpleSelect('topicTag', activeDropdowns.routineTags);
}

function updateSubCategories() {
    const catSelect = document.getElementById('topicCategory');
    const subSelect = document.getElementById('topicSubCategory');
    const selectedCat = catSelect.value;

    if (selectedCat !== 'OTHERS' && activeDropdowns.categories[selectedCat]) {
        const subList = activeDropdowns.categories[selectedCat];
        subSelect.innerHTML = subList.map(s => `<option value="${s}">${s}</option>`).join('') + `<option value="OTHERS">+ Others (Custom)</option>`;
    } else {
        subSelect.innerHTML = `<option value="OTHERS">+ Others (Custom)</option>`;
    }

    subSelect.addEventListener('change', () => {
        document.getElementById('topicSubCategoryCustom').classList.toggle('hidden', subSelect.value !== 'OTHERS');
    });
}

function fillSimpleSelect(elementId, items) {
    const el = document.getElementById(elementId);
    el.innerHTML = items.map(i => `<option value="${i}">${i}</option>`).join('');
}

// Render Topics Catalog
async function renderTopicsCatalog(activeUser, db) {
    const container = document.getElementById('topicsContainer');
    const badge = document.getElementById('topicCountBadge');

    try {
        const snap = await getDocs(collection(db, `users/${activeUser.uid}/topics`));
        activeTopicsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        badge.innerText = `${activeTopicsList.length} Items`;

        if (activeTopicsList.length === 0) {
            container.innerHTML = `
                <div class="col-span-2 text-center py-8 border border-dashed border-zinc-800 rounded-2xl">
                    <p class="text-xs text-zinc-500">No practice topics created yet. Add your first lick or exercise above!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activeTopicsList.map(t => `
            <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-zinc-700/80 transition-all">
                <div class="space-y-2">
                    <div class="flex items-start justify-between">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">${t.tag}</span>
                        <div class="flex space-x-1">
                            <button onclick="editTopic('${t.id}')" class="text-xs text-zinc-400 hover:text-amber-400 p-1">✏️</button>
                            <button onclick="deleteTopic('${t.id}')" class="text-xs text-zinc-400 hover:text-rose-400 p-1">🗑️</button>
                        </div>
                    </div>
                    <h4 class="text-sm font-bold text-white tracking-tight">${t.title}</h4>
                    <p class="text-xs text-zinc-400">${t.category} • ${t.subCategory || 'General'}</p>
                    
                    <div class="flex flex-wrap gap-2 text-[11px] text-zinc-400 pt-1">
                        ${t.key && t.key !== '(None)' ? `<span class="bg-zinc-800/80 px-2 py-0.5 rounded">Key: ${t.key}</span>` : ''}
                        ${t.mode && t.mode !== '(None)' ? `<span class="bg-zinc-800/80 px-2 py-0.5 rounded">Mode: ${t.mode}</span>` : ''}
                        ${t.timeSignature && t.timeSignature !== '(None)' ? `<span class="bg-zinc-800/80 px-2 py-0.5 rounded">Time: ${t.timeSignature}</span>` : ''}
                        ${t.targetMinutes ? `<span class="bg-zinc-800/80 px-2 py-0.5 rounded">⏱️ ${t.targetMinutes}m</span>` : ''}
                    </div>
                </div>

                ${t.notes ? `<p class="text-[11px] text-zinc-500 line-clamp-2 border-t border-zinc-800/50 pt-2">${t.notes}</p>` : ''}
            </div>
        `).join('');
    } catch (err) {
        console.error("Error loading topics:", err);
    }
}

// Form Submission & Edit Handlers
function setupTopicFormListeners(activeUser) {
    const form = document.getElementById('topicForm');
    const resetBtn = document.getElementById('btnResetForm');
    const previewContainer = document.getElementById('attachmentPreviewList');

    resetBtn.addEventListener('click', () => {
        form.reset();
        existingAttachments = [];
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.classList.add('hidden');
        }
        
        document.getElementById('editingTopicId').value = "";
        document.getElementById('topicCategoryCustom').classList.add('hidden');
        document.getElementById('topicSubCategoryCustom').classList.add('hidden');
        document.getElementById('formTitleText').innerHTML = "<span>🎸</span> <span>Add New Practice Topic</span>";
        
        updateSubCategories();
        resetBtn.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const dbToUse = personalDb || gatewayDb;

        let category = document.getElementById('topicCategory').value;
        if (category === 'OTHERS') category = document.getElementById('topicCategoryCustom').value.trim();

        let subCategory = document.getElementById('topicSubCategory').value;
        if (subCategory === 'OTHERS') subCategory = document.getElementById('topicSubCategoryCustom').value.trim();

        await updateDropdownsWithCustomEntry(activeUser, dbToUse, category, subCategory);

        const filesInput = document.getElementById('topicFileInput');
        const newAttachments = [];
        for (let file of filesInput.files) {
            const base64 = await fileToBase64(file);
            newAttachments.push({ name: file.name, data: base64 });
        }

        const finalAttachments = [...existingAttachments, ...newAttachments];

        const topicPayload = {
            title: document.getElementById('topicTitle').value.trim(),
            tag: document.getElementById('topicTag').value,
            category: category,
            subCategory: subCategory,
            key: document.getElementById('topicKey').value,
            mode: document.getElementById('topicMode').value,
            timeSignature: document.getElementById('topicTimeSig').value,
            targetMinutes: document.getElementById('topicTargetMins').value ? parseInt(document.getElementById('topicTargetMins').value) : null,
            resourceUrl: document.getElementById('topicResourceUrl').value.trim(),
            notes: document.getElementById('topicNotes').value.trim(),
            attachments: finalAttachments,
            updatedAt: new Date().toISOString()
        };

        const editingId = document.getElementById('editingTopicId').value;
        if (editingId) {
            await updateDoc(doc(dbToUse, `users/${activeUser.uid}/topics`, editingId), topicPayload);
        } else {
            topicPayload.createdAt = new Date().toISOString();
            await addDoc(collection(dbToUse, `users/${activeUser.uid}/topics`), topicPayload);
        }

        form.reset();
        resetBtn.click();
        await renderTopicsCatalog(activeUser, dbToUse);
    });

    window.editTopic = (id) => {
        const t = activeTopicsList.find(x => x.id === id);
        if (!t) return;

        document.getElementById('editingTopicId').value = t.id;
        document.getElementById('topicTitle').value = t.title;
        document.getElementById('topicTag').value = t.tag;

        const catSelect = document.getElementById('topicCategory');
        if (activeDropdowns.categories[t.category]) {
            catSelect.value = t.category;
            document.getElementById('topicCategoryCustom').classList.add('hidden');
        } else {
            catSelect.value = 'OTHERS';
            document.getElementById('topicCategoryCustom').classList.remove('hidden');
            document.getElementById('topicCategoryCustom').value = t.category;
        }

        updateSubCategories();

        const subSelect = document.getElementById('topicSubCategory');
        const availableSubOptions = Array.from(subSelect.options).map(o => o.value);
        if (availableSubOptions.includes(t.subCategory)) {
            subSelect.value = t.subCategory;
            document.getElementById('topicSubCategoryCustom').classList.add('hidden');
        } else {
            subSelect.value = 'OTHERS';
            document.getElementById('topicSubCategoryCustom').classList.remove('hidden');
            document.getElementById('topicSubCategoryCustom').value = t.subCategory || '';
        }

        document.getElementById('topicKey').value = t.key || '(None)';
        document.getElementById('topicMode').value = t.mode || '(None)';
        document.getElementById('topicTimeSig').value = t.timeSignature || '(None)';
        document.getElementById('topicTargetMins').value = t.targetMinutes || '';
        document.getElementById('topicResourceUrl').value = t.resourceUrl || '';
        document.getElementById('topicNotes').value = t.notes || '';

        existingAttachments = t.attachments || [];
        renderAttachmentPreviews();

        document.getElementById('formTitleText').innerHTML = "<span>✏️</span> <span>Edit Practice Topic</span>";
        resetBtn.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.deleteTopic = async (id) => {
        if (confirm("Are you sure you want to delete this topic?")) {
            const dbToUse = personalDb || gatewayDb;
            await deleteDoc(doc(dbToUse, `users/${activeUser.uid}/topics`, id));
            await renderTopicsCatalog(activeUser, dbToUse);
        }
    };
}

function renderAttachmentPreviews() {
    const previewContainer = document.getElementById('attachmentPreviewList');
    if (!previewContainer) return;

    if (!existingAttachments || existingAttachments.length === 0) {
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
        return;
    }

    previewContainer.classList.remove('hidden');
    previewContainer.innerHTML = existingAttachments.map((file, idx) => `
        <span class="inline-flex items-center space-x-1.5 text-[11px] bg-zinc-800 text-amber-300 border border-zinc-700/80 px-2.5 py-1 rounded-lg">
            <span>📄 ${file.name}</span>
            <button type="button" onclick="removeAttachment(${idx})" class="text-zinc-400 hover:text-rose-400 font-bold ml-1">✕</button>
        </span>
    `).join('');
}

window.removeAttachment = (index) => {
    existingAttachments.splice(index, 1);
    renderAttachmentPreviews();
};

async function updateDropdownsWithCustomEntry(activeUser, db, category, subCategory) {
    if (!activeDropdowns) return;

    let modified = false;

    if (!activeDropdowns.categories[category]) {
        activeDropdowns.categories[category] = subCategory ? [subCategory] : [];
        modified = true;
    } else if (subCategory && !activeDropdowns.categories[category].includes(subCategory)) {
        activeDropdowns.categories[category].push(subCategory);
        modified = true;
    }

    if (modified) {
        const dropdownDocRef = doc(db, `users/${activeUser.uid}/settings`, "dropdown_options");
        await setDoc(dropdownDocRef, activeDropdowns);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}
