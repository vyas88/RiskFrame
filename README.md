# RiskFrame

RiskFrame is a transparent IFRS 9 credit-risk analytics app. It calculates expected credit loss as `PD x LGD x EAD`, explains every key figure, and runs entirely from request-scoped CSV data.

## Local run

Requirements: Python 3.9+ and Node.js 20+.

Start the FastAPI backend from the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the Vite frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. Development requests under `/api/*` are proxied to FastAPI. The bundled samples are read from `backend/app/data/` on every request.

## Deployment on Vercel

The root `vercel.json` builds the Vite frontend and bundles `frontend/dist/**` plus the read-only sample CSV files in the Python function. `api/index.py` exposes the FastAPI application, `requirements.txt` declares the Python runtime packages, and the frontend uses a same-origin API base (`""`) so `/api/*` works on Vercel.

1. Import the GitHub repository into Vercel, or link it locally with `npx vercel link`.
2. Keep the project root at the repository root. Do not set a separate frontend root directory.
3. Push the production branch. Git-connected Vercel projects deploy the push automatically. Alternatively run `npx vercel --prod` from the repository root.
4. Wait for the deployment to reach Ready, then open its URL.

No database, login, persistent files, or module-level mutable state are used. Every analysis request loads either the bundled sample files or the rows supplied in that request body.

## Live smoke test checklist

1. Open the deployed URL and click **Use sample**.
2. On **Portfolio**, confirm KPIs, currency and percentage formatting, stage donut, ECL by region, monthly trend, and the baseline versus stressed strip.
3. Click a Portfolio KPI and confirm the explain drawer shows its formula and current inputs.
4. On **Scenarios**, change weights, normalise them, and confirm the three-factor sensitivity chart renders.
5. On **Borrower**, search for account `2`, change DPD from `8` to `45`, and confirm the what-if moves the borrower to Stage 2.
6. On **LGD Analysis**, confirm all available panels render and that EAD-weighted LGD matches the Portfolio LGD used value.
7. Confirm the early-warning watchlist and the clickable Data health chip populate.
8. On **Report**, confirm the preview matches the dashboard and the downloaded HTML opens as a standalone report.
9. Refresh the deployed page and repeat the Portfolio check. The bundled-sample results should be identical from a fresh request.
