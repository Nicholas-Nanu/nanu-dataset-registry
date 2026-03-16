# Nanu Dataset Registry

A Next.js tool for discovering, validating, and cataloguing open-source CSV/XLSX datasets across Nanu's 9 research categories.

## What it does
- Loads a curated list of known CSV/XLSX datasets per category
- **◈ CHECK** — hits the real URL server-side, confirms it's live + returns file size
- **▾ COLS** — downloads the first 32KB of the file server-side, reads real column headers
- **◎ FIND MORE** — asks Claude to suggest additional datasets (server-side, API key stays private)
- Export everything to CSV for Alex

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add your Anthropic API key
```bash
cp .env.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
```

### 3. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm i -g vercel
vercel
# Follow prompts, add ANTHROPIC_API_KEY as environment variable when asked
```

### Option B — Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for AI dataset suggestions |

## Project structure
```
pages/
  index.jsx          ← Main UI
  api/
    validate.js      ← Checks if URL is live + file size
    headers.js       ← Fetches real column headers from CSV/XLSX
    suggest.js       ← Claude API proxy for new dataset suggestions
lib/
  seeds.js           ← Curated seed dataset list (edit this to add more)
```

## Adding datasets
Edit `lib/seeds.js` — add entries to any category following the existing format:
```js
{
  name: "Dataset Name",
  url: "https://direct-download-url.csv",
  file_type: "csv",         // "csv" or "xlsx"
  records: "~5,000",
  columns: ["col1","col2"], // known/estimated columns
  source_org: "Organisation Name",
  login: false,             // true if account required
}
```
