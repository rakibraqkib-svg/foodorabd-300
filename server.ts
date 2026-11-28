import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { and, asc, desc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { db, hasDatabaseConfig } from './src/db/index.ts';
import {
  aiProviders,
  auditLogs,
  commissionLedger,
  coupons,
  customerAddresses,
  foodItems,
  localCredentials,
  notifications,
  orders,
  orderStatusHistory,
  partnerApiKeys,
  paymentGateways,
  paymentTransactions,
  platformSettings,
  restaurantPayouts,
  restaurants,
  reviews,
  riderJobApplications,
  riderJobs,
  riders,
  riderWalletLedger,
  users,
  vendorAdminMessages,
} from './src/db/schema.ts';
import { ensureSchemaTables } from './src/db/ensure-schema.ts';
import { ensureDatabaseSeeded, IMG_BANGLA } from './src/db/seed.ts';
import {
  ensureDefaultAiProviders,
  ensureDefaultPaymentGateways,
  getActiveCoupons,
  getAdminWorkspace,
  getApprovedRestaurants,
  getCustomerAddresses,
  getCustomerFavorites,
  getCustomerOrders,
  getNotificationsForUser,
  getOrderById,
  getPlatformSettingsRow,
  getRestaurantBySlug,
  getRiderWorkspace,
  getStorefrontProducts,
  getVendorWorkspace,
  toggleCustomerFavorite,
} from './src/db/queries.ts';
import {
  AuthRequest,
  getOrCreateUser,
  optionalAuth,
  requireAuth,
  requireRole,
  signSandboxToken,
  UserRole,
} from './src/middleware/auth.ts';
import { supabaseServer } from './src/lib/supabase-admin.ts';
import {
  ADMIN_PIN_DEFAULT_EMAIL,
  type AiHelpLangPreference,
  buildAiHelpSystemInstruction,
  buildBranchRestaurantNames,
  buildOpenRouterChatPayload,
  buildRestaurantUnavailableMessage,
  buildRobotsTxt,
  buildSitemapXml,
  calculateCartItemUnitPrice,
  calculateOrderFinancials,
  calculateSplitOrderFinancials,
  calculateZoneDistanceDeliveryFee,
  canActorModifyUserAccount,
  canOwnerOpenNewRestaurant,
  canRiderAcceptOrders,
  canTransitionOrderStatus,
  canVendorProcessPrepaidOrder,
  DeliveryMode,
  doesEmailMatchOrder,
  estimateDeliveryFeeAndEta,
  parseUploadedImageDataUrl,
  evaluateCoupon,
  extractAiReplyText,
  coerceSafeErrorText,
  filterGeminiCandidateModels,
  generateFoodoraOwnAiReply,
  haversineDistanceKm,
  isBicycleVehicleType,
  isProtectedSuperAdminEmail,
  isValidExternalAiBaseUrl,
  mergeDeliveryFinancialConfig,
  normalizeAiProviderCode,
  normalizeGatewayCode,
  normalizePartnerProductInput,
  OrderStatus,
  PaymentMethod,
  pickNearestStandbyRider,
  resolveRiderCashCollectAmount,
  selectAutoBangladeshiDeliveryService,
  summarizeDhakaZoneRiderCoverage,
  summarizeRiderWalletLedger,
  toAdminAiProviderView,
  toAdminPaymentGatewayView,
  toPublicAiProviderView,
  toPublicPaymentGatewayView,
  validateBroadcastNotification,
  validateRiderJobPayload,
  normalizeVariationsList,
  normalizeAddonsList,
  sanitizeRiderProfileUpdate,
  validateVendorAddRiderPayload,
} from './src/lib/marketplace-logic.ts';
import { mergeStorefrontConfig } from './src/lib/storefront-config.ts';
import { getDeliveryProvider } from './src/services/delivery.ts';
import {
  fetchBdtExchangeRates,
  fetchDhakaWeather,
  fetchOsrmRoute,
  reverseOsmGeocode,
  searchMealDbDishes,
  searchOsmPlaces,
} from './src/services/free-apis.ts';
import {
  getAdminEmailSettingsView,
  getEmailTransportStatus,
  getRecentOrderEmailLogs,
  resendOrderEmailLog,
  resolveCustomerEmailForOrder,
  saveAdminEmailSettings,
  sendAndLogOrderTrackingEmail,
  sendMerchantOrderAlertEmail,
  sendTestEmail,
  sendTransactionalEmail,
  verifyEmailTransportConnection,
} from './src/services/order-email.ts';
import {
  attachSseRealtimeClient,
  broadcastNotificationEvent,
  broadcastOrderEvent,
  broadcastVendorAdminMessage,
  initRealtimeWebSocketServer,
} from './src/services/realtime.ts';
import {
  getGatewayAvailability,
  initiatePaymentSession,
  isEnvConfiguredForGateway,
  validatePaymentGatewayConfiguration,
  verifyPaymentServerSide,
} from './src/services/payments.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT =
  path.basename(__dirname) === 'api' ? path.resolve(__dirname, '..') : __dirname;
const UPLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'foodora-uploads')
  : path.resolve(PROJECT_ROOT, 'public', 'uploads');
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // ignore read-only FS in serverless runtimes
}

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Ensure DB is lazily seeded once on first API hit (no eager startup probe at module load)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path === '/export/project-zip') {
    return next();
  }
  if (!hasDatabaseConfig()) {
    return res.status(503).json({
      error:
        'Database is not configured. Please add DATABASE_URL in Vercel Environment Variables and redeploy.',
    });
  }
  try {
    await ensureDatabaseSeeded();
  } catch (err) {
    console.error('Lazy database seed check failed:', err);
  }
  next();
});

// Idempotent financial settlement when order is delivered
async function settleOrderCommissionIdempotent(orderId: number) {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(commissionLedger)
      .where(
        and(
          eq(commissionLedger.orderId, orderId),
          eq(commissionLedger.entryType, 'commission_earned')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return; // Idempotency guard: never double-count
    }

    const orderRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return;
    const order = orderRows[0];

    await tx.insert(commissionLedger).values({
      orderId: order.id,
      restaurantId: order.restaurantId,
      entryType: 'commission_earned',
      grossAmount: Math.max(0, order.subtotal - order.discountAmount),
      commissionAmount: order.platformCommission,
      netRestaurantAmount: order.restaurantEarnings,
      deliveryFeeAmount: order.deliveryFee,
      note: `Commission (${order.commissionRate}%) settled for ${order.orderNumber}`,
    });
  });
}

async function recordRiderDeliveryWalletIdempotent(
  orderId: number,
  collectedCashInput?: number | null,
  actorUid: string = 'system'
) {
  await db.transaction(async (tx) => {
    const orderRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return;
    const order = orderRows[0];

    const expectedCash =
      order.paymentSplitMode === 'online_food_cash_delivery'
        ? Math.max(0, order.cashDueToRider || order.deliveryFee || 0)
        : order.paymentMethod === 'cod'
        ? Math.max(0, order.totalAmount)
        : 0;

    const finalCollectedCash =
      typeof collectedCashInput === 'number' && Number.isFinite(collectedCashInput)
        ? Math.max(0, Math.round(collectedCashInput))
        : expectedCash;

    // Update order cash collection status once
    if (order.cashCollectionStatus !== 'collected') {
      await tx
        .update(orders)
        .set({
          cashCollectionStatus: 'collected',
          cashCollectedAmount: finalCollectedCash,
          cashCollectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    // Mark delivery_cash transaction succeeded or create idempotently
    const delCashKey = `delivery_cash:${order.orderNumber}`;
    const existingDelTx = await tx
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, delCashKey))
      .limit(1);

    if (existingDelTx.length > 0) {
      await tx
        .update(paymentTransactions)
        .set({
          amount: finalCollectedCash,
          status: 'succeeded',
          riderUid: order.riderUid || existingDelTx[0].riderUid || '',
          note: `Cash delivery charge collected by rider (${actorUid})`,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.idempotencyKey, delCashKey));
    } else {
      await tx
        .insert(paymentTransactions)
        .values({
          orderId: order.id,
          orderNumber: order.orderNumber,
          txKind: 'delivery_cash',
          idempotencyKey: delCashKey,
          payerRole: 'customer',
          recipientRole: 'rider',
          paymentMethod: 'cash',
          amount: finalCollectedCash,
          status: 'succeeded',
          riderUid: order.riderUid || '',
          note: `Cash delivery charge collected by rider (${actorUid})`,
        })
        .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }

    if (!order.riderUid) return;

    const earnKey = `delivery_earn:${order.orderNumber}`;
    const existingEarn = await tx
      .select()
      .from(riderWalletLedger)
      .where(eq(riderWalletLedger.idempotencyKey, earnKey))
      .limit(1);

    if (existingEarn.length > 0) {
      return; // Idempotency guard: never double-credit rider earnings/deliveries
    }

    const riderShare =
      order.riderEarningAmount > 0
        ? order.riderEarningAmount
        : Math.max(0, Math.round((order.cashDueToRider || order.deliveryFee || 0) * 0.75));
    const foodoraCommission =
      order.foodoraDeliveryCommission > 0 || (order.cashDueToRider || order.deliveryFee) > 0
        ? Math.max(0, (order.cashDueToRider || order.deliveryFee || 0) - riderShare)
        : 0;

    await tx
      .insert(riderWalletLedger)
      .values({
        riderUid: order.riderUid,
        orderId: order.id,
        orderNumber: order.orderNumber,
        entryType: 'delivery_earning',
        idempotencyKey: earnKey,
        cashCollected: finalCollectedCash,
        riderEarningDelta: riderShare,
        commissionOwedDelta: 0,
        commissionSettledDelta: 0,
        referenceId: `DEL-${order.orderNumber}`,
        note: `Cash collected ৳${finalCollectedCash} · Rider earned ৳${riderShare}`,
      })
      .onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });

    if (foodoraCommission > 0) {
      await tx
        .insert(riderWalletLedger)
        .values({
          riderUid: order.riderUid,
          orderId: order.id,
          orderNumber: order.orderNumber,
          entryType: 'commission_owed',
          idempotencyKey: `commission_owed:${order.orderNumber}`,
          cashCollected: 0,
          riderEarningDelta: 0,
          commissionOwedDelta: foodoraCommission,
          commissionSettledDelta: 0,
          referenceId: `COM-${order.orderNumber}`,
          note: `Foodora delivery commission owed on ${order.orderNumber}`,
        })
        .onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });
    }

    await tx
      .update(riders)
      .set({
        totalDeliveries: sql`${riders.totalDeliveries} + 1`,
        totalEarnings: sql`${riders.totalEarnings} + ${riderShare}`,
      })
      .where(eq(riders.uid, order.riderUid));
  });
}

async function reverseOrderSplitFinancialsTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  order: typeof orders.$inferSelect,
  reason: string
) {
  const foodPaidAmt =
    order.paymentSplitMode === 'online_food_cash_delivery'
      ? Math.max(0, order.onlineFoodPaidAmount || 0)
      : Math.max(0, order.totalAmount);

  if (order.paymentStatus === 'paid' && foodPaidAmt > 0) {
    await tx
      .insert(paymentTransactions)
      .values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        txKind: 'food_refund',
        idempotencyKey: `food_refund:${order.orderNumber}`,
        payerRole: 'platform',
        recipientRole: 'customer',
        paymentMethod: order.paymentMethod,
        amount: foodPaidAmt,
        status: 'refunded',
        gatewayTxId: order.paymentTxId || '',
        note: reason,
      })
      .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
  }

  const delCashKey = `delivery_cash:${order.orderNumber}`;
  if (order.cashCollectionStatus === 'collected') {
    await tx
      .insert(paymentTransactions)
      .values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        txKind: 'delivery_reversal',
        idempotencyKey: `delivery_reversal:${order.orderNumber}`,
        payerRole: 'rider',
        recipientRole: 'customer',
        paymentMethod: 'cash',
        amount: order.cashCollectedAmount || order.cashDueToRider || order.deliveryFee || 0,
        status: 'refunded',
        riderUid: order.riderUid || '',
        note: reason,
      })
      .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });

    await tx
      .update(orders)
      .set({ cashCollectionStatus: 'reversed', updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  } else {
    await tx
      .update(paymentTransactions)
      .set({ status: 'cancelled', note: reason, updatedAt: new Date() })
      .where(eq(paymentTransactions.idempotencyKey, delCashKey));
  }

  if (order.riderUid) {
    const existingEarn = await tx
      .select()
      .from(riderWalletLedger)
      .where(eq(riderWalletLedger.idempotencyKey, `delivery_earn:${order.orderNumber}`))
      .limit(1);
    if (existingEarn.length > 0) {
      const earnRow = existingEarn[0];
      const existingOwed = await tx
        .select()
        .from(riderWalletLedger)
        .where(eq(riderWalletLedger.idempotencyKey, `commission_owed:${order.orderNumber}`))
        .limit(1);
      const owedAmt = existingOwed[0]?.commissionOwedDelta || 0;
      await tx
        .insert(riderWalletLedger)
        .values({
          riderUid: order.riderUid,
          orderId: order.id,
          orderNumber: order.orderNumber,
          entryType: 'commission_reversal',
          idempotencyKey: `delivery_rev:${order.orderNumber}`,
          cashCollected: -(earnRow.cashCollected || 0),
          riderEarningDelta: -(earnRow.riderEarningDelta || 0),
          commissionOwedDelta: -owedAmt,
          commissionSettledDelta: 0,
          referenceId: `REV-${order.orderNumber}`,
          note: reason,
        })
        .onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });
    }
  }
}

function getRequestOrigin(req: express.Request): string {
  const protoHeader = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  return `${protoHeader || 'http'}://${hostHeader || 'localhost:3000'}`;
}

app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildRobotsTxt(getRequestOrigin(req)));
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    if (hasDatabaseConfig()) {
      await ensureDatabaseSeeded();
    }
    const approved = hasDatabaseConfig() ? await getApprovedRestaurants() : [];
    const xml = buildSitemapXml(
      getRequestOrigin(req),
      approved.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt })),
      {
        areas: [
          'Gulshan 2',
          'Banani',
          'Dhanmondi',
          'Uttara',
          'Mirpur',
          'Bashundhara R/A',
          'Motijheel',
          'Chattogram',
          'Sylhet',
          'Rajshahi',
          'Khulna',
        ],
        cuisines: [
          'Biriyani',
          'Burger',
          'Pizza',
          'Bangladeshi',
          'Kabab',
          'Chinese & Momos',
          'Bakery & Cakes',
          'Coffee & Drinks',
        ],
      }
    );
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.send(xml);
  } catch {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(buildSitemapXml(getRequestOrigin(req), []));
  }
});

app.get(/^\/(google[a-zA-Z0-9_-]+\.html)$/, async (req, res, next) => {
  const filename = req.params[0] || '';
  if (!filename) return next();
  try {
    const settings = hasDatabaseConfig() ? await getPlatformSettingsRow() : null;
    const sc = mergeStorefrontConfig(settings?.storefrontConfig);
    const configuredToken = (
      sc.googleSiteVerification ||
      process.env.GOOGLE_SITE_VERIFICATION ||
      ''
    ).trim();
    const expectedFilename = configuredToken.endsWith('.html')
      ? configuredToken
      : configuredToken.startsWith('google')
      ? `${configuredToken}.html`
      : '';
    if (configuredToken && (filename === expectedFilename || configuredToken === filename)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`google-site-verification: ${filename}`);
    }
  } catch {
    // fall through
  }
  return res.status(404).send('Google Search Console verification file not configured.');
});

// ---------- Public & Health Routes ----------

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'foodora-bd',
    databaseConfigured: hasDatabaseConfig(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/public-config', async (_req, res) => {
  try {
    const [settings, gatewayRows, activeOrderRows, allRiders] = await Promise.all([
      getPlatformSettingsRow(),
      ensureDefaultPaymentGateways(),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          trackingToken: orders.trackingToken,
          restaurantName: orders.restaurantName,
          estimatedMinutes: orders.estimatedMinutes,
        })
        .from(orders)
        .where(and(ne(orders.status, 'delivered'), ne(orders.status, 'cancelled')))
        .orderBy(desc(orders.createdAt))
        .limit(30)
        .catch(() => []),
      db
        .select({
          zone: riders.zone,
          status: riders.status,
          isAvailable: riders.isAvailable,
        })
        .from(riders)
        .catch(() => []),
    ]);
    const paymentGatewaysList = gatewayRows.map((row) =>
      toPublicPaymentGatewayView(row, isEnvConfiguredForGateway(row.code))
    );
    const emailTransport = await getEmailTransportStatus();
    const sc = mergeStorefrontConfig(settings?.storefrontConfig);
    if (!sc.googleSiteVerification && process.env.GOOGLE_SITE_VERIFICATION) {
      sc.googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION.trim();
    }
    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      (settings?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
    );
    const dhakaZoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, deliveryFinancialConfig);
    const settingsWithVerification = settings
      ? { ...settings, storefrontConfig: sc, deliveryFinancialConfig }
      : settings;
    const pinnedId = Number(sc.featuredActiveOrderId);
    const activeRow =
      sc.showActiveDeliveryBar === false
        ? undefined
        : (Number.isInteger(pinnedId) && pinnedId > 0
            ? activeOrderRows.find((r) => r.id === pinnedId)
            : undefined) || activeOrderRows[0];
    res.json({
      mapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
      gateways: getGatewayAvailability(),
      paymentGateways: paymentGatewaysList,
      emailTransport,
      settings: settingsWithVerification,
      deliveryFinancialConfig,
      dhakaZoneCoverage,
      featuredActiveOrder: activeRow
        ? {
            orderId: activeRow.id,
            trackingToken: activeRow.trackingToken,
            orderNumber: activeRow.orderNumber,
            restaurantName: activeRow.restaurantName,
            estimatedMinutes: activeRow.estimatedMinutes,
          }
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load public config' });
  }
});

app.get('/api/realtime/stream', async (req, res) => {
  const qs = new URLSearchParams();
  if (typeof req.query.token === 'string') qs.set('token', req.query.token);
  if (typeof req.query.orderId === 'string') qs.set('orderId', req.query.orderId);
  if (typeof req.query.trackingToken === 'string') qs.set('trackingToken', req.query.trackingToken);
  const cleanup = await attachSseRealtimeClient(res, qs);
  req.on('close', cleanup);
});

// ---------- Auth & Sandbox Personas ----------

