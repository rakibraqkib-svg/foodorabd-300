import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm';
import { db, withDbRetry } from './index.ts';
import {
  aiProviders,
  auditLogs,
  commissionLedger,
  coupons,
  customerAddresses,
  favorites,
  foodItems,
  localCredentials,
  notifications,
  orderEmailLogs,
  orders,
  orderStatusHistory,
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
} from './schema.ts';
import {
  DEFAULT_AI_PROVIDERS,
  DEFAULT_PAYMENT_GATEWAYS,
  mergeDeliveryFinancialConfig,
  partitionOwnedVsPartnerRestaurants,
  pickNearestStandbyRider,
  PROTECTED_SUPER_ADMIN_EMAILS,
  summarizeDhakaZoneRiderCoverage,
  summarizeRiderWalletLedger,
} from '../lib/marketplace-logic.ts';

export async function getApprovedRestaurants() {
  try {
    return await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, 'approved'))
      .orderBy(desc(restaurants.isSponsored), desc(restaurants.rating));
  } catch (error) {
    console.error('Failed to load approved restaurants:', error);
    throw new Error('Failed to load restaurants', { cause: error });
  }
}

export async function getAllRestaurantsAdmin() {
  try {
    return await db.select().from(restaurants).orderBy(desc(restaurants.createdAt));
  } catch (error) {
    console.error('Failed to load all restaurants:', error);
    throw new Error('Failed to load restaurants', { cause: error });
  }
}

export async function getStorefrontProducts() {
  try {
    const rows = await db
      .select({
        id: foodItems.id,
        restaurantId: foodItems.restaurantId,
        category: foodItems.category,
        name: foodItems.name,
        nameBn: foodItems.nameBn,
        description: foodItems.description,
        imageUrl: foodItems.imageUrl,
        price: foodItems.price,
        discountPrice: foodItems.discountPrice,
        variationsJson: foodItems.variationsJson,
        addonsJson: foodItems.addonsJson,
        inStock: foodItems.inStock,
        isAvailable: foodItems.isAvailable,
        isPopular: foodItems.isPopular,
        isVisibleOnStorefront: foodItems.isVisibleOnStorefront,
        restaurantName: restaurants.name,
        restaurantNameBn: restaurants.nameBn,
        restaurantSlug: restaurants.slug,
        restaurantLogoUrl: restaurants.logoUrl,
        restaurantCoverUrl: restaurants.coverUrl,
        restaurantArea: restaurants.area,
        restaurantCuisine: restaurants.cuisine,
        deliveryTimeMin: restaurants.deliveryTimeMin,
        deliveryFee: restaurants.deliveryFee,
        deliveryMode: restaurants.deliveryMode,
        minOrder: restaurants.minOrder,
        rating: restaurants.rating,
        isOpen: restaurants.isOpen,
      })
      .from(foodItems)
      .innerJoin(restaurants, eq(foodItems.restaurantId, restaurants.id))
      .where(
        and(
          eq(restaurants.status, 'approved'),
          eq(foodItems.isVisibleOnStorefront, true),
          eq(foodItems.isAvailable, true)
        )
      )
      .orderBy(desc(foodItems.isPopular), desc(foodItems.inStock), desc(foodItems.id));
    return rows;
  } catch (error) {
    console.error('Failed to load storefront products:', error);
    throw new Error('Failed to load storefront products', { cause: error });
  }
}

export async function getRestaurantBySlug(slug: string) {
  try {
    const rows = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
    if (rows.length === 0) return null;
    const restaurant = rows[0];
    const items = await db
      .select()
      .from(foodItems)
      .where(
        and(
          eq(foodItems.restaurantId, restaurant.id),
          eq(foodItems.isVisibleOnStorefront, true)
        )
      );
    const restaurantReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.restaurantId, restaurant.id))
      .orderBy(desc(reviews.createdAt));
    return { restaurant, items, reviews: restaurantReviews };
  } catch (error) {
    console.error('Failed to load restaurant detail:', error);
    throw new Error('Failed to load restaurant details', { cause: error });
  }
}

export async function getActiveCoupons() {
  try {
    return await db.select().from(coupons).where(eq(coupons.isActive, true));
  } catch (error) {
    console.error('Failed to load coupons:', error);
    throw new Error('Failed to load coupons', { cause: error });
  }
}

