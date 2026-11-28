import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bike,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  LocateFixed,
  Mail,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  Truck,
  X,
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/api';
import {
  buildOrderTrackingUrl,
  calculateLiveRiderEta,
  computeOrderEtaSummary,
  formatBdt,
  formatDurationEstimate,
  getDeliveryVehicleMeta,
  normalizeDeliveryVehicleMode,
  type LiveRouteTrafficSummary,
} from '../lib/marketplace-logic';
import { playOrderAlertChime, useRealtimeEvents } from '../lib/realtime';
import { DhakaMapPicker } from './DhakaMapPicker';
import type {
  Lang,
  OrderEmailLog,
  OrderRecord,
  PaymentTransactionRecord,
  Restaurant,
  RiderLiveLocation,
} from '../types/marketplace';

interface OrderTrackingViewProps {
  orderId: number;
  initialToken?: string;
  lang: Lang;
  mapsApiKey: string;
  onBack: () => void;
}

const STEPS = [
  { key: 'confirmed', labelBn: 'অর্ডার কনফার্মড', labelEn: 'Order Confirmed' },
  { key: 'accepted', labelBn: 'রেস্টুরেন্ট গ্রহণ করেছে', labelEn: 'Accepted by Kitchen' },
  { key: 'preparing', labelBn: 'খাবার তৈরি হচ্ছে', labelEn: 'Preparing Food' },
  { key: 'ready', labelBn: 'পিকআপের জন্য প্রস্তুত', labelEn: 'Ready for Pickup' },
  { key: 'rider_assigned', labelBn: 'রাইডার নির্ধারিত', labelEn: 'Rider Assigned' },
  { key: 'on_the_way', labelBn: 'পথে রয়েছে', labelEn: 'On the Way' },
  { key: 'delivered', labelBn: 'ডেলিভারি সম্পন্ন', labelEn: 'Delivered' },
];

