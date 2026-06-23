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
  Proposed: '#eab308',
  Policy: '#a855f7',
  Passed: '#3b82f6',
  InEffect: '#10b981',
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

// Stats Data
let areaStats = {};
let currentSortColumn = 'total';
let currentSortOrder = -1;
let statsChartInstance = null;

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

    // Compute stats and setup modal
    computeAreaStats();
    renderStatsModal(false);

  } catch (err) {
    console.error("Failed to load map data:", err);
  }
}

function getStatusColor(statusStr) {
  const s = statusStr ? statusStr.toLowerCase() : '';
  if (s.includes('ban')) return colors.Banned;
  if (s.includes('pass')) return colors.Passed;
  if (s.includes('effect') || s.includes('enact') || s.includes('regulat') || s.includes('adopt')) return colors.InEffect;
  if (s.includes('propos') || s.includes('develop') || s.includes('draft') || s.includes('bill')) return colors.Proposed;
  if (s.includes('polic') || s.includes('strateg') || s.includes('framework')) return colors.Policy;
  return colors.Unregulated;
}

function getStatusClass(statusStr) {
  const s = statusStr ? statusStr.toLowerCase() : '';
  if (s.includes('ban')) return 'banned';
  if (s.includes('pass')) return 'passed';
  if (s.includes('effect') || s.includes('enact') || s.includes('regulat') || s.includes('adopt')) return 'in-effect';
  if (s.includes('propos') || s.includes('develop') || s.includes('draft') || s.includes('bill')) return 'proposed';
  if (s.includes('polic') || s.includes('strateg') || s.includes('framework')) return 'policy';
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
  if (currentFilter !== 'all') {
    filtered = filtered.filter(r => getStatusClass(r.status) === currentFilter);
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
  if (currentSpecificReg) {
    filtered.sort((a, b) => a.id === currentSpecificReg.id ? -1 : b.id === currentSpecificReg.id ? 1 : 0);
  }
  
  // Build HTML
  regulationsListEl.innerHTML = filtered.map(reg => {
    const statusClass = getStatusClass(reg.status);
    const dateStr = reg.date && reg.date !== 'Unknown Date' ? new Date(reg.date).toLocaleDateString() : '';
    // Clean description HTML slightly if it's from sovereign
    let desc = reg.description || 'No description provided.';
    desc = desc.replace(/Official Source \/ Legislation:/g, '<strong>Source:</strong>');
    
    // Add area badge if area exists
    const areaBadge = reg.area && reg.area !== 'General' ? `<span class="reg-area">${reg.area}</span>` : '';
    
    return `
      <div class="reg-card" ${currentSpecificReg && reg.id === currentSpecificReg.id ? 'style="border-color: #3b82f6;"' : ''}>
        <div class="reg-header">
          <div>
            <span class="reg-status ${statusClass}">${reg.status}</span>
            ${areaBadge}
          </div>
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

// Stats Modal Logic
function computeAreaStats() {
  areaStats = {};
  regulationsData.forEach(reg => {
    const a = reg.area || 'General';
    if (!areaStats[a]) {
      areaStats[a] = { area: a, inEffect: 0, passed: 0, proposed: 0, policy: 0, banned: 0, unregulated: 0, total: 0 };
    }
    const s = getStatusClass(reg.status);
    if (s === 'in-effect' || s === 'enacted') areaStats[a].inEffect++;
    else if (s === 'passed') areaStats[a].passed++;
    else if (s === 'proposed') areaStats[a].proposed++;
    else if (s === 'policy') areaStats[a].policy++;
    else if (s === 'banned') areaStats[a].banned++;
    else areaStats[a].unregulated++;
    
    areaStats[a].total++;
  });
}

function renderStatsModal(renderChart = true) {
  const statsArray = Object.values(areaStats);
  
  // Update Premium Stats
  const totalRegulations = regulationsData.length;
  const globalTotalEl = document.getElementById('global-total-stat');
  if (globalTotalEl) globalTotalEl.textContent = totalRegulations;
  
  let topRegion = '-';
  let maxRegs = 0;
  const regionCounts = {};
  regulationsData.forEach(r => {
    const c = r.country || 'Unknown';
    if (c === 'Unknown') return;
    regionCounts[c] = (regionCounts[c] || 0) + 1;
    if (regionCounts[c] > maxRegs) {
      maxRegs = regionCounts[c];
      topRegion = c;
    }
  });
  
  const topRegionEl = document.getElementById('global-top-region');
  if (topRegionEl) {
    topRegionEl.innerHTML = `${topRegion} <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 8px; font-weight: normal;">(${maxRegs})</span>`;
  }
  
  const coverage = Object.keys(regionCounts).length;
  const coverageEl = document.getElementById('global-coverage-stat');
  if (coverageEl) coverageEl.textContent = coverage;
  
  // Sort
  statsArray.sort((a, b) => {
    const valA = a[currentSortColumn];
    const valB = b[currentSortColumn];
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * currentSortOrder;
    }
    return (valA - valB) * currentSortOrder;
  });
  
  // Render Table
  const tbody = document.querySelector('#dynamic-stats-table tbody');
  if (tbody) {
    let html = '';
    let totals = { area: 'Total', inEffect: 0, passed: 0, proposed: 0, policy: 0, banned: 0, total: 0 };
    
    statsArray.forEach(row => {
      totals.inEffect += row.inEffect;
      totals.passed += row.passed;
      totals.proposed += row.proposed;
      totals.policy += row.policy;
      totals.banned += row.banned;
      totals.total += row.total;
      
      html += `
        <tr>
          <td>${row.area}</td>
          <td>${row.inEffect}</td>
          <td>${row.passed}</td>
          <td>${row.proposed}</td>
          <td>${row.policy}</td>
          <td>${row.banned}</td>
          <td style="font-weight: 700;">${row.total}</td>
        </tr>
      `;
    });
    
    html += `
      <tr style="background: rgba(255,255,255,0.05); font-weight: 700; color: #fff;">
        <td>Total</td>
        <td>${totals.inEffect}</td>
        <td>${totals.passed}</td>
        <td>${totals.proposed}</td>
        <td>${totals.policy}</td>
        <td>${totals.banned}</td>
        <td>${totals.total}</td>
      </tr>
    `;
    tbody.innerHTML = html;
  }
  
  // Update Sort Icons
  document.querySelectorAll('#dynamic-stats-table th[data-sort]').forEach(th => {
    const icon = th.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-sort';
      if (th.dataset.sort === currentSortColumn) {
        icon.className = currentSortOrder === 1 ? 'fas fa-sort-up' : 'fas fa-sort-down';
      }
    }
  });
  
  if (renderChart) {
    renderStatsChart(statsArray);
  }
}

