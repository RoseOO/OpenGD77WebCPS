/**
 * OpenGD77 CPS Web - Theme Module
 * 
 * Handles GTM file parsing, theme preview, and theme management.
 * 
 * GTM File Format (from CPS decompilation):
 * - 64 bytes total (THEME_SIZE = 64)
 * - 32 color slots × 2 bytes each (RGB565 format, big-endian)
 * - Supports both Day Theme and Night Theme
 * 
 * RGB565 Format:
 * - 5 bits Red (bits 15-11)
 * - 6 bits Green (bits 10-5)  
 * - 5 bits Blue (bits 4-0)
 */

const Theme = {
  // Theme constants
  THEME_SIZE: 64,
  NUM_COLORS: 32,
  
  // Theme color slot definitions (from firmware source THEME_ITEM enum)
  COLOR_SLOTS: [
    { id: 0,  key: 'fgDefault',           label: 'Text Default',         description: 'Default text foreground colour' },
    { id: 1,  key: 'bg',                  label: 'Background',           description: 'Global background colour' },
    { id: 2,  key: 'fgDecoration',        label: 'Decoration',           description: 'Borders, drop-shadow, menu separators' },
    { id: 3,  key: 'fgTextInput',         label: 'Text Input',           description: 'Foreground colour of text input' },
    { id: 4,  key: 'fgSplashscreen',      label: 'Boot Screen Text',     description: 'Foreground colour of splash screen' },
    { id: 5,  key: 'bgSplashscreen',      label: 'Boot Screen BG',       description: 'Background colour of splash screen' },
    { id: 6,  key: 'fgNotification',      label: 'Notification Text',    description: 'Notification text + squelch bargraph' },
    { id: 7,  key: 'fgWarningNotif',      label: 'Warning Notification', description: 'Warning notification/messages' },
    { id: 8,  key: 'fgErrorNotif',        label: 'Error Notification',   description: 'Error notification/messages' },
    { id: 9,  key: 'bgNotification',      label: 'Notification BG',      description: 'Notification background' },
    { id: 10, key: 'fgMenuName',          label: 'Menu Name',            description: 'Menu name/header foreground' },
    { id: 11, key: 'bgMenuName',          label: 'Menu Name BG',         description: 'Menu name/header background' },
    { id: 12, key: 'fgMenuItem',          label: 'Menu Item',            description: 'Menu entry foreground' },
    { id: 13, key: 'fgMenuItemSelected',  label: 'Menu Highlight',       description: 'Selected menu entry foreground' },
    { id: 14, key: 'fgOptionsValue',      label: 'Option Value',         description: 'Settings values colour' },
    { id: 15, key: 'fgHeaderText',        label: 'Header Text',          description: 'Channel/VFO header foreground' },
    { id: 16, key: 'bgHeaderText',        label: 'Header Text BG',       description: 'Channel/VFO header background' },
    { id: 17, key: 'fgRssiBar',           label: 'RSSI Bar',             description: 'RSSI bars <= S9' },
    { id: 18, key: 'fgRssiBarS9p',        label: 'RSSI Bar S9+',         description: 'RSSI bars > S9' },
    { id: 19, key: 'fgChannelName',       label: 'Channel Name',         description: 'Channel name foreground' },
    { id: 20, key: 'fgChannelContact',    label: 'Contact',              description: 'Contact/TG name foreground' },
    { id: 21, key: 'fgChannelContactInfo',label: 'Contact Info',         description: 'Contact info (DB/Ct/TA)' },
    { id: 22, key: 'fgZoneName',          label: 'Zone Name',            description: 'Zone name foreground' },
    { id: 23, key: 'fgRxFreq',            label: 'RX Frequency',         description: 'RX frequency foreground' },
    { id: 24, key: 'fgTxFreq',            label: 'TX Frequency',         description: 'TX frequency foreground' },
    { id: 25, key: 'fgCssSqlValues',      label: 'CSS/SQL Values',       description: 'CSS & Squelch values' },
    { id: 26, key: 'fgTxCounter',         label: 'TX Counter',           description: 'Timer value in TX screen' },
    { id: 27, key: 'fgPolarDrawing',      label: 'Polar Drawing',        description: 'Polar drawing in satellite/GPS' },
    { id: 28, key: 'fgSatellite',         label: 'Satellite Spot',       description: 'Satellite spots in sat screen' },
    { id: 29, key: 'fgGpsNumber',         label: 'GPS Number',           description: 'GPS number in GPS screen' },
    { id: 30, key: 'fgGpsColour',         label: 'GPS Spot',             description: 'GPS bar and spots' },
    { id: 31, key: 'fgBdColour',          label: 'BeiDou Spot',          description: 'BeiDou bar and spots' }
  ],

  // Default theme colors (stock OpenGD77 theme - white background, black text)
  DEFAULT_COLORS: {
    fgDefault: '#000000',
    bg: '#ffffff',
    fgDecoration: '#000000',
    fgTextInput: '#000000',
    fgSplashscreen: '#000000',
    bgSplashscreen: '#ffffff',
    fgNotification: '#000000',
    fgWarningNotif: '#000000',
    fgErrorNotif: '#000000',
    bgNotification: '#ffffff',
    fgMenuName: '#000000',
    bgMenuName: '#ffffff',
    fgMenuItem: '#000000',
    fgMenuItemSelected: '#000000',
    fgOptionsValue: '#000000',
    fgHeaderText: '#000000',
    bgHeaderText: '#ffffff',
    fgRssiBar: '#000000',
    fgRssiBarS9p: '#000000',
    fgChannelName: '#000000',
    fgChannelContact: '#000000',
    fgChannelContactInfo: '#000000',
    fgZoneName: '#000000',
    fgRxFreq: '#000000',
    fgTxFreq: '#000000',
    fgCssSqlValues: '#000000',
    fgTxCounter: '#000000',
    fgPolarDrawing: '#000000',
    fgSatellite: '#000000',
    fgGpsNumber: '#000000',
    fgGpsColour: '#0000ff',
    fgBdColour: '#ff0000'
  },

  // Bundled themes from opengd/Themes directory
  BUNDLED_THEMES: [
    { name: 'Default', file: 'default.gtm', author: 'OpenGD77' },
    { name: 'AnyTone', file: 'anytone.gtm', author: 'Community' },
    { name: 'AnyTone-like', file: 'anytone-like.gtm', author: 'F1RMB' },
    { name: 'BG3NCT', file: 'bg3nct.gtm', author: 'BG3NCT' },
    { name: 'Black Orange Blue', file: 'black-orange-blue.gtm', author: 'M7RDN' },
    { name: 'Blue', file: 'kd9wqc-blue.gtm', author: 'KD9WQC' },
    { name: 'Blue Letters', file: 'blue-letters.gtm', author: 'Community' },
    { name: 'Breeze Dark', file: 'breeze-dark.gtm', author: 'Community' },
    { name: 'DM-1701 Colour', file: 'dm1701-colour.gtm', author: 'DJ0ABR' },
    { name: 'DM8LE', file: 'dm8le.gtm', author: 'DM8LE' },
    { name: 'DW7GDL', file: 'dw7gdl.gtm', author: 'DW7GDL' },
    { name: 'EA3V v3', file: 'ea3v-v3.gtm', author: 'EA3V' },
    { name: 'EA3V v4', file: 'ea3v-v4.gtm', author: 'EA3V' },
    { name: 'EU1AEQ', file: 'eu1aeq.gtm', author: 'EU1AEQ' },
    { name: 'EU1AEQ Inverted', file: 'eu1aeq-inverted.gtm', author: 'EU1AEQ' },
    { name: 'FT5DR-like', file: 'ft5dr-like.gtm', author: 'F1RMB' },
    { name: 'FX2YZ', file: 'fx2yz.gtm', author: 'FX2YZ' },
    { name: 'Green', file: 'kd9wqc-green.gtm', author: 'KD9WQC' },
    { name: 'Greyish', file: 'greyish.gtm', author: 'F1RMB' },
    { name: 'Groovy Green 3', file: 'groovy-green-3.gtm', author: 'Community' },
    { name: 'I5EKX Low Brightness', file: 'i5ekx-low-brightness.gtm', author: 'I5EKX' },
    { name: 'IX1VGS', file: 'ix1vgs.gtm', author: 'IX1VGS' },
    { name: 'KA8CLX', file: 'ka8clx.gtm', author: 'KA8CLX' },
    { name: 'Kenwood 74', file: 'kenwood74.gtm', author: 'W1ZLA / F1RMB' },
    { name: 'LB9AB', file: 'lb9ab.gtm', author: 'LB9AB' },
    { name: 'Murca', file: 'murca.gtm', author: 'KD5FMU' },
    { name: 'Outrageous Orange', file: 'outrageous-orange.gtm', author: 'Community' },
    { name: 'Purple', file: 'kd9wqc-purple.gtm', author: 'KD9WQC' },
    { name: 'Purple Style', file: 'purple-style.gtm', author: 'Community' },
    { name: 'Purple Style 1b', file: 'purple-style-1b.gtm', author: 'Community' },
    { name: 'Purple Style 1c', file: 'purple-style-1c.gtm', author: 'Community' },
    { name: 'Red', file: 'kd9wqc-red.gtm', author: 'KD9WQC' },
    { name: 'SM0RGM', file: 'sm0rgm.gtm', author: 'SM0RGM' },
    { name: 'SQ5QS Light', file: 'sq5qs-light.gtm', author: 'SQ5QS' },
    { name: 'YO3GWM', file: 'yo3gwm.gtm', author: 'YO3GWM' }
  ],

  /**
   * Convert RGB565 (16-bit) to RGB888 hex color string
   * RGB565 format: RRRRRGGGGGGBBBBB (big-endian in file)
   */
  rgb565ToHex(rgb565) {
    const r5 = (rgb565 >> 11) & 0x1F;
    const g6 = (rgb565 >> 5) & 0x3F;
    const b5 = rgb565 & 0x1F;
    
    // Scale to 8-bit values
    const r = Math.round(r5 / 31 * 255);
    const g = Math.round(g6 / 63 * 255);
    const b = Math.round(b5 / 31 * 255);
    
    return '#' + r.toString(16).padStart(2, '0') +
                 g.toString(16).padStart(2, '0') +
                 b.toString(16).padStart(2, '0');
  },

  /**
   * Convert RGB888 hex color string to RGB565 (16-bit)
   */
  hexToRgb565(hex) {
    // Remove # if present, expand #abc shorthand, and validate.
    let h = String(hex ?? '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) {
      return 0; // invalid colour -> black
    }

    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    
    // Scale to 5/6/5 bits
    const r5 = Math.round(r / 255 * 31);
    const g6 = Math.round(g / 255 * 63);
    const b5 = Math.round(b / 255 * 31);
    
    return (r5 << 11) | (g6 << 5) | b5;
  },

  /**
   * Parse a GTM file (64 bytes) into a theme object
   */
  parseGTM(data) {
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }
    
    if (data.length !== this.THEME_SIZE) {
      throw new Error(`Invalid GTM file size: expected ${this.THEME_SIZE} bytes, got ${data.length}`);
    }
    
    const theme = {};
    
    for (let i = 0; i < this.NUM_COLORS; i++) {
      const offset = i * 2;
      // GTM file stores colors as big-endian RGB565
      const rgb565 = (data[offset] << 8) | data[offset + 1];
      const slot = this.COLOR_SLOTS[i];
      theme[slot.key] = this.rgb565ToHex(rgb565);
    }
    
    return theme;
  },

  /**
   * Serialize a theme object to GTM format (64 bytes)
   */
  serializeGTM(theme) {
    const data = new Uint8Array(this.THEME_SIZE);
    
    for (let i = 0; i < this.NUM_COLORS; i++) {
      const slot = this.COLOR_SLOTS[i];
      const hex = theme[slot.key] || this.DEFAULT_COLORS[slot.key] || '#000000';
      const rgb565 = this.hexToRgb565(hex);
      
      const offset = i * 2;
      // Store as big-endian
      data[offset] = (rgb565 >> 8) & 0xFF;
      data[offset + 1] = rgb565 & 0xFF;
    }
    
    return data;
  },

  /**
   * Download a GTM file
   */
  downloadGTM(theme, filename = 'theme.gtm') {
    const data = this.serializeGTM(theme);
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
  },

  /**
   * Load a bundled theme by name
   */
  async loadBundledTheme(filename) {
    try {
      const response = await fetch(`/themes/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load theme: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      return this.parseGTM(new Uint8Array(buffer));
    } catch (error) {
      console.error('Error loading bundled theme:', error);
      throw error;
    }
  },

  /**
   * Get list of bundled themes with preview data
   */
  async getBundledThemesWithPreviews() {
    const themes = [];
    
    for (const meta of this.BUNDLED_THEMES) {
      try {
        const theme = await this.loadBundledTheme(meta.file);
        themes.push({
          ...meta,
          colors: theme
        });
      } catch (error) {
        console.warn(`Failed to load theme ${meta.name}:`, error);
      }
    }
    
    return themes;
  },

  /**
   * Create a mini preview canvas for a theme
   */
  createPreviewCanvas(theme, width = 160, height = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = theme.bg || '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Header bar
    ctx.fillStyle = theme.bgMenuName || theme.bgHeaderText || '#0000aa';
    ctx.fillRect(0, 0, width, 14);
    
    ctx.fillStyle = theme.fgMenuName || theme.fgHeaderText || '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText('OpenGD77', 4, 11);
    
    // Channel/Frequency area
    ctx.fillStyle = theme.fgChannelName || theme.fgDefault || '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('145.500 MHz', 8, 32);
    
    // Zone name
    ctx.fillStyle = theme.fgZoneName || theme.fgDefault || '#aaaaaa';
    ctx.font = '9px monospace';
    ctx.fillText('Local Repeaters', 8, 44);
    
    // RSSI bar
    ctx.fillStyle = theme.fgRssiBar || '#00ff00';
    ctx.fillRect(8, 50, 80, 6);
    ctx.fillStyle = theme.fgRssiBarS9p || '#ff0000';
    ctx.fillRect(88, 50, 20, 6);
    
    // Contact/TG
    ctx.fillStyle = theme.fgChannelContact || theme.fgDefault || '#ffff00';
    ctx.font = '8px monospace';
    ctx.fillText('TG 1', width - 30, 32);
    
    return canvas;
  },

  /**
   * Generate a preview image data URL
   */
  getPreviewDataURL(theme, width = 160, height = 64) {
    const canvas = this.createPreviewCanvas(theme, width, height);
    return canvas.toDataURL('image/png');
  },

  /**
   * Create a detailed radio screen preview
   */
  createDetailedPreview(theme, mode = 'channel') {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Clear with background
    ctx.fillStyle = theme.bg || '#000000';
    ctx.fillRect(0, 0, 160, 128);
    
    if (mode === 'channel') {
      this._drawChannelScreen(ctx, theme);
    } else if (mode === 'menu') {
      this._drawMenuScreen(ctx, theme);
    } else if (mode === 'boot') {
      this._drawBootScreen(ctx, theme);
    }
    
    return canvas;
  },

  _drawChannelScreen(ctx, theme) {
    // Header bar
    ctx.fillStyle = theme.bgHeaderText || '#000044';
    ctx.fillRect(0, 0, 160, 16);
    
    ctx.fillStyle = theme.fgHeaderText || '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('CH', 4, 12);
    ctx.fillText('PWR:5W', 100, 12);
    
    // Zone name
    ctx.fillStyle = theme.fgZoneName || '#888888';
    ctx.font = '9px monospace';
    ctx.fillText('Local Repeaters', 4, 28);
    
    // Channel name (large)
    ctx.fillStyle = theme.fgChannelName || '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('GB3XX', 4, 46);
    
    // Frequency
    ctx.fillStyle = theme.fgRxFreq || '#00ff00';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('145.500', 4, 68);
    
    // TX Frequency
    ctx.fillStyle = theme.fgTxFreq || '#ff8800';
    ctx.font = '10px monospace';
    ctx.fillText('TX: 145.500', 4, 82);
    
    // Contact/TG
    ctx.fillStyle = theme.fgChannelContact || '#ffff00';
    ctx.font = '10px monospace';
    ctx.fillText('TG 1 UK Calling', 4, 96);
    
    // RSSI bar background
    ctx.fillStyle = theme.fgDecoration || '#333333';
    ctx.fillRect(4, 106, 152, 8);
    
    // RSSI bar S1-S9
    ctx.fillStyle = theme.fgRssiBar || '#00ff00';
    ctx.fillRect(4, 106, 100, 8);
    
    // RSSI bar S9+
    ctx.fillStyle = theme.fgRssiBarS9p || '#ff0000';
    ctx.fillRect(104, 106, 30, 8);
    
    // CSS/SQL values
    ctx.fillStyle = theme.fgCssSqlValues || '#aaaaaa';
    ctx.font = '8px monospace';
    ctx.fillText('CC1 TS2', 110, 82);
  },

  _drawMenuScreen(ctx, theme) {
    // Menu header
    ctx.fillStyle = theme.bgMenuName || '#0000aa';
    ctx.fillRect(0, 0, 160, 16);
    
    ctx.fillStyle = theme.fgMenuName || '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('Options', 50, 12);
    
    // Menu items
    const items = ['Display', 'Sound', 'Radio Options', 'Contact Details', 'Zone'];
    let y = 24;
    
    for (let i = 0; i < items.length; i++) {
      if (i === 1) {
        // Selected item
        ctx.fillStyle = theme.fgMenuItemSelected || '#000000';
        ctx.fillRect(2, y - 10, 156, 14);
        ctx.fillStyle = theme.bg || '#ffffff';
      } else {
        ctx.fillStyle = theme.fgMenuItem || '#ffffff';
      }
      ctx.font = '10px monospace';
      ctx.fillText(items[i], 8, y);
      y += 16;
    }
    
    // Options value example
    ctx.fillStyle = theme.fgOptionsValue || '#00ffff';
    ctx.font = '10px monospace';
    ctx.fillText('Auto', 120, 40);
  },

  _drawBootScreen(ctx, theme) {
    // Boot screen background
    ctx.fillStyle = theme.bgSplashscreen || '#000000';
    ctx.fillRect(0, 0, 160, 128);
    
    // Boot text
    ctx.fillStyle = theme.fgSplashscreen || '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OpenGD77', 80, 50);
    
    ctx.font = '12px monospace';
    ctx.fillText('OpenGD77 WebCPS', 80, 75);
    
    ctx.textAlign = 'left';
  },

  /**
   * Compare two themes and return differences
   */
  compareThemes(theme1, theme2) {
    const differences = [];
    
    for (const slot of this.COLOR_SLOTS) {
      const c1 = theme1[slot.key] || '#000000';
      const c2 = theme2[slot.key] || '#000000';
      
      if (c1.toLowerCase() !== c2.toLowerCase()) {
        differences.push({
          slot: slot,
          color1: c1,
          color2: c2
        });
      }
    }
    
    return differences;
  },

  /**
   * Clone a theme object
   */
  cloneTheme(theme) {
    const clone = {};
    for (const slot of this.COLOR_SLOTS) {
      clone[slot.key] = theme[slot.key] || this.DEFAULT_COLORS[slot.key];
    }
    return clone;
  },

  /**
   * Validate a theme object has all required colors
   */
  validateTheme(theme) {
    const missing = [];
    for (const slot of this.COLOR_SLOTS) {
      if (!theme[slot.key]) {
        missing.push(slot.label);
      }
    }
    return {
      valid: missing.length === 0,
      missing: missing
    };
  },

  /**
   * Apply defaults to a partial theme
   */
  applyDefaults(partialTheme) {
    const complete = {};
    for (const slot of this.COLOR_SLOTS) {
      complete[slot.key] = partialTheme[slot.key] || this.DEFAULT_COLORS[slot.key] || '#000000';
    }
    return complete;
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Theme;
}
