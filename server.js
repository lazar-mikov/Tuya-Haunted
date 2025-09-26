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

/** -------------------------
 *  App middleware
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

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
}

/** -------------------------
 *  Session storage
 *  ------------------------- */
const userSessions = new Map();

/** -------------------------
 *  Tuya signing helpers (V2)
 *  ------------------------- */

// sha256 hex helper


// sha256 hex helper
const sha256hex = (s = '') =>
  crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Build Tuya v2 stringToSign WITHOUT signed headers.
// This intentionally puts a BLANK line for the headers section.
function buildStringToSign(method, pathWithQuery, bodyObj) {
  const httpMethod = method.toUpperCase();
  const bodyStr = bodyObj && Object.keys(bodyObj).length ? JSON.stringify(bodyObj) : '';
  const contentSha256 = sha256hex(bodyStr);
  // Join parts with '\n'. The empty string below becomes a blank line.
  return [httpMethod, contentSha256, '', pathWithQuery].join('\n');
}

function signTuyaRequest({ baseUrl, path, method = 'GET', body = null, accessToken = '' }) {
  const t = Date.now().toString();          // 13-digit ms timestamp
  const nonce = crypto.randomUUID();
  const client_id = process.env.TUYA_CLIENT_ID;
  const secret = process.env.TUYA_CLIENT_SECRET;

  // Only sign PATH + QUERY (no host)
  const u = new URL(path, baseUrl);;
  const pathWithQuery = u.pathname + (u.search || '');

  const stringToSign = buildStringToSign(method, pathWithQuery, body || {});
  const preSign = client_id + (accessToken || '') + t + nonce + stringToSign;

  const sign = crypto.createHmac('sha256', secret).update(preSign, 'utf8').digest('hex').toUpperCase();

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


/** -------------------------
 *  API routes
 *  ------------------------- */

/**
 * POST /api/login
 * Body: { username, password, countryCode?, schema? }
 *
 * - Hashes password (SHA256 lowercase) as Tuya requires
 * - Signs request using v2 signing
 */
app.post('/api/login', async (req, res) => {
  try {
    const {
      username,
      password,
      countryCode = process.env.TUYA_COUNTRY_CODE || '49',
      schema = process.env.TUYA_SCHEMA || 'smartlife'
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'username and password required' });
    }

    const baseUrl = process.env.TUYA_BASE_URL;
    const loginPath = '/v1.0/iot-03/users/login';

    // Tuya requires SHA-256 lowercase hex
    const passwordSha = crypto.createHash('sha256').update(password, 'utf8').digest('hex');

    // If username looks like an email, DO NOT send country_code
    const isEmail = String(username).includes('@');

    const body = {
      username,
      password: passwordSha,
      schema
    };
    if (!isEmail) {
      body.country_code = String(countryCode); // only for phone number logins
    }

    // (Optional) safe debug — remove later
    console.log('[LOGIN]', { isEmail, schema, country_code: isEmail ? '(omitted)' : String(countryCode) });

    const headers = signTuyaRequest({ baseUrl, path: loginPath, method: 'POST', body }); // no access_token
    const r = await axios.post(baseUrl + loginPath, body, { headers, timeout: 10000 });

    if (!r.data?.success) throw new Error(r.data?.msg || 'Login failed');

    const { access_token, refresh_token, uid, expire_time } = r.data.result;
    const sessionData = {
      accessToken: access_token,
      refreshToken: refresh_token,
      uid,
      expiresAt: Date.now() + (expire_time * 1000),
      username
    };
    userSessions.set(req.sessionID, sessionData);
    req.session.authenticated = true;

    res.json({ success: true, uid, message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      error: error.response?.data?.msg || error.message || 'Login failed'
    });
  }
});

/**
 * POST /api/discover
 * Uses users/{uid}/devices, signed with access_token
 */
app.post('/api/discover', async (req, res) => {
  try {
    const sessionData = userSessions.get(req.sessionID);
    if (!sessionData) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    const baseUrl = process.env.TUYA_BASE_URL;
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

/**
 * POST /api/trigger
 * Sends commands to all discovered devices (signed with access_token)
 */
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
        // Some devices expect object, some expect stringified JSON; keeping your version
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
        await new Promise(r => setTimeout(r, 100));
        await controlAllDevices(sessionData, [{ code: 'switch_led', value: true }]);
        await new Promise(r => setTimeout(r, 100));
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
  const baseUrl = process.env.TUYA_BASE_URL;

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

      const response = await axios.post(baseUrl + controlPath, controlBody, { headers, timeout: 3000 });
      return { success: response.data.success, deviceId: device.id };

    } catch (error) {
      return { success: false, deviceId: device.id, error: error.message };
    }
  });

  return Promise.all(promises);
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

// Optional: quick signer sanity-check
app.get('/api/token-test', async (_req, res) => {
  try {
    const baseUrl = process.env.TUYA_BASE_URL;
    const p = '/v1.0/token?grant_type=1';
    const headers = signTuyaRequest({ baseUrl, path: p, method: 'GET' });
    const r = await axios.get(baseUrl + p, { headers, timeout: 10000 });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ ok: false, err: e.response?.data || e.message });
  }
});

console.log('[LOGIN] username:', String(username).slice(0,3) + '***',
            'schema:', schema,
            'country_code:', String(countryCode));



/** -------------------------
 *  SPA catch-all (prod)
 *  ------------------------- */
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎃 Tuya Haunted Lights running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});