export async function getCustomerAddresses(userUid: string) {
  try {
    return await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.userUid, userUid))
      .orderBy(desc(customerAddresses.isDefault));
  } catch (error) {
    console.error('Failed to load addresses:', error);
    throw new Error('Failed to load saved addresses', { cause: error });
  }
}

export async function getCustomerOrders(customerUid: string) {
  try {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.customerUid, customerUid))
      .orderBy(desc(orders.createdAt));
  } catch (error) {
    console.error('Failed to load customer orders:', error);
    throw new Error('Failed to load customer orders', { cause: error });
  }
}

export async function getOrderById(orderId: number) {
  try {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (rows.length === 0) return null;
    const order = rows[0];
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.createdAt);
    const restRows = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, order.restaurantId))
      .limit(1);

    let riderLocation: {
      uid: string;
      fullName: string;
      phone: string;
      vehicleType: string;
      zone: string;
      isAvailable: boolean;
      lat: number;
      lng: number;
      locationUpdatedAt: Date;
    } | null = null;

    if (order.riderUid) {
      const riderRows = await db
        .select()
        .from(riders)
        .where(eq(riders.uid, order.riderUid))
        .limit(1);
      if (riderRows.length > 0) {
        const r = riderRows[0];
        riderLocation = {
          uid: r.uid,
          fullName: r.fullName,
          phone: r.phone,
          vehicleType: r.vehicleType,
          zone: r.zone,
          isAvailable: r.isAvailable,
          lat: r.currentLat,
          lng: r.currentLng,
          locationUpdatedAt: r.locationUpdatedAt,
        };
      }
    }

    let nearestRider: {
      uid: string;
      fullName: string;
      phone: string;
      vehicleType: string;
      zone: string;
      isAvailable: boolean;
      lat: number;
      lng: number;
      locationUpdatedAt: Date;
      distanceToRestaurantKm: number;
    } | null = null;

    if (!riderLocation && order.deliveryMode === 'platform' && order.status !== 'delivered' && order.status !== 'cancelled') {
      const rest = restRows[0];
      const targetLat = rest ? rest.lat : order.deliveryLat;
      const targetLng = rest ? rest.lng : order.deliveryLng;
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
        targetLat,
        targetLng
      );
      if (picked) {
        nearestRider = {
          ...picked.rider,
          distanceToRestaurantKm: picked.distanceKm,
        };
      }
    }

    const [emailLogs, transactions, settings] = await Promise.all([
      db
        .select()
        .from(orderEmailLogs)
        .where(eq(orderEmailLogs.orderId, orderId))
        .orderBy(desc(orderEmailLogs.sentAt)),
      db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.orderId, orderId))
        .orderBy(asc(paymentTransactions.id)),
      getPlatformSettingsRow(),
    ]);

    return {
      order,
      history,
      restaurant: restRows[0] ?? null,
      riderLocation,
      nearestRider,
      emailLogs,
      transactions,
      deliveryFinancialConfig: mergeDeliveryFinancialConfig(
        (settings?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
      ),
    };
  } catch (error) {
    console.error('Failed to fetch order detail:', error);
    throw new Error('Failed to fetch order details', { cause: error });
  }
}

export async function getPlatformSettingsRow() {
  try {
    const rows = await withDbRetry(() => db.select().from(platformSettings).limit(1));
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to fetch platform settings:', error);
    return null;
  }
}

