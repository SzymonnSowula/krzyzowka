let words = [];
let currentLevel = 1;
let allData = [];
let usedWordsGlobal = new Set();
let userId = null;
let globalSolveOrder = 0; // Licznik kolejności rozwiązywania
let lastActivityTime = null; // Do śledzenia przerw/pauz
let userDemographics = null; // Dane demograficzne użytkownika

async function initUser() {
    // Try to get userId from sessionStorage first (so it persists across refreshes in the same session)
    let savedId = sessionStorage.getItem('userId');
    if (savedId) {
        userId = savedId;
        console.log('Continuing session for:', userId);
    } else {
        try {
            const response = await fetch('/api/register-user');
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Register-user error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const data = await response.json();
            userId = data.userId;
            sessionStorage.setItem('userId', userId);
            console.log('Initialized as:', userId);
        } catch (err) {
            console.error('Failed to initialize user', err);
            userId = 'unknown_' + Date.now();
        }
    }
    
    const display = document.getElementById('user-display');
    if (display) display.innerText = userId;
    
    logAction('session_start', { browser: navigator.userAgent });
}

async function logAction(action, details) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action, details })
        });
    } catch (err) {
        console.error('Failed to log action', err);
    }
}

async function loadData() {
    console.log('Loading data...');
    try {
        // Najpierw próbujemy z API
        let response = await fetch('/api/data');
        
        // Jeśli API nie odpowiada lub sypie błędami, próbujemy pobrać bezpośrednio statyczny plik
        if (!response.ok) {
            console.warn('API /api/data failed, trying static /dane.json...');
            response = await fetch('/dane.json');
        }

        if (response.ok) {
            allData = await response.json();
            console.log('Data loaded successfully.');
        } else {
            console.error('Failed to load data from both API and static path.');
        }
    } catch (err) {
        console.error('Fetch failed:', err);
        // Ostateczna próba bezpośrednio na statyczny plik w razie błędu sieciowego API
        try {
            const staticResponse = await fetch('/dane.json');
            if (staticResponse.ok) {
                allData = await staticResponse.json();
                console.log('Data loaded from static fallback.');
            }
        } catch (e) {
            console.error('Static fallback also failed:', e);
        }
    } finally {
        if (allData.length === 0) {
            alert('Błąd: Nie udało się załadować słówek z pliku dane.json. Upewnij się, że plik istnieje w folderze public.');
        } else {
            generateLevel();
        }
    }
}

function generateLevel() {
    console.log('Generating level...');
    try {
        let selected;
        
        // Runda 1, 3, 5... (nieparzyste) -> pierwsze 10 haseł z bazy
        // Runda 2, 4, 6... (parzyste) -> drugie 10 haseł z bazy
        if (currentLevel % 2 !== 0) {
            selected = allData.slice(0, 10);
        } else {
            selected = allData.slice(10, 20);
        }
        
        // Tasujemy tylko kolejność wewnątrz wybranej dziesiątki
        selected.sort(() => Math.random() - 0.5);
        
        words = selected.map((d, index) => ({
            id: index,
            clue: d.pytanie,
            answer: d.odpowiedz.toUpperCase(),
            kategoria: d.kategoria || 'unknown', // Kategoria semantyczna pytania
            startTime: null,
            endTime: null,
            isCompleted: false,
            timerInterval: null,
            // Metryki behawioralne
            renderTime: Date.now(), // Czas wygenerowania hasła
            firstInputTime: null, // Czas pierwszego wpisania litery
            letterTimestamps: [], // Timestamps kolejnych liter
            incorrectAttempts: 0, // Liczba błędnych liter
            backspaceCount: 0, // Liczba naciśnięć backspace
            hintCount: 0, // Liczba użytych podpowiedzi
            focusedAt: null, // Kiedy hasło było aktywne
            solveOrder: null // Kolejność ukończenia
        }));

        words.forEach(w => usedWordsGlobal.add(w.answer));

        globalSolveOrder = 0; // Reset kolejności dla nowego poziomu
        lastActivityTime = null;

        renderClueList();

        const levelCounters = document.querySelectorAll('.level-counter');
        levelCounters.forEach(el => el.innerText = `${currentLevel} z 2`);
        
        logAction('level_generated', { level: currentLevel, wordCount: words.length });
    } catch (err) {
        console.error('Error during generation:', err);
    }
}

