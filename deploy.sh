#!/bin/bash
# Production deployment script for VPS
# Run this on your server after cloning the repository

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ -z "$NEXTAUTH_SECRET" ]; then
  echo "❌ ERROR: NEXTAUTH_SECRET environment variable is not set"
  exit 1
fi

if [ -z "$NEXTAUTH_URL" ]; then
  echo "❌ ERROR: NEXTAUTH_URL environment variable is not set"
  exit 1
fi

echo "✅ Environment variables validated"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# Run production migrations (fails if migrations fail or DB unavailable)
echo "🗄️ Running database migrations..."
npx prisma migrate deploy

# Optional: Seed database (only on first deploy)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  npm run db:seed
fi

# Build Next.js application
echo "🏗️ Building application..."
npm run build

echo "✅ Deployment completed successfully!"
echo ""
echo "To start the application:"
echo "  npm start"
echo ""
echo "Or with PM2 (recommended for production):"
echo "  pm2 start npm --name fabli -- start"
echo "  pm2 save"
echo "  pm2 startup"