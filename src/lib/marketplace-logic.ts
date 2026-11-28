export type DeliveryMode = 'platform' | 'restaurant' | 'third_party';
export const BUILTIN_PAYMENT_METHODS = ['bkash', 'nagad', 'sslcommerz', 'cod'] as const;
export type BuiltinPaymentMethod = (typeof BUILTIN_PAYMENT_METHODS)[number];
export type PaymentMethod = string;
export type OrderStatus =
  | 'confirmed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'rider_assigned'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export interface CartAddon {
  name: string;
  price: number;
}

export interface CartItemInput {
  foodItemId: number;
  restaurantId: number;
  name: string;
  nameBn: string;
  imageUrl: string;
  basePrice: number;
  discountPrice?: number | null;
  variationName?: string;
  variationDelta?: number;
  addons: CartAddon[];
  quantity: number;
  specialInstructions?: string;
}

export interface CouponInput {
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  value: number;
  minOrder: number;
  maxDiscount: number;
  restaurantId?: number | null;
  isActive: boolean;
  usedCount: number;
  usageLimit: number;
}

export interface OrderFinancialParams {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  serviceFee: number;
  taxAmount?: number;
  commissionType: 'percentage' | 'fixed';
  commissionRate: number;
  fixedCommission: number;
}

export interface OrderFinancialBreakdown {
  subtotal: number;
  discountAmount: number;
  netFoodRevenue: number;
  deliveryFee: number;
  serviceFee: number;
  taxAmount: number;
  totalPayable: number;
  platformCommission: number;
  restaurantEarnings: number;
}

export function formatBdt(amount: number, lang: 'bn' | 'en' = 'bn'): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('en-US');
  if (lang === 'bn') {
    return `৳${toBengaliDigits(formatted)}`;
  }
  return `৳${formatted}`;
}

export function toBengaliDigits(input: string | number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(input).replace(/\d/g, (d) => bnDigits[Number(d)] ?? d);
}

/**
 * Formats a minute duration cleanly so 60+ minutes automatically reads as hours + minutes
 * (e.g. 417 mins -> "6 hr 57 min" in EN or "৬ ঘণ্টা ৫৭ মিনিট" in BN).
 */
export function formatDurationEstimate(
  minutes: number,
  lang: 'en' | 'bn' = 'en',
  style: 'default' | 'compact' = 'default'
): string {
  const safeMins = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const formatNum = (val: number) => (lang === 'bn' ? toBengaliDigits(val) : String(val));

  if (safeMins === 0) {
    return lang === 'bn' ? '০ মিনিট' : style === 'compact' ? '0 min' : '0 mins';
  }

  if (safeMins < 60) {
    if (lang === 'bn') {
      return `${formatNum(safeMins)} মিনিট`;
    }
    return style === 'compact' || safeMins === 1
      ? `${safeMins} min`
      : `${safeMins} mins`;
  }

  const days = Math.floor(safeMins / 1440);
  const remAfterDays = safeMins % 1440;
  const hours = Math.floor(remAfterDays / 60);
  const mins = remAfterDays % 60;

  if (days > 0) {
    const partsEn: string[] = [`${days}d`];
    const partsBn: string[] = [`${formatNum(days)} দিন`];
    if (hours > 0) {
      partsEn.push(`${hours} hr`);
      partsBn.push(`${formatNum(hours)} ঘণ্টা`);
    }
    if (mins > 0 && style !== 'compact') {
      partsEn.push(`${mins} min`);
      partsBn.push(`${formatNum(mins)} মিনিট`);
    }
    return lang === 'bn' ? partsBn.join(' ') : partsEn.join(' ');
  }

  const partsEn: string[] = [`${hours} hr`];
  const partsBn: string[] = [`${formatNum(hours)} ঘণ্টা`];
  if (mins > 0) {
    partsEn.push(`${mins} min`);
    partsBn.push(`${formatNum(mins)} মিনিট`);
  }
  return lang === 'bn' ? partsBn.join(' ') : partsEn.join(' ');
}

export function calculateCartItemUnitPrice(item: Pick<CartItemInput, 'basePrice' | 'discountPrice' | 'variationDelta' | 'addons'>): number {
  const effectiveBase =
    item.discountPrice !== null && item.discountPrice !== undefined && item.discountPrice > 0
      ? item.discountPrice
      : item.basePrice;
  const variationCost = item.variationDelta ?? 0;
  const addonsCost = item.addons.reduce((sum, addon) => sum + Math.max(0, addon.price), 0);
  return Math.max(0, effectiveBase + variationCost + addonsCost);
}

export function calculateCartSubtotal(items: CartItemInput[]): number {
  return items.reduce((sum, item) => {
    const qty = Math.max(1, Math.floor(item.quantity));
    return sum + calculateCartItemUnitPrice(item) * qty;
  }, 0);
}

export function canAddToSingleRestaurantCart(
  existingItems: Pick<CartItemInput, 'restaurantId'>[],
  incomingRestaurantId: number
): boolean {
  if (existingItems.length === 0) return true;
  const existingRestId = existingItems[0].restaurantId;
  if (existingRestId === undefined || existingRestId === null) return true;
  return Number(existingRestId) === Number(incomingRestaurantId);
}

export function evaluateCoupon(
  coupon: CouponInput,
  subtotal: number,
  deliveryFee: number,
  restaurantId: number
): { valid: boolean; discountAmount: number; deliveryFeeAfterCoupon: number; reason?: string } {
  if (!coupon.isActive) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: 'Coupon is inactive' };
  }
  if (coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: 'Coupon usage limit reached' };
  }
  if (coupon.restaurantId && coupon.restaurantId !== restaurantId) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: 'Coupon not valid for this restaurant' };
  }
  if (subtotal < coupon.minOrder) {
    return {
      valid: false,
      discountAmount: 0,
      deliveryFeeAfterCoupon: deliveryFee,
      reason: `Minimum order of ৳${coupon.minOrder} required`,
    };
  }

  if (coupon.type === 'free_delivery') {
    return {
      valid: true,
      discountAmount: 0,
      deliveryFeeAfterCoupon: 0,
    };
  }

  if (coupon.type === 'fixed') {
    const discount = Math.min(subtotal, Math.max(0, coupon.value));
    return {
      valid: true,
      discountAmount: discount,
      deliveryFeeAfterCoupon: deliveryFee,
    };
  }

  // Percentage discount with maxDiscount cap
  const rawPct = Math.round((subtotal * coupon.value) / 100);
  const capped = coupon.maxDiscount > 0 ? Math.min(rawPct, coupon.maxDiscount) : rawPct;
  const discount = Math.min(subtotal, Math.max(0, capped));
  return {
    valid: true,
    discountAmount: discount,
    deliveryFeeAfterCoupon: deliveryFee,
  };
}

