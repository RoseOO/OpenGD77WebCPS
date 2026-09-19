/**
 * OpenGD77 CPS Web - Main Application
 * 
 * Application initialization and core functionality.
 */

// Dev mode detection - enables extended channel options in General Settings
const DEV_MODE = new URLSearchParams(window.location.search).get('dev') === 'true';
// Extended channel mode state - persisted to localStorage
let EXTENDED_CHANNEL_MODE = DEV_MODE && (localStorage.getItem('opengd77_extended_channels') === 'true');

// Returns current effective limits based on extended channel mode
function getEffectiveLimits() {
  if (EXTENDED_CHANNEL_MODE) {
    return {
      ...CONFIG.LIMITS,
      MAX_CHANNELS: SCANNER_LIMITS.MAX_CHANNELS,
      MAX_CHANNELS_PER_ZONE: SCANNER_LIMITS.MAX_CHANNELS_PER_ZONE,
    };
  }
  return CONFIG.LIMITS;
}

/**
 * Console Log Capture for Feedback/Bug Reports
 * This must be initialized before any console.log calls
 */
const ConsoleCapture = {
  logs: [],
  maxLogs: 100000,
  originalConsole: {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  },
  
  init() {
    const self = this;
    
    // Wrap console methods to capture output
    ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
      console[type] = function(...args) {
        self.capture(type, args);
        self.originalConsole[type].apply(console, args);
      };
    });
    
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.capture('UNCAUGHT_ERROR', [`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`]);
    });
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.capture('UNHANDLED_REJECTION', [String(event.reason)]);
    });
  },
  
  capture(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return '[Object - serialization failed: ' + e.message + ']';
        }
      }
      return String(arg);
    }).join(' ');
    
    this.logs.push({
      timestamp,
      type: type.toUpperCase(),
      message
    });
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  },
  
  getLogs() {
    return this.logs;
  },
  
  clear() {
    this.logs = [];
  }
};

// Initialize console capture immediately
ConsoleCapture.init();

const App = {
  /**
   * Initialize the application
   */
  async init() {
    console.log('OpenGD77 CPS Web initializing...');
    
    // Initialize API
    await this.initAPI();
    
    // Initialize UI
    UI.init();
    
    // Initialize radio connection handler
    this.initRadioHandler();
    
    // Check for WebUSB support
    this.checkWebUSB();
    
    // Load any saved state
    this.loadSavedState();
    
    // Update status
    this.updateStatus('Ready');
    
    console.log('OpenGD77 CPS Web ready');
  },

  /**
   * Initialize API connection
   */
  async initAPI() {
    try {
      const loggedIn = await API.init();
      this.updateUserUI(loggedIn);
      
      // Update API status indicator
      document.getElementById('apiStatus').classList.add('online');
    } catch (error) {
      console.warn('API init failed:', error);
      document.getElementById('apiStatus').classList.remove('online');
    }
  },

  /**
   * Standalone build: no health check / analytics backend.
   */
  async checkApiHealth() {
    return true;
  },

  /**
   * Collect client analytics data for the OpenGD77 CPS
   */
  collectAnalyticsData() {
    const ua = navigator.userAgent;
    
    // Parse browser info
    let browserName = 'Unknown';
    let browserVersion = null;
    
    if (ua.includes('Firefox/')) {
      browserName = 'Firefox';
      const match = ua.match(/Firefox\/(\d+(?:\.\d+)?)/);
      browserVersion = match ? match[1] : null;
    } else if (ua.includes('Edg/')) {
      browserName = 'Edge';
      const match = ua.match(/Edg\/(\d+(?:\.\d+)?)/);
      browserVersion = match ? match[1] : null;
    } else if (ua.includes('Chrome/')) {
      browserName = 'Chrome';
      const match = ua.match(/Chrome\/(\d+(?:\.\d+)?)/);
      browserVersion = match ? match[1] : null;
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      browserName = 'Safari';
      const match = ua.match(/Version\/(\d+(?:\.\d+)?)/);
      browserVersion = match ? match[1] : null;
    } else if (ua.includes('Opera') || ua.includes('OPR/')) {
      browserName = 'Opera';
      const match = ua.match(/(?:Opera|OPR)\/(\d+(?:\.\d+)?)/);
      browserVersion = match ? match[1] : null;
    }
    
    // Parse OS info
    let osName = 'Unknown';
    let osVersion = null;
    
    if (ua.includes('Windows NT')) {
      osName = 'Windows';
      const match = ua.match(/Windows NT (\d+(?:\.\d+)?)/);
      if (match) {
        const ntVersion = match[1];
        const versionMap = {
          '10.0': '10/11',
          '6.3': '8.1',
          '6.2': '8',
          '6.1': '7',
          '6.0': 'Vista',
          '5.1': 'XP'
        };
        osVersion = versionMap[ntVersion] || ntVersion;
      }
    } else if (ua.includes('Mac OS X')) {
      osName = 'macOS';
      const match = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
      osVersion = match ? match[1].replace(/_/g, '.') : null;
    } else if (ua.includes('Linux')) {
      osName = 'Linux';
      if (ua.includes('Android')) {
        osName = 'Android';
        const match = ua.match(/Android (\d+(?:\.\d+)?)/);
        osVersion = match ? match[1] : null;
      }
    } else if (ua.includes('iPhone') || ua.includes('iPad')) {
      osName = 'iOS';
      const match = ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/);
      osVersion = match ? match[1].replace(/_/g, '.') : null;
    }
    
    // Device type detection
    let deviceType = 'Desktop';
    if (ua.includes('Mobile') || (ua.includes('Android') && !ua.includes('Tablet'))) {
      deviceType = 'Mobile';
    } else if (ua.includes('Tablet') || ua.includes('iPad')) {
      deviceType = 'Tablet';
    }
    
    // Get or create session ID
    let sessionId = sessionStorage.getItem('gr_opengd77_session_id');
    if (!sessionId) {
      sessionId = 'gro_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      sessionStorage.setItem('gr_opengd77_session_id', sessionId);
    }
    
    return {
      source: 'opengd77',
      browserName: browserName,
      browserVersion: browserVersion,
      osName: osName,
      osVersion: osVersion,
      deviceType: deviceType,
      screenWidth: screen.width,
      screenHeight: screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: navigator.language || navigator.userLanguage,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer || null,
      landingPage: window.location.pathname,
      sessionId: sessionId
    };
  },

  /**
   * IDs of all body buttons that read from or write to the radio.
   * When no radio is connected, these are replaced with a Connect button.
   * Header buttons (readCodeplugBtn, writeCodeplugBtn) are handled separately
   * in updateRadioStatus since the Connect button is already adjacent.
   */
  radioActionButtonIds: [
    'writeDMRDBBtn',
    'writeSatsToRadioBtn',
    'writeBootImageBtn',
    'writeBootMelodyBtn',
    'readThemeBtn',
    'writeThemeBtn',
    'writeLibraryPromptsBtn'
  ],

  /**
   * Initialize radio connection handler
   */
  initRadioHandler() {
    // Set up radio status callbacks
    window.radioUSB.onStatusChange = (status, message) => {
      this.updateRadioStatus(status, message);
    };
    
    window.radioUSB.onProgress = (percent, message) => {
      this.updateProgress(percent, message);
    };

    // Re-acquire the wake lock if a transfer is still running and the user
    // returns to the tab (the browser drops the wake lock when the tab hides).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._activityState === 'busy') {
        this._syncWakeLock();
        this._syncKeepAliveAudio();
      }
    });

    // Unlock the keep-alive audio on the first user interaction so it can run
    // later without being blocked by Chrome's autoplay policy.
    const unlockKeepAliveAudio = () => {
      this._audioUnlocked = true;
      const audio = this._ensureKeepAliveAudio();
      if (audio && this._activityState === 'busy') {
        audio.gain.gain.value = 0.01;
        if (audio.ctx.state === 'suspended') {
          audio.ctx.resume().catch(() => {});
        }
      }
    };
    document.addEventListener('pointerdown', unlockKeepAliveAudio, { once: true, capture: true });
    document.addEventListener('keydown', unlockKeepAliveAudio, { once: true, capture: true });

    // Create connect-replacement buttons for every radio action button
    this.initRadioActionButtons();
  },

  /**
   * Create a hidden "Connect to Radio" button next to every radio action button.
   * These are shown in place of the originals when no radio is connected.
   */
  initRadioActionButtons() {
    this.radioActionButtonIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const connectBtn = document.createElement('button');
      connectBtn.id = id + '_connect';
      connectBtn.title = 'Connect Radio';
      connectBtn.className = btn.className;
      connectBtn.innerHTML = '<i class="mdi mdi-usb"></i> Connect to Radio';
      connectBtn.addEventListener('click', () => this.connectRadio());

      // Insert right after the original button and hide by default
      connectBtn.style.display = 'none';
      btn.parentNode.insertBefore(connectBtn, btn.nextSibling);
    });

    // Hide header read/write buttons and show body connect replacements
    // (no radio connected at startup)
    const readBtn = document.getElementById('readCodeplugBtn');
    const writeBtn = document.getElementById('writeCodeplugBtn');
    if (readBtn) readBtn.style.display = 'none';
    if (writeBtn) writeBtn.style.display = 'none';
    this.updateRadioActionButtons('disconnected');
  },

  /**
   * Toggle radio action buttons based on connection status.
   * - connected: show original buttons, hide connect replacements
   * - busy: show original buttons (disabled), hide connect replacements
   * - disconnected: hide original buttons, show connect replacements
   */
  updateRadioActionButtons(status) {
    const isConnected = status === 'connected' || status === 'busy';
    this.radioActionButtonIds.forEach(id => {
      const btn = document.getElementById(id);
      const connectBtn = document.getElementById(id + '_connect');
      if (!btn || !connectBtn) return;

      if (isConnected) {
        btn.style.display = '';
        btn.disabled = (status === 'busy');
        connectBtn.style.display = 'none';
      } else {
        btn.style.display = 'none';
        btn.disabled = false;
        connectBtn.style.display = '';
      }
    });
  },

  /**
   * Check WebUSB support and hide radio controls if not supported
   */
  checkWebUSB() {
    if (!window.radioUSB.isSupported() && !window.radioUSB.isHIDSupported()) {
      // Show warning banner
      const warningBanner = document.getElementById('webusbWarningBanner');
      if (warningBanner) {
        warningBanner.style.display = 'flex';
        
        // Add close button handler (once: true prevents duplicate listeners)
        const closeBtn = document.getElementById('webusbWarningClose');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            warningBanner.style.display = 'none';
          }, { once: true });
        }
      }
      
      // Hide connect button
      const connectBtn = document.getElementById('connectRadioBtn');
      if (connectBtn) {
        connectBtn.style.display = 'none';
      }
      
      // Hide read/write codeplug buttons
      const readBtn = document.getElementById('readCodeplugBtn');
      if (readBtn) {
        readBtn.style.display = 'none';
      }
      
      const writeBtn = document.getElementById('writeCodeplugBtn');
      if (writeBtn) {
        writeBtn.style.display = 'none';
      }

      // Hide all connect replacement buttons for body radio actions
      this.radioActionButtonIds.forEach(id => {
        const connectReplacement = document.getElementById(id + '_connect');
        if (connectReplacement) {
          connectReplacement.style.display = 'none';
        }
      });
      
      // Hide radio type dropdowns
      const radioTypeSelect = document.getElementById('radioTypeSelect');
      if (radioTypeSelect) {
        radioTypeSelect.style.display = 'none';
      }
      
      const mobileRadioTypeSelect = document.getElementById('mobileRadioTypeSelect');
      if (mobileRadioTypeSelect) {
        mobileRadioTypeSelect.style.display = 'none';
      }
      
      // Hide the radio status indicator (since it's irrelevant without USB support)
      const radioStatus = document.getElementById('radioStatus');
      if (radioStatus) {
        radioStatus.style.display = 'none';
      }
      
      console.log('WebUSB not supported - radio connection features disabled');
    }
  },

  /**
   * Load saved state
   */
  loadSavedState() {
    // Try to load last codeplug from local storage
    try {
      const savedCodeplug = Utils.storage.get(CONFIG.STORAGE.CODEPLUG);
      if (savedCodeplug) {
        window.codeplug.fromJSON(savedCodeplug);
        UI.updateOverview();
        // UI.init() already rendered the restored section - before this codeplug
        // was loaded - so re-render it now that the data is present.
        if (typeof UI.loadSectionData === 'function' && UI.currentSection) {
          UI.loadSectionData(UI.currentSection);
        }
        Utils.toast('Restored previous session', 'info');
      }
    } catch (error) {
      console.warn('Could not restore session:', error);
    }
    
    // Restore radio type selection
    try {
      const savedRadioType = Utils.storage.get(CONFIG.STORAGE.RADIO_TYPE);
      if (savedRadioType) {
        const validType = Utils.isValidRadioType(savedRadioType)
          ? savedRadioType
          : Utils.getValidRadioTypeOrDefault(savedRadioType);
        window.radioUSB.radioType = validType;
        const radioTypeSelect = document.getElementById('radioTypeSelect');
        if (radioTypeSelect) {
          radioTypeSelect.value = validType;
        }
        // Also sync mobile selector
        const mobileRadioTypeSelect = document.getElementById('mobileRadioTypeSelect');
        if (mobileRadioTypeSelect) {
          mobileRadioTypeSelect.value = validType;
        }
        // Update UI to reflect the restored radio type (e.g., show screen grab for STM32)
        UI.updateUIForRadioType();
      }
    } catch (error) {
      console.warn('Could not restore radio type:', error);
    }
  },

  /**
   * Save current state
   */
  saveState() {
    Utils.storage.set(CONFIG.STORAGE.CODEPLUG, window.codeplug.toJSON());
  },

  /**
   * Update user UI. Standalone build has no accounts - everything is local.
   */
  updateUserUI() {
    const userInfo = document.getElementById('userInfo');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const myCodeplugsBtn = document.getElementById('myCodeplugsBtn');
    const saveCloudBtn = document.getElementById('saveCloudBtn');
    const editProfileBtn = document.getElementById('editProfileBtn');

    if (userInfo) {
      userInfo.innerHTML = `
        <div class="user-callsign">Local library</div>
        <div class="user-email">Saved on this device</div>
      `;
    }
    [loginBtn, logoutBtn, saveCloudBtn, editProfileBtn].forEach(el => {
      if (el) el.style.display = 'none';
    });
    if (myCodeplugsBtn) myCodeplugsBtn.style.display = '';

    // Refresh the dashboard "My Saved Codeplugs" section.
    if (typeof UI !== 'undefined' && UI.loadDashboardCodeplugs) {
      UI.loadDashboardCodeplugs();
    }
  },

  /**
   * Update radio status display
   */
  updateRadioStatus(status, message) {
    const statusDot = document.querySelector('#radioStatus .status-dot');
    const statusText = document.querySelector('#radioStatus .status-text');
    const readBtn = document.getElementById('readCodeplugBtn');
    const writeBtn = document.getElementById('writeCodeplugBtn');
    const modelDisplay = document.getElementById('currentRadioModel');
    const radioTypeSelect = document.getElementById('radioTypeSelect');
    
    // Mobile info bar elements
    const mobileStatusDot = document.getElementById('mobileStatusDot');
    const mobileStatusText = document.getElementById('mobileStatusText');
    const mobileRadioTypeSelect = document.getElementById('mobileRadioTypeSelect');
    
    if (statusDot) statusDot.className = 'status-dot';
    if (mobileStatusDot) mobileStatusDot.className = 'status-dot';
    
    switch (status) {
      case 'connected':
        if (statusDot) statusDot.classList.add('connected');
        if (mobileStatusDot) mobileStatusDot.classList.add('connected');
        if (readBtn) { readBtn.style.display = ''; readBtn.disabled = false; }
        if (writeBtn) { writeBtn.style.display = ''; writeBtn.disabled = false; }
        if (modelDisplay) {
          const radioType = window.radioUSB.getRadioType();
          const model = window.radioUSB.radioModel ||
            (radioType === CONFIG.RADIO_TYPES.DM32 ? 'DM32/UV008' :
             radioType === CONFIG.RADIO_TYPES.STM32 ? 'TYT Radio' : 'OpenGD77');
          modelDisplay.textContent = model;
        }
        // Update radio type selector to show current type (respects user selection)
        if (radioTypeSelect) {
          radioTypeSelect.value = window.radioUSB.getRadioType();
        }
        if (mobileRadioTypeSelect) {
          mobileRadioTypeSelect.value = window.radioUSB.getRadioType();
        }
        break;
      case 'busy':
        if (statusDot) statusDot.classList.add('busy');
        if (mobileStatusDot) mobileStatusDot.classList.add('busy');
        if (readBtn) { readBtn.style.display = ''; readBtn.disabled = true; }
        if (writeBtn) { writeBtn.style.display = ''; writeBtn.disabled = true; }
        break;
      case 'disconnected':
      default:
        if (statusDot) statusDot.classList.add('disconnected');
        if (mobileStatusDot) mobileStatusDot.classList.add('disconnected');
        if (readBtn) { readBtn.style.display = 'none'; }
        if (writeBtn) { writeBtn.style.display = 'none'; }
        if (modelDisplay) {
          modelDisplay.textContent = 'No Radio';
        }
    }
    
    if (statusText) statusText.textContent = message;
    if (mobileStatusText) mobileStatusText.textContent = message;

    // Toggle radio action buttons / connect replacements
    this.updateRadioActionButtons(status);
  },

  /**
   * Update progress display
   */
  updateProgress(percent, message) {
    const PROGRESS_HIDE_DELAY_MS = 1000;
    const statusMessage = document.getElementById('statusMessage');

    // Estimated time remaining (only shown once the transfer rate is measurable).
    if (!this._toolsEta) this._toolsEta = Utils.createEtaTracker();
    const eta = this._toolsEta.update(percent);
    if (message && eta) message = `${message}${eta}`;

    if (message) {
      statusMessage.textContent = message;
    }

    // Update the progress bar in the radio tools section
    const progressContainer = document.getElementById('radioToolsProgress');
    const progressBar = document.getElementById('radioToolsProgressBar');
    const progressText = document.getElementById('radioToolsProgressText');

    // Make it obvious in the bottom bar that an operation is running (or done).
    const failed = /fail|error/i.test(message || '');
    this.setActivity(percent >= 100 ? 'idle' : (failed ? 'error' : 'busy'));

    if (progressContainer && progressBar && progressText) {
      // Show progress bar if not at 0 or 100
      if (percent > 0 && percent < 100) {
        progressContainer.style.display = 'block';
      } else if (percent >= 100) {
        // Hide after a short delay when complete
        setTimeout(() => {
          progressContainer.style.display = 'none';
          progressBar.style.width = '0%';
        }, PROGRESS_HIDE_DELAY_MS);
      }

      progressBar.style.width = `${Math.round(percent)}%`;
      if (message) {
        progressText.textContent = message;
      }
    }
  },

  /**
   * Reflect whether a read/write (or other long operation) is in progress in the
   * bottom status bar, so it's obvious to the user that something is happening.
   * state: 'busy' | 'idle' | 'error'
   */
  setActivity(state, message) {
    this._activityState = state || 'idle';
    const bar = document.getElementById('appStatusbar');
    if (bar) {
      bar.classList.toggle('busy', state === 'busy');
      bar.classList.toggle('error', state === 'error');
      bar.setAttribute('data-activity', state || 'idle');
    }
    if (message) {
      const el = document.getElementById('statusMessage');
      if (el) el.textContent = message;
    }
    // Keep the screen awake while a read/write is running so the OS/Chrome
    // doesn't sleep and stall a long transfer if the user steps away.
    this._syncWakeLock();
    this._syncKeepAliveAudio();
  },

  /**
   * Lock the UI while a radio transfer is running.
   * mode: 'read' | 'write' | null. 'write' also blocks section navigation and
   * warns before the page is closed/left; 'read' only blocks the Connect button
   * and radio-type changes, so the user can still browse other pages.
   */
  lockRadio(mode) {
    if (this._radioLock === (mode || null)) return;
    this._radioLock = mode || null;
    const busy = !!mode;
    const blockNav = mode === 'write';
    document.body.classList.toggle('radio-busy', busy);
    document.body.classList.toggle('radio-block-nav', blockNav);

    const connectBtn = document.getElementById('connectRadioBtn');
    if (connectBtn) {
      connectBtn.disabled = busy;
      connectBtn.title = busy ? 'Radio busy - please wait for the transfer to finish' : 'Connect Radio';
    }
    ['radioTypeSelect', 'mobileRadioTypeSelect'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    });

    // Warn before leaving/closing the tab mid-write (reads still allow it).
    if (blockNav) {
      if (!this._beforeUnloadHandler) {
        this._beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
      }
    } else if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
  },

  /**
   * Hold a Screen Wake Lock for the duration of a radio operation. The browser
   * releases the lock automatically when the tab is hidden, so we re-acquire it
   * on visibilitychange while an operation is still busy.
   */
  async _syncWakeLock() {
    try {
      const wantLock = this._activityState === 'busy';
      if (wantLock) {
        if ('wakeLock' in navigator && !this._wakeLock && !this._wakeLockPending) {
          this._wakeLockPending = true;
          try {
            const lock = await navigator.wakeLock.request('screen');
            this._wakeLock = lock;
            lock.addEventListener('release', () => { this._wakeLock = null; });
          } finally {
            this._wakeLockPending = false;
          }
        }
      } else if (this._wakeLock) {
        const lock = this._wakeLock;
        this._wakeLock = null;
        await lock.release();
      }
    } catch (e) {
      // NotAllowedError when the page isn't focused/visible, or unsupported.
      this._wakeLock = null;
      this._wakeLockPending = false;
    }
  },

  /**
   * Create (once) a Web Audio graph used as a background keep-alive. Chrome
   * throttles/freezes background tabs that aren't playing audio, which can
   * stall a long transfer if the user switches away. A near-silent, very
   * high-frequency tone keeps the tab marked as "playing audio" so the transfer
   * keeps running. Gain stays at 0 while idle so nothing is emitted normally.
   */
  _ensureKeepAliveAudio() {
    if (this._keepAliveAudio) return this._keepAliveAudio;
    // Chrome refuses to start Web Audio until a real user gesture has occurred;
    // creating the context before that logs an autoplay warning, so only build
    // it once the unlock handler has fired.
    if (!this._audioUnlocked) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Inaudible (below the audible band) but still counts as genuine playback
      // for the browser's throttling heuristics.
      osc.type = 'sine';
      osc.frequency.value = 20;
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this._keepAliveAudio = { ctx, gain };
    } catch (e) {
      this._keepAliveAudio = null;
    }
    return this._keepAliveAudio;
  },

  async _syncKeepAliveAudio() {
    // Only touch audio once the first user gesture has unlocked it.
    if (!this._audioUnlocked) return;
    const wantAudio = this._activityState === 'busy';
    const audio = this._keepAliveAudio || (wantAudio ? this._ensureKeepAliveAudio() : null);
    if (!audio) return;
    try {
      if (wantAudio) {
        if (audio.ctx.state === 'suspended') await audio.ctx.resume();
        audio.gain.gain.value = 0.01;
      } else {
        audio.gain.gain.value = 0;
      }
    } catch (e) { /* ignore */ }
  },

  /**
   * Update status bar message
   */
  updateStatus(message) {
    document.getElementById('statusMessage').textContent = message;
  },

  /**
   * Connect to radio
   */
  async connectRadio() {
    if (this._radioLock) {
      Utils.toast('Radio is busy - please wait for the current operation to finish', 'warning');
      return;
    }
    try {
      this.updateStatus('Connecting to radio...');

      // Baofeng DM-32 / UV-32 (C7000) connect over Web Serial; everything else
      // uses WebUSB / WebHID.
      const selectedType = Utils.getSavedRadioType() ||
        document.getElementById('radioTypeSelect')?.value ||
        document.getElementById('mobileRadioTypeSelect')?.value;

      if (selectedType === CONFIG.RADIO_TYPES.DM32) {
        await window.radioUSB.connectSerial();
      } else {
        // Try to re-acquire an already-authorised radio silently (e.g. after a
        // reboot or page reload) before falling back to the device chooser.
        const reconnected = await window.radioUSB.tryReconnect();
        if (!reconnected) {
          await window.radioUSB.connect();
        }
      }
      
      // Only read radio info if NOT in DFU mode
      // DFU mode devices (STM32 DFU or MK22 bootloader) don't support CPS protocol commands
      // They only support firmware flashing via DFU/HID protocol
      if (!window.radioUSB.isInDFUMode) {
        // Read radio info after connecting to populate radio details
        // This enables getRadioModel() and other functions that use radioInfo
        // readRadioInfo() also auto-detects the platform type (MK22/STM32) based on firmware
        try {
          await window.radioUSB.readRadioInfo();
          this.updateStatus('Radio info read');
          
          // Update the main radio type selector to reflect auto-detected platform
          UI.updateRadioTypeSelectorFromDetected();
          
          // Auto-detect DMR Radio Type based on connected radio
          UI.autoDetectDMRRadioType();
        } catch (infoError) {
          // Radio info read is optional - continue even if it fails
          console.warn('Could not read radio info:', infoError.message);
        }
      } else {
        // In DFU / firmware update mode - only firmware flashing is available
        console.log('Radio is in DFU/update mode - firmware flashing only');
        this.updateStatus('Radio in firmware update mode');
        Utils.toast('Radio in firmware update mode - use the Firmware Update section', 'info');
      }
      
      if (!window.radioUSB.isInDFUMode) {
        Utils.toast('Radio connected', 'success');
      }
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        Utils.toast('Connection failed: ' + error.message, 'error');
      }
      this.updateStatus('Connection failed');
    }
  },

  /**
   * Read codeplug from radio
   */
  async readFromRadio() {
    if (window.radioUSB?.isInDFUMode) {
      Utils.toast('Radio is in firmware update (DFU) mode - reading a codeplug is unavailable. Reconnect in normal mode.', 'warning');
      return;
    }
    try {
      this.updateRadioStatus('busy', 'Reading codeplug...');
      
      // Initialize and show progress bar
      const progressContainer = document.getElementById('radioToolsProgress');
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
      this.updateProgress(0, 'Preparing to read...');
      
      const data = await window.radioUSB.readCodeplug((progress) => {
        this.updateProgress(progress, `Reading: ${Math.round(progress)}%`);
      });
      
      // Parse the binary data into codeplug structure using G77 parser
      // The radio returns raw binary data in the same format as G77 files
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      
      // Import the codeplug using the G77 importer
      window.codeplug.importG77(buffer);
      window.codeplug.filename = 'radio_codeplug.json';
      
      // Parse extended channel data (channels 1025+) if available from scanner mode read
      if (typeof EXTENDED_CHANNEL_MODE !== 'undefined' && EXTENDED_CHANNEL_MODE && window.radioUSB.extendedChannelData) {
        const extChannels = G77.parseExtendedChannels(window.radioUSB.extendedChannelData, data);
        if (extChannels && extChannels.length > 0) {
          for (const ch of extChannels) {
            window.codeplug.channels.push({
              id: Utils.generateId(),
              number: ch.number,
              name: ch.name,
              type: ch.type,
              rxFreq: ch.rxFreq,
              txFreq: ch.txFreq,
              bandwidth: ch.bandwidth,
              colorCode: ch.colorCode,
              timeslot: ch.timeslot,
              contact: ch.contact,
              tgList: ch.tgList,
              dmrId: ch.dmrId || 'None',
              overrideDmrId: ch.overrideDmrId || 0,
              ts1TalkerAliasTx: ch.ts1TalkerAliasTx || 'Off',
              ts2TalkerAliasTx: ch.ts2TalkerAliasTx || 'Off',
              scanList: ch.scanList || 'None',
              forceDmo: ch.forceDmo || false,
              rxTone: ch.rxTone,
              txTone: ch.txTone,
              squelch: ch.squelch,
              power: ch.power,
              rxOnly: ch.rxOnly,
              zoneSkip: ch.zoneSkip,
              allSkip: ch.allSkip,
              tot: ch.tot,
              vox: ch.vox || 'Off',
              noBeep: ch.noBeep || false,
              noEco: ch.noEco || false,
              aprs: ch.aprs || 'None',
              latitude: ch.latitude || 0,
              longitude: ch.longitude || 0,
              useLocation: ch.useLocation || false
            });
          }
          // Renumber preserves order; extended channels already have correct numbers
          window.codeplug.renumberChannels();
          console.log(`Parsed ${extChannels.length} extended channels (1025+)`);
        }
      }
      
      // Update all UI displays
      UI.updateOverview();
      UI.renderChannelsTable();
      UI.renderContactsTable();
      UI.renderZones();
      UI.renderScanLists();
      
      Utils.toast('Codeplug read successfully', 'success');
      this.updateStatus('Read complete');
      console.log('Read', data.length, 'bytes');
      
      this.updateRadioStatus('connected', 'Connected');
      
    } catch (error) {
      Utils.toast('Read failed: ' + error.message, 'error');
      this.updateStatus('Read failed');
      this.updateRadioStatus(window.radioUSB?.connected ? 'connected' : 'disconnected',
        window.radioUSB?.connected ? 'Connected' : 'No Radio Connected');
      
      // Hide progress bar on error
      const progressContainer = document.getElementById('radioToolsProgress');
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }
  },

  /**
   * Write codeplug to radio
   */
  async writeToRadio() {
    if (window.codeplug.channels.length === 0) {
      Utils.toast('No channels to write', 'warning');
      return;
    }
    
    // Confirm write
    UI.showModal('Write to Radio', `
      <p>Are you sure you want to write the codeplug to the radio?</p>
      <p>This will overwrite the existing codeplug on the device.</p>
      <ul>
        <li>${window.codeplug.channels.length} channels</li>
        <li>${window.codeplug.contacts.length} contacts</li>
        <li>${window.codeplug.zones.length} zones</li>
      </ul>
    `, {
      confirmText: 'Write',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        UI.hideModal();
        await this._doCodeplugWrite(null);
      }
    });
  },

  /**
   * Perform a codeplug write.
   * @param {Uint8Array|null} settingsBytes Optional preferences blob written in
   *   the same session. Only the Clone flow passes this (when "also clone radio
   *   preferences" is ticked); the normal Write Codeplug button passes null so
   *   preferences are never touched by a plain codeplug write.
   * @returns {Promise<boolean>} true on success
   */
  async _doCodeplugWrite(settingsBytes) {
    if (window.radioUSB?.isInDFUMode) {
      Utils.toast('Radio is in firmware update (DFU) mode - writing a codeplug is unavailable. Reconnect in normal mode.', 'warning');
      return false;
    }
    try {
      // Gate DM32-only modes. AM and FM Broadcast serialise to chMode 2/3, which
      // every other platform's firmware interprets as Digital, so refuse to
      // write them to anything except the DM-32 / UV008 (C7000).
      const targetRadioType = window.radioUSB?.getRadioType?.() ||
        window.radioUSB?.radioType || Utils.getSavedRadioType?.();
      if (targetRadioType !== CONFIG.RADIO_TYPES.DM32) {
        const dm32Only = window.codeplug.getDm32OnlyModeEntries?.() || [];
        if (dm32Only.length) {
          const shown = dm32Only.slice(0, 5).join(', ') +
            (dm32Only.length > 5 ? `, +${dm32Only.length - 5} more` : '');
          throw new Error(`AM and FM Broadcast channels are only supported by the DM-32 / UV008 (C7000). Change or remove: ${shown}`);
        }
      }

      this.updateRadioStatus('busy', 'Writing codeplug... 0%');

      // Initialize and show progress bar
      const progressContainer = document.getElementById('radioToolsProgress');
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
      this.updateProgress(0, 'Preparing to write...');

      // Serialize the codeplug to G77 binary format
      const buffer = window.codeplug.exportG77();
      const data = new Uint8Array(buffer);

      // Set extended channel data for scanner mode write (channels 1025+)
      if (window.codeplug._extendedChannelData) {
        window.radioUSB.extendedChannelData = window.codeplug._extendedChannelData;
        window.radioUSB._extendedBitmaps = window.codeplug._extendedBitmaps;
      }

      await window.radioUSB.writeCodeplug(data, (progress) => {
        const progressMsg = `Writing codeplug... ${Math.round(progress)}%`;
        this.updateProgress(progress, progressMsg);
        // Also update the top status bar with the percentage
        this.updateRadioStatus('busy', progressMsg);
      }, { settingsBytes: settingsBytes || null });

      Utils.toast('Codeplug written successfully', 'success');
      this.updateStatus('Write complete');
      this.updateRadioStatus('connected', 'Connected');
      return true;

    } catch (error) {
      Utils.toast('Write failed: ' + error.message, 'error');
      this.updateStatus('Write failed');
      this.updateRadioStatus(window.radioUSB?.connected ? 'connected' : 'disconnected',
        window.radioUSB?.connected ? 'Connected' : 'No Radio Connected');

      // Hide progress bar on error
      const progressContainer = document.getElementById('radioToolsProgress');
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      return false;
    }
  },

  /**
   * Create new codeplug
   */
  newCodeplug() {
    if (window.codeplug.modified) {
      UI.showModal('Unsaved Changes', `
        <p>You have unsaved changes. Create new codeplug anyway?</p>
      `, {
        confirmText: 'Create New',
        confirmClass: 'btn-danger',
        onConfirm: () => {
          window.codeplug.reset();
          window.codeplug._serverId = null;
          window.codeplug._serverDesc = '';
          UI.hideModal();
          UI.updateOverview();
          UI.showSection('overview');
          Utils.toast('New codeplug created', 'success');
        }
      });
    } else {
      window.codeplug.reset();
      window.codeplug._serverId = null;
      window.codeplug._serverDesc = '';
      UI.updateOverview();
      UI.showSection('overview');
      Utils.toast('New codeplug created', 'success');
    }
  },

  /**
   * Handle file open
   */
  async handleFileOpen(file) {
    if (!file) return;
    
    try {
      const filename = file.name.toLowerCase();
      
      if (filename.endsWith('.g77')) {
        // Binary codeplug file
        const buffer = await Utils.readFileAsArrayBuffer(file);
        const stats = window.codeplug.importG77(buffer);
        window.codeplug.filename = file.name.replace(/\.g77$/i, '.json');
        UI.updateOverview();
        UI.renderChannelsTable();
        UI.renderContactsTable();
        UI.renderZones();
        UI.renderTGLists();
        Utils.toast(`Imported G77: ${stats.channels} channels, ${stats.contacts} contacts, ${stats.zones} zones, ${stats.tgLists} TG lists`, 'success');
        
      } else if (filename.endsWith('.csv')) {
        // Determine CSV type from content
        const text = await Utils.readFileAsText(file);
        const firstLine = text.split('\n')[0];
        
        if (firstLine.includes('Channel Number')) {
          const count = window.codeplug.importChannelsCSV(text);
          Utils.toast(`Imported ${count} channels`, 'success');
          UI.renderChannelsTable();
        } else if (firstLine.includes('Contact Name')) {
          const count = window.codeplug.importContactsCSV(text);
          Utils.toast(`Imported ${count} contacts`, 'success');
          UI.renderContactsTable();
        } else if (firstLine.includes('TG List Name')) {
          const count = window.codeplug.importTGListsCSV(text);
          Utils.toast(`Imported ${count} TG lists`, 'success');
          UI.renderTGLists();
        } else if (firstLine.includes('Zone Name')) {
          const count = window.codeplug.importZonesCSV(text);
          Utils.toast(`Imported ${count} zones`, 'success');
          UI.renderZones();
        } else if (firstLine.includes('APRS')) {
          const count = window.codeplug.importAPRSCSV(text);
          Utils.toast(`Imported ${count} APRS configs`, 'success');
          UI.renderAPRS();
        } else {
          Utils.toast('Unknown CSV format', 'error');
        }
        
        UI.updateOverview();
        
      } else if (filename.endsWith('.json')) {
        const text = await Utils.readFileAsText(file);
        const data = JSON.parse(text);
        window.codeplug.fromJSON(data);
        window.codeplug.filename = file.name;
        window.codeplug._serverId = null;
        window.codeplug._serverDesc = '';
        UI.updateOverview();
        Utils.toast('Codeplug loaded', 'success');
        
      } else {
        Utils.toast('Unsupported file format', 'error');
      }
      
    } catch (error) {
      Utils.toast('Failed to open file: ' + error.message, 'error');
    }
    
    // Reset file input
    document.getElementById('fileInput').value = '';
  },

  /**
   * Save codeplug to file
   */
  saveCodeplugFile() {
    const data = window.codeplug.toJSON();
    const json = JSON.stringify(data, null, 2);
    const filename = window.codeplug.filename || 'codeplug.json';
    
    Utils.downloadFile(json, filename, 'application/json');
    window.codeplug.modified = false;
    UI.updateOverview();
    Utils.toast('Codeplug saved', 'success');
  },

  /**
   * Export codeplug to G77 binary file
   */
  exportG77File() {
    try {
      const buffer = window.codeplug.exportG77();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      
      // Generate filename based on callsign and date
      const callsign = window.codeplug.general.callsign || 'OpenGD77';
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `${callsign}_${date}.g77`;
      
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      Utils.toast(`Exported to ${filename}`, 'success');
    } catch (error) {
      Utils.toast('Failed to export G77: ' + error.message, 'error');
    }
  },

  /**
   * Import CSV file
   */
  async importCSV(file, type) {
    if (!file) return;
    
    try {
      const text = await Utils.readFileAsText(file);
      let count = 0;
      
      switch (type) {
        case 'channels':
          count = window.codeplug.importChannelsCSV(text);
          UI.renderChannelsTable();
          break;
        case 'contacts':
          count = window.codeplug.importContactsCSV(text);
          UI.renderContactsTable();
          break;
        case 'zones':
          count = window.codeplug.importZonesCSV(text);
          UI.renderZones();
          break;
        case 'tglists':
          count = window.codeplug.importTGListsCSV(text);
          UI.renderTGLists();
          break;
      }
      
      UI.updateOverview();
      Utils.toast(`Imported ${count} ${type}`, 'success');
      
    } catch (error) {
      Utils.toast('Import failed: ' + error.message, 'error');
    }
  },

  /**
   * Import CHIRP CSV or frequency JSON file with merge interface
   */
  async importChirpCSV(file) {
    if (!file) return;
    
    try {
      const text = await Utils.readFileAsText(file);
      const isJSON = file.name.toLowerCase().endsWith('.json');
      
      let entries, suggestions;
      if (isJSON) {
        ({ entries, suggestions } = window.codeplug.parseFrequencyJSON(text));
      } else {
        ({ entries, suggestions } = window.codeplug.parseChirpCSV(text));
      }
      
      if (entries.length === 0) {
        Utils.toast('No DMR or NFM channels found in file', 'warning');
        return;
      }
      
      UI.showChirpMergeModal(entries, suggestions);
      
    } catch (error) {
      Utils.toast('Import failed: ' + error.message, 'error');
    }
  },

  /**
   * Import Radio Reference UK CSV file with merge interface
   */
  async importRadioReferenceUKCSV(file) {
    if (!file) return;

    try {
      const text = await Utils.readFileAsText(file);
      const { entries, suggestions } = window.codeplug.parseRadioReferenceUKCSV(text);

      if (entries.length === 0) {
        Utils.toast('No DMR, FM or NFM channels found in file', 'warning');
        return;
      }

      UI.showChirpMergeModal(entries, suggestions, 'Radio Reference UK');

    } catch (error) {
      Utils.toast('Import failed: ' + error.message, 'error');
    }
  }
};

