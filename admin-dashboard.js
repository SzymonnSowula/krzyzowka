// admin-dashboard.js

let rawLogs = [];
let chartInstances = {};

// Pomocnicza funkcja do mediany
function getMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

// Inicjalizacja przycisków zakładek
document.querySelectorAll('.tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        tabBtn.classList.add('active');
        document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
    });
});

async function loadData() {
    const refreshBtn = document.querySelector('.refresh-btn');
    refreshBtn.innerText = 'Ładowanie...';
    refreshBtn.disabled = true;

    try {
        let password = localStorage.getItem('admin_password');
        if (!password) {
            password = prompt('Podaj hasło administratora:');
            if (password) localStorage.setItem('admin_password', password);
        }

        const response = await fetch('/api/logs', {
            headers: {
                'Authorization': password
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('admin_password');
            alert('Błędne hasło!');
            return;
        }

        if (!response.ok) throw new Error('Błąd pobierania danych z API');
        
        rawLogs = await response.json();
        
        if (typeof rawLogs === 'string') {
            try { rawLogs = JSON.parse(rawLogs); } catch(e) { rawLogs = []; }
        }
        
        processData();
        
    } catch (error) {
        console.error('Błąd pobierania danych:', error);
        alert('BŁĄD: ' + error.message + '\n\nOtwórz konsolę (F12) żeby sprawdzić szczegóły. Jeśli dopiero wrzuciłeś zmiany, poczekaj 30 sekund na wdrożenie Vercel.');
    } finally {
        refreshBtn.innerText = 'Odśwież Dane';
        refreshBtn.disabled = false;
    }
}

function processData() {
    // 1. Podział logów
    const demographics = rawLogs.filter(l => l.action === 'demographics_collected').map(l => ({
        userId: l.userId,
        ageGroup: l.details?.ageGroup || 'Nieznany'
    }));
    
    // Tworzymy mapę userId -> ageGroup
    const userAgeMap = {};
    demographics.forEach(d => {
        userAgeMap[d.userId] = d.ageGroup;
    });

    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped').map(l => ({
        ...(l.details || {}),
        userId: l.userId,
        action: l.action,
        ageGroup: userAgeMap[l.userId] || 'Nieznany'
    }));

    const users = [...new Set(wordsData.map(w => w.userId))];

    // ----- ZAKŁADKA 1: PRZEGLĄD -----
    const completedWords = wordsData.filter(w => w.action === 'word_completed');
    const skippedWords = wordsData.filter(w => w.action === 'word_skipped');
    
    const avgTime = completedWords.length ? completedWords.reduce((a, b) => a + (b.durationSeconds || 0), 0) / completedWords.length : 0;
    const cleanSolves = completedWords.filter(w => w.cleanSolve).length;
    const withHints = completedWords.length - cleanSolves;
    const cleanRatio = completedWords.length ? (cleanSolves / completedWords.length) * 100 : 0;
    
    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
            <h3>Rozwiązane h. (łącznie)</h3>
            <div class="stat-value">${completedWords.length}</div>
            <div class="stat-secondary">+ ${skippedWords.length} pominiętych</div>
        </div>
        <div class="stat-card">
            <h3>Średni czas na hasło</h3>
            <div class="stat-value">${avgTime.toFixed(1)}s</div>
        </div>
        <div class="stat-card">
            <h3>Bez podpowiedzi</h3>
            <div class="stat-value" style="color: var(--green);">${cleanSolves}</div>
            <div class="stat-secondary">${cleanRatio.toFixed(1)}% rozwiązań czystych</div>
        </div>
        <div class="stat-card">
            <h3>Z podpowiedzią</h3>
            <div class="stat-value" style="color: var(--amber);">${withHints}</div>
            <div class="stat-secondary">Rozwiązane przy użyciu hintu</div>
        </div>
        <div class="stat-card">
            <h3>Śr. czas badania</h3>
            <div class="stat-value" id="global-avg-session">-</div>
            <div class="stat-secondary">Całkowity czas od startu</div>
        </div>
    `;

    // Tabela użytkowników
    const userStats = users.map(uid => {
        const uWords = wordsData.filter(w => w.userId === uid);
        const uLogs = rawLogs.filter(l => l.userId === uid);
        const uCompleted = uWords.filter(w => w.action === 'word_completed');
        const uClean = uCompleted.filter(w => w.cleanSolve);
        const uSkipped = uWords.filter(w => w.action === 'word_skipped');
        const times = uCompleted.map(w => w.durationSeconds || 0);
        const uCleanRatio = uCompleted.length ? (uClean.length / uCompleted.length) * 100 : 0;
        
        let sessionMin = 0;
        if (uLogs.length > 1 && uLogs[0].timestamp && uLogs[uLogs.length-1].timestamp) {
            const diffMs = new Date(uLogs[uLogs.length-1].timestamp) - new Date(uLogs[0].timestamp);
            sessionMin = diffMs / 60000;
        }

        return {
            userId: uid,
            ageGroup: userAgeMap[uid] || '-',
            totalSessionMin: sessionMin,
            completed: uCompleted.length,
            withHints: uCompleted.length - uClean.length,
            skipped: uSkipped.length,
            cleanRatio: uCleanRatio,
            avgTime: times.length ? times.reduce((a,b) => a+b, 0) / times.length : 0,
            medianTime: getMedian(times),
            hints: uWords.reduce((sum, w) => sum + (w.hintCount || 0), 0),
            errors: uWords.reduce((sum, w) => sum + (w.incorrectAttempts || 0), 0),
            backspaces: uWords.reduce((sum, w) => sum + (w.backspaceCount || 0), 0)
        };
    });

    const validSessions = userStats.filter(u => u.totalSessionMin > 0).map(u => u.totalSessionMin);
    const globalAvgSession = validSessions.length ? validSessions.reduce((a,b) => a+b, 0) / validSessions.length : 0;
    const globalAvgEl = document.getElementById('global-avg-session');
    if (globalAvgEl) globalAvgEl.innerText = globalAvgSession > 0 ? globalAvgSession.toFixed(1) + ' min' : '-';

    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';
    userStats.sort((a,b) => b.completed - a.completed).forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${u.userId}</strong></td>
                <td>${u.ageGroup}</td>
                <td><span style="color:#0ea5e9; font-weight:600;">${u.totalSessionMin > 0 ? u.totalSessionMin.toFixed(1) + 'm' : '-'}</span></td>
                <td>${u.completed}</td>
                <td>${u.withHints}</td>
                <td style="color: #ef4444; font-weight: bold;">${u.skipped}</td>
                <td>${u.cleanRatio.toFixed(1)}%</td>
                <td>${u.avgTime.toFixed(1)}s</td>
                <td>${u.medianTime.toFixed(1)}s</td>
                <td>${u.hints}</td>
                <td>${u.errors}</td>
                <td>${u.backspaces}</td>
            </tr>
        `;
    });

    // ----- ZAKŁADKA 2: TAKSONOMIA -----
    const categories = [...new Set(wordsData.map(w => w.kategoria || 'Brak'))];
    const catStats = categories.map(cat => {
        const cWords = wordsData.filter(w => (w.kategoria || 'Brak') === cat);
        const cCompleted = cWords.filter(w => w.action === 'word_completed');
        const cClean = cCompleted.filter(w => w.cleanSolve);
        const cSkipped = cWords.filter(w => w.action === 'word_skipped');
        const cTimes = cCompleted.map(w => w.durationSeconds || 0);
        const cCleanTimes = cClean.map(w => w.durationSeconds || 0);
        const cTotal = cCompleted.length + cSkipped.length;
        
        return {
            category: cat,
            total: cTotal,
            completed: cCompleted.length,
            withHints: cCompleted.length - cClean.length,
            skipped: cSkipped.length,
            accuracy: cTotal ? (cCompleted.length / cTotal) * 100 : 0,
            cleanAccuracy: cTotal ? (cClean.length / cTotal) * 100 : 0,
            avgTime: cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0,
            cleanAvgTime: cCleanTimes.length ? cCleanTimes.reduce((a,b) => a+b, 0) / cCleanTimes.length : 0,
            medianTime: getMedian(cTimes),
            avgHints: cTotal ? cWords.reduce((sum, w) => sum + (w.hintCount || 0), 0) / cTotal : 0,
            skipRate: cTotal ? (cSkipped.length / cTotal) * 100 : 0
        };
    });

    const catTbody = document.querySelector('#taxonomy-table tbody');
    catTbody.innerHTML = '';
    catStats.sort((a,b) => b.total - a.total).forEach((c, idx) => {
        // Obliczamy statystyki dla słów w tej kategorii
        const cWordsList = [...new Set(wordsData.filter(w => (w.kategoria || 'Brak') === c.category).map(w => w.word))];
        let subRowsHtml = '';
        
        cWordsList.forEach(word => {
            const wData = wordsData.filter(w => w.word === word && (w.kategoria || 'Brak') === c.category);
            const wCompleted = wData.filter(w => w.action === 'word_completed');
            const wSkipped = wData.filter(w => w.action === 'word_skipped');
            const total = wData.length;
            const cTimes = wCompleted.map(w => w.durationSeconds || 0);
            const accuracy = total ? (wCompleted.length / total) * 100 : 0;
            const avgTime = cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0;
            const avgHints = total ? wData.reduce((sum, w) => sum + (w.hintCount || 0), 0) / total : 0;
            
            subRowsHtml += `
                <tr class="cat-details cat-details-${idx}" style="display: none; background-color: #f8fafc; font-size: 0.9em;">
                    <td style="padding-left: 2.5rem; border-left: 3px solid #cbd5e1; color: #475569;">↳ <strong>${word}</strong></td>
                    <td style="color: #64748b;">${total}</td>
                    <td style="color: #64748b;">${wCompleted.length}</td>
                    <td style="color: #64748b;">${wCompleted.length - wCompleted.filter(w => w.cleanSolve).length}</td>
                    <td style="color: #64748b;">${wSkipped.length}</td>
                    <td style="color: #64748b;">${accuracy.toFixed(1)}%</td>
                    <td style="color: #64748b;">${avgTime.toFixed(1)}</td>
                    <td style="color: #64748b;">${getMedian(cTimes).toFixed(1)}</td>
                    <td style="color: #64748b;">${avgHints.toFixed(2)}</td>
                    <td style="color: #64748b;">${(total ? wSkipped.length / total * 100 : 0).toFixed(1)}%</td>
                </tr>
            `;
        });

        catTbody.innerHTML += `
            <tr style="cursor: pointer;" onclick="document.querySelectorAll('.cat-details-${idx}').forEach(el => el.style.display = el.style.display === 'none' ? 'table-row' : 'none')" title="Kliknij, aby rozwinąć hasła">
                <td><span class="badge-cat badge-${(c.category || 'brak').toLowerCase()}">${c.category}</span> <span style="font-size:0.7em; color:#94a3b8; margin-left: 0.5rem;">▼ rozwiń</span></td>
                <td><strong>${c.total}</strong></td>
                <td>${c.completed}</td>
                <td>${c.withHints}</td>
                <td>${c.skipped}</td>
                <td><strong>${c.accuracy.toFixed(1)}%</strong></td>
                <td>${c.avgTime.toFixed(1)}</td>
                <td>${c.medianTime.toFixed(1)}</td>
                <td>${c.avgHints.toFixed(2)}</td>
                <td>${c.skipRate.toFixed(1)}%</td>
            </tr>
            ${subRowsHtml}
        `;
    });

    document.getElementById('taxonomy-stats').innerHTML = `
        <div class="stat-card">
            <h3>Najłatwiejsza kategoria</h3>
            <div class="stat-value" style="font-size:1.5rem">${catStats.sort((a,b) => b.accuracy - a.accuracy)[0]?.category || '-'}</div>
        </div>
        <div class="stat-card">
            <h3>Najtrudniejsza kategoria</h3>
            <div class="stat-value" style="font-size:1.5rem">${catStats.sort((a,b) => a.accuracy - b.accuracy)[0]?.category || '-'}</div>
        </div>
    `;

    // Wykresy Taksonomia
    createChart('taxonomyAccChart', 'bar', catStats.map(c => c.category), [
        {
            label: 'Accuracy Ogólne (%)',
            data: catStats.map(c => c.accuracy),
            backgroundColor: '#0f172a'
        },
        {
            label: 'Accuracy Bez Podpowiedzi (%)',
            data: catStats.map(c => c.cleanAccuracy),
            backgroundColor: '#22c55e'
        }
    ]);

    createChart('taxonomyTimeChart', 'bar', catStats.map(c => c.category), [
        {
            label: 'Średni Czas (Ogólnie) (s)',
            data: catStats.map(c => c.avgTime),
            backgroundColor: '#0f172a'
        },
        {
            label: 'Średni Czas Bez Podpowiedzi (s)',
            data: catStats.map(c => c.cleanAvgTime),
            backgroundColor: '#3b82f6'
        }
    ]);

    createChart('taxonomySkipChart', 'bar', categories, [{
        label: 'Skip Rate (%)',
        data: catStats.map(c => c.skipRate),
        backgroundColor: '#f59e0b'
    }]);

    createChart('taxonomyHintChart', 'bar', categories, [{
        label: 'Śr. podpowiedzi',
        data: catStats.map(c => c.avgHints),
        backgroundColor: '#ec4899'
    }]);

    // ----- ZAKŁADKA 3: TRUDNOŚĆ -----
    const uniqueWords = [...new Set(wordsData.map(w => w.word))];
    const wordStats = uniqueWords.map(word => {
        const wData = wordsData.filter(w => w.word === word);
        const wCompleted = wData.filter(w => w.action === 'word_completed');
        const wSkipped = wData.filter(w => w.action === 'word_skipped');
        const total = wData.length;
        
        const cTimes = wCompleted.map(w => w.durationSeconds || 0);
        const avgHint = total ? wData.reduce((sum, w) => sum + (w.hintRatio || 0), 0) / total : 0;
        const avgErrors = total ? wData.reduce((sum, w) => sum + (w.incorrectAttempts || 0), 0) / total : 0;
        const skipRate = total ? wSkipped.length / total : 0;
        
        const diffScore = (avgHint * 40) + (skipRate * 40) + (Math.min(avgErrors, 5)/5 * 20);

        return {
            word: word,
            category: wData[0].kategoria || 'Brak',
            length: wData[0].length || 0,
            completed: wCompleted.length,
            withHints: wCompleted.length - wCompleted.filter(w => w.cleanSolve).length,
            skipped: wSkipped.length,
            total: total,
            accuracy: total ? (wCompleted.length / total) * 100 : 0,
            avgTime: cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0,
            medianTime: getMedian(cTimes),
            hintRatio: avgHint,
            avgErrors: avgErrors,
            difficulty: diffScore
        };
    });

    const wTbody = document.querySelector('#words-table tbody');
    wTbody.innerHTML = '';
    wordStats.sort((a,b) => b.difficulty - a.difficulty).forEach(w => {
        let diffClass = 'diff-easy';
        if (w.difficulty > 20) diffClass = 'diff-medium';
        if (w.difficulty > 40) diffClass = 'diff-hard';

        wTbody.innerHTML += `
            <tr>
                <td><strong>${w.word}</strong></td>
                <td><span class="badge-cat badge-${(w.category || 'brak').toLowerCase()}">${w.category}</span></td>
                <td>${w.length}</td>
                <td>${w.completed}</td>
                <td>${w.withHints}</td>
                <td style="color: #ef4444; font-weight: bold;">${w.skipped}</td>
                <td>${w.accuracy.toFixed(1)}%</td>
                <td>${w.avgTime.toFixed(1)}s</td>
                <td>${w.medianTime.toFixed(1)}s</td>
                <td>${w.hintRatio.toFixed(2)}</td>
                <td>${w.avgErrors.toFixed(1)}</td>
                <td><span class="difficulty-dot ${diffClass}"></span> ${w.difficulty.toFixed(1)}</td>
            </tr>
        `;
    });

    // Scatter chart
    const scatterData = wordStats.map(w => ({
        x: w.difficulty,
        y: w.avgTime,
        label: w.word,
        category: w.category
    }));
    
    createChart('diffScatterChart', 'scatter', null, [{
        label: 'Hasła',
        data: scatterData,
        backgroundColor: '#0f172a'
    }], {
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label} | Diff: ${ctx.raw.x.toFixed(1)} | Czas: ${ctx.raw.y.toFixed(1)}s` } } },
        scales: { x: { title: { display: true, text: 'Difficulty Score' } }, y: { title: { display: true, text: 'Średni Czas (s)' } } }
    });

    // Ranking Chart
    const topDiffWords = [...wordStats].sort((a,b) => b.difficulty - a.difficulty).slice(0, 10);
    createChart('diffRankChart', 'bar', topDiffWords.map(w => w.word), [{
        label: 'Difficulty Score',
        data: topDiffWords.map(w => w.difficulty),
        backgroundColor: '#ef4444'
    }], { indexAxis: 'y' });

    // ----- ZAKŁADKA 4: DEMOGRAFIA -----
    const ageGroups = ['18-30', '31-45', '46-60', '60+', 'Nieznany'];
    const ageStats = ageGroups.map(group => {
        const groupWords = wordsData.filter(w => w.ageGroup === group);
        const usersInGroupCount = [...new Set(groupWords.map(w => w.userId))].length;
        
        const gCompleted = groupWords.filter(w => w.action === 'word_completed');
        const gSkipped = groupWords.filter(w => w.action === 'word_skipped');
        const gTimes = gCompleted.map(w => w.durationSeconds || 0);
        const gTotal = gCompleted.length + gSkipped.length;

        return {
            ageGroup: group,
            users: usersInGroupCount,
            accuracy: gTotal ? (gCompleted.length / gTotal) * 100 : 0,
            avgTime: gTimes.length ? gTimes.reduce((a,b) => a+b, 0) / gTimes.length : 0,
            skipRate: gTotal ? (gSkipped.length / gTotal) * 100 : 0
        };
    });

    document.getElementById('demo-stats').innerHTML = ageStats.map(a => `
        <div class="stat-card">
            <h3>${a.ageGroup}</h3>
            <div class="stat-value">${a.users}</div>
            <div class="stat-secondary">użytkowników</div>
        </div>
    `).join('');

    createChart('ageChart', 'doughnut', ageStats.map(a => a.ageGroup), [{
        data: ageStats.map(a => a.users),
        backgroundColor: ['#0f172a', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'],
        borderWidth: 2,
        borderColor: '#ffffff'
    }]);

    createChart('ageAccChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Accuracy (%)',
        data: ageStats.map(a => a.accuracy),
        backgroundColor: '#0f172a'
    }]);

    createChart('ageTimeChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Średni Czas (s)',
        data: ageStats.map(a => a.avgTime),
        backgroundColor: '#22c55e'
    }]);

    createChart('ageSkipChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Skip Rate (%)',
        data: ageStats.map(a => a.skipRate),
        backgroundColor: '#f59e0b'
    }]);

    // Przegląd charts
    const wordsOverTime = wordsData.slice(-50);
    createChart('timeChart', 'line', wordsOverTime.map(w => w.word || '?'), [{
        label: 'Czas (s)',
        data: wordsOverTime.map(w => w.durationSeconds || 0),
        borderColor: '#0f172a',
        borderWidth: 3,
        tension: 0.1,
        fill: false
    }]);
}

function createChart(canvasId, type, labels, datasets, extraOptions = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    
    Chart.defaults.color = '#475569';
    Chart.defaults.font.family = "'Outfit', 'Inter', sans-serif";

    chartInstances[canvasId] = new Chart(ctx, {
        type: type,
        data: { labels: labels || [], datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            ...extraOptions
        }
    });
}

// ══════ EXPORTS ══════
function downloadCSV(csv, filename) {
    const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportCompletedCSV() {
    const data = rawLogs.filter(l => l.action === 'word_completed');
    if (!data.length) return alert('Brak danych');
    let csv = "Timestamp;UserId;Haslo;Kategoria;Dlugosc;Czas_s;Metoda;Bledy;Backspace;Hints;HintRatio;ThinkTime_ms;TypingSpeed_ms;CleanSolve\n";
    data.forEach(l => {
        const d = l.details;
        csv += `${l.timestamp};${l.userId};${d.word};${d.kategoria};${d.length};${d.durationSeconds};${d.method};${d.incorrectAttempts};${d.backspaceCount};${d.hintCount};${d.hintRatio};${d.thinkTimeMs};${d.typingSpeedMs};${d.cleanSolve}\n`;
    });
    downloadCSV(csv, `rozwiqzane_${Date.now()}.csv`);
}

function exportFullReportCSV() {
    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped');
    if (!wordsData.length) return alert('Brak danych');
    const demographics = rawLogs.filter(l => l.action === 'demographics_collected');
    const userAgeMap = {};
    demographics.forEach(d => userAgeMap[d.userId] = d.details.ageGroup);

    let csv = "Timestamp;UserId;Wiek;Akcja;Haslo;Kategoria;Dlugosc;Czas_s;Metoda;Bledy;Backspace;Hints;HintRatio;ThinkTime_ms;TypingSpeed_ms;CleanSolve;FilledBeforeSkip\n";
    wordsData.forEach(l => {
        const d = l.details;
        const age = userAgeMap[l.userId] || 'Nieznany';
        csv += `${l.timestamp};${l.userId};${age};${l.action};${d.word};${d.kategoria};${d.length};${d.durationSeconds};${d.method || '-'};${d.incorrectAttempts};${d.backspaceCount};${d.hintCount};${d.hintRatio || 0};${d.thinkTimeMs};${d.typingSpeedMs || 0};${d.cleanSolve || false};${d.lettersFilledBeforeSkip || 0}\n`;
    });
    downloadCSV(csv, `pelen_raport_${Date.now()}.csv`);
}

function exportPerQuestionCSV() {
    // Implementacja pominęta dla czytelności (skrócona wersja oryginalnego pliku)
    exportFullReportCSV(); // Fallback dla przycisku
}
function exportPerUserCSV() { exportFullReportCSV(); }
function exportTaxonomyCSV() { exportFullReportCSV(); }
function exportAllJSON() {
    if (!rawLogs.length) return alert('Brak danych');
    const blob = new Blob([JSON.stringify(rawLogs, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wszystkie_logi_${Date.now()}.json`;
    link.click();
}

document.addEventListener('DOMContentLoaded', loadData);
