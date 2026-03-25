# Msingi School Management System — Backend API

A multi-tenant REST API for managing Kenyan primary schools. Built with Node.js, Express, and PostgreSQL. Supports multiple schools on a single deployment, each with fully isolated data.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Authentication](#authentication)
- [Multi-Tenancy](#multi-tenancy)
- [API Modules](#api-modules)
- [M-Pesa Integration](#m-pesa-integration)
- [SMS Notifications](#sms-notifications)
- [Background Jobs](#background-jobs)
- [Caching](#caching)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens) |
| Cache | Redis |
| Queue | Bull (Redis-backed) |
| Payments | M-Pesa Daraja API |
| SMS | Mobiwave |
| Job Scheduling | node-cron |

---

## Project Structure

```
src/
├── app.js                    # Express app setup
├── server.js                 # HTTP server entry point
├── config/
│   ├── database.js           # PostgreSQL connection pool
│   └── env.js                # Environment variable validation
├── database/
│   ├── schema.sql            # Full DB schema
│   └── migrations/           # Incremental SQL migrations
│       ├── 001_initial.sql
│       └── 002_multitenancy.sql
├── modules/                  # Feature modules (each has controller/service/repository/routes)
│   ├── auth/                 # Login, registration, JWT refresh
│   ├── schools/              # School management (super-admin)
│   ├── staff/                # Teacher and admin staff
│   ├── students/             # Student enrollment
│   ├── classes/              # Class/grade management
│   ├── subjects/             # Subject catalogue
│   ├── attendance/           # Daily attendance tracking
│   ├── exams/                # Exams, results, report cards
│   ├── fees/                 # Fee structures, payments, balances
│   ├── terms/                # Academic terms
│   ├── timetable/            # Weekly class and teacher timetables
│   ├── notifications/        # SMS dispatch
│   ├── jobs/                 # Scheduled background jobs
│   └── events/               # Internal event bus + handlers
└── shared/
    ├── middleware/
    │   ├── auth.js           # JWT authentication + role authorization
    │   ├── setCurrentSchool.js # Injects schoolId into every request
    │   └── errorHandler.js   # Global error handling
    ├── cache/                # Redis cache service
    ├── queue/                # Bull queue manager
    ├── integrations/mpesa/   # M-Pesa Daraja client
    └── utils/response.js     # Standardised API response helpers
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
git clone https://github.com/your-org/msingi-backend.git
cd msingi-backend
npm install
```

### Running the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000` by default.

---

## Environment Variables

Create a `.env` file in the project root. All variables are validated at startup via `src/config/env.js` — the server will refuse to start if any required variable is missing.

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=msingi
DB_USER=postgres
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# M-Pesa Daraja
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback
MPESA_ENV=sandbox   # or production

# SMS — Mobiwave
MOBIWAVE_API_KEY=your_api_key
MOBIWAVE_SENDER_ID=MSINGI

# App
FRONTEND_URL=http://localhost:5173
```

---

## Database Setup

### First-time setup

```bash
# Create the database
createdb msingi

# Run the full schema
psql -d msingi -f src/database/schema.sql

# Run migrations in order
psql -d msingi -f src/database/migrations/001_initial.sql
psql -d msingi -f src/database/migrations/002_multitenancy.sql

# (Optional) Seed development data
psql -d msingi -f src/database/seeds/dev_data.sql
```

### Running a new migration

Add a new file to `src/database/migrations/` following the naming convention `003_description.sql`, then apply it:

```bash
psql -d msingi -f src/database/migrations/003_your_migration.sql
```

---

## Authentication

All protected routes require a `Bearer` token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

### Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register a new school + admin | Public |
| POST | `/api/auth/login` | Login, returns access + refresh tokens | Public |
| POST | `/api/auth/refresh` | Exchange refresh token for new access token | Public |
| POST | `/api/auth/logout` | Invalidate refresh token | Required |

### Roles

| Role | Access |
|---|---|
| `SUPER_ADMIN` | All schools, platform management |
| `ADMIN` | Full access within their school |
| `TEACHER` | Read access to classes, students, timetable; write access to attendance and marks |

---

## Multi-Tenancy

Every school's data is fully isolated. The `setCurrentSchool` middleware extracts `schoolId` from the authenticated user's JWT and attaches it to `req.schoolId`. Every repository query includes `WHERE school_id = $schoolId`, so there is no cross-school data leakage.

There is no need for separate databases or subdomains — tenancy is enforced entirely at the query layer.

```
Request → authenticate (JWT) → setCurrentSchool (injects schoolId) → controller → service → repository (scoped query)
```

---

## API Modules

All routes are prefixed with `/api`.

### Schools `/api/schools`
Managed by `SUPER_ADMIN` only. Creates and manages school records.

### Staff `/api/staff`
| Method | Path | Role |
|---|---|---|
| GET | `/api/staff` | ADMIN, TEACHER |
| POST | `/api/staff` | ADMIN |
| PUT | `/api/staff/:id` | ADMIN |
| DELETE | `/api/staff/:id` | ADMIN |

### Students `/api/students`
| Method | Path | Role |
|---|---|---|
| GET | `/api/students` | ADMIN, TEACHER |
| POST | `/api/students` | ADMIN |
| PUT | `/api/students/:id` | ADMIN |
| DELETE | `/api/students/:id` | ADMIN |

### Classes `/api/classes`
Manages class/grade records for the school.

### Subjects `/api/subjects`
Manages the school's subject catalogue.

### Terms `/api/terms`
Manages academic terms. Only one term can be active at a time.

### Attendance `/api/attendance`
| Method | Path | Description |
|---|---|---|
| POST | `/api/attendance` | Record attendance for a class |
| GET | `/api/attendance/class/:classId` | Get attendance records for a class |
| GET | `/api/attendance/student/:studentId` | Get attendance for a student |

### Exams `/api/exams`
Handles exam creation, marks entry, and result computation.

| Method | Path | Description |
|---|---|---|
| GET | `/api/exams` | List all exams |
| POST | `/api/exams` | Create exam |
| POST | `/api/exams/:id/results` | Enter marks |
| GET | `/api/exams/:id/results` | Get results |

### Fees `/api/fees`
Manages fee structures, student balances, and M-Pesa payment records.

| Method | Path | Description |
|---|---|---|
| GET | `/api/fees/structures` | List fee structures |
| POST | `/api/fees/structures` | Create fee structure |
| GET | `/api/fees/balance/:studentId` | Get student balance |
| POST | `/api/fees/payments` | Record manual payment |

### Timetable `/api/timetable`
| Method | Path | Description |
|---|---|---|
| GET | `/api/timetable/slots` | Get all time slots |
| POST | `/api/timetable/slots` | Create a time slot |
| DELETE | `/api/timetable/slots/:id` | Delete a time slot |
| POST | `/api/timetable` | Add a timetable entry |
| GET | `/api/timetable/class/:classId?termId=` | Get class timetable grid |
| GET | `/api/timetable/teacher/:staffId?termId=` | Get teacher timetable grid |
| DELETE | `/api/timetable/:id` | Delete a timetable entry |

The timetable grid response returns all defined time slots — including non-teaching slots like Break, Lunch, and Games — merged with entry data:

```json
{
  "slots": [
    { "id": 1, "name": "Period 1", "start_time": "08:00", "end_time": "08:40", "sort_order": 1 },
    { "id": 2, "name": "Break",    "start_time": "10:00", "end_time": "10:20", "sort_order": 4 }
  ],
  "grid": {
    "1": {
      "day": "Monday",
      "slots": {
        "1": { "id": 10, "subject_name": "Mathematics", "teacher_name": "John Kamau" },
        "2": null
      }
    }
  }
}
```

---

## M-Pesa Integration

Payments are processed via the Safaricom Daraja API (STK Push). The flow is:

```
Client initiates payment
  → POST /api/fees/payments/mpesa/initiate
  → Server calls Daraja STK Push
  → Safaricom sends async callback to /api/mpesa/callback
  → Server reconciles payment and updates student balance
  → SMS confirmation sent to parent
```

The `mpesa-reconciliation.job.js` background job handles any payments where the callback was missed, polling Daraja for status.

---

## SMS Notifications

SMS is sent via the Mobiwave provider. Notifications are queued through Bull so they don't block API responses.

Automatic SMS triggers:
- Fee payment received (confirmation to parent)
- Fee payment overdue reminder (scheduled job)
- Exam results published

To send a manual SMS:

```
POST /api/sms/send
{
  "phone": "0712345678",
  "message": "Your message here"
}
```

---

## Background Jobs

Scheduled via `node-cron`, managed in `src/modules/jobs/scheduler.js`.

| Job | Schedule | Description |
|---|---|---|
| `fee-reminder.job.js` | Weekly (Monday 8am) | Sends SMS reminders for outstanding fee balances |
| `mpesa-reconciliation.job.js` | Every 30 minutes | Reconciles pending M-Pesa transactions |
| `sms-queue-processor.job.js` | Continuous | Processes the Bull SMS queue |

---

## Caching

Redis is used to cache frequently read, rarely changing data (e.g. school settings, active term). The cache service is in `src/shared/cache/cache.service.js`.

Cache is automatically invalidated when the underlying data changes via the event bus (`src/modules/events/event-bus.js`).

---

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
npx jest tests/api/students.api.test.js

# Run with coverage
npm run test:coverage
```

### Test structure

```
tests/
├── api/           # Full HTTP request/response tests per module
├── integration/   # Cross-module flows (e.g. M-Pesa payment end-to-end)
├── modules/       # Unit tests for service logic
└── helpers/       # Shared test utilities and mock users
```

---

## Deployment

### Production checklist

- Set `NODE_ENV=production`
- Use a process manager: `pm2 start src/server.js --name msingi-api`
- Point a reverse proxy (Nginx) at the Node process for SSL termination and static caching
- Run database migrations before deploying new code
- Set all environment variables via your hosting platform's secret manager — never commit `.env`

### Nginx reverse proxy (example)

```nginx
server {
    listen 443 ssl;
    server_name api.msingi.co.ke;

    ssl_certificate     /etc/letsencrypt/live/api.msingi.co.ke/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.msingi.co.ke/privkey.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Contributing

1. Create a feature branch from `main`: `git checkout -b feat/your-feature`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Open a pull request with a clear description of changes

---

## License

Proprietary — Msingi Technologies. All rights reserved.