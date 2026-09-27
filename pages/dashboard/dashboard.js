import { loadViewRouter } from '../../app.js';

// Mock Data structure for demonstration
const mockPracticeLogs = [
    { date: '2026-09-27', category: 'Technique', topic: 'Alternate Picking 16ths', key: 'A', mode: 'Minor', minutes: 45, bpm: 140 },
    { date: '2026-09-27', category: 'Theory', topic: 'Triad Inversions', key: 'C', mode: 'Major', minutes: 30, bpm: null },
    { date: '2026-09-26', category: 'Repertoire', topic: 'Neon Intro Riff', key: 'E', mode: 'Major', minutes: 60, bpm: 110 },
    { date: '2026-09-24', category: 'Technique', topic: 'Sweep Arpeggios', key: 'G', mode: 'Dorian', minutes: 40, bpm: 150 },
    { date: '2026-09-20', category: 'Ear Training', topic: 'Interval Identification', key: null, mode: null, minutes: 20, bpm: null }
];

let activeCalendarDate = new Date();

export function initPage() {
    setupRedirectListener();
    setupPeriodPicker();
    setupCalendarView();
    renderDashboard();
}

// Redirects directly to the practice view
function setupRedirectListener() {
    const btnStart = document.getElementById('btnStartTodaySession');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            loadViewRouter('practice');
        });
    }
}

// Handles preset period selection and custom date inputs
function setupPeriodPicker() {
    const presetSelect = document.getElementById('presetPeriodSelect');
    const customRange = document.getElementById('customDateRange');

    presetSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customRange.classList.remove('hidden');
        } else {
            customRange.classList.add('hidden');
            renderDashboard();
        }
    });

    document.getElementById('startDatePicker')?.addEventListener('change', renderDashboard);
    document.getElementById('endDatePicker')?.addEventListener('change', renderDashboard);
}

// Helper to calculate date ranges for period filter
function getFilteredDates() {
    const preset = document.getElementById('presetPeriodSelect')?.value || 'this_month';
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
    } else if (preset === 'custom') {
        const sVal = document.getElementById('startDatePicker').value;
        const eVal = document.getElementById('endDatePicker').value;
        if (sVal) start = new Date(sVal);
        if (eVal) end = new Date(eVal);
    }

    return { start, end };
}

function renderDashboard() {
    const { start, end } = getFilteredDates();
    
    // Filter practice logs within date range
    const filteredLogs = mockPracticeLogs.filter(log => {
        const d = new Date(log.date);
        return d >= start && d <= end;
    });

    // 1. Calculate Total Hours
    const totalMins = filteredLogs.reduce((acc, curr) => acc + curr.minutes, 0);
    document.getElementById('statTotalHours').innerText = (totalMins / 60).toFixed(1);

    // 2. Render Category Breakdown Cards
    renderCategoryCards(filteredLogs);
}

// Renders category stat cards with collapsible topic lists
function renderCategoryCards(logs) {
    const container = document.getElementById('categoryCardsContainer');
    if (!container) return;

    // Group logs by category
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
        container.innerHTML = `<div class="col-span-3 text-xs text-zinc-500 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">No practices recorded in this period.</div>`;
        return;
    }

    container.innerHTML = Object.entries(categories).map(([catName, catData], index) => {
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

                <!-- Collapsible Topics Section -->
                <details class="group">
                    <summary class="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center justify-between font-semibold pt-1">
                        <span>Topic Details (${Object.keys(catData.topics).length})</span>
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

// Standard Full Calendar Month View (Independent of the period picker range)
function setupCalendarView() {
    const label = document.getElementById('calendarMonthLabel');
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
        document.getElementById('dayDetailsPanel').classList.add('hidden');
    });

    renderCalendarGrid();
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

    // Empty lead-in spaces for calendar offset
    for (let i = 0; i < firstDayIndex; i++) {
        grid.innerHTML += `<div class="h-10 bg-zinc-950/40 rounded-xl opacity-30"></div>`;
    }

    // Days of month
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayLogs = mockPracticeLogs.filter(l => l.date === dateStr);
        const totalMins = dayLogs.reduce((acc, curr) => acc + curr.minutes, 0);

        // Heatmap Color scaling based on volume
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

// Expands panel below calendar showing practices on selected date
function showDayDetails(dateStr, logs) {
    const panel = document.getElementById('dayDetailsPanel');
    const title = document.getElementById('selectedDateTitle');
    const container = document.getElementById('dayPracticesList');

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
