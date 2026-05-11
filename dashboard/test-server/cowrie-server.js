// const WebSocket = require('ws');
// const express = require('express');
// const cors = require('cors');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

// const app = express();
// app.use(cors());

const LOG_FILE = path.join(__dirname, '..', 'logs', 'honeypot.json.log');

// app.get('/api/logs', (req, res) => {
//     try {
//         if (!fs.existsSync(LOG_FILE)) return res.json([]);
//         const content = fs.readFileSync(LOG_FILE, 'utf-8');
//         const logs = content.trim().split('\n').map(JSON.parse);
//         res.json(logs.slice(-1000).reverse());
//     } catch (e) {
//         res.status(500).json({ error: 'Failed to read logs' });
//     }
// });

// const server = app.listen(8080, () => {
//     console.log('HTTP API Server running on port 8080');
// });

// const wss = new WebSocket.Server({ server });
// let clients = [];

// wss.on('connection', (ws) => {
//     clients.push(ws);
//     ws.on('close', () => { clients = clients.filter(c => c !== ws); });
// });
//
// const broadcast = (data) => {
//     clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
// };

// mock geo, hardcoded
const geoMap = {
    'RU': [105.3188, 61.5240], 'CN': [104.1954, 35.8617], 'US': [-95.7129, 37.0902],
    'BR': [-51.9253, -14.2350], 'DE': [10.4515, 51.1657]
};

const logEvent = (eventType, username, password, command = null, ip = null, country = null) => {
    const countries = Object.keys(geoMap);
    const countryCode = country || countries[Math.floor(Math.random() * countries.length)];

    const logEntry = {
        id: crypto.randomBytes(4).toString('hex'),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        timestamp: Date.now(),
        ip: ip || `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.1`,
        countryCode,
        coordinates: geoMap[countryCode],
        username: username || 'root',
        password: password || '123456',
        command,
        eventType
    };

    // это съест Loki для Grafana
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

    // broadcast(logEntry);
    console.log(`[Logged & Sent] ${eventType} | ${logEntry.ip} | ${username}`);
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'cowrie> ' });
console.log('Production Mock Server Started. Logs saved to honeypot.json.log');
rl.prompt();

rl.on('line', (line) => {
    const args = line.trim().split(' ');
    switch (args[0]) {
        case 'fail': logEvent('login.failed', args[1], args[2]); break;
        case 'success': logEvent('login.success', args[1], args[2]); break;
        case 'cmd': logEvent('command.input', 'hacker', null, args.slice(1).join(' ')); break;
        case 'spike':
            const count = parseInt(args[1]) || 20;
            for(let i=0; i<count; i++) setTimeout(() => logEvent('login.failed', 'admin', 'password'), i * 50);
            break;
    }
    setTimeout(() => rl.prompt(), 100);
});