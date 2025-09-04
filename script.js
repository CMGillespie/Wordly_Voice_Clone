document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const configCard = document.getElementById('config-card');
    const tempSessionIdInput = document.getElementById('temp-session-id');
    const apiKeyInput = document.getElementById('api-key');
    const tempConnectBtn = document.getElementById('temp-connect-btn');
    const tempStatus = document.getElementById('temp-status');
    const appCard = document.getElementById('app-card');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const transcriptArea = document.getElementById('transcript-area');
    const mainAudioPlayer = document.getElementById('main-audio-player');
    const languageSelect = document.getElementById('language-select');
    const voiceSelect = document.getElementById('voice-select');
    const audioToggle = document.getElementById('audio-toggle');
    const startAudioBtn = document.getElementById('start-audio-btn');
    const startAudioContainer = document.getElementById('start-audio-container');

    // --- State ---
    let websocket = null;
    let audioQueue = [];
    let isPlaying = false;
    let apiKey = '';
    let hasInteracted = false;
    let isDeliberateDisconnect = false;
    let reconnectInterval = null;
    let currentSessionId = '';
    let audioEnabled = true;

    // --- ElevenLabs Data ---
    // MODIFIED: Added Chinese back to the list
    const elevenLabsLanguages = {
        "ar": "Arabic", "bg": "Bulgarian", "zh": "Chinese", "hr": "Croatian", 
        "cs": "Czech", "da": "Danish", "nl": "Dutch", "en": "English", 
        "fi": "Finnish", "tl": "Filipino", "fr": "French", "de": "German", 
        "el": "Greek", "hi": "Hindi", "id": "Indonesian", "it": "Italian", 
        "ja": "Japanese", "ko": "Korean", "ms": "Malay", "pl": "Polish", 
        "pt": "Portuguese", "ro": "Romanian", "sk": "Slovak", "es": "Spanish", 
        "sv": "Swedish", "ta": "Tamil", "tr": "Turkish", "uk": "Ukrainian"
    };
    
    const voiceMap = {
        "Female (Rachel)": "21m00Tcm4TlvDq8ikWAM",
        "Male (Drew)": "29vD33N1CtxCmqQRPOHJ",
        "Your Cloned Voice": "doPwgiUDu8SODZQApZGl"
    };
    let selectedVoiceId = voiceMap["Female (Rachel)"];

    // --- Initialization ---
    // MODIFIED: The list is now sorted alphabetically before populating
    Object.keys(elevenLabsLanguages).sort((a, b) => elevenLabsLanguages[a].localeCompare(elevenLabsLanguages[b])).forEach(code => {
        const name = elevenLabsLanguages[code];
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        if (code === 'en') option.selected = true;
        languageSelect.appendChild(option);
    });
    Object.keys(voiceMap).forEach(name => {
        const option = document.createElement('option');
        option.value = voiceMap[name];
        option.textContent = name;
        voiceSelect.appendChild(option);
    });

    // --- Event Listeners ---
    tempConnectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    mainAudioPlayer.addEventListener('ended', onAudioEnded);
    mainAudioPlayer.addEventListener('error', onAudioError);
    startAudioBtn.addEventListener('click', onUserInteraction);
    languageSelect.addEventListener('change', handleLanguageChange);
    voiceSelect.addEventListener('change', () => { selectedVoiceId = voiceSelect.value; });
    audioToggle.addEventListener('change', handleAudioToggle);

    function onUserInteraction() {
        hasInteracted = true;
        startAudioContainer.style.display = 'none';
        mainAudioPlayer.play().catch(() => {});
        processAudioQueue();
    }

    function connect() {
        currentSessionId = tempSessionIdInput.value;
        apiKey = apiKeyInput.value.trim();
        if (!currentSessionId || !apiKey) {
            tempStatus.textContent = "Session ID and API Key are required.";
            return;
        }
        configCard.style.display = 'none';
        appCard.style.display = 'flex';
        isDeliberateDisconnect = false;
        connectWebSocket();
    }

    function disconnect() {
        isDeliberateDisconnect = true;
        if (reconnectInterval) clearInterval(reconnectInterval);
        if (websocket) {
            websocket.onclose = null;
            websocket.close(1000, "User disconnected");
        }
        location.reload();
    }

    function handleAudioToggle() {
        audioEnabled = audioToggle.checked;
        if (!audioEnabled) {
            stopAndClearAudio();
        }
    }
    
    function handleLanguageChange() {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            stopAndClearAudio();
            transcriptArea.innerHTML = '';
            websocket.send(JSON.stringify({ type: 'change', languageCode: languageSelect.value }));
        }
    }
    
    function connectWebSocket() {
        if (websocket) return;
        tempStatus.textContent = "Connecting...";
        
        websocket = new WebSocket('wss://endpoint.wordly.ai/attend');

        websocket.onopen = () => {
            if (reconnectInterval) clearInterval(reconnectInterval);
            const connectRequest = {
                type: 'connect',
                presentationCode: currentSessionId,
                languageCode: languageSelect.value,
                identifier: `cloning-test-${Date.now()}`
            };
            websocket.send(JSON.stringify(connectRequest));
        };

        websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'status' && message.success) {
                tempStatus.textContent = "Connected.";
            }
            if (message.type === 'phrase' && message.isFinal && message.translatedText) {
                const text = message.translatedText;
                transcriptArea.innerHTML += `<div class="phrase">${text}</div>`;
                transcriptArea.scrollTop = transcriptArea.scrollHeight;
                audioQueue.push(text);
                if (hasInteracted) {
                    processAudioQueue();
                }
            }
        };

        websocket.onclose = () => {
            websocket = null;
            if (isDeliberateDisconnect) return;
            tempStatus.textContent = "Connection lost. Reconnecting...";
            if (reconnectInterval) clearInterval(reconnectInterval);
            reconnectInterval = setInterval(connectWebSocket, 3000);
        };
    }

    async function processAudioQueue() {
        if (isPlaying || audioQueue.length === 0 || !hasInteracted || !audioEnabled) {
            return;
        }

        isPlaying = true;
        const textToSpeak = audioQueue.shift();
        
        const selectedLang = languageSelect.value;
        const modelId = (selectedLang === 'en') ? 'eleven_monolingual_v1' : 'eleven_multilingual_v2';
        
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
                body: JSON.stringify({ text: textToSpeak, model_id: modelId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("ElevenLabs API Error:", errorData);
                throw new Error(`API Error: ${response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            mainAudioPlayer.src = audioUrl;
            mainAudioPlayer.play();

        } catch (error) {
            console.error("Failed to get or play audio:", error);
            isPlaying = false;
            processAudioQueue();
        }
    }
    
    function stopAndClearAudio() {
        mainAudioPlayer.pause();
        mainAudioPlayer.src = '';
        audioQueue = [];
        isPlaying = false;
    }

    function onAudioEnded() {
        isPlaying = false;
        if (mainAudioPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(mainAudioPlayer.src);
        }
        processAudioQueue();
    }

    function onAudioError() {
        console.error("An error occurred with the audio player.");
        onAudioEnded();
    }
});
