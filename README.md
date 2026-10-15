<p align="center">
  <img src="images/homebridge-poer.svg" width="420" alt="Homebridge + Poer Smart">
</p>

# Homebridge Poer

[![npm version](https://img.shields.io/npm/v/homebridge-poer.svg)](https://www.npmjs.com/package/homebridge-poer)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

**homebridge-poer** is a dynamic platform plugin for [Homebridge](https://homebridge.io) that seamlessly integrates **Poer Smart Thermostats** (PTC10, PTR16, and compatible smart radiator valves) into Apple HomeKit.

This plugin communicates directly with the Poer Cloud REST API, eliminating the need to run Home Assistant solely for Poer thermostat integration.

---

## Features

- 🌡️ **Temperature Control**: Set and view target temperature in 0.5°C steps.
- ❄️ **Real-Time Readings**: Live ambient temperature and relative humidity displayed right in the Apple Home app.
- ♨️ **Heating Status**: Accurate `Heating` vs `Idle` state indicators in HomeKit.
- 🔄 **HVAC Modes**: Switch between `Off`, `Heat` (Manual), and `Auto` (Schedule).
- 🌱 **Eco / Away Mode Switch**: Optional separate switch exposed in Apple Home to quickly toggle Eco mode, perfect for "When leaving home" HomeKit automations!
- 🌐 **Multi-Region Support**: Automatically routes to the correct European (`open.poersmart.com`) or China (`open2.poersmart.com`) Poer cloud based on your API key prefix (`eu` or `cn`).
- ⚡ **Zero External Runtime Dependencies**: Built with native Node.js 18+ HTTP capabilities for maximum speed, security, and low memory footprint.
- 🎨 **Homebridge Config UI X**: Fully configurable via the Homebridge web UI.

---

## How to Get Your Poer API Key

1. Open the **Poer Smart** app on your iOS or Android device (ensure app version is 3.2.26 or newer).
2. Go to **Settings** &rarr; **Third-Party Platform** &rarr; **Home Assistant**.
3. Generate and copy your API key.
   - Keys starting with `eu` will automatically connect to Poer's European servers.
   - Keys starting with `cn` will connect to Poer's China servers.

---

## Installation

### Via Homebridge Config UI X (Recommended)

1. Open **Homebridge UI** in your browser.
2. Navigate to the **Plugins** tab.
3. Search for `homebridge-poer` and click **Install**.
4. Enter your **Poer API Key** in the configuration dialog.
5. Restart Homebridge.

### Via Command Line

```bash
npm install -g homebridge-poer
```

---

## Configuration

### Homebridge Config UI X

You can configure this plugin directly from the Homebridge Web UI.

### Manual Configuration (`config.json`)

Add the following platform object to the `platforms` array in your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "PoerSmart",
      "name": "Poer",
      "apiKey": "eu1234567890abcdef...",
      "refreshInterval": 30,
      "showEcoSwitch": true,
      "debug": false
    }
  ]
}
```

### Configuration Options

| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `platform` | `string` | **Yes** | `"PoerSmart"` | Must be `"PoerSmart"`. |
| `apiKey` | `string` | **Yes** | — | Your API key generated in the Poer Smart mobile app (starts with `eu` or `cn`). |
| `name` | `string` | No | `"Poer"` | Platform name displayed in Homebridge logs. |
| `refreshInterval` | `integer` | No | `30` | Device status polling frequency in seconds (minimum: 10). |
| `showEcoSwitch` | `boolean` | No | `true` | Creates an additional switch in Apple Home to toggle between Eco and Normal heating. |
| `debug` | `boolean` | No | `false` | Enable verbose debug logging of all Poer Cloud API requests. |

---

## Supported Devices

- **POER PTC10** Wireless Room Thermostat
- **POER PTR16** Wireless Receiver / Gateway
- Compatible Poer Smart TRV (Radiator Valves) linked to your Poer account

---

## Development & Building

This project is built using TypeScript and can be built inside Docker or directly with Node 18+:

```bash
# Install dependencies
npm install

# Compile TypeScript to dist/
npm run build

# Run ESLint
npm run lint

# Run unit tests
npm test
```

---

## Publishing to npm

To publish this package to npm so the whole Homebridge community can install it:

```bash
# 1. Log in to your npm account (if not already logged in)
npm login

# 2. Publish to npm
npm publish --access public
```

---

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
