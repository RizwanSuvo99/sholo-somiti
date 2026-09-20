# Deploying sholosomiti.duckdns.org

This site runs on the shared VPS at `144.79.249.138` alongside two others. It
shares **only nginx and the Docker daemon** with them: its own containers,
network, volume, database, port range, vhost, backup script and cron line.

| | |
|---|---|
| Domain | `sholosomiti.duckdns.org` |
| App | `127.0.0.1:3002` → container port 3000 |
| Database | `127.0.0.1:5437` → Postgres 16 |
| Directory | `/opt/sholo-somiti` |
| Containers | `somiti_app`, `somiti_postgres`, `somiti_migrate` (one-shot) |
| Backup | `/opt/backups/sholo-somiti-db.sh`, 04:00, 14 days |

## The rule that matters most

Every published port carries the `127.0.0.1:` prefix. Docker writes its own
iptables rules that **bypass ufw**, so `"5437:5432"` would put this database on
the public internet while `ufw status` still claimed it was blocked. After any
change, check with `ss -ltn` — the left column must read `127.0.0.1:`.

## First deploy

```bash
ssh root@144.79.249.138
mkdir -p /opt/sholo-somiti && cd /opt/sholo-somiti
git clone https://github.com/RizwanSuvo99/sholo-somiti.git .

# Secrets. Never committed; root-owned and unreadable by anyone else.
cp .env.example .env && chmod 600 .env
#   SESSION_SECRET   openssl rand -base64 48
#   CRON_SECRET      openssl rand -hex 32
#   POSTGRES_PASSWORD, POSTGRES_USER=somiti, POSTGRES_DB=somiti
#   DATABASE_URL=postgresql://somiti:<password>@db:5432/somiti?schema=public
#     ^ host is `db`, the compose service — not localhost, not 5437
#   CLOUDINARY_*

docker compose -f docker-compose.prod.yml up -d --build

# The one admin account. NOT `prisma db seed` — that seeds 28 placeholder
# members and eight months of dues, which would fill a real register with
# invented people.
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL='you@example.com' -e ADMIN_PASSWORD='<16+ chars>' \
  migrate pnpm tsx scripts/create-admin.ts
```

Then nginx and TLS:

```bash
cp deploy/nginx/sholosomiti.conf /etc/nginx/sites-available/sholosomiti
ln -s /etc/nginx/sites-available/sholosomiti /etc/nginx/sites-enabled/sholosomiti
nginx -t && systemctl reload nginx     # always -t first: a broken config takes
                                       # every site on the box down on reload
certbot --nginx -d sholosomiti.duckdns.org
```

And the nightly dump, appended to the crontab — never `crontab -e`, which would
silently drop the other two sites' backup lines:

```bash
install -m 755 deploy/backup-db.sh /opt/backups/sholo-somiti-db.sh
crontab -l > /tmp/cron
echo '0 4 * * * /opt/backups/sholo-somiti-db.sh >> /var/log/somiti-backup.log 2>&1' >> /tmp/cron
crontab /tmp/cron && crontab -l
```

04:00 is chosen to clear 03:00 and 03:30, which the other two sites use.

## Updating

```bash
cd /opt/sholo-somiti
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The old container keeps serving until the new image is ready. Migrations run
first and the app will not start if they fail — serving against a schema the
code does not expect is worse than being briefly down.

The build takes several minutes on this box. That is normal, not a hang; don't
run it at the same time as another site's build.

## Things worth knowing

- **The image needs no secrets to build.** Nothing is baked into the bundle, so
  changing any setting is a restart, not a rebuild.
- **The build needs no database.** Every page that reads one is
  `force-dynamic`; a page left on `revalidate` would be prerendered at build
  time and would fail here, or bake stale figures into the first response.
- **`prisma db push` must never be run.** It silently drops the partial unique
  index enforcing one submission per member per month, and the CHECK
  constraints. Use migrations. `pnpm db:verify` asserts they are present.
- **The rollover job is not wired to cron yet.** It closes each month and levies
  the ৳200 fines. Add when the society is live:
  ```cron
  TZ=Asia/Dhaka
  5 0 21 * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
    http://127.0.0.1:3002/api/cron/month-rollover >> /var/log/somiti-cron.log 2>&1
  ```
  Running it twice is a no-op, so a retry is safe.

## Restoring a backup

A backup you have never restored is not a backup.

```bash
docker exec somiti_postgres psql -U somiti -d postgres -c "CREATE DATABASE restore_test;"
zcat /opt/backups/sholo-somiti/<latest>.sql.gz | docker exec -i somiti_postgres psql -U somiti -d restore_test
docker exec somiti_postgres psql -U somiti -d restore_test -c "SELECT count(*) FROM members;"
docker exec somiti_postgres psql -U somiti -d postgres -c "DROP DATABASE restore_test;"
```
