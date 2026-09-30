# Testing AMEEX Integration with Real Credentials

## Overview
This guide explains how to test the AMEEX integration with real credentials after setting up the Fabli platform.

## Prerequisites
1. Fabli platform running locally or on a test server
2. Admin access to the platform
3. Valid AMEEX API credentials (API Key and Account ID)
4. Optional: AMEEX webhook secret for signature verification

## Step-by-Step Testing Guide

### 1. Login as Administrator
- Navigate to: `http://localhost:3000/auth/login`
- Use credentials from seed data:
  - Email: `admin@fabli.ma`
  - Password: `Admin123!`

### 2. Configure AMEEX Credentials
- Navigate to: `/dashboard/admin/ameex` (Admin Dashboard → AMEEX Configuration)
- Fill in the form:
  - **API Key**: Your AMEEX API ID (from Postman collection: `C-Api-Id`)
  - **Account ID**: Your AMEEX Account ID (from Postman collection: `C-Api-Key`)
  - **Base URL**: Usually `https://api.ameex.app` (or `https://api.ameex.ma` for Morocco)
  - **Webhook URL**: `https://your-domain.com/api/webhooks/ameex` (optional, for production)
  - **Webhook Secret**: Provided by AMEEX for HMAC verification (optional)
  - **Test Mode**: 
    - Enable (`true`) for testing with AMEEX sandbox/test environment
    - Disable (`false`) for live production API

### 3. Save Configuration
- Click "Save Configuration" button
- You should see a success message: "Configuration enregistrée avec succès"

### 4. Test Connection
- On the AMEEX configuration page, click "Test Connection"
- The system will:
  1. Make a GET request to `/customer/Delivery/Parcels/Info` with a test parcel code
  2. Validate your credentials
  3. Return success/failure based on AMEEX API response
- Expected results:
  - **Success**: "Connexion réussie avec l'API AMEEX" + HTTP status code
  - **Failure**: Error message with details (check credentials, network, or AMEEX service status)

### 5. Create Test Order for End-to-End Testing
#### Option A: Use Seed Data
The database seed already includes:
- Admin user: `admin@fabli.ma`
- Supplier: `fournisseur@test.ma` (company: Imprim3D Maroc)
- Reseller: `revendeur@test.ma` (company: ElectroShop)
- Sample products with pricing

#### Option B: Create New Test Order
1. Login as reseller: `revendeur@test.ma` / `Reseller123!`
2. Navigate to supplier catalog: `/dashboard/supplier/products`
3. Select a product and note its supplier price
4. Go to "Nouveau produit" to create a test product if needed
5. Create a test order:
   - Navigate to orders (you may need to create an order via API or UI)
   - Or use the existing order flow: reseller browses catalog → creates order

### 6. Complete Supplier Order Flow
1. Login as supplier: `fournisseur@test.ma` / `Supplier123!`
2. Go to Supplier Dashboard: `/dashboard/supplier`
3. Check "Commandes en cours" section for pending orders
4. Click "Voir les commandes" to see all orders
5. Find a PENDING order and click to accept it
6. Once accepted, work through the workflow:
   - ACCEPTED → IN_PRODUCTION → READY_TO_SHIP
7. When order is READY_TO_SHIP:
   - Click the package/truck button to create shipment
   - The system will:
     1. Validate order details
     2. Call AMEEX API to create shipment
     3. Store tracking code (Code Suivi)
     4. Update order status to SHIPMENT_CREATED
     5. Show success message with tracking information

### 7. Verify Shipment Creation
After creating shipment:
1. Check order detail page:
   - Should show "Expédition créée" status
   - Should display Tracking Code (Code Suivi)
   - Should show shipment details (date, carrier, etc.)
2. Check admin shipment management:
   - Navigate to: `/dashboard/admin/shipments`
   - Should see the new shipment in the list
   - Click to view details including tracking events
