/**
 * OpenGD77 CPS Web - Baofeng DM-32 / UV008 (C7000) flash tools
 *
 * Two independent operations are supported:
 *
 *  1. Firmware flashing via the Baofeng bootloader.
 *     The radio must be in firmware update mode: hold PTT + SK1 while powering on.
 *     Protocol reverse engineered in DM32_firmware_loader.py (M7OCM).
 *
 *  2. Full SPI flash backup / restore via the C7000 boot-ROM microcode upload.
 *     The radio must be OFF; the user powers it on while the tool waits.
 *     Protocol reverse engineered in C7000_read/write_progmem/Q128.py (VK3KYY / andynvkz).
 *
 *     The radio has two SPI flash chips:
 *       - GD25Q08  (1 MB)  program memory (firmware)
 *       - GD25Q128 (16 MB) data flash
 *
 * The 'link' object passed to each method provides raw serial access:
 *   link.write(Uint8Array)              -> Promise
 *   link.read(count, timeoutMs)         -> Promise<Uint8Array>
 *   link.waitFor(pattern, timeoutMs)    -> Promise
 *   link.drain()                        -> Promise
 */
const DM32Flash = {
  // Baofeng bootloader firmware block
  BLOCK_SIZE: 0x400,

  // C7000 boot-ROM microcode upload
  MICROCODE_ADDR: 0x010000,
  MICROCODE_BLOCK: 0x100,

  // C7000 flash access block
  C7000_BLOCK: 0x100,

  // Chip identifiers
  CHIP_PROGMEM: 'progmem',  // GD25Q08  1 MB  program memory
  CHIP_Q128: 'q128',        // GD25Q128 16 MB data flash

  PROGMEM_SIZE: 0x100000,   // 1 MB
  Q128_SIZE: 0x1000000,     // 16 MB

  _microcode: null,

  /** Decode the embedded microcode blob (done once). */
  getMicrocode() {
    if (!this._microcode) {
      const hex = DM32_MICROCODE_HEX;
      const out = new Uint8Array(hex.length >> 1);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.substr(i << 1, 2), 16);
      }
      this._microcode = out;
    }
    return this._microcode;
  },

  /** CRC-16/XMODEM (poly 0x1021, init 0x0000). */
  crc16xmodem(bytes) {
    let crc = 0x0000;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= (bytes[i] << 8);
      for (let b = 0; b < 8; b++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc & 0xFFFF;
  },

  /** Compare a received buffer against an expected byte array or ASCII string. */
  _check(actual, expected, label) {
    if (typeof expected === 'string') {
      let s = '';
      for (let i = 0; i < expected.length; i++) {
        s += String.fromCharCode(actual[i] || 0);
      }
      if (s !== expected) {
        throw new Error(`${label}: expected "${expected}", got "${s}"`);
      }
      return;
    }
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        const got = Array.from(actual || []).map(b => b.toString(16).padStart(2, '0')).join(' ');
        throw new Error(`${label}: unexpected response [${got || 'no data'}]`);
      }
    }
  },

  /** Build a C7000 frame: 02 <cmd> <checksum> 03 <payload...>. */
  _frame(cmd, payload) {
    let ck = 0;
    for (let i = 0; i < payload.length; i++) ck += payload[i];
    const frame = new Uint8Array(4 + payload.length);
    frame[0] = 0x02;
    frame[1] = cmd;
    frame[2] = ck & 0xFF;
    frame[3] = 0x03;
    frame.set(payload, 4);
    return frame;
  },

  /** Big-endian 4-byte address. */
  _addr4(addr) {
    return new Uint8Array([
      (addr >>> 24) & 0xFF,
      (addr >>> 16) & 0xFF,
      (addr >>> 8) & 0xFF,
      addr & 0xFF
    ]);
  },

  // ========================================================================
  // 1. Firmware flashing (Baofeng bootloader)
  // ========================================================================

  /**
   * Flash a firmware image via the Baofeng bootloader.
   *
   * @param {Object} link - raw serial link
   * @param {Uint8Array} firmwareData - firmware image (.bin)
   * @param {Function} onProgress - (percent, message)
   */
  async flashFirmware(link, firmwareData, onProgress, options = {}) {
    const data = firmwareData instanceof Uint8Array ? firmwareData : new Uint8Array(firmwareData);
    if (!data.length) {
      throw new Error('Firmware file is empty');
    }
    const force = !!(options && options.force);
    const dbg = (m) => { if (link.debug) link.debug(m); };
    // In force mode the handshake replies are logged but not required, so a radio
    // with a different/older bootloader can still be flashed. The erase and the
    // per-block write/CRC checks below remain hard requirements.
    const softCheck = (actual, expected, label) => {
      try {
        this._check(actual, expected, label);
      } catch (e) {
        if (force) { dbg(`WARN (forced): ${e.message}`); }
        else { throw e; }
      }
    };

    onProgress && onProgress(0, 'Handshaking with bootloader...');
    dbg('Draining serial buffer');
    await link.drain();

    // Some USB-serial adapters reset the radio when the port opens and the
    // bootloader can miss the first byte, so give it a moment and retry the
    // initial 0x52 -> 0x06 handshake a few times.
    if (link.delay) await link.delay(400);
    let handshakeOk = false;
    for (let attempt = 1; attempt <= 6 && !handshakeOk; attempt++) {
      dbg(`Handshake 1/6: sending 0x52 (attempt ${attempt}/6)`);
      await link.write(new Uint8Array([0x52]));
      const resp = await link.read(1, 1000);
      if (resp.length === 1 && resp[0] === 0x06) { handshakeOk = true; break; }
      if (link.delay) await link.delay(200);
      await link.drain();
    }
    if (!handshakeOk) {
      if (force) {
        dbg('WARN (forced): no 0x06 reply to 0x52 - continuing anyway');
        onProgress && onProgress(0, 'Handshake failed - forcing flash...');
      } else {
        throw new Error('Bootloader handshake failed (no 0x06 reply to 0x52). Make sure the radio is in firmware update mode: hold PTT + SK1 while switching it on (green LED), then click Flash.');
      }
    } else {
      dbg('Handshake 1/6 OK');
    }

    dbg('Handshake 2/6: model request');
    await link.write(new Uint8Array([0x4D, 0x00, 0x00, 0x00, 0x01]));
    softCheck(await link.read(3, 2000), [0x4D, 0x01, 0x09], 'bootloader model');
    dbg('Handshake 2/6 OK');

    dbg('Handshake 3/6: version request');
    await link.write(new Uint8Array([0x06]));
    softCheck(await link.read(9, 2000), 'BFUV32-V2', 'bootloader version');
    dbg('Handshake 3/6 OK');

    dbg('Handshake 4/6: erase prepare');
    await link.write(new Uint8Array([0x45, 0x00, 0x00, 0x00, 0x00]));
    softCheck(await link.read(1, 2000), [0x06], 'bootloader erase-prep');
    dbg('Handshake 4/6 OK');

    dbg('Handshake 5/6: cmd 0x31');
    await link.write(new Uint8Array([0x31]));
    softCheck(await link.read(1, 2000), [0x43], 'bootloader cmd 0x31');
    dbg('Handshake 5/6 OK');

    dbg('Handshake 6/6: cmd 0x01');
    await link.write(new Uint8Array([0x01]));
    softCheck(await link.read(1, 2000), [0x43], 'bootloader cmd 0x01');
    dbg('Handshake complete');

    // Packaged official Baofeng firmware has a 0x100-byte header before the payload
    let payloadStart = 0;
    try {
      if (String.fromCharCode(...data.slice(0, 9)) === 'BFUV32-V2') {
        payloadStart = 0x100;
      }
    } catch (e) {
      payloadStart = 0;
    }
    const payload = data.slice(payloadStart);

    // Erase: send 00 FF, then "OpenDM32\0" + file size padded to 128 bytes, then CRC16.
    onProgress && onProgress(0, 'Erasing flash (this can take up to 15s)...');
    await link.write(new Uint8Array([0x00, 0xFF]));

    const details = new Uint8Array(128);
    const prefix = 'OpenDM32\u0000' + data.length;
    for (let i = 0; i < prefix.length && i < 128; i++) {
      details[i] = prefix.charCodeAt(i) & 0xFF;
    }
    await link.write(details);
    const detailsCrc = this.crc16xmodem(details);
    await link.write(new Uint8Array([(detailsCrc >> 8) & 0xFF, detailsCrc & 0xFF]));

    this._check(await link.read(2, 20000), [0x06, 0x43], 'erase complete');

    // Write firmware in 1 KB blocks
    const total = Math.ceil(payload.length / this.BLOCK_SIZE);
    let index = 1;
    for (let b = 0; b < total; b++) {
      const block = new Uint8Array(this.BLOCK_SIZE);
      block.set(payload.subarray(b * this.BLOCK_SIZE, (b + 1) * this.BLOCK_SIZE));

      await link.write(new Uint8Array([0x02]));
      this._check(await link.read(1, 2000), [0x43], 'write block ready');

      await link.write(new Uint8Array([index & 0xFF, (0xFF - index) & 0xFF]));
      await link.write(block);
      const crc = this.crc16xmodem(block);
      await link.write(new Uint8Array([(crc >> 8) & 0xFF, crc & 0xFF]));

      this._check(await link.read(1, 3000), [0x06], 'write block ack');

      index = (index + 1) & 0xFF;
      const pct = Math.round(((b + 1) / total) * 100);
      onProgress && onProgress(pct, `Writing firmware ${pct}%`);
    }

    // Reboot
    await link.write(new Uint8Array([0x04]));
    onProgress && onProgress(100, 'Firmware written - radio rebooting');
  },

  // ========================================================================
  // 2. C7000 SPI flash backup / restore
  // ========================================================================

  /**
   * Wait for the C7000 boot ROM, upload the access microcode and jump to it.
   * The radio must be OFF; the user powers it on during the wait.
   */
  async uploadMicrocode(link, onProgress, options = {}) {
    const dbg = (m) => { if (link.debug) link.debug(m); };
    const force = !!(options && options.force);
    onProgress && onProgress(0, 'Preparing radio...');

    await link.drain();
    onProgress && onProgress(0, 'Turn the radio OFF, then turn it ON to enter the boot ROM...');
    dbg('Waiting for the radio boot ROM - power the radio OFF then ON');

    // The boot ROM emits 02 24 00 03 as soon as it starts. Wait long enough
    // for the user to power-cycle the radio manually.
    const BOOT_ROM = new Uint8Array([0x02, 0x24, 0x00, 0x03]);
    try {
      // Forced attempts use a short wait instead of the full power-cycle window.
      await link.waitFor(BOOT_ROM, force ? 3000 : 60000);
    } catch (e) {
      if (force) {
        dbg('WARN (forced): boot ROM not detected - continuing anyway');
        onProgress && onProgress(0, 'Boot ROM not detected - forcing...');
      } else {
        throw new Error('Timed out waiting for the radio boot ROM. Turn the radio OFF, then turn it ON while this dialog is waiting.');
      }
    }
    dbg('Boot ROM step complete - sending 02 14 00 03');

    await link.write(new Uint8Array([0x02, 0x14, 0x00, 0x03]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    dbg('Uploading microcode');

    const micro = this.getMicrocode();
    const total = micro.length / this.MICROCODE_BLOCK;
    let addr = this.MICROCODE_ADDR;

    for (let i = 0; i < total; i++) {
      const chunk = micro.subarray(i * this.MICROCODE_BLOCK, (i + 1) * this.MICROCODE_BLOCK);
      const payload = new Uint8Array(8 + chunk.length);
      payload.set(this._addr4(addr), 0);
      // Length field: 0x40 words = 256 bytes
      payload[4] = 0x00; payload[5] = 0x00; payload[6] = 0x00; payload[7] = 0x40;
      payload.set(chunk, 8);

      await link.write(this._frame(0x18, payload));
      dbg(`Sent microcode block ${i + 1}/${total} (addr 0x${addr.toString(16)})`);
      await this._expectAck(link, 'microcode block');
      dbg(`Microcode block ${i + 1}/${total} acked`);

      addr += this.MICROCODE_BLOCK;
      const pct = Math.round(((i + 1) / total) * 20);
      onProgress && onProgress(pct, `Uploading microcode ${pct}%`);
    }
    dbg('Microcode uploaded - jumping');

    // Jump to the uploaded microcode
    await link.write(new Uint8Array([0x02, 0x1B, 0x7E, 0x03, 0x00, 0x01, 0x09, 0x74]));
    await this._expectAck(link, 'microcode jump');
    dbg('Microcode running');

    // Give the microcode time to start, then discard the boot ROM frames that
    // may still be arriving (02 24 00 03 / 00 10 00 03).
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (link.drain) await link.drain();
    dbg('Microcode settled');
  },

  /**
   * Wait for the C7000 02 05 00 03 ACK, skipping any other frames the boot ROM
   * may emit (e.g. the 00 10 00 03 init response that follows 02 14 00 03).
   */
  async _expectAck(link, label) {
    const ACK = new Uint8Array([0x02, 0x05, 0x00, 0x03]);
    if (link.readUntil) {
      const ok = await link.readUntil(ACK, 3000);
      if (!ok) {
        throw new Error(`${label}: no ACK from radio`);
      }
      return;
    }
    this._check(await link.read(4, 3000), ACK, label);
  },

  /**
   * Read a whole SPI flash chip.
   *
   * @param {Object} link
   * @param {string} chip - DM32Flash.CHIP_PROGMEM or CHIP_Q128
   * @param {Function} onProgress - (percent, message)
   * @returns {Promise<Uint8Array>}
   */
  async readFlash(link, chip, onProgress, options = {}) {
    await this.uploadMicrocode(link, onProgress, options);

    const size = (chip === this.CHIP_Q128) ? this.Q128_SIZE : this.PROGMEM_SIZE;
    const readCmd = (chip === this.CHIP_Q128) ? 0x15 : 0x17;
    const out = new Uint8Array(size);
    const total = size / this.C7000_BLOCK;

    for (let i = 0; i < total; i++) {
      const addr = i * this.C7000_BLOCK;
      await link.write(this._frame(readCmd, this._addr4(addr)));
      const resp = await link.read(4 + this.C7000_BLOCK, 3000);
      if (resp.length < 4 + this.C7000_BLOCK || resp[0] !== 0x02 || resp[1] !== 0x05) {
        const got = Array.from(resp).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' ');
        throw new Error(`Bad read response at 0x${addr.toString(16)}: [${got}]`);
      }
      out.set(resp.subarray(4, 4 + this.C7000_BLOCK), i * this.C7000_BLOCK);

      const pct = Math.round(((i + 1) / total) * 100);
      onProgress && onProgress(pct, `Reading flash ${pct}%`);
    }

    return out;
  },

  /**
   * Write a whole SPI flash chip.
   *
   * @param {Object} link
   * @param {string} chip - DM32Flash.CHIP_PROGMEM or CHIP_Q128
   * @param {Uint8Array} data - image to write
   * @param {Function} onProgress - (percent, message)
   */
  async writeFlash(link, chip, data, onProgress, options = {}) {
    const size = (chip === this.CHIP_Q128) ? this.Q128_SIZE : this.PROGMEM_SIZE;
    if (data.length > size) {
      throw new Error('Image is larger than the target flash chip');
    }

    await this.uploadMicrocode(link, onProgress, options);

    const writeCmd = (chip === this.CHIP_Q128) ? 0x16 : 0x18;
    const total = Math.ceil(data.length / this.C7000_BLOCK);

    for (let i = 0; i < total; i++) {
      const addr = i * this.C7000_BLOCK;
      const block = new Uint8Array(this.C7000_BLOCK);
      block.set(data.subarray(i * this.C7000_BLOCK, (i + 1) * this.C7000_BLOCK));

      const payload = new Uint8Array(4 + block.length);
      payload.set(this._addr4(addr), 0);
      payload.set(block, 4);

      await link.write(this._frame(writeCmd, payload));
      this._check(await link.read(4, 3000), [0x02, 0x05, 0x00, 0x03], 'write block');

      const pct = Math.round(((i + 1) / total) * 100);
      onProgress && onProgress(pct, `Writing flash ${pct}%`);
    }
  }
};
