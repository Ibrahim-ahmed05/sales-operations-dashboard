# Meridian Dashboard

Meridian is a sales and operations dashboard backed by the supplied SQLite dataset.

## Run locally

Use Node.js 24 or newer:

```sh
npm install
npm run dev
```

## Build and start in production

```sh
npm run build
npm start
```

The deployed runtime needs `var/dashboard.sqlite`, which contains the imported source data and metadata. It is intentionally included in the project while local credentials, reports, and temporary files remain ignored.

## Useful checks

```sh
npm test
npm run lint
```

The dashboard opens directly in its demo workspace. Authentication endpoints and role handling remain available for deployments that later require secured access.
