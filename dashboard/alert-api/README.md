# alert-api (Grafana -> Telegram)

A small service that receives Grafana alert webhooks and sends notifications to Telegram.

## How the bot works

Flow:
1. Cowrie writes events to logs (`eventid`, `src_ip`, `username`, etc.).
2. Promtail ships logs to Loki.
3. A Grafana Alert Rule evaluates a metric from a LogQL query.
4. When the condition is met, Grafana sends a webhook to `alert-api`.
5. `alert-api` validates `X-Api-Key`, suppresses duplicates by TTL, and sends a message to Telegram via Bot API.

## Environment variables

- `TELEGRAM_BOT_TOKEN` - token from `@BotFather`
- `TELEGRAM_CHAT_IDS` - comma-separated chat IDs (for example `123456789,-100987654321`)
- `ALERT_API_KEY` - key for incoming webhook auth (`X-Api-Key`)
- `DEDUP_TTL_SECONDS` - deduplication window for identical alerts (default `300`)
- `PORT` - service port (default `8081`)

## Bot startup

1. Create `.env`:

```bash
cd /Users/vika/WebstormProjects/honeypot/dashboard/alert-api
cp .env.example .env
```

2. Fill in `.env` (at minimum: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `ALERT_API_KEY`).

3. Start the service (recommended via Compose):

```bash
cd /Users/vika/WebstormProjects/honeypot/dashboard
docker compose up -d --build alert-api
```

4. Check health:

```bash
curl http://localhost:8081/health
```

## Grafana Contact Point setup

1. `Alerting -> Contact points -> New contact point`
2. Type: `Webhook`
3. URL: `http://host.docker.internal:8081/v1/grafana/webhook`
4. `Extra Headers -> Add`:
   - Header: `X-Api-Key`
   - Value: `<ALERT_API_KEY>`
5. Click `Save` and `Test`

## Alert scenarios (real Cowrie rules) + labels

Below is the list for your current Grafana ruleset (no mock scenarios).

Recommended common labels for all Cowrie rules:
- `source=cowrie`
- `severity=<critical|high|medium>`
- `scenario=<machine_readable_name>`
- `team=soc`

### 1) Cowrie | Failed logins burst

LogQL:

```logql
sum(
  count_over_time({job="honeypot"} | json | eventid="cowrie.login.failed" [1m])
)
```

Condition: `IS ABOVE 10`  
For: `1m`  
Suggested labels:
- `alertname=Failed logins burst`
- `severity=high`
- `source=cowrie`
- `scenario=failed_logins_burst`

### 2) Cowrie | Bruteforce single IP

LogQL:

```logql
max(
  sum by (src_ip) (
    count_over_time({job="honeypot"} | json | eventid="cowrie.login.failed" [2m])
  )
)
```

Condition: `IS ABOVE 5`  
For: `1m`  
Suggested labels:
- `alertname=Bruteforce single IP`
- `severity=high`
- `source=cowrie`
- `scenario=bruteforce_single_ip`

### 3) Cowrie | Password spraying

LogQL:

```logql
count(
  sum by (username) (
    count_over_time({job="honeypot"} | json | eventid="cowrie.login.failed" [5m])
  ) > 0
)
```

Condition: `IS ABOVE 8`  
For: `1m`  
Suggested labels:
- `alertname=Password spraying`
- `severity=high`
- `source=cowrie`
- `scenario=password_spraying`

### 4) Cowrie | Distributed scan (many IPs)

LogQL:

```logql
count(
  sum by (src_ip) (
    count_over_time({job="honeypot"} | json | eventid="cowrie.session.connect" [2m])
  ) > 0
)
```

Condition: `IS ABOVE 15`  
For: `1m`  
Suggested labels:
- `alertname=Distributed scan`
- `severity=medium`
- `source=cowrie`
- `scenario=distributed_scan_many_ips`

### 5) Cowrie | Connection flood

LogQL:

```logql
sum(
  count_over_time({job="honeypot"} | json | eventid="cowrie.session.connect" [1m])
)
```

Condition: `IS ABOVE 40`  
For: `1m`  
Suggested labels:
- `alertname=Connection flood`
- `severity=high`
- `source=cowrie`
- `scenario=connection_flood`

### 6) Cowrie | Suspicious command execution

LogQL:

```logql
sum(
  count_over_time(
    {job="honeypot"} | json | eventid="cowrie.command.input" | input=~".*(wget|curl|nc|ncat|bash -i|chmod \\+x|python -c).*" [5m]
  )
)
```

Condition: `IS ABOVE 0`  
For: `0-1m`  
Suggested labels:
- `alertname=Suspicious command execution`
- `severity=critical`
- `source=cowrie`
- `scenario=suspicious_command_execution`

### 7) Cowrie | Successful login (critical)

LogQL:

```logql
sum(
  count_over_time({job="honeypot"} | json | eventid="cowrie.login.success" [5m])
)
```

Condition: `IS ABOVE 0`  
For: `0-1m`  
Suggested labels:
- `alertname=Successful login into honeypot`
- `severity=critical`
- `source=cowrie`
- `scenario=successful_login`

## Manual webhook test

```bash
curl -X POST http://localhost:8081/v1/grafana/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: <ALERT_API_KEY>' \
  -d '{
    "status":"firing",
    "alerts":[
      {
        "labels":{
          "alertname":"Bruteforce Login Failed",
          "severity":"high",
          "source":"cowrie",
          "scenario":"bruteforce_failed_login",
          "src_ip":"1.2.3.4"
        },
        "annotations":{"summary":"Too many failed logins"}
      }
    ]
  }'
```

## How to get `chat_id`

1. Send `/start` to your bot.
2. Run:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```

3. Find `message.chat.id` in the response and add it to `TELEGRAM_CHAT_IDS`.
