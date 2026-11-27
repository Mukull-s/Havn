# Havn

Browser-based AI voice receptionist (`Ava`) and scheduling dashboard for a fictional outpatient clinic. Callers speak over WebRTC to check doctor availability, book an appointment, or cancel an existing one while the dashboard updates from SQLite.

## How the voice pipeline works

- Browser audio connects to the FastAPI backend over WebRTC (`SmallWebRTCTransport` + RTVI events).
- Pipecat (`1.17.0`) streams incoming audio through Silero VAD + `LocalSmartTurnV3` into ElevenLabs Realtime STT (`scribe_v2_realtime`).
- Transcribed turns run against Groq (`openai/gpt-oss-120b` by default when `GROQ_API_KEY` is set, or Google Gemini `gemini-3-flash-preview` via `GOOGLE_API_KEY`) with clinic function-calling tools.
- Responses stream back through ElevenLabs TTS (`eleven_flash_v2_5`) while UI confirmation and row-highlight events sync to the frontend.

Phone verification is enforced in Python (`CallSession`), not in LLM memory: the caller must speak a number (`set_caller_phone`) and confirm Ava's digit readback (`confirm_caller_phone`) before `book_appointment` or `cancel_appointment` can run. Writes execute inside SQLite `BEGIN IMMEDIATE` transactions with a partial unique index (`ux_appointments_active_slot`) so concurrent callers cannot book the same slot twice.

## Running locally

### 1. Environment variables

Copy `.env.example` to `.env` at the repository root and add your keys:

```env
ELEVENLABS_API_KEY=your_elevenlabs_key
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
```

If you want to use Gemini instead of Groq, set `GOOGLE_API_KEY` (or set `HAVN_LLM_PROVIDER=groq` / `gemini` when both keys exist).

### 2. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 7860
```

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge, allow microphone access, and click **Call Ava · Reception**.

## Tests & checks

```powershell
# Backend tests
$env:PYTHONPATH="backend"; backend\.venv\Scripts\python.exe -m pytest backend/tests -v

# Frontend reducer tests, TypeScript check, and production build
cd frontend
node --experimental-strip-types --test tests/voiceReducer.test.ts
npm run typecheck
npm run build
```

All doctors, schedules, phone numbers, and seeded appointments are fictional sample data for demonstration only.