3. Check database directly (optional):
   - Shipment record in `shipment` table
   - Tracking code in `trackingCode` field
   - Associated with correct order

### 8. Test Tracking Updates
There are several ways to test tracking:
#### Option A: Manual Update (for development/testing)
1. In database, manually update a shipment's status
2. Or use the admin interface if manual edit is implemented

#### Option B: Webhook Simulation
1. Use a tool like curl or Postman to simulate AMEEX webhook:
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/ameex \
     -H "Content-Type: application/json" \
     -H "x-ameex-signature: test-signature" \
     -d '{
       "event_type": "parcel_status_update",
       "parcel_code": "YOUR_TRACKING_CODE",
       "status": "IN_TRANSIT",
       "history": [
         {"date": "2026-09-28 10:00:00", "status": "CREATED", "location": "Casablanca", "description": "Colis créé"},
         {"date": "2026-09-28 14:30:00", "status": "IN_TRANSIT", "location": "Rabat", "description": "Colis en transit"}
       ],
       "delivered_at": null,
       "cod_collected": null
     }'
   ```
2. Verify the webhook is processed and shipment status updates

#### Option C: Polling AMEEX API (if implemented)
1. Use the tracking endpoint to check current status
2. This would normally be done via background job or manual refresh

### 9. Test Error Scenarios
#### Invalid Credentials
1. Enter wrong API Key or Account ID in AMEEX config
2. Try to create shipment
3. Should see error: "Échec de création de l'expédition" with details

#### Network Issues
1. Temporarily disconnect network or set wrong base URL
2. Attempt shipment creation
3. Should see connection error

#### Invalid Order Data
1. Try to create shipment with missing required fields
2. Should show validation errors from AMEEX API

### 10. Check API Logs (Admin Only)
After testing:
1. Navigate to API logs (if implemented) or check database:
   - `courier_api_log` table should contain entries for:
     - Shipment creation requests/responses
     - Tracking requests
     - Webhook receptions
2. Each log entry includes:
   - Method, endpoint, status code
   - Request/response bodies (without sensitive data)
   - Timestamps

## Troubleshooting Common Issues

### "Credentials not configured" Error
- Ensure you saved the AMEEX configuration in admin dashboard
- Verify the CourierIntegration record exists in database
- Check that apiKey and accountId are not null/empty

### "Invalid webhook signature" Error
- If using webhook secret, ensure it matches what AMEEX sends
- For testing without verification, ensure webhook secret is empty in config
- The verifyWebhookSignature method currently accepts any non-empty signature (placeholder)

### AMEEX API Returns Error
- Check AMEEX API documentation for specific error codes
- Verify all required fields are present in shipment request
- Test with AMEEX Postman collection directly to isolate issue

### Shipment Not Showing in UI
- Check database: is there a shipment record linked to the order?
- Verify order status is SHIPMENT_CREATED
- Check for any error messages in shipment record

## Production Considerations

### Security
- Never commit real AMEEX credentials to version control
- Use environment variables or secure secret management in production
- The credentials are encrypted in the database (apiKey, apiSecret fields)

### Rate Limiting
- Be aware of AMEEX API rate limits
- Consider implementing retry logic with exponential backoff
- Monitor API usage via the ApiLog table

### Error Handling
- The implementation includes comprehensive error handling
- Errors are logged and displayed to users appropriately
- Failed shipments can be retried after fixing issues

### Idempotency
- Each shipment creation attempt uses a unique idempotency key
- Prevents duplicate shipments if request is retried
- Based on timestamp + random string: `ship_${timestamp}_${random}`

## Next Steps After Successful Testing
1. Disable test mode in AMEEX configuration for live payments
2. Configure real webhook endpoint for automatic tracking updates
3. Set up email/SMS notifications for shipment events
4. Train suppliers/resellers on using the shipment tracking features
5. Monitor first few live shipments closely

---
**Note**: Replace `http://localhost:3000` with your actual domain when testing in production or staging environments.