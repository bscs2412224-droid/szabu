# SzabU - SZABIST Hierarchical Messaging App (PWA)
**Final Year Project**  
**Modules built:** Sign Up, Login, Password Reset, Messaging (real-time), Phone Notifications, Directory, offline use

SzabU is an installable phone app (Progressive Web App) for SZABIST. It has role-based sign-up and login, hierarchy-based messaging rules, real-time chat, phone notifications, and works with a weak or missing connection.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20+ (Tested on v24 and v26)
- **NPM**: v10+
- **PostgreSQL**: v14+ running locally, with an empty database named `szabu`
  (e.g. `CREATE DATABASE szabu;`)

### Project layout
```
SzabU/
├── backend/    Express + Prisma + PostgreSQL API (port 5000)
└── frontend/   Mobile-first PWA: React + Vite + Tailwind 4 + Konsta UI (port 5173)
```

### 2. Backend Service Setup
Create `backend/.env` (it is git-ignored) with:
```
DATABASE_URL="postgresql://postgres:<your-password>@localhost:5432/szabu?schema=public"
JWT_SECRET="at-least-32-random-characters"
PORT=5000
```
`backend/.env.example` lists every setting. Generate a secret with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
If `JWT_SECRET` is missing in development, a temporary one is used and everyone has to log in again after each restart. In production (`NODE_ENV=production`) the server refuses to start without it.

Other settings (all optional in development):

| Setting | Meaning |
| :--- | :--- |
| `NODE_ENV=production` | Turns off the development-only routes and enforces the rules above |
| `CLIENT_ORIGIN` | Address(es) of the app allowed to call the API, comma separated (needed when the app and API are on different addresses) |
| `TRUST_PROXY=1` | Set when the API sits behind a proxy (Railway, Render, nginx) so rate limits see real visitor addresses |
| `RATE_LIMIT_STRICT=1` | Use production rate limits in development |
| frontend `VITE_API_URL` | API address for a build when the app and API are hosted separately, e.g. `https://szabu-api.example.com` |

```bash
cd backend

# Install dependencies
npm install

# Create the tables (from prisma/schema.prisma, which follows the project ERD) and generate the Prisma client
npm run prisma:push
npm run prisma:generate

# Seed the pre-registered SZABIST hierarchy records and test accounts
npm run seed

# Start the backend server (runs on http://localhost:5000)
npm run dev
```

### 3. Frontend Web Application Setup
In a new terminal:
```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server (runs on http://localhost:5173)
npm run dev
```

Open your browser at **http://localhost:5173/**. On a laptop the app appears as a phone-sized column in the middle of the page. Use the browser device toolbar, or open the address on your phone, to see it full screen.

