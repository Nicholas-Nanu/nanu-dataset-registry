# Nanu Dataset Scraper

Python scraper that finds real CSV/XLSX datasets across 7 sources for Nanu's 9 research categories.

## Sources
| Source | What it searches | Needs key? |
|--------|-----------------|------------|
| `bing` | Whole web, filetype:csv/xlsx queries | Yes — free tier |
| `zenodo` | Zenodo open dataset archive | No |
| `github` | Public GitHub repos with CSV files | Optional (raises rate limit) |
| `ckan` | data.gov, data.gov.uk, open.canada.ca | No |
| `arxiv` | Academic papers with datasets | No |
| `pubmed` | PubMed / NCBI biomedical literature | No |
| `foia` | FOIA.gov government record requests | No |

## Setup

```bash
pip install requests beautifulsoup4 tqdm
```

## API Keys (optional but recommended)

**Bing Search API** — enables whole-web filetype:csv searches. Free tier: 1,000 calls/month.
1. Go to portal.azure.com
2. Create resource → Bing Search v7
3. Select Free tier (F1)
4. Copy the key

**GitHub Token** — raises GitHub rate limit from 10 to 30 requests/min.
1. Go to github.com/settings/tokens
2. Generate new token (classic) → no scopes needed for public repos

```bash
export BING_SEARCH_API_KEY=your_bing_key_here
export GITHUB_TOKEN=your_github_token_here
```

## Usage

```bash
# Scrape everything
python nanu_scraper.py --all

# Specific categories
python nanu_scraper.py --category uap --category cryptids

# Specific sources only
python nanu_scraper.py --all --sources zenodo,github,ckan

# Bing only, 30 results per category
python nanu_scraper.py --all --sources bing --max 30

# Custom output file
python nanu_scraper.py --all --output datasets_march_2026.csv
```

## Output

A CSV file with columns:
`name, url, file_type, records, columns, source_org, category, source, login, description, date_found`

Import this CSV into the Nanu Dataset Registry — copy/paste entries into `lib/seeds.js`
or pass the file to Alex for direct database import.

## Tips
- Run `--sources zenodo,ckan,github` first (no API key needed, most reliable)
- Add Bing for the broadest web coverage
- `arxiv` and `pubmed` find academic dataset papers, not always direct downloads
- `foia` finds request records, useful for UAP/NHI/paranormal government data
- Results are deduplicated by URL across all sources
