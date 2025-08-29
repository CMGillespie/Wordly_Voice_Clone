document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const configInputArea = document.getElementById('config-input-area');
    const tempSessionIdInput = document.getElementById('temp-session-id');
    const tempPasscodeInput = document.getElementById('temp-passcode');
    const apiKeyInput = document.getElementById('api-key'); // The input field for the key
    const tempConnectBtn = document.getElementById('temp-connect-btn');
    const tempStatus = document.getElementById('temp-status');
    const appPage = document.getElementById('app-page');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const transcriptArea = document.getElementById('transcript-area');
    const mainAudioPlayer = document.getElementById('main-audio-player');
    const voiceToggle = document.getElementById('voice-toggle');

    // --- State ---
    let websocket = null;
    let audioQueue = [];
    let isPlaying = false;
    let apiKey = ''; // Will be set from the input field
    
    const FEMALE_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
    const MALE_VOICE_ID = '29vD33N1CtxCmqQRPOHJ';
    let selectedVoiceId = FEMALE_VOICE_ID;

    // --- Event Listeners ---
    tempConnectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    mainAudioPlayer.addEventListener('ended', onAudioEnded);
    mainAudioPlayer.addEventListener('error', onAudioError);
    voiceToggle.addEventListener('change', handleVoiceChange);

    function connect() {
        const sessionId = tempSessionIdInput.value;
        const passcode = tempPasscodeInput.value;
        apiKey = apiKeyInput.value.trim(); // Get the key from the input field

        if (!sessionId || !apiKey) {
            tempStatus.textContent = "Session ID and API Key are required.";
            return;
        }
        
        configInputArea.style.display = 'none';
        appPage.style.display = 'flex';
        connectWebSocket(sessionId, passcode);
    }

    function disconnect() {
        if (websocket) {
            websocket.onclose = null;
            websocket.close(1000, "User disconnected");
        }
        location.reload();
    }
    
    function handleVoiceChange() {
        selectedVoiceId = voiceToggle.checked ? MALE_VOICE_ID : FEMALE_VOICE_ID;
    }

    function connectWebSocket(sessionId, passcode) {
        websocket = new WebSocket('wss://endpoint.wordly.ai/attend');

        websocket.onopen = () => {
            const connectRequest = {
                type: 'connect',
                presentationCode: sessionId,
                languageCode: 'en',
                identifier: `cloning-test-${Date.now()}`
            };
            if (passcode) connectRequest.accessKey = passcode;
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
});
