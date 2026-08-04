# HOUSE OF RUBY — Aplikacioni i Barazimeve
### Dokumenti i plotë (hosting, domain, backup, përditësime)

Ky skedar përmban çdo gjë që të duhet për ta mbajtur, zhvendosur ose zgjeruar aplikacionin në të ardhmen.

---

## 1. Çfarë është
Aplikacion web për barazimet ditore të restorantit **House of Ruby**:
- Barazim i **ditës** dhe i **natës** për çdo datë (pas orës 15:00 hapet vetë Nata).
- Për çdo kamarier: sa bëri + shpenzimet e tij (me foto fature) → sa **dorëzon**.
- **Bruto / Neto** dhe **Pazari ditor** (total i ditës).
- **Historik** me filtra dhe detaje + foto.
- **Login** me llogari; **Blini** = akses i plotë (shton/heq përdorues, ndryshon/fshin barazime edhe pas 2 ditësh, rivendos fjalëkalime). Të tjerët ndryshojnë vetëm brenda 2 ditësh.

---

## 2. Ku ndodhet kodi
```
C:\Users\pc\Desktop\CLAUDE\restaurant-app
```
Skedarët kryesorë:
- `server.js` — serveri (Node + Express)
- `public/` — pamja (index.html, app.js, styles.css, logo-*.png, ikonat, manifest.json)
- `Dockerfile` — për hosting kudo
- `data/` — TË DHËNAT (krijohet vetë): `db.json` (barazimet), `users.json` (llogaritë), `uploads/` (fotot)

Kërkesa: **Node.js 20+**. Varësitë: `express`, `multer` (instalohen me `npm install`).
Porti: merret nga `PORT` i mjedisit (përndryshe 3000). App-i përdor lidhje relative, ndaj punon në çdo domain/host pa ndryshuar kod.

---

## 3. Vendosja AKTUALE (Railway)
- **URL live:** https://house-of-ruby-production.up.railway.app
- **Workspace:** blleni's Projects
- **Project:** `friendly-miracle` (ID `6db0ea84-4051-4e67-a6be-4a4c61e14966`)
- **Environment:** `production`
- **Service:** `house-of-ruby`
- **Volume (ruajtja e përhershme):** i montuar te `/app/data`
- **Kredit:** provë falas, pastaj ~5€/muaj sipas përdorimit.

### Përditësimi i app-it (kur ndryshon kodi)
Nga dosja `restaurant-app`, me token-in e Railway (Project → Settings → Tokens):
```powershell
$env:RAILWAY_TOKEN = "<TOKEN-I-YT>"
$rw = "C:\Users\pc\AppData\Roaming\npm\node_modules\@railway\cli\bin\railway.exe"
cd "C:\Users\pc\Desktop\CLAUDE\restaurant-app"
& $rw up --ci --service house-of-ruby
```
> Shënim: PATH-i i kësaj makine s'e njeh `railway` direkt — thirre me shteg të plotë si më sipër.
> Alternativë e rehatshme: lidh një repo **GitHub** te Railway → çdo `git push` bën deploy vetë.

---

## 4. LIDHJA E NJË DOMAIN-I TËND (p.sh. houseofruby.com) — mbi Railway
1. **Bli domain-in** te Namecheap, GoDaddy ose **Cloudflare** (~8–12€/vit).
2. Railway → service **house-of-ruby** → **Settings → Networking → Custom Domain**.
3. Shkruaj domain-in që do:
   - Rekomandohet subdomain: `app.houseofruby.com` (më i thjeshtë), ose
   - Domain kryesor: `houseofruby.com`.
4. Railway të jep një rekord **CNAME** (p.sh. `xxxx.up.railway.app`).
5. Shko te **DNS** i domain-it (te regjistruesi ku e bleve) dhe shto rekordin:
   - Për subdomain: `CNAME  app  →  xxxx.up.railway.app`
   - Për domain kryesor: përdor **ALIAS/ANAME** (ose te Cloudflare thjesht CNAME me "proxied"), sepse CNAME në root nuk lejohet kudo.
6. Prit 5–30 min. **HTTPS-i vjen vetë** (Railway e bën certifikatën).
7. Në telefon, shto në ekran kryesor adresën e re.

> Cloudflare është më i lehtë: DNS + HTTPS + proxy në një vend.

---

## 5. 🟢 MËNYRA MË E THJESHTË — Namecheap (domain + host bashkë, ngarko ZIP)
> Kushti: zgjidh një plan që **mbështet Node.js** — Namecheap **Stellar / Stellar Plus / Stellar Business** e kanë (përmes cPanel → "Setup Node.js App"). Mos merr plan "static-only".

