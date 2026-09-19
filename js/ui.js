/**
 * OpenGD77 CPS Web - UI Module
 * 
 * Handles all UI rendering and interactions.
 */

/**
 * Safely convert SOAP response values to arrays.
 * Handles arrays, objects with .item property (SOAP-ENC:Array), 
 * single objects, and null/undefined values.
 */
function _rrToArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && v.item) return Array.isArray(v.item) ? v.item : [v.item];
  if (v != null && typeof v === 'object') return [v];
  return [];
}

const UI = {
  currentSection: 'overview',
  channelGroupByZone: false,
  _lastClickedDualListItem: {},
  _tleUpdatedThisSession: false,
  
  /**
   * Handle shift+click range selection for dual-list items.
   * @param {string} listKey - Unique key for the list (e.g. 'tglistAvailable')
   * @param {string} id - The clicked item's ID
   * @param {Event} event - The click event
   * @param {Array} selectionArray - The current selection array (modified in place)
   * @param {Array} allIds - All item IDs in display order
   */
  _handleDualListClick(listKey, id, event, selectionArray, allIds) {
    if (event && event.shiftKey && this._lastClickedDualListItem[listKey] != null) {
      const lastId = this._lastClickedDualListItem[listKey];
      const startIdx = allIds.indexOf(lastId);
      const endIdx = allIds.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        for (let i = from; i <= to; i++) {
          if (!selectionArray.includes(allIds[i])) {
            selectionArray.push(allIds[i]);
          }
        }
        this._lastClickedDualListItem[listKey] = id;
        return;
      }
    }
    // Normal toggle
    const index = selectionArray.indexOf(id);
    if (index === -1) {
      selectionArray.push(id);
    } else {
      selectionArray.splice(index, 1);
    }
    this._lastClickedDualListItem[listKey] = id;
  },

  /**
   * Initialize UI
   */
  init() {
    // Bind each step independently so one failure can't stop the others (e.g. a
    // single bad element must not prevent the mobile menu from being wired up).
    const step = (name, fn) => {
      try { fn.call(this); } catch (e) { console.error(`UI.init: ${name} failed`, e); }
    };
    step('bindNavigation', this.bindNavigation);
    step('bindHeaderButtons', this.bindHeaderButtons);
    step('bindMobileMenu', this.bindMobileMenu);
    step('bindModals', this.bindModals);
    step('bindFileInputs', this.bindFileInputs);
    step('bindGeneralSettings', this.bindGeneralSettings);
    step('bindBootSettingsEvents', this.bindBootSettingsEvents);
    step('initChannelColumnPicker', this.initChannelColumnPicker);
    step('restoreLastSection', this.restoreLastSection);
    step('updateOverview', this.updateOverview);
    step('updateUIForRadioType', this.updateUIForRadioType);
    this.hideLoading();
  },

  /**
   * Restore the last viewed section so refreshing stays on the same page.
   */
  restoreLastSection() {
    const last = Utils.storage.get(CONFIG.STORAGE.LAST_SECTION);
    const target = (typeof last === 'string' && document.getElementById(`section-${last}`)) ? last : 'overview';
    this.showSection(target);
  },

  /**
   * Hide loading screen
   */
  hideLoading() {
    setTimeout(() => {
      document.getElementById('loadingScreen').classList.add('hidden');
    }, 500);
  },

  /**
   * Update UI elements based on the current radio type
   * Hides/shows features that are not supported on certain radio types
   */
  updateUIForRadioType() {
    const radioType = window.radioUSB?.radioType || CONFIG.RADIO_TYPES.MK22;
    // DM-32 / UV-32 (C7000) behave like the STM32 radios for these features
    const isSTM32 = radioType === CONFIG.RADIO_TYPES.STM32 ||
                    radioType === CONFIG.RADIO_TYPES.DM32;
    
    // Scan lists are not fully implemented on any radio - hide entirely
    const scanListsNavItem = document.querySelector('.nav-item[data-section="scan-lists"]');
    const scanListsSection = document.getElementById('section-scan-lists');
    
    if (scanListsNavItem) {
      scanListsNavItem.style.display = 'none';
    }
    if (scanListsSection) {
      scanListsSection.style.display = 'none';
    }
    
    // If currently viewing scan-lists section, switch to overview
    if (this.currentSection === 'scan-lists') {
      this.showSection('overview');
    }
    
    // Backup/Restore Flash not fully supported on STM32 - hide for now
    const backupFlashBtn = document.getElementById('backupFlashBtn');
    const restoreFlashFile = document.getElementById('restoreFlashFile');
    
    if (backupFlashBtn) {
      const backupFlashCard = backupFlashBtn.closest('.card');
      if (backupFlashCard) {
        backupFlashCard.style.display = isSTM32 ? 'none' : '';
      }
    }
    if (restoreFlashFile) {
      const restoreFlashCard = restoreFlashFile.closest('.card');
      if (restoreFlashCard) {
        restoreFlashCard.style.display = isSTM32 ? 'none' : '';
      }
    }
    
    // Voice prompts supported on both MK22 and STM32 via flash sector write cycle
    const voicePromptsFile = document.getElementById('voicePromptsFile');
    if (voicePromptsFile) {
      const voicePromptsCard = voicePromptsFile.closest('.card');
      if (voicePromptsCard) {
        voicePromptsCard.style.display = '';
      }
    }
    
    // Dev mode: show extended channel option
    const extChannelGroup = document.getElementById('extendedChannelGroup');
    if (extChannelGroup) {
      extChannelGroup.style.display = DEV_MODE ? '' : 'none';
    }
    
    // Extended channel mode: hide DMRID and Voice Prompt features
    if (EXTENDED_CHANNEL_MODE) {
      // Hide DMRID nav item
      const dmridNav = document.querySelector('[data-section="dmrid"]');
      if (dmridNav) dmridNav.style.display = 'none';
      
      // Hide voice prompts card
      if (voicePromptsFile) {
        const voicePromptsCard = voicePromptsFile.closest('.card');
        if (voicePromptsCard) {
          voicePromptsCard.style.display = 'none';
        }
      }
    }
    
    // Screen grab is available on STM32 radios only
    const screenGrabBtn = document.getElementById('downloadScreenGrabBtn');
    if (screenGrabBtn) {
      const screenGrabCard = screenGrabBtn.closest('.card');
      if (screenGrabCard) {
        screenGrabCard.style.display = isSTM32 ? '' : 'none';
      }
    }

    // DM32/UV008 (C7000): show the SPI flash tool, and use the dedicated
    // firmware card (no donor firmware and no additional language packs).
    const isDM32 = radioType === CONFIG.RADIO_TYPES.DM32;
    const dm32FlashCard = document.getElementById('dm32FlashCard');
    if (dm32FlashCard) dm32FlashCard.style.display = isDM32 ? '' : 'none';
    const dm32FirmwareCard = document.getElementById('dm32FirmwareCard');
    if (dm32FirmwareCard) dm32FirmwareCard.style.display = isDM32 ? '' : 'none';
    const mk22FirmwareCard = document.getElementById('mk22FirmwareCard');
    if (mk22FirmwareCard) mk22FirmwareCard.style.display = isDM32 ? 'none' : '';
    const stm32FirmwareCard = document.getElementById('stm32FirmwareCard');
    if (stm32FirmwareCard) stm32FirmwareCard.style.display = isDM32 ? 'none' : '';
  },

  /**
   * Show a section
   */
  showSection(sectionId) {
    if (window.App?._radioLock === 'write' && sectionId !== this.currentSection) {
      Utils.toast('Writing to the radio - please wait before changing pages', 'warning');
      return;
    }
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(s => {
      s.classList.remove('active');
    });
    
    // Show target section
    const section = document.getElementById(`section-${sectionId}`);
    if (section) {
      section.classList.add('active');
      this.currentSection = sectionId;
      // Remember it so a refresh returns to the same page.
      Utils.storage.set(CONFIG.STORAGE.LAST_SECTION, sectionId);
    }
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.section === sectionId) {
        item.classList.add('active');
      }
    });
    
    // Load section-specific data
    this.loadSectionData(sectionId);
  },

  /**
   * Load data for a section
   */
  loadSectionData(sectionId) {
    switch (sectionId) {
      case 'overview':
        // Overview section - refresh dashboard statistics
        this.updateOverview();
        break;
      case 'channels':
        this.renderChannelsTable();
        break;
      case 'contacts':
        this.renderContactsTable();
        break;
      case 'tglists':
        this.renderTGLists();
        break;
      case 'zones':
        this.renderZones();
        break;
      case 'aprs':
        this.renderAPRS();
        break;
      case 'dtmf':
        this.renderDTMF();
        break;
      case 'scan-lists':
        this.renderScanLists();
        break;
      case 'satellites':
        this.renderSatellites();
        break;
      case 'repeaters':
        this.loadRepeaters();
        break;
      case 'dmr-repeaters':
        this.loadDMRRepeaters();
        break;
      case 'repeater-map':
        this.initRepeaterMap();
        break;
      case 'dmrid':
        this.loadDMRDatabase();
        break;
      case 'boot-settings':
        this.loadBootSettings();
        break;
      case 'vfo':
        this.renderVFO();
        break;
      case 'band-limits':
        this.renderBandLimits();
        break;
      case 'theme-editor':
        this.loadThemeEditor();
        break;
      case 'radio-tools':
        this.bindRadioTools();
        break;
      case 'radio-settings':
        if (window.RadioSettingsUI) window.RadioSettingsUI.renderEditor();
        break;
      case 'clone-radio':
        if (window.RadioSettingsUI) window.RadioSettingsUI.renderClone();
        break;
      case 'shared-library':
        App.loadSharedLibraryPage();
        break;
      case 'my-codeplugs':
        App.loadMyCodeplugsPage();
        break;
      case 'import-csv':
        // Import CSV section - file inputs handle the actual import
        // No additional data loading needed as the section is static
        break;
      case 'wtr-import':
        this.initWTR();
        break;
      case 'general':
        // General settings section - populate form with current codeplug data
        this.populateGeneralSettings();
        break;
      case 'firmware':
        // Firmware section - UI is pre-rendered, file inputs handle firmware upload
        // No additional data loading needed
        break;
    }
  },

  /**
   * Bind navigation events
   */
  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (section) {
          this.showSection(section);
          // Close sidebar on mobile after navigation
          this.closeMobileSidebar();
        }
      });
    });
    
    // Quick action buttons
    document.querySelectorAll('.action-card').forEach(card => {
      card.addEventListener('click', () => {
        const action = card.dataset.action;
        this.handleQuickAction(action);
      });
    });
  },

  /**
   * Bind mobile menu toggle events
   */
  bindMobileMenu() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuBtn && sidebar) {
      // Toggle sidebar on menu button click
      menuBtn.addEventListener('click', () => {
        this.toggleMobileSidebar();
      });
    }
    
    if (overlay) {
      // Close sidebar when clicking overlay
      overlay.addEventListener('click', () => {
        this.closeMobileSidebar();
      });
    }
    
    // Close sidebar on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMobileSidebar();
      }
    });
    
    // Handle window resize - close sidebar when switching to desktop
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth > 1024) {
          this.closeMobileSidebar();
        }
      }, 150);
    });
  },

  /**
   * Toggle mobile sidebar visibility
   */
  toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn');
    
    if (sidebar) {
      const isOpen = sidebar.classList.toggle('open');
      overlay?.classList.toggle('active', isOpen);
      
      // Update button icon
      if (menuBtn) {
        const icon = menuBtn.querySelector('i');
        if (icon) {
          icon.className = isOpen ? 'mdi mdi-close' : 'mdi mdi-menu';
        }
      }
      
      // Prevent body scroll when sidebar is open on mobile
      document.body.style.overflow = isOpen ? 'hidden' : '';
    }
  },

  /**
   * Close mobile sidebar
   */
  closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn');
    
    if (sidebar) {
      sidebar.classList.remove('open');
      overlay?.classList.remove('active');
      
      // Reset button icon
      if (menuBtn) {
        const icon = menuBtn.querySelector('i');
        if (icon) {
          icon.className = 'mdi mdi-menu';
        }
      }
      
      // Restore body scroll
      document.body.style.overflow = '';
    }
  },

  /**
   * Handle quick actions
   */
  handleQuickAction(action) {
    switch (action) {
      case 'import-repeaters':
        this.showSection('repeaters');
        break;
      case 'import-dmr':
        this.showSection('dmrid');
        document.getElementById('downloadDMRDBBtn')?.click();
        break;
      case 'import-csv':
        this.showSection('import-csv');
        break;
      case 'browse-library':
        this.showSection('shared-library');
        break;
    }
  },

  /**
   * Bind header button events
   */
  bindHeaderButtons() {
    // Connect radio
    document.getElementById('connectRadioBtn')?.addEventListener('click', () => {
      App.connectRadio();
    });
    
    // Read codeplug
    document.getElementById('readCodeplugBtn')?.addEventListener('click', () => {
      App.readFromRadio();
    });
    
    // Write codeplug
    document.getElementById('writeCodeplugBtn')?.addEventListener('click', () => {
      App.writeToRadio();
    });
    
    // Open file
    document.getElementById('openFileBtn')?.addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    // Changelog badge in the header (lives inside the brand link, so stop the
    // click from navigating home)
    const changelogBadge = document.getElementById('changelogBadge');
    if (changelogBadge) {
      const openChangelog = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showChangelog();
      };
      changelogBadge.addEventListener('click', openChangelog);
      changelogBadge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openChangelog(e);
      });
    }
    
    // Save file
    document.getElementById('saveFileBtn')?.addEventListener('click', () => {
      App.saveCodeplugFile();
    });
    
    // Save to cloud (My Codeplugs)
    document.getElementById('saveCloudBtn')?.addEventListener('click', () => {
      App.saveCodeplugToCloud();
    });
    
    // Export G77 binary file
    document.getElementById('exportG77Btn')?.addEventListener('click', () => {
      App.exportG77File();
    });

    // Theme toggle (light / dark); preference stored under 'gridradio-theme'
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      const themeIcon = document.getElementById('themeToggleIcon');
      const syncThemeIcon = () => {
        const dark = document.documentElement.getAttribute('data-theme') !== 'light';
        if (themeIcon) themeIcon.className = 'mdi ' + (dark ? 'mdi-weather-sunny' : 'mdi-weather-night');
      };
      syncThemeIcon();
      themeBtn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('gridradio-theme', next); } catch (e) { /* ignore */ }
        syncThemeIcon();
        window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
        if (typeof UI.applyMapTheme === 'function') UI.applyMapTheme();
      });
    }
    
    // New codeplug
    document.getElementById('newCodeplugBtn')?.addEventListener('click', () => {
      App.newCodeplug();
    });
    
    // User menu
    document.getElementById('userBtn')?.addEventListener('click', () => {
      document.getElementById('userDropdown').classList.toggle('active');
    });
    
    // Close user menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.remove('active');
      }
    });
    
    // Login button
    document.getElementById('loginBtn')?.addEventListener('click', () => {
      App.showLoginModal();
    });
    
    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      App.logout();
    });
    
    // Edit profile button
    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
      App.showEditProfileModal();
    });
    
    // My codeplugs
    document.getElementById('myCodeplugsBtn')?.addEventListener('click', () => {
      App.showMyCodeplugs();
    });
    
    // Shared library
    document.getElementById('sharedLibraryBtn')?.addEventListener('click', () => {
      App.showSharedLibrary();
    });
    
    // Add channel buttons
    document.getElementById('addChannelBtn')?.addEventListener('click', () => {
      this.showChannelEditor();
    });
    document.getElementById('addFirstChannelBtn')?.addEventListener('click', () => {
      this.showChannelEditor();
    });
    
    // Add contact buttons
    document.getElementById('addContactBtn')?.addEventListener('click', () => {
      this.showContactEditor();
    });
    document.getElementById('addFirstContactBtn')?.addEventListener('click', () => {
      this.showContactEditor();
    });
    
    // Add TG list buttons
    document.getElementById('addTGListBtn')?.addEventListener('click', () => {
      this.showTGListEditor();
    });
    document.getElementById('addFirstTGListBtn')?.addEventListener('click', () => {
      this.showTGListEditor();
    });
    document.getElementById('importTGListBtn')?.addEventListener('click', () => {
      this.showTalkgroupImport();
    });

    // Header Import buttons open the matching hidden CSV file pickers
    document.getElementById('importChannelsBtn')?.addEventListener('click', () => {
      document.getElementById('importChannelsFile')?.click();
    });
    document.getElementById('importContactsBtn')?.addEventListener('click', () => {
      document.getElementById('importContactsFile')?.click();
    });
    
    // Add zone buttons
    document.getElementById('addZoneBtn')?.addEventListener('click', () => {
      this.showZoneEditor();
    });
    document.getElementById('addFirstZoneBtn')?.addEventListener('click', () => {
      this.showZoneEditor();
    });
    
    // Add scan list buttons
    document.getElementById('addScanListBtn')?.addEventListener('click', () => {
      this.showScanListEditor();
    });
    document.getElementById('addFirstScanListBtn')?.addEventListener('click', () => {
      this.showScanListEditor();
    });
    
    // Export channels
    document.getElementById('exportChannelsBtn')?.addEventListener('click', () => {
      this.exportChannels();
    });

    // Group by Zone toggle
    document.getElementById('groupByZoneBtn')?.addEventListener('click', () => {
      this.toggleChannelGroupByZone();
    });

    // Channels: column picker + sortable headers
    document.getElementById('channelColumnsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleChannelColumnsMenu();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#channelColumnsPicker')) this.toggleChannelColumnsMenu(false);
    });
    const channelSortClick = (e) => {
      const th = e.target.closest('th.sortable');
      if (th && th.dataset.sort) this.toggleChannelSort(th.dataset.sort);
    };
    document.getElementById('channelsTable')?.addEventListener('click', channelSortClick);
    document.getElementById('channelsGroupedByZone')?.addEventListener('click', channelSortClick);
    
    // Load DMR DB from a local CSV file
    document.getElementById('downloadDMRDBBtn')?.addEventListener('click', () => {
      document.getElementById('dmrDbFileInput')?.click();
    });
    document.getElementById('dmrDbFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        UI.importDMRDatabaseCSV(e.target.files[0]);
        e.target.value = '';
      }
    });
    
    // Write DMR DB to Radio
    document.getElementById('writeDMRDBBtn')?.addEventListener('click', () => {
      UI.writeDMRDatabaseToRadio();
    });
    
    // DMR ID pagination buttons
    document.getElementById('dmrPrevPage')?.addEventListener('click', () => {
      UI.dmrPrevPage();
    });
    document.getElementById('dmrNextPage')?.addEventListener('click', () => {
      UI.dmrNextPage();
    });
    
    // DMR ID callsign length selector - now using data record length
    document.getElementById('dmrDataRecordLength')?.addEventListener('change', (e) => {
      this.updateDMRStorageInfo();
    });
    
    // DMR Radio type selector for storage calculation
    document.getElementById('dmrRadioType')?.addEventListener('change', (e) => {
      this.updateDMRStorageInfo();
    });
    
    // DMR Use VP Memory checkbox
    document.getElementById('dmrUseVPMemory')?.addEventListener('change', (e) => {
      this.updateDMRStorageInfo();
    });

    // DMR region preset (populates the country filter)
    document.getElementById('dmrRegionFilter')?.addEventListener('change', () => {
      this.onDMRRegionChange();
    });
    document.getElementById('dmrDbCountryFilter')?.addEventListener('change', () => {
      const region = document.getElementById('dmrRegionFilter');
      if (region) region.value = 'custom';
      UI.onDMRRegionChange();
    });

    // Auto-fit text length toggle
    document.getElementById('dmrAutoLength')?.addEventListener('change', () => {
      this.updateDMRStorageInfo();
    });
    
    // Initialize DMR storage info on load
    this.updateDMRStorageInfo();
    
    // Refresh repeaters
    document.getElementById('refreshRepeatersBtn')?.addEventListener('click', () => {
      UI.loadRepeaters(true);
    });
    
    // Import selected repeaters
    document.getElementById('importSelectedRepeatersBtn')?.addEventListener('click', () => {
      UI.importSelectedRepeaters();
    });
    
    // DMR Repeaters - load from a local file
    document.getElementById('refreshDMRRepeatersBtn')?.addEventListener('click', () => {
      document.getElementById('dmrRepeaterFileInput')?.click();
    });
    document.getElementById('dmrRepeaterFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        UI.importDMRRepeatersFile(e.target.files[0]);
        e.target.value = '';
      }
    });
    
    document.getElementById('importSelectedDMRRepeatersBtn')?.addEventListener('click', () => {
      UI.importSelectedDMRRepeaters();
    });
    
    // Repeater Map button
    document.getElementById('refreshRepeaterMapBtn')?.addEventListener('click', () => {
      UI.updateRepeaterMap();
    });
    
    // Import visible repeaters from map
    document.getElementById('importMapRepeatersBtn')?.addEventListener('click', () => {
      UI.importMapRepeaters();
    });
    
    // Radio type selectors - sync header and mobile versions
    const handleRadioTypeChange = (value, otherSelectId) => {
      if (window.App?._radioLock) {
        Utils.toast('Radio is busy - please wait for the current operation to finish', 'warning');
        return;
      }
      if (window.radioUSB?.connected) {
        Utils.toast('Disconnect from the radio before changing its type', 'warning');
        const current = window.radioUSB.getRadioType();
        const a = document.getElementById('radioTypeSelect');
        const b = document.getElementById('mobileRadioTypeSelect');
        if (a) a.value = current;
        if (b) b.value = current;
        return;
      }
      window.radioUSB.setRadioType(value);
      const otherSelect = document.getElementById(otherSelectId);
      if (otherSelect) otherSelect.value = value;
      Utils.toast(`Radio type set to ${value}`, 'info');
      // Update UI to hide/show features based on radio type
      this.updateUIForRadioType();
    };
    
    document.getElementById('radioTypeSelect')?.addEventListener('change', (e) => {
      handleRadioTypeChange(e.target.value, 'mobileRadioTypeSelect');
    });
    
    document.getElementById('mobileRadioTypeSelect')?.addEventListener('change', (e) => {
      handleRadioTypeChange(e.target.value, 'radioTypeSelect');
    });
    
    // Satellite buttons
    document.getElementById('loadDefaultSatsBtn')?.addEventListener('click', () => {
      this.showLoadDefaultsModal();
    });
    document.getElementById('clearSatellitesBtn')?.addEventListener('click', () => {
      this.clearSatellites();
    });
    
    document.getElementById('updateTLEsBtn')?.addEventListener('click', () => {
      this.updateSatelliteTLEs();
    });
    
    document.getElementById('writeSatsToRadioBtn')?.addEventListener('click', () => {
      this.writeSatellitesToRadio();
    });
    
    document.getElementById('addSatelliteBtn')?.addEventListener('click', () => {
      this.showSatelliteEditor();
    });
    
    document.getElementById('importSatCSVBtn')?.addEventListener('click', () => {
      document.getElementById('satCSVInput').click();
    });
    
    document.getElementById('exportSatCSVBtn')?.addEventListener('click', () => {
      this.exportSatellitesCSV();
    });
    
    // DTMF buttons
    document.getElementById('addDtmfBtn')?.addEventListener('click', () => {
      this.showDTMFEditor();
    });
    
    document.getElementById('importDtmfCSVBtn')?.addEventListener('click', () => {
      document.getElementById('dtmfCSVInput').click();
    });
    
    document.getElementById('exportDtmfCSVBtn')?.addEventListener('click', () => {
      this.exportDTMFCSV();
    });
    
    // APRS buttons
    document.getElementById('addAprsConfigBtn')?.addEventListener('click', () => {
      this.showAPRSEditor();
    });
    
    document.getElementById('importAprsCSVBtn')?.addEventListener('click', () => {
      document.getElementById('aprsCSVInput').click();
    });
    
    document.getElementById('exportAprsCSVBtn')?.addEventListener('click', () => {
      this.exportAPRSCSV();
    });
    
    // Search handlers
    document.getElementById('channelSearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterChannels(e.target.value);
    }, 300));
    
    document.getElementById('contactSearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterContacts(e.target.value);
    }, 300));
    
    document.getElementById('tglistSearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterTGLists(e.target.value);
    }, 300));
    
    document.getElementById('zoneSearch')?.addEventListener('input', Utils.debounce((e) => {
      this.filterZones(e.target.value);
    }, 300));
    
    document.getElementById('repeaterSearch')?.addEventListener('input', Utils.debounce((e) => {
      UI.filterRepeaters(e.target.value);
    }, 300));
    
    document.getElementById('dmridSearch')?.addEventListener('input', Utils.debounce((e) => {
      UI.searchDMRID(e.target.value);
    }, 300));
  },

  /**
   * Bind modal events
   */
  /**
   * Turn a <select> into a searchable combobox. The native select stays in the
   * DOM and keeps its value / change event, so existing code is unaffected.
   */
  enhanceSearchableSelect(selectEl) {
    if (!selectEl || selectEl._searchableSelect) return;
    selectEl._searchableSelect = true;

    const wrap = document.createElement('div');
    wrap.className = 'searchable-select';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    selectEl.classList.add('searchable-select-native');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input searchable-select-input';
    input.autocomplete = 'off';
    input.placeholder = selectEl.dataset.searchPlaceholder || 'Search...';
    wrap.insertBefore(input, selectEl);

    const list = document.createElement('div');
    list.className = 'searchable-select-list';
    list.style.display = 'none';
    wrap.insertBefore(list, selectEl);

    const syncDisplay = () => {
      const opt = [...selectEl.options].find(o => o.value === selectEl.value);
      input.value = opt ? opt.textContent : '';
    };

    const buildList = (filter = '') => {
      const q = filter.trim().toLowerCase();
      const matches = [...selectEl.options]
        .map(o => ({ value: o.value, label: o.textContent }))
        .filter(o => !q || o.label.toLowerCase().includes(q));
      list.innerHTML = matches.length
        ? matches.map(o =>
            `<div class="searchable-select-option${o.value === selectEl.value ? ' selected' : ''}" data-value="${Utils.escapeHtml(o.value)}">${Utils.escapeHtml(o.label)}</div>`
          ).join('')
        : '<div class="searchable-select-empty">No matches</div>';
    };

    const close = () => { list.style.display = 'none'; syncDisplay(); };

    input.addEventListener('focus', () => { buildList(''); list.style.display = ''; });
    input.addEventListener('input', () => { buildList(input.value); list.style.display = ''; });
    input.addEventListener('blur', () => { setTimeout(close, 150); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.blur(); return; }
      if (e.key === 'Enter') {
        const first = list.querySelector('.searchable-select-option');
        if (first) {
          selectEl.value = first.dataset.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        input.blur();
      }
    });
    list.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.searchable-select-option');
      if (!opt) return;
      e.preventDefault();
      selectEl.value = opt.dataset.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      close();
      input.blur();
    });
    selectEl.addEventListener('change', syncDisplay);

    new MutationObserver(syncDisplay).observe(selectEl, { childList: true });
    syncDisplay();
  },

  bindModals() {
    // Prevent duplicate event listeners if called multiple times
    if (this._modalsBound) return;
    this._modalsBound = true;
    
    document.getElementById('modalClose')?.addEventListener('click', () => {
      this.hideModal();
    });
    
    document.getElementById('modalCancel')?.addEventListener('click', () => {
      this.hideModal();
    });
    
    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideModal();
      }
    });
    
    // Copyright modal events
    document.getElementById('copyrightBtn')?.addEventListener('click', () => {
      this.showCopyrightModal();
    });
    
    document.getElementById('copyrightModalClose')?.addEventListener('click', () => {
      this.hideCopyrightModal();
    });
    
    document.getElementById('copyrightModalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideCopyrightModal();
      }
    });
    
    // Feedback modal events
    document.getElementById('feedbackBtn')?.addEventListener('click', () => {
      this.showFeedbackModal();
    });
    
    document.getElementById('feedbackModalClose')?.addEventListener('click', () => {
      this.hideFeedbackModal();
    });
    
    document.getElementById('feedbackModalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideFeedbackModal();
      }
    });
    
    document.getElementById('downloadConsoleLogBtn')?.addEventListener('click', () => {
      this.downloadConsoleLog();
    });
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const copyrightOverlay = document.getElementById('copyrightModalOverlay');
        if (copyrightOverlay?.classList.contains('active')) {
          this.hideCopyrightModal();
        }
        const feedbackOverlay = document.getElementById('feedbackModalOverlay');
        if (feedbackOverlay?.classList.contains('active')) {
          this.hideFeedbackModal();
        }
      }
    });
  },
  
  /**
   * Show copyright notices modal
   */
  showCopyrightModal() {
    document.getElementById('copyrightModalOverlay')?.classList.add('active');
  },
  
  /**
   * Hide copyright notices modal
   */
  hideCopyrightModal() {
    document.getElementById('copyrightModalOverlay')?.classList.remove('active');
  },

  /**
   * Show feedback modal
   */
  showFeedbackModal() {
    document.getElementById('feedbackModalOverlay')?.classList.add('active');
    this.updateFeedbackVersionInfo();
  },
  
  /**
   * Hide feedback modal
   */
  hideFeedbackModal() {
    document.getElementById('feedbackModalOverlay')?.classList.remove('active');
  },
  
  /**
   * Update version info display in feedback modal
   */
  updateFeedbackVersionInfo() {
    const versionDiv = document.getElementById('feedbackVersionInfo');
    if (!versionDiv) return;
    
    const versionInfo = this.getVersionInfo();
    let html = `<strong>App Version:</strong> v${versionInfo.appVersion}<br>`;
    html += `<strong>Console Messages:</strong> ${ConsoleCapture.getLogs().length} captured`;
    versionDiv.innerHTML = html;
  },
  
  /**
   * Get version information for feedback
   */
  getVersionInfo() {
    // Dynamically detect versions from loaded script and link tags
    const jsFiles = [];
    const cssFiles = [];
    const versions = [];
    
    // Get all script tags with version parameters (matches pattern: js/filename.js?v=123)
    const scripts = document.querySelectorAll('script[src*="js/"][src*="?v="]');
    scripts.forEach(script => {
      const src = script.getAttribute('src');
      if (src) {
        jsFiles.push(src);
        const versionMatch = src.match(/\?v=(\d+)/);
        if (versionMatch) {
          versions.push(parseInt(versionMatch[1], 10));
        }
      }
    });
    
    // Get all stylesheet link tags with version parameters (matches pattern: ?v=123)
    const links = document.querySelectorAll('link[rel="stylesheet"][href*="?v="]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        cssFiles.push(href);
        const versionMatch = href.match(/\?v=(\d+)/);
        if (versionMatch) {
          versions.push(parseInt(versionMatch[1], 10));
        }
      }
    });
    
    const maxVersion = versions.length > 0 ? Math.max(...versions) : 0;
    
    return {
      appVersion: maxVersion,
      jsFiles: jsFiles,
      cssFiles: cssFiles
    };
  },
  
  /**
   * Get browser information for feedback
   */
  getBrowserInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenWidth: screen.width,
      screenHeight: screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      webUSB: 'usb' in navigator ? 'Supported' : 'Not Supported'
    };
  },
  
  /**
   * Format date for filename
   */
  formatDateForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  },
  
  /**
   * Download console log as text file
   */
  downloadConsoleLog() {
    const now = new Date();
    const versionInfo = this.getVersionInfo();
    const browserInfo = this.getBrowserInfo();
    const logs = ConsoleCapture.getLogs();
    
    let logContent = '';
    logContent += '='.repeat(60) + '\n';
    logContent += 'OpenGD77 CPS Web Console Log\n';
    logContent += '='.repeat(60) + '\n\n';
    
    logContent += 'GENERATED: ' + now.toISOString() + '\n';
    logContent += 'LOCAL TIME: ' + now.toLocaleString() + '\n\n';
    
    logContent += '-'.repeat(60) + '\n';
    logContent += 'VERSION INFORMATION\n';
    logContent += '-'.repeat(60) + '\n';
    logContent += `App Version: v${versionInfo.appVersion}\n\n`;
    logContent += 'JS Files:\n';
    versionInfo.jsFiles.forEach(file => {
      logContent += `  ${file}\n`;
    });
    logContent += '\nCSS Files:\n';
    versionInfo.cssFiles.forEach(file => {
      logContent += `  ${file}\n`;
    });
    logContent += '\n';
    
    logContent += '-'.repeat(60) + '\n';
    logContent += 'BROWSER INFORMATION\n';
    logContent += '-'.repeat(60) + '\n';
    logContent += `User Agent: ${browserInfo.userAgent}\n`;
    logContent += `Platform: ${browserInfo.platform}\n`;
    logContent += `Language: ${browserInfo.language}\n`;
    logContent += `Cookies Enabled: ${browserInfo.cookiesEnabled}\n`;
    logContent += `Online: ${browserInfo.onLine}\n`;
    logContent += `Screen: ${browserInfo.screenWidth}x${browserInfo.screenHeight}\n`;
    logContent += `Window: ${browserInfo.windowWidth}x${browserInfo.windowHeight}\n`;
    logContent += `Device Pixel Ratio: ${browserInfo.devicePixelRatio}\n`;
    logContent += `WebUSB: ${browserInfo.webUSB}\n\n`;
    
    // Radio connection status
    logContent += '-'.repeat(60) + '\n';
    logContent += 'RADIO STATUS\n';
    logContent += '-'.repeat(60) + '\n';
    const radioType = window.radioUSB?.radioType || 'Not selected';
    const connected = window.radioUSB?.connected ? 'Connected' : 'Disconnected';
    logContent += `Radio Type: ${radioType}\n`;
    logContent += `Connection: ${connected}\n\n`;
    
    logContent += '-'.repeat(60) + '\n';
    logContent += `CONSOLE MESSAGES (${logs.length} entries)\n`;
    logContent += '-'.repeat(60) + '\n';
    
    if (logs.length === 0) {
      logContent += '(No console messages captured)\n';
    } else {
      logs.forEach(entry => {
        logContent += `[${entry.timestamp}] [${entry.type}] ${entry.message}\n`;
      });
    }
    
    logContent += '\n' + '='.repeat(60) + '\n';
    logContent += 'END OF LOG\n';
    logContent += '='.repeat(60) + '\n';
    logContent += '\nSubject: OpenGD77 WebCPS Bug Report\n';
    
    // Create and download the file
    const filename = `opengd77-cps-console-log_${this.formatDateForFilename(now)}.txt`;
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Delay URL revocation to ensure download starts in all browsers
    // Some browsers need time to initiate the download before the URL is revoked
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    // Show success message
    const successMsg = document.getElementById('feedbackDownloadSuccess');
    if (successMsg) {
      successMsg.style.display = 'block';
    }
    
    console.log('Console log downloaded:', filename);
  },

  /**
   * Bind file input events
   */
  bindFileInputs() {
    document.getElementById('fileInput')?.addEventListener('change', (e) => {
      App.handleFileOpen(e.target.files[0]);
    });
    
    document.getElementById('importChannelsFile')?.addEventListener('change', (e) => {
      App.importCSV(e.target.files[0], 'channels');
      e.target.value = '';
    });
    
    document.getElementById('importContactsFile')?.addEventListener('change', (e) => {
      App.importCSV(e.target.files[0], 'contacts');
      e.target.value = '';
    });
    
    document.getElementById('importZonesFile')?.addEventListener('change', (e) => {
      App.importCSV(e.target.files[0], 'zones');
      e.target.value = '';
    });
    
    document.getElementById('importTGListsFile')?.addEventListener('change', (e) => {
      App.importCSV(e.target.files[0], 'tglists');
      e.target.value = '';
    });
    
    document.getElementById('importChirpFile')?.addEventListener('change', (e) => {
      App.importChirpCSV(e.target.files[0]);
      e.target.value = '';
    });
    
    document.getElementById('importRRUKFile')?.addEventListener('change', (e) => {
      App.importRadioReferenceUKCSV(e.target.files[0]);
      e.target.value = '';
    });
    
    document.getElementById('satCSVInput')?.addEventListener('change', (e) => {
      this.importSatellitesCSV(e.target.files[0]);
      e.target.value = '';
    });
    
    document.getElementById('dtmfCSVInput')?.addEventListener('change', (e) => {
      this.importDTMFCSV(e.target.files[0]);
      e.target.value = '';
    });
    
    document.getElementById('aprsCSVInput')?.addEventListener('change', (e) => {
      this.importAPRSCSV(e.target.files[0]);
      e.target.value = '';
    });
    
    // Firmware file inputs
    document.getElementById('firmwareMK22File')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('firmwareMK22Name').value = file.name;
        this.checkMK22FirmwareReady();
      }
    });
    
    document.getElementById('firmwareSTM32DonorFile')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('firmwareSTM32DonorName').value = file.name;
        this.checkSTM32FirmwareReady();
      }
    });
    
    document.getElementById('firmwareSTM32File')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('firmwareSTM32Name').value = file.name;
        this.checkSTM32FirmwareReady();
      }
    });
    
    // Model selector change events for custom panels
    document.getElementById('stm32CustomModel')?.addEventListener('change', () => {
      this.checkSTM32FirmwareReady();
    });
    
    document.getElementById('mk22CustomModel')?.addEventListener('change', () => {
      this.checkMK22FirmwareReady();
    });
    
    document.getElementById('uploadMK22FirmwareBtn')?.addEventListener('click', () => {
      this.uploadMK22Firmware();
    });
    
    document.getElementById('uploadSTM32FirmwareBtn')?.addEventListener('click', () => {
      this.uploadSTM32Firmware();
    });
  },
  
  /**
   * Check if STM32 firmware files are ready for upload
   */
  checkSTM32FirmwareReady() {
    const firmwareFile = document.getElementById('firmwareSTM32File')?.files[0];
    const uploadBtn = document.getElementById('uploadSTM32FirmwareBtn');
    const modelSelected = !!document.getElementById('stm32CustomModel')?.value;
    
    // Use FirmwareManager's donor source setting if available
    let donorReady = true;
    const donorSource = window.FirmwareManager?.selectedSTM32?.donorSourceCustomPanel;
    
    if (donorSource === 'builtin') {
      donorReady = window.FirmwareManager?.manifest?.donor?.STM32?.exists !== false;
    } else if (donorSource === 'custom') {
      const donorFile = document.getElementById('firmwareSTM32DonorFileCustom')?.files?.[0];
      donorReady = !!donorFile;
    }
    // 'none' or undefined means no donor needed, donorReady stays true
    
    if (uploadBtn) {
      uploadBtn.disabled = !(donorReady && firmwareFile && modelSelected);
    }
  },
  
  /**
   * Check if MK22 firmware files are ready for upload
   */
  checkMK22FirmwareReady() {
    const firmwareFile = document.getElementById('firmwareMK22File')?.files[0];
    const uploadBtn = document.getElementById('uploadMK22FirmwareBtn');
    const modelSelected = !!document.getElementById('mk22CustomModel')?.value;
    
    if (uploadBtn) {
      uploadBtn.disabled = !(firmwareFile && modelSelected);
    }
  },

  /**
   * Bind general settings input events
   */
  bindGeneralSettings() {
    document.getElementById('radioName')?.addEventListener('input', (e) => {
      window.codeplug.general.radioName = e.target.value;
      window.codeplug.modified = true;
    });
    
    document.getElementById('dmrId')?.addEventListener('input', (e) => {
      window.codeplug.general.dmrId = parseInt(e.target.value) || 0;
      window.codeplug.modified = true;
    });
    
    document.getElementById('callsign')?.addEventListener('input', (e) => {
      window.codeplug.general.callsign = e.target.value.toUpperCase();
      window.codeplug.modified = true;
    });
    
    document.getElementById('infoLine1')?.addEventListener('input', (e) => {
      window.codeplug.general.infoLine1 = e.target.value;
      window.codeplug.modified = true;
    });
    
    document.getElementById('infoLine2')?.addEventListener('input', (e) => {
      window.codeplug.general.infoLine2 = e.target.value;
      window.codeplug.modified = true;
    });

    // Extended channel mode toggle (dev mode only)
    document.getElementById('extendedChannelMode')?.addEventListener('change', (e) => {
      EXTENDED_CHANNEL_MODE = e.target.checked;
      localStorage.setItem('opengd77_extended_channels', EXTENDED_CHANNEL_MODE ? 'true' : 'false');
      // Update UI to show/hide DMRID and VP sections
      this.updateUIForRadioType();
      Utils.toast(EXTENDED_CHANNEL_MODE 
        ? 'Extended channel mode enabled (4096 channels, no DMRID/VP)' 
        : 'Extended channel mode disabled (1024 channels)', 'info');
    });

    // Set radio clock
    document.getElementById('setClockBtn')?.addEventListener('click', () => {
      this.setRadioClock();
    });
  },

  /**
   * Set the radio's clock to the current UTC (Zulu) time.
   * Required before the satellite screen will run.
   */
  async setRadioClock() {
    if (!window.radioUSB.connected) {
      Utils.toast('Connect to radio first', 'warning');
      return;
    }

    const statusEl = document.getElementById('radioClockStatus');
    const utcString = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    if (statusEl) statusEl.textContent = 'Setting clock...';

    try {
      const ok = await window.radioUSB.setClock();
      if (ok) {
        Utils.toast('Radio clock set to ' + utcString + ' — radio rebooting', 'success');
        if (statusEl) statusEl.textContent = 'Set to ' + utcString + ' (radio rebooting)';
      } else {
        Utils.toast('Radio did not acknowledge the clock command', 'warning');
        if (statusEl) statusEl.textContent = 'No acknowledgement';
      }
    } catch (error) {
      Utils.toast('Failed to set clock: ' + error.message, 'error');
      if (statusEl) statusEl.textContent = 'Failed';
    }
  },

  /**
   * Show modal dialog
   */
  showModal(title, content, options = {}) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
    
    // Handle wide modal
    const modal = document.querySelector('.modal');
    if (options.extraWide) {
      modal.classList.add('modal-extra-wide');
      modal.classList.remove('modal-wide');
    } else if (options.wide) {
      modal.classList.add('modal-wide');
      modal.classList.remove('modal-extra-wide');
    } else {
      modal.classList.remove('modal-wide');
      modal.classList.remove('modal-extra-wide');
    }
    
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');
    const footerEl = document.querySelector('.modal-footer');
    
    // Hide entire footer if requested (for custom buttons in content)
    if (options.hideFooter && footerEl) {
      footerEl.style.display = 'none';
    } else if (footerEl) {
      footerEl.style.display = '';
    }
    
    confirmBtn.textContent = options.confirmText || 'Confirm';
    confirmBtn.className = `btn ${options.confirmClass || 'btn-primary'}`;
    
    if (options.hideCancel) {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = '';
    }
    if (options.cancelText) cancelBtn.textContent = options.cancelText;
    
    // Replace both buttons so listeners from a previous modal don't stack.
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    if (options.onConfirm) {
      newConfirmBtn.addEventListener('click', () => {
        options.onConfirm();
      });
    }

    // Cancel always closes the modal; onCancel lets callers take extra action.
    newCancelBtn.addEventListener('click', () => {
      this.hideModal();
      if (options.onCancel) {
        try { options.onCancel(); } catch (e) { console.error('Modal onCancel error:', e); }
      }
    });
  },

  /**
   * Hide modal dialog
   */
  hideModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  },

  /**
   * Show a brief changelog of recent additions and fixes.
   */
  showChangelog() {
    this.showModal('Changelog — updated 12/09/26', `
      <div class="changelog">
        <h4>What's new</h4>
        <ul>
          <li><strong>DM32 / UV008</strong> support: connect, read/write codeplugs and themes, back up the SPI flash, and flash firmware.</li>
          <li><strong>Boot Settings</strong>: read/write the boot image and melody; fixed the screen getting stuck on "Reading Boot Data".</li>
          <li><strong>DM32 / UV008 boot title</strong>: optionally patch the on-screen boot title when flashing firmware (max 16 characters).</li>
          <li><strong>APRS &amp; DTMF</strong> editors with CSV import/export; fixed APRS SSID 0.</li>
          <li><strong>Satellites</strong>: download/update TLEs and write them to the radio.</li>
          <li><strong>Themes</strong>: import/export GTM themes with a live preview.</li>
        </ul>
        <h4>Fixes</h4>
        <ul>
          <li>More reliable radio reads and writes; operations no longer overlap.</li>
          <li>Fixed service-worker/cache updates and tightened security.</li>
        </ul>
      </div>
    `, { confirmText: 'Close', hideCancel: true, onConfirm: () => this.hideModal() });
  },

  /**
   * Update overview statistics
   */
  updateOverview() {
    const stats = window.codeplug.getStats();
    
    document.getElementById('overviewChannels').textContent = stats.channels;
    document.getElementById('overviewZones').textContent = stats.zones;
    document.getElementById('overviewContacts').textContent = stats.contacts;
    document.getElementById('overviewTGLists').textContent = stats.tgLists;
    
    const satellitesEl = document.getElementById('overviewSatellites');
    if (satellitesEl) {
      satellitesEl.textContent = stats.satellites;
    }
    
    document.getElementById('channelCount').textContent = stats.channels;
    document.getElementById('zoneCount').textContent = stats.zones;
    document.getElementById('contactCount').textContent = stats.contacts;
    document.getElementById('tgListCount').textContent = stats.tgLists;
    
    // Scan list count
    const scanListCount = document.getElementById('scanListCount');
    if (scanListCount) {
      scanListCount.textContent = stats.scanLists || 0;
    }
    
    // Update codeplug name in header and mobile info bar
    const codeplugName = window.codeplug.filename || 'New Codeplug';
    const nameText = document.getElementById('codeplugNameText');
    if (nameText) {
      nameText.textContent = codeplugName;
    }
    const mobileNameText = document.getElementById('mobileCodeplugName');
    if (mobileNameText) {
      mobileNameText.textContent = codeplugName;
    }
    
    // Update modified indicator in header and mobile info bar
    const modifiedDisplay = window.codeplug.modified ? '' : 'none';
    const modifiedIndicator = document.getElementById('codeplugModified');
    if (modifiedIndicator) {
      modifiedIndicator.style.display = modifiedDisplay;
    }
    const footerModifiedIndicator = document.getElementById('codeplugModifiedFooter');
    if (footerModifiedIndicator) {
      footerModifiedIndicator.style.display = modifiedDisplay;
    }
    const mobileModifiedIndicator = document.getElementById('mobileCodeplugModified');
    if (mobileModifiedIndicator) {
      mobileModifiedIndicator.style.display = modifiedDisplay;
    }
    
    // Update general settings form
    this.populateGeneralSettings();
    
    // Load user's saved codeplugs for the dashboard
    this.loadDashboardCodeplugs();
  },
  
  /**
   * Load user's saved codeplugs for the dashboard
   */
  async loadDashboardCodeplugs() {
    const recentList = document.getElementById('recentList');
    const viewAllBtn = document.getElementById('viewAllCodeplugsBtn');
    
    if (!recentList) return;
    
    try {
      const codeplugs = await API.getMyCodeplugs();
      
      if (codeplugs.length === 0) {
        recentList.innerHTML = `
          <div class="empty-state">
            <i class="mdi mdi-file-document-outline"></i>
            <p>No saved codeplugs yet</p>
            <small>Save your current codeplug to access it from any device</small>
            <button class="btn btn-secondary" style="margin-top: 0.75rem;" onclick="App.showSaveCodeplugModal()">
              <i class="mdi mdi-content-save"></i> Save Current
            </button>
          </div>
        `;
        if (viewAllBtn) viewAllBtn.style.display = 'none';
        return;
      }
      
      // Show only the first 4 codeplugs on the dashboard
      const displayCodeplugs = codeplugs.slice(0, 4);
      
      recentList.innerHTML = displayCodeplugs.map(cp => `
        <div class="recent-item" onclick="App.loadCodeplug('${cp.id}')" style="cursor:pointer">
          <span class="recent-item-icon"><i class="mdi mdi-file-document"></i></span>
          <div class="recent-item-info">
            <div class="recent-item-name">${Utils.escapeHtml(cp.name)}</div>
            <div class="recent-item-meta">
              ${cp.channelCount || 0} channels &bull; ${Utils.formatDate(cp.updatedAt)}
            </div>
          </div>
          <div class="recent-item-actions">
            <button class="btn btn-sm" onclick="event.stopPropagation();App.loadCodeplug('${cp.id}')" title="Load">
              <i class="mdi mdi-folder-open"></i>
            </button>
          </div>
        </div>
      `).join('');
      
      // Show "View All" button if there are more than 4 codeplugs
      if (viewAllBtn) {
        viewAllBtn.style.display = codeplugs.length > 4 ? '' : 'none';
        viewAllBtn.onclick = () => UI.showSection('my-codeplugs');
      }
      
    } catch (error) {
      recentList.innerHTML = `
        <div class="empty-state">
          <i class="mdi mdi-alert"></i>
          <p>Failed to load codeplugs</p>
          <small>${error.message}</small>
        </div>
      `;
      if (viewAllBtn) viewAllBtn.style.display = 'none';
    }
  },

  /**
   * Populate general settings form with codeplug data
   */
  populateGeneralSettings() {
    const general = window.codeplug.general;
    
    const radioNameEl = document.getElementById('radioName');
    if (radioNameEl) {
      radioNameEl.value = general.radioName || '';
    }
    
    const dmrIdEl = document.getElementById('dmrId');
    if (dmrIdEl) {
      dmrIdEl.value = general.dmrId || '';
    }
    
    const callsignEl = document.getElementById('callsign');
    if (callsignEl) {
      callsignEl.value = general.callsign || '';
    }
    
    const infoLine1El = document.getElementById('infoLine1');
    if (infoLine1El) {
      infoLine1El.value = general.infoLine1 || '';
    }
    
    const infoLine2El = document.getElementById('infoLine2');
    if (infoLine2El) {
      infoLine2El.value = general.infoLine2 || '';
    }

    // Extended channel mode checkbox
    const extChannelCheckbox = document.getElementById('extendedChannelMode');
    if (extChannelCheckbox) {
      extChannelCheckbox.checked = EXTENDED_CHANNEL_MODE;
    }
  },

  /**
   * Render channels table
   */
  // Selectable channels-table columns. `def` = shown by default (the previous
  // fixed set); the rest are opt-in. `value` is used for sorting.
  CHANNEL_COLUMN_DEFS: [
    { key: 'name', label: 'Name', def: true, sortable: true, value: (ch) => ch.name || '', cell: (ch) => `<td>${Utils.escapeHtml(ch.name)}</td>` },
    { key: 'type', label: 'Type', def: true, sortable: true, value: (ch) => UI.channelModeAbbrev(ch), cell: (ch) => `<td><span class="channel-type ${ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? 'digital' : 'analog'}">${UI.channelModeAbbrev(ch)}</span></td>` },
    { key: 'rxFreq', label: 'RX Freq', def: true, sortable: true, value: (ch) => Number(ch.rxFreq) || 0, cell: (ch) => `<td>${Utils.formatFrequency(ch.rxFreq)}</td>` },
    { key: 'txFreq', label: 'TX Freq', def: true, sortable: true, value: (ch) => Number(ch.txFreq) || 0, cell: (ch) => `<td>${Utils.formatFrequency(ch.txFreq)}</td>` },
    { key: 'ccTone', label: 'CC/Tone', def: true, sortable: true, value: (ch) => (ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? Number(ch.colorCode) || 0 : (ch.txTone || '')), cell: (ch) => `<td>${ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? `CC${ch.colorCode}` : (ch.txTone !== 'None' ? ch.txTone : '-')}</td>` },
    { key: 'ts', label: 'TS', def: true, sortable: true, value: (ch) => Number(ch.timeslot) || 0, cell: (ch) => `<td>${ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? `TS${ch.timeslot}` : '-'}</td>` },
    { key: 'contact', label: 'Contact', def: true, sortable: true, value: (ch) => ch.contact || '', cell: (ch) => `<td>${ch.contact || '-'}</td>` },
    { key: 'tgList', label: 'TG List', def: true, sortable: true, value: (ch) => ch.tgList || '', cell: (ch) => `<td>${ch.tgList || '-'}</td>` },
    { key: 'power', label: 'Power', def: true, sortable: true, value: (ch) => ch.power || '', cell: (ch) => `<td>${ch.power}</td>` },
    { key: 'bandwidth', label: 'BW', def: false, sortable: true, value: (ch) => Number(ch.bandwidth) || 0, cell: (ch) => `<td>${ch.bandwidth ? `${ch.bandwidth} kHz` : '-'}</td>` },
    { key: 'dmrId', label: 'DMR ID', def: false, sortable: true, value: (ch) => String(ch.dmrId || ''), cell: (ch) => `<td>${Utils.escapeHtml(String(ch.dmrId || '-'))}</td>` },
    { key: 'overrideDmrId', label: 'Override ID', def: false, sortable: true, value: (ch) => String(ch.overrideDmrId || ''), cell: (ch) => `<td>${ch.overrideDmrId || '-'}</td>` },
    { key: 'rxTone', label: 'RX Tone', def: false, sortable: true, value: (ch) => ch.rxTone || '', cell: (ch) => `<td>${ch.rxTone || '-'}</td>` },
    { key: 'txTone', label: 'TX Tone', def: false, sortable: true, value: (ch) => ch.txTone || '', cell: (ch) => `<td>${ch.txTone || '-'}</td>` },
    { key: 'squelch', label: 'Squelch', def: false, sortable: true, value: (ch) => ch.squelch || '', cell: (ch) => `<td>${ch.squelch || '-'}</td>` },
    { key: 'scanList', label: 'Scan List', def: false, sortable: true, value: (ch) => ch.scanList || '', cell: (ch) => `<td>${ch.scanList || '-'}</td>` },
    { key: 'tot', label: 'TOT', def: false, sortable: true, value: (ch) => ch.tot || '', cell: (ch) => `<td>${ch.tot || '-'}</td>` },
    { key: 'vox', label: 'VOX', def: false, sortable: true, value: (ch) => ch.vox || '', cell: (ch) => `<td>${ch.vox || '-'}</td>` },
    { key: 'rxOnly', label: 'RX Only', def: false, sortable: true, value: (ch) => ch.rxOnly ? 1 : 0, cell: (ch) => `<td>${ch.rxOnly ? 'Yes' : 'No'}</td>` },
    { key: 'zoneSkip', label: 'Zone Skip', def: false, sortable: true, value: (ch) => ch.zoneSkip ? 1 : 0, cell: (ch) => `<td>${ch.zoneSkip ? 'Yes' : 'No'}</td>` },
    { key: 'allSkip', label: 'All Skip', def: false, sortable: true, value: (ch) => ch.allSkip ? 1 : 0, cell: (ch) => `<td>${ch.allSkip ? 'Yes' : 'No'}</td>` },
    { key: 'noBeep', label: 'No Beep', def: false, sortable: true, value: (ch) => ch.noBeep ? 1 : 0, cell: (ch) => `<td>${ch.noBeep ? 'Yes' : 'No'}</td>` },
    { key: 'noEco', label: 'No Eco', def: false, sortable: true, value: (ch) => ch.noEco ? 1 : 0, cell: (ch) => `<td>${ch.noEco ? 'Yes' : 'No'}</td>` },
    { key: 'talkerAlias', label: 'Talker Alias', def: false, sortable: true, value: (ch) => `${ch.ts1TalkerAliasTx || ''}/${ch.ts2TalkerAliasTx || ''}`, cell: (ch) => `<td>${ch.ts1TalkerAliasTx || '-'} / ${ch.ts2TalkerAliasTx || '-'}</td>` },
    { key: 'aprs', label: 'APRS', def: false, sortable: true, value: (ch) => ch.aprs || '', cell: (ch) => `<td>${ch.aprs || '-'}</td>` },
    { key: 'latLon', label: 'Lat, Lon', def: false, sortable: true, value: (ch) => ch.useLocation ? `${ch.latitude},${ch.longitude}` : '', cell: (ch) => `<td>${ch.useLocation ? `${ch.latitude}, ${ch.longitude}` : '-'}</td>` }
  ],

  _channelColumnDefs() { return this.CHANNEL_COLUMN_DEFS || []; },
  _channelDefaultKeys() { return this._channelColumnDefs().filter(d => d.def).map(d => d.key); },
  _channelVisibleKeys() {
    const saved = Utils.storage.get(CONFIG.STORAGE.CHANNEL_COLUMNS, null);
    const valid = new Set(this._channelColumnDefs().map(d => d.key));
    const keys = Array.isArray(saved) ? saved.filter(k => valid.has(k)) : null;
    return new Set(keys && keys.length ? keys : this._channelDefaultKeys());
  },
  _channelSortState() {
    if (this._channelSort === undefined) {
      this._channelSort = Utils.storage.get(CONFIG.STORAGE.CHANNEL_SORT, null) || null;
    }
    return this._channelSort;
  },

  _sortedChannels(channels) {
    const s = this._channelSortState();
    const def = s && s.key ? this._channelColumnDefs().find(d => d.key === s.key) : null;
    if (!def) return [...channels];
    const dir = s.dir === 'desc' ? -1 : 1;
    return [...channels].sort((a, b) => {
      const va = def.value(a);
      const vb = def.value(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  },

  _channelColumnHead() {
    const visible = this._channelVisibleKeys();
    const sort = this._channelSortState();
    const ths = ['<th>#</th>'];
    for (const d of this._channelColumnDefs()) {
      if (!visible.has(d.key)) continue;
      const active = sort && sort.key === d.key;
      const cls = d.sortable ? `sortable${active ? (sort.dir === 'desc' ? ' sort-desc' : ' sort-asc') : ''}` : '';
      const icon = d.sortable ? ` <span class="sort-icon">${active ? (sort.dir === 'desc' ? '▼' : '▲') : ''}</span>` : '';
      ths.push(`<th${cls ? ` class="${cls}"` : ''}${d.sortable ? ` data-sort="${d.key}"` : ''}>${d.label}${icon}</th>`);
    }
    ths.push('<th>Actions</th>');
    return `<tr>${ths.join('')}</tr>`;
  },

  _channelActionButtons(ch, allowMove) {
    let h = '';
    if (allowMove) {
      h += `<button class="action-btn" onclick="UI.moveChannel('${ch.id}', -1)" title="Move Up"><i class="mdi mdi-arrow-up"></i></button>`;
      h += `<button class="action-btn" onclick="UI.moveChannel('${ch.id}', 1)" title="Move Down"><i class="mdi mdi-arrow-down"></i></button>`;
    }
    h += `<button class="action-btn" onclick="UI.swapChannelFreqs('${ch.id}')" title="Swap TX/RX"><i class="mdi mdi-swap-horizontal"></i></button>`;
    h += `<button class="action-btn" onclick="UI.editChannel('${ch.id}')" title="Edit"><i class="mdi mdi-pencil"></i></button>`;
    h += `<button class="action-btn danger" onclick="UI.deleteChannel('${ch.id}')" title="Delete"><i class="mdi mdi-delete"></i></button>`;
    return h;
  },

  _channelColumnCells(ch, ctx) {
    const visible = this._channelVisibleKeys();
    const cells = [];
    cells.push(ctx === 'main'
      ? `<td class="drag-handle" title="Drag to reorder"><i class="mdi mdi-drag-vertical"></i><span class="channel-number" onclick="UI.showMoveChannelDialog('${ch.id}', ${ch.number})" title="Click to move to position">${ch.number}</span></td>`
      : `<td class="drag-handle" title="Drag to reorder within zone"><i class="mdi mdi-drag-vertical"></i><span class="channel-number">${ch.number}</span></td>`);
    for (const d of this._channelColumnDefs()) {
      if (visible.has(d.key)) cells.push(d.cell(ch));
    }
    cells.push(`<td class="actions">${this._channelActionButtons(ch, ctx === 'main')}</td>`);
    return cells.join('');
  },

  toggleChannelSort(key) {
    const cur = this._channelSortState();
    const wasSorted = !!(cur && cur.key);
    if (!cur || cur.key !== key) this._channelSort = { key, dir: 'asc' };
    else if (cur.dir === 'asc') this._channelSort = { key, dir: 'desc' };
    else this._channelSort = null; // third click returns to manual order
    if (this._channelSort) Utils.storage.set(CONFIG.STORAGE.CHANNEL_SORT, this._channelSort);
    else Utils.storage.remove(CONFIG.STORAGE.CHANNEL_SORT);
    if (this._channelSort && !wasSorted) {
      const def = this._channelColumnDefs().find(d => d.key === key);
      Utils.toast(`Sorted by ${def ? def.label : key}`, 'info');
    } else if (!this._channelSort && wasSorted) {
      Utils.toast('Manual channel order restored', 'info');
    }
    const q = document.getElementById('channelSearch')?.value || '';
    this.renderChannelsTable(q);
    if (this.channelGroupByZone) this.renderChannelsGroupedByZone(q);
  },

  setChannelColumns(keys) {
    Utils.storage.set(CONFIG.STORAGE.CHANNEL_COLUMNS, keys);
    const q = document.getElementById('channelSearch')?.value || '';
    this.renderChannelsTable(q);
    if (this.channelGroupByZone) this.renderChannelsGroupedByZone(q);
  },

  resetChannelColumns() {
    Utils.storage.remove(CONFIG.STORAGE.CHANNEL_COLUMNS);
    this.initChannelColumnPicker();
    const q = document.getElementById('channelSearch')?.value || '';
    this.renderChannelsTable(q);
    if (this.channelGroupByZone) this.renderChannelsGroupedByZone(q);
  },

  initChannelColumnPicker() {
    const menu = document.getElementById('channelColumnsMenu');
    if (!menu) return;
    const visible = this._channelVisibleKeys();
    menu.innerHTML = this._channelColumnDefs().map(d => `
      <label><input type="checkbox" data-col="${d.key}" ${visible.has(d.key) ? 'checked' : ''}> ${d.label}</label>
    `).join('') + '<button type="button" class="btn btn-sm btn-secondary column-picker-reset" id="channelColumnsReset">Reset to defaults</button>';
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const keys = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.dataset.col);
        if (keys.length === 0) {
          cb.checked = true;
          Utils.toast('Keep at least one column visible', 'warning');
          return;
        }
        this.setChannelColumns(keys);
      });
    });
    document.getElementById('channelColumnsReset')?.addEventListener('click', () => this.resetChannelColumns());
  },

  toggleChannelColumnsMenu(force) {
    const menu = document.getElementById('channelColumnsMenu');
    if (!menu) return;
    const open = force != null ? force : !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    if (open) this.initChannelColumnPicker();
  },

  renderChannelsTable(filter = '') {
    if (this.channelGroupByZone) {
      this.renderChannelsGroupedByZone(filter);
      return;
    }

    const tbody = document.getElementById('channelsTableBody');
    const empty = document.getElementById('channelsEmpty');
    const table = document.getElementById('channelsTable');
    const groupedContainer = document.getElementById('channelsGroupedByZone');
    if (groupedContainer) groupedContainer.style.display = 'none';
    
    let channels = window.codeplug.channels;
    
    if (filter) {
      const q = filter.toLowerCase();
      channels = channels.filter(c => 
        c.name.toLowerCase().includes(q) ||
        String(c.rxFreq).includes(q)
      );
    }
    
    if (channels.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }

    table.style.display = '';
    empty.style.display = 'none';

    const thead = table.querySelector('thead');
    if (thead) thead.innerHTML = this._channelColumnHead();

    const sorted = this._sortedChannels(channels);
    tbody.innerHTML = sorted.map(ch => `
      <tr data-id="${ch.id}" data-number="${ch.number}" draggable="true" ondragstart="UI.handleDragStart(event)" ondragover="UI.handleDragOver(event)" ondrop="UI.handleDrop(event)" ondragend="UI.handleDragEnd(event)">
        ${this._channelColumnCells(ch, 'main')}
      </tr>
    `).join('');
  },

  /**
   * Filter channels table
   */
  filterChannels(query) {
    this.renderChannelsTable(query);
  },

  /**
   * Toggle between flat channel list and zone-grouped view
   */
  toggleChannelGroupByZone() {
    this.channelGroupByZone = !this.channelGroupByZone;
    const btn = document.getElementById('groupByZoneBtn');
    if (btn) {
      btn.classList.toggle('btn-primary', this.channelGroupByZone);
      btn.classList.toggle('btn-secondary', !this.channelGroupByZone);
    }
    const searchQuery = document.getElementById('channelSearch')?.value || '';
    this.renderChannelsTable(searchQuery);
  },

  /**
   * Render channels grouped by zone with collapsible sections
   */
  renderChannelsGroupedByZone(filter = '') {
    const table = document.getElementById('channelsTable');
    const empty = document.getElementById('channelsEmpty');
    const groupedContainer = document.getElementById('channelsGroupedByZone');

    // Save which zone groups are currently expanded before re-rendering
    const expandedZones = new Set();
    groupedContainer.querySelectorAll('.zone-group').forEach(g => {
      const header = g.querySelector('.zone-group-header');
      if (header && !header.classList.contains('collapsed')) {
        expandedZones.add(g.dataset.zoneId);
      }
    });

    let channels = window.codeplug.channels;
    if (filter) {
      const q = filter.toLowerCase();
      channels = channels.filter(c =>
        c.name.toLowerCase().includes(q) ||
        String(c.rxFreq).includes(q)
      );
    }

    if (channels.length === 0) {
      table.style.display = 'none';
      groupedContainer.style.display = 'none';
      empty.style.display = '';
      return;
    }

    table.style.display = 'none';
    empty.style.display = 'none';
    groupedContainer.style.display = '';

    const channelNames = new Set(channels.map(c => c.name));
    const zones = window.codeplug.zones;

    // Build zone groups
    const zoneGroups = zones.map(z => {
      const zoneChannels = z.channels
        .filter(name => channelNames.has(name))
        .map(name => channels.find(c => c.name === name))
        .filter(Boolean);
      return { zone: z, channels: zoneChannels };
    }).filter(g => g.channels.length > 0);

    // Find unassigned channels
    const assignedNames = new Set();
    zones.forEach(z => z.channels.forEach(name => assignedNames.add(name)));
    const unassigned = channels.filter(c => !assignedNames.has(c.name));

    let html = '';

    // Render each zone group
    zoneGroups.forEach(g => {
      html += this._renderZoneGroup(g.zone.id, Utils.escapeHtml(g.zone.name), g.channels, expandedZones.has(g.zone.id));
    });

    // Render unassigned
    if (unassigned.length > 0) {
      html += this._renderZoneGroup('unassigned', 'Unassigned', unassigned, expandedZones.has('unassigned'));
    }

    groupedContainer.innerHTML = html;
  },

  /**
   * Render a single zone group with collapsible header and channel table
   */
  _renderZoneGroup(zoneId, zoneName, channels, expanded = false) {
    const sortActive = !!this._channelSortState();
    const rows = this._sortedChannels(channels).map(ch => `
      <tr data-id="${ch.id}" data-number="${ch.number}" data-zone="${zoneId}" draggable="true" ondragstart="UI.handleZoneChDragStart(event)" ondragover="UI.handleZoneChDragOver(event)" ondrop="UI.handleZoneChDrop(event)" ondragend="UI.handleZoneChDragEnd(event)">
        ${this._channelColumnCells(ch, 'zone')}
      </tr>
    `).join('');

    return `
      <div class="zone-group" data-zone-id="${zoneId}">
        <div class="zone-group-header${expanded ? '' : ' collapsed'}" onclick="UI.toggleZoneGroup(this)">
          <i class="mdi mdi-chevron-right zone-group-chevron"></i>
          <span class="zone-group-name">${zoneName}</span>
          <span class="zone-group-count">${channels.length} channel${channels.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="zone-group-body" style="display:${expanded ? 'block' : 'none'}">
          <table class="data-table zone-group-table">
            <thead>${this._channelColumnHead()}</thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  /**
   * Toggle a zone group open/closed
   */
  toggleZoneGroup(header) {
    const body = header.nextElementSibling;
    const isCollapsed = header.classList.contains('collapsed');
    header.classList.toggle('collapsed', !isCollapsed);
    body.style.display = isCollapsed ? '' : 'none';
  },

  // Zone-grouped drag and drop state
  _zoneChDraggedElement: null,

  handleZoneChDragStart(event) {
    if (this._channelSortState()) {
      this._channelSort = null;
      Utils.storage.remove(CONFIG.STORAGE.CHANNEL_SORT);
    }
    this._zoneChDraggedElement = event.target.closest('tr');
    this._zoneChDraggedElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this._zoneChDraggedElement.dataset.id);
  },

  handleZoneChDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const targetRow = event.target.closest('tr');
    if (targetRow && targetRow !== this._zoneChDraggedElement &&
        targetRow.dataset.zone === this._zoneChDraggedElement.dataset.zone) {
      const tbody = targetRow.parentNode;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const draggedIndex = rows.indexOf(this._zoneChDraggedElement);
      const targetIndex = rows.indexOf(targetRow);
      if (draggedIndex < targetIndex) {
        targetRow.after(this._zoneChDraggedElement);
      } else {
        targetRow.before(this._zoneChDraggedElement);
      }
    }
  },

  handleZoneChDrop(event) {
    event.preventDefault();
    const draggedRow = this._zoneChDraggedElement;
    if (!draggedRow) return;

    const zoneId = draggedRow.dataset.zone;
    const tbody = draggedRow.closest('tbody');
    const newOrder = Array.from(tbody.querySelectorAll('tr')).map(r => r.dataset.id);

    if (zoneId === 'unassigned') {
      // For unassigned, reorder in global channels list
      const channelMap = {};
      window.codeplug.channels.forEach(c => { channelMap[c.id] = c; });
      const reorderedIds = new Set(newOrder);
      const result = [];
      const reorderedChannels = newOrder.map(id => channelMap[id]).filter(Boolean);
      let ri = 0;
      window.codeplug.channels.forEach(c => {
        if (reorderedIds.has(c.id)) {
          result.push(reorderedChannels[ri++]);
        } else {
          result.push(c);
        }
      });
      window.codeplug.channels = result;
      this.renumberChannels();
    } else {
      // Reorder channels within the zone
      const zone = window.codeplug.zones.find(z => z.id === zoneId);
      if (zone) {
        const channelNames = newOrder.map(id => {
          const ch = window.codeplug.channels.find(c => c.id === id);
          return ch ? ch.name : null;
        }).filter(Boolean);
        // Preserve any zone channels that weren't shown (e.g. filtered out)
        const shownNames = new Set(channelNames);
        const remaining = zone.channels.filter(name => !shownNames.has(name));
        zone.channels = [...channelNames, ...remaining];
      }
    }

    window.codeplug.modified = true;
    Utils.toast('Channels reordered', 'success');
  },

  handleZoneChDragEnd(event) {
    if (this._zoneChDraggedElement) {
      this._zoneChDraggedElement.classList.remove('dragging');
      this._zoneChDraggedElement = null;
    }
    const scrollPos = window.scrollY;
    const searchQuery = document.getElementById('channelSearch')?.value || '';
    this.renderChannelsGroupedByZone(searchQuery);
    window.scrollTo({ top: scrollPos });
  },

  /**
   * Show channel editor modal
   */
  showChannelEditor(channelId = null) {
    const channel = channelId ? 
      window.codeplug.channels.find(c => c.id === channelId) : 
      window.codeplug.createChannel();
    
    const isEdit = !!channelId;

    // AM and FM Broadcast codeplug modes (chMode 2/3) are only understood by the
    // DM-32 / UV008 (C7000) firmware. Show the options only when that platform
    // is selected, but always keep an option present if the channel already uses
    // one so opening/saving the editor can't silently downgrade it.
    const showDm32Modes = this.supportsDm32AnalogModes() ||
      channel.type === CONFIG.CHANNEL_TYPES.AM ||
      channel.type === CONFIG.CHANNEL_TYPES.FM_BROADCAST;

    const contactOptions = window.codeplug.contacts.map(c => 
      `<option value="${Utils.escapeHtml(c.name)}" ${channel.contact === c.name ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`
    ).join('');
    
    const tgListOptions = window.codeplug.tgLists.map(t => 
      `<option value="${Utils.escapeHtml(t.name)}" ${channel.tgList === t.name ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`
    ).join('');
    
    const aprsOptions = window.codeplug.aprs.map(a => 
      `<option value="${Utils.escapeHtml(a.name)}" ${channel.aprs === a.name ? 'selected' : ''}>${Utils.escapeHtml(a.name)}</option>`
    ).join('');
    
    const content = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Channel Name</label>
          <input type="text" class="form-input" id="editChannelName" value="${Utils.escapeHtml(channel.name)}" maxlength="16">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="editChannelType" onchange="UI.toggleChannelTypeFields()">
            <option value="${CONFIG.CHANNEL_TYPES.ANALOG}" ${channel.type === CONFIG.CHANNEL_TYPES.ANALOG ? 'selected' : ''}>Analog (FM)</option>
            <option value="${CONFIG.CHANNEL_TYPES.DIGITAL}" ${channel.type === CONFIG.CHANNEL_TYPES.DIGITAL ? 'selected' : ''}>Digital (DMR)</option>
            ${showDm32Modes ? `
            <option value="${CONFIG.CHANNEL_TYPES.AM}" ${channel.type === CONFIG.CHANNEL_TYPES.AM ? 'selected' : ''}>AM (airband) &mdash; DM-32 only</option>
            <option value="${CONFIG.CHANNEL_TYPES.FM_BROADCAST}" ${channel.type === CONFIG.CHANNEL_TYPES.FM_BROADCAST ? 'selected' : ''}>FM Broadcast &mdash; DM-32 only</option>` : ''}
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">RX Frequency (MHz)</label>
          <input type="text" class="form-input" id="editChannelRxFreq" value="${channel.rxFreq}">
        </div>
        <div class="form-group">
          <label class="form-label">TX Frequency (MHz)</label>
          <input type="text" class="form-input" id="editChannelTxFreq" value="${channel.txFreq}">
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
        <button type="button" class="btn btn-sm btn-secondary" onclick="UI.editorSwapFreqs()" title="Swap TX and RX frequencies">
          <i class="mdi mdi-swap-horizontal"></i> Swap TX/RX
        </button>
        <button type="button" class="btn btn-sm btn-secondary" onclick="UI.editorCopyRxToTx()" title="Copy RX frequency to TX">
          <i class="mdi mdi-content-copy"></i> Copy RX → TX
        </button>
      </div>
      
      <div id="analogFields" style="display: ${channel.type !== CONFIG.CHANNEL_TYPES.DIGITAL ? '' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Bandwidth</label>
            <select class="form-select" id="editChannelBandwidth">
              <option value="12.5" ${channel.bandwidth === 12.5 ? 'selected' : ''}>12.5 kHz</option>
              <option value="25" ${channel.bandwidth === 25 ? 'selected' : ''}>25 kHz</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Squelch</label>
            <select class="form-select" id="editChannelSquelch">
              <option value="Disabled" ${channel.squelch === 'Disabled' ? 'selected' : ''}>Disabled</option>
              <option value="Normal" ${channel.squelch === 'Normal' ? 'selected' : ''}>Normal</option>
              <option value="Tight" ${channel.squelch === 'Tight' ? 'selected' : ''}>Tight</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RX CTCSS/DCS</label>
            <select class="form-select" id="editChannelRxTone">
              <option value="None">None</option>
              <optgroup label="CTCSS">
              ${CONFIG.CTCSS_TONES.filter(t => t !== 'None').map(t => 
                `<option value="${t}" ${channel.rxTone === t ? 'selected' : ''}>${t} Hz</option>`
              ).join('')}
              </optgroup>
              <optgroup label="DCS Normal">
              ${CONFIG.DCS_CODES.filter(c => c.endsWith('N')).map(c => 
                `<option value="${c}" ${channel.rxTone === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
              </optgroup>
              <optgroup label="DCS Inverted">
              ${CONFIG.DCS_CODES.filter(c => c.endsWith('I')).map(c => 
                `<option value="${c}" ${channel.rxTone === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">TX CTCSS/DCS</label>
            <select class="form-select" id="editChannelTxTone">
              <option value="None">None</option>
              <optgroup label="CTCSS">
              ${CONFIG.CTCSS_TONES.filter(t => t !== 'None').map(t => 
                `<option value="${t}" ${channel.txTone === t ? 'selected' : ''}>${t} Hz</option>`
              ).join('')}
              </optgroup>
              <optgroup label="DCS Normal">
              ${CONFIG.DCS_CODES.filter(c => c.endsWith('N')).map(c => 
                `<option value="${c}" ${channel.txTone === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
              </optgroup>
              <optgroup label="DCS Inverted">
              ${CONFIG.DCS_CODES.filter(c => c.endsWith('I')).map(c => 
                `<option value="${c}" ${channel.txTone === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
              </optgroup>
            </select>
          </div>
        </div>
      </div>
      
      <div id="digitalFields" style="display: ${channel.type === CONFIG.CHANNEL_TYPES.DIGITAL ? '' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Color Code</label>
            <select class="form-select" id="editChannelColorCode">
              ${CONFIG.COLOR_CODES.map(cc => 
                `<option value="${cc}" ${channel.colorCode === cc ? 'selected' : ''}>${cc}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Timeslot</label>
            <select class="form-select" id="editChannelTimeslot">
              <option value="1" ${channel.timeslot === 1 ? 'selected' : ''}>TS1</option>
              <option value="2" ${channel.timeslot === 2 ? 'selected' : ''}>TS2</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Contact</label>
            <select class="form-select" id="editChannelContact">
              <option value="">None</option>
              ${contactOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">TG List</label>
            <select class="form-select" id="editChannelTGList">
              <option value="">None</option>
              ${tgListOptions}
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Power</label>
          <select class="form-select" id="editChannelPower">
            ${CONFIG.POWER_LEVELS.map((p, i) => 
              `<option value="${p}" ${channel.power === p ? 'selected' : ''}>${CONFIG.POWER_LEVEL_LABELS[i] || p}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">TOT (seconds)</label>
          <input type="number" class="form-input" id="editChannelTOT" value="${channel.tot}" min="0" max="495" step="15">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label><input type="checkbox" id="editChannelRxOnly" ${channel.rxOnly ? 'checked' : ''}> RX Only</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="editChannelZoneSkip" ${channel.zoneSkip ? 'checked' : ''}> Zone Skip</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="editChannelAllSkip" ${channel.allSkip ? 'checked' : ''}> All Skip</label>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label><input type="checkbox" id="editChannelNoBeep" ${channel.noBeep ? 'checked' : ''}> No Beep</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="editChannelNoEco" ${channel.noEco ? 'checked' : ''}> No Eco</label>
        </div>
        <div class="form-group">
          <label class="form-label">VOX</label>
          <select class="form-select" id="editChannelVox">
            <option value="Off" ${channel.vox === 'Off' ? 'selected' : ''}>Off</option>
            <option value="1" ${channel.vox === '1' ? 'selected' : ''}>1</option>
            <option value="2" ${channel.vox === '2' ? 'selected' : ''}>2</option>
            <option value="3" ${channel.vox === '3' ? 'selected' : ''}>3</option>
            <option value="4" ${channel.vox === '4' ? 'selected' : ''}>4</option>
            <option value="5" ${channel.vox === '5' ? 'selected' : ''}>5</option>
            <option value="6" ${channel.vox === '6' ? 'selected' : ''}>6</option>
            <option value="7" ${channel.vox === '7' ? 'selected' : ''}>7</option>
            <option value="8" ${channel.vox === '8' ? 'selected' : ''}>8</option>
            <option value="9" ${channel.vox === '9' ? 'selected' : ''}>9</option>
            <option value="10" ${channel.vox === '10' ? 'selected' : ''}>10</option>
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">APRS Config</label>
          <select class="form-select" id="editChannelAprs">
            <option value="None" ${channel.aprs === 'None' || !channel.aprs ? 'selected' : ''}>None</option>
            ${aprsOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Override Master DMR ID</label>
          <input type="number" class="form-input" id="editChannelOverrideDmrId" value="${channel.overrideDmrId || 0}" min="0" max="16777215">
          <small class="form-help">Enter a specific DMR ID for this channel, or 0 to use radio's master DMR ID</small>
        </div>
      </div>
      
      <div id="digitalDmoFields" style="display: ${channel.type === CONFIG.CHANNEL_TYPES.DIGITAL ? '' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label><input type="checkbox" id="editChannelForceDmo" ${channel.forceDmo ? 'checked' : ''}> Force DMO</label>
            <small class="form-help">Force Direct Mode Operation (bypasses repeater)</small>
          </div>
        </div>
      </div>
      
      <div id="digitalTaFields" style="display: ${channel.type === CONFIG.CHANNEL_TYPES.DIGITAL ? '' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">TS1 Talker Alias TX</label>
            <select class="form-select" id="editChannelTs1TaTx">
              <option value="Off" ${channel.ts1TalkerAliasTx === 'Off' || !channel.ts1TalkerAliasTx ? 'selected' : ''}>Off</option>
              <option value="Text" ${channel.ts1TalkerAliasTx === 'Text' ? 'selected' : ''}>Text</option>
              <option value="APRS" ${channel.ts1TalkerAliasTx === 'APRS' ? 'selected' : ''}>APRS</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">TS2 Talker Alias TX</label>
            <select class="form-select" id="editChannelTs2TaTx">
              <option value="Off" ${channel.ts2TalkerAliasTx === 'Off' || !channel.ts2TalkerAliasTx ? 'selected' : ''}>Off</option>
              <option value="Text" ${channel.ts2TalkerAliasTx === 'Text' ? 'selected' : ''}>Text</option>
              <option value="APRS" ${channel.ts2TalkerAliasTx === 'APRS' ? 'selected' : ''}>APRS</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label><input type="checkbox" id="editChannelUseLocation" ${channel.useLocation ? 'checked' : ''} onchange="UI.toggleLocationFields()"> Use Location</label>
          <small class="form-help">Stores this channel's own coordinates, used for distance sorting, roaming and bearing. The APRS position comes from the APRS config ("Use Fixed Position") or GPS — set on the radio under APRS Options &gt; Location.</small>
        </div>
      </div>
      
      <div id="locationFields" style="display: ${channel.useLocation ? '' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Latitude</label>
            <input type="number" class="form-input" id="editChannelLatitude" value="${channel.latitude || 0}" step="0.000001" min="-90" max="90">
          </div>
          <div class="form-group">
            <label class="form-label">Longitude</label>
            <input type="number" class="form-input" id="editChannelLongitude" value="${channel.longitude || 0}" step="0.000001" min="-180" max="180">
          </div>
        </div>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit Channel' : 'Add Channel', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      wide: true,
      onConfirm: () => {
        this.saveChannel(channelId);
      }
    });

    // All Skip implies Zone Skip — auto-check Zone Skip when All Skip is checked
    const allSkipEl = document.getElementById('editChannelAllSkip');
    const zoneSkipEl = document.getElementById('editChannelZoneSkip');
    if (allSkipEl && zoneSkipEl) {
      allSkipEl.addEventListener('change', () => {
        if (allSkipEl.checked) {
          zoneSkipEl.checked = true;
          zoneSkipEl.disabled = true;
        } else {
          zoneSkipEl.disabled = false;
        }
      });
      // Apply initial state
      if (allSkipEl.checked) {
        zoneSkipEl.disabled = true;
      }
    }
  },

  /**
   * Build scan list options for select dropdown
   */
  buildScanListOptions(selectedScanList) {
    const scanLists = window.codeplug.scanLists || [];
    return scanLists.map(s => {
      const selected = selectedScanList === s.name ? 'selected' : '';
      const name = Utils.escapeHtml(s.name);
      return `<option value="${name}" ${selected}>${name}</option>`;
    }).join('');
  },

  /**
   * Toggle channel type fields
   */
  toggleChannelTypeFields() {
    const type = document.getElementById('editChannelType').value;
    // Analogue, AM and FM Broadcast all use the analogue fields; only Digital
    // (DMR) uses the digital fields.
    const isDigital = type === CONFIG.CHANNEL_TYPES.DIGITAL;
    document.getElementById('analogFields').style.display = isDigital ? 'none' : '';
    document.getElementById('digitalFields').style.display = isDigital ? '' : 'none';
    // Show/hide Force DMO fields for digital channels
    const dmoFields = document.getElementById('digitalDmoFields');
    if (dmoFields) {
      dmoFields.style.display = isDigital ? '' : 'none';
    }
    // Show/hide Talker Alias fields for digital channels
    const taFields = document.getElementById('digitalTaFields');
    if (taFields) {
      taFields.style.display = isDigital ? '' : 'none';
    }
  },

  /**
   * Toggle location fields
   */
  toggleLocationFields() {
    const useLocation = document.getElementById('editChannelUseLocation').checked;
    document.getElementById('locationFields').style.display = useLocation ? '' : 'none';
  },

  /**
   * Save channel from editor
   */
  saveChannel(channelId) {
    const channelData = {
      name: document.getElementById('editChannelName').value.trim(),
      type: document.getElementById('editChannelType').value,
      rxFreq: parseFloat(document.getElementById('editChannelRxFreq').value),
      txFreq: parseFloat(document.getElementById('editChannelTxFreq').value),
      bandwidth: parseFloat(document.getElementById('editChannelBandwidth').value),
      squelch: document.getElementById('editChannelSquelch').value,
      rxTone: document.getElementById('editChannelRxTone').value,
      txTone: document.getElementById('editChannelTxTone').value,
      colorCode: parseInt(document.getElementById('editChannelColorCode').value),
      timeslot: parseInt(document.getElementById('editChannelTimeslot').value),
      contact: document.getElementById('editChannelContact').value || null,
      tgList: document.getElementById('editChannelTGList').value || null,
      power: document.getElementById('editChannelPower').value,
      tot: parseInt(document.getElementById('editChannelTOT').value) || 0,
      rxOnly: document.getElementById('editChannelRxOnly').checked,
      zoneSkip: document.getElementById('editChannelZoneSkip').checked,
      allSkip: document.getElementById('editChannelAllSkip').checked,
      noBeep: document.getElementById('editChannelNoBeep').checked,
      noEco: document.getElementById('editChannelNoEco').checked,
      vox: document.getElementById('editChannelVox').value,
      aprs: document.getElementById('editChannelAprs').value,
      overrideDmrId: parseInt(document.getElementById('editChannelOverrideDmrId').value) || 0,
      forceDmo: document.getElementById('editChannelForceDmo')?.checked || false,
      ts1TalkerAliasTx: document.getElementById('editChannelTs1TaTx')?.value || 'Off',
      ts2TalkerAliasTx: document.getElementById('editChannelTs2TaTx')?.value || 'Off',
      useLocation: document.getElementById('editChannelUseLocation').checked,
      latitude: parseFloat(document.getElementById('editChannelLatitude').value) || 0,
      longitude: parseFloat(document.getElementById('editChannelLongitude').value) || 0
    };
    
    try {
      if (channelId) {
        window.codeplug.updateChannel(channelId, channelData);
        Utils.toast('Channel updated', 'success');
      } else {
        window.codeplug.addChannel(channelData);
        Utils.toast('Channel added', 'success');
      }
      
      this.hideModal();
      this.renderChannelsTable();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit channel
   */
  editChannel(channelId) {
    this.showChannelEditor(channelId);
  },

  /**
   * Delete channel
   */
  deleteChannel(channelId) {
    const channel = window.codeplug.channels.find(c => c.id === channelId);
    if (!channel) return;
    
    this.showModal('Delete Channel', `
      <p>Are you sure you want to delete channel "${Utils.escapeHtml(channel.name)}"?</p>
      <p class="text-muted">This action cannot be undone.</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteChannel(channelId);
        this.hideModal();
        this.renderChannelsTable();
        this.updateOverview();
        Utils.toast('Channel deleted', 'success');
      }
    });
  },

  /**
   * Swap TX and RX frequencies for a channel
   */
  swapChannelFreqs(channelId) {
    const channel = window.codeplug.channels.find(c => c.id === channelId);
    if (!channel) return;
    
    window.codeplug.updateChannel(channelId, {
      rxFreq: channel.txFreq,
      txFreq: channel.rxFreq
    });
    this.renderChannelsTable();
    Utils.toast('TX/RX frequencies swapped', 'success');
  },

  /**
   * Copy RX frequency to TX for a channel
   */
  copyRxToTxChannel(channelId) {
    const channel = window.codeplug.channels.find(c => c.id === channelId);
    if (!channel) return;
    
    window.codeplug.updateChannel(channelId, {
      txFreq: channel.rxFreq
    });
    this.renderChannelsTable();
    Utils.toast('RX copied to TX', 'success');
  },

  /**
   * Show CHIRP CSV merge/review modal with unmerged entries and suggestions
   * @param {string} [source='CHIRP'] - Label for the import source (e.g. 'CHIRP', 'Radio Reference UK')
   */
  showChirpMergeModal(entries, suggestions, source) {
    this._chirpSource = source || 'CHIRP';
    // Store mutable state for the merge interface
    this._chirpEntries = entries;
    this._chirpNextId = entries.length * 10;
    this._chirpShowDuplicates = false;

    // Build a set of existing channel keys (name + type) for duplicate detection
    const existingChannels = new Set();
    for (const ch of window.codeplug.channels) {
      const type = ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? 'DMR' : 'NFM';
      existingChannels.add(`${ch.name}\0${type}`);
    }

    this._chirpRows = entries.map((e, i) => {
      const truncatedName = Utils.truncate(e.name || '', CONFIG.LIMITS.CHANNEL_NAME_LEN);
      const key = `${truncatedName}\0${e.mode === 'FM' ? 'NFM' : e.mode}`;
      return {
        id: i,
        name: truncatedName,
        originalName: e.originalName || e.name || '',
        mode: e.mode,
        rxFreq: e.frequency,
        txFreq: e.frequency,
        bw: e.bw || 12.5,
        comment: e.comment,
        lat: e.lat || 0,
        lng: e.lng || 0,
        colorCode: e.colorCode || 0,
        tone: e.tone || 'None',
        txrx: e.txrx || '',
        selected: !existingChannels.has(key),
        merged: false,
        duplicate: existingChannels.has(key),
        sourceIndices: [i]
      };
    });
    this._chirpSuggestions = suggestions.map((s, i) => ({
      ...s,
      id: i,
      accepted: false,
      dismissed: false
    }));

    // Build zone options for the zone selector
    const zones = window.codeplug.zones || [];
    const zoneOptions = zones.map(z => `<option value="${z.id}">${Utils.escapeHtml(z.name)}</option>`).join('');

    const content = `
      <p style="margin-bottom:1rem">Review ${this._chirpSource} channels before importing. Use the merge suggestions below to combine RX/TX pairs. Duplicate channels already in your codeplug are hidden by default.</p>
      <div id="chirpMergeContent"></div>
      <div style="margin-top:1rem;padding:0.75rem;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-elevated)">
        <strong style="font-size:0.9rem"><i class="mdi mdi-map-marker-radius"></i> Add to Zone</strong>
        <div style="display:flex;gap:0.75rem;align-items:center;margin-top:0.5rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="chirpZoneOption" value="none" checked> No zone
          </label>
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="chirpZoneOption" value="new"> New zone
          </label>
          ${zones.length > 0 ? `
          <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="radio" name="chirpZoneOption" value="existing"> Existing zone
          </label>` : ''}
          <input type="text" class="form-input" id="chirpNewZoneName" placeholder="Zone name" maxlength="16" style="width:160px;display:none">
          <select class="form-select" id="chirpExistingZone" style="width:180px;display:none">
            ${zoneOptions}
          </select>
        </div>
      </div>
    `;

    this.showModal(`Import ${this._chirpSource} Channels`, content, {
      confirmText: 'Import Selected',
      extraWide: true,
      onConfirm: () => {
        this.importSelectedChirpChannels();
      }
    });

    // Bind zone option radio change
    document.querySelectorAll('input[name="chirpZoneOption"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const val = document.querySelector('input[name="chirpZoneOption"]:checked').value;
        document.getElementById('chirpNewZoneName').style.display = val === 'new' ? '' : 'none';
        document.getElementById('chirpExistingZone').style.display = val === 'existing' ? '' : 'none';
      });
    });

    this._renderChirpContent();
  },

  /**
   * Sync CHIRP merge table DOM state back to data
   */
  _syncChirpFromDOM() {
    for (const row of this._chirpRows) {
      const nameInput = document.querySelector(`.chirp-name[data-id="${row.id}"]`);
      const rxInput = document.querySelector(`.chirp-rx[data-id="${row.id}"]`);
      const txInput = document.querySelector(`.chirp-tx[data-id="${row.id}"]`);
      const bwSelect = document.querySelector(`.chirp-bw[data-id="${row.id}"]`);
      const cb = document.querySelector(`.chirp-select[data-id="${row.id}"]`);
      if (nameInput) row.name = Utils.truncate(nameInput.value, CONFIG.LIMITS.CHANNEL_NAME_LEN);
      if (rxInput) row.rxFreq = parseFloat(rxInput.value) || row.rxFreq;
      if (txInput) row.txFreq = parseFloat(txInput.value) || row.txFreq;
      if (bwSelect) row.bw = parseFloat(bwSelect.value) || row.bw;
      if (cb) row.selected = cb.checked;
    }
  },

  /**
   * Render the CHIRP merge modal content
   */
  _renderChirpContent() {
    const container = document.getElementById('chirpMergeContent');
    if (!container) return;

    // Pending merge suggestions
    const pending = this._chirpSuggestions.filter(s => !s.accepted && !s.dismissed);
    let suggestionsHtml = '';
    if (pending.length > 0) {
      const items = pending.map(s => {
        const eA = this._chirpEntries[s.entryA];
        const eB = this._chirpEntries[s.entryB];
        return `
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-color)">
            <span style="flex:1">
              <strong>${Utils.escapeHtml(eA.name)}</strong>
              <span class="channel-type ${eA.mode === 'DMR' ? 'digital' : 'analog'}" style="margin-left:0.25rem">${Utils.escapeHtml(eA.mode)}</span>
              <span style="margin-left:0.5rem">${eA.frequency} + ${eB.frequency} MHz</span>
            </span>
            <button class="btn btn-sm btn-success" onclick="UI.chirpAcceptSuggestion(${s.id})" title="Merge as RX/TX pair">
              <i class="mdi mdi-check"></i> Merge
            </button>
            <button class="btn btn-sm btn-secondary" onclick="UI.chirpDismissSuggestion(${s.id})" title="Keep as separate entries">
              <i class="mdi mdi-close"></i> Skip
            </button>
          </div>`;
      }).join('');

      suggestionsHtml = `
        <div style="margin-bottom:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
            <strong style="font-size:0.9rem"><i class="mdi mdi-lightbulb-outline"></i> Merge Suggestions</strong>
            ${pending.length > 1 ? `
              <span style="display:flex;gap:0.5rem">
                <button class="btn btn-sm btn-success" onclick="UI.chirpAcceptAllSuggestions()">
                  <i class="mdi mdi-check-all"></i> Accept All
                </button>
                <button class="btn btn-sm btn-secondary" onclick="UI.chirpSkipAllSuggestions()">
                  <i class="mdi mdi-close-circle-outline"></i> Skip All
                </button>
              </span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem">${items}</div>
        </div>`;
    }

    // Count duplicates
    const duplicateCount = this._chirpRows.filter(r => r.duplicate).length;
    const showDuplicates = this._chirpShowDuplicates || false;

    // Visible rows: hide duplicates by default, allow user to show
    const visibleRows = showDuplicates ? this._chirpRows : this._chirpRows.filter(r => !r.duplicate);

    // Toolbar
    const toolbarHtml = `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;align-items:center">
        <button class="btn btn-sm btn-secondary" onclick="UI.chirpSelectAll(true)">
          <i class="mdi mdi-checkbox-multiple-marked"></i> Select All
        </button>
        <button class="btn btn-sm btn-secondary" onclick="UI.chirpSelectAll(false)">
          <i class="mdi mdi-checkbox-multiple-blank-outline"></i> Deselect All
        </button>
        <button class="btn btn-sm btn-primary" onclick="UI.chirpMergeSelected()" title="Check exactly 2 rows then click to merge as TX/RX pair">
          <i class="mdi mdi-call-merge"></i> Merge 2 Checked
        </button>
        ${duplicateCount > 0 ? `
          <span style="margin-left:auto;font-size:0.8rem;color:var(--text-muted)">
            ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} ${showDuplicates ? 'shown' : 'hidden'}
            <button class="btn btn-sm btn-secondary" onclick="UI.chirpToggleDuplicates()" style="margin-left:0.25rem">
              ${showDuplicates ? 'Hide' : 'Show'}
            </button>
          </span>` : ''}
      </div>
    `;

    // Table rows
    const tableRows = visibleRows.map(row => {
      const isDup = row.duplicate;
      let rowStyle = '';
      if (row.merged) rowStyle = 'background:rgba(72,187,120,0.08)';
      else if (isDup) rowStyle = 'opacity:0.5';
      return `
      <tr data-chirp-id="${row.id}" ${rowStyle ? `style="${rowStyle}"` : ''}>
        <td><input type="checkbox" class="chirp-select" data-id="${row.id}" ${row.selected ? 'checked' : ''}></td>
        <td class="text-muted" style="font-size:0.8em;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(row.originalName)}">${Utils.escapeHtml(row.originalName)}</td>
        <td><input type="text" class="form-input chirp-name" data-id="${row.id}" value="${Utils.escapeHtml(row.name)}" maxlength="${CONFIG.LIMITS.CHANNEL_NAME_LEN}" style="width:140px"></td>
        <td><span class="channel-type ${row.mode === 'DMR' ? 'digital' : 'analog'}">${Utils.escapeHtml(row.mode)}</span></td>
        <td><input type="text" class="form-input chirp-rx" data-id="${row.id}" value="${row.rxFreq}" style="width:110px"></td>
        <td><input type="text" class="form-input chirp-tx" data-id="${row.id}" value="${row.txFreq}" style="width:110px"></td>
        <td>
          <select class="form-select chirp-bw" data-id="${row.id}" style="width:75px;padding:0.25rem">
            <option value="12.5" ${row.bw === 12.5 ? 'selected' : ''}>12.5</option>
            <option value="25" ${row.bw === 25 ? 'selected' : ''}>25</option>
          </select>
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="UI.chirpSwapFreqs(${row.id})" title="Swap TX/RX">
            <i class="mdi mdi-swap-horizontal"></i>
          </button>
          ${row.merged ? `
            <button class="btn btn-sm btn-secondary" onclick="UI.chirpUnmergeRow(${row.id})" title="Split back into two rows">
              <i class="mdi mdi-call-split"></i>
            </button>` : ''}
        </td>
        <td class="text-muted" style="font-size:0.8em">${Utils.escapeHtml(row.comment)}</td>
      </tr>
    `}).join('');

    const tableHtml = `
      <div style="max-height:400px;overflow:auto">
        <table class="data-table" id="chirpMergeTable">
          <thead>
            <tr>
              <th style="width:40px"></th>
              <th>Original</th>
              <th>Name</th>
              <th>Mode</th>
              <th>RX Freq</th>
              <th>TX Freq</th>
              <th>BW</th>
              <th style="width:90px"></th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;

    container.innerHTML = suggestionsHtml + toolbarHtml + tableHtml;
  },

  /**
   * Accept a merge suggestion
   */
  chirpAcceptSuggestion(suggestionId) {
    this._syncChirpFromDOM();
    const suggestion = this._chirpSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    const rowA = this._chirpRows.find(r => !r.merged && r.sourceIndices.includes(suggestion.entryA));
    const rowB = this._chirpRows.find(r => !r.merged && r.sourceIndices.includes(suggestion.entryB));
    if (!rowA || !rowB) {
      Utils.toast('Cannot merge: one or both entries already merged', 'warning');
      return;
    }

    this._chirpMergeRows(rowA, rowB);
    suggestion.accepted = true;
    this._renderChirpContent();
  },

  /**
   * Dismiss a merge suggestion
   */
  chirpDismissSuggestion(suggestionId) {
    const suggestion = this._chirpSuggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.dismissed = true;
      this._renderChirpContent();
    }
  },

  /**
   * Accept all pending merge suggestions
   */
  chirpAcceptAllSuggestions() {
    this._syncChirpFromDOM();
    const pending = this._chirpSuggestions.filter(s => !s.accepted && !s.dismissed);
    for (const suggestion of pending) {
      const rowA = this._chirpRows.find(r => !r.merged && r.sourceIndices.includes(suggestion.entryA));
      const rowB = this._chirpRows.find(r => !r.merged && r.sourceIndices.includes(suggestion.entryB));
      if (!rowA || !rowB) continue;
      this._chirpMergeRows(rowA, rowB);
      suggestion.accepted = true;
    }
    this._renderChirpContent();
  },

  /**
   * Skip (dismiss) all pending merge suggestions
   */
  chirpSkipAllSuggestions() {
    const pending = this._chirpSuggestions.filter(s => !s.accepted && !s.dismissed);
    for (const suggestion of pending) {
      suggestion.dismissed = true;
    }
    this._renderChirpContent();
  },

  /**
   * Toggle visibility of duplicate channels in the merge table
   */
  chirpToggleDuplicates() {
    this._syncChirpFromDOM();
    this._chirpShowDuplicates = !this._chirpShowDuplicates;
    this._renderChirpContent();
  },

  /**
   * Merge two CHIRP rows into one TX/RX pair
   */
  _chirpMergeRows(rowA, rowB) {
    let rxFreq, txFreq, primary;

    // If entries carry TX/RX designation (Radio Reference UK), use it
    if (rowA.txrx === 'R' && rowB.txrx === 'T') {
      rxFreq = rowA.rxFreq;
      txFreq = rowB.rxFreq;
      primary = rowA;
    } else if (rowA.txrx === 'T' && rowB.txrx === 'R') {
      rxFreq = rowB.rxFreq;
      txFreq = rowA.rxFreq;
      primary = rowB;
    } else {
      // Default: lower frequency as RX, higher as TX
      const freqA = rowA.rxFreq;
      const freqB = rowB.rxFreq;
      rxFreq = Math.min(freqA, freqB);
      txFreq = Math.max(freqA, freqB);
      primary = freqA <= freqB ? rowA : rowB;
    }

    const mergedRow = {
      id: this._chirpNextId++,
      name: primary.name,
      originalName: primary.originalName || primary.name,
      mode: primary.mode,
      rxFreq: rxFreq,
      txFreq: txFreq,
      bw: primary.bw || 12.5,
      comment: rowA.comment || rowB.comment,
      lat: rowA.lat ?? rowB.lat ?? 0,
      lng: rowA.lng ?? rowB.lng ?? 0,
      colorCode: rowA.colorCode || rowB.colorCode || 0,
      tone: (rowA.tone && rowA.tone !== 'None') ? rowA.tone : (rowB.tone || 'None'),
      selected: true,
      merged: true,
      sourceIndices: [...rowA.sourceIndices, ...rowB.sourceIndices]
    };
    const idxA = this._chirpRows.indexOf(rowA);
    const idxB = this._chirpRows.indexOf(rowB);
    if (idxA > idxB) {
      this._chirpRows.splice(idxA, 1);
      this._chirpRows.splice(idxB, 1, mergedRow);
    } else {
      this._chirpRows.splice(idxB, 1);
      this._chirpRows.splice(idxA, 1, mergedRow);
    }
  },

  /**
   * Manually merge two checked rows as TX/RX pair
   */
  chirpMergeSelected() {
    this._syncChirpFromDOM();
    const checkedRows = this._chirpRows.filter(r => r.selected);
    if (checkedRows.length !== 2) {
      Utils.toast('Check exactly 2 rows to merge as a TX/RX pair', 'warning');
      return;
    }
    this._chirpMergeRows(checkedRows[0], checkedRows[1]);
    this._renderChirpContent();
    Utils.toast('Rows merged as TX/RX pair', 'success');
  },

  /**
   * Unmerge a merged row back into individual entries
   */
  chirpUnmergeRow(rowId) {
    this._syncChirpFromDOM();
    const row = this._chirpRows.find(r => r.id === rowId);
    if (!row || !row.merged) return;

    const idx = this._chirpRows.indexOf(row);
    const newRows = row.sourceIndices.map(si => {
      const entry = this._chirpEntries[si];
      return {
        id: this._chirpNextId++,
        name: entry.name,
        originalName: entry.originalName || entry.name || '',
        mode: entry.mode,
        rxFreq: entry.frequency,
        txFreq: entry.frequency,
        bw: entry.bw || row.bw || 12.5,
        comment: entry.comment,
        lat: entry.lat || 0,
        lng: entry.lng || 0,
        colorCode: entry.colorCode || 0,
        tone: entry.tone || 'None',
        txrx: entry.txrx || '',
        selected: true,
        merged: false,
        sourceIndices: [si]
      };
    });

    this._chirpRows.splice(idx, 1, ...newRows);

    // Re-enable any accepted suggestion for these entries
    for (const s of this._chirpSuggestions) {
      if (s.accepted && row.sourceIndices.includes(s.entryA) && row.sourceIndices.includes(s.entryB)) {
        s.accepted = false;
      }
    }

    this._renderChirpContent();
    Utils.toast('Row split into individual entries', 'success');
  },

  /**
   * Swap RX/TX in a CHIRP merge table row
   */
  chirpSwapFreqs(rowId) {
    this._syncChirpFromDOM();
    const row = this._chirpRows.find(r => r.id === rowId);
    if (row) {
      const tmp = row.rxFreq;
      row.rxFreq = row.txFreq;
      row.txFreq = tmp;
      const rxInput = document.querySelector(`.chirp-rx[data-id="${rowId}"]`);
      const txInput = document.querySelector(`.chirp-tx[data-id="${rowId}"]`);
      if (rxInput) rxInput.value = row.rxFreq;
      if (txInput) txInput.value = row.txFreq;
    }
  },

  /**
   * Select/deselect all CHIRP merge rows
   */
  chirpSelectAll(checked) {
    const showDuplicates = this._chirpShowDuplicates || false;
    this._chirpRows.forEach(r => {
      if (showDuplicates || !r.duplicate) r.selected = checked;
    });
    document.querySelectorAll('.chirp-select').forEach(cb => cb.checked = checked);
  },

  /**
   * Import selected channels from the CHIRP merge table
   */
  importSelectedChirpChannels() {
    this._syncChirpFromDOM();

    const channels = this._chirpRows
      .filter(r => r.selected)
      .map(r => ({
        name: Utils.truncate(r.name || '', CONFIG.LIMITS.CHANNEL_NAME_LEN),
        mode: r.mode === 'FM' ? 'NFM' : r.mode,
        rxFreq: r.rxFreq,
        txFreq: r.txFreq,
        bw: r.bw || 12.5,
        lat: r.lat || 0,
        lng: r.lng || 0,
        colorCode: r.colorCode || 0,
        tone: r.tone || 'None'
      }));

    if (channels.length === 0) {
      Utils.toast('No channels selected', 'warning');
      return;
    }

    // Determine zone option
    const zoneOption = document.querySelector('input[name="chirpZoneOption"]:checked');
    const zoneValue = zoneOption ? zoneOption.value : 'none';
    let targetZone = null;

    if (zoneValue === 'new') {
      const zoneName = (document.getElementById('chirpNewZoneName').value || '').trim();
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
      const zoneId = document.getElementById('chirpExistingZone').value;
      targetZone = window.codeplug.zones.find(z => String(z.id) === zoneId);
      if (!targetZone) {
        Utils.toast('Selected zone not found', 'error');
        return;
      }
    }

    const count = window.codeplug.importChirpChannels(channels);
    const sourceLabel = this._chirpSource || 'CHIRP';

    // Add imported channel names to the target zone
    if (targetZone && count > 0) {
      const existingNames = new Set(targetZone.channels);
      const channelNames = channels.slice(0, count).map(c => c.name).filter(n => !existingNames.has(n));
      const maxPerZone = getEffectiveLimits().MAX_CHANNELS_PER_ZONE;
      const availableSlots = maxPerZone - targetZone.channels.length;

      if (channelNames.length > availableSlots) {
        // Overflow detected - ask user about splitting
        const totalZonesNeeded = 1 + Math.ceil((channelNames.length - availableSlots) / maxPerZone);
        const baseName = targetZone.name;

        // Hide the import modal first
        this.hideModal();
        this.renderChannelsTable();
        this.updateOverview();

        this.showModal('Zone Limit Exceeded', `
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
            this.hideModal();
            this.renderZones();
            this.updateOverview();
            Utils.toast(`Imported ${count} ${sourceLabel} channel${count !== 1 ? 's' : ''} split across ${zoneNum - 1} zones`, 'success');
          }
        });
        return;
      }

      // All channels fit in the target zone
      channelNames.forEach(n => targetZone.channels.push(n));
      window.codeplug.modified = true;
    }

    this.hideModal();
    this.renderChannelsTable();
    if (targetZone) this.renderZones();
    this.updateOverview();
    Utils.toast(`Imported ${count} ${sourceLabel} channel${count !== 1 ? 's' : ''}${targetZone ? ' into zone "' + targetZone.name + '"' : ''}`, 'success');
  },

  /**
   * Swap RX/TX frequencies in the channel editor modal
   */
  editorSwapFreqs() {
    const rxInput = document.getElementById('editChannelRxFreq');
    const txInput = document.getElementById('editChannelTxFreq');
    if (rxInput && txInput) {
      const tmp = rxInput.value;
      rxInput.value = txInput.value;
      txInput.value = tmp;
    }
  },

  /**
   * Copy RX frequency to TX in the channel editor modal
   */
  editorCopyRxToTx() {
    const rxInput = document.getElementById('editChannelRxFreq');
    const txInput = document.getElementById('editChannelTxFreq');
    if (rxInput && txInput) {
      txInput.value = rxInput.value;
    }
  },

  /**
   * Move channel up or down
   */
  moveChannel(channelId, direction) {
    // Moving by hand works on the manual order - drop any active sort first.
    if (this._channelSortState()) {
      this._channelSort = null;
      Utils.storage.remove(CONFIG.STORAGE.CHANNEL_SORT);
    }
    const channels = window.codeplug.channels;
    const index = channels.findIndex(c => c.id === channelId);
    if (index === -1) return;
    
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= channels.length) return;
    
    // Swap channels
    [channels[index], channels[newIndex]] = [channels[newIndex], channels[index]];
    
    // Renumber channels
    this.renumberChannels();
    
    window.codeplug.modified = true;
    this.renderChannelsTable();
    Utils.toast('Channel moved', 'success');
  },

  /**
   * Show dialog to move channel to specific position
   */
  showMoveChannelDialog(channelId, currentNumber) {
    const totalChannels = window.codeplug.channels.length;
    
    this.showModal('Move Channel', `
      <div class="form-group">
        <label class="form-label">Move channel to position:</label>
        <input type="number" class="form-input" id="moveToPosition" value="${currentNumber}" min="1" max="${totalChannels}">
        <small class="form-help">Enter a number from 1 to ${totalChannels}. The channel at that position and all subsequent channels will shift down.</small>
      </div>
    `, {
      confirmText: 'Move',
      onConfirm: () => {
        const newPosition = parseInt(document.getElementById('moveToPosition').value);
        if (newPosition >= 1 && newPosition <= totalChannels) {
          this.moveChannelToPosition(channelId, newPosition);
          this.hideModal();
        } else {
          Utils.toast('Invalid position', 'error');
        }
      }
    });
  },

  /**
   * Move channel to a specific position
   */
  moveChannelToPosition(channelId, newPosition) {
    const channels = window.codeplug.channels;
    const currentIndex = channels.findIndex(c => c.id === channelId);
    if (currentIndex === -1) return;
    
    const newIndex = newPosition - 1;
    if (newIndex < 0 || newIndex >= channels.length) return;
    if (currentIndex === newIndex) return;
    
    // Remove channel from current position
    const [channel] = channels.splice(currentIndex, 1);
    
    // Insert at new position
    channels.splice(newIndex, 0, channel);
    
    // Renumber all channels
    this.renumberChannels();
    
    window.codeplug.modified = true;
    this.renderChannelsTable();
    Utils.toast(`Channel moved to position ${newPosition}`, 'success');
  },

  /**
   * Renumber all channels sequentially
   */
  renumberChannels() {
    window.codeplug.channels.forEach((ch, idx) => {
      ch.number = idx + 1;
    });
  },

  // Drag and drop state
  draggedElement: null,

  /**
   * Handle drag start
   */
  handleDragStart(event) {
    // Dragging always sets the manual order, so drop any active sort first.
    if (this._channelSortState()) {
      this._channelSort = null;
      Utils.storage.remove(CONFIG.STORAGE.CHANNEL_SORT);
      Utils.toast('Sort cleared - dragging sets the manual order', 'info');
    }
    this.draggedElement = event.target.closest('tr');
    this.draggedElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.draggedElement.dataset.id);
  },

  /**
   * Handle drag over
   */
  handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const targetRow = event.target.closest('tr');
    if (targetRow && targetRow !== this.draggedElement) {
      const tbody = targetRow.parentNode;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const draggedIndex = rows.indexOf(this.draggedElement);
      const targetIndex = rows.indexOf(targetRow);
      
      if (draggedIndex < targetIndex) {
        targetRow.after(this.draggedElement);
      } else {
        targetRow.before(this.draggedElement);
      }
    }
  },

  /**
   * Handle drop
   */
  handleDrop(event) {
    event.preventDefault();
    
    const draggedId = event.dataTransfer.getData('text/plain');
    const tbody = document.getElementById('channelsTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Build new order based on current DOM order
    const newOrder = rows.map(row => row.dataset.id);
    
    // Reorder channels array to match DOM order
    const channels = window.codeplug.channels;
    const reordered = newOrder.map(id => channels.find(c => c.id === id)).filter(Boolean);
    
    // Replace channels array
    window.codeplug.channels = reordered;
    
    // Renumber
    this.renumberChannels();
    
    window.codeplug.modified = true;
    Utils.toast('Channels reordered', 'success');
  },

  /**
   * Handle drag end
   */
  handleDragEnd(event) {
    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      this.draggedElement = null;
    }
    // Refresh the table to ensure numbers are updated, preserving scroll position
    const scrollPos = window.scrollY;
    this.renderChannelsTable();
    window.scrollTo({ top: scrollPos });
  },

  /**
   * Export channels to CSV
   */
  exportChannels() {
    const csv = window.codeplug.exportChannelsCSV();
    Utils.downloadFile(csv, 'Channels.csv', 'text/csv');
    Utils.toast('Channels exported', 'success');
  },

  /**
   * Render contacts table
   */
  renderContactsTable(filter = '') {
    const tbody = document.getElementById('contactsTableBody');
    const empty = document.getElementById('contactsEmpty');
    const table = document.getElementById('contactsTable');
    
    let contacts = window.codeplug.contacts;
    
    if (filter) {
      const q = filter.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(q) ||
        String(c.dmrId).includes(q)
      );
    }
    
    if (contacts.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = contacts.map(c => `
      <tr data-id="${c.id}">
        <td>${Utils.escapeHtml(c.name)}</td>
        <td>${c.dmrId}</td>
        <td>${c.type}</td>
        <td>${c.tsOverride}</td>
        <td class="actions">
          <button class="action-btn" onclick="UI.editContact('${c.id}')" title="Edit">
            <i class="mdi mdi-pencil"></i>
          </button>
          <button class="action-btn danger" onclick="UI.deleteContact('${c.id}')" title="Delete">
            <i class="mdi mdi-delete"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Filter contacts
   */
  filterContacts(query) {
    this.renderContactsTable(query);
  },

  /**
   * Show contact editor
   */
  showContactEditor(contactId = null) {
    const contact = contactId ? 
      window.codeplug.contacts.find(c => c.id === contactId) : 
      window.codeplug.createContact();
    
    const isEdit = !!contactId;
    
    const content = `
      <div class="form-group">
        <label class="form-label">Contact Name</label>
        <input type="text" class="form-input" id="editContactName" value="${Utils.escapeHtml(contact.name)}" maxlength="16">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">DMR ID / TG Number</label>
          <input type="number" class="form-input" id="editContactDmrId" value="${contact.dmrId}" min="0" max="16777215">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="editContactType">
            <option value="Group" ${contact.type === 'Group' ? 'selected' : ''}>Group Call (TG)</option>
            <option value="Private" ${contact.type === 'Private' ? 'selected' : ''}>Private Call</option>
            <option value="AllCall" ${contact.type === 'AllCall' ? 'selected' : ''}>All Call</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Timeslot Override</label>
        <select class="form-select" id="editContactTsOverride">
          <option value="Disabled" ${contact.tsOverride === 'Disabled' ? 'selected' : ''}>Disabled</option>
          <option value="1" ${contact.tsOverride === '1' ? 'selected' : ''}>TS1</option>
          <option value="2" ${contact.tsOverride === '2' ? 'selected' : ''}>TS2</option>
        </select>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit Contact' : 'Add Contact', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      onConfirm: () => {
        this.saveContact(contactId);
      }
    });
  },

  /**
   * Save contact
   */
  saveContact(contactId) {
    const contactData = {
      name: document.getElementById('editContactName').value.trim(),
      dmrId: parseInt(document.getElementById('editContactDmrId').value) || 0,
      type: document.getElementById('editContactType').value,
      tsOverride: document.getElementById('editContactTsOverride').value
    };
    
    try {
      if (contactId) {
        window.codeplug.updateContact(contactId, contactData);
        Utils.toast('Contact updated', 'success');
      } else {
        window.codeplug.addContact(contactData);
        Utils.toast('Contact added', 'success');
      }
      
      this.hideModal();
      this.renderContactsTable();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit contact
   */
  editContact(contactId) {
    this.showContactEditor(contactId);
  },

  /**
   * Delete contact
   */
  deleteContact(contactId) {
    const contact = window.codeplug.contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    this.showModal('Delete Contact', `
      <p>Are you sure you want to delete contact "${Utils.escapeHtml(contact.name)}"?</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteContact(contactId);
        this.hideModal();
        this.renderContactsTable();
        this.updateOverview();
        Utils.toast('Contact deleted', 'success');
      }
    });
  },

  /**
   * Render TG Lists
   */
  renderTGLists(filter = '') {
    const tbody = document.getElementById('tglistsTableBody');
    const empty = document.getElementById('tglistsEmpty');
    const table = document.getElementById('tglistsTable');
    
    let tgLists = window.codeplug.tgLists;
    
    if (filter) {
      const q = filter.toLowerCase();
      tgLists = tgLists.filter(tg => 
        tg.name.toLowerCase().includes(q) ||
        tg.contacts.some(c => c.toLowerCase().includes(q))
      );
    }
    
    if (tgLists.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = tgLists.map((tg, index) => `
      <tr data-id="${tg.id}" data-index="${index}" draggable="true" ondragstart="UI.handleTGListDragStart(event)" ondragover="UI.handleTGListDragOver(event)" ondrop="UI.handleTGListDrop(event)" ondragend="UI.handleTGListDragEnd(event)">
        <td class="drag-handle" title="Drag to reorder">
          <i class="mdi mdi-drag-vertical"></i>
          <span class="tglist-number">${index + 1}</span>
        </td>
        <td>${Utils.escapeHtml(tg.name)}</td>
        <td>${tg.contacts.length}</td>
        <td class="contact-list-cell">
          ${tg.contacts.slice(0, CONFIG.UI.MAX_DISPLAYED_TAGS).map(c => `<span class="tglist-tag">${Utils.escapeHtml(c)}</span>`).join('')}
          ${tg.contacts.length > CONFIG.UI.MAX_DISPLAYED_TAGS ? `<span class="tglist-tag">+${tg.contacts.length - CONFIG.UI.MAX_DISPLAYED_TAGS} more</span>` : ''}
          ${tg.contacts.length === 0 ? '<span class="text-muted">Empty</span>' : ''}
        </td>
        <td class="actions">
          <button class="action-btn" onclick="UI.moveTGList('${tg.id}', -1)" title="Move Up">
            <i class="mdi mdi-arrow-up"></i>
          </button>
          <button class="action-btn" onclick="UI.moveTGList('${tg.id}', 1)" title="Move Down">
            <i class="mdi mdi-arrow-down"></i>
          </button>
          <button class="action-btn" onclick="UI.editTGList('${tg.id}')" title="Edit">
            <i class="mdi mdi-pencil"></i>
          </button>
          <button class="action-btn danger" onclick="UI.deleteTGList('${tg.id}')" title="Delete">
            <i class="mdi mdi-delete"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },
  
  /**
   * Filter TG lists
   */
  filterTGLists(query) {
    this.renderTGLists(query);
  },

  /**
   * Show TG list editor
   */
  showTGListEditor(tgListId = null) {
    const tgList = tgListId ? 
      window.codeplug.tgLists.find(t => t.id === tgListId) : 
      window.codeplug.createTGList();
    
    const isEdit = !!tgListId;
    
    // Store editing state using contact IDs instead of names
    const usedContactIds = new Set();
    this._editingTGListContacts = tgList.contacts.map(name => {
      const contact = window.codeplug.contacts.find(c => c.name === name && !usedContactIds.has(c.id));
      if (contact) {
        usedContactIds.add(contact.id);
        return contact.id;
      }
      return null;
    }).filter(id => id !== null);
    this._availableTGListContactsSelection = [];
    this._selectedTGListContactsSelection = [];
    
    const content = `
      <div class="form-group">
        <label class="form-label">TG List Name</label>
        <input type="text" class="form-input" id="editTGListName" value="${Utils.escapeHtml(tgList.name)}" maxlength="16">
      </div>
      <div class="form-group">
        <label class="form-label">Contacts</label>
        <div class="dual-list-picker">
          <div class="dual-list-column">
            <div class="dual-list-header">Available Contacts</div>
            <div class="dual-list-search">
              <input type="text" id="tglistAvailableSearch" placeholder="Search..." oninput="UI.filterTGListAvailableList()">
            </div>
            <div class="dual-list-items" id="tglistAvailableList"></div>
          </div>
          <div class="dual-list-buttons">
            <button class="dual-list-btn" onclick="UI.addSelectedTGListContacts()" title="Add selected">
              <i class="mdi mdi-chevron-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.addAllTGListContacts()" title="Add all">
              <i class="mdi mdi-chevron-double-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeSelectedTGListContacts()" title="Remove selected">
              <i class="mdi mdi-chevron-left"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeAllTGListContacts()" title="Remove all">
              <i class="mdi mdi-chevron-double-left"></i>
            </button>
          </div>
          <div class="dual-list-column">
            <div class="dual-list-header">
              Contacts in TG List (<span id="tglistContactCount">0</span>)
              <span class="dual-list-reorder-buttons">
                <button class="dual-list-btn-sm" onclick="UI.moveTGListContactUp()" title="Move selected up">
                  <i class="mdi mdi-arrow-up"></i>
                </button>
                <button class="dual-list-btn-sm" onclick="UI.moveTGListContactDown()" title="Move selected down">
                  <i class="mdi mdi-arrow-down"></i>
                </button>
              </span>
            </div>
            <div class="dual-list-items" id="tglistSelectedList"></div>
          </div>
        </div>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit TG List' : 'Add TG List', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      wide: true,
      onConfirm: () => {
        this.saveTGList(tgListId);
      }
    });
    
    // Populate lists after modal is shown
    this.updateTGListDualLists();
  },

  /**
   * Update TG list dual list displays
   */
  updateTGListDualLists() {
    const availableList = document.getElementById('tglistAvailableList');
    const selectedList = document.getElementById('tglistSelectedList');
    const countEl = document.getElementById('tglistContactCount');
    const searchValue = document.getElementById('tglistAvailableSearch')?.value?.toLowerCase() || '';
    
    // Get available contacts (not in TG list) - filter by ID
    let availableContacts = window.codeplug.contacts.filter(c => 
      !this._editingTGListContacts.includes(c.id)
    );
    
    // Apply search filter
    if (searchValue) {
      availableContacts = availableContacts.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.dmrId).includes(searchValue)
      );
    }
    
    // Store visible IDs for shift+click range selection
    this._tgListAvailableIds = availableContacts.map(c => c.id);

    // Render available list using contact IDs
    availableList.innerHTML = availableContacts.map(c => `
      <div class="dual-list-item ${this._availableTGListContactsSelection.includes(c.id) ? 'selected' : ''}" 
           data-id="${Utils.escapeHtml(c.id)}"
           onclick="UI.toggleTGListAvailableSelection('${Utils.escapeJsString(c.id)}', event)"
           ondblclick="UI.addTGListContactById('${Utils.escapeJsString(c.id)}')">
        <span>${Utils.escapeHtml(c.name)}</span>
        <span class="dual-list-item-info">${c.dmrId}</span>
      </div>
    `).join('');
    
    // Render selected list using contact IDs
    selectedList.innerHTML = this._editingTGListContacts.map((id, i) => {
      const contact = window.codeplug.contacts.find(c => c.id === id);
      return `
        <div class="dual-list-item ${this._selectedTGListContactsSelection.includes(id) ? 'selected' : ''}"
             data-id="${Utils.escapeHtml(id)}"
             onclick="UI.toggleTGListSelectedSelection('${Utils.escapeJsString(id)}', event)"
             ondblclick="UI.removeTGListContactById('${Utils.escapeJsString(id)}')">
          <span>${i + 1}. ${Utils.escapeHtml(contact ? contact.name : '')}</span>
          <span class="dual-list-item-info">${contact ? contact.dmrId : ''}</span>
        </div>
      `;
    }).join('');
    
    // Update count
    if (countEl) {
      countEl.textContent = this._editingTGListContacts.length;
    }
  },

  /**
   * Filter TG list available list
   */
  filterTGListAvailableList() {
    this.updateTGListDualLists();
  },

  /**
   * Toggle selection in available list
   */
  toggleTGListAvailableSelection(id, event) {
    this._handleDualListClick('tglistAvailable', id, event,
      this._availableTGListContactsSelection,
      this._tgListAvailableIds || []);
    this.updateTGListDualLists();
  },

  /**
   * Toggle selection in selected list
   */
  toggleTGListSelectedSelection(id, event) {
    this._handleDualListClick('tglistSelected', id, event,
      this._selectedTGListContactsSelection,
      this._editingTGListContacts || []);
    this.updateTGListDualLists();
  },

  /**
   * Add contact by ID (double-click)
   */
  addTGListContactById(id) {
    if (this._editingTGListContacts.length >= CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST) {
      Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST} contacts per TG list`, 'warning');
      return;
    }
    if (!this._editingTGListContacts.includes(id)) {
      this._editingTGListContacts.push(id);
      this._availableTGListContactsSelection = this._availableTGListContactsSelection.filter(n => n !== id);
      this.updateTGListDualLists();
    }
  },

  /**
   * Remove contact by ID (double-click)
   */
  removeTGListContactById(id) {
    const index = this._editingTGListContacts.indexOf(id);
    if (index !== -1) {
      this._editingTGListContacts.splice(index, 1);
      this._selectedTGListContactsSelection = this._selectedTGListContactsSelection.filter(n => n !== id);
      this.updateTGListDualLists();
    }
  },

  /**
   * Add selected contacts to TG list
   */
  addSelectedTGListContacts() {
    for (const id of this._availableTGListContactsSelection) {
      if (this._editingTGListContacts.length >= CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST) {
        Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST} contacts per TG list`, 'warning');
        break;
      }
      if (!this._editingTGListContacts.includes(id)) {
        this._editingTGListContacts.push(id);
      }
    }
    this._availableTGListContactsSelection = [];
    this.updateTGListDualLists();
  },

  /**
   * Add all available contacts to TG list
   */
  addAllTGListContacts() {
    const searchValue = document.getElementById('tglistAvailableSearch')?.value?.toLowerCase() || '';
    let availableContacts = window.codeplug.contacts.filter(c => 
      !this._editingTGListContacts.includes(c.id)
    );
    
    if (searchValue) {
      availableContacts = availableContacts.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.dmrId).includes(searchValue)
      );
    }
    
    for (const contact of availableContacts) {
      if (this._editingTGListContacts.length >= CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST) {
        Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST} contacts per TG list`, 'warning');
        break;
      }
      this._editingTGListContacts.push(contact.id);
    }
    this._availableTGListContactsSelection = [];
    this.updateTGListDualLists();
  },

  /**
   * Remove selected contacts from TG list
   */
  removeSelectedTGListContacts() {
    this._editingTGListContacts = this._editingTGListContacts.filter(
      id => !this._selectedTGListContactsSelection.includes(id)
    );
    this._selectedTGListContactsSelection = [];
    this.updateTGListDualLists();
  },

  /**
   * Remove all contacts from TG list
   */
  removeAllTGListContacts() {
    this._editingTGListContacts = [];
    this._selectedTGListContactsSelection = [];
    this.updateTGListDualLists();
  },

  /**
   * Move selected TG list contact up
   */
  moveTGListContactUp() {
    if (this._selectedTGListContactsSelection.length !== 1) {
      Utils.toast('Select exactly one contact to move', 'warning');
      return;
    }
    const id = this._selectedTGListContactsSelection[0];
    const index = this._editingTGListContacts.indexOf(id);
    if (index > 0) {
      // Swap with previous
      [this._editingTGListContacts[index - 1], this._editingTGListContacts[index]] = 
        [this._editingTGListContacts[index], this._editingTGListContacts[index - 1]];
      this.updateTGListDualLists();
    }
  },

  /**
   * Move selected TG list contact down
   */
  moveTGListContactDown() {
    if (this._selectedTGListContactsSelection.length !== 1) {
      Utils.toast('Select exactly one contact to move', 'warning');
      return;
    }
    const id = this._selectedTGListContactsSelection[0];
    const index = this._editingTGListContacts.indexOf(id);
    if (index < this._editingTGListContacts.length - 1) {
      // Swap with next
      [this._editingTGListContacts[index], this._editingTGListContacts[index + 1]] = 
        [this._editingTGListContacts[index + 1], this._editingTGListContacts[index]];
      this.updateTGListDualLists();
    }
  },

  /**
   * Save TG list
   */
  saveTGList(tgListId) {
    const tgListData = {
      name: document.getElementById('editTGListName').value.trim(),
      contacts: (this._editingTGListContacts || []).map(id => {
        const contact = window.codeplug.contacts.find(c => c.id === id);
        return contact ? contact.name : null;
      }).filter(name => name !== null)
    };
    
    try {
      if (tgListId) {
        window.codeplug.updateTGList(tgListId, tgListData);
        Utils.toast('TG List updated', 'success');
      } else {
        window.codeplug.addTGList(tgListData);
        Utils.toast('TG List added', 'success');
      }
      
      this._editingTGListContacts = null;
      this.hideModal();
      this.renderTGLists();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit TG list
   */
  editTGList(tgListId) {
    this.showTGListEditor(tgListId);
  },

  /**
   * Delete TG list
   */
  deleteTGList(tgListId) {
    const tgList = window.codeplug.tgLists.find(t => t.id === tgListId);
    if (!tgList) return;
    
    this.showModal('Delete TG List', `
      <p>Are you sure you want to delete TG list "${Utils.escapeHtml(tgList.name)}"?</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteTGList(tgListId);
        this.hideModal();
        this.renderTGLists();
        this.updateOverview();
        Utils.toast('TG List deleted', 'success');
      }
    });
  },

  /**
   * Move TG list up or down
   */
  moveTGList(tgListId, direction) {
    const tgLists = window.codeplug.tgLists;
    const index = tgLists.findIndex(t => t.id === tgListId);
    
    if (index === -1) return;
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === tgLists.length - 1) return;
    
    // Swap
    const newIndex = index + direction;
    [tgLists[index], tgLists[newIndex]] = [tgLists[newIndex], tgLists[index]];
    
    window.codeplug.modified = true;
    this.renderTGLists();
    Utils.toast('TG List moved', 'success');
  },

  // TG list drag and drop state
  draggedTGListElement: null,

  /**
   * Handle TG list drag start
   */
  handleTGListDragStart(event) {
    this.draggedTGListElement = event.target.closest('tr');
    this.draggedTGListElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.draggedTGListElement.dataset.id);
  },

  /**
   * Handle TG list drag over
   */
  handleTGListDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const targetRow = event.target.closest('tr');
    if (targetRow && targetRow !== this.draggedTGListElement) {
      const tbody = targetRow.parentNode;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const draggedIndex = rows.indexOf(this.draggedTGListElement);
      const targetIndex = rows.indexOf(targetRow);
      
      if (draggedIndex < targetIndex) {
        targetRow.after(this.draggedTGListElement);
      } else {
        targetRow.before(this.draggedTGListElement);
      }
    }
  },

  /**
   * Handle TG list drop
   */
  handleTGListDrop(event) {
    event.preventDefault();
    
    const tbody = document.getElementById('tglistsTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Build new order based on current DOM order
    const newOrder = rows.map(row => row.dataset.id);
    
    // Reorder tgLists array to match DOM order
    const tgLists = window.codeplug.tgLists;
    const reordered = newOrder.map(id => tgLists.find(t => t.id === id)).filter(Boolean);
    
    // Replace tgLists array
    window.codeplug.tgLists = reordered;
    
    window.codeplug.modified = true;
    Utils.toast('TG Lists reordered', 'success');
  },

  /**
   * Handle TG list drag end
   */
  handleTGListDragEnd(event) {
    if (this.draggedTGListElement) {
      this.draggedTGListElement.classList.remove('dragging');
      this.draggedTGListElement = null;
    }
    // Refresh the table to ensure numbers are updated
    this.renderTGLists();
  },

  // ============================================================================
  // Talkgroup Import (TGIF, Brandmeister, System X)
  // ============================================================================

  // Talkgroup import state
  _tgImportSource: 'tgif',
  _tgImportData: [],
  _tgImportSelected: new Set(),
  _tgImportSearch: '',
  _tgImportLoading: false,

  /**
   * Show talkgroup import modal
   */
  showTalkgroupImport() {
    this._tgImportSource = 'tgif';
    this._tgImportData = [];
    this._tgImportSelected = new Set();
    this._tgImportSearch = '';
    this._tgImportLoading = false;
    this._tgImportMode = 'new'; // 'new' or 'existing'
    this._tgImportExistingList = null;

    // Get existing TG lists for the dropdown
    const existingTGLists = window.codeplug?.tgLists || [];

    const content = `
      <div class="form-group">
        <label class="form-label">Source</label>
        <select class="form-select" id="tgImportSource" onchange="UI.changeTGImportSource()">
          <option value="tgif">TGIF</option>
          <option value="brandmeister">Brandmeister</option>
          <option value="systemx">System X</option>
          <option value="freedmr">FreeDMR (Worldwide + UK)</option>
          <option value="dmrplus">DMR+</option>
          <option value="adn">ADN Systems</option>
          <option value="dvsph">DVSPh</option>
          <option value="quadnet">QuadNet</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Import Mode</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" name="tgImportMode" value="new" checked onchange="UI.changeTGImportMode()">
            <span>Create New TG List</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="tgImportMode" value="existing" onchange="UI.changeTGImportMode()" ${existingTGLists.length === 0 ? 'disabled' : ''}>
            <span>Add to Existing TG List ${existingTGLists.length === 0 ? '(no lists available)' : ''}</span>
          </label>
        </div>
      </div>
      <div class="form-group" id="tgImportNewListGroup">
        <label class="form-label">TG List Name</label>
        <input type="text" class="form-input" id="tgImportListName" placeholder="Enter TG List name..." maxlength="16">
        <small class="form-help">Name for the new TG list (max 16 characters)</small>
      </div>
      <div class="form-group" id="tgImportExistingListGroup" style="display: none;">
        <label class="form-label">Select Existing TG List</label>
        <select class="form-select" id="tgImportExistingList">
          ${existingTGLists.map(tg => `<option value="${tg.id}">${Utils.escapeHtml(tg.name)} (${tg.contacts.length} contacts)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Select Talkgroups to Import</label>
        <div class="tg-import-controls">
          <div class="search-box" style="flex: 1;">
            <i class="mdi mdi-magnify"></i>
            <input type="text" class="search-input" id="tgImportSearch" placeholder="Search talkgroups..." oninput="UI.filterTGImportList()">
          </div>
          <button class="btn btn-sm btn-secondary" onclick="UI.selectAllTGImport()" title="Select All Visible">
            <i class="mdi mdi-checkbox-multiple-marked"></i> Select All
          </button>
          <button class="btn btn-sm btn-secondary" onclick="UI.deselectAllTGImport()" title="Deselect All">
            <i class="mdi mdi-checkbox-multiple-blank-outline"></i> Deselect All
          </button>
        </div>
        <div class="tg-import-status" id="tgImportStatus">
          <span id="tgImportSelectedCount">0</span> selected
        </div>
        <div class="tg-import-list" id="tgImportList">
          <div class="tg-import-loading" id="tgImportLoading">
            <i class="mdi mdi-loading mdi-spin"></i> Loading talkgroups...
          </div>
        </div>
      </div>
    `;

    this.showModal('Import from DMR Network', content, {
      confirmText: 'Import Selected',
      wide: true,
      onConfirm: () => {
        this.importSelectedTalkgroups();
      }
    });

    // Load initial data
    this.loadTGImportData();
  },

  /**
   * Change TG import mode (new vs existing)
   */
  changeTGImportMode() {
    const modeInputs = document.querySelectorAll('input[name="tgImportMode"]');
    const newListGroup = document.getElementById('tgImportNewListGroup');
    const existingListGroup = document.getElementById('tgImportExistingListGroup');
    
    modeInputs.forEach(input => {
      if (input.checked) {
        this._tgImportMode = input.value;
      }
    });
    
    if (this._tgImportMode === 'new') {
      newListGroup.style.display = '';
      existingListGroup.style.display = 'none';
    } else {
      newListGroup.style.display = 'none';
      existingListGroup.style.display = '';
    }
  },

  /**
   * Load talkgroup data from selected source
   */
  async loadTGImportData() {
    const loadingEl = document.getElementById('tgImportLoading');
    const listEl = document.getElementById('tgImportList');
    
    if (!loadingEl || !listEl) return;
    
    this._tgImportLoading = true;
    loadingEl.style.display = '';
    
    try {
      let response;
      switch (this._tgImportSource) {
        case 'tgif':
          response = await API.getTGIFTalkgroups();
          break;
        case 'brandmeister':
          response = await API.getBrandmeisterTalkgroups();
          break;
        case 'systemx':
          response = await API.getSystemXTalkgroups();
          break;
        case 'freedmr':
          response = await API.getFreeDMRTalkgroups();
          break;
        case 'dmrplus':
          response = await API.getDMRPlusTalkgroups();
          break;
        case 'adn':
          response = await API.getADNTalkgroups();
          break;
        case 'dvsph':
          response = await API.getDVSPhTalkgroups();
          break;
        case 'quadnet':
          response = await API.getQuadNetTalkgroups();
          break;
        default:
          throw new Error('Unknown source');
      }
      
      this._tgImportData = response.talkgroups || [];
      this._tgImportLoading = false;
      
      this.renderTGImportList();
    } catch (error) {
      console.error('Failed to load talkgroups:', error);
      this._tgImportLoading = false;
      loadingEl.innerHTML = `
        <div class="tg-import-error">
          <i class="mdi mdi-alert-circle"></i>
          Failed to load talkgroups: ${Utils.escapeHtml(error.message)}
          <button class="btn btn-sm btn-secondary" onclick="UI.loadTGImportData()" style="margin-left: 10px;">
            <i class="mdi mdi-refresh"></i> Retry
          </button>
        </div>
      `;
    }
  },

  /**
   * Render the talkgroup import list
   */
  renderTGImportList() {
    const listEl = document.getElementById('tgImportList');
    const loadingEl = document.getElementById('tgImportLoading');
    
    if (!listEl) return;
    
    if (loadingEl) loadingEl.style.display = 'none';
    
    let talkgroups = this._tgImportData;
    
    // Check if this source has country data
    const hasCountry = this._tgImportSource === 'freedmr';
    
    // Apply search filter (include country in search for FreeDMR)
    if (this._tgImportSearch) {
      const searchLower = this._tgImportSearch.toLowerCase();
      talkgroups = talkgroups.filter(tg =>
        tg.name.toLowerCase().includes(searchLower) ||
        tg.id.toString().includes(this._tgImportSearch) ||
        (tg.country && tg.country.toLowerCase().includes(searchLower))
      );
    }
    
    if (talkgroups.length === 0) {
      listEl.innerHTML = `
        <div class="tg-import-empty">
          <i class="mdi mdi-information-outline"></i>
          ${this._tgImportSearch ? 'No talkgroups match your search' : 'No talkgroups available'}
        </div>
      `;
      return;
    }
    
    // Render talkgroup items with checkboxes (and country if available)
    listEl.innerHTML = talkgroups.map(tg => `
      <div class="tg-import-item ${this._tgImportSelected.has(tg.id) ? 'selected' : ''}" 
           data-id="${tg.id}" 
           onclick="UI.toggleTGImportSelection(${tg.id})">
        <label class="tg-import-checkbox">
          <input type="checkbox" ${this._tgImportSelected.has(tg.id) ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <span class="tg-import-id">${tg.id}</span>
        ${hasCountry && tg.country ? `<span class="tg-import-country" title="${Utils.escapeHtml(tg.country)}">${Utils.escapeHtml(tg.country)}</span>` : ''}
        <span class="tg-import-name">${Utils.escapeHtml(tg.name)}</span>
      </div>
    `).join('');
    
    this.updateTGImportSelectedCount();
  },

  /**
   * Toggle talkgroup selection for import
   */
  toggleTGImportSelection(id) {
    if (this._tgImportSelected.has(id)) {
      this._tgImportSelected.delete(id);
    } else {
      this._tgImportSelected.add(id);
    }
    
    // Update the item's visual state
    const item = document.querySelector(`.tg-import-item[data-id="${id}"]`);
    if (item) {
      item.classList.toggle('selected', this._tgImportSelected.has(id));
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = this._tgImportSelected.has(id);
    }
    
    this.updateTGImportSelectedCount();
  },

  /**
   * Select all visible talkgroups
   */
  selectAllTGImport() {
    let talkgroups = this._tgImportData;
    
    // Apply search filter if active
    if (this._tgImportSearch) {
      const searchLower = this._tgImportSearch.toLowerCase();
      talkgroups = talkgroups.filter(tg =>
        tg.name.toLowerCase().includes(searchLower) ||
        tg.id.toString().includes(this._tgImportSearch)
      );
    }
    
    talkgroups.forEach(tg => this._tgImportSelected.add(tg.id));
    this.renderTGImportList();
  },

  /**
   * Deselect all talkgroups
   */
  deselectAllTGImport() {
    this._tgImportSelected.clear();
    this.renderTGImportList();
  },

  /**
   * Filter talkgroup import list based on search
   */
  filterTGImportList() {
    const searchInput = document.getElementById('tgImportSearch');
    this._tgImportSearch = searchInput?.value || '';
    this.renderTGImportList();
  },

  /**
   * Change talkgroup import source
   */
  changeTGImportSource() {
    const sourceSelect = document.getElementById('tgImportSource');
    if (!sourceSelect) return;
    
    this._tgImportSource = sourceSelect.value;
    this._tgImportData = [];
    this._tgImportSelected.clear();
    this._tgImportSearch = '';
    
    const searchInput = document.getElementById('tgImportSearch');
    if (searchInput) searchInput.value = '';
    
    // Reset the list view
    const listEl = document.getElementById('tgImportList');
    if (listEl) {
      listEl.innerHTML = `
        <div class="tg-import-loading" id="tgImportLoading">
          <i class="mdi mdi-loading mdi-spin"></i> Loading talkgroups...
        </div>
      `;
    }
    
    this.loadTGImportData();
  },

  /**
   * Update selected count display
   */
  updateTGImportSelectedCount() {
    const countEl = document.getElementById('tgImportSelectedCount');
    if (countEl) {
      countEl.textContent = this._tgImportSelected.size;
    }
  },

  /**
   * Import selected talkgroups
   */
  importSelectedTalkgroups() {
    const listNameInput = document.getElementById('tgImportListName');
    const existingListSelect = document.getElementById('tgImportExistingList');
    const listName = listNameInput?.value?.trim();
    const isNewMode = this._tgImportMode === 'new';
    
    // Validate based on mode
    if (isNewMode) {
      if (!listName) {
        Utils.toast('Please enter a TG List name', 'error');
        listNameInput?.focus();
        return;
      }
    } else {
      if (!existingListSelect?.value) {
        Utils.toast('Please select an existing TG List', 'error');
        return;
      }
    }
    
    if (this._tgImportSelected.size === 0) {
      Utils.toast('Please select at least one talkgroup to import', 'error');
      return;
    }
    
    // Get selected talkgroups
    const selectedTGs = this._tgImportData.filter(tg => this._tgImportSelected.has(tg.id));
    
    // Track how many contacts were added
    let contactsAdded = 0;
    let contactsSkipped = 0;
    const contactNames = [];
    
    // Add each talkgroup as a contact if it doesn't exist
    selectedTGs.forEach(tg => {
      // Check if contact with this ID already exists
      const existingContact = window.codeplug.contacts.find(c => c.dmrId === tg.id);
      
      if (!existingContact) {
        try {
          // Create the contact name (truncate to 16 chars)
          let contactName = tg.name.substring(0, 16);
          
          // Ensure name is unique by checking existing contacts and already added names
          const existingNames = new Set([
            ...window.codeplug.contacts.map(c => c.name.toLowerCase()),
            ...contactNames.map(n => n.toLowerCase())
          ]);
          
          if (existingNames.has(contactName.toLowerCase())) {
            // Append TG ID to make it unique (truncate name further if needed)
            const suffix = `-${tg.id}`;
            const maxNameLen = 16 - suffix.length;
            contactName = tg.name.substring(0, Math.max(1, maxNameLen)) + suffix;
          }
          
          window.codeplug.addContact({
            name: contactName,
            dmrId: tg.id,
            type: 'Group',
            tsOverride: 'Disabled'
          });
          
          contactsAdded++;
          contactNames.push(contactName);
        } catch (e) {
          console.error('Failed to add contact:', e);
          contactsSkipped++;
        }
      } else {
        // Contact exists, use its name
        contactNames.push(existingContact.name);
        contactsSkipped++;
      }
    });
    
    try {
      if (isNewMode) {
        // Create a new TG list with the contact names
        window.codeplug.addTGList({
          name: listName.substring(0, 16),
          contacts: contactNames
        });
        
        this.hideModal();
        this.renderContactsTable();
        this.renderTGLists();
        this.updateOverview();
        
        let message = `TG List "${listName}" created with ${contactNames.length} contacts`;
        if (contactsAdded > 0) {
          message += ` (${contactsAdded} new contacts added)`;
        }
        Utils.toast(message, 'success');
      } else {
        // Add to existing TG list
        const existingListId = existingListSelect.value;
        const existingTGList = window.codeplug.tgLists.find(tg => tg.id === existingListId);
        
        if (!existingTGList) {
          Utils.toast('Selected TG List not found', 'error');
          return;
        }
        
        // Get contacts that are not already in the TG list
        const existingContactNames = new Set(existingTGList.contacts.map(c => c.toLowerCase()));
        const newContactsToAdd = contactNames.filter(name => !existingContactNames.has(name.toLowerCase()));
        
        if (newContactsToAdd.length === 0) {
          Utils.toast('All selected talkgroups are already in the TG List', 'info');
          return;
        }
        
        // Update the TG list by adding new contacts
        window.codeplug.updateTGList(existingListId, {
          contacts: [...existingTGList.contacts, ...newContactsToAdd]
        });
        
        this.hideModal();
        this.renderContactsTable();
        this.renderTGLists();
        this.updateOverview();
        
        let message = `Added ${newContactsToAdd.length} contacts to "${existingTGList.name}"`;
        if (contactsAdded > 0) {
          message += ` (${contactsAdded} new contacts created)`;
        }
        Utils.toast(message, 'success');
      }
    } catch (error) {
      Utils.toast(`Failed to ${isNewMode ? 'create' : 'update'} TG list: ${error.message}`, 'error');
    }
  },

  /**
   * Render zones
   */
  renderZones(filter = '') {
    const tbody = document.getElementById('zonesTableBody');
    const empty = document.getElementById('zonesEmpty');
    const table = document.getElementById('zonesTable');
    
    let zones = window.codeplug.zones;
    
    if (filter) {
      const q = filter.toLowerCase();
      zones = zones.filter(z => 
        z.name.toLowerCase().includes(q) ||
        z.channels.some(c => c.toLowerCase().includes(q))
      );
    }
    
    if (zones.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = zones.map((z, index) => `
      <tr data-id="${z.id}" data-index="${index}" draggable="true" ondragstart="UI.handleZoneDragStart(event)" ondragover="UI.handleZoneDragOver(event)" ondrop="UI.handleZoneDrop(event)" ondragend="UI.handleZoneDragEnd(event)">
        <td class="drag-handle" title="Drag to reorder">
          <i class="mdi mdi-drag-vertical"></i>
          <span class="zone-number">${index + 1}</span>
        </td>
        <td>${Utils.escapeHtml(z.name)}</td>
        <td>${z.channels.length}</td>
        <td class="channel-list-cell">
          ${z.channels.slice(0, CONFIG.UI.MAX_DISPLAYED_TAGS).map(c => `<span class="zone-channel-tag">${Utils.escapeHtml(c)}</span>`).join('')}
          ${z.channels.length > CONFIG.UI.MAX_DISPLAYED_TAGS ? `<span class="zone-channel-tag">+${z.channels.length - CONFIG.UI.MAX_DISPLAYED_TAGS} more</span>` : ''}
          ${z.channels.length === 0 ? '<span class="text-muted">Empty</span>' : ''}
        </td>
        <td class="actions">
          <button class="action-btn" onclick="UI.moveZone('${z.id}', -1)" title="Move Up">
            <i class="mdi mdi-arrow-up"></i>
          </button>
          <button class="action-btn" onclick="UI.moveZone('${z.id}', 1)" title="Move Down">
            <i class="mdi mdi-arrow-down"></i>
          </button>
          <button class="action-btn" onclick="UI.editZone('${z.id}')" title="Edit">
            <i class="mdi mdi-pencil"></i>
          </button>
          <button class="action-btn danger" onclick="UI.deleteZone('${z.id}')" title="Delete">
            <i class="mdi mdi-delete"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Filter zones
   */
  filterZones(query) {
    this.renderZones(query);
  },

  /**
   * Show zone editor
   */
  showZoneEditor(zoneId = null) {
    const zone = zoneId ? 
      window.codeplug.zones.find(z => z.id === zoneId) : 
      window.codeplug.createZone();
    
    const isEdit = !!zoneId;
    
    // Store editing state using channel IDs instead of names
    const usedChannelIds = new Set();
    this._editingZoneChannels = zone.channels.map(name => {
      const channel = window.codeplug.channels.find(c => c.name === name && !usedChannelIds.has(c.id));
      if (channel) {
        usedChannelIds.add(channel.id);
        return channel.id;
      }
      return null;
    }).filter(id => id !== null);
    this._availableZoneChannelsSelection = [];
    this._selectedZoneChannelsSelection = [];
    
    const content = `
      <div class="form-group">
        <label class="form-label">Zone Name</label>
        <input type="text" class="form-input" id="editZoneName" value="${Utils.escapeHtml(zone.name)}" maxlength="16">
      </div>
      <div class="form-group">
        <label class="form-label">Channels</label>
        <div class="dual-list-picker">
          <div class="dual-list-column">
            <div class="dual-list-header">Available Channels</div>
            <div class="dual-list-search">
              <input type="text" id="zoneAvailableSearch" placeholder="Search..." oninput="UI.filterZoneAvailableList()">
            </div>
            <div class="dual-list-items" id="zoneAvailableList"></div>
          </div>
          <div class="dual-list-buttons">
            <button class="dual-list-btn" onclick="UI.addSelectedZoneChannels()" title="Add selected">
              <i class="mdi mdi-chevron-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.addAllZoneChannels()" title="Add all">
              <i class="mdi mdi-chevron-double-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeSelectedZoneChannels()" title="Remove selected">
              <i class="mdi mdi-chevron-left"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeAllZoneChannels()" title="Remove all">
              <i class="mdi mdi-chevron-double-left"></i>
            </button>
          </div>
          <div class="dual-list-column">
            <div class="dual-list-header">
              Channels in Zone (<span id="zoneChannelCount">0</span>)
              <span class="dual-list-reorder-buttons">
                <button class="dual-list-btn-sm" onclick="UI.moveZoneChannelUp()" title="Move selected up">
                  <i class="mdi mdi-arrow-up"></i>
                </button>
                <button class="dual-list-btn-sm" onclick="UI.moveZoneChannelDown()" title="Move selected down">
                  <i class="mdi mdi-arrow-down"></i>
                </button>
              </span>
            </div>
            <div class="dual-list-items" id="zoneSelectedList"></div>
          </div>
        </div>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit Zone' : 'Add Zone', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      wide: true,
      onConfirm: () => {
        this.saveZone(zoneId);
      }
    });
    
    // Populate lists after modal is shown
    this.updateZoneDualLists();
  },

  /**
   * Update zone dual list displays
   */
  updateZoneDualLists() {
    const availableList = document.getElementById('zoneAvailableList');
    const selectedList = document.getElementById('zoneSelectedList');
    const countEl = document.getElementById('zoneChannelCount');
    const searchValue = document.getElementById('zoneAvailableSearch')?.value?.toLowerCase() || '';
    
    // Get available channels (not in zone) - filter by ID
    let availableChannels = window.codeplug.channels.filter(c => 
      !this._editingZoneChannels.includes(c.id)
    );
    
    // Apply search filter
    if (searchValue) {
      availableChannels = availableChannels.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.rxFreq).includes(searchValue)
      );
    }
    
    // Store visible IDs for shift+click range selection
    this._zoneAvailableIds = availableChannels.map(c => c.id);

    // Render available list using channel IDs
    availableList.innerHTML = availableChannels.map(c => `
      <div class="dual-list-item ${this._availableZoneChannelsSelection.includes(c.id) ? 'selected' : ''}" 
           data-id="${Utils.escapeHtml(c.id)}"
           onclick="UI.toggleZoneAvailableSelection('${Utils.escapeJsString(c.id)}', event)"
           ondblclick="UI.addZoneChannelById('${Utils.escapeJsString(c.id)}')">
        <span>${Utils.escapeHtml(c.name)}</span>
        <span class="dual-list-item-info">${c.rxFreq.toFixed(4)}</span>
      </div>
    `).join('');
    
    // Render selected list using channel IDs
    selectedList.innerHTML = this._editingZoneChannels.map((id, i) => {
      const channel = window.codeplug.channels.find(c => c.id === id);
      return `
        <div class="dual-list-item ${this._selectedZoneChannelsSelection.includes(id) ? 'selected' : ''}"
             data-id="${Utils.escapeHtml(id)}"
             onclick="UI.toggleZoneSelectedSelection('${Utils.escapeJsString(id)}', event)"
             ondblclick="UI.removeZoneChannelById('${Utils.escapeJsString(id)}')">
          <span>${i + 1}. ${Utils.escapeHtml(channel ? channel.name : '')}</span>
          <span class="dual-list-item-info">${channel ? channel.rxFreq.toFixed(4) : ''}</span>
        </div>
      `;
    }).join('');
    
    // Update count
    if (countEl) {
      countEl.textContent = this._editingZoneChannels.length;
    }
  },

  /**
   * Filter zone available list
   */
  filterZoneAvailableList() {
    this.updateZoneDualLists();
  },

  /**
   * Toggle selection in available list
   */
  toggleZoneAvailableSelection(id, event) {
    this._handleDualListClick('zoneAvailable', id, event,
      this._availableZoneChannelsSelection,
      this._zoneAvailableIds || []);
    this.updateZoneDualLists();
  },

  /**
   * Toggle selection in selected list
   */
  toggleZoneSelectedSelection(id, event) {
    this._handleDualListClick('zoneSelected', id, event,
      this._selectedZoneChannelsSelection,
      this._editingZoneChannels || []);
    this.updateZoneDualLists();
  },

  /**
   * Add channel by ID (double-click)
   */
  addZoneChannelById(id) {
    if (this._editingZoneChannels.length >= getEffectiveLimits().MAX_CHANNELS_PER_ZONE) {
      Utils.toast(`Maximum ${getEffectiveLimits().MAX_CHANNELS_PER_ZONE} channels per zone`, 'warning');
      return;
    }
    if (!this._editingZoneChannels.includes(id)) {
      this._editingZoneChannels.push(id);
      this._availableZoneChannelsSelection = this._availableZoneChannelsSelection.filter(n => n !== id);
      this.updateZoneDualLists();
    }
  },

  /**
   * Remove channel by ID (double-click)
   */
  removeZoneChannelById(id) {
    const index = this._editingZoneChannels.indexOf(id);
    if (index !== -1) {
      this._editingZoneChannels.splice(index, 1);
      this._selectedZoneChannelsSelection = this._selectedZoneChannelsSelection.filter(n => n !== id);
      this.updateZoneDualLists();
    }
  },

  /**
   * Add selected channels to zone
   */
  addSelectedZoneChannels() {
    for (const id of this._availableZoneChannelsSelection) {
      if (this._editingZoneChannels.length >= getEffectiveLimits().MAX_CHANNELS_PER_ZONE) {
        Utils.toast(`Maximum ${getEffectiveLimits().MAX_CHANNELS_PER_ZONE} channels per zone`, 'warning');
        break;
      }
      if (!this._editingZoneChannels.includes(id)) {
        this._editingZoneChannels.push(id);
      }
    }
    this._availableZoneChannelsSelection = [];
    this.updateZoneDualLists();
  },

  /**
   * Add all available channels to zone
   */
  addAllZoneChannels() {
    const searchValue = document.getElementById('zoneAvailableSearch')?.value?.toLowerCase() || '';
    let availableChannels = window.codeplug.channels.filter(c => 
      !this._editingZoneChannels.includes(c.id)
    );
    
    if (searchValue) {
      availableChannels = availableChannels.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.rxFreq).includes(searchValue)
      );
    }
    
    for (const ch of availableChannels) {
      if (this._editingZoneChannels.length >= getEffectiveLimits().MAX_CHANNELS_PER_ZONE) {
        Utils.toast(`Maximum ${getEffectiveLimits().MAX_CHANNELS_PER_ZONE} channels per zone`, 'warning');
        break;
      }
      this._editingZoneChannels.push(ch.id);
    }
    this._availableZoneChannelsSelection = [];
    this.updateZoneDualLists();
  },

  /**
   * Remove selected channels from zone
   */
  removeSelectedZoneChannels() {
    this._editingZoneChannels = this._editingZoneChannels.filter(
      id => !this._selectedZoneChannelsSelection.includes(id)
    );
    this._selectedZoneChannelsSelection = [];
    this.updateZoneDualLists();
  },

  /**
   * Remove all channels from zone
   */
  removeAllZoneChannels() {
    this._editingZoneChannels = [];
    this._selectedZoneChannelsSelection = [];
    this.updateZoneDualLists();
  },

  /**
   * Move selected zone channel up
   */
  moveZoneChannelUp() {
    if (this._selectedZoneChannelsSelection.length !== 1) {
      Utils.toast('Select exactly one channel to move', 'warning');
      return;
    }
    const id = this._selectedZoneChannelsSelection[0];
    const index = this._editingZoneChannels.indexOf(id);
    if (index > 0) {
      // Swap with previous
      [this._editingZoneChannels[index - 1], this._editingZoneChannels[index]] = 
        [this._editingZoneChannels[index], this._editingZoneChannels[index - 1]];
      this.updateZoneDualLists();
    }
  },

  /**
   * Move selected zone channel down
   */
  moveZoneChannelDown() {
    if (this._selectedZoneChannelsSelection.length !== 1) {
      Utils.toast('Select exactly one channel to move', 'warning');
      return;
    }
    const id = this._selectedZoneChannelsSelection[0];
    const index = this._editingZoneChannels.indexOf(id);
    if (index < this._editingZoneChannels.length - 1) {
      // Swap with next
      [this._editingZoneChannels[index], this._editingZoneChannels[index + 1]] = 
        [this._editingZoneChannels[index + 1], this._editingZoneChannels[index]];
      this.updateZoneDualLists();
    }
  },

  /**
   * Save zone
   */
  saveZone(zoneId) {
    const zoneData = {
      name: document.getElementById('editZoneName').value.trim(),
      channels: (this._editingZoneChannels || []).map(id => {
        const channel = window.codeplug.channels.find(c => c.id === id);
        return channel ? channel.name : null;
      }).filter(name => name !== null)
    };
    
    try {
      if (zoneId) {
        window.codeplug.updateZone(zoneId, zoneData);
        Utils.toast('Zone updated', 'success');
      } else {
        window.codeplug.addZone(zoneData);
        Utils.toast('Zone added', 'success');
      }
      
      this._editingZoneChannels = null;
      this.hideModal();
      this.renderZones();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit zone
   */
  editZone(zoneId) {
    this.showZoneEditor(zoneId);
  },

  /**
   * Delete zone
   */
  deleteZone(zoneId) {
    const zone = window.codeplug.zones.find(z => z.id === zoneId);
    if (!zone) return;
    
    this.showModal('Delete Zone', `
      <p>Are you sure you want to delete zone "${Utils.escapeHtml(zone.name)}"?</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteZone(zoneId);
        this.hideModal();
        this.renderZones();
        this.updateOverview();
        Utils.toast('Zone deleted', 'success');
      }
    });
  },

  /**
   * Move zone up or down
   */
  moveZone(zoneId, direction) {
    const zones = window.codeplug.zones;
    const index = zones.findIndex(z => z.id === zoneId);
    
    if (index === -1) return;
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === zones.length - 1) return;
    
    // Swap
    const newIndex = index + direction;
    [zones[index], zones[newIndex]] = [zones[newIndex], zones[index]];
    
    window.codeplug.modified = true;
    this.renderZones();
    Utils.toast('Zone moved', 'success');
  },

  // Zone drag and drop state
  draggedZoneElement: null,

  /**
   * Handle zone drag start
   */
  handleZoneDragStart(event) {
    this.draggedZoneElement = event.target.closest('tr');
    this.draggedZoneElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.draggedZoneElement.dataset.id);
  },

  /**
   * Handle zone drag over
   */
  handleZoneDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const targetRow = event.target.closest('tr');
    if (targetRow && targetRow !== this.draggedZoneElement) {
      const tbody = targetRow.parentNode;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const draggedIndex = rows.indexOf(this.draggedZoneElement);
      const targetIndex = rows.indexOf(targetRow);
      
      if (draggedIndex < targetIndex) {
        targetRow.after(this.draggedZoneElement);
      } else {
        targetRow.before(this.draggedZoneElement);
      }
    }
  },

  /**
   * Handle zone drop
   */
  handleZoneDrop(event) {
    event.preventDefault();
    
    const tbody = document.getElementById('zonesTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Build new order based on current DOM order
    const newOrder = rows.map(row => row.dataset.id);
    
    // Reorder zones array to match DOM order
    const zones = window.codeplug.zones;
    const reordered = newOrder.map(id => zones.find(z => z.id === id)).filter(Boolean);
    
    // Replace zones array
    window.codeplug.zones = reordered;
    
    window.codeplug.modified = true;
    Utils.toast('Zones reordered', 'success');
  },

  /**
   * Handle zone drag end
   */
  handleZoneDragEnd(event) {
    if (this.draggedZoneElement) {
      this.draggedZoneElement.classList.remove('dragging');
      this.draggedZoneElement = null;
    }
    // Refresh the table to ensure numbers are updated
    this.renderZones();
  },

  /**
   * Render APRS configs
   */
  renderAPRS() {
    const tbody = document.getElementById('aprsTableBody');
    const empty = document.getElementById('aprsEmpty');
    const table = document.getElementById('aprsTable');
    this._initAprsRegionControl();
    
    if (window.codeplug.aprs.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = window.codeplug.aprs.map(a => {
      const iconIdx = a.iconIndex !== undefined ? a.iconIndex : (a.icon || 0);
      const iconChar = iconIdx >= 0 && iconIdx < 94 ? String.fromCharCode(33 + iconIdx) : '?';
      const tableChar = a.iconTable === 1 ? '\\' : '/';
      const viaPath = [
        a.via1 ? `${a.via1}-${a.via1SSID !== undefined ? a.via1SSID : (a.via1Ssid || 0)}` : '',
        a.via2 ? `${a.via2}-${a.via2SSID !== undefined ? a.via2SSID : (a.via2Ssid || 0)}` : ''
      ].filter(Boolean).join(', ') || 'DIRECT';
      return `
      <tr data-id="${a.id}">
        <td>${Utils.escapeHtml(a.name)}</td>
        <td>${a.ssid}</td>
        <td>${Utils.escapeHtml(viaPath)}</td>
        <td><span style="font-family:monospace;font-size:1.1em;" title="Table: ${tableChar}">${tableChar}${Utils.escapeHtml(iconChar)}</span></td>
        <td>${Utils.escapeHtml(a.comment)}</td>
        <td>${a.txFreq ? Utils.escapeHtml(String(a.txFreq)) : '-'}</td>
        <td class="actions">
          <button class="action-btn" onclick="UI.editAPRS('${a.id}')" title="Edit">
            <i class="mdi mdi-pencil"></i>
          </button>
          <button class="action-btn danger" onclick="UI.deleteAPRS('${a.id}')" title="Delete">
            <i class="mdi mdi-delete"></i>
          </button>
        </td>
      </tr>
    `}).join('');
  },

  /**
   * Populate the regional APRS default control (idempotent).
   */
  _initAprsRegionControl() {
    const sel = document.getElementById('aprsRegionSelect');
    const pathSel = document.getElementById('aprsPathPreset');
    if (!sel || sel.dataset.ready) return;
    const regions = CONFIG.APRS_REGIONS || [];
    sel.innerHTML = regions.map(r => `<option value="${Utils.escapeHtml(r.id)}">${Utils.escapeHtml(r.label)} — ${r.freq.toFixed(3)} MHz</option>`).join('');
    const savedRegion = Utils.storage.get(CONFIG.STORAGE.APRS_REGION);
    if (savedRegion && regions.some(r => r.id === savedRegion)) sel.value = savedRegion;

    const paths = CONFIG.APRS_PATHS || [];
    if (pathSel) {
      pathSel.innerHTML = paths.map(p => `<option value="${Utils.escapeHtml(p.id)}">${Utils.escapeHtml(p.label)}</option>`).join('');
      const savedPath = Utils.storage.get(CONFIG.STORAGE.APRS_PATH_PRESET);
      if (savedPath && paths.some(p => p.id === savedPath)) pathSel.value = savedPath;
      pathSel.addEventListener('change', () => {
        Utils.storage.set(CONFIG.STORAGE.APRS_PATH_PRESET, pathSel.value);
        this._updateAprsRegionHint();
      });
    }

    sel.dataset.ready = '1';
    sel.addEventListener('change', () => {
      Utils.storage.set(CONFIG.STORAGE.APRS_REGION, sel.value);
      this._updateAprsRegionHint();
    });
    const btn = document.getElementById('addDefaultAprsBtn');
    if (btn) btn.addEventListener('click', () => this.addDefaultAPRSConfig());
    this._updateAprsRegionHint();
  },

  _updateAprsRegionHint() {
    const sel = document.getElementById('aprsRegionSelect');
    const hint = document.getElementById('aprsRegionHint');
    if (!sel || !hint) return;
    const r = (CONFIG.APRS_REGIONS || []).find(x => x.id === sel.value);
    const pSel = document.getElementById('aprsPathPreset');
    const p = (CONFIG.APRS_PATHS || []).find(x => x.id === (pSel && pSel.value));
    if (!r) { hint.textContent = ''; return; }
    const pathLabel = p ? p.label : 'WIDE1-1, WIDE2-1';
    hint.textContent = `APRS ${r.freq.toFixed(3)} MHz · ${pathLabel}`;
    hint.title = (p && p.note) ? p.note : '';
  },

  /**
   * Create a starter APRS config for the selected region and digipeater path
   * (WIDE / NOGATE / RFONLY / DIRECT), 1200 baud, QSY to the regional channel.
   */
  addDefaultAPRSConfig() {
    const sel = document.getElementById('aprsRegionSelect');
    const region = (CONFIG.APRS_REGIONS || []).find(r => r.id === (sel && sel.value));
    if (!region) { Utils.toast('Choose a region first', 'warning'); return; }
    if (window.codeplug.aprs.length >= CONFIG.LIMITS.MAX_APRS_CONFIGS) {
      Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_APRS_CONFIGS} APRS configs allowed`, 'error');
      return;
    }
    const pSel = document.getElementById('aprsPathPreset');
    const preset = (CONFIG.APRS_PATHS || []).find(p => p.id === (pSel && pSel.value))
      || (CONFIG.APRS_PATHS || [])[0]
      || { via1: 'WIDE1', via1SSID: 1, via2: 'WIDE2', via2SSID: 1, label: '' };

    const base = `APRS ${region.id.toUpperCase()}`;
    let name = base.slice(0, 8);
    let n = 1;
    while ((window.codeplug.aprs || []).some(a => a.name === name)) {
      n++;
      name = (base.slice(0, 7) + n).slice(0, 8);
    }

    const freq = Number(region.freq).toFixed(3);
    try {
      window.codeplug.addAPRS({
        name,
        ssid: 9,
        via1: preset.via1 || '', via1SSID: preset.via1SSID !== undefined ? preset.via1SSID : 0,
        via2: preset.via2 || '', via2SSID: preset.via2SSID !== undefined ? preset.via2SSID : 0,
        iconTable: 0, iconIndex: 29,
        comment: '',
        txFreq: freq,
        transmitQsy: true,
        baudRate: 0
      });
      window.codeplug.modified = true;
      this.renderAPRS();
      this.updateOverview();
      Utils.toast(`Added "${name}" — ${region.label} APRS ${freq} MHz${preset.label ? ` via ${preset.label}` : ''}`, 'success');
    } catch (e) {
      Utils.toast(e.message, 'error');
    }
  },

  /**
   * Delete APRS config
   */
  deleteAPRS(aprsId) {
    const index = window.codeplug.aprs.findIndex(a => a.id === aprsId);
    if (index !== -1) {
      window.codeplug.aprs.splice(index, 1);
      window.codeplug.modified = true;
      this.renderAPRS();
      Utils.toast('APRS config deleted', 'success');
    }
  },

  // ============== Satellite Management Methods ==============

  /**
   * Render satellites table
   */
  renderSatellites() {
    const tbody = document.getElementById('satellitesTableBody');
    const empty = document.getElementById('satellitesEmpty');
    const table = document.getElementById('satellitesTable');
    
    if (!tbody || !empty || !table) return;

    const countEl = document.getElementById('satelliteCount');
    if (countEl) countEl.textContent = `${window.codeplug.satellites.length} / ${CONFIG.LIMITS.MAX_SATELLITES} satellites`;

    if (window.codeplug.satellites.length === 0) {
      table.style.display = 'none';
      empty.style.display = '';
      return;
    }
    
    table.style.display = '';
    empty.style.display = 'none';
    
    tbody.innerHTML = window.codeplug.satellites.map(sat => `
      <tr data-id="${sat.id}">
        <td>${Utils.escapeHtml(sat.catalogueNumber)}</td>
        <td><strong>${Utils.escapeHtml(sat.name)}</strong></td>
        <td>${sat.rx1 ? sat.rx1.toFixed(3) : '-'}</td>
        <td>${sat.tx1 ? sat.tx1.toFixed(3) : '-'}</td>
        <td>${sat.txCtcss || '-'}</td>
        <td>${sat.armCtcss || '-'}</td>
        <td>${sat.rx2 ? sat.rx2.toFixed(3) : '-'}</td>
        <td>${sat.tx2 ? sat.tx2.toFixed(3) : '-'}</td>
        <td>${sat.rx3 ? sat.rx3.toFixed(3) : '-'}</td>
        <td>${sat.tx3 ? sat.tx3.toFixed(3) : '-'}</td>
        <td>${Utils.escapeHtml(sat.aprsConfig || '-')}</td>
        <td>
          <span class="badge ${sat.tle ? 'badge-success' : 'badge-warning'}">
            ${sat.tle ? 'OK' : 'None'}
          </span>
        </td>
        <td class="actions">
          <button class="action-btn" onclick="UI.editSatellite('${sat.id}')" title="Edit">
            <i class="mdi mdi-pencil"></i>
          </button>
          <button class="action-btn danger" onclick="UI.deleteSatellite('${sat.id}')" title="Delete">
            <i class="mdi mdi-delete"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Load default satellites
   */
  async loadDefaultSatellites() {
    const count = window.codeplug.loadDefaultSatellites();
    this.renderSatellites();
    this.updateOverview();
    Utils.toast(`Loaded ${count} default satellites`, 'success');

    // Default satellites have no TLE data, so fetch it automatically the first
    // time in this session. This means "Load Defaults" yields usable satellites
    // without the user having to run "Update TLEs" separately.
    if (!this._tleUpdatedThisSession) {
      await this.autoUpdateTLEs();
    }
  },

  /**
   * Lets the user pick which default satellites to add (existing ones skipped).
   */
  showLoadDefaultsModal() {
    const defaults = CONFIG.DEFAULT_SATELLITES || [];
    if (defaults.length === 0) { Utils.toast('No default satellites available', 'warning'); return; }
    const noradOf = (v) => String(v || '').replace(/[A-Za-z]+$/, '').trim();
    const existing = new Set((window.codeplug.satellites || []).map(s => noradOf(s.catalogueNumber)).filter(Boolean));
    const rows = defaults.map((sat, i) => {
      const norad = noradOf(sat.catalogueNumber);
      const present = norad && existing.has(norad);
      return `<label style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0; font-size:0.9rem;">
        <input type="checkbox" data-idx="${i}" checked>
        <span style="flex:1;"><strong>${Utils.escapeHtml(sat.name)}</strong> <small style="color:var(--text-muted);">${Utils.escapeHtml(sat.catalogueNumber || '')}${present ? ' · already added' : ''}</small></span>
      </label>`;
    }).join('');
    UI.showModal('Load Default Satellites', `
      <p>Choose which default satellites to add (existing ones are skipped).</p>
      <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
        <button type="button" class="btn btn-sm btn-secondary" id="satPickAll">Select All</button>
        <button type="button" class="btn btn-sm btn-secondary" id="satPickNone">Deselect All</button>
      </div>
      <div style="max-height:45vh; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:0.4rem 0.6rem;">${rows}</div>
    `, {
      confirmText: 'Add Selected',
      onConfirm: () => {
        const checked = [...document.querySelectorAll('#modalBody input[type="checkbox"][data-idx]:checked')].map(cb => parseInt(cb.dataset.idx, 10));
        UI.hideModal();
        this.loadSelectedDefaultSatellites(checked);
      }
    });
    document.getElementById('satPickAll')?.addEventListener('click', () => document.querySelectorAll('#modalBody input[data-idx]').forEach(cb => { cb.checked = true; }));
    document.getElementById('satPickNone')?.addEventListener('click', () => document.querySelectorAll('#modalBody input[data-idx]').forEach(cb => { cb.checked = false; }));
  },

  /**
   * Add the chosen default satellites (dedupe by name/catalogue, cap 25) and
   * refresh TLEs automatically.
   */
  async loadSelectedDefaultSatellites(indices) {
    const defaults = CONFIG.DEFAULT_SATELLITES || [];
    const noradOf = (v) => String(v || '').replace(/[A-Za-z]+$/, '').trim();
    let added = 0, skipped = 0;
    for (const i of indices) {
      const sat = defaults[i];
      if (!sat) continue;
      const norad = noradOf(sat.catalogueNumber);
      const exists = window.codeplug.satellites.some(s =>
        s.name === sat.name || (norad && noradOf(s.catalogueNumber) === norad));
      if (exists) { skipped++; continue; }
      try { window.codeplug.addSatellite({ ...sat }); added++; }
      catch (e) { skipped++; }
    }
    window.codeplug.modified = true;
    this.renderSatellites();
    this.updateOverview();
    Utils.toast(`Added ${added} satellite${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, 'success');
    if (added > 0 && !this._tleUpdatedThisSession) {
      await this.autoUpdateTLEs();
    }
  },

  /**
   * Remove every satellite from the codeplug after confirmation.
   */
  clearSatellites() {
    const count = window.codeplug.satellites.length;
    if (count === 0) {
      Utils.toast('No satellites to clear', 'info');
      return;
    }
    this.showModal('Clear All Satellites', `
      <p>Remove all <strong>${count}</strong> satellite${count !== 1 ? 's' : ''} from the codeplug?</p>
      <p style="color: var(--text-muted);">This cannot be undone. Any downloaded TLE data will be discarded.</p>
    `, {
      confirmText: 'Clear All',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.satellites = [];
        window.codeplug.modified = true;
        UI.hideModal();
        UI.renderSatellites();
        UI.updateOverview();
        Utils.toast('All satellites cleared', 'success');
      }
    });
  },

  /**
   * Automatically fetch TLEs for the current satellites using the default
   * source (no source picker), and record that an update ran this session.
   */
  async autoUpdateTLEs() {
    if (window.codeplug.satellites.length === 0) return;

    Utils.toast('Fetching TLE data...', 'info');

    try {
      const updatedSats = await Utils.satellite.updateSatelliteTLEs(window.codeplug.satellites);
      window.codeplug.satellites = updatedSats;
      window.codeplug.modified = true;
      this._tleUpdatedThisSession = true;

      const withTLE = updatedSats.filter(s => s.tle).length;
      this.renderSatellites();
      Utils.toast(`Updated TLEs for ${withTLE}/${updatedSats.length} satellites`, 'success');
    } catch (error) {
      Utils.toast('Failed to fetch TLEs: ' + error.message, 'error');
    }
  },

  /**
   * Update satellite TLEs - Show source selection modal
   */
  async updateSatelliteTLEs() {
    if (window.codeplug.satellites.length === 0) {
      Utils.toast('No satellites to update. Load defaults first.', 'warning');
      return;
    }
    
    this.showTLESourceSelector();
  },

  /**
   * Show TLE source selection modal
   */
  showTLESourceSelector() {
    const sources = Utils.satellite.getAllTLESources();
    
    const sourceOptions = sources.map(s => `
      <label class="checkbox-label tle-source-item">
        <input type="checkbox" name="tleSource" value="${s.id}" 
          ${s.id === 'amateur' ? 'checked' : ''}>
        <span>${Utils.escapeHtml(s.name)}</span>
        ${s.type === 'custom' ? '<span class="badge badge-custom">Custom</span>' : ''}
      </label>
    `).join('');
    
    const content = `
      <div class="tle-source-selector">
        <p class="form-help">Select one or more TLE sources to fetch satellite orbital data from.</p>
        
        <div class="form-section">
          <h4>Available Sources</h4>
          <div class="tle-source-list">
            ${sourceOptions}
          </div>
        </div>
        
        <div class="form-section">
          <h4>Add Custom TLE Source</h4>
          <div class="form-row">
            <label for="customTLEName">Name:</label>
            <input type="text" id="customTLEName" class="form-input" placeholder="My TLE Source">
          </div>
          <div class="form-row">
            <label for="customTLEUrl">URL:</label>
            <input type="text" id="customTLEUrl" class="form-input" placeholder="https://example.com/tle.txt">
          </div>
          <p class="form-help">URL must return TLE data in standard 3-line format (Name, Line 1, Line 2).</p>
          <button type="button" class="btn" onclick="UI.addCustomTLESource()">Add Source</button>
        </div>
      </div>
    `;
    
    this.showModal('Select TLE Sources', content, {
      confirmText: 'Fetch TLEs',
      onConfirm: () => this.fetchSelectedTLEs()
    });
  },

  /**
   * Add a custom TLE source
   */
  addCustomTLESource() {
    const nameEl = document.getElementById('customTLEName');
    const urlEl = document.getElementById('customTLEUrl');
    
    const name = nameEl?.value?.trim();
    const url = urlEl?.value?.trim();
    
    if (!name || !url) {
      Utils.toast('Please enter both name and URL', 'error');
      return;
    }
    
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      Utils.toast('Please enter a valid URL', 'error');
      return;
    }
    
    Utils.satellite.addCustomTLESource(name, url);
    Utils.toast('Added custom TLE source: ' + Utils.escapeHtml(name), 'success');
    
    // Refresh the modal
    this.showTLESourceSelector();
  },

  /**
   * Remove a custom TLE source
   */
  removeCustomTLESource(id) {
    Utils.satellite.removeCustomTLESource(id);
    Utils.toast('Custom TLE source removed', 'success');
    this.showTLESourceSelector();
  },

  /**
   * Fetch TLEs from selected sources
   */
  async fetchSelectedTLEs() {
    const checkboxes = document.querySelectorAll('input[name="tleSource"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
      Utils.toast('Please select at least one TLE source', 'warning');
      return;
    }
    
    this.hideModal();
    Utils.toast('Fetching TLE data...', 'info');
    
    try {
      const updatedSats = await Utils.satellite.updateSatelliteTLEs(
        window.codeplug.satellites, 
        selectedIds
      );
      window.codeplug.satellites = updatedSats;
      window.codeplug.modified = true;
      this._tleUpdatedThisSession = true;
      
      const withTLE = updatedSats.filter(s => s.tle).length;
      this.renderSatellites();
      Utils.toast(`Updated TLEs for ${withTLE}/${updatedSats.length} satellites`, 'success');
    } catch (error) {
      Utils.toast('Failed to fetch TLEs: ' + error.message, 'error');
    }
  },

  /**
   * Write satellites to radio
   */
  async writeSatellitesToRadio() {
    if (!window.radioUSB.connected) {
      Utils.toast('Connect to radio first', 'warning');
      return;
    }
    
    if (window.codeplug.satellites.length === 0) {
      Utils.toast('No satellites to write', 'warning');
      return;
    }
    
    // Check for TLEs
    const withoutTLE = window.codeplug.satellites.filter(s => !s.tle).length;
    if (withoutTLE > 0) {
      const proceed = confirm(`${withoutTLE} satellites don't have TLE data. Update TLEs first for accurate tracking. Continue anyway?`);
      if (!proceed) return;
    }
    
    try {
      await window.radioUSB.writeSatelliteTLEs(window.codeplug.satellites, (progress) => {
        // Progress will be shown via reportProgress
      });
      Utils.toast('Satellite data written to radio', 'success');
    } catch (error) {
      Utils.toast('Failed to write satellites: ' + error.message, 'error');
    }
  },

  /**
   * Show satellite editor
   */
  showSatelliteEditor(satId = null) {
    if (!satId && window.codeplug.satellites.length >= CONFIG.LIMITS.MAX_SATELLITES) {
      Utils.toast(`The firmware supports a maximum of ${CONFIG.LIMITS.MAX_SATELLITES} satellites`, 'warning');
      return;
    }
    const sat = satId ? window.codeplug.satellites.find(s => s.id === satId) : null;
    
    const content = `
      <form id="satelliteForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">NORAD Catalogue #</label>
            <input type="text" class="form-input" id="satCatalogueNumber" value="${sat?.catalogueNumber || ''}" placeholder="e.g., 43017U" maxlength="10">
          </div>
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="satName" value="${sat?.name || ''}" required maxlength="8">
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom:0.25rem;"><small style="color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Voice (FM)</small></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RX1 – Voice Downlink (MHz)</label>
            <input type="number" class="form-input" id="satRx1" value="${sat?.rx1 || ''}" step="0.001" min="0" max="500">
          </div>
          <div class="form-group">
            <label class="form-label">TX1 – Voice Uplink (MHz)</label>
            <input type="number" class="form-input" id="satTx1" value="${sat?.tx1 || ''}" step="0.001" min="0" max="500">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">TX CTCSS (Hz)</label>
            <input type="number" class="form-input" id="satTxCtcss" value="${sat?.txCtcss || ''}" step="0.1" min="0" max="300">
          </div>
          <div class="form-group">
            <label class="form-label">Arm CTCSS (Hz)</label>
            <input type="number" class="form-input" id="satArmCtcss" value="${sat?.armCtcss || ''}" step="0.1" min="0" max="300">
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom:0.25rem;"><small style="color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">APRS</small></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RX2 – APRS Downlink (MHz)</label>
            <input type="number" class="form-input" id="satRx2" value="${sat?.rx2 || ''}" step="0.001" min="0" max="500">
          </div>
          <div class="form-group">
            <label class="form-label">TX2 – APRS Uplink (MHz)</label>
            <input type="number" class="form-input" id="satTx2" value="${sat?.tx2 || ''}" step="0.001" min="0" max="500">
          </div>
        </div>
        ${(sat?.rx2 || sat?.tx2) ? `
        <div class="form-group" style="border:1px solid var(--border-color); border-radius:6px; padding:0.5rem 0.6rem;">
          <small style="color:var(--text-muted);"><i class="mdi mdi-access-point"></i> This satellite supports APRS on RX2 ${sat?.rx2 || '—'} / TX2 ${sat?.tx2 || '—'} MHz — add a matching APRS config below.</small>
        </div>` : ''}
        
        <div class="form-group" style="margin-bottom:0.25rem;"><small style="color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">CW Rx</small></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RX3 – CW Receive (MHz)</label>
            <input type="number" class="form-input" id="satRx3" value="${sat?.rx3 || ''}" step="0.001" min="0" max="500">
          </div>
          <div class="form-group">
            <label class="form-label">TX3 (unused)</label>
            <input type="number" class="form-input" id="satTx3" value="${sat?.tx3 || ''}" step="0.001" min="0" max="500">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">APRS Path / Config</label>
          <select class="form-select" id="satAprsConfigSelect">${this._satAprsOptionHtml(sat?.aprsConfig || '', sat?.name || '')}</select>
          <input type="text" class="form-input" id="satAprsConfig" value="${Utils.escapeHtml(sat?.aprsConfig || '')}" maxlength="14" placeholder="e.g., RS0ISS" style="margin-top:0.4rem;">
          <small class="form-help">APRS uses RX2/TX2. Pick one of your APRS configs to use its digipeater path, or enter a custom 2-hop path.</small>
        </div>
        <div class="form-group" id="satAprsMatchStatus">${this._satAprsMatchHtml(sat?.name || '', !!(sat?.rx2 || sat?.tx2 || sat?.aprsConfig))}</div>
      </form>
    `;
    
    this.showModal(satId ? 'Edit Satellite' : 'Add Satellite', content, {
      confirmText: satId ? 'Save' : 'Add',
      onConfirm: () => this.saveSatellite(satId)
    });
    this._bindSatAprsConfigControls();
  },

  /**
   * Build digipeater path (AdditionalData) from an APRS config's via hops.
   */
  _satAprsPath(config) {
    const pad = (s) => String(s || '').toUpperCase().padEnd(6, ' ').slice(0, 6);
    const ssidDigit = (v) => { const n = parseInt(v, 10); return (Number.isFinite(n) && n >= 0 && n <= 15) ? String(n) : '0'; };
    let path = '';
    if (config.via1) path += pad(config.via1) + ssidDigit(config.via1SSID);
    if (config.via2) path += pad(config.via2) + ssidDigit(config.via2SSID);
    return path;
  },

  _satAprsHopLabel(config) {
    const hops = [];
    if (config.via1) hops.push(`${config.via1}${config.via1SSID !== undefined && config.via1SSID !== '' ? '-' + config.via1SSID : ''}`);
    if (config.via2) hops.push(`${config.via2}${config.via2SSID !== undefined && config.via2SSID !== '' ? '-' + config.via2SSID : ''}`);
    return hops.join(' ');
  },

  /**
   * Options HTML for the satellite APRS config dropdown. Selecting a config
   * writes its digipeater path into the satellite's APRS field.
   */
  _satAprsOptionHtml(currentPath, satName) {
    const configs = window.codeplug.aprs || [];
    const paths = configs.map(c => this._satAprsPath(c));
    const matched = currentPath ? paths.indexOf(currentPath) : -1;
    let html = `<option value="__none__" ${!currentPath ? 'selected' : ''}>None</option>`;

    const digi = (CONFIG.APRS_DIGIPEATERS && satName) ? CONFIG.APRS_DIGIPEATERS[String(satName).trim()] : null;
    const suggested = [];
    if (digi) {
      if (digi.via) suggested.push(digi.via);
      if (digi.fallback) suggested.push(digi.fallback);
    }
    const suggestedPaths = suggested.map(name => this._satAprsPath({ via1: name, via1SSID: 0 }));
    if (suggested.length) {
      html += `<optgroup label="Satellite digipeater">` + suggested.map((name, i) => {
        return `<option value="__suggested__" data-path="${Utils.escapeHtml(suggestedPaths[i])}" ${currentPath === suggestedPaths[i] ? 'selected' : ''}>${Utils.escapeHtml(name)}</option>`;
      }).join('') + `</optgroup>`;
    }

    html += configs.map((c, i) => {
      const hops = this._satAprsHopLabel(c);
      return `<option value="${c.id}" data-path="${Utils.escapeHtml(paths[i])}" ${matched === i ? 'selected' : ''}>${Utils.escapeHtml(c.name)}${hops ? ' — ' + Utils.escapeHtml(hops) : ''}</option>`;
    }).join('');
    const matchesSuggested = currentPath && suggestedPaths.includes(currentPath);
    html += `<option value="__custom__" ${currentPath && matched === -1 && !matchesSuggested ? 'selected' : ''}>Custom path…</option>`;
    return html;
  },

  _syncSatAprsSelect() {
    const sel = document.getElementById('satAprsConfigSelect');
    const inp = document.getElementById('satAprsConfig');
    if (!sel || !inp) return;
    const path = inp.value;
    let value = '__none__';
    if (path) {
      value = '__custom__';
      [...sel.options].forEach(o => { if (o.dataset && o.dataset.path === path) value = o.value; });
    }
    sel.value = value;
  },

  /**
   * Live match indicator: the radio only uses an APRS config whose name equals
   * the satellite name, compared byte-for-byte (case-sensitive).
   */
  _satAprsMatchHtml(name, capable) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return capable
        ? `<small style="color:var(--text-muted);"><i class="mdi mdi-information-outline"></i> APRS is set up on RX2/TX2 — name the satellite to match or create an APRS config.</small>`
        : `<small style="color:var(--text-muted);"><i class="mdi mdi-information-outline"></i> Name the satellite to match one of your APRS configs.</small>`;
    }
    const match = (window.codeplug.aprs || []).find(a => a.name === trimmed);
    if (match) {
      return `<small style="color:#2e7d32;"><i class="mdi mdi-check-circle"></i> Matches APRS config "${Utils.escapeHtml(trimmed)}" — the radio will use it on the APRS screen.</small>`;
    }
    if (!capable) {
      return `<small style="color:var(--text-muted);"><i class="mdi mdi-information-outline"></i> Not configured for APRS. Set RX2/TX2 (or a path) to use it.</small>`;
    }
    const digi = (CONFIG.APRS_DIGIPEATERS || {})[trimmed];
    const buttons = [];
    if (digi && digi.via) {
      buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-sat-add-aprs data-via="${Utils.escapeHtml(digi.via)}" style="margin:0.4rem 0.4rem 0 0;"><i class="mdi mdi-plus"></i> Add APRS config "${Utils.escapeHtml(trimmed)}" via ${Utils.escapeHtml(digi.via)}</button>`);
    }
    if (digi && digi.fallback) {
      buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-sat-add-aprs data-via="${Utils.escapeHtml(digi.fallback)}" style="margin:0.4rem 0.4rem 0 0;"><i class="mdi mdi-plus"></i> via ${Utils.escapeHtml(digi.fallback)}</button>`);
    }
    if (!buttons.length) {
      buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-sat-add-aprs data-via="" style="margin-top:0.4rem;"><i class="mdi mdi-plus"></i> Add APRS config "${Utils.escapeHtml(trimmed)}"</button>`);
    }
    const note = (digi && digi.note)
      ? `<div style="margin-top:0.35rem;"><small style="color:var(--text-muted);"><i class="mdi mdi-information-outline"></i> ${Utils.escapeHtml(digi.note)}</small></div>`
      : '';
    return `<small style="color:#b26a00;"><i class="mdi mdi-alert"></i> This satellite has APRS frequencies (RX2/TX2) — add an APRS config named "${Utils.escapeHtml(trimmed)}" (must match exactly, case-sensitive) so the radio can use it. Without an exact match, only the digipeater path above is sent.</small>${note}<div>${buttons.join('')}</div>`;
  },

  _updateSatAprsMatch() {
    const el = document.getElementById('satAprsMatchStatus');
    if (!el) return;
    const name = document.getElementById('satName')?.value || '';
    const rx2 = parseFloat(document.getElementById('satRx2')?.value) || 0;
    const tx2 = parseFloat(document.getElementById('satTx2')?.value) || 0;
    const path = (document.getElementById('satAprsConfig')?.value || '').trim();
    el.innerHTML = this._satAprsMatchHtml(name, !!(rx2 || tx2 || path));
    el.querySelectorAll('[data-sat-add-aprs]').forEach(btn => {
      btn.addEventListener('click', () => this._addMatchingAprsConfig(btn.getAttribute('data-via') || ''));
    });
  },

  /**
   * Rebuild the dropdown options (suggested digipeaters depend on the name).
   */
  _refreshSatAprsOptions() {
    const sel = document.getElementById('satAprsConfigSelect');
    const inp = document.getElementById('satAprsConfig');
    if (!sel || !inp) return;
    const name = (document.getElementById('satName')?.value || '').trim();
    sel.innerHTML = this._satAprsOptionHtml(inp.value, name);
    this._syncSatAprsSelect();
  },

  _bindSatAprsConfigControls() {
    const sel = document.getElementById('satAprsConfigSelect');
    const inp = document.getElementById('satAprsConfig');
    if (sel && inp) {
      sel.addEventListener('change', () => {
        if (sel.value === '__custom__') { inp.focus(); return; }
        if (sel.value === '__none__') { inp.value = ''; this._updateSatAprsMatch(); return; }
        const opt = sel.options[sel.selectedIndex];
        inp.value = opt ? (opt.dataset.path || '') : '';
        this._updateSatAprsMatch();
      });
    }
    const nameEl = document.getElementById('satName');
    if (nameEl) nameEl.addEventListener('input', () => { this._refreshSatAprsOptions(); this._updateSatAprsMatch(); });
    ['satRx2', 'satTx2', 'satAprsConfig'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this._updateSatAprsMatch());
    });
    this._updateSatAprsMatch();
    this._syncSatAprsSelect();
  },

  /**
   * Parse an AdditionalData digipeater path back into APRS config hops.
   * Layout: name(6) + SSID(1) + name(6) + SSID(1).
   */
  _parseSatAprsPath(path) {
    const p = String(path || '');
    const hops = { via1: '', via1SSID: 0, via2: '', via2SSID: 0 };
    const readHop = (nameSlice, ssidChar) => {
      const n = parseInt(ssidChar, 10);
      return { name: nameSlice.replace(/\s+$/, ''), ssid: Number.isFinite(n) ? n : 0 };
    };
    if (p.length >= 7) {
      const hop = readHop(p.slice(0, 6), p.slice(6, 7));
      hops.via1 = hop.name; hops.via1SSID = hop.ssid;
    } else if (p.length >= 1) {
      hops.via1 = p.replace(/\s+$/, '');
    }
    if (p.length >= 14) {
      const hop = readHop(p.slice(7, 13), p.slice(13, 14));
      hops.via2 = hop.name; hops.via2SSID = hop.ssid;
    }
    return hops;
  },

  /**
   * Create an APRS config named after the current satellite so the radio
   * picks it up (firmware matches the satellite name byte-for-byte). The new
   * config reuses the digipeater path selected in the dropdown.
   */
  _addMatchingAprsConfig(viaName) {
    const name = (document.getElementById('satName')?.value || '').trim();
    if (!name) { Utils.toast('Set a satellite name first', 'warning'); return; }
    const tx2 = parseFloat(document.getElementById('satTx2')?.value) || 0;
    const existing = (window.codeplug.aprs || []).find(a => a.name === name);
    if (existing) { Utils.toast(`APRS config "${name}" already exists`, 'info'); return; }

    const sel = document.getElementById('satAprsConfigSelect');
    const inp = document.getElementById('satAprsConfig');
    const path = (inp?.value || '').trim();
    const digi = (CONFIG.APRS_DIGIPEATERS || {})[name] || null;

    let hops = null;
    if (viaName) {
      hops = { via1: viaName, via1SSID: 0, via2: '', via2SSID: 0 };
    } else if (sel && sel.value && sel.value !== '__none__' && sel.value !== '__custom__') {
      const cfg = (window.codeplug.aprs || []).find(a => a.id === sel.value);
      if (cfg) hops = {
        via1: cfg.via1 || '', via1SSID: cfg.via1SSID !== undefined ? cfg.via1SSID : 0,
        via2: cfg.via2 || '', via2SSID: cfg.via2SSID !== undefined ? cfg.via2SSID : 0
      };
    }
    if (!hops && path) hops = this._parseSatAprsPath(path);
    if (!hops && digi && digi.via) hops = { via1: digi.via, via1SSID: 0, via2: '', via2SSID: 0 };
    if (!hops) hops = { via1: '', via1SSID: 0, via2: '', via2SSID: 0 };

    try {
      const created = window.codeplug.addAPRS({ name, ssid: 7, ...hops, iconTable: 0, iconIndex: 15, comment: '', baudRate: 0, txFreq: tx2 ? String(tx2) : '' });
      UI.renderAPRS();
      const hopLabel = this._satAprsHopLabel(created);
      Utils.toast(`Added APRS config "${name}"${hopLabel ? ` via ${hopLabel}` : ''}${tx2 ? ` (TX ${tx2} MHz)` : ''}`, 'success');
      if (sel && inp) {
        inp.value = this._satAprsPath(created);
        sel.innerHTML = UI._satAprsOptionHtml(inp.value, name);
        sel.value = created.id;
      }
      this._updateSatAprsMatch();
    } catch (e) {
      Utils.toast(e.message, 'error');
    }
  },

  /**
   * Save satellite from editor
   */
  saveSatellite(satId) {
    const satData = {
      catalogueNumber: document.getElementById('satCatalogueNumber').value.trim(),
      name: document.getElementById('satName').value.trim(),
      rx1: parseFloat(document.getElementById('satRx1').value) || 0,
      tx1: parseFloat(document.getElementById('satTx1').value) || 0,
      txCtcss: parseFloat(document.getElementById('satTxCtcss').value) || 0,
      armCtcss: parseFloat(document.getElementById('satArmCtcss').value) || 0,
      rx2: parseFloat(document.getElementById('satRx2').value) || 0,
      tx2: parseFloat(document.getElementById('satTx2').value) || 0,
      rx3: parseFloat(document.getElementById('satRx3').value) || 0,
      tx3: parseFloat(document.getElementById('satTx3').value) || 0,
      aprsConfig: document.getElementById('satAprsConfig').value.trim()
    };
    
    if (!satData.name) {
      Utils.toast('Satellite name is required', 'error');
      return;
    }
    
    try {
      if (satId) {
        window.codeplug.updateSatellite(satId, satData);
        Utils.toast('Satellite updated', 'success');
      } else {
        window.codeplug.addSatellite(satData);
        Utils.toast('Satellite added', 'success');
      }
      
      this.hideModal();
      this.renderSatellites();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit satellite
   */
  editSatellite(satId) {
    this.showSatelliteEditor(satId);
  },

  /**
   * Delete satellite
   */
  deleteSatellite(satId) {
    const sat = window.codeplug.satellites.find(s => s.id === satId);
    if (!sat) return;
    
    this.showModal('Delete Satellite', `
      <p>Are you sure you want to delete satellite "${Utils.escapeHtml(sat.name)}"?</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteSatellite(satId);
        this.hideModal();
        this.renderSatellites();
        this.updateOverview();
        Utils.toast('Satellite deleted', 'success');
      }
    });
  },

  /**
   * Import satellites from CSV
   */
  async importSatellitesCSV(file) {
    if (!file) return;
    
    try {
      const text = await Utils.readFileAsText(file);
      const count = window.codeplug.importSatellitesCSV(text);
      this.renderSatellites();
      this.updateOverview();
      Utils.toast(`Imported ${count} satellites`, 'success');
    } catch (error) {
      Utils.toast('Import failed: ' + error.message, 'error');
    }
  },

  /**
   * Export satellites to CSV
   */
  exportSatellitesCSV() {
    if (window.codeplug.satellites.length === 0) {
      Utils.toast('No satellites to export', 'warning');
      return;
    }
    
    const csv = window.codeplug.exportSatellitesCSV();
    Utils.downloadFile(csv, 'satellites.txt', 'text/plain');
    Utils.toast('Satellites exported', 'success');
  },

  /**
   * Upload MK22 firmware (GD-77, DM-1801, RD-5R)
   */
  async uploadMK22Firmware() {
    const fileInput = document.getElementById('firmwareMK22File');
    const file = fileInput?.files[0];
    
    if (!file) {
      Utils.toast('Please select a firmware file', 'warning');
      return;
    }
    
    if (!window.radioUSB.connected || !window.radioUSB.isInDFUMode) {
      Utils.toast('Connect to radio in DFU mode first', 'warning');
      return;
    }
    
    // Get donor data based on donor source selection
    let donorData = null;
    const donorSource = window.FirmwareManager?.selectedMK22?.donorSourceCustomPanel || 'none';
    
    if (donorSource === 'builtin' && window.FirmwareManager?.manifest?.donor?.MK22?.path) {
      try {
        const donorUrl = `/dl/${window.FirmwareManager.manifest.donor.MK22.path}`;
        const donorResponse = await fetch(donorUrl);
        if (!donorResponse.ok) {
          throw new Error('Failed to load built-in donor firmware');
        }
        donorData = new Uint8Array(await donorResponse.arrayBuffer());
      } catch (e) {
        Utils.toast('Failed to load built-in donor: ' + e.message, 'error');
        return;
      }
    } else if (donorSource === 'custom') {
      const donorFileInput = document.getElementById('firmwareMK22DonorFileCustom');
      const donorFile = donorFileInput?.files[0];
      if (donorFile) {
        donorData = new Uint8Array(await donorFile.arrayBuffer());
      }
    }
    // If donorSource === 'none', donorData stays null (FM only mode)
    
    // Determine model from custom panel dropdown or FirmwareManager
    const customModelSelect = document.getElementById('mk22CustomModel');
    const selectedCustomModel = customModelSelect?.value;
    
    if (!selectedCustomModel && !window.FirmwareManager?.selectedMK22?.model) {
      Utils.toast('Please select your radio model — using the wrong model can brick the radio', 'error');
      return;
    }
    
    const model = selectedCustomModel || window.FirmwareManager?.selectedMK22?.model;
    
    // Show progress
    const progressEl = document.getElementById('firmwareProgress');
    const progressBar = document.getElementById('firmwareProgressBar');
    const progressText = document.getElementById('firmwareProgressText');
    progressEl.style.display = '';
    progressBar.style.width = '0%';
    progressText.textContent = 'Reading firmware file...';
    
    try {
      const firmwareData = new Uint8Array(await file.arrayBuffer());
      
      progressText.textContent = 'Starting firmware upload...';
      
      await window.radioUSB.writeFirmwareMK22(firmwareData, model, (progress, message) => {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = message || `Uploading: ${Math.round(progress)}%`;
      }, donorData);
      
      progressBar.style.width = '100%';
      progressText.textContent = 'Firmware upload complete!';
      Utils.toast('Firmware uploaded successfully!', 'success');
      
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 3000);
      
    } catch (error) {
      progressText.textContent = 'Upload failed: ' + error.message;
      Utils.toast('Firmware upload failed: ' + error.message, 'error');
    }
  },

  /**
   * Upload STM32 firmware (MD-UV380, MD-9600, etc.)
   * Supports built-in donor, custom donor file, or no donor (FM only mode)
   */
  async uploadSTM32Firmware() {
    const firmwareFileInput = document.getElementById('firmwareSTM32File');
    const firmwareFile = firmwareFileInput?.files[0];
    
    if (!firmwareFile) {
      Utils.toast('Please select a firmware file', 'warning');
      return;
    }
    
    if (!window.radioUSB.connected || !window.radioUSB.isInDFUMode) {
      Utils.toast('Connect to radio in DFU mode first', 'warning');
      return;
    }
    
    // Get donor data based on donor source selection
    let donorData = null;
    const donorSource = window.FirmwareManager?.selectedSTM32?.donorSourceCustomPanel || 'none';
    
    if (donorSource === 'builtin' && window.FirmwareManager?.manifest?.donor?.STM32?.path) {
      // Use built-in donor from manifest
      try {
        const donorUrl = `/dl/${window.FirmwareManager.manifest.donor.STM32.path}`;
        const donorResponse = await fetch(donorUrl);
        if (!donorResponse.ok) {
          throw new Error('Failed to load built-in donor firmware');
        }
        donorData = new Uint8Array(await donorResponse.arrayBuffer());
      } catch (e) {
        Utils.toast('Failed to load built-in donor: ' + e.message, 'error');
        return;
      }
    } else if (donorSource === 'custom') {
      // Use custom donor file
      const donorFileInput = document.getElementById('firmwareSTM32DonorFileCustom');
      const donorFile = donorFileInput?.files[0];
      if (donorFile) {
        donorData = new Uint8Array(await donorFile.arrayBuffer());
      }
    }
    // If donorSource === 'none', donorData stays null (FM only mode)
    
    // Show progress
    const progressEl = document.getElementById('firmwareProgress');
    const progressBar = document.getElementById('firmwareProgressBar');
    const progressText = document.getElementById('firmwareProgressText');
    progressEl.style.display = '';
    progressBar.style.width = '0%';
    progressText.textContent = 'Reading firmware files...';
    
    try {
      const firmwareData = new Uint8Array(await firmwareFile.arrayBuffer());
      
      progressText.textContent = 'Starting firmware upload...';
      
      // Determine cipher type based on selected radio model from custom panel dropdown
      // This is critical - using the wrong cipher will leave the radio stuck in DFU mode
      const customModelSelect = document.getElementById('stm32CustomModel');
      const selectedCustomModel = customModelSelect?.value;
      
      if (!selectedCustomModel) {
        Utils.toast('Please select your radio model — using the wrong cipher can brick the radio', 'error');
        progressEl.style.display = 'none';
        return;
      }
      
      const cipherType = selectedCustomModel;
      
      // Use the DFU method for STM32 firmware flashing
      await window.radioUSB.writeFirmwareSTM32DFU(firmwareData, cipherType, (progress, message) => {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = message || `Uploading: ${Math.round(progress)}%`;
        if (window.App?.updateStatus) {
          window.App.updateStatus(message || `Flashing firmware ${Math.round(progress)}%`);
        }
      }, donorData);
      
      progressBar.style.width = '100%';
      progressText.textContent = 'Firmware upload complete!';
      Utils.toast('Firmware uploaded successfully!', 'success');
      
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 3000);
      
    } catch (error) {
      progressText.textContent = 'Upload failed: ' + error.message;
      Utils.toast('Firmware upload failed: ' + error.message, 'error');
    }
  },

  /**
   * Render scan lists table
   */
  renderScanLists() {
    const tbody = document.getElementById('scanListsTableBody');
    const empty = document.getElementById('scanListsEmpty');
    
    if (!tbody) return;
    
    const scanLists = window.codeplug.scanLists || [];
    
    if (scanLists.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }
    
    empty.style.display = 'none';
    
    tbody.innerHTML = scanLists.map(sl => `
      <tr data-id="${sl.id}">
        <td>${Utils.escapeHtml(sl.name)}</td>
        <td><span class="tag-list">${sl.channels?.length || 0} channels</span></td>
        <td>${Utils.escapeHtml(sl.priorityCh1 || 'None')}</td>
        <td>${Utils.escapeHtml(sl.priorityCh2 || 'None')}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" onclick="UI.editScanList('${sl.id}')" title="Edit">
              <i class="mdi mdi-pencil"></i>
            </button>
            <button class="btn-icon btn-danger" onclick="UI.deleteScanList('${sl.id}')" title="Delete">
              <i class="mdi mdi-delete"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    
    // Update nav badge
    const badge = document.getElementById('scanListCount');
    if (badge) badge.textContent = scanLists.length;
  },

  /**
   * Show scan list editor
   */
  showScanListEditor(scanListId = null) {
    const scanList = scanListId ? 
      window.codeplug.scanLists.find(s => s.id === scanListId) : 
      window.codeplug.createScanList();
    
    if (scanListId && !scanList) return;
    
    const isEdit = !!scanListId;
    
    // Store editing state using channel IDs instead of names
    const usedChannelIds = new Set();
    this._editingScanListChannels = (scanList.channels || []).map(name => {
      const channel = window.codeplug.channels.find(c => c.name === name && !usedChannelIds.has(c.id));
      if (channel) {
        usedChannelIds.add(channel.id);
        return channel.id;
      }
      return null;
    }).filter(id => id !== null);
    this._availableScanListChannelsSelection = [];
    this._selectedScanListChannelsSelection = [];
    
    // Build priority channel options
    const channelOptions = window.codeplug.channels.map(c => 
      `<option value="${Utils.escapeHtml(c.name)}">${Utils.escapeHtml(c.name)}</option>`
    ).join('');
    
    const plTypeOptions = [
      { value: 0, label: 'Non-Priority' },
      { value: 1, label: 'Disable' },
      { value: 2, label: 'Priority' },
      { value: 3, label: 'Priority + Non-Priority' }
    ];
    
    const content = `
      <div class="form-group">
        <label class="form-label">Scan List Name</label>
        <input type="text" class="form-input" id="editScanListName" value="${Utils.escapeHtml(scanList.name)}" maxlength="${CONFIG.LIMITS.SCAN_LIST_NAME_LEN}">
      </div>
      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Priority Channel 1</label>
          <select class="form-input" id="editScanListPriorityCh1">
            <option value="None" ${scanList.priorityCh1 === 'None' ? 'selected' : ''}>None</option>
            ${channelOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority Channel 2</label>
          <select class="form-input" id="editScanListPriorityCh2">
            <option value="None" ${scanList.priorityCh2 === 'None' ? 'selected' : ''}>None</option>
            ${channelOptions}
          </select>
        </div>
      </div>
      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">TX Designated Channel</label>
          <select class="form-input" id="editScanListTxDesignatedCh">
            <option value="Last Active" ${scanList.txDesignatedCh === 'Last Active' ? 'selected' : ''}>Last Active</option>
            ${channelOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Signaling Hold (ms)</label>
          <input type="number" class="form-input" id="editScanListSignalingHold" value="${scanList.signalingHold || 500}" min="0" max="10000" step="100">
        </div>
        <div class="form-group">
          <label class="form-label">Priority Sample (ms)</label>
          <input type="number" class="form-input" id="editScanListPrioritySample" value="${scanList.prioritySample || 2000}" min="0" max="10000" step="100">
        </div>
      </div>
      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">PL Type</label>
          <select class="form-input" id="editScanListPLType">
            ${plTypeOptions.map(o => `<option value="${o.value}" ${scanList.plType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="display: flex; align-items: center; padding-top: 1.5rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="editScanListTalkback" ${scanList.talkback ? 'checked' : ''}>
            Talkback
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Channels</label>
        <div class="dual-list-picker">
          <div class="dual-list-column">
            <div class="dual-list-header">Available Channels</div>
            <div class="dual-list-search">
              <input type="text" id="scanListAvailableSearch" placeholder="Search..." oninput="UI.filterScanListAvailableList()">
            </div>
            <div class="dual-list-items" id="scanListAvailableList"></div>
          </div>
          <div class="dual-list-buttons">
            <button class="dual-list-btn" onclick="UI.addSelectedScanListChannels()" title="Add selected">
              <i class="mdi mdi-chevron-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.addAllScanListChannels()" title="Add all">
              <i class="mdi mdi-chevron-double-right"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeSelectedScanListChannels()" title="Remove selected">
              <i class="mdi mdi-chevron-left"></i>
            </button>
            <button class="dual-list-btn" onclick="UI.removeAllScanListChannels()" title="Remove all">
              <i class="mdi mdi-chevron-double-left"></i>
            </button>
          </div>
          <div class="dual-list-column">
            <div class="dual-list-header">Channels in Scan List (<span id="scanListChannelCount">0</span>)</div>
            <div class="dual-list-items" id="scanListSelectedList"></div>
          </div>
        </div>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit Scan List' : 'Add Scan List', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      wide: true,
      onConfirm: () => {
        this.saveScanList(scanListId);
      }
    });
    
    // Set priority channel selections after modal is shown
    const priCh1Select = document.getElementById('editScanListPriorityCh1');
    const priCh2Select = document.getElementById('editScanListPriorityCh2');
    const txChSelect = document.getElementById('editScanListTxDesignatedCh');
    if (priCh1Select && scanList.priorityCh1 && scanList.priorityCh1 !== 'None') {
      priCh1Select.value = scanList.priorityCh1;
    }
    if (priCh2Select && scanList.priorityCh2 && scanList.priorityCh2 !== 'None') {
      priCh2Select.value = scanList.priorityCh2;
    }
    if (txChSelect && scanList.txDesignatedCh && scanList.txDesignatedCh !== 'Last Active') {
      txChSelect.value = scanList.txDesignatedCh;
    }
    
    // Populate channel lists after modal is shown
    this.updateScanListDualLists();
  },

  /**
   * Update scan list dual list displays
   */
  updateScanListDualLists() {
    const availableList = document.getElementById('scanListAvailableList');
    const selectedList = document.getElementById('scanListSelectedList');
    const countEl = document.getElementById('scanListChannelCount');
    const searchValue = document.getElementById('scanListAvailableSearch')?.value?.toLowerCase() || '';
    
    // Get available channels (not in scan list) - filter by ID
    let availableChannels = window.codeplug.channels.filter(c => 
      !this._editingScanListChannels.includes(c.id)
    );
    
    // Apply search filter
    if (searchValue) {
      availableChannels = availableChannels.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.rxFreq).includes(searchValue)
      );
    }
    
    // Render available list using channel IDs
    // Store visible IDs for shift+click range selection
    this._scanListAvailableIds = availableChannels.map(c => c.id);

    availableList.innerHTML = availableChannels.map(c => `
      <div class="dual-list-item ${this._availableScanListChannelsSelection.includes(c.id) ? 'selected' : ''}" 
           data-id="${Utils.escapeHtml(c.id)}"
           onclick="UI.toggleScanListAvailableSelection('${Utils.escapeJsString(c.id)}', event)"
           ondblclick="UI.addScanListChannelById('${Utils.escapeJsString(c.id)}')">
        <span>${Utils.escapeHtml(c.name)}</span>
        <span class="dual-list-item-info">${Utils.formatFrequency(c.rxFreq)}</span>
      </div>
    `).join('');
    
    // Render selected list using channel IDs
    selectedList.innerHTML = this._editingScanListChannels.map((id, i) => {
      const channel = window.codeplug.channels.find(c => c.id === id);
      return `
        <div class="dual-list-item ${this._selectedScanListChannelsSelection.includes(id) ? 'selected' : ''}"
             data-id="${Utils.escapeHtml(id)}"
             onclick="UI.toggleScanListSelectedSelection('${Utils.escapeJsString(id)}', event)"
             ondblclick="UI.removeScanListChannelById('${Utils.escapeJsString(id)}')">
          <span>${i + 1}. ${Utils.escapeHtml(channel ? channel.name : '')}</span>
          <span class="dual-list-item-info">${channel ? Utils.formatFrequency(channel.rxFreq) : ''}</span>
        </div>
      `;
    }).join('');
    
    // Update count
    if (countEl) {
      countEl.textContent = this._editingScanListChannels.length;
    }
  },

  /**
   * Filter scan list available list
   */
  filterScanListAvailableList() {
    this.updateScanListDualLists();
  },

  /**
   * Toggle selection in available list
   */
  toggleScanListAvailableSelection(id, event) {
    this._handleDualListClick('scanListAvailable', id, event,
      this._availableScanListChannelsSelection,
      this._scanListAvailableIds || []);
    this.updateScanListDualLists();
  },

  /**
   * Toggle selection in selected list
   */
  toggleScanListSelectedSelection(id, event) {
    this._handleDualListClick('scanListSelected', id, event,
      this._selectedScanListChannelsSelection,
      this._editingScanListChannels || []);
    this.updateScanListDualLists();
  },

  /**
   * Add channel by ID (double-click)
   */
  addScanListChannelById(id) {
    if (this._editingScanListChannels.length >= CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST) {
      Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST} channels per scan list`, 'warning');
      return;
    }
    if (!this._editingScanListChannels.includes(id)) {
      this._editingScanListChannels.push(id);
      this._availableScanListChannelsSelection = this._availableScanListChannelsSelection.filter(n => n !== id);
      this.updateScanListDualLists();
    }
  },

  /**
   * Remove channel by ID (double-click)
   */
  removeScanListChannelById(id) {
    const index = this._editingScanListChannels.indexOf(id);
    if (index !== -1) {
      this._editingScanListChannels.splice(index, 1);
      this._selectedScanListChannelsSelection = this._selectedScanListChannelsSelection.filter(n => n !== id);
      this.updateScanListDualLists();
    }
  },

  /**
   * Add selected channels to scan list
   */
  addSelectedScanListChannels() {
    for (const id of this._availableScanListChannelsSelection) {
      if (this._editingScanListChannels.length >= CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST) {
        Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST} channels per scan list`, 'warning');
        break;
      }
      if (!this._editingScanListChannels.includes(id)) {
        this._editingScanListChannels.push(id);
      }
    }
    this._availableScanListChannelsSelection = [];
    this.updateScanListDualLists();
  },

  /**
   * Add all available channels to scan list
   */
  addAllScanListChannels() {
    const searchValue = document.getElementById('scanListAvailableSearch')?.value?.toLowerCase() || '';
    let availableChannels = window.codeplug.channels.filter(c => 
      !this._editingScanListChannels.includes(c.id)
    );
    
    if (searchValue) {
      availableChannels = availableChannels.filter(c =>
        c.name.toLowerCase().includes(searchValue) ||
        String(c.rxFreq).includes(searchValue)
      );
    }
    
    for (const channel of availableChannels) {
      if (this._editingScanListChannels.length >= CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST) {
        Utils.toast(`Maximum ${CONFIG.LIMITS.MAX_CHANNELS_PER_SCAN_LIST} channels per scan list`, 'warning');
        break;
      }
      this._editingScanListChannels.push(channel.id);
    }
    this._availableScanListChannelsSelection = [];
    this.updateScanListDualLists();
  },

  /**
   * Remove selected channels from scan list
   */
  removeSelectedScanListChannels() {
    this._editingScanListChannels = this._editingScanListChannels.filter(
      id => !this._selectedScanListChannelsSelection.includes(id)
    );
    this._selectedScanListChannelsSelection = [];
    this.updateScanListDualLists();
  },

  /**
   * Remove all channels from scan list
   */
  removeAllScanListChannels() {
    this._editingScanListChannels = [];
    this._selectedScanListChannelsSelection = [];
    this.updateScanListDualLists();
  },

  /**
   * Save scan list
   */
  saveScanList(scanListId) {
    const scanListData = {
      name: document.getElementById('editScanListName').value.trim(),
      channels: (this._editingScanListChannels || []).map(id => {
        const channel = window.codeplug.channels.find(c => c.id === id);
        return channel ? channel.name : null;
      }).filter(name => name !== null),
      priorityCh1: document.getElementById('editScanListPriorityCh1').value,
      priorityCh2: document.getElementById('editScanListPriorityCh2').value,
      txDesignatedCh: document.getElementById('editScanListTxDesignatedCh').value,
      signalingHold: parseInt(document.getElementById('editScanListSignalingHold').value) || 500,
      prioritySample: parseInt(document.getElementById('editScanListPrioritySample').value) || 2000,
      plType: parseInt(document.getElementById('editScanListPLType').value) || 0,
      talkback: document.getElementById('editScanListTalkback').checked
    };
    
    try {
      if (scanListId) {
        window.codeplug.updateScanList(scanListId, scanListData);
        Utils.toast('Scan list updated', 'success');
      } else {
        window.codeplug.addScanList(scanListData);
        Utils.toast('Scan list added', 'success');
      }
      
      this._editingScanListChannels = null;
      this.hideModal();
      this.renderScanLists();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit a scan list
   */
  editScanList(id) {
    this.showScanListEditor(id);
  },

  /**
   * Delete a scan list
   */
  deleteScanList(id) {
    if (!confirm('Delete this scan list?')) return;
    
    try {
      window.codeplug.deleteScanList(id);
      this.renderScanLists();
      Utils.toast('Scan list deleted', 'success');
    } catch (error) {
      Utils.toast('Error: ' + error.message, 'error');
    }
  },

  /**
   * Render DTMF settings
   */
  renderDTMF() {
    const tbody = document.getElementById('dtmfTableBody');
    const empty = document.getElementById('dtmfEmpty');
    const settingsContainer = document.getElementById('dtmfSettingsForm');
    
    if (!tbody) return;
    
    // Render DTMF settings form
    const settings = window.codeplug.dtmfSettings;
    if (settingsContainer && settings) {
      if (document.getElementById('dtmfSelfId')) document.getElementById('dtmfSelfId').value = settings.selfId || '';
      if (document.getElementById('dtmfKillCode')) document.getElementById('dtmfKillCode').value = settings.killCode || '';
      if (document.getElementById('dtmfWakeCode')) document.getElementById('dtmfWakeCode').value = settings.wakeCode || '';
      if (document.getElementById('dtmfPttidUpCode')) document.getElementById('dtmfPttidUpCode').value = settings.pttidUpCode || '';
      if (document.getElementById('dtmfPttidDownCode')) document.getElementById('dtmfPttidDownCode').value = settings.pttidDownCode || '';
      if (document.getElementById('dtmfAutoResetTimer')) document.getElementById('dtmfAutoResetTimer').value = settings.autoResetTimer || 0;
      if (document.getElementById('dtmfFstDigitDly')) document.getElementById('dtmfFstDigitDly').value = settings.fstDigitDly || 0;
      if (document.getElementById('dtmfFstDur')) document.getElementById('dtmfFstDur').value = settings.fstDur || 0;
      if (document.getElementById('dtmfOtherDur')) document.getElementById('dtmfOtherDur').value = settings.otherDur || 0;
      if (document.getElementById('dtmfRate')) document.getElementById('dtmfRate').value = settings.rate || 0;
      if (document.getElementById('dtmfTail')) document.getElementById('dtmfTail').value = settings.tail || 0;
      settingsContainer.style.display = '';
      this.bindDTMFSettings();
    }
    
    // Render DTMF contacts array
    const dtmf = window.codeplug.dtmf;
    
    if (!Array.isArray(dtmf) || dtmf.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = dtmf.map(d => `
      <tr data-id="${d.id}">
        <td>${Utils.escapeHtml(d.name)}</td>
        <td>${Utils.escapeHtml(d.code)}</td>
        <td>
          <div class="actions">
            <button class="action-btn" onclick="UI.editDTMF('${d.id}')" title="Edit">
              <i class="mdi mdi-pencil"></i>
            </button>
            <button class="action-btn danger" onclick="UI.deleteDTMF('${d.id}')" title="Delete">
              <i class="mdi mdi-delete"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },
  
  /**
   * Bind DTMF settings form events
   */
  bindDTMFSettings() {
    if (this._dtmfSettingsBound) return;
    this._dtmfSettingsBound = true;
    const fields = [
      { id: 'dtmfSelfId', key: 'selfId' },
      { id: 'dtmfKillCode', key: 'killCode' },
      { id: 'dtmfWakeCode', key: 'wakeCode' },
      { id: 'dtmfPttidUpCode', key: 'pttidUpCode' },
      { id: 'dtmfPttidDownCode', key: 'pttidDownCode' },
      { id: 'dtmfAutoResetTimer', key: 'autoResetTimer', type: 'int' },
      { id: 'dtmfFstDigitDly', key: 'fstDigitDly', type: 'int' },
      { id: 'dtmfFstDur', key: 'fstDur', type: 'int' },
      { id: 'dtmfOtherDur', key: 'otherDur', type: 'int' },
      { id: 'dtmfRate', key: 'rate', type: 'int' },
      { id: 'dtmfTail', key: 'tail', type: 'int' }
    ];
    
    fields.forEach(f => {
      document.getElementById(f.id)?.addEventListener('input', (e) => {
        window.codeplug.dtmfSettings[f.key] = f.type === 'int' ? (parseInt(e.target.value) || 0) : e.target.value;
        window.codeplug.modified = true;
      });
    });
  },

  /**
   * Show DTMF editor modal
   */
  showDTMFEditor(dtmfId = null) {
    // Ensure dtmf is an array for contacts
    if (!Array.isArray(window.codeplug.dtmf)) {
      window.codeplug.dtmf = [];
    }
    
    const dtmf = dtmfId ?
      window.codeplug.dtmf.find(d => d.id === dtmfId) :
      window.codeplug.createDTMF();
    
    const isEdit = !!dtmfId;
    
    const content = `
      <div class="form-group">
        <label class="form-label">Contact Name</label>
        <input type="text" class="form-input" id="editDtmfName" value="${Utils.escapeHtml(dtmf.name)}" maxlength="16">
      </div>
      <div class="form-group">
        <label class="form-label">DTMF Code</label>
        <input type="text" class="form-input" id="editDtmfCode" value="${Utils.escapeHtml(dtmf.code)}" maxlength="16" placeholder="e.g. 1234*#" pattern="[0-9A-Da-d*#]*">
        <small class="form-help">Valid characters: 0-9, A-D, *, #</small>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit DTMF Contact' : 'Add DTMF Contact', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      onConfirm: () => {
        this.saveDTMF(dtmfId);
      }
    });
  },

  /**
   * Save DTMF contact
   */
  saveDTMF(dtmfId) {
    const dtmfData = {
      name: document.getElementById('editDtmfName').value.trim(),
      code: document.getElementById('editDtmfCode').value.trim().toUpperCase()
    };
    
    // Validate DTMF code characters
    if (dtmfData.code && !/^[0-9A-D*#]*$/.test(dtmfData.code)) {
      Utils.toast('Invalid DTMF code. Use only 0-9, A-D, *, #', 'error');
      return;
    }
    
    try {
      if (dtmfId) {
        window.codeplug.updateDTMF(dtmfId, dtmfData);
        Utils.toast('DTMF contact updated', 'success');
      } else {
        window.codeplug.addDTMF(dtmfData);
        Utils.toast('DTMF contact added', 'success');
      }
      
      this.hideModal();
      this.renderDTMF();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit DTMF contact
   */
  editDTMF(dtmfId) {
    this.showDTMFEditor(dtmfId);
  },

  /**
   * Delete DTMF contact
   */
  deleteDTMF(dtmfId) {
    if (!Array.isArray(window.codeplug.dtmf)) return;
    const dtmf = window.codeplug.dtmf.find(d => d.id === dtmfId);
    if (!dtmf) return;
    
    this.showModal('Delete DTMF Contact', `
      <p>Are you sure you want to delete DTMF contact "${Utils.escapeHtml(dtmf.name)}"?</p>
    `, {
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.codeplug.deleteDTMF(dtmfId);
        this.hideModal();
        this.renderDTMF();
        this.updateOverview();
        Utils.toast('DTMF contact deleted', 'success');
      }
    });
  },

  /**
   * Import DTMF contacts from CSV file
   */
  importDTMFCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const count = window.codeplug.importDTMFCSV(e.target.result);
        Utils.toast(`Imported ${count} DTMF contacts`, 'success');
        this.renderDTMF();
        this.updateOverview();
      } catch (error) {
        Utils.toast('Failed to import DTMF CSV: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * Export DTMF contacts to CSV file
   */
  exportDTMFCSV() {
    const csv = window.codeplug.exportDTMFCSV();
    Utils.downloadFile(csv, 'DTMF.csv', 'text/csv');
  },

  /**
   * Show APRS editor modal
   */
  showAPRSEditor(aprsId = null) {
    const aprs = aprsId ?
      window.codeplug.aprs.find(a => a.id === aprsId) :
      window.codeplug.createAPRS();
    
    const isEdit = !!aprsId;

    // Build icon options (94 APRS symbols, ASCII 33-126)
    const aprsIconNames = CONFIG.APRS_ICON_NAMES;

    const currentIconIndex = aprs.iconIndex !== undefined ? aprs.iconIndex : (aprs.icon || 0);
    let iconOptions = '';
    for (let i = 0; i < 94; i++) {
      const ch = String.fromCharCode(33 + i);
      const displayChar = Utils.escapeHtml(ch);
      const name = aprsIconNames[i] || '';
      const selected = i === currentIconIndex ? 'selected' : '';
      iconOptions += `<option value="${i}" ${selected}>${displayChar}  ${Utils.escapeHtml(name)}</option>`;
    }

    // Build position masking options (matching CPS)
    const positionMaskingLabels = CONFIG.APRS_POSITION_MASKING;
    const currentMasking = aprs.positionMasking !== undefined ? aprs.positionMasking : (aprs.ambiguity || 0);
    let maskingOptions = '';
    for (let i = 0; i < positionMaskingLabels.length; i++) {
      const selected = i === currentMasking ? 'selected' : '';
      maskingOptions += `<option value="${i}" ${selected}>${positionMaskingLabels[i]}</option>`;
    }

    // Build TX SSID display with callsign like original CPS
    const callsign = (window.codeplug.general && window.codeplug.general.callsign) 
      ? window.codeplug.general.callsign 
      : (window.codeplug.general && window.codeplug.general.radioName) 
        ? window.codeplug.general.radioName 
        : '';
    let ssidOptions = '';
    for (let i = 0; i <= 15; i++) {
      const selected = i === aprs.ssid ? 'selected' : '';
      ssidOptions += `<option value="${i}" ${selected}>${i}</option>`;
    }

    const content = `
      <div class="form-group">
        <label class="form-label">Config Name</label>
        <input type="text" class="form-input" id="editAprsName" value="${Utils.escapeHtml(aprs.name)}" maxlength="8">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tx SSID</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:bold;">${Utils.escapeHtml(callsign)}</span>
            <span>-</span>
            <select class="form-select" id="editAprsSsid" style="width:70px;">
              ${ssidOptions}
            </select>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Icon Table</label>
          <select class="form-select" id="editAprsIconTable">
            <option value="0" ${aprs.iconTable === 0 ? 'selected' : ''}>Primary (/)</option>
            <option value="1" ${aprs.iconTable === 1 ? 'selected' : ''}>Alternate (\\)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Icon</label>
          <select class="form-select" id="editAprsIcon" style="font-family:monospace;">
            ${iconOptions}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Via 1</label>
          <input type="text" class="form-input" id="editAprsVia1" value="${Utils.escapeHtml(aprs.via1)}" maxlength="6">
        </div>
        <div class="form-group">
          <label class="form-label">Via 1 SSID</label>
          <input type="number" class="form-input" id="editAprsVia1Ssid" value="${aprs.via1SSID !== undefined ? aprs.via1SSID : (aprs.via1Ssid || 0)}" min="0" max="15">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Via 2</label>
          <input type="text" class="form-input" id="editAprsVia2" value="${Utils.escapeHtml(aprs.via2)}" maxlength="6">
        </div>
        <div class="form-group">
          <label class="form-label">Via 2 SSID</label>
          <input type="number" class="form-input" id="editAprsVia2Ssid" value="${aprs.via2SSID !== undefined ? aprs.via2SSID : (aprs.via2Ssid || 0)}" min="0" max="15">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Comment</label>
        <input type="text" class="form-input" id="editAprsComment" value="${Utils.escapeHtml(aprs.comment)}" maxlength="24">
      </div>
      <div class="form-group">
        <label class="form-label">TX Frequency (QSY)</label>
        <input type="text" class="form-input" id="editAprsTxFreq" value="${Utils.escapeHtml(aprs.txFreq || aprs.txFrequency || '')}" placeholder="e.g. 144.800000">
        <small class="form-help">APRS channel in MHz. With "Transmit QSY" enabled the radio switches to this frequency to beacon (e.g. 144.800 in Europe).</small>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Position Masking</label>
          <select class="form-select" id="editAprsPositionMasking">
            ${maskingOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Baud Rate</label>
          <select class="form-select" id="editAprsBaudRate">
            <option value="0" ${aprs.baudRate === 0 ? 'selected' : ''}>1200</option>
            <option value="1" ${aprs.baudRate === 1 ? 'selected' : ''}>300</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-check">
            <input type="checkbox" id="editAprsUsePosition" ${aprs.usePosition ? 'checked' : ''}>
            <span>Use Fixed Position</span>
          </label>
        </div>
        <div class="form-group">
          <label class="form-check">
            <input type="checkbox" id="editAprsTransmitQsy" ${aprs.transmitQsy ? 'checked' : ''}>
            <span>Transmit QSY</span>
          </label>
        </div>
        <div class="form-group">
          <label class="form-check">
            <input type="checkbox" id="editAprsBeaconSilent" ${aprs.beaconSilent ? 'checked' : ''}>
            <span>Beacon Silent</span>
          </label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Latitude</label>
          <input type="number" class="form-input" id="editAprsLatitude" value="${aprs.latitude}" step="0.000001" min="-90" max="90">
        </div>
        <div class="form-group">
          <label class="form-label">Longitude</label>
          <input type="number" class="form-input" id="editAprsLongitude" value="${aprs.longitude}" step="0.000001" min="-180" max="180">
        </div>
      </div>
    `;
    
    this.showModal(isEdit ? 'Edit APRS Config' : 'Add APRS Config', content, {
      confirmText: isEdit ? 'Save' : 'Add',
      wide: true,
      onConfirm: () => {
        this.saveAPRS(aprsId);
      }
    });
  },

  /**
   * Save APRS config
   */
  saveAPRS(aprsId) {
    const aprsData = {
      name: document.getElementById('editAprsName').value.trim(),
      ssid: parseInt(document.getElementById('editAprsSsid').value) || 0,
      iconIndex: parseInt(document.getElementById('editAprsIcon').value) || 0,
      iconTable: parseInt(document.getElementById('editAprsIconTable').value) || 0,
      via1: document.getElementById('editAprsVia1').value.trim(),
      via1SSID: parseInt(document.getElementById('editAprsVia1Ssid').value) || 0,
      via2: document.getElementById('editAprsVia2').value.trim(),
      via2SSID: parseInt(document.getElementById('editAprsVia2Ssid').value) || 0,
      comment: document.getElementById('editAprsComment').value.trim(),
      txFreq: document.getElementById('editAprsTxFreq').value.trim(),
      positionMasking: parseInt(document.getElementById('editAprsPositionMasking').value) || 0,
      baudRate: parseInt(document.getElementById('editAprsBaudRate').value) || 0,
      usePosition: document.getElementById('editAprsUsePosition').checked,
      transmitQsy: document.getElementById('editAprsTransmitQsy').checked,
      beaconSilent: document.getElementById('editAprsBeaconSilent')?.checked || false,
      latitude: parseFloat(document.getElementById('editAprsLatitude').value) || 0,
      longitude: parseFloat(document.getElementById('editAprsLongitude').value) || 0
    };
    
    try {
      if (aprsId) {
        window.codeplug.updateAPRS(aprsId, aprsData);
        Utils.toast('APRS config updated', 'success');
      } else {
        window.codeplug.addAPRS(aprsData);
        Utils.toast('APRS config added', 'success');
      }
      
      this.hideModal();
      this.renderAPRS();
      this.updateOverview();
    } catch (error) {
      Utils.toast(error.message, 'error');
    }
  },

  /**
   * Edit APRS config
   */
  editAPRS(aprsId) {
    this.showAPRSEditor(aprsId);
  },

  /**
   * Import APRS configs from CSV file
   */
  importAPRSCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const count = window.codeplug.importAPRSCSV(e.target.result);
        Utils.toast(`Imported ${count} APRS configs`, 'success');
        this.renderAPRS();
        this.updateOverview();
      } catch (error) {
        Utils.toast('Failed to import APRS CSV: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * Export APRS configs to CSV file
   */
  exportAPRSCSV() {
    const csv = window.codeplug.exportAPRSCSV();
    Utils.downloadFile(csv, 'APRS.csv', 'text/csv');
  },

  /**
   * Render VFO A/B settings
   */
  renderVFO() {
    const vfoA = window.codeplug.vfoA;
    const vfoB = window.codeplug.vfoB;
    
    // Populate contact, tgList, and APRS dropdowns
    this.populateVFODropdowns();
    
    // VFO A fields
    if (document.getElementById('vfoARxFreq')) document.getElementById('vfoARxFreq').value = vfoA.rxFreq || 145.500;
    if (document.getElementById('vfoATxFreq')) document.getElementById('vfoATxFreq').value = vfoA.txFreq || 145.500;
    if (document.getElementById('vfoAMode')) document.getElementById('vfoAMode').value = vfoA.type || 'Analogue';
    if (document.getElementById('vfoAPower')) document.getElementById('vfoAPower').value = vfoA.power || 'Master';
    if (document.getElementById('vfoABandwidth')) document.getElementById('vfoABandwidth').value = vfoA.bandwidth || 12.5;
    if (document.getElementById('vfoARxTone')) document.getElementById('vfoARxTone').value = vfoA.rxTone || 'None';
    if (document.getElementById('vfoATxTone')) document.getElementById('vfoATxTone').value = vfoA.txTone || 'None';
    if (document.getElementById('vfoASquelch')) document.getElementById('vfoASquelch').value = vfoA.squelch || 'Disabled';
    if (document.getElementById('vfoAColorCode')) document.getElementById('vfoAColorCode').value = vfoA.colorCode || 1;
    if (document.getElementById('vfoATimeslot')) document.getElementById('vfoATimeslot').value = vfoA.timeslot || 1;
    if (document.getElementById('vfoAContact')) document.getElementById('vfoAContact').value = vfoA.contact || 'None';
    if (document.getElementById('vfoATgList')) document.getElementById('vfoATgList').value = vfoA.tgList || 'None';
    if (document.getElementById('vfoAAprs')) document.getElementById('vfoAAprs').value = vfoA.aprs || 'None';
    if (document.getElementById('vfoATot')) document.getElementById('vfoATot').value = vfoA.tot || 0;
    if (document.getElementById('vfoARxOnly')) document.getElementById('vfoARxOnly').checked = vfoA.rxOnly || false;
    if (document.getElementById('vfoAVox')) document.getElementById('vfoAVox').value = vfoA.vox || 'Off';
    if (document.getElementById('vfoANoBeep')) document.getElementById('vfoANoBeep').checked = vfoA.noBeep || false;
    if (document.getElementById('vfoANoEco')) document.getElementById('vfoANoEco').checked = vfoA.noEco || false;
    if (document.getElementById('vfoAForceDmo')) document.getElementById('vfoAForceDmo').checked = vfoA.forceDmo || false;
    if (document.getElementById('vfoATs1TaTx')) document.getElementById('vfoATs1TaTx').value = vfoA.ts1TalkerAliasTx || 'Off';
    if (document.getElementById('vfoATs2TaTx')) document.getElementById('vfoATs2TaTx').value = vfoA.ts2TalkerAliasTx || 'Off';
    
    // VFO B fields
    if (document.getElementById('vfoBRxFreq')) document.getElementById('vfoBRxFreq').value = vfoB.rxFreq || 433.500;
    if (document.getElementById('vfoBTxFreq')) document.getElementById('vfoBTxFreq').value = vfoB.txFreq || 433.500;
    if (document.getElementById('vfoBMode')) document.getElementById('vfoBMode').value = vfoB.type || 'Analogue';
    if (document.getElementById('vfoBPower')) document.getElementById('vfoBPower').value = vfoB.power || 'Master';
    if (document.getElementById('vfoBBandwidth')) document.getElementById('vfoBBandwidth').value = vfoB.bandwidth || 12.5;
    if (document.getElementById('vfoBRxTone')) document.getElementById('vfoBRxTone').value = vfoB.rxTone || 'None';
    if (document.getElementById('vfoBTxTone')) document.getElementById('vfoBTxTone').value = vfoB.txTone || 'None';
    if (document.getElementById('vfoBSquelch')) document.getElementById('vfoBSquelch').value = vfoB.squelch || 'Disabled';
    if (document.getElementById('vfoBColorCode')) document.getElementById('vfoBColorCode').value = vfoB.colorCode || 1;
    if (document.getElementById('vfoBTimeslot')) document.getElementById('vfoBTimeslot').value = vfoB.timeslot || 1;
    if (document.getElementById('vfoBContact')) document.getElementById('vfoBContact').value = vfoB.contact || 'None';
    if (document.getElementById('vfoBTgList')) document.getElementById('vfoBTgList').value = vfoB.tgList || 'None';
    if (document.getElementById('vfoBAprs')) document.getElementById('vfoBAprs').value = vfoB.aprs || 'None';
    if (document.getElementById('vfoBTot')) document.getElementById('vfoBTot').value = vfoB.tot || 0;
    if (document.getElementById('vfoBRxOnly')) document.getElementById('vfoBRxOnly').checked = vfoB.rxOnly || false;
    if (document.getElementById('vfoBVox')) document.getElementById('vfoBVox').value = vfoB.vox || 'Off';
    if (document.getElementById('vfoBNoBeep')) document.getElementById('vfoBNoBeep').checked = vfoB.noBeep || false;
    if (document.getElementById('vfoBNoEco')) document.getElementById('vfoBNoEco').checked = vfoB.noEco || false;
    if (document.getElementById('vfoBForceDmo')) document.getElementById('vfoBForceDmo').checked = vfoB.forceDmo || false;
    if (document.getElementById('vfoBTs1TaTx')) document.getElementById('vfoBTs1TaTx').value = vfoB.ts1TalkerAliasTx || 'Off';
    if (document.getElementById('vfoBTs2TaTx')) document.getElementById('vfoBTs2TaTx').value = vfoB.ts2TalkerAliasTx || 'Off';
    
    this.bindVFOSettings();
  },
  
  /**
   * Populate VFO dropdown menus for contacts, TG lists, and APRS configs
   */
  populateVFODropdowns() {
    const contacts = window.codeplug.contacts || [];
    const tgLists = window.codeplug.tgLists || [];
    const aprsConfigs = window.codeplug.aprs || [];
    
    // Helper function to build options HTML from an array of items
    const buildOptions = (items) => '<option value="None">None</option>' + 
      items.map(item => `<option value="${Utils.escapeHtml(item.name)}">${Utils.escapeHtml(item.name)}</option>`).join('');
    
    // Build options HTML
    const contactOptions = buildOptions(contacts);
    const tgListOptions = buildOptions(tgLists);
    const aprsOptions = buildOptions(aprsConfigs);
    
    // Helper function to set dropdown HTML
    const setDropdown = (id, options) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = options;
    };
    
    // Populate VFO A and VFO B dropdowns
    setDropdown('vfoAContact', contactOptions);
    setDropdown('vfoATgList', tgListOptions);
    setDropdown('vfoAAprs', aprsOptions);
    setDropdown('vfoBContact', contactOptions);
    setDropdown('vfoBTgList', tgListOptions);
    setDropdown('vfoBAprs', aprsOptions);
  },
  
  /**
   * Bind VFO settings change events
   */
  bindVFOSettings() {
    if (this._vfoSettingsBound) return;
    this._vfoSettingsBound = true;
    const vfoFields = [
      { id: 'vfoARxFreq', vfo: 'vfoA', key: 'rxFreq', type: 'float' },
      { id: 'vfoATxFreq', vfo: 'vfoA', key: 'txFreq', type: 'float' },
      { id: 'vfoAMode', vfo: 'vfoA', key: 'type' },
      { id: 'vfoAPower', vfo: 'vfoA', key: 'power' },
      { id: 'vfoABandwidth', vfo: 'vfoA', key: 'bandwidth', type: 'float' },
      { id: 'vfoARxTone', vfo: 'vfoA', key: 'rxTone' },
      { id: 'vfoATxTone', vfo: 'vfoA', key: 'txTone' },
      { id: 'vfoASquelch', vfo: 'vfoA', key: 'squelch' },
      { id: 'vfoAColorCode', vfo: 'vfoA', key: 'colorCode', type: 'int' },
      { id: 'vfoATimeslot', vfo: 'vfoA', key: 'timeslot', type: 'int' },
      { id: 'vfoAContact', vfo: 'vfoA', key: 'contact' },
      { id: 'vfoATgList', vfo: 'vfoA', key: 'tgList' },
      { id: 'vfoAAprs', vfo: 'vfoA', key: 'aprs' },
      { id: 'vfoATot', vfo: 'vfoA', key: 'tot', type: 'int' },
      { id: 'vfoARxOnly', vfo: 'vfoA', key: 'rxOnly', type: 'bool' },
      { id: 'vfoAVox', vfo: 'vfoA', key: 'vox' },
      { id: 'vfoANoBeep', vfo: 'vfoA', key: 'noBeep', type: 'bool' },
      { id: 'vfoANoEco', vfo: 'vfoA', key: 'noEco', type: 'bool' },
      { id: 'vfoAForceDmo', vfo: 'vfoA', key: 'forceDmo', type: 'bool' },
      { id: 'vfoATs1TaTx', vfo: 'vfoA', key: 'ts1TalkerAliasTx' },
      { id: 'vfoATs2TaTx', vfo: 'vfoA', key: 'ts2TalkerAliasTx' },
      { id: 'vfoBRxFreq', vfo: 'vfoB', key: 'rxFreq', type: 'float' },
      { id: 'vfoBTxFreq', vfo: 'vfoB', key: 'txFreq', type: 'float' },
      { id: 'vfoBMode', vfo: 'vfoB', key: 'type' },
      { id: 'vfoBPower', vfo: 'vfoB', key: 'power' },
      { id: 'vfoBBandwidth', vfo: 'vfoB', key: 'bandwidth', type: 'float' },
      { id: 'vfoBRxTone', vfo: 'vfoB', key: 'rxTone' },
      { id: 'vfoBTxTone', vfo: 'vfoB', key: 'txTone' },
      { id: 'vfoBSquelch', vfo: 'vfoB', key: 'squelch' },
      { id: 'vfoBColorCode', vfo: 'vfoB', key: 'colorCode', type: 'int' },
      { id: 'vfoBTimeslot', vfo: 'vfoB', key: 'timeslot', type: 'int' },
      { id: 'vfoBContact', vfo: 'vfoB', key: 'contact' },
      { id: 'vfoBTgList', vfo: 'vfoB', key: 'tgList' },
      { id: 'vfoBAprs', vfo: 'vfoB', key: 'aprs' },
      { id: 'vfoBTot', vfo: 'vfoB', key: 'tot', type: 'int' },
      { id: 'vfoBRxOnly', vfo: 'vfoB', key: 'rxOnly', type: 'bool' },
      { id: 'vfoBVox', vfo: 'vfoB', key: 'vox' },
      { id: 'vfoBNoBeep', vfo: 'vfoB', key: 'noBeep', type: 'bool' },
      { id: 'vfoBNoEco', vfo: 'vfoB', key: 'noEco', type: 'bool' },
      { id: 'vfoBForceDmo', vfo: 'vfoB', key: 'forceDmo', type: 'bool' },
      { id: 'vfoBTs1TaTx', vfo: 'vfoB', key: 'ts1TalkerAliasTx' },
      { id: 'vfoBTs2TaTx', vfo: 'vfoB', key: 'ts2TalkerAliasTx' }
    ];
    
    vfoFields.forEach(f => {
      const el = document.getElementById(f.id);
      el?.addEventListener('change', (e) => {
        let val = e.target.value;
        if (f.type === 'float') val = parseFloat(val) || 0;
        else if (f.type === 'int') val = parseInt(val) || 0;
        else if (f.type === 'bool') val = e.target.checked;
        window.codeplug[f.vfo][f.key] = val;
        window.codeplug.modified = true;
      });
    });
  },
  
  /**
   * Render Band Limits settings
   */
  renderBandLimits() {
    const bl = window.codeplug.bandLimits;
    
    if (document.getElementById('bandVhfMin')) document.getElementById('bandVhfMin').value = (bl.vhfMin / 1000000).toFixed(3);
    if (document.getElementById('bandVhfMax')) document.getElementById('bandVhfMax').value = (bl.vhfMax / 1000000).toFixed(3);
    if (document.getElementById('bandUhfMin')) document.getElementById('bandUhfMin').value = (bl.uhfMin / 1000000).toFixed(3);
    if (document.getElementById('bandUhfMax')) document.getElementById('bandUhfMax').value = (bl.uhfMax / 1000000).toFixed(3);
    
    this.bindBandLimitSettings();
  },
  
  /**
   * Bind Band Limit settings change events
   */
  bindBandLimitSettings() {
    if (this._bandLimitsBound) return;
    this._bandLimitsBound = true;
    const fields = [
      { id: 'bandVhfMin', key: 'vhfMin' },
      { id: 'bandVhfMax', key: 'vhfMax' },
      { id: 'bandUhfMin', key: 'uhfMin' },
      { id: 'bandUhfMax', key: 'uhfMax' }
    ];
    
    fields.forEach(f => {
      document.getElementById(f.id)?.addEventListener('input', (e) => {
        const mhz = parseFloat(e.target.value) || 0;
        window.codeplug.bandLimits[f.key] = Math.round(mhz * 1000000);
        window.codeplug.modified = true;
      });
    });
  },

  loadBootSettings() {
    const general = window.codeplug.general;
    
    // Boot screen mode (linked with the General Settings copy)
    const bootScreenMode = document.getElementById('bootScreenMode');
    if (bootScreenMode) {
      bootScreenMode.value = general.bootScreenMode || 0;
    }
    const generalBootScreenMode = document.getElementById('generalBootScreenMode');
    if (generalBootScreenMode) {
      generalBootScreenMode.value = general.bootScreenMode || 0;
    }
    
    // Display mode (linked with the General Settings copy)
    const displayMode = document.getElementById('displayMode');
    if (displayMode) {
      displayMode.value = general.displayMode || 'Picture';
    }
    const generalDisplayMode = document.getElementById('generalDisplayMode');
    if (generalDisplayMode) {
      generalDisplayMode.value = general.displayMode || 'Picture';
    }
    
    // Boot password
    const bootPasswordEnabled = document.getElementById('bootPasswordEnabled');
    if (bootPasswordEnabled) {
      bootPasswordEnabled.checked = general.bootPasswordEnabled || false;
    }
    
    const bootPassword = document.getElementById('bootPassword');
    if (bootPassword) {
      bootPassword.value = general.bootPassword || '';
    }
    
    // Boot melody
    const bootMelody = document.getElementById('bootMelody');
    if (bootMelody) {
      if (general.bootMelody) bootMelody.value = general.bootMelody;
      this._melody = this.parseMelodyString(bootMelody.value);
      if (document.getElementById('melodySequence')) this.renderBootMelodyComposer(false);
    }
    
    // Bind change events
    this.bindBootSettingsEvents();
  },

  /**
   * Read the boot melody and boot image currently stored on the radio and
   * populate the editor. Runs when the Boot Settings section is opened.
   */
  async readBootSettingsFromRadio() {
    if (!window.radioUSB?.connected) {
      Utils.toast('Connect to the radio first', 'warning');
      return;
    }
    try {
      const blocks = await window.radioUSB.readCustomDataBlocks([1, 2]);

      // Boot melody (type 2)
      const melodyData = blocks[2];
      if (melodyData) {
        const parts = [];
        for (let i = 0; i + 1 < melodyData.length && i < 512; i += 2) {
          const note = melodyData[i];
          const duration = melodyData[i + 1];
          if (note === 0 && duration === 0) break;
          parts.push(note, duration);
        }
        const melody = parts.join(',');
        const bootMelody = document.getElementById('bootMelody');
        if (bootMelody) {
          bootMelody.value = melody;
        }
        window.codeplug.general.bootMelody = melody;
        // Copy the melody read from the radio into the piano editor.
        this._melody = this.parseMelodyString(melody);
        if (document.getElementById('melodySequence')) this.renderBootMelodyComposer(false);
      }

      // Boot image (type 1)
      const imageData = blocks[1];
      if (imageData && imageData.length >= 1024) {
        this.bootImageData = imageData.slice(0, 1024);
        this.renderBootImagePreview(this.bootImageData);
      }
      Utils.toast('Boot settings read from the radio', 'success');
    } catch (error) {
      console.warn('Failed to read boot settings from radio:', error);
    }
  },

  /**
   * Draw a 1024-byte OpenGD77 boot image (1bpp, bit set = black) onto the preview canvas.
   */
  renderBootImagePreview(data) {
    const canvas = document.getElementById('bootImagePreview');
    if (!canvas) return;

    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(128, 64);

    for (let stripe = 0; stripe < 8; stripe++) {
      for (let column = 0; column < 128; column++) {
        const byte = data[stripe * 128 + column];
        for (let line = 0; line < 8; line++) {
          const x = column;
          const y = stripe * 8 + line;
          const idx = (y * 128 + x) * 4;
          const isSet = (byte >> line) & 1;
          const v = isSet ? 0 : 255; // set bit = black
          imageData.data[idx] = v;
          imageData.data[idx + 1] = v;
          imageData.data[idx + 2] = v;
          imageData.data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  },

  /**
   * Bind boot settings form events
   */
  bindBootSettingsEvents() {
    if (this._bootEventsBound) return;
    this._bootEventsBound = true;
    const bootScreenMode = document.getElementById('bootScreenMode');
    const displayMode = document.getElementById('displayMode');
    const bootPasswordEnabled = document.getElementById('bootPasswordEnabled');
    const bootPassword = document.getElementById('bootPassword');
    
    // Boot screen / display mode appear in both General Settings and Boot
    // Settings - keep the two copies in sync.
    const generalBootScreenMode = document.getElementById('generalBootScreenMode');
    const generalDisplayMode = document.getElementById('generalDisplayMode');
    const syncBootDisplay = (source) => {
      const bs = document.getElementById('bootScreenMode');
      const dm = document.getElementById('displayMode');
      const gbs = document.getElementById('generalBootScreenMode');
      const gdm = document.getElementById('generalDisplayMode');
      if (source === 'bootScreen' && gbs && bs) gbs.value = bs.value;
      if (source === 'generalBootScreen' && bs && gbs) bs.value = gbs.value;
      if (source === 'display' && gdm && dm) gdm.value = dm.value;
      if (source === 'generalDisplay' && dm && gdm) dm.value = gdm.value;
      if (window.codeplug) {
        if (bs) window.codeplug.general.bootScreenMode = parseInt(bs.value, 10);
        if (dm) window.codeplug.general.displayMode = dm.value;
        window.codeplug.modified = true;
      }
    };

    bootScreenMode?.addEventListener('change', () => syncBootDisplay('bootScreen'));
    displayMode?.addEventListener('change', () => syncBootDisplay('display'));
    generalBootScreenMode?.addEventListener('change', () => syncBootDisplay('generalBootScreen'));
    generalDisplayMode?.addEventListener('change', () => syncBootDisplay('generalDisplay'));
    document.getElementById('openBootSettingsBtn')?.addEventListener('click', () => UI.showSection('boot-settings'));
    document.getElementById('readBootSettingsBtn')?.addEventListener('click', () => this.readBootSettingsFromRadio());
    
    bootPasswordEnabled?.addEventListener('change', () => {
      window.codeplug.general.bootPasswordEnabled = bootPasswordEnabled.checked;
      window.codeplug.modified = true;
    });
    
    if (bootPassword) {
      // Readable field: digits only, max 6, and must be empty or 4-6 digits.
      const sanitizeBootPassword = () => {
        const cleaned = bootPassword.value.replace(/\D/g, '').slice(0, 6);
        if (cleaned !== bootPassword.value) bootPassword.value = cleaned;
        return cleaned;
      };
      bootPassword.addEventListener('input', () => {
        window.codeplug.general.bootPassword = sanitizeBootPassword();
        window.codeplug.modified = true;
      });
      bootPassword.addEventListener('change', () => {
        const cleaned = sanitizeBootPassword();
        if (cleaned.length > 0 && cleaned.length < 4) {
          Utils.toast('Power-on password must be empty or 4 to 6 digits', 'warning');
          bootPassword.value = '';
          window.codeplug.general.bootPassword = '';
          window.codeplug.modified = true;
        }
      });
    }
    
    // Boot melody handlers (composer + raw textarea)
    this.initBootMelodyComposer();
    const bootMelody = document.getElementById('bootMelody');
    bootMelody?.addEventListener('input', () => {
      window.codeplug.general.bootMelody = bootMelody.value;
      window.codeplug.modified = true;
      // Reflect manual edits in the composer without rewriting the textarea.
      this._melody = this.parseMelodyString(bootMelody.value);
      this.renderBootMelodyComposer(false);
    });
    
    const playBootMelodyBtn = document.getElementById('playBootMelodyBtn');
    playBootMelodyBtn?.addEventListener('click', () => {
      this.playBootMelody();
    });
    
    // Boot image file handler
    const bootImageFile = document.getElementById('bootImageFile');
    bootImageFile?.addEventListener('change', (e) => {
      this.handleBootImageSelect(e);
    });
    
    // Clear boot image button
    const clearBootImageBtn = document.getElementById('clearBootImageBtn');
    clearBootImageBtn?.addEventListener('click', () => {
      const canvas = document.getElementById('bootImagePreview');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 128, 64);
      }
      this.bootImageData = null;
      Utils.toast('Boot image cleared', 'info');
    });
    
    // Write boot image to radio button
    const writeBootImageBtn = document.getElementById('writeBootImageBtn');
    writeBootImageBtn?.addEventListener('click', async () => {
      if (!window.radioUSB?.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      if (!this.bootImageData) {
        Utils.toast('No boot image to write. Select an image first.', 'warning');
        return;
      }
      
      try {
        Utils.toast('Writing boot image to radio...', 'info');
        await window.radioUSB.writeBootImage(this.bootImageData);
        Utils.toast('Boot image written to radio successfully!', 'success');
      } catch (error) {
        console.error('Failed to write boot image:', error);
        Utils.toast('Failed to write boot image: ' + error.message, 'error');
      }
    });
    
    // Write boot melody to radio button
    const writeBootMelodyBtn = document.getElementById('writeBootMelodyBtn');
    writeBootMelodyBtn?.addEventListener('click', async () => {
      if (!window.radioUSB?.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }

      const melodyData = this.parseBootMelodyData();
      if (!melodyData) return;

      try {
        Utils.toast('Writing boot melody to radio...', 'info');
        await window.radioUSB.writeBootMelody(melodyData);
        Utils.toast('Boot melody written to radio successfully!', 'success');
      } catch (error) {
        console.error('Failed to write boot melody:', error);
        Utils.toast('Failed to write boot melody: ' + error.message, 'error');
      }
    });
  },

  /**
   * Parse the boot melody input into the OpenGD77 512-byte format.
   * Format: note,duration pairs as bytes, terminated by 0,0.
   * @returns {Uint8Array|null} 512-byte melody data, or null if invalid
   */
  parseBootMelodyData() {
    const bootMelody = document.getElementById('bootMelody');
    if (!bootMelody || !bootMelody.value.trim()) {
      Utils.toast('No melody to write', 'warning');
      return null;
    }

    const melodyStr = bootMelody.value.replace(/\s+/g, '');
    const values = melodyStr.split(',').map(v => parseInt(v, 10)).filter(v => !isNaN(v));

    if (values.length < 2 || values.length % 2 !== 0) {
      Utils.toast('Invalid melody format. Use note,duration pairs.', 'error');
      return null;
    }

    const data = new Uint8Array(512);
    let pos = 0;
    // Firmware (soundCreateSong): notes 0-63, up to 255 pairs, stops at the
    // first pair whose duration is 0.
    for (let i = 0; i + 1 < values.length && pos < 510; i += 2) {
      const note = Math.max(0, Math.min(63, values[i]));
      const dur = values[i + 1];
      if (dur === 0) break;
      data[pos] = note & 0xFF;
      data[pos + 1] = (Math.max(1, Math.min(255, dur))) & 0xFF;
      pos += 2;
    }
    // Terminate the melody
    data[pos] = 0;
    data[pos + 1] = 0;
    return data;
  },

  /**
   * Play the boot melody using Web Audio API
   * Melody format: note1,duration1,note2,duration2,... (0,0 ends the melody)
   * Note values are MIDI note numbers, frequency = 98 * 2^(note/12)
   * Duration is multiplied by 35ms to get actual duration
   */
  playBootMelody() {
    const bootMelody = document.getElementById('bootMelody');
    if (!bootMelody || !bootMelody.value.trim()) {
      Utils.toast('No melody to play', 'warning');
      return;
    }
    
    // Parse the melody string (remove all whitespace)
    const melodyStr = bootMelody.value.replace(/\s+/g, '');
    const values = melodyStr.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
    
    if (values.length < 2 || values.length % 2 !== 0) {
      Utils.toast('Invalid melody format. Use note,duration pairs.', 'error');
      return;
    }
    
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let currentTime = audioContext.currentTime;
    // Firmware soundCreateSong() uses 27 ms per duration unit and this exact
    // frequency table (index 0 is a rest / silence).
    const MELODY_FREQS = [0,104,110,117,123,131,139,147,156,165,175,185,196,208,220,233,247,262,277,294,311,330,349,370,392,415,440,466,494,523,554,587,622,659,698,740,784,831,880,932,988,1047,1109,1175,1245,1319,1397,1480,1568,1661,1760,1865,1976,2093,2217,2349,2489,2637,2794,2960,3136,3322,3520,3729];
    const durationMultiplier = 0.027; // 27ms per duration unit
    const minDuration = 0.02; // Minimum duration for fade-out to work properly
    
    // Play each note
    for (let i = 0; i < values.length; i += 2) {
      const note = values[i];
      const duration = values[i + 1];
      
      // Check for melody end marker (0,0)
      if (note === 0 && duration === 0) {
        break;
      }
      
      const noteDuration = Math.max(duration * durationMultiplier, minDuration);
      
      // Firmware clamps the note to 0-63 and looks it up in the frequency table
      const freq = MELODY_FREQS[Math.max(0, Math.min(63, note))];
      
      // Index 0 is a rest - advance time without producing a tone
      if (freq === 0) {
        currentTime += noteDuration;
        continue;
      }
      
      // Create oscillator for this note
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'square'; // Square wave similar to radio beep
      oscillator.frequency.setValueAtTime(freq, currentTime);
      
      // Set volume and add fade out to avoid clicks
      gainNode.gain.setValueAtTime(0.2, currentTime);
      if (noteDuration > 0.02) {
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + noteDuration - 0.01);
      }
      
      oscillator.start(currentTime);
      oscillator.stop(currentTime + noteDuration);
      
      currentTime += noteDuration;
    }
    
    // Close the audio context after the melody finishes to prevent leaks.
    const totalDuration = (currentTime - audioContext.currentTime) * 1000;
    this._trackMelodyCtx(audioContext, totalDuration / 1000);
    Utils.toast('Playing melody...', 'info');
  },

  MELODY_PRESETS: {
    'Default beep': [['G5', 4], ['C6', 4], ['E6', 4], ['G6', 10]],
    'Ascending': [['C4', 4], ['D4', 4], ['E4', 4], ['F4', 4], ['G4', 4], ['A4', 4], ['B4', 4], ['C5', 10]],
    'Nokia tune': [['E5', 8], ['D5', 8], ['F#4', 16], ['G#4', 16], ['C#5', 8], ['B4', 16], ['D4', 16], ['E4', 16], ['B4', 16], ['A4', 16], ['C#4', 16], ['E4', 16], ['A4', 30]],
    'Ode to Joy': [['E4', 8], ['E4', 8], ['F4', 8], ['G4', 8], ['G4', 8], ['F4', 8], ['E4', 8], ['D4', 8], ['C4', 8], ['C4', 8], ['D4', 8], ['E4', 8], ['E4', 12], ['D4', 4], ['D4', 16]],
    'Imperial March': [['G4', 8], ['G4', 8], ['G4', 8], ['D#4', 6], ['A#4', 2], ['G4', 8], ['D#4', 6], ['A#4', 2], ['G4', 16]]
  },

  /** Human-readable note name for a firmware note index (1 = G#2, 63 = G#7). */
  melodyNoteName(index) {
    if (!index || index <= 0) return 'Rest';
    const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const semitone = index - 1;
    const pc = (semitone + 8) % 12;                       // index 1 == G#
    const octave = 2 + Math.floor((semitone + 8) / 12);
    return NAMES[pc] + octave;
  },

  /** Firmware note index for a note name (e.g. "C4", "F#5"). */
  melodyIndexFromName(name) {
    const m = /^([A-Ga-g])(#?)(-?\d)$/.exec(String(name || '').trim());
    if (!m) return 0;
    const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const midi = (parseInt(m[3], 10) + 1) * 12 + semis[m[1].toUpperCase()] + (m[2] ? 1 : 0);
    return Math.max(0, Math.min(63, midi - 43));
  },

  /** Parse a "note,duration,…" string into pairs, applying the firmware rules. */
  parseMelodyString(str) {
    const out = [];
    const values = String(str || '').replace(/\s+/g, '').split(',').map(v => parseInt(v, 10));
    for (let i = 0; i + 1 < values.length && out.length < 255; i += 2) {
      const n = values[i];
      const d = values[i + 1];
      if (isNaN(n) || isNaN(d) || d === 0) break;
      out.push({ n: Math.max(0, Math.min(63, n)), d: Math.max(1, Math.min(255, d)) });
    }
    return out;
  },

  /** Serialise melody pairs back to the "note,duration,…,0,0" string. */
  melodyToString(seq) {
    if (!seq || seq.length === 0) return '';
    const parts = [];
    for (const p of seq) {
      if (p && p.end) break;                       // end marker stops output
      parts.push(p.n); parts.push(Math.max(1, Math.min(255, p.d)));
    }
    parts.push(0, 0);
    return parts.join(',');
  },

  /** Build the piano keyboard once and bind the composer toolbar. */
  initBootMelodyComposer() {
    const kb = document.getElementById('melodyKeyboard');
    if (kb && !kb.childElementCount) {
      let html = '<button type="button" class="melody-key rest" data-note="0" title="Rest">Rest</button>';
      for (let i = 1; i <= 63; i++) {
        const name = this.melodyNoteName(i);
        html += `<button type="button" class="melody-key${name.includes('#') ? ' black' : ''}" data-note="${i}" title="${name}">${name}</button>`;
      }
      kb.innerHTML = html;
      kb.addEventListener('click', (e) => {
        const key = e.target.closest('.melody-key');
        if (key) this.melodyAddNote(parseInt(key.dataset.note, 10));
      });
    }

    document.getElementById('melodySequence')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.melody-chip');
      if (chip) this.melodyRemoveNote(parseInt(chip.dataset.index, 10));
    });
    document.getElementById('melodyBackspaceBtn')?.addEventListener('click', () => this.melodyBackspace());
    document.getElementById('melodyClearBtn')?.addEventListener('click', () => this.melodyClear());
    document.getElementById('melodyEndBtn')?.addEventListener('click', () => this.melodyAddEnd());
    document.getElementById('stopBootMelodyBtn')?.addEventListener('click', () => this.stopBootMelody());
    document.getElementById('melodySaveBtn')?.addEventListener('click', () => this.melodySave());
    document.getElementById('melodyShareBtn')?.addEventListener('click', () => this.melodyShare());
    document.getElementById('melodyBrowseBtn')?.addEventListener('click', () => this.melodyBrowseLibrary());
    document.getElementById('melodyImportBtn')?.addEventListener('click', () => this.melodyImport());

    const presetSel = document.getElementById('melodyPreset');
    if (presetSel && presetSel.options.length <= 1) {
      Object.keys(this.MELODY_PRESETS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        presetSel.appendChild(opt);
      });
      presetSel.addEventListener('change', () => {
        if (presetSel.value) this.melodyLoadPreset(presetSel.value);
      });
    }

    if (!this._melody) {
      const ta = document.getElementById('bootMelody');
      this._melody = this.parseMelodyString(ta ? ta.value : '');
    }
    this.renderBootMelodyComposer(false);
    this.renderMelodySaved();
    this.melodyRefreshAccountTunes();
    // A shared tune arrives as #melody=… - apply it once the UI has settled.
    setTimeout(() => this.melodyApplyShareLink(), 600);
  },

  /** Render the sequence chips + count, optionally syncing the raw textarea. */
  renderBootMelodyComposer(syncText = true) {
    const seq = this._melody || [];
    const seqEl = document.getElementById('melodySequence');
    if (seqEl) {
      let ended = false;
      seqEl.innerHTML = seq.length
        ? seq.map((p, i) => {
            if (p && p.end) {
              ended = true;
              return `<span class="melody-chip end" data-index="${i}" title="End marker - playback stops here (click to remove)">■ End</span>`;
            }
            const muted = ended ? ' muted' : '';
            return `<span class="melody-chip${muted}" data-index="${i}" title="Click to remove">${p.n === 0 ? 'Rest' : this.melodyNoteName(p.n)}<small>${p.d}</small></span>`;
          }).join('')
        : '<span class="melody-empty">Click the keys above to add notes.</span>';
    }
    const countEl = document.getElementById('melodyCount');
    if (countEl) countEl.textContent = `${seq.filter(p => !p.end).length} / 255 notes`;
    if (syncText) this.syncMelodyToTextarea();
  },

  syncMelodyToTextarea() {
    const str = this.melodyToString(this._melody);
    const ta = document.getElementById('bootMelody');
    if (ta && ta.value !== str) ta.value = str;
    if (window.codeplug) {
      window.codeplug.general.bootMelody = str;
      window.codeplug.modified = true;
    }
  },

  _melodyDuration() {
    const v = parseInt(document.getElementById('melodyDuration')?.value, 10);
    return Math.max(1, Math.min(255, v || 4));
  },

  melodyAddNote(note) {
    if (!this._melody) this._melody = [];
    if (this._melody.length >= 255) {
      Utils.toast('The firmware limits the boot melody to 255 notes', 'warning');
      return;
    }
    const n = Math.max(0, Math.min(63, note));
    const d = this._melodyDuration();
    this._melody.push({ n, d });
    this.renderBootMelodyComposer();
    this.playMelodyNote(n, d);
  },

  melodyRemoveNote(index) {
    if (!this._melody || index < 0 || index >= this._melody.length) return;
    this._melody.splice(index, 1);
    this.renderBootMelodyComposer();
  },

  melodyBackspace() {
    if (this._melody && this._melody.length) {
      this._melody.pop();
      this.renderBootMelodyComposer();
    }
  },

  melodyClear() {
    this._melody = [];
    this.renderBootMelodyComposer();
  },

  melodyLoadPreset(key) {
    const preset = this.MELODY_PRESETS[key];
    if (!preset) return;
    this._melody = preset.map(([name, d]) => ({ n: this.melodyIndexFromName(name), d }));
    this.renderBootMelodyComposer();
    this.playBootMelody();
  },

  /** Short audio blip when a composer key is pressed. */
  playMelodyNote(note, duration) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const MELODY_FREQS = [0,104,110,117,123,131,139,147,156,165,175,185,196,208,220,233,247,262,277,294,311,330,349,370,392,415,440,466,494,523,554,587,622,659,698,740,784,831,880,932,988,1047,1109,1175,1245,1319,1397,1480,1568,1661,1760,1865,1976,2093,2217,2349,2489,2637,2794,2960,3136,3322,3520,3729];
      const freq = MELODY_FREQS[Math.max(0, Math.min(63, note))];
      const secs = Math.max(0.02, duration * 0.027);
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + secs - 0.01);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + secs);
      }
      this._trackMelodyCtx(ctx, secs);
    } catch (e) { /* ignore */ }
  },

  /** Add the end marker - playback stops at this point. */
  melodyAddEnd() {
    if (!this._melody) this._melody = [];
    if (this._melody.some(p => p && p.end)) {
      Utils.toast('An end marker is already set', 'info');
      return;
    }
    this._melody.push({ end: true });
    this.renderBootMelodyComposer();
    Utils.toast('End marker added - playback stops here', 'info');
  },

  /** Track an AudioContext so Stop can close it early. */
  _trackMelodyCtx(ctx, seconds) {
    if (!this._melodyCtxs) this._melodyCtxs = new Set();
    this._melodyCtxs.add(ctx);
    setTimeout(() => {
      try { ctx.close(); } catch (e) { /* ignore */ }
      this._melodyCtxs.delete(ctx);
    }, seconds * 1000 + 150);
  },

  stopBootMelody() {
    if (this._melodyCtxs && this._melodyCtxs.size) {
      this._melodyCtxs.forEach(ctx => { try { ctx.close(); } catch (e) { /* ignore */ } });
      this._melodyCtxs.clear();
      Utils.toast('Playback stopped', 'info');
    }
  },

  // ---- Saved tunes (account + local fallback) -----------------------------
  _melodyLocalTunes() {
    try {
      const list = Utils.storage.get('opengd77_melody_tunes', []);
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  },
  _setMelodyLocalTunes(list) {
    Utils.storage.set('opengd77_melody_tunes', list);
  },
  _melodyIsLoggedIn() {
    return typeof API !== 'undefined' && API.isLoggedIn && API.isLoggedIn();
  },
  _melodySeqKeepEnd() {
    return (this._melody || []).map(p => (p && p.end) ? { end: true } : { n: p.n, d: p.d });
  },

  renderMelodySaved() {
    const el = document.getElementById('melodySavedList');
    if (!el) return;
    const loggedIn = this._melodyIsLoggedIn();
    const tunes = loggedIn ? (this._melodyAccountTunes || []) : this._melodyLocalTunes();
    if (!tunes.length) {
      el.innerHTML = `<span class="melody-saved-empty">${loggedIn ? 'No tunes saved to your account yet.' : 'No saved tunes yet. Compose one and press Save.'}</span>`;
      return;
    }
    el.innerHTML = tunes.map((t, i) => `
      <span class="melody-saved-item">
        <span class="melody-saved-name" onclick="UI.melodyLoadSaved(${i})" title="Load this tune">${Utils.escapeHtml(t.name || 'Untitled')}</span>
        ${loggedIn ? `<button type="button" class="melody-mini-btn" onclick="UI.melodyShareSaved(${i})" title="Share to the public library">↗</button>` : ''}
        <button type="button" class="melody-mini-btn" onclick="UI.melodyDeleteSaved(${i})" title="Delete">✕</button>
      </span>`).join('');
  },

  async melodyRefreshAccountTunes() {
    if (!this._melodyIsLoggedIn()) {
      this._melodyAccountTunes = null;
      this.renderMelodySaved();
      return;
    }
    try {
      this._melodyAccountTunes = await API.getMyMelodies();
    } catch (e) {
      this._melodyAccountTunes = [];
    }
    this.renderMelodySaved();
  },

  async melodySave() {
    if (!this._melody || this._melody.filter(p => !p.end).length === 0) {
      Utils.toast('Compose a melody first', 'warning');
      return;
    }
    const nameInput = document.getElementById('melodySaveName');
    const name = (nameInput?.value || '').trim().slice(0, 40) || `Tune ${this._melodyLocalTunes().length + 1}`;
    const data = this._melodySeqKeepEnd();

    if (this._melodyIsLoggedIn()) {
      try {
        await API.saveMelody(name, '', data);
        if (nameInput) nameInput.value = '';
        await this.melodyRefreshAccountTunes();
        Utils.toast(`Saved "${name}" to your account`, 'success');
      } catch (e) {
        Utils.toast('Save failed: ' + e.message, 'error');
      }
      return;
    }

    const tunes = this._melodyLocalTunes();
    const existing = tunes.findIndex(t => (t.name || '').toLowerCase() === name.toLowerCase());
    if (existing >= 0) tunes[existing] = { name, seq: data };
    else tunes.push({ name, seq: data });
    this._setMelodyLocalTunes(tunes);
    if (nameInput) nameInput.value = '';
    this.renderMelodySaved();
    Utils.toast(`Saved "${name}" on this device`, 'success');
  },

  async melodyLoadSaved(index) {
    let name = '';
    let seq = null;
    if (this._melodyIsLoggedIn()) {
      const t = (this._melodyAccountTunes || [])[index];
      if (!t) return;
      try {
        const full = await API.request(`/melodies/${t.id}`);
        seq = full.data;
        name = t.name;
      } catch (e) {
        Utils.toast('Load failed: ' + e.message, 'error');
        return;
      }
    } else {
      const t = this._melodyLocalTunes()[index];
      if (!t) return;
      name = t.name;
      seq = t.seq;
    }
    if (!Array.isArray(seq)) { Utils.toast('Tune data missing', 'error'); return; }
    this._melody = seq.map(p => (p && p.end) ? { end: true } : { n: p.n, d: p.d });
    const nameInput = document.getElementById('melodySaveName');
    if (nameInput) nameInput.value = name || '';
    this.renderBootMelodyComposer();
    Utils.toast(`Loaded "${name || 'Untitled'}"`, 'info');
  },

  async melodyDeleteSaved(index) {
    if (this._melodyIsLoggedIn()) {
      const t = (this._melodyAccountTunes || [])[index];
      if (!t) return;
      try {
        await API.deleteMelody(t.id);
        await this.melodyRefreshAccountTunes();
        Utils.toast(`Deleted "${t.name}"`, 'info');
      } catch (e) { Utils.toast('Delete failed: ' + e.message, 'error'); }
      return;
    }
    const tunes = this._melodyLocalTunes();
    if (index < 0 || index >= tunes.length) return;
    const [removed] = tunes.splice(index, 1);
    this._setMelodyLocalTunes(tunes);
    this.renderMelodySaved();
    Utils.toast(`Deleted "${removed?.name || 'tune'}"`, 'info');
  },

  async melodyShareSaved(index) {
    const t = (this._melodyAccountTunes || [])[index];
    if (!t) return;
    try {
      await API.shareMelody(t.id);
      Utils.toast(`"${t.name}" shared to the public library`, 'success');
    } catch (e) {
      Utils.toast('Share failed: ' + e.message, 'error');
    }
  },

  // ---- Public tune library ------------------------------------------------
  async melodyBrowseLibrary() {
    if (typeof API.getSharedMelodies !== 'function') {
      Utils.toast('The shared tune library is available in the hosted app', 'info');
      return;
    }
    let tunes = [];
    try {
      tunes = await API.getSharedMelodies({ limit: 100 });
    } catch (e) {
      Utils.toast('Could not load the tune library: ' + e.message, 'error');
      return;
    }
    const body = tunes.length
      ? `<div class="melody-library">${tunes.map(t => `
          <div class="melody-library-item">
            <div class="melody-library-info">
              <strong>${Utils.escapeHtml(t.name || 'Untitled')}</strong>
              <small>by ${Utils.escapeHtml(t.sharedBy || 'Anonymous')} · ${t.noteCount || 0} notes · ${t.downloadCount || 0} imports</small>
            </div>
            <button type="button" class="btn btn-sm btn-primary" onclick="UI.melodyImportFromLibrary(${t.id})"><i class="mdi mdi-download"></i> Use</button>
          </div>`).join('')}</div>`
      : '<p style="color:var(--text-muted);">No tunes shared yet. Be the first!</p>';
    this.showModal('Shared Tunes', body, { extraWide: true, confirmText: 'Close', hideCancel: true, onConfirm: () => this.hideModal() });
  },

  async melodyImportFromLibrary(id) {
    try {
      const res = await API.importSharedMelody(id);
      const seq = res.data;
      if (!Array.isArray(seq)) throw new Error('bad data');
      this._melody = seq.map(p => (p && p.end) ? { end: true } : { n: p.n, d: p.d });
      const nameInput = document.getElementById('melodySaveName');
      if (nameInput) nameInput.value = res.name || '';
      this.hideModal();
      this.renderBootMelodyComposer();
      Utils.toast(`Imported "${res.name || 'tune'}"`, 'success');
    } catch (e) {
      Utils.toast('Import failed: ' + e.message, 'error');
    }
  },

  // ---- Link / code sharing ------------------------------------------------
  melodyEncode(seq, name) {
    const m = (seq || []).map(p => (p && p.end) ? ['e'] : [p.n, p.d]);
    const json = JSON.stringify({ v: 1, n: String(name || '').slice(0, 40), m });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  melodyDecode(code) {
    if (!code) return null;
    const b64 = String(code).trim().replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || !Array.isArray(payload.m)) return null;
    const seq = payload.m.map(x => (Array.isArray(x) && x[0] === 'e') ? { end: true } : { n: x[0] | 0, d: x[1] | 0 });
    return { name: payload.n || '', seq };
  },

  melodyShare() {
    if (!this._melody || this._melody.filter(p => !p.end).length === 0) {
      Utils.toast('Compose a melody first', 'warning');
      return;
    }
    const name = (document.getElementById('melodySaveName')?.value || '').trim();
    const code = this.melodyEncode(this._melody, name);
    const link = `${location.origin}${location.pathname}#melody=${code}`;
    this._copyText(link);
    const libraryHint = this._melodyIsLoggedIn()
      ? `<p style="margin-top:0.9rem; font-size:0.85rem; color:var(--text-secondary);">
           <i class="mdi mdi-earth"></i> Want it in the community library? Save it, then click the <strong>↗</strong> button next to the tune in <strong>My Tunes</strong> to share it publicly.
         </p>`
      : '';
    this.showModal('Share Boot Melody', `
      <p>Anyone with this link opens the CPS with your tune loaded in the composer.</p>
      <input type="text" class="form-input" id="melodyShareLink" value="${Utils.escapeHtml(link)}" readonly onclick="this.select()">
      <p style="margin-top:0.75rem; font-size:0.85rem; color:var(--text-muted);">Or share just the code:</p>
      <input type="text" class="form-input" id="melodyShareCode" value="${Utils.escapeHtml(code)}" readonly onclick="this.select()">
      ${libraryHint}
    `, { wide: true, confirmText: 'Done', hideCancel: true, onConfirm: () => this.hideModal() });
  },

  melodyImport() {
    this.showModal('Import Boot Melody', `
      <p>Paste a share link or a share code.</p>
      <textarea class="form-input" id="melodyImportInput" rows="3" placeholder="https://…/#melody=…  or  the code" style="font-family:monospace;"></textarea>
    `, {
      confirmText: 'Import',
      onConfirm: () => {
        const raw = document.getElementById('melodyImportInput')?.value || '';
        this.hideModal();
        this.melodyApplyImport(raw);
      }
    });
  },

  melodyApplyImport(raw, quiet = false) {
    const str = String(raw || '').trim();
    if (!str) return false;
    const code = str.includes('#melody=') ? str.split('#melody=')[1].split('&')[0] : str;
    let decoded = null;
    try { decoded = this.melodyDecode(code); } catch (e) { decoded = null; }
    if (!decoded || !decoded.seq || !decoded.seq.length) {
      if (!quiet) Utils.toast('That does not look like a valid melody share code', 'error');
      return false;
    }
    this._melody = decoded.seq;
    const nameInput = document.getElementById('melodySaveName');
    if (nameInput && decoded.name) nameInput.value = decoded.name;
    this.renderBootMelodyComposer();
    if (!quiet) Utils.toast('Shared melody imported', 'success');
    return true;
  },

  melodyApplyShareLink() {
    const hash = location.hash || '';
    const m = /[#&]melody=([^&]+)/.exec(hash);
    if (!m) return false;
    this.melodyApplyImport(m[1], false);
    if (document.getElementById('section-boot-settings')) UI.showSection('boot-settings');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    return true;
  },

  /** Play an arbitrary stored melody payload (used by the shared-tunes preview). */
  playMelodyData(data) {
    if (!Array.isArray(data) || data.length === 0) { Utils.toast('No melody data', 'warning'); return; }
    const parts = [];
    for (const p of data) {
      if (Array.isArray(p)) { if (p[0] === 'e') break; parts.push(p[0], p[1]); }
      else if (p && p.end) break;
      else parts.push(p.n, p.d);
    }
    parts.push(0, 0);
    const ta = document.getElementById('bootMelody');
    const prev = ta ? ta.value : null;
    if (ta) ta.value = parts.join(',');
    try { this.playBootMelody(); }
    finally { if (ta && prev !== null) ta.value = prev; }
  },

  /** Load a stored melody payload (array of [n,d] / ['e']) into the composer. */
  melodyApplyImportData(name, seq) {
    if (!Array.isArray(seq)) return;
    this._melody = seq.map(p => Array.isArray(p)
      ? (p[0] === 'e' ? { end: true } : { n: p[0] | 0, d: p[1] | 0 })
      : (p && p.end ? { end: true } : { n: p.n, d: p.d }));
    const nameInput = document.getElementById('melodySaveName');
    if (nameInput && name) nameInput.value = name;
    this.renderBootMelodyComposer();
  },

  _copyText(text) {
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(() => {}); return; }
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    } catch (e) { /* ignore */ }
  },

  /**
   * Handle boot image file selection
   */
  handleBootImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.convertBootImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  /**
   * Convert image to 128x64 1-bit format for boot screen
   */
  convertBootImage(img) {
    const canvas = document.getElementById('bootImagePreview');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 64);
    
    // Scale image to fit 128x64
    const scale = Math.min(128 / img.width, 64 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (128 - w) / 2;
    const y = (64 - h) / 2;
    
    // Draw image
    ctx.drawImage(img, x, y, w, h);
    
    // Convert to 1-bit (threshold)
    const imageData = ctx.getImageData(0, 0, 128, 64);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const bit = brightness > 128 ? 255 : 0;
      data[i] = bit;
      data[i + 1] = bit;
      data[i + 2] = bit;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Store the converted image data for writing to radio
    this.bootImageData = this.convertCanvasToBootFormat(ctx);
    
    Utils.toast('Image converted - click Write to Radio to upload', 'success');
  },

  /**
   * Convert canvas to OpenGD77 boot image format (1024 bytes, 8 stripes of 128 bytes)
   */
  convertCanvasToBootFormat(ctx) {
    const imageData = ctx.getImageData(0, 0, 128, 64);
    const data = imageData.data;
    const bootData = new Uint8Array(1024);
    
    for (let stripe = 0; stripe < 8; stripe++) {
      for (let column = 0; column < 128; column++) {
        let byte = 0;
        for (let line = 0; line < 8; line++) {
          const x = column;
          const y = stripe * 8 + line;
          const idx = (y * 128 + x) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          // OpenGD77 boot image: a set bit (1) = BLACK pixel.
          // (The original C# CPS sets the bit when pixel.R == 0.)
          if (brightness <= 128) {
            byte |= (1 << line);
          }
        }
        bootData[stripe * 128 + column] = byte;
      }
    }
    
    return bootData;
  },

  /**
   * Current theme mode (day or night)
   */
  currentThemeMode: 'day',
  currentPreviewMode: 'channel',

  /**
   * Load theme editor with full GTM support
   */
  loadThemeEditor() {
    // Initialize theme data if not present
    if (!window.codeplug.themeDay) {
      window.codeplug.themeDay = Theme.applyDefaults({});
    }
    if (!window.codeplug.themeNight) {
      window.codeplug.themeNight = Theme.applyDefaults({});
    }
    
    // Load current theme into inputs
    this.loadThemeColorsToInputs();
    
    // Setup color input sync (color picker <-> hex input)
    this.setupColorInputSync();
    
    // Update preview
    this.updateThemePreview();
    
    // Bind events
    this.bindThemeEditorEvents();
    
    // Load theme library
    this.loadThemeLibrary();
  },

  /**
   * Get current theme object based on day/night mode
   */
  getCurrentTheme() {
    return this.currentThemeMode === 'day' 
      ? window.codeplug.themeDay 
      : window.codeplug.themeNight;
  },

  /**
   * Set current theme
   */
  setCurrentTheme(theme) {
    if (this.currentThemeMode === 'day') {
      window.codeplug.themeDay = theme;
    } else {
      window.codeplug.themeNight = theme;
    }
    window.codeplug.modified = true;
  },

  /**
   * Load theme colors into form inputs
   */
  loadThemeColorsToInputs() {
    const theme = this.getCurrentTheme();
    
    for (const slot of Theme.COLOR_SLOTS) {
      const colorInput = document.getElementById(`theme-${slot.key}`);
      const hexInput = document.querySelector(`[data-for="theme-${slot.key}"]`);
      
      const color = theme[slot.key] || Theme.DEFAULT_COLORS[slot.key] || '#000000';
      
      if (colorInput) colorInput.value = color;
      if (hexInput) hexInput.value = color;
    }
  },

  /**
   * Read theme colors from form inputs
   */
  readThemeColorsFromInputs() {
    const theme = {};
    
    for (const slot of Theme.COLOR_SLOTS) {
      const colorInput = document.getElementById(`theme-${slot.key}`);
      theme[slot.key] = colorInput?.value || Theme.DEFAULT_COLORS[slot.key] || '#000000';
    }
    
    return theme;
  },

  /**
   * Setup sync between color picker and hex input
   */
  setupColorInputSync() {
    // Color input changes -> update hex input and preview
    document.querySelectorAll('.color-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = e.target.id;
        const hexInput = document.querySelector(`[data-for="${id}"]`);
        if (hexInput) {
          hexInput.value = e.target.value;
        }
        this.onThemeColorChange();
      });
    });
    
    // Hex input changes -> update color picker and preview
    document.querySelectorAll('.color-hex').forEach(input => {
      input.addEventListener('input', (e) => {
        const colorId = e.target.dataset.for;
        const colorInput = document.getElementById(colorId);
        let value = e.target.value.trim();
        
        // Add # if missing
        if (!value.startsWith('#')) {
          value = '#' + value;
        }
        
        // Validate hex color
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          if (colorInput) {
            colorInput.value = value;
          }
          e.target.value = value;
          this.onThemeColorChange();
        }
      });
      
      input.addEventListener('blur', (e) => {
        const colorId = e.target.dataset.for;
        const colorInput = document.getElementById(colorId);
        if (colorInput) {
          e.target.value = colorInput.value;
        }
      });
    });
  },

  /**
   * Called when any theme color changes
   */
  onThemeColorChange() {
    const theme = this.readThemeColorsFromInputs();
    this.setCurrentTheme(theme);
    this.updateThemePreview();
  },

  /**
   * Update theme preview canvas
   */
  updateThemePreview() {
    const theme = this.getCurrentTheme();
    const container = document.getElementById('themePreviewCanvas');
    
    if (!container) return;
    
    // Clear existing canvas
    container.innerHTML = '';
    
    // Create preview canvas
    const canvas = Theme.createDetailedPreview(theme, this.currentPreviewMode);
    canvas.style.imageRendering = 'pixelated';
    canvas.style.width = '288px';
    canvas.style.height = 'auto';
    container.appendChild(canvas);
  },

  /**
   * Load theme library with bundled themes
   */
  async loadThemeLibrary() {
    const grid = document.getElementById('themeLibraryGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="theme-loading"><div class="loading-spinner small"></div><span>Loading themes...</span></div>';
    
    try {
      const themes = await Theme.getBundledThemesWithPreviews();
      
      grid.innerHTML = '';
      
      for (const themeMeta of themes) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'theme-thumbnail';
        thumbnail.title = `${themeMeta.name} by ${themeMeta.author}`;
        
        // Create preview canvas
        const canvas = Theme.createPreviewCanvas(themeMeta.colors, 140, 56);
        thumbnail.appendChild(canvas);
        
        // Theme name
        const info = document.createElement('div');
        info.className = 'theme-thumbnail-info';
        info.textContent = themeMeta.name;
        thumbnail.appendChild(info);
        
        // Click to apply
        thumbnail.addEventListener('click', (e) => {
          this.applyThemeFromLibrary(themeMeta, e);
        });
        
        grid.appendChild(thumbnail);
      }
    } catch (error) {
      console.error('Failed to load theme library:', error);
      grid.innerHTML = '<div class="theme-loading"><span>Failed to load themes</span></div>';
    }
  },

  /**
   * Apply a theme from the library
   */
  applyThemeFromLibrary(themeMeta, clickEvent) {
    const theme = Theme.applyDefaults(themeMeta.colors);
    this.setCurrentTheme(theme);
    this.loadThemeColorsToInputs();
    this.updateThemePreview();
    
    // Update active state
    document.querySelectorAll('.theme-thumbnail').forEach(el => el.classList.remove('active'));
    if (clickEvent && clickEvent.currentTarget) {
      clickEvent.currentTarget.classList.add('active');
    }
    
    Utils.toast(`Applied theme: ${themeMeta.name}`, 'success');
  },

  /**
   * Bind theme editor events
   */
  bindThemeEditorEvents() {
    if (this._themeEventsBound) return;
    this._themeEventsBound = true;
    // Day/Night theme toggle
    const dayBtn = document.getElementById('dayThemeBtn');
    const nightBtn = document.getElementById('nightThemeBtn');
    
    dayBtn?.addEventListener('click', () => {
      // Save current theme first
      this.setCurrentTheme(this.readThemeColorsFromInputs());
      
      this.currentThemeMode = 'day';
      dayBtn.classList.add('active');
      nightBtn.classList.remove('active');
      this.loadThemeColorsToInputs();
      this.updateThemePreview();
    });
    
    nightBtn?.addEventListener('click', () => {
      // Save current theme first
      this.setCurrentTheme(this.readThemeColorsFromInputs());
      
      this.currentThemeMode = 'night';
      nightBtn.classList.add('active');
      dayBtn.classList.remove('active');
      this.loadThemeColorsToInputs();
      this.updateThemePreview();
    });
    
    // Preview mode toggle
    document.getElementById('previewChannelBtn')?.addEventListener('click', (e) => {
      this.currentPreviewMode = 'channel';
      document.querySelectorAll('.preview-mode-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      this.updateThemePreview();
    });
    
    document.getElementById('previewMenuBtn')?.addEventListener('click', (e) => {
      this.currentPreviewMode = 'menu';
      document.querySelectorAll('.preview-mode-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      this.updateThemePreview();
    });
    
    document.getElementById('previewBootBtn')?.addEventListener('click', (e) => {
      this.currentPreviewMode = 'boot';
      document.querySelectorAll('.preview-mode-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      this.updateThemePreview();
    });
    
    // Import GTM
    const importGTMBtn = document.getElementById('importGTMBtn');
    const importGTMFile = document.getElementById('importGTMFile');
    
    importGTMBtn?.addEventListener('click', () => {
      importGTMFile?.click();
    });
    
    importGTMFile?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        
        if (data.length !== Theme.THEME_SIZE) {
          Utils.toast(`Invalid GTM file size: expected ${Theme.THEME_SIZE} bytes, got ${data.length}`, 'error');
          return;
        }
        
        const theme = Theme.parseGTM(data);
        this.setCurrentTheme(theme);
        this.loadThemeColorsToInputs();
        this.updateThemePreview();
        
        Utils.toast(`Imported theme from ${file.name}`, 'success');
      } catch (error) {
        console.error('Failed to import GTM:', error);
        Utils.toast('Failed to import GTM file: ' + error.message, 'error');
      }
      
      // Reset file input
      e.target.value = '';
    });
    
    // Export GTM
    document.getElementById('exportGTMBtn')?.addEventListener('click', () => {
      const theme = this.readThemeColorsFromInputs();
      const filename = `theme_${this.currentThemeMode}_${Date.now()}.gtm`;
      Theme.downloadGTM(theme, filename);
      Utils.toast(`Exported theme as ${filename}`, 'success');
    });
    
    // Reset to defaults
    document.getElementById('resetThemeBtn')?.addEventListener('click', () => {
      const defaultTheme = Theme.applyDefaults({});
      this.setCurrentTheme(defaultTheme);
      this.loadThemeColorsToInputs();
      this.updateThemePreview();
      Utils.toast(`Reset ${this.currentThemeMode} theme to defaults`, 'success');
    });
    
    // Read from radio - uses the new proper readTheme() method
    const readBtn = document.getElementById('readThemeBtn');
    readBtn?.addEventListener('click', async () => {
      if (!window.radioUSB?.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      try {
        Utils.toast('Reading theme from radio...', 'info');
        
        // Use the new readTheme() method that properly handles:
        // - STM32 address offset (0x20000)
        // - "OpenGD77" header (12 bytes)
        // - RGB565 color byte-swap for STM32
        // Note: Progress callback not used here since theme read is fast (<1 second)
        const result = await window.radioUSB.readTheme();
        
        let foundDay = false;
        let foundNight = false;
        
        // Parse the returned theme data (raw bytes) into color objects
        if (result.dayTheme) {
          window.codeplug.themeDay = Theme.parseGTM(result.dayTheme);
          foundDay = true;
        }
        
        if (result.nightTheme) {
          window.codeplug.themeNight = Theme.parseGTM(result.nightTheme);
          foundNight = true;
        }
        
        if (!foundDay && !foundNight) {
          Utils.toast('No custom theme found on radio, using defaults', 'info');
        } else {
          this.loadThemeColorsToInputs();
          this.updateThemePreview();
          Utils.toast(`Theme read from radio (Day: ${foundDay ? 'Yes' : 'No'}, Night: ${foundNight ? 'Yes' : 'No'})`, 'success');
        }
        
      } catch (error) {
        console.error('Failed to read theme:', error);
        Utils.toast('Failed to read theme: ' + error.message, 'error');
      }
    });
    
    // Write to radio directly - uses the new standalone writeTheme() method
    // This allows writing theme without doing a full codeplug write
    const writeBtn = document.getElementById('writeThemeBtn');
    writeBtn?.addEventListener('click', async () => {
      if (!window.radioUSB?.connected) {
        // If not connected, just save to codeplug
        const theme = this.readThemeColorsFromInputs();
        this.setCurrentTheme(theme);
        Utils.toast('Theme saved to codeplug. Connect to radio and click again to write directly.', 'info');
        return;
      }
      
      try {
        Utils.toast('Writing theme to radio...', 'info');
        
        // Get current theme colors from inputs
        const theme = this.readThemeColorsFromInputs();
        this.setCurrentTheme(theme);
        
        // Serialize theme to GTM format (64 bytes)
        const themeData = Theme.serializeGTM(theme);
        
        // Determine which theme to write based on current mode
        const dayTheme = this.currentThemeMode === 'day' ? themeData : null;
        const nightTheme = this.currentThemeMode === 'night' ? themeData : null;
        
        // Use the new writeTheme() method for standalone theme writing
        // Note: Progress callback not used here as theme write is relatively fast
        await window.radioUSB.writeTheme(dayTheme, nightTheme);
        
        Utils.toast(`${this.currentThemeMode === 'day' ? 'Day' : 'Night'} theme written to radio successfully!`, 'success');
        
      } catch (error) {
        console.error('Failed to write theme:', error);
        Utils.toast('Failed to write theme: ' + error.message, 'error');
      }
    });
  },

  /**
   * Show/hide radio tools progress
   */
  showRadioToolsProgress(show, message = 'Working...') {
    const progressEl = document.getElementById('radioToolsProgress');
    const progressBar = document.getElementById('radioToolsProgressBar');
    const progressText = document.getElementById('radioToolsProgressText');
    if (progressEl) progressEl.style.display = show ? '' : 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = message;
    // Reflect this operation in the bottom status bar and start a fresh
    // time-remaining estimate for it.
    this._toolsBarEta = show ? Utils.createEtaTracker() : null;
    try {
      if (window.App?.setActivity) {
        window.App.setActivity(show ? 'busy' : 'idle', show ? message : 'Ready');
      }
    } catch (e) { /* ignore */ }
  },

  /**
   * Update radio tools progress
   */
  updateRadioToolsProgress(percent, message) {
    const progressBar = document.getElementById('radioToolsProgressBar');
    const progressText = document.getElementById('radioToolsProgressText');
    if (progressBar) progressBar.style.width = `${percent}%`;
    let text = message || `${Math.round(percent)}%`;
    if (this._toolsBarEta) text += this._toolsBarEta.update(percent);
    if (progressText) progressText.textContent = text;
  },

  /**
   * Voice prompts library configuration
   */
  VOICE_PROMPTS_LIBRARY: {
    basePath: 'dl/Voice_Prompts/R20260131/',
    languages: [
      { code: 'english_uk_amy', name: 'English (UK) - Amy' },
      { code: 'english_uk_brian', name: 'English (UK) - Brian' },
      { code: 'english_uk_emma', name: 'English (UK) - Emma' },
      { code: 'english_uk_matthew', name: 'English (UK) - Matthew' },
      { code: 'english_usa_joanna', name: 'English (US) - Joanna' },
      { code: 'english_usa_joey', name: 'English (US) - Joey' },
      { code: 'english_usa_kendra', name: 'English (US) - Kendra' },
      { code: 'english_usa_kimberly', name: 'English (US) - Kimberly' },
      { code: 'english_usa_matthew', name: 'English (US) - Matthew' },
      { code: 'english_au_nicole', name: 'English (AU) - Nicole' },
      { code: 'english_au_russell', name: 'English (AU) - Russell' },
      { code: 'german_hans', name: 'German - Hans' },
      { code: 'german_marlene', name: 'German - Marlene' },
      { code: 'german_vicki', name: 'German - Vicki' },
      { code: 'french_france_lea', name: 'French - Léa' },
      { code: 'spanish_enrique', name: 'Spanish - Enrique' },
      { code: 'italian_bianca', name: 'Italian - Bianca' },
      { code: 'italian_giorgio', name: 'Italian - Giorgio' },
      { code: 'dutch_netherlands_lotte', name: 'Dutch - Lotte' },
      { code: 'dutch_netherlands_ruben', name: 'Dutch - Ruben' },
      { code: 'polish_jan', name: 'Polish - Jan' },
      { code: 'russian_maxim', name: 'Russian - Maxim' },
      { code: 'russian_tatyana', name: 'Russian - Tatyana' },
      { code: 'japanese_mizuki', name: 'Japanese - Mizuki' },
      { code: 'japanese_takumi', name: 'Japanese - Takumi' },
      { code: 'chinese_zhiyu', name: 'Chinese - Zhiyu' },
      { code: 'portuguese_brazil_ricardo', name: 'Portuguese (BR) - Ricardo' },
      { code: 'portuguese_brazil_vitoria', name: 'Portuguese (BR) - Vitória' },
      { code: 'portuguese_portugal_cristiano', name: 'Portuguese (PT) - Cristiano' },
      { code: 'swedish_svenska_astrid', name: 'Swedish - Astrid' },
      { code: 'danish_Naja', name: 'Danish - Naja' },
      { code: 'finnish_matthew', name: 'Finnish - Matthew' },
      { code: 'catalan_enrique', name: 'Catalan - Enrique' },
      { code: 'czech_jan', name: 'Czech - Jan' },
      { code: 'romanian_carmen', name: 'Romanian - Carmen' },
      { code: 'turkish_filiz', name: 'Turkish - Filiz' },
      { code: 'ukranian_maxim', name: 'Ukrainian - Maxim' },
      { code: 'ukranian_tatyana', name: 'Ukrainian - Tatyana' }
    ],
    // Speed options with display names, ordered with 'normal' first
    speeds: [
      { code: 'normal', name: 'Normal Speed' },
      { code: 'slow', name: 'Slow Speed' },
      { code: 'fast', name: 'Fast Speed' },
      { code: '1.5', name: '1.5x Speed' },
      { code: '2.0', name: '2.0x Speed' },
      { code: '2.5', name: '2.5x Speed' }
    ]
  },

  /**
   * Initialize voice prompts library dropdown
   */
  initVoicePromptsLibrary() {
    const select = document.getElementById('voicePromptsLibrarySelect');
    if (!select) return;
    
    // Clear existing options except the first placeholder
    select.innerHTML = '<option value="">-- Select from Library --</option>';
    
    // Create optgroups for each speed, with "Normal Speed" first
    this.VOICE_PROMPTS_LIBRARY.speeds.forEach(speed => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = speed.name;
      
      // Add all languages within this speed group
      this.VOICE_PROMPTS_LIBRARY.languages.forEach(lang => {
        const option = document.createElement('option');
        // UV380-like variant for STM32 radios like MD-9600
        option.value = `${lang.code}-${speed.code}_UV380-like.vpr`;
        option.textContent = lang.name;
        optgroup.appendChild(option);
      });
      
      select.appendChild(optgroup);
    });
    
    // Add event handler for write library prompts button
    document.getElementById('writeLibraryPromptsBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      const selectedFile = select.value;
      if (!selectedFile) {
        Utils.toast('Please select a voice prompt from the library', 'warning');
        return;
      }
      
      this.showRadioToolsProgress(true, 'Downloading voice prompts...');
      
      try {
        // Download the voice prompts file from the library
        const url = `${this.VOICE_PROMPTS_LIBRARY.basePath}${selectedFile}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download voice prompts: ${response.status}`);
        }
        
        const fileData = new Uint8Array(await response.arrayBuffer());
        
        this.updateRadioToolsProgress(10, 'Uploading to radio...');
        
        await window.radioUSB.initProtocol();
        
        // Display status on radio (matching C# CPS WRITE_VOICE_PROMPTS workflow)
        await window.radioUSB.sendSTM32Command(1);                                     // Clear screen
        await window.radioUSB.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');        // Line 1
        await window.radioUSB.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');          // Line 2
        await window.radioUSB.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Voice prompts');    // Line 3
        await window.radioUSB.sendSTM32Command(3);                                     // Render screen
        await window.radioUSB.sendSTM32Command(6, 4);                                  // Flash red LED
        
        // Voice prompts are written to flash using the sector write cycle
        // (prepare sector → send data → write sector) at VOICE_PROMPTS_ADDRESS_IN_FLASH
        // Reference: C# CPS OpenGD77Form.cs WRITE_VOICE_PROMPTS uses WriteFlash()
        // STM32 radios need STM32_FLASH_ADDRESS_OFFSET added (decompiled CPS: 586752 + STM32_FLASH_ADDRESS_OFFSET)
        let VOICE_PROMPTS_ADDR = CONFIG.PROTOCOL.VOICE_PROMPTS_ADDRESS_IN_FLASH;
        if (window.radioUSB.isFlashBasedRadio()) {
          VOICE_PROMPTS_ADDR += CONFIG.PROTOCOL.STM32_FLASH_OFFSET;
        }
        
        await window.radioUSB.writeFlash(VOICE_PROMPTS_ADDR, fileData, (p) => {
          const progress = 10 + (p * 0.85);
          this.updateRadioToolsProgress(progress, `Uploading: ${Math.round(progress)}%`);
        });
        
        // Save settings and VFOs, then reboot (matching C# CPS workflow)
        await window.radioUSB.sendSTM32Command(6, 2);  // Save settings and VFOs
        await window.radioUSB.sendSTM32Command(6, 1);  // Reboot
        
        this.showRadioToolsProgress(false);
        Utils.toast('Voice prompts uploaded successfully. Radio will reboot.', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Voice prompts upload failed: ' + error.message, 'error');
      }
    });
  },

  /**
   * Bind radio tools events
   */
  /**
   * Bind DM32/UV008 (C7000) firmware flashing and SPI flash tools.
   */
  bindDM32Tools() {
    if (this._dm32ToolsBound) return;
    this._dm32ToolsBound = true;

    document.getElementById('dm32FirmwareFile')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      const nameEl = document.getElementById('dm32FirmwareName');
      const btn = document.getElementById('flashDM32FirmwareBtn');
      if (nameEl) nameEl.value = f ? f.name : '';
      if (btn) btn.disabled = !f;
    });

    document.getElementById('flashDM32FirmwareBtn')?.addEventListener('click', () => {
      this.flashDM32Firmware();
    });

    document.getElementById('dm32BackupBtn')?.addEventListener('click', () => {
      this.backupDM32Flash();
    });

    document.getElementById('dm32RestoreFile')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        this.restoreDM32Flash(f);
        e.target.value = '';
      }
    });
  },

  /**
   * Flash firmware to a DM-32 / UV008 via the Baofeng bootloader.
   */
  async flashDM32Firmware() {
    const fileInput = document.getElementById('dm32FirmwareFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      Utils.toast('Select a firmware file first', 'warning');
      return;
    }

    const force = !!document.getElementById('dm32ForceFlashCustom')?.checked;
    this.showModal('Flash DM-32 Firmware', `
      <p>This will overwrite the firmware on the radio.</p>
      <p><strong>Back up the SPI flash first</strong> (DM32/UV008 SPI Flash, below the firmware card).</p>
      <p>Put the radio in <strong>DFU / update mode</strong> before flashing: hold <strong>PTT and SK1</strong> together while turning the radio on (the green LED indicates update mode).</p>
    `, {
      confirmText: 'Flash',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        this.hideModal();
        const progressEl = document.getElementById('firmwareProgress');
        const progressBar = document.getElementById('firmwareProgressBar');
        const progressText = document.getElementById('firmwareProgressText');
        if (progressEl) progressEl.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = 'Flashing firmware...';
        const eta = Utils.createEtaTracker();
        window.App?.setActivity('busy', 'Flashing firmware...');
        try {
          const data = new Uint8Array(await file.arrayBuffer());
          // Merge an additional language if one is selected on the update screen.
          const fm = window.FirmwareManager;
          const libVersion = document.getElementById('dm32FirmwareVersion')?.value;
          const versionData = fm?.manifest?.radioTypes?.DM32?.versions?.[libVersion];
          const language = fm?.selectedDM32?.language || 'en';
          if (language && language !== 'en' && versionData?.hasLanguages) {
            const langInfo = fm.manifest.languages.find(l => l.code === language);
            if (langInfo?.file) {
              try {
                const langResponse = await fetch(`/dl/${versionData.languagesPath}/${langInfo.file}`);
                if (langResponse.ok) {
                  const languageData = new Uint8Array(await langResponse.arrayBuffer());
                  window.radioUSB.mergeLanguageFile(data, languageData);
                }
              } catch (mergeErr) {
                console.warn('Failed to merge language:', mergeErr);
                Utils.toast('Language merge failed: ' + mergeErr.message, 'warning');
              }
            }
          }
          // Optional custom boot-title patch (after any language merge).
          const bootTitle = document.getElementById('dm32BootTitle')?.value.trim();
          if (bootTitle) window.radioUSB.patchDM32BootTitle(data, bootTitle);
          await window.radioUSB.dm32FlashFirmware(data, (pct, msg) => {
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.textContent = (msg || `Flashing ${Math.round(pct)}%`) + eta.update(pct);
          }, { force });
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('idle');
          Utils.toast('Firmware flashed - the radio will reboot', 'success');
        } catch (error) {
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('error');
          Utils.toast('Firmware flash failed: ' + error.message, 'error');
        }
      }
    });
  },

  /**
   * Back up one of the DM-32 SPI flash chips.
   */
  async backupDM32Flash() {
    const chip = document.getElementById('dm32ChipSelect')?.value || 'progmem';
    const chipName = chip === 'q128' ? 'data flash (GD25Q128, 16 MB)' : 'program memory (GD25Q08, 1 MB)';

    this.showModal('Backup DM-32 SPI Flash', `
      <p>Read the <strong>${chipName}</strong> from the radio.</p>
      <p>Turn the radio <strong>off</strong>, then click <strong>Backup</strong>. When prompted, turn the radio <strong>on</strong> to enter its boot ROM.</p>
    `, {
      confirmText: 'Backup',
      onConfirm: async () => {
        this.hideModal();
        const progressEl = document.getElementById('firmwareProgress');
        const progressBar = document.getElementById('firmwareProgressBar');
        const progressText = document.getElementById('firmwareProgressText');
        if (progressEl) progressEl.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = 'Turn the radio OFF, then turn it ON...';
        try {
          const eta = Utils.createEtaTracker();
          window.App?.setActivity('busy', 'Backing up SPI flash...');
          const force = !!document.getElementById('dm32ForceFlashSpi')?.checked;
          const data = await window.radioUSB.dm32BackupFlash(chip, (pct, msg) => {
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.textContent = (msg || `Reading ${Math.round(pct)}%`) + eta.update(pct);
          }, { force });
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('idle');
          Utils.downloadFile(data, `DM32_${chip}_backup.bin`);
          Utils.toast('Backup downloaded', 'success');
        } catch (error) {
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('error');
          Utils.toast('Backup failed: ' + error.message, 'error');
        }
      }
    });
  },

  /**
   * Restore one of the DM-32 SPI flash chips.
   */
  async restoreDM32Flash(file) {
    const chip = document.getElementById('dm32ChipSelect')?.value || 'progmem';
    const chipName = chip === 'q128' ? 'data flash (GD25Q128, 16 MB)' : 'program memory (GD25Q08, 1 MB)';

    this.showModal('Restore DM-32 SPI Flash', `
      <p>Overwrite the <strong>${chipName}</strong> on the radio with <strong>${Utils.escapeHtml(file.name)}</strong>.</p>
      <p>Turn the radio <strong>off</strong>, then click <strong>Restore</strong>. When prompted, turn the radio <strong>on</strong> to enter its boot ROM.</p>
    `, {
      confirmText: 'Restore',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        this.hideModal();
        const progressEl = document.getElementById('firmwareProgress');
        const progressBar = document.getElementById('firmwareProgressBar');
        const progressText = document.getElementById('firmwareProgressText');
        if (progressEl) progressEl.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = 'Turn the radio OFF, then turn it ON...';
        try {
          const eta = Utils.createEtaTracker();
          window.App?.setActivity('busy', 'Restoring SPI flash...');
          const force = !!document.getElementById('dm32ForceFlashSpi')?.checked;
          const data = new Uint8Array(await file.arrayBuffer());
          await window.radioUSB.dm32RestoreFlash(chip, data, (pct, msg) => {
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.textContent = (msg || `Writing ${Math.round(pct)}%`) + eta.update(pct);
          }, { force });
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('idle');
          Utils.toast('SPI flash restored', 'success');
        } catch (error) {
          if (progressEl) progressEl.style.display = 'none';
          window.App?.setActivity('error');
          Utils.toast('Restore failed: ' + error.message, 'error');
        }
      }
    });
  },

  bindRadioTools() {
    if (this._radioToolsBound) return;
    this._radioToolsBound = true;
    this.bindDM32Tools();
    // Initialize voice prompts library dropdown
    this.initVoicePromptsLibrary();
    
    // Screen grab
    document.getElementById('downloadScreenGrabBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      // Screen grab is only supported on STM32/C7000 radios
      if (!window.radioUSB.isFlashBasedRadio()) {
        Utils.toast('Screen grab is only supported on STM32/C7000 radios (MD-9600, MD-UV380, DM-32, etc.)', 'warning');
        return;
      }
      
      this.showRadioToolsProgress(true, 'Grabbing screen...');
      
      try {
        // NOTE: For STM32 radios, we intentionally do NOT call initProtocol() here!
        // initProtocol() sends command 0 (CPS mode) which would overwrite the
        // current screen content with a "CPS" screen before we can capture it.
        // The original C# CPS also does not send command 0 for screengrab.
        //
        // The display buffer format depends on the panel:
        //   - Monochrome (MD-9600, MD-UV380): 128x64, 1 bit per pixel = 1024 bytes
        //   - Colour (DM-1701, RT-84): 160x128, 16-bit RGB565/BGR565 = 40960 bytes
        //     (the firmware stores colour values byte-swapped)
        // Use the cached radio info to pick the format. Do NOT call readRadioInfo()
        // here - it enters CPS mode and would overwrite the screen.
        const radioInfo = window.radioUSB.radioInfo || {};
        // Colour-panel STM32/C7000 radios. The firmware defines HAS_COLOURS for
        // PLATFORM_MD380/MDUV380/MD2017/DM1701/DM32 (HX8353E, 160x128) but still
        // reports the legacy radioType, so map them all here:
        //   6 = MD-UV380 / UV380Plus, 7 = MD-380, 9 = MD-2017,
        //   8 = DM-1701 (BGR565), 10 = DM-1701 RGB (RGB565),
        //   11 = DM-32, 12 = UV008 (C7000)
        // MD-9600 (5) is the only monochrome STM32 panel.
        const COLOUR_RADIO_TYPES = [6, 7, 8, 9, 10, 11, 12];
        const isColour = COLOUR_RADIO_TYPES.includes(radioInfo.radioType);

        const screenWidth = isColour ? 160 : 128;
        const screenHeight = isColour ? 128 : 64;
        const screenDataSize = isColour
          ? screenWidth * screenHeight * 2
          : (screenWidth * screenHeight) / 8;

        const screenData = await window.radioUSB.readFlashOrEEPROM(
          0, screenDataSize, CONFIG.PROTOCOL.DATA_MODE.READ_SCREEN_GRAB,
          (p) => this.updateRadioToolsProgress(p, `Reading screen: ${Math.round(p)}%`)
        );
        
        // NOTE: For STM32, we also do NOT send close commands since we never
        // entered CPS mode in the first place.
        // The original C# CPS also does not send sendCommand(5) for screengrab.
        
        // Render screen data to canvas and download as PNG
        const canvas = document.createElement('canvas');
        canvas.width = screenWidth;
        canvas.height = screenHeight;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(screenWidth, screenHeight);
        
        if (isColour) {
          // 16-bit RGB565 / BGR565, byte-swapped in the display buffer.
          // RGB panel (type 10) uses RGB565; non-RGB (type 8) uses BGR565.
          const isRgbPanel = radioInfo.radioType === 10;
          const pixelCount = screenWidth * screenHeight;
          for (let i = 0; i < pixelCount; i++) {
            const raw = screenData[i * 2] | (screenData[i * 2 + 1] << 8);
            const px = ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF);
            let r, g, b;
            if (isRgbPanel) {
              r = (px >> 11) & 0x1F;
              g = (px >> 5) & 0x3F;
              b = px & 0x1F;
            } else {
              b = (px >> 11) & 0x1F;
              g = (px >> 5) & 0x3F;
              r = px & 0x1F;
            }
            const idx = i * 4;
            imageData.data[idx] = (r << 3) | (r >> 2);       // R
            imageData.data[idx + 1] = (g << 2) | (g >> 4);   // G
            imageData.data[idx + 2] = (b << 3) | (b >> 2);   // B
            imageData.data[idx + 3] = 255;                    // A
          }
        } else {
          // Convert monochrome bitmap to RGBA
          // OpenGD77 screen format: each byte represents 8 vertical pixels in a stripe
          // Set pixels (1) = foreground (black), unset pixels (0) = background (white)
          // This matches the original C# CPS and the actual LCD appearance
          for (let stripe = 0; stripe < 8; stripe++) {
            for (let x = 0; x < screenWidth; x++) {
              const byteVal = screenData[stripe * screenWidth + x];
              for (let bit = 0; bit < 8; bit++) {
                const y = stripe * 8 + bit;
                const pixelIdx = (y * screenWidth + x) * 4;
                const isSet = (byteVal >> bit) & 1;
                // Set pixels = black (0), unset pixels = white (255)
                imageData.data[pixelIdx] = isSet ? 0 : 255;     // R
                imageData.data[pixelIdx + 1] = isSet ? 0 : 255; // G
                imageData.data[pixelIdx + 2] = isSet ? 0 : 255; // B
                imageData.data[pixelIdx + 3] = 255;              // A
              }
            }
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = Utils.timestampedFilename('screen_grab', 'png');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
        
        this.showRadioToolsProgress(false);
        Utils.toast('Screen grab downloaded', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Screen grab failed: ' + error.message, 'error');
      }
    });
    
    // Voice prompts upload
    document.getElementById('voicePromptsFile')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        e.target.value = '';
        return;
      }
      
      this.showRadioToolsProgress(true, 'Uploading voice prompts...');
      
      try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        
        await window.radioUSB.initProtocol();
        
        // Display status on radio (matching C# CPS WRITE_VOICE_PROMPTS workflow)
        await window.radioUSB.sendSTM32Command(1);                                     // Clear screen
        await window.radioUSB.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');        // Line 1
        await window.radioUSB.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');          // Line 2
        await window.radioUSB.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Voice prompts');    // Line 3
        await window.radioUSB.sendSTM32Command(3);                                     // Render screen
        await window.radioUSB.sendSTM32Command(6, 4);                                  // Flash red LED
        
        // Voice prompts are written to flash using the sector write cycle
        // (prepare sector → send data → write sector) at VOICE_PROMPTS_ADDRESS_IN_FLASH
        // Reference: C# CPS OpenGD77Form.cs WRITE_VOICE_PROMPTS uses WriteFlash()
        // STM32 radios need STM32_FLASH_ADDRESS_OFFSET added (decompiled CPS: 586752 + STM32_FLASH_ADDRESS_OFFSET)
        let VOICE_PROMPTS_ADDR = CONFIG.PROTOCOL.VOICE_PROMPTS_ADDRESS_IN_FLASH;
        if (window.radioUSB.isFlashBasedRadio()) {
          VOICE_PROMPTS_ADDR += CONFIG.PROTOCOL.STM32_FLASH_OFFSET;
        }
        
        await window.radioUSB.writeFlash(VOICE_PROMPTS_ADDR, fileData, (p) => {
          this.updateRadioToolsProgress(p, `Uploading: ${Math.round(p)}%`);
        });
        
        // Save settings and VFOs, then reboot (matching C# CPS workflow)
        await window.radioUSB.sendSTM32Command(6, 2);  // Save settings and VFOs
        await window.radioUSB.sendSTM32Command(6, 1);  // Reboot
        
        this.showRadioToolsProgress(false);
        Utils.toast('Voice prompts uploaded successfully. Radio will reboot.', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Voice prompts upload failed: ' + error.message, 'error');
      }
      
      e.target.value = '';
    });
    
    // Clear voice prompts
    document.getElementById('clearVoicePromptsBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      if (!confirm('Are you sure you want to clear all voice prompts from the radio?')) return;
      
      this.showRadioToolsProgress(true, 'Clearing voice prompts...');
      
      try {
        await window.radioUSB.initProtocol();
        
        // Display status on radio
        await window.radioUSB.sendSTM32Command(1);                                     // Clear screen
        await window.radioUSB.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');        // Line 1
        await window.radioUSB.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Clearing');         // Line 2
        await window.radioUSB.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Voice prompts');    // Line 3
        await window.radioUSB.sendSTM32Command(3);                                     // Render screen
        await window.radioUSB.sendSTM32Command(6, 4);                                  // Flash red LED
        
        // Clear voice prompts by writing a header of zeros at the flash address
        // Reference: C# CPS uses WriteFlash() with zero data at VOICE_PROMPTS_ADDRESS_IN_FLASH
        // STM32 radios need STM32_FLASH_ADDRESS_OFFSET added (decompiled CPS: 586752 + STM32_FLASH_ADDRESS_OFFSET)
        let VOICE_PROMPTS_ADDR = CONFIG.PROTOCOL.VOICE_PROMPTS_ADDRESS_IN_FLASH;
        if (window.radioUSB.isFlashBasedRadio()) {
          VOICE_PROMPTS_ADDR += CONFIG.PROTOCOL.STM32_FLASH_OFFSET;
        }
        const clearData = new Uint8Array(32);
        
        await window.radioUSB.writeFlash(VOICE_PROMPTS_ADDR, clearData);
        
        // Save settings and VFOs, then reboot (matching C# CPS workflow)
        await window.radioUSB.sendSTM32Command(6, 2);  // Save settings and VFOs
        await window.radioUSB.sendSTM32Command(6, 1);  // Reboot
        
        this.showRadioToolsProgress(false);
        Utils.toast('Voice prompts cleared. Radio will reboot.', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Clear voice prompts failed: ' + error.message, 'error');
      }
    });
    
    // Flash backup
    document.getElementById('backupFlashBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      this.showRadioToolsProgress(true, 'Backing up flash...');
      
      try {
        await window.radioUSB.initProtocol();
        
        let flashData;
        
        if (window.radioUSB.isFlashBasedRadio()) {
          // For STM32 radios, show status on radio screen
          await window.radioUSB.sendSTM32Command(1);
          await window.radioUSB.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
          await window.radioUSB.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Backing up');
          await window.radioUSB.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Flash');
          await window.radioUSB.sendSTM32Command(3);
          await window.radioUSB.sendSTM32Command(6, 3);
          
          // For STM32, read the full codeplug area starting from 0x80
          // This matches how the codeplug is read in readCodeplugSTM32
          const SEGMENT1_START = 0x80;
          const flashSize = CONFIG.PROTOCOL.CODEPLUG_END;
          flashData = await window.radioUSB.readFlashOrEEPROM(
            SEGMENT1_START, flashSize - SEGMENT1_START, CONFIG.PROTOCOL.DATA_MODE.READ_FLASH,
            (p) => this.updateRadioToolsProgress(p, `Reading flash: ${Math.round(p)}%`)
          );
          
          await window.radioUSB.sendCloseCommands();
        } else {
          // MK22 radios can read from address 0
          const flashSize = CONFIG.PROTOCOL.CODEPLUG_END;
          flashData = await window.radioUSB.readFlashOrEEPROM(
            0, flashSize, CONFIG.PROTOCOL.DATA_MODE.READ_FLASH,
            (p) => this.updateRadioToolsProgress(p, `Reading flash: ${Math.round(p)}%`)
          );
        }
        
        const filename = Utils.timestampedFilename('flash_backup', 'bin');
        Utils.downloadFile(flashData, filename);
        
        this.showRadioToolsProgress(false);
        Utils.toast('Flash backup downloaded', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Flash backup failed: ' + error.message, 'error');
      }
    });
    
    // Flash restore
    document.getElementById('restoreFlashFile')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        e.target.value = '';
        return;
      }
      
      if (!confirm('Are you sure you want to restore flash memory? This will overwrite the current radio data.')) {
        e.target.value = '';
        return;
      }
      
      this.showRadioToolsProgress(true, 'Restoring flash...');
      
      try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        
        await window.radioUSB.initProtocol();
        
        if (window.radioUSB.isFlashBasedRadio()) {
          await window.radioUSB.writeFlash(0, fileData, (p) => {
            this.updateRadioToolsProgress(p, `Writing flash: ${Math.round(p)}%`);
          });
          await window.radioUSB.sendCloseCommands();
        } else {
          await window.radioUSB.writeCodeplugData(0, fileData, (p) => {
            this.updateRadioToolsProgress(p, `Writing flash: ${Math.round(p)}%`);
          });
          await window.radioUSB.sendData(window.radioUSB.CMD_ENDW);
          await window.radioUSB.receiveData();
        }
        
        this.showRadioToolsProgress(false);
        Utils.toast('Flash restored successfully', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Flash restore failed: ' + error.message, 'error');
      }
      
      e.target.value = '';
    });
    
    // Registers backup
    document.getElementById('backupRegistersBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      this.showRadioToolsProgress(true, 'Reading secure registers...');
      
      try {
        // Use the dedicated readSecureRegisters method which handles
        // both MK22 and STM32 radio types with correct protocols
        const registerData = await window.radioUSB.readSecureRegisters(
          (p) => this.updateRadioToolsProgress(p, `Reading registers: ${Math.round(p)}%`)
        );
        
        const filename = Utils.timestampedFilename('registers_backup', 'bin');
        Utils.downloadFile(registerData, filename);
        
        this.showRadioToolsProgress(false);
        Utils.toast('Registers backup downloaded', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Registers backup failed: ' + error.message, 'error');
      }
    });
    
    // Calibration backup
    document.getElementById('backupCalibrationBtn')?.addEventListener('click', async () => {
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        return;
      }
      
      this.showRadioToolsProgress(true, 'Reading calibration data...');
      
      try {
        // Use the dedicated readCalibration method which handles
        // both MK22 and STM32 radio types with correct addresses and protocols
        const calibData = await window.radioUSB.readCalibration(
          (p) => this.updateRadioToolsProgress(p, `Reading calibration: ${Math.round(p)}%`)
        );
        
        const filename = Utils.timestampedFilename('calibration_backup', 'bin');
        Utils.downloadFile(calibData, filename);
        
        this.showRadioToolsProgress(false);
        Utils.toast('Calibration backup downloaded', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Calibration backup failed: ' + error.message, 'error');
      }
    });
    
    // Calibration restore
    document.getElementById('restoreCalibrationFile')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!window.radioUSB.connected) {
        Utils.toast('Connect to radio first', 'warning');
        e.target.value = '';
        return;
      }
      
      if (!confirm('Are you sure you want to restore calibration data? Incorrect calibration can affect radio performance.')) {
        e.target.value = '';
        return;
      }
      
      this.showRadioToolsProgress(true, 'Restoring calibration data...');
      
      try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        
        await window.radioUSB.initProtocol();
        
        const calibrationStart = CONFIG.PROTOCOL.CALIBRATION_START;
        
        if (window.radioUSB.isFlashBasedRadio()) {
          await window.radioUSB.writeFlash(calibrationStart, fileData, (p) => {
            this.updateRadioToolsProgress(p, `Writing calibration: ${Math.round(p)}%`);
          });
          await window.radioUSB.sendCloseCommands();
        } else {
          await window.radioUSB.writeCodeplugData(calibrationStart, fileData, (p) => {
            this.updateRadioToolsProgress(p, `Writing calibration: ${Math.round(p)}%`);
          });
          await window.radioUSB.sendData(window.radioUSB.CMD_ENDW);
          await window.radioUSB.receiveData();
        }
        
        this.showRadioToolsProgress(false);
        Utils.toast('Calibration restored successfully', 'success');
      } catch (error) {
        this.showRadioToolsProgress(false);
        Utils.toast('Calibration restore failed: ' + error.message, 'error');
      }
      
      e.target.value = '';
    });
  },
  
  /** Region presets for the DMR ID loader (country codes understood by the API). */
  _dmrRegions: {
    'europe': ['UK','DE','FR','NL','IT','ES','PL','BE','AT','CH','CZ','SE','DK','NO','FI','PT','IE','GR','HU','RO','SK','BG','HR','SI','LT','LV','EE','LU','IS','UA','RU','TR'],
    'north-america': ['US','CA','MX'],
    'south-america': ['BR','AR','CL','CO','PE','VE','UY'],
    'asia-pacific': ['AU','NZ','JP','KR','CN','TW','HK','SG','MY','TH','PH','ID','IN'],
    'middle-east-africa': ['ZA','IL','AE','SA','EG']
  },

  /**
   * Apply a region to the loaded (CSV) entries. OSS has no server-side country
   * filter, so regions filter the imported entries by country name instead.
   */
  onDMRRegionChange() {
    const region = document.getElementById('dmrRegionFilter')?.value || '';
    const countryGroup = document.getElementById('dmrCountryGroup');
    const hint = document.getElementById('dmrLoadHint');

    if (region === 'custom') {
      this._dmrRegion = 'custom';
      if (countryGroup) countryGroup.style.display = '';
      this.applyDMRRegionFilter();
      if (hint) hint.textContent = 'Showing IDs for the selected countries.';
      return;
    }

    this._dmrRegion = region;
    if (countryGroup) countryGroup.style.display = 'none';
    const set = this._dmrRegionCountrySet(region);
    if (hint) {
      hint.textContent = region
        ? `${region.replace(/-/g, ' ')} — showing IDs for ${set ? set.size : 0} country names.`
        : 'Worldwide — all loaded IDs.';
    }
    this.applyDMRRegionFilter();
  },

  /** Lower-cased country-name set for a region (Intl.DisplayNames + aliases). */
  _dmrRegionCountrySet(region) {
    let codes = null;
    if (region === 'custom') {
      const sel = document.getElementById('dmrDbCountryFilter');
      codes = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
    } else if (region) {
      codes = this._dmrRegions[region];
    }
    if (!codes || codes.length === 0) return null;
    if (region !== 'custom') {
      if (!this._dmrRegionNameCache) this._dmrRegionNameCache = {};
      if (this._dmrRegionNameCache[region]) return this._dmrRegionNameCache[region];
    }
    const set = new Set();
    let dn = null;
    try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { dn = null; }
    for (const code of codes) {
      const iso = code === 'UK' ? 'GB' : code;
      if (dn) { const n = dn.of(iso); if (n) set.add(String(n).toLowerCase()); }
    }
    const aliases = {
      UK: ['united kingdom', 'great britain', 'uk'],
      US: ['united states', 'usa', 'united states of america'],
      RU: ['russia', 'russian federation'],
      KR: ['south korea', 'korea, republic of', 'republic of korea'],
      CZ: ['czech republic', 'czechia'],
      AE: ['united arab emirates', 'uae']
    };
    for (const [code, names] of Object.entries(aliases)) {
      if (codes.includes(code)) for (const n of names) set.add(n);
    }
    if (region !== 'custom') this._dmrRegionNameCache[region] = set;
    return set;
  },

  /** Re-apply the region filter to the loaded entries (display + write). */
  applyDMRRegionFilter() {
    const all = this._dmrAllEntries || [];
    const set = this._dmrRegionCountrySet(this._dmrRegion || '');
    const filtered = set ? all.filter(e => set.has(String(e.country || '').trim().toLowerCase())) : all;
    this._dmrDatabase = filtered;
    const countEl = document.getElementById('dmrDbCount');
    if (countEl) countEl.textContent = filtered.length.toLocaleString();
    this.renderDMRTable(filtered.slice(0, 100), filtered.length);
    this.updateDMRStorageInfo();
  },

  /**
   * Largest text length (6-50 chars) whose record size still lets the selected
   * radio hold every loaded ID. Falls back to 6 when even that will not fit.
   */
  computeAutoRecordLength() {
    const entryCount = (this._dmrDatabase || []).length;
    const useVPMemory = document.getElementById('dmrUseVPMemory')?.checked || false;
    const radioTypeIndex = parseInt(document.getElementById('dmrRadioType')?.value) || 0;
    const current = parseInt(document.getElementById('dmrDataRecordLength')?.value) || 16;
    if (!entryCount) return current;

    const vpEnabled = useVPMemory && radioTypeIndex !== 3 && radioTypeIndex !== 6;
    const isDM32 = this.isDM32Radio() || this.isC7000DMRIndex(radioTypeIndex);
    // Index 6 (C7000) has no DMRID_MEMORY_SIZES entry; it is window-bounded.
    const memorySize = isDM32 ? 0 : this.getSelectedRadioMemorySize(radioTypeIndex, vpEnabled);

    for (let len = 50; len >= 6; len--) {
      const recordSize = this.compressSize(len) + 3;
      const connectedMax = this.getConnectedDMRMaxRecords(recordSize, vpEnabled);
      const max = connectedMax !== null
        ? connectedMax
        : (isDM32 ? this.getDM32MaxRecords(recordSize, vpEnabled)
                  : this.getMaxRecords(memorySize, recordSize));
      if (max >= entryCount) return len;
    }
    return 6;
  },

  /**
   * Update DMR database storage info based on selected options
   * Matches the original OpenGD77 CPS DMRIDForm.cs calculations
   */
  updateDMRStorageInfo() {
    const lengthSelect = document.getElementById('dmrDataRecordLength');
    const radioTypeSelect = document.getElementById('dmrRadioType');
    const useVPMemoryCheckbox = document.getElementById('dmrUseVPMemory');
    const autoCheckbox = document.getElementById('dmrAutoLength');
    const maxContactsEl = document.getElementById('dmrMaxContacts');
    const recordSizeEl = document.getElementById('dmrRecordSize');
    const vpMemoryGroup = document.getElementById('dmrVPMemoryGroup');
    const fitEl = document.getElementById('dmrFitStatus');
    const countEl = document.getElementById('dmrDbCount');

    if (!lengthSelect || !maxContactsEl || !recordSizeEl) return;

    const radioTypeIndex = parseInt(radioTypeSelect?.value) || 0;

    // Voice-prompt memory applies to MK22 radios only (not STM32 index 3,
    // not C7000 / DM-32 index 6).
    const vpApplicable = radioTypeIndex !== 3 && radioTypeIndex !== 6;
    if (vpMemoryGroup) vpMemoryGroup.style.display = vpApplicable ? '' : 'none';
    if (!vpApplicable && useVPMemoryCheckbox) useVPMemoryCheckbox.checked = false;
    const useVPMemory = vpApplicable && (useVPMemoryCheckbox?.checked || false);

    // Auto-fit: choose the longest text length that still fits every loaded ID.
    const auto = autoCheckbox ? autoCheckbox.checked : false;
    lengthSelect.disabled = auto;
    if (auto) {
      lengthSelect.value = String(this.computeAutoRecordLength());
    }
    const stringLength = parseInt(lengthSelect.value) || 16;

    // Calculate compressed size using same formula as DMRDataItem.cs compressSize()
    // 6-bit compression: groups of 4 chars -> 3 bytes, remainder chars take 1 byte each
    const compressedSize = this.compressSize(stringLength);

    // DMR ID is always 3 bytes (24-bit ID)
    const ID_NUMBER_SIZE = 3;
    const recordSize = compressedSize + ID_NUMBER_SIZE;

    // Get memory size for selected radio type (from DMRIDForm.cs getSelectedRadioMemorySize).
    // The C7000 / DM-32 (index 6) has no entry in DMRID_MEMORY_SIZES - it is
    // bounded by the firmware's address window instead (getDM32MaxRecords), so
    // skip the table lookup (which would otherwise warn and clamp to index 5).
    const isC7000 = this.isDM32Radio() || this.isC7000DMRIndex(radioTypeIndex);
    const memorySize = isC7000 ? 0 : this.getSelectedRadioMemorySize(radioTypeIndex, useVPMemory);

    // Prefer the connected radio's real capacity (from its flash chip ID); fall
    // back to the selected type when no radio is connected. The DM-32 / UV008
    // additionally uses a smaller real address window.
    const connectedMax = this.getConnectedDMRMaxRecords(recordSize, useVPMemory);
    const maxRecords = connectedMax !== null
      ? connectedMax
      : (isC7000
          ? this.getDM32MaxRecords(recordSize, useVPMemory)
          : this.getMaxRecords(memorySize, recordSize));

    maxContactsEl.textContent = maxRecords.toLocaleString();
    recordSizeEl.textContent = recordSize;

    // Fit indicator: loaded count vs what the radio can hold at this length.
    const loaded = (this._dmrDatabase || []).length;
    if (countEl) countEl.textContent = loaded.toLocaleString();
    if (fitEl) {
      if (!loaded) {
        fitEl.className = 'dmr-fit-status';
        fitEl.textContent = 'Load a database to check whether it fits.';
      } else if (maxRecords >= loaded) {
        fitEl.className = 'dmr-fit-status ok';
        fitEl.textContent = `✓ All ${loaded.toLocaleString()} loaded IDs fit${auto ? ` (auto-fit: ${stringLength} chars)` : ''}.`;
      } else {
        fitEl.className = 'dmr-fit-status warn';
        fitEl.textContent = `⚠ ${loaded.toLocaleString()} IDs loaded, but this radio holds ${maxRecords.toLocaleString()} at ${stringLength} chars. Only the first ${maxRecords.toLocaleString()} (by ID) would be written — load a region or shorten the text.`;
      }
    }

    // Update record preview with random samples from loaded database
    this.updateDMRRecordPreview(stringLength);
    
    // Store the current settings for use when writing
    this._dmrStringLength = stringLength;
    this._dmrRadioTypeIndex = radioTypeIndex;
    this._dmrUseVPMemory = useVPMemory;

  },
  
  /**
   * Update DMR record preview with random sample records
   * Shows what the saved string will look like based on the current data record length
   * @param {number} stringLength - The data record length in characters
   */
  updateDMRRecordPreview(stringLength) {
    const previewContainer = document.getElementById('dmrRecordPreview');
    const previewContent = document.getElementById('dmrRecordPreviewContent');
    if (!previewContainer || !previewContent) return;
    
    const db = UI._dmrDatabase;
    if (!db || db.length === 0) {
      previewContainer.style.display = 'none';
      return;
    }
    
    // Pick a few random records (up to 3) using shuffle-and-take
    const sampleCount = Math.min(3, db.length);
    const indices = Array.from({ length: db.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0 && indices.length - i <= sampleCount; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const samples = indices.slice(-sampleCount).map(i => db[i]);
    
    // Build preview strings using same logic as writeDMRDatabaseToRadio
    const lines = samples.map(entry => {
      const callsign = (entry.callsign || '').toUpperCase().trim();
      const name = (entry.name || '').trim();
      const city = (entry.city || '').trim();
      const country = (entry.country || '').trim();
      
      let details = callsign;
      
      if (name && details.length < stringLength) {
        const remaining = stringLength - details.length - 1;
        if (remaining > 0) {
          details += ' ' + name.substring(0, remaining);
        }
      }
      
      if (city && details.length < stringLength) {
        const remaining = stringLength - details.length - 1;
        if (remaining > 0) {
          details += ' ' + city.substring(0, remaining);
        }
      }
      
      if (country && details.length < stringLength) {
        const remaining = stringLength - details.length - 1;
        if (remaining > 0) {
          details += ' ' + country.substring(0, remaining);
        }
      }
      
      details = details.padEnd(stringLength, ' ').substring(0, stringLength);
      
      const idStr = String(entry.id).padEnd(9);
      return `ID:${idStr} → "${details}" (${details.length} chars)`;
    });
    
    previewContent.textContent = lines.join('\n');
    previewContainer.style.display = 'block';
  },
  
  /**
   * Calculate compressed size for 6-bit compression
   * From DMRDataItem.cs: compressSize(int fromSize) => fromSize / 4 * 3 + fromSize % 4
   * 6-bit compression: groups of 4 chars (24 bits) compress to 3 bytes,
   * remainder chars take 1 byte each (e.g., 5 chars -> 4 bytes, 6 chars -> 5 bytes)
   * @param {number} fromSize - Original string length
   * @returns {number} Compressed size in bytes
   */
  compressSize(fromSize) {
    return Math.floor(fromSize / 4) * 3 + (fromSize % 4);
  },
  
  /**
   * Get memory size for selected radio type
   * From DMRIDForm.cs getSelectedRadioMemorySize()
   * @param {number} radioTypeIndex - Radio type index (0-5)
   * @param {boolean} useVPMemory - Whether to include Voice Prompt memory
   * @returns {number} Memory size in bytes
   */
  getSelectedRadioMemorySize(radioTypeIndex, useVPMemory) {
    // Memory sizes from DMRIDForm.cs: [557056, 1605632, 557056, 0, 7897088, 14188544]
    // Index 3 (STM32) uses: 14188544 - FLASH_MEMORY_EEPROM_EMU_SIZE
    const memorySizes = CONFIG.PROTOCOL.DMRID_MEMORY_SIZES;
    const vpMemorySize = CONFIG.PROTOCOL.DMRID_VP_MEMORY_SIZE;
    
    // Clamp index to valid range - this silently handles invalid indices
    const safeIndex = Math.max(0, Math.min(radioTypeIndex, memorySizes.length - 1));
    if (safeIndex !== radioTypeIndex) {
      console.warn(`Invalid radio type index ${radioTypeIndex}, using ${safeIndex}`);
    }
    
    let memorySize = memorySizes[safeIndex];
    
    // Add voice prompt memory if enabled (only for MK22 radios)
    if (useVPMemory && radioTypeIndex !== 3) {
      memorySize += vpMemorySize;
    }
    
    return memorySize;
  },
  
  /**
   * Calculate maximum records that can be stored
   * From DMRIDForm.cs getMaxRecords()
   * Formula: (262132 / recordLength) + (memorysize - 262144) / recordLength
   * @param {number} memorySize - Total memory size in bytes
   * @param {number} recordLength - Size of each record in bytes
   * @returns {number} Maximum number of records
   */
  getMaxRecords(memorySize, recordLength) {
    const BASE_SIZE = CONFIG.PROTOCOL.DMRID_BASE_SIZE;  // 262132
    const BASE_REGION = 262144;  // First region size used in calculation
    
    // First region: 262132 / recordLength
    const firstRegionRecords = Math.floor(BASE_SIZE / recordLength);
    
    // Additional regions: (memorysize - 262144) / recordLength
    const additionalRecords = Math.floor((memorySize - BASE_REGION) / recordLength);
    
    return firstRegionRecords + Math.max(0, additionalRecords);
  },

  /**
   * True when the connected radio uses the C7000 (DM-32 / UV008) platform. Its
   * usable DMR ID flash region is smaller than the generic STM32 size, so the
   * database must be clamped to fit below DMRID_DM32_REGION_END.
   */
  isDM32Radio() {
    return window.radioUSB?.radioType === CONFIG.RADIO_TYPES.DM32;
  },

  /**
   * True when the currently selected/connected radio is the DM-32 / UV008
   * (C7000), the only platform whose firmware understands the extra analogue
   * codeplug modes "AM" and "FM Broadcast" (chMode 2/3). Falls back to the
   * saved/selected type so the channel editor behaves sensibly when offline.
   */
  supportsDm32AnalogModes() {
    const type = window.radioUSB?.getRadioType?.() ||
      window.radioUSB?.radioType ||
      Utils.getSavedRadioType?.() ||
      CONFIG.RADIO_TYPES.MK22;
    return type === CONFIG.RADIO_TYPES.DM32;
  },

  /**
   * Abbreviation used to show a channel's mode in tables/exports.
   */
  channelModeAbbrev(ch) {
    switch (ch && ch.type) {
      case CONFIG.CHANNEL_TYPES.DIGITAL: return 'DMR';
      case CONFIG.CHANNEL_TYPES.AM: return 'AM';
      case CONFIG.CHANNEL_TYPES.FM_BROADCAST: return 'FM BC';
      default: return 'FM';
    }
  },

  /**
   * True for the DM-32 / UV008 (C7000) entry in the DMR radio-type dropdown.
   */
  isC7000DMRIndex(radioTypeIndex) {
    return radioTypeIndex === 6;
  },

  /**
   * Maximum DMR ID database size (bytes) that fits on a DM-32 / UV008 before the
   * firmware NAKs a sector prepare at DMRID_DM32_REGION_END. Mirrors the split
   * used by webusb.writeDMRDatabase(): a first region at
   * DMRID_START + STM32_FLASH_OFFSET and the remainder at the VP/non-VP address.
   */
  getDM32DMRMaxBytes(recordSize, useVPMemory) {
    const P = CONFIG.PROTOCOL;
    const firstLen = P.DMRID_HEADER_SIZE + recordSize * Math.floor(P.DMRID_BASE_SIZE / recordSize);
    const secondBase = (useVPMemory ? P.DMRID_VP_ADDRESS : P.DMRID_NO_VP_ADDRESS) + P.STM32_FLASH_OFFSET;
    const secondMax = Math.max(0, P.DMRID_DM32_REGION_END - secondBase);
    return firstLen + secondMax;
  },

  /**
   * Correct maximum record count for a DM-32 / UV008, derived from the real
   * address budget for the given record length rather than the generic STM32
   * memory size (which is too large for this platform).
   */
  getDM32MaxRecords(recordSize, useVPMemory) {
    const maxBytes = this.getDM32DMRMaxBytes(recordSize, useVPMemory);
    return Math.max(0, Math.floor((maxBytes - CONFIG.PROTOCOL.DMRID_HEADER_SIZE) / recordSize));
  },

  /**
   * DMR ID memory size (bytes) derived from a flash chip ID, mirroring the CPS
   * DMRIDForm.getRadioInfoMemorySize() switch.
   *   0x4015 (25Q16, 2 MB)            -> 1605632
   *   0x4017 (25Q64, 8 MB)            -> 7897088
   *   0x4018 / 0x7018 (25Q128, 16 MB) -> 14188544 (- EEPROM emulation on STM32/C7000)
   *   default (25Q80, 1 MB)           -> 557056
   */
  getRadioMemorySizeFromFlashId(flashId, isFlashPlatform) {
    switch (flashId) {
      case 16405: return 1605632;
      case 16407: return 7897088;
      case 16408:
      case 28696:
        return 14188544 - (isFlashPlatform ? CONFIG.PROTOCOL.FLASH_MEMORY_EEPROM_EMU_SIZE : 0);
      default:
        // MK22 radios ship with a 25Q80 (1 MB), so an unrecognised ID there is
        // still likely a 1 MB part. STM32 / C7000 radios always carry a much
        // larger flash, so an unrecognised ID means the read was flaky or the
        // chip is unlisted - returning the 1 MB size there made the CPS clamp
        // the DM-1701 / MD-UV380 to a tiny capacity. Report "unknown" so the
        // caller falls back to the selected radio type's real memory size.
        return isFlashPlatform ? null : 557056;
    }
  },

  /**
   * Maximum DMR ID records the *connected* radio can actually hold for the given
   * record length, or null when no radio (or no flash ID) is available. The
   * DM-32 / UV008 additionally uses a smaller real address window.
   */
  getConnectedDMRMaxRecords(recordSize, useVPMemory) {
    const radio = window.radioUSB;
    const info = radio?.radioInfo;
    if (!radio?.connected || !info || !info.flashId) return null;

    const isFlashPlatform = radio.radioType === CONFIG.RADIO_TYPES.STM32 ||
                            radio.radioType === CONFIG.RADIO_TYPES.DM32;
    let memorySize = this.getRadioMemorySizeFromFlashId(info.flashId, isFlashPlatform);
    // Unknown flash ID on a flash-based radio: don't trust a bogus small size,
    // fall back to the selected radio type instead.
    if (memorySize === null) return null;

    // Voice-prompt memory is usable for MK22 radios only (CPS: index !== 3).
    if (useVPMemory && !isFlashPlatform) {
      memorySize += CONFIG.PROTOCOL.DMRID_VP_MEMORY_SIZE;
    }

    // The DM-32 / UV008 (C7000) stores the DMR database in the q128 data flash
    // and the binding limit is the firmware's address window (DMRID_DM32_REGION_END),
    // not the raw flash size, so use the region budget directly.
    if (radio.radioType === CONFIG.RADIO_TYPES.DM32) {
      return this.getDM32MaxRecords(recordSize, useVPMemory);
    }

    const byFlash = this.getMaxRecords(memorySize, recordSize);
    return byFlash;
  },
  
  /**
   * Get the currently selected DMR data record length
   * @returns {number} Data record length (default 16)
   */
  getDMRCallsignLength() {
    return this._dmrStringLength || 16;
  },
  
  /**
   * Get the current DMR storage settings
   * @returns {Object} Storage settings object
   */
  getDMRStorageSettings() {
    return {
      stringLength: this._dmrStringLength || 16,
      radioTypeIndex: this._dmrRadioTypeIndex || 0,
      useVPMemory: this._dmrUseVPMemory || false,
      compressedSize: this.compressSize(this._dmrStringLength || 16),
      recordSize: this.compressSize(this._dmrStringLength || 16) + 3  // +3 for DMR ID
    };
  },

  /**
   * Map firmware radio type to DMR database radio type index
   * 
   * Firmware radio types (from radioInfo.radioType):
   *   0: 'GD-77', 1: 'GD-77S', 2: 'DM-1801', 3: 'RD-5R', 4: 'DM-1801A',
   *   5: 'MD-9600', 6: 'MD-UV380', 7: 'MD-380', 8: 'DM-1701', 9: 'MD-2017', 10: 'DM-1701 RGB'
   * 
   * DMR database radio type indices:
   *   0: GD-77 / GD-77S / MD-760
   *   1: DM-1801
   *   2: RD-5R
   *   3: MD-9600 / MD-UV3x0 / DM-1701 (STM32 radios)
   *   4: Custom 8Mb
   *   5: Custom 16Mb
   * 
   * @param {number} firmwareRadioType - Radio type from firmware (0-10)
   * @returns {number} DMR database radio type index (0-5), or null if unknown
   */
  mapFirmwareRadioTypeToDMRIndex(firmwareRadioType) {
    const mapping = {
      0: 0,   // GD-77 → index 0 (GD-77 / GD-77S / MD-760)
      1: 0,   // GD-77S → index 0 (GD-77 / GD-77S / MD-760)
      2: 1,   // DM-1801 → index 1 (DM-1801)
      3: 2,   // RD-5R → index 2 (RD-5R)
      4: 1,   // DM-1801A → index 1 (same memory as DM-1801)
      5: 3,   // MD-9600 → index 3 (STM32 radios)
      6: 3,   // MD-UV380 → index 3 (STM32 radios)
      7: 3,   // MD-380 → index 3 (STM32 radios)
      8: 3,   // DM-1701 → index 3 (STM32 radios)
      9: 3,   // MD-2017 → index 3 (STM32 radios)
      10: 3,  // DM-1701 RGB → index 3 (STM32 radios)
      11: 6,  // DM-32 → index 6 (C7000)
      12: 6   // UV008 → index 6 (C7000)
    };
    return mapping.hasOwnProperty(firmwareRadioType) ? mapping[firmwareRadioType] : null;
  },

  /**
   * Auto-detect and update the DMR Radio Type selector based on connected radio
   * Keeps manual options available but pre-selects based on detected hardware
   * 
   * @returns {boolean} True if auto-detection was successful, false otherwise
   */
  autoDetectDMRRadioType() {
    const radioTypeSelect = document.getElementById('dmrRadioType');
    if (!radioTypeSelect) {
      return false;
    }

    // Check if we have radio info from a connected radio
    const radioInfo = window.radioUSB?.radioInfo;
    let dmrIndex = null;
    if (radioInfo && typeof radioInfo.radioType === 'number') {
      // Map firmware radio type to DMR database index
      dmrIndex = this.mapFirmwareRadioTypeToDMRIndex(radioInfo.radioType);
      if (dmrIndex === null) {
        console.warn(`Unknown firmware radio type: ${radioInfo.radioType}`);
      }
    } else {
      // No firmware info (e.g. straight after a silent reconnect). Fall back to
      // the detected platform so the capacity selector is not left on a stale
      // default. MK22 cannot be narrowed without firmware info, so leave it.
      const platform = window.radioUSB?.radioType;
      if (platform === CONFIG.RADIO_TYPES.STM32) dmrIndex = 3;
      else if (platform === CONFIG.RADIO_TYPES.DM32) dmrIndex = 6;
    }
    if (dmrIndex === null) {
      console.log('No radio info available for auto-detection');
      return false;
    }

    // Update the dropdown if the value is different
    if (parseInt(radioTypeSelect.value) !== dmrIndex) {
      radioTypeSelect.value = dmrIndex;
      console.log(`Auto-detected DMR Radio Type: ${(radioInfo && radioInfo.radioTypeName) || radioTypeSelect.value} → index ${dmrIndex}`);

      // Show toast notification
      if (radioInfo && radioInfo.radioTypeName) {
        Utils.toast(`DMR Radio Type auto-detected: ${radioInfo.radioTypeName}`, 'info');
      }
    }

    // Always refresh so the displayed max contacts reflects the connected
    // radio's real flash capacity.
    this.updateDMRStorageInfo();

    return true;
  },

  /**
   * Update the main radio type selector (MK22/STM32) to reflect the auto-detected platform type
   * Called after readRadioInfo() auto-detects the platform from firmware
   * 
   * @returns {boolean} True if selector was updated, false otherwise
   */
  updateRadioTypeSelectorFromDetected() {
    const radioType = window.radioUSB?.radioType;
    if (!radioType) {
      return false;
    }

    // Update both desktop and mobile selectors
    const selectors = ['radioTypeSelect', 'mobileRadioTypeSelect'];
    let updated = false;

    for (const selectId of selectors) {
      const select = document.getElementById(selectId);
      if (select && select.value !== radioType) {
        select.value = radioType;
        updated = true;
      }
    }

    if (updated) {
      console.log(`Radio type selector updated to auto-detected platform: ${radioType}`);
    }

    // Always update UI to reflect the detected radio type
    // This ensures features like screen grab are shown even if selector already matched
    this.updateUIForRadioType();

    return updated;
  },

  // ============================================================================
  // RadioReference Import
  // ============================================================================

  _rrCredentials: null, // { username, password } - in memory only, never stored

  /**
   * Login to RadioReference
   */
  async rrLogin() {
    const username = document.getElementById('rrUsername')?.value?.trim();
    const password = document.getElementById('rrPassword')?.value?.trim();
    const errorEl = document.getElementById('rrLoginError');
    const btn = document.getElementById('rrLoginBtn');

    if (!username || !password) {
      errorEl.textContent = 'Please enter both username and password';
      errorEl.style.display = '';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Logging in...';
    errorEl.style.display = 'none';

    try {
      const result = await API.rrLogin(username, password);
      if (result.success) {
        this._rrCredentials = { username, password };
        // Cache reference data (modes, TRS types/flavors/voices)
        if (result.referenceData) {
          this._rrModeMap = {};
          (result.referenceData.modes || []).forEach(m => {
            const id = parseInt(m.mode);
            if (!isNaN(id) && m.modeName) this._rrModeMap[id] = m.modeName;
          });
          this._rrTrsTypes = {};
          (result.referenceData.trsTypes || []).forEach(t => {
            this._rrTrsTypes[parseInt(t.sType)] = t.sTypeDescr || '';
          });
          this._rrTrsFlavors = {};
          (result.referenceData.trsFlavors || []).forEach(f => {
            this._rrTrsFlavors[`${f.sType}_${f.sFlavor}`] = f.sFlavorDescr || '';
          });
          this._rrTrsVoices = {};
          (result.referenceData.trsVoices || []).forEach(v => {
            this._rrTrsVoices[`${v.sType}_${v.sVoice}`] = v.sVoiceDescr || '';
          });
        }
        document.getElementById('rrLoginSection').style.display = 'none';
        document.getElementById('rrSearchSection').style.display = '';
        const displayName = typeof result.user.username === 'string' ? result.user.username : username;
        const expireDate = result.user.subExpireDate && typeof result.user.subExpireDate === 'string'
          ? result.user.subExpireDate : 'N/A';
        document.getElementById('rrUserInfo').textContent =
          `Logged in as ${displayName} (expires: ${expireDate})`;
        // Clear password from form
        document.getElementById('rrPassword').value = '';
        this.rrLoadCountries();
      }
    } catch (error) {
      errorEl.textContent = error.message || 'Login failed';
      errorEl.style.display = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-login"></i> Login';
    }
  },

  /**
   * Logout from RadioReference
   */
  rrLogout() {
    this._rrCredentials = null;
    this._rrModeMap = null;
    this._rrTrsTypes = null;
    this._rrTrsFlavors = null;
    this._rrTrsVoices = null;
    this._rrMapMarkers = [];
    this._rrCountyLocation = null;
    if (this._rrMapLayerGroup) this._rrMapLayerGroup.clearLayers();
    document.getElementById('rrLoginSection').style.display = '';
    document.getElementById('rrSearchSection').style.display = 'none';
    document.getElementById('rrResultsSection').style.display = 'none';
    document.getElementById('rrUsername').value = '';
    document.getElementById('rrPassword').value = '';
  },

  /**
   * Switch between search tool tabs
   */
  rrSwitchSearchTool(tool) {
    const tools = ['freq', 'zipcode', 'metro', 'fcc', 'fccprox', 'sysid'];
    const ids = {
      freq: 'rrSearchFreq', zipcode: 'rrSearchZipcode', metro: 'rrSearchMetro',
      fcc: 'rrSearchFcc', fccprox: 'rrSearchFccProx', sysid: 'rrSearchSysid'
    };
    tools.forEach(t => {
      const el = document.getElementById(ids[t]);
      if (el) el.style.display = t === tool ? '' : 'none';
    });
    document.querySelectorAll('.rrSearchToolBtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rrsearchtool === tool);
    });
    document.getElementById('rrSearchResults').innerHTML = '';
  },

  /**
   * Frequency search across selected state or county
   */
  async rrDoFreqSearch() {
    if (!this._rrCredentials) return;
    const freq = document.getElementById('rrSearchFreqInput')?.value?.trim();
    const tone = document.getElementById('rrSearchToneInput')?.value?.trim();
    const container = document.getElementById('rrSearchResults');
    const btn = document.getElementById('rrFreqSearchBtn');

    if (!freq) {
      Utils.toast('Please enter a frequency to search', 'warning');
      return;
    }

    const stid = document.getElementById('rrStateSelect')?.value;
    const ctid = document.getElementById('rrCountySelect')?.value;

    if (!stid && !ctid) {
      Utils.toast('Please select a state or county first to search frequencies', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Searching...';
    container.innerHTML = '<div class="table-empty" style="padding: 1rem;"><i class="mdi mdi-loading mdi-spin"></i><p>Searching...</p></div>';

    try {
      const { username, password } = this._rrCredentials;
      let result;
      if (ctid) {
        result = await API.rrSearchCountyFreq(username, password, ctid, parseFloat(freq), tone || '');
      } else {
        result = await API.rrSearchStateFreq(username, password, stid, parseFloat(freq), tone || '');
      }

      const freqs = result.frequencies || [];
      if (freqs.length === 0) {
        container.innerHTML = '<div class="table-empty" style="padding: 1rem;"><i class="mdi mdi-radio-tower"></i><p>No matching frequencies found</p></div>';
      } else {
        this._rrFrequencies = freqs;
        this.rrRenderFrequencies(freqs, 'rrSearchResults');
      }
    } catch (error) {
      container.innerHTML = `<div class="table-empty" style="padding: 1rem;"><i class="mdi mdi-alert"></i><p>${Utils.escapeHtml(error.message)}</p></div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Search';
    }
  },

  /**
   * Zipcode lookup to find state/county
   */
  async rrDoZipcodeLookup() {
    if (!this._rrCredentials) return;
    const zipcode = document.getElementById('rrZipcodeInput')?.value?.trim();
    const container = document.getElementById('rrZipcodeResult');
    const btn = document.getElementById('rrZipcodeBtn');

    if (!zipcode || zipcode.length < 3) {
      Utils.toast('Please enter a valid ZIP code', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Looking up...';
    container.innerHTML = '<p style="color: var(--text-secondary);">Looking up...</p>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrGetZipcodeInfo(username, password, zipcode);
      const info = result.zipInfo || {};

      if (info.stid || info.ctid) {
        let html = '<div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px;">';
        if (info.city) {
          html += `<p style="margin-bottom: 0.4rem;"><strong>City:</strong> ${Utils.escapeHtml(info.city)}</p>`;
        }
        if (info.stateName) {
          html += `<p style="margin-bottom: 0.4rem;"><strong>State:</strong> ${Utils.escapeHtml(info.stateName)}</p>`;
        }
        if (info.countyName) {
          html += `<p style="margin-bottom: 0.4rem;"><strong>County:</strong> ${Utils.escapeHtml(info.countyName)}</p>`;
        }
        if (info.lat && info.lon) {
          html += `<p style="margin-bottom: 0.4rem;"><strong>Location:</strong> ${info.lat}, ${info.lon}</p>`;
        }
        html += `<button class="btn btn-sm btn-primary" style="margin-top: 0.5rem;" onclick="UI.rrNavigateToLocation(${info.stid || 0}, ${info.ctid || 0})">`;
        html += '<i class="mdi mdi-arrow-right"></i> Browse this location</button>';
        html += '</div>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<p style="color: var(--text-secondary);">No location data found for this ZIP code</p>';
      }
    } catch (error) {
      container.innerHTML = `<p style="color: var(--danger-color);">${Utils.escapeHtml(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Lookup';
    }
  },

  /**
   * Navigate to a specific state/county from zipcode lookup
   */
  async rrNavigateToLocation(stid, ctid) {
    if (!this._rrCredentials) return;

    // Find the country that contains this state - try US first (coid=1)
    const countrySelect = document.getElementById('rrCountrySelect');
    const stateSelect = document.getElementById('rrStateSelect');

    // If no country is selected, select US (coid=1 typically)
    if (!countrySelect.value) {
      // Try to find US in the country list
      for (const opt of countrySelect.options) {
        if (opt.textContent.includes('United States') || opt.value === '1') {
          countrySelect.value = opt.value;
          break;
        }
      }
      if (countrySelect.value) {
        await this.rrLoadStates();
      }
    }

    // Select the state
    if (stid && stateSelect) {
      stateSelect.value = String(stid);
      if (stateSelect.value) {
        await this.rrLoadCounties();
        // Select the county
        if (ctid) {
          const countySelect = document.getElementById('rrCountySelect');
          countySelect.value = String(ctid);
          if (countySelect.value) {
            await this.rrLoadCountyData();
          }
        }
      }
    }
  },

  /**
   * Metro area search
   */
  async rrDoMetroSearch() {
    if (!this._rrCredentials) return;
    const keyword = document.getElementById('rrMetroInput')?.value?.trim();
    const container = document.getElementById('rrMetroResult');
    const btn = document.getElementById('rrMetroBtn');

    if (!keyword || keyword.length < 2) {
      Utils.toast('Please enter a search keyword (at least 2 characters)', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Searching...';
    container.innerHTML = '<p style="color: var(--text-secondary);">Searching...</p>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrSearchMetro(username, password, keyword);
      const metros = result.results || [];

      if (metros.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No metro areas found</p>';
      } else {
        let html = '<div style="max-height: 200px; overflow-y: auto;">';
        html += '<table class="data-table"><thead><tr><th>Metro Area</th><th>ID</th></tr></thead><tbody>';
        metros.forEach(m => {
          html += `<tr>
            <td><strong>${Utils.escapeHtml(m.metroName || '')}</strong></td>
            <td>${Utils.escapeHtml(String(m.mid || ''))}</td>
          </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
      }
    } catch (error) {
      container.innerHTML = `<p style="color: var(--danger-color);">${Utils.escapeHtml(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Search';
    }
  },

  /**
   * Load countries list
   */
  async rrLoadCountries() {
    const select = document.getElementById('rrCountrySelect');
    select.innerHTML = '<option value="">Loading...</option>';

    try {
      const result = await API.rrGetCountries();
      const countries = result.countries || [];
      const items = Array.isArray(countries) ? countries : (countries.item || []);

      select.innerHTML = '<option value="">Select country...</option>';
      items.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.coid;
        opt.textContent = c.countryName;
        select.appendChild(opt);
      });
    } catch (error) {
      select.innerHTML = '<option value="">Failed to load</option>';
      Utils.toast('Failed to load countries: ' + error.message, 'error');
    }
  },

  /**
   * Load states for selected country
   */
  async rrLoadStates() {
    const coid = document.getElementById('rrCountrySelect').value;
    const stateSelect = document.getElementById('rrStateSelect');
    const countySelect = document.getElementById('rrCountySelect');

    stateSelect.innerHTML = '<option value="">Select state...</option>';
    countySelect.innerHTML = '<option value="">Select county...</option>';
    document.getElementById('rrResultsSection').style.display = 'none';
    this._rrClearResults();

    if (!coid || !this._rrCredentials) return;

    stateSelect.innerHTML = '<option value="">Loading...</option>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrGetCountryInfo(username, password, coid);
      const states = result.states || [];
      const items = Array.isArray(states) ? states : (states.item || []);

      stateSelect.innerHTML = '<option value="">Select state...</option>';
      items.sort((a, b) => (a.stateName || '').localeCompare(b.stateName || ''));
      items.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.stid;
        opt.textContent = s.stateName;
        stateSelect.appendChild(opt);
      });
    } catch (error) {
      stateSelect.innerHTML = '<option value="">Failed to load</option>';
      Utils.toast('Failed to load states: ' + error.message, 'error');
    }
  },

  /**
   * Load counties for selected state
   */
  async rrLoadCounties() {
    const stid = document.getElementById('rrStateSelect').value;
    const countySelect = document.getElementById('rrCountySelect');

    countySelect.innerHTML = '<option value="">Select county...</option>';
    document.getElementById('rrResultsSection').style.display = 'none';
    this._rrClearResults();

    if (!stid || !this._rrCredentials) return;

    countySelect.innerHTML = '<option value="">Loading...</option>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrGetStateInfo(username, password, stid);
      const counties = result.counties || [];
      const items = Array.isArray(counties) ? counties : (counties.item || []);

      // Store trunked systems at state level
      this._rrStateTrsList = result.trsList || [];

      countySelect.innerHTML = '<option value="">Select county...</option>';
      items.sort((a, b) => (a.countyName || '').localeCompare(b.countyName || ''));
      items.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.ctid;
        opt.textContent = c.countyName;
        countySelect.appendChild(opt);
      });
    } catch (error) {
      countySelect.innerHTML = '<option value="">Failed to load</option>';
      Utils.toast('Failed to load counties: ' + error.message, 'error');
    }
  },

  /**
   * Clear all RadioReference results (frequencies, trunked systems, search results, map markers)
   */
  _rrClearResults() {
    const freqResults = document.getElementById('rrFreqResults');
    if (freqResults) freqResults.innerHTML = '<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-radio-tower"></i><p>Select a category to load frequencies</p></div>';
    const trsList = document.getElementById('rrTrsList');
    if (trsList) trsList.innerHTML = '';
    const searchResults = document.getElementById('rrSearchResults');
    if (searchResults) searchResults.innerHTML = '';
    const catSelect = document.getElementById('rrCategorySelect');
    if (catSelect) catSelect.innerHTML = '<option value="">Select a category or agency...</option>';
    this._rrFrequencies = null;
    this._rrAllFrequencies = null;
    this._rrMapMarkers = [];
    if (this._rrMapLayerGroup) this._rrMapLayerGroup.clearLayers();
  },

  /**
   * Load county data (categories, agencies, trunked systems)
   */
  async rrLoadCountyData() {
    const ctid = document.getElementById('rrCountySelect').value;
    if (!ctid || !this._rrCredentials) return;

    document.getElementById('rrResultsSection').style.display = '';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrGetCountyInfo(username, password, ctid);

      // Build category/agency dropdown
      const catSelect = document.getElementById('rrCategorySelect');
      catSelect.innerHTML = '<option value="">Select a category or agency...</option>';

      // Add frequency categories
      const cats = result.categories || [];
      const catItems = Array.isArray(cats) ? cats : _rrToArray(cats);
      catItems.forEach(cat => {
        const scItems = _rrToArray(cat.subcats);
        scItems.forEach(sc => {
          const opt = document.createElement('option');
          opt.value = `sc:${sc.scid}`;
          opt.textContent = `${cat.cName} > ${sc.scName}`;
          catSelect.appendChild(opt);
        });
      });

      // Add agencies
      const agencies = result.agencies || [];
      const agencyItems = Array.isArray(agencies) ? agencies : _rrToArray(agencies);
      if (agencyItems.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Agencies';
        agencyItems.forEach(a => {
          const opt = document.createElement('option');
          opt.value = `agency:${a.aid}`;
          opt.textContent = a.aName;
          group.appendChild(opt);
        });
        catSelect.appendChild(group);
      }

      // Check if county has no categories or agencies
      if (catItems.length === 0 && agencyItems.length === 0) {
        catSelect.innerHTML = '<option value="">No categories or agencies found for this county</option>';
      }

      // Show trunked systems
      const trsList = result.trsList || [];
      const trsItems = Array.isArray(trsList) ? trsList : _rrToArray(trsList);
      this.rrRenderTrsList(trsItems);

      // Set map marker for county location
      if (result.county && result.county.lat && result.county.lon) {
        this._rrCountyLocation = {
          lat: parseFloat(result.county.lat),
          lon: parseFloat(result.county.lon),
          name: result.county.countyName || 'County'
        };
        this._rrMapMarkers = [{
          lat: this._rrCountyLocation.lat,
          lon: this._rrCountyLocation.lon,
          label: this._rrCountyLocation.name,
          type: 'county'
        }];
      }

      // Show frequencies tab by default
      this.rrSwitchTab('frequencies');
    } catch (error) {
      Utils.toast('Failed to load county data: ' + error.message, 'error');
    }
  },

  /**
   * Switch between frequencies and trunked systems tabs
   */
  rrSwitchTab(tab) {
    document.getElementById('rrFreqTab').style.display = tab === 'frequencies' ? '' : 'none';
    document.getElementById('rrTrunkedTab').style.display = tab === 'trunked' ? '' : 'none';
    document.querySelectorAll('.rrTabBtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rrtab === tab);
    });
  },

  /**
   * Load frequencies for selected category/agency
   */
  async rrLoadFrequencies() {
    const val = document.getElementById('rrCategorySelect').value;
    const container = document.getElementById('rrFreqResults');
    if (!val || !this._rrCredentials) return;

    container.innerHTML = '<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-loading mdi-spin"></i><p>Loading frequencies...</p></div>';

    try {
      const { username, password } = this._rrCredentials;
      let freqs = [];
      let allFreqs = [];

      if (val.startsWith('sc:')) {
        const scid = val.replace('sc:', '');
        const result = await API.rrGetSubcatFreqs(username, password, scid);
        freqs = result.frequencies || [];
        allFreqs = result.allFrequencies || freqs;
      } else if (val.startsWith('agency:')) {
        const aid = val.replace('agency:', '');
        const agencyResult = await API.rrGetAgencyInfo(username, password, aid);
        const agencyCats = agencyResult.categories || [];
        const agencyCatItems = Array.isArray(agencyCats) ? agencyCats : _rrToArray(agencyCats);

        // Load all subcategory frequencies for the agency
        for (const cat of agencyCatItems) {
          const scItems = _rrToArray(cat.subcats);
          for (const sc of scItems) {
            try {
              const res = await API.rrGetSubcatFreqs(username, password, sc.scid);
              const scFreqs = (res.frequencies || []).map(f => ({
                ...f,
                _categoryName: `${cat.cName} > ${sc.scName}`
              }));
              const scAllFreqs = (res.allFrequencies || []).map(f => ({
                ...f,
                _categoryName: `${cat.cName} > ${sc.scName}`
              }));
              freqs = freqs.concat(scFreqs);
              allFreqs = allFreqs.concat(scAllFreqs);
            } catch (e) {
              console.warn(`Failed to load subcategory ${sc.scid}:`, e.message);
            }
          }
        }
      }

      this._rrFrequencies = freqs;
      this._rrAllFrequencies = allFreqs;
      this._rrShowAllFreqs = false;
      this.rrRenderFrequencies(freqs);
    } catch (error) {
      container.innerHTML = `<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-alert"></i><p>Failed to load: ${Utils.escapeHtml(error.message)}</p></div>`;
    }
  },

  /**
   * Toggle between filtered and all frequencies
   */
  rrToggleShowAllFreqs() {
    this._rrShowAllFreqs = !this._rrShowAllFreqs;
    const freqs = this._rrShowAllFreqs ? (this._rrAllFrequencies || []) : (this._rrFrequencies || []);
    this.rrRenderFrequencies(freqs);
  },

  /**
   * Render frequencies table with checkboxes
   */
  rrRenderFrequencies(freqs, containerId) {
    const container = document.getElementById(containerId || 'rrFreqResults');

    if (!freqs || freqs.length === 0) {
      const allCount = (this._rrAllFrequencies || []).length;
      const msg = allCount > 0
        ? `No compatible frequencies found (${allCount} total exist in other modes)`
        : 'No frequencies found in this category';
      container.innerHTML = `<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-radio-tower"></i><p>${msg}</p>${allCount > 0 ? '<button class="btn btn-sm btn-secondary" style="margin-top: 0.5rem;" onclick="UI.rrToggleShowAllFreqs()">Show All Frequencies</button>' : ''}</div>`;
      return;
    }

    // Populate map markers from frequencies (use county location as base with radial offset)
    if (!containerId) {
      const countyLoc = this._rrCountyLocation;
      if (countyLoc) {
        const count = freqs.length;
        this._rrMapMarkers = freqs.map((f, i) => {
          // Radial arrangement around county centre for deterministic placement
          const angle = (2 * Math.PI * i) / Math.max(count, 1);
          const radius = 0.005 * (1 + Math.floor(i / 12)); // expand rings
          return {
            lat: countyLoc.lat + Math.sin(angle) * radius,
            lon: countyLoc.lon + Math.cos(angle) * radius,
            label: f.alpha || f.callsign || f.description || `${f.frequency} MHz`,
            type: f.mode || 'Frequency',
            frequency: f.frequency,
            mode: f.mode || '',
            tone: f.tone || '',
            colorCode: f.colorCode || '',
            description: f.description || ''
          };
        });
        // Auto-show map with markers
        this.rrShowOnMap();
      }
    }

    const showingAll = this._rrShowAllFreqs;
    const filteredCount = (this._rrFrequencies || []).length;
    const allCount = (this._rrAllFrequencies || []).length;
    const toggleBtn = allCount > filteredCount && !containerId
      ? `<button class="btn btn-sm btn-secondary" onclick="UI.rrToggleShowAllFreqs()">${showingAll ? `Show Compatible Only (${filteredCount})` : `Show All (${allCount})`}</button>`
      : '';

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <span>${freqs.length} frequenc${freqs.length === 1 ? 'y' : 'ies'}${showingAll ? '' : ' (compatible modes)'}</span>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          ${toggleBtn}
          <button class="btn btn-sm btn-secondary" onclick="UI.rrSelectAllFreqs()">Select All</button>
          <button class="btn btn-sm btn-secondary" onclick="UI.rrDeselectAllFreqs()">Deselect All</button>
          <button class="btn btn-sm btn-primary" onclick="UI.rrImportSelectedFreqs()">
            <i class="mdi mdi-import"></i> Import Selected
          </button>
        </div>
      </div>
      <div class="data-table-container" style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="rrSelectAllFreqsCb" onchange="UI.rrToggleAllFreqs(this.checked)"></th>
              <th>Frequency</th>
              <th>Input</th>
              <th>Callsign</th>
              <th>Mode</th>
              <th>Tone</th>
              <th>Color Code</th>
              <th>TG</th>
              <th>Slot</th>
              <th>Alpha</th>
              <th>Description</th>
              <th>Class</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${freqs.map((f, i) => {
              const updDate = f.lastUpdated ? String(f.lastUpdated).substring(0, 10) : '';
              return `
              <tr>
                <td><input type="checkbox" class="rr-freq-select" data-index="${i}"></td>
                <td><strong>${f.frequency || ''}</strong></td>
                <td>${f.inputFreq || ''}</td>
                <td>${Utils.escapeHtml(f.callsign || '')}</td>
                <td>${Utils.escapeHtml(f.mode || '')}</td>
                <td>${Utils.escapeHtml(f.tone || '')}</td>
                <td>${Utils.escapeHtml(f.colorCode || '')}</td>
                <td>${Utils.escapeHtml(f.talkgroup || '')}</td>
                <td>${Utils.escapeHtml(f.slot || '')}</td>
                <td>${Utils.escapeHtml(f.alpha || '')}</td>
                <td>${Utils.escapeHtml(f.description || '')}</td>
                <td>${Utils.escapeHtml(f.class || '')}</td>
                <td><small>${Utils.escapeHtml(updDate)}</small></td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  rrSelectAllFreqs() {
    document.querySelectorAll('.rr-freq-select').forEach(cb => { cb.checked = true; });
    const allCb = document.getElementById('rrSelectAllFreqsCb');
    if (allCb) allCb.checked = true;
  },

  rrDeselectAllFreqs() {
    document.querySelectorAll('.rr-freq-select').forEach(cb => { cb.checked = false; });
    const allCb = document.getElementById('rrSelectAllFreqsCb');
    if (allCb) allCb.checked = false;
  },

  rrToggleAllFreqs(checked) {
    document.querySelectorAll('.rr-freq-select').forEach(cb => { cb.checked = checked; });
  },

  /**
   * Import selected frequencies as channels
   */
  rrImportSelectedFreqs() {
    const selected = document.querySelectorAll('.rr-freq-select:checked');
    if (selected.length === 0) {
      Utils.toast('No frequencies selected', 'warning');
      return;
    }

    const source = this._rrShowAllFreqs ? (this._rrAllFrequencies || []) : (this._rrFrequencies || []);
    const freqs = [];
    selected.forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      if (source[idx]) {
        freqs.push(source[idx]);
      }
    });

    this._rrShowImportDialog(freqs, []);
  },

  /**
   * Render trunked systems list (DMR, Analog, and MPT-1327 systems)
   */
  rrRenderTrsList(trsList) {
    const container = document.getElementById('rrTrsList');

    if (!trsList || trsList.length === 0) {
      container.innerHTML = '<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-access-point-network"></i><p>No trunked systems in this county</p></div>';
      return;
    }

    // Filter to show trunked systems with DMR, Analog, or MPT-1327 in the type description
    const supportedSystems = trsList.filter(trs => {
      const typeDescr = (this._rrTrsTypes && this._rrTrsTypes[parseInt(trs.sType)]) || '';
      const flavorDescr = (this._rrTrsFlavors && this._rrTrsFlavors[`${trs.sType}_${trs.sFlavor}`]) || '';
      const voiceDescr = (this._rrTrsVoices && this._rrTrsVoices[`${trs.sType}_${trs.sVoice}`]) || '';
      const typeInfo = [typeDescr, flavorDescr, voiceDescr].join(' ').toLowerCase();
      return typeInfo.includes('dmr') || typeInfo.includes('analog') || typeInfo.includes('mpt-1327') || typeInfo.includes('mpt1327');
    });

    if (supportedSystems.length === 0) {
      container.innerHTML = '<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-access-point-network"></i><p>No compatible trunked systems in this county</p></div>';
      return;
    }

    container.innerHTML = `
      <p style="margin-bottom: 0.5rem;">${supportedSystems.length} trunked system${supportedSystems.length !== 1 ? 's' : ''}${supportedSystems.length < trsList.length ? ` (${trsList.length - supportedSystems.length} unsupported hidden)` : ''}</p>
      <div class="data-table-container" style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>System</th>
              <th>Type</th>
              <th>City</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${supportedSystems.map(trs => {
              const typeDescr = (this._rrTrsTypes && this._rrTrsTypes[parseInt(trs.sType)]) || '';
              const flavorDescr = (this._rrTrsFlavors && this._rrTrsFlavors[`${trs.sType}_${trs.sFlavor}`]) || '';
              const voiceDescr = (this._rrTrsVoices && this._rrTrsVoices[`${trs.sType}_${trs.sVoice}`]) || '';
              const typeInfo = [typeDescr, flavorDescr, voiceDescr].filter(Boolean).join(' / ');
              return `
              <tr>
                <td><strong>${Utils.escapeHtml(trs.sName || '')}</strong></td>
                <td><small>${Utils.escapeHtml(typeInfo || 'Unknown')}</small></td>
                <td>${Utils.escapeHtml(trs.sCity || '')}</td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="UI.rrLoadTrsData(${trs.sid})">
                    <i class="mdi mdi-magnify"></i> Browse
                  </button>
                </td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * Load trunked system data (sites + talkgroups)
   */
  async rrLoadTrsData(sid) {
    if (!this._rrCredentials) return;

    const container = document.getElementById('rrTrsList');
    container.innerHTML = '<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-loading mdi-spin"></i><p>Loading trunked system data...</p></div>';

    try {
      const { username, password } = this._rrCredentials;

      const [detailsResult, sitesResult, talkgroupsResult] = await Promise.all([
        API.rrGetTrsDetails(username, password, sid),
        API.rrGetTrsSites(username, password, sid),
        API.rrGetTrsTalkgroups(username, password, sid)
      ]);

      const system = detailsResult.system || {};
      const sites = sitesResult.sites || [];
      const siteArray = Array.isArray(sites) ? sites : (sites.item || []);
      const talkgroups = talkgroupsResult.talkgroups || [];

      this._rrTrsSites = siteArray;
      this._rrTrsTalkgroups = talkgroups;
      this._rrTrsDetails = system;

      const typeDescr = system.typeDescr || (this._rrTrsTypes && this._rrTrsTypes[parseInt(system.sType)]) || '';
      const flavorDescr = system.flavorDescr || (this._rrTrsFlavors && this._rrTrsFlavors[`${system.sType}_${system.sFlavor}`]) || '';
      const voiceDescr = system.voiceDescr || (this._rrTrsVoices && this._rrTrsVoices[`${system.sType}_${system.sVoice}`]) || '';
      const typeInfo = [typeDescr, flavorDescr, voiceDescr].filter(Boolean).join(' / ');

      const trsUpdated = system.lastUpdated ? String(system.lastUpdated).substring(0, 10) : '';

      let html = `
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px;">
          <strong>${Utils.escapeHtml(system.sName || 'Unknown System')}</strong>
          ${system.sCity ? ` - ${Utils.escapeHtml(system.sCity)}` : ''}
          ${typeInfo ? `<br><small style="color: var(--primary-color);"><i class="mdi mdi-information"></i> ${Utils.escapeHtml(typeInfo)}</small>` : ''}
          <br><small>Sites: ${siteArray.length} | Talkgroups: ${talkgroups.length}${trsUpdated ? ` | Updated: ${Utils.escapeHtml(trsUpdated)}` : ''}</small>
          <button class="btn btn-sm btn-secondary" onclick="UI.rrLoadCountyData()" style="margin-left: 1rem;">
            <i class="mdi mdi-arrow-left"></i> Back
          </button>
        </div>
      `;

      // Sites with frequencies
      if (siteArray.length > 0) {
        html += `
          <h4 style="margin-bottom: 0.5rem;">Sites & Frequencies</h4>
          <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem; gap: 0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="UI.rrSelectAllSites()">Select All Sites</button>
            <button class="btn btn-sm btn-secondary" onclick="UI.rrDeselectAllSites()">Deselect All</button>
            <button class="btn btn-sm btn-primary" onclick="UI.rrImportSelectedSites()">
              <i class="mdi mdi-import"></i> Import Selected Sites
            </button>
          </div>
          <div class="data-table-container" style="max-height: 300px; overflow-y: auto; margin-bottom: 1rem;">
            <table class="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" id="rrSelectAllSitesCb" onchange="UI.rrToggleAllSites(this.checked)"></th>
                  <th>Site</th>
                  <th>Location</th>
                  <th>Frequencies</th>
                  <th>Color Codes</th>
                </tr>
              </thead>
              <tbody>
                ${siteArray.map((site, i) => {
                  const siteFreqs = site.siteFreqs || [];
                  const freqItems = Array.isArray(siteFreqs) ? siteFreqs : (siteFreqs.item || []);
                  const freqStr = freqItems.map(f => f.freq).filter(Boolean).join(', ');
                  const ccStr = freqItems.map(f => f.colorCode).filter(Boolean).join(', ');
                  return `
                    <tr>
                      <td><input type="checkbox" class="rr-site-select" data-index="${i}"></td>
                      <td><strong>${Utils.escapeHtml(site.siteDescr || `Site ${site.siteNumber}`)}</strong></td>
                      <td>${Utils.escapeHtml(site.siteLocation || '')}</td>
                      <td>${Utils.escapeHtml(freqStr)}</td>
                      <td>${Utils.escapeHtml(ccStr)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      // Populate map markers from sites with coordinates and frequency details
      const trsTypeLabel = typeInfo.toLowerCase().includes('dmr') ? 'DMR' : 'Trunked';
      this._rrMapMarkers = siteArray.filter(s => s.lat && s.lon).map(s => {
        const siteFreqs = s.siteFreqs || [];
        const freqItems = Array.isArray(siteFreqs) ? siteFreqs : (siteFreqs.item || []);
        const freqStr = freqItems.map(f => f.freq).filter(Boolean).join(', ');
        const ccStr = freqItems.map(f => f.colorCode).filter(Boolean).join(', ');
        return {
          lat: parseFloat(s.lat), lon: parseFloat(s.lon),
          label: `${system.sName || ''} - ${s.siteDescr || 'Site ' + s.siteNumber}`,
          type: `${trsTypeLabel} Trunked Site`,
          frequency: freqStr,
          colorCode: ccStr,
          description: s.siteLocation || ''
        };
      });
      if (this._rrMapMarkers.length > 0) {
        html += '<button class="btn btn-sm btn-secondary" style="margin-bottom: 1rem;" onclick="UI.rrShowOnMap()"><i class="mdi mdi-map-marker"></i> Show Sites on Map</button>';
      }

      // Talkgroups
      if (talkgroups.length > 0) {
        html += `
          <h4 style="margin-bottom: 0.5rem;">Talkgroups</h4>
          <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem; gap: 0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="UI.rrSelectAllTGs()">Select All TGs</button>
            <button class="btn btn-sm btn-secondary" onclick="UI.rrDeselectAllTGs()">Deselect All</button>
            <button class="btn btn-sm btn-primary" onclick="UI.rrImportSelectedTGs()">
              <i class="mdi mdi-import"></i> Import Selected TGs
            </button>
          </div>
          <div class="data-table-container" style="max-height: 300px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" id="rrSelectAllTGsCb" onchange="UI.rrToggleAllTGs(this.checked)"></th>
                  <th>TG ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Mode</th>
                  <th>Slot</th>
                  <th>Encrypted</th>
                </tr>
              </thead>
              <tbody>
                ${talkgroups.map((tg, i) => `
                  <tr>
                    <td><input type="checkbox" class="rr-tg-select" data-index="${i}"></td>
                    <td><strong>${tg.tgDec || ''}</strong></td>
                    <td>${Utils.escapeHtml(tg.name || '')}</td>
                    <td>${Utils.escapeHtml(tg.description || '')}</td>
                    <td>${Utils.escapeHtml(tg.mode || '')}</td>
                    <td>${Utils.escapeHtml(tg.slot || '')}</td>
                    <td>${tg.encrypted ? '<span style="color: var(--danger-color);">Yes</span>' : 'No'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      container.innerHTML = html;

      // Auto-show map with trunked system sites
      if (this._rrMapMarkers.length > 0) {
        this.rrShowOnMap();
      }
    } catch (error) {
      container.innerHTML = `<div class="table-empty" style="padding: 2rem;"><i class="mdi mdi-alert"></i><p>Failed: ${Utils.escapeHtml(error.message)}</p></div>`;
    }
  },

  // Site selection helpers
  rrSelectAllSites() { document.querySelectorAll('.rr-site-select').forEach(cb => { cb.checked = true; }); },
  rrDeselectAllSites() { document.querySelectorAll('.rr-site-select').forEach(cb => { cb.checked = false; }); },
  rrToggleAllSites(checked) { document.querySelectorAll('.rr-site-select').forEach(cb => { cb.checked = checked; }); },
  rrSelectAllTGs() { document.querySelectorAll('.rr-tg-select').forEach(cb => { cb.checked = true; }); },
  rrDeselectAllTGs() { document.querySelectorAll('.rr-tg-select').forEach(cb => { cb.checked = false; }); },
  rrToggleAllTGs(checked) { document.querySelectorAll('.rr-tg-select').forEach(cb => { cb.checked = checked; }); },

  /**
   * Import selected trunked system sites as channels.
   * Each RX frequency and color code becomes its own channel with a sequential number appended to the site name.
   */
  rrImportSelectedSites() {
    const selected = document.querySelectorAll('.rr-site-select:checked');
    if (selected.length === 0) {
      Utils.toast('No sites selected', 'warning');
      return;
    }

    // Determine mode from trunked system type info
    const system = this._rrTrsDetails || {};
    const typeDescr = system.typeDescr || (this._rrTrsTypes && this._rrTrsTypes[parseInt(system.sType)]) || '';
    const flavorDescr = system.flavorDescr || (this._rrTrsFlavors && this._rrTrsFlavors[`${system.sType}_${system.sFlavor}`]) || '';
    const voiceDescr = system.voiceDescr || (this._rrTrsVoices && this._rrTrsVoices[`${system.sType}_${system.sVoice}`]) || '';
    const typeInfo = [typeDescr, flavorDescr, voiceDescr].filter(Boolean).join(' ').toLowerCase();
    const isDMR = typeInfo.includes('dmr');
    const siteMode = isDMR ? 'DMR' : 'FM';

    const freqs = [];
    selected.forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      const site = this._rrTrsSites[idx];
      if (!site) return;

      const siteName = site.siteDescr || `Site ${site.siteNumber}`;
      const siteFreqs = site.siteFreqs || [];
      const freqItems = Array.isArray(siteFreqs) ? siteFreqs : (siteFreqs.item || []);
      freqItems.forEach((f, seqIdx) => {
        // Append sequential number to site name for each frequency
        const seqNum = seqIdx + 1;
        const nameBase = siteName;
        const suffix = ` ${seqNum}`;
        const alpha = Utils.truncate(nameBase, CONFIG.LIMITS.CHANNEL_NAME_LEN - suffix.length) + suffix;
        freqs.push({
          frequency: parseFloat(f.freq) || 0,
          inputFreq: parseFloat(f.freq) || 0,
          colorCode: isDMR ? (f.colorCode || '') : '',
          mode: siteMode,
          alpha: alpha,
          description: `${this._rrTrsDetails?.sName || ''} - ${site.siteLocation || site.siteDescr || ''}`,
          tone: '',
          talkgroup: '',
          slot: ''
        });
      });
    });

    // Also check if TGs are selected for import alongside
    const selectedTGs = [];
    document.querySelectorAll('.rr-tg-select:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      if (this._rrTrsTalkgroups[idx]) {
        selectedTGs.push(this._rrTrsTalkgroups[idx]);
      }
    });

    this._rrShowImportDialog(freqs, selectedTGs);
  },

  /**
   * Import selected talkgroups into a TG list
   */
  rrImportSelectedTGs() {
    const selected = document.querySelectorAll('.rr-tg-select:checked');
    if (selected.length === 0) {
      Utils.toast('No talkgroups selected', 'warning');
      return;
    }

    const talkgroups = [];
    selected.forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      if (this._rrTrsTalkgroups[idx]) {
        talkgroups.push(this._rrTrsTalkgroups[idx]);
      }
    });

    // Show TG import dialog (no frequencies to import, just TGs)
    this._rrShowImportDialog([], talkgroups);
  },

  /**
   * FCC Callsign lookup
   */
  async rrDoFccSearch() {
    if (!this._rrCredentials) return;
    const callsign = document.getElementById('rrFccCallsignInput')?.value?.trim().toUpperCase();
    const container = document.getElementById('rrFccResult');
    const btn = document.getElementById('rrFccSearchBtn');

    if (!callsign) {
      Utils.toast('Please enter a callsign', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Searching...';
    container.innerHTML = '<p style="color: var(--text-secondary);">Searching...</p>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrFccGetCallsign(username, password, callsign);
      const details = result.details;

      if (!details || !details.callsign) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No results found for this callsign</p>';
        return;
      }

      const locations = Array.isArray(details.locations) ? details.locations : [];
      const frequencies = Array.isArray(details.frequencies) ? details.frequencies : [];

      let html = '<div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px;">';
      html += `<h4 style="margin-bottom: 0.5rem;">${Utils.escapeHtml(details.callsign)}</h4>`;
      if (details.licensee) html += `<p style="margin-bottom: 0.3rem;"><strong>Licensee:</strong> ${Utils.escapeHtml(details.licensee)}</p>`;
      if (details.status) html += `<p style="margin-bottom: 0.3rem;"><strong>Status:</strong> ${Utils.escapeHtml(details.status)}</p>`;
      if (details.radioService) html += `<p style="margin-bottom: 0.3rem;"><strong>Service:</strong> ${Utils.escapeHtml(details.radioService)}</p>`;
      if (details.grantDate) html += `<p style="margin-bottom: 0.3rem;"><strong>Grant Date:</strong> ${Utils.escapeHtml(details.grantDate)}</p>`;
      if (details.notes) html += `<p style="margin-bottom: 0.3rem;"><strong>Notes:</strong> ${Utils.escapeHtml(details.notes)}</p>`;

      if (locations.length > 0) {
        html += '<h5 style="margin: 0.75rem 0 0.25rem;">Locations</h5>';
        html += '<div class="data-table-container" style="max-height: 200px; overflow-y: auto;">';
        html += '<table class="data-table"><thead><tr><th>#</th><th>Address</th><th>City</th><th>State</th><th>Lat</th><th>Lon</th></tr></thead><tbody>';
        locations.forEach(loc => {
          html += `<tr>
            <td>${loc.locationNumber || ''}</td>
            <td>${Utils.escapeHtml(loc.address || '')}</td>
            <td>${Utils.escapeHtml(loc.city || '')}</td>
            <td>${Utils.escapeHtml(loc.state || '')}</td>
            <td>${loc.lat || ''}</td>
            <td>${loc.lon || ''}</td>
          </tr>`;
        });
        html += '</tbody></table></div>';

        // Show on map
        this._rrMapMarkers = locations.filter(l => l.lat && l.lon).map(l => ({
          lat: parseFloat(l.lat), lon: parseFloat(l.lon),
          label: `${details.callsign} - ${l.city || ''}, ${l.state || ''}`,
          type: 'fcc'
        }));
        if (this._rrMapMarkers.length > 0) {
          html += '<button class="btn btn-sm btn-secondary" style="margin-top: 0.5rem;" onclick="UI.rrShowOnMap()"><i class="mdi mdi-map-marker"></i> Show on Map</button>';
        }
      }

      if (frequencies.length > 0) {
        html += '<h5 style="margin: 0.75rem 0 0.25rem;">Frequencies</h5>';
        html += '<div class="data-table-container" style="max-height: 200px; overflow-y: auto;">';
        html += '<table class="data-table"><thead><tr><th>Frequency</th><th>Emission</th><th>Class</th><th>Power (W)</th></tr></thead><tbody>';
        frequencies.forEach(f => {
          html += `<tr>
            <td><strong>${f.frequency || ''}</strong></td>
            <td>${Utils.escapeHtml(f.emission || '')}</td>
            <td>${Utils.escapeHtml(f.class || '')}</td>
            <td>${f.power || ''}</td>
          </tr>`;
        });
        html += '</tbody></table></div>';
      }

      html += '</div>';
      container.innerHTML = html;
    } catch (error) {
      container.innerHTML = `<p style="color: var(--danger-color);">${Utils.escapeHtml(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Lookup';
    }
  },

  /**
   * FCC Proximity search
   */
  async rrDoFccProxSearch() {
    if (!this._rrCredentials) return;
    const lat = document.getElementById('rrFccProxLat')?.value?.trim();
    const lon = document.getElementById('rrFccProxLon')?.value?.trim();
    const range = document.getElementById('rrFccProxRange')?.value || '1';
    const unit = document.getElementById('rrFccProxUnit')?.value || 'm';
    const container = document.getElementById('rrFccProxResult');
    const btn = document.getElementById('rrFccProxSearchBtn');

    if (!lat || !lon) {
      Utils.toast('Please enter latitude and longitude', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Searching...';
    container.innerHTML = '<p style="color: var(--text-secondary);">Searching...</p>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrFccGetProxCallsigns(username, password, parseFloat(lat), parseFloat(lon), parseFloat(range), unit);
      const callsigns = result.results || [];

      if (callsigns.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No callsigns found in this area</p>';
        return;
      }

      let html = `<p style="margin-bottom: 0.5rem;">${callsigns.length} callsign${callsigns.length !== 1 ? 's' : ''} found</p>`;
      html += '<div class="data-table-container" style="max-height: 300px; overflow-y: auto;">';
      html += '<table class="data-table"><thead><tr><th>Callsign</th><th>Licensee</th><th>Distance</th><th>Lat</th><th>Lon</th><th>Actions</th></tr></thead><tbody>';
      callsigns.forEach(c => {
        html += `<tr>
          <td><strong>${Utils.escapeHtml(c.callsign || '')}</strong></td>
          <td>${Utils.escapeHtml(c.licensee || '')}</td>
          <td>${c.distance || ''}</td>
          <td>${c.lat || ''}</td>
          <td>${c.lon || ''}</td>
          <td><button class="btn btn-sm btn-secondary" onclick="UI.rrDoFccSearchFor('${Utils.escapeHtml((c.callsign || '').replace(/'/g, ''))}')"><i class="mdi mdi-magnify"></i></button></td>
        </tr>`;
      });
      html += '</tbody></table></div>';

      // Map markers
      this._rrMapMarkers = callsigns.filter(c => c.lat && c.lon).map(c => ({
        lat: parseFloat(c.lat), lon: parseFloat(c.lon),
        label: `${c.callsign} - ${c.licensee || ''}`,
        type: 'fcc'
      }));
      if (this._rrMapMarkers.length > 0) {
        html += '<button class="btn btn-sm btn-secondary" style="margin-top: 0.5rem;" onclick="UI.rrShowOnMap()"><i class="mdi mdi-map-marker"></i> Show on Map</button>';
      }

      container.innerHTML = html;
    } catch (error) {
      container.innerHTML = `<p style="color: var(--danger-color);">${Utils.escapeHtml(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Search';
    }
  },

  /**
   * Quick FCC callsign lookup from proximity results
   */
  rrDoFccSearchFor(callsign) {
    document.getElementById('rrFccCallsignInput').value = callsign;
    this.rrSwitchSearchTool('fcc');
    this.rrDoFccSearch();
  },

  /**
   * System ID search
   */
  async rrDoSysidSearch() {
    if (!this._rrCredentials) return;
    const sysid = document.getElementById('rrSysidInput')?.value?.trim();
    const container = document.getElementById('rrSysidResult');
    const btn = document.getElementById('rrSysidSearchBtn');

    if (!sysid) {
      Utils.toast('Please enter a system ID', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Searching...';
    container.innerHTML = '<p style="color: var(--text-secondary);">Searching...</p>';

    try {
      const { username, password } = this._rrCredentials;
      const result = await API.rrSearchTrsBySysid(username, password, sysid);
      const systems = result.systems || [];

      if (systems.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No trunked systems found with this system ID</p>';
        return;
      }

      let html = `<p style="margin-bottom: 0.5rem;">${systems.length} system${systems.length !== 1 ? 's' : ''} found</p>`;
      html += '<div class="data-table-container" style="max-height: 300px; overflow-y: auto;">';
      html += '<table class="data-table"><thead><tr><th>System</th><th>Type</th><th>City</th><th>Actions</th></tr></thead><tbody>';
      systems.forEach(trs => {
        const typeDescr = (this._rrTrsTypes && this._rrTrsTypes[parseInt(trs.sType)]) || '';
        const flavorDescr = (this._rrTrsFlavors && this._rrTrsFlavors[`${trs.sType}_${trs.sFlavor}`]) || '';
        const voiceDescr = (this._rrTrsVoices && this._rrTrsVoices[`${trs.sType}_${trs.sVoice}`]) || '';
        const typeInfo = [typeDescr, flavorDescr, voiceDescr].filter(Boolean).join(' / ');
        html += `<tr>
          <td><strong>${Utils.escapeHtml(trs.sName || '')}</strong></td>
          <td><small>${Utils.escapeHtml(typeInfo || 'Unknown')}</small></td>
          <td>${Utils.escapeHtml(trs.sCity || '')}</td>
          <td><button class="btn btn-sm btn-primary" onclick="UI.rrLoadTrsData(${trs.sid})"><i class="mdi mdi-magnify"></i> Browse</button></td>
        </tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (error) {
      container.innerHTML = `<p style="color: var(--danger-color);">${Utils.escapeHtml(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="mdi mdi-magnify"></i> Search';
    }
  },

  // ============================================================================
  // Map View
  // ============================================================================

  _rrMap: null,
  _rrMapLayerGroup: null,
  _rrMapMarkers: [],

  rrToggleMap() {
    const container = document.getElementById('rrMapContainer');
    const text = document.getElementById('rrMapToggleText');
    if (container.style.display === 'none') {
      container.style.display = '';
      text.textContent = 'Hide Map';
      if (!this._rrMap) {
        this._rrMap = L.map('rrMap').setView([39.8283, -98.5795], 4);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(this._rrMap);
        this._rrMapLayerGroup = L.layerGroup().addTo(this._rrMap);
      }
      setTimeout(() => this._rrMap.invalidateSize(), 100);
      if (this._rrMapMarkers && this._rrMapMarkers.length > 0) {
        this._rrRenderMapMarkers();
      }
    } else {
      container.style.display = 'none';
      text.textContent = 'Show Map';
    }
  },

  rrShowOnMap() {
    const container = document.getElementById('rrMapContainer');
    if (container.style.display === 'none') {
      this.rrToggleMap();
    } else {
      this._rrRenderMapMarkers();
    }
  },

  _rrRenderMapMarkers() {
    if (!this._rrMap || !this._rrMapLayerGroup) return;
    this._rrMapLayerGroup.clearLayers();
    const bounds = [];
    (this._rrMapMarkers || []).forEach(m => {
      if (!m.lat || !m.lon || isNaN(m.lat) || isNaN(m.lon)) return;
      const marker = L.marker([m.lat, m.lon]);
      // Build rich popup content
      let popupHtml = `<div style="min-width: 150px;">`;
      popupHtml += `<strong>${Utils.escapeHtml(m.label || 'Unknown')}</strong>`;
      if (m.type) popupHtml += `<br><small style="color: #888;">${Utils.escapeHtml(m.type)}</small>`;
      if (m.frequency) popupHtml += `<br>Freq: <strong>${m.frequency} MHz</strong>`;
      if (m.mode) popupHtml += `<br>Mode: ${Utils.escapeHtml(m.mode)}`;
      if (m.tone) popupHtml += `<br>Tone: ${Utils.escapeHtml(m.tone)}`;
      if (m.colorCode) popupHtml += `<br>CC: ${Utils.escapeHtml(String(m.colorCode))}`;
      if (m.description) popupHtml += `<br><small>${Utils.escapeHtml(m.description)}</small>`;
      popupHtml += `<br><small style="color: #999;">${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}</small>`;
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
      marker.addTo(this._rrMapLayerGroup);
      bounds.push([m.lat, m.lon]);
    });
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        this._rrMap.setView(bounds[0], 14);
      } else {
        this._rrMap.fitBounds(bounds, { padding: [30, 30] });
      }
    }
  },

  /**
   * Show the import dialog with zone selection and TG list options
   * @param {Array} frequencies - frequencies to import as channels
   * @param {Array} talkgroups - talkgroups to import as contacts/TG list
   */
  _rrShowImportDialog(frequencies, talkgroups) {
    const existingZones = window.codeplug?.zones || [];
    const existingTGLists = window.codeplug?.tgLists || [];
    const hasDMR = frequencies.some(f => {
      const m = (f.mode || '').toLowerCase();
      return m === 'dmr' || m === 'dm' || m === 'tdma';
    });

    let content = '';

    // Zone selection (for frequencies)
    if (frequencies.length > 0) {
      content += `
        <p>Importing <strong>${frequencies.length}</strong> frequenc${frequencies.length === 1 ? 'y' : 'ies'} as channels.</p>
        <div class="form-group">
          <label class="form-label">Zone</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="rrZoneMode" value="new" checked onchange="document.getElementById('rrNewZoneGroup').style.display='';document.getElementById('rrExistingZoneGroup').style.display='none';">
              <span>Create New Zone</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="rrZoneMode" value="existing" ${existingZones.length === 0 ? 'disabled' : ''} onchange="document.getElementById('rrNewZoneGroup').style.display='none';document.getElementById('rrExistingZoneGroup').style.display='';">
              <span>Add to Existing Zone ${existingZones.length === 0 ? '(none available)' : ''}</span>
            </label>
          </div>
        </div>
        <div class="form-group" id="rrNewZoneGroup">
          <label class="form-label">Zone Name</label>
          <input type="text" class="form-input" id="rrNewZoneName" placeholder="Enter zone name..." maxlength="16" value="RR Import">
        </div>
        <div class="form-group" id="rrExistingZoneGroup" style="display: none;">
          <label class="form-label">Select Zone</label>
          <select class="form-select" id="rrExistingZone">
            ${existingZones.map(z => `<option value="${z.id}">${Utils.escapeHtml(z.name)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    // TG list options (for talkgroups or DMR channels)
    if (talkgroups.length > 0) {
      content += `
        <hr style="margin: 1rem 0;">
        <p>Importing <strong>${talkgroups.length}</strong> talkgroup${talkgroups.length === 1 ? '' : 's'} as contacts.</p>
        <div class="form-group">
          <label class="form-label">TG List</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="rrTGListMode" value="new" checked onchange="document.getElementById('rrNewTGGroup').style.display='';document.getElementById('rrExistingTGGroup').style.display='none';">
              <span>Create New TG List</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="rrTGListMode" value="existing" ${existingTGLists.length === 0 ? 'disabled' : ''} onchange="document.getElementById('rrNewTGGroup').style.display='none';document.getElementById('rrExistingTGGroup').style.display='';">
              <span>Add to Existing TG List ${existingTGLists.length === 0 ? '(none available)' : ''}</span>
            </label>
          </div>
        </div>
        <div class="form-group" id="rrNewTGGroup">
          <label class="form-label">TG List Name</label>
          <input type="text" class="form-input" id="rrNewTGListName" placeholder="Enter TG list name..." maxlength="16" value="RR Talkgroups">
        </div>
        <div class="form-group" id="rrExistingTGGroup" style="display: none;">
          <label class="form-label">Select TG List</label>
          <select class="form-select" id="rrExistingTGList">
            ${existingTGLists.map(tg => `<option value="${tg.id}">${Utils.escapeHtml(tg.name)} (${tg.contacts.length} contacts)</option>`).join('')}
          </select>
        </div>
      `;

      // If importing both frequencies and TGs, offer to apply TG list to DMR channels
      if (frequencies.length > 0 && hasDMR) {
        content += `
          <div class="form-group">
            <label class="radio-label">
              <input type="checkbox" id="rrApplyTGList" checked>
              <span>Apply TG list to imported DMR channels</span>
            </label>
          </div>
        `;
      }
    }

    this.showModal('Import from RadioReference', content, {
      confirmText: 'Import',
      wide: true,
      onConfirm: () => {
        this._rrDoImport(frequencies, talkgroups);
      }
    });
  },

  /**
   * Perform the actual import
   */
  _rrDoImport(frequencies, talkgroups) {
    let channelsImported = 0;
    let channelsSkipped = 0;
    let contactsAdded = 0;
    let tgListName = null;

    // Import talkgroups as contacts + TG list
    if (talkgroups.length > 0) {
      const tgMode = document.querySelector('input[name="rrTGListMode"]:checked')?.value || 'new';
      const contactNames = [];

      talkgroups.forEach(tg => {
        const tgId = tg.tgDec || tg.tgId;
        if (!tgId) return;

        // Check if contact already exists
        const existing = window.codeplug.contacts.find(c => c.dmrId === tgId);
        if (!existing) {
          try {
            let contactName = (tg.name || `TG ${tgId}`).substring(0, CONFIG.LIMITS.CONTACT_NAME_LEN);

            // Ensure unique name
            const existingNames = new Set([
              ...window.codeplug.contacts.map(c => c.name.toLowerCase()),
              ...contactNames.map(n => n.toLowerCase())
            ]);
            if (existingNames.has(contactName.toLowerCase())) {
              const suffix = `-${tgId}`;
              contactName = (tg.name || 'TG').substring(0, Math.max(1, CONFIG.LIMITS.CONTACT_NAME_LEN - suffix.length)) + suffix;
            }

            // Determine tsOverride from tgSlot
            let tsOverride = 'Disabled';
            const slot = String(tg.slot || '').trim();
            if (slot === '1' || slot === '2') {
              tsOverride = slot;
            }

            window.codeplug.addContact({
              name: contactName,
              dmrId: tgId,
              type: 'Group',
              tsOverride: tsOverride
            });
            contactsAdded++;
            contactNames.push(contactName);
          } catch (e) {
            console.error('Failed to add RR contact:', e);
          }
        } else {
          contactNames.push(existing.name);
        }
      });

      // Create or update TG list
      if (tgMode === 'new') {
        tgListName = (document.getElementById('rrNewTGListName')?.value?.trim() || 'RR TGs').substring(0, CONFIG.LIMITS.CONTACT_NAME_LEN);
        try {
          window.codeplug.addTGList({ name: tgListName, contacts: contactNames });
        } catch (e) {
          Utils.toast('Failed to create TG list: ' + e.message, 'error');
        }
      } else {
        const existingListId = document.getElementById('rrExistingTGList')?.value;
        const existingTGList = window.codeplug.tgLists.find(tg => tg.id === existingListId);
        if (existingTGList) {
          tgListName = existingTGList.name;
          const existingContactNames = new Set(existingTGList.contacts.map(c => c.toLowerCase()));
          const newContacts = contactNames.filter(n => !existingContactNames.has(n.toLowerCase()));
          if (newContacts.length > 0) {
            window.codeplug.updateTGList(existingListId, {
              contacts: [...existingTGList.contacts, ...newContacts]
            });
          }
        }
      }
    }

    // Import frequencies as channels
    if (frequencies.length > 0) {
      const zoneMode = document.querySelector('input[name="rrZoneMode"]:checked')?.value || 'new';
      let targetZone = null;

      if (zoneMode === 'new') {
        const zoneName = (document.getElementById('rrNewZoneName')?.value?.trim() || 'RR Import').substring(0, CONFIG.LIMITS.ZONE_NAME_LEN);
        try {
          targetZone = window.codeplug.addZone({ name: zoneName, channels: [] });
        } catch (e) {
          Utils.toast('Failed to create zone: ' + e.message, 'error');
        }
      } else {
        const zoneId = document.getElementById('rrExistingZone')?.value;
        targetZone = window.codeplug.zones.find(z => z.id === zoneId);
      }

      // Check if TG list should be applied to DMR channels
      const applyTGList = talkgroups.length > 0 && document.getElementById('rrApplyTGList')?.checked;

      // Auto-import TG contacts from DMR frequencies that have talkgroup data
      const freqTGContactNames = [];
      const freqHasTGs = frequencies.some(f => {
        const m = (f.mode || '').toLowerCase();
        const isDMR = m === 'dmr' || m === 'dm' || m === 'tdma' || f.colorCode;
        return isDMR && f.talkgroup;
      });
      let freqTGListName = null;
      if (freqHasTGs && !tgListName) {
        // Collect unique TGs from frequencies
        const tgMap = new Map();
        frequencies.forEach(f => {
          const m = (f.mode || '').toLowerCase();
          const isDMR = m === 'dmr' || m === 'dm' || m === 'tdma' || f.colorCode;
          if (isDMR && f.talkgroup) {
            const tgId = String(f.talkgroup);
            if (!tgMap.has(tgId)) {
              tgMap.set(tgId, { tgDec: tgId, name: f._tgName || f.alpha || `TG ${tgId}`, slot: f.slot || '' });
            }
          }
        });
        const freqTGs = Array.from(tgMap.values());

        freqTGs.forEach(tg => {
          const tgId = tg.tgDec;
          if (!tgId) return;
          const existing = window.codeplug.contacts.find(c => c.dmrId === tgId);
          if (!existing) {
            try {
              let contactName = (tg.name || `TG ${tgId}`).substring(0, CONFIG.LIMITS.CONTACT_NAME_LEN);
              const existingNames = new Set([
                ...window.codeplug.contacts.map(c => c.name.toLowerCase()),
                ...freqTGContactNames.map(n => n.toLowerCase())
              ]);
              if (existingNames.has(contactName.toLowerCase())) {
                const suffix = `-${tgId}`;
                contactName = (tg.name || 'TG').substring(0, Math.max(1, CONFIG.LIMITS.CONTACT_NAME_LEN - suffix.length)) + suffix;
                // If still not unique, append counter
                let counter = 2;
                while (existingNames.has(contactName.toLowerCase())) {
                  const cSuffix = `-${tgId}-${counter}`;
                  contactName = (tg.name || 'TG').substring(0, Math.max(1, CONFIG.LIMITS.CONTACT_NAME_LEN - cSuffix.length)) + cSuffix;
                  counter++;
                }
              }
              let tsOverride = 'Disabled';
              const slot = String(tg.slot || '').trim();
              if (slot === '1' || slot === '2') tsOverride = slot;
              window.codeplug.addContact({ name: contactName, dmrId: tgId, type: 'Group', tsOverride });
              contactsAdded++;
              freqTGContactNames.push(contactName);
            } catch (e) { console.error('Failed to add freq TG contact:', e); }
          } else {
            freqTGContactNames.push(existing.name);
          }
        });

        // Create TG list if multiple TGs
        if (freqTGContactNames.length > 1) {
          freqTGListName = (document.getElementById('rrNewZoneName')?.value?.trim() || 'RR Import').substring(0, CONFIG.LIMITS.CONTACT_NAME_LEN - 3) + ' TG';
          try {
            window.codeplug.addTGList({ name: freqTGListName, contacts: freqTGContactNames });
          } catch (e) { console.error('Failed to create freq TG list:', e); }
        }
      }

      frequencies.forEach(f => {
        if (window.codeplug.channels.length >= getEffectiveLimits().MAX_CHANNELS) return;

        const modeLower = (f.mode || '').toLowerCase();
        const isDMR = modeLower === 'dmr' || modeLower === 'dm' || modeLower === 'tdma' || f.colorCode;
        const isNFM = modeLower === 'nfm' || modeLower === 'fmn';
        const isAM = modeLower === 'am' || modeLower === 'a3e';
        const isBroadcast = modeLower === 'wfm' || modeLower === 'fm broadcast' || modeLower === 'broadcast';
        const channelName = Utils.truncate(f.alpha || f.callsign || f.description || `${f.frequency}`, CONFIG.LIMITS.CHANNEL_NAME_LEN);
        const rxFreq = parseFloat(f.frequency) || 0;
        const txFreq = parseFloat(f.inputFreq) || rxFreq;

        // Determine bandwidth: FM broadcast=25kHz, FM=25kHz, NFM/AM=12.5kHz
        const bandwidth = isDMR ? 12.5 : (isBroadcast ? 25 : (isNFM || isAM ? 12.5 : 25));

        // Convert tone to valid CTCSS or DCS format
        let txTone = 'None';
        if (!isDMR && f.tone) {
          txTone = Utils.normalizeRRTone(f.tone);
        }

        // Duplicate check by channel name + type
        const channelType = isDMR ? CONFIG.CHANNEL_TYPES.DIGITAL :
          isAM ? CONFIG.CHANNEL_TYPES.AM :
          isBroadcast ? CONFIG.CHANNEL_TYPES.FM_BROADCAST : CONFIG.CHANNEL_TYPES.ANALOG;
        const isDuplicate = window.codeplug.channels.some(ch =>
          ch.name === channelName && ch.type === channelType
        );

        if (isDuplicate) {
          channelsSkipped++;
          return;
        }

        // For DMR frequencies with a single TG, assign the contact directly
        let contactName = null;
        if (isDMR && f.talkgroup && freqTGContactNames.length === 1) {
          contactName = freqTGContactNames[0];
        } else if (isDMR && f.talkgroup) {
          // Find the matching contact name for this frequency's TG
          const tgId = String(f.talkgroup);
          contactName = window.codeplug.contacts.find(c => c.dmrId === tgId)?.name || null;
        }

        const channelData = {
          name: channelName,
          type: channelType,
          rxFreq: rxFreq,
          txFreq: txFreq,
          bandwidth: bandwidth,
          colorCode: parseInt(f.colorCode) || 1,
          timeslot: parseInt(f.slot) || 1,
          txTone: txTone,
          rxTone: 'None',
          contact: contactName,
          tgList: (isDMR && applyTGList && tgListName) ? tgListName :
                  (isDMR && freqTGListName) ? freqTGListName : null
        };

        const newChannel = window.codeplug.addChannel(channelData);
        channelsImported++;

        // Add to target zone
        if (targetZone && newChannel) {
          if (!targetZone.channels.includes(newChannel.name)) {
            targetZone.channels.push(newChannel.name);
          }
        }
      });

      // Update zone if modified
      if (targetZone) {
        window.codeplug.updateZone(targetZone.id, { channels: targetZone.channels });
      }
    }

    this.hideModal();
    this.updateOverview();
    this.renderZones();
    this.renderContactsTable();
    this.renderTGLists();
    this.renderChannelsTable();

    // Build result message
    const parts = [];
    if (channelsImported > 0) parts.push(`${channelsImported} channel${channelsImported !== 1 ? 's' : ''}`);
    if (channelsSkipped > 0) parts.push(`${channelsSkipped} duplicate${channelsSkipped !== 1 ? 's' : ''} skipped`);
    if (contactsAdded > 0) parts.push(`${contactsAdded} contact${contactsAdded !== 1 ? 's' : ''}`);
    if (tgListName) parts.push(`TG list "${tgListName}"`);

    Utils.toast(`Imported: ${parts.join(', ')}`, 'success');
  }
};

// Make UI available globally
window.UI = UI;

// Bind the DM32/UV008 flash tools once the DOM is ready (they live in the
// Radio Tools and Firmware sections).
document.addEventListener('DOMContentLoaded', () => UI.bindDM32Tools());
