import './style.css';

// DOM Elements
const infoPanel = document.getElementById('info-panel');
const closePanelBtn = document.getElementById('close-panel');
const panelTitleEl = document.getElementById('panel-title');
const overallStatusEl = document.getElementById('overall-status');
const statTotalEl = document.getElementById('stat-total');
const regulationsListEl = document.getElementById('regulations-list');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchDropdown = document.getElementById('search-dropdown');
const sectorFilterSelect = document.getElementById('sector-filter-select');
const tabBtns = document.querySelectorAll('.tab-btn');
const timelineBtns = document.querySelectorAll('.timeline-btn');
const timelineActiveBadge = document.getElementById('timeline-active-badge');
const shareRegionBtn = document.getElementById('share-region-btn');
const exportRegionCsvBtn = document.getElementById('export-region-csv-btn');
const exportRegionJsonBtn = document.getElementById('export-region-json-btn');
const exportAllCsvBtn = document.getElementById('export-all-csv-btn');
const exportAllJsonBtn = document.getElementById('export-all-json-btn');
const panelDragHandle = document.getElementById('panel-drag-handle');

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

// CartoDB Dark Matter Base Map with Basemaps API Key
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2lpu_1_f2c6edda75611222b49c9464', {
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

// Global App State
let regulationsData = [];
let countrySummary = {};
let geojsonLayer;
let countryLayersMap = {};
let markersLayer = L.layerGroup().addTo(map);
let currentFilter = 'all';        // Status: all, in-effect, passed, proposed, policy
let currentSectorFilter = 'all';  // Sector filter
let currentYearFilter = 'all';    // Timeline year filter
let selectedRegion = null;
let currentSpecificReg = null;

// Stats Data
let areaStats = {};
let currentSortColumn = 'total';
let currentSortOrder = -1;
let statsChartInstance = null;

// Toast Utility
function showToast(message, icon = 'fa-check-circle', duration = 2800) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  const iconEl = toast.querySelector('.toast-icon');
  if (iconEl) iconEl.className = `fas ${icon} toast-icon`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// Bulletproof Clipboard Copy (Supports cross-origin iframes, Safari, mobile)
async function copyToClipboard(text) {
  if (!text) return false;

  // 1. Try modern clipboard API if permitted
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern clipboard write failed, using textarea fallback:', err);
    }
  }

  // 2. Reliable cross-browser textarea fallback
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
}

// Helper: Escape HTML string
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Highlight matching query in text
function highlightQuery(text, query) {
  if (!text || !query) return escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(regex, '<span style="color: #60a5fa; font-weight: 700; text-decoration: underline;">$1</span>');
}

// Shareable URL Generator (Defaults to aviperera.com if embedded)
function getShareableUrl(params = {}) {
  const isCustomDomain = window.location.hostname.includes('aviperera.com');
  const baseUrl = isCustomDomain 
    ? 'https://aviperera.com/ai-policy-tracker/' 
    : window.location.origin + window.location.pathname;
  
  const url = new URL(baseUrl);
  Object.keys(params).forEach(k => {
    if (params[k] && params[k] !== 'all') {
      url.searchParams.set(k, params[k]);
    }
  });
  return url.toString();
}