function renderClueList() {
    const container = document.getElementById('clue-list');
    if (!container) return;
    container.innerHTML = '';
    
    words.forEach((w, wIdx) => {
        const card = document.createElement('div');
        card.classList.add('clue-card');
        card.id = `card-${wIdx}`;
        
        const header = document.createElement('div');
        header.classList.add('clue-header');
        
        const titleArea = document.createElement('div');
        titleArea.classList.add('clue-title');
        titleArea.innerText = `${wIdx + 1}. ${w.clue}`;
        header.appendChild(titleArea);
        
        const actionsArea = document.createElement('div');
        actionsArea.classList.add('clue-actions');
        
        const timerBadge = document.createElement('div');
        timerBadge.classList.add('timer-badge');
        timerBadge.id = `timer-${wIdx}`;
        timerBadge.innerText = '0:00.0';
        actionsArea.appendChild(timerBadge);
        
        const hintBtn = document.createElement('button');
        hintBtn.innerText = 'PODPOWIEDŹ';
        hintBtn.classList.add('btn-hint-small');
        hintBtn.onclick = () => giveHintForWord(wIdx);
        actionsArea.appendChild(hintBtn);
        
        const skipBtn = document.createElement('button');
        skipBtn.innerText = 'NIE UMIEM';
        skipBtn.classList.add('btn-skip-small');
        skipBtn.onclick = () => skipWord(wIdx);
        actionsArea.appendChild(skipBtn);
        
        header.appendChild(actionsArea);
        
        const inputRow = document.createElement('div');
        inputRow.classList.add('word-inputs');
        
        for (let i = 0; i < w.answer.length; i++) {
            const box = document.createElement('div');
            box.classList.add('letter-box');
            
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 1;
            input.dataset.widx = wIdx;
            input.dataset.cidx = i;
            
            input.onfocus = () => {
                startTimer(wIdx);
                const w = words[wIdx];
                // Czas zastanowienia - pierwszy fokus na hasło
                if (!w.focusedAt) {
                    w.focusedAt = Date.now();
                    const thinkTime = w.focusedAt - w.renderTime;
                    logAction('word_focused', {
                        word: w.answer,
                        level: currentLevel,
                        thinkTimeMs: thinkTime,
                        thinkTimeSec: (thinkTime / 1000).toFixed(2)
                    });
                }
            };

            input.oninput = (e) => {
                const w = words[wIdx];
                const now = Date.now();
                lastActivityTime = now;

                e.target.value = e.target.value.toUpperCase();
                startTimer(wIdx);

                // Pierwsza litera wpisana - rejestrujemy czas
                if (!w.firstInputTime) {
                    w.firstInputTime = now;
                }

                // Zapisujemy timestamp litery
                w.letterTimestamps.push({
                    index: i,
                    letter: e.target.value,
                    timestamp: now,
                    isCorrect: e.target.value === w.answer[i]
                });

                // Sprawdzamy czy litera jest błędna
                if (e.target.value && e.target.value !== w.answer[i]) {
                    w.incorrectAttempts++;
                    logAction('incorrect_letter', {
                        word: w.answer,
                        letterIndex: i,
                        entered: e.target.value,
                        expected: w.answer[i],
                        level: currentLevel
                    });
                }

                updateWordStatus(wIdx);
                if (e.target.value) {
                    focusNext(wIdx, i);
                }
                checkCompletion();
            };

            input.onkeydown = (e) => {
                if (e.key === 'Backspace') {
                    words[wIdx].backspaceCount++;
                    if (!e.target.value) {
                        focusPrev(wIdx, i);
                    }
                }
            };
            
            box.appendChild(input);
            inputRow.appendChild(box);
        }
        
        card.appendChild(header);
        card.appendChild(inputRow);
        container.appendChild(card);
    });
}

function startTimer(wIdx) {
    const w = words[wIdx];
    if (w.startTime || w.isCompleted) return;
    
    w.startTime = Date.now();
    w.timerInterval = setInterval(() => {
        updateTimerDisplay(wIdx);
    }, 100);
}