app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/sandbox-session', async (req, res) => {
  const requestedRole = typeof req.body?.role === 'string' ? req.body.role : '';
  if (requestedRole === 'super_admin' || requestedRole === 'admin') {
    return res.status(403).json({
      error: 'Admin and Super Admin access is restricted. Please sign in with an authorized Admin account.',
    });
  }
  const schema = z.object({
    role: z.enum(['customer', 'restaurant_owner', 'rider']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid demo workspace role' });
  }

  const personas: Record<
    'customer' | 'restaurant_owner' | 'rider',
    { uid: string; email: string; fullName: string; role: UserRole }
  > = {
    customer: {
      uid: 'demo-customer-uid',
      email: 'customer@foodora.bd',
      fullName: 'Rahim Uddin',
      role: 'customer',
    },
    restaurant_owner: {
      uid: 'demo-vendor-uid',
      email: 'partner@sultansdine.bd',
      fullName: "Tariqul Islam (Sultan's Dine)",
      role: 'restaurant_owner',
    },
    rider: {
      uid: 'demo-rider-uid',
      email: 'rider@foodora.bd',
      fullName: 'Kamrul Hasan',
      role: 'rider',
    },
  };

  const p = personas[parsed.data.role];
  const token = signSandboxToken(p);
  res.json({ token, user: { ...p, isSandbox: true } });
});

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordScrypt(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

const ADMIN_PIN_VAULT_KEY = '__admin_panel_pin__';
const ADMIN_PIN_VAULT_UID = 'admin-pin-vault';
const ADMIN_PIN_EMAIL_PREFIX = '__admin_pin__:';

function adminPinKeyForEmail(email: string): string {
  return `${ADMIN_PIN_EMAIL_PREFIX}${email.trim().toLowerCase()}`;
}

function getFallbackAdminPin(): string {
  return process.env.ADMIN_ACCESS_PIN || '2026';
}

async function verifyAdminPinValue(pin: string): Promise<boolean> {
  const rows = await db
    .select({ passwordHash: localCredentials.passwordHash })
    .from(localCredentials)
    .where(eq(localCredentials.email, ADMIN_PIN_VAULT_KEY))
    .limit(1);

  if (rows.length > 0) {
    return verifyPasswordScrypt(pin, rows[0].passwordHash);
  }

  const fallback = getFallbackAdminPin();
  const a = Buffer.from(pin, 'utf8');
  const b = Buffer.from(fallback, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function verifyAdminPinForEmail(email: string, pin: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const specificRows = await db
    .select({ passwordHash: localCredentials.passwordHash })
    .from(localCredentials)
    .where(eq(localCredentials.email, adminPinKeyForEmail(normalized)))
    .limit(1);

  if (specificRows.length > 0) {
    return verifyPasswordScrypt(pin, specificRows[0].passwordHash);
  }

  if (isProtectedSuperAdminEmail(normalized)) {
    return verifyAdminPinValue(pin);
  }

  return false;
}

app.post('/api/auth/admin-pin', async (req, res) => {
  const schema = z.object({
    pin: z.string().trim().min(4).max(16),
    email: z.string().trim().email().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid Admin email and 4–16 character PIN.' });
  }

  const targetEmail = (parsed.data.email || ADMIN_PIN_DEFAULT_EMAIL).trim().toLowerCase();

  try {
    const valid = await verifyAdminPinForEmail(targetEmail, parsed.data.pin);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect Admin email or PIN. Please try again.' });
    }

    const existingRows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${targetEmail}`)
      .limit(1);

    if (existingRows[0]?.status === 'suspended') {
      return res.status(403).json({ error: 'This Admin account has been suspended.' });
    }

    const assignedRole: UserRole = isProtectedSuperAdminEmail(targetEmail)
      ? 'super_admin'
      : existingRows[0]?.role === 'super_admin'
      ? 'super_admin'
      : 'admin';

    let dbUser = existingRows[0];
    if (dbUser) {
      if (dbUser.role !== assignedRole) {
        const updated = await db
          .update(users)
          .set({ role: assignedRole, updatedAt: new Date() })
          .where(eq(users.id, dbUser.id))
          .returning();
        dbUser = updated[0];
      }
    } else {
      const uid = `adm-${crypto.randomBytes(8).toString('hex')}`;
      const defaultName =
        targetEmail === ADMIN_PIN_DEFAULT_EMAIL ? 'Raqib Rony (Admin)' : targetEmail.split('@')[0];
      dbUser = await getOrCreateUser(uid, targetEmail, defaultName, assignedRole);
    }

    const token = signSandboxToken({
      uid: dbUser.uid,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: assignedRole,
      isSandbox: false,
    });

    try {
      await db.insert(auditLogs).values({
        actorUid: dbUser.uid,
        action: 'admin_pin_unlock',
        targetType: 'auth',
        targetId: dbUser.email,
        details: `Admin workspace (${assignedRole}) unlocked via Admin PIN for ${dbUser.email}`,
      });
    } catch {
      // non-fatal audit log skip
    }

    return res.json({
      token,
      user: {
        uid: dbUser.uid,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: assignedRole,
        isSandbox: false,
      },
    });
  } catch (error: any) {
    console.error('Admin PIN unlock failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to verify Admin PIN' });
  }
});

app.post(
  '/api/admin/pin',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      currentPin: z.string().trim().min(4).max(16),
      newPin: z.string().trim().min(4).max(16),
      adminEmail: z.string().trim().email().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Valid Admin email, current PIN, and new PIN (4–16 chars) are required.' });
    }

    const targetEmail = (parsed.data.adminEmail || ADMIN_PIN_DEFAULT_EMAIL).trim().toLowerCase();

    try {
      const valid =
        (await verifyAdminPinForEmail(req.user!.email, parsed.data.currentPin)) ||
        (await verifyAdminPinForEmail(targetEmail, parsed.data.currentPin)) ||
        (await verifyAdminPinValue(parsed.data.currentPin));
      if (!valid) {
        return res.status(401).json({ error: 'Current Admin PIN is incorrect.' });
      }

      const nextHash = hashPasswordScrypt(parsed.data.newPin);
      const pinKey = adminPinKeyForEmail(targetEmail);
      const pinUid = `admin-pin-${crypto.createHash('sha256').update(targetEmail).digest('hex').slice(0, 16)}`;

      await db
        .insert(localCredentials)
        .values({
          email: pinKey,
          uid: pinUid,
          passwordHash: nextHash,
        })
        .onConflictDoUpdate({
          target: localCredentials.email,
          set: { passwordHash: nextHash },
        });

      const existingTarget = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${targetEmail}`)
        .limit(1);

      const targetRole: UserRole = isProtectedSuperAdminEmail(targetEmail)
        ? 'super_admin'
        : existingTarget[0]?.role === 'super_admin'
        ? 'super_admin'
        : 'admin';

      if (existingTarget.length > 0) {
        if (existingTarget[0].role !== targetRole) {
          await db
            .update(users)
            .set({ role: targetRole, updatedAt: new Date() })
            .where(eq(users.id, existingTarget[0].id));
        }
      } else {
        await getOrCreateUser(
          `adm-${crypto.randomBytes(8).toString('hex')}`,
          targetEmail,
          targetEmail === ADMIN_PIN_DEFAULT_EMAIL ? 'Raqib Rony (Admin)' : targetEmail.split('@')[0],
          targetRole
        );
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'admin_pin_updated',
        targetType: 'security',
        targetId: targetEmail,
        details: `Admin Panel PIN created/updated for ${targetEmail} (${targetRole})`,
      });

      return res.json({
        ok: true,
        adminEmail: targetEmail,
        message: `Admin Panel PIN saved for ${targetEmail}.`,
      });
    } catch (error: any) {
      console.error('Admin PIN update failed:', error);
      return res.status(500).json({ error: error.message || 'Failed to update Admin PIN' });
    }
  }
);

function isMissingTableError(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  return code === '42P01';
}

function isUniqueViolationError(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  return code === '23505';
}

app.post('/api/auth/register', async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    password: z.string().min(6).max(128),
    role: z.enum(['customer', 'restaurant_owner', 'rider']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please provide a valid name, email, and password (min 6 chars).' });
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  const fullName = parsed.data.fullName.trim();
  const requestedRole = parsed.data.role || 'customer';

  const attemptRegister = async () => {
    const existingCred = await db
      .select({ uid: localCredentials.uid })
      .from(localCredentials)
      .where(eq(localCredentials.email, emailLower))
      .limit(1);
    if (existingCred.length > 0) {
      return { status: 409 as const, body: { error: 'An account with this email already exists. Please sign in.' } };
    }

    const existingUser = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${emailLower}`)
      .limit(1);
    if (existingUser.length > 0) {
      return {
        status: 409 as const,
        body: {
          error: 'An account with this email already exists. Please sign in with Google or your existing credentials.',
        },
      };
    }

    const uid = `usr-${crypto.randomBytes(8).toString('hex')}`;
    const role: UserRole = isProtectedSuperAdminEmail(emailLower) ? 'super_admin' : requestedRole;
    const passwordHash = hashPasswordScrypt(parsed.data.password);

    await db.transaction(async (tx) => {
      await tx.insert(localCredentials).values({
        email: emailLower,
        uid,
        passwordHash,
      });

      await tx.insert(users).values({
        uid,
        email: emailLower,
        fullName,
        role,
      });

      if (role === 'rider') {
        await tx
          .insert(riders)
          .values({
            uid,
            fullName,
            phone: '+8801700000000',
            email: emailLower,
            vehicleType: 'Motorbike',
            zone: 'ZONE 01 — GULSHAN',
            isAvailable: false,
            status: 'pending',
          })
          .onConflictDoNothing();

        await tx.insert(notifications).values({
          recipientUid: 'role-super_admin',
          roleTarget: 'super_admin',
          title: 'New Dhaka Zone Rider Pending Approval',
          message: `${fullName} registered as a rider and awaits zone approval.`,
          type: 'system',
        });
      }
    });

    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return {
      status: 201 as const,
      body: {
        token,
        user: { uid, email: emailLower, fullName, role, isSandbox: false },
      },
    };
  };

  try {
    let result;
    try {
      result = await attemptRegister();
    } catch (err: any) {
      if (isMissingTableError(err)) {
        await ensureSchemaTables();
        result = await attemptRegister();
      } else {
        throw err;
      }
    }
    return res.status(result.status).json(result.body);
  } catch (error: any) {
    if (isUniqueViolationError(error)) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }
    console.error('Register failed:', error);
    return res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid email and password.' });
  }

  const emailLower = parsed.data.email.trim().toLowerCase();

  const attemptLogin = async () => {
    const credRows = await db
      .select()
      .from(localCredentials)
      .where(eq(localCredentials.email, emailLower))
      .limit(1);

    if (credRows.length === 0) {
      // Fallback: check if user registered via Supabase Email & Password
      try {
        const { data: supaAuth, error: supaErr } = await supabaseServer.auth.signInWithPassword({
          email: emailLower,
          password: parsed.data.password,
        });
        if (!supaErr && supaAuth?.user) {
          const meta = (supaAuth.user.user_metadata || {}) as Record<string, unknown>;
          const metaName =
            (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
            (typeof meta.name === 'string' && meta.name.trim()) ||
            emailLower.split('@')[0];
          const dbUser = await getOrCreateUser(supaAuth.user.id, emailLower, metaName, 'customer');
          if (dbUser.status === 'suspended') {
            return { status: 403 as const, body: { error: 'This account has been suspended by an administrator.' } };
          }
          const role = (dbUser.role as UserRole) || 'customer';
          const token = signSandboxToken({
            uid: dbUser.uid,
            email: dbUser.email,
            fullName: dbUser.fullName,
            role,
            isSandbox: false,
          });
          return {
            status: 200 as const,
            body: {
              token,
              user: { uid: dbUser.uid, email: dbUser.email, fullName: dbUser.fullName, role, isSandbox: false },
            },
          };
        }
      } catch {
        // ignore Supabase fallback network error and return 401
      }
      return {
        status: 401 as const,
        body: { error: 'No password account found for this email. Try Google Sign-In or Create Account.' },
      };
    }

    const { uid, passwordHash: storedHash } = credRows[0];
    if (!verifyPasswordScrypt(parsed.data.password, storedHash)) {
      return { status: 401 as const, body: { error: 'Incorrect password. Please try again.' } };
    }

    const userRows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    const dbUser = userRows[0];
    if (dbUser?.status === 'suspended') {
      return { status: 403 as const, body: { error: 'This account has been suspended by an administrator.' } };
    }

    const role: UserRole =
      (dbUser?.role as UserRole) || (isProtectedSuperAdminEmail(emailLower) ? 'super_admin' : 'customer');
    const fullName = dbUser?.fullName || emailLower.split('@')[0];

    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return {
      status: 200 as const,
      body: {
        token,
        user: { uid, email: emailLower, fullName, role, isSandbox: false },
      },
    };
  };

  try {
    let result;
    try {
      result = await attemptLogin();
    } catch (err: any) {
      if (isMissingTableError(err)) {
        await ensureSchemaTables();
        result = await attemptLogin();
      } else {
        throw err;
      }
    }
    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: error.message || 'Sign in failed' });
  }
});

const PW_RESET_EMAIL_PREFIX = '__pw_reset__:';
function pwResetKeyForEmail(email: string): string {
  return `${PW_RESET_EMAIL_PREFIX}${email.trim().toLowerCase()}`;
}

app.post('/api/auth/forgot-password', async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    redirectTo: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const emailLower = parsed.data.email.trim().toLowerCase();

  try {
    const [existingUsers, existingCreds] = await Promise.all([
      db.select().from(users).where(sql`lower(${users.email}) = ${emailLower}`).limit(1),
      db.select().from(localCredentials).where(eq(localCredentials.email, emailLower)).limit(1),
    ]);

    const userRow = existingUsers[0];
    if (!userRow && existingCreds.length === 0) {
      return res.status(404).json({
        error: 'No account found with this email address. Please create an account first.',
      });
    }

    if (userRow?.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const isAdminAccount =
      isProtectedSuperAdminEmail(emailLower) ||
      userRow?.role === 'admin' ||
      userRow?.role === 'super_admin';

    // Best-effort Supabase email recovery trigger (works for Supabase-registered emails)
    try {
      await supabaseServer.auth.resetPasswordForEmail(
        emailLower,
        parsed.data.redirectTo ? { redirectTo: parsed.data.redirectTo } : undefined
      );
    } catch {
      // non-fatal if Supabase email quota or non-Supabase user
    }

    if (isAdminAccount) {
      return res.json({
        ok: true,
        mode: 'admin_pin_or_email',
        isAdminAccount: true,
        message:
          'Admin account verified. Enter your Admin PIN below (or open the password reset link in your email) to set a new password.',
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const otpHash = hashPasswordScrypt(otp);
    const resetKey = pwResetKeyForEmail(emailLower);
    const resetUid = `pw-reset-${crypto.createHash('sha256').update(emailLower).digest('hex').slice(0, 16)}`;

    await db
      .insert(localCredentials)
      .values({
        email: resetKey,
        uid: resetUid,
        passwordHash: `${expiresAt}|${otpHash}`,
      })
      .onConflictDoUpdate({
        target: localCredentials.email,
        set: { passwordHash: `${expiresAt}|${otpHash}` },
      });

    // If Email transport (Gmail SMTP / Custom SMTP / Resend) is configured, send real email and do not expose code in JSON
    const emailTransport = await getEmailTransportStatus();
    if (emailTransport.configured) {
      const otpDispatch = await sendTransactionalEmail({
        to: emailLower,
        subject: 'Foodora BD Password Reset Code',
        html: `<p>Your Foodora BD password reset code is <strong>${otp}</strong>. It expires in 15 minutes.</p>`,
        text: `Your Foodora BD password reset code is ${otp}. It expires in 15 minutes.`,
      });
      if (otpDispatch.ok) {
        return res.json({
          ok: true,
          mode: 'email',
          isAdminAccount: false,
          message: 'A 6-digit password reset code has been sent to your email address.',
        });
      }
    }

    return res.json({
      ok: true,
      mode: 'preview',
      isAdminAccount: false,
      previewCode: otp,
      message:
        'Verification code ready. Enter the 6-digit code and your new password below (valid for 15 minutes).',
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate password reset' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    code: z.string().trim().min(4).max(16),
    newPassword: z.string().min(6).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Please enter a valid email, verification code, and new password (min 6 characters).',
    });
  }

  const emailLower = parsed.data.email.trim().toLowerCase();

  try {
    const [existingUsers, existingCreds] = await Promise.all([
      db.select().from(users).where(sql`lower(${users.email}) = ${emailLower}`).limit(1),
      db.select().from(localCredentials).where(eq(localCredentials.email, emailLower)).limit(1),
    ]);

    const userRow = existingUsers[0];
    if (!userRow && existingCreds.length === 0) {
      return res.status(404).json({ error: 'Account not found for this email.' });
    }
    if (userRow?.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const isAdminAccount =
      isProtectedSuperAdminEmail(emailLower) ||
      userRow?.role === 'admin' ||
      userRow?.role === 'super_admin';

    if (isAdminAccount) {
      const validAdminPin = await verifyAdminPinForEmail(emailLower, parsed.data.code);
      if (!validAdminPin) {
        return res.status(401).json({
          error: 'Incorrect Admin PIN. Enter your Admin PIN to reset an Admin password.',
        });
      }
    } else {
      const resetKey = pwResetKeyForEmail(emailLower);
      const tokenRows = await db
        .select()
        .from(localCredentials)
        .where(eq(localCredentials.email, resetKey))
        .limit(1);

      if (tokenRows.length === 0) {
        return res.status(401).json({
          error: 'Reset code not found or already used. Please request a new code.',
        });
      }

      const sepIdx = tokenRows[0].passwordHash.indexOf('|');
      const expMs = Number(sepIdx > 0 ? tokenRows[0].passwordHash.slice(0, sepIdx) : '0');
      const storedOtpHash = sepIdx > 0 ? tokenRows[0].passwordHash.slice(sepIdx + 1) : '';
      if (!expMs || expMs < Date.now()) {
        await db.delete(localCredentials).where(eq(localCredentials.email, resetKey));
        return res.status(401).json({ error: 'Reset code has expired. Please request a new one.' });
      }
      if (!verifyPasswordScrypt(parsed.data.code, storedOtpHash)) {
        return res.status(401).json({ error: 'Invalid verification code. Please check and try again.' });
      }
    }

    const uid =
      userRow?.uid || existingCreds[0]?.uid || `usr-${crypto.randomBytes(8).toString('hex')}`;
    const role: UserRole = isProtectedSuperAdminEmail(emailLower)
      ? 'super_admin'
      : ((userRow?.role as UserRole) || 'customer');
    const fullName = userRow?.fullName || emailLower.split('@')[0];
    const nextPasswordHash = hashPasswordScrypt(parsed.data.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .insert(localCredentials)
        .values({
          email: emailLower,
          uid,
          passwordHash: nextPasswordHash,
        })
        .onConflictDoUpdate({
          target: localCredentials.email,
          set: { passwordHash: nextPasswordHash },
        });

      if (!userRow) {
        await tx
          .insert(users)
          .values({
            uid,
            email: emailLower,
            fullName,
            role,
          })
          .onConflictDoNothing();
      }

      await tx.delete(localCredentials).where(eq(localCredentials.email, pwResetKeyForEmail(emailLower)));
    });

    try {
      await db.insert(auditLogs).values({
        actorUid: uid,
        action: 'password_reset',
        targetType: 'auth',
        targetId: emailLower,
        details: `Password updated via recovery flow for ${emailLower}`,
      });
    } catch {
      // non-fatal
    }

    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return res.json({
      ok: true,
      token,
      user: { uid, email: emailLower, fullName, role, isSandbox: false },
    });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

app.post('/api/auth/sync-password', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    newPassword: z.string().min(6).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const emailLower = req.user!.email.trim().toLowerCase();
    const nextHash = hashPasswordScrypt(parsed.data.newPassword);
    await db
      .insert(localCredentials)
      .values({
        email: emailLower,
        uid: req.user!.uid,
        passwordHash: nextHash,
      })
      .onConflictDoUpdate({
        target: localCredentials.email,
        set: { passwordHash: nextHash },
      });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to sync password' });
  }
});

// ---------- Storefront & Discovery ----------

app.get('/api/restaurants', async (_req, res) => {
  try {
    const list = await getApprovedRestaurants();
    res.json({ restaurants: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch restaurants' });
  }
});

app.get('/api/products', async (_req, res) => {
  try {
    const products = await getStorefrontProducts();
    res.json({ products });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch storefront products' });
  }
});

app.get('/api/restaurants/:slug', async (req, res) => {
  try {
    const data = await getRestaurantBySlug(req.params.slug);
    if (!data) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch restaurant' });
  }
});

app.get('/api/coupons', async (_req, res) => {
  try {
    const list = await getActiveCoupons();
    res.json({ coupons: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch coupons' });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  const schema = z.object({
    code: z.string().min(2),
    subtotal: z.number().nonnegative(),
    deliveryFee: z.number().nonnegative(),
    restaurantId: z.number().int().positive(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid coupon request' });
  }

  try {
    const rows = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, parsed.data.code.trim().toUpperCase()))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ valid: false, reason: 'Coupon code not found' });
    }

    const c = rows[0];
    const result = evaluateCoupon(
      {
        code: c.code,
        type: c.type as 'percentage' | 'fixed' | 'free_delivery',
        value: c.value,
        minOrder: c.minOrder,
        maxDiscount: c.maxDiscount,
        restaurantId: c.restaurantId,
        isActive: c.isActive,
        usedCount: c.usedCount,
        usageLimit: c.usageLimit,
      },
      parsed.data.subtotal,
      parsed.data.deliveryFee,
      parsed.data.restaurantId
    );
    res.json({ ...result, coupon: c });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Coupon check failed' });
  }
});

app.get('/api/free/weather', async (req, res) => {
  const lat = Number(req.query.lat) || 23.7949;
  const lng = Number(req.query.lng) || 90.4144;
  const weather = await fetchDhakaWeather(lat, lng);
  res.json({ weather });
});

app.get('/api/free/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ places: [] });
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
  const places = await searchOsmPlaces(q, { lat, lng });
  res.json({ places });
});

app.get('/api/free/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat) || 23.7949;
  const lng = Number(req.query.lng) || 90.4144;
  const lang = req.query.lang === 'bn' ? 'bn' : 'en';
  const result = await reverseOsmGeocode(lat, lng, lang);
  res.json(result);
});

app.get('/api/free/route', async (req, res) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const includeSteps = req.query.steps === '1' || req.query.steps === 'true';
  const vehicleMode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
  const route = await fetchOsrmRoute(fromLat, fromLng, toLat, toLng, {
    includeSteps,
    vehicleMode,
  });
  res.json({ route });
});

app.get('/api/free/rates', async (_req, res) => {
  const rates = await fetchBdtExchangeRates();
  res.json(rates);
});

app.get('/api/free/meals', async (req, res) => {
  const q = String(req.query.q || 'biryani').trim();
  const meals = await searchMealDbDishes(q);
  res.json({ meals });
});

app.post('/api/delivery/quote', async (req, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    dropoffLat: z.number(),
    dropoffLng: z.number(),
    dropoffArea: z.string().trim().max(120).optional(),
    deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).optional(),
    deliveryServiceCode: z.string().trim().max(32).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid delivery quote parameters' });
  }

  try {
    const [restRows, settingsRows] = await Promise.all([
      db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1),
      db.select().from(platformSettings).limit(1).catch(() => []),
    ]);
    if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
    const rest = restRows[0];
    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      (settingsRows[0]?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
    );
    const selectedService = selectAutoBangladeshiDeliveryService({
      restaurantDeliveryMode: rest.deliveryMode as DeliveryMode,
      preferredServiceCode: parsed.data.deliveryServiceCode,
      deliveryModeOverride: parsed.data.deliveryMode,
      pathaoEnabled: settingsRows[0]?.pathaoEnabled ?? true,
    });
    const provider = getDeliveryProvider(selectedService.mode, selectedService.code);
    const [baseQuote, osrmRoute, weather] = await Promise.all([
      provider.getQuote({
        orderNumber: 'QUOTE',
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: 'Customer Pin',
        dropoffArea: parsed.data.dropoffArea || rest.area,
        dropoffLat: parsed.data.dropoffLat,
        dropoffLng: parsed.data.dropoffLng,
        customerName: 'Guest',
        customerPhone: '',
        baseFee: rest.deliveryFee,
        orderValue: 0,
      }),
      fetchOsrmRoute(rest.lat, rest.lng, parsed.data.dropoffLat, parsed.data.dropoffLng),
      fetchDhakaWeather(parsed.data.dropoffLat, parsed.data.dropoffLng),
    ]);

    const baseFeeInput =
      selectedService.mode === 'third_party'
        ? Math.max(selectedService.minBaseFee, rest.deliveryFee)
        : rest.deliveryFee;
    const roadCalc = estimateDeliveryFeeAndEta(
      osrmRoute.distanceKm,
      baseFeeInput,
      selectedService.mode
    );
    const zoneDistanceCalc = calculateZoneDistanceDeliveryFee({
      area: parsed.data.dropoffArea || rest.area,
      distanceKm: osrmRoute.distanceKm,
      fallbackFee: roadCalc.fee,
      config: deliveryFinancialConfig,
    });

    res.json({
      quote: {
        ...baseQuote,
        serviceCode: selectedService.code,
        provider: provider.name,
        mode: selectedService.mode,
        distanceKm: osrmRoute.distanceKm,
        fee: zoneDistanceCalc.deliveryFee,
        zoneCode: zoneDistanceCalc.zoneCode,
        zoneName: zoneDistanceCalc.zoneName,
        pricingSource: zoneDistanceCalc.pricingSource,
        etaMinutes: Math.max(
          12,
          osrmRoute.drivingMinutes + 12 + weather.rainBufferMin + selectedService.etaOffsetMin
        ),
        routeSource: osrmRoute.source,
        rainBufferMin: weather.rainBufferMin,
        weatherLabel: weather.labelEn,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compute delivery quote' });
  }
});

// ---------- Customer Routes ----------

app.get('/api/customer/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const addresses = await getCustomerAddresses(req.user!.uid);
    res.json({ addresses });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customer/addresses', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    label: z.string().min(1).max(60),
    area: z.string().min(2).max(60),
    addressLine: z.string().min(4).max(200),
    lat: z.number(),
    lng: z.number(),
    instructions: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please complete all required address fields' });
  }
  try {
    const inserted = await db
      .insert(customerAddresses)
      .values({
        userUid: req.user!.uid,
        label: parsed.data.label,
        area: parsed.data.area,
        addressLine: parsed.data.addressLine,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        instructions: parsed.data.instructions || '',
        isDefault: true,
      })
      .returning();
    res.status(201).json({ address: inserted[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customer/favorites', requireAuth, async (req: AuthRequest, res) => {
  const list = await getCustomerFavorites(req.user!.uid);
  res.json({ favorites: list });
});

app.post('/api/customer/favorites', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ restaurantId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid restaurantId' });
  try {
    const result = await toggleCustomerFavorite(req.user!.uid, parsed.data.restaurantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customer/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getCustomerOrders(req.user!.uid);
    res.json({ orders: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/track-by-email', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const orderNumber = String(req.query.orderNumber || '').trim().toUpperCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  try {
    let matched: Array<typeof orders.$inferSelect> = [];
    if (orderNumber) {
      matched = await db
        .select()
        .from(orders)
        .where(sql`upper(${orders.orderNumber}) = ${orderNumber}`)
        .limit(1);

      if (matched.length === 0) {
        return res.status(404).json({ error: `Order ${orderNumber} was not found.` });
      }
      const ord = matched[0];
      let matches = doesEmailMatchOrder(ord.customerEmail, email);
      if (!matches && ord.customerUid) {
        const custUsers = await db.select().from(users).where(eq(users.uid, ord.customerUid)).limit(1);
        if (custUsers[0] && doesEmailMatchOrder(custUsers[0].email, email)) {
          matches = true;
        }
      }
      if (!matches) {
        return res.status(403).json({
          error: 'The email address does not match the tracking email on this order.',
        });
      }
    } else {
      matched = await db
        .select()
        .from(orders)
        .where(sql`lower(${orders.customerEmail}) = ${email}`)
        .orderBy(desc(orders.createdAt))
        .limit(1);

      if (matched.length === 0) {
        const custUsers = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);
        if (custUsers[0]) {
          matched = await db
            .select()
            .from(orders)
            .where(eq(orders.customerUid, custUsers[0].uid))
            .orderBy(desc(orders.createdAt))
            .limit(1);
        }
      }

      if (matched.length === 0) {
        return res.status(404).json({ error: `No orders found for ${email}.` });
      }
    }

    const detail = await getOrderById(matched[0].id);
    if (!detail) return res.status(404).json({ error: 'Order not found' });
    return res.json(detail);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to look up order by email' });
  }
});

app.get('/api/orders/:id', optionalAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  try {
    const detail = await getOrderById(id);
    if (!detail) return res.status(404).json({ error: 'Order not found' });
    const providedToken = String(req.query.token || '').trim();
    const isAdmin = req.user?.role === 'super_admin' || req.user?.role === 'admin';
    const isOwner = Boolean(req.user?.uid && req.user.uid === detail.order.customerUid);
    const hasTokenAccess = Boolean(
      providedToken && detail.order.trackingToken && providedToken === detail.order.trackingToken
    );
    if (!isAdmin && !isOwner && !hasTokenAccess) {
      return res.json({
        ...detail,
        order: {
          ...detail.order,
          customerName: 'Foodora Customer',
          customerPhone: '',
          customerEmail: '',
          trackingToken: '',
        },
        emailLogs: [],
      });
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/:id/send-tracking-email', optionalAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  const schema = z.object({
    email: z.string().trim().email().optional(),
    token: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const orderRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
    let order = orderRows[0];

    const isAdmin = req.user?.role === 'super_admin' || req.user?.role === 'admin';
    const isOwner = Boolean(req.user?.uid && req.user.uid === order.customerUid);
    const hasToken = Boolean(
      parsed.data.token && order.trackingToken && parsed.data.token.trim() === order.trackingToken
    );

    if (!isAdmin && !isOwner && !hasToken) {
      return res.status(403).json({ error: 'Sign in or use your order tracking token to email updates.' });
    }

    const targetEmail = (parsed.data.email || order.customerEmail || req.user?.email || '')
      .trim()
      .toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Please provide an email address for tracking updates.' });
    }

    const nextToken = order.trackingToken || crypto.randomBytes(12).toString('hex');
    if (targetEmail !== order.customerEmail || nextToken !== order.trackingToken) {
      const upd = await db
        .update(orders)
        .set({ customerEmail: targetEmail, trackingToken: nextToken, updatedAt: new Date() })
        .where(eq(orders.id, order.id))
        .returning();
      order = upd[0] || order;
    }

    const [restRows, riderRows] = await Promise.all([
      db.select({ lat: restaurants.lat, lng: restaurants.lng }).from(restaurants).where(eq(restaurants.id, order.restaurantId)).limit(1),
      order.riderUid
        ? db.select({ phone: riders.phone }).from(riders).where(eq(riders.uid, order.riderUid)).limit(1)
        : Promise.resolve([]),
    ]);

    const [emailLog, emailTransport] = await Promise.all([
      sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: order.id,
        orderNumber: order.orderNumber,
        trackingToken: nextToken,
        customerName: order.customerName,
        customerEmail: targetEmail,
        restaurantName: order.restaurantName,
        deliveryArea: order.deliveryArea,
        deliveryAddress: order.deliveryAddress,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        couponCode: order.couponCode,
        deliveryFee: order.deliveryFee,
        serviceFee: order.serviceFee,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        statusEvent: order.status,
        statusNote: `Live tracking update requested (${order.status.replace(/_/g, ' ')})`,
        riderName: order.riderName,
        riderPhone: riderRows[0]?.phone || null,
        etaMinutes: order.estimatedMinutes,
        createdAt: order.createdAt,
        paymentSplitMode: order.paymentSplitMode,
        onlineFoodPaidAmount: order.onlineFoodPaidAmount,
        cashDueToRider: order.cashDueToRider,
        items: order.itemsSnapshotJson,
      }),
      getEmailTransportStatus(),
    ]);

    return res.json({
      ok: true,
      customerEmail: targetEmail,
      emailLog,
      emailTransport,
      trackingUrl: emailLog?.trackingUrl || '',
      restaurantLat: restRows[0]?.lat ?? null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to send tracking email' });
  }
});

// Transactional Checkout & Order Creation
app.post('/api/orders', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    customerName: z.string().min(2),
    customerPhone: z.string().min(6),
    customerEmail: z.string().trim().email().optional().or(z.literal('')),
    deliveryAddress: z.string().min(5),
    deliveryArea: z.string().min(2),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    deliveryInstructions: z.string().optional(),
    deliveryMode: z.enum(['platform', 'restaurant', 'third_party']),
    deliveryServiceCode: z.string().trim().max(32).optional(),
    paymentMethod: z.string().min(2).max(32),
    couponCode: z.string().optional(),
    items: z
      .array(
        z.object({
          foodItemId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(50),
          variationName: z.string().optional(),
          addons: z.array(z.string()).default([]),
          specialInstructions: z.string().optional(),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid order payload', details: parsed.error.flatten() });
  }

  const input = parsed.data;
  const resolvedCustomerEmail = (
    input.customerEmail?.trim() ||
    (req.user!.email && req.user!.email.includes('@') ? req.user!.email : '')
  )
    .trim()
    .toLowerCase();
  const trackingToken = crypto.randomBytes(12).toString('hex');
  const normalizedMethod = normalizeGatewayCode(input.paymentMethod);

  try {
    const gatewayRows = await ensureDefaultPaymentGateways();
    const matchedGateway = gatewayRows.find(
      (g) => normalizeGatewayCode(g.code) === normalizedMethod && g.isActive
    );
    if (!matchedGateway) {
      return res.status(400).json({
        error: `Selected payment method "${input.paymentMethod}" is currently inactive or unsupported.`,
      });
    }

    const created = await db.transaction(async (tx) => {
      // 1. Load authoritative restaurant record
      const restRows = await tx
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, input.restaurantId))
        .limit(1);
      if (restRows.length === 0) throw new Error('Restaurant not found');
      const rest = restRows[0];
      if (rest.status !== 'approved' || !rest.isOpen) {
        throw new Error(
          buildRestaurantUnavailableMessage(rest.name, rest.status, rest.isOpen, 'en')
        );
      }

      // 2. Load authoritative menu items & calculate snapshot totals
      const dbMenu = await tx
        .select()
        .from(foodItems)
        .where(eq(foodItems.restaurantId, rest.id));

      const snapshotItems: Array<{
        foodItemId: number;
        name: string;
        nameBn: string;
        imageUrl?: string;
        quantity: number;
        unitPrice: number;
        variation?: string;
        addons: Array<{ name: string; price: number }>;
        specialInstructions?: string;
        lineTotal: number;
      }> = [];

      let subtotal = 0;

      for (const reqItem of input.items) {
        const found = dbMenu.find((m) => m.id === reqItem.foodItemId);
        if (!found) {
          throw new Error(`Menu item #${reqItem.foodItemId} does not belong to ${rest.name}`);
        }
        if (!found.inStock || !found.isAvailable) {
          throw new Error(`"${found.name}" is currently out of stock`);
        }

        const matchedVar = (found.variationsJson || []).find(
          (v) => v.name === reqItem.variationName
        );
        const selectedAddons = (found.addonsJson || []).filter((a) =>
          reqItem.addons.includes(a.name)
        );

        const unitPrice = calculateCartItemUnitPrice({
          basePrice: found.price,
          discountPrice: found.discountPrice,
          variationDelta: matchedVar?.priceDelta ?? 0,
          addons: selectedAddons,
        });

        const lineTotal = unitPrice * reqItem.quantity;
        subtotal += lineTotal;

        const rawImg = (found.imageUrl || '').trim();
        const isMissingLocalUpload =
          rawImg.startsWith('/uploads/') &&
          !fs.existsSync(path.join(UPLOADS_DIR, rawImg.replace(/^\/uploads\//, '')));
        const resolvedSnapshotImg =
          !rawImg || isMissingLocalUpload
            ? rest.coverUrl || '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg'
            : rawImg;

        snapshotItems.push({
          foodItemId: found.id,
          name: found.name,
          nameBn: found.nameBn,
          imageUrl: resolvedSnapshotImg,
          quantity: reqItem.quantity,
          unitPrice,
          variation: matchedVar?.name,
          addons: selectedAddons,
          specialInstructions: reqItem.specialInstructions,
          lineTotal,
        });
      }

      if (subtotal < rest.minOrder) {
        throw new Error(`Minimum order for ${rest.name} is ৳${rest.minOrder}`);
      }

      // 3. Delivery quote via modular Bangladeshi DeliveryProvider
      const orderSettings = await tx.select().from(platformSettings).limit(1);
      const selectedService = selectAutoBangladeshiDeliveryService({
        restaurantDeliveryMode: rest.deliveryMode as DeliveryMode,
        preferredServiceCode: input.deliveryServiceCode,
        deliveryModeOverride: input.deliveryMode,
        pathaoEnabled: orderSettings[0]?.pathaoEnabled ?? true,
      });
      const provider = getDeliveryProvider(selectedService.mode, selectedService.code);
      const quote = await provider.getQuote({
        orderNumber: 'NEW',
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: input.deliveryAddress,
        dropoffArea: input.deliveryArea,
        dropoffLat: input.deliveryLat,
        dropoffLng: input.deliveryLng,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        baseFee: rest.deliveryFee,
        orderValue: subtotal,
      });

      const settings = orderSettings;
      const serviceFee = settings[0]?.serviceFee ?? 10;
      const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
        (settings[0]?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
      );
      const estRoadKm =
        Math.round(
          haversineDistanceKm(rest.lat, rest.lng, input.deliveryLat, input.deliveryLng) * 1.25 * 10
        ) / 10;
      const zoneFeeCalc = calculateZoneDistanceDeliveryFee({
        area: input.deliveryArea,
        distanceKm: estRoadKm,
        fallbackFee: quote.fee,
        config: deliveryFinancialConfig,
      });

      // 4. Coupon evaluation
      let discountAmount = 0;
      let deliveryFeeAfterCoupon = zoneFeeCalc.deliveryFee;
      let appliedCouponCode = '';

      if (input.couponCode && input.couponCode.trim()) {
        const cRows = await tx
          .select()
          .from(coupons)
          .where(eq(coupons.code, input.couponCode.trim().toUpperCase()))
          .limit(1);
        if (cRows.length > 0) {
          const c = cRows[0];
          const evalRes = evaluateCoupon(
            {
              code: c.code,
              type: c.type as 'percentage' | 'fixed' | 'free_delivery',
              value: c.value,
              minOrder: c.minOrder,
              maxDiscount: c.maxDiscount,
              restaurantId: c.restaurantId,
              isActive: c.isActive,
              usedCount: c.usedCount,
              usageLimit: c.usageLimit,
            },
            subtotal,
            zoneFeeCalc.deliveryFee,
            rest.id
          );
          if (evalRes.valid) {
            discountAmount = evalRes.discountAmount;
            deliveryFeeAfterCoupon = evalRes.deliveryFeeAfterCoupon;
            appliedCouponCode = c.code;
            await tx
              .update(coupons)
              .set({ usedCount: sql`${coupons.usedCount} + 1` })
              .where(eq(coupons.id, c.id));
          }
        }
      }

      // 5. Split Financial calculations (Online Food Payment + Cash Delivery Charge to Rider)
      const financials = calculateSplitOrderFinancials({
        subtotal,
        discountAmount,
        deliveryFee: deliveryFeeAfterCoupon,
        serviceFee,
        commissionType: (rest.commissionType as 'percentage' | 'fixed') || 'percentage',
        commissionRate: Number(rest.commissionRate) || 15,
        fixedCommission: rest.fixedCommission || 0,
        paymentMethod: normalizedMethod,
        riderEarningRule: deliveryFinancialConfig.riderEarningRule,
      });

      const orderNumber = `FD-BD-${Math.floor(10000 + Math.random() * 89999)}`;
      const onlineChargeAmount =
        financials.paymentSplitMode === 'online_food_cash_delivery'
          ? financials.onlineFoodPayable
          : financials.totalPayable;

      const paymentInit = initiatePaymentSession(
        normalizedMethod as PaymentMethod,
        orderNumber,
        onlineChargeAmount,
        matchedGateway
      );
      const deliveryDispatch = await provider.createDelivery({
        orderNumber,
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: input.deliveryAddress,
        dropoffArea: input.deliveryArea,
        dropoffLat: input.deliveryLat,
        dropoffLng: input.deliveryLng,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        baseFee: deliveryFeeAfterCoupon,
        orderValue: financials.totalPayable,
      });

      const insertedOrders = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerUid: req.user!.uid,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: resolvedCustomerEmail,
          trackingToken,
          restaurantId: rest.id,
          restaurantName: rest.name,
          deliveryAddress: input.deliveryAddress,
          deliveryArea: input.deliveryArea,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          deliveryInstructions: input.deliveryInstructions || '',
          deliveryMode: selectedService.mode,
          deliveryProvider: deliveryDispatch.provider,
          consignmentId: deliveryDispatch.consignmentId,
          paymentMethod: normalizedMethod,
          paymentStatus: 'pending',
          paymentTxId: paymentInit.transactionId,
          subtotal: financials.subtotal,
          discountAmount: financials.discountAmount,
          couponCode: appliedCouponCode,
          deliveryFee: financials.deliveryFee,
          serviceFee: financials.serviceFee,
          taxAmount: financials.taxAmount,
          totalAmount: financials.customerTotalCost,
          commissionRate: rest.commissionRate,
          platformCommission: financials.platformCommission,
          restaurantEarnings: financials.restaurantEarnings,
          paymentSplitMode: financials.paymentSplitMode,
          onlineFoodPaidAmount: financials.onlineFoodPayable,
          cashDueToRider: financials.cashDueToRider,
          riderEarningAmount: financials.riderEarningAmount,
          foodoraDeliveryCommission: financials.foodoraDeliveryCommission,
          cashCollectionStatus: financials.cashDueToRider === 0 ? 'collected' : 'pending',
          cashCollectedAmount: 0,
          status: 'confirmed',
          estimatedMinutes: quote.etaMinutes,
          itemsSnapshotJson: snapshotItems,
        })
        .returning();

      const newOrder = insertedOrders[0];

      // Record separate idempotent transaction entries for Online Food Payment & Delivery Cash Charge
      if (financials.paymentSplitMode === 'online_food_cash_delivery') {
        await tx
          .insert(paymentTransactions)
          .values([
            {
              orderId: newOrder.id,
              orderNumber: newOrder.orderNumber,
              txKind: 'food_payment',
              idempotencyKey: `food_pay:${newOrder.orderNumber}`,
              payerRole: 'customer',
              recipientRole: 'platform_restaurant',
              paymentMethod: normalizedMethod,
              amount: financials.onlineFoodPayable,
              status: 'pending',
              gatewayTxId: paymentInit.transactionId,
              note: `Online food payment via ${normalizedMethod.toUpperCase()} (excludes delivery charge)`,
            },
            {
              orderId: newOrder.id,
              orderNumber: newOrder.orderNumber,
              txKind: 'delivery_cash',
              idempotencyKey: `delivery_cash:${newOrder.orderNumber}`,
              payerRole: 'customer',
              recipientRole: 'rider',
              paymentMethod: 'cash',
              amount: financials.cashDueToRider,
              status: financials.cashDueToRider === 0 ? 'succeeded' : 'pending',
              note:
                financials.cashDueToRider === 0
                  ? 'Free delivery coupon applied (৳0 cash due to rider)'
                  : `Pay cash to rider on delivery (Rider ৳${financials.riderEarningAmount} + Foodora commission ৳${financials.foodoraDeliveryCommission})`,
            },
          ])
          .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
      } else {
        await tx
          .insert(paymentTransactions)
          .values({
            orderId: newOrder.id,
            orderNumber: newOrder.orderNumber,
            txKind: 'delivery_cash',
            idempotencyKey: `delivery_cash:${newOrder.orderNumber}`,
            payerRole: 'customer',
            recipientRole: 'rider',
            paymentMethod: 'cod',
            amount: financials.cashDueToRider,
            status: 'pending',
            note: 'Legacy Cash on Delivery full order collection',
          })
          .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
      }

      await tx.insert(orderStatusHistory).values({
        orderId: newOrder.id,
        status: 'confirmed',
        note:
          financials.paymentSplitMode === 'online_food_cash_delivery'
            ? `Order placed via ${input.paymentMethod.toUpperCase()} (Food Online ৳${financials.onlineFoodPayable} · Delivery Cash to Rider ৳${financials.cashDueToRider})`
            : `Order placed via ${input.paymentMethod.toUpperCase()} (${deliveryDispatch.provider})`,
        actorUid: req.user!.uid,
      });

      await tx.insert(notifications).values([
        {
          recipientUid: rest.ownerUid,
          roleTarget: 'restaurant_owner',
          title: `New Order ${newOrder.orderNumber}`,
          message:
            financials.paymentSplitMode === 'online_food_cash_delivery'
              ? `Food ৳${financials.onlineFoodPayable} (${normalizedMethod.toUpperCase()} pending verify) · Delivery Cash ৳${financials.cashDueToRider} · ${input.deliveryArea}`
              : `৳${newOrder.totalAmount} order from ${input.customerName} (${input.deliveryArea})`,
          type: 'order',
          relatedOrderId: newOrder.id,
        },
        {
          recipientUid: 'role-super_admin',
          roleTarget: 'super_admin',
          title: `New Order ${newOrder.orderNumber} · ${rest.name}`,
          message: `Food ৳${financials.onlineFoodPayable} + Cash Delivery ৳${financials.cashDueToRider} (${input.deliveryArea})`,
          type: 'order',
          relatedOrderId: newOrder.id,
        },
        {
          recipientUid: req.user!.uid,
          roleTarget: 'customer',
          title: `Order ${newOrder.orderNumber} Confirmed`,
          message:
            financials.paymentSplitMode === 'online_food_cash_delivery'
              ? `Pay food ৳${financials.onlineFoodPayable} online; pay ৳${financials.cashDueToRider} delivery cash to rider.`
              : `Your order from ${rest.name} has been received.`,
          type: 'order',
          relatedOrderId: newOrder.id,
        },
      ]);

      return {
        order: newOrder,
        paymentSession: paymentInit,
        deliveryDispatch,
        restaurantOwnerUid: rest.ownerUid,
        restaurantEmail: rest.email,
      };
    });

    const ownerEmailRows = created.restaurantOwnerUid
      ? await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.uid, created.restaurantOwnerUid))
          .limit(1)
      : [];

    const [emailLog, emailTransport] = await Promise.all([
      resolvedCustomerEmail
        ? sendAndLogOrderTrackingEmail({
            origin: getRequestOrigin(req),
            orderId: created.order.id,
            orderNumber: created.order.orderNumber,
            trackingToken: created.order.trackingToken,
            customerName: created.order.customerName,
            customerEmail: resolvedCustomerEmail,
            restaurantName: created.order.restaurantName,
            deliveryArea: created.order.deliveryArea,
            deliveryAddress: created.order.deliveryAddress,
            subtotal: created.order.subtotal,
            discountAmount: created.order.discountAmount,
            couponCode: created.order.couponCode,
            deliveryFee: created.order.deliveryFee,
            serviceFee: created.order.serviceFee,
            taxAmount: created.order.taxAmount,
            totalAmount: created.order.totalAmount,
            paymentMethod: created.order.paymentMethod,
            paymentStatus: created.order.paymentStatus,
            status: created.order.status,
            statusEvent: 'confirmed',
            statusNote: `Order placed via ${input.paymentMethod.toUpperCase()}`,
            etaMinutes: created.order.estimatedMinutes,
            createdAt: created.order.createdAt,
            paymentSplitMode: created.order.paymentSplitMode,
            onlineFoodPaidAmount: created.order.onlineFoodPaidAmount,
            cashDueToRider: created.order.cashDueToRider,
            items: created.order.itemsSnapshotJson,
          })
        : Promise.resolve(null),
      getEmailTransportStatus(),
      sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
        trackingToken: created.order.trackingToken,
        eventKind: 'new_order',
        restaurantName: created.order.restaurantName,
        restaurantEmail: created.restaurantEmail,
        ownerEmail: ownerEmailRows[0]?.email || null,
        customerName: created.order.customerName,
        customerPhone: created.order.customerPhone,
        deliveryArea: created.order.deliveryArea,
        deliveryAddress: created.order.deliveryAddress,
        totalAmount: created.order.totalAmount,
        paymentMethod: created.order.paymentMethod,
        paymentStatus: created.order.paymentStatus,
        status: created.order.status,
        statusNote: `Order placed via ${input.paymentMethod.toUpperCase()}`,
        items: created.order.itemsSnapshotJson,
      }).catch(() => []),
    ]);

    broadcastOrderEvent('order:created', {
      orderId: created.order.id,
      orderNumber: created.order.orderNumber,
      restaurantId: created.order.restaurantId,
      restaurantName: created.order.restaurantName,
      restaurantOwnerUid: created.restaurantOwnerUid,
      customerUid: created.order.customerUid,
      customerName: created.order.customerName,
      status: created.order.status,
      deliveryMode: created.order.deliveryMode,
      deliveryArea: created.order.deliveryArea,
      totalAmount: created.order.totalAmount,
    });
    broadcastNotificationEvent({
      recipientUid: created.restaurantOwnerUid,
      roleTarget: 'restaurant_owner',
      title: `New Order ${created.order.orderNumber}`,
      message: `৳${created.order.totalAmount} order from ${created.order.customerName} (${created.order.deliveryArea})`,
      type: 'order',
      relatedOrderId: created.order.id,
    });
    broadcastNotificationEvent({
      recipientUid: 'role-super_admin',
      roleTarget: 'super_admin',
      title: `New Order ${created.order.orderNumber} · ${created.order.restaurantName}`,
      message: `৳${created.order.totalAmount} order from ${created.order.customerName} (${created.order.deliveryArea})`,
      type: 'order',
      relatedOrderId: created.order.id,
    });
    broadcastNotificationEvent({
      recipientUid: created.order.customerUid,
      roleTarget: 'customer',
      title: `Order ${created.order.orderNumber} Confirmed`,
      message: `Your order from ${created.order.restaurantName} has been received.`,
      type: 'order',
      relatedOrderId: created.order.id,
    });

    res.status(201).json({ ...created, emailLog, emailTransport });
  } catch (error: any) {
    console.error('Order creation failed:', error);
    res.status(400).json({ error: error.message || 'Could not place order' });
  }
});

