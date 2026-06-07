# ProctorAI — Enterprise AI Proctoring System

## Tech Stack
- Frontend: React 18 + Vite + TailwindCSS + Framer Motion
- Backend: Node.js + Express + Socket.IO
- Database: PostgreSQL + Redis
- AI: Anthropic Claude API + TensorFlow.js face detection
- Auth: JWT + bcrypt

## Quick Start
```bash
cd backend && npm install
cd ../frontend && npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd backend && npm run db:migrate && npm run db:seed
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd frontend && npm run dev
```

## Default Logins (after seed)
- Admin: admin@proctorai.com / Admin@123
- Examiner: examiner@proctorai.com / Exam@123
- Student: student@proctorai.com / Student@123
