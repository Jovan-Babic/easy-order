# Easy Order — PRD

## Original Problem Statement
Mobile app to order goods. Select the customer first, then per item: photo, price without VAT, pieces per package, boxes per transport package, and ordered quantity. On completion an invoice is created that can be copied or emailed.

## User Choices
- UI language: Serbian (default) + English toggle (SR/EN)
- Admin screen to create/edit customers & products (with photo upload)
- Invoice email: open device native email pre-filled (MailComposer, mailto fallback)
- No auto price calculations — invoice lists entered values only
- Order history saved per customer

## Architecture
- Backend: FastAPI + MongoDB (motor). Collections: customers, products, orders. UUID string ids, `_id` excluded. Seed on startup (3 products, 2 customers).
- Frontend: Expo Router (tabs: Order/History/Admin + stack invoice screen). Context for language + toast. expo-image-picker (base64), expo-clipboard, expo-mail-composer.
- Design: Forest Green (#1A4D2E) / bone white, iOS-native clean, light mode.

## Implemented (2026-07-01)
- Order Catalog: customer picker modal (search), product cards (image + price/pcs/transport meta), Popust + Naruceno komada inputs, sticky glass Potvrdi button (disabled until customer + qty>0).
- Invoice screen: receipt view of all entered values, Copy to clipboard + Send email (native compose).
- History tab: list of past orders per date, tap → invoice.
- Admin tab: segmented Products/Customers, FAB add, edit/delete, image picker with permission handling (Open Settings fallback).
- SR/EN language toggle (persisted).
- Backend CRUD for customers, products, orders (+ filter by customer_id).

## Update — Feature Iteration 2 (2026-07-01)
- **Automatic totals**: discount is a % → line net = price × qty × (1 − disc/100); VAT rate is per-product; invoice shows Osnovica (subtotal), PDV, Ukupno sa PDV (grand total). Logic in `src/calc.ts`.
- **Manufacturer**: field on products + horizontal filter chips (Svi + per manufacturer) on Order Catalog; shown under product name and on invoice.
- **PDF invoice**: `Sačuvaj PDF` button uses expo-print (HTML → PDF) + expo-sharing. Device-only (works on real build/Expo Go, not web preview).
- **Customer PIB**: field in admin, shown on invoice, included in copy/email/PDF text.
- Verified: iteration_2.json — 15/15 backend + full frontend flow (math: 450×10×0.95 → 4.275 net, 855 PDV, 5.130 total).

## Backlog / Next
- P1: Serbian pluralization ("1 Stavka" vs "N Stavke").
- P2: PDF invoice export/share; per-item auto totals + VAT if requested later.
- P2: Migrate RN Web deprecated style props (shadow* → boxShadow).

## Update — Feature Iteration 4 (2026-07-14)
- **PDF attached to email**: sending the invoice now attaches the generated PDF via MailComposer (device); web preview falls back to mailto text.
- **Fullscreen image zoom**: tapping a product image in the Order Catalog opens it fullscreen (`image-zoom-overlay`); tap to close.
- **Multiple discounts per product**: products have a `discounts` array + default `discount`. Admin adds values one-by-one with "+" (chips, tap to set default/star, X to remove). At order time Popust is a **dropdown** defaulting to the product default; the chosen value is used in the order/invoice.
- Verified: iteration_4.json — 6/6 backend + full frontend flow. Fixed a render crash by guarding the discount picker modal children.
- **Per-product discount (locked)**: products have a default discount % set in Admin (`form-discount`); the Order Catalog shows Popust as read-only (`discount-value-<id>`), only ordered qty is editable. Order items use the product's discount.
- **Invoice contact details**: invoice screen, PDF and copy/email text now show customer **Address (place), Phone, Email** alongside PIB.
- **Search**: Order Catalog has a single search box (`product-search-input`) filtering by product name AND manufacturer, combined with the manufacturer chips.
- Verified: iteration_3.json — 5/5 backend + full frontend flow.
