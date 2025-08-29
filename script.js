document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const configInputArea = document.getElementById('config-input-area');
    const tempSessionIdInput = document.getElementById('temp-session-id');
    const apiKeyInput = document.getElementById('api-key');
    const tempConnectBtn = document.getElementById('temp-connect-btn');
    const tempStatus = document.getElementById('temp-status');
    const appPage = document.getElementById('app-page');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const transcriptArea = document.getElementById('transcript-area');
    const mainAudioPlayer = document.getElementById('main-audio-player');
    const languageSelect = document.getElementById('language-select');
    const audioToggle = document.getElementById('audio-toggle');

    // --- State ---
    let websocket = null;
    let audioQueue = [];
    let isPlaying = false;
    let apiKey = '';
    let isDeliberateDisconnect = false;
    let reconnectInterval = null;
    let currentSessionId = '';
    let audioEnabled = true;

    // --- ElevenLabs Data ---
    const elevenLabsLanguages = {
        "en": "English", "ja": "Japanese", "zh": "Chinese", "de": "German",
        "hi": "Hindi", "fr": "French", "ko": "Korean", "pt": "Portuguese",
        "it": "Italian", "es": "Spanish", "id": "Indonesian", "nl": "Dutch",
        "tr": "Turkish", "fi": "Filipino", "pl": "Polish", "sv": "Swedish",
        "bg": "Bulgarian", "ro": "Romanian", "ar": "Arabic", "cs": "Czech",
        "el": "Greek", "fi": "Finnish", "hr": "Croatian", "ms": "Malay",
        "sk": "Slovak", "da": "Danish", "ta": "Tamil", "uk": "Ukrainian"
    };
    const VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

    // --- Initialization ---
    // Populate Language Dropdown
    Object.entries(elevenLabsLanguages).forEach(([code, name]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        if (code === 'en') option.selected = true;
        languageSelect.appendChild(option);
    });
    
    // --- Event Listeners ---
    tempConnectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    mainAudioPlayer.addEventListener('ended', onAudioEnded);
    mainAudioPlayer.addEventListener('error', onAudioError);
    audioToggle.addEventListener('change', handleAudioToggle);
    languageSelect.addEventListener('change', handleLanguageChange);

    function connect() {
        currentSessionId = tempSessionIdInput.value;
        apiKey = apiKeyInput.value.trim();

        if (!currentSessionId || !apiKey) {
            tempStatus.textContent = "Session ID and API Key are required.";
            return;
        }
        
        configInputArea.style.display = 'none';
        appPage.style.display = 'flex';
        isDeliberateDisconnect = false;
        connectWebSocket();
    }

    function disconnect() {
        isDeliberateDisconnect = true;
        if (reconnectInterval) clearInterval(reconnectInterval);
        if (websocket) websocket.close(1000, "User disconnected");
        stopAndClearAudio();
        
        appPage.style.display = 'none';
        configInputArea.style.display = 'block';
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
            transcriptArea.innerHTML = ''; // Clear transcript on language change
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
                processAudioQueue();
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
        if (isPlaying || audioQueue.length === 0 || !audioEnabled) {
            return;
        }

        isPlaying = true;
        const textToSpeak = audioQueue.shift();
        
        const selectedLang = languageSelect.value;
        const modelId = (selectedLang === 'en') ? 'eleven_monolingual_v1' : 'eleven_multilingual_v2';
        
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: modelId
                })
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
    
    function stopAndClearAudio() {
        mainAudioPlayer.pause();
        mainAudioPlayer.src = '';
        audioQueue = [];
        isPlaying = false;
    }
});
