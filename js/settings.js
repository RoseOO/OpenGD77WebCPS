/**
 * OpenGD77 CPS Web - Radio Preferences (settingsStruct_t) codec
 *
 * The firmware stores every user preference (display, sound, radio, general,
 * APRS/GPS flags, ...) in a single `settingsStruct_t` at EEPROM address 0x604B
 * (see firmware interfaces/settingsStorage.c: STORAGE_BASE_ADDRESS = 0x6000 + 0x4B).
 *
 * The official CPS only exposes this as an opaque 128-byte Backup/Restore blob
 * (decompiled OpenGD77Form.cs BACKUP_SETTINGS / RESTORE_SETTINGS). This module
 * decodes the individual fields so the web CPS can present them and the clone
 * flow can rewrite callsign/DMR-ID while preserving every preference.
 *
 * Layout notes:
 * - Field offsets are identical for every platform up to and including
 *   `autolockTimer`. After that the tail depends on the platform:
 *     * `squelchDefaults[]` is 3 bytes on MK22 / MD-UV380 / DM-1701, but 2 on MD-9600
 *     * a `gpsModeAndBaudsIndex` byte only exists when HAS_GPS is defined
 * - The bit positions inside `bitfieldOptions` differ between MK22 and STM32,
 *   so flags are mapped by name, never copied raw across platforms.
 * - We deliberately only patch known preference bytes; every other byte of the
 *   blob is preserved (magic, runtime indices, calibration-adjacent fields).
 *
 * Pure data module: usable from the browser (window.RadioSettings) and Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RadioSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Non-volatile settings blob
  const ADDR = 0x604B;      // EEPROM address of settingsStruct_t
  const STRUCT_SIZE = 116;  // sizeof(settingsStruct_t) on the supported platforms
  const READ_SIZE = 128;    // window used by the official CPS Backup/Restore
  const STORAGE_MAGIC = 0x4784; // STORAGE_MAGIC_NUMBER (settings.c)

  // ---------------------------------------------------------------------------
  // Field layout
  // ---------------------------------------------------------------------------

  // Ordered declaration matching settings.h. `hidden` fields are preserved
  // verbatim but not surfaced to the editor.
  const DECL = [
    { key: 'magicNumber', type: 'u32', hidden: true },
    { key: 'location.lat', type: 'u32', hidden: true },
    { key: 'location.lon', type: 'u32', hidden: true },
    { key: 'timezone', type: 'u8' },
    { key: 'beepOptions', type: 'u8' },
    { key: 'vfoSweepSettings', type: 'u16' },
    { key: 'overrideTG', type: 'u32' },
    { key: 'vfoScanLow', type: 'u32', count: 2 },
    { key: 'vfoScanHigh', type: 'u32', count: 2 },
    { key: 'bitfieldOptions', type: 'u32', countVar: 'bitsBanks' },
    { key: 'aprsBeaconingSettingsPart1', type: 'u32', count: 2 },
    { key: 'gpsLogMemOffset', type: 'u32', countVar: 'logGps', hidden: true },
    { key: 'currentIndexInTRxGroupList', type: 'i16', count: 3, hidden: true },
    { key: 'currentZone', type: 'i16', hidden: true },
    { key: 'userPower', type: 'u16', hidden: true },
    { key: 'tsManualOverride', type: 'u16' },
    { key: 'reservedIndex1', type: 'i16', hidden: true },
    { key: 'reservedIndex2', type: 'i16', hidden: true },
    { key: 'aprsBeaconingSettingsPart2', type: 'u16' },
    { key: 'txPowerLevel', type: 'u8' },
    { key: 'txTimeoutBeepX5Secs', type: 'u8' },
    { key: 'beepVolumeDivider', type: 'u8' },
    { key: 'micGainDMR', type: 'u8' },
    { key: 'micGainFM', type: 'u8' },
    { key: 'backlightMode', type: 'u8' },
    { key: 'backLightTimeout', type: 'u8' },
    { key: 'displayContrast', type: 'i8' },
    { key: 'displayBacklightPercentage', type: 'i8', count: 2 }, // [DAY, NIGHT]
    { key: 'displayBacklightPercentageOff', type: 'i8' },
    { key: 'initialMenuNumber', type: 'u8' },
    { key: 'extendedInfosOnScreen', type: 'u8' },
    { key: 'txFreqLimited', type: 'u8' },
    { key: 'scanModePause', type: 'u8' },
    { key: 'scanDelay', type: 'u8' },
    { key: 'dmrRxAGC', type: 'u8' },
    { key: 'hotspotType', type: 'u8' },
    { key: 'scanStepTime', type: 'u8' },
    { key: 'currentVFONumber', type: 'u8' },
    { key: 'dmrDestinationFilter', type: 'u8' },
    { key: 'dmrCaptureTimeout', type: 'u8' },
    { key: 'dmrCcTsFilter', type: 'u8' },
    { key: 'analogFilterLevel', type: 'u8' },
    { key: 'privateCalls', type: 'u8' },
    { key: 'contactDisplayPriority', type: 'u8' },
    { key: 'splitContact', type: 'u8' },
    { key: 'voxThreshold', type: 'u8' },
    { key: 'voxTailUnits', type: 'u8' },
    { key: 'audioPromptMode', type: 'u8' },
    { key: 'temperatureCalibration', type: 'i8' },
    { key: 'batteryCalibration', type: 'u8' },
    { key: 'squelchDefaults', type: 'u8', countVar: 'squelchBands' },
    { key: 'ecoLevel', type: 'u8' },
    { key: 'apo', type: 'u8' },
    { key: 'keypadTimerLong', type: 'u8' },
    { key: 'keypadTimerRepeat', type: 'u8' },
    { key: 'autolockTimer', type: 'u8' },
    { key: 'roaming', type: 'enum', countVar: 'hasRoaming' }, // 4-byte enum on the ARM EABI used here
    { key: 'gpsModeAndBaudsIndex', type: 'u8', countVar: 'hasGpsTail', hidden: true },
    { key: 'lastTalkerOnScreenTimer', type: 'u8', countVar: 'hasLastTalker' }
  ];

  const TYPE = {
    u8: { size: 1, align: 1 },
    i8: { size: 1, align: 1 },
    u16: { size: 2, align: 2 },
    i16: { size: 2, align: 2 },
    u32: { size: 4, align: 4 },
    enum: { size: 4, align: 4 }
  };

  // Platform layout options. `magic` is the version the current firmware
  // writes; `gpsTailMagic`/`roamingMagic` are the revisions that introduced the
  // tail members (see each firmware's settings.c history).
  // DM32 (C7000) is STM32-family; it speaks the OpenGD77 serial protocol and
  // mirrors the STM32 flash-emulated EEPROM layout.
  // `logGps` selects whether the struct contains the conditional
  // `uint32_t gpsLogMemOffset` member (LOG_GPS_DATA in applicationMain.h). It is
  // inserted *before* currentIndexInTRxGroupList, so when it is missing every
  // later member shifts down by 4. It is defined for every STM32 target
  // (MD-380/UV380, DM-1701, MD-2017) and MD-9600, and not on MK22. The correct
  // layout is still auto-detected on read in case a build differs.
  const PLATFORMS = {
    MK22:   { squelchBands: 3, hasGps: false, bitsBanks: 1, logGps: false, magic: 0x4784, gpsTailMagic: 0x4783, roamingMagic: 0x4780, backlightMin: 0, label: 'GD-77 / DM-1801 / RD-5R' },
    STM32:  { squelchBands: 3, hasGps: true,  bitsBanks: 1, logGps: true,  magic: 0x4780, gpsTailMagic: 0x477E, roamingMagic: 0x477E, backlightMin: 1, label: 'MD-UV380 / DM-1701 / RT-3S' },
    MD9600: { squelchBands: 2, hasGps: true,  bitsBanks: 1, logGps: true,  magic: 0x4780, gpsTailMagic: 0x477F, roamingMagic: 0x477E, backlightMin: 0, label: 'MD-9600' },
    DM32:   { squelchBands: 3, hasGps: true,  bitsBanks: 1, logGps: false, magic: 0x4780, gpsTailMagic: 0x477E, roamingMagic: 0x477E, backlightMin: 1, label: 'DM-32 / UV-008' }
  };

  const offsetsCache = {};

  // Settings magic history (firmware settings.c) - members are cumulative:
  //   >= 0x4780 adds `roaming`
  //   >= 0x4783 adds `gpsModeAndBaudsIndex` + `lastTalkerOnScreenTimer`
  // Everything through `autolockTimer` has the same offset on every version.
  // DM-32 / C7000 builds report 0x477D, which predates both tail members.
  const MAGIC_ROAMING = 0x4780;
  const MAGIC_GPS_TAIL = 0x4783;
  const MAGIC_MIN = 0x4769; // settings moved to 0x604B
  const MAGIC_MAX = 0x479F; // plausible upper bound for future versions

  function isUsableMagic(magic) {
    return Number.isInteger(magic) && magic >= MAGIC_MIN && magic <= MAGIC_MAX;
  }

  function readMagic(ctx) {
    return ctx.view.getUint32(0, true);
  }

  // Some firmware builds insert an extra 4-byte member immediately before
  // `txPowerLevel` (observed on the OpenMDUV380Plus 10W, git 7640f9b) without
  // changing the settings magic. That shifts every field from `txPowerLevel`
  // onward by 4 bytes. The correct shift is auto-detected from the decoded
  // values, so we do not need a per-model table.
  const SHIFT_INSERT_KEY = 'txPowerLevel';
  const SUPPORTED_SHIFTS = [0, 4];

  // Lowest field index affected by a shift (used for diffs/debug).
  function computeOffsets(platformKey, magic, shift = 0, logGpsOverride) {
    const base = PLATFORMS[platformKey] || PLATFORMS.STM32;
    const m = (magic === undefined || magic === null || magic === 0) ? base.magic : magic;
    const gpsTailThreshold = base.gpsTailMagic !== undefined ? base.gpsTailMagic : MAGIC_GPS_TAIL;
    const roamingThreshold = base.roamingMagic !== undefined ? base.roamingMagic : MAGIC_ROAMING;
    const hasGpsTail = base.hasGps && m >= gpsTailThreshold;
    const hasRoaming = m >= roamingThreshold;
    const logGps = (logGpsOverride === undefined || logGpsOverride === null)
      ? !!base.logGps
      : !!logGpsOverride;
    const variant = `${platformKey}:${hasGpsTail ? 1 : 0}:${hasRoaming ? 1 : 0}:${shift}:${logGps ? 1 : 0}`;
    if (offsetsCache[variant]) return offsetsCache[variant];

    const opts = {
      squelchBands: base.squelchBands,
      bitsBanks: base.bitsBanks,
      logGps: logGps ? 1 : 0,
      hasRoaming: hasRoaming ? 1 : 0,
      hasGpsTail: hasGpsTail ? 1 : 0,
      hasLastTalker: hasGpsTail ? 1 : 0
    };

    const offsets = {};
    let off = 0;
    for (const decl of DECL) {
      if (decl.key === SHIFT_INSERT_KEY) off += shift;
      const t = TYPE[decl.type];
      if (off % t.align) off += t.align - (off % t.align);
      let count = 1;
      if (decl.count) count = decl.count;
      else if (decl.countVar) {
        const cv = opts[decl.countVar];
        count = typeof cv === 'number' ? cv : (cv ? 1 : 0);
      }
      offsets[decl.key] = { offset: off, type: decl.type, size: t.size, count, hidden: !!decl.hidden };
      off += t.size * count;
    }
    // Struct tail padding to max alignment (4)
    if (off % 4) off += 4 - (off % 4);
    offsets.__size = off;
    offsetsCache[variant] = offsets;
    return offsets;
  }

  function getPlatformKey(radioType, radioModel) {
    const t = String(radioType || '').toUpperCase();
    if (t === 'MK22') return 'MK22';
    if (t === 'DM32') return 'DM32';
    if (t === 'STM32') {
      if (radioModel && /MD-?\s?9600/i.test(radioModel)) return 'MD9600';
      return 'STM32';
    }
    // Unknown: infer from model name when possible.
    if (radioModel && /GD-?77|DM-?1801|RD-?5R/i.test(radioModel)) return 'MK22';
    if (radioModel && /MD-?\s?9600/i.test(radioModel)) return 'MD9600';
    return 'STM32';
  }

  // ---------------------------------------------------------------------------
  // bitfieldOptions flags (positions differ by platform family)
  // ---------------------------------------------------------------------------

  // bit index per family; null = not available on that platform.
  // `group` places the flag in the matching section of the preferences editor.
  const FLAGS = [
    // Display
    { key: 'inverseVideo', label: 'Inverse video', group: 'Display', mk22: 0, stm32: 0, desc: 'Invert the LCD colours.' },
    { key: 'batteryVoltageInHeader', label: 'Battery in header: volts', group: 'Display', mk22: 3, stm32: 3, desc: 'Checked = show volts. Unchecked = show percentage.' },
    { key: 'allLedsDisabled', label: 'Disable all LEDs', group: 'Display', mk22: 6, stm32: 6, desc: 'Turn off the status LEDs.' },
    { key: 'visualVolume', label: 'Visual volume', group: 'Display', mk22: 16, stm32: 18, desc: 'Show the volume bargraph on screen (soft-volume radios).' },
    { key: 'displayChannelDistance', label: 'Show channel distance', group: 'Display', mk22: 19, stm32: 21, desc: 'Show the distance to the channel in the header.' },
    { key: 'sortChannelDistance', label: 'Sort channels by distance', group: 'Display', mk22: 18, stm32: null, desc: 'Sort the channel list by distance.' },
    { key: 'displayTimeInHeader', label: 'Show time in header', group: 'Display', mk22: 21, stm32: 26, desc: 'Show the clock in the header (colour displays).' },
    { key: 'uiDoubleHeight', label: 'Double-height UI', group: 'Display', mk22: 23, stm32: 28, desc: 'Use the large two-line UI font.' },

    // Sound
    { key: 'speakerClickSuppress', label: 'Speaker click suppress', group: 'Sound', mk22: null, stm32: 11, md9600: 11, desc: 'Suppress the speaker click on TX/RX (MD-9600).' },

    // Radio
    { key: 'pttLatch', label: 'PTT latch', group: 'Radio', mk22: 1, stm32: 1, desc: 'PTT stays latched until pressed again.' },
    { key: 'txRxFreqLock', label: 'Lock TX/RX frequencies', group: 'Radio', mk22: 5, stm32: 5, desc: 'Prevent frequency changes from the keypad.' },
    { key: 'scanOnBootEnabled', label: 'Scan on boot', group: 'Radio', mk22: 7, stm32: 7, desc: 'Start scanning automatically at power-on.' },
    { key: 'poweroffSuspend', label: 'Power-off suspend', group: 'Radio', mk22: 8, stm32: 8, desc: 'Suspend instead of a full power-off (faster start, uses standby power).' },
    { key: 'satelliteManualAuto', label: 'Satellite tracking: Auto', group: 'Radio', mk22: 9, stm32: 9, desc: 'Checked = automatic satellite tracking. Unchecked = manual.' },
    { key: 'dmrCrcIgnored', label: 'Ignore DMR CRC', group: 'Radio', mk22: 10, stm32: 12, desc: 'Accept DMR frames with a bad CRC.' },
    { key: 'apoWithRf', label: 'Auto power-off with RF', group: 'Radio', mk22: 12, stm32: 13, desc: 'Auto power-off also counts RF activity.' },
    { key: 'safePowerOn', label: 'Safe power-on (hold SK1 to boot)', group: 'Radio', mk22: 11, stm32: 14, danger: true, desc: 'DANGER: when enabled the radio only powers on while SK1 is held. Until it is cleared the radio will not start normally and the CPS cannot connect.' },
    { key: 'secondaryLanguage', label: 'Secondary language', group: 'Radio', mk22: 17, stm32: 19, desc: 'Enable the secondary UI language.' },
    { key: 'txInhibit', label: 'TX inhibit', group: 'Radio', mk22: 20, stm32: 25, desc: 'Block all transmission.' },
    { key: 'channelsReadOnly', label: 'Channels are read-only', group: 'Radio', mk22: 22, stm32: 27, desc: 'Prevent editing channels from the radio.' },
    { key: 'trackballEnabled', label: 'Trackball enabled', group: 'Radio', mk22: null, stm32: 22, md2017: 22, desc: 'Enable the trackball (MD-2017).' },
    { key: 'trackballFastMotion', label: 'Trackball fast motion', group: 'Radio', mk22: null, stm32: 23, md2017: 23, desc: 'Use fast trackball movement (MD-2017).' },
    { key: 'force10wRadio', label: 'Force 10W radio', group: 'Radio', mk22: null, stm32: 24, desc: 'Treat the MD-UV380 as the 10W variant.' }
  ];

  // The day/night/auto theme selection is stored as three bits rather than a
  // flag, so it is exposed as one friendly "Theme" selector instead of three
  // checkboxes. Semantics (firmware menuDisplayOptions.c / uiUtilities.c):
  //   autoNight on                              -> Auto (follow the clock)
  //   autoNight off + override on + daytime     -> Night
  //   autoNight off + override on + !daytime    -> Day
  const NIGHT_BITS = {
    autoNight:         { mk22: 13, stm32: 15 },
    autoNightOverride: { mk22: 14, stm32: 16 },
    autoNightDaytime:  { mk22: 15, stm32: 17 }
  };

  function nightBit(name, platformKey) {
    const f = NIGHT_BITS[name];
    if (!f) return null;
    return (platformKey === 'MK22') ? f.mk22 : f.stm32;
  }

  function flagBit(flag, platformKey) {
    if (platformKey === 'MK22') return flag.mk22;
    if (platformKey === 'MD9600' || platformKey === 'DM32' || platformKey === 'STM32') {
      if (flag.md9600 !== undefined) return flag.md9600;
      return flag.stm32;
    }
    return flag.stm32;
  }

  // ---------------------------------------------------------------------------
  // Enum options + validation metadata for the editor
  // ---------------------------------------------------------------------------

  const OPTIONS = {
    backlightMode: ['Auto', 'Squelch', 'Manual', 'Buttons', 'None'],
    bandLimits: ['Off', 'On', 'CPS'],
    themeMode: ['Auto', 'Day', 'Night'],
    extendedInfosOnScreen: ['Off', 'TS', 'Power', 'Both'],
    audioPromptMode: ['Silent', 'Beep', 'No Key Beep', 'Voice 1', 'Voice 2', 'Voice 3'],
    hotspotType: ['Off', 'MMDVM', 'BlueDV'],
    dmrDestinationFilter: ['None', 'Talkgroup', 'Digital contact', 'RX group'],
    dmrCcTsFilter: ['None', 'Colour code', 'Timeslot', 'Colour code + TS'],
    analogFilterLevel: ['None', 'CSS'],
    contactDisplayPriority: [
      'Contact → DMR ID → Talker Alias',
      'DMR ID → Contact → Talker Alias',
      'Talker Alias → Contact → DMR ID',
      'Talker Alias → DMR ID → Contact'
    ],
    splitContact: ['Single line', 'Two lines', 'Auto'],
    scanModePause: ['Hold', 'Pause', 'Stop'],
    privateCalls: ['Off', 'On', 'PTT'],
    roaming: ['Off', 'Manual', '5 km', '10 km', '20 km'],
    initialMenuNumber: ['Channel mode', 'VFO A', 'VFO B'],
    currentVFONumber: ['VFO A', 'VFO B'],
    batteryVoltageInHeader: ['Percentage', 'Volts'],
    txBeep: ['Off', 'Start', 'Stop', 'Start + Stop'],
    rxBeep: ['Off', 'Carrier', 'Talker', 'Carrier + Talker'],
    aprsMode: ['Off', 'Manual', 'PTT', 'Auto', 'Smart beaconing'],
    aprsInitialInterval: ['12 s', '30 s', '1 min', '2 min', '3 min', '5 min', '10 min', '20 min', '30 min', '60 min']
  };

  // Curated editor groups. Each entry maps a logical field to a struct field.
  const FIELD_META = [
    // Display options (menuDisplayOptions.c)
    { key: 'brightnessDay', label: 'Brightness (day)', group: 'Display', src: 'displayBacklightPercentage', index: 0, kind: 'range', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'brightnessNight', label: 'Brightness (night)', group: 'Display', src: 'displayBacklightPercentage', index: 1, kind: 'range', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'brightnessOff', label: 'Brightness (off)', group: 'Display', src: 'displayBacklightPercentageOff', kind: 'range', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'displayContrast', label: 'Contrast', group: 'Display', kind: 'range', min: 0, max: 30, step: 1 },
    { key: 'backlightMode', label: 'Backlight mode', group: 'Display', kind: 'select', options: OPTIONS.backlightMode },
    { key: 'backLightTimeout', label: 'Backlight timeout', group: 'Display', kind: 'range', min: 0, max: 30, step: 5, suffix: 's' },
    { key: 'themeMode', label: 'Theme', group: 'Display', kind: 'select', options: OPTIONS.themeMode },
    { key: 'extendedInfosOnScreen', label: 'Extended info on screen', group: 'Display', kind: 'select', options: OPTIONS.extendedInfosOnScreen },
    { key: 'contactDisplayPriority', label: 'Contact display priority', group: 'Display', kind: 'select', options: OPTIONS.contactDisplayPriority },
    { key: 'splitContact', label: 'Contact display', group: 'Display', kind: 'select', options: OPTIONS.splitContact },
    { key: 'lastTalkerOnScreenTimer', label: 'Last talker on screen', group: 'Display', kind: 'range', min: 0, max: 30, step: 1, suffix: 's' },

    // Sound options (menuSoundOptions.c)
    { key: 'beepVolumeDivider', label: 'Beep volume', group: 'Sound', kind: 'range', min: 0, max: 10, step: 1, transform: 'beepDb' },
    { key: 'txBeep', label: 'DMR TX beep', group: 'Sound', kind: 'select', options: OPTIONS.txBeep, composite: 'beepOptions.tx' },
    { key: 'rxBeep', label: 'DMR RX beep', group: 'Sound', kind: 'select', options: OPTIONS.rxBeep, composite: 'beepOptions.rx' },
    { key: 'rxTalkerBegin', label: 'Talker begin beep', group: 'Sound', kind: 'bool', composite: 'beepOptions.rxTalkerBegin' },
    { key: 'txTimeoutBeepX5Secs', label: 'Timeout beep', group: 'Sound', kind: 'range', min: 0, max: 4, step: 1, transform: 'timeoutBeep' },
    { key: 'micGainDMR', label: 'DMR mic gain', group: 'Sound', kind: 'range', min: 0, max: 15, step: 1 },
    { key: 'micGainFM', label: 'FM mic gain', group: 'Sound', kind: 'range', min: 0, max: 31, step: 1 },
    { key: 'voxThreshold', label: 'VOX threshold', group: 'Sound', kind: 'range', min: 2, max: 30, step: 1 },
    { key: 'voxTailUnits', label: 'VOX tail', group: 'Sound', kind: 'range', min: 1, max: 11, step: 1, transform: 'voxTail' },
    { key: 'audioPromptMode', label: 'Audio prompt', group: 'Sound', kind: 'select', options: OPTIONS.audioPromptMode },
    { key: 'dmrRxAGC', label: 'DMR RX AGC', group: 'Sound', kind: 'range', min: 0, max: 10, step: 1 },

    // General / radio options (menuGeneralOptions.c, menuRadioOptions.c)
    { key: 'squelchVhf', label: 'Squelch VHF', group: 'Radio', src: 'squelchDefaults', index: 0, kind: 'range', min: 0, max: 21, step: 1 },
    { key: 'squelch220', label: 'Squelch 220 MHz', group: 'Radio', src: 'squelchDefaults', index: 1, kind: 'range', min: 0, max: 21, step: 1 },
    { key: 'squelchUhf', label: 'Squelch UHF', group: 'Radio', src: 'squelchDefaults', index: 2, kind: 'range', min: 0, max: 21, step: 1 },
    { key: 'tsManualOverride', label: 'Timeslot manual override', group: 'Radio', kind: 'range', min: 0, max: 2, step: 1 },
    { key: 'txPowerLevel', label: 'Default TX power', group: 'Radio', kind: 'range', min: 0, max: 10, step: 1 },
    { key: 'dmrDestinationFilter', label: 'DMR destination filter', group: 'Radio', kind: 'select', options: OPTIONS.dmrDestinationFilter },
    { key: 'dmrCcTsFilter', label: 'DMR CC/TS filter', group: 'Radio', kind: 'select', options: OPTIONS.dmrCcTsFilter },
    { key: 'dmrCaptureTimeout', label: 'DMR capture timeout', group: 'Radio', kind: 'range', min: 0, max: 60, step: 1, suffix: 's' },
    { key: 'analogFilterLevel', label: 'Analog filter', group: 'Radio', kind: 'select', options: OPTIONS.analogFilterLevel },
    { key: 'privateCalls', label: 'Allow private calls', group: 'Radio', kind: 'select', options: OPTIONS.privateCalls },
    { key: 'scanModePause', label: 'Scan mode pause', group: 'Radio', kind: 'select', options: OPTIONS.scanModePause },
    { key: 'scanDelay', label: 'Scan delay', group: 'Radio', kind: 'range', min: 0, max: 255, step: 1, suffix: 's' },
    { key: 'scanStepTime', label: 'Scan step time', group: 'Radio', kind: 'range', min: 0, max: 255, step: 1 },
    { key: 'hotspotType', label: 'Hotspot type', group: 'Radio', kind: 'select', options: OPTIONS.hotspotType },
    { key: 'ecoLevel', label: 'Power saving (ECO)', group: 'Radio', kind: 'range', min: 0, max: 5, step: 1 },
    { key: 'apo', label: 'Auto power-off', group: 'Radio', kind: 'range', min: 0, max: 24, step: 1, transform: 'apo' },
    { key: 'keypadTimerLong', label: 'Keypad long press', group: 'Radio', kind: 'range', min: 0, max: 255, step: 1 },
    { key: 'keypadTimerRepeat', label: 'Keypad repeat', group: 'Radio', kind: 'range', min: 0, max: 255, step: 1 },
    { key: 'autolockTimer', label: 'Auto-lock timer', group: 'Radio', kind: 'range', min: 0, max: 255, step: 1, suffix: 'min' },
    { key: 'roaming', label: 'Roaming', group: 'Radio', kind: 'select', options: OPTIONS.roaming },
    { key: 'currentVFONumber', label: 'Active VFO', group: 'Radio', kind: 'select', options: OPTIONS.currentVFONumber },
    { key: 'txFreqLimited', label: 'Band limits', group: 'Radio', kind: 'select', options: OPTIONS.bandLimits },
    { key: 'overrideTG', label: 'Override talkgroup', group: 'Radio', kind: 'range', min: 0, max: 16777215, step: 1 },
    { key: 'timezoneOffsetMinutes', label: 'Time zone', group: 'Radio', kind: 'range', min: -720, max: 840, step: 15, transform: 'timezone' },

    // APRS beaconing options (menuAPRSOptions.c). Packed into
    // aprsBeaconingSettingsPart1[2] / Part2; `state` bits are runtime and are
    // preserved verbatim.
    { key: 'aprsMode', label: 'Beaconing mode', group: 'APRS', kind: 'select', options: OPTIONS.aprsMode },
    { key: 'aprsInitialInterval', label: 'Initial interval', group: 'APRS', kind: 'select', options: OPTIONS.aprsInitialInterval },
    { key: 'aprsPower', label: 'APRS power (0 = channel)', group: 'APRS', kind: 'range', min: 0, max: 11, step: 1 },
    { key: 'aprsSmartSlowRate', label: 'Smart: slow rate', group: 'APRS', kind: 'range', min: 1, max: 100, step: 1, suffix: 'min' },
    { key: 'aprsSmartFastRate', label: 'Smart: fast rate', group: 'APRS', kind: 'range', min: 10, max: 180, step: 1, suffix: 's' },
    { key: 'aprsSmartLowSpeed', label: 'Smart: low speed', group: 'APRS', kind: 'range', min: 2, max: 30, step: 1, suffix: 'km/h' },
    { key: 'aprsSmartHighSpeed', label: 'Smart: high speed', group: 'APRS', kind: 'range', min: 2, max: 90, step: 1, suffix: 'km/h' },
    { key: 'aprsSmartTurnAngle', label: 'Smart: turn angle', group: 'APRS', kind: 'range', min: 5, max: 90, step: 1, suffix: 'deg' },
    { key: 'aprsSmartTurnSlope', label: 'Smart: turn slope', group: 'APRS', kind: 'range', min: 1, max: 255, step: 1 },
    { key: 'aprsSmartTurnTime', label: 'Smart: turn time', group: 'APRS', kind: 'range', min: 5, max: 180, step: 1, suffix: 's' }
  ];

  // ---------------------------------------------------------------------------
  // Decode / encode
  // ---------------------------------------------------------------------------

  function createView(raw) {
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  }

  function readField(ctx, off, type) {
    switch (type) {
      case 'u8': return ctx.view.getUint8(off);
      case 'i8': return ctx.view.getInt8(off);
      case 'u16': return ctx.view.getUint16(off, true);
      case 'i16': return ctx.view.getInt16(off, true);
      case 'u32': return ctx.view.getUint32(off, true);
      case 'enum': return ctx.view.getUint32(off, true);
      default: return 0;
    }
  }

  function writeField(ctx, off, type, value) {
    switch (type) {
      case 'u8': ctx.view.setUint8(off, value & 0xFF); break;
      case 'i8': ctx.view.setInt8(off, value); break;
      case 'u16': ctx.view.setUint16(off, value & 0xFFFF, true); break;
      case 'i16': ctx.view.setInt16(off, value, true); break;
      case 'u32': ctx.view.setUint32(off, value >>> 0, true); break;
      case 'enum': ctx.view.setUint32(off, value >>> 0, true); break;
    }
  }

  function fieldOffset(offsets, key, index) {
    const d = offsets[key];
    if (!d) return null;
    return d.offset + (index || 0) * d.size;
  }

  // True when the field (or array element) actually exists on this firmware
  // version - the tail members are absent before their introduction.
  function fieldSupported(offsets, key, index) {
    const d = offsets[key];
    if (!d) return false;
    return d.count > (index || 0);
  }

  function beepVolumeToDb(divider) { return (2 - divider) * 3; }

  function decodeAtShift(ctx, pk, magic, shift, logGps) {
    const offsets = computeOffsets(pk, magic, shift, logGps);

    const s = {
      platform: pk,
      magic,
      magicValid: isUsableMagic(magic),
      offsetShift: shift,
      logGps: logGps ? 1 : 0,
      raw: Array.from(ctx.bytes.slice(0, READ_SIZE)),
      flags: {}
    };

    for (const field of FIELD_META) {
      if (field.composite) continue; // handled below
      const srcKey = field.src || field.key;
      if (!fieldSupported(offsets, srcKey, field.index)) continue;
      const off = fieldOffset(offsets, srcKey, field.index);
      const d = offsets[srcKey];
      s[field.key] = readField(ctx, off, d.type);
    }

    // Composite: beepOptions (bits 0-1 TX, 2-3 RX, bit 4 RX-talker-begin)
    const beepOff = fieldOffset(offsets, 'beepOptions');
    const beepOptions = readField(ctx, beepOff, 'u8');
    s.txBeep = beepOptions & 0x03;
    s.rxBeep = (beepOptions >> 2) & 0x03;
    s.rxTalkerBegin = !!(beepOptions & 0x10);

    // Composite: timezone (bits 0-6 offset from UTC, bit 7 = local flag)
    const tzOff = fieldOffset(offsets, 'timezone');
    const tz = readField(ctx, tzOff, 'u8');
    s.timezoneRaw = tz;
    s.timezoneIsUtc = !(tz & 0x80);
    s.timezoneOffsetMinutes = ((tz & 0x7F) - 64) * 15;

    // Composite: APRS beaconing settings. See aprs.c
    // aprsBeaconingUpdateConfigurationFromSystemSettings().
    const ap1aOff = fieldOffset(offsets, 'aprsBeaconingSettingsPart1', 0);
    const ap1bOff = fieldOffset(offsets, 'aprsBeaconingSettingsPart1', 1);
    const ap2Off = fieldOffset(offsets, 'aprsBeaconingSettingsPart2');
    const ap1a = readField(ctx, ap1aOff, 'u32');
    const ap1b = readField(ctx, ap1bOff, 'u32');
    const ap2 = readField(ctx, ap2Off, 'u16');
    s.aprsMode = (ap1a >>> 29) & 0x07;
    s.aprsSmartLowSpeed = (ap1a >>> 24) & 0x1F;
    s.aprsSmartFastRate = (ap1a >>> 16) & 0xFF;
    s.aprsSmartTurnSlope = (ap1a >>> 8) & 0xFF;
    s.aprsSmartTurnTime = ap1a & 0xFF;
    s.aprsSmartSlowRate = (ap1b >>> 14) & 0x7F;
    s.aprsSmartHighSpeed = (ap1b >>> 7) & 0x7F;
    s.aprsSmartTurnAngle = ap1b & 0x7F;
    s.aprsPower = (ap2 >>> 12) & 0x0F;
    s.aprsState = (ap2 >>> 4) & 0xFF;
    s.aprsInitialInterval = ap2 & 0x0F;

    // Flags
    const bitsOff = fieldOffset(offsets, 'bitfieldOptions');
    const bits = readField(ctx, bitsOff, 'u32');
    s._bitfieldRaw = bits;
    for (const flag of FLAGS) {
      const bit = flagBit(flag, pk);
      if (bit === null || bit === undefined) continue;
      s.flags[flag.key] = !!(bits & (1 << bit));
    }

    // Composite: theme mode (0 Auto, 1 Day, 2 Night) from the night bits.
    const autoNightOn = !!(bits & (1 << nightBit('autoNight', pk)));
    const overrideOn = !!(bits & (1 << nightBit('autoNightOverride', pk)));
    const daytime = !!(bits & (1 << nightBit('autoNightDaytime', pk)));
    s.themeMode = autoNightOn ? 0 : (overrideOn && daytime ? 2 : 1);

    validate(s);

    // A stale `roaming` value (firmware migration, uninitialised flash) must not
    // look like a layout mismatch. Sanitise it for display/writes; because it is
    // unchanged relative to the read baseline, encode() leaves the raw bytes
    // untouched unless the user actually picks a value.
    if (s.roaming !== undefined && (!Number.isFinite(Number(s.roaming)) ||
        Number(s.roaming) < 0 || Number(s.roaming) > 4)) {
      s.roamingRaw = s.roaming;
      s.roaming = 0;
    }

    return s;
  }

  function decode(raw, platformKey) {
    const pk = PLATFORMS[platformKey] ? platformKey : 'STM32';
    const ctx = createView(raw);
    if (ctx.bytes.length < STRUCT_SIZE) {
      throw new Error(`Settings blob too short: ${ctx.bytes.length} < ${STRUCT_SIZE}`);
    }
    const magic = readMagic(ctx);

    // Auto-detect the layout: the platform default first, then the variants that
    // differ by the conditional gpsLogMemOffset member (LOG_GPS_DATA) and/or the
    // +4-byte insertion some 10W builds add before txPowerLevel. Prefer the
    // first layout whose decoded values all fall in range.
    const baseLog = !!(PLATFORMS[pk] || {}).logGps;
    const layouts = [];
    for (const logGps of [baseLog, !baseLog]) {
      for (const shift of SUPPORTED_SHIFTS) layouts.push({ logGps, shift });
    }
    let best = null;
    for (const layout of layouts) {
      const candidate = decodeAtShift(ctx, pk, magic, layout.shift, layout.logGps);
      if (!best || candidate.implausible.length < best.implausible.length) best = candidate;
      if (!candidate.implausible.length) { best = candidate; break; }
    }
    if (best.implausible.length && typeof console !== 'undefined' && console.warn) {
      console.warn('[preferences] decoded values out of range (unknown layout?):', best.implausible.join(', '));
    } else if ((best.offsetShift || best.logGps !== (baseLog ? 1 : 0)) && typeof console !== 'undefined' && console.debug) {
      console.debug(`[preferences] using layout logGps=${best.logGps} shift=+${best.offsetShift} for this firmware`);
    }
    return best;
  }

  // Range/enum validation. If a decoded field is outside its valid range the
  // layout almost certainly does not match this firmware (e.g. a model variant
  // with extra struct members). The UI uses this to block unsafe writes.
  function validate(s) {
    const issues = [];
    const ok = (v, lo, hi) => v === undefined || (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi);
    const checks = [
      ['backlightMode', 0, 4],
      ['extendedInfosOnScreen', 0, 3],
      ['audioPromptMode', 0, 5],
      ['dmrDestinationFilter', 0, 3],
      ['dmrCcTsFilter', 0, 3],
      ['analogFilterLevel', 0, 1],
      ['contactDisplayPriority', 0, 3],
      ['splitContact', 0, 2],
      ['privateCalls', 0, 2],
      ['scanModePause', 0, 2],
      // `roaming` is deliberately NOT checked here: it was added late in the
      // firmware's settings history, so radios upgraded across that boundary can
      // hold a stale/0xFF value (e.g. 0xFFFF0000) that is not a valid enum. It is
      // sanitised below instead of failing the whole layout.
      ['hotspotType', 0, 2],
      ['ecoLevel', 0, 5],
      ['txFreqLimited', 0, 2],
      ['brightnessDay', 0, 100],
      ['brightnessNight', 0, 100],
      ['brightnessOff', 0, 100],
      ['displayContrast', 0, 30]
    ];
    for (const [key, lo, hi] of checks) {
      if (!ok(s[key], lo, hi)) issues.push(`${key}=${s[key]}`);
    }
    s.implausible = issues;
    return issues;
  }

  function encode(settings, platformKey, baseRaw, baseline) {
    const pk = PLATFORMS[platformKey] ? platformKey : 'STM32';
    // With a baseline (the settings as read from the radio) only the fields the
    // user actually changed are written. Everything else stays byte-identical to
    // the read, so editing one preference cannot disturb unrelated fields such
    // as the backlight.
    const changed = (key) => {
      if (!baseline) return true;
      if (baseline[key] === undefined) return true;
      return Number(baseline[key]) !== Number(settings[key]);
    };

    // Start from the caller-supplied base (a radio blob with the platform's own
    // magic), else the stored raw, else a fresh all-zero blob.
    let bytes;
    if (baseRaw && baseRaw.length >= READ_SIZE) {
      bytes = new Uint8Array(baseRaw);
    } else if (settings.raw && settings.raw.length >= READ_SIZE) {
      bytes = new Uint8Array(settings.raw);
    } else {
      bytes = new Uint8Array(READ_SIZE);
    }
    if (bytes.length < READ_SIZE) {
      const padded = new Uint8Array(READ_SIZE);
      padded.set(bytes);
      bytes = padded;
    }
    const ctx = createView(bytes);

    // Preserve the radio's own settings magic. Only stamp the current magic when
    // the base is empty/uninitialised - forcing 0x4784 over an older firmware's
    // magic (e.g. the DM-32's 0x477D) would make it reject and reset settings.
    const existingMagic = readMagic(ctx);
    const usableMagic = isUsableMagic(existingMagic);
    const freshMagic = (PLATFORMS[pk] || PLATFORMS.STM32).magic;
    const effectiveMagic = usableMagic ? existingMagic : freshMagic;
    if (!usableMagic) {
      // magicNumber is always the first member.
      writeField(ctx, 0, 'u32', freshMagic);
    }
    // Use the struct shift detected when the blob was read so writes land on
    // the same offsets as the read.
    const shift = (settings && Number(settings.offsetShift)) ? Number(settings.offsetShift) : 0;
    const logGps = (settings && settings.logGps !== undefined && settings.logGps !== null)
      ? !!settings.logGps : undefined;
    const offsets = computeOffsets(pk, effectiveMagic, shift, logGps);

    for (const field of FIELD_META) {
      if (field.composite) continue;
      const srcKey = field.src || field.key;
      if (!fieldSupported(offsets, srcKey, field.index)) continue;
      if (settings[field.key] === undefined || settings[field.key] === null) continue;
      if (!changed(field.key)) continue;
      const off = fieldOffset(offsets, srcKey, field.index);
      const d = offsets[srcKey];
      writeField(ctx, off, d.type, Number(settings[field.key]));
    }

    // Composite: beepOptions
    const beepOff = fieldOffset(offsets, 'beepOptions');
    const beepChanged = !baseline ||
      baseline.txBeep === undefined || baseline.rxBeep === undefined || baseline.rxTalkerBegin === undefined ||
      Number(baseline.txBeep) !== Number(settings.txBeep) ||
      Number(baseline.rxBeep) !== Number(settings.rxBeep) ||
      !!baseline.rxTalkerBegin !== !!settings.rxTalkerBegin;
    if (beepChanged && (settings.txBeep !== undefined || settings.rxBeep !== undefined || settings.rxTalkerBegin !== undefined)) {
      let beepOptions = readField(ctx, beepOff, 'u8');
      beepOptions &= ~0x1F;
      beepOptions |= (Number(settings.txBeep || 0) & 0x03);
      beepOptions |= ((Number(settings.rxBeep || 0) & 0x03) << 2);
      if (settings.rxTalkerBegin) beepOptions |= 0x10;
      writeField(ctx, beepOff, 'u8', beepOptions);
    }

    // Composite: timezone
    const tzChanged = !baseline ||
      baseline.timezoneOffsetMinutes === undefined ||
      Number(baseline.timezoneOffsetMinutes) !== Number(settings.timezoneOffsetMinutes) ||
      !!baseline.timezoneIsUtc !== !!settings.timezoneIsUtc;
    if (tzChanged && (settings.timezoneOffsetMinutes !== undefined || settings.timezoneIsUtc !== undefined)) {
      const tzOff = fieldOffset(offsets, 'timezone');
      let tz = readField(ctx, tzOff, 'u8');
      let offsetUnits = 64;
      if (settings.timezoneOffsetMinutes !== undefined) {
        offsetUnits = Math.round(Number(settings.timezoneOffsetMinutes) / 15) + 64;
        offsetUnits = Math.max(0, Math.min(127, offsetUnits));
        tz = (tz & 0x80) | (offsetUnits & 0x7F);
      }
      if (settings.timezoneIsUtc !== undefined) {
        tz = settings.timezoneIsUtc ? (tz & 0x7F) : (tz | 0x80);
      }
      writeField(ctx, tzOff, 'u8', tz);
    }

    // Composite: APRS beaconing settings. Repack the named fields into
    // aprsBeaconingSettingsPart1[2] / Part2, preserving the runtime `state` bits.
    const APRS_FIELDS = [
      'aprsMode', 'aprsInitialInterval', 'aprsPower', 'aprsSmartSlowRate',
      'aprsSmartFastRate', 'aprsSmartLowSpeed', 'aprsSmartHighSpeed',
      'aprsSmartTurnAngle', 'aprsSmartTurnSlope', 'aprsSmartTurnTime'
    ];
    const anyAprs = APRS_FIELDS.some(k => settings[k] !== undefined && settings[k] !== null && changed(k));
    if (anyAprs) {
      const ap1aOff = fieldOffset(offsets, 'aprsBeaconingSettingsPart1', 0);
      const ap1bOff = fieldOffset(offsets, 'aprsBeaconingSettingsPart1', 1);
      const ap2Off = fieldOffset(offsets, 'aprsBeaconingSettingsPart2');
      let p1a = readField(ctx, ap1aOff, 'u32');
      let p1b = readField(ctx, ap1bOff, 'u32');
      let p2 = readField(ctx, ap2Off, 'u16');
      const v = (key, def) => (settings[key] === undefined || settings[key] === null) ? def : Number(settings[key]);
      const mode = v('aprsMode', (p1a >>> 29) & 0x07);
      const lowSpeed = v('aprsSmartLowSpeed', (p1a >>> 24) & 0x1F);
      const fastRate = v('aprsSmartFastRate', (p1a >>> 16) & 0xFF);
      const turnSlope = v('aprsSmartTurnSlope', (p1a >>> 8) & 0xFF);
      const turnTime = v('aprsSmartTurnTime', p1a & 0xFF);
      const slowRate = v('aprsSmartSlowRate', (p1b >>> 14) & 0x7F);
      const highSpeed = v('aprsSmartHighSpeed', (p1b >>> 7) & 0x7F);
      const turnAngle = v('aprsSmartTurnAngle', p1b & 0x7F);
      const power = v('aprsPower', (p2 >>> 12) & 0x0F);
      const state = (p2 >>> 4) & 0xFF; // preserved
      const initialInterval = v('aprsInitialInterval', p2 & 0x0F);

      p1a = (((mode & 0x07) << 29) | ((lowSpeed & 0x1F) << 24) | ((fastRate & 0xFF) << 16) |
             ((turnSlope & 0xFF) << 8) | (turnTime & 0xFF)) >>> 0;
      p1b = (((slowRate & 0x7F) << 14) | ((highSpeed & 0x7F) << 7) | (turnAngle & 0x7F)) >>> 0;
      p2 = (((power & 0x0F) << 12) | ((state & 0xFF) << 4) | (initialInterval & 0x0F)) & 0xFFFF;
      writeField(ctx, ap1aOff, 'u32', p1a);
      writeField(ctx, ap1bOff, 'u32', p1b);
      writeField(ctx, ap2Off, 'u16', p2);
    }

    // Flags + composite theme mode
    if (settings.flags || settings.themeMode !== undefined) {
      const bitsOff = fieldOffset(offsets, 'bitfieldOptions');
      let bits = readField(ctx, bitsOff, 'u32');
      if (settings.flags) {
        for (const flag of FLAGS) {
          const bit = flagBit(flag, pk);
          if (bit === null || bit === undefined) continue;
          if (settings.flags[flag.key] === undefined) continue;
          if (baseline && baseline.flags && baseline.flags[flag.key] !== undefined &&
              !!baseline.flags[flag.key] === !!settings.flags[flag.key]) {
            continue;
          }
          if (settings.flags[flag.key]) bits |= (1 << bit);
          else bits &= ~(1 << bit);
        }
      }
      // Composite: theme mode -> the three night bits.
      if (settings.themeMode !== undefined && settings.themeMode !== null && changed('themeMode')) {
        const bAuto = nightBit('autoNight', pk);
        const bOverride = nightBit('autoNightOverride', pk);
        const bDaytime = nightBit('autoNightDaytime', pk);
        const tm = Number(settings.themeMode);
        if (tm === 0) {                 // Auto
          bits = (bits | (1 << bAuto)) & ~(1 << bOverride);
        } else if (tm === 2) {          // Night
          bits = (bits | (1 << bOverride) | (1 << bDaytime)) & ~(1 << bAuto);
        } else {                        // Day
          bits = (bits | (1 << bOverride)) & ~(1 << bAuto) & ~(1 << bDaytime);
        }
      }
      writeField(ctx, bitsOff, 'u32', bits >>> 0);
    }

    // Enforce the firmware invariants for the backlight: day/night must be at
    // least the platform's minimum usable value, and the "off" level must be
    // below both, otherwise the display can end up dark.
    const dayOff = fieldOffset(offsets, 'displayBacklightPercentage', 0);
    const nightOff = fieldOffset(offsets, 'displayBacklightPercentage', 1);
    const offOff = fieldOffset(offsets, 'displayBacklightPercentageOff');
    if (dayOff !== null && nightOff !== null && offOff !== null &&
        fieldSupported(offsets, 'displayBacklightPercentage', 1)) {
      const backlightMin = (PLATFORMS[pk] || {}).backlightMin || 0;
      if (backlightMin > 0) {
        if (readField(ctx, dayOff, 'i8') < backlightMin) writeField(ctx, dayOff, 'i8', backlightMin);
        if (readField(ctx, nightOff, 'i8') < backlightMin) writeField(ctx, nightOff, 'i8', backlightMin);
      }
      const day = readField(ctx, dayOff, 'i8');
      const night = readField(ctx, nightOff, 'i8');
      let off = readField(ctx, offOff, 'i8');
      const minLit = Math.min(day, night);
      if (off >= minLit) {
        off = Math.max(0, minLit - 1);
        writeField(ctx, offOff, 'i8', off);
      }
    }

    return bytes;
  }

  // Copy the preference fields from one platform's decoded settings onto
  // another, remapping flag bit positions by name.
  function remap(settings, fromPlatformKey, toPlatformKey) {
    const pk = PLATFORMS[toPlatformKey] ? toPlatformKey : 'STM32';
    const out = JSON.parse(JSON.stringify(settings));
    out.platform = pk;
    // Drop raw + flags so encode() rebuilds them for the target platform. The
    // target's own shift is unknown until it is read, so assume standard.
    delete out.raw;
    delete out._bitfieldRaw;
    out.offsetShift = 0;
    // Adopt the target platform's default gpsLogMemOffset layout; its actual
    // shift is unknown until it is read.
    out.logGps = (PLATFORMS[pk] || {}).logGps ? 1 : 0;
    return out;
  }

  /**
   * Build a settings object with sensible defaults (mirrors
   * settingsRestoreDefaultSettings() in the firmware).
   */
  function defaults(platformKey) {
    const pk = PLATFORMS[platformKey] ? platformKey : 'STM32';
    const s = {
      platform: pk,
      magicValid: false,
      offsetShift: 0,
      logGps: (PLATFORMS[pk] || {}).logGps ? 1 : 0,
      txBeep: 3, rxBeep: 0, rxTalkerBegin: false,
      timezoneRaw: 64, timezoneIsUtc: true, timezoneOffsetMinutes: 0,
      brightnessDay: 100, brightnessNight: 100, brightnessOff: 0,
      displayContrast: 18,
      backlightMode: 0, backLightTimeout: 0,
      themeMode: 1,
      extendedInfosOnScreen: 0, contactDisplayPriority: 0, splitContact: 0,
      lastTalkerOnScreenTimer: 0,
      beepVolumeDivider: 4, txTimeoutBeepX5Secs: 2,
      micGainDMR: 5, micGainFM: 4, voxThreshold: 20, voxTailUnits: 5,
      audioPromptMode: 1, dmrRxAGC: 0,
      squelchVhf: 10, squelch220: 10, squelchUhf: 10,
      tsManualOverride: 0, txPowerLevel: 4,
      dmrDestinationFilter: 0, dmrCcTsFilter: 3, dmrCaptureTimeout: 10,
      analogFilterLevel: 1, privateCalls: 0, scanModePause: 0, scanDelay: 5,
      scanStepTime: 0, hotspotType: 0, ecoLevel: 1, apo: 0,
      keypadTimerLong: 5, keypadTimerRepeat: 3, autolockTimer: 0, roaming: 0,
      initialMenuNumber: 34, currentVFONumber: 0, txFreqLimited: 1,
      overrideTG: 0,
      // APRS beaconing defaults (aprs.c defaultBeaconingSettings)
      aprsMode: 0, aprsInitialInterval: 2, aprsPower: 0,
      aprsSmartSlowRate: 30, aprsSmartFastRate: 120, aprsSmartLowSpeed: 5,
      aprsSmartHighSpeed: 70, aprsSmartTurnAngle: 28, aprsSmartTurnSlope: 26,
      aprsSmartTurnTime: 60,
      flags: {}
    };
    for (const flag of FLAGS) {
      const bit = flagBit(flag, pk);
      if (bit !== null && bit !== undefined) s.flags[flag.key] = false;
    }
    return s;
  }

  return {
    ADDR,
    STRUCT_SIZE,
    READ_SIZE,
    STORAGE_MAGIC,
    PLATFORMS,
    FLAGS,
    OPTIONS,
    FIELD_META,
    getPlatformKey,
    computeOffsets,
    decode,
    encode,
    remap,
    defaults,
    beepVolumeToDb,
    isUsableMagic,
    isMagicValid(raw) {
      if (!raw || raw.length < 4) return false;
      return isUsableMagic(readMagic(createView(raw)));
    }
  };
});
