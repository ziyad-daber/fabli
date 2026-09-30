import { prisma } from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/helpers'
import { statusLabel, type OrderStatusType } from '@/lib/orders/status'

/**
 * Notifications (§7).
 *
 * Contrainte du cahier des charges : si aucun canal n'est configuré au
 * lancement, le Code Suivi reste consultable et copiable manuellement. Le
 * service journalise donc *toujours* dans `NotificationLog`, puis tente
 * l'envoi si un transport est disponible. Un échec d'envoi ne casse jamais le
 * parcours métier.
 */

export type NotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'SHIPMENT_CREATED'
  | 'TRACKING_CODE_CUSTOMER'
  | 'SETTLEMENT_PAID'
  | 'ACCOUNT_VALIDATED'
  | 'PASSWORD_RESET'

export interface NotificationInput {
  type: NotificationType
  recipient: string
  subject?: string
  body: string
  userId?: string | null
  metadata?: Record<string, unknown>
}

interface Transport {
  name: string
  send(input: NotificationInput): Promise<void>
}

/**
 * Transport par défaut : rien n'est envoyé, le message reste journalisé et
 * consultable. C'est le comportement attendu quand aucun service SMS,
 * WhatsApp ou e-mail n'est configuré.
 */
const logTransport: Transport = {
  name: 'log',
  async send() {
    // Intentionnellement vide : le journal suffit.
  },
}

function buildTransports(): Transport[] {
  const transports: Transport[] = [logTransport]

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transports.push({
      name: 'smtp',
      async send(input) {
        const { SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env
        const user = SMTP_USER as string
        const pass = SMTP_PASSWORD as string
        const from = SMTP_FROM || user
        const to = input.recipient
        const body = `${input.subject ? `${input.subject}\n\n` : ''}${input.body}`

        // nodemailer n'est pas dans les dépendances du MVP : l'envoi SMTP reste
        // volontairement sur le transport `log` tant que le module n'est pas
        // installé, plutôt que d'échouer silencieusement.
        console.warn(
          `[Notifications] transport smtp non activé (nodemailer absent) → ${from} → ${to} : ${body.slice(0, 120)}`
        )
      },
    })
  }

  return transports
}

const TRANSPORTS = buildTransports()

/** Journalise systématiquement, puis tente l'envoi sur chaque transport. */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        userId: input.userId ?? null,
        type: input.type,
        recipient: input.recipient,
        subject: input.subject ?? null,
        body: input.body,
        status: 'PENDING',
        metadata: (input.metadata ?? undefined) as never,
      },
    })
  } catch (error) {
    console.error('[Notifications] journalisation impossible', error)
    return
  }

  for (const transport of TRANSPORTS) {
    try {
      await transport.send(input)
      await prisma.notificationLog.updateMany({
        where: { type: input.type, recipient: input.recipient, status: 'PENDING' },
        data: { status: `SENT:${transport.name}`, sentAt: new Date() },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      console.error(`[Notifications] transport ${transport.name} en échec`, message)
      await prisma.notificationLog.updateMany({
        where: { type: input.type, recipient: input.recipient, status: 'PENDING' },
        data: { status: `FAILED:${transport.name}`, error: message },
      })
    }
  }
}

async function getOrderContacts(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      supplier: { select: { userId: true, companyName: true, user: { select: { email: true } } } },
      reseller: { select: { userId: true, companyName: true, user: { select: { email: true } } } },
      shipments: { select: { trackingCode: true, status: true }, take: 1 },
    },
  })
  return order
}

/** Le fournisseur est prévenu qu'une commande arrive à traiter. */
export async function notifyOrderCreated(orderId: string): Promise<void> {
  const order = await getOrderContacts(orderId)
  if (!order) return

  await notify({
    type: 'ORDER_CREATED',
    userId: order.supplier.userId,
    recipient: order.supplier.user.email,
    subject: `Nouvelle commande ${order.orderNumber}`,
    body: `La commande ${order.orderNumber} de ${order.reseller.companyName} vous a été adressée. Connectez-vous pour l'accepter.`,
    metadata: { orderId, orderNumber: order.orderNumber },
  })
}

