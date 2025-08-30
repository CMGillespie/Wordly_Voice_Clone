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
    const voiceToggle = document.getElementById('voice-toggle');
    const deviceSelect = document.getElementById('device-select');

    // --- State ---
    let websocket = null;
    let audioQueue = [];
    let isPlaying = false;
    let apiKey = '';
    let selectedDeviceId = '';
    
    const FEMALE_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
    const MALE_VOICE_ID = '29vD33N1CtxCmqQRPOHJ';
    let selectedVoiceId = FEMALE_VOICE_ID;

    // --- Event Listeners ---
    tempConnectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    mainAudioPlayer.addEventListener('ended', onAudioEnded);
    mainAudioPlayer.addEventListener('error', onAudioError);
    voiceToggle.addEventListener('change', () => {
        selectedVoiceId = voiceToggle.checked ? MALE_VOICE_ID : FEMALE_VOICE_ID;
    });
    deviceSelect.addEventListener('change', () => {
        selectedDeviceId = deviceSelect.value;
    });

    async function connect() {
        const sessionId = tempSessionIdInput.value;
        apiKey = apiKeyInput.value.trim();

        if (!sessionId || !apiKey) {
            tempStatus.textContent = "Session ID and API Key are required.";
            return;
        }
        
        // --- Get audio devices before connecting ---
        try {
            await initializeAudioDevices();
        } catch (err) {
            tempStatus.textContent = `Error: ${err.message}. Please allow microphone access.`;
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
    
    // --- Audio Device Logic (from Audio Router) ---
    async function initializeAudioDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            throw new Error("This browser doesn't support audio device selection.");
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
        } catch (error) {
            throw new Error("Microphone permission is required to list audio devices");
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
        
        deviceSelect.innerHTML = ''; // Clear previous options
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'System Default';
        deviceSelect.appendChild(defaultOption);

        audioOutputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Output ${audioOutputDevices.indexOf(device) + 1}`;
            deviceSelect.appendChild(option);
        });
    }

    function connectWebSocket(sessionId) {
        websocket = new WebSocket('wss://endpoint.wordly.ai/attend');

        websocket.onopen = () => {
            const connectRequest = {
                type: 'connect',
                presentationCode: sessionId,
                languageCode: 'en',
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

            // --- Set the audio output device before playing ---
            if (selectedDeviceId && typeof mainAudioPlayer.setSinkId === 'function') {
                await mainAudioPlayer.setSinkId(selectedDeviceId);
            }

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