export function calculateOrderFinancials(params: OrderFinancialParams): OrderFinancialBreakdown {
  const subtotal = Math.max(0, Math.round(params.subtotal));
  const discountAmount = Math.min(subtotal, Math.max(0, Math.round(params.discountAmount)));
  const netFoodRevenue = Math.max(0, subtotal - discountAmount);
  const deliveryFee = Math.max(0, Math.round(params.deliveryFee));
  const serviceFee = Math.max(0, Math.round(params.serviceFee));
  const taxAmount = Math.max(0, Math.round(params.taxAmount ?? 0));

  let platformCommission = 0;
  if (netFoodRevenue > 0) {
    if (params.commissionType === 'fixed') {
      platformCommission = Math.min(netFoodRevenue, Math.max(0, Math.round(params.fixedCommission)));
    } else {
      platformCommission = Math.round((netFoodRevenue * Math.max(0, params.commissionRate)) / 100);
    }
  }

  const restaurantEarnings = Math.max(0, netFoodRevenue - platformCommission);
  const totalPayable = netFoodRevenue + deliveryFee + serviceFee + taxAmount;

  return {
    subtotal,
    discountAmount,
    netFoodRevenue,
    deliveryFee,
    serviceFee,
    taxAmount,
    totalPayable,
    platformCommission,
    restaurantEarnings,
  };
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  confirmed: ['accepted', 'preparing', 'ready', 'rider_assigned', 'cancelled'],
  accepted: ['preparing', 'ready', 'rider_assigned', 'cancelled'],
  preparing: ['ready', 'rider_assigned', 'cancelled'],
  ready: ['rider_assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'],
  rider_assigned: ['picked_up', 'on_the_way', 'delivered', 'cancelled'],
  picked_up: ['on_the_way', 'delivered'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function estimateDeliveryFeeAndEta(
  distanceKm: number,
  baseFee: number,
  deliveryMode: DeliveryMode
): { fee: number; etaMinutes: number } {
  const extraKm = Math.max(0, distanceKm - 2);
  const modeSurcharge = deliveryMode === 'third_party' ? 10 : 0;
  const fee = Math.round(baseFee + extraKm * 12 + modeSurcharge);
  const etaMinutes = Math.max(12, Math.round(14 + distanceKm * 5.5));
  return { fee, etaMinutes };
}

export function mapOpenMeteoWeather(
  weatherCode: number,
  precipitationMm: number
): { labelEn: string; labelBn: string; isRaining: boolean; rainBufferMin: number } {
  const hasPrecip = precipitationMm > 0.2;
  if (weatherCode >= 95) {
    return { labelEn: 'Thunderstorm', labelBn: 'বজ্রবৃষ্টি', isRaining: true, rainBufferMin: 12 };
  }
  if ((weatherCode >= 51 && weatherCode <= 82) || hasPrecip) {
    return { labelEn: 'Rainy', labelBn: 'বৃষ্টি হচ্ছে', isRaining: true, rainBufferMin: 7 };
  }
  if (weatherCode === 45 || weatherCode === 48) {
    return { labelEn: 'Hazy / Fog', labelBn: 'কুয়াশাচ্ছন্ন', isRaining: false, rainBufferMin: 2 };
  }
  if (weatherCode >= 1 && weatherCode <= 3) {
    return { labelEn: 'Partly Cloudy', labelBn: 'আংশিক মেঘলা', isRaining: false, rainBufferMin: 0 };
  }
  return { labelEn: 'Clear Sky', labelBn: 'পরিষ্কার আকাশ', isRaining: false, rainBufferMin: 0 };
}

export function convertBdtToCurrency(amountBdt: number, ratePerBdt: number): number {
  if (!Number.isFinite(amountBdt) || !Number.isFinite(ratePerBdt) || amountBdt <= 0 || ratePerBdt <= 0) {
    return 0;
  }
  return Math.round(amountBdt * ratePerBdt * 100) / 100;
}

export interface VendorAnalyticsOrderInput {
  id: number;
  status: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  restaurantEarnings: number;
  createdAt: string | Date;
  itemsSnapshotJson: Array<{
    foodItemId: number;
    name: string;
    nameBn: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export interface VendorAnalyticsLedgerInput {
  orderId: number | null;
  entryType: string;
  grossAmount: number;
  netRestaurantAmount: number;
  createdAt: string | Date;
}

export interface VendorAnalyticsMenuItemInput {
  id: number;
  name: string;
  nameBn: string;
  category: string;
  imageUrl?: string;
}

export interface VendorPeriodPoint {
  key: string;
  label: string;
  orders: number;
  grossRevenue: number;
  netRevenue: number;
}

export interface TopSellingFoodItem {
  foodItemId: number;
  name: string;
  nameBn: string;
  category: string;
  quantitySold: number;
  revenue: number;
  orderCount: number;
}

export interface VendorAnalyticsSummary {
  dailySeries: VendorPeriodPoint[];
  monthlySeries: VendorPeriodPoint[];
  topSellingItems: TopSellingFoodItem[];
  totalOrders: number;
  deliveredOrders: number;
  grossRevenue: number;
  netVendorRevenue: number;
  avgOrderValue: number;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildVendorAnalytics(
  ordersList: VendorAnalyticsOrderInput[],
  _ledgerList: VendorAnalyticsLedgerInput[] = [],
  menuItems: VendorAnalyticsMenuItemInput[] = []
): VendorAnalyticsSummary {
  const menuMap = new Map<number, VendorAnalyticsMenuItemInput>();
  for (const m of menuItems) {
    menuMap.set(m.id, m);
  }

  const dailyMap = new Map<string, VendorPeriodPoint>();
  const monthlyMap = new Map<string, VendorPeriodPoint>();
  const itemMap = new Map<string, TopSellingFoodItem>();

  let totalOrders = 0;
  let deliveredOrders = 0;
  let grossRevenue = 0;
  let netVendorRevenue = 0;

  for (const order of ordersList) {
    if (order.status === 'cancelled') continue;
    totalOrders += 1;
    if (order.status === 'delivered') deliveredOrders += 1;

    const orderGross = Math.max(0, order.subtotal - (order.discountAmount || 0));
    const orderNet = Math.max(0, order.restaurantEarnings || 0);
    grossRevenue += orderGross;
    netVendorRevenue += orderNet;

    const d = new Date(order.createdAt);
    const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
    const yyyy = validDate.getUTCFullYear();
    const mmNum = validDate.getUTCMonth();
    const ddNum = validDate.getUTCDate();
    const mm = String(mmNum + 1).padStart(2, '0');
    const dd = String(ddNum).padStart(2, '0');

    const dayKey = `${yyyy}-${mm}-${dd}`;
    const dayLabel = `${MONTH_SHORT[mmNum]} ${ddNum}`;
    const dayEntry = dailyMap.get(dayKey) ?? {
      key: dayKey,
      label: dayLabel,
      orders: 0,
      grossRevenue: 0,
      netRevenue: 0,
    };
    dayEntry.orders += 1;
    dayEntry.grossRevenue += orderGross;
    dayEntry.netRevenue += orderNet;
    dailyMap.set(dayKey, dayEntry);

    const monthKey = `${yyyy}-${mm}`;
    const monthLabel = `${MONTH_SHORT[mmNum]} ${String(yyyy).slice(-2)}`;
    const monthEntry = monthlyMap.get(monthKey) ?? {
      key: monthKey,
      label: monthLabel,
      orders: 0,
      grossRevenue: 0,
      netRevenue: 0,
    };
    monthEntry.orders += 1;
    monthEntry.grossRevenue += orderGross;
    monthEntry.netRevenue += orderNet;
    monthlyMap.set(monthKey, monthEntry);

    const seenInOrder = new Set<string>();
    const items = Array.isArray(order.itemsSnapshotJson) ? order.itemsSnapshotJson : [];
    for (const line of items) {
      const qty = Math.max(1, Number(line.quantity) || 1);
      const lineRev = Math.max(0, Number(line.lineTotal) || Number(line.unitPrice || 0) * qty);
      const itemKey = line.foodItemId ? `id:${line.foodItemId}` : `name:${line.name}`;
      const matchedMenu = line.foodItemId ? menuMap.get(line.foodItemId) : undefined;
      const existing = itemMap.get(itemKey) ?? {
        foodItemId: line.foodItemId || 0,
        name: matchedMenu?.name || line.name,
        nameBn: matchedMenu?.nameBn || line.nameBn || line.name,
        category: matchedMenu?.category || 'Menu Item',
        quantitySold: 0,
        revenue: 0,
        orderCount: 0,
      };
      existing.quantitySold += qty;
      existing.revenue += lineRev;
      if (!seenInOrder.has(itemKey)) {
        existing.orderCount += 1;
        seenInOrder.add(itemKey);
      }
      itemMap.set(itemKey, existing);
    }
  }

  const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const monthlySeries = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const topSellingItems = Array.from(itemMap.values()).sort(
    (a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue
  );

  return {
    dailySeries,
    monthlySeries,
    topSellingItems,
    totalOrders,
    deliveredOrders,
    grossRevenue,
    netVendorRevenue,
    avgOrderValue: totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0,
  };
}

export interface LiveRiderEtaResult {
  remainingKm: number;
  etaMinutes: number;
  arrived: boolean;
}

export function calculateLiveRiderEta(
  riderLat: number,
  riderLng: number,
  destLat: number,
  destLng: number,
  status: string = 'on_the_way',
  speedKmPerHour: number = 22
): LiveRiderEtaResult {
  if (status === 'delivered') {
    return { remainingKm: 0, etaMinutes: 0, arrived: true };
  }
  if (
    !Number.isFinite(riderLat) ||
    !Number.isFinite(riderLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return { remainingKm: 0, etaMinutes: 15, arrived: false };
  }
  const remainingKm = haversineDistanceKm(riderLat, riderLng, destLat, destLng);
  const arrived = remainingKm <= 0.12;
  const safeSpeed = Math.max(8, speedKmPerHour);
  const travelMins = (remainingKm / safeSpeed) * 60;
  const etaMinutes = arrived ? 1 : Math.max(2, Math.round(travelMins + 2));
  return { remainingKm, etaMinutes, arrived };
}

export function advanceRiderAlongRoute(
  currentLat: number,
  currentLng: number,
  targetLat: number,
  targetLng: number,
  fraction: number = 0.35
): { lat: number; lng: number } {
  const dist = haversineDistanceKm(currentLat, currentLng, targetLat, targetLng);
  if (dist <= 0.08) {
    return {
      lat: Math.round(targetLat * 1e6) / 1e6,
      lng: Math.round(targetLng * 1e6) / 1e6,
    };
  }
  const step = Math.min(1, Math.max(0.05, fraction));
  const nextLat = currentLat + (targetLat - currentLat) * step;
  const nextLng = currentLng + (targetLng - currentLng) * step;
  return {
    lat: Math.round(nextLat * 1e6) / 1e6,
    lng: Math.round(nextLng * 1e6) / 1e6,
  };
}

export const PRIMARY_SUPER_ADMIN_EMAIL = 'raqkibrony@gmail.com';
export const ADMIN_PIN_DEFAULT_EMAIL = 'raqkibrony@gmail.com';
export const SECONDARY_SUPER_ADMIN_EMAIL = 'rakibraqkib@gmail.com';
export const PROTECTED_SUPER_ADMIN_EMAILS = [
  PRIMARY_SUPER_ADMIN_EMAIL,
  SECONDARY_SUPER_ADMIN_EMAIL,
] as const;

export function isProtectedSuperAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (PROTECTED_SUPER_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function canActorModifyUserAccount(params: {
  actorUid: string;
  actorRole: string;
  targetUid: string;
  targetEmail: string;
  currentRole: string;
  nextRole: string;
  nextStatus: string;
}): { allowed: boolean; reason?: string } {
  const { actorUid, actorRole, targetUid, targetEmail, currentRole, nextRole, nextStatus } = params;
  if (actorRole !== 'admin' && actorRole !== 'super_admin') {
    return { allowed: false, reason: 'Only authorized Admin accounts can modify user roles.' };
  }
  if (isProtectedSuperAdminEmail(targetEmail)) {
    if (nextRole !== 'super_admin' || nextStatus === 'suspended') {
      return {
        allowed: false,
        reason: 'Primary Super Admin account is protected and cannot be demoted or suspended.',
      };
    }
  }
  if (actorUid === targetUid && nextStatus === 'suspended') {
    return { allowed: false, reason: 'You cannot suspend your own active admin account.' };
  }
  const touchesPrivilegedRole =
    currentRole === 'super_admin' ||
    currentRole === 'admin' ||
    nextRole === 'super_admin' ||
    nextRole === 'admin';
  if (touchesPrivilegedRole && actorRole !== 'super_admin') {
    return {
      allowed: false,
      reason: 'Only Super Admin can grant or modify Admin and Super Admin privileges.',
    };
  }
  return { allowed: true };
}

export type BroadcastTargetRole = 'all' | 'customer' | 'restaurant_owner' | 'rider' | 'admin';

export function validateBroadcastNotification(input: {
  targetRole: string;
  title: string;
  message: string;
  type?: string;
}):
  | {
      valid: true;
      targetRole: BroadcastTargetRole;
      title: string;
      message: string;
      type: 'system' | 'promo' | 'order';
    }
  | { valid: false; reason: string } {
  const allowedTargets: BroadcastTargetRole[] = [
    'all',
    'customer',
    'restaurant_owner',
    'rider',
    'admin',
  ];
  if (!allowedTargets.includes(input.targetRole as BroadcastTargetRole)) {
    return { valid: false, reason: 'Invalid broadcast target role.' };
  }
  const title = input.title.trim();
  const message = input.message.trim();
  if (title.length < 3 || title.length > 120) {
    return { valid: false, reason: 'Broadcast title must be between 3 and 120 characters.' };
  }
  if (message.length < 5 || message.length > 500) {
    return { valid: false, reason: 'Broadcast message must be between 5 and 500 characters.' };
  }
  const type = input.type === 'promo' || input.type === 'order' ? input.type : 'system';
  return {
    valid: true,
    targetRole: input.targetRole as BroadcastTargetRole,
    title,
    message,
    type,
  };
}

export interface StorefrontProductFilterInput {
  id: number;
  name: string;
  nameBn: string;
  category: string;
  description?: string;
  price: number;
  discountPrice: number | null;
  inStock: boolean;
  isAvailable: boolean;
  isPopular: boolean;
  isVisibleOnStorefront?: boolean;
  restaurantName: string;
  restaurantCuisine: string;
  deliveryMode: string;
}

export function isProductVisibleToCustomers(item: {
  isVisibleOnStorefront?: boolean;
  isAvailable?: boolean;
}): boolean {
  return item.isVisibleOnStorefront !== false && item.isAvailable !== false;
}

export function filterStorefrontProducts<T extends StorefrontProductFilterInput>(
  products: T[],
  opts: {
    cuisine?: string;
    query?: string;
    onlyDiscount?: boolean;
    deliveryFleet?: 'all' | 'platform' | 'third_party';
  } = {}
): T[] {
  const q = (opts.query || '').trim().toLowerCase();
  const cuisine = (opts.cuisine || 'All').trim().toLowerCase();
  const fleet = opts.deliveryFleet || 'all';

  return products
    .filter((item) => {
      if (!isProductVisibleToCustomers(item)) return false;
      if (cuisine && cuisine !== 'all') {
        const hay = `${item.category} ${item.restaurantCuisine} ${item.name}`.toLowerCase();
        if (!hay.includes(cuisine)) return false;
      }
      if (opts.onlyDiscount && !(item.discountPrice && item.discountPrice < item.price)) {
        return false;
      }
      if (fleet !== 'all' && item.deliveryMode !== fleet) {
        return false;
      }
      if (q) {
        const hay = `${item.name} ${item.nameBn} ${item.category} ${item.description || ''} ${item.restaurantName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
      return b.id - a.id;
    });
}

export interface PartnerProductInput {
  name?: unknown;
  nameBn?: unknown;
  category?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  price?: unknown;
  discountPrice?: unknown;
  inStock?: unknown;
  isAvailable?: unknown;
  isPopular?: unknown;
  variations?: unknown;
  addons?: unknown;
}

export interface NormalizedPartnerProduct {
  name: string;
  nameBn: string;
  category: string;
  description: string;
  imageUrl: string;
  price: number;
  discountPrice: number | null;
  inStock: boolean;
  isAvailable: boolean;
  isPopular: boolean;
  variationsJson: Array<{ name: string; priceDelta: number }>;
  addonsJson: Array<{ name: string; price: number }>;
}

export function normalizePartnerProductInput(
  raw: PartnerProductInput,
  fallbackImageUrl: string
): { valid: true; product: NormalizedPartnerProduct } | { valid: false; reason: string } {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length < 2 || name.length > 140) {
    return { valid: false, reason: 'Product name must be between 2 and 140 characters.' };
  }
  const nameBn =
    typeof raw.nameBn === 'string' && raw.nameBn.trim().length > 0 ? raw.nameBn.trim() : name;
  const category =
    typeof raw.category === 'string' && raw.category.trim().length >= 2
      ? raw.category.trim()
      : 'Popular';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const imageUrl =
    typeof raw.imageUrl === 'string' && raw.imageUrl.trim().length > 0
      ? raw.imageUrl.trim()
      : fallbackImageUrl;
  const price = Math.round(Number(raw.price));
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: 'Product price must be a positive number in BDT.' };
  }
  let discountPrice: number | null = null;
  if (raw.discountPrice !== undefined && raw.discountPrice !== null && raw.discountPrice !== '') {
    const parsedDiscount = Math.round(Number(raw.discountPrice));
    if (!Number.isFinite(parsedDiscount) || parsedDiscount <= 0 || parsedDiscount >= price) {
      return {
        valid: false,
        reason: 'discountPrice must be a positive number lower than regular price.',
      };
    }
    discountPrice = parsedDiscount;
  }

  const variationsJson = Array.isArray(raw.variations)
    ? raw.variations
        .filter((v): v is { name: string; priceDelta?: number } => Boolean(v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string'))
        .map((v) => ({
          name: v.name.trim() || 'Regular',
          priceDelta: Math.round(Number(v.priceDelta) || 0),
        }))
    : [];

  const addonsJson = Array.isArray(raw.addons)
    ? raw.addons
        .filter((a): a is { name: string; price?: number } => Boolean(a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string'))
        .map((a) => ({
          name: a.name.trim(),
          price: Math.max(0, Math.round(Number(a.price) || 0)),
        }))
        .filter((a) => a.name.length > 0)
    : [];

  return {
    valid: true,
    product: {
      name,
      nameBn,
      category,
      description,
      imageUrl,
      price,
      discountPrice,
      inStock: raw.inStock === undefined ? true : Boolean(raw.inStock),
      isAvailable: raw.isAvailable === undefined ? true : Boolean(raw.isAvailable),
      isPopular: raw.isPopular === undefined ? false : Boolean(raw.isPopular),
      variationsJson: variationsJson.length > 0 ? variationsJson : [{ name: 'Regular', priceDelta: 0 }],
      addonsJson,
    },
  };
}

export type PaymentProviderType = 'mfs' | 'card' | 'wallet' | 'cod' | 'custom';
export type PaymentGatewayMode = 'sandbox' | 'live';

export interface PaymentGatewayRowLike {
  code: string;
  name: string;
  nameBn: string;
  providerType: string;
  mode: string;
  isActive: boolean;
  apiBaseUrl?: string | null;
  merchantId?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  webhookSecret?: string | null;
  instructions?: string | null;
  sortOrder?: number | null;
}

export const DEFAULT_PAYMENT_GATEWAYS: Array<{
  code: string;
  name: string;
  nameBn: string;
  providerType: PaymentProviderType;
  mode: PaymentGatewayMode;
  isActive: boolean;
  apiBaseUrl: string;
  instructions: string;
  sortOrder: number;
}> = [
  {
    code: 'bkash',
    name: 'bKash',
    nameBn: 'বিকাশ',
    providerType: 'mfs',
    mode: 'sandbox',
    isActive: true,
    apiBaseUrl: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    instructions: 'Pay securely via bKash tokenized checkout.',
    sortOrder: 1,
  },
  {
    code: 'nagad',
    name: 'Nagad',
    nameBn: 'নগদ',
    providerType: 'mfs',
    mode: 'sandbox',
    isActive: true,
    apiBaseUrl: 'https://api.mynagad.com/api/dfs',
    instructions: 'Fast MFS checkout with Nagad merchant wallet.',
    sortOrder: 2,
  },
  {
    code: 'sslcommerz',
    name: 'SSLCommerz / Card',
    nameBn: 'এসএসএলকমার্জ / কার্ড',
    providerType: 'card',
    mode: 'sandbox',
    isActive: true,
    apiBaseUrl: 'https://sandbox.sslcommerz.com',
    instructions: 'Visa, Mastercard, AMEX & Net Banking.',
    sortOrder: 3,
  },
  {
    code: 'cod',
    name: 'Cash on Delivery',
    nameBn: 'ক্যাশ অন ডেলিভারি',
    providerType: 'cod',
    mode: 'live',
    isActive: true,
    apiBaseUrl: '',
    instructions: 'Pay in cash to the rider at delivery.',
    sortOrder: 4,
  },
];

export function normalizeGatewayCode(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function maskSecretValue(secret: string | null | undefined): string {
  const clean = typeof secret === 'string' ? secret.trim() : '';
  if (!clean) return '';
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}

export function isGatewayCredentialsConfigured(
  row: Pick<PaymentGatewayRowLike, 'code' | 'merchantId' | 'apiKey' | 'apiSecret'>,
  envConfigured = false
): boolean {
  if (normalizeGatewayCode(row.code) === 'cod') return true;
  const hasDbCreds = Boolean(
    (row.apiKey && row.apiKey.trim()) ||
      (row.apiSecret && row.apiSecret.trim()) ||
      (row.merchantId && row.merchantId.trim())
  );
  return hasDbCreds || envConfigured;
}

export function buildGatewayWebhookUrl(origin: string, code: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanCode = normalizeGatewayCode(code) || 'custom';
  return `${cleanOrigin}/api/payments/webhook/${cleanCode}`;
}

export function toPublicPaymentGatewayView(
  row: PaymentGatewayRowLike,
  envConfigured = false
) {
  const providerType = (['mfs', 'card', 'wallet', 'cod', 'custom'].includes(row.providerType)
    ? row.providerType
    : 'custom') as PaymentProviderType;
  const mode = (row.mode === 'live' ? 'live' : 'sandbox') as PaymentGatewayMode;
  return {
    code: normalizeGatewayCode(row.code),
    name: row.name,
    nameBn: row.nameBn || row.name,
    providerType,
    mode,
    isActive: Boolean(row.isActive),
    instructions: row.instructions || '',
    sortOrder: Number(row.sortOrder ?? 10),
    isConfigured: isGatewayCredentialsConfigured(row, envConfigured),
  };
}

export function toAdminPaymentGatewayView(
  row: PaymentGatewayRowLike,
  origin: string,
  envConfigured = false
) {
  const pub = toPublicPaymentGatewayView(row, envConfigured);
  const apiKey = typeof row.apiKey === 'string' ? row.apiKey.trim() : '';
  const apiSecret = typeof row.apiSecret === 'string' ? row.apiSecret.trim() : '';
  const webhookSecret = typeof row.webhookSecret === 'string' ? row.webhookSecret.trim() : '';
  return {
    ...pub,
    apiBaseUrl: row.apiBaseUrl || '',
    merchantId: row.merchantId || '',
    hasApiKey: apiKey.length > 0,
    hasApiSecret: apiSecret.length > 0,
    hasWebhookSecret: webhookSecret.length > 0,
    apiKeyPreview: maskSecretValue(apiKey),
    apiSecretPreview: maskSecretValue(apiSecret),
    webhookSecretPreview: maskSecretValue(webhookSecret),
    webhookUrl: buildGatewayWebhookUrl(origin, pub.code),
  };
}

export function isGatewaySelectableAtCheckout(gateway: { isActive: boolean }): boolean {
  return Boolean(gateway.isActive);
}

export function isOwnerRestaurant(
  restaurantOwnerUid: string | null | undefined,
  actorUid: string | null | undefined
): boolean {
  if (!restaurantOwnerUid || !actorUid) return false;
  return restaurantOwnerUid.trim() === actorUid.trim();
}

export function partitionOwnedVsPartnerRestaurants<T extends { id: number; ownerUid: string }>(
  restaurants: T[],
  actorUid: string
): { own: T[]; partners: T[]; ordered: T[] } {
  const own: T[] = [];
  const partners: T[] = [];
  for (const r of restaurants) {
    if (isOwnerRestaurant(r.ownerUid, actorUid)) {
      own.push(r);
    } else {
      partners.push(r);
    }
  }
  return {
    own,
    partners,
    ordered: [...own, ...partners],
  };
}

export function escapeXml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/admin/',
    'Disallow: /api/vendor/',
    'Disallow: /api/auth/',
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(
  origin: string,
  restaurants: Array<{ slug: string; updatedAt?: string | Date | null }>,
  options?: { areas?: string[]; cuisines?: string[] }
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    {
      loc: `${cleanOrigin}/`,
      lastmod: today,
      changefreq: 'daily',
      priority: '1.0',
    },
  ];

  const seenSlugs = new Set<string>();
  for (const r of restaurants) {
    const slug = String(r.slug || '').trim();
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    let lastmod = today;
    if (r.updatedAt) {
      const d = new Date(r.updatedAt);
      if (!Number.isNaN(d.getTime())) {
        lastmod = d.toISOString().slice(0, 10);
      }
    }
    urls.push({
      loc: `${cleanOrigin}/?restaurant=${encodeURIComponent(slug)}`,
      lastmod,
      changefreq: 'daily',
      priority: '0.9',
    });
  }

  for (const area of options?.areas || []) {
    const clean = String(area || '').trim();
    if (!clean) continue;
    urls.push({
      loc: `${cleanOrigin}/?area=${encodeURIComponent(clean)}`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }

  for (const cuisine of options?.cuisines || []) {
    const clean = String(cuisine || '').trim();
    if (!clean) continue;
    urls.push({
      loc: `${cleanOrigin}/?cuisine=${encodeURIComponent(clean)}`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  const urlNodes = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes}\n</urlset>\n`;
}

export const BANGLADESH_COORDS_BOUNDS = {
  minLat: 20.5,
  maxLat: 26.7,
  minLng: 88.0,
  maxLng: 92.7,
} as const;

export function isWithinBangladesh(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BANGLADESH_COORDS_BOUNDS.minLat &&
    lat <= BANGLADESH_COORDS_BOUNDS.maxLat &&
    lng >= BANGLADESH_COORDS_BOUNDS.minLng &&
    lng <= BANGLADESH_COORDS_BOUNDS.maxLng
  );
}

export function resolveNearestAreaFromList<T extends { name: string; lat: number; lng: number }>(
  lat: number,
  lng: number,
  areas: readonly T[]
): { area: T | null; distanceKm: number; label: string } {
  if (!areas || areas.length === 0) {
    return { area: null, distanceKm: 0, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  }
  let best = areas[0];
  let bestDist = Infinity;
  for (const a of areas) {
    const d = haversineDistanceKm(lat, lng, a.lat, a.lng);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  const thresholdKm = bestDist <= 18 ? best.name : `${best.name} (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  return { area: best, distanceKm: bestDist, label: thresholdKm };
}

export function buildOrderTrackingUrl(
  origin: string,
  orderId: number,
  trackingToken?: string | null
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const base = `${cleanOrigin}/?order=${encodeURIComponent(String(orderId))}`;
  const tok = String(trackingToken || '').trim();
  return tok ? `${base}&token=${encodeURIComponent(tok)}` : base;
}

export function doesEmailMatchOrder(orderEmail: string | null | undefined, queryEmail: string): boolean {
  const a = String(orderEmail || '').trim().toLowerCase();
  const b = String(queryEmail || '').trim().toLowerCase();
  return Boolean(a && b && a === b);
}

export function isGooglePlusCodeSegment(segment: string): boolean {
  const clean = String(segment || '').trim();
  if (!clean) return false;
  // Matches Google Open Location Code / Plus Codes such as "Q9R7+M24", "Q9W8+XR Dhaka", "7MQ8Q9W8+3J"
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}(?:\s|$)/i.test(clean);
}

export function isAdministrativeNoiseSegment(segment: string): boolean {
  const clean = String(segment || '').trim();
  if (!clean) return true;
  if (isGooglePlusCodeSegment(clean)) return true;
  const lower = clean.toLowerCase();
  if (
    lower === 'bangladesh' ||
    clean === 'বাংলাদেশ' ||
    lower === 'unnamed road' ||
    lower === 'road' ||
    /^ward[\s-]*(no\.?\s*)?\d+/i.test(clean) ||
    /^ওয়ার্ড[\s-]*(নং\.?\s*)?[\d০-৯]+/.test(clean) ||
    /city corporation/i.test(clean) ||
    /সিটি কর্পোরেশন/.test(clean) ||
    /\bmetropolitan\b/i.test(clean) ||
    /\bdistrict\b/i.test(clean) ||
    /\bdivision\b/i.test(clean) ||
    /(জেলা|বিভাগ|মহানগর)$/.test(clean) ||
    /^\d{4}$/.test(clean)
  ) {
    return true;
  }
  return false;
}

function stripTrailingPostalCode(segment: string): string {
  return String(segment || '')
    .replace(/\bDhaka\s+\d{4}\b/gi, 'Dhaka')
    .replace(/[\s,-]+\d{4}$/, '')
    .trim();
}

export function cleanMapAddressSegments(rawAddress: string): string[] {
  const parts = String(rawAddress || '')
    .split(',')
    .map((p) => stripTrailingPostalCode(p))
    .filter(Boolean)
    .filter((p) => !isAdministrativeNoiseSegment(p));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }
  return unique;
}

const AREA_ALIAS_RULES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bgulshan[\s-]*2\b|গুলশান[\s-]*২/i, canonical: 'Gulshan 2' },
  { pattern: /\bgulshan[\s-]*1\b|গুলশান[\s-]*১/i, canonical: 'Gulshan 1' },
  { pattern: /\bniketan\b|নিকেতন/i, canonical: 'Niketan' },
  { pattern: /\bshahjadpur\b|শাহজাদপুর/i, canonical: 'Shahjadpur' },
  { pattern: /\bchairman\s*bari\b|চেয়ারম্যান\s*বাড়ি/i, canonical: 'Chairman Bari' },
  { pattern: /\bkakoli\b|কাকলী/i, canonical: 'Kakoli' },
  { pattern: /\bbanani\b|বনানী/i, canonical: 'Banani' },
  { pattern: /\bsatmasjid\b|সাতমসজিদ/i, canonical: 'Satmasjid Road' },
  { pattern: /\bjigatola\b|\bzhigatola\b|জিগাতলা/i, canonical: 'Jigatola' },
  { pattern: /\bkalabagan\b|কলাবাগান/i, canonical: 'Kalabagan' },
  { pattern: /\bdhanmondi\s*(?:27|16)\b|ধানমন্ডি\s*(?:২৭|১৬)/i, canonical: 'Dhanmondi 27' },
  { pattern: /\bdhanmondi\b|ধানমন্ডি/i, canonical: 'Dhanmondi 1–32' },
  { pattern: /\bpallabi\b|পল্লবী/i, canonical: 'Pallabi' },
  { pattern: /\bkazipara\b|কাজীপাড়া/i, canonical: 'Kazipara' },
  { pattern: /\bmirpur[\s-]*10\b|মিরপুর[\s-]*১০/i, canonical: 'Mirpur 10' },
  { pattern: /\bmirpur[\s-]*11\b|মিরপুর[\s-]*১১/i, canonical: 'Mirpur 11' },
  { pattern: /\bmirpur[\s-]*12\b|মিরপুর[\s-]*১২/i, canonical: 'Mirpur 12' },
  { pattern: /\bmirpur[\s-]*1\b|মিরপুর[\s-]*১/i, canonical: 'Mirpur 1' },
  { pattern: /\bmirpur[\s-]*2\b|মিরপুর[\s-]*২/i, canonical: 'Mirpur 2' },
  { pattern: /\bmirpur[\s-]*6\b|মিরপুর[\s-]*৬/i, canonical: 'Mirpur 6' },
  { pattern: /\brajlaxmi\b|রাজলক্ষ্মী/i, canonical: 'Rajlaxmi' },
  { pattern: /\bjashimuddin\b|জসিমউদ্দীন/i, canonical: 'Jashimuddin' },
  { pattern: /\babdullahpur\b|আব্দুল্লাহপুর/i, canonical: 'Abdullahpur' },
  { pattern: /\buttara\b|উত্তরা/i, canonical: 'Uttara Sector 7' },
  { pattern: /\btown\s*hall\b|টাউন\s*হল/i, canonical: 'Town Hall' },
  { pattern: /\bbosila\b|\bbashila\b|বসিলা/i, canonical: 'Bosila' },
  { pattern: /\badabor\b|আদাবর/i, canonical: 'Adabor' },
  { pattern: /\bshyamoli\b|শ্যামলী/i, canonical: 'Shyamoli' },
  { pattern: /\bmohammadpur\b|মোহাম্মদপুর/i, canonical: 'Mohammadpur' },
  { pattern: /\bjamuna\s*future\s*park\b|যমুনা\s*ফিউচার/i, canonical: 'Jamuna Future Park' },
  { pattern: /\bkuril\b|কুড়িল/i, canonical: 'Kuril' },
  { pattern: /\bvatara\b|\bbhatara\b|ভাটারা/i, canonical: 'Vatara' },
  { pattern: /\bbashundhara\b|বসুন্ধরা/i, canonical: 'Bashundhara R/A' },
  { pattern: /\bmerul\s*badda\b|মেরুল\s*বাড্ডা/i, canonical: 'Merul Badda' },
  { pattern: /\brampura\b|রামপুরা/i, canonical: 'Rampura' },
  { pattern: /\baftabnagar\b|আফতাবনগর/i, canonical: 'Aftabnagar' },
  { pattern: /\bbadda\b|বাড্ডা/i, canonical: 'Badda' },
  { pattern: /\bpaltan\b|\bpurana\s*paltan\b|\bnaya\s*paltan\b|পল্টন/i, canonical: 'Paltan' },
  { pattern: /\bfakirapool\b|ফকিরাপুল/i, canonical: 'Fakirapool' },
  { pattern: /\barambagh\b|আরামবাগ/i, canonical: 'Arambagh' },
  { pattern: /\bkamalapur\b|কমলাপুর/i, canonical: 'Kamalapur' },
  { pattern: /\bmotijheel\b|মতিঝিল/i, canonical: 'Motijheel' },
  { pattern: /\bchawkbazar\b|চকবাজার/i, canonical: 'Chawkbazar' },
  { pattern: /\bbangshal\b|বংশাল/i, canonical: 'Bangshal' },
  { pattern: /\blalbagh\b|লালবাগ/i, canonical: 'Lalbagh' },
  { pattern: /\bwari\b|ওয়ারী/i, canonical: 'Wari' },
  { pattern: /\bsutrapur\b|সূত্রাপুর/i, canonical: 'Sutrapur' },
  { pattern: /\bkarwan\s*bazar\b|কারওয়ান\s*বাজার/i, canonical: 'Karwan Bazar' },
  { pattern: /\bkawran\s*bazar\b|কাওরান\s*বাজার/i, canonical: 'Kawran Bazar' },
  { pattern: /\bfarmgate\b|ফার্মগেট/i, canonical: 'Farmgate' },
  { pattern: /\btejgaon\b|তেজগাঁও/i, canonical: 'Tejgaon' },
  { pattern: /\btaltola\b|তালতলা/i, canonical: 'Taltola' },
  { pattern: /\bmalibagh\b|মালিবাগ/i, canonical: 'Malibagh' },
  { pattern: /\bgoran\b|গোরান/i, canonical: 'Goran' },
  { pattern: /\bkhilgaon\b|খিলগাঁও/i, canonical: 'Khilgaon' },
];

export function matchCanonicalAreaFromHints(
  hints: ReadonlyArray<string | null | undefined>,
  lat: number,
  lng: number,
  presets: readonly { name: string; nameBn?: string; lat: number; lng: number }[]
): string {
  const cleanedHints = hints
    .flatMap((h) => String(h || '').split(','))
    .map((h) => stripTrailingPostalCode(h))
    .filter((h) => h && !isAdministrativeNoiseSegment(h) && !/^Pinned\s*\(/i.test(h));

  // 1. Direct match against preset names
  for (const hint of cleanedHints) {
    const lowerHint = hint.toLowerCase();
    const direct = presets.find(
      (p) => p.name.toLowerCase() === lowerHint || (p.nameBn && p.nameBn.toLowerCase() === lowerHint)
    );
    if (direct) return direct.name;
  }

  // 2. Alias match (e.g. "Gulshan" + coords near Gulshan 1 vs 2, or "Banani Model Town" -> "Banani")
  const combined = cleanedHints.join(' , ');
  for (const rule of AREA_ALIAS_RULES) {
    if (rule.pattern.test(combined)) {
      const matched = presets.find((p) => p.name.toLowerCase() === rule.canonical.toLowerCase());
      if (matched) return matched.name;
      return rule.canonical;
    }
  }
  if (/\bgulshan\b|গুলশান/i.test(combined)) {
    const gulshanOnly = presets.filter((p) => /gulshan/i.test(p.name));
    if (gulshanOnly.length > 0) {
      return resolveNearestAreaFromList(lat, lng, gulshanOnly).area?.name || 'Gulshan 2';
    }
  }
  if (/\bmirpur\b|মিরপুর/i.test(combined)) {
    const mirpurOnly = presets.filter((p) => /mirpur/i.test(p.name));
    if (mirpurOnly.length > 0) {
      return resolveNearestAreaFromList(lat, lng, mirpurOnly).area?.name || 'Mirpur 10';
    }
  }

  // 3. Nearest preset if coordinate is close (<= 2.2 km) and no distinct local suburb name exists
  const nearest = resolveNearestAreaFromList(lat, lng, presets);
  const specificHint = cleanedHints.find(
    (h) => !/^(dhaka|chattogram|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh|ঢাকা)$/i.test(h)
  );
  if (specificHint) {
    return specificHint;
  }
  if (nearest.area && nearest.distanceKm <= 6) {
    return nearest.area.name;
  }
  return cleanedHints[0] || nearest.area?.name || `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

export interface GoogleGeocodeResultLike {
  formatted_address?: string;
  types?: string[];
  address_components?: Array<{ long_name: string; short_name?: string; types: string[] }>;
}

export function extractCleanGoogleGeocodeAddress(
  results: readonly GoogleGeocodeResultLike[],
  lat: number,
  lng: number,
  presets: readonly { name: string; nameBn?: string; lat: number; lng: number }[]
): { areaName: string; displayName: string } {
  if (!results || results.length === 0) {
    const nearest = resolveNearestAreaFromList(lat, lng, presets);
    const fallbackArea =
      nearest.area && nearest.distanceKm <= 5
        ? nearest.area.name
        : `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    return {
      areaName: fallbackArea,
      displayName: `${fallbackArea}, Bangladesh`,
    };
  }

  // Prefer non-plus-code results (street_address, premise, route, sublocality, neighborhood)
  const preferred =
    results.find(
      (r) =>
        r.formatted_address &&
        !r.types?.includes('plus_code') &&
        !isGooglePlusCodeSegment(r.formatted_address.split(',')[0] || '')
    ) ||
    results.find(
      (r) =>
        r.address_components &&
        r.address_components.some(
          (c) =>
            c.types.includes('route') ||
            c.types.includes('sublocality_level_1') ||
            c.types.includes('neighborhood')
        )
    ) ||
    results[0];

  const allComponents = results.flatMap((r) => r.address_components || []);
  const pickComponent = (types: string[]) =>
    allComponents.find((c) => types.some((t) => c.types.includes(t)))?.long_name || '';

  const premise = pickComponent(['premise', 'point_of_interest', 'establishment']);
  const streetNum = pickComponent(['street_number']);
  const route = pickComponent(['route']);
  const neighborhood = pickComponent(['neighborhood', 'sublocality_level_2']);
  const sublocality = pickComponent(['sublocality_level_1', 'sublocality']);
  const locality = pickComponent(['locality', 'administrative_area_level_2']);

  const canonicalArea = matchCanonicalAreaFromHints(
    [neighborhood, sublocality, route, preferred?.formatted_address || '', locality],
    lat,
    lng,
    presets
  );

  const structuredParts: string[] = [];
  if (premise && !isAdministrativeNoiseSegment(premise)) structuredParts.push(premise);
  const roadPart = [streetNum, route].filter(Boolean).join(' ').trim();
  if (roadPart && !isAdministrativeNoiseSegment(roadPart)) structuredParts.push(roadPart);
  if (neighborhood && !isAdministrativeNoiseSegment(neighborhood)) structuredParts.push(neighborhood);
  if (sublocality && !isAdministrativeNoiseSegment(sublocality)) structuredParts.push(sublocality);
  if (canonicalArea && !/^Pinned\s*\(/i.test(canonicalArea)) structuredParts.push(canonicalArea);
  if (locality && !isAdministrativeNoiseSegment(locality)) structuredParts.push(locality);

  const formattedSegments = cleanMapAddressSegments(preferred?.formatted_address || '');
  const mergedSegments = formattedSegments.length >= 2 ? formattedSegments : structuredParts;

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const seg of mergedSegments) {
    const cleanSeg = stripTrailingPostalCode(seg);
    if (!cleanSeg || isAdministrativeNoiseSegment(cleanSeg)) continue;
    const key = cleanSeg.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(cleanSeg);
    }
  }

  const displayName =
    deduped.length > 0
      ? `${deduped.slice(0, 4).join(', ')}, Bangladesh`
      : `${canonicalArea}, Bangladesh`;

  return {
    areaName: canonicalArea,
    displayName,
  };
}

export function formatResolvedMapAddress(input: {
  displayName?: string | null;
  areaName?: string | null;
  lat?: number;
  lng?: number;
}): string {
  const cleanDisplay = String(input.displayName || '').trim();
  if (cleanDisplay) {
    const cleaned = cleanMapAddressSegments(cleanDisplay);
    if (cleaned.length > 0) {
      return `${cleaned.slice(0, 4).join(', ')}, Bangladesh`;
    }
  }
  const cleanArea = String(input.areaName || '').trim();
  if (
    cleanArea &&
    !cleanArea.startsWith('Pinned (') &&
    cleanArea.toLowerCase() !== 'current gps'
  ) {
    const areaCleaned = cleanMapAddressSegments(cleanArea);
    if (areaCleaned.length > 0) {
      return `${areaCleaned.join(', ')}, Bangladesh`;
    }
  }
  if (typeof input.lat === 'number' && Number.isFinite(input.lat) && typeof input.lng === 'number' && Number.isFinite(input.lng)) {
    return `Pinned (${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}), Bangladesh`;
  }
  return '';
}

export const DEFAULT_ORDER_EMAIL_IMAGE_PATH =
  '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg';

export function resolveOrderEmailImageUrl(
  imageUrl?: string | null,
  origin: string = 'https://foodora.bd'
): string {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('data:image/')) return raw;
  const cleanOrigin = String(origin || 'https://foodora.bd').replace(/\/+$/, '');
  return `${cleanOrigin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export interface ExtractedEmailCidImage {
  cid: string;
  kind: 'local' | 'data';
  localPath?: string;
  dataMimeType?: string;
  dataBase64?: string;
  originalSrcs: string[];
}

export function classifyEmailImageSrcForCid(
  rawSrc: string
):
  | { kind: 'local'; key: string; localPath: string }
  | { kind: 'data'; key: string; dataMimeType: string; dataBase64: string }
  | null {
  const clean = String(rawSrc || '').replace(/&amp;/g, '&').trim();
  if (!clean || clean.startsWith('cid:')) return null;

  const dataMatch = clean.match(
    /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (dataMatch) {
    const mime =
      dataMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataMatch[1].toLowerCase();
    const b64 = dataMatch[2].replace(/\s+/g, '');
    if (!b64) return null;
    return {
      kind: 'data',
      key: `data:${mime}:${b64.slice(0, 48)}:${b64.length}`,
      dataMimeType: mime,
      dataBase64: b64,
    };
  }

  let pathname = '';
  if (clean.startsWith('/')) {
    pathname = clean.split('?')[0].split('#')[0];
  } else if (/^https?:\/\//i.test(clean)) {
    try {
      pathname = new URL(clean).pathname;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // keep original pathname
  }

  if (!/^\/(?:src\/assets\/|assets\/|uploads\/|foodora-icon\.)/i.test(pathname)) {
    return null;
  }

  return {
    kind: 'local',
    key: `local:${pathname}`,
    localPath: pathname,
  };
}

export function extractEmailInlineCidPlan(html: string): {
  html: string;
  images: ExtractedEmailCidImage[];
} {
  if (!html) return { html, images: [] };
  const byKey = new Map<string, ExtractedEmailCidImage>();
  let seq = 0;

  const rewrittenHtml = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (fullMatch, prefix: string, quote: string, attrVal: string) => {
      const classified = classifyEmailImageSrcForCid(attrVal);
      if (!classified) return fullMatch;

      let entry = byKey.get(classified.key);
      if (!entry) {
        seq += 1;
        const cid = `foodora-img-${seq}`;
        entry =
          classified.kind === 'local'
            ? {
                cid,
                kind: 'local',
                localPath: classified.localPath,
                originalSrcs: [attrVal],
              }
            : {
                cid,
                kind: 'data',
                dataMimeType: classified.dataMimeType,
                dataBase64: classified.dataBase64,
                originalSrcs: [attrVal],
              };
        byKey.set(classified.key, entry);
      } else if (!entry.originalSrcs.includes(attrVal)) {
        entry.originalSrcs.push(attrVal);
      }
      return `${prefix}${quote}cid:${entry.cid}${quote}`;
    }
  );

  return {
    html: rewrittenHtml,
    images: Array.from(byKey.values()),
  };
}

export function buildOrderTrackingEmailPayload(input: {
  origin: string;
  orderId: number;
  orderNumber: string;
  trackingToken?: string | null;
  customerName: string;
  customerEmail: string;
  restaurantName: string;
  deliveryArea: string;
  deliveryAddress?: string | null;
  subtotal?: number | null;
  discountAmount?: number | null;
  couponCode?: string | null;
  deliveryFee?: number | null;
  serviceFee?: number | null;
  taxAmount?: number | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string | null;
  status: string;
  statusNote?: string;
  riderName?: string | null;
  riderPhone?: string | null;
  etaMinutes?: number | null;
  createdAt?: string | Date | null;
  paymentSplitMode?: string | null;
  onlineFoodPaidAmount?: number | null;
  cashDueToRider?: number | null;
  items?: Array<{
    foodItemId?: number;
    name: string;
    nameBn?: string;
    imageUrl?: string | null;
    quantity: number;
    unitPrice?: number;
    variation?: string;
    addons?: Array<{ name: string; price: number }>;
    lineTotal: number;
  }>;
}): {
  subject: string;
  trackingUrl: string;
  html: string;
  text: string;
} {
  const trackingUrl = buildOrderTrackingUrl(input.origin, input.orderId, input.trackingToken);
  const niceStatus = input.status.replace(/_/g, ' ').toUpperCase();
  const invoiceNumber = `INV-${input.orderNumber}`;
  const statusDisplayMap: Record<
    string,
    { en: string; bn: string; subEn: string; subBn: string; accent: string; step: number }
  > = {
    confirmed: {
      en: 'Order Confirmed & Invoice Ready',
      bn: 'অর্ডার কনফার্ম ও ইনভয়েস তৈরি হয়েছে',
      subEn: 'We have sent your order to the kitchen and will notify you when cooking begins.',
      subBn: 'আপনার অর্ডারটি রেস্টুরেন্টে পাঠানো হয়েছে, রান্না শুরু হলেই আপডেট পাবেন।',
      accent: '#E21B70',
      step: 1,
    },
    payment_verified: {
      en: 'Payment Confirmed & Receipt Updated',
      bn: 'পেমেন্ট সম্পন্ন ও রসিদ আপডেট হয়েছে',
      subEn: 'Your digital payment is verified and your order is moving ahead.',
      subBn: 'আপনার পেমেন্ট যাচাই সম্পন্ন হয়েছে এবং অর্ডার প্রস্তুত হচ্ছে।',
      accent: '#059669',
      step: 1,
    },
    accepted: {
      en: 'Accepted by Kitchen',
      bn: 'রেস্টুরেন্ট অর্ডার গ্রহণ করেছে',
      subEn: 'The restaurant chef accepted your order and is queueing preparation.',
      subBn: 'রেস্টুরেন্ট আপনার অর্ডারটি গ্রহণ করেছে ও প্রস্তুতি শুরু করছে।',
      accent: '#E21B70',
      step: 2,
    },
    preparing: {
      en: 'Preparing Fresh Food',
      bn: 'আপনার খাবার তৈরি হচ্ছে',
      subEn: 'Your meal is being freshly cooked and packed carefully at the kitchen.',
      subBn: 'রেস্টুরেন্টের কিচেনে আপনার খাবার গরম ও ফ্রেশভাবে তৈরি ও প্যাক করা হচ্ছে।',
      accent: '#D97706',
      step: 2,
    },
    ready: {
      en: 'Ready for Pickup',
      bn: 'পিকআপের জন্য প্রস্তুত',
      subEn: 'Your food is packed and sealed, waiting for our rider to pick it up.',
      subBn: 'আপনার খাবার প্যাকিং সম্পন্ন — রাইডার পিকআপের জন্য অপেক্ষমাণ।',
      accent: '#2563EB',
      step: 3,
    },
    rider_assigned: {
      en: 'Rider Assigned to Your Order',
      bn: 'আপনার অর্ডারে রাইডার নির্ধারিত হয়েছে',
      subEn: 'Your delivery partner is heading to the restaurant to collect your order.',
      subBn: 'আমাদের রাইডার আপনার খাবার আনতে রেস্টুরেন্টের উদ্দেশ্যে রওনা দিয়েছেন।',
      accent: '#2563EB',
      step: 3,
    },
    picked_up: {
      en: 'Order Picked Up by Rider',
      bn: 'রাইডার খাবার সংগ্রহ করেছেন',
      subEn: 'Your rider has collected the sealed bag and is starting your delivery.',
      subBn: 'রাইডার রেস্টুরেন্ট থেকে খাবার সংগ্রহ করেছেন এবং আপনার দিকে আসছেন।',
      accent: '#059669',
      step: 4,
    },
    on_the_way: {
      en: 'Rider Is On The Way',
      bn: 'রাইডার আপনার ঠিকানায় আসছেন',
      subEn: 'Get ready! Follow live rider GPS on the map link below.',
      subBn: 'প্রস্তুত থাকুন! নিচের লিংকে রাইডারের লাইভ অবস্থান ম্যাপে দেখতে পারবেন।',
      accent: '#059669',
      step: 4,
    },
    delivered: {
      en: 'Order Delivered — Enjoy Your Meal!',
      bn: 'ডেলিভারি সম্পন্ন হয়েছে — খাবার উপভোগ করুন!',
      subEn: 'Thank you for ordering with Foodora BD. Keep this invoice for your records.',
      subBn: 'ফুডোরা বিডি-তে অর্ডার করার জন্য ধন্যবাদ! অনুগ্রহ করে অ্যাপে রিভিউ দিন।',
      accent: '#059669',
      step: 5,
    },
    cancelled: {
      en: 'Order Cancelled',
      bn: 'অর্ডার বাতিল হয়েছে',
      subEn: 'This order was cancelled. Any eligible prepaid amount will be refunded automatically.',
      subBn: 'অর্ডারটি বাতিল করা হয়েছে। অগ্রিম পেমেন্ট থাকলে রিফান্ড প্রসেস করা হবে।',
      accent: '#DC2626',
      step: 0,
    },
  };
  const info = statusDisplayMap[input.status] || {
    en: `Order Status: ${niceStatus}`,
    bn: `অর্ডার আপডেট: ${niceStatus}`,
    subEn: 'Here is the latest update on your Foodora BD order.',
    subBn: 'আপনার অর্ডারের সর্বশেষ অবস্থা নিচে দেওয়া হলো।',
    accent: '#E21B70',
    step: 1,
  };
  const subject = `Foodora BD · ${info.en} (${input.orderNumber} / ${invoiceNumber})`;
  const riderLine = input.riderName
    ? `<p style="margin:4px 0;"><strong>Assigned Rider:</strong> ${escapeXml(input.riderName)}${
        input.riderPhone ? ` (${escapeXml(input.riderPhone)})` : ''
      }</p>`
    : '';
  const etaLine =
    typeof input.etaMinutes === 'number' && input.etaMinutes > 0 && input.status !== 'delivered' && input.status !== 'cancelled'
      ? `<p style="margin:4px 0;"><strong>Estimated Arrival:</strong> ~${formatDurationEstimate(input.etaMinutes, 'en')}</p>`
      : '';
  const addressLine = input.deliveryAddress
    ? `<p style="margin:4px 0;"><strong>Delivery Address:</strong> ${escapeXml(input.deliveryAddress)}</p>`
    : '';
  const noteLine = input.statusNote ? `<p style="margin:4px 0;"><strong>Update:</strong> ${escapeXml(input.statusNote)}</p>` : '';
  const paymentBadge = input.paymentStatus ? ` · ${escapeXml(input.paymentStatus.toUpperCase())}` : '';
  const issuedAt = input.createdAt ? new Date(input.createdAt).toLocaleString('en-BD') : new Date().toLocaleString('en-BD');

  const itemsList = Array.isArray(input.items) ? input.items : [];
  const computedSubtotal =
    typeof input.subtotal === 'number' && Number.isFinite(input.subtotal)
      ? input.subtotal
      : itemsList.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0);
  const discountVal = Math.max(0, Number(input.discountAmount || 0));
  const deliveryFeeVal = Math.max(0, Number(input.deliveryFee ?? 0));
  const serviceFeeVal = Math.max(0, Number(input.serviceFee ?? 0));
  const taxVal = Math.max(0, Number(input.taxAmount ?? 0));

  const isSplitOrder =
    input.paymentSplitMode === 'online_food_cash_delivery' ||
    (typeof input.onlineFoodPaidAmount === 'number' && typeof input.cashDueToRider === 'number');
  const onlineFoodPart =
    typeof input.onlineFoodPaidAmount === 'number'
      ? Math.max(0, Math.round(input.onlineFoodPaidAmount))
      : Math.max(0, Math.round(input.totalAmount - deliveryFeeVal));
  const cashRiderPart =
    typeof input.cashDueToRider === 'number'
      ? Math.max(0, Math.round(input.cashDueToRider))
      : deliveryFeeVal;

  const itemsBlock =
    itemsList.length > 0
      ? `<div style="border-top:1px solid #F3F4F6;padding-top:10px;margin-top:10px;">
           <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#2E3138;">Itemized Invoice (${escapeXml(invoiceNumber)}):</p>
           <table style="width:100%;border-collapse:collapse;font-size:12px;color:#374151;">
             <thead>
               <tr style="border-bottom:1px solid #F3F4F6;text-align:left;color:#6B7280;">
                 <th style="padding:4px 0;">Product</th>
                 <th style="padding:4px 0;text-align:center;">Qty</th>
                 <th style="padding:4px 0;text-align:right;">Total</th>
               </tr>
             </thead>
             <tbody>
               ${itemsList
                 .slice(0, 20)
                 .map((it) => {
                   const varPart = it.variation ? ` (${escapeXml(it.variation)})` : '';
                   const unitPart =
                     typeof it.unitPrice === 'number' && it.unitPrice > 0
                       ? `<div style="color:#6B7280;font-size:11px;margin-top:2px;">@ ৳${it.unitPrice}</div>`
                       : '';
                   const resolvedImg = resolveOrderEmailImageUrl(
                     it.imageUrl || DEFAULT_ORDER_EMAIL_IMAGE_PATH,
                     input.origin
                   );
                   const thumbHtml = resolvedImg
                     ? `<img src="${escapeXml(resolvedImg)}" alt="${escapeXml(it.name)}" width="44" height="44" style="width:44px;height:44px;object-fit:cover;border-radius:8px;display:block;border:1px solid #FBCFE8;background:#ffffff;" />`
                     : `<div style="width:44px;height:44px;border-radius:8px;border:1px solid #FBCFE8;background:#ffffff;text-align:center;line-height:44px;font-size:18px;">🍽️</div>`;
                   return `<tr style="border-bottom:1px solid #F9FAFB;">
                     <td style="padding:7px 6px 7px 0;vertical-align:middle;">
                       <table role="presentation" style="border-collapse:collapse;">
                         <tr>
                           <td style="width:52px;padding-right:10px;vertical-align:middle;">${thumbHtml}</td>
                           <td style="vertical-align:middle;">
                             <div style="font-weight:bold;color:#2E3138;line-height:1.3;">${escapeXml(it.name)}${varPart}</div>
                             ${unitPart}
                           </td>
                         </tr>
                       </table>
                     </td>
                     <td style="padding:7px 0;text-align:center;vertical-align:middle;">${it.quantity}x</td>
                     <td style="padding:7px 0;text-align:right;font-weight:bold;vertical-align:middle;">৳${it.lineTotal}</td>
                   </tr>`;
                 })
                 .join('')}
             </tbody>
           </table>
           <div style="border-top:1px solid #FBCFE8;margin-top:8px;padding-top:8px;font-size:12px;color:#374151;">
             <p style="margin:2px 0;"><span>Subtotal:</span> <strong style="float:right;">৳${computedSubtotal}</strong></p>
             ${
               discountVal > 0
                 ? `<p style="margin:2px 0;color:#059669;"><span>Discount${input.couponCode ? ` (${escapeXml(input.couponCode)})` : ''}:</span> <strong style="float:right;">-৳${discountVal}</strong></p>`
                 : ''
             }
             ${
               typeof input.deliveryFee === 'number'
                 ? `<p style="margin:2px 0;"><span>Delivery Fee${isSplitOrder ? ' (Cash to Rider)' : ''}:</span> <strong style="float:right;">৳${deliveryFeeVal}</strong></p>`
                 : ''
             }
             ${
               typeof input.serviceFee === 'number'
                 ? `<p style="margin:2px 0;"><span>Service Fee:</span> <strong style="float:right;">৳${serviceFeeVal}</strong></p>`
                 : ''
             }
             ${
               taxVal > 0
                 ? `<p style="margin:2px 0;"><span>VAT / Tax:</span> <strong style="float:right;">৳${taxVal}</strong></p>`
                 : ''
             }
             ${
               isSplitOrder
                 ? `<p style="margin:4px 0;color:#059669;"><span>Online Food Payment (${escapeXml(input.paymentMethod.toUpperCase())}):</span> <strong style="float:right;">৳${onlineFoodPart}</strong></p>
                    <p style="margin:4px 0;color:#B45309;"><span>Pay Cash to Rider (Delivery Charge):</span> <strong style="float:right;">৳${cashRiderPart}</strong></p>`
                 : ''
             }
             <p style="margin:6px 0 0;padding-top:6px;border-top:1px dashed #FBCFE8;font-size:13px;color:#E21B70;"><span><strong>${isSplitOrder ? 'Customer Total Cost:' : 'Total Payable:'}</strong></span> <strong style="float:right;">৳${input.totalAmount}</strong></p>
           </div>
         </div>`
      : '';

  const steps = [
    { idx: 1, label: 'Confirmed' },
    { idx: 2, label: 'Preparing' },
    { idx: 3, label: 'Rider Assigned' },
    { idx: 4, label: 'On the Way' },
    { idx: 5, label: 'Delivered' },
  ];
  const progressHtml =
    info.step > 0
      ? `<div style="display:flex;gap:6px;margin:14px 0 16px;">
           ${steps
             .map((s) => {
               const active = info.step >= s.idx;
               return `<div style="flex:1;text-align:center;">
                 <div style="height:6px;border-radius:999px;background:${active ? '#E21B70' : '#E5E7EB'};margin-bottom:4px;"></div>
                 <span style="font-size:10px;font-weight:${active ? 'bold' : 'normal'};color:${
                   active ? '#E21B70' : '#9CA3AF'
                 };">${s.label}</span>
               </div>`;
             })
             .join('')}
         </div>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;color:#2E3138;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${info.accent};padding:14px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;opacity:0.92;">Foodora BD · Order Invoice &amp; Live Tracking</p>
        <h2 style="margin:4px 0 2px;font-size:20px;color:#ffffff;">${escapeXml(info.en)}</h2>
        <p style="margin:0;font-size:13px;font-weight:bold;opacity:0.95;">${escapeXml(info.bn)}</p>
      </div>
      <div style="padding:22px 24px;">
        <p style="margin:0 0 10px;font-size:12px;color:#6B7280;">Invoice: <strong>${escapeXml(invoiceNumber)}</strong> · Issued: ${escapeXml(issuedAt)}</p>
        <p style="margin:0 0 8px;font-size:14px;">Hi ${escapeXml(input.customerName)},</p>
        <p style="margin:0 0 6px;font-size:14px;">Your order <strong>${escapeXml(input.orderNumber)}</strong> from <strong>${escapeXml(input.restaurantName)}</strong> is now <strong>${escapeXml(niceStatus)}</strong>.</p>
        <p style="margin:0 0 4px;font-size:12px;color:#4B5563;">${escapeXml(info.subEn)}</p>
        <p style="margin:0 0 12px;font-size:12px;color:#6B7280;">${escapeXml(info.subBn)}</p>
        ${progressHtml}
        <div style="background:#FFF0F6;border:1px solid #FBCFE8;border-radius:12px;padding:14px;font-size:13px;margin-bottom:16px;">
          <p style="margin:4px 0;"><strong>Delivery Area:</strong> ${escapeXml(input.deliveryArea)}</p>
          ${addressLine}
          <p style="margin:4px 0;"><strong>Payment:</strong> ${escapeXml(input.paymentMethod.toUpperCase())}${paymentBadge} · <strong>Total: ৳${input.totalAmount}</strong></p>
          ${
            isSplitOrder
              ? `<p style="margin:4px 0;color:#059669;"><strong>Online Food Payment:</strong> ৳${onlineFoodPart} · <strong style="color:#B45309;">Cash to Rider (Delivery):</strong> ৳${cashRiderPart}</p>`
              : ''
          }
          ${etaLine}
          ${riderLine}
          ${noteLine}
          ${itemsBlock}
        </div>
        <a href="${escapeXml(trackingUrl)}" style="display:inline-block;background:#E21B70;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;font-size:14px;">Track Order &amp; Rider Live · লাইভ ট্র্যাক করুন</a>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Direct tracking link: ${escapeXml(trackingUrl)}</p>
        <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #F3F4F6;font-size:11px;color:#9CA3AF;">Foodora BD Customer Order Updates · Automatic notification email for every order stage.</p>
      </div>
    </div>
  </body>
</html>`;

  const itemsText =
    itemsList.length > 0
      ? `\nItems:\n${itemsList
          .slice(0, 20)
          .map((it) => `- ${it.quantity}x ${it.name}${it.variation ? ` (${it.variation})` : ''}: BDT ${it.lineTotal}`)
          .join('\n')}\nSubtotal: BDT ${computedSubtotal}${
          discountVal > 0 ? `\nDiscount: -BDT ${discountVal}` : ''
        }${typeof input.deliveryFee === 'number' ? `\nDelivery Fee: BDT ${deliveryFeeVal}` : ''}${
          typeof input.serviceFee === 'number' ? `\nService Fee: BDT ${serviceFeeVal}` : ''
        }`
      : '';

  const splitSummaryText = isSplitOrder
    ? `\nOnline Food Payment: BDT ${onlineFoodPart}\nCash to Rider (Delivery Charge): BDT ${cashRiderPart}`
    : '';

  const text = `Foodora BD — Invoice ${invoiceNumber} | Order ${input.orderNumber} (${info.en} / ${info.bn})
${info.subEn}
${info.subBn}
Restaurant: ${input.restaurantName}
Delivery Area: ${input.deliveryArea}${input.deliveryAddress ? `\nAddress: ${input.deliveryAddress}` : ''}${itemsText}${splitSummaryText}
Total: BDT ${input.totalAmount} (${input.paymentMethod.toUpperCase()}${input.paymentStatus ? ` · ${input.paymentStatus}` : ''})
${input.etaMinutes ? `Estimated Arrival: ~${formatDurationEstimate(input.etaMinutes, 'en')}\n` : ''}${
    input.riderName
      ? `Rider: ${input.riderName}${input.riderPhone ? ` (${input.riderPhone})` : ''}\n`
      : ''
  }${input.statusNote ? `Update: ${input.statusNote}\n` : ''}Track live on map: ${trackingUrl}`;

  return { subject, trackingUrl, html, text };
}

export interface OrderEmailTemplatePreset {
  status: 'confirmed' | 'preparing' | 'rider_assigned' | 'on_the_way' | 'delivered' | 'cancelled';
  titleEn: string;
  titleBn: string;
  badgeColor: string;
}

export const ORDER_EMAIL_TEMPLATE_PRESETS: readonly OrderEmailTemplatePreset[] = [
  { status: 'confirmed', titleEn: 'Order Confirmed', titleBn: 'অর্ডার কনফার্ম', badgeColor: '#E21B70' },
  { status: 'preparing', titleEn: 'Kitchen Preparing', titleBn: 'খাবার তৈরি হচ্ছে', badgeColor: '#D97706' },
  { status: 'rider_assigned', titleEn: 'Rider Assigned', titleBn: 'রাইডার নির্ধারিত', badgeColor: '#2563EB' },
  { status: 'on_the_way', titleEn: 'Rider On The Way', titleBn: 'রাইডার পথে আছেন', badgeColor: '#059669' },
  { status: 'delivered', titleEn: 'Order Delivered', titleBn: 'ডেলিভারি সম্পন্ন', badgeColor: '#059669' },
  { status: 'cancelled', titleEn: 'Order Cancelled', titleBn: 'অর্ডার বাতিল', badgeColor: '#DC2626' },
];

export function getOrderEmailTemplatePreview(
  status: string,
  origin: string = 'https://foodora.bd',
  recipientEmail: string = 'customer@gmail.com'
) {
  return buildOrderTrackingEmailPayload({
    origin,
    orderId: 99999,
    orderNumber: 'FD-BD-84210',
    trackingToken: 'demo-preview-token',
    customerName: 'Tanjim Rahman',
    customerEmail: recipientEmail,
    restaurantName: "Sultan's Dine — Gulshan",
    deliveryArea: 'Banani',
    deliveryAddress: 'House 14, Road 11, Banani, Dhaka 1213',
    subtotal: 650,
    discountAmount: 50,
    couponCode: 'FOODORA50',
    deliveryFee: 45,
    serviceFee: 10,
    taxAmount: 0,
    totalAmount: 655,
    paymentMethod: 'bkash',
    paymentStatus: status === 'cancelled' ? 'refunded' : 'paid',
    status,
    statusNote:
      status === 'delivered'
        ? 'Handed to customer at reception desk.'
        : status === 'cancelled'
        ? 'Cancelled per customer support request.'
        : 'Live order update notification from Foodora BD.',
    riderName:
      status === 'rider_assigned' || status === 'on_the_way' || status === 'delivered'
        ? 'Ariful Islam'
        : null,
    riderPhone:
      status === 'rider_assigned' || status === 'on_the_way' || status === 'delivered'
        ? '01711-000222'
        : null,
    etaMinutes: status === 'on_the_way' ? 12 : 25,
    items: [
      {
        name: 'Mutton Kacchi (Half)',
        imageUrl: '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg',
        quantity: 1,
        unitPrice: 450,
        lineTotal: 450,
      },
      {
        name: 'Jali Kabab & Borhani',
        imageUrl: '/src/assets/images/food_tandoori_kabab_1794831377175.jpg',
        quantity: 1,
        unitPrice: 200,
        lineTotal: 200,
      },
    ],
  });
}

export const CUISINE_PRESET_OPTIONS: readonly string[] = [
  'Bangladeshi',
  'Biriyani',
  'Burger',
  'Pizza',
  'Kabab',
  'Chinese',
  'Bakery',
  'Drinks',
  'Seafood',
  'Fast Food',
  'Sweets & Desserts',
];

export const FOOD_CATEGORY_PRESET_OPTIONS: readonly string[] = [
  'Main Course',
  'Biriyani & Kacchi',
  'Burgers',
  'Pizza',
  'Kabab & Grill',
  'Bangladeshi',
  'Chinese & Momos',
  'Snacks & Appetizers',
  'Desserts & Bakery',
  'Drinks & Coffee',
  'Combo Meals',
];

export const VEHICLE_TYPE_PRESET_OPTIONS: readonly string[] = [
  'Motorbike',
  'Bicycle',
  'Scooter',
  'E-Bike / Van',
  'CNG / Auto',
  'Pickup Van',
];

export interface SelectOptionItem {
  value: string;
  label: string;
  group?: string;
}

export function normalizeCustomOptionValue(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function mergeCustomSelectOptions(
  presets: readonly SelectOptionItem[],
  customValues: readonly string[],
  currentValue?: string
): SelectOptionItem[] {
  const seen = new Set<string>();
  const out: SelectOptionItem[] = [];

  for (const item of presets) {
    const cleanVal = normalizeCustomOptionValue(item.value);
    if (!cleanVal) continue;
    const key = cleanVal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      value: cleanVal,
      label: item.label || cleanVal,
      ...(item.group ? { group: item.group } : {}),
    });
  }

  for (const rawCustom of customValues) {
    const clean = normalizeCustomOptionValue(rawCustom);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: clean, label: `${clean} (Custom)`, group: 'Saved Custom' });
  }

  const cleanCurrent = normalizeCustomOptionValue(currentValue || '');
  if (cleanCurrent && !seen.has(cleanCurrent.toLowerCase())) {
    out.push({ value: cleanCurrent, label: cleanCurrent });
  }

  return out;
}

export interface RiderCandidatePoint {
  uid: string;
  fullName: string;
  phone: string;
  vehicleType: string;
  zone: string;
  isAvailable: boolean;
  lat: number;
  lng: number;
  locationUpdatedAt: Date | string;
}

export interface StandbyRiderResult<T extends RiderCandidatePoint> {
  rider: T;
  distanceKm: number;
}

export function pickNearestStandbyRider<T extends RiderCandidatePoint>(
  candidates: readonly T[],
  targetLat: number,
  targetLng: number
): StandbyRiderResult<T> | null {
  if (!candidates || candidates.length === 0) return null;
  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return null;

  const online = candidates.filter((c) => c.isAvailable && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const pool =
    online.length > 0
      ? online
      : candidates.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (pool.length === 0) return null;

  let best = pool[0];
  let bestDist = haversineDistanceKm(best.lat, best.lng, targetLat, targetLng);
  for (let i = 1; i < pool.length; i += 1) {
    const d = haversineDistanceKm(pool[i].lat, pool[i].lng, targetLat, targetLng);
    if (d < bestDist) {
      best = pool[i];
      bestDist = d;
    }
  }
  return { rider: best, distanceKm: bestDist };
}

export interface OrderEtaSummaryInput {
  status: string;
  estimatedMinutes: number;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryLat: number;
  deliveryLng: number;
  riderLat?: number | null;
  riderLng?: number | null;
  standbyRiderLat?: number | null;
  standbyRiderLng?: number | null;
}

export interface OrderEtaSummary {
  etaMinutes: number;
  remainingKm: number;
  phase: 'awaiting_dispatch' | 'heading_to_restaurant' | 'heading_to_customer' | 'delivered' | 'cancelled';
}

export function computeOrderEtaSummary(input: OrderEtaSummaryInput): OrderEtaSummary {
  if (input.status === 'delivered') {
    return { etaMinutes: 0, remainingKm: 0, phase: 'delivered' };
  }
  if (input.status === 'cancelled') {
    return { etaMinutes: 0, remainingKm: 0, phase: 'cancelled' };
  }

  const hasRest =
    typeof input.restaurantLat === 'number' &&
    Number.isFinite(input.restaurantLat) &&
    typeof input.restaurantLng === 'number' &&
    Number.isFinite(input.restaurantLng);
  const hasRider =
    typeof input.riderLat === 'number' &&
    Number.isFinite(input.riderLat) &&
    typeof input.riderLng === 'number' &&
    Number.isFinite(input.riderLng);
  const hasStandby =
    typeof input.standbyRiderLat === 'number' &&
    Number.isFinite(input.standbyRiderLat) &&
    typeof input.standbyRiderLng === 'number' &&
    Number.isFinite(input.standbyRiderLng);

  const restToCustomerKm = hasRest
    ? haversineDistanceKm(
        input.restaurantLat as number,
        input.restaurantLng as number,
        input.deliveryLat,
        input.deliveryLng
      )
    : 2.5;

  if (hasRider) {
    if (input.status === 'rider_assigned' && hasRest) {
      const toRest = calculateLiveRiderEta(
        input.riderLat as number,
        input.riderLng as number,
        input.restaurantLat as number,
        input.restaurantLng as number,
        'rider_assigned'
      );
      const restDriveMin = Math.max(4, Math.round((restToCustomerKm / 22) * 60 + 2));
      return {
        etaMinutes: toRest.etaMinutes + restDriveMin,
        remainingKm: Math.round((toRest.remainingKm + restToCustomerKm) * 100) / 100,
        phase: 'heading_to_restaurant',
      };
    }

    const toDest = calculateLiveRiderEta(
      input.riderLat as number,
      input.riderLng as number,
      input.deliveryLat,
      input.deliveryLng,
      input.status
    );
    return {
      etaMinutes: toDest.etaMinutes,
      remainingKm: toDest.remainingKm,
      phase: 'heading_to_customer',
    };
  }

  const standbyToRestKm =
    hasStandby && hasRest
      ? haversineDistanceKm(
          input.standbyRiderLat as number,
          input.standbyRiderLng as number,
          input.restaurantLat as number,
          input.restaurantLng as number
        )
      : 0;

  const prepBuffer =
    input.status === 'ready'
      ? 4
      : input.status === 'preparing'
      ? 9
      : input.status === 'accepted'
      ? 12
      : 14;
  const routeBasedEta = Math.max(8, Math.round(prepBuffer + (restToCustomerKm / 22) * 60));
  const reasonableStoredEta =
    input.estimatedMinutes > 0 && input.estimatedMinutes <= 180
      ? input.estimatedMinutes
      : routeBasedEta;
  const etaMinutes = Math.max(6, Math.min(reasonableStoredEta, routeBasedEta + 6));
  const remainingKm = Math.round((standbyToRestKm + restToCustomerKm) * 100) / 100;

  return {
    etaMinutes,
    remainingKm,
    phase: 'awaiting_dispatch',
  };
}

export function buildRestaurantUnavailableMessage(
  restaurantName: string,
  status: string,
  isOpen: boolean,
  lang: 'bn' | 'en' = 'en'
): string {
  const safeName = restaurantName.trim() || (lang === 'bn' ? 'এই রেস্টুরেন্টটি' : 'This restaurant');
  if (status !== 'approved') {
    if (lang === 'bn') {
      return `${safeName} বর্তমানে অ্যাডমিন অনুমোদনের (${status}) অপেক্ষায় আছে, তাই এখন অর্ডার নেওয়া হচ্ছে না।`;
    }
    return `${safeName} is currently "${status}" and awaiting Admin approval before accepting orders.`;
  }
  if (!isOpen) {
    if (lang === 'bn') {
      return `${safeName} বর্তমানে বন্ধ (Closed) রাখা হয়েছে। পার্টনার/অ্যাডমিন ড্যাশবোর্ড থেকে Store Open চালু করুন অথবা অন্য খোলা রেস্টুরেন্ট থেকে অর্ডার করুন।`;
    }
    return `${safeName} is currently closed for orders (Store Open is turned OFF in Partner/Admin Dashboard). Please open another active restaurant or re-open the store.`;
  }
  return lang === 'bn' ? 'রেস্টুরেন্টটি অর্ডার নিতে প্রস্তুত।' : 'Restaurant is open for orders.';
}

export type AiHelpLangPreference = 'auto' | 'bn' | 'en';

export function buildAiHelpSystemInstruction(params: {
  langPreference?: AiHelpLangPreference;
  uiLang?: 'en' | 'bn';
  area?: string;
  viewType?: string;
  activeOrderNumber?: string;
}): string {
  const pref = params.langPreference || 'auto';
  const uiIsBn = params.uiLang === 'bn';
  const langRule =
    pref === 'bn'
      ? 'Always respond strictly in clear, natural, everyday Bengali (বাংলা script). Even if the question contains English words or Banglish, write your entire explanation in natural Bangla (keep brand names/codes like Foodora BD, FOODORA50, bKash, Nagad as needed).'
      : pref === 'en'
      ? 'Always respond strictly in clear, helpful English.'
      : uiIsBn
      ? 'The interface language is currently Bangla (বাংলা). Respond in clear, natural Bengali (বাংলা script) by default—including for Banglish or short mixed queries—unless the user explicitly asks in English for an English reply.'
      : 'Detect the user language automatically: if they write in Bangla (বাংলা script) or Banglish/Romanized Bengali (e.g. "rider kothay", "amar order", "keno"), respond in clear, natural Bangla (বাংলা script). If they write in English, respond in English.';

  const contextNotes = [
    params.area ? `User selected area: ${params.area}, Bangladesh.` : '',
    params.viewType ? `Current screen: ${params.viewType}.` : '',
    params.activeOrderNumber ? `Active order number: ${params.activeOrderNumber}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    'You are the official Foodora BD AI Help Assistant for Bangladesh’s multi-vendor food delivery marketplace.',
    langRule,
    'Keep answers concise, practical, and easy to scan (2-5 short sentences or bullet steps). Never invent order IDs, prices, or live GPS coordinates.',
    'Platform knowledge:',
    '- Ordering: Customers can order directly from the homepage "Order Popular Food Now" dishes or open any restaurant menu, then pay via bKash, Nagad, SSLCommerz, or Cash on Delivery (COD).',
    '- Why "This restaurant is currently unavailable for orders" appears: It means either the restaurant has "Store Open" switched OFF (isOpen = false) in Vendor/Admin Dashboard, or its status is not "approved" yet (e.g. pending/suspended). Re-enabling "Store Open" in Partner/Admin Dashboard or picking an Open restaurant resolves it immediately.',
    '- Nationwide Map & Location: Users can search any city/thana across all 64 districts of Bangladesh, enter a custom area, click anywhere on the interactive map or drag the pin to set that exact location, or press Back / click outside the map modal to return.',
    '- Live Rider Tracking & ETA: Users can click "Track Rider" in the header or look up orders via Checkout Email + Order Number to see live rider GPS coordinates, nearest standby rider, and estimated arrival time (ETA).',
    '- Partner & Rider Portals: Restaurant owners can register, manage Orders & Dispatch (including assigning riders), toggle product stock/availability, post Rider Jobs & hire riders, message Platform Admin directly, and integrate Partner APIs; Riders anywhere in Bangladesh can apply to join or apply to restaurant rider jobs and share live GPS locations.',
    contextNotes,
  ]
    .filter(Boolean)
    .join('\n');
}

export const ORDER_SOUND_STORAGE_KEY = 'foodora_bd_order_sound_v1';

export function parseOrderSoundPreference(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') {
    return false;
  }
  return true;
}

export interface ChimeNoteSpec {
  freq: number;
  delaySec: number;
  durationSec: number;
  gain: number;
  harmonicRatio?: number;
  harmonicGain?: number;
}

export function getOrderAlertChimeNotes(
  kind: 'new_order' | 'status_update' = 'new_order'
): ChimeNoteSpec[] {
  if (kind === 'status_update') {
    return [
      { freq: 783.99, delaySec: 0, durationSec: 0.24, gain: 0.065, harmonicRatio: 2, harmonicGain: 0.015 },
      { freq: 987.77, delaySec: 0.11, durationSec: 0.34, gain: 0.075, harmonicRatio: 2, harmonicGain: 0.018 },
    ];
  }
  // Distinct, warm ascending major-octave chime (C5 -> E5 -> G5 -> C6) for new incoming orders
  return [
    { freq: 523.25, delaySec: 0, durationSec: 0.26, gain: 0.075, harmonicRatio: 2, harmonicGain: 0.02 },
    { freq: 659.25, delaySec: 0.09, durationSec: 0.28, gain: 0.085, harmonicRatio: 2, harmonicGain: 0.022 },
    { freq: 783.99, delaySec: 0.18, durationSec: 0.3, gain: 0.09, harmonicRatio: 2, harmonicGain: 0.024 },
    { freq: 1046.5, delaySec: 0.28, durationSec: 0.52, gain: 0.105, harmonicRatio: 2, harmonicGain: 0.03 },
  ];
}

export function isSandboxAuthToken(token: string | null | undefined): boolean {
  const trimmed = String(token || '').trim();
  return trimmed.startsWith('sbx.');
}

export function shouldPersistAuthToken(token: string | null | undefined): boolean {
  const trimmed = String(token || '').trim();
  if (!trimmed) return false;
  return !isSandboxAuthToken(trimmed);
}

const SEEDED_DEMO_ORDER_NUMBERS = new Set(['FD-BD-10041', 'FD-BD-10042', 'FD-BD-48374']);

export function shouldRestoreTrackedOrderShortcut(
  entry: { orderId?: unknown; orderNumber?: unknown; isSandbox?: unknown } | null | undefined
): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isSandbox === true) return false;
  const orderId = Number(entry.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) return false;
  const orderNum = typeof entry.orderNumber === 'string' ? entry.orderNumber.trim().toUpperCase() : '';
  if (orderNum && SEEDED_DEMO_ORDER_NUMBERS.has(orderNum)) return false;
  return true;
}

export function shouldPlayDedupedOrderChime(
  key: string | null | undefined,
  cache: Map<string, number>,
  nowMs: number = Date.now(),
  windowMs: number = 4000
): boolean {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) return true;
  const lastPlayed = cache.get(cleanKey);
  if (typeof lastPlayed === 'number' && nowMs - lastPlayed < windowMs) {
    return false;
  }
  cache.set(cleanKey, nowMs);
  if (cache.size > 100) {
    for (const [k, ts] of cache.entries()) {
      if (nowMs - ts >= windowMs) {
        cache.delete(k);
      }
    }
  }
  return true;
}

export function collectMerchantOrderAlertRecipients(input: {
  restaurantEmail?: string | null;
  ownerEmail?: string | null;
  adminNotifyEmail?: string | null;
  fallbackAdminEmails?: readonly string[];
}): string[] {
  const seen = new Set<string>();
  const candidates: Array<string | null | undefined> = [
    input.restaurantEmail,
    input.ownerEmail,
    input.adminNotifyEmail,
    ...(input.fallbackAdminEmails || [PRIMARY_SUPER_ADMIN_EMAIL]),
  ];

  const out: string[] = [];
  for (const raw of candidates) {
    const clean = String(raw || '').trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) continue;
    if (clean.endsWith('@foodora.bd')) continue; // skip synthetic demo sandbox addresses
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function buildMerchantOrderAlertEmailPayload(input: {
  origin: string;
  orderId: number;
  orderNumber: string;
  trackingToken?: string | null;
  eventKind: 'new_order' | 'status_update';
  restaurantName: string;
  customerName: string;
  customerPhone?: string | null;
  deliveryArea: string;
  deliveryAddress?: string | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string | null;
  status: string;
  statusNote?: string;
  riderName?: string | null;
  items?: Array<{
    foodItemId?: number;
    name: string;
    imageUrl?: string | null;
    quantity: number;
    variation?: string;
    lineTotal: number;
  }>;
}): {
  subject: string;
  trackingUrl: string;
  html: string;
  text: string;
} {
  const trackingUrl = buildOrderTrackingUrl(input.origin, input.orderId, input.trackingToken);
  const niceStatus = input.status.replace(/_/g, ' ').toUpperCase();
  const isNew = input.eventKind === 'new_order';
  const headlineEn = isNew
    ? `New Order Received: ${input.orderNumber}`
    : `Order Update (${input.orderNumber}): ${niceStatus}`;
  const headlineBn = isNew
    ? `নতুন অর্ডার এসেছে: ${input.orderNumber}`
    : `অর্ডার স্ট্যাটাস আপডেট: ${niceStatus}`;
  const subject = isNew
    ? `🔔 Foodora BD New Order Alert ${input.orderNumber} (৳${input.totalAmount}) — ${input.restaurantName}`
    : `📦 Foodora BD Order Update ${input.orderNumber} — ${niceStatus}`;

  const itemsList = Array.isArray(input.items) ? input.items : [];
  const itemsHtml =
    itemsList.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:10px 0 0;font-size:12px;color:#374151;">
          ${itemsList
            .slice(0, 20)
            .map((it) => {
              const resolvedImg = resolveOrderEmailImageUrl(
                it.imageUrl || DEFAULT_ORDER_EMAIL_IMAGE_PATH,
                input.origin
              );
              const thumbHtml = resolvedImg
                ? `<img src="${escapeXml(resolvedImg)}" alt="${escapeXml(it.name)}" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:8px;display:block;border:1px solid #FBCFE8;background:#ffffff;" />`
                : '';
              return `<tr style="border-top:1px solid #FBCFE8;">
                <td style="width:48px;padding:6px 8px 6px 0;vertical-align:middle;">${thumbHtml}</td>
                <td style="padding:6px 6px 6px 0;vertical-align:middle;"><strong>${it.quantity}x</strong> ${escapeXml(it.name)}${
                  it.variation ? ` (${escapeXml(it.variation)})` : ''
                }</td>
                <td style="padding:6px 0;text-align:right;font-weight:bold;vertical-align:middle;">৳${it.lineTotal}</td>
              </tr>`;
            })
            .join('')}
        </table>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;color:#2E3138;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#E21B70;">Foodora BD · Store &amp; Admin Live Order Alert</p>
      <h2 style="margin:0 0 4px;color:#2E3138;font-size:20px;">${escapeXml(headlineEn)}</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#E21B70;font-weight:bold;">${escapeXml(headlineBn)}</p>
      <div style="background:#FFF0F6;border:1px solid #FBCFE8;border-radius:12px;padding:14px;font-size:13px;margin-bottom:16px;">
        <p style="margin:4px 0;"><strong>Restaurant:</strong> ${escapeXml(input.restaurantName)}</p>
        <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeXml(input.customerName)}${
          input.customerPhone ? ` (${escapeXml(input.customerPhone)})` : ''
        }</p>
        <p style="margin:4px 0;"><strong>Delivery Area:</strong> ${escapeXml(input.deliveryArea)}</p>
        ${
          input.deliveryAddress
            ? `<p style="margin:4px 0;"><strong>Address:</strong> ${escapeXml(input.deliveryAddress)}</p>`
            : ''
        }
        <p style="margin:4px 0;"><strong>Status:</strong> ${escapeXml(niceStatus)} · <strong>Total: ৳${input.totalAmount}</strong> (${escapeXml(
          input.paymentMethod.toUpperCase()
        )}${input.paymentStatus ? ` · ${escapeXml(input.paymentStatus.toUpperCase())}` : ''})</p>
        ${input.riderName ? `<p style="margin:4px 0;"><strong>Rider:</strong> ${escapeXml(input.riderName)}</p>` : ''}
        ${input.statusNote ? `<p style="margin:4px 0;"><strong>Note:</strong> ${escapeXml(input.statusNote)}</p>` : ''}
        ${itemsHtml}
      </div>
      <a href="${escapeXml(trackingUrl)}" style="display:inline-block;background:#E21B70;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;font-size:14px;">Open Live Order View · অর্ডার দেখুন</a>
      <p style="margin:12px 0 0;font-size:11px;color:#9CA3AF;">Notification dispatched to Admin (${escapeXml(PRIMARY_SUPER_ADMIN_EMAIL)}) &amp; Store Kitchen.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Direct link: ${escapeXml(trackingUrl)}</p>
    </div>
  </body>
</html>`;

  const itemsText =
    itemsList.length > 0
      ? `\nItems:\n${itemsList
          .slice(0, 20)
          .map((it) => `- ${it.quantity}x ${it.name}: BDT ${it.lineTotal}`)
          .join('\n')}`
      : '';

  const text = `${headlineEn} (${headlineBn})
Restaurant: ${input.restaurantName}
Customer: ${input.customerName}${input.customerPhone ? ` (${input.customerPhone})` : ''}
Area: ${input.deliveryArea}${input.deliveryAddress ? `\nAddress: ${input.deliveryAddress}` : ''}
Status: ${niceStatus} | Total: BDT ${input.totalAmount} (${input.paymentMethod.toUpperCase()})${
    input.riderName ? `\nRider: ${input.riderName}` : ''
  }${input.statusNote ? `\nNote: ${input.statusNote}` : ''}${itemsText}
View live order: ${trackingUrl}`;

  return { subject, trackingUrl, html, text };
}

export interface OrderSnapshotItem {
  id: number;
  status: string;
  paymentStatus?: string;
}

export function detectOrderBatchChanges<T extends OrderSnapshotItem>(
  prevMap: Map<number, { status: string; paymentStatus?: string }> | null,
  nextOrders: readonly T[] | null | undefined
): {
  newOrders: T[];
  updatedOrders: T[];
  nextMap: Map<number, { status: string; paymentStatus?: string }>;
} {
  const nextMap = new Map<number, { status: string; paymentStatus?: string }>();
  const newOrders: T[] = [];
  const updatedOrders: T[] = [];
  const safeList = Array.isArray(nextOrders) ? nextOrders : [];

  for (const ord of safeList) {
    if (!ord || typeof ord.id !== 'number') continue;
    nextMap.set(ord.id, { status: ord.status, paymentStatus: ord.paymentStatus });
    if (!prevMap) continue;
    const prev = prevMap.get(ord.id);
    if (!prev) {
      newOrders.push(ord);
    } else if (prev.status !== ord.status || prev.paymentStatus !== ord.paymentStatus) {
      updatedOrders.push(ord);
    }
  }

  return { newOrders, updatedOrders, nextMap };
}

export interface AddressSuggestionOption {
  shortName: string;
  shortNameBn?: string;
  displayName: string;
  subtitle?: string;
  lat: number;
  lng: number;
  source: 'area' | 'map' | 'recent';
}

export interface AddressPresetInput {
  name: string;
  nameBn?: string;
  division?: string;
  zoneCode?: string;
  zoneLabel?: string;
  addressHint?: string;
  keywords?: string;
  lat: number;
  lng: number;
}

const JOINED_PLACE_WORDS: Array<[RegExp, string]> = [
  [/citycent(?:er|re)/gi, 'city center'],
  [/futurepark/gi, 'future park'],
  [/shoppingmall/gi, 'shopping mall'],
  [/shoppingcent(?:er|re)/gi, 'shopping center'],
  [/medicalcollege/gi, 'medical college'],
  [/railwaystation/gi, 'railway station'],
  [/policeplaza/gi, 'police plaza'],
  [/pinkcity/gi, 'pink city'],
  [/oceancity/gi, 'ocean city'],
  [/housingestate/gi, 'housing estate'],
  [/busstand/gi, 'bus stand'],
  [/supermarket/gi, 'super market'],
  [/([a-z]{3,})(\d+)/gi, '$1 $2'],
];

export function normalizeFuzzyAddressText(raw: string): string {
  let out = raw.toLowerCase().trim();
  for (const [pattern, replacement] of JOINED_PLACE_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/[,.;:/()_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandAddressSearchQueries(rawQuery: string): string[] {
  const clean = rawQuery.trim();
  if (!clean) return [];
  let spaced = clean;
  for (const [pattern, replacement] of JOINED_PLACE_WORDS) {
    spaced = spaced.replace(pattern, replacement);
  }
  spaced = spaced.replace(/\s+/g, ' ').trim();
  const phoneticSaad = spaced.replace(/\bsad\b/gi, 'saad').replace(/\bcentre\b/gi, 'center');
  const tokens = phoneticSaad.split(/\s+/).filter(Boolean);
  const unique = new Set<string>([clean]);
  if (spaced) unique.add(spaced);
  if (phoneticSaad) unique.add(phoneticSaad);
  if (tokens.length >= 3) {
    unique.add(tokens.slice(0, 2).join(' '));
  }
  return Array.from(unique);
}

const GENERIC_PLACE_STOPWORDS = new Set([
  'road',
  'rd',
  'street',
  'st',
  'house',
  'block',
  'sector',
  'area',
  'zone',
  'dhaka',
  'bangladesh',
  'bd',
  'city',
  'center',
  'centre',
  'tower',
  'plaza',
  'park',
  'mall',
]);

export function findLocalAddressSuggestions(
  rawQuery: string,
  areas: readonly AddressPresetInput[],
  limit: number = 8
): AddressSuggestionOption[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const fuzzyQuery = normalizeFuzzyAddressText(rawQuery);
  const compactQuery = fuzzyQuery.replace(/\s+/g, '');
  const tokens = fuzzyQuery.split(/\s+/).filter(Boolean);
  const scored: Array<{ score: number; item: AddressSuggestionOption }> = [];
  const partialFallback: Array<{ score: number; item: AddressSuggestionOption }> = [];

  for (const area of areas) {
    const nameLower = area.name.toLowerCase();
    const bnLower = (area.nameBn || '').toLowerCase();
    const divLower = (area.division || '').toLowerCase();
    const zoneLower = `${area.zoneCode || ''} ${area.zoneLabel || ''}`.toLowerCase();
    const extraLower = `${area.addressHint || ''} ${area.keywords || ''}`.toLowerCase();

    const rawHaystack = `${nameLower} ${bnLower} ${divLower} ${zoneLower} ${extraLower}`.trim();
    const fuzzyName = normalizeFuzzyAddressText(area.name);
    const fuzzyHaystack = normalizeFuzzyAddressText(rawHaystack);
    const compactName = fuzzyName.replace(/\s+/g, '');
    const compactHaystack = fuzzyHaystack.replace(/\s+/g, '');

    const rawTokens = q.split(/\s+/).filter(Boolean);
    const matchesRaw = rawTokens.length > 0 && rawTokens.every((tok) => rawHaystack.includes(tok));
    const matchesFuzzy = tokens.length > 0 && tokens.every((tok) => fuzzyHaystack.includes(tok));
    const matchesCompact = compactQuery.length >= 4 && compactHaystack.includes(compactQuery);

    const subtitle = area.zoneCode
      ? `${area.zoneCode}${area.division ? ` · ${area.division}` : ''}`
      : area.zoneLabel || area.division || 'Bangladesh';

    const displayName = area.addressHint
      ? `${area.name}, ${area.addressHint}`
      : `${area.name}${area.division ? `, ${area.division}` : ''}, Bangladesh`;

    const buildItem = (): AddressSuggestionOption => ({
      shortName: area.name,
      shortNameBn: area.nameBn || area.name,
      displayName,
      subtitle,
      lat: area.lat,
      lng: area.lng,
      source: 'area',
    });

    if (matchesRaw || matchesFuzzy || matchesCompact) {
      let score = 20;
      if (nameLower === q || bnLower === q || fuzzyName === fuzzyQuery || compactName === compactQuery) {
        score = 120;
      } else if (
        nameLower.startsWith(q) ||
        bnLower.startsWith(q) ||
        fuzzyName.startsWith(fuzzyQuery) ||
        compactName.startsWith(compactQuery)
      ) {
        score = 100;
      } else if (
        nameLower.includes(q) ||
        bnLower.includes(q) ||
        fuzzyName.includes(fuzzyQuery) ||
        compactName.includes(compactQuery)
      ) {
        score = 84;
      } else if (tokens.every((tok) => fuzzyName.includes(tok))) {
        score = 72;
      } else if (zoneLower.includes(q)) {
        score = 45;
      }
      scored.push({ score, item: buildItem() });
      continue;
    }

    // "Did you mean" multi-token partial matching when user types a multi-word venue/typo
    if (tokens.length >= 2) {
      const strongTokens = tokens.filter((t) => t.length >= 3 && !GENERIC_PLACE_STOPWORDS.has(t));
      if (strongTokens.length > 0) {
        const haystackWords = fuzzyHaystack.split(/\s+/).filter(Boolean);
        const nameWords = fuzzyName.split(/\s+/).filter(Boolean);
        const matchesWord = (words: string[], tok: string) =>
          tok.length <= 3 ? words.some((w) => w === tok) : words.some((w) => w.startsWith(tok) || w.includes(tok));
        let matchedCount = 0;
        let matchedInName = 0;
        for (const tok of strongTokens) {
          if (matchesWord(haystackWords, tok)) {
            matchedCount += 1;
            if (matchesWord(nameWords, tok)) matchedInName += 1;
          }
        }
        if (matchedCount > 0) {
          const partialScore = 10 + matchedCount * 14 + matchedInName * 8;
          partialFallback.push({ score: partialScore, item: buildItem() });
        }
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || a.item.shortName.localeCompare(b.item.shortName));
  if (scored.length >= limit) {
    return scored.slice(0, Math.max(1, limit)).map((s) => s.item);
  }

  partialFallback.sort((a, b) => b.score - a.score || a.item.shortName.localeCompare(b.item.shortName));
  const combined = [...scored, ...partialFallback];
  return combined.slice(0, Math.max(1, limit)).map((s) => s.item);
}

export function filterAndRankRemoteSuggestions(
  rawQuery: string,
  items: readonly AddressSuggestionOption[],
  limit: number = 10
): AddressSuggestionOption[] {
  const fuzzyQuery = normalizeFuzzyAddressText(rawQuery);
  const tokens = fuzzyQuery.split(/\s+/).filter((t) => t.length >= 2);
  const strongTokens = tokens.filter((t) => t.length >= 3 && !GENERIC_PLACE_STOPWORDS.has(t));
  const requiredAny = strongTokens.length > 0 ? strongTokens : tokens;
  const matchesToken = (text: string, words: string[], tok: string) =>
    tok.length <= 3 ? words.some((w) => w === tok) : text.includes(tok);

  const scored: Array<{ score: number; item: AddressSuggestionOption }> = [];
  for (const item of items) {
    const fuzzyText = normalizeFuzzyAddressText(`${item.shortName} ${item.displayName} ${item.subtitle || ''}`);
    const fuzzyName = normalizeFuzzyAddressText(item.shortName);
    const textWords = fuzzyText.split(/\s+/).filter(Boolean);
    const nameWords = fuzzyName.split(/\s+/).filter(Boolean);
    let matchedCount = 0;
    let matchedNameCount = 0;
    for (const tok of tokens) {
      if (matchesToken(fuzzyText, textWords, tok)) matchedCount += 1;
      if (matchesToken(fuzzyName, nameWords, tok)) matchedNameCount += 1;
    }
    const hasStrongHit =
      requiredAny.length === 0 || requiredAny.some((tok) => matchesToken(fuzzyText, textWords, tok));
    if (!hasStrongHit) continue;
    let score = matchedCount * 12 + matchedNameCount * 18;
    if (fuzzyName.includes(fuzzyQuery)) score += 60;
    else if (fuzzyText.includes(fuzzyQuery)) score += 35;
    scored.push({ score, item });
  }

  if (scored.length === 0) {
    return items.slice(0, Math.max(1, limit));
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit)).map((s) => s.item);
}

export function mergeAddressSuggestions(
  localItems: readonly AddressSuggestionOption[],
  remoteItems: readonly AddressSuggestionOption[],
  limit: number = 12
): AddressSuggestionOption[] {
  const out: AddressSuggestionOption[] = [];
  const seenKeys = new Set<string>();

  const pushUnique = (item: AddressSuggestionOption) => {
    const key = `${normalizeFuzzyAddressText(item.shortName)}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push(item);
  };

  for (const item of localItems) pushUnique(item);
  for (const item of remoteItems) pushUnique(item);
  return out.slice(0, Math.max(1, limit));
}

export function resolveMapPinAppearance(input: {
  pinType?: 'user' | 'vendor';
  userName?: string;
  restaurantName?: string;
  markerLabel?: string;
  secondaryLabel?: string;
}): {
  primaryLabel: string;
  primaryRole: 'user' | 'vendor';
  primaryPinColor: string;
  primaryBorderColor: string;
  secondaryLabel: string | null;
  secondaryPinColor: string;
  secondaryBorderColor: string;
} {
  const role: 'user' | 'vendor' = input.pinType === 'vendor' ? 'vendor' : 'user';
  const cleanUser = (input.userName || '').trim();
  const cleanRestaurant = (input.restaurantName || '').trim();
  const cleanMarker = (input.markerLabel || '').trim();
  const cleanSecondary = (input.secondaryLabel || '').trim();

  let primaryLabel = 'You';
  if (role === 'vendor') {
    primaryLabel = cleanRestaurant || cleanMarker || 'Restaurant';
  } else if (cleanUser) {
    primaryLabel = cleanUser;
  } else if (cleanMarker && cleanMarker.toLowerCase() !== 'user location') {
    primaryLabel = cleanMarker.toLowerCase().startsWith('you')
      ? cleanMarker
      : `You · ${cleanMarker}`;
  } else {
    primaryLabel = 'You';
  }

  return {
    primaryLabel,
    primaryRole: role,
    primaryPinColor: role === 'vendor' ? '#111827' : '#DC2626',
    primaryBorderColor: role === 'vendor' ? '#000000' : '#991B1B',
    secondaryLabel: cleanSecondary || null,
    secondaryPinColor: '#111827',
    secondaryBorderColor: '#000000',
  };
}

export type AiProviderType =
  | 'foodora'
  | 'pollinations'
  | 'gemini'
  | 'openrouter'
  | 'openai'
  | 'groq'
  | 'deepseek'
  | 'anthropic'
  | 'mistral'
  | 'xai'
  | 'together'
  | 'cerebras'
  | 'perplexity'
  | 'cohere'
  | 'huggingface'
  | 'custom_openai';

export interface AiProviderRowLike {
  id?: number;
  code: string;
  name: string;
  providerType: string;
  model: string;
  apiBaseUrl?: string | null;
  apiKey?: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder?: number | null;
}

export interface AiEnvAvailabilityFlags {
  hasGeminiKey?: boolean;
  hasOpenRouterKey?: boolean;
  hasOpenAIKey?: boolean;
  hasGroqKey?: boolean;
  hasDeepSeekKey?: boolean;
  hasAnthropicKey?: boolean;
  hasMistralKey?: boolean;
  hasXaiKey?: boolean;
  hasTogetherKey?: boolean;
  hasCerebrasKey?: boolean;
  hasPerplexityKey?: boolean;
  hasCohereKey?: boolean;
  hasHuggingFaceKey?: boolean;
}

function resolveAiEnvFlags(flagOrBool: boolean | AiEnvAvailabilityFlags): Required<AiEnvAvailabilityFlags> {
  if (typeof flagOrBool === 'boolean') {
    return {
      hasGeminiKey: flagOrBool,
      hasOpenRouterKey: false,
      hasOpenAIKey: false,
      hasGroqKey: false,
      hasDeepSeekKey: false,
      hasAnthropicKey: false,
      hasMistralKey: false,
      hasXaiKey: false,
      hasTogetherKey: false,
      hasCerebrasKey: false,
      hasPerplexityKey: false,
      hasCohereKey: false,
      hasHuggingFaceKey: false,
    };
  }
  return {
    hasGeminiKey: Boolean(flagOrBool?.hasGeminiKey),
    hasOpenRouterKey: Boolean(flagOrBool?.hasOpenRouterKey),
    hasOpenAIKey: Boolean(flagOrBool?.hasOpenAIKey),
    hasGroqKey: Boolean(flagOrBool?.hasGroqKey),
    hasDeepSeekKey: Boolean(flagOrBool?.hasDeepSeekKey),
    hasAnthropicKey: Boolean(flagOrBool?.hasAnthropicKey),
    hasMistralKey: Boolean(flagOrBool?.hasMistralKey),
    hasXaiKey: Boolean(flagOrBool?.hasXaiKey),
    hasTogetherKey: Boolean(flagOrBool?.hasTogetherKey),
    hasCerebrasKey: Boolean(flagOrBool?.hasCerebrasKey),
    hasPerplexityKey: Boolean(flagOrBool?.hasPerplexityKey),
    hasCohereKey: Boolean(flagOrBool?.hasCohereKey),
    hasHuggingFaceKey: Boolean(flagOrBool?.hasHuggingFaceKey),
  };
}

export function hasEnvKeyForAiProviderType(
  providerType: string,
  envFlags: boolean | AiEnvAvailabilityFlags = false
): boolean {
  const flags = resolveAiEnvFlags(envFlags);
  switch (providerType) {
    case 'foodora':
    case 'pollinations':
      return true;
    case 'gemini':
      return flags.hasGeminiKey;
    case 'openrouter':
      return flags.hasOpenRouterKey;
    case 'openai':
      return flags.hasOpenAIKey;
    case 'groq':
      return flags.hasGroqKey;
    case 'deepseek':
      return flags.hasDeepSeekKey;
    case 'anthropic':
      return flags.hasAnthropicKey;
    case 'mistral':
      return flags.hasMistralKey;
    case 'xai':
      return flags.hasXaiKey;
    case 'together':
      return flags.hasTogetherKey;
    case 'cerebras':
      return flags.hasCerebrasKey;
    case 'perplexity':
      return flags.hasPerplexityKey;
    case 'cohere':
      return flags.hasCohereKey;
    case 'huggingface':
      return flags.hasHuggingFaceKey;
    default:
      return false;
  }
}

export const DEFAULT_AI_PROVIDERS: Array<{
  code: string;
  name: string;
  providerType: AiProviderType;
  model: string;
  apiBaseUrl: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}> = [
  {
    code: 'foodora',
    name: 'Foodora Own AI',
    providerType: 'foodora',
    model: 'foodora-bd-assistant',
    apiBaseUrl: '',
    isActive: true,
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'openrouter',
    name: 'OpenRouter (Gemma 4)',
    providerType: 'openrouter',
    model: 'google/gemma-4-31b-it:free',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'pollinations',
    name: 'Pollinations Free AI (No Key)',
    providerType: 'pollinations',
    model: 'openai-fast',
    apiBaseUrl: 'https://text.pollinations.ai',
    isActive: true,
    isDefault: false,
    sortOrder: 3,
  },
  {
    code: 'gemini',
    name: 'Google Gemini 4',
    providerType: 'gemini',
    model: 'gemini-4-hydrogen',
    apiBaseUrl: '',
    isActive: true,
    isDefault: false,
    sortOrder: 4,
  },
  {
    code: 'openrouter_llama',
    name: 'OpenRouter (Llama 3.3 Free)',
    providerType: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 5,
  },
  {
    code: 'chatgpt',
    name: 'ChatGPT (OpenAI)',
    providerType: 'openai',
    model: 'gpt-4o-mini',
    apiBaseUrl: 'https://api.openai.com/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 6,
  },
  {
    code: 'groq',
    name: 'Groq (Llama 3.3 70B)',
    providerType: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiBaseUrl: 'https://api.groq.com/openai/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 7,
  },
  {
    code: 'deepseek',
    name: 'DeepSeek V3 AI',
    providerType: 'deepseek',
    model: 'deepseek-chat',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 8,
  },
  {
    code: 'claude',
    name: 'Anthropic Claude',
    providerType: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    apiBaseUrl: 'https://api.anthropic.com',
    isActive: true,
    isDefault: false,
    sortOrder: 9,
  },
  {
    code: 'mistral',
    name: 'Mistral AI',
    providerType: 'mistral',
    model: 'mistral-small-latest',
    apiBaseUrl: 'https://api.mistral.ai/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 10,
  },
  {
    code: 'grok',
    name: 'xAI Grok',
    providerType: 'xai',
    model: 'grok-2-latest',
    apiBaseUrl: 'https://api.x.ai/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 11,
  },
  {
    code: 'together',
    name: 'Together AI',
    providerType: 'together',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    apiBaseUrl: 'https://api.together.xyz/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 12,
  },
  {
    code: 'cerebras',
    name: 'Cerebras AI',
    providerType: 'cerebras',
    model: 'llama-3.3-70b',
    apiBaseUrl: 'https://api.cerebras.ai/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 13,
  },
  {
    code: 'perplexity',
    name: 'Perplexity Sonar',
    providerType: 'perplexity',
    model: 'sonar',
    apiBaseUrl: 'https://api.perplexity.ai',
    isActive: true,
    isDefault: false,
    sortOrder: 14,
  },
  {
    code: 'cohere',
    name: 'Cohere Command',
    providerType: 'cohere',
    model: 'command-a-03-2025',
    apiBaseUrl: 'https://api.cohere.com/compatibility/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 15,
  },
  {
    code: 'huggingface',
    name: 'HuggingFace Qwen 2.5',
    providerType: 'huggingface',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    apiBaseUrl: 'https://router.huggingface.co/v1',
    isActive: true,
    isDefault: false,
    sortOrder: 16,
  },
];

export const AI_PROVIDER_PRESETS: Array<{
  code: string;
  name: string;
  providerType: AiProviderType;
  model: string;
  apiBaseUrl: string;
}> = [
  {
    code: 'openrouter',
    name: 'OpenRouter (Gemma 4)',
    providerType: 'openrouter',
    model: 'google/gemma-4-31b-it:free',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    code: 'pollinations',
    name: 'Pollinations Free AI (No Key)',
    providerType: 'pollinations',
    model: 'openai-fast',
    apiBaseUrl: 'https://text.pollinations.ai',
  },
  {
    code: 'chatgpt',
    name: 'ChatGPT (OpenAI)',
    providerType: 'openai',
    model: 'gpt-4o-mini',
    apiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    code: 'groq',
    name: 'Groq (Llama 3.3 70B)',
    providerType: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiBaseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    code: 'deepseek',
    name: 'DeepSeek AI',
    providerType: 'deepseek',
    model: 'deepseek-chat',
    apiBaseUrl: 'https://api.deepseek.com/v1',
  },
  {
    code: 'claude',
    name: 'Anthropic Claude',
    providerType: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    apiBaseUrl: 'https://api.anthropic.com',
  },
  {
    code: 'mistral',
    name: 'Mistral AI',
    providerType: 'mistral',
    model: 'mistral-small-latest',
    apiBaseUrl: 'https://api.mistral.ai/v1',
  },
  {
    code: 'grok',
    name: 'xAI Grok',
    providerType: 'xai',
    model: 'grok-2-latest',
    apiBaseUrl: 'https://api.x.ai/v1',
  },
  {
    code: 'together',
    name: 'Together AI',
    providerType: 'together',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    apiBaseUrl: 'https://api.together.xyz/v1',
  },
  {
    code: 'cerebras',
    name: 'Cerebras AI',
    providerType: 'cerebras',
    model: 'llama-3.3-70b',
    apiBaseUrl: 'https://api.cerebras.ai/v1',
  },
  {
    code: 'perplexity',
    name: 'Perplexity Sonar',
    providerType: 'perplexity',
    model: 'sonar',
    apiBaseUrl: 'https://api.perplexity.ai',
  },
  {
    code: 'cohere',
    name: 'Cohere Command',
    providerType: 'cohere',
    model: 'command-a-03-2025',
    apiBaseUrl: 'https://api.cohere.com/compatibility/v1',
  },
  {
    code: 'huggingface',
    name: 'HuggingFace Qwen 2.5',
    providerType: 'huggingface',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    apiBaseUrl: 'https://router.huggingface.co/v1',
  },
];

export function normalizeAiProviderCode(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function isValidExternalAiBaseUrl(rawUrl: string): boolean {
  const clean = String(rawUrl || '').trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '169.254.169.254'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAiProviderConfigured(
  row: Pick<AiProviderRowLike, 'providerType' | 'apiKey' | 'apiBaseUrl'>,
  envFlags: boolean | AiEnvAvailabilityFlags = false
): boolean {
  if (row.providerType === 'foodora' || row.providerType === 'pollinations') {
    return true;
  }
  if (row.providerType === 'gemini') {
    return hasEnvKeyForAiProviderType('gemini', envFlags);
  }
  if (hasEnvKeyForAiProviderType(row.providerType, envFlags)) {
    return true;
  }
  const hasKey = Boolean(row.apiKey && row.apiKey.trim());
  if (!hasKey) return false;
  if (row.providerType === 'custom_openai') {
    return isValidExternalAiBaseUrl(row.apiBaseUrl || '');
  }
  return true;
}

export function toPublicAiProviderView(
  row: AiProviderRowLike,
  envFlags: boolean | AiEnvAvailabilityFlags = false
) {
  const allowedTypes: AiProviderType[] = [
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
  ];
  const providerType = (allowedTypes.includes(row.providerType as AiProviderType)
    ? row.providerType
    : 'custom_openai') as AiProviderType;

  return {
    code: normalizeAiProviderCode(row.code),
    name: row.name,
    providerType,
    model: row.model,
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    isConfigured: isAiProviderConfigured({ ...row, providerType }, envFlags),
    sortOrder: Number(row.sortOrder ?? 10),
  };
}

export function toAdminAiProviderView(
  row: AiProviderRowLike,
  envFlags: boolean | AiEnvAvailabilityFlags = false
) {
  const flags = resolveAiEnvFlags(envFlags);
  const pub = toPublicAiProviderView(row, flags);
  const cleanKey = typeof row.apiKey === 'string' ? row.apiKey.trim() : '';
  const hasEnvForType = hasEnvKeyForAiProviderType(pub.providerType, flags);
  return {
    ...pub,
    apiBaseUrl: row.apiBaseUrl || '',
    hasApiKey:
      pub.providerType === 'foodora' || pub.providerType === 'pollinations'
        ? true
        : pub.providerType === 'gemini'
        ? flags.hasGeminiKey
        : Boolean(cleanKey || hasEnvForType),
    apiKeyPreview:
      pub.providerType === 'foodora'
        ? flags.hasGeminiKey
          ? 'Foodora Own AI + Gemini'
          : 'Built-in Foodora AI Ready'
        : pub.providerType === 'pollinations'
        ? 'Free Keyless AI Ready'
        : pub.providerType === 'gemini'
        ? flags.hasGeminiKey
          ? 'Server Env Configured'
          : 'Missing Env Key'
        : cleanKey
        ? maskSecretValue(cleanKey)
        : hasEnvForType
        ? 'Server Env Configured'
        : '',
  };
}

export interface OpenRouterHistoryEntry {
  role: 'user' | 'model';
  text: string;
  reasoning_details?: unknown;
}

export function buildOpenRouterChatPayload(options: {
  model: string;
  systemInstruction: string;
  history: OpenRouterHistoryEntry[];
  message: string;
  strictProvider?: boolean;
  enableReasoning?: boolean;
}) {
  const cleanModel = (options.model || '').trim() || 'google/gemma-4-31b-it:free';
  const strictProvider = options.strictProvider !== false;
  const enableReasoning = options.enableReasoning !== false;

  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoning_details?: unknown;
  }> = [
    { role: 'system', content: options.systemInstruction },
    ...options.history.slice(-8).map((item) => {
      if (item.role === 'model') {
        const msg: {
          role: 'assistant';
          content: string;
          reasoning_details?: unknown;
        } = {
          role: 'assistant',
          content: item.text,
        };
        if (enableReasoning && item.reasoning_details !== undefined) {
          msg.reasoning_details = item.reasoning_details;
        }
        return msg;
      }
      return {
        role: 'user' as const,
        content: item.text,
      };
    }),
    { role: 'user', content: options.message },
  ];

  const payload: Record<string, unknown> = {
    model: cleanModel,
    messages,
  };

  if (enableReasoning) {
    payload.reasoning = { enabled: true };
  }

  if (strictProvider && (cleanModel.includes('gemma-4') || cleanModel.startsWith('google/'))) {
    payload.provider = {
      only: ['google-ai-studio'],
      allow_fallbacks: false,
    };
  }

  return payload;
}

export function extractAiReplyText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const obj = part as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    return joined;
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.content === 'string') return obj.content.trim();
    if (typeof obj.message === 'string') return obj.message.trim();
  }
  return '';
}

export function coerceSafeErrorText(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (typeof err === 'string') {
    const clean = err.trim();
    return clean || fallback;
  }
  if (err instanceof Error) {
    const clean = typeof err.message === 'string' ? err.message.trim() : '';
    return clean && clean !== '[object Object]' ? clean : fallback;
  }
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
    if (obj.error && typeof obj.error === 'object') {
      const nested = (obj.error as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  }
  return fallback;
}

export function sanitizeAiChatHistory(
  messages: Array<{
    role: 'user' | 'assistant' | 'model';
    text: unknown;
    reasoningDetails?: unknown;
    reasoning_details?: unknown;
  }>
): Array<{ role: 'user' | 'model'; text: string; reasoning_details?: unknown }> {
  if (!Array.isArray(messages)) return [];
  const cleaned: Array<{ role: 'user' | 'model'; text: string; reasoning_details?: unknown }> = [];
  for (const item of messages.slice(-8)) {
    if (!item) continue;
    const text = extractAiReplyText(item.text).slice(0, 2800);
    if (!text) continue;
    const role: 'user' | 'model' = item.role === 'user' ? 'user' : 'model';
    const reasoning =
      role === 'model'
        ? item.reasoning_details !== undefined
          ? item.reasoning_details
          : item.reasoningDetails
        : undefined;
    cleaned.push({
      role,
      text,
      ...(reasoning !== undefined ? { reasoning_details: reasoning } : {}),
    });
  }
  return cleaned;
}

export function filterGeminiCandidateModels(preferredModel?: string): string[] {
  const cleanPreferred = String(preferredModel || '').trim();
  const isValidGeminiModel =
    Boolean(cleanPreferred) &&
    /^gemini-/i.test(cleanPreferred) &&
    !cleanPreferred.includes('gemini-2.5') &&
    !cleanPreferred.includes('gemini-1.5') &&
    !cleanPreferred.includes('gemini-2.0');

  return Array.from(
    new Set(
      [
        ...(isValidGeminiModel ? [cleanPreferred] : []),
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
      ].filter(Boolean)
    )
  );
}

export function buildMessengerUrl(rawUrl?: string): string {
  const clean = String(rawUrl || '').trim();
  const fallback = 'https://www.facebook.com/messages/t/mdrakib.roni.1';
  if (!clean) return fallback;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return fallback;
  } catch {
    const slug = clean.replace(/^@/, '').replace(/^\/+/, '');
    return slug ? `https://www.facebook.com/messages/t/${encodeURIComponent(slug)}` : fallback;
  }
}

export function buildWhatsAppSupportUrl(rawPhone?: string, prefillText?: string): string {
  const digitsRaw = String(rawPhone || '').replace(/[^\d]/g, '');
  let normalized = digitsRaw || '8801712345678';
  if (normalized.startsWith('01') && normalized.length === 11) {
    normalized = `88${normalized}`;
  } else if (normalized.startsWith('1') && normalized.length === 10) {
    normalized = `880${normalized}`;
  }
  const base = `https://wa.me/${normalized}`;
  const cleanText = String(prefillText || '').trim();
  return cleanText ? `${base}?text=${encodeURIComponent(cleanText)}` : base;
}

function shouldReplyInBanglaForAiHelp(
  message: string,
  langPreference: AiHelpLangPreference = 'auto',
  uiLang: 'en' | 'bn' = 'en'
): boolean {
  if (langPreference === 'bn') return true;
  if (langPreference === 'en') return false;
  if (/[\u0980-\u09FF]/.test(message)) return true;
  if (
    /\b(keno|kothay|kivabe|kibhabe|amar|apnar|taka|khawar|khabar|nai|ache|hobe|korbo|den|chai|dhonnobad)\b/i.test(
      message
    )
  ) {
    return true;
  }
  return uiLang === 'bn';
}

export function generateFoodoraOwnAiReply(params: {
  message: string;
  langPreference?: AiHelpLangPreference;
  uiLang?: 'en' | 'bn';
  area?: string;
  activeOrderNumber?: string;
  openRestaurants?: Array<{ name: string; area: string; cuisine: string }>;
}): string {
  const q = params.message.trim().toLowerCase();
  const bn = shouldReplyInBanglaForAiHelp(
    params.message,
    params.langPreference || 'auto',
    params.uiLang || 'en'
  );
  const openList = (params.openRestaurants || []).slice(0, 4);
  const openNames = openList.map((r) => `${r.name} (${r.area})`).join(', ');

  if (/(messenger|whatsapp|support|contact|helpline|hotline|মেসেঞ্জার|হোয়াটসঅ্যাপ|সাপোর্ট|যোগাযোগ)/i.test(q)) {
    return bn
      ? 'Foodora BD সাপোর্টের জন্য এই চ্যাট উইন্ডোর উপরের **Messenger** অথবা **WhatsApp** বাটনে ক্লিক করে সরাসরি আমাদের সাথে কথা বলতে পারেন, অথবা এই **Website Live Chat**-এই আপনার প্রশ্ন লিখুন।'
      : 'You can reach Foodora BD Support directly via the **Messenger** or **WhatsApp** buttons at the top of this chat (or in the website footer), or keep chatting right here in **Website Live Chat**!';
  }

  if (/(unavailable|closed|bandho|bondho|অর্ডার নেওয়া|বন্ধ|available|store open)/i.test(q)) {
    return bn
      ? 'কোনো রেস্টুরেন্ট "unavailable" দেখালে বুঝতে হবে সেটির "Store Open" বন্ধ আছে অথবা অ্যাডমিন অনুমোদন (approved) বাকি আছে। পার্টনার ড্যাশবোর্ডের Store Switch থেকে Store Open চালু করলেই অর্ডার নেওয়া শুরু হবে। চাইলে হোমপেজের চালু থাকা অন্য রেস্টুরেন্ট থেকেও অর্ডার করতে পারেন।'
      : 'A restaurant appears unavailable when its "Store Open" toggle is switched OFF in the Partner/Admin Dashboard or its approval status is still pending. Re-opening the store toggle immediately re-enables ordering, or you can pick another Open restaurant on the home feed.';
  }

  if (/(job|apply|join|salary|নিয়োগ|জব|কাজ|আবেদন)/i.test(q)) {
    return bn
      ? 'রাইডার বা রেস্টুরেন্ট পার্টনার হতে চাইলে উপরের "Rider Job" বা "Partner" লিংকে ক্লিক করুন। বাইসাইকেল রাইডারদের ড্রাইভিং লাইসেন্স ছাড়াই শুধুমাত্র ঐচ্ছিক NID দিয়ে আবেদন করার সুবিধা রয়েছে।'
      : 'To join as a delivery rider or restaurant partner, open "Rider Job" or "Partner" from the top navigation. Bicycle riders can join without a driving license using an optional NID.';
  }

  if (/(pay|bkash|nagad|ssl|cod|cash|promo|coupon|discount|পেমেন্ট|বিকাশ|নগদ|ক্যাশ|প্রোমো)/i.test(q)) {
    return bn
      ? 'Foodora BD-তে bKash, Nagad, SSLCommerz এবং Cash on Delivery (COD) সব মাধ্যমই চালু আছে। চেকআউটে FOODORA50 প্রোমো কোড ব্যবহার করলে নির্দিষ্ট শর্তে ডিসকাউন্ট পাওয়া যায়। পেমেন্ট মেথড ও API গেটওয়ে সুপার অ্যাডমিনের Backend Control থেকেও কনফিগার করা যায়।'
      : 'Foodora BD supports bKash, Nagad, SSLCommerz, and Cash on Delivery (COD). You can apply promo codes like FOODORA50 at checkout, and Super Admins can manage live/sandbox gateways under Backend Control.';
  }

  if (/(track|rider|eta|gps|ট্র্যাক|রাইডার|অর্ডার.*(কোথায়|kothay|status)|(কোথায়|kothay).*(order|rider|ডেলিভারি))/i.test(q)) {
    const ordRef = params.activeOrderNumber ? ` (${params.activeOrderNumber})` : '';
    return bn
      ? `অর্ডার ট্র্যাক করতে হেডারের "Track Rider" বাটনে ক্লিক করুন${ordRef} অথবা চেকআউট ইমেইল ও অর্ডার নম্বর দিন। সেখানে ম্যাপে রাইডারের লাইভ GPS অবস্থান, দূরত্ব ও পৌঁছানোর আনুমানিক সময় (ETA) দেখতে পাবেন।`
      : `Click "Track Rider" in the top bar${ordRef} or search using your Checkout Email + Order Number to view live rider GPS coordinates, route path, and ETA.`;
  }

  if (/(owner|vendor|partner|branch|stock|variant|variation|addon|dispatch|শাখা|স্টক|ভেন্ডর|পার্টনার|ভ্যারিয়েশন)/i.test(q)) {
    return bn
      ? 'একজন পার্টনার ১টি মূল রেস্টুরেন্ট খুলে এর অধীনে **Add Branch** দিয়ে একাধিক শাখা যোগ করতে পারেন। Menu ও Stock ট্যাবে প্রোডাক্ট ভ্যারিয়েশন, অ্যাড-অন ও In Stock আপডেট এবং অর্ডার ডিসপ্যাচ সবই সরাসরি করা যায়।'
      : 'Each partner can open 1 primary restaurant and add multiple branches via **Add Branch**. Inside the Partner Portal you can dispatch orders, update stock/variations, and post Rider Jobs.';
  }

  if (/(restaurant|menu|food|biriyani|kacchi|burger|pizza|খাওয়া|খাবার|রেস্টুরেন্ট|অর্ডার)/i.test(q)) {
    return bn
      ? `${params.area ? `${params.area} এলাকায় ` : ''}হোমপেজের "Order Popular Food Now" বা রেস্টুরেন্ট কার্ড থেকে যেকোনো ডিশ কার্টে যোগ করে অর্ডার করতে পারবেন।${openNames ? ` এখন খোলা আছে: ${openNames}।` : ''} চাইলে পছন্দের খাবারের নাম বলুন, আমি খুঁজে দিতে সাহায্য করবো।`
      : `Pick any dish from "Order Popular Food Now" or browse open restaurants${params.area ? ` around ${params.area}` : ''} to add items and checkout.${openNames ? ` Currently open: ${openNames}.` : ''} Tell me what craving you have and I can point you to it!`;
  }

  return bn
    ? `আমি Foodora BD-এর নিজস্ব AI সহায়ক।${openNames ? ` এখন সক্রিয় কিছু রেস্টুরেন্ট: ${openNames}।` : ''} অর্ডার করা, রাইডার লাইভ ট্র্যাকিং, শাখা যোগ করা, bKash/COD পেমেন্ট কিংবা Messenger / WhatsApp সাপোর্ট সম্পর্কে যেকোনো প্রশ্ন করতে পারেন।`
    : `I am Foodora BD's built-in AI assistant.${openNames ? ` Currently open stores include: ${openNames}.` : ''} Ask me anything about ordering food, live rider tracking, branch setup, payments, or Messenger/WhatsApp support.`;
}

export function validateRiderJobPayload(input: {
  restaurantId?: unknown;
  title?: unknown;
  titleBn?: unknown;
  zone?: unknown;
  vehicleType?: unknown;
  salaryRange?: unknown;
  shiftHours?: unknown;
  vacancies?: unknown;
  description?: unknown;
}):
  | {
      valid: true;
      data: {
        restaurantId: number;
        title: string;
        titleBn: string;
        zone: string;
        vehicleType: string;
        salaryRange: string;
        shiftHours: string;
        vacancies: number;
        description: string;
      };
    }
  | { valid: false; reason: string } {
  const restaurantId = Number(input.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return { valid: false, reason: 'Please select a valid restaurant for the rider job.' };
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 3 || title.length > 120) {
    return { valid: false, reason: 'Job title must be between 3 and 120 characters.' };
  }
  const titleBn =
    typeof input.titleBn === 'string' && input.titleBn.trim().length > 0
      ? input.titleBn.trim()
      : title;
  const zone = typeof input.zone === 'string' ? input.zone.trim() : '';
  if (zone.length < 2 || zone.length > 120) {
    return { valid: false, reason: 'Delivery zone / area is required.' };
  }
  const vehicleType =
    typeof input.vehicleType === 'string' && input.vehicleType.trim().length >= 2
      ? input.vehicleType.trim()
      : 'Motorbike / Bicycle';
  const salaryRange =
    typeof input.salaryRange === 'string' && input.salaryRange.trim().length >= 2
      ? input.salaryRange.trim()
      : '৳15,000 - ৳22,000 / month';
  const shiftHours =
    typeof input.shiftHours === 'string' && input.shiftHours.trim().length >= 2
      ? input.shiftHours.trim()
      : 'Full-time · 11:00 AM - 11:00 PM';
  const vacanciesRaw = Number(input.vacancies ?? 1);
  const vacancies = Number.isInteger(vacanciesRaw) && vacanciesRaw >= 1 && vacanciesRaw <= 100 ? vacanciesRaw : 1;
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 600) : '';

  return {
    valid: true,
    data: {
      restaurantId,
      title,
      titleBn,
      zone,
      vehicleType,
      salaryRange,
      shiftHours,
      vacancies,
      description,
    },
  };
}

export function filterOrdersByRestaurantOwnership<T extends { restaurantId: number }>(
  allOrders: readonly T[],
  ownedRestaurantIds: readonly number[],
  isAdmin: boolean
): T[] {
  if (isAdmin) return [...allOrders];
  const ownedSet = new Set(ownedRestaurantIds);
  return allOrders.filter((o) => ownedSet.has(o.restaurantId));
}

export interface ProductVariationOption {
  name: string;
  priceDelta: number;
}

export interface ProductAddonOption {
  name: string;
  price: number;
}

export function normalizeVariationsList(
  raw: unknown,
  fallbackRegular = true
): ProductVariationOption[] {
  if (!Array.isArray(raw)) {
    return fallbackRegular ? [{ name: 'Regular', priceDelta: 0 }] : [];
  }
  const seen = new Set<string>();
  const out: ProductVariationOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as { name?: unknown; priceDelta?: unknown };
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const numDelta = Number(rec.priceDelta ?? 0);
    const priceDelta = Number.isFinite(numDelta)
      ? Math.max(-50000, Math.min(50000, Math.round(numDelta)))
      : 0;
    out.push({ name, priceDelta });
  }
  if (out.length === 0 && fallbackRegular) {
    return [{ name: 'Regular', priceDelta: 0 }];
  }
  return out;
}

export function normalizeAddonsList(raw: unknown): ProductAddonOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProductAddonOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as { name?: unknown; price?: unknown };
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const numPrice = Number(rec.price ?? 0);
    const price = Number.isFinite(numPrice)
      ? Math.max(0, Math.min(50000, Math.round(numPrice)))
      : 0;
    out.push({ name, price });
  }
  return out;
}

export function validateVendorAddRiderPayload(input: {
  restaurantId?: unknown;
  fullName?: unknown;
  phone?: unknown;
  email?: unknown;
  password?: unknown;
  vehicleType?: unknown;
  zone?: unknown;
  nidNumber?: unknown;
}):
  | {
      valid: true;
      data: {
        restaurantId: number;
        fullName: string;
        phone: string;
        email: string;
        password?: string;
        vehicleType: string;
        zone: string;
        nidNumber: string;
      };
    }
  | { valid: false; reason: string } {
  const restaurantId = Number(input.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return { valid: false, reason: 'Please select a valid restaurant store.' };
  }
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 100) {
    return { valid: false, reason: 'Delivery man full name must be at least 2 characters.' };
  }
  const rawPhone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const digits = rawPhone.replace(/[\s\-()]/g, '');
  let normalizedPhone = '';
  if (/^\+?8801[3-9]\d{8}$/.test(digits)) {
    normalizedPhone = digits.startsWith('+') ? digits : `+${digits}`;
  } else if (/^01[3-9]\d{8}$/.test(digits)) {
    normalizedPhone = `+88${digits}`;
  } else {
    return { valid: false, reason: 'Please enter a valid Bangladesh mobile number (e.g. 017XXXXXXXX).' };
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@') || email.length < 5) {
    return { valid: false, reason: 'Please provide a valid email address for the delivery man.' };
  }
  const password = typeof input.password === 'string' ? input.password : '';
  if (password.trim().length > 0 && password.trim().length < 6) {
    return { valid: false, reason: 'Login password must be at least 6 characters (or leave blank).' };
  }
  const vehicleType =
    typeof input.vehicleType === 'string' && input.vehicleType.trim().length >= 2
      ? input.vehicleType.trim().slice(0, 60)
      : 'Motorbike';
  const zone =
    typeof input.zone === 'string' && input.zone.trim().length >= 2
      ? input.zone.trim().slice(0, 120)
      : 'Gulshan 2';
  const nidNumber = typeof input.nidNumber === 'string' ? input.nidNumber.trim().slice(0, 50) : '';

  return {
    valid: true,
    data: {
      restaurantId,
      fullName,
      phone: normalizedPhone,
      email,
      ...(password.trim() ? { password: password.trim() } : {}),
      vehicleType,
      zone,
      nidNumber,
    },
  };
}

export function formatRiderShortOrderCode(orderNumber: string, orderId?: number): string {
  const clean = String(orderNumber || '').trim();
  const digitsMatch = clean.match(/(\d{3,6})$/);
  if (digitsMatch) return digitsMatch[1];
  if (typeof orderId === 'number' && Number.isFinite(orderId)) {
    return String(orderId).padStart(4, '0');
  }
  return clean.slice(-4) || '0000';
}

export function calculateRiderLegEtaMin(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  minMinutes = 2
): number {
  const km = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
  if (!Number.isFinite(km)) return minMinutes;
  const mins = Math.round(km * 3.2 + 1);
  return Math.max(minMinutes, Math.min(45, mins));
}

export function resolveRiderCashCollectAmount(
  paymentMethod: string,
  totalAmount: number,
  editedAmount?: number | null,
  options?: {
    paymentSplitMode?: string | null;
    cashDueToRider?: number | null;
  }
): {
  isCod: boolean;
  isDeliveryCashOnly: boolean;
  amountToCollect: number;
  statusLabelEn: string;
  statusLabelBn: string;
} {
  const isCod = String(paymentMethod || '').toLowerCase() === 'cod';
  const splitMode = String(options?.paymentSplitMode || '').toLowerCase();
  const hasDeliveryCashSplit = splitMode === 'online_food_cash_delivery';

  if (hasDeliveryCashSplit && !isCod) {
    const due =
      typeof options?.cashDueToRider === 'number' && Number.isFinite(options.cashDueToRider)
        ? Math.max(0, Math.round(options.cashDueToRider))
        : 0;
    const finalAmount =
      editedAmount !== null && editedAmount !== undefined && Number.isFinite(Number(editedAmount))
        ? Math.max(0, Math.round(Number(editedAmount)))
        : due;
    if (finalAmount <= 0) {
      return {
        isCod: false,
        isDeliveryCashOnly: true,
        amountToCollect: 0,
        statusLabelEn: 'Food paid online · Free delivery',
        statusLabelBn: 'খাবার অনলাইনে পরিশোধিত · ফ্রি ডেলিভারি',
      };
    }
    return {
      isCod: true,
      isDeliveryCashOnly: true,
      amountToCollect: finalAmount,
      statusLabelEn: 'Collect delivery charge cash',
      statusLabelBn: 'রাইডার ডেলিভারি চার্জ ক্যাশ নিন',
    };
  }

  if (!isCod) {
    return {
      isCod: false,
      isDeliveryCashOnly: false,
      amountToCollect: 0,
      statusLabelEn: 'Paid online',
      statusLabelBn: 'অনলাইনে পরিশোধিত',
    };
  }
  const base = Number.isFinite(Number(totalAmount)) ? Math.max(0, Number(totalAmount)) : 0;
  const finalAmount =
    editedAmount !== null && editedAmount !== undefined && Number.isFinite(Number(editedAmount))
      ? Math.max(0, Number(editedAmount))
      : base;
  return {
    isCod: true,
    isDeliveryCashOnly: false,
    amountToCollect: finalAmount,
    statusLabelEn: 'Collect cash',
    statusLabelBn: 'ক্যাশ সংগ্রহ করুন',
  };
}

export function parseUploadedImageDataUrl(
  rawDataUrl: string,
  filename?: string
):
  | { valid: true; ext: 'jpg' | 'png' | 'webp' | 'gif'; base64Data: string; mimeType: string }
  | { valid: false; reason: string } {
  const trimmed = String(rawDataUrl || '').trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1 || !trimmed.toLowerCase().startsWith('data:')) {
    return { valid: false, reason: 'Only PNG, JPG, WEBP, or GIF images are supported' };
  }

  const header = trimmed.slice(5, commaIdx).toLowerCase();
  if (!header.includes(';base64')) {
    return { valid: false, reason: 'Image payload must be base64 encoded' };
  }

  const rawMime = header.split(';')[0].trim();
  const cleanBase64 = trimmed.slice(commaIdx + 1).replace(/\s+/g, '');
  if (!cleanBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    return { valid: false, reason: 'Corrupted base64 image payload' };
  }

  const mimeToExt: Record<string, 'jpg' | 'png' | 'webp' | 'gif'> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/jfif': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  let ext = mimeToExt[rawMime];

  // Fallback for Android/file-picker uploads reported as application/octet-stream or empty MIME
  if (!ext && (rawMime === 'application/octet-stream' || rawMime === '' || rawMime === 'image/*')) {
    const buf = Buffer.from(cleanBase64.slice(0, 32), 'base64');
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      ext = 'jpg';
    } else if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      ext = 'png';
    } else if (
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      ext = 'webp';
    } else if (buf.length >= 4 && buf.subarray(0, 3).toString('ascii') === 'GIF') {
      ext = 'gif';
    } else {
      const lowerName = String(filename || '').toLowerCase();
      if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) ext = 'jpg';
      else if (lowerName.endsWith('.png')) ext = 'png';
      else if (lowerName.endsWith('.webp')) ext = 'webp';
      else if (lowerName.endsWith('.gif')) ext = 'gif';
    }
  }

  if (!ext) {
    return { valid: false, reason: 'Only PNG, JPG, WEBP, or GIF images are supported' };
  }

  const extToMime: Record<'jpg' | 'png' | 'webp' | 'gif', string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };

  return {
    valid: true,
    ext,
    base64Data: cleanBase64,
    mimeType: extToMime[ext],
  };
}

