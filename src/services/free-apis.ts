import {
  buildOsrmDirectionInstruction,
  cleanMapAddressSegments,
  expandAddressSearchQueries,
  filterAndRankRemoteSuggestions,
  findLocalAddressSuggestions,
  getDeliveryVehicleMeta,
  haversineDistanceKm,
  isWithinBangladesh,
  mapOpenMeteoWeather,
  matchCanonicalAreaFromHints,
  mergeAddressSuggestions,
  normalizeDeliveryVehicleMode,
  summarizeTrafficCongestion,
  type DeliveryVehicleMode,
  type LiveRouteTrafficSummary,
  type RouteDirectionStep,
} from '../lib/marketplace-logic.ts';
import { BANGLADESH_AREAS, BANGLADESH_SEARCH_PLACES } from '../lib/i18n.ts';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export interface DhakaWeatherSummary {
  tempC: number;
  windKmh: number;
  precipitationMm: number;
  weatherCode: number;
  labelEn: string;
  labelBn: string;
  isRaining: boolean;
  rainBufferMin: number;
  source: string;
}

export async function fetchDhakaWeather(lat: number, lng: number): Promise<DhakaWeatherSummary> {
  const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = getCached<DhakaWeatherSummary>(key);
  if (cached) return cached;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FDhaka`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        precipitation?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const tempC = Math.round(data.current?.temperature_2m ?? 28);
    const precipitationMm = Number(data.current?.precipitation ?? 0);
    const weatherCode = Number(data.current?.weather_code ?? 0);
    const windKmh = Math.round(data.current?.wind_speed_10m ?? 8);
    const mapped = mapOpenMeteoWeather(weatherCode, precipitationMm);

    return setCached(
      key,
      {
        tempC,
        windKmh,
        precipitationMm,
        weatherCode,
        ...mapped,
        source: 'Open-Meteo',
      },
      15 * 60 * 1000
    );
  } catch {
    return {
      tempC: 28,
      windKmh: 9,
      precipitationMm: 0,
      weatherCode: 1,
      labelEn: 'Clear Sky',
      labelBn: 'পরিষ্কার আকাশ',
      isRaining: false,
      rainBufferMin: 0,
      source: 'Fallback',
    };
  }
}

export interface OsmPlaceSuggestion {
  displayName: string;
  shortName: string;
  subtitle?: string;
  lat: number;
  lng: number;
  source: 'area' | 'map' | 'recent';
}

async function fetchPhotonBangladeshPlaces(
  query: string,
  biasLat: number,
  biasLng: number
): Promise<OsmPlaceSuggestion[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      query
    )}&lat=${biasLat}&lon=${biasLng}&limit=10&lang=en&bbox=88.0,20.5,92.7,26.7`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FoodoraBD-Marketplace/1.0' },
      signal: AbortSignal.timeout(3200),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          name?: string;
          housenumber?: string;
          street?: string;
          locality?: string;
          district?: string;
          city?: string;
          county?: string;
          state?: string;
          country?: string;
          countrycode?: string;
        };
      }>;
    };
    const out: OsmPlaceSuggestion[] = [];
    for (const f of data.features || []) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const p = f.properties || {};
      if (p.countrycode && p.countrycode.toUpperCase() !== 'BD') continue;
      if (!isWithinBangladesh(lat, lng)) continue;

      const rawTitle = (p.name || '').split(';')[0]?.trim() || p.street || p.district || p.city || 'Bangladesh';
      const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
      const areaLine = [p.locality, p.district, p.city || p.county].filter(Boolean);
      const displayParts = cleanMapAddressSegments(
        [rawTitle, streetLine, ...areaLine, 'Bangladesh'].filter(Boolean).join(', ')
      );
      const displayName =
        displayParts.length > 0 ? `${displayParts.slice(0, 4).join(', ')}, Bangladesh` : `${rawTitle}, Bangladesh`;
      const subtitle = areaLine.slice(0, 2).join(' · ') || p.state || 'Bangladesh Map';

      out.push({
        displayName,
        shortName: rawTitle,
        subtitle,
        lat,
        lng,
        source: 'map',
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchGooglePlacesTextSearch(
  query: string,
  biasLat: number,
  biasLng: number
): Promise<OsmPlaceSuggestion[]> {
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    '';
  if (!apiKey) return [];
  try {
    const qWithBd = query.toLowerCase().includes('bangladesh') ? query : `${query}, Bangladesh`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      qWithBd
    )}&location=${biasLat},${biasLng}&radius=50000&region=bd&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3200) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    if (data.status !== 'OK' || !Array.isArray(data.results)) return [];
    const out: OsmPlaceSuggestion[] = [];
    for (const r of data.results.slice(0, 8)) {
      const lat = Number(r.geometry?.location?.lat);
      const lng = Number(r.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isWithinBangladesh(lat, lng)) continue;
      const cleaned = cleanMapAddressSegments(r.formatted_address || '');
      const shortName =
        r.name?.trim() ||
        cleaned[0] ||
        matchCanonicalAreaFromHints([r.formatted_address || ''], lat, lng, BANGLADESH_AREAS);
      const displayName =
        cleaned.length > 0 ? `${cleaned.slice(0, 4).join(', ')}, Bangladesh` : `${shortName}, Bangladesh`;
      out.push({
        displayName,
        shortName,
        subtitle: cleaned.slice(1, 3).join(' · ') || 'Google Places',
        lat,
        lng,
        source: 'map',
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchNominatimPlaces(query: string): Promise<OsmPlaceSuggestion[]> {
  try {
    const queryWithCountry = query.toLowerCase().includes('bangladesh') ? query : `${query}, Bangladesh`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      queryWithCountry
    )}&format=json&addressdetails=1&countrycodes=bd&limit=6&accept-language=en,bn`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FoodoraBD-Marketplace/1.0' },
      signal: AbortSignal.timeout(3200),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      name?: string;
      address?: {
        road?: string;
        neighbourhood?: string;
        suburb?: string;
        city?: string;
        town?: string;
        county?: string;
      };
    }>;

    return rows
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        const cleaned = cleanMapAddressSegments(r.display_name);
        const rawName = (r.name || '').split(';')[0]?.trim();
        const shortName =
          rawName ||
          cleaned[0] ||
          r.display_name.split(',')[0]?.trim() ||
          matchCanonicalAreaFromHints([r.display_name], lat, lng, BANGLADESH_AREAS);
        const cleanDisplay =
          cleaned.length > 0 ? `${cleaned.slice(0, 4).join(', ')}, Bangladesh` : r.display_name;
        const subtitleParts = [
          r.address?.suburb || r.address?.neighbourhood || '',
          r.address?.city || r.address?.town || r.address?.county || '',
        ].filter(Boolean);
        return {
          displayName: cleanDisplay,
          shortName,
          subtitle: subtitleParts.join(' · ') || 'Bangladesh Map',
          lat,
          lng,
          source: 'map' as const,
        };
      });
  } catch {
    return [];
  }
}

export async function searchOsmPlaces(
  query: string,
  bias?: { lat?: number; lng?: number }
): Promise<OsmPlaceSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  const biasLat = Number.isFinite(bias?.lat) ? Number(bias?.lat) : 23.7949;
  const biasLng = Number.isFinite(bias?.lng) ? Number(bias?.lng) : 90.4144;

  const key = `osm-search-v4:${q.toLowerCase()}:${biasLat.toFixed(1)},${biasLng.toFixed(1)}`;
  const cached = getCached<OsmPlaceSuggestion[]>(key);
  if (cached) return cached;

  const localMatches = findLocalAddressSuggestions(q, BANGLADESH_SEARCH_PLACES, 8);
  const queryVariants = expandAddressSearchQueries(q);
  const fullPhoneticQuery = queryVariants.find((v) => v.includes('saad') || v.includes(' ')) || q;
  const prefixQuery = queryVariants.length >= 3 ? queryVariants[queryVariants.length - 1] : '';

  const [googleHits, photonPrimary, photonExpanded, photonPrefix, nominatimHits] = await Promise.all([
    fetchGooglePlacesTextSearch(fullPhoneticQuery, biasLat, biasLng),
    fetchPhotonBangladeshPlaces(q, biasLat, biasLng),
    fullPhoneticQuery !== q ? fetchPhotonBangladeshPlaces(fullPhoneticQuery, biasLat, biasLng) : Promise.resolve([]),
    prefixQuery && prefixQuery !== fullPhoneticQuery && prefixQuery !== q
      ? fetchPhotonBangladeshPlaces(prefixQuery, biasLat, biasLng)
      : Promise.resolve([]),
    fetchNominatimPlaces(fullPhoneticQuery),
  ]);

  const remoteCombined = mergeAddressSuggestions(
    [...googleHits, ...photonExpanded],
    [...photonPrimary, ...photonPrefix, ...nominatimHits],
    16
  );
  const rankedRemote = filterAndRankRemoteSuggestions(fullPhoneticQuery, remoteCombined, 10);
  const merged = mergeAddressSuggestions(localMatches, rankedRemote, 12);
  return setCached(key, merged, 10 * 60 * 1000);
}

export async function reverseOsmGeocode(
  lat: number,
  lng: number,
  lang: 'en' | 'bn' = 'en'
): Promise<{ displayName: string; areaName: string; source: string }> {
  const key = `osm-rev-v2:${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = getCached<{ displayName: string; areaName: string; source: string }>(key);
  if (cached) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=${
      lang === 'bn' ? 'bn,en' : 'en'
    }`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FoodoraBD-Marketplace/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Nominatim reverse HTTP ${res.status}`);
    const data = (await res.json()) as {
      display_name?: string;
      name?: string;
      address?: {
        amenity?: string;
        building?: string;
        house_number?: string;
        road?: string;
        neighbourhood?: string;
        quarter?: string;
        suburb?: string;
        city?: string;
        town?: string;
        village?: string;
        city_district?: string;
        county?: string;
        state_district?: string;
        state?: string;
      };
    };
    const addr = data.address;
    const houseOrBuilding = [addr?.house_number, addr?.road].filter(Boolean).join(' ').trim();
    const localHood =
      addr?.neighbourhood || addr?.quarter || addr?.suburb || addr?.village || addr?.town || '';
    const cityPart = addr?.city || addr?.town || addr?.county || '';

    const areaName = matchCanonicalAreaFromHints(
      [localHood, addr?.road || '', data.name || '', data.display_name || '', cityPart],
      lat,
      lng,
      BANGLADESH_AREAS
    );

    const structuredCandidates = [
      data.name || addr?.amenity || addr?.building || '',
      houseOrBuilding,
      localHood,
      areaName,
      cityPart,
    ].filter(Boolean);
    const cleanedSegments = cleanMapAddressSegments(
      structuredCandidates.length > 0 ? structuredCandidates.join(', ') : data.display_name || ''
    );

    const displayName =
      cleanedSegments.length > 0
        ? `${cleanedSegments.slice(0, 4).join(', ')}, Bangladesh`
        : `${areaName}, Bangladesh`;
    return setCached(key, { displayName, areaName, source: 'OpenStreetMap' }, 10 * 60 * 1000);
  } catch {
    const areaName = matchCanonicalAreaFromHints([], lat, lng, BANGLADESH_AREAS);
    return {
      displayName: `${areaName}, Bangladesh`,
      areaName,
      source: 'Fallback',
    };
  }
}

export interface OsrmRouteEstimate {
  distanceKm: number;
  drivingMinutes: number;
  source: 'OSRM' | 'Haversine';
  coordinates?: Array<{ lat: number; lng: number }>;
  steps?: RouteDirectionStep[];
  trafficSummary?: LiveRouteTrafficSummary;
}

export async function fetchOsrmRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  options?: { includeSteps?: boolean; vehicleMode?: DeliveryVehicleMode | string }
): Promise<OsrmRouteEstimate> {
  const includeSteps = Boolean(options?.includeSteps);
  const vehicleMode: DeliveryVehicleMode = options?.vehicleMode
    ? normalizeDeliveryVehicleMode(String(options.vehicleMode))
    : 'car';
  const vehicleMeta = getDeliveryVehicleMeta(vehicleMode);
  const key = `osrm:${includeSteps ? 'full' : 'min'}:${vehicleMode}:${fromLat.toFixed(3)},${fromLng.toFixed(3)}->${toLat.toFixed(3)},${toLng.toFixed(3)}`;
  const cached = getCached<OsrmRouteEstimate>(key);
  if (cached) return cached;

  try {
    const query = includeSteps
      ? 'overview=full&geometries=geojson&steps=true'
      : 'overview=false';
    const tryOsrmProfile = async (profile: 'cycling' | 'driving' | 'foot') => {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?${query}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      return (await res.json()) as {
        code?: string;
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: { coordinates?: Array<[number, number]> };
          legs?: Array<{
            steps?: Array<{
              distance?: number;
              duration?: number;
              name?: string;
              maneuver?: { type?: string; modifier?: string };
            }>;
          }>;
        }>;
      };
    };

    let usedProfile: 'cycling' | 'driving' | 'foot' = vehicleMeta.osrmProfile;
    let data = await tryOsrmProfile(usedProfile).catch(async () => {
      if (usedProfile !== 'driving') {
        usedProfile = 'driving';
        return tryOsrmProfile('driving');
      }
      throw new Error('OSRM unavailable');
    });
    let route = data.routes?.[0];
    if (!route && usedProfile !== 'driving') {
      usedProfile = 'driving';
      data = await tryOsrmProfile('driving');
      route = data.routes?.[0];
    }
    if (!route) throw new Error('No OSRM route');
    const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
    const routeMatchesVehicle = usedProfile === vehicleMeta.osrmProfile;

    const steps: RouteDirectionStep[] = includeSteps
      ? (route.legs || [])
          .flatMap((leg) => leg.steps || [])
          .map((st) => ({
            instruction: buildOsrmDirectionInstruction({
              type: st.maneuver?.type,
              modifier: st.maneuver?.modifier,
              roadName: st.name,
            }),
            distanceMeters: Number(st.distance || 0),
            durationSeconds: Number(st.duration || 0),
            maneuver: st.maneuver?.type,
            roadName: st.name || undefined,
          }))
      : [];

    const trafficSummary = summarizeTrafficCongestion({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      staticDurationSeconds: route.duration,
      steps,
      source: 'osrm',
      vehicleMode,
      routeMatchesVehicle,
    });

    if (!includeSteps) {
      return setCached(
        key,
        { distanceKm, drivingMinutes: trafficSummary.etaMinutes, source: 'OSRM' },
        5 * 60 * 1000
      );
    }

    const coordinates = (route.geometry?.coordinates || [])
      .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
      .map(([lng, lat]) => ({ lat, lng }));

    return setCached(
      key,
      {
        distanceKm,
        drivingMinutes: trafficSummary.etaMinutes,
        source: 'OSRM',
        coordinates,
        steps,
        trafficSummary,
      },
      5 * 60 * 1000
    );
  } catch {
    const distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
    const estDurationSec = Math.max(360, Math.round(distanceKm * 252));
    const trafficSummary = summarizeTrafficCongestion({
      distanceMeters: Math.round(distanceKm * 1000),
      durationSeconds: estDurationSec,
      staticDurationSeconds: estDurationSec,
      source: 'estimated',
      vehicleMode,
      routeMatchesVehicle: false,
    });
    return {
      distanceKm,
      drivingMinutes: trafficSummary.etaMinutes,
      source: 'Haversine',
      ...(includeSteps ? { trafficSummary, steps: [] } : {}),
    };
  }
}

