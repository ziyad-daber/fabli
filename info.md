# Fabli Platform - Comprehensive Project Information

## Project Overview
Fabli is a B2B e-commerce platform connecting suppliers with resellers in Morocco, facilitating product discovery, order management, and shipping logistics. The platform integrates with AMEEX shipping service for seamless order fulfillment.

**Target Users:**
- **Suppliers**: Manufacturers/wholesalers who list products and fulfill orders
- **Resellers**: Retailers who purchase products from suppliers to sell to end customers
- **Admins**: Platform administrators who manage users, products, orders, and system settings

**Core Value Proposition:**
- Streamlined B2B transactions between suppliers and resellers
- Automated shipping label generation and tracking via AMEEX
- Commission-based revenue model for the platform
- Role-based access control with tailored dashboards

## Key Features Completed ✅

### 1. AMEEX Shipping Integration
- Complete rewrite of adapter with real API calls to AMEEX shipping service
- Implemented all endpoints from Postman collection:
  - Create shipment (with pickup info, package details, products array)
  - Get shipment status/tracking
  - Edit shipment
  - Relaunch shipment
  - Mass tracking operations
- Enhanced TypeScript interfaces for all AMEEX request/response types
- Proper error handling with user-friendly messages
- Idempotency support for safe retries
- Secure credential management
- File: `src/lib/ameex/adapter.ts`

### 2. File Upload Utility
- Secure file handling for product images
- Validation: file type (JPEG, PNG, WebP), size limits (5MB)
- Unique filename generation to prevent collisions
- Storage in `public/uploads` directory with proper path handling
- URL generation for public access
- File: `src/lib/utils/upload.ts`

### 3. Category Management
- API endpoint for listing categories with search and filtering
- Supports active/inactive status filtering
- Used in product management for categorization
- File: `src/app/api/categories/route.ts`

### 4. Admin Dashboard Features
#### Admin Users Management (`/dashboard/admin/users`)
- Complete CRUD interface for platform users
- Role-based filtering (ADMIN, SUPPLIER, RESELLER)
- Status management (active/inactive)
- Profile information display
- Search and pagination
- Bulk actions capability

#### Admin Products Management (`/dashboard/admin/products`)
- Full product lifecycle management
- Form validation with Zod (name, slug, description, pricing, dimensions)
- Category selection dropdown
- Status toggling (DRAFT/ACTIVE/DISABLED)
- Featured product flag
- Supplier association (admin assigns products to suppliers)
- Image upload integration (placeholder - to be completed)
- Variant management foundation
- Search, filtering, pagination

#### Admin Orders Management (`/dashboard/admin/orders`)
- Comprehensive order tracking and management
- Advanced filtering (search, status, supplier, reseller, date ranges)
- Real-time status updates (PENDING → ACCEPTED → IN_PRODUCTION → READY_TO_SHIP → SHIPMENT_CREATED → IN_TRANSIT → DELIVERED, plus error states)
- Detailed order breakdown (items, amounts, commissions)
- Actionable interface: view details, update status, limited deletion
- Pagination and responsive design
- Loading states and error handling

### 5. Supplier Features
#### Supplier Order Acceptance Flow UI
- Supplier-specific dashboard for incoming orders
- Order listing with filtering and search
- Detailed order view (customer info, items, pricing)
- Action buttons: Accept, Reject, Mark as In Production, Ready to Ship
- Status-based UI that adapts to order state
- Integration with order status update API

### 6. Documentation & Testing
#### AMEEX Integration Testing Guide (`TEST_AMEEX_INTEGRATION.md`)
- Step-by-step credential configuration instructions
- Testing procedures for each API endpoint
- Troubleshooting common issues
- Production deployment considerations
- Test credentials vs. live credentials guidance