export function OrderTrackingView({
  orderId,
  initialToken,
  lang,
  mapsApiKey,
  onBack,
}: OrderTrackingViewProps) {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [riderLocation, setRiderLocation] = useState<RiderLiveLocation | null>(null);
  const [nearestRider, setNearestRider] = useState<RiderLiveLocation | null>(null);
  const [emailLogs, setEmailLogs] = useState<OrderEmailLog[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [history, setHistory] = useState<
    Array<{ id: number; status: string; note: string; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Email tracking state
  const [trackEmailInput, setTrackEmailInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [previewLogId, setPreviewLogId] = useState<number | null>(null);

  // Review state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<{
    distanceKm: number;
    drivingMinutes: number;
  } | null>(null);
  const [liveRouteSummary, setLiveRouteSummary] = useState<LiveRouteTrafficSummary | null>(null);
  const [liveStatusNotice, setLiveStatusNotice] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      const qs = initialToken ? `?token=${encodeURIComponent(initialToken)}` : '';
      const res = await apiFetch<{
        order: OrderRecord;
        restaurant: Restaurant | null;
        riderLocation?: RiderLiveLocation | null;
        nearestRider?: RiderLiveLocation | null;
        emailLogs?: OrderEmailLog[];
        transactions?: PaymentTransactionRecord[];
        history: Array<{ id: number; status: string; note: string; createdAt: string }>;
      }>(`/api/orders/${orderId}${qs}`);
      if (prevStatusRef.current && prevStatusRef.current !== res.order.status) {
        void playOrderAlertChime('status_update', {
          dedupKey: `order_status_${res.order.id}_${res.order.status}`,
        });
        setLiveStatusNotice(
          lang === 'bn'
            ? `লাইভ আপডেট: আপনার অর্ডার এখন "${res.order.status.replace(/_/g, ' ')}"`
            : `Live update: Order is now "${res.order.status.replace(/_/g, ' ')}"`
        );
      }
      prevStatusRef.current = res.order.status;
      setOrder(res.order);
      setRestaurant(res.restaurant);
      setRiderLocation(res.riderLocation ?? null);
      setNearestRider(res.nearestRider ?? null);
      setEmailLogs(res.emailLogs ?? []);
      setTransactions(res.transactions ?? []);
      setHistory(res.history);
      if (res.order.customerEmail && !trackEmailInput) {
        setTrackEmailInput(res.order.customerEmail);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orderId, initialToken, lang]);

  const isTerminal = order?.status === 'delivered' || order?.status === 'cancelled';

  useEffect(() => {
    prevStatusRef.current = null;
    setLiveStatusNotice(null);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  useRealtimeEvents({
    enabled: !isTerminal,
    token: getAuthToken(),
    orderId,
    trackingToken: initialToken || order?.trackingToken || null,
    pollFallbackMs: 3000,
    onSync: loadOrder,
    onEvent: (ev) => {
      if (
        (ev.type === 'order:updated' || ev.type === 'rider:location') &&
        Number(ev.payload.orderId) === orderId
      ) {
        if (
          ev.type === 'rider:location' &&
          typeof ev.payload.lat === 'number' &&
          typeof ev.payload.lng === 'number'
        ) {
          setRiderLocation((prev) =>
            prev
              ? { ...prev, currentLat: ev.payload.lat, currentLng: ev.payload.lng, lat: ev.payload.lat, lng: ev.payload.lng }
              : prev
          );
        }
        loadOrder();
      }
    },
  });

  useEffect(() => {
    if (!order || !restaurant) return;
    const mode = normalizeDeliveryVehicleMode(
      riderLocation?.vehicleType || nearestRider?.vehicleType || 'Motorbike'
    );
    apiFetch<{ route: { distanceKm: number; drivingMinutes: number } }>(
      `/api/free/route?fromLat=${restaurant.lat}&fromLng=${restaurant.lng}&toLat=${order.deliveryLat}&toLng=${order.deliveryLng}&mode=${encodeURIComponent(mode)}`
    )
      .then((res) => setRouteEstimate(res.route))
      .catch(() => {});
  }, [order, restaurant, riderLocation?.vehicleType, nearestRider?.vehicleType]);

  const handleVerifyPayment = async () => {
    if (!order) return;
    setVerifying(true);
    try {
      const res = await apiFetch<{ order: OrderRecord }>('/api/payments/verify', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          transactionId: order.paymentTxId || `TX-${order.orderNumber}`,
        }),
      });
      setOrder(res.order);
      await loadOrder();
    } finally {
      setVerifying(false);
    }
  };

  const handleSendTrackingEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSendingEmail(true);
    setEmailNotice(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        customerEmail: string;
        emailLog: OrderEmailLog | null;
      }>(`/api/orders/${order.id}/send-tracking-email`, {
        method: 'POST',
        body: JSON.stringify({
          email: trackEmailInput.trim() || order.customerEmail,
          token: initialToken || order.trackingToken || undefined,
        }),
      });
      setEmailNotice(
        lang === 'bn'
          ? `অর্ডার ট্র্যাকিং ইমেইল পাঠানো হয়েছে: ${res.customerEmail}`
          : `Live tracking update dispatched to ${res.customerEmail}`
      );
      await loadOrder();
    } catch (err: unknown) {
      setEmailNotice(err instanceof Error ? err.message : 'Failed to dispatch tracking email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !comment.trim()) return;
    await apiFetch('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        restaurantId: order.restaurantId,
        orderId: order.id,
        rating,
        foodRating: rating,
        comment: comment.trim(),
      }),
    });
    setReviewSubmitted(true);
  };

  if (loading || !order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="h-40 rounded-2xl bg-neutral-100 animate-pulse" />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const etaSummary = computeOrderEtaSummary({
    status: order.status,
    estimatedMinutes: order.estimatedMinutes,
    restaurantLat: restaurant?.lat ?? order.restaurantLat ?? null,
    restaurantLng: restaurant?.lng ?? order.restaurantLng ?? null,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    riderLat: riderLocation?.lat ?? null,
    riderLng: riderLocation?.lng ?? null,
    standbyRiderLat: nearestRider?.lat ?? null,
    standbyRiderLng: nearestRider?.lng ?? null,
  });
  const activeRiderVehicleType =
    riderLocation?.vehicleType || nearestRider?.vehicleType || 'Motorbike';
  const activeVehicleMeta = getDeliveryVehicleMeta(
    liveRouteSummary?.vehicleMode || normalizeDeliveryVehicleMode(activeRiderVehicleType)
  );
  const unifiedDistanceKm =
    order.status === 'delivered'
      ? 0
      : liveRouteSummary?.distanceKm ??
        (riderLocation
          ? etaSummary.remainingKm
          : routeEstimate?.distanceKm ?? etaSummary.remainingKm);
  const unifiedEtaMinutes =
    order.status === 'delivered'
      ? 0
      : liveRouteSummary?.etaMinutes ??
        (routeEstimate && !riderLocation
          ? routeEstimate.drivingMinutes
          : etaSummary.etaMinutes);
  const shareUrl =
    typeof window !== 'undefined'
      ? buildOrderTrackingUrl(
          window.location.origin,
          order.id,
          initialToken || order.trackingToken || undefined
        )
      : '';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
        </button>

        <button
          type="button"
          onClick={loadOrder}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-[#E21B70] px-3 py-1.5 rounded-lg border border-neutral-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{lang === 'bn' ? 'আপডেট করুন' : 'Refresh Status'}</span>
        </button>
      </div>

      {liveStatusNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF0F6] border border-[#E21B70]/40 p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#2E3138]">
            <Bell className="w-4 h-4 text-[#E21B70] shrink-0 animate-pulse" />
            <span>{liveStatusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setLiveStatusNotice(null)}
            aria-label="Dismiss live tracking alert"
            className="p-1 rounded hover:bg-white text-neutral-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Order Header & Online Payment Verification Action */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono-nums text-neutral-500">
              {order.orderNumber} · {order.deliveryProvider}
              {order.consignmentId ? ` (${order.consignmentId})` : ''}
            </p>
            <h1 className="text-2xl font-bold text-[#2E3138] mt-1">{order.restaurantName}</h1>
            <p className="text-sm text-neutral-600 mt-1">
              {lang === 'bn' ? 'ডেলিভারি ঠিকানা:' : 'Delivering to:'} {order.deliveryAddress}
            </p>
          </div>

          <div className="text-right tabular-nums">
            <p className="text-xl font-bold text-[#E21B70]">{formatBdt(order.totalAmount, lang)}</p>
            <p className="text-xs font-medium text-neutral-600 mt-0.5">
              {order.paymentMethod.toUpperCase()} ·{' '}
              <span
                className={
                  order.paymentStatus === 'paid'
                    ? 'text-emerald-700 font-semibold'
                    : order.paymentStatus === 'refunded'
                    ? 'text-red-600 font-semibold'
                    : 'text-amber-700 font-semibold'
                }
              >
                {order.paymentStatus.toUpperCase()}
              </span>
            </p>
          </div>
        </div>

        {/* Split Payment Summary Banner */}
        {(() => {
          const isSplit =
            order.paymentMethod !== 'cod' ||
            order.paymentSplitMode === 'online_food_cash_delivery';
          const onlineFood =
            typeof order.onlineFoodPaidAmount === 'number'
              ? order.onlineFoodPaidAmount
              : order.paymentMethod === 'cod'
              ? 0
              : Math.max(0, order.totalAmount - order.deliveryFee);
          const cashDelivery =
            typeof order.cashDueToRider === 'number'
              ? order.cashDueToRider
              : order.paymentMethod === 'cod'
              ? order.totalAmount
              : order.deliveryFee;
          const cashStatus = String(order.cashCollectionStatus || 'pending');
          if (!isSplit) return null;
          return (
            <div
              data-testid="tracking-split-payment-cards"
              className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs"
            >
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-emerald-900">
                    {order.paymentStatus === 'paid'
                      ? lang === 'bn'
                        ? 'অনলাইন পেমেন্ট সম্পন্ন (খাবার)'
                        : 'Online Paid (Food)'
                      : lang === 'bn'
                      ? 'অনলাইন পেমেন্ট বাকি (খাবার)'
                      : 'Online Food Payable'}
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    {order.paymentMethod.toUpperCase()} · {order.paymentStatus.toUpperCase()}
                  </p>
                </div>
                <span className="font-bold text-sm text-emerald-900 tabular-nums">
                  {formatBdt(onlineFood, lang)}
                </span>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-amber-900">
                    {lang === 'bn' ? 'রাইডারকে নগদ দিন' : 'Pay Cash to Rider'}
                  </p>
                  <p className="text-[10px] text-amber-800">
                    {cashStatus === 'collected'
                      ? lang === 'bn'
                        ? `রাইডার কর্তৃক সংগৃহীত (${formatBdt(order.cashCollectedAmount ?? cashDelivery, lang)})`
                        : `Collected ${formatBdt(order.cashCollectedAmount ?? cashDelivery, lang)} by Rider`
                      : cashStatus === 'reversed'
                      ? lang === 'bn'
                        ? 'বাতিল / রিভার্সড'
                        : 'Reversed'
                      : lang === 'bn'
                      ? 'ডেলিভারি চার্জ (হাতে দেবেন)'
                      : 'Delivery Charge on Delivery'}
                  </p>
                </div>
                <span className="font-bold text-sm text-amber-900 tabular-nums">
                  {formatBdt(cashDelivery, lang)}
                </span>
              </div>

              <div className="rounded-xl border border-pink-200 bg-[#FFF0F6] px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-[#2E3138]">
                    {lang === 'bn' ? 'গ্রাহকের মোট খরচ' : 'Customer Total Cost'}
                  </p>
                  <p className="text-[10px] text-[#E21B70]">
                    {lang === 'bn' ? 'খাবার + ডেলিভারি' : 'Food + Delivery'}
                  </p>
                </div>
                <span className="font-bold text-sm text-[#E21B70] tabular-nums">
                  {formatBdt(onlineFood + cashDelivery, lang)}
                </span>
              </div>
            </div>
          );
        })()}

        {order.paymentMethod !== 'cod' && order.paymentStatus === 'pending' && !isCancelled && (
          <div className="mt-4 p-4 rounded-xl bg-[#FFF0F6] border border-[#E21B70]/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-[#2E3138]">
              <CreditCard className="w-4 h-4 text-[#E21B70]" />
              <span>
                {lang === 'bn'
                  ? `${order.paymentMethod.toUpperCase()} অনলাইন ফুড পেমেন্ট (${formatBdt(order.onlineFoodPaidAmount ?? Math.max(0, order.totalAmount - order.deliveryFee), lang)}, ডেলিভারি চার্জ ছাড়া) সম্পন্ন ও যাচাই করুন (${order.paymentTxId})`
                  : `Verify ${order.paymentMethod.toUpperCase()} Online Food Payment (${formatBdt(order.onlineFoodPaidAmount ?? Math.max(0, order.totalAmount - order.deliveryFee), lang)}, excl. delivery charge) · ${order.paymentTxId}`}
              </span>
            </div>
            <button
              type="button"
              disabled={verifying}
              onClick={handleVerifyPayment}
              className="px-4 py-2 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {verifying
                  ? lang === 'bn'
                    ? 'যাচাই হচ্ছে...'
                    : 'Verifying...'
                  : lang === 'bn'
                  ? 'অনলাইন ফুড পেমেন্ট যাচাই করুন'
                  : 'Complete & Verify Payment'}
              </span>
            </button>
          </div>
        )}

        {/* Always-Visible Live Rider Location & Estimated Delivery Time Banner */}
        {!isCancelled && (
          <div
            data-testid="live-eta-banner"
            className={`mt-5 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
              order.status === 'delivered'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-gradient-to-r from-[#FFF0F6] via-white to-emerald-50/70 border-[#E21B70]/25'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                  order.status === 'delivered'
                    ? 'bg-emerald-600'
                    : riderLocation
                    ? 'bg-emerald-600'
                    : 'bg-[#E21B70]'
                }`}
              >
                <Bike className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#E21B70]">
                    {order.status === 'delivered'
                      ? lang === 'bn'
                        ? 'ডেলিভারি সম্পন্ন হয়েছে'
                        : 'Order Delivered'
                      : riderLocation
                      ? lang === 'bn'
                        ? 'লাইভ রাইডার লোকেশন'
                        : 'Live Rider Location'
                      : nearestRider
                      ? lang === 'bn'
                        ? 'রাইডার অ্যাসাইনমেন্ট প্রস্তুত'
                        : 'Rider Standby Near Kitchen'
                      : lang === 'bn'
                      ? 'ডেলিভারি রুট ও সময়'
                      : 'Delivery Dispatch & ETA'}
                  </p>
                  {riderLocation && order.status !== 'delivered' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      LIVE GPS
                    </span>
                  )}
                </div>

                <p className="text-sm font-bold text-[#2E3138]">
                  {order.status === 'delivered'
                    ? lang === 'bn'
                      ? `${order.deliveryArea}-এ আপনার খাবার পৌঁছে দেওয়া হয়েছে`
                      : `Delivered safely to ${order.deliveryArea}`
                    : riderLocation
                    ? lang === 'bn'
                      ? `${riderLocation.fullName} (${riderLocation.zone}) · আপনার অবস্থান থেকে ${unifiedDistanceKm.toFixed(1)} কিমি দূরে`
                      : `${riderLocation.fullName} (${riderLocation.vehicleType}) is in ${riderLocation.zone} · ${unifiedDistanceKm.toFixed(1)} km away`
                    : nearestRider
                    ? lang === 'bn'
                      ? `নিকটতম রাইডার (${nearestRider.zone}) কিচেন থেকে ${typeof nearestRider.distanceToRestaurantKm === 'number' ? nearestRider.distanceToRestaurantKm.toFixed(1) : '1.0'} কিমি দূরে প্রস্তুত`
                      : `Nearest Foodora rider (${nearestRider.fullName}) is ${typeof nearestRider.distanceToRestaurantKm === 'number' ? nearestRider.distanceToRestaurantKm.toFixed(1) : '1.0'} km from kitchen in ${nearestRider.zone}`
                    : lang === 'bn'
                    ? `${order.restaurantName} (${restaurant?.area || order.deliveryArea}) থেকে ডেলিভারি প্রস্তুত হচ্ছে`
                    : `Preparing at ${order.restaurantName} (${restaurant?.area || order.deliveryArea}) · ${order.deliveryProvider}`}
                </p>

                <p className="text-[11px] text-neutral-500 font-mono-nums">
                  {riderLocation
                    ? `${lang === 'bn' ? 'রাইডার GPS:' : 'Rider GPS:'} ${riderLocation.lat.toFixed(4)}, ${riderLocation.lng.toFixed(4)} · ${lang === 'bn' ? 'মোট দূরত্ব' : 'Route'}: ${unifiedDistanceKm.toFixed(1)} km`
                    : nearestRider
                    ? `${lang === 'bn' ? 'স্ট্যান্ডবাই GPS:' : 'Standby Rider GPS:'} ${nearestRider.lat.toFixed(4)}, ${nearestRider.lng.toFixed(4)} · ${lang === 'bn' ? 'ডেলিভারি দূরত্ব' : 'Total route'}: ${unifiedDistanceKm.toFixed(1)} km`
                    : `${lang === 'bn' ? 'রুট দূরত্ব:' : 'Route distance:'} ${unifiedDistanceKm.toFixed(1)} km`}
                </p>
              </div>
            </div>

            {order.status !== 'delivered' && (
              <div
                data-testid="live-eta-minutes"
                className="px-4 py-2.5 rounded-xl bg-white border border-neutral-200 shadow-xs text-right shrink-0 tabular-nums"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  {lang === 'bn' ? 'আনুমানিক সময়' : 'Estimated Arrival'}
                </p>
                <p className="text-xl font-extrabold text-[#E21B70]">
                  ~{formatDurationEstimate(unifiedEtaMinutes, lang)}
                </p>
                <p className="text-[10px] font-semibold text-neutral-500">
                  {lang === 'bn' ? activeVehicleMeta.labelBn : activeVehicleMeta.labelEn}
                  {liveRouteSummary
                    ? ` · ${
                        lang === 'bn'
                          ? liveRouteSummary.trafficLabelBn
                          : liveRouteSummary.trafficLabelEn
                      }`
                    : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Status Timeline */}
        {isCancelled ? (
          <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            {lang === 'bn' ? 'অর্ডার বাতিল করা হয়েছে:' : 'Order Cancelled:'} {order.cancelReason}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {STEPS.map((st, idx) => {
              const reached = idx <= currentIdx || (order.status === 'picked_up' && idx <= 5);
              return (
                <div
                  key={st.key}
                  className={`p-3 rounded-xl border text-xs ${
                    reached
                      ? 'border-[#E21B70] bg-[#FFF0F6] text-[#2E3138]'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {reached ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="font-semibold">0{idx + 1}</span>
                  </div>
                  <p className="font-medium leading-tight">{lang === 'bn' ? st.labelBn : st.labelEn}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Map + Receipt + Email Tracking */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#2E3138] flex items-center gap-2">
              <span>
                {lang === 'bn'
                  ? 'লাইভ ডেলিভারি রুট ও রাইডার ট্র্যাকিং'
                  : 'Live Delivery Route & Rider GPS'}
              </span>
              {riderLocation && !isTerminal && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE GPS
                </span>
              )}
            </h2>
            {!isCancelled && (
              <span
                data-testid="tracking-map-distance-eta"
                className="text-xs font-semibold text-[#E21B70] tabular-nums"
              >
                {unifiedDistanceKm.toFixed(1)}{' '}
                {lang === 'bn' ? 'কিমি' : 'km'} ·{' '}
                {order.status === 'delivered'
                  ? lang === 'bn'
                    ? 'ডেলিভারি সম্পন্ন'
                    : 'Delivered'
                  : lang === 'bn'
                  ? `~${formatDurationEstimate(unifiedEtaMinutes, 'bn')} লাগবে`
                  : `~${formatDurationEstimate(unifiedEtaMinutes, 'en')} away`}
              </span>
            )}
          </div>

          <DhakaMapPicker
            mapsApiKey={mapsApiKey}
            lang={lang}
            center={{ lat: order.deliveryLat, lng: order.deliveryLng }}
            markerLabel={order.customerName ? `${order.customerName} (${order.deliveryArea})` : order.deliveryArea}
            pinType="user"
            userName={order.customerName}
            secondaryPoint={
              restaurant
                ? { lat: restaurant.lat, lng: restaurant.lng, label: restaurant.name }
                : undefined
            }
            riderPoint={
              riderLocation
                ? {
                    lat: riderLocation.lat,
                    lng: riderLocation.lng,
                    label: `${riderLocation.fullName.replace(/\s+\d{7,}$/, '')} (Live)`,
                  }
                : nearestRider
                ? {
                    lat: nearestRider.lat,
                    lng: nearestRider.lng,
                    label: `${nearestRider.fullName.replace(/\s+\d{7,}$/, '')} (${lang === 'bn' ? 'স্ট্যান্ডবাই' : 'Standby'})`,
                  }
                : undefined
            }
            riderTarget={
              order.status === 'rider_assigned' && restaurant
                ? { lat: restaurant.lat, lng: restaurant.lng }
                : { lat: order.deliveryLat, lng: order.deliveryLng }
            }
            riderVehicleType={activeRiderVehicleType}
            liveDistanceKm={unifiedDistanceKm}
            liveEtaMinutes={unifiedEtaMinutes}
            trackingStatus={order.status}
            showTraffic
            showDirectionsSummary
            onRouteSummary={setLiveRouteSummary}
            heightClass="h-[280px]"
          />

          {/* Live Rider Telemetry Card */}
          {riderLocation ? (
            (() => {
              const goingToRestaurant = order.status === 'rider_assigned' && Boolean(restaurant);
              const targetLat =
                goingToRestaurant && restaurant ? restaurant.lat : order.deliveryLat;
              const targetLng =
                goingToRestaurant && restaurant ? restaurant.lng : order.deliveryLng;
              const liveEta = calculateLiveRiderEta(
                riderLocation.lat,
                riderLocation.lng,
                targetLat,
                targetLng,
                order.status
              );
              return (
                <div
                  data-testid="live-rider-card"
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-[#2E3138]">{riderLocation.fullName}</p>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-800">
                          {riderLocation.vehicleType} · {riderLocation.zone}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 font-mono-nums flex items-center gap-1.5 mt-0.5">
                        <LocateFixed className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {riderLocation.lat.toFixed(4)}, {riderLocation.lng.toFixed(4)}
                        </span>
                        <span className="text-neutral-400">·</span>
                        <span>
                          {lang === 'bn' ? 'আপডেট:' : 'Updated'}{' '}
                          {new Date(riderLocation.locationUpdatedAt).toLocaleTimeString()}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {!isTerminal && (
                      <div className="text-right tabular-nums">
                        <p className="text-xs font-bold text-emerald-800">
                          {(liveRouteSummary?.distanceKm ?? liveEta.remainingKm).toFixed(1)} km{' '}
                          {goingToRestaurant
                            ? lang === 'bn'
                              ? 'রেস্টুরেন্টের পথে'
                              : 'to pickup'
                            : lang === 'bn'
                            ? 'দূরে'
                            : 'away'}
                        </p>
                        <p className="text-[11px] text-neutral-600">
                          {lang === 'bn'
                            ? `প্রায় ${formatDurationEstimate(unifiedEtaMinutes, 'bn')} বাকি`
                            : `~${formatDurationEstimate(unifiedEtaMinutes, 'en', 'compact')} live ETA`}
                        </p>
                      </div>
                    )}
                    {riderLocation.phone && (
                      <a
                        href={`tel:${riderLocation.phone}`}
                        className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'কল করুন' : 'Call Rider'}</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })()
          ) : order.deliveryMode === 'third_party' ? (
            <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center gap-3 text-xs text-neutral-700">
              <Truck className="w-4 h-4 text-[#E21B70] shrink-0" />
              <span>
                {lang === 'bn'
                  ? `Pathao Courier দ্বারা ডেলিভারি চলছে (${order.consignmentId || order.orderNumber}) · আনুমানিক ${formatDurationEstimate(unifiedEtaMinutes, 'bn')}।`
                  : `Tracked via ${order.deliveryProvider} (${order.consignmentId || order.orderNumber}) · ~${formatDurationEstimate(unifiedEtaMinutes, 'en', 'compact')} ETA.`}
              </span>
            </div>
          ) : nearestRider && !isTerminal ? (
            <div
              data-testid="standby-rider-card"
              className="p-4 rounded-xl border border-[#E21B70]/25 bg-[#FFF0F6]/50 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#E21B70] text-white flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-[#2E3138]">
                    {nearestRider.fullName} ({nearestRider.vehicleType} · {nearestRider.zone})
                  </p>
                  <p className="text-xs text-neutral-600 font-mono-nums">
                    {lang === 'bn'
                      ? `কিচেন থেকে ${typeof nearestRider.distanceToRestaurantKm === 'number' ? nearestRider.distanceToRestaurantKm.toFixed(1) : '1.0'} কিমি দূরে স্ট্যান্ডবাই · GPS ${nearestRider.lat.toFixed(4)}, ${nearestRider.lng.toFixed(4)}`
                      : `Standby ${typeof nearestRider.distanceToRestaurantKm === 'number' ? nearestRider.distanceToRestaurantKm.toFixed(1) : '1.0'} km from restaurant · GPS ${nearestRider.lat.toFixed(4)}, ${nearestRider.lng.toFixed(4)}`}
                  </p>
                </div>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-xs font-bold text-[#E21B70]">
                  ~{formatDurationEstimate(unifiedEtaMinutes, lang)}{lang === 'bn' ? '' : ' ETA'}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {lang === 'bn' ? 'রাইডার অ্যাসাইনমেন্ট প্রক্রিয়াধীন' : 'Auto-dispatching rider'}
                </p>
              </div>
            </div>
          ) : null}

          <div className="pt-1 space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-start justify-between text-xs text-neutral-600">
                <span>
                  <strong className="text-[#2E3138] uppercase">{h.status.replace('_', ' ')}</strong> —{' '}
                  {h.note}
                </span>
                <span className="font-mono-nums text-neutral-400 shrink-0 ml-2">
                  {new Date(h.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-[#2E3138]">
                {lang === 'bn' ? 'অর্ডার ইনভয়েস ও রসিদ' : 'Order Invoice & Receipt'}
              </h2>
              <span className="px-2 py-0.5 rounded bg-[#FFF0F6] text-[#E21B70] border border-[#E21B70]/20 text-[11px] font-mono-nums font-bold">
                INV-{order.orderNumber}
              </span>
            </div>
            <div className="space-y-2.5 text-sm">
              {order.itemsSnapshotJson.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={
                        item.imageUrl ||
                        '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg'
                      }
                      alt={lang === 'bn' ? item.nameBn : item.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.dataset.fallbackApplied) {
                          img.dataset.fallbackApplied = '1';
                          img.src =
                            '/src/assets/images/food_kacchi_biriyani_1794831373742.jpg';
                        }
                      }}
                      className="w-10 h-10 rounded-lg object-cover border border-neutral-200 shrink-0"
                    />
                    <span className="text-neutral-700 truncate">
                      {item.quantity}x {lang === 'bn' ? item.nameBn : item.name}
                      {item.variation ? ` (${item.variation})` : ''}
                      {item.unitPrice > 0 ? (
                        <span className="text-[11px] text-neutral-400 ml-1">
                          @ {formatBdt(item.unitPrice, lang)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums shrink-0">{formatBdt(item.lineTotal, lang)}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-neutral-100 space-y-1 text-xs text-neutral-600 tabular-nums">
                <div className="flex justify-between">
                  <span>{lang === 'bn' ? 'সাবটোটাল' : 'Subtotal'}</span>
                  <span>{formatBdt(order.subtotal, lang)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>
                      {lang === 'bn' ? 'ডিসকাউন্ট' : 'Discount'}
                      {order.couponCode ? ` (${order.couponCode})` : ''}
                    </span>
                    <span>−{formatBdt(order.discountAmount, lang)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{lang === 'bn' ? 'ডেলিভারি ফি' : 'Delivery Fee'}</span>
                  <span>{formatBdt(order.deliveryFee, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'bn' ? 'সার্ভিস চার্জ' : 'Service Fee'}</span>
                  <span>{formatBdt(order.serviceFee, lang)}</span>
                </div>
                {order.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>{lang === 'bn' ? 'ভ্যাট / ট্যাক্স' : 'VAT / Tax'}</span>
                    <span>{formatBdt(order.taxAmount, lang)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-[#2E3138] pt-2 border-t border-neutral-100">
                  <span>{lang === 'bn' ? 'সর্বমোট খরচ' : 'Customer Total Cost'}</span>
                  <span className="text-[#E21B70]">{formatBdt(order.totalAmount, lang)}</span>
                </div>
                {order.paymentMethod !== 'cod' && (
                  <div className="pt-2 mt-2 border-t border-dashed border-neutral-200 space-y-1">
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>{lang === 'bn' ? 'অনলাইনে খাবার পেমেন্ট' : 'Online Food Payment'}</span>
                      <span>
                        {formatBdt(
                          order.onlineFoodPaidAmount ?? Math.max(0, order.totalAmount - order.deliveryFee),
                          lang
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-800 font-semibold">
                      <span>{lang === 'bn' ? 'রাইডারকে নগদ (ডেলিভারি)' : 'Cash to Rider (Delivery)'}</span>
                      <span>{formatBdt(order.cashDueToRider ?? order.deliveryFee, lang)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Separate Payment & Delivery Transaction Records */}
          {transactions.length > 0 && (
            <div
              data-testid="order-transactions-card"
              className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-2.5"
            >
              <h2 className="text-sm font-bold text-[#2E3138]">
                {lang === 'bn' ? 'পেমেন্ট ও ডেলিভারি লেনদেন রেকর্ড' : 'Split Transaction Records'}
              </h2>
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2E3138] capitalize">
                        {tx.txKind.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {tx.paymentMethod.toUpperCase()} · {tx.payerRole} → {tx.recipientRole}
                        {tx.gatewayTxId ? ` · ${tx.gatewayTxId}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <p className="font-bold text-[#2E3138]">{formatBdt(tx.amount, lang)}</p>
                      <span
                        className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          tx.status === 'succeeded'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.status === 'refunded' || tx.status === 'cancelled'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email Order Tracking & Notification Log Card */}
          <div
            data-testid="email-order-tracking-card"
            className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#2E3138] flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn' ? 'ইমেইলে অর্ডার ট্র্যাকিং' : 'Email Order Tracking'}
                </span>
              </h2>
              {shareUrl && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl).catch(() => {});
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-[#E21B70]"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-neutral-500">
              {lang === 'bn'
                ? 'অর্ডারের প্রতিটি আপডেট ও রাইডারের লাইভ ট্র্যাকিং লিংক এই ইমেইলে পাঠানো হচ্ছে।'
                : 'Live order updates and your direct tracking link are sent to this email address.'}
            </p>

            <form onSubmit={handleSendTrackingEmail} className="flex gap-2">
              <input
                type="email"
                required
                value={trackEmailInput}
                onChange={(e) => setTrackEmailInput(e.target.value)}
                placeholder="customer@example.com"
                className="flex-1 min-w-0 px-3 py-2 text-xs border border-neutral-200 rounded-lg"
              />
              <button
                type="submit"
                disabled={sendingEmail}
                className="px-3.5 py-2 rounded-lg bg-[#2E3138] hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingEmail ? 'Sending...' : 'Send Email'}</span>
              </button>
            </form>

            {emailNotice && (
              <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {emailNotice}
              </p>
            )}

            {emailLogs.some((l) => l.providerStatus !== 'sent') &&
              !emailLogs.some((l) => l.providerStatus === 'sent') && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  {lang === 'bn'
                    ? 'ইনভয়েস তৈরি হয়ে ট্র্যাকিং ইনবক্সে সংরক্ষিত হয়েছে। সরাসরি Gmail/Email ইনবক্সে পাঠাতে Admin -> Backend Control থেকে Gmail SMTP বা Resend যুক্ত করুন।'
                    : 'Invoice generated and saved in your Tracking Inbox. To deliver directly to Gmail/Email inboxes, configure Gmail SMTP or Resend in Admin -> Backend Control.'}
                </div>
              )}

            {emailLogs.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-neutral-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Dispatched Invoice &amp; Email Updates ({emailLogs.length})
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {emailLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#2E3138] truncate">{log.subject}</p>
                          <p className="text-[11px] text-neutral-500 truncate">
                            To: {log.recipientEmail} · {new Date(log.sentAt).toLocaleTimeString()} ·{' '}
                            <span
                              className={
                                log.providerStatus === 'sent'
                                  ? 'text-emerald-700 font-semibold'
                                  : log.providerStatus.includes('error')
                                  ? 'text-red-600 font-semibold'
                                  : 'text-amber-700 font-medium'
                              }
                            >
                              {log.providerStatus === 'sent'
                                ? `Sent (${log.deliveryProvider.toUpperCase()})`
                                : log.providerStatus === 'not_configured' || log.providerStatus === 'recorded'
                                ? 'Saved in Tracking Inbox (SMTP not configured)'
                                : `Email Failed (${log.providerStatus})`}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewLogId((prev) => (prev === log.id ? null : log.id))
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-700 hover:border-[#E21B70] shrink-0"
                        >
                          <Eye className="w-3 h-3" />
                          <span>{previewLogId === log.id ? 'Hide' : 'Preview'}</span>
                        </button>
                      </div>
                      {previewLogId === log.id && log.htmlPreview && (
                        <div
                          className="p-3 rounded-lg bg-white border border-neutral-200 text-xs overflow-auto max-h-52"
                          dangerouslySetInnerHTML={{ __html: log.htmlPreview }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {order.status === 'delivered' && !reviewSubmitted && (
            <form
              onSubmit={handleSubmitReview}
              className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3"
            >
              <h2 className="text-sm font-bold text-[#2E3138]">
                {lang === 'bn' ? 'রেস্টুরেন্টকে রেটিং দিন' : 'Rate Your Experience'}
              </h2>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`Rate ${n} stars`}
                    className="p-1"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        n <= rating ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                required
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={lang === 'bn' ? 'খাবারের মান কেমন ছিল লিখুন...' : 'Share your feedback...'}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#2E3138] text-white text-xs font-semibold hover:bg-black"
              >
                {lang === 'bn' ? 'রিভিউ সাবমিট করুন' : 'Submit Verified Review'}
              </button>
            </form>
          )}

          {reviewSubmitted && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              {lang === 'bn'
                ? 'ধন্যবাদ! আপনার রিভিউ প্রকাশিত হয়েছে।'
                : 'Thank you! Your verified review has been published.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
