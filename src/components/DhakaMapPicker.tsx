import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  ArrowUpDown,
  Bike,
  ChevronDown,
  ChevronUp,
  Clock,
  CornerUpRight,
  ExternalLink,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Satellite,
  Wifi,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { BANGLADESH_AREAS, DHAKA_AREAS } from '../lib/i18n';
import {
  computeMapRouteTelemetry,
  DELIVERY_VEHICLE_MODES,
  formatDirectionStepDistance,
  formatDurationEstimate,
  getDeliveryVehicleMeta,
  matchCanonicalAreaFromHints,
  normalizeDeliveryVehicleMode,
  resolveMapPinAppearance,
  resolveNearestAreaFromList,
  summarizeTrafficCongestion,
  type DeliveryVehicleMode,
  type LiveRouteTrafficSummary,
  type RouteDirectionStep,
  type TrafficSeverity,
} from '../lib/marketplace-logic';
import type { Lang } from '../types/marketplace';

const GMP_BLOCK_KEY = 'foodora_gmp_quota_blocked_until';
const MAP_PREF_KEY = 'foodora_preferred_map_mode';
const GOOGLE_MAP_LIBRARIES = ['places', 'marker', 'routes'];
const FIT_BOUNDS_PADDING = { top: 82, right: 48, bottom: 52, left: 48 };

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isGoogleMapsBlockedInSession(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as { __foodoraGmpBlocked?: boolean }).__foodoraGmpBlocked) {
    return true;
  }
  try {
    const until = Number(sessionStorage.getItem(GMP_BLOCK_KEY) || '0');
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function setGoogleMapsBlockedInSession(blocked: boolean) {
  if (typeof window === 'undefined') return;
  (window as unknown as { __foodoraGmpBlocked?: boolean }).__foodoraGmpBlocked = blocked;
  try {
    if (blocked) {
      sessionStorage.setItem(GMP_BLOCK_KEY, String(Date.now() + 30 * 60 * 1000));
    } else {
      sessionStorage.removeItem(GMP_BLOCK_KEY);
    }
  } catch {
    // ignore
  }
}

function getPreferredMapMode(): 'google' | 'osm' | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(MAP_PREF_KEY);
    return v === 'osm' || v === 'google' ? v : null;
  } catch {
    return null;
  }
}

function setPreferredMapMode(mode: 'google' | 'osm') {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MAP_PREF_KEY, mode);
  } catch {
    // ignore
  }
}

export interface ExtraRiderMapPin {
  id: number;
  label: string;
  lat: number;
  lng: number;
  isAvailable: boolean;
  selected?: boolean;
}

class GoogleMapErrorBoundary extends React.Component<
  { children: React.ReactNode; onCrash: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onCrash: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onCrash();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface DhakaMapPickerProps {
  mapsApiKey: string;
  lang: Lang;
  center: { lat: number; lng: number };
  markerLabel?: string;
  pinType?: 'user' | 'vendor';
  userName?: string;
  restaurantName?: string;
  secondaryPoint?: { lat: number; lng: number; label: string };
  originPoint?: { lat: number; lng: number; label: string } | null;
  riderPoint?: { lat: number; lng: number; label: string };
  riderTarget?: { lat: number; lng: number };
  riderVehicleType?: string | null;
  liveDistanceKm?: number | null;
  liveEtaMinutes?: number | null;
  trackingStatus?: string;
  telemetryBadgeClassName?: string;
  extraRiders?: ExtraRiderMapPin[];
  onSelectRiderPin?: (riderId: number) => void;
  interactive?: boolean;
  enableInteractivePointRoute?: boolean;
  onSwapInteractiveRoute?: () => void;
  onClearInteractiveRoute?: () => void;
  showTraffic?: boolean;
  showDirectionsSummary?: boolean;
  showVehicleSelector?: boolean;
  onRouteSummary?: (summary: LiveRouteTrafficSummary | null) => void;
  heightClass?: string;
  onSelectLocation?: (coords: {
    lat: number;
    lng: number;
    areaName?: string;
    displayName?: string;
  }) => void;
}

function VehicleModeIcon({
  mode,
  className = 'w-3.5 h-3.5',
}: {
  mode: DeliveryVehicleMode;
  className?: string;
}) {
  if (mode === 'bicycle') {
    return <Bike className={className} />;
  }
  if (mode === 'motorbike') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <circle cx="5.5" cy="17" r="3" />
        <circle cx="18.5" cy="17" r="3" />
        <path d="M5.5 17H11l3-6h3.5l1 3" />
        <path d="M12 11l-1.5-3H8" />
        <path d="M15 7h3" />
      </svg>
    );
  }
  if (mode === 'auto') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M5 16V9a4 4 0 0 1 4-4h6l3 5v6H5Z" />
        <circle cx="7.5" cy="17.5" r="2" />
        <circle cx="16.5" cy="17.5" r="2" />
        <path d="M9 10h6" />
      </svg>
    );
  }
  if (mode === 'car') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M5 11l2-5h10l2 5" />
        <rect x="3" y="11" width="18" height="6" rx="2" />
        <circle cx="7" cy="17.5" r="1.5" />
        <circle cx="17" cy="17.5" r="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M12 8v5l3 3.5" />
      <path d="M12 11l-3 5.5" />
      <path d="M9.5 9.5l5 1" />
    </svg>
  );
}

function getTrafficBadgeClasses(severity?: TrafficSeverity): {
  pill: string;
  dot: string;
} {
  if (severity === 'heavy') {
    return {
      pill: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-600',
    };
  }
  if (severity === 'moderate') {
    return {
      pill: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
    };
  }
  return {
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-600',
  };
}

