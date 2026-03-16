#!/usr/bin/env python3
"""
Nanu Dataset Scraper
====================
Finds real CSV/XLSX datasets across multiple sources for Nanu's nine categories.
Outputs a deduplicated CSV ready to import into the Nanu Dataset Registry.

Sources:
  - Bing Web Search API (filetype:csv / filetype:xlsx queries)
  - Zenodo REST API
  - data.gov (CKAN)
  - data.gov.uk (CKAN)
  - data.europa.eu
  - open.canada.ca (CKAN)
  - GitHub Search API (CSV/XLSX files in public repos)
  - arXiv API (dataset papers)
  - PubMed/NCBI (dataset records)
  - FOIA.gov API

Usage:
  pip install requests beautifulsoup4 tqdm
  python nanu_scraper.py --all
  python nanu_scraper.py --category uap --category cryptids
  python nanu_scraper.py --all --sources zenodo,bing,github
  python nanu_scraper.py --all --output my_datasets.csv

Environment variables (set in .env or export before running):
  BING_SEARCH_API_KEY   — Azure Bing Search v7 API key (free tier: 1000/month)
  GITHUB_TOKEN          — GitHub personal access token (optional, raises rate limit)
"""

import os
import sys
import csv
import time
import json
import argparse
import hashlib
from datetime import datetime
from urllib.parse import urlencode, urlparse, quote_plus

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("Missing dependency: pip install requests")
    sys.exit(1)

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

# ── Config ────────────────────────────────────────────────────────────────────

BING_KEY    = os.environ.get("BING_SEARCH_API_KEY", "")
GITHUB_TOKEN= os.environ.get("GITHUB_TOKEN", "")

CATEGORIES = {
    "uap":               "UFO / UAP",
    "nhi":               "NHI",
    "cryptids":          "Cryptids",
    "paranormal":        "Paranormal",
    "consciousness":     "Consciousness",
    "myths_history":     "Myths & History",
    "ritual_occult":     "Ritual / Occult",
    "natural_phenomena": "Natural Phenomena",
    "fortean":           "Other / Fortean",
}

