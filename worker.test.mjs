// Isolated SQLite integration tests. Never connects to remote D1 or reads local secrets.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWorker } from '../scripts/load-worker.mjs';
const mod = await loadWorker(true);
function setup() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_makaristan_tenant.sql', '0003_camera_security.sql']) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
    async run() { return { meta: db.prepare(this.sql).run(...this.args) }; }
  }
  const env = { CAMERA_CREDENTIAL_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'), ikurt_izle_db: {
    prepare: sql => new Statement(sql),
    async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  } };
  const call = async (path, method = 'GET', body, token, worker = mod.default) => {
    const response = await worker.fetch(new Request('http://localhost' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
    return { status: response.status, data: await response.json() };
  };
  return { db, env, call };
}
const cameraId = 'cam_makaristan_cocuk_oyun_alani';
const cameraPath = '/api/admin/cameras/' + cameraId;

test('SHA-256 and AES-256-GCM round trip, random IV, tamper/key/version rejection', async () => {
  assert.equal(await mod.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const encrypted = await mod.encryptCredential('şifre-test', key);
  assert.equal(await mod.decryptCredential(encrypted, key), 'şifre-test');
  assert.notEqual(encrypted, await mod.encryptCredential('şifre-test', key));
  assert.equal(Buffer.from(encrypted.split('.')[1], 'base64').length, 12);
  await assert.rejects(mod.decryptCredential(encrypted.replace('v1.', 'v2.'), key));
  await assert.rejects(mod.decryptCredential(encrypted, Buffer.alloc(32).toString('base64')));
  const parts = encrypted.split('.'); const bytes = Buffer.from(parts[2], 'base64'); bytes[0] ^= 1; parts[2] = bytes.toString('base64');
  await assert.rejects(mod.decryptCredential(parts.join('.'), key));
  await assert.rejects(mod.encryptCredential('x', 'invalid'));
});

test('camera configuration, credentials, partial updates, create and tenant isolation', async () => {
  const { db, env, call } = setup();
  const incomplete = await call(cameraPath + '/test', 'POST');
  assert.equal(incomplete.data.status, 'CONFIGURATION_INCOMPLETE');
  assert.deepEqual(incomplete.data.missing, ['Host / IP', 'RTSP port', 'Kullanıcı adı', 'Şifre', 'NVR kanal numarası']);
  assert.equal((await call(cameraPath, 'PATCH', { source_host: 'rtsp://user:secret@host' })).status, 400);
  assert.equal((await call(cameraPath, 'PATCH', { source_port: 65536 })).status, 400);
  assert.equal((await call(cameraPath, 'PATCH', { enabled: 'false' })).status, 400);
  assert.equal((await call(cameraPath, 'PATCH', { source_type: 'http' })).status, 400);
  assert.equal((await call(cameraPath, 'PATCH', { location_id: 'other-tenant' })).status, 400);
  const update = { manufacturer: 'Dahua', model: 'DH-IPC-HDW1230V-SA', recorder_model: 'NVR-D855', connection_mode: 'nvr', source_host: '192.0.2.1', source_port: 554, channel_number: 2, source_type: 'rtsps', stream_profile: 'main', username: 'synthetic-user', password: 'synthetic-password', audio_enabled: true, recording_enabled: true };
  assert.equal((await call(cameraPath, 'PATCH', update)).status, 200);
  const before = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
  assert.match(before.password_enc, /^v1\./);
  assert.equal(await mod.decryptCredential(before.password_enc, env.CAMERA_CREDENTIAL_KEY), update.password);
  const list = await call('/api/admin/cameras');
  assert.equal(list.data.cameras[0].has_credentials, true);
  for (const field of ['username_enc', 'password_enc', 'username', 'password']) assert.equal(field in list.data.cameras[0], false);
  assert.equal((await call(cameraPath, 'PATCH', { username: '', password: '', enabled: false })).status, 200);
  assert.equal(db.prepare('SELECT password_enc FROM cameras WHERE id = ?').get(cameraId).password_enc, before.password_enc);
  assert.equal((await call(cameraPath + '/test', 'POST')).data.status, 'READY_FOR_GATEWAY'); // disabled camera still validates
  await call(cameraPath, 'PATCH', { username: update.username, password: update.password });
  assert.equal(db.prepare('SELECT credentials_updated_at FROM cameras WHERE id = ?').get(cameraId).credentials_updated_at, before.credentials_updated_at);
  await call(cameraPath, 'PATCH', { password: 'replacement' });
  const after = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
  assert.equal(after.username_enc, before.username_enc); assert.notEqual(after.password_enc, before.password_enc);
  await call(cameraPath, 'PATCH', { source_port: null, source_host: '' });
  assert.equal((await call(cameraPath + '/test', 'POST')).data.status, 'CONFIGURATION_INCOMPLETE');
  const created = await call('/api/admin/cameras', 'POST', { location_id: before.location_id, name: 'Test camera', slug: 'test-camera', username: 'test', password: 'test', connection_mode: 'ip_camera' });
  assert.equal(created.status, 201);
  const newCamera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(created.data.id);
  assert.equal(newCamera.source_port, null); assert.equal(newCamera.source_host, null); assert.match(newCamera.username_enc, /^v1\./);
  assert.equal((await call('/api/admin/cameras/unknown', 'PATCH', { name: 'x' })).status, 404);
  assert.equal((await call('/api/admin/cameras/unknown/test', 'POST')).status, 404);
  env.CAMERA_CREDENTIAL_KEY = '';
  assert.equal((await call(cameraPath, 'PATCH', { password: 'new' })).status, 503);
  db.close();
});

test('public access, scan count, token hash, heartbeat recency and all revocation gates', async () => {
  const { db, call } = setup();
  for (const path of ['dashboard', 'locations', 'cameras', 'access-links', 'viewers', 'gateways', 'settings']) assert.equal((await call('/api/admin/' + path)).status, 200);
  const link = (await call('/api/admin/access-links', 'POST', { camera_id: cameraId })).data;
  const publicPath = '/api/public/access/' + link.code;
  assert.equal((await call(publicPath)).status, 200);
  const created = await call(publicPath + '/session', 'POST');
  assert.equal(created.status, 201); const token = created.data.token;
  const row = db.prepare('SELECT * FROM viewer_sessions').get();
  assert.equal(row.session_token_hash, await mod.sha256(token)); assert.notEqual(row.session_token_hash, token);
  assert.equal(db.prepare('SELECT scan_count FROM access_links').get().scan_count, 1);
  const session = await call('/api/public/session', 'GET', undefined, token);
  assert.equal(session.status, 200);
  for (const field of ['source_host', 'username_enc', 'password_enc', 'source_port']) assert.equal(field in session.data.session, false);
  db.exec("UPDATE viewer_sessions SET last_seen_at = datetime('now', '-100 seconds')");
  assert.equal((await call('/api/admin/dashboard')).data.stats.active_viewers, 0);
  assert.equal((await call('/api/admin/viewers')).data.viewers[0].is_active, 0);
  assert.equal((await call('/api/public/session/heartbeat', 'POST', undefined, token)).status, 200);
  assert.equal((await call('/api/admin/dashboard')).data.stats.active_viewers, 1);
  assert.equal((await call('/api/admin/viewers')).data.viewers[0].is_active, 1);
  const gates = [
    ["UPDATE tenants SET status = 'suspended'", "UPDATE tenants SET status = 'active'"],
    ["UPDATE locations SET status = 'inactive'", "UPDATE locations SET status = 'active'"],
    ["UPDATE cameras SET enabled = 0", "UPDATE cameras SET enabled = 1"],
    ["UPDATE access_links SET status = 'disabled'", "UPDATE access_links SET status = 'active'"],
    ["UPDATE access_links SET status = 'revoked'", "UPDATE access_links SET status = 'active'"],
    ["UPDATE access_links SET expires_at = datetime('now', '-1 minute')", "UPDATE access_links SET expires_at = NULL"],
  ];
  for (const [disable, enable] of gates) {
    db.exec(disable);
    assert.equal((await call(publicPath)).status, 404, disable);
    assert.equal((await call(publicPath + '/session', 'POST')).status, 403, disable);
    assert.equal((await call('/api/public/session', 'GET', undefined, token)).status, 401, disable);
    assert.equal((await call('/api/public/session/heartbeat', 'POST', undefined, token)).status, 401, disable);
    assert.equal((await call('/api/admin/dashboard')).data.stats.active_viewers, 0, disable);
    db.exec(enable);
  }
  db.exec("UPDATE viewer_sessions SET expires_at = datetime('now', '-1 minute')");
  assert.equal((await call('/api/public/session/heartbeat', 'POST', undefined, token)).status, 401);
  assert.equal((await call('/api/public/session/heartbeat', 'POST')).status, 401);
  db.close();
});

test('camera move keeps QR links consistent and revokes old sessions', async () => {
  const { db, call } = setup();
  const link = (await call('/api/admin/access-links', 'POST', { camera_id: cameraId })).data;
  const token = (await call('/api/public/access/' + link.code + '/session', 'POST')).data.token;
  const loc = (await call('/api/admin/locations', 'POST', { name: 'Second', slug: 'second' })).data.id;
  assert.equal((await call(cameraPath, 'PATCH', { location_id: loc })).status, 200);
  assert.equal((await call('/api/public/session', 'GET', undefined, token)).status, 401);
  assert.equal((await call('/api/public/access/' + link.code)).data.access.location_id, loc);
  db.close();
});

test('production admin fails closed, invalid JSON is safe', async () => {
  const { db, env, call } = setup(); const prod = await loadWorker(false);
  for (const path of ['cameras', 'settings', 'dashboard', 'gateways', 'viewers', 'locations', 'access-links']) assert.equal((await call('/api/admin/' + path, 'GET', undefined, undefined, prod.default)).status, 403);
  const bad = await mod.default.fetch(new Request('http://localhost/api/admin/cameras', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), env);
  assert.equal(bad.status, 400);
  const cross = await mod.default.fetch(new Request('http://localhost/api/admin/cameras', { method: 'POST', headers: { origin: 'https://untrusted.example' }, body: '{}' }), env);
  assert.equal(cross.status, 403); db.close();
});

test('business delete requires exact name, cascades atomically and preserves other businesses/tenants', async () => {
  const { db, call } = setup();
  const target = 'loc_makaristan_malatya';
  const link = (await call('/api/admin/access-links', 'POST', { camera_id: cameraId })).data;
  await call('/api/public/access/' + link.code + '/session', 'POST');
  const other = (await call('/api/admin/locations', 'POST', { name: 'Keep me', slug: 'keep' })).data.id;
  const otherCamera = (await call('/api/admin/cameras', 'POST', { location_id: other, name: 'Keep camera', slug: 'keep-camera' })).data.id;
  db.exec("INSERT INTO tenants (id,name,slug) VALUES ('other','Other tenant','other'); INSERT INTO locations(id,tenant_id,name,slug) VALUES ('foreign','other','Foreign business','foreign')");
  const path = '/api/admin/locations/' + target;
  for (const body of [{}, { confirmation_name: null }, { confirmation_name: 'Makaristan' }, { confirmation_name: 'Makaristan Malatya ' }]) {
    assert.ok((await call(path, 'DELETE', body)).status >= 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM viewer_sessions').get().n, 1);
  }
  assert.equal((await call('/api/admin/locations/foreign', 'DELETE', { confirmation_name: 'Foreign business' })).status, 409);
  assert.equal((await call(path, 'DELETE', { confirmation_name: 'Makaristan Malatya' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM locations WHERE id = ?').get(target).n, 0);
  for (const table of ['cameras', 'access_links', 'viewer_sessions']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE location_id = ?`).get(target).n, 0);
  assert.ok(db.prepare('SELECT id FROM cameras WHERE id = ?').get(otherCamera));
  assert.ok(db.prepare("SELECT id FROM locations WHERE id = 'foreign'").get());
  assert.equal((await call(path, 'DELETE', { confirmation_name: 'Makaristan Malatya' })).status, 409);
  db.close();
});

test('production JWT validates signature, expiry, issuer, audience, type and the single allowed email', async () => {
  const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test-key'; jwk.alg = 'RS256';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const env = { ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_AUD: 'test-audience', ADMIN_EMAIL: 'tarik@ikurt.net', ADMIN_HOST: 'admin.example.test' };
  const base = { iss: 'https://test.cloudflareaccess.com', aud: 'test-audience', sub: 'test-user', email: 'tarik@ikurt.net', type: 'app', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60 };
  const sign = (claims, key = privateKey) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
  assert.equal(await mod.verifyAdminToken(await sign(base), env, keys), 'tarik@ikurt.net');
  for (const patch of [{email:'other@example.com'}, {aud:'wrong'}, {iss:'https://attacker.example'}, {exp:0}, {type:'service'}, {nbf:base.exp+3600}, {sub:undefined}, {exp:undefined}]) {
    await assert.rejects(mod.verifyAdminToken(await sign({...base,...patch}), env, keys));
  }
  const wrong = await generateKeyPair('RS256');
  await assert.rejects(mod.verifyAdminToken(await sign(base,wrong.privateKey), env, keys));
  await assert.rejects(mod.verifyAdminToken('bad.token.value', env, keys));
  await assert.rejects(mod.verifyAdminToken(await sign(base), {...env,ACCESS_AUD:undefined}, keys));
  const { db, call } = setup(); const prod = await loadWorker(false);
  assert.equal((await call('/api/admin/locations/loc_makaristan_malatya','DELETE',{confirmation_name:'Makaristan Malatya'},undefined,prod.default)).status,403);
  assert.ok(db.prepare("SELECT id FROM locations WHERE id='loc_makaristan_malatya'").get()); db.close();
});

test('production request middleware grants only a cryptographically verified admin and rejects forged headers', async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const pair = await generateKeyPair('RS256'); const jwk = await exportJWK(pair.publicKey); jwk.kid='request-test'; jwk.alg='RS256';
  const { db, env } = setup();
  Object.assign(env,{ ACCESS_TEAM_DOMAIN:'request-test.cloudflareaccess.com', ACCESS_AUD:'request-test', ADMIN_EMAIL:'tarik@ikurt.net', ADMIN_HOST:'admin.example.test', ASSETS:{fetch:async()=>new Response('admin html')} });
  const prod = await loadWorker(false);
  const token = await new SignJWT({type:'app',email:'tarik@ikurt.net'}).setProtectedHeader({alg:'RS256',kid:'request-test'}).setIssuer('https://request-test.cloudflareaccess.com').setAudience('request-test').setSubject('admin').setIssuedAt().setExpirationTime('1m').sign(pair.privateKey);
  const fetchOriginal=globalThis.fetch;
  globalThis.fetch=async input=>{assert.equal(String(input),'https://request-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  try {
    const request=(path,headers={},method='GET',body)=>prod.default.fetch(new Request('https://admin.example.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env);
    assert.equal((await request('/api/admin/locations',{'Cf-Access-Jwt-Assertion':token})).status,200);
    assert.equal((await request('/admin',{'Cf-Access-Jwt-Assertion':token})).status,200);
    assert.equal((await request('/api/admin/locations',{'Cf-Access-Authenticated-User-Email':'tarik@ikurt.net'})).status,403);
    assert.equal((await request('/api/admin/locations',{'Cf-Access-Jwt-Assertion':'forged.jwt.value'})).status,403);
    assert.equal((await request('/api/admin/locations/loc_makaristan_malatya',{'Cf-Access-Jwt-Assertion':token,'content-type':'application/json',origin:'https://evil.example'},'DELETE',{confirmation_name:'Makaristan Malatya'})).status,403);
    assert.equal((await request('/api/admin/locations/loc_makaristan_malatya',{'Cf-Access-Jwt-Assertion':token,'content-type':'text/plain'},'DELETE',{confirmation_name:'Makaristan Malatya'})).status,415);
    assert.ok(db.prepare("SELECT id FROM locations WHERE id='loc_makaristan_malatya'").get());
  } finally {globalThis.fetch=fetchOriginal;db.close();}
});
