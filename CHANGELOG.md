# Changelog

All notable changes to the Global AI Policy Tracker will be documented in this file.

## [2.0.0] - 2026-06-21

### Major Overhaul & Data Integration

The tracker has been completely rebuilt from the ground up to support a significantly larger, more granular dataset, alongside a total user interface redesign.

### Added
- **Data Ingestion Pipeline (`scripts/data-ingest.js`)**: A Node.js automated script to pull, deduplicate, and normalize 450+ high-precision AI regulatory events from Sovereign Dashboard's `ai-regulations-local.json` and combine them with the public AI Policy Tracker database.
- **Pulsing Marker Layer**: Individual coordinates for specific legislation now render as distinct pulsing markers on the map, allowing for hyper-local tracking of state, city, and federal policies.
- **Dynamic Choropleth Shading**: `countries.geo.json` shapes are now automatically colored based on an algorithmic aggregation of all regulations occurring within their borders.
- **Interactive Side-Panel**: A comprehensive sliding dossier interface replaces the older static text box. Features dynamic rendering of policies, legislation dates, and source linking.
- **Search & Filtering Engine**: Implemented a global text search input for countries and specific regulations, alongside tabbed filters to quickly isolate "Enacted" vs "Proposed" policies.
- **Premium UI / Glassmorphism**: Complete CSS rewrite implementing dark mode, high-blur glass panels (`backdrop-filter`), neon typography gradients, and custom scrollbars.
- **CartoDB Base Map**: Upgraded Leaflet tiles to CartoDB Dark Matter for a high-end, distraction-free aesthetic.
- **README & Documentation**: Detailed documentation mapping out features, ingestion steps, and live URLs.

### Fixed
- Fixed an issue where the center anchor of CSS div icons (`iconAnchor`) was slightly offset on the map projection. Markers now align perfectly with absolute coordinates regardless of zoom level.

### Removed
- Deprecated hardcoded 7-nation test array in favor of the dynamic 450+ node `unified-regulations.json` database.
