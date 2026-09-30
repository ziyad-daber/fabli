# Fabli - 3D Printing Marketplace (Morocco MVP)

Plateforme de mise en relation entre fournisseurs d'impression 3D et revendeurs au Maroc.

## 🚀 Stack Technique

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma 8 (with `@prisma/adapter-pg` for connection pooling)
- **Auth:** NextAuth.js v5 (Credentials)
- **Styling:** Tailwind CSS + Radix UI
- **Deployment:** VPS with PostgreSQL + Nginx (or Docker Compose)

## 📋 Prérequis

- Node.js 20+
- PostgreSQL 16+ (local or remote)
- Nom de domaine configuré (pour HTTPS en production)

## 🛠 Installation Locale

### 1. Cloner et configurer

```bash
git clone https://github.com/ziyad-daber/fabli.git
cd fabli
cp .env.example .env
# Éditer .env avec vos valeurs
```

### 2. Variables d'environnement

```env
# Database - PostgreSQL (local, Neon, Supabase, Railway, or your VPS)
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="GENERER_AVEC: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"

# App
NODE_ENV="development"
NEXT_TELEMETRY_DISABLED=1
DOMAIN="localhost"

# AMEEX (configuré par admin dans le dashboard)
AMEEX_BASE_URL="https://api.ameex.ma"
AMEEX_TEST_MODE="true"

# Email/SMS (optionnel)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="noreply@your-domain.com"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_PHONE_NUMBER=""
```

### 3. Initialiser la base de données

```bash
# Installer les dépendances
npm install

# Générer le client Prisma
npm run db:generate

# Appliquer le schéma (développement)
npm run db:push

# OU créer une migration (si modification schéma)
npm run db:migrate

# Peupler avec des données de test
npm run db:seed
```

### 4. Démarrer le serveur de développement

```bash
npm run dev
```

Accéder à: **http://localhost:3000**

**Comptes de test:**
- Admin: `admin@fabli.ma` / `Admin123!`
- Fournisseur: `fournisseur@test.ma` / `Supplier123!`
- Revendeur: `revendeur@test.ma` / `Reseller123!`

## 🏗 Structure du Projet

```
fabli/
├── prisma/
│   ├── schema.prisma      # Schéma de base de données (22 models, 8 enums)
│   └── seed.ts            # Données de test
├── migrations/            # Fichiers de migration (commis au git, racine du dépôt)
│   ├── 20260928151600_init/
│   ├── 20260930190000_cities_reset_and_manual_shipment/
│   └── migration_lock.toml
├── prisma.config.ts       # Configuration Prisma 8 (datasource URL + chemin des migrations)
├── src/
│   ├── app/               # Pages Next.js (App Router)
│   │   ├── api/           # Routes API
│   │   ├── auth/          # Pages d'authentification
│   │   ├── dashboard/     # Tableaux de bord par rôle
│   │   │   ├── admin/
│   │   │   ├── supplier/
│   │   │   └── reseller/
│   │   └── ...
│   ├── components/        # Composants React
│   │   ├── ui/            # Composants de base (shadcn-like)
│   │   ├── forms/         # Composants de formulaires
│   │   └── layout/        # Composants de mise en page
│   ├── lib/
│   │   ├── auth/          # Configuration NextAuth (Edge-safe)
│   │   ├── db/            # Client Prisma (singleton + pg adapter)
│   │   ├── ameex/         # Adaptateur AMEEX
│   │   └── utils/         # Utilitaires
│   ├── hooks/             # Hooks React personnalisés
│   └── types/             # Types TypeScript
├── deploy.sh              # Script déploiement Linux/macOS
├── deploy.bat             # Script déploiement Windows
├── docker-compose.yml     # Orchestration (optionnel)
├── .env.example           # Variables d'environnement exemple
├── .gitignore
└── package.json
```

## 🔐 Rôles et Permissions

| Rôle | Accès |
|------|-------|
| **Admin** | Tout: utilisateurs, produits, commandes, expéditions, commissions, réglages AMEEX |
| **Fournisseur** | Produits, commandes assignées, expéditions, règlements, profil |
| **Revendeur** | Catalogue, commandes, expéditions, marges, profil |

## 📦 Fonctionnalités MVP

- ✅ Authentification + RBAC (Edge-safe middleware)
- ✅ Produits (CRUD fournisseur, slug unique par fournisseur)
- ✅ Catalogue (recherche, filtres revendeur)
- ✅ Commandes (création, statuts, historique)
- ✅ Commissions (calcul, snapshot prix)
- ✅ COD tracking (collection, règlement)
- ⏳ Expéditions AMEEX (adapter + webhook HMAC)
- ⏳ Tableau de bord admin (analytics, règlements)

## 🗄️ Base de Données & Migrations

### Développement Local

```bash
# Créer une nouvelle migration après modification du schéma
npm run db:migrate

# Appliquer le schéma sans migration (rapide, dev seulement)
npm run db:push

# Voir l'état des migrations
npx prisma migrate status

# Studio Prisma (GUI)
npm run db:studio
```

### Production (VPS / Serveur Propre)

**Fichiers de migration sont commités dans `migrations/`** - Ne pas exécuter `prisma migrate dev` en production.

#### Variables d'environnement requises sur le serveur:

```env
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
NEXTAUTH_SECRET="MOT_DE_PASSE_TRES_LONG_GENERE_ALEATOIRE"
NEXTAUTH_URL="https://votre-domaine.com"
NODE_ENV="production"
NEXT_TELEMETRY_DISABLED=1
DOMAIN="votre-domaine.com"
AMEEX_BASE_URL="https://api.ameex.ma"
AMEEX_TEST_MODE="false"
```

#### Commandes de déploiement production:

```bash
# 1. Cloner le repo
git clone https://github.com/ziyad-daber/fabli.git
cd fabli

# 2. Configurer .env avec les variables de production

# 3. Déployer (utilise le script ou manuellement)
./deploy.sh

# OU manuellement:
npm ci --production=false
npx prisma generate
npx prisma migrate deploy    # ÉCHOUe si DB indisponible ou migrations en échec
npm run db:seed              # Optionnel: SEED_DATABASE=true npm run db:seed
npm run build

# 4. Démarrer (avec PM2 recommandé)
npm start
# OU
pm2 start npm --name fabli -- start
pm2 save
pm2 startup
```

#### Script de déploiement automatisé:

```bash
# Linux/macOS
chmod +x deploy.sh
./deploy.sh

# Windows
deploy.bat

# Avec seed initial (premier déploiement seulement)
SEED_DATABASE=true ./deploy.sh
```

Le script `deploy.sh` / `deploy.bat`:
- ✅ Valide toutes les variables d'environnement requises
- ✅ Installe les dépendances
- ✅ Génère Prisma Client
- ✅ Exécute `prisma migrate deploy` (échoue clairement si DB inaccessible)
- ✅ Build l'application Next.js
- ✅ Ne JAMAIS exécute `migrate dev` en production

## 🐳 Déploiement avec Docker Compose (Alternative)

Si vous préférez Docker pour la base de données locale:

```bash
# Démarrer PostgreSQL uniquement
docker-compose up -d postgres

# Puis commandes normales
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

**Note:** Pour Supabase/Neon/Railway, commentez le service `postgres` dans `docker-compose.yml` et utilisez leur `DATABASE_URL`.

## 🔧 Développement

```bash
# Installer dépendances
npm install

# Dev server avec hot reload
npm run dev

# Linter
npm run lint

# Type check
npm run typecheck

# Tests
npm run test

# Prisma Studio
npm run db:studio

# Nouvelles migrations (dev)
npm run db:migrate

# Reset DB (dev only - DANGER)
npx prisma migrate reset
```

## 📊 Modèle de Données Principal

- **Users** + Profils (Fournisseur/Revendeur)
- **Products** + Variantes + Images
- **Orders** + Items (prix snapshottés)
- **Shipments** (Code Suivi AMEEX, idempotency)
- **Commissions** + **Settlements** (règlements fournisseurs)
- **COD Collections** (suivi encaissement)
- **CourierIntegration** + **CourierApiLog** (AMEEX)
- **Audit Logs** + **Notifications**
- **PlatformSettings** (config dynamique)

## 🔌 Intégration AMEEX

L'adaptateur dans `src/lib/ameex/adapter.ts` implémente:
- Création expédition (pickup, package, products, recipient, COD)
- Suivi statut / tracking
- Édition / relance expédition
- Tracking multiple
- Vérification HMAC webhook

Configuration via dashboard admin → `/dashboard/admin/ameex`

## 📝 Scripts NPM Disponibles

```bash
# Développement
npm run dev              # Next.js dev server
npm run lint             # ESLint
npm run typecheck        # TypeScript check

# Base de données
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate dev (créer migration)
npm run db:migrate:deploy # prisma migrate deploy (PRODUCTION)
npm run db:push          # prisma db push (dev rapide)
npm run db:seed          # tsx prisma/seed.ts
npm run db:studio        # prisma studio

# Build/Deploy
npm run build            # prisma generate + next build
npm start                # node .next/standalone/server.js
```

## 🐛 Dépannage

### Base de données inaccessible
```bash
# Vérifier connexion
psql "$DATABASE_URL" -c "SELECT 1;"

# Ou avec Prisma
npx prisma db execute --stdin <<< "SELECT 1;"
```

### Erreur de migration
```bash
# Voir statut
npx prisma migrate status

# Résoudre migration bloquée (dernier recours)
npx prisma migrate resolve --rolled-back "migration_name"
```

### Échec build production
```bash
# Vérifier variables d'env
cat .env

# Nettoyer et rebuild
rm -rf .next node_modules
npm install
npm run build
```

## 🔒 Sécurité

- ✅ `.env` dans `.gitignore` - jamais commité
- ✅ Mots de passe hashés (bcrypt, 12 rounds)
- ✅ NextAuth JWT sessions (Edge-compatible)
- ✅ Middleware Edge-safe (pas de Prisma/bcrypt)
- ✅ Validation Zod sur toutes les routes API
- ✅ Prisma Prepared Statements (protection injection SQL)

## 📄 Licence

Propriétaire - Fabli 2026

---

**Note:** Ce projet utilise Prisma 8 (8.1.0-dev.7) avec l'adaptateur PostgreSQL pour le connection pooling. Les migrations sont versionnées dans `migrations/` et déployées avec `prisma migrate deploy` en production.