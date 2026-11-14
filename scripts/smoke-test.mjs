import { io } from 'socket.io-client';

const API = process.env.API_URL || 'http://localhost:4000';
const hostPassword = process.env.HOST_PASSWORD;
const guestPassword = process.env.GUEST_PASSWORD;
if (!hostPassword || !guestPassword) {
  console.error('Set HOST_PASSWORD and GUEST_PASSWORD.');
  process.exit(1);
}
async function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function login(username, password) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  await assert(response.ok, `${username} login failed: ${response.status}`);
  const cookieLine = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie');
  await assert(cookieLine, `${username} session cookie missing`);
  return cookieLine.split(';')[0];
}
async function request(path, cookie, options = {}) {
  return fetch(`${API}/api${path}`, {
    ...options,
    headers: { cookie, 'content-type': 'application/json', ...(options.headers || {}) }
  });
}
function connect(cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { extraHeaders: { Cookie: cookie }, transports: ['websocket'], timeout: 10000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
try {
  const health = await fetch(`${API}/health`);
  await assert(health.ok, 'API health check failed');
  const hostCookie = await login('host', hostPassword);
  const guestCookie = await login('guest', guestPassword);

  const hostAdmin = await request('/chat/admin/activity', hostCookie);
  const guestAdmin = await request('/chat/admin/activity', guestCookie);
  await assert(hostAdmin.ok, 'Host admin access should be allowed');
  await assert(guestAdmin.status === 403, 'Guest must be denied Host admin access');

  const promo = process.env.SMOKE_PROMO || `Smoke-${Date.now()}-Duo`;
  const rotated = await request('/chat/admin/promo', hostCookie, {
    method: 'POST', body: JSON.stringify({ code: promo })
  });
  await assert(rotated.ok, 'Host promo rotation failed');
  const unlocked = await request('/chat/promo/validate', guestCookie, {
    method: 'POST', body: JSON.stringify({ code: promo })
  });
  await assert(unlocked.ok, 'Guest promo unlock failed');

  const hostSocket = await connect(hostCookie);
  const guestSocket = await connect(guestCookie);
  try {
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Real-time message timeout')), 8000);
      hostSocket.once('message:new', message => { clearTimeout(timer); resolve(message); });
    });
    guestSocket.emit('message:send', { content: 'Private Duo smoke test', destination: 'CHAT' });
    const message = await received;
    await assert(message.content === 'Private Duo smoke test', 'Unexpected message payload');
    console.log('PASS: health, login, role authorization, promo unlock and Socket.IO chat.');
  } finally {
    hostSocket.disconnect();
    guestSocket.disconnect();
  }
} catch (error) {
  console.error('FAIL:', error.message || error);
  process.exitCode = 1;
}
