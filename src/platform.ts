import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { PoerPlatformAccessory } from './platformAccessory.js';
import { PoerApi } from './poerApi.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { PoerDeviceInfo, PoerPlatformConfig } from './types.js';

export class PoerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly accessoryHandlers: Map<string, PoerPlatformAccessory> = new Map();

  public readonly poerApi: PoerApi;
  public readonly config: PoerPlatformConfig;

  private pollTimer?: NodeJS.Timeout;

  constructor(
    public readonly log: Logging,
    config: PoerPlatformConfig,
    public readonly api: API,
  ) {
    this.config = config;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const apiKey = (this.config.apiKey || '').trim();
    this.poerApi = new PoerApi(apiKey, this.log, Boolean(this.config.debug));

    this.api.on('didFinishLaunching', async () => {
      if (!apiKey) {
        this.log.error('POER API key is not configured! Please configure your Poer API key in the Homebridge config.');
        return;
      }

      await this.initDevices();
    });

    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async initDevices(): Promise<void> {
    this.log.info('Connecting to Poer Cloud to discover devices...');

    // 1. Verify credentials
    await this.poerApi.ping();

    // 2. Discover devices
    const devices = await this.poerApi.syncDevices();

    const activeUUIDs: string[] = [];

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.id);
      activeUUIDs.push(uuid);

      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        const handler = new PoerPlatformAccessory(this, existingAccessory);
        this.accessoryHandlers.set(device.id, handler);
      } else {
        this.log.info('Registering new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;

        const handler = new PoerPlatformAccessory(this, accessory);
        this.accessoryHandlers.set(device.id, handler);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // 3. Remove obsolete accessories
    for (const [uuid, accessory] of this.accessories) {
      if (!activeUUIDs.includes(uuid)) {
        this.log.info('Removing obsolete accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // 4. Initial poll
    await this.pollAllDevices(devices);

    // 5. Setup polling interval
    const intervalSeconds = Math.max(10, Number(this.config.refreshInterval) || 30);
    this.log.info(`Configured background polling every ${intervalSeconds} seconds.`);

    this.pollTimer = setInterval(() => {
      this.pollAllDevices(devices);
    }, intervalSeconds * 1000);
  }

  private async pollAllDevices(devices: PoerDeviceInfo[]): Promise<void> {
    for (const device of devices) {
      const handler = this.accessoryHandlers.get(device.id);
      if (!handler) {
        continue;
      }

      try {
        const status = await this.poerApi.queryDevice(device.id);
        if (status) {
          handler.updateStatus(status);
        }
      } catch (error) {
        this.log.warn(`Failed to poll status for device ${device.name} (${device.id}): ${error}`);
      }
    }
  }
}
