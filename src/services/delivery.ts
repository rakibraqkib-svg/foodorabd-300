import {
  type BangladeshDeliveryServiceCode,
  DeliveryMode,
  estimateDeliveryFeeAndEta,
  getBangladeshDeliveryServiceMeta,
  haversineDistanceKm,
} from '../lib/marketplace-logic.ts';

export interface DeliveryOrderPayload {
  orderNumber: string;
  restaurantName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffArea: string;
  dropoffLat: number;
  dropoffLng: number;
  customerName: string;
  customerPhone: string;
  baseFee: number;
  orderValue: number;
}

export interface DeliveryQuote {
  provider: string;
  serviceCode: BangladeshDeliveryServiceCode;
  mode: DeliveryMode;
  distanceKm: number;
  fee: number;
  etaMinutes: number;
  isSandbox: boolean;
}

export interface DeliveryCreationResult {
  provider: string;
  serviceCode: BangladeshDeliveryServiceCode;
  consignmentId: string;
  status: string;
  isSandbox: boolean;
  trackingUrl?: string;
}

export interface DeliveryProvider {
  name: string;
  serviceCode: BangladeshDeliveryServiceCode;
  mode: DeliveryMode;
  isConfigured(): boolean;
  getQuote(order: DeliveryOrderPayload): Promise<DeliveryQuote>;
  createDelivery(order: DeliveryOrderPayload): Promise<DeliveryCreationResult>;
  trackDelivery(consignmentId: string): Promise<{ status: string; updatedAt: string }>;
  cancelDelivery(consignmentId: string): Promise<{ cancelled: boolean }>;
}

export class FoodoraOwnRiderProvider implements DeliveryProvider {
  name = 'Foodora Express Rider';
  serviceCode: BangladeshDeliveryServiceCode = 'foodora_express';
  mode: DeliveryMode = 'platform';

  isConfigured(): boolean {
    return true;
  }

  async getQuote(order: DeliveryOrderPayload): Promise<DeliveryQuote> {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(distanceKm, order.baseFee, 'platform');
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: 'platform',
      distanceKm,
      fee,
      etaMinutes,
      isSandbox: false,
    };
  }

  async createDelivery(order: DeliveryOrderPayload): Promise<DeliveryCreationResult> {
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      consignmentId: `FDR-${order.orderNumber}`,
      status: 'awaiting_rider',
      isSandbox: false,
    };
  }

  async trackDelivery(_consignmentId: string) {
    return { status: 'on_the_way', updatedAt: new Date().toISOString() };
  }

  async cancelDelivery(_consignmentId: string) {
    return { cancelled: true };
  }
}

export class RestaurantSelfDeliveryProvider implements DeliveryProvider {
  name = 'Restaurant Own Rider';
  serviceCode: BangladeshDeliveryServiceCode = 'restaurant_fleet';
  mode: DeliveryMode = 'restaurant';

  isConfigured(): boolean {
    return true;
  }

  async getQuote(order: DeliveryOrderPayload): Promise<DeliveryQuote> {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(distanceKm, order.baseFee, 'restaurant');
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: 'restaurant',
      distanceKm,
      fee,
      etaMinutes,
      isSandbox: false,
    };
  }

  async createDelivery(order: DeliveryOrderPayload): Promise<DeliveryCreationResult> {
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      consignmentId: `RST-${order.orderNumber}`,
      status: 'restaurant_dispatched',
      isSandbox: false,
    };
  }

  async trackDelivery(_consignmentId: string) {
    return { status: 'preparing', updatedAt: new Date().toISOString() };
  }

  async cancelDelivery(_consignmentId: string) {
    return { cancelled: true };
  }
}

export class PathaoDeliveryProvider implements DeliveryProvider {
  name = 'Pathao Food & Courier';
  serviceCode: BangladeshDeliveryServiceCode = 'pathao_food';
  mode: DeliveryMode = 'third_party';

  isConfigured(): boolean {
    return Boolean(
      process.env.PATHAO_CLIENT_ID &&
        process.env.PATHAO_CLIENT_SECRET &&
        process.env.PATHAO_USERNAME &&
        process.env.PATHAO_PASSWORD
    );
  }