function updateTimerDisplay(wIdx) {
    const w = words[wIdx];
    const badge = document.getElementById(`timer-${wIdx}`);
    if (!badge) return;
    
    const now = w.endTime || Date.now();
    const diff = now - w.startTime;
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const ms = Math.floor((diff % 1000) / 100);
    
    badge.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms}`;
}

function stopTimer(wIdx, method = 'manual') {
    const w = words[wIdx];
    if (w.isCompleted) return;

    w.endTime = Date.now();
    w.isCompleted = true;
    w.solveOrder = ++globalSolveOrder; // Kolejność rozwiązania
    clearInterval(w.timerInterval);

    const durationMs = w.endTime - w.startTime;
    const durationSeconds = (durationMs / 1000).toFixed(1);

    // Obliczamy tempo pisania (średni czas między literami)
    let typingSpeed = 0;
    if (w.letterTimestamps.length > 1) {
        const intervals = [];
        for (let i = 1; i < w.letterTimestamps.length; i++) {
            intervals.push(w.letterTimestamps[i].timestamp - w.letterTimestamps[i-1].timestamp);
        }
        typingSpeed = intervals.length > 0
            ? (intervals.reduce((a,b) => a+b, 0) / intervals.length).toFixed(0)
            : 0;
    }

    // Hint ratio: podpowiedzi / długość hasła
    const hintRatio = (w.hintCount / w.answer.length).toFixed(2);

    const badge = document.getElementById(`timer-${wIdx}`);
    if (badge) badge.classList.add('done');

    const card = document.getElementById(`card-${wIdx}`);
    if (card) card.classList.add('completed');

    // Pełne metryki hasła
    const wordMetrics = {
        word: w.answer,
        kategoria: w.kategoria, // Kategoria semantyczna
        length: w.answer.length,
        durationMs,
        durationSeconds: parseFloat(durationSeconds),
        method,
        level: currentLevel,
        solveOrder: w.solveOrder,
        // Metryki behawioralne
        thinkTimeMs: w.focusedAt ? w.focusedAt - w.renderTime : 0,
        typingSpeedMs: parseInt(typingSpeed), // Średni czas między literami
        incorrectAttempts: w.incorrectAttempts,
        backspaceCount: w.backspaceCount,
        hintCount: w.hintCount,
        hintRatio: parseFloat(hintRatio),
        // Accuracy: czyste rozwiązanie (bez podpowiedzi i bez pominięcia)
        cleanSolve: method === 'manual' && w.hintCount === 0,
        // Analiza trudności
        lettersCount: w.letterTimestamps.length,
        firstLetterTime: w.firstInputTime ? w.firstInputTime - w.startTime : 0,
        letterTimestamps: w.letterTimestamps.map(t => ({
            index: t.index,
            letter: t.letter,
            isCorrect: t.isCorrect,
            relativeTime: t.timestamp - w.startTime
        }))
    };

    logAction('word_completed', wordMetrics);
}

function focusNext(wIdx, cIdx) {
    const next = document.querySelector(`input[data-widx="${wIdx}"][data-cidx="${cIdx + 1}"]`);
    if (next) next.focus();
}

function focusPrev(wIdx, cIdx) {
    const prev = document.querySelector(`input[data-widx="${wIdx}"][data-cidx="${cIdx - 1}"]`);
    if (prev) prev.focus();
}

function updateWordStatus(wIdx, method = 'manual') {
    const inputs = document.querySelectorAll(`input[data-widx="${wIdx}"]`);
    let guess = "";
    inputs.forEach(i => guess += i.value);
    
    if (guess === words[wIdx].answer) {
        inputs.forEach(i => i.parentElement.classList.add('correct'));
        stopTimer(wIdx, method);
    } else {
        inputs.forEach(i => i.parentElement.classList.remove('correct'));
    }
}

function giveHintForWord(wIdx) {
    const w = words[wIdx];
    if (w.isCompleted) return;

    startTimer(wIdx);
    w.hintCount++; // Licznik podpowiedzi

    const inputs = document.querySelectorAll(`input[data-widx="${wIdx}"]`);

    for (let i = 0; i < w.answer.length; i++) {
        if (inputs[i].value !== w.answer[i]) {
            const letter = w.answer[i];
            inputs[i].value = letter;

            // Zapisujemy w letterTimestamps jako podpowiedź
            w.letterTimestamps.push({
                index: i,
                letter: letter,
                timestamp: Date.now(),
                isCorrect: true,
                isHint: true
            });

            logAction('hint_used', {
                word: w.answer,
                letterIndex: i,
                letter: letter,
                hintCount: w.hintCount,
                level: currentLevel
            });

            inputs[i].focus();
            updateWordStatus(wIdx, 'hint');
            checkCompletion();
            return;
        }
    }
}

function skipWord(wIdx) {
    const w = words[wIdx];
    if (w.isCompleted) return;

    startTimer(wIdx);

    // Wypełnij wszystkie litery
    const inputs = document.querySelectorAll(`input[data-widx="${wIdx}"]`);
    for (let i = 0; i < w.answer.length; i++) {
        inputs[i].value = w.answer[i];
        inputs[i].parentElement.classList.add('correct');
    }

    // Oznacz jako pominięte
    w.endTime = Date.now();
    w.isCompleted = true;
    w.solveOrder = ++globalSolveOrder;
    clearInterval(w.timerInterval);

    const durationMs = w.startTime ? w.endTime - w.startTime : 0;

    const badge = document.getElementById(`timer-${wIdx}`);
    if (badge) {
        badge.classList.add('skipped');
        badge.innerText = 'POMINIĘTE';
    }

    const card = document.getElementById(`card-${wIdx}`);
    if (card) card.classList.add('skipped');

    logAction('word_skipped', {
        word: w.answer,
        kategoria: w.kategoria, // Kategoria semantyczna
        length: w.answer.length,
        durationMs,
        durationSeconds: parseFloat((durationMs / 1000).toFixed(1)),
        level: currentLevel,
        solveOrder: w.solveOrder,
        thinkTimeMs: w.focusedAt ? w.focusedAt - w.renderTime : 0,
        incorrectAttempts: w.incorrectAttempts,
        backspaceCount: w.backspaceCount,
        hintCount: w.hintCount,
        cleanSolve: false, // Pominięte = nigdy czyste
        lettersFilledBeforeSkip: Array.from(inputs).filter(i => i.value).length
    });

    checkCompletion();
}

// Funkcja wykrywająca przerwy/pauzy w aktywności
function checkForPauses() {
    if (!lastActivityTime) return;

    const now = Date.now();
    const pauseThreshold = 5000; // 5 sekund przerwy
    const timeSinceLastActivity = now - lastActivityTime;

    if (timeSinceLastActivity > pauseThreshold) {
        // Szukamy aktywnego hasła (tego, na którym użytkownik ostatnio pracował)
        const activeWord = words.find(w => !w.isCompleted && w.focusedAt);
        if (activeWord) {
            logAction('pause_detected', {
                word: activeWord.answer,
                pauseDurationMs: timeSinceLastActivity,
                pauseDurationSec: (timeSinceLastActivity / 1000).toFixed(1),
                level: currentLevel
            });
        }
        lastActivityTime = now; // Reset po zalogowaniu
    }
}

// Sprawdzamy przerwy co 1 sekundę
setInterval(checkForPauses, 1000);

function checkCompletion() {
    const allCorrect = words.every(w => w.isCompleted);
    
    if (allCorrect && words.length > 0) {
        setTimeout(() => {
            if (currentLevel === 1) {
                alert('Świetnie! Zakończyłeś pierwszą rundę (1 z 2).\n\nZaraz rozpocznie się druga, ostatnia runda z nowymi hasłami.');
                currentLevel++;
                generateLevel();
            } else if (currentLevel === 2) {
                alert('DZIĘKUJEMY ZA UDZIAŁ W BADANIU!\n\nRozwiązałeś wszystkie przygotowane hasła. Twoje wyniki zostały bezpiecznie zapisane.\nMożesz teraz zamknąć tę stronę.');
                
                // Wyczyszczenie i zablokowanie UI
                document.getElementById('clue-list').innerHTML = `
                    <div style="text-align:center; padding: 3rem 1rem; color: #1e293b;">
                        <h2 style="font-size: 2rem; margin-bottom: 1rem;">Koniec Badania</h2>
                        <p style="font-size: 1.1rem; color: #475569;">Wszystkie dane zostały zapisane poprawnie.</p>
                        <p style="font-size: 1.1rem; color: #475569; margin-top: 0.5rem;">Dziękujemy za Twój czas!</p>
                    </div>
                `;
                const panHeader = document.querySelector('.panoramic-header h2');
                if (panHeader) panHeader.innerText = 'Badanie Ukończone';
                
                logAction('experiment_completed', { timestamp: new Date().toISOString() });
            }
        }, 600);
    }
}

function initDemographics() {
    const modal = document.getElementById('age-modal');
    const ageButtons = document.querySelectorAll('.age-btn');
    const startBtn = document.getElementById('start-btn');

    // Sprawdź czy dane już są zapisane (refresh strony)
    const savedDemo = sessionStorage.getItem('userDemographics');
    if (savedDemo) {
        userDemographics = JSON.parse(savedDemo);
        modal.classList.add('hidden');
        return Promise.resolve();
    }

    // Wybór grupy wiekowej
    let selectedGroup = null;
    ageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            ageButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedGroup = btn.dataset.group;
            startBtn.disabled = false;
        });
    });

    // Rozpoczęcie badania
    return new Promise((resolve) => {
        startBtn.addEventListener('click', async () => {
            if (!selectedGroup) return;

            userDemographics = {
                ageGroup: selectedGroup,
                isSenior: selectedGroup === '60+',
                timestamp: new Date().toISOString()
            };

            // Zapisz w sessionStorage
            sessionStorage.setItem('userDemographics', JSON.stringify(userDemographics));

            // Zaloguj dane demograficzne
            await logAction('demographics_collected', userDemographics);

            modal.classList.add('hidden');
            resolve();
        });
    });
}

window.onload = async () => {
    await initUser();
    await initDemographics(); // Następnie zbierz dane demograficzne, mając już userId
    await loadData();
};
