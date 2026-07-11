# Tzmliy monorepo

Combines the two previously separate repos into one:

- `backend/` — FastAPI modular monolith (formerly `Fenix-dev-72/Tzmliy`). See `backend/CLAUDE.md` for architecture, `backend/README.md` for setup.
- `frontend/` — React/Vite SPA (formerly `Fenix-dev-72/Tizimliy-frontent`). See `frontend/CLAUDE.md` for setup.

Each side keeps its own dependency manifest (`backend/requirements.txt`, `frontend/package.json`) and is run independently — this is a monorepo for shared history/review, not a shared build.
