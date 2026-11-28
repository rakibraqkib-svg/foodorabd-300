import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MapPin,
  MessageSquare,
  Navigation,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Upload,
  UserCheck,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, getAuthToken } from '../lib/api';
import { BANGLADESH_AREAS, getBangladeshAreaSelectPresets } from '../lib/i18n';
import {
  emitLocalRealtimeSignal,
  playOrderAlertChime,
  useOrderSoundSetting,
  useRealtimeEvents,
} from '../lib/realtime';
import {
  buildVendorAnalytics,
  CUISINE_PRESET_OPTIONS,
  DeliveryMode,
  detectOrderBatchChanges,
  FOOD_CATEGORY_PRESET_OPTIONS,
  formatBdt,
  formatResolvedMapAddress,
  normalizeAddonsList,
  normalizeVariationsList,
} from '../lib/marketplace-logic';
import { DhakaMapPicker } from './DhakaMapPicker';
import { SelectWithCustom } from './SelectWithCustom';
import type {
  AppUser,
  FoodItem,
  Lang,
  LedgerEntry,
  OrderRecord,
  PayoutRecord,
  Restaurant,
  RiderJob,
  RiderJobApplication,
  VendorAdminMessage,
} from '../types/marketplace';

interface VendorRiderOption {
  id: number;
  uid: string;
  restaurantId?: number | null;
  addedByUid?: string | null;
  isOwnRider?: boolean;
  fullName: string;
  phone: string;
  email?: string;
  vehicleType: string;
  zone: string;
  isAvailable: boolean;
  status: string;
  currentLat: number;
  currentLng: number;
  totalDeliveries: number;
  distanceKm: number | null;
}

interface VendorDashboardProps {
  user: AppUser;
  lang: Lang;
  mapsApiKey: string;
  initialOnboarding?: boolean;
  initialRestaurantId?: number | null;
  onRefreshUser: () => Promise<void>;
  onMenuMutated?: () => Promise<void>;
  onTrackOrder?: (orderId: number) => void;
  onBack: () => void;
}

type VendorTab =
  | 'orders'
  | 'menu'
  | 'riders'
  | 'messages'
  | 'analytics'
  | 'earnings'
  | 'settings';

