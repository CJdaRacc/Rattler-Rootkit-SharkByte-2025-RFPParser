# RFP → Proposal Generator (MERN + Gemini)

This repository contains a MERN-based prototype that ingests an RFP (PDF/DOCX/TXT), analyzes and extracts key requirements, and helps you build a proposal using a fillable, section‑based template. Google Gemini is used to enrich business keywords for each requirement. Personally identifiable information (PII) is redacted before any content is sent to Gemini.

## Features
- RFP ingestion: PDF/DOCX/TXT parsing and naive sectioning
- Deterministic requirement extraction (hard-coded JSON fields)
  - Fields: `clause_ref`, `title`, `category`, `priority`, `text_snippet`, `evidence_required[]`, `submission_format`, `budget_caps`, `due_dates`, `keywords[]`
  - Gemini is used to enrich `keywords[]` only, after redaction
- PII redaction before LLM calls (names, addresses, companies, emails, phones)
- Template builder UI with essential sections (based on samples/RFP Template.pdf)
- Simple proposal draft generator (backend service + optional UI page)
- Markdown export of generated proposal

## Repository structure
```
.
├─ backend/
│  ├─ src/
│  │  ├─ index.js                # Express app entry
│  │  ├─ lib/mongo.js            # Mongoose connection
│  │  ├─ models/                 # Mongoose models
│  │  ├─ routes/                 # Express routes (rfps, templates, proposals)
│  │  └─ services/               # parsing, extraction, generation, export, llm, redaction
│  └─ .env.example               # Environment variables (copy to .env)
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx                 # Two tabs: Analyze RFP, Template
│  │  └─ pages/                  # UploadRfp.jsx, Templates.jsx, Proposals.jsx (optional)
│  └─ vite.config.js             # /api proxy → http://localhost:4000
└─ samples/
   ├─ (GOOD) Official Request for Proposal Document.pdf
   ├─ (MID) RFP.pdf
   ├─ (BAD) RFP.pdf
   └─ RFP Template.pdf
```

## Requirements
- Node.js 18+ (recommended 20+)
- npm 9+
- MongoDB 6+ (local or Atlas)
- Google Gemini API key (AI Studio) if you want keyword enrichment

## Quick start

Recommended (runs backend and frontend together from the project root):

1) Setup environment (backend)
- Copy environment example and edit values:
  ```bash
  cd backend
  cp .env.example .env
  # Open .env and set MONGO_URI and (optionally) GEMINI_API_KEY
  ```
  On Windows PowerShell, you can also use:
  ```powershell
  cd backend
  copy .env.example .env
  ```

2) Install all dependencies from the project root
```bash
npm install            # installs root tools
npm run install:all    # installs backend & frontend deps
```

3) Start both apps (dev)
```bash
npm run dev
```
- Backend: http://localhost:4000 (health: http://localhost:4000/api/health)
- Frontend: http://localhost:5173 (proxy `/api` → backend)

4) Production-style preview (optional)
```bash
# optional: (cd frontend && npm run build)
npm run start
```
- Runs backend `start` and frontend `preview` concurrently.

---

Alternative (per-app terminals):

- Backend (terminal 1)
  ```bash
  cd backend
  npm install
  npm run dev
  # Health: http://localhost:4000/api/health
  ```
- Frontend (terminal 2)
  ```bash
  cd frontend
  npm install
  npm run dev
  # Opens http://localhost:5173
  ```
- The dev server proxies `/api` to `http://localhost:4000`.

## Environment variables (backend/.env)
```
# Server
PORT=4000
MONGO_URI=mongodb://localhost:27017/rfp_proposals

# Google Gemini (AI Studio)
# Required for keyword enrichment; app still runs without it (fallback heuristics)
GEMINI_API_KEY=your_api_key
GEMINI_MODEL_TEXT=gemini-1.5-pro
GEMINI_MODEL_FAST=gemini-1.5-flash
GEMINI_EMBED_MODEL=text-embedding-004
```
Notes:
- If `GEMINI_API_KEY` is not set, the app still ingests, parses, and extracts requirements, but `keywords[]` will be populated by a local heuristic instead of Gemini.

## How to use
1) Analyze RFP
- Go to the “Analyze RFP” tab
- Upload one of the PDFs from `samples/` or your own `.pdf/.docx/.txt`
- The app:
  - Extracts text and splits into sections
  - Extracts deterministic requirements with the specified fields
  - Redacts PII and sends a summary to Gemini to enrich `keywords[]` (if key provided)
- Click an RFP in the list to view its sections and requirements

2) Build a Template
- Open the “Template” tab
- Fill out template sections (titles, guidance) and mark sections as optional if needed
- Click “Save Template” to persist; the backend stores `sectionMap` and `variables`
- The form is guided by `samples/RFP Template.pdf` and the GOOD RFP example

3) Generate a Draft (optional UI)
- The backend exposes endpoints to create a proposal draft and export Markdown
- The repo includes a `Proposals` page; if it’s not linked in the nav, you can open it directly at `/proposals` by adding a route or re‑enabling the link. It:
  - Generates a draft using the current template and RFP
  - Stores sections with simple coverage lists (IDs of matched requirements)
  - Exports a concatenated Markdown file under `backend/exports/<proposalId>.md`

## API reference (brief)
- RFPs
  - `POST /api/rfps/ingest` (multipart, field `file`) → `{ rfp, sectionsCount, requirementsCount }`
  - `GET /api/rfps` → list
  - `GET /api/rfps/:id` → details
  - `GET /api/rfps/:id/sections` → sections
  - `GET /api/rfps/:id/requirements` → requirements
- Templates
  - `GET /api/templates` → list
  - `POST /api/templates` → create (body: `name`, `format`, `sectionMap` as JSON string, `variables` as JSON string)
- Proposals (optional)
  - `POST /api/proposals/generate` → `{ proposal, sections }`
  - `GET /api/proposals` → list
  - `GET /api/proposals/:id` → details
  - `GET /api/proposals/:id/sections` → sections
  - `GET /api/proposals/:id/export` → `{ path }` Markdown export path

## Security & privacy
- PII redaction: Before calling Gemini, we run redaction to remove names, addresses, company names, emails, phones, and rough locations. The redaction occurs in `backend/src/services/redaction.js` and is applied in the extraction pipeline.
- Data residency: Using Google AI Studio sends prompts to Google. If this is a concern, consider migrating to Vertex AI with service account auth and additional controls.
- Local data: Original documents and unredacted text are not sent to Gemini; they remain local in memory/DB. Review and harden `redaction.js` rules for your domain.

## Troubleshooting
- Mongo connection errors
  - Ensure MongoDB is running locally or set `MONGO_URI` to an Atlas cluster
- PDF parsing issues
  - Some PDFs (scanned images) may need OCR; this prototype does not perform OCR
- Gemini errors or keyword enrichment missing
  - Check `GEMINI_API_KEY` and internet connectivity; the app will fall back to heuristics
- CORS issues
  - The backend enables CORS by default; check your browser’s console and network tab

## Development scripts
Backend:
- `npm run dev` – start Express with nodemon
- `npm start` – start Express without nodemon

Frontend:
- `npm run dev` – Vite dev server
- `npm run build` – production build (outputs to `frontend/dist`)
- `npm run preview` – preview build locally

## Roadmap (short)
- Add Ajv schema validation when saving requirements
- RAG-assisted drafting with embeddings
- DOCX/PDF export pipeline
- Validation dashboard (coverage and unsupported claims)
- Vertex AI option for enterprise deployments

## License
MIT (or your preferred license). Update this section as needed.
