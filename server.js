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

// Middleware
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

// Store user sessions
const userSessions = new Map();

// Tuya API helpers
function generateTuyaSign(client_id, secret, timestamp, nonce, signStr) {
    const str = client_id + timestamp + nonce + signStr;
    return crypto.createHmac('sha256', secret)
        .update(str)
        .digest('hex')
        .toUpperCase();
}

function getTuyaHeaders(path, method = 'GET', body = {}) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const client_id = process.env.TUYA_CLIENT_ID;
    const secret = process.env.TUYA_CLIENT_SECRET;
    
    const contentHash = crypto.createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex');
    
    const signStr = method === 'GET' ? '' : contentHash;
    const sign = generateTuyaSign(client_id, secret, timestamp, nonce, signStr);
    
    return {
        'client_id': client_id,
        'sign': sign,
        't': timestamp,
        'nonce': nonce,
        'sign_method': 'HMAC-SHA256',
        'Content-Type': 'application/json'
    };
}

// API Routes
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, countryCode = '49', schema = 'smartlife' } = req.body;
        
        console.log(`🔐 Login attempt for: ${username}`);
        
        const loginUrl = '/v1.0/iot-03/users/login';
        const loginBody = { 
            username, 
            password, 
            country_code: countryCode, 
            schema 
        };
        const headers = getTuyaHeaders(loginUrl, 'POST', loginBody);
        
        const response = await axios.post(
            `${process.env.TUYA_BASE_URL}${loginUrl}`,
            loginBody,
            { headers, timeout: 10000 }
        );
        
        if (!response.data.success) {
            throw new Error(response.data.msg || 'Login failed');
        }
        
        const { access_token, refresh_token, uid, expire_time } = response.data.result;
        
        const sessionData = {
            accessToken: access_token,
            refreshToken: refresh_token,
            uid: uid,
            expiresAt: Date.now() + (expire_time * 1000),
            username: username
        };
        
        userSessions.set(req.sessionID, sessionData);
        req.session.authenticated = true;
        
        res.json({
            success: true,
            uid: uid,
            message: 'Login successful'
        });
        
    } catch (error) {
        console.error('Login error:', error.response?.data || error.message);
        res.status(400).json({
            success: false,
            error: error.response?.data?.msg || error.message || 'Login failed'
        });
    }
});

app.post('/api/discover', async (req, res) => {
    try {
        const sessionData = userSessions.get(req.sessionID);
        
        if (!sessionData) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated. Please login first.'
            });
        }
        
        const devicesUrl = `/v1.0/users/${sessionData.uid}/devices`;
        const headers = {
            ...getTuyaHeaders(devicesUrl, 'GET'),
            'access_token': sessionData.accessToken
        };
        
        const response = await axios.get(
            `${process.env.TUYA_BASE_URL}${devicesUrl}`,
            { headers, timeout: 10000 }
        );
        
        if (!response.data.success) {
            throw new Error(response.data.msg || 'Failed to get devices');
        }
        
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
        
        res.json({
            success: true,
            devices: formattedDevices,
            total: formattedDevices.length
        });
        
    } catch (error) {
        console.error('Discovery error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/trigger', async (req, res) => {
    try {
        const { effect } = req.body;
        const sessionData = userSessions.get(req.sessionID);
        
        if (!sessionData) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
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
                { code: 'colour_data_v2', value: JSON.stringify({ h: 0, s: 1000, v: 1000 })}
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
            return res.status(400).json({
                success: false,
                error: `Unknown effect: ${effect}`
            });
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
            effect: effect,
            devicesTriggered: successCount,
            totalDevices: sessionData.devices?.length || 0
        });
        
    } catch (error) {
        console.error('Trigger error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

async function controlAllDevices(sessionData, commands) {
    const devices = sessionData.devices || [];
    
    const promises = devices.map(async (device) => {
        if (!device.online) return { success: false, deviceId: device.id };
        
        try {
            const controlUrl = `/v1.0/devices/${device.id}/commands`;
            const controlBody = { commands };
            const headers = {
                ...getTuyaHeaders(controlUrl, 'POST', controlBody),
                'access_token': sessionData.accessToken
            };
            
            const response = await axios.post(
                `${process.env.TUYA_BASE_URL}${controlUrl}`,
                controlBody,
                { headers, timeout: 3000 }
            );
            
            return {
                success: response.data.success,
                deviceId: device.id
            };
        } catch (error) {
            return {
                success: false,
                deviceId: device.id,
                error: error.message
            };
        }
    });
    
    return Promise.all(promises);
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        sessions: userSessions.size,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/build/index.html'));
    });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🎃 Tuya Haunted Lights running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});