function MapLiveTelemetryBadge({
  lang,
  distanceKm,
  etaMinutes,
  trafficSummary,
  vehicleMode = 'motorbike',
  className,
}: {
  lang: Lang;
  distanceKm: number;
  etaMinutes: number;
  trafficSummary?: LiveRouteTrafficSummary | null;
  vehicleMode?: DeliveryVehicleMode;
  className?: string;
}) {
  const sev = trafficSummary?.trafficSeverity;
  const badgeColors = getTrafficBadgeClasses(sev);
  const shortTrafficText =
    sev === 'heavy'
      ? lang === 'bn'
        ? 'জ্যাম'
        : 'Jam'
      : sev === 'moderate'
      ? lang === 'bn'
        ? 'ধীর'
        : 'Slow'
      : lang === 'bn'
      ? 'ফাঁকা'
      : 'Clear';

  return (
    <div
      data-testid="map-live-distance-eta"
      className={`pointer-events-none z-[420] inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-xs border border-[#E21B70]/35 px-3 py-1 shadow-md text-[11px] font-bold text-[#2E3138] tabular-nums ${
        className || 'absolute top-2.5 right-14'
      }`}
    >
      <span className="inline-flex items-center gap-1 text-[#2E3138]">
        <VehicleModeIcon mode={vehicleMode} className="w-3.5 h-3.5 text-[#E21B70] shrink-0" />
        <span>
          {distanceKm.toFixed(1)} {lang === 'bn' ? 'কিমি' : 'km'}
        </span>
      </span>
      <span className="text-neutral-300">·</span>
      <span className="inline-flex items-center gap-1 text-[#E21B70]">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>~{formatDurationEstimate(etaMinutes, lang)}</span>
      </span>
      {trafficSummary && (
        <>
          <span className="text-neutral-300">·</span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-extrabold ${badgeColors.pill}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badgeColors.dot}`} />
            <span>{shortTrafficText}</span>
          </span>
        </>
      )}
    </div>
  );
}

interface MapPolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
}

const MAJOR_BD_CITY_NAMES = new Set([
  'Dhaka',
  'Gulshan 2',
  'Chattogram',
  'Sylhet',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Rangpur',
  'Mymensingh',
  "Cox's Bazar",
]);

function isPointInsideDhakaMetro(lat: number, lng: number): boolean {
  return lat >= 23.66 && lat <= 23.92 && lng >= 90.28 && lng <= 90.52;
}

function MapPinMarkerBadge({
  label,
  role,
}: {
  label: string;
  role: 'user' | 'vendor' | 'origin';
}) {
  if (role === 'origin') {
    return (
      <div className="flex flex-col items-center pointer-events-none select-none">
        <span className="px-2 py-0.5 rounded-full border border-[#1D4ED8] bg-[#1A73E8] text-white text-[10px] font-bold shadow-md whitespace-nowrap mb-1 leading-tight">
          {label}
        </span>
        <span className="relative flex items-center justify-center w-6 h-6">
          <span className="absolute inset-0 rounded-full bg-[#3B82F6]/25" />
          <span className="relative w-3.5 h-3.5 rounded-full bg-[#1A73E8] border-2 border-white shadow-md" />
        </span>
      </div>
    );
  }
  const isVendor = role === 'vendor';
  return (
    <div className="flex flex-col items-center pointer-events-none select-none">
      <span
        className={`px-2 py-0.5 rounded-md border text-white text-[11px] font-bold shadow-md whitespace-nowrap mb-1 leading-tight ${
          isVendor ? 'bg-[#111827] border-black' : 'bg-[#DC2626] border-[#991B1B]'
        }`}
      >
        {label}
      </span>
      <svg
        width="28"
        height="36"
        viewBox="0 0 28 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <path
          d="M14 1.5C7.09644 1.5 1.5 7.09644 1.5 14C1.5 23.25 14 34.5 14 34.5C14 34.5 26.5 23.25 26.5 14C26.5 7.09644 20.9036 1.5 14 1.5Z"
          fill={isVendor ? '#111827' : '#DC2626'}
          stroke={isVendor ? '#000000' : '#991B1B'}
          strokeWidth="2"
        />
        <circle cx="14" cy="13.5" r="4.8" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

function TrafficLayerOverlay({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const layerRef = useRef<{ setMap: (m: unknown) => void } | null>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;
    const TrafficLayerCtor = (
      mapsLib as unknown as {
        TrafficLayer?: new () => { setMap: (m: unknown) => void };
      }
    ).TrafficLayer;
    if (!TrafficLayerCtor) return;
    if (!layerRef.current) {
      layerRef.current = new TrafficLayerCtor();
    }
    layerRef.current.setMap(enabled ? map : null);
    return () => {
      layerRef.current?.setMap(null);
    };
  }, [map, mapsLib, enabled]);

  return null;
}

function getSpeedColorHex(speed?: string | null): string {
  const upper = String(speed || '').toUpperCase();
  if (upper === 'TRAFFIC_JAM') return '#DC2626';
  if (upper === 'SLOW') return '#F59E0B';
  if (upper === 'NORMAL') return '#1A73E8';
  return '#1A73E8';
}

function extractLatLngPoint(raw: any): { lat: number; lng: number } | null {
  if (!raw) return null;
  const lat = typeof raw.lat === 'function' ? raw.lat() : raw.lat;
  const lng = typeof raw.lng === 'function' ? raw.lng() : raw.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

function RouteOverlay({
  origin,
  destination,
  vehicleMode = 'motorbike',
  skipFitBounds = false,
  isSecondaryContext = false,
  onRouteSummary,
  onRouteMidpoint,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  vehicleMode?: DeliveryVehicleMode;
  skipFitBounds?: boolean;
  isSecondaryContext?: boolean;
  onRouteSummary?: (summary: LiveRouteTrafficSummary | null) => void;
  onRouteMidpoint?: (pt: { lat: number; lng: number } | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<MapPolylineLike[]>([]);
  const onRouteSummaryRef = useRef(onRouteSummary);
  onRouteSummaryRef.current = onRouteSummary;
  const onRouteMidpointRef = useRef(onRouteMidpoint);
  onRouteMidpointRef.current = onRouteMidpoint;

  const originLat = origin.lat;
  const originLng = origin.lng;
  const destLat = destination.lat;
  const destLng = destination.lng;
  const vehicleMeta = getDeliveryVehicleMeta(vehicleMode);

  useEffect(() => {
    if (!map) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (!isSecondaryContext) onRouteMidpointRef.current?.(null);

    if (
      Math.abs(originLat - destLat) < 0.00012 &&
      Math.abs(originLng - destLng) < 0.00012
    ) {
      return;
    }

    let cancelled = false;

    const applyOsrmFallback = () => {
      apiFetch<{
        route: {
          distanceKm: number;
          drivingMinutes: number;
          coordinates?: Array<{ lat: number; lng: number }>;
          steps?: RouteDirectionStep[];
          trafficSummary?: LiveRouteTrafficSummary;
        };
      }>(
        `/api/free/route?fromLat=${originLat}&fromLng=${originLng}&toLat=${destLat}&toLng=${destLng}&steps=1&mode=${vehicleMode}`
      )
        .then((res) => {
          if (cancelled || !map) return;
          const r = res.route;
          if (!isSecondaryContext && r.trafficSummary) {
            onRouteSummaryRef.current?.(r.trafficSummary);
          }
          const PolylineCtor = (
            mapsLib as unknown as {
              Polyline?: new (opts: Record<string, unknown>) => MapPolylineLike;
            }
          )?.Polyline;
          if (PolylineCtor && r.coordinates && r.coordinates.length > 1) {
            const sev = r.trafficSummary?.trafficSeverity;
            const mainColor = isSecondaryContext
              ? '#E21B70'
              : sev === 'heavy'
              ? '#DC2626'
              : sev === 'moderate'
              ? '#F59E0B'
              : '#1D4ED8';
            const created: MapPolylineLike[] = [];
            if (!isSecondaryContext) {
              created.push(
                new PolylineCtor({
                  path: r.coordinates,
                  geodesic: true,
                  strokeColor: '#1E3A8A',
                  strokeOpacity: 0.32,
                  strokeWeight: 9,
                  zIndex: 2,
                  map,
                })
              );
            }
            created.push(
              new PolylineCtor({
                path: r.coordinates,
                geodesic: true,
                strokeColor: mainColor,
                strokeOpacity: isSecondaryContext ? 0.45 : 0.94,
                strokeWeight: isSecondaryContext ? 4 : 6,
                zIndex: isSecondaryContext ? 1 : 4,
                map,
              })
            );
            polylinesRef.current = created;
            if (!isSecondaryContext) {
              const mid = r.coordinates[Math.floor(r.coordinates.length / 2)];
              onRouteMidpointRef.current?.(mid || null);
            }
          }
        })
        .catch(() => {});
    };

    const RouteCls = (
      routesLib as unknown as {
        Route?: { computeRoutes: (req: unknown) => Promise<{ routes: any[] }> };
      }
    )?.Route;

    if (!RouteCls || typeof RouteCls.computeRoutes !== 'function') {
      applyOsrmFallback();
      return () => {
        cancelled = true;
        polylinesRef.current.forEach((p) => p.setMap(null));
        polylinesRef.current = [];
      };
    }

    const renderPrimaryRoute = (primary: any, routeMatchesVehicle: boolean) => {
      if (cancelled) return;
      const speedPaths = Array.isArray(primary.speedPaths)
        ? (primary.speedPaths as Array<{ path?: any[]; speed?: string }>)
        : [];
      const speedLevels = speedPaths
        .map((sp) => sp.speed)
        .filter((s): s is string => Boolean(s));

      const createdLines: MapPolylineLike[] = [];
      const PolylineCtor = (
        mapsLib as unknown as {
          Polyline?: new (opts: Record<string, unknown>) => MapPolylineLike;
        }
      )?.Polyline;

      if (!isSecondaryContext && PolylineCtor && Array.isArray(primary.path) && primary.path.length > 1) {
        createdLines.push(
          new PolylineCtor({
            path: primary.path,
            geodesic: true,
            strokeColor: '#1E3A8A',
            strokeOpacity: 0.34,
            strokeWeight: 9,
            zIndex: 2,
            map,
          })
        );
      }

      if (typeof primary.createPolylines === 'function') {
        const lines = primary.createPolylines() as MapPolylineLike[];
        lines.forEach((p, idx) => {
          if (isSecondaryContext) {
            p.setOptions({
              strokeColor: '#E21B70',
              strokeOpacity: 0.42,
              strokeWeight: 4,
              zIndex: 1,
            });
          } else if (speedPaths.length > 0 && speedPaths[idx]?.speed) {
            p.setOptions({
              strokeColor: getSpeedColorHex(speedPaths[idx].speed),
              strokeOpacity: 0.96,
              strokeWeight: 6,
              zIndex: speedPaths[idx].speed === 'TRAFFIC_JAM' ? 6 : 4,
            });
          } else {
            p.setOptions({
              strokeColor: '#1D4ED8',
              strokeOpacity: 0.94,
              strokeWeight: 6,
              zIndex: 4,
            });
          }
          p.setMap(map);
          createdLines.push(p);
        });
      }
      polylinesRef.current = createdLines;

      if (!isSecondaryContext) {
        const pathArr = Array.isArray(primary.path) ? primary.path : [];
        const midPt = pathArr.length > 0 ? extractLatLngPoint(pathArr[Math.floor(pathArr.length / 2)]) : null;
        onRouteMidpointRef.current?.(
          midPt || {
            lat: (originLat + destLat) / 2,
            lng: (originLng + destLng) / 2,
          }
        );
      }

      if (primary.viewport && !skipFitBounds) {
        (map as unknown as { fitBounds: (b: unknown, padding?: unknown) => void }).fitBounds(
          primary.viewport,
          FIT_BOUNDS_PADDING
        );
      }

      if (!isSecondaryContext) {
        const steps: RouteDirectionStep[] = (primary.legs || [])
          .flatMap((leg: any) =>
            (leg.steps || []).map((st: any) => ({
              instruction: String(st.instructions || st.maneuver || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
              distanceMeters: Number(st.distanceMeters || 0),
              durationSeconds: Math.round(Number(st.staticDurationMillis || 0) / 1000),
              maneuver: st.maneuver ? String(st.maneuver) : undefined,
            }))
          )
          .filter((s: RouteDirectionStep) => s.instruction.length > 0);

        const durationSec = Math.round(
          Number(primary.durationMillis || primary.staticDurationMillis || 0) / 1000
        );
        const staticDurationSec = Math.round(
          Number(primary.staticDurationMillis || primary.durationMillis || 0) / 1000
        );

        const summary = summarizeTrafficCongestion({
          distanceMeters: Number(primary.distanceMeters || 0),
          durationSeconds: durationSec,
          staticDurationSeconds: staticDurationSec,
          speedLevels,
          steps,
          source: 'google_routes',
          vehicleMode,
          routeMatchesVehicle,
        });
        onRouteSummaryRef.current?.(summary);
      }
    };

    const requestTrafficDrivingRoute = () => {
      const fullRequest = {
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        travelMode: 'DRIVING',
        routingPreference: 'TRAFFIC_AWARE',
        extraComputations: ['TRAFFIC_ON_POLYLINE'],
        fields: [
          'path',
          'viewport',
          'distanceMeters',
          'durationMillis',
          'staticDurationMillis',
          'speedPaths',
          'legs',
        ],
      };

      const drivingMatch =
        vehicleMeta.googleTravelMode === 'DRIVING';

      return RouteCls.computeRoutes(fullRequest)
        .then(({ routes }) => {
          if (cancelled) return;
          if (routes && routes.length > 0) {
            renderPrimaryRoute(routes[0], drivingMatch);
          } else {
            applyOsrmFallback();
          }
        })
        .catch(() => {
          if (cancelled) return;
          RouteCls.computeRoutes({
            origin: { lat: originLat, lng: originLng },
            destination: { lat: destLat, lng: destLng },
            travelMode: 'DRIVING',
            routingPreference: 'TRAFFIC_AWARE',
            fields: ['path', 'viewport', 'distanceMeters', 'durationMillis', 'staticDurationMillis', 'legs'],
          })
            .then(({ routes }) => {
              if (cancelled) return;
              if (routes && routes.length > 0) {
                renderPrimaryRoute(routes[0], drivingMatch);
              } else {
                applyOsrmFallback();
              }
            })
            .catch(() => {
              if (!cancelled) applyOsrmFallback();
            });
        });
    };

    if (vehicleMeta.googleTravelMode === 'BICYCLING' || vehicleMeta.googleTravelMode === 'WALKING') {
      RouteCls.computeRoutes({
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        travelMode: vehicleMeta.googleTravelMode,
        fields: ['path', 'viewport', 'distanceMeters', 'durationMillis', 'staticDurationMillis', 'legs'],
      })
        .then(({ routes }) => {
          if (cancelled) return;
          if (routes && routes.length > 0) {
            renderPrimaryRoute(routes[0], true);
          } else {
            void requestTrafficDrivingRoute();
          }
        })
        .catch(() => {
          if (!cancelled) void requestTrafficDrivingRoute();
        });
    } else {
      void requestTrafficDrivingRoute();
    }

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [
    map,
    routesLib,
    mapsLib,
    originLat,
    originLng,
    destLat,
    destLng,
    vehicleMode,
    vehicleMeta.googleTravelMode,
    skipFitBounds,
    isSecondaryContext,
  ]);

  return null;
}

function TrackingBoundsAndRiderVector({
  center,
  secondaryPoint,
  riderPoint,
  riderTarget,
  hideFallbackLine = false,
}: {
  center: { lat: number; lng: number };
  secondaryPoint?: { lat: number; lng: number };
  riderPoint?: { lat: number; lng: number };
  riderTarget?: { lat: number; lng: number };
  hideFallbackLine?: boolean;
}) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const mapsLib = useMapsLibrary('maps');
  const riderLineRef = useRef<MapPolylineLike | null>(null);
  const fittedKeyRef = useRef<string>('');

  const cLat = center.lat;
  const cLng = center.lng;
  const sLat = secondaryPoint?.lat;
  const sLng = secondaryPoint?.lng;
  const rLat = riderPoint?.lat;
  const rLng = riderPoint?.lng;
  const tLat = riderTarget?.lat ?? cLat;
  const tLng = riderTarget?.lng ?? cLng;

  useEffect(() => {
    if (!map || !mapsLib || typeof rLat !== 'number' || typeof rLng !== 'number' || hideFallbackLine) {
      if (riderLineRef.current) {
        riderLineRef.current.setMap(null);
        riderLineRef.current = null;
      }
      return;
    }

    const PolylineCtor = (
      mapsLib as unknown as {
        Polyline?: new (opts: Record<string, unknown>) => MapPolylineLike;
      }
    ).Polyline;
    if (!PolylineCtor) return;

    const path = [
      { lat: rLat, lng: rLng },
      { lat: tLat, lng: tLng },
    ];

    if (!riderLineRef.current) {
      riderLineRef.current = new PolylineCtor({
        path,
        geodesic: true,
        strokeColor: '#1D4ED8',
        strokeOpacity: 0.55,
        strokeWeight: 3,
        map,
      });
    } else {
      riderLineRef.current.setOptions({ path, map });
    }

    return () => {
      if (riderLineRef.current) {
        riderLineRef.current.setMap(null);
        riderLineRef.current = null;
      }
    };
  }, [map, mapsLib, rLat, rLng, tLat, tLng, hideFallbackLine]);

  useEffect(() => {
    if (!map || !coreLib || typeof rLat !== 'number' || typeof rLng !== 'number') return;

    const LatLngBoundsCtor = (
      coreLib as unknown as {
        LatLngBounds?: new () => {
          extend: (pt: { lat: number; lng: number }) => void;
        };
      }
    ).LatLngBounds;
    if (!LatLngBoundsCtor) return;

    const endpointKey = `${cLat.toFixed(4)},${cLng.toFixed(4)}|${sLat?.toFixed(4) ?? ''},${sLng?.toFixed(4) ?? ''}|hasRider`;
    const currentBounds = map.getBounds();
    const riderOutsideView =
      currentBounds && typeof currentBounds.contains === 'function'
        ? !currentBounds.contains({ lat: rLat, lng: rLng })
        : false;

    if (fittedKeyRef.current !== endpointKey || riderOutsideView) {
      const bounds = new LatLngBoundsCtor();
      bounds.extend({ lat: cLat, lng: cLng });
      bounds.extend({ lat: rLat, lng: rLng });
      if (typeof sLat === 'number' && typeof sLng === 'number') {
        bounds.extend({ lat: sLat, lng: sLng });
      }
      (map as unknown as { fitBounds: (b: unknown, padding?: unknown) => void }).fitBounds(
        bounds,
        FIT_BOUNDS_PADDING
      );
      fittedKeyRef.current = endpointKey;
    }
  }, [map, coreLib, cLat, cLng, sLat, sLng, rLat, rLng]);

  return null;
}

function MapCenterSync({
  center,
  skipPanRef,
}: {
  center: { lat: number; lng: number };
  skipPanRef: React.MutableRefObject<{ lat: number; lng: number } | null>;
}) {
  const map = useMap();
  const prevRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    if (
      skipPanRef.current &&
      Math.abs(skipPanRef.current.lat - center.lat) < 1e-6 &&
      Math.abs(skipPanRef.current.lng - center.lng) < 1e-6
    ) {
      skipPanRef.current = null;
      prevRef.current = { lat: center.lat, lng: center.lng };
      return;
    }
    if (
      prevRef.current &&
      prevRef.current.lat === center.lat &&
      prevRef.current.lng === center.lng
    ) {
      return;
    }
    prevRef.current = { lat: center.lat, lng: center.lng };
    map.panTo(center);
  }, [map, center.lat, center.lng, skipPanRef]);

  return null;
}

function GoogleMapInner({
  lang,
  center,
  markerLabel,
  pinType,
  userName,
  restaurantName,
  secondaryPoint,
  secondaryPinRole = 'vendor',
  riderPoint,
  riderTarget,
  vehicleMode = 'motorbike',
  liveDistanceKm,
  liveEtaMinutes,
  trackingStatus,
  telemetryBadgeClassName,
  extraRiders,
  onSelectRiderPin,
  interactive,
  showTraffic,
  routeSummary,
  onRouteSummary,
  heightClass,
  onSelectLocation,
}: Omit<DhakaMapPickerProps, 'mapsApiKey' | 'showDirectionsSummary'> & {
  secondaryPinRole?: 'vendor' | 'origin';
  vehicleMode?: DeliveryVehicleMode;
  routeSummary?: LiveRouteTrafficSummary | null;
}) {
  const status = useApiLoadingStatus();
  const skipPanRef = useRef<{ lat: number; lng: number } | null>(null);
  const reverseSeqRef = useRef(0);
  const [resolving, setResolving] = useState(false);
  const [routeMidpoint, setRouteMidpoint] = useState<{ lat: number; lng: number } | null>(null);
  const pinAppearance = resolveMapPinAppearance({
    pinType,
    userName,
    restaurantName,
    markerLabel,
    secondaryLabel: secondaryPoint?.label,
  });
  const baseTelemetry = computeMapRouteTelemetry({
    center,
    secondaryPoint,
    riderPoint,
    riderTarget,
    status: trackingStatus,
    liveDistanceKm,
    liveEtaMinutes,
    vehicleMode,
  });
  const displayDistanceKm =
    routeSummary && routeSummary.distanceKm > 0
      ? routeSummary.distanceKm
      : baseTelemetry?.distanceKm;
  const displayEtaMinutes =
    routeSummary && routeSummary.etaMinutes > 0
      ? routeSummary.etaMinutes
      : baseTelemetry?.etaMinutes;

  const activeRouteOrigin = riderPoint
    ? { lat: riderPoint.lat, lng: riderPoint.lng }
    : secondaryPoint
    ? { lat: secondaryPoint.lat, lng: secondaryPoint.lng }
    : null;
  const activeRouteDest = riderPoint ? riderTarget || center : center;

  const emitLocation = (lat: number, lng: number, shouldSkipPan = true) => {
    if (!onSelectLocation || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (shouldSkipPan) {
      skipPanRef.current = { lat, lng };
    }
    const nearest = resolveNearestAreaFromList(lat, lng, BANGLADESH_AREAS);
    const immediateName =
      nearest.area && nearest.distanceKm <= 6
        ? nearest.area.name
        : `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    const immediateDisplayName =
      nearest.area && nearest.distanceKm <= 6
        ? `${nearest.area.name}, Bangladesh`
        : `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)}), Bangladesh`;

    onSelectLocation({
      lat,
      lng,
      areaName: immediateName,
      displayName: immediateDisplayName,
    });

    const seq = ++reverseSeqRef.current;
    setResolving(true);

    const resolveViaBackend = () =>
      apiFetch<{ displayName: string; areaName: string }>(
        `/api/free/reverse-geocode?lat=${lat}&lng=${lng}&lang=${lang}`
      )
        .then((res) => {
          if (seq !== reverseSeqRef.current) return;
          const cleanArea = matchCanonicalAreaFromHints(
            [res.areaName, res.displayName],
            lat,
            lng,
            BANGLADESH_AREAS
          );
          skipPanRef.current = { lat, lng };
          onSelectLocation({
            lat,
            lng,
            areaName: cleanArea || immediateName,
            displayName: res.displayName || immediateDisplayName,
          });
        })
        .catch(() => {
          // Keep immediate canonical nearest area/label if reverse geocode is unavailable
        })
        .finally(() => {
          if (seq === reverseSeqRef.current) {
            setResolving(false);
          }
        });

    void resolveViaBackend();
  };

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gm_authFailure'));
    }
  }, [status]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <FallbackDhakaMap
        lang={lang}
        center={center}
        markerLabel={markerLabel}
        pinType={pinType}
        userName={userName}
        restaurantName={restaurantName}
        secondaryPoint={secondaryPoint}
        secondaryPinRole={secondaryPinRole}
        riderPoint={riderPoint}
        riderTarget={riderTarget}
        vehicleMode={vehicleMode}
        liveDistanceKm={liveDistanceKm}
        liveEtaMinutes={liveEtaMinutes}
        trackingStatus={trackingStatus}
        telemetryBadgeClassName={telemetryBadgeClassName}
        extraRiders={extraRiders}
        onSelectRiderPin={onSelectRiderPin}
        interactive={interactive}
        showTraffic={showTraffic}
        routeSummary={routeSummary}
        onRouteSummary={onRouteSummary}
        heightClass={heightClass}
        onSelectLocation={onSelectLocation}
      />
    );
  }

  const showBangladeshZoom = Boolean(
    (extraRiders && extraRiders.length > 0) || !isPointInsideDhakaMetro(center.lat, center.lng)
  );
  const isGoogleMapsReady =
    status === APILoadingStatus.LOADED &&
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { google?: { maps?: { marker?: { AdvancedMarkerElement?: unknown } } } }).google?.maps?.marker?.AdvancedMarkerElement);

  const trafficLayerOn = Boolean(showTraffic);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-neutral-200 ${heightClass || 'h-[260px]'}`}
    >
      <GoogleMap
        defaultCenter={center}
        defaultZoom={showBangladeshZoom ? 7 : 14}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        clickableIcons={false}
        disableDefaultUI={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
        onClick={(ev) => {
          if (!interactive || !ev.detail?.latLng) return;
          const rawLatLng = ev.detail.latLng as unknown as {
            lat: number | (() => number);
            lng: number | (() => number);
          };
          const lat = typeof rawLatLng.lat === 'function' ? rawLatLng.lat() : rawLatLng.lat;
          const lng = typeof rawLatLng.lng === 'function' ? rawLatLng.lng() : rawLatLng.lng;
          emitLocation(lat, lng);
        }}
      >
        <MapCenterSync center={center} skipPanRef={skipPanRef} />
        {isGoogleMapsReady && <TrafficLayerOverlay enabled={trafficLayerOn} />}
        {isGoogleMapsReady && (
          <AdvancedMarker
            position={center}
            title={pinAppearance.primaryLabel}
            draggable={Boolean(interactive)}
            onDragEnd={(ev) => {
              if (interactive && ev.latLng) {
                emitLocation(ev.latLng.lat(), ev.latLng.lng());
              }
            }}
          >
            <MapPinMarkerBadge
              label={pinAppearance.primaryLabel}
              role={pinAppearance.primaryRole}
            />
          </AdvancedMarker>
        )}
        {isGoogleMapsReady && secondaryPoint && (
          <AdvancedMarker
            position={{ lat: secondaryPoint.lat, lng: secondaryPoint.lng }}
            title={
              secondaryPinRole === 'origin'
                ? secondaryPoint.label
                : pinAppearance.secondaryLabel || secondaryPoint.label
            }
          >
            <MapPinMarkerBadge
              label={
                secondaryPinRole === 'origin'
                  ? secondaryPoint.label
                  : pinAppearance.secondaryLabel || secondaryPoint.label
              }
              role={secondaryPinRole}
            />
          </AdvancedMarker>
        )}
        {isGoogleMapsReady && riderPoint && (
          <AdvancedMarker
            position={{ lat: riderPoint.lat, lng: riderPoint.lng }}
            title={riderPoint.label}
          >
            <div className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold shadow-lg border-2 border-white">
              <span className="w-2 h-2 rounded-full bg-emerald-200 animate-ping absolute -top-0.5 -right-0.5" />
              <VehicleModeIcon mode={vehicleMode} className="w-3.5 h-3.5 shrink-0" />
              <span>{riderPoint.label}</span>
            </div>
          </AdvancedMarker>
        )}
        {isGoogleMapsReady &&
          extraRiders?.map((er) => (
            <AdvancedMarker
              key={er.id}
              position={{ lat: er.lat, lng: er.lng }}
              title={er.label}
              onClick={() => onSelectRiderPin?.(er.id)}
            >
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border-2 ${
                  er.selected
                    ? 'bg-[#E21B70] text-white border-white scale-110'
                    : er.isAvailable
                    ? 'bg-emerald-600 text-white border-white'
                    : 'bg-neutral-600 text-white border-white'
                }`}
              >
                <Bike className="w-3 h-3 shrink-0" />
                <span>{er.label}</span>
              </div>
            </AdvancedMarker>
          ))}
        {isGoogleMapsReady && secondaryPoint && riderPoint && (
          <RouteOverlay
            origin={{ lat: secondaryPoint.lat, lng: secondaryPoint.lng }}
            destination={center}
            vehicleMode={vehicleMode}
            skipFitBounds
            isSecondaryContext
          />
        )}
        {isGoogleMapsReady && activeRouteOrigin && (
          <RouteOverlay
            origin={activeRouteOrigin}
            destination={activeRouteDest}
            vehicleMode={vehicleMode}
            skipFitBounds={Boolean(riderPoint)}
            onRouteSummary={onRouteSummary}
            onRouteMidpoint={setRouteMidpoint}
          />
        )}
        {isGoogleMapsReady &&
          activeRouteOrigin &&
          routeMidpoint &&
          typeof displayEtaMinutes === 'number' &&
          displayEtaMinutes > 0 && (
            <AdvancedMarker position={routeMidpoint}>
              <div
                data-testid="map-route-midpoint-eta"
                className="pointer-events-none select-none flex flex-col items-center"
              >
                <span className="px-2.5 py-1 rounded-lg bg-[#1D4ED8] text-white text-[11px] font-extrabold shadow-lg border border-white/80 whitespace-nowrap tabular-nums">
                  {formatDurationEstimate(displayEtaMinutes, lang, 'compact')}
                </span>
                <span className="w-2 h-2 bg-[#1D4ED8] rotate-45 -mt-1 border-r border-b border-white/60" />
              </div>
            </AdvancedMarker>
          )}
        {isGoogleMapsReady && (
          <TrackingBoundsAndRiderVector
            center={center}
            secondaryPoint={secondaryPoint}
            riderPoint={riderPoint}
            riderTarget={riderTarget}
            hideFallbackLine={Boolean(routeSummary)}
          />
        )}
      </GoogleMap>
      {typeof displayDistanceKm === 'number' && typeof displayEtaMinutes === 'number' && (
        <MapLiveTelemetryBadge
          lang={lang}
          distanceKm={displayDistanceKm}
          etaMinutes={displayEtaMinutes}
          trafficSummary={routeSummary}
          vehicleMode={vehicleMode}
          className={
            telemetryBadgeClassName ||
            (interactive ? 'absolute bottom-12 left-2.5' : 'absolute bottom-6 left-2.5')
          }
        />
      )}
      {interactive && (
        <div className="absolute bottom-2.5 left-2.5 right-12 flex items-center justify-between gap-2 bg-white/95 backdrop-blur-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 shadow-xs">
          <span className="truncate">
            {resolving
              ? lang === 'bn'
                ? 'ঠিকানা নির্ধারণ হচ্ছে...'
                : 'Setting pinned location...'
              : markerLabel
              ? `${markerLabel} · `
              : lang === 'bn'
              ? 'ম্যাপে ক্লিক বা পিন টানুন · '
              : 'Click map or drag pin · '}
            <span className="font-mono-nums text-neutral-500">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
              {typeof displayDistanceKm === 'number' && typeof displayEtaMinutes === 'number'
                ? ` · ${displayDistanceKm.toFixed(1)} ${lang === 'bn' ? 'কিমি' : 'km'} · ~${formatDurationEstimate(displayEtaMinutes, lang)}`
                : ''}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => emitLocation(pos.coords.latitude, pos.coords.longitude, false),
                  () => emitLocation(23.7949, 90.4144, false)
                );
              }
            }}
            className="inline-flex items-center gap-1 text-[#E21B70] font-bold hover:underline whitespace-nowrap shrink-0"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>GPS</span>
          </button>
        </div>
      )}
    </div>
  );
}

