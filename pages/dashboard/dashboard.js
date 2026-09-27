import { gatewayAuth, gatewayDb, loadViewRouter } from '../../main.js';
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, getDoc, doc, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let userPracticeLogs = [];
let activeCalendarDate = new Date();
let selectedPreset = 'this_month';

export async function initPage() {
    setupRedirectListener();
    setupPeriodButtons();
    setupCalendarView();
    
    await fetchUserLogs();
    applyPresetRange('this_month');
}

// Helper to retrieve user's personal Firestore instance
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

async function fetchUserLogs() {
    const user = gatewayAuth.currentUser;
    if (!user) return;

    try {
        const db = await getPersonalDatabaseInstance(user);
        const logsRef = collection(db, "practice_logs");
        const q = query(
            logsRef, 
            orderBy("date", "desc")
        );

        const querySnapshot = await getDocs(q);
        userPracticeLogs = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            userPracticeLogs.push({
                id: doc.id,
                date: data.date,
                category: data.category || 'General',
                topic: data.topic || 'Untitled Session',
                key: data.key || null,
                mode: data.mode || null,
                minutes: Number(data.minutes) || 0,
                bpm: data.bpm || null
            });
        });
    } catch (err) {
        console.error("Error loading practice logs from personal DB:", err);
    }
}

function setupRedirectListener() {
    const btnStart = document.getElementById('btnStartTodaySession');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            loadViewRouter('practice');
        });
    }
}

function setupPeriodButtons() {
    const buttons = document.querySelectorAll('.period-btn');
    const startPicker = document.getElementById('startDatePicker');
    const endPicker = document.getElementById('endDatePicker');

    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => {
                b.classList.remove('active', 'bg-amber-500', 'text-zinc-950', 'border-amber-400', 'font-bold');
                b.classList.add('bg-zinc-950', 'text-zinc-400', 'border-zinc-800', 'font-semibold');
            });

            const target = e.currentTarget;
            target.classList.add('active', 'bg-amber-500', 'text-zinc-950', 'border-amber-400', 'font-bold');
            target.classList.remove('bg-zinc-950', 'text-zinc-400', 'border-zinc-800', 'font-semibold');

            selectedPreset = target.getAttribute('data-period');
            applyPresetRange(selectedPreset);
        });
    });

    startPicker?.addEventListener('change', () => {
        clearButtonHighlights();
        renderDashboard();
    });
    endPicker?.addEventListener('change', () => {
        clearButtonHighlights();
        renderDashboard();
    });
}

function clearButtonHighlights() {
    document.querySelectorAll('.period-btn').forEach(b => {
        b.classList.remove('active', 'bg-amber-500', 'text-zinc-950', 'border-amber-400', 'font-bold');
        b.classList.add('bg-zinc-950', 'text-zinc-400', 'border-zinc-800', 'font-semibold');
    });
}

function applyPresetRange(preset) {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'this_week') {
        const day = now.getDay();
        start.setDate(now.getDate() - day);
    } else if (preset === 'last_week') {
        const day = now.getDay();
        start.setDate(now.getDate() - day - 7);
        end.setDate(now.getDate() - day - 1);
    } else if (preset === 'this_month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'last_month') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'ytd') {
        start = new Date(now.getFullYear(), 0, 1);
    } else if (preset === 'last_year') {
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
    }

    const startPicker = document.getElementById('startDatePicker');
    const endPicker = document.getElementById('endDatePicker');

    if (startPicker) startPicker.value = formatDateForInput(start);
    if (endPicker) endPicker.value = formatDateForInput(end);

    renderDashboard();
}

function formatDateForInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function renderDashboard() {
    const sVal = document.getElementById('startDatePicker')?.value;
    const eVal = document.getElementById('endDatePicker')?.value;

    const start = sVal ? new Date(sVal + 'T00:00:00') : new Date(0);
    const end = eVal ? new Date(eVal + 'T23:59:59') : new Date();

    // 1. Current Period
    const filteredLogs = userPracticeLogs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        return logDate >= start && logDate <= end;
    });

    // 2. Prior Period Comparison
    const periodDurationMs = end.getTime() - start.getTime();
    const priorStart = new Date(start.getTime() - periodDurationMs);
    const priorEnd = new Date(start.getTime() - 1);

    const priorLogs = userPracticeLogs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        return logDate >= priorStart && logDate <= priorEnd;
    });

    // 3. Render Cards & Grid
    renderTimeMetric(filteredLogs, priorLogs);
    calculateStreak(filteredLogs);
    renderCategoryCards(filteredLogs);
    renderCalendarGrid();
}

