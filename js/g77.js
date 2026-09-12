/**
 * OpenGD77 CPS Web - G77 Binary File Parser
 * 
 * This module handles parsing and serializing OpenGD77 .g77 codeplug binary files.
 * Based on analysis of OpenGD77 CPS decompiled source code (DMR/MainForm.cs, ChannelForm.cs, etc.)
 * 
 * File Structure (131072 bytes / 0x20000):
 * - 0x00000-0x00007: Model identifier (8 bytes, e.g., "MD-760P\xFF")
 * - 0x00080-0x0008F: Device info
 * - 0x000E0-0x00107: General settings (callsign at 0x00E0, radio ID at 0x00E8)
 * - 0x00170-0x00177: Boot info ("HELLO!" etc)
 * - 0x03780-0x0752F: Channel data bank 0 (channels 1-128)
 * - 0x17620-0x1D5FF: Contacts (1024 contacts * 24 bytes)
 * - 0x1D620-0x1EE1F: RX Group Lists (TG Lists)
 * - 0x08000-0x0AE0F: Zone data (68 zones * 192 bytes)
 */

const G77 = {
  // File constants
  EEROM_SPACE: 131072,  // 0x20000 bytes total file size
  
  // Memory addresses (from Settings.cs)
  ADDR: {
    MODEL: 0x00000,
    DEVICE_INFO: 0x00080,          // 128
    GENERAL_SET: 0x000E0,          // 224
    BUTTON: 0x00108,               // 264
    ONE_TOUCH: 0x00110,            // 272
    TEXT_MSG: 0x00128,             // 296
    ENCRYPT: 0x01370,              // 4976
    SIGNALING: 0x013F8,            // 5112
    DTMF: 0x01400,                 // 5120
    APRS_SYSTEM: 0x01588,          // 5512
    SCAN_LIST: 0x01790,            // 6032 - Scan list data
    DTMF_CONTACT: 0x02F88,         // 12168 - DTMF contacts (32 entries x 32 bytes)
    CHANNEL: 0x03780,              // 14208 - Channel bank 0
    DMR_CONTACT_EX: 0x17620,       // 95776 - Contacts (extended)
    RX_GRP_LIST_EX: 0x1D620,       // 120352 - TG Lists
    ZONE_LIST: 0x08000,            // 32768 - Zone header
    EX_ZONE_LIST: 0x08030,         // Zone list (after 48-byte header)
    EX_CH: 0x0B1B0,                // 45488 - Extended channels (banks 1-7)
    BOOT_ITEM: 0x07518,            // 29976
    BOOT_CONTENT: 0x07540,         // 30016 - Boot line 1 (16 bytes) + Boot line 2 (16 bytes)
    VFO: 0x07590,                  // 30096
    CUSTOM_DATA: 0x1EE60,          // Custom data block (boot image, melody)
    THEME: 0x1EF00                 // Theme colors
  },
  
  // Structure sizes
  SIZE: {
    MODEL: 8,
    CHANNEL: 56,              // ChannelOne struct size
    CHANNEL_BANK: 16 + 56 * 128,  // Bank header + 128 channels
    CONTACT: 24,              // ContactOne struct size (16 name + 4 id + 4 flags)
    ZONE: 176,                // ZoneOne struct size (16 name + 80 channels * 2 bytes = 176 bytes)
    ZONE_NAME: 16,
    ZONE_CHANNELS: 80,
    TGLIST: 80,               // TG List entry (16 name + 32 contacts * 2 bytes)
    SCAN_LIST: 88,            // Scan list entry (15 name + 1 flag + 32*2 channels + 2 pri1 + 2 pri2 + 2 txch + 1 hold + 1 sample)
    DTMF: 120,                // DTMF settings structure
    DTMF_CONTACT: 32,         // DTMF contact entry (16 name + 16 code)
    DTMF_CONTACT_COUNT: 32,   // Max DTMF contacts
    GENERAL_SET: 40,
    APRS_CONFIG: 64,          // APRS config entry (8 name + 1 ssid + 3 lat + 3 lon + 6 via1 + 1 via1ssid + 6 via2 + 1 via2ssid + 1 iconTable + 1 iconIndex + 24 comment + 4 txFreq + 2 reserved + 1 flags + 2 magic)
    BOOT_ITEM: 8,
    THEME: 64                 // Theme data size (32 colors × 2 bytes RGB565)
  },
  
  // Custom data block types (from firmware codeplug.h CodeplugCustomDataType_t)
  CUSTOM_DATA_TYPE: {
    UNINITIALISED: 0,
    BOOT_IMAGE: 1,
    BOOT_MELODY: 2,
    SATELLITE_TLE: 3,
    THEME_DAY: 4,
    THEME_NIGHT: 5
  },
  
  // Maximum counts
  MAX: {
    CHANNELS: 1024,
    CHANNELS_PER_BANK: 128,
    CONTACTS: 1024,
    ZONES: 68,
    TGLISTS: 76,
    CONTACTS_PER_TGLIST: 32,
    CHANNELS_PER_ZONE: 80,
    SCAN_LISTS: 64,
    CHANNELS_PER_SCAN_LIST: 32,
    APRS_CONFIGS: 8
  },
  
  // Channel modes
  CH_MODE: {
    ANALOG: 0,
    DIGITAL: 1
  },
  
  // Contact types
  CALL_TYPE: {
    GROUP: 0,
    PRIVATE: 1,
    ALLCALL: 2
  },
  
  // Power levels  
  POWER_LEVELS: [
    'Master', '50mW | 50mW | 100mW', '250mW | 250mW | 250mW', '500mW | 500mW | 500mW',
    '750mW | 750mW | 750mW', '1W | 1W | 1W', '2W | 2W | 2W', '3W | 3W | 10W',
    '4W | 5W | 25W', '5W | 10W | 40W', '+W-'
  ],
  
  // CTCSS/DCS tones list (matches OpenGD77 CPS)
  TONES_LIST: [
    'None', '67.0', '69.3', '71.9', '74.4', '77.0', '79.7', '82.5', '85.4',
    '88.5', '91.5', '94.8', '97.4', '100.0', '103.5', '107.2', '110.9',
    '114.8', '118.8', '123.0', '127.3', '131.8', '136.5', '141.3', '146.2',
    '151.4', '156.7', '159.8', '162.2', '165.5', '167.9', '171.3', '173.8',
    '177.3', '179.9', '183.5', '186.2', '189.9', '192.8', '196.6', '199.5',
    '203.5', '206.5', '210.7', '218.1', '225.7', '229.1', '233.6', '241.8', '250.3', '254.1'
  ],
  
  /**
   * Parse a G77 binary file
   * @param {ArrayBuffer} buffer - The G77 file data
   * @returns {Object} Parsed codeplug data
   */
  parse(buffer) {
    if (buffer.byteLength !== this.EEROM_SPACE) {
      throw new Error(`Invalid G77 file size: expected ${this.EEROM_SPACE} bytes, got ${buffer.byteLength}`);
    }
    
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    
    const codeplug = {
      general: this.parseGeneralSettings(data, view),
      channels: this.parseChannels(data, view),
      contacts: this.parseContacts(data, view),
      zones: this.parseZones(data, view),
      tgLists: this.parseTGLists(data, view),
      scanLists: this.parseScanLists(data, view),
      dtmf: this.parseDTMF(data, view),
      dtmfContacts: this.parseDTMFContacts(data, view),
      vfoA: this.parseVFO(data, view, this.ADDR.VFO),
      vfoB: this.parseVFO(data, view, this.ADDR.VFO + this.SIZE.CHANNEL),
      aprs: this.parseAPRS(data, view),
      satellites: [],
      bandLimits: this.parseBandLimits(data, view),
      theme: this.parseTheme(data, view)
    };
    
    return codeplug;
  },
  
  /**
   * Parse general settings (callsign, radio ID, etc.)
   */
  parseGeneralSettings(data, view) {
    const offset = this.ADDR.GENERAL_SET;
    
    // Callsign: 8 bytes at offset 0
    const callsign = this.readString(data, offset, 8);
    
    // Radio ID: 4 bytes BCD at offset 8
    const radioIdBytes = data.slice(offset + 8, offset + 12);
    const radioId = this.parseBcdId(radioIdBytes);
    
    // Boot text: at BOOT_CONTENT (0x07560)
    const bootText1 = this.readString(data, this.ADDR.BOOT_CONTENT, 16);
    const bootText2 = this.readString(data, this.ADDR.BOOT_CONTENT + 16, 16);
    
    // Boot item settings at BOOT_ITEM (0x07518)
    const bootOffset = this.ADDR.BOOT_ITEM;
    const bootScreenMode = data[bootOffset];  // 0 = Default Image, 1 = Custom Text
    const bootPasswordEnabled = data[bootOffset + 1] !== 0;
    // Boot password: 3 bytes BCD at offset +4
    const bootPwdBytes = data.slice(bootOffset + 4, bootOffset + 7);
    const bootPassword = this.parseBcdPassword(bootPwdBytes);
    
    return {
      radioName: 'OpenGD77',
      radioType: null,  // Don't assume type - will be set from connection or user selection
      dmrId: radioId,
      callsign: callsign,
      infoLine1: bootText1,
      infoLine2: bootText2,
      bootScreenMode: bootScreenMode,
      bootPasswordEnabled: bootPasswordEnabled,
      bootPassword: bootPassword,
      displayMode: 'Picture'  // Default, may be overridden by firmware settings
    };
  },
  
  /**
   * Parse all channels from the binary data
   */
  parseChannels(data, view) {
    const channels = [];
    
    // Parse channel bank 0 (channels 1-128) at ADDR_CHANNEL
    this.parseChannelBank(data, view, this.ADDR.CHANNEL, 0, channels);
    
    // Parse extended channel banks (1-7) at ADDR_EX_CH
    for (let bank = 1; bank < 8; bank++) {
      const bankOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK;
      this.parseChannelBank(data, view, bankOffset, bank, channels);
    }
    
    return channels;
  },
  
  /**
   * Parse extended channels (1025+) from the extended channel data buffer.
   * These are stored contiguously in the DMRID/VP flash area at 56 bytes per channel
   * with no bitmap headers (unlike the standard channel banks).
   * The bitmap for extended banks is read from the standard codeplug flash area.
   * 
   * @param {Uint8Array} extData - Extended channel data buffer from flash
   * @param {Uint8Array} mainData - Main codeplug buffer (contains bitmaps for banks 8-12)
   * @returns {Array} Array of parsed channel objects
   */
  parseExtendedChannels(extData, mainData) {
    if (!extData || extData.length === 0) return [];
    
    const channels = [];
    const extView = new DataView(extData.buffer, extData.byteOffset, extData.byteLength);
    const mainView = mainData ? new DataView(mainData.buffer, mainData.byteOffset, mainData.byteLength) : null;
    const channelSize = SCANNER_LIMITS.CHANNEL_DATA_SIZE;
    const maxExtChannels = Math.floor(extData.length / channelSize);
    
    for (let extIndex = 0; extIndex < maxExtChannels; extIndex++) {
      const channelNum = this.MAX.CHANNELS + extIndex + 1;  // 1025, 1026, ...
      const bank = Math.floor((channelNum - 1) / SCANNER_LIMITS.CHANNELS_PER_BANK);
      const indexInBank = (channelNum - 1) % SCANNER_LIMITS.CHANNELS_PER_BANK;
      
      // Check bitmap for this channel's bank.
      // Banks 8-12 have bitmaps in the main codeplug buffer.
      // Banks 13+ bitmaps are at flash addresses that may be within the extended data.
      let isValid = false;
      const bankBitmapOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK;
      
      if (bankBitmapOffset + 16 <= this.EEROM_SPACE && mainData) {
        // Bitmap is in the main codeplug buffer
        const byteIndex = Math.floor(indexInBank / 8);
        const bitIndex = indexInBank % 8;
        isValid = !!(mainData[bankBitmapOffset + byteIndex] & (1 << bitIndex));
      } else {
        // Bitmap for this bank is beyond the G77 buffer.
        // Use heuristic: check if channel data looks valid (non-empty name, valid frequency)
        const offset = extIndex * channelSize;
        if (offset + channelSize <= extData.length) {
          const nameBytes = extData.slice(offset, offset + 16);
          const hasName = !nameBytes.every(b => b === 0xFF) && !nameBytes.every(b => b === 0x00);
          if (hasName) {
            // Also verify RX frequency is non-zero and non-0xFFFFFFFF
            const rxFreq = extView.getUint32(offset + 16, true);
            isValid = rxFreq !== 0 && rxFreq !== 0xFFFFFFFF;
          }
        }
      }
      
      if (!isValid) continue;
      
      const offset = extIndex * channelSize;
      if (offset + channelSize > extData.length) break;
      
      const channel = this.parseChannel(extData, extView, offset, channelNum);
      if (channel) {
        channels.push(channel);
      }
    }
    
    return channels;
  },
  
  /**
   * Parse a single channel bank (128 channels)
   * Uses the 16-byte bitmap at the start of each bank to determine valid channels.
   * CPS reference: ChannelForm.DataIsValid() uses BitArray on chIndex bitmap.
   */
  parseChannelBank(data, view, baseOffset, bankNum, channels) {
    // Read 16-byte channel validity bitmap (128 bits = 1 bit per channel)
    const channelDataOffset = baseOffset + 16;
    
    for (let i = 0; i < this.MAX.CHANNELS_PER_BANK; i++) {
      // Check bitmap: each byte has 8 bits, LSB first
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      if (!(data[baseOffset + byteIndex] & (1 << bitIndex))) {
        continue;  // Channel not valid per bitmap
      }
      
      const offset = channelDataOffset + i * this.SIZE.CHANNEL;
      const channelNum = bankNum * this.MAX.CHANNELS_PER_BANK + i + 1;
      
      const channel = this.parseChannel(data, view, offset, channelNum);
      if (channel) {
        channels.push(channel);
      }
    }
  },
  
  /**
   * Parse a single channel from binary data
   * 
   * Channel data structure (56 bytes total) - matches CodeplugChannel_t in firmware:
   * Offset 0-15:  name[16]
   * Offset 16-19: rxFreq (uint32, BCD)
   * Offset 20-23: txFreq (uint32, BCD)
   * Offset 24:    chMode (0=Analog, 1=Digital)
   * Offset 25:    libreDMR_Power
   * Offset 26:    locationLat0 (LS byte)
   * Offset 27:    tot
   * Offset 28:    locationLat1
   * Offset 29:    locationLat2 (MS byte)
   * Offset 30:    locationLon0 (LS byte)
   * Offset 31:    locationLon1 / scanList
   * Offset 32-33: rxTone (uint16)
   * Offset 34-35: txTone (uint16)
   * Offset 36:    locationLon2 (MS byte) / voiceEmphasis
   * Offset 37:    DMR ID per channel (txSignaling, repurposed)
   * Offset 38:    LibreDMR_flag1 (0x80: OptionalDMRID, 0x40: noBeep, 0x20: noEco, 0x08: useLocation, 0x04: forceDMO, 0x01: roaming)
   * Offset 39-41: rxSignaling, artsInterval, encrypt
   * Offset 42:    _UNUSED_2 (firmware doesn't use this)
   * Offset 43:    rxGroupList (TG List index)
   * Offset 44:    txColor (COLOR CODE - this is what firmware uses!)
   * Offset 45:    aprsConfigIndex
   * Offset 46-47: contact (uint16)
   * Offset 48-51: flag1, flag2, flag3, flag4
   * Offset 52-55: VFO offset, flags, squelch
   */
  parseChannel(data, view, offset, number) {
    // Check if channel is empty (first 16 bytes all 0xFF)
    const nameBytes = data.slice(offset, offset + 16);
    if (nameBytes.every(b => b === 0xFF) || nameBytes.every(b => b === 0x00)) {
      return null;
    }
    
    const name = this.readString(data, offset, 16);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // RX Frequency: 4 bytes BCD at offset 16
    const rxFreqBcd = view.getUint32(offset + 16, true);
    const rxFreq = this.bcdToFrequency(rxFreqBcd);
    
    // TX Frequency: 4 bytes BCD at offset 20
    const txFreqBcd = view.getUint32(offset + 20, true);
    const txFreq = this.bcdToFrequency(txFreqBcd);
    
    // Validate frequencies
    if (rxFreq <= 0 || txFreq <= 0) {
      return null;
    }
    
    // Channel mode: byte at offset 24 (0 = Analog, 1 = Digital)
    const chMode = data[offset + 24];
    
    // Power level: byte at offset 25
    const powerLevel = data[offset + 25];
    
    // TOT: byte at offset 27 (in 15-second increments)
    const tot = data[offset + 27] * 15;
    
    // Scan list index: byte at offset 31 (scanList field in ChannelOne)
    const scanListIndex = data[offset + 31];
    
    // RX Tone: ushort at offset 32 (ChannelOne.rxTone)
    const rxToneRaw = view.getUint16(offset + 32, true);
    const rxTone = this.parseTone(rxToneRaw);
    
    // TX Tone: ushort at offset 34 (ChannelOne.txTone)
    const txToneRaw = view.getUint16(offset + 34, true);
    const txTone = this.parseTone(txToneRaw);
    
    // DMR ID per channel at offset 37 (ChannelOne.txSignaling, repurposed by OpenGD77)
    const dmrIdByte = data[offset + 37];
    const dmrId = dmrIdByte === 0 ? 'None' : dmrIdByte.toString();
    
    // LibreDMR_flag1 at offset 38 - contains multiple flags per firmware codeplug.h
    const libreDmrFlag1 = data[offset + 38];
    const noBeep = !!(libreDmrFlag1 & 0x40);     // bit 6: NO_BEEP
    const noEco = !!(libreDmrFlag1 & 0x20);      // bit 5: NO_ECO
    const forceDmo = !!(libreDmrFlag1 & 0x04);   // bit 2: FORCE_DMO
    
    // TG List (RX Group List) index: byte at offset 43 (ChannelOne.rxGroupList)
    const rxGroupList = data[offset + 43];
    
    // Color code: byte at offset 44 (ChannelOne.txColor)
    const colorCode = data[offset + 44];
    
    // APRS system index at offset 45 (ChannelOne.aprsConfigIndex)
    const aprsIndex = data[offset + 45];
    
    // Contact index: ushort at offset 46 (ChannelOne.contact)
    const contactIndex = view.getUint16(offset + 46, true);
    
    // Flags: bytes at offset 48-51 (ChannelOne.flag1-flag4)
    const flag1 = data[offset + 48];
    const flag2 = data[offset + 49];
    const flag3 = data[offset + 50];
    const flag4 = data[offset + 51];
    
    // Timeslot: flag2 bit 6 (ChannelOne.RepeaterSlot: 0=TS1, 1=TS2)
    const timeslot = (flag2 & 0x40) ? 2 : 1;
    
    // Bandwidth: flag4 bit 1 (ChannelOne.Bandwidth: 0=12.5kHz, 1=25kHz)
    const bandwidth = (flag4 & 0x02) ? 25 : 12.5;
    
    // RX Only: flag4 bit 2 (ChannelOne.OnlyRx)
    const rxOnly = !!(flag4 & 0x04);
    
    // Zone skip: flag4 bit 5 (ChannelOne.AutoScan, repurposed by OpenGD77)
    const zoneSkip = !!(flag4 & 0x20);
    
    // All skip: flag4 bit 4 (ChannelOne.LoneWorker, repurposed by OpenGD77)
    const allSkip = !!(flag4 & 0x10);
    
    // VOX: flag4 bit 6 (ChannelOne.Vox)
    const vox = (flag4 & 0x40) ? 'On' : 'Off';
    
    // Use location: LibreDMR_flag1 bit 3 (firmware codeplug.h: LIBREDMR_FLAG1_USE_LOCATION)
    const useLocation = !!(libreDmrFlag1 & 0x08);
    
    // Talker Alias TX settings - extracted from flag1 lower bits per firmware codeplug.h
    const ts1TaTxRaw = (flag1 >> 0) & 0x03;  // bits 0-1
    const ts2TaTxRaw = (flag1 >> 2) & 0x03;  // bits 2-3
    const talkerAliasOptions = ['Off', 'Text', 'APRS'];
    const ts1TalkerAliasTx = talkerAliasOptions[ts1TaTxRaw] || 'Off';
    const ts2TalkerAliasTx = talkerAliasOptions[ts2TaTxRaw] || 'Off';
    
    // Override DMR ID - 4 bytes at offset 52 (ChannelOne.reserve2 + reserve + sql, repurposed)
    const overrideDmrIdBytes = data.slice(offset + 52, offset + 56);
    let overrideDmrId = 0;
    // Check if it's a valid BCD-encoded ID
    if (!overrideDmrIdBytes.every(b => b === 0xFF || b === 0x00)) {
      overrideDmrId = this.parseBcdId(overrideDmrIdBytes);
    }
    
    // Parse latitude from bytes 26(Lat0=LS), 28(Lat1), 29(Lat2=MS) per firmware codeplug.h
    let latitude = 0;
    if (useLocation) {
      const latEncoded = (data[offset + 29] << 16) | (data[offset + 28] << 8) | data[offset + 26];
      latitude = this.decodeLatitude(latEncoded);
    }
    
    // Parse longitude from bytes 30(Lon0=LS), 31(Lon1), 36(Lon2=MS) per firmware codeplug.h
    let longitude = 0;
    if (useLocation) {
      const lonEncoded = (data[offset + 36] << 16) | (data[offset + 31] << 8) | data[offset + 30];
      longitude = this.decodeLongitude(lonEncoded);
    }
    
    // Squelch level: byte at offset 55 (ChannelOne.sql)
    const squelchByte = data[offset + 55];
    const squelch = squelchByte === 0 ? 'Disabled' : squelchByte.toString();
    
    return {
      id: Utils.generateId(),
      number: number,
      name: name,
      type: chMode === this.CH_MODE.DIGITAL ? CONFIG.CHANNEL_TYPES.DIGITAL : CONFIG.CHANNEL_TYPES.ANALOG,
      rxFreq: rxFreq,
      txFreq: txFreq,
      bandwidth: bandwidth,
      colorCode: chMode === this.CH_MODE.DIGITAL ? colorCode : 0,
      timeslot: chMode === this.CH_MODE.DIGITAL ? timeslot : 1,
      contact: null,  // Will be resolved after contacts are parsed
      contactIndex: contactIndex,
      tgList: null,   // Will be resolved after TG lists are parsed
      tgListIndex: rxGroupList,
      aprs: null,     // Will be resolved after APRS configs are parsed
      aprsIndex: aprsIndex,
      scanList: null, // Will be resolved after scan lists are parsed
      scanListIndex: scanListIndex,
      dmrId: dmrId,
      overrideDmrId: overrideDmrId,
      ts1TalkerAliasTx: ts1TalkerAliasTx,
      ts2TalkerAliasTx: ts2TalkerAliasTx,
      rxTone: rxTone,
      txTone: txTone,
      squelch: squelch,
      power: this.POWER_LEVELS[powerLevel] || 'Master',
      rxOnly: rxOnly,
      zoneSkip: zoneSkip,
      allSkip: allSkip,
      tot: tot,
      vox: vox,
      noBeep: noBeep,
      noEco: noEco,
      forceDmo: forceDmo,
      latitude: latitude,
      longitude: longitude,
      useLocation: useLocation
    };
  },
  
  /**
   * Parse all contacts from binary data
   */
  parseContacts(data, view) {
    const contacts = [];
    const offset = this.ADDR.DMR_CONTACT_EX;
    
    for (let i = 0; i < this.MAX.CONTACTS; i++) {
      const contactOffset = offset + i * this.SIZE.CONTACT;
      const contact = this.parseContact(data, view, contactOffset, i + 1);
      if (contact) {
        contacts.push(contact);
      }
    }
    
    return contacts;
  },
  
  /**
   * Parse a single contact from binary data
   */
  parseContact(data, view, offset, index) {
    // Check if contact is empty
    const nameBytes = data.slice(offset, offset + 16);
    if (nameBytes.every(b => b === 0xFF) || nameBytes.every(b => b === 0x00)) {
      return null;
    }
    
    const name = this.readString(data, offset, 16);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // Call ID: 4 bytes BCD at offset 16
    const callIdBytes = data.slice(offset + 16, offset + 20);
    const dmrId = this.parseBcdId(callIdBytes);
    
    // Call type: byte at offset 20
    const callType = data[offset + 20];
    
    let type = CONFIG.CONTACT_TYPES.GROUP;
    if (callType === this.CALL_TYPE.PRIVATE) {
      type = CONFIG.CONTACT_TYPES.PRIVATE;
    } else if (callType === this.CALL_TYPE.ALLCALL) {
      type = CONFIG.CONTACT_TYPES.ALLCALL;
    }
    
    // TS Override: byte at offset 23
    // Firmware flags (codeplug.h): bit0 (0x01) = no override,
    // bit1 (0x02) = timeslot override (0 = TS1, 1 = TS2).
    // So: TS1 = 0x00, None = 0x01, TS2 = 0x02.
    const tsOverrideRaw = data[offset + 23];
    let tsOverride = 'Disabled';
    if ((tsOverrideRaw & 0x01) === 0) {
      tsOverride = (tsOverrideRaw & 0x02) ? '2' : '1';
    }
    
    return {
      id: Utils.generateId(),
      index: index,
      name: name,
      dmrId: dmrId,
      type: type,
      tsOverride: tsOverride
    };
  },
  
  /**
   * Parse all zones from binary data
   * Uses the 32-byte zone bitmap at ZONE_LIST + 16 (0x8010) to validate zones.
   * CPS reference: Zone.DataIsValid() uses BitArray on zoneIndex bitmap.
   */
  parseZones(data, view) {
    const zones = [];
    // Zone bitmap is 32 bytes at ADDR_EX_ZONE + 16 = ZONE_LIST + 16 (0x8010)
    const bitmapOffset = this.ADDR.ZONE_LIST + 16;
    const offset = this.ADDR.EX_ZONE_LIST;
    
    // Use effective zone struct size: 176 for standard (80 ch/zone), 528 for scanner (256 ch/zone)
    const effectiveZoneSize = (typeof getEffectiveLimits === 'function' && getEffectiveLimits().MAX_CHANNELS_PER_ZONE > this.MAX.CHANNELS_PER_ZONE)
      ? SCANNER_LIMITS.ZONE_STRUCT_SIZE : this.SIZE.ZONE;
    
    for (let i = 0; i < this.MAX.ZONES; i++) {
      // Check zone bitmap validity
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      if (!(data[bitmapOffset + byteIndex] & (1 << bitIndex))) {
        continue;  // Zone not valid per bitmap
      }
      
      const zoneOffset = offset + i * effectiveZoneSize;
      if (zoneOffset + effectiveZoneSize > data.length) break;  // Prevent reading beyond buffer
      const zone = this.parseZone(data, view, zoneOffset, i + 1);
      if (zone) {
        zones.push(zone);
      }
    }
    
    return zones;
  },
  
  /**
   * Parse a single zone from binary data
   */
  parseZone(data, view, offset, index) {
    // Check if zone is empty
    const nameBytes = data.slice(offset, offset + 16);
    if (nameBytes.every(b => b === 0xFF) || nameBytes.every(b => b === 0x00)) {
      return null;
    }
    
    const name = this.readString(data, offset, 16);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // Channel indices: 80 x 2-byte values starting at offset 16
    const channelIndices = [];
    const effectiveMaxChannelsPerZone = (typeof getEffectiveLimits === 'function') ? getEffectiveLimits().MAX_CHANNELS_PER_ZONE : this.MAX.CHANNELS_PER_ZONE;
    const effectiveMaxChannels = (typeof getEffectiveLimits === 'function') ? getEffectiveLimits().MAX_CHANNELS : this.MAX.CHANNELS;
    for (let i = 0; i < effectiveMaxChannelsPerZone; i++) {
      const chIndex = view.getUint16(offset + 16 + i * 2, true);
      if (chIndex > 0 && chIndex <= effectiveMaxChannels) {
        channelIndices.push(chIndex);
      }
    }
    
    return {
      id: Utils.generateId(),
      index: index,
      name: name,
      channels: [],  // Will be populated with channel names later
      channelIndices: channelIndices
    };
  },
  
  /**
   * Parse TG lists (RX Group Lists)
   * Uses the 128-byte rxListIndex header to validate lists.
   * CPS reference: RxListData.DataIsValid() checks rxListIndex[i] != 0 && <= 33
   */
  parseTGLists(data, view) {
    const tgLists = [];
    const offset = this.ADDR.RX_GRP_LIST_EX;
    
    // First 128 bytes are the rxListIndex - each byte is the contact count for that TG list
    // 0 = unused, 1-33 = valid (number of contacts, max 32 + 1)
    const listDataOffset = offset + 128;
    
    for (let i = 0; i < this.MAX.TGLISTS; i++) {
      // Check rxListIndex: valid if non-zero and <= 33 (MAX_CONTACTS_PER_TGLIST + 1)
      // CPS reference: RxListData.DataIsValid() allows up to CNT_CONTACT_PER_RX_LIST + 1 = 33
      // The actual contact count used for reading is clamped to MAX_CONTACTS_PER_TGLIST (32)
      const rxListCount = data[offset + i];
      if (rxListCount === 0 || rxListCount > this.MAX.CONTACTS_PER_TGLIST + 1) {
        continue;  // TG list not valid per header
      }
      
      const tgListOffset = listDataOffset + i * this.SIZE.TGLIST;
      const tgList = this.parseTGList(data, view, tgListOffset, i + 1, rxListCount);
      if (tgList) {
        tgLists.push(tgList);
      }
    }
    
    return tgLists;
  },
  
  /**
   * Parse a single TG list
   * @param {number} contactCount - Number of contacts from rxListIndex header (optional)
   */
  parseTGList(data, view, offset, index, contactCount) {
    // Check if TG list is empty
    const nameBytes = data.slice(offset, offset + 16);
    if (nameBytes.every(b => b === 0xFF) || nameBytes.every(b => b === 0x00)) {
      return null;
    }
    
    const name = this.readString(data, offset, 16);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // Contact indices: use contactCount from header to limit how many contacts we read
    const maxContacts = (contactCount !== undefined && contactCount > 0)
      ? Math.min(contactCount, this.MAX.CONTACTS_PER_TGLIST)
      : this.MAX.CONTACTS_PER_TGLIST;
    const contactIndices = [];
    for (let i = 0; i < maxContacts; i++) {
      const contactIndex = view.getUint16(offset + 16 + i * 2, true);
      if (contactIndex > 0 && contactIndex <= this.MAX.CONTACTS) {
        contactIndices.push(contactIndex);
      }
    }
    
    return {
      id: Utils.generateId(),
      index: index,
      name: name,
      contacts: [],  // Will be populated with contact names later
      contactIndices: contactIndices
    };
  },
  
  /**
   * Parse scan lists from binary data
   */
  parseScanLists(data, view) {
    const scanLists = [];
    const baseOffset = this.ADDR.SCAN_LIST;
    
    // First 64 bytes are the scan list validity bitmap
    const listDataOffset = baseOffset + 64;
    
    for (let i = 0; i < this.MAX.SCAN_LISTS; i++) {
      // Check if scan list is valid (bit set in bitmap)
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const isValid = (data[baseOffset + byteIndex] & (1 << bitIndex)) !== 0;
      
      if (!isValid) continue;
      
      const scanListOffset = listDataOffset + i * this.SIZE.SCAN_LIST;
      const scanList = this.parseScanList(data, view, scanListOffset, i + 1);
      if (scanList) {
        scanLists.push(scanList);
      }
    }
    
    return scanLists;
  },
  
  /**
   * Parse a single scan list from binary data
   */
  parseScanList(data, view, offset, index) {
    // Check if scan list is empty
    const nameBytes = data.slice(offset, offset + 15);
    if (nameBytes.every(b => b === 0xFF) || nameBytes.every(b => b === 0x00)) {
      return null;
    }
    
    const name = this.readString(data, offset, 15);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // Flag byte at offset 15
    const flag = data[offset + 15];
    const talkback = !!(flag & 0x80);
    const plType = (flag & 0x60) >> 5;
    
    // Channel indices: 32 x 2-byte values starting at offset 16
    const channelIndices = [];
    const effectiveMaxCh = (typeof getEffectiveLimits === 'function') ? getEffectiveLimits().MAX_CHANNELS : this.MAX.CHANNELS;
    for (let i = 0; i < this.MAX.CHANNELS_PER_SCAN_LIST; i++) {
      const chIndex = view.getUint16(offset + 16 + i * 2, true);
      if (chIndex > 0 && chIndex <= effectiveMaxCh) {
        channelIndices.push(chIndex);
      }
    }
    
    // Priority channels and TX designated channel
    const priorityCh1 = view.getUint16(offset + 80, true);
    const priorityCh2 = view.getUint16(offset + 82, true);
    const txDesignatedCh = view.getUint16(offset + 84, true);
    const signalingHold = data[offset + 86] * 25;  // In 25ms increments
    const prioritySample = data[offset + 87] * 250;  // In 250ms increments
    
    return {
      id: Utils.generateId(),
      index: index,
      name: name,
      channels: [],  // Will be populated with channel names later
      channelIndices: channelIndices,
      priorityCh1: priorityCh1 === 0 ? 'None' : priorityCh1.toString(),
      priorityCh2: priorityCh2 === 0 ? 'None' : priorityCh2.toString(),
      txDesignatedCh: txDesignatedCh === 0 ? 'Last Active' : txDesignatedCh.toString(),
      signalingHold: signalingHold || 500,
      prioritySample: prioritySample || 2000,
      talkback: talkback,
      plType: plType
    };
  },
  
  /**
   * Parse DTMF settings from binary data
   */
  parseDTMF(data, view) {
    const offset = this.ADDR.DTMF;
    const dtmfSettings = {
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
    
    // DTMF character set
    const dtmfChars = '0123456789ABCD*#';
    
    // Self ID: 8 bytes at offset 0
    dtmfSettings.selfId = this.parseDtmfString(data, offset, 8);
    
    // Kill Code: 16 bytes at offset 8
    dtmfSettings.killCode = this.parseDtmfString(data, offset + 8, 16);
    
    // Wake Code: 16 bytes at offset 24
    dtmfSettings.wakeCode = this.parseDtmfString(data, offset + 24, 16);
    
    // Delimiter: 1 byte at offset 40
    dtmfSettings.delimiter = data[offset + 40];
    
    // Group Code: 1 byte at offset 41
    dtmfSettings.groupCode = data[offset + 41];
    
    // Decode Response: 1 byte at offset 42
    dtmfSettings.decodeResp = data[offset + 42];
    
    // Auto Reset Timer: 1 byte at offset 43
    dtmfSettings.autoResetTimer = data[offset + 43];
    
    // Flag1: 1 byte at offset 44
    const flag1 = data[offset + 44];
    dtmfSettings.killWakeDec = (flag1 & 0x80) >> 7;
    dtmfSettings.killType = (flag1 & 0x60) >> 5;
    
    // PTT ID Up Code: 30 bytes at offset 48
    dtmfSettings.pttidUpCode = this.parseDtmfString(data, offset + 48, 30);
    
    // PTT ID Down Code: 30 bytes at offset 80
    dtmfSettings.pttidDownCode = this.parseDtmfString(data, offset + 80, 30);
    
    // Timing parameters
    dtmfSettings.respHoldTime = data[offset + 112];
    dtmfSettings.decTime = data[offset + 113];
    dtmfSettings.fstDigitDly = data[offset + 114];
    dtmfSettings.fstDur = data[offset + 115];
    dtmfSettings.otherDur = data[offset + 116];
    dtmfSettings.rate = data[offset + 117];
    dtmfSettings.tail = data[offset + 118];
    
    return dtmfSettings;
  },
  
  /**
   * Parse a DTMF string from binary data
   */
  parseDtmfString(data, offset, maxLen) {
    const dtmfChars = '0123456789ABCD*#';
    let result = '';
    for (let i = 0; i < maxLen; i++) {
      const charIndex = data[offset + i];
      if (charIndex >= dtmfChars.length) break;
      result += dtmfChars[charIndex];
    }
    return result;
  },

  /**
   * Parse DTMF contacts from binary data.
   * 32 entries x 32 bytes at ADDR.DTMF_CONTACT (16 name + 16 DTMF code).
   */
  parseDTMFContacts(data, view) {
    const contacts = [];
    const count = this.SIZE.DTMF_CONTACT_COUNT;
    const entrySize = this.SIZE.DTMF_CONTACT;
    const base = this.ADDR.DTMF_CONTACT;

    for (let i = 0; i < count; i++) {
      const offset = base + i * entrySize;
      const name = this.readString(data, offset, 16);
      const code = this.parseDtmfString(data, offset + 16, 16);
      if (!name && !code) continue;
      contacts.push({ name, code });
    }

    return contacts;
  },

  /**
   * Serialize DTMF contacts to binary data.
   * Unused entries are filled with 0xFF (empty EEPROM state).
   */
  serializeDTMFContacts(data, view, contacts) {
    const count = this.SIZE.DTMF_CONTACT_COUNT;
    const entrySize = this.SIZE.DTMF_CONTACT;
    const base = this.ADDR.DTMF_CONTACT;

    // Start from an empty block
    for (let i = 0; i < count * entrySize; i++) {
      data[base + i] = 0xFF;
    }

    const list = Array.isArray(contacts) ? contacts : [];
    for (let i = 0; i < list.length && i < count; i++) {
      const offset = base + i * entrySize;
      this.writeString(data, offset, list[i].name || '', 16);
      this.writeDtmfString(data, offset + 16, list[i].code || '', 16);
    }
  },
  
  /**
   * Parse a single VFO entry from binary data (same layout as channel, 56 bytes)
   */
  parseVFO(data, view, offset) {
    // RX Frequency: 4 bytes BCD at offset 16
    const rxFreqBcd = view.getUint32(offset + 16, true);
    const rxFreq = this.bcdToFrequency(rxFreqBcd);
    
    // TX Frequency: 4 bytes BCD at offset 20
    const txFreqBcd = view.getUint32(offset + 20, true);
    const txFreq = this.bcdToFrequency(txFreqBcd);
    
    // Channel mode: byte at offset 24
    const chMode = data[offset + 24];
    
    // Power level: byte at offset 25
    const powerLevel = data[offset + 25];
    
    // TOT: byte at offset 27 (in 15-second increments)
    const tot = data[offset + 27] * 15;
    
    // RX Tone: ushort at offset 32 (ChannelOne.rxTone)
    const rxToneRaw = view.getUint16(offset + 32, true);
    const rxTone = this.parseTone(rxToneRaw);
    
    // TX Tone: ushort at offset 34 (ChannelOne.txTone)
    const txToneRaw = view.getUint16(offset + 34, true);
    const txTone = this.parseTone(txToneRaw);
    
    // LibreDMR_flag1 at offset 38 - contains multiple flags per firmware codeplug.h
    const libreDmrFlag1 = data[offset + 38];
    const noBeep = !!(libreDmrFlag1 & 0x40);     // bit 6: NO_BEEP
    const noEco = !!(libreDmrFlag1 & 0x20);      // bit 5: NO_ECO
    const forceDmo = !!(libreDmrFlag1 & 0x04);   // bit 2: FORCE_DMO
    
    // TG List (RX Group List) index: byte at offset 43 (ChannelOne.rxGroupList)
    const rxGroupList = data[offset + 43];
    
    // Color code (txColor) at offset 44 - this is what the firmware uses
    // Note: The firmware struct has txColor at offset 44, not offset 42
    const colorCode = data[offset + 44];
    
    // APRS system index at offset 45 (ChannelOne.aprsConfigIndex)
    const aprsIndex = data[offset + 45];
    
    // Contact index: ushort at offset 46 (ChannelOne.contact)
    const contactIndex = view.getUint16(offset + 46, true);
    
    // Flags (same layout as ChannelOne)
    const flag1 = data[offset + 48];
    const flag2 = data[offset + 49];
    const flag4 = data[offset + 51];
    const bandwidth = (flag4 & 0x02) ? 25 : 12.5;   // flag4 bit 1 (Bandwidth)
    const timeslot = (flag2 & 0x40) ? 2 : 1;          // flag2 bit 6 (RepeaterSlot)
    
    // RX Only: flag4 bit 2 (ChannelOne.OnlyRx)
    const rxOnly = !!(flag4 & 0x04);
    
    // VOX: flag4 bit 6 (ChannelOne.Vox)
    const vox = (flag4 & 0x40) ? 'On' : 'Off';
    
    // Talker Alias TX settings - extracted from flag1 lower bits per firmware codeplug.h
    const ts1TaTxRaw = (flag1 >> 0) & 0x03;  // bits 0-1
    const ts2TaTxRaw = (flag1 >> 2) & 0x03;  // bits 2-3
    const talkerAliasOptions = ['Off', 'Text', 'APRS'];
    const ts1TalkerAliasTx = talkerAliasOptions[ts1TaTxRaw] || 'Off';
    const ts2TalkerAliasTx = talkerAliasOptions[ts2TaTxRaw] || 'Off';
    
    // Squelch: byte at offset 55
    const squelchByte = data[offset + 55];
    const squelch = squelchByte === 0 ? 'Disabled' : squelchByte.toString();
    
    return {
      rxFreq: rxFreq > 0 ? rxFreq : 145.500,
      txFreq: txFreq > 0 ? txFreq : 145.500,
      type: chMode === this.CH_MODE.DIGITAL ? 'Digital' : 'Analogue',
      power: this.POWER_LEVELS[powerLevel] || 'Master',
      bandwidth: bandwidth,
      rxTone: rxTone,
      txTone: txTone,
      squelch: squelch,
      colorCode: colorCode || 1,
      timeslot: timeslot,
      contact: null,         // Will be resolved after contacts are parsed
      contactIndex: contactIndex,
      tgList: null,          // Will be resolved after TG lists are parsed
      tgListIndex: rxGroupList,
      aprs: null,            // Will be resolved after APRS configs are parsed
      aprsIndex: aprsIndex,
      tot: tot,
      rxOnly: rxOnly,
      vox: vox,
      noBeep: noBeep,
      noEco: noEco,
      forceDmo: forceDmo,
      ts1TalkerAliasTx: ts1TalkerAliasTx,
      ts2TalkerAliasTx: ts2TalkerAliasTx
    };
  },
  
  /**
   * Parse APRS configs from binary data
   * Based on APRSForm.cs APRS_One structure
   */
  parseAPRS(data, view) {
    const aprsConfigs = [];
    const baseOffset = this.ADDR.APRS_SYSTEM;
    const configSize = this.SIZE.APRS_CONFIG;
    
    for (let i = 0; i < this.MAX.APRS_CONFIGS; i++) {
      const offset = baseOffset + i * configSize;
      
      // Check if APRS config is valid (name is not empty/0xFF)
      if (data[offset] === 0xFF || data[offset] === 0) {
        continue;
      }
      
      const aprsConfig = this.parseAPRSConfig(data, view, offset, i + 1);
      if (aprsConfig) {
        aprsConfigs.push(aprsConfig);
      }
    }
    
    return aprsConfigs;
  },
  
  /**
   * Parse a single APRS config from binary data
   * Structure (64 bytes):
   * - 0-7: name (8 bytes)
   * - 8: senderSSID (1 byte)
   * - 9-11: latitude (3 bytes, 24-bit encoded)
   * - 12-14: longitude (3 bytes, 24-bit encoded)
   * - 15-20: via1 (6 bytes)
   * - 21: via1SSID (1 byte)
   * - 22-27: via2 (6 bytes)
   * - 28: via2SSID (1 byte)
   * - 29: iconTable (1 byte)
   * - 30: iconIndex (1 byte)
   * - 31-54: comment (24 bytes)
   * - 55-58: txFreq (4 bytes, uint32)
   * - 59-60: reserved (2 bytes)
   * - 61: flags (1 byte)
   * - 62-63: magicVer (2 bytes)
   */
  parseAPRSConfig(data, view, offset, index) {
    // Name: 8 bytes
    const name = this.readString(data, offset, 8);
    if (!name || name.trim() === '') {
      return null;
    }
    
    // Sender SSID: 1 byte at offset 8
    const ssid = data[offset + 8];
    
    // Latitude: 3 bytes at offset 9 (24-bit encoded)
    const latBytes = (data[offset + 11] << 16) | (data[offset + 10] << 8) | data[offset + 9];
    const latitude = this.decodeLatLon24(latBytes);
    
    // Longitude: 3 bytes at offset 12 (24-bit encoded)
    const lonBytes = (data[offset + 14] << 16) | (data[offset + 13] << 8) | data[offset + 12];
    const longitude = this.decodeLatLon24(lonBytes);
    
    // Via1: 6 bytes at offset 15
    const via1 = this.readString(data, offset + 15, 6);
    
    // Via1 SSID: 1 byte at offset 21
    const via1SSID = data[offset + 21];
    
    // Via2: 6 bytes at offset 22
    const via2 = this.readString(data, offset + 22, 6);
    
    // Via2 SSID: 1 byte at offset 28
    const via2SSID = data[offset + 28];
    
    // Icon table: 1 byte at offset 29
    const iconTable = data[offset + 29];
    
    // Icon index: 1 byte at offset 30
    const iconIndex = data[offset + 30];
    
    // Comment: 24 bytes at offset 31
    const comment = this.readString(data, offset + 31, 24);
    
    // TX frequency: 4 bytes at offset 55 (stored as 10Hz steps)
    const txFreqRaw = view.getUint32(offset + 55, true);
    const txFreq = txFreqRaw > 0 ? (txFreqRaw / 100000).toFixed(5) : '';
    
    // Flags: 1 byte at offset 61
    const flags = data[offset + 61];
    const baudRate = flags & 0x01;               // bit 0: 0 = 1200, 1 = 300
    const usePosition = (flags & 0x02) !== 0;    // bit 1: use fixed position
    const transmitQsy = (flags & 0x04) !== 0;    // bit 2: transmit QSY info
    const beaconSilent = (flags & 0x08) !== 0;   // bit 3: beaconing silently
    const positionMasking = (flags >> 5) & 0x07; // bits 5-7: position masking level
    
    return {
      id: `aprs_${index}`,
      index: index,
      name: name.trim(),
      ssid: ssid >= 0 && ssid <= 15 ? ssid : 7,
      latitude: latitude,
      longitude: longitude,
      via1: via1.trim(),
      via1SSID: via1SSID >= 0 && via1SSID <= 15 ? via1SSID : 1,
      via2: via2.trim(),
      via2SSID: via2SSID >= 0 && via2SSID <= 15 ? via2SSID : 0,
      iconTable: iconTable >= 0 && iconTable <= 1 ? iconTable : 0,
      iconIndex: iconIndex >= 0 && iconIndex < 94 ? iconIndex : 0,
      comment: comment.trim(),
      txFreq: txFreq,
      baudRate: baudRate,
      usePosition: usePosition,
      transmitQsy: transmitQsy,
      beaconSilent: beaconSilent,
      positionMasking: positionMasking
    };
  },
  
  /**
   * Decode 24-bit latitude/longitude encoding used by OpenGD77
   * Format: bit 23 is sign, bits 0-22 represent degrees * 32768
   */
  decodeLatLon24(value) {
    const isNegative = (value & 0x800000) !== 0;
    const magnitude = value & 0x7FFFFF;
    const degrees = magnitude / 32768.0;
    return isNegative ? -degrees : degrees;
  },
  
  /**
   * Encode latitude/longitude to 24-bit format used by OpenGD77
   */
  encodeLatLon24(degrees) {
    const isNegative = degrees < 0;
    const magnitude = Math.round(Math.abs(degrees) * 32768);
    return isNegative ? (magnitude | 0x800000) : magnitude;
  },
  
  /**
   * Parse band limits from binary data
   */
  parseBandLimits(data, view) {
    // Band limits are typically stored in device info or general settings
    // Using default values if not found
    return {
      vhfMin: 127000000,
      vhfMax: 180000000,
      uhfMin: 380000000,
      uhfMax: 564000000
    };
  },
  
  /**
   * Parse theme colors from binary data
   * Theme is stored at ADDR.THEME (0x1EF00) as 10 RGB888 colors (30 bytes)
   * Color order: background, foreground, titleBackground, titleText,
   *              headerBackground, headerText, menuBackground, menuText,
   *              menuHighlightBackground, menuHighlightText
   */
  parseTheme(data, view) {
    const offset = this.ADDR.THEME;
    
    // Check if theme area has valid data (not all 0xFF)
    let hasData = false;
    for (let i = 0; i < 30; i++) {
      if (data[offset + i] !== 0xFF) {
        hasData = true;
        break;
      }
    }
    
    if (!hasData) {
      return null; // No theme data stored, use defaults
    }
    
    const colorNames = [
      'background', 'foreground', 'titleBackground', 'titleText',
      'headerBackground', 'headerText', 'menuBackground', 'menuText',
      'menuHighlightBackground', 'menuHighlightText'
    ];
    
    const theme = {};
    
    for (let i = 0; i < colorNames.length; i++) {
      const colorOffset = offset + (i * 3);
      const r = data[colorOffset];
      const g = data[colorOffset + 1];
      const b = data[colorOffset + 2];
      
      // Convert RGB888 to hex string
      theme[colorNames[i]] = '#' + 
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0');
    }
    
    return theme;
  },
  
  /**
   * Serialize theme colors to binary data
   * @param {Uint8Array} data - The binary buffer
   * @param {DataView} view - DataView for the buffer
   * @param {Object} theme - Theme colors as hex strings
   */
  serializeTheme(data, view, theme) {
    if (!theme) return;
    
    const offset = this.ADDR.THEME;
    
    const colorNames = [
      'background', 'foreground', 'titleBackground', 'titleText',
      'headerBackground', 'headerText', 'menuBackground', 'menuText',
      'menuHighlightBackground', 'menuHighlightText'
    ];
    
    for (let i = 0; i < colorNames.length; i++) {
      const colorHex = theme[colorNames[i]] || '#000000';
      const colorOffset = offset + (i * 3);
      
      // Parse hex color string to RGB values
      const hex = colorHex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      
      data[colorOffset] = r;
      data[colorOffset + 1] = g;
      data[colorOffset + 2] = b;
    }
  },
  
  /**
   * Parse BCD-encoded password
   */
  parseBcdPassword(bytes) {
    let password = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0xFF) break;
      const high = (bytes[i] >> 4) & 0x0F;
      const low = bytes[i] & 0x0F;
      if (high < 10) password += high.toString();
      if (low < 10 && low !== 0x0F) password += low.toString();
    }
    return password.replace(/F/g, '');
  },
  
  /**
   * Serialize codeplug data to G77 binary format
   * @param {Object} codeplug - The codeplug data
   * @returns {ArrayBuffer} The G77 binary data
   */
  serialize(codeplug) {
    // Create buffer filled with 0xFF
    const buffer = new ArrayBuffer(this.EEROM_SPACE);
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    
    // Fill with 0xFF (empty EEPROM state)
    data.fill(0xFF);
    
    // Write model identifier
    this.writeString(data, this.ADDR.MODEL, 'MD-760P', 8);
    
    // Write general settings
    this.serializeGeneralSettings(data, view, codeplug.general);
    
    // Write contacts first (needed for channel/tglist references)
    this.serializeContacts(data, view, codeplug.contacts);
    
    // Write TG lists
    this.serializeTGLists(data, view, codeplug.tgLists, codeplug.contacts);
    
    // Write scan lists
    this.serializeScanLists(data, view, codeplug.scanLists, codeplug.channels);
    
    // Write channels
    this.serializeChannels(data, view, codeplug.channels, codeplug.contacts, codeplug.tgLists, codeplug.aprs, codeplug.scanLists);
    
    // Write zones
    this.serializeZones(data, view, codeplug.zones, codeplug.channels);
    
    // Write DTMF settings
    this.serializeDTMF(data, view, codeplug.dtmfSettings);
    
    // Write DTMF contacts
    this.serializeDTMFContacts(data, view, codeplug.dtmf);
    
    // Write APRS configs
    this.serializeAPRS(data, view, codeplug.aprs);
    
    // Write VFO A and B
    this.serializeVFO(data, view, codeplug.vfoA, codeplug.vfoB, codeplug.contacts, codeplug.tgLists, codeplug.aprs);
    
    // Write theme colors
    this.serializeTheme(data, view, codeplug.theme);
    
    return buffer;
  },
  
  /**
   * Serialize general settings to binary
   */
  serializeGeneralSettings(data, view, general) {
    const offset = this.ADDR.GENERAL_SET;
    
    // Callsign: 8 bytes
    this.writeString(data, offset, general.callsign || '', 8);
    
    // Radio ID: 4 bytes BCD
    this.writeBcdId(data, offset + 8, general.dmrId || 0);
    
    // Boot content (info lines)
    this.writeString(data, this.ADDR.BOOT_CONTENT, general.infoLine1 || '', 16);
    this.writeString(data, this.ADDR.BOOT_CONTENT + 16, general.infoLine2 || '', 16);
    
    // Boot item settings
    const bootOffset = this.ADDR.BOOT_ITEM;
    data[bootOffset] = general.bootScreenMode || 0;
    data[bootOffset + 1] = general.bootPasswordEnabled ? 1 : 0;
    // Write boot password as BCD
    if (general.bootPassword) {
      this.writeBcdPassword(data, bootOffset + 4, general.bootPassword);
    }
  },
  
  /**
   * Write BCD-encoded password
   */
  writeBcdPassword(data, offset, password) {
    const paddedPwd = (password || '').padEnd(6, 'F');
    for (let i = 0; i < 3; i++) {
      const high = parseInt(paddedPwd[i * 2], 16) || 0x0F;
      const low = parseInt(paddedPwd[i * 2 + 1], 16) || 0x0F;
      data[offset + i] = (high << 4) | low;
    }
  },
  
  /**
   * Serialize scan lists to binary
   */
  serializeScanLists(data, view, scanLists, channels) {
    if (!scanLists || scanLists.length === 0) return;
    
    const baseOffset = this.ADDR.SCAN_LIST;
    const listDataOffset = baseOffset + 64;
    
    // Clear validity bitmap
    for (let i = 0; i < 64; i++) {
      data[baseOffset + i] = 0;
    }
    
    for (let i = 0; i < scanLists.length && i < this.MAX.SCAN_LISTS; i++) {
      const scanList = scanLists[i];
      
      // Set validity bit
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      data[baseOffset + byteIndex] |= (1 << bitIndex);
      
      const offset = listDataOffset + i * this.SIZE.SCAN_LIST;
      
      // Name: 15 bytes
      this.writeString(data, offset, scanList.name, 15);
      
      // Flag byte
      let flag = 0;
      if (scanList.talkback) flag |= 0x80;
      flag |= ((scanList.plType || 0) & 0x03) << 5;
      data[offset + 15] = flag;
      
      // Channel indices: 32 x 2-byte values
      const channelIndices = scanList.channelIndices || [];
      for (let j = 0; j < this.MAX.CHANNELS_PER_SCAN_LIST; j++) {
        if (j < channelIndices.length) {
          view.setUint16(offset + 16 + j * 2, channelIndices[j], true);
        } else {
          view.setUint16(offset + 16 + j * 2, 0, true);
        }
      }
      
      // Priority channels and TX designated channel
      const priCh1 = scanList.priorityCh1 === 'None' ? 0 : parseInt(scanList.priorityCh1) || 0;
      const priCh2 = scanList.priorityCh2 === 'None' ? 0 : parseInt(scanList.priorityCh2) || 0;
      const txCh = scanList.txDesignatedCh === 'Last Active' ? 0 : parseInt(scanList.txDesignatedCh) || 0;
      
      view.setUint16(offset + 80, priCh1, true);
      view.setUint16(offset + 82, priCh2, true);
      view.setUint16(offset + 84, txCh, true);
      
      data[offset + 86] = Math.round((scanList.signalingHold || 500) / 25);
      data[offset + 87] = Math.round((scanList.prioritySample || 2000) / 250);
    }
  },
  
  /**
   * Serialize DTMF settings to binary
   */
  serializeDTMF(data, view, dtmf) {
    if (!dtmf) return;
    
    const offset = this.ADDR.DTMF;
    
    // Self ID: 8 bytes
    this.writeDtmfString(data, offset, dtmf.selfId || '', 8);
    
    // Kill Code: 16 bytes
    this.writeDtmfString(data, offset + 8, dtmf.killCode || '', 16);
    
    // Wake Code: 16 bytes
    this.writeDtmfString(data, offset + 24, dtmf.wakeCode || '', 16);
    
    // Settings bytes
    data[offset + 40] = dtmf.delimiter || 13;
    data[offset + 41] = dtmf.groupCode || 14;
    // DecodeResp "None" is a valid value of 0, so only default when unset
    data[offset + 42] = (dtmf.decodeResp === undefined || dtmf.decodeResp === null) ? 3 : dtmf.decodeResp;
    data[offset + 43] = dtmf.autoResetTimer || 10;
    
    // Flag1
    let flag1 = 0;
    flag1 |= ((dtmf.killWakeDec || 0) & 0x01) << 7;
    flag1 |= ((dtmf.killType || 0) & 0x03) << 5;
    data[offset + 44] = flag1;
    
    // PTT ID codes
    this.writeDtmfString(data, offset + 48, dtmf.pttidUpCode || '', 30);
    this.writeDtmfString(data, offset + 80, dtmf.pttidDownCode || '', 30);
    
    // Timing parameters
    data[offset + 112] = dtmf.respHoldTime || 0;
    data[offset + 113] = dtmf.decTime || 0;
    data[offset + 114] = dtmf.fstDigitDly || 0;
    data[offset + 115] = dtmf.fstDur || 0;
    data[offset + 116] = dtmf.otherDur || 0;
    data[offset + 117] = dtmf.rate || 0;
    data[offset + 118] = dtmf.tail || 0;
  },
  
  /**
   * Write a DTMF string to binary data
   */
  writeDtmfString(data, offset, str, maxLen) {
    const dtmfChars = '0123456789ABCD*#';
    // Fill with 0xFF first
    for (let i = 0; i < maxLen; i++) {
      data[offset + i] = 0xFF;
    }
    // Write characters
    for (let i = 0; i < str.length && i < maxLen; i++) {
      const charIndex = dtmfChars.indexOf(str[i].toUpperCase());
      if (charIndex >= 0) {
        data[offset + i] = charIndex;
      }
    }
  },

  /**
   * Serialize a single VFO entry to binary (same layout as channel, 56 bytes)
   * 
   * Key offsets for VFO:
   * Offset 16-19: rxFreq (uint32, BCD)
   * Offset 20-23: txFreq (uint32, BCD)
   * Offset 24:    chMode (0=Analog, 1=Digital)
   * Offset 25:    power level
   * Offset 32-33: rxTone (uint16)
   * Offset 34-35: txTone (uint16)
   * Offset 36:    locationLon2 (unused for VFOs)
   * Offset 38:    LibreDMR_flag1 (0x40: noBeep, 0x20: noEco, 0x04: forceDmo)
   * Offset 43:    rxGroupList (TG List index)
   * Offset 44:    txColor (COLOR CODE - this is what firmware uses!)
   * Offset 45:    aprsSystem (APRS config index)
   * Offset 46-47: contact (uint16)
   * Offset 48:    flag1 (bits 0-1 = ts1TaTx, bits 2-3 = ts2TaTx)
   * Offset 49:    flag2 (bit 6 = timeslot)
   * Offset 51:    flag4 (bit 1 = bandwidth, bit 2 = rxOnly, bit 6 = vox)
   * Offset 55:    squelch
   */
  serializeVFOEntry(data, view, offset, vfo, contacts, tgLists, aprsConfigs) {
    if (!vfo) return;
    
    // Clear 56 bytes first
    data.fill(0xFF, offset, offset + this.SIZE.CHANNEL);
    
    // RX Frequency: 4 bytes BCD
    view.setUint32(offset + 16, this.frequencyToBcd(vfo.rxFreq), true);
    
    // TX Frequency: 4 bytes BCD
    view.setUint32(offset + 20, this.frequencyToBcd(vfo.txFreq), true);
    
    // Channel mode
    data[offset + 24] = vfo.type === 'Digital' ? this.CH_MODE.DIGITAL : this.CH_MODE.ANALOG;
    
    // Power level
    const powerIndex = this.POWER_LEVELS.indexOf(vfo.power);
    data[offset + 25] = powerIndex >= 0 ? powerIndex : 0;
    
    // TOT: byte at offset 27 (in 15-second increments)
    data[offset + 27] = Math.floor((vfo.tot || 0) / 15);
    
    // RX Tone: ushort at offset 32 (ChannelOne.rxTone)
    view.setUint16(offset + 32, this.encodeTone(vfo.rxTone), true);
    
    // TX Tone: ushort at offset 34 (ChannelOne.txTone)
    view.setUint16(offset + 34, this.encodeTone(vfo.txTone), true);
    
    // Offset 36 is locationLon2 - set to 0 for VFOs (not used)
    data[offset + 36] = 0;
    
    // LibreDMR_flag1 at offset 38 - per firmware codeplug.h:
    // 0x40: noBeep, 0x20: noEco, 0x04: forceDMO
    let libreDmrFlag1 = 0;
    if (vfo.noBeep) libreDmrFlag1 |= 0x40;       // bit 6: NO_BEEP
    if (vfo.noEco) libreDmrFlag1 |= 0x20;        // bit 5: NO_ECO
    if (vfo.forceDmo) libreDmrFlag1 |= 0x04;     // bit 2: FORCE_DMO
    data[offset + 38] = libreDmrFlag1;
    
    // RX Group List (TG List) index at offset 43
    const tgListIndex = tgLists ? this.findIndexByName(tgLists, vfo.tgList) : 0;
    data[offset + 43] = tgListIndex;
    
    // Color code (txColor) at offset 44 - this is what the firmware uses
    // Note: The firmware struct has txColor at offset 44, not offset 42
    // See CodeplugChannel_t in firmware/include/functions/codeplug.h
    data[offset + 44] = vfo.colorCode || 1;
    
    // APRS system index at offset 45
    const aprsIndex = aprsConfigs ? this.findIndexByName(aprsConfigs, vfo.aprs) : 0;
    data[offset + 45] = aprsIndex;
    
    // Contact index: ushort at offset 46
    const contactIndex = contacts ? this.findIndexByName(contacts, vfo.contact) : 0;
    view.setUint16(offset + 46, contactIndex, true);
    
    // Flag1 at offset 48: TA Tx (bits 0-1 = ts1TaTx, bits 2-3 = ts2TaTx) per firmware codeplug.h
    let flag1 = 0;
    const taOptions = { 'Off': 0, 'Text': 1, 'APRS': 2 };
    flag1 |= (taOptions[vfo.ts1TalkerAliasTx] || 0) & 0x03;
    flag1 |= ((taOptions[vfo.ts2TalkerAliasTx] || 0) & 0x03) << 2;
    data[offset + 48] = flag1;
    
    // Flag2 at offset 49: timeslot (bit 6)
    let flag2 = 0;
    if (vfo.timeslot === 2) flag2 |= 0x40;
    data[offset + 49] = flag2;
    
    // Flag4 at offset 51: bandwidth (bit 1), rxOnly (bit 2), vox (bit 6)
    let flag4 = 0;
    if (vfo.bandwidth === 25) flag4 |= 0x02;
    if (vfo.rxOnly) flag4 |= 0x04;
    if (vfo.vox === 'On') flag4 |= 0x40;
    data[offset + 51] = flag4;
    
    // Squelch
    data[offset + 55] = vfo.squelch === 'Disabled' ? 0 : parseInt(vfo.squelch) || 0;
  },
  
  /**
   * Serialize VFO A and B to binary
   */
  serializeVFO(data, view, vfoA, vfoB, contacts, tgLists, aprsConfigs) {
    if (vfoA) this.serializeVFOEntry(data, view, this.ADDR.VFO, vfoA, contacts, tgLists, aprsConfigs);
    if (vfoB) this.serializeVFOEntry(data, view, this.ADDR.VFO + this.SIZE.CHANNEL, vfoB, contacts, tgLists, aprsConfigs);
  },

  /**
   * Serialize APRS configs to binary
   */
  serializeAPRS(data, view, aprsConfigs) {
    if (!aprsConfigs || aprsConfigs.length === 0) return;
    
    const baseOffset = this.ADDR.APRS_SYSTEM;
    const configSize = this.SIZE.APRS_CONFIG;
    
    for (let i = 0; i < aprsConfigs.length && i < this.MAX.APRS_CONFIGS; i++) {
      const config = aprsConfigs[i];
      const offset = baseOffset + i * configSize;
      
      this.serializeAPRSConfig(data, view, offset, config);
    }
  },
  
  /**
   * Serialize a single APRS config to binary
   */
  serializeAPRSConfig(data, view, offset, config) {
    // Name: 8 bytes at offset 0
    this.writeString(data, offset, config.name || '', 8);
    
    // Sender SSID: 1 byte at offset 8
    data[offset + 8] = (config.ssid >= 0 && config.ssid <= 15) ? config.ssid : 7;
    
    // Latitude: 3 bytes at offset 9 (24-bit encoded)
    const latEncoded = this.encodeLatLon24(config.latitude || 0);
    data[offset + 9] = latEncoded & 0xFF;
    data[offset + 10] = (latEncoded >> 8) & 0xFF;
    data[offset + 11] = (latEncoded >> 16) & 0xFF;
    
    // Longitude: 3 bytes at offset 12 (24-bit encoded)
    const lonEncoded = this.encodeLatLon24(config.longitude || 0);
    data[offset + 12] = lonEncoded & 0xFF;
    data[offset + 13] = (lonEncoded >> 8) & 0xFF;
    data[offset + 14] = (lonEncoded >> 16) & 0xFF;
    
    // Via1: 6 bytes at offset 15 (C string - firmware uses strlen)
    this.writeCString(data, offset + 15, config.via1 || 'WIDE1', 6);
    
    // Via1 SSID: 1 byte at offset 21
    data[offset + 21] = (config.via1SSID >= 0 && config.via1SSID <= 15) ? config.via1SSID : 1;
    
    // Via2: 6 bytes at offset 22 (C string - firmware uses strlen)
    this.writeCString(data, offset + 22, config.via2 || 'WIDE2', 6);
    
    // Via2 SSID: 1 byte at offset 28
    data[offset + 28] = (config.via2SSID >= 0 && config.via2SSID <= 15) ? config.via2SSID : 1;
    
    // Icon table: 1 byte at offset 29
    data[offset + 29] = (config.iconTable >= 0 && config.iconTable <= 1) ? config.iconTable : 0;
    
    // Icon index: 1 byte at offset 30
    data[offset + 30] = (config.iconIndex >= 0 && config.iconIndex < 94) ? config.iconIndex : 15;
    
    // Comment: 24 bytes at offset 31
    // The firmware appends this with enqueueString(), which reads until a 0x00.
    // Pad with 0x00 (not 0xFF) or the padding is transmitted as part of the packet.
    this.writeCString(data, offset + 31, config.comment || '', 24);
    
    // TX frequency: 4 bytes at offset 55 (stored as 10Hz steps)
    let txFreqRaw = 0;
    if (config.txFreq && config.txFreq.trim() !== '') {
      const freqNum = parseFloat(config.txFreq);
      if (!isNaN(freqNum)) {
        txFreqRaw = Math.round(freqNum * 100000);
      }
    }
    view.setUint32(offset + 55, txFreqRaw, true);
    
    // Reserved: 2 bytes at offset 59
    data[offset + 59] = 0;
    data[offset + 60] = 0;
    
    // Flags: 1 byte at offset 61
    let flags = 0;
    flags |= (config.baudRate || 0) & 0x01;           // bit 0: baud rate
    if (config.usePosition) flags |= 0x02;            // bit 1: use position
    if (config.transmitQsy) flags |= 0x04;            // bit 2: transmit QSY
    if (config.beaconSilent) flags |= 0x08;           // bit 3: beacon silently
    flags |= ((config.positionMasking || 0) & 0x07) << 5;  // bits 5-7: position masking
    data[offset + 61] = flags;
    
    // Magic version: 2 bytes at offset 62 (0x4153 = 'AS' = APRS signature)
    view.setUint16(offset + 62, 16723, true); // 0x4153 in little endian
  },

  /**
   * Serialize contacts to binary
   */
  serializeContacts(data, view, contacts) {
    const offset = this.ADDR.DMR_CONTACT_EX;
    
    for (let i = 0; i < contacts.length && i < this.MAX.CONTACTS; i++) {
      const contact = contacts[i];
      const contactOffset = offset + i * this.SIZE.CONTACT;
      
      // Name: 16 bytes
      this.writeString(data, contactOffset, contact.name, 16);
      
      // Call ID: 4 bytes BCD
      this.writeBcdId(data, contactOffset + 16, contact.dmrId || 0);
      
      // Call type: 1 byte
      let callType = this.CALL_TYPE.GROUP;
      if (contact.type === CONFIG.CONTACT_TYPES.PRIVATE) callType = this.CALL_TYPE.PRIVATE;
      if (contact.type === CONFIG.CONTACT_TYPES.ALLCALL) callType = this.CALL_TYPE.ALLCALL;
      data[contactOffset + 20] = callType;
      
      // Call RX tone: 1 byte (default 0)
      data[contactOffset + 21] = 0;
      
      // Ring style: 1 byte (default 0)
      data[contactOffset + 22] = 0;
      
      // TS Override: 1 byte
      // TS1 = 0x00, None/Disabled = 0x01, TS2 = 0x02 (see codeplug.h flags)
      let tsOverride = 0x01;
      if (contact.tsOverride === '1') tsOverride = 0x00;
      if (contact.tsOverride === '2') tsOverride = 0x02;
      data[contactOffset + 23] = tsOverride;
    }
  },
  
  /**
   * Serialize channels to binary
   */
  serializeChannels(data, view, channels, contacts, tgLists, aprsConfigs, scanLists) {
    // Determine effective limits based on mode
    const effectiveMaxChannels = (typeof getEffectiveLimits === 'function') ? getEffectiveLimits().MAX_CHANNELS : this.MAX.CHANNELS;
    const isExtendedMode = effectiveMaxChannels > this.MAX.CHANNELS;
    const totalBanks = isExtendedMode ? SCANNER_LIMITS.CHANNELS_BANKS_MAX : 8;
    
    // Create channel validity bitmap for each bank
    const banks = [];
    for (let bank = 0; bank < totalBanks; bank++) {
      banks[bank] = new Array(128).fill(false);
    }
    
    // Mark valid channels
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= effectiveMaxChannels) {
        const bank = Math.floor((channel.number - 1) / SCANNER_LIMITS.CHANNELS_PER_BANK);
        const indexInBank = (channel.number - 1) % SCANNER_LIMITS.CHANNELS_PER_BANK;
        if (bank < totalBanks) {
          banks[bank][indexInBank] = true;
        }
      }
    }
    
    // Write bank 0 validity bitmap
    this.writeChannelBitmap(data, this.ADDR.CHANNEL, banks[0]);
    
    // Write banks 1-7 validity bitmaps (standard codeplug area)
    for (let bank = 1; bank < 8; bank++) {
      const bankOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK;
      this.writeChannelBitmap(data, bankOffset, banks[bank]);
    }
    
    // In extended mode, write bitmaps for banks 8+ that fit in the G77 buffer.
    // Banks 8-12 bitmaps overlap with contacts/TG list areas in the buffer,
    // which is correct for scanner firmware (those areas are repurposed).
    if (isExtendedMode) {
      for (let bank = 8; bank < totalBanks; bank++) {
        const bankOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK;
        if (bankOffset + 16 <= this.EEROM_SPACE) {
          this.writeChannelBitmap(data, bankOffset, banks[bank]);
        }
      }
    }
    
    // Write standard channel data (channels 1-1024) into G77 buffer
    for (const channel of channels) {
      if (channel.number < 1 || channel.number > this.MAX.CHANNELS) continue;
      
      const bank = Math.floor((channel.number - 1) / 128);
      const indexInBank = (channel.number - 1) % 128;
      
      let baseOffset;
      if (bank === 0) {
        baseOffset = this.ADDR.CHANNEL + 16;
      } else {
        baseOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK + 16;
      }
      
      const channelOffset = baseOffset + indexInBank * this.SIZE.CHANNEL;
      this.serializeChannel(data, view, channelOffset, channel, contacts, tgLists, aprsConfigs, scanLists);
    }
    
    // Generate extended channel data for channels 1025+ (scanner mode)
    if (isExtendedMode) {
      const extChannelCount = effectiveMaxChannels - this.MAX.CHANNELS;
      const extBufferSize = extChannelCount * SCANNER_LIMITS.CHANNEL_DATA_SIZE;
      const extBuffer = new ArrayBuffer(extBufferSize);
      const extData = new Uint8Array(extBuffer);
      const extView = new DataView(extBuffer);
      
      // Initialize to zeros - critical to prevent phantom channels.
      // The firmware reads bitmap data for banks 13+ from addresses within this
      // flash region. Zero-initialized data means those bitmaps read as "no valid
      // channels", preventing the firmware from wrapping to channel 16000.
      extData.fill(0);
      
      // Write extended channel data at contiguous offsets (matching firmware layout)
      for (const channel of channels) {
        if (channel.number <= this.MAX.CHANNELS || channel.number > effectiveMaxChannels) continue;
        
        const extIndex = channel.number - this.MAX.CHANNELS - 1;  // 0-based index
        const offset = extIndex * SCANNER_LIMITS.CHANNEL_DATA_SIZE;
        
        this.serializeChannel(extData, extView, offset, channel, contacts, tgLists, aprsConfigs, scanLists);
      }
      
      // Store extended data for retrieval by the write pipeline
      this._extendedChannelData = extData;
      
      // Collect bitmap data for banks whose bitmaps don't fit in the G77 buffer.
      // These need to be written as separate flash writes during codeplug write.
      // Flash address formula (matching firmware codeplug.c):
      //   FLASH_OFFSET + CODEPLUG_ADDR_CHANNEL_HEADER_FLASH + ((bank-1) * (128*56+16))
      //   = 0x20000 + 0x7B1B0 + ((bank-1) * 7184)
      //   = 0x9B1B0 + ((bank-1) * 7184)
      const STM32_FLASH_OFFSET = CONFIG.PROTOCOL.STM32_FLASH_OFFSET;  // Matches CONFIG.PROTOCOL.STM32_FLASH_OFFSET
      const CODEPLUG_CHANNEL_HEADER_FLASH = 0x7B1B0;
      const FLASH_BITMAP_BASE = STM32_FLASH_OFFSET + CODEPLUG_CHANNEL_HEADER_FLASH;  // 0x9B1B0
      this._extendedBitmaps = [];
      for (let bank = 8; bank < totalBanks; bank++) {
        const bankOffset = this.ADDR.EX_CH + (bank - 1) * this.SIZE.CHANNEL_BANK;
        if (bankOffset + 16 > this.EEROM_SPACE) {
          // This bank's bitmap doesn't fit in the G77 buffer - needs separate flash write
          const flashAddr = FLASH_BITMAP_BASE + ((bank - 1) * this.SIZE.CHANNEL_BANK);
          const bitmapBytes = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              if (banks[bank][i * 8 + bit]) {
                byte |= (1 << bit);
              }
            }
            bitmapBytes[i] = byte;
          }
          this._extendedBitmaps.push({ flashAddr, bitmap: bitmapBytes });
        }
      }
    } else {
      this._extendedChannelData = null;
      this._extendedBitmaps = null;
    }
  },
  
  /**
   * Write channel validity bitmap
   */
  writeChannelBitmap(data, offset, validChannels) {
    // 16 bytes = 128 bits, one per channel
    for (let i = 0; i < 16; i++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const channelIndex = i * 8 + bit;
        if (validChannels[channelIndex]) {
          byte |= (1 << bit);
        }
      }
      data[offset + i] = byte;
    }
  },
  
  /**
   * Serialize a single channel to binary
   * 
   * Channel data structure (56 bytes total) - matches CodeplugChannel_t in firmware:
   * Offset 0-15:  name[16]
   * Offset 16-19: rxFreq (uint32, BCD)
   * Offset 20-23: txFreq (uint32, BCD)
   * Offset 24:    chMode (0=Analog, 1=Digital)
   * Offset 25:    libreDMR_Power
   * Offset 26:    locationLat0 (LS byte)
   * Offset 27:    tot
   * Offset 28:    locationLat1
   * Offset 29:    locationLat2 (MS byte)
   * Offset 30:    locationLon0 (LS byte)
   * Offset 31:    locationLon1 / scanList
   * Offset 32-33: rxTone (uint16)
   * Offset 34-35: txTone (uint16)
   * Offset 36:    locationLon2 (MS byte) / voiceEmphasis
   * Offset 37:    _UNUSED_1 / DMR ID per channel
   * Offset 38:    LibreDMR_flag1
   * Offset 39:    rxSignaling
   * Offset 40:    artsInterval
   * Offset 41:    encrypt
   * Offset 42:    _UNUSED_2 (firmware doesn't use this)
   * Offset 43:    rxGroupList (TG List index)
   * Offset 44:    txColor (COLOR CODE - this is what firmware uses!)
   * Offset 45:    aprsConfigIndex
   * Offset 46-47: contact (uint16)
   * Offset 48:    flag1
   * Offset 49:    flag2 (bit 6 = timeslot)
   * Offset 50:    flag3
   * Offset 51:    flag4 (bandwidth, rx-only, skips, vox, power)
   * Offset 52-53: VFOoffsetFreq / reserve2
   * Offset 54:    VFOflag5 / reserve
   * Offset 55:    sql
   */
  serializeChannel(data, view, offset, channel, contacts, tgLists, aprsConfigs, scanLists) {
    // Name: 16 bytes
    this.writeString(data, offset, channel.name, 16);
    
    // RX Frequency: 4 bytes BCD
    view.setUint32(offset + 16, this.frequencyToBcd(channel.rxFreq), true);
    
    // TX Frequency: 4 bytes BCD
    view.setUint32(offset + 20, this.frequencyToBcd(channel.txFreq), true);
    
    // Channel mode
    data[offset + 24] = channel.type === CONFIG.CHANNEL_TYPES.DIGITAL ? this.CH_MODE.DIGITAL : this.CH_MODE.ANALOG;
    
    // Power level
    const powerIndex = this.POWER_LEVELS.indexOf(channel.power);
    data[offset + 25] = powerIndex >= 0 ? powerIndex : 0;
    
    // Latitude bytes: Lat0(offset 26)=LS, Lat1(offset 28), Lat2(offset 29)=MS per firmware codeplug.h
    if (channel.useLocation && channel.latitude) {
      const latEncoded = this.encodeLatitude(channel.latitude);
      data[offset + 26] = latEncoded & 0xFF;           // Lat0 = LS byte
      data[offset + 28] = (latEncoded >> 8) & 0xFF;    // Lat1 = middle byte
      data[offset + 29] = (latEncoded >> 16) & 0xFF;   // Lat2 = MS byte
    } else {
      data[offset + 26] = 0;
      data[offset + 28] = 0;
      data[offset + 29] = 0;
    }
    
    // TOT (in 15-second increments) at offset 27 (ChannelOne.tot)
    data[offset + 27] = Math.floor((channel.tot || 0) / 15);
    
    // Longitude bytes: Lon0(offset 30)=LS, Lon1(offset 31) per firmware codeplug.h
    // Note: offset 31 is shared with scanList for non-location channels
    if (channel.useLocation && channel.longitude) {
      const lonEncoded = this.encodeLongitude(channel.longitude);
      data[offset + 30] = lonEncoded & 0xFF;           // Lon0 = LS byte
      data[offset + 31] = (lonEncoded >> 8) & 0xFF;    // Lon1 = middle byte
    } else {
      data[offset + 30] = 0;
      // Scan list index at offset 31 (ChannelOne.scanList) - only for non-location channels
      const scanListIndex = scanLists ? this.findIndexByName(scanLists, channel.scanList) : 0;
      data[offset + 31] = scanListIndex;
    }
    
    // RX Tone: ushort at offset 32 (ChannelOne.rxTone)
    view.setUint16(offset + 32, this.encodeTone(channel.rxTone), true);
    
    // TX Tone: ushort at offset 34 (ChannelOne.txTone)
    view.setUint16(offset + 34, this.encodeTone(channel.txTone), true);
    
    // Offset 36 is Lon2 (longitude MS byte) per firmware codeplug.h
    // For non-location channels, set to 0 (voiceEmphasis default)
    if (channel.useLocation && channel.longitude) {
      const lonEncoded = this.encodeLongitude(channel.longitude);
      data[offset + 36] = (lonEncoded >> 16) & 0xFF;   // Lon2 = MS byte
    } else {
      data[offset + 36] = 0;
    }
    
    // DMR ID per channel at offset 37 (ChannelOne.txSignaling, repurposed by OpenGD77)
    const dmrIdValue = channel.dmrId === 'None' ? 0 : (parseInt(channel.dmrId) || 0);
    data[offset + 37] = dmrIdValue;
    
    // LibreDMR_flag1 at offset 38 - per firmware codeplug.h:
    // 0x80: Optional DMRID, 0x40: noBeep, 0x20: noEco, 0x10: OutOfBand
    // 0x08: useLocation, 0x04: forceDMO, 0x01: roaming
    let libreDmrFlag1 = 0;
    if (channel.noBeep) libreDmrFlag1 |= 0x40;       // bit 6: NO_BEEP
    if (channel.noEco) libreDmrFlag1 |= 0x20;        // bit 5: NO_ECO
    if (channel.useLocation) libreDmrFlag1 |= 0x08;  // bit 3: USE_LOCATION
    if (channel.forceDmo) libreDmrFlag1 |= 0x04;     // bit 2: FORCE_DMO
    data[offset + 38] = libreDmrFlag1;
    
    // Offsets 39-41 are rxSignaling, artsInterval, encrypt - unused, set to 0
    data[offset + 39] = 0;
    data[offset + 40] = 0;
    data[offset + 41] = 0;
    
    // _UNUSED_2 at offset 42 (firmware doesn't use this)
    data[offset + 42] = 0;
    
    // RX Group List (TG List) index at offset 43 (ChannelOne.rxGroupList)
    const tgListIndex = this.findIndexByName(tgLists, channel.tgList);
    data[offset + 43] = tgListIndex;
    
    // Color code (txColor) at offset 44 - this is what the firmware uses
    data[offset + 44] = (channel.colorCode ?? 1);
    
    // APRS system index at offset 45 (ChannelOne.aprsConfigIndex)
    const aprsIndex = aprsConfigs ? this.findIndexByName(aprsConfigs, channel.aprs) : 0;
    data[offset + 45] = aprsIndex;
    
    // Contact index: ushort at offset 46 (ChannelOne.contact)
    const contactIndex = this.findIndexByName(contacts, channel.contact);
    view.setUint16(offset + 46, contactIndex, true);
    
    // Flag1 at offset 48 (ChannelOne.flag1) - lower 4 bits TA Tx control per firmware codeplug.h
    let flag1 = 0;
    const talkerAliasOptions = ['Off', 'Text', 'APRS'];
    const ts1TaIdx = talkerAliasOptions.indexOf(channel.ts1TalkerAliasTx || 'Off');
    if (ts1TaIdx > 0) flag1 |= (ts1TaIdx & 0x03);
    const ts2TaIdx = talkerAliasOptions.indexOf(channel.ts2TalkerAliasTx || 'Off');
    if (ts2TaIdx > 0) flag1 |= ((ts2TaIdx & 0x03) << 2);
    data[offset + 48] = flag1;
    
    // Flag2 at offset 49 (ChannelOne.flag2)
    let flag2 = 0;
    // Timeslot: flag2 bit 6 (ChannelOne.RepeaterSlot: 0=TS1, 1=TS2)
    if (channel.timeslot === 2) flag2 |= 0x40;
    data[offset + 49] = flag2;
    
    // Flag3 at offset 50, Flag4 at offset 51 (ChannelOne.flag3, flag4)
    // Flag3 at offset 50, Flag4 at offset 51 - per firmware codeplug.h
    // Longitude is stored at offsets 30, 31, 36 (not 50-51), so flags are always valid
    let flag4 = 0;
    if (channel.vox === 'On') flag4 |= 0x40;      // Vox: bit 6
    if (channel.zoneSkip) flag4 |= 0x20;           // Zone skip (AutoScan): bit 5
    if (channel.allSkip) flag4 |= 0x10;            // All skip (LoneWorker): bit 4
    if (channel.rxOnly) flag4 |= 0x04;             // RX only (OnlyRx): bit 2
    if (channel.bandwidth === 25) flag4 |= 0x02;   // Bandwidth: bit 1
    
    data[offset + 50] = 0;     // flag3
    data[offset + 51] = flag4;
    
    // Override DMR ID at offset 52-55 (ChannelOne.reserve2+reserve+sql, repurposed by OpenGD77)
    if (channel.overrideDmrId && channel.overrideDmrId > 0) {
      this.writeBcdId(data, offset + 52, channel.overrideDmrId);
    } else {
      // Clear override DMR ID
      data[offset + 52] = 0xFF;
      data[offset + 53] = 0xFF;
      data[offset + 54] = 0xFF;
      data[offset + 55] = 0xFF;
    }
    
    // Squelch level at offset 55 (ChannelOne.sql)
    if (!channel.overrideDmrId || channel.overrideDmrId === 0) {
      data[offset + 55] = channel.squelch === 'Disabled' ? 0 : parseInt(channel.squelch) || 0;
    }
  },
  
  /**
   * Serialize channel with scan list support
   * Note: Scan list index is written in serializeChannel via offset 31
   */
  updateChannelScanList(data, offset, channel, scanLists) {
    // Scan list index at offset 31
    if (channel.scanList && scanLists) {
      const scanListIndex = this.findIndexByName(scanLists, channel.scanList);
      data[offset + 31] = scanListIndex;
    } else {
      data[offset + 31] = 0;
    }
  },
  
  /**
   * Encode latitude to firmware Fixed24 format
   * Firmware format: bit 23 = sign, bits 22-15 = integer part, bits 14-0 = decimal part (×10000)
   */
  encodeLatitude(lat) {
    lat = Math.max(-90, Math.min(90, lat || 0));
    const intPart = Math.abs(Math.trunc(lat));
    const decimalPart = Math.abs(Math.trunc((lat - Math.trunc(lat)) * 10000));
    let fixedVal = (intPart << 15) + decimalPart;
    if (lat < 0) {
      fixedVal |= 0x800000;  // set MSB for negative
    }
    return fixedVal;
  },
  
  /**
   * Decode latitude from firmware Fixed24 format
   * Firmware format: bit 23 = sign, bits 22-15 = integer part, bits 14-0 = decimal part (×10000)
   */
  decodeLatitude(encoded) {
    if (encoded === 0) return 0;
    const intPart = (encoded & 0x7FFFFF) >> 15;
    const decimalPart = encoded & 0x7FFF;
    let result = intPart + (decimalPart * 0.0001);
    if (encoded & 0x800000) {
      result = -result;
    }
    return result;
  },
  
  /**
   * Encode longitude to firmware Fixed24 format
   * Firmware format: bit 23 = sign, bits 22-15 = integer part, bits 14-0 = decimal part (×10000)
   */
  encodeLongitude(lon) {
    lon = Math.max(-180, Math.min(180, lon || 0));
    const intPart = Math.abs(Math.trunc(lon));
    const decimalPart = Math.abs(Math.trunc((lon - Math.trunc(lon)) * 10000));
    let fixedVal = (intPart << 15) + decimalPart;
    if (lon < 0) {
      fixedVal |= 0x800000;  // set MSB for negative
    }
    return fixedVal;
  },
  
  /**
   * Decode longitude from firmware Fixed24 format
   * Firmware format: bit 23 = sign, bits 22-15 = integer part, bits 14-0 = decimal part (×10000)
   */
  decodeLongitude(encoded) {
    if (encoded === 0) return 0;
    const intPart = (encoded & 0x7FFFFF) >> 15;
    const decimalPart = encoded & 0x7FFF;
    let result = intPart + (decimalPart * 0.0001);
    if (encoded & 0x800000) {
      result = -result;
    }
    return result;
  },
  
  /**
   * Serialize TG lists to binary
   */
  serializeTGLists(data, view, tgLists, contacts) {
    const offset = this.ADDR.RX_GRP_LIST_EX;
    
    // Write count bitmap (128 bytes)
    for (let i = 0; i < 128; i++) {
      if (i < tgLists.length) {
        // Count of contacts in this TG list
        data[offset + i] = Math.min(tgLists[i].contacts?.length || 0, this.MAX.CONTACTS_PER_TGLIST);
      } else {
        data[offset + i] = 0;
      }
    }
    
    const listDataOffset = offset + 128;
    
    for (let i = 0; i < tgLists.length && i < this.MAX.TGLISTS; i++) {
      const tgList = tgLists[i];
      const tgListOffset = listDataOffset + i * this.SIZE.TGLIST;
      
      // Name: 16 bytes
      this.writeString(data, tgListOffset, tgList.name, 16);
      
      // Contact indices: 32 x 2-byte values
      for (let j = 0; j < this.MAX.CONTACTS_PER_TGLIST; j++) {
        const contactName = tgList.contacts?.[j];
        const contactIndex = contactName ? this.findIndexByName(contacts, contactName) : 0;
        view.setUint16(tgListOffset + 16 + j * 2, contactIndex, true);
      }
    }
  },
  
  /**
   * Serialize zones to binary
   * Writes the 32-byte zone bitmap at ZONE_LIST + 16 and zone data at EX_ZONE_LIST.
   */
  serializeZones(data, view, zones, channels) {
    // Use effective zone size and channel count based on mode
    const effectiveMaxChannelsPerZone = (typeof getEffectiveLimits === 'function') ? getEffectiveLimits().MAX_CHANNELS_PER_ZONE : this.MAX.CHANNELS_PER_ZONE;
    const effectiveZoneSize = (effectiveMaxChannelsPerZone > this.MAX.CHANNELS_PER_ZONE)
      ? SCANNER_LIMITS.ZONE_STRUCT_SIZE : this.SIZE.ZONE;
    
    // Write zone validity bitmap (32 bytes at ZONE_LIST + 16 = 0x8010)
    const bitmapOffset = this.ADDR.ZONE_LIST + 16;
    // Clear bitmap first
    for (let i = 0; i < 32; i++) {
      data[bitmapOffset + i] = 0;
    }
    // Set bits for valid zones
    for (let i = 0; i < zones.length && i < this.MAX.ZONES; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      data[bitmapOffset + byteIndex] |= (1 << bitIndex);
    }
    
    const offset = this.ADDR.EX_ZONE_LIST;
    
    for (let i = 0; i < zones.length && i < this.MAX.ZONES; i++) {
      const zone = zones[i];
      const zoneOffset = offset + i * effectiveZoneSize;
      
      // Prevent writing beyond the G77 buffer
      if (zoneOffset + effectiveZoneSize > this.EEROM_SPACE) break;
      
      // Name: 16 bytes
      this.writeString(data, zoneOffset, zone.name, 16);
      
      // Channel indices: N x 2-byte values (80 standard, 256 scanner)
      for (let j = 0; j < effectiveMaxChannelsPerZone; j++) {
        const channelName = zone.channels?.[j];
        const channelIndex = channelName ? this.findChannelIndexByName(channels, channelName) : 0;
        view.setUint16(zoneOffset + 16 + j * 2, channelIndex, true);
      }
    }
  },
  
  // ==================== Utility Functions ====================
  
  /**
   * Read a null/0xFF terminated string from binary data
   * Uses Latin-1 (ISO-8859-1) encoding which is compatible with ASCII and
   * preserves extended characters (0x80-0xFF) that GB2312 ASCII subset uses.
   * 
   * The OpenGD77 CPS uses GB2312 encoding (Settings.smethod_25/26), but for
   * ASCII characters (0x00-0x7F) this is identical to ASCII/Latin-1.
   * For extended characters (0x80-0xFF), Latin-1 provides a reasonable fallback.
   */
  readString(data, offset, maxLen) {
    // Find the actual string length (terminated by 0xFF or 0x00)
    let actualLen = 0;
    for (let i = 0; i < maxLen; i++) {
      const byte = data[offset + i];
      if (byte === 0xFF || byte === 0x00) break;
      actualLen++;
    }
    
    if (actualLen === 0) return '';
    
    // Use TextDecoder with Latin-1 (ISO-8859-1) encoding
    // This preserves all byte values 0x00-0xFF correctly as Unicode code points
    try {
      const decoder = new TextDecoder('iso-8859-1');
      const bytes = data.slice(offset, offset + actualLen);
      return decoder.decode(bytes).trim();
    } catch (e) {
      // Fallback to manual decoding if TextDecoder fails
      let str = '';
      for (let i = 0; i < actualLen; i++) {
        str += String.fromCharCode(data[offset + i]);
      }
      return str.trim();
    }
  },
  
  /**
   * Write a string to binary data, padded with 0xFF
   * Uses Latin-1 (ISO-8859-1) encoding for proper byte conversion.
   * Characters outside the Latin-1 range (> 0xFF) are replaced with '?'.
   */
  writeString(data, offset, str, maxLen) {
    // Using TextEncoder would encode to UTF-8, but we need single-byte encoding
    // So we manually convert, clamping characters to the Latin-1 range
    const s = str == null ? '' : String(str);
    for (let i = 0; i < maxLen; i++) {
      if (i < s.length) {
        const charCode = s.charCodeAt(i);
        // Clamp to Latin-1 range (0-255), replace out-of-range with '?'
        data[offset + i] = charCode <= 0xFF ? charCode : 0x3F;
      } else {
        data[offset + i] = 0xFF;
      }
    }
  },
  
  /**
   * Write a null-terminated C string, padding with 0x00.
   *
   * Some codeplug fields (e.g. the APRS comment and path names) are read by the
   * firmware with strlen()/enqueueString() which stop at a 0x00 byte. Using the
   * 0xFF padding of writeString() there causes the padding to be transmitted as
   * part of the APRS packet (breaking aprs.fi decoding).
   */
  writeCString(data, offset, str, maxLen) {
    const s = str || '';
    for (let i = 0; i < maxLen; i++) {
      if (i < s.length) {
        const charCode = s.charCodeAt(i);
        data[offset + i] = charCode <= 0xFF ? charCode : 0x3F;
      } else {
        data[offset + i] = 0x00;
      }
    }
  },
  
  /**
   * Parse BCD-encoded DMR ID
   */
  parseBcdId(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      const high = (bytes[i] >> 4) & 0x0F;
      const low = bytes[i] & 0x0F;
      if (high <= 9) str += high.toString();
      if (low <= 9) str += low.toString();
    }
    return parseInt(str, 10) || 0;
  },
  
  /**
   * Write BCD-encoded DMR ID
   */
  writeBcdId(data, offset, id) {
    const str = id.toString().padStart(8, '0');
    for (let i = 0; i < 4; i++) {
      const high = parseInt(str[i * 2], 10) || 0;
      const low = parseInt(str[i * 2 + 1], 10) || 0;
      data[offset + i] = (high << 4) | low;
    }
  },
  
  /**
   * Convert BCD frequency value to decimal MHz
   */
  bcdToFrequency(bcd) {
    // Frequency is stored as BCD in 10Hz steps
    // e.g., 0x43340000 = 433.40000 MHz
    let str = bcd.toString(16).padStart(8, '0');
    let freq = parseInt(str, 10) / 100000;
    return freq;
  },
  
  /**
   * Convert frequency in MHz to BCD
   */
  frequencyToBcd(freq) {
    // Convert MHz to 10Hz steps as BCD
    if (!Number.isFinite(freq) || freq < 0) {
      throw new Error(`Invalid frequency: ${freq}`);
    }
    const value = Math.round(freq * 100000);
    const str = value.toString().padStart(8, '0');
    return parseInt(str, 16);
  },
  
  /**
   * Convert integer to BCD (Binary Coded Decimal) format
   * Used for CTCSS tones in STM32 codeplugs
   * Example: 885 (decimal) -> 0x0885 (BCD)
   * @param {number} value - Non-negative integer value to convert
   * @returns {number} BCD encoded value, or 0 for invalid input
   */
  intToBcd(value) {
    // Handle invalid inputs
    if (value <= 0 || !Number.isFinite(value)) {
      return 0;
    }
    value = Math.floor(value);  // Ensure integer
    let result = 0;
    let shift = 0;
    while (value > 0) {
      result += (value % 10) << shift;
      value = Math.floor(value / 10);
      shift += 4;
    }
    return result;
  },
  
  /**
   * Convert BCD (Binary Coded Decimal) to integer
   * Used for reading CTCSS tones from STM32 codeplugs
   * Example: 0x0885 (BCD) -> 885 (decimal)
   * @param {number} bcd - BCD encoded value (each nibble must be 0-9)
   * @returns {number} Decoded integer value, or 0 for invalid BCD
   */
  bcdToInt(bcd) {
    // Handle invalid inputs
    if (bcd <= 0 || !Number.isFinite(bcd)) {
      return 0;
    }
    bcd = Math.floor(bcd);  // Ensure integer
    let result = 0;
    let multiplier = 1;
    while (bcd > 0) {
      const digit = bcd & 0x0F;
      // Validate that each nibble is a valid BCD digit (0-9)
      if (digit > 9) {
        return 0;  // Invalid BCD - nibble contains A-F
      }
      result += digit * multiplier;
      bcd >>= 4;
      multiplier *= 10;
    }
    return result;
  },
  
  /**
   * Format a DCS code value as octal string with suffix
   * @param {number} code - The DCS code value (0-0xFFF)
   * @param {string} suffix - 'N' for Normal, 'I' for Inverted
   * @returns {string} Formatted DCS code (e.g., "D023N")
   */
  formatDcsCode(code, suffix) {
    return 'D' + code.toString(8).padStart(3, '0') + suffix;
  },
  
  /**
   * Parse CTCSS/DCS tone value from codeplug
   * CTCSS tones are stored in BCD format as tone * 10 (e.g., 0x0670 = 67.0 Hz)
   * DCS codes use upper bits as type flags
   */
  parseTone(value) {
    if (value === 0 || value === 0xFFFF) return 'None';
    
    // DCS codes: check upper 2 bits (0xC000 mask)
    // 0xC000 (bits 15 & 14 set) = DCS Inverted
    // 0x8000 (bit 15 set only) = DCS Normal
    const dcsMask = value & 0xC000;
    if (dcsMask === 0xC000) {
      // DCS Inverted - both bits 15 and 14 are set
      const code = value & 0x0FFF;
      return this.formatDcsCode(code, 'I');
    } else if (dcsMask === 0x8000) {
      // DCS Normal - only bit 15 is set
      const code = value & 0x0FFF;
      return this.formatDcsCode(code, 'N');
    }
    
    // CTCSS tones are stored in BCD format as tone * 10
    // e.g., 0x0885 (BCD) = 885 -> 88.5 Hz
    const intValue = this.bcdToInt(value);
    const tone = (intValue / 10).toFixed(1);
    if (this.TONES_LIST.includes(tone)) {
      return tone;
    }
    
    return 'None';
  },
  
  /**
   * Encode CTCSS/DCS tone for binary storage
   * DCS format: D{octal_code}N for normal, D{octal_code}I for inverted
   * CTCSS format: numeric frequency (e.g., "88.5") - stored in BCD
   */
  encodeTone(tone) {
    if (!tone || tone === 'None') return 0xFFFF;
    
    // DCS code (starts with 'D')
    if (tone.startsWith('D')) {
      // Check for Normal (N) or Inverted (I) suffix
      const lastChar = tone.charAt(tone.length - 1).toUpperCase();
      let codeStr;
      let baseMask;
      
      if (lastChar === 'N') {
        // DCS Normal: D{code}N - bit 15 set (0x8000)
        codeStr = tone.substring(1, tone.length - 1);
        baseMask = 0x8000;
      } else if (lastChar === 'I') {
        // DCS Inverted: D{code}I - bits 15 and 14 set (0xC000)
        codeStr = tone.substring(1, tone.length - 1);
        baseMask = 0xC000;
      } else {
        // Legacy format without suffix (e.g., "D023") - treat as Normal
        codeStr = tone.substring(1);
        baseMask = 0x8000;
      }
      
      // Parse the octal DCS code
      const code = parseInt(codeStr, 8);
      if (!isNaN(code) && code >= 0 && code <= 0xFFF) {
        return baseMask | code;
      }
      // Invalid DCS code - return None
      return 0xFFFF;
    }
    
    // CTCSS tone - convert to BCD format
    // e.g., 88.5 Hz -> 885 -> 0x0885 (BCD)
    const freq = parseFloat(tone);
    if (!isNaN(freq)) {
      const intValue = Math.round(freq * 10);
      return this.intToBcd(intValue);
    }
    
    return 0xFFFF;
  },
  
  /**
   * Find index of item by name in array
   */
  findIndexByName(items, name) {
    if (!name || !items) return 0;
    const index = items.findIndex(item => item.name === name);
    return index >= 0 ? index + 1 : 0;  // 1-based index, 0 = none
  },
  
  /**
   * Find channel index (number) by name
   */
  findChannelIndexByName(channels, name) {
    if (!name || !channels) return 0;
    const channel = channels.find(ch => ch.name === name);
    return channel ? channel.number : 0;
  },
  
  /**
   * Resolve references after parsing (contacts, tg lists in channels, etc.)
   * Note: index values from binary are 1-based positions in the full capacity arrays,
   * not sequential indices into the parsed (sparse) arrays.
   */
  resolveReferences(codeplug) {
    // Resolve contact references in channels
    for (const channel of codeplug.channels) {
      if (channel.contactIndex > 0 && channel.contactIndex <= this.MAX.CONTACTS) {
        const contact = codeplug.contacts.find(c => c.index === channel.contactIndex);
        if (contact) channel.contact = contact.name;
      }
      delete channel.contactIndex;
      
      if (channel.tgListIndex > 0 && channel.tgListIndex <= this.MAX.TGLISTS) {
        const tgList = codeplug.tgLists.find(t => t.index === channel.tgListIndex);
        if (tgList) channel.tgList = tgList.name;
      }
      delete channel.tgListIndex;
      
      // Resolve APRS reference
      if (channel.aprsIndex > 0 && codeplug.aprs && channel.aprsIndex <= this.MAX.APRS_CONFIGS) {
        const aprsConfig = codeplug.aprs.find(a => a.index === channel.aprsIndex);
        if (aprsConfig) channel.aprs = aprsConfig.name;
      } else {
        channel.aprs = 'None';
      }
      delete channel.aprsIndex;
      
      // Resolve scan list reference
      if (channel.scanListIndex > 0 && codeplug.scanLists && channel.scanListIndex <= this.MAX.SCAN_LISTS) {
        const scanList = codeplug.scanLists.find(s => s.index === channel.scanListIndex);
        if (scanList) channel.scanList = scanList.name;
      }
      delete channel.scanListIndex;
    }
    
    // Resolve VFO A references
    if (codeplug.vfoA) {
      if (codeplug.vfoA.contactIndex > 0 && codeplug.vfoA.contactIndex <= this.MAX.CONTACTS) {
        const contact = codeplug.contacts.find(c => c.index === codeplug.vfoA.contactIndex);
        if (contact) codeplug.vfoA.contact = contact.name;
      }
      if (!codeplug.vfoA.contact) codeplug.vfoA.contact = 'None';
      delete codeplug.vfoA.contactIndex;
      
      if (codeplug.vfoA.tgListIndex > 0 && codeplug.vfoA.tgListIndex <= this.MAX.TGLISTS) {
        const tgList = codeplug.tgLists.find(t => t.index === codeplug.vfoA.tgListIndex);
        if (tgList) codeplug.vfoA.tgList = tgList.name;
      }
      if (!codeplug.vfoA.tgList) codeplug.vfoA.tgList = 'None';
      delete codeplug.vfoA.tgListIndex;
      
      if (codeplug.vfoA.aprsIndex > 0 && codeplug.aprs && codeplug.vfoA.aprsIndex <= this.MAX.APRS_CONFIGS) {
        const aprsConfig = codeplug.aprs.find(a => a.index === codeplug.vfoA.aprsIndex);
        if (aprsConfig) codeplug.vfoA.aprs = aprsConfig.name;
      }
      if (!codeplug.vfoA.aprs) codeplug.vfoA.aprs = 'None';
      delete codeplug.vfoA.aprsIndex;
    }
    
    // Resolve VFO B references
    if (codeplug.vfoB) {
      if (codeplug.vfoB.contactIndex > 0 && codeplug.vfoB.contactIndex <= this.MAX.CONTACTS) {
        const contact = codeplug.contacts.find(c => c.index === codeplug.vfoB.contactIndex);
        if (contact) codeplug.vfoB.contact = contact.name;
      }
      if (!codeplug.vfoB.contact) codeplug.vfoB.contact = 'None';
      delete codeplug.vfoB.contactIndex;
      
      if (codeplug.vfoB.tgListIndex > 0 && codeplug.vfoB.tgListIndex <= this.MAX.TGLISTS) {
        const tgList = codeplug.tgLists.find(t => t.index === codeplug.vfoB.tgListIndex);
        if (tgList) codeplug.vfoB.tgList = tgList.name;
      }
      if (!codeplug.vfoB.tgList) codeplug.vfoB.tgList = 'None';
      delete codeplug.vfoB.tgListIndex;
      
      if (codeplug.vfoB.aprsIndex > 0 && codeplug.aprs && codeplug.vfoB.aprsIndex <= this.MAX.APRS_CONFIGS) {
        const aprsConfig = codeplug.aprs.find(a => a.index === codeplug.vfoB.aprsIndex);
        if (aprsConfig) codeplug.vfoB.aprs = aprsConfig.name;
      }
      if (!codeplug.vfoB.aprs) codeplug.vfoB.aprs = 'None';
      delete codeplug.vfoB.aprsIndex;
    }
    
    // Resolve contact references in TG lists
    for (const tgList of codeplug.tgLists) {
      tgList.contacts = [];
      if (tgList.contactIndices) {
        for (const contactIndex of tgList.contactIndices) {
          const contact = codeplug.contacts.find(c => c.index === contactIndex);
          if (contact) tgList.contacts.push(contact.name);
        }
        delete tgList.contactIndices;
      }
    }
    
    // Resolve channel references in zones
    for (const zone of codeplug.zones) {
      zone.channels = [];
      if (zone.channelIndices) {
        for (const channelIndex of zone.channelIndices) {
          const channel = codeplug.channels.find(c => c.number === channelIndex);
          if (channel) zone.channels.push(channel.name);
        }
        delete zone.channelIndices;
      }
    }
    
    // Resolve channel references in scan lists
    for (const scanList of codeplug.scanLists) {
      scanList.channels = [];
      if (scanList.channelIndices) {
        for (const channelIndex of scanList.channelIndices) {
          const channel = codeplug.channels.find(c => c.number === channelIndex);
          if (channel) scanList.channels.push(channel.name);
        }
        delete scanList.channelIndices;
      }
    }
    
    // Clean up index properties from contacts
    for (const contact of codeplug.contacts) {
      delete contact.index;
    }
    
    return codeplug;
  }
};

// Make G77 available globally
window.G77 = G77;