export interface RiderProfileUpdateInput {
  fullName: string;
  phone: string;
  vehicleType: string;
  zone: string;
  nidNumber?: string;
  isAvailable?: boolean;
  avatarUrl?: string;
}

export function sanitizeRiderProfileUpdate(
  input: Partial<RiderProfileUpdateInput>
):
  | { valid: true; data: Required<RiderProfileUpdateInput> }
  | { valid: false; error: string } {
  const fullName = String(input.fullName || '').trim();
  if (fullName.length < 2 || fullName.length > 80) {
    return { valid: false, error: 'Full name must be between 2 and 80 characters.' };
  }

  const phone = String(input.phone || '').trim();
  const digitsOnly = phone.replace(/[^\d]/g, '');
  if (digitsOnly.length < 8 || phone.length > 24) {
    return { valid: false, error: 'Please enter a valid phone number.' };
  }

  const vehicleType = String(input.vehicleType || '').trim();
  if (vehicleType.length < 2 || vehicleType.length > 50) {
    return { valid: false, error: 'Please specify a valid vehicle type.' };
  }

  const zone = String(input.zone || '').trim();
  if (zone.length < 2 || zone.length > 100) {
    return { valid: false, error: 'Please select or enter a valid working zone.' };
  }

  const nidNumber = String(input.nidNumber ?? '').trim().slice(0, 40);
  const isAvailable = typeof input.isAvailable === 'boolean' ? input.isAvailable : true;

  const avatarUrl = String(input.avatarUrl ?? '').trim();
  if (
    avatarUrl &&
    !avatarUrl.startsWith('/uploads/') &&
    !avatarUrl.startsWith('https://') &&
    !avatarUrl.startsWith('http://') &&
    !avatarUrl.startsWith('data:image/')
  ) {
    return { valid: false, error: 'Profile photo URL must be a valid uploaded image.' };
  }

  return {
    valid: true,
    data: {
      fullName,
      phone,
      vehicleType,
      zone,
      nidNumber,
      isAvailable,
      avatarUrl,
    },
  };
}

