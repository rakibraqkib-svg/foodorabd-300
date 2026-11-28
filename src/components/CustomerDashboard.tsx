import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Heart, MapPin, Package, Plus, Star, User, Volume2, VolumeX, X } from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/api';
import { BANGLADESH_AREAS, getBangladeshAreaSelectPresets } from '../lib/i18n';
import {
  detectOrderBatchChanges,
  formatBdt,
  formatDurationEstimate,
  formatResolvedMapAddress,
} from '../lib/marketplace-logic';
import { playOrderAlertChime, useOrderSoundSetting, useRealtimeEvents } from '../lib/realtime';
import { DhakaMapPicker } from './DhakaMapPicker';
import { SelectWithCustom } from './SelectWithCustom';
import type {
  AppUser,
  CustomerAddress,
  Lang,
  OrderRecord,
  Restaurant,
} from '../types/marketplace';

interface CustomerDashboardProps {
  user: AppUser;
  lang: Lang;
  mapsApiKey: string;
  restaurants: Restaurant[];
  favoriteIds: number[];
  onToggleFavorite: (restaurantId: number) => void;
  onSelectRestaurant: (slug: string) => void;
  onTrackOrder: (orderId: number) => void;
  onSelectDefaultAddress: (areaName: string, lat: number, lng: number) => void;
  onBack: () => void;
}