// Initialize App
async function init() {
  try {
    const [regRes, sumRes, geoRes] = await Promise.all([
      fetch('./data/unified-regulations.json'),
      fetch('./data/country-summary.json'),
      fetch('./data/countries.geo.json')
    ]);
    
    regulationsData = await regRes.json();
    countrySummary = await sumRes.json();
    const geoData = await geoRes.json();

    // Index and add GeoJSON to Map
    geojsonLayer = L.geoJSON(geoData, {
      style: getFeatureStyle,
      onEachFeature: onEachFeature
    }).addTo(map);

    // Add Regulation Markers
    renderMarkers();

    // Compute stats
    computeAreaStats();
    renderStatsModal(false);

    // Parse URL query parameters if present (deep link)
    parseUrlParamsOnLoad();

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
  const summary = countrySummary[countryName] || countrySummary[feature.id];
  
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

// Check if a regulation passes current global filters (Sector & Year)
function passesGlobalFilters(reg) {
  // Sector filter
  if (currentSectorFilter !== 'all') {
    if ((reg.area || 'General') !== currentSectorFilter) return false;
  }
  
  // Year filter
  if (currentYearFilter !== 'all') {
    if (!reg.date || reg.date === 'Unknown Date') return false;
    const year = new Date(reg.date).getFullYear();
    if (isNaN(year)) return false;
    
    if (currentYearFilter === 'pre-2022') {
      if (year > 2021) return false;
    } else {
      if (year !== parseInt(currentYearFilter, 10)) return false;
    }
  }

  return true;
}

// Render pulsing markers for specific coordinates based on active filters
function renderMarkers() {
  markersLayer.clearLayers();
  
  regulationsData.forEach(reg => {
    if (reg.lat && reg.lon) {
      if (!passesGlobalFilters(reg)) return;

      const statusClass = getStatusClass(reg.status);
      const icon = L.divIcon({
        className: `pulse-marker ${statusClass}`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        tooltipAnchor: [12, 0]
      });
      
      const marker = L.marker([reg.lat, reg.lon], { icon }).bindTooltip(`${reg.country || 'Global'}: ${reg.title}`);
      marker.on('click', () => {
        showPanelForRegion(reg.country || 'Unknown', reg, true);
      });
      markersLayer.addLayer(marker);
    }
  });
}

// Interaction Listeners for Polygons
function onEachFeature(feature, layer) {
  const countryName = feature.properties.name;
  if (countryName) {
    countryLayersMap[countryName.toLowerCase()] = layer;
  }
  if (feature.id) {
    countryLayersMap[String(feature.id).toLowerCase()] = layer;
  }

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: () => {
      showPanelForRegion(countryName, null, true);
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

// Camera Fly-To & Country Centering
function focusOnRegion(regionName, specificReg = null) {
  if (specificReg && specificReg.lat && specificReg.lon) {
    map.flyTo([specificReg.lat, specificReg.lon], 6, { duration: 1.2, easeLinearity: 0.25 });
    return;
  }
  
  const norm = (regionName || '').toLowerCase();
  const layer = countryLayersMap[norm];
  if (layer && layer.getBounds) {
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 6, duration: 1.2 });
        highlightFeature({ target: layer });
      }
    } catch (e) {
      console.warn('Could not calculate bounds for region:', regionName);
    }
  }
}

// Show Panel for Region or Specific Regulation
function showPanelForRegion(regionName, specificReg = null, shouldFly = false) {
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

  // Camera Fly-To
  if (shouldFly) {
    focusOnRegion(regionName, specificReg);
  }

  // Sync URL query params
  updateUrlParams();
}

// Get filtered regulations for current active region
function getFilteredRegulations() {
  if (!selectedRegion) return [];
  
  let list = [];
  
  if (currentSpecificReg) {
    list = [currentSpecificReg];
  } else {
    const normRegion = selectedRegion.toLowerCase();
    const aliases = [normRegion];
    if (normRegion === 'united kingdom' || normRegion === 'uk') aliases.push('united kingdom', 'uk', 'great britain');
    if (normRegion === 'united states' || normRegion === 'usa' || normRegion === 'us') aliases.push('united states', 'usa', 'us', 'california', 'new york', 'texas', 'virginia', 'colorado', 'washington');
    if (normRegion === 'united arab emirates' || normRegion === 'uae') aliases.push('united arab emirates', 'uae');
    if (normRegion === 'south korea' || normRegion === 'korea') aliases.push('south korea', 'korea');
    if (normRegion === 'european union' || normRegion === 'eu') aliases.push('european union', 'eu');
    if (normRegion === 'turkey' || normRegion === 'türkiye') aliases.push('turkey', 'türkiye');
    
    list = regulationsData.filter(r => {
      const c = (r.country || '').toLowerCase();
      const t = (r.title || '').toLowerCase();
      return aliases.some(a => c === a || c.includes(a) || t.startsWith(a + ' ') || t.includes(' - ' + a));
    });
  }
  
  // Apply Global filters (Sector & Year)
  list = list.filter(passesGlobalFilters);

  // Apply Status tab filter
  if (currentFilter !== 'all') {
    list = list.filter(r => getStatusClass(r.status) === currentFilter);
  }
  
  return list;
}

