export function initPage() {
    console.log("Dashboard module loaded.");
    
    const heatmap = document.getElementById('dashboardHeatmap');
    if (heatmap) {
        heatmap.innerHTML = '';
        for (let i = 0; i < 30; i++) {
            const intensity = Math.floor(Math.random() * 4);
            const colors = ['bg-zinc-800', 'bg-amber-900/40', 'bg-amber-600/70', 'bg-amber-400'];
            const day = document.createElement('div');
            day.className = `h-7 rounded-md ${colors[intensity]} flex items-center justify-center text-[10px] font-mono text-zinc-400 transition-all hover:scale-110`;
            day.innerText = i + 1;
            heatmap.appendChild(day);
        }
    }

    const topicsBox = document.getElementById('activeTopicsSummary');
    if (topicsBox) {
        const topics = JSON.parse(localStorage.getItem('lul_topics') || '[]');
        topicsBox.innerHTML = topics.length ? topics.slice(0,3).map(t => `
            <div class="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 flex justify-between items-center">
                <div>
                    <p class="text-xs font-bold text-zinc-200">${t.title}</p>
                    <span class="text-[10px] text-amber-500">${t.category}</span>
                </div>
                <span class="text-xs font-mono font-bold text-zinc-300">${t.targetBpm} BPM</span>
            </div>
        `).join('') : '<p class="text-xs text-zinc-500">No topics set. Add in Configuration!</p>';
    }

    const quickBtn = document.getElementById('btnQuickStartPractice');
    if (quickBtn) {
        quickBtn.addEventListener('click', () => {
            if (window.switchAppPage) window.switchAppPage('practice');
        });
    }
}
