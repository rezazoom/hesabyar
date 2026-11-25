# حساب‌یار (HesabYar) — Offline Personal Finance PWA

**حساب‌یار** is a privacy-first, Persian (`fa-IR` / RTL) personal finance manager and Jalali (Shamsi) ledger that runs 100% locally in your browser with zero backend servers, zero tracking, and full offline PWA support.

## Credits & Origin

- **Original Project**: Created by **Sajjad Allahyari** as the original single-file **حساب‌یار PRO 3.3** application (preserved intact in the initial commit of this repository).
- **Persian Font**: Variable Farsi-digit **Arad** (`AradFDVF.woff2`) by [Mohammad Darvishi](https://github.com/MohamadDarvishi/Arad) under the SIL Open Font License (`assets/fonts/OFL.txt`).
- **Offline Vendored Libraries**:
  - [Chart.js](https://www.chartjs.org/) (`v4.6.2`) — interactive dashboard & report visualizations
  - [jalaali-js](https://github.com/jalaali/jalaali-js) (`v2.0.1`) — $O(1)$ Jalali/Gregorian calendar arithmetic
  - [Lucide](https://lucide.dev/) (`v1.79.0`) — crisp vector UI icons
  - [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file) (`v4.1.1`) — native `.xlsx` spreadsheet export

---

## Features

- **Multi-Account / Bank Cards & Transfers**: Track separate bank cards, cash wallets, and savings accounts with card-to-card transfers that update per-account balances without inflating income/expense totals.
- **Automatic Monthly Carryover**: Closing balances automatically carry forward to the next Jalali month, while allowing explicit per-account opening reconciliation when needed.
- **Partial Payments & Flexible Obligations**:
  - **Installments (اقساط)**: 2-step wizard, active plan editing, progress tracking, and partial or full payment history per installment.
  - **Bills & Fixed Expenses (قبوض و شارژ)**: Recurring or single bills with per-month editable amounts/due dates for variable utilities.
  - **Loans & Receivables (قرض و طلب)**: Track money lent and borrowed with full or partial repayment histories.
- **Categories, Monthly Budgets & Recurring Rules**:
  - Customizable income/expense categories with color chips.
  - Monthly spending caps with `80%` warning and `100%` over-budget alerts.
  - Recurring income/expense templates appearing as one-click confirmable reminders by default, with an optional per-rule auto-post toggle.
- **Interactive Jalali UX**: Popover Persian calendar date picker, caret-preserving Persian numeral/thousands-separator money inputs, responsive desktop sidebar + mobile bottom bar/cards, and non-blocking toasts/dialogs.
- **Charts, Exports & Backups**:
  - Interactive Chart.js category doughnut, account balance bar, and multi-month inflow/outflow comparisons.
  - Formula-safe CSV export, native multi-sheet Excel (`.xlsx`) export, and full JSON backup/restore (with automatic migration from PRO 3.3 `hesabyar-v1` data and JSON backups).
- **Theming & Offline PWA**: 8 built-in themes, 4 live color pickers, custom uploaded font storage in IndexedDB, and Service Worker caching for offline installability.

---

## Running Locally

Because HesabYar uses native ES Modules (`<script type="module">`) and a Service Worker (`sw.js`), serve the folder over HTTP rather than opening `index.html` via `file://`:

```bash
# Python 3
python3 -m http.server 8080

# or Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser. Click the browser's install icon to install **حساب‌یار** as an offline desktop or mobile PWA, or open [`help.html`](help.html) for the interactive Persian user guide.

## Documentation

- **User Guide (Persian)**: [`help.html`](help.html)
- **What's New & Improvements for End Users (Persian)**: [`docs/IMPROVEMENTS.fa.md`](docs/IMPROVEMENTS.fa.md)
- **Technical Architecture & Data Schema**: [`docs/TECHNICAL.md`](docs/TECHNICAL.md)
