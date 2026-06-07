# ProctorAI — Complete Setup Guide

## Prerequisites
Install these FREE tools first (all one-time):
1. **Node.js 20+** → https://nodejs.org (download LTS)
2. **PostgreSQL 15+** → https://www.postgresql.org/download/
3. **Redis** → https://redis.io/docs/install/ (or use Docker: `docker run -p 6379:6379 redis`)
4. **VS Code** → https://code.visualstudio.com/ (recommended editor)
5. **Git** → https://git-scm.com/downloads

---

## Step-by-Step Setup

### 1. Open the project in VS Code
- File → Open Folder → select `proctor-system`

### 2. Setup the Database
Open Terminal in VS Code (Ctrl+` or View → Terminal):
```bash
# Create the database
psql -U postgres -c "CREATE DATABASE ProctorAI_db;"
```

### 3. Configure Backend
```bash
cd backend
cp .env.example .env
```
Open `backend/.env` and fill in:
- `DB_PASSWORD` = your PostgreSQL password
- `ANTHROPIC_API_KEY` = get free at https://console.anthropic.com
- Leave Redis blank if not using it (it's optional)

### 4. Install & Migrate Backend
```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
```
You'll see: "✅ Migrations completed" and demo login credentials.

### 5. Setup Frontend
```bash
cd ../frontend
npm install
```
Copy `frontend/.env.example` to `frontend/.env` (defaults work for local dev).

### 6. Run the Application
Open **two** terminal windows:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```
→ Server starts on http://localhost:5000

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
→ App starts on http://localhost:5173

Open http://localhost:5173 in your browser.

---

## Login Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@proctorai.com | Admin@123 |
| Examiner | examiner@proctorai.com | Exam@123 |
| Student | student@proctorai.com | Student@123 |

---

## Features Guide

### As Admin
- Full user management, all exams, system-wide alerts
- Dashboard shows platform-wide statistics

### As Examiner
- Create exams with the AI Question Generator (needs Anthropic key)
- Monitor live exam sessions via Proctor page
- Send real-time warnings to students
- Review alerts and generate session reports

### As Student
- Browse published exams
- Take exams with webcam monitoring active
- View completed exam dashboard

### AI Features (requires Anthropic API key)
- **AI Frame Analysis**: Analyzes webcam frames for cheating
- **AI Session Analysis**: Risk scoring for completed sessions
- **AI Question Generation**: Auto-generate questions by topic

---

## Folder Structure
```
proctor-system/
├── backend/
│   ├── src/
│   │   ├── config/       ← DB, Redis, migrate, seed
│   │   ├── controllers/  ← Business logic
│   │   ├── middleware/   ← Auth, error handling
│   │   ├── routes/       ← API endpoints
│   │   ├── services/     ← Socket.IO, AI, storage
│   │   └── utils/        ← Logger, JWT helpers
│   ├── uploads/          ← Screenshot storage
│   └── .env              ← YOUR config (never commit)
└── frontend/
    ├── src/
    │   ├── components/   ← Reusable UI components
    │   ├── pages/        ← Route-level pages
    │   ├── store/        ← Zustand state (auth)
    │   ├── utils/        ← API client, Socket.IO
    │   └── styles/       ← Global CSS + Tailwind
    └── .env              ← Frontend env vars
```

---

## Troubleshooting

**"Cannot connect to database"**
→ Make sure PostgreSQL is running and `DB_PASSWORD` matches your setup.

**"Redis connection refused"**
→ Redis is optional. App works without it (just no caching).

**"AI features not working"**
→ Add your Anthropic API key to `backend/.env`. Get one free at https://console.anthropic.com

**Port already in use**
→ Change `PORT=5001` in backend `.env` and update `VITE_API_URL` in frontend `.env`.

**npm install fails**
→ Make sure Node.js 18+ is installed: `node --version`
