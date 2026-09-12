/**
 * OpenGD77 CPS Web - WebUSB Communication
 * 
 * This module handles USB communication with OpenGD77 radios using WebUSB API.
 * Based on the protocol from the original OpenGD77 CPS.
 * Supports both MK22 (GD-77, DM-1801, RD-5R) and STM32 (TYT MD-UV380, MD-9600, etc.) radios.
 */

class OpenGD77USB {
  constructor() {
    this.device = null;
    this.connected = false;
    // USB interface and endpoint settings (may be updated during connect based on device)
    this.interfaceNumber = 0;
    this.endpointIn = 1;
    this.endpointOut = 1;
    
    // Track all claimed interfaces for proper cleanup
    this.claimedInterfaces = [];
    
    // Radio type - MK22 or STM32
    this.radioType = CONFIG.RADIO_TYPES.MK22;
    this.radioModel = '';
    
    // Track if device is in DFU mode (required for firmware flashing)
    // DFU mode is detected by VID:PID - STM32 DFU (0x0483:0xDF11) or MK22 bootloader (0x15A2:0x0073)
    this.isInDFUMode = false;
    
    // Communication mode - HID bootloader or CDC-ACM serial
    // HID mode requires header wrapper: [reportId, 0, lenLow, lenHigh, ...data]
    this.isHIDMode = false;

    // WebHID device reference (alternative to WebUSB for MK22 HID bootloader on Windows)
    // On Windows, the OS HID driver claims the MK22 DFU device, preventing it from
    // appearing in the WebUSB device picker. WebHID can access these devices directly.
    this.hidDevice = null;
    this.useWebHID = false;
    
    // Web Serial transport (Baofeng DM-32 / UV-32 and any USB-to-serial adapter).
    // The C7000-based radios speak the OpenGD77 serial protocol over a plain
    // serial port (PL2303, CH340, CP2102, FTDI, ...). Web Serial's requestPort()
    // is called unfiltered so the user can pick any adapter.
    this.serialPort = null;
    this.serialWriter = null;
    this.serialReader = null;
    this.isSerialMode = false;

    // Guards against overlapping serial operations (connect vs flash)
    this._busy = false;
    this._busyOp = null;

    // Serializes radio operations so two of them can never talk to the radio at
    // the same time (e.g. the connect-time radio-info read racing a theme write
    // or a boot-data read). Without this, responses interleave and the serial
    // buffer desyncs, leaving the CPS screen stuck until the page is reloaded.
    this._opChain = Promise.resolve();
    this._activeOp = null;
    // True when the user explicitly picked a radio type (respect it on detect).
    this._explicitRadioType = false;
    
    // Communication buffer
    this.commsBuffer = new Uint8Array(128 * 1024);
    
    // Progress callback
    this.onProgress = null;
    this.onStatusChange = null;
    
    // Protocol constants
    this.CMD_ACK = 0x41;
    this.CMD_PRG = new Uint8Array([0x02, 0x50, 0x52, 0x4F, 0x47, 0x52, 0x41]); // PROGRA
    this.CMD_PRG2 = new Uint8Array([0x4D, 0x02]);
    this.CMD_ENDR = new Uint8Array([0x45, 0x4E, 0x44, 0x52]); // ENDR
    this.CMD_ENDW = new Uint8Array([0x45, 0x4E, 0x44, 0x57]); // ENDW
    
    // DFU protocol constants (STM32)
    this.DFU_DETACH = 0x00;
    this.DFU_DNLOAD = 0x01;
    this.DFU_GETSTATUS = 0x03;
    this.DFU_MASS_ERASE = 0x41;
    
    // WebHID fallback report IDs to try if the discovered report ID fails
    // Common HID report IDs: 0 (no report ID), 1 (most common), 2
    this.HID_FALLBACK_REPORT_IDS = [0, 1, 2];
    
    // WebHID output report sizes by report ID (discovered from HID descriptor)
    // Map of reportId -> payload size in bytes (excluding report ID byte)
    this.hidOutputReportSizes = {};
    
    // WebHID discovered output report IDs (all report IDs found in HID descriptor)
    this.hidDiscoveredOutputReportIds = [];
    
    // CDC-ACM serial line coding (from OpenGD77 CPS decomp: OpenGD77Form.cs)
    // new SerialPort(text, 115200, Parity.None, 8, StopBits.One)
    this.CDC_BAUD_RATE = 115200;
    this.CDC_DATA_BITS = 8;
    this.CDC_STOP_BITS = 0;   // 0 = 1 stop bit (USB CDC encoding)
    this.CDC_PARITY = 0;      // 0 = None
    
    // CDC-ACM control interface number (tracked during connect for line coding)
    this.controlInterfaceNumber = null;
    
    // SGL file header size (OpenGD77 firmware container format)
    this.SGL_HEADER_SIZE = 256;
    
    // MK22 firmware write retry configuration
    // Transient WebHID events can be dropped; retrying the same packet is safe
    // because writing identical data to the same flash address is idempotent.
    this.MK22_WRITE_MAX_RETRIES = 3;
    this.MK22_WRITE_RETRY_DELAY_MS = 500;
    
    // Current data sector for STM32 flash writes
    this.dataSector = -1;
    
    // USB read/write buffer size - matches C# MAX_TRANSFER_SIZE = 32
    // The C# OpenGD77 CPS uses 32 bytes for all read/write operations
    // Some modern firmware may support larger buffers, but 32 is most compatible
    // Can be changed via setBufferSize(1024) for newer firmware
    this.usbBufferSize = 32;
    
    // Debug logging enabled for STM32 troubleshooting
    this.debugEnabled = true;
    
    // Cipher tables are loaded from external files for full size:
    // - MK22: mk22_cipher.js (32768 bytes) for GD-77, DM-1801, RD-5R
    // - STM32: stm32_ciphers.js (1024 bytes each) for MD9600, MDUV380, DM1701
    // 
    // We provide getters that use external ciphers when available

    // STM32 radio firmware output types
    this.OUTPUT_TYPE = {
      MD9600: 'MD9600',
      MDUV380: 'MDUV380',
      MD2017: 'MD2017',
      DM1701: 'DM1701'
    };

    // Listen for USB disconnect events to detect when radio reboots or is unplugged
    if (typeof navigator !== 'undefined' && navigator.usb) {
      navigator.usb.addEventListener('disconnect', (event) => {
        this.handleUSBDisconnect(event);
      });
    }

    // Listen for WebHID disconnect events (MK22 HID bootloader on Windows)
    if (typeof navigator !== 'undefined' && navigator.hid) {
      navigator.hid.addEventListener('disconnect', (event) => {
        this.handleHIDDisconnect(event);
      });
    }

    // Listen for Web Serial disconnect events (DM-32 / UV-008, USB-serial adapters)
    if (typeof navigator !== 'undefined' && navigator.serial && navigator.serial.addEventListener) {
      try {
        navigator.serial.addEventListener('disconnect', (event) => {
          this.handleSerialDisconnect(event);
        });
      } catch (e) { /* browser build without the serial disconnect event */ }
    }

    // Route the remaining radio operations through the same serialization gate
    // so nothing can interleave with an in-flight read/write (Phase 2 / T2).
    // These are instance-level wrappers around the prototype methods, so the
    // wrapped methods must not call each other (they do not).
    const serializedMethods = [
      'readDMRDatabase', 'writeDMRDatabase',
      'readSatelliteData', 'writeSatelliteTLEs',
      'writeCustomDataBlock',
      'readCalibration', 'writeCalibration',
      'readSecureRegisters', 'readScreenCapture',
      'writeFirmwareMK22', 'writeFirmwareSTM32DFU'
    ];
    for (const name of serializedMethods) {
      if (typeof this[name] !== 'function') continue;
      const original = this[name].bind(this);
      this[name] = (...args) => this._serialized(name, () => original(...args));
    }
  }

  /**
   * Handle USB disconnect event (e.g., radio reboot after firmware write)
   * @param {USBConnectionEvent} event - The disconnect event
   */
  handleUSBDisconnect(event) {
    // Check if the disconnected device is our connected device
    if (this.device && event.device === this.device) {
      console.log('USB device disconnected unexpectedly (radio may have rebooted)');
      
      // Reset connection state without trying to close the device (it's already gone)
      this.device = null;
      this.connected = false;
      this.isHIDMode = false;
      this.isInDFUMode = false;
      this.claimedInterfaces = [];
      this.controlInterfaceNumber = null;
      this.updateStatus('disconnected', 'Radio disconnected - please reconnect');
    }
  }

  /**
   * Handle WebHID disconnect event (e.g., MK22 HID bootloader disconnected)
   * @param {HIDConnectionEvent} event - The disconnect event
   */
  handleHIDDisconnect(event) {
    if (this.hidDevice && event.device === this.hidDevice) {
      console.log('WebHID device disconnected unexpectedly (radio may have rebooted)');
      this.hidDevice = null;
      this.useWebHID = false;
      this.connected = false;
      this.isHIDMode = false;
      this.isInDFUMode = false;
      this.updateStatus('disconnected', 'Radio disconnected - please reconnect');
    }
  }

  /**
   * Handle a Web Serial disconnect (e.g. a DM-32 / UV-008 unplugged or rebooted).
   * Without this the app keeps thinking the radio is connected and every
   * operation just times out.
   */
  handleSerialDisconnect(event) {
    if (this.serialPort && (!event || !event.target || event.target === this.serialPort)) {
      console.log('Web Serial port disconnected unexpectedly');
      this.serialReader = null;
      this.serialWriter = null;
      this.serialPort = null;
      this.isSerialMode = false;
      this.connected = false;
      this._serialBuffer = [];
      this._serialReadError = null;
      this._serialReadLoop = null;
      this.updateStatus('disconnected', 'Radio disconnected - please reconnect');
    }
  }

  /**
   * Set up a connection via WebHID API (for MK22 HID bootloader on Windows).
   * On Windows, the OS HID driver claims the MK22 DFU device, so WebUSB cannot see it.
   * WebHID bypasses this restriction and communicates with the device directly.
   * @param {HIDDevice} hidDevice - The WebHID device to connect to
   * @param {string|null} userSelectedRadioType - User's previously selected radio type
   */
  async _setupWebHIDDevice(hidDevice, userSelectedRadioType) {
    if (!hidDevice.opened) {
      await hidDevice.open();
    }
    
    // Add a small delay after opening to ensure device is ready
    // Some devices have timing issues with hot-plug events
    await new Promise(resolve => setTimeout(resolve, 100));

    this.hidDevice = hidDevice;
    this.useWebHID = true;
    this.isHIDMode = true;
    this.isInDFUMode = true;  // VID 0x15A2, PID 0x0073 is always MK22 DFU/bootloader mode
    this.radioType = userSelectedRadioType || CONFIG.RADIO_TYPES.MK22;
    this.radioModel = hidDevice.productName || 'OpenGD77';
    
    // Default report IDs - MK22 bootloader uses report ID 1 based on C# code (buffer[0] = 1)
    // These will be updated if the device's HID collections specify different IDs
    this.hidOutputReportId = 1;
    this.hidInputReportId = 1;
    this.hidHasOutputReports = false;
    this.hidInputReportIdDiscovered = false;
    
    // Store discovered output report IDs and their sizes for fallback
    // MK22 bootloader C# code uses report ID 1 - we prefer that if available
    this.hidOutputReportSizes = {};  // Map of reportId -> payload size in bytes
    this.hidDiscoveredOutputReportIds = [];  // All discovered output report IDs

    console.log('=== WebHID Device Connected ===');
    console.log(`Product: ${hidDevice.productName}`);
    console.log(`VID:PID: 0x${hidDevice.vendorId.toString(16).padStart(4, '0')}:0x${hidDevice.productId.toString(16).padStart(4, '0')}`);
    console.log(`Radio Type: ${this.radioType}`);
    console.log('Mode: MK22 HID bootloader (DFU) via WebHID');
    
    // Helper function to calculate report size in bytes from HID items
    // Each item has reportSize (bits) and reportCount (number of values)
    const calculateReportSize = (items) => {
      if (!items || items.length === 0) return 0;
      let totalBits = 0;
      for (const item of items) {
        // reportSize is bits per field, reportCount is number of fields
        const reportSize = item.reportSize || 0;
        const reportCount = item.reportCount || 0;
        totalBits += reportSize * reportCount;
      }
      return Math.ceil(totalBits / 8);  // Convert bits to bytes, round up
    };
    
    // Log HID collections to understand report structure
    console.log('=== HID Collections ===');
    if (hidDevice.collections && hidDevice.collections.length > 0) {
      for (let i = 0; i < hidDevice.collections.length; i++) {
        const collection = hidDevice.collections[i];
        console.log(`Collection ${i}: usagePage=0x${collection.usagePage?.toString(16)}, usage=0x${collection.usage?.toString(16)}`);
        
        if (collection.inputReports && collection.inputReports.length > 0) {
          for (const report of collection.inputReports) {
            const size = calculateReportSize(report.items);
            console.log(`  Input Report ID=${report.reportId}: ${report.items?.length || 0} items, ${size} bytes`);
          }
          // Store the first discovered input report ID
          if (!this.hidInputReportIdDiscovered) {
            this.hidInputReportId = collection.inputReports[0].reportId;
            this.hidInputReportIdDiscovered = true;
          }
        } else {
          console.log('  Input Reports: none');
        }
        
        if (collection.outputReports && collection.outputReports.length > 0) {
          for (const report of collection.outputReports) {
            const size = calculateReportSize(report.items);
            console.log(`  Output Report ID=${report.reportId}: ${report.items?.length || 0} items, ${size} bytes`);
            // Store size for each report ID
            this.hidOutputReportSizes[report.reportId] = size;
            this.hidDiscoveredOutputReportIds.push(report.reportId);
          }
          this.hidHasOutputReports = true;
          
          // IMPORTANT: MK22 bootloader C# code explicitly uses report ID 1 (buffer[0] = 1)
          // Prefer report ID 1 if available, otherwise use the first discovered report ID
          if (this.hidOutputReportSizes[1] !== undefined) {
            this.hidOutputReportId = 1;
            console.log('  -> Using report ID 1 (MK22 bootloader standard)');
          } else {
            this.hidOutputReportId = collection.outputReports[0].reportId;
            console.log(`  -> Report ID 1 not available, using first discovered: ${this.hidOutputReportId}`);
          }
        } else {
          console.log('  Output Reports: none');
        }
        
        if (collection.featureReports && collection.featureReports.length > 0) {
          console.log(`  Feature Reports: ${collection.featureReports.map(r => `ID=${r.reportId}`).join(', ')}`);
        }
      }
      
      // Check if device supports output reports
      if (!this.hidHasOutputReports) {
        console.warn('WARNING: Device HID collections do not define output reports.');
        console.warn('Will attempt to use default report ID 1 (from MK22 bootloader protocol).');
        console.warn('This may fail if the device does not support output reports.');
      }
    } else {
      console.log('No HID collections found - device may use raw HID endpoints');
      console.log('Will attempt to use default report ID 1 (from MK22 bootloader protocol).');
    }
    
    // Log final configuration
    const selectedSize = this.hidOutputReportSizes[this.hidOutputReportId] || 36;
    console.log(`Using output report ID: ${this.hidOutputReportId}, payload size: ${selectedSize} bytes`);
    console.log(`Discovered output report IDs: [${this.hidDiscoveredOutputReportIds.join(', ')}]`);
    console.log('==============================');

    this.connected = true;
    this.updateStatus('connected', `Connected: ${this.radioModel} (${this.radioType} DFU)`);
  }

