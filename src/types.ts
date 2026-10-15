import type { PlatformConfig } from 'homebridge';

export interface PoerPlatformConfig extends PlatformConfig {
  apiKey?: string;
  refreshInterval?: number;
  showEcoSwitch?: boolean;
  debug?: boolean;
}

export interface PoerDeviceInfo {
  id: string;
  name: string;
  model: string;
  firmware: string;
  minTemp: number;
  maxTemp: number;
}

export interface PoerDeviceStatus {
  currentTemp: number;
  targetTemp: number;
  humidity: number;
  mode: 'auto' | 'heat' | 'off' | 'eco';
  action: 'heating' | 'idle';
}