## Technology Stack 🛠️

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: React Hooks (useState, useEffect) + Context API where needed
- **Form Handling**: React Hook Form with Zod validation
- **Data Fetching**: SWR (implied) or direct fetch with loading states
- **Icons**: Lucide React
- **UI Components**: Custom-built with shadcn/ui primitives (Table, Button, Badge, Dropdown, etc.)

### Backend
- **Runtime**: Node.js with Next.js API Routes
- **Language**: TypeScript
- **ORM**: Prisma ORM
- **Database**: PostgreSQL (production), SQLite (development optional)
- **Authentication**: NextAuth.js (via `@/lib/auth/config`)
- **Validation**: Zod for API input validation
- **HTTP Client**: Native Fetch API

### Infrastructure
- **Version Control**: Git
- **Package Manager**: npm or yarn
- **Deployment**: Vercel (implied by Next.js structure) or Docker
- **Environment Variables**: Managed via `.env.local` and `.env` files

### Integrations
- **Shipping**: AMEEX REST API (form-urlencoded endpoints)
- **File Storage**: Local filesystem (scalable to cloud storage like AWS S3)
- **Email**: Placeholder for future integration (SendGrid, SMTP, etc.)
- **SMS**: Placeholder for future integration (Twilio, etc.)

## API Endpoints 📡

### Authentication (NextAuth)
- `GET /api/auth/*` - NextAuth endpoints (signin, signout, callback, etc.)

### Admin Routes
- `GET /api/admin/users` - List users with role filtering
- `GET /api/admin/orders` - List orders with advanced filtering (pagination, search, status, supplier/reseller, date)
- `GET /api/admin/products` - List products with filtering (search, status, category)
- `POST /api/admin/products` - Create new product (admin)
- `PATCH /api/admin/products/[id]` - Update product (admin)
- `DELETE /api/admin/products/[id]` - Delete product (admin, with dependency check)

### Public/Protected Routes
- `GET /api/categories` - List categories (search, isActive filter)
- `GET /api/orders/[id]` - Get specific order (supplier/reseller access)
- `PATCH /api/orders/[id]` - Update order status/notes (supplier/reseller)
- `GET /api/suppliers` - List supplier profiles (for dropdowns)
- `GET /api/resellers` - List reseller profiles (for dropdowns)
- `POST /api/upload` - File upload endpoint (to be implemented)

### AMEEX Integration (Internal)
- Internal adapter functions (not exposed as public API):
  - `createShipment(request)` - Creates shipment with AMEEX
  - `getShipmentStatus(trackingCode)` - Gets shipment status
  - `editShipment(shipmentId, updates)` - Edits existing shipment
  - `relaunchShipment(shipmentId)` - Relaunches shipment
  - `massTrack(trackingCodes)` - Tracks multiple shipments

### Webhooks
- `POST /api/webhooks/ameex` - AMEEX webhook endpoint (signature verification pending)

## Database Schema 🗃️ (Inferred from Prisma usage)

