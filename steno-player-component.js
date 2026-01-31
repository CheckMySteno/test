/* --- STENO PLAYER COMPONENT (Extracted Module) --- */

const StenoPlayerModule = {
    // 1. Exact CSS from your original file
    css: `
    #player-view { max-width: 980px; margin: 40px auto; padding: 0 1rem; }
    .practice-station { border: 1px solid var(--border-color); border-radius: 24px; box-shadow: 0 10px 30px -5px rgba(100, 116, 139, 0.1); background: var(--surface-color); overflow: hidden; }
    .player-card { padding: 1.5rem 2.5rem; text-align: center; position: relative; }
    .player-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.25rem; }
    .player-title { margin: 0; font-size: 1.6rem; font-weight: 700; color: #374151; text-align: left; }
    .player-subtitle { font-size: 1rem; color: var(--text-muted); margin-bottom: 1.5rem; text-align: left; }
    .controls { display: flex; justify-content: center; align-items: center; gap: 1.25rem; margin-bottom: 1.5rem; }
    .btn { background: #f3f4f8; color: #4b5563; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 1rem; transition: all 0.2s ease; cursor: pointer; border: none; }
    .btn:hover { transform: scale(1.1); background-color: #e5e7eb; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; background-color: #f3f4f8; }
    .btn-main { width: 72px; height: 72px; font-size: 1.8rem; background: linear-gradient(135deg, #818cf8, #6366f1); box-shadow: 0 5px 15px -3px rgba(109, 115, 234, 0.5); color: white; }
    .btn-main svg { width: 30px; height: 30px; }
    #pauseBtn { display: none; }
    .progress-bar-wrapper { position: relative; width: 100%; background-color: #e0e7ff; height: 8px; border-radius: 4px; cursor: pointer; }
    #progress-fill { height: 100%; width: 0%; background-color: #6366f1; border-radius: 4px; transition: width 0.1s linear; }
    .time-display { display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted); font-weight: 500; margin-top: 0.5rem; }
    #previewTranscriptBtn { font-size: 0.85rem; padding: 8px 14px; border-radius: 8px; font-weight: 600; background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); white-space: nowrap; transition: all 0.2s ease; cursor: pointer; }
    #previewTranscriptBtn:hover { background-color: #f8fafc; }
    .extra-controls { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding: 0.75rem 1rem; background-color: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9; }
    .speed-control-group { display: flex; align-items: center; gap: 0.5rem; }
    .speed-control-group .btn { width: 36px; height: 36px; background-color: white; border: 1px solid var(--border-color); }
    #wpmSpeed { -webkit-appearance: none; -moz-appearance: none; appearance: none; background-color: white; color: #4b5563; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.4rem 2rem 0.4rem 0.8rem; font-family: 'Manrope', sans-serif; font-weight: 600; font-size: 0.9rem; cursor: pointer; }
    .volume-control-group { display: flex; align-items: center; gap: 10px; }
    .volume-control-group .btn { width: 36px; height: 36px; background: transparent; }
    #volume-slider { -webkit-appearance: none; appearance: none; width: 120px; height: 5px; background: #e5e7eb; border-radius: 5px; cursor: pointer; transition: all 0.2s ease; }
    #volume-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; background: #6366f1; border-radius: 50%; cursor: pointer; }
    #volume-slider::-moz-range-thumb { width: 15px; height: 15px; background: #6366f1; border-radius: 50%; cursor: pointer; border: none; }
    .test-setup { background-color: #f9fafb; padding: 2rem 2.5rem; border-top: 1px solid var(--border-color); }
    .test-setup-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; gap: 1.5rem; }
    .setup-col-center { text-align: center; }
    .setup-col-right { text-align: right; }
    .timer-input-group { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .timer-input-group label { font-weight: 600; font-size: 0.9em; color: var(--text-muted); }
    #custom-timer-input { width: 90px; padding: 12px; border-radius: 10px; border: 1px solid var(--border-color); text-align: center; font-size: 1.1em; font-weight: 700; }
    .comma-checkbox-label { font-size: 0.9em; color: var(--text-muted); display:inline-flex; align-items:center; gap: 5px; margin-top: 0.75rem; cursor: pointer; }
    #startTranscriptionBtn { font-size: 1.1em; padding: 16px 24px; width: 100%; max-width: 280px; border-radius: 12px; font-weight: 600; transition: all 0.2s ease; cursor: pointer; }
    #startTranscriptionBtn:disabled { background-color: #e5e7eb; color: #9ca3af; cursor: not-allowed; box-shadow: none; }
    #startTranscriptionBtn:not(:disabled) { background-color: #1f2937; color: white; box-shadow: 0 4px 14px rgba(0,0,0,0.1); }
    .back-btn { background: none; color: #9ca3af; font-size: 0.9em; margin-top: 1.5rem; width: 100%; text-decoration: none; font-weight: 500; cursor: pointer; border: none; }
    .loader { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 10; border-radius: 24px; display: none; }
    `,

    // 2. Exact HTML from your original file
    getHTML: function() {
        let speedOptions = "";
        for (let i = 60; i <= 160; i += 5) {
            speedOptions += `<option value="${i}">${i} WPM</option>`;
        }

        return `
        <div id="player"></div>
        <div class="practice-station">
            <div class="player-card">
                <div id="player-loader" class="loader"><div class="spinner"></div></div>
                <div class="player-header">
                    <div>
                        <h2 class="player-title">Dictation Player</h2>
                        <p id="player-subtitle" class="player-subtitle">&nbsp;</p>
                    </div>
                    <button id="previewTranscriptBtn" onclick="showTranscriptPreview()">📄 Preview Transcript</button>
                </div>
                <div class="controls">
                  <button class="btn" onclick="restartVideo()" aria-label="Restart Audio"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 12"></path></svg></button>
                  <button id="playBtn" class="btn btn-main" onclick="togglePlay()" aria-label="Play Audio"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6V18L18 12L7 6Z"></path></svg></button>
                  <button id="pauseBtn" class="btn btn-main" onclick="togglePlay()" aria-label="Pause Audio"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18H10V6H6V18ZM14 6V18H18V6H14Z"></path></svg></button>
                </div>
                <div id="progressBar" class="progress-bar-wrapper"><div id="progress-fill"></div></div>
                <div class="time-display"><span id="current-time">00:00</span><span id="total-time">00:00</span></div>
                <div class="extra-controls">
                    <div class="speed-control-group">
                        <button class="btn speed-adjust-btn" onclick="adjustSpeed(-5)">-</button>
                        <select id="wpmSpeed" onchange="setPlaybackSpeed()">${speedOptions}</select>
                        <button class="btn speed-adjust-btn" onclick="adjustSpeed(5)">+</button>
                    </div>
                    <div class="volume-control-group">
                      <button id="volume-btn" class="btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button>
                      <input type="range" id="volume-slider" min="0" max="100" value="100">
                  </div>
                </div>
            </div>
            <div class="test-setup">
                 <div class="test-setup-grid">
                     <div class="setup-col"></div>
                     <div class="setup-col setup-col-center">
                         <div class="timer-input-group">
                            <label for="custom-timer-input">Set Timer (minutes)</label>
                            <input type="number" id="custom-timer-input" value="50" min="1" max="120">
                        </div>
                        <label class="comma-checkbox-label">
                          <input type="checkbox" id="includeComma"> Count comma (,) mistakes
                        </label>
                     </div>
                     <div class="setup-col setup-col-right">
                        <button id="startTranscriptionBtn" onclick="showInstructions()" disabled>🚀 Start Transcription</button>
                     </div>
                 </div>
            </div>
        </div>
        <button onclick="clearStateAndGoBack()" class="back-btn">Choose a different dictation</button>
        `;
    },

    // 3. Exact Initialization Logic
    init: function(containerId) {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = this.css;
        document.head.appendChild(styleSheet);
        document.getElementById(containerId).innerHTML = this.getHTML();
        
        // Add Slider event
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            if(window.player) window.player.setVolume(e.target.value);
        });
    }
};
