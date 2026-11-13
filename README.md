# UUDS DXB Manpower Portal

> **Centralized Manpower Scheduling, Team Deployment & Tracking**  
> Operational Command & Duty Roster System for UUDS Dubai Airport (GST)

---

## ✈️ Overview

**UUDS DXB Manpower Portal** is an operations management application built for the UUDS Dubai International Airport workshop and cabin maintenance facilities. It coordinates **252 active personnel** across **10 operational teams** with live tracking of Day/Night/Mid shifts, minimum staffing compliance, document expiry alerts (Airside Passes, Contingent Cards, UAE Visas), and emergency replacements.

---

## 🛠️ Operational Teams

1. **On Wing Team A**
2. **On Wing Team B**
3. **On Wing Team C**
4. **Workshop Team**
5. **Leather Team**
6. **Paint Booth**
7. **Stores Team**
8. **A-Check & Aft Lounge**
9. **Office**
10. **Planner**

---

## 🚀 Key Features

- **Consolidated Command Dashboard**: Real-time staff deployment counts (On Duty, Day, Night, Training/General, Standby Pool, Coverage Alerts).
- **High-Contrast Digital Cockpit Clock**: Live UAE time (GST), bold date, and auto-updating current calendar day.
- **Per-Team Revision Tracking**: Individual publication badges (`PUBLISHED · R01`, etc.) per operational unit.
- **Interactive Master Roster Grid**: Color-coded 30-day shift matrix with day/night quick filtering and inline shift adjustment.
- **Quick Team Rosters**: Dropdown selector in the sidebar with live glowing team status indicators.
- **Compliance & Expiry Monitoring**: Automated tracking with 30/60/90-day alert tiers for Airside Passes, Contingent Cards, and Visas.
- **Emergency Incident Hub**: One-click replacement workflow with fatigue and turnaround safety guardrails.
- **Export Engine**: Instant Excel (.xlsx) and PDF roster downloads, plus WhatsApp duty briefing generator.
- **Persistent Audit Logging**: Full traceability for shift modifications, publications, and emergency incidents.

---

## 💻 Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Vite, Lucide Icons
- **Backend**: Node.js 22+, Express 5, `node:sqlite` (DatabaseSync)
- **Deployment**: Vercel Serverless (`/api`) + Static Hosting (`/dist`)

---

## 🏃 Getting Started Locally

### Prerequisites
- Node.js 22.5.0 or higher
- Windows / macOS / Linux

### Installation
```bash
# Clone the repository
git clone https://github.com/khurrammunir377-dot/uuds-dxb-manpower-portal.git
cd uuds-dxb-manpower-portal

# Install dependencies
npm install

# Build frontend
npm run build

# Start server
npm start
```

Or double-click `Launch-UUDS-Dashboard.bat` on Windows.  
Open [http://localhost:3001](http://localhost:3001) in your browser.

---

Designed and Developed for UUDS DXB Operations.