export interface BdtExchangeRates {
  base: 'BDT';
  rates: { USD: number; EUR: number; GBP: number; SAR: number };
  updatedAt: string;
  source: string;
}

export async function fetchBdtExchangeRates(): Promise<BdtExchangeRates> {
  const key = 'fx:BDT';
  const cached = getCached<BdtExchangeRates>(key);
  if (cached) return cached;

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/BDT', {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const data = (await res.json()) as {
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    const r = data.rates || {};
    return setCached(
      key,
      {
        base: 'BDT',
        rates: {
          USD: Number(r.USD ?? 0.00833),
          EUR: Number(r.EUR ?? 0.0077),
          GBP: Number(r.GBP ?? 0.0065),
          SAR: Number(r.SAR ?? 0.0312),
        },
        updatedAt: data.time_last_update_utc || new Date().toUTCString(),
        source: 'ExchangeRate-API',
      },
      60 * 60 * 1000
    );
  } catch {
    return {
      base: 'BDT',
      rates: { USD: 0.00833, EUR: 0.0077, GBP: 0.0065, SAR: 0.0312 },
      updatedAt: new Date().toUTCString(),
      source: 'Fallback',
    };
  }
}

export interface MealInspirationItem {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  instructions: string;
  thumbUrl: string;
}

export async function searchMealDbDishes(query: string): Promise<MealInspirationItem[]> {
  const q = query.trim() || 'biryani';
  const key = `mealdb:${q.toLowerCase()}`;
  const cached = getCached<MealInspirationItem[]>(key);
  if (cached) return cached;

  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`MealDB HTTP ${res.status}`);
    const data = (await res.json()) as {
      meals?: Array<{
        idMeal: string;
        strMeal: string;
        strCategory: string;
        strArea: string;
        strInstructions: string;
        strMealThumb: string;
      }> | null;
    };
    const meals = (data.meals || []).slice(0, 6).map((m) => ({
      id: m.idMeal,
      name: m.strMeal,
      category: m.strCategory || 'Main Course',
      cuisine: m.strArea || 'International',
      instructions: (m.strInstructions || '').slice(0, 140).replace(/\s+/g, ' ').trim(),
      thumbUrl: m.strMealThumb,
    }));
    return setCached(key, meals, 30 * 60 * 1000);
  } catch {
    return [];
  }
}
