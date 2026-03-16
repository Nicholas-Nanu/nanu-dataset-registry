# Nanu Dataset Registry v2

## Setup

```bash
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import repo in Vercel dashboard
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Deploy

## Project structure

```
pages/
  index.jsx          ← Main UI
  api/
    validate.js      ← Checks URL is live + file size
    headers.js       ← Reads real column headers from CSV/XLSX
    suggest.js       ← Claude API proxy for AI suggestions
lib/
  seeds.js           ← Curated seed datasets (edit to add more)
```
