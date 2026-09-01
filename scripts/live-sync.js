import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_REGULATIONS_PATH = path.join(__dirname, '../public/data/unified-regulations.json');
const OUTPUT_SUMMARY_PATH = path.join(__dirname, '../public/data/country-summary.json');
const ASENION_UPDATES_PATH = path.join(__dirname, '../public/data/asenion-updates.json');

function cleanCdata(str) {
  if (!str) return '';
  return str.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

async function fetchGoogleMyMapsKML() {
  return new Promise((resolve, reject) => {
    const url = 'https://www.google.com/maps/d/kml?mid=1grbvr9Ic-qJ-LTC9DHqpdzi2M-mtxl4&forcekml=1';
    console.log('Fetching live Google My Maps KML from:', url);
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (!data.includes('<Placemark>')) {
          reject(new Error('Invalid KML fetched'));
          return;
        }
        resolve(data);
      });
    }).on('error', reject);
  });
}

// Fetch AI Policy Tracker Data
async function fetchAIPolicyData() {
  return new Promise((resolve) => {
    https.get('https://aipolicytracker.org/', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const match = data.match(/data-page="([^"]+)"/);
          if (match && match[1]) {
            const decodedStr = match[1].replace(/&quot;/g, '"');
            const pageData = JSON.parse(decodedStr);
            resolve(pageData.props.tableData.data || []);
          } else {
            resolve([]);
          }
        } catch (err) {
          console.warn('Could not parse aipolicytracker data:', err);
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function categorizeArea(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  if (text.includes('generative ai') || text.includes('llm') || text.includes('foundation model') || text.includes('chatgpt') || text.includes('synthetic')) return 'Generative AI';
  if (text.includes('data') || text.includes('privacy') || text.includes('internet') || text.includes('advertising') || text.includes('gdpr') || text.includes('cookie') || text.includes('cyber') || text.includes('security')) return 'Data, Internet, Privacy, and Advertising';
  if (text.includes('employ') || text.includes('work') || text.includes('labor') || text.includes('hire') || text.includes('job') || text.includes('recruit')) return 'Employment';
  if (text.includes('military') || text.includes('defense') || text.includes('weapon') || text.includes('government') || text.includes('public sector') || text.includes('agency') || text.includes('lethal')) return 'Government and Military';
  if (text.includes('health') || text.includes('medical') || text.includes('patient') || text.includes('clinical') || text.includes('hospital')) return 'Health';
  if (text.includes('financ') || text.includes('insur') || text.includes('bank') || text.includes('credit')) return 'Financial and Insurance';
  if (text.includes('education') || text.includes('school') || text.includes('transport') || text.includes('vehicle')) return 'Other';
  return 'General';
}

async function buildLiveDataset() {
  console.log('--- Starting Live Data Ingest ---');
  const unified = [];
  
  // 1. Fetch and Parse Google My Maps Live KML
  try {
    const kml = await fetchGoogleMyMapsKML();
    const folderRegex = /<Folder>([\s\S]*?)<\/Folder>/g;
    let folderMatch;
    let index = 0;

    while ((folderMatch = folderRegex.exec(kml))) {
      const folderContent = folderMatch[1];
      const folderNameMatch = folderContent.match(/<name>(.*?)<\/name>/);
      const rawArea = folderNameMatch ? folderNameMatch[1] : 'General';
      const area = cleanCdata(rawArea);

      const localPlacemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
      let placemarkMatch;

      while ((placemarkMatch = localPlacemarkRegex.exec(folderContent))) {
        const placemarkContent = placemarkMatch[1];
        const nameMatch = placemarkContent.match(/<name>(.*?)<\/name>/);
        if (!nameMatch) continue;
        const rawName = cleanCdata(nameMatch[1]);

        const splitMatch = rawName.split(/\s+[-–—]\s+/);
        let jurisdiction = 'Global';
        let title = rawName;

        if (splitMatch.length > 1) {
          jurisdiction = splitMatch[0].trim();
          title = splitMatch.slice(1).join(' - ').trim();
        }

        const descMatch = placemarkContent.match(/<description>(.*?)<\/description>/);
        const rawDesc = descMatch ? cleanCdata(descMatch[1]) : '';

        // Extract direct source URL from description
        let sourceUrl = '';
        let sourceName = 'Official Source';
        const urlMatch = rawDesc.match(/https?:\/\/[^\s<)"']+/i);
        if (urlMatch) {
          sourceUrl = urlMatch[0];
          try {
            sourceName = new URL(sourceUrl).hostname.replace(/^www\./, '');
          } catch (e) {
            sourceName = 'Official Legislation';
          }
        } else {
          sourceUrl = `https://www.google.com/search?q=${encodeURIComponent((jurisdiction !== 'Global' ? jurisdiction + ' ' : '') + title + ' official legislation source')}`;
          sourceName = 'Legislation Source';
        }

        // Status from KML icon color
        const styleMatch = placemarkContent.match(/<styleUrl>#(.*?)<\/styleUrl>/);
        const styleUrl = styleMatch ? styleMatch[1] : '';
        let status = 'Proposed';
        if (styleUrl.includes('0F9D58')) status = 'In effect';
        else if (styleUrl.includes('0288D1')) status = 'Passed';
        else if (styleUrl.includes('FFEA00') || styleUrl.includes('FFD600') || styleUrl.includes('FBC02D')) status = 'Proposed';
        else if (styleUrl.includes('673AB7')) status = 'Policy';
        else if (styleUrl.includes('C2185B') || styleUrl.includes('E65100')) status = 'Policy';

        // Authentic Coordinates from KML
        const coordMatch = placemarkContent.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
        if (!coordMatch) continue;
        const coordStr = coordMatch[1].trim();
        const coordParts = coordStr.split(',');
        if (coordParts.length < 2) continue;

        const lon = parseFloat(coordParts[0]);
        const lat = parseFloat(coordParts[1]);
        if (isNaN(lon) || isNaN(lat)) continue;

        // Date extraction
        let date = '2026-05-15';
        const yearMatch = title.match(/\b(201\d|202\d)\b/);
        if (yearMatch) {
          date = `${yearMatch[1]}-01-01`;
        }

        // Clean user-readable summary
        let summary = rawDesc.replace(/https?:\/\/[^\s<)"']+/gi, '').trim();
        if (!summary || summary.length < 5) {
          summary = `Official regulatory policy, legal framework, and governance requirements for ${title} in ${jurisdiction}.`;
        }

        unified.push({
          id: `reg-kml-${index++}`,
          title: `${jurisdiction} - ${title}`,
          country: jurisdiction,
          status: status,
          area: area || categorizeArea(title, summary),
          date: date,
          description: summary,
          sourceUrl: sourceUrl,
          sourceName: sourceName,
          lat: lat,
          lon: lon,
          sourceType: 'sovereign'
        });
      }
    }
    console.log(`Ingested ${unified.length} authentic placemarks from Google My Maps.`);
  } catch (err) {
    console.error('Error fetching Google My Maps KML:', err);
  }

  // 2. Read Asenion Updates (with dates & country preservation)
  if (fs.existsSync(ASENION_UPDATES_PATH)) {
    try {
      const asenionData = JSON.parse(fs.readFileSync(ASENION_UPDATES_PATH, 'utf8'));
      console.log(`Loaded ${asenionData.length} records from Asenion updates.`);
      asenionData.forEach(item => {
        let dateStr = item.date;
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
        }

        const area = item.area || categorizeArea(item.title, item.description);
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent((item.country && item.country !== 'Global' ? item.country + ' ' : '') + item.title + ' legislation AI')}`;
        
        unified.push({
          id: item.id,
          title: item.title,
          country: item.country || 'Global',
          status: item.status || 'Policy',
          date: dateStr || '2026-05-30',
          area: area,
          description: item.description && !item.description.startsWith('Source:') ? item.description : `Tracked AI policy update for ${item.country || 'Global'}: ${item.title}.`,
          sourceUrl: searchUrl,
          sourceName: 'Asenion & Official Legislation',
          lat: null, // Keep null to not pollute with fake pin coordinates!
          lon: null,
          sourceType: 'asenion'
        });
      });
    } catch (e) {
      console.error('Error reading Asenion data:', e);
    }
  }

  // 3. Ingest AI Policy Tracker Data
  try {
    const aiPolicyData = await fetchAIPolicyData();
    console.log(`Loaded ${aiPolicyData.length} records from AI Policy Tracker.`);
    aiPolicyData.forEach(item => {
      let dateStr = item.formatted_created_at || item.created_at;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
      }

      const country = item.country ? item.country.name : 'Global';
      const cleanDesc = (item.description || '').replace(/<[^>]*>/g, '').replace(/&#039;/g, "'").replace(/&quot;/g, '"');
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(country + ' ' + item.ai_policy_name + ' official AI legislation')}`;

      unified.push({
        id: `aipolicy-${item.id}`,
        title: item.ai_policy_name,
        country: country,
        status: item.status ? item.status.name : 'Policy',
        date: dateStr || '2025-01-01',
        area: categorizeArea(item.ai_policy_name, cleanDesc),
        description: cleanDesc || `National Artificial Intelligence strategy and policy framework for ${country}.`,
        sourceUrl: 'https://aipolicytracker.org',
        sourceName: 'AI Policy Tracker',
        lat: null,
        lon: null,
        sourceType: 'aipolicytracker'
      });
    });
  } catch (e) {
    console.error('Error fetching AI Policy Tracker data:', e);
  }

  console.log(`Total live dataset: ${unified.length} records.`);

  // 4. Calculate Country Summary
  const countrySummary = {};
  unified.forEach(reg => {
    if (!reg.country || reg.country === 'Global' || reg.country === 'Unknown') return;
    const c = reg.country;
    if (!countrySummary[c]) {
      countrySummary[c] = {
        count: 0,
        statusCounts: {}
      };
    }
    countrySummary[c].count++;
    const s = reg.status;
    countrySummary[c].statusCounts[s] = (countrySummary[c].statusCounts[s] || 0) + 1;
  });

  Object.keys(countrySummary).forEach(c => {
    const counts = countrySummary[c].statusCounts;
    let mainStatus = 'Policy';
    let inEffect = 0, passed = 0, proposed = 0, policy = 0, banned = 0;

    Object.keys(counts).forEach(k => {
      const s = k.toLowerCase();
      if (s.includes('ban')) banned += counts[k];
      else if (s.includes('effect') || s.includes('enact') || s.includes('regulat') || s.includes('adopt')) inEffect += counts[k];
      else if (s.includes('pass')) passed += counts[k];
      else if (s.includes('propos') || s.includes('draft') || s.includes('bill')) proposed += counts[k];
      else policy += counts[k];
    });

    if (banned > 0) mainStatus = 'Banned';
    else if (inEffect > 0) mainStatus = 'In Effect';
    else if (passed > 0) mainStatus = 'Passed';
    else if (proposed > 0) mainStatus = 'Proposed';
    else mainStatus = 'Policy';

    countrySummary[c].overallStance = mainStatus;
  });

  // Write outputs to public and docs
  fs.writeFileSync(OUTPUT_REGULATIONS_PATH, JSON.stringify(unified, null, 2));
  fs.writeFileSync(OUTPUT_SUMMARY_PATH, JSON.stringify(countrySummary, null, 2));
  
  const DOCS_REGS = path.join(__dirname, '../docs/data/unified-regulations.json');
  const DOCS_SUMMARY = path.join(__dirname, '../docs/data/country-summary.json');
  if (fs.existsSync(path.dirname(DOCS_REGS))) {
    fs.writeFileSync(DOCS_REGS, JSON.stringify(unified, null, 2));
    fs.writeFileSync(DOCS_SUMMARY, JSON.stringify(countrySummary, null, 2));
  }

  console.log(`Successfully generated and synced ${unified.length} records!`);
}

buildLiveDataset().catch(console.error);
