# Gov IT Prep Portal

Smart preparation and learning portal for Government IT job candidates (Bangladesh).

- `frontend/` React + Vite + Tailwind 
- `backend/` FastAPI + MongoDB Atlas

Status: Phase 1 

## Backend
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m scripts.create_admin     # first admin account (once)
python -m uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

## Frontend
```powershell
cd frontend
npm install
npm run dev
```
App: http://localhost:5173