export function calculateRiderProfileStats(
  rider: { totalDeliveries?: number; totalEarnings?: number } | null | undefined,
  assignedOrders: Array<{ status: string; deliveryFee?: number }>
) {
  const deliveredOrders = assignedOrders.filter((o) => o.status === 'delivered');
  const cancelledOrders = assignedOrders.filter((o) => o.status === 'cancelled');
  const activeOrders = assignedOrders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  );

  const deliveredCount = Math.max(rider?.totalDeliveries ?? 0, deliveredOrders.length);
  const cancelledCount = cancelledOrders.length;
  const totalFinished = deliveredCount + cancelledCount;
  const completionRatePct =
    totalFinished > 0 ? Math.round((deliveredCount / totalFinished) * 100) : 100;
  const totalEarnings = rider?.totalEarnings ?? 0;
  const avgEarningPerOrder =
    deliveredCount > 0 ? Math.round(totalEarnings / deliveredCount) : 0;

  return {
    deliveredCount,
    cancelledCount,
    activeCount: activeOrders.length,
    completionRatePct,
    totalEarnings,
    avgEarningPerOrder,
  };
}

export function isBicycleVehicleType(vehicleType: string | null | undefined): boolean {
  const clean = String(vehicleType || '').trim().toLowerCase();
  if (!clean) return false;
  return (
    clean === 'bicycle' ||
    clean === 'cycle' ||
    clean === 'bycicle' ||
    clean === 'bycikel' ||
    clean.includes('bicycle') ||
    clean.includes('pushbike') ||
    clean.includes('সাইকেল')
  );
}

