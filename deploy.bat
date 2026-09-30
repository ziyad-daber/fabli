@echo off
REM Production deployment script for VPS (Windows)
REM Run this on your server after cloning the repository

echo 🚀 Starting production deployment...

REM Check required environment variables
if "%DATABASE_URL%"=="" (
  echo ❌ ERROR: DATABASE_URL environment variable is not set
  exit /b 1
)

if "%NEXTAUTH_SECRET%"=="" (
  echo ❌ ERROR: NEXTAUTH_SECRET environment variable is not set
  exit /b 1
)

if "%NEXTAUTH_URL%"=="" (
  echo ❌ ERROR: NEXTAUTH_URL environment variable is not set
  exit /b 1
)

echo ✅ Environment variables validated

REM Install dependencies
echo 📦 Installing dependencies...
npm ci --production=false

REM Generate Prisma Client
echo 🔧 Generating Prisma Client...
npx prisma generate

REM Run production migrations (fails if migrations fail or DB unavailable)
echo 🗄️ Running database migrations...
npx prisma migrate deploy

REM Optional: Seed database (only on first deploy)
if "%SEED_DATABASE%"=="true" (
  echo 🌱 Seeding database...
  npm run db:seed
)

REM Build Next.js application
echo 🏗️ Building application...
npm run build

echo ✅ Deployment completed successfully!
echo.
echo To start the application:
echo   npm start
echo.
echo Or with PM2 (recommended for production):
echo   pm2 start npm --name fabli -- start
echo   pm2 save
echo   pm2 startup