export function CustomerDashboard({
  user,
  lang,
  mapsApiKey,
  restaurants,
  favoriteIds,
  onToggleFavorite,
  onSelectRestaurant,
  onTrackOrder,
  onSelectDefaultAddress,
  onBack,
}: CustomerDashboardProps) {
  const [tab, setTab] = useState<'orders' | 'addresses' | 'favorites'>('orders');
  const [orderSoundEnabled, setOrderSoundEnabled] = useOrderSoundSetting();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [label, setLabel] = useState('Home');
  const [area, setArea] = useState(BANGLADESH_AREAS[0].name);
  const [addressLine, setAddressLine] = useState('');
  const [instructions, setInstructions] = useState('');
  const [coords, setCoords] = useState({ lat: BANGLADESH_AREAS[0].lat, lng: BANGLADESH_AREAS[0].lng });
  const [savingAddr, setSavingAddr] = useState(false);
  const [liveOrderAlert, setLiveOrderAlert] = useState<string | null>(null);
  const orderSnapshotMapRef = useRef<Map<number, { status: string; paymentStatus?: string }> | null>(
    null
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [ordRes, addrRes] = await Promise.all([
          apiFetch<{ orders: OrderRecord[] }>('/api/customer/orders'),
          apiFetch<{ addresses: CustomerAddress[] }>('/api/customer/addresses'),
        ]);
        const changes = detectOrderBatchChanges(orderSnapshotMapRef.current, ordRes.orders);
        orderSnapshotMapRef.current = changes.nextMap;
        if (silent && changes.updatedOrders.length > 0) {
          const changed = changes.updatedOrders[0];
          setLiveOrderAlert(
            lang === 'bn'
              ? `আপনার অর্ডার আপডেট হয়েছে: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
              : `Order status updated: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
          );
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${changed.id}_${changed.status}`,
          });
        } else if (silent && changes.newOrders.length > 0) {
          const fresh = changes.newOrders[0];
          setLiveOrderAlert(
            lang === 'bn'
              ? `নতুন অর্ডার যুক্ত হয়েছে: ${fresh.orderNumber}`
              : `New order placed: ${fresh.orderNumber}`
          );
          void playOrderAlertChime('new_order', {
            dedupKey: `order_created_${fresh.id}`,
          });
        }
        setOrders(ordRes.orders);
        setAddresses(addrRes.addresses);
      } catch (err) {
        console.error('Failed to load customer workspace:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [lang]
  );

  useEffect(() => {
    orderSnapshotMapRef.current = null;
    setLiveOrderAlert(null);
  }, [user?.uid]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useRealtimeEvents({
    enabled: Boolean(user?.uid),
    token: getAuthToken(),
    pollFallbackMs: 6000,
    onSync: () => loadData(true),
    onEvent: (ev) => {
      if (ev.type === 'order:created' || ev.type === 'order:updated' || ev.type === 'notification:created') {
        loadData(true);
      }
    },
  });

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressLine.trim()) return;
    setSavingAddr(true);
    try {
      const res = await apiFetch<{ address: CustomerAddress }>('/api/customer/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label,
          area,
          addressLine: addressLine.trim(),
          lat: coords.lat,
          lng: coords.lng,
          instructions: instructions.trim(),
        }),
      });
      setAddresses((prev) => [res.address, ...prev]);
      onSelectDefaultAddress(res.address.area, res.address.lat, res.address.lng);
      setAddressLine('');
      setInstructions('');
      setShowAddressForm(false);
    } finally {
      setSavingAddr(false);
    }
  };

  const favoriteRestaurants = restaurants.filter((r) => favoriteIds.includes(r.id));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
        </button>

        <div className="flex items-center gap-2">
          {[
            { id: 'orders' as const, labelBn: 'আমার অর্ডার', labelEn: 'Order History', icon: Package },
            { id: 'addresses' as const, labelBn: 'সংরক্ষিত ঠিকানা', labelEn: 'Saved Addresses', icon: MapPin },
            { id: 'favorites' as const, labelBn: 'পছন্দের রেস্টুরেন্ট', labelEn: 'Favorites', icon: Heart },
          ].map((tItem) => {
            const Icon = tItem.icon;
            return (
              <button
                key={tItem.id}
                type="button"
                onClick={() => setTab(tItem.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
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
      </div>

      {/* Customer Profile Banner */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2E3138]">{user.fullName}</h1>
            <p className="text-xs text-neutral-500">
              {user.email} · {lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট' : 'Customer Account'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm tabular-nums">
          <div>
            <p className="text-xs text-neutral-500">{lang === 'bn' ? 'মোট অর্ডার' : 'Total Orders'}</p>
            <p className="font-bold text-[#2E3138]">{orders.length}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">{lang === 'bn' ? 'সংরক্ষিত ঠিকানা' : 'Saved Addresses'}</p>
            <p className="font-bold text-[#2E3138]">{addresses.length}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">{lang === 'bn' ? 'পছন্দ' : 'Favorites'}</p>
            <p className="font-bold text-[#2E3138]">{favoriteRestaurants.length}</p>
          </div>
          <div className="flex items-center gap-2.5 sm:pl-4 sm:border-l border-neutral-200">
            <div className="text-right">
              <p className="text-xs font-semibold text-[#2E3138] flex items-center gap-1">
                {orderSoundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-[#E21B70]" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                )}
                <span>{lang === 'bn' ? 'অর্ডার সাউন্ড' : 'Order Sound'}</span>
              </p>
              <p className="text-[11px] text-neutral-500">
                {orderSoundEnabled
                  ? lang === 'bn'
                    ? 'চালু'
                    : 'On'
                  : lang === 'bn'
                  ? 'বন্ধ'
                  : 'Muted'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={orderSoundEnabled}
              data-testid="customer-order-sound-toggle"
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

      {liveOrderAlert && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF0F6] border border-[#E21B70]/40 p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#2E3138]">
            <Bell className="w-4 h-4 text-[#E21B70] shrink-0 animate-pulse" />
            <span>{liveOrderAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setLiveOrderAlert(null)}
            aria-label="Dismiss order status update"
            className="p-1 rounded hover:bg-white text-neutral-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-44 rounded-2xl bg-white border border-neutral-200 p-6 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'তথ্য লোড হচ্ছে...' : 'Loading customer workspace...'}
        </div>
      ) : tab === 'orders' ? (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center">
              <Package className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
              <p className="font-semibold text-[#2E3138]">
                {lang === 'bn' ? 'এখনও কোনো অর্ডার নেই' : 'No orders placed yet'}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {lang === 'bn'
                  ? 'মার্কেটপ্লেস থেকে আপনার প্রথম খাবার অর্ডার করুন।'
                  : 'Explore Dhaka restaurants and place your first order.'}
              </p>
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono-nums text-neutral-500">
                    <span>{ord.orderNumber}</span>
                    <span>·</span>
                    <span className="uppercase font-semibold text-[#E21B70]">
                      {ord.status.replace(/_/g, ' ')}
                    </span>
                    <span>·</span>
                    <span>{new Date(ord.createdAt).toLocaleString()}</span>
                  </div>
                  <h3 className="font-bold text-[#2E3138] text-base">{ord.restaurantName}</h3>
                  <p className="text-xs text-neutral-600">
                    {ord.itemsSnapshotJson.map((i) => `${i.quantity}x ${lang === 'bn' ? i.nameBn : i.name}`).join(', ')}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {ord.deliveryArea} — {ord.deliveryAddress}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right tabular-nums">
                    <p className="font-bold text-[#2E3138]">{formatBdt(ord.totalAmount, lang)}</p>
                    <p className="text-[11px] text-neutral-500 uppercase">
                      {ord.paymentMethod} · {ord.paymentStatus}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTrackOrder(ord.id)}
                    className="px-4 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold"
                  >
                    {lang === 'bn' ? 'ট্র্যাক করুন' : 'Track Order'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'addresses' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-[#2E3138]">
              {lang === 'bn' ? 'ডেলিভারি ঠিকানা সমূহ' : 'Your Delivery Addresses'}
            </h2>
            <button
              type="button"
              onClick={() => setShowAddressForm((v) => !v)}
              className="px-3.5 py-2 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'নতুন ঠিকানা যোগ করুন' : 'Add Address'}</span>
            </button>
          </div>

          {showAddressForm && (
            <form
              onSubmit={handleSaveAddress}
              className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'লেবেল (যেমন: বাসা / অফিস)' : 'Label (Home / Office)'}
                  </label>
                  <input
                    required
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'শহর / এলাকা (সারা বাংলাদেশ)' : 'City / Area (All Bangladesh)'}
                  </label>
                  <SelectWithCustom
                    required
                    lang={lang}
                    value={area}
                    onChange={setArea}
                    storageKey="bd_areas"
                    ariaLabel="Customer delivery area"
                    placeholder={
                      lang === 'bn'
                        ? 'কাস্টম এলাকার নাম লিখুন (যেমন: বগুড়া সদর)'
                        : 'Type custom area (e.g. Rampura, Dhaka or Bogura)'
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
                        setCoords({ lat: found.lat, lng: found.lng });
                        const formatted = formatResolvedMapAddress({
                          areaName: found.name,
                          lat: found.lat,
                          lng: found.lng,
                        });
                        if (formatted) setAddressLine(formatted);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'বিস্তারিত ঠিকানা' : 'Full Street Address'}
                  </label>
                  <input
                    required
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="House 14, Road 11, Banani, Dhaka"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {lang === 'bn' ? 'নির্দেশনা' : 'Landmark / Gate Instructions'}
                  </label>
                  <input
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Opposite Kemal Ataturk Ave"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <DhakaMapPicker
                mapsApiKey={mapsApiKey}
                lang={lang}
                center={coords}
                markerLabel={label}
                pinType="user"
                userName={user.fullName}
                interactive
                heightClass="h-[220px]"
                onSelectLocation={(c) => {
                  setCoords({ lat: c.lat, lng: c.lng });
                  if (c.areaName) setArea(c.areaName);
                  const formatted = formatResolvedMapAddress({
                    displayName: c.displayName,
                    areaName: c.areaName,
                    lat: c.lat,
                    lng: c.lng,
                  });
                  if (formatted) setAddressLine(formatted);
                }}
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddressForm(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={savingAddr}
                  className="px-4 py-2 rounded-lg bg-[#E21B70] text-white text-xs font-semibold"
                >
                  {savingAddr
                    ? lang === 'bn'
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : lang === 'bn'
                    ? 'ঠিকানা সংরক্ষণ করুন'
                    : 'Save Address'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="bg-white rounded-2xl border border-neutral-200 p-4 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-sm text-[#2E3138]">
                    {addr.label} · {addr.area}
                  </p>
                  <p className="text-xs text-neutral-600 mt-1">{addr.addressLine}</p>
                  {addr.instructions && (
                    <p className="text-[11px] text-neutral-400 mt-0.5">{addr.instructions}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectDefaultAddress(addr.area, addr.lat, addr.lng)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold hover:border-[#E21B70] hover:text-[#E21B70] shrink-0"
                >
                  {lang === 'bn' ? 'ব্যবহার করুন' : 'Use Location'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoriteRestaurants.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl border border-neutral-200 p-10 text-center">
              <Heart className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
              <p className="font-semibold text-[#2E3138]">
                {lang === 'bn' ? 'কোনো পছন্দের রেস্টুরেন্ট নেই' : 'No favorite restaurants yet'}
              </p>
            </div>
          ) : (
            favoriteRestaurants.map((rest) => (
              <div
                key={rest.id}
                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col"
              >
                <div className="relative h-36 bg-neutral-100">
                  <img
                    src={rest.coverUrl}
                    alt={rest.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(rest.id)}
                    aria-label={`Remove ${rest.name} from favorites`}
                    className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center text-[#E21B70]"
                  >
                    <Heart className="w-4 h-4 fill-[#E21B70]" />
                  </button>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-[#2E3138] truncate">
                        {lang === 'bn' ? rest.nameBn : rest.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 tabular-nums">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {rest.rating}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {rest.cuisine} · {rest.area} · {formatDurationEstimate(rest.deliveryTimeMin, lang)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectRestaurant(rest.slug)}
                    className="mt-3 w-full py-2 rounded-lg bg-[#2E3138] hover:bg-black text-white text-xs font-semibold"
                  >
                    {lang === 'bn' ? 'মেনু দেখুন' : 'View Menu'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
