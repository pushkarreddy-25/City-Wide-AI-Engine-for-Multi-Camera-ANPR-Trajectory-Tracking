# UI/UX Design Document
## City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking

**Version:** 1.0  
**Date:** August 2026  

---

## 1. Design Principles

1. **Data Clarity:** Visualize complex traffic data in instantly understandable formats (heatmaps, alerts)
2. **Action-Oriented:** Every screen should enable quick action (dismiss violation, search vehicle)
3. **Real-Time Feedback:** Updates happen smoothly; no jarring refreshes
4. **Responsive Design:** Works on desktop (1920x1080), tablet (iPad), and mobile (fallback)
5. **Dark Mode for 24/7:** Eye-friendly dark theme (traffic centers operate 24/7)
6. **Minimal Jargon:** Labels in Hindi/English for traffic police (non-technical)

---

## 2. Information Architecture

```
Dashboard (Home)
├─ Live Map View
├─ Real-Time Stats
└─ Violation Feed

Navigation Menu
├─ Dashboard (default)
├─ Violations (detailed view)
├─ Search Vehicle
├─ Reports
│  ├─ Daily Volume
│  ├─ Congestion Heatmap
│  └─ Violation Summary
└─ Settings

User Menu
├─ Profile
├─ Logout
└─ Help
```

---

## 3. Color Palette & Typography

### 3.1 Colors
- **Background:** `#1a1a1a` (dark gray, eye-friendly)
- **Surface:** `#2d2d2d` (card backgrounds)
- **Primary Brand:** `#0066ff` (blue, action buttons)
- **Status Colors:**
  - **Green (Free-flowing):** `#00cc00` or `#22c55e`
  - **Yellow (Moderate):** `#ffaa00` or `#eab308`
  - **Red (Congested/Violation):** `#ff3333` or `#ef4444`
  - **Orange (Caution):** `#ff9500` or `#f97316`

- **Text:**
  - **Primary text:** `#ffffff` (white, readable on dark)
  - **Secondary text:** `#a0a0a0` (gray, de-emphasized)
  - **Alert/Important:** `#ff6b6b` (red)

### 3.2 Typography
- **Font Family:** Inter, Segoe UI, or system fonts
- **Headings:** Bold, 20-32px
- **Body Text:** Regular, 14-16px
- **Monospace (for plate numbers):** JetBrains Mono or Courier, 14px (easy to read)

---

## 4. Dashboard Layout (Default View)

### 4.1 Component Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ HEADER: ANPR Traffic Intelligence | Time | User Profile│
├──────────┬───────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN CONTENT AREA                             │
│          │                                               │
│ • Dash   │ ┌──────────────────────────────────────┐    │
│ • Viols  │ │  LIVE MAP                            │    │
│ • Search │ │  (Camera locations, vehicles,        │    │
│ • Reports│ │   congestion overlay)                │    │
│ • Settngs│ │                                      │    │
│          │ │   🔵 Camera 1 (Sitabuldi)            │    │
│          │ │   • 45 vehicles currently visible    │    │
│          │ │   🟡 Camera 2 (Dhantoli)             │    │
│          │ │   • 32 vehicles                      │    │
│          │ │   🔴 Camera 3 (Nagpur Square)        │    │
│          │ │   • 67 vehicles (congestion)         │    │
│          │ │                                      │    │
│          │ └──────────────────────────────────────┘    │
│          │                                               │
│          │ ┌──────────────────────────────────────┐    │
│          │ │ REAL-TIME STATS (Grid, 3 columns)   │    │
│          │ ├──────────────────────────────────────┤    │
│          │ │ Total Vehicles:  238 │ Congestion:  │    │
│          │ │                     │ 58% (HIGH)   │    │
│          │ │ Active Violations: │ Avg Speed:   │    │
│          │ │ 12 (🔴 5 High) │ 18 kmh         │    │
│          │ └──────────────────────────────────────┘    │
│          │                                               │
│          │ ┌──────────────────────────────────────┐    │
│          │ │ VIOLATION ALERT FEED (Live)          │    │
│          │ ├──────────────────────────────────────┤    │
│          │ │ 🔴 Red Light 10:32:15                │    │
│          │ │    MH-31-AB-1234 | Camera 3          │    │
│          │ │    [View Details] [Dismiss]          │    │
│          │ │                                      │    │
│          │ │ 🟡 Lane Violation 10:30:52           │    │
│          │ │    MH-31-XY-5678 | Camera 1          │    │
│          │ │    [View Details] [Dismiss]          │    │
│          │ └──────────────────────────────────────┘    │
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

