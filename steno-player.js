class StenoPlayer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.onStartRequested = options.onStartRequested || (() => {});
        this.onPreviewRequested = options.onPreviewRequested || (() => {});
        this.player = null;
        this.duration = 0;
        this.wordCount = 0;
        this.playbackRate = 1;
        this.progressInterval = null;
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <div id="yt-player-mount"></div>
            <div class="practice-station">
                <div class="player-card">
                    <div id="player-loader" class="loader"><div class="spinner"></div></div>
                    <div class="player-header">
                        <div><h2 class="player-title">Dictation Player</h2><p id="player-subtitle" class="player-subtitle">&nbsp;</p></div>
                        <button id="previewTranscriptBtn">📄 Preview Transcript</button>
                    </div>
                    <div class="p-controls">
                        <button class="p-btn" id="p-restart"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 12"></path></svg></button>
                        <button id="playBtn" class="p-btn p-btn-main">▶</button>
                        <button id="pauseBtn" class="p-btn p-btn-main" style="display:none">||</button>
                    </div>
                    <div id="progressBar" class="progress-bar-wrapper"><div id="progress-fill"></div></div>
                    <div class="time-display"><span id="current-time">00:00</span><span id="total-time">00:00</span></div>
                    <div class="p-extra-controls">
                        <div class="p-speed-group">
                            <button class="p-btn" id="p-speed-down">-</button>
                            <select id="wpmSpeed"></select>
                            <button class="p-btn" id="p-speed-up">+</button>
                        </div>
                        <input type="range" id="volume-slider" min="0" max="100" value="100">
                    </div>
                </div>
                <div class="test-setup">
                    <div class="test-setup-grid">
                        <div class="setup-col"></div>
                        <div class="setup-col-center">
                            <div class="timer-input-group"><label>Set Timer (minutes)</label><input type="number" id="custom-timer-input" value="50"></div>
                            <label class="comma-checkbox-label" style="cursor:pointer; display:block; margin-top:10px;"><input type="checkbox" id="includeComma"> Count comma (,) mistakes</label>
                        </div>
                        <div class="setup-col-right"><button id="startTranscriptionBtn" disabled>🚀 Start Transcription</button></div>
                    </div>
                </div>
            </div>`;

        const sel = document.getElementById('wpmSpeed');
        for (let i = 60; i <= 160; i += 5) {
            let opt = document.createElement('option');
            opt.value = i; opt.innerText = i + ' WPM';
            if (i === 80) opt.selected = true;
            sel.appendChild(opt);
        }
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('playBtn').onclick = () => this.togglePlay();
        document.getElementById('pauseBtn').onclick = () => this.togglePlay();
        document.getElementById('p-restart').onclick = () => { this.player.seekTo(0); this.player.playVideo(); };
        document.getElementById('wpmSpeed').onchange = () => this.updateSpeed();
        document.getElementById('p-speed-up').onclick = () => this.adjustSpeed(5);
        document.getElementById('p-speed-down').onclick = () => this.adjustSpeed(-5);
        document.getElementById('volume-slider').oninput = (e) => this.player.setVolume(e.target.value);
        document.getElementById('previewTranscriptBtn').onclick = () => this.onPreviewRequested();
        document.getElementById('startTranscriptionBtn').onclick = () => this.onStartRequested();
        document.getElementById('progressBar').onclick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            this.player.seekTo(((e.clientX - rect.left) / rect.width) * this.duration);
        };
    }

    load(url, title, words) {
        this.wordCount = words;
        document.querySelector('.player-title').innerText = title;
        document.getElementById('player-subtitle').innerText = `Words: ${words}`;
        const vidId = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)[1];
        if (this.player) this.player.loadVideoById(vidId);
        else {
            this.player = new YT.Player('yt-player-mount', {
                height: '0', width: '0', videoId: vidId,
                playerVars: { 'autoplay': 0, 'controls': 0 },
                events: {
                    'onReady': (e) => { this.duration = e.target.getDuration(); document.getElementById('player-loader').style.display='none'; document.getElementById('startTranscriptionBtn').disabled=false; this.updateSpeed(); },
                    'onStateChange': (e) => this.handleState(e)
                }
            });
        }
    }

    handleState(e) {
        if (e.data === YT.PlayerState.PLAYING) {
            document.getElementById('playBtn').style.display='none'; document.getElementById('pauseBtn').style.display='flex';
            this.progressInterval = setInterval(() => this.updateTime(), 500);
        } else {
            document.getElementById('playBtn').style.display='flex'; document.getElementById('pauseBtn').style.display='none';
            clearInterval(this.progressInterval);
        }
    }

    togglePlay() { (this.player.getPlayerState() === YT.PlayerState.PLAYING) ? this.player.pauseVideo() : this.player.playVideo(); }
    adjustSpeed(amt) {
        const s = document.getElementById('wpmSpeed');
        s.selectedIndex = Math.max(0, Math.min(s.options.length - 1, s.selectedIndex + (amt/5)));
        this.updateSpeed();
    }
    updateSpeed() {
        const target = parseInt(document.getElementById('wpmSpeed').value);
        this.playbackRate = target / (this.wordCount / (this.duration / 60));
        this.player.setPlaybackRate(this.playbackRate);
    }
    updateTime() {
        const curr = this.player.getCurrentTime();
        document.getElementById('progress-fill').style.width = (curr / this.duration) * 100 + '%';
        document.getElementById('current-time').innerText = this.fmt(curr / this.playbackRate);
        document.getElementById('total-time').innerText = this.fmt(this.duration / this.playbackRate);
    }
    fmt(s) { return Math.floor(s/60).toString().padStart(2,'0') + ":" + Math.floor(s%60).toString().padStart(2,'0'); }
}