  async getQuote(order: DeliveryOrderPayload): Promise<DeliveryQuote> {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(
      distanceKm,
      Math.max(55, order.baseFee),
      'third_party'
    );
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: 'third_party',
      distanceKm,
      fee,
      etaMinutes: etaMinutes + 2,
      isSandbox: !this.isConfigured() || process.env.PATHAO_SANDBOX === 'true',
    };
  }

  async createDelivery(order: DeliveryOrderPayload): Promise<DeliveryCreationResult> {
    const isLive =
      this.isConfigured() &&
      process.env.PATHAO_SANDBOX !== 'true' &&
      Boolean(process.env.PATHAO_STORE_ID);

    if (isLive) {
      const baseUrl = (process.env.PATHAO_BASE_URL || 'https://api-hermes.pathao.com').replace(/\/+$/, '');
      try {
        const tokenResp = await fetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.PATHAO_CLIENT_ID,
            client_secret: process.env.PATHAO_CLIENT_SECRET,
            grant_type: 'password',
            username: process.env.PATHAO_USERNAME,
            password: process.env.PATHAO_PASSWORD,
          }),
        });
        const tokenJson = (await tokenResp.json().catch(() => ({}))) as { access_token?: string };
        if (tokenResp.ok && tokenJson.access_token) {
          const orderResp = await fetch(`${baseUrl}/aladdin/api/v1/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenJson.access_token}`,
            },
            body: JSON.stringify({
              store_id: Number(process.env.PATHAO_STORE_ID),
              merchant_order_id: order.orderNumber,
              recipient_name: order.customerName,
              recipient_phone: order.customerPhone.replace(/^\+88/, ''),
              recipient_address: `${order.dropoffAddress}, ${order.dropoffArea}`,
              recipient_city: 1,
              recipient_zone: 1,
              delivery_type: 48,
              item_type: 2,
              item_quantity: 1,
              item_weight: 0.5,
              amount_to_collect: Math.max(0, Math.round(order.orderValue)),
              item_description: `Food order from ${order.restaurantName}`,
            }),
          });
          const orderJson = (await orderResp.json().catch(() => ({}))) as {
            data?: { consignment_id?: string };
          };
          const liveId = orderJson?.data?.consignment_id;
          if (orderResp.ok && liveId) {
            return {
              provider: 'Pathao Food & Courier',
              serviceCode: this.serviceCode,
              consignmentId: liveId,
              status: 'consignment_created',
              isSandbox: false,
            };
          }
        }
      } catch {
        // fallback cleanly to sandbox consignment below if remote Pathao API is unreachable
      }
    }

    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      provider: isLive ? 'Pathao Food & Courier' : 'Pathao Food & Courier (Sandbox)',
      serviceCode: this.serviceCode,
      consignmentId: `PT-BD-${suffix}`,
      status: 'consignment_created',
      isSandbox: true,
    };
  }

  async trackDelivery(_consignmentId: string) {
    return { status: 'picked_up', updatedAt: new Date().toISOString() };
  }

  async cancelDelivery(_consignmentId: string) {
    return { cancelled: true };
  }
}

export class BangladeshiPartnerCourierProvider implements DeliveryProvider {
  name: string;
  serviceCode: BangladeshDeliveryServiceCode;
  mode: DeliveryMode = 'third_party';

  constructor(serviceCode: 'steadfast' | 'redx' | 'paperfly') {
    const meta = getBangladeshDeliveryServiceMeta(serviceCode);
    this.serviceCode = serviceCode;
    this.name = meta.nameEn;
  }

  isConfigured(): boolean {
    if (this.serviceCode === 'steadfast') {
      return Boolean(process.env.STEADFAST_API_KEY && process.env.STEADFAST_SECRET_KEY);
    }
    if (this.serviceCode === 'redx') {
      return Boolean(process.env.REDX_ACCESS_TOKEN);
    }
    return false;
  }