// Add remaining UI methods
Object.assign(UI, {
  /**
   * Load UK repeaters
   */
  async loadRepeaters(forceRefresh = false) {
    const tbody = document.getElementById('repeatersTableBody');
    const empty = document.getElementById('repeatersEmpty');
    const table = document.getElementById('repeatersTable');
    
    empty.innerHTML = `
      <i class="mdi mdi-antenna"></i>
      <p>Loading UK repeaters...</p>
      <div class="loading-spinner small"></div>
    `;
    empty.style.display = '';
    table.style.display = 'none';
    
    try {
      const repeaters = await API.getUKRepeaters(forceRefresh);
      
      if (!repeaters || repeaters.length === 0) {
        empty.innerHTML = `
          <i class="mdi mdi-antenna"></i>
          <p>No repeaters found</p>
        `;
        return;
      }
      
      // Store for filtering
      this._repeaters = repeaters;
      
      // Populate region filter
      const regions = [...new Set(repeaters.map(r => r.region).filter(Boolean))].sort();
      const regionSelect = document.getElementById('repeaterRegionFilter');
      regionSelect.innerHTML = `
        <option value="">All Regions</option>
        ${regions.map(r => `<option value="${r}">${r}</option>`).join('')}
      `;
      
      this.renderRepeatersTable(repeaters);
      
    } catch (error) {
      empty.innerHTML = `
        <i class="mdi mdi-alert"></i>
        <p>Failed to load repeaters</p>
        <small>${Utils.escapeHtml(error.message)}</small>
        <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="UI.loadRepeaters(true)">
          <i class="mdi mdi-refresh"></i>
          Try Again
        </button>
      `;
    }
  },

  /**
   * Render repeaters table with pagination
   * @param {Array} repeaters - Repeaters to display
   * @param {number} page - Current page (1-based)
   * @param {number} perPage - Items per page
   */
  renderRepeatersTable(repeaters, page = 1, perPage) {
    const tbody = document.getElementById('repeatersTableBody');
    const empty = document.getElementById('repeatersEmpty');
    const table = document.getElementById('repeatersTable');
    
    if (!repeaters || repeaters.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }

    this._ensureRepeaterTablePrefs();
    if (!perPage) perPage = this._repeatersPageSize;

    const sorted = this._sortRepeaters(repeaters);

    // Calculate pagination (perPage is Infinity when "All" is selected)
    const totalPages = perPage >= sorted.length ? 1 : Math.max(1, Math.ceil(sorted.length / perPage));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * perPage;
    const endIndex = perPage >= sorted.length ? sorted.length : Math.min(startIndex + perPage, sorted.length);
    const pageData = sorted.slice(startIndex, endIndex);
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = pageData.map(r => {
      const isOperational = r.status === 'OPERATIONAL' || r.status === 'ACTIVE';
      const statusClass = isOperational ? 'status-operational' : 'status-not-operational';
      const statusText = r.status || 'UNKNOWN';
      
      // Resolve location for map button
      let mapBtn = '';
      let lat = r.latitude, lng = r.longitude;
      if ((!lat || !lng) && r.locator) {
        const coords = Utils.maidenheadToLatLon(r.locator);
        if (coords) { lat = coords.lat; lng = coords.lon; }
      }
      if (lat && lng) {
        mapBtn = `<button class="btn-map-icon" title="Show on map" onclick="UI.showRepeaterOnMap(${lat},${lng},'<strong>${Utils.escapeHtml(r.callsign)}</strong><br>${Utils.escapeHtml(r.qth || r.town || r.city || '')}')"><i class="mdi mdi-map-marker"></i></button>`;
      }
      
      return `
      <tr data-callsign="${r.callsign}" class="${!isOperational ? 'inactive-row' : ''}">
        <td><input type="checkbox" class="repeater-select" value="${r.callsign}"></td>
        <td><strong>${Utils.escapeHtml(r.callsign)}</strong></td>
        <td>${Utils.escapeHtml(r.qth || r.town || r.city || '')}</td>
        <td>
          <span class="channel-type ${r.type === 'DV' ? 'digital' : 'analog'}">
            ${r.type || 'FM'}
          </span>
        </td>
        <td>${Utils.formatFrequency(r.txFreq || r.frequency) || ''}</td>
        <td>${Utils.formatFrequency(r.rxFreq) || ''}</td>
        <td>${r.ctcss || r.colorCode || ''}</td>
        <td>${r.locator || ''}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${mapBtn}</td>
      </tr>
    `;
    }).join('');
    
    // Update pagination info
    this._updateRepeatersPagination(sorted.length, safePage, perPage, totalPages);
    this._updateRepeaterSortIndicators();
    
    // Bind select all
    document.getElementById('selectAllRepeaters').addEventListener('change', (e) => {
      document.querySelectorAll('.repeater-select').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  },

  /**
   * Load persisted repeaters sort/page-size preferences (once).
   */
  _ensureRepeaterTablePrefs() {
    if (this._repeatersPrefsReady) return;
    this._repeatersPrefsReady = true;
    const size = Utils.storage.get(CONFIG.STORAGE.REPEATERS_PAGE_SIZE, 100);
    this._repeatersPageSize = size === 'all' ? Infinity : (parseInt(size, 10) || 100);
    const sort = Utils.storage.get(CONFIG.STORAGE.REPEATERS_SORT, null);
    this._repeaterSort = (sort && sort.key) ? sort : null;
    this._currentRepeaterPage = this._currentRepeaterPage || 1;
  },

  _sortRepeaters(repeaters) {
    const cfg = this._repeaterSort;
    const sorted = [...repeaters];
    if (cfg && cfg.key) {
      const dir = cfg.dir === 'desc' ? -1 : 1;
      sorted.sort((a, b) => {
        const va = this._repeaterSortValue(a, cfg.key);
        const vb = this._repeaterSortValue(b, cfg.key);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        if (va == null) return 1;
        if (vb == null) return -1;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
      });
    } else {
      // Default: operational first, then callsign, keeping modes together.
      sorted.sort((a, b) => {
        const aOp = (a.status === 'OPERATIONAL' || a.status === 'ACTIVE') ? 0 : 1;
        const bOp = (b.status === 'OPERATIONAL' || b.status === 'ACTIVE') ? 0 : 1;
        if (aOp !== bOp) return aOp - bOp;
        const byCall = (a.callsign || '').localeCompare(b.callsign || '');
        if (byCall !== 0) return byCall;
        return ((a.mode || a.type) === 'DMR' || a.type === 'DV' ? 0 : 1) - ((b.mode || b.type) === 'DMR' || b.type === 'DV' ? 0 : 1);
      });
    }
    return sorted;
  },

  _repeaterSortValue(r, key) {
    switch (key) {
      case 'callsign': return r.callsign || '';
      case 'name': return r.qth || r.town || r.city || '';
      case 'mode': return r.modeLabel || r.mode || r.type || '';
      case 'network': return r.network || '';
      case 'tx': return parseFloat(r.txFreq) || 0;
      case 'rx': return parseFloat(r.rxFreq) || 0;
      case 'ctcss': return r.hasDMR ? (parseInt(r.colorCode, 10) || 0) : (parseFloat(r.ctcss) || 0);
      case 'status': return (r.status === 'OPERATIONAL' || r.status === 'ACTIVE') ? 0 : 1;
      default: return '';
    }
  },

  toggleRepeaterSort(key) {
    this._ensureRepeaterTablePrefs();
    if (this._repeaterSort && this._repeaterSort.key === key) {
      this._repeaterSort.dir = this._repeaterSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this._repeaterSort = { key, dir: 'asc' };
    }
    Utils.storage.set(CONFIG.STORAGE.REPEATERS_SORT, this._repeaterSort);
    this._currentRepeaterPage = 1;
    this.filterRepeaters(document.getElementById('repeaterSearch')?.value || '', true);
  },

  _updateRepeaterSortIndicators() {
    const cfg = this._repeaterSort;
    document.querySelectorAll('#repeatersTable th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = '';
      if (cfg && th.dataset.sort === cfg.key) {
        const desc = cfg.dir === 'desc';
        th.classList.add(desc ? 'sort-desc' : 'sort-asc');
        if (icon) icon.textContent = desc ? '▼' : '▲';
      }
    });
  },

  setRepeatersPageSize(value) {
    this._ensureRepeaterTablePrefs();
    this._repeatersPageSize = value === 'all' ? Infinity : (parseInt(value, 10) || 100);
    Utils.storage.set(CONFIG.STORAGE.REPEATERS_PAGE_SIZE, value === 'all' ? 'all' : this._repeatersPageSize);
    this._currentRepeaterPage = 1;
    this.filterRepeaters(document.getElementById('repeaterSearch')?.value || '', true);
  },

  /**
   * Update repeaters pagination UI
   */
  _updateRepeatersPagination(total, page, perPage, totalPages) {
    let paginationEl = document.getElementById('repeatersPagination');
    if (!paginationEl) {
      // Create pagination element if it doesn't exist
      const container = document.getElementById('repeatersTable').parentElement;
      paginationEl = document.createElement('div');
      paginationEl.id = 'repeatersPagination';
      paginationEl.className = 'pagination-controls';
      container.appendChild(paginationEl);
    }

    const eff = perPage >= total ? total : perPage;
    const sizeValue = this._repeatersPageSize === Infinity ? 'all' : String(this._repeatersPageSize);
    const sizeOptions = [['25', '25'], ['50', '50'], ['100', '100'], ['200', '200'], ['all', 'All']]
      .map(([v, l]) => `<option value="${v}"${v === sizeValue ? ' selected' : ''}>${l}</option>`)
      .join('');

    paginationEl.innerHTML = `
      <div class="pagination-info">
        Showing ${total === 0 ? 0 : Math.min((page - 1) * eff + 1, total)}-${Math.min(page * eff, total)} of ${total} repeaters
      </div>
      <div class="pagination-buttons">
        <label class="pagination-size">Show:
          <select class="form-select" onchange="UI.setRepeatersPageSize(this.value)">${sizeOptions}</select>
        </label>
        <button class="btn btn-sm" ${page === 1 ? 'disabled' : ''} onclick="UI.goToRepeaterPage(${page - 1})">Previous</button>
        <span class="page-indicator">Page ${page} of ${totalPages}</span>
        <button class="btn btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="UI.goToRepeaterPage(${page + 1})">Next</button>
      </div>
    `;
  },

  /**
   * Go to specific repeater page
   */
  goToRepeaterPage(page) {
    this._currentRepeaterPage = page;
    this.filterRepeaters(document.getElementById('repeaterSearch')?.value || '', true);
  },

  /**
   * Filter repeaters
   */
  filterRepeaters(query, keepPage = false) {
    if (!this._repeaters) return;
    
    const typeFilter = document.getElementById('repeaterTypeFilter').value;
    const bandFilter = document.getElementById('repeaterBandFilter').value;
    const regionFilter = document.getElementById('repeaterRegionFilter').value;
    const statusFilter = document.getElementById('repeaterStatusFilter')?.value || '';
    
    let filtered = this._repeaters;
    
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(r => 
        r.callsign?.toLowerCase().includes(q) ||
        r.qth?.toLowerCase().includes(q) ||
        r.town?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q)
      );
    }
    
    if (typeFilter) {
      filtered = filtered.filter(r => r.type === typeFilter);
    }
    
    if (bandFilter === '2m') {
      filtered = filtered.filter(r => {
        const freq = parseFloat(r.txFreq || r.frequency);
        return freq >= 144 && freq <= 148;
      });
    } else if (bandFilter === '70cm') {
      filtered = filtered.filter(r => {
        const freq = parseFloat(r.txFreq || r.frequency);
        return freq >= 430 && freq <= 450;
      });
    }
    
    if (regionFilter) {
      filtered = filtered.filter(r => r.region === regionFilter);
    }
    
    // Filter by operational status
    if (statusFilter === 'operational') {
      filtered = filtered.filter(r => r.status === 'OPERATIONAL' || r.status === 'ACTIVE');
    } else if (statusFilter === 'not-operational') {
      filtered = filtered.filter(r => r.status !== 'OPERATIONAL' && r.status !== 'ACTIVE');
    }
    
    // Reset to page 1 when filtering (unless the caller is paginating).
    if (!keepPage) this._currentRepeaterPage = 1;
    this._currentRepeaterPage = this._currentRepeaterPage || 1;
    this.renderRepeatersTable(filtered, this._currentRepeaterPage);
  },

  /**
   * Import selected repeaters as channels
   */
  importSelectedRepeaters() {
    const selected = document.querySelectorAll('.repeater-select:checked');
    
    if (selected.length === 0) {
      Utils.toast('No repeaters selected', 'warning');
      return;
    }
    
    // Check if any DMR repeaters are selected
    const selectedRepeaters = [];
    let hasDMR = false;
    
    selected.forEach(checkbox => {
      const callsign = checkbox.value;
      const repeater = this._repeaters.find(r => r.callsign === callsign);
      if (repeater) {
        selectedRepeaters.push(repeater);
        if (repeater.type === 'DV') {
          hasDMR = true;
        }
      }
    });
    
    // Always show import options modal with zone selection
    this.showRepeaterImportOptions(selectedRepeaters, hasDMR);
  },

  /**
   * Show repeater import options modal with zone selection and optional TG list
   */
  showRepeaterImportOptions(repeaters, hasDMR) {
    const showTGList = hasDMR && window.codeplug.tgLists.length > 0;
    const tgListOptions = showTGList ? window.codeplug.tgLists.map(t => 
      `<option value="${Utils.escapeHtml(t.name)}">${Utils.escapeHtml(t.name)}</option>`
    ).join('') : '';
    
    const dmrCount = repeaters.filter(r => r.type === 'DV').length;
    const zones = window.codeplug.zones || [];
    const zoneOptions = zones.map(z => `<option value="${z.id}">${Utils.escapeHtml(z.name)}</option>`).join('');

    let content = `<p>You are importing ${repeaters.length} repeater(s)${dmrCount > 0 ? `, including ${dmrCount} DMR repeater(s)` : ''}.</p>`;
    
    if (showTGList) {
      content += `
      <div class="form-group">
        <label class="form-label">TG List for DMR Channels (optional)</label>
        <select class="form-select" id="importDMRTGList">
          <option value="">None</option>
          ${tgListOptions}
        </select>
        <small class="form-help">Select a TG list to assign to all imported DMR channels</small>
      </div>`;
    }

    content += `
      <div style="margin-top:1rem;padding:0.75rem;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-elevated)">
        <strong style="font-size:0.9rem"><i class="mdi mdi-map-marker-radius"></i> Add to Zone</strong>
        <div style="display:flex;gap:0.75rem;align-items:center;margin-top:0.5rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="repeaterZoneOption" value="none" checked> No zone
          </label>
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="repeaterZoneOption" value="new"> New zone
          </label>
          ${zones.length > 0 ? `
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="repeaterZoneOption" value="existing"> Existing zone
          </label>` : ''}
          <input type="text" class="form-input" id="repeaterNewZoneName" placeholder="Zone name" maxlength="16" style="width:160px;display:none">
          <select class="form-select" id="repeaterExistingZone" style="width:180px;display:none">
            ${zoneOptions}
          </select>
        </div>
      </div>`;
    
    UI.showModal('Import Repeaters', content, {
      confirmText: 'Import',
      onConfirm: () => {
        const selectedTGList = showTGList ? (document.getElementById('importDMRTGList').value || null) : null;

        // Determine zone option
        const zoneOption = document.querySelector('input[name="repeaterZoneOption"]:checked');
        const zoneValue = zoneOption ? zoneOption.value : 'none';
        let targetZone = null;

        if (zoneValue === 'new') {
          const zoneName = (document.getElementById('repeaterNewZoneName').value || '').trim();
          if (!zoneName) {
            Utils.toast('Please enter a name for the new zone', 'warning');
            return;
          }
          try {
            targetZone = window.codeplug.addZone({ name: Utils.truncate(zoneName, CONFIG.LIMITS.ZONE_NAME_LEN) });
          } catch (e) {
            Utils.toast(e.message, 'error');
            return;
          }
        } else if (zoneValue === 'existing') {
          const zoneId = document.getElementById('repeaterExistingZone').value;
          targetZone = window.codeplug.zones.find(z => String(z.id) === zoneId);
          if (!targetZone) {
            Utils.toast('Selected zone not found', 'error');
            return;
          }
        }

        this.doImportRepeaters(repeaters, selectedTGList, targetZone);
      }
    });

    // Bind zone option radio change
    document.querySelectorAll('input[name="repeaterZoneOption"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const val = document.querySelector('input[name="repeaterZoneOption"]:checked').value;
        document.getElementById('repeaterNewZoneName').style.display = val === 'new' ? '' : 'none';
        document.getElementById('repeaterExistingZone').style.display = val === 'existing' ? '' : 'none';
      });
    });
  },

  /**
   * Perform the actual repeater import
   */
  doImportRepeaters(repeaters, tgList, targetZone) {
    let imported = 0;
    let skipped = 0;
    const importedNames = [];
    
    repeaters.forEach(repeater => {
      if (window.codeplug.channels.length < getEffectiveLimits().MAX_CHANNELS) {
        // Convert maidenhead locator to lat/lon if available
        let lat = null;
        let lon = null;
        let hasLocation = false;
        
        // Check for direct lat/lng (DMR repeaters)
        if (repeater.latitude && repeater.longitude) {
          lat = parseFloat(parseFloat(repeater.latitude).toFixed(4));
          lon = parseFloat(parseFloat(repeater.longitude).toFixed(4));
          hasLocation = true;
        } else if (repeater.locator) {
          // Convert maidenhead locator to lat/lon
          const coords = Utils.maidenheadToLatLon(repeater.locator);
          if (coords) {
            lat = parseFloat(coords.lat.toFixed(4));
            lon = parseFloat(coords.lon.toFixed(4));
            hasLocation = true;
          }
        }
        
        // Determine if it's a DMR (DV) repeater
        const isDMR = repeater.type === 'DV' || repeater.colorCode;
        
        // Normalize CTCSS tone to match codeplug format
        const normalizedTone = Utils.normalizeCTCSS(repeater.ctcss);
        
        // Calculate channel properties for duplicate check
        const channelName = Utils.truncate(repeater.callsign, CONFIG.LIMITS.CHANNEL_NAME_LEN);
        const channelRxFreq = parseFloat(repeater.txFreq || repeater.frequency) || 0;
        const channelTxFreq = parseFloat(repeater.rxFreq || repeater.frequency) || 0;
        
        // Check for duplicate by channel name + type
        const channelType = isDMR ? CONFIG.CHANNEL_TYPES.DIGITAL : CONFIG.CHANNEL_TYPES.ANALOG;
        const isDuplicate = window.codeplug.channels.some(existingChannel => 
          existingChannel.name === channelName && existingChannel.type === channelType
        );
        
        if (isDuplicate) {
          skipped++;
          return; // Skip this repeater
        }
        
        window.codeplug.addChannel({
          name: channelName,
          type: isDMR ? CONFIG.CHANNEL_TYPES.DIGITAL : CONFIG.CHANNEL_TYPES.ANALOG,
          rxFreq: channelRxFreq,
          txFreq: channelTxFreq,
          colorCode: parseInt(repeater.colorCode) || 1,
          timeslot: 1,
          txTone: normalizedTone,
          rxTone: 'None',
          tgList: isDMR ? tgList : null,
          latitude: lat,
          longitude: lon,
          // Enable GPS location by default when location data is available
          useLocation: hasLocation
        });
        importedNames.push(channelName);
        imported++;
      }
    });
    
    UI.hideModal();

    // Add imported channel names to the target zone
    if (targetZone && imported > 0) {
      const existingNames = new Set(targetZone.channels);
      const channelNames = importedNames.filter(n => !existingNames.has(n));
      const maxPerZone = getEffectiveLimits().MAX_CHANNELS_PER_ZONE;
      const availableSlots = maxPerZone - targetZone.channels.length;

      if (channelNames.length > availableSlots) {
        // Overflow detected - ask user about splitting
        const totalZonesNeeded = 1 + Math.ceil((channelNames.length - availableSlots) / maxPerZone);
        const baseName = targetZone.name;

        UI.updateOverview();

        UI.showModal('Zone Limit Exceeded', `
          <p>${channelNames.length} channels to add but zone "${Utils.escapeHtml(baseName)}" only has room for ${availableSlots} more (limit: ${maxPerZone} per zone).</p>
          <p>Would you like to split across ${totalZonesNeeded} zone${totalZonesNeeded !== 1 ? 's' : ''}?</p>
          <p class="text-muted">Zones will be named: "${Utils.escapeHtml(baseName)}", "${Utils.escapeHtml(Utils.truncate(baseName, CONFIG.LIMITS.ZONE_NAME_LEN - 2) + ' 2')}", "${Utils.escapeHtml(Utils.truncate(baseName, CONFIG.LIMITS.ZONE_NAME_LEN - 2) + ' 3')}"${totalZonesNeeded > 3 ? '...' : ''}</p>
        `, {
          confirmText: 'Split Across Zones',
          onConfirm: () => {
            // Fill current zone up to limit
            channelNames.slice(0, availableSlots).forEach(n => targetZone.channels.push(n));
            // Create overflow zones
            let remaining = channelNames.slice(availableSlots);
            let zoneNum = 2;
            while (remaining.length > 0) {
              const batch = remaining.slice(0, maxPerZone);
              remaining = remaining.slice(maxPerZone);
              try {
                const suffix = ` ${zoneNum}`;
                const splitName = Utils.truncate(baseName, CONFIG.LIMITS.ZONE_NAME_LEN - suffix.length) + suffix;
                window.codeplug.addZone({ name: splitName, channels: batch });
              } catch (e) {
                Utils.toast(e.message, 'error');
                break;
              }
              zoneNum++;
            }
            window.codeplug.modified = true;
            UI.hideModal();
            UI.renderZones();
            UI.updateOverview();
            const skipMsg = skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : '';
            Utils.toast(`Imported ${imported} repeaters as channels split across ${zoneNum - 1} zones${skipMsg}`, 'success');
          }
        });
        return;
      }

      // All channels fit in the target zone
      channelNames.forEach(n => targetZone.channels.push(n));
      window.codeplug.modified = true;
    }

    UI.updateOverview();
    if (targetZone) UI.renderZones();
    const skipMsg = skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : '';
    Utils.toast(`Imported ${imported} repeaters as channels${targetZone ? ' into zone "' + targetZone.name + '"' : ''}${skipMsg}`, 'success');
  },

  // ============================================================================
  // DMR Repeaters (RadioID)
  // ============================================================================

  /**
   * DMR repeaters are loaded from a local file in the standalone build.
   */
  async loadDMRRepeaters() {
    const tbody = document.getElementById('dmrRepeatersTableBody');
    const empty = document.getElementById('dmrRepeatersEmpty');
    const table = document.getElementById('dmrRepeatersTable');

    if (!tbody || !empty || !table) return;

    if (this._dmrRepeaters && this._dmrRepeaters.length > 0) {
      this.renderDMRRepeatersTable(this._dmrRepeaters);
      return;
    }

    table.style.display = 'none';
    empty.style.display = '';
    empty.innerHTML = `
      <i class="mdi mdi-file-upload"></i>
      <p>No DMR repeater data loaded</p>
      <p class="text-muted">Download the repeater data file from
        <a href="https://radioid.net/static/rptrs.json" target="_blank" rel="noopener noreferrer">radioid.net/static/rptrs.json</a>
        and use <strong>Load from File</strong>.</p>
      <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="document.getElementById('dmrRepeaterFileInput').click()">
        <i class="mdi mdi-file-upload"></i> Load from File
      </button>
    `;
  },

  /**
   * Import DMR repeaters from a local JSON or CSV file.
   * Accepts the RadioID API response ({ results: [...] }), the CPS format
   * ({ repeaters: [...] }) or a bare array.
   */
  async importDMRRepeatersFile(file) {
    if (!file) return;
    Utils.toast('Reading DMR repeater file...', 'info');
    try {
      const text = await file.text();
      const trimmed = text.trim();
      let raw = [];
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        raw = Array.isArray(parsed) ? parsed : (parsed.results || parsed.repeaters || parsed.rptrs || []);
      } else {
        raw = this._parseDMRRepeatersCSV(text);
      }

      const repeaters = raw.map(r => this._normaliseDMRRepeater(r)).filter(Boolean);
      if (repeaters.length === 0) {
        Utils.toast('No DMR repeaters found in that file', 'error');
        return;
      }

      this._dmrRepeaters = repeaters;
      this.renderDMRRepeatersTable(repeaters);
      Utils.toast(`Loaded ${repeaters.length.toLocaleString()} DMR repeaters`, 'success');
    } catch (error) {
      Utils.toast('Load failed: ' + error.message, 'error');
    }
  },

  _normaliseDMRRepeater(r) {
    if (!r || typeof r !== 'object') return null;
    const callsign = (r.callsign || r.Callsign || '').toString().trim();
    if (!callsign) return null;

    const freq = parseFloat(r.frequency != null ? r.frequency : r.freq);
    const offset = parseFloat(r.offset);
    const txFreq = !isNaN(freq) ? freq.toFixed(5) : '';
    const rxFreq = (!isNaN(freq) && !isNaN(offset)) ? (freq + offset).toFixed(5) : '';

    let status = (r.status || '').toString();
    if (status.toLowerCase() === 'on-air') status = 'ACTIVE';

    const lat = parseFloat(r.lat != null ? r.lat : r.latitude);
    const lng = parseFloat(r.lng != null ? r.lng : (r.lon != null ? r.lon : r.longitude));

    return {
      id: r.id != null ? r.id : (r.identity_id != null ? r.identity_id : callsign),
      callsign,
      city: r.city || '',
      state: r.state || '',
      country: r.country || '',
      frequency: r.frequency != null ? String(r.frequency) : '',
      txFreq,
      rxFreq,
      colorCode: parseInt(r.color_code != null ? r.color_code : r.colorCode, 10) || 1,
      offset: r.offset != null ? String(r.offset) : '',
      ipscNetwork: r.ipsc_network || r.ipscNetwork || '',
      trustee: r.trustee || '',
      status,
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lng) ? null : lng
    };
  },

  _parseDMRRepeatersCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = this._parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this._parseCSVLine(lines[i]);
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      rows.push(obj);
    }
    return rows;
  },

  /**
   * Render DMR repeaters table
   */
  renderDMRRepeatersTable(repeaters, page = 1, perPage = 100) {
    const tbody = document.getElementById('dmrRepeatersTableBody');
    const empty = document.getElementById('dmrRepeatersEmpty');
    const table = document.getElementById('dmrRepeatersTable');
    
    if (!repeaters || repeaters.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    // Sort by status (active first), then by callsign
    const sorted = [...repeaters].sort((a, b) => {
      const aActive = a.status === 'ACTIVE' ? 0 : 1;
      const bActive = b.status === 'ACTIVE' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.callsign || '').localeCompare(b.callsign || '');
    });
    
    // Calculate pagination
    const totalPages = Math.ceil(sorted.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, sorted.length);
    const pageData = sorted.slice(startIndex, endIndex);
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = pageData.map(r => {
      const statusClass = r.status === 'ACTIVE' ? 'status-operational' : 'status-not-operational';
      
      // Map button for DMR repeaters (they have direct lat/lng)
      let mapBtn = '';
      if (r.latitude && r.longitude) {
        mapBtn = `<button class="btn-map-icon" title="Show on map" onclick="UI.showRepeaterOnMap(${r.latitude},${r.longitude},'<strong>${Utils.escapeHtml(r.callsign)}</strong><br>${Utils.escapeHtml(r.city || '')}')"><i class="mdi mdi-map-marker"></i></button>`;
      }
      
      return `
      <tr data-id="${r.id}">
        <td><input type="checkbox" class="dmr-repeater-select" value="${r.id}"></td>
        <td><strong>${Utils.escapeHtml(r.callsign)}</strong></td>
        <td>${Utils.escapeHtml(r.city || '')}</td>
        <td>${Utils.escapeHtml(r.country || '')}</td>
        <td>${Utils.formatFrequency(r.txFreq || r.frequency) || ''}</td>
        <td>${Utils.formatFrequency(r.rxFreq) || ''}</td>
        <td>${r.colorCode || ''}</td>
        <td>${Utils.escapeHtml(r.ipscNetwork || '')}</td>
        <td><span class="status-badge ${statusClass}">${r.status || 'UNKNOWN'}</span></td>
        <td>${mapBtn}</td>
      </tr>
    `;
    }).join('');
    
    // Update pagination
    this._updateDMRRepeatersPagination(sorted.length, page, perPage, totalPages);
    
    // Bind select all
    document.getElementById('selectAllDMRRepeaters')?.addEventListener('change', (e) => {
      document.querySelectorAll('.dmr-repeater-select').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  },

  /**
   * Update DMR repeaters pagination UI
   */
  _updateDMRRepeatersPagination(total, page, perPage, totalPages) {
    let paginationEl = document.getElementById('dmrRepeatersPagination');
    if (!paginationEl) {
      const container = document.getElementById('dmrRepeatersTable')?.parentElement;
      if (!container) return;
      paginationEl = document.createElement('div');
      paginationEl.id = 'dmrRepeatersPagination';
      paginationEl.className = 'pagination-controls';
      container.appendChild(paginationEl);
    }
    
    paginationEl.innerHTML = `
      <div class="pagination-info">
        Showing ${Math.min((page - 1) * perPage + 1, total)}-${Math.min(page * perPage, total)} of ${total} DMR repeaters
      </div>
      <div class="pagination-buttons">
        <button class="btn btn-sm" ${page === 1 ? 'disabled' : ''} onclick="UI.goToDMRRepeaterPage(${page - 1})">Previous</button>
        <span class="page-indicator">Page ${page} of ${totalPages}</span>
        <button class="btn btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="UI.goToDMRRepeaterPage(${page + 1})">Next</button>
      </div>
    `;
  },

  /**
   * Go to specific DMR repeater page
   */
  goToDMRRepeaterPage(page) {
    this._currentDMRRepeaterPage = page;
    this.filterDMRRepeaters();
  },

  /**
   * Filter DMR repeaters
   */
  filterDMRRepeaters(query = '') {
    if (!this._dmrRepeaters) return;
    
    const searchQuery = query || document.getElementById('dmrRepeaterSearch')?.value || '';
    const countryFilter = document.getElementById('dmrRepeaterCountryFilter')?.value || '';
    const networkFilter = document.getElementById('dmrRepeaterNetworkFilter')?.value || '';
    const statusFilter = document.getElementById('dmrRepeaterStatusFilter')?.value || '';
    
    let filtered = this._dmrRepeaters;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.callsign?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.ipscNetwork?.toLowerCase().includes(q)
      );
    }
    
    if (countryFilter) {
      filtered = filtered.filter(r => r.country === countryFilter);
    }
    
    if (networkFilter) {
      filtered = filtered.filter(r => 
        r.ipscNetwork?.toLowerCase().includes(networkFilter.toLowerCase())
      );
    }
    
    if (statusFilter) {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    this._currentDMRRepeaterPage = this._currentDMRRepeaterPage || 1;
    this.renderDMRRepeatersTable(filtered, this._currentDMRRepeaterPage);
  },

  /**
   * Import selected DMR repeaters as channels
   */
  importSelectedDMRRepeaters() {
    const selected = document.querySelectorAll('.dmr-repeater-select:checked');
    
    if (selected.length === 0) {
      Utils.toast('No DMR repeaters selected', 'warning');
      return;
    }
    
    const selectedRepeaters = [];
    selected.forEach(checkbox => {
      const id = parseInt(checkbox.value);
      const repeater = this._dmrRepeaters.find(r => r.id === id);
      if (repeater) {
        // Convert to common format
        // Use pre-computed txFreq and rxFreq (frequency + offset)
        selectedRepeaters.push({
          callsign: repeater.callsign,
          type: 'DV', // DMR
          txFreq: parseFloat(repeater.txFreq || repeater.frequency) || 0,
          rxFreq: parseFloat(repeater.rxFreq) || parseFloat(repeater.txFreq || repeater.frequency) || 0,
          colorCode: repeater.colorCode,
          latitude: repeater.latitude,
          longitude: repeater.longitude,
          locator: null
        });
      }
    });
    
    // Always show import options modal with zone selection
    this.showRepeaterImportOptions(selectedRepeaters, true);
  },

  // ============================================================================
  // World Repeater Map
  // ============================================================================

  /**
   * Initialize repeater map
   */
  initRepeaterMap() {
    if (this._repeaterMap) return; // Already initialized
    
    const mapContainer = document.getElementById('repeaterMap');
    if (!mapContainer || typeof L === 'undefined') return;
    
    // Initialize Leaflet map
    this._repeaterMap = L.map('repeaterMap').setView([51.5, -0.1], 5);
    
    // Base tile layer (light/dark switched by the theme toggle)
    this._repeaterTileLayer = L.tileLayer(this._tileUrl(), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this._repeaterMap);
    
    // Create marker layer (clustered when the plugin is available)
    if (typeof L.markerClusterGroup === 'function') {
      this._mapMarkers = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.5,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true
      });
    } else {
      this._mapMarkers = L.layerGroup();
    }
    this._mapMarkers.addTo(this._repeaterMap);
    
    // Store loaded map repeaters for import
    this._mapRepeaters = [];
    this._mapMarkerRefs = [];
    
    // Radius circle overlay
    this._radiusCircle = null;
    this._radiusCenter = null;
    
    // Click handler to set radius centre point
    this._repeaterMap.on('click', (e) => {
      const radiusKm = parseInt(document.getElementById('mapImportRadius')?.value) || 0;
      if (radiusKm > 0) {
        this._radiusCenter = e.latlng;
      } else {
        // "Visible Area" selected – clear any existing circle
        this._radiusCenter = null;
      }
      this._updateRadiusCircle();
    });
    
    // Debounce timer for bbox loads
    this._bboxLoadTimer = null;
    this._repeaterPopupOpen = false;

    // Opening a marker near an edge makes Leaflet auto-pan the map, which
    // fires moveend and would reload the bbox — clearing the markers and
    // closing the popup we just opened. Skip the reload while one is open.
    this._repeaterMap.on('popupopen', () => { this._repeaterPopupOpen = true; });
    this._repeaterMap.on('popupclose', () => { this._repeaterPopupOpen = false; });

    // Listen for map move/zoom to reload via bbox API
    this._repeaterMap.on('moveend', () => {
      if (this._repeaterPopupOpen) return;
      clearTimeout(this._bboxLoadTimer);
      this._bboxLoadTimer = setTimeout(() => {
        if (this._repeaterPopupOpen) return;
        this.updateRepeaterMap();
      }, 500);
    });
    
    // Load initial data
    this.updateRepeaterMap();
  },

  /**
   * Update the radius circle overlay on the map
   */
  _updateRadiusCircle() {
    // Remove existing circle
    if (this._radiusCircle) {
      this._repeaterMap.removeLayer(this._radiusCircle);
      this._radiusCircle = null;
    }
    
    const radiusKm = parseInt(document.getElementById('mapImportRadius')?.value) || 0;
    if (radiusKm > 0 && this._radiusCenter) {
      this._radiusCircle = L.circle(this._radiusCenter, {
        radius: radiusKm * 1000, // Convert km to meters
        color: '#fbbf24',
        fillColor: '#fbbf24',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 5'
      }).addTo(this._repeaterMap);
    }
  },

  /**
   * Navigate to the repeater map and centre on a specific location
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} label - Popup label text
   */
  showRepeaterOnMap(lat, lng, label) {
    UI.showSection('repeater-map');

    // Match the map to the repeaters table so the target marker is loaded.
    this._syncMapFiltersFromTable();

    setTimeout(async () => {
      if (!this._repeaterMap) {
        this.initRepeaterMap();
      }
      if (!this._repeaterMap) return;

      // Centre on the target first so the bbox load covers it.
      this._repeaterMap.setView([lat, lng], 13, { animate: false });
      clearTimeout(this._bboxLoadTimer);
      try { await this.updateRepeaterMap(); } catch (e) { /* ignore */ }
      clearTimeout(this._bboxLoadTimer);

      // Reuse the marker already on the map instead of adding a new one.
      const marker = this._findMapMarker(lat, lng);
      if (marker) {
        if (this._highlightMarker) {
          this._repeaterMap.removeLayer(this._highlightMarker);
          this._highlightMarker = null;
        }
        const open = () => marker.openPopup();
        if (this._mapMarkers && typeof this._mapMarkers.zoomToShowLayer === 'function') {
          this._mapMarkers.zoomToShowLayer(marker, open);
        } else {
          open();
        }
        return;
      }

      // Fallback: no matching marker (e.g. filtered out) - drop a temporary pin.
      if (this._highlightMarker) {
        this._repeaterMap.removeLayer(this._highlightMarker);
        this._highlightMarker = null;
      }
      this._highlightMarker = L.marker([lat, lng]).addTo(this._repeaterMap);
      if (label) this._highlightMarker.bindPopup(label).openPopup();
    }, 100);
  },

  /**
   * Return the existing map marker nearest the given coordinates (within ~50 m).
   */
  _findMapMarker(lat, lng) {
    const refs = this._mapMarkerRefs || [];
    let best = null;
    let bestD = Infinity;
    for (const r of refs) {
      const d = Math.hypot(r.lat - lat, r.lng - lng);
      if (d < bestD) { bestD = d; best = r; }
    }
    return (best && bestD < 0.0005) ? best.marker : null;
  },

  /**
   * Copy the repeaters-table filters onto the map so both views show the same
   * data before a "view on map" jump. (The standalone build has no datasource
   * selector on the repeaters page.)
   */
  _syncMapFiltersFromTable() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const status = document.getElementById('repeaterStatusFilter')?.value || '';
    setVal('mapStatusFilter', status === 'not-operational' ? '' : status);
  },

  /** Add a WTR (UK licence) channel as a clusterable marker. */
  _addWtrMarker(m, index) {
    if (!m.latitude || !m.longitude || isNaN(m.latitude) || isNaN(m.longitude)) return;
    const active = /^(active|current)$/i.test(String(m.status || ''));
    const color = active ? '#4ade80' : '#fbbf24'; // green active, amber otherwise
    const icon = L.divIcon({
      className: 'repeater-dot',
      html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:1px solid #fff;box-sizing:border-box"></span>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -6]
    });
    const marker = L.marker([m.latitude, m.longitude], { icon, title: m.licence_number || '' });
    marker.bindPopup(this._repeaterPopupHtml(m, index), this._mapPopupOptions());
    this._mapMarkers.addLayer(marker);
    (this._mapMarkerRefs = this._mapMarkerRefs || []).push({ lat: m.latitude, lng: m.longitude, marker });
  },

  /**
   * Update repeater map with data from bbox API
   */
  async updateRepeaterMap() {
    if (!this._repeaterMap) {
      this.initRepeaterMap();
      return;
    }

    this._mapMarkerRefs = [];
    
    const dataSource = document.getElementById('mapDataSource')?.value || 'all';
    const statusFilter = document.getElementById('mapStatusFilter')?.value || '';
    
    // Get current map bounds for bbox query
    const bounds = this._repeaterMap.getBounds();
    const bbox = {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast()
    };
    
    // Wireless Telegraphy Register (UK licences). The unified /bbox returns flat
    // WTR records keyed on tx_frequency/rx_frequency, which the RSGB/DMR dedupe
    // (keyed on callsign|freq|mode) would collapse into one, so handle separately.
    if (dataSource === 'wtr' || dataSource === 'wtr-vhf' || dataSource === 'wtr-uhf') {
      this._mapMarkers.clearLayers();
      try {
        const params = new URLSearchParams({
          south: bbox.south.toString(), west: bbox.west.toString(),
          north: bbox.north.toString(), east: bbox.east.toString(),
          types: 'wtr', format: 'JSON'
        });
        if (dataSource === 'wtr-vhf') { params.set('freq_min', '140000000'); params.set('freq_max', '190000000'); }
        else if (dataSource === 'wtr-uhf') { params.set('freq_min', '420000000'); params.set('freq_max', '490000000'); }
        const data = await API.request(`/bbox?${params.toString()}`);
        const records = (data.results || [])
          .filter(r => r.latitude && r.longitude && !isNaN(r.latitude) && !isNaN(r.longitude));
        this._mapRepeaters = records;
        records.forEach((m, i) => this._addWtrMarker(m, i));
        const countEl = document.getElementById('mapRepeaterCount');
        if (countEl) countEl.textContent = `${records.length} WTR channel${records.length !== 1 ? 's' : ''} shown`;
      } catch (e) {
        console.warn('Failed to load WTR records for map:', e);
      }
      return;
    }

    // Map UI data source values to API types values
    const typesMap = { 'uk': 'rsgb', 'dmr': 'dmr' };
    const apiTypes = typesMap[dataSource] || 'rsgb,dmr';
    
    // Build extra params for WTR band filtering (frequencies in Hz to match WTR database)
    const extraParams = {};
    if (dataSource === 'wtr-vhf') {
      extraParams.freq_min = 140000000;
      extraParams.freq_max = 190000000;
    } else if (dataSource === 'wtr-uhf') {
      extraParams.freq_min = 420000000;
      extraParams.freq_max = 490000000;
    }
    
    // Clear existing markers
    this._mapMarkers.clearLayers();
    
    try {
      const data = await API.getRepeatersByBbox(bbox, {
        types: apiTypes,
        status: statusFilter,
        ...extraParams
      });
      
      const repeaters = Utils.dedupeRepeaters(data.repeaters || []);
      
      // Store repeaters for import functionality
      this._mapRepeaters = repeaters;
      
      // Add markers to map (divIcon markers so clustering works)
      repeaters.forEach((m, i) => {
        if (!m.latitude || !m.longitude || isNaN(m.latitude) || isNaN(m.longitude)) return;
        
        let color;
        if (m.source === 'wtr') {
          color = '#fbbf24'; // Yellow for WTR
        } else if (m.source === 'dmr') {
          color = '#60a5fa'; // Blue for DMR
        } else if (m.status === 'OPERATIONAL' || m.status === 'ACTIVE') {
          color = '#4ade80'; // Green for operational
        } else {
          color = '#f87171'; // Red for not operational
        }
        
        const icon = L.divIcon({
          className: 'repeater-dot',
          html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:1px solid #fff;box-sizing:border-box"></span>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          popupAnchor: [0, -6]
        });
        const marker = L.marker([m.latitude, m.longitude], { icon, title: m.callsign || m.licence_number || '' });
        
        marker.bindPopup(this._repeaterPopupHtml(m, i), this._mapPopupOptions());
        
        this._mapMarkers.addLayer(marker);
        (this._mapMarkerRefs = this._mapMarkerRefs || []).push({ lat: m.latitude, lng: m.longitude, marker });
      });
      
      // Update count display
      const countEl = document.getElementById('mapRepeaterCount');
      if (countEl) {
        countEl.textContent = `${data.count} repeater${data.count !== 1 ? 's' : ''}${data.total > data.count ? ` (showing ${data.count} of ${data.total})` : ''}`;
      }
      
    } catch (e) {
      console.warn('Failed to load repeaters for map via bbox API:', e);
    }
  },

  /**
   * Convert a map repeater record into the shape doImportRepeaters expects.
   */
  _mapRepeaterToImportRecord(m) {
    if (!m) return null;
    if (m.source === 'wtr') {
      const txHz = (m.tx_frequency != null && m.tx_frequency !== '') ? Number(m.tx_frequency) : null;
      const rxHz = (m.rx_frequency != null && m.rx_frequency !== '') ? Number(m.rx_frequency) : null;
      const txMHz = txHz != null ? txHz / 1000000 : 0;
      const rxMHz = rxHz != null ? rxHz / 1000000 : txMHz;
      const em = m.emission || (m.emission_code ? Utils.decodeEmission(m.emission_code) : null);
      const isDigital = !!(em && em.isDigital);
      const name = (m.licencee_company && m.licencee_company !== '-') ? m.licencee_company : (m.licence_number || '');
      return {
        callsign: Utils.abbreviateName(name, CONFIG.LIMITS.CHANNEL_NAME_LEN),
        type: isDigital ? 'DV' : '',
        txFreq: txMHz,
        rxFreq: rxMHz,
        frequency: txMHz,
        colorCode: isDigital ? 1 : null,
        ctcss: 0,
        latitude: m.latitude,
        longitude: m.longitude,
        locator: null
      };
    }
    const isDMR = m.mode === 'DMR' || m.type === 'DV' || !!m.colorCode;
    return {
      callsign: m.callsign,
      type: isDMR ? 'DV' : '',
      txFreq: m.txFreq,
      rxFreq: m.rxFreq,
      frequency: m.txFreq,
      colorCode: m.colorCode,
      ctcss: m.ctcss,
      latitude: m.latitude,
      longitude: m.longitude,
      locator: m.locator
    };
  },

  /**
   * Build the rich popup HTML shared by the repeater map markers (same layout
   * as the WTR map popup), including a "click to import" button.
   */
  _repeaterPopupHtml(m, index) {
    if (!m) return '';
    const isWtr = m.source === 'wtr';
    const title = isWtr ? (m.licence_number || m.callsign || 'Unknown') : (m.callsign || 'Unknown');
    const subtitle = isWtr
      ? ((m.licencee_company && m.licencee_company !== '-') ? m.licencee_company : '')
      : (m.qth || m.town || m.city || '');
    const network = isWtr ? (m.product_description || '') : (m.network || '');
    const statusRaw = String(m.status || 'Unknown');
    const statusActive = /^(OPERATIONAL|ACTIVE|CURRENT|LIVE)$/i.test(statusRaw);

    let txMHz = null;
    let rxMHz = null;
    if (isWtr) {
      // Unified /bbox returns WTR frequencies in Hz as tx_frequency/rx_frequency.
      const txHz = (m.tx_frequency != null && m.tx_frequency !== '') ? Number(m.tx_frequency) : null;
      const rxHz = (m.rx_frequency != null && m.rx_frequency !== '') ? Number(m.rx_frequency) : null;
      txMHz = txHz != null ? txHz / 1000000 : null;
      rxMHz = rxHz != null ? rxHz / 1000000 : null;
    } else {
      txMHz = (m.txFreq != null && m.txFreq !== '') ? Number(m.txFreq) : null;
      rxMHz = (m.rxFreq != null && m.rxFreq !== '') ? Number(m.rxFreq) : null;
    }

    let modeTag = '';
    if (isWtr) {
      const em = m.emission || (m.emission_code ? Utils.decodeEmission(m.emission_code) : null);
      if (em) modeTag = em.category || em.name || '';
    } else if (m.mode === 'DMR' || m.type === 'DV' || m.colorCode) {
      modeTag = 'DMR' + (m.colorCode ? ` CC${m.colorCode}` : '');
    } else {
      modeTag = m.mode || (m.type === 'AV' ? 'FM' : '');
    }
    if (!isWtr && m.ctcss && modeTag) modeTag += ` • Tone ${m.ctcss}`;

    let h = `<div class="map-popup">`;
    h += `<div class="popup-header"><span class="popup-licence">${Utils.escapeHtml(title)}</span></div>`;
    if (subtitle) h += `<div class="popup-company">${Utils.escapeHtml(subtitle)}</div>`;
    if (network) h += `<div class="popup-product">${Utils.escapeHtml(network)}</div>`;
    h += `<span class="popup-status ${statusActive ? 'active' : 'other'}">${Utils.escapeHtml(statusRaw)}</span>`;
    h += `<hr class="popup-divider">`;
    if (txMHz || rxMHz) {
      h += `<div class="popup-channel">`;
      if (txMHz) h += `<div class="popup-freq-row"><span class="popup-freq-label tx">TX</span><span class="popup-freq-value">${txMHz.toFixed(4)} MHz</span></div>`;
      if (rxMHz) h += `<div class="popup-freq-row"><span class="popup-freq-label rx">RX</span><span class="popup-freq-value">${rxMHz.toFixed(4)} MHz</span></div>`;
      if (modeTag) h += `<div class="popup-channel-meta"><span class="popup-mode-tag">${Utils.escapeHtml(modeTag)}</span></div>`;
      h += `</div>`;
    }
    if (m.latitude != null && m.longitude != null && !isNaN(m.latitude) && !isNaN(m.longitude)) {
      h += `<div class="popup-footer"><span>📍 ${Number(m.latitude).toFixed(4)}, ${Number(m.longitude).toFixed(4)}</span></div>`;
    }
    h += `<button class="popup-select-btn select" onclick="UI.importMapRepeater(${index})"><i class="mdi mdi-download"></i> Import</button>`;
    h += `</div>`;
    return h;
  },

  /**
   * Import a single repeater shown on the map (from its popup button).
   */
  importMapRepeater(index) {
    const m = (this._mapRepeaters || [])[index];
    if (!m) {
      Utils.toast('Repeater not found', 'error');
      return;
    }
    const rec = this._mapRepeaterToImportRecord(m);
    if (!rec || !rec.callsign) {
      Utils.toast('This repeater has no name to import', 'warning');
      return;
    }
    this.showRepeaterImportOptions([rec], rec.type === 'DV');
  },

  /**
   * Leaflet popup size bounds that adapt to narrow (phone) screens so popups
   * do not overflow the viewport.
   */
  _mapPopupOptions() {
    const narrow = typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 560;
    return narrow ? { minWidth: 180, maxWidth: 240 } : { minWidth: 220, maxWidth: 300 };
  },

  /**
   * Keep the map's import button label in sync with the selected import radius.
   */
  _updateMapImportLabel() {
    const btn = document.getElementById('importMapRepeatersBtn');
    const radiusSel = document.getElementById('mapImportRadius');
    if (!btn || !radiusSel) return;
    const radius = parseInt(radiusSel.value) || 0;
    const icon = '<i class="mdi mdi-download"></i>';
    btn.innerHTML = radius > 0
      ? `${icon} Import within ${radius} km`
      : `${icon} Import Visible Repeaters`;
  },

  /**
   * Import repeaters visible on the map, optionally filtered by radius.
   * Skips repeaters whose name already exists in the codeplug.
   */
  importMapRepeaters() {
    if (!this._mapRepeaters || this._mapRepeaters.length === 0) {
      Utils.toast('No repeaters loaded on the map', 'warning');
      return;
    }
    
    const radiusKm = parseInt(document.getElementById('mapImportRadius')?.value) || 0;
    let candidates = this._mapRepeaters.filter(m =>
      m.latitude && m.longitude && !isNaN(m.latitude) && !isNaN(m.longitude)
    );
    
    // Filter by radius if a radius is selected and a centre point is set
    if (radiusKm > 0) {
      if (!this._radiusCenter) {
        Utils.toast('Click on the map to set a centre point for the radius', 'warning');
        return;
      }
      const centerLat = this._radiusCenter.lat;
      const centerLng = this._radiusCenter.lng;
      const radiusM = radiusKm * 1000;
      candidates = candidates.filter(m => {
        const dist = this._repeaterMap.distance(
          L.latLng(m.latitude, m.longitude),
          L.latLng(centerLat, centerLng)
        );
        return dist <= radiusM;
      });
    }
    
    if (candidates.length === 0) {
      Utils.toast('No repeaters found within the selected area', 'info');
      return;
    }
    
    // Convert map repeaters to the format expected by doImportRepeaters
    // 'DV' matches the type convention used by doImportRepeaters for DMR channels
    const repeaters = [];
    const nonWtr = [];
    const wtrByLicence = {};
    
    // Separate WTR records and group by licence number for T/R pairing
    candidates.forEach(m => {
      if (m.source === 'wtr') {
        const key = m.licence_number || '';
        if (!wtrByLicence[key]) wtrByLicence[key] = [];
        wtrByLicence[key].push(m);
      } else {
        nonWtr.push(m);
      }
    });
    
    // Process WTR records: pair T/R by licence number
    // Convention: txFreq = station TX, rxFreq = station RX
    // doImportRepeaters handles the swap (station TX → radio RX, station RX → radio TX)
    // Handles duplex pattern where T and R records share same frequencies
    Object.entries(wtrByLicence).forEach(([licence, recs]) => {
      const txRecs = recs.filter(r => r.station_type === 'T').sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
      const rxRecs = recs.filter(r => r.station_type === 'R').sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

      // Detect duplex pattern: T and R share the same frequency set
      const txFreqSet = new Set(txRecs.map(r => r.frequency));
      const rxFreqSet = new Set(rxRecs.map(r => r.frequency));
      const isDuplexPattern = txFreqSet.size > 1 && txFreqSet.size === rxFreqSet.size &&
        [...txFreqSet].every(f => rxFreqSet.has(f));

      const pairs = [];
      if (isDuplexPattern) {
        const uniqueFreqs = [...txFreqSet].sort((a, b) => b - a);
        for (let i = 0; i < Math.ceil(uniqueFreqs.length / 2); i++) {
          const txFreq = uniqueFreqs[i];
          const rxFreq = uniqueFreqs[uniqueFreqs.length - 1 - i];
          const txRec = txRecs.find(r => r.frequency === txFreq) || recs[0];
          const rxRec = txFreq !== rxFreq ? rxRecs.find(r => r.frequency === rxFreq) : null;
          pairs.push({ txRec, rxRec });
        }
      } else {
        const pairCount = Math.max(txRecs.length, rxRecs.length);
        for (let i = 0; i < pairCount; i++) {
          pairs.push({ txRec: txRecs[i] || recs[0], rxRec: rxRecs[i] || null });
        }
        if (pairCount === 0) pairs.push({ txRec: recs[0], rxRec: null });
      }

      pairs.forEach(({ txRec, rxRec }) => {
        const name = txRec.licencee_company && txRec.licencee_company !== '-' ? txRec.licencee_company : licence;
        const stationTxFreq = txRec.frequency ? txRec.frequency / 1000000 : 0;
        const stationRxFreq = rxRec && rxRec.frequency ? rxRec.frequency / 1000000 : stationTxFreq;
        const em = txRec.emission || Utils.decodeEmission(txRec.emission_code);
        const isDigital = em && em.isDigital;
        repeaters.push({
          callsign: Utils.abbreviateName(name, CONFIG.LIMITS.CHANNEL_NAME_LEN),
          type: isDigital ? 'DV' : '',
          txFreq: stationTxFreq,
          rxFreq: stationRxFreq,
          frequency: stationTxFreq,
          colorCode: isDigital ? 1 : null,
          ctcss: 0,
          latitude: txRec.latitude,
          longitude: txRec.longitude,
          locator: null
        });
      });
    });
    
    // Process non-WTR repeaters
    nonWtr.forEach(m => {
      repeaters.push({
        callsign: m.callsign,
        type: m.source === 'dmr' || m.colorCode ? 'DV' : '',
        txFreq: m.txFreq,
        rxFreq: m.rxFreq,
        frequency: m.txFreq,
        colorCode: m.colorCode,
        ctcss: m.ctcss,
        latitude: m.latitude,
        longitude: m.longitude,
        locator: m.locator
      });
    });
    
    // Check if any DMR repeaters, show import options with zone selection
    const hasDMR = repeaters.some(r => r.type === 'DV');
    this.showRepeaterImportOptions(repeaters, hasDMR);
  },

  // ============================================================================
  // WTR (Wireless Telegraphy Register) Import
  // ============================================================================

  _wtrSearchResults: [],
  _wtrPage: 0,
  _wtrPageSize: 100,
  _wtrMaxResults: 20000,
  _wtrAutocompleteTimeout: null,
  _wtrSearchLocation: null,
  _wtrSortColumn: null,
  _wtrSortDirection: 'asc',

  /**
   * Initialize WTR import section - load product types and set up autocomplete
   */
  async initWTR() {
    // Product types are populated from the loaded WTR file (see importWTRFile).
    // No backend request is made in the standalone build.

    // Autocomplete for name search
    const nameInput = document.getElementById('wtrNameSearch');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        clearTimeout(this._wtrAutocompleteTimeout);
        const q = nameInput.value.trim();
        if (q.length < 2) {
          document.getElementById('wtrNameAutocomplete').style.display = 'none';
          return;
        }
        this._wtrAutocompleteTimeout = setTimeout(() => this._wtrDoAutocomplete(q), 300);
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.wtrSearch(); }
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#wtrNameSearch') && !e.target.closest('#wtrNameAutocomplete')) {
          document.getElementById('wtrNameAutocomplete').style.display = 'none';
        }
      });
    }

    // Band filter toggle for custom frequency range
    document.getElementById('wtrBandFilter')?.addEventListener('change', () => {
      const v = document.getElementById('wtrBandFilter').value;
      document.getElementById('wtrCustomFreqGroup').style.display = v === 'custom' ? '' : 'none';
    });

    // Column visibility toggles
    ['wtrColFreq','wtrColType','wtrColAntenna','wtrColLocation','wtrColDistance','wtrColEmission','wtrColLicencee'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.wtrRenderTable());
    });

    // Search button
    document.getElementById('wtrSearchBtn')?.addEventListener('click', () => this.wtrSearch());
    document.getElementById('wtrResetBtn')?.addEventListener('click', () => this.wtrResetFilters());
    document.getElementById('wtrImportSelectedBtn')?.addEventListener('click', () => this.wtrImportSelected());

    // Load WTR data from a local file
    document.getElementById('wtrLoadFileBtn')?.addEventListener('click', () => {
      document.getElementById('wtrFileInput')?.click();
    });
    document.getElementById('wtrFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importWTRFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Select all checkbox
    document.getElementById('wtrSelectAll')?.addEventListener('change', (e) => {
      document.querySelectorAll('#wtrTableBody input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
    });

    // Pagination - client-side re-render only
    document.getElementById('wtrPrevPage')?.addEventListener('click', () => { if (this._wtrPage > 0) { this._wtrPage--; this.wtrRenderTable(); } });
    document.getElementById('wtrNextPage')?.addEventListener('click', () => { this._wtrPage++; this.wtrRenderTable(); });

    // Page size selector - client-side re-render only, persisted in localStorage
    const wtrSizeSel = document.getElementById('wtrPageSize');
    if (wtrSizeSel) {
      const saved = Utils.storage.get(CONFIG.STORAGE.WTR_PAGE_SIZE, null);
      if (saved != null && Array.from(wtrSizeSel.options).some(o => o.value === String(saved))) {
        wtrSizeSel.value = String(saved);
      }
      this._wtrPageSize = wtrSizeSel.value === 'all' ? 10000 : (parseInt(wtrSizeSel.value, 10) || 100);
      wtrSizeSel.addEventListener('change', () => {
        const val = wtrSizeSel.value;
        this._wtrPageSize = val === 'all' ? 10000 : parseInt(val, 10);
        Utils.storage.set(CONFIG.STORAGE.WTR_PAGE_SIZE, val);
        this._wtrPage = 0;
        this.wtrRenderTable();
      });
    }

    // Enter key on search fields
    ['wtrLicenceSearch','wtrGeneralSearch','wtrLocationSearch','wtrLocationRadius'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.wtrSearch(); });
    });

    // Map/Table view toggle
    document.getElementById('wtrViewTable')?.addEventListener('click', () => {
      document.getElementById('wtrTableView').style.display = '';
      document.getElementById('wtrMapContainer').style.display = 'none';
      document.getElementById('wtrViewTable').style.background = 'var(--primary-color,#667eea)';
      document.getElementById('wtrViewTable').style.color = '#fff';
      document.getElementById('wtrViewTable').className = 'btn btn-sm';
      document.getElementById('wtrViewMap').className = 'btn btn-sm btn-secondary';
      document.getElementById('wtrViewMap').style.background = '';
      document.getElementById('wtrViewMap').style.color = '';
    });
    document.getElementById('wtrViewMap')?.addEventListener('click', () => {
      document.getElementById('wtrTableView').style.display = 'none';
      document.getElementById('wtrMapContainer').style.display = '';
      document.getElementById('wtrViewMap').style.background = 'var(--primary-color,#667eea)';
      document.getElementById('wtrViewMap').style.color = '#fff';
      document.getElementById('wtrViewMap').className = 'btn btn-sm';
      document.getElementById('wtrViewTable').className = 'btn btn-sm btn-secondary';
      document.getElementById('wtrViewTable').style.background = '';
      document.getElementById('wtrViewTable').style.color = '';
      this.initWTRMap();
      if (this._wtrMap) {
        setTimeout(() => this._wtrMap.invalidateSize(), 100);
      }
      this.updateWTRMap();
    });

  },

  _wtrMap: null,
  _wtrMapMarkers: null,
  _wtrMapSelected: {},
  _wtrMapLoadTimer: null,
  _wtrPendingPopup: null,

  /**
   * Initialize WTR map
   */
  /** divIcon for a WTR site marker (clusterable). */
  _wtrDotIcon(color, selected) {
    const size = selected ? 16 : 14;
    return L.divIcon({
      className: 'wtr-dot',
      html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${selected ? 2 : 1}px solid #fff;box-sizing:border-box"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  },

  /** All WTR markers, including those currently collapsed inside a cluster. */
  _wtrMarkerLayers() {
    const g = this._wtrMapMarkers;
    if (!g) return [];
    if (typeof g.getLayers === 'function') return g.getLayers();
    const out = [];
    g.eachLayer(m => out.push(m));
    return out;
  },

  _tileUrl() {
    const style = document.documentElement.getAttribute('data-theme') === 'light' ? 'rastertiles/voyager' : 'dark_all';
    return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  },

  applyMapTheme() {
    const url = this._tileUrl();
    if (this._repeaterTileLayer) this._repeaterTileLayer.setUrl(url);
    if (this._wtrTileLayer) this._wtrTileLayer.setUrl(url);
  },

  initWTRMap() {
    if (this._wtrMap) return;
    const container = document.getElementById('wtrMapDiv');
    if (!container || typeof L === 'undefined') return;

    this._wtrMap = L.map('wtrMapDiv').setView([54.0, -2.0], 6);
    this._wtrTileLayer = L.tileLayer(this._tileUrl(), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this._wtrMap);

    // Clustered marker layer (falls back to a plain group without the plugin)
    this._wtrMapMarkers = (typeof L.markerClusterGroup === 'function')
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          spiderfyDistanceMultiplier: 1.5,
          zoomToBoundsOnClick: true,
          removeOutsideVisibleBounds: true
        })
      : L.layerGroup();
    this._wtrMapMarkers.addTo(this._wtrMap);

    this._wtrPopupOpen = false;
    this._wtrMap.on('popupopen', () => { this._wtrPopupOpen = true; });
    this._wtrMap.on('popupclose', () => { this._wtrPopupOpen = false; });

    this._wtrMap.on('moveend', () => {
      // Auto-pan when opening a popup fires moveend; don't clear the markers
      // and close it. An explicit request (_wtrPendingPopup) still proceeds.
      if (this._wtrPopupOpen && !this._wtrPendingPopup) return;
      clearTimeout(this._wtrMapLoadTimer);
      this._wtrMapLoadTimer = setTimeout(() => this.updateWTRMap(), 500);
    });

    // Leaflet needs invalidateSize when container was recently made visible
    setTimeout(() => this._wtrMap.invalidateSize(), 150);
  },

  /**
   * Load WTR data on the map based on current view bounds and filters
   */
  async updateWTRMap() {
    if (!this._wtrMap) return;

    const bounds = this._wtrMap.getBounds();
    const bandFilter = document.getElementById('wtrBandFilter')?.value || 'vhf-uhf';
    const productType = document.getElementById('wtrProductType')?.value || '';
    const modeFilter = document.getElementById('wtrModeFilter')?.value || '';

    let freqMin, freqMax;
    if (bandFilter === 'vhf-uhf') { freqMin = 140000000; freqMax = 490000000; }
    else if (bandFilter === 'vhf') { freqMin = 140000000; freqMax = 190000000; }
    else if (bandFilter === 'uhf') { freqMin = 420000000; freqMax = 490000000; }
    else if (bandFilter === 'hf') { freqMin = 1000000; freqMax = 30000000; }
    else if (bandFilter === 'shf') { freqMin = 1000000000; freqMax = 10000000000; }
    else if (bandFilter === 'custom') {
      const minMHz = parseFloat(document.getElementById('wtrFreqMin')?.value);
      const maxMHz = parseFloat(document.getElementById('wtrFreqMax')?.value);
      if (!isNaN(minMHz)) freqMin = minMHz * 1000000;
      if (!isNaN(maxMHz)) freqMax = maxMHz * 1000000;
    }

    this._wtrMapMarkers.clearLayers();

    try {
      // Build licence groups from locally loaded records
      const records = (this._wtrAllRecords || []).filter(r => {
        if (r.latitude == null || r.longitude == null) return false;
        if (r.latitude < bounds.getSouth() || r.latitude > bounds.getNorth()) return false;
        if (r.longitude < bounds.getWest() || r.longitude > bounds.getEast()) return false;
        if (freqMin || freqMax) {
          const f = r.frequency || 0;
          if (freqMin && f < freqMin) return false;
          if (freqMax && f > freqMax) return false;
        }
        if (productType && r.product_description !== productType) return false;
        return true;
      });

      const groupsMap = new Map();
      records.forEach(r => {
        if (!groupsMap.has(r.licence_number)) {
          groupsMap.set(r.licence_number, { licence_number: r.licence_number, channels: [] });
        }
        groupsMap.get(r.licence_number).channels.push(r);
      });
      let groups = Array.from(groupsMap.values());

      // Client-side mode filter for map view
      if (modeFilter) {
        groups = this._wtrFilterByMode(groups, modeFilter, true);
      }

      let totalChannels = 0;

      groups.forEach(group => {
        const channels = group.channels || [];
        if (channels.length === 0) return;
        const first = channels[0];
        if (!first.latitude || !first.longitude) return;

        totalChannels += channels.length;
        const isSelected = !!this._wtrMapSelected[group.licence_number];
        const dotColor = isSelected ? '#fbbf24' : '#4ade80';

        const marker = L.marker([first.latitude, first.longitude], {
          icon: this._wtrDotIcon(dotColor, isSelected),
          title: group.licence_number || ''
        });

        // Build popup with proper CSS classes
        let popupHtml = `<div class="map-popup">`;
        popupHtml += `<div class="popup-header"><span class="popup-licence">${Utils.escapeHtml(group.licence_number)}</span></div>`;
        const company = first.licencee_company && first.licencee_company !== '-' ? first.licencee_company : '';
        if (company) popupHtml += `<div class="popup-company">${Utils.escapeHtml(company)}</div>`;
        if (first.product_description) popupHtml += `<div class="popup-product">${Utils.escapeHtml(first.product_description)}</div>`;
        const statusCls = (first.status || '').toLowerCase() === 'active' || (first.status || '').toLowerCase() === 'current' ? 'active' : 'other';
        popupHtml += `<span class="popup-status ${statusCls}">${Utils.escapeHtml(first.status || 'Unknown')}</span>`;
        popupHtml += `<hr class="popup-divider">`;

        channels.forEach((ch) => {
          const txMHz = ch.tx_frequency ? (ch.tx_frequency / 1000000).toFixed(4) : '-';
          const rxMHz = ch.rx_frequency ? (ch.rx_frequency / 1000000).toFixed(4) : '-';
          const cat = ch.emission ? ch.emission.category || '' : '';
          popupHtml += `<div class="popup-channel">`;
          popupHtml += `<div class="popup-freq-row"><span class="popup-freq-label tx">TX</span><span class="popup-freq-value">${txMHz} MHz</span></div>`;
          popupHtml += `<div class="popup-freq-row"><span class="popup-freq-label rx">RX</span><span class="popup-freq-value">${rxMHz} MHz</span></div>`;
          if (cat) popupHtml += `<div class="popup-channel-meta"><span class="popup-mode-tag">${cat}</span></div>`;
          popupHtml += `</div>`;
        });

        popupHtml += `<div class="popup-footer"><span>📍 ${first.latitude.toFixed(4)}, ${first.longitude.toFixed(4)}</span></div>`;
        const selLabel = isSelected ? 'Deselect' : 'Select for Import';
        const selCls = isSelected ? 'deselect' : 'select';
        popupHtml += `<button class="popup-select-btn ${selCls}" onclick="UI.wtrToggleMapSelect('${Utils.escapeHtml(group.licence_number)}')">${selLabel}</button>`;
        popupHtml += `</div>`;

        marker.bindPopup(popupHtml, this._mapPopupOptions());
        marker.wtrLicence = group.licence_number;
        marker.wtrGroup = group;
        this._wtrMapMarkers.addLayer(marker);
      });

      const countEl = document.getElementById('wtrMapCount');
      if (countEl) countEl.textContent = `${groups.length} site${groups.length !== 1 ? 's' : ''} (${totalChannels} channel${totalChannels !== 1 ? 's' : ''})`;

      // Open pending popup if wtrShowOnMap was called
      if (this._wtrPendingPopup) {
        const licence = this._wtrPendingPopup;
        const target = this._wtrMarkerLayers().find(m => m.wtrLicence === licence);
        if (target) {
          if (this._wtrMapMarkers && typeof this._wtrMapMarkers.zoomToShowLayer === 'function') {
            this._wtrMapMarkers.zoomToShowLayer(target, () => target.openPopup());
          } else {
            target.openPopup();
          }
        }
        this._wtrPendingPopup = null;
      }

    } catch (e) {
      console.warn('Failed to load WTR map data:', e);
    }
  },

  /**
   * Toggle selection of a WTR site from the map
   */
  wtrToggleMapSelect(licenceNumber) {
    if (this._wtrMapSelected[licenceNumber]) {
      delete this._wtrMapSelected[licenceNumber];
    } else {
      // Find the group data from the markers
      this._wtrMarkerLayers().forEach(marker => {
        if (marker.wtrLicence === licenceNumber && marker.wtrGroup) {
          this._wtrMapSelected[licenceNumber] = marker.wtrGroup;
        }
      });
    }
    this._wtrUpdateMapSelection();
  },

  /**
   * Update map marker styles and top import button based on selection
   */
  _wtrUpdateMapSelection() {
    // Update marker styles
    this._wtrMarkerLayers().forEach(marker => {
      if (!marker.wtrLicence) return;
      const isSelected = !!this._wtrMapSelected[marker.wtrLicence];
      marker.setIcon(this._wtrDotIcon(isSelected ? '#fbbf24' : '#4ade80', isSelected));
      if (marker.setZIndexOffset) marker.setZIndexOffset(isSelected ? 1000 : 0);
    });

    // Update the top import button with combined count
    this._wtrUpdateImportButton();

    // Close popup and reopen to update button text
    if (this._wtrMap) this._wtrMap.closePopup();
  },

  /**
   * Update the top import button to show combined count of table and map selections
   */
  _wtrUpdateImportButton() {
    const tableCount = document.querySelectorAll('#wtrTableBody input[type="checkbox"]:checked').length;
    const mapCount = Object.keys(this._wtrMapSelected).length;
    const totalCount = tableCount + mapCount;
    const btn = document.getElementById('wtrImportSelectedBtn');
    if (btn) {
      btn.innerHTML = `<i class="mdi mdi-import"></i> Import Selected${totalCount > 0 ? ' (' + totalCount + ')' : ''}`;
    }
  },

  /**
   * Import WTR sites selected from the map
   */
  wtrImportMapSelected() {
    const selected = Object.values(this._wtrMapSelected);
    if (selected.length === 0) {
      Utils.toast('No sites selected on the map.', 'warning');
      return;
    }

    const repeaters = [];
    selected.forEach(group => {
      (group.channels || []).forEach(ch => {
        const name = ch.licencee_company && ch.licencee_company !== '-' ? ch.licencee_company : group.licence_number;
        const em = ch.emission;
        const isDigital = em && em.isDigital;
        repeaters.push({
          callsign: Utils.abbreviateName(name, CONFIG.LIMITS.CHANNEL_NAME_LEN),
          type: isDigital ? 'DV' : '',
          txFreq: ch.tx_frequency ? ch.tx_frequency / 1000000 : 0,
          rxFreq: ch.rx_frequency ? ch.rx_frequency / 1000000 : (ch.tx_frequency ? ch.tx_frequency / 1000000 : 0),
          frequency: ch.tx_frequency ? ch.tx_frequency / 1000000 : 0,
          colorCode: isDigital ? 1 : null,
          ctcss: 0,
          latitude: ch.latitude,
          longitude: ch.longitude,
          locator: null
        });
      });
    });

    if (repeaters.length === 0) {
      Utils.toast('Selected sites have no channels to import.', 'warning');
      return;
    }

    const hasDMR = repeaters.some(r => r.type === 'DV');
    this.showRepeaterImportOptions(repeaters, hasDMR);
  },

  /**
   * Show a WTR record on the map - switches to map view, centers on location, and opens popup
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} licenceNumber - Licence number to highlight
   */
  wtrShowOnMap(lat, lon, licenceNumber) {
    // Switch to map view
    document.getElementById('wtrTableView').style.display = 'none';
    document.getElementById('wtrMapContainer').style.display = '';
    document.getElementById('wtrViewMap').style.background = 'var(--primary-color,#667eea)';
    document.getElementById('wtrViewMap').style.color = '#fff';
    document.getElementById('wtrViewMap').className = 'btn btn-sm';
    document.getElementById('wtrViewTable').className = 'btn btn-sm btn-secondary';
    document.getElementById('wtrViewTable').style.background = '';
    document.getElementById('wtrViewTable').style.color = '';

    this.initWTRMap();
    if (this._wtrMap) {
      setTimeout(() => this._wtrMap.invalidateSize(), 100);
    }

    // Set pending popup so it persists through any map reloads from moveend
    this._wtrPendingPopup = licenceNumber;

    // Center map and zoom in — moveend will trigger updateWTRMap which opens the pending popup
    this._wtrMap.setView([lat, lon], 14);
  },

  /**
   * Autocomplete for name search
   */
  async _wtrDoAutocomplete(q) {
    const container = document.getElementById('wtrNameAutocomplete');
    if (!container) return;
    const all = this._wtrAllRecords || [];
    if (all.length === 0) {
      container.style.display = 'none';
      return;
    }
    const query = q.toLowerCase();
    const seen = new Set();
    const matches = [];
    for (const r of all) {
      const name = (r.licencee_company && r.licencee_company !== '-')
        ? r.licencee_company
        : (r.licencee_surname || '');
      if (!name || seen.has(name)) continue;
      if (name.toLowerCase().includes(query)) {
        seen.add(name);
        matches.push(name);
        if (matches.length >= 10) break;
      }
    }
    if (matches.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.innerHTML = matches.map(name =>
      `<div class="wtr-ac-item" data-name="${Utils.escapeHtml(name)}">
        <span>${Utils.escapeHtml(name)}</span>
      </div>`
    ).join('');
    container.querySelectorAll('.wtr-ac-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('wtrNameSearch').value = item.dataset.name;
        container.style.display = 'none';
        UI.wtrSearch();
      });
    });
    container.style.display = 'block';
  },

  /**
   * Import WTR licence data from a local CSV or JSON file.
   * Accepts an array of records (JSON) or a CSV with a header row.
   */
  async importWTRFile(file) {
    if (!file) return;
    Utils.toast('Reading WTR file...', 'info');
    try {
      const text = await file.text();
      const trimmed = text.trim();
      let records = [];
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        records = Array.isArray(parsed) ? parsed : (parsed.results || parsed.records || []);
      } else {
        records = this._parseWTRCSV(text);
      }

      records = records.map(r => this._normaliseWTRRecord(r)).filter(Boolean);
      if (records.length === 0) {
        Utils.toast('No WTR records found in that file', 'error');
        return;
      }

      this._wtrAllRecords = records;
      this._wtrSearchResults = records;
      this._wtrPage = 0;
      this._populateWTRProductTypes(records);
      this.wtrRenderTable();
      Utils.toast(`Loaded ${records.length.toLocaleString()} WTR records`, 'success');
    } catch (error) {
      Utils.toast('Load failed: ' + error.message, 'error');
    }
  },

  _parseWTRCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = this._parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this._parseCSVLine(lines[i]);
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      rows.push(obj);
    }
    return rows;
  },

  _normaliseWTRRecord(r) {
    if (!r || typeof r !== 'object') return null;
    // Normalise keys once (handles the Ofcom CSV headers such as
    // "Frequency (Hz)" and "Latitude(Deg)")
    const norm = {};
    Object.keys(r).forEach(k => {
      norm[k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = r[k];
    });
    const pick = (...keys) => {
      for (const k of keys) {
        if (norm[k] != null && norm[k] !== '') return norm[k];
      }
      return '';
    };
    const frequency = parseFloat(pick('frequency_hz', 'frequency', 'freq', 'tx_frequency', 'tx_freq'));
    const lat = parseFloat(pick('latitude_deg', 'latitude', 'lat'));
    const lon = parseFloat(pick('longitude_deg', 'longitude', 'lon', 'lng', 'long'));
    return {
      licence_number: pick('licence_number', 'licence_no', 'licence', 'license_number'),
      frequency: isNaN(frequency) ? 0 : frequency,
      station_type: pick('station_type', 'type'),
      product_description: pick('product_description', 'product'),
      antenna_erp: pick('antenna_erp', 'erp'),
      antenna_type: pick('antenna_type'),
      emission_code: pick('emission_code', 'emission'),
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lon) ? null : lon,
      ngr: pick('ngr', 'national_grid_reference'),
      licencee_company: pick('licencee_company', 'licensee', 'licencee', 'company'),
      licencee_surname: pick('licencee_surname', 'surname'),
      status: pick('status')
    };
  },

  /**
   * Reset all WTR filters to defaults
   */
  wtrResetFilters() {
    const fields = ['wtrNameSearch', 'wtrLicenceSearch', 'wtrLocationSearch', 'wtrGeneralSearch'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const productType = document.getElementById('wtrProductType');
    if (productType) productType.selectedIndex = 0;
    const bandFilter = document.getElementById('wtrBandFilter');
    if (bandFilter) bandFilter.value = 'vhf-uhf';
    const modeFilter = document.getElementById('wtrModeFilter');
    if (modeFilter) modeFilter.value = '';
    const radiusEl = document.getElementById('wtrLocationRadius');
    if (radiusEl) radiusEl.value = '10';
    const freqMin = document.getElementById('wtrFreqMin');
    const freqMax = document.getElementById('wtrFreqMax');
    if (freqMin) freqMin.value = '';
    if (freqMax) freqMax.value = '';
    const customGroup = document.getElementById('wtrCustomFreqGroup');
    if (customGroup) customGroup.style.display = 'none';
    this._wtrPage = 0;
    this._wtrSearchResults = [];
    this._wtrSortColumn = null;
    this._wtrSortDirection = 'asc';
    this.wtrRenderTable();
  },

  /**
   * Execute WTR search based on filters
   */
  async wtrSearch(keepPage = false) {
    const empty = document.getElementById('wtrEmpty');
    const table = document.getElementById('wtrTable');
    const all = this._wtrAllRecords || [];

    if (all.length === 0) {
      if (empty) {
        empty.innerHTML = '<i class="mdi mdi-certificate-outline"></i><p>No WTR data loaded. Use <strong>Load from File</strong> to import an Ofcom wtr.csv export.</p>';
        empty.style.display = '';
      }
      if (table) table.style.display = 'none';
      return;
    }

    const nameQ = (document.getElementById('wtrNameSearch')?.value || '').trim().toLowerCase();
    const productType = document.getElementById('wtrProductType')?.value || '';
    const bandFilter = document.getElementById('wtrBandFilter')?.value;
    const modeFilter = document.getElementById('wtrModeFilter')?.value || '';
    const licenceQ = (document.getElementById('wtrLicenceSearch')?.value || '').trim().toLowerCase();
    const generalQ = (document.getElementById('wtrGeneralSearch')?.value || '').trim().toLowerCase();
    const locationQ = (document.getElementById('wtrLocationSearch')?.value || '').trim();
    const radiusKm = parseFloat(document.getElementById('wtrLocationRadius')?.value) || 10;

    this._wtrSearchLocation = locationQ ? this._wtrParseLocation(locationQ) : null;

    if (!keepPage) {
      this._wtrPage = 0;
      if (this._wtrSearchLocation) {
        this._wtrSortColumn = 'distance';
        this._wtrSortDirection = 'asc';
      } else {
        this._wtrSortColumn = null;
        this._wtrSortDirection = 'asc';
      }
    }

    // Determine frequency range from band filter
    let freqMin, freqMax;
    if (bandFilter === 'vhf-uhf') { freqMin = 140000000; freqMax = 490000000; }
    else if (bandFilter === 'vhf') { freqMin = 140000000; freqMax = 190000000; }
    else if (bandFilter === 'uhf') { freqMin = 420000000; freqMax = 490000000; }
    else if (bandFilter === 'hf') { freqMin = 1000000; freqMax = 30000000; }
    else if (bandFilter === 'shf') { freqMin = 1000000000; freqMax = 10000000000; }
    else if (bandFilter === 'custom') {
      const minMHz = parseFloat(document.getElementById('wtrFreqMin')?.value);
      const maxMHz = parseFloat(document.getElementById('wtrFreqMax')?.value);
      if (!isNaN(minMHz)) freqMin = minMHz * 1000000;
      if (!isNaN(maxMHz)) freqMax = maxMHz * 1000000;
    }

    if (empty) empty.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i><p>Filtering WTR records...</p>';
    if (empty) empty.style.display = '';
    if (table) table.style.display = 'none';

    let results = all;

    if (licenceQ) {
      results = results.filter(r => (r.licence_number || '').toLowerCase().includes(licenceQ));
    }
    if (nameQ) {
      results = results.filter(r =>
        (r.licencee_company || '').toLowerCase().includes(nameQ) ||
        (r.licencee_surname || '').toLowerCase().includes(nameQ) ||
        (r.licencee_first_name || '').toLowerCase().includes(nameQ)
      );
    }
    if (generalQ) {
      results = results.filter(r => {
        const hay = [r.licence_number, r.licencee_company, r.licencee_surname, r.licencee_first_name, r.product_description, r.ngr, r.emission_code]
          .join(' ').toLowerCase();
        return hay.includes(generalQ);
      });
    }
    if (productType) {
      results = results.filter(r => r.product_description === productType);
    }
    if (freqMin || freqMax) {
      results = results.filter(r => {
        const f = r.frequency || 0;
        if (freqMin && f < freqMin) return false;
        if (freqMax && f > freqMax) return false;
        return true;
      });
    }
    if (modeFilter) {
      results = results.filter(r => {
        const code = (r.emission_code || '').toUpperCase();
        const isDigital = /D/.test(code) && !/F3/.test(code);
        const isFm = code.includes('F3');
        if (modeFilter === 'FM') return isFm;
        if (modeFilter === 'Digital') return isDigital;
        if (modeFilter === 'Analog') return isFm || (!isDigital && code.length > 0);
        if (modeFilter === 'Other') return !isFm && !isDigital;
        return true;
      });
    }
    if (this._wtrSearchLocation) {
      const loc = this._wtrSearchLocation;
      results = results
        .filter(r => r.latitude != null && r.longitude != null)
        .map(r => {
          const d = Utils.haversineDistance(loc.lat, loc.lon, r.latitude, r.longitude);
          return { ...r, _distance: d };
        })
        .filter(r => r._distance <= radiusKm);
    }

    if (results.length > this._wtrMaxResults) results = results.slice(0, this._wtrMaxResults);

    this._wtrSearchResults = results;
    this.wtrRenderTable();
  },

  /**
   * Populate the WTR product type filter from loaded records
   */
  _populateWTRProductTypes(records) {
    const select = document.getElementById('wtrProductType');
    if (!select) return;
    const types = new Map();
    records.forEach(r => {
      const pd = r.product_description;
      if (pd) types.set(pd, (types.get(pd) || 0) + 1);
    });
    select.innerHTML = '<option value="">All product types</option>';
    Array.from(types.keys()).sort().forEach(pd => {
      const opt = document.createElement('option');
      opt.value = pd;
      opt.textContent = `${pd} (${types.get(pd)})`;
      select.appendChild(opt);
    });
  },

  /**
   * Filter results by frequency range (client-side for merged results)
   */
  _wtrFilterByFreq(results, freqMin, freqMax, merged) {
    if (merged) {
      return results.filter(group => {
        if (!group.channels) return false;
        return group.channels.some(ch => {
          const txf = ch.tx_frequency || 0;
          const rxf = ch.rx_frequency || 0;
          return ((!freqMin || txf >= freqMin) && (!freqMax || txf <= freqMax)) ||
                 ((!freqMin || rxf >= freqMin) && (!freqMax || rxf <= freqMax));
        });
      });
    }
    return results.filter(r => {
      const f = r.frequency || 0;
      return (!freqMin || f >= freqMin) && (!freqMax || f <= freqMax);
    });
  },

  /**
   * Filter results by emission mode category (client-side)
   * @param {Array} results - Search results
   * @param {string} mode - Mode category to filter by (FM, Digital, Analog, Other)
   * @param {boolean} merged - Whether results are merged groups
   * @returns {Array} Filtered results
   */
  _wtrFilterByMode(results, mode, merged) {
    if (!mode) return results;
    if (merged) {
      return results.filter(group => {
        if (!group.channels) return false;
        return group.channels.some(ch => this._wtrModeCategory(ch) === mode);
      });
    }
    return results.filter(r => this._wtrModeCategory(r) === mode);
  },

  /**
   * Derive a mode category (FM, Digital, Analog, Other) from a WTR record.
   * Uses the API-provided emission category when present, otherwise infers it
   * from the emission code (e.g. 7M00D7W = Digital, 16K0F3E = FM).
   */
  _wtrModeCategory(rec) {
    if (rec.emission && rec.emission.category) return rec.emission.category;
    const code = (rec.emission_code || '').toUpperCase();
    if (!code) return 'Other';
    const isFm = code.includes('F3') || code.includes('F2');
    const isDigital = code.includes('D');
    if (isDigital && !isFm) return 'Digital';
    if (isFm) return 'FM';
    if (code.includes('A3') || code.includes('A2')) return 'Analog';
    return 'Other';
  },

  /**
   * Client-side text filter for combined location + name/general search
   * @param {Array} results - Search results
   * @param {string} text - Text to filter by
   * @param {boolean} merged - Whether results are merged groups
   * @returns {Array} Filtered results
   */
  _wtrFilterByText(results, text, merged) {
    if (!text) return results;
    const q = text.toLowerCase();
    const matchesText = (ch) => {
      return (ch.licencee_company || '').toLowerCase().includes(q) ||
        (ch.licencee_surname || '').toLowerCase().includes(q) ||
        (ch.licencee_first_name || '').toLowerCase().includes(q) ||
        (ch.licence_number || '').toLowerCase().includes(q) ||
        (ch.product_description || '').toLowerCase().includes(q) ||
        (ch.ngr || '').toLowerCase().includes(q);
    };
    if (merged) {
      return results.filter(group => {
        if (group.licence_number && group.licence_number.toLowerCase().includes(q)) return true;
        return (group.channels || []).some(matchesText);
      });
    }
    return results.filter(matchesText);
  },

  /**
   * Parse location string - supports "lat,lon" or Maidenhead grid locator
   */
  _wtrParseLocation(str) {
    if (!str) return null;
    str = str.trim();
    const parts = str.split(/[,\s]+/);
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }
    return Utils.maidenheadToLatLon(str);
  },

  /**
   * Get sortable value from a WTR result for a given column key
   */
  _wtrGetSortValue(item, key, isMerged) {
    if (isMerged) {
      const ch = (item.channels && item.channels[0]) || {};
      switch (key) {
        case 'licence': return item.licence_number || '';
        case 'tx_freq': return ch.tx_frequency || 0;
        case 'rx_freq': return ch.rx_frequency || 0;
        case 'mode': return ch.emission ? ch.emission.category || '' : '';
        case 'product': return ch.product_description || '';
        case 'erp': return parseFloat(ch.antenna_erp) || 0;
        case 'antenna': return ch.antenna_type || '';
        case 'emission': return ch.emission_code || '';
        case 'lat': return ch.latitude || 0;
        case 'lon': return ch.longitude || 0;
        case 'ngr': return ch.ngr || '';
        case 'licencee': return ch.licencee_company && ch.licencee_company !== '-' ? ch.licencee_company : (ch.licencee_surname || '');
        case 'status': return ch.status || '';
        case 'distance': return item._distance != null ? item._distance : Infinity;
        default: return '';
      }
    } else {
      switch (key) {
        case 'licence': return item.licence_number || '';
        case 'tx_freq': return item.frequency || 0;
        case 'rx_freq': return 0;
        case 'mode': return item.station_type || '';
        case 'product': return item.product_description || '';
        case 'erp': return parseFloat(item.antenna_erp) || 0;
        case 'antenna': return item.antenna_type || '';
        case 'emission': return item.emission_code || '';
        case 'lat': return item.latitude || 0;
        case 'lon': return item.longitude || 0;
        case 'ngr': return item.ngr || '';
        case 'licencee': return item.licencee_company && item.licencee_company !== '-' ? item.licencee_company : (item.licencee_surname || '');
        case 'status': return item.status || '';
        case 'distance': return item._distance != null ? item._distance : Infinity;
        default: return '';
      }
    }
  },

  /**
   * Handle column sort click in WTR table
   */
  wtrHandleSort(key) {
    if (this._wtrSortColumn === key) {
      this._wtrSortDirection = this._wtrSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this._wtrSortColumn = key;
      this._wtrSortDirection = 'asc';
    }
    this.wtrRenderTable();
  },

  /**
   * Render WTR results table with sorting, distance, and licence group highlighting
   */
  wtrRenderTable() {
    const tbody = document.getElementById('wtrTableBody');
    const empty = document.getElementById('wtrEmpty');
    const table = document.getElementById('wtrTable');
    let allResults = this._wtrSearchResults;

    if (!allResults || allResults.length === 0) {
      empty.innerHTML = '<i class="mdi mdi-certificate-outline"></i><p>No records found. Try adjusting your search criteria.</p>';
      empty.style.display = '';
      table.style.display = 'none';
      const pag = document.getElementById('wtrPagination');
      if (pag) pag.style.display = 'none';
      this._wtrUpdateImportButton();
      return;
    }

    // Column visibility
    const showFreq = document.getElementById('wtrColFreq')?.checked !== false;
    const showType = document.getElementById('wtrColType')?.checked !== false;
    const showAntenna = document.getElementById('wtrColAntenna')?.checked !== false;
    const showLocation = document.getElementById('wtrColLocation')?.checked;
    const showEmission = document.getElementById('wtrColEmission')?.checked;
    const showLicencee = document.getElementById('wtrColLicencee')?.checked !== false;
    const colDistanceChecked = document.getElementById('wtrColDistance')?.checked !== false;
    const showDistance = !!this._wtrSearchLocation && colDistanceChecked;
    const isMerged = allResults[0] && allResults[0].channels;

    // Calculate distances if location search is active
    if (this._wtrSearchLocation) {
      const loc = this._wtrSearchLocation;
      allResults.forEach(item => {
        if (isMerged) {
          const ch = (item.channels || []).find(c => c.latitude && c.longitude);
          item._distance = ch ? Utils.haversineDistance(loc.lat, loc.lon, ch.latitude, ch.longitude) : null;
        } else {
          item._distance = (item.latitude && item.longitude) ? Utils.haversineDistance(loc.lat, loc.lon, item.latitude, item.longitude) : null;
        }
      });
    }

    // Apply sorting
    if (this._wtrSortColumn) {
      const col = this._wtrSortColumn;
      const dir = this._wtrSortDirection;
      allResults = [...allResults].sort((a, b) => {
        let va = this._wtrGetSortValue(a, col, isMerged);
        let vb = this._wtrGetSortValue(b, col, isMerged);
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Client-side pagination
    const totalResults = allResults.length;
    const totalPages = Math.ceil(totalResults / this._wtrPageSize);
    if (this._wtrPage >= totalPages) this._wtrPage = Math.max(0, totalPages - 1);
    const startIdx = this._wtrPage * this._wtrPageSize;
    const endIdx = Math.min(startIdx + this._wtrPageSize, totalResults);
    const results = allResults.slice(startIdx, endIdx);

    // Build sortable header helper
    const sortTh = (label, key) => {
      const cls = this._wtrSortColumn === key ? `wtr-sortable wtr-sort-${this._wtrSortDirection}` : 'wtr-sortable';
      const icon = this._wtrSortColumn === key ? (this._wtrSortDirection === 'asc' ? '▲' : '▼') : '⇅';
      return `<th class="${cls}" onclick="UI.wtrHandleSort('${key}')">${label} <span class="wtr-sort-icon">${icon}</span></th>`;
    };

    // Status badge helper
    const statusBadge = (status) => {
      if (!status) return '';
      const isActive = status.toLowerCase() === 'active' || status.toLowerCase() === 'current';
      return `<span class="wtr-status-badge ${isActive ? 'wtr-status-active' : 'wtr-status-other'}">${Utils.escapeHtml(status)}</span>`;
    };

    // Mode badge helper
    const modeBadge = (cat) => {
      if (!cat) return '';
      const cls = cat === 'FM' ? 'wtr-mode-fm' : cat === 'Digital' ? 'wtr-mode-digital' : cat === 'Analog' ? 'wtr-mode-analog' : 'wtr-mode-other';
      return `<span class="wtr-mode-badge ${cls}">${Utils.escapeHtml(cat)}</span>`;
    };

    // Build header
    const header = document.getElementById('wtrTableHeader');
    let headerHtml = '<th><input type="checkbox" id="wtrSelectAll"></th><th></th>' + sortTh('Licence #', 'licence');
    if (showDistance) headerHtml += sortTh('Distance', 'distance');
    if (showFreq) headerHtml += sortTh('TX Freq (MHz)', 'tx_freq') + sortTh('RX Freq (MHz)', 'rx_freq');
    if (showType) headerHtml += sortTh('Product', 'product');
    headerHtml += sortTh('Mode', 'mode');
    if (showAntenna) headerHtml += sortTh('ERP', 'erp') + sortTh('Antenna', 'antenna');
    if (showEmission) headerHtml += sortTh('Emission', 'emission');
    if (showLocation) headerHtml += sortTh('Lat', 'lat') + sortTh('Lon', 'lon') + sortTh('NGR', 'ngr');
    if (showLicencee) headerHtml += sortTh('Licencee', 'licencee');
    headerHtml += sortTh('Status', 'status');
    header.innerHTML = headerHtml;

    // Rebind select-all
    document.getElementById('wtrSelectAll')?.addEventListener('change', (e) => {
      document.querySelectorAll('#wtrTableBody input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
      this._wtrUpdateImportButton();
    });

    let html = '';
    if (isMerged) {
      results.forEach((group, localIdx) => {
        const gi = startIdx + localIdx;
        const channels = group.channels || [];
        const groupId = `wg${gi}`;
        channels.forEach((ch, ci) => {
          const firstClass = ci === 0 ? 'wtr-group-first' : '';
          html += `<tr data-wtr-group="${groupId}" class="${firstClass}">`;
          if (ci === 0) html += `<td rowspan="${channels.length}"><input type="checkbox" data-group="${gi}"></td>`;
          if (ci === 0) {
            const hasLoc = ch.latitude && ch.longitude;
            const mapBtn = hasLoc
              ? `<button class="btn-map-icon" title="Show on map" onclick="UI.wtrShowOnMap(${ch.latitude},${ch.longitude},'${Utils.escapeHtml(group.licence_number)}')"><i class="mdi mdi-map-marker"></i></button>`
              : '';
            html += `<td rowspan="${channels.length}">${mapBtn}</td>`;
          }
          if (ci === 0) html += `<td rowspan="${channels.length}" style="font-weight:600;">${Utils.escapeHtml(group.licence_number)}</td>`;
          if (showDistance && ci === 0) {
            const dist = group._distance;
            html += `<td rowspan="${channels.length}">${dist != null ? `<span class="wtr-distance-badge"><i class="mdi mdi-map-marker-distance"></i>${dist.toFixed(1)} km</span>` : ''}</td>`;
          }
          if (showFreq) {
            html += `<td style="font-family:var(--font-mono);"><span style="color:var(--success);">${ch.tx_frequency ? (ch.tx_frequency / 1000000).toFixed(4) : '-'}</span></td>`;
            html += `<td style="font-family:var(--font-mono);"><span style="color:var(--primary-light);">${ch.rx_frequency ? (ch.rx_frequency / 1000000).toFixed(4) : '-'}</span></td>`;
          }
          if (showType) html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(ch.product_description || '')}</td>`;
          const em = ch.emission;
          const cat = em ? em.category || '' : '';
          html += `<td>${modeBadge(cat)}</td>`;
          if (showAntenna) {
            html += `<td>${ch.antenna_erp || ''}${ch.antenna_erp_unit ? ' ' + ch.antenna_erp_unit : ''}</td>`;
            html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(ch.antenna_type || '')}${ch.antenna_height ? ' ' + ch.antenna_height + 'm' : ''}</td>`;
          }
          if (showEmission) html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(ch.emission_code || '')}</td>`;
          if (showLocation) {
            html += `<td>${ch.latitude ? ch.latitude.toFixed(4) : ''}</td>`;
            html += `<td>${ch.longitude ? ch.longitude.toFixed(4) : ''}</td>`;
            html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(ch.ngr || '')}</td>`;
          }
          if (showLicencee) {
            const name = ch.licencee_company && ch.licencee_company !== '-' ? ch.licencee_company :
              [ch.licencee_first_name, ch.licencee_surname].filter(x => x && x !== '-').join(' ');
            if (ci === 0) html += `<td rowspan="${channels.length}" style="font-size:0.8rem;">${Utils.escapeHtml(name)}</td>`;
          }
          if (ci === 0) html += `<td rowspan="${channels.length}">${statusBadge(ch.status)}</td>`;
          html += `</tr>`;
        });
      });
    } else {
      results.forEach((r, localIdx) => {
        const i = startIdx + localIdx;
        html += `<tr>`;
        html += `<td><input type="checkbox" data-idx="${i}"></td>`;
        const hasLoc = r.latitude && r.longitude;
        const mapBtn = hasLoc
          ? `<button class="btn-map-icon" title="Show on map" onclick="UI.wtrShowOnMap(${r.latitude},${r.longitude},'${Utils.escapeHtml(r.licence_number || '')}')"><i class="mdi mdi-map-marker"></i></button>`
          : '';
        html += `<td>${mapBtn}</td>`;
        html += `<td style="font-weight:600;">${Utils.escapeHtml(r.licence_number || '')}</td>`;
        if (showDistance) {
          const dist = r._distance;
          html += `<td>${dist != null ? `<span class="wtr-distance-badge"><i class="mdi mdi-map-marker-distance"></i>${dist.toFixed(1)} km</span>` : ''}</td>`;
        }
        if (showFreq) {
          html += `<td style="font-family:var(--font-mono);">${r.frequency ? (r.frequency / 1000000).toFixed(4) : ''}</td>`;
          html += `<td></td>`;
        }
        if (showType) html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(r.product_description || '')}</td>`;
        html += `<td><span style="color:${r.station_type === 'T' ? 'var(--success)' : 'var(--primary-light)'};">${r.station_type || ''}</span></td>`;
        if (showAntenna) {
          html += `<td>${r.antenna_erp || ''}${r.antenna_erp_unit ? ' ' + r.antenna_erp_unit : ''}</td>`;
          html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(r.antenna_type || '')}${r.antenna_height ? ' ' + r.antenna_height + 'm' : ''}</td>`;
        }
        if (showEmission) html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(r.emission_code || '')}</td>`;
        if (showLocation) {
          html += `<td>${r.latitude ? r.latitude.toFixed(4) : ''}</td>`;
          html += `<td>${r.longitude ? r.longitude.toFixed(4) : ''}</td>`;
          html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(r.ngr || '')}</td>`;
        }
        if (showLicencee) {
          const name = r.licencee_company && r.licencee_company !== '-' ? r.licencee_company :
            [r.licencee_first_name, r.licencee_surname].filter(x => x && x !== '-').join(' ');
          html += `<td style="font-size:0.8rem;">${Utils.escapeHtml(name)}</td>`;
        }
        html += `<td>${statusBadge(r.status)}</td>`;
        html += `</tr>`;
      });
    }

    tbody.innerHTML = html;
    empty.style.display = 'none';
    table.style.display = '';

    // Licence group highlighting — highlight all rows in a group on hover
    tbody.querySelectorAll('tr[data-wtr-group]').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const gid = row.getAttribute('data-wtr-group');
        tbody.querySelectorAll(`tr[data-wtr-group="${gid}"]`).forEach(r => r.classList.add('wtr-group-hover'));
      });
      row.addEventListener('mouseleave', () => {
        const gid = row.getAttribute('data-wtr-group');
        tbody.querySelectorAll(`tr[data-wtr-group="${gid}"]`).forEach(r => r.classList.remove('wtr-group-hover'));
      });
    });

    // Update pagination controls
    const pag = document.getElementById('wtrPagination');
    const countEl = document.getElementById('wtrResultCount');
    if (pag) pag.style.display = totalResults > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${totalResults} result${totalResults !== 1 ? 's' : ''} — Showing ${startIdx + 1}-${endIdx} — Page ${this._wtrPage + 1} of ${totalPages}`;
    const prevBtn = document.getElementById('wtrPrevPage');
    const nextBtn = document.getElementById('wtrNextPage');
    if (prevBtn) prevBtn.disabled = this._wtrPage === 0;
    if (nextBtn) nextBtn.disabled = this._wtrPage >= totalPages - 1;

    // Listen for checkbox changes to update import button
    tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => this._wtrUpdateImportButton());
    });
    this._wtrUpdateImportButton();
  },

  /**
   * Import selected WTR records as channels
   */
  wtrImportSelected() {
    const results = this._wtrSearchResults;
    const isMerged = results && results.length > 0 && results[0] && results[0].channels;
    const checked = [];

    // Collect table checkbox selections
    if (results && results.length > 0) {
      if (isMerged) {
        document.querySelectorAll('#wtrTableBody input[type="checkbox"]:checked').forEach(cb => {
          const gi = parseInt(cb.dataset.group);
          if (!isNaN(gi) && results[gi]) checked.push(results[gi]);
        });
      } else {
        document.querySelectorAll('#wtrTableBody input[type="checkbox"]:checked').forEach(cb => {
          const idx = parseInt(cb.dataset.idx);
          if (!isNaN(idx) && results[idx]) checked.push(results[idx]);
        });
      }
    }

    // Also include map selections (avoid duplicates by licence number)
    const checkedLicences = new Set(checked.map(c => c.licence_number));
    Object.values(this._wtrMapSelected).forEach(group => {
      if (!checkedLicences.has(group.licence_number)) {
        checked.push(group);
      }
    });

    if (checked.length === 0) {
      Utils.toast('No records selected. Use the checkboxes or map markers to select records to import.', 'warning');
      return;
    }

    // Convert WTR records to repeater format for import
    const repeaters = [];
    checked.forEach(item => {
      if (item.channels) {
        // Merged group - create one channel entry per paired channel
        item.channels.forEach(ch => {
          const name = ch.licencee_company && ch.licencee_company !== '-' ? ch.licencee_company : item.licence_number;
          const em = ch.emission;
          const isDigital = em && em.isDigital;
          repeaters.push({
            callsign: Utils.abbreviateName(name, CONFIG.LIMITS.CHANNEL_NAME_LEN),
            type: isDigital ? 'DV' : '',
            txFreq: ch.tx_frequency ? ch.tx_frequency / 1000000 : 0,
            rxFreq: ch.rx_frequency ? ch.rx_frequency / 1000000 : (ch.tx_frequency ? ch.tx_frequency / 1000000 : 0),
            frequency: ch.tx_frequency ? ch.tx_frequency / 1000000 : 0,
            colorCode: isDigital ? 1 : null,
            ctcss: 0,
            latitude: ch.latitude,
            longitude: ch.longitude,
            locator: null
          });
        });
      } else {
        // Single record
        const name = item.licencee_company && item.licencee_company !== '-' ? item.licencee_company : item.licence_number;
        const em = item.emission || Utils.decodeEmission(item.emission_code);
        const isDigital = em && em.isDigital;
        repeaters.push({
          callsign: Utils.abbreviateName(name, CONFIG.LIMITS.CHANNEL_NAME_LEN),
          type: isDigital ? 'DV' : '',
          txFreq: item.station_type === 'T' && item.frequency ? item.frequency / 1000000 : 0,
          rxFreq: item.station_type === 'R' && item.frequency ? item.frequency / 1000000 : (item.frequency ? item.frequency / 1000000 : 0),
          frequency: item.frequency ? item.frequency / 1000000 : 0,
          colorCode: isDigital ? 1 : null,
          ctcss: 0,
          latitude: item.latitude,
          longitude: item.longitude,
          locator: null
        });
      }
    });

    const hasDMR = repeaters.some(r => r.type === 'DV');
    this.showRepeaterImportOptions(repeaters, hasDMR);
  },

  /**
   * Load DMR database from local storage (IndexedDB)
   */
  async loadDMRDatabase() {
    const countEl = document.getElementById('dmrDbCount');
    const dateEl = document.getElementById('dmrDbDate');

    // If a radio is connected, re-run detection so the capacity shown reflects
    // it (a silent reconnect can otherwise leave the selector on a stale
    // default and make the radio look like it holds very few DMR IDs).
    if (window.radioUSB?.connected && typeof UI !== 'undefined' && UI.autoDetectDMRRadioType) {
      UI.autoDetectDMRRadioType();
    }

    try {
      const all = await Utils.db.getAll('dmrDatabase');
      const meta = all.find(e => e.id === 'metadata');
      const entries = all.filter(e => e.id !== 'metadata');

      if (entries.length > 0) {
        countEl.textContent = entries.length.toLocaleString();
        dateEl.textContent = meta && meta.timestamp ? Utils.formatDate(meta.timestamp) : 'Loaded';
        this._dmrAllEntries = entries;
        UI.applyDMRRegionFilter();
      } else {
        countEl.textContent = '0';
        dateEl.textContent = 'Load from CSV';
        this.renderDMRTable([], 0);
      }
    } catch (error) {
      countEl.textContent = '0';
      dateEl.textContent = 'Load from CSV';
      this.renderDMRTable([], 0);
      console.warn('DMR DB load from local storage failed:', error.message);
    }
  },

  /**
   * DMR ID pagination state
   */
  _dmrCurrentPage: 1,
  _dmrPageSize: 100,
  
  /**
   * Load persisted DMR ID page-size preference (once).
   */
  _ensureDMRPagePrefs() {
    if (this._dmrPrefsReady) return;
    this._dmrPrefsReady = true;
    const size = Utils.storage.get(CONFIG.STORAGE.DMR_PAGE_SIZE, 100);
    this._dmrPageSize = size === 'all' ? Infinity : (parseInt(size, 10) || 100);
  },

  /**
   * Change the DMR ID page size and persist it.
   */
  setDMRPageSize(value) {
    this._ensureDMRPagePrefs();
    this._dmrPageSize = value === 'all' ? Infinity : (parseInt(value, 10) || 100);
    Utils.storage.set(CONFIG.STORAGE.DMR_PAGE_SIZE, value === 'all' ? 'all' : this._dmrPageSize);
    const data = this._dmrDatabase || [];
    this.renderDMRTable(data, data.length, 1);
  },

  /**
   * Render DMR ID table with pagination
   */
  renderDMRTable(entries, totalCount, page = 1) {
    const tbody = document.getElementById('dmridTableBody');
    if (!tbody) return;
    this._ensureDMRPagePrefs();

    const total = totalCount != null ? totalCount : (entries ? entries.length : 0);
    const paginationEl = document.getElementById('dmrPagination');

    if (!entries || entries.length === 0 || total === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            <i class="mdi mdi-database-search" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
            No data loaded. Click "Load Database" to load DMR ID database.
          </td>
        </tr>
      `;
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    const perPage = this._dmrPageSize;
    const totalPages = perPage >= total ? 1 : Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    this._dmrCurrentPage = safePage;
    const startIdx = perPage >= total ? 0 : (safePage - 1) * perPage;
    const endIdx = perPage >= total ? total : Math.min(startIdx + perPage, total);
    const pageData = entries.slice(startIdx, endIdx);

    tbody.innerHTML = pageData.map(r => `
      <tr>
        <td>${r.id}</td>
        <td><strong>${Utils.escapeHtml(r.callsign || '')}</strong></td>
        <td>${Utils.escapeHtml(r.name || '')}</td>
        <td>${Utils.escapeHtml(r.city || '')}</td>
        <td>${Utils.escapeHtml(r.country || '')}</td>
        <td>
          <button class="btn btn-sm btn-secondary dmr-add-contact-btn" data-dmr-id="${r.id}" data-callsign="${Utils.escapeHtml(r.callsign || '')}">
            Add Contact
          </button>
        </td>
      </tr>
    `).join('');

    // Bind click events for add contact buttons
    tbody.querySelectorAll('.dmr-add-contact-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dmrId = parseInt(btn.dataset.dmrId, 10);
        const callsign = btn.dataset.callsign;
        UI.addDMRContact(dmrId, callsign);
      });
    });

    // Update pagination controls
    const paginationInfo = document.getElementById('dmrPaginationInfo');
    const pageIndicator = document.getElementById('dmrPageIndicator');
    const prevBtn = document.getElementById('dmrPrevPage');
    const nextBtn = document.getElementById('dmrNextPage');

    if (paginationEl) {
      paginationEl.style.display = 'flex';
      const sizeSel = document.getElementById('dmrPageSize');
      if (sizeSel) sizeSel.value = perPage === Infinity ? 'all' : String(perPage);
      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startIdx + 1}-${endIdx} of ${total.toLocaleString()}`;
      }
      if (pageIndicator) {
        pageIndicator.textContent = `Page ${safePage} of ${totalPages}`;
      }
      if (prevBtn) prevBtn.disabled = safePage <= 1;
      if (nextBtn) nextBtn.disabled = safePage >= totalPages;
    }
  },
  
  /**
   * Navigate to next DMR ID page
   */
  dmrNextPage() {
    if (!this._dmrDatabase || this._dmrDatabase.length === 0) return;
    
    const totalPages = Math.ceil(this._dmrDatabase.length / this._dmrPageSize);
    if (this._dmrCurrentPage < totalPages) {
      this.renderDMRTable(this._dmrDatabase, this._dmrDatabase.length, this._dmrCurrentPage + 1);
    }
  },
  
  /**
   * Navigate to previous DMR ID page
   */
  dmrPrevPage() {
    if (!this._dmrDatabase || this._dmrDatabase.length === 0) return;
    
    if (this._dmrCurrentPage > 1) {
      this.renderDMRTable(this._dmrDatabase, this._dmrDatabase.length, this._dmrCurrentPage - 1);
    }
  },

  /**
   * Import the DMR ID database from a local CSV file.
   * Expects the RadioID format:
   *   RADIO_ID,CALLSIGN,FIRST_NAME,LAST_NAME,CITY,STATE,COUNTRY
   * Streams the file so large regional exports can be handled.
   */
  async importDMRDatabaseCSV(file) {
    if (!file) return;

    const countEl = document.getElementById('dmrDbCount');
    const dateEl = document.getElementById('dmrDbDate');
    Utils.toast('Reading DMR database file...', 'info');

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    const BATCH = 5000;

    let buffer = '';
    let batch = [];
    let total = 0;
    let headerChecked = false;
    let lastUpdate = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      await Utils.db.putMany('dmrDatabase', batch);
      batch = [];
      if (countEl) countEl.textContent = total.toLocaleString();
      // Yield to keep the UI responsive
      await new Promise(r => setTimeout(r, 0));
    };

    const processLine = (line) => {
      if (!line) return;
      if (!headerChecked) {
        headerChecked = true;
        if (/RADIO_ID/i.test(line)) return;
      }
      const cols = this._parseCSVLine(line);
      if (cols.length < 2) return;
      const id = parseInt(cols[0], 10);
      const callsign = (cols[1] || '').trim();
      if (isNaN(id) || !callsign) return;
      const firstName = (cols[2] || '').trim();
      const surname = (cols[3] || '').trim();
      batch.push({
        id,
        callsign,
        firstName,
        surname,
        name: (firstName + ' ' + surname).trim(),
        city: (cols[4] || '').trim(),
        state: (cols[5] || '').trim(),
        country: (cols[6] || '').trim()
      });
      total++;
    };

    try {
      await Utils.db.clear('dmrDatabase');
      await Utils.db.put('dmrDatabase', { id: 'metadata', timestamp: Date.now(), country: 'local' });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          processLine(line);
          if (batch.length >= BATCH) await flush();
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer.replace(/\r$/, ''));
      await flush();

      if (total === 0) {
        Utils.toast('No DMR IDs found in that file', 'error');
        return;
      }

      lastUpdate = Date.now();
      const allEntries = (await Utils.db.getAll('dmrDatabase')).filter(e => e.id !== 'metadata');
      this._dmrAllEntries = allEntries;

      if (dateEl) dateEl.textContent = Utils.formatDate(lastUpdate);
      UI.applyDMRRegionFilter();

      Utils.toast(`Loaded ${total.toLocaleString()} DMR IDs from file`, 'success');
    } catch (error) {
      Utils.toast('Load failed: ' + error.message, 'error');
    }
  },

  /**
   * Minimal CSV line parser (handles quoted fields).
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = false; }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  },

  /**
   * Write DMR ID database to radio
   * Uses 6-bit compression like the original OpenGD77 CPS (DMRIDForm.cs, DMRDataItem.cs)
   * Includes callsign, name, city, and country data in compressed format
   */
  async writeDMRDatabaseToRadio() {
    if (!window.radioUSB.connected) {
      Utils.toast('Connect to radio first', 'warning');
      return;
    }
    
    // Get database from IndexedDB
    const entries = await Utils.db.getAll('dmrDatabase');
    let dmrEntries = entries.filter(e => e.id !== 'metadata');

    // Apply the region filter (OSS imports the full CSV; regions narrow it).
    const regionSet = UI._dmrRegionCountrySet(UI._dmrRegion || '');
    if (regionSet) {
      dmrEntries = dmrEntries.filter(e => regionSet.has(String(e.country || '').trim().toLowerCase()));
    }
    
    if (dmrEntries.length === 0) {
      Utils.toast('No DMR database downloaded. Download first.', 'warning');
      return;
    }
    
    // Show progress
    UI.showRadioToolsProgress(true, 'Preparing DMR database...');
    
    try {
      // Get storage settings from UI (matches CPS DMRIDForm.cs)
      const settings = UI.getDMRStorageSettings();
      const stringLength = settings.stringLength;
      const compressedSize = settings.compressedSize;
      const recordSize = settings.recordSize;
      const useVPMemory = settings.useVPMemory;
      const radioTypeIndex = settings.radioTypeIndex;
      
      // Calculate memory size and max records using CPS formulas. The C7000 /
      // DM-32 (index 6) is bounded by the firmware's address window, not the
      // DMRID_MEMORY_SIZES table.
      const isC7000 = UI.isDM32Radio() || UI.isC7000DMRIndex(radioTypeIndex);
      const memorySize = isC7000 ? 0 : UI.getSelectedRadioMemorySize(radioTypeIndex, useVPMemory);
      const maxRecords = isC7000
        ? UI.getDM32MaxRecords(recordSize, useVPMemory)
        : UI.getMaxRecords(memorySize, recordSize);
      
      const HEADER_SIZE = CONFIG.PROTOCOL.DMRID_HEADER_SIZE;  // 12 bytes
      
      // Sort entries by DMR ID (ascending)
      const sortedEntries = [...dmrEntries].sort((a, b) => parseInt(a.id) - parseInt(b.id));
      
      // Limit to max records
      let entriesToWrite = sortedEntries.slice(0, Math.min(sortedEntries.length, maxRecords));

      // Clamp to the connected radio's real capacity so an oversized database
      // can't overrun the flash (e.g. the DM-32 NAKs sector prepares at
      // DMRID_DM32_REGION_END and the CPS silently fails part-way).
      const connectedMax = UI.getConnectedDMRMaxRecords(recordSize, useVPMemory);
      if (connectedMax !== null && entriesToWrite.length > connectedMax) {
        entriesToWrite = entriesToWrite.slice(0, connectedMax);
        Utils.toast(`Radio holds ${connectedMax.toLocaleString()} IDs at ${recordSize} bytes/record - writing the first ${connectedMax.toLocaleString()}`, 'warning');
      }
      
      // Create buffer for ALL records (CPS GenerateUploadData creates one contiguous buffer)
      const totalDataSize = HEADER_SIZE + recordSize * entriesToWrite.length;
      const buffer = new Uint8Array(totalDataSize);
      
      // Header: "Id-V001\0" (8 bytes) + record count (4 bytes LE)
      // Note: CPS uses SIG_PATTERN_BYTES which includes record length encoding
      // Byte[2] = 'N' (78) for no VP memory, 'n' (110) for VP memory
      // Byte[3] = 74 + recordLength (encodes the record size)
      buffer[0] = 0x49;  // 'I'
      buffer[1] = 0x64;  // 'd'
      buffer[2] = useVPMemory ? 0x6E : 0x4E;  // 'n' or 'N'
      buffer[3] = 74 + recordSize;  // Record length encoding
      buffer[4] = 0x30;  // '0'
      buffer[5] = 0x30;  // '0'
      buffer[6] = 0x31;  // '1'
      buffer[7] = 0x00;  // null terminator
      
      // Record count at offset 8 (4 bytes LE)
      const countView = new DataView(buffer.buffer);
      countView.setUint32(8, entriesToWrite.length, true);
      
      let offset = HEADER_SIZE;
      let recordsWritten = 0;
      
      for (const entry of entriesToWrite) {
        // DMR ID as 3 bytes (little-endian, as per CPS)
        const id = parseInt(entry.id) || 0;
        buffer[offset] = id & 0xFF;
        buffer[offset + 1] = (id >> 8) & 0xFF;
        buffer[offset + 2] = (id >> 16) & 0xFF;
        offset += 3;
        
        // Build details string: "CALLSIGN Name City Country" (like CPS FromURLOrCSV)
        // Truncate each component to fit within stringLength
        const callsign = (entry.callsign || '').toUpperCase().trim();
        const name = (entry.name || '').trim();
        const city = (entry.city || '').trim();
        const country = (entry.country || '').trim();
        
        // Build combined string with space separators (only add separator if we're adding more data)
        let details = callsign;
        
        // Calculate remaining space for name (accounting for separator only if name exists)
        if (name && details.length < stringLength) {
          const remainingForName = stringLength - details.length - 1;  // -1 for space separator
          if (remainingForName > 0) {
            const nameToAdd = name.substring(0, remainingForName);
            details += ' ' + nameToAdd;
          }
        }
        
        // Calculate remaining space for city (accounting for separator only if city exists)
        if (city && details.length < stringLength) {
          const remainingForCity = stringLength - details.length - 1;  // -1 for space separator
          if (remainingForCity > 0) {
            const cityToAdd = city.substring(0, remainingForCity);
            details += ' ' + cityToAdd;
          }
        }
        
        // Calculate remaining space for country (accounting for separator only if country exists)
        if (country && details.length < stringLength) {
          const remainingForCountry = stringLength - details.length - 1;  // -1 for space separator
          if (remainingForCountry > 0) {
            const countryToAdd = country.substring(0, remainingForCountry);
            details += ' ' + countryToAdd;
          }
        }
        
        // Pad to exact length
        details = details.padEnd(stringLength, ' ').substring(0, stringLength);
        
        // Compress using 6-bit encoding (from DMRDataItem.cs)
        const compressedData = this.compress6Bit(details);
        
        // Copy compressed data (should be compressedSize bytes)
        for (let i = 0; i < compressedSize && i < compressedData.length; i++) {
          buffer[offset + i] = compressedData[i];
        }
        offset += compressedSize;
        recordsWritten++;
      }
      
      UI.updateRadioToolsProgress(5, `Writing ${recordsWritten.toLocaleString()} DMR IDs to radio...`);
      
      await window.radioUSB.writeDMRDatabase(buffer.slice(0, offset), { recordSize, useVPMemory }, (progress) => {
        UI.updateRadioToolsProgress(5 + (progress * 0.95), `Writing DMR database: ${Math.round(progress)}%`);
      });
      
      UI.showRadioToolsProgress(false);
      Utils.toast(`DMR database written (${recordsWritten.toLocaleString()} contacts, ${recordSize} bytes/record)`, 'success');
      
    } catch (error) {
      UI.showRadioToolsProgress(false);
      Utils.toast('Failed to write DMR database: ' + error.message, 'error');
    }
  },
  
  /**
   * 6-bit character compression lookup table (from DMRDataItem.cs COMPRESS_LUT)
   * Maps ASCII characters to 6-bit values (0-63)
   */
  _compress6BitLUT: (() => {
    const lut = new Uint8Array(256).fill(63);  // Default to '.' (63)
    lut[32] = 0;   // Space
    // Digits 0-9 -> 1-10
    for (let i = 0; i < 10; i++) lut[48 + i] = i + 1;
    // Uppercase A-Z -> 11-36
    for (let i = 0; i < 26; i++) lut[65 + i] = i + 11;
    // Lowercase a-z -> 37-62
    for (let i = 0; i < 26; i++) lut[97 + i] = i + 37;
    lut[46] = 63;  // Period '.'
    return lut;
  })(),
  
  /**
   * Compress a string using 6-bit encoding (from DMRDataItem.cs compress())
   * 6-bit compression: groups of 4 chars (24 bits) compress to 3 bytes,
   * remainder chars take 1 byte each (e.g., 5 chars -> 4 bytes, 6 chars -> 5 bytes)
   * @param {string} text - Text to compress
   * @returns {Uint8Array} Compressed data
   */
  compress6Bit(text) {
    // Use same formula as UI.compressSize() for consistency
    const compressedLength = UI.compressSize(text.length);
    const result = new Uint8Array(compressedLength);
    const lut = this._compress6BitLUT;
    
    let srcIdx = 0;
    let dstIdx = 0;
    
    // Process in groups of 4 characters, handling remainders
    while (srcIdx < text.length) {
      // First character (always present in this iteration)
      const c0 = lut[text.charCodeAt(srcIdx++) & 0xFF];
      result[dstIdx] = c0 << 2;
      
      if (srcIdx >= text.length) {
        // 1 remaining char: occupies 1 byte (6 bits in high bits)
        break;
      }
      
      // Second character
      const c1 = lut[text.charCodeAt(srcIdx++) & 0xFF];
      result[dstIdx] |= c1 >> 4;
      result[dstIdx + 1] = c1 << 4;
      
      if (srcIdx >= text.length) {
        // 2 remaining chars: occupy 2 bytes
        break;
      }
      
      // Third character
      const c2 = lut[text.charCodeAt(srcIdx++) & 0xFF];
      result[dstIdx + 1] |= c2 >> 2;
      result[dstIdx + 2] = c2 << 6;
      
      if (srcIdx >= text.length) {
        // 3 remaining chars: occupy 3 bytes
        break;
      }
      
      // Fourth character - completes the group of 4 -> 3 bytes
      const c3 = lut[text.charCodeAt(srcIdx++) & 0xFF];
      result[dstIdx + 2] |= c3;
      
      dstIdx += 3;
    }
    
    return result;
  },

  /**
   * Search DMR ID database
   */
  async searchDMRID(query) {
    // If no query or empty, show initial data from cached database
    if (!query || query.length < 2) {
      if (this._dmrDatabase && this._dmrDatabase.length > 0) {
        this.renderDMRTable(this._dmrDatabase, this._dmrDatabase.length);
      } else {
        this.renderDMRTable([], 0);
      }
      return;
    }
    
    const results = await API.searchDMRDatabase(query);
    
    const tbody = document.getElementById('dmridTableBody');
    if (!tbody) return;
    tbody.innerHTML = results.map(r => `
      <tr>
        <td>${Utils.escapeHtml(String(r.id ?? ''))}</td>
        <td><strong>${Utils.escapeHtml(r.callsign || '')}</strong></td>
        <td>${Utils.escapeHtml(r.name || '')}</td>
        <td>${Utils.escapeHtml(r.country || '')}</td>
        <td>
          <button class="btn btn-sm btn-secondary dmr-add-contact-btn" data-dmr-id="${Utils.escapeHtml(String(r.id ?? ''))}" data-callsign="${Utils.escapeHtml(r.callsign || '')}">
            Add Contact
          </button>
        </td>
      </tr>
    `).join('');
    
    // Bind click events for add contact buttons
    tbody.querySelectorAll('.dmr-add-contact-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dmrId = parseInt(btn.dataset.dmrId, 10);
        const callsign = btn.dataset.callsign;
        UI.addDMRContact(dmrId, callsign);
      });
    });
    
    if (results.length === 0) {
      const escapedQuery = Utils.escapeHtml(query);
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-muted);">
            No results found for "${escapedQuery}"
          </td>
        </tr>
      `;
    }
  },

  /**
   * Add DMR ID as contact
   */
  addDMRContact(dmrId, callsign) {
    window.codeplug.addContact({
      name: callsign,
      dmrId: dmrId,
      type: CONFIG.CONTACT_TYPES.PRIVATE,
      tsOverride: 'Disabled'
    });
    
    this.updateOverview();
    Utils.toast(`Added ${callsign} as contact`, 'success');
  }
});

