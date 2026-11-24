import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createServer } from './server';

// The endpoint runs real system probes, which can take several seconds in WSL.
jest.setTimeout(15_000);

describe('system information API', () => {
  let server: Server;
  let baseUrl: string;

  // eslint-disable-next-line jest/no-hooks -- Share one HTTP server across the suite.
  beforeAll(async () => {
    server = createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  // eslint-disable-next-line jest/no-hooks -- Release the shared HTTP server.
  afterAll(async () => {
    if (!server.listening) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('should return HTTP 404 for an unknown path', async () => {
    expect.assertions(1);

    const response = await fetch(`${baseUrl}/`);
    await response.text();

    expect(response.status).toBe(404);
  });

  it('should return HTTP 404 for /api/v1/sysinfo1/sysinfo', async () => {
    expect.assertions(1);

    const response = await fetch(`${baseUrl}/api/v1/sysinfo1/sysinfo`);
    await response.text();

    expect(response.status).toBe(404);
  });

  it('should return HTTP 200 for sysinfo', async () => {
    expect.assertions(1);

    const response = await fetch(`${baseUrl}/api/v1/sysinfo`);
    await response.text();

    expect(response.status).toBe(200);
  });

  it('should return JSON content', async () => {
    expect.assertions(1);

    const response = await fetch(`${baseUrl}/api/v1/sysinfo`);
    await response.text();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('should contain all required system information', async () => {
    expect.assertions(8);

    const response = await fetch(`${baseUrl}/api/v1/sysinfo`);
    const data = await response.json();

    const fields = [
      'cpu',
      'system',
      'mem',
      'os',
      'currentLoad',
      'processes',
      'diskLayout',
      'networkInterfaces',
    ];

    for (const field of fields) {
      expect(data).toHaveProperty(field);
    }
  });
});
