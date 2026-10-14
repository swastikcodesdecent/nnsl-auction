# 🏆 NNSL 2026 - Official Players Auction Arena (INR ₹120 Crore Budget)

A broadcast-grade, televised sports player auction management platform built with **HTML5, CSS3, Vanilla JavaScript, and Firebase (Cloud Firestore & Cloud Functions)**.

Designed for live televised projector screens and mobile auctioneer touchpads with **NNSL 2026 branding**, starting purses of **₹ 120 Crore** per franchise, strict **8-player squad limits**, an **interactive Spin Wheel player picker**, and a **continuous scrolling purse ribbon ticker**.

---

## 🌟 Key Features & Specifications

1. **Rebranded to NNSL 2026**:
   - High-contrast, elegant typography using Google Fonts (**Outfit**, **Montserrat**, **Inter**, and **JetBrains Mono**).
   - Cohesive NNSL visual identity across all portals: Live Arena Screen, Auctioneer Podium, Command Dashboard, Franchises HQ, and Results.

2. **Televised Auction Broadcast Stage (`live.html`)**:
   - **Realistic Stadium Backdrop**: AI-rendered dark stadium broadcast environment (`images/nnsl_bg.jpg`) with dramatic volumetric arena spotlights.
   - **Circular Player Avatar**: Glowing orange/gold halo (`border: 6px solid #f97316`), top-left yellow lot number pill (`4`), vector athlete jersey silhouette, and age label below (`42 YRS`).
   - **Stacked Capsule Pills**:
     - Pill 1: Player Name (`MS DHONI`)
     - Pill 2: Main Role (`WICKET KEEPER` / `BATSMAN` / `ALL ROUNDER` / `FORWARD`)
     - Pill 3: Sub-role / Style (`Right Hand Batsman` / `Striker`)
     - Pill 4: Glowing Yellow Base Price (`BASE: ₹ 2.00 Cr`)
   - **Giant Bright Green Bid Readout**: High-contrast, lime-green numerals (`₹ 2.50 Cr`) with jump-pulse animations when bids increase.
   - **Leading Team Box**:
     - Team crest in glowing violet card.
     - Stacked metric bars: `PURSE LEFT: ₹ 117.50 Cr` and `PL. 1 / 8` (strict 8-player counter).
     - Bold franchise name (`NNSL KINGS`).
   - **Continuous Franchise Purse Ribbon Ticker**:
     - Animated 360-degree continuous scrolling broadcast ticker at the bottom of the screen.
     - Displays real-time remaining purse balances in Crores and squad slots (`(X/8 PL)`) for all participating franchises.

3. **Auctioneer Control Room & Spin Wheel (`auctioneer.html`)**:
   - **🎡 Interactive Player Spin Wheel**:
     - Canvas-based spin wheel with realistic angular physics and deceleration decay.
     - Web Audio API peg tick sound effects (`sound.playWheelTick()`) as wedges pass the top pointer.
     - Triumphant victory fanfare (`sound.playWheelWinner()`) on slice selection.
     - Direct "Send to Podium / Live TV Stage" action to instantly load the randomly selected player onto the stage.
   - Touchpad buttons for quick increments in INR: `+₹20 L`, `+₹50 L`, `+₹1 Cr`, `+₹2 Cr`, plus custom bid inputs.
   - Squad limit validation: teams that have reached 8 players are automatically locked from bidding.
   - Double-confirmation safety modals for `Confirm SOLD` and `Mark UNSOLD`.

4. **Strict 8-Player Squad Limit**:
   - Every team is capped at exactly 8 players maximum and minimum.
   - Bidding is automatically disabled for clubs once their squad reaches 8/8.

5. **Zero Demo Data & Bulk CSV Upload (`players.html`)**:
   - All demo players removed; database starts clean and ready for real tournament data.
   - Download pre-formatted CSV template or upload rosters in seconds.

---

## 📄 CSV Format for Importing Players

```csv
id,name,position,basePrice,nationality,club,age
1,MS Dhoni,WICKET KEEPER,20000000,India,Right Hand Batsman,42
2,Virat Kohli,BATSMAN,20000000,India,Right Hand Batsman,35
3,Jasprit Bumrah,BOWLER,15000000,India,Right Arm Fast,30
4,Hardik Pandya,ALL ROUNDER,15000000,India,Right Hand Fast-Medium,30
```

---

## 🛡️ Cloud Firestore Rules (`firestore.rules`)

Open security rules tailored for confined local-sector auctions without requiring authentication barriers:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tournament/{docId} { allow read, write: if true; }
    match /auctionState/{docId} { allow read, write: if true; }
    match /players/{playerId} { allow read, write: if true; }
    match /teams/{teamId} { allow read, write: if true; }
    match /auditLogs/{logId} { allow read, write: if true; }
    match /settings/{docId} { allow read, write: if true; }
  }
}
```

---

## 🚀 Running Locally

```bash
npx serve .
```

Open `http://localhost:3000` (or your laptop's local venue IP like `http://192.168.1.X:3000`) to project `live.html` on the arena TV while controlling bids and the Spin Wheel from `auctioneer.html` on an iPad or phone.
