import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'raw-asenion.txt');
const outputPath = path.join(__dirname, '../public/data/asenion-updates.json');

const rawText = fs.readFileSync(inputPath, 'utf8');
const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

const updates = [];
let currentDate = 'Unknown Date';

const usStates = ['California', 'CA', 'Colorado', 'Connecticut', 'Minnesota', 'Pennsylvania', 'Maine', 'New Hampshire', 'New York', 'Washington', 'Alabama', 'Ohio', 'Arizona', 'Georgia', 'Hawaii', 'Iowa', 'Idaho', 'Maryland', 'Oregon', 'Wisconsin', 'Oklahoma', 'Florida', 'Texas', 'TX', 'New Mexico', 'Louisiana', 'New Jersey', 'Mississippi', 'Utah', 'Virginia', 'Vermont', 'Illinois', 'Rhode Island', 'Michigan', 'Montana', 'Delaware', 'Kentucky'];
const usCities = ['Albuquerque', 'Pittsburgh'];
const commonCountries = ['Japan', 'Thailand', 'Vietnam', 'Malaysia', 'Philippines', 'Indonesia', 'Australia', 'Oman', 'Qatar', 'Jordan', 'Lebanon', 'Türkiye', 'Turkiye', 'Bangladesh', 'India', 'Serbia', 'Slovakia', 'Hungary', 'Austria', 'Italy', 'Poland', 'Ukraine', 'Czech Republic', 'Germany', 'Russia', 'Lithuania', 'Estonia', 'Finland', 'Norwegian', 'Norway', 'Denmark', 'Spain', 'Portuguese', 'Portugal', 'Luxembourg', 'Belgium', 'Netherlands', 'Ireland', 'Sweden', 'France', 'Uruguay', 'Argentina', 'Chile', 'Brazil', 'Colombia', 'Canada', 'Pan-Canadian', 'USA', 'US', 'U.S.', 'Mexico', 'Liechtenstein', 'UK', 'U.K.', 'EU', 'European Union', 'South Korea', 'China', 'Taiwan', 'United Arab Emirates', 'Pakistan', 'South Africa', 'Uzbekistan', 'Peru', 'Rwanda', 'Tunisia', 'Tanzania', 'Uganda', 'Zambia', 'Benin', 'Botswana', 'Egypt', 'Ghana', 'Ethiopia', 'Morocco', 'Algeria', 'Mauritania', 'Chad', 'Niger', 'Mali', 'Togo', 'Cote D\'Ivoire', 'Guinea', 'Cabo Verde', 'Sao Tome', 'Equatorial Guinea', 'Angola', 'Mauritius', 'Madagascar', 'Zimbabwe', 'Lesotho', 'Eswatini', 'Seychelles', 'African Union', 'Jamaica'];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.startsWith('As of ') && line.includes('updates include:')) {
    const dateMatch = line.match(/As of (.*?), updates include:/);
    if (dateMatch && dateMatch[1]) {
      currentDate = dateMatch[1];
      if (currentDate.includes('February 31')) currentDate = currentDate.replace('February 31', 'February 28');
      if (currentDate.includes('November 31')) currentDate = currentDate.replace('November 31', 'November 30');
      if (currentDate.includes('April 31')) currentDate = currentDate.replace('April 31', 'April 30');
    }
    continue;
  }
  
  let parts = line.split(/\s+-\s+|-(?=\s)/);
  let countryOrJurisdiction = '';
  let titleStr = '';
  
  if (parts.length >= 2) {
    countryOrJurisdiction = parts[0].trim();
    titleStr = parts.slice(1).join(' - ').trim();
  } else {
    // Try to find a country at the start
    let found = false;
    const allRegions = [...usStates, ...usCities, ...commonCountries];
    for (const region of allRegions) {
      if (line.toLowerCase().startsWith(region.toLowerCase() + "'s ") || line.toLowerCase().startsWith(region.toLowerCase() + ' ')) {
        countryOrJurisdiction = region;
        titleStr = line;
        found = true;
        break;
      }
    }
    if (!found) {
      // Look for "The [country]"
      for (const region of allRegions) {
        if (line.toLowerCase().includes(' ' + region.toLowerCase() + ' ') || line.toLowerCase().includes(' ' + region.toLowerCase() + "'s")) {
           countryOrJurisdiction = region;
           titleStr = line;
           found = true;
           break;
        }
      }
    }
    if (!found) {
       countryOrJurisdiction = 'Unknown';
       titleStr = line;
    }
  }

  let mappedCountry = countryOrJurisdiction;
  if (usStates.includes(countryOrJurisdiction) || usCities.includes(countryOrJurisdiction) || ['USA', 'US', 'U.S.', 'United State of America', 'United States of America'].includes(countryOrJurisdiction)) {
    mappedCountry = 'United States';
  } else if (['UK', 'U.K.'].includes(countryOrJurisdiction)) {
    mappedCountry = 'United Kingdom';
  } else if (['EU', 'European Union'].includes(countryOrJurisdiction)) {
    mappedCountry = 'European Union';
  } else if (countryOrJurisdiction === 'Turkiye') {
    mappedCountry = 'Türkiye';
  } else if (countryOrJurisdiction === 'Pan-Canadian') {
    mappedCountry = 'Canada';
  } else if (countryOrJurisdiction === 'Norwegian') {
    mappedCountry = 'Norway';
  } else if (countryOrJurisdiction === 'Portuguese') {
    mappedCountry = 'Portugal';
  }
  
  let status = 'Policy';
  let titleLower = titleStr.toLowerCase() + " " + line.toLowerCase();
  
  if (titleLower.includes('- enacted') || titleLower.includes(' enacted') || titleLower.includes('passed') || titleLower.includes('in effect') || titleLower.includes('signed into law') || titleLower.includes('adopted')) {
    status = 'Enacted';
  } else if (titleLower.includes('proposed') || titleLower.includes('draft') || titleLower.includes('bill')) {
    status = 'Proposed';
  } else if (titleLower.includes('banned') || titleLower.includes('moratorium')) {
    status = 'Banned';
  } else if (titleLower.includes('strategy') || titleLower.includes('guidelines') || titleLower.includes('framework') || titleLower.includes('policy')) {
    status = 'Policy'; // Yellow / Purple mapping can happen later, but we'll use Proposed or Policy
  }
  
  let cleanTitle = titleStr.replace(/- Enacted|- Proposed|- Passed|- In Effect|Passed the Assembly|Passed|\[revoked\]/gi, '').trim();

  updates.push({
    id: 'asenion-' + Math.random().toString(36).substr(2, 9),
    title: cleanTitle.length > 5 ? cleanTitle : line, // Fallback if cleanTitle is too short
    country: mappedCountry,
    status: status,
    date: new Date(currentDate).toISOString() || currentDate,
    description: 'Source: Asenion Global AI Regulation Tracker Updates',
    sourceType: 'asenion'
  });
}

fs.writeFileSync(outputPath, JSON.stringify(updates, null, 2));
console.log(`Successfully parsed ${updates.length} updates to ${outputPath}`);