// Server-side Payment Verification (idempotent)
app.post('/api/payments/verify', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    orderId: z.number().int().positive(),
    transactionId: z.string().min(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid verification payload' });

  try {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.id, parsed.data.orderId))
      .limit(1);
    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRows[0];

    if (order.paymentStatus === 'paid') {
      return res.json({ verified: true, order, message: 'Payment already verified' });
    }

    const gatewayRows = await ensureDefaultPaymentGateways();
    const matchedGateway = gatewayRows.find(
      (g) => normalizeGatewayCode(g.code) === normalizeGatewayCode(order.paymentMethod)
    );
    const verifyExpectedAmount =
      order.paymentSplitMode === 'online_food_cash_delivery' && (order.onlineFoodPaidAmount || 0) > 0
        ? order.onlineFoodPaidAmount
        : order.totalAmount;
    const verification = verifyPaymentServerSide(
      order.paymentMethod as PaymentMethod,
      parsed.data.transactionId,
      verifyExpectedAmount,
      matchedGateway
    );

    if (!verification.verified) {
      return res.status(400).json({ error: verification.message });
    }

    const updated = await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        paymentTxId: verification.transactionId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    const foodPayKey = `food_pay:${order.orderNumber}`;
    const existingFoodTx = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, foodPayKey))
      .limit(1);
    if (existingFoodTx.length > 0) {
      await db
        .update(paymentTransactions)
        .set({
          status: 'succeeded',
          gatewayTxId: verification.transactionId,
          note: verification.message,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.idempotencyKey, foodPayKey));
    } else {
      await db
        .insert(paymentTransactions)
        .values({
          orderId: order.id,
          orderNumber: order.orderNumber,
          txKind: 'food_payment',
          idempotencyKey: foodPayKey,
          payerRole: 'customer',
          recipientRole: 'platform_restaurant',
          paymentMethod: order.paymentMethod,
          amount: verifyExpectedAmount,
          status: 'succeeded',
          gatewayTxId: verification.transactionId,
          note: verification.message,
        })
        .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }

    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: order.status,
      note: verification.message,
      actorUid: req.user!.uid,
    });

    const restRowsForBroadcast = await db
      .select({ ownerUid: restaurants.ownerUid })
      .from(restaurants)
      .where(eq(restaurants.id, updated[0].restaurantId))
      .limit(1);

    const verifyRecipientEmail = await resolveCustomerEmailForOrder(
      updated[0].customerEmail,
      updated[0].customerUid
    );
    if (verifyRecipientEmail) {
      await sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        customerName: updated[0].customerName,
        customerEmail: verifyRecipientEmail,
        restaurantName: updated[0].restaurantName,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        subtotal: updated[0].subtotal,
        discountAmount: updated[0].discountAmount,
        couponCode: updated[0].couponCode,
        deliveryFee: updated[0].deliveryFee,
        serviceFee: updated[0].serviceFee,
        taxAmount: updated[0].taxAmount,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusEvent: 'payment_verified',
        statusNote: verification.message,
        riderName: updated[0].riderName,
        etaMinutes: updated[0].estimatedMinutes,
        createdAt: updated[0].createdAt,
        paymentSplitMode: updated[0].paymentSplitMode,
        onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
        cashDueToRider: updated[0].cashDueToRider,
        items: updated[0].itemsSnapshotJson,
      });
    }

    broadcastOrderEvent('order:updated', {
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      restaurantId: updated[0].restaurantId,
      restaurantName: updated[0].restaurantName,
      restaurantOwnerUid: restRowsForBroadcast[0]?.ownerUid || null,
      customerUid: updated[0].customerUid,
      riderUid: updated[0].riderUid,
      riderName: updated[0].riderName,
      status: updated[0].status,
      deliveryMode: updated[0].deliveryMode,
      deliveryArea: updated[0].deliveryArea,
      totalAmount: updated[0].totalAmount,
    });

    res.json({ verified: true, order: updated[0], message: verification.message });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Payment verification failed' });
  }
});

// Extensible Payment Gateway Webhook Callback (bKash, Nagad, SSLCommerz, Rocket, Upay, Stripe, Custom)
app.post('/api/payments/webhook/:code', async (req, res) => {
  const code = normalizeGatewayCode(String(req.params.code || ''));
  if (!code) return res.status(400).json({ error: 'Invalid gateway code' });

  try {
    const gwRows = await db
      .select()
      .from(paymentGateways)
      .where(eq(paymentGateways.code, code))
      .limit(1);
    const gateway = gwRows[0];
    if (!gateway) return res.status(404).json({ error: `Payment gateway "${code}" not registered` });

    const expectedSecret = String(gateway.webhookSecret || '').trim();
    if (expectedSecret) {
      const providedSecret = String(
        req.header('x-webhook-secret') || req.body?.webhookSecret || ''
      ).trim();
      if (providedSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Invalid payment webhook secret' });
      }
    }

    const orderNumber = typeof req.body?.orderNumber === 'string' ? req.body.orderNumber.trim() : '';
    const txId = typeof req.body?.transactionId === 'string' ? req.body.transactionId.trim() : '';
    const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : 'paid';
    const nextPaymentStatus = statusRaw === 'failed' ? 'failed' : 'paid';

    if (!orderNumber && !txId) {
      return res.status(400).json({ error: 'orderNumber or transactionId is required' });
    }

    const matchingOrders = orderNumber
      ? await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1)
      : await db.select().from(orders).where(eq(orders.paymentTxId, txId)).limit(1);

    if (matchingOrders.length === 0) {
      return res.status(404).json({ error: 'Matching order not found' });
    }
    const targetOrder = matchingOrders[0];

    const updated = await db
      .update(orders)
      .set({
        paymentStatus: nextPaymentStatus,
        paymentTxId: txId || targetOrder.paymentTxId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, targetOrder.id))
      .returning();

    const webhookFoodKey = `food_pay:${targetOrder.orderNumber}`;
    const existingWebhookTx = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, webhookFoodKey))
      .limit(1);
    const webhookTxStatus = nextPaymentStatus === 'paid' ? 'succeeded' : 'failed';
    if (existingWebhookTx.length > 0) {
      await db
        .update(paymentTransactions)
        .set({
          status: webhookTxStatus,
          gatewayTxId: txId || targetOrder.paymentTxId || '',
          note: `Webhook (${gateway.name}) marked food payment as ${nextPaymentStatus}`,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.idempotencyKey, webhookFoodKey));
    } else {
      await db
        .insert(paymentTransactions)
        .values({
          orderId: targetOrder.id,
          orderNumber: targetOrder.orderNumber,
          txKind: 'food_payment',
          idempotencyKey: webhookFoodKey,
          payerRole: 'customer',
          recipientRole: 'platform_restaurant',
          paymentMethod: targetOrder.paymentMethod,
          amount:
            targetOrder.paymentSplitMode === 'online_food_cash_delivery'
              ? targetOrder.onlineFoodPaidAmount || 0
              : targetOrder.totalAmount,
          status: webhookTxStatus,
          gatewayTxId: txId || targetOrder.paymentTxId || '',
          note: `Webhook (${gateway.name}) marked food payment as ${nextPaymentStatus}`,
        })
        .onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }

    await db.insert(orderStatusHistory).values({
      orderId: targetOrder.id,
      status: targetOrder.status,
      note: `Webhook (${gateway.name}) marked payment as ${nextPaymentStatus}`,
      actorUid: `webhook:${code}`,
    });

    const restOwnerRows = await db
      .select({ ownerUid: restaurants.ownerUid, email: restaurants.email })
      .from(restaurants)
      .where(eq(restaurants.id, updated[0].restaurantId))
      .limit(1);

    const webhookRecipient = await resolveCustomerEmailForOrder(
      updated[0].customerEmail,
      updated[0].customerUid
    );
    if (webhookRecipient && nextPaymentStatus === 'paid') {
      await sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        customerName: updated[0].customerName,
        customerEmail: webhookRecipient,
        restaurantName: updated[0].restaurantName,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        subtotal: updated[0].subtotal,
        discountAmount: updated[0].discountAmount,
        couponCode: updated[0].couponCode,
        deliveryFee: updated[0].deliveryFee,
        serviceFee: updated[0].serviceFee,
        taxAmount: updated[0].taxAmount,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: 'payment_verified',
        statusEvent: 'payment_verified',
        statusNote: `${gateway.name} confirmed payment`,
        riderName: updated[0].riderName,
        etaMinutes: updated[0].estimatedMinutes,
        createdAt: updated[0].createdAt,
        paymentSplitMode: updated[0].paymentSplitMode,
        onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
        cashDueToRider: updated[0].cashDueToRider,
        items: updated[0].itemsSnapshotJson,
      });
    }

    await sendMerchantOrderAlertEmail({
      origin: getRequestOrigin(req),
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      trackingToken: updated[0].trackingToken,
      eventKind: 'status_update',
      restaurantName: updated[0].restaurantName,
      restaurantEmail: restOwnerRows[0]?.email || null,
      customerName: updated[0].customerName,
      customerPhone: updated[0].customerPhone,
      deliveryArea: updated[0].deliveryArea,
      deliveryAddress: updated[0].deliveryAddress,
      totalAmount: updated[0].totalAmount,
      paymentMethod: updated[0].paymentMethod,
      paymentStatus: updated[0].paymentStatus,
      status: updated[0].status,
      statusNote: `Webhook (${gateway.name}): ${nextPaymentStatus}`,
      riderName: updated[0].riderName,
      items: updated[0].itemsSnapshotJson,
    }).catch(() => []);

    broadcastOrderEvent('order:updated', {
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      restaurantId: updated[0].restaurantId,
      restaurantName: updated[0].restaurantName,
      restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
      customerUid: updated[0].customerUid,
      riderUid: updated[0].riderUid,
      riderName: updated[0].riderName,
      status: updated[0].status,
      deliveryMode: updated[0].deliveryMode,
      deliveryArea: updated[0].deliveryArea,
      totalAmount: updated[0].totalAmount,
    });

    res.json({ ok: true, order: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Webhook processing failed' });
  }
});

// Verified Customer Review
app.post('/api/reviews', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    orderId: z.number().int().positive().optional(),
    rating: z.number().int().min(1).max(5),
    foodRating: z.number().int().min(1).max(5),
    comment: z.string().min(2).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please write a short review and rating' });

  try {
    const inserted = await db
      .insert(reviews)
      .values({
        restaurantId: parsed.data.restaurantId,
        orderId: parsed.data.orderId ?? null,
        customerUid: req.user!.uid,
        customerName: req.user!.fullName,
        rating: parsed.data.rating,
        foodRating: parsed.data.foodRating,
        comment: parsed.data.comment,
      })
      .returning();

    const allReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.restaurantId, parsed.data.restaurantId));
    const avg =
      allReviews.reduce((s, r) => s + r.rating, 0) / Math.max(1, allReviews.length);

    await db
      .update(restaurants)
      .set({
        rating: avg.toFixed(1),
        reviewCount: sql`${restaurants.reviewCount} + 1`,
      })
      .where(eq(restaurants.id, parsed.data.restaurantId));

    res.status(201).json({ review: inserted[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Multi-Vendor Restaurant Onboarding & Vendor Dashboard ----------

app.post('/api/restaurants/register', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    ownerName: z.string().min(2),
    name: z.string().min(2),
    nameBn: z.string().min(2),
    cuisine: z.string().min(2),
    area: z.string().min(2),
    address: z.string().min(5),
    lat: z.number(),
    lng: z.number(),
    phone: z.string().min(6),
    email: z.string().email(),
    description: z.string().min(5),
    tradeLicense: z.string().min(3),
    nidNumber: z.string().min(5),
    payoutMethod: z.string().trim().min(2).max(40),
    payoutAccount: z.string().min(5),
    logoUrl: z.string().optional().default(''),
    coverUrl: z.string().optional().default(''),
    deliveryFee: z.number().int().min(0).max(300).default(49),
    minOrder: z.number().int().min(50).max(5000).default(150),
    deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).default('platform'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please complete all restaurant onboarding fields' });
  }

  try {
    const isOwnerAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
    const existingOwned = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.ownerUid, req.user!.uid))
      .limit(1);

    const limitCheck = canOwnerOpenNewRestaurant(existingOwned.length, req.user!.role);
    if (!limitCheck.allowed) {
      return res.status(400).json({ error: limitCheck.error });
    }

    const slugBase = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

    const inserted = await db
      .insert(restaurants)
      .values({
        ownerUid: req.user!.uid,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn,
        slug,
        description: parsed.data.description,
        cuisine: parsed.data.cuisine,
        area: parsed.data.area,
        address: parsed.data.address,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        phone: parsed.data.phone,
        email: parsed.data.email,
        logoUrl: parsed.data.logoUrl?.trim() || '',
        coverUrl: parsed.data.coverUrl?.trim() || IMG_BANGLA,
        tradeLicense: parsed.data.tradeLicense,
        nidNumber: parsed.data.nidNumber,
        payoutMethod: parsed.data.payoutMethod,
        payoutAccount: parsed.data.payoutAccount,
        deliveryFee: parsed.data.deliveryFee,
        minOrder: parsed.data.minOrder,
        deliveryMode: parsed.data.deliveryMode,
        isNew: true,
        status: isOwnerAdmin ? 'approved' : 'pending',
      })
      .returning();

    if (req.user!.role === 'customer') {
      await db
        .update(users)
        .set({ role: 'restaurant_owner', fullName: parsed.data.ownerName })
        .where(eq(users.uid, req.user!.uid));
    }

    await db.insert(notifications).values({
      recipientUid: 'demo-admin-uid',
      roleTarget: 'super_admin',
      title: isOwnerAdmin ? 'Owner Store Launched' : 'New Restaurant Application',
      message: isOwnerAdmin
        ? `${parsed.data.name} (${parsed.data.area}) launched directly by Platform Owner.`
        : `${parsed.data.name} (${parsed.data.area}) submitted documents for approval.`,
      type: 'approval',
    });

    res.status(201).json({ restaurant: inserted[0] });
  } catch (error: any) {
    console.error('Restaurant registration error:', error);
    res.status(500).json({ error: error.message || 'Failed to register restaurant' });
  }
});

app.post(
  '/api/vendor/branches',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      primaryRestaurantId: z.number().int().positive().optional(),
      branchName: z.string().trim().min(2).max(60),
      branchNameBn: z.string().trim().max(60).optional().default(''),
      area: z.string().trim().min(2).max(80),
      address: z.string().trim().min(5).max(200),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      phone: z.string().trim().min(6).max(30),
      deliveryFee: z.number().int().min(0).max(300).default(49),
      minOrder: z.number().int().min(50).max(5000).default(150),
      deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).default('platform'),
      copyMenu: z.boolean().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please complete all branch fields.' });
    }

    try {
      const isSuperAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
      const primaryRows =
        isSuperAdmin && parsed.data.primaryRestaurantId
          ? await db
              .select()
              .from(restaurants)
              .where(eq(restaurants.id, parsed.data.primaryRestaurantId))
              .limit(1)
          : parsed.data.primaryRestaurantId
          ? await db
              .select()
              .from(restaurants)
              .where(
                and(
                  eq(restaurants.id, parsed.data.primaryRestaurantId),
                  eq(restaurants.ownerUid, req.user!.uid)
                )
              )
              .limit(1)
          : await db
              .select()
              .from(restaurants)
              .where(eq(restaurants.ownerUid, req.user!.uid))
              .orderBy(asc(restaurants.id))
              .limit(1);

      const primary = primaryRows[0];
      if (!primary) {
        return res.status(404).json({
          error: 'Please open your primary restaurant first before adding a branch.',
        });
      }

      const branchNames = buildBranchRestaurantNames(
        primary.name,
        primary.nameBn,
        parsed.data.branchName,
        parsed.data.branchNameBn
      );

      const slugBase = branchNames.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

      const branchStatus =
        primary.status === 'approved' || isSuperAdmin ? 'approved' : 'pending';

      const inserted = await db
        .insert(restaurants)
        .values({
          ownerUid: primary.ownerUid,
          name: branchNames.name,
          nameBn: branchNames.nameBn,
          slug,
          description: primary.description,
          cuisine: primary.cuisine,
          area: parsed.data.area,
          address: parsed.data.address,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          phone: parsed.data.phone,
          email: primary.email,
          logoUrl: primary.logoUrl || '',
          coverUrl: primary.coverUrl || IMG_BANGLA,
          tradeLicense: primary.tradeLicense || '',
          nidNumber: primary.nidNumber || '',
          payoutMethod: primary.payoutMethod,
          payoutAccount: primary.payoutAccount,
          deliveryFee: parsed.data.deliveryFee,
          minOrder: parsed.data.minOrder,
          deliveryMode: parsed.data.deliveryMode,
          commissionRate: primary.commissionRate,
          isNew: true,
          status: branchStatus,
        })
        .returning();

      const createdBranch = inserted[0];
      let copiedItemsCount = 0;

      if (parsed.data.copyMenu) {
        const sourceItems = await db
          .select()
          .from(foodItems)
          .where(eq(foodItems.restaurantId, primary.id));

        if (sourceItems.length > 0) {
          await db.insert(foodItems).values(
            sourceItems.map((it) => ({
              restaurantId: createdBranch.id,
              category: it.category,
              name: it.name,
              nameBn: it.nameBn,
              description: it.description,
              imageUrl: it.imageUrl,
              price: it.price,
              discountPrice: it.discountPrice,
              variationsJson: it.variationsJson,
              addonsJson: it.addonsJson,
              inStock: it.inStock,
              isAvailable: it.isAvailable,
              isPopular: it.isPopular,
              isVisibleOnStorefront: it.isVisibleOnStorefront,
            }))
          );
          copiedItemsCount = sourceItems.length;
        }
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'vendor_added_branch',
        targetType: 'restaurant',
        targetId: String(createdBranch.id),
        details: `Added branch "${createdBranch.name}" (${createdBranch.area}) under primary restaurant #${primary.id} (${copiedItemsCount} menu items copied)`,
      });

      await db.insert(notifications).values({
        recipientUid: 'demo-admin-uid',
        roleTarget: 'super_admin',
        title: 'New Restaurant Branch Added',
        message: `${createdBranch.name} (${createdBranch.area}) was added as a branch.`,
        type: 'system',
      });

      res.status(201).json({ branch: createdBranch, copiedItemsCount });
    } catch (error: any) {
      console.error('Add branch error:', error);
      res.status(500).json({ error: error.message || 'Failed to add restaurant branch' });
    }
  }
);

