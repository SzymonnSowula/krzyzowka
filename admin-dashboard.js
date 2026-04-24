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
    refreshBtn.innerHTML = '<span class="refresh-icon">⏳</span> Ładowanie...';
    refreshBtn.disabled = true;

    try {
        const response = await fetch('/api/logs');
        if (!response.ok) throw new Error('Błąd pobierania danych z API');
        
        rawLogs = await response.json();
        
        // Zabezpieczenie przed dziwnymi strukturami (czasem Upstash zwraca string)
        if (typeof rawLogs === 'string') {
            try {
                rawLogs = JSON.parse(rawLogs);
            } catch(e) {
                console.error("Błąd parsowania stringa z Upstash", e);
                rawLogs = [];
            }
        }
        
        processData();
        
    } catch (error) {
        console.error('Błąd pobierania danych:', error);
        alert('Wystąpił błąd podczas pobierania danych. Sprawdź konsolę.');
    } finally {
        refreshBtn.innerHTML = '<span class="refresh-icon">↻</span> Odśwież';
        refreshBtn.disabled = false;
    }
}

function processData() {
    // 1. Podział logów
    const demographics = rawLogs.filter(l => l.action === 'demographics_collected').map(l => ({
        userId: l.userId,
        ageGroup: l.details.ageGroup
    }));
    
    // Tworzymy mapę userId -> ageGroup
    const userAgeMap = {};
    demographics.forEach(d => {
        userAgeMap[d.userId] = d.ageGroup;
    });

    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped').map(l => ({
        ...l.details,
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
    const cleanRatio = completedWords.length ? (cleanSolves / completedWords.length) * 100 : 0;
    
    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
            <h3>Użytkownicy</h3>
            <div class="stat-value">${users.length}</div>
        </div>
        <div class="stat-card">
            <h3>Rozwiązane hasła</h3>
            <div class="stat-value">${completedWords.length}</div>
            <div class="stat-secondary">+ ${skippedWords.length} pominiętych</div>
        </div>
        <div class="stat-card">
            <h3>Średni czas na hasło</h3>
            <div class="stat-value">${avgTime.toFixed(1)}s</div>
        </div>
        <div class="stat-card">
            <h3>Czyste rozwiązania</h3>
            <div class="stat-value">${cleanRatio.toFixed(1)}%</div>
            <div class="stat-secondary">Bez podpowiedzi i pomyłek</div>
        </div>
    `;

    // Tabela użytkowników
    const userStats = users.map(uid => {
        const uWords = wordsData.filter(w => w.userId === uid);
        const uCompleted = uWords.filter(w => w.action === 'word_completed');
        const uSkipped = uWords.filter(w => w.action === 'word_skipped');
        
        const times = uCompleted.map(w => w.durationSeconds || 0);
        const uClean = uCompleted.filter(w => w.cleanSolve).length;
        const uCleanRatio = uCompleted.length ? (uClean / uCompleted.length) * 100 : 0;
        
        return {
            userId: uid,
            ageGroup: userAgeMap[uid] || '-',
            completed: uCompleted.length,
            skipped: uSkipped.length,
            cleanRatio: uCleanRatio,
            avgTime: times.length ? times.reduce((a,b) => a+b, 0) / times.length : 0,
            medianTime: getMedian(times),
            hints: uWords.reduce((sum, w) => sum + (w.hintCount || 0), 0),
            errors: uWords.reduce((sum, w) => sum + (w.incorrectAttempts || 0), 0),
            backspaces: uWords.reduce((sum, w) => sum + (w.backspaceCount || 0), 0)
        };
    });

    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';
    userStats.sort((a,b) => b.completed - a.completed).forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${u.userId}</strong></td>
                <td>${u.ageGroup}</td>
                <td>${u.completed}</td>
                <td style="color: var(--amber)">${u.skipped}</td>
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
    const categories = [...new Set(wordsData.map(w => w.kategoria).filter(k => k))];
    const catStats = categories.map(cat => {
        const cWords = wordsData.filter(w => w.kategoria === cat);
        const cCompleted = cWords.filter(w => w.action === 'word_completed');
        const cSkipped = cWords.filter(w => w.action === 'word_skipped');
        const cTimes = cCompleted.map(w => w.durationSeconds || 0);
        const cClean = cCompleted.filter(w => w.cleanSolve).length;
        const cTotal = cWords.length;
        
        return {
            category: cat,
            total: cTotal,
            completed: cCompleted.length,
            skipped: cSkipped.length,
            accuracy: cTotal ? (cCompleted.length / cTotal) * 100 : 0,
            avgTime: cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0,
            medianTime: getMedian(cTimes),
            avgHints: cTotal ? cWords.reduce((sum, w) => sum + (w.hintCount || 0), 0) / cTotal : 0,
            skipRate: cTotal ? (cSkipped.length / cTotal) * 100 : 0
        };
    });

    // Tabela Taksonomia
    const catTbody = document.querySelector('#taxonomy-table tbody');
    catTbody.innerHTML = '';
    catStats.sort((a,b) => b.total - a.total).forEach(c => {
        catTbody.innerHTML += `
            <tr>
                <td><span class="badge-cat badge-${c.category}">${c.category}</span></td>
                <td>${c.total}</td>
                <td>${c.completed}</td>
                <td>${c.skipped}</td>
                <td>${c.accuracy.toFixed(1)}%</td>
                <td>${c.avgTime.toFixed(1)}</td>
                <td>${c.medianTime.toFixed(1)}</td>
                <td>${c.avgHints.toFixed(2)}</td>
                <td>${c.skipRate.toFixed(1)}%</td>
            </tr>
        `;
    });

    document.getElementById('taxonomy-stats').innerHTML = `
        <div class="stat-card">
            <h3>Najłatwiejsza kategoria</h3>
            <div class="stat-value" style="font-size:1.2rem">${catStats.sort((a,b) => b.accuracy - a.accuracy)[0]?.category || '-'}</div>
        </div>
        <div class="stat-card">
            <h3>Najtrudniejsza kategoria</h3>
            <div class="stat-value" style="font-size:1.2rem">${catStats.sort((a,b) => a.accuracy - b.accuracy)[0]?.category || '-'}</div>
        </div>
    `;

    // Wykresy Taksonomia
    createChart('taxonomyAccChart', 'bar', categories, [{
        label: 'Accuracy (%)',
        data: catStats.map(c => c.accuracy),
        backgroundColor: 'rgba(99,102,241,0.6)',
        borderColor: 'rgb(99,102,241)',
        borderWidth: 1
    }]);

    createChart('taxonomyTimeChart', 'bar', categories, [{
        label: 'Średni czas (s)',
        data: catStats.map(c => c.avgTime),
        backgroundColor: 'rgba(34,197,94,0.6)',
        borderColor: 'rgb(34,197,94)',
        borderWidth: 1
    }]);

    createChart('taxonomySkipChart', 'bar', categories, [{
        label: 'Skip Rate (%)',
        data: catStats.map(c => c.skipRate),
        backgroundColor: 'rgba(245,158,11,0.6)',
        borderColor: 'rgb(245,158,11)',
        borderWidth: 1
    }]);

    createChart('taxonomyHintChart', 'bar', categories, [{
        label: 'Śr. podpowiedzi',
        data: catStats.map(c => c.avgHints),
        backgroundColor: 'rgba(236,72,153,0.6)',
        borderColor: 'rgb(236,72,153)',
        borderWidth: 1
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
        
        // Difficulty Score = 40% Hints + 40% Skips + 20% Errors
        // Skalowane dla lepszej wizualizacji (przykładowy mnożnik)
        const diffScore = (avgHint * 40) + (skipRate * 40) + (Math.min(avgErrors, 5)/5 * 20);

        return {
            word: word,
            category: wData[0].kategoria,
            length: wData[0].length,
            completed: wCompleted.length,
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
                <td><span class="badge-cat badge-${w.category}">${w.category}</span></td>
                <td>${w.length}</td>
                <td>${w.completed}</td>
                <td style="color:var(--amber)">${w.skipped}</td>
                <td>${w.accuracy.toFixed(1)}%</td>
                <td>${w.avgTime.toFixed(1)}s</td>
                <td>${w.medianTime.toFixed(1)}s</td>
                <td>${w.hintRatio.toFixed(2)}</td>
                <td>${w.avgErrors.toFixed(1)}</td>
                <td><span class="difficulty-dot ${diffClass}"></span> ${w.difficulty.toFixed(1)}</td>
            </tr>
        `;
    });

    // Scatter chart: Difficulty vs Time
    const scatterData = wordStats.map(w => ({
        x: w.difficulty,
        y: w.avgTime,
        label: w.word,
        category: w.category
    }));

    if (chartInstances['diffScatterChart']) {
        chartInstances['diffScatterChart'].destroy();
    }
    
    chartInstances['diffScatterChart'] = new Chart(document.getElementById('diffScatterChart'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Słowa',
                data: scatterData,
                backgroundColor: 'rgba(99,102,241,0.6)',
                borderColor: 'rgb(99,102,241)',
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const d = ctx.raw;
                            return `${d.label} (${d.category}) | Diff: ${d.x.toFixed(1)}, Czas: ${d.y.toFixed(1)}s`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Difficulty Score', color: '#94a3b8' } },
                y: { title: { display: true, text: 'Średni Czas (s)', color: '#94a3b8' } }
            }
        }
    });

    // Ranking Chart
    const topDiffWords = [...wordStats].sort((a,b) => b.difficulty - a.difficulty).slice(0, 10);
    createChart('diffRankChart', 'bar', topDiffWords.map(w => w.word), [{
        label: 'Difficulty Score',
        data: topDiffWords.map(w => w.difficulty),
        backgroundColor: 'rgba(239,68,68,0.6)',
        borderColor: 'rgb(239,68,68)',
        borderWidth: 1
    }], { indexAxis: 'y' });

    // ----- ZAKŁADKA 4: DEMOGRAFIA -----
    const ageGroups = [...new Set(Object.values(userAgeMap))];
    const ageStats = ageGroups.map(age => {
        const aUsers = Object.keys(userAgeMap).filter(uid => userAgeMap[uid] === age);
        const aWords = wordsData.filter(w => aUsers.includes(w.userId));
        const aCompleted = aWords.filter(w => w.action === 'word_completed');
        const aSkipped = aWords.filter(w => w.action === 'word_skipped');
        const cTimes = aCompleted.map(w => w.durationSeconds || 0);
        
        return {
            ageGroup: age,
            users: aUsers.length,
            completed: aCompleted.length,
            accuracy: aWords.length ? (aCompleted.length / aWords.length) * 100 : 0,
            avgTime: cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0,
            skipRate: aWords.length ? (aSkipped.length / aWords.length) * 100 : 0
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
        backgroundColor: ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'],
        borderWidth: 0
    }]);

    createChart('ageAccChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Accuracy (%)',
        data: ageStats.map(a => a.accuracy),
        backgroundColor: 'rgba(99,102,241,0.6)',
        borderColor: 'rgb(99,102,241)',
        borderWidth: 1
    }]);

    createChart('ageTimeChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Średni Czas (s)',
        data: ageStats.map(a => a.avgTime),
        backgroundColor: 'rgba(34,197,94,0.6)',
        borderColor: 'rgb(34,197,94)',
        borderWidth: 1
    }]);

    createChart('ageSkipChart', 'bar', ageStats.map(a => a.ageGroup), [{
        label: 'Skip Rate (%)',
        data: ageStats.map(a => a.skipRate),
        backgroundColor: 'rgba(245,158,11,0.6)',
        borderColor: 'rgb(245,158,11)',
        borderWidth: 1
    }]);

    // Uzupełnienie wykresów w Przeglądzie, jeśli dotychczas pominięte
    const wordsOverTime = wordsData.slice(-50); // Ostatnie 50 akcji do mini-wykresu
    createChart('timeChart', 'line', wordsOverTime.map((_, i) => i+1), [{
        label: 'Czas (s)',
        data: wordsOverTime.map(w => w.durationSeconds || 0),
        borderColor: 'rgb(99,102,241)',
        tension: 0.3,
        fill: false
    }]);

    createChart('typingSpeedChart', 'line', wordsOverTime.map((_, i) => i+1), [{
        label: 'Typing Speed (ms)',
        data: wordsOverTime.map(w => w.typingSpeedMs || 0),
        borderColor: 'rgb(34,197,94)',
        tension: 0.3,
        fill: false
    }]);
}

