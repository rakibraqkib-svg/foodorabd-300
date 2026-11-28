import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Bike,
  Check,
  ChevronDown,
  CloudRain,
  CloudSun,
  Copy,
  ExternalLink,
  Filter,
  Heart,
  KeyRound,
  LocateFixed,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  User,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AddressSearchInput, saveRecentAddress } from './components/AddressSearchInput';
import { AdminDashboard } from './components/AdminDashboard';
import { AiHelpWidget } from './components/AiHelpWidget';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { CustomerDashboard } from './components/CustomerDashboard';
import { DhakaMapPicker } from './components/DhakaMapPicker';
import { OrderTrackingView } from './components/OrderTrackingView';
import { RestaurantDetailView } from './components/RestaurantDetailView';
import { RiderDashboard } from './components/RiderDashboard';
import { VendorDashboard } from './components/VendorDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { apiFetch, getAuthToken } from './lib/api';
import { BANGLADESH_AREAS, CUISINE_CATEGORIES, DHAKA_DELIVERY_ZONES, localizeCouponTitle, t } from './lib/i18n';
import {
  emitLocalRealtimeSignal,
  playOrderAlertChime,
  useAudioUnlockPrompt,
  useOrderSoundSetting,
  useRealtimeEvents,
} from './lib/realtime';
import {
  buildMessengerUrl,
  buildRestaurantUnavailableMessage,
  buildWhatsAppSupportUrl,
  canAddToSingleRestaurantCart,
  type CartItemInput,
  type DeliveryFinancialConfig,
  filterStorefrontProducts,
  formatBdt,
  formatDurationEstimate,
  shouldRestoreTrackedOrderShortcut,
} from './lib/marketplace-logic';
import { mergeStorefrontConfig } from './lib/storefront-config';
import type {
  Coupon,
  DhakaZoneCoverageItem,
  FoodItem,
  Lang,
  NotificationItem,
  PlatformSettings,
  PublicPaymentGateway,
  Restaurant,
  ReviewItem,
  StorefrontProduct,
} from './types/marketplace';

type ViewMode =
  | { type: 'home' }
  | { type: 'restaurant'; slug: string }
  | { type: 'tracking'; orderId: number; token?: string }
  | { type: 'customer' }
  | { type: 'vendor'; onboarding?: boolean; restaurantId?: number }
  | { type: 'rider'; onboarding?: boolean }
  | { type: 'admin' };

const STORAGE_CART_KEY = 'foodora_bd_cart_v1';
const STORAGE_CART_REST_KEY = 'foodora_bd_cart_rest_v1';
const STORAGE_AREA_KEY = 'foodora_bd_area_v1';
const STORAGE_LANG_KEY = 'foodora_bd_lang_v1';
const STORAGE_LAST_ORDER_KEY = 'foodora_bd_last_order_v1';

interface TrackedOrderShortcut {
  orderId: number;
  trackingToken?: string;
  orderNumber?: string;
  restaurantName?: string;
  estimatedMinutes?: number;
  isSandbox?: boolean;
}

