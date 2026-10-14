# Deploying the Kibera Knights app online

The app is one Node.js process that keeps its data in `data/db.json`. Two rules matter above all:
1. It must run behind HTTPS (passwords and logins travel over the internet).
2. The `data` folder must live on storage that survives restarts and redeploys, and be backed up.

## Option A (recommended): a small Linux VPS, about 15 minutes of work
Any provider with an Ubuntu server works (DigitalOcean, Hetzner, Linode, Vultr, AWS Lightsail...). The smallest plan is plenty.
You also want a domain name (e.g. app.kiberaknights.org) with an A record pointing to the server's IP address.

1. Create an Ubuntu 22.04/24.04 server and log in with ssh.
2. Install Node.js 20+ (https://nodejs.org or `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs`).
3. Upload the app, e.g. from your computer:  `scp -r kibera-knights-app user@SERVER_IP:/opt/`
4. Run it as a service. Create `/etc/systemd/system/kibera.service`:

       [Unit]
       Description=Kibera Knights app
       After=network.target
       [Service]
       WorkingDirectory=/opt/kibera-knights-app
       ExecStart=/usr/bin/node server.js
       Environment=PORT=3000 HOST=127.0.0.1 TRUST_PROXY=1 COOKIE_SECURE=1
       Restart=always
       User=www-data
       [Install]
       WantedBy=multi-user.target

   then: `sudo chown -R www-data /opt/kibera-knights-app && sudo systemctl enable --now kibera`
5. Add HTTPS with Caddy (gets free certificates automatically): install Caddy (https://caddyserver.com/docs/install), put this in `/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`:

       app.kiberaknights.org {
           reverse_proxy 127.0.0.1:3000
       }

6. Open the firewall for web traffic only: `sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`.
7. Visit https://your-domain, log in as admin, and change the password.

Settings explained: HOST=127.0.0.1 keeps the app reachable only through Caddy. TRUST_PROXY=1 lets the login lockout see real visitor addresses. COOKIE_SECURE=1 marks the login cookie HTTPS-only. Do not set the last two unless HTTPS is in front of the app.

## Option B: managed platforms (Render, Railway, Fly.io)
They are easier (no server to manage, HTTPS included) but you MUST attach a persistent disk/volume and point DATA_DIR at it
(e.g. mount at /var/data and set DATA_DIR=/var/data; copy data/db.json there first). Without a persistent disk, the data is erased on every redeploy. Free tiers usually have no persistent disk and are not suitable. Set COOKIE_SECURE=1 and TRUST_PROXY=1, start command `node server.js`. Check each provider's current pricing and disk options.

## Backups (do this from day one)
Copy `data/db.json` somewhere safe regularly. On a VPS, a daily cron job is enough:
    0 2 * * * cp /opt/kibera-knights-app/data/db.json /opt/backups/db-$(date +\%F).json
Also download a copy to a different place (your computer or cloud drive) now and then.

## Updating the app
Upload new files over the old ones, but NEVER overwrite the `data` folder. Then `sudo systemctl restart kibera`.

## Children's data
Most players are children, so the app holds personal data about minors. Keep admin and coach accounts to people who need them, use strong passwords, get parents'/guardians' consent for storing their contact details, and read Kenya's Data Protection Act (2019) requirements. View-only members never see phone numbers or emails.