function buildLeafletPinHtml(label: string, role: 'user' | 'vendor' | 'origin'): string {
  if (role === 'origin') {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-75%);pointer-events:auto;">
        <span style="padding:2px 8px;border-radius:9999px;background:#1A73E8;border:1px solid #1D4ED8;color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.28);margin-bottom:4px;line-height:1.25;">${escapeHtml(label)}</span>
        <span style="width:16px;height:16px;border-radius:9999px;background:#1A73E8;border:2.5px solid #ffffff;box-shadow:0 0 0 5px rgba(59,130,246,0.28);display:inline-block;"></span>
      </div>
    `;
  }
  const isVendor = role === 'vendor';
  const fill = isVendor ? '#111827' : '#DC2626';
  const stroke = isVendor ? '#000000' : '#991B1B';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;">
      <span style="padding:2px 8px;border-radius:6px;background:${fill};border:1px solid ${stroke};color:#ffffff;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.28);margin-bottom:3px;line-height:1.25;">${escapeHtml(label)}</span>
      <svg width="26" height="34" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.32));">
        <path d="M14 1.5C7.09644 1.5 1.5 7.09644 1.5 14C1.5 23.25 14 34.5 14 34.5C14 34.5 26.5 23.25 26.5 14C26.5 7.09644 20.9036 1.5 14 1.5Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <circle cx="14" cy="13.5" r="4.8" fill="#FFFFFF"/>
      </svg>
    </div>
  `;
}

