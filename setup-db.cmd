@echo off
setlocal
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"

echo ========================================================
echo  Instaloop - Cloud PostgreSQL Schema Push & Seeding
echo ========================================================
echo.

echo [1/2] Syncing Prisma schema with PostgreSQL database...
call npx prisma db push
if errorlevel 1 (
  echo [ERROR] Failed to push schema to PostgreSQL.
  echo Please verify DATABASE_URL in .env has sslmode=require and valid credentials.
  pause
  exit /b 1
)

echo.
echo [2/2] Seeding initial mindful presence records...
call npx ts-node prisma/seed.ts
if errorlevel 1 (
  echo [ERROR] Seeding failed.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo  Database is connected, synced, and seeded!
echo ========================================================
pause
