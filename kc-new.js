// --- Dexie.js Local Database Setup ---
const localDb = new Dexie("CheckMyStenoDB");
localDb.version(1).stores({
    attempts: '++id, timestamp, dictationName, accuracy, wpm',
    mistakeLibrary: '++id, &[originalWord+typedWord], count',
    overallStats: 'id'
});

// --- Firebase Configuration ---
const firebaseConfig = { apiKey: "AIzaSyDPkUWIrsibI-hzKJ8ljhvawdJ9Nq4-cpE", authDomain: "checkmysteno.firebaseapp.com", projectId: "checkmysteno", storageBucket: "checkmysteno.appspot.com", messagingSenderId: "719325115943", appId: "1:719325115943:web:0dd50a67978816d42a8002" };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Global State Variables ---
let player, originalText = "", wordCount = 0;
let totalVideoDuration = 0, currentPlaybackRate = 1, progressInterval;
let g_vol = "", g_tran = "", candidateId, attemptsRef;
let transcriptionTimerTotalTime = 0, timeLeft = 0, timer = null, timerStarted = false;
let g_alignment = []; // This will now be populated by the evaluation logic
let allPassageData = [];
let g_lastTypedText = "";
let isReevaluateModeActive = false;

document.addEventListener("DOMContentLoaded", initializePracticeKC);

// --- Anti-Cheating & Setup ---
function setupAntiInspection() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) || (e.ctrlKey && e.key === 'u')) {
            e.preventDefault();
        }
    });
    const typingBox = document.getElementById('typingBox');
    if (typingBox) {
        typingBox.addEventListener('contextmenu', (e) => e.stopPropagation());
    }
}

function setLogoSource() {
    const defaultLogo = ""; 
    const logoImg = document.getElementById('ssc-logo-img');
    if (logoImg) logoImg.src = defaultLogo || "";
}

// --- Initialization ---
async function initializePracticeKC() {
    const accessCode = localStorage.getItem("currentAccessCode");
    if (!accessCode) {
        showErrorModal("Access Denied", "No access code found. Please log in first.");
        document.body.innerHTML = '';
        return;
    }
    candidateId = accessCode;
    document.getElementById('candidate-name-display').textContent = candidateId.toUpperCase();
    attemptsRef = db.collection("testAnalysis").doc(candidateId).collection("attempts");

    setupAntiInspection();
    setupProgressBar();
    setupExtraControls();
    setLogoSource();
    restoreSession();

    await generateAllPassageData();
    renderGrid();

    initializeEventListeners();
    renderQuickResume();
}

// --- Passage Data and Grid Rendering ---
function generateAllPassageData() {
    allPassageData = [];
    let transcriptCounter = 1;
    for (let i = 1; i <= 24; i++) {
        for (let j = 1; j <= 22; j++) {
            allPassageData.push({
                id: `passage-${i}-${j}`,
                volume: i,
                transcript: transcriptCounter,
                transcriptNumber: transcriptCounter,
                volId: `vol${i}`,
                tranId: `t${transcriptCounter}`
            });
            transcriptCounter++;
        }
    }
}

