# Brightloop

A subscription workspace for the Makeaton challenge: catalog → quotation → subscription → invoice → payment → revenue insight.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. A persistent demo database is created in `data/` on first boot. The sign-in screen provides clearly labeled demo accounts. Optional settings are in `.env.example`.

```sh
npm test
npm run build
npm start
```

The production server serves the built frontend on port 3001. Deployment and presentation instructions will be included with the finished application.

See [requirements](docs/REQUIREMENTS.md) for the complete scope and implementation decisions.
