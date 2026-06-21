import './style.css';

// DOM Elements
const infoPanel = document.getElementById('info-panel');
const closePanelBtn = document.getElementById('close-panel');
const panelTitleEl = document.getElementById('panel-title');
const overallStatusEl = document.getElementById('overall-status');
const statTotalEl = document.getElementById('stat-total');
const regulationsListEl = document.getElementById('regulations-list');
const searchInput = document.getElementById('search-input');
const tabBtns = document.querySelectorAll('.tab-btn');

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
  zoomControl: false,
  attributionControl: false
});

// CartoDB Dark Matter Base Map
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

L.control.zoom({
  position: 'bottomleft'
}).addTo(map);

// Design Tokens (Matching CSS)
const colors = {
  Banned: '#ef4444',
  Proposed: '#8b5cf6',
  Regulated: '#10b981',
  Unregulated: '#64748b',
  Default: 'rgba(255,255,255,0.05)',
  Hover: '#ffffff',
  Border: '#2a3655'
};

// Global Data
let regulationsData = [];
let countrySummary = {};
let geojsonLayer;
let markersLayer = L.layerGroup().addTo(map);
let currentFilter = 'all';
let selectedRegion = null;
let currentSpecificReg = null;

// Initialize App
async function init() {
  try {
    // Fetch Data
    const [regRes, sumRes, geoRes] = await Promise.all([
      fetch('./data/unified-regulations.json'),
      fetch('./data/country-summary.json'),
      fetch('./data/countries.geo.json')
    ]);
    
    regulationsData = await regRes.json();
    countrySummary = await sumRes.json();
    const geoData = await geoRes.json();

    // Add GeoJSON to Map
    geojsonLayer = L.geoJSON(geoData, {
      style: getFeatureStyle,
      onEachFeature: onEachFeature
    }).addTo(map);

    // Add Regulation Markers
    renderMarkers();

  } catch (err) {
    console.error("Failed to load map data:", err);
  }
}

function getStatusColor(statusStr) {
  const s = statusStr.toLowerCase();
  if (s.includes('ban')) return colors.Banned;
  if (s.includes('propos') || s.includes('develop')) return colors.Proposed;
  if (s.includes('effect') || s.includes('launch') || s.includes('regulat') || s.includes('pass')) return colors.Regulated;
  return colors.Unregulated;
}

function getStatusClass(statusStr) {
  const s = statusStr.toLowerCase();
  if (s.includes('ban')) return 'banned';
  if (s.includes('propos') || s.includes('develop')) return 'proposed';
  if (s.includes('effect') || s.includes('launch') || s.includes('regulat') || s.includes('pass')) return 'enacted';
  return 'unregulated';
}

// Styling features based on policy status
function getFeatureStyle(feature) {
  const countryName = feature.properties.name;
  const summary = countrySummary[countryName] || countrySummary[feature.id]; // Try name or ISO
  
  let fillColor = colors.Default;
  if (summary) {
    fillColor = getStatusColor(summary.overallStance);
  }

  return {
    fillColor: fillColor,
    weight: 0,
    opacity: 0,
    color: 'transparent',
    fillOpacity: 0.5
  };
}

// Render pulsing markers for specific coordinates
function renderMarkers() {
  markersLayer.clearLayers();
  
  regulationsData.forEach(reg => {
    if (reg.lat && reg.lon) {
      const statusClass = getStatusClass(reg.status);
      const icon = L.divIcon({
        className: `pulse-marker ${statusClass}`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        tooltipAnchor: [12, 0]
      });
      
      const marker = L.marker([reg.lat, reg.lon], { icon }).bindTooltip(reg.title);
      marker.on('click', () => {
        showPanelForRegion(reg.country || 'Unknown', reg);
      });
      markersLayer.addLayer(marker);
    }
  });
}

// Interaction Listeners for Polygons
function onEachFeature(feature, layer) {
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: (e) => {
      const countryName = feature.properties.name;
      showPanelForRegion(countryName);
    }
  });
}

function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 2,
    color: '#ffffff',
    opacity: 1,
    fillOpacity: 0.8
  });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function resetHighlight(e) {
  geojsonLayer.resetStyle(e.target);
}

