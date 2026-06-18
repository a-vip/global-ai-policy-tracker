import './style.css';

// DOM Elements
const infoPanel = document.getElementById('info-panel');
const closePanelBtn = document.getElementById('close-panel');
const countryNameEl = document.getElementById('country-name');
const policyStatusEl = document.getElementById('policy-status');
const policyDescEl = document.getElementById('policy-desc');
const policyLinksEl = document.getElementById('policy-links');

// Map Initialization
const map = L.map('map', {
  center: [20, 0],
  zoom: 3,
  minZoom: 2,
  maxBounds: [
    [-90, -180],
    [90, 180]
  ],
  maxBoundsViscosity: 1.0,
  zoomControl: false // We'll add it manually to position it better
});

L.control.zoom({
  position: 'bottomright'
}).addTo(map);

// Design Tokens (Matching CSS)
const colors = {
  Banned: '#ef4444',
  Regulated: '#f59e0b',
  Unregulated: '#6b7280',
  Default: '#1f2937',
  Hover: '#ffffff',
  Border: '#374151'
};

// Global Data
let policyData = {};
let geojsonLayer;

// Initialize App
async function init() {
  try {
    // Fetch Policies
    const policyRes = await fetch('./data/policies.json');
    policyData = await policyRes.json();

    // Fetch GeoJSON map boundaries
    const geoRes = await fetch('./data/countries.geo.json');
    const geoData = await geoRes.json();

    // Add GeoJSON to Map
    geojsonLayer = L.geoJSON(geoData, {
      style: getFeatureStyle,
      onEachFeature: onEachFeature
    }).addTo(map);

  } catch (err) {
    console.error("Failed to load map data:", err);
  }
}

// Styling features based on policy status
function getFeatureStyle(feature) {
  const countryCode = feature.id; // e.g., "USA", "CHN"
  const policy = policyData[countryCode];
  
  let fillColor = colors.Default;
  if (policy) {
    if (policy.status === 'Banned') fillColor = colors.Banned;
    else if (policy.status === 'Regulated') fillColor = colors.Regulated;
    else if (policy.status === 'Unregulated') fillColor = colors.Unregulated;
  }

  return {
    fillColor: fillColor,
    weight: 1,
    opacity: 1,
    color: colors.Border,
    fillOpacity: 0.8
  };
}

// Interaction Listeners
function onEachFeature(feature, layer) {
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: showCountryDetails
  });
}

function highlightFeature(e) {
  const layer = e.target;
  const currentStyle = getFeatureStyle(layer.feature);
  
  // Highlight with a slight brightness boost or border change
  layer.setStyle({
    weight: 2,
    color: colors.Hover,
    fillOpacity: 1
  });

  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function resetHighlight(e) {
  geojsonLayer.resetStyle(e.target);
}

function showCountryDetails(e) {
  const feature = e.target.feature;
  const countryCode = feature.id;
  const countryName = feature.properties.name;
  const policy = policyData[countryCode];

  // Populate Panel
  countryNameEl.textContent = countryName;
  
  if (policy) {
    policyStatusEl.textContent = policy.status;
    policyStatusEl.style.backgroundColor = policy.statusColor;
    policyStatusEl.style.color = '#fff';
    policyDescEl.textContent = policy.description;
    
    // Clear and populate links
    policyLinksEl.innerHTML = '';
    if (policy.links && policy.links.length > 0) {
      policy.links.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url;
        a.className = 'policy-link';
        a.target = '_blank';
        a.textContent = `↗ ${link.title}`;
        policyLinksEl.appendChild(a);
      });
    } else {
      policyLinksEl.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;font-style:italic;">No active links available.</span>';
    }
  } else {
    // No data available
    policyStatusEl.textContent = 'Unknown Status';
    policyStatusEl.style.backgroundColor = colors.Default;
    policyStatusEl.style.color = '#fff';
    policyDescEl.textContent = 'We currently do not have specific AI governance or LAWS policy data for this nation in our database.';
    policyLinksEl.innerHTML = '';
  }

  // Show Panel
  infoPanel.classList.remove('hidden');
  
  // Pan to country slightly to make room for the panel (optional)
  // map.panTo(e.target.getBounds().getCenter());
}

// Close Panel Event
closePanelBtn.addEventListener('click', () => {
  infoPanel.classList.add('hidden');
});

// Run
init();
