# CyberIncident — Plateforme de gestion des incidents cyber

Application full-stack React + Node.js/Express pour la gestion des incidents, des preuves numériques et de la traçabilité forensique.

> **Statut du ZIP : prêt pour un déploiement de démonstration sur un service Node.js comme Render.**
> Le même serveur Express sert l'API et le build React : une seule URL publique est donc nécessaire.

## Fonctionnalités

- Authentification JWT
- RBAC : ADMIN, INVESTIGATOR, AUDITOR
- Détection et suivi des incidents (création manuelle désactivée)
- Supervision SNMP avec polling SNMPv2c et réception optionnelle de traps
- Création automatique des incidents à partir des signaux SNMP
- Calcul serveur de la criticité selon la nature du signal détecté
- Upload de preuves numériques
- Empreinte SHA-256 calculée côté serveur
- Vérification SHA-256 avant téléchargement
- Chaîne de possession horodatée
- Journal d'audit hash-chaîné SHA-256
- Vérification d'intégrité du journal
- Génération de rapport PDF
- Interface React responsive et sombre
- Protection HTTP avec Helmet
- Limitation de débit avec `express-rate-limit`
- Configuration des chemins de données et de preuves par variables d'environnement
- Build React servi directement par Express en production
- Endpoint de santé : `/api/health`
- Supervision SNMP : `/api/snmp/status`

## Architecture de déploiement

```text
GitHub
  ↓
Service Web Node.js
  ├── React/Vite (client/dist)
  └── API Express (/api/*)
        ↓
   stockage JSON + fichiers de preuve
```

## Prérequis local

- Node.js 20 ou plus récent
- npm

Vérifier :

```bash
node -v
npm -v
```

## Installation locale

Depuis le dossier du projet :

```bash
chmod +x setup.sh
./setup.sh
```

Le script crée automatiquement `server/.env` si nécessaire, génère un `JWT_SECRET` aléatoire et construit le frontend.

## Lancement local en mode production

```bash
npm start
```

Application : `http://localhost:4000`

API : `http://localhost:4000/api/health`

## Développement

Terminal 1 :

```bash
npm --prefix server run dev
```

Terminal 2 :

```bash
npm --prefix client run dev
```

Interface : `http://localhost:5173`

API : `http://localhost:4000/api/health`

Le proxy Vite `/api` permet au frontend de communiquer avec le serveur pendant le développement. En production, le frontend et l'API utilisent la même origine.

## Comptes de démonstration

- ADMIN : `admin@cyber.local` / `Admin@12345`
- INVESTIGATOR : `investigator@cyber.local` / `Investigator@12345`
- AUDITOR : `auditor@cyber.local` / `Auditor@12345`

**Ces comptes sont uniquement destinés à la démonstration.** Changez-les avant tout usage réel.

## Déploiement sur Render

Le fichier `render.yaml` est inclus pour faciliter la configuration.

### Option A — configuration manuelle

Build Command :

```bash
npm install && npm --prefix client install && npm --prefix client run build && npm --prefix server install
```

Start Command :

```bash
npm --prefix server start
```

Health Check Path :

```text
/api/health
```

Variables d'environnement recommandées :

```text
NODE_VERSION=20
JWT_SECRET=<générer une valeur longue et aléatoire>
MAX_UPLOAD_MB=50
RATE_LIMIT_MAX=300
CLIENT_ORIGIN=<URL publique de l'application>
```

`PORT` est fourni automatiquement par la plateforme. Le serveur écoute sur `0.0.0.0`.

### Option B — Blueprint

Le fichier `render.yaml` contient déjà le service Web, les commandes de build/démarrage et le health check. Après connexion du dépôt GitHub, utilisez le blueprint si votre compte Render propose cette option.

## Stockage et persistance

Par défaut, les données sont stockées dans :

- `server/data/cyberincident.json`
- `server/storage/evidence/`

Les chemins peuvent être modifiés avec :

```text
DATA_DIR=/chemin/vers/les/donnees
EVIDENCE_DIR=/chemin/vers/les/preuves
```

**Important pour un hébergement cloud :** un stockage local/éphémère ne doit pas être considéré comme une conservation durable de preuves. Pour une vraie mise en production, utilisez une base de données managée et un stockage objet persistant avec sauvegardes, chiffrement, contrôle d'accès et politiques de rétention adaptées.

## Démonstration devant un jury

1. Se connecter comme ADMIN.
2. Ouvrir « Supervision SNMP » et montrer que la collecte est active.
3. En mode démonstration (`SNMP_DEMO_MODE=true`), laisser le moteur détecter automatiquement un signal SNMP simulé.
4. Ouvrir « Incidents détectés » : le dossier est créé par le serveur, sans bouton « Nouvel incident ».
5. Montrer que la criticité est attribuée côté serveur et qu'elle n'est pas saisie par l'utilisateur.
6. Ajouter un fichier de test fictif au dossier généré.
7. Montrer le SHA-256 généré et la chaîne de possession.
8. Ouvrir « Journal immuable » et vérifier la chaîne.
9. Générer le rapport PDF.

### Règles de criticité SNMP

La criticité n'est pas choisie dans l'interface. Le moteur applique des règles serveur :

- `INTERFACE_DOWN` → `CRITICAL`
- `DEVICE_UNREACHABLE` → `CRITICAL`
- `AUTH_FAILURE` → `HIGH`
- `HIGH_ERROR_RATE` → `HIGH`
- autres signaux reconnus → `MEDIUM`

Les incidents sont dédupliqués tant qu'un incident correspondant reste ouvert.

### Configuration SNMP

Pour un réseau de laboratoire, configurez `SNMP_DEVICES` avec des équipements SNMPv2c. Le moteur interroge notamment `sysName`, `sysUpTime` et la table standard `IF-MIB` pour détecter les interfaces DOWN. La bibliothèque `net-snmp` prend en charge SNMPv1/v2c/v3 et les opérations de polling/traps.

Exemple :

```text
SNMP_DEVICES=[{\"name\":\"SW-01\",\"host\":\"192.168.1.10\",\"community\":\"public\",\"version\":\"2c\"}]
SNMP_POLL_INTERVAL_MS=60000
```

Pour un environnement réel, préférez SNMPv3 avec authentification et confidentialité et ne laissez jamais une communauté SNMP sensible dans le code source.

## Sécurité : portée réelle

Le projet applique plusieurs contrôles utiles pour une démonstration : JWT, hachage SHA-256, RBAC, Helmet, rate limiting, validation de taille d'upload, vérification d'intégrité avant téléchargement et audit hash-chaîné.

Cela **ne constitue pas une conformité ISO ou judiciaire automatique**. Pour un usage réel, il faut notamment définir une politique de sécurité, gestion des secrets, chiffrement au repos et en transit, sauvegardes, supervision, rotation des clés, MFA, gestion des sessions, stockage immuable/WORM si requis, séparation des environnements, tests de sécurité et procédures légales de collecte et conservation des preuves.