function renderGrid() {
    const grid = document.getElementById('passage-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const progressData = JSON.parse(localStorage.getItem(`kcProgress_${candidateId}`) || '{}');
    let dataToRender = [...allPassageData];

    const filterValue = document.getElementById('filter-select').value;
    if (filterValue !== 'all') {
        dataToRender = dataToRender.filter(passage => {
            const key = `${passage.volId}-${passage.tranId}`;
            const hasAttempt = !!progressData[key];
            return (filterValue === 'attempted' && hasAttempt) || (filterValue === 'not-attempted' && !hasAttempt);
        });
    }

    const sortValue = document.getElementById('sort-select').value;
    if (sortValue !== 'default') {
        dataToRender.sort((a, b) => {
            const keyA = `${a.volId}-${a.tranId}`;
            const keyB = `${b.volId}-${b.tranId}`;
            const scoreA = progressData[keyA] ? progressData[keyA].accuracy : -1;
            const scoreB = progressData[keyB] ? progressData[keyB].accuracy : -1;
            if (sortValue === 'score-asc') return scoreA - scoreB;
            if (sortValue === 'score-desc') return scoreB - scoreA;
            return 0;
        });
    }

    const searchTerm = document.getElementById('passageSearch').value.toLowerCase();
    if (searchTerm) {
        dataToRender = dataToRender.filter(p => {
            const title = `vol ${p.volume} / tran ${p.transcript}`;
            const passageNum = `passage ${p.transcriptNumber}`;
            return title.includes(searchTerm) || passageNum.includes(searchTerm);
        });
    }

    const fragment = document.createDocumentFragment();
    dataToRender.forEach(data => {
        const card = document.createElement('div');
        card.className = 'passage-card';
        card.id = data.id;
        card.dataset.volume = data.volId;
        card.dataset.transcript = data.tranId;

        const key = `${data.volId}-${data.tranId}`;
        const attemptData = progressData[key];
        const isAttempted = !!attemptData;

        card.innerHTML = `
              <div class="card-header">
                  <div class="card-title-group">
                      <span class="status-dot ${isAttempted ? 'attempted' : ''}"></span>
                      <h3>Passage ${data.transcriptNumber}</h3>
                  </div>
                  <div class="status-tag ${isAttempted ? 'attempted' : ''}">
                      ${isAttempted ? `${attemptData.accuracy}% | ${attemptData.wpm} WPM` : 'Not Attempted'}
                  </div>
              </div>
              <div class="card-meta">Vol ${data.volume} / KC</div>
              <div class="card-buttons">
                  <button class="take-test-btn">Take Test</button>
              </div>
          `;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

// --- Application State and View Management ---
function saveState(state) { localStorage.setItem('stenoState', JSON.stringify(state)); }
function clearState() { localStorage.removeItem('stenoState'); }

function restoreSession() {
    const savedState = JSON.parse(localStorage.getItem('stenoState'));
    if (!savedState) {
        showView('selection-view');
        return;
    }
    if (savedState.view === 'exam-view') {
        g_vol = savedState.g_vol;
        g_tran = savedState.g_tran;
        originalText = savedState.originalText;
        wordCount = savedState.wordCount;
        showView('exam-view');
        document.documentElement.requestFullscreen().catch(err => { });
        document.getElementById('typingBox').value = savedState.typedText || '';
        transcriptionTimerTotalTime = savedState.totalTime;
        timeLeft = savedState.timeLeft;
        timerStarted = true;
        startTimer();
    } else {
        showView('selection-view');
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.getElementById('exam-view').style.display = 'none';
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) viewToShow.style.display = 'block';

    if (viewId === 'exam-view') {
        document.querySelector('.app-container').style.display = 'none';
        document.getElementById('exam-view').style.display = 'flex';
    } else {
        document.querySelector('.app-container').style.display = 'block';
    }

    if (viewId === 'selection-view') {
        clearState();
        if (player && typeof player.stopVideo === 'function') player.stopVideo();
        renderGrid();
        renderQuickResume();
    }
}

function goHome() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    showView('selection-view');
}

function clearStateAndGoBack() {
    showView('selection-view');
}

// --- Player and Test Logic ---
async function loadPractice(volumeId, transcriptId) {
    g_vol = volumeId;
    g_tran = transcriptId;
    if (!g_vol || !g_tran) {
        showErrorModal("Passage Error", "Could not identify the passage. Please try again.");
        return;
    }
    document.getElementById('fullPageLoader').style.display = 'flex';
    try {
        const textDoc = await db.collection("volumes").doc(g_vol).collection("transcripts").doc(g_tran).get();
        if (!textDoc.exists) throw new Error("Transcript text not found.");
        originalText = textDoc.data().text;
        const audioDoc = await db.collection("audioLinks").doc(g_vol).collection("transcripts").doc(g_tran).get();
        if (!audioDoc.exists) throw new Error("Audio link document not found.");
        const audioData = audioDoc.data();
        if (!audioData || !audioData.audioUrl || typeof audioData.wordCount !== 'number') throw new Error("Audio document is missing required fields.");
        wordCount = audioData.wordCount;

        saveState({ view: 'player-view', g_vol, g_tran, originalText, wordCount, audioUrl: audioData.audioUrl });

        showView('player-view');
        setPlayerLoading(true);
        const passageData = allPassageData.find(p => p.volId === g_vol && p.tranId === g_tran);
        document.getElementById('player-subtitle').textContent = `Kailash Chandra - Passage ${passageData.transcriptNumber}`;
        loadVideo(audioData.audioUrl, false);
    } catch (error) {
        showErrorModal("Loading Error", "Error: " + error.message);
        showView('selection-view');
    } finally {
        document.getElementById('fullPageLoader').style.display = 'none';
    }
}

function showInstructions() {
    if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
    document.getElementById('instructions-modal').classList.add('visible');
}

function startTranscriptionTest() {
    document.getElementById('instructions-modal').classList.remove('visible');
    document.documentElement.requestFullscreen().catch(err => console.warn(`Fullscreen failed: ${err.message}.`));
    showView('exam-view');
    transcriptionTimerTotalTime = parseInt(document.getElementById('timer-select').value) * 60;
    timeLeft = transcriptionTimerTotalTime;
    document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
    document.getElementById('typingBox').value = '';
    document.getElementById('typingBox').focus();
    document.getElementById('typingBox').addEventListener('keydown', handleFirstKeydown);
    const currentState = JSON.parse(localStorage.getItem('stenoState'));
    saveState({ ...currentState, view: 'exam-view', totalTime: transcriptionTimerTotalTime, timeLeft: timeLeft, typedText: '' });
}

function handleFirstKeydown() {
    if (!timerStarted) {
        timerStarted = true;
        startTimer();
        document.getElementById('typingBox').removeEventListener('keydown', handleFirstKeydown);
    }
}

function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
        if (--timeLeft < 0) {
            clearInterval(timer);
            alert("Time is up! Submitting automatically.");
            submitTranscription();
        } else {
            document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
            const currentState = JSON.parse(localStorage.getItem('stenoState'));
            if (currentState) saveState({ ...currentState, timeLeft, typedText: document.getElementById('typingBox').value });
        }
    }, 1000);
}

function resetTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    timerStarted = false;
    timeLeft = transcriptionTimerTotalTime;
    document.getElementById("typingTimerDisplay").innerText = formatTime(timeLeft);
}

// --- YouTube Player Controls ---
function onYouTubeIframeAPIReady() { }
function extractVideoID(url) { if (typeof url !== 'string') return null; const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/; return (url.match(regex) || [])[1] || null; }

function loadVideo(url, autoPlay = false) {
    const videoId = extractVideoID(url);
    if (!videoId) { showErrorModal("Invalid URL", "Invalid YouTube URL provided: " + url); return; }
    const onPlayerReady = (event) => {
        totalVideoDuration = event.target.getDuration();
        setPlayerLoading(false);
        setPlaybackSpeed();
    };
    if (player && typeof player.loadVideoById === 'function' && player.getIframe()?.isConnected) {
        player.loadVideoById(videoId);
        const readyCheck = setInterval(() => {
            if (player.getDuration() > 0 && player.getPlayerState() !== -1) { clearInterval(readyCheck); onPlayerReady({ target: player }); }
        }, 100);
    } else {
        if (player && typeof player.destroy === 'function') player.destroy();
        player = new YT.Player('player', { height: '1', width: '1', videoId, playerVars: { 'autoplay': autoPlay ? 1 : 0, 'controls': 0 }, events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange } });
    }
}

function onPlayerStateChange(event) {
    const playBtn = document.getElementById("playBtn"), pauseBtn = document.getElementById("pauseBtn");
    if (event.data === YT.PlayerState.PLAYING) { playBtn.style.display = 'none'; pauseBtn.style.display = 'flex'; trackProgress(); }
    else { playBtn.style.display = 'flex'; pauseBtn.style.display = 'none'; clearInterval(progressInterval); }
}

function setPlaybackSpeed() {
    if (!player || !player.setPlaybackRate) return;
    const targetWPM = parseInt(document.getElementById('wpmSpeed').value);
    if (isNaN(targetWPM) || !wordCount || !totalVideoDuration) currentPlaybackRate = 1;
    else { const originalWPM = wordCount / (totalVideoDuration / 60); currentPlaybackRate = originalWPM > 0 ? targetWPM / originalWPM : 1; }
    player.setPlaybackRate(currentPlaybackRate);
    updateVideoTimeDisplay();
}

function togglePlay() { if (!player || !player.getPlayerState) return; player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo(); }
function restartVideo() { if (player) { player.seekTo(0, true); player.playVideo(); } }
function seekRelative(seconds) { if (!player || !player.getCurrentTime) return; const newTime = player.getCurrentTime() + seconds; player.seekTo(newTime, true); }
function trackProgress() { clearInterval(progressInterval); progressInterval = setInterval(updateVideoTimeDisplay, 250); }
function setupProgressBar() { document.getElementById("progressBar").addEventListener("click", function (e) { if (!player || !player.seekTo || !totalVideoDuration) return; const rect = e.currentTarget.getBoundingClientRect(); const clickPosition = (e.clientX - rect.left) / rect.width; player.seekTo(clickPosition * totalVideoDuration, true); }); }
function formatTime(s) { const m = Math.floor(s / 60).toString().padStart(2, '0'); const sec = Math.round(s % 60).toString().padStart(2, '0'); return isNaN(m) || isNaN(sec) ? "00:00" : `${m}:${sec}` }
function updateVideoTimeDisplay() { if (!player || typeof player.getCurrentTime !== 'function') return; const rawCurrentTime = player.getCurrentTime(); const effectiveCurrentTime = rawCurrentTime / currentPlaybackRate; const effectiveTotalDuration = totalVideoDuration / currentPlaybackRate; document.getElementById("progress-fill").style.width = (rawCurrentTime / totalVideoDuration) * 100 + "%"; document.getElementById('current-time').innerText = formatTime(effectiveCurrentTime); document.getElementById('total-time').innerText = formatTime(effectiveTotalDuration); }
function setPlayerLoading(isLoading) { document.getElementById('player-loader').style.display = isLoading ? 'flex' : 'none'; document.querySelectorAll('#player-view button, #player-view select').forEach(el => { if (el.id !== 'startTranscriptionBtn') el.disabled = isLoading; }); document.getElementById('startTranscriptionBtn').disabled = true; if (!isLoading) document.getElementById('startTranscriptionBtn').disabled = false; }
function setupExtraControls() { document.getElementById('volume-slider').addEventListener('input', (e) => player?.setVolume(e.target.value)); document.addEventListener('keydown', (e) => { if (document.getElementById('player-view').style.display === 'block') { if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); togglePlay(); } if (e.code === 'ArrowLeft') { e.preventDefault(); seekRelative(-5); } if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(5); } } }); const today = new Date(); document.getElementById('exam-date').innerHTML = `<b>Exam Date:</b> ${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`; }
function adjustSpeed(amount) { const select = document.getElementById('wpmSpeed'); const currentIndex = select.selectedIndex; const newIndex = currentIndex + (amount / 5); if (newIndex >= 0 && newIndex < select.options.length) { select.selectedIndex = newIndex; setPlaybackSpeed(); } }