/** Les parties concernées sont informées d'un changement de statut. */
export async function notifyOrderStatusChanged(
  orderId: string,
  from: OrderStatusType,
  to: OrderStatusType
): Promise<void> {
  const order = await getOrderContacts(orderId)
  if (!order) return

  const body = `La commande ${order.orderNumber} est passée de « ${statusLabel(from)} » à « ${statusLabel(to)} ».`

  await Promise.all([
    notify({
      type: 'ORDER_STATUS_CHANGED',
      userId: order.supplier.userId,
      recipient: order.supplier.user.email,
      subject: `Commande ${order.orderNumber} — ${statusLabel(to)}`,
      body,
      metadata: { orderId, from, to },
    }),
    notify({
      type: 'ORDER_STATUS_CHANGED',
      userId: order.reseller.userId,
      recipient: order.reseller.user.email,
      subject: `Commande ${order.orderNumber} — ${statusLabel(to)}`,
      body,
      metadata: { orderId, from, to },
    }),
  ])
}

/**
 * Le Code Suivi est transmis au fournisseur, au revendeur et au destinataire
 * (§6.4 / §7). Le destinataire est notifié via le canal fourni à la commande.
 */
export async function notifyTrackingCodeAvailable(
  orderId: string,
  trackingCode: string,
  carrier: string
): Promise<void> {
  const order = await getOrderContacts(orderId)
  if (!order) return

  const subject = `Code Suivi ${trackingCode}`
  const body = `Votre expédition est prise en charge par ${carrier}. Code Suivi : ${trackingCode}`

  await Promise.all([
    notify({
      type: 'SHIPMENT_CREATED',
      userId: order.supplier.userId,
      recipient: order.supplier.user.email,
      subject,
      body,
      metadata: { orderId, trackingCode },
    }),
    notify({
      type: 'SHIPMENT_CREATED',
      userId: order.reseller.userId,
      recipient: order.reseller.user.email,
      subject,
      body,
      metadata: { orderId, trackingCode },
    }),
    // Destinataire : téléphone en priorité (SMS/WhatsApp), sinon e-mail.
    order.customerPhone
      ? notify({
          type: 'TRACKING_CODE_CUSTOMER',
          recipient: order.customerPhone,
          subject: `Suivi de votre commande ${order.orderNumber}`,
          body,
          metadata: { orderId, trackingCode },
        })
      : order.customerEmail
        ? notify({
            type: 'TRACKING_CODE_CUSTOMER',
            recipient: order.customerEmail,
            subject: `Suivi de votre commande ${order.orderNumber}`,
            body,
            metadata: { orderId, trackingCode },
          })
        : Promise.resolve(),
  ])
}

export async function notifyAccountValidated(email: string, userId: string): Promise<void> {
  await notify({
    type: 'ACCOUNT_VALIDATED',
    userId,
    recipient: email,
    subject: 'Votre compte Fabli est actif',
    body: 'Votre compte a été validé par un administrateur. Vous pouvez désormais vous connecter.',
  })
}

export async function notifySettlementPaid(
  email: string,
  userId: string,
  amount: number,
  reference: string
): Promise<void> {
  await notify({
    type: 'SETTLEMENT_PAID',
    userId,
    recipient: email,
    subject: `Règlement ${reference}`,
    body: `Un règlement de ${formatCurrency(amount)} a été enregistré sous la référence ${reference}.`,
  })
}

export async function notifyPasswordReset(email: string, resetUrl: string): Promise<void> {
  await notify({
    type: 'PASSWORD_RESET',
    recipient: email,
    subject: 'Réinitialisation de votre mot de passe',
    body: `Pour définir un nouveau mot de passe, ouvrez ce lien dans les 60 minutes : ${resetUrl}`,
  })
}