const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..'), auth = require('../lib/audio-compat-auth.cjs');
const source = fs.readFileSync(path.join(root, 'pages/api/media-audio.js'), 'utf8');
const code = babel.transformSync(source, { configFile: false, babelrc: false, presets: [[require.resolve('@babel/preset-env'), { targets: { node: '18' }, modules: 'commonjs' }]] }).code;

function api() {
  const state = { session: { user: { role: 'agent', id: 'agent-1' } }, contact: { assigned_to: 'agent-1' }, message: { id: 'audio-1', contact_id: 'customer-1', media_path: 'customer/voice.ogg', media_type: 'audio' }, calls: [], signs: [] };
  const env = { SUPABASE_URL: 'https://fixture.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key-only', WHATSAPP_RENDER_URL: 'https://render.test/send?ignored=1' };
  const db = { from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'messages' ? state.message : state.contact }) }) }) }), storage: { from: () => ({ list: async (_, options) => ({ data: state.cached ? [{ name: options.search }] : [] }), createSignedUrl: async (p, seconds) => { state.signs.push([p, seconds]); return { data: { signedUrl: 'https://storage.test/' + p } }; } }) } };
  const exports = {}, context = { exports, process: { env }, URL, AbortController, setTimeout, clearTimeout,
    require: name => ({ 'next-auth/next': { getServerSession: async () => state.session }, '../../lib/auth': { authOptions: {} }, '@supabase/supabase-js': { createClient: () => db }, '../../lib/audio-compat-auth.cjs': auth }[name]),
    fetch: async (url, options) => { state.calls.push({ url, options }); if (state.throw) throw state.throw; return { ok: !state.status || state.status < 300, status: state.status || 200, json: async () => state.reply || { storagePath: auth.cachePath(state.message.media_path), mimeType: 'audio/mpeg' } }; }
  };
  vm.runInNewContext(code, context);
  state.run = async (query = { id: 'audio-1' }, method = 'GET') => { const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; }, end() {}, redirect(s, url) { this.statusCode = s; this.redirectUrl = url; } }; await exports.default({ method, query }, res); return res; };
  state.env = env; return state;
}
async function main() {
  let s = api(); s.session = null; assert.equal((await s.run()).statusCode, 401); assert.equal(s.calls.length, 0);
  s = api(); s.contact.assigned_to = 'someone-else'; assert.equal((await s.run()).statusCode, 403); assert.equal(s.calls.length, 0);
  s = api(); assert.equal((await s.run({ id: ['audio-1'] })).statusCode, 400); assert.equal((await s.run(undefined, 'POST')).statusCode, 405);
  s = api(); delete s.env.SUPABASE_SERVICE_ROLE_KEY; assert.equal((await s.run()).statusCode, 503);
  s = api(); s.message = null; assert.equal((await s.run()).statusCode, 404);
  s = api(); s.message.media_type = 'document'; assert.equal((await s.run()).statusCode, 415); assert.equal(s.calls.length, 0);
  s = api(); const response = await s.run(); assert.equal(response.statusCode, 302); assert.equal(response.redirectUrl, 'https://storage.test/' + auth.cachePath('customer/voice.ogg'));
  assert.equal(s.calls[0].url, 'https://render.test/audio-compatible'); assert.equal(JSON.parse(s.calls[0].options.body).messageId, 'audio-1');
  assert(auth.verify(s.env.SUPABASE_SERVICE_ROLE_KEY, 'audio-1', s.calls[0].options.headers));
  assert(!JSON.stringify(s.calls[0]).includes(s.env.SUPABASE_SERVICE_ROLE_KEY), 'Only the request signature crosses the server boundary');
  s = api(); s.session.user.role = 'admin'; s.contact.assigned_to = 'other'; assert.equal((await s.run()).statusCode, 302);
  s = api(); s.cached = true; assert.equal((await s.run()).statusCode, 302); assert.equal(s.calls.length, 0, 'Cached MP3s play without waking Render');
  for (const status of [401, 403, 404, 429, 503]) { s = api(); s.status = status; s.reply = { error: 'Conversor no disponible' }; const res = await s.run(); assert.equal(res.statusCode, status === 401 || status === 403 ? 502 : status); assert.equal(s.signs.length, 0); }
  s = api(); s.reply = { storagePath: 'another-customer/file.mp3', mimeType: 'audio/mpeg' }; assert.equal((await s.run()).statusCode, 502); assert.equal(s.signs.length, 0);
  s = api(); s.throw = Object.assign(new Error('timeout'), { name: 'AbortError' }); assert.equal((await s.run()).statusCode, 504);

  const html = fs.readFileSync(path.join(root, 'public/ipad/index.html'), 'utf8'), script = fs.readFileSync(path.join(root, 'public/ipad/app.js'), 'utf8');
  acorn.parse(script, { ecmaVersion: 5 });
  const dom = new JSDOM(html, { url: 'https://crm.test/ipad/index.html', runScripts: 'outside-only', pretendToBeVisual: true }), w = dom.window;
  try {
    let loads = 0, plays = 0, requests = 0;
    w.HTMLMediaElement.prototype.load = () => loads++;
    w.HTMLMediaElement.prototype.play = () => { plays++; }; // Safari 9 returns no Promise.
    w.XMLHttpRequest = class {
      open(method, url) { this.url = url; } setRequestHeader() {} abort() {}
      send() { requests++; this.status = 200; this.readyState = 4;
        this.responseText = JSON.stringify(this.url.includes('/api/auth/session') ? { user: { name: 'Fixture' } } : [{ id: 'customer', name: 'Fixture', status: 'Nuevo Lead', messages: [{ id: 'audio-1', mediaId: 'audio-1', mediaType: 'audio', mediaName: 'voice.ogg' }] }]); this.onreadystatechange(); }
    };
    w.eval(script); w.document.querySelector('#contacts [data-id="customer"]').click();
    const audio = w.document.querySelector('audio'); assert(audio); assert.equal(audio.preload, 'none'); assert.equal(audio.getAttribute('src'), '/api/media-audio?id=audio-1');
    const links = Array.from(w.document.querySelectorAll('#messages a')); assert(links.some(a => a.getAttribute('href') === '/api/media-file?id=audio-1')); assert(links.some(a => /Abrir MP3/.test(a.textContent)));
    assert.equal(plays, 0, 'No autoplay or background conversion');
    audio.dispatchEvent(new w.Event('error')); const retry = Array.from(w.document.querySelectorAll('#messages button')).find(b => /Reintentar audio/.test(b.textContent)); assert(!retry.className.includes('hidden'));
    retry.click(); assert.equal(loads, 1); assert.equal(plays, 1); assert.match(audio.src, /_audio=/); assert.equal(requests, 2, 'Audio controls do not resend any WhatsApp message');
    audio.dispatchEvent(new w.Event('loadedmetadata')); assert(retry.className.includes('hidden')); assert.match(w.document.querySelector('#messages').textContent, /compatible con iPad/);
    assert(html.includes('app.js?v=3'));
  } finally { dom.window.close(); }
  console.log('PASS: CRM session/assignment/admin checks, signed conversion request, MP3 cache-path validation, upstream failures, timeout and ES5 iPad audio/retry controls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
