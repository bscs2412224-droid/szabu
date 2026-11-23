# SzabU - Project Review

A full check of the backend, database, frontend and PWA behaviour against the SRS and ERD.

## 1. What was checked and changed

### Security (backend)
| Finding | Fix |
| :--- | :--- |
| JWT secret depended on `.env`; a weak or missing one was silently accepted | Central `config.ts`: secret must be 32+ characters (production refuses to start, development uses a temporary one). Secret replaced with a random one. |
| No HTTP security headers, open CORS | `helmet`, CORS allow-list (`CLIENT_ORIGIN`) |
| No rate limits | Limits on login, request-code, verify, complete and reset |
| Login timing revealed unknown emails | Failed logins take a minimum time; unknown emails still run a password check |
| Codes made with a weak random source | `crypto.randomInt` |
| JWT algorithm not pinned | HS256 only |
| REQ-2.4 (30 min inactivity) was only on the client | Enforced on the server (`last_active_at`) and on sockets |
| Dev-only routes in production | Only mounted when not production |
| Database slow spots | Indexes added on messages, statuses, members, notifications, sessions, etc. |

### PWA (instead of web-style workarounds)
| Before | Now |
| :--- | :--- |
| Token and profile in several places in `localStorage` | One token key; old keys removed at startup |
| Page reload on a new version | Update banner (service worker "prompt" mode) |
| Nothing worked offline | Cached app shell, saved inbox/messages (IndexedDB), offline outbox with automatic send |
| Unread count only inside the app | App Badging number on the icon |
| No install help on iPhone | Add-to-Home-Screen hint |
| Basic manifest | Shortcuts, categories, maskable icon |
| Any 401 left the user on a broken screen | Session ends cleanly with a message and returns to login |

## 2. Test results
| Suite | Result |
| :--- | :--- |
| Security hardening | 28 passed |
| Offline cache and outbox | 27 passed |
| Messaging REST | 32 passed |
| Realtime (Socket.IO) | 16 passed |
| Browser check | Offline banner, saved inbox/chat, queued message stored on the device and sent once on reconnect: all worked |
| `npm run build` | OK; manifest has shortcuts; service worker imports `push-handler.js` |

## 3. Not verified or not done (honest list)
- **Not tested on a real phone.** Install and push notifications were tested with a simulated push service and simulated service worker only.
- **Background Sync** is implemented (Chrome/Android) and tested with a simulated service worker (12 checks). It is not tested in a real browser; iPhone does not support it, so messages are sent on the next app open there. It needs a copy of the login in IndexedDB (erased on logout).
- **Push tests rerun** after the `unread` change: server 29, service-worker handler 12, client registration 17, all passed.
- **Everyone must log in once again** because the JWT secret was changed.
- **`push_subscriptions` table** is new and not in the ERD (a phone needs its own address and keys).
- **npm audit:** remaining items are Prisma development tooling only.
- During the work the backend (port 5000) was down twice for a few minutes (a wrong import in the push code, and a cleanup command that also stopped your server).

## 4. Requirements status (summary)
| Area | Status |
| :--- | :--- |
| 4.1 Sign Up (REQ-1.x) | Done, with the open sign-up change below |
| 4.2 Login (REQ-2.x) | Done; inactivity now server-side |
| 4.3 Password reset (REQ-3.x) | Done |
| Messaging (UC-05, UC-06, UC-10) | Done, real time |
| Phone notifications (UC-09 push) | Done, needs a real-phone test |
| Directory | Done (read-only, from the Word file) |
| In-app notification list / bell (REQ-9.1, 9.3) | Missing |
| Admin panel and CSV import (UC-04) | Missing |
| Announcements (UC-08) | Missing |
| Allowed-contacts directory by role (REQ-7.2) | Partial (contacts search exists, directory is sample data for students) |

## 5. Corrections to propose for the SRS and ERD
1. **REQ-1.1**: sign-up is open to any `@szabist.pk` / `@szabist.edu.pk` address, not only pre-registered ones. Update the text.
2. **REQ-2.3 / REQ-2.5**: unplaced users can log in; only messaging is blocked.
3. **REQ-1.5**: password rule is stronger (upper, lower, digit, special).
4. **REQ-2.4**: say the 30-minute limit is enforced by the server.
5. **ERD**: add `push_subscriptions`; fix naming of departments/programs; document that people not yet signed up exist as placeholder user rows.
6. **Table 1**: replace the strict hierarchy with "everyone in the directory can message everyone" (Leadership and Program Managers are faculty too). The administrator still does not use messaging.
7. **Hosting**: Vercel cannot host Socket.IO. Host the API on Railway/Render and the app on Vercel, using `VITE_API_URL` and `CLIENT_ORIGIN`.

## 6. Suggested next steps
1. Test install and push on a real Android phone and an iPhone (HTTPS needed).
2. Admin panel with CSV import (UC-04).
3. In-app notification bell (REQ-9.1, 9.3).
4. Announcements (UC-08).
5. Real allowed-contacts directory (REQ-7.2) and a `signup_requests` design to replace placeholder user rows.
6. Deployment settings (`NODE_ENV`, `CLIENT_ORIGIN`, `TRUST_PROXY`, `VITE_API_URL`).
7. Move the login token from `localStorage` to an httpOnly cookie.
