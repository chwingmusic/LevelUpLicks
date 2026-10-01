import { gatewayAuth, gatewayDb, loadViewRouter } from '../../main.js';
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collectionGroup, 
    getDocs, 
    getDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js/auto/+esm';

let categoryChart = null;

let userPracticeLogs = [];
let activeCalendarDate = new Date();
let selectedPreset = 'this_month';

/**
 * Page Initialization
 */
export async function initPage() {
    setupRedirectListener();
    setupPeriodButtons();
    setupCalendarView();

    await fetchUserLogs();
    applyPresetRange('this_month');
}

/**
 * 1. Personal Firestore Database Instance Helper
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
 * 2. Fetch all session items from all `practice_sessions/{session}/items` subcollections
 */
async function fetchUserLogs() {
    const user = gatewayAuth.currentUser;
    if (!user) return;

    try {
        const db = await getPersonalDatabaseInstance(user);

        // Fetch all practice item subcollections
        const querySnapshot = await getDocs(collectionGroup(db, 'items'));

        userPracticeLogs = querySnapshot.docs
            .filter(d => d.ref.path.includes(`users/${user.uid}/practice_sessions/`))
            .map(d => {
                const data = d.data();

                // Extract date & instrument from path: users/{uid}/practice_sessions/{DATE}_{INSTRUMENT}/items/{docId}
                const pathParts = d.ref.path.split('/');
                const sessionFolder = pathParts[pathParts.indexOf('practice_sessions') + 1] || '';
                const [datePart, ...instParts] = sessionFolder.split('_');
                const rawInstrument = instParts.join('_');

                return {
                    id: d.id,
                    date: datePart || '1970-01-01',
                    instrument: rawInstrument ? decodeURIComponent(rawInstrument) : 'Unknown',
                    category: data.category || 'General',
                    topic: data.title || data.topic || 'Untitled Session',
                    key: data.key && data.key !== '(None)' ? data.key : null,
                    mode: data.mode && data.mode !== '(None)' ? data.mode : null,
                    minutes: Number(data.durationMins) || 0,
                    bpm: data.targetBpm || null,
                    completed: Boolean(data.completed)
                };
            });

    } catch (err) {
        console.error("Error loading practice logs for dashboard:", err);
    }
}

/**
 * UI Event Listeners & Router Setup
 */
function setupRedirectListener() {
    const btnStart = document.getElementById('btnStartTodaySession');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (typeof loadViewRouter === 'function') {
                loadViewRouter('practice');
            }
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

/**
 * Core Render Pipeline
 */
function renderDashboard() {
    const sVal = document.getElementById('startDatePicker')?.value;
    const eVal = document.getElementById('endDatePicker')?.value;

    const start = sVal ? new Date(sVal + 'T00:00:00') : new Date(0);
    const end = eVal ? new Date(eVal + 'T23:59:59') : new Date();

    // Current period logs
    const filteredLogs = userPracticeLogs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        return logDate >= start && logDate <= end;
    });

    // Prior period logs for comparison
    const periodDurationMs = end.getTime() - start.getTime();
    const priorStart = new Date(start.getTime() - periodDurationMs);
    const priorEnd = new Date(start.getTime() - 1);

    const priorLogs = userPracticeLogs.filter(log => {
        const logDate = new Date(log.date + 'T00:00:00');
        return logDate >= priorStart && logDate <= priorEnd;
    });

    renderTimeMetric(filteredLogs, priorLogs);
    calculateStreak(filteredLogs);
    renderCategoryCards(filteredLogs);
    renderCalendarGrid();
}

/**
 * Metric 1: Hours Logged & Percentage Comparison
 */
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

/**
 * Metric 2: Consecutive Day Active Streak
 */
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

    // Shift date by 4 hours to align with getLogicalDateString()
    const nowShifted = new Date(Date.now() - (4 * 60 * 60 * 1000));
    let checkDate = new Date(nowShifted.getFullYear(), nowShifted.getMonth(), nowShifted.getDate());

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

/**
 * Category Breakdown Component & Pie Chart Trigger
 * Only counts completed items
 */