app.get(
  '/api/vendor/workspace',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      const requestedRaw = Number(req.query.restaurantId);
      const requestedRestaurantId =
        Number.isInteger(requestedRaw) && (requestedRaw > 0 || requestedRaw === -1) ? requestedRaw : null;
      const data = await getVendorWorkspace(req.user!.uid, isSuperAdmin, requestedRestaurantId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/vendor/menu',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      category: z.string().min(2),
      name: z.string().min(2),
      nameBn: z.string().min(2),
      description: z.string().default(''),
      imageUrl: z.string().default(IMG_BANGLA),
      price: z.number().int().positive(),
      discountPrice: z.number().int().positive().nullable().optional(),
      isPopular: z.boolean().default(false),
      variationsJson: z
        .array(z.object({ name: z.string(), priceDelta: z.number() }))
        .optional(),
      addonsJson: z
        .array(z.object({ name: z.string(), price: z.number() }))
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid food item details' });

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0].ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Not owner of this restaurant' });
      }

      const variationsJson = normalizeVariationsList(parsed.data.variationsJson, true);
      const addonsJson = normalizeAddonsList(parsed.data.addonsJson);

      const inserted = await db
        .insert(foodItems)
        .values({
          restaurantId: parsed.data.restaurantId,
          category: parsed.data.category,
          name: parsed.data.name,
          nameBn: parsed.data.nameBn,
          description: parsed.data.description,
          imageUrl: parsed.data.imageUrl || restRows[0].coverUrl,
          price: parsed.data.price,
          discountPrice: parsed.data.discountPrice ?? null,
          variationsJson,
          addonsJson,
          isPopular: parsed.data.isPopular,
        })
        .returning();

      res.status(201).json({ item: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/vendor/menu/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const schema = z.object({
      category: z.string().trim().min(1).max(60).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      nameBn: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(600).optional(),
      imageUrl: z.string().max(600).optional(),
      inStock: z.boolean().optional(),
      isAvailable: z.boolean().optional(),
      isPopular: z.boolean().optional(),
      isVisibleOnStorefront: z.boolean().optional(),
      price: z.number().int().positive().max(100000).optional(),
      discountPrice: z.number().int().positive().max(100000).nullable().optional(),
      variationsJson: z
        .array(z.object({ name: z.string(), priceDelta: z.number() }))
        .optional(),
      addonsJson: z
        .array(z.object({ name: z.string(), price: z.number() }))
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid menu item update' });
    }

    try {
      const itemRows = await db.select().from(foodItems).where(eq(foodItems.id, itemId)).limit(1);
      if (itemRows.length === 0) return res.status(404).json({ error: 'Food item not found' });

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, itemRows[0].restaurantId))
        .limit(1);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0]?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const d = parsed.data;
      const nextVariations =
        d.variationsJson !== undefined
          ? normalizeVariationsList(d.variationsJson, true)
          : itemRows[0].variationsJson;
      const nextAddons =
        d.addonsJson !== undefined
          ? normalizeAddonsList(d.addonsJson)
          : itemRows[0].addonsJson;

      const updated = await db
        .update(foodItems)
        .set({
          category: d.category ?? itemRows[0].category,
          name: d.name ?? itemRows[0].name,
          nameBn: d.nameBn ?? itemRows[0].nameBn,
          description: d.description ?? itemRows[0].description,
          imageUrl: d.imageUrl && d.imageUrl.trim() ? d.imageUrl.trim() : itemRows[0].imageUrl,
          inStock: d.inStock ?? itemRows[0].inStock,
          isAvailable: d.isAvailable ?? itemRows[0].isAvailable,
          isPopular: d.isPopular ?? itemRows[0].isPopular,
          isVisibleOnStorefront: d.isVisibleOnStorefront ?? itemRows[0].isVisibleOnStorefront,
          price: d.price ?? itemRows[0].price,
          discountPrice: d.discountPrice === undefined ? itemRows[0].discountPrice : d.discountPrice,
          variationsJson: nextVariations,
          addonsJson: nextAddons,
          updatedAt: new Date(),
        })
        .where(eq(foodItems.id, itemId))
        .returning();
      res.json({ item: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  '/api/vendor/menu/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
    try {
      const itemRows = await db.select().from(foodItems).where(eq(foodItems.id, itemId)).limit(1);
      if (itemRows.length === 0) return res.status(404).json({ error: 'Item not found' });
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, itemRows[0].restaurantId))
        .limit(1);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0]?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await db.delete(foodItems).where(eq(foodItems.id, itemId));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

function hashPartnerApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

function extractPartnerApiKey(req: express.Request): string | null {
  const headerKey = req.header('x-partner-api-key')?.trim();
  if (headerKey) return headerKey;
  const authHeader = req.header('authorization')?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer fbd_')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

async function resolvePartnerRestaurant(
  req: express.Request
): Promise<
  | { ok: false; error: string; status: 401 | 403 | 404 }
  | {
      ok: true;
      restaurant: typeof restaurants.$inferSelect;
      apiKeyRow: typeof partnerApiKeys.$inferSelect;
    }
> {
  const rawKey = extractPartnerApiKey(req);
  if (!rawKey) return { ok: false, error: 'Missing X-Partner-API-Key header', status: 401 };
  const keyHash = hashPartnerApiKey(rawKey);
  const keyRows = await db
    .select()
    .from(partnerApiKeys)
    .where(eq(partnerApiKeys.keyHash, keyHash))
    .limit(1);
  if (keyRows.length === 0) {
    return { ok: false, error: 'Invalid or revoked Partner API key', status: 401 };
  }
  const restRows = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, keyRows[0].restaurantId))
    .limit(1);
  if (restRows.length === 0) {
    return { ok: false, error: 'Linked restaurant no longer exists', status: 404 };
  }
  if (restRows[0].status === 'suspended' || restRows[0].status === 'rejected') {
    return { ok: false, error: 'Restaurant account is not active for Partner API access', status: 403 };
  }
  await db
    .update(partnerApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(partnerApiKeys.id, keyRows[0].id));
  return { ok: true, restaurant: restRows[0], apiKeyRow: keyRows[0] };
}

app.get(
  '/api/vendor/api-key',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const requestedId = Number(req.query.restaurantId);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      let restRows =
        Number.isInteger(requestedId) && requestedId > 0
          ? await db.select().from(restaurants).where(eq(restaurants.id, requestedId)).limit(1)
          : await db
              .select()
              .from(restaurants)
              .where(eq(restaurants.ownerUid, req.user!.uid))
              .limit(1);

      if (restRows.length === 0 && isAdmin && !(Number.isInteger(requestedId) && requestedId > 0)) {
        restRows = await db.select().from(restaurants).limit(1);
      }

      if (restRows.length === 0) {
        return res.json({ hasKey: false, restaurantId: null, keyPrefix: null, label: null, lastUsedAt: null });
      }
      if (!isAdmin && restRows[0].ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const keyRows = await db
        .select()
        .from(partnerApiKeys)
        .where(eq(partnerApiKeys.restaurantId, restRows[0].id))
        .limit(1);

      if (keyRows.length === 0) {
        return res.json({
          hasKey: false,
          restaurantId: restRows[0].id,
          keyPrefix: null,
          label: null,
          lastUsedAt: null,
          updatedAt: null,
        });
      }

      return res.json({
        hasKey: true,
        restaurantId: restRows[0].id,
        keyPrefix: keyRows[0].keyPrefix,
        label: keyRows[0].label,
        lastUsedAt: keyRows[0].lastUsedAt,
        updatedAt: keyRows[0].updatedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/vendor/api-key/rotate',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      label: z.string().min(2).max(60).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid API key rotation request' });
    }

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0].ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rawKey = `fbd_live_${crypto.randomBytes(16).toString('hex')}`;
      const keyHash = hashPartnerApiKey(rawKey);
      const keyPrefix = `${rawKey.slice(0, 14)}...${rawKey.slice(-4)}`;
      const label = parsed.data.label?.trim() || 'Partner Menu API Key';

      const upserted = await db
        .insert(partnerApiKeys)
        .values({
          restaurantId: restRows[0].id,
          keyHash,
          keyPrefix,
          label,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: partnerApiKeys.restaurantId,
          set: {
            keyHash,
            keyPrefix,
            label,
            lastUsedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'partner_api_key_rotated',
        targetType: 'restaurant',
        targetId: String(restRows[0].id),
        details: JSON.stringify({ keyPrefix, label }),
      });

      res.status(201).json({
        apiKey: rawKey,
        restaurantId: restRows[0].id,
        keyPrefix: upserted[0].keyPrefix,
        label: upserted[0].label,
        updatedAt: upserted[0].updatedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get('/api/partner/v1/products', async (req, res) => {
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const products = await db
      .select()
      .from(foodItems)
      .where(eq(foodItems.restaurantId, auth.restaurant.id))
      .orderBy(desc(foodItems.id));

    res.json({
      restaurant: {
        id: auth.restaurant.id,
        name: auth.restaurant.name,
        nameBn: auth.restaurant.nameBn,
        slug: auth.restaurant.slug,
        area: auth.restaurant.area,
        status: auth.restaurant.status,
      },
      count: products.length,
      products,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch partner products' });
  }
});

app.post('/api/partner/v1/products', async (req, res) => {
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const body = req.body;
    const rawItems = Array.isArray(body?.products)
      ? body.products
      : Array.isArray(body)
      ? body
      : [body];

    if (rawItems.length === 0 || rawItems.length > 50) {
      return res.status(400).json({ error: 'Provide between 1 and 50 products per request.' });
    }

    const normalizedList: Array<ReturnType<typeof normalizePartnerProductInput> & { valid: true }> = [];
    for (let i = 0; i < rawItems.length; i++) {
      const check = normalizePartnerProductInput(
        rawItems[i] && typeof rawItems[i] === 'object' ? rawItems[i] : {},
        auth.restaurant.coverUrl || IMG_BANGLA
      );
      if (!check.valid) {
        return res.status(400).json({ error: check.reason, index: i });
      }
      normalizedList.push(check);
    }

    const inserted = await db
      .insert(foodItems)
      .values(
        normalizedList.map((entry) => ({
          restaurantId: auth.restaurant.id,
          category: entry.product.category,
          name: entry.product.name,
          nameBn: entry.product.nameBn,
          description: entry.product.description,
          imageUrl: entry.product.imageUrl,
          price: entry.product.price,
          discountPrice: entry.product.discountPrice,
          inStock: entry.product.inStock,
          isAvailable: entry.product.isAvailable,
          isVisibleOnStorefront: true,
          isPopular: entry.product.isPopular,
          variationsJson: entry.product.variationsJson,
          addonsJson: entry.product.addonsJson,
        }))
      )
      .returning();

    await db.insert(auditLogs).values({
      actorUid: auth.restaurant.ownerUid,
      action: 'partner_api_product_created',
      targetType: 'food_item',
      targetId: String(inserted[0].id),
      details: JSON.stringify({
        restaurantId: auth.restaurant.id,
        count: inserted.length,
        names: inserted.map((p) => p.name),
      }),
    });

    res.status(201).json({
      count: inserted.length,
      product: inserted.length === 1 ? inserted[0] : undefined,
      products: inserted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Partner API failed to add product' });
  }
});

app.patch('/api/partner/v1/products/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const existing = await db
      .select()
      .from(foodItems)
      .where(and(eq(foodItems.id, itemId), eq(foodItems.restaurantId, auth.restaurant.id)))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Product not found for this partner restaurant' });
    }
    const cur = existing[0];

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const merged = normalizePartnerProductInput(
      {
        name: body.name ?? cur.name,
        nameBn: body.nameBn ?? cur.nameBn,
        category: body.category ?? cur.category,
        description: body.description ?? cur.description,
        imageUrl: body.imageUrl ?? cur.imageUrl,
        price: body.price ?? cur.price,
        discountPrice:
          body.discountPrice === undefined ? cur.discountPrice : body.discountPrice,
        inStock: body.inStock ?? cur.inStock,
        isAvailable: body.isAvailable ?? cur.isAvailable,
        isPopular: body.isPopular ?? cur.isPopular,
        variations: body.variations ?? cur.variationsJson,
        addons: body.addons ?? cur.addonsJson,
      },
      cur.imageUrl || auth.restaurant.coverUrl || IMG_BANGLA
    );

    if (!merged.valid) {
      return res.status(400).json({ error: merged.reason });
    }

    const updated = await db
      .update(foodItems)
      .set({
        name: merged.product.name,
        nameBn: merged.product.nameBn,
        category: merged.product.category,
        description: merged.product.description,
        imageUrl: merged.product.imageUrl,
        price: merged.product.price,
        discountPrice: merged.product.discountPrice,
        inStock: merged.product.inStock,
        isAvailable: merged.product.isAvailable,
        isPopular: merged.product.isPopular,
        variationsJson: merged.product.variationsJson,
        addonsJson: merged.product.addonsJson,
        updatedAt: new Date(),
      })
      .where(and(eq(foodItems.id, itemId), eq(foodItems.restaurantId, auth.restaurant.id)))
      .returning();

    res.json({ product: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update partner product' });
  }
});

app.delete('/api/partner/v1/products/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const deleted = await db
      .delete(foodItems)
      .where(and(eq(foodItems.id, itemId), eq(foodItems.restaurantId, auth.restaurant.id)))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Product not found for this partner restaurant' });
    }

    res.json({ deleted: true, id: itemId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete partner product' });
  }
});

app.patch(
  '/api/vendor/restaurant',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      isOpen: z.boolean().optional(),
      openingHours: z.string().optional(),
      deliveryFee: z.number().int().min(0).max(500).optional(),
      minOrder: z.number().int().min(0).max(5000).optional(),
      deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).optional(),
      logoUrl: z.string().optional(),
      coverUrl: z.string().optional(),
      description: z.string().optional(),
      area: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid restaurant settings' });

    try {
      const rows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rows[0].ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = await db
        .update(restaurants)
        .set({
          isOpen: parsed.data.isOpen ?? rows[0].isOpen,
          openingHours: parsed.data.openingHours ?? rows[0].openingHours,
          deliveryFee: parsed.data.deliveryFee ?? rows[0].deliveryFee,
          minOrder: parsed.data.minOrder ?? rows[0].minOrder,
          deliveryMode: parsed.data.deliveryMode ?? rows[0].deliveryMode,
          area: parsed.data.area !== undefined ? parsed.data.area.trim() : rows[0].area,
          address: parsed.data.address !== undefined ? parsed.data.address.trim() : rows[0].address,
          lat: parsed.data.lat !== undefined ? parsed.data.lat : rows[0].lat,
          lng: parsed.data.lng !== undefined ? parsed.data.lng : rows[0].lng,
          logoUrl:
            parsed.data.logoUrl !== undefined ? parsed.data.logoUrl.trim() : rows[0].logoUrl,
          coverUrl:
            parsed.data.coverUrl !== undefined && parsed.data.coverUrl.trim()
              ? parsed.data.coverUrl.trim()
              : rows[0].coverUrl,
          description:
            parsed.data.description !== undefined
              ? parsed.data.description.trim()
              : rows[0].description,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, rows[0].id))
        .returning();
      res.json({ restaurant: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/vendor/orders/:id/status',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['accepted', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled']),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: 'Invalid status update' });
    }

    try {
      const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, order.restaurantId))
        .limit(1);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0]?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Order belongs to another restaurant' });
      }

      if (!canTransitionOrderStatus(order.status as OrderStatus, parsed.data.status)) {
        return res.status(400).json({
          error: `Cannot transition order from ${order.status} to ${parsed.data.status}`,
        });
      }

      const prepaidCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: parsed.data.status,
      });
      if (!prepaidCheck.allowed) {
        return res.status(400).json({ error: prepaidCheck.reason });
      }

      const updated = await db.transaction(async (tx) => {
        const nextPaymentStatus =
          parsed.data.status === 'cancelled'
            ? order.paymentStatus === 'paid'
              ? 'refunded'
              : 'failed'
            : order.paymentStatus;
        const rows = await tx
          .update(orders)
          .set({
            status: parsed.data.status,
            paymentStatus: nextPaymentStatus,
            cancelReason:
              parsed.data.status === 'cancelled'
                ? parsed.data.note || 'Cancelled by restaurant'
                : order.cancelReason,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          status: parsed.data.status,
          note: parsed.data.note || `Updated to ${parsed.data.status}`,
          actorUid: req.user!.uid,
        });

        if (parsed.data.status === 'cancelled') {
          await reverseOrderSplitFinancialsTx(
            tx,
            order,
            parsed.data.note || 'Cancelled by restaurant'
          );
        }

        return rows;
      });

      if (parsed.data.status === 'delivered') {
        await settleOrderCommissionIdempotent(order.id);
        await recordRiderDeliveryWalletIdempotent(order.id, undefined, req.user!.uid);
      }

      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace('_', ' ')}`,
        message: parsed.data.note || `${order.restaurantName} updated your order status.`,
        type: 'order',
        relatedOrderId: order.id,
      });

      const vendorStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (vendorStatusRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: vendorStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote: parsed.data.note || `${order.restaurantName} updated order status`,
          riderName: updated[0].riderName,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson,
        });
      }

      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: 'status_update',
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: parsed.data.note || `${order.restaurantName} updated order status`,
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson,
      }).catch(() => []);

      broadcastOrderEvent('order:updated', {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        customerName: updated[0].customerName,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace('_', ' ')}`,
        message: parsed.data.note || `${order.restaurantName} updated your order status.`,
        type: 'order',
        relatedOrderId: order.id,
      });
      broadcastNotificationEvent({
        recipientUid: 'role-super_admin',
        roleTarget: 'super_admin',
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace('_', ' ')}`,
        message: `${order.restaurantName} updated order ${order.orderNumber}.`,
        type: 'order',
        relatedOrderId: order.id,
      });

      res.json({ order: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Vendor Dispatch: list available approved riders (prioritizing restaurant's own riders, then availability & distance)
app.get(
  '/api/vendor/riders',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const restId = Number(req.query.restaurantId);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      let targetRest: typeof restaurants.$inferSelect | null = null;
      if (Number.isInteger(restId) && restId > 0) {
        const restRows = await db
          .select()
          .from(restaurants)
          .where(eq(restaurants.id, restId))
          .limit(1);
        if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
        if (!isAdmin && restRows[0].ownerUid !== req.user!.uid) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        targetRest = restRows[0];
      }

      const ownedStores = isAdmin
        ? []
        : await db
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(eq(restaurants.ownerUid, req.user!.uid));
      const ownedSet = new Set(ownedStores.map((s) => s.id));

      const riderRows = await db
        .select({
          id: riders.id,
          uid: riders.uid,
          restaurantId: riders.restaurantId,
          addedByUid: riders.addedByUid,
          fullName: riders.fullName,
          phone: riders.phone,
          email: riders.email,
          vehicleType: riders.vehicleType,
          zone: riders.zone,
          isAvailable: riders.isAvailable,
          status: riders.status,
          currentLat: riders.currentLat,
          currentLng: riders.currentLng,
          totalDeliveries: riders.totalDeliveries,
        })
        .from(riders)
        .where(eq(riders.status, 'approved'));

      const enriched = riderRows
        .map((r) => {
          const isOwnRider = Boolean(
            (targetRest && r.restaurantId === targetRest.id) ||
              (r.restaurantId && ownedSet.has(r.restaurantId)) ||
              r.addedByUid === req.user!.uid
          );
          return {
            ...r,
            isOwnRider,
            distanceKm: targetRest
              ? Math.round(
                  haversineDistanceKm(r.currentLat, r.currentLng, targetRest.lat, targetRest.lng) *
                    100
                ) / 100
              : null,
          };
        })
        .sort((a, b) => {
          if (a.isOwnRider !== b.isOwnRider) return a.isOwnRider ? -1 : 1;
          if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
          if (a.distanceKm !== null && b.distanceKm !== null) {
            return a.distanceKm - b.distanceKm;
          }
          return b.totalDeliveries - a.totalDeliveries;
        });

      res.json({ riders: enriched });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load riders' });
    }
  }
);

// Vendor Direct Delivery Man: restaurant owner directly adds a delivery man to their store fleet
app.post(
  '/api/vendor/riders',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const check = validateVendorAddRiderPayload(req.body || {});
    if (check.valid === false) {
      return res.status(400).json({ error: check.reason });
    }
    const { restaurantId, fullName, phone, email, password, vehicleType, zone, nidNumber } =
      check.data;

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const rest = restRows[0];
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Not owner of this restaurant' });
      }

      const existingUsers = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (
        existingUsers.length > 0 &&
        (existingUsers[0].role === 'admin' || existingUsers[0].role === 'super_admin')
      ) {
        return res.status(409).json({
          error: 'This email belongs to an admin account and cannot be registered as a rider.',
        });
      }

      const riderUid = existingUsers[0]?.uid || `rdr-${crypto.randomBytes(6).toString('hex')}`;

      if (existingUsers.length === 0) {
        await db.insert(users).values({
          uid: riderUid,
          email,
          fullName,
          phone,
          role: 'rider',
        });
      } else if (existingUsers[0].role === 'customer') {
        await db
          .update(users)
          .set({ role: 'rider', fullName, phone, updatedAt: new Date() })
          .where(eq(users.uid, existingUsers[0].uid));
      }

      if (password) {
        await db
          .insert(localCredentials)
          .values({
            email,
            uid: riderUid,
            passwordHash: hashPasswordScrypt(password),
          })
          .onConflictDoUpdate({
            target: localCredentials.email,
            set: { passwordHash: hashPasswordScrypt(password) },
          });
      }

      const upserted = await db
        .insert(riders)
        .values({
          uid: riderUid,
          restaurantId: rest.id,
          addedByUid: req.user!.uid,
          fullName,
          phone,
          email,
          vehicleType,
          nidNumber,
          zone,
          isAvailable: true,
          status: 'approved',
          currentLat: rest.lat,
          currentLng: rest.lng,
          locationUpdatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: riders.uid,
          set: {
            restaurantId: rest.id,
            addedByUid: req.user!.uid,
            fullName,
            phone,
            email,
            vehicleType,
            nidNumber: nidNumber || undefined,
            zone,
            isAvailable: true,
            status: 'approved',
            locationUpdatedAt: new Date(),
          },
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'vendor_added_rider',
        targetType: 'rider',
        targetId: String(upserted[0].id),
        details: JSON.stringify({ restaurantId: rest.id, fullName, email, vehicleType }),
      });

      broadcastNotificationEvent({
        recipientUid: riderUid,
        roleTarget: 'rider',
        title: `Added as Rider · ${rest.name}`,
        message: `${rest.name} added you as a delivery rider for ${zone}.`,
        type: 'system',
      });

      res.status(201).json({
        rider: {
          ...upserted[0],
          isOwnRider: true,
          distanceKm: 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to add delivery man' });
    }
  }
);

app.patch(
  '/api/vendor/riders/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const riderId = Number(req.params.id);
    if (!Number.isInteger(riderId)) return res.status(400).json({ error: 'Invalid rider ID' });
    const schema = z.object({
      isAvailable: z.boolean().optional(),
      fullName: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().min(6).max(30).optional(),
      vehicleType: z.string().trim().min(2).max(60).optional(),
      zone: z.string().trim().min(2).max(120).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid rider update payload' });

    try {
      const existing = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Rider not found' });
      const row = existing[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      let ownsRest = row.addedByUid === req.user!.uid;
      if (!ownsRest && row.restaurantId) {
        const restRows = await db
          .select({ ownerUid: restaurants.ownerUid })
          .from(restaurants)
          .where(eq(restaurants.id, row.restaurantId))
          .limit(1);
        ownsRest = restRows[0]?.ownerUid === req.user!.uid;
      }
      if (!isAdmin && !ownsRest) {
        return res.status(403).json({
          error: 'Only riders added to your own restaurant can be modified here.',
        });
      }

      const d = parsed.data;
      const updated = await db
        .update(riders)
        .set({
          isAvailable: d.isAvailable ?? row.isAvailable,
          fullName: d.fullName ?? row.fullName,
          phone: d.phone ?? row.phone,
          vehicleType: d.vehicleType ?? row.vehicleType,
          zone: d.zone ?? row.zone,
        })
        .where(eq(riders.id, riderId))
        .returning();
      res.json({ rider: { ...updated[0], isOwnRider: true } });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update rider' });
    }
  }
);

app.delete(
  '/api/vendor/riders/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const riderId = Number(req.params.id);
    if (!Number.isInteger(riderId)) return res.status(400).json({ error: 'Invalid rider ID' });
    try {
      const existing = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Rider not found' });
      const row = existing[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      let ownsRest = row.addedByUid === req.user!.uid;
      if (!ownsRest && row.restaurantId) {
        const restRows = await db
          .select({ ownerUid: restaurants.ownerUid })
          .from(restaurants)
          .where(eq(restaurants.id, row.restaurantId))
          .limit(1);
        ownsRest = restRows[0]?.ownerUid === req.user!.uid;
      }
      if (!isAdmin && !ownsRest) {
        return res.status(403).json({ error: 'Forbidden: Rider does not belong to your restaurant' });
      }

      await db.delete(riders).where(eq(riders.id, riderId));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to remove rider' });
    }
  }
);

// Vendor Dispatch: assign or auto-pick nearest rider to restaurant's order
app.post(
  '/api/vendor/orders/:id/assign-rider',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      riderUid: z.string().nullable().optional(),
      autoAssignNearest: z.boolean().optional(),
      note: z.string().max(240).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: 'Invalid rider assignment request' });
    }

    try {
      const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, order.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const rest = restRows[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Order belongs to another restaurant' });
      }

      if (order.status === 'delivered' || order.status === 'cancelled') {
        return res.status(400).json({
          error: `Cannot assign rider to a ${order.status} order.`,
        });
      }

      const prepaidAssignCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: 'rider_assigned',
      });
      if (!prepaidAssignCheck.allowed) {
        return res.status(400).json({ error: prepaidAssignCheck.reason });
      }

      let nextRiderUid: string | null = order.riderUid || null;
      let nextRiderName: string | null = order.riderName || null;
      let assignedRiderPhone = '';

      if (parsed.data.autoAssignNearest) {
        const approvedRiders = await db
          .select()
          .from(riders)
          .where(eq(riders.status, 'approved'));
        const picked = pickNearestStandbyRider(
          approvedRiders.map((r) => ({
            uid: r.uid,
            fullName: r.fullName,
            phone: r.phone,
            vehicleType: r.vehicleType,
            zone: r.zone,
            isAvailable: r.isAvailable,
            lat: r.currentLat,
            lng: r.currentLng,
            locationUpdatedAt: r.locationUpdatedAt,
          })),
          rest.lat,
          rest.lng
        );
        if (!picked) {
          return res.status(404).json({ error: 'No approved riders available to assign right now.' });
        }
        nextRiderUid = picked.rider.uid;
        nextRiderName = picked.rider.fullName;
        assignedRiderPhone = picked.rider.phone;
      } else if (parsed.data.riderUid === null || parsed.data.riderUid === '') {
        nextRiderUid = null;
        nextRiderName = null;
      } else if (parsed.data.riderUid) {
        const riderRows = await db
          .select()
          .from(riders)
          .where(eq(riders.uid, parsed.data.riderUid))
          .limit(1);
        if (riderRows.length === 0) {
          return res.status(404).json({ error: 'Selected rider not found' });
        }
        if (riderRows[0].status !== 'approved') {
          return res.status(400).json({ error: 'Selected rider is pending Admin approval and cannot be assigned yet.' });
        }
        nextRiderUid = riderRows[0].uid;
        nextRiderName = riderRows[0].fullName;
        assignedRiderPhone = riderRows[0].phone;
      }

      const shouldMoveToAssigned =
        Boolean(nextRiderUid) &&
        ['confirmed', 'accepted', 'preparing', 'ready'].includes(order.status);
      const nextStatus: OrderStatus = shouldMoveToAssigned
        ? 'rider_assigned'
        : (order.status as OrderStatus);

      const updated = await db
        .update(orders)
        .set({
          riderUid: nextRiderUid,
          riderName: nextRiderName,
          status: nextStatus,
          deliveryMode: nextRiderUid ? 'platform' : order.deliveryMode,
          deliveryProvider: nextRiderUid ? 'Foodora Rider' : order.deliveryProvider,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      const statusNote =
        parsed.data.note?.trim() ||
        (nextRiderName
          ? `Rider ${nextRiderName} assigned by ${order.restaurantName}`
          : `Rider unassigned by ${order.restaurantName}`);

      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        status: nextStatus,
        note: statusNote,
        actorUid: req.user!.uid,
      });

      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: nextRiderName
          ? `Rider Assigned · ${order.orderNumber}`
          : `Order Updated · ${order.orderNumber}`,
        message: nextRiderName
          ? `${nextRiderName} is assigned to pick up your order from ${order.restaurantName}.`
          : statusNote,
        type: 'order',
        relatedOrderId: order.id,
      });

      if (nextRiderUid) {
        await db.insert(notifications).values({
          recipientUid: nextRiderUid,
          roleTarget: 'rider',
          title: `Delivery Assigned · ${order.orderNumber}`,
          message: `Pickup at ${order.restaurantName} → Dropoff ${order.deliveryArea}`,
          type: 'order',
          relatedOrderId: order.id,
        });
      }

      const recipientEmail = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (recipientEmail) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: recipientEmail,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: updated[0].status,
          statusNote,
          riderName: updated[0].riderName,
          riderPhone: assignedRiderPhone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson,
        }).catch(() => null);
      }

      broadcastOrderEvent('order:updated', {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: rest.ownerUid,
        customerUid: updated[0].customerUid,
        customerName: updated[0].customerName,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: `Order ${order.orderNumber}: ${updated[0].status.replace(/_/g, ' ')}`,
        message: statusNote,
        type: 'order',
        relatedOrderId: order.id,
      });
      if (nextRiderUid) {
        broadcastNotificationEvent({
          recipientUid: nextRiderUid,
          roleTarget: 'rider',
          title: `New Delivery · ${order.orderNumber}`,
          message: `Pickup from ${order.restaurantName} (${order.deliveryArea})`,
          type: 'order',
          relatedOrderId: order.id,
        });
      }

      res.json({ order: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to assign rider' });
    }
  }
);

// ---------- Restaurant Rider Job Board & Applications ----------

app.get('/api/rider-jobs', async (_req, res) => {
  try {
    const jobs = await db
      .select({
        id: riderJobs.id,
        restaurantId: riderJobs.restaurantId,
        restaurantName: riderJobs.restaurantName,
        ownerUid: riderJobs.ownerUid,
        title: riderJobs.title,
        titleBn: riderJobs.titleBn,
        zone: riderJobs.zone,
        vehicleType: riderJobs.vehicleType,
        salaryRange: riderJobs.salaryRange,
        shiftHours: riderJobs.shiftHours,
        vacancies: riderJobs.vacancies,
        description: riderJobs.description,
        isActive: riderJobs.isActive,
        createdAt: riderJobs.createdAt,
        updatedAt: riderJobs.updatedAt,
      })
      .from(riderJobs)
      .innerJoin(restaurants, eq(riderJobs.restaurantId, restaurants.id))
      .where(and(eq(riderJobs.isActive, true), eq(restaurants.status, 'approved')))
      .orderBy(desc(riderJobs.createdAt));

    res.json({ jobs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load rider jobs' });
  }
});

app.post('/api/rider-jobs/:id/apply', optionalAuth, async (req: AuthRequest, res) => {
  const jobId = Number(req.params.id);
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    vehicleType: z.string().trim().min(2).max(50).default('Motorbike'),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(''),
    experienceNote: z.string().trim().max(400).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(jobId) || !parsed.success) {
    return res.status(400).json({
      error: parsed.success ? 'Invalid job ID' : parsed.error.issues[0]?.message || 'Invalid application',
    });
  }

  try {
    const jobRows = await db.select().from(riderJobs).where(eq(riderJobs.id, jobId)).limit(1);
    if (jobRows.length === 0 || !jobRows[0].isActive) {
      return res.status(404).json({ error: 'This rider job post is no longer open.' });
    }
    const job = jobRows[0];

    const inserted = await db
      .insert(riderJobApplications)
      .values({
        jobId: job.id,
        restaurantId: job.restaurantId,
        applicantUid: req.user?.uid || '',
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        email: parsed.data.email.toLowerCase(),
        vehicleType: parsed.data.vehicleType,
        zone: parsed.data.zone,
        nidNumber: parsed.data.nidNumber,
        experienceNote: parsed.data.experienceNote,
        status: 'pending',
      })
      .returning();

    await db.insert(notifications).values({
      recipientUid: job.ownerUid,
      roleTarget: 'restaurant_owner',
      title: `New Rider Applicant · ${job.restaurantName}`,
      message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for "${job.title}".`,
      type: 'system',
    });

    broadcastNotificationEvent({
      recipientUid: job.ownerUid,
      roleTarget: 'restaurant_owner',
      title: `New Rider Applicant · ${job.restaurantName}`,
      message: `${parsed.data.fullName} applied for ${job.title}`,
      type: 'system',
    });

    res.status(201).json({ application: inserted[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to submit rider application' });
  }
});

