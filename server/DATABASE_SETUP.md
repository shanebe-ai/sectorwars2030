# Database Setup Guide

## Prerequisites

- PostgreSQL 14+ installed
- PostgreSQL server running
- Database credentials configured

## Quick Setup

### 1. Create the Database

```bash
# Using psql
createdb tradewars

# Or using SQL
psql -U postgres
CREATE DATABASE tradewars;
\q
```

### 2. Configure Environment

```bash
cd server
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tradewars
DB_USER=postgres
DB_PASSWORD=your_password_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Setup

This will create all tables and seed initial data:

```bash
npm run db:setup
```

## Individual Commands

### Migrate (Create Tables Only)

```bash
npm run db:migrate
```

This creates all database tables based on `src/db/schema.sql`.

### Seed (Insert Default Data)

```bash
npm run db:seed
```

This inserts:
- Default admin user (username: `admin`, password: `admin123`)
- Default universe ("Alpha Universe")
- 6 ship types (Escape Pod → Corporate Flagship)

## Manual Setup

If you prefer manual setup:

```bash
# Create database
createdb tradewars

# Run schema
psql tradewars < src/db/schema.sql

# Start server and use the API to create initial data
npm run dev
```

## Database Structure

### Core Tables

- **users** - Player accounts and authentication
- **universes** - Game universe configurations
- **players** - Player game state (ships, cargo, credits, turns)
- **sectors** - Universe sectors with ports and connections
- **sector_warps** - Warp connections between sectors
- **planets** - Player-owned planets
- **ship_types** - Available ship configurations
- **corporations** - Team/alliance system
- **corp_members** - Corporation membership
- **game_events** - Historical event log
- **combat_log** - Combat history
- **turn_updates** - Turn regeneration tracking

## Default Admin Credentials

After running `db:seed`:

```
Username: admin
Password: admin123
```

**⚠️ IMPORTANT:** Change these credentials in production!

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Verify PostgreSQL is running:
   ```bash
   pg_isready
   ```

2. Check your `.env` configuration

3. Verify database exists:
   ```bash
   psql -l | grep tradewars
   ```

### Permission Issues

If you get permission errors:

```bash
# Grant permissions to your user
psql -U postgres
GRANT ALL PRIVILEGES ON DATABASE tradewars TO your_username;
\q
```

### Reset Database

To completely reset:

```bash
dropdb tradewars
createdb tradewars
cd server
npm run db:setup
```

## Testing the Connection

Start the server and check the health endpoint:

```bash
npm run dev

# In another terminal:
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","database":"connected"}
```
