export const CATEGORIES = [
  { id: "uap",               label: "UFO / UAP",           color: "#1FC2C2", icon: "◈" },
  { id: "nhi",               label: "NHI",                 color: "#0EA5E9", icon: "◉" },
  { id: "cryptids",          label: "Cryptids",            color: "#16A34A", icon: "◎" },
  { id: "paranormal",        label: "Paranormal",          color: "#9333EA", icon: "◇" },
  { id: "consciousness",     label: "Consciousness",       color: "#EC4899", icon: "○" },
  { id: "myths_history",     label: "Myths & History",     color: "#F59E0B", icon: "△" },
  { id: "ritual_occult",     label: "Ritual / Occult",     color: "#DC2626", icon: "✦" },
  { id: "natural_phenomena", label: "Natural Phenomena",   color: "#10B981", icon: "◬" },
  { id: "fortean",           label: "Other / Fortean",     color: "#6B7280", icon: "◌" },
];

export const SEEDS = {
  uap: [
    { name: "NUFORC Sightings — Scraped & Geocoded", url: "https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv", file_type: "csv", records: "~80,000", columns: ["datetime","city","state","country","shape","duration_seconds","comments","latitude","longitude"], source_org: "NUFORC / GitHub", login: false },
    { name: "Project Blue Book Cases — TSV", url: "https://raw.githubusercontent.com/sethblack/python-ufo/master/data/ufo_awesome.tsv", file_type: "csv", records: "~61,000", columns: ["sighted_at","reported_at","location","shape","duration","description"], source_org: "Blue Book Archive / GitHub", login: false },
    { name: "UK MoD UFO Files Index", url: "https://raw.githubusercontent.com/dieghernan/ukufo/master/data/ufo_uk.csv", file_type: "csv", records: "~11,000", columns: ["date","time","location","county","country","description","source_file"], source_org: "UK National Archives / GitHub", login: false },
    { name: "UFO Sightings 1910–2014 — Kaggle", url: "https://www.kaggle.com/datasets/NUFORC/ufo-sightings/download", file_type: "csv", records: "~80,000", columns: ["datetime","city","state","country","shape","duration_seconds","comments","latitude","longitude"], source_org: "Kaggle / NUFORC", login: true },
    { name: "AARO Historical UAP Reports", url: "https://aaro.mil/Reporting/Historical-Report/", file_type: "csv", records: "~800+", columns: ["report_id","date","location","description","resolution","classification"], source_org: "AARO / DoD", login: false },
  ],
  nhi: [
    { name: "FREE Foundation Experiencer Survey Wave 1", url: "https://www.experiencer.org/survey-data-executive-summary/", file_type: "csv", records: "~3,000", columns: ["respondent_id","encounter_type","entity_type","location","year","physical_effects","psychological_effects"], source_org: "FREE Foundation", login: false },
    { name: "MUFON Close Encounter Cases — Kaggle", url: "https://www.kaggle.com/datasets/jonathanbouchet/mufon-reports/download", file_type: "csv", records: "~70,000", columns: ["id","date","city","state","country","shape","summary","duration","disposition","latitude","longitude"], source_org: "MUFON / Kaggle", login: true },
  ],
  cryptids: [
    { name: "BFRO Bigfoot Sightings — Geocoded CSV", url: "https://raw.githubusercontent.com/bfro/bfro-report-data/master/bfro_reports_geocoded.csv", file_type: "csv", records: "~5,000", columns: ["number","title","classification","timestamp","latitude","longitude","state","county","observed","season"], source_org: "BFRO / GitHub", login: false },
    { name: "BFRO Reports — Kaggle", url: "https://www.kaggle.com/datasets/josephvm/bigfoot-sightings-data/download", file_type: "csv", records: "~4,600", columns: ["observed","classification","county","state","season","month","latitude","longitude","title","date"], source_org: "BFRO / Kaggle", login: true },
    { name: "Cryptid Sightings Compiled", url: "https://raw.githubusercontent.com/aaronpenne/data_collection/master/cryptids/cryptid_sightings.csv", file_type: "csv", records: "~2,000", columns: ["id","creature","date","state","country","description","source"], source_org: "Community compiled / GitHub", login: false },
  ],
  paranormal: [
    { name: "Rhine Centre Psi Experiment Database", url: "https://www.rhine.org/wp-content/uploads/rhine_data.xlsx", file_type: "xlsx", records: "~2,400", columns: ["study_id","year","researcher","psi_type","hits","trials","hit_rate","p_value"], source_org: "Rhine Research Center", login: false },
    { name: "Parapsychology Research Meta-Analysis — Zenodo", url: "https://zenodo.org/record/3935165/files/parapsychology_meta_analysis.csv", file_type: "csv", records: "~800", columns: ["study_id","year","author","effect_type","effect_size","sample_size","p_value","methodology"], source_org: "Zenodo", login: false },
    { name: "Global Consciousness Project Event Dataset", url: "https://noosphere.princeton.edu/eggs/data/events.csv", file_type: "csv", records: "~500 events", columns: ["event_id","name","date","category","z_score","p_value","hypothesis","result"], source_org: "Princeton GCP", login: false },
  ],
  consciousness: [
    { name: "NDERF Near Death Experiences — Structured CSV", url: "https://raw.githubusercontent.com/nderf-data/nde-structured/master/nde_cases.csv", file_type: "csv", records: "~5,000", columns: ["nde_id","year","country","gender","age","nde_score","elements_present","life_review","tunnel","light","return_reason"], source_org: "NDERF / GitHub", login: false },
    { name: "CIA Stargate Project — Declassified FOIA CSV", url: "https://raw.githubusercontent.com/openai-research/stargate-data/master/stargate_sessions.csv", file_type: "csv", records: "~800", columns: ["session_id","date","viewer","target","methodology","accuracy_rating","analyst","notes"], source_org: "CIA FOIA / Compiled", login: false },
    { name: "Global Consciousness Project — GCP EGG Data", url: "https://noosphere.princeton.edu/eggs/data/gcp_data_export.csv", file_type: "csv", records: "~500 events", columns: ["event_id","event_name","start_time","end_time","z_score","p_value","description"], source_org: "GCP / Princeton", login: false },
  ],
  myths_history: [
    { name: "D-PLACE Cultural & Mythological Database", url: "https://raw.githubusercontent.com/D-PLACE/dplace-data/master/societies.csv", file_type: "csv", records: "~1,500 societies", columns: ["id","pref_name","latitude","longitude","language_family","region","subregion"], source_org: "D-PLACE / Max Planck Institute", login: false },
    { name: "Berezkin Mythology Motif Database", url: "https://raw.githubusercontent.com/D-PLACE/dplace-data/master/datasets/berezkin/data.csv", file_type: "csv", records: "~50,000", columns: ["soc_id","var_id","code","comment","references"], source_org: "Berezkin / D-PLACE", login: false },
    { name: "CDLI Cuneiform Texts — Catalogue CSV", url: "https://cdli.mpiwg-berlin.mpg.de/dl/data/cdli_catalogue_1of2.csv", file_type: "csv", records: "~340,000", columns: ["id_text","composite_no","museum_no","period","provenience","genre","subgenre","object_type"], source_org: "Cuneiform Digital Library Initiative", login: false },
  ],
  ritual_occult: [
    { name: "Survey of Scottish Witchcraft — Full Database", url: "https://witches.shca.ed.ac.uk/index.cfm?fuseaction=home.downloaddata", file_type: "xlsx", records: "~3,837 accused", columns: ["accusedref","accusedname","sex","age","res_county","res_parish","occupation","verdict","torture","execution"], source_org: "University of Edinburgh", login: false },
    { name: "Historical Witch Trials — Europe Dataset", url: "https://raw.githubusercontent.com/melaniewalsh/Intro-Cultural-Analytics/master/book/data/witchcraft/witchcraft.csv", file_type: "csv", records: "~1,500", columns: ["id","year","country","region","accused_name","sex","verdict","accusation_type","source"], source_org: "Open Cultural Analytics / GitHub", login: false },
    { name: "ARDA Religious Traditions Survey Data", url: "https://www.thearda.com/data-archive?fid=NSRV2008", file_type: "csv", records: "~3,000", columns: ["id","country","tradition","practice_type","frequency","belief_score","ritual_involvement","esoteric_interest"], source_org: "Association of Religion Data Archives", login: false },
  ],
  natural_phenomena: [
    { name: "USGS Earthquake Catalog — Live Monthly CSV", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.csv", file_type: "csv", records: "~10,000/month", columns: ["time","latitude","longitude","depth","mag","magType","id","updated","place","type"], source_org: "USGS Earthquake Hazards Program", login: false },
    { name: "AMS Fireball / Meteor Reports", url: "https://fireball.amsmeteors.org/members/imo_view/browse_events?view=list&export=csv", file_type: "csv", records: "~120,000+", columns: ["event_id","date","time_utc","country","state","witnesses","magnitude","duration","sonic_boom","latitude","longitude"], source_org: "American Meteor Society", login: false },
    { name: "NOAA Storm Events Database", url: "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/", file_type: "csv", records: "~1.8M events", columns: ["begin_yearmonth","begin_day","episode_id","event_id","state","event_type","magnitude","deaths_direct","damage_property"], source_org: "NOAA NCEI", login: false },
    { name: "NASA Fireball & Bolide Reports", url: "https://cneos.jpl.nasa.gov/fireballs/fireballs.csv", file_type: "csv", records: "~1,000+", columns: ["date","energy_GJ","impact_energy","lat","lon","alt_km","vel_km/s"], source_org: "NASA JPL CNEOS", login: false },
  ],
  fortean: [
    { name: "The Hum Reports — Global Data Export", url: "https://www.thehum.info/uploads/hum_reports_export.csv", file_type: "csv", records: "~12,000", columns: ["report_id","date","latitude","longitude","country","city","description","frequency_hz","intensity","duration"], source_org: "The Hum / Dr. Glen MacPherson", login: false },
    { name: "Charles Fort Anomalies Index — Structured CSV", url: "https://raw.githubusercontent.com/fort-data/fort-index/master/fort_cases.csv", file_type: "csv", records: "~2,500", columns: ["id","book","chapter","year","location","phenomenon_type","description","source_publication"], source_org: "Fort Data Project / GitHub", login: false },
    { name: "Fortean Events Compiled", url: "https://raw.githubusercontent.com/fortean-data/events/master/fortean_events.csv", file_type: "csv", records: "~4,000", columns: ["id","date","country","region","category","phenomenon","description","source","reliability_score"], source_org: "Community compiled / GitHub", login: false },
  ],
};
