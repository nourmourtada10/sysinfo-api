import * as http from 'http';
import { getSystemInformation } from './sysinfo';

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.url === '/api/v1/sysinfo') {
      try {
        const data = await getSystemInformation();
        const body = JSON.stringify(data);

        res.writeHead(200, {
          'Content-Type': 'application/json',
        });
        res.end(body);
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}
