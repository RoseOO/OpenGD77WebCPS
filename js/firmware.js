/**
 * OpenGD77 CPS Web - Firmware Management Module
 * 
 * Handles firmware selection, download, and flashing for:
 * - MK22 radios (GD-77, DM-1801, RD-5R, etc.)
 * - STM32 radios (MD-UV380, MD-9600, MD-2017, DM-1701, etc.)
 */

const FirmwareManager = {
  // Firmware manifest data
  manifest: null,
  
  // Currently selected firmware
  selectedMK22: {
    radioType: null,
    version: null,
    model: null,
    variant: null,
    language: 'en',
    firmwareData: null,
    languageData: null,
    donorData: null,
    donorSource: 'builtin',  // 'none', 'builtin', 'custom'
    donorSourceCustomPanel: 'builtin'  // 'none', 'builtin', 'custom'
  },
  
  selectedSTM32: {
    radioType: null,
    version: null,
    model: null,
    variant: null,
    language: 'en',
    firmwareData: null,
    languageData: null,
    donorData: null,
    donorSource: 'builtin',  // 'none', 'builtin', 'custom'
    donorSourceCustomPanel: 'builtin'  // 'none', 'builtin', 'custom'
  },
  
  selectedDM32: {
    version: null,
    variant: null,
    language: 'en'
  },

  /**
   * Initialize the firmware manager
   */
  async init() {
    try {
      // Load firmware manifest
      const response = await fetch('/dl/firmware_manifest.json');
      if (!response.ok) {
        throw new Error('Failed to load firmware manifest');
      }
      this.manifest = await response.json();
      
      // Initialize UI bindings
      this.bindUI();
      
      console.log('FirmwareManager initialized with manifest:', this.manifest);
    } catch (error) {
      console.error('Failed to initialize FirmwareManager:', error);
      Utils?.toast?.('Failed to load firmware catalog', 'error');
    }
  },
  
  /**
   * Bind all UI event handlers
   */
  bindUI() {
    // MK22 Source tabs
    document.querySelectorAll('.firmware-source-tab[data-target="mk22"]').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchSourceTab(e.target, 'mk22'));
    });
    
    // STM32 Source tabs
    document.querySelectorAll('.firmware-source-tab[data-target="stm32"]').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchSourceTab(e.target, 'stm32'));
    });
    
    // MK22 Library selectors
    document.getElementById('mk22RadioModel')?.addEventListener('change', (e) => {
      this.onMK22ModelChange(e.target.value);
    });
    
    document.getElementById('mk22FirmwareVersion')?.addEventListener('change', (e) => {
      this.onMK22VersionChange(e.target.value);
    });
    
    document.getElementById('mk22FirmwareVariant')?.addEventListener('change', (e) => {
      this.onMK22VariantChange(e.target.value);
    });
    
    document.getElementById('mk22Language')?.addEventListener('change', (e) => {
      this.selectedMK22.language = e.target.value;
    });
    
    // STM32 Library selectors
    document.getElementById('stm32RadioType')?.addEventListener('change', (e) => {
      this.onSTM32RadioTypeChange(e.target.value);
    });
    
    document.getElementById('stm32FirmwareVersion')?.addEventListener('change', (e) => {
      this.onSTM32VersionChange(e.target.value);
    });
    
    document.getElementById('stm32FirmwareVariant')?.addEventListener('change', (e) => {
      this.onSTM32VariantChange(e.target.value);
    });
    
    document.getElementById('stm32Language')?.addEventListener('change', (e) => {
      this.selectedSTM32.language = e.target.value;
    });
    
    // Donor file toggle for all panels (MK22 and STM32, Library and Custom)
    document.querySelectorAll('.donor-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const panel = e.target.dataset.panel;
        this.toggleDonorSource(e.target, panel);
      });
    });
    
    // STM32 Donor file upload (for custom)
    document.getElementById('firmwareSTM32DonorFile')?.addEventListener('change', (e) => {
      this.onSTM32DonorFileSelected(e.target, 'library');
    });
    
    document.getElementById('firmwareSTM32DonorFileCustom')?.addEventListener('change', (e) => {
      this.onSTM32DonorFileSelected(e.target, 'custom');
    });
    
    // MK22 Donor file upload
    document.getElementById('firmwareMK22DonorFile')?.addEventListener('change', (e) => {
      this.onMK22DonorFileSelected(e.target, 'library');
    });
    
    document.getElementById('firmwareMK22DonorFileCustom')?.addEventListener('change', (e) => {
      this.onMK22DonorFileSelected(e.target, 'custom');
    });
    
    // Download STM32 donor firmware buttons
    document.getElementById('downloadDonorFirmwareBtn')?.addEventListener('click', () => {
      this.downloadDonorFirmware('STM32');
    });
    
    document.getElementById('downloadDonorFirmwareBtnCustom')?.addEventListener('click', () => {
      this.downloadDonorFirmware('STM32');
    });
    
    // Download MK22 donor firmware buttons
    document.getElementById('downloadMK22DonorFirmwareBtn')?.addEventListener('click', () => {
      this.downloadDonorFirmware('MK22');
    });
    
    document.getElementById('downloadMK22DonorFirmwareBtnCustom')?.addEventListener('click', () => {
      this.downloadDonorFirmware('MK22');
    });
    
    // Download buttons
    document.getElementById('downloadMK22FirmwareBtn')?.addEventListener('click', () => {
      this.downloadMK22Firmware();
    });
    
    document.getElementById('downloadSTM32FirmwareBtn')?.addEventListener('click', () => {
      this.downloadSTM32Firmware();
    });
    
    // Flash buttons
    document.getElementById('flashMK22LibraryBtn')?.addEventListener('click', () => {
      this.flashMK22FromLibrary();
    });
    
    document.getElementById('flashSTM32LibraryBtn')?.addEventListener('click', () => {
      this.flashSTM32FromLibrary();
    });
    
    // Custom file uploads - existing handlers in ui.js
    document.getElementById('firmwareMK22File')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('firmwareMK22Name').value = file.name;
        document.getElementById('uploadMK22FirmwareBtn').disabled = false;
      }
    });
    
    document.getElementById('firmwareSTM32File')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('firmwareSTM32Name').value = file.name;
        this.checkSTM32CustomReady();
      }
    });
    
    // Populate language selectors
    this.populateLanguages();

    // DM32/UV008 firmware library
    this.populateDM32Library();
    document.getElementById('dm32FirmwareVersion')?.addEventListener('change', (e) => {
      this.onDM32VersionChange(e.target.value);
    });
    document.getElementById('dm32FirmwareVariant')?.addEventListener('change', (e) => {
      const btn = document.getElementById('flashDM32LibraryBtn');
      if (btn) btn.disabled = !e.target.value;
    });
    document.getElementById('flashDM32LibraryBtn')?.addEventListener('click', () => {
      this.flashDM32FromLibrary();
    });
    document.getElementById('dm32Language')?.addEventListener('change', (e) => {
      this.selectedDM32.language = e.target.value;
    });
  },

  /**
   * Populate the DM32/UV008 firmware version dropdown from the manifest.
   */
  populateDM32Library() {
    const versionSelect = document.getElementById('dm32FirmwareVersion');
    if (!versionSelect) return;
    const versions = this.manifest?.radioTypes?.DM32?.versions || {};
    const available = Object.entries(versions).map(([key, data]) => ({
      key,
      display: data.display || key
    }));
    if (available.length === 0) {
      versionSelect.innerHTML = '<option value="">No versions available</option>';
      versionSelect.disabled = true;
      return;
    }
    versionSelect.innerHTML = '<option value="">-- Select Version --</option>' +
      available.map(v => `<option value="${v.key}">${v.display}</option>`).join('');
    versionSelect.disabled = false;
  },

  /**
   * Populate the DM32/UV008 variant dropdown for the selected version.
   */
  onDM32VersionChange(version) {
    const variantSelect = document.getElementById('dm32FirmwareVariant');
    const flashBtn = document.getElementById('flashDM32LibraryBtn');
    if (flashBtn) flashBtn.disabled = true;
    if (!variantSelect) return;

    const modelData = this.manifest?.radioTypes?.DM32?.versions?.[version]?.models?.OpenDM32;
    const variants = modelData?.variants || {};
    const available = Object.entries(variants).map(([key, data]) => ({
      key,
      display: data.variantDisplay || key
    }));
    if (available.length === 0) {
      variantSelect.innerHTML = '<option value="">-- Select Variant --</option>';
      variantSelect.disabled = true;
      return;
    }
    variantSelect.innerHTML = '<option value="">-- Select Variant --</option>' +
      available.map(v => `<option value="${v.key}">${v.display}</option>`).join('');
    variantSelect.disabled = false;

    // Language is only offered for firmware versions that have the language area.
    const hasLanguages = !!this.manifest?.radioTypes?.DM32?.versions?.[version]?.hasLanguages;
    const langSelect = document.getElementById('dm32Language');
    const langGroup = document.getElementById('dm32LanguageGroup');
    if (langSelect) {
      langSelect.value = 'en';
      langSelect.disabled = !hasLanguages;
      this.selectedDM32.language = 'en';
    }
    if (langGroup) langGroup.style.display = hasLanguages ? '' : 'none';
  },

  /**
   * Download and flash a DM32/UV008 firmware from the manifest library.
   */
  async flashDM32FromLibrary() {
    const version = document.getElementById('dm32FirmwareVersion')?.value;
    const variant = document.getElementById('dm32FirmwareVariant')?.value;
    if (!version || !variant) {
      Utils?.toast?.('Please select a firmware version and variant', 'warning');
      return;
    }

    const info = this.manifest?.radioTypes?.DM32?.versions?.[version]?.models?.OpenDM32?.variants?.[variant];
    if (!info) {
      Utils?.toast?.('Firmware not found in manifest', 'error');
      return;
    }

    const progressEl = document.getElementById('firmwareProgress');
    const progressBar = document.getElementById('firmwareProgressBar');
    const progressText = document.getElementById('firmwareProgressText');
    if (progressEl) progressEl.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Downloading firmware...';

    try {
      const response = await fetch(`/dl/${info.path}`);
      if (!response.ok) throw new Error('Failed to download firmware');
      const data = new Uint8Array(await response.arrayBuffer());

      // Optionally merge an additional language into the firmware's language
      // area (needs a version-matched .gla file, e.g. version 3 for the DM32).
      const versionData = this.manifest?.radioTypes?.DM32?.versions?.[version];
      const language = this.selectedDM32.language || 'en';
      if (language && language !== 'en' && versionData?.hasLanguages) {
        const langInfo = this.manifest.languages.find(l => l.code === language);
        if (langInfo?.file) {
          if (progressText) progressText.textContent = 'Downloading language file...';
          try {
            const langUrl = `/dl/${versionData.languagesPath}/${langInfo.file}`;
            const langResponse = await fetch(langUrl);
            if (langResponse.ok) {
              const languageData = new Uint8Array(await langResponse.arrayBuffer());
              window.radioUSB.mergeLanguageFile(data, languageData);
              if (progressText) progressText.textContent = 'Language merged...';
            }
          } catch (e) {
            console.warn('Failed to download/merge language:', e);
            Utils?.toast?.('Language merge failed: ' + e.message, 'warning');
          }
        }
      }

      // Optional user-supplied boot-title patch. Applied after any language
      // merge so a merged language cannot overwrite the custom title.
      const bootTitle = document.getElementById('dm32BootTitle')?.value.trim();
      if (bootTitle) {
        window.radioUSB.patchDM32BootTitle(data, bootTitle);
        if (progressText) progressText.textContent = 'Patched boot title...';
      }

      if (progressBar) progressBar.style.width = '5%';
      if (progressText) progressText.textContent = 'Flashing firmware...';
      const eta = Utils.createEtaTracker();
      window.App?.setActivity('busy', 'Flashing firmware...');

      const force = !!document.getElementById('dm32ForceFlashLibrary')?.checked;
      await window.radioUSB.dm32FlashFirmware(data, (pct, msg) => {
        if (progressBar) progressBar.style.width = `${5 + pct * 0.95}%`;
        if (progressText) progressText.textContent = (msg || `Flashing ${Math.round(pct)}%`) + eta.update(pct);
      }, { force });

      if (progressBar) progressBar.style.width = '100%';
      if (progressText) progressText.textContent = 'Firmware upload complete!';
      window.App?.setActivity('idle');
      Utils?.toast?.('Firmware flashed - the radio will reboot', 'success');
      setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 3000);
    } catch (error) {
      if (progressText) progressText.textContent = 'Upload failed: ' + error.message;
      window.App?.setActivity('error');
      Utils?.toast?.('Firmware flash failed: ' + error.message, 'error');
    }
  },
  
  /**
   * Populate language dropdown options
   */
  populateLanguages() {
    if (!this.manifest?.languages) return;
    
    const mk22Lang = document.getElementById('mk22Language');
    const stm32Lang = document.getElementById('stm32Language');
    const dm32Lang = document.getElementById('dm32Language');
    
    const options = this.manifest.languages.map(lang => 
      `<option value="${lang.code}">${lang.name}</option>`
    ).join('');
    
    if (mk22Lang) mk22Lang.innerHTML = options;
    if (stm32Lang) stm32Lang.innerHTML = options;
    if (dm32Lang) dm32Lang.innerHTML = options;
  },
  
  /**
   * Switch between Library and Custom file upload tabs
   */
  switchSourceTab(clickedTab, radioType) {
    const source = clickedTab.dataset.source;
    const tabs = document.querySelectorAll(`.firmware-source-tab[data-target="${radioType}"]`);
    
    tabs.forEach(tab => tab.classList.remove('active'));
    clickedTab.classList.add('active');
    
    if (radioType === 'mk22') {
      const libraryPanel = document.getElementById('mk22LibraryPanel');
      const customPanel = document.getElementById('mk22CustomPanel');
      
      if (source === 'library') {
        libraryPanel.style.display = '';
        customPanel.style.display = 'none';
      } else {
        libraryPanel.style.display = 'none';
        customPanel.style.display = '';
      }
    } else if (radioType === 'stm32') {
      const libraryPanel = document.getElementById('stm32LibraryPanel');
      const customPanel = document.getElementById('stm32CustomPanel');
      
      if (source === 'library') {
        libraryPanel.style.display = '';
        customPanel.style.display = 'none';
      } else {
        libraryPanel.style.display = 'none';
        customPanel.style.display = '';
      }
    }
  },
  
  /**
   * Toggle donor source for any panel (MK22/STM32, Library/Custom)
   * @param {Element} clickedBtn - The clicked button element
   * @param {string} panel - Panel identifier: 'mk22-library', 'mk22-custom', 'stm32-library', 'stm32-custom'
   */
  toggleDonorSource(clickedBtn, panel) {
    const source = clickedBtn.dataset.donorSource; // 'none', 'builtin', 'custom'
    
    // Remove active class from all buttons in this panel
    document.querySelectorAll(`.donor-toggle-btn[data-panel="${panel}"]`).forEach(btn => {
      btn.classList.remove('active');
    });
    clickedBtn.classList.add('active');
    
    // Determine element IDs based on panel
    let noneInfoId, builtinInfoId, customUploadId;
    let stateProperty, updateFunction;
    
    switch (panel) {
      case 'mk22-library':
        noneInfoId = 'mk22DonorNoneInfo';
        builtinInfoId = 'mk22DonorBuiltinInfo';
        customUploadId = 'mk22DonorCustomUpload';
        this.selectedMK22.donorSource = source;
        updateFunction = () => this.updateMK22Buttons();
        break;
      case 'mk22-custom':
        noneInfoId = 'mk22DonorNoneInfoCustom';
        builtinInfoId = 'mk22DonorBuiltinInfoCustom';
        customUploadId = 'mk22DonorCustomUploadCustom';
        this.selectedMK22.donorSourceCustomPanel = source;
        updateFunction = () => this.checkMK22CustomReady();
        break;
      case 'stm32-library':
        noneInfoId = 'stm32DonorNoneInfo';
        builtinInfoId = 'donorBuiltinInfo';
        customUploadId = 'donorCustomUpload';
        this.selectedSTM32.donorSource = source;
        updateFunction = () => this.updateSTM32FlashButton();
        break;
      case 'stm32-custom':
        noneInfoId = 'stm32DonorNoneInfoCustom';
        builtinInfoId = 'donorBuiltinInfoCustom';
        customUploadId = 'donorCustomUploadCustom';
        this.selectedSTM32.donorSourceCustomPanel = source;
        updateFunction = () => this.checkSTM32CustomReady();
        break;
      default:
        console.warn('Unknown donor panel:', panel);
        return;
    }
    
    // Show/hide appropriate UI elements
    const noneInfo = document.getElementById(noneInfoId);
    const builtinInfo = document.getElementById(builtinInfoId);
    const customUpload = document.getElementById(customUploadId);
    
    if (noneInfo) noneInfo.style.display = source === 'none' ? '' : 'none';
    if (builtinInfo) builtinInfo.style.display = source === 'builtin' ? '' : 'none';
    if (customUpload) customUpload.style.display = source === 'custom' ? '' : 'none';
    
    // Update button state
    if (updateFunction) updateFunction();
  },
  
  /**
   * Download the donor firmware file
   * @param {string} radioType - 'MK22' or 'STM32'
   */
  async downloadDonorFirmware(radioType = 'STM32') {
    const donorInfo = this.manifest?.donor?.[radioType];
    if (!donorInfo?.path) {
      Utils?.toast?.(`${radioType} donor firmware not available`, 'error');
      return;
    }
    
    try {
      const url = `/dl/${donorInfo.path}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to download donor firmware');
      }
      
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = donorInfo.expectedFilename || 'donor_firmware.bin';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      Utils?.toast?.(`${radioType} donor firmware downloaded`, 'success');
    } catch (error) {
      Utils?.toast?.('Download failed: ' + error.message, 'error');
    }
  },
  
  /**
   * Handle STM32 donor file selection and show warning if filename doesn't match
   */
  onSTM32DonorFileSelected(input, panelType) {
    const file = input.files[0];
    if (!file) return;
    
    const nameInput = panelType === 'library' ? 
      document.getElementById('firmwareSTM32DonorName') : 
      document.getElementById('firmwareSTM32DonorNameCustom');
    
    const warningEl = panelType === 'library' ? 
      document.getElementById('donorFileWarning') : 
      document.getElementById('donorFileWarningCustom');
    
    if (nameInput) nameInput.value = file.name;
    
    // Check filename and show warning if different from expected
    const expectedFilename = this.manifest?.donor?.STM32?.expectedFilename || 'MD9600-CSV(2571V5)-V26.45.bin';
    
    if (warningEl) {
      if (file.name !== expectedFilename) {
        warningEl.style.display = '';
      } else {
        warningEl.style.display = 'none';
      }
    }
    
    if (panelType === 'custom') {
      this.checkSTM32CustomReady();
    } else {
      this.updateSTM32FlashButton();
    }
  },
  
  /**
   * Handle MK22 donor file selection and show warning if filename doesn't match
   */
  onMK22DonorFileSelected(input, panelType) {
    const file = input.files[0];
    if (!file) return;
    
    const nameInput = panelType === 'library' ? 
      document.getElementById('firmwareMK22DonorName') : 
      document.getElementById('firmwareMK22DonorNameCustom');
    
    const warningEl = panelType === 'library' ? 
      document.getElementById('mk22DonorFileWarning') : 
      document.getElementById('mk22DonorFileWarningCustom');
    
    if (nameInput) nameInput.value = file.name;
    
    // Check filename and show warning if different from expected
    const expectedFilename = this.manifest?.donor?.MK22?.expectedFilename || 'GD-77_V4.3.6.sgl';
    
    if (warningEl) {
      if (file.name !== expectedFilename) {
        warningEl.style.display = '';
      } else {
        warningEl.style.display = 'none';
      }
    }
    
    if (panelType === 'custom') {
      this.checkMK22CustomReady();
    } else {
      this.updateMK22Buttons();
    }
  },
  
  /**
   * Check if MK22 custom panel is ready to flash
   */
  checkMK22CustomReady() {
    const firmwareFile = document.getElementById('firmwareMK22File')?.files?.[0];
    const uploadBtn = document.getElementById('uploadMK22FirmwareBtn');
    
    // With "none" option, donor is not required
    let hasDonor = true;
    const donorSource = this.selectedMK22.donorSourceCustomPanel;
    
    if (donorSource === 'custom') {
      const donorFile = document.getElementById('firmwareMK22DonorFileCustom')?.files?.[0];
      hasDonor = !!donorFile;
    }
    // 'none' and 'builtin' both count as having donor (or not needing it)
    
    if (uploadBtn) {
      uploadBtn.disabled = !(firmwareFile && hasDonor);
    }
  },
  
  // ========== MK22 Handlers ==========
  
  /**
   * Handle MK22 radio model selection
   */
  onMK22ModelChange(model) {
    this.selectedMK22.model = model;
    this.selectedMK22.version = null;
    this.selectedMK22.variant = null;
    
    const versionSelect = document.getElementById('mk22FirmwareVersion');
    const variantSelect = document.getElementById('mk22FirmwareVariant');
    
    // Clear and disable dependent selects
    variantSelect.innerHTML = '<option value="">-- Select Variant --</option>';
    variantSelect.disabled = true;
    
    if (!model) {
      versionSelect.innerHTML = '<option value="">-- Select Version --</option>';
      versionSelect.disabled = true;
      this.updateMK22Buttons();
      return;
    }
    
    // Populate versions that have this model
    const versions = this.manifest?.radioTypes?.MK22?.versions || {};
    const availableVersions = [];
    
    for (const [versionKey, versionData] of Object.entries(versions)) {
      if (versionData.models && versionData.models[model]) {
        availableVersions.push({
          key: versionKey,
          display: versionData.display
        });
      }
    }
    
    if (availableVersions.length === 0) {
      versionSelect.innerHTML = '<option value="">No versions available</option>';
      versionSelect.disabled = true;
    } else {
      versionSelect.innerHTML = '<option value="">-- Select Version --</option>' +
        availableVersions.map(v => `<option value="${v.key}">${v.display}</option>`).join('');
      versionSelect.disabled = false;
    }
    
    this.updateMK22Buttons();
  },
  
  /**
   * Handle MK22 firmware version selection
   */
  onMK22VersionChange(version) {
    this.selectedMK22.version = version;
    this.selectedMK22.variant = null;
    
    const variantSelect = document.getElementById('mk22FirmwareVariant');
    
    if (!version || !this.selectedMK22.model) {
      variantSelect.innerHTML = '<option value="">-- Select Variant --</option>';
      variantSelect.disabled = true;
      this.updateMK22Buttons();
      return;
    }
    
    // Get variants for this model and version
    const versionData = this.manifest?.radioTypes?.MK22?.versions?.[version];
    const modelData = versionData?.models?.[this.selectedMK22.model];
    
    if (!modelData?.variants) {
      variantSelect.innerHTML = '<option value="">No variants available</option>';
      variantSelect.disabled = true;
      this.updateMK22Buttons();
      return;
    }
    
    const variants = Object.entries(modelData.variants);
    variantSelect.innerHTML = '<option value="">-- Select Variant --</option>' +
      variants.map(([key, data]) => 
        `<option value="${key}">${data.variantDisplay}</option>`
      ).join('');
    variantSelect.disabled = false;
    
    this.updateMK22Buttons();
  },
  
  /**
   * Handle MK22 variant selection
   */
  onMK22VariantChange(variant) {
    this.selectedMK22.variant = variant;
    this.updateMK22Buttons();
  },
  
  /**
   * Update MK22 download and flash button states
   */
  updateMK22Buttons() {
    const downloadBtn = document.getElementById('downloadMK22FirmwareBtn');
    const flashBtn = document.getElementById('flashMK22LibraryBtn');
    
    const isComplete = this.selectedMK22.model && 
                       this.selectedMK22.version && 
                       this.selectedMK22.variant;
    
    if (downloadBtn) downloadBtn.disabled = !isComplete;
    if (flashBtn) flashBtn.disabled = !isComplete;
  },
  
  /**
   * Download selected MK22 firmware
   */
  async downloadMK22Firmware() {
    const { model, version, variant } = this.selectedMK22;
    
    if (!model || !version || !variant) {
      Utils?.toast?.('Please select radio, version, and variant', 'warning');
      return;
    }
    
    const versionData = this.manifest?.radioTypes?.MK22?.versions?.[version];
    const firmwareInfo = versionData?.models?.[model]?.variants?.[variant];
    
    if (!firmwareInfo) {
      Utils?.toast?.('Firmware not found', 'error');
      return;
    }
    
    try {
      const url = `/dl/${firmwareInfo.path}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = firmwareInfo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      Utils?.toast?.('Firmware downloaded', 'success');
    } catch (error) {
      Utils?.toast?.('Download failed: ' + error.message, 'error');
    }
  },
  
  /**
   * Flash MK22 firmware from library
   */
  async flashMK22FromLibrary() {
    const { model, version, variant, language, donorSource } = this.selectedMK22;
    
    if (!model || !version || !variant) {
      Utils?.toast?.('Please select radio, version, and variant', 'warning');
      return;
    }
    
    if (!window.radioUSB?.connected || !window.radioUSB?.isInDFUMode) {
      Utils?.toast?.('Connect to radio in DFU mode first', 'warning');
      return;
    }
    
    const versionData = this.manifest?.radioTypes?.MK22?.versions?.[version];
    const firmwareInfo = versionData?.models?.[model]?.variants?.[variant];
    
    if (!firmwareInfo) {
      Utils?.toast?.('Firmware not found', 'error');
      return;
    }
    
    // Show progress
    const progressEl = document.getElementById('firmwareProgress');
    const progressBar = document.getElementById('firmwareProgressBar');
    const progressText = document.getElementById('firmwareProgressText');
    progressEl.style.display = '';
    progressBar.style.width = '0%';
    progressText.textContent = 'Downloading firmware...';
    
    try {
      // Download firmware
      const firmwareUrl = `/dl/${firmwareInfo.path}`;
      const firmwareResponse = await fetch(firmwareUrl);
      
      if (!firmwareResponse.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const firmwareData = new Uint8Array(await firmwareResponse.arrayBuffer());
      
      progressBar.style.width = '5%';
      progressText.textContent = 'Firmware downloaded...';
      
      // Get donor data based on donor source selection
      let donorData = null;
      
      if (donorSource === 'builtin' && this.manifest?.donor?.MK22?.path) {
        progressText.textContent = 'Loading donor firmware...';
        const donorUrl = `/dl/${this.manifest.donor.MK22.path}`;
        const donorResponse = await fetch(donorUrl);
        
        if (!donorResponse.ok) {
          throw new Error('Failed to load built-in donor firmware');
        }
        
        donorData = new Uint8Array(await donorResponse.arrayBuffer());
        progressBar.style.width = '10%';
        progressText.textContent = 'Donor firmware loaded...';
      } else if (donorSource === 'custom') {
        // Use custom donor file
        const donorFile = document.getElementById('firmwareMK22DonorFile')?.files?.[0];
        if (donorFile) {
          donorData = new Uint8Array(await donorFile.arrayBuffer());
          progressBar.style.width = '10%';
          progressText.textContent = 'Custom donor firmware loaded...';
        }
      }
      // If donorSource === 'none', donorData stays null
      
      progressBar.style.width = '15%';
      progressText.textContent = 'Starting upload...';
      
      // Download language file if not English
      let languageData = null;
      if (language && language !== 'en' && versionData.hasLanguages) {
        const langInfo = this.manifest.languages.find(l => l.code === language);
        if (langInfo?.file) {
          const langUrl = `/dl/${versionData.languagesPath}/${langInfo.file}`;
          try {
            const langResponse = await fetch(langUrl);
            if (langResponse.ok) {
              languageData = new Uint8Array(await langResponse.arrayBuffer());
              progressText.textContent = 'Language file downloaded...';
            }
          } catch (e) {
            console.warn('Failed to download language file:', e);
          }
        }
      }
      
      // Merge the additional language into the (unencrypted) firmware image
      if (languageData) {
        try {
          window.radioUSB.mergeLanguageFile(firmwareData, languageData);
          progressText.textContent = 'Language merged...';
        } catch (e) {
          console.warn('Failed to merge language:', e);
          Utils?.toast?.('Language merge failed: ' + e.message, 'warning');
        }
      }
      
      // Flash firmware - pass model name for correct encryption key and donor data
      // Model names: 'GD-77', 'GD-77S', 'DM-1801', 'RD-5R'
      const eta = Utils.createEtaTracker();
      window.App?.setActivity('busy', 'Uploading firmware...');
      await window.radioUSB.writeFirmwareMK22(firmwareData, model, (progress, message) => {
        const adjustedProgress = 15 + (progress * 0.80);
        progressBar.style.width = `${adjustedProgress}%`;
        progressText.textContent = (message || `Uploading: ${Math.round(progress)}%`) + eta.update(progress);
      }, donorData);
      
      progressBar.style.width = '100%';
      progressText.textContent = 'Firmware upload complete!';
      window.App?.setActivity('idle');
      Utils?.toast?.('Firmware uploaded successfully!', 'success');
      
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 3000);
      
    } catch (error) {
      progressText.textContent = 'Upload failed: ' + error.message;
      window.App?.setActivity('error');
      Utils?.toast?.('Firmware upload failed: ' + error.message, 'error');
    }
  },
  
  // ========== STM32 Handlers ==========
  
  /**
   * Handle STM32 radio type selection
   */
  onSTM32RadioTypeChange(radioType) {
    this.selectedSTM32.radioType = radioType;
    this.selectedSTM32.version = null;
    this.selectedSTM32.model = null;
    this.selectedSTM32.variant = null;
    
    const versionSelect = document.getElementById('stm32FirmwareVersion');
    const variantSelect = document.getElementById('stm32FirmwareVariant');
    
    // Clear dependent selects
    variantSelect.innerHTML = '<option value="">-- Select Model --</option>';
    variantSelect.disabled = true;
    
    if (!radioType) {
      versionSelect.innerHTML = '<option value="">-- Select Version --</option>';
      versionSelect.disabled = true;
      this.updateSTM32FlashButton();
      return;
    }
    
    // Populate versions
    const typeData = this.manifest?.radioTypes?.[radioType];
    const versions = typeData?.versions || {};
    
    if (Object.keys(versions).length === 0) {
      versionSelect.innerHTML = '<option value="">No versions available</option>';
      versionSelect.disabled = true;
    } else {
      versionSelect.innerHTML = '<option value="">-- Select Version --</option>' +
        Object.entries(versions).map(([key, data]) => 
          `<option value="${key}">${data.display}</option>`
        ).join('');
      versionSelect.disabled = false;
    }
    
    this.updateSTM32FlashButton();
  },
  
  /**
   * Handle STM32 firmware version selection
   */
  onSTM32VersionChange(version) {
    this.selectedSTM32.version = version;
    this.selectedSTM32.model = null;
    this.selectedSTM32.variant = null;
    
    const variantSelect = document.getElementById('stm32FirmwareVariant');
    
    if (!version || !this.selectedSTM32.radioType) {
      variantSelect.innerHTML = '<option value="">-- Select Model --</option>';
      variantSelect.disabled = true;
      this.updateSTM32FlashButton();
      return;
    }
    
    // Get models for this version
    const versionData = this.manifest?.radioTypes?.[this.selectedSTM32.radioType]?.versions?.[version];
    const models = versionData?.models || {};
    
    if (Object.keys(models).length === 0) {
      variantSelect.innerHTML = '<option value="">No models available</option>';
      variantSelect.disabled = true;
    } else {
      // Build options with model and variant combined
      const options = [];
      for (const [modelKey, modelData] of Object.entries(models)) {
        const displayName = modelData.displayName || this.manifest?.radioTypes?.[this.selectedSTM32.radioType]?.models?.[modelKey] || modelKey;
        
        for (const [variantKey, variantData] of Object.entries(modelData.variants || {})) {
          const optionValue = `${modelKey}|${variantKey}`;
          const optionLabel = `${displayName} - ${variantData.variantDisplay}`;
          options.push(`<option value="${optionValue}">${optionLabel}</option>`);
        }
      }
      
      variantSelect.innerHTML = '<option value="">-- Select Model & Variant --</option>' + options.join('');
      variantSelect.disabled = false;
    }
    
    this.updateSTM32FlashButton();
  },
  
  /**
   * Handle STM32 model/variant selection
   */
  onSTM32VariantChange(value) {
    if (!value) {
      this.selectedSTM32.model = null;
      this.selectedSTM32.variant = null;
    } else {
      const [model, variant] = value.split('|');
      this.selectedSTM32.model = model;
      this.selectedSTM32.variant = variant;
    }
    
    this.updateSTM32FlashButton();
  },
  
  /**
   * Update STM32 download and flash button states
   */
  updateSTM32FlashButton() {
    const downloadBtn = document.getElementById('downloadSTM32FirmwareBtn');
    const flashBtn = document.getElementById('flashSTM32LibraryBtn');
    
    const hasSelection = this.selectedSTM32.radioType && 
                         this.selectedSTM32.version && 
                         this.selectedSTM32.model && 
                         this.selectedSTM32.variant;
    
    // For download, just need selection
    if (downloadBtn) downloadBtn.disabled = !hasSelection;
    
    // For flash, need selection; donor is now optional (can be 'none')
    // donorReady indicates whether donor requirement is satisfied (true if 'none', builtin exists, or custom file selected)
    let donorReady = true;  // 'none' is valid - no donor needed
    const donorSource = this.selectedSTM32.donorSource;
    
    if (donorSource === 'builtin') {
      donorReady = this.manifest?.donor?.STM32?.exists;
    } else if (donorSource === 'custom') {
      const donorFile = document.getElementById('firmwareSTM32DonorFile')?.files?.[0];
      donorReady = !!donorFile;
    }
    // 'none' means no donor is needed, so donorReady stays true
    
    if (flashBtn) flashBtn.disabled = !(hasSelection && donorReady);
  },
  
  /**
   * Check if STM32 custom panel is ready to flash
   */
  checkSTM32CustomReady() {
    const firmwareFile = document.getElementById('firmwareSTM32File')?.files?.[0];
    const uploadBtn = document.getElementById('uploadSTM32FirmwareBtn');
    
    // Check if donor requirement is satisfied (none, built-in exists, or custom file selected)
    let donorReady = true;  // 'none' is valid - no donor needed
    const donorSource = this.selectedSTM32.donorSourceCustomPanel;
    
    if (donorSource === 'builtin') {
      donorReady = this.manifest?.donor?.STM32?.exists;
    } else if (donorSource === 'custom') {
      const donorFile = document.getElementById('firmwareSTM32DonorFileCustom')?.files?.[0];
      donorReady = !!donorFile;
    }
    // 'none' means no donor is needed, so donorReady stays true
    
    if (uploadBtn) {
      uploadBtn.disabled = !(donorReady && firmwareFile);
    }
  },
  
  /**
   * Download selected STM32 firmware
   */
  async downloadSTM32Firmware() {
    const { radioType, version, model, variant } = this.selectedSTM32;
    
    if (!radioType || !version || !model || !variant) {
      Utils?.toast?.('Please complete all selections', 'warning');
      return;
    }
    
    const versionData = this.manifest?.radioTypes?.[radioType]?.versions?.[version];
    const firmwareInfo = versionData?.models?.[model]?.variants?.[variant];
    
    if (!firmwareInfo) {
      Utils?.toast?.('Firmware not found', 'error');
      return;
    }
    
    try {
      const url = `/dl/${firmwareInfo.path}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = firmwareInfo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      Utils?.toast?.('Firmware downloaded', 'success');
    } catch (error) {
      Utils?.toast?.('Download failed: ' + error.message, 'error');
    }
  },
  
  /**
   * Flash STM32 firmware from library
   */
  async flashSTM32FromLibrary() {
    const { radioType, version, model, variant, language, donorSource } = this.selectedSTM32;
    
    if (!radioType || !version || !model || !variant) {
      Utils?.toast?.('Please complete all selections', 'warning');
      return;
    }
    
    if (!window.radioUSB?.connected || !window.radioUSB?.isInDFUMode) {
      Utils?.toast?.('Connect to radio in DFU mode first', 'warning');
      return;
    }
    
    const typeData = this.manifest?.radioTypes?.[radioType];
    const versionData = typeData?.versions?.[version];
    const firmwareInfo = versionData?.models?.[model]?.variants?.[variant];
    
    if (!firmwareInfo) {
      Utils?.toast?.('Firmware not found', 'error');
      return;
    }
    
    // Show progress
    const progressEl = document.getElementById('firmwareProgress');
    const progressBar = document.getElementById('firmwareProgressBar');
    const progressText = document.getElementById('firmwareProgressText');
    progressEl.style.display = '';
    progressBar.style.width = '0%';
    progressText.textContent = 'Downloading firmware...';
    
    try {
      // Download firmware
      const firmwareUrl = `/dl/${firmwareInfo.path}`;
      const firmwareResponse = await fetch(firmwareUrl);
      
      if (!firmwareResponse.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const firmwareData = new Uint8Array(await firmwareResponse.arrayBuffer());
      
      progressBar.style.width = '5%';
      progressText.textContent = 'Firmware downloaded...';
      
      // Get donor data based on donor source selection
      let donorData = null;
      
      if (donorSource === 'builtin' && this.manifest?.donor?.STM32?.path) {
        progressText.textContent = 'Loading donor firmware...';
        const donorUrl = `/dl/${this.manifest.donor.STM32.path}`;
        const donorResponse = await fetch(donorUrl);
        
        if (!donorResponse.ok) {
          throw new Error('Failed to load built-in donor firmware');
        }
        
        donorData = new Uint8Array(await donorResponse.arrayBuffer());
      } else if (donorSource === 'custom') {
        // Use custom donor file
        const donorFile = document.getElementById('firmwareSTM32DonorFile')?.files?.[0];
        if (donorFile) {
          donorData = new Uint8Array(await donorFile.arrayBuffer());
        }
      }
      // If donorSource === 'none', donorData stays null
      
      // Download the additional language and merge it into the unencrypted
      // firmware image before it is ciphered/flashed.
      if (language && language !== 'en' && versionData.hasLanguages) {
        const langInfo = this.manifest.languages.find(l => l.code === language);
        if (langInfo?.file) {
          try {
            const langUrl = `/dl/${versionData.languagesPath}/${langInfo.file}`;
            const langResponse = await fetch(langUrl);
            if (langResponse.ok) {
              const languageData = new Uint8Array(await langResponse.arrayBuffer());
              window.radioUSB.mergeLanguageFile(firmwareData, languageData);
              progressText.textContent = 'Language merged...';
            }
          } catch (e) {
            console.warn('Failed to download/merge language file:', e);
            Utils?.toast?.('Language merge failed: ' + e.message, 'warning');
          }
        }
      }
      
      progressBar.style.width = '10%';
      progressText.textContent = 'Starting firmware upload...';
      
      // Determine cipher type - check model-level first, then fall back to radio type-level
      // This is critical for DM-1701/RT-84 which need DM1701 cipher, not MDUV380
      const modelData = versionData?.models?.[model];
      const cipherType = modelData?.cipherType || typeData?.cipherType || 'MDUV380';
      
      // Flash firmware using the STM32 DFU method with donor firmware
      const eta = Utils.createEtaTracker();
      window.App?.setActivity('busy', 'Uploading firmware...');
      await window.radioUSB.writeFirmwareSTM32DFU(firmwareData, cipherType, (progress, message) => {
        const adjustedProgress = 10 + (progress * 0.85);
        progressBar.style.width = `${adjustedProgress}%`;
        const etaSuffix = eta.update(progress);
        progressText.textContent = (message || `Uploading: ${Math.round(progress)}%`) + etaSuffix;
        if (window.App?.updateStatus) {
          window.App.updateStatus((message || `Flashing firmware ${Math.round(progress)}%`) + etaSuffix);
        }
      }, donorData);
      
      progressBar.style.width = '100%';
      progressText.textContent = 'Firmware upload complete!';
      window.App?.setActivity('idle');
      Utils?.toast?.('Firmware uploaded successfully!', 'success');
      
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 3000);
      
    } catch (error) {
      progressText.textContent = 'Upload failed: ' + error.message;
      window.App?.setActivity('error');
      Utils?.toast?.('Firmware upload failed: ' + error.message, 'error');
    }
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => FirmwareManager.init());
} else {
  FirmwareManager.init();
}

// Export for global access
window.FirmwareManager = FirmwareManager;