export async function ensureDefaultPaymentGateways() {
  try {
    const existing = await withDbRetry(() =>
      db
        .select()
        .from(paymentGateways)
        .orderBy(asc(paymentGateways.sortOrder), asc(paymentGateways.id))
    );

    if (existing.length === 0) {
      const settings = await getPlatformSettingsRow();
      const seedRows = DEFAULT_PAYMENT_GATEWAYS.map((gw) => {
        if (gw.code === 'bkash' && settings) {
          return {
            ...gw,
            isActive: settings.bkashEnabled,
            mode: settings.bkashSandbox ? 'sandbox' : 'live',
          };
        }
        if (gw.code === 'sslcommerz' && settings) {
          return {
            ...gw,
            isActive: settings.sslcommerzEnabled,
            mode: settings.sslcommerzSandbox ? 'sandbox' : 'live',
          };
        }
        return gw;
      });
      await db.insert(paymentGateways).values(seedRows).onConflictDoNothing();
      return await db
        .select()
        .from(paymentGateways)
        .orderBy(asc(paymentGateways.sortOrder), asc(paymentGateways.id));
    }
    return existing;
  } catch (error) {
    console.error('Failed to load payment gateways:', error);
    return DEFAULT_PAYMENT_GATEWAYS.map((gw, idx) => ({
      id: idx + 1,
      ...gw,
      merchantId: '',
      apiKey: '',
      apiSecret: '',
      webhookSecret: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}

export async function ensureDefaultAiProviders() {
  try {
    let existing = await withDbRetry(() =>
      db
        .select()
        .from(aiProviders)
        .orderBy(asc(aiProviders.sortOrder), asc(aiProviders.id))
    );

    const existingCodes = new Set(existing.map((row) => row.code));
    const hasAnyDefault = existing.some((row) => row.isDefault);
    const missingDefaults = DEFAULT_AI_PROVIDERS.filter((p) => !existingCodes.has(p.code));

    if (missingDefaults.length > 0) {
      await db
        .insert(aiProviders)
        .values(
          missingDefaults.map((p) => ({
            ...p,
            isDefault: existing.length === 0 ? p.isDefault : !hasAnyDefault && p.code === 'foodora',
            apiKey: '',
          }))
        )
        .onConflictDoNothing();
      existing = await db
        .select()
        .from(aiProviders)
        .orderBy(asc(aiProviders.sortOrder), asc(aiProviders.id));
    }
    return existing;
  } catch (error) {
    console.error('Failed to load AI providers:', error);
    return DEFAULT_AI_PROVIDERS.map((p, idx) => ({
      id: idx + 1,
      ...p,
      apiKey: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}

export async function getVendorWorkspace(
  ownerUid: string,
  isSuperAdmin: boolean,
  requestedRestaurantId?: number | null
) {
  try {
    const rawList = isSuperAdmin
      ? await db.select().from(restaurants).orderBy(restaurants.id)
      : await db.select().from(restaurants).where(eq(restaurants.ownerUid, ownerUid)).orderBy(restaurants.id);

    const partitioned = partitionOwnedVsPartnerRestaurants(rawList, ownerUid);
    const owned = partitioned.ordered;

    const isAllRestaurants = requestedRestaurantId === -1;

    const requestedMatch =
      !isAllRestaurants && requestedRestaurantId && Number.isInteger(requestedRestaurantId)
        ? owned.find((r) => r.id === requestedRestaurantId) ?? null
        : null;
    const target = requestedMatch ?? owned[0] ?? null;

    if (!target) {
      return {
        restaurant: null,
        restaurants: owned,
        ownRestaurantIds: partitioned.own.map((r) => r.id),
        menuItems: [],
        orders: [],
        ledger: [],
        payouts: [],
        riderJobs: [],
        riderJobApplications: [],
        unreadMessageCount: 0,
      };
    }

    const restaurantIdsToQuery = isAllRestaurants
      ? owned.map((r) => r.id)
      : [target.id];

    const restaurantNameMap = new Map(owned.map((r) => [r.id, r.name]));

    const rawMenuItems =
      restaurantIdsToQuery.length > 0
        ? await db
            .select()
            .from(foodItems)
            .where(inArray(foodItems.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(foodItems.id))
        : [];

    const menuItems = rawMenuItems.map((item) => ({
      ...item,
      restaurantName: restaurantNameMap.get(item.restaurantId) || target.name,
    }));

    const restOrders =
      restaurantIdsToQuery.length > 0
        ? await db
            .select()
            .from(orders)
            .where(inArray(orders.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(orders.createdAt))
        : [];

    const [ledger, payouts, jobs, applications, unreadRows] = await Promise.all([
      restaurantIdsToQuery.length > 0
        ? db
            .select()
            .from(commissionLedger)
            .where(inArray(commissionLedger.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(commissionLedger.createdAt))
        : Promise.resolve([]),
      restaurantIdsToQuery.length > 0
        ? db
            .select()
            .from(restaurantPayouts)
            .where(inArray(restaurantPayouts.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(restaurantPayouts.requestedAt))
        : Promise.resolve([]),
      restaurantIdsToQuery.length > 0
        ? db
            .select()
            .from(riderJobs)
            .where(inArray(riderJobs.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(riderJobs.createdAt))
        : Promise.resolve([]),
      restaurantIdsToQuery.length > 0
        ? db
            .select()
            .from(riderJobApplications)
            .where(inArray(riderJobApplications.restaurantId, restaurantIdsToQuery))
            .orderBy(desc(riderJobApplications.createdAt))
        : Promise.resolve([]),
      restaurantIdsToQuery.length > 0
        ? db
            .select({ id: vendorAdminMessages.id })
            .from(vendorAdminMessages)
            .where(
              and(
                inArray(vendorAdminMessages.restaurantId, restaurantIdsToQuery),
                eq(vendorAdminMessages.isReadByVendor, false)
              )
            )
        : Promise.resolve([]),
    ]);

    return {
      restaurant: target,
      restaurants: owned,
      ownRestaurantIds: partitioned.own.map((r) => r.id),
      menuItems,
      orders: restOrders,
      ledger,
      payouts,
      riderJobs: jobs,
      riderJobApplications: applications,
      unreadMessageCount: unreadRows.length,
    };
  } catch (error) {
    console.error('Failed to fetch vendor workspace:', error);
    throw new Error('Failed to load restaurant dashboard', { cause: error });
  }
}

export async function getRiderWorkspace(riderUid: string) {
  try {
    const [riderRows, userRows, allOrders, allRestaurants, walletEntries, settings, allRiders] =
      await Promise.all([
        db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1),
        db
          .select({ avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.uid, riderUid))
          .limit(1),
        db.select().from(orders).orderBy(desc(orders.createdAt)),
        db
          .select({
            id: restaurants.id,
            name: restaurants.name,
            lat: restaurants.lat,
            lng: restaurants.lng,
            address: restaurants.address,
            phone: restaurants.phone,
          })
          .from(restaurants),
        db
          .select()
          .from(riderWalletLedger)
          .where(eq(riderWalletLedger.riderUid, riderUid))
          .orderBy(desc(riderWalletLedger.createdAt)),
        getPlatformSettingsRow(),
        db.select().from(riders),
      ]);
    const restCoordMap = new Map(
      allRestaurants.map((r) => [
        r.id,
        { name: r.name, lat: r.lat, lng: r.lng, address: r.address, phone: r.phone },
      ])
    );
    const withRestCoords = allOrders.map((o) => {
      const coords = restCoordMap.get(o.restaurantId);
      return {
        ...o,
        restaurantLat: coords?.lat,
        restaurantLng: coords?.lng,
        restaurantAddress: coords?.address || '',
        restaurantPhone: coords?.phone || '',
      };
    });
    const baseRider = riderRows[0] ?? null;
    const isApprovedRider = baseRider?.status === 'approved';
    const availableOrders = isApprovedRider
      ? withRestCoords.filter(
          (o) =>
            o.deliveryMode === 'platform' &&
            !o.riderUid &&
            ['accepted', 'preparing', 'ready'].includes(o.status) &&
            (o.paymentMethod === 'cod' || o.paymentStatus === 'paid')
        )
      : [];
    const assignedOrders = withRestCoords.filter((o) => o.riderUid === riderUid);
    const walletSummary = summarizeRiderWalletLedger(walletEntries);
    const financialConfig = mergeDeliveryFinancialConfig(
      (settings?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
    );
    const zoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, financialConfig);
    const enrichedRider = baseRider
      ? {
          ...baseRider,
          avatarUrl: userRows[0]?.avatarUrl || '',
          restaurantName: baseRider.restaurantId
            ? restCoordMap.get(baseRider.restaurantId)?.name || null
            : null,
          walletSummary,
        }
      : null;
    return {
      rider: enrichedRider,
      availableOrders,
      assignedOrders,
      walletSummary,
      walletLedger: walletEntries,
      settlementRules: financialConfig.settlementRules,
      deliveryFinancialConfig: financialConfig,
      zoneCoverage,
    };
  } catch (error) {
    console.error('Failed to load rider workspace:', error);
    throw new Error('Failed to load rider dashboard', { cause: error });
  }
}

export async function getAdminWorkspace() {
  try {
    const [
      allRestaurants,
      allProducts,
      allOrders,
      allUsers,
      allLedger,
      allPayouts,
      allCoupons,
      allRiders,
      recentAuditLogs,
      settings,
      adminPinCreds,
      allTransactions,
      allWalletLedger,
    ] = await Promise.all([
      db.select().from(restaurants).orderBy(desc(restaurants.createdAt)),
      db.select().from(foodItems).orderBy(desc(foodItems.id)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(commissionLedger).orderBy(desc(commissionLedger.createdAt)),
      db.select().from(restaurantPayouts).orderBy(desc(restaurantPayouts.requestedAt)),
      db.select().from(coupons).orderBy(desc(coupons.createdAt)),
      db.select().from(riders).orderBy(desc(riders.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60),
      getPlatformSettingsRow(),
      db
        .select({ email: localCredentials.email })
        .from(localCredentials)
        .where(like(localCredentials.email, '__admin_pin__:%')),
      db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(250),
      db.select().from(riderWalletLedger).orderBy(desc(riderWalletLedger.createdAt)).limit(300),
    ]);

    const adminPinEmailSet = new Set<string>(PROTECTED_SUPER_ADMIN_EMAILS);
    for (const row of adminPinCreds) {
      const stripped = row.email.replace(/^__admin_pin__:/, '').trim().toLowerCase();
      if (stripped) adminPinEmailSet.add(stripped);
    }

    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      (settings?.deliveryFinancialConfig as Record<string, unknown> | undefined) || null
    );

    const ledgerByRider = new Map<string, typeof allWalletLedger>();
    for (const entry of allWalletLedger) {
      const list = ledgerByRider.get(entry.riderUid) || [];
      list.push(entry);
      ledgerByRider.set(entry.riderUid, list);
    }

    const enrichedRiders = allRiders.map((r) => ({
      ...r,
      walletSummary: summarizeRiderWalletLedger(ledgerByRider.get(r.uid) || []),
    }));

    const dhakaZoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, deliveryFinancialConfig);

    return {
      restaurants: allRestaurants,
      products: allProducts,
      orders: allOrders,
      users: allUsers,
      ledger: allLedger,
      payouts: allPayouts,
      coupons: allCoupons,
      riders: enrichedRiders,
      auditLogs: recentAuditLogs,
      settings,
      adminPinEmails: Array.from(adminPinEmailSet),
      deliveryFinancialConfig,
      dhakaZoneCoverage,
      paymentTransactions: allTransactions,
      riderWalletLedger: allWalletLedger,
    };
  } catch (error) {
    console.error('Failed to load admin workspace:', error);
    throw new Error('Failed to load admin dashboard', { cause: error });
  }
}

export async function getNotificationsForUser(uid: string, role: string) {
  try {
    const cleanUid = String(uid || '').trim();
    const cleanRole = String(role || 'customer').trim();
    if (!cleanUid) return [];

    const isAdmin = cleanRole === 'admin' || cleanRole === 'super_admin';
    const roleBroadcastUid = `role-${cleanRole}`;
    const roleCondition = isAdmin
      ? or(
          eq(notifications.recipientUid, cleanUid),
          eq(notifications.recipientUid, 'broadcast-all'),
          eq(notifications.recipientUid, roleBroadcastUid),
          eq(notifications.recipientUid, 'role-admin'),
          eq(notifications.recipientUid, 'role-super_admin'),
          eq(notifications.recipientUid, 'demo-admin-uid')
        )
      : or(
          eq(notifications.recipientUid, cleanUid),
          eq(notifications.recipientUid, 'broadcast-all'),
          eq(notifications.recipientUid, roleBroadcastUid)
        );

    return await db
      .select()
      .from(notifications)
      .where(roleCondition)
      .orderBy(desc(notifications.createdAt))
      .limit(25);
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return [];
  }
}

export async function getCustomerFavorites(customerUid: string) {
  try {
    return await db
      .select()
      .from(favorites)
      .where(eq(favorites.customerUid, customerUid));
  } catch (error) {
    console.error('Failed to fetch favorites:', error);
    return [];
  }
}

export async function toggleCustomerFavorite(customerUid: string, restaurantId: number) {
  try {
    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.customerUid, customerUid), eq(favorites.restaurantId, restaurantId)));
    if (existing.length > 0) {
      await db
        .delete(favorites)
        .where(and(eq(favorites.customerUid, customerUid), eq(favorites.restaurantId, restaurantId)));
      return { favorited: false };
    }
    await db.insert(favorites).values({ customerUid, restaurantId });
    return { favorited: true };
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
    throw new Error('Failed to update favorite', { cause: error });
  }
}