function buildLeafletRiderHtml(
  label: string,
  selected = false,
  isAvailable = true,
  vehicleMode: DeliveryVehicleMode = 'motorbike'
): string {
  const bg = selected ? '#E21B70' : isAvailable ? '#059669' : '#4B5563';
  const badgeSvg =
    vehicleMode === 'bicycle'
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>'
      : vehicleMode === 'car'
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M5 11l2-5h10l2 5"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/></svg>'
      : vehicleMode === 'auto'
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M5 16V9a4 4 0 0 1 4-4h6l3 5v6H5Z"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M5.5 17H11l3-6h3.5l1 3"/></svg>';
  return `
    <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:9999px;background:${bg};color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.28);white-space:nowrap;transform:translate(-50%,-50%);">
      <span style="width:7px;height:7px;border-radius:9999px;background:#A7F3D0;display:inline-block;"></span>
      ${badgeSvg}
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function FallbackDhakaMap({
  lang,
  center,
  markerLabel,
  pinType,
  userName,
  restaurantName,
  secondaryPoint,
  secondaryPinRole = 'vendor',
  riderPoint,
  riderTarget,
  vehicleMode = 'motorbike',
  liveDistanceKm,
  liveEtaMinutes,
  trackingStatus,
  telemetryBadgeClassName,
  extraRiders,
  onSelectRiderPin,
  interactive,
  routeSummary,
  onRouteSummary,
  heightClass,
  onSelectLocation,
}: Omit<DhakaMapPickerProps, 'mapsApiKey' | 'showDirectionsSummary'> & {
  secondaryPinRole?: 'vendor' | 'origin';
  vehicleMode?: DeliveryVehicleMode;
  routeSummary?: LiveRouteTrafficSummary | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string>('');
  const onSelectRef = useRef(onSelectLocation);
  const onSelectRiderRef = useRef(onSelectRiderPin);
  const onRouteSummaryRef = useRef(onRouteSummary);
  onSelectRef.current = onSelectLocation;
  onSelectRiderRef.current = onSelectRiderPin;
  onRouteSummaryRef.current = onRouteSummary;

  const reverseSeqRef = useRef(0);
  const [resolving, setResolving] = useState(false);
  const [osmRouteCoords, setOsmRouteCoords] = useState<Array<[number, number]>>([]);

  const pinAppearance = resolveMapPinAppearance({
    pinType,
    userName,
    restaurantName,
    markerLabel,
    secondaryLabel: secondaryPoint?.label,
  });

  const baseTelemetry = computeMapRouteTelemetry({
    center,
    secondaryPoint,
    riderPoint,
    riderTarget,
    status: trackingStatus,
    liveDistanceKm,
    liveEtaMinutes,
    vehicleMode,
  });
  const displayDistanceKm =
    routeSummary && routeSummary.distanceKm > 0
      ? routeSummary.distanceKm
      : baseTelemetry?.distanceKm;
  const displayEtaMinutes =
    routeSummary && routeSummary.etaMinutes > 0
      ? routeSummary.etaMinutes
      : baseTelemetry?.etaMinutes;

  const activeOriginLat = riderPoint ? riderPoint.lat : secondaryPoint?.lat;
  const activeOriginLng = riderPoint ? riderPoint.lng : secondaryPoint?.lng;
  const activeDestLat = riderPoint ? (riderTarget?.lat ?? center.lat) : center.lat;
  const activeDestLng = riderPoint ? (riderTarget?.lng ?? center.lng) : center.lng;

  useEffect(() => {
    if (
      typeof activeOriginLat !== 'number' ||
      typeof activeOriginLng !== 'number' ||
      (Math.abs(activeOriginLat - activeDestLat) < 0.00012 &&
        Math.abs(activeOriginLng - activeDestLng) < 0.00012)
    ) {
      setOsmRouteCoords([]);
      return;
    }

    let cancelled = false;
    apiFetch<{
      route: {
        distanceKm: number;
        drivingMinutes: number;
        coordinates?: Array<{ lat: number; lng: number }>;
        trafficSummary?: LiveRouteTrafficSummary;
      };
    }>(
      `/api/free/route?fromLat=${activeOriginLat}&fromLng=${activeOriginLng}&toLat=${activeDestLat}&toLng=${activeDestLng}&steps=1&mode=${vehicleMode}`
    )
      .then((res) => {
        if (cancelled) return;
        const coords = (res.route.coordinates || []).map(
          (c) => [c.lat, c.lng] as [number, number]
        );
        setOsmRouteCoords(coords);
        if (res.route.trafficSummary) {
          onRouteSummaryRef.current?.(res.route.trafficSummary);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeOriginLat, activeOriginLng, activeDestLat, activeDestLng, vehicleMode]);

  const allInsideDhaka = [
    center,
    ...(secondaryPoint ? [secondaryPoint] : []),
    ...(riderPoint ? [riderPoint] : []),
    ...(extraRiders || []),
  ].every((pt) => isPointInsideDhakaMetro(pt.lat, pt.lng));

  const emitOsmLocation = (lat: number, lng: number, preferredAreaName?: string) => {
    const cb = onSelectRef.current;
    if (!cb || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const nearest = resolveNearestAreaFromList(lat, lng, BANGLADESH_AREAS);
    const immediateName =
      preferredAreaName ||
      (nearest.area && nearest.distanceKm <= 6
        ? nearest.area.name
        : `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    const immediateDisplayName = preferredAreaName
      ? `${preferredAreaName}, Bangladesh`
      : nearest.area && nearest.distanceKm <= 6
      ? `${nearest.area.name}, Bangladesh`
      : `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)}), Bangladesh`;

    cb({
      lat,
      lng,
      areaName: immediateName,
      displayName: immediateDisplayName,
    });

    const seq = ++reverseSeqRef.current;
    setResolving(true);
    apiFetch<{ displayName: string; areaName: string }>(
      `/api/free/reverse-geocode?lat=${lat}&lng=${lng}&lang=${lang}`
    )
      .then((res) => {
        if (seq !== reverseSeqRef.current) return;
        const cleanArea =
          preferredAreaName ||
          matchCanonicalAreaFromHints([res.areaName, res.displayName], lat, lng, BANGLADESH_AREAS) ||
          immediateName;
        onSelectRef.current?.({
          lat,
          lng,
          areaName: cleanArea,
          displayName: res.displayName || immediateDisplayName,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (seq === reverseSeqRef.current) {
          setResolving(false);
        }
      });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialZoom =
      (extraRiders && extraRiders.length > 0) || !isPointInsideDhakaMetro(center.lat, center.lng)
        ? 8
        : 15;

    const map = L.map(el, {
      center: [center.lat, center.lng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layersRef.current = group;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize({ animate: false });
          })
        : null;
    resizeObserver?.observe(el);

    return () => {
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      fittedKeyRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (ev: L.LeafletMouseEvent) => {
      if (!interactive) return;
      emitOsmLocation(ev.latlng.lat, ev.latlng.lng);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, lang]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (secondaryPoint) {
      L.polyline(
        [
          [secondaryPoint.lat, secondaryPoint.lng],
          [center.lat, center.lng],
        ],
        {
          color: '#E21B70',
          weight: osmRouteCoords.length > 1 && riderPoint ? 3 : 4,
          opacity: osmRouteCoords.length > 1 ? 0.35 : 0.85,
          dashArray: '8 6',
        }
      ).addTo(group);
    }

    if (osmRouteCoords.length > 1) {
      L.polyline(osmRouteCoords, {
        color: '#1E3A8A',
        weight: 8,
        opacity: 0.3,
      }).addTo(group);
      L.polyline(osmRouteCoords, {
        color:
          routeSummary?.trafficSeverity === 'heavy'
            ? '#DC2626'
            : routeSummary?.trafficSeverity === 'moderate'
            ? '#F59E0B'
            : '#1D4ED8',
        weight: 5.5,
        opacity: 0.94,
      }).addTo(group);

      if (typeof displayEtaMinutes === 'number' && displayEtaMinutes > 0) {
        const midCoord = osmRouteCoords[Math.floor(osmRouteCoords.length / 2)];
        if (midCoord) {
          const etaLabel = formatDurationEstimate(displayEtaMinutes, lang, 'compact');
          const calloutIcon = L.divIcon({
            className: 'foodora-osm-eta-callout !bg-transparent !border-0',
            html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;"><span style="padding:3px 9px;border-radius:8px;background:#1D4ED8;border:1.5px solid #ffffff;color:#ffffff;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.3);">${escapeHtml(etaLabel)}</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          L.marker(midCoord, { icon: calloutIcon, interactive: false }).addTo(group);
        }
      }
    } else if (riderPoint) {
      const target = riderTarget || center;
      L.polyline(
        [
          [riderPoint.lat, riderPoint.lng],
          [target.lat, target.lng],
        ],
        { color: '#1D4ED8', weight: 3.5, opacity: 0.85 }
      ).addTo(group);
    }

    const primaryIcon = L.divIcon({
      className: 'foodora-osm-pin-wrapper !bg-transparent !border-0',
      html: buildLeafletPinHtml(pinAppearance.primaryLabel, pinAppearance.primaryRole),
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    const primaryMarker = L.marker([center.lat, center.lng], {
      icon: primaryIcon,
      draggable: Boolean(interactive),
      title: pinAppearance.primaryLabel,
    }).addTo(group);

    if (interactive) {
      primaryMarker.on('dragend', () => {
        const ll = primaryMarker.getLatLng();
        emitOsmLocation(ll.lat, ll.lng);
      });
    }

    if (secondaryPoint) {
      const secLabel =
        secondaryPinRole === 'origin'
          ? secondaryPoint.label
          : pinAppearance.secondaryLabel || secondaryPoint.label;
      const vendorIcon = L.divIcon({
        className: 'foodora-osm-pin-wrapper !bg-transparent !border-0',
        html: buildLeafletPinHtml(secLabel, secondaryPinRole),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([secondaryPoint.lat, secondaryPoint.lng], {
        icon: vendorIcon,
        title: secLabel,
      }).addTo(group);
    }

    if (riderPoint) {
      const riderIcon = L.divIcon({
        className: 'foodora-osm-rider-wrapper !bg-transparent !border-0',
        html: buildLeafletRiderHtml(riderPoint.label, false, true, vehicleMode),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([riderPoint.lat, riderPoint.lng], {
        icon: riderIcon,
        title: riderPoint.label,
      }).addTo(group);
    }

    extraRiders?.forEach((er) => {
      const erIcon = L.divIcon({
        className: 'foodora-osm-rider-wrapper !bg-transparent !border-0',
        html: buildLeafletRiderHtml(er.label, Boolean(er.selected), er.isAvailable),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const m = L.marker([er.lat, er.lng], {
        icon: erIcon,
        title: er.label,
      }).addTo(group);
      m.on('click', () => {
        onSelectRiderRef.current?.(er.id);
      });
    });

    const multiPoints: Array<[number, number]> = [[center.lat, center.lng]];
    if (secondaryPoint) multiPoints.push([secondaryPoint.lat, secondaryPoint.lng]);
    if (riderPoint) multiPoints.push([riderPoint.lat, riderPoint.lng]);
    if (extraRiders && extraRiders.length > 0) {
      extraRiders.forEach((er) => multiPoints.push([er.lat, er.lng]));
    }

    if (multiPoints.length > 1) {
      const boundsKey = multiPoints.map((pt) => `${pt[0].toFixed(4)},${pt[1].toFixed(4)}`).join('|');
      if (fittedKeyRef.current !== boundsKey) {
        map.fitBounds(L.latLngBounds(multiPoints), { padding: [42, 42], maxZoom: 15 });
        fittedKeyRef.current = boundsKey;
      }
    } else {
      const singleKey = `single:${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
      if (fittedKeyRef.current !== singleKey) {
        map.setView(
          [center.lat, center.lng],
          Math.max(map.getZoom(), isPointInsideDhakaMetro(center.lat, center.lng) ? 15 : 13),
          { animate: true }
        );
        fittedKeyRef.current = singleKey;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    center.lat,
    center.lng,
    pinAppearance.primaryLabel,
    pinAppearance.primaryRole,
    pinAppearance.secondaryLabel,
    secondaryPoint?.lat,
    secondaryPoint?.lng,
    secondaryPoint?.label,
    riderPoint?.lat,
    riderPoint?.lng,
    riderPoint?.label,
    riderTarget?.lat,
    riderTarget?.lng,
    osmRouteCoords,
    routeSummary?.trafficSeverity,
    extraRiders,
    interactive,
  ]);

  const pinButtons = allInsideDhaka
    ? DHAKA_AREAS.slice(0, 6)
    : BANGLADESH_AREAS.filter((a) => MAJOR_BD_CITY_NAMES.has(a.name)).slice(0, 6);

  return (
    <div
      data-testid="osm-free-map"
      className={`relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-[#EEF2F6] ${heightClass || 'h-[260px]'}`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      <span className="pointer-events-none absolute top-2 right-2 z-[400] px-2 py-0.5 rounded-md bg-white/95 border border-emerald-200 text-[10px] font-bold text-emerald-700 shadow-xs">
        🌍 OpenStreetMap · Free
      </span>

      {typeof displayDistanceKm === 'number' && typeof displayEtaMinutes === 'number' && (
        <MapLiveTelemetryBadge
          lang={lang}
          distanceKm={displayDistanceKm}
          etaMinutes={displayEtaMinutes}
          trafficSummary={routeSummary}
          vehicleMode={vehicleMode}
          className={
            telemetryBadgeClassName ||
            (interactive ? 'absolute bottom-12 left-2.5' : 'absolute bottom-10 left-2.5')
          }
        />
      )}

      {interactive && (
        <div className="absolute top-2 left-12 right-36 z-[400] hidden sm:flex items-center gap-1 overflow-x-auto no-scrollbar pointer-events-auto">
          {pinButtons.map((area) => {
            const isClose =
              Math.abs(area.lat - center.lat) < 0.008 && Math.abs(area.lng - center.lng) < 0.008;
            return (
              <button
                key={area.name}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  emitOsmLocation(area.lat, area.lng, area.name);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shadow-xs transition-colors ${
                  isClose
                    ? 'bg-[#E21B70] text-white'
                    : 'bg-white/95 text-[#2E3138] border border-neutral-200 hover:border-[#E21B70]'
                }`}
              >
                {area.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 z-[400] flex items-center justify-between gap-2 bg-white/95 backdrop-blur-xs border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-600 shadow-xs">
        <span className="truncate">
          {resolving ? (
            <span className="font-medium text-[#E21B70]">
              {lang === 'bn' ? 'ঠিকানা নির্ধারণ হচ্ছে...' : 'Resolving street address...'}
            </span>
          ) : (
            <span className="font-mono-nums">
              {interactive
                ? lang === 'bn'
                  ? 'ম্যাপে ক্লিক বা পিন টানুন · '
                  : 'Tap map or drag pin · '
                : ''}
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
              {typeof displayDistanceKm === 'number' && typeof displayEtaMinutes === 'number'
                ? ` · ${displayDistanceKm.toFixed(1)} ${lang === 'bn' ? 'কিমি' : 'km'} · ~${formatDurationEstimate(displayEtaMinutes, lang)}`
                : ''}
              {riderPoint ? ` · Rider ${riderPoint.lat.toFixed(4)}, ${riderPoint.lng.toFixed(4)}` : ''}
            </span>
          )}
        </span>
        {interactive && (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => emitOsmLocation(pos.coords.latitude, pos.coords.longitude),
                  () => emitOsmLocation(23.7949, 90.4144, 'Gulshan 2')
                );
              } else {
                emitOsmLocation(23.7949, 90.4144, 'Gulshan 2');
              }
            }}
            className="inline-flex items-center gap-1 text-[#E21B70] font-bold hover:underline whitespace-nowrap shrink-0"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>GPS</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function DhakaMapPicker(props: DhakaMapPickerProps) {
  const effectiveApiKey =
    props.mapsApiKey || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

  const [useFallback, setUseFallback] = useState<boolean>(() => {
    if (!effectiveApiKey) return true;
    if (isGoogleMapsBlockedInSession()) return true;
    return getPreferredMapMode() === 'osm';
  });
  const [activeMethod, setActiveMethod] = useState<'gps' | 'google_maps' | 'wifi' | 'cell_tower' | 'pin'>('google_maps');
  const [positioningNote, setPositioningNote] = useState<string>('');
  const [showGuide, setShowGuide] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const normalizedRiderVehicle = normalizeDeliveryVehicleMode(props.riderVehicleType);
  const [selectedVehicleMode, setSelectedVehicleMode] = useState<DeliveryVehicleMode>(
    normalizedRiderVehicle
  );
  useEffect(() => {
    if (props.riderVehicleType) {
      setSelectedVehicleMode(normalizeDeliveryVehicleMode(props.riderVehicleType));
    }
  }, [props.riderVehicleType]);

  const interactiveRouteEnabled =
    props.enableInteractivePointRoute ??
    Boolean(props.interactive && !props.secondaryPoint && !props.riderPoint);

  // Capture interactive starting point when moving from place A -> B across all interactive maps
  const [interactiveStartPoint, setInteractiveStartPoint] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(() =>
    interactiveRouteEnabled
      ? {
          lat: props.center.lat,
          lng: props.center.lng,
          label: props.markerLabel || (props.lang === 'bn' ? 'শুরু' : 'Your location'),
        }
      : null
  );

  useEffect(() => {
    if (interactiveRouteEnabled && !interactiveStartPoint) {
      setInteractiveStartPoint({
        lat: props.center.lat,
        lng: props.center.lng,
        label: props.markerLabel || (props.lang === 'bn' ? 'শুরু' : 'Your location'),
      });
    }
  }, [interactiveRouteEnabled, interactiveStartPoint, props.center.lat, props.center.lng, props.markerLabel, props.lang]);

  const movedFromExternalOrigin =
    Boolean(props.originPoint) &&
    !props.secondaryPoint &&
    !props.riderPoint &&
    (Math.abs((props.originPoint?.lat ?? 0) - props.center.lat) > 0.0012 ||
      Math.abs((props.originPoint?.lng ?? 0) - props.center.lng) > 0.0012);

  const movedEnoughFromInteractiveStart =
    !movedFromExternalOrigin &&
    interactiveRouteEnabled &&
    Boolean(interactiveStartPoint) &&
    !props.secondaryPoint &&
    !props.riderPoint &&
    (Math.abs((interactiveStartPoint?.lat ?? 0) - props.center.lat) > 0.0012 ||
      Math.abs((interactiveStartPoint?.lng ?? 0) - props.center.lng) > 0.0012);

  const isInteractiveOrigin = movedFromExternalOrigin || movedEnoughFromInteractiveStart;
  const effectiveSecondaryPoint =
    props.secondaryPoint ||
    (movedFromExternalOrigin && props.originPoint
      ? props.originPoint
      : movedEnoughFromInteractiveStart && interactiveStartPoint
      ? interactiveStartPoint
      : undefined);
  const secondaryPinRole: 'vendor' | 'origin' = props.secondaryPoint ? 'vendor' : 'origin';

  const hasRouteContext = Boolean(effectiveSecondaryPoint || props.riderPoint);

  // Keep Google Maps' full-city green TrafficLayer OFF by default so maps stay clean like Google Maps A->B view;
  // only the active A->B route displays live traffic colors unless the user toggles citywide overlay ON.
  const [trafficEnabled, setTrafficEnabled] = useState<boolean>(false);

  const [directionsOpen, setDirectionsOpen] = useState<boolean>(false);
  const [routeSummary, setRouteSummary] = useState<LiveRouteTrafficSummary | null>(null);
  const initialMapLangRef = useRef<Lang>(props.lang);

  const handleRouteSummaryUpdate = (summary: LiveRouteTrafficSummary | null) => {
    setRouteSummary(summary);
    props.onRouteSummary?.(summary);
  };

  useEffect(() => {
    if (!effectiveApiKey || isGoogleMapsBlockedInSession()) {
      setUseFallback(true);
      return;
    }
    const handleAuthFailure = () => {
      setGoogleMapsBlockedInSession(true);
      setUseFallback(true);
      setPositioningNote(
        props.lang === 'bn'
          ? '⚠️ গুগল ম্যাপস লোড হয়নি বা এপিআই রেস্ট্রিকশন সমস্যা — ফ্রি OpenStreetMap চালু হয়েছে'
          : '⚠️ Google Maps auth/loading error detected — switched to free interactive OpenStreetMap.'
      );
    };
    window.addEventListener('gm_authFailure', handleAuthFailure);

    const handleQuotaExceeded = () => {
      setGoogleMapsBlockedInSession(true);
      setUseFallback(true);
      setPositioningNote(
        props.lang === 'bn'
          ? '⚠️ গুগল ম্যাপস দৈনিক কোটা পূর্ণ হয়েছে — ফ্রি OpenStreetMap চালু হয়েছে'
          : '⚠️ Google Maps quota reached — switched to unlimited free OpenStreetMap.'
      );
    };
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);

    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && !(window as any).google?.maps && !useFallback) {
        setUseFallback(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('gm_authFailure', handleAuthFailure);
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      clearTimeout(timer);
    };
  }, [effectiveApiKey, props.lang, useFallback]);

  const handleSelectLocation = (coords: {
    lat: number;
    lng: number;
    areaName?: string;
    displayName?: string;
  }) => {
    setActiveMethod('pin');
    setPositioningNote(
      props.lang === 'bn'
        ? `📍 ম্যাপ পিন: ${coords.areaName || 'নির্বাচিত স্থান'} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        : `📍 Location Pin: ${coords.areaName || 'Selected point'} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
    );
    props.onSelectLocation?.(coords);
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setPositioningNote(
        props.lang === 'bn' ? 'ব্রাউজারে GPS সাপোর্ট নেই' : 'Geolocation not supported in browser'
      );
      return;
    }
    setDetecting(true);
    setPositioningNote(
      props.lang === 'bn' ? 'স্যাটেলাইট জিপিএস সিগন্যাল খোঁজা হচ্ছে...' : 'Acquiring GPS / GNSS satellite signal...'
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false);
        setActiveMethod('gps');
        const acc = Math.round(pos.coords.accuracy);
        setPositioningNote(
          props.lang === 'bn'
            ? `🛰️ GPS / GNSS স্যাটেলাইট লক (নির্ভুলতা: ±${acc} মি)`
            : `🛰️ GPS / GNSS Satellite Locked (accuracy: ±${acc}m)`
        );
        props.onSelectLocation?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setDetecting(false);
        setPositioningNote(
          props.lang === 'bn'
            ? 'জিপিএস সিগন্যাল পাওয়া যায়নি, ডিফল্ট লোকেশন সক্রিয়'
            : 'Satellite fix timed out, falling back to default location'
        );
        props.onSelectLocation?.({
          lat: 23.7949,
          lng: 90.4144,
          areaName: 'Gulshan 2',
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleDetectWifiOrCell = () => {
    if (!navigator.geolocation) {
      setPositioningNote(
        props.lang === 'bn' ? 'ব্রাউজারে নেটওয়ার্ক লোকেশন সাপোর্ট নেই' : 'Network location not supported'
      );
      return;
    }
    setDetecting(true);
    setPositioningNote(
      props.lang === 'bn'
        ? 'ওয়াইফাই / মোবাইল টাওয়ার অবস্থান যাচাই হচ্ছে...'
        : 'Estimating location via Wi-Fi / Cell tower...'
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false);
        setActiveMethod('wifi');
        const acc = Math.round(pos.coords.accuracy);
        setPositioningNote(
          props.lang === 'bn'
            ? `📶 ওয়াইফাই / সেলুলার টাওয়ার অবস্থান (±${acc} মি)`
            : `📶 Wi-Fi / Cell Tower Network Estimated (±${acc}m)`
        );
        props.onSelectLocation?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setDetecting(false);
        setPositioningNote(
          props.lang === 'bn'
            ? 'নেটওয়ার্ক পজিশনিং ব্যর্থ, ম্যাপ পিন দিয়ে নির্বাচন করুন'
            : 'Network estimate unavailable, please drag map pin'
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleMapsCrashOrAuthFailure = () => {
    setGoogleMapsBlockedInSession(true);
    setPreferredMapMode('osm');
    setUseFallback(true);
    setPositioningNote(
      props.lang === 'bn'
        ? '⚠️ গুগল ম্যাপস লোড হয়নি বা এপিআই কী চালু নেই — ফ্রি OpenStreetMap চালু হয়েছে'
        : '⚠️ Google Maps failed to authenticate/activate — switched safely to OpenStreetMap.'
    );
  };

  const mapContent =
    !effectiveApiKey || useFallback ? (
      <FallbackDhakaMap
        lang={props.lang}
        center={props.center}
        markerLabel={props.markerLabel}
        pinType={props.pinType}
        userName={props.userName}
        restaurantName={props.restaurantName}
        secondaryPoint={effectiveSecondaryPoint}
        secondaryPinRole={secondaryPinRole}
        riderPoint={props.riderPoint}
        riderTarget={props.riderTarget}
        vehicleMode={selectedVehicleMode}
        liveDistanceKm={props.liveDistanceKm}
        liveEtaMinutes={props.liveEtaMinutes}
        trackingStatus={props.trackingStatus}
        telemetryBadgeClassName={props.telemetryBadgeClassName}
        extraRiders={props.extraRiders}
        onSelectRiderPin={props.onSelectRiderPin}
        interactive={props.interactive}
        showTraffic={trafficEnabled}
        routeSummary={routeSummary}
        onRouteSummary={handleRouteSummaryUpdate}
        heightClass={props.heightClass}
        onSelectLocation={handleSelectLocation}
      />
    ) : (
      <GoogleMapErrorBoundary onCrash={handleMapsCrashOrAuthFailure}>
        <APIProvider
          apiKey={effectiveApiKey}
          language={initialMapLangRef.current}
          region="BD"
          libraries={GOOGLE_MAP_LIBRARIES}
          onError={handleMapsCrashOrAuthFailure}
        >
          <GoogleMapInner
            lang={props.lang}
            center={props.center}
            markerLabel={props.markerLabel}
            pinType={props.pinType}
            userName={props.userName}
            restaurantName={props.restaurantName}
            secondaryPoint={effectiveSecondaryPoint}
            secondaryPinRole={secondaryPinRole}
            riderPoint={props.riderPoint}
            riderTarget={props.riderTarget}
            vehicleMode={selectedVehicleMode}
            liveDistanceKm={props.liveDistanceKm}
            liveEtaMinutes={props.liveEtaMinutes}
            trackingStatus={props.trackingStatus}
            telemetryBadgeClassName={props.telemetryBadgeClassName}
            extraRiders={props.extraRiders}
            onSelectRiderPin={props.onSelectRiderPin}
            interactive={props.interactive}
            showTraffic={trafficEnabled}
            routeSummary={routeSummary}
            onRouteSummary={handleRouteSummaryUpdate}
            heightClass={props.heightClass}
            onSelectLocation={handleSelectLocation}
          />
        </APIProvider>
      </GoogleMapErrorBoundary>
    );

  const fallbackRouteTelemetry = computeMapRouteTelemetry({
    center: props.center,
    secondaryPoint: effectiveSecondaryPoint,
    riderPoint: props.riderPoint,
    riderTarget: props.riderTarget,
    status: props.trackingStatus,
    liveDistanceKm: props.liveDistanceKm,
    liveEtaMinutes: props.liveEtaMinutes,
    vehicleMode: selectedVehicleMode,
  });

  const summaryDistanceKm =
    routeSummary && routeSummary.distanceKm > 0
      ? routeSummary.distanceKm
      : fallbackRouteTelemetry?.distanceKm;
  const summaryEtaMin =
    routeSummary && routeSummary.etaMinutes > 0
      ? routeSummary.etaMinutes
      : fallbackRouteTelemetry?.etaMinutes;

  const navOriginLat = props.riderPoint
    ? props.riderPoint.lat
    : effectiveSecondaryPoint?.lat;
  const navOriginLng = props.riderPoint
    ? props.riderPoint.lng
    : effectiveSecondaryPoint?.lng;
  const navDestLat = props.riderPoint
    ? (props.riderTarget?.lat ?? props.center.lat)
    : props.center.lat;
  const navDestLng = props.riderPoint
    ? (props.riderTarget?.lng ?? props.center.lng)
    : props.center.lng;
  const navGoogleMode =
    selectedVehicleMode === 'bicycle'
      ? 'bicycling'
      : selectedVehicleMode === 'walking'
      ? 'walking'
      : 'driving';
  const googleMapsDirUrl =
    typeof navOriginLat === 'number' && typeof navOriginLng === 'number'
      ? `https://www.google.com/maps/dir/?api=1&origin=${navOriginLat},${navOriginLng}&destination=${navDestLat},${navDestLng}&travelmode=${navGoogleMode}`
      : `https://www.google.com/maps/dir/?api=1&destination=${navDestLat},${navDestLng}&travelmode=${navGoogleMode}`;

  const activeVehicleMeta = getDeliveryVehicleMeta(selectedVehicleMode);
  const selectableVehicles = DELIVERY_VEHICLE_MODES.filter((v) => v.mode !== 'walking');
  const shouldShowDirectionsPanel =
    props.showDirectionsSummary !== false && hasRouteContext;

  const canSwapAbRoute = Boolean(
    props.onSwapInteractiveRoute ||
      (isInteractiveOrigin && effectiveSecondaryPoint && props.onSelectLocation)
  );

  const handleSwapAbRoute = () => {
    if (props.onSwapInteractiveRoute) {
      props.onSwapInteractiveRoute();
      return;
    }
    if (!effectiveSecondaryPoint || !props.onSelectLocation) return;
    const prevDest = {
      lat: props.center.lat,
      lng: props.center.lng,
      label: props.markerLabel || (props.lang === 'bn' ? 'শুরু' : 'Your location'),
    };
    const prevStart = { ...effectiveSecondaryPoint };
    setInteractiveStartPoint(prevDest);
    props.onSelectLocation({
      lat: prevStart.lat,
      lng: prevStart.lng,
      areaName: prevStart.label,
    });
  };

  const abOriginLabel = props.riderPoint
    ? props.riderPoint.label
    : effectiveSecondaryPoint?.label || (props.lang === 'bn' ? 'শুরুর স্থান' : 'Your location');
  const abDestLabel =
    props.markerLabel ||
    (props.lang === 'bn'
      ? `গন্তব্য (${props.center.lat.toFixed(4)}, ${props.center.lng.toFixed(4)})`
      : `Destination (${props.center.lat.toFixed(4)}, ${props.center.lng.toFixed(4)})`);

  const interactiveAbBar = hasRouteContext ? (
    <div
      data-testid="interactive-ab-bar"
      className="mb-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-xs flex items-center justify-between gap-2 text-xs"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1A73E8] ring-4 ring-[#3B82F6]/20 shrink-0" />
          <span className="text-[11px] font-semibold text-neutral-500 shrink-0">
            {props.lang === 'bn' ? 'শুরু:' : 'From:'}
          </span>
          <span className="font-bold text-[#2E3138] truncate">{abOriginLabel}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-[#DC2626] shrink-0 -ml-0.5" />
          <span className="text-[11px] font-semibold text-neutral-500 shrink-0">
            {props.lang === 'bn' ? 'গন্তব্য:' : 'To:'}
          </span>
          <span className="font-bold text-[#2E3138] truncate">{abDestLabel}</span>
        </div>
      </div>
      {(canSwapAbRoute || (isInteractiveOrigin && props.interactive)) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {canSwapAbRoute && (
            <button
              type="button"
              data-testid="swap-ab-route-btn"
              onClick={handleSwapAbRoute}
              title={props.lang === 'bn' ? 'শুরু ও গন্তব্য অদলবদল' : 'Swap origin and destination'}
              className="p-1.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#1A73E8] hover:text-[#1A73E8] text-neutral-600 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          )}
          {isInteractiveOrigin && props.interactive && (
            <button
              type="button"
              onClick={() => {
                if (props.onClearInteractiveRoute) {
                  props.onClearInteractiveRoute();
                } else {
                  setInteractiveStartPoint({
                    lat: props.center.lat,
                    lng: props.center.lng,
                    label: props.markerLabel || (props.lang === 'bn' ? 'শুরু' : 'Your location'),
                  });
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-[11px] font-bold text-[#E21B70]"
            >
              {props.lang === 'bn' ? 'রিসেট' : 'Set Start'}
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  const directionsPanel = shouldShowDirectionsPanel ? (
    <div
      data-testid="live-directions-panel"
      className="mt-2.5 rounded-xl border border-neutral-200 bg-white p-3 space-y-2.5 text-xs shadow-xs"
    >
      {/* Clean Google Maps–Style Vehicle Mode Tabs + Traffic Toggle */}
      {(props.showVehicleSelector ?? true) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100">
          <div
            role="group"
            aria-label={props.lang === 'bn' ? 'ডেলিভারি বাহন নির্বাচন' : 'Select vehicle mode'}
            data-testid="vehicle-mode-selector"
            className="flex flex-wrap items-center gap-1"
          >
            {selectableVehicles.map((vm) => {
              const isSelected = selectedVehicleMode === vm.mode;
              const isAssigned = props.riderVehicleType
                ? normalizeDeliveryVehicleMode(props.riderVehicleType) === vm.mode
                : false;
              return (
                <button
                  key={vm.mode}
                  type="button"
                  data-testid={`vehicle-mode-${vm.mode}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedVehicleMode(vm.mode)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${
                    isSelected
                      ? 'bg-[#2E3138] border-[#2E3138] text-white shadow-xs'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:border-[#E21B70] hover:text-[#E21B70]'
                  }`}
                >
                  <VehicleModeIcon mode={vm.mode} className="w-3.5 h-3.5 shrink-0" />
                  <span>{props.lang === 'bn' ? vm.labelBn : vm.labelEn}</span>
                  {isAssigned && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-emerald-400' : 'bg-emerald-600'
                      }`}
                      title={props.lang === 'bn' ? 'রাইডারের বাহন' : 'Rider vehicle'}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {movedEnoughFromInteractiveStart && (
            <button
              type="button"
              onClick={() =>
                setInteractiveStartPoint({
                  lat: props.center.lat,
                  lng: props.center.lng,
                  label: props.markerLabel || (props.lang === 'bn' ? 'শুরু' : 'Start'),
                })
              }
              className="px-2.5 py-1 rounded-full border border-neutral-200 bg-neutral-50 hover:border-[#E21B70] text-[10px] font-bold text-[#E21B70]"
            >
              {props.lang === 'bn' ? 'শুরুর স্থান সেট করুন' : 'Set New Start'}
            </button>
          )}
        </div>
      )}

      {/* Single Focused Distance, ETA, Traffic Severity & Quick Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const sev = routeSummary?.trafficSeverity;
            const colors = getTrafficBadgeClasses(sev);
            return (
              <span
                data-testid="live-traffic-severity"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${colors.pill}`}
              >
                {sev === 'heavy' ? (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                )}
                <span>
                  {routeSummary
                    ? props.lang === 'bn'
                      ? routeSummary.trafficLabelBn
                      : routeSummary.trafficLabelEn
                    : props.lang === 'bn'
                    ? 'লাইভ ট্রাফিক হিসাব হচ্ছে...'
                    : 'Calculating live route...'}
                </span>
              </span>
            );
          })()}

          {typeof summaryDistanceKm === 'number' && typeof summaryEtaMin === 'number' && (
            <span
              data-testid="live-route-distance-eta-pill"
              className="font-extrabold text-[#2E3138] tabular-nums"
            >
              {summaryDistanceKm.toFixed(1)} {props.lang === 'bn' ? 'কিমি' : 'km'} · ~
              {formatDurationEstimate(summaryEtaMin, props.lang)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!useFallback && effectiveApiKey && (
            <button
              type="button"
              data-testid="map-traffic-toggle"
              onClick={() => setTrafficEnabled((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                trafficEnabled
                  ? 'bg-[#1A73E8] border-[#1A73E8] text-white'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:border-[#1A73E8]'
              }`}
            >
              <Layers className="w-3 h-3 shrink-0" />
              <span>
                {trafficEnabled
                  ? props.lang === 'bn'
                    ? 'সব রাস্তার ট্রাফিক: চালু'
                    : 'All-Road Traffic: ON'
                  : props.lang === 'bn'
                  ? 'সব রাস্তার ট্রাফিক: বন্ধ'
                  : 'All-Road Traffic: OFF'}
              </span>
            </button>
          )}

          <a
            href={googleMapsDirUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 bg-white hover:border-[#E21B70] text-[#E21B70] text-[11px] font-semibold"
          >
            <Navigation className="w-3 h-3 shrink-0" />
            <span>{props.lang === 'bn' ? 'Google Maps' : 'Open Maps'}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </a>

          <button
            type="button"
            data-testid="toggle-directions-steps"
            onClick={() => setDirectionsOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50 hover:border-neutral-300 text-neutral-700 text-[11px] font-semibold"
          >
            <span>
              {props.lang === 'bn'
                ? `ডিরেকশন (${routeSummary?.steps.length ?? 0})`
                : `Directions (${routeSummary?.steps.length ?? 0})`}
            </span>
            {directionsOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Compact Traffic Legend & Mode Guidance */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600">
        <span>
          {routeSummary
            ? props.lang === 'bn'
              ? routeSummary.jamAreasTextBn
              : routeSummary.jamAreasTextEn
            : props.lang === 'bn'
            ? 'রাস্তার লাইভ যানজট ও দূরত্ব যাচাই হচ্ছে'
            : 'Checking live street speed & route path'}
        </span>
        <div className="flex items-center gap-2.5 text-[10px] font-semibold text-neutral-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-1 rounded-full bg-[#1A73E8]" />
            {props.lang === 'bn' ? 'স্বাভাবিক' : 'Clear'}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-1 rounded-full bg-[#F59E0B]" />
            {props.lang === 'bn' ? 'ধীরগতি' : 'Slow'}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-1 rounded-full bg-[#DC2626]" />
            {props.lang === 'bn' ? 'জ্যাম (লাল)' : 'Jam (Red)'}
          </span>
        </div>
      </div>

      {activeVehicleMeta.isBetaRoute && (
        <p className="text-[10px] text-neutral-500">
          {props.lang === 'bn'
            ? 'নোট: সাইকেল ও বাইক রুট বিটা পর্যায়ে রয়েছে — কিছু রাস্তায় আলাদা লেন নাও থাকতে পারে।'
            : 'Note: Bicycling & two-wheel routes are in beta; always follow local road lanes.'}
        </p>
      )}

      {directionsOpen && routeSummary && routeSummary.steps.length > 0 && (
        <ol className="max-h-40 overflow-y-auto space-y-1.5 pt-2 border-t border-neutral-100 pr-1">
          {routeSummary.steps.map((step, idx) => (
            <li
              key={`${idx}-${step.instruction.slice(0, 16)}`}
              className="flex items-start justify-between gap-2 bg-neutral-50 border border-neutral-200/70 rounded-lg px-2.5 py-1.5"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-[#FFF0F6] text-[#E21B70] text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex items-start gap-1.5">
                  <CornerUpRight className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium text-[#2E3138] leading-snug">
                    {step.instruction}
                  </span>
                </div>
              </div>
              {step.distanceMeters > 0 && (
                <span className="text-[10px] font-bold text-neutral-500 tabular-nums whitespace-nowrap shrink-0 mt-0.5">
                  {formatDirectionStepDistance(step.distanceMeters, props.lang)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  ) : null;

  if (!props.interactive) {
    return (
      <div>
        {interactiveAbBar}
        {mapContent}
        {directionsPanel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {interactiveAbBar}
      {mapContent}
      {directionsPanel}

      {/* Clean Single-Row Positioning Controls & Expandable 5-Method Guide */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/90 px-3 py-2 space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {effectiveApiKey && (
              <button
                type="button"
                onClick={() => {
                  const nextFallback = !useFallback;
                  if (!nextFallback) {
                    setGoogleMapsBlockedInSession(false);
                    setPreferredMapMode('google');
                  } else {
                    setPreferredMapMode('osm');
                  }
                  setUseFallback(nextFallback);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold text-[11px] bg-white border-neutral-200 hover:border-[#E21B70] text-[#E21B70]"
                title="Switch between Google Maps and Free OpenStreetMap"
              >
                <span>
                  {useFallback
                    ? props.lang === 'bn'
                      ? '🗺️ গুগল ম্যাপস চেষ্টা করুন'
                      : '🗺️ Try Google Maps'
                    : props.lang === 'bn'
                    ? '🌍 ফ্রি OpenStreetMap'
                    : '🌍 Free OpenStreetMap'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={detecting}
              onClick={handleDetectGps}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold text-[11px] transition-colors disabled:opacity-50 ${
                activeMethod === 'gps'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-neutral-200 hover:border-emerald-500 text-neutral-700'
              }`}
              title="GPS / GNSS Satellite Positioning"
            >
              <Satellite className="w-3 h-3 shrink-0" />
              <span>{props.lang === 'bn' ? 'GPS' : 'GPS'}</span>
            </button>

            <button
              type="button"
              disabled={detecting}
              onClick={handleDetectWifiOrCell}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold text-[11px] transition-colors disabled:opacity-50 ${
                activeMethod === 'wifi' || activeMethod === 'cell_tower'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-neutral-200 hover:border-blue-500 text-neutral-700'
              }`}
              title="Wi-Fi / Cell Tower Positioning"
            >
              <Wifi className="w-3 h-3 shrink-0" />
              <span>{props.lang === 'bn' ? 'ওয়াইফাই / সেল' : 'Wi-Fi / Cell'}</span>
            </button>

            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-500">
              <MapPin className="w-3 h-3 text-[#E21B70] shrink-0" />
              <span>
                {activeMethod === 'gps'
                  ? 'GPS/GNSS'
                  : activeMethod === 'wifi'
                  ? 'Wi-Fi'
                  : activeMethod === 'cell_tower'
                  ? 'Cell Tower'
                  : activeMethod === 'pin'
                  ? 'Location Pin'
                  : effectiveApiKey && !useFallback
                  ? 'Google Maps'
                  : 'Map Pin'}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-200/60 text-neutral-600 hover:text-[#2E3138] text-[11px] font-medium transition-colors"
            title="View all 5 location positioning methods"
          >
            <Info className="w-3 h-3 shrink-0 text-[#E21B70]" />
            <span>{props.lang === 'bn' ? 'লোকেশন পদ্ধতি' : 'Methods Guide'}</span>
            {showGuide ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
          </button>
        </div>

        {/* Live status feedback line */}
        {positioningNote && (
          <p className="text-[11px] text-neutral-700 font-medium flex items-center gap-1.5 pt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E21B70] shrink-0" />
            <span>{positioningNote}</span>
          </p>
        )}

        {/* Expandable Location Positioning Methods Details (Exact User Specifications) */}
        {showGuide && (
          <div className="pt-2 border-t border-neutral-200 space-y-1.5 text-[11px] text-neutral-700 bg-white rounded-lg p-2.5">
            <p className="font-bold text-[#2E3138] text-xs">
              {props.lang === 'bn' ? 'সিস্টেমের ৫টি লোকেশন ও পজিশনিং পদ্ধতি:' : '5 Integrated Location Positioning Mechanisms:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed">
              <div className="p-1.5 rounded bg-emerald-50/70 border border-emerald-200">
                <p className="font-bold text-emerald-800 flex items-center gap-1">
                  <Satellite className="w-3 h-3 shrink-0" />
                  <span>GPS / GNSS (স্যাটেলাইট)</span>
                </p>
                <p className="text-neutral-600">
                  {props.lang === 'bn'
                    ? 'স্যাটেলাইট থেকে আপনার বর্তমান অবস্থান ও latitude-longitude নির্ণয় করে।'
                    : 'Determines precise geographical latitude & longitude directly from global satellites.'}
                </p>
              </div>

              <div className="p-1.5 rounded bg-pink-50/70 border border-pink-200">
                <p className="font-bold text-[#E21B70] flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>Google Maps Platform</span>
                </p>
                <p className="text-neutral-600">
                  {props.lang === 'bn'
                    ? 'অনেক ক্ষেত্রে ম্যাপ দেখানো, রাস্তা, লোকেশন ও address selection-এর জন্য Google Maps services ব্যবহার করে।'
                    : 'Renders map views, driving roads, place search, and reverse geocoding services.'}
                </p>
              </div>

              <div className="p-1.5 rounded bg-blue-50/70 border border-blue-200">
                <p className="font-bold text-blue-800 flex items-center gap-1">
                  <Wifi className="w-3 h-3 shrink-0" />
                  <span>Wi-Fi positioning</span>
                </p>
                <p className="text-neutral-600">
                  {props.lang === 'bn'
                    ? 'আশেপাশের Wi-Fi নেটওয়ার্ক থেকে location estimate করতে পারে।'
                    : 'Estimates indoor and urban location by triangulating nearby Wi-Fi network signals.'}
                </p>
              </div>

              <div className="p-1.5 rounded bg-amber-50/70 border border-amber-200">
                <p className="font-bold text-amber-800 flex items-center gap-1">
                  <Radio className="w-3 h-3 shrink-0" />
                  <span>Cell tower (Mobile network)</span>
                </p>
                <p className="text-neutral-600">
                  {props.lang === 'bn'
                    ? 'মোবাইল নেটওয়ার্কের tower থেকেও আনুমানিক অবস্থান শনাক্ত করা সম্ভব।'
                    : 'Detects coarse geographic location from cellular carrier base-station towers.'}
                </p>
              </div>
            </div>

            <div className="p-1.5 rounded bg-neutral-100 border border-neutral-300">
              <p className="font-bold text-neutral-800 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#E21B70] shrink-0" />
                <span>Location pin (ম্যাপ পিন)</span>
              </p>
              <p className="text-neutral-600">
                {props.lang === 'bn'
                  ? 'গ্রাহক নিজে ম্যাপে pin সরিয়ে delivery address নির্ধারণ করতে পারেন।'
                  : 'Customer can manually drag or tap the pin on the map to accurately pinpoint delivery doorstep.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
