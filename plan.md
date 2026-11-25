# theGraveinter — Interview Conducting App (Plan v0.1)

Desktop app (macOS + Windows) for running technical interviews: video call, screen share, chat, and a built-in collaborative coding environment.

## 1. Goals (v1 scope)

| # | Feature | Done when |
|---|---------|-----------|
| 1 | Video + audio call (1:1, up to ~4 participants) | Interviewer and candidate see/hear each other with <500 ms latency |
| 2 | Camera / mic controls + device picker | Toggle, switch devices, mute indicator, pre-join preview |
| 3 | Screen share | Share full screen or a single window, with system audio where the OS allows it |
| 4 | In-call chat | Text messages, persisted per interview, visible during and after the call |
| 5 | Built-in coding environment | Shared editor, both sides see edits live, run code and see output |
| 6 | Interview rooms | Interviewer creates a room, candidate joins via link or code, no account needed for candidate |

**Out of scope for v1 (later):** recording and playback, AI notes or scoring, scheduling and calendar sync, whiteboard, question bank, ATS integrations, mobile apps.

## 2. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Desktop shell | **Electron** | One codebase for macOS and Windows. Chromium's WebRTC and `desktopCapturer` are mature. |
| UI | React + TypeScript + Vite + Tailwind | Fast iteration, strong typing. |
| Real-time A/V | **LiveKit** (WebRTC SFU, self-hosted or cloud) | Handles rooms, simulcast, screen share, and data channels. Avoids building signaling, TURN, and SFU ourselves. |
| Code editor | **Monaco** (VS Code's editor) | Syntax highlighting, IntelliSense, familiar to candidates. |
| Collaborative editing | **Yjs** + y-monaco (synced via WebSocket) | CRDT gives conflict-free live editing and cursors. |
| Code execution | **Piston** or **Judge0** in sandboxed containers | Multi-language, isolated, resource-limited. |
| Backend API | Node.js + **NestJS**, REST + WebSocket | Auth, rooms, chat, and the LiveKit token service. |
| Database | PostgreSQL (+ Redis for presence and rate limits) | Interviews, users, chat history, code snapshots. |
| Auth | Email/password or OAuth for interviewers, signed room-link tokens for candidates | Low friction for candidates. |
| Packaging | electron-builder + code signing and notarization | Signed `.dmg` (mac) and `.exe` installer (Windows) with auto-update. |

## 3. Architecture

```
┌────────────────────── Electron App ──────────────────────┐
│ Renderer (React)            Main process                 │
│  ├─ Call UI (LiveKit SDK)    ├─ desktopCapturer (screen) │
│  ├─ Chat panel               ├─ OS permissions (cam/mic) │
│  ├─ Monaco + Yjs             ├─ Auto-update, deep links  │
│  └─ Output / console         └─ Secure IPC bridge        │
└───────────┬───────────────────────┬──────────────────────┘
            │ WebRTC                │ HTTPS / WSS
       ┌────▼─────┐        ┌────────▼─────────┐     ┌──────────────┐
       │ LiveKit  │        │ API (NestJS)     │────▶│ Postgres     │
       │ SFU+TURN │        │ rooms/chat/yjs   │     │ Redis        │
       └──────────┘        └────────┬─────────┘     └──────────────┘
                                    │ run request
                            ┌───────▼────────┐
                            │ Piston/Judge0  │  sandboxed containers
                            └────────────────┘
```

## 4. Key design notes

- **Screen share:** Electron has no built-in picker, so build a custom source picker from `desktopCapturer.getSources`. macOS needs Screen Recording permission, and the app must handle it being denied. Windows can capture system audio. macOS cannot without a loopback driver, so v1 ships without it.
- **Permissions:** Add the camera and mic entitlements and usage strings in the macOS `Info.plist`. Show a first-run permission check and a clear message if access is denied.
- **Code sandbox:** Run each submission in a container with no network, CPU/memory/time limits, and a read-only filesystem. Never execute code on the API host.
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, and a minimal preload API. Room tokens are short-lived and scoped to one room. Rate-limit code runs and chat.
- **Candidate integrity (optional, post-v1):** Editor paste and tab-focus logging, shown to the interviewer only.

## 5. Milestones

| Phase | Deliverable | Est. |
|-------|-------------|------|
| **M0 — Setup** ✅ | Repo, Electron + React + TS scaffold, lint/CI, LiveKit dev server, DB schema | 1 wk |
| **M1 — Call** ✅ | Create/join room, camera + mic, device selection, pre-join screen | 2 wks |
| **M2 — Screen share** ✅ | Source picker, share/stop, permission handling on mac and Windows | 1 wk |
| **M3 — Chat** 🟡 code done, needs manual test | Real-time chat via LiveKit data channel, history saved to DB | 1 wk |
| **M4 — Code editor** | Monaco + Yjs live sync, language picker, shared cursors | 2 wks |
| **M5 — Code execution** | Piston/Judge0 integration, stdout/stderr panel, limits | 1–2 wks |
| **M6 — Polish** | Layout (video + editor + chat), error states, reconnect handling, settings | 1–2 wks |
| **M7 — Ship** | Signing, notarization, installers, auto-update, beta with real interviews | 1–2 wks |

**Total:** ~10–12 weeks for one developer.

## 6. Suggested repo layout

```
theGraveinter/
├─ apps/
│  ├─ desktop/        # Electron main + preload + React renderer
│  └─ api/            # NestJS backend
├─ packages/
│  └─ shared/         # shared types, constants
├─ infra/             # docker-compose: livekit, postgres, redis, piston
└─ plan.md
```

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Poor call quality on bad networks | Use LiveKit simulcast and adaptive streaming. Provide a TURN server. |
| macOS screen-share permission friction | Guided permission flow and a restart prompt. |
| Untrusted code execution | Container isolation, no network, hard resource limits, separate host. |
| Notarization and signing delays | Set up Apple Developer and Windows code-signing certificates in M0, not M7. |
| Scope creep | Keep the v1 table in §1 fixed. Everything else goes to the backlog. |

## 8. Open questions

1. Self-host LiveKit or use LiveKit Cloud for v1? (Cloud is faster to start.)
2. Do candidates install the app, or can they join from a browser? (A web client reuses most of the code.)
3. Which languages must the editor run at launch? (Suggested: JS/TS, Python, Java, C++.)
4. Will interviews be recorded? This affects storage, consent, and legal requirements.

## 9. Next step

Start **M0**: scaffold the Electron + React + TypeScript app, bring up LiveKit locally with Docker, and get two windows joining the same room.
