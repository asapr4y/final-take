import { createApp } from '../server.js';

let instance;
export default async function handler(request, response) {
  try {
    if (!instance) instance = createApp({ hosted: true });
    const app = await instance;
    return await app.handler(request, response);
  } catch (error) {
    instance = undefined;
    console.error('API initialization failed:', error.code || error.name, String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted connection]'));
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' });
    response.end(JSON.stringify({ error: 'Final Take is temporarily unavailable. Please try again shortly.' }));
  }
}
