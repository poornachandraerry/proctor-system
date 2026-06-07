# ProctorAI — Complete Folder Structure

```
proctor-system/
│
├── 📄 README.md                    ← Project overview & quick start
├── 📄 SETUP_GUIDE.md               ← Detailed setup for beginners
├── 📄 FOLDER_STRUCTURE.md          ← This file
├── 📄 .gitignore                   ← Files to exclude from git
│
├── .vscode/
│   ├── settings.json               ← VS Code editor settings
│   └── extensions.json             ← Recommended extensions
│
├── 🗂️ backend/                     ← Node.js + Express API Server
│   ├── package.json                ← Backend dependencies
│   ├── .env.example                ← Environment variables template
│   ├── .env                        ← YOUR config (create from .env.example)
│   ├── uploads/                    ← Webcam screenshots stored here
│   │   └── screenshots/            ← Per-session folders
│   ├── logs/                       ← Application logs
│   │
│   └── src/
│       ├── server.js               ← 🚀 Main entry — Express + Socket.IO setup
│       │
│       ├── config/
│       │   ├── database.js         ← PostgreSQL connection pool
│       │   ├── redis.js            ← Redis connection (optional caching)
│       │   ├── migrate.js          ← Creates all database tables
│       │   └── seed.js             ← Inserts demo users + sample exam
│       │
│       ├── controllers/            ← Business logic (one file per resource)
│       │   ├── authController.js   ← Login, register, refresh token, getMe
│       │   ├── examController.js   ← CRUD exams, publish, stats
│       │   ├── questionController.js ← CRUD questions, bulk create
│       │   ├── sessionController.js ← Start/submit exam session, events
│       │   ├── alertController.js  ← Proctoring alerts, review
│       │   ├── dashboardController.js ← Role-based dashboard data
│       │   └── aiController.js     ← AI frame analysis, session scoring, Q gen
│       │
│       ├── middleware/
│       │   ├── auth.js             ← JWT authenticate + authorize(roles)
│       │   └── errorHandler.js     ← Global error + 404 handler
│       │
│       ├── routes/                 ← Express routers (thin — delegate to controllers)
│       │   ├── auth.js             ← POST /login /register /refresh GET /me
│       │   ├── users.js            ← GET / PATCH /:id
│       │   ├── exams.js            ← GET POST PUT PATCH DELETE exams
│       │   ├── questions.js        ← GET POST PUT DELETE questions per exam
│       │   ├── sessions.js         ← POST /start, events, submit, terminate
│       │   ├── alerts.js           ← GET alerts, PATCH review
│       │   ├── reports.js          ← GET /session/:id full report
│       │   ├── ai.js               ← POST analyze-frame, GET analyze-session, POST generate
│       │   ├── dashboard.js        ← GET role-aware dashboard
│       │   ├── proctor.js          ← GET proctor overview, session timeline
│       │   └── admin.js            ← GET analytics, audit logs
│       │
│       ├── services/
│       │   ├── socketService.js    ← Socket.IO real-time event handlers
│       │   ├── aiService.js        ← Anthropic API wrapper (frame/session/generate)
│       │   └── storageService.js   ← Screenshot save/delete to disk
│       │
│       └── utils/
│           ├── logger.js           ← Winston logger (console + file)
│           └── jwt.js              ← Token sign/verify helpers
│
└── 🗂️ frontend/                    ← React 18 + Vite + Tailwind
    ├── package.json                ← Frontend dependencies
    ├── vite.config.js              ← Vite config + API proxy
    ├── tailwind.config.js          ← Theme: colors, fonts, animations
    ├── postcss.config.js           ← PostCSS (required by Tailwind)
    ├── index.html                  ← HTML shell with Google Fonts
    ├── .env.example                ← Frontend env template
    └── .env                        ← YOUR frontend config
    │
    └── src/
        ├── main.jsx                ← React entry point
        ├── App.jsx                 ← Router + route guards (PrivateRoute)
        │
        ├── styles/
        │   └── index.css           ← Tailwind base + custom .glass .btn-* .card
        │
        ├── store/
        │   └── authStore.js        ← Zustand auth state (login/logout/token)
        │
        ├── utils/
        │   ├── api.js              ← Axios instance with JWT interceptors
        │   └── socket.js           ← Socket.IO client singleton
        │
        ├── components/
        │   ├── shared/
        │   │   └── Layout.jsx      ← Sidebar + nav + outlet wrapper
        │   └── auth/
        │       └── AuthLayout.jsx  ← Auth page wrapper
        │
        └── pages/                  ← Full-page route components
            ├── LoginPage.jsx       ← Sign in + demo credential buttons
            ├── RegisterPage.jsx    ← Sign up form (student/examiner)
            ├── DashboardPage.jsx   ← Role-adaptive: admin/examiner/student
            ├── ExamsPage.jsx       ← Exam grid with search + filters
            ├── ExamCreatePage.jsx  ← 3-tab: Details / Questions / Proctoring
            ├── ExamDetailPage.jsx  ← Exam info, proctoring rules, start/publish
            ├── ExamTakePage.jsx    ← 🔒 Full exam experience: webcam + AI + timer
            ├── ProctorPage.jsx     ← 📡 Live proctor: sessions, events, warnings
            ├── ReportPage.jsx      ← Session report: score, risk, alerts, answers
            ├── AlertsPage.jsx      ← Alert center with filter + review workflow
            └── UsersPage.jsx       ← User management table (admin only)
```