app.get(
  '/api/vendor/rider-jobs',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      const reqRestId = Number(req.query.restaurantId);
      const owned = isAdmin
        ? await db.select().from(restaurants)
        : await db.select().from(restaurants).where(eq(restaurants.ownerUid, req.user!.uid));

      let targetIds = owned.map((r) => r.id);
      if (Number.isInteger(reqRestId) && reqRestId > 0) {
        if (!isAdmin && !targetIds.includes(reqRestId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        targetIds = [reqRestId];
      }

      if (targetIds.length === 0) {
        return res.json({ jobs: [], applications: [] });
      }

      const [jobs, applications] = await Promise.all([
        db
          .select()
          .from(riderJobs)
          .where(inArray(riderJobs.restaurantId, targetIds))
          .orderBy(desc(riderJobs.createdAt)),
        db
          .select()
          .from(riderJobApplications)
          .where(inArray(riderJobApplications.restaurantId, targetIds))
          .orderBy(desc(riderJobApplications.createdAt)),
      ]);

      res.json({ jobs, applications });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load restaurant rider jobs' });
    }
  }
);

app.post(
  '/api/vendor/rider-jobs',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const check = validateRiderJobPayload(req.body || {});
    if (check.valid === false) {
      return res.status(400).json({ error: check.reason });
    }

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, check.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const rest = restRows[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Not owner of this restaurant' });
      }

      const inserted = await db
        .insert(riderJobs)
        .values({
          restaurantId: rest.id,
          restaurantName: rest.name,
          ownerUid: rest.ownerUid,
          title: check.data.title,
          titleBn: check.data.titleBn,
          zone: check.data.zone,
          vehicleType: check.data.vehicleType,
          salaryRange: check.data.salaryRange,
          shiftHours: check.data.shiftHours,
          vacancies: check.data.vacancies,
          description: check.data.description,
          isActive: true,
        })
        .returning();

      res.status(201).json({ job: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to publish rider job' });
    }
  }
);

app.patch(
  '/api/vendor/rider-jobs/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const schema = z.object({
      isActive: z.boolean().optional(),
      title: z.string().trim().min(3).max(120).optional(),
      titleBn: z.string().trim().min(2).max(120).optional(),
      zone: z.string().trim().min(2).max(120).optional(),
      vehicleType: z.string().trim().min(2).max(60).optional(),
      salaryRange: z.string().trim().min(2).max(80).optional(),
      shiftHours: z.string().trim().min(2).max(80).optional(),
      vacancies: z.number().int().min(1).max(100).optional(),
      description: z.string().max(600).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid job update' });

    try {
      const rows = await db.select().from(riderJobs).where(eq(riderJobs.id, jobId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Rider job not found' });

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, rows[0].restaurantId))
        .limit(1);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0]?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const d = parsed.data;
      const updated = await db
        .update(riderJobs)
        .set({
          isActive: d.isActive ?? rows[0].isActive,
          title: d.title ?? rows[0].title,
          titleBn: d.titleBn ?? rows[0].titleBn,
          zone: d.zone ?? rows[0].zone,
          vehicleType: d.vehicleType ?? rows[0].vehicleType,
          salaryRange: d.salaryRange ?? rows[0].salaryRange,
          shiftHours: d.shiftHours ?? rows[0].shiftHours,
          vacancies: d.vacancies ?? rows[0].vacancies,
          description: d.description ?? rows[0].description,
          updatedAt: new Date(),
        })
        .where(eq(riderJobs.id, jobId))
        .returning();

      res.json({ job: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update rider job' });
    }
  }
);

app.delete(
  '/api/vendor/rider-jobs/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    try {
      const rows = await db.select().from(riderJobs).where(eq(riderJobs.id, jobId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Rider job not found' });

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, rows[0].restaurantId))
        .limit(1);
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0]?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await db.delete(riderJobs).where(eq(riderJobs.id, jobId));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete rider job' });
    }
  }
);

app.patch(
  '/api/vendor/rider-applications/:id',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const appId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['pending', 'hired', 'rejected']),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(appId) || !parsed.success) {
      return res.status(400).json({ error: 'Invalid rider application update' });
    }

    try {
      const appRows = await db
        .select()
        .from(riderJobApplications)
        .where(eq(riderJobApplications.id, appId))
        .limit(1);
      if (appRows.length === 0) return res.status(404).json({ error: 'Application not found' });
      const appRow = appRows[0];

      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, appRow.restaurantId))
        .limit(1);
      const rest = restRows[0];
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest?.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = await db
        .update(riderJobApplications)
        .set({
          status: parsed.data.status,
          updatedAt: new Date(),
        })
        .where(eq(riderJobApplications.id, appId))
        .returning();

      if (parsed.data.status === 'hired') {
        const emailLower = appRow.email.trim().toLowerCase();
        const existingUsers = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${emailLower}`)
          .limit(1);

        let riderUid = appRow.applicantUid?.trim() || existingUsers[0]?.uid || '';
        if (!riderUid) {
          riderUid = `rdr-${crypto.randomBytes(6).toString('hex')}`;
        }

        if (existingUsers.length === 0) {
          await db.insert(users).values({
            uid: riderUid,
            email: emailLower,
            fullName: appRow.fullName,
            phone: appRow.phone,
            role: 'rider',
          });
        } else if (existingUsers[0].role === 'customer') {
          await db
            .update(users)
            .set({ role: 'rider', fullName: appRow.fullName, phone: appRow.phone })
            .where(eq(users.uid, existingUsers[0].uid));
        }

        await db
          .insert(riders)
          .values({
            uid: riderUid,
            restaurantId: appRow.restaurantId,
            addedByUid: req.user!.uid,
            fullName: appRow.fullName,
            phone: appRow.phone,
            email: emailLower,
            vehicleType: appRow.vehicleType,
            zone: appRow.zone,
            nidNumber: appRow.nidNumber || '',
            currentLat: rest?.lat ?? 23.7949,
            currentLng: rest?.lng ?? 90.4043,
            isAvailable: true,
            status: 'approved',
          })
          .onConflictDoUpdate({
            target: riders.uid,
            set: {
              restaurantId: appRow.restaurantId,
              addedByUid: req.user!.uid,
              fullName: appRow.fullName,
              phone: appRow.phone,
              vehicleType: appRow.vehicleType,
              zone: appRow.zone,
              isAvailable: true,
              status: 'approved',
            },
          });

        await db.insert(notifications).values({
          recipientUid: riderUid,
          roleTarget: 'rider',
          title: `Hired by ${rest?.name || 'Restaurant'}!`,
          message: `You are now an approved rider for ${rest?.name || 'Foodora BD'}. Open Rider Portal to start deliveries.`,
          type: 'system',
        });

        broadcastNotificationEvent({
          recipientUid: riderUid,
          roleTarget: 'rider',
          title: `Rider Application Hired · ${rest?.name || 'Foodora BD'}`,
          message: `You have been hired as a delivery rider!`,
          type: 'system',
        });
      }

      res.json({ application: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update rider application' });
    }
  }
);

// ---------- Vendor ↔ Admin Live Messaging ----------

app.get(
  '/api/messages/vendor-admin',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      const reqRestId = Number(req.query.restaurantId);

      const accessibleRestaurants = isAdmin
        ? await db.select().from(restaurants).orderBy(asc(restaurants.id))
        : await db
            .select()
            .from(restaurants)
            .where(eq(restaurants.ownerUid, req.user!.uid))
            .orderBy(asc(restaurants.id));

      const allowedIds = accessibleRestaurants.map((r) => r.id);
      if (Number.isInteger(reqRestId) && reqRestId > 0) {
        if (!isAdmin && !allowedIds.includes(reqRestId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const queryIds =
        Number.isInteger(reqRestId) && reqRestId > 0 ? [reqRestId] : allowedIds;

      const messages =
        queryIds.length > 0
          ? await db
              .select()
              .from(vendorAdminMessages)
              .where(inArray(vendorAdminMessages.restaurantId, queryIds))
              .orderBy(asc(vendorAdminMessages.createdAt))
          : [];

      const threadMap = new Map<
        number,
        {
          restaurantId: number;
          restaurantName: string;
          ownerUid: string;
          lastMessage: string;
          lastSenderRole: string;
          lastAt: string;
          unreadForAdmin: number;
          unreadForVendor: number;
        }
      >();

      for (const r of accessibleRestaurants) {
        threadMap.set(r.id, {
          restaurantId: r.id,
          restaurantName: r.name,
          ownerUid: r.ownerUid,
          lastMessage: '',
          lastSenderRole: '',
          lastAt: '',
          unreadForAdmin: 0,
          unreadForVendor: 0,
        });
      }

      for (const msg of messages) {
        const cur = threadMap.get(msg.restaurantId) || {
          restaurantId: msg.restaurantId,
          restaurantName: msg.restaurantName,
          ownerUid: msg.ownerUid,
          lastMessage: '',
          lastSenderRole: '',
          lastAt: '',
          unreadForAdmin: 0,
          unreadForVendor: 0,
        };
        cur.lastMessage = msg.message;
        cur.lastSenderRole = msg.senderRole;
        cur.lastAt = new Date(msg.createdAt).toISOString();
        if (!msg.isReadByAdmin) cur.unreadForAdmin += 1;
        if (!msg.isReadByVendor) cur.unreadForVendor += 1;
        threadMap.set(msg.restaurantId, cur);
      }

      const threads = Array.from(threadMap.values()).sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return a.restaurantId - b.restaurantId;
      });

      res.json({ messages, threads });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load messages' });
    }
  }
);

app.post(
  '/api/messages/vendor-admin',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      message: z.string().trim().min(1, 'Message cannot be empty').max(1200),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message' });
    }

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const rest = restRows[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Not owner of this restaurant' });
      }

      const inserted = await db
        .insert(vendorAdminMessages)
        .values({
          restaurantId: rest.id,
          restaurantName: rest.name,
          ownerUid: rest.ownerUid,
          senderUid: req.user!.uid,
          senderName: req.user!.fullName,
          senderRole: req.user!.role,
          message: parsed.data.message,
          isReadByAdmin: isAdmin,
          isReadByVendor: !isAdmin,
        })
        .returning();

      const saved = inserted[0];
      if (isAdmin) {
        await db.insert(notifications).values({
          recipientUid: rest.ownerUid,
          roleTarget: 'restaurant_owner',
          title: `Message from Admin · ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: 'system',
        });
        broadcastNotificationEvent({
          recipientUid: rest.ownerUid,
          roleTarget: 'restaurant_owner',
          title: `Message from Admin · ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: 'system',
        });
      } else {
        await db.insert(notifications).values({
          recipientUid: 'demo-admin-uid',
          roleTarget: 'super_admin',
          title: `Vendor Message · ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: 'system',
        });
        broadcastNotificationEvent({
          recipientUid: 'role-super_admin',
          roleTarget: 'super_admin',
          title: `Vendor Message · ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: 'system',
        });
      }

      broadcastVendorAdminMessage({
        id: saved.id,
        restaurantId: saved.restaurantId,
        restaurantName: saved.restaurantName,
        ownerUid: saved.ownerUid,
        senderUid: saved.senderUid,
        senderName: saved.senderName,
        senderRole: saved.senderRole,
        message: saved.message,
        createdAt: new Date(saved.createdAt).toISOString(),
      });

      res.status(201).json({ message: saved });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to send message' });
    }
  }
);

app.patch(
  '/api/messages/vendor-admin/read',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid restaurantId' });

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && restRows[0].ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (isAdmin) {
        await db
          .update(vendorAdminMessages)
          .set({ isReadByAdmin: true })
          .where(eq(vendorAdminMessages.restaurantId, parsed.data.restaurantId));
      } else {
        await db
          .update(vendorAdminMessages)
          .set({ isReadByVendor: true })
          .where(eq(vendorAdminMessages.restaurantId, parsed.data.restaurantId));
      }

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark messages read' });
    }
  }
);

app.post(
  '/api/vendor/payouts',
  requireAuth,
  requireRole(['restaurant_owner', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      amount: z.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payout request' });

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const rest = restRows[0];
      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && rest.ownerUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const inserted = await db
        .insert(restaurantPayouts)
        .values({
          restaurantId: rest.id,
          restaurantName: rest.name,
          amount: parsed.data.amount,
          method: rest.payoutMethod,
          accountNumber: rest.payoutAccount || rest.phone,
          status: 'pending',
        })
        .returning();

      res.status(201).json({ payout: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ---------- Delivery Rider Routes ----------

// Open public Rider Job Application & instant activation anywhere in Bangladesh
app.post('/api/riders/apply', async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    password: z.string().min(6).max(128).optional().or(z.literal('')),
    vehicleType: z.string().trim().min(2).max(40).default('Motorbike'),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(''),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please complete all rider job application fields.' });
  }
  if (!isBicycleVehicleType(parsed.data.vehicleType) && parsed.data.nidNumber.length < 4) {
    return res.status(400).json({
      error: 'Please enter your NID or Driving License number (or select Bicycle if riding without a license).',
    });
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  if (isProtectedSuperAdminEmail(emailLower)) {
    return res.status(409).json({
      error: 'This email belongs to a Super Admin account. Please use a rider email.',
    });
  }

  try {
    const existingUsers = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${emailLower}`)
      .limit(1);

    let uid = existingUsers[0]?.uid || '';
    if (existingUsers[0]) {
      if (existingUsers[0].status === 'suspended') {
        return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      }
      if (['admin', 'super_admin'].includes(existingUsers[0].role)) {
        return res.status(409).json({
          error: 'This email belongs to an Admin account. Please use a separate rider email.',
        });
      }
      const credRows = await db
        .select()
        .from(localCredentials)
        .where(eq(localCredentials.email, emailLower))
        .limit(1);
      if (credRows.length > 0 && parsed.data.password) {
        if (!verifyPasswordScrypt(parsed.data.password, credRows[0].passwordHash)) {
          return res.status(401).json({
            error: 'An account with this email already exists. Enter your matching password or leave password blank if applying with Google/existing session.',
          });
        }
      }
      await db
        .update(users)
        .set({
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
          role: existingUsers[0].role === 'restaurant_owner' ? 'rider' : 'rider',
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid));
    } else {
      uid = `rdr-${crypto.randomBytes(8).toString('hex')}`;
      await db.insert(users).values({
        uid,
        email: emailLower,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        role: 'rider',
      });
      if (parsed.data.password && parsed.data.password.length >= 6) {
        await db
          .insert(localCredentials)
          .values({
            email: emailLower,
            uid,
            passwordHash: hashPasswordScrypt(parsed.data.password),
          })
          .onConflictDoNothing();
      }
    }

    const startLat = Number.isFinite(parsed.data.lat) ? Math.round((parsed.data.lat as number) * 1e6) / 1e6 : 23.7949;
    const startLng = Number.isFinite(parsed.data.lng) ? Math.round((parsed.data.lng as number) * 1e6) / 1e6 : 90.4144;

    const existingRider = await db
      .select()
      .from(riders)
      .where(eq(riders.uid, uid))
      .limit(1);

    const inserted =
      existingRider.length > 0
        ? await db
            .update(riders)
            .set({
              fullName: parsed.data.fullName,
              phone: parsed.data.phone,
              email: emailLower,
              vehicleType: parsed.data.vehicleType,
              zone: parsed.data.zone,
              nidNumber: parsed.data.nidNumber,
              currentLat: startLat,
              currentLng: startLng,
              locationUpdatedAt: new Date(),
            })
            .where(eq(riders.uid, uid))
            .returning()
        : await db
            .insert(riders)
            .values({
              uid,
              fullName: parsed.data.fullName,
              phone: parsed.data.phone,
              email: emailLower,
              vehicleType: parsed.data.vehicleType,
              zone: parsed.data.zone,
              nidNumber: parsed.data.nidNumber,
              currentLat: startLat,
              currentLng: startLng,
              locationUpdatedAt: new Date(),
              isAvailable: false,
              status: 'pending',
            })
            .returning();

    const adminNotifTitle =
      existingRider.length > 0
        ? `Rider Profile Updated · ${parsed.data.zone}`
        : `New Rider Application Pending Approval · ${parsed.data.zone}`;
    const adminNotifMsg = `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}. Review and approve in Admin Panel.`;

    await db.insert(notifications).values({
      recipientUid: 'demo-admin-uid',
      roleTarget: 'super_admin',
      title: adminNotifTitle,
      message: adminNotifMsg,
      type: 'system',
    });
    broadcastNotificationEvent({
      recipientUid: 'role-super_admin',
      roleTarget: 'super_admin',
      title: adminNotifTitle,
      message: adminNotifMsg,
      type: 'system',
    });

    const userPayload = {
      uid,
      email: emailLower,
      fullName: parsed.data.fullName,
      role: 'rider' as UserRole,
      isSandbox: false,
    };
    const token = signSandboxToken(userPayload);

    return res.status(201).json({
      token,
      user: userPayload,
      rider: inserted[0],
    });
  } catch (error: any) {
    console.error('Rider application failed:', error);
    return res.status(500).json({ error: error.message || 'Could not submit rider application' });
  }
});

