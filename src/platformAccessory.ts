import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoerPlatform } from './platform.js';
import type { PoerDeviceInfo, PoerDeviceStatus } from './types.js';

export class PoerPlatformAccessory {
  private readonly thermostatService: Service;
  private readonly ecoSwitchService?: Service;
  private readonly device: PoerDeviceInfo;

  private state: PoerDeviceStatus = {
    currentTemp: 20.0,
    targetTemp: 20.0,
    humidity: 50,
    mode: 'off',
    action: 'idle',
  };

  constructor(
    private readonly platform: PoerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device as PoerDeviceInfo;

    // 1. Set Accessory Information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'POER')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.model || 'Smart Thermostat')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.firmware || '1.0.0');

    // 2. Setup Thermostat Service
    this.thermostatService = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);

    this.thermostatService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name,
    );

    // Temperature Display Units: Celsius
    this.thermostatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .setValue(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS)
      .onGet(() => this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);

    // Current Temperature
    this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // Target Temperature (configure min / max thresholds from device attributes)
    const minTemp = typeof this.device.minTemp === 'number' ? this.device.minTemp : 5.0;
    const maxTemp = typeof this.device.maxTemp === 'number' ? this.device.maxTemp : 35.0;

    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: minTemp,
        maxValue: maxTemp,
        minStep: 0.5,
      })
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    // Current Heating Cooling State: OFF (0) or HEAT (1)
    this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .setProps({
        validValues: [
          this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
          this.platform.Characteristic.CurrentHeatingCoolingState.HEAT,
        ],
      })
      .onGet(this.getCurrentHeatingCoolingState.bind(this));

    // Target Heating Cooling State: OFF (0), HEAT (1), AUTO (3)
    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
          this.platform.Characteristic.TargetHeatingCoolingState.AUTO,
        ],
      })
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    // Current Relative Humidity
    this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));

    // 3. Optional Eco / Away Mode Switch
    const showEcoSwitch = this.platform.config.showEcoSwitch !== false;
    const existingEcoService = this.accessory.getService('Eco Mode');

    if (showEcoSwitch) {
      this.ecoSwitchService = existingEcoService
        || this.accessory.addService(this.platform.Service.Switch, 'Eco Mode', 'poer-eco-mode');

      this.ecoSwitchService.setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.device.name} Eco Mode`,
      );

      this.ecoSwitchService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.getEcoMode.bind(this))
        .onSet(this.setEcoMode.bind(this));
    } else if (existingEcoService) {
      this.accessory.removeService(existingEcoService);
    }
  }

  // --- Handlers ---

  private getCurrentTemperature(): CharacteristicValue {
    return this.state.currentTemp;
  }

  private getTargetTemperature(): CharacteristicValue {
    return this.state.targetTemp;
  }

  private async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    const target = Number(value);
    this.platform.log.info(`[${this.device.name}] Setting Target Temperature to ${target}°C`);

    this.state.targetTemp = target;
    const success = await this.platform.poerApi.setTargetTemperature(this.device.id, target);

    if (!success) {
      this.platform.log.warn(`[${this.device.name}] Reverting target temperature update due to API failure`);
      this.thermostatService.updateCharacteristic(
        this.platform.Characteristic.TargetTemperature,
        this.state.targetTemp,
      );
    }
  }

  private getCurrentHeatingCoolingState(): CharacteristicValue {
    return this.state.action === 'heating'
      ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
      : this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  private getTargetHeatingCoolingState(): CharacteristicValue {
    if (this.state.mode === 'off') {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
    if (this.state.mode === 'auto') {
      return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    }
    return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  }

  private async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    let mode: 'auto' | 'heat' | 'off';

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      mode = 'heat';
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      mode = 'auto';
    } else {
      mode = 'off';
    }

    this.platform.log.info(`[${this.device.name}] Setting Target State to ${mode} (value: ${value})`);
    this.state.mode = mode;

    const success = await this.platform.poerApi.setMode(this.device.id, mode);
    if (!success) {
      this.platform.log.warn(`[${this.device.name}] Failed to set mode to ${mode}`);
    }

    if (this.ecoSwitchService) {
      this.ecoSwitchService.updateCharacteristic(
        this.platform.Characteristic.On,
        false,
      );
    }
  }

  private getCurrentRelativeHumidity(): CharacteristicValue {
    return this.state.humidity;
  }

  private getEcoMode(): CharacteristicValue {
    return this.state.mode === 'eco';
  }

  private async setEcoMode(value: CharacteristicValue): Promise<void> {
    const isEco = Boolean(value);
    const newMode: 'eco' | 'heat' = isEco ? 'eco' : 'heat';

    this.platform.log.info(`[${this.device.name}] Setting Eco Mode: ${isEco} -> mode: ${newMode}`);
    this.state.mode = newMode;

    const success = await this.platform.poerApi.setMode(this.device.id, newMode);
    if (!success) {
      this.platform.log.warn(`[${this.device.name}] Failed to toggle Eco Mode`);
    }

    // Update thermostat TargetHeatingCoolingState characteristic
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.TargetHeatingCoolingState,
      this.getTargetHeatingCoolingState(),
    );
  }

  /**
   * Called by platform on polling update
   */
  public updateStatus(status: PoerDeviceStatus): void {
    this.state = status;

    // Current Temp
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.CurrentTemperature,
      this.state.currentTemp,
    );

    // Target Temp
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.TargetTemperature,
      this.state.targetTemp,
    );

    // Current State
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.getCurrentHeatingCoolingState(),
    );

    // Target State
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.TargetHeatingCoolingState,
      this.getTargetHeatingCoolingState(),
    );

    // Humidity
    this.thermostatService.updateCharacteristic(
      this.platform.Characteristic.CurrentRelativeHumidity,
      this.state.humidity,
    );

    // Eco switch
    if (this.ecoSwitchService) {
      this.ecoSwitchService.updateCharacteristic(
        this.platform.Characteristic.On,
        this.state.mode === 'eco',
      );
    }
  }
}