export function canOwnerOpenNewRestaurant(
  existingOwnedCount: number,
  actorRole: string
): { allowed: boolean; error?: string } {
  const role = String(actorRole || '').trim().toLowerCase();
  if (role === 'admin' || role === 'super_admin') {
    return { allowed: true };
  }
  if (existingOwnedCount >= 1) {
    return {
      allowed: false,
      error:
        'Each partner account can open 1 restaurant. Please add a new branch under your existing restaurant instead.',
    };
  }
  return { allowed: true };
}

export function buildBranchRestaurantNames(
  primaryName: string,
  primaryNameBn: string,
  branchLabel: string,
  branchLabelBn?: string
): { name: string; nameBn: string } {
  const stripBranchSuffix = (raw: string) =>
    String(raw || '')
      .split(/\s+[—–-]\s+/)[0]
      .trim();

  const baseEn = stripBranchSuffix(primaryName) || 'Foodora Partner';
  const baseBn = stripBranchSuffix(primaryNameBn) || baseEn;
  const cleanBranchEn = String(branchLabel || '').trim();
  const cleanBranchBn = String(branchLabelBn || '').trim() || cleanBranchEn;

  return {
    name: `${baseEn} — ${cleanBranchEn}`,
    nameBn: `${baseBn} — ${cleanBranchBn}`,
  };
}