// Add login/auth methods to App
Object.assign(App, {
  // Standalone build: no accounts.
  showLoginModal() {
    Utils.toast('Accounts are not available in the standalone build', 'info');
  },

  showRegistrationModal() {
    Utils.toast('Accounts are not available in the standalone build', 'info');
  },

  async logout() {
    // No accounts in the standalone build
  },

  showEditProfileModal() {
    Utils.toast('Accounts are not available in the standalone build', 'info');
  },

  /**
   * Show the local codeplug library
   */
  async showMyCodeplugs() {
    try {
      const codeplugs = await API.getMyCodeplugs();
      
      const content = codeplugs.length > 0 ? `
        <div class="recent-list">
          ${codeplugs.map(cp => `
            <div class="recent-item" style="cursor:pointer">
              <div onclick="App.loadCodeplug('${cp.id}')" style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0">
                <span class="recent-item-icon"><i class="mdi mdi-file-document"></i></span>
                <div class="recent-item-info">
                  <div class="recent-item-name">${Utils.escapeHtml(cp.name)}</div>
                  <div class="recent-item-meta">
                    ${cp.channelCount || 0} channels &bull; Updated ${Utils.formatDate(cp.updatedAt)}
                  </div>
                  ${cp.description ? `<div class="recent-item-meta" style="margin-top:0.125rem">${Utils.escapeHtml(cp.description)}</div>` : ''}
                </div>
              </div>
              <div style="display:flex;gap:0.25rem;flex-shrink:0">
                <button class="btn btn-sm" onclick="event.stopPropagation();App.showMergeCodeplugModal('${cp.id}')" title="Merge into current codeplug" style="background:var(--bg-hover)">
                  <i class="mdi mdi-merge"></i>
                </button>
                <button class="btn btn-sm" onclick="event.stopPropagation();App.shareCodeplug('${cp.id}')" title="Share to community library" style="background:var(--bg-hover)">
                  <i class="mdi mdi-share-variant"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.deleteCodeplug('${cp.id}','${Utils.escapeJsString(cp.name)}')" title="Delete">
                  <i class="mdi mdi-delete"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <p>No saved codeplugs yet.</p>
      `;
      
      UI.showModal('My Codeplugs', content, {
        wide: true,
        confirmText: 'Save Current',
        onConfirm: () => {
          UI.hideModal();
          App.showSaveCodeplugModal();
        }
      });
      
    } catch (error) {
      Utils.toast('Failed to load codeplugs: ' + error.message, 'error');
    }
  },

  /**
   * Delete codeplug from library
   */
  async deleteCodeplug(id, name) {
    if (!confirm(`Delete codeplug "${name}"? This cannot be undone.`)) return;
    try {
      await API.deleteCodeplug(id);
      Utils.toast('Codeplug deleted', 'success');
      // If it was the currently loaded server codeplug, clear the ID
      if (String(window.codeplug._serverId) === String(id)) {
        window.codeplug._serverId = null;
      }
      // Refresh the list
      App.showMyCodeplugs();
    } catch (error) {
      Utils.toast('Delete failed: ' + error.message, 'error');
    }
  },

  /**
   * Sharing is not available in the standalone build
   */
  async shareCodeplug() {
    Utils.toast('Sharing is not available in the standalone build', 'info');
  },

  /**
   * Show save codeplug modal
   */
  showSaveCodeplugModal() {
    const isUpdate = !!window.codeplug._serverId;
    const content = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="saveCodeplugName" value="${Utils.escapeHtml(window.codeplug.filename || 'My Codeplug')}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="saveCodeplugDesc" rows="3" placeholder="Optional description...">${Utils.escapeHtml(window.codeplug._serverDesc || '')}</textarea>
      </div>
      ${isUpdate ? '<p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-muted)"><i class="mdi mdi-information"></i> This will update the existing web copy.</p>' : ''}
    `;
    
    UI.showModal(isUpdate ? 'Update Codeplug' : 'Save Codeplug', content, {
      confirmText: isUpdate ? 'Update' : 'Save',
      onConfirm: async () => {
        const name = document.getElementById('saveCodeplugName').value;
        const description = document.getElementById('saveCodeplugDesc').value;
        
        try {
          if (isUpdate) {
            await API.updateCodeplug(window.codeplug._serverId, name, description, window.codeplug.toJSON());
          } else {
            const result = await API.saveCodeplug(name, description, window.codeplug.toJSON());
            window.codeplug._serverId = result.id;
          }
          window.codeplug.filename = name;
          window.codeplug._serverDesc = description;
          UI.hideModal();
          UI.updateOverview();
          Utils.toast(isUpdate ? 'Codeplug updated' : 'Codeplug saved to your library', 'success');
        } catch (error) {
          Utils.toast('Save failed: ' + error.message, 'error');
        }
      }
    });
  },

  /**
   * Save codeplug to the local library (My Codeplugs).
   * If already saved before, updates the existing copy. Otherwise prompts for name.
   */
  async saveCodeplugToCloud() {
    const isUpdate = !!window.codeplug._serverId;

    if (isUpdate) {
      // Quick update existing codeplug
      try {
        const name = window.codeplug.filename || 'My Codeplug';
        const description = window.codeplug._serverDesc || '';
        await API.updateCodeplug(window.codeplug._serverId, name, description, window.codeplug.toJSON());
        UI.updateOverview();
        Utils.toast('Codeplug updated', 'success');
      } catch (error) {
        Utils.toast('Save failed: ' + error.message, 'error');
      }
    } else {
      // New save - show modal for name/description
      this.showSaveCodeplugModal();
    }
  },

  /**
   * Load codeplug from library
   */
  async loadCodeplug(id) {
    try {
      const data = await API.getCodeplug(id);
      window.codeplug.fromJSON(data.data);
      window.codeplug.filename = data.name;
      window.codeplug._serverId = data.id;
      window.codeplug._serverDesc = data.description || '';
      UI.hideModal();
      UI.updateOverview();
      UI.showSection('overview');
      Utils.toast('Codeplug loaded: ' + data.name, 'success');
    } catch (error) {
      Utils.toast('Failed to load: ' + error.message, 'error');
    }
  },

  /**
   * Internal: stored merge source data
   */
  _mergeSource: null,

  /**
   * Show merge selection modal for a saved codeplug.
   * Fetches the codeplug data and displays all items with checkboxes.
   */
  async showMergeCodeplugModal(id) {
    try {
      const data = await API.getCodeplug(id);
      const src = data.data;
      if (!src || src.version !== 1) {
        Utils.toast('Invalid codeplug format', 'error');
        return;
      }
      this._mergeSource = src;
      this._showMergeModal(src, data.name);
    } catch (error) {
      Utils.toast('Failed to load codeplug: ' + error.message, 'error');
    }
  },

  /**
   * Internal: render the merge selection modal for a given source codeplug
   */
  _showMergeModal(src, sourceName) {
    // Build category sections
    const categories = [
      { key: 'channels',   label: 'Channels',    icon: 'mdi-radio-tower',       items: src.channels || [] },
      { key: 'contacts',   label: 'Contacts',    icon: 'mdi-account-group',     items: src.contacts || [] },
      { key: 'tgLists',    label: 'TG Lists',    icon: 'mdi-format-list-group', items: src.tgLists || [] },
      { key: 'zones',      label: 'Zones',       icon: 'mdi-map-marker-radius', items: src.zones || [] },
      { key: 'aprs',       label: 'APRS',        icon: 'mdi-access-point',      items: src.aprs || [] },
      { key: 'dtmf',       label: 'DTMF',        icon: 'mdi-dialpad',           items: src.dtmf || [] },
      { key: 'scanLists',  label: 'Scan Lists',  icon: 'mdi-magnify-scan',      items: src.scanLists || [] },
      { key: 'satellites',  label: 'Satellites',  icon: 'mdi-satellite-variant', items: src.satellites || [] }
    ];

    const itemDesc = (cat, item) => {
      switch (cat) {
        case 'channels':   return `${item.name}${item.rxFreq ? ' - ' + item.rxFreq + ' MHz' : ''}${item.type ? ' (' + item.type + ')' : ''}`;
        case 'contacts':   return `${item.name} - ${item.dmrId || ''}${item.type ? ' (' + item.type + ')' : ''}`;
        case 'tgLists':    return `${item.name} (${(item.contacts || []).length} contacts)`;
        case 'zones':      return `${item.name} (${(item.channels || []).length} channels)`;
        case 'aprs':       return `${item.name}`;
        case 'dtmf':       return `${item.name} - ${item.code || ''}`;
        case 'scanLists':  return `${item.name} (${(item.channels || []).length} channels)`;
        case 'satellites':  return `${item.name}`;
        default:           return item.name || 'Unknown';
      }
    };

    let html = `<p style="margin-bottom:0.75rem;color:var(--text-secondary)">Select items from <strong>${Utils.escapeHtml(sourceName)}</strong> to merge into your current codeplug. Associated contacts, TG lists and channels will be imported automatically and deduplicated.</p>`;

    categories.forEach(cat => {
      if (cat.items.length === 0) return;
      html += `
        <div class="merge-category" data-cat="${cat.key}">
          <div class="merge-category-header" onclick="App.toggleMergeCategory('${cat.key}')">
            <i class="mdi ${cat.icon}" style="margin-right:0.375rem"></i>
            <strong>${cat.label}</strong>
            <span class="merge-category-count">${cat.items.length}</span>
            <span style="margin-left:auto;display:flex;gap:0.375rem;align-items:center">
              <button class="btn btn-sm" onclick="event.stopPropagation();App.mergeSelectAll('${cat.key}',true)" style="font-size:0.7rem;padding:2px 6px">All</button>
              <button class="btn btn-sm" onclick="event.stopPropagation();App.mergeSelectAll('${cat.key}',false)" style="font-size:0.7rem;padding:2px 6px">None</button>
              <i class="mdi mdi-chevron-down merge-chevron"></i>
            </span>
          </div>
          <div class="merge-category-items" style="display:none">
            ${cat.items.map((item, idx) => `
              <label class="merge-item" data-cat="${cat.key}" data-idx="${idx}">
                <input type="checkbox" class="merge-cb" data-cat="${cat.key}" data-idx="${idx}">
                <span>${Utils.escapeHtml(itemDesc(cat.key, item))}</span>
              </label>
            `).join('')}
          </div>
        </div>`;
    });

    // DTMF Settings toggle
    if (src.dtmfSettings) {
      html += `
        <div class="merge-category">
          <label class="merge-category-header" style="cursor:pointer">
            <input type="checkbox" id="mergeDtmfSettings" style="margin-right:0.5rem">
            <i class="mdi mdi-cog" style="margin-right:0.375rem"></i>
            <strong>DTMF Settings</strong>
            <span style="margin-left:0.5rem;color:var(--text-muted);font-size:0.8rem">(replaces current)</span>
          </label>
        </div>`;
    }

    html += `<div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.performMerge()"><i class="mdi mdi-merge" style="margin-right:0.25rem"></i> Merge Selected</button>
    </div>`;

    UI.showModal('Merge Codeplug', html, { wide: true, hideFooter: true });
  },

  /**
   * Toggle a merge category's item list visibility
   */
  toggleMergeCategory(catKey) {
    const cat = document.querySelector(`.merge-category[data-cat="${catKey}"]`);
    if (!cat) return;
    const items = cat.querySelector('.merge-category-items');
    const chevron = cat.querySelector('.merge-chevron');
    if (items) {
      const isHidden = items.style.display === 'none';
      items.style.display = isHidden ? '' : 'none';
      if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
    }
  },

  /**
   * Select all / none checkboxes in a merge category
   */
  mergeSelectAll(catKey, selectAll) {
    document.querySelectorAll(`.merge-cb[data-cat="${catKey}"]`).forEach(cb => {
      cb.checked = selectAll;
    });
  },

  /**
   * Execute the merge based on current checkbox selections
   */
  performMerge() {
    if (!this._mergeSource) {
      Utils.toast('No merge source loaded', 'error');
      return;
    }

    // Gather selections: array of selected indices per category
    const selections = {
      channels: [], contacts: [], tgLists: [], zones: [],
      aprs: [], dtmf: [], scanLists: [], satellites: [],
      dtmfSettings: false
    };

    document.querySelectorAll('.merge-cb:checked').forEach(cb => {
      const cat = cb.dataset.cat;
      const idx = parseInt(cb.dataset.idx, 10);
      if (selections[cat] && !isNaN(idx)) {
        selections[cat].push(idx);
      }
    });

    const dtmfSettingsCb = document.getElementById('mergeDtmfSettings');
    if (dtmfSettingsCb && dtmfSettingsCb.checked) {
      selections.dtmfSettings = true;
    }

    // Check if anything is selected
    const totalSelected = Object.keys(selections).reduce((sum, k) => {
      if (k === 'dtmfSettings') return sum + (selections[k] ? 1 : 0);
      return sum + selections[k].length;
    }, 0);

    if (totalSelected === 0) {
      Utils.toast('No items selected to merge', 'warning');
      return;
    }

    const summary = window.codeplug.mergeItems(this._mergeSource, selections);
    UI.hideModal();
    UI.updateOverview();

    // Build a results message
    const parts = [];
    const labels = { channels: 'channels', contacts: 'contacts', tgLists: 'TG lists', zones: 'zones',
                     aprs: 'APRS configs', dtmf: 'DTMF contacts', scanLists: 'scan lists', satellites: 'satellites' };
    for (const [key, label] of Object.entries(labels)) {
      if (summary.added[key] > 0) parts.push(`${summary.added[key]} ${label}`);
    }
    if (selections.dtmfSettings) parts.push('DTMF settings');

    const skippedParts = [];
    for (const [key, label] of Object.entries(labels)) {
      if (summary.skipped[key] > 0) skippedParts.push(`${summary.skipped[key]} ${label}`);
    }

    let msg = parts.length > 0 ? `Merged: ${parts.join(', ')}` : 'No new items added';
    if (skippedParts.length > 0) msg += ` (skipped duplicates: ${skippedParts.join(', ')})`;
    if (summary.errors.length > 0) msg += ` | ${summary.errors.length} error(s)`;

    Utils.toast(msg, parts.length > 0 ? 'success' : 'warning');
    this._mergeSource = null;
  },

  /**
   * Show merge selection modal for a shared library codeplug.
   * Fetches the shared codeplug data and displays all items with checkboxes.
   */
  async showMergeSharedCodeplugModal(id) {
    try {
      const data = await API.getSharedCodeplug(id);
      const src = data.codeplug;
      if (!src || src.version !== 1) {
        Utils.toast('Invalid codeplug format', 'error');
        return;
      }
      this._mergeSource = src;
      this._showMergeModal(src, data.name);
    } catch (error) {
      Utils.toast('Failed to load shared codeplug: ' + error.message, 'error');
    }
  },

  /**
   * Load shared library page
   */
  async loadSharedLibraryPage() {
    // Bind tab switching
    this.bindSharedLibraryTabs();
    
    // Load codeplugs tab content
    await this.loadSharedCodeplugsTab();
    
    // Load satellite configs tab content (in background)
    this.loadSharedSatellitesTab();
  },
  
  /**
   * Bind shared library tab switching
   */
  bindSharedLibraryTabs() {
    const tabs = document.querySelectorAll('.library-tab');
    const codeplugsContent = document.getElementById('codeplugsTabContent');
    const satellitesContent = document.getElementById('satellitesTabContent');
    const actionsEl = document.getElementById('sharedLibraryActions');
    
    tabs.forEach(tab => {
      tab.onclick = () => {
        // Update tab styles
        tabs.forEach(t => {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = 'var(--text-muted)';
        });
        tab.classList.add('active');
        tab.style.borderBottomColor = 'var(--primary-color)';
        tab.style.color = 'var(--text-color)';
        
        // Show/hide content
        const tabName = tab.dataset.tab;
        if (tabName === 'codeplugs') {
          codeplugsContent.style.display = '';
          satellitesContent.style.display = 'none';
          // Update action button
          if (actionsEl) {
            actionsEl.innerHTML = `
              <button class="btn btn-primary" id="shareCurrentCodeplugBtn">
                <i class="mdi mdi-share-variant"></i>
                Share My Codeplug
              </button>
            `;
            document.getElementById('shareCurrentCodeplugBtn')?.addEventListener('click', () => {
              App.shareCodeplugToLibrary();
            });
          }
        } else if (tabName === 'satellites') {
          codeplugsContent.style.display = 'none';
          satellitesContent.style.display = '';
          // Update action button
          if (actionsEl) {
            actionsEl.innerHTML = `
              <button class="btn btn-primary" id="shareSatelliteConfigBtn">
                <i class="mdi mdi-share-variant"></i>
                Share My Satellites
              </button>
            `;
            document.getElementById('shareSatelliteConfigBtn')?.addEventListener('click', () => {
              App.showShareSatelliteConfigModal();
            });
          }
        }
      };
    });
  },
  
  /**
   * Load shared codeplugs tab
   */
  async loadSharedCodeplugsTab() {
    const grid = document.getElementById('sharedLibraryGrid');
    const searchInput = document.getElementById('sharedLibrarySearch');
    
    if (!grid) return;
    
    // Show loading state
    grid.innerHTML = `
      <div class="library-empty">
        <i class="mdi mdi-earth"></i>
        <p>Loading shared codeplugs...</p>
        <div class="loading-spinner small"></div>
      </div>
    `;
    
    try {
      const shared = await API.getSharedCodeplugs();
      const currentUserId = API.user ? API.user.id : null;
      
      if (shared.length === 0) {
        grid.innerHTML = `
          <div class="library-empty">
            <i class="mdi mdi-earth"></i>
            <p>No shared codeplugs available yet</p>
            <small>Be the first to share your codeplug with the community!</small>
            <button class="btn btn-primary" style="margin-top: 1rem;" onclick="App.shareCodeplugToLibrary()">
              <i class="mdi mdi-share-variant"></i> Share My Codeplug
            </button>
          </div>
        `;
        return;
      }
      
      this._sharedCodeplugs = shared;
      this.renderSharedLibraryGrid(shared, currentUserId);
      
      // Bind search
      if (searchInput) {
        searchInput.oninput = () => {
          const q = searchInput.value.toLowerCase();
          const filtered = shared.filter(cp => 
            (cp.name || '').toLowerCase().includes(q) ||
            (cp.description || '').toLowerCase().includes(q) ||
            (cp.sharedBy || '').toLowerCase().includes(q)
          );
          this.renderSharedLibraryGrid(filtered, currentUserId);
        };
      }
      
    } catch (error) {
      grid.innerHTML = `
        <div class="library-empty">
          <i class="mdi mdi-alert"></i>
          <p>Failed to load shared library</p>
          <small>${error.message}</small>
          <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="App.loadSharedLibraryPage()">
            <i class="mdi mdi-refresh"></i> Retry
          </button>
        </div>
      `;
    }
  },
  
  /**
   * Load shared satellites tab
   */
  async loadSharedSatellitesTab() {
    const grid = document.getElementById('sharedSatelliteGrid');
    const searchInput = document.getElementById('sharedSatelliteSearch');
    
    if (!grid) return;
    
    // Show loading state
    grid.innerHTML = `
      <div class="library-empty">
        <i class="mdi mdi-satellite-variant"></i>
        <p>Loading satellite configurations...</p>
        <div class="loading-spinner small"></div>
      </div>
    `;
    
    try {
      const configs = await API.getSharedSatelliteConfigs();
      const currentUserId = API.user ? API.user.id : null;
      
      if (configs.length === 0) {
        grid.innerHTML = `
          <div class="library-empty">
            <i class="mdi mdi-satellite-variant"></i>
            <p>No shared satellite configurations yet</p>
            <small>Be the first to share your satellite config with the community!</small>
            <button class="btn btn-primary" style="margin-top: 1rem;" onclick="App.showShareSatelliteConfigModal()">
              <i class="mdi mdi-share-variant"></i> Share My Satellites
            </button>
          </div>
        `;
        return;
      }
      
      this._sharedSatelliteConfigs = configs;
      this.renderSharedSatelliteGrid(configs, currentUserId);
      
      // Bind search
      if (searchInput) {
        searchInput.oninput = () => {
          const q = searchInput.value.toLowerCase();
          const filtered = configs.filter(cfg => 
            (cfg.name || '').toLowerCase().includes(q) ||
            (cfg.description || '').toLowerCase().includes(q) ||
            (cfg.sharedBy || '').toLowerCase().includes(q)
          );
          this.renderSharedSatelliteGrid(filtered, currentUserId);
        };
      }
      
    } catch (error) {
      grid.innerHTML = `
        <div class="library-empty">
          <i class="mdi mdi-alert"></i>
          <p>Failed to load satellite configurations</p>
          <small>${error.message}</small>
          <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="App.loadSharedSatellitesTab()">
            <i class="mdi mdi-refresh"></i> Retry
          </button>
        </div>
      `;
    }
  },
  
  /**
   * Render shared satellite configs grid
   */
  renderSharedSatelliteGrid(configs, currentUserId) {
    const grid = document.getElementById('sharedSatelliteGrid');
    if (!grid) return;
    
    if (configs.length === 0) {
      grid.innerHTML = `
        <div class="library-empty">
          <i class="mdi mdi-magnify"></i>
          <p>No satellite configs match your search</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = configs.map(cfg => {
      const isOwner = currentUserId && cfg.userId === currentUserId;
      return `
        <div class="codeplug-card" data-id="${cfg.id}">
          <div class="codeplug-card-header">
            <div class="codeplug-card-icon">
              <i class="mdi mdi-satellite-variant"></i>
            </div>
            <div class="codeplug-card-title">
              <h4>${Utils.escapeHtml(cfg.name)}</h4>
              <div class="author">by ${Utils.escapeHtml(cfg.sharedBy || 'Anonymous')}</div>
            </div>
          </div>
          <div class="codeplug-card-body">
            ${cfg.description ? `<div class="codeplug-card-desc">${Utils.escapeHtml(cfg.description)}</div>` : ''}
            <div class="codeplug-card-stats">
              <div class="codeplug-stat">
                <i class="mdi mdi-satellite-uplink"></i>
                <span>${cfg.satelliteCount || 0} satellites</span>
              </div>
              ${cfg.downloadCount ? `
                <div class="codeplug-stat">
                  <i class="mdi mdi-download"></i>
                  <span>${cfg.downloadCount} imports</span>
                </div>
              ` : ''}
            </div>
            <div class="codeplug-card-stats" style="margin-bottom: 0;">
              <div class="codeplug-stat">
                <i class="mdi mdi-clock-outline"></i>
                <span>${Utils.formatDate(cfg.sharedAt)}</span>
              </div>
            </div>
          </div>
          <div class="codeplug-card-footer">
            <button class="btn btn-secondary" onclick="App.previewSharedSatelliteConfig('${cfg.id}')">
              <i class="mdi mdi-eye"></i> Preview
            </button>
            <button class="btn btn-primary" onclick="App.importSharedSatelliteConfig('${cfg.id}')">
              <i class="mdi mdi-import"></i> Import
            </button>
            ${isOwner ? `
              <button class="btn" style="background:var(--bg-hover)" onclick="App.deleteSharedSatelliteConfig('${cfg.id}','${Utils.escapeJsString(cfg.name)}')" title="Remove from library">
                <i class="mdi mdi-delete"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },
  
  /**
   * Show modal to share satellite configuration
   */
  showShareSatelliteConfigModal() {
    Utils.toast('Sharing is not available in this standalone build', 'info');
    return;
    
    if (!window.codeplug.satellites || window.codeplug.satellites.length === 0) {
      Utils.toast('No satellites to share. Configure some satellites first.', 'warning');
      return;
    }
    
    const content = `
      <form id="shareSatelliteForm">
        <div class="form-group">
          <label class="form-label">Configuration Name *</label>
          <input type="text" class="form-input" id="shareSatelliteName" placeholder="e.g., UK Amateur Satellites 2024" required>
          <small class="form-help">A descriptive name for your satellite configuration</small>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-input" id="shareSatelliteDescription" rows="3" placeholder="Describe the satellites included, any special settings, etc."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Satellites to Share</label>
          <p style="color: var(--text-muted); font-size: 0.9rem;">
            <i class="mdi mdi-satellite-variant"></i> ${window.codeplug.satellites.length} satellite(s) will be shared
          </p>
          <div style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
            ${window.codeplug.satellites.map(sat => `
              <div style="padding: 0.25rem 0; font-size: 0.85rem;">
                <strong>${Utils.escapeHtml(sat.name)}</strong>
                ${sat.rx1 ? ` - RX: ${sat.rx1} MHz` : ''}
                ${sat.tx1 ? ` / TX: ${sat.tx1} MHz` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </form>
    `;
    
    UI.showModal('Share Satellite Configuration', content, {
      confirmText: 'Share to Library',
      onConfirm: async () => {
        const name = document.getElementById('shareSatelliteName').value.trim();
        const description = document.getElementById('shareSatelliteDescription').value.trim();
        
        if (!name) {
          Utils.toast('Please enter a name for your configuration', 'warning');
          return;
        }
        
        try {
          await API.shareSatelliteConfig(name, description, window.codeplug.satellites);
          UI.hideModal();
          Utils.toast('Satellite configuration shared to library!', 'success');
          
          // Refresh the satellite configs tab
          App.loadSharedSatellitesTab();
        } catch (error) {
          Utils.toast('Failed to share: ' + error.message, 'error');
        }
      }
    });
  },
  
  /**
   * Preview a shared satellite configuration
   */
  async previewSharedSatelliteConfig(id) {
    try {
      const data = await API.getSharedSatelliteConfig(id);
      const satellites = data.satellites || [];
      
      const content = `
        <div class="codeplug-preview">
          <div class="preview-section">
            <h4><i class="mdi mdi-information"></i> Configuration Info</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Shared By</span>
                <span class="preview-value">${Utils.escapeHtml(data.sharedBy || 'Anonymous')}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Satellites</span>
                <span class="preview-value">${satellites.length}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Imports</span>
                <span class="preview-value">${data.downloadCount || 0}</span>
              </div>
            </div>
            ${data.description ? `<p style="margin-top: 0.5rem; color: var(--text-muted);">${Utils.escapeHtml(data.description)}</p>` : ''}
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-satellite-variant"></i> Satellites (${satellites.length})</h4>
            ${satellites.length > 0 ? `
              <div class="preview-table-container">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>RX1 (MHz)</th>
                      <th>TX1 (MHz)</th>
                      <th>CTCSS</th>
                      <th>Cat #</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${satellites.slice(0, 20).map(sat => `
                      <tr>
                        <td>${Utils.escapeHtml(sat.name)}</td>
                        <td>${sat.rx1 || '-'}</td>
                        <td>${sat.tx1 || '-'}</td>
                        <td>${sat.txCtcss || '-'}</td>
                        <td>${sat.catalogueNumber || '-'}</td>
                      </tr>
                    `).join('')}
                    ${satellites.length > 20 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">... and ${satellites.length - 20} more satellites</td></tr>` : ''}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-muted">No satellites</p>'}
          </div>
        </div>
      `;
      
      UI.showModal(`Preview: ${Utils.escapeHtml(data.name)}`, content, {
        wide: true,
        confirmText: 'Import to Codeplug',
        onConfirm: () => {
          UI.hideModal();
          App.importSharedSatelliteConfig(id);
        }
      });
      
    } catch (error) {
      Utils.toast('Failed to load preview: ' + error.message, 'error');
    }
  },
  
  /**
   * Import a shared satellite configuration to the current codeplug
   */
  async importSharedSatelliteConfig(id) {
    try {
      const data = await API.importSharedSatelliteConfig(id);
      const satellites = data.satellites || [];
      if (satellites.length === 0) {
        Utils.toast('No satellites to import', 'warning');
        return;
      }

      const noradOf = (v) => String(v || '').replace(/[A-Za-z]+$/, '').trim();
      const rows = satellites.map((sat, i) => {
        const norad = noradOf(sat.catalogueNumber);
        const exists = window.codeplug.satellites.some(s =>
          s.name === sat.name || (norad && noradOf(s.catalogueNumber) === norad));
        return `<label style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0; font-size:0.9rem;">
          <input type="checkbox" data-idx="${i}" ${exists ? '' : 'checked'}>
          <span style="flex:1;"><strong>${Utils.escapeHtml(sat.name)}</strong> <small style="color:var(--text-muted);">${Utils.escapeHtml(sat.catalogueNumber || '')}${exists ? ' · already in codeplug' : ''}</small></span>
        </label>`;
      }).join('');

      UI.showModal('Import Shared Satellites', `
        <p>Choose which satellites to merge into your codeplug (existing ones are skipped).</p>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
          <button type="button" class="btn btn-sm btn-secondary" id="satImpAll">Select All</button>
          <button type="button" class="btn btn-sm btn-secondary" id="satImpNone">Deselect All</button>
        </div>
        <div style="max-height:45vh; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:0.4rem 0.6rem;">${rows}</div>
      `, {
        confirmText: 'Merge Selected',
        onConfirm: () => {
          const checked = [...document.querySelectorAll('#modalBody input[type="checkbox"][data-idx]:checked')].map(cb => parseInt(cb.dataset.idx, 10));
          UI.hideModal();
          UI.mergeSharedSatellites(checked.map(i => satellites[i]).filter(Boolean));
        }
      });
      document.getElementById('satImpAll')?.addEventListener('click', () => document.querySelectorAll('#modalBody input[data-idx]').forEach(cb => { cb.checked = true; }));
      document.getElementById('satImpNone')?.addEventListener('click', () => document.querySelectorAll('#modalBody input[data-idx]').forEach(cb => { cb.checked = false; }));

    } catch (error) {
      Utils.toast('Failed to import satellites: ' + error.message, 'error');
    }
  },

  /**
   * Merge a chosen set of satellites into the codeplug (dedupe by name or
   * catalogue number, capped at the firmware limit), then refresh TLEs.
   */
  async mergeSharedSatellites(list) {
    const noradOf = (v) => String(v || '').replace(/[A-Za-z]+$/, '').trim();
    let added = 0, skipped = 0;
    (list || []).forEach(sat => {
      const norad = noradOf(sat.catalogueNumber);
      const exists = window.codeplug.satellites.some(s =>
        s.name === sat.name || (norad && noradOf(s.catalogueNumber) === norad));
      if (exists) { skipped++; return; }
      try { window.codeplug.addSatellite(sat); added++; }
      catch (e) { skipped++; }
    });
    window.codeplug.modified = true;
    UI.renderSatellites();
    if (UI.updateOverview) UI.updateOverview();
    Utils.toast(`Added ${added} satellite${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
    if (added > 0 && !UI._tleUpdatedThisSession) {
      await UI.autoUpdateTLEs();
    }
  },
  
  /**
   * Delete a shared satellite configuration (owner only)
   */
  async deleteSharedSatelliteConfig(id, name) {
    UI.showModal('Remove Satellite Configuration', `
      <p>Are you sure you want to remove <strong>"${Utils.escapeHtml(name)}"</strong> from the shared library?</p>
      <p style="color: var(--text-muted);">This will not affect anyone who has already imported it.</p>
    `, {
      confirmText: 'Remove',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await API.deleteSharedSatelliteConfig(id);
          UI.hideModal();
          Utils.toast('Satellite configuration removed from library', 'success');
          App.loadSharedSatellitesTab();
        } catch (error) {
          Utils.toast('Failed to remove: ' + error.message, 'error');
        }
      }
    });
  },
  
  /**
   * Render shared library grid
   */
  renderSharedLibraryGrid(codeplugs, currentUserId) {
    const grid = document.getElementById('sharedLibraryGrid');
    if (!grid) return;
    
    if (codeplugs.length === 0) {
      grid.innerHTML = `
        <div class="library-empty">
          <i class="mdi mdi-magnify"></i>
          <p>No codeplugs match your search</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = codeplugs.map(cp => {
      const isOwner = currentUserId && cp.userId === currentUserId;
      return `
        <div class="codeplug-card" data-id="${cp.id}">
          <div class="codeplug-card-header">
            <div class="codeplug-card-icon">
              <i class="mdi mdi-earth"></i>
            </div>
            <div class="codeplug-card-title">
              <h4>${Utils.escapeHtml(cp.name)}</h4>
              <div class="author">by ${Utils.escapeHtml(cp.sharedBy || 'Anonymous')}</div>
            </div>
          </div>
          <div class="codeplug-card-body">
            ${cp.description ? `<div class="codeplug-card-desc">${Utils.escapeHtml(cp.description)}</div>` : ''}
            <div class="codeplug-card-stats">
              <div class="codeplug-stat">
                <i class="mdi mdi-radio-tower"></i>
                <span>${cp.channelCount || 0} channels</span>
              </div>
              <div class="codeplug-stat">
                <i class="mdi mdi-account-group"></i>
                <span>${cp.contactCount || 0} contacts</span>
              </div>
              <div class="codeplug-stat">
                <i class="mdi mdi-format-list-group"></i>
                <span>${cp.zoneCount || 0} zones</span>
              </div>
              ${cp.downloadCount ? `
                <div class="codeplug-stat">
                  <i class="mdi mdi-download"></i>
                  <span>${cp.downloadCount} copies</span>
                </div>
              ` : ''}
            </div>
            <div class="codeplug-card-stats" style="margin-bottom: 0;">
              <div class="codeplug-stat">
                <i class="mdi mdi-clock-outline"></i>
                <span>${Utils.formatDate(cp.sharedAt)}</span>
              </div>
            </div>
          </div>
          <div class="codeplug-card-footer">
            <button class="btn btn-secondary" onclick="App.previewSharedCodeplug('${cp.id}')">
              <i class="mdi mdi-eye"></i> Preview
            </button>
            <button class="btn" style="background:var(--bg-hover)" onclick="App.showMergeSharedCodeplugModal('${cp.id}')" title="Merge into current codeplug">
              <i class="mdi mdi-merge"></i> Merge
            </button>
            <button class="btn btn-primary" onclick="App.copySharedCodeplug('${cp.id}')">
              <i class="mdi mdi-content-copy"></i> Copy
            </button>
            ${isOwner ? `
              <button class="btn" style="background:var(--bg-hover)" onclick="App.deleteSharedCodeplug('${cp.id}','${Utils.escapeJsString(cp.name)}')" title="Remove from library">
                <i class="mdi mdi-delete"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },
  
  /**
   * Preview a codeplug before copying
   */
  async previewCodeplug(id) {
    try {
      const data = await API.getCodeplug(id);
      
      const channels = data.data?.channels || [];
      const contacts = data.data?.contacts || [];
      const zones = data.data?.zones || [];
      const general = data.data?.general || {};
      
      const content = `
        <div class="codeplug-preview">
          <div class="preview-section">
            <h4><i class="mdi mdi-information"></i> General Info</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Radio Name</span>
                <span class="preview-value">${Utils.escapeHtml(general.radioName || 'Not set')}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Callsign</span>
                <span class="preview-value">${Utils.escapeHtml(general.callsign || 'Not set')}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">DMR ID</span>
                <span class="preview-value">${general.dmrId || 'Not set'}</span>
              </div>
            </div>
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-radio-tower"></i> Channels (${channels.length})</h4>
            ${channels.length > 0 ? `
              <div class="preview-table-container">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>RX Freq</th>
                      <th>TX Freq</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${channels.slice(0, 20).map(ch => `
                      <tr>
                        <td>${Utils.escapeHtml(ch.name)}</td>
                        <td>${ch.rxFreq} MHz</td>
                        <td>${ch.txFreq} MHz</td>
                        <td>${UI.channelModeAbbrev(ch)}</td>
                      </tr>
                    `).join('')}
                    ${channels.length > 20 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">... and ${channels.length - 20} more channels</td></tr>` : ''}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-muted">No channels</p>'}
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-format-list-group"></i> Zones (${zones.length})</h4>
            ${zones.length > 0 ? `
              <div class="preview-tags">
                ${zones.slice(0, 15).map(z => `<span class="preview-tag">${Utils.escapeHtml(z.name)} (${z.channels?.length || 0} ch)</span>`).join('')}
                ${zones.length > 15 ? `<span class="preview-tag">+${zones.length - 15} more</span>` : ''}
              </div>
            ` : '<p class="text-muted">No zones</p>'}
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-account-group"></i> Contacts (${contacts.length})</h4>
            ${contacts.length > 0 ? `
              <div class="preview-tags">
                ${contacts.slice(0, 15).map(c => `<span class="preview-tag">${Utils.escapeHtml(c.name)}</span>`).join('')}
                ${contacts.length > 15 ? `<span class="preview-tag">+${contacts.length - 15} more</span>` : ''}
              </div>
            ` : '<p class="text-muted">No contacts</p>'}
          </div>
        </div>
      `;
      
      UI.showModal(`Preview: ${Utils.escapeHtml(data.name)}`, content, {
        wide: true,
        confirmText: 'Copy to My Library',
        onConfirm: () => {
          UI.hideModal();
          App.copySharedCodeplug(id);
        }
      });
      
    } catch (error) {
      Utils.toast('Failed to load preview: ' + error.message, 'error');
    }
  },
  
  /**
   * Preview a shared codeplug from the library (no auth required)
   */
  async previewSharedCodeplug(id) {
    try {
      const data = await API.getSharedCodeplug(id);
      
      const channels = data.codeplug?.channels || [];
      const contacts = data.codeplug?.contacts || [];
      const zones = data.codeplug?.zones || [];
      const general = data.codeplug?.general || {};
      
      const content = `
        <div class="codeplug-preview">
          <div class="preview-section">
            <h4><i class="mdi mdi-information"></i> General Info</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Radio Name</span>
                <span class="preview-value">${Utils.escapeHtml(general.radioName || 'Not set')}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Radio Type</span>
                <span class="preview-value">${Utils.escapeHtml(general.radioType || 'Not set')}</span>
              </div>
            </div>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.8rem;">
              <i class="mdi mdi-information-outline"></i> DMR ID and callsign are stripped from shared codeplugs
            </p>
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-radio-tower"></i> Channels (${channels.length})</h4>
            ${channels.length > 0 ? `
              <div class="preview-table-container">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>RX Freq</th>
                      <th>TX Freq</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${channels.slice(0, 20).map(ch => `
                      <tr>
                        <td>${Utils.escapeHtml(ch.name)}</td>
                        <td>${ch.rxFreq} MHz</td>
                        <td>${ch.txFreq} MHz</td>
                        <td>${UI.channelModeAbbrev(ch)}</td>
                      </tr>
                    `).join('')}
                    ${channels.length > 20 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">... and ${channels.length - 20} more channels</td></tr>` : ''}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-muted">No channels</p>'}
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-format-list-group"></i> Zones (${zones.length})</h4>
            ${zones.length > 0 ? `
              <div class="preview-tags">
                ${zones.slice(0, 15).map(z => `<span class="preview-tag">${Utils.escapeHtml(z.name)} (${z.channels?.length || 0} ch)</span>`).join('')}
                ${zones.length > 15 ? `<span class="preview-tag">+${zones.length - 15} more</span>` : ''}
              </div>
            ` : '<p class="text-muted">No zones</p>'}
          </div>
          
          <div class="preview-section">
            <h4><i class="mdi mdi-account-group"></i> Contacts (${contacts.length})</h4>
            ${contacts.length > 0 ? `
              <div class="preview-tags">
                ${contacts.slice(0, 15).map(c => `<span class="preview-tag">${Utils.escapeHtml(c.name)}</span>`).join('')}
                ${contacts.length > 15 ? `<span class="preview-tag">+${contacts.length - 15} more</span>` : ''}
              </div>
            ` : '<p class="text-muted">No contacts</p>'}
          </div>
        </div>
      `;
      
      // Create custom footer with multiple action buttons for shared codeplugs
      const sharedFooter = `
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <button class="btn btn-secondary" id="mergeSharedBtn">
            <i class="mdi mdi-merge"></i> Merge
          </button>
          <button class="btn btn-secondary" id="loadSharedToEditorBtn">
            <i class="mdi mdi-folder-open"></i> Load to Editor
          </button>
          <button class="btn btn-primary" id="copySharedToLibraryBtn">
            <i class="mdi mdi-content-copy"></i> Copy to My Library
          </button>
        </div>
      `;
      
      UI.showModal(`Preview: ${Utils.escapeHtml(data.name)}`, content + sharedFooter, {
        wide: true,
        hideFooter: true
      });
      
      // Bind button events after modal is shown (using { once: true } to prevent duplicates)
      const mergeBtn = document.getElementById('mergeSharedBtn');
      const loadBtn = document.getElementById('loadSharedToEditorBtn');
      const copyBtn = document.getElementById('copySharedToLibraryBtn');
      
      if (mergeBtn) {
        mergeBtn.addEventListener('click', () => {
          UI.hideModal();
          App.showMergeSharedCodeplugModal(id);
        }, { once: true });
      }
      
      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          UI.hideModal();
          App.loadSharedCodeplugToEditor(data);
        }, { once: true });
      }
      
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          UI.hideModal();
          App.copySharedCodeplug(id);
        }, { once: true });
      }
      
    } catch (error) {
      Utils.toast('Failed to load preview: ' + error.message, 'error');
    }
  },
  
  /**
   * Load a shared codeplug directly into the editor (no auth required)
   */
  loadSharedCodeplugToEditor(data) {
    try {
      if (!data.codeplug) {
        Utils.toast('No codeplug data found', 'error');
        return;
      }
      
      // Import the codeplug data into the editor
      window.codeplug.fromJSON(data.codeplug);
      
      // Update UI
      UI.updateOverview();
      UI.showSection('overview');
      
      Utils.toast(`Loaded "${data.name}" into editor`, 'success');
      
      // Update codeplug name in header
      const nameEl = document.getElementById('currentCodeplugName');
      if (nameEl) {
        nameEl.textContent = data.name;
      }
      
    } catch (error) {
      Utils.toast('Failed to load codeplug: ' + error.message, 'error');
    }
  },
  
  /**
   * Load my codeplugs page
   */
  async loadMyCodeplugsPage() {
    const grid = document.getElementById('myCodeplugsGrid');
    
    if (!grid) return;
    
    // Show loading state
    grid.innerHTML = `
      <div class="library-empty">
        <i class="mdi mdi-folder-account"></i>
        <p>Loading your codeplugs...</p>
        <div class="loading-spinner small"></div>
      </div>
    `;
    
    try {
      const codeplugs = await API.getMyCodeplugs();
      
      if (codeplugs.length === 0) {
        grid.innerHTML = `
          <div class="library-empty">
            <i class="mdi mdi-folder-account"></i>
            <p>No saved codeplugs yet</p>
            <small>Save your current codeplug to access it from any device</small>
            <button class="btn btn-primary" style="margin-top: 1rem;" onclick="App.showSaveCodeplugModal()">
              <i class="mdi mdi-content-save"></i> Save Current Codeplug
            </button>
          </div>
        `;
        return;
      }
      
      grid.innerHTML = codeplugs.map(cp => `
        <div class="codeplug-card" data-id="${cp.id}">
          <div class="codeplug-card-header">
            <div class="codeplug-card-icon">
              <i class="mdi mdi-file-document"></i>
            </div>
            <div class="codeplug-card-title">
              <h4>${Utils.escapeHtml(cp.name)}</h4>
              <div class="author">Last updated ${Utils.formatDate(cp.updatedAt)}</div>
            </div>
          </div>
          <div class="codeplug-card-body">
            ${cp.description ? `<div class="codeplug-card-desc">${Utils.escapeHtml(cp.description)}</div>` : ''}
            <div class="codeplug-card-stats">
              <div class="codeplug-stat">
                <i class="mdi mdi-radio-tower"></i>
                <span>${cp.channelCount || 0} channels</span>
              </div>
              <div class="codeplug-stat">
                <i class="mdi mdi-account-group"></i>
                <span>${cp.contactCount || 0} contacts</span>
              </div>
              <div class="codeplug-stat">
                <i class="mdi mdi-format-list-group"></i>
                <span>${cp.zoneCount || 0} zones</span>
              </div>
            </div>
          </div>
          <div class="codeplug-card-footer">
            <button class="btn btn-secondary" onclick="App.previewCodeplug('${cp.id}')">
              <i class="mdi mdi-eye"></i> Preview
            </button>
            <button class="btn btn-primary" onclick="App.loadCodeplug('${cp.id}')">
              <i class="mdi mdi-folder-open"></i> Load
            </button>
            <button class="btn" style="background:var(--bg-hover)" onclick="App.showMergeCodeplugModal('${cp.id}')" title="Merge into current codeplug">
              <i class="mdi mdi-merge"></i>
            </button>
            <button class="btn" style="background:var(--bg-hover)" onclick="App.shareCodeplug('${cp.id}')" title="Share to community">
              <i class="mdi mdi-share-variant"></i>
            </button>
            <button class="btn btn-danger" onclick="App.deleteCodeplug('${cp.id}','${Utils.escapeJsString(cp.name)}')" title="Delete">
              <i class="mdi mdi-delete"></i>
            </button>
          </div>
        </div>
      `).join('');
      
      // Bind save button
      document.getElementById('saveCurrentCodeplugBtn')?.addEventListener('click', () => {
        App.showSaveCodeplugModal();
      });
      
    } catch (error) {
      grid.innerHTML = `
        <div class="library-empty">
          <i class="mdi mdi-alert"></i>
          <p>Failed to load your codeplugs</p>
          <small>${error.message}</small>
          <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="App.loadMyCodeplugsPage()">
            <i class="mdi mdi-refresh"></i> Retry
          </button>
        </div>
      `;
    }
  },
  
  /**
   * Share current codeplug to the community library
   */
  async shareCodeplugToLibrary() {
    Utils.toast('Sharing is not available in this standalone build', 'info');
    return;
    
    const name = window.codeplug.filename || 'My Codeplug';
    const content = `
      <div class="form-group">
        <label class="form-label">Codeplug Name</label>
        <input type="text" class="form-input" id="shareCodeplugName" value="${Utils.escapeHtml(name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="shareCodeplugDesc" rows="3" placeholder="Describe what this codeplug is for, e.g., UK repeaters, local area, etc."></textarea>
      </div>
    `;
    
    UI.showModal('Share to Community', content, {
      confirmText: 'Share',
      onConfirm: async () => {
        const shareName = document.getElementById('shareCodeplugName').value;
        const shareDesc = document.getElementById('shareCodeplugDesc').value;
        
        if (!shareName.trim()) {
          Utils.toast('Please enter a name', 'error');
          return;
        }
        
        try {
          // First save the codeplug if not already saved
          let codeplugId = window.codeplug._serverId;
          if (!codeplugId) {
            const result = await API.saveCodeplug(shareName, shareDesc, window.codeplug.toJSON());
            codeplugId = result.id;
            window.codeplug._serverId = codeplugId;
          }
          
          // Then share it
          await API.shareCodeplug(codeplugId);
          UI.hideModal();
          Utils.toast('Codeplug shared to community library!', 'success');
          
          // Refresh the shared library if we're on that page
          if (document.getElementById('section-shared-library').classList.contains('active')) {
            App.loadSharedLibraryPage();
          }
        } catch (error) {
          Utils.toast('Share failed: ' + error.message, 'error');
        }
      }
    });
  },

  /**
   * Show shared library
   */
  async showSharedLibrary() {
    try {
      const shared = await API.getSharedCodeplugs();
      const currentUserId = API.user ? API.user.id : null;
      
      const searchBar = `
        <div style="margin-bottom:1rem">
          <input type="text" class="form-input" id="librarySearch" placeholder="Search by name, description, or callsign..." 
                 oninput="App.filterSharedLibrary(this.value)">
        </div>
      `;
      
      const listHtml = shared.length > 0 ? `
        <div class="recent-list" id="sharedLibraryList">
          ${shared.map(cp => {
            const isOwner = currentUserId && cp.userId === currentUserId;
            return `
            <div class="recent-item shared-library-item" data-search="${Utils.escapeHtml((cp.name + ' ' + (cp.description || '') + ' ' + (cp.sharedBy || '')).toLowerCase())}">
              <span class="recent-item-icon"><i class="mdi mdi-earth"></i></span>
              <div class="recent-item-info" style="flex:1;min-width:0">
                <div class="recent-item-name">${Utils.escapeHtml(cp.name)}</div>
                ${cp.description ? `<div class="recent-item-meta" style="margin-top:0.125rem">${Utils.escapeHtml(cp.description)}</div>` : ''}
                <div class="recent-item-meta" style="margin-top:0.25rem">
                  <strong>${Utils.escapeHtml(cp.sharedBy || 'Anonymous')}</strong> &bull;
                  ${cp.channelCount || 0} channels &bull;
                  ${Utils.formatDate(cp.sharedAt)}
                  ${cp.downloadCount ? ' &bull; ' + cp.downloadCount + ' copies' : ''}
                </div>
              </div>
              <div style="display:flex;gap:0.25rem;flex-shrink:0;align-items:center">
                <button class="btn btn-sm btn-primary" onclick="App.copySharedCodeplug('${cp.id}')" title="Copy to my library">
                  <i class="mdi mdi-content-copy"></i> Copy
                </button>
                ${isOwner ? `
                  <button class="btn btn-sm" onclick="App.editSharedCodeplug('${cp.id}','${Utils.escapeJsString(cp.name)}','${Utils.escapeJsString(cp.description || '')}')" title="Edit details" style="background:var(--bg-hover)">
                    <i class="mdi mdi-pencil"></i>
                  </button>
                  <button class="btn btn-sm" onclick="App.updateSharedCodeplugData('${cp.id}','${Utils.escapeJsString(cp.name)}')" title="Update with current codeplug" style="background:var(--bg-hover)">
                    <i class="mdi mdi-refresh"></i>
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="App.deleteSharedCodeplug('${cp.id}','${Utils.escapeJsString(cp.name)}')" title="Remove from library">
                    <i class="mdi mdi-delete"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `}).join('')}
        </div>
      ` : `
        <p>No shared codeplugs available yet.</p>
        <p style="margin-top: 1rem;">Be the first to share your codeplug with the community!</p>
      `;
      
      UI.showModal('Shared Library', searchBar + listHtml, {
        wide: true,
        hideCancel: true,
        confirmText: 'Close',
        onConfirm: () => UI.hideModal()
      });
      
    } catch (error) {
      Utils.toast('Failed to load library: ' + error.message, 'error');
    }
  },

  /**
   * Filter shared library items by search text
   */
  filterSharedLibrary(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.shared-library-item').forEach(item => {
      const text = item.dataset.search || '';
      item.style.display = text.includes(q) ? '' : 'none';
    });
  },

  /**
   * Copy shared codeplug
   */
  async copySharedCodeplug(id) {
    if (!API.isLoggedIn()) {
      App.showLoginModal();
      return;
    }
    try {
      await API.copyCodeplug(id);
      Utils.toast('Codeplug copied to your library', 'success');
    } catch (error) {
      Utils.toast('Copy failed: ' + error.message, 'error');
    }
  },

  /**
   * Edit shared codeplug name/description (owner only)
   */
  async editSharedCodeplug(id, currentName, currentDesc) {
    UI.hideModal();
    const content = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="editSharedName" value="${Utils.escapeHtml(currentName)}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="editSharedDesc" rows="3">${Utils.escapeHtml(currentDesc)}</textarea>
      </div>
    `;
    
    UI.showModal('Edit Shared Codeplug', content, {
      confirmText: 'Update',
      onConfirm: async () => {
        const name = document.getElementById('editSharedName').value;
        const description = document.getElementById('editSharedDesc').value;
        try {
          await API.updateSharedCodeplug(id, name, description);
          UI.hideModal();
          Utils.toast('Shared codeplug updated', 'success');
          App.showSharedLibrary();
        } catch (error) {
          Utils.toast('Update failed: ' + error.message, 'error');
        }
      }
    });
  },

  /**
   * Update shared codeplug data with current codeplug (owner only)
   */
  async updateSharedCodeplugData(id, name) {
    if (!confirm(`Update "${name}" in the shared library with your current codeplug data?`)) return;
    try {
      await API.updateSharedCodeplug(id, name, null, window.codeplug.toJSON());
      Utils.toast('Shared codeplug data updated', 'success');
      App.showSharedLibrary();
    } catch (error) {
      Utils.toast('Update failed: ' + error.message, 'error');
    }
  },

  /**
   * Delete shared codeplug (owner only)
   */
  async deleteSharedCodeplug(id, name) {
    if (!confirm(`Remove "${name}" from the shared library? This cannot be undone.`)) return;
    try {
      await API.deleteSharedCodeplug(id);
      Utils.toast('Codeplug removed from shared library', 'success');
      App.showSharedLibrary();
    } catch (error) {
      Utils.toast('Remove failed: ' + error.message, 'error');
    }
  }
});

// Bind filter change events
document.getElementById('repeaterTypeFilter')?.addEventListener('change', () => UI.filterRepeaters(document.getElementById('repeaterSearch').value));
document.getElementById('repeaterBandFilter')?.addEventListener('change', () => UI.filterRepeaters(document.getElementById('repeaterSearch').value));
document.getElementById('repeaterRegionFilter')?.addEventListener('change', () => UI.filterRepeaters(document.getElementById('repeaterSearch').value));
document.getElementById('repeaterStatusFilter')?.addEventListener('change', () => UI.filterRepeaters(document.getElementById('repeaterSearch').value));

// Sortable repeater columns (click a header to sort)
document.querySelector('#repeatersTable thead')?.addEventListener('click', (e) => {
  const th = e.target.closest('th.sortable');
  if (th && th.dataset.sort) UI.toggleRepeaterSort(th.dataset.sort);
});

// DMR Repeaters filter events
document.getElementById('dmrRepeaterCountryFilter')?.addEventListener('change', () => UI.filterDMRRepeaters());
document.getElementById('dmrRepeaterNetworkFilter')?.addEventListener('change', () => UI.filterDMRRepeaters());
// The DMR repeater network list can be long, so make it type-to-filter.
UI.enhanceSearchableSelect(document.getElementById('dmrRepeaterNetworkFilter'));
document.getElementById('dmrRepeaterStatusFilter')?.addEventListener('change', () => UI.filterDMRRepeaters());
document.getElementById('dmrRepeaterSearch')?.addEventListener('input', (e) => UI.filterDMRRepeaters(e.target.value));

// Map filter events
document.getElementById('mapDataSource')?.addEventListener('change', () => UI.updateRepeaterMap());
document.getElementById('mapStatusFilter')?.addEventListener('change', () => UI.updateRepeaterMap());
document.getElementById('mapImportRadius')?.addEventListener('change', () => {
  UI._updateRadiusCircle();
  UI._updateMapImportLabel();
});
// Set the initial import button label from the default radius selection
UI._updateMapImportLabel();

// Auto-save on changes
window.addEventListener('beforeunload', (e) => {
  if (window.codeplug.modified) {
    App.saveState();
    e.preventDefault();
    e.returnValue = '';
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Export App
window.App = App;
