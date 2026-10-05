# Déploiement rapide

## 1. Tester localement

```bash
./setup.sh
npm start
```

Puis ouvrir : `http://localhost:4000`

Vérifier : `http://localhost:4000/api/health`

## 2. Publier sur GitHub

```bash
git init
git add .
git commit -m "Prepare CyberIncident for production demo deployment"
git branch -M main
git remote add origin <URL_DU_DEPOT_GITHUB>
git push -u origin main
```

Ne jamais commiter `server/.env`, `server/data/*.json` ni les preuves.

## 3. Créer le service Web

Importer le dépôt GitHub dans un service Web Node.js.

Build :

```bash
npm install && npm --prefix client install && npm --prefix client run build && npm --prefix server install
```

Start :

```bash
npm --prefix server start
```

Health check : `/api/health`

## 4. Variables

Définir au minimum :

```text
JWT_SECRET=<secret aléatoire long>
MAX_UPLOAD_MB=50
RATE_LIMIT_MAX=300
CLIENT_ORIGIN=<URL publique>
```

## 5. Vérification finale

- `/api/health` doit retourner `ok: true`.
- La page d'accueil doit afficher l'écran de connexion.
- Tester les trois comptes de démonstration.
- Créer un incident.
- Ajouter une preuve fictive.
- Télécharger la preuve et vérifier le journal.
- Générer le PDF.