// Helper to create charts safely
function createChart(canvasId, type, labels, datasets, extraOptions = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    chartInstances[canvasId] = new Chart(ctx, {
        type: type,
        data: { labels, datasets },
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
    // BOM for Excel
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
    
    downloadCSV(csv, `krzyzowka_completed_${Date.now()}.csv`);
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
    
    downloadCSV(csv, `krzyzowka_full_report_${Date.now()}.csv`);
}

function exportPerQuestionCSV() {
    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped');
    if (!wordsData.length) return alert('Brak danych');

    const uniqueWords = [...new Set(wordsData.map(w => w.details.word))];
    
    let csv = "Haslo;Kategoria;Proby;Rozwiazane;Pominiete;Accuracy_proc;SrCzas_s;MedianaCzas_s;SrBledy;SrHints;HintRatio;SkipRate_proc;DifficultyScore\n";

    uniqueWords.forEach(word => {
        const wData = wordsData.filter(w => w.details.word === word).map(w => w.details);
        const wCompleted = wData.filter(w => wData[wData.indexOf(w)] && rawLogs.find(l => l.details === w).action === 'word_completed');
        const wSkipped = wData.filter(w => wData[wData.indexOf(w)] && rawLogs.find(l => l.details === w).action === 'word_skipped');
        const total = wData.length;
        
        const cTimes = wCompleted.map(w => w.durationSeconds || 0);
        const avgTime = cTimes.length ? cTimes.reduce((a,b) => a+b, 0) / cTimes.length : 0;
        const medianTime = getMedian(cTimes);
        
        const avgHint = total ? wData.reduce((sum, w) => sum + (w.hintCount || 0), 0) / total : 0;
        const avgHintRatio = total ? wData.reduce((sum, w) => sum + (w.hintRatio || 0), 0) / total : 0;
        const avgErrors = total ? wData.reduce((sum, w) => sum + (w.incorrectAttempts || 0), 0) / total : 0;
        const skipRate = total ? wSkipped.length / total : 0;
        
        const diffScore = (avgHintRatio * 40) + (skipRate * 40) + (Math.min(avgErrors, 5)/5 * 20);
        const accuracy = total ? (wCompleted.length / total) * 100 : 0;

        csv += `${word};${wData[0].kategoria};${total};${wCompleted.length};${wSkipped.length};${accuracy.toFixed(1)};${avgTime.toFixed(1)};${medianTime.toFixed(1)};${avgErrors.toFixed(1)};${avgHint.toFixed(1)};${avgHintRatio.toFixed(2)};${(skipRate*100).toFixed(1)};${diffScore.toFixed(1)}\n`;
    });

    downloadCSV(csv, `krzyzowka_per_question_${Date.now()}.csv`);
}

function exportPerUserCSV() {
    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped');
    if (!wordsData.length) return alert('Brak danych');

    const demographics = rawLogs.filter(l => l.action === 'demographics_collected');
    const userAgeMap = {};
    demographics.forEach(d => userAgeMap[d.userId] = d.details.ageGroup);

    const users = [...new Set(wordsData.map(w => w.userId))];

    let csv = "UserId;Wiek;Rozwiazane;Pominiete;Accuracy_proc;CleanSolves_proc;SrCzas_s;MedianaCzas_s;SumaHints;SumaBledy;SumaBackspace\n";

    users.forEach(uid => {
        const uWordsAction = wordsData.filter(w => w.userId === uid);
        const uWords = uWordsAction.map(w => w.details);
        
        const uCompletedAction = uWordsAction.filter(w => w.action === 'word_completed');
        const uSkippedAction = uWordsAction.filter(w => w.action === 'word_skipped');
        
        const uCompleted = uCompletedAction.map(w => w.details);
        const times = uCompleted.map(w => w.durationSeconds || 0);
        
        const avgTime = times.length ? times.reduce((a,b) => a+b, 0) / times.length : 0;
        const medianTime = getMedian(times);
        
        const uClean = uCompleted.filter(w => w.cleanSolve).length;
        const uCleanRatio = uCompleted.length ? (uClean / uCompleted.length) * 100 : 0;
        const accuracy = uWords.length ? (uCompleted.length / uWords.length) * 100 : 0;

        const sumHints = uWords.reduce((sum, w) => sum + (w.hintCount || 0), 0);
        const sumErrors = uWords.reduce((sum, w) => sum + (w.incorrectAttempts || 0), 0);
        const sumBackspaces = uWords.reduce((sum, w) => sum + (w.backspaceCount || 0), 0);

        csv += `${uid};${userAgeMap[uid] || 'Nieznany'};${uCompleted.length};${uSkippedAction.length};${accuracy.toFixed(1)};${uCleanRatio.toFixed(1)};${avgTime.toFixed(1)};${medianTime.toFixed(1)};${sumHints};${sumErrors};${sumBackspaces}\n`;
    });

    downloadCSV(csv, `krzyzowka_per_user_${Date.now()}.csv`);
}

function exportTaxonomyCSV() {
    const wordsData = rawLogs.filter(l => l.action === 'word_completed' || l.action === 'word_skipped');
    if (!wordsData.length) return alert('Brak danych');

    const demographics = rawLogs.filter(l => l.action === 'demographics_collected');
    const userAgeMap = {};
    demographics.forEach(d => userAgeMap[d.userId] = d.details.ageGroup);

    const ageGroups = [...new Set(Object.values(userAgeMap))];
    const categories = [...new Set(wordsData.map(w => w.details.kategoria).filter(k => k))];

    let csv = "Kategoria;Ogolem_Accuracy;Ogolem_SrCzas;";
    ageGroups.forEach(age => {
        csv += `${age}_Accuracy;${age}_SrCzas;`;
    });
    csv += "\n";

    categories.forEach(cat => {
        const catWordsAction = wordsData.filter(w => w.details.kategoria === cat);
        const catCompletedAction = catWordsAction.filter(w => w.action === 'word_completed');
        const catTimes = catCompletedAction.map(w => w.details.durationSeconds || 0);
        
        const totalAccuracy = catWordsAction.length ? (catCompletedAction.length / catWordsAction.length) * 100 : 0;
        const totalTime = catTimes.length ? catTimes.reduce((a,b) => a+b, 0) / catTimes.length : 0;

        csv += `${cat};${totalAccuracy.toFixed(1)};${totalTime.toFixed(1)};`;

        ageGroups.forEach(age => {
            const usersInAge = Object.keys(userAgeMap).filter(uid => userAgeMap[uid] === age);
            const ageCatWordsAction = catWordsAction.filter(w => usersInAge.includes(w.userId));
            const ageCatCompletedAction = ageCatWordsAction.filter(w => w.action === 'word_completed');
            const ageCatTimes = ageCatCompletedAction.map(w => w.details.durationSeconds || 0);

            const ageAccuracy = ageCatWordsAction.length ? (ageCatCompletedAction.length / ageCatWordsAction.length) * 100 : 0;
            const ageTime = ageCatTimes.length ? ageCatTimes.reduce((a,b) => a+b, 0) / ageCatTimes.length : 0;

            csv += `${ageAccuracy.toFixed(1)};${ageTime.toFixed(1)};`;
        });
        csv += "\n";
    });

    downloadCSV(csv, `krzyzowka_taxonomy_${Date.now()}.csv`);
}

function exportAllJSON() {
    if (!rawLogs.length) return alert('Brak danych');
    const blob = new Blob([JSON.stringify(rawLogs, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `krzyzowka_all_logs_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Inicjalizacja
document.addEventListener('DOMContentLoaded', loadData);