app.post('/api/riders/register', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    vehicleType: z.string().trim().min(2).max(40),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(''),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid rider registration data' });
  if (!isBicycleVehicleType(parsed.data.vehicleType) && parsed.data.nidNumber.length < 4) {
    return res.status(400).json({
      error: 'Please enter your NID or Driving License number (Bicycle riders may leave this optional).',
    });
  }

  try {
    const startLat = Number.isFinite(parsed.data.lat) ? Math.round((parsed.data.lat as number) * 1e6) / 1e6 : 23.7949;
    const startLng = Number.isFinite(parsed.data.lng) ? Math.round((parsed.data.lng as number) * 1e6) / 1e6 : 90.4144;

    const existingRider = await db
      .select()
      .from(riders)
      .where(eq(riders.uid, req.user!.uid))
      .limit(1);

    const inserted =
      existingRider.length > 0
        ? await db
            .update(riders)
            .set({
              fullName: parsed.data.fullName,
              phone: parsed.data.phone,
              vehicleType: parsed.data.vehicleType,
              zone: parsed.data.zone,
              nidNumber: parsed.data.nidNumber,
              currentLat: startLat,
              currentLng: startLng,
              locationUpdatedAt: new Date(),
            })
            .where(eq(riders.uid, req.user!.uid))
            .returning()
        : await db
            .insert(riders)
            .values({
              uid: req.user!.uid,
              fullName: parsed.data.fullName,
              phone: parsed.data.phone,
              email: parsed.data.email.trim().toLowerCase(),
              vehicleType: parsed.data.vehicleType,
              zone: parsed.data.zone,
              nidNumber: parsed.data.nidNumber,
              currentLat: startLat,
              currentLng: startLng,
              locationUpdatedAt: new Date(),
              isAvailable: false,
              status: 'pending',
            })
            .returning();

    if (existingRider.length === 0) {
      await db.insert(notifications).values({
        recipientUid: 'demo-admin-uid',
        roleTarget: 'super_admin',
        title: `New Rider Application Pending Approval · ${parsed.data.zone}`,
        message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}.`,
        type: 'system',
      });
      broadcastNotificationEvent({
        recipientUid: 'role-super_admin',
        roleTarget: 'super_admin',
        title: `New Rider Application Pending Approval · ${parsed.data.zone}`,
        message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}.`,
        type: 'system',
      });
    }

    let nextUser = req.user!;
    if (req.user!.role === 'customer') {
      await db.update(users).set({ role: 'rider', fullName: parsed.data.fullName }).where(eq(users.uid, req.user!.uid));
      nextUser = { ...req.user!, role: 'rider', fullName: parsed.data.fullName };
    }
    const freshToken = signSandboxToken({
      uid: nextUser.uid,
      email: nextUser.email,
      fullName: nextUser.fullName,
      role: nextUser.role,
      isSandbox: nextUser.isSandbox,
    });
    res.status(201).json({ rider: inserted[0], token: freshToken, user: nextUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get(
  '/api/rider/workspace',
  requireAuth,
  requireRole(['rider', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const targetUid =
        req.user!.role === 'super_admin' || req.user!.role === 'admin'
          ? 'demo-rider-uid'
          : req.user!.uid;
      const data = await getRiderWorkspace(targetUid);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/rider/location',
  requireAuth,
  requireRole(['rider', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      isAvailable: z.boolean().optional(),
      zone: z.string().min(2).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid GPS latitude and longitude required.' });
    }

    try {
      const riderUid =
        req.user!.role === 'super_admin' || req.user!.role === 'admin'
          ? 'demo-rider-uid'
          : req.user!.uid;
      const existing = await db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Rider profile not found.' });
      }
      const cur = existing[0];
      const updated = await db
        .update(riders)
        .set({
          currentLat: Math.round(parsed.data.lat * 1e6) / 1e6,
          currentLng: Math.round(parsed.data.lng * 1e6) / 1e6,
          locationUpdatedAt: new Date(),
          isAvailable:
            typeof parsed.data.isAvailable === 'boolean' ? parsed.data.isAvailable : cur.isAvailable,
          zone: parsed.data.zone ? parsed.data.zone.trim() : cur.zone,
        })
        .where(eq(riders.uid, riderUid))
        .returning();

      const activeRiderOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          restaurantId: orders.restaurantId,
          restaurantName: orders.restaurantName,
          customerUid: orders.customerUid,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.riderUid, riderUid));

      for (const ord of activeRiderOrders) {
        if (!['delivered', 'cancelled'].includes(ord.status)) {
          broadcastOrderEvent('rider:location', {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            restaurantId: ord.restaurantId,
            restaurantName: ord.restaurantName,
            customerUid: ord.customerUid,
            riderUid,
            riderName: updated[0].fullName,
            status: ord.status,
            lat: updated[0].currentLat,
            lng: updated[0].currentLng,
          });
        }
      }

      res.json({ rider: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/rider/profile',
  requireAuth,
  requireRole(['rider', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const check = sanitizeRiderProfileUpdate({
      fullName: req.body?.fullName,
      phone: req.body?.phone,
      vehicleType: req.body?.vehicleType,
      zone: req.body?.zone,
      nidNumber: req.body?.nidNumber,
      isAvailable: req.body?.isAvailable,
      avatarUrl: req.body?.avatarUrl,
    });
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }

    try {
      const riderUid =
        req.user!.role === 'super_admin' || req.user!.role === 'admin'
          ? 'demo-rider-uid'
          : req.user!.uid;
      const existing = await db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Rider profile not found.' });
      }
      const cur = existing[0];
      const d = check.data;

      const updatedRows = await db
        .update(riders)
        .set({
          fullName: d.fullName,
          phone: d.phone,
          vehicleType: d.vehicleType,
          zone: d.zone,
          nidNumber: d.nidNumber,
          isAvailable: d.isAvailable,
        })
        .where(eq(riders.uid, riderUid))
        .returning();

      const updatedUserRows = await db
        .update(users)
        .set({
          fullName: d.fullName,
          phone: d.phone,
          avatarUrl: d.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, riderUid))
        .returning();

      if (d.fullName !== cur.fullName) {
        await db
          .update(orders)
          .set({ riderName: d.fullName })
          .where(
            and(
              eq(orders.riderUid, riderUid),
              notInArray(orders.status, ['delivered', 'cancelled'])
            )
          );
      }

      let restaurantName: string | null = null;
      if (updatedRows[0].restaurantId) {
        const restRows = await db
          .select({ name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, updatedRows[0].restaurantId))
          .limit(1);
        restaurantName = restRows[0]?.name || null;
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'rider_updated_profile',
        targetType: 'rider',
        targetId: String(updatedRows[0].id),
        details: `${d.fullName} updated rider profile (${d.vehicleType}, ${d.zone}, available=${d.isAvailable})`,
      });

      res.json({
        rider: {
          ...updatedRows[0],
          avatarUrl: updatedUserRows[0]?.avatarUrl ?? d.avatarUrl ?? '',
          restaurantName,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update rider profile' });
    }
  }
);

app.post(
  '/api/rider/orders/:id/accept',
  requireAuth,
  requireRole(['rider', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const riderUid =
        req.user!.role === 'super_admin' || req.user!.role === 'admin'
          ? 'demo-rider-uid'
          : req.user!.uid;
      const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const existingOrder = orderRows[0];
      if (['delivered', 'cancelled'].includes(existingOrder.status)) {
        return res.status(409).json({ error: 'Order is already closed and cannot be claimed.' });
      }
      if (existingOrder.riderUid && existingOrder.riderUid !== riderUid) {
        return res.status(409).json({ error: 'Order has already been claimed by another rider.' });
      }

      const prepaidRiderCheck = canVendorProcessPrepaidOrder({
        paymentMethod: existingOrder.paymentMethod,
        paymentStatus: existingOrder.paymentStatus,
        paymentSplitMode: existingOrder.paymentSplitMode,
        nextStatus: 'rider_assigned',
      });
      if (!prepaidRiderCheck.allowed) {
        return res.status(400).json({ error: prepaidRiderCheck.reason });
      }

      const riderRows = await db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1);
      const isAdminCaller = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdminCaller) {
        const settingsRows = await db.select().from(platformSettings).limit(1);
        const financialConfig = mergeDeliveryFinancialConfig(settingsRows[0]?.deliveryFinancialConfig);
        const ledgerRows = await db
          .select()
          .from(riderWalletLedger)
          .where(eq(riderWalletLedger.riderUid, riderUid));
        const walletSummary = summarizeRiderWalletLedger(
          ledgerRows.map((e) => ({
            entryType: e.entryType,
            cashCollected: e.cashCollected,
            riderEarningDelta: e.riderEarningDelta,
            commissionOwedDelta: e.commissionOwedDelta,
            commissionSettledDelta: e.commissionSettledDelta,
          }))
        );
        const riderAcceptCheck = canRiderAcceptOrders({
          riderStatus: riderRows[0]?.status,
          outstandingCommission: walletSummary.outstandingCommission,
          settlementRules: financialConfig.settlementRules,
        });
        if (!riderAcceptCheck.allowed) {
          return res.status(403).json({ error: riderAcceptCheck.reason });
        }
      }

      const riderName = riderRows[0]?.fullName || req.user!.fullName;

      const updated = await db
        .update(orders)
        .set({
          riderUid,
          riderName,
          status: 'rider_assigned',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      await db.insert(orderStatusHistory).values({
        orderId,
        status: 'rider_assigned',
        note: `Rider ${riderName} accepted delivery assignment`,
        actorUid: riderUid,
      });

      await db.insert(notifications).values({
        recipientUid: existingOrder.customerUid,
        roleTarget: 'customer',
        title: 'Rider Assigned to Your Order',
        message: `${riderName} is assigned for ${existingOrder.orderNumber}. Track live rider GPS on your map.`,
        type: 'order',
        relatedOrderId: existingOrder.id,
      });

      const restOwnerRows = await db
        .select({ ownerUid: restaurants.ownerUid, email: restaurants.email })
        .from(restaurants)
        .where(eq(restaurants.id, updated[0].restaurantId))
        .limit(1);

      const riderAcceptRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (riderAcceptRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: riderAcceptRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: 'rider_assigned',
          statusNote: `Rider ${riderName} accepted delivery assignment`,
          riderName,
          riderPhone: riderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson,
        });
      }

      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: 'status_update',
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: `Rider ${riderName} accepted delivery assignment`,
        riderName,
        items: updated[0].itemsSnapshotJson,
      }).catch(() => []);

      broadcastOrderEvent('order:updated', {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: existingOrder.customerUid,
        roleTarget: 'customer',
        title: 'Rider Assigned to Your Order',
        message: `${riderName} is assigned for ${existingOrder.orderNumber}. Track live rider GPS on your map.`,
        type: 'order',
        relatedOrderId: existingOrder.id,
      });
      broadcastNotificationEvent({
        recipientUid: 'role-super_admin',
        roleTarget: 'super_admin',
        title: `Rider Assigned · ${existingOrder.orderNumber}`,
        message: `${riderName} accepted ${existingOrder.orderNumber} (${existingOrder.restaurantName}).`,
        type: 'order',
        relatedOrderId: existingOrder.id,
      });

      res.json({ order: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/rider/orders/:id/status',
  requireAuth,
  requireRole(['rider', 'admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['picked_up', 'on_the_way', 'delivered']),
      note: z.string().trim().max(300).optional(),
      pickupRating: z.enum(['good', 'bad']).optional(),
      proofPhotoUrl: z.string().trim().max(2000000).optional(),
      collectedCashAmount: z.number().nonnegative().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: 'Invalid rider status update' });
    }

    try {
      const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];

      const isAdmin = req.user!.role === 'super_admin' || req.user!.role === 'admin';
      if (!isAdmin && order.riderUid !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden: Order is assigned to another rider' });
      }
      const allowAssignedPickup =
        parsed.data.status === 'picked_up' &&
        Boolean(order.riderUid) &&
        ['confirmed', 'accepted', 'preparing', 'ready', 'rider_assigned'].includes(order.status);
      if (
        !allowAssignedPickup &&
        !canTransitionOrderStatus(order.status as OrderStatus, parsed.data.status)
      ) {
        return res
          .status(400)
          .json({ error: `Cannot change order from ${order.status} to ${parsed.data.status}` });
      }

      const prepaidCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: parsed.data.status,
      });
      if (!prepaidCheck.allowed) {
        return res.status(400).json({ error: prepaidCheck.reason });
      }

      const updated = await db
        .update(orders)
        .set({
          status: parsed.data.status,
          paymentStatus:
            parsed.data.status === 'delivered' && order.paymentMethod === 'cod'
              ? 'paid'
              : order.paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      const noteSegments = [
        `Rider updated status to ${parsed.data.status.replace(/_/g, ' ')}`,
        parsed.data.pickupRating ? `pickup experience: ${parsed.data.pickupRating}` : '',
        typeof parsed.data.collectedCashAmount === 'number'
          ? `cash collected: ৳${parsed.data.collectedCashAmount}`
          : '',
        parsed.data.proofPhotoUrl ? 'drop-off proof photo attached' : '',
        parsed.data.note ? parsed.data.note : '',
      ].filter(Boolean);

      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        status: parsed.data.status,
        note: noteSegments.join(' · ').slice(0, 480),
        actorUid: req.user!.uid,
      });

      const statusLabels: Record<string, string> = {
        picked_up: 'Order Picked Up',
        on_the_way: 'Rider Is On The Way',
        delivered: 'Order Delivered!',
      };
      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: statusLabels[parsed.data.status] || 'Delivery Update',
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, ' ')}.`,
        type: 'order',
        relatedOrderId: order.id,
      });

      if (parsed.data.status === 'delivered') {
        await settleOrderCommissionIdempotent(order.id);
        await recordRiderDeliveryWalletIdempotent(
          order.id,
          parsed.data.collectedCashAmount,
          req.user!.uid
        );
      }

      const restOwnerRows = await db
        .select({ ownerUid: restaurants.ownerUid, email: restaurants.email })
        .from(restaurants)
        .where(eq(restaurants.id, updated[0].restaurantId))
        .limit(1);

      const riderStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (riderStatusRecipient) {
        const assignedRiderRows = updated[0].riderUid
          ? await db
              .select({ phone: riders.phone })
              .from(riders)
              .where(eq(riders.uid, updated[0].riderUid))
              .limit(1)
          : [];
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: riderStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote: statusLabels[parsed.data.status] || 'Delivery Update',
          riderName: updated[0].riderName,
          riderPhone: assignedRiderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson,
        });
      }

      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: 'status_update',
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: statusLabels[parsed.data.status] || 'Delivery Update',
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson,
      }).catch(() => []);

      broadcastOrderEvent('order:updated', {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: 'customer',
        title: statusLabels[parsed.data.status] || 'Delivery Update',
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, ' ')}.`,
        type: 'order',
        relatedOrderId: order.id,
      });
      broadcastNotificationEvent({
        recipientUid: 'role-super_admin',
        roleTarget: 'super_admin',
        title: `${statusLabels[parsed.data.status] || 'Delivery Update'} · ${order.orderNumber}`,
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, ' ')}.`,
        type: 'order',
        relatedOrderId: order.id,
      });

      res.json({ order: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ---------- Media Upload Route (Product & Storefront Images) ----------

app.post(
  '/api/upload-image',
  requireAuth,
  async (req: AuthRequest, res) => {
    const schema = z.object({
      dataUrl: z.string().min(20),
      filename: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid image upload payload' });
    }

    const parsedImg = parseUploadedImageDataUrl(parsed.data.dataUrl, parsed.data.filename);
    if (!parsedImg.valid) {
      return res.status(400).json({ error: parsedImg.reason });
    }
    try {
      const ext = parsedImg.ext;
      const buffer = Buffer.from(parsedImg.base64Data, 'base64');
      if (buffer.byteLength > 8 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image must be 8 MB or smaller' });
      }
      const safeStem = (parsed.data.filename || 'food')
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .slice(0, 32) || 'food';
      const outName = `${safeStem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      if (process.env.VERCEL) {
        return res.status(201).json({
          imageUrl: `data:${parsedImg.mimeType};base64,${parsedImg.base64Data}`,
        });
      }
      const outPath = path.join(UPLOADS_DIR, outName);
      await fs.promises.writeFile(outPath, buffer);
      res.status(201).json({ imageUrl: `/uploads/${outName}` });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Image upload failed' });
    }
  }
);

// ---------- Super Admin Dashboard Routes ----------

app.get(
  '/api/admin/workspace',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req, res) => {
    try {
      const data = await getAdminWorkspace();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/admin/restaurants',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      name: z.string().min(2),
      nameBn: z.string().min(1),
      cuisine: z.string().min(2),
      area: z.string().min(2),
      address: z.string().min(3),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      phone: z.string().default('+8801710000000'),
      email: z.string().email().default('partner@foodora.bd'),
      description: z.string().default(''),
      logoUrl: z.string().default(''),
      coverUrl: z.string().default(IMG_BANGLA),
      deliveryFee: z.number().int().min(0).max(500).default(49),
      minOrder: z.number().int().min(0).max(10000).default(150),
      discountPct: z.number().int().min(0).max(90).default(0),
      openingHours: z.string().default('10:00 AM - 11:30 PM'),
      deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).default('platform'),
      commissionRate: z.string().default('15.00'),
      subscriptionPlan: z.enum(['free', 'basic', 'premium', 'enterprise']).default('basic'),
      isSponsored: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid restaurant creation payload' });
    }

    try {
      const slugBase = parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

      const inserted = await db
        .insert(restaurants)
        .values({
          ownerUid: req.user!.uid,
          name: parsed.data.name,
          nameBn: parsed.data.nameBn,
          slug,
          description: parsed.data.description || `${parsed.data.name} in ${parsed.data.area}, Bangladesh.`,
          cuisine: parsed.data.cuisine,
          area: parsed.data.area,
          address: parsed.data.address,
          lat: Number.isFinite(parsed.data.lat) ? (parsed.data.lat as number) : 23.7937,
          lng: Number.isFinite(parsed.data.lng) ? (parsed.data.lng as number) : 90.4066,
          phone: parsed.data.phone,
          email: parsed.data.email,
          logoUrl: parsed.data.logoUrl?.trim() || '',
          coverUrl: parsed.data.coverUrl || IMG_BANGLA,
          deliveryFee: parsed.data.deliveryFee,
          minOrder: parsed.data.minOrder,
          discountPct: parsed.data.discountPct,
          openingHours: parsed.data.openingHours,
          deliveryMode: parsed.data.deliveryMode,
          commissionRate: parsed.data.commissionRate,
          subscriptionPlan: parsed.data.subscriptionPlan,
          isSponsored: parsed.data.isSponsored,
          isNew: true,
          isOpen: true,
          status: 'approved',
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'restaurant_created',
        targetType: 'restaurant',
        targetId: String(inserted[0].id),
        details: JSON.stringify({ name: inserted[0].name, area: inserted[0].area }),
      });

      res.status(201).json({ restaurant: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/restaurants/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid restaurant ID' });

    const schema = z.object({
      name: z.string().min(2).optional(),
      nameBn: z.string().min(1).optional(),
      cuisine: z.string().min(2).optional(),
      area: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      description: z.string().optional(),
      logoUrl: z.string().optional(),
      coverUrl: z.string().optional(),
      deliveryFee: z.number().int().min(0).max(500).optional(),
      minOrder: z.number().int().min(0).max(10000).optional(),
      discountPct: z.number().int().min(0).max(90).optional(),
      openingHours: z.string().optional(),
      deliveryMode: z.enum(['platform', 'restaurant', 'third_party']).optional(),
      isOpen: z.boolean().optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
      commissionRate: z.string().optional(),
      commissionType: z.enum(['percentage', 'fixed']).optional(),
      fixedCommission: z.number().int().min(0).optional(),
      subscriptionPlan: z.enum(['free', 'basic', 'premium', 'enterprise']).optional(),
      isSponsored: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid admin restaurant update' });

    try {
      const rows = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
      const current = rows[0];

      const updated = await db
        .update(restaurants)
        .set({
          name: parsed.data.name ?? current.name,
          nameBn: parsed.data.nameBn ?? current.nameBn,
          cuisine: parsed.data.cuisine ?? current.cuisine,
          area: parsed.data.area ?? current.area,
          address: parsed.data.address ?? current.address,
          lat: parsed.data.lat ?? current.lat,
          lng: parsed.data.lng ?? current.lng,
          description: parsed.data.description ?? current.description,
          logoUrl: parsed.data.logoUrl !== undefined ? parsed.data.logoUrl.trim() : current.logoUrl,
          coverUrl: parsed.data.coverUrl || current.coverUrl,
          deliveryFee: parsed.data.deliveryFee ?? current.deliveryFee,
          minOrder: parsed.data.minOrder ?? current.minOrder,
          discountPct: parsed.data.discountPct ?? current.discountPct,
          openingHours: parsed.data.openingHours ?? current.openingHours,
          deliveryMode: parsed.data.deliveryMode ?? current.deliveryMode,
          isOpen: parsed.data.isOpen ?? current.isOpen,
          status: parsed.data.status ?? current.status,
          commissionRate: parsed.data.commissionRate ?? current.commissionRate,
          commissionType: parsed.data.commissionType ?? current.commissionType,
          fixedCommission: parsed.data.fixedCommission ?? current.fixedCommission,
          subscriptionPlan: parsed.data.subscriptionPlan ?? current.subscriptionPlan,
          isSponsored: parsed.data.isSponsored ?? current.isSponsored,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: `restaurant_update_${parsed.data.status || 'config'}`,
        targetType: 'restaurant',
        targetId: String(id),
        details: JSON.stringify(parsed.data),
      });

      res.json({ restaurant: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/admin/products',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      category: z.string().min(2),
      name: z.string().min(2),
      nameBn: z.string().min(1),
      description: z.string().default(''),
      imageUrl: z.string().default(IMG_BANGLA),
      price: z.number().int().positive(),
      discountPrice: z.number().int().positive().nullable().optional(),
      inStock: z.boolean().default(true),
      isAvailable: z.boolean().default(true),
      isVisibleOnStorefront: z.boolean().default(true),
      isPopular: z.boolean().default(false),
      variationsJson: z
        .array(z.object({ name: z.string(), priceDelta: z.number() }))
        .optional(),
      addonsJson: z
        .array(z.object({ name: z.string(), price: z.number() }))
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid product payload' });

    try {
      const restRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, parsed.data.restaurantId))
        .limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });

      const inserted = await db
        .insert(foodItems)
        .values({
          restaurantId: parsed.data.restaurantId,
          category: parsed.data.category.trim(),
          name: parsed.data.name.trim(),
          nameBn: parsed.data.nameBn.trim(),
          description: parsed.data.description,
          imageUrl: parsed.data.imageUrl.trim() || restRows[0].coverUrl || IMG_BANGLA,
          price: parsed.data.price,
          discountPrice: parsed.data.discountPrice ?? null,
          inStock: parsed.data.inStock,
          isAvailable: parsed.data.isAvailable,
          isVisibleOnStorefront: parsed.data.isVisibleOnStorefront,
          isPopular: parsed.data.isPopular,
          variationsJson:
            parsed.data.variationsJson && parsed.data.variationsJson.length > 0
              ? parsed.data.variationsJson
              : [{ name: 'Regular', priceDelta: 0 }],
          addonsJson: parsed.data.addonsJson ?? [],
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'product_created',
        targetType: 'food_item',
        targetId: String(inserted[0].id),
        details: JSON.stringify({
          name: inserted[0].name,
          restaurantId: inserted[0].restaurantId,
          isVisibleOnStorefront: inserted[0].isVisibleOnStorefront,
        }),
      });

      res.status(201).json({ product: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/products/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product ID' });

    const schema = z.object({
      restaurantId: z.number().int().positive().optional(),
      category: z.string().min(2).optional(),
      name: z.string().min(2).optional(),
      nameBn: z.string().min(1).optional(),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      price: z.number().int().positive().optional(),
      discountPrice: z.number().int().positive().nullable().optional(),
      inStock: z.boolean().optional(),
      isAvailable: z.boolean().optional(),
      isVisibleOnStorefront: z.boolean().optional(),
      isPopular: z.boolean().optional(),
      variationsJson: z
        .array(z.object({ name: z.string(), priceDelta: z.number() }))
        .optional(),
      addonsJson: z
        .array(z.object({ name: z.string(), price: z.number() }))
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid product update payload' });

    try {
      const existing = await db.select().from(foodItems).where(eq(foodItems.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Product not found' });
      const cur = existing[0];

      const updated = await db
        .update(foodItems)
        .set({
          restaurantId: parsed.data.restaurantId ?? cur.restaurantId,
          category: parsed.data.category?.trim() || cur.category,
          name: parsed.data.name?.trim() || cur.name,
          nameBn: parsed.data.nameBn?.trim() || cur.nameBn,
          description: parsed.data.description ?? cur.description,
          imageUrl: parsed.data.imageUrl?.trim() || cur.imageUrl,
          price: parsed.data.price ?? cur.price,
          discountPrice:
            parsed.data.discountPrice === undefined ? cur.discountPrice : parsed.data.discountPrice,
          inStock: parsed.data.inStock ?? cur.inStock,
          isAvailable: parsed.data.isAvailable ?? cur.isAvailable,
          isVisibleOnStorefront:
            parsed.data.isVisibleOnStorefront ?? cur.isVisibleOnStorefront,
          isPopular: parsed.data.isPopular ?? cur.isPopular,
          variationsJson: parsed.data.variationsJson ?? cur.variationsJson,
          addonsJson: parsed.data.addonsJson ?? cur.addonsJson,
          updatedAt: new Date(),
        })
        .where(eq(foodItems.id, id))
        .returning();

      const visibilityChanged =
        parsed.data.isVisibleOnStorefront !== undefined &&
        parsed.data.isVisibleOnStorefront !== cur.isVisibleOnStorefront;

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: visibilityChanged ? 'product_visibility_toggled' : 'product_updated',
        targetType: 'food_item',
        targetId: String(id),
        details: JSON.stringify({
          name: updated[0].name,
          price: updated[0].price,
          isVisibleOnStorefront: updated[0].isVisibleOnStorefront,
        }),
      });

      res.json({ product: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  '/api/admin/products/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product ID' });

    try {
      const deleted = await db.delete(foodItems).where(eq(foodItems.id, id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: 'Product not found' });

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'product_deleted',
        targetType: 'food_item',
        targetId: String(id),
        details: JSON.stringify({ name: deleted[0].name }),
      });

      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/orders/:id/status',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum([
        'confirmed',
        'accepted',
        'preparing',
        'ready',
        'rider_assigned',
        'picked_up',
        'on_the_way',
        'delivered',
        'cancelled',
      ]),
      riderUid: z.string().nullable().optional(),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: 'Invalid admin order status payload' });
    }

    try {
      const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const order = rows[0];

      let nextRiderUid = order.riderUid;
      let nextRiderName = order.riderName;
      if (parsed.data.riderUid !== undefined) {
        if (parsed.data.riderUid === null || parsed.data.riderUid === '') {
          nextRiderUid = null;
          nextRiderName = null;
        } else {
          const riderRows = await db
            .select()
            .from(riders)
            .where(eq(riders.uid, parsed.data.riderUid))
            .limit(1);
          nextRiderUid = parsed.data.riderUid;
          nextRiderName = riderRows[0]?.fullName || parsed.data.riderUid;
        }
      }

      const updated = await db.transaction(async (tx) => {
        const nextPaymentStatus =
          parsed.data.status === 'delivered' && order.paymentMethod === 'cod'
            ? 'paid'
            : parsed.data.status === 'cancelled'
            ? order.paymentStatus === 'paid'
              ? 'refunded'
              : 'failed'
            : order.paymentStatus;

        const rows = await tx
          .update(orders)
          .set({
            status: parsed.data.status,
            riderUid: nextRiderUid,
            riderName: nextRiderName,
            paymentStatus: nextPaymentStatus,
            cancelReason:
              parsed.data.status === 'cancelled'
                ? parsed.data.note || 'Cancelled by Admin'
                : order.cancelReason,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId))
          .returning();

        await tx.insert(orderStatusHistory).values({
          orderId,
          status: parsed.data.status,
          note: parsed.data.note || `Admin updated status to ${parsed.data.status.replace(/_/g, ' ')}`,
          actorUid: req.user!.uid,
        });

        if (parsed.data.status === 'cancelled') {
          await reverseOrderSplitFinancialsTx(
            tx,
            order,
            parsed.data.note || 'Cancelled by Admin'
          );
        }

        return rows;
      });

      if (parsed.data.status === 'delivered') {
        await settleOrderCommissionIdempotent(orderId);
        await recordRiderDeliveryWalletIdempotent(orderId, undefined, req.user!.uid);
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'order_override',
        targetType: 'order',
        targetId: String(orderId),
        details: JSON.stringify(parsed.data),
      });

      const restOwnerRows = await db
        .select({ ownerUid: restaurants.ownerUid, email: restaurants.email })
        .from(restaurants)
        .where(eq(restaurants.id, updated[0].restaurantId))
        .limit(1);

      const adminStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (adminStatusRecipient) {
        const assignedRiderRows = updated[0].riderUid
          ? await db
              .select({ phone: riders.phone })
              .from(riders)
              .where(eq(riders.uid, updated[0].riderUid))
              .limit(1)
          : [];
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: adminStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote:
            parsed.data.note || `Order update: ${parsed.data.status.replace(/_/g, ' ')}`,
          riderName: updated[0].riderName,
          riderPhone: assignedRiderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson,
        });
      }

      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: 'status_update',
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: parsed.data.note || `Order update: ${parsed.data.status.replace(/_/g, ' ')}`,
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson,
      }).catch(() => []);

      broadcastOrderEvent('order:updated', {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: updated[0].customerUid,
        roleTarget: 'customer',
        title: `Order ${updated[0].orderNumber}: ${parsed.data.status.replace('_', ' ')}`,
        message: parsed.data.note || `${updated[0].restaurantName} order updated.`,
        type: 'order',
        relatedOrderId: updated[0].id,
      });
      if (restOwnerRows[0]?.ownerUid) {
        broadcastNotificationEvent({
          recipientUid: restOwnerRows[0].ownerUid,
          roleTarget: 'restaurant_owner',
          title: `Order ${updated[0].orderNumber}: ${parsed.data.status.replace('_', ' ')}`,
          message: `Order status updated to ${parsed.data.status.replace('_', ' ')}.`,
          type: 'order',
          relatedOrderId: updated[0].id,
        });
      }

      res.json({ order: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/orders/:id/refund',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (rows.length === 0) throw new Error('Order not found');
        const order = rows[0];

        const updated = await tx
          .update(orders)
          .set({
            status: 'cancelled',
            paymentStatus: order.paymentStatus === 'paid' ? 'refunded' : 'failed',
            cancelReason: req.body.reason || 'Cancelled & refunded by Super Admin',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        const existingReversal = await tx
          .select()
          .from(commissionLedger)
          .where(
            and(
              eq(commissionLedger.orderId, order.id),
              eq(commissionLedger.entryType, 'commission_reversal')
            )
          )
          .limit(1);

        if (existingReversal.length === 0 && order.platformCommission > 0) {
          await tx.insert(commissionLedger).values({
            orderId: order.id,
            restaurantId: order.restaurantId,
            entryType: 'commission_reversal',
            grossAmount: -Math.max(0, order.subtotal - order.discountAmount),
            commissionAmount: -order.platformCommission,
            netRestaurantAmount: -order.restaurantEarnings,
            deliveryFeeAmount: -order.deliveryFee,
            note: `Refund reversal for ${order.orderNumber}`,
          });
        }

        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          status: 'cancelled',
          note: 'Order cancelled and commission reversed by Super Admin',
          actorUid: req.user!.uid,
        });

        await reverseOrderSplitFinancialsTx(
          tx,
          order,
          req.body.reason || 'Cancelled & refunded by Super Admin'
        );

        await tx.insert(auditLogs).values({
          actorUid: req.user!.uid,
          action: 'order_refund',
          targetType: 'order',
          targetId: String(order.id),
          details: JSON.stringify({ orderNumber: order.orderNumber }),
        });

        return updated[0];
      });

      const restOwnerRows = await db
        .select({ ownerUid: restaurants.ownerUid, email: restaurants.email })
        .from(restaurants)
        .where(eq(restaurants.id, result.restaurantId))
        .limit(1);

      const refundRecipient = await resolveCustomerEmailForOrder(
        result.customerEmail,
        result.customerUid
      );
      if (refundRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: result.id,
          orderNumber: result.orderNumber,
          trackingToken: result.trackingToken,
          customerName: result.customerName,
          customerEmail: refundRecipient,
          restaurantName: result.restaurantName,
          deliveryArea: result.deliveryArea,
          deliveryAddress: result.deliveryAddress,
          subtotal: result.subtotal,
          discountAmount: result.discountAmount,
          couponCode: result.couponCode,
          deliveryFee: result.deliveryFee,
          serviceFee: result.serviceFee,
          taxAmount: result.taxAmount,
          totalAmount: result.totalAmount,
          paymentMethod: result.paymentMethod,
          paymentStatus: result.paymentStatus,
          paymentSplitMode: result.paymentSplitMode,
          onlineFoodPaidAmount: result.onlineFoodPaidAmount,
          cashDueToRider: result.cashDueToRider,
          status: result.status,
          statusEvent: 'cancelled',
          statusNote: result.cancelReason || 'Order cancelled & refunded by Admin',
          riderName: result.riderName,
          etaMinutes: result.estimatedMinutes,
          createdAt: result.createdAt,
          items: result.itemsSnapshotJson,
        });
      }

      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: result.id,
        orderNumber: result.orderNumber,
        trackingToken: result.trackingToken,
        eventKind: 'status_update',
        restaurantName: result.restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: result.customerName,
        customerPhone: result.customerPhone,
        deliveryArea: result.deliveryArea,
        deliveryAddress: result.deliveryAddress,
        totalAmount: result.totalAmount,
        paymentMethod: result.paymentMethod,
        paymentStatus: result.paymentStatus,
        status: result.status,
        statusNote: result.cancelReason || 'Order cancelled & refunded by Admin',
        riderName: result.riderName,
        items: result.itemsSnapshotJson,
      }).catch(() => []);

      broadcastOrderEvent('order:updated', {
        orderId: result.id,
        orderNumber: result.orderNumber,
        restaurantId: result.restaurantId,
        restaurantName: result.restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: result.customerUid,
        riderUid: result.riderUid,
        riderName: result.riderName,
        status: result.status,
        deliveryMode: result.deliveryMode,
        deliveryArea: result.deliveryArea,
        totalAmount: result.totalAmount,
      });
      broadcastNotificationEvent({
        recipientUid: result.customerUid,
        roleTarget: 'customer',
        title: `Order ${result.orderNumber}: Cancelled & Refunded`,
        message: result.cancelReason || `${result.restaurantName} order cancelled and refunded.`,
        type: 'order',
        relatedOrderId: result.id,
      });
      if (restOwnerRows[0]?.ownerUid) {
        broadcastNotificationEvent({
          recipientUid: restOwnerRows[0].ownerUid,
          roleTarget: 'restaurant_owner',
          title: `Order ${result.orderNumber}: Cancelled`,
          message: result.cancelReason || 'Order cancelled and commission reversed by Admin.',
          type: 'order',
          relatedOrderId: result.id,
        });
      }

      res.json({ order: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/payouts/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid payout ID' });
    const status = req.body.status === 'rejected' ? 'rejected' : 'paid';

    try {
      const updated = await db
        .update(restaurantPayouts)
        .set({
          status,
          referenceId: status === 'paid' ? `PAY-${Date.now().toString(36).toUpperCase()}` : '',
          processedAt: new Date(),
        })
        .where(eq(restaurantPayouts.id, id))
        .returning();
      if (updated.length === 0) return res.status(404).json({ error: 'Payout not found' });

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: `payout_${status}`,
        targetType: 'payout',
        targetId: String(id),
        details: JSON.stringify({ amount: updated[0].amount }),
      });

      res.json({ payout: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/admin/coupons',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      code: z.string().min(3).max(24),
      title: z.string().min(3),
      type: z.enum(['percentage', 'fixed', 'free_delivery']),
      value: z.number().int().min(0),
      minOrder: z.number().int().min(0).default(0),
      maxDiscount: z.number().int().min(0).default(300),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid coupon data' });

    try {
      const inserted = await db
        .insert(coupons)
        .values({
          code: parsed.data.code.trim().toUpperCase(),
          title: parsed.data.title,
          type: parsed.data.type,
          value: parsed.data.value,
          minOrder: parsed.data.minOrder,
          maxDiscount: parsed.data.maxDiscount,
          isActive: true,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'coupon_created',
        targetType: 'coupon',
        targetId: String(inserted[0].id),
        details: JSON.stringify({ code: inserted[0].code }),
      });

      res.status(201).json({ coupon: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/coupons/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid coupon ID' });

    try {
      const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Coupon not found' });
      const updated = await db
        .update(coupons)
        .set({
          isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : rows[0].isActive,
        })
        .where(eq(coupons.id, id))
        .returning();
      res.json({ coupon: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  '/api/admin/coupons/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid coupon ID' });

    try {
      await db.delete(coupons).where(eq(coupons.id, id));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/settings',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const existing = await db.select().from(platformSettings).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Settings missing' });
      const cur = existing[0];
      const curStorefront =
        cur.storefrontConfig && typeof cur.storefrontConfig === 'object' ? cur.storefrontConfig : {};
      const nextStorefront =
        req.body.storefrontConfig && typeof req.body.storefrontConfig === 'object'
          ? { ...curStorefront, ...req.body.storefrontConfig }
          : curStorefront;

      const updated = await db
        .update(platformSettings)
        .set({
          platformName:
            typeof req.body.platformName === 'string' && req.body.platformName.trim()
              ? req.body.platformName.trim()
              : cur.platformName,
          defaultCommissionPct: req.body.defaultCommissionPct ?? cur.defaultCommissionPct,
          defaultDeliveryFee:
            typeof req.body.defaultDeliveryFee === 'number'
              ? req.body.defaultDeliveryFee
              : cur.defaultDeliveryFee,
          serviceFee:
            typeof req.body.serviceFee === 'number' ? req.body.serviceFee : cur.serviceFee,
          minOrderDefault:
            typeof req.body.minOrderDefault === 'number'
              ? req.body.minOrderDefault
              : cur.minOrderDefault,
          pathaoEnabled: req.body.pathaoEnabled ?? cur.pathaoEnabled,
          pathaoSandbox: req.body.pathaoSandbox ?? cur.pathaoSandbox,
          bkashEnabled: req.body.bkashEnabled ?? cur.bkashEnabled,
          bkashSandbox: req.body.bkashSandbox ?? cur.bkashSandbox,
          sslcommerzEnabled: req.body.sslcommerzEnabled ?? cur.sslcommerzEnabled,
          sslcommerzSandbox: req.body.sslcommerzSandbox ?? cur.sslcommerzSandbox,
          storefrontConfig: nextStorefront,
          updatedAt: new Date(),
        })
        .where(eq(platformSettings.id, cur.id))
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'platform_settings_updated',
        targetType: 'platform_settings',
        targetId: String(cur.id),
        details: JSON.stringify(req.body),
      });

      res.json({ settings: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/users/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user ID' });

    const allowedRoles = ['customer', 'restaurant_owner', 'rider', 'admin', 'super_admin'];
    try {
      const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'User not found' });
      const target = existing[0];
      const nextStatus =
        req.body.status === 'suspended' || req.body.status === 'active'
          ? req.body.status
          : target.status;
      const nextRole =
        typeof req.body.role === 'string' && allowedRoles.includes(req.body.role)
          ? req.body.role
          : target.role;

      const decision = canActorModifyUserAccount({
        actorUid: req.user!.uid,
        actorRole: req.user!.role,
        targetUid: target.uid,
        targetEmail: target.email,
        currentRole: target.role,
        nextRole,
        nextStatus,
      });
      if (!decision.allowed) {
        return res.status(403).json({ error: decision.reason || 'Forbidden: Role change not permitted.' });
      }

      const updated = await db
        .update(users)
        .set({ status: nextStatus, role: nextRole, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'user_updated',
        targetType: 'user',
        targetId: String(id),
        details: JSON.stringify({ role: nextRole, status: nextStatus }),
      });

      res.json({ user: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/riders/:id',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid rider ID' });

    const schema = z.object({
      status: z.enum(['pending', 'approved', 'suspended']).optional(),
      isAvailable: z.boolean().optional(),
      zone: z.string().trim().min(2).max(120).optional(),
      vehicleType: z.string().trim().min(2).max(40).optional(),
      currentLat: z.number().min(-90).max(90).optional(),
      currentLng: z.number().min(-180).max(180).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid rider update payload' });
    }

    try {
      const existing = await db.select().from(riders).where(eq(riders.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Rider not found' });
      const cur = existing[0];

      const hasCoords =
        typeof parsed.data.currentLat === 'number' || typeof parsed.data.currentLng === 'number';
      const nextStatus = parsed.data.status ?? cur.status;
      const nextIsAvailable =
        typeof parsed.data.isAvailable === 'boolean'
          ? parsed.data.isAvailable
          : parsed.data.status === 'approved' && cur.status === 'pending'
          ? true
          : parsed.data.status === 'suspended'
          ? false
          : cur.isAvailable;

      const updated = await db
        .update(riders)
        .set({
          status: nextStatus,
          isAvailable: nextIsAvailable,
          zone: parsed.data.zone ? parsed.data.zone : cur.zone,
          vehicleType: parsed.data.vehicleType ? parsed.data.vehicleType : cur.vehicleType,
          currentLat:
            typeof parsed.data.currentLat === 'number'
              ? Math.round(parsed.data.currentLat * 1e6) / 1e6
              : cur.currentLat,
          currentLng:
            typeof parsed.data.currentLng === 'number'
              ? Math.round(parsed.data.currentLng * 1e6) / 1e6
              : cur.currentLng,
          locationUpdatedAt: hasCoords ? new Date() : cur.locationUpdatedAt,
        })
        .where(eq(riders.id, id))
        .returning();

      if (parsed.data.status && parsed.data.status !== cur.status) {
        const statusTitle =
          parsed.data.status === 'approved'
            ? `Rider Account Approved · ${updated[0].zone}`
            : parsed.data.status === 'suspended'
            ? 'Rider Account Suspended'
            : 'Rider Status Set to Pending';
        const statusMsg =
          parsed.data.status === 'approved'
            ? `Welcome! You are now approved to accept deliveries in ${updated[0].zone}.`
            : parsed.data.status === 'suspended'
            ? 'Your rider dispatch access has been suspended by Admin.'
            : 'Your rider application is under Admin review.';

        await db.insert(notifications).values({
          recipientUid: updated[0].uid,
          roleTarget: 'rider',
          title: statusTitle,
          message: statusMsg,
          type: 'system',
        });
        broadcastNotificationEvent({
          recipientUid: updated[0].uid,
          roleTarget: 'rider',
          title: statusTitle,
          message: statusMsg,
          type: 'system',
        });
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: hasCoords ? 'rider_gps_override' : 'rider_updated',
        targetType: 'rider',
        targetId: String(id),
        details: JSON.stringify(parsed.data),
      });

      res.json({ rider: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/admin/delivery-financial-config',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const existing = await db.select().from(platformSettings).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Platform settings missing' });
      const cur = existing[0];
      const currentMerged = mergeDeliveryFinancialConfig(cur.deliveryFinancialConfig);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const nextConfig = mergeDeliveryFinancialConfig({
        zoneFees: { ...currentMerged.zoneFees, ...(body.zoneFees || {}) },
        distancePricing: { ...currentMerged.distancePricing, ...(body.distancePricing || {}) },
        riderEarningRule: { ...currentMerged.riderEarningRule, ...(body.riderEarningRule || {}) },
        settlementRules: { ...currentMerged.settlementRules, ...(body.settlementRules || {}) },
      });

      await db
        .update(platformSettings)
        .set({
          deliveryFinancialConfig: nextConfig as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(platformSettings.id, cur.id));

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'delivery_financial_config_updated',
        targetType: 'platform_settings',
        targetId: String(cur.id),
        details: JSON.stringify(nextConfig),
      });

      res.json({ deliveryFinancialConfig: nextConfig });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update delivery financial config' });
    }
  }
);

app.post(
  '/api/admin/riders/:uid/settle-commission',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const riderUid = String(req.params.uid || '').trim();
    const schema = z.object({
      amount: z.number().int().positive(),
      method: z.string().trim().min(2).max(40).default('cash'),
      referenceId: z.string().trim().max(80).optional(),
      note: z.string().trim().max(240).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!riderUid || !parsed.success) {
      return res.status(400).json({ error: 'Valid positive settlement amount required' });
    }

    try {
      const riderRows = await db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1);
      if (riderRows.length === 0) return res.status(404).json({ error: 'Rider not found' });

      const existingEntries = await db
        .select()
        .from(riderWalletLedger)
        .where(eq(riderWalletLedger.riderUid, riderUid));
      const summaryBefore = summarizeRiderWalletLedger(
        existingEntries.map((e) => ({
          entryType: e.entryType,
          cashCollected: e.cashCollected,
          riderEarningDelta: e.riderEarningDelta,
          commissionOwedDelta: e.commissionOwedDelta,
          commissionSettledDelta: e.commissionSettledDelta,
        }))
      );

      if (summaryBefore.outstandingCommission <= 0) {
        return res.status(400).json({ error: 'This rider has no outstanding Foodora commission owed.' });
      }
      if (parsed.data.amount > summaryBefore.outstandingCommission) {
        return res.status(400).json({
          error: `Settlement amount (৳${parsed.data.amount}) exceeds outstanding commission owed (৳${summaryBefore.outstandingCommission}).`,
        });
      }

      const ref =
        parsed.data.referenceId?.trim() ||
        `STL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const idempotencyKey = `settle:${riderUid}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;

      const inserted = await db
        .insert(riderWalletLedger)
        .values({
          riderUid,
          orderId: null,
          orderNumber: '',
          entryType: 'commission_settled',
          idempotencyKey,
          cashCollected: 0,
          riderEarningDelta: 0,
          commissionOwedDelta: 0,
          commissionSettledDelta: parsed.data.amount,
          referenceId: ref,
          note:
            parsed.data.note?.trim() ||
            `Commission settled (${parsed.data.method}) · Recorded by Admin`,
        })
        .returning();

      await db.insert(notifications).values({
        recipientUid: riderUid,
        roleTarget: 'rider',
        title: `Commission Settled · ৳${parsed.data.amount}`,
        message: `Admin recorded your Foodora commission settlement of ৳${parsed.data.amount} (${ref}).`,
        type: 'system',
      });
      broadcastNotificationEvent({
        recipientUid: riderUid,
        roleTarget: 'rider',
        title: `Commission Settled · ৳${parsed.data.amount}`,
        message: `Admin recorded your Foodora commission settlement of ৳${parsed.data.amount} (${ref}).`,
        type: 'system',
      });

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'rider_commission_settled',
        targetType: 'rider',
        targetId: riderUid,
        details: JSON.stringify({ amount: parsed.data.amount, method: parsed.data.method, referenceId: ref }),
      });

      const updatedSummary = summarizeRiderWalletLedger([
        ...existingEntries.map((e) => ({
          entryType: e.entryType,
          cashCollected: e.cashCollected,
          riderEarningDelta: e.riderEarningDelta,
          commissionOwedDelta: e.commissionOwedDelta,
          commissionSettledDelta: e.commissionSettledDelta,
        })),
        {
          entryType: 'commission_settled',
          cashCollected: 0,
          riderEarningDelta: 0,
          commissionOwedDelta: 0,
          commissionSettledDelta: parsed.data.amount,
        },
      ]);

      res.status(201).json({
        entry: inserted[0],
        walletSummary: updatedSummary,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to settle rider commission' });
    }
  }
);

app.get(
  '/api/admin/transactions',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req: AuthRequest, res) => {
    try {
      const [txRows, walletRows] = await Promise.all([
        db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.id)).limit(250),
        db.select().from(riderWalletLedger).orderBy(desc(riderWalletLedger.id)).limit(250),
      ]);
      res.json({ paymentTransactions: txRows, riderWalletLedger: walletRows });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load financial transactions' });
    }
  }
);

