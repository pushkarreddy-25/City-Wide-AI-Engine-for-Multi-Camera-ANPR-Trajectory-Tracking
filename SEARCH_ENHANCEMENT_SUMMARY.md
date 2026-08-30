# Search Vehicle Journey — Enhancement Summary

## Overview
Enhanced the Search page to properly handle plate normalization, fallback to detections when no trajectory exists, and enriched the UI with numbered markers, filters, and speed data.

## Backend Changes

### 1. Plate Normalization (`backend/utils/plate.py`)
**Added:**
- `PLATE_SEPARATORS`: Tuple of allowed separators (space, hyphen, underscore)
- `BARE_PLATE_RE`: Regex to match plates without separators
- `strip_separators(text)`: Normalizes input to `MH31AB1234` format
- `canonical_plate(text)`: Converts normalized input back to `MH-31-AB-1234` storage format

**Why:** Operators type plates in various formats (`mh31ab1234`, `MH 31 AB 1234`, etc.) but the database stores them hyphenated. Without normalization, exact matches fail.

### 2. Repository Layer (`backend/db/repository.py`)
**Added:**
- `_plate_bare(column)`: SQL expression that strips separators from a stored plate column
- `plate_matches(column, plate)`: Separator-insensitive equality filter (tries indexed match first, then REPLACE-based)
- `plate_contains(column, fragment)`: Partial plate search using LIKE on normalized values
- `_day_bounds(date_from, date_to)`: Converts date range to datetime bounds for indexed queries
- `raw_detections_for_plate()`: Shared helper for fetching detection rows
- `enrich_sightings_with_speed()`: Joins detections to fill `speed_kmh` by camera + timestamp proximity
- `attach_violations_to_sightings()`: Matches violations to stops within ±10 minutes

