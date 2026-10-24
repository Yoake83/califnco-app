import { createServer } from 'node:http';
import handler from './commerce-handler';

const port = Number(process.env.COMMERCE_PORT || '3001');
createServer((request, response) => {
  if (request.url?.split('?')[0] !== '/api/commerce') { response.statusCode = 404; response.end(); return; }
  void handler(request, response);
}).listen(port, '127.0.0.1', () => console.log(`Local order API: http://127.0.0.1:${port}/api/commerce`));
