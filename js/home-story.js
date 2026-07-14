(function () {
    'use strict';

    var STATES = Object.freeze({
        LOADING: 'LOADING',
        INTRO_TEXT: 'INTRO_TEXT',
        WAIT_CLICK: 'WAIT_CLICK',
        SIGNAL_RECEIVED: 'SIGNAL_RECEIVED',
        PLAY_ANIMATION: 'PLAY_ANIMATION',
        SHOW_DIALOG: 'SHOW_DIALOG',
        ENTER_GAME: 'ENTER_GAME'
    });

    function sleep(ms) {
        return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
    }

    function initHomeStory() {
        var config = window.HOME_STORY_CONFIG;
        var root = document.getElementById('home-story');
        var typewriter = document.getElementById('story-typewriter');
        var signalButton = document.getElementById('signal-button');
        var enterButton = document.getElementById('story-enter-btn');
        var dialogTitle = document.getElementById('tram-dialog-title');
        var dialogBody = document.getElementById('tram-dialog-body');
        if (!config || !root || !typewriter || !signalButton || !enterButton || !dialogTitle || !dialogBody) return;

        var running = false;
        var signalReceived = false;

        signalButton.textContent = config.copy.signalButton;
        dialogTitle.textContent = config.copy.dialogTitle;
        dialogBody.textContent = config.copy.dialogBody;
        enterButton.textContent = config.copy.enterButton;

        function setState(state) {
            root.dataset.storyState = state;
            window.dispatchEvent(new CustomEvent('home-story-state', { detail: { state: state } }));
        }

        async function typeIntro() {
            typewriter.replaceChildren();
            signalButton.disabled = true;
            setState(STATES.INTRO_TEXT);

            for (var p = 0; p < config.copy.intro.length; p += 1) {
                var paragraph = document.createElement('p');
                typewriter.appendChild(paragraph);
                var text = config.copy.intro[p];
                for (var i = 0; i < text.length; i += 1) {
                    paragraph.textContent += text.charAt(i);
                    await sleep(config.timing.character);
                }
                await sleep(config.timing.paragraphPause);
            }

            setState(STATES.WAIT_CLICK);
            signalButton.disabled = false;
        }

        function playBell() {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return Promise.resolve();

            var context = new AudioContext();
            function chime(at, frequency) {
                var oscillator = context.createOscillator();
                var gain = context.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequency, at);
                gain.gain.setValueAtTime(.0001, at);
                gain.gain.exponentialRampToValueAtTime(.16, at + .025);
                gain.gain.exponentialRampToValueAtTime(.0001, at + .72);
                oscillator.connect(gain).connect(context.destination);
                oscillator.start(at);
                oscillator.stop(at + .75);
            }

            var now = context.currentTime;
            chime(now, 880);
            chime(now + config.timing.bellGap / 1000, 740);
            return sleep(config.timing.bellGap + 760)
                .then(function () { return context.close(); })
                .catch(function () {});
        }

        async function receiveSignal() {
            if (running || signalReceived) return;
            running = true;
            signalButton.disabled = true;
            setState(STATES.SIGNAL_RECEIVED);
            await sleep(160);
            setState(STATES.PLAY_ANIMATION);
            await sleep(Math.max(config.timing.gateWake, config.timing.lightTravel));
            await Promise.all([sleep(config.timing.tramWake), playBell()]);
            await sleep(config.timing.dialogDelay);
            signalReceived = true;
            running = false;
            setState(STATES.SHOW_DIALOG);
        }

        function enterGame() {
            if (!signalReceived) return;
            setState(STATES.ENTER_GAME);
            
            // 隐藏home-story内容
            var homeStoryEl = document.getElementById('home-story');
            if (homeStoryEl) {
                homeStoryEl.style.display = 'none';
            }
            
            // 启动9站旅程动画
            if (typeof window.startJourney === 'function') {
                window.startJourney();
            } else if (typeof window.showView === 'function') {
                // fallback: 直接跳到正阳门
                window.showView('zhengyangmen');
                if (typeof window.showPage === 'function') window.showPage(2);
            }
        }

        signalButton.addEventListener('click', receiveSignal);
        enterButton.addEventListener('click', enterGame);

        window.homeStoryController = {
            showHome: function () {
                setState(signalReceived ? STATES.SHOW_DIALOG : STATES.WAIT_CLICK);
            }
        };

        setState(STATES.LOADING);
        window.requestAnimationFrame(typeIntro);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHomeStory, { once: true });
    } else {
        initHomeStory();
    }
})();
