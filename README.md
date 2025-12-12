# Megumi storefront

A lightweight multi-page site (boys, girls, parents) with MongoDB-backed credentials and product catalog.

## Getting started

1. Install dependencies
   ```bash
   npm install
   ```
2. Set environment variables (optional)
   - `MONGODB_URI` – defaults to `mongodb://localhost:27017/megumi`
   - `PORT` – defaults to `3000`
3. Run the server
   ```bash
   npm start
   ```
4. Visit `http://localhost:3000` for the home page, with navigation to boys, girls, and parents pages.

## Features
- Register/login endpoints storing hashed credentials in MongoDB.
- CRUD product API with category filtering.
- Static pages for boys, girls, and parents that can add and list items per category.
- Landing page with quick-add form and latest product feed.

## Notes
- Design assets from the provided Google Drive link can be added by pasting their URLs into the image URL fields when creating products.
- If you need to reset products during testing, clear the `products` collection in your database.