// ---------- Super Admin Extensible Payment Gateway Integrations (bKash, Nagad, SSLCommerz & Future Gateways) ----------

app.get(
  '/api/admin/payment-gateways',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const origin = getRequestOrigin(req);
      const rows = await ensureDefaultPaymentGateways();
      res.json({
        paymentGateways: rows.map((r) =>
          toAdminPaymentGatewayView(r, origin, isEnvConfiguredForGateway(r.code))
        ),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load payment gateways' });
    }
  }
);

app.put(
  '/api/admin/payment-gateways',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().min(2).max(60),
      nameBn: z.string().min(1).max(60).optional(),
      providerType: z.enum(['mfs', 'card', 'wallet', 'cod', 'custom']).default('mfs'),
      mode: z.enum(['sandbox', 'live']).default('sandbox'),
      isActive: z.boolean().default(true),
      apiBaseUrl: z.string().max(240).optional().default(''),
      merchantId: z.string().max(120).optional().default(''),
      apiKey: z.string().max(240).optional(),
      apiSecret: z.string().max(240).optional(),
      webhookSecret: z.string().max(240).optional(),
      instructions: z.string().max(300).optional().default(''),
      sortOrder: z.number().int().min(1).max(100).optional().default(10),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payment gateway configuration payload' });
    }

    const code = normalizeGatewayCode(parsed.data.code);
    if (code.length < 2) {
      return res.status(400).json({ error: 'Gateway code must contain at least 2 alphanumeric characters' });
    }

    try {
      await ensureDefaultPaymentGateways();
      const existing = await db
        .select()
        .from(paymentGateways)
        .where(eq(paymentGateways.code, code))
        .limit(1);

      const keepOrReplaceSecret = (incoming: string | undefined, prev: string | null | undefined) => {
        if (incoming === undefined) return prev || '';
        const clean = incoming.trim();
        if (!clean || clean.startsWith('••••')) return prev || '';
        return clean;
      };

      const cur = existing[0];
      const nextValues = {
        code,
        name: parsed.data.name.trim(),
        nameBn: parsed.data.nameBn?.trim() || parsed.data.name.trim(),
        providerType: parsed.data.providerType,
        mode: code === 'cod' ? 'live' : parsed.data.mode,
        isActive: parsed.data.isActive,
        apiBaseUrl: parsed.data.apiBaseUrl.trim(),
        merchantId: parsed.data.merchantId.trim(),
        apiKey: keepOrReplaceSecret(parsed.data.apiKey, cur?.apiKey),
        apiSecret: keepOrReplaceSecret(parsed.data.apiSecret, cur?.apiSecret),
        webhookSecret: keepOrReplaceSecret(parsed.data.webhookSecret, cur?.webhookSecret),
        instructions: parsed.data.instructions.trim(),
        sortOrder: parsed.data.sortOrder,
        updatedAt: new Date(),
      };

      const saved = await db
        .insert(paymentGateways)
        .values(nextValues)
        .onConflictDoUpdate({
          target: paymentGateways.code,
          set: nextValues,
        })
        .returning();

      if (code === 'bkash' || code === 'sslcommerz') {
        const settingsRows = await db.select().from(platformSettings).limit(1);
        if (settingsRows.length > 0) {
          await db
            .update(platformSettings)
            .set(
              code === 'bkash'
                ? {
                    bkashEnabled: nextValues.isActive,
                    bkashSandbox: nextValues.mode !== 'live',
                    updatedAt: new Date(),
                  }
                : {
                    sslcommerzEnabled: nextValues.isActive,
                    sslcommerzSandbox: nextValues.mode !== 'live',
                    updatedAt: new Date(),
                  }
            )
            .where(eq(platformSettings.id, settingsRows[0].id));
        }
      }

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: cur ? 'payment_gateway_updated' : 'payment_gateway_created',
        targetType: 'payment_gateway',
        targetId: code,
        details: JSON.stringify({
          name: nextValues.name,
          mode: nextValues.mode,
          isActive: nextValues.isActive,
          providerType: nextValues.providerType,
        }),
      });

      res.json({
        paymentGateway: toAdminPaymentGatewayView(
          saved[0],
          getRequestOrigin(req),
          isEnvConfiguredForGateway(code)
        ),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save payment gateway' });
    }
  }
);

app.post(
  '/api/admin/payment-gateways/:code/test',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const code = normalizeGatewayCode(String(req.params.code || ''));
    if (!code) return res.status(400).json({ error: 'Invalid gateway code' });
    try {
      await ensureDefaultPaymentGateways();
      const rows = await db
        .select()
        .from(paymentGateways)
        .where(eq(paymentGateways.code, code))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Gateway not found' });
      const result = validatePaymentGatewayConfiguration(
        rows[0],
        isEnvConfiguredForGateway(code)
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gateway test failed' });
    }
  }
);

app.delete(
  '/api/admin/payment-gateways/:code',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const code = normalizeGatewayCode(String(req.params.code || ''));
    if (!code) return res.status(400).json({ error: 'Invalid gateway code' });
    if (['bkash', 'nagad', 'sslcommerz', 'cod'].includes(code)) {
      return res.status(400).json({
        error: 'Built-in gateways cannot be deleted. Disable them instead.',
      });
    }
    try {
      await db.delete(paymentGateways).where(eq(paymentGateways.code, code));
      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'payment_gateway_deleted',
        targetType: 'payment_gateway',
        targetId: code,
        details: `Removed custom payment gateway ${code}`,
      });
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete payment gateway' });
    }
  }
);

// ---------- Super Admin Backend Control (DB Diagnostics, Broadcasts, Maintenance & Backup) ----------

app.get(
  '/api/admin/backend/status',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req, res) => {
    const started = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      const latencyMs = Math.max(1, Date.now() - started);

      const [
        usersCount,
        restaurantsCount,
        foodItemsCount,
        ordersCount,
        ridersCount,
        couponsCount,
        notificationsCount,
        ledgerCount,
        auditCount,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(restaurants),
        db.select({ count: sql<number>`count(*)::int` }).from(foodItems),
        db.select({ count: sql<number>`count(*)::int` }).from(orders),
        db.select({ count: sql<number>`count(*)::int` }).from(riders),
        db.select({ count: sql<number>`count(*)::int` }).from(coupons),
        db.select({ count: sql<number>`count(*)::int` }).from(notifications),
        db.select({ count: sql<number>`count(*)::int` }).from(commissionLedger),
        db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
      ]);

      const connStr =
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.SUPABASE_DB_URL ||
        '';
      const databaseProvider = connStr
        ? 'supabase-or-external-url'
        : process.env.SQL_HOST
        ? 'cloudsql-pg'
        : 'local-pg';
      const sslActive =
        Boolean(connStr) && !connStr.includes('localhost') && !connStr.includes('127.0.0.1');

      const emailStatus = await getEmailTransportStatus();

      res.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
        databaseProvider,
        sslActive,
        integrations: {
          databaseConfigured: Boolean(connStr || process.env.SQL_HOST),
          supabaseAuthConfigured: Boolean(
            process.env.SUPABASE_URL ||
              process.env.VITE_SUPABASE_URL ||
              'https://uvqptlflvdtxbrqiztzi.supabase.co'
          ),
          googleMapsConfigured: Boolean(
            process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY
          ),
          bkashLiveConfigured: Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET),
          sslcommerzLiveConfigured: Boolean(
            process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWD
          ),
          pathaoLiveConfigured: Boolean(
            process.env.PATHAO_CLIENT_ID && process.env.PATHAO_CLIENT_SECRET
          ),
          emailConfigured: emailStatus.configured,
          emailProvider: emailStatus.provider,
        },
        tableCounts: {
          users: Number(usersCount[0]?.count ?? 0),
          restaurants: Number(restaurantsCount[0]?.count ?? 0),
          foodItems: Number(foodItemsCount[0]?.count ?? 0),
          orders: Number(ordersCount[0]?.count ?? 0),
          riders: Number(ridersCount[0]?.count ?? 0),
          coupons: Number(couponsCount[0]?.count ?? 0),
          notifications: Number(notificationsCount[0]?.count ?? 0),
          commissionLedger: Number(ledgerCount[0]?.count ?? 0),
          auditLogs: Number(auditCount[0]?.count ?? 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Database health check failed' });
    }
  }
);

app.get(
  '/api/admin/seo-check',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req, res) => {
    try {
      const origin = getRequestOrigin(req);
      const [settings, approved] = await Promise.all([
        getPlatformSettingsRow(),
        getApprovedRestaurants(),
      ]);
      const sc = mergeStorefrontConfig(settings?.storefrontConfig);
      const verificationToken = (
        sc.googleSiteVerification ||
        process.env.GOOGLE_SITE_VERIFICATION ||
        ''
      ).trim();
      const sitemapXml = buildSitemapXml(
        origin,
        approved.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }))
      );
      const robotsTxt = buildRobotsTxt(origin);
      res.json({
        ok: true,
        origin,
        sitemapUrl: `${origin}/sitemap.xml`,
        robotsUrl: `${origin}/robots.txt`,
        indexedUrls: approved.length + 1,
        googleVerificationConfigured: Boolean(verificationToken),
        verificationPreview: verificationToken
          ? `${verificationToken.slice(0, 6)}...`
          : '',
        sitemapBytes: sitemapXml.length,
        robotsOk: robotsTxt.includes('Sitemap:'),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'SEO verification check failed' });
    }
  }
);

app.get(
  '/api/admin/email-settings',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req, res) => {
    try {
      const settings = await getAdminEmailSettingsView();
      res.json({ settings });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load email settings' });
    }
  }
);

app.put(
  '/api/admin/email-settings',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      provider: z.enum(['gmail', 'smtp', 'resend']),
      smtpHost: z.string().trim().max(200).optional(),
      smtpPort: z.number().int().min(1).max(65535).optional(),
      smtpSecure: z.boolean().optional(),
      smtpUser: z.string().trim().max(200).optional(),
      smtpPass: z.string().max(200).optional(),
      fromAddress: z.string().trim().max(200).optional(),
      notifyEmail: z.string().trim().email().or(z.literal('')).optional(),
      resendApiKey: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid email transport configuration payload' });
    }
    try {
      const saved = await saveAdminEmailSettings(parsed.data);
      const verification = saved.configured
        ? await verifyEmailTransportConnection()
        : { ok: false, message: 'Credentials incomplete', error: undefined };
      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'email_settings_updated',
        targetType: 'email_transport',
        targetId: saved.provider,
        details: `Updated email delivery provider to ${saved.provider} (configured: ${saved.configured}, verified: ${verification.ok})`,
      });
      res.json({
        ok: true,
        settings: saved,
        verified: verification.ok,
        verifyMessage: verification.message,
        verifyError: verification.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save email settings' });
    }
  }
);

app.post(
  '/api/admin/email-settings/verify',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req, res) => {
    try {
      const result = await verifyEmailTransportConnection();
      if (!result.ok) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message || 'SMTP verification failed' });
    }
  }
);

app.post(
  '/api/admin/email-settings/test',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      to: z.string().trim().email(),
      templateStatus: z.string().trim().max(40).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please enter a valid recipient email address.' });
    }
    try {
      const result = await sendTestEmail(
        parsed.data.to,
        parsed.data.templateStatus,
        getRequestOrigin(req)
      );
      if (!result.ok) {
        return res.status(400).json({
          ok: false,
          provider: result.provider,
          status: result.status,
          error: result.error || 'Failed to send test invoice email',
        });
      }
      res.json({
        ok: true,
        provider: result.provider,
        message: `Test "${(parsed.data.templateStatus || 'confirmed').replace(/_/g, ' ')}" template email sent to ${parsed.data.to} via ${result.provider.toUpperCase()}.`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to send test email' });
    }
  }
);

app.get(
  '/api/admin/email-logs',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit || 25);
      const logs = await getRecentOrderEmailLogs(limit);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load order email logs' });
    }
  }
);

app.post(
  '/api/admin/email-logs/:id/resend',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req, res) => {
    const logId = Number(req.params.id);
    if (!Number.isInteger(logId) || logId <= 0) {
      return res.status(400).json({ error: 'Invalid email log ID' });
    }
    try {
      const result = await resendOrderEmailLog(logId);
      if (!result) return res.status(404).json({ error: 'Email log record not found' });
      if (!result.ok) {
        return res.status(400).json({
          ok: false,
          error: result.dispatchResult.error || 'Email resend failed',
          log: result.log,
        });
      }
      res.json({
        ok: true,
        message: `Email re-sent to ${result.log.recipientEmail} via ${result.dispatchResult.provider.toUpperCase()}.`,
        log: result.log,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to resend email' });
    }
  }
);

app.post(
  '/api/admin/notifications/broadcast',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const validated = validateBroadcastNotification({
      targetRole: String(req.body?.targetRole || ''),
      title: String(req.body?.title || ''),
      message: String(req.body?.message || ''),
      type: typeof req.body?.type === 'string' ? req.body.type : 'system',
    });
    if (!validated.valid) {
      return res.status(400).json({ error: validated.reason });
    }

    try {
      const recipientUid =
        validated.targetRole === 'all' ? 'broadcast-all' : `role-${validated.targetRole}`;
      const inserted = await db
        .insert(notifications)
        .values({
          recipientUid,
          roleTarget: validated.targetRole,
          title: validated.title,
          message: validated.message,
          type: validated.type,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'notification_broadcast',
        targetType: 'notification',
        targetId: String(inserted[0].id),
        details: JSON.stringify({ targetRole: validated.targetRole, title: validated.title }),
      });

      broadcastNotificationEvent({
        recipientUid,
        roleTarget: validated.targetRole,
        title: validated.title,
        message: validated.message,
        type: validated.type,
      });

      res.status(201).json({ notification: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to send broadcast' });
    }
  }
);

app.post(
  '/api/admin/backend/reseed',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    try {
      await ensureDatabaseSeeded();
      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'backend_reseed_verified',
        targetType: 'database',
        targetId: 'seed',
        details: 'Verified and repaired baseline marketplace seed records without wiping data.',
      });
      res.json({ ok: true, message: 'Database seed integrity verified cleanly.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Database seed verification failed' });
    }
  }
);

app.get(
  '/api/admin/backend/backup',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    try {
      const [
        allUsers,
        allRestaurants,
        allFoodItems,
        allOrders,
        allRiders,
        allCoupons,
        allLedger,
        allPayouts,
        allSettings,
        allNotifications,
      ] = await Promise.all([
        db
          .select({
            id: users.id,
            uid: users.uid,
            email: users.email,
            fullName: users.fullName,
            phone: users.phone,
            role: users.role,
            status: users.status,
            createdAt: users.createdAt,
          })
          .from(users),
        db.select().from(restaurants),
        db.select().from(foodItems),
        db.select().from(orders),
        db.select().from(riders),
        db.select().from(coupons),
        db.select().from(commissionLedger),
        db.select().from(restaurantPayouts),
        db.select().from(platformSettings),
        db.select().from(notifications),
      ]);

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'backend_backup_exported',
        targetType: 'database',
        targetId: 'json',
        details: JSON.stringify({
          exportedBy: req.user!.email,
          orders: allOrders.length,
          restaurants: allRestaurants.length,
        }),
      });

      const payload = {
        exportedAt: new Date().toISOString(),
        exportedBy: req.user!.email,
        platform: 'Foodora BD',
        tables: {
          users: allUsers,
          restaurants: allRestaurants,
          foodItems: allFoodItems,
          orders: allOrders,
          riders: allRiders,
          coupons: allCoupons,
          commissionLedger: allLedger,
          restaurantPayouts: allPayouts,
          platformSettings: allSettings,
          notifications: allNotifications,
        },
      };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="foodora-bd-db-backup.json"');
      res.send(JSON.stringify(payload, null, 2));
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate database backup' });
    }
  }
);

// ---------- Project Source ZIP Export (Clean, Verified, No Secrets/Temp Bloat) ----------

const EXCLUDED_ZIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.playwright-cli',
  '.aistudio',
  '.cache',
  '.gmp_cache',
  'tmp',
]);

const EXCLUDED_ZIP_FILES = new Set(['.env', '.DS_Store']);

