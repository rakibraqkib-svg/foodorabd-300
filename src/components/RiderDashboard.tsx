import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bike,
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Frown,
  History,
  Languages,
  LocateFixed,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Smile,
  Store,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, getAuthToken, setAuthToken } from '../lib/api';
import { BANGLADESH_AREAS, DHAKA_DELIVERY_ZONES, getBangladeshAreaSelectPresets } from '../lib/i18n';
import {
  advanceRiderAlongRoute,
  calculateLiveRiderEta,
  calculateRiderLegEtaMin,
  calculateRiderProfileStats,
  calculateSplitOrderFinancials,
  canRiderAcceptOrders,
  DEFAULT_DELIVERY_FINANCIAL_CONFIG,
  type DeliveryFinancialConfig,
  detectOrderBatchChanges,
  DHAKA_ZONE_PRESETS,
  formatBdt,
  formatDurationEstimate,
  formatRiderShortOrderCode,
  isBicycleVehicleType,
  resolveRiderCashCollectAmount,
  haversineDistanceKm,
  formatDirectionStepDistance,
  sanitizeRiderProfileUpdate,
  VEHICLE_TYPE_PRESET_OPTIONS,
  type LiveRouteTrafficSummary,
} from '../lib/marketplace-logic';
import { emitLocalRealtimeSignal, playOrderAlertChime, useRealtimeEvents } from '../lib/realtime';
import { DhakaMapPicker } from './DhakaMapPicker';
import { SelectWithCustom } from './SelectWithCustom';
import type {
  AppUser,
  DhakaZoneCoverageItem,
  Lang,
  OrderRecord,
  RiderJob,
  RiderRecord,
  RiderWalletLedgerEntry,
  RiderWalletSummary,
} from '../types/marketplace';

interface RiderDashboardProps {
  user: AppUser | null;
  lang: Lang;
  mapsApiKey: string;
  initialOnboarding?: boolean;
  onRefreshUser: () => Promise<void>;
  onTrackOrder: (orderId: number) => void;
  onBack: () => void;
}

type RiderHubTab = 'dispatch' | 'map' | 'earnings' | 'jobs' | 'profile';

