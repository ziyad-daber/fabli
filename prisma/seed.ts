import { PrismaClient, UserRole, UserStatus, ProductStatus, OrderStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hashPassword } from '../src/lib/auth/password'

const connectionString = process.env.DATABASE_URL!

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the seed')
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seed...')

  // Create admin user
  const adminPassword = await hashPassword('Admin123!')
  const admin = await prisma.user.upsert({
    where: { email: 'admin@fabli.ma' },
    update: {},
    create: {
      email: 'admin@fabli.ma',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
    },
  })
  console.log('✅ Admin user created:', admin.email)

  // Create test supplier
  const supplierPassword = await hashPassword('Supplier123!')
  const supplierUser = await prisma.user.upsert({
    where: { email: 'fournisseur@test.ma' },
    update: {},
    create: {
      email: 'fournisseur@test.ma',
      passwordHash: supplierPassword,
      role: UserRole.SUPPLIER,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
    },
  })

  const supplier = await prisma.supplierProfile.upsert({
    where: { userId: supplierUser.id },
    update: {},
    create: {
      userId: supplierUser.id,
      companyName: 'Imprim3D Maroc',
      contactName: 'Ahmed Alami',
      phone: '+212 6 12 34 56 78',
      address: '123 Rue Hassan II',
      city: 'Casablanca',
      postalCode: '20000',
      ice: '001234567890123',
      rc: '12345',
      isVerified: true,
    },
  })

  // Default pickup address
  await prisma.pickupAddress.upsert({
    where: { id: 'default-pickup-1' },
    update: {},
    create: {
      id: 'default-pickup-1',
      supplierId: supplier.id,
      name: 'Atelier Principal',
      contactName: 'Ahmed Alami',
      phone: '+212 6 12 34 56 78',
      address: '123 Rue Hassan II',
      city: 'Casablanca',
      postalCode: '20000',
      isDefault: true,
    },
  })

  console.log('✅ Supplier created:', supplier.companyName)

  // Create test reseller
  const resellerPassword = await hashPassword('Reseller123!')
  const resellerUser = await prisma.user.upsert({
    where: { email: 'revendeur@test.ma' },
    update: {},
    create: {
      email: 'revendeur@test.ma',
      passwordHash: resellerPassword,
      role: UserRole.RESELLER,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
    },
  })

  const reseller = await prisma.resellerProfile.upsert({
    where: { userId: resellerUser.id },
    update: {},
    create: {
      userId: resellerUser.id,
      companyName: 'ElectroShop',
      contactName: 'Fatima Bennani',
      phone: '+212 6 98 76 54 32',
      address: '456 Bd Mohammed V',
      city: 'Rabat',
      postalCode: '10000',
      ice: '009876543210987',
      rc: '67890',
      isVerified: true,
    },
  })

  console.log('✅ Reseller created:', reseller.companyName)

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'accessoires' },
      update: {},
      create: { name: 'Accessoires', slug: 'accessoires', description: 'Accessoires pour téléphones et tablettes', sortOrder: 1 },
    }),
    prisma.category.upsert({
      where: { slug: 'electronique' },
      update: {},
      create: { name: 'Électronique', slug: 'electronique', description: 'Boîtiers et composants électroniques', sortOrder: 2 },
    }),
    prisma.category.upsert({
      where: { slug: 'decoration' },
      update: {},
      create: { name: 'Décoration', slug: 'decoration', description: 'Objets décoratifs pour la maison', sortOrder: 3 },
    }),
    prisma.category.upsert({
      where: { slug: 'organisation' },
      update: {},
      create: { name: 'Organisation', slug: 'organisation', description: 'Solutions de rangement et organisation', sortOrder: 4 },
    }),
    prisma.category.upsert({
      where: { slug: 'jouets' },
      update: {},
      create: { name: 'Jouets', slug: 'jouets', description: 'Jouets et figurines imprimés en 3D', sortOrder: 5 },
    }),
    prisma.category.upsert({
      where: { slug: 'outils' },
      update: {},
      create: { name: 'Outils', slug: 'outils', description: 'Outils et accessoires pratiques', sortOrder: 6 },
    }),
  ])

  console.log('✅ Categories created')

  // Create sample products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { id: 'prod-1' },
      update: {},
      create: {
        id: 'prod-1',
        supplierId: supplier.id,
        categoryId: categories[0].id,
        name: 'Support téléphone réglable',
        slug: 'support-telephone-reglable',
        description: 'Support universel pour smartphone avec angle réglable. Imprimé en PLA de haute qualité, compatible avec tous les téléphones de 4 à 7 pouces. Base stable avec patins antidérapants.',
        shortDescription: 'Support universel réglable pour smartphone',
        supplierPrice: 85.00,
        currency: 'MAD',
        productionDays: 3,
        weight: 0.150,
        length: 12,
        width: 8,
        height: 15,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-2' },
      update: {},
      create: {
        id: 'prod-2',
        supplierId: supplier.id,
        categoryId: categories[1].id,
        name: 'Boîtier Raspberry Pi 4',
        slug: 'boitier-raspberry-pi-4',
        description: 'Boîtier de protection pour Raspberry Pi 4 avec ventilation intégrée. Accès à tous les ports (GPIO, HDMI, USB, Ethernet). Imprimé en PETG pour une meilleure résistance thermique.',
        shortDescription: 'Boîtier ventilé pour Raspberry Pi 4',
        supplierPrice: 45.00,
        currency: 'MAD',
        productionDays: 2,
        weight: 0.080,
        length: 9,
        width: 6,
        height: 3,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-3' },
      update: {},
      create: {
        id: 'prod-3',
        supplierId: supplier.id,
        categoryId: categories[2].id,
        name: 'Pot de fleurs géométrique',
        slug: 'pot-fleurs-geometrique',
        description: 'Pot de fleurs au design géométrique moderne. Système de drainage intégré. Disponible en plusieurs tailles. Imprimé en PLA biodégradable.',
        shortDescription: 'Pot design géométrique avec drainage',
        supplierPrice: 35.00,
        currency: 'MAD',
        productionDays: 4,
        weight: 0.200,
        length: 14,
        width: 14,
        height: 12,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-4' },
      update: {},
      create: {
        id: 'prod-4',
        supplierId: supplier.id,
        categoryId: categories[3].id,
        name: 'Crochet mural design (lot de 4)',
        slug: 'crochet-mural-design-lot-4',
        description: 'Lot de 4 crochets muraux au design minimaliste. Fixation par vis (fournies) ou adhésif double face. Charge max 5kg par crochet. Imprimé en ABS résistant.',
        shortDescription: 'Lot de 4 crochets muraux design',
        supplierPrice: 12.00,
        currency: 'MAD',
        productionDays: 1,
        weight: 0.050,
        length: 6,
        width: 4,
        height: 3,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      },
    }),
  ])

  console.log('✅ Products created')

  // Create platform settings
  await Promise.all([
    prisma.platformSetting.upsert({
      where: { key: 'commission_rate' },
      update: { value: '0.10' },
      create: { key: 'commission_rate', value: '0.10', description: 'Taux de commission plateforme (10%)' },
    }),
    prisma.platformSetting.upsert({
      where: { key: 'platform_name' },
      update: { value: 'Fabli' },
      create: { key: 'platform_name', value: 'Fabli', description: 'Nom de la plateforme' },
    }),
    prisma.platformSetting.upsert({
      where: { key: 'default_currency' },
      update: { value: 'MAD' },
      create: { key: 'default_currency', value: 'MAD', description: 'Devise par défaut' },
    }),
    prisma.platformSetting.upsert({
      where: { key: 'order_number_prefix' },
      update: { value: 'FAB' },
      create: { key: 'order_number_prefix', value: 'FAB', description: 'Préfixe des numéros de commande' },
    }),
  ])

  console.log('✅ Platform settings created')

  // Intégration AMEEX : aucune ligne n'est créée avec des identifiants factices.
  // Les identifiants réels sont saisis par l'administrateur depuis
  // /dashboard/admin/ameex, ce qui les chiffre au repos (§6.5). Une ligne avec
  // des valeurs « placeholder » ferait croire à une intégration configurée tout
  // en échouant sur le premier appel.
  await prisma.courierIntegration.deleteMany({ where: { name: 'AMEEX' } })
  console.log('ℹ️  Intégration AMEEX non amorcée : à configurer depuis /dashboard/admin/ameex')

  // Référentiel villes : l'API AMEEX attend un identifiant de ville, pas un
  // nom libre. Sans correspondance, la création d'expédition est refusée avec
  // un message explicite. Les identifiants ci-dessous sont des exemples : ils
  // doivent être remplacés par les valeurs réelles du compte AMEEX.
  const cities = [
    { name: 'Casablanca', ameexId: '1' },
    { name: 'Rabat', ameexId: '2' },
    { name: 'Marrakech', ameexId: '3' },
    { name: 'Fès', ameexId: '4' },
    { name: 'Tanger', ameexId: '5' },
    { name: 'Agadir', ameexId: '6' },
    { name: 'Meknès', ameexId: '7' },
    { name: 'Oujda', ameexId: '8' },
    { name: 'Kénitra', ameexId: '9' },
    { name: 'Tétouan', ameexId: '10' },
    { name: 'Safi', ameexId: '11' },
    { name: 'Salé', ameexId: '12' },
    { name: 'Témara', ameexId: '13' },
    { name: 'Essaouira', ameexId: '14' },
    { name: 'El Jadida', ameexId: '15' },
    { name: 'Béni Mellal', ameexId: '16' },
    { name: 'Nador', ameexId: '17' },
    { name: 'Khouribga', ameexId: '18' },
    { name: 'Berrechid', ameexId: '19' },
    { name: 'Ouarzazate', ameexId: '20' },
  ]

  for (const city of cities) {
    await prisma.city.upsert({
      where: { name: city.name },
      update: {},
      create: { name: city.name, ameexId: city.ameexId, isActive: true },
    })
  }

  console.log(`✅ ${cities.length} villes de référence créées (identifiants AMEEX à confirmer)`)

  console.log('🎉 Database seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })