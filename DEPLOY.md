# Vendosja online — House of Ruby (Railway)

Aplikacioni ruan të dhënat në dosjen `data/` (db.json, users.json, uploads).
Prandaj në re **duhet një Volume i përhershëm** i montuar te `/app/data`,
përndryshe të dhënat & fotot humbin kur riniset serveri.

## Rruga e rekomanduar: Railway CLI (pa GitHub)

1. Instalo Railway CLI (një herë):
   npm i -g @railway/cli

2. Hyr (hap shfletuesin, krijo llogari falas):
   railway login

3. Në dosjen e aplikacionit:
   cd "C:\Users\pc\Desktop\CLAUDE\restaurant-app"
   railway init            # zgjidh "Empty Project", jepi emër: house-of-ruby

4. Ngarko dhe ndërto:
   railway up

5. Shto Volume-in (RUAJTJA E TË DHËNAVE):
   - Hap projektin te railway.app → shërbimi → Settings → Volumes
   - Add Volume → Mount path: /app/data
   - Redeploy (Deploy)

6. Merr adresën publike HTTPS:
   - Settings → Networking → Generate Domain
   - Del një URL si https://house-of-ruby-production.up.railway.app

7. Hape URL-në, hyr si Blini (fjalëkalimi 1234) dhe **NDRYSHO FJALËKALIMET** e të gjithëve.

8. Në telefon: hap URL-në → menuja e shfletuesit → "Add to Home Screen".

## Alternativë: GitHub + Railway (nga faqja)
- Krijo një repo në github.com, pastaj:
  git remote add origin https://github.com/<user>/house-of-ruby.git
  git push -u origin master
- Në railway.app → New Project → Deploy from GitHub repo → zgjidh repon.
- Pastaj bëj hapat 5–8 si më sipër.

## Shënime sigurie
- Ndrysho fjalëkalimet standarde (1234) menjëherë pasi të jetë online.
- (Opsionale) vendos një ADMIN_PIN/variabla mjedisi te Railway → Variables nëse duhet.