// --- Result Processing and Display ---
function escapeHtml(s = "") { return s.toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderResultSheet(analysisResult, isReevaluation = false) {
    g_alignment = analysisResult.alignment; // Store the alignment globally for other functions to use

    if (isReevaluation) {
        // Handle re-evaluation UI update
        const reevalContainer = document.getElementById('reevaluated-accuracy-container');
        if(reevalContainer) reevalContainer.innerHTML = `<div class="stats-row"><div class="stat-pill" style="background-color: var(--accent-purple);">Re-evaluated Accuracy: ${analysisResult.accuracy}%</div></div>`;
        
        document.getElementById('editableTypedText').innerHTML = buildResultHtml(g_alignment);
        let originalTextHtml = g_alignment.map((entry, index) => (entry.type === 'ins') ? '' : `<span class="word-wrapper" data-index="${index}" data-mistake-type="${entry.mistakeType}">${escapeHtml(entry.o || '')}</span>`).join(' ');
        document.getElementById('editableOriginalText').innerHTML = originalTextHtml;
        initializeResultInteractivity(); // Re-attach listeners
    } else {
        // Handle initial result sheet rendering
        const container = document.getElementById('resultSheetContainer');
        const dictationName = `Kailash Chandra - Volume ${g_vol.replace('vol', '')} / Transcript ${g_tran.replace('t', '')}`;
        const testDate = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
        
        const highlightedHtml = buildResultHtml(g_alignment);
        let originalTextHtml = g_alignment.map((entry, index) => (entry.type === 'ins') ? '' : `<span class="word-wrapper" data-index="${index}" data-mistake-type="${entry.mistakeType}">${escapeHtml(entry.o || '')}</span>`).join(' ');
        
        container.innerHTML = `
        <div class="result-sheet-container">
            <h1>Result Sheet:</h1>
            <div class="stats-container">
                <div class="stats-row"><div class="stat-pill full-width">${escapeHtml(dictationName)}</div></div>
                <div class="stats-row">
                    <div class="stat-pill">Total words: ${analysisResult.totalWords}</div>
                    <div class="stat-pill">Typed words: ${analysisResult.typedWords}</div>
                    <div class="stat-pill">Typing Speed: ${analysisResult.typingSpeed} WPM</div>
                </div>
                <div class="stats-row">
                    <div class="stat-pill red">Full Mistakes: ${analysisResult.fullMistakes}</div>
                    <div class="stat-pill amber">Half Mistakes: ${analysisResult.halfMistakes}</div>
                    <div class="stat-pill">Total % of Mistakes: ${analysisResult.mistakePercent}%</div>
                    <div class="stat-pill">Accuracy: ${analysisResult.accuracy}%</div>
                </div>
                <div id="reevaluated-accuracy-container"></div>
                <div class="stats-row"><div class="stat-pill">Test Date: ${escapeHtml(testDate)}</div></div>
            </div>
            <div class="legend-container">
                 <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-additions);"></span> Additions / Substitutions</div>
                <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-omissions);"></span> Omissions</div>
                <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-spelling);"></span> Spelling Mistakes</div>
                <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-capitalization);"></span> Capitalization Mistakes</div>
                <div class="legend-item"><span class="legend-color-box" style="background-color: var(--hl-punctuation);"></span> Punctuation Mistakes</div>
            </div>
            <div class="result-controls">
                <div class="filter-section">
                    <label for="mistakeFilter">Filter Mistakes:</label>
                    <select id="mistakeFilter" onchange="filterMistakes(this.value)"><option value="all">Show All Mistakes</option><option value="omission">Omissions Only</option><option value="extra">Additions Only</option><option value="spelling">Spelling Only</option><option value="capitalization">Capitalization Only</option><option value="punctuation">Punctuation Only</option></select>
                </div>
                <div class="action-section"><div class="reevaluate-wrapper"><button id="toggleReevaluateBtn" class="view-switch-btn">Enter Re-evaluate Mode</button><span class="tooltip-icon" data-tooltip="Enter a special mode to edit BOTH your text and the original text, then recalculate your score to see the difference.">?</span></div><button id="reportErrorBtn" class="view-switch-btn" style="background-color: #f97316; color: white;">Report Error</button></div>
                <button id="viewSwitchBtn" class="view-switch-btn">Switch to Top/Bottom View</button>
            </div>
            <div id="comparisonColumns" class="columns view-side-by-side">
                <div class="col" id="typedCol"><strong>Your Transcription:</strong><p id="editableTypedText" contenteditable="false">${highlightedHtml}</p></div>
                <div class="col" id="originalCol"><strong>Original Text (Click to edit):</strong><p id="editableOriginalText" contenteditable="false">${originalTextHtml}</p></div>
            </div>
        </div>`;

        if (!localStorage.getItem('hideResultsWelcome')) document.getElementById('resultsWelcomeModal').classList.add('visible');

        document.getElementById('viewSwitchBtn').addEventListener('click', () => {
            const columnsContainer = document.getElementById('comparisonColumns'), typedCol = document.getElementById('typedCol'), originalCol = document.getElementById('originalCol');
            const isSideBySide = columnsContainer.classList.contains('view-side-by-side');
            if (isSideBySide) {
                columnsContainer.classList.remove('view-side-by-side');
                columnsContainer.classList.add('view-top-bottom');
                columnsContainer.prepend(typedCol);
                document.getElementById('viewSwitchBtn').textContent = 'Switch to Side-by-Side View';
            } else {
                columnsContainer.classList.remove('view-top-bottom');
                columnsContainer.classList.add('view-side-by-side');
                columnsContainer.appendChild(originalCol);
                document.getElementById('viewSwitchBtn').textContent = 'Switch to Top/Bottom View';
            }
        });
        document.getElementById('printReportBtn').addEventListener('click', () => window.print());
        initializeResultInteractivity();
    }
}

function buildResultHtml(alignment) {
    let resultHtmlContent = "";
    for (let k = 0; k < alignment.length; k++) {
        const entry = alignment[k];
        let wordHtml = '', tooltipText = '', statusIcon = '✔️';
        
        switch(entry.mistakeType) {
            case 'correct':
                wordHtml = `<span>${escapeHtml(entry.t || '')}</span>`;
                tooltipText = "Correct";
                break;
            case 'capitalization':
                tooltipText = `Capitalization: Typed "${escapeHtml(entry.t)}" (was "${escapeHtml(entry.o)}")`;
                wordHtml = `<span class='highlight capitalization' data-mistake-type='${entry.mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(entry.t)}</span>`;
                statusIcon = '⚠️';
                break;
            case 'punctuation':
                tooltipText = `Punctuation: Typed "${escapeHtml(entry.t)}" (was "${escapeHtml(entry.o)}")`;
                wordHtml = `<span class='highlight punctuation' data-mistake-type='${entry.mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(entry.t)}</span>`;
                statusIcon = '⚠️';
                break;
            case 'omission':
                tooltipText = `Omitted: "${escapeHtml(entry.o)}"`;
                wordHtml = `<span class='highlight omission' data-mistake-type='${entry.mistakeType}' data-tooltip-text='${tooltipText}'>(${escapeHtml(entry.o)})</span>`;
                statusIcon = '❌';
                break;
            case 'extra':
                tooltipText = `Extra Word: "${escapeHtml(entry.t)}"`;
                wordHtml = `<span class='highlight extra' data-mistake-type='${entry.mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(entry.t)}</span>`;
                statusIcon = '❌';
                break;
            case 'spelling':
                tooltipText = `You typed: "${escapeHtml(entry.t)}" (was "${escapeHtml(entry.o)}")`;
                wordHtml = `<span class='highlight spelling' data-mistake-type='${entry.mistakeType}' data-tooltip-text='${tooltipText}'>${escapeHtml(entry.t)} (<b>${escapeHtml(entry.o)}</b>)</span>`;
                statusIcon = '⚠️';
                break;
        }

        entry.statusIcon = statusIcon;
        resultHtmlContent += `<span class="word-wrapper" data-index="${k}" data-status-icon="${statusIcon}" data-mistake-type="${entry.mistakeType}">${wordHtml}</span> `;
    }
    return resultHtmlContent;
}

// =================================================================================
// CHANGE 3: The entire submitTranscription function is replaced with this new
// async version that uses the Web Worker for evaluation.
// =================================================================================
async function submitTranscription() {
    const timeTakenSeconds = (transcriptionTimerTotalTime - timeLeft) > 0 ? (transcriptionTimerTotalTime - timeLeft) : 0;
    clearState();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    // Show the loader and set the initial message
    const loader = document.getElementById('fullPageLoader');
    const loaderMessage = document.getElementById('loaderMessage');
    loaderMessage.textContent = 'Starting analysis...';
    loader.style.display = 'flex';

    try {
        if (!originalText) throw new Error("Original transcript not found.");

        const typedText = document.getElementById('typingBox').value;
        g_lastTypedText = typedText;

        if (typedText.trim().split(/\s+/).filter(Boolean).length < 10) {
            alert("Please type at least 10 words.");
            goHome();
            loader.style.display = 'none';
            return;
        }
        
        // Use the common worker. IMPORTANT: Update this path if you moved the worker.js file.
        const analysisWorker = new Worker('/scripts/worker.js');

        analysisWorker.onmessage = function(event) {
            const data = event.data;

            if (data.type === 'progress') {
                loaderMessage.textContent = data.message;
            } else if (data.type === 'result') {
                const analysisResult = data.payload;

                showView('results-view');
                renderResultSheet(analysisResult, false);

                saveProgressToLocalStorage(analysisResult);
                saveAttemptHybrid(originalText, typedText, analysisResult);

                loader.style.display = 'none';
                analysisWorker.terminate();
                resetTimer();
            }
        };

        const analysisOptions = {
            countCommaMistakes: document.getElementById("includeComma")?.checked
        };
        
        analysisWorker.postMessage({
            originalText: g_lastTypedText,
            typedText: typedText,
            timeTakenSeconds: timeTakenSeconds,
            options: analysisOptions
        });

    } catch (error) {
        console.error("!!! ERROR during transcription processing:", error);
        showErrorModal("Result Error", "An error occurred while generating your results. Please try again.");
        loader.style.display = 'none';
        goHome();
    }
}

// --- Data Saving and Progress ---
function saveProgressToLocalStorage(resultData) {
    if (!candidateId) return;
    const key = `${g_vol}-${g_tran}`;
    const progressData = JSON.parse(localStorage.getItem(`kcProgress_${candidateId}`) || '{}');

    const newScore = {
        accuracy: parseFloat(resultData.accuracy),
        wpm: parseFloat(resultData.typingSpeed),
    };

    const existingScore = progressData[key];
    if (!existingScore || newScore.accuracy > existingScore.accuracy) {
        progressData[key] = newScore;
        localStorage.setItem(`kcProgress_${candidateId}`, JSON.stringify(progressData));
    }

    localStorage.setItem(`kcLastAttempt_${candidateId}`, JSON.stringify({ vol: g_vol, tran: g_tran }));
}

async function resetProgress() {
    if (!candidateId || !attemptsRef) {
        showErrorModal("Action Failed", "Cannot reset progress. User not identified.");
        return;
    }

    localStorage.removeItem(`kcProgress_${candidateId}`);
    localStorage.removeItem(`kcLastAttempt_${candidateId}`);
    localStorage.removeItem('hideResultsWelcome');

    try {
        await localDb.attempts.clear();
        await localDb.overallStats.clear();
        await localDb.mistakeLibrary.clear();
        console.log("Local database cleared.");

        const querySnapshot = await attemptsRef.get();
        const deletePromises = [];
        querySnapshot.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        await Promise.all(deletePromises);
        console.log("Firebase attempts cleared.");

        alert("Your progress has been successfully reset.");
        window.location.reload();
    } catch (error) {
        console.error("Error during reset:", error);
        showErrorModal("Reset Error", "Could not clear all data. Please check your connection and try again.");
    }
}

async function updateMistakeLibrary(alignmentData) {
    const spellingMistakes = alignmentData.filter(e => e.type === 'sub');
    if (spellingMistakes.length === 0) return;

    await localDb.transaction('rw', localDb.mistakeLibrary, async () => {
        for (const mistake of spellingMistakes) {
            const originalWord = (mistake.o || '').replace(/[.,]$/, '').toLowerCase();
            const typedWord = (mistake.t || '').replace(/[.,]$/, '').toLowerCase();
            if (!originalWord || !typedWord || originalWord === typedWord) continue;

            const existingEntry = await localDb.mistakeLibrary.where({ originalWord, typedWord }).first();
            if (existingEntry) {
                await localDb.mistakeLibrary.update(existingEntry.id, { count: existingEntry.count + 1 });
            } else {
                await localDb.mistakeLibrary.add({ originalWord, typedWord, count: 1 });
            }
        }
    });
    console.log(`📚 ${spellingMistakes.length} spelling mistake(s) processed for the library.`);
}

async function updateOverallStats(newAttemptStats) {
    await localDb.transaction('rw', localDb.overallStats, async () => {
        const stats = await localDb.overallStats.get(1);
        const accuracy = parseFloat(newAttemptStats.accuracy);
        const wpm = parseFloat(newAttemptStats.typingSpeed);

        if (!stats) {
            await localDb.overallStats.put({ id: 1, totalAttempts: 1, bestAccuracy: accuracy, bestWPM: wpm, avgAccuracy: accuracy, avgWpm: wpm });
            return;
        }

        const newTotal = (stats.totalAttempts || 0) + 1;
        const newAvgAccuracy = ((stats.avgAccuracy * stats.totalAttempts) + accuracy) / newTotal;
        const newAvgWpm = ((stats.avgWpm * stats.totalAttempts) + wpm) / newTotal;

        await localDb.overallStats.put({ id: 1, totalAttempts: newTotal, avgAccuracy: newAvgAccuracy, avgWpm: newAvgWpm, bestAccuracy: Math.max(stats.bestAccuracy, accuracy), bestWPM: Math.max(stats.bestWPM, wpm) });
    });
}

async function saveAttemptHybrid(original, typed, analysisResult) {
    if (!candidateId) { console.error("Candidate not initialized, cannot save."); return; }

    const fullResultData = {
        timestamp: new Date().toISOString(),
        dictationName: `Kailash Chandra - Volume ${g_vol.replace('vol', '')} / Transcript ${g_tran.replace('t', '')}`,
        accuracy: parseFloat(analysisResult.accuracy),
        wpm: parseFloat(analysisResult.typingSpeed),
        originalText: original,
        typedText: typed,
        fullMistakes: analysisResult.fullMistakes,
        halfMistakes: analysisResult.halfMistakes,
        highlightedHtml: document.getElementById('editableTypedText').innerHTML,
    };

    try {
        await localDb.attempts.add(fullResultData);
        console.log("✅ Full attempt with HTML saved locally.");

        await updateOverallStats(analysisResult);
        await updateMistakeLibrary(analysisResult.alignment);

        await sendLightweightStatsToFirebase(analysisResult);

    } catch (err) {
        console.error("❌ Failed to save attempt using hybrid system:", err);
    }
}

async function sendLightweightStatsToFirebase(analysisResult) {
    const timeTakenSeconds = (transcriptionTimerTotalTime - timeLeft) > 0 ? (transcriptionTimerTotalTime - timeLeft) : 0;
    const lightweightStat = {
        accuracy: analysisResult.accuracy + "%",
        wpm: analysisResult.typingSpeed,
        timeTakenSeconds: timeTakenSeconds,
        totalWords: analysisResult.totalWords,
        volume: g_vol,
        transcript: g_tran,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (attemptsRef) {
        try { await attemptsRef.add(lightweightStat); console.log("✅ Lightweight stats sent to Firebase."); }
        catch (e) { console.error("Firebase save failed:", e); }
    }
}

// --- Event Listeners and Interactivity ---
function initializeEventListeners() {
    document.getElementById('passage-grid').addEventListener('click', (e) => {
        const button = e.target.closest('.take-test-btn');
        if (button) { const card = button.closest('.passage-card'); loadPractice(card.dataset.volume, card.dataset.transcript); }
    });
    document.getElementById('passageSearch').addEventListener('input', debounce(renderGrid, 300));
    document.getElementById('filter-select').addEventListener('change', renderGrid);
    document.getElementById('sort-select').addEventListener('change', renderGrid);
    document.getElementById('startFirstTestBtn').addEventListener('click', () => document.querySelector('.passage-card .take-test-btn')?.click());
    document.getElementById('error-close-btn').addEventListener('click', () => document.getElementById('error-modal').classList.remove('visible'));

    const resetModal = document.getElementById('resetConfirmModal');
    document.getElementById('resetProgressBtn').addEventListener('click', () => resetModal.classList.add('visible'));
    document.getElementById('cancelResetBtn').addEventListener('click', () => resetModal.classList.remove('visible'));
    document.getElementById('confirmResetBtn').addEventListener('click', () => { resetProgress(); resetModal.classList.remove('visible'); });

    const welcomeModal = document.getElementById('resultsWelcomeModal');
    document.getElementById('closeWelcomeBtn').addEventListener('click', () => { if (document.getElementById('dontShowAgainCheckbox').checked) localStorage.setItem('hideResultsWelcome', 'true'); welcomeModal.classList.remove('visible'); });

    const reportModal = document.getElementById('reportErrorModal');
    document.getElementById('cancelReportBtn').addEventListener('click', () => reportModal.classList.remove('visible'));
    document.getElementById('submitReportBtn').addEventListener('click', submitErrorReport);
    document.getElementById('errorTypeSelect').addEventListener('change', validateReportForm);
    document.getElementById('otherErrorText').addEventListener('input', validateReportForm);
    
    window.addEventListener('beforeunload', function (e) { if (document.getElementById('results-view').style.display === 'block') { const msg = 'Are you sure you want to leave? Your corrected transcript and re-evaluated score will not be saved. Please download the report first.'; (e || window.event).returnValue = msg; return msg; } });
}

function initializeResultInteractivity() {
    const columns = document.getElementById('comparisonColumns');
    if (!columns) return;
    
    columns.addEventListener('click', (e) => {
        const target = e.target.closest('.word-wrapper');
        if (!target) return;
        const wordIndex = target.dataset.index;
        if (wordIndex === null) return;
        document.querySelectorAll('.active-highlight').forEach(el => el.classList.remove('active-highlight'));
        document.querySelectorAll(`.word-wrapper[data-index="${wordIndex}"]`).forEach(el => el.classList.add('active-highlight'));
        const otherColId = target.closest('.col').id === 'typedCol' ? 'originalCol' : 'typedCol';
        const correspondingWord = document.querySelector(`#${otherColId} .word-wrapper[data-index="${wordIndex}"]`);
        if (correspondingWord) correspondingWord.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    document.getElementById('toggleReevaluateBtn').addEventListener('click', toggleReevaluateMode);
    document.getElementById('reportErrorBtn').addEventListener('click', showReportModal);
}

// =================================================================================
// CHANGE 4: The entire toggleReevaluateMode function is replaced with this new
// version that uses the Web Worker for re-evaluation and shows the spinner.
// =================================================================================
function toggleReevaluateMode() {
    isReevaluateModeActive = !isReevaluateModeActive;
    const resultsView = document.getElementById('results-view');
    const toggleBtn = document.getElementById('toggleReevaluateBtn');
    const typedTextP = document.getElementById('editableTypedText');
    const originalTextP = document.getElementById('editableOriginalText');

    if (isReevaluateModeActive) {
        resultsView.classList.add('reevaluate-mode-active');
        toggleBtn.textContent = 'Calculate & Exit Mode';
        toggleBtn.style.backgroundColor = 'var(--accent-purple)'; 
        toggleBtn.style.color = 'white';
        
        typedTextP.innerHTML = getCleanTextFromAlignment('typed');
        originalTextP.innerHTML = getCleanTextFromAlignment('original');
        typedTextP.contentEditable = true; 
        originalTextP.contentEditable = true;
        alert("Re-evaluate Mode is ON. You can now edit both your transcription and the original text.");
    } else {
        // --- THIS IS THE EXIT and RE-EVALUATION LOGIC ---
        resultsView.classList.remove('reevaluate-mode-active');
        toggleBtn.textContent = 'Enter Re-evaluate Mode';
        toggleBtn.style.backgroundColor = ''; 
        toggleBtn.style.color = '';

        const correctedOriginalText = originalTextP.innerText;
        const correctedTypedText = typedTextP.innerText;
        g_lastTypedText = correctedTypedText;
        typedTextP.contentEditable = false; 
        originalTextP.contentEditable = false;
        
        // Show the interactive loader
        const loader = document.getElementById('fullPageLoader');
        const loaderMessage = document.getElementById('loaderMessage');
        loaderMessage.textContent = 'Re-evaluating score...';
        loader.style.display = 'flex';

        // Use the common worker for re-calculation
        const reevaluateWorker = new Worker('/scripts/worker.js');

        reevaluateWorker.onmessage = function(event) {
            const data = event.data;

            if (data.type === 'progress') {
                loaderMessage.textContent = data.message;
            } else if (data.type === 'result') {
                const analysisResult = data.payload;

                // Use the existing render function to update the UI
                renderResultSheet(analysisResult, true); 
                
                alert("Score has been re-evaluated with your corrections. Note: This updated score is for your reference only and is not saved.");
                
                // Hide loader and clean up
                loader.style.display = 'none';
                reevaluateWorker.terminate();
            }
        };

        const analysisOptions = {
            countCommaMistakes: document.getElementById("includeComma")?.checked
        };
        
        reevaluateWorker.postMessage({
            originalText: correctedOriginalText || originalText, // Fallback to original if user deletes everything
            typedText: correctedTypedText,
            timeTakenSeconds: 0, // Time is not relevant for re-evaluation
            options: analysisOptions
        });
    }
}


function getCleanTextFromAlignment(type = 'typed') {
    if (!g_alignment || g_alignment.length === 0) return "";
    let textParts = g_alignment.map(entry => {
        if (type === 'typed') return (entry.type === 'match' || entry.type === 'sub' || entry.type === 'ins') ? entry.t || '' : null;
        else return (entry.type === 'match' || entry.type === 'sub' || entry.type === 'del') ? entry.o || '' : null;
    }).filter(part => part !== null);
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

// --- Error Reporting ---
function validateReportForm() {
    const errorType = document.getElementById('errorTypeSelect').value;
    const otherText = document.getElementById('otherErrorText').value.trim();
    document.getElementById('submitReportBtn').disabled = !(errorType && otherText);
}

function showReportModal() {
    document.getElementById('reportErrorModal').classList.add('visible');
    validateReportForm();
}

async function submitErrorReport() {
    const reportModal = document.getElementById('reportErrorModal');
    const reportData = {
        candidateId: candidateId,
        volume: g_vol,
        transcript: g_tran,
        originalTextInSystem: originalText,
        userCorrectedText: document.getElementById('editableOriginalText').innerText,
        reason: `${document.getElementById('errorTypeSelect').value}: ${document.getElementById('otherErrorText').value}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        await db.collection("transcriptionReports").add(reportData);
        alert("Thank you! Your report has been submitted successfully.");
        reportModal.classList.remove('visible');
    } catch (error) {
        console.error("Error submitting report:", error);
        alert("Could not submit report. Please check your internet connection.");
    }
}

// --- Utility Functions ---
function debounce(func, delay) { let timeout; return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
function showErrorModal(title, message) { document.getElementById('error-title').textContent = title; document.getElementById('error-message').textContent = message; document.getElementById('error-modal').classList.add('visible'); }

function renderQuickResume() {
    const container = document.getElementById('quick-resume-container');
    container.innerHTML = '';
    const lastAttempt = JSON.parse(localStorage.getItem(`kcLastAttempt_${candidateId}`));

    if (lastAttempt && allPassageData.length > 0) {
        const { vol, tran } = lastAttempt;
        const currentPassage = allPassageData.find(p => p.volId === vol && p.tranId === tran);
        if (!currentPassage) return;
        const nextPassage = allPassageData.find(p => p.transcriptNumber === currentPassage.transcriptNumber + 1);

        const box = document.createElement('div');
        box.className = 'quick-resume-box';
        box.innerHTML = `<h3>Resume Your Practice</h3><p>Your last attempt was <strong>Passage ${currentPassage.transcriptNumber}</strong></p><div class="intro-actions"><button id="resume-again-btn">Practice Again</button>${nextPassage ? `<button id="resume-next-btn">Try Next (Passage ${nextPassage.transcriptNumber})</button>` : ''}</div>`;
        container.appendChild(box);

        document.getElementById('resume-again-btn').addEventListener('click', () => loadPractice(vol, tran));
        if (nextPassage) document.getElementById('resume-next-btn').addEventListener('click', () => loadPractice(nextPassage.volId, nextPassage.tranId));
    }
}