---

## 5. Screen Designs (Detailed)

### 5.1 Dashboard (Full Screen)

**Live Map Component:**
- Center: Interactive map (Leaflet or Folium-based)
- Camera locations shown as colored circles (🔵 normal, 🟡 warning, 🔴 congestion)
- Vehicle positions as small car icons
- Click camera → Zoom to that intersection
- Click vehicle → Show quick info panel (plate, type, color)
- Heatmap overlay toggle (toggles congestion colors over roads)

**Real-Time Stats (Mini Cards):**
```
┌───────────────────────┬───────────────────────┐
│ Total Vehicles        │ Congestion Level      │
│ 238                   │ 58% (MEDIUM-HIGH)     │
│ ↑ +15 last 5 min      │ 🟡 Moderate           │
├───────────────────────┼───────────────────────┤
│ Active Violations     │ Average City Speed    │
│ 12 (5 High, 7 Med)    │ 18 kmh                │
│ 🔴🔴🔴🔴🔴 🟡🟡       │ ↓ -2 kmh (slowdown)   │
└───────────────────────┴───────────────────────┘
```

**Violation Alert Feed (Scrollable List):**
```
━━━ RECENT ALERTS ━━━

🔴 [HIGH] Red Light Violation
   10:32:15 | Camera 3 (Nagpur Square)
   Vehicle: MH-31-AB-1234 | Silver SUV
   [📷 View Image] [➜ View Route] [✓ Resolve]

🟡 [MEDIUM] Lane Violation
   10:30:52 | Camera 1 (Sitabuldi)
   Vehicle: MH-31-XY-5678 | Blue Car
   [📷 View Image] [➜ View Route] [✓ Resolve]

🟡 [MEDIUM] Speed Violation
   10:28:30 | Camera 2 (Dhantoli)
   Vehicle: MH-31-ZZ-9999 | Black Truck
   Estimated: 55 kmh (Limit: 40 kmh)
   [📷 View Image] [➜ View Route] [✓ Resolve]
```

---

### 5.2 Violations Detail Screen

When user clicks "View Details" or "View Image":

```
┌──────────────────────────────────────────────┐
│ ← Back to Dashboard                          │
├──────────────────────────────────────────────┤
│ VIOLATION DETAILS                            │
├──────────────────────────────────────────────┤
│                                              │
│ [Large Image: Violation screenshot]          │
│ (Red-light runner crossing stop line)        │
│                                              │
├──────────────────────────────────────────────┤
│ VIOLATION INFO:                              │
│ • Type: Red Light Crossing                   │
│ • Severity: HIGH                             │
│ • Time: 2026-08-23 10:32:15                  │
│ • Camera: Nagpur Square Intersection         │
│                                              │
│ VEHICLE INFO:                                │
│ • Plate: MH-31-AB-1234                       │
│ • Type: SUV                                  │
│ • Color: Silver                              │
│ • Confidence: 92%                            │
│                                              │
│ ACTIONS:                                     │
│ [📥 Download Image] [📄 Print Ticket]        │
│ [➜ Show Journey] [✓ Mark Resolved]           │
│                                              │
│ NOTES (Optional):                            │
│ [Text area for police comments]              │
│                                              │
└──────────────────────────────────────────────┘
```

---

### 5.3 Search Vehicle Screen

