# Painting workshop (Expo)

Android app for **painting department jobs** only: list orders from carpentry, play/pause/stop timer, finish → credit **Warehouse Floor 1** (`/warehouse-products`).

## Setup

```bash
cd mobile-apps/painting-workshop
npm install
npm start
```

`postinstall` materializes `shared/` and UI from `warehouse-upholstery`.

Launcher icons come from **`Painting.png`** in this folder (rounded, inset so masks do not clip). Regenerate:

```bash
npm run icons
# or force refresh:
# set FORCE_PAINTING_ICONS=1 && npm run icons   (Windows)
```

## Access

User Access → Production → enable **Painting (Android)** (`painting_workshop_app`).

Carpentry app **Painting** tile sends Floor 2 WIP to painting (deducts Floor 2, creates `painting_production_jobs`).

## API ops (warehouse-mobile)

- `painting-access-self`
- `painting-job-list` / `pause` / `resume` / `finish`
- `painting-send-from-floor2` (carpentry)

Deploy web API before devices call new ops.