export type BangladeshDeliveryServiceCode =
  | 'pathao_food'
  | 'foodora_express'
  | 'steadfast'
  | 'redx'
  | 'paperfly'
  | 'restaurant_fleet';

export interface BangladeshDeliveryServiceMeta {
  code: BangladeshDeliveryServiceCode;
  nameEn: string;
  nameBn: string;
  mode: DeliveryMode;
  minBaseFee: number;
  etaOffsetMin: number;
  coverageNoteEn: string;
  coverageNoteBn: string;
}

export const BANGLADESH_DELIVERY_SERVICES: BangladeshDeliveryServiceMeta[] = [
  {
    code: 'pathao_food',
    nameEn: 'Pathao Food & Courier',
    nameBn: 'পাঠাও ফুড ও কুরিয়ার',
    mode: 'third_party',
    minBaseFee: 55,
    etaOffsetMin: 2,
    coverageNoteEn: 'Instant Pathao Food / Parcel rider across Bangladesh',
    coverageNoteBn: 'পাঠাও ফুড/কুরিয়ারের মাধ্যমে সারা বাংলাদেশে দ্রুত ডেলিভারি',
  },
  {
    code: 'foodora_express',
    nameEn: 'Foodora Express Rider',
    nameBn: 'ফুডোরা এক্সপ্রেস রাইডার',
    mode: 'platform',
    minBaseFee: 35,
    etaOffsetMin: 0,
    coverageNoteEn: 'Dedicated live GPS food rider fleet',
    coverageNoteBn: 'লাইভ জিপিএস ট্র্যাকিংসহ নিজস্ব ফুড রাইডার',
  },
  {
    code: 'steadfast',
    nameEn: 'Steadfast Courier BD',
    nameBn: 'স্টেডফাস্ট কুরিয়ার বিডি',
    mode: 'third_party',
    minBaseFee: 60,
    etaOffsetMin: 5,
    coverageNoteEn: 'Nationwide 64-district food & parcel partner',
    coverageNoteBn: '৬৪ জেলায় স্টেডফাস্ট কুরিয়ার ডেলিভারি সাপোর্ট',
  },
  {
    code: 'redx',
    nameEn: 'RedX Delivery BD',
    nameBn: 'রেডএক্স ডেলিভারি বিডি',
    mode: 'third_party',
    minBaseFee: 60,
    etaOffsetMin: 5,
    coverageNoteEn: 'Express zone dispatch via RedX Bangladesh',
    coverageNoteBn: 'রেডএক্স-এর মাধ্যমে দ্রুত জোন ডেলিভারি',
  },
  {
    code: 'paperfly',
    nameEn: 'Paperfly / eCourier BD',
    nameBn: 'পেপারফ্লাই / ই-কুরিয়ার',
    mode: 'third_party',
    minBaseFee: 65,
    etaOffsetMin: 7,
    coverageNoteEn: 'Doorstep courier coverage across Bangladesh',
    coverageNoteBn: 'সারা দেশের হোম ডেলিভারি কুরিয়ার নেটওয়ার্ক',
  },
  {
    code: 'restaurant_fleet',
    nameEn: 'Restaurant Own Rider',
    nameBn: 'রেস্টুরেন্টের নিজস্ব রাইডার',
    mode: 'restaurant',
    minBaseFee: 30,
    etaOffsetMin: 0,
    coverageNoteEn: 'Dispatched directly by the restaurant kitchen',
    coverageNoteBn: 'সরাসরি রেস্টুরেন্টের নিজস্ব রাইডার দ্বারা ডেলিভারি',
  },
];

