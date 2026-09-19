/**
 * OpenGD77 CPS Web - Radio Preferences & Clone UI
 *
 * Renders the offline editor for the radio's settingsStruct_t preferences and
 * the guided clone flow. Decoding/encoding is done by RadioSettings; the data
 * lives on window.codeplug (JSON model / cloud library), never in .g77 files.
 */
const RadioSettingsUI = {
  _bound: false,

  _settings() {
    return window.codeplug ? window.codeplug.getSettings() : null;
  },

  _platform() {
    return window.codeplug ? window.codeplug.getSettingsPlatform() : 'STM32';
  },

  _status(msg, isError) {
    const el = document.getElementById('radioSettingsStatus');
    if (el) {
      el.textContent = msg || '';
      el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
    }
  },

  _escape(v) {
    return (typeof Utils !== 'undefined' && Utils.escapeHtml)
      ? Utils.escapeHtml(String(v))
      : String(v);
  },

  _formatValue(field, value) {
    if (value === undefined || value === null) return '';
    switch (field.transform) {
      case 'beepDb': return `${RadioSettings.beepVolumeToDb(value)} dB`;
      case 'timeoutBeep': return value === 0 ? 'Off' : `${value * 5} s`;
      case 'voxTail': return value <= 1 ? 'Off' : `${((value - 1) * 0.5).toFixed(1)} s`;
      case 'apo': return value === 0 ? 'Off' : `${value * 30} min`;
      case 'timezone': {
        const m = Number(value);
        const sign = m < 0 ? '-' : '+';
        const abs = Math.abs(m);
        return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
      }
      default:
        return `${value}${field.suffix ? ' ' + field.suffix : ''}`;
    }
  },

  /**
   * Render the offline preferences editor from RadioSettings.FIELD_META.
   */
  renderEditor() {
    const form = document.getElementById('radioSettingsForm');
    if (!form) return;

    if (typeof RadioSettings === 'undefined') {
      form.innerHTML = '<p class="form-help">Preferences engine not loaded.</p>';
      return;
    }

    // Do NOT materialise defaults onto the codeplug just by viewing the page;
    // that would make a later codeplug write push defaults over the radio's
    // real preferences. They are only materialised once the user reads or edits.
    const loaded = !!(window.codeplug && window.codeplug.settings);
    const platformKey = this._platform();
    const settings = loaded ? window.codeplug.settings : RadioSettings.defaults(platformKey);
    this._current = settings;
    const platformLabel = (RadioSettings.PLATFORMS[platformKey] || {}).label || platformKey;
    const platformMagic = (RadioSettings.PLATFORMS[platformKey] || {}).magic;
    if (loaded) {
      const magic = window.codeplug.settings.magic >>> 0;
      const differs = magic !== platformMagic;
      const implausible = window.codeplug.settings.implausible || [];
      const dim = (Number(settings.brightnessDay) === 0 || Number(settings.brightnessNight) === 0)
        ? ' Warning: a display brightness of 0% can leave the screen dark.'
        : '';
      const bad = implausible.length
        ? ` Warning: values look inconsistent with this firmware (${implausible.join(', ')}). The layout may differ for this model, so writing is disabled.`
        : '';
      this._status(
        `Loaded for ${platformLabel}. Settings version 0x${magic.toString(16)}` +
        (differs ? ` (differs from this firmware's 0x${(platformMagic >>> 0).toString(16)} - double-check values before writing)` : '') +
        '.' + dim + bad
      );
    } else {
      this._status(`Not loaded from a radio. Showing defaults for ${platformLabel}. Read or edit to include them in a write.`);
    }

    // Group fields and flags by section, preserving declaration order.
    const groups = [];
    const fieldsByGroup = {};
    for (const field of RadioSettings.FIELD_META) {
      if (!fieldsByGroup[field.group]) {
        fieldsByGroup[field.group] = [];
        groups.push(field.group);
      }
      fieldsByGroup[field.group].push(field);
    }
    const flagsByGroup = {};
    for (const flag of RadioSettings.FLAGS) {
      if (!(flag.key in (settings.flags || {}))) continue;
      if (!flagsByGroup[flag.group]) {
        flagsByGroup[flag.group] = [];
        if (!groups.includes(flag.group)) groups.push(flag.group);
      }
      flagsByGroup[flag.group].push(flag);
    }

    let html = '';
    for (const group of groups) {
      const fields = fieldsByGroup[group] || [];
      const flags = flagsByGroup[group] || [];
      if (!fields.length && !flags.length) continue;
      html += `<h3 class="section-subheader" style="padding-left:0;">${this._escape(group)}</h3>`;
      html += '<div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0.75rem 1.25rem;">';
      for (const field of fields) {
        html += this._renderField(field);
      }
      for (const flag of flags) {
        html += this._renderFlag(flag, settings);
      }
      html += '</div>';
    }

    html += `
      <div class="form-row" style="margin-top:1.25rem;gap:0.5rem;">
        <button class="btn btn-secondary" id="radioSettingsDefaultsBtn">
          <i class="mdi mdi-restore"></i> Reset to Defaults
        </button>
      </div>`;

    form.innerHTML = html;
    this._bindEditor(settings);
    this._bindActionButtons();
  },

  _renderFlag(flag, settings) {
    const id = `rsflag_${flag.key}`;
    return `
      <div style="margin-bottom:0.25rem;">
        <label class="form-label" style="display:flex;align-items:center;gap:0.5rem;">
          <input type="checkbox" id="${id}" data-flag="${flag.key}" ${settings.flags[flag.key] ? 'checked' : ''}>
          ${this._escape(flag.label)}
        </label>
        ${flag.desc ? `<div class="form-help" style="margin-left:1.5rem;">${this._escape(flag.desc)}</div>` : ''}
      </div>`;
  },

  _renderField(field) {
    const value = this._current ? this._current[field.key] : undefined;
    const id = `rs_${field.key}`;

    if (field.kind === 'bool') {
      return `
        <div class="form-group" style="margin-bottom:0.25rem;">
          <label class="form-label" style="display:flex;align-items:center;gap:0.5rem;">
            <input type="checkbox" id="${id}" data-field="${field.key}" ${value ? 'checked' : ''}>
            ${this._escape(field.label)}
          </label>
        </div>`;
    }

    if (field.kind === 'select') {
      const opts = (field.options || []).map((label, i) =>
        `<option value="${i}" ${Number(value) === i ? 'selected' : ''}>${this._escape(label)}</option>`).join('');
      return `
        <div class="form-group" style="margin-bottom:0.25rem;">
          <label class="form-label" for="${id}">${this._escape(field.label)}</label>
          <select class="form-input" id="${id}" data-field="${field.key}">${opts}</select>
        </div>`;
    }

    // range / number
    const min = field.min !== undefined ? field.min : 0;
    const max = field.max !== undefined ? field.max : 255;
    const step = field.step || 1;
    const display = this._formatValue(field, value);
    return `
      <div class="form-group" style="margin-bottom:0.25rem;">
        <label class="form-label" for="${id}">
          ${this._escape(field.label)}
          <span class="rs-value" id="${id}_val" style="float:right;color:var(--text-muted);font-weight:400;">${this._escape(display)}</span>
        </label>
        <input type="range" id="${id}" data-field="${field.key}" min="${min}" max="${max}" step="${step}" value="${Number(value) || 0}" style="width:100%;">
      </div>`;
  },

  _bindEditor(settings) {
    const form = document.getElementById('radioSettingsForm');
    if (!form) return;

    const markModified = () => {
      if (window.codeplug) {
        window.codeplug.settings = settings;
        window.codeplug.modified = true;
      }
    };

    form.querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      const field = RadioSettings.FIELD_META.find(f => f.key === key) ||
        RadioSettings.FIELD_META.find(f => f.composite === key);
      const handler = () => {
        if (el.type === 'checkbox') {
          settings[key] = el.checked;
        } else {
          settings[key] = Number(el.value);
        }
        const valEl = document.getElementById(`rs_${key}_val`);
        if (valEl && field) valEl.textContent = this._formatValue(field, settings[key]);
        markModified();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    form.querySelectorAll('[data-flag]').forEach(el => {
      el.addEventListener('change', () => {
        settings.flags[el.dataset.flag] = el.checked;
        markModified();
      });
    });

    const defaultsBtn = document.getElementById('radioSettingsDefaultsBtn');
    if (defaultsBtn) {
      defaultsBtn.addEventListener('click', () => {
        if (window.codeplug) {
          window.codeplug.settings = RadioSettings.defaults(this._platform());
          // Preserve the shift detected on the last read (e.g. MD-UV380 Plus 10W).
          window.codeplug.settings.offsetShift = window.codeplug.settingsShift || 0;
          window.codeplug.settingsRaw = null;
          window.codeplug.settingsBaseline = null;
          window.codeplug.modified = true;
        }
        this.renderEditor();
        Utils.toast('Preferences reset to firmware defaults', 'info');
      });
    }
  },

  _bindActionButtons() {
    const readBtn = document.getElementById('readRadioSettingsBtn');
    if (readBtn && !readBtn._rsBound) {
      readBtn._rsBound = true;
      readBtn.addEventListener('click', () => this.readFromRadio());
    }
    const writeBtn = document.getElementById('writeRadioSettingsBtn');
    if (writeBtn && !writeBtn._rsBound) {
      writeBtn._rsBound = true;
      writeBtn.addEventListener('click', () => this.writeToRadio());
    }
  },

  async readFromRadio() {
    if (!window.radioUSB || !window.radioUSB.connected) {
      Utils.toast('No radio connected', 'warning');
      return;
    }
    this._status('Reading preferences...');
    this._setButtonsEnabled(false);
    try {
      const raw = await window.radioUSB.readSettings();
      window.codeplug.setSettingsRaw(raw);
      if (!window.codeplug.settings) {
        throw new Error('Radio returned no valid preferences block');
      }
      window.codeplug.modified = true;
      this.renderEditor();
      Utils.toast('Radio preferences read', 'success');
    } catch (e) {
      this._status('Read failed: ' + e.message, true);
      Utils.toast('Read preferences failed: ' + e.message, 'error');
    } finally {
      this._setButtonsEnabled(true);
    }
  },

  writeToRadio() {
    if (!window.radioUSB || !window.radioUSB.connected) {
      Utils.toast('No radio connected', 'warning');
      return;
    }
    if (!window.codeplug.settings) {
      Utils.toast('No preferences loaded or edited - read from the radio or change a value first', 'warning');
      return;
    }
    const implausible = window.codeplug.settings.implausible || [];
    if (implausible.length) {
      Utils.toast(`Preferences layout not recognised (${implausible.join(', ')}) - refusing to write`, 'error');
      this._status(`Refusing to write: decoded values are out of range (${implausible.join(', ')}).`, true);
      return;
    }
    const bytes = window.codeplug.encodeSettings();
    if (!bytes) {
      Utils.toast('No preferences loaded', 'warning');
      return;
    }

    // Show exactly which preferences will change, so an unexpected change is
    // visible before it is written to the radio.
    const changed = this._changedFields();
    const changedHtml = changed.length
      ? `<ul style="margin:0.25rem 0 0 1.1rem;">${changed.map(c => `<li>${this._escape(c)}</li>`).join('')}</ul>`
      : `<p class="form-help">No values have been changed since the last read.</p>`;

    // Warn about flags that can stop the radio booting/connecting normally.
    const baselineFlags = (window.codeplug.settingsBaseline && window.codeplug.settingsBaseline.flags) || {};
    const dangerFlags = RadioSettings.FLAGS.filter(f => f.danger &&
      window.codeplug.settings.flags[f.key] && !baselineFlags[f.key]);
    const dangerHtml = dangerFlags.length
      ? `<p style="color:var(--danger);font-weight:600;">Warning: ${dangerFlags.map(f => this._escape(f.label)).join(', ')} will stop the radio starting normally until it is cleared (recovery: hold the documented button combination at power-on, or factory reset).</p>`
      : '';

    UI.showModal('Write Radio Preferences', `
      <p>Write the current preferences to the radio?</p>
      ${dangerHtml}
      ${changedHtml}
      <p class="form-help">The radio will reboot afterwards. Codeplug channels and calibration are not affected.</p>
    `, {
      confirmText: 'Write',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        UI.hideModal();
        this._status('Writing preferences...');
        this._setButtonsEnabled(false);
        try {
          await window.radioUSB.writeSettingsRaw(bytes);
          Utils.toast('Radio preferences written', 'success');
          this._status('Preferences written. Radio rebooting.');
        } catch (e) {
          this._status('Write failed: ' + e.message, true);
          Utils.toast('Write preferences failed: ' + e.message, 'error');
        } finally {
          this._setButtonsEnabled(true);
        }
      }
    });
  },

  /**
   * Human-readable list of the preference fields that differ from the read
   * snapshot. Composites (beeps/timezone) and flags are included.
   */
  _changedFields() {
    const settings = this._current || (window.codeplug && window.codeplug.settings);
    const baseline = window.codeplug && window.codeplug.settingsBaseline;
    if (!settings || !baseline) return [];
    const out = [];
    for (const field of RadioSettings.FIELD_META) {
      if (field.composite) continue;
      if (baseline[field.key] === undefined) continue;
      if (Number(baseline[field.key]) !== Number(settings[field.key])) {
        out.push(`${field.label}: ${baseline[field.key]} → ${settings[field.key]}`);
      }
    }
    for (const key of ['txBeep', 'rxBeep', 'rxTalkerBegin', 'timezoneOffsetMinutes', 'timezoneIsUtc']) {
      if (baseline[key] === undefined) continue;
      if (String(baseline[key]) !== String(settings[key])) out.push(`${key}: ${baseline[key]} → ${settings[key]}`);
    }
    const bf = baseline.flags || {};
    for (const flag of RadioSettings.FLAGS) {
      if (bf[flag.key] === undefined || settings.flags[flag.key] === undefined) continue;
      if (!!bf[flag.key] !== !!settings.flags[flag.key]) {
        out.push(`${flag.label}: ${bf[flag.key] ? 'on' : 'off'} → ${settings.flags[flag.key] ? 'on' : 'off'}`);
      }
    }
    return out;
  },

  _setButtonsEnabled(enabled) {
    const implausible = (window.codeplug && window.codeplug.settings &&
      window.codeplug.settings.implausible) || [];
    for (const id of ['readRadioSettingsBtn', 'writeRadioSettingsBtn', 'cloneReadBtn', 'cloneWriteBtn']) {
      const el = document.getElementById(id);
      if (!el) continue;
      // Preferences write is blocked for an unrecognised layout, so disable the
      // button rather than letting a click reach the refusal.
      const blocked = id === 'writeRadioSettingsBtn' && implausible.length > 0;
      el.disabled = !enabled || blocked;
    }
  },

  // -------------------------------------------------------------------------
  // Clone flow
  // -------------------------------------------------------------------------

  _bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  },

  /**
   * Theme to write for a clone: the raw theme captured from a source radio if
   * present, otherwise the theme selected/edited in the Theme Editor when it
   * differs from the default. Returns {day, night, source} or null.
   */
  _resolveCloneTheme() {
    const cp = window.codeplug;
    if (!cp) return null;
    if (cp.radioTheme && (cp.radioTheme.day || cp.radioTheme.night)) {
      return {
        day: cp.radioTheme.day ? Uint8Array.from(cp.radioTheme.day) : null,
        night: cp.radioTheme.night ? Uint8Array.from(cp.radioTheme.night) : null,
        source: 'radio'
      };
    }
    if (typeof Theme !== 'undefined' && (cp.themeDay || cp.themeNight)) {
      const def = Theme.serializeGTM(Theme.applyDefaults({}));
      const day = cp.themeDay ? Theme.serializeGTM(cp.themeDay) : null;
      const night = cp.themeNight ? Theme.serializeGTM(cp.themeNight) : null;
      const dayCustom = day && !this._bytesEqual(day, def);
      const nightCustom = night && !this._bytesEqual(night, def);
      if (dayCustom || nightCustom) {
        return { day: dayCustom ? day : null, night: nightCustom ? night : null, source: 'codeplug' };
      }
    }
    return null;
  },

  renderClone() {
    const callsignEl = document.getElementById('cloneCallsign');
    const dmrIdEl = document.getElementById('cloneDmrId');
    if (window.codeplug && window.codeplug.general) {
      if (callsignEl && !callsignEl.value) callsignEl.value = window.codeplug.general.callsign || '';
      if (dmrIdEl && !dmrIdEl.value && window.codeplug.general.dmrId) dmrIdEl.value = window.codeplug.general.dmrId;
    }

    const readBtn = document.getElementById('cloneReadBtn');
    if (readBtn && !readBtn._cloneBound) {
      readBtn._cloneBound = true;
      readBtn.addEventListener('click', () => this.cloneRead());
    }
    const writeBtn = document.getElementById('cloneWriteBtn');
    if (writeBtn && !writeBtn._cloneBound) {
      writeBtn._cloneBound = true;
      writeBtn.addEventListener('click', () => this.cloneWrite());
    }
    ['clonePreferences', 'cloneTheme', 'cloneBoot', 'cloneCallsign', 'cloneDmrId'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._cloneChangedBound) {
        el._cloneChangedBound = true;
        el.addEventListener('change', () => this._renderClonePreview());
        el.addEventListener('input', () => this._renderClonePreview());
      }
    });

    this._renderClonePreview();
  },

  _cloneStatus(msg, isError) {
    const el = document.getElementById('cloneStatus');
    if (el) {
      el.textContent = msg || '';
      el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
    }
  },

  /**
   * Preview of everything the clone will copy, shown after reading the source.
   */
  _renderClonePreview() {
    const el = document.getElementById('clonePreview');
    if (!el) return;
    const cp = window.codeplug;
    if (!cp || !cp.channels.length) {
      el.innerHTML = `<div style="border:1px dashed var(--border-color);border-radius:8px;padding:0.75rem 1rem;color:var(--text-muted);font-size:0.85rem;">
        No codeplug loaded. Open a codeplug file, load one from your cloud library, or click
        <em>Read Source</em> to capture a radio.</div>`;
      el.style.display = 'block';
      return;
    }

    const wantPrefs = !!(document.getElementById('clonePreferences') || {}).checked;
    const wantTheme = !!(document.getElementById('cloneTheme') || {}).checked;
    const wantBoot = !!(document.getElementById('cloneBoot') || {}).checked;
    const callsign = (document.getElementById('cloneCallsign') || {}).value || '';
    const dmrId = (document.getElementById('cloneDmrId') || {}).value || '';

    // Where the codeplug data came from (all sources work for cloning).
    let source = 'current codeplug in this app';
    if (cp._serverId) source = `cloud library (${cp._serverDesc || cp._serverId})`;
    else if (cp.filename && !/^radio_codeplug/i.test(cp.filename)) source = `file: ${cp.filename}`;
    else if (cp.filename) source = 'read from a radio';

    const row = (label, value, copied = true) =>
      `<tr><td style="padding:0.2rem 1rem 0.2rem 0;color:var(--text-muted);white-space:nowrap;">${this._escape(label)}</td>` +
      `<td style="padding:0.2rem 0;${copied ? '' : 'color:var(--text-muted);'}">${this._escape(String(value))}</td></tr>`;

    let html = `<div style="border:1px solid var(--border-color);border-radius:8px;padding:0.75rem 1rem;">`;
    html += `<div style="font-weight:600;margin-bottom:0.5rem;">Data to write to this radio</div><table style="font-size:0.85rem;">`;
    html += row('Source', source);
    html += row('Channels', cp.channels.length);
    html += row('Zones', cp.zones.length);
    html += row('Contacts', cp.contacts.length);
    html += row('TG lists', cp.tgLists.length);
    html += row('Scan lists', cp.scanLists.length);
    html += row('DTMF contacts', cp.dtmf.length);
    html += row('APRS configs', cp.aprs.length);
    html += row('Satellites', cp.satellites.length);
    html += row('Callsign', callsign || '(unchanged)');
    html += row('DMR ID', dmrId || '(unchanged)');

    if (wantPrefs) {
      if (!cp.settings) {
        html += row('Preferences', 'not loaded - click Read Source to capture them');
      } else {
        const changed = this._changedFields();
        html += row('Preferences', changed.length ? `${changed.length} changed: ${changed.join('; ')}` : 'loaded (unchanged)');
      }
    } else {
      html += row('Preferences', 'not copied', false);
    }

    if (wantTheme) {
      const t = this._resolveCloneTheme();
      if (!t) {
        html += row('Theme', 'none - read a source or pick one in the Theme Editor');
      } else {
        const parts = [];
        if (t.day) parts.push('day');
        if (t.night) parts.push('night');
        html += row('Theme', `${parts.join(' + ')} (${t.source === 'radio' ? 'from source radio' : 'from codeplug'})`);
      }
    } else {
      html += row('Theme', 'not copied', false);
    }

    if (wantBoot) {
      const b = cp.radioBoot;
      if (!b || (!b.image && !b.melody)) {
        html += row('Boot screen', 'not loaded - click Read Source to capture it');
      } else {
        const parts = [];
        if (b.image) parts.push('image');
        if (b.melody) parts.push('melody');
        html += row('Boot screen', parts.join(' + '));
      }
    } else {
      html += row('Boot screen', 'not copied', false);
    }

    html += `</table><div class="form-help" style="margin-top:0.5rem;">Change the callsign/DMR ID and click Write for each radio.</div></div>`;
    el.innerHTML = html;
    el.style.display = 'block';
  },

  async cloneRead() {
    if (!window.radioUSB || !window.radioUSB.connected) {
      Utils.toast('Connect the source radio first', 'warning');
      return;
    }
    if (window.radioUSB.isInDFUMode) {
      this._cloneStatus('The radio is in firmware update (DFU) mode. Reconnect it in normal mode to clone.', true);
      return;
    }
    const wantPrefs = !!(document.getElementById('clonePreferences') || {}).checked;
    const wantTheme = !!(document.getElementById('cloneTheme') || {}).checked;
    const wantBoot = !!(document.getElementById('cloneBoot') || {}).checked;
    const parts = ['codeplug'];
    if (wantPrefs) parts.push('preferences');
    if (wantTheme) parts.push('theme');
    if (wantBoot) parts.push('boot screen');
    this._cloneStatus(`Reading source radio (${parts.join(' + ')})...`);
    this._setButtonsEnabled(false);
    try {
      await App.readFromRadio();
      if (!window.codeplug.channels.length) {
        this._cloneStatus('Read failed or no codeplug returned by the radio.', true);
        return;
      }

      if (wantPrefs) {
        this._cloneStatus('Reading source preferences...');
        const raw = await window.radioUSB.readSettings();
        window.codeplug.setSettingsRaw(raw);
      }

      if (wantTheme) {
        this._cloneStatus('Reading source theme...');
        const t = await window.radioUSB.readTheme();
        window.codeplug.radioTheme = {
          day: (t && t.dayTheme) ? Array.from(t.dayTheme) : null,
          night: (t && t.nightTheme) ? Array.from(t.nightTheme) : null
        };
      } else {
        window.codeplug.radioTheme = null;
      }

      if (wantBoot) {
        this._cloneStatus('Reading source boot screen...');
        const blocks = await window.radioUSB.readCustomDataBlocks([1, 2]); // boot image + melody
        window.codeplug.radioBoot = {
          image: (blocks && blocks[1]) ? Array.from(blocks[1].slice(0, 1024)) : null,
          melody: (blocks && blocks[2]) ? Array.from(blocks[2].slice(0, 512)) : null
        };
      } else {
        window.codeplug.radioBoot = null;
      }

      const callsignEl = document.getElementById('cloneCallsign');
      const dmrIdEl = document.getElementById('cloneDmrId');
      if (callsignEl) callsignEl.value = window.codeplug.general.callsign || '';
      if (dmrIdEl) dmrIdEl.value = window.codeplug.general.dmrId || '';

      const notes = [];
      if (wantPrefs && !window.codeplug.settings) notes.push('no usable preferences returned');
      if (wantTheme && !window.codeplug.radioTheme) notes.push('no theme returned');
      if (wantBoot && !window.codeplug.radioBoot) notes.push('no boot screen returned');
      this._cloneStatus(notes.length
        ? `Source read (${notes.join('; ')}). Set the target callsign/DMR ID, then Write Target.`
        : 'Source read. Review the data below, set the target callsign/DMR ID, then Write Target.');
      this._renderClonePreview();
    } catch (e) {
      this._cloneStatus('Read failed: ' + e.message, true);
    } finally {
      this._setButtonsEnabled(true);
    }
  },

  async cloneWrite() {
    if (!window.radioUSB || !window.radioUSB.connected) {
      Utils.toast('Connect the target radio first', 'warning');
      return;
    }
    if (window.radioUSB.isInDFUMode) {
      Utils.toast('The radio is in firmware update (DFU) mode. Reconnect it in normal mode to clone.', 'warning');
      return;
    }
    if (!window.codeplug.channels.length) {
      Utils.toast('Load a codeplug or read a source radio first', 'warning');
      return;
    }

    const callsignEl = document.getElementById('cloneCallsign');
    const dmrIdEl = document.getElementById('cloneDmrId');
    const callsign = (callsignEl ? callsignEl.value : '').trim().toUpperCase();
    const dmrIdRaw = (dmrIdEl ? dmrIdEl.value : '').trim();

    if (callsign && !/^[A-Z0-9/]{1,8}$/.test(callsign)) {
      this._cloneStatus('Callsign must be 1-8 alphanumeric characters (A-Z, 0-9, /).', true);
      return;
    }
    let dmrId = null;
    if (dmrIdRaw) {
      dmrId = parseInt(dmrIdRaw, 10);
      if (!Number.isFinite(dmrId) || dmrId < 0 || dmrId > 16777215) {
        this._cloneStatus('DMR ID must be a number between 0 and 16777215.', true);
        return;
      }
    }

    const wantPrefs = !!(document.getElementById('clonePreferences') || {}).checked;
    const wantTheme = !!(document.getElementById('cloneTheme') || {}).checked;
    const wantBoot = !!(document.getElementById('cloneBoot') || {}).checked;
    let settingsBytes = null;
    if (wantPrefs) {
      if (!window.codeplug.settings) {
        this._cloneStatus('No source preferences loaded. Tick the box and click Read Source again.', true);
        return;
      }
      // Mirror the standalone preferences write guard: never encode a layout the
      // decoder could not recognise, or the target gets garbage settings.
      const implausible = window.codeplug.settings.implausible || [];
      if (implausible.length) {
        this._cloneStatus(`Refusing to clone preferences: layout not recognised (${implausible.join(', ')}). Untick "Preferences" or update the CPS.`, true);
        return;
      }
      settingsBytes = window.codeplug.encodeSettings();
    }
    // Theme: from a source radio read, or from the theme selected in the Theme Editor.
    const theme = wantTheme ? this._resolveCloneTheme() : null;
    if (wantTheme && !theme) {
      this._cloneStatus('No theme available. Read a source radio or select a theme in the Theme Editor.', true);
      return;
    }
    const boot = wantBoot ? window.codeplug.radioBoot : null;
    if (wantBoot && (!boot || (!boot.image && !boot.melody))) {
      this._cloneStatus('No boot screen loaded. Tick the box and click Read Source again.', true);
      return;
    }

    // Apply the target identity to the in-memory codeplug.
    if (callsign) window.codeplug.general.callsign = callsign;
    if (dmrId !== null) window.codeplug.general.dmrId = dmrId;
    window.codeplug.modified = true;

    const bootParts = boot ? [boot.image ? 'image' : null, boot.melody ? 'melody' : null].filter(Boolean).join(' + ') : '';
    UI.showModal('Clone to Target Radio', `
      <p>Write the selected data to the target radio?</p>
      <ul>
        <li>${window.codeplug.channels.length} channels, ${window.codeplug.contacts.length} contacts, ${window.codeplug.zones.length} zones</li>
        <li>Callsign: <strong>${callsign || '(unchanged)'}</strong></li>
        <li>DMR ID: <strong>${dmrId !== null ? dmrId : '(unchanged)'}</strong></li>
        <li>Preferences: <strong>${wantPrefs ? 'included' : 'not copied'}</strong></li>
        <li>Theme: <strong>${wantTheme ? `included (${theme.source === 'radio' ? 'from source radio' : 'from codeplug'})` : 'not copied'}</strong></li>
        <li>Boot screen: <strong>${wantBoot ? `included (${bootParts})` : 'not copied'}</strong></li>
      </ul>
      <p>The radio reboots when finished.</p>
    `, {
      confirmText: 'Clone',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        UI.hideModal();
        this._cloneStatus(`Writing target radio${wantPrefs ? ' (codeplug + preferences)' : ' (codeplug)'}...`);
        this._setButtonsEnabled(false);
        try {
          const ok = await App._doCodeplugWrite(settingsBytes);
          if (!ok) {
            this._cloneStatus('Clone write failed.', true);
            return;
          }

          if (wantTheme && theme) {
            this._cloneStatus('Waiting for the target radio to restart to write the theme...');
            if (!await this._waitForRadio(20000)) {
              this._cloneStatus('Codeplug written, but the radio did not reconnect to write the theme. Reconnect and use the Theme Editor.', true);
              return;
            }
            await window.radioUSB.writeTheme(theme.day, theme.night);
          }

          if (wantBoot && boot) {
            if (boot.image && boot.image.length === 1024) {
              this._cloneStatus('Writing boot image...');
              if (await this._waitForRadio(20000)) {
                await window.radioUSB.writeBootImage(Uint8Array.from(boot.image));
              }
            }
            if (boot.melody) {
              this._cloneStatus('Writing boot melody...');
              if (await this._waitForRadio(20000)) {
                const melody = new Uint8Array(512);
                melody.set(boot.melody.slice(0, 512));
                await window.radioUSB.writeBootMelody(melody);
              }
            }
          }

          this._cloneStatus(`Clone complete${wantPrefs ? ' including preferences' : ''}${wantTheme ? ' including theme' : ''}${wantBoot ? ' including boot screen' : ''}.`);
          Utils.toast('Radio cloned successfully', 'success');
        } catch (e) {
          this._cloneStatus('Write failed: ' + e.message, true);
        } finally {
          this._setButtonsEnabled(true);
        }
      }
    });
  },

  /**
   * Wait for the radio to finish a reboot and come back.
   *
   * Writes that end with a "reboot" command (codeplug, preferences, theme,
   * boot screen) return before the USB stack has actually dropped, so
   * `radioUSB.connected` is still true for a moment. Returning on that alone
   * reports "already reconnected" and lets the next operation race the reboot
   * (the theme write then dies mid-read with "Not connected to radio").
   * Wait for the disconnect first, then for the reconnection.
   */
  async _waitForRadio(timeoutMs = 15000) {
    const usb = window.radioUSB;
    if (!usb) return false;
    const start = Date.now();
    const disconnectCount = usb._disconnectCount || 0;

    // Give a pending reboot time to drop the USB link. A radio that does not
    // reboot stays connected and falls through after the grace period.
    const settleMs = 3000;
    while (usb.connected &&
           (usb._disconnectCount || 0) === disconnectCount &&
           Date.now() - start < settleMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for it to come back.
    while (Date.now() - start < timeoutMs) {
      if (usb.connected) return true;
      if (typeof usb.tryReconnect === 'function') {
        try { if (await usb.tryReconnect()) return true; } catch (e) { /* keep waiting */ }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return !!usb.connected;
  }
};

window.RadioSettingsUI = RadioSettingsUI;
