# Dépannage

Trois problèmes possibles, **indépendants**. Prenez-les dans cet ordre.

---

## A — « Je n'arrive pas à ouvrir localhost »

C'est le blocage actuel. Le terminal affiche `✓ Ready in 577ms` : **le serveur
tourne**. Si le navigateur n'ouvre rien, c'est que la requête n'arrive jamais
jusqu'à lui — donc **ce n'est pas le code du site**.

### Le plus rapide : double-cliquez `demarrer.bat`

Il fait tout :

- force l'écoute sur `127.0.0.1` au lieu de `localhost` ;
- bascule sur le port **3005** si le 3000 est déjà pris ;
- **ouvre le navigateur tout seul** à la bonne adresse.

`demarrer.bat clean` fait la même chose en vidant d'abord le cache `.next`.

### Pourquoi « localhost » peut échouer alors que le serveur tourne

Sur Windows, `localhost` est résolu **d'abord en IPv6 (`::1`)**. Le serveur Next,
lui, écoute en IPv4 (`0.0.0.0`). Selon la configuration réseau, le navigateur
essaie `::1`, n'obtient pas de réponse, et abandonne au lieu de basculer sur
`127.0.0.1`.

**Test immédiat, sans rien installer :** tapez dans le navigateur

```
http://127.0.0.1:3000
```

Si cette adresse fonctionne et pas `localhost:3000`, le diagnostic est confirmé.

### Pour savoir précisément d'où ça vient

Laissez `npm run dev` tourner dans sa fenêtre, puis **double-cliquez
`verifier-localhost.bat`** dans une autre. Il :

1. liste qui écoute sur le port 3000 (`netstat`) ;
2. essaie d'ouvrir la page **depuis Windows lui-même**, sur `127.0.0.1` puis sur
   `localhost` ;
3. affiche un verdict :

| Résultat | Cause | Solution |
|---|---|---|
| Les deux répondent | le serveur va bien → **navigateur** | navigation privée, désactiver extensions/VPN/antivirus web, et **Paramètres → Réseau → Proxy : tout désactivé** |
| Seul `127.0.0.1` répond | résolution **IPv6** de Windows | utilisez `http://127.0.0.1:3000`, ou `demarrer.bat` |
| Aucun ne répond | **pare-feu / antivirus / port occupé** | autoriser Node.js dans le pare-feu, ou `npm run dev -- -p 3005` |
| Personne n'écoute sur 3000 | le serveur s'est arrêté | regardez les erreurs dans la fenêtre `npm run dev` |

Copiez-moi tout ce qu'il affiche si le doute persiste.

### Nouvelles commandes disponibles

```bat
npm run dev        REM comportement d'origine
npm run dev:ip     REM ecoute sur 127.0.0.1  (contourne le probleme IPv6)
npm run dev:alt    REM 127.0.0.1 sur le port 3005
npm run diagnose   REM diagnostic base de donnees
```

> `dev:ip` et `dev:alt` n'écoutent que sur votre PC : un téléphone du même WiFi
> ne pourra plus s'y connecter. Pour cela, gardez `npm run dev` et utilisez
> l'adresse `Network:` affichée au démarrage.

---

## B — Le site s'ouvre mais reste bloqué sur une page vide

Cause : **Supabase ne répond pas**. Les projets gratuits se mettent **en pause**
après quelques jours d'inactivité, et toutes les pages étant rendues côté serveur
à partir du catalogue, elles attendaient sans limite de temps.

**Corrigé** dans `lib/supabase/server.js` : chaque appel abandonne au bout de
10 secondes, la page s'affiche quand même, et le terminal écrit :

```
⚠️  Supabase n'a pas répondu en 10 s (xxxx.supabase.co).
    → Ouvrez https://supabase.com/dashboard : si le projet est « Paused », cliquez « Restore ».
```

Vérifié avec une base volontairement injoignable : la page d'accueil répond en
**7 s** au lieu de bloquer indéfiniment. Réglable via `SUPABASE_TIMEOUT_MS`.

**À faire :** <https://supabase.com/dashboard> → si le projet affiche **Paused**,
cliquez **Restore project**, patientez 1–2 min.

Puis `diagnostic.bat` vérifie tout le reste (clés, tables, bucket, catalogue).

---

## C — Le site EN LIGNE n'a pas changé

Normal : les fichiers sont sur **votre PC** (`Desktop\wbp\wbp`). Vercel construit
depuis un **dépôt GitHub**. Ce dossier contient bien `vercel.json` mais **aucun
`.git`** — il n'est relié à rien. Tant que le code n'est pas envoyé, le site en
ligne reste identique.

### Option 1 — GitHub (voie normale)

```bat
cd C:\Users\abdel\Desktop\wbp\wbp
git init
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
git fetch origin
git checkout -b main origin/main
git add -A
git commit -m "Mise a niveau 2026-07 : images, vitrine, pop-up, assistant IA"
git push origin main
```

Vercel redéploie en 1–2 minutes. L'adresse du dépôt est dans
Vercel → votre projet → **Settings → Git**.

### Option 2 — sans GitHub

```bat
cd C:\Users\abdel\Desktop\wbp\wbp
npx vercel --prod
```

Choisissez **Link to existing project** au premier lancement.

### Dans les deux cas

1. **Vercel → Settings → Environment Variables** : mêmes valeurs que `.env.local`.
2. **Migration** : double-cliquez `apply-upgrade.bat` (base partagée local/production,
   une seule fois suffit).
3. **Bucket d'images** : Supabase → Storage → New bucket → nom `media` → **Public**.

---

## Ordre conseillé

1. `demarrer.bat` → le site s'ouvre en local
2. `diagnostic.bat` → lire la liste finale
3. Réveiller Supabase s'il est en pause
4. `apply-upgrade.bat` → applique la migration
5. Créer le bucket `media` (public) si demandé
6. Pousser sur GitHub → le site en ligne se met à jour

---

## Fichiers ajoutés pour le dépannage

| Fichier | Rôle |
|---|---|
| `demarrer.bat` | Démarre le site sur `127.0.0.1` et ouvre le navigateur |
| `verifier-localhost.bat` | Trouve pourquoi localhost ne répond pas |
| `diagnostic.bat` | Vérifie fichiers, clés, Supabase, migration, bucket |
| `scripts/diagnose.mjs` | Le diagnostic lui-même (ne modifie rien) |
| `lib/supabase/server.js` | Délai maximal de 10 s sur les appels Supabase |
| `package.json` | Scripts `dev:ip`, `dev:alt`, `diagnose` |