**Plate Search Interface:**
```
┌──────────────────────────────────────────────┐
│ ← Back                                       │
├──────────────────────────────────────────────┤
│ SEARCH VEHICLE JOURNEY                       │
├──────────────────────────────────────────────┤
│                                              │
│ License Plate: [MH-31-AB-1234]               │
│ (Format: XX-XX-NN-NNNN)                      │
│                                              │
│ Date: [2026-08-23] ▼                         │
│                                              │
│ [🔍 Search]                                  │
│                                              │
├──────────────────────────────────────────────┤
│ SEARCH RESULT:                               │
├──────────────────────────────────────────────┤
│                                              │
│ Vehicle: Silver SUV                          │
│ Plate: MH-31-AB-1234                         │
│ Date: 2026-08-23 (8 sightings)               │
│                                              │
│ JOURNEY MAP:                                 │
│ [Interactive map showing journey path]       │
│                                              │
│ SIGHTINGS (chronological):                   │
│ 1️⃣ 08:15 - Sitabuldi Intersection            │
│    🔷 Direction: North                       │
│                                              │
│ 2️⃣ 08:22 - Dhantoli Intersection             │
│    🔷 Direction: North                       │
│                                              │
│ 3️⃣ 08:31 - Nagpur Square Intersection        │
│    🔷 Direction: East                        │
│    ⚠️ Violation: Red Light                   │
│                                              │
│ [Download Report] [Export CSV]               │
│                                              │
└──────────────────────────────────────────────┘
```

---

### 5.4 Reports Screen

**Report Dashboard (Tab View):**

#### Tab 1: Daily Volume Report
```
┌──────────────────────────────────────────────┐
│ DAILY TRAFFIC VOLUME REPORT                  │
├──────────────────────────────────────────────┤
│ Date: [2026-08-23] ▼                         │
│ [Generate Report]                            │
│                                              │
│ SUMMARY:                                     │
│ Total Vehicles: 12,450                       │
│ Peak Hour: 08:00-09:00 (1,850 vehicles)      │
│ Off-Peak: 02:00-03:00 (180 vehicles)         │
│                                              │
│ BY VEHICLE TYPE (Bar Chart):                 │
│ ████████████ Cars (65%) ............ 8,093   │
│ ███████ Trucks (18%) .............. 2,241   │
│ ████ Motorcycles (14%) ............ 1,743   │
│ █ Buses (3%) ....................... 373   │
│                                              │
│ BY CAMERA (Table):                           │
│ Camera 1 (Sitabuldi)      2,340 vehicles     │
│ Camera 2 (Dhantoli)       3,100 vehicles     │
│ Camera 3 (Nagpur Square)   4,210 vehicles    │
│ Camera 4 (Ajni)           2,800 vehicles     │
│                                              │
│ [📥 Export CSV] [🖨️ Print]                    │
│                                              │
└──────────────────────────────────────────────┘
```

#### Tab 2: Congestion Heatmap
```
┌──────────────────────────────────────────────┐
│ CONGESTION HEATMAP (Historical)              │
├──────────────────────────────────────────────┤
│ Date Range: [2026-08-16] to [2026-08-23] ▼  │
│ Time of Day: [All] ▼ (or 08:00-09:00)        │
│ [Generate Heatmap]                           │
│                                              │
│ [Interactive map with heat colors]           │
│ 🔴 High Congestion (>80% capacity)           │
│ 🟡 Medium Congestion (50-80%)                │
│ 🟢 Free-Flowing (<50%)                       │
│                                              │
│ Insights:                                    │
│ • Nagpur Square: Persistent bottleneck      │
│ • Sitabuldi: Morning peak congestion         │
│ • Dhantoli: Evening bottleneck 17:00-18:30  │
│                                              │
│ Recommendation: Add signal at Sitabuldi      │
│ during 08:00-09:00 window.                   │
│                                              │
│ [📥 Export PNG] [📄 Export Report]            │
│                                              │
└──────────────────────────────────────────────┘
```

