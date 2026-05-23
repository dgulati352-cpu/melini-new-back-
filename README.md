# MELINI E-Commerce Professional Backend

Welcome to the backend server codebase for **MELINI** (`melini-new.vercel.app`). This backend is built using **Node.js**, **Express**, and **MongoDB (Mongoose)**, providing all the critical features required by the admin control panel and storefront checkout.

---

## ⚡ Main Core Features

1. **Catalog Article Management (Adding New Articles)**
   - Create, edit, list, and delete product articles.
   - Supports detailed metadata: product names, descriptions, categories, sizes, care instructions, material details, colors, custom size pricing (Sale Price and MRP), inventory stock toggle, and a unique **`articleNo`** (SKU).
   - Authenticated with secure admin credentials.

2. **Promo Codes & Coupons**
   - Public endpoint `/api/coupons/validate` to dynamically apply discount values at checkout.
   - Supports **Percentage (%)** and **Fixed Currency (₹)** discounts, minimum order threshold verification, usage limit counts, and expiration dates.
   - Admin control endpoints to list, create, delete, and toggle active coupon states.

3. **Secure Checkout & Order Management**
   - Razorpay transaction orders generation on payment intent.
   - Secure payment tracking and recording directly to the database.
   - Dynamic decrement of coupon usage limits upon successful orders.
   - **Frontend Compliance Fix**: Automatic internal mapping between Mongoose `orderItems` schema and frontend expected `items` lists, preventing blank screens or null values.
   - Full status updater: *Pending ➔ Processing ➔ Shipped ➔ Delivered ➔ Cancelled*.

4. **Visual Asset Storage**
   - Cloudinary integration for secure media uploads.
   - Admin protected endpoints to upload and destroy images during article creation.

---

## 🛠️ API Enpoints Overview

### Public Endpoints
* **`GET /`** - Service health check.
* **`GET /api/products`** - List all product articles.
* **`GET /api/products/:slug`** - Get article details by URL slug.
* **`POST /api/orders`** - Create/record a new customer order.
* **`POST /api/create-order`** - Initialize a Razorpay payment transaction.
* **`POST /api/coupons/validate`** - Validate a checkout promo code.
* **`GET /api/site-config`** - Fetch custom site branding (Announcements, Hero, Banners).

### Admin-Only Endpoints (Protected by Bearer JWT token)
* **`POST /api/admin/login`** - Sign in and get session JWT token.
* **`POST /api/admin/products`** - Create a new product article.
* **`PUT /api/admin/products/:id`** - Update an existing product article.
* **`DELETE /api/admin/products/:id`** - Delete an article from database.
* **`GET /api/admin/orders`** - Retrieve all checkout orders.
* **`GET /api/admin/orders/:id`** - View detailed order records.
* **`PUT /api/admin/orders/:id`** - Edit details of an order.
* **`PATCH /api/admin/orders/:id`** - Update status of an order.
* **`DELETE /api/admin/orders/:id`** - Delete order from database.
* **`GET /api/admin/coupons`** - List all system promo codes.
* **`POST /api/admin/coupons`** - Create new promo codes.
* **`DELETE /api/admin/coupons/:id`** - Delete a promo code.
* **`PATCH /api/admin/coupons/:id`** - Toggle active/inactive state of a code.
* **`POST /api/upload`** - Upload article images to Cloudinary.
* **`DELETE /api/upload`** - Delete upload assets from Cloudinary.

---

## 🚀 Running Locally

### 1. Install Dependencies
Make sure you have Node.js installed on your computer. Open your terminal in this project folder and run:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to a new `.env` file:
```bash
cp .env.example .env
```
Fill in the credentials (`MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_` keys, `RAZORPAY_` keys).

### 3. Start Development Server
Run the local dev server using `nodemon`:
```bash
npm run dev
```
The server will boot up and listen on `http://localhost:5000`.

---

## ☁️ Deploying Standalone to Vercel

This repository is pre-configured with a standard `vercel.json` routing configuration to compile your Node application into a serverless endpoint.

1. Install the Vercel CLI globally (if not already installed):
   ```bash
   npm install -g vercel
   ```
2. Run the deployment command inside this folder:
   ```bash
   vercel
   ```
3. Set your production environment variables (either in the Vercel CLI or inside the Vercel online Dashboard under **Settings ➔ Environment Variables**):
   * `MONGODB_URI`
   * `JWT_SECRET`
   * `ADMIN_USERNAME`
   * `ADMIN_PASSWORD`
   * `CLOUDINARY_CLOUD_NAME`
   * `CLOUDINARY_API_KEY`
   * `CLOUDINARY_API_SECRET`
   * `RAZORPAY_KEY_ID`
   * `RAZORPAY_KEY_SECRET`
4. Deploy to production:
   ```bash
   vercel --prod
   ```
