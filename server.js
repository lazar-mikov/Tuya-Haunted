import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // required on Railway for secure session cookies

/** -------------------------
 *  Middleware
 *  ------------------------- */
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

/** -------------------------
 *  Session storage
 *  ------------------------- */
const userSessions = new Map();

/** -------------------------
 *  Tuya signing helpers
 *  ------------------------- */

// sha256 hex helper
const sha256hex = (s = '') => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Build Tuya v2 stringToSign WITHOUT signed headers (blank line for headers)
function buildStringToSign(method, pathWithQuery, bodyObj) {
  const httpMethod = method.toUpperCase();
  const bodyStr = bodyObj && Object.keys(bodyObj).length ? JSON.stringify(bodyObj) : '';
  const contentSha256 = sha256hex(bodyStr);
  return [httpMethod, contentSha256, '', pathWithQuery].join('\n');
}

/**
 * Sign with **cloud project** key/secret (device APIs)
 */
function signTuyaRequest({ baseUrl, path, method = 'GET', body = null, accessToken = '' }) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const client_id = process.env.TUYA_CLIENT_ID;      // CLOUD key
  const secret = process.env.TUYA_CLIENT_SECRET;     // CLOUD secret

  const u = new URL(path, baseUrl);
  const pathWithQuery = u.pathname + (u.search || '');

  const stringToSign = buildStringToSign(method, pathWithQuery, body || {});
  const preSign = client_id + (accessToken || '') + t + nonce + stringToSign;

  const sign = crypto.createHmac('sha256', secret)
    .update(preSign, 'utf8').digest('hex').toUpperCase();

  const headers = {
    'client_id': client_id,
    'sign': sign,
    't': t,
    'nonce': nonce,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (accessToken) headers['access_token'] = accessToken;

  return headers;
}

/**
 * Sign with **APP** key/secret (OAuth token exchange)
 */
function signWithAppKey(path) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const contentHash = crypto.createHash('sha256').update('', 'utf8').digest('hex');
  const stringToSign = ['GET', contentHash, '', path].join('\n');

  const appClientId = process.env.TUYA_APP_CLIENT_ID;       // APP key
  const appSecret   = process.env.TUYA_APP_CLIENT_SECRET;   // APP secret

  const preSign = appClientId + t + nonce + stringToSign;
  const sign = crypto.createHmac('sha256', appSecret)
    .update(preSign, 'utf8').digest('hex').toUpperCase();

  return {
    'client_id': appClientId,
    'sign': sign,
    't': t,
    'nonce': nonce,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
}

/** -------------------------
 *  Health & debug
 *  ------------------------- */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    sessions: userSessions.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/debug-oauth', (req, res) => {
  res.json({
    appClientId_len: (process.env.TUYA_APP_CLIENT_ID || '').length,
    cloudClientId_len: (process.env.TUYA_CLIENT_ID || '').length,
    baseUrl: process.env.TUYA_BASE_URL,
    appUrl: process.env.APP_URL || 'not set',
    redirectUri: `${process.env.APP_URL || 'https://tuya-haunted-production.up.railway.app'}/api/auth-callback`,
    h5Base: process.env.TUYA_H5_LOGIN_BASE || 'https://openapi.tuyaeu.com/h5/oauth/authorize',
  });
});

/** -------------------------
 *  OAuth (H5) start + callback - UPDATED WITH FIXES
 *  ------------------------- */