  async getQuote(order: DeliveryOrderPayload): Promise<DeliveryQuote> {
    const meta = getBangladeshDeliveryServiceMeta(this.serviceCode);
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(
      distanceKm,
      Math.max(meta.minBaseFee, order.baseFee),
      'third_party'
    );
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: 'third_party',
      distanceKm,
      fee,
      etaMinutes: etaMinutes + meta.etaOffsetMin,
      isSandbox: !this.isConfigured(),
    };
  }

  async createDelivery(order: DeliveryOrderPayload): Promise<DeliveryCreationResult> {
    if (this.serviceCode === 'steadfast' && this.isConfigured()) {
      try {
        const resp = await fetch('https://portal.packzy.com/api/v1/create_order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': process.env.STEADFAST_API_KEY || '',
            'Secret-Key': process.env.STEADFAST_SECRET_KEY || '',
          },
          body: JSON.stringify({
            invoice: order.orderNumber,
            recipient_name: order.customerName,
            recipient_phone: order.customerPhone.replace(/^\+88/, ''),
            recipient_address: `${order.dropoffAddress}, ${order.dropoffArea}`,
            cod_amount: Math.max(0, Math.round(order.orderValue)),
            note: `Food order from ${order.restaurantName}`,
          }),
        });
        const json = (await resp.json().catch(() => ({}))) as {
          consignment?: { consignment_id?: number | string; tracking_code?: string };
        };
        const liveId = json?.consignment?.tracking_code || json?.consignment?.consignment_id;
        if (resp.ok && liveId) {
          return {
            provider: this.name,
            serviceCode: this.serviceCode,
            consignmentId: String(liveId),
            status: 'consignment_created',
            isSandbox: false,
          };
        }
      } catch {
        // fallback cleanly to sandbox label
      }
    }

    if (this.serviceCode === 'redx' && this.isConfigured()) {
      try {
        const resp = await fetch('https://openapi.redx.com.bd/v1.0.0-beta/parcel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'API-ACCESS-TOKEN': `Bearer ${process.env.REDX_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            customer_name: order.customerName,
            customer_phone: order.customerPhone.replace(/^\+88/, ''),
            delivery_area: order.dropoffArea,
            delivery_area_id: 1,
            customer_address: order.dropoffAddress,
            merchant_invoice_id: order.orderNumber,
            cash_collection_amount: Math.max(0, Math.round(order.orderValue)),
            parcel_weight: 500,
          }),
        });
        const json = (await resp.json().catch(() => ({}))) as { tracking_id?: string };
        if (resp.ok && json?.tracking_id) {
          return {
            provider: this.name,
            serviceCode: this.serviceCode,
            consignmentId: json.tracking_id,
            status: 'consignment_created',
            isSandbox: false,
          };
        }
      } catch {
        // fallback cleanly to sandbox label
      }
    }

    const prefix =
      this.serviceCode === 'steadfast' ? 'SF-BD' : this.serviceCode === 'redx' ? 'RX-BD' : 'PF-BD';
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      provider: `${this.name} (Sandbox)`,
      serviceCode: this.serviceCode,
      consignmentId: `${prefix}-${suffix}`,
      status: 'consignment_created',
      isSandbox: true,
    };
  }

  async trackDelivery(_consignmentId: string) {
    return { status: 'picked_up', updatedAt: new Date().toISOString() };
  }

  async cancelDelivery(_consignmentId: string) {
    return { cancelled: true };
  }
}

export function getDeliveryProvider(
  mode: DeliveryMode,
  serviceCode?: string | null
): DeliveryProvider {
  const cleanCode = String(serviceCode || '').trim().toLowerCase();
  if (cleanCode === 'steadfast' || cleanCode === 'redx' || cleanCode === 'paperfly') {
    return new BangladeshiPartnerCourierProvider(cleanCode);
  }
  if (cleanCode === 'pathao_food') {
    return new PathaoDeliveryProvider();
  }
  if (cleanCode === 'restaurant_fleet') {
    return new RestaurantSelfDeliveryProvider();
  }
  if (cleanCode === 'foodora_express') {
    return new FoodoraOwnRiderProvider();
  }

  switch (mode) {
    case 'third_party':
      return new PathaoDeliveryProvider();
    case 'restaurant':
      return new RestaurantSelfDeliveryProvider();
    case 'platform':
    default:
      return new FoodoraOwnRiderProvider();
  }
}