function renderRegulationsList() {
  if (!selectedRegion) return;
  
  const filtered = getFilteredRegulations();
  
  // Update stats in header
  statTotalEl.textContent = filtered.length;
  
  if (filtered.length === 0) {
    regulationsListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-signature"></i>
        <p>No matching regulations found for this region with the active filters.</p>
      </div>`;
    return;
  }
  
  // If a specific marker was clicked, bring it to the top
  if (currentSpecificReg) {
    filtered.sort((a, b) => a.id === currentSpecificReg.id ? -1 : b.id === currentSpecificReg.id ? 1 : 0);
  }
  
  // Build HTML
  regulationsListEl.innerHTML = filtered.map(reg => {
    return formatRegulationCard(reg, currentSpecificReg && reg.id === currentSpecificReg.id);
  }).join('');
}

// Generate formatted Citation string
function generateCitation(reg) {
  const jurisdiction = reg.country || 'International';
  const year = reg.date && reg.date !== 'Unknown Date' ? new Date(reg.date).getFullYear() : '2026';
  const directUrl = reg.sourceUrl || `https://aviperera.com/ai-policy-tracker/?id=${reg.id}`;
  return `${jurisdiction}. (${year}). ${reg.title}. In Global AI Policy Tracker. Avi Perera. Retrieved from ${directUrl}`;
}

// Format Single Regulation Card HTML
function formatRegulationCard(reg, isHighlighted = false) {
  const statusClass = getStatusClass(reg.status);
  const dateStr = reg.date && reg.date !== 'Unknown Date' ? new Date(reg.date).toLocaleDateString() : '';
  const cleanDesc = reg.description || `Official regulatory policy, legal framework, and governance requirements for ${reg.title} in ${reg.country}.`;
  
  // Truncate display URL
  let displaySource = reg.sourceName || 'Official Source';
  if (displaySource.length > 38) {
    displaySource = displaySource.substring(0, 35) + '...';
  }

  const sourceHtml = `
    <div class="reg-source-box">
      <span class="source-label"><i class="fas fa-link"></i> Source:</span>
      <a href="${escapeHtml(reg.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="source-link" title="${escapeHtml(reg.sourceUrl)}">
        <span>${escapeHtml(displaySource)}</span> <i class="fas fa-external-link-alt"></i>
      </a>
    </div>
  `;

  const isLong = cleanDesc.length > 180;
  const areaBadge = reg.area && reg.area !== 'General' ? `<span class="reg-area">${escapeHtml(reg.area)}</span>` : '';

  return `
    <div class="reg-card" data-reg-id="${escapeHtml(reg.id)}" ${isHighlighted ? 'style="border-color: #3b82f6;"' : ''}>
      <div class="reg-header">
        <div>
          <span class="reg-status ${statusClass}">${escapeHtml(reg.status)}</span>
          ${areaBadge}
        </div>
        <span class="reg-date">${dateStr}</span>
      </div>
      <h3 class="reg-title">${escapeHtml(reg.title)}</h3>
      <div class="reg-desc">
        <div class="reg-desc-content ${isLong ? 'is-collapsed' : ''}">${escapeHtml(cleanDesc)}</div>
        ${isLong ? `<button class="expand-desc-btn" type="button">Read full summary <i class="fas fa-chevron-down"></i></button>` : ''}
      </div>
      ${sourceHtml}
      
      <div class="card-actions-bar">
        <button class="card-action-btn copy-citation-btn" data-id="${escapeHtml(reg.id)}" title="Copy academic & legal citation to clipboard">
          <i class="fas fa-quote-right"></i> Copy Citation
        </button>
        <button class="card-action-btn share-card-btn" data-id="${escapeHtml(reg.id)}" title="Share link to this specific law">
          <i class="fas fa-share-alt"></i> Share
        </button>
      </div>
    </div>
  `;
}

// Delegation for Card Buttons (Expand, Citation, Share)
if (regulationsListEl) {
  regulationsListEl.addEventListener('click', async (e) => {
    // 1. Expand / Collapse
    const expandBtn = e.target.closest('.expand-desc-btn');
    if (expandBtn) {
      e.stopPropagation();
      const content = expandBtn.previousElementSibling;
      if (content && content.classList.contains('reg-desc-content')) {
        const isCollapsed = content.classList.toggle('is-collapsed');
        expandBtn.innerHTML = isCollapsed ? 'Read full summary <i class="fas fa-chevron-down"></i>' : 'Show less <i class="fas fa-chevron-up"></i>';
      }
      return;
    }

    // 2. Copy Citation
    const citeBtn = e.target.closest('.copy-citation-btn');
    if (citeBtn) {
      e.stopPropagation();
      const regId = citeBtn.dataset.id;
      const reg = regulationsData.find(r => r.id === regId);
      if (reg) {
        const citation = generateCitation(reg);
        const success = await copyToClipboard(citation);
        if (success) {
          citeBtn.classList.add('copied');
          citeBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
          showToast('Citation copied to clipboard!', 'fa-quote-left');
          setTimeout(() => {
            citeBtn.classList.remove('copied');
            citeBtn.innerHTML = '<i class="fas fa-quote-right"></i> Copy Citation';
          }, 2000);
        } else {
          showToast('Failed to copy citation.', 'fa-exclamation-triangle');
        }
      }
      return;
    }

    // 3. Share Specific Card Link
    const shareBtn = e.target.closest('.share-card-btn');
    if (shareBtn) {
      e.stopPropagation();
      const regId = shareBtn.dataset.id;
      const shareUrl = getShareableUrl({ id: regId });
      const success = await copyToClipboard(shareUrl);
      if (success) {
        shareBtn.classList.add('copied');
        shareBtn.innerHTML = '<i class="fas fa-check"></i> Copied Link!';
        showToast('Direct legislation link copied!', 'fa-share-alt');
        setTimeout(() => {
          shareBtn.classList.remove('copied');
          shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> Share';
        }, 2000);
      } else {
        showToast('Failed to copy link.', 'fa-exclamation-triangle');
      }
      return;
    }
  });
}

// Deep Search Logic
let searchDebounceTimeout = null;

function performDeepSearch(query) {
  if (!query || query.trim().length < 2) {
    searchDropdown.classList.add('hidden');
    searchDropdown.innerHTML = '';
    clearSearchBtn.classList.add('hidden');
    return;
  }

  clearSearchBtn.classList.remove('hidden');
  const q = query.trim().toLowerCase();
  
  // 1. Match Countries
  const matchedCountries = Object.keys(countrySummary).filter(c => c.toLowerCase().includes(q));

  // 2. Match Regulations (titles, descriptions, jurisdictions, areas)
  const matchedRegs = regulationsData.filter(r => {
    const title = (r.title || '').toLowerCase();
    const desc = (r.description || '').toLowerCase();
    const country = (r.country || '').toLowerCase();
    const area = (r.area || '').toLowerCase();
    return title.includes(q) || desc.includes(q) || country.includes(q) || area.includes(q);
  }).slice(0, 10);

  if (matchedCountries.length === 0 && matchedRegs.length === 0) {
    searchDropdown.innerHTML = `<div class="search-empty"><i class="fas fa-search" style="margin-bottom: 6px; font-size: 1.2rem; display: block; opacity: 0.5;"></i> No matching policies or jurisdictions found for "<strong>${escapeHtml(query)}</strong>"</div>`;
    searchDropdown.classList.remove('hidden');
    return;
  }

  let html = '';

  if (matchedCountries.length > 0) {
    html += `<div class="search-group-title"><i class="fas fa-flag"></i> Jurisdictions (${matchedCountries.length})</div>`;
    matchedCountries.slice(0, 4).forEach(c => {
      const summary = countrySummary[c];
      const stance = summary ? summary.overallStance : 'Unregulated';
      const sClass = getStatusClass(stance);
      html += `
        <div class="search-item search-country-item" data-country="${escapeHtml(c)}">
          <div class="search-item-header">
            <span class="search-item-title">${highlightQuery(c, q)}</span>
            <span class="search-badge ${sClass}">${stance}</span>
          </div>
          <div class="search-item-meta">
            <span><i class="fas fa-landmark"></i> ${summary ? summary.count : 0} Policies Tracked</span>
          </div>
        </div>
      `;
    });
  }

  if (matchedRegs.length > 0) {
    html += `<div class="search-group-title"><i class="fas fa-gavel"></i> Specific Legislation & Policies (${matchedRegs.length})</div>`;
    matchedRegs.forEach(r => {
      const sClass = getStatusClass(r.status);
      const year = r.date && r.date !== 'Unknown Date' ? new Date(r.date).getFullYear() : '';
      html += `
        <div class="search-item search-reg-item" data-id="${escapeHtml(r.id)}" data-country="${escapeHtml(r.country || 'Global')}">
          <div class="search-item-header">
            <span class="search-item-title">${highlightQuery(r.title, q)}</span>
            <span class="search-badge ${sClass}">${r.status}</span>
          </div>
          <div class="search-item-meta">
            <span><i class="fas fa-globe"></i> ${r.country || 'Global'}</span>
            ${year ? `<span>&bull; ${year}</span>` : ''}
            <span>&bull; ${r.area || 'General'}</span>
          </div>
        </div>
      `;
    });
  }

  searchDropdown.innerHTML = html;
  searchDropdown.classList.remove('hidden');
}

// Search Input Listener
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimeout);
  const query = e.target.value;
  searchDebounceTimeout = setTimeout(() => {
    performDeepSearch(query);
  }, 180);
});

