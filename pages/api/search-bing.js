export const config = { api: { bodyParser: true } };

// Bing Web Search API v7
// Get your key at: https://portal.azure.com → Cognitive Services → Bing Search v7
// Add BING_SEARCH_API_KEY to your Vercel environment variables

const SEARCH_QUERIES = {
  uap: [
    'UFO sightings database filetype:csv',
    'UAP reports dataset filetype:csv',
    'unidentified aerial phenomena data filetype:xlsx',
    'UFO sightings open data CSV download',
  ],
  nhi: [
    'alien encounter reports dataset filetype:csv',
    'non-human intelligence contact data filetype:csv',
    'extraterrestrial encounter database CSV',
  ],
  cryptids: [
    'bigfoot sightings database filetype:csv',
    'cryptid sightings dataset filetype:csv',
    'cryptozoology reports open data CSV',
    'unknown animal sightings database download',
  ],
  paranormal: [
    'paranormal events dataset filetype:csv',
    'ghost sightings database filetype:csv',
    'psychical research data filetype:xlsx',
    'parapsychology experiment results dataset',
  ],
  consciousness: [
    'near death experience dataset filetype:csv',
    'NDE research data download filetype:csv',
    'out of body experience database CSV',
    'consciousness research dataset open access',
  ],
  myths_history: [
    'world mythology dataset filetype:csv',
    'folklore database download filetype:csv',
    'ancient history oral traditions data CSV',
    'mythology motif database filetype:xlsx',
  ],
  ritual_occult: [
    'witchcraft trials dataset filetype:csv',
    'occult practices research data filetype:csv',
    'witch trial records database CSV download',
    'historical ritual records dataset',
  ],
  natural_phenomena: [
    'atmospheric anomaly dataset filetype:csv',
    'ball lightning reports database filetype:csv',
    'anomalous natural phenomena data CSV',
    'meteor fireball database download filetype:csv',
  ],
  fortean: [
    'fortean phenomena database filetype:csv',
    'unexplained events dataset filetype:csv',
    'anomalous occurrences data CSV download',
    'strange phenomena reports database',
  ],
};

function extractFileType(url, snippet) {
  const urlLower = url.toLowerCase();
  if (urlLower.endsWith('.xlsx') || urlLower.includes('.xlsx?')) return 'xlsx';
  if (urlLower.endsWith('.xls')  || urlLower.includes('.xls?'))  return 'xlsx';
  if (urlLower.endsWith('.csv')  || urlLower.includes('.csv?'))  return 'csv';
  if (urlLower.endsWith('.tsv')  || urlLower.includes('.tsv?'))  return 'csv';
  const snip = (snippet || '').toLowerCase();
  if (snip.includes('xlsx') || snip.includes('spreadsheet')) return 'xlsx';
  return 'csv';
}

function extractSourceOrg(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const parts = host.split('.');
    // Return something readable
    if (host.includes('github'))        return 'GitHub';
    if (host.includes('zenodo'))        return 'Zenodo';
    if (host.includes('kaggle'))        return 'Kaggle';
    if (host.includes('data.gov'))      return 'data.gov';
    if (host.includes('europa.eu'))     return 'data.europa.eu';
    if (host.includes('ncei.noaa'))     return 'NOAA';
    if (host.includes('usgs'))          return 'USGS';
    if (host.includes('nasa'))          return 'NASA';
    if (host.includes('figshare'))      return 'Figshare';
    if (host.includes('osf.io'))        return 'OSF';
    if (host.includes('dataverse'))     return 'Harvard Dataverse';
    if (host.includes('mendeley'))      return 'Mendeley Data';
    if (host.includes('huggingface'))   return 'Hugging Face';
    if (host.includes('ncbi') || host.includes('pubmed')) return 'NCBI / PubMed';
    if (host.includes('arxiv'))         return 'arXiv';
    return parts.slice(-2).join('.'); // fallback: domain.tld
  } catch {
    return 'Unknown';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { catId, queryIndex = 0 } = req.body;
  if (!catId) return res.status(400).json({ error: 'Missing catId' });

  const apiKey = process.env.BING_SEARCH_API_KEY;
  if (!apiKey) return res.status(500).json({
    error: 'BING_SEARCH_API_KEY not set. Get a free key at portal.azure.com → Bing Search v7',
    items: [],
  });

  const queries     = SEARCH_QUERIES[catId] || [`${catId} dataset filetype:csv`];
  const query       = queries[queryIndex % queries.length];
  const totalQueries= queries.length;

  try {
    const params = new URLSearchParams({
      q:           query,
      count:       '10',
      offset:      '0',
      mkt:         'en-US',
      safeSearch:  'Moderate',
      responseFilter: 'Webpages',
    });

    const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ error: `Bing API ${response.status}: ${errText}`, items: [], query });
    }

    const data   = await response.json();
    const pages  = data.webPages?.value || [];

    const items = pages.map(page => ({
      name:       page.name || 'Untitled',
      url:        page.url,
      file_type:  extractFileType(page.url, page.snippet),
      records:    'unknown',
      columns:    [],
      source_org: extractSourceOrg(page.url),
      login:      false,
      platform:   'bing',
      description:(page.snippet || '').slice(0, 150),
      query,
    }));

    return res.status(200).json({
      items,
      query,
      queryIndex,
      totalQueries,
      nextQueryIndex: (queryIndex + 1) % totalQueries,
      hasMore: queryIndex < totalQueries - 1,
    });

  } catch (err) {
    return res.status(200).json({ error: err.message, items: [], query });
  }
}
