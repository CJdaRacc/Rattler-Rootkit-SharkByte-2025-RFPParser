# SharkByte 2025 — RFP Analyzer & Proposal (MERN)

This project is now a MERN-style app:
- MongoDB for persistence (RFPs, proposals, keyword history)
- Express server for API endpoints
- React client (Vite) for UI. A minimal static UI also exists under `public/` for reference, but the Node server no longer serves static pages.
- Node.js runtime

## Features
- Upload RFP PDF → extract text → parse into hard-coded JSON schema fields: `id, clause_ref, title, category, priority, text_snippet, evidence_required[], submission_format, budget_caps, due_dates, keywords[]`.
- Redact PII before calling Gemini for keyword suggestions.
- Two-tab UI: Analyze RFP, Templating (fillable form inspired by sample template).
- Persistence: store analyzed RFPs and proposals in MongoDB.

## Setup
1. Copy `.env.example` to `.env` and set variables:
   - `PORT=3000`
   - `CORS_ORIGIN=http://localhost:5173` (if using separate Vite client) or `http://localhost:3000` if serving static `public/`
   - `MONGO_URI=mongodb://127.0.0.1:27017/sharkbyte_rfp` (or your Atlas URI)
   - `GEMINI_API_KEY=...`
   - Optional: `GEMINI_MODEL=gemini-1.5-flash-002`

2. Install dependencies:
   ```
   npm install
   ```

3. Run in development (server + client concurrently):
   ```
   npm run dev
   ```
   - Server: http://localhost:3000
   - Client (Vite): http://localhost:5173

   Note: The Node server is API-only and no longer serves static files. Always run the Vite client for the UI in development:
   ```
   npm run client
   # open http://localhost:5173
   ```

## API
- Health:
  - `GET /api/health` → `{ status, time, db }`

- Legacy (no persistence; works with static UI):
  - `POST /api/analyze` — form-data `rfp` (PDF). Returns `{ filename, meta, extractedText, parsed }`.
  - `POST /api/keywords` — `{ projectGoal, summary, rfpText }` → `{ keywords }`.

- RFPs (persistent):
  - `POST /api/rfps` — form-data `rfp` (PDF). Creates and returns an RFP document with `parsedRequirements`.
  - `GET /api/rfps` — list RFPs (omits `extractedText`).
  - `GET /api/rfps/:id` — get an RFP document.
  - `POST /api/rfps/:id/keywords` — `{ projectGoal, summary }` → generates keywords via Gemini, stores a suggestion entry, and surfaces keywords on each requirement.

- Proposals (persistent):
  - `POST /api/proposals` — `{ rfpId, formData, attachments, status }` → create.
  - `PUT /api/proposals/:id` — update fields.
  - `GET /api/proposals/:id` — fetch one.
  - `GET /api/proposals?rfpId=...` — list by RFP.

## Client
- `public/` contains a minimal two-tab UI that uses the legacy endpoints.
- For a React UI (Vite dev server), build components and call the persistent endpoints for saving/loading RFPs and proposals.

## Security/Privacy
- PII redaction occurs server-side before any Gemini request.
- Do not send sensitive data in free-text fields.

## Samples
- See `samples/` for example RFPs including the GOOD RFP and `RFP Template.pdf`.


## Category-specific, document-aware suggestions
The backend generates per-category suggestions for missing sections using Google Gemini and a GOOD RFP rubric. It now includes:
- Canonical category normalization (e.g., Timeline/Milestones → Timeline; Submission|Compliance → Submission & Compliance).
- Strict prompting that lists the exact categories to return.
- Post-processing relevance filter to drop off-topic actions and cap to 2–6 on-topic actions.
- Curated fallbacks per category when the model is unavailable.
- Anchoring to your parsed requirements via `related_requirements` IDs.

Tuning knobs:
- Edit `CATEGORY_KEYWORDS` and `CATEGORY_FALLBACKS` inside `src/gemini.js` to adjust filtering and fallback messaging.
- Adjust the rubric in `samples/good-rfp-rubric.json` to influence guidance.

Debugging (dev only):
- Set `DEBUG_SUGGESTIONS=1` in `.env` and restart the server to log model selection, prompt/response sizes, and raw model text (first 600 chars) alongside post-processed output.

Verification checklist:
1. Start backend and client: `npm run dev`.
2. Upload an RFP at `/rfp`.
3. Click “Get Suggestions (Gemini)”.
4. Confirm each missing category displays specific, on-topic actions (e.g., Evaluation → KPIs/baselines/data/cadence; Timeline → milestones/dates/dependencies; Submission & Compliance → portal/format/deadlines/checklists).
5. Temporarily unset `GEMINI_API_KEY` to force curated fallbacks and verify they remain on-topic.