function renderTimeMetric(currentLogs, priorLogs) {
    const currentMins = currentLogs.reduce((acc, curr) => acc + curr.minutes, 0);
    const priorMins = priorLogs.reduce((acc, curr) => acc + curr.minutes, 0);

    const hoursEl = document.getElementById('statTotalHours');
    if (hoursEl) hoursEl.innerText = (currentMins / 60).toFixed(1);

    const timeChangeEl = document.getElementById('statTimeChange');
    if (!timeChangeEl) return;

    if (priorMins === 0) {
        if (currentMins > 0) {
            timeChangeEl.innerHTML = `<span class="text-emerald-400 font-bold">▲ +100%</span> vs prior period`;
        } else {
            timeChangeEl.innerText = `0 hrs logged in prior period`;
        }
    } else {
        const diffPercent = (((currentMins - priorMins) / priorMins) * 100).toFixed(1);
        if (diffPercent > 0) {
            timeChangeEl.innerHTML = `<span class="text-emerald-400 font-bold">▲ +${diffPercent}%</span> vs prior period`;
        } else if (diffPercent < 0) {
            timeChangeEl.innerHTML = `<span class="text-rose-400 font-bold">▼ ${diffPercent}%</span> vs prior period`;
        } else {
            timeChangeEl.innerHTML = `<span class="text-zinc-400 font-bold">0% change</span> vs prior period`;
        }
    }
}

function calculateStreak(filteredLogs) {
    const streakSubtextEl = document.querySelector('#statActiveStreak')?.parentElement?.nextElementSibling;
    
    if (userPracticeLogs.length === 0) {
        const streakEl = document.getElementById('statActiveStreak');
        if (streakEl) streakEl.innerText = '0';
        if (streakSubtextEl) streakSubtextEl.innerText = 'No practice logs recorded yet';
        return;
    }

    const uniqueDates = [...new Set(userPracticeLogs.map(l => l.date))].sort().reverse();
    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDates.length; i++) {
        const pDate = new Date(uniqueDates[i] + 'T00:00:00');
        const diffDays = Math.floor((checkDate - pDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 0 || diffDays === 1) {
            streak++;
            checkDate = pDate;
        } else {
            break;
        }
    }

    const streakEl = document.getElementById('statActiveStreak');
    if (streakEl) streakEl.innerText = streak;

    const rangeActiveDays = new Set(filteredLogs.map(l => l.date)).size;
    if (streakSubtextEl) {
        streakSubtextEl.innerText = `Practiced on ${rangeActiveDays} distinct day${rangeActiveDays === 1 ? '' : 's'} in this range`;
    }
}

function renderCategoryCards(logs) {
    const container = document.getElementById('categoryCardsContainer');
    if (!container) return;

    const categories = {};
    logs.forEach(log => {
        if (!categories[log.category]) {
            categories[log.category] = { totalPractices: 0, topics: {} };
        }
        categories[log.category].totalPractices += 1;

        const topicKey = `${log.topic}|${log.key || ''}|${log.mode || ''}`;
        categories[log.category].topics[topicKey] = (categories[log.category].topics[topicKey] || 0) + 1;
    });

    if (Object.keys(categories).length === 0) {
        container.innerHTML = `<div class="col-span-3 text-xs text-zinc-500 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">No practice sessions logged in this period.</div>`;
        return;
    }

    container.innerHTML = Object.entries(categories).map(([catName, catData]) => {
        const topicsListMarkup = Object.entries(catData.topics).map(([keyStr, count]) => {
            const [topic, key, mode] = keyStr.split('|');
            const keyModeStr = (key || mode) ? `(${[key, mode].filter(Boolean).join(' ')})` : '';
            return `
                <li class="flex items-center justify-between text-xs py-1 border-b border-zinc-800/50 last:border-0">
                    <span class="text-zinc-300 font-medium">${topic} <span class="text-amber-500/80 text-[10px]">${keyModeStr}</span></span>
                    <span class="text-amber-400 font-mono font-bold">${count}x</span>
                </li>
            `;
        }).join('');

        return `
            <div class="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="text-xs font-bold text-amber-400 uppercase tracking-wider">${catName}</h3>
                    <span class="text-xs font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                        ${catData.totalPractices} session${catData.totalPractices > 1 ? 's' : ''}
                    </span>
                </div>

                <details class="group">
                    <summary class="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center justify-between font-semibold pt-1">
                        <span>Topic Breakdown (${Object.keys(catData.topics).length})</span>
                        <span class="transition-transform group-open:rotate-180">▾</span>
                    </summary>
                    <ul class="mt-2 pt-2 border-t border-zinc-800/80 space-y-0.5">
                        ${topicsListMarkup}
                    </ul>
                </details>
            </div>
        `;
    }).join('');
}

