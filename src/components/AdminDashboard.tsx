import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bell,
  Bike,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LayoutTemplate,
  LocateFixed,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sliders,
  Store,
  Tag,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/api';
import { BANGLADESH_AREAS, DHAKA_DELIVERY_ZONES, getBangladeshAreaSelectPresets } from '../lib/i18n';
import {
  emitLocalRealtimeSignal,
  playOrderAlertChime,
  useOrderSoundSetting,
  useRealtimeEvents,
} from '../lib/realtime';
import { DhakaMapPicker } from './DhakaMapPicker';
import { SelectWithCustom } from './SelectWithCustom';
import {
  ADMIN_PIN_DEFAULT_EMAIL,
  AI_PROVIDER_PRESETS,
  type AiProviderType,
  calculateSplitOrderFinancials,
  canActorModifyUserAccount,
  CUISINE_PRESET_OPTIONS,
  DEFAULT_DELIVERY_FINANCIAL_CONFIG,
  type DeliveryFinancialConfig,
  detectOrderBatchChanges,
  DHAKA_ZONE_PRESETS,
  FOOD_CATEGORY_PRESET_OPTIONS,
  formatBdt,
  formatResolvedMapAddress,
  getOrderEmailTemplatePreview,
  isOwnerRestaurant,
  isProtectedSuperAdminEmail,
  mergeDeliveryFinancialConfig,
  ORDER_EMAIL_TEMPLATE_PRESETS,
  OrderStatus,
  PRIMARY_SUPER_ADMIN_EMAIL,
  VEHICLE_TYPE_PRESET_OPTIONS,
} from '../lib/marketplace-logic';
import { DEFAULT_STOREFRONT_CONFIG, mergeStorefrontConfig } from '../lib/storefront-config';
import type {
  AdminAiProvider,
  AdminEmailSettingsView,
  AdminPaymentGateway,
  AppUser,
  AuditLogItem,
  BackendStatusSummary,
  Coupon,
  DhakaZoneCoverageItem,
  FoodItem,
  Lang,
  LedgerEntry,
  OrderEmailLog,
  OrderRecord,
  PaymentTransactionRecord,
  PayoutRecord,
  PlatformSettings,
  Restaurant,
  RiderRecord,
  RiderWalletLedgerEntry,
  StorefrontConfig,
  VendorAdminMessage,
} from '../types/marketplace';

interface AdminUserRow {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
}

interface AdminDashboardProps {
  lang: Lang;
  mapsApiKey?: string;
  currentUser: AppUser;
  onRestaurantsMutated: () => Promise<void>;
  onOpenVendorStore?: (restaurantId: number) => void;
  onTrackOrder?: (orderId: number) => void;
  onBack: () => void;
}

interface ProductFormState {
  id?: number;
  restaurantId: number;
  category: string;
  name: string;
  nameBn: string;
  description: string;
  imageUrl: string;
  price: string;
  discountPrice: string;
  inStock: boolean;
  isAvailable: boolean;
  isVisibleOnStorefront: boolean;
  isPopular: boolean;
}

interface RestaurantFormState {
  id?: number;
  name: string;
  nameBn: string;
  cuisine: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  logoUrl: string;
  coverUrl: string;
  deliveryFee: string;
  minOrder: string;
  discountPct: string;
  openingHours: string;
  deliveryMode: 'platform' | 'restaurant' | 'third_party';
  commissionRate: string;
  subscriptionPlan: 'free' | 'basic' | 'premium' | 'enterprise';
  isOpen: boolean;
  isSponsored: boolean;
}

interface GatewayFormState {
  isNew: boolean;
  code: string;
  name: string;
  nameBn: string;
  providerType: 'mfs' | 'card' | 'wallet' | 'cod' | 'custom';
  mode: 'sandbox' | 'live';
  isActive: boolean;
  apiBaseUrl: string;
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  instructions: string;
  sortOrder: string;
}

interface AiProviderFormState {
  isNew: boolean;
  code: string;
  name: string;
  providerType: AiProviderType;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: string;
}

interface MessageThreadSummary {
  restaurantId: number;
  restaurantName: string;
  ownerUid: string;
  lastMessage: string;
  lastSenderRole: string;
  lastAt: string;
  unreadForAdmin: number;
  unreadForVendor: number;
}

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
];