# Search terms per category — tuned for each source type
SEARCH_TERMS = {
    "uap": {
        "bing":    ["UFO sightings database filetype:csv", "UAP reports dataset filetype:csv",
                    "unidentified aerial phenomena data filetype:xlsx", "NUFORC data CSV download",
                    "Project Blue Book data filetype:csv", "UFO open data CSV"],
        "zenodo":  ["UFO sightings", "UAP anomaly", "unidentified aerial phenomena"],
        "github":  ["ufo-sightings csv", "uap-data csv", "nuforc data"],
        "ckan":    ["UFO unidentified aerial phenomena sightings"],
        "arxiv":   ["UAP dataset", "unidentified aerial phenomena analysis"],
        "pubmed":  ["UFO psychosocial study dataset"],
    },
    "nhi": {
        "bing":    ["alien contact reports dataset filetype:csv", "NHI encounter data filetype:csv",
                    "extraterrestrial contact database CSV"],
        "zenodo":  ["non-human intelligence", "alien contact", "extraterrestrial encounter"],
        "github":  ["alien-contact csv", "nhi-data dataset"],
        "ckan":    ["anomalous aerial phenomena contact"],
        "arxiv":   ["non-human intelligence dataset", "UAP entity encounter"],
        "pubmed":  ["close encounter psychosocial dataset"],
    },
    "cryptids": {
        "bing":    ["bigfoot sightings database filetype:csv", "cryptid sightings dataset filetype:csv",
                    "BFRO data CSV download", "cryptozoology reports filetype:csv",
                    "unknown animal sightings database CSV"],
        "zenodo":  ["cryptid sightings", "bigfoot sasquatch", "unknown animal"],
        "github":  ["bigfoot-sightings csv", "bfro-data", "cryptid-database"],
        "ckan":    ["wildlife sightings unidentified species"],
        "arxiv":   ["cryptozoology dataset", "unknown primate sightings"],
        "pubmed":  ["unknown species encounter dataset"],
    },
    "paranormal": {
        "bing":    ["paranormal events dataset filetype:csv", "ghost sightings database filetype:csv",
                    "psychical research data filetype:xlsx", "parapsychology experiment results CSV",
                    "haunting reports dataset filetype:csv"],
        "zenodo":  ["parapsychology", "psychical research", "anomalous cognition", "ghost sightings"],
        "github":  ["paranormal-data csv", "ghost-sightings dataset"],
        "ckan":    ["anomalous events unexplained phenomena"],
        "arxiv":   ["parapsychology meta-analysis dataset", "ESP experiment data"],
        "pubmed":  ["near death experience psychosocial dataset", "parapsychology clinical study"],
    },
    "consciousness": {
        "bing":    ["near death experience dataset filetype:csv", "NDE research data filetype:csv",
                    "out of body experience database CSV", "consciousness research dataset filetype:xlsx",
                    "altered states data filetype:csv"],
        "zenodo":  ["near death experience NDE", "out of body experience OBE",
                    "consciousness altered states", "psychedelic experience"],
        "github":  ["nde-data csv", "consciousness-research dataset"],
        "ckan":    ["consciousness mental health wellbeing research data"],
        "arxiv":   ["near death experience dataset", "consciousness neuroscience dataset"],
        "pubmed":  ["near death experience prospective study data", "consciousness disorder dataset"],
    },
    "myths_history": {
        "bing":    ["world mythology dataset filetype:csv", "folklore database filetype:csv",
                    "ancient history oral traditions data CSV", "mythology motif database filetype:xlsx",
                    "folk tales dataset open access"],
        "zenodo":  ["mythology folklore", "oral tradition", "folk belief", "ancient history texts"],
        "github":  ["mythology-database csv", "folklore-data", "ancient-texts dataset"],
        "ckan":    ["folklore cultural heritage mythology history"],
        "arxiv":   ["folklore dataset computational", "mythology cross-cultural analysis data"],
        "pubmed":  ["oral history cultural dataset", "mythology psychology dataset"],
    },
    "ritual_occult": {
        "bing":    ["witchcraft trials dataset filetype:csv", "witch trial records database CSV",
                    "occult practices research filetype:csv", "historical ritual records dataset",
                    "early modern witchcraft data filetype:xlsx"],
        "zenodo":  ["witchcraft trials", "occult esoteric", "ritual magic", "early modern witch"],
        "github":  ["witch-trials csv", "witchcraft-data dataset"],
        "ckan":    ["historical records religious traditions cultural practices"],
        "arxiv":   ["witch trial dataset", "early modern magic analysis"],
        "pubmed":  ["religious ritual health dataset", "spiritual practice clinical data"],
    },
    "natural_phenomena": {
        "bing":    ["ball lightning reports dataset filetype:csv", "atmospheric anomaly data filetype:csv",
                    "meteor fireball database CSV filetype:csv", "geophysical anomaly dataset filetype:xlsx",
                    "anomalous natural phenomena reports CSV"],
        "zenodo":  ["ball lightning", "atmospheric anomaly", "fireball meteor", "geophysical anomaly"],
        "github":  ["meteor-data csv", "fireball-reports dataset", "lightning-data"],
        "ckan":    ["atmospheric phenomena geophysical natural anomaly"],
        "arxiv":   ["fireball meteor dataset", "atmospheric transient luminous events data"],
        "pubmed":  ["electromagnetic hypersensitivity dataset", "infrasound health effects data"],
    },
    "fortean": {
        "bing":    ["fortean phenomena database filetype:csv", "unexplained events dataset filetype:csv",
                    "anomalous occurrences data CSV", "strange phenomena reports CSV filetype:csv",
                    "fortean times case database CSV"],
        "zenodo":  ["fortean anomalous", "unexplained phenomenon", "anomalous event"],
        "github":  ["fortean-data csv", "anomalous-events dataset"],
        "ckan":    ["unexplained phenomena anomalous natural events"],
        "arxiv":   ["anomalous phenomena survey data", "fortean dataset analysis"],
        "pubmed":  ["anomalous experience survey dataset"],
    },
}

ALL_SOURCES = ["bing", "zenodo", "github", "ckan", "arxiv", "pubmed", "foia"]

# ── HTTP session with retries ─────────────────────────────────────────────────

def make_session():
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://",  HTTPAdapter(max_retries=retry))
    s.headers.update({"User-Agent": "NanuDatasetScraper/1.0 (research use)"})
    return s

SESSION = make_session()

# ── Deduplication ─────────────────────────────────────────────────────────────

seen_urls = set()

def normalise_url(url):
    """Normalise URL for dedup — strip protocol, trailing slash, query params."""
    try:
        p = urlparse(url.strip())
        return f"{p.netloc}{p.path}".rstrip("/").lower()
    except:
        return url.lower().strip()