function renderCategoryCards(logs) {
    const container = document.getElementById('categoryCardsContainer');
    if (!container) return;

    const categories = {};
    const categoryPieCounts = {};

    // Filter ONLY COMPLETED logs for category statistics
    const completedLogs = logs.filter(log => log.completed);

    completedLogs.forEach(log => {
        if (!categories[log.category]) {
            categories[log.category] = { totalPractices: 0, topics: {} };
        }
        categories[log.category].totalPractices += 1;

        // Tally totals for pie chart
        categoryPieCounts[log.category] = (categoryPieCounts[log.category] || 0) + 1;

        const topicKey = `${log.topic}|${log.key || ''}|${log.mode || ''}`;
        categories[log.category].topics[topicKey] = (categories[log.category].topics[topicKey] || 0) + 1;
    });

    // Render Pie Chart with completed counts
    renderCategoryPieChart(categoryPieCounts);

    if (Object.keys(categories).length === 0) {
        container.innerHTML = `<div class="col-span-3 text-xs text-zinc-500 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">No completed practice sessions logged in this period.</div>`;
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
                        ${catData.totalPractices} completed
                    </span>
                </div>

                <details class="group" open>
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

/**
 * Calendar Day Detail Interaction
 * Displays all practices and clearly marks completed ones with green accents
 */
function showDayDetails(dateStr, logs) {
    const panel = document.getElementById('dayDetailsPanel');
    const title = document.getElementById('selectedDateTitle');
    const container = document.getElementById('dayPracticesList');

    if (!panel || !title || !container) return;

    title.innerText = dateStr;
    panel.classList.remove('hidden');

    if (logs.length === 0) {
        container.innerHTML = `<p class="text-xs text-zinc-500 py-2">No practice sessions logged on this date.</p>`;
        return;
    }

    container.innerHTML = logs.map(log => {
        const isDone = Boolean(log.completed);
        
        // Dynamic border and badge styling
        const cardBorder = isDone 
            ? 'border-l-4 border-l-emerald-500 border-zinc-800 bg-zinc-900/90' 
            : 'border-l-4 border-l-zinc-700 border-zinc-800/60 bg-zinc-900/40 opacity-75';

        const badgeStyle = isDone 
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
            : 'bg-zinc-800 text-zinc-400 border-zinc-700';

        const badgeLabel = isDone ? '✓ Completed' : 'Pending';

        return `
            <div class="flex items-center justify-between border rounded-xl px-4 py-3 ${cardBorder}">
                <div class="space-y-1">
                    <div class="text-xs font-bold ${isDone ? 'text-amber-400' : 'text-zinc-300'} flex items-center gap-2">
                        <span>${log.topic}</span>
                        <span class="text-[10px] text-zinc-500 font-normal">(${log.instrument})</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-md font-bold border ${badgeStyle}">
                            ${badgeLabel}
                        </span>
                    </div>
                    <div class="text-[10px] text-zinc-400">
                        ${log.category} ${log.key ? `• ${log.key}${log.mode || ''}` : ''}
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs font-mono font-bold ${isDone ? 'text-emerald-400' : 'text-zinc-500'}">
                        ${log.minutes} mins
                    </div>
                    ${log.bpm ? `<div class="text-[10px] font-mono text-amber-500/80">${log.bpm} BPM</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Calendar Heatmap & Day Detail Interaction
 */
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

/**
 * Renders or updates the Category Breakdown Pie Chart
 * @param {Object} categoryCounts Map of category names to completed count (e.g., { "ARPEGPIO": 5, "SCALE": 6 })
 */
function renderCategoryPieChart(categoryCounts) {
    const canvas = document.getElementById('categoryPieChart');
    if (!canvas) return;

    const labels = Object.keys(categoryCounts);
    const data = Object.values(categoryCounts);
    const totalCount = data.reduce((acc, val) => acc + val, 0);

    const badgeEl = document.getElementById('chartTotalCompletedBadge');
    if (badgeEl) badgeEl.innerText = `${totalCount} Total Completed`;

    // Colors matching dark theme (Amber accent palette)
    const chartColors = [
        '#f59e0b', // Amber-500
        '#fbbf24', // Amber-400
        '#d97706', // Amber-600
        '#fcd34d', // Amber-300
        '#b45309', // Amber-700
        '#78350f'  // Amber-900
    ];

    if (categoryChart) {
        categoryChart.destroy();
    }

    if (labels.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    categoryChart = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: chartColors.slice(0, labels.length),
                borderColor: '#18181b', // Zinc-900
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#a1a1aa', // Zinc-400
                        font: { size: 11, family: 'Plus Jakarta Sans' },
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const val = context.raw || 0;
                            const percentage = ((val / totalCount) * 100).toFixed(1);
                            return ` ${label}: ${val} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}
