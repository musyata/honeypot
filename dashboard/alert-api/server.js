const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8081);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const ALERT_API_KEY = process.env.ALERT_API_KEY || '';
const DEDUP_TTL_SECONDS = Number(process.env.DEDUP_TTL_SECONDS || 300);
const dedupCache = new Map();

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendTelegramMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (d) => (raw += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(raw);
          } else {
            reject(new Error(`Telegram HTTP ${res.statusCode}: ${raw}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractAlertCore(payload) {
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  return alerts.map((a) => ({
    status: a.status || payload.status || '',
    labels: a.labels || {},
    annotations: a.annotations || {},
  }));
}

function dedupFingerprint(payload) {
  const core = extractAlertCore(payload);
  return crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
}

function isDuplicate(payload) {
  const now = Date.now();
  for (const [key, expiresAt] of dedupCache.entries()) {
    if (expiresAt <= now) dedupCache.delete(key);
  }

  const key = dedupFingerprint(payload);
  const expiresAt = dedupCache.get(key);
  if (expiresAt && expiresAt > now) return true;

  dedupCache.set(key, now + DEDUP_TTL_SECONDS * 1000);
  return false;
}

function buildMessage(payload) {
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const status = payload.status || 'unknown';

  if (!alerts.length) {
    return `🚨 <b>Grafana alert</b>\nstatus: <b>${status}</b>\n(no alerts array in payload)`;
  }

  const parts = alerts.slice(0, 5).map((a, i) => {
    const labels = a.labels || {};
    const ann = a.annotations || {};
    const title = ann.summary || ann.description || labels.alertname || `alert_${i + 1}`;
    const severity = labels.severity || 'n/a';
    const source = labels.source || labels.job || 'unknown';
    return [
      `• <b>${title}</b>`,
      `severity: <b>${severity}</b>`,
      `source: <b>${source}</b>`,
      labels.ip ? `ip: <code>${labels.ip}</code>` : null,
      labels.src_ip ? `src_ip: <code>${labels.src_ip}</code>` : null,
      labels.eventType ? `event: <code>${labels.eventType}</code>` : null,
      labels.eventid ? `eventid: <code>${labels.eventid}</code>` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [`🚨 <b>Grafana alert: ${status.toUpperCase()}</b>`, ...parts].join('\n\n');
}

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'alert-api',
      hasTelegramToken: Boolean(BOT_TOKEN),
      chatIdsConfigured: CHAT_IDS.length,
    });
  }

  if (req.method === 'POST' && req.url === '/v1/grafana/webhook') {
    try {
      if (ALERT_API_KEY) {
        const incoming = req.headers['x-api-key'];
        if (incoming !== ALERT_API_KEY) {
          return json(res, 401, { ok: false, error: 'Unauthorized: invalid X-Api-Key' });
        }
      }

      const payload = await readJson(req);

      if (!BOT_TOKEN || CHAT_IDS.length === 0) {
        return json(res, 400, {
          ok: false,
          error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS',
        });
      }

      if (isDuplicate(payload)) {
        return json(res, 200, {
          ok: true,
          skipped: true,
          reason: `Duplicate alert in ${DEDUP_TTL_SECONDS}s window`,
        });
      }

      const message = buildMessage(payload);
      const results = [];

      for (const chatId of CHAT_IDS) {
        try {
          await sendTelegramMessage(chatId, message);
          results.push({ chatId, ok: true });
        } catch (e) {
          results.push({ chatId, ok: false, error: e.message });
        }
      }

      return json(res, 200, {
        ok: true,
        delivered: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`alert-api listening on http://localhost:${PORT}`);
});