def is_duplicate(url):
    key = normalise_url(url)
    if key in seen_urls:
        return True
    seen_urls.add(key)
    return False

def is_data_file(url):
    """Check if URL looks like a direct data file."""
    lower = url.lower()
    return any(lower.endswith(ext) or f"{ext}?" in lower
               for ext in [".csv", ".xlsx", ".xls", ".tsv"])

# ── Result builder ────────────────────────────────────────────────────────────

def make_result(name, url, category, source, file_type="csv",
                records="unknown", columns="", source_org="", description="", login=False):
    return {
        "name":        name[:200].strip(),
        "url":         url.strip(),
        "file_type":   file_type.lower(),
        "records":     records,
        "columns":     columns,
        "source_org":  source_org[:100].strip(),
        "category":    CATEGORIES.get(category, category),
        "source":      source,
        "login":       "Yes" if login else "No",
        "description": description[:300].strip(),
        "date_found":  datetime.now().strftime("%Y-%m-%d"),
    }

# ── Source: Bing Web Search ───────────────────────────────────────────────────

def search_bing(category, max_results=20):
    if not BING_KEY:
        print("  [bing] Skipping — BING_SEARCH_API_KEY not set")
        return []

    results = []
    queries = SEARCH_TERMS[category]["bing"]

    for q in queries:
        if len(results) >= max_results:
            break
        try:
            params = {"q": q, "count": "10", "mkt": "en-US", "safeSearch": "Moderate"}
            r = SESSION.get(
                "https://api.bing.microsoft.com/v7.0/search",
                params=params,
                headers={"Ocp-Apim-Subscription-Key": BING_KEY},
                timeout=15,
            )
            r.raise_for_status()
            pages = r.json().get("webPages", {}).get("value", [])
            for page in pages:
                url = page.get("url", "")
                if not url or is_duplicate(url):
                    continue
                # Prefer direct file links, but keep data portal pages too
                ft = "xlsx" if ".xlsx" in url.lower() or ".xls" in url.lower() else "csv"
                results.append(make_result(
                    name=page.get("name", "Untitled"),
                    url=url,
                    category=category,
                    source="bing",
                    file_type=ft,
                    source_org=urlparse(url).netloc.replace("www.", ""),
                    description=page.get("snippet", "")[:200],
                ))
            time.sleep(0.3)
        except Exception as e:
            print(f"  [bing] Error on query '{q}': {e}")

    return results[:max_results]

# ── Source: Zenodo REST API ───────────────────────────────────────────────────

def search_zenodo(category, max_results=20):
    results  = []
    queries  = SEARCH_TERMS[category]["zenodo"]

    for q in queries:
        if len(results) >= max_results:
            break
        try:
            params = {
                "q": q, "type": "dataset", "status": "published",
                "access_right": "open", "size": "10", "sort": "mostrecent",
            }
            r = SESSION.get("https://zenodo.org/api/records", params=params, timeout=20)
            r.raise_for_status()
            hits = r.json().get("hits", {}).get("hits", [])
            for hit in hits:
                files = hit.get("files", [])
                meta  = hit.get("metadata", {})
                data_files = [f for f in files if f.get("key","").split(".")[-1].lower()
                              in ["csv","xlsx","xls","tsv"]]
                if not data_files:
                    continue
                pf  = data_files[0]
                ext = pf.get("key","").split(".")[-1].lower()
                url = pf.get("links", {}).get("self", "") or \
                      f"https://zenodo.org/record/{hit.get('id','')}/files/{pf.get('key','')}"
                if not url or is_duplicate(url):
                    continue
                creators = ", ".join(c.get("name","") for c in meta.get("creators",[])[:2])
                results.append(make_result(
                    name=meta.get("title", "Untitled"),
                    url=url,
                    category=category,
                    source="zenodo",
                    file_type="xlsx" if ext in ["xlsx","xls"] else "csv",
                    records="unknown",
                    source_org=creators or "Zenodo",
                    description=(meta.get("description","") or "")
                                .replace("<p>","").replace("</p>"," ")[:200],
                ))
            time.sleep(0.5)
        except Exception as e:
            print(f"  [zenodo] Error on query '{q}': {e}")

    return results[:max_results]

# ── Source: GitHub Search API ─────────────────────────────────────────────────

