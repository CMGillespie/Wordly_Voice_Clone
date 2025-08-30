// Wordly Audio Routing Script - Revised (incorporates all fixes + handleSpeechMessage logging)
document.addEventListener('DOMContentLoaded', () => {
  // DOM elements - Login page
  const loginPage = document.getElementById('login-page');
  const appPage = document.getElementById('app-page');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const credentialsForm = document.getElementById('credentials-form');
  const linkForm = document.getElementById('link-form');
  const loginStatus = document.getElementById('login-status');
  
  // DOM elements - App page
  const sessionIdDisplay = document.getElementById('session-id-display');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const addDeviceBtn = document.getElementById('add-device-btn');
  const playerGrid = document.getElementById('player-grid');
  const browserWarning = document.getElementById('browser-warning');
  const noDeviceSupportMessage = document.getElementById('no-device-support');
  const globalCollapseBtn = document.getElementById('global-collapse-btn');
  
  // DOM elements - Preset controls
  const presetNameInput = document.getElementById('preset-name');
  const savePresetBtn = document.getElementById('save-preset-btn');
  const presetSelect = document.getElementById('preset-select');
  const loadPresetBtn = document.getElementById('load-preset-btn');
  const deletePresetBtn = document.getElementById('delete-preset-btn');
  
  // Application state
  const state = {
    sessionId: null,
    passcode: '',
    devices: [],
    players: [], // Stores state for each player instance
    presets: {},
    supportsSinkId: typeof HTMLAudioElement !== 'undefined' && 
                   typeof HTMLAudioElement.prototype.setSinkId === 'function',
    allCollapsed: false
  };
  
  // Define language mapping
  const languageMap = {
    'af': 'Afrikaans', 'sq': 'Albanian', 'ar': 'Arabic', 'hy': 'Armenian', 'bn': 'Bengali', 
    'bg': 'Bulgarian', 'zh-HK': 'Cantonese', 'ca': 'Catalan', 'zh-CN': 'Chinese (Simplified)', 
    'zh-TW': 'Chinese (Traditional)', 'hr': 'Croatian', 'cs': 'Czech', 'da': 'Danish', 
    'nl': 'Dutch', 'en': 'English (US)', 'en-AU': 'English (AU)', 'en-GB': 'English (UK)', 
    'et': 'Estonian', 'fi': 'Finnish', 'fr': 'French (FR)', 'fr-CA': 'French (CA)', 
    'ka': 'Georgian', 'de': 'German', 'el': 'Greek', 'gu': 'Gujarati', 'he': 'Hebrew', 
    'hi': 'Hindi', 'hu': 'Hungarian', 'is': 'Icelandic', 'id': 'Indonesian', 'ga': 'Irish', 
    'it': 'Italian', 'ja': 'Japanese', 'kn': 'Kannada', 'ko': 'Korean', 'lv': 'Latvian', 
    'lt': 'Lithuanian', 'mk': 'Macedonian', 'ms': 'Malay', 'mt': 'Maltese', 'no': 'Norwegian', 
    'fa': 'Persian', 'pl': 'Polish', 'pt': 'Portuguese (PT)', 'pt-BR': 'Portuguese (BR)', 
    'ro': 'Romanian', 'ru': 'Russian', 'sr': 'Serbian', 'sk': 'Slovak', 'sl': 'Slovenian', 
    'es': 'Spanish (ES)', 'es-MX': 'Spanish (MX)', 'sv': 'Swedish', 'tl': 'Tagalog', 
    'th': 'Thai', 'tr': 'Turkish', 'uk': 'Ukrainian', 'vi': 'Vietnamese', 'cy': 'Welsh', 
    'pa': 'Punjabi', 'sw': 'Swahili', 'ta': 'Tamil', 'ur': 'Urdu', 
    'zh': 'Chinese' // Backward compatibility
  };
  
  // Initialize the application
  init();
  
  // --- Initialization Functions ---

  function init() {
    setupTabs();
    setupLoginForms();
    setupPresetControls();
    setupAppControls();
    checkBrowserCompatibility();
    loadPresetsFromStorage();
  }

  function checkBrowserCompatibility() {
    const isChromeBased = /Chrome/.test(navigator.userAgent) || /Edg/.test(navigator.userAgent);
    if (!isChromeBased) {
      browserWarning.style.display = 'block';
    }
    if (!state.supportsSinkId) {
      noDeviceSupportMessage.style.display = 'block';
    }
  }

  function setupTabs() {
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
      });
    });
  }

  function setupLoginForms() {
    credentialsForm.addEventListener('submit', handleCredentialsForm);
    linkForm.addEventListener('submit', handleLinkForm);
  }

  function setupAppControls() {
    disconnectBtn.addEventListener('click', disconnectFromSession);
    addDeviceBtn.addEventListener('click', () => addNewPlayer()); // Allow adding player with default settings
    globalCollapseBtn.addEventListener('click', toggleAllPlayers);
  }

  function setupPresetControls() {
    savePresetBtn.addEventListener('click', savePreset);
    loadPresetBtn.addEventListener('click', loadSelectedPreset);
    deletePresetBtn.addEventListener('click', deleteSelectedPreset);
  }

  // --- Login and Session Management ---

  function handleCredentialsForm(e) {
    e.preventDefault();
    let inputSessionId = document.getElementById('session-id').value.trim();
    const inputPasscode = document.getElementById('passcode').value.trim();
    
    if (!isValidSessionId(inputSessionId)) {
      inputSessionId = formatSessionId(inputSessionId);
      if (!isValidSessionId(inputSessionId)) {
        showLoginError('Please enter a valid session ID in the format XXXX-0000');
        return;
      }
    }
    processLogin(inputSessionId, inputPasscode);
  }

  function handleLinkForm(e) {
    e.preventDefault();
    const weblink = document.getElementById('weblink').value.trim();
    const { sessionId: parsedSessionId, passcode: parsedPasscode } = parseWeblink(weblink);
    if (!parsedSessionId) {
      showLoginError('Unable to extract session information from the provided link');
      return;
    }
    processLogin(parsedSessionId, parsedPasscode || '');
  }

  function isValidSessionId(sessionId) {
    return /^[A-Za-z0-9]{4}-\d{4}$/.test(sessionId);
  }

  function formatSessionId(input) {
    const cleaned = input.replace(/[^A-Za-z0-9]/g, '');
    return cleaned.length === 8 ? `${cleaned.substring(0, 4)}-${cleaned.substring(4)}` : input;
  }

  function parseWeblink(weblink) {
    try {
      const url = new URL(weblink);
      let sessionId = null;
      let passcode = url.searchParams.get('key') || '';
      const pathParts = url.pathname.split('/').filter(part => part);
      if (pathParts.length > 0) {
        const potentialSessionId = pathParts[pathParts.length - 1];
        if (isValidSessionId(potentialSessionId)) {
          sessionId = potentialSessionId;
        } else if (potentialSessionId.length === 8) {
          const formatted = formatSessionId(potentialSessionId);
          if (isValidSessionId(formatted)) sessionId = formatted;
        }
      }
      return { sessionId, passcode };
    } catch (error) {
      console.error('Error parsing weblink:', error);
      return { sessionId: null, passcode: '' };
    }
  }

  function showLoginError(message) {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message error';
  }

  function showLoginSuccess(message) {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message success';
  }

  async function processLogin(sessionId, passcode) {
    showLoginSuccess('Fetching audio devices...');
    try {
        // Must get devices *before* switching page to ensure dropdowns populate
        await initializeAudioDevices(); 
        
        state.sessionId = sessionId;
        state.passcode = passcode;

        showLoginSuccess('Login successful! Connecting to session...');
        
        // Switch to app page
        loginPage.style.display = 'none';
        appPage.style.display = 'flex'; // Use 'flex' to match CSS layout
        
        sessionIdDisplay.textContent = `Session: ${sessionId}`;
        
        // Add a default player if none exist
        if (state.players.length === 0) {
          addNewPlayer(); // Add player with default settings (audio off)
        }
        showNotification(`Connected to session ${sessionId}`, 'success');

    } catch (err) {
        showLoginError(`Failed to initialize audio devices: ${err.message}. Please grant microphone permission.`);
    }
  }

  async function initializeAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error("Media device enumeration not supported.");
    }
    try {
      // Request microphone access to get permission for device enumeration with labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop()); // We don't need the stream, just permission

      const devices = await navigator.mediaDevices.enumerateDevices();
      state.devices = devices.filter(device => device.kind === 'audiooutput');
      
      if(state.devices.length === 0) {
         console.warn("No audio output devices found. setSinkId will not work.");
      } else {
         console.log(`Found ${state.devices.length} audio output devices.`);
      }
      
      // Update device dropdowns in existing players if any (e.g., after permission granted later)
      state.players.forEach(p => {
          const deviceSelect = p.element.querySelector('.device-select');
          if (deviceSelect) {
              populateDeviceSelect(deviceSelect, p.deviceId);
          }
      });

    } catch (error) {
      console.error('Error accessing audio devices:', error);
      // Re-throw specific error types if needed, or a generic message
      throw new Error(error.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not access audio devices.');
    }
  }

  function disconnectFromSession() {
    console.log("Disconnecting from session...");
    // Stop audio and clear queues for all players first
    state.players.forEach(player => {
        stopPlayerAudio(player); // Ensure audio stops
        if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
            try {
                player.websocket.close(1000, "User disconnected"); // Normal closure
            } catch (e) { console.error("Error closing websocket:", e); }
        }
    });

    // Clear players from state and DOM
    playerGrid.innerHTML = '';
    state.players = [];
    
    credentialsForm.reset();
    linkForm.reset();
    
    appPage.style.display = 'none';
    loginPage.style.display = 'flex'; // Use 'flex' as per initial CSS
    
    state.sessionId = null;
    state.passcode = '';
    loginStatus.textContent = '';
    loginStatus.className = 'status-message';
    
    showNotification('Disconnected from session', 'success');
  }

  // --- Player Management ---

  function addNewPlayer(config = {}) {
    const playerId = `player-${Date.now()}`;
    
    // FIX #1: Default audioEnabled to false
    const defaultConfig = {
      language: 'en',
      deviceId: '', // Default to system default initially
      audioEnabled: false, // Default to OFF
      collapsed: false
    };
    
    const playerConfig = { ...defaultConfig, ...config };

    // Ensure deviceId exists if set, otherwise use default
    if (playerConfig.deviceId && !state.devices.find(d => d.deviceId === playerConfig.deviceId)) {
        console.warn(`Device ID ${playerConfig.deviceId} not found, using system default.`);
        playerConfig.deviceId = ''; 
    }
    
    const playerEl = document.createElement('div');
    playerEl.className = 'player';
    playerEl.id = playerId;
    
    const deviceName = getDeviceName(playerConfig.deviceId);
    const languageName = getLanguageName(playerConfig.language);
    
    playerEl.innerHTML = `
      <div class="player-header">
        <div class="player-title">
          <span class="player-status-light connecting"></span>
          <span class="device-name">${deviceName}</span>
          <span class="player-language-indicator">${languageName}</span>
        </div>
        <div class="player-controls">
          <button class="player-btn collapse-btn" data-action="toggle">Collapse</button>
          <button class="player-btn remove-btn" data-action="remove">Remove</button>
        </div>
      </div>
      <div class="player-settings">
        <div class="setting-group">
          <span class="setting-label">Language:</span>
          <select class="setting-select language-select"></select>
        </div>
        <div class="setting-group">
          <span class="setting-label">Device:</span>
          <select class="setting-select device-select"></select>
        </div>
        <label class="toggle">
          <input type="checkbox" class="audio-toggle" ${playerConfig.audioEnabled ? 'checked' : ''}>
          <span class="slider"></span>
          <span class="setting-label">Audio</span>
        </label>
      </div>
      <div class="player-content ${playerConfig.collapsed ? 'collapsed' : ''}">
        <div class="player-transcript"></div>
        <div class="player-status connecting">Connecting...</div>
        <div class="audio-status">Audio ${playerConfig.audioEnabled ? 'ready' : 'off'}</div>
      </div>
    `;
    
    playerGrid.appendChild(playerEl);
    
    const languageSelect = playerEl.querySelector('.language-select');
    populateLanguageSelect(languageSelect, playerConfig.language);
    
    const deviceSelect = playerEl.querySelector('.device-select');
    populateDeviceSelect(deviceSelect, playerConfig.deviceId);
    
    // Create player state object
    const playerInstance = {
      id: playerId,
      element: playerEl,
      language: playerConfig.language,
      deviceId: playerConfig.deviceId,
      audioEnabled: playerConfig.audioEnabled,
      collapsed: playerConfig.collapsed,
      websocket: null,
      status: 'connecting',
      phrases: {},
      audioQueue: [],        // FIX #2: Added audio queue
      isPlayingAudio: false, // FIX #2: Flag for queue processing
      currentAudioElement: null // FIX #6: Track current audio element
    };
    
    state.players.push(playerInstance);
    addPlayerEventListeners(playerEl, playerInstance); // Pass instance directly
    connectPlayerWebSocket(playerInstance);
    
    return playerInstance;
  }

  function removePlayer(player) {
    console.log(`Removing player ${player.id}`);
    stopPlayerAudio(player); // Stop audio first

    if (player.websocket && player.websocket.readyState !== WebSocket.CLOSED) {
      try {
        player.websocket.close(1000, "Player removed");
      } catch (e) { console.error("Error closing websocket:", e); }
    }
    
    player.element.remove();
    
    const index = state.players.findIndex(p => p.id === player.id);
    if (index !== -1) {
      state.players.splice(index, 1);
    }
    showNotification('Player removed', 'success');
  }

  function getPlayerById(playerId) {
    return state.players.find(player => player.id === playerId) || null;
  }

  // --- WebSocket Handling ---

  function connectPlayerWebSocket(player) {
    if (!state.sessionId) {
        updatePlayerStatus(player, 'error', 'Missing Session ID');
        return;
    }
    if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
        console.log(`WebSocket for player ${player.id} already open.`);
        return;
    }

    updatePlayerStatus