**Paketa gati:** `HouseOfRuby-App.zip` (në Desktop) — përmban gjithçka + `node_modules`, s'ke nevojë të instalosh asgjë.

1. Te **Namecheap** bli **domain** + **hosting Stellar** (mund t'i marrësh bashkë).
2. Hap **cPanel** (nga paneli i Namecheap).
3. **Ngarko skedarët:** cPanel → **File Manager** → krijo/hap një dosje (p.sh. `houseofruby` te Home) → **Upload** `HouseOfRuby-App.zip` → klik i djathtë mbi të → **Extract**.
4. **Krijo app-in:** cPanel → **Setup Node.js App** → **Create Application**:
   - Node version: **20** (ose më e larta)
   - Application mode: **Production**
   - Application root: dosja ku e nxore (p.sh. `houseofruby`)
   - Application URL: **domain-i yt**
   - Application startup file: **`server.js`**
   - **Create**
5. Kliko **Start / Restart Application**. Gati — domain-i shfaq app-in.
   *(Nëse del gabim për varësitë, kliko edhe "Run NPM Install".)*
6. **HTTPS falas:** cPanel → **SSL/TLS Status** → **Run AutoSSL**.

**Lidhja e domain-it:** nëse domain + host janë të dyja te Namecheap, lidhen vetë. Nëse domain-i është diku tjetër, vendos **nameservers** e Namecheap-ut te regjistruesi i domain-it (ose një **A record** te IP-ja e hostit).

**Të dhënat** ruhen te dosja `data/` brenda app-it dhe **mbeten** aty. Bëj **backup** të asaj dose rregullisht (File Manager → Compress → Download).

---

## 6. HOSTIMI DIKU TJETËR (opsione shtesë)
App-i ka `Dockerfile`, kështu punon kudo. Kërkesat gjithmonë: **Node 20+**, një **disk i përhershëm** i montuar te dosja `data/`, dhe **HTTPS**.

### A) Opsione të gatshme (të ngjashme me Railway)
- **Render.com**, **Fly.io**, **DigitalOcean App Platform**.
- Lidh kodin (GitHub ose CLI), shto një **volume/disk** te `/app/data`, merr domain + HTTPS.

### B) Docker (në çfarëdo serveri me Docker)
```bash
docker build -t houseofruby .
docker run -d -p 8080:8080 -v /srv/houseofruby-data:/app/data --name houseofruby houseofruby
```
Të dhënat ruhen te `/srv/houseofruby-data` në host.

### C) VPS Ubuntu (kontroll i plotë, ~4–6€/muaj)
1. Instalo Node 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`
2. Ngarko/kopjo dosjen `restaurant-app` në server.
3. `cd restaurant-app && npm install --omit=dev`
4. Nis me **pm2** (që të rrijë gjallë): `sudo npm i -g pm2 && pm2 start server.js --name houseofruby && pm2 save && pm2 startup`
5. **nginx** si reverse proxy te porti i app-it + **certbot** për HTTPS falas (Let's Encrypt).
6. Backup i rregullt i dosjes `data/`.

---

## 7. BACKUP i të dhënave (E RËNDËSISHME)
Gjithë biznesi është te dosja **`data/`**: `db.json`, `users.json`, `uploads/`.
- **Railway:** service → **Console** → mund t'i shkarkosh/arkivosh (`tar -czf /tmp/backup.tgz /app/data`), ose kopjoji periodikisht.
- **VPS/Docker:** kopjo dosjen `data/` (p.sh. me `rsync`/`cron`) diku të sigurt.
Pa këto skedarë, humbin barazimet dhe fotot. Bëj backup rregullisht.

---

## 8. Përdoruesit & siguria
- Fillimisht: **Blini** (akses i plotë), **Dardani**, **Edoni**, **Arti** — fjalëkalimi `1234`.
- **Ndrysho fjalëkalimet** menjëherë (menuja e përdoruesit → Ndrysho fjalëkalimin).
- Blini shton/heq përdorues dhe rivendos fjalëkalime nga menuja e tij.
- Mos e ndaj publikisht token-in e Railway-t; mund ta fshish/rikrijosh te Railway → Settings → Tokens.

---

## 9. Ndryshime të shpejta (referencë)
- Dritarja e ndryshimit (2 ditë): te `server.js` → `EDIT_WINDOW_DAYS`.
- Ora e kalimit dita→nata (15:00): te `public/app.js` → funksioni `defaultShift()`.
- Ngjyrat/tema: te `public/styles.css` → `:root` (`--primary` = rubini).
- Logoja: `public/logo-full.png`, `public/logo-mark.png`, ikonat `icon-*.png`.

---

*Ky dokument u përgatit që aplikacioni të jetë i pavarur dhe i zhvendosshëm në çdo kohë.*