## API Endpoints Reference

### Auth
- `POST /api/auth/login` — Email + password login
- `POST /api/auth/register` — Create account
- `POST /api/auth/refresh` — Refresh access token
- `GET  /api/auth/me` — Get current user

### Exams
- `GET    /api/exams` — List exams (role-filtered)
- `POST   /api/exams` — Create exam (examiner/admin)
- `GET    /api/exams/:id` — Get single exam
- `PUT    /api/exams/:id` — Update exam
- `PATCH  /api/exams/:id/publish` — Publish exam
- `DELETE /api/exams/:id` — Delete (admin)
- `GET    /api/exams/:id/stats` — Exam statistics

### Questions
- `GET    /api/exams/:examId/questions` — List questions
- `POST   /api/exams/:examId/questions` — Add question
- `POST   /api/exams/:examId/questions/bulk` — Bulk add
- `PUT    /api/exams/:examId/questions/:id` — Update
- `DELETE /api/exams/:examId/questions/:id` — Delete

### Sessions
- `POST /api/sessions/start` — Start exam session
- `GET  /api/sessions/active` — Active sessions (proctor)
- `GET  /api/sessions/:id` — Get session
- `POST /api/sessions/:id/events` — Log proctoring event
- `POST /api/sessions/:id/submit` — Submit exam
- `POST /api/sessions/:id/terminate` — Force terminate

### AI
- `POST /api/ai/analyze-frame` — Analyze webcam frame
- `GET  /api/ai/analyze-session/:id` — Score session risk
- `POST /api/ai/generate-questions` — Generate questions

### Alerts
- `GET   /api/alerts` — List alerts (with filters)
- `GET   /api/alerts/summary` — Alert breakdown
- `PATCH /api/alerts/:id/review` — Review alert

### Dashboard
- `GET /api/dashboard` — Role-specific dashboard data

### Reports
- `GET /api/reports/session/:id` — Full session report

## Socket.IO Events

### Client → Server
- `join:exam` — Join exam room
- `join:session` — Join student session room
- `join:proctor` — Join proctor monitoring room
- `proctor:event` — Send student event to proctors
- `student:frame` — Send webcam frame to proctors
- `proctor:warning` — Send warning to student
- `proctor:terminate` — Terminate student session
- `heartbeat` — Keep-alive ping

### Server → Client
- `student:event` — Broadcast student event to proctors
- `session:frame` — Webcam frame forwarded to proctors
- `warning:received` — Warning sent to student
- `session:terminated` — Session ended notification
- `student:disconnected` — Student went offline
- `heartbeat:ack` — Heartbeat acknowledgment