  /**
   * Receive a single HID input report from the WebHID device.
   * WebHID uses event-based I/O; this wraps the inputreport event in a Promise.
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Uint8Array} Report data WITHOUT the report ID byte (63 bytes for MK22)
   */
  async _receiveWebHIDReport(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.hidDevice) this.hidDevice.removeEventListener('inputreport', handler);
        reject(new Error(`WebHID receive timeout after ${timeout}ms`));
      }, timeout);

      const handler = (event) => {
        clearTimeout(timer);
        if (this.hidDevice) this.hidDevice.removeEventListener('inputreport', handler);
        // event.data is a DataView of the report payload WITHOUT the report ID
        // For MK22: [reserved=0, lenLow, lenHigh, data...]
        // Use byteOffset/byteLength to handle non-zero-offset DataViews safely
        const rawData = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        
        // Debug: Log raw WebHID input report with report ID for protocol analysis
        if (this.debugEnabled) {
          const MAX_DEBUG_BYTES = 32;
          const displayBytes = rawData.slice(0, Math.min(MAX_DEBUG_BYTES, rawData.length));
          const hexStr = Array.from(displayBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
          const asciiStr = Array.from(displayBytes).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
          const truncatedSuffix = rawData.length > MAX_DEBUG_BYTES ? ' ...' : '';
          console.log(`[STM32 DEBUG] RECV (WebHID raw input) reportId=${event.reportId}, ${rawData.length} bytes`);
          console.log(`  HEX: ${hexStr}${truncatedSuffix}`);
          console.log(`  ASCII: ${asciiStr}${truncatedSuffix}`);
        }
        
        resolve(rawData);
      };

      this.hidDevice.addEventListener('inputreport', handler);
    });
  }

  /**
   * Debug logging helper - formats bytes as hex string for readable output
   * @param {string} prefix - Log message prefix
   * @param {Uint8Array|Array} data - Byte array to log
   * @param {number} maxBytes - Maximum bytes to display (default 32)
   */
  debugLog(prefix, data, maxBytes = 32) {
    if (!this.debugEnabled) return;
    
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const displayBytes = bytes.slice(0, Math.min(bytes.length, maxBytes));
    const hexStr = Array.from(displayBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const asciiStr = Array.from(displayBytes).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    const truncated = bytes.length > maxBytes ? ` ... (${bytes.length} bytes total)` : '';
    
    console.log(`[STM32 DEBUG] ${prefix}`);
    console.log(`  HEX: ${hexStr}${truncated}`);
    console.log(`  ASCII: ${asciiStr}${truncated}`);
  }

  /**
   * Simple debug message logging
   * @param {string} message - Message to log
   */
  debugMessage(message) {
    if (!this.debugEnabled) return;
    console.log(`[STM32 DEBUG] ${message}`);
  }

  /**
   * Send STM32 command following the C# protocol
   * Matches sendCommand() in OpenGD77Form.cs (lines 153-188)
   * 
   * C# protocol:
   * - Allocates 64-byte buffer, always writes 32 bytes: commPort.Write(buffer, 0, 32)
   * - buffer[0] = 'C' (0x43), buffer[1] = commandNumber
   * - Command 2 (text): buffer[3]=y, buffer[4]=size, buffer[5]=alignment,
   *   buffer[6]=inverted, buffer[7..]=message (up to 16 chars)
   * - Command 6 (special): buffer[2] = optionNumber
   * - Polls BytesToRead for up to 100 retries with 1ms sleep
   * - Reads response: commPort.Read(buffer, 0, 64)
   * - Validates buffer[1] == commandNumber
   * 
   * Command Numbers:
   *   0 - Enter CPS mode (show CPS screen)
   *   1 - Clear display buffer
   *   2 - Write text to display
   *   3 - Render display buffer to screen
   *   4 - Turn on backlight
   *   5 - Close CPS session (exit CPS mode)
   *   6 - Special functions (option in x_or_option):
   *       0: Save settings (NOT VFOs), trigger reboot
   *       1: Reboot only
   *       2: Save settings and VFOs to codeplug
   *       3: Flash green LED
   *       4: Flash red LED
   *       5: Initialize codec internal buffers (for audio upload)
   *       6: Initialize sound buffers (soundInit)
   *       7: Set date/time (4-byte timestamp at buffer[3..6])
   *       8: Stop GPS NMEA output
   *       9: Resume GPS NMEA output
   *      10: Wait 10ms
   *   7 - Restore GPS NMEA mode
   *   254 - Ping (keep-alive)
   * 
   * @param {number} commandNumber - Command number (0=CPS mode, 1=clear, 2=text, 3=render, 5=close, 6=special)
   * @param {number} x_or_option - X position for cmd 2, option number for cmd 6 (default 0)
   * @param {number} y - Y position for command 2 (default 0)
   * @param {number} iSize - Font size for command 2 (1=small, 2=medium, 3=large)
   * @param {number} alignment - Text alignment for command 2 (0=left, 1=center, 2=right)
   * @param {number} isInverted - Inverted text for command 2 (0=normal, 1=inverted)
   * @param {string} message - Text message for command 2 (max 16 chars)
   * @returns {Promise<boolean>} - True if command was acknowledged
   */
  async sendSTM32Command(commandNumber, x_or_option = 0, y = 0, iSize = 0, alignment = 0, isInverted = 0, message = '', timeoutMs = 5000) {
    // C# sends variable-length commands, NOT always 32 bytes
    // Reference: OpenGD77Form.cs sendCommand() function
    // C# uses: byte[] array = new byte[1032]; int num2 = 2; then port.Write(array, 0, num2);
    const buffer = new Uint8Array(1032);
    let sendLength = 2; // Base length: command header + command number (matches C# num2)
    buffer[0] = 0x43; // 'C'
    buffer[1] = commandNumber;
    
    switch (commandNumber) {
      case 2:
        // Text display: buffer[3]=y, buffer[4]=size, buffer[5]=alignment,
        // buffer[6]=inverted, buffer[7..]=message (max 16 chars)
        // C#: num2 += 5 + Math.Min(message.Length, 16);
        buffer[3] = y;
        buffer[4] = iSize;
        buffer[5] = alignment;
        buffer[6] = isInverted;
        const msgBytes = new TextEncoder().encode(message.substring(0, 16));
        buffer.set(msgBytes, 7);
        sendLength = 7 + msgBytes.length;
        break;
      case 6:
        // Special command: buffer[2] = option, num2++ (so 3 bytes total)
        // C#: array[2] = (byte)x_or_command_option_number; num2++;
        buffer[2] = x_or_option;
        sendLength = 3;
        if (x_or_option === 7) {
          // Sub-command 7 = set the radio clock from the CPS (Unix time, little-endian).
          // The original CPS sends this after writing satellite keps; the firmware
          // stores it and reloads the satellite predictions. Without a valid clock
          // (newer than the firmware build date) the satellite screen refuses to run.
          const unixTime = Math.floor(Date.now() / 1000) >>> 0;
          buffer[3] = unixTime & 0xFF;
          buffer[4] = (unixTime >>> 8) & 0xFF;
          buffer[5] = (unixTime >>> 16) & 0xFF;
          buffer[6] = (unixTime >>> 24) & 0xFF;
          sendLength = 7;
        }
        break;
      default:
        // Other commands send just 2 bytes (command header + command number)
        sendLength = 2;
        break;
    }
    
    this.debugMessage(`Sending STM32 command ${commandNumber} (option: ${x_or_option}, ${sendLength} bytes)`);
    this.debugLog('STM32 command buffer', buffer.slice(0, sendLength));
    
    // C#: port.Write(array, 0, num2); - send variable length
    await this.sendData(buffer.slice(0, sendLength));
    
    // C#: while (commPort.BytesToRead == 0 && retries-- > 0) { Thread.Sleep(1); }
    // 100 retries with 1ms sleep = 100ms max wait
    const response = await this.receiveData(timeoutMs, 1);
    this.debugLog('STM32 command response', response);
    
    // The firmware response for 'C' commands (cpsHandleCommand) is a single '-' (0x2D) byte.
    // This is NOT an error - it's the expected success response for all CPS commands.
    // Reference: MK22 firmware usb_com.c line 803-806:
    //   usbComSendBuf[0] = '-';
    //   USB_DeviceCdcAcmSend(... usbComSendBuf, 1);
    // Reference: STM32 firmware usb_com.c line 898-902:
    //   usbComSendBuf[0] = '-';
    //   hasToReply = true;
    //   replyLength = 1;
    //
    // The C# CPS sendCommand() returns (buffer[1] == commandNumber), which would fail
    // for most commands since only 1 byte is received. However, the CPS ignores the
    // return value for command 6 (save/reboot) and just closes the port.
    // We should accept '-' as a success response for all 'C' commands.
    const success = response.length >= 1 && response[0] === 0x2D; // '-' = success
    this.debugMessage(`STM32 command ${commandNumber} ${success ? 'SUCCESS' : 'FAILED'} (response[0]=0x${response[0]?.toString(16) || 'N/A'}, expected=0x2D '-')`);
    
    return success;
  }

  /**
   * Set the radio's clock to the current UTC (Zulu) time.
   *
   * The OpenGD77 satellite screen refuses to run if the radio clock is older
   * than the firmware build date, so the clock is also synced after writing
   * satellite keps. The firmware stores Unix time (UTC) and reloads the
   * satellite predictions on this command.
   *
   * Works for both STM32 and MK22: both firmware CPS modes are CDC-ACM and
   * implement command 6, sub-command 7 (see usb_com.c `cpsHandleCommand`).
   *
   * @returns {Promise<boolean>} true if the radio acknowledged the command
   */
  async setClock() {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    await this.initProtocol();

    // Seconds since the Unix epoch. This is inherently UTC (Zulu); the radio
    // converts to local time for display using its timezone setting.
    const unixTime = Math.floor(Date.now() / 1000) >>> 0;
    this.debugMessage(`Setting radio clock to ${new Date(unixTime * 1000).toISOString()} (${unixTime})`);

    const ok = await this.sendSTM32Command(6, 7);

    // The firmware remains in CPS mode after setting the clock, which leaves
    // the radio unresponsive, so reboot it to return to normal operation.
    try {
      await this.sendSTM32Command(6, 1);
    } catch (rebootError) {
      this.debugMessage(`Clock set but reboot failed: ${rebootError.message}`);
    }

    return ok;
  }

  /**
   * Best-effort clock sync (UTC) used during codeplug writes. Never throws, so
   * a failure to set the clock does not abort the write.
   * @returns {Promise<boolean>} true if the radio acknowledged the command
   */
  async attemptClockSync() {
    try {
      const unixTime = Math.floor(Date.now() / 1000) >>> 0;
      this.debugMessage(`Syncing radio clock to ${new Date(unixTime * 1000).toISOString()} (UTC)`);
      return await this.sendSTM32Command(6, 7);
    } catch (error) {
      this.debugMessage(`Clock sync failed (continuing): ${error.message}`);
      return false;
    }
  }

  /**
   * Check if WebUSB is supported
   */
  isSupported() {
    return 'usb' in navigator;
  }

  /**
   * Check if WebHID is supported (Chrome/Edge with WebHID API)
   * WebHID is required for MK22 HID bootloader on Windows where the OS HID driver
   * prevents the device from appearing in the WebUSB device picker.
   */
  isHIDSupported() {
    return 'hid' in navigator;
  }

  /**
   * Check if Web Serial is supported (Chrome/Edge/Opera).
   * Required for the Baofeng DM-32 / UV-32 (C7000) and any USB-to-serial adapter.
   */
  isSerialSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Connect to a radio over Web Serial (Baofeng DM-32 / UV-32, C7000 platform).
   *
   * These radios speak the same OpenGD77 serial protocol as the STM32 radios,
   * but over a plain USB-to-serial adapter instead of USB CDC-ACM. The port
   * picker is unfiltered so any adapter chip (PL2303, CH340, CP2102, FTDI, ...)
   * can be used.
   *
   * @returns {Promise<boolean>} True if connected
   */
  async connectSerial() {
    if (this._busy) {
      throw new Error(`Radio is busy: ${this._busyOp}`);
    }
    this._busy = true;
    this._busyOp = 'connecting';
    try {
      await this._resetTransportState();
      await this._openSerialPort(false);

      this.radioType = CONFIG.RADIO_TYPES.DM32;
      this._explicitRadioType = true;
      this.radioModel = 'DM32/UV008';

      // Persist the radio type so it is remembered for future sessions
      Utils.storage.set(CONFIG.STORAGE.RADIO_TYPE, CONFIG.RADIO_TYPES.DM32);

      // Detect whether the radio is running the app (CPS mode) or sitting in
      // the bootloader (firmware update mode: PTT + SK1 on power-on).
      const mode = await this._detectDM32Mode();
      this.debugMessage(`DM32 connect mode: ${mode}`);

      if (mode === 'bootloader') {
        // Firmware update mode - skip the CPS handshake; the firmware tools drive it
        this.isInDFUMode = true;
        this.radioModel = 'DM32/UV008 (Update Mode)';
        this.updateStatus('connected', 'Connected (Update Mode)');
        return true;
      }

      this.isInDFUMode = false;

      // Wake/handshake, matching C# CPS probeRadioModel(): send "C" 254 and
      // discard the reply before entering CPS mode with command 0.
      try {
        await this.sendData(new Uint8Array([0x43, 0xFE]));
        await this.receiveData(1000, 0);
      } catch (e) {
        this.debugMessage(`Serial handshake warning: ${e.message}`);
      }

      this.updateStatus('connected', 'Connected (Serial)');
      return true;
    } finally {
      this._busy = false;
      this._busyOp = null;
    }
  }

  /**
   * Detect whether a DM-32 is running the app (CPS mode) or is in the
   * bootloader (firmware update mode).
   *
   * The bootloader answers 0x52 with 0x06; the running app answers command 0
   * with '-' (0x2D). This lets the Connect button avoid the CPS handshake when
   * the radio is in firmware update mode.
   *
   * @returns {Promise<'bootloader'|'cps'|'unknown'>}
   */
  async _detectDM32Mode() {
    // Bootloader / firmware update mode
    this._serialBuffer.length = 0;
    try {
      await this.serialWriter.write(new Uint8Array([0x52]));
      const resp = await this._serialReadExact(1, 1200);
      if (resp.length === 1 && resp[0] === 0x06) {
        return 'bootloader';
      }
    } catch (e) { /* ignore */ }

    // Running app (CPS mode)
    this._serialBuffer.length = 0;
    try {
      await this.serialWriter.write(new Uint8Array([0x43, 0x00]));
      const resp = await this._serialReadExact(1, 1500);
      if (resp.length >= 1 && resp[0] === 0x2D) {
        return 'cps';
      }
    } catch (e) { /* ignore */ }

    this._serialBuffer.length = 0;
    return 'unknown';
  }

  /**
   * Open the Web Serial port (no protocol handshake). Used by connectSerial()
   * and by the DM-32 firmware-flash / SPI-flash backup tools.
   */
  async _openSerialPort(reuse = true) {
    // Reuse the already-open serial port if requested and available
    if (reuse && this.serialPort) {
      this.connected = true;
      this.isSerialMode = true;
      this.debugMessage('Reusing existing Web Serial port');
      return;
    }

    // A fresh connect should not reuse a possibly stale port
    if (this.serialPort) {
      this.debugMessage('Closing existing Web Serial port before reopening');
      await this.disconnect();
    }

    if (!this.isSerialSupported()) {
      throw new Error('Web Serial is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    const port = await navigator.serial.requestPort();
    await port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    });

    this.serialPort = port;
    this.serialWriter = port.writable.getWriter();
    this.serialReader = port.readable.getReader();
    // Web Serial permits only one pending read() at a time, so run a single
    // background read loop and let the readers pull from the buffer.
    this._serialBuffer = [];
    this._serialReadError = null;
    this._serialReadLoop = this._runSerialReadLoop();
    this.isSerialMode = true;
    this.isHIDMode = false;
    this.isInDFUMode = false;
    this.connected = true;

    this.debugMessage('=== WEB SERIAL CONNECTED ===');
    this.debugMessage(`Port info: ${port.getInfo ? JSON.stringify(port.getInfo()) : 'unknown'}, 115200 8N1`);
  }

  /**
   * Raw serial link used by the DM-32 flash tools (see dm32flash.js).
   */
  _serialLink() {
    return {
      write: (bytes) => this.serialWriter.write(bytes),
      read: (count, timeoutMs) => this._serialReadExact(count, timeoutMs),
      waitFor: (pattern, timeoutMs) => this._serialWaitFor(pattern, timeoutMs),
      readUntil: (pattern, timeoutMs) => this._serialReadUntil(pattern, timeoutMs),
      debug: (msg) => this.debugMessage(`DM32: ${msg}`),
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      drain: async () => {
        this._serialBuffer.length = 0;
        this._serialReadError = null;
      }
    };
  }

  /** Read exactly `count` bytes (or whatever arrived before the timeout). */
  async _serialReadExact(count, timeoutMs = 5000) {
    const start = Date.now();
    while (this._serialBuffer.length < count) {
      if (this._serialReadError) throw this._serialReadError;
      if (Date.now() - start >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const take = Math.min(count, this._serialBuffer.length);
    return new Uint8Array(this._serialBuffer.splice(0, take));
  }

  /** Wait until `pattern` appears in the incoming byte stream. */
  async _serialWaitFor(pattern, timeoutMs = 5000) {
    const pat = pattern instanceof Uint8Array ? pattern : new Uint8Array(pattern);
    const start = Date.now();
    let matched = 0;
    while (Date.now() - start < timeoutMs) {
      if (this._serialBuffer.length > 0) {
        const b = this._serialBuffer.shift();
        if (b === pat[matched]) {
          matched++;
          if (matched === pat.length) return;
        } else {
          matched = (b === pat[0]) ? 1 : 0;
        }
      } else {
        if (this._serialReadError) throw this._serialReadError;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    throw new Error('Timed out waiting for the radio');
  }

  /**
   * Discard incoming bytes until `pattern` is seen.
   * @returns {Promise<boolean>} True if the pattern was found before the timeout
   */
  async _serialReadUntil(pattern, timeoutMs = 3000) {
    try {
      await this._serialWaitFor(pattern, timeoutMs);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============== DM-32 / UV008 flash tools ==============

  /**
   * Flash firmware via the Baofeng bootloader.
   * The radio must be in firmware update mode (hold PTT + SK1 while powering on).
   */
  async dm32FlashFirmware(firmwareData, onProgress, options = {}) {
    if (this._busy) throw new Error(`Radio is busy: ${this._busyOp}`);
    this._busy = true; this._busyOp = 'flashing firmware';
    try { window.App?.lockRadio?.('write'); } catch (e) { /* ignore */ }
    try {
      await this._openSerialPort();
      this.radioType = CONFIG.RADIO_TYPES.DM32;
      this.radioModel = 'DM32/UV008 (Update Mode)';
      this.isInDFUMode = true;
      Utils.storage.set(CONFIG.STORAGE.RADIO_TYPE, CONFIG.RADIO_TYPES.DM32);
      this.updateStatus('connected', 'Connected (Update Mode)');
      await DM32Flash.flashFirmware(this._serialLink(), firmwareData, (pct, msg) => {
        const text = msg || `Writing firmware ${Math.round(pct)}%`;
        this.updateStatus('busy', text);
        this.reportProgress(pct, text);
        if (onProgress) onProgress(pct, text);
      }, options);
      this.updateStatus('connected', 'Firmware written - rebooting');
    } finally {
      this._busy = false; this._busyOp = null;
      try { window.App?.lockRadio?.(null); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Read a whole SPI flash chip (GD25Q08 program memory or GD25Q128 data flash).
   * The radio must be OFF; the user powers it on while the tool waits.
   */
  async dm32BackupFlash(chip, onProgress, options = {}) {
    if (this._busy) throw new Error(`Radio is busy: ${this._busyOp}`);
    this._busy = true; this._busyOp = 'reading flash';
    try { window.App?.lockRadio?.('read'); } catch (e) { /* ignore */ }
    try {
      await this._openSerialPort();
      this.radioType = CONFIG.RADIO_TYPES.DM32;
      this.radioModel = 'DM32/UV008 (Boot ROM)';
      this.isInDFUMode = true;
      this.updateStatus('connected', 'Connected (Boot ROM)');
      return await DM32Flash.readFlash(this._serialLink(), chip, (pct, msg) => {
        const text = msg || `Reading flash ${Math.round(pct)}%`;
        this.updateStatus('busy', text);
        this.reportProgress(pct, text);
        if (onProgress) onProgress(pct, text);
      }, options);
    } finally {
      this._busy = false; this._busyOp = null;
      try { window.App?.lockRadio?.(null); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Write a whole SPI flash chip from a previously saved image.
   * The radio must be OFF; the user powers it on while the tool waits.
   */
  async dm32RestoreFlash(chip, data, onProgress, options = {}) {
    if (this._busy) throw new Error(`Radio is busy: ${this._busyOp}`);
    this._busy = true; this._busyOp = 'writing flash';
    try { window.App?.lockRadio?.('write'); } catch (e) { /* ignore */ }
    try {
      await this._openSerialPort();
      this.radioType = CONFIG.RADIO_TYPES.DM32;
      this.radioModel = 'DM32/UV008 (Boot ROM)';
      this.isInDFUMode = true;
      this.updateStatus('connected', 'Connected (Boot ROM)');
      await DM32Flash.writeFlash(this._serialLink(), chip, data, (pct, msg) => {
        const text = msg || `Writing flash ${Math.round(pct)}%`;
        this.updateStatus('busy', text);
        this.reportProgress(pct, text);
        if (onProgress) onProgress(pct, text);
      }, options);
    } finally {
      this._busy = false; this._busyOp = null;
      try { window.App?.lockRadio?.(null); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Continuously read from the serial port into an internal buffer.
   * Errors are stored so receiveData() can surface them.
   */
  async _runSerialReadLoop() {
    try {
      while (this.serialReader) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        if (value && value.length) {
          for (let i = 0; i < value.length; i++) {
            this._serialBuffer.push(value[i]);
          }
        }
      }
    } catch (e) {
      if (this.serialReader) {
        this._serialReadError = e;
      }
    }
  }

  /**
   * Receive data accumulated by the serial read loop.
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @param {number} expectedMinBytes - Bytes to accumulate before returning (0 = discard)
   */
  async _receiveSerial(timeout = 5000, expectedMinBytes = 2) {
    const isDiscardMode = expectedMinBytes === 0;

    if (isDiscardMode) {
      // Give the radio a moment, then drain whatever arrived
      await new Promise((resolve) => setTimeout(resolve, 50));
      const discarded = new Uint8Array(this._serialBuffer.splice(0, this._serialBuffer.length));
      this.debugMessage(`RECV mode: Web Serial (discarded ${discarded.length} bytes)`);
      return discarded;
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (this._serialReadError) throw this._serialReadError;
      if (this._serialBuffer.length >= expectedMinBytes) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const responseData = new Uint8Array(this._serialBuffer.splice(0, this._serialBuffer.length));
    this.debugMessage(`RECV mode: Web Serial (${responseData.length} bytes)`);
    return responseData;
  }

  /**
   * Get the current radio type
   */
  getRadioType() {
    return this.radioType;
  }

  /**
   * Set the radio type (MK22 or STM32)
   */
  setRadioType(type) {
    if (type === CONFIG.RADIO_TYPES.MK22 || type === CONFIG.RADIO_TYPES.STM32 || type === CONFIG.RADIO_TYPES.DM32) {
      this.radioType = type;
      this._explicitRadioType = true;
      Utils.storage.set(CONFIG.STORAGE.RADIO_TYPE, type);
    }
  }

  /**
   * Set the USB buffer size for read/write operations
   * Modern firmware (after 2021-10-02) supports 1024 bytes
   * Older firmware requires 32 bytes
   * @param {number} size - Buffer size in bytes (32 or 1024)
   * @throws {Error} If size is not 32 or 1024
   */
  setBufferSize(size) {
    if (size === 32 || size === 1024) {
      this.usbBufferSize = size;
      console.log(`USB buffer size set to ${size} bytes`);
    } else {
      throw new Error(`Invalid buffer size ${size}, must be 32 or 1024`);
    }
  }

  /**
   * Get the current USB buffer size
   * @returns {number} Buffer size in bytes
   */
  getBufferSize() {
    return this.usbBufferSize;
  }

  /**
   * Set the radio's date/time (STM32 only)
   * Uses Command 6, option 7 with a 4-byte Unix timestamp
   * @param {Date} date - JavaScript Date object to set
   * @returns {Promise<boolean>} - True if successful
   */
  async setRadioDateTime(date = new Date()) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    
    if (!this.isFlashBasedRadio()) {
      throw new Error('Date/time setting is only supported on STM32 radios');
    }
    
    // Send Command 6, option 7 with timestamp
    // Buffer format: [0x43, 0x06, 0x07, ts0, ts1, ts2, ts3]
    const timestamp = Math.floor(date.getTime() / 1000);
    const buffer = new Uint8Array(32);
    buffer[0] = 0x43; // 'C'
    buffer[1] = 6;    // Command 6
    buffer[2] = 7;    // Option 7: Set date/time
    buffer[3] = timestamp & 0xFF;
    buffer[4] = (timestamp >> 8) & 0xFF;
    buffer[5] = (timestamp >> 16) & 0xFF;
    buffer[6] = (timestamp >> 24) & 0xFF;
    
    this.debugMessage(`Setting radio date/time to: ${date.toISOString()}`);
    await this.sendData(buffer);
    const response = await this.receiveData(5000, 1);
    
    return response.length >= 1 && response[0] === 0x2D; // firmware replies '-' on success
  }

  /**
   * Flash LED on the radio (STM32 only)
   * @param {string} color - 'green' or 'red'
   * @returns {Promise<boolean>} - True if successful
   */
  async flashLED(color = 'green') {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    
    if (!this.isFlashBasedRadio()) {
      throw new Error('LED control is only supported on STM32 radios');
    }
    
    const option = color === 'red' ? 4 : 3;
    return await this.sendSTM32Command(6, option);
  }

  /**
   * Save settings to radio (STM32 only)
   * @param {boolean} includeVFOs - Whether to also save VFO settings
   * @param {boolean} reboot - Whether to reboot after saving
   * @returns {Promise<boolean>} - True if successful
   */
  async saveSettings(includeVFOs = true, reboot = true) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    
    if (!this.isFlashBasedRadio()) {
      throw new Error('Save settings is only supported on STM32 radios');
    }
    
    if (includeVFOs) {
      // Option 2: Save settings and VFOs to codeplug (no automatic reboot)
      return await this.sendSTM32Command(6, 2);
    } else if (reboot) {
      // Option 0: Save settings (NOT VFOs) and trigger reboot
      return await this.sendSTM32Command(6, 0);
    } else {
      // Option 2: Save settings and VFOs (default behavior when not rebooting)
      return await this.sendSTM32Command(6, 2);
    }
  }

  /**
   * Reboot the radio (STM32 only)
   * @returns {Promise<boolean>} - True if successful
   */
  async rebootRadio() {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    
    if (!this.isFlashBasedRadio()) {
      throw new Error('Reboot is only supported on STM32 radios');
    }
    
    // Option 1: Reboot only (without saving)
    return await this.sendSTM32Command(6, 1);
  }

  /**
   * Initialize audio buffers for custom sound upload (STM32 only)
   * Must be called before uploading WAV data
   * @returns {Promise<boolean>} - True if successful
   */
  async initAudioBuffers() {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    
    if (!this.isFlashBasedRadio()) {
      throw new Error('Audio buffer init is only supported on STM32 radios');
    }
    
    // Option 5: Initialize codec internal buffers
    const result1 = await this.sendSTM32Command(6, 5);
    // Option 6: Initialize sound buffers
    const result2 = await this.sendSTM32Command(6, 6);
    
    return result1 && result2;
  }

  /**
   * Find interface with bulk endpoints for data transfer
   * CDC-ACM devices typically have a data interface separate from control interface
   * Returns all interfaces that need to be claimed for proper operation
   */
  findDataInterface() {
    if (!this.device || !this.device.configuration) {
      return null;
    }
    
    let dataInterface = null;
    let controlInterface = null;
    
    // Search through all interfaces to find the data interface (with bulk endpoints)
    // and control interface (CDC ACM control)
    for (const iface of this.device.configuration.interfaces) {
      for (const alternate of iface.alternates) {
        let hasIn = false;
        let hasOut = false;
        let epIn = null;
        let epOut = null;
        let hasBulkEndpoints = false;
        
        for (const endpoint of alternate.endpoints) {
          if (endpoint.type === 'bulk') {
            hasBulkEndpoints = true;
            if (endpoint.direction === 'in') {
              hasIn = true;
              epIn = endpoint.endpointNumber;
            } else if (endpoint.direction === 'out') {
              hasOut = true;
              epOut = endpoint.endpointNumber;
            }
          }
        }
        
        // Found an interface with both bulk in and bulk out endpoints - this is the data interface
        if (hasIn && hasOut) {
          dataInterface = {
            interfaceNumber: iface.interfaceNumber,
            alternateNumber: alternate.alternateSetting,
            endpointIn: epIn,
            endpointOut: epOut
          };
        }
        
        // Check for CDC control interface (typically has interrupt endpoint or no endpoints)
        // CDC control interfaces usually have class 0x02 (Communications)
        if (!hasBulkEndpoints && alternate.interfaceClass === 0x02) {
          controlInterface = {
            interfaceNumber: iface.interfaceNumber,
            alternateNumber: alternate.alternateSetting
          };
        }
      }
    }
    
    if (dataInterface) {
      dataInterface.controlInterface = controlInterface;
      return dataInterface;
    }
    
    return null;
  }

  /**
   * Configure CDC-ACM serial line coding (baud rate, data bits, parity, stop bits)
   * Sends SET_LINE_CODING and SET_CONTROL_LINE_STATE USB control transfers.
   * Required for CDC-ACM devices to communicate at the correct baud rate.
   * Reference: OpenGD77 CPS uses 115200 baud, 8N1 (OpenGD77Form.cs)
   */
  async setCDCLineCoding() {
    if (!this.device || this.isHIDMode) {
      return; // Not needed for HID bootloader mode
    }

    // Determine which interface to use for control transfers
    const controlIfNum = this.controlInterfaceNumber !== null
      ? this.controlInterfaceNumber
      : this.interfaceNumber;

    console.log(`Setting CDC-ACM line coding: ${this.CDC_BAUD_RATE} baud, ${this.CDC_DATA_BITS}N1 on interface ${controlIfNum}`);

    // SET_LINE_CODING (0x20): Configure baud rate, data bits, parity, stop bits
    // USB CDC PSTN Subclass spec, Table 7: Line Coding Structure
    // Offset 0: dwDTERate (4 bytes LE) - baud rate
    // Offset 4: bCharFormat (1 byte) - stop bits (0=1, 1=1.5, 2=2)
    // Offset 5: bParityType (1 byte) - parity (0=None, 1=Odd, 2=Even)
    // Offset 6: bDataBits (1 byte) - data bits (5, 6, 7, 8, 16)
    const lineCoding = new Uint8Array(7);
    const view = new DataView(lineCoding.buffer);
    view.setUint32(0, this.CDC_BAUD_RATE, true); // baud rate, little-endian
    lineCoding[4] = this.CDC_STOP_BITS;           // 1 stop bit
    lineCoding[5] = this.CDC_PARITY;              // no parity
    lineCoding[6] = this.CDC_DATA_BITS;           // 8 data bits

    try {
      await this.device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x20,  // SET_LINE_CODING
        value: 0,
        index: controlIfNum
      }, lineCoding);
      console.log(`CDC-ACM SET_LINE_CODING: ${this.CDC_BAUD_RATE} baud, ${this.CDC_DATA_BITS} data bits, no parity, 1 stop bit`);
    } catch (e) {
      console.warn(`SET_LINE_CODING failed (interface ${controlIfNum}):`, e.message);
    }

    // SET_CONTROL_LINE_STATE (0x22): Configure DTR and RTS signals
    // wValue bit 0 = DTR, bit 1 = RTS
    // Note: C# SerialPort defaults to DtrEnable=false, RtsEnable=false
    // However, some USB-serial devices need DTR/RTS enabled to work properly
    // We start with DTR=1, RTS=1 which is more compatible with USB CDC-ACM devices
    try {
      await this.device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x22,  // SET_CONTROL_LINE_STATE
        value: 0x03,    // DTR=1, RTS=1
        index: controlIfNum
      });
      console.log('CDC-ACM SET_CONTROL_LINE_STATE: DTR=1, RTS=1');
    } catch (e) {
      console.warn(`SET_CONTROL_LINE_STATE failed (interface ${controlIfNum}):`, e.message);
    }
    
    // Allow time for the device to apply CDC settings and stabilize
    // This is important for USB enumeration and CDC-ACM initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Request access to an OpenGD77 radio
   * Supports both MK22 (GD-77) and STM32 (TYT) radios
   */
  async connect() {
    if (this._busy || this._activeOp) {
      throw new Error(`Radio is busy: ${this._busyOp || this._activeOp}. Wait for it to finish before reconnecting.`);
    }
    if (!this.isSupported() && !this.isHIDSupported()) {
      throw new Error('WebUSB and WebHID are not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      await this._resetTransportState();
      // Get user's selected radio type BEFORE connecting - respect user's choice
      const userSelectedRadioType = Utils.getSavedRadioType();
      if (userSelectedRadioType) this._explicitRadioType = true;

      // Try WebHID first for MK22 HID bootloader when WebHID is available.
      // On Windows, the OS HID driver claims the MK22 DFU device (VID 0x15A2, PID 0x0073),
      // preventing it from appearing in the WebUSB device picker. WebHID can access it directly.
      // Only try WebHID if user has MK22 selected (or no type selected), to avoid confusion for STM32 users.
      if (this.isHIDSupported() && (!userSelectedRadioType || userSelectedRadioType === CONFIG.RADIO_TYPES.MK22)) {
        try {
          const hidDevices = await navigator.hid.requestDevice({
            filters: [{ vendorId: CONFIG.USB.VID, productId: CONFIG.USB.PID }]  // MK22 bootloader
          });
          if (hidDevices && hidDevices.length > 0) {
            await this._setupWebHIDDevice(hidDevices[0], userSelectedRadioType);
            return true;
          }
          // User canceled or no matching devices - fall through to WebUSB
          console.log('No MK22 HID device selected, trying WebUSB...');
        } catch (e) {
          // SecurityError should propagate; other errors fall through to WebUSB
          if (e.name === 'SecurityError') throw e;
          console.log('WebHID connection failed, trying WebUSB:', e.message);
        }
      }

      if (!this.isSupported()) {
        throw new Error('WebUSB is not supported in this browser. Please use Chrome, Edge, or Opera.');
      }

      // Request device with OpenGD77 VID/PID or TYT/STM32 VID/PID
      this.device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: CONFIG.USB.VID, productId: CONFIG.USB.PID },           // MK22 bootloader (GD-77)
          { vendorId: CONFIG.USB_OPENGD77.VID, productId: CONFIG.USB_OPENGD77.PID }, // OpenGD77 CDC-ACM serial mode
          { vendorId: CONFIG.USB_STM32.VID, productId: CONFIG.USB_STM32.PID } // STM32 (TYT)
        ]
      });

      // Only open the device if it's not already opened
      if (!this.device.opened) {
        await this.device.open();
      }
      
      // Detect communication mode based on VID/PID (HID vs CDC-ACM)
      // But respect user's radio type selection for protocol handling
      let detectedRadioType = null;
      this.isInDFUMode = false;  // Reset DFU mode flag
      
      if (this.device.vendorId === CONFIG.USB_STM32.VID && this.device.productId === CONFIG.USB_STM32.PID) {
        // STM32 DFU mode - can detect type reliably
        detectedRadioType = CONFIG.RADIO_TYPES.STM32;
        this.isHIDMode = false;
        this.isInDFUMode = true;  // STM32 DFU mode detected
      } else if (this.device.vendorId === CONFIG.USB.VID && this.device.productId === CONFIG.USB.PID) {
        // MK22 bootloader mode (HID) - requires header wrapper
        detectedRadioType = CONFIG.RADIO_TYPES.MK22;
        this.isHIDMode = true;
        this.isInDFUMode = true;  // MK22 bootloader/DFU mode detected
      } else if (this.device.vendorId === CONFIG.USB_OPENGD77.VID && this.device.productId === CONFIG.USB_OPENGD77.PID) {
        // OpenGD77 CDC-ACM serial mode - could be MK22 or STM32 running OpenGD77
        // Don't assume type - let user selection take precedence
        detectedRadioType = null;
        this.isHIDMode = false;
        this.isInDFUMode = false;  // Not in DFU mode - normal operation mode
      } else {
        // Unknown device - use CDC-ACM serial mode
        console.warn(`Unknown device VID:0x${this.device.vendorId.toString(16)} PID:0x${this.device.productId.toString(16)}, using serial mode`);
        detectedRadioType = null;
        this.isHIDMode = false;
        this.isInDFUMode = false;  // Not in DFU mode
      }
      
      // Use user's selection if available, otherwise fall back to detected type or default
      if (userSelectedRadioType) {
        // User has explicitly selected a radio type - respect it
        this.radioType = userSelectedRadioType;
        
        // Warn if detected type differs from user selection (but don't override)
        if (detectedRadioType && detectedRadioType !== userSelectedRadioType) {
          console.warn(`VID/PID suggests ${detectedRadioType}, but using user-selected type: ${userSelectedRadioType}`);
        }
      } else if (detectedRadioType) {
        // No user selection - use detected type
        this.radioType = detectedRadioType;
      } else {
        // No user selection and couldn't detect - default to MK22
        this.radioType = CONFIG.RADIO_TYPES.MK22;
      }
      
      // Select configuration if needed
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }
      
      // Reset claimed interfaces list and interface/endpoint values
      // This ensures stale values from a previous connection don't persist
      this.claimedInterfaces = [];
      this.controlInterfaceNumber = null;
      this.interfaceNumber = 0;
      this.endpointIn = 1;
      this.endpointOut = 1;
      
      // DFU mode devices (STM32 DFU or MK22 bootloader) use different interface handling
      // - STM32 DFU: Uses USB control transfers, not bulk endpoints (class 0xFE = DFU)
      // - MK22 bootloader: Uses HID (class 0x03), which uses interrupt endpoints
      if (this.isInDFUMode) {
        console.log('DFU/Bootloader mode detected - using specialized interface handling');
        
        let interfaceClaimed = false;
        
        // Different handling for STM32 DFU vs MK22 HID bootloader
        if (this.isHIDMode) {
          // MK22 HID bootloader mode - find and claim HID interface
          // HID class is 0x03
          console.log('MK22 HID bootloader mode - looking for HID interface');
          
          let hidInterfaceFound = false;
          let claimError = null;
          
          for (const iface of this.device.configuration.interfaces) {
            for (const alternate of iface.alternates) {
              // HID class is 0x03
              if (alternate.interfaceClass === 0x03) {
                hidInterfaceFound = true;
                
                // Always extract the interface number and endpoint values from the HID interface
                // This ensures correct values even if claiming fails
                this.interfaceNumber = iface.interfaceNumber;
                
                // Find HID endpoints (interrupt type)
                for (const endpoint of alternate.endpoints) {
                  if (endpoint.direction === 'in') {
                    this.endpointIn = endpoint.endpointNumber;
                  } else if (endpoint.direction === 'out') {
                    this.endpointOut = endpoint.endpointNumber;
                  }
                }
                
                console.log(`Found HID interface ${iface.interfaceNumber} with endpoints IN:${this.endpointIn} OUT:${this.endpointOut}`);
                
                try {
                  await this.device.claimInterface(iface.interfaceNumber);
                  this.claimedInterfaces.push(iface.interfaceNumber);
                  
                  try {
                    await this.device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
                  } catch (e) {
                    console.warn(`Could not select HID alternate ${alternate.alternateSetting}:`, e.message);
                  }
                  
                  interfaceClaimed = true;
                  console.log(`Claimed HID interface ${iface.interfaceNumber} (class 0x${alternate.interfaceClass.toString(16)}) with endpoints IN:${this.endpointIn} OUT:${this.endpointOut}`);
                  break;
                } catch (e) {
                  claimError = e;
                  console.warn(`Could not claim HID interface ${iface.interfaceNumber}:`, e.message);
                }
              }
            }
            if (interfaceClaimed) break;
          }
          
          // For MK22 HID mode, we MUST be able to claim the interface
          // If we found the HID interface but couldn't claim it, throw a helpful error
          if (hidInterfaceFound && !interfaceClaimed) {
            const errorMsg = claimError ? claimError.message : 'Unknown error';
            throw new Error(
              `Could not claim MK22 HID interface: ${errorMsg}. ` +
              'The HID interface may be in use by the operating system. ' +
              'On Windows, use Zadig to install WinUSB driver for this device. ' +
              'On Linux, check udev rules or run with elevated privileges.'
            );
          }
        } else {
          // STM32 DFU mode - find and claim DFU interface for control transfers
          // DFU class is 0xFE (Application Specific), subclass 0x01 (DFU)
          console.log('STM32 DFU mode - looking for DFU interface');
          
          for (const iface of this.device.configuration.interfaces) {
            for (const alternate of iface.alternates) {
              if (alternate.interfaceClass === 0xFE) {
                try {
                  await this.device.claimInterface(iface.interfaceNumber);
                  this.claimedInterfaces.push(iface.interfaceNumber);
                  this.interfaceNumber = iface.interfaceNumber;
                  
                  try {
                    await this.device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
                  } catch (e) {
                    console.warn(`Could not select DFU alternate ${alternate.alternateSetting}:`, e.message);
                  }
                  
                  interfaceClaimed = true;
                  console.log(`Claimed DFU interface ${iface.interfaceNumber} (class 0x${alternate.interfaceClass.toString(16)})`);
                  break;
                } catch (e) {
                  console.warn(`Could not claim DFU interface ${iface.interfaceNumber}:`, e.message);
                }
              }
            }
            if (interfaceClaimed) break;
          }
          
          // STM32 DFU mode doesn't use bulk endpoints - set them to null
          // All communication is via USB control transfers
          this.endpointIn = null;
          this.endpointOut = null;
        }
        
        // Fallback: if no specialized interface found, try claiming interface 0
        if (!interfaceClaimed) {
          try {
            await this.device.claimInterface(0);
            this.claimedInterfaces.push(0);
            this.interfaceNumber = 0;
            console.log('Claimed default interface 0 for DFU/bootloader mode');
          } catch (e) {
            console.warn('Could not claim default interface 0:', e.message);
          }
        }
      } else {
        // Normal CPS/Serial mode - find bulk data interfaces
        // Find the data interface with bulk endpoints
        const dataInterface = this.findDataInterface();
        if (dataInterface) {
          this.interfaceNumber = dataInterface.interfaceNumber;
          this.endpointIn = dataInterface.endpointIn;
          this.endpointOut = dataInterface.endpointOut;
          
          // For CDC-ACM devices, we need to claim BOTH control and data interfaces
          // The control interface (if present) must be claimed first
          if (dataInterface.controlInterface && dataInterface.controlInterface.interfaceNumber !== dataInterface.interfaceNumber) {
            try {
              await this.device.claimInterface(dataInterface.controlInterface.interfaceNumber);
              this.claimedInterfaces.push(dataInterface.controlInterface.interfaceNumber);
              this.controlInterfaceNumber = dataInterface.controlInterface.interfaceNumber;
              console.log(`Claimed CDC control interface ${dataInterface.controlInterface.interfaceNumber}`);
            } catch (e) {
              // Control interface may already be claimed or not needed
              console.warn(`Could not claim control interface ${dataInterface.controlInterface.interfaceNumber}:`, e.message);
            }
          }
          
          // Claim the data interface
          await this.device.claimInterface(this.interfaceNumber);
          this.claimedInterfaces.push(this.interfaceNumber);
          console.log(`Claimed data interface ${this.interfaceNumber} with endpoints IN:${this.endpointIn} OUT:${this.endpointOut}`);
          
          // Select the alternate interface setting - required for endpoints to be active
          await this.device.selectAlternateInterface(this.interfaceNumber, dataInterface.alternateNumber);
        } else {
          // Fallback: try to claim all available interfaces and find usable endpoints
          console.warn('No bulk data interface found, attempting fallback interface detection');
          
          let claimed = false;
          for (const iface of this.device.configuration.interfaces) {
            try {
              await this.device.claimInterface(iface.interfaceNumber);
              this.claimedInterfaces.push(iface.interfaceNumber);
              console.log(`Claimed fallback interface ${iface.interfaceNumber}`);
              
              // Check if this interface has any endpoints we can use
              for (const alternate of iface.alternates) {
                let epIn = null;
                let epOut = null;
                
                for (const endpoint of alternate.endpoints) {
                  if (endpoint.direction === 'in' && !epIn) {
                    epIn = endpoint.endpointNumber;
                  } else if (endpoint.direction === 'out' && !epOut) {
                    epOut = endpoint.endpointNumber;
                  }
                }
                
                if (epIn && epOut) {
                  this.interfaceNumber = iface.interfaceNumber;
                  this.endpointIn = epIn;
                  this.endpointOut = epOut;
                  
                  try {
                    await this.device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
                  } catch (e) {
                    console.warn(`Could not select alternate ${alternate.alternateSetting}:`, e.message);
                  }
                  
                  claimed = true;
                  console.log(`Using interface ${iface.interfaceNumber} with endpoints IN:${epIn} OUT:${epOut}`);
                  break;
                }
              }
              
              if (claimed) break;
            } catch (e) {
              console.warn(`Could not claim interface ${iface.interfaceNumber}:`, e.message);
            }
          }
          
          if (!claimed) {
            // Last resort: use defaults
            try {
              await this.device.claimInterface(this.interfaceNumber);
              this.claimedInterfaces.push(this.interfaceNumber);
              await this.device.selectAlternateInterface(this.interfaceNumber, 0);
            } catch (e) {
              console.warn(`Could not claim default interface ${this.interfaceNumber}:`, e.message);
            }
          }
        }
        
        // Configure CDC-ACM serial line coding (baud rate 115200, 8N1)
        // This is required for proper communication with STM32 and CDC-ACM radios.
        // The OpenGD77 CPS uses 115200 baud (see decomp: OpenGD77Form.cs).
        // Only needed for serial mode, not DFU mode
        await this.setCDCLineCoding();
      }
      
      // Log device configuration for debugging
      this.logDeviceInfo();
      
      this.connected = true;
      this.radioModel = this.device.productName || (this.isFlashBasedRadio() ? 'TYT Radio' : 'OpenGD77');
      const modeStr = this.isInDFUMode ? 'DFU' : 'Serial';
      this.updateStatus('connected', `Connected: ${this.radioModel} (${this.radioType} ${modeStr})`);
      
      return true;
    } catch (error) {
      this.connected = false;
      
      // Provide more helpful error message for access denied errors
      if (error.message && error.message.includes('Access denied')) {
        this.updateStatus('disconnected', 'Connection failed: Access denied');
        throw new Error('Access denied. Ensure no other app is using the device. On Linux, check USB permissions (udev rules). On Windows, try installing WinUSB driver via Zadig.');
      }
      
      this.updateStatus('disconnected', 'Connection failed');
      throw error;
    }
  }

  /**
   * Log device information for debugging
   */
  logDeviceInfo() {
    if (!this.device) return;
    
    console.log('=== USB Device Info ===');
    console.log(`Product: ${this.device.productName}`);
    console.log(`Manufacturer: ${this.device.manufacturerName}`);
    console.log(`VID:PID: 0x${this.device.vendorId.toString(16).padStart(4, '0')}:0x${this.device.productId.toString(16).padStart(4, '0')}`);
    console.log(`Radio Type: ${this.radioType}`);
    console.log(`HID Mode: ${this.isHIDMode}`);
    console.log(`Active Interface: ${this.interfaceNumber}`);
    console.log(`Endpoints: IN=${this.endpointIn}, OUT=${this.endpointOut}`);
    console.log(`Claimed Interfaces: [${this.claimedInterfaces.join(', ')}]`);
    console.log(`CDC-ACM Baud Rate: ${this.isHIDMode ? 'N/A (HID mode)' : this.CDC_BAUD_RATE}`);
    console.log(`CDC-ACM Control Interface: ${this.controlInterfaceNumber !== null ? this.controlInterfaceNumber : 'N/A'}`);
    
    if (this.device.configuration) {
      console.log('Available Interfaces:');
      for (const iface of this.device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          const eps = alt.endpoints.map(ep => `${ep.direction}:${ep.endpointNumber}(${ep.type})`).join(', ');
          console.log(`  Interface ${iface.interfaceNumber} Alt ${alt.alternateSetting}: Class 0x${alt.interfaceClass.toString(16)} Endpoints: [${eps}]`);
        }
      }
    }
    console.log('=======================');
  }

  /**
   * Disconnect from the radio
   */
  async disconnect() {
    // Web Serial path: cancel the pending read, release locks and close the port.
    // Also handles the case where the port object was already cleared but a
    // reader/writer is still held (e.g. the radio was unplugged mid-session).
    if (this.serialPort || this.serialReader || this.serialWriter) {
      const reader = this.serialReader;
      const writer = this.serialWriter;
      const port = this.serialPort;
      this.serialReader = null; // stop the background read loop
      this.serialWriter = null;
      this.serialPort = null;
      try {
        // A pending reader.read() keeps the stream locked; cancel() resolves it
        // with {done:true} so releaseLock()/close() can succeed.
        if (reader) {
          try { await reader.cancel(); } catch (e) { /* ignore */ }
          try { reader.releaseLock(); } catch (e) { /* ignore */ }
        }
        if (this._serialReadLoop) {
          try {
            await Promise.race([
              this._serialReadLoop.catch(() => {}),
              new Promise((resolve) => setTimeout(resolve, 500))
            ]);
          } catch (e) { /* ignore */ }
        }
        if (writer) {
          try { writer.releaseLock(); } catch (e) { /* ignore */ }
        }
        if (port) {
          await port.close();
        }
      } catch (e) {
        console.warn('Web Serial disconnect warning:', e);
      }
      this.isSerialMode = false;
    }

    // WebHID path: close the HID device
    if (this.hidDevice) {
      try {
        await this.hidDevice.close();
      } catch (e) {
        console.warn('WebHID disconnect warning:', e);
      }
      this.hidDevice = null;
      this.useWebHID = false;
    }

    if (this.device) {
      try {
        // Release all claimed interfaces
        for (const ifaceNum of this.claimedInterfaces) {
          try {
            await this.device.releaseInterface(ifaceNum);
            console.log(`Released interface ${ifaceNum}`);
          } catch (e) {
            console.warn(`Could not release interface ${ifaceNum}:`, e.message);
          }
        }
        await this.device.close();
      } catch (e) {
        console.warn('Disconnect warning:', e);
      }
      this.device = null;
    }
    this.connected = false;
    this.isHIDMode = false;
    this.isInDFUMode = false;
    this.isSerialMode = false;
    this.useWebHID = false;
    // Drop any buffered bytes from the old radio so the next session starts clean.
    this._serialBuffer = [];
    this._serialReadError = null;
    this._serialReadLoop = null;
    this.claimedInterfaces = [];
    this.controlInterfaceNumber = null;
    this.updateStatus('disconnected', 'No Radio Connected');
  }

  /**
   * Tear down any transport left over from a previous session before opening a
   * new one. Without this, switching between radio types without reloading the
   * page leaves a stale serial port / reader / mode flag behind, so the next
   * session talks to the wrong transport (or to a port that is still open) and
   * every operation fails until the page is refreshed.
   */
  async _resetTransportState() {
    if (this.serialPort || this.serialReader || this.serialWriter ||
        this.device || this.hidDevice || this.connected) {
      this.debugMessage('Resetting transport state from previous session');
      await this.disconnect();
    }
    this.serialPort = null;
    this.serialWriter = null;
    this.serialReader = null;
    this.device = null;
    this.hidDevice = null;
    this.isSerialMode = false;
    this.isHIDMode = false;
    this.useWebHID = false;
    this.isInDFUMode = false;
    this.connected = false;
    this._serialBuffer = [];
    this._serialReadError = null;
    this._serialReadLoop = null;
    this.claimedInterfaces = [];
    this.controlInterfaceNumber = null;
    this.extendedChannelData = null;
  }

  /**
   * Update connection status
   */
  updateStatus(status, message) {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  /**
   * Report progress
   */
  reportProgress(percent, message = '') {
    if (this.onProgress) {
      this.onProgress(percent, message);
    }
  }

  /**
   * Run a radio operation exclusively, so it can never overlap another one.
   *
   * Web Serial / WebUSB give no ordering guarantee once two async operations
   * share the endpoint: a read issued by the boot-settings page can consume the
   * reply meant for the connect-time radio-info read, and the desynced stream
   * then fails every operation until the page is reloaded. Every method that
   * talks to the radio must go through this gate.
   *
   * @param {string} label - Human readable operation name (for debugging)
   * @param {Function} fn - Async operation to run
   */
  async _serialized(label, fn) {
    const previous = this._opChain;
    let release;
    this._opChain = new Promise((resolve) => { release = resolve; });

    // If another radio operation is still running, say so instead of appearing
    // to hang: the queued operation will start as soon as that one finishes.
    if (this._activeOp) {
      const waitingMessage = `Waiting for ${this._activeOp} to finish...`;
      this.debugMessage(`${waitingMessage} (queued: ${label || 'operation'})`);
      try {
        if (typeof Utils !== 'undefined' && Utils.toast) {
          Utils.toast(waitingMessage, 'info');
        }
      } catch (e) { /* ignore */ }
    }

    // Wait for whatever was queued before us (the chain never rejects).
    await previous.catch(() => {});
    const previousOp = this._activeOp;
    const previousBusy = this._busy;
    const previousBusyOp = this._busyOp;
    this._activeOp = label;
    this._busy = true;
    this._busyOp = label;
    if (label) this.debugMessage(`--- operation started: ${label} ---`);

    // Lock the UI for the duration of the transfer. Writes/flashes also block
    // section navigation; reads still allow browsing other pages.
    try {
      if (typeof window !== 'undefined' && window.App?.lockRadio) {
        const lc = String(label || '').toLowerCase();
        const isWrite = /(write|flash|restore|erase|program|save|upload)/.test(lc) && !lc.includes('read');
        window.App.lockRadio(isWrite ? 'write' : 'read');
      }
    } catch (e) { /* ignore */ }

    // Surface the whole operation in the bottom status bar. The label is an
    // internal name (e.g. "read satellite data"); make it readable for users.
    const prettyLabel = String(label || 'operation')
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      if (typeof window !== 'undefined' && window.App?.setActivity) {
        window.App.setActivity('busy', `Working: ${prettyLabel}...`);
      }
    } catch (e) { /* ignore */ }

    let opFailed = false;
    try {
      return await fn();
    } catch (err) {
      opFailed = true;
      throw err;
    } finally {
      this._activeOp = previousOp;
      this._busy = previousBusy;
      this._busyOp = previousBusyOp;
      if (label) this.debugMessage(`--- operation finished: ${label} ---`);
      try {
        if (typeof window !== 'undefined' && window.App?.setActivity) {
          window.App.setActivity(opFailed ? 'error' : 'idle');
          const statusEl = document.getElementById('statusMessage');
          if (!opFailed && statusEl && /^Working:/.test(statusEl.textContent)) {
            statusEl.textContent = 'Ready';
          }
        }
        if (typeof window !== 'undefined' && window.App?.lockRadio) {
          window.App.lockRadio(null);
        }
      } catch (e) { /* ignore */ }
      release();
    }
  }

  /**
   * Read one or more blocks from the OpenGD77 custom data area (SPI flash).
   * Reads the area once and returns a map of blockType -> payload.
   *
   * @param {number[]} blockTypes - Block types to extract (G77.CUSTOM_DATA_TYPE)
   * @returns {Promise<Object>} Map of blockType -> Uint8Array (missing types omitted)
   */
  async readCustomDataBlocks(blockTypes) {
    return this._serialized('read custom data', () => this._readCustomDataBlocksImpl(blockTypes));
  }

  async _readCustomDataBlocksImpl(blockTypes) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    const wanted = new Set(blockTypes || []);
    const result = {};

    this.debugMessage('=== READ CUSTOM DATA BLOCKS START ===');

    await this.initProtocol();

    const CUSTOM_DATA_SIZE = 0x11A0;  // 4512 bytes
    const CUSTOM_DATA_HEADER_SIZE = 12; // "OpenGD77" (8) + version (4)

    let customDataBuffer;

    if (this.useSerialProtocol()) {
      const customDataAddr = this.isFlashBasedRadio()
        ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET
        : 0x0;

      try {
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Boot Data');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);

        await this.delay(50);

        customDataBuffer = await this.readFlashOrEEPROM(
          customDataAddr, CUSTOM_DATA_SIZE, CONFIG.PROTOCOL.DATA_MODE.READ_FLASH
        );
      } finally {
        // Always leave CPS mode. If the read above throws, the radio would
        // otherwise stay stuck on the "Reading Boot Data" screen until it is
        // power-cycled. Best-effort: never mask the original error.
        try { await this.exitCpsMode(); } catch (e) { /* ignore */ }
      }
    } else {
      customDataBuffer = await this.readCodeplugData(0x0, CUSTOM_DATA_SIZE);
    }

    // Parse blocks
    let offset = CUSTOM_DATA_HEADER_SIZE;
    while (offset < customDataBuffer.length - 8) {
      const bType = customDataBuffer[offset];
      const bSize = customDataBuffer[offset + 4] |
                    (customDataBuffer[offset + 5] << 8) |
                    (customDataBuffer[offset + 6] << 16) |
                    (customDataBuffer[offset + 7] << 24) >>> 0;

      if (bType === 0xFF || bType === 0 || bSize === 0 || bSize > 0x10000) {
        break;
      }

      if (wanted.has(bType)) {
        result[bType] = customDataBuffer.slice(offset + 8, offset + 8 + bSize);
      }

      offset += 8 + bSize;
    }

    this.debugMessage('=== READ CUSTOM DATA BLOCKS COMPLETE ===');
    return result;
  }

  /**
   * Read the boot melody from the radio and return it as a "note,duration,..."
   * string (or null if no melody is stored).
   */
  async readBootMelody() {
    const blocks = await this.readCustomDataBlocks([2]); // BOOT_MELODY
    const data = blocks[2];
    if (!data) return null;

    const parts = [];
    for (let i = 0; i + 1 < data.length && i < 512; i += 2) {
      const note = data[i];
      const duration = data[i + 1];
      if (note === 0 && duration === 0) break;
      parts.push(note, duration);
    }
    return parts.join(',');
  }

  /**
   * Read the boot image (1024-byte 1bpp bitmap) from the radio, or null.
   */
  async readBootImage() {
    const blocks = await this.readCustomDataBlocks([1]); // BOOT_IMAGE
    const data = blocks[1];
    if (!data || data.length < 1024) return null;
    return data.slice(0, 1024);
  }

  /**
   * Send data to the radio
   */
  async sendData(data) {
    if (!this.connected || (!this.device && !this.hidDevice && !this.serialPort)) {
      throw new Error('Not connected to radio');
    }

    const inputData = data instanceof Uint8Array ? data : new Uint8Array(data);
    
    // Debug: Log the command being sent
    this.debugLog('SEND (raw command)', inputData);

    // Web Serial path (Baofeng DM-32 / UV-32 and other USB-to-serial adapters)
    if (this.isSerialMode && this.serialWriter) {
      this.debugMessage(`SEND mode: Web Serial (raw, ${inputData.length} bytes)`);
      try {
        await this.serialWriter.write(inputData);
      } catch (error) {
        this.debugMessage(`SEND ERROR (Web Serial): ${error.message}`);
        throw new Error('Send failed: ' + error.message);
      }
      return;
    }

    // WebHID path: use sendReport() for MK22 HID bootloader connected via WebHID
    if (this.useWebHID && this.hidDevice) {
      // WebHID sendReport(reportId, data) takes the payload WITHOUT the report ID.
      // MK22 HID bootloader protocol (from FirmwareLoader_MK22.cs SpecifiedOutputReport.SendData):
      //   buffer[0] = 1          (report ID - passed separately in WebHID)
      //   buffer[1] = 0          (reserved)
      //   buffer[2] = lenLow     (data length low byte)
      //   buffer[3] = lenHigh    (data length high byte)
      //   buffer[4+] = data      (command/firmware data)
      // 
      // CRITICAL: The payload size MUST match the HID descriptor's OutputReportByteLength.
      // C# code uses OutputReportLength from device (HidCaps.OutputReportByteLength).
      // We calculate this from the HID items, or default to MK22_BOOTLOADER_PAYLOAD_SIZE.
      
      // Named constants for HID payload sizes
      const STANDARD_HID_PAYLOAD_SIZE = 63;      // 64-byte reports minus 1-byte report ID
      const MK22_BOOTLOADER_PAYLOAD_SIZE = 36;   // Common MK22 bootloader payload size
      const HID_HEADER_SIZE = 3;                 // reserved(1) + lenLow(1) + lenHigh(1)
      
      // Use discovered report ID, prefer ID 1 (C# code: buffer[0] = 1)
      const reportId = this.hidOutputReportId !== undefined ? this.hidOutputReportId : 1;
      
      // Get the payload size from the HID descriptor, or use a default
      // MK22 bootloader typically uses 36-byte payload (37 total with report ID)
      // Some devices may use 64-byte reports (63 payload + 1 report ID)
      // The size is calculated during connection from the device's HID descriptor
      let payloadSize;
      if (this.hidOutputReportSizes && this.hidOutputReportSizes[reportId] !== undefined) {
        // Use the exact size from the HID descriptor for this report ID
        payloadSize = this.hidOutputReportSizes[reportId];
      } else {
        // Default to MK22 bootloader payload size
        // This matches the data packet size in FirmwareLoader_MK22.cs (38-byte packets include header)
        payloadSize = MK22_BOOTLOADER_PAYLOAD_SIZE;
      }
      
      // Build the payload WITHOUT the report ID (WebHID adds it separately)
      // Structure: [reserved=0, lenLow, lenHigh, data..., padding]
      const hidPayload = new Uint8Array(payloadSize);
      hidPayload[0] = 0;  // Reserved
      hidPayload[1] = inputData.length & 0xFF;  // Length low byte
      hidPayload[2] = (inputData.length >> 8) & 0xFF;  // Length high byte
      
      // Copy data - warn if truncation is needed (shouldn't happen with proper MK22 protocol)
      const maxDataSize = payloadSize - HID_HEADER_SIZE;
      if (inputData.length > maxDataSize) {
        console.warn(`[WebHID] Data truncation: ${inputData.length} bytes > max ${maxDataSize} bytes for payload size ${payloadSize}`);
      }
      const dataToCopy = inputData.length <= maxDataSize ? inputData : inputData.slice(0, maxDataSize);
      hidPayload.set(dataToCopy, HID_HEADER_SIZE);  // Data starts at offset 3
      
      this.debugLog('SEND (WebHID report payload)', hidPayload);
      this.debugMessage(`SEND mode: WebHID sendReport (reportId=${reportId}, ${payloadSize}-byte payload)`);
      
      try {
        await this.hidDevice.sendReport(reportId, hidPayload);
        this.debugMessage('SEND: WebHID transfer completed successfully');
        return;
      } catch (error) {
        // If the send fails, try alternative report IDs and/or payload sizes
        this.debugMessage(`SEND ERROR (WebHID) with reportId=${reportId}, size=${payloadSize}: ${error.message}`);
        
        // Build list of alternatives: discovered report IDs + standard fallbacks
        const allReportIds = new Set([
          ...Object.keys(this.hidOutputReportSizes || {}).map(Number),
          ...this.HID_FALLBACK_REPORT_IDS
        ]);
        const alternativeIds = Array.from(allReportIds).filter(id => id !== reportId);
        
        for (const altId of alternativeIds) {
          // Get the correct payload size for this alternative report ID
          let altPayloadSize;
          if (this.hidOutputReportSizes && this.hidOutputReportSizes[altId] !== undefined) {
            altPayloadSize = this.hidOutputReportSizes[altId];
          } else {
            // Use standard sizes based on report ID convention
            altPayloadSize = altId === 0 ? STANDARD_HID_PAYLOAD_SIZE : MK22_BOOTLOADER_PAYLOAD_SIZE;
          }
          
          // Build payload with correct size
          const altPayload = new Uint8Array(altPayloadSize);
          altPayload[0] = 0;  // Reserved
          altPayload[1] = inputData.length & 0xFF;
          altPayload[2] = (inputData.length >> 8) & 0xFF;
          const altMaxDataSize = altPayloadSize - HID_HEADER_SIZE;
          if (inputData.length > altMaxDataSize) {
            this.debugMessage(`[WebHID] Data truncation for alt report: ${inputData.length} > ${altMaxDataSize} bytes`);
          }
          const altDataToCopy = inputData.length <= altMaxDataSize ? inputData : inputData.slice(0, altMaxDataSize);
          altPayload.set(altDataToCopy, HID_HEADER_SIZE);
          
          try {
            this.debugMessage(`Retrying with reportId=${altId}, size=${altPayloadSize}...`);
            await this.hidDevice.sendReport(altId, altPayload);
            this.debugMessage(`SEND: WebHID transfer succeeded with reportId=${altId}, size=${altPayloadSize}`);
            // Update stored settings for future sends
            this.hidOutputReportId = altId;
            this.hidOutputReportSizes[altId] = altPayloadSize;
            return;
          } catch (retryError) {
            this.debugMessage(`SEND ERROR with reportId=${altId}, size=${altPayloadSize}: ${retryError.message}`);
          }
        }
        
        // All report IDs failed - try one more time with common 64-byte size
        // Some devices don't properly report their descriptor but accept 64-byte reports
        const lastResortPayload = new Uint8Array(STANDARD_HID_PAYLOAD_SIZE);
        lastResortPayload[0] = 0;
        lastResortPayload[1] = inputData.length & 0xFF;
        lastResortPayload[2] = (inputData.length >> 8) & 0xFF;
        const lastResortMaxData = STANDARD_HID_PAYLOAD_SIZE - HID_HEADER_SIZE;
        lastResortPayload.set(inputData.slice(0, Math.min(inputData.length, lastResortMaxData)), HID_HEADER_SIZE);
        
        for (const lastId of [1, 2, 0]) {  // Try most common IDs with 64-byte size
          try {
            this.debugMessage(`Last resort: reportId=${lastId}, size=${STANDARD_HID_PAYLOAD_SIZE}...`);
            await this.hidDevice.sendReport(lastId, lastResortPayload);
            this.debugMessage(`SEND: WebHID transfer succeeded with reportId=${lastId}, size=${STANDARD_HID_PAYLOAD_SIZE}`);
            this.hidOutputReportId = lastId;
            this.hidOutputReportSizes[lastId] = STANDARD_HID_PAYLOAD_SIZE;
            return;
          } catch (e) {
            // Continue to next
          }
        }
        
        // All attempts failed
        throw new Error('Send failed: ' + error.message + '. Tried multiple report IDs and payload sizes.');
      }
    }
    
    let buffer;
    
    if (this.isHIDMode) {
      // HID bootloader mode requires header wrapper and fixed 64-byte report size:
      // [reportId=1, reserved=0, lengthLow, lengthHigh, ...data]
      buffer = new Uint8Array(64);
      if (inputData.length > 60) {
        throw new Error(`HID payload too large: ${inputData.length} bytes (max 60)`);
      }
      buffer[0] = 1;  // Report ID
      buffer[1] = 0;  // Reserved
      buffer[2] = inputData.length & 0xFF;  // Length low byte
      buffer[3] = (inputData.length >> 8) & 0xFF;  // Length high byte
      buffer.set(inputData, 4);  // Data starts at offset 4
      this.debugMessage(`SEND mode: HID (with 4-byte header, 64-byte report)`);
    } else {
      // CDC-ACM serial mode - send only the exact data bytes, not a padded buffer
      // This matches the C# implementation: commPort.Write(buffer, 0, 32)
      // The radio firmware expects exact byte counts for serial protocol
      buffer = inputData;
      this.debugMessage(`SEND mode: CDC-ACM serial (raw, ${buffer.length} bytes)`);
    }
    
    this.debugLog('SEND (USB buffer)', buffer);
    this.debugMessage(`SEND endpoint: ${this.endpointOut}, length: ${buffer.length} bytes`);
    
    try {
      await this.device.transferOut(this.endpointOut, buffer);
      this.debugMessage('SEND: Transfer completed successfully');
    } catch (error) {
      this.debugMessage(`SEND ERROR: ${error.message}`);
      throw new Error('Send failed: ' + error.message);
    }
  }

  /**
   * Receive data from the radio
   * For CDC-ACM serial mode, may need multiple reads to get complete response
   * Matches C# pattern: polls BytesToRead for up to 100 iterations with 5ms sleep
   * @param {number} timeout - Maximum time to wait for data in milliseconds (default 5000)
   * @param {number} expectedMinBytes - Minimum number of bytes expected (for CDC-ACM accumulation)
   */
  async receiveData(timeout = 5000, expectedMinBytes = 2) {
    if (!this.connected || (!this.device && !this.hidDevice && !this.serialPort)) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage(`RECV: Waiting for data...`);

    // Web Serial path (Baofeng DM-32 / UV-32 and other serial adapters)
    if (this.isSerialMode && this.serialReader) {
      return await this._receiveSerial(timeout, expectedMinBytes);
    }
    
    try {
      // WebHID path: use inputreport event for MK22 HID bootloader connected via WebHID
      if (this.useWebHID && this.hidDevice) {
        // WebHID delivers input reports via events. _receiveWebHIDReport() wraps this in a Promise.
        // event.data is the report payload WITHOUT the report ID:
        //   [reserved=0, lenLow, lenHigh, data...] (63 bytes for MK22)
        // Strip the 3-byte header (reserved + lenLow + lenHigh) to get the actual payload.
        const HID_HEADER_SIZE = 3;  // reserved(1) + lenLow(1) + lenHigh(1), excluding report ID
        const data = await this._receiveWebHIDReport(timeout);
        const strippedData = data.slice(HID_HEADER_SIZE);
        this.debugLog('RECV (WebHID after header strip)', strippedData);
        this.debugMessage(`RECV mode: WebHID inputreport (stripped 3-byte header)`);
        return strippedData;
      }

      if (this.isHIDMode) {
        // HID mode: single transfer returns fixed-size report
        const result = await this.device.transferIn(this.endpointIn, 64);
        const rawData = new Uint8Array(result.data.buffer);
        
        this.debugLog('RECV (raw USB response)', rawData);
        this.debugMessage(`RECV: Got ${rawData.length} bytes, status: ${result.status}`);
        
        // HID bootloader mode: response has header [reportId, reserved, lenLow, lenHigh, ...data]
        // Strip the first 4 bytes to get actual data
        const strippedData = rawData.slice(4);
        this.debugLog('RECV (after HID header strip)', strippedData);
        this.debugMessage(`RECV mode: HID (stripped 4-byte header)`);
        return strippedData;
      } else {
        // CDC-ACM serial mode - data may arrive in multiple transfers
        // C# decompiled pattern: poll BytesToRead for up to 100 iterations with 5ms delay,
        // then read all available bytes in one shot: port.Read(buffer, 0, port.BytesToRead)
        // WebUSB doesn't have BytesToRead, so we do a single transferIn with timeout,
        // then accumulate if we haven't received enough data yet.
        const accumulated = [];
        const startTime = Date.now();
        // C# uses 100 retries with 5ms sleep = 500ms max polling time
        const maxRetries = 100;
        let retries = 0;
        let consecutiveErrors = 0;
        
        // Special case: if expectedMinBytes is 0, we're just trying to discard/read any pending data
        const isDiscardMode = expectedMinBytes === 0;
        const effectiveMinBytes = isDiscardMode ? 1 : expectedMinBytes;
        
        while (retries < maxRetries) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= timeout) {
            this.debugMessage(`RECV: Timeout after ${elapsed}ms`);
            break;
          }
          
          try {
            // Add per-transfer timeout to prevent transferIn from blocking indefinitely
            // C# uses BytesToRead polling which never blocks; WebUSB transferIn can block
            const remaining = timeout - (Date.now() - startTime);
            if (remaining <= 0) break;
            const transferTimeout = Math.min(500, remaining);
            const timeoutError = new Error(`WebUSB transferIn timeout after ${transferTimeout}ms on endpoint ${this.endpointIn}`);
            timeoutError.isPollingTimeout = true;
            const result = await Promise.race([
              this.device.transferIn(this.endpointIn, 64),
              new Promise((_, reject) => setTimeout(() => reject(timeoutError), transferTimeout))
            ]);
            const rawData = new Uint8Array(result.data.buffer);
            consecutiveErrors = 0; // Reset error counter on success
            
            if (rawData.length > 0) {
              this.debugLog(`RECV (raw USB response, read ${retries + 1})`, rawData);
              this.debugMessage(`RECV: Got ${rawData.length} bytes, status: ${result.status}`);
              
              for (let i = 0; i < rawData.length; i++) {
                accumulated.push(rawData[i]);
              }
              
              if (accumulated.length >= effectiveMinBytes) {
                const responseData = new Uint8Array(accumulated);
                this.debugLog('RECV (accumulated CDC-ACM data)', responseData);
                this.debugMessage(`RECV mode: CDC-ACM serial (accumulated ${responseData.length} bytes)`);
                return responseData;
              }
            }
            
            // In discard mode, return after first successful read
            if (isDiscardMode && retries >= 1) {
              return new Uint8Array(accumulated);
            }
            
            retries++;
            await new Promise(resolve => setTimeout(resolve, 5));
          } catch (transferError) {
            // Distinguish between polling timeouts (expected during normal operation)
            // and actual USB errors (device disconnected, transfer stalled, etc.)
            // Polling timeouts from Promise.race() are tagged with isPollingTimeout
            // and should not count toward the consecutive error limit.
            const isPollingTimeout = transferError.isPollingTimeout === true;
            if (!isPollingTimeout) {
              consecutiveErrors++;
            }
            
            // In discard mode, any error means no data pending - return immediately
            if (isDiscardMode) {
              return new Uint8Array(accumulated);
            }
            
            // If we already have data and get an error, return what we have
            if (accumulated.length > 0) {
              this.debugMessage(`RECV: Transfer error after accumulating ${accumulated.length} bytes, returning data`);
              const responseData = new Uint8Array(accumulated);
              this.debugLog('RECV (partial CDC-ACM data)', responseData);
              return responseData;
            }
            
            // Stop after 3 consecutive real USB errors to avoid crashing the USB connection
            // The device may have disconnected or be in an error state
            // Polling timeouts are excluded from this count since they're normal
            if (consecutiveErrors >= 3) {
              this.debugMessage(`RECV: ${consecutiveErrors} consecutive USB errors, stopping`);
              break;
            }
            
            if (retries % 10 === 0) {
              this.debugMessage(`RECV: Transfer attempt ${retries + 1} - ${transferError.message}`);
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
        
        // Return whatever we accumulated
        const responseData = new Uint8Array(accumulated);
        this.debugLog('RECV (final CDC-ACM data)', responseData);
        this.debugMessage(`RECV mode: CDC-ACM serial (final ${responseData.length} bytes after ${retries} retries)`);
        return responseData;
      }
    } catch (error) {
      this.debugMessage(`RECV ERROR: ${error.message}`);
      throw new Error('Receive failed: ' + error.message);
    }
  }

  /**
   * Initialize communication protocol
   * For HID bootloader mode (MK22 only): Uses PROGRA bootloader command sequence
   * For CDC-ACM serial mode (both MK22 and STM32): Uses OpenGD77 serial protocol
   * 
   * Based on OpenGD77Form.cs worker_DoWork():
   * The CPS opens the serial port and directly sends sendCommand(0) to enter CPS mode.
   * If the radio is running OpenGD77 firmware, it responds with ACK and enters CPS screen.
   * No wake-up or special handshake is needed for the serial protocol.
   * 
   * Protocol selection is based on communication MODE (HID vs CDC-ACM), NOT radio type:
   * - CDC-ACM (0x1FC9:0x0094): Both MK22 and STM32 use the same OpenGD77 serial protocol
   * - HID (0x15A2:0x0073): MK22 bootloader uses PROGRA command sequence
   */
  async initProtocol() {
    // Use CDC-ACM serial protocol for non-HID mode (applies to BOTH MK22 and STM32)
    // The protocol is the same regardless of radioType when in CDC-ACM serial mode
    if (!this.isHIDMode) {
      this.debugMessage('=== CDC-ACM SERIAL INIT PROTOCOL START ===');
      this.debugMessage(`Radio type: ${this.radioType}, HID mode: ${this.isHIDMode}`);
      this.debugMessage(`CDC-ACM baud rate: ${this.CDC_BAUD_RATE}`);
      this.debugMessage(`USB buffer size: ${this.usbBufferSize} bytes`);

      // A previous operation may have left stale bytes in the serial buffer
      // (an interrupted/aborted command). Drop them so the command-0 response
      // isn't mistaken for a leftover.
      if (Array.isArray(this._serialBuffer) && this._serialBuffer.length > 0) {
        this.debugMessage(`Discarding ${this._serialBuffer.length} stale byte(s) before init`);
        this._serialBuffer.length = 0;
      }

      const maxRetries = 3;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        this.debugMessage(`=== Init attempt ${attempt}/${maxRetries} ===`);
        
        try {
          // C# OpenGD77Form.cs: if (!sendCommand(0)) { error... }
          // Command 0 enters CPS mode - the radio shows the CPS screen
          // This is the FIRST and ONLY init command needed
          this.debugMessage('Sending CPS mode command 0...');
          const success = await this.sendSTM32Command(0);
          
          if (success) {
            this.debugMessage('=== CDC-ACM SERIAL INIT PROTOCOL SUCCESS (radio in CPS mode) ===');
            return new Uint8Array(8);
          }
          
          lastError = new Error(`Serial initialization failed: Command 0 not acknowledged (attempt ${attempt}/${maxRetries})`);
          this.debugMessage(`Attempt ${attempt} failed: Command not acknowledged`);
          
        } catch (e) {
          lastError = e;
          this.debugMessage(`Attempt ${attempt} failed: ${e.message}`);
        }
        
        // Wait before retrying
        if (attempt < maxRetries) {
          this.debugMessage(`Waiting 500ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      this.debugMessage('=== CDC-ACM SERIAL INIT FAILED (all retries exhausted) ===');
      if (!lastError) {
        lastError = new Error('Serial initialization failed after all retry attempts. Ensure the radio is powered on and connected properly.');
      }
      throw lastError;
      
    } else {
      // MK22 HID bootloader mode uses PROGRA bootloader command sequence
      this.debugMessage('=== MK22 HID BOOTLOADER INIT PROTOCOL START ===');
      // Send PROGRA command
      await this.sendData(this.CMD_PRG);
      let response = await this.receiveData();
      
      if (response[0] !== this.CMD_ACK) {
        throw new Error('Device did not acknowledge PROGRA command');
      }
      
      // Send second part of init
      await this.sendData(this.CMD_PRG2);
      response = await this.receiveData();
      
      // Extract model info from response (first 8 bytes)
      const modelInfo = response.slice(0, 8);
      
      // Send ACK
      await this.sendData(new Uint8Array([this.CMD_ACK]));
      response = await this.receiveData();
      
      if (response[0] !== this.CMD_ACK) {
        throw new Error('Device did not complete handshake');
      }
      
      this.debugMessage('=== MK22 HID BOOTLOADER INIT PROTOCOL SUCCESS ===');
      return modelInfo;
    }
  }

  /**
   * Read codeplug from radio
   * Automatically uses the correct protocol based on radio type and connection mode:
   * - MK22 HID mode: Uses page-based addressing with CWB command (bootloader protocol)
   * - MK22 CDC-ACM serial mode: Uses OpenGD77 serial protocol with EEPROM/Flash modes
   * - STM32: Uses OpenGD77 serial protocol with readFlashOrEEPROM
   */
  async readCodeplug(onProgress) {
    return this._serialized('read codeplug', () => this._readCodeplugImpl(onProgress));
  }

  async _readCodeplugImpl(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== READ CODEPLUG OPERATION START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);
    this.debugMessage(`Interface: ${this.interfaceNumber}`);
    this.debugMessage(`Endpoint IN: ${this.endpointIn}, Endpoint OUT: ${this.endpointOut}`);
    
    this.reportProgress(0, 'Initializing...');
    
    try {
      // Initialize protocol
      this.debugMessage('Calling initProtocol...');
      await this.initProtocol();
      this.debugMessage('initProtocol completed successfully');
      
      // Protocol selection based on connection mode and radio type:
      // - HID mode (bootloader): Uses page-based CWB protocol (MK22 only)
      // - CDC-ACM serial mode: Uses OpenGD77 serial protocol (both MK22 and STM32)
      if (this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 HID bootloader mode uses page-based CWB protocol
        this.debugMessage('Using MK22 HID bootloader codeplug read path (page-based CWB protocol)');
        return await this.readCodeplugMK22HID(onProgress);
      } else if (!this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 CDC-ACM serial mode uses serial protocol with EEPROM/Flash modes
        // Based on READ_CODEPLUG case in OpenGD77Form.cs
        this.debugMessage('Using MK22 CDC-ACM serial codeplug read path');
        return await this.readCodeplugMK22Serial(onProgress);
      } else {
        // STM32 radios use OpenGD77 serial protocol (CDC-ACM or DFU)
        // Based on READ_CODEPLUG case in OpenGD77Form.cs
        this.debugMessage('Using STM32 codeplug read path');
        return await this.readCodeplugSTM32(onProgress);
      }
      
    } catch (error) {
      this.debugMessage(`=== READ CODEPLUG FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Read failed');
      throw error;
    }
  }

  /**
   * Read codeplug from MK22 radio in HID bootloader mode (GD-77, DM-1801, RD-5R)
   * Uses page-based addressing with CWB command and 16-bit addresses
   * This protocol is only used when the radio is in HID bootloader mode (VID 0x15A2)
   */
  async readCodeplugMK22HID(onProgress) {
    // Read codeplug data
    const startAddress = CONFIG.PROTOCOL.CODEPLUG_START;
    const transferLength = CONFIG.PROTOCOL.CODEPLUG_END - CONFIG.PROTOCOL.CODEPLUG_START;
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    
    const numBlocks = transferLength / blockSize;
    const startBlock = startAddress / blockSize;
    let currentPage = -1;
    
    this.commsBuffer.fill(0);
    
    for (let block = startBlock; block < startBlock + numBlocks; block++) {
      const address = block * blockSize;
      
      // Check if we need to switch pages
      const page = Math.floor(address / bankSize);
      if (page !== currentPage) {
        currentPage = page;
        const pageAddr = page * bankSize;
        
        // Send CWB command to set page
        const cwbCmd = new Uint8Array([
          0x43, 0x57, 0x42, 0x04, // 'CWB' + length
          (pageAddr >> 24) & 0xFF,
          (pageAddr >> 16) & 0xFF,
          (pageAddr >> 8) & 0xFF,
          pageAddr & 0xFF
        ]);
        
        await this.sendData(cwbCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Page switch failed');
        }
      }
      
      // Read block
      const addr16 = address & 0xFFFF;
      const readCmd = new Uint8Array([
        0x52, // 'R' - Read command
        (addr16 >> 8) & 0xFF,
        addr16 & 0xFF,
        blockSize
      ]);
      
      await this.sendData(readCmd);
      const data = await this.receiveData();
      
      // Validate response header matches request (C# CodeplugComms.cs smethod_18 check)
      // The radio echoes back the 4-byte read command as the response header
      if (data[0] !== readCmd[0] || data[1] !== readCmd[1] ||
          data[2] !== readCmd[2] || data[3] !== readCmd[3]) {
        throw new Error(`Read validation failed at address 0x${address.toString(16)}: ` +
          `expected header [${Array.from(readCmd).map(b => '0x' + b.toString(16).padStart(2, '0')).join(',')}], ` +
          `got [${Array.from(data.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(',')}]`);
      }
      
      // Copy data to buffer (skip first 4 bytes header)
      this.commsBuffer.set(data.slice(4, 4 + blockSize), address);
      
      // Report progress
      const progress = ((block - startBlock + 1) / numBlocks) * 100;
      this.reportProgress(progress, `Reading: ${Math.round(progress)}%`);
      
      if (onProgress) {
        onProgress(progress);
      }
    }
    
    // Send END READ
    await this.sendData(this.CMD_ENDR);
    await this.receiveData();
    
    this.reportProgress(100, 'Read complete');
    
    return this.commsBuffer.slice(0, transferLength);
  }

  /**
   * Read codeplug from MK22 radio in CDC-ACM serial mode (GD-77, DM-1801, RD-5R)
   * Uses OpenGD77 serial protocol with EEPROM/Flash data modes
   * Based on READ_CODEPLUG case in OpenGD77Form.cs
   * 
   * Key differences from STM32:
   * - MK22 uses DataModeReadEEPROM (2) for segments 1 & 2 (real EEPROM)
   * - MK22 uses DataModeReadFlash (1) for segments 3 & 4 (SPI Flash)
   * - No STM32_FLASH_ADDRESS_OFFSET needed for MK22
   */
  async readCodeplugMK22Serial(onProgress) {
    this.debugMessage('=== MK22 SERIAL READ CODEPLUG START ===');
    
    const transferLength = CONFIG.PROTOCOL.CODEPLUG_END - CONFIG.PROTOCOL.CODEPLUG_START;
    const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;   // 1
    const DATA_MODE_READ_EEPROM = CONFIG.PROTOCOL.DATA_MODE.READ_EEPROM; // 2
    
    this.debugMessage(`Transfer length: ${transferLength} bytes`);
    
    // C# OpenGD77Form.cs READ_CODEPLUG case:
    // After sendCommand(0) succeeds (done in initProtocol), send display commands:
    this.debugMessage('Sending CPS display/setup commands...');
    await this.sendSTM32Command(1);                               // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS'); // Line 1: "OpenGD77 WebCPS"
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');   // Line 2: "Reading"
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Codeplug');  // Line 3: "Codeplug"
    await this.sendSTM32Command(3);                               // Render screen
    await this.sendSTM32Command(6, 3);                            // Flash green LED
    await this.sendSTM32Command(6, 2);                            // Save settings and VFOs
    
    // Small delay to ensure command responses are fully processed before bulk read
    await this.delay(50);
    
    this.debugMessage('CPS display/setup commands complete');
    
    // Codeplug segment addresses (from OpenGD77Form.cs READ_CODEPLUG for MK22)
    // MK22 uses real EEPROM and SPI Flash, not emulated flash
    const SEGMENT1_START = 0x80;          // 128 - buffer start position
    const SEGMENT1_END = 0x6000;          // 24576 - buffer end position
    const SEGMENT2_START = 0x7500;        // 29952 - buffer start position
    const SEGMENT2_END = 0xB000;          // 45056 - buffer end position
    const CODEPLUG_FLASH_PART_START = 0xB000;  // 45056 - buffer position for channels 129+, zones, contacts, TG lists
    const CODEPLUG_FLASH_PART_END = 0x1EE60;   // 126560 - end of codeplug data
    const CUSTOM_DATA_START = 0x1EE60;    // 126560 - custom data (boot image, melody, theme)
    const CUSTOM_DATA_END = 0x20000;      // 131072 - end of codeplug buffer
    const FLASH_BASE_ADDR = 0x7B000;      // 503808 - base address of codeplug data in SPI Flash
    
    this.debugMessage('Segment addresses (from OpenGD77Form.cs READ_CODEPLUG for MK22):');
    this.debugMessage(`  Segment 1: buffer 0x${SEGMENT1_START.toString(16)} - 0x${SEGMENT1_END.toString(16)} (${SEGMENT1_END - SEGMENT1_START} bytes) mode=EEPROM(2)`);
    this.debugMessage(`  Segment 2: buffer 0x${SEGMENT2_START.toString(16)} - 0x${SEGMENT2_END.toString(16)} (${SEGMENT2_END - SEGMENT2_START} bytes) mode=EEPROM(2)`);
    this.debugMessage(`  Segment 3: buffer 0x${CODEPLUG_FLASH_PART_START.toString(16)} - 0x${CODEPLUG_FLASH_PART_END.toString(16)} from radio 0x${FLASH_BASE_ADDR.toString(16)} mode=Flash(1)`);
    this.debugMessage(`  Segment 4: buffer 0x${CUSTOM_DATA_START.toString(16)} - 0x${CUSTOM_DATA_END.toString(16)} from radio 0x0 mode=Flash(1)`);
    
    this.commsBuffer.fill(0);
    
    // Segment 1: EEPROM (0x80 - 0x6000)
    // C# for MK22: dataObj.mode = DataModeReadEEPROM; startDataAddressInTheRadio = 0x0080
    // Contains channels 1-128, general settings, DTMF, APRS, scan lists, etc.
    this.debugMessage('=== Reading Segment 1 (MK22 EEPROM) ===');
    this.reportProgress(5, 'Reading segment 1...');
    const segment1Data = await this.readFlashOrEEPROM(SEGMENT1_START, SEGMENT1_END - SEGMENT1_START, DATA_MODE_READ_EEPROM, (p) => {
      this.reportProgress(5 + (p * 0.20), `Reading: ${Math.round(5 + (p * 0.20))}%`);
    });
    this.commsBuffer.set(segment1Data, SEGMENT1_START);
    this.debugMessage(`Segment 1 complete: Got ${segment1Data.length} bytes`);
    
    // Segment 2: EEPROM (0x7500 - 0xB000)
    // C# for MK22: dataObj.mode = DataModeReadEEPROM; startDataAddressInTheRadio = 0x7500
    // Contains boot settings, VFO A, VFO B
    this.debugMessage('=== Reading Segment 2 (MK22 EEPROM) ===');
    this.reportProgress(25, 'Reading segment 2...');
    const segment2Data = await this.readFlashOrEEPROM(SEGMENT2_START, SEGMENT2_END - SEGMENT2_START, DATA_MODE_READ_EEPROM, (p) => {
      this.reportProgress(25 + (p * 0.15), `Reading: ${Math.round(25 + (p * 0.15))}%`);
    });
    this.commsBuffer.set(segment2Data, SEGMENT2_START);
    this.debugMessage(`Segment 2 complete: Got ${segment2Data.length} bytes`);
    
    // Segment 3: SPI Flash codeplug area (channels 129+, zones, contacts, TG lists)
    // C# for MK22: dataObj.mode = DataModeReadFlash; startDataAddressInTheRadio = 0x7B000
    // This segment contains extended channels (banks 1-7), zone data, contacts, RX group lists (TG lists)
    this.debugMessage('=== Reading Segment 3 (MK22 SPI Flash - extended channels, zones, contacts, TG lists) ===');
    const segment3Length = CODEPLUG_FLASH_PART_END - CODEPLUG_FLASH_PART_START;
    this.debugMessage(`Segment 3: Reading ${segment3Length} bytes from radio address 0x${FLASH_BASE_ADDR.toString(16)} using Flash mode`);
    this.reportProgress(40, 'Reading Flash segment 3...');
    const segment3Data = await this.readFlashOrEEPROM(FLASH_BASE_ADDR, segment3Length, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(40 + (p * 0.35), `Reading Flash: ${Math.round(40 + (p * 0.35))}%`);
    });
    this.commsBuffer.set(segment3Data, CODEPLUG_FLASH_PART_START);
    this.debugMessage(`Segment 3 complete: Got ${segment3Data.length} bytes`);
    
    // Segment 4: OpenGD77 custom data in SPI Flash (boot image, melody, theme)
    // C# for MK22: dataObj.mode = DataModeReadFlash; startDataAddressInTheRadio = 0x0
    this.debugMessage('=== Reading Segment 4 (MK22 Custom Data in SPI Flash) ===');
    const segment4Length = CUSTOM_DATA_END - CUSTOM_DATA_START;
    this.debugMessage(`Segment 4: Reading ${segment4Length} bytes from radio address 0x0 using Flash mode`);
    this.reportProgress(75, 'Reading Flash segment 4 (custom data)...');
    const segment4Data = await this.readFlashOrEEPROM(0, segment4Length, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(75 + (p * 0.20), `Reading Flash: ${Math.round(75 + (p * 0.20))}%`);
    });
    this.commsBuffer.set(segment4Data, CUSTOM_DATA_START);
    this.debugMessage(`Segment 4 complete: Got ${segment4Data.length} bytes`);
    
    // C# OpenGD77Form.cs: sendCommand(5) - close CPS screen on radio
    this.debugMessage('Sending close CPS screen command...');
    await this.exitCpsMode();

    this.debugMessage('=== MK22 SERIAL READ CODEPLUG COMPLETE ===');
    this.debugMessage(`Total bytes read: ${transferLength}`);
    this.reportProgress(100, 'Read complete');
    
    return this.commsBuffer.slice(0, transferLength);
  }

  /**
   * Read codeplug from STM32 radio (TYT MD-UV380, MD-9600, etc.)
   * Uses OpenGD77 serial protocol with 32-bit addressing and data modes
   * Based on decompiled READ_CODEPLUG case in OpenGD77Form.cs
   * 
   * Key differences from old source for STM32:
   * - STM32 uses DataModeReadFlash (1) for ALL segments (not EEPROM mode)
   * - Flash addresses require STM32_FLASH_ADDRESS_OFFSET (0x20000) added
   * - Close sequence sends command 5 then command 7
   */
  async readCodeplugSTM32(onProgress) {
    this.debugMessage('=== STM32 READ CODEPLUG START ===');
    
    const transferLength = CONFIG.PROTOCOL.CODEPLUG_END - CONFIG.PROTOCOL.CODEPLUG_START;
    const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;   // 1
    const DATA_MODE_READ_EEPROM = CONFIG.PROTOCOL.DATA_MODE.READ_EEPROM; // 2
    
    // STM32 flash address offset - the EEPROM is emulated in flash starting at this offset
    // C#: STM32_FLASH_ADDRESS_OFFSET = FLASH_MEMORY_EEPROM_EMU_SIZE = 131072 (0x20000)
    const STM32_FLASH_OFFSET = CONFIG.PROTOCOL.STM32_FLASH_OFFSET;  // 0x20000
    
    this.debugMessage(`Transfer length: ${transferLength} bytes`);
    this.debugMessage(`STM32 Flash address offset: 0x${STM32_FLASH_OFFSET.toString(16)}`);
    
    // C# OpenGD77Form.cs READ_CODEPLUG case (lines 1740-1846):
    // After sendCommand(0) succeeds (done in initProtocol), send display commands:
    // sendCommand(1) - Clear screen
    // sendCommand(2, 0, 0, 3, 1, 0, "CPS") - Write text line 1
    // sendCommand(2, 0, 16, 3, 1, 0, "Reading") - Write text line 2
    // sendCommand(2, 0, 32, 3, 1, 0, "Codeplug") - Write text line 3
    // sendCommand(3) - Render screen
    // sendCommand(6, 3) - Flash green LED
    // sendCommand(6, 2) - Save settings and VFOs to codeplug
    this.debugMessage('Sending CPS display/setup commands...');
    await this.sendSTM32Command(1);                               // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS'); // Line 1: "OpenGD77 WebCPS"
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');   // Line 2: "Reading"
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Codeplug');  // Line 3: "Codeplug"
    await this.sendSTM32Command(3);                               // Render screen
    await this.sendSTM32Command(6, 3);                            // Flash green LED
    await this.sendSTM32Command(6, 2);                            // Save settings and VFOs
    
    // Small delay to ensure command responses are fully processed before bulk read
    await this.delay(50);
    
    this.debugMessage('CPS display/setup commands complete');
    
    // Codeplug segment addresses (from OpenGD77Form.cs READ_CODEPLUG)
    // Buffer positions are where data is stored in the local codeplug buffer
    // Radio addresses are where data is read from on the radio's flash/EEPROM
    const SEGMENT1_START = 0x80;          // 128 - buffer start position
    const SEGMENT1_END = 0x6000;          // 24576 - buffer end position
    const LUCZ_START = 0x6000;            // 24576 - Last Used Channels in Zone data start
    const LUCZ_END = 0x6050;              // 24656 - approximately, depends on LAST_USED_CHANNEL_IN_ZONE_BLOCK_SIZE
    const SEGMENT2_START = 0x7500;        // 29952 - buffer start position
    const SEGMENT2_END = 0xB000;          // 45056 - buffer end position
    const CODEPLUG_FLASH_PART_START = 0xB000;  // 45056 - buffer position for channels 129+, zones, contacts, TG lists
    const CODEPLUG_FLASH_PART_END = 0x1EE60;   // 126560 - end of codeplug data
    const CUSTOM_DATA_START = 0x1EE60;    // 126560 - custom data (boot image, melody, theme)
    const CUSTOM_DATA_END = 0x20000;      // 131072 - end of codeplug buffer
    const FLASH_BASE_ADDR = 0x7B000;      // 503808 - base address of codeplug data in flash (MK22)
    
    // For STM32 radios:
    // - Segments 1 & 2 use FLASH mode (1) instead of EEPROM mode (2)
    // - Segment 3 reads from (FLASH_BASE_ADDR + STM32_FLASH_OFFSET) = 0x9B000
    // - Segment 4 reads from (STM32_FLASH_OFFSET) = 0x20000
    this.debugMessage('Segment addresses (from OpenGD77Form.cs READ_CODEPLUG for STM32):');
    this.debugMessage(`  Segment 1: buffer 0x${SEGMENT1_START.toString(16)} - 0x${SEGMENT1_END.toString(16)} (${SEGMENT1_END - SEGMENT1_START} bytes) mode=Flash(1)`);
    this.debugMessage(`  LUCZ: buffer 0x${LUCZ_START.toString(16)} - 0x${LUCZ_END.toString(16)} mode=EEPROM(2)`);
    this.debugMessage(`  Segment 2: buffer 0x${SEGMENT2_START.toString(16)} - 0x${SEGMENT2_END.toString(16)} (${SEGMENT2_END - SEGMENT2_START} bytes) mode=Flash(1)`);
    this.debugMessage(`  Segment 3: buffer 0x${CODEPLUG_FLASH_PART_START.toString(16)} - 0x${CODEPLUG_FLASH_PART_END.toString(16)} from radio 0x${(FLASH_BASE_ADDR + STM32_FLASH_OFFSET).toString(16)} mode=Flash(1)`);
    this.debugMessage(`  Segment 4: buffer 0x${CUSTOM_DATA_START.toString(16)} - 0x${CUSTOM_DATA_END.toString(16)} from radio 0x${STM32_FLASH_OFFSET.toString(16)} mode=Flash(1)`);
    
    this.commsBuffer.fill(0);
    
    // Segment 1: Flash emulated EEPROM (0x80 - 0x6000)
    // C# for STM32: dataObj.mode = DataModeReadFlash; startDataAddressInTheRadio = 0x0080
    // Contains channels 1-128, general settings, DTMF, APRS, scan lists, etc.
    this.debugMessage('=== Reading Segment 1 (STM32 Flash emulated EEPROM) ===');
    this.reportProgress(5, 'Reading segment 1...');
    const segment1Data = await this.readFlashOrEEPROM(SEGMENT1_START, SEGMENT1_END - SEGMENT1_START, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(5 + (p * 0.15), `Reading: ${Math.round(5 + (p * 0.15))}%`);
    });
    this.commsBuffer.set(segment1Data, SEGMENT1_START);
    this.debugMessage(`Segment 1 complete: Got ${segment1Data.length} bytes`);
    
    // LUCZ Segment: Last Used Channels in Zone data (EEPROM mode for both platforms)
    // C#: dataObj.mode = DataModeReadEEPROM; startDataAddressInTheRadio = ADDR_OPENGD77_LAST_USED_CHANNELS_DATA_START (0x6000)
    // This small segment uses EEPROM mode even on STM32
    this.debugMessage('=== Reading LUCZ Segment (EEPROM) ===');
    this.reportProgress(20, 'Reading LUCZ data...');
    const luczLength = LUCZ_END - LUCZ_START;
    const luczData = await this.readFlashOrEEPROM(LUCZ_START, luczLength, DATA_MODE_READ_EEPROM, (p) => {
      this.reportProgress(20 + (p * 0.05), `Reading: ${Math.round(20 + (p * 0.05))}%`);
    });
    this.commsBuffer.set(luczData, LUCZ_START);
    this.debugMessage(`LUCZ Segment complete: Got ${luczData.length} bytes`);
    
    // Segment 2: Flash emulated EEPROM (0x7500 - 0xB000)
    // C# for STM32: dataObj.mode = DataModeReadFlash; startDataAddressInTheRadio = 0x7500
    // Contains boot settings, VFO A, VFO B
    this.debugMessage('=== Reading Segment 2 (STM32 Flash emulated EEPROM) ===');
    this.reportProgress(25, 'Reading segment 2...');
    const segment2Data = await this.readFlashOrEEPROM(SEGMENT2_START, SEGMENT2_END - SEGMENT2_START, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(25 + (p * 0.15), `Reading: ${Math.round(25 + (p * 0.15))}%`);
    });
    this.commsBuffer.set(segment2Data, SEGMENT2_START);
    this.debugMessage(`Segment 2 complete: Got ${segment2Data.length} bytes`);
    
    // Segment 3: Flash codeplug area (channels 129+, zones, contacts, TG lists)
    // C# for STM32: dataObj.mode = DataModeReadFlash; 
    //               startDataAddressInTheRadio = 503808 + STM32_FLASH_ADDRESS_OFFSET = 0x7B000 + 0x20000 = 0x9B000
    // This segment contains extended channels (banks 1-7), zone data, contacts, RX group lists (TG lists)
    this.debugMessage('=== Reading Segment 3 (Flash - extended channels, zones, contacts, TG lists) ===');
    const segment3Length = CODEPLUG_FLASH_PART_END - CODEPLUG_FLASH_PART_START;
    const segment3RadioAddr = FLASH_BASE_ADDR + STM32_FLASH_OFFSET;  // 0x7B000 + 0x20000 = 0x9B000
    this.debugMessage(`Segment 3: Reading ${segment3Length} bytes from radio address 0x${segment3RadioAddr.toString(16)} using Flash mode`);
    this.reportProgress(40, 'Reading Flash segment 3...');
    const segment3Data = await this.readFlashOrEEPROM(segment3RadioAddr, segment3Length, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(40 + (p * 0.30), `Reading Flash: ${Math.round(40 + (p * 0.30))}%`);
    });
    this.commsBuffer.set(segment3Data, CODEPLUG_FLASH_PART_START);
    this.debugMessage(`Segment 3 complete: Got ${segment3Data.length} bytes`);
    
    // Segment 4: OpenGD77 custom data in Flash (boot image, melody, theme)
    // C# for STM32: dataObj.mode = DataModeReadFlash; 
    //               startDataAddressInTheRadio = STM32_FLASH_ADDRESS_OFFSET = 0x20000
    this.debugMessage('=== Reading Segment 4 (Custom Data) ===');
    const segment4Length = CUSTOM_DATA_END - CUSTOM_DATA_START;
    const segment4RadioAddr = STM32_FLASH_OFFSET;  // 0x20000
    this.debugMessage(`Segment 4: Reading ${segment4Length} bytes from radio address 0x${segment4RadioAddr.toString(16)} using Flash mode`);
    this.reportProgress(70, 'Reading Flash segment 4 (custom data)...');
    const segment4Data = await this.readFlashOrEEPROM(segment4RadioAddr, segment4Length, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(70 + (p * 0.25), `Reading Flash: ${Math.round(70 + (p * 0.25))}%`);
    });
    this.commsBuffer.set(segment4Data, CUSTOM_DATA_START);
    this.debugMessage(`Segment 4 complete: Got ${segment4Data.length} bytes`);
    
    // Extended channel mode: read DMRID/VP flash area for extra channel data
    if (typeof EXTENDED_CHANNEL_MODE !== 'undefined' && EXTENDED_CHANNEL_MODE) {
      this.debugMessage('=== Reading Extended Channel Data (Scanner Mode) ===');
      const EXT_FLASH_START = SCANNER_LIMITS.EXT_CHANNEL_FLASH_START + STM32_FLASH_OFFSET; // 0x30000 + 0x20000 = 0x50000
      const EXT_FLASH_SIZE = (SCANNER_LIMITS.MAX_CHANNELS - CONFIG.LIMITS.MAX_CHANNELS) * SCANNER_LIMITS.CHANNEL_DATA_SIZE;
      this.reportProgress(85, 'Reading extended channels...');
      const extData = await this.readFlashOrEEPROM(EXT_FLASH_START, EXT_FLASH_SIZE, DATA_MODE_READ_FLASH, (p) => {
        this.reportProgress(85 + (p * 0.10), `Reading extended channels: ${Math.round(85 + (p * 0.10))}%`);
      });
      // Store extended channel data in a separate property for the codeplug parser
      this.extendedChannelData = extData;
      this.debugMessage(`Extended channel data complete: Got ${extData.length} bytes`);
    }

    // C# OpenGD77Form.cs: sendCommand(5) - close CPS screen on radio
    // C# OpenGD77Form.cs: sendCommand(7) - restore GPS NMEA mode if previously stopped
    this.debugMessage('Sending close CPS screen commands...');
    await this.exitCpsMode();

    this.debugMessage('=== STM32 READ CODEPLUG COMPLETE ===');
    this.debugMessage(`Total bytes read: ${transferLength}`);
    this.reportProgress(100, 'Read complete');
    
    return this.commsBuffer.slice(0, transferLength);
  }

  /**
   * Send close CPS screen command to radio (used after STM32 operations)
   * C# OpenGD77Form.cs: sendCommand(5) - close CPS screen on radio
   */
  async sendCloseCommands() {
    this.debugMessage('=== STM32 SEND CLOSE COMMANDS ===');
    await this.sendSTM32Command(5); // Close CPS screen
    this.debugMessage('=== STM32 CLOSE COMMANDS COMPLETE ===');
  }

  /**
   * Leave CPS mode and guarantee the radio returns to its normal screen.
   *
   * Firmware command 5 calls uiCPSUpdate(CPS2UI_COMMAND_END) which does
   * `menuSystemPopPreviousMenu()` - it pops exactly ONE menu level. Command 0
   * pushes a new UI_CPS menu every time, so if any earlier operation was
   * interrupted before sending command 5 (e.g. a read that failed or an
   * overlapping operation), stale CPS menus stay stacked and a single pop
   * leaves the "Reading Boot Data" screen visible until the radio is
   * power-cycled. Popping repeatedly unwinds the stack to the root menu
   * (pop is a no-op at the root), which reliably clears the screen.
   */
  async exitCpsMode() {
    // Command 5 exits CPS mode (firmware pops the UI_CPS menu) and command 7
    // restores GPS NMEA mode. One of each matches the reference CPS - do NOT
    // send repeated pops: the firmware acks every one, which floods the link
    // and desyncs whatever operation runs next.
    try { await this.sendSTM32Command(5); } catch (e) { /* best effort */ }
    try { await this.sendSTM32Command(7); } catch (e) { /* best effort */ }
  }

  /**
   * Write codeplug to radio
   * Automatically uses the correct protocol based on radio type and connection mode:
   * - MK22 HID mode: Uses page-based addressing with CWB command (bootloader protocol)
   * - MK22 CDC-ACM serial mode: Uses OpenGD77 serial protocol with EEPROM/Flash modes
   * - STM32: Uses OpenGD77 serial protocol with writeFlash/writeEEPROM
   */
  async writeCodeplug(data, onProgress) {
    return this._serialized('write codeplug', () => this._writeCodeplugImpl(data, onProgress));
  }

  async _writeCodeplugImpl(data, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.reportProgress(0, 'Initializing...');
    
    try {
      // Initialize protocol
      await this.initProtocol();
      
      // Protocol selection based on connection mode and radio type:
      // - HID mode (bootloader): Uses page-based CWB protocol (MK22 only)
      // - CDC-ACM serial mode: Uses OpenGD77 serial protocol (both MK22 and STM32)
      if (this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 HID bootloader mode uses page-based CWB protocol
        await this.writeCodeplugMK22HID(data, onProgress);
      } else if (!this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 CDC-ACM serial mode uses serial protocol with EEPROM/Flash modes
        await this.writeCodeplugMK22Serial(data, onProgress);
      } else {
        // STM32 radios use OpenGD77 serial protocol
        await this.writeCodeplugSTM32(data, onProgress);
      }
      
    } catch (error) {
      this.reportProgress(0, 'Write failed');
      throw error;
    }
  }

  /**
   * Write codeplug to MK22 radio in HID bootloader mode (GD-77, DM-1801, RD-5R)
   * Uses page-based addressing with CWB command
   * This protocol is only used when the radio is in HID bootloader mode (VID 0x15A2)
   */
  async writeCodeplugMK22HID(data, onProgress) {
    // Write codeplug data - stop BEFORE custom data area (boot image, melody, theme)
    // Custom data starts at 0x1EE60 and should be preserved during codeplug write
    const CUSTOM_DATA_START = 0x1EE60;  // Custom data (boot image, melody, theme) - DO NOT overwrite
    
    const startAddress = CONFIG.PROTOCOL.CODEPLUG_START;
    // Limit transfer to stop before custom data area
    const maxCodeplugLength = CUSTOM_DATA_START - startAddress;
    const transferLength = Math.min(data.length, maxCodeplugLength);
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    
    this.debugMessage(`MK22 write: stopping at 0x${CUSTOM_DATA_START.toString(16)} to preserve custom data`);
    this.debugMessage(`Transfer length: ${transferLength} bytes (0x${transferLength.toString(16)})`);
    
    const numBlocks = Math.ceil(transferLength / blockSize);
    const startBlock = startAddress / blockSize;
    let currentPage = -1;
    
    // Copy data to comms buffer
    this.commsBuffer.set(data);
    
    for (let block = startBlock; block < startBlock + numBlocks; block++) {
      const address = block * blockSize;
      
      // Check if we need to switch pages
      const page = Math.floor(address / bankSize);
      if (page !== currentPage) {
        currentPage = page;
        const pageAddr = page * bankSize;
        
        // Send CWB command to set page
        const cwbCmd = new Uint8Array([
          0x43, 0x57, 0x42, 0x04,
          (pageAddr >> 24) & 0xFF,
          (pageAddr >> 16) & 0xFF,
          (pageAddr >> 8) & 0xFF,
          pageAddr & 0xFF
        ]);
        
        await this.sendData(cwbCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Page switch failed');
        }
      }
      
      // Write block
      const addr16 = address & 0xFFFF;
      const writeCmd = new Uint8Array(4 + blockSize);
      writeCmd[0] = 0x57; // 'W' - Write command
      writeCmd[1] = (addr16 >> 8) & 0xFF;
      writeCmd[2] = addr16 & 0xFF;
      writeCmd[3] = blockSize;
      writeCmd.set(this.commsBuffer.slice(address, address + blockSize), 4);
      
      await this.sendData(writeCmd);
      const response = await this.receiveData();
      
      if (response[0] !== this.CMD_ACK) {
        throw new Error('Write block failed');
      }
      
      // Report progress
      const progress = ((block - startBlock + 1) / numBlocks) * 100;
      this.reportProgress(progress, `Writing: ${Math.round(progress)}%`);
      
      if (onProgress) {
        onProgress(progress);
      }
    }
    
    // Best-effort clock sync (UTC) before ending the write. The MK22 DFU
    // bootloader may not service this, so it must not fail the write.
    await this.attemptClockSync();

    // Send END WRITE
    await this.sendData(this.CMD_ENDW);
    await this.receiveData();
    
    this.reportProgress(100, 'Write complete');
  }

  /**
   * Write codeplug to MK22 radio in CDC-ACM serial mode (GD-77, DM-1801, RD-5R)
   * Uses OpenGD77 serial protocol with EEPROM/Flash writes
   * Based on WRITE_CODEPLUG case in OpenGD77Form.cs
   * 
   * Key differences from STM32:
   * - MK22 uses DataModeWriteEEPROM (4) for segments 1 & 2 (real EEPROM)
   * - MK22 uses DataModeWriteFlash (3) for segments 3 & 4 (SPI Flash)
   * - No STM32_FLASH_ADDRESS_OFFSET needed for MK22
   */
  async writeCodeplugMK22Serial(data, onProgress) {
    this.debugMessage('=== MK22 SERIAL WRITE CODEPLUG START ===');
    
    // Helper function to report progress to both callbacks (internal and external)
    const updateProgress = (percent, message) => {
      this.reportProgress(percent, message);
      if (onProgress) {
        onProgress(percent);
      }
    };
    
    // Segment address constants (from OpenGD77Form.cs WRITE_CODEPLUG for MK22)
    const SEGMENT1_START = 0x80;
    const SEGMENT1_END = 0x6000;
    const SEGMENT2_START = 0x7500;
    const SEGMENT2_END = 0xB000;
    const CODEPLUG_FLASH_PART_START = 0xB000;  // Start of flash codeplug section
    const CODEPLUG_FLASH_PART_END = 0x1EE60;   // End of flash codeplug section
    const CUSTOM_DATA_START = 0x1EE60;         // Custom data (boot image, melodies, etc.)
    const CUSTOM_DATA_END = 0x20000;
    const FLASH_BASE_ADDR = 0x7B000;           // Base address for extended codeplug in SPI Flash
    
    this.debugMessage('Segment addresses for MK22 (matching read addresses):');
    this.debugMessage(`  Segment 1: buffer 0x${SEGMENT1_START.toString(16)} - 0x${SEGMENT1_END.toString(16)} (${SEGMENT1_END - SEGMENT1_START} bytes) EEPROM, radio addr = buffer addr`);
    this.debugMessage(`  Segment 2: buffer 0x${SEGMENT2_START.toString(16)} - 0x${SEGMENT2_END.toString(16)} (${SEGMENT2_END - SEGMENT2_START} bytes) EEPROM, radio addr = buffer addr`);
    this.debugMessage(`  Segment 3: buffer 0x${CODEPLUG_FLASH_PART_START.toString(16)} - 0x${CODEPLUG_FLASH_PART_END.toString(16)} to radio 0x${FLASH_BASE_ADDR.toString(16)} Flash`);
    this.debugMessage(`  Segment 4: buffer 0x${CUSTOM_DATA_START.toString(16)} - 0x${CUSTOM_DATA_END.toString(16)} to radio 0x0 Flash`);
    
    // C# display commands for writing codeplug
    this.debugMessage('Sending CPS display commands...');
    await this.sendSTM32Command(1);                                // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');  // Line 1: "OpenGD77 WebCPS"
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');    // Line 2: "Writing"
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Codeplug');   // Line 3: "Codeplug"
    await this.sendSTM32Command(3);                                // Render screen
    await this.sendSTM32Command(6, 4);                             // Flash red LED
    await this.sendSTM32Command(6, 2);                             // Save settings and VFOs
    
    this.commsBuffer.set(data);
    
    // Segment 1: EEPROM (0x80 - 0x6000) - radio address = buffer address
    this.debugMessage('=== Writing Segment 1 (MK22 EEPROM) ===');
    updateProgress(5, 'Writing codeplug... 5%');
    await this.writeEEPROM(SEGMENT1_START, this.commsBuffer.slice(SEGMENT1_START, SEGMENT1_END), (p) => {
      // Segment 1: 5% to 25% (20% range)
      const overallProgress = 5 + ((p / 100) * 20);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 1 complete');
    
    // Segment 2: EEPROM (0x7500 - 0xB000) - radio address = buffer address
    this.debugMessage('=== Writing Segment 2 (MK22 EEPROM) ===');
    updateProgress(25, 'Writing codeplug... 25%');
    await this.writeEEPROM(SEGMENT2_START, this.commsBuffer.slice(SEGMENT2_START, SEGMENT2_END), (p) => {
      // Segment 2: 25% to 40% (15% range)
      const overallProgress = 25 + ((p / 100) * 15);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 2 complete');
    
    // Segment 3: SPI Flash (0xB000 - 0x1EE60) - radio address = 0x7B000
    this.debugMessage('=== Writing Segment 3 (MK22 SPI Flash) ===');
    updateProgress(40, 'Writing codeplug... 40%');
    await this.writeFlash(FLASH_BASE_ADDR, this.commsBuffer.slice(CODEPLUG_FLASH_PART_START, CODEPLUG_FLASH_PART_END), (p) => {
      // Segment 3: 40% to 70% (30% range)
      const overallProgress = 40 + ((p / 100) * 30);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 3 complete');
    
    // Segment 4: SPI Flash custom data (0x1EE60 - 0x20000) - radio address = 0x0
    this.debugMessage('=== Writing Segment 4 (MK22 SPI Flash custom data) ===');
    updateProgress(70, 'Writing codeplug... 70%');
    await this.writeFlash(0, this.commsBuffer.slice(CUSTOM_DATA_START, CUSTOM_DATA_END), (p) => {
      // Segment 4: 70% to 95% (25% range)
      const overallProgress = 70 + ((p / 100) * 25);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 4 complete');
    
    // Attempt to sync the radio clock (UTC) before rebooting. Best-effort: if
    // it fails, the codeplug write still completes.
    await this.attemptClockSync();

    // C# OpenGD77Form.cs: sendCommand(6, 0) - save settings and reboot
    this.debugMessage('Sending save settings and reboot command...');
    await this.sendSTM32Command(6, 0);
    
    this.debugMessage('=== MK22 SERIAL WRITE CODEPLUG COMPLETE ===');
    updateProgress(100, 'Write complete');
  }

  /**
   * Write codeplug to STM32 radio (TYT MD-UV380, MD-9600, etc.)
   * Uses OpenGD77 serial protocol with flash/EEPROM writes
   * Based on WRITE_CODEPLUG case in OpenGD77Form.cs
   * 
   * C# OpenGD77Form.cs WRITE_CODEPLUG uses:
   * - WriteEEPROM for segments 1 & 2 (EEPROM areas)
   * - WriteFlash for segments 3 & 4 (Flash areas)
   * - sendCommand(6, 0) at end to save settings (NOT VFOs) and reboot
   */
  async writeCodeplugSTM32(data, onProgress) {
    this.debugMessage('=== STM32 WRITE CODEPLUG START ===');
    
    // Helper function to report progress to both callbacks (internal and external)
    const updateProgress = (percent, message) => {
      this.reportProgress(percent, message);
      if (onProgress) {
        onProgress(percent);
      }
    };
    
    // STM32 flash address offset - the codeplug flash area starts at this offset in SPI flash
    // This matches the FLASH_ADDRESS_OFFSET in the STM32 firmware (codeplug.h line 170)
    // On STM32: #define FLASH_ADDRESS_OFFSET (128 * 1024) = 0x20000
    const STM32_FLASH_OFFSET = CONFIG.PROTOCOL.STM32_FLASH_OFFSET;  // 0x20000
    
    // Segment address constants
    const SEGMENT1_START = 0x80;
    const SEGMENT1_END = 0x6000;
    const SEGMENT2_START = 0x7500;
    const SEGMENT2_END = 0xB000;
    const CODEPLUG_FLASH_PART_START = 0xB000;  // Start of flash codeplug section
    const CODEPLUG_FLASH_PART_END = 0x1EE60;   // End of flash codeplug section
    const CUSTOM_DATA_START = 0x1EE60;         // Custom data (boot image, melodies, etc.)
    const CUSTOM_DATA_END = 0x20000;
    const FLASH_BASE_ADDR = 0x7B000;           // Base address for extended codeplug in flash
    
    // STM32 radio addresses for flash segments (must match read addresses):
    // - Segments 1 & 2: Use writeFlash at buffer address (flash-emulated EEPROM area)
    // - Segment 3: Write to FLASH_BASE_ADDR + STM32_FLASH_OFFSET = 0x9B000
    // - Segment 4: Write to STM32_FLASH_OFFSET = 0x20000
    const SEGMENT3_RADIO_ADDR = FLASH_BASE_ADDR + STM32_FLASH_OFFSET;  // 0x7B000 + 0x20000 = 0x9B000
    const SEGMENT4_RADIO_ADDR = STM32_FLASH_OFFSET;                     // 0x20000
    
    this.debugMessage(`STM32 Flash address offset: 0x${STM32_FLASH_OFFSET.toString(16)}`);
    this.debugMessage('Segment addresses for STM32 (matching read addresses):');
    this.debugMessage(`  Segment 1: buffer 0x${SEGMENT1_START.toString(16)} - 0x${SEGMENT1_END.toString(16)} (${SEGMENT1_END - SEGMENT1_START} bytes) Flash, radio addr = buffer addr`);
    this.debugMessage(`  Segment 2: buffer 0x${SEGMENT2_START.toString(16)} - 0x${SEGMENT2_END.toString(16)} (${SEGMENT2_END - SEGMENT2_START} bytes) Flash, radio addr = buffer addr`);
    this.debugMessage(`  Segment 3: buffer 0x${CODEPLUG_FLASH_PART_START.toString(16)} - 0x${CODEPLUG_FLASH_PART_END.toString(16)} to radio 0x${SEGMENT3_RADIO_ADDR.toString(16)} Flash`);
    this.debugMessage(`  Segment 4: buffer 0x${CUSTOM_DATA_START.toString(16)} - 0x${CUSTOM_DATA_END.toString(16)} SKIPPED (custom data preserved)`);
    
    // C# display commands for writing codeplug
    this.debugMessage('Sending CPS display commands...');
    await this.sendSTM32Command(1);                                // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');  // Line 1: "OpenGD77 WebCPS"
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');    // Line 2: "Writing"
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Codeplug');   // Line 3: "Codeplug"
    await this.sendSTM32Command(3);                                // Render screen
    await this.sendSTM32Command(6, 4);                             // Flash red LED
    await this.sendSTM32Command(6, 2);                             // Save settings and VFOs
    
    this.commsBuffer.set(data);
    
    // Segment 1: Flash-emulated EEPROM (0x80 - 0x6000) - radio address = buffer address
    // On STM32, segments 1 & 2 use writeFlash (matching read which uses readFlash mode)
    this.debugMessage('=== Writing Segment 1 (STM32 Flash) ===');
    updateProgress(5, 'Writing codeplug... 5%');
    await this.writeFlash(SEGMENT1_START, this.commsBuffer.slice(SEGMENT1_START, SEGMENT1_END), (p) => {
      // Segment 1: 5% to 25% (20% range)
      const overallProgress = 5 + ((p / 100) * 20);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 1 complete');
    
    // Segment 2: Flash-emulated EEPROM (0x7500 - 0xB000) - radio address = buffer address
    this.debugMessage('=== Writing Segment 2 (STM32 Flash) ===');
    updateProgress(25, 'Writing codeplug... 25%');
    await this.writeFlash(SEGMENT2_START, this.commsBuffer.slice(SEGMENT2_START, SEGMENT2_END), (p) => {
      // Segment 2: 25% to 40% (15% range)
      const overallProgress = 25 + ((p / 100) * 15);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 2 complete');
    
    // Segment 3: Flash codeplug (buffer 0xB000 - 0x1EE60 to radio 0x9B000)
    // Radio address = 0x7B000 + 0x20000 = 0x9B000 (matching read address)
    this.debugMessage('=== Writing Segment 3 (Flash - extended channels, zones, contacts, TG lists) ===');
    updateProgress(40, 'Writing codeplug... 40%');
    await this.writeFlash(SEGMENT3_RADIO_ADDR, this.commsBuffer.slice(CODEPLUG_FLASH_PART_START, CODEPLUG_FLASH_PART_END), (p) => {
      // Segment 3: 40% to 75% (35% range)
      const overallProgress = 40 + ((p / 100) * 35);
      updateProgress(overallProgress, `Writing codeplug... ${Math.round(overallProgress)}%`);
    });
    this.debugMessage('Segment 3 complete');
    
    // Segment 4: Custom data (buffer 0x1EE60 - 0x20000 to radio 0x20000)
    // INTENTIONALLY SKIPPED - Custom data contains boot image, boot melody, and theme
    // These are written separately via writeBootImage(), writeTheme(), etc.
    // This allows codeplug writes to preserve user's custom boot screen and theme settings
    this.debugMessage('=== Skipping Segment 4 (Custom Data - boot image, melody, theme) ===');
    this.debugMessage('Custom data is preserved and can be written separately via dedicated functions');
    
    // Extended channel mode: write extended channel data to DMRID/VP flash area
    if (typeof EXTENDED_CHANNEL_MODE !== 'undefined' && EXTENDED_CHANNEL_MODE && this.extendedChannelData) {
      this.debugMessage('=== Writing Extended Channel Data (Scanner Mode) ===');
      const EXT_FLASH_START = SCANNER_LIMITS.EXT_CHANNEL_FLASH_START + STM32_FLASH_OFFSET; // 0x50000
      updateProgress(75, 'Writing extended channels...');
      await this.writeFlash(EXT_FLASH_START, this.extendedChannelData, (p) => {
        const overallProgress = 75 + ((p / 100) * 10);
        updateProgress(overallProgress, `Writing extended channels... ${Math.round(overallProgress)}%`);
      });
      this.debugMessage('Extended channel data write complete');
      
      // Write bitmap data for banks 13+ (beyond G77 buffer) to prevent phantom channels.
      // The firmware reads bitmaps for ALL 125 banks at specific flash addresses.
      // Banks 0-12 bitmaps are in the G77 buffer (written in segments 1/3).
      // Banks 13+ bitmaps are at flash addresses beyond the G77 buffer and must be
      // written separately, otherwise uninitialized flash (0xFF) makes the firmware
      // think ALL channels in those banks are valid, causing crashes when navigating
      // backwards from channel 1 to channel 16000.
      if (this._extendedBitmaps && this._extendedBitmaps.length > 0) {
        this.debugMessage(`=== Writing Extended Bank Bitmaps (${this._extendedBitmaps.length} banks) ===`);
        updateProgress(85, 'Writing extended bitmaps...');
        for (const bitmapEntry of this._extendedBitmaps) {
          await this.writeFlash(bitmapEntry.flashAddr, bitmapEntry.bitmap);
        }
        this.debugMessage('Extended bank bitmaps write complete');
      }
    }

    // Attempt to sync the radio clock (UTC) before rebooting. Best-effort: if
    // it fails, the codeplug write still completes.
    await this.attemptClockSync();

    // Save settings and reboot
    updateProgress(95, 'Writing codeplug... 95%');
    this.debugMessage('Sending save settings command (option 0) to save and reboot...');
    await this.sendSTM32Command(6, 0);
    
    this.debugMessage('=== STM32 WRITE CODEPLUG COMPLETE ===');
    updateProgress(100, 'Write complete');
  }

  /**
   * Read DMR ID database from radio
   * Automatically uses the correct protocol based on radio type and connection mode:
   * - MK22 HID mode: Uses page-based addressing with CWB command (bootloader protocol)
   * - MK22 CDC-ACM serial mode: Uses OpenGD77 serial protocol
   * - STM32: Uses OpenGD77 serial protocol with readFlashOrEEPROM
   */
  async readDMRDatabase(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== READ DMR DATABASE START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);

    this.reportProgress(0, 'Reading DMR ID database...');
    
    try {
      await this.initProtocol();
      
      // Protocol selection based on connection mode and radio type:
      // - HID mode (bootloader): Uses page-based CWB protocol (MK22 only)
      // - CDC-ACM serial mode: Uses OpenGD77 serial protocol (both MK22 and STM32)
      if (this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 HID bootloader mode uses page-based CWB protocol
        return await this.readDMRDatabaseMK22HID(onProgress);
      } else if (!this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 CDC-ACM serial mode uses serial protocol
        return await this.readDMRDatabaseMK22Serial(onProgress);
      } else {
        // STM32 radios use OpenGD77 serial protocol
        return await this.readDMRDatabaseSTM32(onProgress);
      }
      
    } catch (error) {
      this.debugMessage(`=== READ DMR DATABASE FAILED: ${error.message} ===`);
      this.reportProgress(0, 'DMR DB read failed');
      throw error;
    }
  }

  /**
   * Read DMR ID database from MK22 radio in HID bootloader mode (GD-77, DM-1801, RD-5R)
   * Uses page-based addressing with CWB command
   * This protocol is only used when the radio is in HID bootloader mode (VID 0x15A2)
   */
  async readDMRDatabaseMK22HID(onProgress) {
    const startAddress = CONFIG.PROTOCOL.DMRID_START;
    const transferLength = CONFIG.PROTOCOL.DMRID_END - CONFIG.PROTOCOL.DMRID_START;
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    
    const numBlocks = transferLength / blockSize;
    const startBlock = startAddress / blockSize;
    let currentPage = -1;
    
    const buffer = new Uint8Array(transferLength);
    
    for (let block = startBlock; block < startBlock + numBlocks; block++) {
      const address = block * blockSize;
      const bufferOffset = address - startAddress;
      
      // Check if we need to switch pages
      const page = Math.floor(address / bankSize);
      if (page !== currentPage) {
        currentPage = page;
        const pageAddr = page * bankSize;
        
        const cwbCmd = new Uint8Array([
          0x43, 0x57, 0x42, 0x04,
          (pageAddr >> 24) & 0xFF,
          (pageAddr >> 16) & 0xFF,
          (pageAddr >> 8) & 0xFF,
          pageAddr & 0xFF
        ]);
        
        await this.sendData(cwbCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Page switch failed');
        }
      }
      
      // Read block
      const addr16 = address & 0xFFFF;
      const readCmd = new Uint8Array([
        0x52,
        (addr16 >> 8) & 0xFF,
        addr16 & 0xFF,
        blockSize
      ]);
      
      await this.sendData(readCmd);
      const data = await this.receiveData();
      
      buffer.set(data.slice(4, 4 + blockSize), bufferOffset);
      
      const progress = ((block - startBlock + 1) / numBlocks) * 100;
      this.reportProgress(progress, `Reading DMR DB: ${Math.round(progress)}%`);
      
      if (onProgress) {
        onProgress(progress);
      }
    }
    
    await this.sendData(this.CMD_ENDR);
    await this.receiveData();
    
    this.reportProgress(100, 'DMR DB read complete');
    
    return buffer;
  }

  /**
   * Read DMR ID database from MK22 radio in CDC-ACM serial mode (GD-77, DM-1801, RD-5R)
   * Uses OpenGD77 serial protocol with flash reading
   */
  async readDMRDatabaseMK22Serial(onProgress) {
    this.debugMessage('=== MK22 SERIAL READ DMR DATABASE START ===');
    
    // DMR ID database is stored in SPI Flash starting at DMRID_START
    const DMRID_START = CONFIG.PROTOCOL.DMRID_START;  // 0x30000
    const DMRID_LENGTH = CONFIG.PROTOCOL.DMRID_END - CONFIG.PROTOCOL.DMRID_START;
    const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
    
    this.debugMessage(`DMR ID radio address: 0x${DMRID_START.toString(16)}`);
    this.debugMessage(`Length: ${DMRID_LENGTH} bytes`);
    
    // Display status on radio screen
    await this.sendSTM32Command(1);                                 // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');   // Line 1
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');     // Line 2
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'DMR IDs');     // Line 3
    await this.sendSTM32Command(3);                                 // Render
    await this.sendSTM32Command(6, 3);                              // Flash green LED
    
    // Read DMR ID database from SPI Flash
    const dmrData = await this.readFlashOrEEPROM(DMRID_START, DMRID_LENGTH, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(p, `Reading DMR IDs: ${Math.round(p)}%`);
      if (onProgress) onProgress(p);
    });
    
    // Close CPS screen
    await this.exitCpsMode();

    this.debugMessage('=== MK22 SERIAL READ DMR DATABASE COMPLETE ===');
    this.reportProgress(100, 'DMR DB read complete');
    
    return dmrData;
  }

  /**
   * Read DMR ID database from STM32 radio (MD-UV380, MD-9600, etc.)
   * Uses OpenGD77 serial protocol with flash reading
   * Based on DMRIDRead case in CodeplugComms.cs and DMRIDForm.cs
   */
  async readDMRDatabaseSTM32(onProgress) {
    this.debugMessage('=== STM32 READ DMR DATABASE START ===');
    
    // DMR ID database address - for STM32 needs STM32_FLASH_ADDRESS_OFFSET added
    // C# DMRIDForm.cs: startDataAddressInTheRadio = num + OpenGD77Form.STM32_FLASH_ADDRESS_OFFSET
    const DMRID_START = CONFIG.PROTOCOL.DMRID_START;  // 0x30000
    const STM32_FLASH_OFFSET = CONFIG.PROTOCOL.STM32_FLASH_OFFSET;  // 0x20000
    const STM32_DMRID_ADDR = DMRID_START + STM32_FLASH_OFFSET;  // 0x50000
    const DMRID_LENGTH = CONFIG.PROTOCOL.DMRID_END - CONFIG.PROTOCOL.DMRID_START;
    const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
    
    this.debugMessage(`DMR ID buffer address: 0x${DMRID_START.toString(16)}`);
    this.debugMessage(`STM32 radio address: 0x${STM32_DMRID_ADDR.toString(16)} (with 0x${STM32_FLASH_OFFSET.toString(16)} offset)`);
    this.debugMessage(`Length: ${DMRID_LENGTH} bytes`);
    
    // Display status on radio screen
    await this.sendSTM32Command(1);                                 // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');   // Line 1
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');     // Line 2
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'DMR IDs');     // Line 3
    await this.sendSTM32Command(3);                                 // Render
    await this.sendSTM32Command(6, 3);                              // Flash green LED
    
    // Small delay to ensure command response is fully processed before bulk read
    await this.delay(50);
    
    // Read DMR ID data using flash mode from STM32 address
    const dmrData = await this.readFlashOrEEPROM(STM32_DMRID_ADDR, DMRID_LENGTH, DATA_MODE_READ_FLASH, (p) => {
      this.reportProgress(p, `Reading DMR DB: ${Math.round(p)}%`);
      if (onProgress) onProgress(p);
    });
    
    // Close CPS screen
    await this.exitCpsMode();

    this.debugMessage('=== STM32 READ DMR DATABASE COMPLETE ===');
    this.reportProgress(100, 'DMR DB read complete');
    
    return dmrData;
  }

  /**
   * Write DMR ID database to radio
   * Automatically uses the correct protocol based on radio type and connection mode:
   * - MK22 HID mode: Uses page-based addressing with CWB command (bootloader protocol)
   * - MK22 CDC-ACM serial mode: Uses OpenGD77 serial protocol
   * - STM32: Uses OpenGD77 serial protocol with writeFlash
   */
  async writeDMRDatabase(data, options, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    const recordSize = options?.recordSize || 41;
    const useVPMemory = options?.useVPMemory || false;

    this.debugMessage('========================================');
    this.debugMessage('=== WRITE DMR DATABASE START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);
    this.debugMessage(`Data length: ${data.length} bytes`);
    this.debugMessage(`Record size: ${recordSize} bytes`);
    this.debugMessage(`Use VP memory: ${useVPMemory}`);

    this.reportProgress(0, 'Writing DMR ID database...');
    
    // Calculate split point for two-region write (from CPS DMRIDForm.cs)
    // First region: up to 0x40000 bytes at DMRID_START
    // Second region: remainder at VP address or standard address
    const HEADER_SIZE = CONFIG.PROTOCOL.DMRID_HEADER_SIZE;
    const BASE_SIZE = CONFIG.PROTOCOL.DMRID_BASE_SIZE;  // 262132
    const splitPoint = HEADER_SIZE + recordSize * Math.floor(BASE_SIZE / recordSize);
    
    const firstRegionData = data.slice(0, Math.min(data.length, splitPoint));
    const secondRegionData = data.length > splitPoint ? data.slice(splitPoint) : null;
    
    this.debugMessage(`Split point: ${splitPoint} bytes`);
    this.debugMessage(`First region: ${firstRegionData.length} bytes`);
    this.debugMessage(`Second region: ${secondRegionData ? secondRegionData.length + ' bytes' : 'none'}`);
    
    // The STM32 / C7000 path enters CPS mode via initProtocol(); make sure we
    // always leave it (success or failure) so the radio isn't left stuck on the
    // CPS / "Writing DMR IDs" screen. The reference CPS saves settings/VFOs and
    // reboots the radio here, which also reloads the new DMR ID database.
    const needsExitCps = !this.isHIDMode && this.isFlashBasedRadio();
    try {
      await this.initProtocol();
      
      // Protocol selection based on connection mode and radio type:
      // - HID mode (bootloader): Uses page-based CWB protocol (MK22 only)
      // - CDC-ACM serial mode: Uses OpenGD77 serial protocol (both MK22 and STM32)
      if (this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 HID bootloader mode uses page-based CWB protocol
        await this.writeDMRDatabaseMK22HID(firstRegionData, secondRegionData, useVPMemory, onProgress);
      } else if (!this.isHIDMode && !this.isFlashBasedRadio()) {
        // MK22 CDC-ACM serial mode uses serial protocol
        await this.writeDMRDatabaseMK22Serial(firstRegionData, secondRegionData, useVPMemory, onProgress);
      } else {
        // STM32 / C7000 radios use OpenGD77 serial protocol
        await this.writeDMRDatabaseSTM32(firstRegionData, secondRegionData, useVPMemory, onProgress);
      }
      
    } catch (error) {
      this.debugMessage(`=== WRITE DMR DATABASE FAILED: ${error.message} ===`);
      this.reportProgress(0, 'DMR DB write failed');
      throw error;
    } finally {
      if (needsExitCps) {
        // Match the reference CPS (DMRIDForm.writeToOpenGD77): after a DMR ID
        // write it saves settings/VFOs and reboots the radio. Command 5 alone
        // leaves the C7000 sitting on the CPS screen; the reboot is what clears
        // it and reloads the freshly written database.
        try { await this.sendSTM32Command(6, 2); } catch (e) { /* best effort */ }
        try { await this.sendSTM32Command(6, 1); } catch (e) { /* best effort */ }
      }
    }
  }

  /**
   * Write DMR ID database to MK22 radio in HID bootloader mode (GD-77, DM-1801, RD-5R)
   * Uses page-based addressing with CWB command
   * This protocol is only used when the radio is in HID bootloader mode (VID 0x15A2)
   * Supports two-region write: first region at DMRID_START, second at VP/non-VP address
   */
  async writeDMRDatabaseMK22HID(firstRegionData, secondRegionData, useVPMemory, onProgress) {
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    
    // Calculate total blocks for progress reporting
    const firstRegionBlocks = Math.ceil(firstRegionData.length / blockSize);
    const secondRegionBlocks = secondRegionData ? Math.ceil(secondRegionData.length / blockSize) : 0;
    const totalBlocks = firstRegionBlocks + secondRegionBlocks;
    let blocksWritten = 0;
    let currentPage = -1;
    
    // Helper to write a data region to a flash address using CWB page-based protocol
    const writeRegion = async (startAddress, data) => {
      const transferLength = data.length;
      const numBlocks = Math.ceil(transferLength / blockSize);
      const startBlock = startAddress / blockSize;
      
      for (let block = startBlock; block < startBlock + numBlocks; block++) {
        const address = block * blockSize;
        const dataOffset = address - startAddress;
        
        const page = Math.floor(address / bankSize);
        if (page !== currentPage) {
          currentPage = page;
          const pageAddr = page * bankSize;
          
          const cwbCmd = new Uint8Array([
            0x43, 0x57, 0x42, 0x04,
            (pageAddr >> 24) & 0xFF,
            (pageAddr >> 16) & 0xFF,
            (pageAddr >> 8) & 0xFF,
            pageAddr & 0xFF
          ]);
          
          await this.sendData(cwbCmd);
          const response = await this.receiveData();
          
          if (response[0] !== this.CMD_ACK) {
            throw new Error('Page switch failed');
          }
        }
        
        const addr16 = address & 0xFFFF;
        const writeCmd = new Uint8Array(4 + blockSize);
        writeCmd[0] = 0x57;
        writeCmd[1] = (addr16 >> 8) & 0xFF;
        writeCmd[2] = addr16 & 0xFF;
        writeCmd[3] = blockSize;
        
        const blockData = data.slice(dataOffset, dataOffset + blockSize);
        writeCmd.set(blockData, 4);
        
        await this.sendData(writeCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Write block failed');
        }
        
        blocksWritten++;
        const progress = (blocksWritten / totalBlocks) * 100;
        this.reportProgress(progress, `Writing DMR DB: ${Math.round(progress)}%`);
        
        if (onProgress) {
          onProgress(progress);
        }
      }
    };
    
    // Write first region to DMRID_START
    await writeRegion(CONFIG.PROTOCOL.DMRID_START, firstRegionData);
    
    // Write second region if present (from CPS DMRIDForm.cs two-region write)
    if (secondRegionData) {
      const secondAddress = useVPMemory
        ? CONFIG.PROTOCOL.DMRID_VP_ADDRESS      // 0x8F400
        : CONFIG.PROTOCOL.DMRID_NO_VP_ADDRESS;  // 0xB8000
      this.debugMessage(`Writing second region to 0x${secondAddress.toString(16)} (${secondRegionData.length} bytes)`);
      await writeRegion(secondAddress, secondRegionData);
    }
    
    await this.sendData(this.CMD_ENDW);
    await this.receiveData();
    
    this.reportProgress(100, 'DMR DB write complete');
  }

  /**
   * Write DMR ID database to MK22 radio in CDC-ACM serial mode (GD-77, DM-1801, RD-5R)
   * Uses OpenGD77 serial protocol with flash writing
   * Supports two-region write: first region at DMRID_START, second at VP/non-VP address
   */
  async writeDMRDatabaseMK22Serial(firstRegionData, secondRegionData, useVPMemory, onProgress) {
    this.debugMessage('=== MK22 SERIAL WRITE DMR DATABASE START ===');
    
    const DMRID_START = CONFIG.PROTOCOL.DMRID_START;  // 0x30000
    const totalLength = firstRegionData.length + (secondRegionData ? secondRegionData.length : 0);
    
    this.debugMessage(`DMR ID radio address: 0x${DMRID_START.toString(16)}`);
    this.debugMessage(`First region: ${firstRegionData.length} bytes`);
    this.debugMessage(`Second region: ${secondRegionData ? secondRegionData.length + ' bytes' : 'none'}`);
    
    // Display status on radio screen
    await this.sendSTM32Command(1);                                 // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');   // Line 1
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');     // Line 2
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'DMR IDs');     // Line 3
    await this.sendSTM32Command(3);                                 // Render
    await this.sendSTM32Command(6, 4);                              // Flash red LED
    
    // Write first region to DMRID_START
    await this.writeFlash(DMRID_START, firstRegionData, (p) => {
      const overallProgress = secondRegionData
        ? (p * firstRegionData.length / totalLength)
        : p;
      this.reportProgress(overallProgress, `Writing DMR IDs: ${Math.round(overallProgress)}%`);
      if (onProgress) onProgress(overallProgress);
    });
    
    // Write second region if present (from CPS DMRIDForm.cs two-region write)
    if (secondRegionData) {
      const secondAddress = useVPMemory
        ? CONFIG.PROTOCOL.DMRID_VP_ADDRESS      // 0x8F400
        : CONFIG.PROTOCOL.DMRID_NO_VP_ADDRESS;  // 0xB8000
      this.debugMessage(`Writing second region to 0x${secondAddress.toString(16)} (${secondRegionData.length} bytes)`);
      
      const firstRegionProgress = (firstRegionData.length / totalLength) * 100;
      await this.writeFlash(secondAddress, secondRegionData, (p) => {
        const overallProgress = firstRegionProgress + (p * secondRegionData.length / totalLength);
        this.reportProgress(overallProgress, `Writing DMR IDs: ${Math.round(overallProgress)}%`);
        if (onProgress) onProgress(overallProgress);
      });
    }
    
    // Reinitialize DMR ID cache on radio
    await this.sendSTM32Command(6, 0);  // Save settings and reboot
    
    this.debugMessage('=== MK22 SERIAL WRITE DMR DATABASE COMPLETE ===');
    this.reportProgress(100, 'DMR DB write complete');
  }

  /**
   * Write DMR ID database to STM32 radio (MD-UV380, MD-9600, etc.)
   * Uses OpenGD77 serial protocol with flash writing
   * Based on DMRIDWrite case in CodeplugComms.cs and DMRIDForm.cs
   * Supports two-region write with STM32_FLASH_OFFSET applied to both addresses
   */
  async writeDMRDatabaseSTM32(firstRegionData, secondRegionData, useVPMemory, onProgress) {
    this.debugMessage('=== STM32 WRITE DMR DATABASE START ===');
    
    // DMR ID database address - for STM32 needs STM32_FLASH_ADDRESS_OFFSET added
    // C# DMRIDForm.cs: startDataAddressInTheRadio = num + OpenGD77Form.STM32_FLASH_ADDRESS_OFFSET
    const DMRID_START = CONFIG.PROTOCOL.DMRID_START;  // 0x30000
    const STM32_FLASH_OFFSET = CONFIG.PROTOCOL.STM32_FLASH_OFFSET;  // 0x20000
    const STM32_DMRID_ADDR = DMRID_START + STM32_FLASH_OFFSET;  // 0x50000
    const totalLength = firstRegionData.length + (secondRegionData ? secondRegionData.length : 0);
    
    this.debugMessage(`DMR ID buffer address: 0x${DMRID_START.toString(16)}`);
    this.debugMessage(`STM32 radio address: 0x${STM32_DMRID_ADDR.toString(16)} (with 0x${STM32_FLASH_OFFSET.toString(16)} offset)`);
    this.debugMessage(`First region: ${firstRegionData.length} bytes`);
    this.debugMessage(`Second region: ${secondRegionData ? secondRegionData.length + ' bytes' : 'none'}`);
    
    // Display status on radio screen
    await this.sendSTM32Command(1);                                 // Clear screen
    await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');   // Line 1
    await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');     // Line 2
    await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'DMR IDs');     // Line 3
    await this.sendSTM32Command(3);                                 // Render
    await this.sendSTM32Command(6, 4);                              // Flash red LED
    
    // Write first region to STM32 DMRID address
    await this.writeFlash(STM32_DMRID_ADDR, firstRegionData, (p) => {
      const overallProgress = secondRegionData
        ? (p * firstRegionData.length / totalLength)
        : p;
      this.reportProgress(overallProgress, `Writing DMR DB: ${Math.round(overallProgress)}%`);
      if (onProgress) onProgress(overallProgress);
    });
    
    // Write second region if present (from CPS DMRIDForm.cs two-region write)
    // STM32 radios need STM32_FLASH_OFFSET added to second region address too
    if (secondRegionData) {
      const baseSecondAddress = useVPMemory
        ? CONFIG.PROTOCOL.DMRID_VP_ADDRESS      // 0x8F400
        : CONFIG.PROTOCOL.DMRID_NO_VP_ADDRESS;  // 0xB8000
      const secondAddress = baseSecondAddress + STM32_FLASH_OFFSET;
      this.debugMessage(`Writing second region to 0x${secondAddress.toString(16)} (${secondRegionData.length} bytes)`);
      
      const firstRegionProgress = (firstRegionData.length / totalLength) * 100;
      await this.writeFlash(secondAddress, secondRegionData, (p) => {
        const overallProgress = firstRegionProgress + (p * secondRegionData.length / totalLength);
        this.reportProgress(overallProgress, `Writing DMR DB: ${Math.round(overallProgress)}%`);
        if (onProgress) onProgress(overallProgress);
      });
    }
    
    // The caller's finally saves settings and reboots the radio to leave CPS
    // mode and reload the DMR ID cache.
    this.debugMessage('=== STM32 WRITE DMR DATABASE COMPLETE ===');
    this.reportProgress(100, 'DMR DB write complete');
  }

  // ============== STM32 (TYT Radio) Serial Protocol Methods ==============
  // Based on OpenGD77Comms.cs for STM32 radios like MD-UV380, MD-9600, etc.

  /**
   * Read flash or EEPROM data (STM32 serial protocol)
   * This is used for STM32-based radios via serial port emulation over USB
   */
  async readFlashOrEEPROM(startAddress, length, mode, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('=== STM32 READ FLASH/EEPROM START ===');
    this.debugMessage(`Start address: 0x${startAddress.toString(16)}, Length: ${length} bytes, Mode: ${mode}`);
    
    this.reportProgress(0, 'Reading data...');
    
    const buffer = new Uint8Array(length);
    let currentAddress = startAddress;
    let bufferPosition = 0;
    let lastProgress = 0;
    let readCount = 0;
    let shortRetries = 0;
    const MAX_SHORT_RETRIES = 4;
    
    try {
      while (bufferPosition < length) {
        let readLength = length - bufferPosition;
        // Use the configured USB buffer size (1024 for modern firmware, 32 for older)
        if (readLength > this.usbBufferSize) readLength = this.usbBufferSize;
        
        // Build read command: R, mode, address (4 bytes), length (2 bytes)
        const readCmd = new Uint8Array([
          0x52, // 'R' - Read command
          mode,
          (currentAddress >> 24) & 0xFF,
          (currentAddress >> 16) & 0xFF,
          (currentAddress >> 8) & 0xFF,
          currentAddress & 0xFF,
          (readLength >> 8) & 0xFF,
          readLength & 0xFF
        ]);
        
        // Log first few reads in detail, then periodically
        if (readCount < 3 || readCount % 100 === 0) {
          this.debugMessage(`Read #${readCount}: addr=0x${currentAddress.toString(16)}, len=${readLength}`);
          this.debugLog(`Read command #${readCount}`, readCmd);
        }
        
        await this.sendData(readCmd);
        // Response format: [0x52, lengthHi, lengthLo, ...data]
        // Expect 3 header bytes + readLength data bytes
        const response = await this.receiveData(5000, readLength + 3);

        // The radio may deliver a chunk split across several USB packets. If
        // the response is empty, short, or not the expected 'R' frame, retry
        // the SAME chunk instead of advancing with partial data (a partial
        // advance desyncs every subsequent read for the rest of the transfer).
        const shortResponse = !response || response.length < 3 ||
          response[0] !== 0x52 ||
          Math.min((response[1] << 8) + response[2], readLength, response.length - 3) < readLength;
        if (shortResponse) {
          shortRetries++;
          if (shortRetries <= MAX_SHORT_RETRIES) {
            const got = response ? response.length : 0;
            this.debugMessage(`Incomplete read at 0x${currentAddress.toString(16)} (${got} bytes, attempt ${shortRetries}/${MAX_SHORT_RETRIES}) - retrying`);
            // Drop any late/stale bytes so the retry starts clean.
            if (Array.isArray(this._serialBuffer)) this._serialBuffer.length = 0;
            await this.delay(50);
            continue;
          }
          if (!response || response.length === 0) {
            this.debugMessage(`=== STM32 READ ERROR at address 0x${currentAddress.toString(16)} ===`);
            this.debugMessage(`Empty response received (no data from radio)`);
            throw new Error(`Read error at address 0x${currentAddress.toString(16)}: No response from radio`);
          }
          this.debugLog('Incomplete read response', response);
          throw new Error(`Read error at address 0x${currentAddress.toString(16)}: incomplete response (${response.length} bytes)`);
        }

        shortRetries = 0;

        if (readCount < 3 || readCount % 100 === 0) {
          this.debugLog(`Read response #${readCount}`, response);
          this.debugMessage(`Response[0]=0x${response[0].toString(16).padStart(2, '0')} (expected: 0x52 = 'R')`);
        }

        // response[0] is guaranteed 0x52 and the payload complete at this point.
        const responseLength = (response[1] << 8) + response[2];
        if (readCount < 3) {
          this.debugMessage(`Response length field: ${responseLength} bytes`);
        }
        const safeLength = Math.min(responseLength, readLength, response.length - 3);
        for (let i = 0; i < safeLength; i++) {
          buffer[bufferPosition++] = response[i + 3];
        }
        currentAddress += safeLength;

        const progress = (bufferPosition / length) * 100;
        if (Math.floor(progress) !== lastProgress) {
          lastProgress = Math.floor(progress);
          this.reportProgress(progress, `Reading: ${Math.round(progress)}%`);
          if (onProgress) onProgress(progress);
        }

        readCount++;
      }
      
      this.debugMessage(`=== STM32 READ FLASH/EEPROM COMPLETE ===`);
      this.debugMessage(`Total reads: ${readCount}, Total bytes: ${bufferPosition}`);
      this.reportProgress(100, 'Read complete');
      return buffer;
      
    } catch (error) {
      this.debugMessage(`=== STM32 READ FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Read failed');
      throw error;
    }
  }

  /**
   * Get the write command character for the current radio type
   * MK22 radios use 'W' (0x57) for write commands
   * STM32 radios use 'X' (0x58) for write commands - 'W' is a fake/echo command!
   * Reference: STM32 firmware usb_com.c handleCPSRequest():
   *   case 'X': cpsHandleWriteCommand();  // Real write
   *   case 'W': // Fake write - just echoes back
   */
  getWriteCommandChar() {
    if (this.isFlashBasedRadio()) {
      return 0x58; // 'X' for STM32 radios
    }
    return 0x57; // 'W' for MK22 radios
  }

  /**
   * Prepare flash sector for writing (STM32)
   * Decompiled C#: Uses writeCommandCharacter for command byte
   */
  async flashWritePrepareSector(address) {
    const sector = Math.floor(address / CONFIG.PROTOCOL.STM32_SECTOR_SIZE);
    const writeChar = this.getWriteCommandChar();
    if (Array.isArray(this._serialBuffer) && this._serialBuffer.length) this._serialBuffer.length = 0;

    this.debugMessage(`STM32 Flash: Preparing sector ${sector} for address 0x${address.toString(16)} (cmd: 0x${writeChar.toString(16)})`);
    
    const prepareCmd = new Uint8Array([
      writeChar,  // 'X' for STM32, 'W' for MK22
      0x01, // Prepare sector subcommand
      (sector >> 16) & 0xFF,
      (sector >> 8) & 0xFF,
      sector & 0xFF
    ]);
    
    this.debugLog('Flash prepare sector command', prepareCmd);

    if (await this._sendFlashCommand(prepareCmd, writeChar, 0x01)) {
      this.dataSector = sector;
      this.debugMessage(`Flash sector ${sector} prepared successfully`);
      return true;
    }
    this.debugMessage(`Flash sector ${sector} prepare FAILED`);
    return false;
  }

  /**
   * Send a flash command and wait for its [writeChar, subcommand] ack.
   *
   * The DM32 firmware intermittently leaves a stale command ack ('-', 0x2D) in
   * the stream or replies a little late, which used to abort a write and force
   * the user to retry. Retry a few times, dropping stale bytes and any leading
   * '-' acks between attempts.
   */
  async _sendFlashCommand(cmd, writeChar, subcommand, attempts = 6) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (Array.isArray(this._serialBuffer) && this._serialBuffer.length) this._serialBuffer.length = 0;
      await this.sendData(cmd);

      const response = await this.receiveData(1000, 2);
      // Skip any leading stale command-acks from a previous 'C' command.
      let i = 0;
      while (i < response.length && response[i] === 0x2D) i++;
      const frame = response.slice(i);

      if (frame.length >= 2 && frame[0] === writeChar && frame[1] === subcommand) {
        if (attempt > 1) {
          this.debugMessage(`Flash cmd 0x${subcommand.toString(16)} acked on attempt ${attempt}`);
        }
        return true;
      }

      this.debugLog(`Flash cmd 0x${subcommand.toString(16)} unexpected response (attempt ${attempt}/${attempts})`, response);
      await this.delay(30);
    }
    return false;
  }

  /**
   * Send flash data (STM32)
   * Decompiled C#: Uses writeCommandCharacter
   */
  async flashSendData(address, data) {
    const len = data.length;
    const writeChar = this.getWriteCommandChar();
    if (Array.isArray(this._serialBuffer) && this._serialBuffer.length) this._serialBuffer.length = 0;
    const sendCmd = new Uint8Array(8 + len);
    
    sendCmd[0] = writeChar; // 'X' for STM32, 'W' for MK22
    sendCmd[1] = 0x02; // Send data subcommand
    sendCmd[2] = (address >> 24) & 0xFF;
    sendCmd[3] = (address >> 16) & 0xFF;
    sendCmd[4] = (address >> 8) & 0xFF;
    sendCmd[5] = address & 0xFF;
    sendCmd[6] = (len >> 8) & 0xFF;
    sendCmd[7] = len & 0xFF;
    sendCmd.set(data, 8);
    
    const shouldLog = address % 1024 === 0;
    if (shouldLog) {
      this.debugMessage(`STM32 Flash: Sending ${len} bytes to address 0x${address.toString(16)}`);
    }
    
    const success = await this._sendFlashCommand(sendCmd, writeChar, 0x02);
    if (!success) {
      this.debugMessage(`STM32 Flash: Send data FAILED at address 0x${address.toString(16)}`);
    } else if (shouldLog) {
      this.debugMessage(`STM32 Flash: Send data OK at address 0x${address.toString(16)}`);
    }
    
    return success;
  }

  /**
   * Write flash sector (STM32)
   * Decompiled C#: Uses writeCommandCharacter
   */
  async flashWriteSector() {
    const writeChar = this.getWriteCommandChar();
    if (Array.isArray(this._serialBuffer) && this._serialBuffer.length) this._serialBuffer.length = 0;
    this.debugMessage(`STM32 Flash: Writing sector ${this.dataSector} (cmd: 0x${writeChar.toString(16)})`);
    
    const writeCmd = new Uint8Array([writeChar, 0x03]); // Write sector subcommand
    
    const success = await this._sendFlashCommand(writeCmd, writeChar, 0x03);
    this.dataSector = -1;
    if (success) {
      this.debugMessage('Flash sector write completed successfully');
    } else {
      this.debugMessage('Flash sector write FAILED');
    }
    
    return success;
  }

  /**
   * Write to flash memory (STM32 radios)
   */
  async writeFlash(startAddress, data, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.reportProgress(0, 'Writing flash...');
    this.dataSector = -1;
    
    let currentAddress = startAddress;
    let dataPosition = 0;
    let lastProgress = 0;
    const totalLength = data.length;
    
    try {
      while (dataPosition < totalLength) {
        let writeLength = totalLength - dataPosition;
        if (writeLength > this.usbBufferSize) writeLength = this.usbBufferSize;
        
        // Prepare sector if needed
        if (this.dataSector === -1) {
          if (!await this.flashWritePrepareSector(currentAddress)) {
            throw new Error('Failed to prepare flash sector');
          }
        }
        
        // Calculate how much we can write before sector boundary
        let bytesToWrite = 0;
        for (let i = 0; i < writeLength; i++) {
          bytesToWrite++;
          // Check if next byte position would be in a different sector
          if (this.dataSector !== Math.floor((currentAddress + bytesToWrite) / CONFIG.PROTOCOL.STM32_SECTOR_SIZE)) {
            break;
          }
        }
        if (bytesToWrite === 0) bytesToWrite = writeLength;
        
        const chunkData = data.slice(dataPosition, dataPosition + bytesToWrite);
        
        if (!await this.flashSendData(currentAddress, chunkData)) {
          throw new Error('Failed to send flash data');
        }
        
        const progress = (dataPosition / totalLength) * 100;
        if (Math.floor(progress) !== lastProgress) {
          lastProgress = Math.floor(progress);
          this.reportProgress(progress, `Writing: ${Math.round(progress)}%`);
          if (onProgress) onProgress(progress);
        }
        
        currentAddress += bytesToWrite;
        dataPosition += bytesToWrite;
        
        // Write sector if we crossed a boundary
        if (this.dataSector !== Math.floor(currentAddress / CONFIG.PROTOCOL.STM32_SECTOR_SIZE)) {
          if (!await this.flashWriteSector()) {
            throw new Error('Failed to write flash sector');
          }
        }
      }
      
      // Write final sector if needed
      if (this.dataSector !== -1) {
        if (!await this.flashWriteSector()) {
          throw new Error('Failed to write final flash sector');
        }
      }
      
      this.reportProgress(100, 'Flash write complete');
      
    } catch (error) {
      this.reportProgress(0, 'Flash write failed');
      throw error;
    }
  }

  /**
   * Write to EEPROM (STM32 radios)
   * Decompiled C#: Uses writeCommandCharacter ('X' for STM32, 'W' for MK22)
   */
  async writeEEPROM(startAddress, data, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.reportProgress(0, 'Writing EEPROM...');
    const writeChar = this.getWriteCommandChar();
    
    let currentAddress = startAddress;
    let dataPosition = 0;
    let lastProgress = 0;
    const totalLength = data.length;
    let currentSector = -1;
    
    try {
      while (dataPosition < totalLength) {
        let writeLength = totalLength - dataPosition;
        if (writeLength > this.usbBufferSize) writeLength = this.usbBufferSize;
        
        if (currentSector === -1) {
          currentSector = Math.floor(currentAddress / 128);
        }
        
        // Calculate bytes we can write in this sector
        let bytesToWrite = 0;
        for (let i = 0; i < writeLength; i++) {
          bytesToWrite++;
          if (currentSector !== Math.floor((currentAddress + bytesToWrite) / 128)) {
            currentSector = -1;
            break;
          }
        }
        
        // Build EEPROM write command
        const writeCmd = new Uint8Array(8 + bytesToWrite);
        writeCmd[0] = writeChar; // 'X' for STM32, 'W' for MK22
        writeCmd[1] = 0x04; // EEPROM write subcommand
        writeCmd[2] = (currentAddress >> 24) & 0xFF;
        writeCmd[3] = (currentAddress >> 16) & 0xFF;
        writeCmd[4] = (currentAddress >> 8) & 0xFF;
        writeCmd[5] = currentAddress & 0xFF;
        writeCmd[6] = (bytesToWrite >> 8) & 0xFF;
        writeCmd[7] = bytesToWrite & 0xFF;
        
        for (let i = 0; i < bytesToWrite; i++) {
          writeCmd[8 + i] = data[dataPosition + i];
        }
        
        await this.sendData(writeCmd);
        const response = await this.receiveData();
        
        if (response[0] === writeCmd[0] && response[1] === writeCmd[1]) {
          const progress = (dataPosition / totalLength) * 100;
          if (Math.floor(progress) !== lastProgress) {
            lastProgress = Math.floor(progress);
            this.reportProgress(progress, `Writing EEPROM: ${Math.round(progress)}%`);
            if (onProgress) onProgress(progress);
          }
          currentAddress += bytesToWrite;
          dataPosition += bytesToWrite;
        } else {
          throw new Error(`EEPROM write error at address 0x${currentAddress.toString(16)}`);
        }
      }
      
      this.reportProgress(100, 'EEPROM write complete');
      
    } catch (error) {
      this.reportProgress(0, 'EEPROM write failed');
      throw error;
    }
  }

  // ============== Calibration and Radio Info Methods ==============

  /**
   * Read radio information from radio
   * Returns hardware and firmware details
   * Works for both MK22 and STM32 radios
   */
  async readRadioInfo() {
    return this._serialized('read radio info', () => this._readRadioInfoImpl());
  }

  async _readRadioInfoImpl() {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('=== READ RADIO INFO START ===');

    let enteredCpsMode = false;
    try {
      await this.initProtocol();
      enteredCpsMode = !this.isHIDMode;
      
      const DATA_MODE_READ_RADIO_INFO = CONFIG.PROTOCOL.DATA_MODE.READ_RADIO_INFO;
      const RADIO_INFO_SIZE = CONFIG.PROTOCOL.RADIO_INFO_SIZE;
      
      let infoBuffer;
      
      // Use CDC-ACM serial protocol for non-HID mode (applies to BOTH MK22 and STM32)
      if (!this.isHIDMode) {
        // CDC-ACM Serial mode: Use serial protocol with mode 9 (Radio Info)
        // Both MK22 and STM32 use the same protocol in serial mode
        infoBuffer = await this.readFlashOrEEPROM(0, RADIO_INFO_SIZE, DATA_MODE_READ_RADIO_INFO);
      } else {
        // MK22 HID bootloader mode: Read from special address with mode 9
        const readCmd = new Uint8Array([
          0x52, // 'R'
          DATA_MODE_READ_RADIO_INFO,
          0, 0, 0, 0, // Address (ignored for radio info)
          0, RADIO_INFO_SIZE // Length
        ]);
        
        await this.sendData(readCmd);
        const response = await this.receiveData(5000, RADIO_INFO_SIZE + 3);
        infoBuffer = response.slice(3);
      }
      
      // Parse radio info structure
      const view = new DataView(infoBuffer.buffer);
      const radioInfo = {
        structVersion: view.getUint32(0, true),
        radioType: view.getUint32(4, true),
        gitRevision: this.extractString(infoBuffer, 8, 16),
        buildDateTime: this.extractString(infoBuffer, 24, 16),
        flashId: view.getUint32(40, true),
        features: view.getUint16(44, true)
      };
      
      // Decode radio type
      const radioTypes = {
        0: 'GD-77',
        1: 'GD-77S',
        2: 'DM-1801',
        3: 'RD-5R',
        4: 'DM-1801A',
        5: 'MD-9600',
        6: 'MD-UV380',
        7: 'MD-380',
        8: 'DM-1701',
        9: 'MD-2017',
        10: 'DM-1701 RGB',
        11: 'DM-32',
        12: 'UV008'
      };
      radioInfo.radioTypeName = radioTypes[radioInfo.radioType] || `Unknown (${radioInfo.radioType})`;
      
      // Decode features
      radioInfo.featureFlags = {
        inverseVideo: !!(radioInfo.features & 0x01),
        voicePromptsInDMRIDSlot: !!(radioInfo.features & 0x02),
        voicePromptsLoaded: !!(radioInfo.features & 0x04)
      };
      
      this.debugMessage(`=== READ RADIO INFO COMPLETE ===`);
      this.debugMessage(`Radio: ${radioInfo.radioTypeName}, Git: ${radioInfo.gitRevision}`);
      
      // Store radioInfo for use by other methods (e.g., getRadioModel)
      this.radioInfo = radioInfo;

      // Firmware built after 2021-10-02 supports 1024-byte USB transfers.
      // Matches C# CPS readOpenGD77RadioInfoAndUpdateUSBBufferSize().
      const buildDate = parseInt((radioInfo.buildDateTime || '').substring(0, 8), 10);
      if (!isNaN(buildDate) && buildDate > 20211002) {
        this.setBufferSize(1024);
      } else {
        this.setBufferSize(32);
      }
      
      // Auto-detect platform type based on firmware-reported radio type
      // Firmware radio type codes (from uiGlobals.h RADIO_TYPE enum):
      //   0-4 = MK22 platform: GD-77(0), GD-77S(1), DM-1801(2), RD-5R(3), DM-1801A(4)
      //   5-10 = STM32 platform: MD-9600(5), MD-UV380(6), MD-380(7), DM-1701(8), MD-2017(9), DM-1701 RGB(10)
      //   11-12 = C7000 platform: DM-32(11), UV008(12)
      const FIRST_STM32_RADIO_TYPE = 5;  // MD-9600 is the first STM32-based radio type
      const FIRST_C7000_RADIO_TYPE = 11; // DM-32 is the first C7000-based radio type
      let detectedPlatform;
      if (radioInfo.radioType >= FIRST_C7000_RADIO_TYPE) {
        detectedPlatform = CONFIG.RADIO_TYPES.DM32;
      } else if (radioInfo.radioType >= FIRST_STM32_RADIO_TYPE) {
        detectedPlatform = CONFIG.RADIO_TYPES.STM32;
      } else {
        detectedPlatform = CONFIG.RADIO_TYPES.MK22;
      }
      
      if (this.radioType !== detectedPlatform) {
        // Log the platform switch for debugging - this is expected behavior when auto-detecting
        const previousType = this.radioType;
        this.radioType = detectedPlatform;

        this.debugMessage(`Auto-detecting platform: firmware reports type ${radioInfo.radioType} (${radioInfo.radioTypeName})`);
        this.debugMessage(`Platform changed from ${previousType} to ${detectedPlatform} based on firmware detection`);
        console.log(`Radio platform auto-detected: ${radioInfo.radioTypeName} → ${detectedPlatform}`);

        if (this._explicitRadioType) {
          // The user explicitly chose a type; use the detected one for this
          // session so it works, but don't silently persist over their choice.
          const msg = `Firmware reports ${radioInfo.radioTypeName}; using ${detectedPlatform} for this session`;
          this.debugMessage(msg);
          try { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(msg, 'warning'); } catch (e) { /* ignore */ }
        } else {
          // Save the auto-detected type so it persists for future sessions
          Utils.storage.set(CONFIG.STORAGE.RADIO_TYPE, detectedPlatform);
        }
      }
      
      return radioInfo;
      
    } catch (error) {
      this.debugMessage(`=== READ RADIO INFO FAILED: ${error.message} ===`);
      throw error;
    } finally {
      if (enteredCpsMode) {
        try { await this.exitCpsMode(); } catch (e) { /* ignore */ }
      }
    }
  }

  /**
   * Extract null-terminated string from buffer
   */
  extractString(buffer, offset, maxLength) {
    let str = '';
    for (let i = 0; i < maxLength; i++) {
      const char = buffer[offset + i];
      if (char === 0) break;
      str += String.fromCharCode(char);
    }
    return str;
  }

  /**
   * Read screen capture from radio (STM32 only)
   * Returns the current display buffer as image data
   * 
   * Screen Buffer Format (128x64 monochrome, 1024 bytes total):
   * - Organized as 8 horizontal "stripes", each 128 bytes
   * - Each stripe represents 8 rows of pixels (one byte per column)
   * - Each byte contains 8 vertical pixels, LSB = top pixel of the 8-pixel column
   * - Byte index: (y >> 3) * 128 + x, bit position: y & 7
   * 
   * IMPORTANT: Do NOT call initProtocol() before reading the screen buffer!
   * initProtocol() sends command 0 which enters CPS mode and overwrites the
   * current display with a "CPS" screen, corrupting the capture.
   * Reference: Original C# CPS does not call sendCommand(0) for screengrab.
   */
  async readScreenCapture() {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    if (!this.isFlashBasedRadio()) {
      throw new Error('Screen capture is only supported on STM32 radios');
    }

    this.debugMessage('=== READ SCREEN CAPTURE START ===');
    
    try {
      // NOTE: We intentionally do NOT call initProtocol() here!
      // initProtocol() sends command 0 (CPS mode) which would overwrite
      // the current screen content with the CPS screen before we can capture it.
      // The original C# CPS also does not send command 0 for screengrab.
      
      const DATA_MODE_READ_SCREEN = CONFIG.PROTOCOL.DATA_MODE.READ_SCREEN_GRAB;
      // Colour panels (MD-UV380/UV380Plus, MD-380, MD-2017, DM-1701, DM-32) are
      // 160x128 16-bit = 40960 bytes; MD-9600 is 128x64 1-bit = 1024 bytes.
      const radioInfo = this.radioInfo || {};
      const isColour = [6, 7, 8, 9, 10, 11, 12].includes(radioInfo.radioType);
      const SCREEN_BUFFER_SIZE = isColour ? 160 * 128 * 2 : 1024;

      const screenBuffer = await this.readFlashOrEEPROM(0, SCREEN_BUFFER_SIZE, DATA_MODE_READ_SCREEN);
      
      // NOTE: We also do NOT send command 5 (close CPS screen) since we never
      // entered CPS mode in the first place.
      
      this.debugMessage('=== READ SCREEN CAPTURE COMPLETE ===');
      
      return screenBuffer;
      
    } catch (error) {
      this.debugMessage(`=== READ SCREEN CAPTURE FAILED: ${error.message} ===`);
      throw error;
    }
  }

  // ============== Satellite TLE Methods ==============

  /**
   * Decompress a packed TLE field into its text form.
   * OpenGD77 packs two characters per byte as (highNibble << 4) | lowNibble,
   * each nibble indexing the lookup table "0123456789. +-*"
   * (see decompressTleData in the firmware's satellite.c).
   * @param {Uint8Array} compressed - packed bytes
   * @param {number} [byteLength] - number of packed bytes to decode (defaults to all)
   * @returns {string} decoded text (two characters per byte)
   */
  decompressTLEText(compressed, byteLength) {
    const LUT = '0123456789. +-*';
    const len = (byteLength != null) ? byteLength : compressed.length;
    let result = '';
    for (let i = 0; i < len; i++) {
      const byte = compressed[i] || 0;
      result += LUT[(byte >> 4) & 0x0F];
      result += LUT[byte & 0x0F];
    }
    return result;
  }

  /**
   * Pack a TLE field using the OpenGD77 format (two characters per byte).
   * The input length should be even; characters not present in the lookup
   * table are encoded as index 0. This is the exact inverse of the firmware's
   * decompressTleData and matches compressTLEText in OpenGD77Form.cs.
   * @param {string} text
   * @returns {Uint8Array}
   */
  compressTLEText(text) {
    const LUT = '0123456789. +-*';
    const result = new Uint8Array(Math.ceil(text.length / 2));
    for (let i = 0; i < text.length; i += 2) {
      const hi = Math.max(0, LUT.indexOf(text[i] != null ? text[i] : ' '));
      const lo = Math.max(0, LUT.indexOf(text[i + 1] != null ? text[i + 1] : ' '));
      result[i >> 1] = ((hi << 4) | lo) & 0xFF;
    }
    return result;
  }

  /**
   * Flash address of the custom data region for the connected radio.
   * MK22 radios expose the region at flash address 0; STM32 radios at
   * STM32_FLASH_OFFSET (0x20000). Matches the theme/boot-image writers.
   * @returns {number}
   */
  getCustomDataAddress() {
    return this.isFlashBasedRadio()
      ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET
      : 0x0;
  }

  /**
   * Build the 2520-byte satellite record block in the firmware's
   * codeplugSatelliteData_t layout (25 records x 100 bytes).
   * Record layout: name[8], TLE1[12], TLE2[28], rxFreq1, txFreq1, txCTCSS1,
   * armCTCSS1, rxFreq2, txFreq2, rxFreq3, txFreq3, additionalData[24].
   * Frequencies/CTCSS are little-endian; TLE fields are nibble-packed.
   * @param {Array} satellites
   * @returns {Uint8Array}
   */
  buildSatelliteRecords(satellites) {
    const RECORD_SIZE = 100;
    const BLOCK_SIZE = 2520;
    const MAX_SATELLITES = CONFIG.LIMITS.MAX_SATELLITES;
    const buffer = new Uint8Array(BLOCK_SIZE);

    const sorted = [...satellites].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || '')));
    const count = Math.min(sorted.length, MAX_SATELLITES);

    const writeU32LE = (o, val) => {
      const hz = (Math.round((val || 0) * 1000000) >>> 0);
      buffer[o] = hz & 0xFF;
      buffer[o + 1] = (hz >>> 8) & 0xFF;
      buffer[o + 2] = (hz >>> 16) & 0xFF;
      buffer[o + 3] = (hz >>> 24) & 0xFF;
    };
    const writeU16LE = (o, val) => {
      const v = Math.round((val || 0) * 10) & 0xFFFF;
      buffer[o] = v & 0xFF;
      buffer[o + 1] = (v >>> 8) & 0xFF;
    };

    for (let i = 0; i < count; i++) {
      const sat = sorted[i];
      const rec = i * RECORD_SIZE;

      // Name (8 bytes, ASCII, zero padded)
      const name = String(sat.name || '').substring(0, 8);
      for (let j = 0; j < name.length; j++) buffer[rec + j] = name.charCodeAt(j) & 0xFF;

      // TLE line 1 -> epoch year, epoch day, decay rate (24 chars -> 12 bytes)
      const line1 = String((sat.tle && sat.tle.line1) || '').padEnd(70, ' ');
      const tle1Text = line1.substring(18, 20) + line1.substring(20, 32) + line1.substring(33, 43);
      buffer.set(this.compressTLEText(tle1Text).slice(0, 12), rec + 8);

      // TLE line 2 -> inclination, RAAN, eccentricity, arg perigee, mean anomaly,
      // mean motion, orbit number (56 chars -> 28 bytes)
      const line2 = String((sat.tle && sat.tle.line2) || '').padEnd(70, ' ');
      const tle2Text =
        line2.substring(8, 16) + line2.substring(17, 25) + line2.substring(26, 33) +
        line2.substring(34, 42) + line2.substring(43, 51) + line2.substring(52, 63) +
        line2.substring(63, 68) + ' ';
      buffer.set(this.compressTLEText(tle2Text).slice(0, 28), rec + 20);

      writeU32LE(rec + 48, sat.rx1);
      writeU32LE(rec + 52, sat.tx1);
      writeU16LE(rec + 56, sat.txCtcss);
      writeU16LE(rec + 58, sat.armCtcss);
      writeU32LE(rec + 60, sat.rx2);
      writeU32LE(rec + 64, sat.tx2);
      writeU32LE(rec + 68, sat.rx3);
      writeU32LE(rec + 72, sat.tx3);

      // AdditionalData (24 bytes, ASCII, zero padded)
      const extra = String(sat.aprsConfig || '').substring(0, 24);
      for (let j = 0; j < extra.length; j++) buffer[rec + 76 + j] = extra.charCodeAt(j) & 0xFF;
    }

    return buffer;
  }

  /**
   * Read satellite data from radio
   * Automatically uses the correct protocol based on radio type
   */
  async readSatelliteData(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== READ SATELLITE DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);

    this.reportProgress(0, 'Reading satellite data...');

    try {
      await this.initProtocol();

      // Satellites live in the type-3 ("SATELLITE_TLE") custom data block.
      // Read the whole custom data region so we can locate the block by type.
      const CUSTOM_DATA_SIZE = 0x11A0; // 4512 bytes
      const customDataAddr = this.getCustomDataAddress();
      let customDataBuffer;

      if (this.useSerialProtocol()) {
        // Display status on radio screen
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Satellites');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);

        // Small delay to ensure command response is fully processed before bulk read
        await this.delay(50);

        const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
        customDataBuffer = await this.readFlashOrEEPROM(customDataAddr, CUSTOM_DATA_SIZE, DATA_MODE_READ_FLASH, (p) => {
          this.reportProgress(p * 0.8, `Reading satellites: ${Math.round(p * 0.8)}%`);
          if (onProgress) onProgress(p * 0.8);
        });

        await this.exitCpsMode();
      } else {
        // MK22 HID bootloader mode - use page-based protocol
        customDataBuffer = await this.readCodeplugData(customDataAddr, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.8, `Reading satellites: ${Math.round(p * 0.8)}%`);
          if (onProgress) onProgress(p * 0.8);
        });
      }

      // Parse satellite data from the type-3 custom data block
      const satellites = this.parseSatelliteBuffer(customDataBuffer);

      this.debugMessage(`=== READ SATELLITE DATA COMPLETE ===`);
      this.debugMessage(`Parsed ${satellites.length} satellites`);
      this.reportProgress(100, 'Satellite data read complete');

      return satellites;

    } catch (error) {
      this.debugMessage(`=== READ SATELLITE DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Satellite read failed');
      throw error;
    }
  }

  /**
   * Read data from codeplug area (helper for MK22)
   * Uses the correct protocol based on connection mode:
   * - HID mode: Uses page-based CWB protocol
   * - CDC-ACM serial mode: Uses readFlashOrEEPROM
   */
  async readCodeplugData(startAddress, length, onProgress) {
    // In CDC-ACM serial mode, use the serial protocol
    if (!this.isHIDMode) {
      // Use SPI Flash read mode for custom data areas
      const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
      return await this.readFlashOrEEPROM(startAddress, length, DATA_MODE_READ_FLASH, onProgress);
    }
    
    // HID bootloader mode: Use page-based CWB protocol
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    const numBlocks = Math.ceil(length / blockSize);
    const buffer = new Uint8Array(length);
    let currentPage = -1;
    
    for (let block = 0; block < numBlocks; block++) {
      const address = startAddress + (block * blockSize);
      const bufferOffset = block * blockSize;
      
      const page = Math.floor(address / bankSize);
      if (page !== currentPage) {
        currentPage = page;
        const pageAddr = page * bankSize;
        
        const cwbCmd = new Uint8Array([
          0x43, 0x57, 0x42, 0x04,
          (pageAddr >> 24) & 0xFF,
          (pageAddr >> 16) & 0xFF,
          (pageAddr >> 8) & 0xFF,
          pageAddr & 0xFF
        ]);
        
        await this.sendData(cwbCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Page switch failed');
        }
      }
      
      const addr16 = address & 0xFFFF;
      const readCmd = new Uint8Array([
        0x52,
        (addr16 >> 8) & 0xFF,
        addr16 & 0xFF,
        blockSize
      ]);
      
      await this.sendData(readCmd);
      const response = await this.receiveData();
      
      const bytesToCopy = Math.min(blockSize, length - bufferOffset);
      buffer.set(response.slice(4, 4 + bytesToCopy), bufferOffset);
      
      const progress = ((block + 1) / numBlocks) * 100;
      if (onProgress) onProgress(progress);
    }
    
    return buffer;
  }

  /**
   * Parse satellite data from a custom data region buffer.
   * Locates the type-3 (SATELLITE_TLE) block and decodes the
   * codeplugSatelliteData_t records from satellite.h.
   * @param {Uint8Array} buffer - whole custom data region
   * @returns {Array}
   */
  parseSatelliteBuffer(buffer) {
    const satellites = [];
    const SATELLITE_TYPE = 3;
    const RECORD_SIZE = 100;
    const MAX_SATELLITES = CONFIG.LIMITS.MAX_SATELLITES;
    const CUSTOM_DATA_HEADER_SIZE = 12;

    // Locate the type-3 custom data block
    let offset = CUSTOM_DATA_HEADER_SIZE;
    let dataOffset = -1;
    let dataLength = 0;
    while (offset + 8 <= buffer.length - 8) {
      const blockType = buffer[offset];
      const blockSize = (buffer[offset + 4] |
        (buffer[offset + 5] << 8) |
        (buffer[offset + 6] << 16) |
        (buffer[offset + 7] << 24)) >>> 0;

      if (blockType === SATELLITE_TYPE) {
        dataOffset = offset + 8;
        dataLength = blockSize;
        break;
      }
      if (blockType === 0xFF || blockType === 0 || blockSize === 0 || blockSize > 0x10000) {
        break;
      }
      offset += 8 + blockSize;
    }

    if (dataOffset < 0) {
      this.debugMessage('No satellite (type 3) custom data block found');
      return satellites;
    }

    const maxRecords = Math.min(MAX_SATELLITES, Math.floor(dataLength / RECORD_SIZE));
    for (let i = 0; i < maxRecords; i++) {
      const rec = dataOffset + i * RECORD_SIZE;
      if (rec + RECORD_SIZE > buffer.length) break;

      // Name (8 bytes, null/zero terminated)
      let name = '';
      for (let j = 0; j < 8; j++) {
        const c = buffer[rec + j];
        if (c === 0) break;
        name += String.fromCharCode(c);
      }
      name = name.trim();
      if (!name) break; // empty slot marks the end of the list

      // Packed TLE fields (the radio does not store the full TLE line)
      const tle1Fields = this.decompressTLEText(buffer.slice(rec + 8, rec + 20), 12);
      const tle2Fields = this.decompressTLEText(buffer.slice(rec + 20, rec + 48), 28);

      const readU32LE = (o) =>
        (buffer[o] | (buffer[o + 1] << 8) | (buffer[o + 2] << 16) | (buffer[o + 3] << 24)) >>> 0;
      const readU16LE = (o) => (buffer[o] | (buffer[o + 1] << 8)) >>> 0;

      const rx1 = readU32LE(rec + 48) / 1e6;
      const tx1 = readU32LE(rec + 52) / 1e6;
      const txCtcss = readU16LE(rec + 56) / 10;
      const armCtcss = readU16LE(rec + 58) / 10;
      const rx2 = readU32LE(rec + 60) / 1e6;
      const tx2 = readU32LE(rec + 64) / 1e6;
      const rx3 = readU32LE(rec + 68) / 1e6;
      const tx3 = readU32LE(rec + 72) / 1e6;

      // AdditionalData (24 bytes, null/zero terminated)
      let aprsConfig = '';
      for (let j = 0; j < 24; j++) {
        const c = buffer[rec + 76 + j];
        if (c === 0) break;
        aprsConfig += String.fromCharCode(c);
      }

      satellites.push({
        name,
        catalogueNumber: '',
        rx1,
        tx1,
        txCtcss,
        armCtcss,
        rx2,
        tx2,
        rx3,
        tx3,
        aprsConfig: aprsConfig.trim(),
        // The radio only stores the numeric TLE fields, so the full TLE line
        // cannot be reconstructed; keep the decoded fields for reference.
        tle: null,
        tleFields: { line1: tle1Fields, line2: tle2Fields }
      });
    }

    return satellites;
  }

  /**
   * Write satellite TLE data to radio.
   *
   * Stores the satellites as a type-3 ("SATELLITE_TLE") custom data block of
   * 2520 bytes inside the custom data region, preserving any existing blocks
   * (boot image, melody, theme). This mirrors the original CPS importKeps()
   * and the firmware's codeplugGetOpenGD77CustomData() lookup.
   *
   * @param {Array} satellites
   * @param {Function} onProgress
   */
  async writeSatelliteTLEs(satellites, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== WRITE SATELLITE DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`Satellites to write: ${satellites.length}`);

    this.reportProgress(0, 'Writing satellite data...');

    try {
      await this.initProtocol();

      const CUSTOM_DATA_SIZE = 0x11A0;       // 4512 bytes
      const CUSTOM_DATA_HEADER_SIZE = 12;    // "OpenGD77" (8) + version (4)
      const SATELLITE_TYPE = 3;              // CODEPLUG_CUSTOM_DATA_TYPE_SATELLITE_TLE
      const SATELLITE_BLOCK_SIZE = 2520;     // 25 records x 100 bytes
      const UNINITIALISED_TYPE = 0xFF;

      const customDataAddr = this.getCustomDataAddress();

      // Read the existing custom data region first so other blocks are preserved
      let customDataBuffer;
      if (this.useSerialProtocol()) {
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Satellites');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);
        await this.delay(50);

        const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
        customDataBuffer = await this.readFlashOrEEPROM(customDataAddr, CUSTOM_DATA_SIZE, DATA_MODE_READ_FLASH, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
      } else {
        // MK22 HID bootloader mode - use page-based protocol
        customDataBuffer = await this.readCodeplugData(customDataAddr, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
      }

      const writeBuffer = new Uint8Array(customDataBuffer);

      // Ensure the custom data header is present
      const headerStr = String.fromCharCode(...writeBuffer.slice(0, 8));
      if (headerStr !== 'OpenGD77') {
        this.debugMessage('Initializing custom data header');
        writeBuffer.set(new TextEncoder().encode('OpenGD77'), 0);
        writeBuffer[8] = 0; writeBuffer[9] = 0; writeBuffer[10] = 0; writeBuffer[11] = 0;
      }

      // Find the existing satellite block, or the first uninitialised slot with room
      let offset = CUSTOM_DATA_HEADER_SIZE;
      let targetOffset = -1;
      let uninitOffset = -1;
      while (offset < writeBuffer.length - 8) {
        const blockType = writeBuffer[offset];
        const blockSize = (writeBuffer[offset + 4] |
          (writeBuffer[offset + 5] << 8) |
          (writeBuffer[offset + 6] << 16) |
          (writeBuffer[offset + 7] << 24)) >>> 0;

        if (blockType === SATELLITE_TYPE) {
          targetOffset = offset;
          break;
        }

        if (blockType === UNINITIALISED_TYPE && uninitOffset === -1) {
          if (offset + 8 + SATELLITE_BLOCK_SIZE <= writeBuffer.length) {
            uninitOffset = offset;
          }
        }

        if (blockType === UNINITIALISED_TYPE || blockType === 0 || blockSize === 0 || blockSize > 0x10000) {
          break;
        }

        offset += 8 + blockSize;
      }

      if (targetOffset < 0) {
        if (uninitOffset < 0) {
          throw new Error('No space for satellite data in custom data area');
        }
        targetOffset = uninitOffset;
      }

      // Block header: type (4 bytes LE) + length (4 bytes LE)
      writeBuffer[targetOffset] = SATELLITE_TYPE;
      writeBuffer[targetOffset + 1] = 0;
      writeBuffer[targetOffset + 2] = 0;
      writeBuffer[targetOffset + 3] = 0;
      writeBuffer[targetOffset + 4] = SATELLITE_BLOCK_SIZE & 0xFF;
      writeBuffer[targetOffset + 5] = (SATELLITE_BLOCK_SIZE >> 8) & 0xFF;
      writeBuffer[targetOffset + 6] = 0;
      writeBuffer[targetOffset + 7] = 0;

      // Satellite records (always 2520 bytes, zero padded)
      const records = this.buildSatelliteRecords(satellites);
      writeBuffer.set(records, targetOffset + 8);

      this.debugMessage(`Writing satellite block (type ${SATELLITE_TYPE}) at custom data offset ${targetOffset}`);

      this.reportProgress(40, 'Writing satellite data to radio...');

      if (this.useSerialProtocol()) {
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Satellites');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 4);  // Flash red LED for write
        await this.delay(100);

        await this.writeFlash(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing satellites: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });

        // Set the radio clock before rebooting. The satellite screen will not
        // run if the clock is older than the firmware build date, so sync it
        // here (the firmware also reloads the satellite keps on this command).
        await this.sendSTM32Command(6, 3);  // Flash green LED (write complete)
        await this.sendSTM32Command(6, 7);  // Set clock + reload satellite keps
        await this.sendSTM32Command(6, 1);  // Reboot radio
      } else {
        // MK22 HID bootloader mode
        await this.writeCodeplugData(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing satellites: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });

        // Best-effort clock sync (UTC) so the satellite screen will run. The
        // MK22 DFU bootloader may not service firmware CPS commands, so use a
        // short timeout and don't fail the write if there is no response.
        try {
          await this.sendSTM32Command(6, 7, 0, 0, 0, 0, '', 1000);
        } catch (clockError) {
          this.debugMessage(`Clock sync after satellite write failed: ${clockError.message}`);
        }
      }

      this.debugMessage('=== WRITE SATELLITE DATA COMPLETE ===');
      this.reportProgress(100, 'Satellite data written successfully');

    } catch (error) {
      this.debugMessage(`=== WRITE SATELLITE DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Satellite write failed');
      throw error;
    }
  }

  /**
   * Read theme data from radio
   * Reads custom data area and parses theme blocks (day and/or night)
   * Based on ThemeForm.cs READ_THEME action
   * 
   * Custom data format:
   * - Header: "OpenGD77" (8 bytes) + version (4 bytes) = 12 bytes
   * - Blocks: [type:1][reserved:3][size:4 little-endian][data:size]
   * - Theme types: 4 = Day theme, 5 = Night theme
   * - Theme data: 64 bytes (32 colors × 2 bytes RGB565)
   * 
   * For DM-1701 (radioType == 8):
   * - RGB565 colors need byte-swap (red/blue swap) for display compatibility
   * - Other STM32 radios (MD-9600, MD-UV380, etc.) use standard RGB565
   * 
   * @param {Function} onProgress - Progress callback
   * @returns {Object} Object with dayTheme and nightTheme properties (or null if not found)
   */
  async readTheme(onProgress) {
    return this._serialized('read theme', () => this._readThemeImpl(onProgress));
  }

  async _readThemeImpl(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== READ THEME DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);

    this.reportProgress(0, 'Reading theme from radio...');
    
    try {
      await this.initProtocol();
      
      // Custom data area spans 0x1EE60 to 0x20000 in buffer (4512 bytes)
      // We read 4512 bytes (0x11A0) - the whole custom data region - to ensure we can parse all blocks
      const CUSTOM_DATA_SIZE = 0x11A0;  // 4512 bytes
      const CUSTOM_DATA_HEADER_SIZE = 12; // "OpenGD77" (8) + version (4)
      const THEME_SIZE = 64;  // 32 colors × 2 bytes RGB565
      const THEME_DAY_TYPE = 4;
      const THEME_NIGHT_TYPE = 5;
      
      let customDataBuffer;
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        // Serial mode: Read from appropriate flash address
        // STM32: Custom data is at 0x20000, MK22 serial: at 0x0
        const customDataAddr = this.isFlashBasedRadio() 
          ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET // 0x20000
          : 0x0;  // MK22 custom data at flash address 0x0
        
        // Display status on radio screen
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Theme');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);  // Flash green LED
        
        // Small delay to ensure command response is fully processed before bulk read
        await this.delay(50);
        
        const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
        customDataBuffer = await this.readFlashOrEEPROM(customDataAddr, CUSTOM_DATA_SIZE, DATA_MODE_READ_FLASH, (p) => {
          this.reportProgress(p * 0.8, `Reading theme: ${Math.round(p * 0.8)}%`);
          if (onProgress) onProgress(p * 0.8);
        });
        
        await this.exitCpsMode();

      } else {
        // MK22 HID bootloader mode - use page-based protocol
        const MK22_CUSTOM_DATA_ADDR = 0x0;
        
        customDataBuffer = await this.readCodeplugData(MK22_CUSTOM_DATA_ADDR, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.8, `Reading theme: ${Math.round(p * 0.8)}%`);
          if (onProgress) onProgress(p * 0.8);
        });
      }
      
      this.debugMessage(`Read ${customDataBuffer.length} bytes of custom data`);
      
      // Verify custom data header
      const headerStr = String.fromCharCode(...customDataBuffer.slice(0, 8));
      if (headerStr !== 'OpenGD77') {
        this.debugMessage(`Warning: Custom data header mismatch. Got: "${headerStr}"`);
        // Continue anyway - older firmware may have different format
      } else {
        this.debugMessage('Custom data header verified: OpenGD77');
      }
      
      // Parse custom data blocks to find theme data
      let offset = CUSTOM_DATA_HEADER_SIZE;  // Skip "OpenGD77" header + version
      let dayTheme = null;
      let nightTheme = null;
      
      while (offset < customDataBuffer.length - 8) {
        const blockType = customDataBuffer[offset];
        // Block size is stored as little-endian 4 bytes at offset+4
        const blockSize = customDataBuffer[offset + 4] | 
                         (customDataBuffer[offset + 5] << 8) | 
                         (customDataBuffer[offset + 6] << 16) | 
                         (customDataBuffer[offset + 7] << 24) >>> 0;
        
        this.debugMessage(`Block at offset ${offset}: type=${blockType}, size=${blockSize}`);
        
        // Check for end of blocks:
        // - uninitialised block type (0xFF)
        // - empty block type (0)
        // - zero or excessively large block size (> 64KB suggests corrupted data)
        if (blockType === 0xFF || blockType === 0 || blockSize === 0 || blockSize > 0x10000) {
          this.debugMessage('End of custom data blocks');
          break;
        }
        
        // Check if this is a theme block
        if ((blockType === THEME_DAY_TYPE || blockType === THEME_NIGHT_TYPE) && blockSize >= THEME_SIZE) {
          // Extract theme data (after 8-byte block header)
          const themeData = customDataBuffer.slice(offset + 8, offset + 8 + THEME_SIZE);
          
          // For DM-1701 (radioType == 8), convert RGB565 colors (byte swap red/blue)
          // From CPS: convertThemeColours565() only applied when radioType == 8
          // Other STM32 radios (MD-9600, MD-UV380, etc.) use standard RGB565
          let processedData = themeData;
          if (this.needsThemeColorSwap()) {
            processedData = this.convertThemeColorsRGB565(themeData);
          }
          
          if (blockType === THEME_DAY_TYPE) {
            dayTheme = processedData;
            this.debugMessage(`Found day theme at offset ${offset + 8}`);
          } else {
            nightTheme = processedData;
            this.debugMessage(`Found night theme at offset ${offset + 8}`);
          }
        }
        
        // Move to next block
        offset += 8 + blockSize;
      }
      
      this.debugMessage('=== READ THEME DATA COMPLETE ===');
      this.debugMessage(`Day theme: ${dayTheme ? 'Found' : 'Not found'}`);
      this.debugMessage(`Night theme: ${nightTheme ? 'Found' : 'Not found'}`);
      this.reportProgress(100, 'Theme read complete');
      
      return { dayTheme, nightTheme };
      
    } catch (error) {
      this.debugMessage(`=== READ THEME DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Theme read failed');
      throw error;
    }
  }

  /**
   * Write theme data to radio (standalone write without full codeplug)
   * Based on ThemeForm.cs WRITE_THEME action
   * 
   * This method reads the existing custom data, updates the theme block(s),
   * and writes back to the radio.
   * 
   * @param {Uint8Array} dayTheme - Day theme data (64 bytes) or null to leave unchanged
   * @param {Uint8Array} nightTheme - Night theme data (64 bytes) or null to leave unchanged
   * @param {Function} onProgress - Progress callback
   */
  async writeTheme(dayTheme, nightTheme, onProgress) {
    return this._serialized('write theme', () => this._writeThemeImpl(dayTheme, nightTheme, onProgress));
  }

  async _writeThemeImpl(dayTheme, nightTheme, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    if (!dayTheme && !nightTheme) {
      throw new Error('At least one theme (day or night) must be provided');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== WRITE THEME DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`Day theme: ${dayTheme ? 'Provided' : 'Not provided'}`);
    this.debugMessage(`Night theme: ${nightTheme ? 'Provided' : 'Not provided'}`);

    this.reportProgress(0, 'Writing theme to radio...');
    
    try {
      await this.initProtocol();
      
      // Custom data constants
      const CUSTOM_DATA_SIZE = 0x11A0;  // 4512 bytes
      const CUSTOM_DATA_HEADER_SIZE = 12; // "OpenGD77" (8) + version (4)
      const THEME_SIZE = 64;
      const THEME_DAY_TYPE = 4;
      const THEME_NIGHT_TYPE = 5;
      const UNINITIALISED_TYPE = 0xFF;
      
      let customDataBuffer;
      let customDataAddr;
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        // Serial mode: Use appropriate flash address
        // STM32: 0x20000, MK22 serial: 0x0
        customDataAddr = this.isFlashBasedRadio() 
          ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET // 0x20000
          : 0x0;  // MK22 custom data at flash address 0x0
        
        // Display status on radio screen
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Theme');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);
        
        // Small delay to ensure command response is fully processed before bulk read
        // This prevents leftover command responses from interfering with read data
        await this.delay(50);
        
        // First read existing custom data
        const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
        customDataBuffer = await this.readFlashOrEEPROM(customDataAddr, CUSTOM_DATA_SIZE, DATA_MODE_READ_FLASH, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
        
      } else {
        // MK22 HID bootloader mode
        customDataAddr = 0x0;
        customDataBuffer = await this.readCodeplugData(customDataAddr, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
      }
      
      // Convert to writable buffer
      const writeBuffer = new Uint8Array(customDataBuffer);
      
      // Verify custom data header
      const headerStr = String.fromCharCode(...writeBuffer.slice(0, 8));
      if (headerStr !== 'OpenGD77') {
        // Initialize header if not present
        this.debugMessage('Initializing custom data header');
        const header = new TextEncoder().encode('OpenGD77');
        writeBuffer.set(header, 0);
        writeBuffer[8] = 0; writeBuffer[9] = 0; writeBuffer[10] = 0; writeBuffer[11] = 0; // Version
      }
      
      // Helper to find or create theme block
      const updateThemeBlock = (themeType, themeData) => {
        if (!themeData) return;
        
        // Convert theme data for DM-1701 only (RGB565 byte swap)
        // Other STM32 radios (MD-9600, MD-UV380, etc.) use standard RGB565
        let processedData = themeData;
        if (this.needsThemeColorSwap()) {
          processedData = this.convertThemeColorsRGB565(themeData);
        }
        
        let offset = CUSTOM_DATA_HEADER_SIZE;
        let foundBlock = false;
        let uninitOffset = -1;
        
        // Search for existing theme block or uninitialised space
        while (offset < writeBuffer.length - 8) {
          const blockType = writeBuffer[offset];
          const blockSize = writeBuffer[offset + 4] | 
                           (writeBuffer[offset + 5] << 8) | 
                           (writeBuffer[offset + 6] << 16) | 
                           (writeBuffer[offset + 7] << 24) >>> 0;
          
          if (blockType === themeType && blockSize >= THEME_SIZE) {
            // Found existing theme block - update it
            writeBuffer.set(processedData, offset + 8);
            foundBlock = true;
            this.debugMessage(`Updated existing theme block type ${themeType} at offset ${offset}`);
            break;
          }
          
          // Track first uninitialised block that's large enough
          if (blockType === UNINITIALISED_TYPE && uninitOffset === -1) {
            if (offset + 8 + THEME_SIZE <= writeBuffer.length) {
              uninitOffset = offset;
            }
          }
          
          // End of blocks check
          if (blockType === UNINITIALISED_TYPE || blockType === 0 || blockSize === 0 || blockSize > 0x10000) {
            break;
          }
          
          offset += 8 + blockSize;
        }
        
        // Create new block if not found
        if (!foundBlock) {
          const targetOffset = uninitOffset >= 0 ? uninitOffset : offset;
          
          if (targetOffset + 8 + THEME_SIZE > writeBuffer.length) {
            throw new Error('No space for theme in custom data area');
          }
          
          // Write block header
          writeBuffer[targetOffset] = themeType;
          writeBuffer[targetOffset + 1] = 0;
          writeBuffer[targetOffset + 2] = 0;
          writeBuffer[targetOffset + 3] = 0;
          // Size (little-endian)
          writeBuffer[targetOffset + 4] = THEME_SIZE & 0xFF;
          writeBuffer[targetOffset + 5] = (THEME_SIZE >> 8) & 0xFF;
          writeBuffer[targetOffset + 6] = 0;
          writeBuffer[targetOffset + 7] = 0;
          // Theme data
          writeBuffer.set(processedData, targetOffset + 8);
          
          this.debugMessage(`Created new theme block type ${themeType} at offset ${targetOffset}`);
        }
      };
      
      // Update theme blocks
      if (dayTheme) updateThemeBlock(THEME_DAY_TYPE, dayTheme);
      if (nightTheme) updateThemeBlock(THEME_NIGHT_TYPE, nightTheme);
      
      this.reportProgress(40, 'Writing theme to radio...');
      
      // Write updated custom data back to radio with retry logic
      const maxWriteRetries = 3;
      let writeAttempt = 0;
      let writeSuccess = false;
      
      while (writeAttempt < maxWriteRetries && !writeSuccess) {
        writeAttempt++;
        try {
          if (this.useSerialProtocol()) {
            await this.sendSTM32Command(1);
            await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
            await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');
            await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Theme');
            await this.sendSTM32Command(3);
            await this.sendSTM32Command(6, 4);  // Flash red LED for write
            
            // Delay to ensure command response is fully processed before bulk write
            await this.delay(100);
            
            this.dataSector = -1;  // Reset sector tracking before write
            
            await this.writeFlash(customDataAddr, writeBuffer, (p) => {
              this.reportProgress(40 + (p * 0.55), `Writing theme: ${Math.round(40 + (p * 0.55))}%`);
              if (onProgress) onProgress(40 + (p * 0.55));
            });
            
            // Finalize and close session
            await this.sendSTM32Command(6, 3);  // Flash green LED (write complete)
            await this.sendSTM32Command(6, 1);  // Reboot radio
            
          } else {
            // MK22 HID bootloader mode
            await this.writeCodeplugData(customDataAddr, writeBuffer, (p) => {
              this.reportProgress(40 + (p * 0.55), `Writing theme: ${Math.round(40 + (p * 0.55))}%`);
              if (onProgress) onProgress(40 + (p * 0.55));
            });
          }
          writeSuccess = true;
        } catch (writeError) {
          this.debugMessage(`Theme write attempt ${writeAttempt}/${maxWriteRetries} failed: ${writeError.message}`);
          if (writeAttempt >= maxWriteRetries) throw writeError;
          // Wait before retry and re-initialize protocol
          await this.delay(500);
          try { await this.initProtocol(); } catch (e) { this.debugMessage(`Protocol re-init failed: ${e.message}`); }
        }
      }
      
      this.debugMessage('=== WRITE THEME DATA COMPLETE ===');
      this.reportProgress(100, 'Theme written successfully');
      
    } catch (error) {
      this.debugMessage(`=== WRITE THEME DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Theme write failed');
      // Leave CPS mode so the radio screen isn't left stuck on "Writing Theme".
      try { await this.exitCpsMode(); } catch (e) { /* ignore */ }
      throw error;
    }
  }

  /**
   * Write boot image to radio (standalone write without full codeplug)
   * Based on custom data block structure used by writeTheme
   * 
   * Boot image format: 1024 bytes (128x64 pixels, 1-bit, 8 stripes of 128 bytes)
   * Custom data block type: BOOT_IMAGE = 1
   * 
   * @param {Uint8Array} bootImageData - Boot image data (1024 bytes)
   * @param {Function} onProgress - Progress callback
   */
  async writeBootImage(bootImageData, onProgress) {
    return this._serialized('write boot image', () => this._writeBootImageImpl(bootImageData, onProgress));
  }

  async _writeBootImageImpl(bootImageData, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    if (!bootImageData || bootImageData.length !== 1024) {
      throw new Error('Boot image must be exactly 1024 bytes');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== WRITE BOOT IMAGE START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`Boot image size: ${bootImageData.length} bytes`);

    this.reportProgress(0, 'Writing boot image to radio...');
    
    try {
      await this.initProtocol();
      
      // Custom data constants
      const CUSTOM_DATA_SIZE = 0x11A0;  // 4512 bytes
      const CUSTOM_DATA_HEADER_SIZE = 12; // "OpenGD77" (8) + version (4)
      const BOOT_IMAGE_SIZE = 1024;
      const BOOT_IMAGE_TYPE = 1;  // CUSTOM_DATA_TYPE.BOOT_IMAGE
      const UNINITIALISED_TYPE = 0xFF;
      
      let customDataBuffer;
      let customDataAddr;
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        // Serial mode: Use appropriate flash address
        // STM32: 0x20000, MK22 serial: 0x0
        customDataAddr = this.isFlashBasedRadio() 
          ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET // 0x20000
          : 0x0;  // MK22 custom data at flash address 0x0
        
        // Display status on radio screen
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Boot Image');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);
        
        // Small delay to ensure command response is fully processed before bulk read
        // This prevents leftover command responses from interfering with read data
        await this.delay(50);
        
        // First read existing custom data
        const DATA_MODE_READ_FLASH = CONFIG.PROTOCOL.DATA_MODE.READ_FLASH;
        customDataBuffer = await this.readFlashOrEEPROM(customDataAddr, CUSTOM_DATA_SIZE, DATA_MODE_READ_FLASH, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
        
      } else {
        // MK22 HID bootloader mode
        customDataAddr = 0x0;
        customDataBuffer = await this.readCodeplugData(customDataAddr, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
      }
      
      // Convert to writable buffer
      const writeBuffer = new Uint8Array(customDataBuffer);
      
      // Verify custom data header
      const headerStr = String.fromCharCode(...writeBuffer.slice(0, 8));
      if (headerStr !== 'OpenGD77') {
        // Initialize header if not present
        this.debugMessage('Initializing custom data header');
        const header = new TextEncoder().encode('OpenGD77');
        writeBuffer.set(header, 0);
        writeBuffer[8] = 0; writeBuffer[9] = 0; writeBuffer[10] = 0; writeBuffer[11] = 0; // Version
      }
      
      // Find or create boot image block
      let offset = CUSTOM_DATA_HEADER_SIZE;
      let foundBlock = false;
      let uninitOffset = -1;
      
      // Search for existing boot image block or uninitialised space
      while (offset < writeBuffer.length - 8) {
        const blockType = writeBuffer[offset];
        const blockSize = writeBuffer[offset + 4] | 
                         (writeBuffer[offset + 5] << 8) | 
                         (writeBuffer[offset + 6] << 16) | 
                         (writeBuffer[offset + 7] << 24) >>> 0;
        
        if (blockType === BOOT_IMAGE_TYPE && blockSize >= BOOT_IMAGE_SIZE) {
          // Found existing boot image block - update it
          writeBuffer.set(bootImageData, offset + 8);
          foundBlock = true;
          this.debugMessage(`Updated existing boot image block at offset ${offset}`);
          break;
        }
        
        // Track first uninitialised block that's large enough
        if (blockType === UNINITIALISED_TYPE && uninitOffset === -1) {
          if (offset + 8 + BOOT_IMAGE_SIZE <= writeBuffer.length) {
            uninitOffset = offset;
          }
        }
        
        // End of blocks check
        if (blockType === UNINITIALISED_TYPE || blockType === 0 || blockSize === 0 || blockSize > 0x10000) {
          break;
        }
        
        offset += 8 + blockSize;
      }
      
      // Create new block if not found
      if (!foundBlock) {
        const targetOffset = uninitOffset >= 0 ? uninitOffset : offset;
        
        if (targetOffset + 8 + BOOT_IMAGE_SIZE > writeBuffer.length) {
          throw new Error('No space for boot image in custom data area');
        }
        
        // Write block header
        writeBuffer[targetOffset] = BOOT_IMAGE_TYPE;
        writeBuffer[targetOffset + 1] = 0;
        writeBuffer[targetOffset + 2] = 0;
        writeBuffer[targetOffset + 3] = 0;
        // Size (little-endian)
        writeBuffer[targetOffset + 4] = BOOT_IMAGE_SIZE & 0xFF;
        writeBuffer[targetOffset + 5] = (BOOT_IMAGE_SIZE >> 8) & 0xFF;
        writeBuffer[targetOffset + 6] = 0;
        writeBuffer[targetOffset + 7] = 0;
        // Boot image data
        writeBuffer.set(bootImageData, targetOffset + 8);
        
        this.debugMessage(`Created new boot image block at offset ${targetOffset}`);
      }
      
      this.reportProgress(40, 'Writing boot image to radio...');
      
      // Write updated custom data back to radio
      if (this.useSerialProtocol()) {
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Boot Image');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 4);  // Flash red LED for write
        
        // Small delay to ensure command response is fully processed before bulk write
        // This prevents leftover command responses from interfering with write data
        await this.delay(50);
        
        await this.writeFlash(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing boot image: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });
        
        // Finalize and close session
        await this.sendSTM32Command(6, 3);  // Flash green LED (write complete)
        await this.sendSTM32Command(6, 1);  // Reboot radio
        
      } else {
        // MK22 HID bootloader mode
        await this.writeCodeplugData(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing boot image: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });
      }
      
      this.debugMessage('=== WRITE BOOT IMAGE COMPLETE ===');
      this.reportProgress(100, 'Boot image written successfully');
      
    } catch (error) {
      this.debugMessage(`=== WRITE BOOT IMAGE FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Boot image write failed');
      throw error;
    }
  }

  /**
   * Write a block into the OpenGD77 custom data area (SPI flash).
   *
   * Custom data layout: "OpenGD77" (8) + version (4), then blocks of
   * [type:1][0:3][size:4 LE][data]. Uninitialised space is 0xFF.
   *
   * @param {number} blockType - Block type (G77.CUSTOM_DATA_TYPE, e.g. 2 = melody)
   * @param {Uint8Array} blockData - Block payload
   * @param {string} label - Label used in radio-screen/progress messages
   * @param {Function} onProgress - Progress callback
   */
  async writeCustomDataBlock(blockType, blockData, label, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }
    if (!blockData || blockData.length === 0) {
      throw new Error('No data to write');
    }

    const BLOCK_SIZE = blockData.length;
    // A block must fit the custom-data region and have a size that fits the
    // 2-byte size field, otherwise the stored size would be truncated.
    const MAX_BLOCK_SIZE = 0x11A0 - 12 - 8; // region - header - block header
    if (BLOCK_SIZE > 0xFFFF || BLOCK_SIZE > MAX_BLOCK_SIZE) {
      throw new Error(`Block too large: ${BLOCK_SIZE} bytes (max ${MAX_BLOCK_SIZE})`);
    }

    this.debugMessage('========================================');
    this.debugMessage(`=== WRITE ${label.toUpperCase()} START ===`);
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`Block type: ${blockType}, size: ${BLOCK_SIZE} bytes`);

    this.reportProgress(0, `Writing ${label} to radio...`);

    try {
      await this.initProtocol();

      const CUSTOM_DATA_SIZE = 0x11A0;  // 4512 bytes
      const CUSTOM_DATA_HEADER_SIZE = 12; // "OpenGD77" (8) + version (4)
      const UNINITIALISED_TYPE = 0xFF;

      let customDataBuffer;
      let customDataAddr;

      if (this.useSerialProtocol()) {
        customDataAddr = this.isFlashBasedRadio()
          ? CONFIG.PROTOCOL.STM32_FLASH_OFFSET // 0x20000
          : 0x0;  // MK22 custom data at flash address 0x0

        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, label);
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);

        await this.delay(50);

        customDataBuffer = await this.readFlashOrEEPROM(
          customDataAddr, CUSTOM_DATA_SIZE, CONFIG.PROTOCOL.DATA_MODE.READ_FLASH,
          (p) => {
            this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
            if (onProgress) onProgress(p * 0.3);
          }
        );
      } else {
        customDataAddr = 0x0;
        customDataBuffer = await this.readCodeplugData(customDataAddr, CUSTOM_DATA_SIZE, (p) => {
          this.reportProgress(p * 0.3, `Reading existing data: ${Math.round(p * 0.3)}%`);
          if (onProgress) onProgress(p * 0.3);
        });
      }

      const writeBuffer = new Uint8Array(customDataBuffer);

      // Verify/initialise custom data header
      const headerStr = String.fromCharCode(...writeBuffer.slice(0, 8));
      if (headerStr !== 'OpenGD77') {
        this.debugMessage('Initializing custom data header');
        writeBuffer.set(new TextEncoder().encode('OpenGD77'), 0);
        writeBuffer[8] = 0; writeBuffer[9] = 0; writeBuffer[10] = 0; writeBuffer[11] = 0;
      }

      // Find or create the block
      let offset = CUSTOM_DATA_HEADER_SIZE;
      let foundBlock = false;
      let uninitOffset = -1;

      while (offset < writeBuffer.length - 8) {
        const bType = writeBuffer[offset];
        const bSize = writeBuffer[offset + 4] |
                      (writeBuffer[offset + 5] << 8) |
                      (writeBuffer[offset + 6] << 16) |
                      (writeBuffer[offset + 7] << 24) >>> 0;

        if (bType === blockType && bSize >= BLOCK_SIZE) {
          writeBuffer.set(blockData, offset + 8);
          foundBlock = true;
          this.debugMessage(`Updated existing block at offset ${offset}`);
          break;
        }

        if (bType === UNINITIALISED_TYPE && uninitOffset === -1) {
          if (offset + 8 + BLOCK_SIZE <= writeBuffer.length) {
            uninitOffset = offset;
          }
        }

        if (bType === UNINITIALISED_TYPE || bType === 0 || bSize === 0 || bSize > 0x10000) {
          break;
        }

        offset += 8 + bSize;
      }

      if (!foundBlock) {
        const targetOffset = uninitOffset >= 0 ? uninitOffset : offset;

        if (targetOffset + 8 + BLOCK_SIZE > writeBuffer.length) {
          throw new Error(`No space for ${label} in custom data area`);
        }

        writeBuffer[targetOffset] = blockType;
        writeBuffer[targetOffset + 1] = 0;
        writeBuffer[targetOffset + 2] = 0;
        writeBuffer[targetOffset + 3] = 0;
        writeBuffer[targetOffset + 4] = BLOCK_SIZE & 0xFF;
        writeBuffer[targetOffset + 5] = (BLOCK_SIZE >> 8) & 0xFF;
        writeBuffer[targetOffset + 6] = 0;
        writeBuffer[targetOffset + 7] = 0;
        writeBuffer.set(blockData, targetOffset + 8);

        this.debugMessage(`Created new block at offset ${targetOffset}`);
      }

      this.reportProgress(40, `Writing ${label} to radio...`);

      if (this.useSerialProtocol()) {
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, label);
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 4);  // Flash red LED for write

        await this.delay(50);

        await this.writeFlash(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing ${label}: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });

        await this.sendSTM32Command(6, 3);  // Flash green LED (write complete)
        await this.sendSTM32Command(6, 1);  // Reboot radio
      } else {
        await this.writeCodeplugData(customDataAddr, writeBuffer, (p) => {
          this.reportProgress(40 + (p * 0.55), `Writing ${label}: ${Math.round(40 + (p * 0.55))}%`);
          if (onProgress) onProgress(40 + (p * 0.55));
        });
      }

      this.debugMessage(`=== WRITE ${label.toUpperCase()} COMPLETE ===`);
      this.reportProgress(100, `${label} written successfully`);

    } catch (error) {
      this.debugMessage(`=== WRITE ${label.toUpperCase()} FAILED: ${error.message} ===`);
      this.reportProgress(0, `${label} write failed`);
      throw error;
    }
  }

  /**
   * Write the boot melody to the radio.
   *
   * @param {Uint8Array} melodyData - 512 bytes of note,duration pairs (0,0 terminated)
   * @param {Function} onProgress - Progress callback
   */
  async writeBootMelody(melodyData, onProgress) {
    if (!melodyData || melodyData.length !== 512) {
      throw new Error('Boot melody must be exactly 512 bytes');
    }
    // CUSTOM_DATA_TYPE.BOOT_MELODY = 2
    return this.writeCustomDataBlock(2, melodyData, 'Boot Melody', onProgress);
  }

  /**
   * Convert theme colors between CPS and radio format (RGB565 byte swap)
   * For STM32 radios, red and blue components need to be swapped
   * 
   * From CPS OpenGD77Form.cs convertThemeColours565():
   * RGB565 format: RRRRRGGGGGGBBBBB
   * Swap: num5 = ((num4 & 0xF800) >> 11) | (num4 & 0x7E0) | ((num4 & 0x1F) << 11)
   * This swaps R (bits 15-11) and B (bits 4-0), keeping G (bits 10-5) in place
   * 
   * @param {Uint8Array} themeData - 64 bytes of theme data
   * @returns {Uint8Array} Converted theme data
   */
  convertThemeColorsRGB565(themeData) {
    const converted = new Uint8Array(themeData.length);
    
    for (let i = 0; i < themeData.length; i += 2) {
      // Read RGB565 value (big-endian in GTM file)
      const rgb565 = (themeData[i] << 8) | themeData[i + 1];
      
      // Extract components
      const r5 = (rgb565 >> 11) & 0x1F;  // Red: bits 15-11
      const g6 = (rgb565 >> 5) & 0x3F;   // Green: bits 10-5
      const b5 = rgb565 & 0x1F;          // Blue: bits 4-0
      
      // Swap R and B (for STM32 display compatibility)
      const swapped = (b5 << 11) | (g6 << 5) | r5;
      
      // Write back (big-endian)
      converted[i] = (swapped >> 8) & 0xFF;
      converted[i + 1] = swapped & 0xFF;
    }
    
    return converted;
  }

  /**
   * Check if the current radio model requires RGB565 color swap for themes
   * 
   * Based on the original CPS code, only DM-1701 (radioType == 8) needs
   * the red/blue byte swap in RGB565 theme colors. Other STM32 radios
   * (MD-9600, MD-UV380, MD-380, MD-2017, etc.) use standard RGB565.
   * 
   * @returns {boolean} True if theme colors need R/B swap
   */
  needsThemeColorSwap() {
    // Only DM-1701 (radioType == 8) needs color swap
    // See OpenGD77Form.cs convertThemeColours565() which checks radioType == 8
    if (this.radioInfo && this.radioInfo.radioType === 8) {
      return true;
    }
    return false;
  }

  /**
   * Write data to codeplug area (helper for MK22)
   * Uses the correct protocol based on connection mode:
   * - HID mode: Uses page-based CWB protocol
   * - CDC-ACM serial mode: Uses writeFlash
   */
  async writeCodeplugData(startAddress, data, onProgress) {
    // In CDC-ACM serial mode, use the serial protocol
    if (!this.isHIDMode) {
      // Use SPI Flash write for custom data areas
      return await this.writeFlash(startAddress, data, onProgress);
    }
    
    // HID bootloader mode: Use page-based CWB protocol
    const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
    const bankSize = CONFIG.PROTOCOL.BANK_SIZE;
    const numBlocks = Math.ceil(data.length / blockSize);
    let currentPage = -1;
    
    for (let block = 0; block < numBlocks; block++) {
      const address = startAddress + (block * blockSize);
      
      const page = Math.floor(address / bankSize);
      if (page !== currentPage) {
        currentPage = page;
        const pageAddr = page * bankSize;
        
        const cwbCmd = new Uint8Array([
          0x43, 0x57, 0x42, 0x04,
          (pageAddr >> 24) & 0xFF,
          (pageAddr >> 16) & 0xFF,
          (pageAddr >> 8) & 0xFF,
          pageAddr & 0xFF
        ]);
        
        await this.sendData(cwbCmd);
        const response = await this.receiveData();
        
        if (response[0] !== this.CMD_ACK) {
          throw new Error('Page switch failed');
        }
      }
      
      const addr16 = address & 0xFFFF;
      const writeCmd = new Uint8Array(4 + blockSize);
      writeCmd[0] = 0x57;
      writeCmd[1] = (addr16 >> 8) & 0xFF;
      writeCmd[2] = addr16 & 0xFF;
      writeCmd[3] = blockSize;
      
      const blockData = data.slice(block * blockSize, (block + 1) * blockSize);
      writeCmd.set(blockData, 4);
      
      // Pad if needed
      if (blockData.length < blockSize) {
        for (let i = blockData.length; i < blockSize; i++) {
          writeCmd[4 + i] = 0xFF;
        }
      }
      
      await this.sendData(writeCmd);
      const response = await this.receiveData();
      
      if (response[0] !== this.CMD_ACK) {
        throw new Error('Write block failed');
      }
      
      const progress = ((block + 1) / numBlocks) * 100;
      if (onProgress) onProgress(progress);
    }
  }

  /**
   * Write MK22 firmware (GD-77, DM-1801, RD-5R)
   * Based on Class10.cs method_8() for firmware writing
   * MK22 radios use HID bootloader protocol
   */
  /**
   * Merge an OpenGD77 additional-language file (.gla) into an unencrypted
   * firmware image.
   *
   * The firmware contains "GD77LANG" markers. The one followed 12 bytes later by
   * the ASCII string "English" is the built-in language slot; the *next*
   * "GD77LANG" marker is the user-language slot, which the .gla file is copied
   * into. The 4-byte big-endian value at marker+8 is a version that must match
   * between the firmware and the .gla file.
   *
   * Mirrors Utils.MergeLanguageFile() in the desktop CPS. Must be called on the
   * unencrypted firmware before it is ciphered/flashed.
   *
   * @param {Uint8Array} firmwareData - unencrypted firmware image (modified in place)
   * @param {Uint8Array} languageData - the .gla file contents
   * @returns {boolean} True if merged (or already merged)
   */
  mergeLanguageFile(firmwareData, languageData) {
    const fw = firmwareData instanceof Uint8Array ? firmwareData : new Uint8Array(firmwareData);
    const lang = languageData instanceof Uint8Array ? languageData : new Uint8Array(languageData);

    const findAll = (hay, pat) => {
      const out = [];
      for (let i = 0; i <= hay.length - pat.length; i++) {
        let ok = true;
        for (let j = 0; j < pat.length; j++) {
          if (hay[i + j] !== pat[j]) { ok = false; break; }
        }
        if (ok) out.push(i);
      }
      return out;
    };

    const GD77LANG = [0x47, 0x44, 0x37, 0x37, 0x4c, 0x41, 0x4e, 0x47];
    const IGNRLANG = [0x49, 0x47, 0x4e, 0x52, 0x4c, 0x41, 0x4e, 0x47];
    const English  = [0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73, 0x68];

    // Already merged
    if (findAll(fw, IGNRLANG).length >= 2) {
      this.debugMessage('Language already merged (IGNRLANG markers present)');
      return true;
    }

    const source = findAll(fw, GD77LANG);
    const source2 = findAll(lang, GD77LANG);

    if (source.length > 1 && source2.length === 1 && source2[0] === 0) {
      const version = (lang[8] << 24) | (lang[9] << 16) | (lang[10] << 8) | lang[11];
      const englishPositions = findAll(fw, English);

      for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < englishPositions.length; j++) {
          if (source[i] + 12 !== englishPositions[j]) continue;

          const fwVersion = (fw[source[i] + 8] << 24) | (fw[source[i] + 9] << 16) | (fw[source[i] + 10] << 8) | fw[source[i] + 11];
          if (fwVersion !== version) {
            throw new Error(`Language version mismatch: firmware ${fwVersion} vs file ${version}`);
          }
          if (i + 1 >= source.length) {
            throw new Error('No user-language slot found in firmware');
          }

          if (source[i + 1] + lang.length > fw.length) {
            throw new Error('Language data does not fit in the firmware slot');
          }
          fw.set(lang, source[i + 1]);
          this.debugMessage(`Language merged into firmware at 0x${source[i + 1].toString(16)}`);
          return true;
        }
      }
    }

    this.debugMessage(`Language merge failed (firmware markers: ${source.length}, language markers: ${source2.length})`);
    return false;
  }

  /**
   * Replace the boot-screen title string in a DM32 firmware image.
   *
   * The DM32 splash renders a hardcoded 8-char banner literal ("OpenDM32"),
   * which also appears as an entry in the credits list. Separately, each
   * embedded 4670-byte "GD77LANG" language slot has an openGD77 field at
   * offset 2205 (17 bytes). This overwrites both:
   *   - the hardcoded banner literal (truncated to its 8 bytes), so the boot
   *     screen changes, and
   *   - every valid language slot's openGD77 field (up to 16 chars), so the
   *     title stays consistent if the language is switched.
   *
   * Must be called AFTER mergeLanguageFile(), otherwise a merged language would
   * restore its own title. Operates in place on the unencrypted image.
   *
   * @param {Uint8Array} firmwareData - unencrypted firmware image (modified in place)
   * @param {string} title - desired boot title
   * @returns {boolean} True if at least one title location was patched
   */
  patchDM32BootTitle(firmwareData, title) {
    const fw = firmwareData instanceof Uint8Array ? firmwareData : new Uint8Array(firmwareData);
    const clean = String(title || '').replace(/[^\x20-\x7e]/g, '').slice(0, 16);
    if (clean.length === 0) return false;

    const GD77LANG = [0x47, 0x44, 0x37, 0x37, 0x4c, 0x41, 0x4e, 0x47];
    const BANNER = [0x4f, 0x70, 0x65, 0x6e, 0x44, 0x4d, 0x33, 0x32]; // "OpenDM32"
    const BANNER_LEN = 8;
    const TITLE_OFFSET = 2205;   // offsetof(stringsTable_t, openGD77)
    const FIELD_LEN = 17;        // LANGUAGE_TEXTS_LENGTH
    const SLOT_SIZE = 4670;      // bytes per embedded language slot

    const findAll = (pat) => {
      const out = [];
      for (let i = 0; i <= fw.length - pat.length; i++) {
        let ok = true;
        for (let j = 0; j < pat.length; j++) { if (fw[i + j] !== pat[j]) { ok = false; break; } }
        if (ok) out.push(i);
      }
      return out;
    };

    let patched = 0;

    // 1. Valid language slots: openGD77 field (up to 16 chars, NUL padded).
    for (const i of findAll(GD77LANG)) {
      // Only treat this as a language slot if the whole region is a
      // well-formed table: every fixed 17-byte string field must contain a
      // NUL. This accepts translated (e.g. Cyrillic) slots including any
      // language merged in by mergeLanguageFile(), while rejecting the
      // trailing junk "GD77LANG" marker present in some images.
      if (i + SLOT_SIZE > fw.length) continue;
      const fields = Math.floor((SLOT_SIZE - 12) / FIELD_LEN);
      let valid = true;
      for (let k = 0; k < fields && valid; k++) {
        const base = i + 12 + k * FIELD_LEN;
        let hasNull = false;
        for (let j = 0; j < FIELD_LEN; j++) { if (fw[base + j] === 0) { hasNull = true; break; } }
        if (!hasNull) valid = false;
      }
      if (!valid) continue;

      const at = i + TITLE_OFFSET;
      fw.fill(0, at, at + FIELD_LEN);
      for (let j = 0; j < clean.length; j++) fw[at + j] = clean.charCodeAt(j);
      patched++;
    }

    // 2. The hardcoded banner literal the splash actually draws. It is only 8
    //    bytes wide, so truncate and NUL-pad to fit. Run after step 1 so the
    //    just-rewritten language fields are no longer matched here.
    const banner = clean.slice(0, BANNER_LEN);
    for (const i of findAll(BANNER)) {
      for (let j = 0; j < BANNER_LEN; j++) {
        fw[i + j] = j < banner.length ? banner.charCodeAt(j) : 0;
      }
      patched++;
    }

    if (patched > 0) {
      this.debugMessage(`Boot title set to "${clean}" (${patched} location(s))`);
    } else {
      this.debugMessage('Boot title patch: no title locations found');
    }
    return patched > 0;
  }

  /**
   * Write firmware to MK22 radio (GD-77, GD-77S, DM-1801, RD-5R)
   * Based on FirmwareLoader_MK22.cs UploadFirmware (lines 71-154)
   * 
   * CRITICAL: This function encrypts firmware before upload. The input firmware
   * must be unencrypted binary. The model parameter is REQUIRED to select the
   * correct encryption key and bootloader configuration.
   * 
   * @param {Uint8Array} firmwareData - UNENCRYPTED firmware binary (OpenGD77 .bin file)
   * @param {string} model - REQUIRED. Radio model: 'GD-77', 'GD-77S', 'DM-1801', 'RD-5R'
   *                         (also accepts variations like 'OpenRD5R', 'OpenGD77', 'OpenDM1801' - automatically normalized)
   * @param {Function} onProgress - Progress callback (progress, message)
   * @param {Uint8Array} donorFirmware - Optional donor firmware for DMR codec (official Radioddity SGL)
   * @param {Object} options - Optional settings
   * @param {string} options.forceModel - Force a specific model even if validation fails (WARNING: may brick radio)
   */
  async writeFirmwareMK22(firmwareData, model, onProgress, donorFirmware = null, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    // Store the progress callback so this.reportProgress() can use it
    // This enables status messages to be displayed in the UI (e.g., donor firmware combination)
    const previousOnProgress = this.onProgress;
    this.onProgress = onProgress;

    const validModels = ['GD-77', 'GD-77S', 'DM-1801', 'RD-5R'];

    // Model parameter is REQUIRED - no default to prevent accidental firmware corruption
    if (!model && !options.forceModel) {
      throw new Error('Model parameter is required. Must be one of: GD-77, GD-77S, DM-1801, RD-5R');
    }

    // Normalize model name to handle variations (e.g., "OpenRD5R" -> "RD-5R", "OpenGD77" -> "GD-77")
    let normalizedModel = this.normalizeMK22Model(model);

    // Validate normalized model parameter
    if (!validModels.includes(normalizedModel)) {
      // Check if user is forcing a specific model
      if (options.forceModel && validModels.includes(options.forceModel)) {
        // User is forcing a valid model - show warning but proceed
        console.warn(`⚠️ WARNING: Model "${model}" not recognized. Forcing model "${options.forceModel}" as requested.`);
        console.warn('⚠️ DANGER: Using the wrong model can permanently brick your radio!');
        console.warn('⚠️ Make sure you know what you are doing before proceeding.');
        this.reportProgress(0, `WARNING: Forcing model ${options.forceModel} - RISK OF BRICKING`);
        normalizedModel = options.forceModel;
      } else {
        // Provide helpful error message with force option hint
        const forceHint = `\n\nIf you are certain about the correct model, you can use the forceModel option:\n` +
          `  options: { forceModel: 'GD-77' }  (or GD-77S, DM-1801, RD-5R)\n` +
          `⚠️ WARNING: Using the wrong model can permanently BRICK your radio!`;
        throw new Error(`Invalid model: ${model}. Supported models: ${validModels.join(', ')}${forceHint}`);
      }
    }
    
    // Use normalized model for the rest of the function
    model = normalizedModel;

    this.reportProgress(0, 'Starting MK22 firmware upload...');
    
    try {
      // Verify SGL file header if present and extract firmware
      if (firmwareData.length >= 4) {
        const header = String.fromCharCode(...firmwareData.slice(0, 4));
        if (header === 'SGL!') {
          // Skip SGL header - standard OpenGD77 SGL format uses 256-byte header
          firmwareData = firmwareData.slice(this.SGL_HEADER_SIZE);
          this.reportProgress(3, 'Extracted firmware from SGL container');
        }
      }
      
      // Combine with donor firmware if provided
      // Based on FirmwareLoader_MK22.cs lines 106-117
      if (donorFirmware && donorFirmware.length > 0) {
        this.reportProgress(5, `Combining with donor firmware (${donorFirmware.length} bytes)...`);
        console.log(`[MK22] Donor firmware provided: ${donorFirmware.length} bytes`);
        firmwareData = this.patchMK22WithDonorFirmware(firmwareData, donorFirmware, model);
        this.reportProgress(8, 'Donor combined - DMR enabled');
        console.log(`[MK22] Patched firmware size: ${firmwareData.length} bytes`);
      } else {
        console.log('[MK22] No donor firmware - DMR will NOT work (FM only mode)');
        this.reportProgress(5, 'No donor firmware - FM only mode');
      }
      
      // CRITICAL: Encrypt firmware before sending (FirmwareLoader_MK22.cs line 124)
      // The firmware file should be unencrypted binary, and we encrypt it here
      this.reportProgress(10, 'Encrypting firmware...');
      const encryptedFirmware = this.encryptMK22Firmware(firmwareData, model);
      this.reportProgress(12, 'Firmware encrypted');
      
      // Check firmware size (max 505856 bytes per FirmwareLoader_MK22.cs line 99)
      if (encryptedFirmware.length > 505856) {
        throw new Error('Firmware file too large (max 505856 bytes)');
      }
      
      // Send initial bootloader commands (FirmwareLoader_MK22.cs sendInitialCommands)
      await this.sendMK22BootloaderCommands(model);
      this.reportProgress(15, 'Bootloader ready');
      
      // Send firmware data in 32-byte chunks with checksums every 1024 bytes
      // (FirmwareLoader_MK22.cs sendFileData lines 210-270)
      await this.sendMK22FirmwareData(encryptedFirmware, onProgress);
      
      this.reportProgress(100, 'Firmware upload complete');
      
      if (onProgress) {
        onProgress(100, 'Firmware upload complete! Please restart your radio.');
      }
      
    } catch (error) {
      this.reportProgress(0, 'Firmware upload failed: ' + error.message);
      throw error;
    } finally {
      // Restore the previous progress callback
      this.onProgress = previousOnProgress;
    }
  }

  /**
   * Patch OpenGD77 firmware with donor (official) firmware
   * 
   * Based on FirmwareLoader_MK22.cs lines 106-117:
   * 1. Extract the last 493569 bytes from the donor firmware (SGL format)
   * 2. Decrypt the donor firmware using MK22 encryption (doEncrypt: false)
   * 3. Copy specific sections from OpenGD77 firmware into the decrypted donor
   *    - Bytes 0-1023 (first 1024 bytes)
   *    - Bytes 4864-327679 (322816 bytes at offset 4864)
   *    - Bytes 491664 to end
   * 
   * @param {Uint8Array} opengd77Firmware - OpenGD77 firmware binary
   * @param {Uint8Array} donorFirmware - Official Radioddity SGL firmware
   * @param {string} model - Radio model
   * @returns {Uint8Array} Combined firmware ready for encryption
   */
  patchMK22WithDonorFirmware(opengd77Firmware, donorFirmware, model) {
    const DONOR_SIZE = 493569;  // Size of firmware to extract from donor
    
    // First, extract encrypted firmware from donor SGL container
    // The SGL format stores encrypted firmware at the end of the file
    if (donorFirmware.length < DONOR_SIZE) {
      console.warn(`Donor firmware too small (${donorFirmware.length} bytes, need ${DONOR_SIZE}), skipping patching - DMR will NOT work`);
      this.reportProgress(6, 'WARNING: Donor too small, DMR disabled');
      return opengd77Firmware;
    }
    
    console.log(`[MK22 Patch] Starting: OpenGD77=${opengd77Firmware.length} bytes, Donor=${donorFirmware.length} bytes`);
    
    // Extract the last DONOR_SIZE bytes from donor firmware
    const donorStart = donorFirmware.length - DONOR_SIZE;
    const encryptedDonor = new Uint8Array(DONOR_SIZE);
    for (let i = 0; i < DONOR_SIZE; i++) {
      encryptedDonor[i] = donorFirmware[donorStart + i];
    }
    
    // Create combined firmware buffer (same size as donor or larger)
    const combinedSize = Math.max(opengd77Firmware.length, DONOR_SIZE);
    const combined = new Uint8Array(combinedSize);
    
    // Copy encrypted donor data
    combined.set(encryptedDonor.subarray(0, combinedSize));
    
    // Decrypt the donor firmware (doEncrypt: false)
    // Using FIXED decryption offset 17611 (0x44CB) for donor firmware
    // This is critical - donor firmware always uses this offset regardless of target model
    const decrypted = this.decryptDonorMK22Firmware(combined);
    
    // Now patch in OpenGD77 sections:
    // Copy bytes 0-1023 (first 1024 bytes) from OpenGD77
    const section1End = Math.min(1024, opengd77Firmware.length);
    for (let i = 0; i < section1End; i++) {
      decrypted[i] = opengd77Firmware[i];
    }
    
    // Copy bytes 4864-327679 (322816 bytes) from OpenGD77
    const section2Start = 4864;
    const section2Size = 322816;
    const section2End = Math.min(section2Start + section2Size, opengd77Firmware.length);
    for (let i = section2Start; i < section2End; i++) {
      decrypted[i] = opengd77Firmware[i];
    }
    
    // Copy bytes 491664 to end from OpenGD77
    const section3Start = 491664;
    const section3Bytes = opengd77Firmware.length > section3Start ? opengd77Firmware.length - section3Start : 0;
    if (section3Bytes > 0) {
      for (let i = section3Start; i < opengd77Firmware.length; i++) {
        decrypted[i] = opengd77Firmware[i];
      }
    }
    
    // Log success with details for debugging
    console.log(`[MK22 Patch] Success: Combined=${decrypted.length} bytes`);
    const section3Range = section3Bytes > 0 ? `${section3Start}-${opengd77Firmware.length - 1}` : 'empty';
    console.log(`[MK22 Patch] Sections: 1=0-${section1End - 1}, 2=${section2Start}-${section2End - 1}, 3=${section3Range}`);
    console.log(`[MK22 Patch] AMBE codec preserved: bytes ${section2End}-${section3Start - 1} (${section3Start - section2End} bytes)`);
    
    return decrypted;
  }

  /**
   * Decrypt MK22 DONOR firmware (official Radioddity firmware)
   * This uses a FIXED offset of 17611 (0x44CB) for decryption, regardless of target model.
   * Based on FirmwareLoader_MK22.cs encrypt() with doEncrypt=false (lines 491-542)
   * 
   * NOTE: This function is specifically for decrypting donor firmware during patching.
   * For general firmware decryption, use decryptMK22Firmware() which uses model-specific offsets.
   * 
   * @param {Uint8Array} encrypted - Encrypted donor firmware data
   * @returns {Uint8Array} Decrypted firmware
   */
  decryptDonorMK22Firmware(encrypted) {
    const encryptionTable = window.MK22_ENCRYPTION_TABLE;
    if (!encryptionTable) {
      console.warn('MK22 encryption table not available, returning data as-is');
      return encrypted;
    }
    
    const decrypted = new Uint8Array(encrypted.length);
    
    // Decryption offset for donor firmware is ALWAYS 17611 (0x44CB)
    // This is the default offset when doEncrypt=false in FirmwareLoader_MK22.cs line 493
    // The donor firmware (GD-77_V4.3.6.sgl) is encrypted with this fixed offset
    let tableIndex = 17611;
    
    for (let i = 0; i < encrypted.length; i++) {
      let byte = encrypted[i];
      
      // Decryption: reverse of encryption
      // 1. Reverse bit rotation: ~(((byte << 3) & 0xF8) | ((byte >> 5) & 7))
      byte = ~(((byte << 3) & 0xF8) | ((byte >> 5) & 7));
      // 2. XOR with encryption table
      byte = (byte & 0xFF) ^ encryptionTable[tableIndex];
      
      decrypted[i] = byte & 0xFF;
      
      tableIndex++;
      if (tableIndex >= 32767) {
        tableIndex = 0;
      }
    }
    
    return decrypted;
  }

  /**
   * Send MK22 bootloader initialization commands
   * Based on FirmwareLoader_MK22.cs sendInitialCommands (lines 340-489)
   * 
   * Command sequence:
   * 1. DOWNLOAD - Enter bootloader
   * 2. #UPDATE? - Update query
   * 3. Model+Key - Device type and encryption key
   * 4. F-PROG - Program mode
   * 5. Model string - Radio model identifier
   * 6. Model string 2 - Secondary identifier
   * 7. Version - Firmware version
   * 8. F-ERASE - Erase flash
   * 9. ACK - Acknowledge erase
   * 10. PROGRAM - Start programming
   * 
   * @param {string} model - Radio model ('GD-77', 'GD-77S', 'DM-1801', 'RD-5R')
   */
  async sendMK22BootloaderCommands(model) {
    const ACK = 0x41; // 'A'
    const responseOK = new Uint8Array([ACK]);
    
    // Define model-specific keys and strings
    const modelConfig = {
      'GD-77': {
        encodeKey: new Uint8Array([97, 109, 110, 98]), // "amnb"
        modelId: new Uint8Array([68, 86, 48, 49]), // "DV01"
        modelString1: new Uint8Array([83, 71, 45, 77, 68, 45, 55, 54, 48, 255, 255, 255, 255, 255, 255, 255]), // "SG-MD-760"
        modelString2: new Uint8Array([77, 68, 45, 55, 54, 48, 255, 255]) // "MD-760"
      },
      'GD-77S': {
        encodeKey: new Uint8Array([109, 64, 125, 99]),
        modelId: new Uint8Array([68, 86, 48, 50]), // "DV02"
        modelString1: new Uint8Array([83, 71, 45, 77, 68, 45, 55, 51, 48, 255, 255, 255, 255, 255, 255, 255]), // "SG-MD-730"
        modelString2: new Uint8Array([77, 68, 45, 55, 51, 48, 255, 255]) // "MD-730"
      },
      'DM-1801': {
        encodeKey: new Uint8Array([116, 33, 68, 57]),
        modelId: new Uint8Array([68, 86, 48, 51]), // "DV03"
        modelString1: new Uint8Array([66, 70, 45, 68, 77, 82, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]), // "BF-DMR"
        modelString2: new Uint8Array([49, 56, 48, 49, 255, 255, 255, 255]) // "1801"
      },
      'RD-5R': {
        encodeKey: new Uint8Array([83, 54, 55, 98]),
        modelId: new Uint8Array([68, 86, 48, 50]), // "DV02"
        modelString1: new Uint8Array([66, 70, 45, 53, 82, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]), // "BF-5R"
        modelString2: new Uint8Array([66, 70, 45, 53, 82, 255, 255, 255]) // "BF-5R"
      }
    };
    
    const config = modelConfig[model];
    if (!config) {
      throw new Error(`Unknown radio model: ${model}. Supported: GD-77, GD-77S, DM-1801, RD-5R`);
    }
    
    // Helper to send command and check response
    const sendAndCheck = async (cmd, expectedResponse, description) => {
      this.debugLog(`MK22 Bootloader: ${description}`, cmd);
      await this.sendData(cmd);
      const response = await this.receiveData();
      
      // Compare response
      for (let i = 0; i < expectedResponse.length; i++) {
        if (response[i] !== expectedResponse[i]) {
          // Include actual response bytes for debugging
          const expectedHex = Array.from(expectedResponse).map(b => b.toString(16).padStart(2, '0')).join(' ');
          const receivedHex = Array.from(response.slice(0, expectedResponse.length)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          throw new Error(`${description} failed - Expected: [${expectedHex}], Received: [${receivedHex}]`);
        }
      }
    };
    
    // MK22 Bootloader Protocol (from Python gd77-firmware-loader.py and C# FirmwareLoader_MK22.cs):
    // The device responds with what command it expects NEXT, not ACK!
    // 1. Send "DOWNLOAD" → Device responds with "#UPDATE?" (indicating what it wants next)
    // 2. Send ACK → Device responds with ACK
    
    // 1. DOWNLOAD command - device responds with "#UPDATE?" (not ACK!)
    await sendAndCheck(
      new Uint8Array([68, 79, 87, 78, 76, 79, 65, 68]), // "DOWNLOAD"
      new Uint8Array([35, 85, 80, 68, 65, 84, 69, 63]), // Expect "#UPDATE?" response
      'Sending DOWNLOAD command'
    );
    
    // 2. ACK command - device responds with ACK
    await sendAndCheck(
      new Uint8Array([ACK]), // Send ACK (0x41)
      responseOK, // Expect ACK response
      'Sending ACK command'
    );
    
    // 3. Model ID + encryption key
    const modelKeyCmd = new Uint8Array(8);
    modelKeyCmd.set(config.modelId, 0);
    modelKeyCmd.set(config.encodeKey, 4);
    await sendAndCheck(
      modelKeyCmd,
      config.modelId,
      'Sending model ID and encryption key'
    );
    
    // 4. F-PROG command
    await sendAndCheck(
      new Uint8Array([70, 45, 80, 82, 79, 71, 255, 255]), // "F-PROG"
      responseOK,
      'Sending F-PROG command'
    );
    
    // 5. Model string 1 (16 bytes)
    await sendAndCheck(
      config.modelString1,
      responseOK,
      'Sending radio model string 1'
    );
    
    // 6. Model string 2 (8 bytes)
    await sendAndCheck(
      config.modelString2,
      responseOK,
      'Sending radio model string 2'
    );
    
    // 7. Version string
    await sendAndCheck(
      new Uint8Array([86, 49, 46, 48, 48, 46, 48, 49]), // "V1.00.01"
      responseOK,
      'Sending version string'
    );
    
    // 8. F-ERASE command (erase flash)
    await sendAndCheck(
      new Uint8Array([70, 45, 69, 82, 65, 83, 69, 255]), // "F-ERASE"
      responseOK,
      'Sending F-ERASE command (flash erase)'
    );
    
    // 9. ACK after erase
    await sendAndCheck(
      new Uint8Array([ACK]),
      responseOK,
      'Sending post-erase ACK'
    );
    
    // 10. PROGRAM command (start programming)
    await sendAndCheck(
      new Uint8Array([80, 82, 79, 71, 82, 65, 77, 15]), // "PROGRAM" + 0x0F
      responseOK,
      'Sending PROGRAM command'
    );
  }

  /**
   * Send MK22 firmware data in 32-byte chunks
   * Based on FirmwareLoader_MK22.cs sendFileData (lines 210-270)
   * 
   * Protocol:
   * - Data sent in 32-byte chunks within 38-byte packets
   * - Packet format: [addr[4], length[2], data[32]]
   * - Checksum sent after every 1024 bytes
   * - Checksum format: "END" + 0xFF + 4-byte sum
   * 
   * @param {Uint8Array} encryptedFirmware - Encrypted firmware data
   * @param {Function} onProgress - Progress callback
   */
  async sendMK22FirmwareData(encryptedFirmware, onProgress) {
    const chunkSize = 32; // Size of data in each packet
    const checksumInterval = 1024; // Send checksum every 1KB
    const packetSize = 38; // Total packet size (6 header + 32 data)
    const totalSize = encryptedFirmware.length;
    const numKB = Math.ceil(totalSize / 1024); // Number of 1KB blocks in firmware
    
    let address = 0;
    let kbStart = 0; // Track start of current KB for checksum
    
    while (address < totalSize) {
      if (this.cancelOperation) {
        throw new Error('Operation cancelled');
      }
      
      // Update KB start when beginning a new 1KB block
      if (address % checksumInterval === 0) {
        kbStart = address;
      }
      
      // Create packet with address and length
      const packet = new Uint8Array(packetSize);
      packet.fill(0xFF); // Pad with 0xFF
      
      // Set address (bytes 0-3, big-endian)
      packet[0] = (address >> 24) & 0xFF;
      packet[1] = (address >> 16) & 0xFF;
      packet[2] = (address >> 8) & 0xFF;
      packet[3] = address & 0xFF;
      
      // Determine chunk size for this packet
      const remainingBytes = totalSize - address;
      const thisChunkSize = Math.min(chunkSize, remainingBytes);
      
      // Set length (bytes 4-5, big-endian)
      packet[4] = (thisChunkSize >> 8) & 0xFF;
      packet[5] = thisChunkSize & 0xFF;
      
      // Copy data (bytes 6-37)
      packet.set(encryptedFirmware.slice(address, address + thisChunkSize), 6);
      
      // Send packet with retry on transient comms errors (e.g. WebHID timeout)
      let lastError;
      let packetSent = false;
      for (let attempt = 0; attempt < this.MK22_WRITE_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          this.debugMessage(`Retrying data packet at 0x${address.toString(16)} (attempt ${attempt + 1}/${this.MK22_WRITE_MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, this.MK22_WRITE_RETRY_DELAY_MS));
        }
        try {
          await this.sendData(packet);
          const response = await this.receiveData();
          if (response[0] !== this.CMD_ACK) {
            throw new Error(`Data packet failed at address 0x${address.toString(16)}`);
          }
          packetSent = true;
          break;
        } catch (e) {
          lastError = e;
        }
      }
      if (!packetSent) {
        throw lastError;
      }
      
      address += thisChunkSize;
      
      // Send checksum after every 1024 bytes (but not at address 0 before any data)
      // kbStart tracks the start of the current KB block
      if (address % checksumInterval === 0 && address > 0) {
        await this.sendMK22Checksum(encryptedFirmware, kbStart, address);
        
        // Report progress
        const kbDone = Math.floor(address / 1024);
        const progress = 15 + (kbDone / numKB) * 80;
        this.reportProgress(progress, `Writing: ${kbDone}/${numKB} KB`);
        
        if (onProgress) {
          onProgress(progress, `Writing: ${kbDone}/${numKB} KB`);
        }
      }
    }
    
    // Send final checksum for remaining data if firmware size not divisible by 1024
    if (address % checksumInterval !== 0) {
      await this.sendMK22Checksum(encryptedFirmware, kbStart, address);
    }
  }

  /**
   * Send MK22 firmware checksum
   * Based on FirmwareLoader_MK22.cs createChecksumData (lines 185-198)
   * 
   * Format: "END" + 0xFF + 4-byte sum (little-endian)
   * Sum = byte-wise sum of data from startAddr to endAddr
   * 
   * @param {Uint8Array} data - Firmware data
   * @param {number} startAddr - Start address for checksum
   * @param {number} endAddr - End address for checksum (exclusive)
   */
  async sendMK22Checksum(data, startAddr, endAddr) {
    // Calculate checksum (simple byte-wise sum)
    let sum = 0;
    for (let i = startAddr; i < endAddr; i++) {
      sum += data[i];
    }
    
    // Create checksum packet: "END" + 0xFF + sum (little-endian)
    const checksumPacket = new Uint8Array(8);
    checksumPacket[0] = 69;  // 'E'
    checksumPacket[1] = 78;  // 'N'
    checksumPacket[2] = 68;  // 'D'
    checksumPacket[3] = 255; // 0xFF
    checksumPacket[4] = sum & 0xFF;
    checksumPacket[5] = (sum >> 8) & 0xFF;
    checksumPacket[6] = (sum >> 16) & 0xFF;
    checksumPacket[7] = (sum >> 24) & 0xFF;
    
    // Send checksum with retry on transient comms errors (e.g. WebHID timeout)
    let lastError;
    for (let attempt = 0; attempt < this.MK22_WRITE_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        this.debugMessage(`Retrying checksum for 0x${startAddr.toString(16)}-0x${endAddr.toString(16)} (attempt ${attempt + 1}/${this.MK22_WRITE_MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, this.MK22_WRITE_RETRY_DELAY_MS));
      }
      try {
        await this.sendData(checksumPacket);
        const response = await this.receiveData();
        if (response[0] !== this.CMD_ACK) {
          throw new Error(`Checksum verification failed at address range 0x${startAddr.toString(16)}-0x${endAddr.toString(16)}`);
        }
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  /**
   * Write STM32 firmware (MD-UV380, MD-9600, DM-1701, MD-2017, etc.)
   * Based on opengd77_stm32_firmware_loader.py DFU protocol
   * 
   * STM32 DFU uses USB control transfers, not bulk endpoints.
   * The radio must be in DFU mode (VID 0x0483, PID 0xDF11).
   * 
   * @param {Uint8Array} firmwareData - OpenGD77 firmware binary (.bin file)
   * @param {string} outputType - Radio model type: 'MD9600', 'MDUV380', 'MD2017', 'MD380', 'DM1701', 'RT84', 'RT3S'
   *                              or variations like 'MD-UV380', 'MD-9600' - automatically normalized
   * @param {Function} onProgress - Progress callback (progress, message)
   * @param {Uint8Array} donorFirmware - Optional donor firmware for AMBE codec (MD9600 official firmware)
   * @param {Object} options - Optional settings
   * @param {string} options.forceModel - Force a specific model even if validation fails (WARNING: may brick radio)
   */
  async writeFirmwareSTM32DFU(firmwareData, outputType = 'MDUV380', onProgress, donorFirmware = null, options = {}) {
    if (!this.device) {
      throw new Error('Not connected to radio');
    }

    // Store the progress callback so this.reportProgress() can use it
    // This enables status messages to be displayed in the UI (e.g., donor firmware combination)
    const previousOnProgress = this.onProgress;
    this.onProgress = onProgress;

    const validTypes = ['MD9600', 'MDUV380', 'MD2017', 'DM1701'];

    // Normalize outputType to handle variations
    let normalizedType = this.normalizeSTM32Model(outputType);

    // Validate normalized type parameter
    if (!validTypes.includes(normalizedType)) {
      // Check if user is forcing a specific type
      if (options.forceModel && validTypes.includes(options.forceModel)) {
        // User is forcing a valid type - show warning but proceed
        console.warn(`⚠️ WARNING: Model "${outputType}" not recognized. Forcing model "${options.forceModel}" as requested.`);
        console.warn('⚠️ DANGER: Using the wrong model/cipher can permanently brick your radio!');
        console.warn('⚠️ Make sure you know what you are doing before proceeding.');
        this.reportProgress(0, `WARNING: Forcing model ${options.forceModel} - RISK OF BRICKING`);
        normalizedType = options.forceModel;
      } else {
        // Provide helpful error message with force option hint
        const forceHint = `\n\nIf you are certain about the correct model, you can use the forceModel option:\n` +
          `  options: { forceModel: 'MDUV380' }  (or MD9600, MD2017, DM1701)\n` +
          `⚠️ WARNING: Using the wrong model/cipher can permanently BRICK your radio!`;
        throw new Error(`Invalid model type: ${outputType}. Supported types: ${validTypes.join(', ')}${forceHint}`);
      }
    }

    // Use normalized type for the rest of the function
    outputType = normalizedType;

    this.reportProgress(0, 'Starting STM32 DFU firmware upload...');
    
    try {
      // Validate firmware
      if (!firmwareData || firmwareData.length < 0x4000) {
        throw new Error('Firmware file is too small');
      }
      
      // Check file extension - should be .bin for STM32
      this.reportProgress(5, 'Validating firmware file...');
      
      // Select encryption cipher based on output type
      // External STM32_CIPHERS (full 1024 bytes) are REQUIRED
      const externalCiphers = typeof window !== 'undefined' && window.STM32_CIPHERS;
      
      if (!externalCiphers) {
        throw new Error('STM32 cipher tables not loaded. Please ensure stm32_ciphers.js is included.');
      }
      
      let cipher;
      switch (outputType) {
        case 'MD9600':
          cipher = externalCiphers.MD9600;
          break;
        case 'MDUV380':
        case 'MD2017':
          cipher = externalCiphers.MDUV380;
          break;
        case 'DM1701':
          // DM1701 and DM1801 use the same cipher (Baofeng DM-1701/DM-1801/RT-3S family)
          cipher = externalCiphers.DM1701;
          break;
        default:
          cipher = externalCiphers.MDUV380;
      }
      
      if (!cipher || cipher.length !== 1024) {
        throw new Error(`Invalid cipher for ${outputType}. Expected 1024 bytes, got ${cipher?.length || 0}`);
      }
      
      console.log(`Using external cipher (${cipher.length} bytes) for ${outputType}`);
      
      // Combine with donor firmware if provided (for AMBE codec support)
      // This matches the behavior in opengd77_stm32_firmware_loader.py and the decompiled CPS
      let combinedFirmware = new Uint8Array(firmwareData);
      
      if (donorFirmware && donorFirmware.length > 0) {
        this.reportProgress(8, 'Merging AMBE codec from donor firmware...');
        
        // Constants from Python loader and decompiled CPS:
        const DONOR_OFFSET = 0xC2C7C;           // 797820 - Source offset in donor firmware
        const AMBE_SECTION_SIZE = 0x48BB0;      // 297904 - Size of AMBE codec section
        const TARGET_OFFSET = 0x6937c;          // 430972 - Destination offset in OpenGD77 firmware
        const AMBE_SECTION_CIPHER_OFFSET = 892; // (0x6937c % 1024) - Offset for decryption
        
        // Validate donor firmware size
        if (donorFirmware.length < DONOR_OFFSET + AMBE_SECTION_SIZE) {
          console.warn('Donor firmware is too small. Skipping AMBE codec merge.');
          this.reportProgress(9, 'Warning: Donor firmware too small, skipping AMBE merge...');
        } else if (combinedFirmware.length < TARGET_OFFSET + AMBE_SECTION_SIZE) {
          console.warn('OpenGD77 firmware is too small for AMBE codec merge.');
          this.reportProgress(9, 'Warning: Firmware too small for AMBE merge...');
        } else {
          // Extract AMBE codec section from donor firmware
          const ambeSection = new Uint8Array(AMBE_SECTION_SIZE);
          for (let i = 0; i < AMBE_SECTION_SIZE; i++) {
            ambeSection[i] = donorFirmware[DONOR_OFFSET + i];
          }
          
          this.reportProgress(8, 'Decrypting AMBE codec section...');
          
          // Decrypt the AMBE section using MD9600 cipher
          // This matches the Python code: encBuf[j] ^= MD9600_ENCODE_CIPHER[(j + AMBE_SECTION_CIPHER_OFFSET) % 1024]
          const md9600Cipher = externalCiphers.MD9600;
          if (md9600Cipher && md9600Cipher.length === 1024) {
            for (let i = 0; i < AMBE_SECTION_SIZE; i++) {
              ambeSection[i] ^= md9600Cipher[(i + AMBE_SECTION_CIPHER_OFFSET) % 1024];
            }
            
            // Merge the decrypted AMBE section into OpenGD77 firmware
            for (let i = 0; i < AMBE_SECTION_SIZE; i++) {
              combinedFirmware[TARGET_OFFSET + i] = ambeSection[i];
            }
            
            this.reportProgress(9, 'AMBE codec merged successfully (DMR voice support)');
            console.log(`AMBE codec section merged successfully (${AMBE_SECTION_SIZE} bytes at 0x${TARGET_OFFSET.toString(16)})`);
          } else {
            console.warn('MD9600 cipher not available for AMBE section decryption.');
            this.reportProgress(9, 'Warning: Could not decrypt AMBE section...');
          }
        }
      }
      
      this.reportProgress(10, `Encrypting firmware for ${outputType}...`);
      
      // Encrypt firmware using XOR cipher (matches Python loader)
      const encryptedFirmware = this.encryptSTM32Firmware(combinedFirmware, cipher);
      
      this.reportProgress(15, 'Initializing DFU mode...');
      
      // Wait for device to be in idle state
      await this.dfuWaitForIdle();
      
      // Send custom commands to prepare for firmware update (from Python loader)
      await this.dfuSendCustomCommand(0x91, 0x01);
      await this.dfuSendCustomCommand(0x91, 0x31);
      
      this.reportProgress(20, 'Erasing flash memory...');
      
      // STM32 flash addresses for OpenGD77 (from Python loader)
      const addresses = [
        0x0800C000, 0x08010000, 0x08020000, 0x08040000, 0x08060000,
        0x08080000, 0x080A0000, 0x080C0000, 0x080E0000, 0x08100000
      ];
      const sizes = [
        0x4000, 0x10000, 0x20000, 0x20000, 0x20000,
        0x20000, 0x20000, 0x20000, 0x20000, 0x20000
      ];
      
      // Erase all required flash pages
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        this.reportProgress(20 + (i / addresses.length) * 10, `Erasing page 0x${addr.toString(16)}...`);
        await this.dfuPageErase(addr);
        
        if (onProgress) {
          onProgress(20 + (i / addresses.length) * 10, `Erasing page ${i + 1}/${addresses.length}`);
        }
      }
      
      this.reportProgress(30, 'Writing firmware...');
      
      // Write firmware in blocks (1024 bytes per block, matching Python loader)
      const BLOCK_WRITE_SIZE = 1024;
      let firmware = new Uint8Array(encryptedFirmware);
      let bytesWritten = 0;
      const totalBytes = firmware.length;
      let addressIndex = 0;
      const blockStart = 2;
      let lastReportedPct = -1;
      
      while (addressIndex < addresses.length && firmware.length > 0) {
        const address = addresses[addressIndex];
        const size = sizes[addressIndex];
        
        // Set the starting address for this section
        await this.dfuSetAddress(address);
        
        let dataWritten = 0;
        let blockNumber = blockStart;
        
        while (firmware.length > 0 && dataWritten < size) {
          // Extract chunk from firmware
          const chunk = firmware.slice(0, BLOCK_WRITE_SIZE);
          firmware = firmware.slice(BLOCK_WRITE_SIZE);
          
          // Pad chunk to BLOCK_WRITE_SIZE with 0xFF
          const paddedChunk = new Uint8Array(BLOCK_WRITE_SIZE);
          paddedChunk.fill(0xFF);
          paddedChunk.set(chunk, 0);
          
          // Write the block using DFU DNLOAD
          await this.dfuWriteBlock(blockNumber, paddedChunk);
          
          dataWritten += BLOCK_WRITE_SIZE;
          bytesWritten += chunk.length;
          blockNumber++;
          
          // Update progress
          const progress = 30 + (bytesWritten / totalBytes) * 65;
          const pct = Math.round(progress);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            const msg = `Writing ${Math.round(bytesWritten / 1024)}KB / ${Math.round(totalBytes / 1024)}KB (${pct}%)`;
            this.reportProgress(progress, msg);
            if (onProgress) {
              onProgress(progress, msg);
            }
          }
        }
        
        addressIndex++;
      }
      
      this.reportProgress(95, 'Finalizing...');
      
      // Exit DFU mode and restart radio
      await this.dfuExitAndReset();
      
      this.reportProgress(100, 'Firmware upload complete');
      
      if (onProgress) {
        onProgress(100, 'Firmware upload complete! Please wait for the radio to restart.');
      }
      
    } catch (error) {
      this.reportProgress(0, 'Firmware upload failed: ' + error.message);
      throw error;
    } finally {
      // Restore the previous progress callback
      this.onProgress = previousOnProgress;
    }
  }

  /**
   * Legacy writeFirmwareSTM32 method - now wraps the DFU method
   * @deprecated Use writeFirmwareSTM32DFU instead
   */
  async writeFirmwareSTM32(donorData, firmwareData, onProgress) {
    // Pass donor firmware to the new DFU method for proper AMBE codec merging
    console.warn('writeFirmwareSTM32 is deprecated. Use writeFirmwareSTM32DFU instead.');
    
    // Detect output type based on connection or use MDUV380 as default
    const outputType = this.radioModel.includes('9600') ? 'MD9600' : 
                       this.radioModel.includes('1701') ? 'DM1701' : 'MDUV380';
    
    return this.writeFirmwareSTM32DFU(firmwareData, outputType, onProgress, donorData);
  }

  // ==================== STM32 DFU Protocol Implementation ====================
  // Based on opengd77_stm32_firmware_loader.py

  /**
   * DFU Interface number (always 0 for STM32 DFU devices)
   */
  get DFU_INTERFACE() { return 0; }

  /**
   * DFU request timeout in milliseconds
   */
  get DFU_TIMEOUT() { return 4000; }

  /**
   * DFU protocol commands
   */
  get DFU_CMD() {
    return {
      DETACH: 0x00,
      DNLOAD: 0x01,
      UPLOAD: 0x02,
      GETSTATUS: 0x03,
      CLRSTATUS: 0x04,
      GETSTATE: 0x05,
      ABORT: 0x06
    };
  }

  /**
   * DFU state codes
   */
  get DFU_STATE() {
    return {
      APP_IDLE: 0x00,
      APP_DETACH: 0x01,
      DFU_IDLE: 0x02,
      DFU_DOWNLOAD_SYNC: 0x03,
      DFU_DOWNLOAD_BUSY: 0x04,
      DFU_DOWNLOAD_IDLE: 0x05,
      DFU_MANIFEST_SYNC: 0x06,
      DFU_MANIFEST: 0x07,
      DFU_MANIFEST_WAIT_RESET: 0x08,
      DFU_UPLOAD_IDLE: 0x09,
      DFU_ERROR: 0x0A
    };
  }

  /**
   * Send DFU control transfer OUT request
   * @param {number} request - bRequest value
   * @param {number} value - wValue
   * @param {number} index - wIndex (interface number)
   * @param {Uint8Array|null} data - Optional data to send
   */
  async dfuControlOut(request, value, index, data = null) {
    if (!this.device) throw new Error('Device not connected');
    
    const setup = {
      requestType: 'class',
      recipient: 'interface',
      request: request,
      value: value,
      index: index
    };
    
    // WebUSB controlTransferOut requires an ArrayBuffer (or BufferSource) as second parameter.
    // When data is null/undefined, we omit it. When data is a typed array, we pass its buffer.
    let result;
    if (data === null || data === undefined) {
      result = await this.device.controlTransferOut(setup);
    } else if (data instanceof Uint8Array) {
      // Pass the ArrayBuffer with byte offset and length to handle subarray views correctly
      result = await this.device.controlTransferOut(setup, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    } else {
      // Assume it's already an ArrayBuffer or compatible BufferSource
      result = await this.device.controlTransferOut(setup, data);
    }
    
    if (result.status !== 'ok') {
      throw new Error(`DFU control transfer failed: ${result.status}`);
    }
    
    return result;
  }

  /**
   * Send DFU control transfer IN request
   * @param {number} request - bRequest value
   * @param {number} value - wValue
   * @param {number} index - wIndex (interface number)
   * @param {number} length - Expected response length
   */
  async dfuControlIn(request, value, index, length) {
    if (!this.device) throw new Error('Device not connected');
    
    const result = await this.device.controlTransferIn({
      requestType: 'class',
      recipient: 'interface',
      request: request,
      value: value,
      index: index
    }, length);
    
    if (result.status !== 'ok') {
      throw new Error(`DFU control transfer failed: ${result.status}`);
    }
    
    return new Uint8Array(result.data.buffer);
  }

  /**
   * Get DFU status
   * Returns: { status, pollTimeout, state, iString }
   */
  async dfuGetStatus() {
    const data = await this.dfuControlIn(
      this.DFU_CMD.GETSTATUS, 0, this.DFU_INTERFACE, 6
    );
    
    return {
      status: data[0],
      pollTimeout: (data[3] << 16) | (data[2] << 8) | data[1],
      state: data[4],
      iString: data[5]
    };
  }

  /**
   * Clear DFU status (clear error condition)
   */
  async dfuClearStatus() {
    await this.dfuControlOut(
      this.DFU_CMD.CLRSTATUS, 0, this.DFU_INTERFACE, null
    );
  }

  /**
   * Abort current DFU operation
   */
  async dfuAbort() {
    await this.dfuControlOut(
      this.DFU_CMD.ABORT, 0, this.DFU_INTERFACE, null
    );
  }

  /**
   * Wait for DFU to reach idle state
   */
  async dfuWaitForIdle() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const statusInfo = await this.dfuGetStatus();
      const state = statusInfo.state;
      
      if (state === this.DFU_STATE.DFU_IDLE) {
        return;
      } else if (state === this.DFU_STATE.DFU_DOWNLOAD_IDLE || 
                 state === this.DFU_STATE.DFU_UPLOAD_IDLE) {
        await this.dfuAbort();
      } else {
        await this.dfuClearStatus();
      }
      
      await this.delay(100);
    }
    
    throw new Error('Failed to get DFU device into idle state');
  }

  /**
   * Check DFU status and throw if unexpected
   */
  async dfuCheckStatus(stage, expectedState) {
    const statusInfo = await this.dfuGetStatus();
    
    if (statusInfo.state !== expectedState) {
      const stateName = Object.keys(this.DFU_STATE).find(
        k => this.DFU_STATE[k] === statusInfo.state
      ) || statusInfo.state;
      throw new Error(`DFU ${stage} failed: unexpected state ${stateName}`);
    }
    
    return statusInfo;
  }

  /**
   * Erase a single flash page
   * @param {number} addr - Page address to erase
   */
  async dfuPageErase(addr) {
    // Send DNLOAD with first byte=0x41 (erase command) and page address
    const buf = new Uint8Array(5);
    buf[0] = 0x41;  // Erase command
    // Little-endian address
    buf[1] = addr & 0xFF;
    buf[2] = (addr >> 8) & 0xFF;
    buf[3] = (addr >> 16) & 0xFF;
    buf[4] = (addr >> 24) & 0xFF;
    
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, 0, this.DFU_INTERFACE, buf);
    
    // Wait for erase to complete
    await this.dfuCheckStatus('erase', this.DFU_STATE.DFU_DOWNLOAD_BUSY);
    await this.dfuCheckStatus('erase', this.DFU_STATE.DFU_DOWNLOAD_IDLE);
  }

  /**
   * Set address for next operation
   * @param {number} addr - Address to set
   */
  async dfuSetAddress(addr) {
    // Send DNLOAD with first byte=0x21 (set address) and address
    const buf = new Uint8Array(5);
    buf[0] = 0x21;  // Set address command
    // Little-endian address
    buf[1] = addr & 0xFF;
    buf[2] = (addr >> 8) & 0xFF;
    buf[3] = (addr >> 16) & 0xFF;
    buf[4] = (addr >> 24) & 0xFF;
    
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, 0, this.DFU_INTERFACE, buf);
    
    // Wait for address set to complete
    await this.dfuCheckStatus('set address', this.DFU_STATE.DFU_DOWNLOAD_BUSY);
    await this.dfuCheckStatus('set address', this.DFU_STATE.DFU_DOWNLOAD_IDLE);
  }

  /**
   * Send custom command (used for unlock sequence)
   * @param {number} a - First command byte
   * @param {number} b - Second command byte
   */
  async dfuSendCustomCommand(a, b) {
    const buf = new Uint8Array([a & 0xFF, b & 0xFF]);
    // Custom commands use interface 0 directly (per Python loader)
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, 0, this.DFU_INTERFACE, buf);
    
    // Get status twice (per Python loader)
    await this.dfuGetStatus();
    await this.delay(100);
    await this.dfuGetStatus();
    
    // Wait for idle
    await this.dfuWaitForIdle();
  }

  /**
   * Write a block of firmware data
   * @param {number} blockNumber - Block number (starting from 2)
   * @param {Uint8Array} data - Block data
   */
  async dfuWriteBlock(blockNumber, data) {
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, blockNumber, this.DFU_INTERFACE, data);
    
    // Wait for write to complete
    await this.dfuCheckStatus('write', this.DFU_STATE.DFU_DOWNLOAD_BUSY);
    await this.dfuCheckStatus('write', this.DFU_STATE.DFU_DOWNLOAD_IDLE);
  }

  /**
   * Exit DFU mode and reset device
   */
  async dfuExitAndReset() {
    // Set jump address to 0x08000000
    await this.dfuSetAddress(0x08000000);
    
    // Send DNLOAD with 0 length to trigger reset
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, 0, this.DFU_INTERFACE, new Uint8Array(0));
    
    try {
      // Try to get final status (device may reset before responding)
      await this.dfuGetStatus();
    } catch (e) {
      // Device reset - this is expected
      console.log('DFU: Device reset (expected)');
    }
  }

  /**
   * Encrypt firmware data for STM32 radios using XOR cipher
   * Based on patch_and_download_firmware() from opengd77_stm32_firmware_loader.py
   * @param {Uint8Array} data - Raw firmware data
   * @param {Uint8Array} cipher - 1024-byte encryption cipher
   * @returns {Uint8Array} Encrypted firmware data
   */
  encryptSTM32Firmware(data, cipher) {
    const encrypted = new Uint8Array(data.length);
    const cipherLen = cipher.length;
    
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ cipher[i % cipherLen];
    }
    
    return encrypted;
  }

  /**
   * Send DFU command (STM32) - legacy method kept for compatibility
   * @deprecated Use dfuControlOut instead
   */
  async sendDFUCommand(command, data) {
    const packet = new Uint8Array(1 + data.length);
    packet[0] = command;
    packet.set(data, 1);
    await this.dfuControlOut(this.DFU_CMD.DNLOAD, 0, this.DFU_INTERFACE, packet);
  }

  /**
   * Send DFU download block (STM32) - legacy method kept for compatibility
   * @deprecated Use dfuWriteBlock instead
   */
  async sendDFUDownload(blockNum, data) {
    await this.dfuWriteBlock(blockNum, data);
  }

  /**
   * Wait for DFU status (STM32) - legacy method kept for compatibility
   * @deprecated Use dfuCheckStatus instead
   */
  async waitDFUStatus() {
    // Poll for DFU status
    for (let i = 0; i < 100; i++) {
      await this.delay(50);
      
      try {
        const statusInfo = await this.dfuGetStatus();
        
        if (statusInfo.status === 0 && 
            (statusInfo.state === this.DFU_STATE.DFU_IDLE || 
             statusInfo.state === this.DFU_STATE.DFU_DOWNLOAD_IDLE)) {
          return;
        }
        
        if (statusInfo.status !== 0) {
          throw new Error(`DFU error: status=${statusInfo.status}, state=${statusInfo.state}`);
        }
      } catch (e) {
        if (i === 99) throw e;
      }
    }
    
    throw new Error('DFU operation timed out');
  }

  /**
   * Normalize MK22 radio model name to canonical form
   * Handles variations like "OpenRD5R", "OpenGD77", "OpenGD77S", "OpenDM1801"
   * and maps them to the canonical names used for encryption keys and bootloader config.
   * 
   * @param {string} model - Input model name (e.g., "OpenRD5R", "RD-5R", "GD77")
   * @returns {string} Canonical model name ('GD-77', 'GD-77S', 'DM-1801', 'RD-5R')
   */
  normalizeMK22Model(model) {
    if (!model) return model;
    
    // If already a valid canonical model name, return as-is
    const validModels = ['GD-77', 'GD-77S', 'DM-1801', 'RD-5R'];
    if (validModels.includes(model)) {
      return model;
    }
    
    // Normalize to uppercase and remove hyphens/spaces for comparison (consistent with STM32 function)
    const upper = model.toUpperCase().replace(/-/g, '').replace(/ /g, '');
    
    // Map variations to canonical model names
    // Order matters - check more specific patterns first (e.g., GD77S before GD77)
    // Note: Uses substring matching which handles common prefixes like "Open" and "TYT"
    
    // GD-77S variants: OpenGD77S, GD77S, GD-77S, OPENGD77S
    if (upper.includes('GD77S')) {
      return 'GD-77S';
    }
    
    // GD-77 variants: OpenGD77, GD77, GD-77, OPENGD77
    if (upper.includes('GD77')) {
      return 'GD-77';
    }
    
    // DM-1801 variants: OpenDM1801, DM1801, DM-1801, OPENDM1801, BF-1801, BF1801
    if (upper.includes('DM1801') || upper.includes('BF1801')) {
      return 'DM-1801';
    }
    
    // RD-5R variants: OpenRD5R, RD5R, RD-5R, OPENRD5R, BF-5R, BF5R
    if (upper.includes('RD5R') || upper.includes('BF5R')) {
      return 'RD-5R';
    }
    
    // No match found, return original (will fail validation with helpful message)
    return model;
  }

  /**
   * Normalize STM32 radio model/cipher type to canonical form
   * Handles variations like "MD-UV380", "MD-9600", "DM-1701", "RT-84", "RT-3S"
   * and maps them to the canonical cipher types.
   * 
   * @param {string} model - Input model name (e.g., "MD-UV380", "MD9600", "TYT MD-UV380")
   * @returns {string} Canonical cipher type ('MD9600', 'MDUV380', 'MD2017', 'DM1701')
   */
  normalizeSTM32Model(model) {
    if (!model) return model;
    
    // If already a valid canonical type, return as-is
    const validTypes = ['MD9600', 'MDUV380', 'MD2017', 'DM1701'];
    if (validTypes.includes(model)) {
      return model;
    }
    
    // Normalize to uppercase and remove hyphens/spaces for comparison
    const upper = model.toUpperCase().replace(/-/g, '').replace(/ /g, '');
    
    // Map variations to canonical cipher types
    // Use specific patterns to avoid false positives
    
    // MD9600 variants: MD-9600, TYT MD-9600
    if (upper.includes('MD9600')) {
      return 'MD9600';
    }
    
    // DM1701 variants: DM-1701, RT-84, RT84, RT-3S, RT3S, Baofeng DM-1701
    // DM1701 and RT-84/RT-3S share the same cipher
    if (upper.includes('DM1701') || upper.includes('RT84') || upper.includes('RT3S')) {
      return 'DM1701';
    }
    
    // MD2017 variants: MD-2017
    if (upper.includes('MD2017')) {
      return 'MD2017';
    }
    
    // MDUV380 variants: MD-UV380, MD-380, UV380, TYT MD-UV380, MD-UV390
    // This is the most common STM32 type
    if (upper.includes('MDUV380') || upper.includes('UV380') || upper.includes('MD380') || 
        upper.includes('UV390') || upper.includes('MDUV390')) {
      return 'MDUV380';
    }
    
    // No match found, return original (will fail validation with helpful message)
    return model;
  }

  /**
   * Encrypt firmware data for MK22 radios (GD-77, DM-1801, RD-5R)
   * Based on encrypt() function from gd77-firmware-loader.py
   * @param {Uint8Array} unencrypted - Raw firmware data
   * @param {string} model - Radio model: 'GD-77', 'GD-77S', 'DM-1801', 'RD-5R'
   * @returns {Uint8Array} Encrypted firmware data
   */
  encryptMK22Firmware(unencrypted, model = 'GD-77') {
    // Get the MK22 encryption table (32768 bytes) from external file
    const encryptionTable = typeof window !== 'undefined' && window.MK22_ENCRYPTION_TABLE;
    
    if (!encryptionTable || encryptionTable.length !== 32768) {
      throw new Error(`MK22 cipher table not loaded correctly. Expected 32768 bytes, got ${encryptionTable?.length || 0}. Please ensure mk22_cipher.js is included.`);
    }
    
    // Shift values for different models (from gd77-firmware-loader.py)
    const shiftValues = {
      'GD-77': 0x0807,
      'GD-77S': 0x2A8E,
      'DM-1801': 0x2C7C,
      'RD-5R': 0x306E
    };
    
    let shift = shiftValues[model] || 0x0807;
    const length = unencrypted.length;
    const encrypted = new Uint8Array(length);
    const tableLen = encryptionTable.length;
    
    for (let address = 0; address < length; address++) {
      let data = unencrypted[address];
      
      // XOR with encryption table (shift wraps within table bounds)
      data = (data ^ encryptionTable[shift % tableLen]) & 0xFF;
      // Rotate bits: ((data >> 3) & 0x1F) | ((data << 5) & 0xE0) then invert
      data = (~(((data >> 3) & 0x1F) | ((data << 5) & 0xE0))) & 0xFF;
      
      encrypted[address] = data;
      shift++;
      
      if (shift >= 0x7FFF) {
        shift = 0;
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt firmware data from MK22 radios
   * @param {Uint8Array} encrypted - Encrypted firmware data
   * @param {string} model - Radio model
   * @returns {Uint8Array} Decrypted firmware data
   */
  decryptMK22Firmware(encrypted, model = 'GD-77') {
    // Get the MK22 encryption table (32768 bytes) from external file
    const encryptionTable = typeof window !== 'undefined' && window.MK22_ENCRYPTION_TABLE;
    
    if (!encryptionTable || encryptionTable.length !== 32768) {
      throw new Error(`MK22 cipher table not loaded correctly. Expected 32768 bytes, got ${encryptionTable?.length || 0}. Please ensure mk22_cipher.js is included.`);
    }
    
    const shiftValues = {
      'GD-77': 0x0807,
      'GD-77S': 0x2A8E,
      'DM-1801': 0x2C7C,
      'RD-5R': 0x306E
    };
    
    let shift = shiftValues[model] || 0x0807;
    const length = encrypted.length;
    const decrypted = new Uint8Array(length);
    const tableLen = encryptionTable.length;
    
    for (let address = 0; address < length; address++) {
      let data = encrypted[address];
      
      // Reverse rotation: ((data << 3) & 0xF8) | ((data >> 5) & 0x07) then invert
      data = (~(((data << 3) & 0xF8) | ((data >> 5) & 0x07))) & 0xFF;
      // XOR with encryption table (shift wraps within table bounds)
      data = (data ^ encryptionTable[shift % tableLen]) & 0xFF;
      
      decrypted[address] = data;
      shift++;
      
      if (shift >= 0x7FFF) {
        shift = 0;
      }
    }
    
    return decrypted;
  }

  /**
   * Create checksum data packet for MK22 firmware upload
   * Based on createChecksumData() from gd77-firmware-loader.py
   */
  createChecksumData(buf, startAddress, endAddress) {
    // Checksum data: 0x45 'E', 0x4E 'N', 0x44 'D', 0xFF, then 4-byte LE checksum
    const checksumData = new Uint8Array(8);
    checksumData[0] = 0x45; // 'E'
    checksumData[1] = 0x4E; // 'N'
    checksumData[2] = 0x44; // 'D'
    checksumData[3] = 0xFF;
    
    let cs = 0;
    for (let i = startAddress; i < endAddress; i++) {
      cs = (cs + buf[i]) >>> 0; // Unsigned addition
    }
    
    checksumData[4] = cs & 0xFF;
    checksumData[5] = (cs >> 8) & 0xFF;
    checksumData[6] = (cs >> 16) & 0xFF;
    checksumData[7] = (cs >> 24) & 0xFF;
    
    return checksumData;
  }

  /**
   * Read calibration data from radio
   * Calibration data contains factory settings, power levels, etc.
   * Based on calibrationRead case in CodeplugComms.cs
   */
  async readCalibration(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== READ CALIBRATION DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);

    this.reportProgress(0, 'Reading calibration data...');
    
    try {
      await this.initProtocol();
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        // Determine calibration address based on radio type
        // STM32: Calibration in EEPROM at 0x10000
        // MK22 serial: Calibration in EEPROM at different address
        const calibrationAddr = this.isFlashBasedRadio()
          ? CONFIG.PROTOCOL.STM32_CALIBRATION_START  // 0x10000
          : CONFIG.PROTOCOL.CALIBRATION_START;  // MK22 calibration address
        
        const calibrationSize = this.isFlashBasedRadio()
          ? CONFIG.PROTOCOL.STM32_CALIBRATION_SIZE  // 512 bytes
          : CONFIG.PROTOCOL.CALIBRATION_SIZE;  // 4096 bytes
        
        // Display status on radio screen
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Calibration');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 3);
        
        // Small delay to ensure command response is fully processed before bulk read
        await this.delay(50);
        
        const DATA_MODE_READ_EEPROM = CONFIG.PROTOCOL.DATA_MODE.READ_EEPROM;
        const calibData = await this.readFlashOrEEPROM(calibrationAddr, calibrationSize, DATA_MODE_READ_EEPROM, onProgress);
        
        await this.sendSTM32Command(5);
        
        this.debugMessage('=== READ CALIBRATION DATA COMPLETE ===');
        this.reportProgress(100, 'Calibration data read complete');
        return calibData;
        
      } else {
        // MK22 HID bootloader mode: Use raw read commands
        const CALIBRATION_START = CONFIG.PROTOCOL.CALIBRATION_START;
        const CALIBRATION_SIZE = CONFIG.PROTOCOL.CALIBRATION_SIZE;
        const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
        const numBlocks = Math.ceil(CALIBRATION_SIZE / blockSize);
        const buffer = new Uint8Array(CALIBRATION_SIZE);
        
        for (let block = 0; block < numBlocks; block++) {
          const address = CALIBRATION_START + (block * blockSize);
          
          const readCmd = new Uint8Array([
            0x52,
            (address >> 16) & 0xFF,
            (address >> 8) & 0xFF,
            address & 0xFF,
            blockSize
          ]);
          
          await this.sendData(readCmd);
          const response = await this.receiveData();
          
          buffer.set(response.slice(4, 4 + blockSize), block * blockSize);
          
          const progress = ((block + 1) / numBlocks) * 100;
          if (onProgress) onProgress(progress);
        }
        
        await this.sendData(this.CMD_ENDR);
        await this.receiveData();
        
        this.debugMessage('=== READ CALIBRATION DATA COMPLETE ===');
        this.reportProgress(100, 'Calibration data read complete');
        return buffer;
      }
      
    } catch (error) {
      this.debugMessage(`=== READ CALIBRATION DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Calibration read failed');
      throw error;
    }
  }

  /**
   * Write calibration data to radio
   * WARNING: Incorrect calibration data can damage your radio
   */
  async writeCalibration(data, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('========================================');
    this.debugMessage('=== WRITE CALIBRATION DATA START ===');
    this.debugMessage('========================================');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);

    this.reportProgress(0, 'Writing calibration data...');
    
    try {
      await this.initProtocol();
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        // Determine calibration address based on radio type
        const calibrationAddr = this.isFlashBasedRadio()
          ? CONFIG.PROTOCOL.STM32_CALIBRATION_START  // 0x10000
          : CONFIG.PROTOCOL.CALIBRATION_START;  // MK22 calibration address
        
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Writing');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Calibration');
        await this.sendSTM32Command(3);
        await this.sendSTM32Command(6, 4);
        
        await this.writeEEPROM(calibrationAddr, data, onProgress);
        
        await this.sendSTM32Command(6, 0);
        await this.sendSTM32Command(5);
        
        this.debugMessage('=== WRITE CALIBRATION DATA COMPLETE ===');
        this.reportProgress(100, 'Calibration data write complete');
        
      } else {
        // MK22 HID bootloader mode: Write to calibration memory location
        const CALIBRATION_START = CONFIG.PROTOCOL.CALIBRATION_START;
        const blockSize = CONFIG.PROTOCOL.BLOCK_SIZE;
        const numBlocks = Math.ceil(data.length / blockSize);
        
        for (let block = 0; block < numBlocks; block++) {
          const address = CALIBRATION_START + (block * blockSize);
          
          const writeCmd = new Uint8Array(5 + blockSize);
          writeCmd[0] = 0x57; // 'W'
          writeCmd[1] = (address >> 16) & 0xFF;
          writeCmd[2] = (address >> 8) & 0xFF;
          writeCmd[3] = address & 0xFF;
          writeCmd[4] = blockSize;
          writeCmd.set(data.slice(block * blockSize, (block + 1) * blockSize), 5);
          
          await this.sendData(writeCmd);
          const response = await this.receiveData();
          
          if (response[0] !== this.CMD_ACK) {
            throw new Error('Calibration write failed');
          }
          
          const progress = ((block + 1) / numBlocks) * 100;
          if (onProgress) onProgress(progress);
        }
        
        await this.sendData(this.CMD_ENDW);
        await this.receiveData();
        
        this.debugMessage('=== WRITE CALIBRATION DATA COMPLETE ===');
        this.reportProgress(100, 'Calibration data write complete');
      }
      
    } catch (error) {
      this.debugMessage(`=== WRITE CALIBRATION DATA FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Calibration write failed');
      throw error;
    }
  }

  /**
   * Read secure registers from radio
   * Based on readSecureRegisters case in CodeplugComms.cs
   */
  async readSecureRegisters(onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to radio');
    }

    this.debugMessage('=== READ SECURE REGISTERS START ===');
    this.debugMessage(`Radio type: ${this.radioType}`);
    this.debugMessage(`HID mode: ${this.isHIDMode}`);

    this.reportProgress(0, 'Reading secure registers...');
    
    try {
      await this.initProtocol();
      
      const SECURE_REGISTERS_SIZE = CONFIG.PROTOCOL.SECURE_REGISTERS_SIZE;
      
      // Use serial protocol for both STM32 and MK22 in CDC-ACM mode
      if (this.useSerialProtocol()) {
        const DATA_MODE_READ_SECURE_REGISTERS = CONFIG.PROTOCOL.DATA_MODE.READ_SECURE_REGISTERS;
        
        await this.sendSTM32Command(1);
        await this.sendSTM32Command(2, 0, 0, 3, 1, 0, 'OpenGD77 WebCPS');
        await this.sendSTM32Command(2, 0, 16, 3, 1, 0, 'Reading');
        await this.sendSTM32Command(2, 0, 32, 3, 1, 0, 'Secure Regs');
        await this.sendSTM32Command(3);
        
        const secureData = await this.readFlashOrEEPROM(0, SECURE_REGISTERS_SIZE, DATA_MODE_READ_SECURE_REGISTERS, onProgress);
        
        await this.sendSTM32Command(5);
        
        this.debugMessage('=== READ SECURE REGISTERS COMPLETE ===');
        this.reportProgress(100, 'Secure registers read complete');
        return secureData;
        
      } else {
        // MK22 HID bootloader mode: Read secure registers using special command
        const buffer = new Uint8Array(SECURE_REGISTERS_SIZE);
        const readCmd = new Uint8Array([0x53, 0x45, 0x43, 0x52]); // "SECR"
        await this.sendData(readCmd);
        const response = await this.receiveData();
        
        buffer.set(response.slice(0, SECURE_REGISTERS_SIZE));
        
        this.debugMessage('=== READ SECURE REGISTERS COMPLETE ===');
        this.reportProgress(100, 'Secure registers read complete');
        return buffer;
      }
      
    } catch (error) {
      this.debugMessage(`=== READ SECURE REGISTERS FAILED: ${error.message} ===`);
      this.reportProgress(0, 'Secure registers read failed');
      throw error;
    }
  }

  /**
   * Get detected radio model string for firmware selection
   * Returns model string like 'GD-77', 'DM-1801', 'MD9600', etc.
   */
  getRadioModel() {
    if (this.radioInfo) {
      // Use radioTypeName from readRadioInfo() if available
      if (this.radioInfo.radioTypeName && !this.radioInfo.radioTypeName.startsWith('Unknown')) {
        return this.radioInfo.radioTypeName;
      }
      
      // Fallback: Try to determine model from frequency bands (if available)
      const minFreqVHF = this.radioInfo.minFreqVHF || 0;
      const maxFreqVHF = this.radioInfo.maxFreqVHF || 0;
      const minFreqUHF = this.radioInfo.minFreqUHF || 0;
      const maxFreqUHF = this.radioInfo.maxFreqUHF || 0;
      
      if (this.isFlashBasedRadio()) {
        // STM32 radios: MD9600, MD-UV380, etc.
        if (maxFreqVHF === 0 && minFreqUHF > 0) {
          return 'MD9600'; // UHF only is typically MD9600
        }
        return 'MDUV380'; // Dual band assumed to be UV380 series
      } else {
        // MK22 radios: GD-77, DM-1801, RD-5R
        if (minFreqVHF > 0 && minFreqUHF > 0) {
          return 'GD-77'; // Dual band
        }
        return 'RD-5R'; // Default to RD-5R
      }
    }
    
    return this.isFlashBasedRadio() ? 'MD9600' : 'GD-77';
  }

  /**
   * Check if we should use serial protocol (CDC-ACM) instead of HID protocol.
   * Returns true when either:
   * - Radio is STM32 (always uses serial protocol)
   * - Radio is MK22 in CDC-ACM serial mode (isHIDMode is false)
   * 
   * This method relies on instance properties:
   * - this.radioType: The detected radio type (MK22 or STM32)
   * - this.isHIDMode: Whether the radio is connected via HID bootloader interface
   * 
   * @returns {boolean} True if serial protocol should be used (STM32 or MK22 in CDC-ACM mode)
   */
  useSerialProtocol() {
    return this.isFlashBasedRadio() ||
           this.radioType === CONFIG.RADIO_TYPES.DM32 ||
           !this.isHIDMode;
  }

  /**
   * True for radios that use the STM32-style flash protocol and codeplug
   * layout. This includes the STM32 radios and the C7000-based Baofeng
   * DM-32 / UV-32, which speak the same 'R'/'X' protocol over serial.
   */
  isFlashBasedRadio() {
    return this.radioType === CONFIG.RADIO_TYPES.STM32 ||
           this.radioType === CONFIG.RADIO_TYPES.DM32;
  }

  /**
   * Check if we should use HID bootloader protocol (page-based CWB).
   * Returns true only when radio is MK22 AND in HID bootloader mode.
   * 
   * This method relies on instance properties:
   * - this.radioType: The detected radio type (MK22 or STM32)
   * - this.isHIDMode: Whether the radio is connected via HID bootloader interface
   * 
   * @returns {boolean} True if HID bootloader protocol should be used (MK22 in HID mode only)
   */
  useHIDProtocol() {
    return this.radioType === CONFIG.RADIO_TYPES.MK22 && this.isHIDMode;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
window.radioUSB = new OpenGD77USB();