// Clear Search Button
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchDropdown.classList.add('hidden');
  clearSearchBtn.classList.add('hidden');
  searchInput.focus();
});

// Search Dropdown Click Handlers
searchDropdown.addEventListener('click', (e) => {
  const countryItem = e.target.closest('.search-country-item');
  if (countryItem) {
    const country = countryItem.dataset.country;
    showPanelForRegion(country, null, true);
    searchDropdown.classList.add('hidden');
    return;
  }

  const regItem = e.target.closest('.search-reg-item');
  if (regItem) {
    const id = regItem.dataset.id;
    const country = regItem.dataset.country;
    const reg = regulationsData.find(r => r.id === id);
    if (reg) {
      showPanelForRegion(country, reg, true);
    }
    searchDropdown.classList.add('hidden');
    return;
  }
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) {
    searchDropdown.classList.add('hidden');
  }
});

// Sector Filter Selector
if (sectorFilterSelect) {
  sectorFilterSelect.addEventListener('change', (e) => {
    currentSectorFilter = e.target.value;
    renderMarkers();
    if (selectedRegion) renderRegulationsList();
    updateUrlParams();
    showToast(currentSectorFilter === 'all' ? 'Showing all sectors' : `Filtered to ${currentSectorFilter}`, 'fa-filter');
  });
}