function setupCalendarView() {
    const prevBtn = document.getElementById('btnPrevMonth');
    const nextBtn = document.getElementById('btnNextMonth');

    prevBtn?.addEventListener('click', () => {
        activeCalendarDate.setMonth(activeCalendarDate.getMonth() - 1);
        renderCalendarGrid();
    });

    nextBtn?.addEventListener('click', () => {
        activeCalendarDate.setMonth(activeCalendarDate.getMonth() + 1);
        renderCalendarGrid();
    });

    document.getElementById('btnCloseDayDetails')?.addEventListener('click', () => {
        document.getElementById('dayDetailsPanel')?.classList.add('hidden');
    });
}

function renderCalendarGrid() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    if (!grid || !label) return;

    const year = activeCalendarDate.getFullYear();
    const month = activeCalendarDate.getMonth();

    label.innerText = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    grid.innerHTML = '';

    for (let i = 0; i < firstDayIndex; i++) {
        grid.innerHTML += `<div class="h-10 bg-zinc-950/40 rounded-xl opacity-30"></div>`;
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayLogs = userPracticeLogs.filter(l => l.date === dateStr);
        const totalMins = dayLogs.reduce((acc, curr) => acc + curr.minutes, 0);

        let bgClass = "bg-zinc-800/80 text-zinc-400";
        if (totalMins > 0 && totalMins <= 20) bgClass = "bg-amber-950/80 text-amber-300 border border-amber-900/50";
        else if (totalMins > 20 && totalMins <= 45) bgClass = "bg-amber-800/80 text-amber-200 border border-amber-700/50";
        else if (totalMins > 45 && totalMins <= 75) bgClass = "bg-amber-500 text-zinc-950 font-bold border border-amber-400";
        else if (totalMins > 75) bgClass = "bg-yellow-400 text-zinc-950 font-black border border-yellow-300 shadow-md shadow-yellow-500/20";

        const dayCell = document.createElement('div');
        dayCell.className = `h-10 rounded-xl flex items-center justify-center text-xs font-semibold cursor-pointer hover:scale-105 transition-all ${bgClass}`;
        dayCell.innerText = day;

        dayCell.addEventListener('click', () => showDayDetails(dateStr, dayLogs));
        grid.appendChild(dayCell);
    }
}

function showDayDetails(dateStr, logs) {
    const panel = document.getElementById('dayDetailsPanel');
    const title = document.getElementById('selectedDateTitle');
    const container = document.getElementById('dayPracticesList');

    if (!panel || !title || !container) return;

    title.innerText = dateStr;
    panel.classList.remove('hidden');

    if (logs.length === 0) {
        container.innerHTML = `<p class="text-xs text-zinc-500">No practice sessions logged on this date.</p>`;
        return;
    }

    container.innerHTML = logs.map(log => `
        <div class="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
            <div>
                <div class="text-xs font-bold text-amber-400">${log.topic}</div>
                <div class="text-[10px] text-zinc-400">${log.category} ${log.key ? `• ${log.key}${log.mode || ''}` : ''}</div>
            </div>
            <div class="text-right">
                <div class="text-xs font-mono font-bold text-zinc-200">${log.minutes} mins</div>
                ${log.bpm ? `<div class="text-[10px] font-mono text-amber-500">${log.bpm} BPM</div>` : ''}
            </div>
        </div>
    `).join('');
}