export function getBangladeshDeliveryServiceMeta(
  code?: string | null
): BangladeshDeliveryServiceMeta {
  const clean = String(code || '').trim().toLowerCase();
  return (
    BANGLADESH_DELIVERY_SERVICES.find((s) => s.code === clean) ||
    BANGLADESH_DELIVERY_SERVICES[0]
  );
}

export function selectAutoBangladeshiDeliveryService(options: {
  restaurantDeliveryMode?: DeliveryMode | null;
  preferredServiceCode?: string | null;
  deliveryModeOverride?: DeliveryMode | null;
  pathaoEnabled?: boolean;
}): BangladeshDeliveryServiceMeta {
  const cleanPreferred = String(options.preferredServiceCode || '').trim().toLowerCase();
  if (cleanPreferred) {
    const matched = BANGLADESH_DELIVERY_SERVICES.find((s) => s.code === cleanPreferred);
    if (matched) return matched;
  }

  const targetMode = options.deliveryModeOverride || options.restaurantDeliveryMode || 'third_party';
  if (targetMode === 'third_party') {
    return options.pathaoEnabled === false
      ? getBangladeshDeliveryServiceMeta('steadfast')
      : getBangladeshDeliveryServiceMeta('pathao_food');
  }
  if (targetMode === 'restaurant') {
    return getBangladeshDeliveryServiceMeta('restaurant_fleet');
  }
  return getBangladeshDeliveryServiceMeta('foodora_express');
}

export interface MapRouteTelemetry {
  distanceKm: number;
  etaMinutes: number;
  mode: 'rider' | 'route';
}

export function computeMapRouteTelemetry(input: {
  center: { lat: number; lng: number };
  secondaryPoint?: { lat: number; lng: number } | null;
  riderPoint?: { lat: number; lng: number } | null;
  riderTarget?: { lat: number; lng: number } | null;
  status?: string | null;
  liveDistanceKm?: number | null;
  liveEtaMinutes?: number | null;
  vehicleMode?: DeliveryVehicleMode | string | null;
}): MapRouteTelemetry | null {
  const hasCenter =
    Number.isFinite(input.center?.lat) && Number.isFinite(input.center?.lng);
  if (!hasCenter) return null;

  const hasRider =
    Boolean(input.riderPoint) &&
    Number.isFinite(input.riderPoint?.lat) &&
    Number.isFinite(input.riderPoint?.lng);
  const hasSecondary =
    Boolean(input.secondaryPoint) &&
    Number.isFinite(input.secondaryPoint?.lat) &&
    Number.isFinite(input.secondaryPoint?.lng);

  if (!hasRider && !hasSecondary) {
    return null;
  }

  let computedDistance = 0;
  let computedEta = 0;
  let mode: 'rider' | 'route' = 'route';

  if (hasRider && input.riderPoint) {
    mode = 'rider';
    const target =
      input.riderTarget &&
      Number.isFinite(input.riderTarget.lat) &&
      Number.isFinite(input.riderTarget.lng)
        ? input.riderTarget
        : input.center;
    const live = calculateLiveRiderEta(
      input.riderPoint.lat,
      input.riderPoint.lng,
      target.lat,
      target.lng,
      input.status || undefined
    );
    computedDistance = live.remainingKm;
    if (input.vehicleMode) {
      const normalized = normalizeDeliveryVehicleMode(input.vehicleMode);
      const vehicleAdjusted = computeVehicleAdjustedDurations({
        vehicleMode: normalized,
        distanceMeters: Math.max(100, computedDistance * 1000),
        durationSeconds: live.etaMinutes * 60,
        staticDurationSeconds: Math.round(live.etaMinutes * 60 * 0.8),
        routeMatchesVehicle: normalized !== 'bicycle' && normalized !== 'walking',
      });
      computedEta = Math.max(2, Math.round(vehicleAdjusted.effectiveSec / 60));
    } else {
      computedEta = live.etaMinutes;
    }
  } else if (hasSecondary && input.secondaryPoint) {
    mode = 'route';
    computedDistance =
      Math.round(
        haversineDistanceKm(
          input.secondaryPoint.lat,
          input.secondaryPoint.lng,
          input.center.lat,
          input.center.lng
        ) * 100
      ) / 100;
    const baseEta = Math.max(5, Math.round((computedDistance / 22) * 60 + 4));
    if (input.vehicleMode) {
      const normalized = normalizeDeliveryVehicleMode(input.vehicleMode);
      const vehicleAdjusted = computeVehicleAdjustedDurations({
        vehicleMode: normalized,
        distanceMeters: Math.max(100, computedDistance * 1000),
        durationSeconds: baseEta * 60,
        staticDurationSeconds: Math.round(baseEta * 60 * 0.8),
        routeMatchesVehicle: normalized !== 'bicycle' && normalized !== 'walking',
      });
      computedEta = Math.max(2, Math.round(vehicleAdjusted.effectiveSec / 60));
    } else {
      computedEta = baseEta;
    }
  }

  const finalDistance =
    typeof input.liveDistanceKm === 'number' &&
    Number.isFinite(input.liveDistanceKm) &&
    input.liveDistanceKm >= 0
      ? Math.round(input.liveDistanceKm * 100) / 100
      : computedDistance;

  const finalEta =
    typeof input.liveEtaMinutes === 'number' &&
    Number.isFinite(input.liveEtaMinutes) &&
    input.liveEtaMinutes >= 0
      ? Math.round(input.liveEtaMinutes)
      : computedEta;

  return {
    distanceKm: finalDistance,
    etaMinutes: finalEta,
    mode,
  };
}

export type TrafficSeverity = 'clear' | 'moderate' | 'heavy';

export type DeliveryVehicleMode = 'bicycle' | 'motorbike' | 'auto' | 'car' | 'walking';

export interface DeliveryVehicleMeta {
  mode: DeliveryVehicleMode;
  labelEn: string;
  labelBn: string;
  googleTravelMode: 'BICYCLING' | 'DRIVING' | 'WALKING';
  osrmProfile: 'cycling' | 'driving' | 'foot';
  avgSpeedKmh: number;
  isBetaRoute: boolean;
}

export const DELIVERY_VEHICLE_MODES: ReadonlyArray<DeliveryVehicleMeta> = [
  {
    mode: 'bicycle',
    labelEn: 'Cycle',
    labelBn: 'সাইকেল',
    googleTravelMode: 'BICYCLING',
    osrmProfile: 'cycling',
    avgSpeedKmh: 14.5,
    isBetaRoute: true,
  },
  {
    mode: 'motorbike',
    labelEn: 'Motorbike',
    labelBn: 'বাইক',
    googleTravelMode: 'DRIVING',
    osrmProfile: 'driving',
    avgSpeedKmh: 27,
    isBetaRoute: true,
  },
  {
    mode: 'auto',
    labelEn: 'Auto / CNG',
    labelBn: 'অটো / সিএনজি',
    googleTravelMode: 'DRIVING',
    osrmProfile: 'driving',
    avgSpeedKmh: 20,
    isBetaRoute: false,
  },
  {
    mode: 'car',
    labelEn: 'Car',
    labelBn: 'গাড়ি',
    googleTravelMode: 'DRIVING',
    osrmProfile: 'driving',
    avgSpeedKmh: 26,
    isBetaRoute: false,
  },
  {
    mode: 'walking',
    labelEn: 'Walk',
    labelBn: 'পায়ে হেঁটে',
    googleTravelMode: 'WALKING',
    osrmProfile: 'foot',
    avgSpeedKmh: 4.8,
    isBetaRoute: true,
  },
];

export function normalizeDeliveryVehicleMode(
  vehicleType: string | null | undefined
): DeliveryVehicleMode {
  const clean = String(vehicleType || '').trim().toLowerCase();
  if (!clean) return 'motorbike';
  if (isBicycleVehicleType(clean)) return 'bicycle';
  if (
    clean.includes('walk') ||
    clean.includes('foot') ||
    clean.includes('পায়ে') ||
    clean.includes('হেঁটে')
  ) {
    return 'walking';
  }
  if (
    clean.includes('auto') ||
    clean.includes('cng') ||
    clean.includes('rickshaw') ||
    clean.includes('easybike') ||
    clean.includes('অটো') ||
    clean.includes('সিএনজি') ||
    clean.includes('রিকশা')
  ) {
    return 'auto';
  }
  if (
    clean.includes('car') ||
    clean.includes('sedan') ||
    clean.includes('pickup') ||
    clean.includes('van') ||
    clean.includes('truck') ||
    clean.includes('micro') ||
    clean.includes('গাড়ি') ||
    clean.includes('গাড়ি') ||
    clean.includes('কার')
  ) {
    return 'car';
  }
  return 'motorbike';
}

export function getDeliveryVehicleMeta(mode: DeliveryVehicleMode): DeliveryVehicleMeta {
  return DELIVERY_VEHICLE_MODES.find((m) => m.mode === mode) || DELIVERY_VEHICLE_MODES[1];
}

export function computeVehicleAdjustedDurations(input: {
  vehicleMode: DeliveryVehicleMode;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number;
  routeMatchesVehicle?: boolean;
}): { effectiveSec: number; staticSec: number } {
  const distM = Math.max(0, input.distanceMeters);
  const rawDur = Math.max(60, input.durationSeconds);
  const rawStatic = Math.max(60, input.staticDurationSeconds || rawDur);
  const rawDelay = Math.max(0, rawDur - rawStatic);

  if (input.vehicleMode === 'bicycle') {
    const cycleEstimateSec = Math.max(120, Math.round((distM / 1000 / 14.5) * 3600));
    const baseStatic = input.routeMatchesVehicle ? rawStatic : cycleEstimateSec;
    const baseDur = input.routeMatchesVehicle
      ? Math.max(rawDur, Math.round(baseStatic + rawDelay * 0.25))
      : Math.round(cycleEstimateSec + rawDelay * 0.25);
    return { effectiveSec: baseDur, staticSec: baseStatic };
  }

  if (input.vehicleMode === 'walking') {
    const walkEstimateSec = Math.max(120, Math.round((distM / 1000 / 4.8) * 3600));
    const baseStatic = input.routeMatchesVehicle ? rawStatic : walkEstimateSec;
    return { effectiveSec: input.routeMatchesVehicle ? rawDur : walkEstimateSec, staticSec: baseStatic };
  }

  if (input.vehicleMode === 'motorbike') {
    const motoOpenSec = Math.max(
      120,
      Math.min(rawStatic, Math.round((distM / 1000 / 28) * 3600))
    );
    const filteredDelay = Math.round(rawDelay * 0.55);
    return { effectiveSec: motoOpenSec + filteredDelay, staticSec: motoOpenSec };
  }

  if (input.vehicleMode === 'auto') {
    const autoOpenSec = Math.max(
      rawStatic,
      Math.round((distM / 1000 / 20) * 3600)
    );
    const autoDelay = Math.round(rawDelay * 1.05);
    return { effectiveSec: autoOpenSec + autoDelay, staticSec: autoOpenSec };
  }

  return { effectiveSec: rawDur, staticSec: rawStatic };
}

export interface RouteDirectionStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver?: string;
  roadName?: string;
}

export interface SpeedSegmentSummary {
  normalCount: number;
  slowCount: number;
  jamCount: number;
}

export interface LiveRouteTrafficSummary {
  distanceKm: number;
  etaMinutes: number;
  staticMinutes: number;
  delayMinutes: number;
  vehicleMode: DeliveryVehicleMode;
  trafficSeverity: TrafficSeverity;
  trafficLabelEn: string;
  trafficLabelBn: string;
  jamAreasTextEn: string;
  jamAreasTextBn: string;
  steps: RouteDirectionStep[];
  speedSegments: SpeedSegmentSummary;
  source: 'google_routes' | 'osrm' | 'estimated';
}

export function formatDirectionStepDistance(meters: number, lang: 'en' | 'bn' = 'en'): string {
  const safeMeters = Number.isFinite(meters) && meters > 0 ? Math.round(meters) : 0;
  if (safeMeters >= 1000) {
    const km = (safeMeters / 1000).toFixed(1);
    return lang === 'bn' ? `${km} কিমি` : `${km} km`;
  }
  return lang === 'bn' ? `${safeMeters} মি` : `${safeMeters} m`;
}

export function estimateDhakaPeakTrafficFactor(hour24?: number): number {
  const h =
    typeof hour24 === 'number' && Number.isFinite(hour24)
      ? ((Math.floor(hour24) % 24) + 24) % 24
      : (new Date().getUTCHours() + 6) % 24;
  // Morning office rush (8-11 AM) and evening peak (5-10 PM) BD time
  if ((h >= 8 && h <= 11) || (h >= 17 && h <= 21)) {
    return 1.38;
  }
  // Daytime moderate city flow (12-4 PM)
  if (h >= 12 && h <= 16) {
    return 1.2;
  }
  return 1.06;
}

export function summarizeTrafficCongestion(input: {
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds?: number | null;
  speedLevels?: ReadonlyArray<string | null | undefined>;
  steps?: ReadonlyArray<RouteDirectionStep>;
  source?: 'google_routes' | 'osrm' | 'estimated';
  peakFactorOverride?: number;
  vehicleMode?: DeliveryVehicleMode;
  routeMatchesVehicle?: boolean;
}): LiveRouteTrafficSummary {
  const vehicleMode: DeliveryVehicleMode = input.vehicleMode || 'car';
  const safeDistM =
    Number.isFinite(input.distanceMeters) && input.distanceMeters >= 0
      ? input.distanceMeters
      : 0;
  const distanceKm = Math.round((safeDistM / 1000) * 100) / 100;

  const rawStaticSec =
    typeof input.staticDurationSeconds === 'number' &&
    Number.isFinite(input.staticDurationSeconds) &&
    input.staticDurationSeconds > 0
      ? input.staticDurationSeconds
      : input.durationSeconds;
  const safeDurSec =
    Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
      ? input.durationSeconds
      : Math.max(120, Math.round(distanceKm * 180));
  const safeStaticSec =
    Number.isFinite(rawStaticSec) && rawStaticSec > 0 ? rawStaticSec : safeDurSec;

  const speedSegments: SpeedSegmentSummary = {
    normalCount: 0,
    slowCount: 0,
    jamCount: 0,
  };
  for (const rawSpeed of input.speedLevels || []) {
    const level = String(rawSpeed || '').toUpperCase();
    if (level === 'TRAFFIC_JAM') speedSegments.jamCount += 1;
    else if (level === 'SLOW') speedSegments.slowCount += 1;
    else if (level === 'NORMAL') speedSegments.normalCount += 1;
  }

  let preVehicleDurSec = safeDurSec;
  if (
    input.source !== 'google_routes' &&
    Math.abs(safeDurSec - safeStaticSec) < 5 &&
    distanceKm > 0.2
  ) {
    const factor =
      typeof input.peakFactorOverride === 'number' && input.peakFactorOverride >= 1
        ? input.peakFactorOverride
        : estimateDhakaPeakTrafficFactor();
    preVehicleDurSec = Math.round(safeStaticSec * factor);
  }

  const adjusted = computeVehicleAdjustedDurations({
    vehicleMode,
    distanceMeters: safeDistM,
    durationSeconds: preVehicleDurSec,
    staticDurationSeconds: safeStaticSec,
    routeMatchesVehicle:
      input.routeMatchesVehicle ??
      (vehicleMode !== 'bicycle' && vehicleMode !== 'walking'),
  });

  const etaMinutes = Math.max(2, Math.round(adjusted.effectiveSec / 60));
  const staticMinutes = Math.max(2, Math.round(adjusted.staticSec / 60));
  const delayMinutes = Math.max(0, etaMinutes - staticMinutes);
  const ratio = adjusted.staticSec > 0 ? adjusted.effectiveSec / adjusted.staticSec : 1;

  let trafficSeverity: TrafficSeverity = 'clear';
  if (speedSegments.jamCount > 0 || delayMinutes >= 6 || ratio >= 1.35) {
    trafficSeverity = 'heavy';
  } else if (speedSegments.slowCount > 0 || delayMinutes >= 2 || ratio >= 1.15) {
    trafficSeverity = 'moderate';
  }

  const delayFormattedEn = delayMinutes > 0 ? formatDurationEstimate(delayMinutes, 'en', 'compact') : '';
  const delayFormattedBn = delayMinutes > 0 ? formatDurationEstimate(delayMinutes, 'bn', 'compact') : '';
  const delayTagEn = delayMinutes > 0 ? ` (+${delayFormattedEn} delay)` : '';
  const delayTagBn = delayMinutes > 0 ? ` (+${delayFormattedBn} দেরি)` : '';

  const trafficLabelEn =
    trafficSeverity === 'heavy'
      ? `Heavy Jam${delayTagEn}`
      : trafficSeverity === 'moderate'
      ? `Slow Traffic${delayTagEn}`
      : 'Traffic Clear';

  const trafficLabelBn =
    trafficSeverity === 'heavy'
      ? `রাস্তায় ভারী জ্যাম${delayTagBn}`
      : trafficSeverity === 'moderate'
      ? `মাঝারি যানজট${delayTagBn}`
      : 'যানজট নেই (ফাঁকা)';

  const jamAreasTextEn =
    speedSegments.jamCount > 0 || speedSegments.slowCount > 0
      ? `${speedSegments.jamCount} jam segment(s) · ${speedSegments.slowCount} slow zone(s) · ${speedSegments.normalCount} clear`
      : trafficSeverity === 'heavy'
      ? `Congestion detected along main intersections (${delayFormattedEn} slower than normal)`
      : trafficSeverity === 'moderate'
      ? `Moderate urban traffic along route (${delayFormattedEn} slower)`
      : 'Smooth traffic flow along the full delivery route';

  const jamAreasTextBn =
    speedSegments.jamCount > 0 || speedSegments.slowCount > 0
      ? `${speedSegments.jamCount}টি ভারী জ্যাম · ${speedSegments.slowCount}টি ধীরগতি · ${speedSegments.normalCount}টি ফাঁকা অংশ`
      : trafficSeverity === 'heavy'
      ? `মূল মোড়ে যানজট রয়েছে (স্বাভাবিকের চেয়ে ${delayFormattedBn} বেশি)`
      : trafficSeverity === 'moderate'
      ? `রাস্তায় মাঝারি যানজট রয়েছে (+${delayFormattedBn})`
      : 'সম্পূর্ণ রুটে চলাচল স্বাভাবিক ও যানজটমুক্ত';

  return {
    distanceKm,
    etaMinutes,
    staticMinutes,
    delayMinutes,
    vehicleMode,
    trafficSeverity,
    trafficLabelEn,
    trafficLabelBn,
    jamAreasTextEn,
    jamAreasTextBn,
    steps: [...(input.steps || [])].slice(0, 12),
    speedSegments,
    source: input.source || 'estimated',
  };
}

