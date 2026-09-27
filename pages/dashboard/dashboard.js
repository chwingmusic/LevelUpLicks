import { gatewayAuth, gatewayDb } from '../../main.js';
import { 
    collectionGroup, 
    getDocs, 
    doc, 
    getDoc, 
    getFirestore, 
    initializeApp, 
    getApps 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let activeUser = null;
let personalDb = null;
let allSessionItems = [];

/**
 * 1. Adjust date string to local 4-hour shifted practice window YYYY-MM-DD
 */
function getLogicalDateString(dateObj = new Date()) {
    const adjustedDate = new Date(dateObj.getTime() - (4 * 60 * 60 * 1000));
    const year = adjustedDate.getFullYear();
    const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
    const day = String(adjustedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 2. Resolve personal Firestore instance if customized keys exist
 */
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
        console.error("Personal DB Error on Dashboard:", e);
    }
    return gatewayDb;
}

/**
 * 3. Primary Page Initialization
 */
export async function initDashboardPage() {
    activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    personalDb = await getPersonalDatabaseInstance(activeUser);

    setupDashboardEventListeners();
    await fetchAllDashboardData();
}

/**
 * 4. Setup Event Listeners (Filter Range Selector)
 */
function setupDashboardEventListeners() {
    const rangeSelect = document.getElementById('dashRangeFilter');
    if (rangeSelect) {
        rangeSelect.addEventListener('change', () => {
            calculateAndRenderStats(rangeSelect.value);
        });
    }
}

/**
 * 5. Fetch ALL practice items subcollections across all dates & instruments
 */
async function fetchAllDashboardData() {
    const dbToUse = personalDb || gatewayDb;

    try {
        // Query every "items" subcollection in the database instance
        const querySnapshot = await getDocs(collectionGroup(dbToUse, 'items'));
        
        // Filter out items belonging to the active user's document path
        allSessionItems = querySnapshot.docs
            .filter(d => d.ref.path.includes(`users/${activeUser.uid}/practice_sessions/`))
            .map(d => {
                const data = d.data();
                
                // Extract session metadata from path: .../practice_sessions/{DATE}_{INSTRUMENT}/items/{ID}
                const pathParts = d.ref.path.split('/');
                const sessionFolder = pathParts[pathParts.indexOf('practice_sessions') + 1] || '';
                const [datePart, ...instParts] = sessionFolder.split('_');
                const rawInstrument = instParts.join('_');

                return {
                    id: d.id,
                    ...data,
                    sessionDate: datePart || getLogicalDateString(),
                    instrument: rawInstrument ? decodeURIComponent(rawInstrument) : 'Unknown'
                };
            });

        // Default to "all" time or "30" days on initial render
        const rangeSelect = document.getElementById('dashRangeFilter');
        const defaultRange = rangeSelect ? rangeSelect.value : 'all';
        
        calculateAndRenderStats(defaultRange);

    } catch (err) {
        console.error("Error fetching all dashboard stats:", err);
    }
}

/**
 * 6. Calculate Metrics based on Selected Filter Range
 */
function calculateAndRenderStats(rangeMode = 'all') {
    const todayStr = getLogicalDateString();
    const today = new Date(todayStr);

    // Filter items based on selected date range
    const filteredItems = allSessionItems.filter(item => {
        if (rangeMode === 'all') return true;

        const itemDate = new Date(item.sessionDate);
        const diffInDays = Math.floor((today - itemDate) / (1000 * 60 * 60 * 24));

        if (rangeMode === 'today') return item.sessionDate === todayStr;
        if (rangeMode === '7') return diffInDays >= 0 && diffInDays < 7;
        if (rangeMode === '30') return diffInDays >= 0 && diffInDays < 30;

        return true;
    });

    // Metric 1: Total Practice Minutes
    const totalMinutes = filteredItems.reduce((sum, item) => sum + (Number(item.durationMins) || 0), 0);

    // Metric 2: Completed Items
    const completedCount = filteredItems.filter(item => Boolean(item.completed)).length;
    const totalCount = filteredItems.length;

    // Metric 3: Active Unique Practice Days
    const uniqueDays = new Set(filteredItems.map(item => item.sessionDate)).size;

    // Metric 4: Daily Average Practice Time
    const dailyAverageMins = uniqueDays > 0 ? Math.round(totalMinutes / uniqueDays) : 0;

    // Metric 5: Streak Calculation (Consecutive days worked backwards from today)
    const currentStreak = calculateStreak(allSessionItems);

    // 7. Push calculated values into HTML elements
    updateUIElement('dashStatTotalTime', formatMinutesDisplay(totalMinutes));
    updateUIElement('dashStatCompleted', `${completedCount}/${totalCount}`);
    updateUIElement('dashStatDailyAvg', `${dailyAverageMins}m/day`);
    updateUIElement('dashStatStreak', `${currentStreak} Days`);

    // Render Recent Sessions Preview Table/List
    renderRecentActivityTable(filteredItems);
}

/**
 * Calculate Consecutive Practice Days Streak
 */
function calculateStreak(items) {
    if (!items || items.length === 0) return 0;

    // Extract sorted unique practice dates (newest to oldest)
    const activeDates = Array.from(new Set(items.map(i => i.sessionDate))).sort().reverse();
    if (activeDates.length === 0) return 0;

    const todayStr = getLogicalDateString();
    let streak = 0;
    let checkDate = new Date(todayStr);

    // Check if user practiced today or yesterday to maintain active streak
    const hasPracticedToday = activeDates.includes(todayStr);
    
    // Shift checkDate back 1 day if user hasn't logged today yet
    if (!hasPracticedToday) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const formattedCheck = `${year}-${month}-${day}`;

        if (activeDates.includes(formattedCheck)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

/**
 * Format minutes into readable "Xh Ym" or "Ym"
 */
function formatMinutesDisplay(mins) {
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}

/**
 * Helper to update DOM element securely
 */
function updateUIElement(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

/**
 * Render recent items preview in Dashboard UI
 */
function renderRecentActivityTable(items) {
    const container = document.getElementById('dashRecentActivityList');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<p class="text-xs text-zinc-500 py-4 text-center">No practice sessions found for this filter range.</p>`;
        return;
    }

    // Show top 10 most recent items
    const recentItems = [...items].reverse().slice(0, 10);

    container.innerHTML = recentItems.map(item => `
        <div class="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-xs mb-2">
            <div>
                <div class="flex items-center space-x-2">
                    <span class="font-bold text-white">${item.title}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded ${item.completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}">
                        ${item.completed ? 'Completed' : 'Pending'}
                    </span>
                </div>
                <p class="text-[10px] text-zinc-400 mt-0.5">${item.instrument} • ${item.sessionDate}</p>
            </div>
            <div class="text-right">
                <span class="font-semibold text-amber-400">${item.durationMins || 0} mins</span>
            </div>
        </div>
    `).join('');
}