async function addDirectoryToZip(zipFolder: JSZip, fsDir: string, relBase = '') {
  const entries = await fs.promises.readdir(fsDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const fullPath = path.join(fsDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_ZIP_DIRS.has(entry.name)) continue;
      // Skip public/assets/aistudio reference screenshot PDF (115MB+)
      if (relPath === 'public/assets/aistudio' || relPath === 'public\\assets\\aistudio') continue;
      await addDirectoryToZip(zipFolder, fullPath, relPath);
    } else if (entry.isFile()) {
      if (EXCLUDED_ZIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.log') || entry.name.endsWith('.zip')) continue;
      const content = await fs.promises.readFile(fullPath);
      zipFolder.file(relPath, content);
    }
  }
}

app.get('/api/export/project-zip', async (_req, res) => {
  try {
    const zip = new JSZip();
    const rootFolder = zip.folder('foodora-bd');
    if (!rootFolder) {
      return res.status(500).json({ error: 'Failed to initialize ZIP archive' });
    }

    await addDirectoryToZip(rootFolder, PROJECT_ROOT);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="foodora-bd-project.zip"');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.send(buffer);
  } catch (error: any) {
    console.error('Project ZIP export failed:', error);
    res.status(500).json({ error: error.message || 'Failed to generate ZIP file' });
  }
});

// ---------- Notifications ----------

app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
  const list = await getNotificationsForUser(req.user!.uid, req.user!.role);
  res.json({ notifications: list });
});

app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      or(
        eq(notifications.recipientUid, req.user!.uid),
        eq(notifications.roleTarget, req.user!.role),
        eq(notifications.roleTarget, 'all')
      )
    );
  res.json({ ok: true });
});

app.post('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid notification ID' });
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, id),
        or(
          eq(notifications.recipientUid, req.user!.uid),
          eq(notifications.roleTarget, req.user!.role),
          eq(notifications.roleTarget, 'all')
        )
      )
    );
  res.json({ ok: true });
});

// ---------- Bilingual AI Help Assistant (Multi-Provider: Foodora Own AI, OpenRouter Gemma 4, Gemini, ChatGPT, Groq, DeepSeek, Claude, Custom) ----------

function getGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.AI_STUDIO_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim();
}

function getProviderEnvApiKey(providerType: string): string {
  switch (providerType) {
    case 'openrouter':
      return (process.env.OPENROUTER_API_KEY || '').trim();
    case 'openai':
      return (process.env.OPENAI_API_KEY || '').trim();
    case 'groq':
      return (process.env.GROQ_API_KEY || '').trim();
    case 'deepseek':
      return (process.env.DEEPSEEK_API_KEY || '').trim();
    case 'anthropic':
      return (process.env.ANTHROPIC_API_KEY || '').trim();
    case 'mistral':
      return (process.env.MISTRAL_API_KEY || '').trim();
    case 'xai':
      return (process.env.XAI_API_KEY || '').trim();
    case 'together':
      return (process.env.TOGETHER_API_KEY || '').trim();
    case 'cerebras':
      return (process.env.CEREBRAS_API_KEY || '').trim();
    case 'perplexity':
      return (process.env.PERPLEXITY_API_KEY || '').trim();
    case 'cohere':
      return (process.env.COHERE_API_KEY || '').trim();
    case 'huggingface':
      return (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();
    default:
      return '';
  }
}

function getAiEnvFlags() {
  return {
    hasGeminiKey: Boolean(getGeminiApiKey()),
    hasOpenRouterKey: Boolean(getProviderEnvApiKey('openrouter')),
    hasOpenAIKey: Boolean(getProviderEnvApiKey('openai')),
    hasGroqKey: Boolean(getProviderEnvApiKey('groq')),
    hasDeepSeekKey: Boolean(getProviderEnvApiKey('deepseek')),
    hasAnthropicKey: Boolean(getProviderEnvApiKey('anthropic')),
    hasMistralKey: Boolean(getProviderEnvApiKey('mistral')),
    hasXaiKey: Boolean(getProviderEnvApiKey('xai')),
    hasTogetherKey: Boolean(getProviderEnvApiKey('together')),
    hasCerebrasKey: Boolean(getProviderEnvApiKey('cerebras')),
    hasPerplexityKey: Boolean(getProviderEnvApiKey('perplexity')),
    hasCohereKey: Boolean(getProviderEnvApiKey('cohere')),
    hasHuggingFaceKey: Boolean(getProviderEnvApiKey('huggingface')),
  };
}

function getGeminiHelpClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const aiHelpRequestSchema = z.object({
  message: z.string().trim().min(1, 'Please enter a question.').max(1500),
  langPreference: z.enum(['auto', 'bn', 'en']).optional().default('auto'),
  uiLang: z.enum(['en', 'bn']).optional().default('en'),
  providerCode: z.string().trim().max(32).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().trim().min(1).max(3000),
        reasoning_details: z.unknown().optional(),
      })
    )
    .optional()
    .default([]),
  context: z
    .object({
      area: z.string().trim().max(120).optional(),
      viewType: z.string().trim().max(60).optional(),
      activeOrderNumber: z.string().trim().max(60).optional(),
    })
    .optional(),
});

function extractReadableGeminiError(err: unknown): { status: number; message: string } {
  const rawStatus =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 502;
  const rawMsg = coerceSafeErrorText(err, 'Failed to generate AI Help response.');

  let parsedMessage = rawMsg;
  let parsedStatus = rawStatus;
  if (rawMsg.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(rawMsg) as {
        error?: { code?: number; message?: unknown; status?: string };
        message?: unknown;
      };
      const candidate = coerceSafeErrorText(obj.error?.message ?? obj.message, '');
      if (candidate) parsedMessage = candidate;
      if (typeof obj.error?.code === 'number') parsedStatus = obj.error.code;
    } catch {
      // keep rawMsg
    }
  }

  return {
    status: parsedStatus >= 400 && parsedStatus < 600 ? parsedStatus : 502,
    message: coerceSafeErrorText(parsedMessage, 'Failed to generate AI Help response.'),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
      (err as Error & { status?: number }).status = 504;
      reject(err);
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function resolveDefaultBaseUrlForAiType(providerType: string): string {
  if (providerType === 'pollinations') return 'https://text.pollinations.ai';
  if (providerType === 'openrouter') return 'https://openrouter.ai/api/v1';
  if (providerType === 'openai') return 'https://api.openai.com/v1';
  if (providerType === 'groq') return 'https://api.groq.com/openai/v1';
  if (providerType === 'deepseek') return 'https://api.deepseek.com/v1';
  if (providerType === 'anthropic') return 'https://api.anthropic.com';
  if (providerType === 'mistral') return 'https://api.mistral.ai/v1';
  if (providerType === 'xai') return 'https://api.x.ai/v1';
  if (providerType === 'together') return 'https://api.together.xyz/v1';
  if (providerType === 'cerebras') return 'https://api.cerebras.ai/v1';
  if (providerType === 'perplexity') return 'https://api.perplexity.ai';
  if (providerType === 'cohere') return 'https://api.cohere.com/compatibility/v1';
  if (providerType === 'huggingface') return 'https://router.huggingface.co/v1';
  return '';
}

async function runSingleOpenRouterRequest(options: {
  baseUrl: string;
  apiKey: string;
  refererOrigin?: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
}): Promise<{ reply: string; reasoningDetails?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': options.refererOrigin || 'https://foodorabd-3-nine.vercel.app',
        'X-Title': 'Foodora BD',
      },
      body: JSON.stringify(options.payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_details?: unknown;
        };
      }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      const errMsg = coerceSafeErrorText(json?.error?.message ?? json?.error, `OpenRouter API failed (${res.status})`);
      const err = new Error(errMsg);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const msg = json?.choices?.[0]?.message;
    const text = extractAiReplyText(msg?.content);
    if (!text) {
      const err = new Error('OpenRouter returned an empty response.');
      (err as Error & { status?: number }).status = 502;
      throw err;
    }
    return {
      reply: text,
      reasoningDetails: msg?.reasoning_details,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callExternalAiProvider(options: {
  providerType: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string; reasoning_details?: unknown }>;
  message: string;
  refererOrigin?: string;
}): Promise<{ reply: string; reasoningDetails?: unknown; actualModel?: string }> {
  const baseUrl = (options.apiBaseUrl || resolveDefaultBaseUrlForAiType(options.providerType))
    .trim()
    .replace(/\/+$/, '');
  if (!isValidExternalAiBaseUrl(baseUrl)) {
    const err = new Error('Invalid external AI API base URL (HTTPS required).');
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  if (options.providerType === 'pollinations') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const endpoint = baseUrl.endsWith('/openai') ? baseUrl : `${baseUrl}/openai`;
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'openai-fast',
          messages: [
            { role: 'system', content: options.systemInstruction },
            ...options.history.slice(-6).map((h) => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.text,
            })),
            { role: 'user', content: options.message },
          ],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        const err = new Error(coerceSafeErrorText(json?.error?.message ?? json?.error, `Pollinations AI failed (${res.status})`));
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      const text = extractAiReplyText(json?.choices?.[0]?.message?.content);
      if (!text) throw new Error('Pollinations AI returned an empty response.');
      return { reply: text, actualModel: options.model || 'openai-fast' };
    } finally {
      clearTimeout(timer);
    }
  }

  if (options.providerType === 'openrouter') {
    const primaryModel = (options.model || '').trim() || 'google/gemma-4-31b-it:free';
    const attempts: Array<{ model: string; strictProvider: boolean; enableReasoning: boolean }> = [
      { model: primaryModel, strictProvider: true, enableReasoning: true },
      { model: primaryModel, strictProvider: false, enableReasoning: false },
    ];
    for (const fallbackModel of [
      'google/gemma-3-27b-it:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'openrouter/free',
    ]) {
      if (fallbackModel !== primaryModel) {
        attempts.push({ model: fallbackModel, strictProvider: false, enableReasoning: false });
      }
    }

    let lastErr: unknown = null;
    for (const attempt of attempts) {
      try {
        const payload = buildOpenRouterChatPayload({
          model: attempt.model,
          systemInstruction: options.systemInstruction,
          history: options.history,
          message: options.message,
          strictProvider: attempt.strictProvider,
          enableReasoning: attempt.enableReasoning,
        });
        const out = await runSingleOpenRouterRequest({
          baseUrl,
          apiKey: options.apiKey,
          refererOrigin: options.refererOrigin,
          payload,
          timeoutMs: 18000,
        });
        return { ...out, actualModel: attempt.model };
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        // Stop retrying if the OpenRouter API key itself is rejected (401/403)
        if (status === 401 || status === 403) {
          throw err;
        }
      }
    }
    throw lastErr || new Error('OpenRouter API failed.');
  }

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (options.providerType === 'anthropic') {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: 700,
          system: options.systemInstruction,
          messages: [
            ...options.history.slice(-8).map((h) => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.text,
            })),
            { role: 'user', content: options.message },
          ],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        content?: Array<{ text?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        const err = new Error(coerceSafeErrorText(json?.error?.message ?? json?.error, `Anthropic API failed (${res.status})`));
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      const text = extractAiReplyText(json?.content);
      if (!text) throw new Error('Anthropic returned an empty response.');
      return { reply: text, actualModel: options.model };
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: options.systemInstruction },
          ...options.history.slice(-8).map((h) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.text,
          })),
          { role: 'user', content: options.message },
        ],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      error?: { message?: unknown };
    };
    if (!res.ok) {
      const err = new Error(coerceSafeErrorText(json?.error?.message ?? json?.error, `AI API failed (${res.status})`));
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const text = extractAiReplyText(json?.choices?.[0]?.message?.content);
    if (!text) throw new Error('AI API returned an empty response.');
    return { reply: text, actualModel: options.model };
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/ai/providers', async (_req, res) => {
  try {
    const envFlags = getAiEnvFlags();
    const rows = await ensureDefaultAiProviders();
    res.json({
      providers: rows
        .map((r) => toPublicAiProviderView(r, envFlags))
        .filter((p) => p.isActive),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load AI providers' });
  }
});

app.get(
  '/api/admin/ai-providers',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (_req, res) => {
    try {
      const envFlags = getAiEnvFlags();
      const rows = await ensureDefaultAiProviders();
      res.json({
        aiProviders: rows.map((r) => toAdminAiProviderView(r, envFlags)),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load admin AI providers' });
    }
  }
);

app.put(
  '/api/admin/ai-providers',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().trim().min(2).max(80),
      providerType: z.enum([
        'foodora',
        'pollinations',
        'gemini',
        'openrouter',
        'openai',
        'groq',
        'deepseek',
        'anthropic',
        'mistral',
        'xai',
        'together',
        'cerebras',
        'perplexity',
        'cohere',
        'huggingface',
        'custom_openai',
      ]),
      model: z.string().trim().min(2).max(100),
      apiBaseUrl: z.string().trim().max(240).optional().default(''),
      apiKey: z.string().max(400).optional(),
      isActive: z.boolean().default(true),
      isDefault: z.boolean().default(false),
      sortOrder: z.number().int().min(1).max(100).optional().default(10),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid AI provider configuration',
      });
    }

    const code = normalizeAiProviderCode(parsed.data.code);
    if (code.length < 2) {
      return res.status(400).json({ error: 'Provider code must be at least 2 characters.' });
    }

    const isBuiltinNoExternalUrl =
      parsed.data.providerType === 'gemini' || parsed.data.providerType === 'foodora';
    const isKeylessProvider =
      isBuiltinNoExternalUrl || parsed.data.providerType === 'pollinations';
    const resolvedBaseUrl = isBuiltinNoExternalUrl
      ? ''
      : parsed.data.apiBaseUrl || resolveDefaultBaseUrlForAiType(parsed.data.providerType);

    if (!isBuiltinNoExternalUrl && resolvedBaseUrl) {
      if (!isValidExternalAiBaseUrl(resolvedBaseUrl)) {
        return res.status(400).json({
          error: 'API Base URL must be a valid public HTTPS endpoint.',
        });
      }
    }

    try {
      await ensureDefaultAiProviders();
      const existing = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.code, code))
        .limit(1);
      const cur = existing[0];

      let nextApiKey = '';
      if (!isKeylessProvider) {
        const incoming = parsed.data.apiKey;
        if (incoming === undefined) {
          nextApiKey = cur?.apiKey || '';
        } else {
          const clean = incoming.trim();
          nextApiKey = !clean || clean.startsWith('••••') ? cur?.apiKey || '' : clean;
        }
      }

      if (parsed.data.isDefault) {
        await db.update(aiProviders).set({ isDefault: false });
      }

      const nextValues = {
        code,
        name: parsed.data.name,
        providerType: parsed.data.providerType,
        model: parsed.data.model,
        apiBaseUrl: resolvedBaseUrl,
        apiKey: nextApiKey,
        isActive: parsed.data.isActive,
        isDefault: parsed.data.isDefault,
        sortOrder: parsed.data.sortOrder,
        updatedAt: new Date(),
      };

      const saved = await db
        .insert(aiProviders)
        .values(nextValues)
        .onConflictDoUpdate({
          target: aiProviders.code,
          set: nextValues,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: cur ? 'ai_provider_updated' : 'ai_provider_created',
        targetType: 'ai_provider',
        targetId: code,
        details: JSON.stringify({
          name: nextValues.name,
          providerType: nextValues.providerType,
          model: nextValues.model,
          isActive: nextValues.isActive,
          isDefault: nextValues.isDefault,
        }),
      });

      res.json({
        aiProvider: toAdminAiProviderView(saved[0], getAiEnvFlags()),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save AI provider' });
    }
  }
);

app.post(
  '/api/admin/ai-providers/:code/test',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const code = normalizeAiProviderCode(String(req.params.code || ''));
    if (!code) return res.status(400).json({ error: 'Invalid provider code' });

    try {
      await ensureDefaultAiProviders();
      const rows = await db.select().from(aiProviders).where(eq(aiProviders.code, code)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'AI provider not found' });
      const row = rows[0];

      if (row.providerType === 'foodora') {
        const ai = getGeminiHelpClient();
        if (ai) {
          try {
            const resp = await withTimeout(
              ai.models.generateContent({
                model: 'gemini-4-hydrogen',
                contents: [{ role: 'user', parts: [{ text: 'Reply strictly with: OK' }] }],
              }),
              7000,
              'gemini-4-hydrogen'
            );
            if ((resp.text || '').trim()) {
              return res.json({
                ok: true,
                message: 'Foodora Own AI connected cleanly (Gemini 4 + Built-in Knowledge Engine).',
                model: row.model,
              });
            }
          } catch {
            // fallback to built-in check below
          }
        }
        return res.json({
          ok: true,
          message: 'Foodora Own AI built-in bilingual assistant is online and ready.',
          model: row.model,
        });
      }

      if (row.providerType === 'pollinations') {
        const { reply, actualModel } = await callExternalAiProvider({
          providerType: 'pollinations',
          model: row.model || 'openai-fast',
          apiBaseUrl: row.apiBaseUrl || 'https://text.pollinations.ai',
          apiKey: '',
          systemInstruction: 'Reply strictly with OK.',
          history: [],
          message: 'Reply strictly with: OK',
        });
        return res.json({
          ok: Boolean(reply),
          message: `Connected cleanly to Pollinations Free AI (${actualModel || row.model}).`,
          model: actualModel || row.model,
        });
      }

      if (row.providerType === 'gemini') {
        const ai = getGeminiHelpClient();
        if (!ai) {
          return res.json({
            ok: false,
            message: 'GEMINI_API_KEY is missing in Settings > Secrets.',
            model: row.model,
          });
        }
        const testModel = row.model || 'gemini-4-hydrogen';
        const resp = await withTimeout(
          ai.models.generateContent({
            model: testModel,
            contents: [{ role: 'user', parts: [{ text: 'Reply strictly with: OK' }] }],
          }),
          8000,
          testModel
        );
        return res.json({
          ok: Boolean((resp.text || '').trim()),
          message: `Connected cleanly to Gemini (${testModel}).`,
          model: testModel,
        });
      }

      const resolvedKey =
        (row.apiKey || '').trim() || getProviderEnvApiKey(row.providerType);

      if (!resolvedKey) {
        return res.json({
          ok: false,
          message: `No API key saved for ${row.name}. Add an API key first.`,
          model: row.model,
        });
      }

      const { reply, actualModel } = await callExternalAiProvider({
        providerType: row.providerType,
        model: row.model,
        apiBaseUrl: row.apiBaseUrl || '',
        apiKey: resolvedKey,
        systemInstruction: 'You are a concise health check responder.',
        history: [],
        message: 'Reply strictly with: OK',
        refererOrigin: getRequestOrigin(req),
      });

      return res.json({
        ok: Boolean(reply),
        message: `Connected cleanly to ${row.name} (${actualModel || row.model}).`,
        model: actualModel || row.model,
      });
    } catch (error: unknown) {
      const { message } = extractReadableGeminiError(error);
      return res.json({
        ok: false,
        message,
      });
    }
  }
);

app.delete(
  '/api/admin/ai-providers/:code',
  requireAuth,
  requireRole(['admin', 'super_admin']),
  async (req: AuthRequest, res) => {
    const code = normalizeAiProviderCode(String(req.params.code || ''));
    if (!code) return res.status(400).json({ error: 'Invalid provider code' });
    if (code === 'gemini' || code === 'foodora') {
      return res.status(400).json({
        error: 'Built-in Foodora AI and Google Gemini providers cannot be deleted. Disable instead.',
      });
    }

    try {
      await db.delete(aiProviders).where(eq(aiProviders.code, code));
      await db.insert(auditLogs).values({
        actorUid: req.user!.uid,
        action: 'ai_provider_deleted',
        targetType: 'ai_provider',
        targetId: code,
        details: `Deleted custom AI Help provider ${code}`,
      });
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete AI provider' });
    }
  }
);

async function runGeminiHelpCompletion(params: {
  preferredModel: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
}): Promise<{ reply: string; model: string }> {
  const ai = getGeminiHelpClient();
  if (!ai) {
    const missingErr = new Error('GEMINI_API_KEY is not configured');
    (missingErr as Error & { status?: number }).status = 503;
    throw missingErr;
  }

  const contents = [
    ...params.history.slice(-8).map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: params.message }],
    },
  ];

  const candidateModels = filterGeminiCandidateModels(params.preferredModel);

  let lastError: unknown = null;
  for (let i = 0; i < candidateModels.length; i += 1) {
    const modelName = candidateModels[i];
    try {
      const config: {
        systemInstruction: string;
        thinkingConfig?: { thinkingLevel: ThinkingLevel };
      } = {
        systemInstruction: params.systemInstruction,
      };
      if (modelName.startsWith('gemini-4')) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents,
          config,
        }),
        9000,
        modelName
      );
      const text = (response.text || '').trim();
      if (!text) {
        const emptyErr = new Error('AI Help returned an empty response.');
        (emptyErr as Error & { status?: number }).status = 502;
        throw emptyErr;
      }
      return { reply: text, model: modelName };
    } catch (err) {
      lastError = err;
      if (i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  throw lastError || new Error('Gemini API unavailable');
}

app.post('/api/ai/help', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = aiHelpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid AI Help request payload.',
      });
    }

    const { message, langPreference, uiLang, providerCode, history, context } = parsed.data;
    const systemInstruction = buildAiHelpSystemInstruction({
      langPreference: langPreference as AiHelpLangPreference,
      uiLang,
      area: context?.area,
      viewType: context?.viewType,
      activeOrderNumber: context?.activeOrderNumber,
    });

    const allProviders = await ensureDefaultAiProviders();
    const activeProviders = allProviders.filter((p) => p.isActive);
    const envFlags = getAiEnvFlags();

    const normalizedRequestedCode = providerCode ? normalizeAiProviderCode(providerCode) : '';
    const chosenProvider =
      (normalizedRequestedCode
        ? activeProviders.find((p) => normalizeAiProviderCode(p.code) === normalizedRequestedCode)
        : undefined) ||
      activeProviders.find((p) => p.isDefault && toPublicAiProviderView(p, envFlags).isConfigured) ||
      activeProviders.find((p) => toPublicAiProviderView(p, envFlags).isConfigured) ||
      activeProviders.find((p) => p.providerType === 'foodora') ||
      activeProviders.find((p) => p.providerType === 'pollinations') ||
      allProviders[0];

    const chosenType = chosenProvider?.providerType || 'foodora';

    // 1. Foodora Own AI (Tries Gemini backend when configured, seamlessly guarantees built-in bilingual Foodora AI answer)
    if (chosenType === 'foodora') {
      const openRestaurants = await getApprovedRestaurants().catch(() => []);
      if (envFlags.hasGeminiKey) {
        try {
          const liveRestLine = openRestaurants
            .filter((r) => r.isOpen)
            .slice(0, 6)
            .map((r) => `${r.name} (${r.area} · ${r.cuisine})`)
            .join(', ');
          const enrichedInstruction = liveRestLine
            ? `${systemInstruction}\nLive Open Restaurants: ${liveRestLine}`
            : systemInstruction;
          const geminiOut = await runGeminiHelpCompletion({
            preferredModel: 'gemini-4-hydrogen',
            systemInstruction: enrichedInstruction,
            history,
            message,
          });
          return res.json({
            reply: geminiOut.reply,
            model: 'foodora-own-ai',
            providerCode: chosenProvider?.code || 'foodora',
            providerName: chosenProvider?.name || 'Foodora Own AI',
          });
        } catch {
          // Fall back cleanly to built-in Foodora knowledge assistant
        }
      }

      const fallbackReply = generateFoodoraOwnAiReply({
        message,
        langPreference: langPreference as AiHelpLangPreference,
        uiLang,
        area: context?.area,
        activeOrderNumber: context?.activeOrderNumber,
        openRestaurants: openRestaurants
          .filter((r) => r.isOpen)
          .slice(0, 6)
          .map((r) => ({ name: r.name, area: r.area, cuisine: r.cuisine })),
      });
      return res.json({
        reply: fallbackReply,
        model: chosenProvider?.model || 'foodora-bd-assistant',
        providerCode: chosenProvider?.code || 'foodora',
        providerName: chosenProvider?.name || 'Foodora Own AI',
      });
    }

    // 2. Pollinations Free AI (Keyless real LLM)
    if (chosenType === 'pollinations') {
      const extRes = await callExternalAiProvider({
        providerType: 'pollinations',
        model: chosenProvider?.model || 'openai-fast',
        apiBaseUrl: chosenProvider?.apiBaseUrl || 'https://text.pollinations.ai',
        apiKey: '',
        systemInstruction,
        history,
        message,
        refererOrigin: getRequestOrigin(req),
      });
      return res.json({
        reply: extRes.reply,
        model: extRes.actualModel || chosenProvider?.model || 'openai-fast',
        providerCode: chosenProvider?.code || 'pollinations',
        providerName: chosenProvider?.name || 'Pollinations Free AI',
      });
    }

    // 3. OpenRouter / OpenAI / Groq / DeepSeek / Anthropic / Mistral / xAI / Together / Cerebras / Perplexity / Cohere / HuggingFace / Custom
    if (chosenProvider && chosenType !== 'gemini') {
      const apiKey =
        (chosenProvider.apiKey || '').trim() || getProviderEnvApiKey(chosenType);

      // If user picked OpenRouter (Gemma 4) without OPENROUTER_API_KEY, route through GEMINI_API_KEY if configured
      if (!apiKey && chosenType === 'openrouter' && envFlags.hasGeminiKey) {
        const geminiOut = await runGeminiHelpCompletion({
          preferredModel: 'gemini-4-hydrogen',
          systemInstruction,
          history,
          message,
        });
        return res.json({
          reply: geminiOut.reply,
          model: geminiOut.model,
          providerCode: chosenProvider.code,
          providerName: `${chosenProvider.name} (Gemini 4 Route)`,
        });
      }

      if (!apiKey) {
        return res.status(503).json({
          error: `${chosenProvider.name} requires an API key in Super Admin > Backend Control. Switch to Foodora Own AI or Pollinations Free AI to chat instantly.`,
          suggestedFallback: 'foodora',
        });
      }

      const extRes = await callExternalAiProvider({
        providerType: chosenType,
        model: chosenProvider.model,
        apiBaseUrl: chosenProvider.apiBaseUrl || '',
        apiKey,
        systemInstruction,
        history,
        message,
        refererOrigin: getRequestOrigin(req),
      });

      return res.json({
        reply: extRes.reply,
        model: extRes.actualModel || chosenProvider.model,
        providerCode: chosenProvider.code,
        providerName: chosenProvider.name,
        ...(extRes.reasoningDetails !== undefined
          ? { reasoningDetails: extRes.reasoningDetails }
          : {}),
      });
    }

    // 4. Direct Google Gemini provider
    if (!envFlags.hasGeminiKey) {
      return res.status(503).json({
        error:
          'Google Gemini requires GEMINI_API_KEY in Settings > Secrets, or switch AI Engine to Foodora Own AI / Pollinations Free AI.',
        suggestedFallback: 'foodora',
      });
    }

    const geminiOut = await runGeminiHelpCompletion({
      preferredModel: chosenProvider?.model?.trim() || 'gemini-4-hydrogen',
      systemInstruction,
      history,
      message,
    });

    return res.json({
      reply: geminiOut.reply,
      model: geminiOut.model,
      providerCode: chosenProvider?.code || 'gemini',
      providerName: chosenProvider?.name || 'Google Gemini 4',
    });
  } catch (err: unknown) {
    const { status, message } = extractReadableGeminiError(err);
    console.error('POST /api/ai/help error:', message);
    return res.status(status).json({
      error: message,
      suggestedFallback: 'foodora',
    });
  }
});

// ---------- Server Bootstrap (Vite Dev Middleware or Static Production) ----------

async function startServer() {
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const { createServer } = await import(/* @vite-ignore */ vitePkg);
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(PROJECT_ROOT, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', async (_req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        try {
          let html = fs.readFileSync(indexPath, 'utf8');
          const settings = hasDatabaseConfig()
            ? await getPlatformSettingsRow().catch(() => null)
            : null;
          const sc = mergeStorefrontConfig(settings?.storefrontConfig);
          const token = (
            sc.googleSiteVerification ||
            process.env.GOOGLE_SITE_VERIFICATION ||
            ''
          ).trim();
          if (token && !html.includes('name="google-site-verification"')) {
            const safeToken = token.replace(/["<>]/g, '');
            html = html.replace(
              '</head>',
              `  <meta name="google-site-verification" content="${safeToken}" />\n  </head>`
            );
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(html);
        } catch {
          return res.sendFile(indexPath);
        }
      });
    }
  }

  const httpServer = http.createServer(app);
  initRealtimeWebSocketServer(httpServer);

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Foodora BD server (HTTP + WS) listening on http://0.0.0.0:${port}`);
  });
}

const isServerless = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NOW_REGION ||
    path.basename(__dirname) === 'api'
);

if (!isServerless) {
  startServer();
}

export { app };
export default app;