export function buildOsrmDirectionInstruction(input: {
  type?: string;
  modifier?: string;
  roadName?: string;
}): string {
  const type = String(input.type || '').toLowerCase();
  const modifier = String(input.modifier || '').replace(/_/g, ' ').trim();
  const road = String(input.roadName || '').trim();
  const onto = road ? ` onto ${road}` : '';
  const onRoad = road ? ` on ${road}` : '';

  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'depart') return `Head ${modifier || 'straight'}${onRoad}`;
  if (type === 'roundabout' || type === 'rotary') {
    return `Enter roundabout and continue${onto}`;
  }
  if (type === 'merge') return `Merge ${modifier || ''}${onto}`.replace(/\s+/g, ' ').trim();
  if (type === 'fork') return `Keep ${modifier || 'straight'} at fork${onto}`;
  if (type === 'end of road') return `At end of road, turn ${modifier || 'ahead'}${onto}`;
  if (type === 'turn' || type === 'new name' || type === 'continue') {
    if (modifier === 'straight' || modifier === '') {
      return road ? `Continue onto ${road}` : 'Continue straight';
    }
    return `Turn ${modifier}${onto}`;
  }
  return road ? `Follow ${road}` : 'Continue along route';
}

export interface DhakaZonePresetMeta {
  code: string;
  name: string;
  nameBn: string;
  label: string;
  defaultDeliveryFee: number;
  keywords: string[];
}

export const DHAKA_ZONE_PRESETS: ReadonlyArray<DhakaZonePresetMeta> = [
  {
    code: 'ZONE 01',
    name: 'GULSHAN',
    nameBn: 'গুলশান',
    label: 'ZONE 01 — GULSHAN',
    defaultDeliveryFee: 60,
    keywords: ['gulshan', 'niketan', 'shahjadpur', 'গুলশান', 'নিকেতন', 'শাহজাদপুর', 'zone 01'],
  },
  {
    code: 'ZONE 02',
    name: 'BANANI',
    nameBn: 'বনানী',
    label: 'ZONE 02 — BANANI',
    defaultDeliveryFee: 60,
    keywords: ['banani', 'kakoli', 'chairman bari', 'বনানী', 'কাকলী', 'zone 02'],
  },
  {
    code: 'ZONE 03',
    name: 'DHANMONDI',
    nameBn: 'ধানমন্ডি',
    label: 'ZONE 03 — DHANMONDI',
    defaultDeliveryFee: 60,
    keywords: ['dhanmondi', 'satmasjid', 'jigatola', 'kalabagan', 'ধানমন্ডি', 'জিগাতলা', 'কলাবাগান', 'zone 03'],
  },
  {
    code: 'ZONE 04',
    name: 'MIRPUR',
    nameBn: 'মিরপুর',
    label: 'ZONE 04 — MIRPUR',
    defaultDeliveryFee: 60,
    keywords: ['mirpur', 'pallabi', 'kazipara', 'shewrapara', 'মিরপুর', 'পল্লবী', 'কাজীপাড়া', 'zone 04'],
  },
  {
    code: 'ZONE 05',
    name: 'UTTARA',
    nameBn: 'উত্তরা',
    label: 'ZONE 05 — UTTARA',
    defaultDeliveryFee: 65,
    keywords: ['uttara', 'rajlaxmi', 'jashimuddin', 'abdullahpur', 'উত্তরা', 'রাজলক্ষ্মী', 'zone 05'],
  },
  {
    code: 'ZONE 06',
    name: 'MOHAMMADPUR',
    nameBn: 'মোহাম্মদপুর',
    label: 'ZONE 06 — MOHAMMADPUR',
    defaultDeliveryFee: 60,
    keywords: ['mohammadpur', 'town hall', 'bosila', 'adabor', 'shyamoli', 'মোহাম্মদপুর', 'আদাবর', 'শ্যামলী', 'zone 06'],
  },
  {
    code: 'ZONE 07',
    name: 'BASHUNDHARA',
    nameBn: 'বসুন্ধরা',
    label: 'ZONE 07 — BASHUNDHARA',
    defaultDeliveryFee: 65,
    keywords: ['bashundhara', 'jamuna future', 'kuril', 'vatara', 'বসুন্ধরা', 'কুড়িল', 'ভাটারা', 'zone 07'],
  },
  {
    code: 'ZONE 08',
    name: 'BADDA',
    nameBn: 'বাড্ডা',
    label: 'ZONE 08 — BADDA',
    defaultDeliveryFee: 60,
    keywords: ['badda', 'merul', 'rampura', 'aftabnagar', 'বাড্ডা', 'রামপুরা', 'আফতাবনগর', 'zone 08'],
  },
  {
    code: 'ZONE 09',
    name: 'MOTIJHEEL',
    nameBn: 'মতিঝিল',
    label: 'ZONE 09 — MOTIJHEEL',
    defaultDeliveryFee: 60,
    keywords: ['motijheel', 'paltan', 'fakirapool', 'arambagh', 'kamalapur', 'মতিঝিল', 'পল্টন', 'কমলাপুর', 'zone 09'],
  },
  {
    code: 'ZONE 10',
    name: 'OLD DHAKA',
    nameBn: 'পুরান ঢাকা',
    label: 'ZONE 10 — OLD DHAKA',
    defaultDeliveryFee: 60,
    keywords: ['old dhaka', 'chawkbazar', 'bangshal', 'lalbagh', 'wari', 'sutrapur', 'পুরান ঢাকা', 'চকবাজার', 'লালবাগ', 'ওয়ারী', 'zone 10'],
  },
  {
    code: 'ZONE 11',
    name: 'TEJGAON / FARMGATE',
    nameBn: 'তেজগাঁও / ফার্মগেট',
    label: 'ZONE 11 — TEJGAON / FARMGATE',
    defaultDeliveryFee: 55,
    keywords: ['tejgaon', 'farmgate', 'karwan', 'kawran', 'তেজগাঁও', 'ফার্মগেট', 'কারওয়ান', 'zone 11'],
  },
  {
    code: 'ZONE 12',
    name: 'KHILGAON',
    nameBn: 'খিলগাঁও',
    label: 'ZONE 12 — KHILGAON',
    defaultDeliveryFee: 60,
    keywords: ['khilgaon', 'taltola', 'malibagh', 'goran', 'খিলগাঁও', 'মালিবাগ', 'গোরান', 'zone 12'],
  },
];

export interface DeliveryFinancialConfig {
  paymentModel: 'online_food_cash_delivery';
  zoneFees: Record<string, number>;
  distancePricing: {
    enabled: boolean;
    baseDistanceKm: number;
    baseFee: number;
    perKmFee: number;
    minFee: number;
    maxFee: number;
  };
  riderEarningRule: {
    mode: 'percentage' | 'fixed';
    value: number; // percentage 0..100 of delivery charge OR fixed BDT per delivery
  };
  settlementRules: {
    maxOutstandingLimit: number;
    autoBlockDispatchAboveLimit: boolean;
    requireCashConfirmation: boolean;
    settlementCycleLabel: string;
    settlementInstructions: string;
  };
}

export const DEFAULT_DELIVERY_FINANCIAL_CONFIG: DeliveryFinancialConfig = {
  paymentModel: 'online_food_cash_delivery',
  zoneFees: Object.fromEntries(DHAKA_ZONE_PRESETS.map((z) => [z.code, z.defaultDeliveryFee])),
  distancePricing: {
    enabled: true,
    baseDistanceKm: 3,
    baseFee: 60,
    perKmFee: 10,
    minFee: 40,
    maxFee: 180,
  },
  riderEarningRule: {
    mode: 'percentage',
    value: 75, // ৳45 on ৳60 delivery charge; ৳15 Foodora platform commission
  },
  settlementRules: {
    maxOutstandingLimit: 500,
    autoBlockDispatchAboveLimit: true,
    requireCashConfirmation: true,
    settlementCycleLabel: 'Daily / When Outstanding Reaches Cap',
    settlementInstructions:
      'Collect the delivery charge directly in cash from customers on delivery. Settle Foodora commission balance via Cash / bKash / Nagad to Admin when due. No automated payout for rider-collected cash.',
  },
};

export function mergeDeliveryFinancialConfig(
  raw?: Partial<DeliveryFinancialConfig> | Record<string, unknown> | null
): DeliveryFinancialConfig {
  const input = (raw || {}) as Partial<DeliveryFinancialConfig>;
  const rawZoneFees = (input.zoneFees || {}) as Record<string, unknown>;
  const mergedZoneFees: Record<string, number> = { ...DEFAULT_DELIVERY_FINANCIAL_CONFIG.zoneFees };
  for (const preset of DHAKA_ZONE_PRESETS) {
    const val = Number(rawZoneFees[preset.code]);
    if (Number.isFinite(val) && val >= 0 && val <= 1000) {
      mergedZoneFees[preset.code] = Math.round(val);
    }
  }
  const dp = (input.distancePricing || {}) as Partial<DeliveryFinancialConfig['distancePricing']>;
  const re = (input.riderEarningRule || {}) as Partial<DeliveryFinancialConfig['riderEarningRule']>;
  const sr = (input.settlementRules || {}) as Partial<DeliveryFinancialConfig['settlementRules']>;

  const mode = re.mode === 'fixed' ? 'fixed' : 'percentage';
  const rawVal = Number(re.value);
  const clampedValue = Number.isFinite(rawVal)
    ? mode === 'percentage'
      ? Math.max(0, Math.min(100, Math.round(rawVal)))
      : Math.max(0, Math.round(rawVal))
    : DEFAULT_DELIVERY_FINANCIAL_CONFIG.riderEarningRule.value;

  return {
    paymentModel: 'online_food_cash_delivery',
    zoneFees: mergedZoneFees,
    distancePricing: {
      enabled: typeof dp.enabled === 'boolean' ? dp.enabled : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.enabled,
      baseDistanceKm:
        typeof dp.baseDistanceKm === 'number' && Number.isFinite(dp.baseDistanceKm) && dp.baseDistanceKm >= 0
          ? Math.min(30, dp.baseDistanceKm)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.baseDistanceKm,
      baseFee:
        typeof dp.baseFee === 'number' && Number.isFinite(dp.baseFee) && dp.baseFee >= 0
          ? Math.round(dp.baseFee)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.baseFee,
      perKmFee:
        typeof dp.perKmFee === 'number' && Number.isFinite(dp.perKmFee) && dp.perKmFee >= 0
          ? Math.round(dp.perKmFee)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.perKmFee,
      minFee:
        typeof dp.minFee === 'number' && Number.isFinite(dp.minFee) && dp.minFee >= 0
          ? Math.round(dp.minFee)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.minFee,
      maxFee:
        typeof dp.maxFee === 'number' && Number.isFinite(dp.maxFee) && dp.maxFee >= 10
          ? Math.round(dp.maxFee)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.maxFee,
    },
    riderEarningRule: {
      mode,
      value: clampedValue,
    },
    settlementRules: {
      maxOutstandingLimit:
        typeof sr.maxOutstandingLimit === 'number' && Number.isFinite(sr.maxOutstandingLimit) && sr.maxOutstandingLimit >= 50
          ? Math.round(sr.maxOutstandingLimit)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.maxOutstandingLimit,
      autoBlockDispatchAboveLimit:
        typeof sr.autoBlockDispatchAboveLimit === 'boolean'
          ? sr.autoBlockDispatchAboveLimit
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.autoBlockDispatchAboveLimit,
      requireCashConfirmation:
        typeof sr.requireCashConfirmation === 'boolean'
          ? sr.requireCashConfirmation
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.requireCashConfirmation,
      settlementCycleLabel:
        typeof sr.settlementCycleLabel === 'string' && sr.settlementCycleLabel.trim()
          ? sr.settlementCycleLabel.trim().slice(0, 120)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.settlementCycleLabel,
      settlementInstructions:
        typeof sr.settlementInstructions === 'string' && sr.settlementInstructions.trim()
          ? sr.settlementInstructions.trim().slice(0, 500)
          : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.settlementInstructions,
    },
  };
}

export function matchDhakaDeliveryZone(areaOrZoneText?: string | null): DhakaZonePresetMeta | null {
  const clean = String(areaOrZoneText || '').trim().toLowerCase();
  if (!clean) return null;
  for (const preset of DHAKA_ZONE_PRESETS) {
    if (
      clean === preset.code.toLowerCase() ||
      clean === preset.name.toLowerCase() ||
      clean === preset.label.toLowerCase() ||
      preset.keywords.some((kw) => clean.includes(kw))
    ) {
      return preset;
    }
  }
  return null;
}

export function calculateZoneDistanceDeliveryFee(input: {
  area?: string | null;
  distanceKm?: number | null;
  fallbackFee?: number | null;
  config?: DeliveryFinancialConfig | null;
}): {
  deliveryFee: number;
  zoneCode: string | null;
  zoneName: string | null;
  pricingSource: 'zone_plus_distance' | 'distance_rule' | 'zone_base' | 'fallback';
} {
  const cfg = mergeDeliveryFinancialConfig(input.config);
  const matchedZone = matchDhakaDeliveryZone(input.area);
  const zoneBaseFee = matchedZone
    ? cfg.zoneFees[matchedZone.code] ?? matchedZone.defaultDeliveryFee
    : undefined;
  const distKm =
    typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm) && input.distanceKm >= 0
      ? input.distanceKm
      : null;

  const base = zoneBaseFee ?? cfg.distancePricing.baseFee ?? Math.max(0, Math.round(input.fallbackFee ?? 60));

  if (cfg.distancePricing.enabled && distKm !== null) {
    const extraKm = Math.max(0, distKm - cfg.distancePricing.baseDistanceKm);
    const rawFee = Math.round(base + extraKm * cfg.distancePricing.perKmFee);
    const clamped = Math.max(cfg.distancePricing.minFee, Math.min(cfg.distancePricing.maxFee, rawFee));
    return {
      deliveryFee: clamped,
      zoneCode: matchedZone?.code || null,
      zoneName: matchedZone?.name || null,
      pricingSource: matchedZone ? 'zone_plus_distance' : 'distance_rule',
    };
  }

  if (zoneBaseFee !== undefined) {
    return {
      deliveryFee: Math.max(0, Math.round(zoneBaseFee)),
      zoneCode: matchedZone?.code || null,
      zoneName: matchedZone?.name || null,
      pricingSource: 'zone_base',
    };
  }

  const fb =
    typeof input.fallbackFee === 'number' && Number.isFinite(input.fallbackFee)
      ? Math.max(0, Math.round(input.fallbackFee))
      : cfg.distancePricing.baseFee;
  return {
    deliveryFee: fb,
    zoneCode: null,
    zoneName: null,
    pricingSource: 'fallback',
  };
}

export interface SplitOrderFinancialBreakdown extends OrderFinancialBreakdown {
  paymentSplitMode: 'online_food_cash_delivery' | 'legacy_cod';
  onlineFoodPayable: number;
  cashDueToRider: number;
  customerTotalCost: number;
  riderEarningAmount: number;
  foodoraDeliveryCommission: number;
}

export function calculateSplitOrderFinancials(
  params: OrderFinancialParams & {
    paymentMethod?: string | null;
    riderEarningRule?: DeliveryFinancialConfig['riderEarningRule'] | null;
  }
): SplitOrderFinancialBreakdown {
  const base = calculateOrderFinancials(params);
  const method = String(params.paymentMethod || 'bkash').trim().toLowerCase();
  const isLegacyCod = method === 'cod';
  const rule = params.riderEarningRule || DEFAULT_DELIVERY_FINANCIAL_CONFIG.riderEarningRule;

  let riderEarningAmount = 0;
  let foodoraDeliveryCommission = 0;

  if (base.deliveryFee > 0) {
    if (rule.mode === 'fixed') {
      riderEarningAmount = Math.min(base.deliveryFee, Math.max(0, Math.round(rule.value)));
    } else {
      const pct = Math.max(0, Math.min(100, Number(rule.value) || 0));
      riderEarningAmount = Math.min(base.deliveryFee, Math.round((base.deliveryFee * pct) / 100));
    }
    foodoraDeliveryCommission = Math.max(0, base.deliveryFee - riderEarningAmount);
  }

  if (isLegacyCod) {
    return {
      ...base,
      paymentSplitMode: 'legacy_cod',
      onlineFoodPayable: 0,
      cashDueToRider: base.totalPayable,
      customerTotalCost: base.totalPayable,
      riderEarningAmount,
      foodoraDeliveryCommission,
    };
  }

  const onlineFoodPayable = base.netFoodRevenue + base.serviceFee + base.taxAmount;
  const cashDueToRider = base.deliveryFee;
  const customerTotalCost = onlineFoodPayable + cashDueToRider;

  return {
    ...base,
    paymentSplitMode: 'online_food_cash_delivery',
    onlineFoodPayable,
    cashDueToRider,
    customerTotalCost,
    riderEarningAmount,
    foodoraDeliveryCommission,
  };
}

export function canVendorProcessPrepaidOrder(order: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paymentSplitMode?: string | null;
  nextStatus?: string | null;
}): { allowed: boolean; reason?: string } {
  const next = String(order.nextStatus || '').trim().toLowerCase();
  if (next === 'cancelled') {
    return { allowed: true };
  }
  const method = String(order.paymentMethod || '').trim().toLowerCase();
  const pStatus = String(order.paymentStatus || '').trim().toLowerCase();
  if (method !== 'cod' && pStatus !== 'paid') {
    return {
      allowed: false,
      reason:
        'Online food payment must be verified before the restaurant or rider can process this order.',
    };
  }
  return { allowed: true };
}

export interface RiderWalletLedgerSummary {
  totalCashCollected: number;
  totalRiderEarnings: number;
  totalCommissionOwed: number;
  totalCommissionSettled: number;
  outstandingCommission: number;
  deliveredCountFromLedger: number;
}

export function summarizeRiderWalletLedger(
  entries: ReadonlyArray<{
    entryType: string;
    cashCollected?: number | null;
    riderEarningDelta?: number | null;
    commissionOwedDelta?: number | null;
    commissionSettledDelta?: number | null;
  }>
): RiderWalletLedgerSummary {
  let totalCashCollected = 0;
  let totalRiderEarnings = 0;
  let totalCommissionOwed = 0;
  let totalCommissionSettled = 0;
  let deliveredCountFromLedger = 0;

  for (const e of entries) {
    totalCashCollected += Number(e.cashCollected) || 0;
    totalRiderEarnings += Number(e.riderEarningDelta) || 0;
    totalCommissionOwed += Number(e.commissionOwedDelta) || 0;
    totalCommissionSettled += Number(e.commissionSettledDelta) || 0;
    if (e.entryType === 'delivery_earning') {
      deliveredCountFromLedger += 1;
    } else if (e.entryType === 'commission_reversal') {
      deliveredCountFromLedger = Math.max(0, deliveredCountFromLedger - 1);
    }
  }

  return {
    totalCashCollected: Math.max(0, Math.round(totalCashCollected)),
    totalRiderEarnings: Math.max(0, Math.round(totalRiderEarnings)),
    totalCommissionOwed: Math.max(0, Math.round(totalCommissionOwed)),
    totalCommissionSettled: Math.max(0, Math.round(totalCommissionSettled)),
    outstandingCommission: Math.max(0, Math.round(totalCommissionOwed - totalCommissionSettled)),
    deliveredCountFromLedger,
  };
}

export function canRiderAcceptOrders(input: {
  riderStatus?: string | null;
  outstandingCommission?: number;
  settlementRules?: DeliveryFinancialConfig['settlementRules'] | null;
}): { allowed: boolean; reason?: string } {
  const status = String(input.riderStatus || '').trim().toLowerCase();
  if (status !== 'approved') {
    return {
      allowed: false,
      reason:
        status === 'suspended'
          ? 'Your rider account is currently suspended. Contact Foodora Admin.'
          : 'Your rider application is pending Admin approval for your Dhaka zone.',
    };
  }
  const rules = input.settlementRules || DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules;
  const outstanding = Math.max(0, Math.round(input.outstandingCommission || 0));
  if (rules.autoBlockDispatchAboveLimit && outstanding > rules.maxOutstandingLimit) {
    return {
      allowed: false,
      reason: `Outstanding Foodora commission (৳${outstanding}) exceeds limit (৳${rules.maxOutstandingLimit}). Please settle commission with Admin to unlock new deliveries.`,
    };
  }
  return { allowed: true };
}

export interface DhakaZoneRiderCoverageItem {
  zoneCode: string;
  zoneName: string;
  zoneNameBn: string;
  zoneLabel: string;
  approvedCount: number;
  onlineCount: number;
  pendingCount: number;
  suspendedCount: number;
  deliveryFee: number;
  hasActiveCoverage: boolean;
}

export function summarizeDhakaZoneRiderCoverage(
  ridersList: ReadonlyArray<{
    zone?: string | null;
    status?: string | null;
    isAvailable?: boolean | null;
  }>,
  config?: DeliveryFinancialConfig | null
): DhakaZoneRiderCoverageItem[] {
  const merged = mergeDeliveryFinancialConfig(config);
  const buckets = new Map<
    string,
    { approved: number; online: number; pending: number; suspended: number }
  >();

  for (const preset of DHAKA_ZONE_PRESETS) {
    buckets.set(preset.code, { approved: 0, online: 0, pending: 0, suspended: 0 });
  }

  for (const rider of ridersList) {
    const matched = matchDhakaDeliveryZone(rider.zone);
    if (!matched) continue;
    const bucket = buckets.get(matched.code);
    if (!bucket) continue;
    const status = String(rider.status || '').trim().toLowerCase();
    if (status === 'approved') {
      bucket.approved += 1;
      if (rider.isAvailable) bucket.online += 1;
    } else if (status === 'pending') {
      bucket.pending += 1;
    } else if (status === 'suspended') {
      bucket.suspended += 1;
    }
  }

  return DHAKA_ZONE_PRESETS.map((preset) => {
    const bucket = buckets.get(preset.code) || { approved: 0, online: 0, pending: 0, suspended: 0 };
    return {
      zoneCode: preset.code,
      zoneName: preset.name,
      zoneNameBn: preset.nameBn,
      zoneLabel: preset.label,
      approvedCount: bucket.approved,
      onlineCount: bucket.online,
      pendingCount: bucket.pending,
      suspendedCount: bucket.suspended,
      deliveryFee: merged.zoneFees[preset.code] ?? preset.defaultDeliveryFee,
      hasActiveCoverage: bucket.online > 0 || bucket.approved > 0,
    };
  });
}