export function RiderDashboard({
  user,
  lang,
  mapsApiKey,
  initialOnboarding = false,
  onRefreshUser,
  onTrackOrder,
  onBack,
}: RiderDashboardProps) {
  const [rider, setRider] = useState<RiderRecord | null>(null);
  const [availableOrders, setAvailableOrders] = useState<OrderRecord[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<OrderRecord[]>([]);
  const [walletSummary, setWalletSummary] = useState<RiderWalletSummary>({
    totalCashCollected: 0,
    totalRiderEarnings: 0,
    totalCommissionOwed: 0,
    totalCommissionSettled: 0,
    outstandingCommission: 0,
    deliveredCountFromLedger: 0,
  });
  const [walletLedger, setWalletLedger] = useState<RiderWalletLedgerEntry[]>([]);
  const [settlementRules, setSettlementRules] = useState<
    DeliveryFinancialConfig['settlementRules']
  >(DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules);
  const [deliveryFinancialConfig, setDeliveryFinancialConfig] =
    useState<DeliveryFinancialConfig>(DEFAULT_DELIVERY_FINANCIAL_CONFIG);
  const [zoneCoverage, setZoneCoverage] = useState<DhakaZoneCoverageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showJobForm, setShowJobForm] = useState(initialOnboarding);
  const [activeTab, setActiveTab] = useState<RiderHubTab>('dispatch');

  // Search & action feedback state
  const [queueSearch, setQueueSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [acceptingOrderId, setAcceptingOrderId] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  // Screenshot-matched Rider Sheet Interactive State
  const [focusedActiveOrderId, setFocusedActiveOrderId] = useState<number | null>(null);
  const [previewOfferMode, setPreviewOfferMode] = useState(false);
  const [declinedOfferIds, setDeclinedOfferIds] = useState<number[]>([]);
  const [focusedOfferIdx, setFocusedOfferIdx] = useState(0);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [pickupRatingByOrder, setPickupRatingByOrder] = useState<Record<number, 'good' | 'bad'>>({});
  const [pickupConfirmOrder, setPickupConfirmOrder] = useState<OrderRecord | null>(null);
  const [translateSheet, setTranslateSheet] = useState(false);
  const [editingCashOrderId, setEditingCashOrderId] = useState<number | null>(null);
  const [editedCashInput, setEditedCashInput] = useState('');
  const [cashCollectOverrideByOrder, setCashCollectOverrideByOrder] = useState<Record<number, number>>({});
  const [cashConfirmedByOrder, setCashConfirmedByOrder] = useState<Record<number, boolean>>({});
  const [proofPhotoByOrder, setProofPhotoByOrder] = useState<Record<number, string>>({});
  const [uploadingProofOrderId, setUploadingProofOrderId] = useState<number | null>(null);
  const [proofUploadError, setProofUploadError] = useState<string | null>(null);
  const [liveRouteSummary, setLiveRouteSummary] = useState<LiveRouteTrafficSummary | null>(null);
  const [sheetStepsOpen, setSheetStepsOpen] = useState(false);
  const proofFileInputRef = useRef<HTMLInputElement | null>(null);
  const riderSheetRef = useRef<HTMLDivElement | null>(null);

  // Rider Profile editor state
  const [profileFullName, setProfileFullName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileVehicleType, setProfileVehicleType] = useState('Motorbike');
  const [profileZone, setProfileZone] = useState(BANGLADESH_AREAS[0].name);
  const [profileNidNumber, setProfileNidNumber] = useState('');
  const [profileIsAvailable, setProfileIsAvailable] = useState(true);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  // Live GPS & availability state
  const [sharingGps, setSharingGps] = useState(false);
  const [syncingLoc, setSyncingLoc] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [selectedSyncZone, setSelectedSyncZone] = useState<string>(BANGLADESH_AREAS[0].name);
  const [customSyncZone, setCustomSyncZone] = useState<string>('');
  const watchIdRef = useRef<number | null>(null);

  // Onboarding / Public Job Application form
  const [fullName, setFullName] = useState(user?.isSandbox ? '' : user?.fullName || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(
    user && !user.isSandbox && user.email ? user.email : ''
  );
  const [password, setPassword] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorbike');
  const [zone, setZone] = useState(BANGLADESH_AREAS[0].name);
  const [customZone, setCustomZone] = useState('');
  const [nidNumber, setNidNumber] = useState('');
  const [applyCoords, setApplyCoords] = useState({
    lat: BANGLADESH_AREAS[0].lat,
    lng: BANGLADESH_AREAS[0].lng,
  });
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Open Restaurant Rider Jobs Board
  const [riderJobs, setRiderJobs] = useState<RiderJob[]>([]);
  const [applyingJob, setApplyingJob] = useState<RiderJob | null>(null);
  const [jobAppFullName, setJobAppFullName] = useState(user?.isSandbox ? '' : user?.fullName || '');
  const [jobAppPhone, setJobAppPhone] = useState('');
  const [jobAppEmail, setJobAppEmail] = useState(user && !user.isSandbox && user.email ? user.email : '');
  const [jobAppVehicle, setJobAppVehicle] = useState('Motorbike');
  const [jobAppZone, setJobAppZone] = useState(BANGLADESH_AREAS[0].name);
  const [jobAppNid, setJobAppNid] = useState('');
  const [jobAppNote, setJobAppNote] = useState('');
  const [submittingJobApp, setSubmittingJobApp] = useState(false);
  const [jobAppFeedback, setJobAppFeedback] = useState<string | null>(null);
  const [jobAppError, setJobAppError] = useState<string | null>(null);

  const loadOpenJobs = useCallback(async () => {
    try {
      const res = await apiFetch<{ jobs: RiderJob[] }>('/api/rider-jobs');
      setRiderJobs(res.jobs || []);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    void loadOpenJobs();
  }, [loadOpenJobs]);

  useEffect(() => {
    setShowJobForm(initialOnboarding);
  }, [initialOnboarding]);

  const canAccessRiderApi =
    Boolean(user) &&
    (user!.role === 'rider' || user!.role === 'admin' || user!.role === 'super_admin');

  const [liveDeliveryAlert, setLiveDeliveryAlert] = useState<string | null>(null);
  const availableSnapshotRef = useRef<Map<number, { status: string; paymentStatus?: string }> | null>(
    null
  );
  const assignedSnapshotRef = useRef<Map<number, { status: string; paymentStatus?: string }> | null>(
    null
  );

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (!canAccessRiderApi || showJobForm) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await apiFetch<{
          rider: RiderRecord | null;
          availableOrders: OrderRecord[];
          assignedOrders: OrderRecord[];
          walletSummary?: RiderWalletSummary;
          walletLedger?: RiderWalletLedgerEntry[];
          settlementRules?: DeliveryFinancialConfig['settlementRules'];
          deliveryFinancialConfig?: DeliveryFinancialConfig;
          zoneCoverage?: DhakaZoneCoverageItem[];
        }>('/api/rider/workspace');

        const availChanges = detectOrderBatchChanges(
          availableSnapshotRef.current,
          res.availableOrders
        );
        availableSnapshotRef.current = availChanges.nextMap;

        const assignedChanges = detectOrderBatchChanges(
          assignedSnapshotRef.current,
          res.assignedOrders
        );
        assignedSnapshotRef.current = assignedChanges.nextMap;

        if (availChanges.newOrders.length > 0) {
          const freshReady = availChanges.newOrders[0];
          setLiveDeliveryAlert(
            lang === 'bn'
              ? `নতুন ডেলিভারি অর্ডার এসেছে: ${freshReady.orderNumber} (${freshReady.restaurantName})`
              : `New delivery order available: ${freshReady.orderNumber} (${freshReady.restaurantName})`
          );
          void playOrderAlertChime('new_order', { dedupKey: `order_created_${freshReady.id}` });
        } else if (assignedChanges.newOrders.length > 0) {
          const newlyAssigned = assignedChanges.newOrders[0];
          setLiveDeliveryAlert(
            lang === 'bn'
              ? `নতুন ডেলিভারি অ্যাসাইন হয়েছে: ${newlyAssigned.orderNumber} (${newlyAssigned.restaurantName})`
              : `New delivery assigned to you: ${newlyAssigned.orderNumber} (${newlyAssigned.restaurantName})`
          );
          void playOrderAlertChime('new_order', { dedupKey: `order_created_${newlyAssigned.id}` });
        } else if (assignedChanges.updatedOrders.length > 0) {
          const changed = assignedChanges.updatedOrders[0];
          setLiveDeliveryAlert(
            lang === 'bn'
              ? `অর্ডার আপডেট: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
              : `Order update: ${changed.orderNumber} (${changed.status.replace(/_/g, ' ')})`
          );
          void playOrderAlertChime('status_update', {
            dedupKey: `order_status_${changed.id}_${changed.status}`,
          });
        }

        setRider(res.rider);
        setAvailableOrders(res.availableOrders);
        setAssignedOrders(res.assignedOrders);
        if (res.walletSummary) setWalletSummary(res.walletSummary);
        if (res.walletLedger) setWalletLedger(res.walletLedger);
        if (res.settlementRules) setSettlementRules(res.settlementRules);
        if (res.deliveryFinancialConfig) setDeliveryFinancialConfig(res.deliveryFinancialConfig);
        if (res.zoneCoverage) setZoneCoverage(res.zoneCoverage);
      } catch (err) {
        console.error('Failed to load rider workspace:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canAccessRiderApi, showJobForm, lang]
  );

  useEffect(() => {
    availableSnapshotRef.current = null;
    assignedSnapshotRef.current = null;
    setLiveDeliveryAlert(null);
  }, [user?.uid]);

  useEffect(() => {
    if (!rider) return;
    setProfileFullName(rider.fullName || '');
    setProfilePhone(rider.phone || '');
    setProfileVehicleType(rider.vehicleType || 'Motorbike');
    setProfileZone(rider.zone || BANGLADESH_AREAS[0].name);
    setProfileNidNumber(rider.nidNumber || '');
    setProfileIsAvailable(Boolean(rider.isAvailable));
    setProfileAvatarUrl(rider.avatarUrl || '');
  }, [
    rider?.id,
    rider?.fullName,
    rider?.phone,
    rider?.vehicleType,
    rider?.zone,
    rider?.nidNumber,
    rider?.isAvailable,
    rider?.avatarUrl,
  ]);

  useEffect(() => {
    loadWorkspace(false);
  }, [loadWorkspace]);

  useRealtimeEvents({
    enabled: canAccessRiderApi && !showJobForm,
    token: getAuthToken(),
    pollFallbackMs: 6000,
    onSync: () => loadWorkspace(true),
    onEvent: (ev) => {
      if (ev.type === 'order:created' || ev.type === 'order:updated' || ev.type === 'notification:created') {
        loadWorkspace(true);
      }
    },
  });

  const persistRiderLocation = useCallback(
    async (
      coords: { lat: number; lng: number; isAvailable?: boolean; zone?: string },
      statusNote?: string
    ) => {
      setSyncingLoc(true);
      setActionError(null);
      try {
        const res = await apiFetch<{ rider: RiderRecord }>('/api/rider/location', {
          method: 'PATCH',
          body: JSON.stringify(coords),
        });
        setRider(res.rider);
        if (statusNote) setGpsStatusMsg(statusNote);
      } catch (err: unknown) {
        setGpsStatusMsg(err instanceof Error ? err.message : 'Failed to update rider location');
      } finally {
        setSyncingLoc(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!sharingGps) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusMsg(
        lang === 'bn'
          ? 'এই ব্রাউজারে GPS উপলব্ধ নয় — ম্যাপ বা এলাকা বাটন দিয়ে লোকেশন আপডেট করুন।'
          : 'Browser Geolocation unavailable — tap map or use area quick-sync.'
      );
      setSharingGps(false);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        persistRiderLocation(
          { lat: pos.coords.latitude, lng: pos.coords.longitude, isAvailable: true },
          lang === 'bn' ? 'লাইভ GPS সিঙ্ক হয়েছে' : 'Live browser GPS synced'
        );
      },
      () => {
        setGpsStatusMsg(
          lang === 'bn'
            ? 'GPS অনুমতি পাওয়া যায়নি — ম্যাপ বা এলাকা নির্বাচন করে লোকেশন দিন।'
            : 'GPS permission declined — use the interactive map or area quick-sync.'
        );
        setSharingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [sharingGps, persistRiderLocation, lang]);

  const resolvedApplyZone = zone === '__custom__' ? customZone.trim() : zone;

  const handleRegisterRider = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setRegisterError(null);
    try {
      const targetZone = resolvedApplyZone || 'Bangladesh';
      if (user && !user.isSandbox && user.role !== 'admin' && user.role !== 'super_admin') {
        const res = await apiFetch<{ rider: RiderRecord; token?: string }>('/api/riders/register', {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: (email || user.email).trim(),
            vehicleType,
            zone: targetZone,
            nidNumber: nidNumber.trim(),
            lat: applyCoords.lat,
            lng: applyCoords.lng,
          }),
        });
        if (res.token) setAuthToken(res.token);
        setRider(res.rider);
      } else {
        const res = await apiFetch<{ token: string; rider: RiderRecord }>('/api/riders/apply', {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            password: password.trim() || undefined,
            vehicleType,
            zone: targetZone,
            nidNumber: nidNumber.trim(),
            lat: applyCoords.lat,
            lng: applyCoords.lng,
          }),
        });
        setAuthToken(res.token);
        setRider(res.rider);
      }
      setShowJobForm(false);
      await onRefreshUser();
      await loadWorkspace(false);
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : 'Rider registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleSubmitJobApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingJob) return;
    setSubmittingJobApp(true);
    setJobAppError(null);
    try {
      await apiFetch(`/api/rider-jobs/${applyingJob.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: jobAppFullName.trim(),
          phone: jobAppPhone.trim(),
          email: jobAppEmail.trim(),
          vehicleType: jobAppVehicle.trim() || 'Motorbike',
          zone: jobAppZone.trim() || applyingJob.zone,
          nidNumber: jobAppNid.trim(),
          experienceNote: jobAppNote.trim(),
        }),
      });
      setJobAppFeedback(
        lang === 'bn'
          ? `${applyingJob.restaurantName}-এর রাইডার জবে আপনার আবেদন জমা হয়েছে!`
          : `Application submitted to ${applyingJob.restaurantName}!`
      );
      setApplyingJob(null);
      setJobAppNote('');
    } catch (err: unknown) {
      setJobAppError(err instanceof Error ? err.message : 'Could not submit application');
    } finally {
      setSubmittingJobApp(false);
    }
  };

  const handleAcceptOrder = async (orderId: number) => {
    setAcceptingOrderId(orderId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/api/rider/orders/${orderId}/accept`, { method: 'POST' });
      emitLocalRealtimeSignal('order:updated', { orderId, status: 'rider_assigned' });
      setFocusedActiveOrderId(orderId);
      setActionSuccess(
        lang === 'bn'
          ? 'অর্ডার গ্রহণ করা হয়েছে! রেস্টুরেন্টে গিয়ে পিকআপ কনফার্ম করুন।'
          : 'Order accepted! Head to the vendor for pickup.'
      );
      await loadWorkspace(true);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not accept order');
    } finally {
      setAcceptingOrderId(null);
    }
  };

  const handleUpdateStatus = async (
    orderId: number,
    status: 'picked_up' | 'on_the_way' | 'delivered',
    extra?: {
      pickupRating?: 'good' | 'bad';
      proofPhotoUrl?: string;
      collectedCashAmount?: number;
      note?: string;
    }
  ) => {
    setUpdatingOrderId(orderId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/api/rider/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(extra || {}) }),
      });
      emitLocalRealtimeSignal('order:updated', { orderId, status });
      const label =
        status === 'picked_up'
          ? lang === 'bn'
            ? 'পিকআপ কনফার্ম হয়েছে! এবার কাস্টমারের কাছে ড্রপ-অফ করুন।'
            : 'Pickup confirmed! Head to customer for drop-off.'
          : status === 'on_the_way'
          ? lang === 'bn'
            ? 'কাস্টমারের পথে যাত্রা শুরু হয়েছে।'
            : 'Marked as On The Way to customer.'
          : lang === 'bn'
          ? 'ড্রপ-অফ সম্পন্ন হয়েছে! আয় যুক্ত হয়েছে।'
          : 'Drop-off confirmed! Earnings credited.';
      setActionSuccess(label);
      if (status === 'delivered') {
        setFocusedActiveOrderId(null);
      }
      await loadWorkspace(true);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update delivery status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleUploadProofPhoto = async (orderId: number, file: File) => {
    setUploadingProofOrderId(orderId);
    setActionError(null);
    setProofUploadError(null);
    try {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read photo file.'));
        reader.readAsDataURL(file);
      });

      // Automatically compress/resize large phone camera JPGs so uploads never exceed Vercel/server limits
      let uploadDataUrl = rawDataUrl;
      if (rawDataUrl.startsWith('data:image/') || file.size > 350_000) {
        try {
          uploadDataUrl = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1280;
              const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
              if (scale >= 1 && rawDataUrl.length <= 450_000 && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(rawDataUrl)) {
                resolve(rawDataUrl);
                return;
              }
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round((img.width || 800) * scale));
              canvas.height = Math.max(1, Math.round((img.height || 800) * scale));
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(rawDataUrl);
                return;
              }
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const compressed = canvas.toDataURL('image/jpeg', 0.82);
              resolve(compressed.startsWith('data:image/') ? compressed : rawDataUrl);
            };
            img.onerror = () => resolve(rawDataUrl);
            img.src = rawDataUrl;
          });
        } catch {
          uploadDataUrl = rawDataUrl;
        }
      }

      const res = await apiFetch<{ imageUrl: string }>('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({
          dataUrl: uploadDataUrl,
          filename: file.name || `dropoff-proof-${orderId}.jpg`,
        }),
      });
      setProofPhotoByOrder((prev) => ({ ...prev, [orderId]: res.imageUrl }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Photo upload failed';
      setProofUploadError(msg);
      setActionError(msg);
    } finally {
      setUploadingProofOrderId(null);
    }
  };

  const compressImageFileToDataUrl = async (file: File): Promise<string> => {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read photo file.'));
      reader.readAsDataURL(file);
    });

    if (!rawDataUrl.startsWith('data:image/') && file.size <= 350_000) {
      return rawDataUrl;
    }

    try {
      return await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          if (
            scale >= 1 &&
            rawDataUrl.length <= 450_000 &&
            /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(rawDataUrl)
          ) {
            resolve(rawDataUrl);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((img.width || 800) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 800) * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          resolve(compressed.startsWith('data:image/') ? compressed : rawDataUrl);
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      });
    } catch {
      return rawDataUrl;
    }
  };

  const handleUploadProfileAvatar = async (file: File) => {
    setUploadingAvatar(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    try {
      const uploadDataUrl = await compressImageFileToDataUrl(file);
      const uploaded = await apiFetch<{ imageUrl: string }>('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({
          dataUrl: uploadDataUrl,
          filename: file.name || 'rider-avatar.jpg',
        }),
      });
      setProfileAvatarUrl(uploaded.imageUrl);

      if (rider) {
        const check = sanitizeRiderProfileUpdate({
          fullName: profileFullName || rider.fullName,
          phone: profilePhone || rider.phone,
          vehicleType: profileVehicleType || rider.vehicleType,
          zone: profileZone || rider.zone,
          nidNumber: profileNidNumber,
          isAvailable: profileIsAvailable,
          avatarUrl: uploaded.imageUrl,
        });
        if (check.valid) {
          const saved = await apiFetch<{ rider: RiderRecord }>('/api/rider/profile', {
            method: 'PATCH',
            body: JSON.stringify(check.data),
          });
          setRider(saved.rider);
          await onRefreshUser();
          setProfileSaveSuccess(
            lang === 'bn'
              ? 'প্রোফাইল ছবি আপডেট ও সংরক্ষণ হয়েছে!'
              : 'Profile photo updated and saved!'
          );
        }
      }
    } catch (err: unknown) {
      setProfileSaveError(err instanceof Error ? err.message : 'Profile photo upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveRiderProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    const check = sanitizeRiderProfileUpdate({
      fullName: profileFullName,
      phone: profilePhone,
      vehicleType: profileVehicleType,
      zone: profileZone,
      nidNumber: profileNidNumber,
      isAvailable: profileIsAvailable,
      avatarUrl: profileAvatarUrl,
    });
    if (!check.valid) {
      setProfileSaveError(check.error);
      return;
    }

    setSavingProfile(true);
    try {
      const res = await apiFetch<{ rider: RiderRecord }>('/api/rider/profile', {
        method: 'PATCH',
        body: JSON.stringify(check.data),
      });
      setRider(res.rider);
      await onRefreshUser();
      setProfileSaveSuccess(
        lang === 'bn'
          ? 'রাইডার প্রোফাইল সফলভাবে আপডেট হয়েছে!'
          : 'Rider profile updated successfully!'
      );
    } catch (err: unknown) {
      setProfileSaveError(err instanceof Error ? err.message : 'Could not update rider profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleMoveAlongOrderRoute = async (ord: OrderRecord) => {
    if (!rider) return;
    const toRestaurant =
      ord.status === 'rider_assigned' &&
      typeof ord.restaurantLat === 'number' &&
      typeof ord.restaurantLng === 'number';
    const targetLat = toRestaurant && ord.restaurantLat ? ord.restaurantLat : ord.deliveryLat;
    const targetLng = toRestaurant && ord.restaurantLng ? ord.restaurantLng : ord.deliveryLng;

    const next = advanceRiderAlongRoute(rider.currentLat, rider.currentLng, targetLat, targetLng, 0.35);
    await persistRiderLocation(
      { lat: next.lat, lng: next.lng },
      lang === 'bn'
        ? `রাইডার লোকেশন আপডেট: ${next.lat.toFixed(4)}, ${next.lng.toFixed(4)}`
        : `Moved rider toward ${toRestaurant ? ord.restaurantName : ord.deliveryArea} (${next.lat.toFixed(4)}, ${next.lng.toFixed(4)})`
    );
  };

  const activeDeliveries = useMemo(
    () =>
      assignedOrders.filter(
        (o) => !['delivered', 'cancelled'].includes(o.status)
      ),
    [assignedOrders]
  );

  const pastDeliveries = useMemo(
    () =>
      assignedOrders.filter((o) =>
        ['delivered', 'cancelled'].includes(o.status)
      ),
    [assignedOrders]
  );

  const filteredAvailableOrders = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return availableOrders;
    return availableOrders.filter((o) =>
      [o.orderNumber, o.restaurantName, o.deliveryArea, o.deliveryAddress]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [availableOrders, queueSearch]);

  const filteredHistoryOrders = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return pastDeliveries;
    return pastDeliveries.filter((o) =>
      [o.orderNumber, o.restaurantName, o.deliveryArea, o.customerName, o.status]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [pastDeliveries, historySearch]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="h-24 rounded-2xl bg-white border border-neutral-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white border border-neutral-200 animate-pulse" />
          ))}
        </div>
        <div className="h-56 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-sm text-neutral-500">
          {lang === 'bn' ? 'রাইডার ড্যাশবোর্ড লোড হচ্ছে...' : 'Loading Rider Workspace...'}
        </div>
      </div>
    );
  }

  const primaryActiveOrder = activeDeliveries[0];
  const riderCoords = {
    lat: rider?.currentLat ?? 23.7949,
    lng: rider?.currentLng ?? 90.4043,
  };

  const showOnboardingView = showJobForm || (!rider && !canAccessRiderApi);

  const codCompletedCount = pastDeliveries.filter(
    (o) => o.status === 'delivered' && o.paymentMethod === 'cod'
  ).length;
  const prepaidCompletedCount = pastDeliveries.filter(
    (o) => o.status === 'delivered' && o.paymentMethod !== 'cod'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Top Contextual Breadcrumb & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#E21B70] whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'bn' ? 'মার্কেটপ্লেসে ফিরুন' : 'Back to Storefront'}</span>
        </button>

        {canAccessRiderApi && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                void loadWorkspace(true);
                void loadOpenJobs();
              }}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:border-[#E21B70] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{lang === 'bn' ? 'সিঙ্ক' : 'Sync'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowJobForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#2E3138] hover:border-[#E21B70] whitespace-nowrap shrink-0"
            >
              {showOnboardingView
                ? lang === 'bn'
                  ? 'রাইডার ড্যাশবোর্ড দেখুন'
                  : 'View Rider Dashboard'
                : lang === 'bn'
                ? 'নতুন রাইডার আবেদন'
                : 'Fleet Job Form'}
            </button>
          </div>
        )}
      </div>

      {showOnboardingView ? (
        <div className="space-y-6">
          <form
            onSubmit={handleRegisterRider}
            className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-2xl mx-auto space-y-4"
          >
            <div>
              <p className="text-xs font-semibold text-[#E21B70]">
                {lang === 'bn'
                  ? 'ঢাকা জোন-ভিত্তিক স্বতন্ত্র রাইডার নেটওয়ার্ক · অ্যাডমিন অনুমোদন'
                  : 'Dhaka Zone Independent Rider Network · Admin Approved'}
              </p>
              <h1 className="text-2xl font-bold text-[#2E3138] mt-1">
                {lang === 'bn'
                  ? 'Foodora BD রাইডার নেটওয়ার্কে আবেদন করুন'
                  : 'Join Foodora BD Delivery Fleet — Choose Your Dhaka Zone'}
              </h1>
              <p className="text-xs text-neutral-500 mt-1">
                {lang === 'bn'
                  ? 'আপনার ঢাকার এলাকা বা বাংলাদেশের যেকোনো জোন নির্বাচন করে আবেদন করুন। অ্যাডমিন অনুমোদনের পর সরাসরি ডেলিভারি ও ক্যাশ আয় শুরু হবে।'
                  : 'Select your Dhaka zone or operating area and apply. Once Admin approves your zone application, start accepting orders and earning per delivery.'}
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 font-semibold text-emerald-900">
                  ✓ {lang === 'bn' ? 'কোনো জয়েনিং ফি নেই' : 'No Joining Fee'}
                </div>
                <div className="rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1.5 font-semibold text-purple-900">
                  ✓ {lang === 'bn' ? 'প্রতি ডেলিভারিতে আয়' : 'Earn Per Delivery'}
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 font-semibold text-amber-900">
                  ✓ {lang === 'bn' ? 'কাস্টমার থেকে ক্যাশ' : 'Cash Delivery Fee'}
                </div>
                <div className="rounded-lg bg-pink-50 border border-pink-200 px-2.5 py-1.5 font-semibold text-[#E21B70]">
                  ✓ {lang === 'bn' ? 'স্বচ্ছ কমিশন ওয়ালেট' : 'Transparent Wallet'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                {lang === 'bn'
                  ? 'ঢাকা জোন দ্রুত নির্বাচন করুন (ZONE 01 – ZONE 12)'
                  : 'Quick Select Dhaka Operating Zone (ZONE 01 – ZONE 12)'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DHAKA_ZONE_PRESETS.map((z) => {
                  const zoneValue = z.label;
                  const active =
                    zone.toLowerCase() === zoneValue.toLowerCase() ||
                    zone.toLowerCase().includes(z.name.toLowerCase());
                  const matchedArea = BANGLADESH_AREAS.find((a) =>
                    a.name.toLowerCase().includes(z.name.split('/')[0].trim().toLowerCase())
                  );
                  return (
                    <button
                      key={z.code}
                      type="button"
                      onClick={() => {
                        setZone(zoneValue);
                        setCustomZone('');
                        if (matchedArea) {
                          setApplyCoords({ lat: matchedArea.lat, lng: matchedArea.lng });
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                        active
                          ? 'border-[#E21B70] bg-[#FFF0F6] text-[#E21B70]'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <span className="block font-bold truncate">{z.code}</span>
                      <span className="block text-[10px] opacity-85 truncate">
                        {lang === 'bn' ? z.nameBn : z.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'পুরো নাম' : 'Full Name'}
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'মোবাইল নম্বর' : 'Phone'}
                </label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+88017..."
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'ইমেইল (রাইডার লগইন)' : 'Email Address (Rider Login)'}
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rider@example.com"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'পাসওয়ার্ড (ঐচ্ছিক)' : 'Account Password (Optional)'}
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'যানবাহনের ধরন' : 'Vehicle Type'}
                </label>
                <SelectWithCustom
                  required
                  lang={lang}
                  value={vehicleType}
                  onChange={setVehicleType}
                  storageKey="rider_vehicles"
                  ariaLabel="Rider vehicle type"
                  placeholder={
                    lang === 'bn'
                      ? 'কাস্টম যানবাহন লিখুন (যেমন: E-Cargo Bike)'
                      : 'Custom vehicle (e.g. Cargo Bike / Pickup)'
                  }
                  customOptionLabel={
                    lang === 'bn' ? '+ কাস্টম যানবাহন যোগ...' : '+ Add Custom Vehicle...'
                  }
                  presets={VEHICLE_TYPE_PRESET_OPTIONS.map((v) => ({ value: v, label: v }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {lang === 'bn' ? 'কাজের শহর / এলাকা' : 'Working City / Zone'}
                </label>
                <SelectWithCustom
                  required
                  lang={lang}
                  value={zone === '__custom__' ? customZone : zone}
                  onChange={(val) => {
                    const found = BANGLADESH_AREAS.find((a) => a.name === val);
                    if (found) {
                      setZone(found.name);
                      setCustomZone('');
                    } else {
                      setZone('__custom__');
                      setCustomZone(val);
                    }
                  }}
                  storageKey="bd_areas"
                  ariaLabel="Working city or zone in Bangladesh"
                  placeholder={
                    lang === 'bn'
                      ? 'কাস্টম জেলা/এলাকা লিখুন (যেমন: জিন্দাবাজার, সিলেট)'
                      : 'e.g. Zindabazar, Sylhet or Coxs Bazar Town'
                  }
                  customOptionLabel={
                    lang === 'bn'
                      ? '+ কাস্টম এলাকা যোগ করুন...'
                      : '+ Add Custom Area in Bangladesh...'
                  }
                  presets={getBangladeshAreaSelectPresets(lang)}
                  onSelectPreset={(val) => {
                    const found = BANGLADESH_AREAS.find((a) => a.name === val);
                    if (found) setApplyCoords({ lat: found.lat, lng: found.lng });
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {isBicycleVehicleType(vehicleType)
                  ? lang === 'bn'
                    ? 'জাতীয় পরিচয়পত্র (NID) নম্বর (ঐচ্ছিক)'
                    : 'NID Number (Optional)'
                  : lang === 'bn'
                  ? 'জাতীয় পরিচয়পত্র (NID) / ড্রাইভিং লাইসেন্স নম্বর'
                  : 'NID / Driving License Number'}
              </label>
              <input
                required={!isBicycleVehicleType(vehicleType)}
                value={nidNumber}
                onChange={(e) => setNidNumber(e.target.value)}
                placeholder={
                  isBicycleVehicleType(vehicleType)
                    ? lang === 'bn'
                      ? 'সাইকেলের জন্য ড্রাইভিং লাইসেন্সের দরকার নেই (NID ঐচ্ছিক)'
                      : 'No driving license needed for Bicycle (NID optional)'
                    : '10, 13, or 17 digit NID or License No.'
                }
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
              />
              {isBicycleVehicleType(vehicleType) && (
                <p className="text-[11px] text-emerald-700 mt-1">
                  {lang === 'bn'
                    ? 'সাইকেল রাইডারদের জন্য ড্রাইভিং লাইসেন্স লাগবে না।'
                    : 'Bicycle selected — no driving license required.'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {lang === 'bn'
                  ? 'আপনার শুরুর GPS লোকেশন ম্যাপে পিন করুন'
                  : 'Pin Your Starting GPS Location Anywhere in Bangladesh'}
              </label>
              <DhakaMapPicker
                mapsApiKey={mapsApiKey}
                lang={lang}
                center={applyCoords}
                markerLabel={resolvedApplyZone || 'Rider Start Pin'}
                pinType="user"
                userName={fullName || user?.fullName}
                interactive
                heightClass="h-[200px]"
                onSelectLocation={(loc) => {
                  setApplyCoords({ lat: loc.lat, lng: loc.lng });
                  if (loc.areaName && loc.areaName !== 'Current GPS') {
                    const preset = BANGLADESH_AREAS.find((a) => a.name === loc.areaName);
                    if (preset) {
                      setZone(preset.name);
                    } else {
                      setZone('__custom__');
                      setCustomZone(loc.areaName);
                    }
                  }
                }}
              />
            </div>

            {registerError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {registerError}
              </div>
            )}

            <button
              type="submit"
              disabled={registering}
              className="w-full py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-semibold disabled:opacity-50"
            >
              {registering
                ? lang === 'bn'
                  ? 'আবেদন জমা হচ্ছে...'
                  : 'Submitting Application...'
                : lang === 'bn'
                ? 'রাইডার আবেদন জমা দিন (অ্যাডমিন অনুমোদন)'
                : 'Submit Rider Application (Admin Review)'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Live Delivery Alert Banner */}
          {liveDeliveryAlert && (
            <div
              role="status"
              className="rounded-xl bg-[#FFF0F6] border border-[#E21B70]/30 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 text-xs font-semibold text-[#2E3138]">
                <Bell className="w-4 h-4 text-[#E21B70] shrink-0" />
                <span>{liveDeliveryAlert}</span>
              </div>
              <button
                type="button"
                onClick={() => setLiveDeliveryAlert(null)}
                aria-label="Dismiss delivery alert"
                className="p-1 rounded hover:bg-white text-neutral-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action Feedback / Errors */}
          {(actionError || actionSuccess) && (
            <div
              className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-3 border ${
                actionError
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{actionError || actionSuccess}</span>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setActionSuccess(null);
                }}
                aria-label="Dismiss message"
                className="p-1 rounded hover:bg-white/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Rider Hub Identity & Instant Duty Switch Header */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                aria-label="Open rider profile"
                className="w-12 h-12 rounded-xl bg-[#FFF0F6] text-[#E21B70] flex items-center justify-center shrink-0 overflow-hidden border border-[#E21B70]/20 hover:border-[#E21B70] transition-colors"
              >
                {rider?.avatarUrl ? (
                  <img
                    src={rider.avatarUrl}
                    alt={rider.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bike className="w-6 h-6" />
                )}
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-[#2E3138]">
                    {rider?.fullName || user?.fullName || (lang === 'bn' ? 'রাইডার হাব' : 'Rider Hub')}
                  </h1>
                  {rider && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                      <ShieldCheck className="w-3 h-3" />
                      <span>
                        {rider.status === 'approved'
                          ? lang === 'bn'
                            ? 'ভেরিফায়েড'
                            : 'Verified'
                          : rider.status}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 mt-0.5">
                  <span
                    className={`font-semibold ${
                      rider?.isAvailable ? 'text-emerald-700' : 'text-neutral-600'
                    }`}
                  >
                    {rider?.isAvailable
                      ? lang === 'bn'
                        ? 'অনলাইন (সক্রিয়)'
                        : 'Online'
                      : lang === 'bn'
                      ? 'অফলাইন'
                      : 'Offline'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{rider?.vehicleType || 'Motorbike'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rider?.zone || 'Bangladesh'}</span>
                  {rider?.phone && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{rider.phone}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {riderCoords.lat.toFixed(4)}, {riderCoords.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {rider && (
                <button
                  type="button"
                  disabled={syncingLoc || rider.status !== 'approved'}
                  onClick={() =>
                    persistRiderLocation(
                      {
                        lat: rider.currentLat,
                        lng: rider.currentLng,
                        isAvailable: !rider.isAvailable,
                      },
                      !rider.isAvailable
                        ? lang === 'bn'
                          ? 'আপনি এখন অনলাইন — নতুন ডেলিভারি গ্রহণ করতে পারবেন।'
                          : 'You are now Online and visible for dispatch.'
                        : lang === 'bn'
                        ? 'আপনি এখন অফলাইন আছেন।'
                        : 'You are now Offline.'
                    )
                  }
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    rider.isAvailable
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-[#2E3138] text-white border-[#2E3138] hover:bg-black'
                  }`}
                >
                  {rider.isAvailable
                    ? lang === 'bn'
                      ? 'অনলাইন আছেন · অফলাইন করুন'
                      : 'Online · Go Offline'
                    : lang === 'bn'
                    ? 'অফলাইন · অনলাইন করুন'
                    : 'Offline · Go Online'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSharingGps((v) => !v)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  sharingGps
                    ? 'bg-[#FFF0F6] text-[#E21B70] border-[#E21B70]/40'
                    : 'bg-white text-[#2E3138] border-neutral-200 hover:border-[#E21B70]'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>
                  {sharingGps
                    ? lang === 'bn'
                      ? 'GPS চালু · বন্ধ করুন'
                      : 'Live GPS On · Stop'
                    : lang === 'bn'
                    ? 'লাইভ GPS চালু করুন'
                    : 'Start Live GPS'}
                </span>
              </button>
              {rider && (
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeTab === 'profile'
                      ? 'bg-[#E21B70] text-white border-[#E21B70]'
                      : 'bg-white text-[#2E3138] border-neutral-200 hover:border-[#E21B70]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'প্রোফাইল' : 'Profile'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Pending Approval / Suspended / Outstanding Commission Gate Banner */}
          {rider && (() => {
            const riderGate = canRiderAcceptOrders({
              riderStatus: rider.status,
              outstandingCommission: walletSummary.outstandingCommission,
              settlementRules,
            });
            if (riderGate.allowed) return null;
            const isPending = rider.status === 'pending';
            const isSuspended = rider.status === 'suspended';
            return (
              <div
                data-testid="rider-dispatch-gate-banner"
                className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
                  isSuspended
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="space-y-1">
                  <p className="text-sm font-bold">
                    {isPending
                      ? lang === 'bn'
                        ? `অ্যাডমিন অনুমোদনের অপেক্ষায় · জোন: ${rider.zone}`
                        : `Application Pending Admin Approval — Zone: ${rider.zone}`
                      : isSuspended
                      ? lang === 'bn'
                        ? 'আপনার রাইডার অ্যাকাউন্ট স্থগিত আছে'
                        : 'Rider Account Suspended'
                      : lang === 'bn'
                      ? 'বকেয়া কমিশন সীমা অতিক্রম করেছে'
                      : 'Commission Settlement Required Before Next Dispatch'}
                  </p>
                  <p className="text-xs opacity-90">{riderGate.reason}</p>
                </div>
                {!isPending && !isSuspended && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('earnings')}
                    className="px-3.5 py-2 rounded-lg bg-[#2E3138] text-white text-xs font-bold shrink-0"
                  >
                    {lang === 'bn' ? 'ওয়ালেট ও কমিশন দেখুন' : 'View Commission Wallet'}
                  </button>
                )}
              </div>
            );
          })()}

          {/* 4-Column Tabular KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">
                {lang === 'bn' ? 'চলমান ডেলিভারি' : 'Active Deliveries'}
              </p>
              <p className="text-2xl font-bold text-[#E21B70] mt-1 font-mono">
                {activeDeliveries.length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">
                {lang === 'bn' ? 'উন্মুক্ত অর্ডার কিউ' : 'Open Dispatch Queue'}
              </p>
              <p className="text-2xl font-bold text-[#2E3138] mt-1 font-mono">
                {availableOrders.length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">
                {lang === 'bn' ? 'সম্পন্ন ডেলিভারি' : 'Completed Deliveries'}
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
                {rider?.totalDeliveries ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">
                {lang === 'bn' ? 'মোট আয়' : 'Total Earnings'}
              </p>
              <p className="text-2xl font-bold text-[#2E3138] mt-1 font-mono">
                {formatBdt(rider?.totalEarnings ?? 0, lang)}
              </p>
            </div>
          </div>

          {/* Workspace Segmented Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-neutral-100 rounded-xl border border-neutral-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'dispatch'
                  ? 'bg-white text-[#2E3138] shadow-xs'
                  : 'text-neutral-600 hover:text-[#2E3138]'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-[#E21B70]" />
              <span>
                {lang === 'bn' ? 'অর্ডার ও ডিসপ্যাচ' : 'Active & Dispatch'} (
                {activeDeliveries.length + availableOrders.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'map'
                  ? 'bg-white text-[#2E3138] shadow-xs'
                  : 'text-neutral-600 hover:text-[#2E3138]'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5 text-[#E21B70]" />
              <span>{lang === 'bn' ? 'লাইভ GPS ও ম্যাপ' : 'Live GPS & Map'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('earnings')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'earnings'
                  ? 'bg-white text-[#2E3138] shadow-xs'
                  : 'text-neutral-600 hover:text-[#2E3138]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-[#E21B70]" />
              <span>
                {lang === 'bn' ? 'হিস্ট্রি ও আয়' : 'History & Earnings'} ({pastDeliveries.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('jobs')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'jobs'
                  ? 'bg-white text-[#2E3138] shadow-xs'
                  : 'text-neutral-600 hover:text-[#2E3138]'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-[#E21B70]" />
              <span>
                {lang === 'bn' ? 'রাইডার জব বোর্ড' : 'Rider Jobs'} ({riderJobs.length})
              </span>
            </button>
            {rider && (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'profile'
                    ? 'bg-white text-[#2E3138] shadow-xs'
                    : 'text-neutral-600 hover:text-[#2E3138]'
                }`}
              >
                <User className="w-3.5 h-3.5 text-[#E21B70]" />
                <span>{lang === 'bn' ? 'রাইডার প্রোফাইল' : 'Rider Profile'}</span>
              </button>
            )}
          </div>

          {/* ---------------- TAB 1: DELIVERY WORKSPACE (MAP + BOTTOM SHEET LIKE REFERENCE) ---------------- */}
          {activeTab === 'dispatch' && (() => {
            const sheetBn = translateSheet ? lang !== 'bn' : lang === 'bn';
            const queuedOffersPool = filteredAvailableOrders.filter(
              (o) => !declinedOfferIds.includes(o.id)
            );
            const activeOfferList =
              queuedOffersPool.length > 0 ? queuedOffersPool : filteredAvailableOrders;
            const currentOffer =
              activeOfferList.length > 0
                ? activeOfferList[focusedOfferIdx % activeOfferList.length]
                : null;
            const focusedActive =
              activeDeliveries.find((o) => o.id === focusedActiveOrderId) ||
              activeDeliveries[0] ||
              null;

            // Display active order if assigned (unless previewing an incoming queue offer), otherwise show Offer screen
            const sheetMode: 'active' | 'offer' | 'empty' =
              focusedActive && !(previewOfferMode && currentOffer)
                ? 'active'
                : currentOffer
                ? 'offer'
                : 'empty';
            const displayOrder = sheetMode === 'active' ? focusedActive : currentOffer;

            const vendorCoords =
              displayOrder &&
              typeof displayOrder.restaurantLat === 'number' &&
              typeof displayOrder.restaurantLng === 'number'
                ? { lat: displayOrder.restaurantLat, lng: displayOrder.restaurantLng }
                : riderCoords;

            const customerCoords = displayOrder
              ? { lat: displayOrder.deliveryLat, lng: displayOrder.deliveryLng }
              : riderCoords;

            const isDropoffStage =
              sheetMode === 'active' &&
              (displayOrder?.status === 'picked_up' || displayOrder?.status === 'on_the_way');
            const isPickupStage =
              sheetMode === 'active' &&
              Boolean(displayOrder) &&
              !isDropoffStage &&
              !['delivered', 'cancelled'].includes(displayOrder!.status);

            const pickupEtaMin = displayOrder
              ? calculateRiderLegEtaMin(
                  riderCoords.lat,
                  riderCoords.lng,
                  vendorCoords.lat,
                  vendorCoords.lng,
                  2
                )
              : 5;
            const dropoffEtaMin = displayOrder
              ? calculateRiderLegEtaMin(
                  isPickupStage ? vendorCoords.lat : riderCoords.lat,
                  isPickupStage ? vendorCoords.lng : riderCoords.lng,
                  customerCoords.lat,
                  customerCoords.lng,
                  2
                )
              : 18;

            const activeTargetCoords = isPickupStage ? vendorCoords : customerCoords;
            const activeLegDistanceKm = displayOrder
              ? Math.round(
                  haversineDistanceKm(
                    riderCoords.lat,
                    riderCoords.lng,
                    activeTargetCoords.lat,
                    activeTargetCoords.lng
                  ) * 100
                ) / 100
              : null;
            const activeLegEtaMin = displayOrder
              ? isPickupStage
                ? pickupEtaMin
                : dropoffEtaMin
              : null;

            const navigateUrl = displayOrder
              ? isPickupStage
                ? `https://www.google.com/maps/dir/?api=1&destination=${vendorCoords.lat},${vendorCoords.lng}`
                : `https://www.google.com/maps/dir/?api=1&destination=${customerCoords.lat},${customerCoords.lng}`
              : '';

            const shortCode = displayOrder
              ? formatRiderShortOrderCode(displayOrder.orderNumber, displayOrder.id)
              : '0000';
            const itemsList = displayOrder?.itemsSnapshotJson || [];
            const editedCash = displayOrder
              ? cashCollectOverrideByOrder[displayOrder.id]
              : undefined;
            const cashInfo = displayOrder
              ? resolveRiderCashCollectAmount(
                  displayOrder.paymentMethod,
                  displayOrder.totalAmount,
                  editedCash,
                  {
                    paymentSplitMode: displayOrder.paymentSplitMode,
                    cashDueToRider: displayOrder.cashDueToRider,
                  }
                )
              : null;
            const riderAcceptGate =
              user?.role === 'admin' || user?.role === 'super_admin'
                ? { allowed: true }
                : canRiderAcceptOrders({
                    riderStatus: rider?.status || 'pending',
                    outstandingCommission: walletSummary.outstandingCommission,
                    settlementRules,
                  });
            const displayOrderFinancials = displayOrder
              ? calculateSplitOrderFinancials({
                  subtotal: displayOrder.subtotal,
                  discountAmount: displayOrder.discountAmount,
                  deliveryFee: displayOrder.deliveryFee,
                  serviceFee: displayOrder.serviceFee,
                  taxAmount: displayOrder.taxAmount,
                  commissionType: 'percentage',
                  commissionRate: 15,
                  fixedCommission: 0,
                  paymentMethod: displayOrder.paymentMethod,
                  riderEarningRule: deliveryFinancialConfig.riderEarningRule,
                })
              : null;
            const offerRiderEarning =
              displayOrder?.riderEarningAmount ??
              displayOrderFinancials?.riderEarningAmount ??
              0;
            const offerFoodoraCommission =
              displayOrder?.foodoraDeliveryCommission ??
              displayOrderFinancials?.foodoraDeliveryCommission ??
              0;
            const offerCashCollect = cashInfo?.amountToCollect ?? displayOrder?.deliveryFee ?? 0;
            const uploadedProof = displayOrder ? proofPhotoByOrder[displayOrder.id] : undefined;
            const pickupRating = displayOrder ? pickupRatingByOrder[displayOrder.id] : undefined;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Main Reference Rider Map + Overlapping Bottom Sheet */}
                <div
                  ref={riderSheetRef}
                  className="lg:col-span-7 xl:col-span-6 w-full max-w-[460px] mx-auto lg:max-w-none bg-white rounded-[24px] border border-neutral-200 shadow-lg overflow-hidden scroll-mt-24"
                >
                  {/* Top Interactive Route Map */}
                  <div className="relative">
                    <DhakaMapPicker
                      mapsApiKey={mapsApiKey}
                      lang={lang}
                      center={
                        sheetMode === 'offer' || isDropoffStage ? customerCoords : vendorCoords
                      }
                      markerLabel={
                        displayOrder
                          ? sheetMode === 'offer' || isDropoffStage
                            ? `${displayOrder.customerName} (${displayOrder.deliveryArea})`
                            : displayOrder.restaurantName
                          : rider?.fullName || 'Rider GPS'
                      }
                      pinType={isPickupStage ? 'vendor' : 'user'}
                      userName={
                        displayOrder
                          ? isDropoffStage || sheetMode === 'offer'
                            ? displayOrder.customerName
                            : undefined
                          : rider?.fullName
                      }
                      restaurantName={displayOrder?.restaurantName}
                      secondaryPoint={
                        displayOrder && (sheetMode === 'offer' || isPickupStage)
                          ? {
                              lat: vendorCoords.lat,
                              lng: vendorCoords.lng,
                              label: displayOrder.restaurantName,
                            }
                          : undefined
                      }
                      riderPoint={{
                        lat: riderCoords.lat,
                        lng: riderCoords.lng,
                        label: rider?.fullName || 'You',
                      }}
                      riderTarget={isPickupStage ? vendorCoords : customerCoords}
                      riderVehicleType={rider?.vehicleType}
                      liveDistanceKm={activeLegDistanceKm}
                      liveEtaMinutes={activeLegEtaMin}
                      trackingStatus={displayOrder?.status}
                      showTraffic
                      showDirectionsSummary
                      onRouteSummary={setLiveRouteSummary}
                      telemetryBadgeClassName="absolute top-14 left-3"
                      heightClass="h-[250px] sm:h-[280px] !rounded-none !border-0"
                    />

                    {/* Top Floating Map Actions (Refresh / Decline / Support) */}
                    <div className="pointer-events-none absolute top-3 left-3 right-3 z-[450] flex items-center justify-between gap-2">
                      {sheetMode === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void loadWorkspace(true)}
                          aria-label="Refresh delivery state"
                          className="pointer-events-auto w-10 h-10 rounded-full bg-white text-[#E21B70] shadow-md border border-neutral-200/70 flex items-center justify-center hover:bg-[#FFF0F6]"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                      ) : (
                        <span className="pointer-events-auto px-3 py-1.5 rounded-full bg-white/95 text-[#2E3138] text-[11px] font-bold shadow-sm border border-neutral-200/80">
                          {sheetBn ? 'নতুন ডেলিভারি অফার' : 'Incoming Delivery Offer'}
                        </span>
                      )}

                      {sheetMode === 'offer' && displayOrder ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeclinedOfferIds((prev) =>
                              prev.includes(displayOrder.id) ? prev : [...prev, displayOrder.id]
                            );
                            setFocusedOfferIdx((i) => i + 1);
                            if (focusedActive) setPreviewOfferMode(false);
                          }}
                          className="pointer-events-auto px-4 py-1.5 rounded-full bg-white text-[#E21B70] text-xs font-bold shadow-md border border-neutral-200/80 hover:bg-[#FFF0F6]"
                        >
                          {sheetBn ? 'বাতিল (Decline)' : 'Decline'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab('map')}
                          aria-label="Open full rider GPS map"
                          className="pointer-events-auto w-10 h-10 rounded-full bg-white text-[#E21B70] shadow-md border border-neutral-200/70 flex items-center justify-center hover:bg-[#FFF0F6]"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Floating Pink Navigate Pill Button (on Active Pickup / Drop-off screens) */}
                    {sheetMode === 'active' && displayOrder && (
                      <div className="pointer-events-none absolute bottom-6 left-3 right-3 z-[450] flex items-center justify-between gap-2">
                        <a
                          href={navigateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pointer-events-auto px-4 py-2 rounded-full bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold shadow-lg inline-flex items-center gap-1.5"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>{sheetBn ? 'নেভিগেট' : 'Navigate'}</span>
                        </a>
                        {rider && (
                          <button
                            type="button"
                            disabled={syncingLoc}
                            onClick={() => handleMoveAlongOrderRoute(displayOrder)}
                            className="pointer-events-auto px-3 py-1.5 rounded-full bg-white/95 border border-neutral-200 text-[#2E3138] hover:border-[#E21B70] text-[11px] font-bold shadow-md inline-flex items-center gap-1"
                          >
                            <LocateFixed className="w-3 h-3 text-[#E21B70]" />
                            <span>{sheetBn ? 'রুটে এগোন' : 'Move Along Route'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Overlapping Rounded-Top White Bottom Sheet */}
                  <div className="relative z-10 -mt-4 rounded-t-[24px] bg-white pt-2.5 px-5 pb-5 space-y-4 border-t border-neutral-100">
                    <div className="w-10 h-1 rounded-full bg-neutral-300 mx-auto" />

                    {/* -------- STATE 0: NO ACTIVE OR QUEUED ORDERS -------- */}
                    {sheetMode === 'empty' && (
                      <div className="py-8 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#FFF0F6] text-[#E21B70] mx-auto flex items-center justify-center">
                          <Bike className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-[#2E3138]">
                            {sheetBn
                              ? 'নতুন ডেলিভারি অর্ডারের জন্য অপেক্ষা চলছে'
                              : 'Waiting for incoming deliveries'}
                          </h2>
                          <p className="text-xs text-neutral-500 mt-1">
                            {sheetBn
                              ? 'অনলাইন থাকলে নতুন রেস্টুরেন্ট অর্ডার সাথে সাথে এখানে চলে আসবে।'
                              : 'Stay Online — new orders will pop up right here with payout & route ETA.'}
                          </p>
                        </div>
                        {rider && !rider.isAvailable && (
                          <button
                            type="button"
                            onClick={() =>
                              persistRiderLocation({
                                lat: rider.currentLat,
                                lng: rider.currentLng,
                                isAvailable: true,
                              })
                            }
                            className="px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold"
                          >
                            {sheetBn ? 'এখনই অনলাইন হোন' : 'Go Online Now'}
                          </button>
                        )}
                        {declinedOfferIds.length > 0 && availableOrders.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDeclinedOfferIds([])}
                            className="block mx-auto text-xs font-bold text-[#E21B70] hover:underline"
                          >
                            {sheetBn ? 'বাদ দেওয়া অর্ডার পুনরায় দেখুন' : 'Show declined offers again'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* -------- STATE 1: INCOMING OFFER SHEET (Screenshot_1 & Screenshot_11) -------- */}
                    {sheetMode === 'offer' && displayOrder && (
                      <div className="space-y-4">
                        <div className="text-center pt-1 pb-3 border-b border-neutral-100 space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            {sheetBn ? 'আপনার রাইডার আয়' : 'Your Rider Earning'}
                          </p>
                          <p className="text-3xl font-extrabold text-[#16A34A] tabular-nums tracking-tight">
                            +{formatBdt(offerRiderEarning, lang)}
                          </p>
                          <p className="text-[11px] font-semibold text-neutral-500">
                            {displayOrder.orderNumber} ·{' '}
                            {displayOrder.paymentMethod === 'cod'
                              ? `COD (${formatBdt(displayOrder.totalAmount, lang)})`
                              : displayOrder.paymentStatus === 'paid'
                              ? sheetBn
                                ? 'খাবারের দাম অনলাইনে পরিশোধিত'
                                : 'Food Paid Online'
                              : sheetBn
                              ? 'অনলাইন পেমেন্ট বাকি'
                              : 'Prepaid Verification Pending'}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] tabular-nums">
                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-amber-900">
                              <span className="block text-[10px] opacity-80">
                                {sheetBn ? 'ক্যাশ সংগ্রহ' : 'Collect Cash'}
                              </span>
                              <span className="font-bold">{formatBdt(offerCashCollect, lang)}</span>
                            </div>
                            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-900">
                              <span className="block text-[10px] opacity-80">
                                {sheetBn ? 'আপনার আয়' : 'Rider Share'}
                              </span>
                              <span className="font-bold">{formatBdt(offerRiderEarning, lang)}</span>
                            </div>
                            <div className="rounded-lg bg-purple-50 border border-purple-200 px-2 py-1 text-purple-900">
                              <span className="block text-[10px] opacity-80">
                                {sheetBn ? 'Foodora কমিশন' : 'Foodora Fee'}
                              </span>
                              <span className="font-bold">{formatBdt(offerFoodoraCommission, lang)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 text-xs">
                          {/* Store Pickup Stop */}
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div className="w-6 h-6 rounded-md bg-neutral-100 text-[#2E3138] flex items-center justify-center">
                                <Store className="w-3.5 h-3.5" />
                              </div>
                              <div className="w-0.5 h-10 bg-neutral-300 my-1" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm text-[#2E3138] truncate">
                                  {displayOrder.restaurantName}
                                </p>
                                <span className="font-semibold text-neutral-600 tabular-nums shrink-0">
                                  {pickupEtaMin}min
                                </span>
                              </div>
                              <p className="text-neutral-500 mt-0.5 leading-snug">
                                {displayOrder.restaurantAddress || `${displayOrder.deliveryArea}, Dhaka`}
                              </p>
                              <p className="text-neutral-500 mt-0.5">
                                Company: {displayOrder.restaurantName}
                              </p>
                            </div>
                          </div>

                          {/* Customer Drop-off Stop */}
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-neutral-100 text-[#2E3138] flex items-center justify-center shrink-0 mt-0.5">
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm text-[#2E3138]">
                                  {sheetBn ? 'ড্রপ-অফ' : 'Drop-off'}
                                </p>
                                <span className="font-semibold text-neutral-600 tabular-nums shrink-0">
                                  {dropoffEtaMin}min
                                </span>
                              </div>
                              <p className="text-neutral-500 mt-0.5 leading-snug">
                                {displayOrder.deliveryArea} — {displayOrder.deliveryAddress}
                              </p>
                              <p className="text-neutral-500 mt-0.5">
                                Customer: {displayOrder.customerName}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-1 border-t-2 border-amber-500 space-y-2">
                          {!riderAcceptGate.allowed && (
                            <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                              {riderAcceptGate.reason}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={
                              acceptingOrderId === displayOrder.id ||
                              !riderAcceptGate.allowed ||
                              (displayOrder.paymentMethod !== 'cod' &&
                                displayOrder.paymentStatus !== 'paid')
                            }
                            onClick={() => {
                              setPreviewOfferMode(false);
                              void handleAcceptOrder(displayOrder.id);
                            }}
                            className="w-full py-3.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-sm font-bold shadow-md disabled:opacity-50"
                          >
                            {acceptingOrderId === displayOrder.id
                              ? sheetBn
                                ? 'গ্রহণ করা হচ্ছে...'
                                : 'Accepting order...'
                              : sheetBn
                              ? 'অর্ডার গ্রহণ করুন'
                              : 'Accept order'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* -------- STATE 2: GO TO VENDOR / PICKUP SHEET (Screenshots 2, 3, 4) -------- */}
                    {isPickupStage && displayOrder && (
                      <div className="space-y-4">
                        {/* Vendor Header + Call Button */}
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-100">
                          <div className="min-w-0">
                            <h2 className="text-lg font-bold text-[#2E3138] truncate">
                              {displayOrder.restaurantName}
                            </h2>
                            <p className="text-xs font-semibold text-[#2E3138] mt-0.5 tabular-nums">
                              {sheetBn
                                ? `ভেন্ডরের দিকে যান • ${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm) !== null ? `${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm)!.toFixed(1)} কিমি • ` : ''}${formatDurationEstimate(liveRouteSummary?.etaMinutes ?? pickupEtaMin, 'bn')}ে পৌঁছাবেন`
                                : `Go to vendor • ${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm) !== null ? `${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm)!.toFixed(1)} km • ` : ''}Arrive in ${formatDurationEstimate(liveRouteSummary?.etaMinutes ?? pickupEtaMin, 'en', 'compact')}`}
                            </p>
                            {liveRouteSummary && (
                              <button
                                type="button"
                                onClick={() => setSheetStepsOpen((v) => !v)}
                                className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1A73E8] hover:underline"
                              >
                                <span>
                                  {sheetBn
                                    ? `${liveRouteSummary.trafficLabelBn} · ${liveRouteSummary.steps.length} ধাপ`
                                    : `${liveRouteSummary.trafficLabelEn} · ${liveRouteSummary.steps.length} turns`}
                                </span>
                                {sheetStepsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {sheetBn ? '১টি অর্ডার পিকআপের জন্য' : '1 order for pickup'}
                            </p>
                          </div>
                          <a
                            href={`tel:${displayOrder.restaurantPhone || displayOrder.customerPhone}`}
                            aria-label="Call restaurant vendor"
                            className="w-10 h-10 rounded-full border border-neutral-200 text-[#E21B70] hover:bg-[#FFF0F6] flex items-center justify-center shrink-0"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        </div>

                        {/* Address */}
                        <div className="flex items-start gap-2.5 text-xs text-neutral-600 pb-3 border-b border-neutral-100">
                          <MapPin className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                          <div>
                            <p>{displayOrder.restaurantAddress || `${displayOrder.deliveryArea}, Dhaka`}</p>
                            <p className="text-neutral-500 mt-0.5">
                              Company: {displayOrder.restaurantName}
                            </p>
                          </div>
                        </div>

                        {sheetStepsOpen && liveRouteSummary && liveRouteSummary.steps.length > 0 && (
                          <ol className="max-h-32 overflow-y-auto space-y-1 rounded-xl bg-neutral-50 border border-neutral-200 p-2.5 text-[11px]">
                            {liveRouteSummary.steps.map((st, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-2 text-neutral-700">
                                <span className="truncate">
                                  <strong>{idx + 1}.</strong> {st.instruction}
                                </span>
                                {st.distanceMeters > 0 && (
                                  <span className="text-[10px] font-semibold text-neutral-500 shrink-0">
                                    {formatDirectionStepDistance(st.distanceMeters, sheetBn ? 'bn' : 'en')}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}

                        {/* Ready Status Pill & Order Code */}
                        <div className="space-y-2">
                          <span className="inline-block px-3 py-1 rounded-md bg-[#6B7280] text-white text-[11px] font-semibold">
                            {sheetBn ? 'প্রায় ২ মিনিটে প্রস্তুত হবে' : 'Ready in around 2 min'}
                          </span>
                          <p className="text-2xl font-extrabold text-[#2E3138] tracking-tight tabular-nums">
                            #{shortCode}
                          </p>
                          <p className="text-xs font-bold text-[#2E3138]">
                            {displayOrder.orderNumber} (#{shortCode}) • {displayOrder.customerName}
                          </p>

                          <div className="flex items-center justify-between pt-1 text-xs">
                            <span className="text-neutral-500">
                              {sheetBn ? 'শিঘ্রই প্রস্তুত হবে' : 'Will be ready soon'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setItemsExpanded((v) => !v)}
                              className="font-bold text-[#E21B70] inline-flex items-center gap-1"
                            >
                              <span>
                                {itemsList.length} {sheetBn ? 'আইটেম' : 'items'}
                              </span>
                              {itemsExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {itemsExpanded && (
                            <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-1">
                              {itemsList.map((it, idx) => (
                                <div
                                  key={`${it.foodItemId}-${idx}`}
                                  className="py-2 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-bold text-[#2E3138] tabular-nums">
                                      {it.quantity}
                                    </span>
                                    <span className="text-neutral-700 truncate">
                                      {it.name}
                                      {it.variation ? ` - ${it.variation}` : ''}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-neutral-600 tabular-nums shrink-0">
                                    {it.lineTotal.toFixed(2)} Tk
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs pt-1 text-neutral-600">
                            <div>
                              <p className="text-[11px] text-neutral-400">
                                {sheetBn ? 'পেমেন্ট' : 'Payment'}
                              </p>
                              <p className="font-semibold text-[#2E3138]">
                                {sheetBn ? 'ভেন্ডরকে পেমেন্ট নেই' : 'No payment at vendor'}
                              </p>
                            </div>
                            <span className="text-neutral-500">
                              {sheetBn ? 'ভেন্ডরকে পেমেন্ট নেই' : 'No payment at vendor'}
                            </span>
                          </div>
                        </div>

                        {/* How is the pick up experience? Feedback Box (Screenshot_2 & Screenshot_3) */}
                        <div className="rounded-xl border border-neutral-200 p-3.5 text-center space-y-2.5">
                          <p className="text-xs font-semibold text-neutral-700">
                            {sheetBn
                              ? 'পিকআপ অভিজ্ঞতা কেমন ছিল?'
                              : 'How is the pick up experience?'}
                          </p>
                          <div className="flex items-center justify-center gap-6">
                            <button
                              type="button"
                              aria-label="Bad pickup experience"
                              onClick={() =>
                                setPickupRatingByOrder((prev) => ({
                                  ...prev,
                                  [displayOrder.id]: 'bad',
                                }))
                              }
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                pickupRating === 'bad'
                                  ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
                                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                              }`}
                            >
                              <Frown className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Good pickup experience"
                              onClick={() =>
                                setPickupRatingByOrder((prev) => ({
                                  ...prev,
                                  [displayOrder.id]: 'good',
                                }))
                              }
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                pickupRating === 'good'
                                  ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500'
                                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                              }`}
                            >
                              <Smile className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* Primary Pink Confirm Pickup Button */}
                        <button
                          type="button"
                          disabled={updatingOrderId === displayOrder.id}
                          onClick={() => setPickupConfirmOrder(displayOrder)}
                          className="w-full py-3.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-sm font-bold shadow-md disabled:opacity-50"
                        >
                          {updatingOrderId === displayOrder.id
                            ? sheetBn
                              ? 'কনফার্ম হচ্ছে...'
                              : 'Confirming...'
                            : sheetBn
                            ? 'পিকআপ কনফার্ম করুন'
                            : 'Confirm pickup'}
                        </button>
                      </div>
                    )}

                    {/* -------- STATE 3: GO TO CUSTOMER / DROP-OFF SHEET (Screenshots 5, 6, 7) -------- */}
                    {isDropoffStage && displayOrder && cashInfo && (
                      <div className="space-y-4">
                        {/* Customer Header + Call + Translate */}
                        <div className="space-y-2 pb-3 border-b border-neutral-100">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="text-lg font-bold text-[#2E3138] truncate">
                                {displayOrder.customerName}
                              </h2>
                              <p className="text-xs font-semibold text-[#2E3138] mt-0.5 tabular-nums">
                                {sheetBn
                                  ? `ড্রপ-অফ • ${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm) !== null ? `${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm)!.toFixed(1)} কিমি • ` : ''}${formatDurationEstimate(liveRouteSummary?.etaMinutes ?? dropoffEtaMin, 'bn')}ে পৌঁছাবেন`
                                  : `Drop-off • ${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm) !== null ? `${(liveRouteSummary?.distanceKm ?? activeLegDistanceKm)!.toFixed(1)} km • ` : ''}Arrive in ${formatDurationEstimate(liveRouteSummary?.etaMinutes ?? dropoffEtaMin, 'en', 'compact')}`}
                              </p>
                              {liveRouteSummary && (
                                <button
                                  type="button"
                                  onClick={() => setSheetStepsOpen((v) => !v)}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#1A73E8] hover:underline"
                                >
                                  <span>
                                    {sheetBn
                                      ? `${liveRouteSummary.trafficLabelBn} · ${liveRouteSummary.steps.length} ধাপ`
                                      : `${liveRouteSummary.trafficLabelEn} · ${liveRouteSummary.steps.length} turns`}
                                  </span>
                                  {sheetStepsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                              <p className="text-xs text-neutral-500 mt-0.5">
                                #{shortCode} • {displayOrder.orderNumber}
                              </p>
                            </div>
                            <a
                              href={`tel:${displayOrder.customerPhone}`}
                              aria-label="Call customer"
                              className="w-10 h-10 rounded-full border border-neutral-200 text-[#E21B70] hover:bg-[#FFF0F6] flex items-center justify-center shrink-0"
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                            <p className="truncate">
                              {displayOrder.deliveryArea} — {displayOrder.deliveryAddress}
                            </p>
                            <button
                              type="button"
                              onClick={() => setTranslateSheet((v) => !v)}
                              className="text-xs font-bold text-[#E21B70] inline-flex items-center gap-1 shrink-0 hover:underline"
                            >
                              <Languages className="w-3.5 h-3.5" />
                              <span>{translateSheet ? 'Original' : 'Translate'}</span>
                            </button>
                          </div>
                          {displayOrder.deliveryInstructions && (
                            <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1.5 rounded-lg">
                              {sheetBn ? 'নির্দেশনা:' : 'Note:'} {displayOrder.deliveryInstructions}
                            </p>
                          )}

                          {sheetStepsOpen && liveRouteSummary && liveRouteSummary.steps.length > 0 && (
                            <ol className="max-h-32 overflow-y-auto space-y-1 rounded-xl bg-neutral-50 border border-neutral-200 p-2.5 text-[11px]">
                              {liveRouteSummary.steps.map((st, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-2 text-neutral-700">
                                  <span className="truncate">
                                    <strong>{idx + 1}.</strong> {st.instruction}
                                  </span>
                                  {st.distanceMeters > 0 && (
                                    <span className="text-[10px] font-semibold text-neutral-500 shrink-0">
                                      {formatDirectionStepDistance(st.distanceMeters, sheetBn ? 'bn' : 'en')}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>

                        {/* Order & Expandable Items */}
                        <div className="space-y-2">
                          <p className="text-2xl font-extrabold text-[#2E3138] tracking-tight tabular-nums">
                            #{shortCode}
                          </p>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p className="font-bold text-[#2E3138] truncate">
                              {displayOrder.orderNumber} (#{shortCode}) •{' '}
                              {displayOrder.restaurantName}
                            </p>
                            <button
                              type="button"
                              onClick={() => setItemsExpanded((v) => !v)}
                              className="font-bold text-[#E21B70] inline-flex items-center gap-1 shrink-0"
                            >
                              <span>
                                {itemsList.length} {sheetBn ? 'আইটেম' : 'items'}
                              </span>
                              {itemsExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {itemsExpanded && (
                            <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-1">
                              {itemsList.map((it, idx) => (
                                <div
                                  key={`${it.foodItemId}-${idx}`}
                                  className="py-2 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-bold text-[#2E3138] tabular-nums">
                                      {it.quantity}
                                    </span>
                                    <span className="text-neutral-700 truncate">
                                      {it.name}
                                      {it.variation ? ` - ${it.variation}` : ''}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-neutral-600 tabular-nums shrink-0">
                                    {it.lineTotal.toFixed(2)} Tk
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Payment Summary: Online Paid (Food) + Cash to Rider (Delivery Charge) */}
                          {(() => {
                            const collectCashRequired =
                              cashInfo.isCod || cashInfo.isDeliveryCashOnly;
                            const needCashCheck =
                              collectCashRequired &&
                              (settlementRules?.requireCashConfirmation ?? true);
                            const cashChecked = Boolean(cashConfirmedByOrder[displayOrder.id]);
                            return (
                              <>
                                <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-[11px] text-neutral-400">
                                        {sheetBn ? 'পেমেন্ট' : 'Payment'}
                                      </p>
                                      <p className="font-semibold text-[#2E3138]">
                                        {sheetBn ? cashInfo.statusLabelBn : cashInfo.statusLabelEn}
                                      </p>
                                    </div>
                                    <div className="text-right tabular-nums">
                                      <p className="font-bold text-[#2E3138]">
                                        {collectCashRequired
                                          ? `${cashInfo.amountToCollect.toFixed(2)} Tk`
                                          : sheetBn
                                          ? 'অনলাইনে পরিশোধিত'
                                          : 'Paid online'}
                                      </p>
                                    </div>
                                  </div>

                                  {cashInfo.isDeliveryCashOnly && (
                                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] text-emerald-900 flex items-center justify-between">
                                      <span className="font-semibold">
                                        {sheetBn
                                          ? 'খাবারের দাম অনলাইনে পরিশোধিত'
                                          : 'Food Price Already Paid Online'}
                                      </span>
                                      <span className="font-bold tabular-nums">
                                        {formatBdt(
                                          displayOrder.onlineFoodPaidAmount ??
                                            Math.max(
                                              0,
                                              displayOrder.totalAmount - displayOrder.deliveryFee
                                            ),
                                          lang
                                        )}
                                      </span>
                                    </div>
                                  )}

                                  {collectCashRequired && (
                                    <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-[#2E3138]">
                                          {cashInfo.isDeliveryCashOnly
                                            ? sheetBn
                                              ? 'রাইডারকে নগদ (ডেলিভারি চার্জ)'
                                              : 'Pay Cash to Rider (Delivery Charge)'
                                            : sheetBn
                                            ? 'মোট ক্যাশ সংগ্রহ'
                                            : 'Total payment'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (editingCashOrderId === displayOrder.id) {
                                              setEditingCashOrderId(null);
                                            } else {
                                              setEditingCashOrderId(displayOrder.id);
                                              setEditedCashInput(String(cashInfo.amountToCollect));
                                            }
                                          }}
                                          className="font-bold text-[#E21B70] hover:underline"
                                        >
                                          {editingCashOrderId === displayOrder.id
                                            ? sheetBn
                                              ? 'বাতিল'
                                              : 'Close'
                                            : sheetBn
                                            ? 'এডিট'
                                            : 'Edit'}
                                        </button>
                                      </div>

                                      {editingCashOrderId === displayOrder.id ? (
                                        <div className="flex items-center gap-2 pt-1">
                                          <input
                                            type="number"
                                            min={0}
                                            step="1"
                                            value={editedCashInput}
                                            onChange={(e) => setEditedCashInput(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm font-bold tabular-nums"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const val = Number(editedCashInput);
                                              if (Number.isFinite(val) && val >= 0) {
                                                setCashCollectOverrideByOrder((prev) => ({
                                                  ...prev,
                                                  [displayOrder.id]: val,
                                                }));
                                              }
                                              setEditingCashOrderId(null);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-[#E21B70] text-white text-xs font-bold"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="text-xl font-extrabold text-amber-900 tabular-nums">
                                          Tk {cashInfo.amountToCollect.toFixed(2)}
                                        </p>
                                      )}

                                      <div className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums pt-0.5">
                                        <div className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-900">
                                          {sheetBn ? 'রাইডার আয়:' : 'Rider earning:'}{' '}
                                          <strong>{formatBdt(offerRiderEarning, lang)}</strong>
                                        </div>
                                        <div className="rounded bg-purple-50 border border-purple-200 px-2 py-1 text-purple-900">
                                          {sheetBn ? 'Foodora কমিশন:' : 'Foodora owed:'}{' '}
                                          <strong>{formatBdt(offerFoodoraCommission, lang)}</strong>
                                        </div>
                                      </div>

                                      {needCashCheck && (
                                        <label className="mt-1.5 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] font-semibold text-amber-950 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={cashChecked}
                                            onChange={(e) =>
                                              setCashConfirmedByOrder((prev) => ({
                                                ...prev,
                                                [displayOrder.id]: e.target.checked,
                                              }))
                                            }
                                            className="mt-0.5 accent-[#E21B70]"
                                          />
                                          <span>
                                            {sheetBn
                                              ? `আমি নিশ্চিত করছি কাস্টমারের কাছ থেকে ৳${cashInfo.amountToCollect} নগদ ডেলিভারি চার্জ সংগ্রহ করেছি।`
                                              : `I confirm ৳${cashInfo.amountToCollect} cash delivery charge collected from customer.`}
                                          </span>
                                        </label>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* Proof of drop-Off (Screenshots 5, 6, 7) */}
                        <div className="pt-2 border-t border-neutral-100 space-y-2.5">
                          <div>
                            <h3 className="text-xs font-bold text-[#2E3138]">
                              {sheetBn ? 'ড্রপ-অফ প্রমাণ (ছবি)' : 'Proof of drop-Off'}
                            </h3>
                            <p className="text-[11px] text-neutral-500 mt-0.5">
                              {sheetBn
                                ? 'ডেলিভারি সম্পন্নের প্রমাণ হিসেবে একটি ছবি যোগ করুন'
                                : 'Add a photo as proof of drop-off'}
                            </p>
                          </div>

                          <input
                            ref={proofFileInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/*,.jpg,.jpeg,.png,.webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = '';
                              if (file && displayOrder) {
                                void handleUploadProofPhoto(displayOrder.id, file);
                              }
                            }}
                          />

                          {proofUploadError && (
                            <p role="alert" className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                              {proofUploadError}
                            </p>
                          )}

                          {uploadedProof ? (
                            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-neutral-200 shadow-xs">
                              <img
                                src={uploadedProof}
                                alt="Proof of drop-off"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                aria-label="Remove proof of drop-off photo"
                                onClick={() => {
                                  setProofUploadError(null);
                                  setProofPhotoByOrder((prev) => {
                                    const next = { ...prev };
                                    delete next[displayOrder.id];
                                    return next;
                                  });
                                }}
                                className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-white/95 text-[#E21B70] shadow-md flex items-center justify-center hover:bg-white"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={uploadingProofOrderId === displayOrder.id}
                              onClick={() => proofFileInputRef.current?.click()}
                              className="w-full py-3 rounded-xl border border-[#E21B70]/40 bg-white hover:bg-[#FFF0F6]/60 text-[#E21B70] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <Camera className="w-4 h-4" />
                              <span>
                                {uploadingProofOrderId === displayOrder.id
                                  ? sheetBn
                                    ? 'ছবি আপলোড হচ্ছে...'
                                    : 'Uploading photo...'
                                  : sheetBn
                                  ? 'ছবি যোগ করুন'
                                  : 'Add photo'}
                              </span>
                            </button>
                          )}

                          {/* Primary Confirm Drop-off CTA */}
                          {(() => {
                            const collectCashRequired =
                              cashInfo.isCod || cashInfo.isDeliveryCashOnly;
                            const needCashCheck =
                              collectCashRequired &&
                              (settlementRules?.requireCashConfirmation ?? true);
                            const cashBlocked =
                              needCashCheck && !cashConfirmedByOrder[displayOrder.id];
                            return (
                              <button
                                type="button"
                                disabled={
                                  updatingOrderId === displayOrder.id || cashBlocked
                                }
                                onClick={() =>
                                  handleUpdateStatus(displayOrder.id, 'delivered', {
                                    pickupRating,
                                    proofPhotoUrl: uploadedProof,
                                    collectedCashAmount: collectCashRequired
                                      ? cashInfo.amountToCollect
                                      : undefined,
                                  })
                                }
                                className="w-full py-3.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-sm font-bold shadow-md disabled:opacity-50"
                              >
                                {updatingOrderId === displayOrder.id
                                  ? sheetBn
                                    ? 'সম্পন্ন হচ্ছে...'
                                    : 'Confirming drop-off...'
                                  : sheetBn
                                  ? 'ড্রপ-অফ কনফার্ম করুন'
                                  : 'Confirm drop-off'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Queue & Task Switcher Column (Desktop side panel / Below sheet on Mobile) */}
                <div className="lg:col-span-5 xl:col-span-6 space-y-4">
                  {/* Active Deliveries Quick Selector (when multiple deliveries exist) */}
                  {activeDeliveries.length > 0 && (
                    <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#2E3138]">
                          {lang === 'bn'
                            ? `চলমান ডেলিভারি (${activeDeliveries.length})`
                            : `Active Assigned Tasks (${activeDeliveries.length})`}
                        </h3>
                        {focusedActive && (
                          <button
                            type="button"
                            onClick={() => onTrackOrder(focusedActive.id)}
                            className="text-xs font-bold text-[#E21B70] hover:underline"
                          >
                            {lang === 'bn' ? 'কাস্টমার ট্র্যাকিং দেখুন' : 'Full Tracking View'}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {activeDeliveries.map((ord) => {
                          const isSelected = focusedActive?.id === ord.id;
                          return (
                            <button
                              key={ord.id}
                              type="button"
                              onClick={() => {
                                setPreviewOfferMode(false);
                                setFocusedActiveOrderId(ord.id);
                                riderSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'border-[#E21B70] bg-[#FFF0F6]/50'
                                  : 'border-neutral-200 hover:border-neutral-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#2E3138] truncate">
                                  #{formatRiderShortOrderCode(ord.orderNumber, ord.id)} ·{' '}
                                  {ord.restaurantName}
                                </p>
                                <p className="text-[11px] text-neutral-500 truncate">
                                  {ord.customerName} · {ord.deliveryArea}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-[10px] font-bold uppercase text-[#2E3138] shrink-0">
                                {ord.status.replace(/_/g, ' ')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Open Dispatch Queue Cards */}
                  <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#2E3138] flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#E21B70]" />
                        <span>
                          {lang === 'bn'
                            ? `উন্মুক্ত অর্ডার কিউ (${filteredAvailableOrders.length})`
                            : `Open Dispatch Queue (${filteredAvailableOrders.length})`}
                        </span>
                      </h3>
                      <div className="relative w-full sm:w-52">
                        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={queueSearch}
                          onChange={(e) => setQueueSearch(e.target.value)}
                          placeholder={
                            lang === 'bn' ? 'অর্ডার বা এলাকা খুঁজুন...' : 'Filter orders...'
                          }
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg"
                        />
                      </div>
                    </div>

                    {filteredAvailableOrders.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-2">
                        {lang === 'bn'
                          ? 'এই মুহূর্তে কোনো নতুন ডেলিভারি অপেক্ষায় নেই।'
                          : 'No unassigned Foodora Rider orders waiting right now.'}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredAvailableOrders.map((ord, idx) => {
                          const eta = calculateLiveRiderEta(
                            riderCoords.lat,
                            riderCoords.lng,
                            ord.deliveryLat,
                            ord.deliveryLng,
                            'ready'
                          );
                          const accepting = acceptingOrderId === ord.id;
                          return (
                            <div
                              key={ord.id}
                              className="p-3 rounded-xl border border-neutral-200 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-neutral-500">
                                  <span className="font-bold text-[#2E3138]">
                                    #{formatRiderShortOrderCode(ord.orderNumber, ord.id)}
                                  </span>
                                  <span>·</span>
                                  <span className="font-bold text-[#16A34A]">
                                    {Math.max(40, ord.deliveryFee).toFixed(2)} Tk
                                  </span>
                                  <span>·</span>
                                  <span>{eta.remainingKm.toFixed(1)} km</span>
                                </div>
                                <p className="text-xs font-bold text-[#2E3138] truncate mt-0.5">
                                  {ord.restaurantName} → {ord.deliveryArea}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeclinedOfferIds((prev) =>
                                      prev.filter((id) => id !== ord.id)
                                    );
                                    setPreviewOfferMode(true);
                                    setFocusedOfferIdx(idx);
                                    riderSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-[#E21B70]"
                                >
                                  {lang === 'bn' ? 'দেখুন' : 'Preview'}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    accepting ||
                                    !riderAcceptGate.allowed ||
                                    (ord.paymentMethod !== 'cod' &&
                                      ord.paymentStatus !== 'paid')
                                  }
                                  onClick={() => {
                                    setPreviewOfferMode(false);
                                    void handleAcceptOrder(ord.id);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-[#E21B70] hover:bg-[#C4135E] text-white text-[11px] font-bold disabled:opacity-50"
                                >
                                  {accepting
                                    ? '...'
                                    : lang === 'bn'
                                    ? 'গ্রহণ'
                                    : 'Accept'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                {/* Confirm Pickup Modal (Matches Screenshot_4) */}
                {pickupConfirmOrder && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Confirm order pickup"
                    className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                  >
                    <div className="bg-white rounded-2xl max-w-xs w-full p-6 shadow-2xl space-y-4 text-center">
                      <h3 className="text-base font-extrabold text-[#2E3138] leading-snug">
                        {sheetBn
                          ? `আপনি কি অর্ডার ${pickupConfirmOrder.orderNumber} (#${formatRiderShortOrderCode(
                              pickupConfirmOrder.orderNumber,
                              pickupConfirmOrder.id
                            )}) পিকআপ কনফার্ম করছেন?`
                          : `Do you confirm order ${pickupConfirmOrder.orderNumber} (#${formatRiderShortOrderCode(
                              pickupConfirmOrder.orderNumber,
                              pickupConfirmOrder.id
                            )}) pickup?`}
                      </h3>
                      <button
                        type="button"
                        disabled={updatingOrderId === pickupConfirmOrder.id}
                        onClick={async () => {
                          const target = pickupConfirmOrder;
                          setPickupConfirmOrder(null);
                          await handleUpdateStatus(target.id, 'picked_up', {
                            pickupRating: pickupRatingByOrder[target.id],
                          });
                        }}
                        className="w-full py-3 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-sm font-bold shadow-md disabled:opacity-50"
                      >
                        {sheetBn ? 'পিকআপ কনফার্ম করুন' : 'Confirm pickup'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickupConfirmOrder(null)}
                        className="w-full py-2 text-sm font-bold text-[#E21B70] hover:underline"
                      >
                        {sheetBn ? 'এখন নয় (Skip)' : 'Skip'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ---------------- TAB 2: LIVE GPS & ROUTE MAP ---------------- */}
          {activeTab === 'map' && rider && (
            <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                    <Radio className={`w-4 h-4 ${sharingGps ? 'text-emerald-600' : 'text-[#E21B70]'}`} />
                    <span>
                      {lang === 'bn' ? 'লাইভ রাইডার GPS লোকেশন ও রুট' : 'Live Rider GPS & Route Map'}
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                    {lang === 'bn' ? 'বর্তমান অবস্থান:' : 'Current Position:'}{' '}
                    {riderCoords.lat.toFixed(5)}, {riderCoords.lng.toFixed(5)}
                    {rider.locationUpdatedAt
                      ? ` · ${lang === 'bn' ? 'সর্বশেষ সিঙ্ক' : 'Synced'} ${new Date(
                          rider.locationUpdatedAt
                        ).toLocaleTimeString()}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedSyncZone}
                    aria-label="Select Bangladesh city or area to sync rider GPS"
                    onChange={(e) => setSelectedSyncZone(e.target.value)}
                    className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white font-semibold"
                  >
                    {DHAKA_DELIVERY_ZONES.map((z) => (
                      <optgroup key={z.code} label={`${z.code} — ${z.name}`}>
                        {z.areas.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name} ({a.nameBn})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label={lang === 'bn' ? 'অন্যান্য বাংলাদেশ শহর' : 'Nationwide Bangladesh Cities'}>
                      {BANGLADESH_AREAS.filter((a) => !a.zoneCode).map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.name} ({a.division})
                        </option>
                      ))}
                    </optgroup>
                    <option value="__custom__">Custom Area...</option>
                  </select>
                  {selectedSyncZone === '__custom__' && (
                    <input
                      value={customSyncZone}
                      onChange={(e) => setCustomSyncZone(e.target.value)}
                      placeholder="Custom BD city/area"
                      className="px-2.5 py-2 text-xs border border-neutral-200 rounded-lg bg-white w-36"
                    />
                  )}
                  <button
                    type="button"
                    disabled={syncingLoc}
                    onClick={() => {
                      if (selectedSyncZone === '__custom__') {
                        const clean = customSyncZone.trim();
                        if (!clean) return;
                        persistRiderLocation(
                          { lat: riderCoords.lat, lng: riderCoords.lng, zone: clean },
                          `Working zone updated to ${clean}`
                        );
                      } else {
                        const found = BANGLADESH_AREAS.find((a) => a.name === selectedSyncZone);
                        if (found) {
                          persistRiderLocation(
                            { lat: found.lat, lng: found.lng, zone: found.name },
                            lang === 'bn'
                              ? `${found.name} লোকেশনে সিঙ্ক হয়েছে`
                              : `Rider location set to ${found.name}`
                          );
                        }
                      }
                    }}
                    className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LocateFixed className="w-3.5 h-3.5 text-[#E21B70]" />
                    <span>{lang === 'bn' ? 'এলাকায় সিঙ্ক' : 'Sync Area'}</span>
                  </button>
                </div>
              </div>

              {gpsStatusMsg && (
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                  {gpsStatusMsg}
                </div>
              )}

              <DhakaMapPicker
                mapsApiKey={mapsApiKey}
                lang={lang}
                center={
                  primaryActiveOrder
                    ? { lat: primaryActiveOrder.deliveryLat, lng: primaryActiveOrder.deliveryLng }
                    : riderCoords
                }
                markerLabel={
                  primaryActiveOrder
                    ? `${primaryActiveOrder.deliveryArea} (Dropoff)`
                    : `${rider.fullName} (Position)`
                }
                pinType="user"
                userName={primaryActiveOrder ? primaryActiveOrder.customerName : rider.fullName}
                secondaryPoint={
                  primaryActiveOrder &&
                  typeof primaryActiveOrder.restaurantLat === 'number' &&
                  typeof primaryActiveOrder.restaurantLng === 'number'
                    ? {
                        lat: primaryActiveOrder.restaurantLat,
                        lng: primaryActiveOrder.restaurantLng,
                        label: primaryActiveOrder.restaurantName,
                      }
                    : undefined
                }
                riderPoint={{
                  lat: riderCoords.lat,
                  lng: riderCoords.lng,
                  label: `${rider.fullName} (You)`,
                }}
                riderTarget={
                  primaryActiveOrder &&
                  !['on_the_way', 'picked_up'].includes(primaryActiveOrder.status) &&
                  typeof primaryActiveOrder.restaurantLat === 'number' &&
                  typeof primaryActiveOrder.restaurantLng === 'number'
                    ? {
                        lat: primaryActiveOrder.restaurantLat,
                        lng: primaryActiveOrder.restaurantLng,
                      }
                    : undefined
                }
                riderVehicleType={rider?.vehicleType}
                trackingStatus={primaryActiveOrder?.status}
                showTraffic
                showDirectionsSummary
                enableInteractivePointRoute={!primaryActiveOrder}
                interactive
                heightClass="h-[340px]"
                onSelectLocation={(loc) => {
                  persistRiderLocation(
                    {
                      lat: loc.lat,
                      lng: loc.lng,
                      zone:
                        loc.areaName && loc.areaName !== 'Current GPS' ? loc.areaName : undefined,
                    },
                    lang === 'bn'
                      ? `লোকেশন আপডেট হয়েছে (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`
                      : `Rider pin moved to ${loc.areaName || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}`
                  );
                }}
              />
            </section>
          )}

          {/* ---------------- TAB 3: HISTORY & EARNINGS ---------------- */}
          {activeTab === 'earnings' && (
            <section className="space-y-4">
              {/* Transparent Cash Collection & Foodora Commission Wallet */}
              <div
                data-testid="rider-commission-wallet-section"
                className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#E21B70]" />
                      <span>
                        {lang === 'bn'
                          ? 'রাইডার ক্যাশ ও কমিশন ওয়ালেট'
                          : 'Rider Cash & Foodora Commission Wallet'}
                      </span>
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {lang === 'bn'
                        ? 'কাস্টমারের কাছ থেকে ডেলিভারি চার্জ নগদ সংগ্রহ করুন; Foodora প্ল্যাটফর্ম কমিশন স্বচ্ছভাবে এখানে ট্র্যাক করা হয়।'
                        : 'Collect delivery charge directly in cash from customers; Foodora commission owed is transparently tracked here.'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-[11px] font-semibold text-purple-900 tabular-nums">
                    {lang === 'bn' ? 'সর্বোচ্চ বকেয়া সীমা:' : 'Max Limit:'}{' '}
                    {formatBdt(settlementRules.maxOutstandingLimit, lang)}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold text-amber-800">
                      {lang === 'bn' ? 'মোট সংগৃহীত ক্যাশ' : 'Total Cash Collected'}
                    </p>
                    <p className="text-lg font-bold text-amber-950 mt-0.5 font-mono">
                      {formatBdt(walletSummary.totalCashCollected, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-[11px] font-semibold text-emerald-800">
                      {lang === 'bn' ? 'রাইডার আয়' : 'Rider Earnings'}
                    </p>
                    <p className="text-lg font-bold text-emerald-950 mt-0.5 font-mono">
                      {formatBdt(walletSummary.totalRiderEarnings, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                    <p className="text-[11px] font-semibold text-purple-800">
                      {lang === 'bn' ? 'Foodora কমিশন' : 'Commission Owed'}
                    </p>
                    <p className="text-lg font-bold text-purple-950 mt-0.5 font-mono">
                      {formatBdt(walletSummary.totalCommissionOwed, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-[11px] font-semibold text-neutral-600">
                      {lang === 'bn' ? 'জমা দেওয়া কমিশন' : 'Settled w/ Foodora'}
                    </p>
                    <p className="text-lg font-bold text-[#2E3138] mt-0.5 font-mono">
                      {formatBdt(walletSummary.totalCommissionSettled, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-pink-200 bg-[#FFF0F6] p-3">
                    <p className="text-[11px] font-semibold text-[#E21B70]">
                      {lang === 'bn' ? 'বকেয়া কমিশন ব্যালেন্স' : 'Outstanding Owed'}
                    </p>
                    <p className="text-lg font-bold text-[#E21B70] mt-0.5 font-mono">
                      {formatBdt(walletSummary.outstandingCommission, lang)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-700">
                  <p className="font-semibold text-[#2E3138]">
                    {lang === 'bn'
                      ? 'কোনো অটোমেটেড পেআউট নেই — সরাসরি অ্যাডমিনের সাথে কমিশন সেটেল করুন'
                      : 'No automated payouts for cash collected directly from customers — settle owed Foodora commission with Admin manually'}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {settlementRules.settlementInstructions}
                  </p>
                </div>

                {walletLedger.length > 0 && (
                  <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Order / Ref</th>
                          <th className="px-3 py-2 text-right">Cash</th>
                          <th className="px-3 py-2 text-right">Rider Share</th>
                          <th className="px-3 py-2 text-right">Commission +/-</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 tabular-nums">
                        {walletLedger.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-3 py-2 font-semibold capitalize text-[#2E3138]">
                              {entry.entryType.replace(/_/g, ' ')}
                            </td>
                            <td className="px-3 py-2 text-neutral-600 font-mono">
                              {entry.orderNumber || entry.referenceId || `#${entry.id}`}
                              {entry.note ? (
                                <span className="block font-sans text-[10px] text-neutral-400">
                                  {entry.note}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {formatBdt(entry.cashCollected, lang)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                              {entry.riderEarningDelta >= 0 ? '+' : ''}
                              {formatBdt(entry.riderEarningDelta, lang)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {entry.commissionSettledDelta > 0 ? (
                                <span className="text-emerald-700">
                                  -{formatBdt(entry.commissionSettledDelta, lang)} (Settled)
                                </span>
                              ) : (
                                <span
                                  className={
                                    entry.commissionOwedDelta > 0
                                      ? 'text-purple-800'
                                      : 'text-neutral-500'
                                  }
                                >
                                  {entry.commissionOwedDelta >= 0 ? '+' : ''}
                                  {formatBdt(entry.commissionOwedDelta, lang)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 tabular-nums">
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500">
                    {lang === 'bn' ? 'মোট অর্জিত আয়' : 'Lifetime Rider Earnings'}
                  </p>
                  <p className="text-xl font-bold text-[#E21B70] mt-1 font-mono">
                    {formatBdt(rider?.totalEarnings ?? 0, lang)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500">
                    {lang === 'bn' ? 'ক্যাশ অন ডেলিভারি সম্পন্ন' : 'Completed COD Orders'}
                  </p>
                  <p className="text-xl font-bold text-[#2E3138] mt-1 font-mono">
                    {codCompletedCount}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500">
                    {lang === 'bn' ? 'প্রিপেইড ডেলিভারি সম্পন্ন' : 'Completed Prepaid Orders'}
                  </p>
                  <p className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                    {prepaidCompletedCount}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? `ডেলিভারি হিস্ট্রি (${filteredHistoryOrders.length})`
                        : `Completed & Past Deliveries (${filteredHistoryOrders.length})`}
                    </span>
                  </h2>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder={lang === 'bn' ? 'অর্ডার বা এলাকা খুঁজুন...' : 'Search past deliveries...'}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg"
                    />
                  </div>
                </div>

                {filteredHistoryOrders.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4">
                    {lang === 'bn'
                      ? 'এখনো কোনো সম্পন্ন ডেলিভারি হিস্ট্রি নেই।'
                      : 'No completed deliveries recorded in your history yet.'}
                  </p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {filteredHistoryOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono tabular-nums">
                            <span className="font-semibold text-[#2E3138]">{ord.orderNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(ord.createdAt).toLocaleDateString()}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-semibold uppercase">
                              {ord.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-[#2E3138]">
                            {ord.restaurantName} → {ord.deliveryArea}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {ord.customerName} · {ord.paymentMethod.toUpperCase()}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 tabular-nums">
                          <div className="text-right">
                            <p className="text-xs font-bold text-[#E21B70] font-mono">
                              +{formatBdt(ord.riderEarningAmount ?? Math.max(40, ord.deliveryFee), lang)}
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              Cash {formatBdt(ord.cashDueToRider ?? ord.deliveryFee, lang)} · Order{' '}
                              {formatBdt(ord.totalAmount, lang)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onTrackOrder(ord.id)}
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold hover:border-[#E21B70]"
                          >
                            {lang === 'bn' ? 'বিস্তারিত' : 'Details'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ---------------- TAB 4: OPEN RESTAURANT RIDER JOBS BOARD ---------------- */}
          {activeTab === 'jobs' && (
            <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#E21B70]" />
                    <span>
                      {lang === 'bn'
                        ? `রেস্টুরেন্টের উন্মুক্ত রাইডার জব (${riderJobs.length})`
                        : `Open Restaurant Rider Jobs (${riderJobs.length})`}
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {lang === 'bn'
                      ? 'রেস্টুরেন্ট মালিকদের পোস্ট করা স্থায়ী বা পার্ট-টাইম রাইডার চাকরিতে সরাসরি আবেদন করুন।'
                      : 'Apply directly to delivery rider positions posted by partner restaurants.'}
                  </p>
                </div>
                {jobAppFeedback && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                    {jobAppFeedback}
                  </div>
                )}
              </div>

              {riderJobs.length === 0 ? (
                <p className="text-xs text-neutral-500 py-3">
                  {lang === 'bn'
                    ? 'এই মুহূর্তে কোনো রেস্টুরেন্ট জব পোস্ট করেনি — আপনি ফ্লিট রাইডার হিসেবে অর্ডার ডেলিভারি করতে পারেন।'
                    : 'No restaurant-specific rider jobs posted right now — continue accepting open platform deliveries.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {riderJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-xl border border-neutral-200 p-4 flex flex-col justify-between gap-3 bg-[#FAFAFB]"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="font-bold text-[#E21B70]">{job.restaurantName}</span>
                          <span className="font-semibold text-neutral-600 tabular-nums">
                            {job.vacancies} {lang === 'bn' ? 'জন নিয়োগ' : 'openings'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#2E3138]">
                          {lang === 'bn' ? job.titleBn : job.title}
                        </h3>
                        <p className="text-xs text-neutral-600">
                          {job.zone} · {job.vehicleType}
                        </p>
                        <p className="text-xs font-semibold text-[#2E3138] tabular-nums">
                          {job.salaryRange}
                        </p>
                        <p className="text-[11px] text-neutral-500">{job.shiftHours}</p>
                        {job.description && (
                          <p className="text-[11px] text-neutral-600 line-clamp-2 pt-1">
                            {job.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setApplyingJob(job);
                          setJobAppZone(job.zone || BANGLADESH_AREAS[0].name);
                          setJobAppError(null);
                        }}
                        className="w-full py-2 rounded-xl bg-[#2E3138] hover:bg-[#E21B70] text-white text-xs font-semibold transition-colors"
                      >
                        {lang === 'bn' ? 'এই জবে আবেদন করুন' : 'Apply for Rider Job'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ---------------- TAB 5: RIDER PROFILE ---------------- */}
          {activeTab === 'profile' && rider && (() => {
            const stats = calculateRiderProfileStats(rider, assignedOrders);
            const joinedDate = rider.createdAt
              ? new Date(rider.createdAt).toLocaleDateString()
              : null;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Identity Card & Rider Performance Summary */}
                <section className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="relative w-20 h-20 rounded-2xl bg-[#FFF0F6] border border-[#E21B70]/25 overflow-hidden flex items-center justify-center shrink-0">
                      {profileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt={profileFullName || rider.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Bike className="w-9 h-9 text-[#E21B70]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-extrabold text-[#2E3138] truncate">
                          {rider.fullName}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                          <ShieldCheck className="w-3 h-3" />
                          <span>
                            {rider.status === 'approved'
                              ? lang === 'bn'
                                ? 'অনুমোদিত'
                                : 'Approved'
                              : rider.status}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 font-mono">
                        {lang === 'bn' ? 'রাইডার আইডি:' : 'Rider ID:'} RDR-#{rider.id}
                      </p>
                      <p className="text-xs text-neutral-600 flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate">{rider.email}</span>
                      </p>
                      {joinedDate && (
                        <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span>
                            {lang === 'bn' ? 'যোগদানের তারিখ:' : 'Joined:'} {joinedDate}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Avatar Upload Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      ref={profileAvatarInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/*,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file) {
                          void handleUploadProfileAvatar(file);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => profileAvatarInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl border border-[#E21B70]/40 bg-[#FFF0F6]/60 hover:bg-[#FFF0F6] text-[#E21B70] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>
                        {uploadingAvatar
                          ? lang === 'bn'
                            ? 'আপলোড হচ্ছে...'
                            : 'Uploading...'
                          : lang === 'bn'
                          ? 'প্রোফাইল ছবি পরিবর্তন'
                          : 'Change Photo'}
                      </span>
                    </button>
                    {profileAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setProfileAvatarUrl('')}
                        className="px-3 py-2 rounded-xl border border-neutral-200 text-neutral-600 hover:text-red-600 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'মুছুন' : 'Remove'}</span>
                      </button>
                    )}
                  </div>

                  {/* Fleet & Zone Info */}
                  <div className="rounded-xl bg-[#FAFAFB] border border-neutral-200/80 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">
                        {lang === 'bn' ? 'ফ্লিট / রেস্টুরেন্ট' : 'Fleet Affiliation'}
                      </span>
                      <span className="font-bold text-[#2E3138] text-right">
                        {rider.restaurantName ||
                          (lang === 'bn' ? 'Foodora BD নিজস্ব ফ্লিট' : 'Foodora BD Platform Fleet')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">
                        {lang === 'bn' ? 'যানবাহন ও জোন' : 'Vehicle & Zone'}
                      </span>
                      <span className="font-semibold text-[#2E3138] text-right">
                        {rider.vehicleType} · {rider.zone}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">
                        {lang === 'bn' ? 'ডিসপ্যাচ স্ট্যাটাস' : 'Dispatch Status'}
                      </span>
                      <span
                        className={`font-bold ${
                          rider.isAvailable ? 'text-emerald-700' : 'text-neutral-600'
                        }`}
                      >
                        {rider.isAvailable
                          ? lang === 'bn'
                            ? 'অনলাইন (অর্ডার গ্রহণযোগ্য)'
                            : 'Online & Available'
                          : lang === 'bn'
                          ? 'অফলাইন'
                          : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* 4 Performance Metric Tiles */}
                  <div className="grid grid-cols-2 gap-3 tabular-nums">
                    <div className="rounded-xl border border-neutral-200 p-3.5">
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'bn' ? 'সম্পন্ন ডেলিভারি' : 'Deliveries Completed'}
                      </p>
                      <p className="text-lg font-extrabold text-[#2E3138] mt-1 font-mono">
                        {stats.deliveredCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3.5">
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'bn' ? 'মোট আয়' : 'Lifetime Earnings'}
                      </p>
                      <p className="text-lg font-extrabold text-[#E21B70] mt-1 font-mono">
                        {formatBdt(stats.totalEarnings, lang)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3.5">
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'bn' ? 'সফলতার হার' : 'Completion Rate'}
                      </p>
                      <p className="text-lg font-extrabold text-emerald-700 mt-1 font-mono">
                        {stats.completionRatePct}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3.5">
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'bn' ? 'গড় আয় / অর্ডার' : 'Avg / Delivery'}
                      </p>
                      <p className="text-lg font-extrabold text-[#2E3138] mt-1 font-mono">
                        {formatBdt(stats.avgEarningPerOrder, lang)}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Right Column: Editable Rider Profile Details Form */}
                <section className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                    <div>
                      <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                        <User className="w-4 h-4 text-[#E21B70]" />
                        <span>
                          {lang === 'bn'
                            ? 'রাইডার প্রোফাইল তথ্য এডিট করুন'
                            : 'Edit Rider Profile Details'}
                        </span>
                      </h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {lang === 'bn'
                          ? 'নাম, মোবাইল নম্বর, যানবাহন ও কর্মরত এলাকা হালনাগাদ রাখুন — কাস্টমার ট্র্যাকিংয়েও এটি আপডেট হবে।'
                          : 'Keep your name, phone, vehicle, and working zone up to date across dispatch & customer tracking.'}
                      </p>
                    </div>
                  </div>

                  {profileSaveError && (
                    <div
                      role="alert"
                      className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700"
                    >
                      {profileSaveError}
                    </div>
                  )}
                  {profileSaveSuccess && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{profileSaveSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveRiderProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="rider-profile-fullname"
                          className="block text-xs font-semibold text-neutral-700 mb-1"
                        >
                          {lang === 'bn' ? 'পূর্ণ নাম' : 'Full Name'} *
                        </label>
                        <input
                          id="rider-profile-fullname"
                          required
                          value={profileFullName}
                          onChange={(e) => setProfileFullName(e.target.value)}
                          placeholder={lang === 'bn' ? 'আপনার পূর্ণ নাম' : 'e.g. Tariqul Islam'}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E21B70]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="rider-profile-phone"
                          className="block text-xs font-semibold text-neutral-700 mb-1"
                        >
                          {lang === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'} *
                        </label>
                        <input
                          id="rider-profile-phone"
                          required
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          placeholder="+880 1711-000000"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm font-mono focus:outline-none focus:border-[#E21B70]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          {lang === 'bn' ? 'লগইন ইমেইল (পরিবর্তনযোগ্য নয়)' : 'Login Email'}
                        </label>
                        <input
                          type="email"
                          readOnly
                          value={rider.email}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-500 text-sm cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="rider-profile-nid"
                          className="block text-xs font-semibold text-neutral-700 mb-1"
                        >
                          {isBicycleVehicleType(profileVehicleType)
                            ? lang === 'bn'
                              ? 'এনআইডি নম্বর (ঐচ্ছিক)'
                              : 'NID Number (Optional)'
                            : lang === 'bn'
                            ? 'এনআইডি / ড্রাইভিং লাইসেন্স নম্বর'
                            : 'NID / Driving License Number'}
                        </label>
                        <input
                          id="rider-profile-nid"
                          value={profileNidNumber}
                          onChange={(e) => setProfileNidNumber(e.target.value)}
                          placeholder={
                            isBicycleVehicleType(profileVehicleType)
                              ? lang === 'bn'
                                ? 'শুধু NID দিন (ঐচ্ছিক)'
                                : 'e.g. 1995269123456 (NID only)'
                              : lang === 'bn'
                              ? 'যেমন: 1995269123456'
                              : 'e.g. 1995269123456'
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm font-mono focus:outline-none focus:border-[#E21B70]"
                        />
                        {isBicycleVehicleType(profileVehicleType) && (
                          <p className="text-[11px] text-emerald-700 mt-1">
                            {lang === 'bn'
                              ? 'সাইকেলের জন্য ড্রাইভিং লাইসেন্সের দরকার নেই।'
                              : 'Bicycle riders do not need a driving license.'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          {lang === 'bn' ? 'যানবাহনের ধরন' : 'Vehicle Type'} *
                        </label>
                        <SelectWithCustom
                          required
                          lang={lang}
                          value={profileVehicleType}
                          onChange={setProfileVehicleType}
                          presets={VEHICLE_TYPE_PRESET_OPTIONS.map((v) => ({ value: v, label: v }))}
                          storageKey="rider_vehicles"
                          ariaLabel="Rider profile vehicle type"
                          placeholder={lang === 'bn' ? 'যেমন: Motorbike, Bicycle' : 'e.g. Motorbike, Bicycle'}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          {lang === 'bn' ? 'কর্মরত এলাকা / জোন' : 'Working Area / Zone'} *
                        </label>
                        <SelectWithCustom
                          required
                          lang={lang}
                          value={profileZone}
                          onChange={setProfileZone}
                          presets={getBangladeshAreaSelectPresets(lang)}
                          storageKey="rider_zones"
                          ariaLabel="Rider profile working zone"
                          placeholder={lang === 'bn' ? 'এলাকা বা শহর লিখুন...' : 'Enter Bangladesh city/area...'}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAFAFB] border border-neutral-200/80">
                      <div>
                        <p className="text-xs font-bold text-[#2E3138]">
                          {lang === 'bn'
                            ? 'ডিসপ্যাচ অনলাইন অ্যাভেইলেবিলিটি'
                            : 'Available for Order Dispatch'}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {lang === 'bn'
                            ? 'চালু থাকলে নতুন ডেলিভারি রিকোয়েস্ট এবং অটো-অ্যাসাইন পাবেন।'
                            : 'When enabled, you appear online for incoming orders and restaurant assignments.'}
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={profileIsAvailable}
                          onChange={(e) => setProfileIsAvailable(e.target.checked)}
                          className="w-4 h-4 accent-[#E21B70] rounded"
                        />
                        <span className="text-xs font-bold text-[#2E3138]">
                          {profileIsAvailable
                            ? lang === 'bn'
                              ? 'অনলাইন'
                              : 'Online'
                            : lang === 'bn'
                            ? 'অফলাইন'
                            : 'Offline'}
                        </span>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('map')}
                          className="px-3.5 py-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#E21B70]" />
                          <span>{lang === 'bn' ? 'GPS লোকেশন দেখুন' : 'GPS Location'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('earnings')}
                          className="px-3.5 py-2.5 rounded-xl border border-neutral-200 hover:border-[#E21B70] text-xs font-semibold text-[#2E3138] inline-flex items-center gap-1.5"
                        >
                          <Wallet className="w-3.5 h-3.5 text-[#E21B70]" />
                          <span>{lang === 'bn' ? 'আয় ও হিস্ট্রি' : 'Earnings'}</span>
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="px-5 py-2.5 rounded-xl bg-[#E21B70] hover:bg-[#C4135E] text-white text-xs font-bold shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {savingProfile
                            ? lang === 'bn'
                              ? 'সংরক্ষণ হচ্ছে...'
                              : 'Saving Profile...'
                            : lang === 'bn'
                            ? 'রাইডার প্রোফাইল সেভ করুন'
                            : 'Save Rider Profile'}
                        </span>
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            );
          })()}
        </div>
      )}

      {/* Onboarding view also includes the Open Restaurant Rider Jobs Board below */}
      {showOnboardingView && (
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#2E3138] flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#E21B70]" />
                <span>
                  {lang === 'bn'
                    ? `রেস্টুরেন্টের উন্মুক্ত রাইডার জব (${riderJobs.length})`
                    : `Open Restaurant Rider Jobs (${riderJobs.length})`}
                </span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {lang === 'bn'
                  ? 'রেস্টুরেন্ট মালিকদের পোস্ট করা রাইডার চাকরিতে সরাসরি আবেদন করুন।'
                  : 'Apply directly to delivery rider positions posted by partner restaurants.'}
              </p>
            </div>
            {jobAppFeedback && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                {jobAppFeedback}
              </div>
            )}
          </div>

          {riderJobs.length === 0 ? (
            <p className="text-xs text-neutral-500 py-3">
              {lang === 'bn'
                ? 'এই মুহূর্তে কোনো রেস্টুরেন্ট জব পোস্ট করেনি — উপরের ফর্মে সরাসরি ফ্লিট রাইডার হিসেবে যুক্ত হতে পারেন।'
                : 'No restaurant-specific rider jobs posted right now — you can join the platform fleet directly above.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {riderJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-neutral-200 p-4 flex flex-col justify-between gap-3 bg-[#FAFAFB]"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="font-bold text-[#E21B70]">{job.restaurantName}</span>
                      <span className="font-semibold text-neutral-600 tabular-nums">
                        {job.vacancies} {lang === 'bn' ? 'জন নিয়োগ' : 'openings'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#2E3138]">
                      {lang === 'bn' ? job.titleBn : job.title}
                    </h3>
                    <p className="text-xs text-neutral-600">
                      {job.zone} · {job.vehicleType}
                    </p>
                    <p className="text-xs font-semibold text-[#2E3138] tabular-nums">
                      {job.salaryRange}
                    </p>
                    <p className="text-[11px] text-neutral-500">{job.shiftHours}</p>
                    {job.description && (
                      <p className="text-[11px] text-neutral-600 line-clamp-2 pt-1">
                        {job.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setApplyingJob(job);
                      setJobAppZone(job.zone || BANGLADESH_AREAS[0].name);
                      setJobAppError(null);
                    }}
                    className="w-full py-2 rounded-xl bg-[#2E3138] hover:bg-[#E21B70] text-white text-xs font-semibold transition-colors"
                  >
                    {lang === 'bn' ? 'এই জবে আবেদন করুন' : 'Apply for Rider Job'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {applyingJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitJobApplication}
            className="bg-white rounded-2xl border border-neutral-200 max-w-md w-full p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#2E3138]">
                  {lang === 'bn' ? applyingJob.titleBn : applyingJob.title}
                </h3>
                <p className="text-xs text-[#E21B70] font-semibold">
                  {applyingJob.restaurantName} · {applyingJob.zone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApplyingJob(null)}
                aria-label="Close application modal"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Full Name</label>
                <input
                  required
                  value={jobAppFullName}
                  onChange={(e) => setJobAppFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Phone</label>
                  <input
                    required
                    value={jobAppPhone}
                    onChange={(e) => setJobAppPhone(e.target.value)}
                    placeholder="+88017..."
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={jobAppEmail}
                    onChange={(e) => setJobAppEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Vehicle</label>
                  <input
                    required
                    value={jobAppVehicle}
                    onChange={(e) => setJobAppVehicle(e.target.value)}
                    placeholder="Motorbike / Bicycle"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Area / Zone</label>
                  <input
                    required
                    value={jobAppZone}
                    onChange={(e) => setJobAppZone(e.target.value)}
                    placeholder="Gulshan, Dhaka"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  {isBicycleVehicleType(jobAppVehicle)
                    ? 'NID Number (Optional — No driving license needed)'
                    : 'NID / Driving License Number (Optional)'}
                </label>
                <input
                  value={jobAppNid}
                  onChange={(e) => setJobAppNid(e.target.value)}
                  placeholder={
                    isBicycleVehicleType(jobAppVehicle)
                      ? 'National ID (no driving license needed for Bicycle)'
                      : 'National ID or Driving License'
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Experience / Note
                </label>
                <textarea
                  rows={2}
                  value={jobAppNote}
                  onChange={(e) => setJobAppNote(e.target.value)}
                  placeholder="Years of delivery experience or preferred shift..."
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {jobAppError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {jobAppError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setApplyingJob(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingJobApp}
                className="px-4 py-2 rounded-xl bg-[#E21B70] text-white text-xs font-semibold disabled:opacity-50"
              >
                {submittingJobApp ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
