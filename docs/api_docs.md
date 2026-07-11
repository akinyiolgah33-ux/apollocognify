# API Documentation for Cognify (v1.0)
Strictly aligned with Page 27 of System Design Documentation.

## Base URL
`http://localhost:3000` (Local) / `https://your-heroku-app.com` (Production)

---

### 1. Register User
- **Endpoint:** `/api/users/register`
- **Method:** `POST`
- **Description:** Register a new user in the system.
- **Example Request:**
  ```json
  { "username": "user1", "password": "pass123" }
  ```
- **Expected Response:** `200 OK`

### 2. Authenticate User
- **Endpoint:** `/api/users/login`
- **Method:** `POST`
- **Description:** Authenticate user and return session/token.
- **Example Request:**
  ```json
  { "username": "user1", "password": "pass123" }
  ```
- **Expected Response:** `200 OK`

### 3. Create Note
- **Endpoint:** `/api/notes`
- **Method:** `POST`
- **Description:** Create a new study note.
- **Example Request:**
  ```json
  { "title": "Biology", "content": "Cell theory..." }
  ```
- **Expected Response:** `200 OK`

### 4. Get Due Flashcards
- **Endpoint:** `/api/flashcards/review`
- **Method:** `GET`
- **Description:** Retrieve flashcards scheduled for review today.
- **Example Request:**
  `?user_id=1`
- **Expected Response:** `200 OK`
