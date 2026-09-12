/**
 * OpenGD77 CPS Web - Codeplug Data Model
 * 
 * This module handles the codeplug data structure, import/export, and validation.
 */

class Codeplug {
  constructor() {
    this.reset();
    this.modified = false;
    this.filename = null;
  }

  /**
   * Reset codeplug to empty state
   */
  reset() {
    // Use stored radio type from user selection, or default to MK22
    const radioType = Utils.getSavedRadioType() || CONFIG.RADIO_TYPES.MK22;
    
    this.general = {
      radioName: 'OpenGD77',
      radioType: radioType,
      dmrId: 0,
      callsign: '',
      infoLine1: '',
      infoLine2: '',
      // Boot settings
      bootScreenMode: 0,       // 0 = Default Image, 1 = Custom Text
      bootPasswordEnabled: false,
      bootPassword: '',
      // Display settings
      displayMode: 'Picture'   // 'Picture' or 'Text'
    };
    
    this.channels = [];
    this.contacts = [];
    this.tgLists = [];
    this.zones = [];
    this.aprs = [];
    this.dtmf = [];
    this.dtmfSettings = {
      selfId: '',
      killCode: '',
      wakeCode: '',
      delimiter: 13,
      groupCode: 14,
      decodeResp: 3,
      autoResetTimer: 10,
      killWakeDec: 0,
      killType: 0,
      pttidUpCode: '',
      pttidDownCode: '',
      respHoldTime: 0,
      decTime: 0,
      fstDigitDly: 0,
      fstDur: 0,
      otherDur: 0,
      rate: 0,
      tail: 0
    };
    this.scanLists = [];
    this.satellites = [];
    // VFO settings
    this.vfoA = {
      rxFreq: 145.500,
      txFreq: 145.500,
      type: 'Analogue',
      power: 'Master',
      bandwidth: 12.5,
      rxTone: 'None',
      txTone: 'None',
      squelch: 'Disabled',
      colorCode: 1,
      timeslot: 1,
      contact: null,
      contactIndex: 0,
      tgList: null,
      tgListIndex: 0,
      aprs: null,
      aprsIndex: 0,
      tot: 0,
      rxOnly: false,
      vox: 'Off',
      noBeep: false,
      noEco: false,
      forceDmo: false,
      ts1TalkerAliasTx: 'Off',
      ts2TalkerAliasTx: 'Off'
    };
    this.vfoB = {
      rxFreq: 433.500,
      txFreq: 433.500,
      type: 'Analogue',
      power: 'Master',
      bandwidth: 12.5,
      rxTone: 'None',
      txTone: 'None',
      squelch: 'Disabled',
      colorCode: 1,
      timeslot: 1,
      contact: null,
      contactIndex: 0,
      tgList: null,
      tgListIndex: 0,
      aprs: null,
      aprsIndex: 0,
      tot: 0,
      rxOnly: false,
      vox: 'Off',
      noBeep: false,
      noEco: false,
      forceDmo: false,
      ts1TalkerAliasTx: 'Off',
      ts2TalkerAliasTx: 'Off'
    };
    // Theme settings
    this.theme = {
      background: '#000080',
      foreground: '#FFFFFF',
      titleBackground: '#0000AA',
      titleText: '#FFFFFF',
      headerBackground: '#000040',
      headerText: '#FFFFFF',
      menuBackground: '#000080',
      menuText: '#FFFFFF',
      menuHighlightBackground: '#FFFFFF',
      menuHighlightText: '#000080'
    };
    // Band limits
    this.bandLimits = {
      vhfMin: 127000000,
      vhfMax: 180000000,
      uhfMin: 380000000,
      uhfMax: 564000000
    };
    
    this.modified = false;
    this.filename = null;
  }

  /**
   * Create a new channel with default values
   */
  createChannel(overrides = {}) {
    const num = this.channels.length + 1;
    return {
      id: Utils.generateId(),
      number: num,
      name: overrides.name || `Channel ${num}`,
      type: overrides.type || CONFIG.CHANNEL_TYPES.ANALOG,
      rxFreq: overrides.rxFreq || 145.500,
      txFreq: overrides.txFreq || 145.500,
      bandwidth: overrides.bandwidth || 12.5,
      colorCode: overrides.colorCode ?? 1,
      timeslot: overrides.timeslot || 1,
      contact: overrides.contact || null,
      tgList: overrides.tgList || null,
      dmrId: overrides.dmrId || 'None',
      overrideDmrId: overrides.overrideDmrId || 0,         // Override master DMR ID
      ts1TalkerAliasTx: overrides.ts1TalkerAliasTx || 'Off', // TS1 Talker Alias TX
      ts2TalkerAliasTx: overrides.ts2TalkerAliasTx || 'Off', // TS2 Talker Alias TX
      scanList: overrides.scanList || 'None',               // Scan list assignment
      forceDmo: overrides.forceDmo || false,               // Force DMO mode for DMR
      rxTone: overrides.rxTone || 'None',
      txTone: overrides.txTone || 'None',
      squelch: overrides.squelch || 'Disabled',
      power: overrides.power || 'Master',
      rxOnly: overrides.rxOnly || false,
      zoneSkip: overrides.zoneSkip || false,
      allSkip: overrides.allSkip || false,
      tot: overrides.tot || 0,
      vox: overrides.vox || 'Off',
      noBeep: overrides.noBeep || false,
      noEco: overrides.noEco || false,
      aprs: overrides.aprs || 'None',
      latitude: overrides.latitude || 0,
      longitude: overrides.longitude || 0,
      useLocation: overrides.useLocation || false
    };
  }

  /**
   * Add a channel
   */
  addChannel(channel) {
    if (this.channels.length >= getEffectiveLimits().MAX_CHANNELS) {
      throw new Error(`Maximum ${getEffectiveLimits().MAX_CHANNELS} channels allowed`);
    }
    const newChannel = this.createChannel(channel);
    this.channels.push(newChannel);
    this.modified = true;
    return newChannel;
  }

  /**
   * Update a channel
   */
  updateChannel(id, updates) {
    const index = this.channels.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Channel not found');
    
    this.channels[index] = { ...this.channels[index], ...updates };
    this.modified = true;
    return this.channels[index];
  }

  /**
   * Delete a channel
   */
  deleteChannel(id) {
    const index = this.channels.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Channel not found');
    
    this.channels.splice(index, 1);
    this.renumberChannels();
    this.modified = true;
  }

  /**
   * Renumber channels after deletion
   */
  renumberChannels() {
    this.channels.forEach((ch, i) => {
      ch.number = i + 1;
    });
  }