// Timeline Scrubber Buttons
timelineBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    timelineBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentYearFilter = btn.dataset.year;
    
    if (timelineActiveBadge) {
      timelineActiveBadge.textContent = btn.textContent;
    }
    
    renderMarkers();
    if (selectedRegion) renderRegulationsList();
    updateUrlParams();
    showToast(`Timeline: ${btn.textContent}`, 'fa-calendar-alt');
  });
});

// Tab Filter Logic (Status)
tabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    renderRegulationsList();
    updateUrlParams();
  });
});

// Close Panel Event
closePanelBtn.addEventListener('click', () => {
  infoPanel.classList.add('hidden');
  selectedRegion = null;
  currentSpecificReg = null;
  updateUrlParams();
});

// Mobile Bottom Sheet Drag / Touch Toggle
if (panelDragHandle) {
  let startY = 0;
  
  panelDragHandle.addEventListener('click', () => {
    if (infoPanel.style.height === '90vh') {
      infoPanel.style.height = '40vh';
    } else {
      infoPanel.style.height = '90vh';
    }
  });

  panelDragHandle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });

  panelDragHandle.addEventListener('touchmove', (e) => {
    const deltaY = startY - e.touches[0].clientY;
    if (deltaY > 50) {
      infoPanel.style.height = '90vh';
    } else if (deltaY < -50) {
      infoPanel.style.height = '40vh';
    }
  }, { passive: true });
}