---

## Quick start (TL;DR)
1. Prereqs: Node 20+, npm 10+, MongoDB running locally or Atlas URI.
2. Copy `.env.example` → `.env` and set at least:
   - `PORT=3000`
   - `CORS_ORIGIN=http://localhost:5173`
   - `MONGO_URI=mongodb://127.0.0.1:27017/sharkbyte_rfp`
   - `GEMINI_API_KEY=your_key` (or omit to use curated fallbacks)
3. Install deps: `npm install`
4. Start dev backend + frontend: `npm run dev`
   - API: http://localhost:3000
   - Client (Vite): http://localhost:5173
5. Upload a sample PDF from `samples/` and click “Get Suggestions (Gemini)”.

### One‑liner elevator pitch (200 chars)
Turn messy RFP PDFs into structured requirements and AI‑guided actions. A MERN app that speeds compliance, sharpens proposals, and tracks progress—securely, fast, and demo‑ready in minutes.

## Prerequisites
- Node.js 20 or newer (check with `node -v`)
- npm 10 or newer
- MongoDB (local or Atlas). Create a database; no manual collections needed.

## Environment configuration
Set these in `.env` (see `.env.example`):
- `PORT`: API port (default 3000)
- `CORS_ORIGIN`: e.g., `http://localhost:5173`
- `MONGO_URI`: e.g., `mongodb://127.0.0.1:27017/sharkbyte_rfp`
- `GEMINI_API_KEY`: Google Gemini API key
- Optional:
  - `GEMINI_MODEL` (default `gemini-1.5-flash-002`)
  - `DEBUG_SUGGESTIONS=1` to log prompt/response diagnostics in dev

## Startup options
- Development (recommended):
  - `npm run dev` → runs `nodemon` on the API and Vite for the client.
- API only:
  - `npm run server` → starts Express on `PORT`. Useful if you point another client at the API.
- Frontend only:
  - `npm run client` → starts Vite dev server on 5173.
- Production preview:
  - `npm run build` then `npm run preview` to serve the built client locally.
  - Note: The Express server is API‑only. For production, host the built client (from `dist/`) on a static host/CDN and the API separately (Node server on your infra). Update `CORS_ORIGIN` accordingly.

## Primary endpoints
- Health: `GET /api/health`
- Legacy analysis (stateless): `POST /api/analyze`, `POST /api/keywords`
- RFPs (persistent): `POST /api/rfps`, `GET /api/rfps`, `GET /api/rfps/:id`, `POST /api/rfps/:id/keywords`
- Proposals: `POST /api/proposals`, `PUT /api/proposals/:id`, `GET /api/proposals/:id`, `GET /api/proposals?rfpId=...`

## Scripts cheat‑sheet
- `npm run dev` — server + client concurrently
- `npm run server` — API only
- `npm run server:dev` — API with autoreload (nodemon)
- `npm run client` — Vite dev server
- `npm run build` — build client
- `npm run preview` — serve built client locally
- `npm run lint` — lint the repo

## Troubleshooting
- Mongo connect error: verify `MONGO_URI`, that Mongo is running, and your IP is allow‑listed (Atlas).
- CORS errors in browser: ensure `CORS_ORIGIN` matches your client origin (including port).
- Gemini errors or rate limits: remove `GEMINI_API_KEY` to fall back to curated suggestions while demoing.
- PDF parsing oddities: try a different sample; extraction varies by PDF. Defensive parsing is implemented, but inputs differ.
- Ports already in use: change `PORT` (API) or Vite port via `--port` or `vite.config.js`.

## Project folders (quick map)
- `server.js` — Express API, file uploads, parsing, suggestions
- `src/` — React client (pages/components), models, Gemini helpers
- `public/` — minimal static UI (legacy demo)
- `samples/` — example RFPs and rubric

## Security & privacy reminders
- PII is redacted server‑side before any Gemini request.
- Avoid sending sensitive data in free‑text fields.
- Anchor suggestions are tied to requirement IDs for traceability and audits.

## Demo script (5 minutes)
1. Start `npm run dev`.
2. Visit http://localhost:5173 and open the Analyze tab.
3. Upload `samples/RFP Template.pdf`.
4. Observe parsed requirements by category and priority.
5. Click “Get Suggestions (Gemini)”.
6. Show how suggestions link back to requirement IDs and how they stay on‑topic even if the model is unavailable (fallbacks).
