# Cognify — Student Study & Productivity Workspace

**Student Name:** Tilen Ouma  
**Admission Number:** CPR0704/26  
**Date:** 23rd May, 2026

_A Project Submitted in Partial Fulfilment for Computer Programming in International Youth Fellowship Kitengela_

---

## Overview

Cognify is a full-stack student productivity platform designed to help learners organize notes, manage study plans, generate AI-powered flashcards, and track their academic progress — all in one place. It features a React-based frontend, a Node.js/Express backend with SQLite persistence, and an optional Python NLP microservice for AI features.

---

## Features

| Feature               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| 🔐 **Authentication** | Register / Login with JWT-based session management      |
| 🔔 **Notifications**  | Instant in-app welcome notification on account creation |
| 📝 **Study Notes**    | Create, edit, tag, and delete notes                     |
| 🃏 **AI Flashcards**  | Auto-generate flashcards from note content using NLP    |
| 📅 **Study Plan**     | Calendar-based event scheduler linked to notes          |
| 📊 **Dashboard**      | Overview of notes, upcoming events, and due flashcards  |
| ⚙️ **Settings**       | User preferences and profile management                 |
| 💬 **Apollo Chat**    | AI assistant (Apollo) for study help                    |

---

## Architecture

```
cognify/
├── frontend/               # React 18 + Vite (port 5173)
│   └── src/
│       ├── pages/          # Auth, Dashboard, Notes, Flashcards, Plan, Settings
│       ├── components/     # Sidebar, NotificationDropdown, ApolloChat, ThreeBackground
│       ├── contexts/       # AuthContext, DataContext
│       └── services/       # API service helpers
│
├── backend/                # Node.js + Express (port 3000)
│   ├── server.js           # Main server — all API routes
│   ├── routes/             # Modular route handlers
│   └── middleware/         # Auth middleware
│
├── database/               # SQLite
│   ├── schema.js           # DB init & table definitions
│   └── cognify.db          # Local SQLite database file
│
├── ai-models/              # Python FastAPI NLP microservice (port 8001)
│   └── requirements.txt    # spaCy, HuggingFace, FastAPI
│
└── docs/                   # Project documentation
    ├── api_docs.md
    ├── test_report.md
    └── user_manual.md
```

**Tech Stack:**

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Frontend | React 18, Vite, React Router v6                     |
| Styling  | Vanilla CSS (custom design system)                  |
| Backend  | Node.js, Express.js                                 |
| Database | SQLite3 (via `better-sqlite3` / `sqlite3`)          |
| Auth     | Mock JWT (local dev); Firebase-ready for production |
| AI/NLP   | Python, spaCy, compromise.js (Node NLP fallback)    |

---

## API Endpoints

### Auth

| Method | Route                 | Description                                    |
| ------ | --------------------- | ---------------------------------------------- |
| `POST` | `/api/users/register` | Register new user + sends welcome notification |
| `POST` | `/api/users/login`    | Login, returns JWT token                       |

### Notifications

| Method | Route                         | Description                                  |
| ------ | ----------------------------- | -------------------------------------------- |
| `GET`  | `/api/notifications`          | Get all notifications for authenticated user |
| `PUT`  | `/api/notifications/:id/read` | Mark a notification as read                  |

### Notes

| Method   | Route            | Description                          |
| -------- | ---------------- | ------------------------------------ |
| `GET`    | `/api/notes`     | Get all notes for authenticated user |
| `POST`   | `/api/notes`     | Create a new note                    |
| `PUT`    | `/api/notes/:id` | Update a note                        |
| `DELETE` | `/api/notes/:id` | Delete a note                        |

### Events

| Method   | Route             | Description                           |
| -------- | ----------------- | ------------------------------------- |
| `GET`    | `/api/events`     | Get all events for authenticated user |
| `POST`   | `/api/events`     | Create a new event                    |
| `DELETE` | `/api/events/:id` | Delete an event                       |

### AI / NLP

| Method | Route                        | Description                                |
| ------ | ---------------------------- | ------------------------------------------ |
| `POST` | `/api/ai/summarize`          | Summarize text (Python microservice)       |
| `POST` | `/api/ai/extract-entities`   | Extract named entities from text           |
| `POST` | `/api/ai/extract-flashcards` | Auto-generate flashcards from note content |
| `GET`  | `/api/flashcards/review`     | Get flashcards due for review today        |

### Health

| Method | Route         | Description         |
| ------ | ------------- | ------------------- |
| `GET`  | `/api/health` | Server health check |

---

## Getting Started

### Prerequisites

- Node.js v18+
- Python 3.10+ (optional, for AI features)
- npm

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd cognify
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Start the Backend

```bash
node server.js
# Backend running → http://localhost:3000
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 5. Start the Frontend Dev Server

```bash
npm run dev
# Frontend running → http://localhost:5173
```

### 6. (Optional) Start the Python NLP Microservice

```bash
cd ai-models
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --port 8001
```

---

## Deployment

### Frontend (Vercel / Netlify)

1. Link your GitHub repository to Vercel.
2. Set **Root Directory** → `frontend`
3. Set **Build Command** → `npm run build`
4. Set **Output Directory** → `dist`
5. Deploy.

### Backend (Railway / Render / Heroku)

1. Point the platform to the `backend/` folder.
2. Set start command to `node server.js`.
3. Set environment variable `PORT` (platform auto-assigns).
4. For production auth, configure `FIREBASE_API_KEY` and enable Firebase Admin SDK.

### Database

- **Local dev:** SQLite (`database/cognify.db`) — no setup needed.
- **Production:** Migrate to PostgreSQL or enable Firebase Firestore for cloud sync.

---

## Project Deliverables

1. **Chapter 3 Documentation** — `/docs` folder
2. **GitHub Repository** — `git init` initialized
3. **Live Demo** — `http://localhost:5173` (local); production pending deployment
4. **Test Report** — `docs/test_report.md`
5. **API Documentation** — `docs/api_docs.md`
6. **User Manual** — `docs/user_manual.md`

---

## License

This project is submitted as an academic assignment for IYF Kitengela — Computer Programming Course, 2026.

# apollocognify

advanced study app