// Comprehensive CSV & JSON Export Utilities
function exportToCSV(data, filename = 'ai-regulations-export.csv') {
  if (!data || !data.length) {
    showToast('No data available to export.', 'fa-exclamation-circle');
    return;
  }
  const headers = [
    'ID',
    'Title',
    'Jurisdiction / Country',
    'Status',
    'Enactment / Update Date',
    'Focus Sector',
    'Source Name',
    'Source URL',
    'Description Summary',
    'Latitude',
    'Longitude'
  ];

  const rows = data.map(r => [
    `"${(r.id || '').replace(/"/g, '""')}"`,
    `"${(r.title || '').replace(/"/g, '""')}"`,
    `"${(r.country || '').replace(/"/g, '""')}"`,
    `"${(r.status || '').replace(/"/g, '""')}"`,
    `"${(r.date || '').replace(/"/g, '""')}"`,
    `"${(r.area || '').replace(/"/g, '""')}"`,
    `"${(r.sourceName || '').replace(/"/g, '""')}"`,
    `"${(r.sourceUrl || '').replace(/"/g, '""')}"`,
    `"${(r.description || '').replace(/"/g, '""')}"`,
    r.lat || '',
    r.lon || ''
  ].join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  downloadBlob(csvContent, filename, 'text/csv;charset=utf-8;');
  showToast(`Exported ${data.length} records to CSV!`, 'fa-file-csv');
}

function exportToJSON(data, filename = 'ai-regulations-export.json') {
  if (!data || !data.length) {
    showToast('No data available to export.', 'fa-exclamation-circle');
    return;
  }
  const jsonStr = JSON.stringify(data, null, 2);
  downloadBlob(jsonStr, filename, 'application/json');
  showToast(`Exported ${data.length} records to JSON!`, 'fa-file-code');
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Region Action Toolbar Handlers
if (shareRegionBtn) {
  shareRegionBtn.addEventListener('click', async () => {
    const shareUrl = getShareableUrl({
      country: selectedRegion,
      sector: currentSectorFilter,
      status: currentFilter,
      year: currentYearFilter
    });
    
    const success = await copyToClipboard(shareUrl);
    if (success) {
      shareRegionBtn.classList.add('copied');
      shareRegionBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      showToast('Shareable region link copied!', 'fa-share-alt');
      setTimeout(() => {
        shareRegionBtn.classList.remove('copied');
        shareRegionBtn.innerHTML = '<i class="fas fa-share-alt"></i> Share';
      }, 2000);
    } else {
      showToast('Failed to copy link.', 'fa-exclamation-triangle');
    }
  });
}

if (exportRegionCsvBtn) {
  exportRegionCsvBtn.addEventListener('click', () => {
    const list = getFilteredRegulations();
    const name = selectedRegion ? selectedRegion.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'region';
    exportToCSV(list, `ai-policies-${name}.csv`);
  });
}

if (exportRegionJsonBtn) {
  exportRegionJsonBtn.addEventListener('click', () => {
    const list = getFilteredRegulations();
    const name = selectedRegion ? selectedRegion.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'region';
    exportToJSON(list, `ai-policies-${name}.json`);
  });
}

// Global Export Buttons (Stats Modal)
if (exportAllCsvBtn) {
  exportAllCsvBtn.addEventListener('click', () => {
    exportToCSV(regulationsData, 'global-ai-regulations-full-database.csv');
  });
}

if (exportAllJsonBtn) {
  exportAllJsonBtn.addEventListener('click', () => {
    exportToJSON(regulationsData, 'global-ai-regulations-full-database.json');
  });
}

// URL Parameter Sync
function updateUrlParams() {
  const params = new URLSearchParams();
  if (selectedRegion && !currentSpecificReg) params.set('country', selectedRegion);
  if (currentSpecificReg) params.set('id', currentSpecificReg.id);
  if (currentSectorFilter !== 'all') params.set('sector', currentSectorFilter);
  if (currentFilter !== 'all') params.set('status', currentFilter);
  if (currentYearFilter !== 'all') params.set('year', currentYearFilter);
  
  const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', newUrl);
}

function parseUrlParamsOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const countryParam = params.get('country');
  const idParam = params.get('id');
  const sectorParam = params.get('sector');
  const statusParam = params.get('status');
  const yearParam = params.get('year');

  if (sectorParam) {
    currentSectorFilter = sectorParam;
    if (sectorFilterSelect) sectorFilterSelect.value = sectorParam;
  }

  if (statusParam) {
    currentFilter = statusParam;
    tabBtns.forEach(btn => {
      if (btn.dataset.filter === statusParam) {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  }

  if (yearParam) {
    currentYearFilter = yearParam;
    timelineBtns.forEach(btn => {
      if (btn.dataset.year === yearParam) {
        timelineBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (timelineActiveBadge) timelineActiveBadge.textContent = btn.textContent;
      }
    });
  }

  if (idParam) {
    const foundReg = regulationsData.find(r => r.id === idParam);
    if (foundReg) {
      showPanelForRegion(foundReg.country || 'Unknown', foundReg, true);
    }
  } else if (countryParam) {
    showPanelForRegion(countryParam, null, true);
  }
}

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
  
  let totalEnacted = 0;
  let globalTreaties = 0;
  const regionCounts = {};
  const internationalPolicies = [];
  const sectorSpotlights = [];
  
  regulationsData.forEach(r => {
    const s = getStatusClass(r.status);
    if (s === 'in-effect' || s === 'enacted' || s === 'passed') {
      totalEnacted++;
    }
    
    const c = r.country || 'Unknown';
    if (c === 'Global' || c === 'European Union' || c.includes('African Union')) {
      globalTreaties++;
      internationalPolicies.push(r);
    }
    
    if (r.area === 'Government and Military' || r.area === 'Generative AI' || r.area === 'Technology and Infrastructure') {
      sectorSpotlights.push(r);
    }
    
    if (c === 'Unknown' || c === 'Global') return;
    regionCounts[c] = (regionCounts[c] || 0) + 1;
  });
  
  // Active Policy Sectors
  const activeSectorsCount = Object.keys(areaStats).length;
  const activeSectorsEl = document.getElementById('global-active-sectors');
  if (activeSectorsEl) activeSectorsEl.textContent = activeSectorsCount;
  
  // Coverage
  const coverage = Object.keys(regionCounts).length;
  const coverageEl = document.getElementById('global-coverage-stat');
  if (coverageEl) coverageEl.textContent = coverage;

  // Enactment Rate
  const enactmentRate = totalRegulations > 0 ? Math.round((totalEnacted / totalRegulations) * 100) : 0;
  const enactmentEl = document.getElementById('global-enactment-rate');
  if (enactmentEl) enactmentEl.textContent = `${enactmentRate}%`;

  // Treaties Count
  const treatiesEl = document.getElementById('global-treaties-stat');
  if (treatiesEl) treatiesEl.textContent = globalTreaties;

  // Most Regulated Sector
  let topSector = 'General';
  let topSectorCount = 0;
  statsArray.forEach(s => {
    if (s.total > topSectorCount && s.area !== 'Other') {
      topSectorCount = s.total;
      topSector = s.area;
    }
  });
  const topSectorEl = document.getElementById('global-top-sector');
  if (topSectorEl) topSectorEl.innerHTML = `${topSector} <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 8px; font-weight: normal;">(${topSectorCount})</span>`;

  // Mini card helper for spotlights
  const renderMiniCard = (policy) => {
    const sClass = getStatusClass(policy.status);
    return `
      <div class="search-item" style="padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); cursor: pointer;" onclick="document.getElementById('stats-modal').classList.remove('active'); window.__showPolicy('${escapeHtml(policy.country || 'Global')}', '${escapeHtml(policy.id)}');">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
          <strong style="color: #fff; font-size: 0.85rem; line-height: 1.3;">${escapeHtml(policy.title)}</strong>
          <span class="status-indicator ${sClass}" style="flex-shrink: 0; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; text-transform: uppercase; font-weight: 700;">${policy.status}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.78rem; display: flex; align-items: center; gap: 6px;">
          <i class="fas ${policy.area === 'Government and Military' ? 'fa-shield-alt' : policy.area === 'Generative AI' ? 'fa-brain' : 'fa-landmark'}"></i> ${escapeHtml(policy.area)} &bull; ${escapeHtml(policy.country || 'Global')}
        </div>
      </div>
    `;
  };

  // Render International Frameworks
  const intlFrameworksEl = document.getElementById('international-frameworks-list');
  if (intlFrameworksEl) {
    internationalPolicies.sort((a, b) => {
      const aVal = (getStatusClass(a.status) === 'in-effect' || getStatusClass(a.status) === 'passed') ? 1 : 0;
      const bVal = (getStatusClass(b.status) === 'in-effect' || getStatusClass(b.status) === 'passed') ? 1 : 0;
      return bVal - aVal;
    });
    intlFrameworksEl.innerHTML = internationalPolicies.slice(0, 10).map(renderMiniCard).join('');
  }

  // Render Sector Spotlights
  const sectorSpotlightsEl = document.getElementById('sector-spotlights-list');
  if (sectorSpotlightsEl) {
    sectorSpotlights.sort((a, b) => {
      const aVal = (getStatusClass(a.status) === 'in-effect' || getStatusClass(a.status) === 'passed') ? 1 : 0;
      const bVal = (getStatusClass(b.status) === 'in-effect' || getStatusClass(b.status) === 'passed') ? 1 : 0;
      return bVal - aVal;
    });
    sectorSpotlightsEl.innerHTML = sectorSpotlights.slice(0, 10).map(renderMiniCard).join('');
  }
  
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

// Global window bridge for mini-cards
window.__showPolicy = (country, regId) => {
  const reg = regulationsData.find(r => r.id === regId);
  showPanelForRegion(country, reg, true);
};

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
        currentSortOrder = -1;
      }
      renderStatsModal(modalOverlay.classList.contains('active'));
    });
  });
});

// Run
init();