export function VendorDashboard({
  user,
  lang,
  mapsApiKey,
  initialOnboarding = false,
  initialRestaurantId = null,
  onRefreshUser,
  onMenuMutated,
  onTrackOrder,
  onBack,
}: VendorDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [ownRestaurantIds, setOwnRestaurantIds] = useState<number[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(
    initialRestaurantId
  );
  const [menuItems, setMenuItems] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [riderJobs, setRiderJobs] = useState<RiderJob[]>([]);
  const [riderApps, setRiderApps] = useState<RiderJobApplication[]>([]);
  const [availableRiders, setAvailableRiders] = useState<VendorRiderOption[]>([]);
  const [messages, setMessages] = useState<VendorAdminMessage[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [showOnboarding, setShowOnboarding] = useState(initialOnboarding);
  const [tab, setTab] = useState<VendorTab>('orders');
  const [trendRange, setTrendRange] = useState<'daily' | 'monthly'>('daily');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [liveNewOrderAlert, setLiveNewOrderAlert] = useState<{
    orderNumber: string;
    customerName: string;
    totalAmount: number;
  } | null>(null);
  const orderSnapshotMapRef = useRef<Map<number, { status: string; paymentStatus?: string }> | null>(
    null
  );

  // Orders & Dispatch filter + inline rider selection state
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<
    'all' | 'pending' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
  >('all');
  const [riderSelectionByOrder, setRiderSelectionByOrder] = useState<Record<number, string>>({});
  const [dispatchingOrderId, setDispatchingOrderId] = useState<number | null>(null);

  // Menu & Stock filter + expandable tools
  const [menuSearch, setMenuSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [showAddProductPanel, setShowAddProductPanel] = useState(false);
  const [showPosSyncPanel, setShowPosSyncPanel] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState<number>(0);

  // Direct Delivery Man (Add Rider) form state
  const [dmName, setDmName] = useState('');
  const [dmPhone, setDmPhone] = useState('');
  const [dmEmail, setDmEmail] = useState('');
  const [dmPassword, setDmPassword] = useState('');
  const [dmVehicle, setDmVehicle] = useState('Motorbike');
  const [dmZone, setDmZone] = useState(BANGLADESH_AREAS[0].name);
  const [dmNid, setDmNid] = useState('');
  const [addingDeliveryMan, setAddingDeliveryMan] = useState(false);

  // Rider Job form state
  const [jobTitle, setJobTitle] = useState('Delivery Rider (Full-Time)');
  const [jobTitleBn, setJobTitleBn] = useState('ডেলিভারি রাইডার (ফুল-টাইম)');
  const [jobZone, setJobZone] = useState(BANGLADESH_AREAS[0].name);
  const [jobVehicle, setJobVehicle] = useState('Motorbike');
  const [jobSalary, setJobSalary] = useState('৳18,000 - ৳26,000 / month');
  const [jobShift, setJobShift] = useState('10:00 AM - 10:00 PM');
  const [jobVacancies, setJobVacancies] = useState('2');
  const [jobDescription, setJobDescription] = useState('');
  const [postingJob, setPostingJob] = useState(false);

  // Vendor <-> Admin Chat state
  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgStoreId, setMsgStoreId] = useState<number>(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Multi-step onboarding state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ownerName, setOwnerName] = useState(user.fullName);
  const [restName, setRestName] = useState('');
  const [restNameBn, setRestNameBn] = useState('');
  const [cuisine, setCuisine] = useState('Bangladeshi');
  const [area, setArea] = useState(BANGLADESH_AREAS[0].name);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState({
    lat: BANGLADESH_AREAS[0].lat,
    lng: BANGLADESH_AREAS[0].lng,
  });
  const [phone, setPhone] = useState('+8801712345678');
  const [email, setEmail] = useState(user.email || 'partner@restaurant.bd');
  const [description, setDescription] = useState('');
  const [tradeLicense, setTradeLicense] = useState('TRAD/DSCC/2026-8841');
  const [nidNumber, setNidNumber] = useState('1991269123456');
  const [payoutMethod, setPayoutMethod] = useState<string>('bkash');
  const [payoutAccount, setPayoutAccount] = useState('01712345678');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('platform');
  const [regLogoUrl, setRegLogoUrl] = useState('');
  const [regCoverUrl, setRegCoverUrl] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);

  // Add Branch modal state (1 restaurant per owner, unlimited branches)
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchNameBn, setBranchNameBn] = useState('');
  const [branchArea, setBranchArea] = useState(BANGLADESH_AREAS[1]?.name || BANGLADESH_AREAS[0].name);
  const [branchAddress, setBranchAddress] = useState('');
  const [branchCoords, setBranchCoords] = useState({
    lat: BANGLADESH_AREAS[1]?.lat || BANGLADESH_AREAS[0].lat,
    lng: BANGLADESH_AREAS[1]?.lng || BANGLADESH_AREAS[0].lng,
  });
  const [branchPhone, setBranchPhone] = useState('+8801712345678');
  const [branchDeliveryFee, setBranchDeliveryFee] = useState('49');
  const [branchMinOrder, setBranchMinOrder] = useState('150');
  const [branchDeliveryMode, setBranchDeliveryMode] = useState<DeliveryMode>('platform');
  const [branchCopyMenu, setBranchCopyMenu] = useState(true);
  const [creatingBranch, setCreatingBranch] = useState(false);

  // Add food item form (with product variants & optional add-ons)
  const [newCategory, setNewCategory] = useState('Main Course');
  const [newName, setNewName] = useState('');
  const [newNameBn, setNewNameBn] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('350');
  const [newDiscountPrice, setNewDiscountPrice] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVariations, setNewVariations] = useState<Array<{ name: string; priceDelta: number }>>([
    { name: 'Regular', priceDelta: 0 },
  ]);
  const [newAddons, setNewAddons] = useState<Array<{ name: string; price: number }>>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  // Edit food item modal
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [savingEditItem, setSavingEditItem] = useState(false);

  // TheMealDB culinary inspiration search
  const [mealQuery, setMealQuery] = useState('biryani');
  const [mealResults, setMealResults] = useState<
    Array<{
      id: string;
      name: string;
      category: string;
      cuisine: string;
      instructions: string;
      thumbUrl: string;
    }>
  >([]);
  const [loadingMeals, setLoadingMeals] = useState(false);

  // Store settings edit
  const [editFee, setEditFee] = useState('49');
  const [editMinOrder, setEditMinOrder] = useState('150');
  const [editHours, setEditHours] = useState('10:00 AM - 11:30 PM');
  const [editMode, setEditMode] = useState<DeliveryMode>('platform');
  const [editArea, setEditArea] = useState(BANGLADESH_AREAS[0].name);
  const [editAddress, setEditAddress] = useState('');
  const [editCoords, setEditCoords] = useState({
    lat: BANGLADESH_AREAS[0].lat,
    lng: BANGLADESH_AREAS[0].lng,
  });
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Payout request
  const [payoutAmt, setPayoutAmt] = useState('500');

  // Partner Product API integration state
  const [apiKeyInfo, setApiKeyInfo] = useState<{
    hasKey: boolean;
    keyPrefix: string | null;
    label: string | null;
    lastUsedAt: string | null;
  } | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string>('');
  const [rotatingKey, setRotatingKey] = useState(false);
  const [copiedApiSnippet, setCopiedApiSnippet] = useState<string | null>(null);
  const [partnerJsonInput, setPartnerJsonInput] = useState(() =>
    JSON.stringify(
      {
        name: 'Special Beef Tehari Platter',
        nameBn: 'স্পেশাল বিফ তেহারি প্ল্যাটার',
        category: 'Biriyani',
        price: 340,
        discountPrice: 299,
        description: 'Authentic Old Dhaka style beef tehari served hot with salad.',
        isPopular: true,
      },
      null,
      2
    )
  );
  const [pushingPartnerApi, setPushingPartnerApi] = useState(false);
  const [partnerApiStatus, setPartnerApiStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [orderSoundEnabled, setOrderSoundEnabled] = useOrderSoundSetting();

  const canAccessVendorApi =
    user.role === 'restaurant_owner' || user.role === 'admin' || user.role === 'super_admin';

  const isAllStoresView = selectedRestaurantId === -1 && allRestaurants.length > 1;
  const activeStoreForActions = useMemo(() => {
    if (!isAllStoresView && restaurant) return restaurant;
    return allRestaurants.find((r) => r.id === targetStoreId) || restaurant;
  }, [isAllStoresView, restaurant, allRestaurants, targetStoreId]);

  const showNotice = useCallback((text: string, ok = true) => {
    setFeedback({ ok, text });
  }, []);

  const loadMessages = useCallback(
    async (storeId?: number) => {
      if (!canAccessVendorApi) return;
      try {
        const q = storeId && storeId > 0 ? `?restaurantId=${storeId}` : '';
        const res = await apiFetch<{
          messages: VendorAdminMessage[];
        }>(`/api/messages/vendor-admin${q}`);
        setMessages(res.messages || []);
      } catch {
        // ignore transient chat fetch error
      }
    },
    [canAccessVendorApi]
  );

  const loadWorkspace = useCallback(
    async (explicitId?: number | null, silent = false) => {
      if (!canAccessVendorApi) {
        setShowOnboarding(true);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const targetId = explicitId !== undefined ? explicitId : selectedRestaurantId;
      try {
        const query = targetId ? `?restaurantId=${targetId}` : '';
        const res = await apiFetch<{
          restaurant: Restaurant | null;
          restaurants?: Restaurant[];
          ownRestaurantIds?: number[];
          menuItems: FoodItem[];
          orders: OrderRecord[];
          ledger: LedgerEntry[];
          payouts: PayoutRecord[];
          riderJobs?: RiderJob[];
          riderJobApplications?: RiderJobApplication[];
          unreadMessageCount?: number;
        }>(`/api/vendor/workspace${query}`);

        setRestaurant(res.restaurant);
        const storeList = res.restaurants || (res.restaurant ? [res.restaurant] : []);
        setAllRestaurants(storeList);
        setOwnRestaurantIds(res.ownRestaurantIds || []);
        setMenuItems(res.menuItems);
        setRiderJobs(res.riderJobs || []);
        setRiderApps(res.riderJobApplications || []);
        setUnreadMessages(res.unreadMessageCount ?? 0);

        const changes = detectOrderBatchChanges(orderSnapshotMapRef.current, res.orders);
        orderSnapshotMapRef.current = changes.nextMap;
        if (changes.newOrders.length > 0) {
          const freshNew = changes.newOrders[0];
          setLiveNewOrderAlert({
            orderNumber: freshNew.orderNumber,
            customerName: freshNew.customerName,
            totalAmount: freshNew.totalAmount,
          });
          void playOrderAlertChime('new_order', { dedupKey: `order_created_${freshNew.id}` });
        } else if (changes.updatedOrders.length > 0) {
          const changed = changes.updatedOrders[0];
          showNotice(
            lang === 'bn'
              ? `অর্ডার আপডেট হয়েছে: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
              : `Order updated: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`,
            true
          );
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${changed.id}_${changed.status}`,
          });
        }

        setOrders(res.orders);
        setLedger(res.ledger);
        setPayouts(res.payouts);
        if (!silent) setRevealedApiKey('');

        if (res.restaurant) {
          if (targetId !== -1) {
            setSelectedRestaurantId(res.restaurant.id);
          }
          setTargetStoreId((prev) =>
            prev > 0 && storeList.some((r) => r.id === prev) ? prev : res.restaurant!.id
          );
          setMsgStoreId((prev) =>
            prev > 0 && storeList.some((r) => r.id === prev) ? prev : res.restaurant!.id
          );
          setJobZone((prev) => prev || res.restaurant!.area || BANGLADESH_AREAS[0].name);
          setDmZone((prev) => prev || res.restaurant!.area || BANGLADESH_AREAS[0].name);

          if (!silent) {
            setEditFee(String(res.restaurant.deliveryFee));
            setEditMinOrder(String(res.restaurant.minOrder));
            setEditHours(res.restaurant.openingHours);
            setEditMode(res.restaurant.deliveryMode);
            setEditArea(res.restaurant.area || BANGLADESH_AREAS[0].name);
            setEditAddress(res.restaurant.address || '');
            setEditCoords({
              lat: Number(res.restaurant.lat) || BANGLADESH_AREAS[0].lat,
              lng: Number(res.restaurant.lng) || BANGLADESH_AREAS[0].lng,
            });
            setEditLogoUrl(res.restaurant.logoUrl || '');
            setEditCoverUrl(res.restaurant.coverUrl || '');

            const [keyMetaRes, ridersRes, msgRes] = await Promise.allSettled([
              apiFetch<{
                hasKey: boolean;
                keyPrefix: string | null;
                label: string | null;
                lastUsedAt: string | null;
              }>(`/api/vendor/api-key?restaurantId=${res.restaurant.id}`),
              apiFetch<{ riders: VendorRiderOption[] }>(
                `/api/vendor/riders?restaurantId=${res.restaurant.id}`
              ),
              apiFetch<{ messages: VendorAdminMessage[] }>(
                `/api/messages/vendor-admin${
                  targetId === -1 ? '' : `?restaurantId=${res.restaurant.id}`
                }`
              ),
            ]);
            if (keyMetaRes.status === 'fulfilled') setApiKeyInfo(keyMetaRes.value);
            if (ridersRes.status === 'fulfilled') setAvailableRiders(ridersRes.value.riders || []);
            if (msgRes.status === 'fulfilled') setMessages(msgRes.value.messages || []);
          }
        } else {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error('Vendor workspace load failed:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [canAccessVendorApi, selectedRestaurantId, lang, showNotice]
  );

  const isSuperAdmin = user.role === 'super_admin' || user.role === 'admin';
  const primaryOwnedRestaurant = useMemo(
    () => allRestaurants.find((r) => ownRestaurantIds.includes(r.id)) || restaurant,
    [allRestaurants, ownRestaurantIds, restaurant]
  );

  const openAddBranchModal = useCallback(() => {
    const base = primaryOwnedRestaurant || restaurant;
    const defaultArea = BANGLADESH_AREAS[1] || BANGLADESH_AREAS[0];
    setBranchName('');
    setBranchNameBn('');
    setBranchArea(defaultArea.name);
    setBranchAddress('');
    setBranchCoords({ lat: defaultArea.lat, lng: defaultArea.lng });
    setBranchPhone(base?.phone || '+8801712345678');
    setBranchDeliveryFee(String(base?.deliveryFee ?? 49));
    setBranchMinOrder(String(base?.minOrder ?? 150));
    setBranchDeliveryMode(base?.deliveryMode || 'platform');
    setBranchCopyMenu(true);
    setShowAddBranchModal(true);
  }, [primaryOwnedRestaurant, restaurant]);

  useEffect(() => {
    if (initialOnboarding && !isSuperAdmin && ownRestaurantIds.length >= 1) {
      setShowOnboarding(false);
      openAddBranchModal();
      return;
    }
    setShowOnboarding(initialOnboarding);
  }, [initialOnboarding, isSuperAdmin, ownRestaurantIds.length, openAddBranchModal]);

  useEffect(() => {
    if (initialRestaurantId && initialRestaurantId !== selectedRestaurantId) {
      setSelectedRestaurantId(initialRestaurantId);
    }
  }, [initialRestaurantId, selectedRestaurantId]);

  useEffect(() => {
    orderSnapshotMapRef.current = null;
    setLiveNewOrderAlert(null);
  }, [user.uid, selectedRestaurantId]);

  useEffect(() => {
    loadWorkspace(selectedRestaurantId, false);
  }, [loadWorkspace, selectedRestaurantId]);

  // Mark messages as read when Vendor opens Messages tab
  useEffect(() => {
    if (tab !== 'messages' || !restaurant) return;
    const activeMsgRestId =
      selectedRestaurantId === -1 ? msgStoreId || restaurant.id : restaurant.id;
    loadMessages(activeMsgRestId);
    if (unreadMessages > 0) {
      apiFetch('/api/messages/vendor-admin/read', {
        method: 'PATCH',
        body: JSON.stringify({ restaurantId: activeMsgRestId }),
      })
        .then(() => setUnreadMessages(0))
        .catch(() => undefined);
    }
  }, [tab, restaurant, selectedRestaurantId, msgStoreId, unreadMessages, loadMessages]);

  useRealtimeEvents({
    enabled: canAccessVendorApi,
    token: getAuthToken(),
    pollFallbackMs: 4000,
    onSync: () => {
      loadWorkspace(selectedRestaurantId, true);
      if (tab === 'messages' && restaurant) {
        const activeMsgRestId =
          selectedRestaurantId === -1 ? msgStoreId || restaurant.id : restaurant.id;
        loadMessages(activeMsgRestId);
      }
    },
    onEvent: (ev) => {
      if (ev.type === 'message:created') {
        const restId = Number(ev.payload.restaurantId);
        const ownerMatch =
          user.role === 'admin' ||
          user.role === 'super_admin' ||
          ev.payload.ownerUid === user.uid ||
          (Number.isInteger(restId) && ownRestaurantIds.includes(restId));
        if (ownerMatch) {
          if (tab === 'messages') {
            const activeMsgRestId =
              selectedRestaurantId === -1 ? msgStoreId || restaurant?.id : restaurant?.id;
            loadMessages(activeMsgRestId);
          } else {
            loadWorkspace(selectedRestaurantId, true);
          }
        }
        return;
      }

      if (
        ev.type === 'order:created' ||
        ev.type === 'order:updated' ||
        ev.type === 'notification:created'
      ) {
        const restId = Number(ev.payload.restaurantId);
        const ownerMatch =
          user.role === 'admin' ||
          user.role === 'super_admin' ||
          ev.payload.restaurantOwnerUid === user.uid ||
          (Number.isInteger(restId) && ownRestaurantIds.includes(restId));
        if (ev.type === 'order:created' && ownerMatch) {
          setLiveNewOrderAlert({
            orderNumber: String(ev.payload.orderNumber || 'New Order'),
            customerName: String(ev.payload.customerName || 'Customer'),
            totalAmount: Number(ev.payload.totalAmount || 0),
          });
          void playOrderAlertChime('new_order', {
            dedupKey: `order_created_${String(ev.payload.orderId || ev.payload.orderNumber || '')}`,
          });
        } else if (ev.type === 'order:updated' && ownerMatch) {
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${String(ev.payload.orderId || '')}_${String(ev.payload.status || '')}`,
          });
        }
        loadWorkspace(selectedRestaurantId, true);
      }
    },
  });

  const handleRegisterRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReg(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ restaurant: Restaurant }>('/api/restaurants/register', {
        method: 'POST',
        body: JSON.stringify({
          ownerName,
          name: restName,
          nameBn: restNameBn || restName,
          cuisine,
          area,
          address,
          lat: coords.lat,
          lng: coords.lng,
          phone,
          email,
          description: description || `${restName} — Authentic kitchen in ${area}, Bangladesh.`,
          tradeLicense,
          nidNumber,
          payoutMethod,
          payoutAccount,
          logoUrl: regLogoUrl.trim(),
          coverUrl: regCoverUrl.trim(),
          deliveryFee: 49,
          minOrder: 150,
          deliveryMode,
        }),
      });
      setRestaurant(res.restaurant);
      setSelectedRestaurantId(res.restaurant.id);
      setShowOnboarding(false);
      await onRefreshUser();
      if (onMenuMutated) await onMenuMutated();
      const isInstantLive = res.restaurant.status === 'approved';
      showNotice(
        isInstantLive
          ? lang === 'bn'
            ? 'আপনার নিজস্ব রেস্টুরেন্ট সরাসরি লাইভ হয়েছে! এখন আপনার মেনুতে পণ্য আপলোড করতে পারেন।'
            : 'Your store is live immediately! You can now upload products and manage orders.'
          : lang === 'bn'
          ? 'আপনার রেস্টুরেন্ট আবেদন জমা হয়েছে। সুপার অ্যাডমিন অনুমোদনের পর এটি মার্কেটপ্লেসে দৃশ্যমান হবে।'
          : 'Application submitted! Your restaurant is pending Super Admin approval.',
        true
      );
      await loadWorkspace(res.restaurant.id);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Registration failed', false);
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !branchAddress.trim()) return;
    setCreatingBranch(true);
    setFeedback(null);
    try {
      const targetPrimary = primaryOwnedRestaurant || restaurant;
      const res = await apiFetch<{ branch: Restaurant; copiedItemsCount: number }>(
        '/api/vendor/branches',
        {
          method: 'POST',
          body: JSON.stringify({
            primaryRestaurantId: targetPrimary?.id,
            branchName: branchName.trim(),
            branchNameBn: branchNameBn.trim(),
            area: branchArea.trim(),
            address: branchAddress.trim(),
            lat: branchCoords.lat,
            lng: branchCoords.lng,
            phone: branchPhone.trim(),
            deliveryFee: Math.max(0, Number(branchDeliveryFee) || 49),
            minOrder: Math.max(50, Number(branchMinOrder) || 150),
            deliveryMode: branchDeliveryMode,
            copyMenu: branchCopyMenu,
          }),
        }
      );
      setShowAddBranchModal(false);
      setRestaurant(res.branch);
      setSelectedRestaurantId(res.branch.id);
      if (onMenuMutated) await onMenuMutated();
      showNotice(
        lang === 'bn'
          ? `নতুন শাখা "${res.branch.name}" যুক্ত হয়েছে (${res.copiedItemsCount}টি মেনু আইটেম কপি করা হয়েছে)।`
          : `New branch "${res.branch.name}" added (${res.copiedItemsCount} menu items copied).`,
        true
      );
      await loadWorkspace(res.branch.id);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not add branch', false);
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleOrderStatus = async (
    orderId: number,
    status: 'accepted' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled'
  ) => {
    try {
      await apiFetch(`/api/vendor/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      emitLocalRealtimeSignal('order:updated', {
        orderId,
        status,
        restaurantId: restaurant?.id,
      });
      showNotice(
        lang === 'bn'
          ? `অর্ডার স্ট্যাটাস আপডেট হয়েছে: ${status.replace(/_/g, ' ')}`
          : `Order status updated to ${status.replace(/_/g, ' ')}.`,
        true
      );
      await loadWorkspace(selectedRestaurantId, true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not update order status', false);
    }
  };

  const handleAssignRider = async (
    orderId: number,
    options: { riderUid?: string; autoAssignNearest?: boolean }
  ) => {
    setDispatchingOrderId(orderId);
    try {
      const res = await apiFetch<{ order: OrderRecord }>(
        `/api/vendor/orders/${orderId}/assign-rider`,
        {
          method: 'POST',
          body: JSON.stringify(options),
        }
      );
      emitLocalRealtimeSignal('order:updated', {
        orderId,
        status: res.order.status,
        restaurantId: res.order.restaurantId,
      });
      showNotice(
        lang === 'bn'
          ? `রাইডার অ্যাসাইন সম্পন্ন: ${res.order.riderName || 'Unassigned'}`
          : `Rider assigned to order ${res.order.orderNumber}: ${res.order.riderName || 'Unassigned'}`,
        true
      );
      await loadWorkspace(selectedRestaurantId, true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to assign rider', false);
    } finally {
      setDispatchingOrderId(null);
    }
  };

  const uploadProductPhoto = async (file: File, onSuccess: (url: string) => void) => {
    if (file.size > 4.5 * 1024 * 1024) {
      showNotice(
        lang === 'bn'
          ? 'ছবির সাইজ ৪.৫ এমবি-র কম হতে হবে।'
          : 'Image must be smaller than 4.5 MB.',
        false
      );
      return;
    }
    setUploadingImage(true);
    setFeedback(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected image'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ imageUrl: string }>('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      onSuccess(res.imageUrl);
      showNotice(lang === 'bn' ? 'ছবি আপলোড সম্পন্ন হয়েছে।' : 'Image uploaded successfully.', true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Image upload failed', false);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddFoodItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRest = activeStoreForActions;
    if (!targetRest || !newName.trim()) return;
    setAddingItem(true);
    try {
      const cleanedVars = normalizeVariationsList(newVariations, true);
      const cleanedAddons = normalizeAddonsList(newAddons);
      await apiFetch('/api/vendor/menu', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: targetRest.id,
          category: newCategory,
          name: newName.trim(),
          nameBn: newNameBn.trim() || newName.trim(),
          description: newDesc.trim(),
          imageUrl: newImageUrl.trim() || targetRest.coverUrl,
          price: Number(newPrice) || 250,
          discountPrice: newDiscountPrice ? Number(newDiscountPrice) : null,
          variationsJson: cleanedVars,
          addonsJson: cleanedAddons,
          isPopular: true,
        }),
      });
      setNewName('');
      setNewNameBn('');
      setNewDesc('');
      setNewDiscountPrice('');
      setNewImageUrl('');
      setNewVariations([{ name: 'Regular', priceDelta: 0 }]);
      setNewAddons([]);
      setShowAddProductPanel(false);
      showNotice(
        lang === 'bn'
          ? 'নতুন খাবার ও ভ্যারিয়েন্ট মেনুতে যুক্ত হয়েছে।'
          : 'New menu item & variants published.',
        true
      );
      await loadWorkspace(selectedRestaurantId);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to publish menu item', false);
    } finally {
      setAddingItem(false);
    }
  };

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSavingEditItem(true);
    try {
      const cleanedVars = normalizeVariationsList(editingItem.variationsJson, true);
      const cleanedAddons = normalizeAddonsList(editingItem.addonsJson);
      await apiFetch(`/api/vendor/menu/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: editingItem.category,
          name: editingItem.name,
          nameBn: editingItem.nameBn,
          description: editingItem.description,
          imageUrl: editingItem.imageUrl,
          price: Number(editingItem.price),
          discountPrice: editingItem.discountPrice ? Number(editingItem.discountPrice) : null,
          variationsJson: cleanedVars,
          addonsJson: cleanedAddons,
          isPopular: editingItem.isPopular,
          inStock: editingItem.inStock,
          isAvailable: editingItem.isAvailable,
        }),
      });
      setEditingItem(null);
      showNotice(
        lang === 'bn'
          ? 'প্রোডাক্ট, ভ্যারিয়েন্ট ও স্টক আপডেট হয়েছে।'
          : 'Product details, variants & stock updated.',
        true
      );
      await loadWorkspace(selectedRestaurantId);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to update product', false);
    } finally {
      setSavingEditItem(false);
    }
  };

  const handleSearchMeals = async () => {
    setLoadingMeals(true);
    try {
      const res = await apiFetch<{
        meals: Array<{
          id: string;
          name: string;
          category: string;
          cuisine: string;
          instructions: string;
          thumbUrl: string;
        }>;
      }>(`/api/free/meals?q=${encodeURIComponent(mealQuery.trim() || 'biryani')}`);
      setMealResults(res.meals);
    } finally {
      setLoadingMeals(false);
    }
  };

  const handleToggleItemStock = async (item: FoodItem) => {
    try {
      await apiFetch(`/api/vendor/menu/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ inStock: !item.inStock }),
      });
      showNotice(
        lang === 'bn'
          ? `${item.nameBn}: ${!item.inStock ? 'স্টকে যুক্ত' : 'স্টক আউট'} করা হয়েছে।`
          : `${item.name} marked ${!item.inStock ? 'In Stock' : 'Out of Stock'}.`,
        true
      );
      await loadWorkspace(selectedRestaurantId, true);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not update stock', false);
    }
  };

  const handleToggleItemAvailable = async (item: FoodItem) => {
    try {
      await apiFetch(`/api/vendor/menu/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      showNotice(
        lang === 'bn'
          ? `${item.nameBn}: ${!item.isAvailable ? 'সক্রিয়' : 'বন্ধ'} করা হয়েছে।`
          : `${item.name} is now ${!item.isAvailable ? 'Active on menu' : 'Unavailable on menu'}.`,
        true
      );
      await loadWorkspace(selectedRestaurantId, true);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not toggle availability', false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await apiFetch(`/api/vendor/menu/${itemId}`, { method: 'DELETE' });
      showNotice(lang === 'bn' ? 'মেনু আইটেম মুছে ফেলা হয়েছে।' : 'Menu item deleted.', true);
      await loadWorkspace(selectedRestaurantId, true);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not delete item', false);
    }
  };

  const handlePostRiderJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRest = activeStoreForActions;
    if (!targetRest) return;
    setPostingJob(true);
    try {
      await apiFetch('/api/vendor/rider-jobs', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: targetRest.id,
          title: jobTitle.trim(),
          titleBn: jobTitleBn.trim() || jobTitle.trim(),
          zone: jobZone.trim() || targetRest.area,
          vehicleType: jobVehicle,
          salaryRange: jobSalary.trim(),
          shiftHours: jobShift.trim(),
          vacancies: Number(jobVacancies) || 1,
          description: jobDescription.trim(),
        }),
      });
      setJobDescription('');
      showNotice(
        lang === 'bn'
          ? 'রাইডার জব পোস্ট প্রকাশিত হয়েছে! রাইডার পোর্টালে সবাই এটি দেখতে ও আবেদন করতে পারবে।'
          : 'Rider job published! Riders can now see and apply from the Rider Portal.',
        true
      );
      await loadWorkspace(selectedRestaurantId, true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to publish rider job', false);
    } finally {
      setPostingJob(false);
    }
  };

  const handleToggleJobActive = async (job: RiderJob) => {
    try {
      await apiFetch(`/api/vendor/rider-jobs/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !job.isActive }),
      });
      await loadWorkspace(selectedRestaurantId, true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to update job status', false);
    }
  };

  const handleDeleteRiderJob = async (jobId: number) => {
    try {
      await apiFetch(`/api/vendor/rider-jobs/${jobId}`, { method: 'DELETE' });
      showNotice(lang === 'bn' ? 'রাইডার জব মুছে ফেলা হয়েছে।' : 'Rider job removed.', true);
      await loadWorkspace(selectedRestaurantId, true);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to delete rider job', false);
    }
  };

  const handleAddDeliveryMan = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRest = activeStoreForActions;
    if (!targetRest) return;
    setAddingDeliveryMan(true);
    try {
      const res = await apiFetch<{ rider: VendorRiderOption }>('/api/vendor/riders', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: targetRest.id,
          fullName: dmName.trim(),
          phone: dmPhone.trim(),
          email: dmEmail.trim(),
          password: dmPassword.trim() || undefined,
          vehicleType: dmVehicle,
          zone: dmZone.trim() || targetRest.area,
          nidNumber: dmNid.trim(),
        }),
      });
      setDmName('');
      setDmPhone('');
      setDmEmail('');
      setDmPassword('');
      setDmNid('');
      setAvailableRiders((prev) => [
        res.rider,
        ...prev.filter((r) => r.uid !== res.rider.uid),
      ]);
      showNotice(
        lang === 'bn'
          ? `ডেলিভারি ম্যান "${res.rider.fullName}" যোগ হয়েছে! এখনই অর্ডারে অ্যাসাইন করতে পারবেন।`
          : `Delivery man "${res.rider.fullName}" added & ready for order dispatch!`,
        true
      );
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to add delivery man', false);
    } finally {
      setAddingDeliveryMan(false);
    }
  };

  const handleToggleOwnRiderAvailability = async (rider: VendorRiderOption) => {
    try {
      const res = await apiFetch<{ rider: VendorRiderOption }>(`/api/vendor/riders/${rider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !rider.isAvailable }),
      });
      setAvailableRiders((prev) =>
        prev.map((r) => (r.id === rider.id ? { ...r, isAvailable: res.rider.isAvailable } : r))
      );
      showNotice(
        lang === 'bn'
          ? `${rider.fullName}: ${res.rider.isAvailable ? 'অনলাইন' : 'অফলাইন'} করা হয়েছে।`
          : `${rider.fullName} is now ${res.rider.isAvailable ? 'Online' : 'Offline'}.`,
        true
      );
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Could not update delivery man status', false);
    }
  };

  const handleRemoveOwnRider = async (rider: VendorRiderOption) => {
    try {
      await apiFetch(`/api/vendor/riders/${rider.id}`, { method: 'DELETE' });
      setAvailableRiders((prev) => prev.filter((r) => r.id !== rider.id));
      showNotice(
        lang === 'bn'
          ? `ডেলিভারি ম্যান "${rider.fullName}" তালিকা থেকে সরানো হয়েছে।`
          : `Removed delivery man "${rider.fullName}".`,
        true
      );
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to remove delivery man', false);
    }
  };

  const handleApplicationStatus = async (appId: number, status: 'hired' | 'rejected') => {
    try {
      await apiFetch(`/api/vendor/rider-applications/${appId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showNotice(
        status === 'hired'
          ? lang === 'bn'
            ? 'রাইডার নিয়োগ সম্পন্ন! এখন থেকেই তিনি অর্ডারে অ্যাসাইন হতে পারবেন।'
            : 'Applicant hired & activated as an approved rider! Ready for dispatch.'
          : lang === 'bn'
          ? 'আবেদনটি বাতিল করা হয়েছে।'
          : 'Applicant marked as rejected.',
        true
      );
      await loadWorkspace(selectedRestaurantId, false);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to update application', false);
    }
  };

  const handleSendAdminMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRestId =
      selectedRestaurantId === -1 ? msgStoreId || restaurant?.id : restaurant?.id;
    if (!targetRestId || !msgText.trim()) return;
    setSendingMsg(true);
    try {
      const res = await apiFetch<{ message: VendorAdminMessage }>('/api/messages/vendor-admin', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: targetRestId,
          message: msgText.trim(),
        }),
      });
      setMessages((prev) => [...prev, res.message]);
      setMsgText('');
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to send message to Admin', false);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleRotatePartnerKey = async () => {
    const targetRest = activeStoreForActions;
    if (!targetRest) return;
    setRotatingKey(true);
    setPartnerApiStatus(null);
    try {
      const res = await apiFetch<{
        apiKey: string;
        keyPrefix: string;
        label: string;
        updatedAt: string;
      }>('/api/vendor/api-key/rotate', {
        method: 'POST',
        body: JSON.stringify({ restaurantId: targetRest.id }),
      });
      setRevealedApiKey(res.apiKey);
      setApiKeyInfo({
        hasKey: true,
        keyPrefix: res.keyPrefix,
        label: res.label,
        lastUsedAt: null,
      });
      showNotice(
        lang === 'bn'
          ? 'নতুন পার্টনার API কী তৈরি হয়েছে। এখনই কপি করে সংরক্ষণ করুন।'
          : 'New Partner API key generated. Copy and store it securely.',
        true
      );
    } catch (err: unknown) {
      setPartnerApiStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to generate API key',
      });
    } finally {
      setRotatingKey(false);
    }
  };

  const handlePushPartnerApi = async () => {
    const keyToUse = revealedApiKey.trim();
    if (!keyToUse) {
      setPartnerApiStatus({
        ok: false,
        message:
          lang === 'bn'
            ? 'আগে পার্টনার API কী তৈরি করুন বা আপনার কী দিন।'
            : 'Generate or paste your X-Partner-API-Key first.',
      });
      return;
    }
    setPushingPartnerApi(true);
    setPartnerApiStatus(null);
    try {
      const parsedBody = JSON.parse(partnerJsonInput);
      const res = await fetch('/api/partner/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-API-Key': keyToUse,
        },
        body: JSON.stringify(parsedBody),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setPartnerApiStatus({
        ok: true,
        message:
          lang === 'bn'
            ? `API দিয়ে ${payload.count || 1}টি প্রোডাক্ট সফলভাবে যোগ হয়েছে!`
            : `Success (HTTP ${res.status}): Imported ${payload.count || 1} product(s) via Partner API.`,
      });
      await loadWorkspace(selectedRestaurantId);
      await onMenuMutated?.();
    } catch (err: unknown) {
      setPartnerApiStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Invalid JSON or Partner API request failed',
      });
    } finally {
      setPushingPartnerApi(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRest = activeStoreForActions;
    if (!targetRest) return;
    setSavingSettings(true);
    setFeedback(null);
    try {
      await apiFetch('/api/vendor/restaurant', {
        method: 'PATCH',
        body: JSON.stringify({
          restaurantId: targetRest.id,
          openingHours: editHours,
          deliveryFee: Number(editFee) || 0,
          minOrder: Number(editMinOrder) || 0,
          deliveryMode: editMode,
          area: editArea.trim() || targetRest.area,
          address: editAddress.trim() || targetRest.address,
          lat: editCoords.lat,
          lng: editCoords.lng,
          logoUrl: editLogoUrl.trim(),
          coverUrl: editCoverUrl.trim(),
        }),
      });
      showNotice(
        lang === 'bn' ? 'স্টোর সেটিংস ও লোগো আপডেট হয়েছে।' : 'Store settings and branding updated.',
        true
      );
      await loadWorkspace(selectedRestaurantId);
      await onMenuMutated?.();
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Failed to save store settings', false);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleOpen = async () => {
    if (!restaurant) return;
    await apiFetch('/api/vendor/restaurant', {
      method: 'PATCH',
      body: JSON.stringify({
        restaurantId: restaurant.id,
        isOpen: !restaurant.isOpen,
      }),
    });
    await loadWorkspace(selectedRestaurantId);
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRest = activeStoreForActions;
    if (!targetRest) return;
    try {
      await apiFetch('/api/vendor/payouts', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: targetRest.id,
          amount: Number(payoutAmt) || 500,
        }),
      });
      showNotice(lang === 'bn' ? 'পেআউট অনুরোধ পাঠানো হয়েছে।' : 'Payout request submitted.', true);
      await loadWorkspace(selectedRestaurantId);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : 'Payout request failed', false);
    }
  };

  // Filtered Orders for Orders & Dispatch tab
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((ord) => {
      if (orderFilter === 'pending' && ord.status !== 'confirmed' && ord.status !== 'accepted') {
        return false;
      }
      if (orderFilter === 'preparing' && ord.status !== 'preparing') return false;
      if (orderFilter === 'ready' && ord.status !== 'ready') return false;
      if (
        orderFilter === 'dispatched' &&
        ord.status !== 'rider_assigned' &&
        ord.status !== 'picked_up' &&
        ord.status !== 'on_the_way'
      ) {
        return false;
      }
      if (orderFilter === 'delivered' && ord.status !== 'delivered') return false;
      if (orderFilter === 'cancelled' && ord.status !== 'cancelled') return false;
      if (!q) return true;
      return (
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        ord.customerPhone.toLowerCase().includes(q) ||
        ord.deliveryArea.toLowerCase().includes(q) ||
        (ord.restaurantName || '').toLowerCase().includes(q) ||
        (ord.riderName || '').toLowerCase().includes(q)
      );
    });
  }, [orders, orderFilter, orderSearch]);

  // Order KPI counts
  const pendingOrdersCount = orders.filter((o) =>
    ['confirmed', 'accepted', 'preparing', 'ready'].includes(o.status)
  ).length;
  const activeDeliveryCount = orders.filter((o) =>
    ['rider_assigned', 'picked_up', 'on_the_way'].includes(o.status)
  ).length;

  // Filtered Menu Items & Stock counts
  const stockStats = useMemo(() => {
    const total = menuItems.length;
    const inStock = menuItems.filter((m) => m.inStock).length;
    const outOfStock = menuItems.filter((m) => !m.inStock).length;
    const hidden = menuItems.filter(
      (m) => !m.isAvailable || m.isVisibleOnStorefront === false
    ).length;
    return { total, inStock, outOfStock, hidden };
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (stockFilter === 'in_stock' && !item.inStock) return false;
      if (stockFilter === 'out_of_stock' && item.inStock) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.nameBn.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.restaurantName || '').toLowerCase().includes(q)
      );
    });
  }, [menuItems, menuSearch, stockFilter]);

  const pendingRiderAppsCount = riderApps.filter((a) => a.status === 'pending').length;

  // Messages scoped to active message restaurant
  const activeMsgStoreId =
    selectedRestaurantId === -1 ? msgStoreId || restaurant?.id || 0 : restaurant?.id || 0;
  const visibleMessages = useMemo(
    () =>
      activeMsgStoreId > 0
        ? messages.filter((m) => m.restaurantId === activeMsgStoreId)
        : messages,
    [messages, activeMsgStoreId]
  );

  const totalGross = ledger.reduce((s, l) => s + l.grossAmount, 0);
  const totalNet = ledger.reduce((s, l) => s + l.netRestaurantAmount, 0);
  const analytics = useMemo(
    () => buildVendorAnalytics(orders, ledger, menuItems),
    [orders, ledger, menuItems]
  );
  const activeTrendSeries =
    trendRange === 'daily' ? analytics.dailySeries : analytics.monthlySeries;
  const topChartItems = analytics.topSellingItems.slice(0, 6).map((item) => ({
    ...item,
    shortName:
      (lang === 'bn' ? item.nameBn : item.name).length > 18
        ? `${(lang === 'bn' ? item.nameBn : item.name).slice(0, 17)}…`
        : lang === 'bn'
        ? item.nameBn
        : item.name,
  }));

  const navItems: Array<{
    id: VendorTab;
    labelBn: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeTone?: 'pink' | 'amber';
  }> = [
    {
      id: 'orders',
      labelBn: 'অর্ডার ও ডিসপ্যাচ',
      labelEn: 'Orders & Dispatch',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeTone: 'pink',
    },
    {
      id: 'menu',
      labelBn: 'পণ্য ও স্টক এডিট',
      labelEn: 'Products & Stock',
      icon: Utensils,
      badge: stockStats.outOfStock > 0 ? stockStats.outOfStock : undefined,
      badgeTone: 'amber',
    },
    {
      id: 'riders',
      labelBn: 'ডেলিভারি ম্যান ও রাইডার জব',
      labelEn: 'Delivery Men & Rider Jobs',
      icon: Briefcase,
      badge: pendingRiderAppsCount > 0 ? pendingRiderAppsCount : undefined,
      badgeTone: 'pink',
    },
    {
      id: 'messages',
      labelBn: 'অ্যাডমিন মেসেজ',
      labelEn: 'Message Admin',
      icon: MessageSquare,
      badge: unreadMessages > 0 ? unreadMessages : undefined,
      badgeTone: 'pink',
    },
    {
      id: 'analytics',
      labelBn: 'বিক্রয় অ্যানালিটিক্স',
      labelEn: 'Analytics',
      icon: BarChart3,
    },
    {
      id: 'earnings',
      labelBn: 'আয় ও পেআউট',
      labelEn: 'Earnings & Payouts',
      icon: Wallet,
    },
    {
      id: 'settings',
      labelBn: 'স্টোর সেটিংস',
      labelEn: 'Store Settings',
      icon: Settings,
    },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-44 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'রেস্টুরেন্ট ড্যাশবোর্ড লোড হচ্ছে...' : 'Loading Restaurant Partner Hub...'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* Top Utility Header */}
      <div className="bg-white rounded-2xl border border-neutral-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700 hover:text-[#E21B70] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'স্টোরফ্রন্ট' : 'Storefront'}</span>
          </button>

          {restaurant && !showOnboarding && (
            <div className="flex items-center gap-2.5">
              {restaurant.logoUrl ? (
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  className="w-9 h-9 rounded-lg object-cover border border-neutral-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold text-[#2E3138] leading-tight">
                    {isAllStoresView
                      ? lang === 'bn'
                        ? `সকল নিজস্ব রেস্টুরেন্ট (${allRestaurants.length})`
                        : `All My Restaurants (${allRestaurants.length})`
                      : lang === 'bn'
                      ? restaurant.nameBn
                      : restaurant.name}
                  </h1>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      restaurant.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {restaurant.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  {restaurant.area} · {restaurant.cuisine} · Commission {restaurant.commissionRate}%
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {restaurant && !showOnboarding && allRestaurants.length > 1 && (
            <select
              value={selectedRestaurantId ?? restaurant.id}
              onChange={(e) => setSelectedRestaurantId(Number(e.target.value))}
              aria-label="Switch Restaurant Branch"
              className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-[#2E3138] max-w-[230px]"
            >
              <option value={-1}>
                {isSuperAdmin
                  ? lang === 'bn'
                    ? `সকল স্টোর (${allRestaurants.length})`
                    : `All My Stores (${allRestaurants.length})`
                  : lang === 'bn'
                  ? `সকল শাখা (${allRestaurants.length})`
                  : `All My Branches (${allRestaurants.length})`}
              </option>
              {allRestaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {lang === 'bn' ? r.nameBn : r.name}
                </option>
              ))}
            </select>
          )}

          {restaurant && !showOnboarding && !isAllStoresView && (
            <button
              type="button"
              onClick={handleToggleOpen}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                restaurant.isOpen
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              {restaurant.isOpen
                ? lang === 'bn'
                  ? 'কিচেন খোলা'
                  : 'Kitchen Open'
                : lang === 'bn'
                ? 'কিচেন বন্ধ'
                : 'Kitchen Paused'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const next = !orderSoundEnabled;
              setOrderSoundEnabled(next);
              if (next) {
                void playOrderAlertChime('new_order', { force: true });
                showNotice(
                  lang === 'bn'
                    ? 'অর্ডার সাউন্ড চালু হয়েছে।'
                    : 'Order alert chime enabled.',
                  true
                );
              } else {
                showNotice(lang === 'bn' ? 'অর্ডার সাউন্ড মিউট হয়েছে।' : 'Order sound muted.', true);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              orderSoundEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-neutral-100 text-neutral-600 border-neutral-200'
            }`}
          >
            {orderSoundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-neutral-500" />
            )}
            <span className="hidden sm:inline">
              {orderSoundEnabled
                ? lang === 'bn'
                  ? 'সাউন্ড চালু'
                  : 'Sound On'
                : lang === 'bn'
                ? 'সাউন্ড বন্ধ'
                : 'Muted'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => loadWorkspace(selectedRestaurantId, false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700"
            title={lang === 'bn' ? 'রিফ্রেশ করুন' : 'Refresh workspace'}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'bn' ? 'রিফ্রেশ' : 'Sync'}</span>
          </button>

          {restaurant && (
            <button
              type="button"
              onClick={openAddBranchModal}
              className="px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'শাখা যোগ করুন' : 'Add Branch'}</span>
            </button>
          )}

          {restaurant && isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setShowOnboarding((v) => !v);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#FFF0F6] border border-[#E21B70]/30 text-xs font-semibold text-[#E21B70] hover:bg-[#FFE4EF] inline-flex items-center gap-1"
            >
              {showOnboarding ? (
                <span>{lang === 'bn' ? 'ড্যাশবোর্ডে ফিরুন' : 'Back to Hub'}</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'নতুন স্টোর' : 'Add Store'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`px-4 py-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded hover:bg-black/5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showOnboarding || !restaurant ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-3xl mx-auto space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#E21B70]">
              {lang === 'bn' ? 'রেস্টুরেন্ট পার্টনার অনবোর্ডিং' : 'Multi-Vendor Onboarding'}
            </p>
            <h2 className="text-2xl font-bold text-[#2E3138] mt-1">
              {lang === 'bn'
                ? 'Foodora BD-তে আপনার রেস্টুরেন্ট যুক্ত করুন'
                : 'Launch Your Restaurant on Foodora BD'}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              {lang === 'bn'
                ? 'ট্রেড লাইসেন্স ও এনআইডি তথ্য দিয়ে আবেদন করুন। অনুমোদনের পর সরাসরি অর্ডার নিন।'
                : 'Complete business verification, kitchen coordinates, and payout setup.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
            {[
              { id: 1 as const, label: lang === 'bn' ? '১. রেস্টুরেন্ট তথ্য' : '1. Business Profile' },
              {
                id: 2 as const,
                label: lang === 'bn' ? '২. ঠিকানা ও ম্যাপ পিন' : '2. Location & Delivery',
              },
              { id: 3 as const, label: lang === 'bn' ? '৩. লাইসেন্স ও পেআউট' : '3. KYC & Payouts' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`py-2.5 px-3 rounded-xl border text-center ${
                  step === s.id
                    ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                    : 'border-neutral-200 text-neutral-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleRegisterRestaurant} className="space-y-4">
            {step === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'মালিকের নাম' : 'Owner Full Name'}
                    </label>
                    <input
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'কুইজিন ধরন' : 'Primary Cuisine'}
                    </label>
                    <SelectWithCustom
                      required
                      lang={lang}
                      value={cuisine}
                      onChange={setCuisine}
                      storageKey="cuisines"
                      ariaLabel="Primary Cuisine"
                      placeholder={
                        lang === 'bn'
                          ? 'কাস্টম কুইজিন লিখুন (যেমন: সি-ফুড, মেজবানি)'
                          : 'Custom cuisine (e.g. Seafood, Mezbani, Thai)'
                      }
                      customOptionLabel={
                        lang === 'bn' ? '+ কাস্টম কুইজিন যোগ...' : '+ Add Custom Cuisine...'
                      }
                      presets={CUISINE_PRESET_OPTIONS.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Restaurant Name (English)
                    </label>
                    <input
                      required
                      value={restName}
                      onChange={(e) => setRestName(e.target.value)}
                      placeholder="e.g. Dhaka Heritage Kitchen"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      রেস্টুরেন্টের নাম (বাংলা)
                    </label>
                    <input
                      required
                      value={restNameBn}
                      onChange={(e) => setRestNameBn(e.target.value)}
                      placeholder="যেমন: ঢাকা হেরিটেজ কিচেন"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'রেস্টুরেন্ট বিবরণ' : 'Short Description'}
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Authentic charcoal kababs, biriyani & Bengali platters"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'রেস্টুরেন্ট লোগো (ঐচ্ছিক)' : 'Restaurant Logo (Optional)'}
                    </label>
                    <div className="flex items-center gap-2">
                      {regLogoUrl && (
                        <img
                          src={regLogoUrl}
                          alt="Logo preview"
                          className="w-9 h-9 rounded-lg object-cover border border-neutral-200 shrink-0"
                        />
                      )}
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-xs font-semibold shrink-0">
                        <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                        <span>{uploadingImage ? 'Uploading...' : 'Upload Logo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) uploadProductPhoto(f, (url) => setRegLogoUrl(url));
                          }}
                        />
                      </label>
                      <input
                        type="text"
                        value={regLogoUrl}
                        onChange={(e) => setRegLogoUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-2.5 py-2 text-xs border border-neutral-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'কভার ছবি (ঐচ্ছিক)' : 'Cover Image (Optional)'}
                    </label>
                    <div className="flex items-center gap-2">
                      {regCoverUrl && (
                        <img
                          src={regCoverUrl}
                          alt="Cover preview"
                          className="w-12 h-9 rounded-lg object-cover border border-neutral-200 shrink-0"
                        />
                      )}
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-xs font-semibold shrink-0">
                        <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                        <span>{uploadingImage ? 'Uploading...' : 'Upload Cover'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) uploadProductPhoto(f, (url) => setRegCoverUrl(url));
                          }}
                        />
                      </label>
                      <input
                        type="text"
                        value={regCoverUrl}
                        onChange={(e) => setRegCoverUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-2.5 py-2 text-xs border border-neutral-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-5 py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
                  >
                    {lang === 'bn' ? 'পরবর্তী ধাপ' : 'Next: Location'} →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn'
                        ? 'শহর / এলাকা নির্বাচন (সারা বাংলাদেশ + কাস্টম এলাকা)'
                        : 'City / Area (All Bangladesh + Custom Area)'}
                    </label>
                    <SelectWithCustom
                      required
                      lang={lang}
                      value={area}
                      onChange={setArea}
                      storageKey="bd_areas"
                      ariaLabel="Restaurant city or area"
                      placeholder={
                        lang === 'bn'
                          ? 'কাস্টম এলাকা লিখুন (যেমন: রামপুরা, ঢাকা বা সিলেট জিন্দাবাজার)'
                          : 'Type custom area (e.g. Rampura, Dhaka or Zindabazar, Sylhet)'
                      }
                      customOptionLabel={
                        lang === 'bn'
                          ? '+ কাস্টম এলাকা যোগ করুন (ঢাকা/বাংলাদেশ)...'
                          : '+ Add Custom Area (Dhaka / All Bangladesh)...'
                      }
                      presets={getBangladeshAreaSelectPresets(lang)}
                      onSelectPreset={(val) => {
                        const found = BANGLADESH_AREAS.find((a) => a.name === val);
                        if (found) {
                          setCoords({ lat: found.lat, lng: found.lng });
                          const formatted = formatResolvedMapAddress({
                            areaName: found.name,
                            lat: found.lat,
                            lng: found.lng,
                          });
                          if (formatted) setAddress(formatted);
                        }
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'বিস্তারিত কিচেন ঠিকানা' : 'Full Kitchen Address'}
                    </label>
                    <input
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={`Road 12, House 8, ${area}, Bangladesh`}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'ডেলিভারি মডেল' : 'Delivery Fulfillment Mode'}
                    </label>
                    <select
                      value={deliveryMode}
                      onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                    >
                      <option value="platform">Foodora BD Riders (Platform Fleet)</option>
                      <option value="third_party">Pathao Courier Integration</option>
                      <option value="restaurant">Restaurant Own Fleet</option>
                    </select>
                  </div>
                </div>

                <DhakaMapPicker
                  mapsApiKey={mapsApiKey}
                  lang={lang}
                  center={coords}
                  markerLabel={restName || area}
                  pinType="vendor"
                  restaurantName={restName}
                  interactive
                  heightClass="h-[200px]"
                  onSelectLocation={(c) => {
                    setCoords({ lat: c.lat, lng: c.lng });
                    if (c.areaName) setArea(c.areaName);
                    const formatted = formatResolvedMapAddress({
                      displayName: c.displayName,
                      areaName: c.areaName,
                      lat: c.lat,
                      lng: c.lng,
                    });
                    if (formatted) setAddress(formatted);
                  }}
                />

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold"
                  >
                    ← {lang === 'bn' ? 'পূর্ববর্তী' : 'Back'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-5 py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
                  >
                    {lang === 'bn' ? 'পরবর্তী: লাইসেন্স ও পেআউট' : 'Next: KYC & Payouts'} →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'বিজনেস ফোন' : 'Business Phone'}
                    </label>
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'ব্যবসায়িক ইমেইল' : 'Business Email'}
                    </label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'ট্রেড লাইসেন্স নম্বর' : 'Trade License Number'}
                    </label>
                    <input
                      required
                      value={tradeLicense}
                      onChange={(e) => setTradeLicense(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'মালিকের এনআইডি (NID)' : 'Owner NID Number'}
                    </label>
                    <input
                      required
                      value={nidNumber}
                      onChange={(e) => setNidNumber(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'পেআউট মাধ্যম' : 'Payout Method'}
                    </label>
                    <SelectWithCustom
                      required
                      lang={lang}
                      value={payoutMethod}
                      onChange={setPayoutMethod}
                      storageKey="payout_methods"
                      ariaLabel="Payout method"
                      placeholder={
                        lang === 'bn'
                          ? 'কাস্টম পেআউট মাধ্যম (যেমন: Rocket / Upay)'
                          : 'Custom payout method (e.g. Upay / Cellfin)'
                      }
                      customOptionLabel={
                        lang === 'bn' ? '+ কাস্টম পেআউট মাধ্যম যোগ...' : '+ Add Custom Payout Method...'
                      }
                      presets={[
                        { value: 'bkash', label: 'bKash Merchant / Personal' },
                        { value: 'nagad', label: 'Nagad Merchant' },
                        { value: 'rocket', label: 'Rocket Mobile Banking' },
                        { value: 'bank', label: 'Bank Account (BEFTN)' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'অ্যাকাউন্ট নম্বর' : 'Payout Account Number'}
                    </label>
                    <input
                      required
                      value={payoutAccount}
                      onChange={(e) => setPayoutAccount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold"
                  >
                    ← {lang === 'bn' ? 'পূর্ববর্তী' : 'Back'}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReg}
                    className="px-6 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {submittingReg
                      ? lang === 'bn'
                        ? 'আবেদন জমা হচ্ছে...'
                        : 'Submitting...'
                      : lang === 'bn'
                      ? 'আবেদন জমা দিন'
                      : 'Submit Partner Application'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      ) : (
        <>
          {liveNewOrderAlert && (
            <div
              role="status"
              data-testid="vendor-live-order-alert"
              className="rounded-2xl bg-[#FFF0F6] border border-[#E21B70]/40 p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#E21B70] text-white flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#2E3138]">
                    {lang === 'bn'
                      ? `নতুন অর্ডার এসেছে! ${liveNewOrderAlert.orderNumber}`
                      : `New Order Arrived! ${liveNewOrderAlert.orderNumber}`}
                  </p>
                  <p className="text-xs text-neutral-600 tabular-nums">
                    {liveNewOrderAlert.customerName}
                    {liveNewOrderAlert.totalAmount > 0
                      ? ` · ${formatBdt(liveNewOrderAlert.totalAmount, lang)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTab('orders');
                    setLiveNewOrderAlert(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-bold hover:bg-[#C4135E]"
                >
                  {lang === 'bn' ? 'অর্ডার দেখুন ও ডিসপ্যাচ করুন' : 'View & Dispatch Order'}
                </button>
                <button
                  type="button"
                  onClick={() => setLiveNewOrderAlert(null)}
                  aria-label="Dismiss new order alert"
                  className="p-2 rounded-lg text-neutral-500 hover:bg-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Main SaaS 240px Sidebar + Workspace Shell */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            {/* Desktop 240px Left Workspace Sidebar */}
            <aside className="hidden lg:flex w-[240px] shrink-0 flex-col gap-3 sticky top-20">
              <div className="bg-white rounded-2xl border border-neutral-200 p-3 space-y-1">
                <p className="px-2.5 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  {lang === 'bn' ? 'রেস্টুরেন্ট ওয়ার্কস্পেস' : 'Restaurant Hub'}
                </p>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-[#E21B70] text-white'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          {lang === 'bn' ? item.labelBn : item.labelEn}
                        </span>
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                            active
                              ? 'bg-white/20 text-white'
                              : item.badgeTone === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-pink-100 text-[#E21B70]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="bg-white rounded-2xl border border-neutral-200 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'bn' ? 'ওনার আইসোলেশন সক্রিয়' : 'Owner Isolation Active'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  {lang === 'bn'
                    ? 'আপনি শুধুমাত্র আপনার নিজের রেস্টুরেন্টের অর্ডার, স্টক, রাইডার নিয়োগ ও অ্যাডমিন মেসেজ দেখতে ও পরিচালনা করতে পারবেন।'
                    : 'Orders, product stock, rider dispatch, job posts, and admin messages are strictly scoped to your owned restaurant(s).'}
                </p>
              </div>
            </aside>

            {/* Mobile Compact Tab Strip */}
            <div className="lg:hidden w-full overflow-x-auto pb-1">
              <div className="inline-flex gap-1.5 min-w-full">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border whitespace-nowrap ${
                        active
                          ? 'bg-[#E21B70] text-white border-[#E21B70]'
                          : 'bg-white text-neutral-700 border-neutral-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? item.labelBn : item.labelEn}</span>
                      {item.badge !== undefined && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold tabular-nums ${
                            active ? 'bg-white/20 text-white' : 'bg-pink-100 text-[#E21B70]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Workspace Content */}
            <main className="flex-1 min-w-0 w-full space-y-5">
              {/* Multi-Store Selector Banner if All Stores is active */}
              {isAllStoresView && (
                <div className="bg-white rounded-xl border border-neutral-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-600">
                    {lang === 'bn'
                      ? 'একাধিক স্টোরের ডেটা একসাথে দেখছেন। নতুন পণ্য/জব বা সেটিংসের জন্য লক্ষ্য স্টোর নির্বাচন করুন:'
                      : 'Viewing combined data across all your stores. Target store for adding items, jobs, or settings:'}
                  </span>
                  <select
                    value={activeStoreForActions?.id || ''}
                    onChange={(e) => setTargetStoreId(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 font-semibold text-[#2E3138]"
                  >
                    {allRestaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {lang === 'bn' ? r.nameBn : r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ---------------- TAB 1: ORDERS & DISPATCH ---------------- */}
              {tab === 'orders' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 tabular-nums">
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'আপনার মোট অর্ডার' : 'My Total Orders'}
                      </p>
                      <p className="text-2xl font-bold text-[#2E3138] mt-1">{orders.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'প্রস্তুতি / অপেক্ষমাণ' : 'Pending / Kitchen'}
                      </p>
                      <p className="text-2xl font-bold text-[#E21B70] mt-1">
                        {pendingOrdersCount}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'ডেলিভারির পথে' : 'Out for Delivery'}
                      </p>
                      <p className="text-2xl font-bold text-blue-700 mt-1">
                        {activeDeliveryCount}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'নিট রেস্টুরেন্ট আয়' : 'Net Vendor Earnings'}
                      </p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">
                        {formatBdt(totalNet, lang)}
                      </p>
                    </div>
                  </div>

                  {/* Filter + Search Bar */}
                  <div className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'all' as const, en: 'All', bn: 'সব' },
                        { id: 'pending' as const, en: 'New / Accepted', bn: 'নতুন / গৃহীত' },
                        { id: 'preparing' as const, en: 'Preparing', bn: 'রান্না চলছে' },
                        { id: 'ready' as const, en: 'Ready', bn: 'প্রস্তুত' },
                        { id: 'dispatched' as const, en: 'Rider Assigned', bn: 'রাইডার পথে' },
                        { id: 'delivered' as const, en: 'Delivered', bn: 'সম্পন্ন' },
                        { id: 'cancelled' as const, en: 'Cancelled', bn: 'বাতিল' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOrderFilter(f.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            orderFilter === f.id
                              ? 'bg-[#2E3138] text-white'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                          }`}
                        >
                          {lang === 'bn' ? f.bn : f.en}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder={
                          lang === 'bn'
                            ? 'অর্ডার #, কাস্টমার বা এলাকা খুঁজুন...'
                            : 'Search order #, customer, area...'
                        }
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg focus:outline-none focus:border-[#E21B70]"
                      />
                    </div>
                  </div>

                  {/* Orders List */}
                  {filteredOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center text-sm text-neutral-500">
                      {orders.length === 0
                        ? lang === 'bn'
                          ? 'আপনার রেস্টুরেন্টে এখনও কোনো অর্ডার আসেনি।'
                          : 'No orders received for your restaurant yet.'
                        : lang === 'bn'
                        ? 'ফিল্টারের সাথে কোনো অর্ডার মেলেনি।'
                        : 'No orders match your current search or filter.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredOrders.map((ord) => {
                        const isPrepaidLocked =
                          ord.paymentMethod !== 'cod' &&
                          ord.paymentStatus !== 'paid' &&
                          ord.status !== 'cancelled';
                        const isPrepaidVerified =
                          ord.paymentMethod !== 'cod' && ord.paymentStatus === 'paid';
                        const onlineFoodAmount =
                          typeof ord.onlineFoodPaidAmount === 'number'
                            ? ord.onlineFoodPaidAmount
                            : ord.paymentMethod === 'cod'
                            ? 0
                            : Math.max(0, ord.totalAmount - ord.deliveryFee);
                        const cashToRiderAmount =
                          typeof ord.cashDueToRider === 'number'
                            ? ord.cashDueToRider
                            : ord.paymentMethod === 'cod'
                            ? ord.totalAmount
                            : ord.deliveryFee;
                        const canDispatch =
                          ord.status !== 'delivered' && ord.status !== 'cancelled';
                        const selectedRiderUid =
                          riderSelectionByOrder[ord.id] ?? ord.riderUid ?? '';
                        return (
                          <div
                            key={ord.id}
                            data-testid={`vendor-order-card-${ord.id}`}
                            className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0 flex-1">
                                <p className="text-xs font-mono-nums text-neutral-500">
                                  {ord.restaurantName ? `${ord.restaurantName} · ` : ''}
                                  <strong className="text-[#2E3138]">{ord.orderNumber}</strong> ·{' '}
                                  {ord.customerName} ({ord.customerPhone}) ·{' '}
                                  {ord.paymentMethod.toUpperCase()} ({ord.paymentStatus})
                                </p>
                                <p className="font-bold text-sm text-[#2E3138]">
                                  {ord.itemsSnapshotJson
                                    .map(
                                      (i) =>
                                        `${i.quantity}x ${lang === 'bn' ? i.nameBn : i.name}`
                                    )
                                    .join(', ')}
                                </p>
                                <p className="text-xs text-neutral-600 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <span>
                                    {ord.deliveryArea} — {ord.deliveryAddress}
                                  </span>
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                                  {isPrepaidVerified && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                                      <ShieldCheck className="w-3 h-3" />
                                      <span>
                                        {lang === 'bn'
                                          ? `অনলাইন খাবার পেমেন্ট যাচাইকৃত (${formatBdt(onlineFoodAmount, lang)})`
                                          : `Online Food Verified (${formatBdt(onlineFoodAmount, lang)})`}
                                      </span>
                                    </span>
                                  )}
                                  {isPrepaidLocked && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 font-semibold">
                                      <span>
                                        {lang === 'bn'
                                          ? `প্রিপেইড পেমেন্ট বাকি (${formatBdt(onlineFoodAmount, lang)}) — প্রসেসিং লকড`
                                          : `Prepaid Pending (${formatBdt(onlineFoodAmount, lang)}) — Locked`}
                                      </span>
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 font-medium tabular-nums">
                                    {lang === 'bn'
                                      ? `রাইডারকে ক্যাশ (ডেলিভারি): ${formatBdt(cashToRiderAmount, lang)}`
                                      : `Cash to Rider (Delivery): ${formatBdt(cashToRiderAmount, lang)}`}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right tabular-nums shrink-0">
                                <span
                                  className={`inline-block text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                                    ord.status === 'delivered'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : ord.status === 'cancelled'
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-[#FFF0F6] text-[#E21B70]'
                                  }`}
                                >
                                  {ord.status.replace(/_/g, ' ')}
                                </span>
                                <p className="text-xs font-bold text-[#2E3138] mt-1">
                                  Total: {formatBdt(ord.totalAmount, lang)}
                                </p>
                                <p className="text-[11px] text-emerald-700 font-semibold">
                                  Net: {formatBdt(ord.restaurantEarnings, lang)}
                                </p>
                              </div>
                            </div>

                            {isPrepaidLocked && (
                              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                                {lang === 'bn'
                                  ? 'অনলাইনে খাবারের মূল্য পরিশোধ ও যাচাই না হওয়া পর্যন্ত অর্ডার গ্রহণ, রান্না বা রাইডার ডিসপ্যাচ করা যাবে না।'
                                  : 'Online food payment must be verified before kitchen preparation or rider dispatch can proceed.'}
                              </div>
                            )}

                            {/* Action Bar: Kitchen Steps + Rider Assignment + Live Track */}
                            <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                {ord.status === 'confirmed' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isPrepaidLocked}
                                      onClick={() => handleOrderStatus(ord.id, 'accepted')}
                                      className="px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {lang === 'bn' ? 'অর্ডার গ্রহণ করুন' : 'Accept Order'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOrderStatus(ord.id, 'cancelled')}
                                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold"
                                    >
                                      {lang === 'bn' ? 'বাতিল' : 'Reject'}
                                    </button>
                                  </>
                                )}
                                {ord.status === 'accepted' && (
                                  <button
                                    type="button"
                                    disabled={isPrepaidLocked}
                                    onClick={() => handleOrderStatus(ord.id, 'preparing')}
                                    className="px-3 py-1.5 rounded-lg bg-[#2E3138] hover:bg-black text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {lang === 'bn' ? 'রান্না শুরু করুন' : 'Start Preparing'}
                                  </button>
                                )}
                                {ord.status === 'preparing' && (
                                  <button
                                    type="button"
                                    disabled={isPrepaidLocked}
                                    onClick={() => handleOrderStatus(ord.id, 'ready')}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {lang === 'bn' ? 'পিকআপের জন্য প্রস্তুত' : 'Mark Ready'}
                                  </button>
                                )}
                                {(ord.status === 'ready' ||
                                  ord.status === 'rider_assigned' ||
                                  ord.status === 'picked_up' ||
                                  ord.status === 'on_the_way') && (
                                  <button
                                    type="button"
                                    disabled={isPrepaidLocked}
                                    onClick={() => handleOrderStatus(ord.id, 'delivered')}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {lang === 'bn' ? 'ডেলিভারি সম্পন্ন' : 'Mark Delivered'}
                                  </button>
                                )}

                                {onTrackOrder && (
                                  <button
                                    type="button"
                                    onClick={() => onTrackOrder(ord.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-neutral-700"
                                  >
                                    <Navigation className="w-3.5 h-3.5 text-[#E21B70]" />
                                    <span>{lang === 'bn' ? 'লাইভ ট্র্যাক' : 'Track Live'}</span>
                                  </button>
                                )}
                              </div>

                              {/* Rider Dispatch Box */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {ord.riderName && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>{ord.riderName}</span>
                                  </span>
                                )}
                                {canDispatch && (
                                  <>
                                    <select
                                      aria-label={`Assign rider for order ${ord.orderNumber}`}
                                      disabled={isPrepaidLocked}
                                      value={selectedRiderUid}
                                      onChange={(e) =>
                                        setRiderSelectionByOrder((prev) => ({
                                          ...prev,
                                          [ord.id]: e.target.value,
                                        }))
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-medium text-[#2E3138] max-w-[200px] disabled:opacity-50"
                                    >
                                      <option value="">
                                        {lang === 'bn' ? '-- রাইডার বাছাই --' : '-- Select Rider --'}
                                      </option>
                                      {availableRiders.map((r) => (
                                        <option key={r.uid} value={r.uid}>
                                          {r.isOwnRider ? '★ [Own] ' : ''}
                                          {r.isAvailable ? '● ' : '○ '}
                                          {r.fullName} ({r.zone}
                                          {r.distanceKm !== null ? ` · ${r.distanceKm}km` : ''})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={
                                        isPrepaidLocked ||
                                        dispatchingOrderId === ord.id ||
                                        !selectedRiderUid
                                      }
                                      onClick={() =>
                                        handleAssignRider(ord.id, { riderUid: selectedRiderUid })
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-[#2E3138] hover:bg-black text-white text-xs font-semibold disabled:opacity-40"
                                    >
                                      {dispatchingOrderId === ord.id
                                        ? '...'
                                        : lang === 'bn'
                                        ? 'রাইডার দিন'
                                        : 'Assign'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isPrepaidLocked || dispatchingOrderId === ord.id}
                                      onClick={() =>
                                        handleAssignRider(ord.id, { autoAssignNearest: true })
                                      }
                                      title={
                                        lang === 'bn'
                                          ? 'সবচেয়ে কাছের অনলাইন রাইডার স্বয়ংক্রিয়ভাবে দিন'
                                          : 'Automatically assign nearest online rider'
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-[#FFF0F6] border border-[#E21B70]/30 text-[#E21B70] hover:bg-[#FFE4EF] text-xs font-semibold disabled:opacity-40"
                                    >
                                      {lang === 'bn' ? 'অটো রাইডার' : 'Auto Nearest'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- TAB 2: PRODUCTS & STOCK EDIT ---------------- */}
              {tab === 'menu' && (
                <div className="space-y-4">
                  {/* Stock KPI Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'মোট পণ্য' : 'Total Products'}
                      </p>
                      <p className="text-2xl font-bold text-[#2E3138] mt-1">{stockStats.total}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'স্টকে আছে' : 'In Stock'}
                      </p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">
                        {stockStats.inStock}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'স্টক আউট' : 'Out of Stock'}
                      </p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">
                        {stockStats.outOfStock}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'লুকানো / বন্ধ' : 'Unavailable'}
                      </p>
                      <p className="text-2xl font-bold text-neutral-600 mt-1">
                        {stockStats.hidden}
                      </p>
                    </div>
                  </div>

                  {/* Action & Filter Toolbar */}
                  <div className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'all' as const, en: 'All Items', bn: 'সব পণ্য' },
                        { id: 'in_stock' as const, en: 'In Stock', bn: 'স্টকে আছে' },
                        { id: 'out_of_stock' as const, en: 'Out of Stock', bn: 'স্টক শেষ' },
                      ].map((sf) => (
                        <button
                          key={sf.id}
                          type="button"
                          onClick={() => setStockFilter(sf.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            stockFilter === sf.id
                              ? 'bg-[#2E3138] text-white'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                          }`}
                        >
                          {lang === 'bn' ? sf.bn : sf.en}
                        </button>
                      ))}

                      <div className="relative w-52">
                        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="search"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder={lang === 'bn' ? 'খাবার খুঁজুন...' : 'Search menu...'}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:outline-none focus:border-[#E21B70]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPosSyncPanel((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] text-xs font-semibold text-neutral-700"
                      >
                        <Code2 className="w-3.5 h-3.5 text-[#E21B70]" />
                        <span>{lang === 'bn' ? 'POS / API সিঙ্ক' : 'Partner POS API'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddProductPanel((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {showAddProductPanel
                            ? lang === 'bn'
                              ? 'ফর্ম বন্ধ করুন'
                              : 'Hide Form'
                            : lang === 'bn'
                            ? 'নতুন খাবার যোগ করুন'
                            : 'Add Menu Item'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Add Product Panel */}
                  {showAddProductPanel && (
                    <form
                      onSubmit={handleAddFoodItem}
                      className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-[#E21B70]" />
                          <span>
                            {lang === 'bn' ? 'নতুন খাবার যোগ করুন' : 'Publish New Menu Item'}
                            {activeStoreForActions ? ` · ${activeStoreForActions.name}` : ''}
                          </span>
                        </h2>

                        {/* Free TheMealDB Recipe Quick-Fill */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={mealQuery}
                            onChange={(e) => setMealQuery(e.target.value)}
                            placeholder="Recipe idea: biryani..."
                            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg w-44"
                          />
                          <button
                            type="button"
                            onClick={handleSearchMeals}
                            disabled={loadingMeals}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FFF0F6] border border-[#E21B70]/25 text-[#E21B70] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{loadingMeals ? '...' : lang === 'bn' ? 'আইডিয়া' : 'Quick-Fill'}</span>
                          </button>
                        </div>
                      </div>

                      {mealResults.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl bg-neutral-50 border border-neutral-200">
                          {mealResults.map((meal) => (
                            <button
                              key={meal.id}
                              type="button"
                              onClick={() => {
                                setNewName(meal.name);
                                setNewCategory(meal.category || 'Main Course');
                                setNewDesc(meal.instructions);
                              }}
                              className="p-2 rounded-lg bg-white hover:border-[#E21B70] border border-neutral-200 flex items-center gap-2 text-left"
                            >
                              <img
                                src={meal.thumbUrl}
                                alt={meal.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded object-cover shrink-0 bg-neutral-100"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-[#2E3138] truncate">
                                  {meal.name}
                                </p>
                                <p className="text-[10px] text-neutral-500 truncate">
                                  {meal.category}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            Category
                          </label>
                          <SelectWithCustom
                            required
                            lang={lang}
                            value={newCategory}
                            onChange={setNewCategory}
                            storageKey="food_categories"
                            ariaLabel="Dish category"
                            placeholder="Custom category..."
                            customOptionLabel={
                              lang === 'bn' ? '+ কাস্টম ক্যাটাগরি যোগ...' : '+ Add Custom Category...'
                            }
                            presets={FOOD_CATEGORY_PRESET_OPTIONS.map((cat) => ({
                              value: cat,
                              label: cat,
                            }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            Dish Name (English)
                          </label>
                          <input
                            required
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g. Chicken Dum Biriyani"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            খাবারের নাম (বাংলা)
                          </label>
                          <input
                            required
                            value={newNameBn}
                            onChange={(e) => setNewNameBn(e.target.value)}
                            placeholder="যেমন: চিকেন দম বিরিয়ানি"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            Price (BDT ৳)
                          </label>
                          <input
                            required
                            type="number"
                            min="20"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            Offer Price (Optional)
                          </label>
                          <input
                            type="number"
                            min="10"
                            placeholder="e.g. 299"
                            value={newDiscountPrice}
                            onChange={(e) => setNewDiscountPrice(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'ছবি আপলোড / URL' : 'Dish Photo'}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-xs font-semibold shrink-0">
                              <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                              <span>{uploadingImage ? '...' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) uploadProductPhoto(file, (url) => setNewImageUrl(url));
                                }}
                              />
                            </label>
                            <input
                              type="text"
                              value={newImageUrl}
                              onChange={(e) => setNewImageUrl(e.target.value)}
                              placeholder="https://..."
                              className="flex-1 min-w-0 px-2.5 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Product Variants (Size / Portion) & Optional Add-ons Builder */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-neutral-100">
                        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-[#2E3138]">
                              {lang === 'bn'
                                ? 'প্রোডাক্ট ভ্যারিয়েন্ট (সাইজ / পরিমাণ)'
                                : 'Product Variants (Size / Portion)'}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setNewVariations([
                                    { name: 'Half', priceDelta: 0 },
                                    { name: 'Regular', priceDelta: 80 },
                                    { name: 'Full', priceDelta: 180 },
                                  ])
                                }
                                className="px-2 py-1 rounded-md border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-700 hover:border-[#E21B70]"
                              >
                                {lang === 'bn' ? 'প্রিসেট' : 'Half/Reg/Full'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setNewVariations((prev) => [
                                    ...prev,
                                    { name: '', priceDelta: 0 },
                                  ])
                                }
                                className="px-2 py-1 rounded-md bg-[#E21B70] text-white text-[10px] font-semibold"
                              >
                                + {lang === 'bn' ? 'ভ্যারিয়েন্ট' : 'Add Variant'}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {newVariations.map((v, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={v.name}
                                  onChange={(e) =>
                                    setNewVariations((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, name: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="e.g. Regular, Large, 1:1"
                                  aria-label={`New variant name ${idx + 1}`}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white"
                                />
                                <input
                                  type="number"
                                  value={v.priceDelta}
                                  onChange={(e) =>
                                    setNewVariations((prev) =>
                                      prev.map((row, i) =>
                                        i === idx
                                          ? { ...row, priceDelta: Number(e.target.value) || 0 }
                                          : row
                                      )
                                    )
                                  }
                                  placeholder="+৳"
                                  aria-label={`New variant price adjustment ${idx + 1}`}
                                  className="w-24 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white tabular-nums"
                                />
                                <button
                                  type="button"
                                  aria-label={`Remove variant ${idx + 1}`}
                                  onClick={() =>
                                    setNewVariations((prev) =>
                                      prev.length > 1
                                        ? prev.filter((_, i) => i !== idx)
                                        : [{ name: 'Regular', priceDelta: 0 }]
                                    )
                                  }
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-neutral-500">
                            {lang === 'bn'
                              ? 'মূল দামের সাথে +/- টাকা যোগ হবে (যেমন: 0 = বেস দাম, 120 = +৳১২০)।'
                              : 'Price delta added to base price (e.g. 0 = base price, 120 = +৳120).'}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-[#2E3138]">
                              {lang === 'bn'
                                ? 'ঐচ্ছিক অ্যাড-অন / টপিংস'
                                : 'Optional Add-ons / Extras'}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setNewAddons((prev) => [...prev, { name: '', price: 50 }])
                              }
                              className="px-2 py-1 rounded-md border border-neutral-200 bg-white hover:border-[#E21B70] text-[10px] font-semibold text-[#E21B70]"
                            >
                              + {lang === 'bn' ? 'অ্যাড-অন' : 'Add Extra'}
                            </button>
                          </div>
                          {newAddons.length === 0 ? (
                            <p className="text-[11px] text-neutral-500">
                              {lang === 'bn'
                                ? 'অতিরিক্ত চিজ, বোরহানি বা সালাদ যোগ করতে "+ অ্যাড-অন" চাপুন।'
                                : 'Optional extras like Extra Cheese, Borhani, or Egg (+৳).'}
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {newAddons.map((addon, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={addon.name}
                                    onChange={(e) =>
                                      setNewAddons((prev) =>
                                        prev.map((row, i) =>
                                          i === idx ? { ...row, name: e.target.value } : row
                                        )
                                      )
                                    }
                                    placeholder="e.g. Extra Cheese"
                                    aria-label={`New add-on name ${idx + 1}`}
                                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    value={addon.price}
                                    onChange={(e) =>
                                      setNewAddons((prev) =>
                                        prev.map((row, i) =>
                                          i === idx
                                            ? { ...row, price: Math.max(0, Number(e.target.value) || 0) }
                                            : row
                                        )
                                      )
                                    }
                                    placeholder="৳"
                                    aria-label={`New add-on price ${idx + 1}`}
                                    className="w-24 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white tabular-nums"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Remove add-on ${idx + 1}`}
                                    onClick={() =>
                                      setNewAddons((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <input
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                          placeholder={lang === 'bn' ? 'সংক্ষিপ্ত বিবরণ...' : 'Short description...'}
                          className="flex-1 min-w-[220px] px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                        />
                        <button
                          type="submit"
                          disabled={addingItem || uploadingImage}
                          className="px-5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {addingItem
                            ? lang === 'bn'
                              ? 'যোগ হচ্ছে...'
                              : 'Publishing...'
                            : lang === 'bn'
                            ? 'মেনুতে প্রকাশ করুন'
                            : 'Publish Item'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Collapsible Partner Product Sync REST API Integration Card */}
                  {showPosSyncPanel && (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-1.5">
                            <Code2 className="w-4 h-4 text-[#E21B70]" />
                            <span>
                              {lang === 'bn'
                                ? 'রেস্টুরেন্ট পার্টনার প্রোডাক্ট API (POS / ERP সিঙ্ক)'
                                : 'Restaurant Partner Product API (Automated Menu Sync)'}
                            </span>
                          </h3>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {lang === 'bn'
                              ? 'আপনার নিজস্ব POS, অ্যাপ বা স্ক্রিপ্ট থেকে সরাসরি X-Partner-API-Key ব্যবহার করে নতুন খাবার যোগ বা আপডেট করুন।'
                              : 'Connect your POS or inventory script using X-Partner-API-Key to sync products via REST JSON.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRotatePartnerKey}
                          disabled={rotatingKey}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${rotatingKey ? 'animate-spin' : ''}`} />
                          <span>
                            {apiKeyInfo?.hasKey
                              ? lang === 'bn'
                                ? 'নতুন API কী (Rotate)'
                                : 'Regenerate Key'
                              : lang === 'bn'
                              ? 'API কী তৈরি করুন'
                              : 'Generate API Key'}
                          </span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-neutral-700 inline-flex items-center gap-1">
                              <KeyRound className="w-3.5 h-3.5 text-[#E21B70]" />
                              <span>API Key Status</span>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                apiKeyInfo?.hasKey
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-neutral-200 text-neutral-600'
                              }`}
                            >
                              {apiKeyInfo?.hasKey ? apiKeyInfo.keyPrefix : 'Not Generated'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={revealedApiKey}
                              onChange={(e) => setRevealedApiKey(e.target.value)}
                              placeholder="fbd_live_..."
                              aria-label="Partner API Key"
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white font-mono-nums text-[11px]"
                            />
                            {revealedApiKey && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(revealedApiKey);
                                  setCopiedApiSnippet('key');
                                  setTimeout(() => setCopiedApiSnippet(null), 1500);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] text-neutral-700 font-semibold inline-flex items-center gap-1"
                              >
                                {copiedApiSnippet === 'key' ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedApiSnippet === 'key' ? 'Copied' : 'Copy'}</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const origin = window.location.origin;
                              const curlCmd = `curl -X POST "${origin}/api/partner/v1/products" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Partner-API-Key: ${
                                revealedApiKey || 'YOUR_PARTNER_API_KEY'
                              }" \\\n  -d '${partnerJsonInput.replace(/\s+/g, ' ')}'`;
                              navigator.clipboard?.writeText(curlCmd);
                              setCopiedApiSnippet('curl');
                              setTimeout(() => setCopiedApiSnippet(null), 1800);
                            }}
                            className="w-full py-1.5 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] text-xs font-semibold text-neutral-700 inline-flex items-center justify-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5 text-[#E21B70]" />
                            <span>
                              {copiedApiSnippet === 'curl' ? 'Copied cURL!' : 'Copy cURL Command'}
                            </span>
                          </button>
                        </div>

                        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                          <label className="block font-bold text-neutral-700">
                            {lang === 'bn'
                              ? 'লাইভ JSON প্রোডাক্ট পুশ করুন'
                              : 'Import JSON via Partner API'}
                          </label>
                          <textarea
                            rows={4}
                            value={partnerJsonInput}
                            onChange={(e) => setPartnerJsonInput(e.target.value)}
                            aria-label="Partner API Product JSON Payload"
                            className="w-full p-2 text-[11px] font-mono-nums bg-white border border-neutral-200 rounded-lg"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-neutral-500">
                              POST /api/partner/v1/products
                            </span>
                            <button
                              type="button"
                              onClick={handlePushPartnerApi}
                              disabled={pushingPartnerApi}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E3138] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{pushingPartnerApi ? 'Sending...' : 'Send API Request'}</span>
                            </button>
                          </div>
                          {partnerApiStatus && (
                            <p
                              role="status"
                              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg ${
                                partnerApiStatus.ok
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {partnerApiStatus.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scannable Products & Stock Table */}
                  <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                    {filteredMenuItems.length === 0 ? (
                      <div className="p-8 text-center text-sm text-neutral-500">
                        {lang === 'bn'
                          ? 'কোনো মেনু আইটেম পাওয়া যায়নি।'
                          : 'No menu products match your filter.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-100">
                        {filteredMenuItems.map((item) => (
                          <div
                            key={item.id}
                            className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-neutral-50/70 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-14 h-14 rounded-xl object-cover shrink-0 bg-neutral-100 border border-neutral-200"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-neutral-500 uppercase font-medium">
                                    {item.category}
                                  </span>
                                  {isAllStoresView && item.restaurantName && (
                                    <span className="text-[11px] text-[#E21B70] font-semibold">
                                      · {item.restaurantName}
                                    </span>
                                  )}
                                  {item.isVisibleOnStorefront === false && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                                      {lang === 'bn' ? 'অ্যাডমিন দ্বারা লুকানো' : 'Hidden by Admin'}
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-bold text-sm text-[#2E3138] truncate">
                                  {lang === 'bn' ? item.nameBn : item.name}
                                </h3>
                                <p className="text-xs font-bold text-[#E21B70] tabular-nums">
                                  {formatBdt(item.discountPrice ?? item.price, lang)}
                                  {item.discountPrice && (
                                    <span className="ml-2 text-neutral-400 line-through font-normal">
                                      {formatBdt(item.price, lang)}
                                    </span>
                                  )}
                                </p>
                                {(item.variationsJson?.length > 0 || item.addonsJson?.length > 0) && (
                                  <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                                    {item.variationsJson?.length > 0 &&
                                      `${item.variationsJson.length} variant(s): ${item.variationsJson
                                        .map((v) => v.name)
                                        .join(', ')}`}
                                    {item.addonsJson?.length > 0 &&
                                      ` · ${item.addonsJson.length} add-on(s)`}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleItemStock(item)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  item.inStock
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                }`}
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>
                                  {item.inStock
                                    ? lang === 'bn'
                                      ? 'স্টকে আছে'
                                      : 'In Stock'
                                    : lang === 'bn'
                                    ? 'স্টক শেষ'
                                    : 'Out of Stock'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleItemAvailable(item)}
                                title={
                                  lang === 'bn'
                                    ? 'মেনুতে দৃশ্যমানতা পরিবর্তন করুন'
                                    : 'Toggle availability on menu'
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  item.isAvailable
                                    ? 'border-neutral-200 bg-white text-neutral-700 hover:border-[#E21B70]'
                                    : 'border-neutral-300 bg-neutral-100 text-neutral-500'
                                }`}
                              >
                                {item.isAvailable ? (
                                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {item.isAvailable
                                    ? lang === 'bn'
                                      ? 'দৃশ্যমান'
                                      : 'Live'
                                    : lang === 'bn'
                                    ? 'বন্ধ'
                                    : 'Off'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setEditingItem({
                                    ...item,
                                    variationsJson:
                                      item.variationsJson && item.variationsJson.length > 0
                                        ? item.variationsJson.map((v) => ({ ...v }))
                                        : [{ name: 'Regular', priceDelta: 0 }],
                                    addonsJson: item.addonsJson
                                      ? item.addonsJson.map((a) => ({ ...a }))
                                      : [],
                                  })
                                }
                                aria-label={`Edit ${item.name}`}
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-700 hover:border-[#E21B70] inline-flex items-center gap-1"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>{lang === 'bn' ? 'এডিট' : 'Edit'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                aria-label={`Delete ${item.name}`}
                                className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---------------- TAB 3: DELIVERY MEN & RIDER JOBS ---------------- */}
              {tab === 'riders' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Column: Direct Add Delivery Man + Post a Rider Job */}
                    <div className="lg:col-span-5 space-y-5">
                      <form
                        onSubmit={handleAddDeliveryMan}
                        className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
                      >
                        <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#E21B70]" />
                          <span>
                            {lang === 'bn'
                              ? 'সরাসরি নিজস্ব ডেলিভারি ম্যান যোগ করুন'
                              : 'Add Delivery Man (Own Rider)'}
                          </span>
                        </h2>
                        <p className="text-xs text-neutral-500">
                          {lang === 'bn'
                            ? 'আপনার রেস্টুরেন্টের নিজস্ব ডেলিভারি ম্যান যোগ করলে সাথে সাথেই অর্ডার ডিসপ্যাচে পাওয়া যাবে।'
                            : 'Register your store delivery person directly for instant order dispatch.'}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'পুরো নাম' : 'Full Name'}
                            </label>
                            <input
                              required
                              value={dmName}
                              onChange={(e) => setDmName(e.target.value)}
                              placeholder="e.g. Arif Hasan"
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
                            </label>
                            <input
                              required
                              value={dmPhone}
                              onChange={(e) => setDmPhone(e.target.value)}
                              placeholder="017XXXXXXXX"
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'ইমেইল (লগইনের জন্য)' : 'Email Address'}
                            </label>
                            <input
                              required
                              type="email"
                              value={dmEmail}
                              onChange={(e) => setDmEmail(e.target.value)}
                              placeholder="rider@restaurant.bd"
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'পাসওয়ার্ড (ঐচ্ছিক)' : 'Rider Login Password'}
                            </label>
                            <input
                              type="password"
                              value={dmPassword}
                              onChange={(e) => setDmPassword(e.target.value)}
                              placeholder="Min 6 chars (optional)"
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'এলাকা / জোন' : 'Working Zone'}
                            </label>
                            <SelectWithCustom
                              required
                              lang={lang}
                              value={dmZone}
                              onChange={setDmZone}
                              storageKey="bd_areas"
                              ariaLabel="Delivery man working zone"
                              customOptionLabel={lang === 'bn' ? '+ কাস্টম জোন...' : '+ Custom Zone...'}
                              presets={getBangladeshAreaSelectPresets(lang)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'যানবাহন' : 'Vehicle Type'}
                            </label>
                            <select
                              value={dmVehicle}
                              onChange={(e) => setDmVehicle(e.target.value)}
                              aria-label="Delivery man vehicle type"
                              className="w-full px-2.5 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
                            >
                              <option value="Motorbike">Motorbike</option>
                              <option value="Bicycle">Bicycle</option>
                              <option value="E-Bike">E-Bike / Scooter</option>
                              <option value="On Foot">On Foot</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'এনআইডি নম্বর (ঐচ্ছিক)' : 'NID Number (Optional)'}
                          </label>
                          <input
                            value={dmNid}
                            onChange={(e) => setDmNid(e.target.value)}
                            placeholder="e.g. 1995269123456"
                            className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={addingDeliveryMan}
                          className="w-full py-2.5 rounded-xl bg-[#2E3138] hover:bg-black text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {addingDeliveryMan
                            ? lang === 'bn'
                              ? 'যোগ হচ্ছে...'
                              : 'Adding Delivery Man...'
                            : lang === 'bn'
                            ? 'ডেলিভারি ম্যান যোগ করুন'
                            : 'Add Delivery Man to Fleet'}
                        </button>
                      </form>

                      {/* Post a Rider Job Form */}
                      <form
                        onSubmit={handlePostRiderJob}
                        className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3 h-fit"
                      >
                        <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-[#E21B70]" />
                          <span>
                            {lang === 'bn'
                              ? 'নতুন রাইডার জব পোস্ট করুন'
                              : 'Post a Restaurant Rider Job'}
                          </span>
                        </h2>
                        <p className="text-xs text-neutral-500">
                          {lang === 'bn'
                            ? 'পোস্ট করলে রাইডার পোর্টালে সবাই আপনার রেস্টুরেন্টের জব দেখতে ও আবেদন করতে পারবে।'
                            : 'Published rider openings appear immediately on the Rider Portal for applicants.'}
                        </p>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'পদের নাম (ইংরেজি)' : 'Job Title (EN)'}
                          </label>
                          <input
                            required
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            placeholder="e.g. Delivery Rider (Evening Shift)"
                            className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'পদের নাম (বাংলা)' : 'Job Title (BN)'}
                          </label>
                          <input
                            value={jobTitleBn}
                            onChange={(e) => setJobTitleBn(e.target.value)}
                            placeholder="যেমন: ডেলিভারি রাইডার"
                            className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'এলাকা / জোন' : 'Delivery Zone'}
                            </label>
                            <SelectWithCustom
                              required
                              lang={lang}
                              value={jobZone}
                              onChange={setJobZone}
                              storageKey="bd_areas"
                              ariaLabel="Rider job delivery zone"
                              customOptionLabel={lang === 'bn' ? '+ কাস্টম জোন...' : '+ Custom Zone...'}
                              presets={getBangladeshAreaSelectPresets(lang)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'যানবাহন' : 'Vehicle Type'}
                            </label>
                            <select
                              value={jobVehicle}
                              onChange={(e) => setJobVehicle(e.target.value)}
                              className="w-full px-2.5 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
                            >
                              <option value="Motorbike">Motorbike</option>
                              <option value="Bicycle">Bicycle</option>
                              <option value="E-Bike">E-Bike / Scooter</option>
                              <option value="Any">Any Vehicle</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'বেতন / আয়' : 'Salary / Pay Range'}
                            </label>
                            <input
                              required
                              value={jobSalary}
                              onChange={(e) => setJobSalary(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              {lang === 'bn' ? 'পদ সংখ্যা' : 'Vacancies'}
                            </label>
                            <input
                              required
                              type="number"
                              min="1"
                              max="50"
                              value={jobVacancies}
                              onChange={(e) => setJobVacancies(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg tabular-nums"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'ডিউটি সময়' : 'Shift Hours'}
                          </label>
                          <input
                            required
                            value={jobShift}
                            onChange={(e) => setJobShift(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-1">
                            {lang === 'bn' ? 'শর্তাবলি ও বিবরণ' : 'Requirements / Notes'}
                          </label>
                          <textarea
                            rows={2}
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            placeholder={
                              lang === 'bn'
                                ? 'স্মার্টফোন ও এনআইডি থাকতে হবে, ফুয়েল বোনাস...'
                                : 'Valid license / NID required, per-order bonus included...'
                            }
                            className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={postingJob}
                          className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {postingJob
                            ? lang === 'bn'
                              ? 'পোস্ট হচ্ছে...'
                              : 'Publishing...'
                            : lang === 'bn'
                            ? 'রাইডার জব পোস্ট করুন'
                            : 'Publish Rider Job'}
                        </button>
                      </form>
                    </div>

                    {/* Right Column: Own & Approved Riders + Active Jobs + Rider Applicants */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* Own Added Delivery Men & Approved Riders */}
                      <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                            <Users className="w-4 h-4 text-[#E21B70]" />
                            <span>
                              {lang === 'bn'
                                ? 'আপনার ডেলিভারি ম্যান ও অনুমোদিত রাইডার'
                                : 'Your Delivery Men & Approved Dispatch Riders'}
                            </span>
                          </h3>
                          <span className="text-xs text-neutral-500 tabular-nums">
                            {availableRiders.filter((r) => r.isOwnRider).length} own ·{' '}
                            {availableRiders.length} total
                          </span>
                        </div>
                        {availableRiders.length === 0 ? (
                          <p className="text-xs text-neutral-500">
                            {lang === 'bn'
                              ? 'এখনো কোনো অনুমোদিত রাইডার পাওয়া যায়নি।'
                              : 'No approved riders found yet.'}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {availableRiders.map((r) => (
                              <div
                                key={r.uid}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                                  r.isOwnRider
                                    ? 'border-[#E21B70]/35 bg-[#FFF0F6]/40'
                                    : 'border-neutral-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-[#2E3138] truncate">{r.fullName}</p>
                                    {r.isOwnRider && (
                                      <span className="px-1.5 py-0.5 rounded bg-[#E21B70] text-white text-[9px] font-bold uppercase">
                                        {lang === 'bn' ? 'নিজস্ব' : 'Own'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-neutral-500 tabular-nums truncate">
                                    {r.phone} · {r.zone} · {r.vehicleType}
                                    {r.distanceKm !== null ? ` · ${r.distanceKm} km` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {r.isOwnRider ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleOwnRiderAvailability(r)}
                                        className={`px-2 py-1 rounded font-bold text-[10px] border ${
                                          r.isAvailable
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                        }`}
                                      >
                                        {r.isAvailable ? 'Online' : 'Offline'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveOwnRider(r)}
                                        aria-label={`Remove delivery man ${r.fullName}`}
                                        className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                        r.isAvailable
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-neutral-100 text-neutral-500'
                                      }`}
                                    >
                                      {r.isAvailable ? 'Online' : 'Offline'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Rider Applications */}
                      <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#E21B70]" />
                            <span>
                              {lang === 'bn'
                                ? 'রাইডার জব আবেদনসমূহ'
                                : 'Rider Job Applications'}
                            </span>
                          </h3>
                          <span className="text-xs text-neutral-500 tabular-nums">
                            {riderApps.length} {lang === 'bn' ? 'টি আবেদন' : 'applicants'}
                          </span>
                        </div>

                        {riderApps.length === 0 ? (
                          <p className="text-xs text-neutral-500 py-4 text-center">
                            {lang === 'bn'
                              ? 'এখনও কোনো রাইডার আবেদন জমা পড়েনি।'
                              : 'No rider applications received yet.'}
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {riderApps.map((app) => (
                              <div
                                key={app.id}
                                className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-[#2E3138]">
                                      {app.fullName}
                                    </p>
                                    <span
                                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                        app.status === 'hired'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : app.status === 'rejected'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {app.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-600 tabular-nums">
                                    {app.phone} · {app.email} · {app.vehicleType} · {app.zone}
                                  </p>
                                  {app.experienceNote && (
                                    <p className="text-[11px] text-neutral-500">
                                      {app.experienceNote}
                                    </p>
                                  )}
                                </div>

                                {app.status === 'pending' && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleApplicationStatus(app.id, 'hired')}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                                    >
                                      {lang === 'bn' ? 'নিয়োগ দিন (Hire)' : 'Hire as Rider'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleApplicationStatus(app.id, 'rejected')}
                                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold"
                                    >
                                      {lang === 'bn' ? 'বাতিল' : 'Reject'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Posted Rider Jobs */}
                      <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                        <h3 className="font-bold text-sm text-[#2E3138]">
                          {lang === 'bn' ? 'আপনার প্রকাশিত জব পোস্টসমূহ' : 'Published Rider Jobs'}
                        </h3>
                        {riderJobs.length === 0 ? (
                          <p className="text-xs text-neutral-500 py-4 text-center">
                            {lang === 'bn'
                              ? 'বাম পাশের ফর্ম থেকে প্রথম রাইডার জব পোস্ট করুন।'
                              : 'Post your first rider vacancy using the form on the left.'}
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {riderJobs.map((job) => (
                              <div
                                key={job.id}
                                className="p-3.5 rounded-xl border border-neutral-200 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-[#2E3138]">
                                      {lang === 'bn' ? job.titleBn : job.title}
                                    </p>
                                    <span
                                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                        job.isActive
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-neutral-100 text-neutral-600'
                                      }`}
                                    >
                                      {job.isActive ? 'Open' : 'Paused'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-500 tabular-nums">
                                    {job.restaurantName} · {job.zone} · {job.vehicleType} ·{' '}
                                    {job.salaryRange} · {job.vacancies} seat(s)
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleJobActive(job)}
                                    className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-700 hover:border-[#E21B70]"
                                  >
                                    {job.isActive
                                      ? lang === 'bn'
                                        ? 'বিরতি দিন'
                                        : 'Pause'
                                      : lang === 'bn'
                                      ? 'চালু করুন'
                                      : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRiderJob(job.id)}
                                    aria-label={`Delete rider job ${job.title}`}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- TAB 4: MESSAGE ADMIN ---------------- */}
              {tab === 'messages' && (
                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-[560px]">
                  <div className="px-5 py-3.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 bg-neutral-50/70">
                    <div>
                      <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#E21B70]" />
                        <span>
                          {lang === 'bn'
                            ? 'অ্যাডমিন ও সাপোর্ট টিমের সাথে সরাসরি মেসেজ'
                            : 'Direct Chat with Platform Admin'}
                        </span>
                      </h2>
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'bn'
                          ? 'পেআউট, রাইডার, অর্ডার বা মেনু সংক্রান্ত যেকোনো সাহায্য সরাসরি অ্যাডমিনকে জানান।'
                          : 'Ask Admin about payouts, dispatch support, store verification, or menu approvals.'}
                      </p>
                    </div>

                    {allRestaurants.length > 1 && (
                      <select
                        value={activeMsgStoreId}
                        onChange={(e) => setMsgStoreId(Number(e.target.value))}
                        aria-label="Select store thread"
                        className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#2E3138]"
                      >
                        {allRestaurants.map((r) => (
                          <option key={r.id} value={r.id}>
                            {lang === 'bn' ? r.nameBn : r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#FAFAFB]">
                    {visibleMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-xs text-neutral-500">
                        {lang === 'bn'
                          ? 'এখনো কোনো মেসেজ নেই। অ্যাডমিনকে প্রথম মেসেজ পাঠান।'
                          : 'No messages yet. Start a direct conversation with Admin below.'}
                      </div>
                    ) : (
                      visibleMessages.map((msg) => {
                        const isMine = msg.senderRole === 'restaurant_owner';
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs space-y-1 ${
                                isMine
                                  ? 'bg-[#E21B70] text-white'
                                  : 'bg-white border border-neutral-200 text-[#2E3138]'
                              }`}
                            >
                              <p
                                className={`text-[10px] font-bold uppercase ${
                                  isMine ? 'text-white/80' : 'text-[#E21B70]'
                                }`}
                              >
                                {isMine
                                  ? msg.senderName
                                  : `Admin · ${msg.senderName}`}
                              </p>
                              <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                                {msg.message}
                              </p>
                              <p
                                className={`text-[10px] tabular-nums ${
                                  isMine ? 'text-white/75' : 'text-neutral-400'
                                }`}
                              >
                                {new Date(msg.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form
                    onSubmit={handleSendAdminMessage}
                    className="p-3.5 border-t border-neutral-200 bg-white flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'অ্যাডমিনকে মেসেজ লিখুন...'
                          : 'Write a message to Foodora BD Admin...'
                      }
                      className="flex-1 px-3.5 py-2 text-xs sm:text-sm border border-neutral-200 rounded-xl focus:outline-none focus:border-[#E21B70]"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg || !msgText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'পাঠান' : 'Send'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* ---------------- TAB 5: ANALYTICS ---------------- */}
              {tab === 'analytics' && (
                <div className="space-y-6" data-testid="vendor-analytics-panel">
                  <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-base text-[#2E3138]">
                        {lang === 'bn'
                          ? 'দৈনিক ও মাসিক অর্ডার, আয় এবং জনপ্রিয় খাবার বিশ্লেষণ'
                          : 'Order Trends, Revenue & Top-Selling Food Analytics'}
                      </h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {lang === 'bn'
                          ? 'আপনার কিচেনের রিয়েল-টাইম অর্ডার ডেটা থেকে তৈরি চার্ট'
                          : 'Live performance metrics computed from non-cancelled restaurant orders'}
                      </p>
                    </div>

                    <div className="inline-flex rounded-xl border border-neutral-200 p-1 bg-neutral-50">
                      <button
                        type="button"
                        onClick={() => setTrendRange('daily')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          trendRange === 'daily'
                            ? 'bg-[#E21B70] text-white'
                            : 'text-neutral-600 hover:text-[#2E3138]'
                        }`}
                      >
                        {lang === 'bn' ? 'দৈনিক' : 'Daily View'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrendRange('monthly')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          trendRange === 'monthly'
                            ? 'bg-[#E21B70] text-white'
                            : 'text-neutral-600 hover:text-[#2E3138]'
                        }`}
                      >
                        {lang === 'bn' ? 'মাসিক' : 'Monthly View'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'সক্রিয় অর্ডার' : 'Active Orders'}
                      </p>
                      <p className="text-2xl font-bold text-[#2E3138] mt-1">
                        {analytics.totalOrders}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'ডেলিভারি সম্পন্ন' : 'Delivered'}
                      </p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">
                        {analytics.deliveredOrders}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'গড় অর্ডার মূল্য' : 'Avg Order Value'}
                      </p>
                      <p className="text-2xl font-bold text-[#2E3138] mt-1">
                        {formatBdt(analytics.avgOrderValue, lang)}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'মোট আয় (নিট)' : 'Net Food Revenue'}
                      </p>
                      <p className="text-2xl font-bold text-[#E21B70] mt-1">
                        {formatBdt(analytics.netVendorRevenue, lang)}
                      </p>
                    </div>
                  </div>

                  {activeTrendSeries.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center text-sm text-neutral-500">
                      {lang === 'bn'
                        ? 'চার্ট দেখার জন্য এখনও কোনো অর্ডার ডেটা নেই।'
                        : 'No order data yet to render revenue trends.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5">
                        <h3 className="font-bold text-sm text-[#2E3138] mb-1">
                          {trendRange === 'daily'
                            ? lang === 'bn'
                              ? 'দৈনিক বিক্রয় ও নিট আয় (৳)'
                              : 'Daily Gross Sales vs Net Vendor Revenue (৳)'
                            : lang === 'bn'
                            ? 'মাসিক বিক্রয় ও নিট আয় (৳)'
                            : 'Monthly Gross Sales vs Net Vendor Revenue (৳)'}
                        </h3>
                        <p className="text-xs text-neutral-500 mb-4">
                          {lang === 'bn'
                            ? 'কমিশন বাদে রেস্টুরেন্টের প্রকৃত আয়'
                            : 'Comparing gross food sales and net vendor payout'}
                        </p>
                        <div className="h-[280px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            {activeTrendSeries.length < 2 ? (
                              <BarChart
                                data={activeTrendSeries}
                                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <Tooltip
                                  formatter={(val: unknown) => [
                                    `৳${Number(val || 0).toLocaleString()}`,
                                    undefined,
                                  ]}
                                  contentStyle={{
                                    borderRadius: 12,
                                    borderColor: '#e5e7eb',
                                    fontSize: 12,
                                  }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar
                                  dataKey="grossRevenue"
                                  name={lang === 'bn' ? 'মোট বিক্রয় (৳)' : 'Gross Sales (৳)'}
                                  fill="#2E3138"
                                  radius={[6, 6, 0, 0]}
                                  maxBarSize={72}
                                />
                                <Bar
                                  dataKey="netRevenue"
                                  name={lang === 'bn' ? 'নিট আয় (৳)' : 'Net Earnings (৳)'}
                                  fill="#E21B70"
                                  radius={[6, 6, 0, 0]}
                                  maxBarSize={72}
                                />
                              </BarChart>
                            ) : (
                              <AreaChart
                                data={activeTrendSeries}
                                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="vendorNetGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#E21B70" stopOpacity={0.28} />
                                    <stop offset="95%" stopColor="#E21B70" stopOpacity={0.02} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <Tooltip
                                  formatter={(val: unknown) => [
                                    `৳${Number(val || 0).toLocaleString()}`,
                                    undefined,
                                  ]}
                                  contentStyle={{
                                    borderRadius: 12,
                                    borderColor: '#e5e7eb',
                                    fontSize: 12,
                                  }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Area
                                  type="monotone"
                                  dataKey="grossRevenue"
                                  name={lang === 'bn' ? 'মোট বিক্রয় (৳)' : 'Gross Sales (৳)'}
                                  stroke="#2E3138"
                                  strokeWidth={2}
                                  fillOpacity={0.08}
                                  fill="#2E3138"
                                />
                                <Area
                                  type="monotone"
                                  dataKey="netRevenue"
                                  name={lang === 'bn' ? 'নিট আয় (৳)' : 'Net Earnings (৳)'}
                                  stroke="#E21B70"
                                  strokeWidth={2.5}
                                  fillOpacity={1}
                                  fill="url(#vendorNetGrad)"
                                />
                              </AreaChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5">
                        <h3 className="font-bold text-sm text-[#2E3138] mb-1">
                          {trendRange === 'daily'
                            ? lang === 'bn'
                              ? 'দৈনিক অর্ডার সংখ্যা'
                              : 'Daily Order Volume'
                            : lang === 'bn'
                            ? 'মাসিক অর্ডার সংখ্যা'
                            : 'Monthly Order Volume'}
                        </h3>
                        <p className="text-xs text-neutral-500 mb-4">
                          {lang === 'bn'
                            ? 'প্রতিদিন বা প্রতি মাসে প্রাপ্ত অর্ডার'
                            : 'Total non-cancelled orders per period'}
                        </p>
                        <div className="h-[280px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={activeTrendSeries}
                              margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: 12,
                                  borderColor: '#e5e7eb',
                                  fontSize: 12,
                                }}
                              />
                              <Bar
                                dataKey="orders"
                                name={lang === 'bn' ? 'অর্ডার সংখ্যা' : 'Orders'}
                                fill="#E21B70"
                                radius={[6, 6, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5">
                        <h3 className="font-bold text-sm text-[#2E3138] mb-1">
                          {lang === 'bn'
                            ? 'সবচেয়ে বেশি বিক্রিত খাবার'
                            : 'Top-Selling Food Items (Units Sold)'}
                        </h3>
                        <p className="text-xs text-neutral-500 mb-4">
                          {lang === 'bn'
                            ? 'পরিমাণ অনুযায়ী সেরা ৬টি আইটেম'
                            : 'Ranked by total portions ordered'}
                        </p>
                        {topChartItems.length === 0 ? (
                          <p className="text-xs text-neutral-500 py-10 text-center">
                            No dish breakdown yet.
                          </p>
                        ) : (
                          <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                layout="vertical"
                                data={topChartItems}
                                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                                <XAxis
                                  type="number"
                                  allowDecimals={false}
                                  tick={{ fontSize: 11, fill: '#6b7280' }}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="shortName"
                                  width={125}
                                  tick={{ fontSize: 11, fill: '#2E3138' }}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: 12,
                                    borderColor: '#e5e7eb',
                                    fontSize: 12,
                                  }}
                                />
                                <Bar
                                  dataKey="quantitySold"
                                  name={lang === 'bn' ? 'বিক্রিত সংখ্যা' : 'Units Sold'}
                                  radius={[0, 6, 6, 0]}
                                >
                                  {topChartItems.map((_, idx) => (
                                    <Cell
                                      key={`cell-${idx}`}
                                      fill={
                                        idx === 0 ? '#E21B70' : idx === 1 ? '#C4135E' : '#33373D'
                                      }
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-6 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
                        <h3 className="font-bold text-sm text-[#2E3138] mb-3">
                          {lang === 'bn'
                            ? 'শীর্ষ বিক্রিত পণ্যের তালিকা'
                            : 'Top Dish Revenue Breakdown'}
                        </h3>
                        <table className="w-full text-xs text-left tabular-nums">
                          <thead>
                            <tr className="border-b border-neutral-200 text-neutral-500">
                              <th className="py-2">#</th>
                              <th className="py-2">Dish</th>
                              <th className="py-2 text-right">Qty Sold</th>
                              <th className="py-2 text-right">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.topSellingItems.slice(0, 8).map((item, idx) => (
                              <tr
                                key={`${item.foodItemId}-${item.name}`}
                                className="border-b border-neutral-100"
                              >
                                <td className="py-2.5 font-bold text-[#E21B70]">{idx + 1}</td>
                                <td className="py-2.5">
                                  <p className="font-semibold text-[#2E3138]">
                                    {lang === 'bn' ? item.nameBn : item.name}
                                  </p>
                                  <p className="text-[11px] text-neutral-400">{item.category}</p>
                                </td>
                                <td className="py-2.5 text-right font-semibold">
                                  {item.quantitySold}
                                </td>
                                <td className="py-2.5 text-right font-bold text-emerald-700">
                                  {formatBdt(item.revenue, lang)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- TAB 6: EARNINGS & PAYOUTS ---------------- */}
              {tab === 'earnings' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tabular-nums">
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'মোট সেটেলড বিক্রয়' : 'Settled Gross Sales'}
                      </p>
                      <p className="text-2xl font-bold text-[#2E3138] mt-1">
                        {formatBdt(totalGross, lang)}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500">
                        {lang === 'bn' ? 'রেস্টুরেন্ট নিট আয়' : 'Net Vendor Earnings'}
                      </p>
                      <p className="text-2xl font-bold text-[#E21B70] mt-1">
                        {formatBdt(totalNet, lang)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 bg-white rounded-2xl border border-neutral-200 p-5 overflow-x-auto">
                      <h2 className="font-bold text-sm text-[#2E3138] mb-3">
                        {lang === 'bn' ? 'কমিশন ও নিট আয়ের হিসাব' : 'Immutable Commission Ledger'}
                      </h2>
                      <table className="w-full text-xs text-left tabular-nums">
                        <thead>
                          <tr className="border-b border-neutral-200 text-neutral-500">
                            <th className="py-2">Type</th>
                            <th className="py-2">Note</th>
                            <th className="py-2 text-right">Gross</th>
                            <th className="py-2 text-right">Commission</th>
                            <th className="py-2 text-right">Net Vendor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((row) => (
                            <tr key={row.id} className="border-b border-neutral-100">
                              <td className="py-2.5 font-semibold uppercase">
                                {row.entryType.replace('_', ' ')}
                              </td>
                              <td className="py-2.5 text-neutral-600">{row.note}</td>
                              <td className="py-2.5 text-right">
                                {formatBdt(row.grossAmount, lang)}
                              </td>
                              <td className="py-2.5 text-right text-amber-700">
                                {formatBdt(row.commissionAmount, lang)}
                              </td>
                              <td className="py-2.5 text-right font-bold text-emerald-700">
                                {formatBdt(row.netRestaurantAmount, lang)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:col-span-4 space-y-4">
                      <form
                        onSubmit={handleRequestPayout}
                        className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
                      >
                        <h2 className="font-bold text-sm text-[#2E3138]">
                          {lang === 'bn' ? 'পেআউট অনুরোধ করুন' : 'Request Vendor Payout'}
                        </h2>
                        <p className="text-xs text-neutral-500">
                          {(activeStoreForActions || restaurant).payoutMethod.toUpperCase()} ·{' '}
                          {(activeStoreForActions || restaurant).payoutAccount}
                        </p>
                        <input
                          type="number"
                          min="100"
                          value={payoutAmt}
                          onChange={(e) => setPayoutAmt(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                        />
                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold"
                        >
                          {lang === 'bn' ? 'পেআউট সাবমিট করুন' : 'Submit Payout Request'}
                        </button>
                      </form>

                      <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-2.5">
                        <h3 className="font-bold text-xs text-neutral-700 uppercase">
                          {lang === 'bn' ? 'সাম্প্রতিক পেআউট' : 'Payout History'}
                        </h3>
                        {payouts.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs border-b border-neutral-100 pb-2"
                          >
                            <div>
                              <p className="font-semibold text-[#2E3138] tabular-nums">
                                {formatBdt(p.amount, lang)}
                              </p>
                              <p className="text-neutral-500 uppercase">{p.method}</p>
                            </div>
                            <span className="font-bold uppercase text-neutral-700">{p.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- TAB 7: STORE SETTINGS ---------------- */}
              {tab === 'settings' && (
                <div className="space-y-5 max-w-2xl">
                  <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-sm text-[#2E3138]">
                          {lang === 'bn'
                            ? `রেস্টুরেন্ট শাখা সমূহ (${allRestaurants.length})`
                            : `Restaurant Branches (${allRestaurants.length})`}
                        </h3>
                        <p className="text-[11px] text-neutral-500">
                          {lang === 'bn'
                            ? 'একজন মালিক ১টি রেস্টুরেন্ট খুলতে পারবেন এবং তার অধীনে যেকোনো এলাকায় নতুন শাখা যোগ করতে পারবেন।'
                            : '1 restaurant per owner account — expand across Bangladesh by adding new branches under your restaurant.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openAddBranchModal}
                        className="px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'নতুন শাখা যোগ' : 'Add Branch'}</span>
                      </button>
                    </div>

                    <div className="divide-y divide-neutral-100 border-t border-neutral-100">
                      {allRestaurants.map((b) => (
                        <div
                          key={b.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[#2E3138] truncate">
                              {lang === 'bn' ? b.nameBn : b.name}
                            </p>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {b.area} · {b.address}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                b.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {b.status}
                            </span>
                            {restaurant?.id !== b.id && (
                              <button
                                type="button"
                                onClick={() => setSelectedRestaurantId(b.id)}
                                className="px-2.5 py-1 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-[11px] font-semibold"
                              >
                                {lang === 'bn' ? 'দেখুন' : 'Switch'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={handleSaveSettings}
                    className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4"
                  >
                    <h2 className="font-bold text-base text-[#2E3138]">
                      {lang === 'bn'
                        ? 'লোগো, ব্র্যান্ডিং ও ডেলিভারি সেটিংস'
                        : 'Restaurant Branding, Logo & Delivery Settings'}
                    </h2>

                  <div className="grid grid-cols-1 gap-4 p-4 rounded-xl bg-[#FAFAFB] border border-neutral-200">
                    <div className="space-y-1.5 text-xs">
                      <label className="block font-semibold text-neutral-700">
                        {lang === 'bn' ? 'রেস্টুরেন্ট লোগো ছবি (Logo)' : 'Restaurant Logo Image'}
                      </label>
                      <div className="flex items-center gap-2.5">
                        {editLogoUrl ? (
                          <img
                            src={editLogoUrl}
                            alt="Restaurant logo"
                            className="w-12 h-12 rounded-xl object-cover border border-neutral-200 bg-white shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-dashed border-neutral-300 bg-white flex items-center justify-center text-neutral-400 shrink-0">
                            <Store className="w-5 h-5" />
                          </div>
                        )}
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] font-semibold shrink-0">
                          <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                          <span>{uploadingImage ? 'Uploading...' : 'Upload Logo'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) uploadProductPhoto(f, (url) => setEditLogoUrl(url));
                            }}
                          />
                        </label>
                        <input
                          type="text"
                          value={editLogoUrl}
                          onChange={(e) => setEditLogoUrl(e.target.value)}
                          placeholder="https://... or /uploads/..."
                          className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
                        />
                        {editLogoUrl && (
                          <button
                            type="button"
                            onClick={() => setEditLogoUrl('')}
                            aria-label="Clear restaurant logo"
                            className="p-2 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="block font-semibold text-neutral-700">
                        {lang === 'bn'
                          ? 'রেস্টুরেন্ট কভার ছবি (Cover Banner)'
                          : 'Storefront Cover Image'}
                      </label>
                      <div className="flex items-center gap-2.5">
                        {editCoverUrl && (
                          <img
                            src={editCoverUrl}
                            alt="Restaurant cover"
                            className="w-16 h-12 rounded-lg object-cover border border-neutral-200 bg-neutral-100 shrink-0"
                          />
                        )}
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] font-semibold shrink-0">
                          <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                          <span>{uploadingImage ? 'Uploading...' : 'Upload Cover'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) uploadProductPhoto(f, (url) => setEditCoverUrl(url));
                            }}
                          />
                        </label>
                        <input
                          type="text"
                          value={editCoverUrl}
                          onChange={(e) => setEditCoverUrl(e.target.value)}
                          placeholder="https://... or /uploads/..."
                          className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Opening Hours
                      </label>
                      <input
                        value={editHours}
                        onChange={(e) => setEditHours(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Delivery Mode
                      </label>
                      <select
                        value={editMode}
                        onChange={(e) => setEditMode(e.target.value as DeliveryMode)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white"
                      >
                        <option value="platform">Foodora Own Rider</option>
                        <option value="third_party">Pathao Courier</option>
                        <option value="restaurant">Restaurant Own Fleet</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        {lang === 'bn'
                          ? 'ব্যবসার শহর / এলাকা (সারা বাংলাদেশ + কাস্টম)'
                          : 'Business Area / City (All Bangladesh + Custom)'}
                      </label>
                      <SelectWithCustom
                        required
                        lang={lang}
                        value={editArea}
                        onChange={setEditArea}
                        storageKey="bd_areas"
                        ariaLabel="Store business area"
                        placeholder={
                          lang === 'bn'
                            ? 'কাস্টম এলাকার নাম লিখুন (যেমন: মিরপুর ডিওএইচএস)'
                            : 'Type any city, district or thana in Bangladesh'
                        }
                        customOptionLabel={
                          lang === 'bn'
                            ? '+ কাস্টম এলাকা যোগ করুন...'
                            : '+ Add Custom Area in Bangladesh...'
                        }
                        presets={getBangladeshAreaSelectPresets(lang)}
                        onSelectPreset={(val) => {
                          const found = BANGLADESH_AREAS.find((a) => a.name === val);
                          if (found) {
                            setEditCoords({ lat: found.lat, lng: found.lng });
                            const formatted = formatResolvedMapAddress({
                              areaName: found.name,
                              lat: found.lat,
                              lng: found.lng,
                            });
                            if (formatted) setEditAddress(formatted);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        {lang === 'bn' ? 'স্টোর ঠিকানা' : 'Store Street Address'}
                      </label>
                      <input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder={`Full address in ${editArea}, Bangladesh`}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <DhakaMapPicker
                        mapsApiKey={mapsApiKey}
                        lang={lang}
                        center={editCoords}
                        markerLabel={(activeStoreForActions || restaurant).name}
                        pinType="vendor"
                        restaurantName={(activeStoreForActions || restaurant).name}
                        interactive
                        heightClass="h-[190px]"
                        onSelectLocation={(c) => {
                          setEditCoords({ lat: c.lat, lng: c.lng });
                          if (c.areaName) setEditArea(c.areaName);
                          const formatted = formatResolvedMapAddress({
                            displayName: c.displayName,
                            areaName: c.areaName,
                            lat: c.lat,
                            lng: c.lng,
                          });
                          if (formatted) setEditAddress(formatted);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Delivery Fee (BDT ৳)
                      </label>
                      <input
                        type="number"
                        value={editFee}
                        onChange={(e) => setEditFee(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Minimum Order (BDT ৳)
                      </label>
                      <input
                        type="number"
                        value={editMinOrder}
                        onChange={(e) => setEditMinOrder(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingSettings || uploadingImage}
                    className="px-5 py-2.5 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {savingSettings
                      ? lang === 'bn'
                        ? 'সংরক্ষণ হচ্ছে...'
                        : 'Saving...'
                      : lang === 'bn'
                      ? 'সেটিংস ও লোগো সংরক্ষণ করুন'
                      : 'Save Settings & Branding'}
                  </button>
                  </form>
                </div>
              )}
            </main>
          </div>

          {/* Edit Product & Stock Modal */}
          {editingItem && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <form
                onSubmit={handleSaveEditedItem}
                className="bg-white rounded-2xl border border-neutral-200 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-[#2E3138]">
                    {lang === 'bn' ? 'প্রোডাক্ট ও স্টক সম্পাদনা' : 'Edit Product & Stock'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    aria-label="Close edit item dialog"
                    className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Stock & Availability Switches */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E3138] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.inStock}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, inStock: e.target.checked })
                      }
                    />
                    <span>{lang === 'bn' ? 'স্টকে আছে (In Stock)' : 'In Stock'}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E3138] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.isAvailable}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, isAvailable: e.target.checked })
                      }
                    />
                    <span>{lang === 'bn' ? 'মেনুতে দৃশ্যমান' : 'Available on Menu'}</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Category
                    </label>
                    <SelectWithCustom
                      required
                      lang={lang}
                      value={editingItem.category}
                      onChange={(val) => setEditingItem({ ...editingItem, category: val })}
                      storageKey="food_categories"
                      ariaLabel="Edit dish category"
                      customOptionLabel={
                        lang === 'bn' ? '+ কাস্টম ক্যাটাগরি যোগ...' : '+ Add Custom Category...'
                      }
                      presets={FOOD_CATEGORY_PRESET_OPTIONS.map((cat) => ({
                        value: cat,
                        label: cat,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Name (EN)
                    </label>
                    <input
                      required
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Name (BN)
                    </label>
                    <input
                      required
                      value={editingItem.nameBn}
                      onChange={(e) => setEditingItem({ ...editingItem, nameBn: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Price (৳)
                    </label>
                    <input
                      required
                      type="number"
                      min="10"
                      value={editingItem.price}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, price: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Offer Price (Optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.discountPrice ?? ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          discountPrice: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingItem.isPopular}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, isPopular: e.target.checked })
                        }
                      />
                      <span>Popular Dish</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">Dish Image</label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-xs font-semibold">
                      <Upload className="w-3.5 h-3.5 text-[#E21B70]" />
                      <span>Upload New</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            uploadProductPhoto(file, (url) =>
                              setEditingItem((prev) => (prev ? { ...prev, imageUrl: url } : null))
                            );
                          }
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={editingItem.imageUrl}
                      onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Product Variants (Size / Portion) & Add-ons inside Edit Modal */}
                <div className="space-y-3 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#2E3138]">
                      {lang === 'bn'
                        ? 'প্রোডাক্ট ভ্যারিয়েন্ট (সাইজ / পরিমাণ)'
                        : 'Product Variants (Size / Portion)'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          variationsJson: [
                            ...(editingItem.variationsJson || []),
                            { name: '', priceDelta: 0 },
                          ],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#E21B70] text-white text-[10px] font-semibold"
                    >
                      + {lang === 'bn' ? 'ভ্যারিয়েন্ট' : 'Add Variant'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {(editingItem.variationsJson || []).map((v, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={v.name}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              variationsJson: editingItem.variationsJson.map((row, i) =>
                                i === idx ? { ...row, name: e.target.value } : row
                              ),
                            })
                          }
                          placeholder="e.g. Half, Regular, Large"
                          aria-label={`Edit variant name ${idx + 1}`}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white"
                        />
                        <input
                          type="number"
                          value={v.priceDelta}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              variationsJson: editingItem.variationsJson.map((row, i) =>
                                i === idx
                                  ? { ...row, priceDelta: Number(e.target.value) || 0 }
                                  : row
                              ),
                            })
                          }
                          placeholder="+৳"
                          aria-label={`Edit variant price adjustment ${idx + 1}`}
                          className="w-24 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white tabular-nums"
                        />
                        <button
                          type="button"
                          aria-label={`Delete edit variant ${idx + 1}`}
                          onClick={() =>
                            setEditingItem({
                              ...editingItem,
                              variationsJson:
                                editingItem.variationsJson.length > 1
                                  ? editingItem.variationsJson.filter((_, i) => i !== idx)
                                  : [{ name: 'Regular', priceDelta: 0 }],
                            })
                          }
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200">
                    <span className="text-xs font-bold text-[#2E3138]">
                      {lang === 'bn' ? 'অতিরিক্ত অ্যাড-অন' : 'Optional Add-ons'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          addonsJson: [
                            ...(editingItem.addonsJson || []),
                            { name: '', price: 50 },
                          ],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white text-[#E21B70] text-[10px] font-semibold"
                    >
                      + {lang === 'bn' ? 'অ্যাড-অন' : 'Add Extra'}
                    </button>
                  </div>
                  {(editingItem.addonsJson || []).length > 0 && (
                    <div className="space-y-1.5">
                      {editingItem.addonsJson.map((addon, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={addon.name}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                addonsJson: editingItem.addonsJson.map((row, i) =>
                                  i === idx ? { ...row, name: e.target.value } : row
                                ),
                              })
                            }
                            placeholder="e.g. Borhani, Extra Cheese"
                            aria-label={`Edit add-on name ${idx + 1}`}
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white"
                          />
                          <input
                            type="number"
                            min="0"
                            value={addon.price}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                addonsJson: editingItem.addonsJson.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        price: Math.max(0, Number(e.target.value) || 0),
                                      }
                                    : row
                                ),
                              })
                            }
                            placeholder="৳"
                            aria-label={`Edit add-on price ${idx + 1}`}
                            className="w-24 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white tabular-nums"
                          />
                          <button
                            type="button"
                            aria-label={`Delete edit add-on ${idx + 1}`}
                            onClick={() =>
                              setEditingItem({
                                ...editingItem,
                                addonsJson: editingItem.addonsJson.filter((_, i) => i !== idx),
                              })
                            }
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editingItem.description}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, description: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
                  >
                    {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={savingEditItem}
                    className="px-5 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {savingEditItem
                      ? lang === 'bn'
                        ? 'সংরক্ষণ হচ্ছে...'
                        : 'Saving...'
                      : lang === 'bn'
                      ? 'পরিবর্তন সংরক্ষণ'
                      : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Add New Restaurant Branch Modal */}
          {showAddBranchModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Add restaurant branch"
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
            >
              <form
                onSubmit={handleCreateBranch}
                className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#E21B70]">
                      {lang === 'bn'
                        ? 'মাল্টি-ব্রাঞ্চ এক্সপানশন'
                        : 'Multi-Branch Expansion'}
                    </p>
                    <h3 className="font-bold text-lg text-[#2E3138]">
                      {lang === 'bn' ? 'নতুন শাখা যোগ করুন' : 'Add New Restaurant Branch'}
                    </h3>
                    {(primaryOwnedRestaurant || restaurant) && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {lang === 'bn' ? 'মূল রেস্টুরেন্ট:' : 'Primary Restaurant:'}{' '}
                        <span className="font-bold text-[#2E3138]">
                          {(primaryOwnedRestaurant || restaurant)!.name}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddBranchModal(false)}
                    aria-label="Close add branch modal"
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label
                      htmlFor="branch-name-en"
                      className="block font-semibold text-neutral-700 mb-1"
                    >
                      {lang === 'bn' ? 'শাখার নাম (English)' : 'Branch Name (English)'} *
                    </label>
                    <input
                      id="branch-name-en"
                      required
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="e.g. Banani Branch"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="branch-name-bn"
                      className="block font-semibold text-neutral-700 mb-1"
                    >
                      {lang === 'bn' ? 'শাখার নাম (বাংলা, ঐচ্ছিক)' : 'Branch Name (Bangla, Optional)'}
                    </label>
                    <input
                      id="branch-name-bn"
                      value={branchNameBn}
                      onChange={(e) => setBranchNameBn(e.target.value)}
                      placeholder="যেমন: বনানী শাখা"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'শাখার শহর / এলাকা' : 'Branch City / Area'} *
                    </label>
                    <SelectWithCustom
                      required
                      lang={lang}
                      value={branchArea}
                      onChange={setBranchArea}
                      storageKey="bd_areas"
                      ariaLabel="Branch area"
                      placeholder="Select or enter branch area"
                      presets={getBangladeshAreaSelectPresets(lang)}
                      onSelectPreset={(val) => {
                        const found = BANGLADESH_AREAS.find((a) => a.name === val);
                        if (found) {
                          setBranchCoords({ lat: found.lat, lng: found.lng });
                          if (!branchName.trim()) setBranchName(`${found.name} Branch`);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="branch-phone"
                      className="block font-semibold text-neutral-700 mb-1"
                    >
                      {lang === 'bn' ? 'শাখার ফোন নম্বর' : 'Branch Phone'} *
                    </label>
                    <input
                      id="branch-phone"
                      required
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      placeholder="+880 1711-000000"
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label
                    htmlFor="branch-address"
                    className="block font-semibold text-neutral-700 mb-1"
                  >
                    {lang === 'bn' ? 'শাখার সম্পূর্ণ ঠিকানা' : 'Branch Street Address'} *
                  </label>
                  <input
                    id="branch-address"
                    required
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder={`Road, House, ${branchArea}, Bangladesh`}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <DhakaMapPicker
                    mapsApiKey={mapsApiKey}
                    lang={lang}
                    center={branchCoords}
                    markerLabel={branchName || branchArea}
                    pinType="vendor"
                    restaurantName={branchName || (primaryOwnedRestaurant || restaurant)?.name}
                    interactive
                    heightClass="h-[180px]"
                    onSelectLocation={(loc) => {
                      setBranchCoords({ lat: loc.lat, lng: loc.lng });
                      if (loc.areaName && loc.areaName !== 'Current GPS') {
                        setBranchArea(loc.areaName);
                      }
                      const formatted = formatResolvedMapAddress({
                        displayName: loc.displayName,
                        areaName: loc.areaName,
                        lat: loc.lat,
                        lng: loc.lng,
                      });
                      if (formatted && !branchAddress.trim()) {
                        setBranchAddress(formatted);
                      }
                    }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'ডেলিভারি ফি (৳)' : 'Delivery Fee (৳)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={branchDeliveryFee}
                      onChange={(e) => setBranchDeliveryFee(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'মিনিমাম অর্ডার' : 'Min Order (৳)'}
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={5000}
                      value={branchMinOrder}
                      onChange={(e) => setBranchMinOrder(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      {lang === 'bn' ? 'ডেলিভারি' : 'Delivery Mode'}
                    </label>
                    <select
                      value={branchDeliveryMode}
                      onChange={(e) => setBranchDeliveryMode(e.target.value as DeliveryMode)}
                      className="w-full px-2.5 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
                    >
                      <option value="platform">Foodora Rider</option>
                      <option value="third_party">Pathao Courier</option>
                      <option value="restaurant">Own Fleet</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#FAFAFB] border border-neutral-200 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={branchCopyMenu}
                    onChange={(e) => setBranchCopyMenu(e.target.checked)}
                    className="w-4 h-4 accent-[#E21B70] rounded"
                  />
                  <span className="font-semibold text-[#2E3138]">
                    {lang === 'bn'
                      ? 'মূল রেস্টুরেন্টের বর্তমান মেনু আইটেমগুলো এই শাখায় কপি করুন'
                      : 'Copy existing menu items from main restaurant to this branch'}
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddBranchModal(false)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
                  >
                    {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingBranch}
                    className="px-5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {creatingBranch
                      ? lang === 'bn'
                        ? 'শাখা তৈরি হচ্ছে...'
                        : 'Adding Branch...'
                      : lang === 'bn'
                      ? 'শাখা তৈরি করুন'
                      : 'Create Branch'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
