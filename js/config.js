/**
 * OpenGD77 CPS Web - Configuration
 */

const CONFIG = {
  // Standalone build - no backend API. Public data sources only.
  STANDALONE: true,

  // RSGB Repeater API (CORS-enabled, fetched directly from the browser)
  RSGB_API: 'https://api-beta.rsgb.online',

  // DMR database sources (note: RadioID does not send CORS headers, so bulk
  // DMR ID / repeater import is not available in the standalone build)
  DMR_DB_UK: 'https://www.radioid.net/static/user.csv',

  // TLE/Satellite data sources - Celestrak sends CORS headers, fetched directly
  TLE_API: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle',
  
  // Predefined TLE sources that can be selected
  TLE_SOURCES: {
    amateur: { name: 'Amateur Radio', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle' },
    weather: { name: 'Weather', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle' },
    iss: { name: 'ISS (Zarya)', url: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle' },
    noaa: { name: 'NOAA', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle' },
    goes: { name: 'GOES', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle' },
    geo: { name: 'Geostationary', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle' },
    gps: { name: 'GPS', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle' },
    active: { name: 'Active Satellites', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle' },
    visual: { name: 'Brightest (Visual)', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle' },
    cubesat: { name: 'CubeSats', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle' }
  },
  
  // Radio types supported
  RADIO_TYPES: {
    MK22: 'MK22',      // GD-77, GD-77S, DM-1801, RD-5R (NXP MK22)
    STM32: 'STM32',    // TYT MD-UV380, MD-UV390, MD-9600, MD-380, DM-1701, RT-3S (STM32)
    DM32: 'DM32'       // Baofeng DM-32 / UV-32 (C7000 platform, Web Serial)
  },
  
  // OpenGD77 USB identifiers (MK22 radios - GD-77 etc) - Bootloader mode
  USB: {
    VID: 0x15A2,
    PID: 0x0073
  },
  
  // OpenGD77 USB identifiers (MK22 radios) - CDC-ACM serial mode (normal operation)
  USB_OPENGD77: {
    VID: 0x1FC9,   // NXP Semiconductors
    PID: 0x0094    // OpenGD77 CDC-ACM serial device
  },
  
  // TYT/STM32 radio USB identifiers - DFU mode
  USB_STM32: {
    VID: 0x0483,   // STMicroelectronics
    PID: 0xDF11    // DFU mode
  },
  
  // Baofeng DM-32 / UV-32 USB-to-serial adapter (Prolific PL2303)
  // Used with the Web Serial API (the radio speaks the OpenGD77 serial protocol).
  USB_SERIAL: {
    VID: 0x067B,   // Prolific
    PID: 0x2303    // PL2303 USB-to-Serial
  },
  
  // Protocol constants
  PROTOCOL: {
    HEAD_LEN: 4,
    MAX_COMM_LEN: 32,
    CMD_WRITE: 0x57, // 'W'
    CMD_READ: 0x52,  // 'R'
    CMD_CMD: 0x43,   // 'C'
    CMD_BASE: 0x42,  // 'B'
    CMD_ACK: 0x41,   // 'A'
    CMD_PRG: [0x02, 0x50, 0x52, 0x4F, 0x47, 0x52, 0x41], // PRG header
    CMD_PRG2: [0x4D, 0x02],
    CMD_ENDR: [0x45, 0x4E, 0x44, 0x52], // 'ENDR'
    CMD_ENDW: [0x45, 0x4E, 0x44, 0x57], // 'ENDW'
    
    // Memory locations (MK22 radios)
    CODEPLUG_START: 0x00000,
    CODEPLUG_END: 0x20000,
    DMRID_START: 0x30000,
    DMRID_END: 0x50000,
    CALIBRATION_START: 0x80000,
    CALIBRATION_SIZE: 4096,
    SECURE_REGISTERS_SIZE: 128,
    
    // DMR ID database memory sizes per radio type (from DMRIDForm.cs getSelectedRadioMemorySize)
    // Index: 0=GD-77/GD-77S/MD-760, 1=DM-1801, 2=RD-5R, 3=STM32 radios, 4=Custom 8Mb, 5=Custom 16Mb
    DMRID_MEMORY_SIZES: [557056, 1605632, 557056, 14057472, 7897088, 14188544],
    // Voice prompt memory size that can be used for additional DMR ID storage
    DMRID_VP_MEMORY_SIZE: 166912,
    // Base size for first DMR ID region (262132 bytes)
    DMRID_BASE_SIZE: 262132,
    // DMR ID header size
    DMRID_HEADER_SIZE: 12,
    // Address when using Voice Prompt memory
    DMRID_VP_ADDRESS: 586752,  // 0x8F400
    // Address when NOT using Voice Prompt memory
    DMRID_NO_VP_ADDRESS: 753664,  // 0xB8000
    // Highest flash address the DM-32 / UV008 (C7000) firmware accepts for the
    // DMR ID database. Preparing a sector at or above this address is NAKed with
    // '-', and the official CPS silently fails past this point, so the database
    // must be clamped to fit below it.
    DMRID_DM32_REGION_END: 0x900000,
    
    // Voice prompts flash address (from C# CPS: VOICE_PROMPTS_ADDRESS_IN_FLASH)
    VOICE_PROMPTS_ADDRESS_IN_FLASH: 0x8F400,
    
    // STM32 flash offset for TYT radios (EEPROM emulation size)
    // Decompiled C#: FLASH_MEMORY_EEPROM_EMU_SIZE = 131072 (0x20000 = 128KB)
    // STM32_FLASH_ADDRESS_OFFSET = FLASH_MEMORY_EEPROM_EMU_SIZE
    STM32_FLASH_OFFSET: 0x20000,  // 128KB EEPROM emulation
    // STM32 radios: subtract EEPROM emulation size from memory
    FLASH_MEMORY_EEPROM_EMU_SIZE: 131072,
    
    // STM32 flash sector size
    STM32_SECTOR_SIZE: 4096,
    
    // STM32/MD9600 calibration address (local copy in EEPROM emulation)
    STM32_CALIBRATION_START: 0x10000,
    STM32_CALIBRATION_SIZE: 0x200,  // 512 bytes
    
    // Satellite TLE data is stored as a custom data block (type 3) inside the
    // custom data region (0x1EE60..0x20000), not at a fixed flash address.
    // The write address is platform dependent: 0x0 for MK22, STM32_FLASH_OFFSET
    // for STM32. See writeSatelliteTLEs() in webusb.js.
    SATELLITE_DATA_SIZE: 2520,  // 25 satellites x 100 bytes
    
    // Radio info structure
    RADIO_INFO_SIZE: 46,  // Size of the RadioInfo struct (C# Size=46)
    
    // Data mode constants for serial protocol
    DATA_MODE: {
      NONE: 0,
      READ_FLASH: 1,
      READ_EEPROM: 2,
      WRITE_FLASH: 3,
      WRITE_EEPROM: 4,
      READ_MCU_ROM: 5,
      READ_SCREEN_GRAB: 6,
      WRITE_WAV: 7,
      READ_AMBE: 8,
      READ_RADIO_INFO: 9,
      READ_SECURE_REGISTERS: 10
    },
    
    // STM32 Command 6 special function options
    COMMAND_6_OPTIONS: {
      SAVE_SETTINGS_AND_REBOOT: 0,    // Save settings (NOT VFOs) and reboot
      REBOOT_ONLY: 1,                  // Reboot without saving
      SAVE_SETTINGS_AND_VFOS: 2,       // Save settings and VFOs to codeplug
      FLASH_GREEN_LED: 3,              // Flash green LED
      FLASH_RED_LED: 4,                // Flash red LED
      INIT_CODEC_BUFFERS: 5,           // Initialize codec internal buffers
      INIT_SOUND_BUFFERS: 6,           // Initialize sound buffer pointers
      SET_DATETIME: 7,                 // Set date/time (4-byte timestamp follows)
      STOP_GPS_NMEA: 8,                // Stop GPS NMEA output
      RESUME_GPS_NMEA: 9,              // Resume GPS NMEA output
      WAIT_10MS: 10                    // Wait 10ms
    },
    
    // STM32 Command numbers
    COMMAND: {
      ENTER_CPS_MODE: 0,
      CLEAR_DISPLAY: 1,
      WRITE_TEXT: 2,
      RENDER_DISPLAY: 3,
      BACKLIGHT_ON: 4,
      CLOSE_CPS_SESSION: 5,
      SPECIAL_FUNCTION: 6,
      RESTORE_GPS_NMEA: 7,
      PING: 254
    },
    
    BLOCK_SIZE: 32,
    BANK_SIZE: 0x10000
  },
  
  // UI display limits
  UI: {
    MAX_DISPLAYED_TAGS: 5  // Max tags to show in zone/TG list table cells before "+ more"
  },
  
  // Codeplug limits
  LIMITS: {
    MAX_CHANNELS: 1024,
    MAX_ZONES: 250,
    MAX_CHANNELS_PER_ZONE: 80,
    MAX_CONTACTS: 1024,
    MAX_TGLISTS: 76,
    MAX_CONTACTS_PER_TGLIST: 32,
    MAX_APRS_CONFIGS: 8,
    MAX_DTMF: 32,
    MAX_SCAN_LISTS: 64,
    MAX_CHANNELS_PER_SCAN_LIST: 32,
    MAX_SATELLITES: 25,
    CHANNEL_NAME_LEN: 16,
    ZONE_NAME_LEN: 16,
    CONTACT_NAME_LEN: 16,
    TGLIST_NAME_LEN: 16,
    SCAN_LIST_NAME_LEN: 15,
    SATELLITE_NAME_LEN: 8
  },
  
  // Boot screen display modes
  BOOT_SCREEN_MODES: {
    DEFAULT_IMAGE: 0,
    CUSTOM_TEXT: 1
  },
  
  // Talker Alias TX options
  TALKER_ALIAS_TX: ['Off', 'Text', 'APRS'],

  // APRS icon symbol names (94 icons, ASCII 33-126, matching standard APRS symbol table)
  APRS_ICON_NAMES: [
    'Police Station', 'No Symbol', 'Digi', 'Phone', 'DX Cluster', 'HF Gateway',
    'Small Aircraft', 'Mobile Satellite', 'Wheelchair', 'Snowmobile', 'Red Cross',
    'Boy Scouts', 'Home', 'X', 'Red Dot', 'Circle (0)', 'Circle (1)', 'Circle (2)',
    'Circle (3)', 'Circle (4)', 'Circle (5)', 'Circle (6)', 'Circle (7)', 'Circle (8)',
    'Circle (9)', 'Fire', 'Campground', 'Motorcycle', 'Railroad', 'Car', 'File Server',
    'HC Future', 'Aid Station', 'BBS', 'Canoe', 'No Symbol', 'Eyeball', 'Tractor',
    'Grid Square', 'Hotel', 'TCP/IP', 'No Symbol', 'School', 'PC User', 'MacAPRS',
    'NTS Station', 'Balloon', 'Police', 'TBD', 'Recreational Vehicle', 'Shuttle',
    'SSTV', 'Bus', 'ATV', 'National WX', 'Helicopter', 'Yacht', 'WinAPRS',
    'Jogger', 'Triangle', 'PBBS', 'Large Aircraft', 'WX Station', 'Dish Antenna',
    'Ambulance', 'Bicycle', 'ICP', 'Fire Station', 'Horse', 'Fire Truck',
    'Glider', 'Hospital', 'IOTA', 'Jeep', 'Truck', 'Laptop', 'Mic-E Repeater',
    'Node', 'EOC', 'Rover (Dog)', 'Grid Square (2)', 'Antenna', 'Power Boat',
    'Truck Stop', 'Truck (18-wheeler)', 'Van', 'Water Station', 'XAPRS', 'Yagi',
    'Shelter'
  ],

  // APRS position masking levels (matching CPS dropdown)
  APRS_POSITION_MASKING: [
    'None', '0.0005 deg', '0.001 deg', '0.005 deg',
    '0.01 deg', '0.05 deg', '0.1 deg', '0.5 deg'
  ],
  
  // DMR ID options for channel override
  DMR_ID_OPTIONS: ['None', 'Override'],
  
  // Theme color indices (matches OpenGD77 firmware)
  THEME_COLORS: [
    'Background', 'Foreground', 'Title Background', 'Title Text',
    'Header Background', 'Header Text', 'Menu Background', 'Menu Text',
    'Menu Highlight Background', 'Menu Highlight Text'
  ],
  
  // Band limit presets
  BAND_LIMITS: {
    VHF_MIN: 127000000,
    VHF_MAX: 180000000,
    UHF_MIN: 380000000,
    UHF_MAX: 564000000
  },
  
  // Default OpenGD77 supported satellites with frequencies
  // Source: OpenGD77 CPS satellites.txt - these are amateur radio satellites
  // Format: Cat#, Name, Rx1, Tx1, CTCSS, ArmCTCSS, Rx2, Tx2, Rx3, Tx3, APRS Config
  // 
  // Note: Satellite frequencies may change. These defaults are from the OpenGD77 CPS.
  // For current frequencies, check AMSAT status page: https://www.amsat.org/status/
  // ISS frequencies: https://www.ariss.org/current-status-of-iss-stations.html
  // TLE data should be updated daily for accurate tracking.
  DEFAULT_SATELLITES: [
    { catalogueNumber: '43017U', name: 'AO-91',     rx1: 145.960, tx1: 435.250, txCtcss: 67,    armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 145.960, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '61781U', name: 'AO-123',    rx1: 435.400, tx1: 145.850, txCtcss: 67,    armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 436.210, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '40931U', name: 'IO-86',     rx1: 435.880, tx1: 145.880, txCtcss: 88.5,  armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 437.425, tx3: 0, aprsConfig: '' },
    // ISS (International Space Station) - NORAD 25544 - Uses RS0ISS for APRS digipeating
    { catalogueNumber: '25544U', name: 'ISS',       rx1: 437.800, tx1: 145.990, txCtcss: 67,    armCtcss: 0,    rx2: 145.825, tx2: 145.825, rx3: 145.800, tx3: 0, aprsConfig: 'RS0ISS' },
    { catalogueNumber: '40908U', name: 'LilacSat', rx1: 437.200, tx1: 144.350, txCtcss: 0,     armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 437.200, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '62461U', name: 'POEM 4',    rx1: 145.870, tx1: 0,       txCtcss: 0,     armCtcss: 0,    rx2: 145.825, tx2: 145.825, rx3: 145.870, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '43678U', name: 'PO-101',    rx1: 145.900, tx1: 437.500, txCtcss: 141.3, armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 145.900, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '27607U', name: 'SO-50',     rx1: 436.795, tx1: 145.850, txCtcss: 67,    armCtcss: 74.4, rx2: 0,       tx2: 0,       rx3: 436.795, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '62690U', name: 'SO-124',    rx1: 436.885, tx1: 145.925, txCtcss: 0,     armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 436.885, tx3: 0, aprsConfig: '' },
    { catalogueNumber: '59112U', name: 'SONATE-2', rx1: 145.880, tx1: 0,       txCtcss: 0,     armCtcss: 0,    rx2: 145.825, tx2: 145.825, rx3: 145.840, tx3: 0, aprsConfig: 'DP0SNX' },
    { catalogueNumber: '57172U', name: 'UmKA-1',    rx1: 437.625, tx1: 0,       txCtcss: 0,     armCtcss: 0,    rx2: 0,       tx2: 0,       rx3: 437.625, tx3: 0, aprsConfig: '' }
  ],
  
  // Channel types
  CHANNEL_TYPES: {
    ANALOG: 'Analogue',
    DIGITAL: 'Digital'
  },
  
  // Contact types
  CONTACT_TYPES: {
    GROUP: 'Group',
    PRIVATE: 'Private',
    ALLCALL: 'AllCall'
  },
  
  // Power levels - must match g77.js POWER_LEVELS (firmware byte indices 0-10)
  // Format: 'GD-77 | DM-1701/UV380 | MD-9600'
  POWER_LEVELS: [
    'Master', '50mW | 50mW | 100mW', '250mW | 250mW | 250mW', '500mW | 500mW | 500mW',
    '750mW | 750mW | 750mW', '1W | 1W | 1W', '2W | 2W | 2W', '3W | 3W | 10W',
    '4W | 5W | 25W', '5W | 10W | 40W', '+W-'
  ],

  // Short display labels for power level dropdowns
  POWER_LEVEL_LABELS: [
    'Master', '50mW', '250mW', '500mW', '750mW', '1W', '2W', '3W',
    '4W/5W', '5W/10W', '+W-'
  ],
  
  // Bandwidth options (analog)
  BANDWIDTHS: [12.5, 25],
  
  // CTCSS Tones
  CTCSS_TONES: [
    'None', '67.0', '69.3', '71.9', '74.4', '77.0', '79.7', '82.5', '85.4',
    '88.5', '91.5', '94.8', '97.4', '100.0', '103.5', '107.2', '110.9',
    '114.8', '118.8', '123.0', '127.3', '131.8', '136.5', '141.3', '146.2',
    '151.4', '156.7', '159.8', '162.2', '165.5', '167.9', '171.3', '173.8',
    '177.3', '179.9', '183.5', '186.2', '189.9', '192.8', '196.6', '199.5',
    '203.5', '206.5', '210.7', '218.1', '225.7', '229.1', '233.6', '241.8', '250.3', '254.1'
  ],
  
  // DCS Codes - Standard codes with Normal (N) and Inverted (I) variants
  // Normal: D{code}N - Inverted: D{code}I
  DCS_CODES: [
    // Normal DCS codes (suffix N)
    'D017N', 'D023N', 'D025N', 'D026N', 'D031N', 'D032N', 'D036N', 'D043N', 'D047N',
    'D050N', 'D051N', 'D053N', 'D054N', 'D065N', 'D071N', 'D072N', 'D073N', 'D074N',
    'D114N', 'D115N', 'D116N', 'D122N', 'D125N', 'D131N', 'D132N', 'D134N', 'D143N',
    'D145N', 'D152N', 'D155N', 'D156N', 'D162N', 'D165N', 'D172N', 'D174N', 'D205N',
    'D212N', 'D223N', 'D225N', 'D226N', 'D243N', 'D244N', 'D245N', 'D246N', 'D251N',
    'D252N', 'D255N', 'D261N', 'D263N', 'D265N', 'D266N', 'D271N', 'D274N', 'D306N',
    'D311N', 'D315N', 'D325N', 'D331N', 'D332N', 'D343N', 'D346N', 'D351N', 'D356N',
    'D364N', 'D365N', 'D371N', 'D411N', 'D412N', 'D413N', 'D423N', 'D431N', 'D432N',
    'D445N', 'D446N', 'D452N', 'D454N', 'D455N', 'D462N', 'D464N', 'D465N', 'D466N',
    'D503N', 'D506N', 'D516N', 'D523N', 'D526N', 'D532N', 'D546N', 'D565N', 'D606N',
    'D612N', 'D624N', 'D627N', 'D631N', 'D632N', 'D654N', 'D662N', 'D664N', 'D703N',
    'D712N', 'D723N', 'D731N', 'D732N', 'D734N', 'D743N', 'D754N',
    // Inverted DCS codes (suffix I)
    'D017I', 'D023I', 'D025I', 'D026I', 'D031I', 'D032I', 'D036I', 'D043I', 'D047I',
    'D050I', 'D051I', 'D053I', 'D054I', 'D065I', 'D071I', 'D072I', 'D073I', 'D074I',
    'D114I', 'D115I', 'D116I', 'D122I', 'D125I', 'D131I', 'D132I', 'D134I', 'D143I',
    'D145I', 'D152I', 'D155I', 'D156I', 'D162I', 'D165I', 'D172I', 'D174I', 'D205I',
    'D212I', 'D223I', 'D225I', 'D226I', 'D243I', 'D244I', 'D245I', 'D246I', 'D251I',
    'D252I', 'D255I', 'D261I', 'D263I', 'D265I', 'D266I', 'D271I', 'D274I', 'D306I',
    'D311I', 'D315I', 'D325I', 'D331I', 'D332I', 'D343I', 'D346I', 'D351I', 'D356I',
    'D364I', 'D365I', 'D371I', 'D411I', 'D412I', 'D413I', 'D423I', 'D431I', 'D432I',
    'D445I', 'D446I', 'D452I', 'D454I', 'D455I', 'D462I', 'D464I', 'D465I', 'D466I',
    'D503I', 'D506I', 'D516I', 'D523I', 'D526I', 'D532I', 'D546I', 'D565I', 'D606I',
    'D612I', 'D624I', 'D627I', 'D631I', 'D632I', 'D654I', 'D662I', 'D664I', 'D703I',
    'D712I', 'D723I', 'D731I', 'D732I', 'D734I', 'D743I', 'D754I'
  ],
  
  // Timeslots
  TIMESLOTS: [1, 2],
  
  // Color codes
  COLOR_CODES: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  
  // TS Override options
  TS_OVERRIDE: ['Disabled', '1', '2'],
  
  // Storage keys
  STORAGE: {
    CODEPLUG: 'opengd77_codeplug',
    SETTINGS: 'opengd77_settings',
    RECENT_FILES: 'opengd77_recent',
    USER_SESSION: 'opengd77_session',
    DMR_DATABASE: 'opengd77_dmrdb',
    REPEATER_CACHE: 'opengd77_repeaters',
    SATELLITES: 'opengd77_satellites',
    SATELLITE_TLES: 'opengd77_satellite_tles',
    CUSTOM_TLE_SOURCES: 'opengd77_custom_tle_sources',
    RADIO_TYPE: 'opengd77_radio_type',
    LAST_SECTION: 'opengd77_last_section',
    REPEATERS_PAGE_SIZE: 'opengd77_repeaters_page_size',
    REPEATERS_SORT: 'opengd77_repeaters_sort',
    DMR_REPEATERS_PAGE_SIZE: 'opengd77_dmr_repeaters_page_size',
    WTR_PAGE_SIZE: 'opengd77_wtr_page_size',
    DMR_PAGE_SIZE: 'opengd77_dmr_page_size'
  },
  
  // Cache durations (ms)
  CACHE: {
    REPEATERS: 24 * 60 * 60 * 1000, // 24 hours
    DMR_DB: 7 * 24 * 60 * 60 * 1000,  // 7 days
    SATELLITE_TLES: 24 * 60 * 60 * 1000  // 24 hours - TLEs should be updated daily
  }
};

// Runtime configuration that can be modified (not frozen)
// Extended channel mode limits (Scanner firmware - repurposes VP/DMRID flash for channels)
const SCANNER_LIMITS = {
  MAX_CHANNELS: 16000,
  MAX_CHANNELS_PER_ZONE: 256,
  CHANNELS_BANKS_MAX: 125,           // Total channel banks (matching firmware CODEPLUG_CHANNELS_BANKS_MAX)
  CHANNELS_PER_BANK: 128,            // Channels per bank (matching firmware CODEPLUG_CHANNELS_PER_BANK)
  ZONE_STRUCT_SIZE: 528,             // Zone struct size for 256 channels/zone (16 name + 256*2 indices)
  // Extended channel storage flash addresses (DMRID area repurposed)
  EXT_CHANNEL_FLASH_START: 0x30000,  // Start of extended channel storage in SPI flash
  EXT_CHANNEL_FLASH_END: 0x100000,   // End of 1MB flash
  CHANNEL_DATA_SIZE: 56,             // Bytes per channel struct
};
Object.freeze(SCANNER_LIMITS);

// Freeze config to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.USB);
Object.freeze(CONFIG.USB_OPENGD77);
Object.freeze(CONFIG.USB_STM32);
Object.freeze(CONFIG.USB_SERIAL);
Object.freeze(CONFIG.RADIO_TYPES);
Object.freeze(CONFIG.PROTOCOL);
Object.freeze(CONFIG.PROTOCOL.DATA_MODE);
Object.freeze(CONFIG.PROTOCOL.COMMAND_6_OPTIONS);
Object.freeze(CONFIG.PROTOCOL.COMMAND);
Object.freeze(CONFIG.LIMITS);
Object.freeze(CONFIG.DEFAULT_SATELLITES);
CONFIG.DEFAULT_SATELLITES.forEach(sat => Object.freeze(sat));
Object.freeze(CONFIG.TLE_SOURCES);
Object.keys(CONFIG.TLE_SOURCES).forEach(key => Object.freeze(CONFIG.TLE_SOURCES[key]));
Object.freeze(CONFIG.CHANNEL_TYPES);
Object.freeze(CONFIG.CONTACT_TYPES);
Object.freeze(CONFIG.STORAGE);
Object.freeze(CONFIG.CACHE);