def search_github(category, max_results=20):
    results = []
    queries = SEARCH_TERMS[category]["github"]
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    for q in queries:
        if len(results) >= max_results:
            break
        try:
            # Search for CSV files matching the query
            params = {"q": f"{q} extension:csv", "per_page": 10, "sort": "stars"}
            r = SESSION.get(
                "https://api.github.com/search/code",
                params=params, headers=headers, timeout=15,
            )
            if r.status_code == 403:
                print("  [github] Rate limited — add GITHUB_TOKEN env var for higher limits")
                break
            r.raise_for_status()
            items = r.json().get("items", [])
            for item in items:
                # Build raw URL
                raw_url = item.get("html_url","").replace(
                    "https://github.com/", "https://raw.githubusercontent.com/"
                ).replace("/blob/", "/")
                if not raw_url or is_duplicate(raw_url):
                    continue
                repo = item.get("repository", {})
                results.append(make_result(
                    name=f"{repo.get('full_name','')}: {item.get('name','')}",
                    url=raw_url,
                    category=category,
                    source="github",
                    file_type="csv",
                    source_org=repo.get("full_name","").split("/")[0],
                    description=repo.get("description","")[:200],
                ))
            time.sleep(1.0)  # GitHub requires slower rate
        except Exception as e:
            print(f"  [github] Error on query '{q}': {e}")

    return results[:max_results]

# ── Source: CKAN portals ──────────────────────────────────────────────────────

CKAN_PORTALS = {
    "data.gov":        "https://catalog.data.gov/api/3/action",
    "data.gov.uk":     "https://data.gov.uk/api/3/action",
    "open.canada.ca":  "https://open.canada.ca/data/api/3/action",
}

def search_ckan(category, max_results=20):
    results = []
    queries = SEARCH_TERMS[category]["ckan"]

    for portal_name, base_url in CKAN_PORTALS.items():
        if len(results) >= max_results:
            break
        for q in queries:
            try:
                params = {
                    "q":    q,
                    "fq":   "res_format:CSV OR res_format:XLSX OR res_format:csv OR res_format:xlsx",
                    "rows": "10",
                    "sort": "score desc",
                }
                r = SESSION.get(f"{base_url}/package_search", params=params, timeout=20)
                r.raise_for_status()
                data = r.json()
                if not data.get("success"):
                    continue
                for pkg in data.get("result", {}).get("results", []):
                    for res in pkg.get("resources", []):
                        fmt = (res.get("format","") or "").lower()
                        if fmt not in ["csv","xlsx","xls","tsv","text/csv"]:
                            continue
                        url = res.get("url","")
                        if not url or is_duplicate(url):
                            continue
                        ft = "xlsx" if fmt in ["xlsx","xls"] else "csv"
                        results.append(make_result(
                            name=pkg.get("title", res.get("name","Untitled")),
                            url=url,
                            category=category,
                            source=f"ckan_{portal_name}",
                            file_type=ft,
                            source_org=pkg.get("organization",{}).get("title","") or portal_name,
                            description=(pkg.get("notes","") or "")
                                        .replace("<p>","").replace("</p>"," ")[:200],
                        ))
                time.sleep(0.5)
            except Exception as e:
                print(f"  [ckan:{portal_name}] Error: {e}")

    return results[:max_results]

# ── Source: arXiv ─────────────────────────────────────────────────────────────

