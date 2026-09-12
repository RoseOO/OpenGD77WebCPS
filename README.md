# OpenGD77 WebCPS

A web-based codeplug editor for OpenGD77 radios (GD-77, DM-1801, RD-5R, MD-UV380, MD-9600, DM-1701 and friends) and the Baofeng DM-32 / UV008 (C7000). Plug the radio in over USB and read, edit or flash it right from the browser.

## What it does

Read and write codeplugs, edit channels, zones, contacts, talkgroups, scan lists, APRS, DTMF, satellites, themes and boot settings, and flash firmware. Codeplugs you save are kept locally in your browser.

MK22 and STM32 radios (GD-77, DM-1801, RD-5R, MD-UV380, MD-9600, DM-1701) connect over **WebUSB**. The Baofeng DM-32 / UV008 connects over **Web Serial** — no Zadig or WinUSB driver needed.

## Data

A few things are pulled straight from the source: UK repeaters from RSGB, talkgroups from Brandmeister, and TLEs from Celestrak. The rest you load from files you download yourself:

- **DMR IDs** — grab `user.csv` from radioid.net, then use *DMR ID Database → Load from CSV*.
- **DMR repeaters** — grab `rptrs.json` from radioid.net, then use *DMR Repeaters → Load from File*.
- **WTR licences** — grab `wtr.csv` from Ofcom's spectrum information portal, then use *WTR Licences → Load from File*.

## Running it

Any static web server will do. WebUSB and Web Serial both need HTTPS or localhost:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in Chrome, Edge or Opera.

## License

See [LICENSE](LICENSE). Based on the OpenGD77 Web CPS by grid.radio (Rose, M1RXO), with components from the OpenGD77 project.
