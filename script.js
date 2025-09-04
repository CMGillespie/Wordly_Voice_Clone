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
    const voiceSelect = document.getElementById('voice-select'); // New voice selector

    // --- State ---
    let websocket = null;
    let audioQueue = [];
    let isPlaying = false;
    let apiKey = '';
    
    // --- MODIFIED: Voice selection is now a map ---
    const voiceMap = {
        "Female (Rachel)": "21m00Tcm4TlvDq8ikWAM",
        "Male (Drew)": "29vD33N1CtxCmqQRPOHJ",
        "Your Cloned Voice": "doPwgiUDu8SODZQApZGl"
    };
    let selectedVoiceId = voiceMap["Female (Rachel)"]; // Default voice

    // --- Initialization: Populate the voice dropdown ---
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
    voiceSelect.addEventListener('change', () => {
        selectedVoiceId = voiceSelect.value;
    });

    function connect() {
        const sessionId = tempSessionIdInput.value;
        apiKey = apiKeyInput.value.trim();

        if (!sessionId || !apiKey) {
            tempStatus.textContent = "Session ID and API Key are required.";
            return;
        }
        
        configInputArea.style.display = 'none';
        appPage.style.display = 'flex';
        connectWebSocket(sessionId);
    }

    function disconnect() {
        if (websocket) websocket.close(1000, "User disconnected");
        location.reload();
    }
    
    function connectWebSocket(sessionId) {
        websocket = new WebSocket('wss://endpoint.wordly.ai/attend');

        websocket.onopen = () => {
            const connectRequest = {
                type: 'connect',
                presentationCode: sessionId,
                languageCode: 'en', // Hard-coded to English for this test app
                identifier: `cloning-test-${Date.now()}`
            };
            websocket.send(JSON.stringify(connectRequest));
        };

        websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'phrase' && message.isFinal && message.translatedText) {
                const text = message.translatedText;
                transcriptArea.innerHTML += `<div class="phrase">${text}</div>`;
                transcriptArea.scrollTop = transcriptArea.scrollHeight;
                
                audioQueue.push(text);
                processAudioQueue();
            }
        };
        websocket.onclose = () => { websocket = null; };
        websocket.onerror = () => { console.error("WebSocket Error."); };
    }

    async function processAudioQueue() {
        if (isPlaying || audioQueue.length === 0) {
            return;
        }
        isPlaying = true;
        const textToSpeak = audioQueue.shift();
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: "eleven_monolingual_v1"
                })
            });

            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

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
});
