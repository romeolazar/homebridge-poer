import test from 'node:test';
import assert from 'node:assert/strict';
import { PoerApi, CN_URL, EU_URL } from '../dist/poerApi.js';
import type { Logging } from 'homebridge';

const mockLogger: Logging = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  log: () => {},
} as unknown as Logging;

test('PoerApi - Region and URL detection', () => {
  const euApi = new PoerApi('eu1234567890', mockLogger);
  assert.equal((euApi as any).baseUrl, EU_URL);
  assert.equal((euApi as any).apiToken, '1234567890');

  const cnApi = new PoerApi('cn9876543210', mockLogger);
  assert.equal((cnApi as any).baseUrl, CN_URL);
  assert.equal((cnApi as any).apiToken, '9876543210');

  const fallbackApi = new PoerApi('custom_token', mockLogger);
  assert.equal((fallbackApi as any).baseUrl, EU_URL);
  assert.equal((fallbackApi as any).apiToken, 'custom_token');
});

test('PoerApi - Request headers formatting', () => {
  const api = new PoerApi('euSecretToken', mockLogger);
  const headers = (api as any).getHeaders();

  assert.equal(headers['Authorization'], 'beer SecretToken');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('PoerApi - syncDevices parses devices correctly', async () => {
  const api = new PoerApi('euTestToken', mockLogger);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options: any) => {
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.inputs[0].intent, 'action.devices.SYNC');

    return new Response(
      JSON.stringify({
        requestId: '111',
        payload: {
          devices: [
            {
              id: 'thermostat-1',
              name: { name: 'Living Room' },
              deviceInfo: {
                model: 'PTC10',
                swVersion: 'v2.1.0',
              },
              attributes: {
                thermostatTemperatureRange: {
                  minThresholdCelsius: 7.0,
                  maxThresholdCelsius: 32.0,
                },
              },
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const devices = await api.syncDevices();
    assert.equal(devices.length, 1);
    assert.equal(devices[0].id, 'thermostat-1');
    assert.equal(devices[0].name, 'Living Room');
    assert.equal(devices[0].model, 'PTC10');
    assert.equal(devices[0].firmware, 'v2.1.0');
    assert.equal(devices[0].minTemp, 7.0);
    assert.equal(devices[0].maxTemp, 32.0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PoerApi - queryDevice parses device status correctly', async () => {
  const api = new PoerApi('euTestToken', mockLogger);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options: any) => {
    return new Response(
      JSON.stringify({
        requestId: '111',
        payload: {
          devices: {
            'thermostat-1': {
              thermostatTemperatureAmbient: 21.5,
              thermostatHumidityAmbient: 48,
              thermostatTemperatureSetpoint: 22.0,
              thermostatMode: 'heat',
              thermostatAction: 'heating',
            },
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const status = await api.queryDevice('thermostat-1');
    assert.ok(status);
    assert.equal(status.currentTemp, 21.5);
    assert.equal(status.targetTemp, 22.0);
    assert.equal(status.humidity, 48);
    assert.equal(status.mode, 'heat');
    assert.equal(status.action, 'heating');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PoerApi - setTargetTemperature sends correct EXECUTE command', async () => {
  const api = new PoerApi('euTestToken', mockLogger);

  const originalFetch = globalThis.fetch;
  let sentBody: any;
  globalThis.fetch = async (url: any, options: any) => {
    sentBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'SUCCESS' }), { status: 200 });
  };

  try {
    const ok = await api.setTargetTemperature('dev-42', 23.5);
    assert.equal(ok, true);
    assert.equal(sentBody.inputs[0].intent, 'action.devices.EXECUTE');
    const cmd = sentBody.inputs[0].payload.commands[0];
    assert.equal(cmd.devices[0].id, 'dev-42');
    assert.equal(cmd.execution[0].command, 'action.devices.commands.ThermostatTemperatureSetpoint');
    assert.equal(cmd.execution[0].params.thermostatTemperatureSetpoint, 23.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PoerApi - setMode sends correct EXECUTE command', async () => {
  const api = new PoerApi('euTestToken', mockLogger);

  const originalFetch = globalThis.fetch;
  let sentBody: any;
  globalThis.fetch = async (url: any, options: any) => {
    sentBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'SUCCESS' }), { status: 200 });
  };

  try {
    const ok = await api.setMode('dev-42', 'eco');
    assert.equal(ok, true);
    const cmd = sentBody.inputs[0].payload.commands[0];
    assert.equal(cmd.execution[0].command, 'action.devices.commands.ThermostatSetMode');
    assert.equal(cmd.execution[0].params.thermostatMode, 'eco');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