def search_arxiv(category, max_results=10):
    results = []
    queries = SEARCH_TERMS[category]["arxiv"]

    for q in queries:
        try:
            params = {
                "search_query": f"all:{q}",
                "start":        "0",
                "max_results":  "5",
                "sortBy":       "relevance",
                "sortOrder":    "descending",
            }
            r = SESSION.get("https://export.arxiv.org/api/query", params=params, timeout=20)
            r.raise_for_status()
            # Parse the Atom XML
            from xml.etree import ElementTree as ET
            root = ET.fromstring(r.text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.findall("atom:entry", ns):
                title = (entry.find("atom:title", ns) or ET.Element("x")).text or ""
                summ  = (entry.find("atom:summary", ns) or ET.Element("x")).text or ""
                link  = entry.find("atom:id", ns)
                url   = (link.text or "").strip() if link is not None else ""
                if not url or is_duplicate(url):
                    continue
                # Check summary mentions data/dataset
                summ_lower = summ.lower()
                if not any(kw in summ_lower for kw in ["dataset","data","csv","database","corpus"]):
                    continue
                results.append(make_result(
                    name=title.strip(),
                    url=url,
                    category=category,
                    source="arxiv",
                    file_type="csv",
                    source_org="arXiv",
                    description=summ[:200],
                ))
            time.sleep(3.0)  # arXiv requires 3s between requests
        except Exception as e:
            print(f"  [arxiv] Error on query '{q}': {e}")

    return results[:max_results]

# ── Source: PubMed / NCBI ─────────────────────────────────────────────────────

def search_pubmed(category, max_results=10):
    results = []
    queries = SEARCH_TERMS[category]["pubmed"]

    for q in queries:
        try:
            # Step 1: search for IDs
            search_params = {
                "db":      "pubmed",
                "term":    f"{q}[Title/Abstract] AND (dataset[Title/Abstract] OR data[Title/Abstract])",
                "retmax":  "5",
                "retmode": "json",
                "sort":    "relevance",
            }
            r = SESSION.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params=search_params, timeout=15,
            )
            r.raise_for_status()
            ids = r.json().get("esearchresult", {}).get("idlist", [])
            if not ids:
                continue

            # Step 2: fetch summaries
            time.sleep(0.5)
            summ_params = {
                "db":      "pubmed",
                "id":      ",".join(ids),
                "retmode": "json",
            }
            r2 = SESSION.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                params=summ_params, timeout=15,
            )
            r2.raise_for_status()
            uids = r2.json().get("result", {})
            for uid in ids:
                if uid not in uids:
                    continue
                art = uids[uid]
                title = art.get("title","")
                url   = f"https://pubmed.ncbi.nlm.nih.gov/{uid}/"
                if is_duplicate(url):
                    continue
                results.append(make_result(
                    name=title[:200],
                    url=url,
                    category=category,
                    source="pubmed",
                    file_type="csv",
                    source_org="PubMed / NCBI",
                    description=f"Published: {art.get('pubdate','')}. Source: {art.get('source','')}",
                ))
            time.sleep(1.0)
        except Exception as e:
            print(f"  [pubmed] Error on query '{q}': {e}")

    return results[:max_results]

# ── Source: FOIA.gov ──────────────────────────────────────────────────────────

FOIA_AGENCIES = {
    "uap":               ["NASA", "DOD", "USAF", "CIA", "DIA"],
    "nhi":               ["CIA", "DIA", "DOD", "NSA"],
    "cryptids":          ["USFS", "NPS", "FWS"],
    "paranormal":        ["CIA", "NSA", "DIA"],
    "consciousness":     ["CIA", "DOD"],
    "myths_history":     ["LOC", "NARA", "SI"],
    "ritual_occult":     ["FBI", "CIA"],
    "natural_phenomena": ["NOAA", "USGS", "NASA", "NWS"],
    "fortean":           ["FBI", "CIA", "NSA"],
}

def search_foia(category, max_results=10):
    results = []
    queries = SEARCH_TERMS[category].get("bing", [])[:2]  # reuse bing terms
    agencies = FOIA_AGENCIES.get(category, [])

    for q in queries[:1]:  # one query for FOIA
        try:
            # FOIA.gov full-text search
            params = {
                "query":     q.replace(" filetype:csv","").replace(" filetype:xlsx",""),
                "agencies":  ",".join(agencies[:3]),
                "page":      "1",
                "per_page":  "10",
            }
            r = SESSION.get(
                "https://api.foia.gov/api/search",
                params=params, timeout=20,
            )
            r.raise_for_status()
            data = r.json()
            for hit in data.get("data", [])[:max_results]:
                attrs = hit.get("attributes", {})
                title = attrs.get("title","") or attrs.get("subject","Untitled")
                url   = attrs.get("request_url","") or f"https://www.foia.gov/request/{hit.get('id','')}"
                if not url or is_duplicate(url):
                    continue
                results.append(make_result(
                    name=f"FOIA: {title[:180]}",
                    url=url,
                    category=category,
                    source="foia",
                    file_type="csv",
                    source_org=attrs.get("agency","FOIA.gov"),
                    description=attrs.get("description","")[:200],
                ))
            time.sleep(0.5)
        except Exception as e:
            print(f"  [foia] Error: {e}")

    return results[:max_results]

# ── Runner ────────────────────────────────────────────────────────────────────