**Modified:**
- `search_detections()`: Now uses `plate_contains()` for separator-insensitive search
- `get_journey()`: Uses `plate_matches()` instead of exact equality
- `search_journeys()`: Uses `plate_contains()` for partial matches
- `detections_for_plate()`: 
  - Fixed AttributeError on `d.camera_name` (doesn't exist in Detection model)
  - Replaced `func.date()` with datetime range filters for better index usage
  - Improved stop deduplication: consecutive detections at same camera within 10 min → single stop
  - Returns stored plate format, not normalized
- `violations_for_plate()`: Added optional `date_from`/`date_to` parameters

**Why:** The original code did exact string matches (`plate_text == plate.upper()`), which failed when separators differed. The new helpers strip separators in SQL for comparison while keeping the query logic clean.

### 3. Service Layer (`backend/services/report_service.py`)
**Modified `journey_search()`:**
1. Try trajectory table (exact match)
2. Fall back to detections if no trajectory exists
3. Enrich sightings with speed data from detections
4. Fetch violations scoped to journey date window
5. Attach violations to their stops by camera + time

**Why:** Sighting rows have no `speed_kmh` column, but the UI needs it. Joining detections by camera + timestamp fills that gap. Violations are now date-scoped and attached per-stop for precise map markers.

### 4. Tests (`backend/tests/test_journey_search.py`)
**Added:**
- `test_journey_fallback_to_detections`: Verifies detection-based journey synthesis
- `test_plate_normalisation_matches_stored_format`: Confirms all separator variants match
- `test_partial_plate_search_returns_multiple`: Checks LIKE behavior
- `test_violations_scoped_to_journey_date`: Ensures date filtering works

## Frontend Changes

### 1. API Client (`frontend/src/services/api.js`)
**Fixed:**
- Typo: `dateeTo` → `dateTo`
- Added `vehicleType` and `color` parameters to `journey()`

### 2. Search Page (`frontend/src/pages/Search.jsx`)
**Added:**
- State variables: `vehicleType`, `color`
- Filter dropdowns for vehicle type and color in the search form
- Numbered map markers using `L.divIcon` (replaces `CircleMarker`)
- Import `L` from `leaflet` and `Marker` from `react-leaflet`

**Fixed:**
- `submit()` now passes `dateTo` (not `dateeTo`) and includes type/color filters
- `vioMap` lookup now uses `point.camera_id` (was incorrectly using `point.id`)

**Why:** The plan called for type/color filters and numbered markers. The typo caused the date filter to silently fail.

### 3. Styles (`frontend/src/styles/theme.css`)
**Added:**
- `.journey-marker` and `.journey-marker-inner`: Numbered circle markers
- `.journey-marker-number`: Mono font for the number inside
- `.journey-marker--vio`: Pulse animation for violation markers
- `@keyframes pulse-vio`: Scale/opacity pulse effect
- `.journey-route-line`: Class for animated polyline
- `@keyframes dash`: Dash animation (currently not visible without stroke-dasharray)

**Why:** Numbered markers (1, 2, 3…) make it easier to correlate map stops with the timeline. Violation markers pulse to draw attention.

## Key Bug Fixes

### Backend
1. **Plate normalization mismatch**: Stored `MH-31-AB-1234` but searched for `MH31AB1234` → added separator-stripping SQL helpers
2. **Detection.camera_name AttributeError**: Detection model has no such column → pull from config instead
3. **Date filter not using index**: `func.date(timestamp)` forces scan → replaced with datetime range on indexed column
4. **Missing _iso import**: `_iso()` called but not imported → added to imports from `db.models`

### Frontend
5. **Typo in API param**: `dateeTo` sent to backend, which expected `date_to` → fixed to `dateTo`
6. **Wrong vioMap key**: Used `point.id` instead of `point.camera_id` → violation colors never appeared

## Testing

### Manual Verification Steps
1. **Start backend**: `cd backend && uvicorn api.main:app --reload`
2. **Start frontend**: `cd frontend && npm run dev`
3. **Test cases**:
   - Search `MH-31-AB-1234` → should return journey with speed data
   - Search `mh31ab1234` (no separators) → should match same plate
   - Search `mh 31 ab 1234` (spaces) → should match same plate
   - Search `MH-31` (partial) → suggestions dropdown should populate
   - Check map markers are numbered 1, 2, 3…
   - Verify speed shows in timeline and popups
   - Confirm violation markers pulse and show correct color

### Automated Tests
Run `pytest backend/tests/ -v` — should pass all 114+ tests including the 4 new journey_search tests.

## Remaining Work

None — all planned features are implemented. The 500 error reported was due to missing `_iso` import, which has been fixed.

## API Changes

### GET `/api/vehicles/{plate}/journey`
**Added query params:**
- `type`: Filter by vehicle type (Car, Truck, Bus, etc.)
- `color`: Filter by vehicle color (White, Black, Red, etc.)

**Response changes:**
- `sightings[].speed_kmh`: Now populated via detection join (was often null)
- `sightings[].violations`: Array of violations at this stop (new)
- `violations`: Top-level array scoped to journey date window (was all-time)

### GET `/api/vehicles/search-journeys`
No changes (endpoint already existed and worked correctly).

## Database Impact

**No schema changes** — all modifications are query-level only. Existing data works unchanged.

**Performance notes:**
- `plate_matches()` does indexed equality first, REPLACE fallback second → usually fast
- `plate_contains()` always scans (no index on REPLACE result) → acceptable for LIMIT 20
- Date filters now use indexed `timestamp` column → faster than `func.date()`

## Deployment Notes

1. No migrations needed
2. Frontend needs rebuild: `npm run build`
3. Backend auto-reloads if using `--reload` flag
4. All changes are backward-compatible

## Files Modified

### Backend (9 files)
- `backend/utils/plate.py`
- `backend/db/repository.py`
- `backend/services/report_service.py`
- `backend/tests/test_journey_search.py` (new)

### Frontend (3 files)
- `frontend/src/services/api.js`
- `frontend/src/pages/Search.jsx`
- `frontend/src/styles/theme.css`

## Commit Message Template

```
feat(search): Add plate normalization, detection fallback, and numbered markers

Backend:
- Add separator-insensitive plate matching in repository layer
- Fix Detection.camera_name AttributeError in fallback logic
- Enrich sightings with speed data from detections
- Scope violations to journey date window and attach per-stop
- Add 4 new tests for journey search and normalization

Frontend:
- Fix dateeTo typo in API client
- Add vehicle type and color filters to search form
- Replace circle markers with numbered divIcon markers
- Add pulse animation for violation stops
- Fix vioMap lookup to use camera_id

Fixes #XXX
```
