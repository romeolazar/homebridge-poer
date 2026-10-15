import type { Logging } from 'homebridge';
import type { PoerDeviceInfo, PoerDeviceStatus } from './types.js';

export const CN_URL = 'https://open2.poersmart.com';
export const EU_URL = 'https://open.poersmart.com';

interface DeviceSyncItem {
  id: string | number;
  name?: { name?: string };
  deviceInfo?: {
    model?: string;
    swVersion?: string;
  };
  attributes?: {
    thermostatTemperatureRange?: {
      minThresholdCelsius?: number;
      maxThresholdCelsius?: number;
    };
  };
}

interface SyncResponsePayload {
  payload?: {
    devices?: DeviceSyncItem[];
  };
}

interface QueryResponseDevice {
  thermostatTemperatureAmbient?: number;
  thermostatHumidityAmbient?: number;
  thermostatTemperatureSetpoint?: number;
  thermostatMode?: string;
  thermostatAction?: string;
}

interface QueryResponsePayload {
  payload?: {
    devices?: Record<string, QueryResponseDevice>;
  };
}

export class PoerApi {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly log: Logging;
  private readonly debug: boolean;

  constructor(apiKey: string, log: Logging, debug = false) {
    this.log = log;
    this.debug = debug;

    const trimmedKey = apiKey.trim();
    const lowerKey = trimmedKey.toLowerCase();

    if (lowerKey.startsWith('cn')) {
      this.baseUrl = CN_URL;
      this.apiToken = trimmedKey.slice(2).trim();
      this.log.info('Poer API: Selected China region endpoint (open2.poersmart.com)');
    } else if (lowerKey.startsWith('eu')) {
      this.baseUrl = EU_URL;
      this.apiToken = trimmedKey.slice(2).trim();
      this.log.info('Poer API: Selected Europe region endpoint (open.poersmart.com)');
    } else {
      this.baseUrl = EU_URL;
      this.apiToken = trimmedKey;
      this.log.warn('Poer API: API key did not start with "cn" or "eu". Defaulting to Europe region endpoint (open.poersmart.com).');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `beer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private logDebug(message: string, ...parameters: unknown[]): void {
    if (this.debug) {
      this.log.info(`[DEBUG] ${message}`, ...parameters);
    } else {
      this.log.debug(message, ...parameters);
    }
  }

  /**
   * Ping API to verify authentication credentials
   */
  async ping(): Promise<boolean> {
    const url = `${this.baseUrl}/speaker/ha/v1.0/ping`;
    try {
      this.logDebug(`Testing API connection to ${url}...`);
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 200) {
        this.log.info('Poer API credentials verified successfully.');
        return true;
      }

      this.log.error(`Poer API authentication failed: HTTP ${response.status} ${response.statusText}`);
      return false;
    } catch (error) {
      this.log.error(`Error connecting to Poer API: ${error}`);
      return false;
    }
  }

  /**
   * Discover devices from Poer Cloud
   */
  async syncDevices(): Promise<PoerDeviceInfo[]> {
    const url = `${this.baseUrl}/speaker/ha/v1.0`;
    const payload = {
      requestId: '111',
      inputs: [{ intent: 'action.devices.SYNC' }],
    };

    try {
      this.logDebug(`Fetching devices list from ${url}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const text = await response.text();
        this.log.error(`Failed to sync devices: HTTP ${response.status} ${text}`);
        return [];
      }

      const data = await response.json() as SyncResponsePayload;
      const rawDevices = data?.payload?.devices;

      if (!Array.isArray(rawDevices)) {
        this.log.warn('No devices found in Poer SYNC response.');
        return [];
      }

      const devices: PoerDeviceInfo[] = rawDevices.map((d: DeviceSyncItem) => ({
        id: String(d.id),
        name: d.name?.name || 'Poer Thermostat',
        model: d.deviceInfo?.model || 'PTC10/PTR16',
        firmware: d.deviceInfo?.swVersion || '1.0.0',
        minTemp: d.attributes?.thermostatTemperatureRange?.minThresholdCelsius ?? 5.0,
        maxTemp: d.attributes?.thermostatTemperatureRange?.maxThresholdCelsius ?? 35.0,
      }));

      this.log.info(`Discovered ${devices.length} Poer device(s).`);
      return devices;
    } catch (error) {
      this.log.error(`Network error during device discovery: ${error}`);
      return [];
    }
  }

  /**
   * Query current state of a device
   */
  async queryDevice(deviceId: string): Promise<PoerDeviceStatus | null> {
    const url = `${this.baseUrl}/speaker/ha/v1.0`;
    const payload = {
      requestId: '111',
      inputs: [
        {
          intent: 'action.devices.QUERY',
          payload: { devices: [{ id: deviceId }] },
        },
      ],
    };

    try {
      this.logDebug(`Querying status for device ${deviceId}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const text = await response.text();
        this.log.warn(`Failed to query device ${deviceId}: HTTP ${response.status} ${text}`);
        return null;
      }

      const data = await response.json() as QueryResponsePayload;
      const devState = data?.payload?.devices?.[deviceId];

      if (!devState) {
        this.log.warn(`No status returned for device ${deviceId}`);
        return null;
      }

      const rawMode = String(devState.thermostatMode || 'off').toLowerCase();
      let mode: 'auto' | 'heat' | 'off' | 'eco' = 'off';
      if (rawMode === 'auto') {
        mode = 'auto';
      } else if (rawMode === 'heat') {
        mode = 'heat';
      } else if (rawMode === 'eco') {
        mode = 'eco';
      } else {
        mode = 'off';
      }

      const rawAction = String(devState.thermostatAction || 'idle').toLowerCase();
      const action: 'heating' | 'idle' = rawAction === 'heating' ? 'heating' : 'idle';

      return {
        currentTemp: Number(devState.thermostatTemperatureAmbient ?? 20.0),
        targetTemp: Number(devState.thermostatTemperatureSetpoint ?? 20.0),
        humidity: Number(devState.thermostatHumidityAmbient ?? 0),
        mode,
        action,
      };
    } catch (error) {
      this.log.warn(`Error querying device ${deviceId}: ${error}`);
      return null;
    }
  }

  /**
   * Set target temperature for a device
   */
  async setTargetTemperature(deviceId: string, temperature: number): Promise<boolean> {
    const url = `${this.baseUrl}/speaker/ha/v1.0`;
    const payload = {
      requestId: '112',
      inputs: [
        {
          intent: 'action.devices.EXECUTE',
          payload: {
            commands: [
              {
                devices: [{ id: deviceId }],
                execution: [
                  {
                    command: 'action.devices.commands.ThermostatTemperatureSetpoint',
                    params: { thermostatTemperatureSetpoint: temperature },
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    try {
      this.log.info(`Setting target temperature for ${deviceId} to ${temperature}°C`);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return true;
      }

      const text = await response.text();
      this.log.error(`Failed to set temperature for ${deviceId}: HTTP ${response.status} ${text}`);
      return false;
    } catch (error) {
      this.log.error(`Network error setting temperature for ${deviceId}: ${error}`);
      return false;
    }
  }

  /**
   * Set HVAC mode (auto, heat, off, eco) for a device
   */
  async setMode(deviceId: string, mode: 'auto' | 'heat' | 'off' | 'eco'): Promise<boolean> {
    const url = `${this.baseUrl}/speaker/ha/v1.0`;
    const payload = {
      requestId: '112',
      inputs: [
        {
          intent: 'action.devices.EXECUTE',
          payload: {
            commands: [
              {
                devices: [{ id: deviceId }],
                execution: [
                  {
                    command: 'action.devices.commands.ThermostatSetMode',
                    params: { thermostatMode: mode },
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    try {
      this.log.info(`Setting mode for ${deviceId} to "${mode}"`);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return true;
      }

      const text = await response.text();
      this.log.error(`Failed to set mode for ${deviceId}: HTTP ${response.status} ${text}`);
      return false;
    } catch (error) {
      this.log.error(`Network error setting mode for ${deviceId}: ${error}`);
      return false;
    }
  }
}
