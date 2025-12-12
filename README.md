# Megumi storefront

A lightweight multi-page site (boys, girls, parents) with MongoDB-backed credentials and product catalog.

## Getting started

1. Install dependencies (none are required by default)
   ```bash
   npm install
   ```
   - If you want real MongoDB persistence, add the official driver after install:
     ```bash
     npm install mongodb
     ```
2. Set environment variables (optional)
   - `MONGODB_URI` – defaults to `mongodb://localhost:27017/megumi`
   - `PORT` – defaults to `3000`
3. Run the server
   ```bash
   npm start
   ```
4. Visit `http://localhost:3000` for the home page, with navigation to boys, girls, and parents pages.
   - If MongoDB is unavailable or the driver is not installed, the server automatically falls back to an in-memory store so pages stay functional (data will reset on restart). Install the `mongodb` package and set `MONGODB_URI` to persist data.

## Deploying to Vercel
- The included `vercel.json` routes all traffic through `api/server.js`, which re-exports the request handler from `server.js`. Deploy the project root and Vercel will serve the same static pages and API without needing Express.

## Features
- Register/login endpoints storing hashed credentials in MongoDB.
- CRUD product API with category filtering.
- Static pages for boys, girls, and parents that can add and list items per category.
- Landing page with quick-add form and latest product feed.

## Notes
- Design assets from the provided Google Drive link can be added by pasting their URLs into the image URL fields when creating products.
- If you need to reset products during testing, clear the `products` collection in your database.