function MarketplaceApp() {
  const {
    user,
    loading: authLoading,
    error: authError,
    googleRedirectUrl,
    clearError,
    clearGoogleRedirectUrl,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    unlockAdminWithPin,
    requestPasswordReset,
    confirmPasswordReset,
    passwordRecoveryPending,
    completeSupabasePasswordRecovery,
    dismissPasswordRecovery,
    signInSandboxPersona,
    signOut,
    refreshUser,
  } = useAuth();

  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LANG_KEY);
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });
  const [orderSoundEnabled, setOrderSoundEnabled] = useOrderSoundSetting();
  const [mapsApiKey, setMapsApiKey] = useState(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || ''
  );
  const [publicSettings, setPublicSettings] = useState<PlatformSettings | null>(null);
  const [publicGateways, setPublicGateways] = useState<PublicPaymentGateway[]>([]);
  const [deliveryFinancialConfig, setDeliveryFinancialConfig] =
    useState<DeliveryFinancialConfig | null>(null);
  const [dhakaZoneCoverage, setDhakaZoneCoverage] = useState<DhakaZoneCoverageItem[]>([]);
  const [gmpQuotaBanner, setGmpQuotaBanner] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [storefrontProducts, setStorefrontProducts] = useState<StorefrontProduct[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingStore, setLoadingStore] = useState(true);

  const [view, setView] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const orderParam = Number(params.get('order'));
    const tokenParam = params.get('token')?.trim() || undefined;
    if (Number.isInteger(orderParam) && orderParam > 0) {
      return { type: 'tracking', orderId: orderParam, token: tokenParam };
    }
    const restParam = params.get('restaurant')?.trim();
    if (restParam) {
      return { type: 'restaurant', slug: restParam };
    }
    const pathMatch = window.location.pathname.match(/^\/restaurant\/([^/]+)\/?$/);
    if (pathMatch?.[1]) {
      return { type: 'restaurant', slug: decodeURIComponent(pathMatch[1]) };
    }
    return { type: 'home' };
  });

  // Restaurant detail state
  const [detailData, setDetailData] = useState<{
    restaurant: Restaurant;
    items: FoodItem[];
    reviews: ReviewItem[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selected delivery area (Anywhere in Bangladesh)
  const [selectedArea, setSelectedArea] = useState<{
    name: string;
    nameBn: string;
    lat: number;
    lng: number;
    displayName?: string;
  }>(() => {
    try {
      const areaParam = new URLSearchParams(window.location.search).get('area')?.trim();
      if (areaParam) {
        const matchedArea = BANGLADESH_AREAS.find(
          (a) => a.name.toLowerCase() === areaParam.toLowerCase()
        );
        if (matchedArea) return matchedArea;
      }
      const raw = localStorage.getItem(STORAGE_AREA_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return BANGLADESH_AREAS[0];
  });
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalTab, setLocationModalTab] = useState<'map' | 'zones'>('map');
  const [locationZoneFilter, setLocationZoneFilter] = useState<string>('all');
  const [locationRouteOrigin, setLocationRouteOrigin] = useState<{
    name: string;
    nameBn: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [emailTrackModalOpen, setEmailTrackModalOpen] = useState(false);
  const [trackEmailInput, setTrackEmailInput] = useState('');
  const [trackOrderNumInput, setTrackOrderNumInput] = useState('');
  const [trackLookupLoading, setTrackLookupLoading] = useState(false);
  const [trackLookupError, setTrackLookupError] = useState<string | null>(null);
  const [lastTrackedOrder, setLastTrackedOrder] = useState<TrackedOrderShortcut | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_LAST_ORDER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TrackedOrderShortcut;
      if (shouldRestoreTrackedOrderShortcut(parsed)) {
        return parsed;
      }
      localStorage.removeItem(STORAGE_LAST_ORDER_KEY);
      return null;
    } catch {
      return null;
    }
  });
  const [featuredActiveOrder, setFeaturedActiveOrder] = useState<TrackedOrderShortcut | null>(null);

  // Filters
  const [fulfillmentTab, setFulfillmentTab] = useState<'delivery' | 'pickup'>('delivery');
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('q')?.trim() || '';
    } catch {
      return '';
    }
  });
  const [selectedCuisine, setSelectedCuisine] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('cuisine')?.trim() || 'All';
    } catch {
      return 'All';
    }
  });
  const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'fastest' | 'lowFee'>('relevance');
  const [onlyDiscount, setOnlyDiscount] = useState(false);
  const [onlyFreeFirst, setOnlyFreeFirst] = useState(false);
  const [priceTierFilter, setPriceTierFilter] = useState<string>('');
  const [deliveryFleetFilter, setDeliveryFleetFilter] = useState<'all' | 'platform' | 'third_party'>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<CartItemInput[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [cartRestaurant, setCartRestaurant] = useState<Restaurant | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CART_REST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [pendingSwitchItem, setPendingSwitchItem] = useState<{
    restaurant: Restaurant;
    item: CartItemInput;
  } | null>(null);

  // Favorites, Notifications, Auth Modal, Toast
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const knownNotifIdsRef = useRef<Set<number>>(new Set());
  const hasHydratedNotifsRef = useRef<boolean>(false);
  const { needsUnlock: audioNeedsUnlock, unlockAudio } = useAudioUnlockPrompt();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authRole, setAuthRole] = useState<'customer' | 'restaurant_owner' | 'rider'>('customer');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetInfo, setResetInfo] = useState<{
    message: string;
    previewCode?: string;
    isAdminAccount?: boolean;
  } | null>(null);
  const [supaRecoveryPassword, setSupaRecoveryPassword] = useState('');
  const [supaRecoverySaving, setSupaRecoverySaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Free API state: Open-Meteo live Dhaka weather + OpenStreetMap Nominatim search
  const [weather, setWeather] = useState<{
    tempC: number;
    labelEn: string;
    labelBn: string;
    isRaining: boolean;
    rainBufferMin: number;
  } | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [pendingAdminRedirect, setPendingAdminRedirect] = useState(false);
  const [pendingVendorRedirect, setPendingVendorRedirect] = useState(false);
  const [showAdminPinBox, setShowAdminPinBox] = useState(false);
  const [adminPinEmail, setAdminPinEmail] = useState('raqkibrony@gmail.com');
  const [adminPinInput, setAdminPinInput] = useState('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Listen for Google Maps quota / auth fallback event (Case A)
  useEffect(() => {
    const handler = () => setGmpQuotaBanner(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Sync cart & area to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cartItems));
      localStorage.setItem(STORAGE_CART_REST_KEY, JSON.stringify(cartRestaurant));
    } catch {
      // ignore
    }
  }, [cartItems, cartRestaurant]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AREA_KEY, JSON.stringify(selectedArea));
    } catch {
      // ignore
    }
  }, [selectedArea]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    try {
      if (lastTrackedOrder && !lastTrackedOrder.isSandbox) {
        localStorage.setItem(STORAGE_LAST_ORDER_KEY, JSON.stringify(lastTrackedOrder));
      } else {
        localStorage.removeItem(STORAGE_LAST_ORDER_KEY);
      }
    } catch {
      // ignore
    }
  }, [lastTrackedOrder]);

  // Global Escape key close for active modals & cart drawer
  useEffect(() => {
    const anyModalOpen =
      locationModalOpen ||
      emailTrackModalOpen ||
      authModalOpen ||
      Boolean(pendingSwitchItem) ||
      cartOpen;
    if (!anyModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (locationModalOpen) {
        setLocationModalOpen(false);
      } else if (emailTrackModalOpen) {
        setEmailTrackModalOpen(false);
      } else if (authModalOpen) {
        setAuthModalOpen(false);
      } else if (pendingSwitchItem) {
        setPendingSwitchItem(null);
      } else if (cartOpen) {
        setCartOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [locationModalOpen, emailTrackModalOpen, authModalOpen, pendingSwitchItem, cartOpen]);

  // Sync URL query param for tracking & restaurant deep-link SEO persistence across reload
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view.type === 'tracking') {
      url.searchParams.set('order', String(view.orderId));
      if (view.token) {
        url.searchParams.set('token', view.token);
      } else {
        url.searchParams.delete('token');
      }
      url.searchParams.delete('restaurant');
    } else if (view.type === 'restaurant') {
      url.searchParams.set('restaurant', view.slug);
      url.searchParams.delete('order');
      url.searchParams.delete('token');
    } else {
      url.searchParams.delete('order');
      url.searchParams.delete('token');
      url.searchParams.delete('restaurant');
    }
    window.history.replaceState({}, '', url.toString());
  }, [view]);

  const sc = useMemo(
    () => mergeStorefrontConfig(publicSettings?.storefrontConfig),
    [publicSettings]
  );

  useEffect(() => {
    if (!sc.showPickupTab && fulfillmentTab === 'pickup') {
      setFulfillmentTab('delivery');
    }
  }, [sc.showPickupTab, fulfillmentTab]);

  // Close notifications dropdown automatically when clicking outside or pressing Escape
  useEffect(() => {
    if (!notifOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (notifContainerRef.current && target && !notifContainerRef.current.contains(target)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);

  const loadStorefront = useCallback(async () => {
    setLoadingStore(true);
    try {
      const [cfgRes, restRes, prodRes, coupRes] = await Promise.all([
        apiFetch<{
          mapsApiKey: string;
          settings?: PlatformSettings | null;
          paymentGateways?: PublicPaymentGateway[];
          deliveryFinancialConfig?: DeliveryFinancialConfig | null;
          dhakaZoneCoverage?: DhakaZoneCoverageItem[];
          featuredActiveOrder?: TrackedOrderShortcut | null;
        }>('/api/public-config'),
        apiFetch<{ restaurants: Restaurant[] }>('/api/restaurants'),
        apiFetch<{ products: StorefrontProduct[] }>('/api/products').catch(() => ({ products: [] })),
        apiFetch<{ coupons: Coupon[] }>('/api/coupons'),
      ]);
      setMapsApiKey(
        cfgRes.mapsApiKey || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || ''
      );
      setPublicSettings(cfgRes.settings || null);
      setPublicGateways(cfgRes.paymentGateways || []);
      setDeliveryFinancialConfig(
        cfgRes.deliveryFinancialConfig || cfgRes.settings?.deliveryFinancialConfig || null
      );
      setDhakaZoneCoverage(cfgRes.dhakaZoneCoverage || []);
      setFeaturedActiveOrder(cfgRes.featuredActiveOrder || null);
      setRestaurants(restRes.restaurants);
      setStorefrontProducts(prodRes.products || []);
      setCoupons(coupRes.coupons);
    } catch (err) {
      console.error('Failed to load storefront data:', err);
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Load restaurant detail automatically if opened via SEO ?restaurant=slug deep link
  useEffect(() => {
    if (view.type !== 'restaurant') return;
    if (detailData?.restaurant.slug === view.slug) return;
    let cancelled = false;
    setLoadingDetail(true);
    apiFetch<{
      restaurant: Restaurant;
      items: FoodItem[];
      reviews: ReviewItem[];
    }>(`/api/restaurants/${encodeURIComponent(view.slug)}`)
      .then((res) => {
        if (!cancelled) setDetailData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, detailData?.restaurant.slug]);

  // Dynamic Google SEO Metadata, Search Console Verification, OpenGraph & Schema.org JSON-LD
  useEffect(() => {
    try {
      const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
        if (!content) return;
        let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute(attr, key);
          document.head.appendChild(tag);
        }
        tag.content = content;
      };

      const activeRestaurant =
        view.type === 'restaurant' && detailData?.restaurant.slug === view.slug
          ? detailData.restaurant
          : null;

      const pageTitle = activeRestaurant
        ? lang === 'bn'
          ? `${activeRestaurant.nameBn} — মেনু ও অনলাইন অর্ডার | Foodora BD`
          : `${activeRestaurant.name} — Menu & Online Food Order | Foodora BD`
        : lang === 'bn'
        ? sc.seoTitleBn
        : sc.seoTitleEn;

      const pageDesc = activeRestaurant
        ? lang === 'bn'
          ? `${activeRestaurant.nameBn} (${activeRestaurant.area}) থেকে অনলাইনে ${activeRestaurant.cuisine} অর্ডার করুন। দ্রুত ডেলিভারি ও বিকাশ/নগদ পেমেন্ট।`
          : `Order ${activeRestaurant.cuisine} online from ${activeRestaurant.name} in ${activeRestaurant.area}, Bangladesh. Fast delivery with bKash, Nagad & COD.`
        : lang === 'bn'
        ? sc.seoDescriptionBn
        : sc.seoDescriptionEn;

      document.title = pageTitle;

      const canonicalUrl = activeRestaurant
        ? `${window.location.origin}/?restaurant=${encodeURIComponent(activeRestaurant.slug)}`
        : `${window.location.origin}/`;

      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonicalUrl;

      upsertMeta('name', 'description', pageDesc);
      upsertMeta('name', 'keywords', sc.seoKeywords);
      upsertMeta('name', 'robots', 'index, follow');
      if (sc.googleSiteVerification.trim()) {
        upsertMeta('name', 'google-site-verification', sc.googleSiteVerification.trim());
      }
      upsertMeta('property', 'og:type', 'website');
      upsertMeta('property', 'og:title', pageTitle);
      upsertMeta('property', 'og:description', pageDesc);
      upsertMeta('property', 'og:url', canonicalUrl);
      upsertMeta(
        'property',
        'og:image',
        activeRestaurant?.coverUrl || `${window.location.origin}${sc.heroImageUrl}`
      );
      upsertMeta('name', 'twitter:card', 'summary_large_image');
      upsertMeta('name', 'twitter:title', pageTitle);
      upsertMeta('name', 'twitter:description', pageDesc);

      const scriptId = 'foodora-seo-jsonld';
      let jsonLdEl = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!jsonLdEl) {
        jsonLdEl = document.createElement('script');
        jsonLdEl.id = scriptId;
        jsonLdEl.type = 'application/ld+json';
        document.head.appendChild(jsonLdEl);
      }

      const structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            name: `${sc.brandPrefix}${sc.brandSuffix}`,
            url: `${window.location.origin}/`,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${window.location.origin}/?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'How does food delivery work on Foodora BD?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Add dishes from Dhaka or any Bangladesh restaurant to your cart, where Pathao Food, Foodora Express Rider, Steadfast, or RedX delivery is automatically calculated, then pay via bKash, Nagad, SSLCommerz, or Cash on Delivery.',
                },
              },
              {
                '@type': 'Question',
                name: 'Which cities in Bangladesh are covered for online food orders?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Foodora BD covers Gulshan, Banani, Dhanmondi, Uttara, Mirpur, Chattogram, Sylhet, Rajshahi, Khulna, and nationwide delivery areas across Bangladesh.',
                },
              },
            ],
          },
          {
            '@type': 'ItemList',
            name: pageTitle,
            numberOfItems: storefrontProducts.length,
            itemListElement: storefrontProducts.slice(0, 24).map((p, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              url: `${window.location.origin}/?restaurant=${encodeURIComponent(p.restaurantSlug)}`,
              item: {
                '@type': 'Product',
                name: p.name,
                category: p.category,
                description: p.description || `${p.name} from ${p.restaurantName}`,
                image: p.imageUrl,
                offers: {
                  '@type': 'Offer',
                  priceCurrency: 'BDT',
                  price: p.discountPrice ?? p.price,
                  availability: p.inStock
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                  seller: {
                    '@type': 'Restaurant',
                    name: p.restaurantName,
                    servesCuisine: p.restaurantCuisine,
                  },
                },
              },
            })),
          },
          ...(activeRestaurant
            ? [
                {
                  '@type': 'Restaurant',
                  name: activeRestaurant.name,
                  url: canonicalUrl,
                  servesCuisine: activeRestaurant.cuisine,
                  image: activeRestaurant.coverUrl,
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: activeRestaurant.address,
                    addressLocality: activeRestaurant.area,
                    addressRegion: activeRestaurant.area || 'Bangladesh',
                    addressCountry: 'BD',
                  },
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: Number(activeRestaurant.rating) || 4.5,
                    reviewCount: Math.max(1, activeRestaurant.reviewCount || 1),
                  },
                },
              ]
            : restaurants.slice(0, 12).map((r) => ({
                '@type': 'Restaurant',
                name: r.name,
                url: `${window.location.origin}/?restaurant=${encodeURIComponent(r.slug)}`,
                servesCuisine: r.cuisine,
                image: r.coverUrl,
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: r.area,
                  addressRegion: r.area || 'Bangladesh',
                  addressCountry: 'BD',
                },
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: Number(r.rating) || 4.5,
                  reviewCount: Math.max(1, r.reviewCount || 1),
                },
              }))),
        ],
      };

      jsonLdEl.textContent = JSON.stringify(structuredData);
    } catch {
      // non-fatal SEO injection guard
    }
  }, [storefrontProducts, restaurants, sc, lang, view, detailData]);

  // Load favorites, notifications & latest active order when user session is active
  const prevUserUidRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUid = user?.uid || null;
    if (prevUserUidRef.current !== nextUid) {
      prevUserUidRef.current = nextUid;
      setFavoriteIds([]);
      setNotifications([]);
      knownNotifIdsRef.current = new Set();
      hasHydratedNotifsRef.current = false;
      if (nextUid) {
        setLastTrackedOrder(null);
      }
    }
  }, [user?.uid]);

  const refreshPublicBanner = useCallback(async () => {
    try {
      const cfgRes = await apiFetch<{
        featuredActiveOrder?: TrackedOrderShortcut | null;
        settings?: PlatformSettings | null;
        deliveryFinancialConfig?: DeliveryFinancialConfig | null;
        dhakaZoneCoverage?: DhakaZoneCoverageItem[];
      }>('/api/public-config');
      setFeaturedActiveOrder(cfgRes.featuredActiveOrder || null);
      if (cfgRes.settings) {
        setPublicSettings(cfgRes.settings);
      }
      if (cfgRes.deliveryFinancialConfig || cfgRes.settings?.deliveryFinancialConfig) {
        setDeliveryFinancialConfig(
          cfgRes.deliveryFinancialConfig || cfgRes.settings?.deliveryFinancialConfig || null
        );
      }
      if (cfgRes.dhakaZoneCoverage) {
        setDhakaZoneCoverage(cfgRes.dhakaZoneCoverage);
      }
    } catch {
      // ignore non-critical background refresh
    }
  }, []);

  const loadUserSignals = useCallback(async () => {
    if (!user) {
      setFavoriteIds([]);
      setNotifications([]);
      knownNotifIdsRef.current = new Set();
      hasHydratedNotifsRef.current = false;
      return;
    }
    try {
      const [favRes, notifRes, ordersRes] = await Promise.all([
        apiFetch<{ favorites: Array<{ restaurantId: number }> }>('/api/customer/favorites'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<{
          orders: Array<{
            id: number;
            orderNumber: string;
            trackingToken?: string;
            restaurantName: string;
            estimatedMinutes: number;
            status: string;
          }>;
        }>('/api/customer/orders').catch(() => ({ orders: [] })),
      ]);
      setFavoriteIds(favRes.favorites.map((f) => f.restaurantId));

      if (hasHydratedNotifsRef.current) {
        const freshOrderNotif = notifRes.notifications.find(
          (n) => !n.isRead && !knownNotifIdsRef.current.has(n.id) && n.type === 'order'
        );
        if (freshOrderNotif) {
          const isNewOrder = freshOrderNotif.title.toLowerCase().includes('new order');
          const dKey =
            isNewOrder && freshOrderNotif.relatedOrderId
              ? `order_created_${freshOrderNotif.relatedOrderId}`
              : `notif_${freshOrderNotif.id}`;
          void playOrderAlertChime(isNewOrder ? 'new_order' : 'status_update', {
            dedupKey: dKey,
          });
          showToast(freshOrderNotif.title);
        }
      }
      knownNotifIdsRef.current = new Set(notifRes.notifications.map((n) => n.id));
      hasHydratedNotifsRef.current = true;
      setNotifications(notifRes.notifications);

      if (!user.isSandbox) {
        const activeOrder = ordersRes.orders.find(
          (o) => o.status !== 'delivered' && o.status !== 'cancelled'
        );
        if (activeOrder) {
          setLastTrackedOrder({
            orderId: activeOrder.id,
            trackingToken: activeOrder.trackingToken,
            orderNumber: activeOrder.orderNumber,
            restaurantName: activeOrder.restaurantName,
            estimatedMinutes: activeOrder.estimatedMinutes,
          });
        } else {
          setLastTrackedOrder((prev) => (prev && !prev.isSandbox ? null : prev));
        }
      }
    } catch {
      // ignore if guest
    }
  }, [user, showToast]);

  useEffect(() => {
    loadUserSignals();
  }, [loadUserSignals]);

  useRealtimeEvents({
    enabled: Boolean(user?.uid || lastTrackedOrder?.orderId),
    token: getAuthToken(),
    orderId: lastTrackedOrder?.orderId ?? null,
    trackingToken: lastTrackedOrder?.trackingToken ?? null,
    pollFallbackMs: 4000,
    onSync: () => {
      void loadUserSignals();
      void refreshPublicBanner();
    },
    onEvent: (ev) => {
      if (ev.type === 'order:created') {
        const isOwnerMatch =
          user?.role === 'restaurant_owner' &&
          (!ev.payload.restaurantOwnerUid || ev.payload.restaurantOwnerUid === user.uid);
        if (
          isOwnerMatch ||
          user?.role === 'rider' ||
          user?.role === 'admin' ||
          user?.role === 'super_admin'
        ) {
          void playOrderAlertChime('new_order', {
            dedupKey: `order_created_${String(ev.payload.orderId || ev.payload.orderNumber || '')}`,
          });
          showToast(
            lang === 'bn'
              ? `নতুন অর্ডার এসেছে: ${String(ev.payload.orderNumber || '')}`
              : `New order arrived: ${String(ev.payload.orderNumber || '')}`
          );
        }
        void loadUserSignals();
        void refreshPublicBanner();
      } else if (ev.type === 'order:updated') {
        const ordNum = String(ev.payload.orderNumber || '');
        const st = String(ev.payload.status || '').replace(/_/g, ' ');
        const isMyTrackedOrder =
          (lastTrackedOrder?.orderId && lastTrackedOrder.orderId === Number(ev.payload.orderId)) ||
          (user?.uid && ev.payload.customerUid === user.uid);
        if (ordNum && st && isMyTrackedOrder) {
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${String(ev.payload.orderId || '')}_${String(ev.payload.status || '')}`,
          });
          showToast(
            lang === 'bn'
              ? `অর্ডার ${ordNum} আপডেট: ${st}`
              : `Order ${ordNum} updated: ${st}`
          );
        }
        if (ev.payload.status === 'delivered' && lastTrackedOrder?.orderId === Number(ev.payload.orderId)) {
          setLastTrackedOrder(null);
        }
        void loadUserSignals();
        void refreshPublicBanner();
      } else if (ev.type === 'notification:created') {
        if (ev.payload.title) {
          const titleStr = String(ev.payload.title);
          const isNewOrder = titleStr.toLowerCase().includes('new order');
          void playOrderAlertChime(isNewOrder ? 'new_order' : 'status_update', {
            dedupKey:
              isNewOrder && ev.payload.relatedOrderId
                ? `order_created_${String(ev.payload.relatedOrderId)}`
                : `notif_rt_${titleStr}`,
          });
          showToast(titleStr);
        }
        void loadUserSignals();
      }
    },
  });

  const handleNotificationClick = useCallback(
    async (n: NotificationItem) => {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
      setNotifOpen(false);
      apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});

      if (n.relatedOrderId) {
        setView({ type: 'tracking', orderId: n.relatedOrderId });
      } else if (user?.role === 'restaurant_owner') {
        setView({ type: 'vendor' });
      } else if (user?.role === 'rider') {
        setView({ type: 'rider' });
      } else if (user?.role === 'super_admin' || user?.role === 'admin') {
        setView({ type: 'admin' });
      } else {
        setView({ type: 'customer' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [user?.role]
  );

  // Fetch live Dhaka zone weather from Open-Meteo proxy
  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      weather: {
        tempC: number;
        labelEn: string;
        labelBn: string;
        isRaining: boolean;
        rainBufferMin: number;
      };
    }>(`/api/free/weather?lat=${selectedArea.lat}&lng=${selectedArea.lng}`)
      .then((res) => {
        if (!cancelled) setWeather(res.weather);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedArea.lat, selectedArea.lng]);

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      showToast(lang === 'bn' ? 'জিপিএস সমর্থিত নয়' : 'Geolocation unavailable');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const res = await apiFetch<{ areaName: string; displayName: string }>(
            `/api/free/reverse-geocode?lat=${lat}&lng=${lng}&lang=${lang}`
          );
          const nextArea = {
            name: res.areaName || 'Bangladesh',
            nameBn: res.areaName || 'বাংলাদেশ',
            lat,
            lng,
            displayName: res.displayName,
          };
          setSelectedArea(nextArea);
          saveRecentAddress({
            shortName: nextArea.name,
            shortNameBn: nextArea.nameBn,
            displayName: res.displayName || nextArea.name,
            lat,
            lng,
          });
          showToast(
            lang === 'bn' ? `অবস্থান সেট হয়েছে: ${res.areaName}` : `Location set: ${res.areaName}`
          );
        } finally {
          setLocatingGps(false);
        }
      },
      () => {
        setLocatingGps(false);
        showToast(lang === 'bn' ? 'লোকেশন পারমিশন পাওয়া যায়নি' : 'Location permission denied');
      },
      { timeout: 5000 }
    );
  };

  const openRestaurant = useCallback(async (slug: string) => {
    setView({ type: 'restaurant', slug });
    setLoadingDetail(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await apiFetch<{
        restaurant: Restaurant;
        items: FoodItem[];
        reviews: ReviewItem[];
      }>(`/api/restaurants/${slug}`);
      setDetailData(res);
    } catch (err) {
      console.error('Failed to load restaurant detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleToggleFavorite = async (restaurantId: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const res = await apiFetch<{ favorited: boolean }>('/api/customer/favorites', {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    });
    setFavoriteIds((prev) =>
      res.favorited ? [...prev, restaurantId] : prev.filter((id) => id !== restaurantId)
    );
  };

  const handleAddToCart = (restaurant: Restaurant, item: CartItemInput) => {
    const allowed = canAddToSingleRestaurantCart(cartItems, restaurant.id);
    if (!allowed) {
      setPendingSwitchItem({ restaurant, item });
      return;
    }
    setCartRestaurant(restaurant);
    setCartItems((prev) => [...prev, item]);
    showToast(
      lang === 'bn' ? `${item.nameBn} কার্টে যোগ হয়েছে` : `${item.name} added to cart`
    );
  };

  const handleQuickAddProduct = (product: StorefrontProduct) => {
    if (!product.isOpen) {
      showToast(
        buildRestaurantUnavailableMessage(product.restaurantName, 'approved', false, lang)
      );
      return;
    }
    if (!product.inStock) {
      showToast(lang === 'bn' ? 'দুঃখিত, খাবারটি স্টকে নেই' : 'Sorry, this dish is out of stock');
      return;
    }
    const matched: Restaurant =
      restaurants.find((r) => r.id === product.restaurantId) || {
        id: product.restaurantId,
        ownerUid: '',
        name: product.restaurantName,
        nameBn: product.restaurantNameBn,
        slug: product.restaurantSlug,
        cuisine: product.restaurantCuisine,
        area: product.restaurantArea,
        address: product.restaurantArea,
        lat: selectedArea.lat,
        lng: selectedArea.lng,
        phone: '',
        email: '',
        description: '',
        logoUrl: product.restaurantLogoUrl,
        coverUrl: product.restaurantCoverUrl || product.imageUrl,
        tradeLicense: null,
        nidNumber: null,
        payoutMethod: 'bkash',
        payoutAccount: '',
        rating: product.rating,
        reviewCount: 0,
        deliveryTimeMin: product.deliveryTimeMin,
        deliveryFee: product.deliveryFee,
        minOrder: product.minOrder,
        discountPct: 0,
        priceTier: '৳৳',
        openingHours: '10:00 AM - 11:30 PM',
        isOpen: product.isOpen,
        isSponsored: false,
        isNew: false,
        deliveryMode: product.deliveryMode,
        commissionRate: '15.00',
        commissionType: 'percentage',
        fixedCommission: 0,
        subscriptionPlan: 'basic',
        status: 'approved',
      };

    handleAddToCart(matched, {
      foodItemId: product.id,
      restaurantId: product.restaurantId,
      name: product.name,
      nameBn: product.nameBn,
      basePrice: product.price,
      discountPrice: product.discountPrice,
      variationName: product.variationsJson?.[0]?.name || 'Regular',
      variationDelta: product.variationsJson?.[0]?.priceDelta || 0,
      addons: [],
      quantity: 1,
      imageUrl: product.imageUrl,
    });
  };

  const confirmSwitchRestaurantCart = () => {
    if (!pendingSwitchItem) return;
    setCartRestaurant(pendingSwitchItem.restaurant);
    setCartItems([pendingSwitchItem.item]);
    setPendingSwitchItem(null);
    showToast(
      lang === 'bn' ? 'নতুন রেস্টুরেন্টের কার্ট শুরু হয়েছে' : 'Started new cart for this restaurant'
    );
  };

  const handleKeepExistingAndAdd = () => {
    if (!pendingSwitchItem) return;
    setCartItems((prev) => [...prev, pendingSwitchItem.item]);
    setPendingSwitchItem(null);
    showToast(
      lang === 'bn'
        ? `${pendingSwitchItem.item.nameBn} আগের খাবারের সাথে কার্টে যুক্ত হয়েছে`
        : `${pendingSwitchItem.item.name} added to cart with existing items`
    );
  };

  const handleUpdateQty = (idx: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((it, i) => (i === idx ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0)
    );
  };

  const handleRemoveCartItem = (idx: number) => {
    setCartItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setCartRestaurant(null);
      return next;
    });
  };

  const handleClearCart = () => {
    setCartItems([]);
    setCartRestaurant(null);
  };

  const handleSwitchWorkspace = async (
    role: 'customer' | 'restaurant_owner' | 'rider',
    targetView: ViewMode
  ) => {
    await signInSandboxPersona(role);
    setAuthModalOpen(false);
    setView(targetView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isPrivilegedAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));

  useEffect(() => {
    if (pendingAdminRedirect && isPrivilegedAdmin) {
      setPendingAdminRedirect(false);
      setAuthModalOpen(false);
      setView({ type: 'admin' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pendingAdminRedirect, isPrivilegedAdmin]);

  useEffect(() => {
    if (pendingVendorRedirect && user) {
      setPendingVendorRedirect(false);
      setAuthModalOpen(false);
      setView({ type: 'vendor', onboarding: user.role !== 'restaurant_owner' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pendingVendorRedirect, user]);

  const openPartnerPortal = useCallback(
    (onboarding = true) => {
      if (
        user &&
        (user.role === 'restaurant_owner' ||
          user.role === 'admin' ||
          user.role === 'super_admin' ||
          !user.isSandbox)
      ) {
        setView({ type: 'vendor', onboarding });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      clearError();
      setPendingAdminRedirect(false);
      setShowAdminPinBox(false);
      setPendingVendorRedirect(true);
      setAuthMode('register');
      setAuthRole('restaurant_owner');
      setAuthModalOpen(true);
    },
    [user, clearError]
  );

  const openAdminOrPromptSignIn = useCallback(() => {
    if (isPrivilegedAdmin) {
      setView({ type: 'admin' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    clearError();
    setPendingVendorRedirect(false);
    setPendingAdminRedirect(true);
    setShowAdminPinBox(true);
    setAuthModalOpen(true);
  }, [isPrivilegedAdmin, clearError]);

  const filteredRestaurants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = restaurants.filter((r) => {
      if (selectedCuisine !== 'All' && !r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase())) {
        return false;
      }
      if (onlyDiscount && r.discountPct <= 0) return false;
      if (onlyFreeFirst && r.deliveryFee > 50) return false;
      if (priceTierFilter && r.priceTier !== priceTierFilter) return false;
      if (deliveryFleetFilter !== 'all' && r.deliveryMode !== deliveryFleetFilter) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.nameBn.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          r.area.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const sorted = [...list];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => Number(b.rating) - Number(a.rating));
    } else if (sortBy === 'fastest') {
      sorted.sort((a, b) => a.deliveryTimeMin - b.deliveryTimeMin);
    } else if (sortBy === 'lowFee') {
      sorted.sort((a, b) => a.deliveryFee - b.deliveryFee);
    } else {
      sorted.sort((a, b) => {
        if (a.isSponsored !== b.isSponsored) return a.isSponsored ? -1 : 1;
        return Number(b.rating) - Number(a.rating);
      });
    }
    return sorted;
  }, [restaurants, selectedCuisine, onlyDiscount, onlyFreeFirst, priceTierFilter, deliveryFleetFilter, searchQuery, sortBy]);

  const filteredProducts = useMemo(() => {
    return filterStorefrontProducts(storefrontProducts, {
      cuisine: selectedCuisine,
      query: searchQuery,
      onlyDiscount,
      deliveryFleet: deliveryFleetFilter,
    });
  }, [storefrontProducts, selectedCuisine, searchQuery, onlyDiscount, deliveryFleetFilter]);

  const visibleHomepageProducts = useMemo(() => {
    return showAllProducts ? filteredProducts : filteredProducts.slice(0, 8);
  }, [filteredProducts, showAllProducts]);

  const totalCartItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#2E3138]">
      {/* GMP Quota Exceeded Banner (Case A) */}
      {gmpQuotaBanner && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm flex items-center justify-between gap-3"
        >
          <span className="flex-1">
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
          <button
            type="button"
            onClick={() => setGmpQuotaBanner(false)}
            className="font-semibold underline shrink-0 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Announcement Ticker Controlled via Admin -> Frontend Control */}
      {sc.announcementBarEnabled && (
        <div
          data-testid="storefront-announcement-bar"
          style={{ backgroundColor: sc.accentColor }}
          className="text-white text-xs py-2 px-4 text-center font-semibold flex items-center justify-center gap-3"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'bn' ? sc.announcementTextBn : sc.announcementTextEn}</span>
          <button
            type="button"
            onClick={() => {
              setView({ type: 'home' });
              setOnlyDiscount(true);
            }}
            className="underline font-extrabold whitespace-nowrap shrink-0 hover:opacity-90"
          >
            {lang === 'bn' ? 'অফার দেখুন →' : 'View Deals →'}
          </button>
        </div>
      )}

      {/* Maintenance Notice Controlled via Admin -> Frontend Control */}
      {sc.maintenanceMode && (
        <div
          role="status"
          data-testid="storefront-maintenance-banner"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 font-semibold flex items-center justify-center gap-2 text-center"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{sc.maintenanceMessage}</span>
        </div>
      )}

      {/* Top Accent Partner Bar (Controlled via Admin -> Frontend Control) */}
      {sc.showTopPartnerBar && (
        <div style={{ backgroundColor: sc.accentColor }} className="text-white text-xs">
          <div className="max-w-[1400px] mx-auto px-2 sm:px-6 h-10 sm:h-11 flex items-center justify-center gap-1.5 sm:gap-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => openPartnerPortal(false)}
              className="px-2.5 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Store className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'partnerCta')}</span>
              <span className="sm:hidden">Partner</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setView({ type: 'rider', onboarding: true });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-2.5 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Bike className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'riderCta')}</span>
              <span className="sm:hidden">Rider Job</span>
            </button>
            <button
              type="button"
              onClick={openAdminOrPromptSignIn}
              className="px-2.5 sm:px-4 py-1 rounded-lg border border-white/80 hover:bg-white/15 font-bold text-[10px] sm:text-[11px] uppercase tracking-wide inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isPrivilegedAdmin
                  ? t(lang, 'adminCta')
                  : lang === 'bn'
                  ? 'অ্যাডমিন প্যানেল'
                  : 'Admin Panel'}
              </span>
              <span className="sm:hidden">Admin</span>
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Tier Clean White Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Top Row: Responsive Brand Logo, Inline Location, Auth, Track Rider, Lang, Orders, Cart */}
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setView({ type: 'home' })}
              aria-label={`${sc.brandPrefix}${sc.brandSuffix} Home`}
              className="flex items-center gap-1.5 sm:gap-2 shrink-0 group whitespace-nowrap"
            >
              <img
                src="/foodora-icon.svg"
                alt="Foodora BD Icon"
                className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl shadow-xs shrink-0 group-hover:scale-105 transition-transform object-cover"
              />
              <span
                style={{ color: sc.accentColor }}
                className="text-sm min-[390px]:text-base sm:text-[21px] font-extrabold tracking-tight leading-none whitespace-nowrap"
              >
                {sc.brandPrefix}
                <span className="text-[#2E3138]">{sc.brandSuffix}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLocationRouteOrigin({
                  name: selectedArea.name,
                  nameBn: selectedArea.nameBn,
                  lat: selectedArea.lat,
                  lng: selectedArea.lng,
                });
                setLocationModalTab('map');
                setLocationModalOpen(true);
              }}
              aria-label={lang === 'bn' ? 'ডেলিভারি লোকেশন পরিবর্তন করুন' : 'Change delivery location'}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F7F7F8] hover:bg-[#FFF0F6] border border-neutral-200/90 hover:border-[#E21B70]/40 text-xs text-[#2E3138] max-w-[300px] transition-colors"
            >
              <MapPin className="w-4 h-4 text-[#E21B70] shrink-0" />
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-[11px] font-medium text-neutral-500 shrink-0">
                  {lang === 'bn' ? 'লোকেশন:' : 'Deliver to:'}
                </span>
                <span className="font-bold truncate">
                  {lang === 'bn' ? selectedArea.nameBn : selectedArea.name}, BD
                </span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            </button>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {authLoading ? (
              <div className="w-8 sm:w-20 h-8 sm:h-9 rounded-lg bg-neutral-100" />
            ) : user ? (
              <>
                {isPrivilegedAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setView({ type: 'vendor' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFF0F6] hover:bg-[#FFE4EF] text-[#E21B70] border border-[#E21B70]/30 text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'আমার স্টোর' : 'My Store'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setView({ type: 'admin' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      aria-label="Open Admin Dashboard"
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg bg-[#2E3138] hover:bg-black text-white text-[11px] sm:text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#E21B70]" />
                      <span className="hidden sm:inline">
                        {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </span>
                      <span className="hidden min-[380px]:inline sm:hidden">Admin</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Account and Workspace"
                  onClick={() => {
                    clearError();
                    setAuthModalOpen(true);
                  }}
                  className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-neutral-300 hover:border-[#2E3138] text-xs font-bold text-[#2E3138] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <User className="w-4 h-4 text-[#E21B70]" />
                  <span className="hidden sm:inline max-w-[110px] truncate">
                    {user.fullName.split(' ')[0]}
                  </span>
                  {!user.isSandbox && (
                    <span className="hidden md:inline px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                      {user.role === 'super_admin' ? 'ADMIN' : user.role.toUpperCase()}
                    </span>
                  )}
                </button>
                {user.isSandbox && (
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      setShowAdminPinBox(false);
                      setPendingAdminRedirect(false);
                      setAuthMode('register');
                      setAuthModalOpen(true);
                    }}
                    className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E21B70]/40 bg-[#FFF0F6] hover:bg-[#FFE4EF] text-[#E21B70] text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'অ্যাকাউন্ট তৈরি' : 'Create Account'}</span>
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                aria-label={lang === 'bn' ? 'লগইন / অ্যাকাউন্ট তৈরি' : 'Login or Create Account'}
                onClick={() => {
                  clearError();
                  setAuthModalOpen(true);
                }}
                style={{ backgroundColor: sc.accentColor }}
                className="px-2 sm:px-3.5 py-1.5 rounded-lg hover:opacity-90 text-white text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-opacity"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden min-[380px]:inline sm:hidden">
                  {lang === 'bn' ? 'লগইন' : 'Login'}
                </span>
                <span className="hidden sm:inline">
                  {lang === 'bn' ? 'লগইন / অ্যাকাউন্ট তৈরি' : 'Login / Create Account'}
                </span>
              </button>
            )}

            <button
              type="button"
              aria-label={lang === 'bn' ? 'রাইডার ট্র্যাক' : 'Track Rider'}
              onClick={() => {
                if (lastTrackedOrder && view.type !== 'tracking') {
                  setView({
                    type: 'tracking',
                    orderId: lastTrackedOrder.orderId,
                    token: lastTrackedOrder.trackingToken,
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  return;
                }
                setTrackLookupError(null);
                if (!trackEmailInput && user && !user.isSandbox && user.email) {
                  setTrackEmailInput(user.email);
                }
                setEmailTrackModalOpen(true);
              }}
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                lastTrackedOrder
                  ? 'border-emerald-300 bg-emerald-50/70 text-[#2E3138] hover:border-emerald-500'
                  : 'border-neutral-300 hover:border-[#E21B70] text-[#2E3138]'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
              {lastTrackedOrder && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              )}
              <span className="hidden md:inline">
                {lastTrackedOrder
                  ? lang === 'bn'
                    ? 'লাইভ রাইডার ট্র্যাক'
                    : 'Track Rider Live'
                  : lang === 'bn'
                  ? 'রাইডার / অর্ডার ট্র্যাক'
                  : 'Track Rider'}
              </span>
              <span className="hidden min-[430px]:inline md:hidden">
                {lang === 'bn' ? 'ট্র্যাক' : 'Track'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setView({ type: 'customer' })}
              style={{ backgroundColor: sc.accentColor }}
              className="hidden sm:inline-flex px-3.5 py-1.5 rounded-lg hover:opacity-90 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-opacity"
            >
              {t(lang, 'myOrders')}
            </button>

            {/* Segmented EN | বাংলা Toggle */}
            <div
              role="group"
              aria-label="Language switcher"
              className="inline-flex items-center rounded-lg border border-neutral-200 bg-[#F7F7F7] p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                  lang === 'en'
                    ? 'bg-[#2E3138] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-[#2E3138]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                  lang === 'bn'
                    ? 'bg-[#2E3138] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-[#2E3138]'
                }`}
              >
                <span className="min-[400px]:hidden">বাং</span>
                <span className="hidden min-[400px]:inline">বাংলা</span>
              </button>
            </div>

            {/* Notifications (Click-outside closes + Clickable navigation links) */}
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                aria-label="Notifications"
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((v) => !v)}
                className={`relative p-1.5 sm:p-2 rounded-lg border transition-colors ${
                  notifOpen
                    ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                    : 'border-neutral-200 hover:border-[#E21B70] text-neutral-700'
                }`}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span
                    style={{ backgroundColor: sc.accentColor }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
                  >
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="region"
                  aria-label="Notifications menu"
                  data-testid="notifications-popover"
                  className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-neutral-200 shadow-2xl p-3 z-50"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100">
                    <span className="text-xs font-bold text-[#2E3138] flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#E21B70]" />
                      <span>{lang === 'bn' ? 'বিজ্ঞপ্তি ও আপডেট' : 'Notifications & Updates'}</span>
                    </span>
                    {unreadNotifs > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch('/api/notifications/read-all', { method: 'POST' });
                          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                        }}
                        className="text-[11px] font-semibold text-[#E21B70] hover:underline"
                      >
                        {lang === 'bn' ? 'সব পড়া হয়েছে' : 'Mark all read'}
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100 py-1">
                    {!user ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          clearError();
                          setAuthModalOpen(true);
                        }}
                        className="w-full text-left p-3 rounded-xl hover:bg-[#FFF0F6] transition-colors space-y-1"
                      >
                        <p className="text-xs font-bold text-[#2E3138]">
                          {lang === 'bn' ? 'অর্ডার আপডেট দেখতে সাইন ইন করুন' : 'Sign in for live order updates'}
                        </p>
                        <p className="text-[11px] text-[#E21B70] font-semibold inline-flex items-center gap-1">
                          <span>{lang === 'bn' ? 'লগইন / Google সাইন ইন খুলুন' : 'Open Sign In / Google Login'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </p>
                      </button>
                    ) : notifications.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          setView({ type: 'customer' });
                        }}
                        className="w-full text-center py-6 px-3 rounded-xl hover:bg-[#FFF0F6]/60 transition-colors space-y-1.5"
                      >
                        <p className="text-xs text-neutral-500">
                          {lang === 'bn' ? 'কোনো নতুন বিজ্ঞপ্তি নেই' : 'No new notifications right now'}
                        </p>
                        <p className="text-[11px] font-semibold text-[#E21B70] inline-flex items-center gap-1">
                          <span>{lang === 'bn' ? 'আমার অর্ডার দেখুন →' : 'View My Orders & Activity →'}</span>
                        </p>
                      </button>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-2.5 py-2.5 rounded-xl hover:bg-[#FFF0F6]/80 transition-colors flex items-start gap-2.5 group ${
                            n.isRead ? 'opacity-80' : 'bg-[#FFF9FB]'
                          }`}
                        >
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                              n.isRead ? 'bg-neutral-300' : 'bg-[#E21B70]'
                            }`}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-bold text-[#2E3138] group-hover:text-[#E21B70] transition-colors">
                              {n.title}
                            </p>
                            <p className="text-[11px] text-neutral-600 leading-relaxed">{n.message}</p>
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span className="text-[10px] text-neutral-400 tabular-nums">
                                {new Date(n.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-[11px] font-bold text-[#E21B70] inline-flex items-center gap-1 group-hover:underline">
                                <span>
                                  {n.relatedOrderId
                                    ? lang === 'bn'
                                      ? 'অর্ডার ট্র্যাক করুন'
                                      : 'Track Order'
                                    : lang === 'bn'
                                    ? 'পোর্টাল খুলুন'
                                    : 'Open Details'}
                                </span>
                                <ExternalLink className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {user && (
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          setView({
                            type:
                              user.role === 'restaurant_owner'
                                ? 'vendor'
                                : user.role === 'rider'
                                ? 'rider'
                                : user.role === 'super_admin' || user.role === 'admin'
                                ? 'admin'
                                : 'customer',
                          });
                        }}
                        className="text-[11px] font-bold text-[#E21B70] hover:underline inline-flex items-center gap-1"
                      >
                        <span>{lang === 'bn' ? 'সব অর্ডার ও কার্যক্রম দেখুন →' : 'View All Orders & Activity →'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] font-semibold text-neutral-400 hover:text-neutral-600"
                      >
                        {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Open Cart"
              style={{ backgroundColor: sc.accentColor }}
              className="px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg hover:opacity-90 text-white text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 tabular-nums whitespace-nowrap shrink-0 transition-opacity"
            >
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t(lang, 'cart')}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] sm:text-[11px]">{totalCartItems}</span>
            </button>
          </div>
        </div>

        {/* Sub-Navigation Row on Storefront Home (Delivery / Pickup Underlined Tabs + Pill Search) */}
        {view.type === 'home' && (
          <div className="hidden lg:block border-t border-neutral-100 bg-white">
            <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between gap-6">
              <div className="flex items-center gap-7 h-full">
                <button
                  type="button"
                  onClick={() => setFulfillmentTab('delivery')}
                  style={
                    fulfillmentTab === 'delivery'
                      ? { borderColor: sc.accentColor, color: sc.accentColor }
                      : undefined
                  }
                  className={`h-full inline-flex items-center gap-1.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    fulfillmentTab === 'delivery'
                      ? 'border-[#E21B70] text-[#E21B70]'
                      : 'border-transparent text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>{t(lang, 'delivery')}</span>
                </button>
                {sc.showPickupTab && (
                  <button
                    type="button"
                    onClick={() => setFulfillmentTab('pickup')}
                    style={
                      fulfillmentTab === 'pickup'
                        ? { borderColor: sc.accentColor, color: sc.accentColor }
                        : undefined
                    }
                    className={`h-full inline-flex items-center gap-1.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                      fulfillmentTab === 'pickup'
                        ? 'border-[#E21B70] text-[#E21B70]'
                        : 'border-transparent text-neutral-600 hover:text-[#2E3138]'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{t(lang, 'pickup')}</span>
                  </button>
                )}

                {weather && (
                  <span
                    data-testid="dhaka-weather-status"
                    className="inline-flex items-center gap-1.5 text-xs text-neutral-600 tabular-nums whitespace-nowrap shrink-0"
                  >
                    {weather.isRaining ? (
                      <CloudRain className="w-3.5 h-3.5 text-[#E21B70]" />
                    ) : (
                      <CloudSun className="w-3.5 h-3.5 text-[#E21B70]" />
                    )}
                    <span>
                      {weather.tempC}°C · {lang === 'bn' ? weather.labelBn : weather.labelEn}
                      {weather.rainBufferMin > 0
                        ? lang === 'bn'
                          ? ` (+${weather.rainBufferMin} মি. রাইডার সময়)`
                          : ` (+${weather.rainBufferMin}m rider buffer)`
                        : ''}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-80 xl:w-96">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(lang, 'searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-1.5 rounded-full bg-[#F7F7F7] border border-neutral-200 text-xs focus:outline-none focus:bg-white focus:border-[#E21B70] transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => openPartnerPortal(true)}
                  className="text-xs font-bold text-[#E21B70] hover:underline whitespace-nowrap shrink-0"
                >
                  {lang === 'bn' ? '+ আপনার রেস্টুরেন্ট যুক্ত করুন' : '+ List Your Restaurant'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Router */}
      <main className="flex-1">
        {view.type === 'restaurant' ? (
          loadingDetail || !detailData ? (
            <div className="max-w-6xl mx-auto px-4 py-10">
              <div className="h-56 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
                {lang === 'bn' ? 'মেনু লোড হচ্ছে...' : 'Loading restaurant menu...'}
              </div>
            </div>
          ) : (
            <RestaurantDetailView
              restaurant={detailData.restaurant}
              items={detailData.items}
              reviews={detailData.reviews}
              lang={lang}
              mapsApiKey={mapsApiKey}
              selectedArea={selectedArea}
              isFavorited={favoriteIds.includes(detailData.restaurant.id)}
              onToggleFavorite={handleToggleFavorite}
              onAddToCart={(item) => handleAddToCart(detailData.restaurant, item)}
              onBack={() => setView({ type: 'home' })}
            />
          )
        ) : view.type === 'tracking' ? (
          <OrderTrackingView
            orderId={view.orderId}
            initialToken={view.token}
            lang={lang}
            mapsApiKey={mapsApiKey}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'customer' ? (
          user ? (
            <CustomerDashboard
              user={user}
              lang={lang}
              mapsApiKey={mapsApiKey}
              restaurants={restaurants}
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
              onSelectRestaurant={openRestaurant}
              onTrackOrder={(orderId) => setView({ type: 'tracking', orderId })}
              onSelectDefaultAddress={(areaName, lat, lng) => {
                const found = BANGLADESH_AREAS.find((a) => a.name === areaName);
                setSelectedArea({
                  name: areaName,
                  nameBn: found?.nameBn || areaName,
                  lat,
                  lng,
                });
                showToast(lang === 'bn' ? 'ডেলিভারি ঠিকানা আপডেট হয়েছে' : 'Delivery location updated');
              }}
              onBack={() => setView({ type: 'home' })}
            />
          ) : (
            <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-[#2E3138]">
                {lang === 'bn' ? 'আপনার অর্ডার ও প্রোফাইল দেখুন' : 'View Your Orders & Saved Addresses'}
              </h1>
              <p className="text-sm text-neutral-600">
                {lang === 'bn'
                  ? 'আপনার পূর্বের সব অর্ডার দেখতে সাইন ইন করুন, অথবা গেস্ট হিসেবে অর্ডার করলে ইমেইল দিয়ে লাইভ রাইডার ট্র্যাক করুন।'
                  : 'Sign in to view your full order history, or look up any guest order live using your checkout email.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setAuthMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                >
                  {lang === 'bn' ? 'সাইন ইন / নতুন অ্যাকাউন্ট' : 'Sign In / Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrackLookupError(null);
                    setEmailTrackModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-xs font-bold text-[#2E3138]"
                >
                  {lang === 'bn' ? 'ইমেইলে অর্ডার ট্র্যাক করুন' : 'Track Order by Email'}
                </button>
              </div>
            </div>
          )
        ) : view.type === 'vendor' && user ? (
          <VendorDashboard
            user={user}
            lang={lang}
            mapsApiKey={mapsApiKey}
            initialOnboarding={view.onboarding}
            initialRestaurantId={view.restaurantId ?? null}
            onRefreshUser={refreshUser}
            onMenuMutated={loadStorefront}
            onTrackOrder={(orderId) => setView({ type: 'tracking', orderId })}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'rider' ? (
          <RiderDashboard
            user={user}
            lang={lang}
            mapsApiKey={mapsApiKey}
            initialOnboarding={view.onboarding}
            onRefreshUser={refreshUser}
            onTrackOrder={(orderId) => setView({ type: 'tracking', orderId })}
            onBack={() => setView({ type: 'home' })}
          />
        ) : view.type === 'admin' ? (
          isPrivilegedAdmin && user ? (
            <AdminDashboard
              lang={lang}
              mapsApiKey={mapsApiKey}
              currentUser={user}
              onRestaurantsMutated={loadStorefront}
              onTrackOrder={(orderId) => {
                setView({ type: 'tracking', orderId });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenVendorStore={(restaurantId) => {
                setView({ type: 'vendor', restaurantId });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onBack={() => setView({ type: 'home' })}
            />
          ) : (
            <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-[#2E3138]">
                {lang === 'bn' ? 'অ্যাডমিন / সুপার অ্যাডমিন অ্যাক্সেস সংরক্ষিত' : 'Admin & Super Admin Access Restricted'}
              </h1>
              <p className="text-sm text-neutral-600">
                {lang === 'bn'
                  ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন বা সুপার অ্যাডমিন অ্যাকাউন্ট দিয়ে সাইন ইন করে এই কন্ট্রোল প্যানেল ব্যবহার করা যাবে।'
                  : 'Only verified Admin or Super Admin accounts can access the platform control panel.'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setAuthModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                >
                  {lang === 'bn' ? 'অ্যাডমিন সাইন ইন' : 'Sign In as Admin'}
                </button>
                <button
                  type="button"
                  onClick={() => setView({ type: 'home' })}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700"
                >
                  {lang === 'bn' ? 'হোমে ফিরুন' : 'Back to Storefront'}
                </button>
              </div>
            </div>
          )
        ) : (
          /* Storefront Homepage (Foodpanda BD Visual Architecture) */
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-7">
            {/* Left Sidebar (Dark Promo Card + Clean Filter Panel) */}
            <aside className="hidden lg:block w-[248px] shrink-0 space-y-5">
              {/* Brand-Matched Rose-Blush Promo Ticket Card (Controlled via Admin -> Frontend Control) */}
              {sc.showPromoTicket && (
                <div className="rounded-2xl bg-gradient-to-br from-[#FFF0F6] via-[#FFF8FB] to-[#FFE2EE] border border-[#F8BBD0] text-[#2E3138] p-4 space-y-3 shadow-xs">
                  <div className="bg-white text-[#2E3138] rounded-xl p-3 border border-[#FBCFE8] flex items-center justify-between gap-2 shadow-2xs">
                    <div>
                      <p
                        style={{ color: sc.accentColor }}
                        className="text-[10px] font-bold uppercase tracking-wider"
                      >
                        {lang === 'bn' ? 'প্রথম অর্ডার কোড' : 'First Order Code'}
                      </p>
                      <p className="text-sm font-extrabold font-mono-nums tracking-wide">{sc.promoCode}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Copy ${sc.promoCode} promo code`}
                      onClick={() => {
                        navigator.clipboard?.writeText(sc.promoCode);
                        setCopiedCode(sc.promoCode);
                        showToast(
                          lang === 'bn' ? `${sc.promoCode} কপি হয়েছে` : `Copied ${sc.promoCode}`
                        );
                      }}
                      className="p-2 rounded-lg bg-[#FFF0F6] text-[#E21B70] hover:bg-[#E21B70] hover:text-white transition-colors"
                    >
                      {copiedCode === sc.promoCode ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-[#4A2535] font-medium">
                    {lang === 'bn' ? sc.promoDescBn : sc.promoDescEn}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (restaurants[0]) openRestaurant(restaurants[0].slug);
                      }}
                      style={{ backgroundColor: sc.accentColor }}
                      className="py-1.5 rounded-lg text-white hover:opacity-90 text-[11px] font-bold transition-opacity shadow-2xs"
                    >
                      {lang === 'bn' ? sc.heroBtnBn : sc.heroBtnEn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlyDiscount((v) => !v)}
                      className="py-1.5 rounded-lg bg-white border border-[#E21B70]/30 hover:border-[#E21B70] text-[#E21B70] text-[11px] font-bold transition-colors"
                    >
                      {lang === 'bn' ? 'অফার দেখুন' : 'View Deals'}
                    </button>
                  </div>
                </div>
              )}

              {/* Clean Filters Card */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-5 sticky top-32">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm text-[#2E3138] flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-[#E21B70]" />
                    <span>{t(lang, 'filters')}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCuisine('All');
                      setSortBy('relevance');
                      setOnlyDiscount(false);
                      setOnlyFreeFirst(false);
                      setPriceTierFilter('');
                      setDeliveryFleetFilter('all');
                      setSearchQuery('');
                    }}
                    className="text-[11px] font-semibold text-[#E21B70] hover:underline"
                  >
                    {t(lang, 'clearFilters')}
                  </button>
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'sortBy')}</p>
                  {[
                    { id: 'relevance' as const, label: t(lang, 'relevance') },
                    { id: 'rating' as const, label: t(lang, 'rating') },
                    { id: 'fastest' as const, label: t(lang, 'fastest') },
                    { id: 'lowFee' as const, label: t(lang, 'lowFee') },
                  ].map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                      <input
                        type="radio"
                        name="sort"
                        checked={sortBy === opt.id}
                        onChange={() => setSortBy(opt.id)}
                        className="accent-[#E21B70]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Offers */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'offers')}</p>
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                    <input
                      type="checkbox"
                      checked={onlyDiscount}
                      onChange={(e) => setOnlyDiscount(e.target.checked)}
                      className="accent-[#E21B70]"
                    />
                    <span>{t(lang, 'hasDiscount')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                    <input
                      type="checkbox"
                      checked={onlyFreeFirst}
                      onChange={(e) => setOnlyFreeFirst(e.target.checked)}
                      className="accent-[#E21B70]"
                    />
                    <span>{t(lang, 'freeFirstOrder')}</span>
                  </label>
                </div>

                {/* Delivery Fleet */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'deliveryFilter')}</p>
                  <div className="space-y-1.5">
                    {[
                      { id: 'all' as const, label: lang === 'bn' ? 'সব রাইডার' : 'All Fleets' },
                      { id: 'platform' as const, label: 'Foodora Rider' },
                      { id: 'third_party' as const, label: 'Pathao Courier' },
                    ].map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer hover:text-[#2E3138]">
                        <input
                          type="radio"
                          name="delivery-fleet"
                          checked={deliveryFleetFilter === opt.id}
                          onChange={() => setDeliveryFleetFilter(opt.id)}
                          className="accent-[#E21B70]"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price Tier */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700">{t(lang, 'priceRange')}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['৳', '৳৳', '৳৳৳'].map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setPriceTierFilter((p) => (p === tier ? '' : tier))}
                        className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                          priceTierFilter === tier
                            ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                            : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Storefront Column */}
            <div className="flex-1 min-w-0 space-y-8">
              {/* Active Order Live Rider Tracking Shortcut Banner */}
              {sc.showActiveDeliveryBar !== false && (lastTrackedOrder || featuredActiveOrder) && (() => {
                const bannerOrder = (lastTrackedOrder || featuredActiveOrder)!;
                return (
                  <div
                    data-testid="active-rider-shortcut-bar"
                    className="p-3 sm:px-4 sm:py-3 rounded-2xl bg-gradient-to-r from-[#FFF0F6] via-white to-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Bike className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#2E3138] flex items-center gap-1.5 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span>
                            {lang === 'bn' ? 'লাইভ অর্ডার চালু আছে' : 'Active Delivery Order'}
                            {bannerOrder.orderNumber ? ` · ${bannerOrder.orderNumber}` : ''}
                          </span>
                        </p>
                        <p className="text-[11px] text-neutral-600 truncate">
                          {bannerOrder.restaurantName || 'Foodora Partner'}
                          {bannerOrder.estimatedMinutes
                            ? ` · ${
                                lang === 'bn'
                                  ? `প্রায় ${formatDurationEstimate(Math.max(bannerOrder.estimatedMinutes, 8), 'bn')}`
                                  : `~${formatDurationEstimate(Math.max(bannerOrder.estimatedMinutes, 8), 'en', 'compact')} ETA`
                              }`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setView({
                          type: 'tracking',
                          orderId: bannerOrder.orderId,
                          token: bannerOrder.trackingToken,
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'রাইডার অবস্থান ও সময় দেখুন' : 'Track Rider & ETA'}</span>
                    </button>
                  </div>
                );
              })()}

              {/* Mobile Location + Search + Mode Switcher + Weather */}
              <div className="lg:hidden space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLocationRouteOrigin({
                        name: selectedArea.name,
                        nameBn: selectedArea.nameBn,
                        lat: selectedArea.lat,
                        lng: selectedArea.lng,
                      });
                      setLocationModalTab('map');
                      setLocationModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-neutral-200 hover:border-[#E21B70]/40 text-xs"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-[#E21B70] shrink-0" />
                      <span className="truncate font-semibold text-[#2E3138]">
                        {lang === 'bn' ? selectedArea.nameBn : selectedArea.name}, BD
                      </span>
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((v) => !v)}
                    className="px-3 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Filter className="w-3.5 h-3.5 text-[#E21B70]" />
                    <span>{t(lang, 'filters')}</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(lang, 'searchPlaceholder')}
                    className="w-full pl-9 pr-3 py-2 rounded-full bg-[#F7F7F7] border border-neutral-200 text-sm focus:outline-none focus:bg-white focus:border-[#E21B70]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-[#F7F7F7]">
                    <button
                      type="button"
                      onClick={() => setFulfillmentTab('delivery')}
                      style={fulfillmentTab === 'delivery' ? { backgroundColor: sc.accentColor } : undefined}
                      className={`px-3 py-1 rounded-md font-bold ${
                        fulfillmentTab === 'delivery' ? 'text-white' : 'text-neutral-600'
                      }`}
                    >
                      {t(lang, 'delivery')}
                    </button>
                    {sc.showPickupTab && (
                      <button
                        type="button"
                        onClick={() => setFulfillmentTab('pickup')}
                        style={fulfillmentTab === 'pickup' ? { backgroundColor: sc.accentColor } : undefined}
                        className={`px-3 py-1 rounded-md font-bold ${
                          fulfillmentTab === 'pickup' ? 'text-white' : 'text-neutral-600'
                        }`}
                      >
                        {t(lang, 'pickup')}
                      </button>
                    )}
                  </div>
                  {weather && (
                    <span className="inline-flex items-center gap-1 text-neutral-600 tabular-nums">
                      {weather.isRaining ? (
                        <CloudRain className="w-3.5 h-3.5 text-[#E21B70]" />
                      ) : (
                        <CloudSun className="w-3.5 h-3.5 text-[#E21B70]" />
                      )}
                      <span>{weather.tempC}°C · {lang === 'bn' ? weather.labelBn : weather.labelEn}</span>
                    </span>
                  )}
                </div>

                {mobileFiltersOpen && (
                  <div className="bg-white rounded-xl border border-neutral-200 p-3 flex flex-wrap gap-2 text-xs">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'relevance' | 'rating' | 'fastest' | 'lowFee')}
                      className="px-2.5 py-1.5 border border-neutral-200 rounded-lg bg-white"
                    >
                      <option value="relevance">{t(lang, 'relevance')}</option>
                      <option value="rating">{t(lang, 'rating')}</option>
                      <option value="fastest">{t(lang, 'fastest')}</option>
                      <option value="lowFee">{t(lang, 'lowFee')}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setOnlyDiscount((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border font-semibold ${
                        onlyDiscount ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]' : 'border-neutral-200'
                      }`}
                    >
                      {t(lang, 'hasDiscount')}
                    </button>
                  </div>
                )}
              </div>

              {/* Order Food Now — Direct Product Catalog at Top of Homepage (SEO + 1-Click Order) */}
              <section
                aria-labelledby="homepage-products-heading"
                data-testid="homepage-products-section"
                itemScope
                itemType="https://schema.org/ItemList"
                className="space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2
                      id="homepage-products-heading"
                      className="text-xl font-extrabold text-[#2E3138] tracking-tight"
                    >
                      {lang === 'bn'
                        ? 'জনপ্রিয় খাবার — ১ ক্লিকে অর্ডার করুন'
                        : 'Order Popular Food Now'}{' '}
                      <span className="text-sm font-semibold text-neutral-400 tabular-nums">
                        ({filteredProducts.length})
                      </span>
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {lang === 'bn'
                        ? 'ঢাকা ও বাংলাদেশের যেকোনো শহরের সেরা রেস্টুরেন্টের তাজা খাবার সরাসরি কার্টে যোগ করুন'
                        : 'Fresh signature dishes across Bangladesh — tap + Add to order straight from any city'}
                    </p>
                  </div>
                  {filteredProducts.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllProducts((v) => !v)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-bold text-[#E21B70] transition-colors"
                    >
                      {showAllProducts
                        ? lang === 'bn'
                          ? 'কম দেখুন'
                          : 'Show Less'
                        : lang === 'bn'
                        ? `সব দেখুন (${filteredProducts.length})`
                        : `View All (${filteredProducts.length})`}
                    </button>
                  )}
                </div>

                {loadingStore ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="rounded-2xl border border-neutral-200 p-3 space-y-2.5">
                        <div className="aspect-[16/10] rounded-xl bg-neutral-100" />
                        <div className="h-4 w-3/4 rounded bg-neutral-100" />
                        <div className="h-3 w-1/2 rounded bg-neutral-100" />
                      </div>
                    ))}
                  </div>
                ) : visibleHomepageProducts.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center text-xs text-neutral-500">
                    {lang === 'bn'
                      ? 'আপনার ফিল্টার অনুযায়ী কোনো খাবার পাওয়া যায়নি।'
                      : 'No dishes match your active filters.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {visibleHomepageProducts.map((product) => {
                      const hasOffer = Boolean(
                        product.discountPrice && product.discountPrice < product.price
                      );
                      const finalPrice = product.discountPrice ?? product.price;
                      return (
                        <article
                          key={product.id}
                          itemProp="itemListElement"
                          itemScope
                          itemType="https://schema.org/Product"
                          className="group bg-white rounded-2xl border border-neutral-200 hover:border-[#E21B70]/45 hover:shadow-md transition-all overflow-hidden flex flex-col"
                        >
                          <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              itemProp="image"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (!img.dataset.fallbackApplied) {
                                  img.dataset.fallbackApplied = '1';
                                  img.src =
                                    product.restaurantCoverUrl ||
                                    '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg';
                                }
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {hasOffer ? (
                              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#E21B70] text-white text-[10px] font-extrabold shadow-xs">
                                {Math.round(((product.price - finalPrice) / product.price) * 100)}% OFF
                              </span>
                            ) : product.isPopular ? (
                              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#2E3138]/85 text-white text-[10px] font-bold">
                                {lang === 'bn' ? 'জনপ্রিয়' : 'Best Seller'}
                              </span>
                            ) : null}
                            {!product.isOpen ? (
                              <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-xs font-bold px-2 text-center">
                                {lang === 'bn' ? 'রেস্টুরেন্ট বন্ধ' : 'Store Closed'}
                              </span>
                            ) : !product.inStock ? (
                              <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">
                                {lang === 'bn' ? 'স্টক শেষ' : 'Out of Stock'}
                              </span>
                            ) : null}
                          </div>

                          <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 truncate">
                                {product.category}
                              </p>
                              <h3
                                itemProp="name"
                                className="font-bold text-sm text-[#2E3138] leading-snug line-clamp-1"
                              >
                                {lang === 'bn' ? product.nameBn : product.name}
                              </h3>
                              <button
                                type="button"
                                onClick={() => openRestaurant(product.restaurantSlug)}
                                className="text-[11px] text-neutral-500 hover:text-[#E21B70] font-medium inline-flex items-center gap-1 truncate max-w-full"
                              >
                                <Store className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {lang === 'bn' ? product.restaurantNameBn : product.restaurantName}
                                </span>
                                <span>·</span>
                                <span className="tabular-nums shrink-0">{formatDurationEstimate(product.deliveryTimeMin, lang, 'compact')}</span>
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
                              <div
                                itemProp="offers"
                                itemScope
                                itemType="https://schema.org/Offer"
                                className="tabular-nums"
                              >
                                <meta itemProp="priceCurrency" content="BDT" />
                                <meta itemProp="price" content={String(finalPrice)} />
                                <span className="font-extrabold text-sm text-[#E21B70]">
                                  {formatBdt(finalPrice, lang)}
                                </span>
                                {hasOffer && (
                                  <span className="ml-1.5 text-[11px] text-neutral-400 line-through">
                                    {formatBdt(product.price, lang)}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={!product.inStock || !product.isOpen}
                                onClick={() => handleQuickAddProduct(product)}
                                style={{ backgroundColor: sc.accentColor }}
                                className="px-3 py-1.5 rounded-lg text-white text-xs font-bold inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>
                                  {!product.isOpen
                                    ? lang === 'bn'
                                      ? 'বন্ধ'
                                      : 'Closed'
                                    : lang === 'bn'
                                    ? 'অর্ডার'
                                    : 'Add'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Hero Promotional Banner (Controlled via Admin -> Frontend Control) */}
              {sc.showHero && (
                <section className="rounded-2xl overflow-hidden bg-gradient-to-r from-[#FFF0F6] via-[#FCE6EE] to-[#FAD8E6] border border-[#F5C6D8]/70 grid grid-cols-1 lg:grid-cols-12 items-stretch">
                  <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center space-y-3.5">
                    <div>
                      <span
                        style={{ color: sc.accentColor }}
                        className="inline-block px-2.5 py-1 rounded-md bg-white/80 text-[11px] font-extrabold uppercase tracking-wider"
                      >
                        {lang === 'bn' ? sc.heroBadgeBn : sc.heroBadgeEn}
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold text-[#2E3138] leading-[1.16] tracking-tight text-balance">
                      {lang === 'bn' ? sc.heroTitleBn : sc.heroTitleEn}
                    </h1>
                    <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed max-w-xl">
                      {lang === 'bn' ? sc.heroSubBn : sc.heroSubEn}
                    </p>
                    <p className="text-[11px] sm:text-xs text-neutral-600 font-medium">
                      {lang === 'bn' ? sc.heroTrustBn : sc.heroTrustEn}
                    </p>
                    <div className="pt-1 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (restaurants[0]) openRestaurant(restaurants[0].slug);
                        }}
                        style={{ backgroundColor: sc.accentColor }}
                        className="px-5 py-2.5 rounded-lg hover:opacity-90 text-white text-xs font-bold transition-opacity shadow-xs whitespace-nowrap shrink-0"
                      >
                        {lang === 'bn' ? sc.heroBtnBn : sc.heroBtnEn}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPartnerPortal(true)}
                        style={{ color: sc.accentColor }}
                        className="px-4 py-2.5 rounded-lg border border-[#E21B70]/35 bg-white/85 hover:bg-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                      >
                        {t(lang, 'partnerCta')}
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-5 relative h-48 sm:h-56 lg:h-auto min-h-[220px] bg-[#FAD8E6]">
                    <img
                      src={sc.heroImageUrl}
                      alt="Bangladesh Feast"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="hidden lg:block absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#FCE4EE] via-[#FCE4EE]/55 to-transparent pointer-events-none" />
                  </div>
                </section>
              )}

              {/* Explore by Cuisine — Clean Borderless Foodpanda Tiles */}
              {sc.showCuisineRibbon && (
                <section className="space-y-3.5">
                  <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">{t(lang, 'favCuisines')}</h2>
                  <div className="flex gap-4 overflow-x-auto pt-2 pb-2 no-scrollbar">
                    {CUISINE_CATEGORIES.map((c) => {
                      const active = selectedCuisine === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCuisine(c.id)}
                          className="shrink-0 w-20 sm:w-24 text-center group"
                        >
                          <div
                            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-neutral-100 mx-auto mb-2 transition-all duration-200 ${
                              active
                                ? 'ring-2 ring-[#E21B70] ring-offset-2'
                                : 'group-hover:-translate-y-0.5 group-hover:shadow-md'
                            }`}
                          >
                            <img
                              src={c.img}
                              alt={c.labelEn}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <p
                            className={`text-xs font-bold truncate ${
                              active ? 'text-[#E21B70]' : 'text-[#2E3138]'
                            }`}
                          >
                            {lang === 'bn' ? c.labelBn : c.labelEn}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Daily Deals — Vibrant Split Promo Cards */}
              {sc.showDailyDeals && coupons.length > 0 && (
                <section className="space-y-3.5">
                  <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">
                    {lang === 'bn' ? sc.dailyDealsTitleBn : sc.dailyDealsTitleEn}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {coupons.slice(0, 3).map((c, idx) => {
                      const dealThumbs = [
                        '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg',
                        '/src/assets/images/food_tandoori_kabab_1794831377175.jpg',
                        '/src/assets/images/food_gourmet_burger_1794831375029.jpg',
                      ];
                      return (
                        <div
                          key={c.id}
                          style={{
                            background: `linear-gradient(135deg, ${sc.accentColor}, #1E1B24 140%)`,
                          }}
                          className="rounded-2xl text-white p-4 flex items-center justify-between gap-3 shadow-[0_6px_18px_rgba(226,27,112,0.2)] hover:shadow-[0_10px_24px_rgba(226,27,112,0.3)] transition-shadow"
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="font-extrabold text-base leading-snug line-clamp-2">
                              {localizeCouponTitle(c.code, c.title, lang)}
                            </p>
                            <p className="text-[11px] text-white/85 tabular-nums">
                              {t(lang, 'minOrderLabel')} {formatBdt(c.minOrder, lang)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(c.code);
                                setCopiedCode(c.code);
                                showToast(
                                  lang === 'bn' ? `কুপন ${c.code} কপি হয়েছে` : `Coupon ${c.code} copied`
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-[#E21B70] hover:bg-[#FFF0F6] text-[11px] font-extrabold font-mono-nums transition-colors"
                            >
                              <span>{c.code}</span>
                              <span>·</span>
                              <span>
                                {copiedCode === c.code
                                  ? lang === 'bn'
                                    ? 'কপি হয়েছে'
                                    : 'Copied'
                                  : lang === 'bn'
                                  ? 'কপি'
                                  : 'Copy'}
                              </span>
                            </button>
                          </div>
                          <img
                            src={dealThumbs[idx % dealThumbs.length]}
                            alt={c.code}
                            referrerPolicy="no-referrer"
                            className="w-20 h-20 rounded-full object-cover border-2 border-white/30 shadow-md shrink-0 bg-white/10"
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* All Restaurants Grid — Clean Foodpanda Unboxed Typography Below Photo */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-[#2E3138] tracking-tight">
                    {lang === 'bn' ? sc.restaurantsHeadingBn : sc.restaurantsHeadingEn}{' '}
                    <span className="text-sm font-semibold text-neutral-400 tabular-nums">
                      ({filteredRestaurants.length})
                    </span>
                  </h2>
                </div>

                {loadingStore ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div key={n} className="space-y-2.5">
                        <div className="aspect-[16/10] rounded-xl bg-neutral-100" />
                        <div className="h-4 w-2/3 rounded bg-neutral-100" />
                        <div className="h-3 w-1/2 rounded bg-neutral-100" />
                      </div>
                    ))}
                  </div>
                ) : filteredRestaurants.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
                    <p className="font-bold text-[#2E3138]">{t(lang, 'noResults')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCuisine('All');
                        setSearchQuery('');
                        setOnlyDiscount(false);
                        setOnlyFreeFirst(false);
                        setPriceTierFilter('');
                        setDeliveryFleetFilter('all');
                      }}
                      className="mt-3 px-4 py-2 rounded-lg bg-[#E21B70] text-white text-xs font-semibold"
                    >
                      {t(lang, 'clearFilters')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredRestaurants.map((rest) => {
                      const isFav = favoriteIds.includes(rest.id);
                      return (
                        <article
                          key={rest.id}
                          onClick={() => openRestaurant(rest.slug)}
                          className="group cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-[16/10] rounded-xl bg-neutral-100 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                            <img
                              src={rest.coverUrl}
                              alt={rest.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {/* Single Clean Image Tag */}
                            {!rest.isOpen ? (
                              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-neutral-900/85 text-white text-[11px] font-bold shadow-xs">
                                {lang === 'bn' ? 'বন্ধ রয়েছে' : 'Closed'}
                              </span>
                            ) : rest.discountPct > 0 ? (
                              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-[#E21B70] text-white text-[11px] font-bold shadow-xs">
                                {rest.discountPct}{t(lang, 'discountOff')}
                              </span>
                            ) : rest.isSponsored ? (
                              <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold">
                                {t(lang, 'sponsored')}
                              </span>
                            ) : rest.isNew ? (
                              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold">
                                {t(lang, 'newBadge')}
                              </span>
                            ) : null}

                            {rest.logoUrl && (
                              <img
                                src={rest.logoUrl}
                                alt={`${rest.name} logo`}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover border-2 border-white shadow-md bg-white absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5"
                              />
                            )}

                            <button
                              type="button"
                              aria-label={`Favorite ${rest.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(rest.id);
                              }}
                              className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 shadow-sm flex items-center justify-center text-neutral-700 hover:text-[#E21B70] transition-colors"
                            >
                              <Heart
                                className={`w-4 h-4 ${isFav ? 'text-[#E21B70] fill-[#E21B70]' : ''}`}
                              />
                            </button>
                          </div>

                          <div className="pt-2.5 px-0.5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-bold text-[15px] text-[#2E3138] group-hover:text-[#E21B70] transition-colors truncate">
                                {lang === 'bn' ? rest.nameBn : rest.name}
                              </h3>
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2E3138] shrink-0 tabular-nums">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                {rest.rating}
                                <span className="font-normal text-neutral-500">({rest.reviewCount})</span>
                              </span>
                            </div>

                            <p className="text-xs text-neutral-500 truncate tabular-nums">
                              {formatDurationEstimate(rest.deliveryTimeMin, lang)} · {rest.priceTier} · {rest.cuisine} · {rest.area}
                            </p>

                            <p className="text-xs font-semibold text-[#E21B70] inline-flex items-center gap-1.5 tabular-nums">
                              <Bike className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {fulfillmentTab === 'pickup'
                                  ? lang === 'bn'
                                    ? 'পিকআপ ফ্রি'
                                    : 'Free Pickup'
                                  : rest.deliveryFee <= 35
                                  ? t(lang, 'firstOrderFree')
                                  : formatBdt(rest.deliveryFee, lang)}
                              </span>
                              <span className="text-neutral-400 font-normal">
                                · {rest.deliveryMode === 'third_party' ? 'Pathao' : 'Foodora Rider'}
                              </span>
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Sticky Bottom Cart Bar (<= 15% viewport height) */}
      {totalCartItems > 0 && !cartOpen && view.type !== 'tracking' && (
        <div className="lg:hidden sticky bottom-0 z-30 bg-white border-t border-neutral-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-bold text-[#2E3138]">
              {totalCartItems} {lang === 'bn' ? 'টি আইটেম' : 'items'} · {cartRestaurant?.name}
            </p>
            <p className="text-neutral-500">{lang === 'bn' ? 'চেকআউট করতে ট্যাপ করুন' : 'Tap to view cart'}</p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#E21B70] text-white text-xs font-bold"
          >
            {t(lang, 'cart')} ({totalCartItems})
          </button>
        </div>
      )}

      {/* Foodpanda-Style Cuisine Directory & Marketplace Footer */}
      <footer className="bg-white border-t border-neutral-200 mt-14">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 space-y-8 text-xs text-neutral-600">
          {/* Popular Dhaka Cuisines Directory */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-neutral-100">
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'ঢাকায় বিরিয়ানি ডেলিভারি' : 'Biriyani Delivery in Dhaka'}
              </p>
              <p className="leading-relaxed">
                Sultan&apos;s Dine, Kacchi Bhai, Tehari Ghar, Haji Biriyani, Star Kabab
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'বার্গার ও ফাস্ট ফুড' : 'Burgers & Fast Food'}
              </p>
              <p className="leading-relaxed">
                Chillox, Takeout Banani, Madchef, Burger Xpress, Herfy Gulshan
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'পিজ্জা ও ইতালিয়ান' : 'Pizza & Italian'}
              </p>
              <p className="leading-relaxed">
                Pizza Hut Gulshan 2, Pizzaburg, Bella Italia, Cheez Banani
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] underline decoration-neutral-300 underline-offset-4">
                {lang === 'bn' ? 'বাংলাদেশি ও কাবাব' : 'Bangladeshi & Kabab'}
              </p>
              <p className="leading-relaxed">
                Star Kabab, Mezzan Haile Aaiun, Shodeshi Banani, Ghoroa Hotel
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2">
                <img
                  src="/foodora-icon.svg"
                  alt="Foodora BD Icon"
                  className="w-7 h-7 rounded-lg shrink-0 object-cover"
                />
                <p style={{ color: sc.accentColor }} className="text-base sm:text-lg font-extrabold tracking-tight">
                  {sc.brandPrefix}
                  <span className="text-[#2E3138]">{sc.brandSuffix}</span>
                </p>
              </div>
              <p className="leading-relaxed">
                {lang === 'bn' ? sc.footerDescBn : sc.footerDescEn}
              </p>
              <p className="text-neutral-400">{sc.footerCopyright}</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'সারাদেশে ডেলিভারি জোন' : 'All Bangladesh Delivery Zones'}
              </p>
              <p>Dhaka, Chattogram, Sylhet, Rajshahi, Khulna</p>
              <p>Barishal, Rangpur, Mymensingh &amp; All 64 Districts</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'মার্কেটপ্লেস পোর্টাল' : 'Partner & Job Portals'}
              </p>
              <button
                type="button"
                onClick={() => openPartnerPortal(true)}
                className="block hover:text-[#E21B70]"
              >
                {t(lang, 'partnerCta')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setView({ type: 'rider', onboarding: true });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="block hover:text-[#E21B70]"
              >
                {t(lang, 'riderCta')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrackLookupError(null);
                  setEmailTrackModalOpen(true);
                }}
                className="block hover:text-[#E21B70]"
              >
                {lang === 'bn' ? 'ইমেইলে অর্ডার ট্র্যাক করুন' : 'Track Order by Email'}
              </button>
              <button
                type="button"
                onClick={openAdminOrPromptSignIn}
                className="block hover:text-[#E21B70]"
              >
                {isPrivilegedAdmin
                  ? t(lang, 'adminCta')
                  : lang === 'bn'
                  ? 'অ্যাডমিন লগইন'
                  : 'Admin Sign In'}
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="font-bold text-[#2E3138] text-sm">
                {lang === 'bn' ? 'যোগাযোগ ও লাইভ সাপোর্ট' : 'Contact & Live Support'}
              </p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('foodora:open-live-chat'))}
                className="flex items-center gap-1.5 font-semibold text-[#E21B70] hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'bn' ? 'Website Live Chat (AI + হেল্প)' : 'Website Live Chat (AI + Help)'}</span>
              </button>
              <a
                href={buildMessengerUrl(sc.messengerUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-semibold text-neutral-700 hover:text-[#E21B70] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#0084FF]" />
                <span>{lang === 'bn' ? 'Facebook Messenger সাপোর্ট' : 'Facebook Messenger Support'}</span>
              </a>
              <a
                href={buildWhatsAppSupportUrl(
                  sc.whatsappNumber,
                  lang === 'bn'
                    ? 'আসসালামু আলাইকুম, Foodora BD WhatsApp সাপোর্টে সাহায্য প্রয়োজন।'
                    : 'Hello Foodora BD Support, I need assistance.'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-semibold text-neutral-700 hover:text-[#E21B70] transition-colors"
              >
                <Phone className="w-3.5 h-3.5 shrink-0 text-[#16A34A]" />
                <span>WhatsApp: {sc.whatsappNumber || '+8801712345678'}</span>
              </a>
              <p className="text-[11px] text-neutral-500 pt-1">
                bKash · Nagad · SSLCommerz · COD · Foodora &amp; Pathao
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Cart & Checkout Drawer */}
      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        restaurant={cartRestaurant}
        allRestaurants={restaurants}
        lang={lang}
        mapsApiKey={mapsApiKey}
        selectedArea={selectedArea}
        customerName={user?.fullName || ''}
        customerEmail={user?.isSandbox ? '' : user?.email || ''}
        paymentGateways={publicGateways}
        deliveryFinancialConfig={deliveryFinancialConfig}
        dhakaZoneCoverage={dhakaZoneCoverage}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onOrderCreated={(orderId, trackingToken, meta) => {
          setCartOpen(false);
          setLastTrackedOrder({
            orderId,
            trackingToken,
            orderNumber: meta?.orderNumber,
            restaurantName: meta?.restaurantName,
            estimatedMinutes: meta?.estimatedMinutes,
            isSandbox: Boolean(user?.isSandbox),
          });
          void playOrderAlertChime('status_update', { dedupKey: `placed_${orderId}` });
          emitLocalRealtimeSignal('order:created', {
            orderId,
            orderNumber: meta?.orderNumber,
            restaurantName: meta?.restaurantName,
            customerUid: user?.uid || '',
          });
          setView({ type: 'tracking', orderId, token: trackingToken });
          void loadUserSignals();
          void refreshPublicBanner();
        }}
      />

      {/* Single-Restaurant Cart Conflict Modal */}
      {pendingSwitchItem && (
        <div
          onClick={() => setPendingSwitchItem(null)}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-bold text-base text-[#2E3138]">
              {lang === 'bn' ? 'ভিন্ন রেস্টুরেন্টের খাবার যোগ করবেন?' : 'Add item from another restaurant?'}
            </h3>
            <p className="text-xs text-neutral-600">
              {lang === 'bn'
                ? `আপনার কার্টে ইতিমধ্যে ${cartRestaurant?.name || 'পূর্বের রেস্টুরেন্ট'}-এর খাবার রয়েছে। আপনি কি এটি আগের অর্ডারের সাথে যোগ করতে চান নাকি নতুন কার্ট শুরু করবেন?`
                : `Your cart contains items from ${cartRestaurant?.name || 'another restaurant'}. Do you want to add this with your existing order or start a new cart?`}
            </p>
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 whitespace-pre-line">
                {lang === 'bn'
                  ? '• Keep Existing: পূর্বের খাবার বহাল রেখে নতুন খাবারটিও কার্টে যোগ হবে (আগের অর্ডারের সাথে যুক্ত হবে)।\n• Start New Cart: পূর্বের কার্ট খালি করে শুধুমাত্র নতুন রেস্টুরেন্টের খাবার যোগ হবে।'
                  : '• Keep Existing: Keeps existing items & adds this item too (combined orders).\n• Start New Cart: Clears existing cart & adds only this new item.'}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingSwitchItem(null)}
                  className="px-3 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleKeepExistingAndAdd}
                  className="px-3.5 py-2 rounded-xl border border-[#E21B70] bg-[#FFF0F6] text-xs font-semibold text-[#E21B70] hover:bg-[#FFE4EF]"
                >
                  {lang === 'bn' ? 'Keep Existing (আগেরটির সাথে যোগ করুন)' : 'Keep Existing & Add'}
                </button>
                <button
                  type="button"
                  onClick={confirmSwitchRestaurantCart}
                  className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
                >
                  {lang === 'bn' ? 'নতুন কার্ট (Start New)' : 'Start New Cart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {locationModalOpen && (
        <div
          data-testid="location-modal-backdrop"
          onClick={() => setLocationModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4"
        >
          <div
            data-testid="location-modal-panel"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-neutral-100"
          >
            {/* Clean Modal Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base text-[#2E3138] truncate">
                    {t(lang, 'selectAddress')}
                  </h3>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {lang === 'bn'
                      ? 'ঠিকানা সার্চ করুন অথবা ম্যাপে পিন বসিয়ে এলাকা নির্ধারণ করুন'
                      : 'Search your street or drop a pin anywhere in Bangladesh'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close address map"
                onClick={() => setLocationModalOpen(false)}
                className="p-2 rounded-xl text-neutral-500 hover:text-[#2E3138] hover:bg-neutral-100 shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Unified Autocomplete Search Bar */}
            <AddressSearchInput
              lang={lang}
              autoFocus
              showGpsButton
              locatingGps={locatingGps}
              onUseGps={handleUseCurrentGps}
              currentCoords={{ lat: selectedArea.lat, lng: selectedArea.lng }}
              onSelectAddress={(picked) => {
                setSelectedArea({
                  name: picked.shortName,
                  nameBn: picked.shortNameBn || picked.shortName,
                  lat: picked.lat,
                  lng: picked.lng,
                  displayName: picked.displayName,
                });
                setLocationModalTab('map');
                showToast(
                  lang === 'bn'
                    ? `ডেলিভারি ঠিকানা নির্বাচন হয়েছে: ${picked.shortNameBn || picked.shortName}`
                    : `Delivery address set: ${picked.shortName}`
                );
              }}
            />

            {/* Clean 2-Tab Switcher: Map & Pin vs Browse Zones & Cities */}
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
              <div className="inline-flex items-center rounded-xl bg-neutral-100 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setLocationModalTab('map')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    locationModalTab === 'map'
                      ? 'bg-white text-[#E21B70] shadow-xs'
                      : 'text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  {lang === 'bn' ? 'ম্যাপ ও পিন' : 'Map & Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => setLocationModalTab('zones')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    locationModalTab === 'zones'
                      ? 'bg-white text-[#E21B70] shadow-xs'
                      : 'text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  {lang === 'bn' ? 'জোন ও শহর তালিকা' : 'Zones & Cities'}
                </button>
              </div>

              {locationModalTab === 'zones' && (
                <select
                  aria-label={lang === 'bn' ? 'জোন ফিল্টার' : 'Filter by delivery zone'}
                  value={locationZoneFilter}
                  onChange={(e) => setLocationZoneFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#2E3138] focus:outline-none focus:border-[#E21B70] max-w-[200px]"
                >
                  <option value="all">{lang === 'bn' ? 'সব জোন ও শহর' : 'All Zones & Cities'}</option>
                  {DHAKA_DELIVERY_ZONES.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.code} — {lang === 'bn' ? z.nameBn : z.name}
                    </option>
                  ))}
                  <option value="NATIONWIDE">{lang === 'bn' ? 'অন্যান্য জেলা (BD Cities)' : 'Other BD Districts'}</option>
                </select>
              )}
            </div>

            {locationModalTab === 'map' ? (
              <DhakaMapPicker
                mapsApiKey={mapsApiKey}
                lang={lang}
                center={{ lat: selectedArea.lat, lng: selectedArea.lng }}
                markerLabel={lang === 'bn' ? selectedArea.nameBn : selectedArea.name}
                originPoint={
                  locationRouteOrigin
                    ? {
                        lat: locationRouteOrigin.lat,
                        lng: locationRouteOrigin.lng,
                        label:
                          lang === 'bn'
                            ? locationRouteOrigin.nameBn || locationRouteOrigin.name
                            : locationRouteOrigin.name,
                      }
                    : null
                }
                onSwapInteractiveRoute={
                  locationRouteOrigin
                    ? () => {
                        const prevDest = { ...selectedArea };
                        const prevStart = { ...locationRouteOrigin };
                        setSelectedArea({
                          name: prevStart.name,
                          nameBn: prevStart.nameBn,
                          lat: prevStart.lat,
                          lng: prevStart.lng,
                        });
                        setLocationRouteOrigin({
                          name: prevDest.name,
                          nameBn: prevDest.nameBn,
                          lat: prevDest.lat,
                          lng: prevDest.lng,
                        });
                      }
                    : undefined
                }
                onClearInteractiveRoute={() =>
                  setLocationRouteOrigin({
                    name: selectedArea.name,
                    nameBn: selectedArea.nameBn,
                    lat: selectedArea.lat,
                    lng: selectedArea.lng,
                  })
                }
                pinType="user"
                userName={user?.fullName}
                interactive
                enableInteractivePointRoute
                showTraffic
                showDirectionsSummary
                heightClass="h-[290px]"
                onSelectLocation={(c) => {
                  const exactPreset = BANGLADESH_AREAS.find(
                    (a) => Math.abs(a.lat - c.lat) < 0.004 && Math.abs(a.lng - c.lng) < 0.004
                  );
                  const nextName =
                    exactPreset?.name ||
                    (c.areaName && c.areaName.trim()) ||
                    `Pinned (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`;
                  const nextNameBn =
                    exactPreset?.nameBn ||
                    (c.areaName && c.areaName.trim()) ||
                    `পিন করা স্থান (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`;
                  setSelectedArea({
                    name: nextName,
                    nameBn: nextNameBn,
                    lat: c.lat,
                    lng: c.lng,
                    displayName: c.displayName,
                  });
                }}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[290px] overflow-y-auto pr-1">
                {BANGLADESH_AREAS.filter((a) => {
                  if (locationZoneFilter === 'all') return true;
                  if (locationZoneFilter === 'NATIONWIDE') return !a.zoneCode;
                  return a.zoneCode === locationZoneFilter;
                }).map((a) => {
                  const isExactPreset =
                    Math.abs(a.lat - selectedArea.lat) < 0.005 &&
                    Math.abs(a.lng - selectedArea.lng) < 0.005;
                  return (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => {
                        setSelectedArea({
                          ...a,
                          displayName: `${a.name}, ${a.division}, Bangladesh`,
                        });
                        setLocationModalTab('map');
                      }}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-colors ${
                        isExactPreset
                          ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                          : 'border-neutral-200 text-neutral-700 hover:border-[#E21B70]/40 hover:bg-[#FFF9FB]'
                      }`}
                    >
                      <span className="block truncate">{lang === 'bn' ? a.nameBn : a.name}</span>
                      <span className="block text-[10px] text-neutral-400 font-normal truncate">
                        {a.zoneCode ? `${a.zoneCode} · ${a.division}` : a.division}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Location Summary + Confirm Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
              <div
                data-testid="selected-map-location-summary"
                className="min-w-0 flex items-center gap-2.5 text-xs"
              >
                <span className="w-8 h-8 rounded-xl bg-[#FFF0F6] border border-[#E21B70]/20 text-[#E21B70] flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[#2E3138] truncate">
                    {lang === 'bn' ? selectedArea.nameBn : selectedArea.name}
                  </p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {selectedArea.displayName || `${selectedArea.lat.toFixed(4)}, ${selectedArea.lng.toFixed(4)}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  saveRecentAddress({
                    shortName: selectedArea.name,
                    shortNameBn: selectedArea.nameBn,
                    displayName: selectedArea.displayName || `${selectedArea.name}, Bangladesh`,
                    lat: selectedArea.lat,
                    lng: selectedArea.lng,
                  });
                  setLocationModalOpen(false);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors shadow-xs"
              >
                {lang === 'bn' ? 'লোকেশন নিশ্চিত করুন' : 'Confirm Delivery Zone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth & Workspace Role Switcher Modal */}
      {authModalOpen && (
        <div
          onClick={() => {
            clearError();
            clearGoogleRedirectUrl();
            setPendingAdminRedirect(false);
            setShowAdminPinBox(false);
            setAdminPinInput('');
            setAuthModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {lang === 'bn' ? 'অ্যাকাউন্ট ও রোল পোর্টাল' : 'Account & Role Workspaces'}
              </h3>
              <button
                type="button"
                aria-label="Close auth modal"
                onClick={() => {
                  clearError();
                  clearGoogleRedirectUrl();
                  setPendingAdminRedirect(false);
                  setShowAdminPinBox(false);
                  setAdminPinInput('');
                  setAuthModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isPrivilegedAdmin && (showAdminPinBox || pendingAdminRedirect) && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!adminPinInput.trim()) return;
                  clearError();
                  setAuthSubmitting(true);
                  try {
                    await unlockAdminWithPin(
                      adminPinInput.trim(),
                      adminPinEmail.trim() || 'raqkibrony@gmail.com'
                    );
                    setAdminPinInput('');
                    setShowAdminPinBox(false);
                    setPendingAdminRedirect(false);
                    setAuthModalOpen(false);
                    setView({ type: 'admin' });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    showToast(
                      lang === 'bn'
                        ? 'সুপার অ্যাডমিন প্যানেল আনলক হয়েছে'
                        : 'Super Admin Panel unlocked'
                    );
                  } catch {
                    // error banner shown in AuthContext
                  } finally {
                    setAuthSubmitting(false);
                  }
                }}
                className="p-3.5 rounded-xl bg-[#FFF0F6] border border-[#E21B70]/30 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#2E3138]">
                    <KeyRound className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? 'অ্যাডমিন প্যানেল PIN আনলক'
                        : 'Admin Panel PIN Unlock'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminPinBox(false);
                      setPendingAdminRedirect(false);
                    }}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-[#2E3138]"
                  >
                    {lang === 'bn' ? 'বন্ধ করুন' : 'Hide'}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  {lang === 'bn'
                    ? 'অ্যাডমিন ইমেইল ও PIN দিয়ে সরাসরি সুপার অ্যাডমিন প্যানেল আনলক করুন।'
                    : 'Enter your Admin Email & PIN to unlock the Super Admin Panel directly.'}
                </p>
                <div className="space-y-2">
                  <input
                    type="email"
                    required
                    value={adminPinEmail}
                    onChange={(e) => setAdminPinEmail(e.target.value)}
                    placeholder="raqkibrony@gmail.com"
                    aria-label="Admin Email"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      minLength={4}
                      maxLength={16}
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      placeholder={lang === 'bn' ? 'অ্যাডমিন PIN লিখুন' : 'Enter Admin PIN'}
                      aria-label="Admin PIN"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] tracking-widest focus:outline-none focus:border-[#E21B70]"
                    />
                    <button
                      type="submit"
                      disabled={authSubmitting || adminPinInput.trim().length < 4}
                      className="px-4 py-2 rounded-lg bg-[#2E3138] hover:bg-black disabled:opacity-50 text-white text-xs font-bold shrink-0 transition-colors"
                    >
                      {authSubmitting
                        ? '...'
                        : lang === 'bn'
                        ? 'আনলক'
                        : 'Unlock'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            {user && (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-[#2E3138] truncate">{user.fullName}</p>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          user.isSandbox
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {user.isSandbox ? 'Sandbox' : 'Account'}
                      </span>
                    </div>
                    <p className="text-neutral-500 truncate mt-0.5">
                      {user.email} · <span className="uppercase font-semibold">{user.role}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      setFavoriteIds([]);
                      setNotifications([]);
                      setLastTrackedOrder(null);
                      showToast(lang === 'bn' ? 'সাইন আউট সম্পন্ন হয়েছে' : 'Signed out');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-300 hover:border-red-400 hover:text-red-600 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'সাইন আউট' : 'Sign Out'}</span>
                  </button>
                </div>

                {/* User Profile Sound Preference Setting */}
                <div className="p-3 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        orderSoundEnabled
                          ? 'bg-[#FFF0F6] text-[#E21B70]'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {orderSoundEnabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#2E3138]">
                        {lang === 'bn' ? 'অর্ডার অ্যালার্ট সাউন্ড' : 'Order Alert Sound'}
                      </p>
                      <p className="text-[11px] text-neutral-500 leading-snug">
                        {orderSoundEnabled
                          ? lang === 'bn'
                            ? 'নতুন অর্ডার এলে নোটিফিকেশন সাউন্ড বাজবে'
                            : 'Chime plays when new orders arrive'
                          : lang === 'bn'
                          ? 'অর্ডার নোটিফিকেশন সাউন্ড মিউট করা আছে'
                          : 'Order notification sound is muted'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        playOrderAlertChime('new_order', { force: true });
                        showToast(
                          lang === 'bn'
                            ? 'অর্ডার নোটিফিকেশন সাউন্ড প্রিভিউ বাজানো হয়েছে'
                            : 'Played new order chime preview'
                        );
                      }}
                      aria-label={
                        lang === 'bn' ? 'অর্ডার সাউন্ড টেস্ট করুন' : 'Test order alert sound'
                      }
                      className="px-2.5 py-1 rounded-lg border border-neutral-200 hover:border-[#E21B70] hover:text-[#E21B70] text-[11px] font-semibold text-neutral-700 transition-colors"
                    >
                      {lang === 'bn' ? 'টেস্ট' : 'Test'}
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={orderSoundEnabled}
                      data-testid="profile-order-sound-toggle"
                      aria-label={
                        lang === 'bn'
                          ? 'অর্ডার অ্যালার্ট সাউন্ড চালু বা বন্ধ করুন'
                          : 'Toggle order alert sound'
                      }
                      onClick={() => {
                        const next = !orderSoundEnabled;
                        setOrderSoundEnabled(next);
                        if (next) {
                          playOrderAlertChime('new_order', { force: true });
                        }
                        showToast(
                          next
                            ? lang === 'bn'
                              ? 'অর্ডার অ্যালার্ট সাউন্ড চালু করা হয়েছে'
                              : 'Order alert sound enabled'
                            : lang === 'bn'
                            ? 'অর্ডার অ্যালার্ট সাউন্ড বন্ধ করা হয়েছে'
                            : 'Order alert sound muted'
                        );
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#E21B70]/40 ${
                        orderSoundEnabled ? 'bg-[#E21B70]' : 'bg-neutral-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                          orderSoundEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isPrivilegedAdmin && (
              <button
                type="button"
                onClick={() => {
                  setPendingAdminRedirect(false);
                  setAuthModalOpen(false);
                  setView({ type: 'admin' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2E3138] hover:bg-black text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Shield className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? 'সুপার অ্যাডমিন ও ফ্রন্টএন্ড কন্ট্রোল প্যানেল খুলুন'
                    : 'Open Super Admin & Frontend Control'}
                </span>
              </button>
            )}

            {/* Prominent Sign in with Google */}
            <button
              type="button"
              disabled={authSubmitting}
              onClick={async () => {
                setAuthSubmitting(true);
                try {
                  const ok = await signInWithGoogle();
                  if (ok) {
                    setAuthModalOpen(false);
                    showToast(lang === 'bn' ? 'Google লগইন সম্পন্ন' : 'Signed in with Google');
                  }
                } finally {
                  setAuthSubmitting(false);
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-white border border-neutral-300 hover:border-[#E21B70] hover:bg-[#FFF9FB] disabled:opacity-60 text-xs font-bold text-[#2E3138] inline-flex items-center justify-center gap-2.5 shadow-xs transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {lang === 'bn'
                  ? 'Google দিয়ে সাইন আপ / সাইন ইন করুন'
                  : 'Sign up / Sign in with Google'}
              </span>
            </button>
            <p className="text-[11px] text-center text-neutral-500">
              {lang === 'bn'
                ? 'সরাসরি অ্যাকাউন্ট তৈরি করতে নিচের "নতুন অ্যাকাউন্ট" ট্যাবটি ব্যবহার করুন'
                : 'To create an account instantly, click "Create Account" below'}
            </p>

            {googleRedirectUrl && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <p className="leading-relaxed">
                  {lang === 'bn'
                    ? 'প্রিভিউ ফ্রেমের ভেতরে Google লগইন ব্লক হতে পারে। নিচের বাটনে ক্লিক করে নতুন ট্যাবে Supabase Google লগইন সম্পন্ন করুন:'
                    : 'Preview frames restrict Google login directly inside an iframe. Click below to complete Supabase Google Sign-In in a browser tab:'}
                </p>
                <a
                  href={googleRedirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full py-2 px-3 rounded-lg bg-[#2E3138] hover:bg-black text-white font-bold transition-colors"
                >
                  {lang === 'bn'
                    ? 'নতুন ট্যাবে Google লগইন খুলুন'
                    : 'Open Google Sign-In in New Tab'}
                </a>
              </div>
            )}

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-neutral-200" />
              <span className="shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {lang === 'bn' ? 'অথবা ইমেইল ও পাসওয়ার্ড দিয়ে' : 'or continue with email & password'}
              </span>
              <div className="flex-grow border-t border-neutral-200" />
            </div>

            {/* Email & Password Sign-In / Create Account / Forgot Password */}
            <div className="rounded-xl border border-neutral-200 p-4 space-y-3 bg-[#FAFAFB]">
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-neutral-200/70">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setResetInfo(null);
                    setResetStep('request');
                    setAuthMode('login');
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
                    authMode === 'login'
                      ? 'bg-white text-[#2E3138] shadow-xs'
                      : 'text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  {lang === 'bn' ? 'সাইন ইন' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setResetInfo(null);
                    setResetStep('request');
                    setAuthMode('register');
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
                    authMode === 'register'
                      ? 'bg-white text-[#2E3138] shadow-xs'
                      : 'text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  {lang === 'bn' ? 'নতুন অ্যাকাউন্ট' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setResetInfo(null);
                    setResetStep('request');
                    setResetCode('');
                    setResetNewPassword('');
                    setResetConfirmPassword('');
                    setAuthMode('forgot');
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
                    authMode === 'forgot'
                      ? 'bg-white text-[#2E3138] shadow-xs'
                      : 'text-neutral-600 hover:text-[#2E3138]'
                  }`}
                >
                  {lang === 'bn' ? 'পাসওয়ার্ড রিসেট' : 'Forgot Password'}
                </button>
              </div>

              {authMode === 'forgot' ? (
                resetStep === 'request' ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      clearError();
                      setResetInfo(null);
                      setAuthSubmitting(true);
                      try {
                        const res = await requestPasswordReset(authEmail);
                        setResetInfo({
                          message: res.message,
                          previewCode: res.previewCode,
                          isAdminAccount: res.isAdminAccount,
                        });
                        if (res.previewCode) {
                          setResetCode(res.previewCode);
                        }
                        setResetStep('confirm');
                      } catch {
                        // error shown via AuthContext
                      } finally {
                        setAuthSubmitting(false);
                      }
                    }}
                    className="space-y-2.5"
                  >
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      {lang === 'bn'
                        ? 'আপনার রেজিস্টার্ড ইমেইল লিখুন। ভেরিফিকেশন কোড ব্যবহার করে নতুন পাসওয়ার্ড সেট করতে পারবেন।'
                        : 'Enter your registered email address to receive a password reset verification code.'}
                    </p>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {lang === 'bn' ? 'ইমেইল' : 'Email Address'}
                      </span>
                      <div className="mt-1 relative">
                        <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                        />
                      </div>
                    </label>
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] disabled:opacity-60 text-white text-xs font-bold transition-colors"
                    >
                      {authSubmitting
                        ? lang === 'bn'
                          ? 'অপেক্ষা করুন...'
                          : 'Sending...'
                        : lang === 'bn'
                        ? 'রিসেট কোড পাঠান'
                        : 'Send Reset Code'}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      clearError();
                      if (resetNewPassword !== resetConfirmPassword) {
                        setResetInfo({
                          ...(resetInfo || { message: '' }),
                          message:
                            lang === 'bn'
                              ? 'দুটি পাসওয়ার্ড মিলছে না।'
                              : 'Passwords do not match. Please re-enter.',
                        });
                        return;
                      }
                      setAuthSubmitting(true);
                      try {
                        const signedUser = await confirmPasswordReset(
                          authEmail,
                          resetCode,
                          resetNewPassword
                        );
                        setResetCode('');
                        setResetNewPassword('');
                        setResetConfirmPassword('');
                        setResetInfo(null);
                        setResetStep('request');
                        setAuthMode('login');
                        setAuthModalOpen(false);
                        if (signedUser.role === 'super_admin' || signedUser.role === 'admin') {
                          setView({ type: 'admin' });
                        } else if (signedUser.role === 'restaurant_owner') {
                          setView({ type: 'vendor' });
                        } else if (signedUser.role === 'rider') {
                          setView({ type: 'rider' });
                        }
                        showToast(
                          lang === 'bn'
                            ? 'পাসওয়ার্ড পরিবর্তন ও লগইন সম্পন্ন হয়েছে'
                            : 'Password updated & signed in'
                        );
                      } catch {
                        // error shown via AuthContext
                      } finally {
                        setAuthSubmitting(false);
                      }
                    }}
                    className="space-y-2.5"
                  >
                    {resetInfo && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 space-y-1">
                        <p>{resetInfo.message}</p>
                        {resetInfo.previewCode && (
                          <p className="font-bold">
                            {lang === 'bn' ? 'রিসেট কোড:' : 'Reset Code:'}{' '}
                            <span className="font-mono tracking-widest text-sm text-[#E21B70]">
                              {resetInfo.previewCode}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    <label className="block">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {resetInfo?.isAdminAccount
                          ? lang === 'bn'
                            ? 'অ্যাডমিন PIN লিখুন'
                            : 'Admin PIN (Verification)'
                          : lang === 'bn'
                          ? '৬ সংখ্যার রিসেট কোড'
                          : '6-Digit Reset Code'}
                      </span>
                      <input
                        type={resetInfo?.isAdminAccount ? 'password' : 'text'}
                        inputMode="numeric"
                        required
                        minLength={4}
                        maxLength={16}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder={resetInfo?.isAdminAccount ? 'Enter Admin PIN' : '6-digit code'}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] tracking-widest focus:outline-none focus:border-[#E21B70]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {lang === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)' : 'New Password (min 6 chars)'}
                      </span>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="••••••"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {lang === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                      </span>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearError();
                          setResetStep('request');
                        }}
                        className="px-3 py-2 rounded-xl border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                      >
                        {lang === 'bn' ? 'পিছনে' : 'Back'}
                      </button>
                      <button
                        type="submit"
                        disabled={authSubmitting}
                        className="flex-1 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] disabled:opacity-60 text-white text-xs font-bold transition-colors"
                      >
                        {authSubmitting
                          ? lang === 'bn'
                            ? 'আপডেট হচ্ছে...'
                            : 'Updating...'
                          : lang === 'bn'
                          ? 'পাসওয়ার্ড আপডেট করুন'
                          : 'Reset Password & Sign In'}
                      </button>
                    </div>
                  </form>
                )
              ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  clearError();
                  setAuthSubmitting(true);
                  try {
                    const signedUser =
                      authMode === 'register'
                        ? await registerWithEmail(authFullName, authEmail, authPassword, authRole)
                        : await signInWithEmail(authEmail, authPassword);
                    setAuthPassword('');
                    setAuthModalOpen(false);
                    if (signedUser.role === 'super_admin' || signedUser.role === 'admin') {
                      setView({ type: 'admin' });
                    } else if (signedUser.role === 'restaurant_owner') {
                      setView({ type: 'vendor' });
                    } else if (signedUser.role === 'rider') {
                      setView({ type: 'rider' });
                    }
                    showToast(
                      lang === 'bn'
                        ? `স্বাগতম, ${signedUser.fullName}`
                        : `Signed in as ${signedUser.fullName}`
                    );
                  } catch {
                    // error banner is populated in AuthContext
                  } finally {
                    setAuthSubmitting(false);
                  }
                }}
                className="space-y-2.5"
              >
                {authMode === 'register' && (
                  <>
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-neutral-600 block">
                        {lang === 'bn' ? 'অ্যাকাউন্টের ধরন' : 'Account Type'}
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          {
                            id: 'customer' as const,
                            label: lang === 'bn' ? 'কাস্টমার' : 'Customer',
                          },
                          {
                            id: 'restaurant_owner' as const,
                            label: lang === 'bn' ? 'রেস্টুরেন্ট' : 'Restaurant',
                          },
                          {
                            id: 'rider' as const,
                            label: lang === 'bn' ? 'রাইডার' : 'Rider',
                          },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAuthRole(opt.id)}
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-colors ${
                              authRole === opt.id
                                ? 'bg-[#FFF0F6] border-[#E21B70] text-[#E21B70]'
                                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {lang === 'bn' ? 'পুরো নাম' : 'Full Name'}
                      </span>
                      <div className="mt-1 relative">
                        <User className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          minLength={2}
                          value={authFullName}
                          onChange={(e) => setAuthFullName(e.target.value)}
                          placeholder={lang === 'bn' ? 'আপনার নাম' : 'e.g. Rakib Hasan'}
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                        />
                      </div>
                    </label>
                  </>
                )}

                <label className="block">
                  <span className="text-[11px] font-semibold text-neutral-600">
                    {lang === 'bn' ? 'ইমেইল' : 'Email Address'}
                  </span>
                  <div className="mt-1 relative">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-neutral-600">
                      {lang === 'bn' ? 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)' : 'Password (min 6 characters)'}
                    </span>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          clearError();
                          setResetInfo(null);
                          setResetStep('request');
                          setAuthMode('forgot');
                        }}
                        className="text-[11px] font-bold text-[#E21B70] hover:underline"
                      >
                        {lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot Password?'}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 relative">
                    <Lock className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs text-[#2E3138] focus:outline-none focus:border-[#E21B70]"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {authMode === 'register' ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>
                    {authSubmitting
                      ? lang === 'bn'
                        ? 'অপেক্ষা করুন...'
                        : 'Please wait...'
                      : authMode === 'register'
                      ? lang === 'bn'
                        ? 'অ্যাকাউন্ট তৈরি করুন'
                        : 'Create Account'
                      : lang === 'bn'
                      ? 'সাইন ইন করুন'
                      : 'Sign In with Email'}
                  </span>
                </button>
              </form>
              )}
            </div>

            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <p className="text-[11px] font-bold uppercase text-neutral-500">
                {lang === 'bn' ? 'টেস্ট / ডেমো অ্যাকাউন্ট (ঐচ্ছিক)' : 'Optional Demo Sandbox Accounts'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('customer', { type: 'customer' })}
                  className="p-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <User className="w-4 h-4 text-[#E21B70] mb-1" />
                  Demo Customer
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('restaurant_owner', { type: 'vendor' })}
                  className="p-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <Store className="w-4 h-4 text-[#E21B70] mb-1" />
                  Demo Vendor
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspace('rider', { type: 'rider' })}
                  className="p-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-left font-semibold"
                >
                  <Bike className="w-4 h-4 text-[#E21B70] mb-1" />
                  Demo Rider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPrivilegedAdmin) {
                      setAuthModalOpen(false);
                      setView({ type: 'admin' });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      clearError();
                      setPendingAdminRedirect(true);
                      setShowAdminPinBox(true);
                    }
                  }}
                  className="p-2.5 rounded-xl border border-[#E21B70]/40 bg-[#FFF9FB] hover:border-[#E21B70] text-left font-semibold text-[#2E3138]"
                >
                  <KeyRound className="w-4 h-4 text-[#E21B70] mb-1" />
                  Admin PIN
                </button>
              </div>
              <p className="text-[11px] text-neutral-400">
                {lang === 'bn'
                  ? 'অ্যাডমিন প্যানেল খুলতে Admin PIN বা অনুমোদিত অ্যাডমিন অ্যাকাউন্ট ব্যবহার করুন।'
                  : 'Admin & Super Admin control requires Admin PIN or verified Admin sign-in.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Email Recovery Set New Password Modal */}
      {passwordRecoveryPending && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSupaRecoverySaving(true);
              try {
                await completeSupabasePasswordRecovery(supaRecoveryPassword);
                setSupaRecoveryPassword('');
                showToast(
                  lang === 'bn' ? 'নতুন পাসওয়ার্ড সেট হয়েছে' : 'New password saved'
                );
              } finally {
                setSupaRecoverySaving(false);
              }
            }}
            className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#2E3138]">
                {lang === 'bn' ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Set New Password'}
              </h3>
              <button
                type="button"
                onClick={dismissPasswordRecovery}
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs">
              <span className="font-semibold text-neutral-700">New Password (min 6 characters)</span>
              <input
                type="password"
                required
                minLength={6}
                value={supaRecoveryPassword}
                onChange={(e) => setSupaRecoveryPassword(e.target.value)}
                placeholder="••••••"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </label>
            <button
              type="submit"
              disabled={supaRecoverySaving}
              className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold disabled:opacity-50"
            >
              {supaRecoverySaving ? 'Saving...' : 'Save New Password'}
            </button>
          </form>
        </div>
      )}

      {/* Email Order & Rider Tracking Lookup Modal */}
      {emailTrackModalOpen && (
        <div
          onClick={() => setEmailTrackModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setTrackLookupLoading(true);
              setTrackLookupError(null);
              try {
                const params = new URLSearchParams({
                  email: trackEmailInput.trim(),
                });
                if (trackOrderNumInput.trim()) {
                  params.set('orderNumber', trackOrderNumInput.trim());
                }
                const res = await apiFetch<{
                  order: {
                    id: number;
                    orderNumber: string;
                    trackingToken?: string;
                    restaurantName?: string;
                    estimatedMinutes?: number;
                  };
                }>(`/api/orders/track-by-email?${params.toString()}`);
                setLastTrackedOrder({
                  orderId: res.order.id,
                  trackingToken: res.order.trackingToken,
                  orderNumber: res.order.orderNumber,
                  restaurantName: res.order.restaurantName,
                  estimatedMinutes: res.order.estimatedMinutes,
                });
                setEmailTrackModalOpen(false);
                setView({
                  type: 'tracking',
                  orderId: res.order.id,
                  token: res.order.trackingToken,
                });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } catch (err: unknown) {
                setTrackLookupError(
                  err instanceof Error
                    ? err.message
                    : lang === 'bn'
                    ? 'এই ইমেইলে কোনো অর্ডার পাওয়া যায়নি'
                    : 'No matching order found for this email'
                );
              } finally {
                setTrackLookupLoading(false);
              }
            }}
            className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center shrink-0">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#2E3138]">
                    {lang === 'bn' ? 'রাইডার ও অর্ডার ট্র্যাক করুন' : 'Track Rider & Order Live'}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    {lang === 'bn'
                      ? 'রাইডার এখন কোথায় আছে ও কতক্ষণ লাগবে দেখতে ইমেইল দিন'
                      : 'See live rider location & delivery ETA using checkout email'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailTrackModalOpen(false)}
                aria-label="Close Track Order modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {lastTrackedOrder && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-900 truncate">
                    {lastTrackedOrder.orderNumber || `Order #${lastTrackedOrder.orderId}`}
                  </p>
                  <p className="text-[11px] text-emerald-700 truncate">
                    {lastTrackedOrder.restaurantName || 'Active Foodora Order'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmailTrackModalOpen(false);
                    setView({
                      type: 'tracking',
                      orderId: lastTrackedOrder.orderId,
                      token: lastTrackedOrder.trackingToken,
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
                >
                  {lang === 'bn' ? 'লাইভ দেখুন' : 'Track Live'}
                </button>
              </div>
            )}

            {trackLookupError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {trackLookupError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="font-semibold text-neutral-700">
                  {lang === 'bn' ? 'গ্রাহকের ইমেইল *' : 'Customer Email *'}
                </span>
                <input
                  type="email"
                  required
                  value={trackEmailInput}
                  onChange={(e) => setTrackEmailInput(e.target.value)}
                  placeholder="customer@example.com"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E21B70]"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-neutral-700">
                  {lang === 'bn' ? 'অর্ডার নম্বর (ঐচ্ছিক)' : 'Order Number (Optional)'}
                </span>
                <input
                  type="text"
                  value={trackOrderNumInput}
                  onChange={(e) => setTrackOrderNumInput(e.target.value)}
                  placeholder="e.g. FD-2026-1001"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E21B70]"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={trackLookupLoading}
              className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold disabled:opacity-50"
            >
              {trackLookupLoading
                ? lang === 'bn'
                  ? 'খুঁজছি...'
                  : 'Looking up order...'
                : lang === 'bn'
                ? 'লাইভ অর্ডার ট্র্যাক করুন'
                : 'Find & Track Order Live'}
            </button>
          </form>
        </div>
      )}

      {/* Bilingual AI Help & Live Support (Website Live Chat + Messenger + WhatsApp) */}
      <AiHelpWidget
        uiLang={lang}
        area={selectedArea.name}
        viewType={view.type}
        activeOrderNumber={lastTrackedOrder?.orderNumber}
        accentColor={sc.accentColor}
        messengerUrl={sc.messengerUrl}
        whatsappNumber={sc.whatsappNumber}
        supportEmail={sc.supportEmail}
      />

      {/* Audio Autoplay Unlock Prompt (only appears if browser blocked alert sound before click) */}
      {audioNeedsUnlock && orderSoundEnabled && (
        <button
          type="button"
          onClick={() => void unlockAudio()}
          className="fixed bottom-20 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold shadow-lg inline-flex items-center gap-2 animate-pulse"
        >
          <Volume2 className="w-4 h-4" />
          <span>
            {lang === 'bn'
              ? 'নতুন অর্ডার সাউন্ড চালু করতে ক্লিক করুন'
              : 'Tap to play Order Alert Sound'}
          </span>
        </button>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#2E3138] text-white text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MarketplaceApp />
    </AuthProvider>
  );
}
