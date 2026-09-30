# Fabli - 3D Printing Marketplace (Morocco MVP)

Plateforme de mise en relation entre fournisseurs d'impression 3D et revendeurs au Maroc.

## 🚀 Stack Technique

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma 5
- **Auth:** NextAuth.js v5 (Credentials)
- **Styling:** Tailwind CSS + Radix UI
- **Deployment:** Docker Compose + Nginx + Let's Encrypt

## 📋 Prérequis

- Docker & Docker Compose
- Node.js 20+ (pour développement local)
- Nom de domaine configuré (pour HTTPS)

## 🛠 Installation Locale

### 1. Cloner et configurer

```bash
cd fabli
cp .env.example .env
# Éditer .env avec vos valeurs
```

### 2. Variables d'environnement

```env
# Database
DATABASE_URL="postgresql://fabli:VOTRE_MOT_DE_PASSE@localhost:5432/fabli"

# NextAuth
NEXTAUTH_SECRET="GENERER_AVEC: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"

# App
NODE_ENV="development"
DOMAIN="localhost"

# AMEEX (configuré plus tard par admin)
AMEEX_BASE_URL="https://api.ameex.ma"
AMEEX_TEST_MODE="true"
```

### 3. Démarrer avec Docker Compose (base de données locale)

```bash
# Construire et démarrer
docker-compose up -d --build

# Voir les logs
docker-compose logs -f app

# Arrêter
docker-compose down
```

**Note pour Supabase:** Si vous utilisez Supabase, commentez ou supprimez le service `postgres` dans `docker-compose.yml` et définissez la variable `DATABASE_URL` avec votre URL Supabase.

### 4. Initialiser la base de données

```bash
# Exécuter les migrations
docker-compose exec app npx prisma migrate deploy

# Peupler avec des données de test
docker-compose exec app npm run db:seed
```

### 5. Accéder à l'application

- **Local:** http://localhost:3000
- **Comptes de test:**
  - Admin: `admin@fabli.ma` / `Admin123!`
  - Fournisseur: `fournisseur@test.ma` / `Supplier123!`
  - Revendeur: `revendeur@test.ma` / `Reseller123!`

## 🏗 Structure du Projet

```
fabli/
├── prisma/
│   ├── schema.prisma      # Schéma de base de données
│   └── seed.ts            # Données de test
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
│   │   ├── auth/          # Configuration NextAuth
│   │   ├── db/            # Client Prisma
│   │   ├── ameex/         # Adaptateur AMEEX
│   │   └── utils/         # Utilitaires
│   ├── hooks/             # Hooks React personnalisés
│   └── types/             # Types TypeScript
├── docker/
│   ├── app/Dockerfile     # Image Next.js
│   └── nginx/             # Configuration Nginx
├── docker-compose.yml     # Orchestration
└── .env.example           # Variables d'environnement exemple
```

## 🔐 Rôles et Permissions

| Rôle | Accès |
|------|-------|
| **Admin** | Tout: utilisateurs, produits, commandes, expéditions, commissions, réglages AMEEX |
| **Fournisseur** | Produits, commandes assignées, expéditions, règlements, profil |
| **Revendeur** | Catalogue, commandes, expéditions, marges, profil |

## 📦 Fonctionnalités MVP

- ✅ Authentification + RBAC
- ✅ Produits (CRUD fournisseur)
- ✅ Catalogue (recherche, filtres revendeur)
- ✅ Commandes (création, statuts)
- ✅ Commissions (calcul, snapshot prix)
- ✅ COD tracking
- ⏳ Expéditions AMEEX (adapter placeholder)
- ⏳ Tableau de bord admin

## 🏗 Déploiement Production (Local PostgreSQL)

### 1. Serveur Linux (Ubuntu/Debian)

```bash
# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Installer Docker Compose
sudo apt install docker-compose-plugin
```

### 2. Configurer le domaine

```bash
# Sur votre registrar DNS, créer:
# A     @         VOTRE_IP_SERVEUR
# A     www       VOTRE_IP_SERVEUR
```

### 3. Variables de production

```bash
# Sur le serveur
mkdir -p /opt/fabli
cd /opt/fabli

# Copier docker-compose.yml et dossiers docker/
# Créer .env de production
cat > .env << EOF
DATABASE_URL="postgresql://fabli:MOT_DE_PASSE_SECURISE@postgres:5432/fabli"
NEXTAUTH_SECRET="MOT_DE_PASSE_TRES_LONG_GENERE_ALEATOIRE"
NEXTAUTH_URL="https://votre-domaine.com"
NODE_ENV="production"
DOMAIN="votre-domaine.com"
AMEEX_BASE_URL="https://api.ameex.ma"
AMEEX_TEST_MODE="false"
# ... autres variables
EOF
```

### 4. Déployer

```bash
# Première fois
docker-compose -f docker-compose.yml up -d --build

# Migrations
docker-compose exec app npx prisma migrate deploy

# Seed (optionnel)
docker-compose exec app npm run db:seed
```

### 5. SSL avec Let's Encrypt

Le certbot est inclus dans docker-compose. Il renouvellera automatiquement.

```bash
# Forcer le premier certificat
docker-compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d votre-domaine.com -d www.votre-domaine.com \
  --email admin@votre-domaine.com --agree-tos --no-eff-email
```

### 6. Commandes utiles

```bash
# Logs
docker-compose logs -f app
docker-compose logs -f nginx

# Redémarrer l'app
docker-compose restart app

# Backup DB
docker-compose exec postgres pg_dump -U fabli fabli > backup_$(date +%Y%m%d).sql

# Restore DB
cat backup.sql | docker-compose exec -T postgres psql -U fabli fabli

# Mettre à jour
git pull
docker-compose up -d --build
docker-compose exec app npx prisma migrate deploy
```

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
```

## 📊 Modèle de Données Principal

- **Users** + Profils (Fournisseur/Revendeur)
- **Products** + Variantes + Images
- **Orders** + Items (prix snapshottés)
- **Shipments** (Code Suivi AMEEX)
- **Commissions** + **Settlements** (règlements fournisseurs)
- **COD Collections** (suivi encaissement)
- **Audit Logs** + **Notifications**

## 🔌 Intégration AMEEX

L'adaptateur dans `src/lib/ameex/adapter.ts` est un **placeholder**. 

Avant production, implémenter selon la doc officielle:
https://documenter.getpostman.com/view/10265205/2sA3rwLZD1

Points à confirmer avec AMEEX:
- Authentification (API Key / OAuth / JWT)
- Endpoints exacts
- Format Code Suivi
- Webhooks disponibles
- Gestion COD
- Idempotency

## 📝 Scripts Utiles

```bash
# Nouvelles migrations
npm run db:migrate

# Appliquer migrations prod
npm run db:migrate:deploy

# Reset DB (dev only)
npx prisma migrate reset

# Générer client Prisma
npm run db:generate
```

## 🐛 Dépannage

### Base de données inaccessible
```bash
docker-compose exec postgres pg_isready -U fabli
```

### Erreur de migration
```bash
docker-compose exec app npx prisma migrate status
docker-compose exec app npx prisma migrate resolve --rolled-back "migration_name"
```

### Certificat SSL
```bash
docker-compose logs certbot
docker-compose run --rm certbot certificates
```

### Nettoyage complet
```bash
docker-compose down -v
docker system prune -a
```

## 📄 Licence

Propriétaire - Fabli 2026

---

**Note:** Ce projet est en développement actif. L'intégration AMEEX réelle nécessite la documentation API confirmée.