async function renderStatsChart(statsArray) {
  const ctx = document.getElementById('stats-chart');
  if (!ctx) return;
  
  const { default: Chart } = await import('chart.js/auto');
  
  if (statsChartInstance) {
    statsChartInstance.destroy();
  }
  
  const labels = statsArray.map(s => s.area);
  
  statsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'In Effect', data: statsArray.map(s => s.inEffect), backgroundColor: colors.InEffect },
        { label: 'Passed', data: statsArray.map(s => s.passed), backgroundColor: colors.Passed },
        { label: 'Proposed', data: statsArray.map(s => s.proposed), backgroundColor: colors.Proposed },
        { label: 'Policy', data: statsArray.map(s => s.policy), backgroundColor: colors.Policy },
        { label: 'Banned', data: statsArray.map(s => s.banned), backgroundColor: colors.Banned }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      },
      plugins: {
        legend: { labels: { color: '#fff' } }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const statsBtn = document.getElementById('stats-btn');
  const modalOverlay = document.getElementById('stats-modal');
  const closeBtn = document.getElementById('close-modal');

  if (statsBtn && modalOverlay && closeBtn) {
    statsBtn.addEventListener('click', () => {
      // Re-render and load chart
      renderStatsModal(true);
      modalOverlay.classList.add('active');
    });
    closeBtn.addEventListener('click', () => modalOverlay.classList.remove('active'));
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }
  
  // Table sorting
  document.querySelectorAll('#dynamic-stats-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (currentSortColumn === col) {
        currentSortOrder *= -1;
      } else {
        currentSortColumn = col;
        currentSortOrder = -1; // Default to descending when switching columns
      }
      renderStatsModal(modalOverlay.classList.contains('active'));
    });
  });
});

// Run
init();
