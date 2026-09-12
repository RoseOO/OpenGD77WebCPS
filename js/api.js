/**
 * OpenGD77 CPS Web - Standalone Data Layer
 *
 * This build has NO backend. It provides:
 *   - A local codeplug library stored in IndexedDB.
 *   - Direct fetches to public data sources that allow browser (CORS) access:
 *       - RSGB UK repeaters (api-beta.rsgb.online)
 *       - Brandmeister talkgroups (api.brandmeister.network)
 *       - Celestrak TLEs (handled in utils.js)
 *   - Built-in satellite defaults from CONFIG.DEFAULT_SATELLITES.
 *
 * Account, server-storage, sharing and RadioReference features are not
 * available in the standalone build and return clear errors (or empty lists).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STANDALONE_UNAVAILABLE = 'Not available in this standalone build.';

function hzToMhz(freqHz) {
  if (!freqHz || typeof freqHz !== 'number') return '';
  return (freqHz / 1000000).toFixed(6);
}

function extractColourCode(modeCodes) {
  if (!modeCodes || !Array.isArray(modeCodes) || modeCodes.length === 0) return null;
  for (const code of modeCodes) {
    const match = String(code).match(/^M:(\d+)$/i);
    if (match) {
      const cc = parseInt(match[1], 10);
      if (cc >= 0 && cc <= 15) return cc;
    }
  }
  return null;
}

function hasBothFMAndDMR(modeCodes) {
  if (!modeCodes || !Array.isArray(modeCodes) || modeCodes.length === 0) return false;
  const modes = modeCodes.map(m => String(m).toUpperCase());
  const hasFM = modes.some(m => m === 'A');
  const hasDMR = modes.some(m => m === 'D' || m.includes('DMR') || m.startsWith('M:'));
  return hasFM && hasDMR;
}

function mapRepeaterType(type, modeCodes = []) {
  if (modeCodes && modeCodes.length > 0) {
    const modes = modeCodes.map(m => String(m).toUpperCase());
    if (modes.some(m => m === 'D' || m.includes('DMR'))) return 'DV';
    if (modes.some(m => m.startsWith('M:'))) return 'DV';
    if (modes.some(m => m === 'A')) return 'AV';
  }
  if (!type) return 'AV';
  const t = type.toUpperCase();
  if (t === 'DV') return 'DV';
  if (t === 'DD') return 'DD';
  if (t === 'AV') return 'AV';
  if (t === 'RL') return 'AV';
  return 'AV';
}

// Maidenhead locator -> { latitude, longitude } (centre of the square)
function maidenheadToLatLon(locator) {
  if (!locator || typeof locator !== 'string' || locator.length < 4) return null;
  const L = locator.toUpperCase();
  const A = 'A'.charCodeAt(0);
  const lonField = L.charCodeAt(0) - A;
  const latField = L.charCodeAt(1) - A;
  if (lonField < 0 || lonField > 17 || latField < 0 || latField > 17) return null;

  const lonDigit = parseInt(L[2], 10);
  const latDigit = parseInt(L[3], 10);
  if (isNaN(lonDigit) || isNaN(latDigit)) return null;

  let lon = lonField * 20 - 180 + lonDigit * 2;
  let lat = latField * 10 - 90 + latDigit;

  if (L.length >= 6) {
    const lonSub = L.charCodeAt(4) - A;
    const latSub = L.charCodeAt(5) - A;
    if (lonSub >= 0 && lonSub < 24 && latSub >= 0 && latSub < 24) {
      lon += lonSub / 12 + 1 / 24;
      lat += latSub / 24 + 1 / 48;
    } else {
      lon += 1;
      lat += 0.5;
    }
  } else {
    lon += 1;
    lat += 0.5;
  }

  return { latitude: lat, longitude: lon };
}

/**
 * Transform the raw RSGB API response into the record shape the CPS expects,
 * splitting dual-mode (FM + DMR) repeaters into two records.
 */