function showPanelForRegion(regionName, specificReg = null) {
  selectedRegion = regionName;
  currentSpecificReg = specificReg;
  
  // Populate Header
  panelTitleEl.textContent = specificReg ? specificReg.title : regionName;
  
  const summary = countrySummary[regionName];
  if (summary && !specificReg) {
    overallStatusEl.textContent = summary.overallStance;
    overallStatusEl.style.backgroundColor = getStatusColor(summary.overallStance);
    overallStatusEl.style.color = '#fff';
    overallStatusEl.style.display = 'inline-block';
  } else if (specificReg) {
    overallStatusEl.textContent = specificReg.status;
    overallStatusEl.style.backgroundColor = getStatusColor(specificReg.status);
    overallStatusEl.style.color = '#fff';
    overallStatusEl.style.display = 'inline-block';
  } else {
    overallStatusEl.textContent = 'Unregulated / Unknown';
    overallStatusEl.style.backgroundColor = colors.Unregulated;
    overallStatusEl.style.color = '#fff';
    overallStatusEl.style.display = 'inline-block';
  }

  // Show Panel
  infoPanel.classList.remove('hidden');
  
  // Render list
  renderRegulationsList();
}

function renderRegulationsList() {
  if (!selectedRegion) return;
  
  let filtered = [];
  
  if (currentSpecificReg) {
    filtered = [currentSpecificReg];
  } else {
    const normRegion = selectedRegion.toLowerCase();
    const aliases = [normRegion];
    if (normRegion === 'united kingdom' || normRegion === 'uk') aliases.push('united kingdom', 'uk', 'global - uk');
    if (normRegion === 'united states' || normRegion === 'united states of america' || normRegion === 'us' || normRegion === 'usa') aliases.push('united states', 'usa', 'us', 'u.s.');
    if (normRegion === 'united arab emirates' || normRegion === 'uae') aliases.push('united arab emirates', 'uae');
    if (normRegion === 'south korea' || normRegion === 'korea') aliases.push('south korea', 'korea');
    if (normRegion === 'european union' || normRegion === 'eu') aliases.push('european union', 'eu');
    
    filtered = regulationsData.filter(r => {
      const c = (r.country || '').toLowerCase();
      const t = (r.title || '').toLowerCase();
      // Match by country field directly to an alias, OR check if the title contains the country name/alias
      return aliases.some(a => c === a || c.includes(a) || t.startsWith(a + ' ') || t.includes(' - ' + a));
    });
  }
  
  // Apply tab filter
  if (currentFilter === 'enacted') {
    filtered = filtered.filter(r => getStatusClass(r.status) === 'enacted');
  } else if (currentFilter === 'proposed') {
    filtered = filtered.filter(r => getStatusClass(r.status) === 'proposed');
  }
  
  // Update stats
  statTotalEl.textContent = filtered.length;
  
  if (filtered.length === 0) {
    regulationsListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-signature"></i>
        <p>No ${currentFilter !== 'all' ? currentFilter : ''} regulations found for this region.</p>
      </div>`;
    return;
  }
  
  // If a specific marker was clicked, bring it to the top
  if (highlightedReg) {
    filtered.sort((a, b) => a.id === highlightedReg.id ? -1 : b.id === highlightedReg.id ? 1 : 0);
  }
  
  // Build HTML
  regulationsListEl.innerHTML = filtered.map(reg => {
    const statusClass = getStatusClass(reg.status);
    const dateStr = reg.date ? new Date(reg.date).toLocaleDateString() : 'Unknown Date';
    // Clean description HTML slightly if it's from sovereign
    let desc = reg.description || 'No description provided.';
    desc = desc.replace(/Official Source \/ Legislation:/g, '<strong>Source:</strong>');
    
    return `
      <div class="reg-card" ${highlightedReg && reg.id === highlightedReg.id ? 'style="border-color: #3b82f6;"' : ''}>
        <div class="reg-header">
          <span class="reg-status ${statusClass}">${reg.status}</span>
          <span class="reg-date">${dateStr}</span>
        </div>
        <h3 class="reg-title">${reg.title}</h3>
        <div class="reg-desc">${desc}</div>
      </div>
    `;
  }).join('');
}

// Tab Filter Logic
tabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    renderRegulationsList();
  });
});

// Search Logic
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  if (query.length < 2) return;
  
  // Find first matching country
  const match = Object.keys(countrySummary).find(c => c.toLowerCase().includes(query));
  if (match) {
    showPanelForRegion(match);
  }
});

// Close Panel Event
closePanelBtn.addEventListener('click', () => {
  infoPanel.classList.add('hidden');
  selectedRegion = null;
});

// Run
init();
