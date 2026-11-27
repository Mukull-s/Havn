# Havn — Care, in conversation

Browser-based AI voice receptionist for an outpatient clinic (`Havn Clinic`). Callers speak over WebRTC to check doctor availability, book appointments, and cancel existing appointments while clinic staff monitor live appointments, schedules, and activity on the web dashboard.

> **Disclaimer:** Havn uses entirely fictional doctors, schedules, phone numbers, and appointments for an internship engineering demonstration. It is not intended for real clinical use.

## Architecture & Tech Stack

- **Voice Framework:** Python + `Pipecat 1.17.0` (`PipelineWorker` + `WorkerRunner`) over `SmallWebRTCTransport` + RTVI events
- **Speech-to-Text:** ElevenLabs Realtime STT (`scribe_v2_realtime`)
- **Turn Detection:** Silero VAD + Pipecat `LocalSmartTurnV3`
- **Text-to-Speech:** ElevenLabs streaming TTS (`eleven_flash_v2_5`)
- **LLM:** Groq (`openai/gpt-oss-120b` default when `GROQ_API_KEY` is set) or Google Gemini (`gemini-3-flash-preview` via `GOOGLE_API_KEY`)
- **Backend API & Storage:** FastAPI + SQLite (WAL mode, `BEGIN IMMEDIATE` transactions, and a partial unique index `ux_appointments_active_slot` preventing double-booking)
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, `@pipecat-ai/client-js` & `@pipecat-ai/small-webrtc-transport`

### Voice Safety & Phone Verification Flow

1. **Application-Managed Phone State:** The LLM cannot fabricate or override a caller's phone number. `CallSession` stores `pending_phone` and `verified_phone` server-side in Python.
2. **Spoken Readback Confirmation:** Callers state their number aloud (`set_caller_phone`), Ava reads the normalized digits back and asks for confirmation, and `confirm_caller_phone(confirmed=true)` unlocks booking/lookup/cancellation.
3. **Database-First Responses:** `book_appointment` and `cancel_appointment` execute transactional SQLite operations before returning `ok: true` to Ava.

## Setup & Running Locally

### 1. Environment Configuration

Copy `.env.example` to `.env` at the repository root and configure your keys:

```env
ELEVENLABS_API_KEY=your_elevenlabs_key
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
```

(Or set `GOOGLE_API_KEY` if using Gemini; set `HAVN_LLM_PROVIDER=groq` or `gemini` to pin one when both keys are present.)

### 2. Backend (FastAPI + Pipecat)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 7860
```

### 3. Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge, allow microphone permission when starting a voice call, and speak naturally with Ava.

## Verification Commands

```powershell
# Backend unit & API tests
$env:PYTHONPATH="backend"; backend\.venv\Scripts\python.exe -m pytest backend/tests -v

# Frontend reducer tests, TypeScript check & production build
cd frontend
node --experimental-strip-types --test tests/voiceReducer.test.ts
npm run typecheck
npm run build
```