export function AdminDashboard({
  lang,
  mapsApiKey = '',
  currentUser,
  onRestaurantsMutated,
  onOpenVendorStore,
  onTrackOrder,
  onBack,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<
    | 'overview'
    | 'frontend'
    | 'backend'
    | 'products'
    | 'restaurants'
    | 'orders'
    | 'messages'
    | 'finance'
    | 'coupons'
    | 'users'
  >('overview');
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [products, setProducts] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [dhakaZoneCoverage, setDhakaZoneCoverage] = useState<DhakaZoneCoverageItem[]>([]);
  const [deliveryFinancialConfig, setDeliveryFinancialConfig] =
    useState<DeliveryFinancialConfig>(DEFAULT_DELIVERY_FINANCIAL_CONFIG);
  const [savingFinancialConfig, setSavingFinancialConfig] = useState(false);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [riderWalletLedger, setRiderWalletLedger] = useState<RiderWalletLedgerEntry[]>([]);
  const [txFilter, setTxFilter] = useState<
    'all' | 'food_payment' | 'delivery_cash' | 'reversals' | 'settlements'
  >('all');
  const [pendingZoneDrafts, setPendingZoneDrafts] = useState<Record<number, string>>({});
  const [settleModalRider, setSettleModalRider] = useState<RiderRecord | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleRef, setSettleRef] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settlingCommission, setSettlingCommission] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Global Platform Settings Form
  const [platformName, setPlatformName] = useState('Foodora BD');
  const [defaultCommissionPct, setDefaultCommissionPct] = useState('15.00');
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState('49');
  const [serviceFee, setServiceFee] = useState('10');
  const [minOrderDefault, setMinOrderDefault] = useState('150');
  const [savingSettings, setSavingSettings] = useState(false);

  // Admin Panel Security PIN Change Form
  const [pinAdminEmail, setPinAdminEmail] = useState(ADMIN_PIN_DEFAULT_EMAIL);
  const [adminPinEmails, setAdminPinEmails] = useState<string[]>([
    PRIMARY_SUPER_ADMIN_EMAIL,
    ADMIN_PIN_DEFAULT_EMAIL,
  ]);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  // Backend Control State
  const [backendStatus, setBackendStatus] = useState<BackendStatusSummary | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<
    'all' | 'customer' | 'restaurant_owner' | 'rider' | 'admin'
  >('all');
  const [broadcastType, setBroadcastType] = useState<'system' | 'promo' | 'order'>('system');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [runningReseed, setRunningReseed] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Order Invoice Email (Gmail SMTP / Custom SMTP / Resend) State
  const [emailSettings, setEmailSettings] = useState<AdminEmailSettingsView | null>(null);
  const [emailProviderMode, setEmailProviderMode] = useState<'gmail' | 'smtp' | 'resend'>('gmail');
  const [emailSmtpHost, setEmailSmtpHost] = useState('smtp.gmail.com');
  const [emailSmtpPort, setEmailSmtpPort] = useState('465');
  const [emailSmtpSecure, setEmailSmtpSecure] = useState(true);
  const [emailSmtpUser, setEmailSmtpUser] = useState('');
  const [emailSmtpPass, setEmailSmtpPass] = useState('');
  const [emailFromAddress, setEmailFromAddress] = useState('');
  const [emailNotifyEmail, setEmailNotifyEmail] = useState(PRIMARY_SUPER_ADMIN_EMAIL);
  const [emailResendKey, setEmailResendKey] = useState('');
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerifyStatus, setEmailVerifyStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState(PRIMARY_SUPER_ADMIN_EMAIL);
  const [previewTemplateStatus, setPreviewTemplateStatus] = useState<
    'confirmed' | 'preparing' | 'rider_assigned' | 'on_the_way' | 'delivered' | 'cancelled'
  >('confirmed');
  const [emailLogs, setEmailLogs] = useState<OrderEmailLog[]>([]);
  const [resendingLogId, setResendingLogId] = useState<number | null>(null);
  const [orderSoundEnabled, setOrderSoundEnabled] = useOrderSoundSetting();
  const orderSnapshotMapRef = useRef<Map<number, { status: string; paymentStatus?: string }> | null>(
    null
  );

  // Frontend / Storefront Customization Form
  const [storefrontForm, setStorefrontForm] = useState<StorefrontConfig>(DEFAULT_STOREFRONT_CONFIG);
  const [savingFrontend, setSavingFrontend] = useState(false);
  const [savingActiveBarToggle, setSavingActiveBarToggle] = useState(false);
  const [checkingSeo, setCheckingSeo] = useState(false);
  const [seoCheckResult, setSeoCheckResult] = useState<{
    ok: boolean;
    sitemapUrl: string;
    robotsUrl: string;
    indexedUrls: number;
    googleVerificationConfigured: boolean;
    robotsOk: boolean;
  } | null>(null);
  const [copiedSitemap, setCopiedSitemap] = useState(false);

  // Order & Dispatch Filter
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'closed'>('all');

  // Product Catalog Filter & Modal
  const [productSearch, setProductSearch] = useState('');
  const [productRestFilter, setProductRestFilter] = useState<string>('all');
  const [productVisibilityFilter, setProductVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [productOwnershipFilter, setProductOwnershipFilter] = useState<'all' | 'own' | 'partner'>('all');
  const [restaurantOwnershipFilter, setRestaurantOwnershipFilter] = useState<'all' | 'own' | 'partner'>('all');
  const [restaurantZoneFilter, setRestaurantZoneFilter] = useState<string>('all');
  const [productModal, setProductModal] = useState<ProductFormState | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Payment Gateway API Integrations state
  const [paymentGateways, setPaymentGateways] = useState<AdminPaymentGateway[]>([]);
  const [gatewayModal, setGatewayModal] = useState<GatewayFormState | null>(null);
  const [savingGateway, setSavingGateway] = useState(false);
  const [testingGatewayCode, setTestingGatewayCode] = useState<string | null>(null);
  const [gatewayTestResults, setGatewayTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [copiedWebhookCode, setCopiedWebhookCode] = useState<string | null>(null);

  // Multi-AI Provider Integrations (Gemini, ChatGPT/OpenAI, Groq, DeepSeek, Claude, Custom)
  const [aiProviders, setAiProviders] = useState<AdminAiProvider[]>([]);
  const [aiProviderModal, setAiProviderModal] = useState<AiProviderFormState | null>(null);
  const [savingAiProvider, setSavingAiProvider] = useState(false);
  const [testingAiCode, setTestingAiCode] = useState<string | null>(null);
  const [aiTestResults, setAiTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  // Vendor <-> Admin Messaging Inbox State
  const [vendorMessages, setVendorMessages] = useState<VendorAdminMessage[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThreadSummary[]>([]);
  const [selectedMessageRestId, setSelectedMessageRestId] = useState<number | null>(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [sendingAdminReply, setSendingAdminReply] = useState(false);

  // Restaurant Create / Edit Modal
  const [restaurantModal, setRestaurantModal] = useState<RestaurantFormState | null>(null);
  const [savingRestaurant, setSavingRestaurant] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // New coupon form
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [couponType, setCouponType] = useState<'percentage' | 'fixed' | 'free_delivery'>('fixed');
  const [value, setValue] = useState('100');
  const [minOrder, setMinOrder] = useState('350');

  // Admin Live Rider Fleet Control state
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [riderEditZones, setRiderEditZones] = useState<Record<number, string>>({});
  const [riderEditVehicles, setRiderEditVehicles] = useState<Record<number, string>>({});
  const [customRiderMoveArea, setCustomRiderMoveArea] = useState('');
  const [showCustomRiderMove, setShowCustomRiderMove] = useState(false);
  const [dispatchOrderByRider, setDispatchOrderByRider] = useState<Record<number, string>>({});

  const loadBackendStatus = useCallback(async () => {
    setLoadingBackend(true);
    try {
      const [statusRes, emailRes, logsRes] = await Promise.all([
        apiFetch<BackendStatusSummary>('/api/admin/backend/status'),
        apiFetch<{ settings: AdminEmailSettingsView }>('/api/admin/email-settings').catch(() => null),
        apiFetch<{ logs: OrderEmailLog[] }>('/api/admin/email-logs?limit=20').catch(() => null),
      ]);
      setBackendStatus(statusRes);
      if (emailRes?.settings) {
        const s = emailRes.settings;
        setEmailSettings(s);
        setEmailProviderMode(s.provider);
        setEmailSmtpHost(s.smtpHost || 'smtp.gmail.com');
        setEmailSmtpPort(String(s.smtpPort || 465));
        setEmailSmtpSecure(Boolean(s.smtpSecure));
        setEmailSmtpUser(s.smtpUser || '');
        setEmailFromAddress(s.fromAddress || '');
        setEmailNotifyEmail(s.notifyEmail || PRIMARY_SUPER_ADMIN_EMAIL);
      }
      if (logsRes?.logs) {
        setEmailLogs(logsRes.logs);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load backend status');
    } finally {
      setLoadingBackend(false);
    }
  }, []);

  const loadAdmin = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch<{
        restaurants: Restaurant[];
        products: FoodItem[];
        orders: OrderRecord[];
        users: AdminUserRow[];
        ledger: LedgerEntry[];
        payouts: PayoutRecord[];
        coupons: Coupon[];
        riders: RiderRecord[];
        dhakaZoneCoverage?: DhakaZoneCoverageItem[];
        deliveryFinancialConfig?: DeliveryFinancialConfig | null;
        paymentTransactions?: PaymentTransactionRecord[];
        riderWalletLedger?: RiderWalletLedgerEntry[];
        auditLogs: AuditLogItem[];
        settings: PlatformSettings | null;
        adminPinEmails?: string[];
      }>('/api/admin/workspace');
      setRestaurants(res.restaurants);
      setProducts(res.products || []);

      const changes = detectOrderBatchChanges(orderSnapshotMapRef.current, res.orders);
      orderSnapshotMapRef.current = changes.nextMap;
      if (silent && changes.newOrders.length > 0) {
        const newest = changes.newOrders[0];
        void playOrderAlertChime('new_order', {
          dedupKey: `order_created_${String(newest.id)}`,
        });
        setFeedback(
          lang === 'bn'
            ? `নতুন অর্ডার এসেছে: ${newest.orderNumber} (${newest.restaurantName})`
            : `New order received: ${newest.orderNumber} (${newest.restaurantName})`
        );
      } else if (silent && changes.updatedOrders.length > 0) {
        const changed = changes.updatedOrders[0];
        void playOrderAlertChime('status_update', {
          dedupKey: `order_status_${String(changed.id)}_${changed.status}`,
        });
        setFeedback(
          lang === 'bn'
            ? `অর্ডার আপডেট হয়েছে: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
            : `Order updated: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
        );
      }

      setOrders(res.orders);
      setUsers(res.users);
      setLedger(res.ledger);
      setPayouts(res.payouts);
      setCoupons(res.coupons);
      setRiders(res.riders);
      setDhakaZoneCoverage(res.dhakaZoneCoverage || []);
      setPaymentTransactions(res.paymentTransactions || []);
      setRiderWalletLedger(res.riderWalletLedger || []);
      setAuditLogs(res.auditLogs || []);
      setSettings(res.settings);
      if (Array.isArray(res.adminPinEmails) && res.adminPinEmails.length > 0) {
        setAdminPinEmails(res.adminPinEmails);
      }
      if (res.settings && !silent) {
        setPlatformName(res.settings.platformName);
        setDefaultCommissionPct(String(res.settings.defaultCommissionPct));
        setDefaultDeliveryFee(String(res.settings.defaultDeliveryFee));
        setServiceFee(String(res.settings.serviceFee));
        setMinOrderDefault(String(res.settings.minOrderDefault));
        setStorefrontForm(mergeStorefrontConfig(res.settings.storefrontConfig));
        setDeliveryFinancialConfig(
          mergeDeliveryFinancialConfig(
            res.deliveryFinancialConfig || res.settings.deliveryFinancialConfig
          )
        );
      } else if (res.deliveryFinancialConfig && !silent) {
        setDeliveryFinancialConfig(mergeDeliveryFinancialConfig(res.deliveryFinancialConfig));
      }
      if (!silent) {
        try {
          const [gwRes, aiRes] = await Promise.all([
            apiFetch<{ paymentGateways: AdminPaymentGateway[] }>('/api/admin/payment-gateways'),
            apiFetch<{ aiProviders: AdminAiProvider[] }>('/api/admin/ai-providers').catch(() => ({
              aiProviders: [],
            })),
          ]);
          setPaymentGateways(gwRes.paymentGateways || []);
          setAiProviders(aiRes.aiProviders || []);
        } catch {
          // non-blocking
        }
      }
      try {
        const msgRes = await apiFetch<{
          messages: VendorAdminMessage[];
          threads: MessageThreadSummary[];
        }>('/api/messages/vendor-admin');
        setVendorMessages(msgRes.messages || []);
        setMessageThreads(msgRes.threads || []);
        setSelectedMessageRestId((prev) =>
          prev && (msgRes.threads || []).some((t) => t.restaurantId === prev)
            ? prev
            : msgRes.threads?.[0]?.restaurantId ?? null
        );
      } catch {
        // non-blocking
      }
    } catch (err) {
      console.error('Failed to load admin workspace:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadAdmin(false);
  }, [loadAdmin]);

  useRealtimeEvents({
    enabled: Boolean(currentUser?.uid),
    token: getAuthToken(),
    pollFallbackMs: 4000,
    onSync: () => loadAdmin(true),
    onEvent: (ev) => {
      if (
        ev.type === 'order:created' ||
        ev.type === 'order:updated' ||
        ev.type === 'notification:created' ||
        ev.type === 'message:created'
      ) {
        if (ev.type === 'order:created') {
          void playOrderAlertChime('new_order', {
            dedupKey: `order_created_${String(ev.payload.orderId || ev.payload.orderNumber || '')}`,
          });
          setFeedback(
            lang === 'bn'
              ? `নতুন অর্ডার এসেছে: ${String(ev.payload.orderNumber || '')}`
              : `New order received: ${String(ev.payload.orderNumber || '')}`
          );
        } else if (ev.type === 'order:updated') {
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${String(ev.payload.orderId || '')}_${String(ev.payload.status || '')}`,
          });
        } else if (ev.type === 'message:created' && ev.payload.senderUid !== currentUser.uid) {
          setFeedback(
            lang === 'bn'
              ? `${String(ev.payload.restaurantName || 'রেস্টুরেন্ট')} থেকে নতুন মেসেজ এসেছে`
              : `New message from ${String(ev.payload.restaurantName || 'Restaurant')}`
          );
        }
        loadAdmin(true);
      }
    },
  });

  useEffect(() => {
    if (tab === 'backend') {
      loadBackendStatus();
    }
  }, [tab, loadBackendStatus]);

  const myRestaurants = useMemo(
    () => (restaurants || []).filter((r) => isOwnerRestaurant(r.ownerUid, currentUser.uid)),
    [restaurants, currentUser.uid]
  );

  const myRestaurantIds = useMemo(
    () => new Set(myRestaurants.map((r) => r.id)),
    [myRestaurants]
  );

  const filteredRestaurants = useMemo(() => {
    return (restaurants || []).filter((r) => {
      if (restaurantOwnershipFilter === 'own' && !myRestaurantIds.has(r.id)) return false;
      if (restaurantOwnershipFilter === 'partner' && myRestaurantIds.has(r.id)) return false;
      if (restaurantZoneFilter !== 'all') {
        const restAreaLower = String(r.area || '').trim().toLowerCase();
        const zoneObj = DHAKA_DELIVERY_ZONES.find((z) => z.code === restaurantZoneFilter);
        if (zoneObj) {
          const matchesZone =
            restAreaLower.includes(zoneObj.name.toLowerCase()) ||
            zoneObj.areas.some(
              (a) =>
                restAreaLower === a.name.toLowerCase() ||
                restAreaLower.includes(a.name.toLowerCase()) ||
                a.name.toLowerCase().includes(restAreaLower)
            );
          if (!matchesZone) return false;
        } else if (restaurantZoneFilter === 'NATIONWIDE') {
          const inAnyDhakaZone = DHAKA_DELIVERY_ZONES.some((z) =>
            z.areas.some(
              (a) =>
                restAreaLower === a.name.toLowerCase() ||
                restAreaLower.includes(a.name.toLowerCase())
            )
          );
          if (inAnyDhakaZone) return false;
        }
      }
      return true;
    });
  }, [restaurants, restaurantOwnershipFilter, restaurantZoneFilter, myRestaurantIds]);

  const restaurantNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of (restaurants || [])) {
      map.set(r.id, lang === 'bn' ? r.nameBn : r.name);
    }
    return map;
  }, [restaurants, lang]);

  const filteredProducts = useMemo(() => {
    return (products || []).filter((item) => {
      if (productOwnershipFilter === 'own' && !myRestaurantIds.has(item.restaurantId)) {
        return false;
      }
      if (productOwnershipFilter === 'partner' && myRestaurantIds.has(item.restaurantId)) {
        return false;
      }
      if (productRestFilter !== 'all' && item.restaurantId !== Number(productRestFilter)) {
        return false;
      }
      const isShown = item.isVisibleOnStorefront !== false && item.isAvailable !== false;
      if (productVisibilityFilter === 'visible' && !isShown) return false;
      if (productVisibilityFilter === 'hidden' && isShown) return false;
      if (productSearch.trim()) {
        const q = productSearch.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.nameBn.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    products,
    productRestFilter,
    productVisibilityFilter,
    productOwnershipFilter,
    myRestaurantIds,
    productSearch,
  ]);

  const handleUploadImage = async (file: File, onUploaded: (url: string) => void) => {
    if (file.size > 4.5 * 1024 * 1024) {
      const msg =
        lang === 'bn'
          ? 'ছবির সাইজ ৪.৫ এমবি-র কম হতে হবে।'
          : 'Image must be smaller than 4.5 MB.';
      setModalError(msg);
      setFeedback(msg);
      return;
    }
    setUploadingPhoto(true);
    setModalError(null);
    setFeedback(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ imageUrl: string }>('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      onUploaded(res.imageUrl);
      setFeedback(lang === 'bn' ? 'ছবি সফলভাবে আপলোড হয়েছে।' : 'Image uploaded successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Image upload failed';
      setModalError(msg);
      setFeedback(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          platformName: platformName.trim(),
          defaultCommissionPct: defaultCommissionPct.trim(),
          defaultDeliveryFee: Number(defaultDeliveryFee) || 0,
          serviceFee: Number(serviceFee) || 0,
          minOrderDefault: Number(minOrderDefault) || 0,
        }),
      });
      setFeedback(
        lang === 'bn'
          ? 'প্ল্যাটফর্ম সিস্টেম সেটিংস সংরক্ষণ করা হয়েছে।'
          : 'Global system settings saved.'
      );
      await loadAdmin();
      await onRestaurantsMutated();
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    const trimmedEmail = pinAdminEmail.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setPinMsg(lang === 'bn' ? 'সঠিক অ্যাডমিন ইমেইল দিন।' : 'Please enter a valid Admin email.');
      return;
    }
    if (newPin.trim().length < 4) {
      setPinMsg(lang === 'bn' ? 'নতুন PIN কমপক্ষে ৪ অক্ষরের হতে হবে।' : 'New PIN must be at least 4 characters.');
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      setPinMsg(lang === 'bn' ? 'নতুন PIN দুইবার মিলছে না।' : 'New PIN and confirmation do not match.');
      return;
    }
    setSavingPin(true);
    try {
      await apiFetch('/api/admin/pin', {
        method: 'POST',
        body: JSON.stringify({
          adminEmail: trimmedEmail,
          currentPin: currentPin.trim(),
          newPin: newPin.trim(),
        }),
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setFeedback(
        lang === 'bn'
          ? `${trimmedEmail} এর জন্য অ্যাডমিন PIN সংরক্ষণ হয়েছে।`
          : `Admin Panel PIN saved for ${trimmedEmail}.`
      );
      await loadAdmin();
    } catch (err: unknown) {
      setPinMsg(err instanceof Error ? err.message : 'Failed to update Admin PIN');
    } finally {
      setSavingPin(false);
    }
  };

  const handleSaveFrontendConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFrontend(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ storefrontConfig: storefrontForm }),
      });
      setFeedback(
        lang === 'bn'
          ? 'ফ্রন্টএন্ড কন্ট্রোল ও স্টোরফ্রন্ট ডিজাইন লাইভ আপডেট হয়েছে।'
          : 'Frontend storefront controls saved and published live!'
      );
      await loadAdmin();
      await onRestaurantsMutated();
    } finally {
      setSavingFrontend(false);
    }
  };

  const handleResetFrontendConfig = async () => {
    setStorefrontForm(DEFAULT_STOREFRONT_CONFIG);
    setSavingFrontend(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ storefrontConfig: DEFAULT_STOREFRONT_CONFIG }),
      });
      setFeedback(
        lang === 'bn'
          ? 'ফ্রন্টএন্ড ডিফল্ট থিমে রিসেট হয়েছে।'
          : 'Storefront controls reset to defaults.'
      );
      await loadAdmin();
      await onRestaurantsMutated();
    } finally {
      setSavingFrontend(false);
    }
  };

  const handleQuickStorefrontPatch = async (
    patch: Partial<StorefrontConfig>,
    successMsg: string
  ) => {
    setSavingActiveBarToggle(true);
    setErrorMsg(null);
    try {
      const nextConfig: StorefrontConfig = { ...storefrontForm, ...patch };
      setStorefrontForm(nextConfig);
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ storefrontConfig: nextConfig }),
      });
      setFeedback(successMsg);
      await loadAdmin(true);
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update Active Delivery Bar setting');
    } finally {
      setSavingActiveBarToggle(false);
    }
  };

  const handleToggleSetting = async (key: keyof PlatformSettings, val: boolean) => {
    setErrorMsg(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: val }),
      });
      setFeedback(`Updated ${String(key)} to ${val ? 'ON' : 'OFF'}.`);
      await loadAdmin();
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update gateway setting');
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);
    setSendingBroadcast(true);
    try {
      await apiFetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: broadcastTarget,
          title: broadcastTitle,
          message: broadcastMessage,
          type: broadcastType,
        }),
      });
      setBroadcastTitle('');
      setBroadcastMessage('');
      setFeedback(
        lang === 'bn'
          ? 'সার্ভার নোটিফিকেশন সফলভাবে পাঠানো হয়েছে।'
          : `Server notification broadcast sent to "${broadcastTarget}".`
      );
      await loadAdmin();
      await loadBackendStatus();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleSaveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);
    setEmailVerifyStatus(null);
    setSavingEmailSettings(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        settings: AdminEmailSettingsView;
        verified?: boolean;
        verifyMessage?: string;
        verifyError?: string;
      }>('/api/admin/email-settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: emailProviderMode,
          smtpHost: emailProviderMode === 'gmail' ? 'smtp.gmail.com' : emailSmtpHost.trim(),
          smtpPort: Number(emailSmtpPort) || 465,
          smtpSecure: emailSmtpSecure,
          smtpUser: emailSmtpUser.trim(),
          smtpPass: emailSmtpPass.trim() || undefined,
          fromAddress: emailFromAddress.trim() || undefined,
          notifyEmail: emailNotifyEmail.trim() || undefined,
          resendApiKey: emailResendKey.trim() || undefined,
        }),
      });
      setEmailSettings(res.settings);
      setEmailNotifyEmail(res.settings.notifyEmail || PRIMARY_SUPER_ADMIN_EMAIL);
      setEmailSmtpPass('');
      setEmailResendKey('');
      if (res.settings.configured) {
        if (res.verified) {
          setEmailVerifyStatus({ ok: true, message: res.verifyMessage || 'SMTP verified & ready.' });
          setFeedback(
            lang === 'bn'
              ? 'SMTP কানেকশন যাচাই ও সেভ হয়েছে — এখন কাস্টমারদের ইমেইলে সব অর্ডার আপডেট যাবে!'
              : res.verifyMessage || `Email transport verified (${res.settings.activeProvider.toUpperCase()} live).`
          );
        } else {
          setEmailVerifyStatus({
            ok: false,
            message: res.verifyError || res.verifyMessage || 'SMTP verification failed.',
          });
          setErrorMsg(res.verifyError || 'Settings saved, but SMTP verification failed.');
        }
      } else {
        setFeedback('Settings saved — enter your Gmail App Password or Resend API key to enable live inbox delivery.');
      }
      await loadBackendStatus();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save email settings');
    } finally {
      setSavingEmailSettings(false);
    }
  };

  const handleVerifySmtp = async () => {
    setErrorMsg(null);
    setFeedback(null);
    setEmailVerifyStatus(null);
    setVerifyingEmail(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; error?: string }>(
        '/api/admin/email-settings/verify',
        { method: 'POST' }
      );
      setEmailVerifyStatus({ ok: true, message: res.message });
      setFeedback(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SMTP verification failed';
      setEmailVerifyStatus({ ok: false, message: msg });
      setErrorMsg(msg);
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent, customStatus?: string) => {
    e.preventDefault();
    if (!testEmailRecipient.trim()) return;
    setErrorMsg(null);
    setFeedback(null);
    setTestingEmail(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/admin/email-settings/test', {
        method: 'POST',
        body: JSON.stringify({
          to: testEmailRecipient.trim(),
          templateStatus: customStatus || previewTemplateStatus,
        }),
      });
      setFeedback(res.message);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleResendEmailLog = async (logId: number) => {
    setErrorMsg(null);
    setFeedback(null);
    setResendingLogId(logId);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/admin/email-logs/${logId}/resend`, {
        method: 'POST',
      });
      setFeedback(res.message);
      await loadBackendStatus();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to resend email');
    } finally {
      setResendingLogId(null);
    }
  };

  const handleVerifySeedData = async () => {
    setErrorMsg(null);
    setFeedback(null);
    setRunningReseed(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/admin/backend/reseed', {
        method: 'POST',
      });
      setFeedback(
        lang === 'bn'
          ? 'ডাটাবেস সিড ও কনফিগারেশন যাচাই সম্পন্ন হয়েছে।'
          : res.message || 'Database seed integrity verified.'
      );
      await loadAdmin();
      await loadBackendStatus();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Seed verification failed');
    } finally {
      setRunningReseed(false);
    }
  };

  const handleDownloadJsonBackup = async () => {
    setErrorMsg(null);
    setDownloadingBackup(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/backend/backup', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to download backup');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `foodora-bd-db-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedback(
        lang === 'bn'
          ? 'স্যানিটাইজড ডাটাবেস ব্যাকআপ (JSON) ডাউনলোড হয়েছে।'
          : 'Sanitized PostgreSQL database backup downloaded.'
      );
      await loadAdmin();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup download failed');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const openCreateProductModal = (preferredRestaurantId?: number) => {
    const defaultRestId = preferredRestaurantId || myRestaurants[0]?.id || restaurants[0]?.id || 1;
    setProductModal({
      restaurantId: defaultRestId,
      category: 'Main Course',
      name: '',
      nameBn: '',
      description: '',
      imageUrl: '',
      price: '350',
      discountPrice: '',
      inStock: true,
      isAvailable: true,
      isVisibleOnStorefront: true,
      isPopular: true,
    });
  };

  const openEditGatewayModal = (gw: AdminPaymentGateway) => {
    setErrorMsg(null);
    setGatewayModal({
      isNew: false,
      code: gw.code,
      name: gw.name,
      nameBn: gw.nameBn,
      providerType: gw.providerType,
      mode: gw.mode,
      isActive: gw.isActive,
      apiBaseUrl: gw.apiBaseUrl,
      merchantId: gw.merchantId,
      apiKey: gw.apiKeyPreview || '',
      apiSecret: gw.apiSecretPreview || '',
      webhookSecret: gw.webhookSecretPreview || '',
      instructions: gw.instructions,
      sortOrder: String(gw.sortOrder),
    });
  };

  const openAddFutureGatewayModal = (preset?: {
    code: string;
    name: string;
    nameBn: string;
    providerType: 'mfs' | 'card' | 'wallet' | 'custom';
    apiBaseUrl: string;
    instructions: string;
  }) => {
    setErrorMsg(null);
    setGatewayModal({
      isNew: true,
      code: preset?.code || '',
      name: preset?.name || '',
      nameBn: preset?.nameBn || '',
      providerType: preset?.providerType || 'mfs',
      mode: 'sandbox',
      isActive: true,
      apiBaseUrl: preset?.apiBaseUrl || '',
      merchantId: '',
      apiKey: '',
      apiSecret: '',
      webhookSecret: '',
      instructions: preset?.instructions || '',
      sortOrder: String(paymentGateways.length + 1),
    });
  };

  const handleSaveGatewayModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayModal) return;
    setSavingGateway(true);
    setErrorMsg(null);
    try {
      await apiFetch('/api/admin/payment-gateways', {
        method: 'PUT',
        body: JSON.stringify({
          code: gatewayModal.code,
          name: gatewayModal.name,
          nameBn: gatewayModal.nameBn || gatewayModal.name,
          providerType: gatewayModal.providerType,
          mode: gatewayModal.mode,
          isActive: gatewayModal.isActive,
          apiBaseUrl: gatewayModal.apiBaseUrl,
          merchantId: gatewayModal.merchantId,
          apiKey: gatewayModal.apiKey,
          apiSecret: gatewayModal.apiSecret,
          webhookSecret: gatewayModal.webhookSecret,
          instructions: gatewayModal.instructions,
          sortOrder: Number(gatewayModal.sortOrder) || 10,
        }),
      });
      setFeedback(
        lang === 'bn'
          ? `${gatewayModal.name} পেমেন্ট গেটওয়ে API সেভ হয়েছে এবং চেকআউটে যুক্ত হয়েছে।`
          : `Saved ${gatewayModal.name} payment gateway integration.`
      );
      setGatewayModal(null);
      await loadAdmin();
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save payment gateway');
    } finally {
      setSavingGateway(false);
    }
  };

  const handleToggleGatewayActive = async (gw: AdminPaymentGateway) => {
    try {
      await apiFetch('/api/admin/payment-gateways', {
        method: 'PUT',
        body: JSON.stringify({
          code: gw.code,
          name: gw.name,
          nameBn: gw.nameBn,
          providerType: gw.providerType,
          mode: gw.mode,
          isActive: !gw.isActive,
          apiBaseUrl: gw.apiBaseUrl,
          merchantId: gw.merchantId,
          instructions: gw.instructions,
          sortOrder: gw.sortOrder,
        }),
      });
      await loadAdmin();
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to toggle gateway');
    }
  };

  const handleTestGateway = async (code: string) => {
    setTestingGatewayCode(code);
    try {
      const res = await apiFetch<{ ok: boolean; configured: boolean; mode: string; message: string }>(
        `/api/admin/payment-gateways/${code}/test`,
        { method: 'POST' }
      );
      setGatewayTestResults((prev) => ({ ...prev, [code]: { ok: res.ok, message: res.message } }));
    } catch (err: unknown) {
      setGatewayTestResults((prev) => ({
        ...prev,
        [code]: { ok: false, message: err instanceof Error ? err.message : 'Test failed' },
      }));
    } finally {
      setTestingGatewayCode(null);
    }
  };

  const handleDeleteGateway = async (code: string) => {
    try {
      await apiFetch(`/api/admin/payment-gateways/${code}`, { method: 'DELETE' });
      setFeedback(`Removed custom payment gateway "${code}".`);
      await loadAdmin();
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove gateway');
    }
  };

  // Multi-AI Provider Handlers
  const openEditAiProviderModal = (p: AdminAiProvider) => {
    setAiProviderModal({
      isNew: false,
      code: p.code,
      name: p.name,
      providerType: p.providerType,
      model: p.model,
      apiBaseUrl: p.apiBaseUrl || '',
      apiKey: p.providerType === 'gemini' ? '' : p.hasApiKey ? p.apiKeyPreview || '••••' : '',
      isActive: p.isActive,
      isDefault: p.isDefault,
      sortOrder: String(p.sortOrder ?? 10),
    });
  };

  const openAddAiProviderModal = (preset?: {
    code: string;
    name: string;
    providerType: AiProviderType;
    model: string;
    apiBaseUrl: string;
  }) => {
    setAiProviderModal({
      isNew: true,
      code: preset?.code || '',
      name: preset?.name || '',
      providerType: preset?.providerType || 'custom_openai',
      model: preset?.model || 'gpt-4o-mini',
      apiBaseUrl: preset?.apiBaseUrl || 'https://api.openai.com/v1',
      apiKey: '',
      isActive: true,
      isDefault: false,
      sortOrder: String(aiProviders.length + 1),
    });
  };

  const handleSaveAiProviderModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiProviderModal) return;
    setSavingAiProvider(true);
    setErrorMsg(null);
    try {
      await apiFetch('/api/admin/ai-providers', {
        method: 'PUT',
        body: JSON.stringify({
          code: aiProviderModal.code,
          name: aiProviderModal.name,
          providerType: aiProviderModal.providerType,
          model: aiProviderModal.model,
          apiBaseUrl: aiProviderModal.apiBaseUrl,
          apiKey: aiProviderModal.providerType === 'gemini' ? undefined : aiProviderModal.apiKey,
          isActive: aiProviderModal.isActive,
          isDefault: aiProviderModal.isDefault,
          sortOrder: Number(aiProviderModal.sortOrder) || 10,
        }),
      });
      setFeedback(
        lang === 'bn'
          ? `${aiProviderModal.name} AI API কনফিগারেশন সংরক্ষণ হয়েছে।`
          : `Saved ${aiProviderModal.name} AI provider settings.`
      );
      setAiProviderModal(null);
      const aiRes = await apiFetch<{ aiProviders: AdminAiProvider[] }>('/api/admin/ai-providers');
      setAiProviders(aiRes.aiProviders || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save AI provider');
    } finally {
      setSavingAiProvider(false);
    }
  };

  const handleToggleAiProviderActive = async (p: AdminAiProvider) => {
    try {
      await apiFetch('/api/admin/ai-providers', {
        method: 'PUT',
        body: JSON.stringify({
          code: p.code,
          name: p.name,
          providerType: p.providerType,
          model: p.model,
          apiBaseUrl: p.apiBaseUrl,
          isActive: !p.isActive,
          isDefault: p.isDefault,
          sortOrder: p.sortOrder,
        }),
      });
      const aiRes = await apiFetch<{ aiProviders: AdminAiProvider[] }>('/api/admin/ai-providers');
      setAiProviders(aiRes.aiProviders || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update AI provider');
    }
  };

  const handleSetDefaultAiProvider = async (p: AdminAiProvider) => {
    try {
      await apiFetch('/api/admin/ai-providers', {
        method: 'PUT',
        body: JSON.stringify({
          code: p.code,
          name: p.name,
          providerType: p.providerType,
          model: p.model,
          apiBaseUrl: p.apiBaseUrl,
          isActive: true,
          isDefault: true,
          sortOrder: p.sortOrder,
        }),
      });
      setFeedback(`${p.name} set as default AI Help provider.`);
      const aiRes = await apiFetch<{ aiProviders: AdminAiProvider[] }>('/api/admin/ai-providers');
      setAiProviders(aiRes.aiProviders || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to set default AI provider');
    }
  };

  const handleTestAiProvider = async (code: string) => {
    setTestingAiCode(code);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/admin/ai-providers/${code}/test`,
        { method: 'POST' }
      );
      setAiTestResults((prev) => ({ ...prev, [code]: res }));
    } catch (err: unknown) {
      setAiTestResults((prev) => ({
        ...prev,
        [code]: { ok: false, message: err instanceof Error ? err.message : 'AI test failed' },
      }));
    } finally {
      setTestingAiCode(null);
    }
  };

  const handleDeleteAiProvider = async (code: string) => {
    try {
      await apiFetch(`/api/admin/ai-providers/${code}`, { method: 'DELETE' });
      setFeedback(`Removed custom AI provider "${code}".`);
      const aiRes = await apiFetch<{ aiProviders: AdminAiProvider[] }>('/api/admin/ai-providers');
      setAiProviders(aiRes.aiProviders || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete AI provider');
    }
  };

  const handleSelectMessageThread = async (restId: number) => {
    setSelectedMessageRestId(restId);
    try {
      await apiFetch('/api/messages/vendor-admin/read', {
        method: 'PATCH',
        body: JSON.stringify({ restaurantId: restId }),
      });
      await loadAdmin(true);
    } catch {
      // ignore
    }
  };

  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessageRestId || !adminReplyText.trim()) return;
    setSendingAdminReply(true);
    try {
      await apiFetch('/api/messages/vendor-admin', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: selectedMessageRestId,
          message: adminReplyText.trim(),
        }),
      });
      setAdminReplyText('');
      emitLocalRealtimeSignal('message:created', { restaurantId: selectedMessageRestId });
      await loadAdmin(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSendingAdminReply(false);
    }
  };

  const openEditProductModal = (item: FoodItem) => {
    setProductModal({
      id: item.id,
      restaurantId: item.restaurantId,
      category: item.category,
      name: item.name,
      nameBn: item.nameBn,
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      price: String(item.price),
      discountPrice: item.discountPrice ? String(item.discountPrice) : '',
      inStock: item.inStock,
      isAvailable: item.isAvailable,
      isVisibleOnStorefront: item.isVisibleOnStorefront !== false,
      isPopular: item.isPopular,
    });
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productModal) return;
    setSavingProduct(true);
    try {
      const payload = {
        restaurantId: Number(productModal.restaurantId),
        category: productModal.category.trim(),
        name: productModal.name.trim(),
        nameBn: productModal.nameBn.trim() || productModal.name.trim(),
        description: productModal.description.trim(),
        imageUrl: productModal.imageUrl.trim(),
        price: Number(productModal.price) || 100,
        discountPrice: productModal.discountPrice ? Number(productModal.discountPrice) : null,
        inStock: productModal.inStock,
        isAvailable: productModal.isAvailable,
        isVisibleOnStorefront: productModal.isVisibleOnStorefront,
        isPopular: productModal.isPopular,
      };

      if (productModal.id) {
        await apiFetch(`/api/admin/products/${productModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(lang === 'bn' ? 'পণ্য আপডেট সম্পন্ন হয়েছে।' : `Updated "${payload.name}".`);
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(lang === 'bn' ? 'নতুন পণ্য আপলোড হয়েছে।' : `Uploaded "${payload.name}".`);
      }
      setProductModal(null);
      await loadAdmin();
      await onRestaurantsMutated();
    } finally {
      setSavingProduct(false);
    }
  };

  const handleQuickProductToggle = async (
    item: FoodItem,
    field: 'inStock' | 'isPopular' | 'isVisibleOnStorefront'
  ) => {
    const currentVal = field === 'isVisibleOnStorefront' ? item.isVisibleOnStorefront !== false : item[field];
    await apiFetch(`/api/admin/products/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: !currentVal }),
    });
    if (field === 'isVisibleOnStorefront') {
      setFeedback(
        !currentVal
          ? lang === 'bn'
            ? `"${item.nameBn}" ওয়েবসাইটে দেখানো হচ্ছে।`
            : `"${item.name}" is now visible on the storefront.`
          : lang === 'bn'
          ? `"${item.nameBn}" ওয়েবসাইট থেকে লুকানো হয়েছে।`
          : `"${item.name}" is now hidden from the storefront.`
      );
    }
    await loadAdmin();
    await onRestaurantsMutated();
  };

  const handleDeleteProduct = async (item: FoodItem) => {
    await apiFetch(`/api/admin/products/${item.id}`, { method: 'DELETE' });
    setFeedback(lang === 'bn' ? 'পণ্য মুছে ফেলা হয়েছে।' : `Deleted "${item.name}".`);
    await loadAdmin();
    await onRestaurantsMutated();
  };

  const openCreateRestaurantModal = () => {
    setModalError(null);
    setRestaurantModal({
      name: '',
      nameBn: '',
      cuisine: 'Bangladeshi',
      area: BANGLADESH_AREAS[0].name,
      address: '',
      lat: BANGLADESH_AREAS[0].lat,
      lng: BANGLADESH_AREAS[0].lng,
      description: '',
      logoUrl: '',
      coverUrl: '',
      deliveryFee: '49',
      minOrder: '150',
      discountPct: '15',
      openingHours: '10:00 AM - 11:30 PM',
      deliveryMode: 'platform',
      commissionRate: '15.00',
      subscriptionPlan: 'basic',
      isOpen: true,
      isSponsored: false,
    });
  };

  const openEditRestaurantModal = (r: Restaurant) => {
    setModalError(null);
    setRestaurantModal({
      id: r.id,
      name: r.name,
      nameBn: r.nameBn,
      cuisine: r.cuisine,
      area: r.area,
      address: r.address,
      lat: Number(r.lat) || BANGLADESH_AREAS[0].lat,
      lng: Number(r.lng) || BANGLADESH_AREAS[0].lng,
      description: r.description,
      logoUrl: r.logoUrl || '',
      coverUrl: r.coverUrl,
      deliveryFee: String(r.deliveryFee),
      minOrder: String(r.minOrder),
      discountPct: String(r.discountPct),
      openingHours: r.openingHours,
      deliveryMode: r.deliveryMode,
      commissionRate: r.commissionRate,
      subscriptionPlan: r.subscriptionPlan,
      isOpen: r.isOpen,
      isSponsored: r.isSponsored,
    });
  };

  const handleSaveRestaurantModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantModal) return;
    setSavingRestaurant(true);
    setModalError(null);
    try {
      const payload = {
        name: restaurantModal.name.trim(),
        nameBn: restaurantModal.nameBn.trim() || restaurantModal.name.trim(),
        cuisine: restaurantModal.cuisine.trim(),
        area: restaurantModal.area.trim(),
        address: restaurantModal.address.trim(),
        lat: restaurantModal.lat,
        lng: restaurantModal.lng,
        description: restaurantModal.description.trim(),
        logoUrl: restaurantModal.logoUrl.trim(),
        coverUrl: restaurantModal.coverUrl.trim(),
        deliveryFee: Number(restaurantModal.deliveryFee) || 0,
        minOrder: Number(restaurantModal.minOrder) || 0,
        discountPct: Number(restaurantModal.discountPct) || 0,
        openingHours: restaurantModal.openingHours.trim(),
        deliveryMode: restaurantModal.deliveryMode,
        commissionRate: restaurantModal.commissionRate.trim(),
        subscriptionPlan: restaurantModal.subscriptionPlan,
        isOpen: restaurantModal.isOpen,
        isSponsored: restaurantModal.isSponsored,
      };
      if (restaurantModal.id) {
        await apiFetch(`/api/admin/restaurants/${restaurantModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(`Updated restaurant "${payload.name}".`);
      } else {
        await apiFetch('/api/admin/restaurants', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(`Created restaurant "${payload.name}".`);
      }
      setRestaurantModal(null);
      await loadAdmin();
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save restaurant');
    } finally {
      setSavingRestaurant(false);
    }
  };

  const handleUpdateRestaurant = async (
    id: number,
    patch: Partial<{
      status: 'pending' | 'approved' | 'rejected' | 'suspended';
      commissionRate: string;
      subscriptionPlan: 'free' | 'basic' | 'premium' | 'enterprise';
      isSponsored: boolean;
      isOpen: boolean;
    }>
  ) => {
    await apiFetch(`/api/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setFeedback(lang === 'bn' ? 'রেস্টুরেন্ট তথ্য আপডেট হয়েছে।' : 'Restaurant configuration saved.');
    await loadAdmin();
    await onRestaurantsMutated();
  };

  const handleOrderOverride = async (
    orderId: number,
    patch: { status: OrderStatus; riderUid?: string | null }
  ) => {
    await apiFetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    emitLocalRealtimeSignal('order:updated', { orderId, status: patch.status });
    setFeedback(`Order #${orderId} updated.`);
    await loadAdmin(true);
  };

  const handleRefundOrder = async (orderId: number) => {
    await apiFetch(`/api/admin/orders/${orderId}/refund`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'Cancelled & refunded by Super Admin' }),
    });
    emitLocalRealtimeSignal('order:updated', { orderId, status: 'cancelled' });
    setFeedback(
      lang === 'bn'
        ? 'অর্ডার বাতিল ও কমিশন রিভার্সাল সম্পন্ন হয়েছে।'
        : 'Order cancelled and commission reversed in ledger.'
    );
    await loadAdmin(true);
  };

  const handlePayoutDecision = async (id: number, status: 'paid' | 'rejected') => {
    await apiFetch(`/api/admin/payouts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadAdmin();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    await apiFetch('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        type: couponType,
        value: Number(value) || 0,
        minOrder: Number(minOrder) || 0,
        maxDiscount: 300,
      }),
    });
    setCode('');
    setTitle('');
    setFeedback(lang === 'bn' ? 'নতুন কুপন প্রকাশিত হয়েছে।' : 'Promo coupon published.');
    await loadAdmin();
  };

  const handleToggleCoupon = async (c: Coupon) => {
    await apiFetch(`/api/admin/coupons/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    await loadAdmin();
  };

  const handleDeleteCoupon = async (id: number) => {
    await apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
    await loadAdmin();
  };

  const handleUpdateUser = async (
    u: AdminUserRow,
    patch: Partial<{ role: string; status: string }>
  ) => {
    setErrorMsg(null);
    const nextRole = patch.role ?? u.role;
    const nextStatus = patch.status ?? u.status;
    const decision = canActorModifyUserAccount({
      actorUid: currentUser.uid,
      actorRole: currentUser.role,
      targetUid: u.uid,
      targetEmail: u.email,
      currentRole: u.role,
      nextRole,
      nextStatus,
    });
    if (!decision.allowed) {
      setErrorMsg(decision.reason || 'Role change is restricted.');
      return;
    }
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setFeedback(`Updated user ${u.email}.`);
      await loadAdmin();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleUpdateRider = async (
    r: RiderRecord,
    patch: Partial<{
      status: string;
      isAvailable: boolean;
      zone: string;
      vehicleType: string;
      currentLat: number;
      currentLng: number;
    }>
  ) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/riders/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setFeedback(`Updated rider ${r.fullName}.`);
      await loadAdmin();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update rider');
    }
  };

  const handleSaveDeliveryFinancialConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFinancialConfig(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ deliveryFinancialConfig: DeliveryFinancialConfig }>(
        '/api/admin/delivery-financial-config',
        {
          method: 'PATCH',
          body: JSON.stringify(deliveryFinancialConfig),
        }
      );
      setDeliveryFinancialConfig(mergeDeliveryFinancialConfig(res.deliveryFinancialConfig));
      setFeedback(
        lang === 'bn'
          ? 'ডেলিভারি চার্জ, রাইডার আয় ও কমিশন নীতি সংরক্ষিত হয়েছে!'
          : 'Zone/distance delivery pricing & rider commission rules saved!'
      );
      await loadAdmin(true);
      await onRestaurantsMutated();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save delivery financial config'
      );
    } finally {
      setSavingFinancialConfig(false);
    }
  };

  const handleSettleRiderCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalRider) return;
    const amt = Math.round(Number(settleAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMsg('Enter a valid positive settlement amount.');
      return;
    }
    setSettlingCommission(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/riders/${encodeURIComponent(settleModalRider.uid)}/settle-commission`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          method: settleMethod,
          referenceId: settleRef.trim(),
          note: settleNote.trim(),
        }),
      });
      setFeedback(
        lang === 'bn'
          ? `${settleModalRider.fullName}-এর ৳${amt} কমিশন সেটেলমেন্ট রেকর্ড হয়েছে।`
          : `Recorded ৳${amt} commission settlement for ${settleModalRider.fullName}.`
      );
      setSettleModalRider(null);
      setSettleAmount('');
      setSettleRef('');
      setSettleNote('');
      await loadAdmin();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record settlement');
    } finally {
      setSettlingCommission(false);
    }
  };

  const selectedRider = riders.find((r) => r.id === selectedRiderId) || riders[0] || null;
  const activeDeliveryOrders = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  );
  const assignableOrders = activeDeliveryOrders;
  const filteredOrders = useMemo(() => {
    if (orderFilter === 'active') return activeDeliveryOrders;
    if (orderFilter === 'closed') {
      return orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled');
    }
    return orders;
  }, [orders, orderFilter, activeDeliveryOrders]);

  const gmv = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.totalAmount, 0);
  const netCommission = ledger.reduce((s, l) => s + l.commissionAmount, 0);
  const pendingCount = restaurants.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sound Notification Chime Control */}
          <button
            type="button"
            onClick={() => {
              const next = !orderSoundEnabled;
              setOrderSoundEnabled(next);
              if (next) {
                void playOrderAlertChime('new_order', { force: true });
                setFeedback(
                  lang === 'bn'
                    ? 'অর্ডার নোটিফিকেশন সাউন্ড চালু হয়েছে (নতুন অর্ডার/আপডেটে বাজবে)।'
                    : 'Order notification sound enabled (chimes on new incoming orders and updates).'
                );
              } else {
                setFeedback(
                  lang === 'bn' ? 'অর্ডার সাউন্ড মিউট করা হয়েছে।' : 'Order sound chime muted.'
                );
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              orderSoundEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200'
            }`}
            title={lang === 'bn' ? 'অর্ডার নোটিফিকেশন সাউন্ড কন্ট্রোল' : 'Order sound alert toggle'}
          >
            {orderSoundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            )}
            <span>
              {orderSoundEnabled
                ? lang === 'bn'
                  ? 'সাউন্ড সক্রিয় 🔔'
                  : 'Sound Active 🔔'
                : lang === 'bn'
                ? 'সাউন্ড মিউট 🔕'
                : 'Sound Muted 🔕'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              void playOrderAlertChime('new_order', { force: true });
              setFeedback(
                lang === 'bn'
                  ? 'অর্ডার সাউন্ড টেস্ট বাজানো হয়েছে!'
                  : 'Order alert chime audio test played successfully!'
              );
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition-colors"
            title={lang === 'bn' ? 'অর্ডার সাউন্ড টেস্ট করুন' : 'Test order notification chime'}
          >
            <Bell className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
            <span>{lang === 'bn' ? 'টেস্ট সাউন্ড' : 'Test Chime'}</span>
          </button>

          {/* Continuous Realtime Sync Indicator */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-pink-50 border border-pink-200 text-[#E21B70] text-xs font-semibold"
            title={
              lang === 'bn'
                ? 'ম্যানুয়াল রিলোড ছাড়া প্রতি ৪ সেকেন্ডে স্বয়ংক্রিয়ভাবে নতুন অর্ডার ও স্ট্যাটাস আপডেট হবে।'
                : 'Realtime live sync active. Automatically checks and updates new orders every 4s without manual reload.'
            }
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>{lang === 'bn' ? 'অটো-আপডেট লাইভ' : 'Auto-Sync Live'}</span>
          </div>

          <a
            href="/api/export/project-zip"
            download="foodora-bd-project.zip"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'প্রোজেক্ট ZIP ডাউনলোড' : 'Download Project ZIP'}</span>
          </a>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2E3138] text-white text-xs font-semibold">
            <Shield className="w-3.5 h-3.5 text-[#E21B70]" />
            <span>
              {currentUser.role === 'super_admin'
                ? lang === 'bn'
                  ? 'সুপার অ্যাডমিন কন্ট্রোল'
                  : 'Super Admin Control'
                : lang === 'bn'
                ? 'অ্যাডমিন কন্ট্রোল'
                : 'Admin Control'}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-emerald-700 hover:text-emerald-950"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center justify-between gap-2"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
            className="text-red-700 hover:text-red-950"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Platform KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 tabular-nums">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট GMV' : 'Gross Merchandise Value'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{formatBdt(gmv, lang)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'প্ল্যাটফর্ম কমিশন' : 'Net Commission'}</p>
          <p className="text-2xl font-bold text-[#E21B70] mt-1">{formatBdt(netCommission, lang)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTab('orders');
            setOrderFilter('active');
          }}
          className="text-left bg-gradient-to-br from-[#FFF0F6] to-white rounded-2xl border border-[#E21B70]/30 hover:border-[#E21B70] p-4 transition-colors"
        >
          <p className="text-xs text-[#E21B70] font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{lang === 'bn' ? 'অ্যাক্টিভ ডেলিভারি অর্ডার' : 'Active Delivery Orders'}</span>
          </p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{activeDeliveryOrders.length}</p>
        </button>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট পণ্য (মেনু)' : 'Total Menu Products'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{products.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending Approvals'}</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{lang === 'bn' ? 'সক্রিয় রাইডার' : 'Active Riders'}</p>
          <p className="text-2xl font-bold text-[#2E3138] mt-1">{riders.length}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, labelBn: 'সিস্টেম কন্ট্রোল ও এক্সপোর্ট', labelEn: 'System Control & Export', icon: Sliders },
          { id: 'frontend' as const, labelBn: 'ফ্রন্টএন্ড কন্ট্রোল', labelEn: 'Frontend Control', icon: LayoutTemplate },
          { id: 'backend' as const, labelBn: 'ব্যাকএন্ড কন্ট্রোল', labelEn: 'Backend Control', icon: Server },
          { id: 'products' as const, labelBn: 'প্রোডাক্ট আপলোড ও এডিট', labelEn: 'Products & Catalog', icon: Package },
          { id: 'restaurants' as const, labelBn: 'রেস্টুরেন্ট ও অনুমোদন', labelEn: 'Restaurants', icon: Store },
          {
            id: 'orders' as const,
            labelBn: `অর্ডার ও ডিসপ্যাচ (${activeDeliveryOrders.length})`,
            labelEn: `Orders & Dispatch (${activeDeliveryOrders.length})`,
            icon: RotateCcw,
          },
          {
            id: 'messages' as const,
            labelBn: `রেস্টুরেন্ট মেসেজ (${messageThreads.reduce((s, t) => s + t.unreadForAdmin, 0)})`,
            labelEn: `Vendor Messages (${messageThreads.reduce((s, t) => s + t.unreadForAdmin, 0)})`,
            icon: MessageSquare,
          },
          { id: 'finance' as const, labelBn: 'কমিশন ও পেআউট', labelEn: 'Ledger & Pricing', icon: Wallet },
          { id: 'coupons' as const, labelBn: 'কুপন ম্যানেজমেন্ট', labelEn: 'Coupons', icon: Tag },
          {
            id: 'users' as const,
            labelBn: `ইউজার ও রাইডার (${riders.filter((r) => r.status === 'pending').length} অপেক্ষমাণ)`,
            labelEn: `Users & Riders (${riders.filter((r) => r.status === 'pending').length} pending)`,
            icon: Users,
          },
        ].map((tItem) => {
          const Icon = tItem.icon;
          return (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                tab === tItem.id
                  ? 'bg-[#E21B70] text-white border-[#E21B70]'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? tItem.labelBn : tItem.labelEn}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'অ্যাডমিন সিস্টেম লোড হচ্ছে...' : 'Loading Whole-System Admin Control...'}
        </div>
      ) : tab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Owner's Own Restaurant & Business Card */}
          <div className="lg:col-span-12 bg-gradient-to-r from-[#FFF0F6] via-white to-white rounded-2xl border border-[#E21B70]/25 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#E21B70] text-white text-[10px] font-bold uppercase tracking-wider">
                  {lang === 'bn' ? 'আমার নিজস্ব ব্যবসা' : 'My Own Restaurant Business'}
                </span>
                <span className="text-xs font-semibold text-neutral-600">
                  {myRestaurants.length > 0
                    ? `${myRestaurants.length} ${lang === 'bn' ? 'টি নিজস্ব স্টোর সক্রিয়' : 'own store(s) active'}`
                    : lang === 'bn'
                    ? 'আপনার নিজস্ব রেস্টুরেন্ট খুলুন'
                    : 'Run your own store alongside partners'}
                </span>
              </div>
              <h2 className="font-bold text-base text-[#2E3138]">
                {myRestaurants.length > 0
                  ? lang === 'bn'
                    ? `আমার স্টোর: ${myRestaurants.map((r) => r.nameBn).join(', ')}`
                    : `Your Own Store(s): ${myRestaurants.map((r) => r.name).join(', ')}`
                  : lang === 'bn'
                  ? 'মার্কেটপ্লেসের পাশাপাশি আপনার নিজের রেস্টুরেন্ট চালু করুন ও পণ্য আপলোড করুন'
                  : 'Launch your own restaurant store alongside partners and upload products directly'}
              </h2>
              <p className="text-xs text-neutral-600">
                {lang === 'bn'
                  ? 'আপনি ও আপনার রেস্টুরেন্ট পার্টনাররা আলাদাভাবে নিজেদের পণ্য আপলোড ও এডিট করতে পারবেন, এবং পেমেন্ট/API ইন্টিগ্রেশন নিয়ন্ত্রণ করতে পারবেন।'
                  : 'You and your partner restaurants manage separate products, menus, orders, and Partner API keys independently.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {myRestaurants.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => openCreateProductModal(myRestaurants[0].id)}
                    className="px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'আমার স্টোরে পণ্য আপলোড' : 'Upload to My Store'}</span>
                  </button>
                  {onOpenVendorStore && (
                    <button
                      type="button"
                      onClick={() => onOpenVendorStore(myRestaurants[0].id)}
                      className="px-4 py-2 rounded-xl bg-[#2E3138] hover:bg-black text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Store className="w-3.5 h-3.5 text-[#E21B70]" />
                      <span>{lang === 'bn' ? 'আমার স্টোর ড্যাশবোর্ড' : 'Open My Store Hub'}</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={openCreateRestaurantModal}
                  className="px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'আমার নিজস্ব রেস্টুরেন্ট চালু করুন' : 'Launch My Own Restaurant'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab('users')}
                className="px-3.5 py-2 rounded-xl border border-neutral-300 bg-white hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5"
              >
                <Bike className="w-3.5 h-3.5 text-[#E21B70]" />
                <span>{lang === 'bn' ? 'লাইভ রাইডার GPS কন্ট্রোল' : 'Live Rider GPS Control'}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('backend')}
                className="px-3.5 py-2 rounded-xl border border-neutral-300 bg-white hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5 text-[#E21B70]" />
                <span>{lang === 'bn' ? 'পেমেন্ট ও API ইন্টিগ্রেশন' : 'Payment & API Integrations'}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('frontend')}
                className="px-3.5 py-2 rounded-xl border border-neutral-300 bg-white hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-[#E21B70]" />
                <span>{lang === 'bn' ? 'Google SEO ও সার্চ কনসোল' : 'Google SEO Settings'}</span>
              </button>
            </div>
          </div>

          {/* Global Numeric & Brand Config */}
          <form
            onSubmit={handleSaveGlobalSettings}
            className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn' ? 'গ্লোবাল প্ল্যাটফর্ম সিস্টেম সেটিংস' : 'Global Platform Parameters'}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Platform Brand Name</label>
                <input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Commission (%)</label>
                <input
                  value={defaultCommissionPct}
                  onChange={(e) => setDefaultCommissionPct(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Delivery Fee (৳)</label>
                <input
                  type="number"
                  value={defaultDeliveryFee}
                  onChange={(e) => setDefaultDeliveryFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Platform Service Fee (৳)</label>
                <input
                  type="number"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Default Minimum Order (৳)</label>
                <input
                  type="number"
                  value={minOrderDefault}
                  onChange={(e) => setMinOrderDefault(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : lang === 'bn' ? 'সিস্টেম সেটিংস সেভ করুন' : 'Save System Settings'}
            </button>
          </form>

          {/* Payment Gateways, Couriers & Clean ZIP Export */}
          <div className="lg:col-span-6 space-y-6">
            {currentUser.role === 'super_admin' && (
              <form
                onSubmit={handleUpdateAdminPin}
                className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? 'অ্যাডমিন প্যানেল সিকিউরিটি PIN তৈরি / পরিবর্তন'
                        : 'Admin Panel PIN Create & Security'}
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {adminPinEmails.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setPinAdminEmail(em)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                          pinAdminEmail.trim().toLowerCase() === em
                            ? 'bg-[#FFF0F6] border-[#E21B70] text-[#E21B70]'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
                {pinMsg && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {pinMsg}
                  </p>
                )}
                <div className="text-xs">
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'অ্যাডমিন ইমেইল (PIN Mail)' : 'Admin Email (Create / Update PIN for)'}
                  </label>
                  <input
                    type="email"
                    required
                    value={pinAdminEmail}
                    onChange={(e) => setPinAdminEmail(e.target.value)}
                    placeholder="raqkibrony@gmail.com"
                    className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Current PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      minLength={4}
                      maxLength={16}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      placeholder="••••"
                      className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">New PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      minLength={4}
                      maxLength={16}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="4–16 chars"
                      className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Confirm PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      minLength={4}
                      maxLength={16}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Repeat PIN"
                      className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={savingPin}
                  className="px-4 py-2 rounded-xl bg-[#2E3138] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                >
                  {savingPin
                    ? 'Saving...'
                    : lang === 'bn'
                    ? 'PIN সেভ / তৈরি করুন'
                    : 'Create / Update Admin PIN'}
                </button>
              </form>
            )}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'পেমেন্ট গেটওয়ে ও ডেলিভারি কুরিয়ার কন্ট্রোল'
                    : 'Payment Gateways & Pathao Courier Toggles'}
                </span>
              </h2>
              {settings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'pathaoEnabled' as const, label: 'Pathao Courier Dispatch' },
                    { key: 'pathaoSandbox' as const, label: 'Pathao Sandbox Mode' },
                    { key: 'bkashEnabled' as const, label: 'bKash Tokenized Checkout' },
                    { key: 'bkashSandbox' as const, label: 'bKash Sandbox Mode' },
                    { key: 'sslcommerzEnabled' as const, label: 'SSLCommerz Cards/MFS' },
                    { key: 'sslcommerzSandbox' as const, label: 'SSLCommerz Sandbox Mode' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200"
                    >
                      <span className="font-semibold text-[#2E3138]">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSetting(item.key, !settings[item.key])}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          settings[item.key]
                            ? 'bg-emerald-600 text-white'
                            : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {settings[item.key] ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#2E3138] text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF7EB3]">
                    Portable Source Bundle
                  </p>
                  <h3 className="font-bold text-base mt-0.5">
                    {lang === 'bn'
                      ? 'সম্পূর্ণ প্রোজেক্ট ZIP ডাউনলোড ও অন্য অ্যাকাউন্টে ওপেন'
                      : 'Export Clean Project ZIP (Error-Free)'}
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1">
                    Downloads full TypeScript frontend + Express backend + Drizzle schema without node_modules or secret keys.
                  </p>
                </div>
                <a
                  href="/api/export/project-zip"
                  download="foodora-bd-project.zip"
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                >
                  <Download className="w-4 h-4" />
                  <span>Download ZIP</span>
                </a>
              </div>
            </div>
          </div>

          {/* System Audit Logs */}
          <div className="lg:col-span-12 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
            <h2 className="font-bold text-sm text-[#2E3138] mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E21B70]" />
              <span>{lang === 'bn' ? 'সিস্টেম অডিট লগ' : 'Live System Audit Trail'}</span>
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-neutral-500">No admin mutations logged yet.</p>
            ) : (
              <table className="w-full text-xs text-left tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="py-2">Action</th>
                    <th className="py-2">Target</th>
                    <th className="py-2">Actor</th>
                    <th className="py-2">Details</th>
                    <th className="py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 15).map((log) => (
                    <tr key={log.id} className="border-b border-neutral-100">
                      <td className="py-2 font-bold uppercase text-[#E21B70]">{log.action}</td>
                      <td className="py-2 text-neutral-700">
                        {log.targetType} #{log.targetId}
                      </td>
                      <td className="py-2 text-neutral-500">{log.actorUid}</td>
                      <td className="py-2 text-neutral-600 max-w-md truncate">{log.details}</td>
                      <td className="py-2 text-right text-neutral-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : tab === 'backend' ? (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-base text-[#2E3138] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'ব্যাকএন্ড, ডাটাবেস ও সার্ভার কন্ট্রোল সেন্টার'
                    : 'Backend, Database & Server Control Center'}
                </span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {lang === 'bn'
                  ? 'সরাসরি PostgreSQL/Supabase হেলথ, API ইন্টিগ্রেশন, পেমেন্ট গেটওয়ে মোড, নোটিফিকেশন ব্রডকাস্ট ও ডাটাবেস ব্যাকআপ নিয়ন্ত্রণ করুন।'
                  : 'Inspect live PostgreSQL/Supabase health, API integrations, server fee rules, notification broadcasts, and database backups.'}
              </p>
            </div>
            <button
              type="button"
              onClick={loadBackendStatus}
              disabled={loadingBackend}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-300 hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBackend ? 'animate-spin' : ''}`} />
              <span>{lang === 'bn' ? 'হেলথ চেক রিফ্রেশ' : 'Refresh DB Health'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Database & Runtime Inspector */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#E21B70]" />
                  <span>
                    {lang === 'bn'
                      ? 'ডাটাবেস কানেকশন ও টেবিল রেকর্ডস'
                      : 'PostgreSQL / Supabase Runtime & Table Counts'}
                  </span>
                </h3>
                {backendStatus && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold tabular-nums">
                    Connected · {backendStatus.latencyMs}ms
                  </span>
                )}
              </div>

              {loadingBackend && !backendStatus ? (
                <div className="py-8 text-center text-xs text-neutral-500">
                  Running live backend diagnostics...
                </div>
              ) : backendStatus ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <p className="text-[11px] text-neutral-500">Runtime Engine</p>
                      <p className="font-bold text-[#2E3138] mt-0.5">
                        {backendStatus.runtime === 'vercel-serverless'
                          ? 'Vercel Serverless'
                          : 'Node.js Express'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <p className="text-[11px] text-neutral-500">DB Driver</p>
                      <p className="font-bold text-[#2E3138] mt-0.5">
                        {backendStatus.databaseProvider === 'supabase-or-external-url'
                          ? 'Supabase / External PG'
                          : backendStatus.databaseProvider === 'cloudsql-pg'
                          ? 'Cloud SQL PG'
                          : 'Local Postgres'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <p className="text-[11px] text-neutral-500">SSL Mode</p>
                      <p className="font-bold text-[#2E3138] mt-0.5">
                        {backendStatus.sslActive ? 'TLS / SSL Active' : 'Private Socket'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <p className="text-[11px] text-neutral-500">Checked At</p>
                      <p className="font-bold text-[#2E3138] mt-0.5 tabular-nums">
                        {new Date(backendStatus.checkedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-xs tabular-nums pt-1">
                    {[
                      { label: 'Users', count: backendStatus.tableCounts.users },
                      { label: 'Restaurants', count: backendStatus.tableCounts.restaurants },
                      { label: 'Menu Items', count: backendStatus.tableCounts.foodItems },
                      { label: 'Orders', count: backendStatus.tableCounts.orders },
                      { label: 'Riders', count: backendStatus.tableCounts.riders },
                      { label: 'Coupons', count: backendStatus.tableCounts.coupons },
                      { label: 'Notifications', count: backendStatus.tableCounts.notifications },
                      { label: 'Ledger', count: backendStatus.tableCounts.commissionLedger },
                      { label: 'Audit Logs', count: backendStatus.tableCounts.auditLogs },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="p-2.5 rounded-xl border border-neutral-200 bg-white text-center"
                      >
                        <p className="text-base font-bold text-[#2E3138]">{row.count}</p>
                        <p className="text-[11px] text-neutral-500">{row.label}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-neutral-500">Could not load backend runtime metrics.</p>
              )}
            </div>

            {/* Env Integration Readiness Matrix */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'API ও এনভায়রনমেন্ট কনফিগ স্ট্যাটাস'
                    : 'Server Environment Readiness'}
                </span>
              </h3>
              <p className="text-[11px] text-neutral-500">
                Secret values remain hidden on the server; only connection readiness is shown.
              </p>

              {backendStatus && (
                <div className="space-y-2 text-xs">
                  {[
                    {
                      label: 'PostgreSQL / Supabase Connection',
                      ready: backendStatus.integrations.databaseConfigured,
                      fallbackText: 'Not Configured',
                    },
                    {
                      label: 'Supabase Auth (Google OAuth & JWT)',
                      ready: backendStatus.integrations.supabaseAuthConfigured,
                      fallbackText: 'Client Verify Mode',
                    },
                    {
                      label: 'Google Maps Platform API Key',
                      ready: backendStatus.integrations.googleMapsConfigured,
                      fallbackText: 'Interactive Fallback Map',
                    },
                    {
                      label: 'bKash Live Merchant Credentials',
                      ready: backendStatus.integrations.bkashLiveConfigured,
                      fallbackText: 'Sandbox Simulation',
                    },
                    {
                      label: 'SSLCommerz Live Store Credentials',
                      ready: backendStatus.integrations.sslcommerzLiveConfigured,
                      fallbackText: 'Sandbox Simulation',
                    },
                    {
                      label: 'Pathao Courier API Credentials',
                      ready: backendStatus.integrations.pathaoLiveConfigured,
                      fallbackText: 'Sandbox Simulation',
                    },
                    {
                      label: 'Order Invoice Email (Gmail SMTP / Resend)',
                      ready: Boolean(backendStatus.integrations.emailConfigured),
                      fallbackText: 'Tracking Inbox Only',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200"
                    >
                      <span className="font-medium text-[#2E3138]">{item.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          item.ready
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.ready ? 'Configured' : item.fallbackText}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Server Notification Broadcast Engine */}
            <form
              onSubmit={handleSendBroadcast}
              className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
            >
              <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'সার্ভার নোটিফিকেশন ব্রডকাস্ট'
                    : 'Server Broadcast Notification Engine'}
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Push live notifications directly to customer, vendor, rider, or all accounts via the backend.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Target Audience</label>
                  <select
                    value={broadcastTarget}
                    onChange={(e) =>
                      setBroadcastTarget(
                        e.target.value as 'all' | 'customer' | 'restaurant_owner' | 'rider' | 'admin'
                      )
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                  >
                    <option value="all">All Users (Global Broadcast)</option>
                    <option value="customer">Customers Only</option>
                    <option value="restaurant_owner">Restaurant Partners</option>
                    <option value="rider">Delivery Riders</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Notification Type</label>
                  <select
                    value={broadcastType}
                    onChange={(e) =>
                      setBroadcastType(e.target.value as 'system' | 'promo' | 'order')
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                  >
                    <option value="system">System Alert</option>
                    <option value="promo">Promo Offer</option>
                    <option value="order">Dispatch Notice</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-neutral-700 mb-1">Title</label>
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="e.g. Eid Flash Free Delivery Tonight!"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-neutral-700 mb-1">Message</label>
                  <textarea
                    required
                    rows={2}
                    minLength={5}
                    maxLength={500}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Message stored in PostgreSQL notifications table..."
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={sendingBroadcast}
                className="px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
              >
                {sendingBroadcast
                  ? 'Sending...'
                  : lang === 'bn'
                  ? 'ব্রডকাস্ট পাঠান'
                  : 'Send Server Broadcast'}
              </button>
            </form>

            {/* Gmail SMTP / Custom SMTP / Resend Order Invoice Email Delivery */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#E21B70]" />
                  <span>
                    {lang === 'bn'
                      ? 'অর্ডার ইনভয়েস ইমেইল ডেলিভারি (Gmail SMTP / Resend)'
                      : 'Order Invoice Email Setup (Gmail SMTP / Resend)'}
                  </span>
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    emailSettings?.configured
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {emailSettings?.configured
                    ? `Live (${emailSettings.activeProvider.toUpperCase()})`
                    : 'Not Configured'}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {lang === 'bn'
                  ? 'কাস্টমারদের Gmail/ইমেইলে স্বয়ংক্রিয়ভাবে অর্ডার ইনভয়েস (INV-) ও লাইভ আপডেট পাঠাতে আপনার Gmail + App Password অথবা Resend API Key যুক্ত করুন।'
                  : 'Connect a Gmail + Google App Password (recommended) or Resend API key so every order sends a real itemized invoice (INV-) directly to customer Gmail inboxes.'}
              </p>

              {emailProviderMode === 'gmail' && (
                <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-2.5 text-[11px] text-blue-900 leading-relaxed">
                  <strong>{lang === 'bn' ? 'Gmail App Password গাইড:' : 'Gmail App Password Guide:'}</strong>{' '}
                  {lang === 'bn'
                    ? 'Google Account → Security → 2-Step Verification চালু করে App Passwords থেকে ১৬-অক্ষরের পাসওয়ার্ড তৈরি করে এখানে দিন (স্পেস থাকলেও অটো-ঠিক হবে)। কাস্টমারের সব অর্ডার আপডেট (Confirmed, Preparing, Rider Assigned, On the way, Delivered, Cancelled) স্বয়ংক্রিয়ভাবে তাদের মেইলে যাবে।'
                    : 'Enable Google 2-Step Verification → Security → App Passwords to generate a 16-character password (spaces are stripped automatically). All customer order updates & invoices will automatically send.'}
                </div>
              )}

              {emailProviderMode === 'resend' && (
                <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-2.5 text-[11px] text-blue-900 leading-relaxed">
                  <strong>{lang === 'bn' ? 'Resend API গাইড:' : 'Resend API Guide:'}</strong>{' '}
                  {lang === 'bn'
                    ? 'কাস্টম ডোমেইন ভেরিফাই না থাকলে From Address হিসেবে Foodora BD <onboarding@resend.dev> রাখুন (ফ্রি প্ল্যানে শুধু আপনার Resend অ্যাকাউন্ট ইমেইলে টেস্ট যাবে, সব কাস্টমারের কাছে পাঠাতে একটি ডোমেইন ভেরিফাই করুন)।'
                    : 'Use Foodora BD <onboarding@resend.dev> if no custom domain is verified yet (note: Resend sandbox only sends to your own Resend account email until you verify a domain).'}
                </div>
              )}

              <form onSubmit={handleSaveEmailSettings} className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'gmail', label: 'Gmail SMTP' },
                      { id: 'smtp', label: 'Custom SMTP' },
                      { id: 'resend', label: 'Resend API' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setEmailProviderMode(opt.id);
                        if (opt.id === 'gmail') {
                          setEmailSmtpHost('smtp.gmail.com');
                          setEmailSmtpPort('465');
                          setEmailSmtpSecure(true);
                          if (emailFromAddress.includes('onboarding@resend.dev')) {
                            setEmailFromAddress('');
                          }
                        } else if (opt.id === 'resend') {
                          if (!emailFromAddress || emailFromAddress.toLowerCase().includes('@foodora.bd')) {
                            setEmailFromAddress('Foodora BD <onboarding@resend.dev>');
                          }
                        }
                      }}
                      className={`py-2 px-2.5 rounded-lg border font-bold transition-colors ${
                        emailProviderMode === opt.id
                          ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {emailProviderMode === 'resend' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-neutral-700 mb-1">
                        Resend API Key {emailSettings?.hasResendKey ? `(${emailSettings.resendKeyPreview})` : ''}
                      </label>
                      <input
                        type="password"
                        value={emailResendKey}
                        onChange={(e) => setEmailResendKey(e.target.value)}
                        placeholder={emailSettings?.hasResendKey ? 'Leave blank to keep saved key' : 're_xxxxxxxxx'}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-neutral-700 mb-1">From Address</label>
                      <input
                        value={emailFromAddress}
                        onChange={(e) => setEmailFromAddress(e.target.value)}
                        placeholder="Foodora BD <onboarding@resend.dev>"
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {emailProviderMode === 'smtp' && (
                      <>
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">SMTP Host</label>
                          <input
                            value={emailSmtpHost}
                            onChange={(e) => setEmailSmtpHost(e.target.value)}
                            placeholder="smtp.example.com"
                            className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">Port</label>
                          <input
                            type="number"
                            value={emailSmtpPort}
                            onChange={(e) => {
                              setEmailSmtpPort(e.target.value);
                              setEmailSmtpSecure(e.target.value === '465');
                            }}
                            placeholder="465"
                            className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">
                        {emailProviderMode === 'gmail' ? 'Gmail Address' : 'SMTP Username'}
                      </label>
                      <input
                        type="email"
                        value={emailSmtpUser}
                        onChange={(e) => setEmailSmtpUser(e.target.value)}
                        placeholder="your-store@gmail.com"
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">
                        {emailProviderMode === 'gmail' ? 'Gmail App Password' : 'SMTP Password'}
                        {emailSettings?.hasSmtpPass ? ` (${emailSettings.smtpPassPreview})` : ''}
                      </label>
                      <input
                        type="password"
                        value={emailSmtpPass}
                        onChange={(e) => setEmailSmtpPass(e.target.value)}
                        placeholder={
                          emailSettings?.hasSmtpPass
                            ? 'Leave blank to keep saved password'
                            : '16-char Google App Password'
                        }
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-neutral-700 mb-1">
                        Sender Name &amp; Email (Optional)
                      </label>
                      <input
                        value={emailFromAddress}
                        onChange={(e) => setEmailFromAddress(e.target.value)}
                        placeholder={`Foodora BD <${emailSmtpUser || 'orders@foodora.bd'}>`}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    {lang === 'bn'
                      ? 'অ্যাডমিন / স্টোর অর্ডার অ্যালার্ট ইমেইল (নতুন অর্ডার ও আপডেট)'
                      : 'Admin / Owner Order Alert Email (Receives New Orders & Updates)'}
                  </label>
                  <input
                    type="email"
                    value={emailNotifyEmail}
                    onChange={(e) => setEmailNotifyEmail(e.target.value)}
                    placeholder={PRIMARY_SUPER_ADMIN_EMAIL}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingEmailSettings}
                    className="px-4 py-2 rounded-xl bg-[#2E3138] hover:bg-black text-white font-semibold disabled:opacity-50"
                  >
                    {savingEmailSettings
                      ? 'Saving & Verifying...'
                      : emailProviderMode === 'resend'
                      ? lang === 'bn'
                        ? 'সেভ ও Resend যাচাই করুন'
                        : 'Save & Verify Resend'
                      : lang === 'bn'
                      ? 'সেভ ও SMTP যাচাই করুন'
                      : 'Save & Verify SMTP'}
                  </button>
                  <button
                    type="button"
                    disabled={verifyingEmail}
                    onClick={handleVerifySmtp}
                    className="px-3.5 py-2 rounded-xl border border-neutral-300 hover:border-[#2E3138] text-neutral-700 font-semibold disabled:opacity-50"
                  >
                    {verifyingEmail ? 'Checking...' : 'Test Connection'}
                  </button>
                </div>
              </form>

              {emailVerifyStatus && (
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-medium border ${
                    emailVerifyStatus.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {emailVerifyStatus.message}
                </div>
              )}

              {!emailSettings?.configured && (
                <div className="rounded-lg px-3 py-2 text-[11px] font-medium border bg-amber-50 border-amber-200 text-amber-900">
                  {lang === 'bn'
                    ? 'লাইভ Gmail ডেলিভারির জন্য আপনার Gmail এবং ১৬-অক্ষরের Google App Password দিয়ে Save & Verify SMTP চাপুন। এখন টেস্ট পাঠালে নিচের Delivery Logs-এ সেভ হবে।'
                    : 'SMTP/Resend credentials are not saved yet. Save Gmail + 16-char Google App Password above for real inbox delivery; otherwise test emails are recorded in Delivery Logs below.'}
                </div>
              )}

              {testEmailRecipient.toLowerCase().includes('@gmial.com') && (
                <div className="rounded-lg px-3 py-2 text-[11px] font-medium border bg-amber-50 border-amber-200 text-amber-900 flex items-center justify-between gap-2">
                  <span>
                    {lang === 'bn'
                      ? 'ডোমেইন টাইপো ধরা পড়েছে: @gmial.com সম্ভবত @gmail.com হবে।'
                      : 'Possible email typo detected: @gmial.com should usually be @gmail.com.'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTestEmailRecipient((prev) => prev.replace(/@gmial\.com/gi, '@gmail.com'))
                    }
                    className="px-2 py-1 rounded bg-amber-900 text-white font-semibold shrink-0 hover:bg-black"
                  >
                    Fix to @gmail.com
                  </button>
                </div>
              )}

              <form onSubmit={(e) => handleSendTestEmail(e)} className="pt-2 border-t border-neutral-100 flex gap-2 text-xs">
                <input
                  type="email"
                  required
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="raqkibrony@gmail.com"
                  className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={testingEmail}
                  className="px-3.5 py-2 rounded-lg border border-[#E21B70] text-[#E21B70] hover:bg-[#FFF0F6] font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testingEmail ? 'Sending...' : 'Send Test Email'}</span>
                </button>
              </form>
            </div>

            {/* Interactive Order Update Email Templates & Live Delivery Logs */}
            <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-[#E21B70]" />
                      <span>
                        {lang === 'bn'
                          ? 'অর্ডার আপডেট ইমেইল টেমপ্লেট (কাস্টমার মেইল প্রিভিউ)'
                          : 'Customer Order Update Email Templates (Live Preview)'}
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {lang === 'bn'
                        ? 'প্রতিটি অর্ডার ধাপে কাস্টমারের Gmail ইনবক্সে যে বাংলা+ইংরেজি ইনভয়েস ও আপডেট টেমপ্লেট যাবে:'
                        : 'Automatic bilingual templates sent to customer email on every status change:'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={testingEmail || !testEmailRecipient.trim()}
                    onClick={(e) => handleSendTestEmail(e, previewTemplateStatus)}
                    className="px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{lang === 'bn' ? 'এই টেমপ্লেট টেস্ট পাঠান' : 'Send Selected Template Test'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {ORDER_EMAIL_TEMPLATE_PRESETS.map((preset) => (
                    <button
                      key={preset.status}
                      type="button"
                      onClick={() => setPreviewTemplateStatus(preset.status)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                        previewTemplateStatus === preset.status
                          ? 'bg-[#2E3138] text-white border-[#2E3138]'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-400'
                      }`}
                    >
                      {lang === 'bn' ? preset.titleBn : preset.titleEn}
                    </button>
                  ))}
                </div>

                {(() => {
                  const preview = getOrderEmailTemplatePreview(
                    previewTemplateStatus,
                    typeof window !== 'undefined' ? window.location.origin : 'https://foodora.bd',
                    testEmailRecipient || PRIMARY_SUPER_ADMIN_EMAIL
                  );
                  return (
                    <div className="rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50">
                      <div className="px-3 py-2 bg-neutral-100 border-b border-neutral-200 text-[11px] text-neutral-700 truncate">
                        <strong>Subject:</strong> {preview.subject}
                      </div>
                      <iframe
                        title="Order Email Template Preview"
                        srcDoc={preview.html}
                        sandbox=""
                        className="w-full h-[340px] bg-white border-0"
                      />
                    </div>
                  );
                })()}
              </div>

              <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn' ? 'ইমেইল ডেলিভারি লগ ও রিসেন্ড' : 'Order Email Logs & Resend'}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => loadBackendStatus()}
                    className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600"
                    title="Refresh email logs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {emailLogs.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-8 text-center">
                    {lang === 'bn'
                      ? 'এখনো কোনো অর্ডার ইমেইল লগ নেই।'
                      : 'No order email logs recorded yet.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[410px] overflow-y-auto pr-1">
                    {emailLogs.map((log) => {
                      const isSent = log.providerStatus === 'sent';
                      return (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#2E3138] truncate">
                              {log.orderNumber} · {log.statusEvent}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                isSent
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isSent ? `Sent (${log.deliveryProvider})` : log.providerStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-600 truncate">To: {log.recipientEmail}</p>
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[10px] text-neutral-400">
                              {new Date(log.sentAt).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              disabled={resendingLogId === log.id}
                              onClick={() => handleResendEmailLog(log.id)}
                              className="px-2 py-0.5 rounded border border-neutral-300 hover:border-[#E21B70] text-[10px] font-bold text-neutral-700 hover:text-[#E21B70] disabled:opacity-50"
                            >
                              {resendingLogId === log.id ? 'Sending...' : 'Resend'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Gateway Modes + Extensible Payment API Integrations */}
            <div className="lg:col-span-12 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? 'এক্সটেনসিবল পেমেন্ট গেটওয়ে API ইন্টিগ্রেশন (bKash, Nagad, SSLCommerz ও ভবিষ্যতের গেটওয়ে)'
                        : 'Payment Gateway API Integrations (bKash, Nagad, SSLCommerz & Future Gateways)'}
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {lang === 'bn'
                      ? 'এখানে বিকাশ, নগদ, SSLCommerz বা ভবিষ্যতে Rocket, Upay, ShurjoPay, Stripe-এর API Key যুক্ত ও পরিচালনা করুন। সক্রিয় গেটওয়ে চেকআউটে দেখা যাবে।'
                      : 'Configure Merchant IDs, API Keys, Endpoints, Sandbox/Live modes, or add future bKash-style MFS/Card gateways. API secrets stay encrypted server-side.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openAddFutureGatewayModal({
                        code: 'rocket',
                        name: 'DBBL Rocket',
                        nameBn: 'রকেট (Rocket)',
                        providerType: 'mfs',
                        apiBaseUrl: 'https://api.rocket.com.bd/v1',
                        instructions: 'Pay securely via DBBL Rocket MFS wallet.',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700"
                  >
                    + Rocket Preset
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openAddFutureGatewayModal({
                        code: 'upay',
                        name: 'Upay MFS',
                        nameBn: 'উপায় (Upay)',
                        providerType: 'mfs',
                        apiBaseUrl: 'https://api.upaybd.com/v1',
                        instructions: 'Instant MFS checkout with Upay.',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700"
                  >
                    + Upay Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddFutureGatewayModal()}
                    className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'নতুন পেমেন্ট গেটওয়ে যুক্ত করুন' : 'Add Future Payment Gateway'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {paymentGateways.map((gw) => {
                  const testRes = gatewayTestResults[gw.code];
                  const isBuiltin = ['bkash', 'nagad', 'sslcommerz', 'cod'].includes(gw.code);
                  return (
                    <div
                      key={gw.code}
                      className={`p-4 rounded-xl border space-y-2.5 ${
                        gw.isActive ? 'border-neutral-200 bg-white' : 'border-neutral-200 bg-neutral-50 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-[#2E3138]">
                              {lang === 'bn' ? gw.nameBn : gw.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono-nums text-[10px] uppercase">
                              {gw.code}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 text-[10px] uppercase">
                              {gw.providerType}
                            </span>
                            {gw.code !== 'cod' && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  gw.mode === 'live'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {gw.mode}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            {gw.isConfigured
                              ? `Merchant: ${gw.merchantId || 'Env Configured'} · Key: ${gw.apiKeyPreview || 'Ready'}`
                              : 'Sandbox ready · Add API keys to enable live production transactions'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleGatewayActive(gw)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                            gw.isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-neutral-200 text-neutral-700'
                          }`}
                        >
                          {gw.isActive ? 'ACTIVE' : 'DISABLED'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px]">
                        <span className="truncate font-mono-nums text-neutral-600">
                          Webhook: {gw.webhookUrl}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(gw.webhookUrl);
                            setCopiedWebhookCode(gw.code);
                            setTimeout(() => setCopiedWebhookCode(null), 1500);
                          }}
                          className="shrink-0 text-[#E21B70] font-semibold inline-flex items-center gap-1"
                        >
                          {copiedWebhookCode === gw.code ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {testRes && (
                        <p
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                            testRes.ok
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}
                        >
                          {testRes.message}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => openEditGatewayModal(gw)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] font-semibold text-[#2E3138] inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{lang === 'bn' ? 'API কনফিগার করুন' : 'Configure API'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={testingGatewayCode === gw.code}
                          onClick={() => handleTestGateway(gw.code)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-emerald-500 font-semibold text-neutral-700 disabled:opacity-50"
                        >
                          {testingGatewayCode === gw.code ? 'Testing...' : 'Test Config'}
                        </button>
                        {!isBuiltin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteGateway(gw.code)}
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Help Multi-API Providers (Gemini, ChatGPT/OpenAI, Groq, DeepSeek, Claude & Custom) */}
            <div className="lg:col-span-12 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? 'AI হেল্প API ইন্টিগ্রেশন (Foodora AI, OpenRouter, Gemini, ChatGPT ও কাস্টম)'
                        : 'AI Help API Integrations (Foodora Own AI, OpenRouter, Gemini, ChatGPT & Custom)'}
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {lang === 'bn'
                      ? 'বিল্ট-ইন Foodora Own AI ছাড়াও OpenRouter (Gemma 4), Gemini, ChatGPT, Groq বা কাস্টম AI API যোগ করুন।'
                      : 'Keep built-in Foodora Own AI or connect OpenRouter (Gemma 4), Google Gemini, ChatGPT (OpenAI), Groq, DeepSeek, Claude, or custom OpenAI-compatible APIs.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {AI_PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      onClick={() => openAddAiProviderModal(preset)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700"
                    >
                      + {preset.name.split(' ')[0]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => openAddAiProviderModal()}
                    className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'নতুন AI API যোগ করুন' : 'Add Custom AI API'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {aiProviders.map((provider) => {
                  const testRes = aiTestResults[provider.code];
                  return (
                    <div
                      key={provider.code}
                      className={`p-4 rounded-xl border space-y-2.5 ${
                        provider.isActive
                          ? 'border-neutral-200 bg-white'
                          : 'border-neutral-200 bg-neutral-50 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Bot className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
                            <span className="font-bold text-sm text-[#2E3138] truncate">
                              {provider.name}
                            </span>
                            {provider.isDefault && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FFF0F6] text-[#E21B70] text-[10px] font-bold uppercase">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-600 mt-0.5 font-mono-nums truncate">
                            {provider.providerType} · {provider.model}
                          </p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            {provider.providerType === 'foodora'
                              ? provider.apiKeyPreview || 'Built-in Foodora AI Ready'
                              : provider.providerType === 'pollinations'
                              ? 'Free Keyless AI Ready'
                              : provider.providerType === 'gemini'
                              ? provider.isConfigured
                                ? 'Server Env Key Ready'
                                : 'Set GEMINI_API_KEY in Secrets'
                              : provider.hasApiKey
                              ? `API Key: ${provider.apiKeyPreview}`
                              : provider.providerType === 'openrouter'
                              ? 'Add OpenRouter API key or set OPENROUTER_API_KEY'
                              : 'No API key added yet'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAiProviderActive(provider)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                            provider.isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-neutral-200 text-neutral-700'
                          }`}
                        >
                          {provider.isActive ? 'ACTIVE' : 'OFF'}
                        </button>
                      </div>

                      {testRes && (
                        <p
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                            testRes.ok
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}
                        >
                          {testRes.message}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => openEditAiProviderModal(provider)}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] font-semibold text-[#2E3138] inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{lang === 'bn' ? 'কনফিগার' : 'Configure'}</span>
                        </button>
                        {!provider.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAiProvider(provider)}
                            className="px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] font-semibold text-neutral-700"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={testingAiCode === provider.code}
                          onClick={() => handleTestAiProvider(provider.code)}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-emerald-500 font-semibold text-neutral-700 disabled:opacity-50"
                        >
                          {testingAiCode === provider.code ? 'Testing...' : 'Test'}
                        </button>
                        {provider.code !== 'gemini' && provider.code !== 'foodora' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAiProvider(provider.code)}
                            className="px-2 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Courier & Gateway Quick Switches + Super Admin DB Backup & Seed Repair */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'কুরিয়ার ও কুইক গেটওয়ে টগল'
                    : 'Courier & Quick Integration Toggles'}
                </span>
              </h3>
              {settings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'pathaoEnabled' as const, label: 'Pathao Courier Dispatch' },
                    { key: 'pathaoSandbox' as const, label: 'Pathao Sandbox Mode' },
                    { key: 'bkashEnabled' as const, label: 'bKash Tokenized API' },
                    { key: 'bkashSandbox' as const, label: 'bKash Sandbox Mode' },
                    { key: 'sslcommerzEnabled' as const, label: 'SSLCommerz MFS/Card' },
                    { key: 'sslcommerzSandbox' as const, label: 'SSLCommerz Sandbox Mode' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200"
                    >
                      <span className="font-semibold text-[#2E3138]">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSetting(item.key, !settings[item.key])}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          settings[item.key]
                            ? 'bg-emerald-600 text-white'
                            : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {settings[item.key] ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 space-y-6">

              <div className="bg-[#2E3138] text-white rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF7EB3]">
                      Super Admin Maintenance
                    </p>
                    <h3 className="font-bold text-sm mt-0.5">
                      {lang === 'bn'
                        ? 'ডাটাবেস ব্যাকআপ ও সিড মেইনটেন্যান্স'
                        : 'Database Backup, Seed Check & Supabase Export'}
                    </h3>
                  </div>
                  {currentUser.role !== 'super_admin' && (
                    <span className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-semibold">
                      Super Admin Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-300">
                  Safely verify seed defaults (without erasing live orders), export sanitized PostgreSQL data as JSON, or download clean React + Node.js source for Vercel/Supabase.
                </p>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={runningReseed || currentUser.role !== 'super_admin'}
                    onClick={handleVerifySeedData}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{runningReseed ? 'Checking...' : 'Verify Seed Integrity'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={downloadingBackup || currentUser.role !== 'super_admin'}
                    onClick={handleDownloadJsonBackup}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{downloadingBackup ? 'Exporting...' : 'Export JSON Backup'}</span>
                  </button>
                  <a
                    href="/api/export/project-zip"
                    download="foodora-bd-project.zip"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Project ZIP</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'frontend' ? (
        <form onSubmit={handleSaveFrontendConfig} className="space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-base text-[#2E3138]">
                {lang === 'bn'
                  ? 'সম্পূর্ণ ফ্রন্টএন্ড ও স্টোরফ্রন্ট কন্ট্রোল সেন্টার'
                  : 'Complete Frontend & Storefront Control Center'}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {lang === 'bn'
                  ? 'যেকোনো সময় হোমপেজের ব্র্যান্ডিং, হিরো ব্যানার, সেকশন ভিজিবিলিটি, অ্যানাউন্সমেন্ট বার ও ফুটার পরিবর্তন করুন।'
                  : 'Control storefront branding, hero banner, section visibility toggles, announcement bar, promo ticket, and footer live.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetFrontendConfig}
                disabled={savingFrontend}
                className="px-3.5 py-2 rounded-xl border border-neutral-300 hover:border-neutral-400 text-xs font-semibold text-neutral-700"
              >
                {lang === 'bn' ? 'ডিফল্ট রিসেট' : 'Reset Defaults'}
              </button>
              <button
                type="submit"
                disabled={savingFrontend}
                className="px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold disabled:opacity-50"
              >
                {savingFrontend
                  ? 'Publishing...'
                  : lang === 'bn'
                  ? 'সেভ ও পাবলিশ করুন'
                  : 'Save & Publish to Frontend'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Brand, Theme Color & Section Visibility */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <h3 className="font-bold text-sm text-[#2E3138]">
                {lang === 'bn' ? 'ব্র্যান্ডিং ও সেকশন অন/অফ' : 'Brand Identity & Section Toggles'}
              </h3>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                <div className="flex items-center gap-3">
                  <img
                    src="/foodora-icon.svg"
                    alt="Foodora BD Icon"
                    className="w-11 h-11 rounded-xl shadow-xs border border-neutral-200 bg-white"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-[#2E3138]">Foodora BD Brand Icon</p>
                    <p className="text-neutral-500">Official SVG icon (`/foodora-icon.svg`)</p>
                  </div>
                </div>
                <a
                  href="/foodora-icon.svg"
                  download="foodora-bd-icon.svg"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download SVG</span>
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Brand Prefix</label>
                  <input
                    value={storefrontForm.brandPrefix}
                    onChange={(e) => setStorefrontForm({ ...storefrontForm, brandPrefix: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Brand Suffix</label>
                  <input
                    value={storefrontForm.brandSuffix}
                    onChange={(e) => setStorefrontForm({ ...storefrontForm, brandSuffix: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="text-xs space-y-1.5">
                <label className="block font-semibold text-neutral-700">Primary Theme Accent Color</label>
                <div className="flex flex-wrap items-center gap-2">
                  {['#E21B70', '#C4135E', '#059669', '#2563EB', '#EA580C', '#111827'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setStorefrontForm({ ...storefrontForm, accentColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`w-7 h-7 rounded-lg border-2 ${
                        storefrontForm.accentColor.toUpperCase() === hex.toUpperCase()
                          ? 'border-[#2E3138] scale-110'
                          : 'border-white'
                      }`}
                      title={hex}
                    />
                  ))}
                  <input
                    type="text"
                    value={storefrontForm.accentColor}
                    onChange={(e) => setStorefrontForm({ ...storefrontForm, accentColor: e.target.value })}
                    className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded-lg font-mono-nums text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs">
                <p className="font-bold text-neutral-700">Storefront Sections Visibility</p>
                {[
                  { key: 'showTopPartnerBar' as const, label: 'Top Partner / Rider / Admin Bar' },
                  { key: 'announcementBarEnabled' as const, label: 'Top Flash Announcement Bar' },
                  { key: 'showActiveDeliveryBar' as const, label: 'Active Delivery Order Tracking Bar' },
                  { key: 'showPickupTab' as const, label: 'Pickup Tab in Sub-Navigation' },
                  { key: 'showHero' as const, label: 'Homepage Hero Promotional Banner' },
                  { key: 'showPromoTicket' as const, label: 'Left Sidebar Promo Code Card' },
                  { key: 'showCuisineRibbon' as const, label: 'Explore by Cuisine Tiles' },
                  { key: 'showDailyDeals' as const, label: 'Daily Vouchers & Deals Row' },
                  { key: 'maintenanceMode' as const, label: 'Maintenance Notice Banner' },
                ].map((toggle) => {
                  const enabled = Boolean(storefrontForm[toggle.key]);
                  return (
                    <div
                      key={toggle.key}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200"
                    >
                      <span className="font-medium text-[#2E3138]">{toggle.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setStorefrontForm({ ...storefrontForm, [toggle.key]: !enabled })
                        }
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          enabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {enabled ? 'VISIBLE' : 'HIDDEN'}
                      </button>
                    </div>
                  );
                })}
                <div className="p-2.5 rounded-xl border border-neutral-200 space-y-1.5 bg-[#FFF9FB]">
                  <label className="block font-semibold text-[#2E3138]">
                    {lang === 'bn'
                      ? 'স্টোরফ্রন্ট পিনড অ্যাক্টিভ ডেলিভারি অর্ডার'
                      : 'Featured Storefront Active Delivery Order'}
                  </label>
                  <select
                    value={storefrontForm.featuredActiveOrderId || ''}
                    onChange={(e) =>
                      setStorefrontForm({
                        ...storefrontForm,
                        featuredActiveOrderId: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg bg-white text-xs font-medium"
                  >
                    <option value="">
                      {lang === 'bn'
                        ? 'অটো — সর্বশেষ অ্যাক্টিভ ডেলিভারি অর্ডার'
                        : 'Auto — Latest Active Delivery Order'}
                    </option>
                    {activeDeliveryOrders.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.orderNumber} · {o.restaurantName} ({o.deliveryArea})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Hero Banner, Announcement, Promo Ticket & Footer Editor */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3 text-xs">
                <h3 className="font-bold text-sm text-[#2E3138]">
                  {lang === 'bn' ? 'হিরো ব্যানার কন্ট্রোল' : 'Hero Banner Content & Image'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Badge (EN)</label>
                    <input
                      value={storefrontForm.heroBadgeEn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroBadgeEn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Badge (বাংলা)</label>
                    <input
                      value={storefrontForm.heroBadgeBn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroBadgeBn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Headline (EN)</label>
                    <input
                      value={storefrontForm.heroTitleEn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroTitleEn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Headline (বাংলা)</label>
                    <input
                      value={storefrontForm.heroTitleBn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroTitleBn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Subtitle (EN)</label>
                    <textarea
                      rows={2}
                      value={storefrontForm.heroSubEn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroSubEn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Subtitle (বাংলা)</label>
                    <textarea
                      rows={2}
                      value={storefrontForm.heroSubBn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroSubBn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero CTA Button (EN)</label>
                    <input
                      value={storefrontForm.heroBtnEn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroBtnEn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Hero CTA Button (বাংলা)</label>
                    <input
                      value={storefrontForm.heroBtnBn}
                      onChange={(e) => setStorefrontForm({ ...storefrontForm, heroBtnBn: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Hero Banner Image</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={storefrontForm.heroImageUrl}
                        onChange={(e) => setStorefrontForm({ ...storefrontForm, heroImageUrl: e.target.value })}
                        className="flex-1 min-w-[200px] px-3 py-2 border border-neutral-200 rounded-lg"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 hover:border-[#E21B70] cursor-pointer font-semibold">
                        <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                        <span>{uploadingPhoto ? 'Uploading...' : 'Upload Image'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadImage(f, (url) =>
                                setStorefrontForm((prev) => ({ ...prev, heroImageUrl: url }))
                              );
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3 text-xs">
                <h3 className="font-bold text-sm text-[#2E3138]">
                  {lang === 'bn'
                    ? 'অ্যানাউন্সমেন্ট বার, প্রোমো কার্ড ও ফুটার কন্ট্রোল'
                    : 'Announcement Bar, Sidebar Promo, Section Titles & Footer'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Announcement Ticker (EN)</label>
                    <input
                      value={storefrontForm.announcementTextEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, announcementTextEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Announcement Ticker (বাংলা)</label>
                    <input
                      value={storefrontForm.announcementTextBn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, announcementTextBn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Sidebar Promo Code</label>
                    <input
                      value={storefrontForm.promoCode}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, promoCode: e.target.value.toUpperCase() })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Sidebar Promo Text (EN)</label>
                    <input
                      value={storefrontForm.promoDescEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, promoDescEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Restaurants Heading (EN)</label>
                    <input
                      value={storefrontForm.restaurantsHeadingEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, restaurantsHeadingEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Daily Deals Heading (EN)</label>
                    <input
                      value={storefrontForm.dailyDealsTitleEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, dailyDealsTitleEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Dhaka Zones Line 1</label>
                    <input
                      value={storefrontForm.footerZonesLine1}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, footerZonesLine1: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Dhaka Zones Line 2</label>
                    <input
                      value={storefrontForm.footerZonesLine2}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, footerZonesLine2: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Footer Copyright</label>
                    <input
                      value={storefrontForm.footerCopyright}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, footerCopyright: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Maintenance Notice Text</label>
                    <input
                      value={storefrontForm.maintenanceMessage}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, maintenanceMessage: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Facebook Messenger Support URL
                    </label>
                    <input
                      type="url"
                      value={storefrontForm.messengerUrl}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, messengerUrl: e.target.value })
                      }
                      placeholder="https://www.facebook.com/messages/t/mdrakib.roni.1"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      WhatsApp Contact &amp; Support Number
                    </label>
                    <input
                      value={storefrontForm.whatsappNumber}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, whatsappNumber: e.target.value })
                      }
                      placeholder="+8801712345678"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Customer Support Email
                    </label>
                    <input
                      type="email"
                      value={storefrontForm.supportEmail}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, supportEmail: e.target.value })
                      }
                      placeholder="support@foodorabd.com"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Google SEO & Search Console Control Panel */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#E21B70]" />
                      <span>
                        {lang === 'bn'
                          ? 'Google SEO ও Search Console কনফিগারেশন'
                          : 'Google SEO, Meta Tags & Search Console'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Dynamic Schema.org Product/Restaurant JSON-LD, XML Sitemap, and Google Search Console verification.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <a
                      href="/sitemap.xml"
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold inline-flex items-center gap-1 hover:bg-emerald-100"
                    >
                      <span>/sitemap.xml</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href="/robots.txt"
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-700 font-semibold inline-flex items-center gap-1 hover:bg-neutral-200"
                    >
                      <span>/robots.txt</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Google SEO Title (EN)</label>
                    <input
                      value={storefrontForm.seoTitleEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, seoTitleEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Google SEO Title (BN)</label>
                    <input
                      value={storefrontForm.seoTitleBn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, seoTitleBn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Meta Description (EN)</label>
                    <textarea
                      rows={2}
                      value={storefrontForm.seoDescriptionEn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, seoDescriptionEn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Meta Description (BN)</label>
                    <textarea
                      rows={2}
                      value={storefrontForm.seoDescriptionBn}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, seoDescriptionBn: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Google Search Console Verification Code
                    </label>
                    <input
                      value={storefrontForm.googleSiteVerification}
                      onChange={(e) =>
                        setStorefrontForm({
                          ...storefrontForm,
                          googleSiteVerification: e.target.value,
                        })
                      }
                      placeholder="Paste content token from google-site-verification"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Target Keywords</label>
                    <input
                      value={storefrontForm.seoKeywords}
                      onChange={(e) =>
                        setStorefrontForm({ ...storefrontForm, seoKeywords: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Live Google Search Snippet Preview + Search Console Submission Helper */}
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Google Search Result Preview
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setCheckingSeo(true);
                          try {
                            const res = await apiFetch<{
                              ok: boolean;
                              sitemapUrl: string;
                              robotsUrl: string;
                              indexedUrls: number;
                              googleVerificationConfigured: boolean;
                              robotsOk: boolean;
                            }>('/api/admin/seo-check');
                            setSeoCheckResult(res);
                          } catch (err) {
                            setErrorMsg(
                              err instanceof Error ? err.message : 'SEO check failed'
                            );
                          } finally {
                            setCheckingSeo(false);
                          }
                        }}
                        disabled={checkingSeo}
                        className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[11px] font-semibold text-[#2E3138] hover:border-[#E21B70] disabled:opacity-50"
                      >
                        {checkingSeo ? 'Checking...' : 'Verify Sitemap & Robots'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sitemapUrl = `${
                            typeof window !== 'undefined'
                              ? window.location.origin
                              : 'https://foodorabd-3-nine.vercel.app'
                          }/sitemap.xml`;
                          navigator.clipboard?.writeText(sitemapUrl);
                          setCopiedSitemap(true);
                          setTimeout(() => setCopiedSitemap(false), 1800);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[11px] font-semibold text-[#2E3138] hover:border-[#E21B70] inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedSitemap ? 'Copied!' : 'Copy Sitemap URL'}</span>
                      </button>
                      <a
                        href="https://search.google.com/search-console/welcome"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-[#E21B70] text-white text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#C4135E]"
                      >
                        <span>Open Google Search Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-700 truncate">
                    {typeof window !== 'undefined'
                      ? window.location.origin
                      : 'https://foodorabd-3-nine.vercel.app'}
                    /
                  </p>
                  <p className="text-sm font-semibold text-[#1a0dab] truncate">
                    {lang === 'bn' ? storefrontForm.seoTitleBn : storefrontForm.seoTitleEn}
                  </p>
                  <p className="text-xs text-neutral-600 line-clamp-2">
                    {lang === 'bn' ? storefrontForm.seoDescriptionBn : storefrontForm.seoDescriptionEn}
                  </p>
                  {seoCheckResult && (
                    <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center gap-3 text-[11px] text-neutral-700">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Sitemap Live ({seoCheckResult.indexedUrls} URLs)
                      </span>
                      <span>·</span>
                      <span>Robots.txt: {seoCheckResult.robotsOk ? 'Valid' : 'Missing'}</span>
                      <span>·</span>
                      <span>
                        Verification Tag:{' '}
                        {seoCheckResult.googleVerificationConfigured
                          ? 'Configured'
                          : 'Paste token above & Save'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      ) : tab === 'products' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={lang === 'bn' ? 'পণ্য বা ক্যাটাগরি খুঁজুন...' : 'Search product name or category...'}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-200 rounded-xl"
                />
              </div>
              <select
                value={productOwnershipFilter}
                onChange={(e) =>
                  setProductOwnershipFilter(e.target.value as 'all' | 'own' | 'partner')
                }
                aria-label="Filter products by ownership"
                className="px-3 py-2 text-xs border border-neutral-200 rounded-xl bg-white font-semibold"
              >
                <option value="all">
                  {lang === 'bn' ? 'সব মালিকানা (নিজস্ব + পার্টনার)' : 'All Stores (Own + Partner)'}
                </option>
                <option value="own">
                  {lang === 'bn' ? 'আমার নিজস্ব স্টোরের পণ্য' : 'My Own Restaurant Products'}
                </option>
                <option value="partner">
                  {lang === 'bn' ? 'পার্টনার রেস্টুরেন্টের পণ্য' : 'Partner Restaurant Products'}
                </option>
              </select>
              <select
                value={productRestFilter}
                onChange={(e) => setProductRestFilter(e.target.value)}
                aria-label="Filter products by restaurant"
                className="px-3 py-2 text-xs border border-neutral-200 rounded-xl bg-white"
              >
                <option value="all">{lang === 'bn' ? 'সব রেস্টুরেন্ট' : 'All Restaurants'}</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {myRestaurantIds.has(r.id) ? '★ ' : ''}
                    {lang === 'bn' ? r.nameBn : r.name}
                  </option>
                ))}
              </select>
              <select
                value={productVisibilityFilter}
                onChange={(e) =>
                  setProductVisibilityFilter(e.target.value as 'all' | 'visible' | 'hidden')
                }
                aria-label="Filter products by storefront visibility"
                className="px-3 py-2 text-xs border border-neutral-200 rounded-xl bg-white font-semibold"
              >
                <option value="all">
                  {lang === 'bn' ? 'সব দৃশ্যমানতা' : `All Visibility (${products.length})`}
                </option>
                <option value="visible">
                  {lang === 'bn'
                    ? 'ওয়েবসাইটে দৃশ্যমান'
                    : `Shown on Website (${products.filter((p) => p.isVisibleOnStorefront !== false && p.isAvailable !== false).length})`}
                </option>
                <option value="hidden">
                  {lang === 'bn'
                    ? 'ওয়েবসাইট থেকে লুকানো'
                    : `Hidden from Website (${products.filter((p) => p.isVisibleOnStorefront === false || p.isAvailable === false).length})`}
                </option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => openCreateProductModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'bn' ? 'নতুন পণ্য আপলোড করুন' : 'Upload / Add Product'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProducts.map((item) => {
              const shownOnSite = item.isVisibleOnStorefront !== false && item.isAvailable !== false;
              const isMine = myRestaurantIds.has(item.restaurantId);
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    shownOnSite ? 'border-neutral-200' : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className={`w-16 h-16 rounded-xl object-cover shrink-0 bg-neutral-100 ${
                        shownOnSite ? '' : 'opacity-60 grayscale'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            isMine
                              ? 'bg-[#FFF0F6] text-[#E21B70] border border-[#E21B70]/25'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isMine ? 'My Store' : 'Partner'}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                          {item.category}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            shownOnSite
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {shownOnSite
                            ? lang === 'bn'
                              ? 'সাইটে দৃশ্যমান'
                              : 'Shown on Site'
                            : lang === 'bn'
                            ? 'লুকানো'
                            : 'Hidden from Site'}
                        </span>
                        {item.isPopular && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FFF0F6] text-[#E21B70]">
                            Featured
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm text-[#2E3138] truncate mt-0.5">
                        {lang === 'bn' ? item.nameBn : item.name}
                      </h3>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {restaurantNameMap.get(item.restaurantId) || `Rest #${item.restaurantId}`}
                      </p>
                      <p className="text-xs font-bold text-[#E21B70] tabular-nums">
                        {formatBdt(item.discountPrice ?? item.price, lang)}
                        {item.discountPrice && (
                          <span className="ml-1.5 text-neutral-400 line-through font-normal">
                            {formatBdt(item.price, lang)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickProductToggle(item, 'isVisibleOnStorefront')}
                      aria-label={
                        shownOnSite ? `Hide ${item.name} from website` : `Show ${item.name} on website`
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1 ${
                        shownOnSite
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                          : 'border-red-200 bg-red-50 text-red-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                      }`}
                    >
                      {shownOnSite ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'দৃশ্যমান' : 'Shown'}</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'লুকানো' : 'Hidden'}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickProductToggle(item, 'isPopular')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                        item.isPopular
                          ? 'border-[#E21B70]/30 bg-[#FFF0F6] text-[#E21B70]'
                          : 'border-neutral-200 text-neutral-600'
                      }`}
                    >
                      {item.isPopular ? 'Featured' : 'Feature'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditProductModal(item)}
                      aria-label={`Edit product ${item.name}`}
                      className="px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickProductToggle(item, 'inStock')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                        item.inStock
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {item.inStock ? 'In Stock' : 'Out'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(item)}
                      aria-label={`Delete product ${item.name}`}
                      className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'restaurants' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { id: 'all' as const, label: `All Stores (${restaurants.length})` },
                { id: 'own' as const, label: `My Own Store(s) (${myRestaurants.length})` },
                {
                  id: 'partner' as const,
                  label: `Partner Restaurants (${restaurants.length - myRestaurants.length})`,
                },
              ].map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setRestaurantOwnershipFilter(flt.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-semibold border transition-colors ${
                    restaurantOwnershipFilter === flt.id
                      ? 'bg-[#2E3138] text-white border-[#2E3138]'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openCreateRestaurantModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'bn' ? 'আমার / নতুন রেস্টুরেন্ট চালু করুন' : 'Launch Own / New Restaurant'}</span>
            </button>
          </div>

          {/* Dhaka Restaurant Delivery Zone Structure Filter (ZONE 01 - ZONE 12) */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                {lang === 'bn'
                  ? 'ঢাকা রেস্টুরেন্ট ডেলিভারি জোন কাঠামো (ZONE 01 – ZONE 12)'
                  : 'Dhaka Restaurant Delivery Zone Structure (ZONE 01 – ZONE 12)'}
              </p>
              {restaurantZoneFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setRestaurantZoneFilter('all')}
                  className="text-[11px] font-semibold text-[#E21B70] hover:underline"
                >
                  {lang === 'bn' ? 'সব জোন দেখান' : 'Reset Zone Filter'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRestaurantZoneFilter('all')}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                  restaurantZoneFilter === 'all'
                    ? 'bg-[#2E3138] text-white border-[#2E3138]'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {lang === 'bn' ? 'সব জোন' : 'All Zones'}
              </button>
              {DHAKA_DELIVERY_ZONES.map((z) => (
                <button
                  key={z.code}
                  type="button"
                  onClick={() => setRestaurantZoneFilter(z.code)}
                  title={z.summary}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                    restaurantZoneFilter === z.code
                      ? 'bg-[#E21B70] text-white border-[#E21B70]'
                      : 'bg-[#FFF9FB] text-neutral-700 border-neutral-200 hover:border-[#E21B70]/50'
                  }`}
                >
                  {z.code} — {lang === 'bn' ? z.nameBn : z.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRestaurantZoneFilter('NATIONWIDE')}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                  restaurantZoneFilter === 'NATIONWIDE'
                    ? 'bg-[#E21B70] text-white border-[#E21B70]'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {lang === 'bn' ? 'অন্যান্য জেলা / কাস্টম' : 'Other / Custom Area'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredRestaurants.map((rest) => {
              const isMine = myRestaurantIds.has(rest.id);
              return (
                <div
                  key={rest.id}
                  className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <img
                        src={rest.coverUrl}
                        alt={rest.name}
                        className="w-14 h-14 rounded-xl object-cover bg-neutral-100"
                      />
                      {rest.logoUrl && (
                        <img
                          src={rest.logoUrl}
                          alt={`${rest.name} logo`}
                          className="w-6 h-6 rounded-lg object-cover border-2 border-white shadow-xs bg-white absolute -bottom-1 -right-1"
                        />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-[#2E3138]">
                          {rest.name} ({rest.nameBn})
                        </h3>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            isMine
                              ? 'bg-[#FFF0F6] text-[#E21B70] border border-[#E21B70]/25'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isMine ? 'My Store' : 'Partner'}
                        </span>
                        <span
                          className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                            rest.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : rest.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {rest.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {rest.area} · {rest.cuisine} · Fee ৳{rest.deliveryFee} · Min ৳{rest.minOrder} · Mode:{' '}
                        {rest.deliveryMode}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {onOpenVendorStore && (
                      <button
                        type="button"
                        onClick={() => onOpenVendorStore(rest.id)}
                        className="px-2.5 py-1 rounded border border-[#E21B70]/40 bg-[#FFF0F6] text-[#E21B70] hover:bg-[#FFE4EF] font-semibold inline-flex items-center gap-1"
                      >
                        <Store className="w-3 h-3" />
                        <span>{lang === 'bn' ? 'মেনু ও API হাব' : 'Menu & API Hub'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditRestaurantModal(rest)}
                      aria-label={`Edit restaurant ${rest.name}`}
                      className="px-2.5 py-1 rounded border border-neutral-200 hover:border-[#E21B70] font-semibold inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>

                  <label className="inline-flex items-center gap-1 text-neutral-600">
                    <span>Comm %</span>
                    <input
                      type="text"
                      defaultValue={rest.commissionRate}
                      onBlur={(e) => {
                        if (e.target.value !== rest.commissionRate) {
                          handleUpdateRestaurant(rest.id, { commissionRate: e.target.value });
                        }
                      }}
                      className="w-14 px-2 py-1 border border-neutral-200 rounded text-center tabular-nums"
                    />
                  </label>

                  <select
                    value={rest.subscriptionPlan}
                    onChange={(e) =>
                      handleUpdateRestaurant(rest.id, {
                        subscriptionPlan: e.target.value as 'free' | 'basic' | 'premium' | 'enterprise',
                      })
                    }
                    aria-label={`Plan for ${rest.name}`}
                    className="px-2 py-1 border border-neutral-200 rounded bg-white"
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleUpdateRestaurant(rest.id, { isSponsored: !rest.isSponsored })}
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      rest.isSponsored
                        ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                        : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    {rest.isSponsored ? 'Sponsored' : 'Sponsor'}
                  </button>

                  {rest.status !== 'approved' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateRestaurant(rest.id, { status: 'approved' })}
                      className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold"
                    >
                      {lang === 'bn' ? 'অনুমোদন দিন' : 'Approve'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUpdateRestaurant(rest.id, { status: 'suspended' })}
                      className="px-3 py-1 rounded border border-red-200 text-red-600 font-semibold"
                    >
                      {lang === 'bn' ? 'স্থগিত করুন' : 'Suspend'}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'orders' ? (
        <div className="space-y-5">
          {/* Active Delivery Order Control Center */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Bike className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[#2E3138] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      {lang === 'bn'
                        ? `অ্যাক্টিভ ডেলিভারি অর্ডার কন্ট্রোল (${activeDeliveryOrders.length})`
                        : `Active Delivery Order Control (${activeDeliveryOrders.length})`}
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {lang === 'bn'
                      ? 'চলমান ডেলিভারি অর্ডার মনিটর করুন, রাইডার অ্যাসাইন করুন এবং হোমপেজ লাইভ ট্র্যাকিং বার নিয়ন্ত্রণ করুন।'
                      : 'Monitor live delivery orders, assign riders, track ETA on map, and control the Storefront Active Delivery Order bar.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={savingActiveBarToggle}
                  onClick={() =>
                    handleQuickStorefrontPatch(
                      { showActiveDeliveryBar: !storefrontForm.showActiveDeliveryBar },
                      !storefrontForm.showActiveDeliveryBar
                        ? lang === 'bn'
                          ? 'স্টোরফ্রন্টে Active Delivery Order বার চালু করা হয়েছে।'
                          : 'Storefront Active Delivery Order bar enabled.'
                        : lang === 'bn'
                        ? 'স্টোরফ্রন্টে Active Delivery Order বার বন্ধ করা হয়েছে।'
                        : 'Storefront Active Delivery Order bar hidden.'
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                    storefrontForm.showActiveDeliveryBar
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                  }`}
                >
                  {lang === 'bn'
                    ? `হোমপেজ Active Delivery Bar: ${storefrontForm.showActiveDeliveryBar ? 'ON' : 'OFF'}`
                    : `Storefront Active Delivery Bar: ${storefrontForm.showActiveDeliveryBar ? 'ON' : 'OFF'}`}
                </button>
              </div>
            </div>

            {activeDeliveryOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500 text-center">
                {lang === 'bn'
                  ? 'এই মুহূর্তে কোনো চলমান ডেলিভারি অর্ডার নেই।'
                  : 'No active delivery orders in progress right now.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeDeliveryOrders.map((o) => {
                  const isPinned = String(storefrontForm.featuredActiveOrderId || '') === String(o.id);
                  return (
                    <div
                      key={o.id}
                      className={`rounded-xl border p-3.5 space-y-2.5 text-xs ${
                        isPinned
                          ? 'border-[#E21B70] bg-gradient-to-br from-[#FFF0F6] via-white to-emerald-50'
                          : 'border-emerald-200/80 bg-[#F9FFFC]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono-nums font-bold text-[#2E3138] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <span>{o.orderNumber}</span>
                          </p>
                          <p className="font-semibold text-neutral-700 truncate mt-0.5">
                            {o.restaurantName}
                          </p>
                          <p className="text-[11px] text-neutral-500 truncate">
                            {o.customerName} · {o.deliveryArea} · ~{o.estimatedMinutes || 25} min ETA
                          </p>
                        </div>
                        <span className="font-bold text-[#E21B70] shrink-0">
                          {formatBdt(o.totalAmount, lang)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={o.status}
                          aria-label={`Active order status for ${o.orderNumber}`}
                          onChange={(e) =>
                            handleOrderOverride(o.id, { status: e.target.value as OrderStatus })
                          }
                          className="px-2 py-1 border border-neutral-200 rounded-lg bg-white font-semibold text-[#2E3138]"
                        >
                          {ORDER_STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                        <select
                          value={o.riderUid || ''}
                          aria-label={`Assign rider for active ${o.orderNumber}`}
                          onChange={(e) =>
                            handleOrderOverride(o.id, {
                              status: o.status === 'ready' && e.target.value ? 'rider_assigned' : o.status,
                              riderUid: e.target.value || null,
                            })
                          }
                          className="px-2 py-1 border border-neutral-200 rounded-lg bg-white"
                        >
                          <option value="">Unassigned</option>
                          {riders.map((r) => (
                            <option key={r.uid} value={r.uid}>
                              {r.fullName} ({r.zone})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={savingActiveBarToggle}
                          onClick={() =>
                            handleQuickStorefrontPatch(
                              {
                                showActiveDeliveryBar: true,
                                featuredActiveOrderId: isPinned ? '' : String(o.id),
                              },
                              isPinned
                                ? 'Unpinned active order (auto mode restored).'
                                : `Pinned ${o.orderNumber} to Storefront Active Delivery Bar.`
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                            isPinned
                              ? 'bg-[#E21B70] text-white border-[#E21B70]'
                              : 'bg-white text-neutral-700 border-neutral-200 hover:border-[#E21B70]'
                          }`}
                        >
                          {isPinned
                            ? lang === 'bn'
                              ? 'স্টোরফ্রন্টে পিনড'
                              : 'Pinned to Bar'
                            : lang === 'bn'
                            ? 'বার-এ পিন করুন'
                            : 'Pin to Storefront'}
                        </button>
                        {onTrackOrder && (
                          <button
                            type="button"
                            onClick={() => onTrackOrder(o.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#2E3138] hover:bg-black text-white font-semibold inline-flex items-center gap-1"
                          >
                            <LocateFixed className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'লাইভ ট্র্যাক' : 'Track Live'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {[
                  {
                    id: 'active' as const,
                    label:
                      lang === 'bn'
                        ? `অ্যাক্টিভ ডেলিভারি (${activeDeliveryOrders.length})`
                        : `Active Delivery Orders (${activeDeliveryOrders.length})`,
                  },
                  {
                    id: 'all' as const,
                    label: lang === 'bn' ? `সব অর্ডার (${orders.length})` : `All Orders (${orders.length})`,
                  },
                  {
                    id: 'closed' as const,
                    label:
                      lang === 'bn'
                        ? `সম্পন্ন / বাতিল (${orders.length - activeDeliveryOrders.length})`
                        : `Completed / Cancelled (${orders.length - activeDeliveryOrders.length})`,
                  },
                ].map((flt) => (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => setOrderFilter(flt.id)}
                    className={`px-3 py-1.5 rounded-xl border font-semibold transition-colors ${
                      orderFilter === flt.id
                        ? 'bg-[#E21B70] text-white border-[#E21B70]'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {flt.label}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full text-xs text-left tabular-nums">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2">Order</th>
                  <th className="py-2">Restaurant</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Status Control</th>
                  <th className="py-2">Assign Rider</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100">
                    <td className="py-2.5 font-mono-nums font-semibold">
                      {o.orderNumber}
                      <div className="text-[11px] text-neutral-400">
                        {o.paymentMethod.toUpperCase()} ({o.paymentStatus})
                      </div>
                    </td>
                    <td className="py-2.5">{o.restaurantName}</td>
                    <td className="py-2.5">
                      {o.customerName}
                      <div className="text-neutral-400">{o.deliveryArea}</div>
                    </td>
                    <td className="py-2.5">
                      <select
                        value={o.status}
                        aria-label={`Order status for ${o.orderNumber}`}
                        onChange={(e) =>
                          handleOrderOverride(o.id, { status: e.target.value as OrderStatus })
                        }
                        className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold text-[#2E3138]"
                      >
                        {ORDER_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5">
                      <select
                        value={o.riderUid || ''}
                        aria-label={`Assign rider for ${o.orderNumber}`}
                        onChange={(e) =>
                          handleOrderOverride(o.id, {
                            status: o.status === 'ready' && e.target.value ? 'rider_assigned' : o.status,
                            riderUid: e.target.value || null,
                          })
                        }
                        className="px-2 py-1 border border-neutral-200 rounded bg-white"
                      >
                        <option value="">Unassigned</option>
                        {riders.map((r) => (
                          <option key={r.uid} value={r.uid}>
                            {r.fullName} ({r.zone})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-right font-semibold">{formatBdt(o.totalAmount, lang)}</td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      {onTrackOrder && (
                        <button
                          type="button"
                          onClick={() => onTrackOrder(o.id)}
                          className="px-2 py-1 rounded border border-neutral-200 text-[#2E3138] font-semibold hover:border-[#E21B70]"
                        >
                          Track
                        </button>
                      )}
                      {o.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleRefundOrder(o.id)}
                          className="px-2.5 py-1 rounded border border-red-200 text-red-600 font-semibold hover:bg-red-50"
                        >
                          {lang === 'bn' ? 'রিফান্ড ও রিভার্স' : 'Cancel & Refund'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'finance' ? (
        <div className="space-y-6">
          {/* Delivery Charge, Zone/Distance Pricing & Rider Commission Configurator */}
          <form
            onSubmit={handleSaveDeliveryFinancialConfig}
            data-testid="admin-delivery-financial-config-form"
            className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-base text-[#2E3138]">
                  {lang === 'bn'
                    ? 'ডেলিভারি চার্জ (ঢাকা জোন ও দূরত্ব) এবং রাইডার কমিশন নীতি'
                    : 'Delivery Charge (Zone & Distance) & Rider Commission Configuration'}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {lang === 'bn'
                    ? 'গ্রাহক অনলাইনে খাবারের দাম দেবে এবং রাইডার হাতে ডেলিভারি চার্জ নেবে। Foodora কমিশন রাইডার ওয়ালেটে বকেয়া থাকবে।'
                    : 'Customers pay food price online; riders collect delivery charge in cash and owe Foodora commission in their wallet.'}
                </p>
              </div>
              <button
                type="submit"
                disabled={savingFinancialConfig}
                className="px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold disabled:opacity-50"
              >
                {savingFinancialConfig
                  ? lang === 'bn'
                    ? 'সংরক্ষণ হচ্ছে...'
                    : 'Saving Rules...'
                  : lang === 'bn'
                  ? 'নীতি সংরক্ষণ করুন'
                  : 'Save Pricing & Commission Rules'}
              </button>
            </div>

            {/* 12 Dhaka Zones Delivery Charge Grid */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-600 mb-2">
                {lang === 'bn'
                  ? 'ঢাকার ১২টি জোনের ডেলিভারি চার্জ (৳)'
                  : 'Dhaka 12-Zone Base Delivery Charge (৳)'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {DHAKA_ZONE_PRESETS.map((z) => (
                  <div
                    key={z.code}
                    className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#2E3138] truncate">{z.code}</p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {lang === 'bn' ? z.nameBn : z.name}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      aria-label={`Delivery fee for ${z.label}`}
                      value={deliveryFinancialConfig.zoneFees[z.code] ?? z.defaultDeliveryFee}
                      onChange={(e) => {
                        const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          zoneFees: { ...prev.zoneFees, [z.code]: val },
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded-lg border border-neutral-300 bg-white text-right font-bold tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Distance Pricing Rules */}
              <div className="rounded-xl border border-neutral-200 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#2E3138]">
                    {lang === 'bn' ? 'দূরত্ব-ভিত্তিক চার্জ' : 'Distance Pricing Rules'}
                  </h3>
                  <label className="inline-flex items-center gap-1.5 font-semibold text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deliveryFinancialConfig.distancePricing.enabled}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          distancePricing: {
                            ...prev.distancePricing,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>{lang === 'bn' ? 'সক্রিয়' : 'Enabled'}</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Base Km</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={deliveryFinancialConfig.distancePricing.baseDistanceKm}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          distancePricing: {
                            ...prev.distancePricing,
                            baseDistanceKm: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Base Fee (৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={deliveryFinancialConfig.distancePricing.baseFee}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          distancePricing: {
                            ...prev.distancePricing,
                            baseFee: Math.max(0, Math.round(Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Per Extra Km (৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={deliveryFinancialConfig.distancePricing.perKmFee}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          distancePricing: {
                            ...prev.distancePricing,
                            perKmFee: Math.max(0, Math.round(Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Min / Max (৳)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        value={deliveryFinancialConfig.distancePricing.minFee}
                        onChange={(e) =>
                          setDeliveryFinancialConfig((prev) => ({
                            ...prev,
                            distancePricing: {
                              ...prev.distancePricing,
                              minFee: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            },
                          }))
                        }
                        className="w-1/2 px-2 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                      />
                      <input
                        type="number"
                        min={10}
                        value={deliveryFinancialConfig.distancePricing.maxFee}
                        onChange={(e) =>
                          setDeliveryFinancialConfig((prev) => ({
                            ...prev,
                            distancePricing: {
                              ...prev.distancePricing,
                              maxFee: Math.max(10, Math.round(Number(e.target.value) || 10)),
                            },
                          }))
                        }
                        className="w-1/2 px-2 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rider Earning vs Foodora Commission Split */}
              <div className="rounded-xl border border-neutral-200 p-4 space-y-3 text-xs">
                <h3 className="font-bold text-[#2E3138]">
                  {lang === 'bn'
                    ? 'রাইডার আয় ও Foodora কমিশন'
                    : 'Rider Earning & Foodora Commission'}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Rule Mode</label>
                    <select
                      value={deliveryFinancialConfig.riderEarningRule.mode}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          riderEarningRule: {
                            ...prev.riderEarningRule,
                            mode: e.target.value === 'fixed' ? 'fixed' : 'percentage',
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white font-semibold"
                    >
                      <option value="percentage">Percentage of Delivery Fee (%)</option>
                      <option value="fixed">Fixed Rider Earning (৳)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">
                      {deliveryFinancialConfig.riderEarningRule.mode === 'percentage'
                        ? 'Rider Share (%)'
                        : 'Rider Fixed (৳)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={deliveryFinancialConfig.riderEarningRule.mode === 'percentage' ? 100 : 1000}
                      value={deliveryFinancialConfig.riderEarningRule.value}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          riderEarningRule: {
                            ...prev.riderEarningRule,
                            value: Math.max(0, Math.round(Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 font-bold tabular-nums"
                    />
                  </div>
                </div>
                {(() => {
                  const sampleSplit = calculateSplitOrderFinancials({
                    subtotal: 500,
                    discountAmount: 0,
                    deliveryFee: 60,
                    serviceFee: 0,
                    commissionType: 'percentage',
                    commissionRate: 15,
                    fixedCommission: 0,
                    paymentMethod: 'bkash',
                    riderEarningRule: deliveryFinancialConfig.riderEarningRule,
                  });
                  return (
                    <div className="rounded-lg bg-purple-50 border border-purple-200 p-2.5 space-y-1 text-[11px] text-purple-950 tabular-nums">
                      <p className="font-bold">Live Preview on ৳60 Delivery Charge:</p>
                      <p>
                        Cash Collected: <strong>৳60</strong> → Rider Keeps:{' '}
                        <strong className="text-emerald-700">
                          ৳{sampleSplit.riderEarningAmount}
                        </strong>{' '}
                        · Owed to Foodora:{' '}
                        <strong className="text-[#E21B70]">
                          ৳{sampleSplit.foodoraDeliveryCommission}
                        </strong>
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Settlement Rules */}
              <div className="rounded-xl border border-neutral-200 p-4 space-y-2.5 text-xs">
                <h3 className="font-bold text-[#2E3138]">
                  {lang === 'bn' ? 'কমিশন সেটেলমেন্ট নিয়ম' : 'Commission Settlement Rules'}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">
                      Max Outstanding Cap (৳)
                    </label>
                    <input
                      type="number"
                      min={50}
                      value={deliveryFinancialConfig.settlementRules.maxOutstandingLimit}
                      onChange={(e) =>
                        setDeliveryFinancialConfig((prev) => ({
                          ...prev,
                          settlementRules: {
                            ...prev.settlementRules,
                            maxOutstandingLimit: Math.max(
                              50,
                              Math.round(Number(e.target.value) || 50)
                            ),
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-1">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deliveryFinancialConfig.settlementRules.autoBlockDispatchAboveLimit}
                        onChange={(e) =>
                          setDeliveryFinancialConfig((prev) => ({
                            ...prev,
                            settlementRules: {
                              ...prev.settlementRules,
                              autoBlockDispatchAboveLimit: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Block Dispatch Above Cap</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deliveryFinancialConfig.settlementRules.requireCashConfirmation}
                        onChange={(e) =>
                          setDeliveryFinancialConfig((prev) => ({
                            ...prev,
                            settlementRules: {
                              ...prev.settlementRules,
                              requireCashConfirmation: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Require Cash Confirm Checkbox</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-500 mb-1">
                    Rider Settlement Instructions (No Automated Payouts)
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryFinancialConfig.settlementRules.settlementInstructions}
                    onChange={(e) =>
                      setDeliveryFinancialConfig((prev) => ({
                        ...prev,
                        settlementRules: {
                          ...prev.settlementRules,
                          settlementInstructions: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[11px]"
                  />
                </div>
              </div>
            </div>
          </form>

          {/* Complete Financial Records: Split Payment Transactions & Rider Wallet Ledger */}
          <div
            data-testid="admin-split-financial-records"
            className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm text-[#2E3138]">
                  {lang === 'bn'
                    ? 'সম্পূর্ণ পেমেন্ট ও ডেলিভারি লেনদেন রেকর্ড'
                    : 'Complete Split Payment & Rider Commission Records'}
                </h2>
                <p className="text-[11px] text-neutral-500">
                  {lang === 'bn'
                    ? 'অনলাইন ফুড পেমেন্ট, রাইডার ক্যাশ সংগ্রহ, রিফান্ড/রিভার্সাল এবং রাইডার কমিশন সেটেলমেন্ট'
                    : 'Separate records for Online Food Payments, Delivery Cash Collections, Refunds/Reversals & Rider Settlements'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  { id: 'all' as const, label: `All (${paymentTransactions.length})` },
                  { id: 'food_payment' as const, label: 'Food Payments (Online)' },
                  { id: 'delivery_cash' as const, label: 'Delivery Cash (Rider)' },
                  { id: 'reversals' as const, label: 'Refunds & Reversals' },
                  {
                    id: 'settlements' as const,
                    label: `Rider Wallet Ledger (${riderWalletLedger.length})`,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTxFilter(f.id)}
                    className={`px-3 py-1 rounded-lg font-semibold border ${
                      txFilter === f.id
                        ? 'bg-[#E21B70] text-white border-[#E21B70]'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {txFilter === 'settlements' ? (
              <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                <table className="w-full text-xs text-left tabular-nums">
                  <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Rider UID</th>
                      <th className="px-3 py-2">Entry Type</th>
                      <th className="px-3 py-2">Order / Ref</th>
                      <th className="px-3 py-2 text-right">Cash Collected</th>
                      <th className="px-3 py-2 text-right">Rider Share</th>
                      <th className="px-3 py-2 text-right">Commission +/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {riderWalletLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-neutral-500">
                          No rider wallet entries recorded yet.
                        </td>
                      </tr>
                    ) : (
                      riderWalletLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2 font-mono text-[11px]">{entry.riderUid}</td>
                          <td className="px-3 py-2 font-semibold capitalize">
                            {entry.entryType.replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-2 text-neutral-600">
                            {entry.orderNumber || entry.referenceId || `#${entry.id}`}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatBdt(entry.cashCollected, lang)}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-700 font-semibold">
                            {formatBdt(entry.riderEarningDelta, lang)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {entry.commissionSettledDelta > 0 ? (
                              <span className="text-emerald-700">
                                Settled {formatBdt(entry.commissionSettledDelta, lang)}
                              </span>
                            ) : (
                              <span>{formatBdt(entry.commissionOwedDelta, lang)}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                <table className="w-full text-xs text-left tabular-nums">
                  <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Transaction Kind</th>
                      <th className="px-3 py-2">Method &amp; Flow</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(() => {
                      const rows = paymentTransactions.filter((t) => {
                        if (txFilter === 'food_payment') return t.txKind === 'food_payment';
                        if (txFilter === 'delivery_cash') return t.txKind === 'delivery_cash';
                        if (txFilter === 'reversals') {
                          return t.txKind === 'food_refund' || t.txKind === 'delivery_reversal';
                        }
                        return true;
                      });
                      if (rows.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                              No split payment transactions in this filter yet.
                            </td>
                          </tr>
                        );
                      }
                      return rows.map((tx) => (
                        <tr key={tx.id}>
                          <td className="px-3 py-2 font-mono font-semibold text-[#2E3138]">
                            {tx.orderNumber}
                          </td>
                          <td className="px-3 py-2 capitalize font-semibold">
                            {tx.txKind.replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-2 text-neutral-600">
                            {tx.paymentMethod.toUpperCase()} · {tx.payerRole} → {tx.recipientRole}
                            {tx.gatewayTxId ? ` (${tx.gatewayTxId})` : ''}
                          </td>
                          <td className="px-3 py-2 uppercase font-bold text-[10px]">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                tx.status === 'succeeded'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : tx.status === 'refunded' || tx.status === 'cancelled'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-[#2E3138]">
                            {formatBdt(tx.amount, lang)}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
              <h2 className="font-bold text-sm text-[#2E3138] mb-3">
                {lang === 'bn' ? 'প্ল্যাটফর্ম কমিশন লেজার' : 'Platform Commission Ledger'}
              </h2>
              <table className="w-full text-xs text-left tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="py-2">Entry</th>
                    <th className="py-2">Note</th>
                    <th className="py-2 text-right">Commission</th>
                    <th className="py-2 text-right">Vendor Net</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-b border-neutral-100">
                      <td className="py-2 font-semibold uppercase">{l.entryType.replace('_', ' ')}</td>
                      <td className="py-2 text-neutral-600">{l.note}</td>
                      <td
                        className={`py-2 text-right font-bold ${
                          l.commissionAmount < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatBdt(l.commissionAmount, lang)}
                      </td>
                      <td className="py-2 text-right">{formatBdt(l.netRestaurantAmount, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h2 className="font-bold text-sm text-[#2E3138]">
                {lang === 'bn' ? 'রেস্টুরেন্ট পেআউট অনুমোদন' : 'Restaurant Payout Queue'}
              </h2>
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#2E3138]">{p.restaurantName}</p>
                    <p className="text-neutral-500 tabular-nums">
                      {formatBdt(p.amount, lang)} · {p.method.toUpperCase()} ({p.accountNumber})
                    </p>
                  </div>
                  {p.status === 'pending' ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePayoutDecision(p.id, 'paid')}
                        className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                      >
                        Pay
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePayoutDecision(p.id, 'rejected')}
                        className="px-2.5 py-1 rounded border border-red-200 text-red-600 font-semibold"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="font-bold uppercase text-neutral-600">{p.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : tab === 'coupons' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateCoupon}
            className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-3 h-fit"
          >
            <h2 className="font-bold text-sm text-[#2E3138]">
              {lang === 'bn' ? 'নতুন প্রোমো কুপন তৈরি করুন' : 'Create Marketplace Coupon'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Code (e.g. EID100)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg uppercase"
              />
              <select
                value={couponType}
                onChange={(e) => setCouponType(e.target.value as 'percentage' | 'fixed' | 'free_delivery')}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
              >
                <option value="fixed">Fixed BDT Off</option>
                <option value="percentage">Percentage Off</option>
                <option value="free_delivery">Free Delivery</option>
              </select>
            </div>
            <input
              required
              placeholder="Campaign Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
              <input
                type="number"
                placeholder="Min Order"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
            >
              {lang === 'bn' ? 'কুপন প্রকাশ করুন' : 'Publish Coupon'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 space-y-2.5">
            <h3 className="font-bold text-sm text-[#2E3138]">
              Marketplace Coupons ({coupons.length})
            </h3>
            {coupons.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 pb-2.5"
              >
                <div>
                  <span className="font-mono-nums font-bold text-[#E21B70]">{c.code}</span> — {c.title}
                  <p className="text-[11px] text-neutral-400 tabular-nums">
                    Type: {c.type} · Value: {c.value} · Min ৳{c.minOrder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleCoupon(c)}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${
                      c.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCoupon(c.id)}
                    aria-label={`Delete coupon ${c.code}`}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'users' ? (
        <div className="space-y-5">
          {/* Admin & Super Admin Governance Policy */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-[#E21B70] shrink-0" />
              <div>
                <p className="font-bold text-[#2E3138]">
                  {lang === 'bn'
                    ? 'সুপার অ্যাডমিন ও রোল অ্যাক্সেস কন্ট্রোল'
                    : 'Admin & Super Admin Access Governance'}
                </p>
                <p className="text-neutral-600 mt-0.5">
                  {lang === 'bn'
                    ? `পাবলিক সাইট থেকে কেউ সুপার অ্যাডমিন হতে পারবে না। শুধুমাত্র যাচাইকৃত সুপার অ্যাডমিন (${PRIMARY_SUPER_ADMIN_EMAIL}, ${ADMIN_PIN_DEFAULT_EMAIL}) অ্যাডমিন/সুপার অ্যাডমিন রোল নিয়ন্ত্রণ করবেন।`
                    : `Public role-switching to Super Admin is locked. Only verified Super Admins can assign or modify Admin & Super Admin roles, and ${PRIMARY_SUPER_ADMIN_EMAIL} & ${ADMIN_PIN_DEFAULT_EMAIL} are protected.`}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#2E3138] text-white font-semibold">
              {currentUser.email} ({currentUser.role})
            </span>
          </div>

          {/* 12-Zone Dhaka Rider Coverage Grid */}
          {dhakaZoneCoverage.length > 0 && (
            <div
              data-testid="admin-dhaka-zone-coverage-grid"
              className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-sm text-[#2E3138]">
                    {lang === 'bn'
                      ? 'ঢাকার ১২টি জোনের রাইডার কাভারেজ ও ডেলিভারি রেট'
                      : 'Dhaka 12-Zone Rider Coverage & Delivery Fee Matrix'}
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    {lang === 'bn'
                      ? 'কোন কোন ঢাকা জোনে অনুমোদিত রাইডার আছে এবং অর্ডার নেওয়া শুরু করা যাবে তা দেখুন'
                      : 'See which Dhaka zones have approved/online riders ready to fulfill food deliveries'}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                  {dhakaZoneCoverage.filter((z) => z.hasActiveCoverage).length} /{' '}
                  {dhakaZoneCoverage.length} Zones Covered
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                {dhakaZoneCoverage.map((z) => (
                  <div
                    key={z.zoneCode}
                    className={`rounded-xl border p-3 space-y-1 ${
                      z.hasActiveCoverage
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-neutral-200 bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[#2E3138]">{z.zoneCode}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          z.hasActiveCoverage
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {z.hasActiveCoverage ? 'Ready' : 'Needs Riders'}
                      </span>
                    </div>
                    <p className="font-semibold text-neutral-700 truncate">
                      {lang === 'bn' ? z.zoneNameBn : z.zoneName}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-neutral-600 tabular-nums pt-0.5">
                      <span>
                        {z.onlineCount} online / {z.approvedCount} ok
                        {z.pendingCount > 0 ? ` · ${z.pendingCount} pending` : ''}
                      </span>
                      <span className="font-bold text-[#E21B70]">৳{z.deliveryFee}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Dhaka Rider Approval Queue */}
          {(() => {
            const pendingRiders = riders.filter((r) => r.status === 'pending');
            return (
              <div
                data-testid="admin-pending-rider-queue"
                className="bg-white rounded-2xl border border-amber-300 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-sm text-[#2E3138]">
                      {lang === 'bn'
                        ? `রাইডার আবেদন অনুমোদন কিউ (${pendingRiders.length})`
                        : `Pending Dhaka Rider Approval Queue (${pendingRiders.length})`}
                    </h2>
                    <p className="text-[11px] text-neutral-500">
                      {lang === 'bn'
                        ? 'নতুন রাইডাররা আবেদন করলে জোন যাচাই করে অ্যাপ্রুভ বা রিজেক্ট করুন।'
                        : 'Assign or confirm each applicant’s Dhaka zone and approve them to start receiving deliveries.'}
                    </p>
                  </div>
                </div>
                {pendingRiders.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    {lang === 'bn'
                      ? 'এই মুহূর্তে কোনো নতুন রাইডার আবেদন অপেক্ষমাণ নেই।'
                      : 'No pending rider applications awaiting review right now.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingRiders.map((pr) => {
                      const chosenZone = pendingZoneDrafts[pr.id] ?? pr.zone;
                      return (
                        <div
                          key={pr.id}
                          data-testid={`pending-rider-card-${pr.id}`}
                          className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-[#2E3138]">{pr.fullName}</p>
                              <p className="text-neutral-600">
                                {pr.phone} · {pr.email}
                              </p>
                              <p className="text-[11px] text-neutral-500">
                                {pr.vehicleType} · NID: {pr.nidNumber || 'N/A'}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold uppercase">
                              pending
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Approve zone for ${pr.fullName}`}
                              value={chosenZone}
                              onChange={(e) =>
                                setPendingZoneDrafts((prev) => ({
                                  ...prev,
                                  [pr.id]: e.target.value,
                                }))
                              }
                              className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold"
                            >
                              <option value={pr.zone}>{pr.zone}</option>
                              {DHAKA_ZONE_PRESETS.map((z) => (
                                <option key={z.code} value={z.label}>
                                  {z.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRider(pr, {
                                  status: 'approved',
                                  isAvailable: true,
                                  zone: chosenZone,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              {lang === 'bn' ? 'অ্যাপ্রুভ করুন' : 'Approve & Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRider(pr, {
                                  status: 'suspended',
                                  isAvailable: false,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold"
                            >
                              {lang === 'bn' ? 'বাতিল' : 'Reject'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
              <h2 className="font-bold text-sm text-[#2E3138]">Platform Users & Roles ({users.length})</h2>
              {users.map((u) => {
                const isPrimaryOwner = isProtectedSuperAdminEmail(u.email);
                const canManagePrivileged = currentUser.role === 'super_admin';
                const rowLocked =
                  isPrimaryOwner ||
                  (!canManagePrivileged && (u.role === 'super_admin' || u.role === 'admin'));
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 pb-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-[#2E3138]">{u.fullName}</p>
                        {isPrimaryOwner && (
                          <span className="px-1.5 py-0.5 rounded bg-[#FFF0F6] text-[#E21B70] text-[10px] font-bold">
                            PRIMARY OWNER
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-500">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={rowLocked}
                        aria-label={`Role for ${u.email}`}
                        onChange={(e) => handleUpdateUser(u, { role: e.target.value })}
                        className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold disabled:opacity-50"
                      >
                        <option value="customer">customer</option>
                        <option value="restaurant_owner">restaurant_owner</option>
                        <option value="rider">rider</option>
                        {canManagePrivileged && <option value="admin">admin</option>}
                        {canManagePrivileged && <option value="super_admin">super_admin</option>}
                        {!canManagePrivileged && (u.role === 'admin' || u.role === 'super_admin') && (
                          <option value={u.role}>{u.role}</option>
                        )}
                      </select>
                      <button
                        type="button"
                        disabled={isPrimaryOwner || currentUser.uid === u.uid || rowLocked}
                        onClick={() =>
                          handleUpdateUser(u, { status: u.status === 'suspended' ? 'active' : 'suspended' })
                        }
                        className={`px-2.5 py-1 rounded border font-semibold disabled:opacity-40 ${
                          u.status === 'suspended'
                            ? 'border-emerald-200 text-emerald-700'
                            : 'border-red-200 text-red-600'
                        }`}
                      >
                        {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                    <LocateFixed className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? `লাইভ রাইডার ফ্লিট ও GPS কন্ট্রোল (${riders.length})`
                        : `Live Rider Fleet Map & GPS Control (${riders.length})`}
                    </span>
                  </h2>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {lang === 'bn'
                      ? 'যেকোনো রাইডার সিলেক্ট করে ম্যাপে ক্লিক করলে রাইডারের লাইভ GPS অবস্থান পরিবর্তন হবে।'
                      : 'Select any rider below or tap a pin, then click anywhere on the Bangladesh map to update their live GPS location.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadAdmin()}
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{lang === 'bn' ? 'রিফ্রেশ GPS' : 'Refresh Live GPS'}</span>
                </button>
              </div>

              {riders.length > 0 && selectedRider && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-[#FFF0F6]/70 border border-[#E21B70]/25 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[#E21B70]">
                        {lang === 'bn' ? 'নিয়ন্ত্রিত রাইডার:' : 'Controlling Rider:'}{' '}
                        {selectedRider.fullName}
                      </span>
                      <span className="text-neutral-600 ml-2 font-mono-nums">
                        ({Number(selectedRider.currentLat).toFixed(4)},{' '}
                        {Number(selectedRider.currentLng).toFixed(4)} · {selectedRider.zone})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={showCustomRiderMove ? '__custom__' : ''}
                        aria-label="Move selected rider GPS to Bangladesh hub"
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setShowCustomRiderMove(true);
                            return;
                          }
                          setShowCustomRiderMove(false);
                          const found = BANGLADESH_AREAS.find((a) => a.name === e.target.value);
                          if (found) {
                            handleUpdateRider(selectedRider, {
                              currentLat: found.lat,
                              currentLng: found.lng,
                              zone: found.name,
                            });
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white text-xs font-semibold"
                      >
                        <option value="">
                          {lang === 'bn' ? 'হাব অনুযায়ী GPS সরান...' : 'Move GPS to BD Hub...'}
                        </option>
                        {DHAKA_DELIVERY_ZONES.map((z) => (
                          <optgroup key={z.code} label={`${z.code} — ${z.name}`}>
                            {z.areas.map((a) => (
                              <option key={a.name} value={a.name}>
                                {a.name} ({a.nameBn})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <optgroup label={lang === 'bn' ? 'অন্যান্য জেলা' : 'Nationwide Bangladesh Cities'}>
                          {BANGLADESH_AREAS.filter((a) => !a.zoneCode).map((a) => (
                            <option key={a.name} value={a.name}>
                              {a.name} ({a.division})
                            </option>
                          ))}
                        </optgroup>
                        <option value="__custom__">
                          {lang === 'bn' ? '+ কাস্টম এলাকা লিখুন...' : '+ Custom Area in BD...'}
                        </option>
                      </select>
                      {showCustomRiderMove && (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={customRiderMoveArea}
                            onChange={(e) => setCustomRiderMoveArea(e.target.value)}
                            placeholder={lang === 'bn' ? 'এলাকার নাম...' : 'e.g. Rampura, Dhaka'}
                            className="px-2.5 py-1 rounded-lg border border-[#E21B70]/40 bg-white text-xs w-40"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const q = customRiderMoveArea.trim();
                              if (!q) return;
                              try {
                                const geo = await apiFetch<{
                                  results: Array<{ lat: number; lng: number; shortName: string }>;
                                }>(`/api/free/geocode?q=${encodeURIComponent(q)}`);
                                const first = geo.results?.[0];
                                await handleUpdateRider(selectedRider, {
                                  zone: first?.shortName || q,
                                  ...(first ? { currentLat: first.lat, currentLng: first.lng } : {}),
                                });
                              } catch {
                                await handleUpdateRider(selectedRider, { zone: q });
                              }
                              setCustomRiderMoveArea('');
                              setShowCustomRiderMove(false);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#E21B70] text-white text-xs font-semibold"
                          >
                            {lang === 'bn' ? 'সেট' : 'Move'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <DhakaMapPicker
                    mapsApiKey={mapsApiKey}
                    lang={lang}
                    center={{
                      lat: Number(selectedRider.currentLat) || BANGLADESH_AREAS[0].lat,
                      lng: Number(selectedRider.currentLng) || BANGLADESH_AREAS[0].lng,
                    }}
                    markerLabel={`Selected: ${selectedRider.fullName}`}
                    pinType="user"
                    userName={selectedRider.fullName}
                    extraRiders={riders.map((r) => ({
                      id: r.id,
                      label: `${r.fullName} (${r.zone})`,
                      lat: Number(r.currentLat) || BANGLADESH_AREAS[0].lat,
                      lng: Number(r.currentLng) || BANGLADESH_AREAS[0].lng,
                      isAvailable: r.isAvailable,
                      selected: r.id === selectedRider.id,
                    }))}
                    onSelectRiderPin={(id) => setSelectedRiderId(id)}
                    interactive
                    heightClass="h-[250px]"
                    onSelectLocation={(c) => {
                      handleUpdateRider(selectedRider, {
                        currentLat: c.lat,
                        currentLng: c.lng,
                        ...(c.areaName ? { zone: c.areaName } : {}),
                      });
                    }}
                  />
                </div>
              )}

              <div className="space-y-3">
                {riders.map((r) => {
                  const isSelected = selectedRider?.id === r.id;
                  const draftZone = riderEditZones[r.id] ?? r.zone;
                  const draftVehicle = riderEditVehicles[r.id] ?? r.vehicleType;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-3.5 space-y-2.5 text-xs transition-colors ${
                        isSelected
                          ? 'border-[#E21B70] bg-[#FFF9FB]'
                          : 'border-neutral-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRiderId(r.id)}
                          className="text-left group"
                        >
                          <p className="font-bold text-[#2E3138] group-hover:text-[#E21B70] inline-flex items-center gap-1.5">
                            <Bike className="w-3.5 h-3.5 text-[#E21B70]" />
                            <span>
                              {r.fullName} · {r.vehicleType}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded bg-[#E21B70] text-white text-[10px]">
                                Map Focus
                              </span>
                            )}
                          </p>
                          <p className="text-neutral-500 mt-0.5">
                            {r.zone} · {r.phone} · {r.totalDeliveries} trips (
                            {formatBdt(r.totalEarnings, lang)})
                          </p>
                          <p className="text-[11px] font-mono-nums text-emerald-700 mt-0.5">
                            GPS: {Number(r.currentLat).toFixed(4)}, {Number(r.currentLng).toFixed(4)}
                            {r.locationUpdatedAt
                              ? ` · ${new Date(r.locationUpdatedAt).toLocaleTimeString()}`
                              : ''}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          <select
                            value={r.status}
                            aria-label={`Status for rider ${r.fullName}`}
                            onChange={(e) => handleUpdateRider(r, { status: e.target.value })}
                            className="px-2 py-1 border border-neutral-200 rounded bg-white font-semibold"
                          >
                            <option value="approved">approved</option>
                            <option value="pending">pending</option>
                            <option value="suspended">suspended</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleUpdateRider(r, { isAvailable: !r.isAvailable })}
                            className={`px-2.5 py-1 rounded font-semibold ${
                              r.isAvailable
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                            }`}
                          >
                            {r.isAvailable ? 'Online' : 'Offline'}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-neutral-100">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={draftZone}
                            onChange={(e) =>
                              setRiderEditZones((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            aria-label={`Zone for rider ${r.fullName}`}
                            placeholder="Any BD City / Zone"
                            className="flex-1 min-w-0 px-2 py-1 border border-neutral-200 rounded bg-white text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateRider(r, {
                                zone: draftZone.trim() || r.zone,
                                vehicleType: draftVehicle,
                              })
                            }
                            className="px-2 py-1 rounded bg-[#2E3138] text-white text-[11px] font-semibold shrink-0"
                          >
                            Save
                          </button>
                        </div>
                        <SelectWithCustom
                          lang={lang}
                          value={draftVehicle}
                          onChange={(nextVeh) => {
                            setRiderEditVehicles((prev) => ({ ...prev, [r.id]: nextVeh }));
                            if (
                              VEHICLE_TYPE_PRESET_OPTIONS.some(
                                (v) => v.toLowerCase() === nextVeh.trim().toLowerCase()
                              )
                            ) {
                              handleUpdateRider(r, { vehicleType: nextVeh });
                            }
                          }}
                          storageKey="rider_vehicles"
                          ariaLabel={`Vehicle for rider ${r.fullName}`}
                          placeholder={lang === 'bn' ? 'কাস্টম গাড়ি...' : 'Custom vehicle...'}
                          customOptionLabel={
                            lang === 'bn' ? '+ কাস্টম যানবাহন...' : '+ Custom Vehicle...'
                          }
                          selectClassName="w-full px-2 py-1 border border-neutral-200 rounded bg-white text-[11px] font-semibold"
                          inputClassName="flex-1 min-w-0 px-2 py-1 border border-[#E21B70]/40 bg-[#FFF9FB] rounded text-[11px]"
                          presets={VEHICLE_TYPE_PRESET_OPTIONS.map((v) => ({ value: v, label: v }))}
                          onAddCustom={(val) => {
                            setRiderEditVehicles((prev) => ({ ...prev, [r.id]: val }));
                            handleUpdateRider(r, { vehicleType: val });
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <select
                            value={dispatchOrderByRider[r.id] || ''}
                            aria-label={`Assign order to rider ${r.fullName}`}
                            onChange={(e) =>
                              setDispatchOrderByRider((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-0 px-2 py-1 border border-neutral-200 rounded bg-white text-[11px]"
                          >
                            <option value="">
                              {assignableOrders.length === 0
                                ? 'No active orders'
                                : 'Assign order...'}
                            </option>
                            {assignableOrders.map((ord) => (
                              <option key={ord.id} value={String(ord.id)}>
                                {ord.orderNumber} ({ord.deliveryArea})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!dispatchOrderByRider[r.id]}
                            onClick={async () => {
                              const oid = Number(dispatchOrderByRider[r.id]);
                              if (!oid) return;
                              await handleOrderOverride(oid, {
                                status: 'rider_assigned',
                                riderUid: r.uid,
                              });
                              setDispatchOrderByRider((prev) => ({ ...prev, [r.id]: '' }));
                            }}
                            className="px-2 py-1 rounded bg-[#E21B70] text-white text-[11px] font-semibold disabled:opacity-40 shrink-0"
                          >
                            Dispatch
                          </button>
                        </div>
                      </div>

                      {/* Rider Cash & Commission Wallet Summary + Manual Commission Settlement */}
                      {r.walletSummary && (
                        <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
                          <div className="flex flex-wrap items-center gap-2 text-neutral-600">
                            <span>
                              Cash: <strong>{formatBdt(r.walletSummary.totalCashCollected, lang)}</strong>
                            </span>
                            <span>·</span>
                            <span className="text-emerald-700">
                              Earned: <strong>{formatBdt(r.walletSummary.totalRiderEarnings, lang)}</strong>
                            </span>
                            <span>·</span>
                            <span className="text-purple-800">
                              Owed: <strong>{formatBdt(r.walletSummary.totalCommissionOwed, lang)}</strong>
                            </span>
                            <span>·</span>
                            <span className="text-[#E21B70] font-bold">
                              Outstanding:{' '}
                              {formatBdt(r.walletSummary.outstandingCommission, lang)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSettleModalRider(r);
                              setSettleAmount(
                                String(Math.max(0, r.walletSummary?.outstandingCommission || 0))
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 font-bold hover:bg-purple-100"
                          >
                            {lang === 'bn' ? 'কমিশন সেটেল করুন' : 'Record Commission Settlement'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {settleModalRider && (
                <form
                  onSubmit={handleSettleRiderCommission}
                  data-testid="admin-rider-settlement-form"
                  className="p-4 rounded-xl border border-purple-300 bg-purple-50/70 space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-purple-950">
                      Record Commission Settlement — {settleModalRider.fullName}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSettleModalRider(null)}
                      className="text-neutral-500 hover:text-neutral-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      placeholder="Amount (৳)"
                      className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white font-bold tabular-nums"
                    />
                    <select
                      value={settleMethod}
                      onChange={(e) => setSettleMethod(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white font-semibold"
                    >
                      <option value="cash">Cash Handover</option>
                      <option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                    <input
                      type="text"
                      value={settleRef}
                      onChange={(e) => setSettleRef(e.target.value)}
                      placeholder="Ref / Tx ID (optional)"
                      className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={settleNote}
                      onChange={(e) => setSettleNote(e.target.value)}
                      placeholder="Settlement note (optional)"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={settlingCommission}
                      className="px-4 py-1.5 rounded-lg bg-[#E21B70] text-white font-bold disabled:opacity-50"
                    >
                      {settlingCommission ? 'Saving...' : 'Confirm Settlement'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : tab === 'messages' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white rounded-2xl border border-neutral-200 p-5 min-h-[520px]">
          {/* Restaurant Thread List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-neutral-200 pb-4 lg:pb-0 lg:pr-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#2E3138] flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn' ? 'রেস্টুরেন্ট ইনবক্স' : 'Restaurant Owner Threads'}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => void loadAdmin(true)}
                className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:border-[#E21B70]"
                title="Refresh messages"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
              {messageThreads.map((t) => {
                const isSelected = selectedMessageRestId === t.restaurantId;
                return (
                  <button
                    key={t.restaurantId}
                    type="button"
                    onClick={() => void handleSelectMessageThread(t.restaurantId)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#FFF0F6] border-[#E21B70]'
                        : 'bg-[#FAFAFB] border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#2E3138] truncate">
                        {t.restaurantName}
                      </span>
                      {t.unreadForAdmin > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#E21B70] text-white text-[10px] font-bold tabular-nums">
                          {t.unreadForAdmin}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate mt-1">
                      {t.lastMessage || (lang === 'bn' ? 'এখনো কোনো মেসেজ নেই' : 'No messages yet')}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Conversation */}
          <div className="lg:col-span-8 flex flex-col justify-between gap-3">
            {selectedMessageRestId ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                  <div>
                    <h3 className="text-sm font-bold text-[#2E3138]">
                      {messageThreads.find((t) => t.restaurantId === selectedMessageRestId)
                        ?.restaurantName || `Restaurant #${selectedMessageRestId}`}
                    </h3>
                    <p className="text-[11px] text-neutral-500">
                      {lang === 'bn'
                        ? 'রেস্টুরেন্ট ওনারের সাথে সরাসরি অ্যাডমিন যোগাযোগ'
                        : 'Direct 2-way conversation with restaurant owner'}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[360px] p-2 bg-[#FAFAFB] rounded-xl border border-neutral-200">
                  {vendorMessages.filter((m) => m.restaurantId === selectedMessageRestId)
                    .length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-10">
                      {lang === 'bn'
                        ? 'এই রেস্টুরেন্টকে প্রথম মেসেজ পাঠান।'
                        : 'Start a conversation with this restaurant owner.'}
                    </p>
                  ) : (
                    vendorMessages
                      .filter((m) => m.restaurantId === selectedMessageRestId)
                      .map((m) => {
                        const fromAdmin =
                          m.senderRole === 'admin' || m.senderRole === 'super_admin';
                        return (
                          <div
                            key={m.id}
                            className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-xs ${
                                fromAdmin
                                  ? 'bg-[#2E3138] text-white'
                                  : 'bg-white border border-neutral-200 text-[#2E3138]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 mb-1">
                                <span className="font-semibold">{m.senderName}</span>
                                <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>

                <form onSubmit={handleSendAdminReply} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={adminReplyText}
                    onChange={(e) => setAdminReplyText(e.target.value)}
                    placeholder={
                      lang === 'bn'
                        ? 'রেস্টুরেন্ট মালিককে উত্তর লিখুন...'
                        : 'Write a reply to the restaurant owner...'
                    }
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-[#E21B70]"
                  />
                  <button
                    type="submit"
                    disabled={sendingAdminReply || !adminReplyText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'পাঠান' : 'Send'}</span>
                  </button>
                </form>
              </>
            ) : (
              <p className="text-xs text-neutral-500 text-center py-12">
                {lang === 'bn' ? 'একটি রেস্টুরেন্ট নির্বাচন করুন।' : 'Select a restaurant thread.'}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Upload / Edit Product Modal */}
      {productModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProductModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {productModal.id
                  ? lang === 'bn'
                    ? 'পণ্য সম্পাদনা করুন'
                    : 'Edit Product'
                  : lang === 'bn'
                  ? 'নতুন পণ্য আপলোড করুন'
                  : 'Upload New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModal(null)}
                aria-label="Close product modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Restaurant</label>
                <select
                  value={productModal.restaurantId}
                  onChange={(e) =>
                    setProductModal({ ...productModal, restaurantId: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                >
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Category</label>
                <SelectWithCustom
                  required
                  lang={lang}
                  value={productModal.category}
                  onChange={(val) => setProductModal({ ...productModal, category: val })}
                  storageKey="food_categories"
                  ariaLabel="Product category"
                  placeholder="e.g. Biriyani, Iftar, Seafood"
                  customOptionLabel={
                    lang === 'bn' ? '+ কাস্টম ক্যাটাগরি যোগ...' : '+ Add Custom Category...'
                  }
                  presets={FOOD_CATEGORY_PRESET_OPTIONS.map((cat) => ({ value: cat, label: cat }))}
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Product Name (English)</label>
                <input
                  required
                  value={productModal.name}
                  onChange={(e) => setProductModal({ ...productModal, name: e.target.value })}
                  placeholder="e.g. Royal Mutton Kacchi"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">পণ্যের নাম (বাংলা)</label>
                <input
                  required
                  value={productModal.nameBn}
                  onChange={(e) => setProductModal({ ...productModal, nameBn: e.target.value })}
                  placeholder="যেমন: রয়েল মাটন কাচ্চি"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Price (BDT ৳)</label>
                <input
                  required
                  type="number"
                  min="10"
                  value={productModal.price}
                  onChange={(e) => setProductModal({ ...productModal, price: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Discount Price (Optional ৳)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 299"
                  value={productModal.discountPrice}
                  onChange={(e) =>
                    setProductModal({ ...productModal, discountPrice: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-neutral-700">
                Product Photo (File Upload or URL)
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] font-semibold">
                  <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleUploadImage(f, (url) =>
                          setProductModal((prev) => (prev ? { ...prev, imageUrl: url } : null))
                        );
                      }
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={productModal.imageUrl}
                  onChange={(e) => setProductModal({ ...productModal, imageUrl: e.target.value })}
                  placeholder="https://... or leave blank for restaurant cover"
                  className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                />
              </div>
              {productModal.imageUrl && (
                <img
                  src={productModal.imageUrl}
                  alt="Preview"
                  className="w-20 h-20 rounded-xl object-cover border border-neutral-200 mt-1"
                />
              )}
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-neutral-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={productModal.description}
                onChange={(e) => setProductModal({ ...productModal, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-neutral-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#E21B70]">
                <input
                  type="checkbox"
                  checked={productModal.isVisibleOnStorefront}
                  onChange={(e) =>
                    setProductModal({ ...productModal, isVisibleOnStorefront: e.target.checked })
                  }
                />
                <span>
                  {lang === 'bn'
                    ? 'ওয়েবসাইটে দেখান (Storefront Visible)'
                    : 'Show on Website (Customer Storefront)'}
                </span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.inStock}
                  onChange={(e) => setProductModal({ ...productModal, inStock: e.target.checked })}
                />
                <span>In Stock</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.isAvailable}
                  onChange={(e) =>
                    setProductModal({ ...productModal, isAvailable: e.target.checked })
                  }
                />
                <span>Available on Menu</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productModal.isPopular}
                  onChange={(e) =>
                    setProductModal({ ...productModal, isPopular: e.target.checked })
                  }
                />
                <span>Featured on Homepage</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProduct || uploadingPhoto}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingProduct
                  ? 'Saving...'
                  : productModal.id
                  ? 'Save Product Changes'
                  : 'Publish Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create / Edit Restaurant Modal */}
      {restaurantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRestaurantModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {restaurantModal.id ? 'Edit Restaurant' : 'Create Approved Restaurant'}
              </h3>
              <button
                type="button"
                onClick={() => setRestaurantModal(null)}
                aria-label="Close restaurant modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Name (EN)</label>
                <input
                  required
                  value={restaurantModal.name}
                  onChange={(e) => setRestaurantModal({ ...restaurantModal, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Name (BN)</label>
                <input
                  required
                  value={restaurantModal.nameBn}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, nameBn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Cuisine</label>
                <SelectWithCustom
                  required
                  lang={lang}
                  value={restaurantModal.cuisine}
                  onChange={(val) => setRestaurantModal({ ...restaurantModal, cuisine: val })}
                  storageKey="cuisines"
                  ariaLabel="Restaurant cuisine"
                  placeholder={
                    lang === 'bn'
                      ? 'কাস্টম কুইজিন লিখুন (যেমন: মেজবানি)'
                      : 'Custom cuisine (e.g. Seafood, Mezbani)'
                  }
                  customOptionLabel={
                    lang === 'bn' ? '+ কাস্টম কুইজিন যোগ...' : '+ Add Custom Cuisine...'
                  }
                  presets={CUISINE_PRESET_OPTIONS.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  {lang === 'bn'
                    ? 'শহর / এলাকা (ঢাকা বা সারা বাংলাদেশ + কাস্টম)'
                    : 'City / Area (All Bangladesh + Custom)'}
                </label>
                <SelectWithCustom
                  required
                  lang={lang}
                  value={restaurantModal.area}
                  onChange={(val) => setRestaurantModal({ ...restaurantModal, area: val })}
                  storageKey="bd_areas"
                  ariaLabel="Restaurant city or area"
                  placeholder={
                    lang === 'bn'
                      ? 'কাস্টম এলাকা লিখুন (যেমন: রামপুরা, ঢাকা)'
                      : 'Custom area (e.g. Rampura, Dhaka or Bogura Sadar)'
                  }
                  customOptionLabel={
                    lang === 'bn'
                      ? '+ কাস্টম এলাকা যোগ করুন (ঢাকা/সারা দেশ)...'
                      : '+ Add Custom Area (Dhaka / Bangladesh)...'
                  }
                  presets={getBangladeshAreaSelectPresets(lang)}
                  onSelectPreset={(val) => {
                    const found = BANGLADESH_AREAS.find((a) => a.name === val);
                    const formatted = found
                      ? formatResolvedMapAddress({ areaName: found.name, lat: found.lat, lng: found.lng })
                      : '';
                    setRestaurantModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            area: val,
                            ...(found ? { lat: found.lat, lng: found.lng } : {}),
                            ...(formatted ? { address: formatted } : {}),
                          }
                        : null
                    );
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Address</label>
                <input
                  required
                  value={restaurantModal.address}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, address: e.target.value })
                  }
                  placeholder={`House/Road, ${restaurantModal.area}, Bangladesh`}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? 'রেস্টুরেন্ট পিন অবস্থান (সারা বাংলাদেশ)'
                        : 'Restaurant Map Pin (Anywhere in Bangladesh)'}
                    </span>
                  </span>
                </label>
                <DhakaMapPicker
                  mapsApiKey={mapsApiKey}
                  lang={lang}
                  center={{ lat: restaurantModal.lat, lng: restaurantModal.lng }}
                  markerLabel={restaurantModal.name || restaurantModal.area}
                  pinType="vendor"
                  restaurantName={restaurantModal.name}
                  interactive
                  heightClass="h-[190px]"
                  onSelectLocation={(c) => {
                    const formatted = formatResolvedMapAddress({
                      displayName: c.displayName,
                      areaName: c.areaName,
                      lat: c.lat,
                      lng: c.lng,
                    });
                    setRestaurantModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            lat: c.lat,
                            lng: c.lng,
                            area: c.areaName || prev.area,
                            ...(formatted ? { address: formatted } : {}),
                          }
                        : null
                    );
                  }}
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Delivery Fee (৳)</label>
                <input
                  type="number"
                  value={restaurantModal.deliveryFee}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, deliveryFee: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Minimum Order (৳)</label>
                <input
                  type="number"
                  value={restaurantModal.minOrder}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, minOrder: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Discount Badge (%)</label>
                <input
                  type="number"
                  value={restaurantModal.discountPct}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, discountPct: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Opening Hours</label>
                <input
                  value={restaurantModal.openingHours}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, openingHours: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            {modalError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {modalError}
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-neutral-700">
                {lang === 'bn' ? 'রেস্টুরেন্ট লোগো ছবি (Logo)' : 'Restaurant Logo Image'}
              </label>
              <div className="flex items-center gap-2.5">
                {restaurantModal.logoUrl ? (
                  <img
                    src={restaurantModal.logoUrl}
                    alt="Restaurant logo preview"
                    className="w-11 h-11 rounded-xl object-cover border border-neutral-200 bg-white shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-neutral-400 shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] font-semibold shrink-0">
                  <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) {
                        handleUploadImage(f, (url) =>
                          setRestaurantModal((prev) => (prev ? { ...prev, logoUrl: url } : null))
                        );
                      }
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={restaurantModal.logoUrl}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, logoUrl: e.target.value })
                  }
                  placeholder="https://... or /uploads/..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                />
                {restaurantModal.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setRestaurantModal({ ...restaurantModal, logoUrl: '' })}
                    aria-label="Clear logo"
                    className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-neutral-700">
                {lang === 'bn' ? 'কভার ব্যানার ছবি (Cover Image)' : 'Cover Image'}
              </label>
              <div className="flex items-center gap-2.5">
                {restaurantModal.coverUrl && (
                  <img
                    src={restaurantModal.coverUrl}
                    alt="Restaurant cover preview"
                    className="w-16 h-11 rounded-lg object-cover border border-neutral-200 bg-neutral-100 shrink-0"
                  />
                )}
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] font-semibold shrink-0">
                  <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Cover'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) {
                        handleUploadImage(f, (url) =>
                          setRestaurantModal((prev) => (prev ? { ...prev, coverUrl: url } : null))
                        );
                      }
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={restaurantModal.coverUrl}
                  onChange={(e) =>
                    setRestaurantModal({ ...restaurantModal, coverUrl: e.target.value })
                  }
                  placeholder="https://... or /uploads/..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestaurantModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRestaurant || uploadingPhoto}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingRestaurant ? 'Saving...' : 'Save Restaurant'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Gateway API Configuration Modal (bKash / Nagad / SSLCommerz / Future Gateways) */}
      {gatewayModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveGatewayModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#2E3138]">
                  {gatewayModal.isNew
                    ? lang === 'bn'
                      ? 'নতুন পেমেন্ট গেটওয়ে API যোগ করুন'
                      : 'Add Payment Gateway Integration'
                    : lang === 'bn'
                    ? `${gatewayModal.name} পেমেন্ট API সেটআপ`
                    : `Configure ${gatewayModal.name} API`}
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {lang === 'bn'
                    ? 'সার্ভার-সাইডে সিক্রেট সংরক্ষিত থাকবে; কখনো ক্লায়েন্টে এক্সপোজ হবে না।'
                    : 'Credentials are stored server-side only; masked previews keep existing secrets intact.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGatewayModal(null)}
                aria-label="Close gateway modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Gateway Code (slug)
                </label>
                <input
                  required
                  disabled={!gatewayModal.isNew}
                  value={gatewayModal.code}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, code: e.target.value })}
                  placeholder="e.g. bkash, rocket, upay, shurjopay"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Provider Type</label>
                <select
                  value={gatewayModal.providerType}
                  onChange={(e) =>
                    setGatewayModal({
                      ...gatewayModal,
                      providerType: e.target.value as GatewayFormState['providerType'],
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                >
                  <option value="mfs">Mobile Banking (MFS — bKash/Nagad/Rocket)</option>
                  <option value="card">Card / SSL Gateway (SSLCommerz/Stripe)</option>
                  <option value="wallet">Digital Wallet</option>
                  <option value="cod">Cash on Delivery (COD)</option>
                  <option value="custom">Custom REST Gateway</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Display Name (EN)</label>
                <input
                  required
                  value={gatewayModal.name}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, name: e.target.value })}
                  placeholder="e.g. bKash Checkout"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">নাম (বাংলা)</label>
                <input
                  value={gatewayModal.nameBn}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, nameBn: e.target.value })}
                  placeholder="যেমন: বিকাশ পেমেন্ট"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Environment Mode</label>
                <select
                  value={gatewayModal.mode}
                  onChange={(e) =>
                    setGatewayModal({
                      ...gatewayModal,
                      mode: e.target.value as 'sandbox' | 'live',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                >
                  <option value="sandbox">Sandbox / Test Mode</option>
                  <option value="live">Live Production</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Checkout Order</label>
                <input
                  type="number"
                  min="1"
                  value={gatewayModal.sortOrder}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, sortOrder: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">API Base URL</label>
                <input
                  type="url"
                  value={gatewayModal.apiBaseUrl}
                  onChange={(e) =>
                    setGatewayModal({ ...gatewayModal, apiBaseUrl: e.target.value })
                  }
                  placeholder="https://tokenized.pay.bka.sh/v1.2.0-beta"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Merchant / Store ID
                </label>
                <input
                  value={gatewayModal.merchantId}
                  onChange={(e) =>
                    setGatewayModal({ ...gatewayModal, merchantId: e.target.value })
                  }
                  placeholder="Merchant or Store ID"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  API Key / App Key
                </label>
                <input
                  value={gatewayModal.apiKey}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, apiKey: e.target.value })}
                  placeholder="Leave •••• unchanged or paste new key"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  API Secret / Password
                </label>
                <input
                  value={gatewayModal.apiSecret}
                  onChange={(e) => setGatewayModal({ ...gatewayModal, apiSecret: e.target.value })}
                  placeholder="Leave •••• unchanged or paste secret"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Webhook Signature Secret
                </label>
                <input
                  value={gatewayModal.webhookSecret}
                  onChange={(e) =>
                    setGatewayModal({ ...gatewayModal, webhookSecret: e.target.value })
                  }
                  placeholder="Optional x-webhook-secret"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">
                  Customer Checkout Note / Instructions
                </label>
                <input
                  value={gatewayModal.instructions}
                  onChange={(e) =>
                    setGatewayModal({ ...gatewayModal, instructions: e.target.value })
                  }
                  placeholder="e.g. Pay instantly via bKash wallet or OTP verification"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E3138] cursor-pointer">
              <input
                type="checkbox"
                checked={gatewayModal.isActive}
                onChange={(e) => setGatewayModal({ ...gatewayModal, isActive: e.target.checked })}
              />
              <span>
                {lang === 'bn'
                  ? 'কাস্টমার চেকআউটে চালু রাখুন (Active at Checkout)'
                  : 'Enable at Customer Checkout (Active)'}
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGatewayModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingGateway}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingGateway ? 'Saving...' : 'Save Gateway API'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI Provider API Configuration Modal */}
      {aiProviderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveAiProviderModal}
            className="bg-white rounded-2xl border border-neutral-200 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#2E3138]">
                  {aiProviderModal.isNew
                    ? lang === 'bn'
                      ? 'নতুন AI API যুক্ত করুন (ChatGPT / Groq / Custom)'
                      : 'Add AI Help Provider API'
                    : `Configure ${aiProviderModal.name}`}
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {aiProviderModal.providerType === 'foodora'
                    ? 'Foodora Own AI runs natively with bilingual Foodora BD support and optional Gemini enhancement.'
                    : aiProviderModal.providerType === 'pollinations'
                    ? 'Pollinations Free AI works out-of-the-box without requiring any API key.'
                    : aiProviderModal.providerType === 'gemini'
                    ? 'Google Gemini uses the server GEMINI_API_KEY environment secret.'
                    : aiProviderModal.providerType === 'openrouter'
                    ? 'OpenRouter supports Gemma 4 (google/gemma-4-31b-it:free) & free fallback routing (paste key below or set OPENROUTER_API_KEY).'
                    : 'External AI API keys are saved strictly server-side and never sent to browsers.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiProviderModal(null)}
                aria-label="Close AI provider modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Provider Code</label>
                <input
                  required
                  disabled={!aiProviderModal.isNew}
                  value={aiProviderModal.code}
                  onChange={(e) => setAiProviderModal({ ...aiProviderModal, code: e.target.value })}
                  placeholder="e.g. openrouter, chatgpt, groq"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Provider Type</label>
                <select
                  disabled={aiProviderModal.code === 'gemini' || aiProviderModal.code === 'foodora'}
                  value={aiProviderModal.providerType}
                  onChange={(e) => {
                    const nextType = e.target.value as AiProviderType;
                    const defaultUrls: Record<string, string> = {
                      foodora: '',
                      pollinations: 'https://text.pollinations.ai',
                      gemini: '',
                      openrouter: 'https://openrouter.ai/api/v1',
                      openai: 'https://api.openai.com/v1',
                      groq: 'https://api.groq.com/openai/v1',
                      deepseek: 'https://api.deepseek.com/v1',
                      anthropic: 'https://api.anthropic.com',
                      mistral: 'https://api.mistral.ai/v1',
                      xai: 'https://api.x.ai/v1',
                      together: 'https://api.together.xyz/v1',
                      cerebras: 'https://api.cerebras.ai/v1',
                      perplexity: 'https://api.perplexity.ai',
                      cohere: 'https://api.cohere.com/compatibility/v1',
                      huggingface: 'https://router.huggingface.co/v1',
                      custom_openai: aiProviderModal.apiBaseUrl || 'https://api.openai.com/v1',
                    };
                    const defaultModels: Record<string, string> = {
                      pollinations: 'openai-fast',
                      openrouter: 'google/gemma-4-31b-it:free',
                      openai: 'gpt-4o-mini',
                      groq: 'llama-3.3-70b-versatile',
                      deepseek: 'deepseek-chat',
                      anthropic: 'claude-3-5-haiku-latest',
                      mistral: 'mistral-small-latest',
                      xai: 'grok-2-latest',
                      together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
                      cerebras: 'llama-3.3-70b',
                      perplexity: 'sonar',
                      cohere: 'command-a-03-2025',
                      huggingface: 'Qwen/Qwen2.5-72B-Instruct',
                    };
                    setAiProviderModal({
                      ...aiProviderModal,
                      providerType: nextType,
                      apiBaseUrl: defaultUrls[nextType] ?? aiProviderModal.apiBaseUrl,
                      model: defaultModels[nextType] || aiProviderModal.model,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white disabled:bg-neutral-100"
                >
                  <option value="foodora">Foodora Own AI (Built-in)</option>
                  <option value="pollinations">Pollinations Free AI (No Key Needed)</option>
                  <option value="openrouter">OpenRouter (Gemma 4 / Reasoning)</option>
                  <option value="gemini">Google Gemini 4 (Server Env)</option>
                  <option value="openai">ChatGPT / OpenAI</option>
                  <option value="groq">Groq Cloud (Llama)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="xai">xAI Grok</option>
                  <option value="together">Together AI</option>
                  <option value="cerebras">Cerebras AI</option>
                  <option value="perplexity">Perplexity Sonar</option>
                  <option value="cohere">Cohere Command</option>
                  <option value="huggingface">HuggingFace Router</option>
                  <option value="custom_openai">Custom OpenAI-Compatible</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Display Name</label>
                <input
                  required
                  value={aiProviderModal.name}
                  onChange={(e) => setAiProviderModal({ ...aiProviderModal, name: e.target.value })}
                  placeholder="e.g. OpenRouter (Gemma 4)"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Model Name</label>
                <input
                  required
                  value={aiProviderModal.model}
                  onChange={(e) =>
                    setAiProviderModal({ ...aiProviderModal, model: e.target.value })
                  }
                  placeholder="e.g. google/gemma-4-31b-it:free"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                />
              </div>

              {aiProviderModal.providerType !== 'gemini' && aiProviderModal.providerType !== 'foodora' && (
                <>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">
                      API Base URL (HTTPS)
                    </label>
                    <input
                      required
                      type="url"
                      value={aiProviderModal.apiBaseUrl}
                      onChange={(e) =>
                        setAiProviderModal({ ...aiProviderModal, apiBaseUrl: e.target.value })
                      }
                      placeholder="https://openrouter.ai/api/v1"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                    />
                  </div>
                  {aiProviderModal.providerType !== 'pollinations' && (
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-neutral-700 mb-1">
                        API Key (Secret)
                      </label>
                      <input
                        type="password"
                        value={aiProviderModal.apiKey}
                        onChange={(e) =>
                          setAiProviderModal({ ...aiProviderModal, apiKey: e.target.value })
                        }
                        placeholder="sk-or-v1-... or sk-... (leave •••• unchanged to keep current key)"
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono-nums"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-[#2E3138] cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiProviderModal.isActive}
                  onChange={(e) =>
                    setAiProviderModal({ ...aiProviderModal, isActive: e.target.checked })
                  }
                />
                <span>{lang === 'bn' ? 'AI Help উইজেটে চালু রাখুন' : 'Active in AI Help Widget'}</span>
              </label>
              <label className="inline-flex items-center gap-2 font-semibold text-[#2E3138] cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiProviderModal.isDefault}
                  onChange={(e) =>
                    setAiProviderModal({ ...aiProviderModal, isDefault: e.target.checked })
                  }
                />
                <span>{lang === 'bn' ? 'ডিফল্ট AI ইঞ্জিন' : 'Set as Default Engine'}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAiProviderModal(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAiProvider}
                className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingAiProvider ? 'Saving...' : 'Save AI API'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