### 4. Mobile app (PWA)
The frontend is a Progressive Web App built with [Konsta UI](https://konstaui.com/) (iOS and Material Design components for Tailwind). The look follows the phone: iOS style on iPhones, Material style on Android and desktop. Add `?theme=ios` or `?theme=material` to the address to force one.

Service workers only run in a production build, so to test the installable app:
```bash
cd frontend
npm run build
npm run preview
```
Then open http://localhost:4173 in Chrome. The install icon appears in the address bar, or use the menu and choose Install SzabU. On a phone use Add to Home Screen. To inspect it, open DevTools, go to the Application tab, and look at Manifest and Service Workers.

**What the PWA does**
- Installable (manifest, icons, maskable icon, home-screen shortcuts); iPhone users get a hint to use Add to Home Screen.
- Opens offline: the app shell is cached by the service worker, the last inbox and the last messages of each opened chat are saved on the device (IndexedDB) and shown with a "saved on this device" notice.
- Messages written offline wait in an outbox on the device (shown as "Waiting for connection...") and are sent automatically when the connection returns, oldest first, without duplicates. If the server refuses one, it is marked Failed with the reason and can be retried or deleted.
- Logout wipes the saved conversations, the outbox and the app-icon number. Saved data is tied to one user and never shown to another.
- When a new version is available a banner asks to refresh (the app never reloads by itself in the middle of typing).
- The number of unread messages is shown on the app icon (App Badging, where the phone supports it).
- Background Sync (Chrome/Android): if the app is closed while messages wait, the browser wakes the service worker when the connection returns and the messages are sent. iPhone has no Background Sync, so there they are sent the next time the app is opened. For this the app keeps a copy of the login in IndexedDB; it is erased on logout.

**Security notes**: helmet headers, CORS allow-list, rate limits on login/sign-up/reset, bcrypt hashes, 30-minute inactivity limit enforced on the server, failed logins take a minimum time so unknown emails cannot be told apart, JWT limited to HS256.

The app icons are generated from `frontend/public/logo.png` with `npm run icons`.

**Directory data**: tap a person to open their profile card (designation, position, qualification, field). The card shows a Message button only when the hierarchy rules allow that chat. The Directory screen is built from the Word file `frontend/data/faculty-details.docx` (each person is a heading with the name, followed by designation, degree and field on separate lines). To update it, replace that file and run `npm run directory` inside `frontend`. The students in the directory are sample data.

---

## 🎯 Verification Personas for Grading & Testing

Everyone signs up and logs in with their **SZABIST email** (the SZABIST ID is only a record number).

| SZABIST email | Name | Role | Has account? | Status | Password | What to test |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `bcsbs2112298@szabist.pk` | Zainab | Student | No | PENDING | *(set during sign up)* | **UC-01 Sign Up (student)** |
| `asim.riaz@szabist.edu.pk` | Mr. Asim Riaz | Faculty | No | PENDING | *(set during sign up)* | **UC-01 Sign Up (faculty)** |
| `mohammad.shahzad.haroon@szabist.edu.pk` | Dr. Mohammad Shahzad Haroon | HOD (Computer Science) | No | PENDING | *(set during sign up)* | Sign Up as HOD |
| `bcsbs2212138@szabist.pk` | Zain | Student (4th year) | Yes | ACTIVE | `Password123!` | **UC-02 Login & UC-03 Password Reset** |
| `faraz.junejo@szabist.edu.pk` | Dr. Faraz Junejo | Dean | Yes | ACTIVE | `Password123!` | Dean login |
| `mubeen.ahmed.khan@szabist.edu.pk` | Mr. Mubeen Ahmed Khan | PM (3rd year) | Yes | ACTIVE | `Password123!` | PM login |
| `bscs2312246@szabist.pk` | Farzeen | Student | No | AWAITING_ASSIGNMENT | *(set during sign up)* | **Real-email sign-up test; messaging blocked after login** |
| `bscs2412224@szabist.pk` | Student 2412224 | Student | No | AWAITING_ASSIGNMENT | *(set during sign up)* | **Real-email sign-up test** |
| `tariq.m@szabist.edu.pk` | Tariq Mehmood | Faculty | Yes | **SUSPENDED** | `Password123!` | **REQ-2.6 Refuse Login (Account Suspended)** |
| `admin@szabist.edu.pk` | System Administrator | Admin | Yes | ACTIVE | `Password123!` | Administrator login |

Also seeded without accounts (PMs, can sign up): Ms. Faria Jameel (4th year), Mr. Muhammad Ahsan (2nd year), Ms. Ayesha Ghayas (1st year).

---

Any address ending in `@szabist.pk` (student) or `@szabist.edu.pk` (faculty) can request a sign-up code; other domains are refused. The code is valid for 10 minutes, so an address that cannot receive mail can never finish sign-up.

### Sending real emails (optional)
Without SMTP settings, codes are only printed in the backend terminal. To send real mail, add to `backend/.env` (for Gmail use an App Password, not your normal password):
```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-address@gmail.com"
SMTP_PASS="your-16-letter-app-password"
SMTP_FROM="your-address@gmail.com"
```
Then restart the backend.

---

## 💬 Messaging

Messaging follows the SRS (UC-05, UC-06, UC-10). Everything is checked on the server.

**Who can message whom**

Everyone in the SzabU directory can message everyone else in it: the Dean, Heads of Department, Program Managers (who are faculty too), faculty and students. This replaces the strict hierarchy table of the SRS (Table 1).

- The administrator does not use messaging (cannot send or receive).
- People not yet placed in the hierarchy cannot message (they see the "contact admin" notice).
- People who have not signed up yet (PENDING) can be messaged and see the messages when they sign up.
- Suspended people cannot be messaged.
- Every person in `frontend/data/faculty-details.docx` has an account row (`npm run seed` adds them) with a dummy campus email (built by `npm run directory`), shown on their Directory card: `firstname.lastname@szabist.edu.pk` for two-word names, and the complete name for longer ones, e.g. `muhammad.danish.khan@szabist.edu.pk`. The sample students at the bottom of the Directory are not in the database yet, so they cannot be messaged.


**Rules**
- A message must be 1 to 2000 characters, otherwise `Please enter a message of up to 2000 characters.`
- At most 30 messages per minute per user (`429`).
- A message is saved on the server before it shows as **Sent**; the sender then sees **Delivered** and **Read**.
- Retrying a failed send never creates a duplicate (each message carries a `clientMsgId`).
- History loads 50 messages at a time; opening a chat marks its messages Read.
- The recipient gets a row in the `notifications` table for every new message.
- Phone numbers and emails are never returned by the messaging API.

**API** (all need a login token; base path `/api/messages`)

| Method and path | Purpose |
| :--- | :--- |
| `GET /contacts?q=` | People the user may message (name, role, program) |
| `GET /conversations` | Inbox: latest message and unread count per conversation |
| `POST /conversations` `{ recipientId }` | Open or create the one conversation with a person |
| `GET /conversations/:id/messages?before=` | History, oldest first, 50 at a time |
| `POST /conversations/:id/messages` `{ body, clientMsgId }` | Send a message |
| `POST /conversations/:id/read` | Mark the conversation Read |

**Real-time delivery (Socket.IO)**

The server pushes events over a Socket.IO connection (`/socket.io`), so messages and status changes show up instantly with no refresh:

| Event | Sent to | Meaning |
| :--- | :--- | :--- |
| `message:new` | Both people | A message was saved |
| `message:status` | The sender | Their message became `DELIVERED` or `READ` |

- The socket uses the same login check as the REST API (the session token). Revoked sessions, suspended accounts, unplaced users and the administrator cannot connect, and logging out or resetting the password closes the user's open connections.
- A message is marked **Delivered** the moment the recipient is online; if they are offline it stays **Sent** and turns **Delivered** when they next connect.
- Each user only receives events about their own conversations.
- If the live connection drops, the app falls back to checking every 4 seconds (chat) or 8 seconds (inbox) until it reconnects.
- The Messages tab shows a live unread badge.
- In development the Vite server proxies `/socket.io` to the backend (`frontend/vite.config.ts`). **After pulling this change, restart the frontend dev server.**

**Phone notifications (Web Push, UC-09)**

When someone writes to you and the app is closed, your phone shows a notification such as *New message from Mr. Mubeen Ahmed Khan*. Tapping it opens that chat.

- **Title only.** A notification never contains message text (REQ-9.2).
- **Switch.** The Home screen has a *Message notifications* switch (it asks the browser for permission). It only appears in the built / installed app, because service workers do not run in `npm run dev`. On iPhone the app must first be added to the Home Screen.
- **Not sent while the app is open.** If the recipient is online (live connection), the message arrives instantly and no push is sent.
- **Retries.** If the push service fails, the server retries up to 3 more times, then marks the notification `FAILED` (`notifications.push_status` / `retry_count`). A device the push service reports as gone (404 / 410) is removed.
- **Privacy.** Logging out removes the phone from that user, and a phone that signs in as someone else moves to the new user. The administrator and unplaced users cannot register.
- **New table.** Each registered phone is a row in `push_subscriptions` (not part of the original ERD; the browser gives every device its own address and keys, so they have to be stored). Run `npm run prisma:push` once after pulling.
- **Server keys.** The server signs pushes with a VAPID key pair in `backend/.env`. Create your own with `npx web-push generate-vapid-keys` and add:
  ```
  VAPID_PUBLIC_KEY="..."
  VAPID_PRIVATE_KEY="..."
  VAPID_SUBJECT="mailto:admin@szabist.edu.pk"
  ```
  Without the keys the rest of the app works; the switch just reports that notifications are not set up.

| Method and path | Purpose |
| :--- | :--- |
| `GET /api/push/public-key` | The server public key the browser needs to subscribe |
| `POST /api/push/subscribe` `{ subscription }` | Register this phone |
| `POST /api/push/unsubscribe` `{ endpoint }` | Remove this phone |

To try it on a computer: `npm run build` then `npm run preview` in `frontend`, open http://localhost:4173 in Chrome, log in as Zain, turn on *Message notifications*, close the tab, then send Zain a message as Mr. Mubeen from another browser profile. (Phone notifications need `localhost` or HTTPS.)

The seed adds two demo classes for the 4th year (CSC-411 taught by Mr. Asim Riaz and CSC-382 taught by Mr. Mubeen Ahmed Khan, with Zain and Zainab enrolled), so the "faculty of their sections" rule has data to work with. Log in as Zain (student) and as Mr. Mubeen (PM) on two devices to try a conversation.

---

## 🛠️ Testing Helpers

- **Quick test personas**: on the Login screen, tap any persona to fill in its email and password.
- **Verification codes**: sent by email when the `SMTP_` settings are in `backend/.env` (see above).

---

## 📋 Requirements Compliance Summary

- **4.1 Sign Up (UC-01)**:
  - **REQ-1.1**: Validates that the SZABIST email exists in the records added by the administrator and has no account yet.
  - **REQ-1.2**: The role (student, faculty, PM, HOD, Dean) is taken from the official record; the user does not choose it.
  - **REQ-1.3**: Emails 6-digit code, stores only salted hash, expires in 10 minutes, accepted once.
  - **REQ-1.4**: Allows at most 5 wrong attempts; cancels code after 5 failures; 60s resend cooldown.
  - **REQ-1.5**: Password of &ge; 8 characters with uppercase, lowercase, digit and special character, entered twice.
  - **REQ-1.6**: Passwords stored exclusively as salted hashes (`bcryptjs`).
  - **REQ-1.7**: User role assigned directly from hierarchy record; no phone number requested.
- **4.2 Login (UC-02)**:
  - **REQ-2.1**: Logs in with SZABIST email and password only, without code.
  - **REQ-2.2**: Generic error message: `"Incorrect email or password"` for invalid credentials (also for unknown emails).
  - **REQ-2.3**: Locks account for 15 minutes after 5 failed attempts.
  - **REQ-2.4**: Issues JWT with user ID and role; ends session after 30 minutes of inactivity or logout.
  - **REQ-2.5**: Opens role-tailored dashboard; blocks messaging for accounts awaiting assignment (`isPlacedInHierarchy: false`).
  - **REQ-2.6**: Refuses login to suspended accounts (`"Account suspended"`).
  - **REQ-2.7**: Clears cached data from device on logout and logs events in the audit trail.
- **4.3 Reset Forgotten Password (UC-03)**:
  - **REQ-3.1**: "Forgot password" option provided on the login card.
  - **REQ-3.2**: Sends code to registered mailbox; displays generic message: `"If the ID is registered, a code has been sent."` for both known and unknown IDs.
  - **REQ-3.3**: 6-digit code stored as salted hash, 10m validity, max 5 attempts.
  - **REQ-3.4**: Logs user in with a restricted session (`scope: PASSWORD_RESET_ONLY`) allowing only password update.
  - **REQ-3.5**: Enforces UC-01 password rules and terminates all older sessions (rows in the `sessions` table are revoked).
  - **REQ-3.6**: Emails security confirmation notice that the password was changed.