#### Tab 3: Violation Summary
```
┌──────────────────────────────────────────────┐
│ VIOLATION SUMMARY REPORT                     │
├──────────────────────────────────────────────┤
│ Date Range: [2026-08-16] to [2026-08-23] ▼  │
│ [Generate Report]                            │
│                                              │
│ TOTAL VIOLATIONS: 342                        │
│ • High Severity: 180 (53%)                   │
│ • Medium Severity: 98 (29%)                  │
│ • Low Severity: 64 (18%)                     │
│                                              │
│ BY TYPE (Pie Chart):                         │
│ ██████████████████░░ Red Light    180 (53%) │
│ ████████░░░░░░░░░░░░ Lane Vio.     98 (29%) │
│ ████░░░░░░░░░░░░░░░░░ Speed       64 (18%) │
│                                              │
│ TOP 10 REPEAT OFFENDERS:                     │
│ 1. MH-31-XY-5678 ............ 12 violations │
│ 2. MH-31-ZZ-9999 ............ 11 violations │
│ 3. MH-31-AB-1234 ............ 9 violations  │
│ ... [Continue to 10]                         │
│                                              │
│ [📥 Export CSV] [📄 Export PDF] [🖨️ Print]   │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 6. User Flows

### 6.1 Flow: Traffic Police Officer Monitors Live Violations

```
START
 ↓
[Open Dashboard]
 ↓
Sees violation alert in feed
"🔴 Red Light | MH-31-AB-1234 | Camera 3"
 ↓
Clicks [View Details]
 ↓
[Violation Detail Screen]
- Sees violation image
- Confirms vehicle details
 ↓
Options:
A) [Mark Resolved] → Close alert, continue monitoring
B) [Download Image] → Save for prosecution
C) [Show Journey] → View where vehicle came from
 ↓
(Depending on choice, proceeds to next action or returns to dashboard)
 ↓
END
```

### 6.2 Flow: City Planner Analyzes Congestion

```
START
 ↓
[Open Dashboard → Reports]
 ↓
Select "Congestion Heatmap" tab
 ↓
Set date range: Last 7 days
Set time filter: 08:00-09:00 (morning peak)
 ↓
Click [Generate Heatmap]
 ↓
[Congestion Heatmap Screen]
- Views heat colors on map
- Identifies red zones (bottlenecks)
- Reads insights/recommendations
 ↓
Clicks [Export Report]
 ↓
[Save PDF with heatmap + data]
 ↓
Uses report in city planning meeting
 ↓
END
```

### 6.3 Flow: Search for Specific Vehicle Journey

```
START
 ↓
[Open Dashboard → Search Vehicle]
 ↓
Enters plate number: MH-31-AB-1234
Enters date: 2026-08-23
 ↓
Clicks [Search]
 ↓
Backend queries DB: 8 sightings found
 ↓
[Journey Result Screen]
- Shows map with 8 points (journey path)
- Lists chronological sightings with timestamps
 ↓
Officer can:
A) Click on sighting → See image from that camera
B) [Download Report] → Get full journey summary
C) Identify violations in journey
 ↓
END
```

---

## 7. Mobile Responsive Behavior

### 7.1 Breakpoints
- **Desktop:** >1024px (full sidebar + content side-by-side)
- **Tablet:** 768-1024px (collapsed sidebar, stacked content)
- **Mobile:** <768px (hamburger menu, vertical layout)

### 7.2 Mobile Dashboard
```
(Mobile view - portrait)
┌─────────────────────────┐
│ ☰ ANPR Traffic | Time   │
├─────────────────────────┤
│                         │
│ MAP (full width,        │
│ smaller height)         │
│                         │
├─────────────────────────┤
│ STATS CARDS             │
│ (2 columns, scrollable) │
├─────────────────────────┤
│ VIOLATION FEED          │
│ (scrollable, full width)│
│                         │
└─────────────────────────┘

