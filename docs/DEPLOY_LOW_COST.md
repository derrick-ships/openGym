# Run openGym on a budget

openGym is free software. You can use it on one Android phone without a server, try it in a browser, or pay for a small server to sync your training between devices. Prices and setup times below are estimates, not guarantees; check current prices, taxes, minimum billing and provider terms before paying.

## Pick your path

- **A. Android phone, no sync:** install the APK. **$0; about 5 minutes.** Your data stays on the phone.
- **B. Try it in a browser:** open the demo or use guest mode. **$0; a few minutes.** Browser data does not sync.
- **C. Your own synced server:** rent one small VPS and use Docker Compose with HTTPS. **About $4–8/month plus any domain cost; about 45–90 minutes the first time.**
- **D. Prefer a dashboard:** run Coolify on that same VPS, then deploy openGym through it. **The same VPS cost, plus any domain cost; about 60–120 minutes the first time.** Coolify is the option the maintainer uses.

A VPS is a rented computer that stays on. A domain is a name such as `gym.example.com`. A free subdomain such as `mygym.duckdns.org` can also work. Paid domains can cost roughly **$1–12/year**, though renewal prices and some extensions cost more. Prices change, check before buying; examples of VPS providers include Hetzner (CX22), Contabo and DigitalOcean Basic. Check availability, region, currency and billing for the exact machine you choose.

## Prerequisites checklist

You do **not** need everything for every path:

- **Android phone (A):** no Android phone? Use the browser demo (B) or the self-hosted PWA (C/D) instead. The APK is not an iPhone app.
- **GitHub account (optional for C; useful for D):** public source can be cloned without one. Don't have an account? [Create one for free](https://github.com/signup) if you want to fork the project or connect a repository to Coolify.
- **Domain or stable subdomain (C/D):** don't have one? Try a free [DuckDNS](https://www.duckdns.org/) subdomain, or buy a domain and check the renewal price first. Some tunnel providers require a domain managed by them; a DuckDNS name does not automatically qualify.
- **VPS and payment card (C/D):** don't have a VPS or card? Use A or B for free; most VPS providers require a card or another accepted payment method even for an introductory offer. Choose a current Ubuntu or Debian Linux image and note its public IP address. Avoid optional paid add-ons until you need them.
- **SSH (C/D):** SSH is a secure terminal connection to the server. Don't have a separate app? macOS and most Windows installations include `ssh` in Terminal. Follow your VPS provider's instructions for adding an SSH key and connecting; keep your key private and do not paste it into an AI chat.
- **Docker with Compose (C/D):** don't have it? Docker's [installation guide](https://docs.docker.com/engine/install/) and [Compose plugin guide](https://docs.docker.com/compose/install/linux/) are free. Install them on the VPS, not just on your laptop. The commands below use `sudo` so membership in the Docker group is not required.

## Path A — Android APK only

1. On your Android phone, download the signed APK from the [openGym download page](https://opengym.duarte-santos.ch) or an available [GitHub release](https://github.com/derrick-ships/openGym/releases).
2. Open the downloaded file. Android may ask you to allow installs from your browser; allow it for this install, then install openGym. This is normal for an app outside the Play Store. Download only from a source you trust; the release checksum can be used to verify the file.
3. Choose the local, on-device option on first launch. There is no account, server or cross-device sync in this mode. Export a backup from Settings and keep it somewhere safe; uninstalling the app or losing the phone can lose its local data. Exercise images and GIFs are loaded from a CDN and need network access until cached.

The same APK can instead pair with your own server later. That is a different mode and needs a running server; see [Mobile app](MOBILE.md#connecting-the-app-to-your-own-server).

## Path B — browser demo or guest mode

Open the [in-browser demo](https://opengym.duarte-santos.ch/demo/) to explore example data, without an account or installation. Treat it as a demo, not a backup for important training history. On an openGym instance that permits it, **Continue without account** starts guest mode. Guest data is stored in that browser on that device; clearing browser storage or changing devices can lose it. Export a backup in Settings.

**Static-hosting limit:** Vercel, Netlify and GitHub Pages can host only the built static frontend for guest mode, not the full app. There is no API, passkey login or cross-device sync there: the API needs a long-running Node process and a writable `./data` folder. Hosting the frontend yourself is more work than opening the existing demo.

## Path C — a small VPS with Docker Compose

**Cost:** roughly $4–8/month for one small VPS, plus a domain if you buy one. **Time:** roughly 45–90 minutes the first time. This is a real server, not a free static frontend. The example below uses Caddy for HTTPS; [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) is an alternative.

1. **Create and connect to the VPS.** Note the server's public IP. In your provider's firewall, allow SSH (port 22), HTTP (80) and HTTPS (443); restrict SSH to your own IP if possible. Do not make openGym's internal port 8080 publicly accessible. Your VPS provider's firewall can block it even when Docker publishes a port; Docker's firewall rules can bypass a local UFW rule. Use your provider's SSH command, for example:

   ```sh
   ssh your-user@YOUR_SERVER_IP
   ```

   Replace `your-user` and `YOUR_SERVER_IP` with the values from the provider. Install Git, Docker Engine and the Compose plugin using your Linux provider's instructions and the Docker links above. Check with `git --version`, `sudo docker --version` and `sudo docker compose version`.

2. **Choose a stable name.** Point a DNS A record such as `gym.example.com` to the VPS public IPv4 address at your domain provider. With DuckDNS, create your free subdomain and set its IP to the VPS IP in the DuckDNS dashboard. Wait for DNS to resolve before continuing. Keep the chosen hostname: changing it later invalidates existing passkeys.

3. **Get openGym and set the address.** Run these on the VPS:

   ```sh
   git clone https://github.com/derrick-ships/openGym
   cd openGym
   cp .env.example .env
   nano .env
   ```

   In the first lines of `.env`, replace the default `RP_ID` and `ORIGIN` with your own name (the examples are not literal values to keep):

   ```env
   RP_ID=gym.example.com
   ORIGIN=https://gym.example.com
   WEB_PORT=8080
   RP_NAME=openGym
   ```

   In nano, press **Ctrl+O**, Enter to save, then **Ctrl+X** to exit. `RP_ID` is the bare hostname, with no `https://`, port or slash. `ORIGIN` is the full public origin, including `https://` and any non-default port, without a trailing slash. Browser passkeys require HTTPS (except on localhost) and a stable hostname: they are bound to `RP_ID`, and `ORIGIN` must match the browser's address.

4. **Start the stack.** These are the prebuilt-image commands from the README, with `sudo` added for a typical VPS. The first start downloads about 140 MB of exercise media; wait for it to finish.

   ```sh
   sudo docker compose pull
   sudo docker compose up -d
   sudo docker compose ps
   curl http://localhost:8080/api/health
   ```

   The health check should return JSON containing `"ok":true`. If pulling images fails, `sudo docker compose up -d --build` builds them from source instead. The `media` container is a one-shot downloader; it may correctly show as exited after success.

5. **Put HTTPS in front.** Install Caddy for your Linux distribution using the [official instructions](https://caddyserver.com/docs/install), then edit `/etc/caddy/Caddyfile` with your actual hostname:

   ```caddy
   gym.example.com {
       reverse_proxy localhost:8080
   }
   ```

   Run `sudo systemctl enable --now caddy` and `sudo systemctl reload caddy`. Caddy obtains and renews a certificate when DNS points to your server and ports 80/443 are reachable. Visit `https://gym.example.com` on your phone, create a passkey profile, and add it to the home screen if you like. Both the app and `/api` must go through this same public origin.

   **Alternative: Cloudflare Tunnel.** On Cloudflare's free plan, follow its tunnel setup to create a persistent tunnel, configure a supported hostname in your Cloudflare account, and route it to `http://localhost:8080` on this VPS. Set `RP_ID` and `ORIGIN` to that public HTTPS hostname as above. A tunnel can avoid inbound HTTP/HTTPS ports, but needs its own Cloudflare account and a hostname supported by Cloudflare; don't assume a DuckDNS subdomain can be used as a Cloudflare-managed zone. See [Self-hosting](SELF_HOSTING.md#3-expose-it-over-https-on-your-own-domain).

6. **Back up and update.** From the `openGym` directory, run:

   ```sh
   sudo tar czf opengym-backup-$(date +%F).tar.gz data/
   ```

   Copy the archive to a separate safe location and repeat regularly. It contains private data and secrets; do not publish it. For updates, see [Self-hosting: updating](SELF_HOSTING.md#8-updating). LAN-only HTTPS is another option for an existing home server; see [HTTPS at home](SELF_HOSTING_HTTPS.md).

## Path D — Coolify on the same VPS

Coolify is a self-hosted deployment dashboard, not free hosting: you still pay for the VPS and any domain. The maintainer uses Coolify. Allow roughly 60–120 minutes on a fresh VPS. You need the same stable hostname, HTTPS, Docker and backups as Path C.

1. Install Coolify on your VPS using its [official installation guide](https://coolify.io/docs/get-started/installation). Follow its current firewall and dashboard-access instructions; do not install a second copy on another paid server just for openGym.
2. In Coolify, add a Docker Compose resource from the [openGym repository](https://github.com/derrick-ships/openGym). A public repository may not need a GitHub connection; Coolify may ask for one if you use a private fork. Use the repository's `docker-compose.yml`, which includes `media`, `api` and `web`. Let the media download finish on first deployment.
3. Set `RP_ID` to your public hostname and `ORIGIN` to its exact HTTPS origin in the Compose resource environment. The repo's `api` service uses `env_file: .env`; if Coolify does not provide that file in its deployment directory, remove that line in the resource's Compose editor and add `RP_ID=${RP_ID}` and `ORIGIN=${ORIGIN}` under the existing `api.environment` list. Do not add a second `environment` block. Keep `DATA_DIR=/data`.
4. Make the host-side paths for `./data`, `./media/img` and `./media/gif` durable across redeploys. For example, create `/srv/opengym/data`, `/srv/opengym/media/img` and `/srv/opengym/media/gif` on the VPS, then map those absolute paths to the same container paths shown in the original Compose file, including the media mounts on both services. Confirm the Coolify user can write them. Store backups separately from the VPS.
5. In Coolify's domain settings, route your HTTPS hostname to the **web** service on its internal port **80**, not to the API. Coolify's proxy must issue a certificate and reach the `web` service on a shared network. Avoid a host port conflict with any existing service using 8080; adjust or remove the web host-port mapping as appropriate for your Coolify proxy setup. Deploy, open the HTTPS URL, and create a passkey. Coolify's screens can change between versions; check its current Compose and domain documentation if the labels differ.
6. Back up the actual persistent data directory, for example from `/srv/opengym`: `sudo tar czf opengym-backup-$(date +%F).tar.gz data/`. Confirm the archive contains your `data/` files before relying on it.

## Troubleshooting

1. **Passkey prompt missing or login fails:** open the exact HTTPS hostname configured in `.env` or Coolify. `RP_ID=gym.example.com` has no scheme or port; `ORIGIN=https://gym.example.com` has the scheme and no trailing slash. After editing `.env`, use `sudo docker compose up -d` to recreate containers; `restart` does not reload the file. See the [passkey checks](SELF_HOSTING.md#passkeys-fail-even-though-rp_id-looks-right).
2. **Site unreachable or port already in use:** check DNS and your VPS firewall; Caddy needs public 80/443, and must proxy to the actual local `WEB_PORT` (8080 by default). Check `sudo docker compose ps` and `sudo docker compose logs web api`. If 8080 is occupied, set a free `WEB_PORT` in `.env`, run `sudo docker compose up -d`, and update the proxy target. Do not expose the API separately.
3. **Exercise media is missing or the web service waits:** run `sudo docker compose logs media` and check that the VPS can reach the upstream dataset and has disk space. Retry with `sudo docker compose up -d`; see the [media troubleshooting](SELF_HOSTING.md#troubleshooting) and `NOTICE.md` for third-party media terms.

## Let your AI do it

Copy this prompt into your AI assistant. Review every command before running it; never share passwords, private SSH keys, recovery codes or payment details.

```text
Help me deploy openGym using the cheapest suitable option. First ask whether I have a GitHub account, a domain, a VPS, and a payment card. Then explain the costs and guide me one step at a time, waiting for my confirmation after each step. Use the openGym deployment guide at https://github.com/derrick-ships/openGym/blob/main/docs/DEPLOY_LOW_COST.md and explain how to back up my data.
```