### Core Models
```prisma
// User (extends NextAuth User)
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  name          String?
  role          UserRole // ADMIN, SUPPLIER, RESELLER
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  supplierProfile SupplierProfile?
  resellerProfile ResellerProfile?
  orders          Order[]
  products        Product[]
}

// Supplier Profile
model SupplierProfile {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  companyName   String
  contactName   String?
  phone         String?
  address       String?
  city          String?
  postalCode    String?
  ice           String?  // Tax ID
  rc            String?  // Commerce Register
  isVerified    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  products      Product[]
  orders        Order[]  // Orders where this supplier is the supplier
}

// Reseller Profile
model ResellerProfile {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  companyName   String
  contactName   String?
  phone         String?
  address       String?
  city          String?
  postalCode    String?
  ice           String?
  rc            String?
  isVerified    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  orders        Order[]  // Orders where this reseller is the reseller
}

// Category
model Category {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  description   String?
  imageUrl      String?
  parentId      String?
  parent        Category? @relation("CategoryParent", fields: [parentId], references: [id])
  children      Category[] @relation("CategoryParent")
  sortOrder     Int      @default(0)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  products      Product[]
}

// Product
model Product {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  description   String
  shortDescription String?
  categoryId    String
  category      Category @relation(fields: [categoryId], references: [id])
  supplierId    String
  supplier      User     @relation("SupplierProducts", fields: [supplierId], references: [id])
  supplierPrice Float    // Price at which supplier sells to platform
  currency      String   @default("MAD")
  productionDays Int     @default(7)
  weight        Float?   // In kg
  length        Float?   // In cm
  width         Float?   // In cm
  height        Float?   // In cm
  status        ProductStatus // DRAFT, ACTIVE, DISABLED
  isFeatured    Boolean  @default(false)
  publishedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  images        ProductImage[]
  variants      ProductVariant[]
  orderItems    OrderItem[]
}

// Product Image
model ProductImage {
  id            String   @id @default(uuid())
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  url           String
  isPrimary     Boolean  @default(false)
  createdAt     DateTime @default(now())
}

// Product Variant
model ProductVariant {
  id            String   @id @default(uuid())
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  name          String   // e.g., "Color", "Size"
  value         String   // e.g., "Red", "Large"
  additionalPrice Float  // Additional cost vs base product
  stock         Int      @default(0)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
}

// Order
model Order {
  id            String   @id @default(uuid())
  orderNumber   String   @unique
  supplierId    String
  supplier      User     @relation("SupplierOrders", fields: [supplierId], references: [id])
  resellerId    String
  reseller      User     @relation("ResellerOrders", fields: [resellerId], references: [id])
  customerName  String
  customerPhone String
  customerEmail String?
  customerAddress String
  customerCity  String
  customerPostalCode String?
  customerNotes String?
  
  // Financials
  subtotal      Float    // Sum of items before shipping/COD
  shippingFee   Float    // Shipping cost charged to reseller
  codAmount     Float    // Cash on delivery amount (if applicable)
  commissionRate Float   // Platform commission percentage (e.g., 0.15 for 15%)
  commissionAmount Float // Calculated commission amount
  currency      String   @default("MAD")
  
  // Timestamps
  acceptedAt    DateTime?
  producedAt    DateTime?
  readyToShipAt DateTime?
  shippedAt     DateTime?
  deliveredAt   DateTime?
  status        OrderStatus // PENDING, ACCEPTED, IN_PRODUCTION, READY_TO_SHIP, SHIPMENT_CREATED, IN_TRANSIT, DELIVERED, REJECTED, CANCELLED, DELIVERY_FAILED, RETURNED, SHIPMENT_ERROR
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  items         OrderItem[]
  shipments     Shipment[]
}

// Order Item
model OrderItem {
  id            String   @id @default(uuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  variantId     String?
  variant       ProductVariant? @relation(fields: [variantId], references: [id])
  quantity      Int
  unitSupplierPrice Float // Price paid to supplier per unit
  unitResellerPrice Float // Price charged to reseller per unit
  unitCommission  Float   // Commission per unit
  totalSupplierPrice Float // unitSupplierPrice * quantity
  totalResellerPrice Float // unitResellerPrice * quantity
  totalCommission   Float // unitCommission * quantity
}

// Shipment (AMEEX tracking)
model Shipment {
  id            String   @id @default(uuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  trackingCode  String?  // AMEEX tracking number
  externalId    String?  // AMEEX internal shipment ID
  labelUrl      String?  // URL to shipping label PDF
  status        String   // AMEEX status (to be mapped)
  carrier       String   // e.g., "AMEEX"
  pieces        Int      @default(1)
  weight        Float?   // Total weight in kg
  length        Float?   // Package length in cm
  width         Float?   // Package width in cm
  height        Float?   // Package height in cm
  codAmount     Float?   // COD amount for this shipment
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Enums
enum UserRole {
  ADMIN
  SUPPLIER
  RESELLER
}

enum ProductStatus {
  DRAFT
  ACTIVE
  DISABLED
}

enum OrderStatus {
  PENDING
  ACCEPTED
  IN_PRODUCTION
  READY_TO_SHIP
  SHIPMENT_CREATED
  IN_TRANSIT
  DELIVERED
  REJECTED
  CANCELLED
  DELIVERY_FAILED
  RETURNED
  SHIPMENT_ERROR
}
```