SOURCE_FNS = {
    "bing":   search_bing,
    "zenodo": search_zenodo,
    "github": search_github,
    "ckan":   search_ckan,
    "arxiv":  search_arxiv,
    "pubmed": search_pubmed,
    "foia":   search_foia,
}

def run_scraper(categories, sources, output_file, max_per_source=20, delay=0.5):
    all_results = []

    for cat in categories:
        print(f"\n{'='*60}")
        print(f"Category: {CATEGORIES[cat]} ({cat})")
        print(f"{'='*60}")

        for src in sources:
            fn = SOURCE_FNS.get(src)
            if not fn:
                print(f"  [{src}] Unknown source, skipping")
                continue

            print(f"\n  [{src}] Searching...")
            try:
                results = fn(cat, max_results=max_per_source)
                print(f"  [{src}] Found {len(results)} results")
                all_results.extend(results)
            except Exception as e:
                print(f"  [{src}] Failed: {e}")

            time.sleep(delay)

    # Write CSV
    if not all_results:
        print("\nNo results found.")
        return

    fieldnames = ["name","url","file_type","records","columns","source_org",
                  "category","source","login","description","date_found"]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_results)

    print(f"\n{'='*60}")
    print(f"Done. {len(all_results)} results written to: {output_file}")
    print(f"{'='*60}")

    # Summary per category
    from collections import Counter
    by_cat = Counter(r["category"] for r in all_results)
    by_src = Counter(r["source"]   for r in all_results)
    print("\nBy category:")
    for k, v in sorted(by_cat.items()):
        print(f"  {k}: {v}")
    print("\nBy source:")
    for k, v in sorted(by_src.items()):
        print(f"  {k}: {v}")

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Nanu Dataset Scraper — finds CSV/XLSX datasets for Nanu Archive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python nanu_scraper.py --all
  python nanu_scraper.py --category uap --category cryptids
  python nanu_scraper.py --all --sources zenodo,github,ckan
  python nanu_scraper.py --all --sources bing --max 30
  python nanu_scraper.py --all --output datasets_2026.csv

Environment variables:
  BING_SEARCH_API_KEY   Azure Bing Search v7 key (free: 1000 calls/month)
  GITHUB_TOKEN          GitHub personal access token (raises rate limit)
        """,
    )
    parser.add_argument("--all",      action="store_true",
                        help="Scrape all 9 categories")
    parser.add_argument("--category", action="append", dest="categories",
                        choices=list(CATEGORIES.keys()),
                        help="Specific category to scrape (can repeat)")
    parser.add_argument("--sources",  type=str, default=",".join(ALL_SOURCES),
                        help=f"Comma-separated sources. Options: {','.join(ALL_SOURCES)}")
    parser.add_argument("--max",      type=int, default=20,
                        help="Max results per source per category (default: 20)")
    parser.add_argument("--output",   type=str,
                        default=f"nanu_datasets_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
                        help="Output CSV filename")
    parser.add_argument("--delay",    type=float, default=0.5,
                        help="Delay in seconds between source calls (default: 0.5)")

    args = parser.parse_args()

    if not args.all and not args.categories:
        parser.print_help()
        print("\nError: specify --all or at least one --category")
        sys.exit(1)

    cats    = list(CATEGORIES.keys()) if args.all else args.categories
    sources = [s.strip() for s in args.sources.split(",") if s.strip() in ALL_SOURCES]

    if not sources:
        print(f"Error: no valid sources. Valid: {', '.join(ALL_SOURCES)}")
        sys.exit(1)

    print(f"\nNanu Dataset Scraper")
    print(f"{'─'*40}")
    print(f"Categories : {', '.join(cats)}")
    print(f"Sources    : {', '.join(sources)}")
    print(f"Max/source : {args.max}")
    print(f"Output     : {args.output}")
    if not BING_KEY and "bing" in sources:
        print(f"\n⚠  BING_SEARCH_API_KEY not set — Bing searches will be skipped")
        print(f"   Get a free key at portal.azure.com → Bing Search v7 → Free tier")
    if not GITHUB_TOKEN:
        print(f"\n⚠  GITHUB_TOKEN not set — GitHub rate limit is 10 req/min unauthenticated")
        print(f"   Set a token to increase to 30 req/min")
    print()

    run_scraper(
        categories=cats,
        sources=sources,
        output_file=args.output,
        max_per_source=args.max,
        delay=args.delay,
    )

if __name__ == "__main__":
    main()
