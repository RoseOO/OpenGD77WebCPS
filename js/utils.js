/**
 * OpenGD77 CPS Web - Utility Functions
 */

const Utils = {
  /**
   * Validate if a value is a valid radio type (MK22 or STM32)
   * @param {string} type - The radio type to validate
   * @returns {boolean} True if valid radio type
   */
  isValidRadioType(type) {
    return type === CONFIG.RADIO_TYPES.MK22 ||
           type === CONFIG.RADIO_TYPES.STM32 ||
           type === CONFIG.RADIO_TYPES.DM32;
  },

  /**
   * Get the saved radio type from storage, or null if not set or invalid
   * @returns {string|null} The saved radio type or null
   */
  getSavedRadioType() {
    const savedType = this.storage.get(CONFIG.STORAGE.RADIO_TYPE);
    return this.isValidRadioType(savedType) ? savedType : null;
  },

  /**
   * Get a valid radio type, falling back to default MK22 if invalid
   * @param {string} type - The radio type to validate
   * @returns {string} A valid radio type (MK22 or STM32), defaults to MK22
   */
  getValidRadioTypeOrDefault(type) {
    return this.isValidRadioType(type) ? type : CONFIG.RADIO_TYPES.MK22;
  },

  /**
   * Show a toast notification
   */
  toast(message, type = 'info', duration = 6000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: 'mdi-check-circle',
      error: 'mdi-alert-circle',
      warning: 'mdi-alert',
      info: 'mdi-information'
    };
    
    toast.innerHTML = `
      <i class="mdi ${icons[type]} toast-icon"></i>
      <div class="toast-content">
        <div class="toast-message">${Utils.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <i class="mdi mdi-close"></i>
      </button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'toastSlideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Format frequency with proper decimal places
   */
  formatFrequency(freq) {
    if (!freq) return '';
    const num = parseFloat(freq);
    return num.toFixed(4);
  },

  /**
   * Format a duration in seconds as a short human string (e.g. "45s", "1m 20s").
   */
  formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '';
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  },

  /**
   * Create a small estimator that turns a stream of progress percentages into an
   * "estimated time remaining" suffix. Feed it the percentage each time you
   * update progress; it returns '' until it has enough data (a few seconds), then
   * something like ' • ~1m 20s left'. Call update(0) at the start of an
   * operation to reset the timer.
   */
  createEtaTracker() {
    let start = null;
    return {
      update(percent) {
        const now = Date.now();
        if (!Number.isFinite(percent) || percent <= 0) {
          start = now;
          return '';
        }
        if (percent >= 100) {
          start = null;
          return '';
        }
        if (start === null) start = now;
        const elapsed = (now - start) / 1000;
        if (elapsed < 3) return '';
        const remaining = elapsed * (100 - percent) / percent;
        const text = Utils.formatDuration(remaining);
        return text ? ` • ~${text} left` : '';
      },
      reset() { start = null; }
    };
  },

  /**
   * Canonical repeater network names. Networks in the feeds are very messy
   * (BM/Braindmeister/BrandMeister, DMR+/DMR-plus/DMR Plus, IPSC2 FRANCE 3,
   * comma/slash separated multi-network strings, etc.); everything is folded
   * onto these names.
   */
  CANONICAL_NETWORKS: [
    'BrandMeister', 'DMRplus', 'DMR-MARC', 'IPSC2', 'freeDMR', 'TGIF', 'ADN',
    'IT-DMR', 'DV Scotland Phoenix', 'Yorkshire DMR', 'South West Cluster',
    'XLX', 'TETRA', 'Fusion (C4FM)', 'D-STAR', 'P25', 'NXDN', 'M17',
    'HBLink', 'VK-DMR', 'ZL-TRBO', 'Can-TRBO', 'Hytera', 'Motorola', 'DMR'
  ],

  /**
   * Networks we ship talkgroup imports for. Pinned to the top of the Network
   * filter, in this order, ahead of the other canonical networks.
   */
  PRIORITY_NETWORKS: [
    'SystemX', 'TGIF', 'BrandMeister', 'DMRplus', 'freeDMR', 'ADN',
    'DV Scotland Phoenix', 'QuadNet'
  ],


  /** Human-readable label for a country code (ISO2) or an already-named country. */
  countryLabel(code) {
    if (!code) return '';
    const c = String(code).trim();
    if (!/^[A-Za-z]{2}$/.test(c)) return c;
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      return dn.of(c.toUpperCase()) || c.toUpperCase();
    } catch (e) {
      return c.toUpperCase();
    }
  },

  /** Classify an output frequency (MHz) into a ham band key. */
  bandOfMhz(mhz) {
    const f = parseFloat(mhz);
    if (!f) return '';
    if (f >= 28 && f < 30) return '10m';
    if (f >= 50 && f < 54) return '6m';
    if (f >= 144 && f < 148) return 'vhf';
    if (f >= 430 && f < 450) return 'uhf';
    if (f >= 1240 && f < 1300) return '23cm';
    return '';
  },

  /** Primary mode of a canonical repeater record (DMR takes precedence). */
  repeaterMode(rec) {
    const modes = Array.isArray(rec?.modes) ? rec.modes.map(m => String(m).toUpperCase()) : [];
    if (modes.includes('DMR')) return 'DMR';
    if (modes.includes('FM') || modes.includes('NFM') || modes.includes('ANALOG')) return 'FM';
    if (modes.includes('D-STAR') || modes.includes('DSTAR')) return 'D-STAR';
    if (modes.includes('YSF') || modes.includes('FUSION')) return 'FUSION';
    if (modes.includes('P25')) return 'P25';
    if (modes.includes('NXDN')) return 'NXDN';
    return modes[0] || 'FM';
  },

  /** Completeness/preference score for choosing between duplicate records. */
  _repeaterScore(r) {
    let s = 0;
    const st = String(r.status || '').toUpperCase();
    if (st === 'OPERATIONAL' || st === 'ACTIVE') s += 4;
    if (r.latitude != null && r.longitude != null) s += 2;
    if (r.network) s += 1;
    if (r.txFreq || r.frequency || r.outputMhz) s += 1;
    if (r.ctcss || r.colorCode || r.dmrCc) s += 1;
    return s;
  },

  /**
   * Collapse duplicate repeaters (same callsign + output frequency + mode) that
   * can appear across aggregated sources. Keeps the most complete/operational
   * record and merges the source lists so nothing is silently lost.
   */
  dedupeRepeaters(list) {
    const seen = new Map();
    for (const r of (list || [])) {
      if (!r) continue;
      const callsign = String(r.callsign || '').trim().toUpperCase();
      const freqRaw = r.txFreq ?? r.frequency ?? r.outputMhz ?? null;
      const freq = freqRaw != null && freqRaw !== '' ? Number(freqRaw).toFixed(4) : '';
      const mode = r.mode || '';
      const key = `${callsign}|${freq}|${mode}`;

      const prev = seen.get(key);
      if (!prev) { seen.set(key, r); continue; }

      const best = this._repeaterScore(r) > this._repeaterScore(prev) ? r : prev;
      const other = best === r ? prev : r;
      const sources = new Set([...(best.sources || []), ...(other.sources || [])]);
      if (best.sourceId) sources.add(best.sourceId);
      if (other.sourceId) sources.add(other.sourceId);
      best.sources = [...sources];
      if (!best.network && other.network) best.network = other.network;
      seen.set(key, best);
    }
    return [...seen.values()];
  },

  /**
   * Parse frequency string to number
   */
  parseFrequency(str) {
    if (!str) return 0;
    return parseFloat(str.toString().trim().replace(/[^\d.]/g, '')) || 0;
  },

  /**
   * Validate frequency is within amateur bands
   */
  validateFrequency(freq) {
    const f = parseFloat(freq);
    // VHF: 144-148 MHz, UHF: 430-450 MHz
    return (f >= 144 && f <= 148) || (f >= 430 && f <= 450);
  },

  /**
   * Calculate repeater offset
   */
  calculateOffset(txFreq, rxFreq) {
    return parseFloat((parseFloat(rxFreq) - parseFloat(txFreq)).toFixed(4)).toString();
  },

  /**
   * Convert Maidenhead locator to lat/lon coordinates
   * @param {string} maidenhead - Maidenhead grid locator (4 or 6 characters)
   * @returns {object|null} - {lat, lon} or null if invalid
   */
  maidenheadToLatLon(maidenhead) {
    if (!maidenhead || typeof maidenhead !== 'string') return null;
    maidenhead = maidenhead.toUpperCase();
    
    if (maidenhead.length === 4) {
      const A = maidenhead.charCodeAt(0) - 65;
      const B = maidenhead.charCodeAt(1) - 65;
      const C = parseInt(maidenhead.charAt(2));
      const D = parseInt(maidenhead.charAt(3));
      if (isNaN(C) || isNaN(D) || A < 0 || A > 17 || B < 0 || B > 17) return null;
      const lon = A * 20 - 180 + C * 2 + 1;
      const lat = B * 10 - 90 + D + 0.5;
      return { lat, lon };
    } else if (maidenhead.length >= 6) {
      const A = maidenhead.charCodeAt(0) - 65;
      const B = maidenhead.charCodeAt(1) - 65;
      const C = parseInt(maidenhead.charAt(2));
      const D = parseInt(maidenhead.charAt(3));
      const E = maidenhead.toLowerCase().charCodeAt(4) - 97;
      const F = maidenhead.toLowerCase().charCodeAt(5) - 97;
      if (isNaN(C) || isNaN(D) || A < 0 || A > 17 || B < 0 || B > 17 || E < 0 || E > 23 || F < 0 || F > 23) return null;
      const lon = A * 20 - 180 + C * 2 + E / 12 + 1 / 24;
      const lat = B * 10 - 90 + D + F / 24 + 1 / 48;
      return { lat, lon };
    }
    return null;
  },

  /**
   * Haversine distance between two lat/lon points
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in km
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /**
   * Decode ITU emission designator (e.g. "8K30F1W", "11K0G3EJN").
   * Per ITU-R SM.1138 / Ofcom OfW84: BBBBXYS[OO]
   * @param {string} code - Emission designator string
   * @returns {Object|null} Decoded emission data or null
   */
  decodeEmission(code) {
    if (!code || code.length < 7) return null;
    const m = code.match(/^(\d+[HKMG]\d*?)([A-Z])(\d|X)([A-Z])([A-Z]{0,2})$/);
    if (!m) return null;
    const [, bwStr, modChar, sigChar, infoChar, optional] = m;
    const modLabels = { N:'Unmodulated',A:'AM',H:'SSB',J:'SSB',F:'FM',G:'Phase mod',D:'Digital',W:'Mixed',X:'Other' };
    const infoLabels = { N:'None',A:'Telegraphy',B:'Telegraphy',C:'Fax',D:'Data',E:'Voice',F:'Video',W:'Voice+Data',X:'Other' };
    const isFM = modChar === 'F';
    const isDigitalMod = modChar === 'G' || modChar === 'D';
    const isDigitalSig = '1279'.includes(sigChar);
    let category;
    if (isFM && !isDigitalSig) category = 'FM';
    else if (isFM && isDigitalSig) category = 'Digital';
    else if (isDigitalMod) category = 'Digital';
    else category = 'Other';
    return {
      raw: code,
      modulation: { code: modChar, label: modLabels[modChar] || modChar },
      information: { code: infoChar, label: infoLabels[infoChar] || infoChar, voice: 'EW'.includes(infoChar), data: 'DABW'.includes(infoChar) },
      category,
      isDigital: isDigitalMod || isDigitalSig,
      isFM,
      isVoice: 'EW'.includes(infoChar),
      isData: 'DABW'.includes(infoChar)
    };
  },

  /**
   * Normalize CTCSS tone value to match codeplug format
   * @param {string|number} tone - CTCSS tone value (e.g., "77", "77.0", "77Hz", "77.0 Hz")
   * @returns {string} - Normalized tone value (e.g., "77.0") or "None"
   */
  normalizeCTCSS(tone) {
    if (!tone || tone === 'None' || tone === 'none' || tone === '') return 'None';
    
    // Extract numeric value
    let value = String(tone).replace(/[Hh]z/g, '').trim();
    const num = parseFloat(value);
    
    if (isNaN(num) || num <= 0) return 'None';
    
    // Format with one decimal place
    const formatted = num.toFixed(1);
    
    // Check if it's a valid CTCSS tone in the config
    if (typeof CONFIG !== 'undefined' && CONFIG.CTCSS_TONES && CONFIG.CTCSS_TONES.includes(formatted)) {
      return formatted;
    }
    
    // Return formatted value even if not in list (for flexibility)
    return formatted;
  },

  /**
   * Normalize a RadioReference tone string to codeplug format.
   * Handles:
   *  - "167.9 PL" → CTCSS "167.9"
   *  - "413 DPL"  → DCS "D413N"
   *  - "413I DPL" → DCS "D413I"
   *  - "2B1 NAC"  → "None" (P25 NAC, not supported)
   *  - plain numeric like "77.0" → CTCSS
   * @param {string} tone - Raw tone string from RadioReference
   * @returns {string} - Codeplug-compatible tone ("None", "67.0", "D023N", etc.)
   */
  normalizeRRTone(tone) {
    if (!tone || tone === 'None' || tone === 'none' || tone === '') return 'None';
    const str = String(tone).trim();

    // NAC codes (P25) – not supported
    if (/\bNAC\b/i.test(str)) return 'None';

    // DPL (Digital Private Line) = DCS code
    if (/\bDPL\b/i.test(str)) {
      const m = str.match(/^(\d{3})(I)?\s+DPL/i);
      if (m) {
        const code = m[1]; // 3-digit octal DCS code string (e.g., "413")
        const inverted = m[2] ? 'I' : 'N';
        const dcsCode = `D${code}${inverted}`;
        // Validate against known DCS codes
        if (typeof CONFIG !== 'undefined' && CONFIG.DCS_CODES && CONFIG.DCS_CODES.includes(dcsCode)) {
          return dcsCode;
        }
        // Return it anyway for flexibility
        return dcsCode;
      }
      return 'None';
    }

    // PL (Private Line) = CTCSS tone
    if (/\bPL\b/i.test(str)) {
      const m = str.match(/([\d.]+)\s*PL/i);
      if (m) {
        return this.normalizeCTCSS(m[1]);
      }
      return 'None';
    }

    // Plain numeric – try as CTCSS
    const num = parseFloat(str);
    if (!isNaN(num) && num > 0) {
      return this.normalizeCTCSS(str);
    }

    return 'None';
  },

  /**
   * Abbreviation map for shortening channel names.
   * Keys are matched case-insensitively; replacements preserve the map's casing.
   */
  _abbreviations: {
    // Common words
    'University': 'Uni',
    'Department': 'Dept',
    'Association': 'Assoc',
    'Corporation': 'Corp',
    'International': 'Intl',
    'National': 'Natl',
    'Hospital': 'Hosp',
    'Medical': 'Med',
    'Clinical': 'Clin',
    'Pharmaceutical': 'Pharm',
    'Foundation': 'Fdn',
    'Trust': 'Trst',
    'Healthcare': 'HC',
    'Organisation': 'Org',
    'Organization': 'Org',
    'Government': 'Govt',
    'Management': 'Mgmt',
    'Communications': 'Comms',
    'Communication': 'Comm',
    'Community': 'Cmnty',
    'Company': 'Co',
    'Limited': 'Ltd',
    'Services': 'Svcs',
    'Service': 'Svc',
    'Security': 'Sec',
    'Transport': 'Trnsp',
    'Broadcasting': 'Bcast',
    'Industries': 'Ind',
    'Industrial': 'Ind',
    'Engineering': 'Eng',
    'Technology': 'Tech',
    'Technical': 'Tech',
    'Telecommunications': 'Telecom',
    'Construction': 'Const',
    'Ambulance': 'Ambu',
    'Rescue': 'Resc',
    'Council': 'Cncl',
    'Central': 'Ctrl',
    'Property': 'Prop',
    'Properties': 'Props',
    'District': 'Dist',
    'Development': 'Dev',
    'Electricity': 'Elec',
    'Electric': 'Elec',
    'Emergency': 'Emerg',
    'Maintenance': 'Maint',
    'Manufacturing': 'Mfg',
    'Logistics': 'Logi',
    'Solutions': 'Soln',
    'Enterprises': 'Ent',
    'Enterprise': 'Ent',
    'Partnership': 'Prtnr',
    'Federation': 'Fed',
    'Authority': 'Auth',
    'Railway': 'Rly',
    'Railways': 'Rlys',
    'Network': 'Net',
    'Housing': 'Hsng',
    'Insurance': 'Ins',
    'Financial': 'Fin',
    'Protection': 'Prot',
    'Environmental': 'Enviro',
    'Laboratory': 'Lab',
    'Laboratories': 'Labs',
    'Facilities': 'Facs',
    'Resources': 'Rsrcs',
    'Wholesale': 'Whlsl',
    'Warehouse': 'Whse',
    'Operations': 'Ops',
    'Building': 'Bldg',
    'Buildings': 'Bldgs',
    'Academy': 'Acad',
    'Education': 'Edu',
    'Training': 'Trng',
    'Institute': 'Inst',
    'Residents': 'Res',
    'Residential': 'Res',
    'Regional': 'Regl',
    'Borough': 'Boro',
    'County': 'Cty',
    'Centre': 'Ctr',
    'Center': 'Ctr',
    'Group': 'Grp',
    'College': 'Coll',
    'School': 'Sch',
    'North': 'Nth',
    'South': 'Sth',
    'East': 'Est',
    'West': 'Wst',
    'Northern': 'Nthn',
    'Southern': 'Sthn',
    'Eastern': 'Estn',
    'Western': 'Wstn',
    // UK cities and counties
    'Birmingham': 'Birm',
    'Manchester': 'Manc',
    'Liverpool': 'Lpool',
    'Edinburgh': 'Edin',
    'Newcastle': 'Ncstl',
    'Nottingham': 'Nottm',
    'Nottinghamshire': 'Notts',
    'Sheffield': 'Sheff',
    'Leicester': 'Leics',
    'Leicestershire': 'Leics',
    'Bristol': 'Brstl',
    'Bradford': 'Bradf',
    'Coventry': 'Cov',
    'Kingston': 'Kgtn',
    'Wolverhampton': 'Wolves',
    'Plymouth': 'Plym',
    'Southampton': 'Soton',
    'Portsmouth': 'Ptsmth',
    'Aberdeen': 'Abdn',
    'Cambridge': 'Cambs',
    'Cambridgeshire': 'Cambs',
    'Canterbury': 'Cant',
    'Chelmsford': 'Chlmsf',
    'Gloucester': 'Glos',
    'Gloucestershire': 'Glos',
    'Hertfordshire': 'Herts',
    'Hampshire': 'Hants',
    'Lancashire': 'Lancs',
    'Lincolnshire': 'Lincs',
    'Middlesbrough': 'Midsbro',
    'Middlesex': 'Middx',
    'Northampton': 'Nhmptn',
    'Northamptonshire': 'Nhants',
    'Northumberland': 'Nthld',
    'Oxfordshire': 'Oxon',
    'Staffordshire': 'Staffs',
    'Buckinghamshire': 'Bucks',
    'Bedfordshire': 'Beds',
    'Berkshire': 'Berks',
    'Derbyshire': 'Derbys',
    'Devonshire': 'Devon',
    'Dorset': 'Dors',
    'Warwickshire': 'Warks',
    'Wiltshire': 'Wilts',
    'Yorkshire': 'Yorks',
    'Shropshire': 'Shrops',
    'Worcester': 'Worcs',
    'Worcestershire': 'Worcs',
    'Sussex': 'Ssx',
    'Somerset': 'Somst',
    'Suffolk': 'Suff',
    'Norfolk': 'Norf',
    'Cornwall': 'Cnwll',
    'Sunderland': 'Sndlnd',
    'Dundee': 'Dndee',
    'Swansea': 'Swnsea',
    'Westminster': 'Wstmnr',
    'Greenwich': 'Grnwch',
    'Cheltenham': 'Chelt',
    'Bournemouth': 'Bmth',
    'Darlington': 'Darl',
    'Colchester': 'Colch',
    'Eastbourne': 'Ebrne',
    'Peterborough': 'Pboro',
    'Scarborough': 'Scboro',
    'Loughborough': 'Lboro',
    'Farnborough': 'Fboro',
    'Huddersfield': 'Hudds',
    'Guildford': 'Guildf',
    'Basingstoke': 'Bstoke',
    'Maidstone': 'Mdstn',
    'Blackpool': 'Bpool',
    'Blackburn': 'Bburn',
    'Stockport': 'Stkprt',
    'Birkenhead': 'Bkhd',
    'Hartlepool': 'Hpool',
    'Swindon': 'Swndn',
    'Stevenage': 'Stvnge',
    'Gillingham': 'Gllghm',
    'Rotherham': 'Rothm',
    'Doncaster': 'Donc',
    'Wakefield': 'Wkfld',
    'Shrewsbury': 'Shrwby',
    'Herefordshire': 'Herefs',
    'Inverness': 'Invrns',
    'Dumfries': 'Dmfrs',
    'Carmarthen': 'Crmthn',
    'Pembrokeshire': 'Pembs',
    'Caernarfon': 'Crnarfn',
    'Ceredigion': 'Crdgn',
    'Monmouthshire': 'Monm',
    'Merseyside': 'Mersey',
    'Tyneside': 'Tyne',
    'Teesside': 'Tees',
    'Humberside': 'Humber',
    'City of London': 'CoLdn',
    'County Durham': 'CoDur',
    'Devon': 'Devn',
    'East Riding of Yorkshire': 'ERYorks',
    'East Sussex': 'E Ssx',
    'Greater London': 'GtrLdn',
    'Greater Manchester': 'GtrManc',
    'Isle of Wight': 'IoW',
    'North Yorkshire': 'N Yorks',
    'South Yorkshire': 'S Yorks',
    'Tyne and Wear': 'T&W',
    'West Midlands': 'W Mids',
    'West Sussex': 'W Ssx',
    'West Yorkshire': 'W Yorks',
    'Cheshire': 'Ches',
    'Cumbria': 'Cumb',
    'Durham': 'Dur',
    'Rutland': 'Rtlnd',
    'Surrey': 'Srry',
    // Scottish counties
    'Aberdeenshire': 'Aberds',
    'Angus': 'Angs',
    'Argyll': 'Argyl',
    'Ayrshire': 'Ayrs',
    'Banffshire': 'Banffs',
    'Berwickshire': 'Bwksh',
    'Caithness': 'Cthnss',
    'Clackmannanshire': 'Clacks',
    'Cromartyshire': 'Crmty',
    'Dumfriesshire': 'Dmfrss',
    'Dunbartonshire': 'Dnbrtn',
    'East Lothian': 'E Lothn',
    'Inverness-shire': 'Invrns',
    'Kincardineshire': 'Kncrdn',
    'Kinross-shire': 'Knrss',
    'Kirkcudbrightshire': 'Krkcd',
    'Lanarkshire': 'Lnrks',
    'Midlothian': 'Mdlthn',
    'Nairnshire': 'Nairns',
    'Peeblesshire': 'Pblss',
    'Perthshire': 'Perths',
    'Renfrewshire': 'Rnfrws',
    'Ross-shire': 'Rossh',
    'Roxburghshire': 'Rxbrgh',
    'Selkirkshire': 'Slkrks',
    'Shetland': 'Shtlnd',
    'Stirlingshire': 'Strlngs',
    'Sutherland': 'Sthlnd',
    'West Lothian': 'W Lothn',
    'Wigtownshire': 'Wgtwns',
    // Welsh preserved counties
    'Carmarthenshire': 'Carms',
    'Denbighshire': 'Denbs',
    'Flintshire': 'Flints',
    'Glamorgan': 'Glam',
    'Gwynedd': 'Gwynd',
    'Mid Glamorgan': 'MdGlam',
    'South Glamorgan': 'S Glam',
    'West Glamorgan': 'W Glam',
    // Northern Ireland
    'Fermanagh': 'Frmgh',
    'Londonderry': 'Lderry',
    'Tyrone': 'Tyrne',
    // Europe
    'Amsterdam': 'Amst',
    'Barcelona': 'Barca',
    'Brussels': 'Brux',
    'Bucharest': 'Buch',
    'Budapest': 'Budpst',
    'Copenhagen': 'Coph',
    'Dusseldorf': 'Ddorf',
    'Frankfurt': 'Frnkft',
    'Gothenburg': 'Gotbg',
    'Hamburg': 'Hamb',
    'Helsinki': 'Hels',
    'Istanbul': 'Istbl',
    'Lisbon': 'Lisb',
    'Luxembourg': 'Luxbg',
    'Marseille': 'Mrsl',
    'Milan': 'Miln',
    'Moscow': 'Moscw',
    'Munich': 'Munch',
    'Nuremberg': 'Nurnbg',
    'Rotterdam': 'Rttdm',
    'Salzburg': 'Slzbg',
    'Stockholm': 'Stkhm',
    'Strasbourg': 'Strbg',
    'Stuttgart': 'Stttgt',
    'Thessaloniki': 'Thess',
    'Toulouse': 'Tlse',
    'Zurich': 'Zrch',
    'Reykjavik': 'Rkvk',
    'Bratislava': 'Brtslv',
    'Antwerp': 'Antwp',
    'Dortmund': 'Drtmnd',
    'Cologne': 'Coln',
    'Eindhoven': 'Eindhvn',
    'Malaga': 'Malga',
    'Valencia': 'Vlncia',
    'Seville': 'Svlle',
    'Bordeaux': 'Brdx',
    // North America
    'Albuquerque': 'Albuq',
    'Anchorage': 'Ancrge',
    'Arlington': 'Arltn',
    'Baltimore': 'Balt',
    'Baton Rouge': 'BtnRge',
    'Bridgeport': 'Brdgpt',
    'Burlington': 'Burltn',
    'Charlotte': 'Chrlt',
    'Chattanooga': 'Chatt',
    'Chesapeake': 'Chspke',
    'Chicago': 'Chcgo',
    'Cincinnati': 'Cincy',
    'Cleveland': 'Clvlnd',
    'Colorado Springs': 'CoSpgs',
    'Columbus': 'Colmbs',
    'Connecticut': 'Conn',
    'Dallas': 'Dllas',
    'Dayton': 'Daytn',
    'Detroit': 'Detrt',
    'Fort Lauderdale': 'FtLaud',
    'Fort Worth': 'FtWrth',
    'Fresno': 'Frsno',
    'Grand Rapids': 'GrRpds',
    'Greensboro': 'Grnsbo',
    'Harrisburg': 'Hrsbg',
    'Hartford': 'Hrtfrd',
    'Henderson': 'Hndrn',
    'Honolulu': 'Hnllu',
    'Houston': 'Houstn',
    'Huntsville': 'Hntvl',
    'Indianapolis': 'Indy',
    'Jacksonville': 'Jaxvl',
    'Knoxville': 'Knxvl',
    'Las Vegas': 'LVegas',
    'Lexington': 'Lextn',
    'Long Beach': 'LngBch',
    'Los Angeles': 'LA',
    'Louisville': 'Lousvl',
    'Massachusetts': 'Mass',
    'Memphis': 'Memph',
    'Miami': 'Miami',
    'Milwaukee': 'Mlwkee',
    'Minneapolis': 'Mpls',
    'Mississippi': 'Miss',
    'Montgomery': 'Mntgmry',
    'Montreal': 'Mtrl',
    'Nashville': 'Nashvl',
    'New Orleans': 'NOLA',
    'New York': 'NY',
    'Newark': 'Nwrk',
    'Oklahoma City': 'OKC',
    'Orlando': 'Orlndo',
    'Pennsylvania': 'Penn',
    'Philadelphia': 'Phila',
    'Phoenix': 'Phnx',
    'Pittsburgh': 'Pitt',
    'Portland': 'Prtlnd',
    'Providence': 'Prvdnc',
    'Raleigh': 'Rlegh',
    'Richmond': 'Rchmnd',
    'Rochester': 'Rochtr',
    'Sacramento': 'Sacto',
    'Salt Lake City': 'SLC',
    'San Antonio': 'SanAnt',
    'San Bernardino': 'SanBrn',
    'San Diego': 'SD',
    'San Francisco': 'SF',
    'San Jose': 'SanJse',
    'Santa Barbara': 'StaBrb',
    'Savannah': 'Savnah',
    'Scottsdale': 'Sctsdl',
    'Seattle': 'Seattl',
    'Springfield': 'Sprngf',
    'Tallahassee': 'Tally',
    'Tampa': 'Tampa',
    'Tennessee': 'Tenn',
    'Toronto': 'Trnto',
    'Tucson': 'Tucsn',
    'Vancouver': 'Vancvr',
    'Virginia': 'Virgna',
    'Washington': 'Washtn',
    'Wilmington': 'Wilmtn',
    'Winnipeg': 'Wnnpg',
    'California': 'Calif',
    'Minnesota': 'Minn',
    'Wisconsin': 'Wisc',
    // Central & South America
    'Barranquilla': 'Brnqla',
    'Bogota': 'Bogta',
    'Brasilia': 'Brslia',
    'Buenos Aires': 'BsAs',
    'Cartagena': 'Crtgna',
    'Guadalajara': 'Guadlj',
    'Guatemala': 'Guatml',
    'Guayaquil': 'Guayql',
    'Havana': 'Havna',
    'Managua': 'Mangua',
    'Medellin': 'Medlln',
    'Montevideo': 'Mntevd',
    'Panama': 'Panma',
    'Santiago': 'Sntgo',
    'Sao Paulo': 'SP',
    'Tegucigalpa': 'Teguc',
    'Valparaiso': 'Vlprso',
    // Africa
    'Addis Ababa': 'AddAbba',
    'Alexandria': 'Alex',
    'Casablanca': 'Csblnca',
    'Cape Town': 'CapeTn',
    'Dar es Salaam': 'DarSlm',
    'Johannesburg': 'Joburg',
    'Kinshasa': 'Knshsa',
    'Marrakech': 'Mrkch',
    'Mombasa': 'Mmbsa',
    'Nairobi': 'Nairbi',
    'Pretoria': 'Pretria',
    'Zanzibar': 'Znzbr',
    // Middle East
    'Abu Dhabi': 'AbuDhb',
    'Amman': 'Ammn',
    'Baghdad': 'Bghdd',
    'Bahrain': 'Bhrn',
    'Beirut': 'Beirt',
    'Damascus': 'Dmscus',
    'Islamabad': 'Islmbd',
    'Jeddah': 'Jddah',
    'Jerusalem': 'Jrslm',
    'Karachi': 'Krchi',
    'Kuwait': 'Kwt',
    'Riyadh': 'Rydh',
    'Tel Aviv': 'TelAvv',
    // Asia
    'Ahmedabad': 'Amdbd',
    'Bangalore': 'Blore',
    'Bangkok': 'Bngkk',
    'Chengdu': 'Chgdu',
    'Chongqing': 'Chngqg',
    'Colombo': 'Clmbo',
    'Dhaka': 'Dhka',
    'Guangzhou': 'Gzhu',
    'Hangzhou': 'Hzhu',
    'Hanoi': 'Hanoi',
    'Ho Chi Minh': 'HCM',
    'Hong Kong': 'HK',
    'Hyderabad': 'Hydbd',
    'Jakarta': 'Jkrta',
    'Kathmandu': 'Ktmndu',
    'Kolkata': 'Klkta',
    'Kuala Lumpur': 'KL',
    'Kyoto': 'Kyoto',
    'Mumbai': 'Mumbi',
    'New Delhi': 'NDlhi',
    'Osaka': 'Osaka',
    'Phnom Penh': 'PhnmPn',
    'Pyongyang': 'Pyngyg',
    'Qingdao': 'Qngdo',
    'Shanghai': 'Shghai',
    'Shenzhen': 'Shnzhn',
    'Singapore': 'Sgpore',
    'Surabaya': 'Srbya',
    'Taipei': 'Taipi',
    'Tashkent': 'Tshknt',
    'Ulaanbaatar': 'UlanBr',
    'Vientiane': 'Vtnne',
    'Vladivostok': 'Vladvk',
    'Yokohama': 'Yokhma',
    // Oceania
    'Adelaide': 'Adlde',
    'Auckland': 'Aklnd',
    'Brisbane': 'Brisb',
    'Canberra': 'Canbrr',
    'Christchurch': 'Chchch',
    'Dunedin': 'Dundn',
    'Geelong': 'Geelng',
    'Gold Coast': 'GldCst',
    'Hamilton': 'Hamltn',
    'Hobart': 'Hobrt',
    'Melbourne': 'Melb',
    'Perth': 'Prth',
    'Queensland': 'Qld',
    'Sydney': 'Sydny',
    'Tasmania': 'Tas',
    'Wellington': 'Welltn',
    'Wollongong': 'Wlgng'
  },

  /**
   * Shorten a name by applying abbreviations, longest match first.
   * Only abbreviates enough to fit within maxLen characters.
   */
  abbreviateName(name, maxLen) {
    if (!name || name.length <= maxLen) return name || '';

    // Sort abbreviations longest-key-first so multi-word and longer place names match first
    const sorted = Object.entries(this._abbreviations)
      .sort((a, b) => b[0].length - a[0].length);

    let result = name;
    for (const [long, short] of sorted) {
      if (result.length <= maxLen) break;
      const escaped = long.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');
      result = result.replace(regex, short);
    }
    return result;
  },

  /**
   * Truncate string to max length
   */
  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) : str;
  },

  /**
   * Sanitize string for codeplug (remove invalid chars)
   */
  sanitizeString(str, maxLen = 16) {
    if (!str) return '';
    // Allow alphanumeric, spaces, and common punctuation
    return str.replace(/[^\x20-\x7E]/g, '').substring(0, maxLen);
  },

  /**
   * Generate unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  /**
   * Deep clone an object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Debounce function calls
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Format date for display
   */
  formatDate(date) {
    if (!date) return 'Never';
    // Backend stores dates as Unix seconds; JS Date expects milliseconds.
    // Timestamps below 1e12 (~Sep 2001 in ms) are assumed to be in seconds.
    const d = new Date(typeof date === 'number' && date < 1e12 ? date * 1000 : date);
    if (isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  },

  /**
   * Generate a timestamped filename
   */
  timestampedFilename(prefix, extension) {
    const now = new Date();
    const ts = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') + '-' +
      String(now.getMinutes()).padStart(2, '0') + '-' +
      String(now.getSeconds()).padStart(2, '0');
    return `${prefix}_${ts}.${extension}`;
  },

  /**
   * Download data as file
   */
  downloadFile(data, filename, type = 'application/octet-stream') {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Read file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  /**
   * Read file as array buffer
   */
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Parse CSV file
   */
  parseCSV(text) {
    // RFC-4180 parser: handles quoted fields containing commas, newlines and
    // escaped "" quotes. (The previous line-splitting parser corrupted these.)
    const s = String(text ?? '');
    const records = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        records.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      records.push(row);
    }

    // Drop fully-empty records (e.g. a trailing newline)
    const clean = records.filter(r => !(r.length === 1 && r[0].trim() === ''));
    if (clean.length === 0) return { headers: [], rows: [] };

    const headers = clean[0].map(h => h.trim());
    const rows = [];
    for (let i = 1; i < clean.length; i++) {
      const values = clean[i];
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = (values[index] ?? '').trim();
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  },

  /**
   * Parse a single CSV line handling quoted values
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  },

  /**
   * Convert array to CSV string
   */
  toCSV(headers, rows) {
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    
    const headerLine = headers.map(escapeCSV).join(',');
    const dataLines = rows.map(row => 
      headers.map(h => escapeCSV(row[h])).join(',')
    );
    
    return [headerLine, ...dataLines].join('\n');
  },

  /**
   * Convert bytes to hex string
   */
  bytesToHex(bytes) {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Convert hex string to bytes
   */
  hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
  },

  /**
   * Escape HTML to prevent XSS.
   * Quote-safe: escapes & < > " ' so the result is safe both as element text
   * and inside single/double-quoted attribute or inline-handler contexts.
   */
  escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Escape string for use in JavaScript string literals (within onclick handlers etc.)
   */
  escapeJsString(text) {
    if (!text) return '';
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  },

  /**
   * Local storage helpers with error handling
   */
  storage: {
    get(key, defaultValue = null) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (e) {
        console.error('Storage get error:', e);
        return defaultValue;
      }
    },
    
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('Storage set error:', e);
        return false;
      }
    },
    
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.error('Storage remove error:', e);
        return false;
      }
    }
  },

  /**
   * IndexedDB wrapper for large data storage
   */
  db: {
    dbName: 'OpenGD77CPS',
    dbVersion: 2,
    
    async open() {
      if (this._db) return this._db;
      if (this._dbPromise) return this._dbPromise;
      this._dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = () => { this._dbPromise = null; reject(request.error); };
        request.onsuccess = () => { this._db = request.result; resolve(request.result); };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          // Create stores for large data
          if (!db.objectStoreNames.contains('codeplugs')) {
            db.createObjectStore('codeplugs', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('dmrDatabase')) {
            const store = db.createObjectStore('dmrDatabase', { keyPath: 'id' });
            store.createIndex('callsign', 'callsign', { unique: false });
          }
          if (!db.objectStoreNames.contains('repeaters')) {
            db.createObjectStore('repeaters', { keyPath: 'callsign' });
          }
          // Store for DMR repeater cache (large data that exceeds localStorage quota)
          if (!db.objectStoreNames.contains('dmrRepeaters')) {
            db.createObjectStore('dmrRepeaters', { keyPath: 'id' });
          }
        };
      });
      return this._dbPromise;
    },
    
    async get(storeName, key) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },
    
    async getAll(storeName) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },
    
    async put(storeName, data) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },

    /**
     * Write many records in a single transaction. Far faster than repeated
     * put() calls (which open a connection + transaction each time).
     * @param {string} storeName
     * @param {Array} items
     * @param {boolean} [clearFirst] - clear the store before writing
     * @returns {Promise<number>} number of records written
     */
    async putMany(storeName, items, clearFirst = false) {
      const db = await this.open();
      const list = Array.isArray(items) ? items : [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        if (clearFirst) store.clear();
        for (const item of list) store.put(item);
        tx.oncomplete = () => resolve(list.length);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
    
    async delete(storeName, key) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },
    
    async clear(storeName) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
  },

  /**
   * Satellite TLE utilities
   */
  satellite: {
    /**
     * Get custom TLE sources from local storage
     */
    getCustomTLESources() {
      return Utils.storage.get(CONFIG.STORAGE.CUSTOM_TLE_SOURCES) || [];
    },

    /**
     * Save custom TLE sources to local storage
     */
    saveCustomTLESources(sources) {
      Utils.storage.set(CONFIG.STORAGE.CUSTOM_TLE_SOURCES, sources);
    },

    /**
     * Add a custom TLE source
     * @param {string} name - Display name for the source
     * @param {string} url - URL of the TLE source (must return 3-line TLE format)
     */
    addCustomTLESource(name, url) {
      const sources = this.getCustomTLESources();
      const id = Utils.generateId();
      sources.push({ id, name, url });
      this.saveCustomTLESources(sources);
      return id;
    },

    /**
     * Remove a custom TLE source
     * @param {string} id - ID of the source to remove
     */
    removeCustomTLESource(id) {
      const sources = this.getCustomTLESources().filter(s => s.id !== id);
      this.saveCustomTLESources(sources);
    },

    /**
     * Get all available TLE sources (predefined + custom)
     */
    getAllTLESources() {
      const predefined = Object.entries(CONFIG.TLE_SOURCES).map(([key, value]) => ({
        id: key,
        name: value.name,
        url: value.url,
        type: 'predefined'
      }));
      
      const custom = this.getCustomTLESources().map(s => ({
        ...s,
        type: 'custom'
      }));
      
      return [...predefined, ...custom];
    },

    /**
     * Standalone build: Celestrak sends CORS headers, so TLE URLs are fetched
     * directly from the browser. (The hosted build proxied these to avoid CORS.)
     * @param {string} url - Original URL
     * @returns {string} The URL unchanged
     */
    proxyTLEUrl(url) {
      return url;
    },

    /**
     * Fetch TLE data from a specific URL
     * Celestrak.org URLs are automatically proxied through the API
     * Returns an object mapping NORAD catalogue numbers to TLE data
     */
    async fetchTLEsFromUrl(url) {
      try {
        const fetchUrl = this.proxyTLEUrl(url);
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`TLE fetch failed: ${response.status}`);
        }
        
        const text = await response.text();
        return this.parseTLEData(text);
      } catch (error) {
        console.error('TLE fetch error:', error);
        throw error;
      }
    },

    /**
     * Fetch TLE data from the default Celestrak amateur source
     * Returns an object mapping NORAD catalogue numbers to TLE data
     */
    async fetchTLEs() {
      const primary = await this.fetchTLEsFromUrl(CONFIG.TLE_API);
      if (!CONFIG.TLE_SUPPLEMENTAL) return primary;
      try {
        const supplemental = await this.fetchTLEsFromUrl(CONFIG.TLE_SUPPLEMENTAL);
        // Primary (CelesTrak) wins on conflicts; the supplemental fills the gaps
        // (e.g. IO-86, which CelesTrak's amateur group omits).
        return { ...supplemental, ...primary };
      } catch (error) {
        console.warn('Supplemental TLE fetch failed:', error.message);
        return primary;
      }
    },

    /**
     * Fetch TLE data from multiple sources and merge them
     * @param {Array<string>} sourceIds - Array of source IDs to fetch from
     * @returns {Object} Merged TLE data object
     */
    async fetchTLEsFromSources(sourceIds) {
      const allSources = this.getAllTLESources();
      const mergedTLEs = {};
      
      for (const sourceId of sourceIds) {
        const source = allSources.find(s => s.id === sourceId);
        if (source) {
          try {
            const tles = await this.fetchTLEsFromUrl(source.url);
            Object.assign(mergedTLEs, tles);
          } catch (error) {
            console.warn(`Failed to fetch TLEs from ${source.name}:`, error.message);
          }
        }
      }
      
      return mergedTLEs;
    },

    /**
     * Parse TLE data from 3-line format
     * Returns object: { catalogueNumber: { name, line1, line2 } }
     */
    parseTLEData(text) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const tles = {};
      
      for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];
        
        // Validate TLE format
        if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
          // Extract NORAD catalogue number from line 1 (columns 3-7)
          const catalogueNumber = line1.substring(2, 7).trim();
          
          tles[catalogueNumber] = {
            name: name,
            line1: line1,
            line2: line2,
            catalogueNumber: catalogueNumber
          };
        }
      }
      
      return tles;
    },

    /**
     * Update satellites with TLE data
     * Returns updated satellites array
     * 
     * Note: NORAD catalogue numbers in satellite config include a classification 
     * letter suffix (e.g., "25544U" where U=Unclassified). TLE data uses just the 
     * numeric NORAD ID (e.g., "25544"). We strip trailing letters to match.
     * 
     * @param {Array} satellites - Array of satellite objects
     * @param {Array<string>} sourceIds - Optional array of TLE source IDs to use. If not provided, uses default.
     */
    async updateSatelliteTLEs(satellites, sourceIds = null) {
      let tles;
      
      if (sourceIds && sourceIds.length > 0) {
        tles = await this.fetchTLEsFromSources(sourceIds);
      } else {
        tles = await this.fetchTLEs();
      }
      
      const updated = satellites.map(sat => {
        // Extract NORAD ID from catalogue number
        // Format: NNNNN or NNNNNX where X is a classification letter (U=Unclassified, C=Classified, S=Secret)
        const noradId = (sat.catalogueNumber || '').replace(/[A-Za-z]+$/, '').trim();
        
        if (tles[noradId]) {
          return {
            ...sat,
            tle: tles[noradId]
          };
        }
        return sat;
      });
      
      return updated;
    },

    /**
     * Cache TLE data in local storage
     */
    cacheTLEs(tles) {
      Utils.storage.set(CONFIG.STORAGE.SATELLITE_TLES, {
        timestamp: Date.now(),
        data: tles
      });
    },

    /**
     * Get cached TLE data if not expired
     */
    getCachedTLEs() {
      const cached = Utils.storage.get(CONFIG.STORAGE.SATELLITE_TLES);
      
      if (cached && cached.timestamp) {
        const age = Date.now() - cached.timestamp;
        if (age < CONFIG.CACHE.SATELLITE_TLES) {
          return cached.data;
        }
      }
      
      return null;
    },

    /**
     * Get TLEs (from cache or fetch new)
     */
    async getTLEs(forceRefresh = false) {
      if (!forceRefresh) {
        const cached = this.getCachedTLEs();
        if (cached) {
          return cached;
        }
      }
      
      const tles = await this.fetchTLEs();
      this.cacheTLEs(tles);
      return tles;
    }
  }
};

// Make Utils available globally
window.Utils = Utils;
