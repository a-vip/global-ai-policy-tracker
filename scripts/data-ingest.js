import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const LOCAL_REGULATIONS_PATH = 'C:/AI_Workspace/Obsidian/Avi/sovereign-dashboard/ai-regulations-local.json';
const OUTPUT_REGULATIONS_PATH = path.join(__dirname, '../public/data/unified-regulations.json');
const OUTPUT_SUMMARY_PATH = path.join(__dirname, '../public/data/country-summary.json');

// Helper to fetch JSON from aipolicytracker.org
async function fetchAIPolicyData() {
  return new Promise((resolve, reject) => {
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
            console.warn("Could not find data-page attribute, returning empty array.");
            resolve([]);
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// Convert ISO 2-letter to 3-letter (a small map for common ones, or we can just use 2-letter if we change main.js)
// Actually, sovereign-dashboard uses full country names. 
// We will unify everything with standard IDs. Let's just create a rich array and compute stats.
async function ingestData() {
  console.log('Starting data ingestion...');
  const unified = [];
  let sovereignData = [];

  // 1. Read Local Regulations (Sovereign Dashboard)
  if (fs.existsSync(LOCAL_REGULATIONS_PATH)) {
    try {
      sovereignData = JSON.parse(fs.readFileSync(LOCAL_REGULATIONS_PATH, 'utf8'));
      console.log(`Loaded ${sovereignData.length} records from local sovereign dashboard.`);
      
      // Map to unified schema
      sovereignData.forEach(item => {
        unified.push({
          id: item.id,
          title: item.title,
          country: item.jurisdiction,
          status: item.status,
          date: item.date,
          description: item.description,
          lat: item.lat,
          lon: item.lon,
          sourceType: 'sovereign'
        });
      });
    } catch (e) {
      console.error('Error reading local regulations:', e);
    }
  } else {
    console.warn(`Local regulations file not found at ${LOCAL_REGULATIONS_PATH}`);
  }

  // 2. Fetch AI Policy Tracker Data
  try {
    const aiPolicyData = await fetchAIPolicyData();
    console.log(`Loaded ${aiPolicyData.length} records from AI Policy Tracker.`);
    
    aiPolicyData.forEach(item => {
      unified.push({
        id: `aipolicy-${item.id}`,
        title: item.ai_policy_name,
        country: item.country ? item.country.name : 'Unknown',
        countrySymbol: item.country ? item.country.symbol : null,
        status: item.status ? item.status.name : 'Unknown',
        date: item.formatted_created_at || item.created_at,
        description: item.description,
        governingBody: item.governing_body,
        sourceType: 'aipolicytracker'
      });
    });
  } catch (e) {
    console.error('Error fetching AI Policy Tracker data:', e);
  }

  // 3. Process and Output
  console.log(`Total unified records: ${unified.length}`);
  
  // Create country summary for coloring
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

  // Calculate overall stance per country
  Object.keys(countrySummary).forEach(c => {
    const counts = countrySummary[c].statusCounts;
    let mainStatus = 'Unregulated';
    
    // Simplistic heuristic for map coloring
    if (counts['Banned'] || counts['Passed']) mainStatus = 'Regulated';
    if (counts['In effect'] || counts['launched']) mainStatus = 'Regulated';
    if (counts['Proposed'] || counts['development']) mainStatus = 'Proposed';
    if (counts['Banned'] && counts['Banned'] > 0) mainStatus = 'Banned'; // Override if explicitly banned
    
    countrySummary[c].overallStance = mainStatus;
  });

  // Write outputs
  fs.writeFileSync(OUTPUT_REGULATIONS_PATH, JSON.stringify(unified, null, 2));
  fs.writeFileSync(OUTPUT_SUMMARY_PATH, JSON.stringify(countrySummary, null, 2));
  
  console.log(`Wrote unified data to ${OUTPUT_REGULATIONS_PATH}`);
  console.log(`Wrote summary data to ${OUTPUT_SUMMARY_PATH}`);
}

ingestData().catch(console.error);