## UI Components & Pages 🖥️

### Shared Components
- `src/components/ui/` - shadcn/ui based components (Button, Input, Table, Badge, DropdownMenu, etc.)
- `src/lib/utils/helpers.ts` - utility functions (cn for class merging, formatCurrency, etc.)
- `src/lib/auth/config.ts` - NextAuth configuration

### Admin Dashboard
- `src/app/dashboard/admin/layout.ts` - Admin layout with protected route
- `src/app/dashboard/admin/page.tsx` - Admin dashboard overview (to be enhanced)
- `src/app/dashboard/admin/users/page.tsx` - User management (completed)
- `src/app/dashboard/admin/products/page.tsx` - Product management (completed)
- `src/app/dashboard/admin/orders/page.tsx` - Order management (just completed)
- `src/app/dashboard/admin/shipments/page.tsx` - Planned
- `src/app/dashboard/admin/settlements/page.tsx` - Planned

### Supplier Dashboard
- `src/app/dashboard/supplier/layout.ts` - Supplier layout
- `src/app/dashboard/supplier/page.tsx` - Supplier overview
- `src/app/dashboard/supplier/orders/page.tsx` - Order management (completed - acceptance flow)
- `src/app/dashboard/supplier/shipments/page.tsx` - Planned
- `src/app/dashboard/supplier/settlements/page.tsx` - Planned

### Reseller Dashboard
- `src/app/dashboard/reseller/` - Similar structure (to be implemented)

### Public Pages
- `src/app/page.tsx` - Landing page
- `src/app/about/page.tsx` - About page
- `src/app/contact/page.tsx` - Contact page
- `src/app/auth/signin/page.tsx` - Sign in
- `src/app/auth/signup/page.tsx` - Sign up

## AMEEX Integration Details 🚚

### Endpoints Implemented
1. **Add Parcel** (`/customer/Delivery/Parcels/Action/Type/Add`)
   - Creates a new shipment with:
     - Pickup information (address, contact, phone)
     - Package details (weight, dimensions, pieces, description)
     - Product information (description, quantity, value per item)
     - Recipient information (name, address, phone, email)
     - Payment details (COD amount, payment method)
     - Reference numbers and notes

2. **Get Parcel Status** (`/customer/Delivery/Parcels/Action/Type/Get`)
   - Retrieves current status and tracking information

3. **Edit Parcel** (`/customer/Delivery/Parcels/Action/Type/Edit`)
   - Updates existing shipment details

4. **Relaunch Parcel** (`/customer/Delivery/Parcels/Action/Type/Relaunch`)
   - Restarts a failed or cancelled shipment

5. **Mass Tracking** (`/customer/Delivery/Parcels/Action/Type/Track`)
   - Tracks multiple shipments at once

### Security Considerations
- Credentials stored in environment variables (`AMEEX_USERNAME`, `AMEEX_PASSWORD`)
- Base URL configurable per environment (`AMEEX_BASE_URL`)
- Idempotency keys generated for create operations to prevent duplicates
- Response parsing with error handling for various HTTP status codes
- Webhook endpoint planned with HMAC signature verification (pending implementation)

### Data Mapping
- Maps internal order/product data to AMEEX required fields
- Handles unit conversions (kg to g if needed, cm consistency)
- Processes AMEEX responses into internal shipment model
- Tracks label URL for download/printing

## Setup & Installation 🔧

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- npm or yarn
- AMEEX account (for shipping integration)