  /**
   * Create a new contact with default values
   */
  createContact(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New Contact',
      dmrId: overrides.dmrId || 0,
      type: overrides.type || CONFIG.CONTACT_TYPES.GROUP,
      tsOverride: overrides.tsOverride || 'Disabled'
    };
  }

  /**
   * Add a contact
   */
  addContact(contact) {
    if (this.contacts.length >= CONFIG.LIMITS.MAX_CONTACTS) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_CONTACTS} contacts allowed`);
    }
    const newContact = this.createContact(contact);
    this.contacts.push(newContact);
    this.modified = true;
    return newContact;
  }

  /**
   * Update a contact
   */
  updateContact(id, updates) {
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Contact not found');
    
    this.contacts[index] = { ...this.contacts[index], ...updates };
    this.modified = true;
    return this.contacts[index];
  }

  /**
   * Delete a contact
   */
  deleteContact(id) {
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Contact not found');
    
    this.contacts.splice(index, 1);
    this.modified = true;
  }

  /**
   * Find contact by name
   */
  findContactByName(name) {
    return this.contacts.find(c => c.name === name);
  }

  /**
   * Create a new TG list with default values
   */
  createTGList(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New TG List',
      contacts: overrides.contacts || []
    };
  }

  /**
   * Add a TG list
   */
  addTGList(tgList) {
    if (this.tgLists.length >= CONFIG.LIMITS.MAX_TGLISTS) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_TGLISTS} TG lists allowed`);
    }
    const newTGList = this.createTGList(tgList);
    this.tgLists.push(newTGList);
    this.modified = true;
    return newTGList;
  }

  /**
   * Update a TG list
   */
  updateTGList(id, updates) {
    const index = this.tgLists.findIndex(t => t.id === id);
    if (index === -1) throw new Error('TG List not found');
    
    this.tgLists[index] = { ...this.tgLists[index], ...updates };
    this.modified = true;
    return this.tgLists[index];
  }

  /**
   * Delete a TG list
   */
  deleteTGList(id) {
    const index = this.tgLists.findIndex(t => t.id === id);
    if (index === -1) throw new Error('TG List not found');
    
    this.tgLists.splice(index, 1);
    this.modified = true;
  }

  /**
   * Create a new zone with default values
   */
  createZone(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New Zone',
      channels: overrides.channels || []
    };
  }

  /**
   * Add a zone
   */
  addZone(zone) {
    if (this.zones.length >= CONFIG.LIMITS.MAX_ZONES) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_ZONES} zones allowed`);
    }
    const newZone = this.createZone(zone);
    this.zones.push(newZone);
    this.modified = true;
    return newZone;
  }

  /**
   * Update a zone
   */
  updateZone(id, updates) {
    const index = this.zones.findIndex(z => z.id === id);
    if (index === -1) throw new Error('Zone not found');
    
    this.zones[index] = { ...this.zones[index], ...updates };
    this.modified = true;
    return this.zones[index];
  }

  /**
   * Delete a zone
   */
  deleteZone(id) {
    const index = this.zones.findIndex(z => z.id === id);
    if (index === -1) throw new Error('Zone not found');
    
    this.zones.splice(index, 1);
    this.modified = true;
  }

  /**
   * Create a new scan list with default values
   */
  createScanList(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New Scan List',
      channels: overrides.channels || [],
      priorityCh1: overrides.priorityCh1 || 'None',
      priorityCh2: overrides.priorityCh2 || 'None',
      txDesignatedCh: overrides.txDesignatedCh || 'Last Active',
      signalingHold: overrides.signalingHold || 500,
      prioritySample: overrides.prioritySample || 2000,
      talkback: overrides.talkback || false,
      plType: overrides.plType || 0  // 0=Non-Priority, 1=Disable, 2=Priority, 3=Priority+Non-Priority
    };
  }

  /**
   * Add a scan list
   */
  addScanList(scanList) {
    if (this.scanLists.length >= CONFIG.LIMITS.MAX_SCAN_LISTS) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_SCAN_LISTS} scan lists allowed`);
    }
    const newScanList = this.createScanList(scanList);
    this.scanLists.push(newScanList);
    this.modified = true;
    return newScanList;
  }

  /**
   * Update a scan list
   */
  updateScanList(id, updates) {
    const index = this.scanLists.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Scan list not found');
    
    this.scanLists[index] = { ...this.scanLists[index], ...updates };
    this.modified = true;
    return this.scanLists[index];
  }

  /**
   * Delete a scan list
   */
  deleteScanList(id) {
    const index = this.scanLists.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Scan list not found');
    
    this.scanLists.splice(index, 1);
    this.modified = true;
  }

  /**
   * Create a new DTMF contact with default values
   */
  createDTMF(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New DTMF',
      code: overrides.code || ''
    };
  }

  /**
   * Add a DTMF contact
   */
  addDTMF(dtmfContact) {
    if (this.dtmf.length >= CONFIG.LIMITS.MAX_DTMF) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_DTMF} DTMF contacts allowed`);
    }
    const newDtmf = this.createDTMF(dtmfContact);
    this.dtmf.push(newDtmf);
    this.modified = true;
    return newDtmf;
  }

  /**
   * Update a DTMF contact
   */
  updateDTMF(id, updates) {
    const index = this.dtmf.findIndex(d => d.id === id);
    if (index === -1) throw new Error('DTMF contact not found');
    
    this.dtmf[index] = { ...this.dtmf[index], ...updates };
    this.modified = true;
    return this.dtmf[index];
  }

  /**
   * Delete a DTMF contact
   */
  deleteDTMF(id) {
    const index = this.dtmf.findIndex(d => d.id === id);
    if (index === -1) throw new Error('DTMF contact not found');
    
    this.dtmf.splice(index, 1);
    this.modified = true;
  }

  /**
   * Create a new APRS config
   */
  createAPRS(overrides = {}) {
    return {
      id: Utils.generateId(),
      name: overrides.name || 'New APRS',
      ssid: overrides.ssid || 9,
      via1: overrides.via1 || 'WIDE1',
      via1SSID: overrides.via1SSID !== undefined ? overrides.via1SSID : (overrides.via1Ssid !== undefined ? overrides.via1Ssid : 1),
      via2: overrides.via2 || 'WIDE2',
      via2SSID: overrides.via2SSID !== undefined ? overrides.via2SSID : (overrides.via2Ssid !== undefined ? overrides.via2Ssid : 1),
      iconTable: overrides.iconTable || 0,
      iconIndex: overrides.iconIndex !== undefined ? overrides.iconIndex : (overrides.icon !== undefined ? overrides.icon : 24),
      comment: overrides.comment || '',
      positionMasking: overrides.positionMasking !== undefined ? overrides.positionMasking : (overrides.ambiguity !== undefined ? overrides.ambiguity : 0),
      usePosition: overrides.usePosition || false,
      latitude: overrides.latitude || 0,
      longitude: overrides.longitude || 0,
      txFreq: overrides.txFreq !== undefined ? overrides.txFreq : (overrides.txFrequency !== undefined ? overrides.txFrequency : ''),
      transmitQsy: overrides.transmitQsy || false,
      beaconSilent: overrides.beaconSilent || false,
      baudRate: overrides.baudRate || 0
    };
  }

  /**
   * Add APRS config
   */
  addAPRS(aprs) {
    if (this.aprs.length >= CONFIG.LIMITS.MAX_APRS_CONFIGS) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_APRS_CONFIGS} APRS configs allowed`);
    }
    const newAprs = this.createAPRS(aprs);
    this.aprs.push(newAprs);
    this.modified = true;
    return newAprs;
  }

  /**
   * Update an APRS config
   */
  updateAPRS(id, updates) {
    const index = this.aprs.findIndex(a => a.id === id);
    if (index === -1) throw new Error('APRS config not found');

    this.aprs[index] = { ...this.aprs[index], ...updates };
    this.modified = true;
    return this.aprs[index];
  }

  /**
   * Delete an APRS config
   */
  deleteAPRS(id) {
    const index = this.aprs.findIndex(a => a.id === id);
    if (index === -1) throw new Error('APRS config not found');

    this.aprs.splice(index, 1);
    this.modified = true;
  }

  /**
   * Create a new satellite with default values
   * Based on KepAndSatData.cs format
   */
  createSatellite(overrides = {}) {
    return {
      id: Utils.generateId(),
      catalogueNumber: overrides.catalogueNumber || '',
      name: Utils.truncate(overrides.name || 'New Sat', CONFIG.LIMITS.SATELLITE_NAME_LEN),
      rx1: overrides.rx1 || 0,
      tx1: overrides.tx1 || 0,
      txCtcss: overrides.txCtcss || 0,
      armCtcss: overrides.armCtcss || 0,
      rx2: overrides.rx2 || 0,
      tx2: overrides.tx2 || 0,
      rx3: overrides.rx3 || 0,
      tx3: overrides.tx3 || 0,
      aprsConfig: overrides.aprsConfig || '',
      tle: overrides.tle || null  // TLE data when fetched
    };
  }

  /**
   * Add a satellite
   */
  addSatellite(satellite) {
    if (this.satellites.length >= CONFIG.LIMITS.MAX_SATELLITES) {
      throw new Error(`Maximum ${CONFIG.LIMITS.MAX_SATELLITES} satellites allowed`);
    }
    const newSatellite = this.createSatellite(satellite);
    this.satellites.push(newSatellite);
    this.modified = true;
    return newSatellite;
  }

  /**
   * Update a satellite
   */
  updateSatellite(id, updates) {
    const index = this.satellites.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Satellite not found');
    
    this.satellites[index] = { ...this.satellites[index], ...updates };
    this.modified = true;
    return this.satellites[index];
  }

  /**
   * Delete a satellite
   */
  deleteSatellite(id) {
    const index = this.satellites.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Satellite not found');
    
    this.satellites.splice(index, 1);
    this.modified = true;
  }

  /**
   * Load default satellites from CONFIG
   */
  loadDefaultSatellites() {
    this.satellites = [];
    for (const sat of CONFIG.DEFAULT_SATELLITES) {
      this.addSatellite({ ...sat });
    }
    this.modified = true;
    return this.satellites.length;
  }

  /**
   * Find satellite by catalogue number
   */
  findSatelliteByCatalogueNumber(catalogueNumber) {
    return this.satellites.find(s => s.catalogueNumber === catalogueNumber);
  }

  /**
   * Import satellites from CSV (OpenGD77 format)
   */
  importSatellitesCSV(csvText) {
    const lines = csvText.trim().split('\n');
    let imported = 0;
    
    for (const line of lines) {
      if (this.satellites.length >= CONFIG.LIMITS.MAX_SATELLITES) break;
      if (!line.trim() || line.startsWith('Cat')) continue; // Skip header or empty lines
      
      const parts = line.split(',');
      if (parts.length < 10) continue;
      
      const satellite = this.createSatellite({
        catalogueNumber: parts[0].trim(),
        name: Utils.truncate(parts[1].trim(), CONFIG.LIMITS.SATELLITE_NAME_LEN),
        rx1: parseFloat(parts[2].trim()) || 0,
        tx1: parseFloat(parts[3].trim()) || 0,
        txCtcss: parseFloat(parts[4].trim()) || 0,
        armCtcss: parseFloat(parts[5].trim()) || 0,
        rx2: parseFloat(parts[6].trim()) || 0,
        tx2: parseFloat(parts[7].trim()) || 0,
        rx3: parseFloat(parts[8].trim()) || 0,
        tx3: parseFloat(parts[9].trim()) || 0,
        aprsConfig: parts[10] ? parts[10].trim() : ''
      });
      
      this.satellites.push(satellite);
      imported++;
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export satellites to CSV (OpenGD77 format)
   * Header matches OpenGD77 CPS satellites.txt format for compatibility
   */
  exportSatellitesCSV() {
    const header = 'Cat #,Name,Rx1,Tx1,CTCSS,ArmCTCSS,Rx2,Tx2,Rx3,Tx3,APRS Config';
    const rows = this.satellites.map(sat => {
      return [
        sat.catalogueNumber,
        sat.name,
        sat.rx1 ? sat.rx1.toFixed(3) : '0',
        sat.tx1 ? sat.tx1.toFixed(3) : '0',
        sat.txCtcss || 0,
        sat.armCtcss || 0,
        sat.rx2 ? sat.rx2.toFixed(3) : '0',
        sat.tx2 ? sat.tx2.toFixed(3) : '0',
        sat.rx3 ? sat.rx3.toFixed(3) : '0',
        sat.tx3 ? sat.tx3.toFixed(3) : '0',
        sat.aprsConfig || ''
      ].join(',');
    });
    
    return [header, ...rows].join('\n');
  }

  /**
   * Import channels from CSV
   */
  importChannelsCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;
    
    for (const row of rows) {
      if (this.channels.length >= getEffectiveLimits().MAX_CHANNELS) break;
      
      const channel = this.createChannel({
        name: Utils.truncate(row['Channel Name'] || '', CONFIG.LIMITS.CHANNEL_NAME_LEN),
        type: row['Channel Type'] === 'Digital' ? CONFIG.CHANNEL_TYPES.DIGITAL : CONFIG.CHANNEL_TYPES.ANALOG,
        rxFreq: Utils.parseFrequency(row['Rx Frequency']),
        txFreq: Utils.parseFrequency(row['Tx Frequency']),
        bandwidth: parseFloat(row['Bandwidth (kHz)']) || 12.5,
        colorCode: parseInt(row['Colour Code']) || 0,
        timeslot: parseInt(row['Timeslot']) || 1,
        contact: row['Contact'] || null,
        tgList: row['TG List'] || null,
        rxTone: row['RX Tone'] || 'None',
        txTone: row['TX Tone'] || 'None',
        squelch: row['Squelch'] || 'Disabled',
        power: row['Power'] || 'Master',
        rxOnly: row['Rx Only'] === 'Yes',
        zoneSkip: row['Zone Skip'] === 'Yes',
        allSkip: row['All Skip'] === 'Yes',
        tot: parseInt(row['TOT']) || 0,
        vox: row['VOX'] || 'Off',
        noBeep: row['No Beep'] === 'Yes',
        noEco: row['No Eco'] === 'Yes',
        aprs: row['APRS'] || 'None',
        latitude: parseFloat(row['Latitude']) || 0,
        longitude: parseFloat(row['Longitude']) || 0,
        useLocation: row['Use Location'] === 'Yes'
      });
      
      this.channels.push(channel);
      imported++;
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Parse a CHIRP-formatted CSV and return filtered rows (DMR and NFM only)
   * Supports headers: Name/Alpha Tag, Mode, Frequency
   * Returns individual entries and auto-merge suggestions for same name+mode pairs
   */
  parseChirpCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    
    // Validate CSV format - support Name or Alpha Tag as the name column
    const trimmedHeaders = headers.map(x => x.trim());
    const hasName = trimmedHeaders.includes('Name') || trimmedHeaders.includes('Alpha Tag');
    const hasMode = trimmedHeaders.includes('Mode');
    const hasFreq = trimmedHeaders.includes('Frequency');
    if (!hasName || !hasMode || !hasFreq) {
      throw new Error('Not a valid CSV. Required headers: Name (or Alpha Tag), Mode, Frequency');
    }
    
    const nameCol = trimmedHeaders.includes('Name') ? 'Name' : 'Alpha Tag';
    
    // Filter only DMR and NFM modes
    const filtered = rows.filter(row => {
      const mode = (row['Mode'] || '').trim().toUpperCase();
      return mode === 'DMR' || mode === 'NFM';
    });
    
    // Map to standardized entries
    const entries = filtered.map(row => ({
      originalName: (row[nameCol] || '').trim(),
      name: Utils.abbreviateName((row[nameCol] || '').trim(), CONFIG.LIMITS.CHANNEL_NAME_LEN),
      mode: (row['Mode'] || '').trim().toUpperCase(),
      frequency: parseFloat(row['Frequency']) || 0,
      comment: (row['Comment'] || '').trim()
    }));
    
    // Group by name + mode for merge suggestions
    const groups = {};
    entries.forEach((entry, idx) => {
      const key = `${entry.name}\0${entry.mode}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(idx);
    });
    
    // Generate merge suggestions from groups with 2+ entries
    const suggestions = [];
    for (const indices of Object.values(groups)) {
      for (let i = 0; i + 1 < indices.length; i += 2) {
        suggestions.push({ entryA: indices[i], entryB: indices[i + 1] });
      }
    }
    
    return { entries, suggestions };
  }

  /**
   * Parse a frequency licence JSON (ukafg format) and return filtered entries + suggestions
   * Filters only DMR and NFM modes. Groups by company+mode+licence for merge suggestions.
   */
  parseFrequencyJSON(jsonText) {
    let json;
    try {
      json = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('Invalid JSON file');
    }
    
    const results = json?.data?.results || json?.results || [];
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('No frequency results found in JSON');
    }
    
    // Filter only DMR and NFM modes
    const filtered = results.filter(r => {
      const mode = (r.mode || '').trim().toUpperCase();
      return mode === 'DMR' || mode === 'NFM';
    });
    
    // Map to standardized entries
    const entries = filtered.map(r => ({
      originalName: (r.company || '').trim(),
      name: Utils.abbreviateName((r.company || '').trim(), CONFIG.LIMITS.CHANNEL_NAME_LEN),
      mode: (r.mode || '').trim().toUpperCase(),
      frequency: parseFloat(r.frequency) || 0,
      comment: (r.address || '').trim(),
      lat: parseFloat(r.lat) || 0,
      lng: parseFloat(r.lng) || 0,
      licence: (r.licence || '').trim()
    }));
    
    // Group by company + mode + licence for merge suggestions
    const groups = {};
    entries.forEach((entry, idx) => {
      const key = `${entry.name}\0${entry.mode}\0${entry.licence}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(idx);
    });
    
    // Generate merge suggestions from groups with 2+ entries
    const suggestions = [];
    for (const indices of Object.values(groups)) {
      for (let i = 0; i + 1 < indices.length; i += 2) {
        suggestions.push({ entryA: indices[i], entryB: indices[i + 1] });
      }
    }
    
    return { entries, suggestions };
  }

  /**
   * Parse a Radio Reference UK CSV and return filtered rows (DMR, FM & NFM)
   * Uses TX/RX column to auto-pair RX/TX by licence number.
   * Supports Lat/Long positions, CC/RAN/NAC colour codes and CTCSS/DCS tones.
   * Bandwidth: DMR 12.5kHz, FM 25kHz, NFM 12.5kHz.
   */
  parseRadioReferenceUKCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);

    const trimmedHeaders = headers.map(x => x.trim());
    const hasLicence = trimmedHeaders.includes('Licence');
    const hasUser = trimmedHeaders.includes('User');
    const hasFreq = trimmedHeaders.includes('Frequency');
    const hasMode = trimmedHeaders.includes('Mode');
    const hasTxRx = trimmedHeaders.includes('TX/RX');
    if (!hasLicence || !hasUser || !hasFreq || !hasMode || !hasTxRx) {
      throw new Error('Not a valid Radio Reference UK CSV. Required: Licence, User, Frequency, Mode, TX/RX');
    }

    // Filter DMR, FM and NFM modes
    const filtered = rows.filter(row => {
      const mode = (row['Mode'] || '').trim().toUpperCase();
      return mode === 'DMR' || mode === 'FM' || mode === 'NFM';
    });

    // Map to standardized entries
    const entries = filtered.map(row => {
      const mode = (row['Mode'] || '').trim().toUpperCase();

      // Parse colour code from CC/RAN/NAC (e.g. "CC2" → 2)
      let colorCode = 0;
      const ccStr = (row['CC/RAN/NAC'] || '').trim();
      const ccMatch = ccStr.match(/^CC(\d+)/i);
      if (ccMatch) colorCode = parseInt(ccMatch[1]) || 0;

      // Parse CTCSS/DCS tone
      const tone = Utils.normalizeCTCSS((row['CTCSS/DCS'] || '').trim());

      return {
        originalName: (row['User'] || '').trim(),
        name: Utils.abbreviateName((row['User'] || '').trim(), CONFIG.LIMITS.CHANNEL_NAME_LEN),
        mode: mode,
        frequency: parseFloat(row['Frequency']) || 0,
        txrx: (row['TX/RX'] || '').trim().toUpperCase(),
        lat: parseFloat(row['Lat']) || 0,
        lng: parseFloat(row['Long']) || 0,
        comment: (row['Place'] || '').trim(),
        licence: (row['Licence'] || '').trim(),
        colorCode: colorCode,
        tone: tone,
        bw: mode === 'FM' ? 25 : 12.5
      };
    });

    // Group by licence + mode, then pair R and T entries for merge suggestions
    const groups = {};
    entries.forEach((entry, idx) => {
      const key = `${entry.licence}\0${entry.mode}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(idx);
    });

    const suggestions = [];
    for (const indices of Object.values(groups)) {
      const rIndices = indices.filter(i => entries[i].txrx === 'R');
      const tIndices = indices.filter(i => entries[i].txrx === 'T');
      const pairs = Math.min(rIndices.length, tIndices.length);
      for (let i = 0; i < pairs; i++) {
        suggestions.push({ entryA: rIndices[i], entryB: tIndices[i] });
      }
    }

    return { entries, suggestions };
  }

  /**
   * Import channels from parsed CHIRP data (after merge/review)
   * Each item should have: name, mode, rxFreq, txFreq
   * Optional: colorCode, tone (CTCSS/DCS)
   */
  importChirpChannels(channels) {
    let imported = 0;
    
    for (const ch of channels) {
      if (this.channels.length >= getEffectiveLimits().MAX_CHANNELS) break;
      
      const isDMR = ch.mode === 'DMR';
      const channelData = {
        name: Utils.truncate(ch.name || '', CONFIG.LIMITS.CHANNEL_NAME_LEN),
        type: isDMR ? CONFIG.CHANNEL_TYPES.DIGITAL : CONFIG.CHANNEL_TYPES.ANALOG,
        rxFreq: ch.rxFreq || 0,
        txFreq: ch.txFreq || ch.rxFreq || 0,
        bandwidth: ch.bw || 12.5
      };
      
      // Apply colour code for DMR channels
      if (isDMR && ch.colorCode) {
        channelData.colorCode = ch.colorCode;
      }
      
      // Apply CTCSS/DCS tone
      if (ch.tone && ch.tone !== 'None') {
        channelData.txTone = ch.tone;
      }
      
      if (ch.lat != null && ch.lng != null && (ch.lat !== 0 || ch.lng !== 0)) {
        channelData.latitude = ch.lat;
        channelData.longitude = ch.lng;
        channelData.useLocation = true;
      }
      
      const channel = this.createChannel(channelData);
      
      this.channels.push(channel);
      imported++;
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export channels to CSV
   */
  exportChannelsCSV() {
    const headers = [
      'Channel Number', 'Channel Name', 'Channel Type', 'Rx Frequency', 'Tx Frequency',
      'Bandwidth (kHz)', 'Colour Code', 'Timeslot', 'Contact', 'TG List', 'DMR ID',
      'TS1_TA_Tx', 'TS2_TA_Tx ID', 'RX Tone', 'TX Tone', 'Squelch', 'Power',
      'Rx Only', 'Zone Skip', 'All Skip', 'TOT', 'VOX', 'No Beep', 'No Eco',
      'APRS', 'Latitude', 'Longitude', 'Use Location'
    ];
    
    const rows = this.channels.map(ch => ({
      'Channel Number': ch.number,
      'Channel Name': ch.name,
      'Channel Type': ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? 'Digital' : 'Analogue',
      'Rx Frequency': '\t' + Utils.formatFrequency(ch.rxFreq),
      'Tx Frequency': '\t' + Utils.formatFrequency(ch.txFreq),
      'Bandwidth (kHz)': ch.type === CONFIG.CHANNEL_TYPES.ANALOG ? ch.bandwidth : '',
      'Colour Code': ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? ch.colorCode : '',
      'Timeslot': ch.type === CONFIG.CHANNEL_TYPES.DIGITAL ? ch.timeslot : '',
      'Contact': ch.contact || '',
      'TG List': ch.tgList || 'None',
      'DMR ID': ch.dmrId || 'None',
      'TS1_TA_Tx': 'Off',
      'TS2_TA_Tx ID': 'Off',
      'RX Tone': ch.rxTone,
      'TX Tone': ch.txTone,
      'Squelch': ch.squelch,
      'Power': ch.power,
      'Rx Only': ch.rxOnly ? 'Yes' : 'No',
      'Zone Skip': ch.zoneSkip ? 'Yes' : 'No',
      'All Skip': ch.allSkip ? 'Yes' : 'No',
      'TOT': ch.tot,
      'VOX': ch.vox,
      'No Beep': ch.noBeep ? 'Yes' : 'No',
      'No Eco': ch.noEco ? 'Yes' : 'No',
      'APRS': ch.aprs || 'None',
      'Latitude': ch.latitude,
      'Longitude': ch.longitude,
      'Use Location': ch.useLocation ? 'Yes' : 'No'
    }));
    
    return Utils.toCSV(headers, rows);
  }

  /**
   * Import contacts from CSV
   */
  importContactsCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;
    
    for (const row of rows) {
      if (this.contacts.length >= CONFIG.LIMITS.MAX_CONTACTS) break;
      
      // Determine contact type
      let type = CONFIG.CONTACT_TYPES.GROUP;
      if (row['ID Type'] === 'Private') type = CONFIG.CONTACT_TYPES.PRIVATE;
      if (row['ID Type'] === 'AllCall') type = CONFIG.CONTACT_TYPES.ALLCALL;
      
      const contact = this.createContact({
        name: Utils.truncate(row['Contact Name'] || '', CONFIG.LIMITS.CONTACT_NAME_LEN),
        dmrId: parseInt(row['ID']) || 0,
        type: type,
        tsOverride: row['TS Override'] || 'Disabled'
      });
      
      this.contacts.push(contact);
      imported++;
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export contacts to CSV
   */
  exportContactsCSV() {
    const headers = ['Contact Name', 'ID', 'ID Type', 'TS Override'];
    
    const rows = this.contacts.map(c => ({
      'Contact Name': c.name,
      'ID': c.dmrId,
      'ID Type': c.type,
      'TS Override': c.tsOverride
    }));
    
    return Utils.toCSV(headers, rows);
  }

  /**
   * Import TG lists from CSV
   */
  importTGListsCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;
    
    for (const row of rows) {
      if (this.tgLists.length >= CONFIG.LIMITS.MAX_TGLISTS) break;
      
      const contacts = [];
      for (let i = 1; i <= CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST; i++) {
        const contactName = row[`Contact${i}`];
        if (contactName && contactName.trim()) {
          contacts.push(contactName.trim());
        }
      }
      
      if (row['TG List Name']) {
        const tgList = this.createTGList({
          name: Utils.truncate(row['TG List Name'], CONFIG.LIMITS.TGLIST_NAME_LEN),
          contacts: contacts
        });
        
        this.tgLists.push(tgList);
        imported++;
      }
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export TG lists to CSV
   */
  exportTGListsCSV() {
    const headers = ['TG List Name'];
    for (let i = 1; i <= CONFIG.LIMITS.MAX_CONTACTS_PER_TGLIST; i++) {
      headers.push(`Contact${i}`);
    }
    
    const rows = this.tgLists.map(tg => {
      const row = { 'TG List Name': tg.name };
      tg.contacts.forEach((contact, i) => {
        row[`Contact${i + 1}`] = contact;
      });
      return row;
    });
    
    return Utils.toCSV(headers, rows);
  }

  /**
   * Import zones from CSV
   */
  importZonesCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;
    
    for (const row of rows) {
      if (this.zones.length >= CONFIG.LIMITS.MAX_ZONES) break;
      
      const channels = [];
      for (let i = 1; i <= getEffectiveLimits().MAX_CHANNELS_PER_ZONE; i++) {
        const channelName = row[`Channel${i}`];
        if (channelName && channelName.trim()) {
          channels.push(channelName.trim());
        }
      }
      
      if (row['Zone Name']) {
        const zone = this.createZone({
          name: Utils.truncate(row['Zone Name'], CONFIG.LIMITS.ZONE_NAME_LEN),
          channels: channels
        });
        
        this.zones.push(zone);
        imported++;
      }
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export zones to CSV
   */
  exportZonesCSV() {
    const headers = ['Zone Name'];
    for (let i = 1; i <= getEffectiveLimits().MAX_CHANNELS_PER_ZONE; i++) {
      headers.push(`Channel${i}`);
    }
    
    const rows = this.zones.map(z => {
      const row = { 'Zone Name': z.name };
      z.channels.forEach((channel, i) => {
        row[`Channel${i + 1}`] = channel;
      });
      return row;
    });
    
    return Utils.toCSV(headers, rows);
  }

  /**
   * Import APRS from CSV
   */
  importAPRSCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;
    
    for (const row of rows) {
      if (this.aprs.length >= CONFIG.LIMITS.MAX_APRS_CONFIGS) break;
      
      const aprs = this.createAPRS({
        name: row['APRS config Name'] || '',
        ssid: (() => { const v = parseInt(row['SSID'], 10); return Number.isFinite(v) ? v : 9; })(),
        via1: row['Via1'] || 'WIDE1',
        via1SSID: parseInt(row['Via1 SSID']) || 1,
        via2: row['Via2'] || 'WIDE2',
        via2SSID: parseInt(row['Via2 SSID']) || 1,
        iconTable: parseInt(row['Icon table']) || 0,
        iconIndex: parseInt(row['Icon']) || 24,
        comment: row['Comment text'] || '',
        positionMasking: parseInt(row['Position masking'] || row['Ambiguity']) || 0,
        usePosition: row['Use position'] === 'True',
        latitude: parseFloat(row['Latitude']) || 0,
        longitude: parseFloat(row['Longitude']) || 0,
        txFreq: row['TX Frequency'] || '',
        transmitQsy: row['Transmit QSY'] === 'True',
        baudRate: parseInt(row['Baud rate setting']) || 0,
        beaconSilent: row['Beacon silent'] === 'True'
      });
      
      this.aprs.push(aprs);
      imported++;
    }
    
    this.modified = true;
    return imported;
  }

  /**
   * Export APRS configs to CSV
   */
  exportAPRSCSV() {
    const headers = [
      'APRS config Name', 'SSID', 'Via1', 'Via1 SSID', 'Via2', 'Via2 SSID',
      'Icon table', 'Icon', 'Comment text', 'Position masking', 'Use position',
      'Latitude', 'Longitude', 'TX Frequency', 'Transmit QSY', 'Baud rate setting',
      'Beacon silent'
    ];
    
    const rows = this.aprs.map(a => ({
      'APRS config Name': a.name || '',
      'SSID': (a.ssid ?? 9),
      'Via1': a.via1 || 'WIDE1',
      'Via1 SSID': a.via1SSID !== undefined ? a.via1SSID : (a.via1Ssid || 1),
      'Via2': a.via2 || 'WIDE2',
      'Via2 SSID': a.via2SSID !== undefined ? a.via2SSID : (a.via2Ssid || 1),
      'Icon table': a.iconTable || 0,
      'Icon': a.iconIndex !== undefined ? a.iconIndex : (a.icon || 24),
      'Comment text': a.comment || '',
      'Position masking': a.positionMasking !== undefined ? a.positionMasking : (a.ambiguity || 0),
      'Use position': a.usePosition ? 'True' : 'False',
      'Latitude': a.latitude || 0,
      'Longitude': a.longitude || 0,
      'TX Frequency': a.txFreq !== undefined ? a.txFreq : (a.txFrequency || ''),
      'Transmit QSY': a.transmitQsy ? 'True' : 'False',
      'Baud rate setting': a.baudRate || 0,
      'Beacon silent': a.beaconSilent ? 'True' : 'False'
    }));
    
    return Utils.toCSV(headers, rows);
  }

  /**
   * Import DTMF contacts from CSV
   */
  importDTMFCSV(csvText) {
    const { headers, rows } = Utils.parseCSV(csvText);
    let imported = 0;

    // Ensure dtmf is an array for contacts
    if (!Array.isArray(this.dtmf)) {
      this.dtmf = [];
    }

    for (const row of rows) {
      if (this.dtmf.length >= CONFIG.LIMITS.MAX_DTMF) break;

      const name = row['Contact Name'] || row['Name'] || '';
      const code = row['Code'] || '';
      if (!name && !code) continue;

      const dtmf = this.createDTMF({ name, code });
      this.dtmf.push(dtmf);
      imported++;
    }

    this.modified = true;
    return imported;
  }

  /**
   * Export DTMF contacts to CSV
   */
  exportDTMFCSV() {
    const headers = ['Contact Name', 'Code'];
    const dtmfArray = Array.isArray(this.dtmf) ? this.dtmf : [];

    const rows = dtmfArray.map(d => ({
      'Contact Name': d.name || '',
      'Code': d.code || ''
    }));

    return Utils.toCSV(headers, rows);
  }

  /**
   * Import codeplug from G77 binary file
   * @param {ArrayBuffer} buffer - The G77 file data
   * @returns {Object} Stats about imported data
   */
  importG77(buffer) {
    // Parse the G77 binary data
    const parsed = G77.parse(buffer);
    
    // Resolve all references (contacts in channels, channels in zones, etc.)
    G77.resolveReferences(parsed);
    
    // Import general settings, but preserve current radio type if parsed type is invalid
    // This respects user's radio type selection instead of overriding it
    const currentRadioType = this.general.radioType;
    this.general = {
      ...this.general,
      ...parsed.general
    };
    // If parsed radioType is null/invalid, use current type (from user selection or connection)
    if (!Utils.isValidRadioType(this.general.radioType)) {
      this.general.radioType = Utils.getValidRadioTypeOrDefault(currentRadioType);
    }
    
    // Import contacts
    this.contacts = parsed.contacts.map(c => ({
      id: Utils.generateId(),
      name: c.name,
      dmrId: c.dmrId,
      type: c.type,
      tsOverride: c.tsOverride
    }));
    
    // Import channels - numbers will be assigned by renumberChannels()
    // Zone references use channel names, so renumbering is safe
    this.channels = parsed.channels.map((ch) => ({
      id: Utils.generateId(),
      number: 0,  // Will be set by renumberChannels
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
    }));
    
    // Renumber channels
    this.renumberChannels();
    
    // Import TG lists
    this.tgLists = parsed.tgLists.map(tg => ({
      id: Utils.generateId(),
      name: tg.name,
      contacts: tg.contacts || []
    }));
    
    // Import zones
    this.zones = parsed.zones.map(z => ({
      id: Utils.generateId(),
      name: z.name,
      channels: z.channels || []
    }));
    
    // Import APRS configs
    this.aprs = parsed.aprs || [];
    
    // Import scan lists
    this.scanLists = parsed.scanLists || [];
    
    // Import DTMF settings (binary parser returns settings object)
    if (parsed.dtmf && !Array.isArray(parsed.dtmf)) {
      this.dtmfSettings = parsed.dtmf;
    }

    // Import DTMF contacts
    this.dtmf = (parsed.dtmfContacts || []).map(d => ({
      id: Utils.generateId(),
      name: d.name,
      code: d.code
    }));
    
    // Import VFO settings
    this.vfoA = parsed.vfoA || this.vfoA;
    this.vfoB = parsed.vfoB || this.vfoB;
    
    // Import theme
    if (parsed.theme) {
      this.theme = parsed.theme;
    }

    // G77 codeplugs do not carry satellite data; reset so a previously loaded
    // codeplug's satellites don't leak into the newly imported one.
    this.satellites = [];
    
    // Import band limits
    if (parsed.bandLimits) {
      this.bandLimits = parsed.bandLimits;
    }
    
    this.modified = true;
    
    return {
      channels: this.channels.length,
      contacts: this.contacts.length,
      zones: this.zones.length,
      tgLists: this.tgLists.length,
      scanLists: this.scanLists.length
    };
  }

  /**
   * Export codeplug to G77 binary format
   * @returns {ArrayBuffer} The G77 binary data
   */
  exportG77() {
    const codeplug = {
      general: this.general,
      channels: this.channels,
      contacts: this.contacts,
      tgLists: this.tgLists,
      zones: this.zones,
      aprs: this.aprs,
      scanLists: this.scanLists,
      dtmf: this.dtmf,
      dtmfSettings: this.dtmfSettings,
      theme: this.theme,
      bandLimits: this.bandLimits,
      vfoA: this.vfoA,
      vfoB: this.vfoB
    };
    
    const buffer = G77.serialize(codeplug);
    
    // Store extended channel data generated by the serializer (scanner mode)
    this._extendedChannelData = G77._extendedChannelData || null;
    this._extendedBitmaps = G77._extendedBitmaps || null;
    
    return buffer;
  }

  /**
   * Serialize codeplug to JSON for storage
   */
  toJSON() {
    return {
      version: 1,
      general: this.general,
      channels: this.channels,
      contacts: this.contacts,
      tgLists: this.tgLists,
      zones: this.zones,
      aprs: this.aprs,
      dtmf: this.dtmf,
      dtmfSettings: this.dtmfSettings,
      scanLists: this.scanLists,
      satellites: this.satellites,
      theme: this.theme,
      bandLimits: this.bandLimits,
      vfoA: this.vfoA,
      vfoB: this.vfoB
    };
  }

  /**
   * Load codeplug from JSON
   */
  fromJSON(data) {
    if (!data || data.version !== 1) {
      throw new Error('Invalid codeplug format');
    }
    
    const asArray = (v) => Array.isArray(v) ? v : [];
    this.general = data.general || this.general;
    this.channels = asArray(data.channels);
    this.contacts = asArray(data.contacts);
    this.tgLists = asArray(data.tgLists);
    this.zones = asArray(data.zones);
    this.aprs = asArray(data.aprs);
    this.dtmf = asArray(data.dtmf);
    this.dtmfSettings = data.dtmfSettings || this.dtmfSettings;
    this.scanLists = asArray(data.scanLists);
    this.satellites = asArray(data.satellites);
    this.theme = data.theme || this.theme;
    this.bandLimits = data.bandLimits || this.bandLimits;
    this.vfoA = data.vfoA || this.vfoA;
    this.vfoB = data.vfoB || this.vfoB;

    // Ensure all items have IDs. IDs from an imported/shared JSON end up in
    // inline HTML event handlers, so reject anything that is not a simple token
    // to prevent stored XSS from a crafted codeplug file.
    const ensureIds = (items) => {
      items.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) {
          item.id = Utils.generateId();
        }
      });
    };
    [this.channels, this.contacts, this.tgLists, this.zones,
     this.aprs, this.dtmf, this.scanLists, this.satellites].forEach(ensureIds);
    
    this.modified = false;
  }

  /**
   * Get codeplug with sensitive data stripped (for sharing)
   */
  toShareable() {
    // Deep-clone: toJSON() returns live references, so stripping PII here would
    // otherwise mutate the in-memory codeplug.
    const data = JSON.parse(JSON.stringify(this.toJSON()));
    
    // Strip personal information
    data.general.dmrId = 0;
    data.general.callsign = '';
    data.general.infoLine1 = '';
    data.general.infoLine2 = '';
    
    // Strip private contacts (keep groups)
    data.contacts = data.contacts.filter(c => 
      c.type === CONFIG.CONTACT_TYPES.GROUP || c.type === CONFIG.CONTACT_TYPES.ALLCALL
    );
    
    return data;
  }

  /**
   * Merge selected items from another codeplug into this one.
   * Automatically imports associated contacts for channels and TG lists,
   * deduplicating by name and type.
   *
   * @param {Object} sourceData - Full codeplug JSON (version 1)
   * @param {Object} selections - Maps of selected indices per category
   *   e.g. { channels: [0,2], contacts: [1], tgLists: [0], zones: [], aprs: [], dtmf: [], scanLists: [], satellites: [], dtmfSettings: false }
   * @returns {Object} Summary of items added and duplicates skipped
   */
  mergeItems(sourceData, selections) {
    const summary = { added: {}, skipped: {}, errors: [] };
    const cats = ['channels', 'contacts', 'tgLists', 'zones', 'aprs', 'dtmf', 'scanLists', 'satellites'];
    cats.forEach(c => { summary.added[c] = 0; summary.skipped[c] = 0; });

    // Helper: check if contact already exists (by name + type)
    const contactExists = (name, type) => {
      return this.contacts.some(c => c.name === name && c.type === type);
    };

    // Helper: ensure a contact from source exists in current codeplug (deduplicated)
    const ensureContact = (contactName, sourceContacts) => {
      if (!contactName || contactName === 'None') return;
      if (this.findContactByName(contactName)) return; // already exists
      const srcContact = sourceContacts.find(c => c.name === contactName);
      if (!srcContact) return;
      try {
        this.addContact({ name: srcContact.name, dmrId: srcContact.dmrId, type: srcContact.type, tsOverride: srcContact.tsOverride });
        summary.added.contacts++;
      } catch (e) {
        summary.errors.push(`Contact "${srcContact.name}": ${e.message}`);
      }
    };

    const srcContacts = sourceData.contacts || [];
    const srcChannels = sourceData.channels || [];

    // Helper: ensure a TG list from source exists in current codeplug
    const ensureTGList = (tgListName, srcTGLists, srcContactsList) => {
      if (!tgListName || tgListName === 'None') return;
      if (this.tgLists.some(t => t.name === tgListName)) return; // already exists
      const srcTG = srcTGLists.find(t => t.name === tgListName);
      if (!srcTG) return;
      // Auto-import all contacts referenced in the TG list
      if (srcTG.contacts && Array.isArray(srcTG.contacts)) {
        srcTG.contacts.forEach(contactName => ensureContact(contactName, srcContactsList));
      }
      try {
        this.addTGList({ name: srcTG.name, contacts: srcTG.contacts || [] });
        summary.added.tgLists++;
      } catch (e) {
        summary.errors.push(`TG List "${srcTG.name}": ${e.message}`);
      }
    };

    // Helper: ensure a channel from source exists in current codeplug (deduplicated by name + type)
    const ensureChannel = (channelName) => {
      if (!channelName) return;
      const srcCh = srcChannels.find(c => c.name === channelName);
      if (!srcCh) return;
      if (this.channels.some(c => c.name === channelName && c.type === srcCh.type)) return; // already exists
      // For DMR channels, auto-import contact and TG list
      if (srcCh.type === CONFIG.CHANNEL_TYPES.DIGITAL) {
        if (srcCh.contact) ensureContact(srcCh.contact, srcContacts);
        if (srcCh.tgList) ensureTGList(srcCh.tgList, sourceData.tgLists || [], srcContacts);
      }
      try {
        this.addChannel(srcCh);
        summary.added.channels++;
      } catch (e) {
        summary.errors.push(`Channel "${srcCh.name}": ${e.message}`);
      }
    };

    // 1. Import selected contacts (explicit selection)
    if (selections.contacts && selections.contacts.length > 0) {
      selections.contacts.forEach(idx => {
        const c = srcContacts[idx];
        if (!c) return;
        if (contactExists(c.name, c.type)) {
          summary.skipped.contacts++;
          return;
        }
        try {
          this.addContact({ name: c.name, dmrId: c.dmrId, type: c.type, tsOverride: c.tsOverride });
          summary.added.contacts++;
        } catch (e) {
          summary.errors.push(`Contact "${c.name}": ${e.message}`);
        }
      });
    }

    // 2. Import selected channels (auto-import referenced contacts and TG lists for DMR)
    if (selections.channels && selections.channels.length > 0) {
      selections.channels.forEach(idx => {
        const ch = srcChannels[idx];
        if (!ch) return;
        // Auto-import the channel's contact
        if (ch.contact) ensureContact(ch.contact, srcContacts);
        // For DMR channels, auto-import the TG list and its contacts
        if (ch.type === CONFIG.CHANNEL_TYPES.DIGITAL && ch.tgList) {
          ensureTGList(ch.tgList, sourceData.tgLists || [], srcContacts);
        }
        try {
          this.addChannel(ch);
          summary.added.channels++;
        } catch (e) {
          summary.errors.push(`Channel "${ch.name}": ${e.message}`);
        }
      });
    }

    // 3. Import selected TG lists (auto-import referenced contacts)
    if (selections.tgLists && selections.tgLists.length > 0) {
      const srcTGLists = sourceData.tgLists || [];
      selections.tgLists.forEach(idx => {
        const tg = srcTGLists[idx];
        if (!tg) return;
        // Auto-import all contacts referenced in the TG list
        if (tg.contacts && Array.isArray(tg.contacts)) {
          tg.contacts.forEach(contactName => ensureContact(contactName, srcContacts));
        }
        try {
          this.addTGList({ name: tg.name, contacts: tg.contacts || [] });
          summary.added.tgLists++;
        } catch (e) {
          summary.errors.push(`TG List "${tg.name}": ${e.message}`);
        }
      });
    }

    // 4. Import selected zones (auto-import referenced channels, contacts, TG lists)
    if (selections.zones && selections.zones.length > 0) {
      const srcZones = sourceData.zones || [];
      selections.zones.forEach(idx => {
        const z = srcZones[idx];
        if (!z) return;
        // Auto-import all channels referenced in the zone
        if (z.channels && Array.isArray(z.channels)) {
          z.channels.forEach(channelName => ensureChannel(channelName));
        }
        try {
          this.addZone({ name: z.name, channels: z.channels || [] });
          summary.added.zones++;
        } catch (e) {
          summary.errors.push(`Zone "${z.name}": ${e.message}`);
        }
      });
    }

    // 5. Import selected APRS configs
    if (selections.aprs && selections.aprs.length > 0) {
      const srcAprs = sourceData.aprs || [];
      selections.aprs.forEach(idx => {
        const a = srcAprs[idx];
        if (!a) return;
        try {
          this.addAPRS(a);
          summary.added.aprs++;
        } catch (e) {
          summary.errors.push(`APRS "${a.name}": ${e.message}`);
        }
      });
    }

    // 6. Import selected DTMF contacts
    if (selections.dtmf && selections.dtmf.length > 0) {
      const srcDtmf = sourceData.dtmf || [];
      selections.dtmf.forEach(idx => {
        const d = srcDtmf[idx];
        if (!d) return;
        try {
          this.addDTMF({ name: d.name, code: d.code });
          summary.added.dtmf++;
        } catch (e) {
          summary.errors.push(`DTMF "${d.name}": ${e.message}`);
        }
      });
    }

    // 7. Import selected scan lists
    if (selections.scanLists && selections.scanLists.length > 0) {
      const srcScanLists = sourceData.scanLists || [];
      selections.scanLists.forEach(idx => {
        const s = srcScanLists[idx];
        if (!s) return;
        try {
          this.addScanList(s);
          summary.added.scanLists++;
        } catch (e) {
          summary.errors.push(`Scan List "${s.name}": ${e.message}`);
        }
      });
    }

    // 8. Import selected satellites (dedupe by name or catalogue number)
    if (selections.satellites && selections.satellites.length > 0) {
      const srcSats = sourceData.satellites || [];
      selections.satellites.forEach(idx => {
        const sat = srcSats[idx];
        if (!sat) return;
        const exists = this.satellites.some(s =>
          s.name === sat.name ||
          (sat.catalogueNumber && s.catalogueNumber === sat.catalogueNumber)
        );
        if (exists) {
          summary.skipped.satellites++;
          return;
        }
        try {
          this.addSatellite(sat);
          summary.added.satellites++;
        } catch (e) {
          summary.errors.push(`Satellite "${sat.name}": ${e.message}`);
        }
      });
    }

    // 9. Import DTMF settings if selected
    if (selections.dtmfSettings) {
      const src = sourceData.dtmfSettings;
      if (src) {
        Object.assign(this.dtmfSettings, src);
        this.modified = true;
      }
    }

    this.modified = true;
    return summary;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      channels: this.channels.length,
      analogChannels: this.channels.filter(c => c.type === CONFIG.CHANNEL_TYPES.ANALOG).length,
      digitalChannels: this.channels.filter(c => c.type === CONFIG.CHANNEL_TYPES.DIGITAL).length,
      contacts: this.contacts.length,
      tgLists: this.tgLists.length,
      zones: this.zones.length,
      scanLists: this.scanLists?.length || 0,
      aprsConfigs: this.aprs.length,
      dtmfContacts: Array.isArray(this.dtmf) ? this.dtmf.length : 0,
      satellites: this.satellites.length
    };
  }
}

// Export singleton instance
window.codeplug = new Codeplug();