function transformRSGBRepeaters(rawRepeaters) {
  if (!Array.isArray(rawRepeaters)) return [];
  return rawRepeaters.flatMap(r => {
    const locator = r.locator || '';
    let latitude = null;
    let longitude = null;
    if (locator) {
      const coords = maidenheadToLatLon(locator);
      if (coords) {
        latitude = parseFloat(coords.latitude.toFixed(4));
        longitude = parseFloat(coords.longitude.toFixed(4));
      }
    }

    const base = {
      callsign: r.repeater || r.callsign || '',
      town: r.town || '',
      band: r.band || '',
      originalType: r.type || '',
      modeCodes: r.modeCodes || null,
      txFreq: hzToMhz(r.tx),
      rxFreq: hzToMhz(r.rx),
      txBandwidth: r.txbw || 12.5,
      locator,
      latitude,
      longitude,
      status: r.status || '',
      keeper: r.keeperCallsign || '',
      power: r.dbwErp || null,
      ngr: r.extraDetails?.ngr || '',
      polarisation: r.extraDetails?.polarisation || ''
    };

    if (hasBothFMAndDMR(r.modeCodes)) {
      return [
        { ...base, rsgbId: r.id || null, type: 'AV', ctcss: r.ctcss || 0, colorCode: null },
        { ...base, rsgbId: r.id ? r.id + 10000000 : null, type: 'DV', ctcss: 0, colorCode: extractColourCode(r.modeCodes) }
      ];
    }

    return [{
      ...base,
      rsgbId: r.id || null,
      type: mapRepeaterType(r.type, r.modeCodes),
      ctcss: r.ctcss || 0,
      colorCode: extractColourCode(r.modeCodes)
    }];
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const API = {
  user: null,
  session: null,

  async init() {
    return false;
  },

  isLoggedIn() {
    return false;
  },

  // Generic request helper - the standalone build has no backend, so any
  // feature still using this (e.g. the WTR import) fails with a clear message.
  async request() {
    throw new Error(STANDALONE_UNAVAILABLE);
  },

  // ==========================================================================
  // Authentication - not available in the standalone build
  // ==========================================================================

  async login() { throw new Error(STANDALONE_UNAVAILABLE); },
  async register() { throw new Error(STANDALONE_UNAVAILABLE); },
  async logout() { this.session = null; this.user = null; },
  async getUser() { return { user: null }; },
  async updateProfile() { throw new Error(STANDALONE_UNAVAILABLE); },

  // ==========================================================================
  // Local codeplug library (IndexedDB)
  // ==========================================================================

  async saveCodeplug(name, description, codeplugData) {
    const now = Date.now();
    const record = {
      id: Utils.generateId(),
      name: name || 'Untitled',
      description: description || '',
      data: codeplugData,
      createdAt: now,
      updatedAt: now
    };
    await Utils.db.put('codeplugs', record);
    return record;
  },

  async getMyCodeplugs() {
    const all = await Utils.db.getAll('codeplugs');
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async getCodeplug(id) {
    const record = await Utils.db.get('codeplugs', id);
    if (!record) throw new Error('Codeplug not found in your local library');
    return record;
  },

  async updateCodeplug(id, name, description, codeplugData) {
    const record = (await Utils.db.get('codeplugs', id)) || { id };
    record.name = name || record.name || 'Untitled';
    record.description = description || '';
    if (codeplugData) record.data = codeplugData;
    record.updatedAt = Date.now();
    await Utils.db.put('codeplugs', record);
    return record;
  },

  async deleteCodeplug(id) {
    await Utils.db.delete('codeplugs', id);
  },

  // ==========================================================================
  // Shared / community library - not available in the standalone build
  // ==========================================================================

  async shareCodeplug() { throw new Error('Sharing is ' + STANDALONE_UNAVAILABLE.toLowerCase()); },
  async getSharedCodeplugs() { return []; },
  async getSharedCodeplug() { throw new Error(STANDALONE_UNAVAILABLE); },
  async copyCodeplug() { throw new Error(STANDALONE_UNAVAILABLE); },
  async updateSharedCodeplug() { throw new Error(STANDALONE_UNAVAILABLE); },
  async deleteSharedCodeplug() { throw new Error(STANDALONE_UNAVAILABLE); },
  async getSharedChannels() { return []; },
  async getSharedTalkgroups() { return []; },

  async shareSatelliteConfig() { throw new Error('Sharing is ' + STANDALONE_UNAVAILABLE.toLowerCase()); },
  async getSharedSatelliteConfigs() { return []; },
  async getSharedSatelliteConfig() { throw new Error(STANDALONE_UNAVAILABLE); },
  async importSharedSatelliteConfig() { throw new Error(STANDALONE_UNAVAILABLE); },
  async deleteSharedSatelliteConfig() { throw new Error(STANDALONE_UNAVAILABLE); },

  // ==========================================================================
  // UK Repeaters (RSGB) - fetched directly from the public RSGB API
  // ==========================================================================

  async getUKRepeaters(forceRefresh = false) {
    const cached = Utils.storage.get(CONFIG.STORAGE.REPEATER_CACHE);
    if (!forceRefresh && cached && cached.timestamp > Date.now() - CONFIG.CACHE.REPEATERS) {
      return cached.data;
    }

    try {
      const response = await fetch(`${CONFIG.RSGB_API}/all/systems`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`RSGB API returned ${response.status}`);

      const apiData = await response.json();
      const raw = Array.isArray(apiData) ? apiData : (apiData.data || []);
      const repeaters = transformRSGBRepeaters(raw);

      try {
        Utils.storage.set(CONFIG.STORAGE.REPEATER_CACHE, { timestamp: Date.now(), data: repeaters });
      } catch (cacheError) {
        console.warn('Could not cache repeater data:', cacheError);
      }

      return repeaters;
    } catch (error) {
      if (cached && cached.data) {
        console.warn('Using cached repeater data:', error);
        return cached.data;
      }
      throw error;
    }
  },

  async searchRepeaters(query, filters = {}) {
    const repeaters = await this.getUKRepeaters();
    let results = repeaters;

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(r =>
        r.callsign?.toLowerCase().includes(q) ||
        r.town?.toLowerCase().includes(q) ||
        r.locator?.toLowerCase().includes(q)
      );
    }

    if (filters.type) results = results.filter(r => r.type === filters.type);

    if (filters.band) {
      if (filters.band === '2m') {
        results = results.filter(r => {
          const freq = parseFloat(r.txFreq);
          return freq >= 144 && freq <= 148;
        });
      } else if (filters.band === '70cm') {
        results = results.filter(r => {
          const freq = parseFloat(r.txFreq);
          return freq >= 430 && freq <= 450;
        });
      }
    }

    return results;
  },

  /**
   * Combined repeaters within a bounding box.
   * Standalone build supports RSGB (UK) only; DMR repeater data needs a proxy.
   */
  async getRepeatersByBbox(bbox, options = {}) {
    const { south, west, north, east } = bbox;
    const { types = 'rsgb', limit } = options;
    const requested = types.split(',').map(t => t.trim());

    let repeaters = [];
    if (requested.includes('rsgb')) {
      const all = await this.getUKRepeaters();
      repeaters = all.filter(r =>
        r.latitude != null && r.longitude != null &&
        r.latitude >= south && r.latitude <= north &&
        r.longitude >= west && r.longitude <= east
      );
    }

    const total = repeaters.length;
    const truncated = limit != null && total > limit;
    if (truncated) repeaters = repeaters.slice(0, limit);

    return {
      repeaters,
      count: repeaters.length,
      total,
      truncated,
      bbox: { south, west, north, east },
      types: requested
    };
  },

  // ==========================================================================
  // DMR ID database / DMR repeaters - require a server-side proxy (CORS)
  // ==========================================================================

  async getDMRDatabase() {
    throw new Error('The DMR ID database import is not available here. Load the data from a CSV file instead.');
  },

  async searchDMRDatabase(query) {
    if (!query || query.length < 2) return [];
    let entries = [];
    try {
      entries = await Utils.db.getAll('dmrDatabase');
    } catch (e) {
      return [];
    }
    const q = query.toLowerCase();
    return entries
      .filter(e => e.id !== 'metadata')
      .filter(e =>
        e.callsign?.toLowerCase().includes(q) ||
        e.name?.toLowerCase().includes(q) ||
        String(e.id).includes(q)
      )
      .slice(0, 100);
  },

  async getDMRRepeaters() {
    throw new Error('DMR repeater import is not available here. Load the data from a file instead.');
  },

  async searchDMRRepeaters() {
    return [];
  },

  // ==========================================================================
  // Satellites
  // ==========================================================================

  async getSatelliteData() {
    return { satellites: CONFIG.DEFAULT_SATELLITES };
  },

  async getTLEData() {
    return Utils.satellite.fetchTLEs();
  },

  // ==========================================================================
  // Talkgroup import
  // ==========================================================================

  async getTalkgroupSources() {
    return {
      sources: [
        { id: 'brandmeister', name: 'Brandmeister', available: true },
        { id: 'tgif', name: 'TGIF', available: false },
        { id: 'systemx', name: 'System X', available: false },
        { id: 'freedmr', name: 'FreeDMR', available: false },
        { id: 'dmrplus', name: 'DMR+', available: false },
        { id: 'adn', name: 'ADN', available: false },
        { id: 'dvsph', name: 'DVSPh', available: false },
        { id: 'quadnet', name: 'QuadNet', available: false }
      ]
    };
  },

  async getBrandmeisterTalkgroups(search = '', forceRefresh = false) {
    try {
      const response = await fetch('https://api.brandmeister.network/v2/talkgroup', {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Brandmeister API returned ${response.status}`);

      const data = await response.json();
      let talkgroups = Object.entries(data).map(([id, name]) => ({
        id: parseInt(id, 10),
        name: typeof name === 'string' ? name : String(name)
      }));

      if (search) {
        const q = search.toLowerCase();
        talkgroups = talkgroups.filter(tg =>
          tg.name.toLowerCase().includes(q) || String(tg.id).includes(search)
        );
      }

      return { talkgroups };
    } catch (error) {
      console.error('Brandmeister fetch failed:', error);
      throw new Error('Could not fetch Brandmeister talkgroups: ' + error.message);
    }
  },

  _talkgroupsUnavailable(network) {
    throw new Error(`${network} talkgroup import is ${STANDALONE_UNAVAILABLE.toLowerCase()}`);
  },

  async getTGIFTalkgroups() { this._talkgroupsUnavailable('TGIF'); },
  async getSystemXTalkgroups() { this._talkgroupsUnavailable('System X'); },
  async getFreeDMRTalkgroups() { this._talkgroupsUnavailable('FreeDMR'); },
  async getDMRPlusTalkgroups() { this._talkgroupsUnavailable('DMR+'); },
  async getADNTalkgroups() { this._talkgroupsUnavailable('ADN'); },
  async getDVSPhTalkgroups() { this._talkgroupsUnavailable('DVSPh'); },
  async getQuadNetTalkgroups() { this._talkgroupsUnavailable('QuadNet'); },

  // ==========================================================================
  // RadioReference import - requires a server-side proxy / API key
  // ==========================================================================

  async rrLogin() { throw new Error('RadioReference import is ' + STANDALONE_UNAVAILABLE.toLowerCase()); },
  async rrGetCountries() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetCountryInfo() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetStateInfo() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetCountyInfo() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetAgencyInfo() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetSubcatFreqs() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTrsDetails() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTrsSites() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTrsTalkgroups() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTrsTalkgroupCats() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetZipcodeInfo() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrSearchMetro() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrSearchCountyFreq() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrSearchStateFreq() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrSearchMetroFreq() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetCountyFreqsByTag() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetAgencyFreqsByTag() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetMetroCounties() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTrsTypes() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetModes() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrGetTags() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrSearchTrsBySysid() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrFccGetCallsign() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrFccGetServiceCodes() { throw new Error(STANDALONE_UNAVAILABLE); },
  async rrFccGetProxCallsigns() { throw new Error(STANDALONE_UNAVAILABLE); }
};

window.API = API;