### Environment Variables
Create `.env.local` with:
```
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fabli"

# AMEEX Integration
AMEEX_BASE_URL=https://ws.ameex.ma
AMEEX_USERNAME=your_ameex_username
AMEEX_PASSWORD=your_ameex_password

# Other
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Installation Steps
1. Clone repository
2. Install dependencies: `npm install`
3. Set up database: `npx prisma migrate dev`
4. Start development server: `npm run dev`
5. Access at http://localhost:3000

### Production Deployment
- Recommended: Vercel (for frontend) + separate Node.js service for background jobs
- Environment variables configured in hosting platform
- Database hosted externally (Supabase, AWS RDS, etc.)
- AMEEX credentials stored securely in platform secrets

## Current Limitations & Known Issues 🐛

### Completed Features with Limitations
1. **Admin Orders Management**
   - Delete functionality limited (shows message that deletion not implemented)
   - Bulk actions not yet implemented
   - Export to CSV/PDF not implemented

2. **Product Management**
   - Image upload integration pending (utility exists but not connected to form)
   - Variant management basic (UI needs enhancement)
   - SEO fields (meta title, description) missing

3. **AMEEX Integration**
   - Webhook signature verification not implemented (placeholder)
   - Error recovery for failed shipments needs enhancement
   - Label auto-download/print not implemented

### Missing Features
1. **Notification System**
   - Email/SMS alerts for order status changes
   - Low stock warnings for suppliers
   - Payment failure notifications

2. **Payment Processing**
   - Integration with payment gateway (Stripe, PayPal, local Moroccan gateways)
   - Invoice generation
   - Payment tracking

3. **Advanced Features**
   - Wishlist/favorites system
   - Product reviews and ratings
   - Analytics dashboard
   - Multi-language support (Arabic/French/English)
   - Mobile-responsive enhancements
   - Accessibility (WCAG 2.1 AA compliance)

## Future Roadmap 🗺️

### Phase 1: Core Completion (Immediate)
- [ ] Admin Shipment Management page
- [ ] Admin Settlement Management page
- [ ] Supplier Shipment Creation and Tracking UI
- [ ] Supplier Settlement Management UI
- [ ] Product image upload integration into product forms
- [ ] Notification system (email templates, sending service)
- [ ] Webhook signature verification (HMAC for AMEEX)

### Phase 2: Platform Enhancements
- [ ] Reseller dashboard completion
- [ ] Payment processing integration
- [ ] Advanced reporting and analytics
- [ ] Review and rating system
- [ ] Wishlist functionality
- [ ] Inventory management alerts
- [ ] Bulk order processing

### Phase 3: Scale & Optimization
- [ ] Performance optimization (caching, pagination optimization)
- [ ] Internationalization (i18n) support
- [ ] Accessibility improvements
- [ ] Automated testing expansion (unit, integration, E2E)
- [ ] CI/CD pipeline enhancements
- [ ] Security audit and penetration testing
- [ ] Dockerization for deployment flexibility

## Project Status Summary 📊

As of 2026-09-28:
- **Completion Estimate**: ~65% of MVP features
- **Core Infrastructure**: 90% complete (AMEEX, upload, categories, auth)
- **Admin Features**: 75% complete (Users, Products, Orders done; Shipments, Settlements pending)
- **Supplier Features**: 50% complete (Order flow done; Shipment, Settlement pending)
- **Documentation**: AMEEX testing guide complete
- **Next Priority**: Admin Shipment Management → Admin Settlement → Product Image Upload → Webhook HMAC

## Contributing Guidelines 🤝

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes following existing code patterns
4. Ensure TypeScript compiles without errors
5. Test changes locally
6. Submit pull request with detailed description
7. Follow existing commit message conventions

## License 📄

This project is proprietary software. All rights reserved.

---
*Document last updated: 2026-09-28*
*Generated during development session for Fabli platform MVP tracking*