(Mobile view - landscape)
┌────────────────────────────────┐
│ ☰ | MAP (left) | FEED (right) │
└────────────────────────────────┘
```

---

## 8. Accessibility & Usability

### 8.1 WCAG 2.1 AA Compliance
- **Color Contrast:** All text ≥4.5:1 against background
- **Keyboard Navigation:** All buttons accessible via Tab + Enter
- **Screen Readers:** Semantic HTML, ARIA labels on dynamic content
- **Alt Text:** All images have descriptions
- **Text Size:** Resizable without loss of function (Ctrl+Plus)

### 8.2 Localization
- **English & Hindi:** Toggle language in Settings
- **Plate Format:** Supports Indian plate standards (XX-XX-NN-NNNN)
- **Time Format:** 24-hour HH:MM format (standard in India)
- **Numbers:** Use comma separators (1,234 vehicles)

### 8.3 Loading States
- **Spinner:** Loading violation feed → animated spinner
- **Skeleton:** Loading report → skeleton placeholder cards
- **Debounce:** Search plate → debounce 300ms to reduce API calls

---

## 9. Dark Mode Implementation

All backgrounds use dark palette (default, no toggle needed for 24/7 operations):

```css
:root {
  --bg-dark: #1a1a1a;
  --surface-dark: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --border: #404040;
  
  --status-green: #22c55e;
  --status-yellow: #eab308;
  --status-red: #ef4444;
}
```

---

## 10. Interaction Patterns

### 10.1 Alerts & Modals
**Violation Alert Toast (top-right corner, auto-dismiss after 8s):**
```
┌────────────────────────────┐
│ 🔴 Red Light Violation!     │
│ MH-31-AB-1234 (Camera 3)    │
│ [View Details] [Dismiss] ✕  │
└────────────────────────────┘
```

**Confirmation Modal (before critical action):**
```
┌─────────────────────────────────┐
│ Resolve Violation?              │
│                                 │
│ Mark this violation as resolved?│
│ (Cannot be undone)              │
│                                 │
│ [Cancel] [Confirm]              │
└─────────────────────────────────┘
```

### 10.2 Hover & Interaction States
- **Buttons:** Color change + slight scale (0.95) on hover
- **Cards:** Subtle shadow increase on hover
- **List Items:** Highlight background on hover
- **Map Markers:** Expand + show tooltip on hover

---

## 11. Component Library (Sketch)

```
Atoms:
- Button (primary, secondary, danger)
- Badge (status, severity)
- Input (text, select)
- Card (elevated, outlined)
- Icon (vehicle, camera, alert)

Molecules:
- Alert Box
- Stat Card
- Violation Item
- Sighting Row

Organisms:
- Dashboard Panel
- Violation Feed
- Report Table
- Map Component
- Header Nav
```

---

## 12. Animation & Micro-Interactions

### 12.1 Transitions
- **Page change:** Fade-out (100ms) + fade-in (100ms)
- **Dropdown open:** Expand (200ms, ease-out)
- **Vehicle on map:** Appear with subtle bounce (300ms)

### 12.2 Live Updates
- **New violation alert:** Slide in from top (200ms)
- **Vehicle position update:** Smooth movement (500ms transition)
- **Heatmap update:** Fade colors change (1s)

### 12.3 Feedback
- **Button click:** Ripple effect (Material Design)
- **Form error:** Shake animation (200ms) + red highlight
- **Success:** Green check mark + toast notification

---

## 13. Testing & Validation

### 13.1 Usability Testing Checklist
- ✅ Can traffic officer find violation in <5 seconds?
- ✅ Can officer dismiss/resolve violation in 2 clicks?
- ✅ Can planner export report within 30 seconds?
- ✅ Is map readable and zoomable on desktop + mobile?
- ✅ Do all buttons have clear labels?

### 13.2 Design QA
- ✅ Contrast check: All text meets WCAG AA
- ✅ Responsive check: Works on 320px, 768px, 1920px widths
- ✅ Performance: No jank on animation, <60ms frame times
- ✅ Accessibility: Full keyboard navigation, screen reader tested

---

## 14. Design Assets & Resources

**Recommended Design Tools:**
- **Figma:** Create wireframes, prototypes, component library
- **Storybook:** React component showcase
- **Lighthouse:** Performance & accessibility audit

**Icon Pack:**
- FontAwesome (vehicle, camera, alert, search, download)
- Lucide React (lightweight SVG icons)

**Font Links (CDN):**
```html
<!-- Inter from Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">

<!-- JetBrains Mono for plate numbers -->
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
```

---

**Next Steps:** Proceed to Development Plan for implementation roadmap and timeline.