// Start OAuth - UPDATED with Smart Life parameters
app.get('/api/smart-life-auth', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const h5Base = process.env.TUYA_H5_LOGIN_BASE || 'https://app-h5.iot320.com/d/login';
  const appClientId = process.env.TUYA_APP_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL || 'https://tuya-haunted-production.up.railway.app'}/api/auth-callback`;
  const schema = process.env.TUYA_SCHEMA || 'smartlife';

  // UPDATED: Added parameters to specify Smart Life for "Others" authorization
  const url =
    `${h5Base}?client_id=${encodeURIComponent(appClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&schema=${encodeURIComponent(schema)}` +
    `&state=${encodeURIComponent(state)}` +
    `&app_code=smartlife` +     // Tells Tuya to use Smart Life
    `&platform=smartlife` +      // Populates the empty dropdown
    `&app_type=smartlife`;       // Additional parameter for redundancy

  console.log('[OAUTH] redirect ->', url);
  res.redirect(url);
});

// OAuth callback - UPDATED with correct grant_type
app.get('/api/auth-callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) throw new Error('missing_code');
    if (req.session.oauthState && state && state !== req.session.oauthState) {
      throw new Error('state_mismatch');
    }

    // UPDATED: Changed grant_type from 2 to 3 for OAuth code exchange
    const base = process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com';
    const path = `/v1.0/token?grant_type=3&code=${encodeURIComponent(code)}`;

    // Sign with App Authorization keys
    const headers = signWithAppKey(path);

    const r = await axios.get(base + path, { headers, timeout: 10000 });
    if (!r.data?.success) {
      console.error('[OAUTH] token exchange failed:', r.data);
      return res.redirect('/?auth=failed&error=' + encodeURIComponent(r.data?.msg || 'token_exchange_failed'));
    }

    const { access_token, refresh_token, uid, expire_time } = r.data.result;
    userSessions.set(req.sessionID, {
      accessToken: access_token,
      refreshToken: refresh_token,
      uid,
      expiresAt: Date.now() + expire_time * 1000
    });
    req.session.authenticated = true;
    console.log('[OAUTH] success uid:', uid);

    res.redirect('/?auth=success');
  } catch (e) {
    console.error('[OAUTH] callback error:', e.response?.data || e.message);
    res.redirect('/?auth=failed&error=' + encodeURIComponent(e.message));
  }
});

/** -------------------------
 *  Devices: discover & trigger
 *  ------------------------- */

// Discover devices for the logged-in user
app.post('/api/discover', async (req, res) => {
  try {
    const sessionData = userSessions.get(req.sessionID);
    if (!sessionData) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    const baseUrl = process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com';
    const devicesPath = `/v1.0/users/${sessionData.uid}/devices`;

    const headers = signTuyaRequest({
      baseUrl,
      path: devicesPath,
      method: 'GET',
      accessToken: sessionData.accessToken
    });

    const response = await axios.get(baseUrl + devicesPath, { headers, timeout: 10000 });
    if (!response.data.success) throw new Error(response.data.msg || 'Failed to get devices');

    const devices = response.data.result || [];

    const lights = devices.filter(device => {
      const cat = device.category;
      return cat === 'dj' || cat === 'dd' || cat === 'dg' ||
             cat === 'cz' || cat === 'pc' ||
             device.product_name?.toLowerCase().includes('light') ||
             device.product_name?.toLowerCase().includes('bulb') ||
             device.product_name?.toLowerCase().includes('lamp') ||
             device.product_name?.toLowerCase().includes('plug');
    });

    const formattedDevices = lights.map(d => ({
      id: d.id,
      name: d.name || d.product_name,
      type: d.category,
      online: d.online
    }));

    sessionData.devices = formattedDevices;
    userSessions.set(req.sessionID, sessionData);

    res.json({ success: true, devices: formattedDevices, total: formattedDevices.length });
  } catch (error) {
    console.error('Discovery error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send effect commands to all discovered devices
app.post('/api/trigger', async (req, res) => {
  try {
    const { effect } = req.body;
    const sessionData = userSessions.get(req.sessionID);

    if (!sessionData) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    console.log(`🎭 Triggering ${effect} for session ${req.sessionID}`);

    const effectCommands = {
      'blackout': [
        { code: 'switch_led', value: false },
        { code: 'switch', value: false }
      ],
      'flash-red': [
        { code: 'switch_led', value: true },
        { code: 'work_mode', value: 'colour' },
        { code: 'colour_data_v2', value: JSON.stringify({ h: 0, s: 1000, v: 1000 }) }
      ],
      'reset': [
        { code: 'switch_led', value: true },
        { code: 'switch', value: true },
        { code: 'work_mode', value: 'white' },
        { code: 'bright_value_v2', value: 500 }
      ],
      'dim': [
        { code: 'switch_led', value: true },
        { code: 'bright_value_v2', value: 100 }
      ],
      'flicker': 'custom'
    };

    const commands = effectCommands[effect];
    if (!commands) {
      return res.status(400).json({ success: false, error: `Unknown effect: ${effect}` });
    }

    if (effect === 'flicker') {
      for (let i = 0; i < 5; i++) {
        await controlAllDevices(sessionData, [{ code: 'switch_led', value: false }]);
        await new Promise(r => setTimeout(r, 120));
        await controlAllDevices(sessionData, [{ code: 'switch_led', value: true }]);
        await new Promise(r => setTimeout(r, 120));
      }
      return res.json({ success: true, effect: 'flicker' });
    }

    const results = await controlAllDevices(sessionData, commands);
    const successCount = results.filter(r => r.success).length;

    res.json({
      success: successCount > 0,
      effect,
      devicesTriggered: successCount,
      totalDevices: sessionData.devices?.length || 0
    });
  } catch (error) {
    console.error('Trigger error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function controlAllDevices(sessionData, commands) {
  const devices = sessionData.devices || [];
  const baseUrl = process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com';

  const promises = devices.map(async (device) => {
    if (!device.online) return { success: false, deviceId: device.id };

    try {
      const controlPath = `/v1.0/devices/${device.id}/commands`;
      const controlBody = { commands };

      const headers = signTuyaRequest({
        baseUrl,
        path: controlPath,
        method: 'POST',
        body: controlBody,
        accessToken: sessionData.accessToken
      });

      const response = await axios.post(baseUrl + controlPath, controlBody, { headers, timeout: 4000 });
      return { success: response.data.success, deviceId: device.id };
    } catch (error) {
      return { success: false, deviceId: device.id, error: error.message };
    }
  });

  return Promise.all(promises);
}

/** -------------------------
 *  Static (must be last in production)
 *  ------------------------- */
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'build')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
  });
}

/** -------------------------
 *  Start server
 *  ------------------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎃 Tuya Haunted Lights running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});