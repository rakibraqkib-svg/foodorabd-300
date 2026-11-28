var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server.ts
import "dotenv/config";
import express from "express";
import http from "node:http";
import path2 from "node:path";
import fs2 from "node:fs";
import crypto4 from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { and as and2, asc as asc2, desc as desc3, eq as eq5, inArray as inArray3, ne, notInArray, or as or2, sql as sql3 } from "drizzle-orm";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  aiProviders: () => aiProviders,
  auditLogs: () => auditLogs,
  commissionLedger: () => commissionLedger,
  coupons: () => coupons,
  customerAddresses: () => customerAddresses,
  favorites: () => favorites,
  foodItems: () => foodItems,
  localCredentials: () => localCredentials,
  notifications: () => notifications,
  orderEmailLogs: () => orderEmailLogs,
  orderStatusHistory: () => orderStatusHistory,
  orders: () => orders,
  partnerApiKeys: () => partnerApiKeys,
  paymentGateways: () => paymentGateways,
  paymentTransactions: () => paymentTransactions,
  platformSettings: () => platformSettings,
  restaurantPayouts: () => restaurantPayouts,
  restaurants: () => restaurants,
  reviews: () => reviews,
  riderJobApplications: () => riderJobApplications,
  riderJobs: () => riderJobs,
  riderWalletLedger: () => riderWalletLedger,
  riders: () => riders,
  users: () => users,
  vendorAdminMessages: () => vendorAdminMessages
});
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp
} from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull().default("Foodora Customer"),
  phone: text("phone").default(""),
  avatarUrl: text("avatar_url").default(""),
  role: text("role").notNull().default("customer"),
  // customer | restaurant_owner | rider | admin | super_admin
  status: text("status").notNull().default("active"),
  // active | suspended
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var localCredentials = pgTable("local_credentials", {
  email: text("email").primaryKey(),
  uid: text("uid").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var customerAddresses = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  userUid: text("user_uid").notNull(),
  label: text("label").notNull().default("Home"),
  area: text("area").notNull(),
  addressLine: text("address_line").notNull(),
  lat: doublePrecision("lat").notNull().default(23.7925),
  lng: doublePrecision("lng").notNull().default(90.4078),
  instructions: text("instructions").default(""),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  ownerUid: text("owner_uid").notNull(),
  name: text("name").notNull(),
  nameBn: text("name_bn").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  cuisine: text("cuisine").notNull(),
  area: text("area").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull().default(23.7937),
  lng: doublePrecision("lng").notNull().default(90.4066),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  logoUrl: text("logo_url").default(""),
  coverUrl: text("cover_url").notNull(),
  tradeLicense: text("trade_license").default(""),
  nidNumber: text("nid_number").default(""),
  payoutMethod: text("payout_method").notNull().default("bkash"),
  // bkash | nagad | bank
  payoutAccount: text("payout_account").notNull().default(""),
  deliveryTimeMin: integer("delivery_time_min").notNull().default(20),
  deliveryFee: integer("delivery_fee").notNull().default(49),
  minOrder: integer("min_order").notNull().default(150),
  priceTier: text("price_tier").notNull().default("\u09F3\u09F3"),
  rating: numeric("rating", { precision: 3, scale: 1 }).notNull().default("4.7"),
  reviewCount: integer("review_count").notNull().default(0),
  discountPct: integer("discount_pct").notNull().default(0),
  isSponsored: boolean("is_sponsored").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  isOpen: boolean("is_open").notNull().default(true),
  status: text("status").notNull().default("pending"),
  // pending | approved | rejected | suspended
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("15.00"),
  commissionType: text("commission_type").notNull().default("percentage"),
  // percentage | fixed
  fixedCommission: integer("fixed_commission").notNull().default(0),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  // free | basic | premium | enterprise
  deliveryMode: text("delivery_mode").notNull().default("platform"),
  // platform | restaurant | third_party
  openingHours: text("opening_hours").notNull().default("10:00 AM - 11:30 PM"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var foodItems = pgTable("food_items", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  nameBn: text("name_bn").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull(),
  price: integer("price").notNull(),
  discountPrice: integer("discount_price"),
  variationsJson: jsonb("variations_json").$type().notNull().default([]),
  addonsJson: jsonb("addons_json").$type().notNull().default([]),
  inStock: boolean("in_stock").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true),
  isPopular: boolean("is_popular").notNull().default(false),
  isVisibleOnStorefront: boolean("is_visible_on_storefront").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var partnerApiKeys = pgTable("partner_api_keys", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull().unique(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label").notNull().default("POS / Inventory Sync"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var paymentGateways = pgTable("payment_gateways", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  // bkash | nagad | sslcommerz | cod | rocket | upay | custom
  name: text("name").notNull(),
  nameBn: text("name_bn").notNull(),
  providerType: text("provider_type").notNull().default("mfs"),
  // mfs | card | wallet | cod | custom
  mode: text("mode").notNull().default("sandbox"),
  // sandbox | live
  isActive: boolean("is_active").notNull().default(true),
  apiBaseUrl: text("api_base_url").default(""),
  merchantId: text("merchant_id").default(""),
  apiKey: text("api_key").default(""),
  apiSecret: text("api_secret").default(""),
  webhookSecret: text("webhook_secret").default(""),
  instructions: text("instructions").default(""),
  sortOrder: integer("sort_order").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  // percentage | fixed | free_delivery
  value: integer("value").notNull(),
  minOrder: integer("min_order").notNull().default(0),
  maxDiscount: integer("max_discount").notNull().default(500),
  restaurantId: integer("restaurant_id"),
  usageLimit: integer("usage_limit").notNull().default(1e3),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerUid: text("customer_uid").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email").default(""),
  trackingToken: text("tracking_token").default(""),
  restaurantId: integer("restaurant_id").references(() => restaurants.id).notNull(),
  restaurantName: text("restaurant_name").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryArea: text("delivery_area").notNull(),
  deliveryLat: doublePrecision("delivery_lat").notNull().default(23.7925),
  deliveryLng: doublePrecision("delivery_lng").notNull().default(90.4078),
  deliveryInstructions: text("delivery_instructions").default(""),
  deliveryMode: text("delivery_mode").notNull().default("platform"),
  // platform | restaurant | third_party
  deliveryProvider: text("delivery_provider").notNull().default("Foodora Rider"),
  consignmentId: text("consignment_id").default(""),
  paymentMethod: text("payment_method").notNull().default("cod"),
  // bkash | nagad | sslcommerz | cod
  paymentStatus: text("payment_status").notNull().default("pending"),
  // pending | paid | failed | refunded
  paymentTxId: text("payment_tx_id").default(""),
  subtotal: integer("subtotal").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  couponCode: text("coupon_code").default(""),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  serviceFee: integer("service_fee").notNull().default(10),
  taxAmount: integer("tax_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("15.00"),
  platformCommission: integer("platform_commission").notNull().default(0),
  restaurantEarnings: integer("restaurant_earnings").notNull().default(0),
  status: text("status").notNull().default("confirmed"),
  // confirmed | accepted | preparing | ready | rider_assigned | picked_up | on_the_way | delivered | cancelled
  cancelReason: text("cancel_reason").default(""),
  riderUid: text("rider_uid").default(""),
  riderName: text("rider_name").default(""),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  paymentSplitMode: text("payment_split_mode").notNull().default("online_food_cash_delivery"),
  onlineFoodPaidAmount: integer("online_food_paid_amount").notNull().default(0),
  cashDueToRider: integer("cash_due_to_rider").notNull().default(0),
  riderEarningAmount: integer("rider_earning_amount").notNull().default(0),
  foodoraDeliveryCommission: integer("foodora_delivery_commission").notNull().default(0),
  cashCollectionStatus: text("cash_collection_status").notNull().default("pending"),
  // pending | collected | reversed
  cashCollectedAmount: integer("cash_collected_amount").notNull().default(0),
  cashCollectedAt: timestamp("cash_collected_at"),
  itemsSnapshotJson: jsonb("items_snapshot_json").$type().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull(),
  note: text("note").default(""),
  actorUid: text("actor_uid").default("system"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var orderEmailLogs = pgTable("order_email_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  orderNumber: text("order_number").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  trackingUrl: text("tracking_url").notNull(),
  statusEvent: text("status_event").notNull(),
  deliveryProvider: text("delivery_provider").notNull().default("in_app_email_log"),
  providerStatus: text("provider_status").notNull().default("recorded"),
  htmlPreview: text("html_preview").notNull().default(""),
  sentAt: timestamp("sent_at").defaultNow().notNull()
});
var commissionLedger = pgTable("commission_ledger", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id),
  restaurantId: integer("restaurant_id").references(() => restaurants.id).notNull(),
  entryType: text("entry_type").notNull(),
  // commission_earned | commission_reversal | payout_debit | subscription_fee
  grossAmount: integer("gross_amount").notNull(),
  commissionAmount: integer("commission_amount").notNull(),
  netRestaurantAmount: integer("net_restaurant_amount").notNull(),
  deliveryFeeAmount: integer("delivery_fee_amount").notNull().default(0),
  note: text("note").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var restaurantPayouts = pgTable("restaurant_payouts", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id).notNull(),
  restaurantName: text("restaurant_name").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull().default("bkash"),
  accountNumber: text("account_number").notNull(),
  status: text("status").notNull().default("pending"),
  // pending | paid | rejected
  referenceId: text("reference_id").default(""),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
});
var riders = pgTable("riders", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  restaurantId: integer("restaurant_id"),
  addedByUid: text("added_by_uid").default(""),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  vehicleType: text("vehicle_type").notNull().default("Motorbike"),
  nidNumber: text("nid_number").default(""),
  zone: text("zone").notNull().default("Gulshan / Banani"),
  isAvailable: boolean("is_available").notNull().default(true),
  status: text("status").notNull().default("approved"),
  // pending | approved | suspended
  currentLat: doublePrecision("current_lat").notNull().default(23.7949),
  currentLng: doublePrecision("current_lng").notNull().default(90.4043),
  locationUpdatedAt: timestamp("location_updated_at").defaultNow().notNull(),
  totalDeliveries: integer("total_deliveries").notNull().default(0),
  totalEarnings: integer("total_earnings").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  customerUid: text("customer_uid").notNull(),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  foodRating: integer("food_rating").notNull().default(5),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  customerUid: text("customer_uid").notNull(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientUid: text("recipient_uid").notNull(),
  roleTarget: text("role_target").notNull().default("customer"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("order"),
  isRead: boolean("is_read").notNull().default(false),
  relatedOrderId: integer("related_order_id"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  platformName: text("platform_name").notNull().default("Foodora BD"),
  defaultCommissionPct: numeric("default_commission_pct", { precision: 5, scale: 2 }).notNull().default("15.00"),
  defaultDeliveryFee: integer("default_delivery_fee").notNull().default(49),
  serviceFee: integer("service_fee").notNull().default(10),
  minOrderDefault: integer("min_order_default").notNull().default(150),
  pathaoEnabled: boolean("pathao_enabled").notNull().default(true),
  pathaoSandbox: boolean("pathao_sandbox").notNull().default(true),
  bkashEnabled: boolean("bkash_enabled").notNull().default(true),
  bkashSandbox: boolean("bkash_sandbox").notNull().default(true),
  sslcommerzEnabled: boolean("sslcommerz_enabled").notNull().default(true),
  sslcommerzSandbox: boolean("sslcommerz_sandbox").notNull().default(true),
  storefrontConfig: jsonb("storefront_config").$type().notNull().default({}),
  deliveryFinancialConfig: jsonb("delivery_financial_config").$type().notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorUid: text("actor_uid").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  details: text("details").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var riderJobs = pgTable("rider_jobs", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  restaurantName: text("restaurant_name").notNull(),
  ownerUid: text("owner_uid").notNull(),
  title: text("title").notNull(),
  titleBn: text("title_bn").notNull(),
  zone: text("zone").notNull(),
  vehicleType: text("vehicle_type").notNull().default("Motorbike / Bicycle"),
  salaryRange: text("salary_range").notNull().default("\u09F315,000 - \u09F322,000 / month"),
  shiftHours: text("shift_hours").notNull().default("Full-time \xB7 11:00 AM - 11:00 PM"),
  vacancies: integer("vacancies").notNull().default(1),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var riderJobApplications = pgTable("rider_job_applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => riderJobs.id, { onDelete: "cascade" }).notNull(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  applicantUid: text("applicant_uid").default(""),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  vehicleType: text("vehicle_type").notNull().default("Motorbike"),
  zone: text("zone").notNull(),
  nidNumber: text("nid_number").default(""),
  experienceNote: text("experience_note").default(""),
  status: text("status").notNull().default("pending"),
  // pending | hired | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var vendorAdminMessages = pgTable("vendor_admin_messages", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
  restaurantName: text("restaurant_name").notNull(),
  ownerUid: text("owner_uid").notNull(),
  senderUid: text("sender_uid").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  // restaurant_owner | admin | super_admin
  message: text("message").notNull(),
  isReadByAdmin: boolean("is_read_by_admin").notNull().default(false),
  isReadByVendor: boolean("is_read_by_vendor").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  // gemini | chatgpt | groq | deepseek | claude | custom
  name: text("name").notNull(),
  providerType: text("provider_type").notNull().default("openai"),
  // gemini | openai | groq | deepseek | anthropic | custom_openai
  model: text("model").notNull(),
  apiBaseUrl: text("api_base_url").default(""),
  apiKey: text("api_key").default(""),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  orderNumber: text("order_number").notNull(),
  txKind: text("tx_kind").notNull(),
  // food_payment | delivery_cash | food_refund | delivery_reversal | rider_commission_settlement
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payerRole: text("payer_role").notNull().default("customer"),
  // customer | rider | platform
  recipientRole: text("recipient_role").notNull().default("platform_restaurant"),
  // platform_restaurant | rider | foodora | customer
  paymentMethod: text("payment_method").notNull().default("bkash"),
  amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("pending"),
  // pending | succeeded | failed | refunded | cancelled
  gatewayTxId: text("gateway_tx_id").default(""),
  riderUid: text("rider_uid").default(""),
  note: text("note").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var riderWalletLedger = pgTable("rider_wallet_ledger", {
  id: serial("id").primaryKey(),
  riderUid: text("rider_uid").notNull(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  orderNumber: text("order_number").notNull().default(""),
  entryType: text("entry_type").notNull(),
  // delivery_earning | commission_owed | commission_settled | commission_reversal
  idempotencyKey: text("idempotency_key").notNull().unique(),
  cashCollected: integer("cash_collected").notNull().default(0),
  riderEarningDelta: integer("rider_earning_delta").notNull().default(0),
  commissionOwedDelta: integer("commission_owed_delta").notNull().default(0),
  commissionSettledDelta: integer("commission_settled_delta").notNull().default(0),
  referenceId: text("reference_id").default(""),
  note: text("note").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// src/db/index.ts
function hasDatabaseConfig() {
  return Boolean(
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.SQL_HOST
  );
}
var createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
    const isVercel = Boolean(
      process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION
    );
    if (connectionString) {
      global._postgresPool = new Pool({
        connectionString,
        ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? void 0 : { rejectUnauthorized: false },
        max: isVercel ? 5 : 10,
        idleTimeoutMillis: isVercel ? 15e3 : 3e4,
        connectionTimeoutMillis: 15e3
      });
    } else if (process.env.SQL_HOST) {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 15e3
      });
    } else {
      global._postgresPool = new Pool({
        host: "missing-database-url.invalid",
        connectionTimeoutMillis: 1500,
        max: 1
      });
    }
    global._postgresPool.on("error", (err) => {
      if (err.message && (err.message.includes("Connection terminated unexpectedly") || err.message.includes("terminating connection"))) {
        return;
      }
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }
  return global._postgresPool;
};
var pool = createPool();
var db = drizzle(pool, { schema: schema_exports });
function isTransientDbError(err) {
  const collectMsg = (val, depth = 0) => {
    if (!val || depth > 3) return "";
    if (typeof val === "string") return val;
    if (val instanceof Error) {
      const code = val.code || "";
      return `${val.message} ${code} ${collectMsg(val.cause, depth + 1)}`;
    }
    if (typeof val === "object") {
      const obj = val;
      return `${String(obj.message || "")} ${String(obj.code || "")} ${collectMsg(obj.cause, depth + 1)}`;
    }
    return String(val);
  };
  const msg = collectMsg(err).toUpperCase();
  return msg.includes("ENOENT") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("EPIPE") || msg.includes("57P01") || msg.includes("CONNECTION TERMINATED UNEXPECTEDLY") || msg.includes("THE DATABASE SYSTEM IS STARTING UP");
}
async function withDbRetry(fn, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const delayMs = attempt * 350;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

// src/db/ensure-schema.ts
import { sql } from "drizzle-orm";
var schemaPromise = null;
async function ensureSchemaTables() {
  if (!schemaPromise) {
    schemaPromise = runCreateTablesIfMissing().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}
var EXPECTED_TABLES = [
  "users",
  "local_credentials",
  "customer_addresses",
  "restaurants",
  "food_items",
  "partner_api_keys",
  "payment_gateways",
  "coupons",
  "orders",
  "order_status_history",
  "order_email_logs",
  "commission_ledger",
  "restaurant_payouts",
  "riders",
  "reviews",
  "favorites",
  "notifications",
  "platform_settings",
  "audit_logs",
  "rider_jobs",
  "rider_job_applications",
  "vendor_admin_messages",
  "ai_providers",
  "payment_transactions",
  "rider_wallet_ledger"
];
async function runCreateTablesIfMissing() {
  const existingRes = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existingSet = new Set(
    (existingRes.rows ?? []).map(
      (r) => String(r.table_name || "")
    )
  );
  const missingTables = EXPECTED_TABLES.filter((t) => !existingSet.has(t));
  try {
    if (missingTables.length > 0) {
      await createMissingTables(existingSet);
    }
    if (existingSet.has("food_items")) {
      await db.execute(sql`
        ALTER TABLE food_items
        ADD COLUMN IF NOT EXISTS is_visible_on_storefront BOOLEAN NOT NULL DEFAULT TRUE;
      `);
    }
    if (existingSet.has("orders")) {
      await db.execute(sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS tracking_token TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS payment_split_mode TEXT NOT NULL DEFAULT 'online_food_cash_delivery',
        ADD COLUMN IF NOT EXISTS online_food_paid_amount INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cash_due_to_rider INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS rider_earning_amount INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS foodora_delivery_commission INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cash_collection_status TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS cash_collected_amount INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cash_collected_at TIMESTAMP;
      `);
    }
    if (existingSet.has("platform_settings")) {
      await db.execute(sql`
        ALTER TABLE platform_settings
        ADD COLUMN IF NOT EXISTS delivery_financial_config JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);
    }
    if (existingSet.has("riders")) {
      await db.execute(sql`
        ALTER TABLE riders
        ADD COLUMN IF NOT EXISTS restaurant_id INTEGER,
        ADD COLUMN IF NOT EXISTS added_by_uid TEXT NOT NULL DEFAULT '';
      `);
    }
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    if (code === "42501") {
      console.warn(
        `Skipping runtime DDL creation (role lacks CREATE/ALTER on schema public). Missing tables: ${missingTables.join(", ")}`
      );
      return;
    }
    throw err;
  }
}
async function createMissingTables(existingSet) {
  if (!existingSet.has("users")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT 'Foodora Customer',
        phone TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'customer',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("local_credentials")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS local_credentials (
        email TEXT PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("customer_addresses")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id SERIAL PRIMARY KEY,
        user_uid TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT 'Home',
        area TEXT NOT NULL,
        address_line TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL DEFAULT 23.7925,
        lng DOUBLE PRECISION NOT NULL DEFAULT 90.4078,
        instructions TEXT DEFAULT '',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("restaurants")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurants (
        id SERIAL PRIMARY KEY,
        owner_uid TEXT NOT NULL,
        name TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        cuisine TEXT NOT NULL,
        area TEXT NOT NULL,
        address TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL DEFAULT 23.7937,
        lng DOUBLE PRECISION NOT NULL DEFAULT 90.4066,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        logo_url TEXT DEFAULT '',
        cover_url TEXT NOT NULL,
        trade_license TEXT DEFAULT '',
        nid_number TEXT DEFAULT '',
        payout_method TEXT NOT NULL DEFAULT 'bkash',
        payout_account TEXT NOT NULL DEFAULT '',
        delivery_time_min INTEGER NOT NULL DEFAULT 20,
        delivery_fee INTEGER NOT NULL DEFAULT 49,
        min_order INTEGER NOT NULL DEFAULT 150,
        price_tier TEXT NOT NULL DEFAULT '৳৳',
        rating NUMERIC(3, 1) NOT NULL DEFAULT '4.7',
        review_count INTEGER NOT NULL DEFAULT 0,
        discount_pct INTEGER NOT NULL DEFAULT 0,
        is_sponsored BOOLEAN NOT NULL DEFAULT FALSE,
        is_new BOOLEAN NOT NULL DEFAULT FALSE,
        is_open BOOLEAN NOT NULL DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'pending',
        commission_rate NUMERIC(5, 2) NOT NULL DEFAULT '15.00',
        commission_type TEXT NOT NULL DEFAULT 'percentage',
        fixed_commission INTEGER NOT NULL DEFAULT 0,
        subscription_plan TEXT NOT NULL DEFAULT 'free',
        delivery_mode TEXT NOT NULL DEFAULT 'platform',
        opening_hours TEXT NOT NULL DEFAULT '10:00 AM - 11:30 PM',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("food_items")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS food_items (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL,
        price INTEGER NOT NULL,
        discount_price INTEGER,
        variations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        addons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        in_stock BOOLEAN NOT NULL DEFAULT TRUE,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        is_popular BOOLEAN NOT NULL DEFAULT FALSE,
        is_visible_on_storefront BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("partner_api_keys")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS partner_api_keys (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT 'POS / Inventory Sync',
        last_used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("payment_gateways")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_gateways (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        provider_type TEXT NOT NULL DEFAULT 'mfs',
        mode TEXT NOT NULL DEFAULT 'sandbox',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        api_base_url TEXT DEFAULT '',
        merchant_id TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        api_secret TEXT DEFAULT '',
        webhook_secret TEXT DEFAULT '',
        instructions TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("coupons")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        value INTEGER NOT NULL,
        min_order INTEGER NOT NULL DEFAULT 0,
        max_discount INTEGER NOT NULL DEFAULT 500,
        restaurant_id INTEGER,
        usage_limit INTEGER NOT NULL DEFAULT 1000,
        used_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("orders")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_uid TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT NOT NULL DEFAULT '',
        tracking_token TEXT NOT NULL DEFAULT '',
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        restaurant_name TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_area TEXT NOT NULL,
        delivery_lat DOUBLE PRECISION NOT NULL DEFAULT 23.7925,
        delivery_lng DOUBLE PRECISION NOT NULL DEFAULT 90.4078,
        delivery_instructions TEXT DEFAULT '',
        delivery_mode TEXT NOT NULL DEFAULT 'platform',
        delivery_provider TEXT NOT NULL DEFAULT 'Foodora Rider',
        consignment_id TEXT DEFAULT '',
        payment_method TEXT NOT NULL DEFAULT 'cod',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payment_tx_id TEXT DEFAULT '',
        subtotal INTEGER NOT NULL,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        coupon_code TEXT DEFAULT '',
        delivery_fee INTEGER NOT NULL DEFAULT 0,
        service_fee INTEGER NOT NULL DEFAULT 10,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total_amount INTEGER NOT NULL,
        commission_rate NUMERIC(5, 2) NOT NULL DEFAULT '15.00',
        platform_commission INTEGER NOT NULL DEFAULT 0,
        restaurant_earnings INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed',
        cancel_reason TEXT DEFAULT '',
        rider_uid TEXT DEFAULT '',
        rider_name TEXT DEFAULT '',
        estimated_minutes INTEGER NOT NULL DEFAULT 30,
        payment_split_mode TEXT NOT NULL DEFAULT 'online_food_cash_delivery',
        online_food_paid_amount INTEGER NOT NULL DEFAULT 0,
        cash_due_to_rider INTEGER NOT NULL DEFAULT 0,
        rider_earning_amount INTEGER NOT NULL DEFAULT 0,
        foodora_delivery_commission INTEGER NOT NULL DEFAULT 0,
        cash_collection_status TEXT NOT NULL DEFAULT 'pending',
        cash_collected_amount INTEGER NOT NULL DEFAULT 0,
        cash_collected_at TIMESTAMP,
        items_snapshot_json JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("order_status_history")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        note TEXT DEFAULT '',
        actor_uid TEXT DEFAULT 'system',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("order_email_logs")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS order_email_logs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        tracking_url TEXT NOT NULL,
        status_event TEXT NOT NULL,
        delivery_provider TEXT NOT NULL DEFAULT 'in_app_email_log',
        provider_status TEXT NOT NULL DEFAULT 'recorded',
        html_preview TEXT NOT NULL DEFAULT '',
        sent_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("commission_ledger")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        entry_type TEXT NOT NULL,
        gross_amount INTEGER NOT NULL,
        commission_amount INTEGER NOT NULL,
        net_restaurant_amount INTEGER NOT NULL,
        delivery_fee_amount INTEGER NOT NULL DEFAULT 0,
        note TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("restaurant_payouts")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_payouts (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
        restaurant_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        method TEXT NOT NULL DEFAULT 'bkash',
        account_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reference_id TEXT DEFAULT '',
        requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMP
      );
    `);
  }
  if (!existingSet.has("riders")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS riders (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        restaurant_id INTEGER,
        added_by_uid TEXT DEFAULT '',
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'Motorbike',
        nid_number TEXT DEFAULT '',
        zone TEXT NOT NULL DEFAULT 'Gulshan / Banani',
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'approved',
        current_lat DOUBLE PRECISION NOT NULL DEFAULT 23.7949,
        current_lng DOUBLE PRECISION NOT NULL DEFAULT 90.4043,
        location_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        total_deliveries INTEGER NOT NULL DEFAULT 0,
        total_earnings INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("reviews")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        customer_uid TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        food_rating INTEGER NOT NULL DEFAULT 5,
        comment TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("favorites")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        customer_uid TEXT NOT NULL,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("notifications")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_uid TEXT NOT NULL,
        role_target TEXT NOT NULL DEFAULT 'customer',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'order',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        related_order_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("platform_settings")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id SERIAL PRIMARY KEY,
        platform_name TEXT NOT NULL DEFAULT 'Foodora BD',
        default_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT '15.00',
        default_delivery_fee INTEGER NOT NULL DEFAULT 49,
        service_fee INTEGER NOT NULL DEFAULT 10,
        min_order_default INTEGER NOT NULL DEFAULT 150,
        pathao_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        pathao_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
        bkash_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        bkash_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
        sslcommerz_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sslcommerz_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
        storefront_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        delivery_financial_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("audit_logs")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_uid TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("rider_jobs")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rider_jobs (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        restaurant_name TEXT NOT NULL,
        owner_uid TEXT NOT NULL,
        title TEXT NOT NULL,
        title_bn TEXT NOT NULL,
        zone TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'Motorbike / Bicycle',
        salary_range TEXT NOT NULL DEFAULT '৳15,000 - ৳22,000 / month',
        shift_hours TEXT NOT NULL DEFAULT 'Full-time · 11:00 AM - 11:00 PM',
        vacancies INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("rider_job_applications")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rider_job_applications (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES rider_jobs(id) ON DELETE CASCADE,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        applicant_uid TEXT DEFAULT '',
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'Motorbike',
        zone TEXT NOT NULL,
        nid_number TEXT DEFAULT '',
        experience_note TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("vendor_admin_messages")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_admin_messages (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        restaurant_name TEXT NOT NULL,
        owner_uid TEXT NOT NULL,
        sender_uid TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
        is_read_by_vendor BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("ai_providers")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL DEFAULT 'openai',
        model TEXT NOT NULL,
        api_base_url TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("payment_transactions")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL,
        tx_kind TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payer_role TEXT NOT NULL DEFAULT 'customer',
        recipient_role TEXT NOT NULL DEFAULT 'platform_restaurant',
        payment_method TEXT NOT NULL DEFAULT 'bkash',
        amount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        gateway_tx_id TEXT DEFAULT '',
        rider_uid TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
  if (!existingSet.has("rider_wallet_ledger")) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rider_wallet_ledger (
        id SERIAL PRIMARY KEY,
        rider_uid TEXT NOT NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        order_number TEXT NOT NULL DEFAULT '',
        entry_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        cash_collected INTEGER NOT NULL DEFAULT 0,
        rider_earning_delta INTEGER NOT NULL DEFAULT 0,
        commission_owed_delta INTEGER NOT NULL DEFAULT 0,
        commission_settled_delta INTEGER NOT NULL DEFAULT 0,
        reference_id TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
}

// src/db/seed.ts
import { count } from "drizzle-orm";
var seedPromise = null;
var IMG_HERO = "/src/assets/images/hero_dhaka_feast_1794831374659.jpg";
var IMG_BIRIYANI = "/src/assets/images/food_kacchi_biriyani_1794831373742.jpg";
var IMG_BURGER = "/src/assets/images/food_gourmet_burger_1794831375029.jpg";
var IMG_PIZZA = "/src/assets/images/food_artisan_pizza_1794831375026.jpg";
var IMG_ASIAN = "/src/assets/images/food_asian_momos_1794831375934.jpg";
var IMG_DESSERT = "/src/assets/images/food_cafe_dessert_1794831375892.jpg";
var IMG_BANGLA = "/src/assets/images/food_bangla_platter_1794831377030.jpg";
var IMG_KABAB = "/src/assets/images/food_tandoori_kabab_1794831377175.jpg";
async function ensureDatabaseSeeded() {
  if (!seedPromise) {
    seedPromise = runSeedIfEmpty().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}
async function runSeedIfEmpty() {
  try {
    const existing2 = await withDbRetry(() => db.select({ total: count() }).from(restaurants));
    if (Number(existing2[0]?.total ?? 0) > 0) {
      return;
    }
  } catch (err) {
    if (isTransientDbError(err)) {
      throw err;
    }
    await withDbRetry(() => ensureSchemaTables());
  }
  const existing = await db.select({ total: count() }).from(restaurants);
  if (Number(existing[0]?.total ?? 0) > 0) {
    return;
  }
  await db.insert(platformSettings).values({
    platformName: "Foodora BD",
    defaultCommissionPct: "15.00",
    defaultDeliveryFee: 49,
    serviceFee: 10,
    minOrderDefault: 150,
    pathaoEnabled: true,
    pathaoSandbox: true,
    bkashEnabled: true,
    bkashSandbox: true,
    sslcommerzEnabled: true,
    sslcommerzSandbox: true
  });
  await db.insert(users).values([
    {
      uid: "demo-customer-uid",
      email: "customer@foodora.bd",
      fullName: "Rahim Uddin",
      phone: "+8801711000001",
      role: "customer"
    },
    {
      uid: "demo-vendor-uid",
      email: "partner@sultansdine.bd",
      fullName: "Tariqul Islam (Sultan\u2019s Dine)",
      phone: "+8801711000002",
      role: "restaurant_owner"
    },
    {
      uid: "demo-rider-uid",
      email: "rider@foodora.bd",
      fullName: "Kamrul Hasan",
      phone: "+8801711000003",
      role: "rider"
    },
    {
      uid: "demo-admin-uid",
      email: "admin@foodora.bd",
      fullName: "Foodora BD Platform Admin",
      phone: "+8801711000000",
      role: "super_admin"
    }
  ]).onConflictDoNothing();
  await db.insert(customerAddresses).values([
    {
      userUid: "demo-customer-uid",
      label: "Home \u2014 Gulshan 2",
      area: "Gulshan 2",
      addressLine: "House 24, Road 71, Gulshan 2, Dhaka 1212",
      lat: 23.7949,
      lng: 90.4144,
      instructions: "Call upon arrival at main gate",
      isDefault: true
    },
    {
      userUid: "demo-customer-uid",
      label: "Office \u2014 Banani",
      area: "Banani",
      addressLine: "Level 6, Kemal Ataturk Avenue, Banani, Dhaka 1213",
      lat: 23.7937,
      lng: 90.4066,
      instructions: "Leave at reception desk",
      isDefault: false
    }
  ]);
  await db.insert(riders).values([
    {
      uid: "demo-rider-uid",
      fullName: "Kamrul Hasan",
      phone: "+8801711000003",
      email: "rider@foodora.bd",
      vehicleType: "Motorbike",
      nidNumber: "1994261882910",
      zone: "Gulshan / Banani",
      isAvailable: true,
      status: "approved",
      currentLat: 23.7939,
      currentLng: 90.4112,
      totalDeliveries: 148,
      totalEarnings: 18450
    },
    {
      uid: "rider-mehedi-uid",
      fullName: "Mehedi Rahman",
      phone: "+8801819223344",
      email: "mehedi.rider@foodora.bd",
      vehicleType: "Bicycle",
      nidNumber: "1997261445512",
      zone: "Dhanmondi / Mohammadpur",
      isAvailable: true,
      status: "approved",
      currentLat: 23.7461,
      currentLng: 90.3742,
      totalDeliveries: 92,
      totalEarnings: 11200
    }
  ]).onConflictDoNothing();
  const restaurantSeed = [
    {
      ownerUid: "demo-vendor-uid",
      name: "Sultan's Dine \u2014 Gulshan",
      nameBn: "\u09B8\u09C1\u09B2\u09A4\u09BE\u09A8\u09B8 \u09A1\u09BE\u0987\u09A8 \u2014 \u0997\u09C1\u09B2\u09B6\u09BE\u09A8",
      slug: "sultans-dine-gulshan",
      description: "Authentic Old Dhaka style Mutton Kacchi Biriyani slow-cooked in copper handis with saffron and aromatic spices.",
      cuisine: "Biriyani",
      area: "Gulshan 2",
      address: "Plot 14, Road 103, Gulshan 2, Dhaka",
      lat: 23.7962,
      lng: 90.4158,
      phone: "+8801712345601",
      email: "gulshan@sultansdine.bd",
      coverUrl: IMG_BIRIYANI,
      tradeLicense: "TRAD/DSCC/004812",
      nidNumber: "1988269012345",
      payoutMethod: "bkash",
      payoutAccount: "01712345601",
      deliveryTimeMin: 15,
      deliveryFee: 49,
      minOrder: 250,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.9",
      reviewCount: 3500,
      discountPct: 0,
      isSponsored: true,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "platform",
      openingHours: "11:30 AM - 11:00 PM"
    },
    {
      ownerUid: "owner-kacchibhai",
      name: "Kacchi Bhai \u2014 Banani",
      nameBn: "\u0995\u09BE\u099A\u09CD\u099A\u09BF \u09AD\u09BE\u0987 \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "kacchi-bhai-banani",
      description: "Traditional Basmati Kacchi, Polao, Borhani and Jali Kabab crafted fresh every batch.",
      cuisine: "Biriyani",
      area: "Banani",
      address: "Road 11, Block F, Banani, Dhaka",
      lat: 23.7931,
      lng: 90.4052,
      phone: "+8801712345602",
      email: "banani@kacchibhai.bd",
      coverUrl: IMG_HERO,
      tradeLicense: "TRAD/DNCC/009123",
      nidNumber: "1989112233445",
      payoutMethod: "bkash",
      payoutAccount: "01712345602",
      deliveryTimeMin: 15,
      deliveryFee: 45,
      minOrder: 200,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.8",
      reviewCount: 4200,
      discountPct: 10,
      isSponsored: true,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "platform",
      openingHours: "12:00 PM - 11:30 PM"
    },
    {
      ownerUid: "owner-burgerxpress",
      name: "Burger Xpress \u2014 Banani",
      nameBn: "\u09AC\u09BE\u09B0\u09CD\u0997\u09BE\u09B0 \u098F\u0995\u09CD\u09B8\u09AA\u09CD\u09B0\u09C7\u09B8 \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "burger-xpress-banani",
      description: "Double smashed dry-aged beef burgers, crispy peri-peri fries, and house-smoked sauces.",
      cuisine: "Burger",
      area: "Banani",
      address: "House 58, Road 11, Banani, Dhaka",
      lat: 23.7924,
      lng: 90.4079,
      phone: "+8801712345603",
      email: "hello@burgerxpress.bd",
      coverUrl: IMG_BURGER,
      tradeLicense: "TRAD/DNCC/014510",
      payoutMethod: "nagad",
      payoutAccount: "01712345603",
      deliveryTimeMin: 12,
      deliveryFee: 49,
      minOrder: 180,
      priceTier: "\u09F3\u09F3",
      rating: "4.9",
      reviewCount: 3e3,
      discountPct: 15,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "basic",
      deliveryMode: "platform",
      openingHours: "11:00 AM - 12:30 AM"
    },
    {
      ownerUid: "owner-pizzasquad",
      name: "Pizza Squad \u2014 Dhanmondi",
      nameBn: "\u09AA\u09BF\u09CE\u099C\u09BE \u09B8\u09CD\u0995\u09CB\u09DF\u09BE\u09A1 \u2014 \u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF",
      slug: "pizza-squad-dhanmondi",
      description: "Neapolitan sourdough pizzas baked at 450\xB0C with fresh mozzarella and basil.",
      cuisine: "Pizza",
      area: "Dhanmondi",
      address: "Satmasjid Road, Dhanmondi 27, Dhaka",
      lat: 23.7518,
      lng: 90.3712,
      phone: "+8801712345604",
      email: "orders@pizzasquad.bd",
      coverUrl: IMG_PIZZA,
      tradeLicense: "TRAD/DSCC/023111",
      payoutMethod: "bkash",
      payoutAccount: "01712345604",
      deliveryTimeMin: 25,
      deliveryFee: 59,
      minOrder: 300,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.8",
      reviewCount: 1200,
      discountPct: 15,
      isSponsored: false,
      isNew: true,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "basic",
      deliveryMode: "third_party",
      openingHours: "12:00 PM - 11:30 PM"
    },
    {
      ownerUid: "owner-pandadumplings",
      name: "Panda Dumplings \u2014 Gulshan 2",
      nameBn: "\u09AA\u09BE\u09A8\u09CD\u09A1\u09BE \u09A1\u09BE\u09AE\u09CD\u09AA\u09B2\u09BF\u0982\u09B8 \u2014 \u0997\u09C1\u09B2\u09B6\u09BE\u09A8 \u09E8",
      slug: "panda-dumplings-gulshan",
      description: "Hand-folded steamed momos, Sichuan chili wontons, and wok-tossed chowmein.",
      cuisine: "Chinese",
      area: "Gulshan 2",
      address: "Road 55, Gulshan 2, Dhaka",
      lat: 23.7975,
      lng: 90.4139,
      phone: "+8801712345605",
      email: "kitchen@pandadumplings.bd",
      coverUrl: IMG_ASIAN,
      tradeLicense: "TRAD/DNCC/031900",
      payoutMethod: "bkash",
      payoutAccount: "01712345605",
      deliveryTimeMin: 15,
      deliveryFee: 52,
      minOrder: 200,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.9",
      reviewCount: 4e3,
      discountPct: 0,
      isSponsored: true,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "platform",
      openingHours: "12:00 PM - 11:00 PM"
    },
    {
      ownerUid: "owner-holeybakery",
      name: "Holey Bakery \u2014 Gulshan",
      nameBn: "\u09B9\u09CB\u09B2\u09BF \u09AC\u09C7\u0995\u09BE\u09B0\u09BF \u2014 \u0997\u09C1\u09B2\u09B6\u09BE\u09A8",
      slug: "holey-bakery-gulshan",
      description: "Artisanal croissants, dark chocolate fudge cakes, and specialty cold brew coffee.",
      cuisine: "Bakery",
      area: "Gulshan 1",
      address: "Road 79, Gulshan 1, Dhaka",
      lat: 23.7811,
      lng: 90.4167,
      phone: "+8801712345606",
      email: "bakery@holey.bd",
      coverUrl: IMG_DESSERT,
      tradeLicense: "TRAD/DNCC/045102",
      payoutMethod: "bank",
      payoutAccount: "City Bank AC-11029384",
      deliveryTimeMin: 10,
      deliveryFee: 45,
      minOrder: 200,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "5.0",
      reviewCount: 1e4,
      discountPct: 15,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "12.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "enterprise",
      deliveryMode: "platform",
      openingHours: "08:00 AM - 10:30 PM"
    },
    {
      ownerUid: "owner-starkabab",
      name: "Star Kabab & Restaurant \u2014 Banani",
      nameBn: "\u09B8\u09CD\u099F\u09BE\u09B0 \u0995\u09BE\u09AC\u09BE\u09AC \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "star-kabab-banani",
      description: "Iconic Dhaka charcoal chicken tikka, mutton seekh kabab, butter naan, and kacchi.",
      cuisine: "Kabab",
      area: "Banani",
      address: "House 12, Road 17, Banani, Dhaka",
      lat: 23.7945,
      lng: 90.4029,
      phone: "+8801712345607",
      email: "star@starkabab.bd",
      coverUrl: IMG_KABAB,
      tradeLicense: "TRAD/DNCC/001122",
      payoutMethod: "bkash",
      payoutAccount: "01712345607",
      deliveryTimeMin: 10,
      deliveryFee: 52,
      minOrder: 150,
      priceTier: "\u09F3\u09F3",
      rating: "4.8",
      reviewCount: 15e3,
      discountPct: 0,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "restaurant",
      openingHours: "07:00 AM - 11:45 PM"
    },
    {
      ownerUid: "owner-ghoroa",
      name: "Ghoroa Hotel & Restaurant",
      nameBn: "\u0998\u09B0\u09CB\u09DF\u09BE \u09B9\u09CB\u099F\u09C7\u09B2 \u098F\u09A8\u09CD\u09A1 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F",
      slug: "ghoroa-hotel-motijheel",
      description: "Traditional Bangladeshi shorshe ilish, bhuna khichuri, and 12-item homestyle bhorta platter.",
      cuisine: "Bangladeshi",
      area: "Motijheel",
      address: "32 Toyenbee Circular Road, Motijheel, Dhaka",
      lat: 23.7272,
      lng: 90.4198,
      phone: "+8801712345608",
      email: "orders@ghoroa.bd",
      coverUrl: IMG_BANGLA,
      tradeLicense: "TRAD/DSCC/000988",
      payoutMethod: "bkash",
      payoutAccount: "01712345608",
      deliveryTimeMin: 18,
      deliveryFee: 59,
      minOrder: 160,
      priceTier: "\u09F3\u09F3",
      rating: "4.8",
      reviewCount: 2e4,
      discountPct: 12,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "basic",
      deliveryMode: "third_party",
      openingHours: "08:00 AM - 11:00 PM"
    },
    {
      ownerUid: "owner-takeout",
      name: "Takeout \u2014 Banani",
      nameBn: "\u099F\u09C7\u0995\u0986\u0989\u099F \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "takeout-banani",
      description: "Dhaka\u2019s beloved gourmet beef & crispy chicken burgers with loaded cheese fries.",
      cuisine: "Burger",
      area: "Banani",
      address: "Road 12, Block E, Banani, Dhaka",
      lat: 23.7918,
      lng: 90.4041,
      phone: "+8801712345609",
      email: "banani@takeout.bd",
      coverUrl: IMG_BURGER,
      tradeLicense: "TRAD/DNCC/007721",
      payoutMethod: "bkash",
      payoutAccount: "01712345609",
      deliveryTimeMin: 12,
      deliveryFee: 52,
      minOrder: 200,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.9",
      reviewCount: 2e4,
      discountPct: 10,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "platform",
      openingHours: "12:00 PM - 11:59 PM"
    },
    {
      ownerUid: "owner-cheez",
      name: "Cheez \u2014 Banani",
      nameBn: "\u099A\u09BF\u099C \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "cheez-banani",
      description: "Hand-stretched cheesy pizzas, garlic knots, and creamy Alfredo pasta bowls.",
      cuisine: "Pizza",
      area: "Banani",
      address: "Road 11, Banani, Dhaka",
      lat: 23.7929,
      lng: 90.4081,
      phone: "+8801712345610",
      email: "cheez@cheez.bd",
      coverUrl: IMG_PIZZA,
      tradeLicense: "TRAD/DNCC/051120",
      payoutMethod: "nagad",
      payoutAccount: "01712345610",
      deliveryTimeMin: 15,
      deliveryFee: 52,
      minOrder: 250,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "4.9",
      reviewCount: 1e4,
      discountPct: 15,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "basic",
      deliveryMode: "platform",
      openingHours: "12:00 PM - 11:30 PM"
    },
    {
      ownerUid: "owner-mezzan",
      name: "Mezzan Haile Aaiun",
      nameBn: "\u09AE\u09C7\u099C\u09CD\u099C\u09BE\u09A8 \u09B9\u09BE\u0987\u09B2\u09C7 \u0986\u0987\u09DF\u09C1\u09A8 \u2014 \u09AC\u09A8\u09BE\u09A8\u09C0",
      slug: "mezzan-haile-aaiun",
      description: "Authentic Chattogram Mejbani beef curry, kala bhuna, and chana dal.",
      cuisine: "Bangladeshi",
      area: "Banani",
      address: "House 42, Road 27, Banani, Dhaka",
      lat: 23.7952,
      lng: 90.4021,
      phone: "+8801712345611",
      email: "mezzan@mezzan.bd",
      coverUrl: IMG_BANGLA,
      tradeLicense: "TRAD/DNCC/061233",
      payoutMethod: "bkash",
      payoutAccount: "01712345611",
      deliveryTimeMin: 15,
      deliveryFee: 52,
      minOrder: 220,
      priceTier: "\u09F3\u09F3",
      rating: "4.6",
      reviewCount: 2e3,
      discountPct: 10,
      isSponsored: false,
      isNew: true,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "free",
      deliveryMode: "platform",
      openingHours: "11:30 AM - 11:00 PM"
    },
    {
      ownerUid: "owner-northend",
      name: "NORTH END Coffee Roasters",
      nameBn: "\u09A8\u09B0\u09CD\u09A5 \u098F\u09A8\u09CD\u09A1 \u0995\u09AB\u09BF \u09B0\u09CB\u09B8\u09CD\u099F\u09BE\u09B0\u09CD\u09B8",
      slug: "north-end-gulshan",
      description: "Single-origin Chittagong Hill Tracts espresso, iced lattes, and freshly baked pastries.",
      cuisine: "Drinks",
      area: "Gulshan 2",
      address: "Road 41, Gulshan 2, Dhaka",
      lat: 23.7932,
      lng: 90.4152,
      phone: "+8801712345612",
      email: "roastery@northend.bd",
      coverUrl: IMG_DESSERT,
      tradeLicense: "TRAD/DNCC/019932",
      payoutMethod: "bank",
      payoutAccount: "BRAC Bank AC-9981234",
      deliveryTimeMin: 15,
      deliveryFee: 45,
      minOrder: 150,
      priceTier: "\u09F3\u09F3\u09F3",
      rating: "5.0",
      reviewCount: 3e3,
      discountPct: 0,
      isSponsored: false,
      isNew: false,
      isOpen: true,
      status: "approved",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "premium",
      deliveryMode: "platform",
      openingHours: "07:30 AM - 11:00 PM"
    },
    {
      ownerUid: "owner-pending-uttara",
      name: "Dhaka Spice House \u2014 Uttara",
      nameBn: "\u09A2\u09BE\u0995\u09BE \u09B8\u09CD\u09AA\u09BE\u0987\u09B8 \u09B9\u09BE\u0989\u09B8 \u2014 \u0989\u09A4\u09CD\u09A4\u09B0\u09BE",
      slug: "dhaka-spice-house-uttara",
      description: "New family kitchen in Sector 7 Uttara offering tehari, grilled chicken, and kababs.",
      cuisine: "Bangladeshi",
      area: "Uttara",
      address: "House 19, Road 12, Sector 7, Uttara, Dhaka",
      lat: 23.8682,
      lng: 90.3991,
      phone: "+8801712345699",
      email: "apply@dhakaspice.bd",
      coverUrl: IMG_KABAB,
      tradeLicense: "TRAD/DNCC/099881",
      nidNumber: "1991269988776",
      payoutMethod: "bkash",
      payoutAccount: "01712345699",
      deliveryTimeMin: 25,
      deliveryFee: 55,
      minOrder: 180,
      priceTier: "\u09F3\u09F3",
      rating: "4.7",
      reviewCount: 12,
      discountPct: 15,
      isSponsored: false,
      isNew: true,
      isOpen: true,
      status: "pending",
      commissionRate: "15.00",
      commissionType: "percentage",
      fixedCommission: 0,
      subscriptionPlan: "free",
      deliveryMode: "platform",
      openingHours: "11:00 AM - 11:00 PM"
    }
  ];
  const insertedRestaurants = await db.insert(restaurants).values(restaurantSeed).returning();
  const menuBlueprints = {
    Biriyani: [
      {
        category: "Signature Kacchi",
        name: "Bashmati Mutton Kacchi",
        nameBn: "\u09AC\u09BE\u09B8\u09AE\u09A4\u09BF \u09AE\u09BE\u099F\u09A8 \u0995\u09BE\u099A\u09CD\u099A\u09BF",
        description: "Tender marinated mutton slow-cooked with aged basmati rice, saffron, potato, and aromatic ghee.",
        imageUrl: IMG_BIRIYANI,
        price: 499,
        discountPrice: 449,
        variationsJson: [
          { name: "Half (1 Person)", priceDelta: 0 },
          { name: "Full (1-2 Persons)", priceDelta: 220 },
          { name: "Family Handi (4 Persons)", priceDelta: 950 }
        ],
        addonsJson: [
          { name: "Chilled Borhani (250ml)", price: 65 },
          { name: "Beef Jali Kabab", price: 85 },
          { name: "Shahi Firni", price: 90 }
        ],
        isPopular: true
      },
      {
        category: "Polao & Tehari",
        name: "Shahi Morog Polao",
        nameBn: "\u09B6\u09BE\u09B9\u09C0 \u09AE\u09CB\u09B0\u0997 \u09AA\u09CB\u09B2\u09BE\u0993",
        description: "Fragrant chinigura rice paired with rich roasted chicken leg and egg.",
        imageUrl: IMG_HERO,
        price: 360,
        variationsJson: [
          { name: "Regular", priceDelta: 0 },
          { name: "Special with Egg & Kabab", priceDelta: 110 }
        ],
        addonsJson: [
          { name: "Chilled Borhani (250ml)", price: 65 },
          { name: "Extra Chicken Roast", price: 160 }
        ],
        isPopular: true
      },
      {
        category: "Kabab & Sides",
        name: "Beef Reshmi & Seekh Combo",
        nameBn: "\u09AC\u09BF\u09AB \u09B0\u09C7\u09B6\u09AE\u09BF \u0993 \u09B6\u09BF\u0995 \u0995\u09BE\u09AC\u09BE\u09AC",
        description: "Charcoal-grilled skewers served with butter garlic naan and mint chutney.",
        imageUrl: IMG_KABAB,
        price: 340,
        variationsJson: [{ name: "2 Skewers + 1 Naan", priceDelta: 0 }],
        addonsJson: [{ name: "Extra Butter Naan", price: 60 }],
        isPopular: false
      },
      {
        category: "Drinks & Dessert",
        name: "Traditional Mint Borhani",
        nameBn: "\u0990\u09A4\u09BF\u09B9\u09CD\u09AF\u09AC\u09BE\u09B9\u09C0 \u09AA\u09C1\u09A6\u09BF\u09A8\u09BE \u09AC\u09CB\u09B0\u09B9\u09BE\u09A8\u09BF",
        description: "Spiced yogurt digestive drink blended with green chili, coriander, and rock salt.",
        imageUrl: IMG_DESSERT,
        price: 80,
        variationsJson: [
          { name: "250ml Glass", priceDelta: 0 },
          { name: "1 Litre Bottle", priceDelta: 200 }
        ],
        addonsJson: [],
        isPopular: false
      }
    ],
    Burger: [
      {
        category: "Smashed Burgers",
        name: "Double Cheddar Smash Burger",
        nameBn: "\u09A1\u09BE\u09AC\u09B2 \u099A\u09C7\u09A1\u09BE\u09B0 \u09B8\u09CD\u09AE\u09CD\u09AF\u09BE\u09B6 \u09AC\u09BE\u09B0\u09CD\u0997\u09BE\u09B0",
        description: "Two crispy-edged beef patties, double aged cheddar, caramelized onions, house burger sauce.",
        imageUrl: IMG_BURGER,
        price: 420,
        discountPrice: 369,
        variationsJson: [
          { name: "Single Patty", priceDelta: -80 },
          { name: "Double Patty", priceDelta: 0 },
          { name: "Triple Monster", priceDelta: 140 }
        ],
        addonsJson: [
          { name: "Peri-Peri Fries", price: 120 },
          { name: "Extra Cheddar Slice", price: 50 },
          { name: "Iced Lemon Tea", price: 90 }
        ],
        isPopular: true
      },
      {
        category: "Chicken Specials",
        name: "Nashville Crispy Chicken Burger",
        nameBn: "\u09A8\u09CD\u09AF\u09BE\u09B6\u09AD\u09BF\u09B2 \u0995\u09CD\u09B0\u09BF\u09B8\u09CD\u09AA\u09BF \u099A\u09BF\u0995\u09C7\u09A8 \u09AC\u09BE\u09B0\u09CD\u0997\u09BE\u09B0",
        description: "Crispy buttermilk fried chicken thigh tossed in spicy glaze with slaw.",
        imageUrl: IMG_BURGER,
        price: 340,
        variationsJson: [
          { name: "Mild", priceDelta: 0 },
          { name: "Naga Blaze", priceDelta: 20 }
        ],
        addonsJson: [{ name: "Cheesy Loaded Fries", price: 165 }],
        isPopular: true
      },
      {
        category: "Sides",
        name: "Smoked Garlic Chicken Wings (6 pcs)",
        nameBn: "\u09B8\u09CD\u09AE\u09CB\u0995\u09A1 \u0997\u09BE\u09B0\u09CD\u09B2\u09BF\u0995 \u099A\u09BF\u0995\u09C7\u09A8 \u0989\u0987\u0982\u09B8",
        description: "Glazed crispy wings served with ranch dip.",
        imageUrl: IMG_KABAB,
        price: 290,
        variationsJson: [{ name: "6 Pieces", priceDelta: 0 }, { name: "12 Pieces", priceDelta: 250 }],
        addonsJson: [{ name: "Extra Ranch Dip", price: 40 }],
        isPopular: false
      }
    ],
    Pizza: [
      {
        category: "Artisan Wood-Fired",
        name: "Pepperoni & Fresh Basil Pizza",
        nameBn: "\u09AA\u09C7\u09AA\u09BE\u09B0\u09A8\u09BF \u0993 \u09AB\u09CD\u09B0\u09C7\u09B6 \u09AC\u09C7\u09B8\u09BF\u09B2 \u09AA\u09BF\u09CE\u099C\u09BE",
        description: "San Marzano tomato base, halal beef pepperoni, buffalo mozzarella, and olive oil.",
        imageUrl: IMG_PIZZA,
        price: 790,
        discountPrice: 680,
        variationsJson: [
          { name: "9-inch Personal", priceDelta: 0 },
          { name: "12-inch Medium", priceDelta: 320 },
          { name: "16-inch Party", priceDelta: 650 }
        ],
        addonsJson: [
          { name: "Stuffed Cheese Crust", price: 140 },
          { name: "Garlic Dip", price: 45 }
        ],
        isPopular: true
      },
      {
        category: "Artisan Wood-Fired",
        name: "Dhaka Naga Beef Overload",
        nameBn: "\u09A2\u09BE\u0995\u09BE \u09A8\u09BE\u0997\u09BE \u09AC\u09BF\u09AB \u0993\u09AD\u09BE\u09B0\u09B2\u09CB\u09A1",
        description: "Spiced minced beef, roasted bell peppers, red onion, and green naga chili.",
        imageUrl: IMG_PIZZA,
        price: 850,
        variationsJson: [
          { name: "9-inch Personal", priceDelta: 0 },
          { name: "12-inch Medium", priceDelta: 340 }
        ],
        addonsJson: [{ name: "Extra Mozzarella", price: 110 }],
        isPopular: true
      }
    ],
    Chinese: [
      {
        category: "Momos & Dumplings",
        name: "Steamed Chicken & Chive Momos (8 pcs)",
        nameBn: "\u09B8\u09CD\u099F\u09BF\u09AE\u09A1 \u099A\u09BF\u0995\u09C7\u09A8 \u09AE\u09CB\u09AE\u09CB (\u09EE \u09AA\u09BF\u09B8)",
        description: "Juicy handmade dumplings served with house Sichuan chili oil and garlic soy.",
        imageUrl: IMG_ASIAN,
        price: 290,
        discountPrice: 255,
        variationsJson: [
          { name: "Steamed (8 pcs)", priceDelta: 0 },
          { name: "Pan-Fried Kothey (8 pcs)", priceDelta: 30 }
        ],
        addonsJson: [{ name: "Extra Chili Oil", price: 35 }],
        isPopular: true
      },
      {
        category: "Wok Noodles",
        name: "Sesame Hakka Chicken Chowmein",
        nameBn: "\u09B8\u09C7\u09B8\u09BE\u09AE\u09BF \u09B9\u09BE\u0995\u09CD\u0995\u09BE \u099A\u09BF\u0995\u09C7\u09A8 \u099A\u09BE\u0989\u09AE\u09BF\u09A8",
        description: "Smoky wok-tossed noodles with julienned vegetables, chicken strips, and toasted sesame.",
        imageUrl: IMG_ASIAN,
        price: 360,
        variationsJson: [{ name: "Regular Bowl", priceDelta: 0 }, { name: "Sharing Platter", priceDelta: 240 }],
        addonsJson: [{ name: "Crispy Wonthons (4 pcs)", price: 120 }],
        isPopular: true
      }
    ],
    Bakery: [
      {
        category: "Cakes & Pastries",
        name: "Belgian Dark Chocolate Fudge Cake",
        nameBn: "\u09AC\u09C7\u09B2\u099C\u09BF\u09DF\u09BE\u09A8 \u09A1\u09BE\u09B0\u09CD\u0995 \u099A\u0995\u09B2\u09C7\u099F \u09AB\u09BE\u099C \u0995\u09C7\u0995",
        description: "Rich 3-layer dark cocoa sponge finished with silky chocolate ganache.",
        imageUrl: IMG_DESSERT,
        price: 340,
        discountPrice: 295,
        variationsJson: [
          { name: "Single Slice", priceDelta: 0 },
          { name: "Half Pound Box", priceDelta: 450 }
        ],
        addonsJson: [{ name: "Iced Caramel Macchiato", price: 240 }],
        isPopular: true
      },
      {
        category: "Coffee & Drinks",
        name: "Iced Caramel Macchiato",
        nameBn: "\u0986\u0987\u09B8\u09A1 \u0995\u09CD\u09AF\u09BE\u09B0\u09BE\u09AE\u09C7\u09B2 \u09AE\u09CD\u09AF\u09BE\u0995\u09BF\u09AF\u09BC\u09BE\u099F\u09CB",
        description: "Double espresso poured over chilled milk and house-salted caramel.",
        imageUrl: IMG_DESSERT,
        price: 260,
        variationsJson: [
          { name: "Regular (12oz)", priceDelta: 0 },
          { name: "Large (16oz)", priceDelta: 60 }
        ],
        addonsJson: [{ name: "Oat Milk Swap", price: 70 }],
        isPopular: true
      }
    ],
    Kabab: [
      {
        category: "Charcoal Grill",
        name: "Chicken Tikka & Beef Seekh Platter",
        nameBn: "\u099A\u09BF\u0995\u09C7\u09A8 \u099F\u09BF\u0995\u09CD\u0995\u09BE \u0993 \u09AC\u09BF\u09AB \u09B6\u09BF\u0995 \u09AA\u09CD\u09B2\u09CD\u09AF\u09BE\u099F\u09BE\u09B0",
        description: "Smoky tandoor platter with 2 garlic naans, mint chutney, and pickled onions.",
        imageUrl: IMG_KABAB,
        price: 460,
        variationsJson: [{ name: "Solo Platter", priceDelta: 0 }, { name: "Duo Platter", priceDelta: 380 }],
        addonsJson: [{ name: "Butter Naan", price: 55 }, { name: "Mango Lassi", price: 140 }],
        isPopular: true
      }
    ],
    Bangladeshi: [
      {
        category: "Homestyle Platters",
        name: "Shorshe Ilish & Bhorta Rice Platter",
        nameBn: "\u09B8\u09B0\u09B7\u09C7 \u0987\u09B2\u09BF\u09B6 \u0993 \u09AD\u09B0\u09CD\u09A4\u09BE \u09AD\u09BE\u09A4 \u09AA\u09CD\u09B2\u09CD\u09AF\u09BE\u099F\u09BE\u09B0",
        description: "Padma hilsa cooked in mustard paste served with steamed rice, dal, and 3 signature bhortas.",
        imageUrl: IMG_BANGLA,
        price: 480,
        discountPrice: 430,
        variationsJson: [
          { name: "1 Piece Ilish Platter", priceDelta: 0 },
          { name: "2 Pieces Ilish Feast", priceDelta: 320 }
        ],
        addonsJson: [
          { name: "Aloo & Shutki Bhorta", price: 75 },
          { name: "Begun Bhaja", price: 50 }
        ],
        isPopular: true
      },
      {
        category: "Beef Specials",
        name: "Chattogram Kala Bhuna & Rice",
        nameBn: "\u099A\u099F\u09CD\u099F\u0997\u09CD\u09B0\u09BE\u09AE\u09C7\u09B0 \u0990\u09A4\u09BF\u09B9\u09CD\u09AF\u09AC\u09BE\u09B9\u09C0 \u0995\u09BE\u09B2\u09BE \u09AD\u09C1\u09A8\u09BE",
        description: "Slow-braised dark spiced beef served with fragrant miniket rice and thick lentil dal.",
        imageUrl: IMG_BANGLA,
        price: 440,
        variationsJson: [{ name: "Regular Bowl", priceDelta: 0 }],
        addonsJson: [{ name: "Extra Beef Portion", price: 200 }],
        isPopular: true
      }
    ],
    Drinks: [
      {
        category: "Specialty Coffee",
        name: "Hill Tracts Cold Brew & Croissant",
        nameBn: "\u0995\u09CB\u09B2\u09CD\u09A1 \u09AC\u09CD\u09B0\u09C1 \u0995\u09AB\u09BF \u0993 \u0995\u09CD\u09B0\u09CB\u09B8\u09BE\u0981 \u0995\u09AE\u09CD\u09AC\u09CB",
        description: "18-hour steeped Bandarban Arabica cold brew paired with flaky butter croissant.",
        imageUrl: IMG_DESSERT,
        price: 380,
        variationsJson: [{ name: "Black Cold Brew", priceDelta: 0 }, { name: "Sweet Cream Cold Brew", priceDelta: 40 }],
        addonsJson: [{ name: "Extra Espresso Shot", price: 65 }],
        isPopular: true
      }
    ]
  };
  for (const r of insertedRestaurants) {
    const items = menuBlueprints[r.cuisine] || menuBlueprints["Bangladeshi"];
    await db.insert(foodItems).values(
      items.map((item) => ({
        restaurantId: r.id,
        category: item.category,
        name: item.name,
        nameBn: item.nameBn,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        discountPrice: item.discountPrice ?? null,
        variationsJson: item.variationsJson,
        addonsJson: item.addonsJson,
        inStock: true,
        isAvailable: true,
        isPopular: item.isPopular
      }))
    );
  }
  await db.insert(coupons).values([
    {
      code: "FOODORA50",
      title: "\u09EB\u09E6% \u099B\u09BE\u09DC \u09AA\u09CD\u09B0\u09A5\u09AE \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7 (\u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u09F3\u09E7\u09EB\u09E6)",
      type: "percentage",
      value: 50,
      minOrder: 250,
      maxDiscount: 150,
      usageLimit: 5e3,
      usedCount: 142,
      isActive: true
    },
    {
      code: "DHAKA15",
      title: "\u09B8\u0995\u09B2 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7 \u09E7\u09EB% \u099B\u09BE\u09DC",
      type: "percentage",
      value: 15,
      minOrder: 300,
      maxDiscount: 200,
      usageLimit: 5e3,
      usedCount: 89,
      isActive: true
    },
    {
      code: "FREEDEL",
      title: "\u09AB\u09CD\u09B0\u09BF \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF (\u09A8\u09CD\u09AF\u09C2\u09A8\u09A4\u09AE \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09F3\u09E8\u09E6\u09E6)",
      type: "free_delivery",
      value: 0,
      minOrder: 200,
      maxDiscount: 80,
      usageLimit: 5e3,
      usedCount: 210,
      isActive: true
    }
  ]);
  const sultans = insertedRestaurants[0];
  const burgerX = insertedRestaurants[2];
  if (sultans && burgerX) {
    const insertedOrders = await db.insert(orders).values([
      {
        orderNumber: "FD-BD-10041",
        customerUid: "demo-customer-uid",
        customerName: "Rahim Uddin",
        customerPhone: "+8801711000001",
        restaurantId: sultans.id,
        restaurantName: sultans.name,
        deliveryAddress: "House 24, Road 71, Gulshan 2, Dhaka",
        deliveryArea: "Gulshan 2",
        deliveryLat: 23.7949,
        deliveryLng: 90.4144,
        deliveryMode: "platform",
        deliveryProvider: "Foodora Express Rider",
        consignmentId: "FDR-FD-BD-10041",
        paymentMethod: "bkash",
        paymentStatus: "paid",
        paymentTxId: "BKS-9821AA-0041",
        subtotal: 1e3,
        discountAmount: 0,
        couponCode: "",
        deliveryFee: 49,
        serviceFee: 10,
        taxAmount: 0,
        totalAmount: 1059,
        commissionRate: "15.00",
        platformCommission: 150,
        restaurantEarnings: 850,
        status: "delivered",
        riderUid: "demo-rider-uid",
        riderName: "Kamrul Hasan",
        estimatedMinutes: 22,
        itemsSnapshotJson: [
          {
            foodItemId: 1,
            name: "Bashmati Mutton Kacchi",
            nameBn: "\u09AC\u09BE\u09B8\u09AE\u09A4\u09BF \u09AE\u09BE\u099F\u09A8 \u0995\u09BE\u099A\u09CD\u099A\u09BF",
            quantity: 2,
            unitPrice: 500,
            variation: "Full",
            addons: [],
            lineTotal: 1e3
          }
        ]
      },
      {
        orderNumber: "FD-BD-10042",
        customerUid: "demo-customer-uid",
        customerName: "Rahim Uddin",
        customerPhone: "+8801711000001",
        restaurantId: sultans.id,
        restaurantName: sultans.name,
        deliveryAddress: "Level 6, Kemal Ataturk Avenue, Banani, Dhaka",
        deliveryArea: "Banani",
        deliveryLat: 23.7937,
        deliveryLng: 90.4066,
        deliveryMode: "platform",
        deliveryProvider: "Foodora Express Rider",
        consignmentId: "FDR-FD-BD-10042",
        paymentMethod: "cod",
        paymentStatus: "pending",
        paymentTxId: "COD-FD-BD-10042",
        subtotal: 720,
        discountAmount: 108,
        couponCode: "DHAKA15",
        deliveryFee: 49,
        serviceFee: 10,
        taxAmount: 0,
        totalAmount: 671,
        commissionRate: "15.00",
        platformCommission: 92,
        restaurantEarnings: 520,
        status: "ready",
        riderUid: "",
        riderName: "",
        estimatedMinutes: 20,
        itemsSnapshotJson: [
          {
            foodItemId: 2,
            name: "Shahi Morog Polao",
            nameBn: "\u09B6\u09BE\u09B9\u09C0 \u09AE\u09CB\u09B0\u0997 \u09AA\u09CB\u09B2\u09BE\u0993",
            quantity: 2,
            unitPrice: 360,
            variation: "Regular",
            addons: [],
            lineTotal: 720
          }
        ]
      }
    ]).returning();
    if (insertedOrders[0]) {
      await db.insert(orderStatusHistory).values([
        { orderId: insertedOrders[0].id, status: "confirmed", note: "Order confirmed & bKash payment verified" },
        { orderId: insertedOrders[0].id, status: "preparing", note: "Kitchen started preparing Mutton Kacchi" },
        { orderId: insertedOrders[0].id, status: "on_the_way", note: "Rider Kamrul Hasan picked up the order" },
        { orderId: insertedOrders[0].id, status: "delivered", note: "Delivered to Gulshan 2" }
      ]);
      await db.insert(commissionLedger).values({
        orderId: insertedOrders[0].id,
        restaurantId: sultans.id,
        entryType: "commission_earned",
        grossAmount: 1e3,
        commissionAmount: 150,
        netRestaurantAmount: 850,
        deliveryFeeAmount: 49,
        note: "15% marketplace commission settled for FD-BD-10041"
      });
      await db.insert(reviews).values({
        orderId: insertedOrders[0].id,
        restaurantId: sultans.id,
        customerUid: "demo-customer-uid",
        customerName: "Rahim Uddin",
        rating: 5,
        foodRating: 5,
        comment: "\u0985\u09B8\u09BE\u09A7\u09BE\u09B0\u09A3 \u0995\u09BE\u099A\u09CD\u099A\u09BF \u09AC\u09BF\u09B0\u09BF\u09DF\u09BE\u09A8\u09BF, \u0997\u09B0\u09AE \u0997\u09B0\u09AE \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u09AA\u09C7\u09DF\u09C7\u099B\u09BF \u09AE\u09BE\u09A4\u09CD\u09B0 \u09E8\u09E6 \u09AE\u09BF\u09A8\u09BF\u099F\u09C7!"
      });
    }
    if (insertedOrders[1]) {
      await db.insert(orderStatusHistory).values([
        { orderId: insertedOrders[1].id, status: "confirmed", note: "COD order placed" },
        { orderId: insertedOrders[1].id, status: "accepted", note: "Sultan's Dine accepted order" },
        { orderId: insertedOrders[1].id, status: "ready", note: "Order packed and ready for rider pickup" }
      ]);
    }
    await db.insert(restaurantPayouts).values({
      restaurantId: sultans.id,
      restaurantName: sultans.name,
      amount: 500,
      method: "bkash",
      accountNumber: "01712345601",
      status: "paid",
      referenceId: "PAYOUT-BKS-7781",
      processedAt: /* @__PURE__ */ new Date()
    });
    await db.insert(notifications).values([
      {
        recipientUid: "demo-vendor-uid",
        roleTarget: "restaurant_owner",
        title: "New Order FD-BD-10042 Ready for Dispatch",
        message: "Order FD-BD-10042 (\u09F3671) is packed and waiting for rider pickup.",
        type: "order",
        relatedOrderId: insertedOrders[1]?.id
      },
      {
        recipientUid: "demo-admin-uid",
        roleTarget: "super_admin",
        title: "Pending Restaurant Approval",
        message: "Dhaka Spice House \u2014 Uttara submitted NID and Trade License for verification.",
        type: "approval"
      }
    ]);
  }
}

// src/db/queries.ts
import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";

// src/lib/marketplace-logic.ts
function toBengaliDigits(input) {
  const bnDigits = ["\u09E6", "\u09E7", "\u09E8", "\u09E9", "\u09EA", "\u09EB", "\u09EC", "\u09ED", "\u09EE", "\u09EF"];
  return String(input).replace(/\d/g, (d) => bnDigits[Number(d)] ?? d);
}
function formatDurationEstimate(minutes, lang = "en", style = "default") {
  const safeMins = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const formatNum = (val) => lang === "bn" ? toBengaliDigits(val) : String(val);
  if (safeMins === 0) {
    return lang === "bn" ? "\u09E6 \u09AE\u09BF\u09A8\u09BF\u099F" : style === "compact" ? "0 min" : "0 mins";
  }
  if (safeMins < 60) {
    if (lang === "bn") {
      return `${formatNum(safeMins)} \u09AE\u09BF\u09A8\u09BF\u099F`;
    }
    return style === "compact" || safeMins === 1 ? `${safeMins} min` : `${safeMins} mins`;
  }
  const days = Math.floor(safeMins / 1440);
  const remAfterDays = safeMins % 1440;
  const hours = Math.floor(remAfterDays / 60);
  const mins = remAfterDays % 60;
  if (days > 0) {
    const partsEn2 = [`${days}d`];
    const partsBn2 = [`${formatNum(days)} \u09A6\u09BF\u09A8`];
    if (hours > 0) {
      partsEn2.push(`${hours} hr`);
      partsBn2.push(`${formatNum(hours)} \u0998\u09A3\u09CD\u099F\u09BE`);
    }
    if (mins > 0 && style !== "compact") {
      partsEn2.push(`${mins} min`);
      partsBn2.push(`${formatNum(mins)} \u09AE\u09BF\u09A8\u09BF\u099F`);
    }
    return lang === "bn" ? partsBn2.join(" ") : partsEn2.join(" ");
  }
  const partsEn = [`${hours} hr`];
  const partsBn = [`${formatNum(hours)} \u0998\u09A3\u09CD\u099F\u09BE`];
  if (mins > 0) {
    partsEn.push(`${mins} min`);
    partsBn.push(`${formatNum(mins)} \u09AE\u09BF\u09A8\u09BF\u099F`);
  }
  return lang === "bn" ? partsBn.join(" ") : partsEn.join(" ");
}
function calculateCartItemUnitPrice(item) {
  const effectiveBase = item.discountPrice !== null && item.discountPrice !== void 0 && item.discountPrice > 0 ? item.discountPrice : item.basePrice;
  const variationCost = item.variationDelta ?? 0;
  const addonsCost = item.addons.reduce((sum, addon) => sum + Math.max(0, addon.price), 0);
  return Math.max(0, effectiveBase + variationCost + addonsCost);
}
function evaluateCoupon(coupon, subtotal, deliveryFee, restaurantId) {
  if (!coupon.isActive) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: "Coupon is inactive" };
  }
  if (coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: "Coupon usage limit reached" };
  }
  if (coupon.restaurantId && coupon.restaurantId !== restaurantId) {
    return { valid: false, discountAmount: 0, deliveryFeeAfterCoupon: deliveryFee, reason: "Coupon not valid for this restaurant" };
  }
  if (subtotal < coupon.minOrder) {
    return {
      valid: false,
      discountAmount: 0,
      deliveryFeeAfterCoupon: deliveryFee,
      reason: `Minimum order of \u09F3${coupon.minOrder} required`
    };
  }
  if (coupon.type === "free_delivery") {
    return {
      valid: true,
      discountAmount: 0,
      deliveryFeeAfterCoupon: 0
    };
  }
  if (coupon.type === "fixed") {
    const discount2 = Math.min(subtotal, Math.max(0, coupon.value));
    return {
      valid: true,
      discountAmount: discount2,
      deliveryFeeAfterCoupon: deliveryFee
    };
  }
  const rawPct = Math.round(subtotal * coupon.value / 100);
  const capped = coupon.maxDiscount > 0 ? Math.min(rawPct, coupon.maxDiscount) : rawPct;
  const discount = Math.min(subtotal, Math.max(0, capped));
  return {
    valid: true,
    discountAmount: discount,
    deliveryFeeAfterCoupon: deliveryFee
  };
}
function calculateOrderFinancials(params) {
  const subtotal = Math.max(0, Math.round(params.subtotal));
  const discountAmount = Math.min(subtotal, Math.max(0, Math.round(params.discountAmount)));
  const netFoodRevenue = Math.max(0, subtotal - discountAmount);
  const deliveryFee = Math.max(0, Math.round(params.deliveryFee));
  const serviceFee = Math.max(0, Math.round(params.serviceFee));
  const taxAmount = Math.max(0, Math.round(params.taxAmount ?? 0));
  let platformCommission = 0;
  if (netFoodRevenue > 0) {
    if (params.commissionType === "fixed") {
      platformCommission = Math.min(netFoodRevenue, Math.max(0, Math.round(params.fixedCommission)));
    } else {
      platformCommission = Math.round(netFoodRevenue * Math.max(0, params.commissionRate) / 100);
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
    restaurantEarnings
  };
}
var VALID_TRANSITIONS = {
  confirmed: ["accepted", "preparing", "ready", "rider_assigned", "cancelled"],
  accepted: ["preparing", "ready", "rider_assigned", "cancelled"],
  preparing: ["ready", "rider_assigned", "cancelled"],
  ready: ["rider_assigned", "picked_up", "on_the_way", "delivered", "cancelled"],
  rider_assigned: ["picked_up", "on_the_way", "delivered", "cancelled"],
  picked_up: ["on_the_way", "delivered"],
  on_the_way: ["delivered"],
  delivered: [],
  cancelled: []
};
function canTransitionOrderStatus(from, to) {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}
function estimateDeliveryFeeAndEta(distanceKm, baseFee, deliveryMode) {
  const extraKm = Math.max(0, distanceKm - 2);
  const modeSurcharge = deliveryMode === "third_party" ? 10 : 0;
  const fee = Math.round(baseFee + extraKm * 12 + modeSurcharge);
  const etaMinutes = Math.max(12, Math.round(14 + distanceKm * 5.5));
  return { fee, etaMinutes };
}
function mapOpenMeteoWeather(weatherCode, precipitationMm) {
  const hasPrecip = precipitationMm > 0.2;
  if (weatherCode >= 95) {
    return { labelEn: "Thunderstorm", labelBn: "\u09AC\u099C\u09CD\u09B0\u09AC\u09C3\u09B7\u09CD\u099F\u09BF", isRaining: true, rainBufferMin: 12 };
  }
  if (weatherCode >= 51 && weatherCode <= 82 || hasPrecip) {
    return { labelEn: "Rainy", labelBn: "\u09AC\u09C3\u09B7\u09CD\u099F\u09BF \u09B9\u099A\u09CD\u099B\u09C7", isRaining: true, rainBufferMin: 7 };
  }
  if (weatherCode === 45 || weatherCode === 48) {
    return { labelEn: "Hazy / Fog", labelBn: "\u0995\u09C1\u09DF\u09BE\u09B6\u09BE\u099A\u09CD\u099B\u09A8\u09CD\u09A8", isRaining: false, rainBufferMin: 2 };
  }
  if (weatherCode >= 1 && weatherCode <= 3) {
    return { labelEn: "Partly Cloudy", labelBn: "\u0986\u0982\u09B6\u09BF\u0995 \u09AE\u09C7\u0998\u09B2\u09BE", isRaining: false, rainBufferMin: 0 };
  }
  return { labelEn: "Clear Sky", labelBn: "\u09AA\u09B0\u09BF\u09B7\u09CD\u0995\u09BE\u09B0 \u0986\u0995\u09BE\u09B6", isRaining: false, rainBufferMin: 0 };
}
var PRIMARY_SUPER_ADMIN_EMAIL = "raqkibrony@gmail.com";
var ADMIN_PIN_DEFAULT_EMAIL = "raqkibrony@gmail.com";
var SECONDARY_SUPER_ADMIN_EMAIL = "rakibraqkib@gmail.com";
var PROTECTED_SUPER_ADMIN_EMAILS = [
  PRIMARY_SUPER_ADMIN_EMAIL,
  SECONDARY_SUPER_ADMIN_EMAIL
];
function isProtectedSuperAdminEmail(email) {
  const normalized = email.trim().toLowerCase();
  return PROTECTED_SUPER_ADMIN_EMAILS.includes(normalized);
}
function canActorModifyUserAccount(params) {
  const { actorUid, actorRole, targetUid, targetEmail, currentRole, nextRole, nextStatus } = params;
  if (actorRole !== "admin" && actorRole !== "super_admin") {
    return { allowed: false, reason: "Only authorized Admin accounts can modify user roles." };
  }
  if (isProtectedSuperAdminEmail(targetEmail)) {
    if (nextRole !== "super_admin" || nextStatus === "suspended") {
      return {
        allowed: false,
        reason: "Primary Super Admin account is protected and cannot be demoted or suspended."
      };
    }
  }
  if (actorUid === targetUid && nextStatus === "suspended") {
    return { allowed: false, reason: "You cannot suspend your own active admin account." };
  }
  const touchesPrivilegedRole = currentRole === "super_admin" || currentRole === "admin" || nextRole === "super_admin" || nextRole === "admin";
  if (touchesPrivilegedRole && actorRole !== "super_admin") {
    return {
      allowed: false,
      reason: "Only Super Admin can grant or modify Admin and Super Admin privileges."
    };
  }
  return { allowed: true };
}
function validateBroadcastNotification(input) {
  const allowedTargets = [
    "all",
    "customer",
    "restaurant_owner",
    "rider",
    "admin"
  ];
  if (!allowedTargets.includes(input.targetRole)) {
    return { valid: false, reason: "Invalid broadcast target role." };
  }
  const title = input.title.trim();
  const message = input.message.trim();
  if (title.length < 3 || title.length > 120) {
    return { valid: false, reason: "Broadcast title must be between 3 and 120 characters." };
  }
  if (message.length < 5 || message.length > 500) {
    return { valid: false, reason: "Broadcast message must be between 5 and 500 characters." };
  }
  const type = input.type === "promo" || input.type === "order" ? input.type : "system";
  return {
    valid: true,
    targetRole: input.targetRole,
    title,
    message,
    type
  };
}
function normalizePartnerProductInput(raw, fallbackImageUrl) {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2 || name.length > 140) {
    return { valid: false, reason: "Product name must be between 2 and 140 characters." };
  }
  const nameBn = typeof raw.nameBn === "string" && raw.nameBn.trim().length > 0 ? raw.nameBn.trim() : name;
  const category = typeof raw.category === "string" && raw.category.trim().length >= 2 ? raw.category.trim() : "Popular";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const imageUrl = typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0 ? raw.imageUrl.trim() : fallbackImageUrl;
  const price = Math.round(Number(raw.price));
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: "Product price must be a positive number in BDT." };
  }
  let discountPrice = null;
  if (raw.discountPrice !== void 0 && raw.discountPrice !== null && raw.discountPrice !== "") {
    const parsedDiscount = Math.round(Number(raw.discountPrice));
    if (!Number.isFinite(parsedDiscount) || parsedDiscount <= 0 || parsedDiscount >= price) {
      return {
        valid: false,
        reason: "discountPrice must be a positive number lower than regular price."
      };
    }
    discountPrice = parsedDiscount;
  }
  const variationsJson = Array.isArray(raw.variations) ? raw.variations.filter((v) => Boolean(v && typeof v === "object" && typeof v.name === "string")).map((v) => ({
    name: v.name.trim() || "Regular",
    priceDelta: Math.round(Number(v.priceDelta) || 0)
  })) : [];
  const addonsJson = Array.isArray(raw.addons) ? raw.addons.filter((a) => Boolean(a && typeof a === "object" && typeof a.name === "string")).map((a) => ({
    name: a.name.trim(),
    price: Math.max(0, Math.round(Number(a.price) || 0))
  })).filter((a) => a.name.length > 0) : [];
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
      inStock: raw.inStock === void 0 ? true : Boolean(raw.inStock),
      isAvailable: raw.isAvailable === void 0 ? true : Boolean(raw.isAvailable),
      isPopular: raw.isPopular === void 0 ? false : Boolean(raw.isPopular),
      variationsJson: variationsJson.length > 0 ? variationsJson : [{ name: "Regular", priceDelta: 0 }],
      addonsJson
    }
  };
}
var DEFAULT_PAYMENT_GATEWAYS = [
  {
    code: "bkash",
    name: "bKash",
    nameBn: "\u09AC\u09BF\u0995\u09BE\u09B6",
    providerType: "mfs",
    mode: "sandbox",
    isActive: true,
    apiBaseUrl: "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
    instructions: "Pay securely via bKash tokenized checkout.",
    sortOrder: 1
  },
  {
    code: "nagad",
    name: "Nagad",
    nameBn: "\u09A8\u0997\u09A6",
    providerType: "mfs",
    mode: "sandbox",
    isActive: true,
    apiBaseUrl: "https://api.mynagad.com/api/dfs",
    instructions: "Fast MFS checkout with Nagad merchant wallet.",
    sortOrder: 2
  },
  {
    code: "sslcommerz",
    name: "SSLCommerz / Card",
    nameBn: "\u098F\u09B8\u098F\u09B8\u098F\u09B2\u0995\u09AE\u09BE\u09B0\u09CD\u099C / \u0995\u09BE\u09B0\u09CD\u09A1",
    providerType: "card",
    mode: "sandbox",
    isActive: true,
    apiBaseUrl: "https://sandbox.sslcommerz.com",
    instructions: "Visa, Mastercard, AMEX & Net Banking.",
    sortOrder: 3
  },
  {
    code: "cod",
    name: "Cash on Delivery",
    nameBn: "\u0995\u09CD\u09AF\u09BE\u09B6 \u0985\u09A8 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF",
    providerType: "cod",
    mode: "live",
    isActive: true,
    apiBaseUrl: "",
    instructions: "Pay in cash to the rider at delivery.",
    sortOrder: 4
  }
];
function normalizeGatewayCode(input) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}
function maskSecretValue(secret) {
  const clean = typeof secret === "string" ? secret.trim() : "";
  if (!clean) return "";
  if (clean.length <= 4) return "\u2022\u2022\u2022\u2022";
  return `\u2022\u2022\u2022\u2022${clean.slice(-4)}`;
}
function isGatewayCredentialsConfigured(row, envConfigured = false) {
  if (normalizeGatewayCode(row.code) === "cod") return true;
  const hasDbCreds = Boolean(
    row.apiKey && row.apiKey.trim() || row.apiSecret && row.apiSecret.trim() || row.merchantId && row.merchantId.trim()
  );
  return hasDbCreds || envConfigured;
}
function buildGatewayWebhookUrl(origin, code) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const cleanCode = normalizeGatewayCode(code) || "custom";
  return `${cleanOrigin}/api/payments/webhook/${cleanCode}`;
}
function toPublicPaymentGatewayView(row, envConfigured = false) {
  const providerType = ["mfs", "card", "wallet", "cod", "custom"].includes(row.providerType) ? row.providerType : "custom";
  const mode = row.mode === "live" ? "live" : "sandbox";
  return {
    code: normalizeGatewayCode(row.code),
    name: row.name,
    nameBn: row.nameBn || row.name,
    providerType,
    mode,
    isActive: Boolean(row.isActive),
    instructions: row.instructions || "",
    sortOrder: Number(row.sortOrder ?? 10),
    isConfigured: isGatewayCredentialsConfigured(row, envConfigured)
  };
}
function toAdminPaymentGatewayView(row, origin, envConfigured = false) {
  const pub = toPublicPaymentGatewayView(row, envConfigured);
  const apiKey = typeof row.apiKey === "string" ? row.apiKey.trim() : "";
  const apiSecret = typeof row.apiSecret === "string" ? row.apiSecret.trim() : "";
  const webhookSecret = typeof row.webhookSecret === "string" ? row.webhookSecret.trim() : "";
  return {
    ...pub,
    apiBaseUrl: row.apiBaseUrl || "",
    merchantId: row.merchantId || "",
    hasApiKey: apiKey.length > 0,
    hasApiSecret: apiSecret.length > 0,
    hasWebhookSecret: webhookSecret.length > 0,
    apiKeyPreview: maskSecretValue(apiKey),
    apiSecretPreview: maskSecretValue(apiSecret),
    webhookSecretPreview: maskSecretValue(webhookSecret),
    webhookUrl: buildGatewayWebhookUrl(origin, pub.code)
  };
}
function isOwnerRestaurant(restaurantOwnerUid, actorUid) {
  if (!restaurantOwnerUid || !actorUid) return false;
  return restaurantOwnerUid.trim() === actorUid.trim();
}
function partitionOwnedVsPartnerRestaurants(restaurants2, actorUid) {
  const own = [];
  const partners = [];
  for (const r of restaurants2) {
    if (isOwnerRestaurant(r.ownerUid, actorUid)) {
      own.push(r);
    } else {
      partners.push(r);
    }
  }
  return {
    own,
    partners,
    ordered: [...own, ...partners]
  };
}
function escapeXml(input) {
  return String(input || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildRobotsTxt(origin) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/admin/",
    "Disallow: /api/vendor/",
    "Disallow: /api/auth/",
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    ""
  ].join("\n");
}
function buildSitemapXml(origin, restaurants2, options) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const urls = [
    {
      loc: `${cleanOrigin}/`,
      lastmod: today,
      changefreq: "daily",
      priority: "1.0"
    }
  ];
  const seenSlugs = /* @__PURE__ */ new Set();
  for (const r of restaurants2) {
    const slug = String(r.slug || "").trim();
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
      changefreq: "daily",
      priority: "0.9"
    });
  }
  for (const area of options?.areas || []) {
    const clean = String(area || "").trim();
    if (!clean) continue;
    urls.push({
      loc: `${cleanOrigin}/?area=${encodeURIComponent(clean)}`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.8"
    });
  }
  for (const cuisine of options?.cuisines || []) {
    const clean = String(cuisine || "").trim();
    if (!clean) continue;
    urls.push({
      loc: `${cleanOrigin}/?cuisine=${encodeURIComponent(clean)}`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.7"
    });
  }
  const urlNodes = urls.map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlNodes}
</urlset>
`;
}
var BANGLADESH_COORDS_BOUNDS = {
  minLat: 20.5,
  maxLat: 26.7,
  minLng: 88,
  maxLng: 92.7
};
function isWithinBangladesh(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= BANGLADESH_COORDS_BOUNDS.minLat && lat <= BANGLADESH_COORDS_BOUNDS.maxLat && lng >= BANGLADESH_COORDS_BOUNDS.minLng && lng <= BANGLADESH_COORDS_BOUNDS.maxLng;
}
function resolveNearestAreaFromList(lat, lng, areas) {
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
function buildOrderTrackingUrl(origin, orderId, trackingToken) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const base = `${cleanOrigin}/?order=${encodeURIComponent(String(orderId))}`;
  const tok = String(trackingToken || "").trim();
  return tok ? `${base}&token=${encodeURIComponent(tok)}` : base;
}
function doesEmailMatchOrder(orderEmail, queryEmail) {
  const a = String(orderEmail || "").trim().toLowerCase();
  const b = String(queryEmail || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}
function isGooglePlusCodeSegment(segment) {
  const clean = String(segment || "").trim();
  if (!clean) return false;
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}(?:\s|$)/i.test(clean);
}
function isAdministrativeNoiseSegment(segment) {
  const clean = String(segment || "").trim();
  if (!clean) return true;
  if (isGooglePlusCodeSegment(clean)) return true;
  const lower = clean.toLowerCase();
  if (lower === "bangladesh" || clean === "\u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6" || lower === "unnamed road" || lower === "road" || /^ward[\s-]*(no\.?\s*)?\d+/i.test(clean) || /^ওয়ার্ড[\s-]*(নং\.?\s*)?[\d০-৯]+/.test(clean) || /city corporation/i.test(clean) || /সিটি কর্পোরেশন/.test(clean) || /\bmetropolitan\b/i.test(clean) || /\bdistrict\b/i.test(clean) || /\bdivision\b/i.test(clean) || /(জেলা|বিভাগ|মহানগর)$/.test(clean) || /^\d{4}$/.test(clean)) {
    return true;
  }
  return false;
}
function stripTrailingPostalCode(segment) {
  return String(segment || "").replace(/\bDhaka\s+\d{4}\b/gi, "Dhaka").replace(/[\s,-]+\d{4}$/, "").trim();
}
function cleanMapAddressSegments(rawAddress) {
  const parts = String(rawAddress || "").split(",").map((p) => stripTrailingPostalCode(p)).filter(Boolean).filter((p) => !isAdministrativeNoiseSegment(p));
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }
  return unique;
}
var AREA_ALIAS_RULES = [
  { pattern: /\bgulshan[\s-]*2\b|গুলশান[\s-]*২/i, canonical: "Gulshan 2" },
  { pattern: /\bgulshan[\s-]*1\b|গুলশান[\s-]*১/i, canonical: "Gulshan 1" },
  { pattern: /\bniketan\b|নিকেতন/i, canonical: "Niketan" },
  { pattern: /\bshahjadpur\b|শাহজাদপুর/i, canonical: "Shahjadpur" },
  { pattern: /\bchairman\s*bari\b|চেয়ারম্যান\s*বাড়ি/i, canonical: "Chairman Bari" },
  { pattern: /\bkakoli\b|কাকলী/i, canonical: "Kakoli" },
  { pattern: /\bbanani\b|বনানী/i, canonical: "Banani" },
  { pattern: /\bsatmasjid\b|সাতমসজিদ/i, canonical: "Satmasjid Road" },
  { pattern: /\bjigatola\b|\bzhigatola\b|জিগাতলা/i, canonical: "Jigatola" },
  { pattern: /\bkalabagan\b|কলাবাগান/i, canonical: "Kalabagan" },
  { pattern: /\bdhanmondi\s*(?:27|16)\b|ধানমন্ডি\s*(?:২৭|১৬)/i, canonical: "Dhanmondi 27" },
  { pattern: /\bdhanmondi\b|ধানমন্ডি/i, canonical: "Dhanmondi 1\u201332" },
  { pattern: /\bpallabi\b|পল্লবী/i, canonical: "Pallabi" },
  { pattern: /\bkazipara\b|কাজীপাড়া/i, canonical: "Kazipara" },
  { pattern: /\bmirpur[\s-]*10\b|মিরপুর[\s-]*১০/i, canonical: "Mirpur 10" },
  { pattern: /\bmirpur[\s-]*11\b|মিরপুর[\s-]*১১/i, canonical: "Mirpur 11" },
  { pattern: /\bmirpur[\s-]*12\b|মিরপুর[\s-]*১২/i, canonical: "Mirpur 12" },
  { pattern: /\bmirpur[\s-]*1\b|মিরপুর[\s-]*১/i, canonical: "Mirpur 1" },
  { pattern: /\bmirpur[\s-]*2\b|মিরপুর[\s-]*২/i, canonical: "Mirpur 2" },
  { pattern: /\bmirpur[\s-]*6\b|মিরপুর[\s-]*৬/i, canonical: "Mirpur 6" },
  { pattern: /\brajlaxmi\b|রাজলক্ষ্মী/i, canonical: "Rajlaxmi" },
  { pattern: /\bjashimuddin\b|জসিমউদ্দীন/i, canonical: "Jashimuddin" },
  { pattern: /\babdullahpur\b|আব্দুল্লাহপুর/i, canonical: "Abdullahpur" },
  { pattern: /\buttara\b|উত্তরা/i, canonical: "Uttara Sector 7" },
  { pattern: /\btown\s*hall\b|টাউন\s*হল/i, canonical: "Town Hall" },
  { pattern: /\bbosila\b|\bbashila\b|বসিলা/i, canonical: "Bosila" },
  { pattern: /\badabor\b|আদাবর/i, canonical: "Adabor" },
  { pattern: /\bshyamoli\b|শ্যামলী/i, canonical: "Shyamoli" },
  { pattern: /\bmohammadpur\b|মোহাম্মদপুর/i, canonical: "Mohammadpur" },
  { pattern: /\bjamuna\s*future\s*park\b|যমুনা\s*ফিউচার/i, canonical: "Jamuna Future Park" },
  { pattern: /\bkuril\b|কুড়িল/i, canonical: "Kuril" },
  { pattern: /\bvatara\b|\bbhatara\b|ভাটারা/i, canonical: "Vatara" },
  { pattern: /\bbashundhara\b|বসুন্ধরা/i, canonical: "Bashundhara R/A" },
  { pattern: /\bmerul\s*badda\b|মেরুল\s*বাড্ডা/i, canonical: "Merul Badda" },
  { pattern: /\brampura\b|রামপুরা/i, canonical: "Rampura" },
  { pattern: /\baftabnagar\b|আফতাবনগর/i, canonical: "Aftabnagar" },
  { pattern: /\bbadda\b|বাড্ডা/i, canonical: "Badda" },
  { pattern: /\bpaltan\b|\bpurana\s*paltan\b|\bnaya\s*paltan\b|পল্টন/i, canonical: "Paltan" },
  { pattern: /\bfakirapool\b|ফকিরাপুল/i, canonical: "Fakirapool" },
  { pattern: /\barambagh\b|আরামবাগ/i, canonical: "Arambagh" },
  { pattern: /\bkamalapur\b|কমলাপুর/i, canonical: "Kamalapur" },
  { pattern: /\bmotijheel\b|মতিঝিল/i, canonical: "Motijheel" },
  { pattern: /\bchawkbazar\b|চকবাজার/i, canonical: "Chawkbazar" },
  { pattern: /\bbangshal\b|বংশাল/i, canonical: "Bangshal" },
  { pattern: /\blalbagh\b|লালবাগ/i, canonical: "Lalbagh" },
  { pattern: /\bwari\b|ওয়ারী/i, canonical: "Wari" },
  { pattern: /\bsutrapur\b|সূত্রাপুর/i, canonical: "Sutrapur" },
  { pattern: /\bkarwan\s*bazar\b|কারওয়ান\s*বাজার/i, canonical: "Karwan Bazar" },
  { pattern: /\bkawran\s*bazar\b|কাওরান\s*বাজার/i, canonical: "Kawran Bazar" },
  { pattern: /\bfarmgate\b|ফার্মগেট/i, canonical: "Farmgate" },
  { pattern: /\btejgaon\b|তেজগাঁও/i, canonical: "Tejgaon" },
  { pattern: /\btaltola\b|তালতলা/i, canonical: "Taltola" },
  { pattern: /\bmalibagh\b|মালিবাগ/i, canonical: "Malibagh" },
  { pattern: /\bgoran\b|গোরান/i, canonical: "Goran" },
  { pattern: /\bkhilgaon\b|খিলগাঁও/i, canonical: "Khilgaon" }
];
function matchCanonicalAreaFromHints(hints, lat, lng, presets) {
  const cleanedHints = hints.flatMap((h) => String(h || "").split(",")).map((h) => stripTrailingPostalCode(h)).filter((h) => h && !isAdministrativeNoiseSegment(h) && !/^Pinned\s*\(/i.test(h));
  for (const hint of cleanedHints) {
    const lowerHint = hint.toLowerCase();
    const direct = presets.find(
      (p) => p.name.toLowerCase() === lowerHint || p.nameBn && p.nameBn.toLowerCase() === lowerHint
    );
    if (direct) return direct.name;
  }
  const combined = cleanedHints.join(" , ");
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
      return resolveNearestAreaFromList(lat, lng, gulshanOnly).area?.name || "Gulshan 2";
    }
  }
  if (/\bmirpur\b|মিরপুর/i.test(combined)) {
    const mirpurOnly = presets.filter((p) => /mirpur/i.test(p.name));
    if (mirpurOnly.length > 0) {
      return resolveNearestAreaFromList(lat, lng, mirpurOnly).area?.name || "Mirpur 10";
    }
  }
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
var DEFAULT_ORDER_EMAIL_IMAGE_PATH = "/src/assets/images/food_kacchi_biriyani_1794831373742.jpg";
function resolveOrderEmailImageUrl(imageUrl, origin = "https://foodora.bd") {
  const raw = String(imageUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("data:image/")) return raw;
  const cleanOrigin = String(origin || "https://foodora.bd").replace(/\/+$/, "");
  return `${cleanOrigin}${raw.startsWith("/") ? "" : "/"}${raw}`;
}
function classifyEmailImageSrcForCid(rawSrc) {
  const clean = String(rawSrc || "").replace(/&amp;/g, "&").trim();
  if (!clean || clean.startsWith("cid:")) return null;
  const dataMatch = clean.match(
    /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (dataMatch) {
    const mime = dataMatch[1].toLowerCase() === "image/jpg" ? "image/jpeg" : dataMatch[1].toLowerCase();
    const b64 = dataMatch[2].replace(/\s+/g, "");
    if (!b64) return null;
    return {
      kind: "data",
      key: `data:${mime}:${b64.slice(0, 48)}:${b64.length}`,
      dataMimeType: mime,
      dataBase64: b64
    };
  }
  let pathname = "";
  if (clean.startsWith("/")) {
    pathname = clean.split("?")[0].split("#")[0];
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
  }
  if (!/^\/(?:src\/assets\/|assets\/|uploads\/|foodora-icon\.)/i.test(pathname)) {
    return null;
  }
  return {
    kind: "local",
    key: `local:${pathname}`,
    localPath: pathname
  };
}
function extractEmailInlineCidPlan(html) {
  if (!html) return { html, images: [] };
  const byKey = /* @__PURE__ */ new Map();
  let seq = 0;
  const rewrittenHtml = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (fullMatch, prefix, quote, attrVal) => {
      const classified = classifyEmailImageSrcForCid(attrVal);
      if (!classified) return fullMatch;
      let entry = byKey.get(classified.key);
      if (!entry) {
        seq += 1;
        const cid = `foodora-img-${seq}`;
        entry = classified.kind === "local" ? {
          cid,
          kind: "local",
          localPath: classified.localPath,
          originalSrcs: [attrVal]
        } : {
          cid,
          kind: "data",
          dataMimeType: classified.dataMimeType,
          dataBase64: classified.dataBase64,
          originalSrcs: [attrVal]
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
    images: Array.from(byKey.values())
  };
}
function buildOrderTrackingEmailPayload(input) {
  const trackingUrl = buildOrderTrackingUrl(input.origin, input.orderId, input.trackingToken);
  const niceStatus = input.status.replace(/_/g, " ").toUpperCase();
  const invoiceNumber = `INV-${input.orderNumber}`;
  const statusDisplayMap = {
    confirmed: {
      en: "Order Confirmed & Invoice Ready",
      bn: "\u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09A8\u09AB\u09BE\u09B0\u09CD\u09AE \u0993 \u0987\u09A8\u09AD\u09DF\u09C7\u09B8 \u09A4\u09C8\u09B0\u09BF \u09B9\u09DF\u09C7\u099B\u09C7",
      subEn: "We have sent your order to the kitchen and will notify you when cooking begins.",
      subBn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u099F\u09BF \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7 \u09AA\u09BE\u09A0\u09BE\u09A8\u09CB \u09B9\u09DF\u09C7\u099B\u09C7, \u09B0\u09BE\u09A8\u09CD\u09A8\u09BE \u09B6\u09C1\u09B0\u09C1 \u09B9\u09B2\u09C7\u0987 \u0986\u09AA\u09A1\u09C7\u099F \u09AA\u09BE\u09AC\u09C7\u09A8\u0964",
      accent: "#E21B70",
      step: 1
    },
    payment_verified: {
      en: "Payment Confirmed & Receipt Updated",
      bn: "\u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u0993 \u09B0\u09B8\u09BF\u09A6 \u0986\u09AA\u09A1\u09C7\u099F \u09B9\u09DF\u09C7\u099B\u09C7",
      subEn: "Your digital payment is verified and your order is moving ahead.",
      subBn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09AF\u09BE\u099A\u09BE\u0987 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09B9\u09DF\u09C7\u099B\u09C7 \u098F\u09AC\u0982 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09AA\u09CD\u09B0\u09B8\u09CD\u09A4\u09C1\u09A4 \u09B9\u099A\u09CD\u099B\u09C7\u0964",
      accent: "#059669",
      step: 1
    },
    accepted: {
      en: "Accepted by Kitchen",
      bn: "\u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0997\u09CD\u09B0\u09B9\u09A3 \u0995\u09B0\u09C7\u099B\u09C7",
      subEn: "The restaurant chef accepted your order and is queueing preparation.",
      subBn: "\u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u099F\u09BF \u0997\u09CD\u09B0\u09B9\u09A3 \u0995\u09B0\u09C7\u099B\u09C7 \u0993 \u09AA\u09CD\u09B0\u09B8\u09CD\u09A4\u09C1\u09A4\u09BF \u09B6\u09C1\u09B0\u09C1 \u0995\u09B0\u099B\u09C7\u0964",
      accent: "#E21B70",
      step: 2
    },
    preparing: {
      en: "Preparing Fresh Food",
      bn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0 \u09A4\u09C8\u09B0\u09BF \u09B9\u099A\u09CD\u099B\u09C7",
      subEn: "Your meal is being freshly cooked and packed carefully at the kitchen.",
      subBn: "\u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7\u09B0 \u0995\u09BF\u099A\u09C7\u09A8\u09C7 \u0986\u09AA\u09A8\u09BE\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0 \u0997\u09B0\u09AE \u0993 \u09AB\u09CD\u09B0\u09C7\u09B6\u09AD\u09BE\u09AC\u09C7 \u09A4\u09C8\u09B0\u09BF \u0993 \u09AA\u09CD\u09AF\u09BE\u0995 \u0995\u09B0\u09BE \u09B9\u099A\u09CD\u099B\u09C7\u0964",
      accent: "#D97706",
      step: 2
    },
    ready: {
      en: "Ready for Pickup",
      bn: "\u09AA\u09BF\u0995\u0986\u09AA\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09AA\u09CD\u09B0\u09B8\u09CD\u09A4\u09C1\u09A4",
      subEn: "Your food is packed and sealed, waiting for our rider to pick it up.",
      subBn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0 \u09AA\u09CD\u09AF\u09BE\u0995\u09BF\u0982 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u2014 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09AA\u09BF\u0995\u0986\u09AA\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09AE\u09BE\u09A3\u0964",
      accent: "#2563EB",
      step: 3
    },
    rider_assigned: {
      en: "Rider Assigned to Your Order",
      bn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u09B9\u09DF\u09C7\u099B\u09C7",
      subEn: "Your delivery partner is heading to the restaurant to collect your order.",
      subBn: "\u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u0986\u09AA\u09A8\u09BE\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0 \u0986\u09A8\u09A4\u09C7 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7\u09B0 \u0989\u09A6\u09CD\u09A6\u09C7\u09B6\u09CD\u09AF\u09C7 \u09B0\u0993\u09A8\u09BE \u09A6\u09BF\u09DF\u09C7\u099B\u09C7\u09A8\u0964",
      accent: "#2563EB",
      step: 3
    },
    picked_up: {
      en: "Order Picked Up by Rider",
      bn: "\u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0 \u09B8\u0982\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7\u099B\u09C7\u09A8",
      subEn: "Your rider has collected the sealed bag and is starting your delivery.",
      subBn: "\u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u09A5\u09C7\u0995\u09C7 \u0996\u09BE\u09AC\u09BE\u09B0 \u09B8\u0982\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7\u099B\u09C7\u09A8 \u098F\u09AC\u0982 \u0986\u09AA\u09A8\u09BE\u09B0 \u09A6\u09BF\u0995\u09C7 \u0986\u09B8\u099B\u09C7\u09A8\u0964",
      accent: "#059669",
      step: 4
    },
    on_the_way: {
      en: "Rider Is On The Way",
      bn: "\u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u0986\u09AA\u09A8\u09BE\u09B0 \u09A0\u09BF\u0995\u09BE\u09A8\u09BE\u09DF \u0986\u09B8\u099B\u09C7\u09A8",
      subEn: "Get ready! Follow live rider GPS on the map link below.",
      subBn: "\u09AA\u09CD\u09B0\u09B8\u09CD\u09A4\u09C1\u09A4 \u09A5\u09BE\u0995\u09C1\u09A8! \u09A8\u09BF\u099A\u09C7\u09B0 \u09B2\u09BF\u0982\u0995\u09C7 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0\u09C7\u09B0 \u09B2\u09BE\u0987\u09AD \u0985\u09AC\u09B8\u09CD\u09A5\u09BE\u09A8 \u09AE\u09CD\u09AF\u09BE\u09AA\u09C7 \u09A6\u09C7\u0996\u09A4\u09C7 \u09AA\u09BE\u09B0\u09AC\u09C7\u09A8\u0964",
      accent: "#059669",
      step: 4
    },
    delivered: {
      en: "Order Delivered \u2014 Enjoy Your Meal!",
      bn: "\u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09B9\u09DF\u09C7\u099B\u09C7 \u2014 \u0996\u09BE\u09AC\u09BE\u09B0 \u0989\u09AA\u09AD\u09CB\u0997 \u0995\u09B0\u09C1\u09A8!",
      subEn: "Thank you for ordering with Foodora BD. Keep this invoice for your records.",
      subBn: "\u09AB\u09C1\u09A1\u09CB\u09B0\u09BE \u09AC\u09BF\u09A1\u09BF-\u09A4\u09C7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09BE\u09B0 \u099C\u09A8\u09CD\u09AF \u09A7\u09A8\u09CD\u09AF\u09AC\u09BE\u09A6! \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09CD\u09AF\u09BE\u09AA\u09C7 \u09B0\u09BF\u09AD\u09BF\u0989 \u09A6\u09BF\u09A8\u0964",
      accent: "#059669",
      step: 5
    },
    cancelled: {
      en: "Order Cancelled",
      bn: "\u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09AC\u09BE\u09A4\u09BF\u09B2 \u09B9\u09DF\u09C7\u099B\u09C7",
      subEn: "This order was cancelled. Any eligible prepaid amount will be refunded automatically.",
      subBn: "\u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u099F\u09BF \u09AC\u09BE\u09A4\u09BF\u09B2 \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7\u0964 \u0985\u0997\u09CD\u09B0\u09BF\u09AE \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09A5\u09BE\u0995\u09B2\u09C7 \u09B0\u09BF\u09AB\u09BE\u09A8\u09CD\u09A1 \u09AA\u09CD\u09B0\u09B8\u09C7\u09B8 \u0995\u09B0\u09BE \u09B9\u09AC\u09C7\u0964",
      accent: "#DC2626",
      step: 0
    }
  };
  const info = statusDisplayMap[input.status] || {
    en: `Order Status: ${niceStatus}`,
    bn: `\u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0986\u09AA\u09A1\u09C7\u099F: ${niceStatus}`,
    subEn: "Here is the latest update on your Foodora BD order.",
    subBn: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7\u09B0 \u09B8\u09B0\u09CD\u09AC\u09B6\u09C7\u09B7 \u0985\u09AC\u09B8\u09CD\u09A5\u09BE \u09A8\u09BF\u099A\u09C7 \u09A6\u09C7\u0993\u09DF\u09BE \u09B9\u09B2\u09CB\u0964",
    accent: "#E21B70",
    step: 1
  };
  const subject = `Foodora BD \xB7 ${info.en} (${input.orderNumber} / ${invoiceNumber})`;
  const riderLine = input.riderName ? `<p style="margin:4px 0;"><strong>Assigned Rider:</strong> ${escapeXml(input.riderName)}${input.riderPhone ? ` (${escapeXml(input.riderPhone)})` : ""}</p>` : "";
  const etaLine = typeof input.etaMinutes === "number" && input.etaMinutes > 0 && input.status !== "delivered" && input.status !== "cancelled" ? `<p style="margin:4px 0;"><strong>Estimated Arrival:</strong> ~${formatDurationEstimate(input.etaMinutes, "en")}</p>` : "";
  const addressLine = input.deliveryAddress ? `<p style="margin:4px 0;"><strong>Delivery Address:</strong> ${escapeXml(input.deliveryAddress)}</p>` : "";
  const noteLine = input.statusNote ? `<p style="margin:4px 0;"><strong>Update:</strong> ${escapeXml(input.statusNote)}</p>` : "";
  const paymentBadge = input.paymentStatus ? ` \xB7 ${escapeXml(input.paymentStatus.toUpperCase())}` : "";
  const issuedAt = input.createdAt ? new Date(input.createdAt).toLocaleString("en-BD") : (/* @__PURE__ */ new Date()).toLocaleString("en-BD");
  const itemsList = Array.isArray(input.items) ? input.items : [];
  const computedSubtotal = typeof input.subtotal === "number" && Number.isFinite(input.subtotal) ? input.subtotal : itemsList.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0);
  const discountVal = Math.max(0, Number(input.discountAmount || 0));
  const deliveryFeeVal = Math.max(0, Number(input.deliveryFee ?? 0));
  const serviceFeeVal = Math.max(0, Number(input.serviceFee ?? 0));
  const taxVal = Math.max(0, Number(input.taxAmount ?? 0));
  const isSplitOrder = input.paymentSplitMode === "online_food_cash_delivery" || typeof input.onlineFoodPaidAmount === "number" && typeof input.cashDueToRider === "number";
  const onlineFoodPart = typeof input.onlineFoodPaidAmount === "number" ? Math.max(0, Math.round(input.onlineFoodPaidAmount)) : Math.max(0, Math.round(input.totalAmount - deliveryFeeVal));
  const cashRiderPart = typeof input.cashDueToRider === "number" ? Math.max(0, Math.round(input.cashDueToRider)) : deliveryFeeVal;
  const itemsBlock = itemsList.length > 0 ? `<div style="border-top:1px solid #F3F4F6;padding-top:10px;margin-top:10px;">
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
               ${itemsList.slice(0, 20).map((it) => {
    const varPart = it.variation ? ` (${escapeXml(it.variation)})` : "";
    const unitPart = typeof it.unitPrice === "number" && it.unitPrice > 0 ? `<div style="color:#6B7280;font-size:11px;margin-top:2px;">@ \u09F3${it.unitPrice}</div>` : "";
    const resolvedImg = resolveOrderEmailImageUrl(
      it.imageUrl || DEFAULT_ORDER_EMAIL_IMAGE_PATH,
      input.origin
    );
    const thumbHtml = resolvedImg ? `<img src="${escapeXml(resolvedImg)}" alt="${escapeXml(it.name)}" width="44" height="44" style="width:44px;height:44px;object-fit:cover;border-radius:8px;display:block;border:1px solid #FBCFE8;background:#ffffff;" />` : `<div style="width:44px;height:44px;border-radius:8px;border:1px solid #FBCFE8;background:#ffffff;text-align:center;line-height:44px;font-size:18px;">\u{1F37D}\uFE0F</div>`;
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
                     <td style="padding:7px 0;text-align:right;font-weight:bold;vertical-align:middle;">\u09F3${it.lineTotal}</td>
                   </tr>`;
  }).join("")}
             </tbody>
           </table>
           <div style="border-top:1px solid #FBCFE8;margin-top:8px;padding-top:8px;font-size:12px;color:#374151;">
             <p style="margin:2px 0;"><span>Subtotal:</span> <strong style="float:right;">\u09F3${computedSubtotal}</strong></p>
             ${discountVal > 0 ? `<p style="margin:2px 0;color:#059669;"><span>Discount${input.couponCode ? ` (${escapeXml(input.couponCode)})` : ""}:</span> <strong style="float:right;">-\u09F3${discountVal}</strong></p>` : ""}
             ${typeof input.deliveryFee === "number" ? `<p style="margin:2px 0;"><span>Delivery Fee${isSplitOrder ? " (Cash to Rider)" : ""}:</span> <strong style="float:right;">\u09F3${deliveryFeeVal}</strong></p>` : ""}
             ${typeof input.serviceFee === "number" ? `<p style="margin:2px 0;"><span>Service Fee:</span> <strong style="float:right;">\u09F3${serviceFeeVal}</strong></p>` : ""}
             ${taxVal > 0 ? `<p style="margin:2px 0;"><span>VAT / Tax:</span> <strong style="float:right;">\u09F3${taxVal}</strong></p>` : ""}
             ${isSplitOrder ? `<p style="margin:4px 0;color:#059669;"><span>Online Food Payment (${escapeXml(input.paymentMethod.toUpperCase())}):</span> <strong style="float:right;">\u09F3${onlineFoodPart}</strong></p>
                    <p style="margin:4px 0;color:#B45309;"><span>Pay Cash to Rider (Delivery Charge):</span> <strong style="float:right;">\u09F3${cashRiderPart}</strong></p>` : ""}
             <p style="margin:6px 0 0;padding-top:6px;border-top:1px dashed #FBCFE8;font-size:13px;color:#E21B70;"><span><strong>${isSplitOrder ? "Customer Total Cost:" : "Total Payable:"}</strong></span> <strong style="float:right;">\u09F3${input.totalAmount}</strong></p>
           </div>
         </div>` : "";
  const steps = [
    { idx: 1, label: "Confirmed" },
    { idx: 2, label: "Preparing" },
    { idx: 3, label: "Rider Assigned" },
    { idx: 4, label: "On the Way" },
    { idx: 5, label: "Delivered" }
  ];
  const progressHtml = info.step > 0 ? `<div style="display:flex;gap:6px;margin:14px 0 16px;">
           ${steps.map((s) => {
    const active = info.step >= s.idx;
    return `<div style="flex:1;text-align:center;">
                 <div style="height:6px;border-radius:999px;background:${active ? "#E21B70" : "#E5E7EB"};margin-bottom:4px;"></div>
                 <span style="font-size:10px;font-weight:${active ? "bold" : "normal"};color:${active ? "#E21B70" : "#9CA3AF"};">${s.label}</span>
               </div>`;
  }).join("")}
         </div>` : "";
  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;color:#2E3138;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${info.accent};padding:14px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;opacity:0.92;">Foodora BD \xB7 Order Invoice &amp; Live Tracking</p>
        <h2 style="margin:4px 0 2px;font-size:20px;color:#ffffff;">${escapeXml(info.en)}</h2>
        <p style="margin:0;font-size:13px;font-weight:bold;opacity:0.95;">${escapeXml(info.bn)}</p>
      </div>
      <div style="padding:22px 24px;">
        <p style="margin:0 0 10px;font-size:12px;color:#6B7280;">Invoice: <strong>${escapeXml(invoiceNumber)}</strong> \xB7 Issued: ${escapeXml(issuedAt)}</p>
        <p style="margin:0 0 8px;font-size:14px;">Hi ${escapeXml(input.customerName)},</p>
        <p style="margin:0 0 6px;font-size:14px;">Your order <strong>${escapeXml(input.orderNumber)}</strong> from <strong>${escapeXml(input.restaurantName)}</strong> is now <strong>${escapeXml(niceStatus)}</strong>.</p>
        <p style="margin:0 0 4px;font-size:12px;color:#4B5563;">${escapeXml(info.subEn)}</p>
        <p style="margin:0 0 12px;font-size:12px;color:#6B7280;">${escapeXml(info.subBn)}</p>
        ${progressHtml}
        <div style="background:#FFF0F6;border:1px solid #FBCFE8;border-radius:12px;padding:14px;font-size:13px;margin-bottom:16px;">
          <p style="margin:4px 0;"><strong>Delivery Area:</strong> ${escapeXml(input.deliveryArea)}</p>
          ${addressLine}
          <p style="margin:4px 0;"><strong>Payment:</strong> ${escapeXml(input.paymentMethod.toUpperCase())}${paymentBadge} \xB7 <strong>Total: \u09F3${input.totalAmount}</strong></p>
          ${isSplitOrder ? `<p style="margin:4px 0;color:#059669;"><strong>Online Food Payment:</strong> \u09F3${onlineFoodPart} \xB7 <strong style="color:#B45309;">Cash to Rider (Delivery):</strong> \u09F3${cashRiderPart}</p>` : ""}
          ${etaLine}
          ${riderLine}
          ${noteLine}
          ${itemsBlock}
        </div>
        <a href="${escapeXml(trackingUrl)}" style="display:inline-block;background:#E21B70;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;font-size:14px;">Track Order &amp; Rider Live \xB7 \u09B2\u09BE\u0987\u09AD \u099F\u09CD\u09B0\u09CD\u09AF\u09BE\u0995 \u0995\u09B0\u09C1\u09A8</a>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Direct tracking link: ${escapeXml(trackingUrl)}</p>
        <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #F3F4F6;font-size:11px;color:#9CA3AF;">Foodora BD Customer Order Updates \xB7 Automatic notification email for every order stage.</p>
      </div>
    </div>
  </body>
</html>`;
  const itemsText = itemsList.length > 0 ? `
Items:
${itemsList.slice(0, 20).map((it) => `- ${it.quantity}x ${it.name}${it.variation ? ` (${it.variation})` : ""}: BDT ${it.lineTotal}`).join("\n")}
Subtotal: BDT ${computedSubtotal}${discountVal > 0 ? `
Discount: -BDT ${discountVal}` : ""}${typeof input.deliveryFee === "number" ? `
Delivery Fee: BDT ${deliveryFeeVal}` : ""}${typeof input.serviceFee === "number" ? `
Service Fee: BDT ${serviceFeeVal}` : ""}` : "";
  const splitSummaryText = isSplitOrder ? `
Online Food Payment: BDT ${onlineFoodPart}
Cash to Rider (Delivery Charge): BDT ${cashRiderPart}` : "";
  const text2 = `Foodora BD \u2014 Invoice ${invoiceNumber} | Order ${input.orderNumber} (${info.en} / ${info.bn})
${info.subEn}
${info.subBn}
Restaurant: ${input.restaurantName}
Delivery Area: ${input.deliveryArea}${input.deliveryAddress ? `
Address: ${input.deliveryAddress}` : ""}${itemsText}${splitSummaryText}
Total: BDT ${input.totalAmount} (${input.paymentMethod.toUpperCase()}${input.paymentStatus ? ` \xB7 ${input.paymentStatus}` : ""})
${input.etaMinutes ? `Estimated Arrival: ~${formatDurationEstimate(input.etaMinutes, "en")}
` : ""}${input.riderName ? `Rider: ${input.riderName}${input.riderPhone ? ` (${input.riderPhone})` : ""}
` : ""}${input.statusNote ? `Update: ${input.statusNote}
` : ""}Track live on map: ${trackingUrl}`;
  return { subject, trackingUrl, html, text: text2 };
}
function getOrderEmailTemplatePreview(status, origin = "https://foodora.bd", recipientEmail = "customer@gmail.com") {
  return buildOrderTrackingEmailPayload({
    origin,
    orderId: 99999,
    orderNumber: "FD-BD-84210",
    trackingToken: "demo-preview-token",
    customerName: "Tanjim Rahman",
    customerEmail: recipientEmail,
    restaurantName: "Sultan's Dine \u2014 Gulshan",
    deliveryArea: "Banani",
    deliveryAddress: "House 14, Road 11, Banani, Dhaka 1213",
    subtotal: 650,
    discountAmount: 50,
    couponCode: "FOODORA50",
    deliveryFee: 45,
    serviceFee: 10,
    taxAmount: 0,
    totalAmount: 655,
    paymentMethod: "bkash",
    paymentStatus: status === "cancelled" ? "refunded" : "paid",
    status,
    statusNote: status === "delivered" ? "Handed to customer at reception desk." : status === "cancelled" ? "Cancelled per customer support request." : "Live order update notification from Foodora BD.",
    riderName: status === "rider_assigned" || status === "on_the_way" || status === "delivered" ? "Ariful Islam" : null,
    riderPhone: status === "rider_assigned" || status === "on_the_way" || status === "delivered" ? "01711-000222" : null,
    etaMinutes: status === "on_the_way" ? 12 : 25,
    items: [
      {
        name: "Mutton Kacchi (Half)",
        imageUrl: "/src/assets/images/food_kacchi_biriyani_1794831373742.jpg",
        quantity: 1,
        unitPrice: 450,
        lineTotal: 450
      },
      {
        name: "Jali Kabab & Borhani",
        imageUrl: "/src/assets/images/food_tandoori_kabab_1794831377175.jpg",
        quantity: 1,
        unitPrice: 200,
        lineTotal: 200
      }
    ]
  });
}
function pickNearestStandbyRider(candidates, targetLat, targetLng) {
  if (!candidates || candidates.length === 0) return null;
  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return null;
  const online = candidates.filter((c) => c.isAvailable && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const pool2 = online.length > 0 ? online : candidates.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (pool2.length === 0) return null;
  let best = pool2[0];
  let bestDist = haversineDistanceKm(best.lat, best.lng, targetLat, targetLng);
  for (let i = 1; i < pool2.length; i += 1) {
    const d = haversineDistanceKm(pool2[i].lat, pool2[i].lng, targetLat, targetLng);
    if (d < bestDist) {
      best = pool2[i];
      bestDist = d;
    }
  }
  return { rider: best, distanceKm: bestDist };
}
function buildRestaurantUnavailableMessage(restaurantName, status, isOpen, lang = "en") {
  const safeName = restaurantName.trim() || (lang === "bn" ? "\u098F\u0987 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u099F\u09BF" : "This restaurant");
  if (status !== "approved") {
    if (lang === "bn") {
      return `${safeName} \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 \u0985\u09CD\u09AF\u09BE\u09A1\u09AE\u09BF\u09A8 \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09A8\u09C7\u09B0 (${status}) \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09BE\u09DF \u0986\u099B\u09C7, \u09A4\u09BE\u0987 \u098F\u0996\u09A8 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A8\u09C7\u0993\u09DF\u09BE \u09B9\u099A\u09CD\u099B\u09C7 \u09A8\u09BE\u0964`;
    }
    return `${safeName} is currently "${status}" and awaiting Admin approval before accepting orders.`;
  }
  if (!isOpen) {
    if (lang === "bn") {
      return `${safeName} \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 \u09AC\u09A8\u09CD\u09A7 (Closed) \u09B0\u09BE\u0996\u09BE \u09B9\u09DF\u09C7\u099B\u09C7\u0964 \u09AA\u09BE\u09B0\u09CD\u099F\u09A8\u09BE\u09B0/\u0985\u09CD\u09AF\u09BE\u09A1\u09AE\u09BF\u09A8 \u09A1\u09CD\u09AF\u09BE\u09B6\u09AC\u09CB\u09B0\u09CD\u09A1 \u09A5\u09C7\u0995\u09C7 Store Open \u099A\u09BE\u09B2\u09C1 \u0995\u09B0\u09C1\u09A8 \u0985\u09A5\u09AC\u09BE \u0985\u09A8\u09CD\u09AF \u0996\u09CB\u09B2\u09BE \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u09A5\u09C7\u0995\u09C7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8\u0964`;
    }
    return `${safeName} is currently closed for orders (Store Open is turned OFF in Partner/Admin Dashboard). Please open another active restaurant or re-open the store.`;
  }
  return lang === "bn" ? "\u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u099F\u09BF \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A8\u09BF\u09A4\u09C7 \u09AA\u09CD\u09B0\u09B8\u09CD\u09A4\u09C1\u09A4\u0964" : "Restaurant is open for orders.";
}
function buildAiHelpSystemInstruction(params) {
  const pref = params.langPreference || "auto";
  const uiIsBn = params.uiLang === "bn";
  const langRule = pref === "bn" ? "Always respond strictly in clear, natural, everyday Bengali (\u09AC\u09BE\u0982\u09B2\u09BE script). Even if the question contains English words or Banglish, write your entire explanation in natural Bangla (keep brand names/codes like Foodora BD, FOODORA50, bKash, Nagad as needed)." : pref === "en" ? "Always respond strictly in clear, helpful English." : uiIsBn ? "The interface language is currently Bangla (\u09AC\u09BE\u0982\u09B2\u09BE). Respond in clear, natural Bengali (\u09AC\u09BE\u0982\u09B2\u09BE script) by default\u2014including for Banglish or short mixed queries\u2014unless the user explicitly asks in English for an English reply." : 'Detect the user language automatically: if they write in Bangla (\u09AC\u09BE\u0982\u09B2\u09BE script) or Banglish/Romanized Bengali (e.g. "rider kothay", "amar order", "keno"), respond in clear, natural Bangla (\u09AC\u09BE\u0982\u09B2\u09BE script). If they write in English, respond in English.';
  const contextNotes = [
    params.area ? `User selected area: ${params.area}, Bangladesh.` : "",
    params.viewType ? `Current screen: ${params.viewType}.` : "",
    params.activeOrderNumber ? `Active order number: ${params.activeOrderNumber}.` : ""
  ].filter(Boolean).join(" ");
  return [
    "You are the official Foodora BD AI Help Assistant for Bangladesh\u2019s multi-vendor food delivery marketplace.",
    langRule,
    "Keep answers concise, practical, and easy to scan (2-5 short sentences or bullet steps). Never invent order IDs, prices, or live GPS coordinates.",
    "Platform knowledge:",
    '- Ordering: Customers can order directly from the homepage "Order Popular Food Now" dishes or open any restaurant menu, then pay via bKash, Nagad, SSLCommerz, or Cash on Delivery (COD).',
    '- Why "This restaurant is currently unavailable for orders" appears: It means either the restaurant has "Store Open" switched OFF (isOpen = false) in Vendor/Admin Dashboard, or its status is not "approved" yet (e.g. pending/suspended). Re-enabling "Store Open" in Partner/Admin Dashboard or picking an Open restaurant resolves it immediately.',
    "- Nationwide Map & Location: Users can search any city/thana across all 64 districts of Bangladesh, enter a custom area, click anywhere on the interactive map or drag the pin to set that exact location, or press Back / click outside the map modal to return.",
    '- Live Rider Tracking & ETA: Users can click "Track Rider" in the header or look up orders via Checkout Email + Order Number to see live rider GPS coordinates, nearest standby rider, and estimated arrival time (ETA).',
    "- Partner & Rider Portals: Restaurant owners can register, manage Orders & Dispatch (including assigning riders), toggle product stock/availability, post Rider Jobs & hire riders, message Platform Admin directly, and integrate Partner APIs; Riders anywhere in Bangladesh can apply to join or apply to restaurant rider jobs and share live GPS locations.",
    contextNotes
  ].filter(Boolean).join("\n");
}
function collectMerchantOrderAlertRecipients(input) {
  const seen = /* @__PURE__ */ new Set();
  const candidates = [
    input.restaurantEmail,
    input.ownerEmail,
    input.adminNotifyEmail,
    ...input.fallbackAdminEmails || [PRIMARY_SUPER_ADMIN_EMAIL]
  ];
  const out = [];
  for (const raw of candidates) {
    const clean = String(raw || "").trim().toLowerCase();
    if (!clean || !clean.includes("@") || !clean.includes(".")) continue;
    if (clean.endsWith("@foodora.bd")) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
function buildMerchantOrderAlertEmailPayload(input) {
  const trackingUrl = buildOrderTrackingUrl(input.origin, input.orderId, input.trackingToken);
  const niceStatus = input.status.replace(/_/g, " ").toUpperCase();
  const isNew = input.eventKind === "new_order";
  const headlineEn = isNew ? `New Order Received: ${input.orderNumber}` : `Order Update (${input.orderNumber}): ${niceStatus}`;
  const headlineBn = isNew ? `\u09A8\u09A4\u09C1\u09A8 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u098F\u09B8\u09C7\u099B\u09C7: ${input.orderNumber}` : `\u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u099F\u09BE\u09B8 \u0986\u09AA\u09A1\u09C7\u099F: ${niceStatus}`;
  const subject = isNew ? `\u{1F514} Foodora BD New Order Alert ${input.orderNumber} (\u09F3${input.totalAmount}) \u2014 ${input.restaurantName}` : `\u{1F4E6} Foodora BD Order Update ${input.orderNumber} \u2014 ${niceStatus}`;
  const itemsList = Array.isArray(input.items) ? input.items : [];
  const itemsHtml = itemsList.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin:10px 0 0;font-size:12px;color:#374151;">
          ${itemsList.slice(0, 20).map((it) => {
    const resolvedImg = resolveOrderEmailImageUrl(
      it.imageUrl || DEFAULT_ORDER_EMAIL_IMAGE_PATH,
      input.origin
    );
    const thumbHtml = resolvedImg ? `<img src="${escapeXml(resolvedImg)}" alt="${escapeXml(it.name)}" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:8px;display:block;border:1px solid #FBCFE8;background:#ffffff;" />` : "";
    return `<tr style="border-top:1px solid #FBCFE8;">
                <td style="width:48px;padding:6px 8px 6px 0;vertical-align:middle;">${thumbHtml}</td>
                <td style="padding:6px 6px 6px 0;vertical-align:middle;"><strong>${it.quantity}x</strong> ${escapeXml(it.name)}${it.variation ? ` (${escapeXml(it.variation)})` : ""}</td>
                <td style="padding:6px 0;text-align:right;font-weight:bold;vertical-align:middle;">\u09F3${it.lineTotal}</td>
              </tr>`;
  }).join("")}
        </table>` : "";
  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;color:#2E3138;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#E21B70;">Foodora BD \xB7 Store &amp; Admin Live Order Alert</p>
      <h2 style="margin:0 0 4px;color:#2E3138;font-size:20px;">${escapeXml(headlineEn)}</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#E21B70;font-weight:bold;">${escapeXml(headlineBn)}</p>
      <div style="background:#FFF0F6;border:1px solid #FBCFE8;border-radius:12px;padding:14px;font-size:13px;margin-bottom:16px;">
        <p style="margin:4px 0;"><strong>Restaurant:</strong> ${escapeXml(input.restaurantName)}</p>
        <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeXml(input.customerName)}${input.customerPhone ? ` (${escapeXml(input.customerPhone)})` : ""}</p>
        <p style="margin:4px 0;"><strong>Delivery Area:</strong> ${escapeXml(input.deliveryArea)}</p>
        ${input.deliveryAddress ? `<p style="margin:4px 0;"><strong>Address:</strong> ${escapeXml(input.deliveryAddress)}</p>` : ""}
        <p style="margin:4px 0;"><strong>Status:</strong> ${escapeXml(niceStatus)} \xB7 <strong>Total: \u09F3${input.totalAmount}</strong> (${escapeXml(
    input.paymentMethod.toUpperCase()
  )}${input.paymentStatus ? ` \xB7 ${escapeXml(input.paymentStatus.toUpperCase())}` : ""})</p>
        ${input.riderName ? `<p style="margin:4px 0;"><strong>Rider:</strong> ${escapeXml(input.riderName)}</p>` : ""}
        ${input.statusNote ? `<p style="margin:4px 0;"><strong>Note:</strong> ${escapeXml(input.statusNote)}</p>` : ""}
        ${itemsHtml}
      </div>
      <a href="${escapeXml(trackingUrl)}" style="display:inline-block;background:#E21B70;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;font-size:14px;">Open Live Order View \xB7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A6\u09C7\u0996\u09C1\u09A8</a>
      <p style="margin:12px 0 0;font-size:11px;color:#9CA3AF;">Notification dispatched to Admin (${escapeXml(PRIMARY_SUPER_ADMIN_EMAIL)}) &amp; Store Kitchen.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Direct link: ${escapeXml(trackingUrl)}</p>
    </div>
  </body>
</html>`;
  const itemsText = itemsList.length > 0 ? `
Items:
${itemsList.slice(0, 20).map((it) => `- ${it.quantity}x ${it.name}: BDT ${it.lineTotal}`).join("\n")}` : "";
  const text2 = `${headlineEn} (${headlineBn})
Restaurant: ${input.restaurantName}
Customer: ${input.customerName}${input.customerPhone ? ` (${input.customerPhone})` : ""}
Area: ${input.deliveryArea}${input.deliveryAddress ? `
Address: ${input.deliveryAddress}` : ""}
Status: ${niceStatus} | Total: BDT ${input.totalAmount} (${input.paymentMethod.toUpperCase()})${input.riderName ? `
Rider: ${input.riderName}` : ""}${input.statusNote ? `
Note: ${input.statusNote}` : ""}${itemsText}
View live order: ${trackingUrl}`;
  return { subject, trackingUrl, html, text: text2 };
}
var JOINED_PLACE_WORDS = [
  [/citycent(?:er|re)/gi, "city center"],
  [/futurepark/gi, "future park"],
  [/shoppingmall/gi, "shopping mall"],
  [/shoppingcent(?:er|re)/gi, "shopping center"],
  [/medicalcollege/gi, "medical college"],
  [/railwaystation/gi, "railway station"],
  [/policeplaza/gi, "police plaza"],
  [/pinkcity/gi, "pink city"],
  [/oceancity/gi, "ocean city"],
  [/housingestate/gi, "housing estate"],
  [/busstand/gi, "bus stand"],
  [/supermarket/gi, "super market"],
  [/([a-z]{3,})(\d+)/gi, "$1 $2"]
];
function normalizeFuzzyAddressText(raw) {
  let out = raw.toLowerCase().trim();
  for (const [pattern, replacement] of JOINED_PLACE_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/aa+/g, "a").replace(/ee+/g, "i").replace(/oo+/g, "u").replace(/[,.;:/()_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function expandAddressSearchQueries(rawQuery) {
  const clean = rawQuery.trim();
  if (!clean) return [];
  let spaced = clean;
  for (const [pattern, replacement] of JOINED_PLACE_WORDS) {
    spaced = spaced.replace(pattern, replacement);
  }
  spaced = spaced.replace(/\s+/g, " ").trim();
  const phoneticSaad = spaced.replace(/\bsad\b/gi, "saad").replace(/\bcentre\b/gi, "center");
  const tokens = phoneticSaad.split(/\s+/).filter(Boolean);
  const unique = /* @__PURE__ */ new Set([clean]);
  if (spaced) unique.add(spaced);
  if (phoneticSaad) unique.add(phoneticSaad);
  if (tokens.length >= 3) {
    unique.add(tokens.slice(0, 2).join(" "));
  }
  return Array.from(unique);
}
var GENERIC_PLACE_STOPWORDS = /* @__PURE__ */ new Set([
  "road",
  "rd",
  "street",
  "st",
  "house",
  "block",
  "sector",
  "area",
  "zone",
  "dhaka",
  "bangladesh",
  "bd",
  "city",
  "center",
  "centre",
  "tower",
  "plaza",
  "park",
  "mall"
]);
function findLocalAddressSuggestions(rawQuery, areas, limit = 8) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const fuzzyQuery = normalizeFuzzyAddressText(rawQuery);
  const compactQuery = fuzzyQuery.replace(/\s+/g, "");
  const tokens = fuzzyQuery.split(/\s+/).filter(Boolean);
  const scored = [];
  const partialFallback = [];
  for (const area of areas) {
    const nameLower = area.name.toLowerCase();
    const bnLower = (area.nameBn || "").toLowerCase();
    const divLower = (area.division || "").toLowerCase();
    const zoneLower = `${area.zoneCode || ""} ${area.zoneLabel || ""}`.toLowerCase();
    const extraLower = `${area.addressHint || ""} ${area.keywords || ""}`.toLowerCase();
    const rawHaystack = `${nameLower} ${bnLower} ${divLower} ${zoneLower} ${extraLower}`.trim();
    const fuzzyName = normalizeFuzzyAddressText(area.name);
    const fuzzyHaystack = normalizeFuzzyAddressText(rawHaystack);
    const compactName = fuzzyName.replace(/\s+/g, "");
    const compactHaystack = fuzzyHaystack.replace(/\s+/g, "");
    const rawTokens = q.split(/\s+/).filter(Boolean);
    const matchesRaw = rawTokens.length > 0 && rawTokens.every((tok) => rawHaystack.includes(tok));
    const matchesFuzzy = tokens.length > 0 && tokens.every((tok) => fuzzyHaystack.includes(tok));
    const matchesCompact = compactQuery.length >= 4 && compactHaystack.includes(compactQuery);
    const subtitle = area.zoneCode ? `${area.zoneCode}${area.division ? ` \xB7 ${area.division}` : ""}` : area.zoneLabel || area.division || "Bangladesh";
    const displayName = area.addressHint ? `${area.name}, ${area.addressHint}` : `${area.name}${area.division ? `, ${area.division}` : ""}, Bangladesh`;
    const buildItem = () => ({
      shortName: area.name,
      shortNameBn: area.nameBn || area.name,
      displayName,
      subtitle,
      lat: area.lat,
      lng: area.lng,
      source: "area"
    });
    if (matchesRaw || matchesFuzzy || matchesCompact) {
      let score = 20;
      if (nameLower === q || bnLower === q || fuzzyName === fuzzyQuery || compactName === compactQuery) {
        score = 120;
      } else if (nameLower.startsWith(q) || bnLower.startsWith(q) || fuzzyName.startsWith(fuzzyQuery) || compactName.startsWith(compactQuery)) {
        score = 100;
      } else if (nameLower.includes(q) || bnLower.includes(q) || fuzzyName.includes(fuzzyQuery) || compactName.includes(compactQuery)) {
        score = 84;
      } else if (tokens.every((tok) => fuzzyName.includes(tok))) {
        score = 72;
      } else if (zoneLower.includes(q)) {
        score = 45;
      }
      scored.push({ score, item: buildItem() });
      continue;
    }
    if (tokens.length >= 2) {
      const strongTokens = tokens.filter((t) => t.length >= 3 && !GENERIC_PLACE_STOPWORDS.has(t));
      if (strongTokens.length > 0) {
        const haystackWords = fuzzyHaystack.split(/\s+/).filter(Boolean);
        const nameWords = fuzzyName.split(/\s+/).filter(Boolean);
        const matchesWord = (words, tok) => tok.length <= 3 ? words.some((w) => w === tok) : words.some((w) => w.startsWith(tok) || w.includes(tok));
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
function filterAndRankRemoteSuggestions(rawQuery, items, limit = 10) {
  const fuzzyQuery = normalizeFuzzyAddressText(rawQuery);
  const tokens = fuzzyQuery.split(/\s+/).filter((t) => t.length >= 2);
  const strongTokens = tokens.filter((t) => t.length >= 3 && !GENERIC_PLACE_STOPWORDS.has(t));
  const requiredAny = strongTokens.length > 0 ? strongTokens : tokens;
  const matchesToken = (text2, words, tok) => tok.length <= 3 ? words.some((w) => w === tok) : text2.includes(tok);
  const scored = [];
  for (const item of items) {
    const fuzzyText = normalizeFuzzyAddressText(`${item.shortName} ${item.displayName} ${item.subtitle || ""}`);
    const fuzzyName = normalizeFuzzyAddressText(item.shortName);
    const textWords = fuzzyText.split(/\s+/).filter(Boolean);
    const nameWords = fuzzyName.split(/\s+/).filter(Boolean);
    let matchedCount = 0;
    let matchedNameCount = 0;
    for (const tok of tokens) {
      if (matchesToken(fuzzyText, textWords, tok)) matchedCount += 1;
      if (matchesToken(fuzzyName, nameWords, tok)) matchedNameCount += 1;
    }
    const hasStrongHit = requiredAny.length === 0 || requiredAny.some((tok) => matchesToken(fuzzyText, textWords, tok));
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
function mergeAddressSuggestions(localItems, remoteItems, limit = 12) {
  const out = [];
  const seenKeys = /* @__PURE__ */ new Set();
  const pushUnique = (item) => {
    const key = `${normalizeFuzzyAddressText(item.shortName)}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push(item);
  };
  for (const item of localItems) pushUnique(item);
  for (const item of remoteItems) pushUnique(item);
  return out.slice(0, Math.max(1, limit));
}
function resolveAiEnvFlags(flagOrBool) {
  if (typeof flagOrBool === "boolean") {
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
      hasHuggingFaceKey: false
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
    hasHuggingFaceKey: Boolean(flagOrBool?.hasHuggingFaceKey)
  };
}
function hasEnvKeyForAiProviderType(providerType, envFlags = false) {
  const flags = resolveAiEnvFlags(envFlags);
  switch (providerType) {
    case "foodora":
    case "pollinations":
      return true;
    case "gemini":
      return flags.hasGeminiKey;
    case "openrouter":
      return flags.hasOpenRouterKey;
    case "openai":
      return flags.hasOpenAIKey;
    case "groq":
      return flags.hasGroqKey;
    case "deepseek":
      return flags.hasDeepSeekKey;
    case "anthropic":
      return flags.hasAnthropicKey;
    case "mistral":
      return flags.hasMistralKey;
    case "xai":
      return flags.hasXaiKey;
    case "together":
      return flags.hasTogetherKey;
    case "cerebras":
      return flags.hasCerebrasKey;
    case "perplexity":
      return flags.hasPerplexityKey;
    case "cohere":
      return flags.hasCohereKey;
    case "huggingface":
      return flags.hasHuggingFaceKey;
    default:
      return false;
  }
}
var DEFAULT_AI_PROVIDERS = [
  {
    code: "foodora",
    name: "Foodora Own AI",
    providerType: "foodora",
    model: "foodora-bd-assistant",
    apiBaseUrl: "",
    isActive: true,
    isDefault: true,
    sortOrder: 1
  },
  {
    code: "openrouter",
    name: "OpenRouter (Gemma 4)",
    providerType: "openrouter",
    model: "google/gemma-4-31b-it:free",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 2
  },
  {
    code: "pollinations",
    name: "Pollinations Free AI (No Key)",
    providerType: "pollinations",
    model: "openai-fast",
    apiBaseUrl: "https://text.pollinations.ai",
    isActive: true,
    isDefault: false,
    sortOrder: 3
  },
  {
    code: "gemini",
    name: "Google Gemini 4",
    providerType: "gemini",
    model: "gemini-4-hydrogen",
    apiBaseUrl: "",
    isActive: true,
    isDefault: false,
    sortOrder: 4
  },
  {
    code: "openrouter_llama",
    name: "OpenRouter (Llama 3.3 Free)",
    providerType: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 5
  },
  {
    code: "chatgpt",
    name: "ChatGPT (OpenAI)",
    providerType: "openai",
    model: "gpt-4o-mini",
    apiBaseUrl: "https://api.openai.com/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 6
  },
  {
    code: "groq",
    name: "Groq (Llama 3.3 70B)",
    providerType: "groq",
    model: "llama-3.3-70b-versatile",
    apiBaseUrl: "https://api.groq.com/openai/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 7
  },
  {
    code: "deepseek",
    name: "DeepSeek V3 AI",
    providerType: "deepseek",
    model: "deepseek-chat",
    apiBaseUrl: "https://api.deepseek.com/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 8
  },
  {
    code: "claude",
    name: "Anthropic Claude",
    providerType: "anthropic",
    model: "claude-3-5-haiku-latest",
    apiBaseUrl: "https://api.anthropic.com",
    isActive: true,
    isDefault: false,
    sortOrder: 9
  },
  {
    code: "mistral",
    name: "Mistral AI",
    providerType: "mistral",
    model: "mistral-small-latest",
    apiBaseUrl: "https://api.mistral.ai/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 10
  },
  {
    code: "grok",
    name: "xAI Grok",
    providerType: "xai",
    model: "grok-2-latest",
    apiBaseUrl: "https://api.x.ai/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 11
  },
  {
    code: "together",
    name: "Together AI",
    providerType: "together",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    apiBaseUrl: "https://api.together.xyz/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 12
  },
  {
    code: "cerebras",
    name: "Cerebras AI",
    providerType: "cerebras",
    model: "llama-3.3-70b",
    apiBaseUrl: "https://api.cerebras.ai/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 13
  },
  {
    code: "perplexity",
    name: "Perplexity Sonar",
    providerType: "perplexity",
    model: "sonar",
    apiBaseUrl: "https://api.perplexity.ai",
    isActive: true,
    isDefault: false,
    sortOrder: 14
  },
  {
    code: "cohere",
    name: "Cohere Command",
    providerType: "cohere",
    model: "command-a-03-2025",
    apiBaseUrl: "https://api.cohere.com/compatibility/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 15
  },
  {
    code: "huggingface",
    name: "HuggingFace Qwen 2.5",
    providerType: "huggingface",
    model: "Qwen/Qwen2.5-72B-Instruct",
    apiBaseUrl: "https://router.huggingface.co/v1",
    isActive: true,
    isDefault: false,
    sortOrder: 16
  }
];
function normalizeAiProviderCode(input) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}
function isValidExternalAiBaseUrl(rawUrl) {
  const clean = String(rawUrl || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "169.254.169.254") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function isAiProviderConfigured(row, envFlags = false) {
  if (row.providerType === "foodora" || row.providerType === "pollinations") {
    return true;
  }
  if (row.providerType === "gemini") {
    return hasEnvKeyForAiProviderType("gemini", envFlags);
  }
  if (hasEnvKeyForAiProviderType(row.providerType, envFlags)) {
    return true;
  }
  const hasKey = Boolean(row.apiKey && row.apiKey.trim());
  if (!hasKey) return false;
  if (row.providerType === "custom_openai") {
    return isValidExternalAiBaseUrl(row.apiBaseUrl || "");
  }
  return true;
}
function toPublicAiProviderView(row, envFlags = false) {
  const allowedTypes = [
    "foodora",
    "pollinations",
    "gemini",
    "openrouter",
    "openai",
    "groq",
    "deepseek",
    "anthropic",
    "mistral",
    "xai",
    "together",
    "cerebras",
    "perplexity",
    "cohere",
    "huggingface",
    "custom_openai"
  ];
  const providerType = allowedTypes.includes(row.providerType) ? row.providerType : "custom_openai";
  return {
    code: normalizeAiProviderCode(row.code),
    name: row.name,
    providerType,
    model: row.model,
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    isConfigured: isAiProviderConfigured({ ...row, providerType }, envFlags),
    sortOrder: Number(row.sortOrder ?? 10)
  };
}
function toAdminAiProviderView(row, envFlags = false) {
  const flags = resolveAiEnvFlags(envFlags);
  const pub = toPublicAiProviderView(row, flags);
  const cleanKey = typeof row.apiKey === "string" ? row.apiKey.trim() : "";
  const hasEnvForType = hasEnvKeyForAiProviderType(pub.providerType, flags);
  return {
    ...pub,
    apiBaseUrl: row.apiBaseUrl || "",
    hasApiKey: pub.providerType === "foodora" || pub.providerType === "pollinations" ? true : pub.providerType === "gemini" ? flags.hasGeminiKey : Boolean(cleanKey || hasEnvForType),
    apiKeyPreview: pub.providerType === "foodora" ? flags.hasGeminiKey ? "Foodora Own AI + Gemini" : "Built-in Foodora AI Ready" : pub.providerType === "pollinations" ? "Free Keyless AI Ready" : pub.providerType === "gemini" ? flags.hasGeminiKey ? "Server Env Configured" : "Missing Env Key" : cleanKey ? maskSecretValue(cleanKey) : hasEnvForType ? "Server Env Configured" : ""
  };
}
function buildOpenRouterChatPayload(options) {
  const cleanModel = (options.model || "").trim() || "google/gemma-4-31b-it:free";
  const strictProvider = options.strictProvider !== false;
  const enableReasoning = options.enableReasoning !== false;
  const messages = [
    { role: "system", content: options.systemInstruction },
    ...options.history.slice(-8).map((item) => {
      if (item.role === "model") {
        const msg = {
          role: "assistant",
          content: item.text
        };
        if (enableReasoning && item.reasoning_details !== void 0) {
          msg.reasoning_details = item.reasoning_details;
        }
        return msg;
      }
      return {
        role: "user",
        content: item.text
      };
    }),
    { role: "user", content: options.message }
  ];
  const payload = {
    model: cleanModel,
    messages
  };
  if (enableReasoning) {
    payload.reasoning = { enabled: true };
  }
  if (strictProvider && (cleanModel.includes("gemma-4") || cleanModel.startsWith("google/"))) {
    payload.provider = {
      only: ["google-ai-studio"],
      allow_fallbacks: false
    };
  }
  return payload;
}
function extractAiReplyText(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const joined = content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const obj = part;
        if (typeof obj.text === "string") return obj.text;
        if (typeof obj.content === "string") return obj.content;
      }
      return "";
    }).filter(Boolean).join("\n").trim();
    return joined;
  }
  if (content && typeof content === "object") {
    const obj = content;
    if (typeof obj.text === "string") return obj.text.trim();
    if (typeof obj.content === "string") return obj.content.trim();
    if (typeof obj.message === "string") return obj.message.trim();
  }
  return "";
}
function coerceSafeErrorText(err, fallback = "Something went wrong. Please try again.") {
  if (typeof err === "string") {
    const clean = err.trim();
    return clean || fallback;
  }
  if (err instanceof Error) {
    const clean = typeof err.message === "string" ? err.message.trim() : "";
    return clean && clean !== "[object Object]" ? clean : fallback;
  }
  if (err && typeof err === "object") {
    const obj = err;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error.trim();
    if (obj.error && typeof obj.error === "object") {
      const nested = obj.error.message;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  }
  return fallback;
}
function filterGeminiCandidateModels(preferredModel) {
  const cleanPreferred = String(preferredModel || "").trim();
  const isValidGeminiModel = Boolean(cleanPreferred) && /^gemini-/i.test(cleanPreferred) && !cleanPreferred.includes("gemini-2.5") && !cleanPreferred.includes("gemini-1.5") && !cleanPreferred.includes("gemini-2.0");
  return Array.from(
    new Set(
      [
        ...isValidGeminiModel ? [cleanPreferred] : [],
        "gemini-4-hydrogen",
        "gemini-3.1-flash-lite"
      ].filter(Boolean)
    )
  );
}
function shouldReplyInBanglaForAiHelp(message, langPreference = "auto", uiLang = "en") {
  if (langPreference === "bn") return true;
  if (langPreference === "en") return false;
  if (/[\u0980-\u09FF]/.test(message)) return true;
  if (/\b(keno|kothay|kivabe|kibhabe|amar|apnar|taka|khawar|khabar|nai|ache|hobe|korbo|den|chai|dhonnobad)\b/i.test(
    message
  )) {
    return true;
  }
  return uiLang === "bn";
}
function generateFoodoraOwnAiReply(params) {
  const q = params.message.trim().toLowerCase();
  const bn = shouldReplyInBanglaForAiHelp(
    params.message,
    params.langPreference || "auto",
    params.uiLang || "en"
  );
  const openList = (params.openRestaurants || []).slice(0, 4);
  const openNames = openList.map((r) => `${r.name} (${r.area})`).join(", ");
  if (/(messenger|whatsapp|support|contact|helpline|hotline|মেসেঞ্জার|হোয়াটসঅ্যাপ|সাপোর্ট|যোগাযোগ)/i.test(q)) {
    return bn ? "Foodora BD \u09B8\u09BE\u09AA\u09CB\u09B0\u09CD\u099F\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u098F\u0987 \u099A\u09CD\u09AF\u09BE\u099F \u0989\u0987\u09A8\u09CD\u09A1\u09CB\u09B0 \u0989\u09AA\u09B0\u09C7\u09B0 **Messenger** \u0985\u09A5\u09AC\u09BE **WhatsApp** \u09AC\u09BE\u099F\u09A8\u09C7 \u0995\u09CD\u09B2\u09BF\u0995 \u0995\u09B0\u09C7 \u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \u0995\u09A5\u09BE \u09AC\u09B2\u09A4\u09C7 \u09AA\u09BE\u09B0\u09C7\u09A8, \u0985\u09A5\u09AC\u09BE \u098F\u0987 **Website Live Chat**-\u098F\u0987 \u0986\u09AA\u09A8\u09BE\u09B0 \u09AA\u09CD\u09B0\u09B6\u09CD\u09A8 \u09B2\u09BF\u0996\u09C1\u09A8\u0964" : "You can reach Foodora BD Support directly via the **Messenger** or **WhatsApp** buttons at the top of this chat (or in the website footer), or keep chatting right here in **Website Live Chat**!";
  }
  if (/(unavailable|closed|bandho|bondho|অর্ডার নেওয়া|বন্ধ|available|store open)/i.test(q)) {
    return bn ? '\u0995\u09CB\u09A8\u09CB \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F "unavailable" \u09A6\u09C7\u0996\u09BE\u09B2\u09C7 \u09AC\u09C1\u099D\u09A4\u09C7 \u09B9\u09AC\u09C7 \u09B8\u09C7\u099F\u09BF\u09B0 "Store Open" \u09AC\u09A8\u09CD\u09A7 \u0986\u099B\u09C7 \u0985\u09A5\u09AC\u09BE \u0985\u09CD\u09AF\u09BE\u09A1\u09AE\u09BF\u09A8 \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09A8 (approved) \u09AC\u09BE\u0995\u09BF \u0986\u099B\u09C7\u0964 \u09AA\u09BE\u09B0\u09CD\u099F\u09A8\u09BE\u09B0 \u09A1\u09CD\u09AF\u09BE\u09B6\u09AC\u09CB\u09B0\u09CD\u09A1\u09C7\u09B0 Store Switch \u09A5\u09C7\u0995\u09C7 Store Open \u099A\u09BE\u09B2\u09C1 \u0995\u09B0\u09B2\u09C7\u0987 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A8\u09C7\u0993\u09DF\u09BE \u09B6\u09C1\u09B0\u09C1 \u09B9\u09AC\u09C7\u0964 \u099A\u09BE\u0987\u09B2\u09C7 \u09B9\u09CB\u09AE\u09AA\u09C7\u099C\u09C7\u09B0 \u099A\u09BE\u09B2\u09C1 \u09A5\u09BE\u0995\u09BE \u0985\u09A8\u09CD\u09AF \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u09A5\u09C7\u0995\u09C7\u0993 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09C7\u09A8\u0964' : 'A restaurant appears unavailable when its "Store Open" toggle is switched OFF in the Partner/Admin Dashboard or its approval status is still pending. Re-opening the store toggle immediately re-enables ordering, or you can pick another Open restaurant on the home feed.';
  }
  if (/(job|apply|join|salary|নিয়োগ|জব|কাজ|আবেদন)/i.test(q)) {
    return bn ? '\u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09AC\u09BE \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u09AA\u09BE\u09B0\u09CD\u099F\u09A8\u09BE\u09B0 \u09B9\u09A4\u09C7 \u099A\u09BE\u0987\u09B2\u09C7 \u0989\u09AA\u09B0\u09C7\u09B0 "Rider Job" \u09AC\u09BE "Partner" \u09B2\u09BF\u0982\u0995\u09C7 \u0995\u09CD\u09B2\u09BF\u0995 \u0995\u09B0\u09C1\u09A8\u0964 \u09AC\u09BE\u0987\u09B8\u09BE\u0987\u0995\u09C7\u09B2 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0\u09A6\u09C7\u09B0 \u09A1\u09CD\u09B0\u09BE\u0987\u09AD\u09BF\u0982 \u09B2\u09BE\u0987\u09B8\u09C7\u09A8\u09CD\u09B8 \u099B\u09BE\u09DC\u09BE\u0987 \u09B6\u09C1\u09A7\u09C1\u09AE\u09BE\u09A4\u09CD\u09B0 \u0990\u099A\u09CD\u099B\u09BF\u0995 NID \u09A6\u09BF\u09DF\u09C7 \u0986\u09AC\u09C7\u09A6\u09A8 \u0995\u09B0\u09BE\u09B0 \u09B8\u09C1\u09AC\u09BF\u09A7\u09BE \u09B0\u09DF\u09C7\u099B\u09C7\u0964' : 'To join as a delivery rider or restaurant partner, open "Rider Job" or "Partner" from the top navigation. Bicycle riders can join without a driving license using an optional NID.';
  }
  if (/(pay|bkash|nagad|ssl|cod|cash|promo|coupon|discount|পেমেন্ট|বিকাশ|নগদ|ক্যাশ|প্রোমো)/i.test(q)) {
    return bn ? "Foodora BD-\u09A4\u09C7 bKash, Nagad, SSLCommerz \u098F\u09AC\u0982 Cash on Delivery (COD) \u09B8\u09AC \u09AE\u09BE\u09A7\u09CD\u09AF\u09AE\u0987 \u099A\u09BE\u09B2\u09C1 \u0986\u099B\u09C7\u0964 \u099A\u09C7\u0995\u0986\u0989\u099F\u09C7 FOODORA50 \u09AA\u09CD\u09B0\u09CB\u09AE\u09CB \u0995\u09CB\u09A1 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09B2\u09C7 \u09A8\u09BF\u09B0\u09CD\u09A6\u09BF\u09B7\u09CD\u099F \u09B6\u09B0\u09CD\u09A4\u09C7 \u09A1\u09BF\u09B8\u0995\u09BE\u0989\u09A8\u09CD\u099F \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u0964 \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09AE\u09C7\u09A5\u09A1 \u0993 API \u0997\u09C7\u099F\u0993\u09DF\u09C7 \u09B8\u09C1\u09AA\u09BE\u09B0 \u0985\u09CD\u09AF\u09BE\u09A1\u09AE\u09BF\u09A8\u09C7\u09B0 Backend Control \u09A5\u09C7\u0995\u09C7\u0993 \u0995\u09A8\u09AB\u09BF\u0997\u09BE\u09B0 \u0995\u09B0\u09BE \u09AF\u09BE\u09DF\u0964" : "Foodora BD supports bKash, Nagad, SSLCommerz, and Cash on Delivery (COD). You can apply promo codes like FOODORA50 at checkout, and Super Admins can manage live/sandbox gateways under Backend Control.";
  }
  if (/(track|rider|eta|gps|ট্র্যাক|রাইডার|অর্ডার.*(কোথায়|kothay|status)|(কোথায়|kothay).*(order|rider|ডেলিভারি))/i.test(q)) {
    const ordRef = params.activeOrderNumber ? ` (${params.activeOrderNumber})` : "";
    return bn ? `\u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u099F\u09CD\u09B0\u09CD\u09AF\u09BE\u0995 \u0995\u09B0\u09A4\u09C7 \u09B9\u09C7\u09A1\u09BE\u09B0\u09C7\u09B0 "Track Rider" \u09AC\u09BE\u099F\u09A8\u09C7 \u0995\u09CD\u09B2\u09BF\u0995 \u0995\u09B0\u09C1\u09A8${ordRef} \u0985\u09A5\u09AC\u09BE \u099A\u09C7\u0995\u0986\u0989\u099F \u0987\u09AE\u09C7\u0987\u09B2 \u0993 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A8\u09AE\u09CD\u09AC\u09B0 \u09A6\u09BF\u09A8\u0964 \u09B8\u09C7\u0996\u09BE\u09A8\u09C7 \u09AE\u09CD\u09AF\u09BE\u09AA\u09C7 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0\u09C7\u09B0 \u09B2\u09BE\u0987\u09AD GPS \u0985\u09AC\u09B8\u09CD\u09A5\u09BE\u09A8, \u09A6\u09C2\u09B0\u09A4\u09CD\u09AC \u0993 \u09AA\u09CC\u0981\u099B\u09BE\u09A8\u09CB\u09B0 \u0986\u09A8\u09C1\u09AE\u09BE\u09A8\u09BF\u0995 \u09B8\u09AE\u09DF (ETA) \u09A6\u09C7\u0996\u09A4\u09C7 \u09AA\u09BE\u09AC\u09C7\u09A8\u0964` : `Click "Track Rider" in the top bar${ordRef} or search using your Checkout Email + Order Number to view live rider GPS coordinates, route path, and ETA.`;
  }
  if (/(owner|vendor|partner|branch|stock|variant|variation|addon|dispatch|শাখা|স্টক|ভেন্ডর|পার্টনার|ভ্যারিয়েশন)/i.test(q)) {
    return bn ? "\u098F\u0995\u099C\u09A8 \u09AA\u09BE\u09B0\u09CD\u099F\u09A8\u09BE\u09B0 \u09E7\u099F\u09BF \u09AE\u09C2\u09B2 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u0996\u09C1\u09B2\u09C7 \u098F\u09B0 \u0985\u09A7\u09C0\u09A8\u09C7 **Add Branch** \u09A6\u09BF\u09DF\u09C7 \u098F\u0995\u09BE\u09A7\u09BF\u0995 \u09B6\u09BE\u0996\u09BE \u09AF\u09CB\u0997 \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09C7\u09A8\u0964 Menu \u0993 Stock \u099F\u09CD\u09AF\u09BE\u09AC\u09C7 \u09AA\u09CD\u09B0\u09CB\u09A1\u09BE\u0995\u09CD\u099F \u09AD\u09CD\u09AF\u09BE\u09B0\u09BF\u09DF\u09C7\u09B6\u09A8, \u0985\u09CD\u09AF\u09BE\u09A1-\u0985\u09A8 \u0993 In Stock \u0986\u09AA\u09A1\u09C7\u099F \u098F\u09AC\u0982 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u09A1\u09BF\u09B8\u09AA\u09CD\u09AF\u09BE\u099A \u09B8\u09AC\u0987 \u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u0995\u09B0\u09BE \u09AF\u09BE\u09DF\u0964" : "Each partner can open 1 primary restaurant and add multiple branches via **Add Branch**. Inside the Partner Portal you can dispatch orders, update stock/variations, and post Rider Jobs.";
  }
  if (/(restaurant|menu|food|biriyani|kacchi|burger|pizza|খাওয়া|খাবার|রেস্টুরেন্ট|অর্ডার)/i.test(q)) {
    return bn ? `${params.area ? `${params.area} \u098F\u09B2\u09BE\u0995\u09BE\u09DF ` : ""}\u09B9\u09CB\u09AE\u09AA\u09C7\u099C\u09C7\u09B0 "Order Popular Food Now" \u09AC\u09BE \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u0995\u09BE\u09B0\u09CD\u09A1 \u09A5\u09C7\u0995\u09C7 \u09AF\u09C7\u0995\u09CB\u09A8\u09CB \u09A1\u09BF\u09B6 \u0995\u09BE\u09B0\u09CD\u099F\u09C7 \u09AF\u09CB\u0997 \u0995\u09B0\u09C7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09AC\u09C7\u09A8\u0964${openNames ? ` \u098F\u0996\u09A8 \u0996\u09CB\u09B2\u09BE \u0986\u099B\u09C7: ${openNames}\u0964` : ""} \u099A\u09BE\u0987\u09B2\u09C7 \u09AA\u099B\u09A8\u09CD\u09A6\u09C7\u09B0 \u0996\u09BE\u09AC\u09BE\u09B0\u09C7\u09B0 \u09A8\u09BE\u09AE \u09AC\u09B2\u09C1\u09A8, \u0986\u09AE\u09BF \u0996\u09C1\u0981\u099C\u09C7 \u09A6\u09BF\u09A4\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09CD\u09AF \u0995\u09B0\u09AC\u09CB\u0964` : `Pick any dish from "Order Popular Food Now" or browse open restaurants${params.area ? ` around ${params.area}` : ""} to add items and checkout.${openNames ? ` Currently open: ${openNames}.` : ""} Tell me what craving you have and I can point you to it!`;
  }
  return bn ? `\u0986\u09AE\u09BF Foodora BD-\u098F\u09B0 \u09A8\u09BF\u099C\u09B8\u09CD\u09AC AI \u09B8\u09B9\u09BE\u09DF\u0995\u0964${openNames ? ` \u098F\u0996\u09A8 \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u0995\u09BF\u099B\u09C1 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F: ${openNames}\u0964` : ""} \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09BE, \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09B2\u09BE\u0987\u09AD \u099F\u09CD\u09B0\u09CD\u09AF\u09BE\u0995\u09BF\u0982, \u09B6\u09BE\u0996\u09BE \u09AF\u09CB\u0997 \u0995\u09B0\u09BE, bKash/COD \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u0995\u09BF\u0982\u09AC\u09BE Messenger / WhatsApp \u09B8\u09BE\u09AA\u09CB\u09B0\u09CD\u099F \u09B8\u09AE\u09CD\u09AA\u09B0\u09CD\u0995\u09C7 \u09AF\u09C7\u0995\u09CB\u09A8\u09CB \u09AA\u09CD\u09B0\u09B6\u09CD\u09A8 \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09C7\u09A8\u0964` : `I am Foodora BD's built-in AI assistant.${openNames ? ` Currently open stores include: ${openNames}.` : ""} Ask me anything about ordering food, live rider tracking, branch setup, payments, or Messenger/WhatsApp support.`;
}
function validateRiderJobPayload(input) {
  const restaurantId = Number(input.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return { valid: false, reason: "Please select a valid restaurant for the rider job." };
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3 || title.length > 120) {
    return { valid: false, reason: "Job title must be between 3 and 120 characters." };
  }
  const titleBn = typeof input.titleBn === "string" && input.titleBn.trim().length > 0 ? input.titleBn.trim() : title;
  const zone = typeof input.zone === "string" ? input.zone.trim() : "";
  if (zone.length < 2 || zone.length > 120) {
    return { valid: false, reason: "Delivery zone / area is required." };
  }
  const vehicleType = typeof input.vehicleType === "string" && input.vehicleType.trim().length >= 2 ? input.vehicleType.trim() : "Motorbike / Bicycle";
  const salaryRange = typeof input.salaryRange === "string" && input.salaryRange.trim().length >= 2 ? input.salaryRange.trim() : "\u09F315,000 - \u09F322,000 / month";
  const shiftHours = typeof input.shiftHours === "string" && input.shiftHours.trim().length >= 2 ? input.shiftHours.trim() : "Full-time \xB7 11:00 AM - 11:00 PM";
  const vacanciesRaw = Number(input.vacancies ?? 1);
  const vacancies = Number.isInteger(vacanciesRaw) && vacanciesRaw >= 1 && vacanciesRaw <= 100 ? vacanciesRaw : 1;
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 600) : "";
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
      description
    }
  };
}
function normalizeVariationsList(raw, fallbackRegular = true) {
  if (!Array.isArray(raw)) {
    return fallbackRegular ? [{ name: "Regular", priceDelta: 0 }] : [];
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const numDelta = Number(rec.priceDelta ?? 0);
    const priceDelta = Number.isFinite(numDelta) ? Math.max(-5e4, Math.min(5e4, Math.round(numDelta))) : 0;
    out.push({ name, priceDelta });
  }
  if (out.length === 0 && fallbackRegular) {
    return [{ name: "Regular", priceDelta: 0 }];
  }
  return out;
}
function normalizeAddonsList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const numPrice = Number(rec.price ?? 0);
    const price = Number.isFinite(numPrice) ? Math.max(0, Math.min(5e4, Math.round(numPrice))) : 0;
    out.push({ name, price });
  }
  return out;
}
function validateVendorAddRiderPayload(input) {
  const restaurantId = Number(input.restaurantId);
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
    return { valid: false, reason: "Please select a valid restaurant store." };
  }
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (fullName.length < 2 || fullName.length > 100) {
    return { valid: false, reason: "Delivery man full name must be at least 2 characters." };
  }
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const digits = rawPhone.replace(/[\s\-()]/g, "");
  let normalizedPhone = "";
  if (/^\+?8801[3-9]\d{8}$/.test(digits)) {
    normalizedPhone = digits.startsWith("+") ? digits : `+${digits}`;
  } else if (/^01[3-9]\d{8}$/.test(digits)) {
    normalizedPhone = `+88${digits}`;
  } else {
    return { valid: false, reason: "Please enter a valid Bangladesh mobile number (e.g. 017XXXXXXXX)." };
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@") || email.length < 5) {
    return { valid: false, reason: "Please provide a valid email address for the delivery man." };
  }
  const password = typeof input.password === "string" ? input.password : "";
  if (password.trim().length > 0 && password.trim().length < 6) {
    return { valid: false, reason: "Login password must be at least 6 characters (or leave blank)." };
  }
  const vehicleType = typeof input.vehicleType === "string" && input.vehicleType.trim().length >= 2 ? input.vehicleType.trim().slice(0, 60) : "Motorbike";
  const zone = typeof input.zone === "string" && input.zone.trim().length >= 2 ? input.zone.trim().slice(0, 120) : "Gulshan 2";
  const nidNumber = typeof input.nidNumber === "string" ? input.nidNumber.trim().slice(0, 50) : "";
  return {
    valid: true,
    data: {
      restaurantId,
      fullName,
      phone: normalizedPhone,
      email,
      ...password.trim() ? { password: password.trim() } : {},
      vehicleType,
      zone,
      nidNumber
    }
  };
}
function parseUploadedImageDataUrl(rawDataUrl, filename) {
  const trimmed = String(rawDataUrl || "").trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1 || !trimmed.toLowerCase().startsWith("data:")) {
    return { valid: false, reason: "Only PNG, JPG, WEBP, or GIF images are supported" };
  }
  const header = trimmed.slice(5, commaIdx).toLowerCase();
  if (!header.includes(";base64")) {
    return { valid: false, reason: "Image payload must be base64 encoded" };
  }
  const rawMime = header.split(";")[0].trim();
  const cleanBase64 = trimmed.slice(commaIdx + 1).replace(/\s+/g, "");
  if (!cleanBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    return { valid: false, reason: "Corrupted base64 image payload" };
  }
  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/jfif": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  let ext = mimeToExt[rawMime];
  if (!ext && (rawMime === "application/octet-stream" || rawMime === "" || rawMime === "image/*")) {
    const buf = Buffer.from(cleanBase64.slice(0, 32), "base64");
    if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) {
      ext = "jpg";
    } else if (buf.length >= 4 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
      ext = "png";
    } else if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
      ext = "webp";
    } else if (buf.length >= 4 && buf.subarray(0, 3).toString("ascii") === "GIF") {
      ext = "gif";
    } else {
      const lowerName = String(filename || "").toLowerCase();
      if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) ext = "jpg";
      else if (lowerName.endsWith(".png")) ext = "png";
      else if (lowerName.endsWith(".webp")) ext = "webp";
      else if (lowerName.endsWith(".gif")) ext = "gif";
    }
  }
  if (!ext) {
    return { valid: false, reason: "Only PNG, JPG, WEBP, or GIF images are supported" };
  }
  const extToMime = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif"
  };
  return {
    valid: true,
    ext,
    base64Data: cleanBase64,
    mimeType: extToMime[ext]
  };
}
function sanitizeRiderProfileUpdate(input) {
  const fullName = String(input.fullName || "").trim();
  if (fullName.length < 2 || fullName.length > 80) {
    return { valid: false, error: "Full name must be between 2 and 80 characters." };
  }
  const phone = String(input.phone || "").trim();
  const digitsOnly = phone.replace(/[^\d]/g, "");
  if (digitsOnly.length < 8 || phone.length > 24) {
    return { valid: false, error: "Please enter a valid phone number." };
  }
  const vehicleType = String(input.vehicleType || "").trim();
  if (vehicleType.length < 2 || vehicleType.length > 50) {
    return { valid: false, error: "Please specify a valid vehicle type." };
  }
  const zone = String(input.zone || "").trim();
  if (zone.length < 2 || zone.length > 100) {
    return { valid: false, error: "Please select or enter a valid working zone." };
  }
  const nidNumber = String(input.nidNumber ?? "").trim().slice(0, 40);
  const isAvailable = typeof input.isAvailable === "boolean" ? input.isAvailable : true;
  const avatarUrl = String(input.avatarUrl ?? "").trim();
  if (avatarUrl && !avatarUrl.startsWith("/uploads/") && !avatarUrl.startsWith("https://") && !avatarUrl.startsWith("http://") && !avatarUrl.startsWith("data:image/")) {
    return { valid: false, error: "Profile photo URL must be a valid uploaded image." };
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
      avatarUrl
    }
  };
}
function isBicycleVehicleType(vehicleType) {
  const clean = String(vehicleType || "").trim().toLowerCase();
  if (!clean) return false;
  return clean === "bicycle" || clean === "cycle" || clean === "bycicle" || clean === "bycikel" || clean.includes("bicycle") || clean.includes("pushbike") || clean.includes("\u09B8\u09BE\u0987\u0995\u09C7\u09B2");
}
function canOwnerOpenNewRestaurant(existingOwnedCount, actorRole) {
  const role = String(actorRole || "").trim().toLowerCase();
  if (role === "admin" || role === "super_admin") {
    return { allowed: true };
  }
  if (existingOwnedCount >= 1) {
    return {
      allowed: false,
      error: "Each partner account can open 1 restaurant. Please add a new branch under your existing restaurant instead."
    };
  }
  return { allowed: true };
}
function buildBranchRestaurantNames(primaryName, primaryNameBn, branchLabel, branchLabelBn) {
  const stripBranchSuffix = (raw) => String(raw || "").split(/\s+[—–-]\s+/)[0].trim();
  const baseEn = stripBranchSuffix(primaryName) || "Foodora Partner";
  const baseBn = stripBranchSuffix(primaryNameBn) || baseEn;
  const cleanBranchEn = String(branchLabel || "").trim();
  const cleanBranchBn = String(branchLabelBn || "").trim() || cleanBranchEn;
  return {
    name: `${baseEn} \u2014 ${cleanBranchEn}`,
    nameBn: `${baseBn} \u2014 ${cleanBranchBn}`
  };
}
var BANGLADESH_DELIVERY_SERVICES = [
  {
    code: "pathao_food",
    nameEn: "Pathao Food & Courier",
    nameBn: "\u09AA\u09BE\u09A0\u09BE\u0993 \u09AB\u09C1\u09A1 \u0993 \u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0",
    mode: "third_party",
    minBaseFee: 55,
    etaOffsetMin: 2,
    coverageNoteEn: "Instant Pathao Food / Parcel rider across Bangladesh",
    coverageNoteBn: "\u09AA\u09BE\u09A0\u09BE\u0993 \u09AB\u09C1\u09A1/\u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0\u09C7\u09B0 \u09AE\u09BE\u09A7\u09CD\u09AF\u09AE\u09C7 \u09B8\u09BE\u09B0\u09BE \u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6\u09C7 \u09A6\u09CD\u09B0\u09C1\u09A4 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF"
  },
  {
    code: "foodora_express",
    nameEn: "Foodora Express Rider",
    nameBn: "\u09AB\u09C1\u09A1\u09CB\u09B0\u09BE \u098F\u0995\u09CD\u09B8\u09AA\u09CD\u09B0\u09C7\u09B8 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0",
    mode: "platform",
    minBaseFee: 35,
    etaOffsetMin: 0,
    coverageNoteEn: "Dedicated live GPS food rider fleet",
    coverageNoteBn: "\u09B2\u09BE\u0987\u09AD \u099C\u09BF\u09AA\u09BF\u098F\u09B8 \u099F\u09CD\u09B0\u09CD\u09AF\u09BE\u0995\u09BF\u0982\u09B8\u09B9 \u09A8\u09BF\u099C\u09B8\u09CD\u09AC \u09AB\u09C1\u09A1 \u09B0\u09BE\u0987\u09A1\u09BE\u09B0"
  },
  {
    code: "steadfast",
    nameEn: "Steadfast Courier BD",
    nameBn: "\u09B8\u09CD\u099F\u09C7\u09A1\u09AB\u09BE\u09B8\u09CD\u099F \u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0 \u09AC\u09BF\u09A1\u09BF",
    mode: "third_party",
    minBaseFee: 60,
    etaOffsetMin: 5,
    coverageNoteEn: "Nationwide 64-district food & parcel partner",
    coverageNoteBn: "\u09EC\u09EA \u099C\u09C7\u09B2\u09BE\u09DF \u09B8\u09CD\u099F\u09C7\u09A1\u09AB\u09BE\u09B8\u09CD\u099F \u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u09B8\u09BE\u09AA\u09CB\u09B0\u09CD\u099F"
  },
  {
    code: "redx",
    nameEn: "RedX Delivery BD",
    nameBn: "\u09B0\u09C7\u09A1\u098F\u0995\u09CD\u09B8 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u09AC\u09BF\u09A1\u09BF",
    mode: "third_party",
    minBaseFee: 60,
    etaOffsetMin: 5,
    coverageNoteEn: "Express zone dispatch via RedX Bangladesh",
    coverageNoteBn: "\u09B0\u09C7\u09A1\u098F\u0995\u09CD\u09B8-\u098F\u09B0 \u09AE\u09BE\u09A7\u09CD\u09AF\u09AE\u09C7 \u09A6\u09CD\u09B0\u09C1\u09A4 \u099C\u09CB\u09A8 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF"
  },
  {
    code: "paperfly",
    nameEn: "Paperfly / eCourier BD",
    nameBn: "\u09AA\u09C7\u09AA\u09BE\u09B0\u09AB\u09CD\u09B2\u09BE\u0987 / \u0987-\u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0",
    mode: "third_party",
    minBaseFee: 65,
    etaOffsetMin: 7,
    coverageNoteEn: "Doorstep courier coverage across Bangladesh",
    coverageNoteBn: "\u09B8\u09BE\u09B0\u09BE \u09A6\u09C7\u09B6\u09C7\u09B0 \u09B9\u09CB\u09AE \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u0995\u09C1\u09B0\u09BF\u09DF\u09BE\u09B0 \u09A8\u09C7\u099F\u0993\u09DF\u09BE\u09B0\u09CD\u0995"
  },
  {
    code: "restaurant_fleet",
    nameEn: "Restaurant Own Rider",
    nameBn: "\u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7\u09B0 \u09A8\u09BF\u099C\u09B8\u09CD\u09AC \u09B0\u09BE\u0987\u09A1\u09BE\u09B0",
    mode: "restaurant",
    minBaseFee: 30,
    etaOffsetMin: 0,
    coverageNoteEn: "Dispatched directly by the restaurant kitchen",
    coverageNoteBn: "\u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F\u09C7\u09B0 \u09A8\u09BF\u099C\u09B8\u09CD\u09AC \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u09A6\u09CD\u09AC\u09BE\u09B0\u09BE \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF"
  }
];
function getBangladeshDeliveryServiceMeta(code) {
  const clean = String(code || "").trim().toLowerCase();
  return BANGLADESH_DELIVERY_SERVICES.find((s) => s.code === clean) || BANGLADESH_DELIVERY_SERVICES[0];
}
function selectAutoBangladeshiDeliveryService(options) {
  const cleanPreferred = String(options.preferredServiceCode || "").trim().toLowerCase();
  if (cleanPreferred) {
    const matched = BANGLADESH_DELIVERY_SERVICES.find((s) => s.code === cleanPreferred);
    if (matched) return matched;
  }
  const targetMode = options.deliveryModeOverride || options.restaurantDeliveryMode || "third_party";
  if (targetMode === "third_party") {
    return options.pathaoEnabled === false ? getBangladeshDeliveryServiceMeta("steadfast") : getBangladeshDeliveryServiceMeta("pathao_food");
  }
  if (targetMode === "restaurant") {
    return getBangladeshDeliveryServiceMeta("restaurant_fleet");
  }
  return getBangladeshDeliveryServiceMeta("foodora_express");
}
var DELIVERY_VEHICLE_MODES = [
  {
    mode: "bicycle",
    labelEn: "Cycle",
    labelBn: "\u09B8\u09BE\u0987\u0995\u09C7\u09B2",
    googleTravelMode: "BICYCLING",
    osrmProfile: "cycling",
    avgSpeedKmh: 14.5,
    isBetaRoute: true
  },
  {
    mode: "motorbike",
    labelEn: "Motorbike",
    labelBn: "\u09AC\u09BE\u0987\u0995",
    googleTravelMode: "DRIVING",
    osrmProfile: "driving",
    avgSpeedKmh: 27,
    isBetaRoute: true
  },
  {
    mode: "auto",
    labelEn: "Auto / CNG",
    labelBn: "\u0985\u099F\u09CB / \u09B8\u09BF\u098F\u09A8\u099C\u09BF",
    googleTravelMode: "DRIVING",
    osrmProfile: "driving",
    avgSpeedKmh: 20,
    isBetaRoute: false
  },
  {
    mode: "car",
    labelEn: "Car",
    labelBn: "\u0997\u09BE\u09DC\u09BF",
    googleTravelMode: "DRIVING",
    osrmProfile: "driving",
    avgSpeedKmh: 26,
    isBetaRoute: false
  },
  {
    mode: "walking",
    labelEn: "Walk",
    labelBn: "\u09AA\u09BE\u09DF\u09C7 \u09B9\u09C7\u0981\u099F\u09C7",
    googleTravelMode: "WALKING",
    osrmProfile: "foot",
    avgSpeedKmh: 4.8,
    isBetaRoute: true
  }
];
function normalizeDeliveryVehicleMode(vehicleType) {
  const clean = String(vehicleType || "").trim().toLowerCase();
  if (!clean) return "motorbike";
  if (isBicycleVehicleType(clean)) return "bicycle";
  if (clean.includes("walk") || clean.includes("foot") || clean.includes("\u09AA\u09BE\u09DF\u09C7") || clean.includes("\u09B9\u09C7\u0981\u099F\u09C7")) {
    return "walking";
  }
  if (clean.includes("auto") || clean.includes("cng") || clean.includes("rickshaw") || clean.includes("easybike") || clean.includes("\u0985\u099F\u09CB") || clean.includes("\u09B8\u09BF\u098F\u09A8\u099C\u09BF") || clean.includes("\u09B0\u09BF\u0995\u09B6\u09BE")) {
    return "auto";
  }
  if (clean.includes("car") || clean.includes("sedan") || clean.includes("pickup") || clean.includes("van") || clean.includes("truck") || clean.includes("micro") || clean.includes("\u0997\u09BE\u09DC\u09BF") || clean.includes("\u0997\u09BE\u09A1\u09BC\u09BF") || clean.includes("\u0995\u09BE\u09B0")) {
    return "car";
  }
  return "motorbike";
}
function getDeliveryVehicleMeta(mode) {
  return DELIVERY_VEHICLE_MODES.find((m) => m.mode === mode) || DELIVERY_VEHICLE_MODES[1];
}
function computeVehicleAdjustedDurations(input) {
  const distM = Math.max(0, input.distanceMeters);
  const rawDur = Math.max(60, input.durationSeconds);
  const rawStatic = Math.max(60, input.staticDurationSeconds || rawDur);
  const rawDelay = Math.max(0, rawDur - rawStatic);
  if (input.vehicleMode === "bicycle") {
    const cycleEstimateSec = Math.max(120, Math.round(distM / 1e3 / 14.5 * 3600));
    const baseStatic = input.routeMatchesVehicle ? rawStatic : cycleEstimateSec;
    const baseDur = input.routeMatchesVehicle ? Math.max(rawDur, Math.round(baseStatic + rawDelay * 0.25)) : Math.round(cycleEstimateSec + rawDelay * 0.25);
    return { effectiveSec: baseDur, staticSec: baseStatic };
  }
  if (input.vehicleMode === "walking") {
    const walkEstimateSec = Math.max(120, Math.round(distM / 1e3 / 4.8 * 3600));
    const baseStatic = input.routeMatchesVehicle ? rawStatic : walkEstimateSec;
    return { effectiveSec: input.routeMatchesVehicle ? rawDur : walkEstimateSec, staticSec: baseStatic };
  }
  if (input.vehicleMode === "motorbike") {
    const motoOpenSec = Math.max(
      120,
      Math.min(rawStatic, Math.round(distM / 1e3 / 28 * 3600))
    );
    const filteredDelay = Math.round(rawDelay * 0.55);
    return { effectiveSec: motoOpenSec + filteredDelay, staticSec: motoOpenSec };
  }
  if (input.vehicleMode === "auto") {
    const autoOpenSec = Math.max(
      rawStatic,
      Math.round(distM / 1e3 / 20 * 3600)
    );
    const autoDelay = Math.round(rawDelay * 1.05);
    return { effectiveSec: autoOpenSec + autoDelay, staticSec: autoOpenSec };
  }
  return { effectiveSec: rawDur, staticSec: rawStatic };
}
function estimateDhakaPeakTrafficFactor(hour24) {
  const h = typeof hour24 === "number" && Number.isFinite(hour24) ? (Math.floor(hour24) % 24 + 24) % 24 : ((/* @__PURE__ */ new Date()).getUTCHours() + 6) % 24;
  if (h >= 8 && h <= 11 || h >= 17 && h <= 21) {
    return 1.38;
  }
  if (h >= 12 && h <= 16) {
    return 1.2;
  }
  return 1.06;
}
function summarizeTrafficCongestion(input) {
  const vehicleMode = input.vehicleMode || "car";
  const safeDistM = Number.isFinite(input.distanceMeters) && input.distanceMeters >= 0 ? input.distanceMeters : 0;
  const distanceKm = Math.round(safeDistM / 1e3 * 100) / 100;
  const rawStaticSec = typeof input.staticDurationSeconds === "number" && Number.isFinite(input.staticDurationSeconds) && input.staticDurationSeconds > 0 ? input.staticDurationSeconds : input.durationSeconds;
  const safeDurSec = Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? input.durationSeconds : Math.max(120, Math.round(distanceKm * 180));
  const safeStaticSec = Number.isFinite(rawStaticSec) && rawStaticSec > 0 ? rawStaticSec : safeDurSec;
  const speedSegments = {
    normalCount: 0,
    slowCount: 0,
    jamCount: 0
  };
  for (const rawSpeed of input.speedLevels || []) {
    const level = String(rawSpeed || "").toUpperCase();
    if (level === "TRAFFIC_JAM") speedSegments.jamCount += 1;
    else if (level === "SLOW") speedSegments.slowCount += 1;
    else if (level === "NORMAL") speedSegments.normalCount += 1;
  }
  let preVehicleDurSec = safeDurSec;
  if (input.source !== "google_routes" && Math.abs(safeDurSec - safeStaticSec) < 5 && distanceKm > 0.2) {
    const factor = typeof input.peakFactorOverride === "number" && input.peakFactorOverride >= 1 ? input.peakFactorOverride : estimateDhakaPeakTrafficFactor();
    preVehicleDurSec = Math.round(safeStaticSec * factor);
  }
  const adjusted = computeVehicleAdjustedDurations({
    vehicleMode,
    distanceMeters: safeDistM,
    durationSeconds: preVehicleDurSec,
    staticDurationSeconds: safeStaticSec,
    routeMatchesVehicle: input.routeMatchesVehicle ?? (vehicleMode !== "bicycle" && vehicleMode !== "walking")
  });
  const etaMinutes = Math.max(2, Math.round(adjusted.effectiveSec / 60));
  const staticMinutes = Math.max(2, Math.round(adjusted.staticSec / 60));
  const delayMinutes = Math.max(0, etaMinutes - staticMinutes);
  const ratio = adjusted.staticSec > 0 ? adjusted.effectiveSec / adjusted.staticSec : 1;
  let trafficSeverity = "clear";
  if (speedSegments.jamCount > 0 || delayMinutes >= 6 || ratio >= 1.35) {
    trafficSeverity = "heavy";
  } else if (speedSegments.slowCount > 0 || delayMinutes >= 2 || ratio >= 1.15) {
    trafficSeverity = "moderate";
  }
  const delayFormattedEn = delayMinutes > 0 ? formatDurationEstimate(delayMinutes, "en", "compact") : "";
  const delayFormattedBn = delayMinutes > 0 ? formatDurationEstimate(delayMinutes, "bn", "compact") : "";
  const delayTagEn = delayMinutes > 0 ? ` (+${delayFormattedEn} delay)` : "";
  const delayTagBn = delayMinutes > 0 ? ` (+${delayFormattedBn} \u09A6\u09C7\u09B0\u09BF)` : "";
  const trafficLabelEn = trafficSeverity === "heavy" ? `Heavy Jam${delayTagEn}` : trafficSeverity === "moderate" ? `Slow Traffic${delayTagEn}` : "Traffic Clear";
  const trafficLabelBn = trafficSeverity === "heavy" ? `\u09B0\u09BE\u09B8\u09CD\u09A4\u09BE\u09DF \u09AD\u09BE\u09B0\u09C0 \u099C\u09CD\u09AF\u09BE\u09AE${delayTagBn}` : trafficSeverity === "moderate" ? `\u09AE\u09BE\u099D\u09BE\u09B0\u09BF \u09AF\u09BE\u09A8\u099C\u099F${delayTagBn}` : "\u09AF\u09BE\u09A8\u099C\u099F \u09A8\u09C7\u0987 (\u09AB\u09BE\u0981\u0995\u09BE)";
  const jamAreasTextEn = speedSegments.jamCount > 0 || speedSegments.slowCount > 0 ? `${speedSegments.jamCount} jam segment(s) \xB7 ${speedSegments.slowCount} slow zone(s) \xB7 ${speedSegments.normalCount} clear` : trafficSeverity === "heavy" ? `Congestion detected along main intersections (${delayFormattedEn} slower than normal)` : trafficSeverity === "moderate" ? `Moderate urban traffic along route (${delayFormattedEn} slower)` : "Smooth traffic flow along the full delivery route";
  const jamAreasTextBn = speedSegments.jamCount > 0 || speedSegments.slowCount > 0 ? `${speedSegments.jamCount}\u099F\u09BF \u09AD\u09BE\u09B0\u09C0 \u099C\u09CD\u09AF\u09BE\u09AE \xB7 ${speedSegments.slowCount}\u099F\u09BF \u09A7\u09C0\u09B0\u0997\u09A4\u09BF \xB7 ${speedSegments.normalCount}\u099F\u09BF \u09AB\u09BE\u0981\u0995\u09BE \u0985\u0982\u09B6` : trafficSeverity === "heavy" ? `\u09AE\u09C2\u09B2 \u09AE\u09CB\u09DC\u09C7 \u09AF\u09BE\u09A8\u099C\u099F \u09B0\u09DF\u09C7\u099B\u09C7 (\u09B8\u09CD\u09AC\u09BE\u09AD\u09BE\u09AC\u09BF\u0995\u09C7\u09B0 \u099A\u09C7\u09DF\u09C7 ${delayFormattedBn} \u09AC\u09C7\u09B6\u09BF)` : trafficSeverity === "moderate" ? `\u09B0\u09BE\u09B8\u09CD\u09A4\u09BE\u09DF \u09AE\u09BE\u099D\u09BE\u09B0\u09BF \u09AF\u09BE\u09A8\u099C\u099F \u09B0\u09DF\u09C7\u099B\u09C7 (+${delayFormattedBn})` : "\u09B8\u09AE\u09CD\u09AA\u09C2\u09B0\u09CD\u09A3 \u09B0\u09C1\u099F\u09C7 \u099A\u09B2\u09BE\u099A\u09B2 \u09B8\u09CD\u09AC\u09BE\u09AD\u09BE\u09AC\u09BF\u0995 \u0993 \u09AF\u09BE\u09A8\u099C\u099F\u09AE\u09C1\u0995\u09CD\u09A4";
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
    steps: [...input.steps || []].slice(0, 12),
    speedSegments,
    source: input.source || "estimated"
  };
}
function buildOsrmDirectionInstruction(input) {
  const type = String(input.type || "").toLowerCase();
  const modifier = String(input.modifier || "").replace(/_/g, " ").trim();
  const road = String(input.roadName || "").trim();
  const onto = road ? ` onto ${road}` : "";
  const onRoad = road ? ` on ${road}` : "";
  if (type === "arrive") return "Arrive at destination";
  if (type === "depart") return `Head ${modifier || "straight"}${onRoad}`;
  if (type === "roundabout" || type === "rotary") {
    return `Enter roundabout and continue${onto}`;
  }
  if (type === "merge") return `Merge ${modifier || ""}${onto}`.replace(/\s+/g, " ").trim();
  if (type === "fork") return `Keep ${modifier || "straight"} at fork${onto}`;
  if (type === "end of road") return `At end of road, turn ${modifier || "ahead"}${onto}`;
  if (type === "turn" || type === "new name" || type === "continue") {
    if (modifier === "straight" || modifier === "") {
      return road ? `Continue onto ${road}` : "Continue straight";
    }
    return `Turn ${modifier}${onto}`;
  }
  return road ? `Follow ${road}` : "Continue along route";
}
var DHAKA_ZONE_PRESETS = [
  {
    code: "ZONE 01",
    name: "GULSHAN",
    nameBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8",
    label: "ZONE 01 \u2014 GULSHAN",
    defaultDeliveryFee: 60,
    keywords: ["gulshan", "niketan", "shahjadpur", "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8", "\u09A8\u09BF\u0995\u09C7\u09A4\u09A8", "\u09B6\u09BE\u09B9\u099C\u09BE\u09A6\u09AA\u09C1\u09B0", "zone 01"]
  },
  {
    code: "ZONE 02",
    name: "BANANI",
    nameBn: "\u09AC\u09A8\u09BE\u09A8\u09C0",
    label: "ZONE 02 \u2014 BANANI",
    defaultDeliveryFee: 60,
    keywords: ["banani", "kakoli", "chairman bari", "\u09AC\u09A8\u09BE\u09A8\u09C0", "\u0995\u09BE\u0995\u09B2\u09C0", "zone 02"]
  },
  {
    code: "ZONE 03",
    name: "DHANMONDI",
    nameBn: "\u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF",
    label: "ZONE 03 \u2014 DHANMONDI",
    defaultDeliveryFee: 60,
    keywords: ["dhanmondi", "satmasjid", "jigatola", "kalabagan", "\u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF", "\u099C\u09BF\u0997\u09BE\u09A4\u09B2\u09BE", "\u0995\u09B2\u09BE\u09AC\u09BE\u0997\u09BE\u09A8", "zone 03"]
  },
  {
    code: "ZONE 04",
    name: "MIRPUR",
    nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0",
    label: "ZONE 04 \u2014 MIRPUR",
    defaultDeliveryFee: 60,
    keywords: ["mirpur", "pallabi", "kazipara", "shewrapara", "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0", "\u09AA\u09B2\u09CD\u09B2\u09AC\u09C0", "\u0995\u09BE\u099C\u09C0\u09AA\u09BE\u09DC\u09BE", "zone 04"]
  },
  {
    code: "ZONE 05",
    name: "UTTARA",
    nameBn: "\u0989\u09A4\u09CD\u09A4\u09B0\u09BE",
    label: "ZONE 05 \u2014 UTTARA",
    defaultDeliveryFee: 65,
    keywords: ["uttara", "rajlaxmi", "jashimuddin", "abdullahpur", "\u0989\u09A4\u09CD\u09A4\u09B0\u09BE", "\u09B0\u09BE\u099C\u09B2\u0995\u09CD\u09B7\u09CD\u09AE\u09C0", "zone 05"]
  },
  {
    code: "ZONE 06",
    name: "MOHAMMADPUR",
    nameBn: "\u09AE\u09CB\u09B9\u09BE\u09AE\u09CD\u09AE\u09A6\u09AA\u09C1\u09B0",
    label: "ZONE 06 \u2014 MOHAMMADPUR",
    defaultDeliveryFee: 60,
    keywords: ["mohammadpur", "town hall", "bosila", "adabor", "shyamoli", "\u09AE\u09CB\u09B9\u09BE\u09AE\u09CD\u09AE\u09A6\u09AA\u09C1\u09B0", "\u0986\u09A6\u09BE\u09AC\u09B0", "\u09B6\u09CD\u09AF\u09BE\u09AE\u09B2\u09C0", "zone 06"]
  },
  {
    code: "ZONE 07",
    name: "BASHUNDHARA",
    nameBn: "\u09AC\u09B8\u09C1\u09A8\u09CD\u09A7\u09B0\u09BE",
    label: "ZONE 07 \u2014 BASHUNDHARA",
    defaultDeliveryFee: 65,
    keywords: ["bashundhara", "jamuna future", "kuril", "vatara", "\u09AC\u09B8\u09C1\u09A8\u09CD\u09A7\u09B0\u09BE", "\u0995\u09C1\u09DC\u09BF\u09B2", "\u09AD\u09BE\u099F\u09BE\u09B0\u09BE", "zone 07"]
  },
  {
    code: "ZONE 08",
    name: "BADDA",
    nameBn: "\u09AC\u09BE\u09A1\u09CD\u09A1\u09BE",
    label: "ZONE 08 \u2014 BADDA",
    defaultDeliveryFee: 60,
    keywords: ["badda", "merul", "rampura", "aftabnagar", "\u09AC\u09BE\u09A1\u09CD\u09A1\u09BE", "\u09B0\u09BE\u09AE\u09AA\u09C1\u09B0\u09BE", "\u0986\u09AB\u09A4\u09BE\u09AC\u09A8\u0997\u09B0", "zone 08"]
  },
  {
    code: "ZONE 09",
    name: "MOTIJHEEL",
    nameBn: "\u09AE\u09A4\u09BF\u099D\u09BF\u09B2",
    label: "ZONE 09 \u2014 MOTIJHEEL",
    defaultDeliveryFee: 60,
    keywords: ["motijheel", "paltan", "fakirapool", "arambagh", "kamalapur", "\u09AE\u09A4\u09BF\u099D\u09BF\u09B2", "\u09AA\u09B2\u09CD\u099F\u09A8", "\u0995\u09AE\u09B2\u09BE\u09AA\u09C1\u09B0", "zone 09"]
  },
  {
    code: "ZONE 10",
    name: "OLD DHAKA",
    nameBn: "\u09AA\u09C1\u09B0\u09BE\u09A8 \u09A2\u09BE\u0995\u09BE",
    label: "ZONE 10 \u2014 OLD DHAKA",
    defaultDeliveryFee: 60,
    keywords: ["old dhaka", "chawkbazar", "bangshal", "lalbagh", "wari", "sutrapur", "\u09AA\u09C1\u09B0\u09BE\u09A8 \u09A2\u09BE\u0995\u09BE", "\u099A\u0995\u09AC\u09BE\u099C\u09BE\u09B0", "\u09B2\u09BE\u09B2\u09AC\u09BE\u0997", "\u0993\u09DF\u09BE\u09B0\u09C0", "zone 10"]
  },
  {
    code: "ZONE 11",
    name: "TEJGAON / FARMGATE",
    nameBn: "\u09A4\u09C7\u099C\u0997\u09BE\u0981\u0993 / \u09AB\u09BE\u09B0\u09CD\u09AE\u0997\u09C7\u099F",
    label: "ZONE 11 \u2014 TEJGAON / FARMGATE",
    defaultDeliveryFee: 55,
    keywords: ["tejgaon", "farmgate", "karwan", "kawran", "\u09A4\u09C7\u099C\u0997\u09BE\u0981\u0993", "\u09AB\u09BE\u09B0\u09CD\u09AE\u0997\u09C7\u099F", "\u0995\u09BE\u09B0\u0993\u09DF\u09BE\u09A8", "zone 11"]
  },
  {
    code: "ZONE 12",
    name: "KHILGAON",
    nameBn: "\u0996\u09BF\u09B2\u0997\u09BE\u0981\u0993",
    label: "ZONE 12 \u2014 KHILGAON",
    defaultDeliveryFee: 60,
    keywords: ["khilgaon", "taltola", "malibagh", "goran", "\u0996\u09BF\u09B2\u0997\u09BE\u0981\u0993", "\u09AE\u09BE\u09B2\u09BF\u09AC\u09BE\u0997", "\u0997\u09CB\u09B0\u09BE\u09A8", "zone 12"]
  }
];
var DEFAULT_DELIVERY_FINANCIAL_CONFIG = {
  paymentModel: "online_food_cash_delivery",
  zoneFees: Object.fromEntries(DHAKA_ZONE_PRESETS.map((z2) => [z2.code, z2.defaultDeliveryFee])),
  distancePricing: {
    enabled: true,
    baseDistanceKm: 3,
    baseFee: 60,
    perKmFee: 10,
    minFee: 40,
    maxFee: 180
  },
  riderEarningRule: {
    mode: "percentage",
    value: 75
    // ৳45 on ৳60 delivery charge; ৳15 Foodora platform commission
  },
  settlementRules: {
    maxOutstandingLimit: 500,
    autoBlockDispatchAboveLimit: true,
    requireCashConfirmation: true,
    settlementCycleLabel: "Daily / When Outstanding Reaches Cap",
    settlementInstructions: "Collect the delivery charge directly in cash from customers on delivery. Settle Foodora commission balance via Cash / bKash / Nagad to Admin when due. No automated payout for rider-collected cash."
  }
};
function mergeDeliveryFinancialConfig(raw) {
  const input = raw || {};
  const rawZoneFees = input.zoneFees || {};
  const mergedZoneFees = { ...DEFAULT_DELIVERY_FINANCIAL_CONFIG.zoneFees };
  for (const preset of DHAKA_ZONE_PRESETS) {
    const val = Number(rawZoneFees[preset.code]);
    if (Number.isFinite(val) && val >= 0 && val <= 1e3) {
      mergedZoneFees[preset.code] = Math.round(val);
    }
  }
  const dp = input.distancePricing || {};
  const re = input.riderEarningRule || {};
  const sr = input.settlementRules || {};
  const mode = re.mode === "fixed" ? "fixed" : "percentage";
  const rawVal = Number(re.value);
  const clampedValue = Number.isFinite(rawVal) ? mode === "percentage" ? Math.max(0, Math.min(100, Math.round(rawVal))) : Math.max(0, Math.round(rawVal)) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.riderEarningRule.value;
  return {
    paymentModel: "online_food_cash_delivery",
    zoneFees: mergedZoneFees,
    distancePricing: {
      enabled: typeof dp.enabled === "boolean" ? dp.enabled : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.enabled,
      baseDistanceKm: typeof dp.baseDistanceKm === "number" && Number.isFinite(dp.baseDistanceKm) && dp.baseDistanceKm >= 0 ? Math.min(30, dp.baseDistanceKm) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.baseDistanceKm,
      baseFee: typeof dp.baseFee === "number" && Number.isFinite(dp.baseFee) && dp.baseFee >= 0 ? Math.round(dp.baseFee) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.baseFee,
      perKmFee: typeof dp.perKmFee === "number" && Number.isFinite(dp.perKmFee) && dp.perKmFee >= 0 ? Math.round(dp.perKmFee) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.perKmFee,
      minFee: typeof dp.minFee === "number" && Number.isFinite(dp.minFee) && dp.minFee >= 0 ? Math.round(dp.minFee) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.minFee,
      maxFee: typeof dp.maxFee === "number" && Number.isFinite(dp.maxFee) && dp.maxFee >= 10 ? Math.round(dp.maxFee) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.distancePricing.maxFee
    },
    riderEarningRule: {
      mode,
      value: clampedValue
    },
    settlementRules: {
      maxOutstandingLimit: typeof sr.maxOutstandingLimit === "number" && Number.isFinite(sr.maxOutstandingLimit) && sr.maxOutstandingLimit >= 50 ? Math.round(sr.maxOutstandingLimit) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.maxOutstandingLimit,
      autoBlockDispatchAboveLimit: typeof sr.autoBlockDispatchAboveLimit === "boolean" ? sr.autoBlockDispatchAboveLimit : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.autoBlockDispatchAboveLimit,
      requireCashConfirmation: typeof sr.requireCashConfirmation === "boolean" ? sr.requireCashConfirmation : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.requireCashConfirmation,
      settlementCycleLabel: typeof sr.settlementCycleLabel === "string" && sr.settlementCycleLabel.trim() ? sr.settlementCycleLabel.trim().slice(0, 120) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.settlementCycleLabel,
      settlementInstructions: typeof sr.settlementInstructions === "string" && sr.settlementInstructions.trim() ? sr.settlementInstructions.trim().slice(0, 500) : DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules.settlementInstructions
    }
  };
}
function matchDhakaDeliveryZone(areaOrZoneText) {
  const clean = String(areaOrZoneText || "").trim().toLowerCase();
  if (!clean) return null;
  for (const preset of DHAKA_ZONE_PRESETS) {
    if (clean === preset.code.toLowerCase() || clean === preset.name.toLowerCase() || clean === preset.label.toLowerCase() || preset.keywords.some((kw) => clean.includes(kw))) {
      return preset;
    }
  }
  return null;
}
function calculateZoneDistanceDeliveryFee(input) {
  const cfg = mergeDeliveryFinancialConfig(input.config);
  const matchedZone = matchDhakaDeliveryZone(input.area);
  const zoneBaseFee = matchedZone ? cfg.zoneFees[matchedZone.code] ?? matchedZone.defaultDeliveryFee : void 0;
  const distKm = typeof input.distanceKm === "number" && Number.isFinite(input.distanceKm) && input.distanceKm >= 0 ? input.distanceKm : null;
  const base = zoneBaseFee ?? cfg.distancePricing.baseFee ?? Math.max(0, Math.round(input.fallbackFee ?? 60));
  if (cfg.distancePricing.enabled && distKm !== null) {
    const extraKm = Math.max(0, distKm - cfg.distancePricing.baseDistanceKm);
    const rawFee = Math.round(base + extraKm * cfg.distancePricing.perKmFee);
    const clamped = Math.max(cfg.distancePricing.minFee, Math.min(cfg.distancePricing.maxFee, rawFee));
    return {
      deliveryFee: clamped,
      zoneCode: matchedZone?.code || null,
      zoneName: matchedZone?.name || null,
      pricingSource: matchedZone ? "zone_plus_distance" : "distance_rule"
    };
  }
  if (zoneBaseFee !== void 0) {
    return {
      deliveryFee: Math.max(0, Math.round(zoneBaseFee)),
      zoneCode: matchedZone?.code || null,
      zoneName: matchedZone?.name || null,
      pricingSource: "zone_base"
    };
  }
  const fb = typeof input.fallbackFee === "number" && Number.isFinite(input.fallbackFee) ? Math.max(0, Math.round(input.fallbackFee)) : cfg.distancePricing.baseFee;
  return {
    deliveryFee: fb,
    zoneCode: null,
    zoneName: null,
    pricingSource: "fallback"
  };
}
function calculateSplitOrderFinancials(params) {
  const base = calculateOrderFinancials(params);
  const method = String(params.paymentMethod || "bkash").trim().toLowerCase();
  const isLegacyCod = method === "cod";
  const rule = params.riderEarningRule || DEFAULT_DELIVERY_FINANCIAL_CONFIG.riderEarningRule;
  let riderEarningAmount = 0;
  let foodoraDeliveryCommission = 0;
  if (base.deliveryFee > 0) {
    if (rule.mode === "fixed") {
      riderEarningAmount = Math.min(base.deliveryFee, Math.max(0, Math.round(rule.value)));
    } else {
      const pct = Math.max(0, Math.min(100, Number(rule.value) || 0));
      riderEarningAmount = Math.min(base.deliveryFee, Math.round(base.deliveryFee * pct / 100));
    }
    foodoraDeliveryCommission = Math.max(0, base.deliveryFee - riderEarningAmount);
  }
  if (isLegacyCod) {
    return {
      ...base,
      paymentSplitMode: "legacy_cod",
      onlineFoodPayable: 0,
      cashDueToRider: base.totalPayable,
      customerTotalCost: base.totalPayable,
      riderEarningAmount,
      foodoraDeliveryCommission
    };
  }
  const onlineFoodPayable = base.netFoodRevenue + base.serviceFee + base.taxAmount;
  const cashDueToRider = base.deliveryFee;
  const customerTotalCost = onlineFoodPayable + cashDueToRider;
  return {
    ...base,
    paymentSplitMode: "online_food_cash_delivery",
    onlineFoodPayable,
    cashDueToRider,
    customerTotalCost,
    riderEarningAmount,
    foodoraDeliveryCommission
  };
}
function canVendorProcessPrepaidOrder(order) {
  const next = String(order.nextStatus || "").trim().toLowerCase();
  if (next === "cancelled") {
    return { allowed: true };
  }
  const method = String(order.paymentMethod || "").trim().toLowerCase();
  const pStatus = String(order.paymentStatus || "").trim().toLowerCase();
  if (method !== "cod" && pStatus !== "paid") {
    return {
      allowed: false,
      reason: "Online food payment must be verified before the restaurant or rider can process this order."
    };
  }
  return { allowed: true };
}
function summarizeRiderWalletLedger(entries) {
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
    if (e.entryType === "delivery_earning") {
      deliveredCountFromLedger += 1;
    } else if (e.entryType === "commission_reversal") {
      deliveredCountFromLedger = Math.max(0, deliveredCountFromLedger - 1);
    }
  }
  return {
    totalCashCollected: Math.max(0, Math.round(totalCashCollected)),
    totalRiderEarnings: Math.max(0, Math.round(totalRiderEarnings)),
    totalCommissionOwed: Math.max(0, Math.round(totalCommissionOwed)),
    totalCommissionSettled: Math.max(0, Math.round(totalCommissionSettled)),
    outstandingCommission: Math.max(0, Math.round(totalCommissionOwed - totalCommissionSettled)),
    deliveredCountFromLedger
  };
}
function canRiderAcceptOrders(input) {
  const status = String(input.riderStatus || "").trim().toLowerCase();
  if (status !== "approved") {
    return {
      allowed: false,
      reason: status === "suspended" ? "Your rider account is currently suspended. Contact Foodora Admin." : "Your rider application is pending Admin approval for your Dhaka zone."
    };
  }
  const rules = input.settlementRules || DEFAULT_DELIVERY_FINANCIAL_CONFIG.settlementRules;
  const outstanding = Math.max(0, Math.round(input.outstandingCommission || 0));
  if (rules.autoBlockDispatchAboveLimit && outstanding > rules.maxOutstandingLimit) {
    return {
      allowed: false,
      reason: `Outstanding Foodora commission (\u09F3${outstanding}) exceeds limit (\u09F3${rules.maxOutstandingLimit}). Please settle commission with Admin to unlock new deliveries.`
    };
  }
  return { allowed: true };
}
function summarizeDhakaZoneRiderCoverage(ridersList, config) {
  const merged = mergeDeliveryFinancialConfig(config);
  const buckets = /* @__PURE__ */ new Map();
  for (const preset of DHAKA_ZONE_PRESETS) {
    buckets.set(preset.code, { approved: 0, online: 0, pending: 0, suspended: 0 });
  }
  for (const rider of ridersList) {
    const matched = matchDhakaDeliveryZone(rider.zone);
    if (!matched) continue;
    const bucket = buckets.get(matched.code);
    if (!bucket) continue;
    const status = String(rider.status || "").trim().toLowerCase();
    if (status === "approved") {
      bucket.approved += 1;
      if (rider.isAvailable) bucket.online += 1;
    } else if (status === "pending") {
      bucket.pending += 1;
    } else if (status === "suspended") {
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
      hasActiveCoverage: bucket.online > 0 || bucket.approved > 0
    };
  });
}

// src/db/queries.ts
async function getApprovedRestaurants() {
  try {
    return await db.select().from(restaurants).where(eq(restaurants.status, "approved")).orderBy(desc(restaurants.isSponsored), desc(restaurants.rating));
  } catch (error) {
    console.error("Failed to load approved restaurants:", error);
    throw new Error("Failed to load restaurants", { cause: error });
  }
}
async function getStorefrontProducts() {
  try {
    const rows = await db.select({
      id: foodItems.id,
      restaurantId: foodItems.restaurantId,
      category: foodItems.category,
      name: foodItems.name,
      nameBn: foodItems.nameBn,
      description: foodItems.description,
      imageUrl: foodItems.imageUrl,
      price: foodItems.price,
      discountPrice: foodItems.discountPrice,
      variationsJson: foodItems.variationsJson,
      addonsJson: foodItems.addonsJson,
      inStock: foodItems.inStock,
      isAvailable: foodItems.isAvailable,
      isPopular: foodItems.isPopular,
      isVisibleOnStorefront: foodItems.isVisibleOnStorefront,
      restaurantName: restaurants.name,
      restaurantNameBn: restaurants.nameBn,
      restaurantSlug: restaurants.slug,
      restaurantLogoUrl: restaurants.logoUrl,
      restaurantCoverUrl: restaurants.coverUrl,
      restaurantArea: restaurants.area,
      restaurantCuisine: restaurants.cuisine,
      deliveryTimeMin: restaurants.deliveryTimeMin,
      deliveryFee: restaurants.deliveryFee,
      deliveryMode: restaurants.deliveryMode,
      minOrder: restaurants.minOrder,
      rating: restaurants.rating,
      isOpen: restaurants.isOpen
    }).from(foodItems).innerJoin(restaurants, eq(foodItems.restaurantId, restaurants.id)).where(
      and(
        eq(restaurants.status, "approved"),
        eq(foodItems.isVisibleOnStorefront, true),
        eq(foodItems.isAvailable, true)
      )
    ).orderBy(desc(foodItems.isPopular), desc(foodItems.inStock), desc(foodItems.id));
    return rows;
  } catch (error) {
    console.error("Failed to load storefront products:", error);
    throw new Error("Failed to load storefront products", { cause: error });
  }
}
async function getRestaurantBySlug(slug) {
  try {
    const rows = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
    if (rows.length === 0) return null;
    const restaurant = rows[0];
    const items = await db.select().from(foodItems).where(
      and(
        eq(foodItems.restaurantId, restaurant.id),
        eq(foodItems.isVisibleOnStorefront, true)
      )
    );
    const restaurantReviews = await db.select().from(reviews).where(eq(reviews.restaurantId, restaurant.id)).orderBy(desc(reviews.createdAt));
    return { restaurant, items, reviews: restaurantReviews };
  } catch (error) {
    console.error("Failed to load restaurant detail:", error);
    throw new Error("Failed to load restaurant details", { cause: error });
  }
}
async function getActiveCoupons() {
  try {
    return await db.select().from(coupons).where(eq(coupons.isActive, true));
  } catch (error) {
    console.error("Failed to load coupons:", error);
    throw new Error("Failed to load coupons", { cause: error });
  }
}
async function getCustomerAddresses(userUid) {
  try {
    return await db.select().from(customerAddresses).where(eq(customerAddresses.userUid, userUid)).orderBy(desc(customerAddresses.isDefault));
  } catch (error) {
    console.error("Failed to load addresses:", error);
    throw new Error("Failed to load saved addresses", { cause: error });
  }
}
async function getCustomerOrders(customerUid) {
  try {
    return await db.select().from(orders).where(eq(orders.customerUid, customerUid)).orderBy(desc(orders.createdAt));
  } catch (error) {
    console.error("Failed to load customer orders:", error);
    throw new Error("Failed to load customer orders", { cause: error });
  }
}
async function getOrderById(orderId) {
  try {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (rows.length === 0) return null;
    const order = rows[0];
    const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(orderStatusHistory.createdAt);
    const restRows = await db.select().from(restaurants).where(eq(restaurants.id, order.restaurantId)).limit(1);
    let riderLocation = null;
    if (order.riderUid) {
      const riderRows = await db.select().from(riders).where(eq(riders.uid, order.riderUid)).limit(1);
      if (riderRows.length > 0) {
        const r = riderRows[0];
        riderLocation = {
          uid: r.uid,
          fullName: r.fullName,
          phone: r.phone,
          vehicleType: r.vehicleType,
          zone: r.zone,
          isAvailable: r.isAvailable,
          lat: r.currentLat,
          lng: r.currentLng,
          locationUpdatedAt: r.locationUpdatedAt
        };
      }
    }
    let nearestRider = null;
    if (!riderLocation && order.deliveryMode === "platform" && order.status !== "delivered" && order.status !== "cancelled") {
      const rest = restRows[0];
      const targetLat = rest ? rest.lat : order.deliveryLat;
      const targetLng = rest ? rest.lng : order.deliveryLng;
      const approvedRiders = await db.select().from(riders).where(eq(riders.status, "approved"));
      const picked = pickNearestStandbyRider(
        approvedRiders.map((r) => ({
          uid: r.uid,
          fullName: r.fullName,
          phone: r.phone,
          vehicleType: r.vehicleType,
          zone: r.zone,
          isAvailable: r.isAvailable,
          lat: r.currentLat,
          lng: r.currentLng,
          locationUpdatedAt: r.locationUpdatedAt
        })),
        targetLat,
        targetLng
      );
      if (picked) {
        nearestRider = {
          ...picked.rider,
          distanceToRestaurantKm: picked.distanceKm
        };
      }
    }
    const [emailLogs, transactions, settings] = await Promise.all([
      db.select().from(orderEmailLogs).where(eq(orderEmailLogs.orderId, orderId)).orderBy(desc(orderEmailLogs.sentAt)),
      db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).orderBy(asc(paymentTransactions.id)),
      getPlatformSettingsRow()
    ]);
    return {
      order,
      history,
      restaurant: restRows[0] ?? null,
      riderLocation,
      nearestRider,
      emailLogs,
      transactions,
      deliveryFinancialConfig: mergeDeliveryFinancialConfig(
        settings?.deliveryFinancialConfig || null
      )
    };
  } catch (error) {
    console.error("Failed to fetch order detail:", error);
    throw new Error("Failed to fetch order details", { cause: error });
  }
}
async function getPlatformSettingsRow() {
  try {
    const rows = await withDbRetry(() => db.select().from(platformSettings).limit(1));
    return rows[0] ?? null;
  } catch (error) {
    console.error("Failed to fetch platform settings:", error);
    return null;
  }
}
async function ensureDefaultPaymentGateways() {
  try {
    const existing = await withDbRetry(
      () => db.select().from(paymentGateways).orderBy(asc(paymentGateways.sortOrder), asc(paymentGateways.id))
    );
    if (existing.length === 0) {
      const settings = await getPlatformSettingsRow();
      const seedRows = DEFAULT_PAYMENT_GATEWAYS.map((gw) => {
        if (gw.code === "bkash" && settings) {
          return {
            ...gw,
            isActive: settings.bkashEnabled,
            mode: settings.bkashSandbox ? "sandbox" : "live"
          };
        }
        if (gw.code === "sslcommerz" && settings) {
          return {
            ...gw,
            isActive: settings.sslcommerzEnabled,
            mode: settings.sslcommerzSandbox ? "sandbox" : "live"
          };
        }
        return gw;
      });
      await db.insert(paymentGateways).values(seedRows).onConflictDoNothing();
      return await db.select().from(paymentGateways).orderBy(asc(paymentGateways.sortOrder), asc(paymentGateways.id));
    }
    return existing;
  } catch (error) {
    console.error("Failed to load payment gateways:", error);
    return DEFAULT_PAYMENT_GATEWAYS.map((gw, idx) => ({
      id: idx + 1,
      ...gw,
      merchantId: "",
      apiKey: "",
      apiSecret: "",
      webhookSecret: "",
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }));
  }
}
async function ensureDefaultAiProviders() {
  try {
    let existing = await withDbRetry(
      () => db.select().from(aiProviders).orderBy(asc(aiProviders.sortOrder), asc(aiProviders.id))
    );
    const existingCodes = new Set(existing.map((row) => row.code));
    const hasAnyDefault = existing.some((row) => row.isDefault);
    const missingDefaults = DEFAULT_AI_PROVIDERS.filter((p) => !existingCodes.has(p.code));
    if (missingDefaults.length > 0) {
      await db.insert(aiProviders).values(
        missingDefaults.map((p) => ({
          ...p,
          isDefault: existing.length === 0 ? p.isDefault : !hasAnyDefault && p.code === "foodora",
          apiKey: ""
        }))
      ).onConflictDoNothing();
      existing = await db.select().from(aiProviders).orderBy(asc(aiProviders.sortOrder), asc(aiProviders.id));
    }
    return existing;
  } catch (error) {
    console.error("Failed to load AI providers:", error);
    return DEFAULT_AI_PROVIDERS.map((p, idx) => ({
      id: idx + 1,
      ...p,
      apiKey: "",
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }));
  }
}
async function getVendorWorkspace(ownerUid, isSuperAdmin, requestedRestaurantId) {
  try {
    const rawList = isSuperAdmin ? await db.select().from(restaurants).orderBy(restaurants.id) : await db.select().from(restaurants).where(eq(restaurants.ownerUid, ownerUid)).orderBy(restaurants.id);
    const partitioned = partitionOwnedVsPartnerRestaurants(rawList, ownerUid);
    const owned = partitioned.ordered;
    const isAllRestaurants = requestedRestaurantId === -1;
    const requestedMatch = !isAllRestaurants && requestedRestaurantId && Number.isInteger(requestedRestaurantId) ? owned.find((r) => r.id === requestedRestaurantId) ?? null : null;
    const target = requestedMatch ?? owned[0] ?? null;
    if (!target) {
      return {
        restaurant: null,
        restaurants: owned,
        ownRestaurantIds: partitioned.own.map((r) => r.id),
        menuItems: [],
        orders: [],
        ledger: [],
        payouts: [],
        riderJobs: [],
        riderJobApplications: [],
        unreadMessageCount: 0
      };
    }
    const restaurantIdsToQuery = isAllRestaurants ? owned.map((r) => r.id) : [target.id];
    const restaurantNameMap = new Map(owned.map((r) => [r.id, r.name]));
    const rawMenuItems = restaurantIdsToQuery.length > 0 ? await db.select().from(foodItems).where(inArray(foodItems.restaurantId, restaurantIdsToQuery)).orderBy(desc(foodItems.id)) : [];
    const menuItems = rawMenuItems.map((item) => ({
      ...item,
      restaurantName: restaurantNameMap.get(item.restaurantId) || target.name
    }));
    const restOrders = restaurantIdsToQuery.length > 0 ? await db.select().from(orders).where(inArray(orders.restaurantId, restaurantIdsToQuery)).orderBy(desc(orders.createdAt)) : [];
    const [ledger, payouts, jobs, applications, unreadRows] = await Promise.all([
      restaurantIdsToQuery.length > 0 ? db.select().from(commissionLedger).where(inArray(commissionLedger.restaurantId, restaurantIdsToQuery)).orderBy(desc(commissionLedger.createdAt)) : Promise.resolve([]),
      restaurantIdsToQuery.length > 0 ? db.select().from(restaurantPayouts).where(inArray(restaurantPayouts.restaurantId, restaurantIdsToQuery)).orderBy(desc(restaurantPayouts.requestedAt)) : Promise.resolve([]),
      restaurantIdsToQuery.length > 0 ? db.select().from(riderJobs).where(inArray(riderJobs.restaurantId, restaurantIdsToQuery)).orderBy(desc(riderJobs.createdAt)) : Promise.resolve([]),
      restaurantIdsToQuery.length > 0 ? db.select().from(riderJobApplications).where(inArray(riderJobApplications.restaurantId, restaurantIdsToQuery)).orderBy(desc(riderJobApplications.createdAt)) : Promise.resolve([]),
      restaurantIdsToQuery.length > 0 ? db.select({ id: vendorAdminMessages.id }).from(vendorAdminMessages).where(
        and(
          inArray(vendorAdminMessages.restaurantId, restaurantIdsToQuery),
          eq(vendorAdminMessages.isReadByVendor, false)
        )
      ) : Promise.resolve([])
    ]);
    return {
      restaurant: target,
      restaurants: owned,
      ownRestaurantIds: partitioned.own.map((r) => r.id),
      menuItems,
      orders: restOrders,
      ledger,
      payouts,
      riderJobs: jobs,
      riderJobApplications: applications,
      unreadMessageCount: unreadRows.length
    };
  } catch (error) {
    console.error("Failed to fetch vendor workspace:", error);
    throw new Error("Failed to load restaurant dashboard", { cause: error });
  }
}
async function getRiderWorkspace(riderUid) {
  try {
    const [riderRows, userRows, allOrders, allRestaurants, walletEntries, settings, allRiders] = await Promise.all([
      db.select().from(riders).where(eq(riders.uid, riderUid)).limit(1),
      db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.uid, riderUid)).limit(1),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select({
        id: restaurants.id,
        name: restaurants.name,
        lat: restaurants.lat,
        lng: restaurants.lng,
        address: restaurants.address,
        phone: restaurants.phone
      }).from(restaurants),
      db.select().from(riderWalletLedger).where(eq(riderWalletLedger.riderUid, riderUid)).orderBy(desc(riderWalletLedger.createdAt)),
      getPlatformSettingsRow(),
      db.select().from(riders)
    ]);
    const restCoordMap = new Map(
      allRestaurants.map((r) => [
        r.id,
        { name: r.name, lat: r.lat, lng: r.lng, address: r.address, phone: r.phone }
      ])
    );
    const withRestCoords = allOrders.map((o) => {
      const coords = restCoordMap.get(o.restaurantId);
      return {
        ...o,
        restaurantLat: coords?.lat,
        restaurantLng: coords?.lng,
        restaurantAddress: coords?.address || "",
        restaurantPhone: coords?.phone || ""
      };
    });
    const baseRider = riderRows[0] ?? null;
    const isApprovedRider = baseRider?.status === "approved";
    const availableOrders = isApprovedRider ? withRestCoords.filter(
      (o) => o.deliveryMode === "platform" && !o.riderUid && ["accepted", "preparing", "ready"].includes(o.status) && (o.paymentMethod === "cod" || o.paymentStatus === "paid")
    ) : [];
    const assignedOrders = withRestCoords.filter((o) => o.riderUid === riderUid);
    const walletSummary = summarizeRiderWalletLedger(walletEntries);
    const financialConfig = mergeDeliveryFinancialConfig(
      settings?.deliveryFinancialConfig || null
    );
    const zoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, financialConfig);
    const enrichedRider = baseRider ? {
      ...baseRider,
      avatarUrl: userRows[0]?.avatarUrl || "",
      restaurantName: baseRider.restaurantId ? restCoordMap.get(baseRider.restaurantId)?.name || null : null,
      walletSummary
    } : null;
    return {
      rider: enrichedRider,
      availableOrders,
      assignedOrders,
      walletSummary,
      walletLedger: walletEntries,
      settlementRules: financialConfig.settlementRules,
      deliveryFinancialConfig: financialConfig,
      zoneCoverage
    };
  } catch (error) {
    console.error("Failed to load rider workspace:", error);
    throw new Error("Failed to load rider dashboard", { cause: error });
  }
}
async function getAdminWorkspace() {
  try {
    const [
      allRestaurants,
      allProducts,
      allOrders,
      allUsers,
      allLedger,
      allPayouts,
      allCoupons,
      allRiders,
      recentAuditLogs,
      settings,
      adminPinCreds,
      allTransactions,
      allWalletLedger
    ] = await Promise.all([
      db.select().from(restaurants).orderBy(desc(restaurants.createdAt)),
      db.select().from(foodItems).orderBy(desc(foodItems.id)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(commissionLedger).orderBy(desc(commissionLedger.createdAt)),
      db.select().from(restaurantPayouts).orderBy(desc(restaurantPayouts.requestedAt)),
      db.select().from(coupons).orderBy(desc(coupons.createdAt)),
      db.select().from(riders).orderBy(desc(riders.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60),
      getPlatformSettingsRow(),
      db.select({ email: localCredentials.email }).from(localCredentials).where(like(localCredentials.email, "__admin_pin__:%")),
      db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(250),
      db.select().from(riderWalletLedger).orderBy(desc(riderWalletLedger.createdAt)).limit(300)
    ]);
    const adminPinEmailSet = new Set(PROTECTED_SUPER_ADMIN_EMAILS);
    for (const row of adminPinCreds) {
      const stripped = row.email.replace(/^__admin_pin__:/, "").trim().toLowerCase();
      if (stripped) adminPinEmailSet.add(stripped);
    }
    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      settings?.deliveryFinancialConfig || null
    );
    const ledgerByRider = /* @__PURE__ */ new Map();
    for (const entry of allWalletLedger) {
      const list = ledgerByRider.get(entry.riderUid) || [];
      list.push(entry);
      ledgerByRider.set(entry.riderUid, list);
    }
    const enrichedRiders = allRiders.map((r) => ({
      ...r,
      walletSummary: summarizeRiderWalletLedger(ledgerByRider.get(r.uid) || [])
    }));
    const dhakaZoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, deliveryFinancialConfig);
    return {
      restaurants: allRestaurants,
      products: allProducts,
      orders: allOrders,
      users: allUsers,
      ledger: allLedger,
      payouts: allPayouts,
      coupons: allCoupons,
      riders: enrichedRiders,
      auditLogs: recentAuditLogs,
      settings,
      adminPinEmails: Array.from(adminPinEmailSet),
      deliveryFinancialConfig,
      dhakaZoneCoverage,
      paymentTransactions: allTransactions,
      riderWalletLedger: allWalletLedger
    };
  } catch (error) {
    console.error("Failed to load admin workspace:", error);
    throw new Error("Failed to load admin dashboard", { cause: error });
  }
}
async function getNotificationsForUser(uid, role) {
  try {
    const cleanUid = String(uid || "").trim();
    const cleanRole = String(role || "customer").trim();
    if (!cleanUid) return [];
    const isAdmin = cleanRole === "admin" || cleanRole === "super_admin";
    const roleBroadcastUid = `role-${cleanRole}`;
    const roleCondition = isAdmin ? or(
      eq(notifications.recipientUid, cleanUid),
      eq(notifications.recipientUid, "broadcast-all"),
      eq(notifications.recipientUid, roleBroadcastUid),
      eq(notifications.recipientUid, "role-admin"),
      eq(notifications.recipientUid, "role-super_admin"),
      eq(notifications.recipientUid, "demo-admin-uid")
    ) : or(
      eq(notifications.recipientUid, cleanUid),
      eq(notifications.recipientUid, "broadcast-all"),
      eq(notifications.recipientUid, roleBroadcastUid)
    );
    return await db.select().from(notifications).where(roleCondition).orderBy(desc(notifications.createdAt)).limit(25);
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return [];
  }
}
async function getCustomerFavorites(customerUid) {
  try {
    return await db.select().from(favorites).where(eq(favorites.customerUid, customerUid));
  } catch (error) {
    console.error("Failed to fetch favorites:", error);
    return [];
  }
}
async function toggleCustomerFavorite(customerUid, restaurantId) {
  try {
    const existing = await db.select().from(favorites).where(and(eq(favorites.customerUid, customerUid), eq(favorites.restaurantId, restaurantId)));
    if (existing.length > 0) {
      await db.delete(favorites).where(and(eq(favorites.customerUid, customerUid), eq(favorites.restaurantId, restaurantId)));
      return { favorited: false };
    }
    await db.insert(favorites).values({ customerUid, restaurantId });
    return { favorited: true };
  } catch (error) {
    console.error("Failed to toggle favorite:", error);
    throw new Error("Failed to update favorite", { cause: error });
  }
}

// src/middleware/auth.ts
import crypto from "node:crypto";
import { eq as eq2, sql as sql2 } from "drizzle-orm";

// src/lib/supabase-admin.ts
import { createClient } from "@supabase/supabase-js";
var SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://uvqptlflvdtxbrqiztzi.supabase.co";
var SUPABASE_AUTH_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cXB0bGZsdmR0eGJycWl6dHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5Mjk4NjksImV4cCI6MjExMDUwNTg2OX0.4NdWe8fXBv6qE_sVvUZhofFW5CVQJAY_X1IvkwB69ZE";
var supabaseServer = createClient(SUPABASE_URL, SUPABASE_AUTH_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
async function verifySupabaseAccessToken(token) {
  if (!token || token.startsWith("sbx.") || token.startsWith("fbd.")) return null;
  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user) {
      return null;
    }
    const supaUser = data.user;
    const email = supaUser.email || `${supaUser.id}@foodora.bd`;
    const meta = supaUser.user_metadata || {};
    const fullName = typeof meta.full_name === "string" && meta.full_name.trim() || typeof meta.name === "string" && meta.name.trim() || email.split("@")[0] || "Foodora User";
    return {
      uid: supaUser.id,
      email,
      fullName
    };
  } catch (err) {
    console.warn("Supabase token verification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// src/middleware/auth.ts
var SANDBOX_SECRET = process.env.SANDBOX_SESSION_SECRET || `foodora-bd-sandbox-${process.env.SQL_DB_NAME || "dev"}-${process.env.APPLET_ID || "local"}`;
function signSandboxToken(payload) {
  const isSandbox = payload.isSandbox ?? true;
  const data = Buffer.from(
    JSON.stringify({
      ...payload,
      isSandbox,
      exp: Date.now() + 1e3 * 60 * 60 * 24 * 7
    })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SANDBOX_SECRET).update(data).digest("base64url");
  return `${isSandbox ? "sbx" : "fbd"}.${data}.${sig}`;
}
function verifySandboxToken(token) {
  if (!token.startsWith("sbx.") && !token.startsWith("fbd.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, data, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", SANDBOX_SECRET).update(data).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    const isSandbox = token.startsWith("sbx.") && Boolean(parsed.isSandbox ?? true);
    return {
      uid: parsed.uid,
      email: parsed.email,
      fullName: parsed.fullName,
      role: parsed.role,
      isSandbox
    };
  } catch {
    return null;
  }
}
async function getOrCreateUser(uid, email, fullName, defaultRole = "customer") {
  const emailLower = email.trim().toLowerCase();
  const isPrimaryAdmin = isProtectedSuperAdminEmail(emailLower);
  try {
    return await withDbRetry(async () => {
      const existing = await db.select().from(users).where(eq2(users.uid, uid)).limit(1);
      if (existing.length > 0) {
        if (isPrimaryAdmin && existing[0].role !== "super_admin") {
          const promoted = await db.update(users).set({ role: "super_admin", updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users.id, existing[0].id)).returning();
          return promoted[0];
        }
        return existing[0];
      }
      const existingByEmail = await db.select().from(users).where(sql2`lower(${users.email}) = ${emailLower}`).limit(1);
      if (existingByEmail.length > 0) {
        const current = existingByEmail[0];
        const nextRole = isPrimaryAdmin ? "super_admin" : current.role;
        const nextName = fullName && fullName.trim() && current.fullName.startsWith("Foodora") ? fullName.trim() : current.fullName;
        if (nextRole !== current.role || nextName !== current.fullName) {
          const updated = await db.update(users).set({ role: nextRole, fullName: nextName, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users.id, current.id)).returning();
          return updated[0];
        }
        return current;
      }
      const assignedRole = isPrimaryAdmin ? "super_admin" : defaultRole;
      const inserted = await db.insert(users).values({
        uid,
        email: emailLower,
        fullName: fullName || emailLower.split("@")[0] || "Foodora User",
        role: assignedRole
      }).onConflictDoUpdate({
        target: users.uid,
        set: {
          email: emailLower,
          updatedAt: /* @__PURE__ */ new Date()
        }
      }).returning();
      return inserted[0];
    });
  } catch (error) {
    console.error("Database user upsert failed:", error);
    throw new Error("Failed to synchronize user account.", { cause: error });
  }
}
async function resolveUserFromToken(tokenRaw) {
  const token = String(tokenRaw || "").trim();
  if (!token) return null;
  const sandboxUser = verifySandboxToken(token);
  if (sandboxUser) {
    const dbUser2 = await getOrCreateUser(
      sandboxUser.uid,
      sandboxUser.email,
      sandboxUser.fullName,
      sandboxUser.role
    );
    if (dbUser2.status === "suspended") {
      return null;
    }
    return {
      uid: dbUser2.uid,
      email: dbUser2.email,
      fullName: dbUser2.fullName,
      role: dbUser2.role,
      isSandbox: sandboxUser.isSandbox
    };
  }
  const supaUser = await verifySupabaseAccessToken(token);
  if (!supaUser) return null;
  const dbUser = await getOrCreateUser(
    supaUser.uid,
    supaUser.email,
    supaUser.fullName,
    "customer"
  );
  if (dbUser.status === "suspended") {
    return null;
  }
  return {
    uid: dbUser.uid,
    email: dbUser.email,
    fullName: dbUser.fullName,
    role: dbUser.role,
    isSandbox: false
  };
}
async function resolveUserFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return resolveUserFromToken(authHeader.slice("Bearer ".length));
}
var optionalAuth = async (req, _res, next) => {
  try {
    const user = await resolveUserFromHeader(req.headers.authorization);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    console.warn("Optional auth token ignored:", err instanceof Error ? err.message : err);
  }
  next();
};
var requireAuth = async (req, res, next) => {
  try {
    const user = await resolveUserFromHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid authentication token" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth verification error:", error);
    return res.status(401).json({ error: "Unauthorized: Token verification failed" });
  }
};
var requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient role permissions" });
    }
    next();
  };
};

// src/lib/storefront-config.ts
var DEFAULT_STOREFRONT_CONFIG = {
  brandPrefix: "foodora",
  brandSuffix: "bd",
  accentColor: "#E21B70",
  showTopPartnerBar: true,
  showPickupTab: true,
  showActiveDeliveryBar: true,
  featuredActiveOrderId: "",
  announcementBarEnabled: false,
  announcementTextEn: "Flash Offer: Free Dhaka delivery on orders above \u09F3499 with code DHAKA50!",
  announcementTextBn: "\u09AB\u09CD\u09B2\u09CD\u09AF\u09BE\u09B6 \u0985\u09AB\u09BE\u09B0: \u09EA\u09EF\u09EF\u09F3+ \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7 \u09AB\u09CD\u09B0\u09BF \u09A2\u09BE\u0995\u09BE \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF (\u0995\u09CB\u09A1: DHAKA50)!",
  showHero: true,
  heroBadgeEn: "Dhaka Launch Offer",
  heroBadgeBn: "\u09A2\u09BE\u0995\u09BE \u09B2\u099E\u09CD\u099A \u0985\u09AB\u09BE\u09B0",
  heroTitleEn: "Enjoy Free Delivery & 50% Off on your first order",
  heroTitleBn: "\u09AA\u09CD\u09B0\u09A5\u09AE \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7 \u09AB\u09CD\u09B0\u09BF \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u0993 \u09EB\u09E6% \u099B\u09BE\u09DC \u0989\u09AA\u09AD\u09CB\u0997 \u0995\u09B0\u09C1\u09A8",
  heroSubEn: "Discover Dhaka\u2019s finest Kacchi Biriyani, gourmet burgers, artisan pizza & home kitchens delivered hot to your door.",
  heroSubBn: "\u09A2\u09BE\u0995\u09BE\u09B0 \u09B8\u09C7\u09B0\u09BE \u0995\u09BE\u099A\u09CD\u099A\u09BF \u09AC\u09BF\u09B0\u09BF\u09DF\u09BE\u09A8\u09BF, \u09AC\u09BE\u09B0\u09CD\u0997\u09BE\u09B0, \u09AA\u09BF\u09CE\u099C\u09BE \u0993 \u0998\u09B0\u09CB\u09DF\u09BE \u0996\u09BE\u09AC\u09BE\u09B0 \u098F\u0996\u09A8 \u09AE\u09C1\u09B9\u09C2\u09B0\u09CD\u09A4\u09C7\u0987 \u0986\u09AA\u09A8\u09BE\u09B0 \u09A6\u09B0\u099C\u09BE\u09DF\u0964",
  heroTrustEn: "30 min avg delivery \xB7 bKash & Nagad \xB7 Live rider tracking",
  heroTrustBn: "\u0997\u09DC\u09C7 \u09E9\u09E6 \u09AE\u09BF\u09A8\u09BF\u099F\u09C7 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \xB7 \u09AC\u09BF\u0995\u09BE\u09B6 \u0993 \u09A8\u0997\u09A6 \xB7 \u09B2\u09BE\u0987\u09AD \u09B0\u09BE\u0987\u09A1\u09BE\u09B0 \u099F\u09CD\u09B0\u09CD\u09AF\u09BE\u0995\u09BF\u0982",
  heroBtnEn: "Order Now",
  heroBtnBn: "\u098F\u0996\u09A8\u0987 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8",
  heroImageUrl: "/src/assets/images/hero_e21b70_feast_1794846866285.jpg",
  showPromoTicket: true,
  promoCode: "FOODORA50",
  promoDescEn: "Unlock 50% off & free Dhaka delivery on your first order.",
  promoDescBn: "\u09AA\u09CD\u09B0\u09A5\u09AE \u0985\u09B0\u09CD\u09A1\u09BE\u09B0\u09C7 \u09EB\u09E6% \u099B\u09BE\u09DC \u0993 \u09AB\u09CD\u09B0\u09BF \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u0986\u09A8\u09B2\u0995 \u0995\u09B0\u09C1\u09A8\u0964",
  showCuisineRibbon: true,
  showDailyDeals: true,
  dailyDealsTitleEn: "Daily Vouchers & Deals",
  dailyDealsTitleBn: "\u09A6\u09C8\u09A8\u09BF\u0995 \u09AD\u09BE\u0989\u099A\u09BE\u09B0 \u0993 \u09A1\u09BF\u09B2",
  restaurantsHeadingEn: "All Restaurants",
  restaurantsHeadingBn: "\u09B8\u0995\u09B2 \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F",
  footerDescEn: "Bangladesh\u2019s full-stack multi-vendor food delivery marketplace.",
  footerDescBn: "\u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6\u09C7\u09B0 \u0986\u09A7\u09C1\u09A8\u09BF\u0995 \u09AE\u09BE\u09B2\u09CD\u099F\u09BF-\u09AD\u09C7\u09A8\u09CD\u09A1\u09B0 \u09AB\u09C1\u09A1 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF \u09AE\u09BE\u09B0\u09CD\u0995\u09C7\u099F\u09AA\u09CD\u09B2\u09C7\u09B8\u0964",
  footerZonesLine1: "Gulshan 1 & 2 \xB7 Banani \xB7 Dhanmondi",
  footerZonesLine2: "Uttara \xB7 Mirpur \xB7 Bashundhara R/A \xB7 Motijheel",
  footerCopyright: "\xA9 2026 Foodora BD",
  maintenanceMode: false,
  maintenanceMessage: "Scheduled kitchen & courier maintenance is in progress. Ordering will resume shortly.",
  seoTitleEn: "Foodora BD | Order Food Online in Dhaka \u2014 Biriyani, Burgers & Fast Delivery",
  seoTitleBn: "\u09AB\u09C1\u09A1\u09CB\u09B0\u09BE \u09AC\u09BF\u09A1\u09BF | \u09A2\u09BE\u0995\u09BE\u09DF \u0985\u09A8\u09B2\u09BE\u0987\u09A8\u09C7 \u0996\u09BE\u09AC\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8 \u2014 \u09A6\u09CD\u09B0\u09C1\u09A4 \u09A1\u09C7\u09B2\u09BF\u09AD\u09BE\u09B0\u09BF",
  seoDescriptionEn: "Order food online from top Dhaka restaurants & cloud kitchens. Fast delivery across Gulshan, Banani, Dhanmondi, Uttara & Mirpur with bKash, Nagad & SSLCommerz.",
  seoDescriptionBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8, \u09AC\u09A8\u09BE\u09A8\u09C0, \u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF, \u0989\u09A4\u09CD\u09A4\u09B0\u09BE \u0993 \u09AE\u09BF\u09B0\u09AA\u09C1\u09B0\u09C7\u09B0 \u09B8\u09C7\u09B0\u09BE \u09B0\u09C7\u09B8\u09CD\u099F\u09C1\u09B0\u09C7\u09A8\u09CD\u099F \u09A5\u09C7\u0995\u09C7 \u09AC\u09BF\u0995\u09BE\u09B6, \u09A8\u0997\u09A6 \u0993 \u0995\u09BE\u09B0\u09CD\u09A1\u09C7 \u09A6\u09CD\u09B0\u09C1\u09A4 \u0996\u09BE\u09AC\u09BE\u09B0 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8\u0964",
  seoKeywords: "food delivery dhaka, online food order bangladesh, kacchi biriyani dhaka, bKash food delivery, restaurant marketplace bangladesh",
  googleSiteVerification: "",
  messengerUrl: "https://www.facebook.com/messages/t/mdrakib.roni.1",
  whatsappNumber: "+8801712345678",
  supportEmail: "support@foodorabd.com"
};
function mergeStorefrontConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_STOREFRONT_CONFIG };
  }
  const merged = { ...DEFAULT_STOREFRONT_CONFIG };
  for (const key of Object.keys(DEFAULT_STOREFRONT_CONFIG)) {
    const val = raw[key];
    if (val === void 0 || val === null) continue;
    if (typeof DEFAULT_STOREFRONT_CONFIG[key] === "boolean") {
      merged[key] = Boolean(val);
    } else if (typeof val === "string") {
      if (key === "googleSiteVerification" || key === "featuredActiveOrderId") {
        merged[key] = val.trim();
      } else {
        merged[key] = val.trim() ? val : DEFAULT_STOREFRONT_CONFIG[key];
      }
    }
  }
  return merged;
}

// src/services/delivery.ts
var FoodoraOwnRiderProvider = class {
  constructor() {
    this.name = "Foodora Express Rider";
    this.serviceCode = "foodora_express";
    this.mode = "platform";
  }
  isConfigured() {
    return true;
  }
  async getQuote(order) {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(distanceKm, order.baseFee, "platform");
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: "platform",
      distanceKm,
      fee,
      etaMinutes,
      isSandbox: false
    };
  }
  async createDelivery(order) {
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      consignmentId: `FDR-${order.orderNumber}`,
      status: "awaiting_rider",
      isSandbox: false
    };
  }
  async trackDelivery(_consignmentId) {
    return { status: "on_the_way", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async cancelDelivery(_consignmentId) {
    return { cancelled: true };
  }
};
var RestaurantSelfDeliveryProvider = class {
  constructor() {
    this.name = "Restaurant Own Rider";
    this.serviceCode = "restaurant_fleet";
    this.mode = "restaurant";
  }
  isConfigured() {
    return true;
  }
  async getQuote(order) {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(distanceKm, order.baseFee, "restaurant");
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: "restaurant",
      distanceKm,
      fee,
      etaMinutes,
      isSandbox: false
    };
  }
  async createDelivery(order) {
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      consignmentId: `RST-${order.orderNumber}`,
      status: "restaurant_dispatched",
      isSandbox: false
    };
  }
  async trackDelivery(_consignmentId) {
    return { status: "preparing", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async cancelDelivery(_consignmentId) {
    return { cancelled: true };
  }
};
var PathaoDeliveryProvider = class {
  constructor() {
    this.name = "Pathao Food & Courier";
    this.serviceCode = "pathao_food";
    this.mode = "third_party";
  }
  isConfigured() {
    return Boolean(
      process.env.PATHAO_CLIENT_ID && process.env.PATHAO_CLIENT_SECRET && process.env.PATHAO_USERNAME && process.env.PATHAO_PASSWORD
    );
  }
  async getQuote(order) {
    const distanceKm = haversineDistanceKm(
      order.pickupLat,
      order.pickupLng,
      order.dropoffLat,
      order.dropoffLng
    );
    const { fee, etaMinutes } = estimateDeliveryFeeAndEta(
      distanceKm,
      Math.max(55, order.baseFee),
      "third_party"
    );
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: "third_party",
      distanceKm,
      fee,
      etaMinutes: etaMinutes + 2,
      isSandbox: !this.isConfigured() || process.env.PATHAO_SANDBOX === "true"
    };
  }
  async createDelivery(order) {
    const isLive = this.isConfigured() && process.env.PATHAO_SANDBOX !== "true" && Boolean(process.env.PATHAO_STORE_ID);
    if (isLive) {
      const baseUrl = (process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com").replace(/\/+$/, "");
      try {
        const tokenResp = await fetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: process.env.PATHAO_CLIENT_ID,
            client_secret: process.env.PATHAO_CLIENT_SECRET,
            grant_type: "password",
            username: process.env.PATHAO_USERNAME,
            password: process.env.PATHAO_PASSWORD
          })
        });
        const tokenJson = await tokenResp.json().catch(() => ({}));
        if (tokenResp.ok && tokenJson.access_token) {
          const orderResp = await fetch(`${baseUrl}/aladdin/api/v1/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenJson.access_token}`
            },
            body: JSON.stringify({
              store_id: Number(process.env.PATHAO_STORE_ID),
              merchant_order_id: order.orderNumber,
              recipient_name: order.customerName,
              recipient_phone: order.customerPhone.replace(/^\+88/, ""),
              recipient_address: `${order.dropoffAddress}, ${order.dropoffArea}`,
              recipient_city: 1,
              recipient_zone: 1,
              delivery_type: 48,
              item_type: 2,
              item_quantity: 1,
              item_weight: 0.5,
              amount_to_collect: Math.max(0, Math.round(order.orderValue)),
              item_description: `Food order from ${order.restaurantName}`
            })
          });
          const orderJson = await orderResp.json().catch(() => ({}));
          const liveId = orderJson?.data?.consignment_id;
          if (orderResp.ok && liveId) {
            return {
              provider: "Pathao Food & Courier",
              serviceCode: this.serviceCode,
              consignmentId: liveId,
              status: "consignment_created",
              isSandbox: false
            };
          }
        }
      } catch {
      }
    }
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      provider: isLive ? "Pathao Food & Courier" : "Pathao Food & Courier (Sandbox)",
      serviceCode: this.serviceCode,
      consignmentId: `PT-BD-${suffix}`,
      status: "consignment_created",
      isSandbox: true
    };
  }
  async trackDelivery(_consignmentId) {
    return { status: "picked_up", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async cancelDelivery(_consignmentId) {
    return { cancelled: true };
  }
};
var BangladeshiPartnerCourierProvider = class {
  constructor(serviceCode) {
    this.mode = "third_party";
    const meta = getBangladeshDeliveryServiceMeta(serviceCode);
    this.serviceCode = serviceCode;
    this.name = meta.nameEn;
  }
  isConfigured() {
    if (this.serviceCode === "steadfast") {
      return Boolean(process.env.STEADFAST_API_KEY && process.env.STEADFAST_SECRET_KEY);
    }
    if (this.serviceCode === "redx") {
      return Boolean(process.env.REDX_ACCESS_TOKEN);
    }
    return false;
  }
  async getQuote(order) {
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
      "third_party"
    );
    return {
      provider: this.name,
      serviceCode: this.serviceCode,
      mode: "third_party",
      distanceKm,
      fee,
      etaMinutes: etaMinutes + meta.etaOffsetMin,
      isSandbox: !this.isConfigured()
    };
  }
  async createDelivery(order) {
    if (this.serviceCode === "steadfast" && this.isConfigured()) {
      try {
        const resp = await fetch("https://portal.packzy.com/api/v1/create_order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": process.env.STEADFAST_API_KEY || "",
            "Secret-Key": process.env.STEADFAST_SECRET_KEY || ""
          },
          body: JSON.stringify({
            invoice: order.orderNumber,
            recipient_name: order.customerName,
            recipient_phone: order.customerPhone.replace(/^\+88/, ""),
            recipient_address: `${order.dropoffAddress}, ${order.dropoffArea}`,
            cod_amount: Math.max(0, Math.round(order.orderValue)),
            note: `Food order from ${order.restaurantName}`
          })
        });
        const json = await resp.json().catch(() => ({}));
        const liveId = json?.consignment?.tracking_code || json?.consignment?.consignment_id;
        if (resp.ok && liveId) {
          return {
            provider: this.name,
            serviceCode: this.serviceCode,
            consignmentId: String(liveId),
            status: "consignment_created",
            isSandbox: false
          };
        }
      } catch {
      }
    }
    if (this.serviceCode === "redx" && this.isConfigured()) {
      try {
        const resp = await fetch("https://openapi.redx.com.bd/v1.0.0-beta/parcel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "API-ACCESS-TOKEN": `Bearer ${process.env.REDX_ACCESS_TOKEN}`
          },
          body: JSON.stringify({
            customer_name: order.customerName,
            customer_phone: order.customerPhone.replace(/^\+88/, ""),
            delivery_area: order.dropoffArea,
            delivery_area_id: 1,
            customer_address: order.dropoffAddress,
            merchant_invoice_id: order.orderNumber,
            cash_collection_amount: Math.max(0, Math.round(order.orderValue)),
            parcel_weight: 500
          })
        });
        const json = await resp.json().catch(() => ({}));
        if (resp.ok && json?.tracking_id) {
          return {
            provider: this.name,
            serviceCode: this.serviceCode,
            consignmentId: json.tracking_id,
            status: "consignment_created",
            isSandbox: false
          };
        }
      } catch {
      }
    }
    const prefix = this.serviceCode === "steadfast" ? "SF-BD" : this.serviceCode === "redx" ? "RX-BD" : "PF-BD";
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      provider: `${this.name} (Sandbox)`,
      serviceCode: this.serviceCode,
      consignmentId: `${prefix}-${suffix}`,
      status: "consignment_created",
      isSandbox: true
    };
  }
  async trackDelivery(_consignmentId) {
    return { status: "picked_up", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async cancelDelivery(_consignmentId) {
    return { cancelled: true };
  }
};
function getDeliveryProvider(mode, serviceCode) {
  const cleanCode = String(serviceCode || "").trim().toLowerCase();
  if (cleanCode === "steadfast" || cleanCode === "redx" || cleanCode === "paperfly") {
    return new BangladeshiPartnerCourierProvider(cleanCode);
  }
  if (cleanCode === "pathao_food") {
    return new PathaoDeliveryProvider();
  }
  if (cleanCode === "restaurant_fleet") {
    return new RestaurantSelfDeliveryProvider();
  }
  if (cleanCode === "foodora_express") {
    return new FoodoraOwnRiderProvider();
  }
  switch (mode) {
    case "third_party":
      return new PathaoDeliveryProvider();
    case "restaurant":
      return new RestaurantSelfDeliveryProvider();
    case "platform":
    default:
      return new FoodoraOwnRiderProvider();
  }
}

// src/lib/i18n.ts
var DHAKA_DELIVERY_ZONES = [
  {
    code: "ZONE 01",
    name: "GULSHAN",
    nameBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8",
    summary: "Gulshan 1, Gulshan 2, Niketan, Shahjadpur",
    areas: [
      { name: "Gulshan 2", nameBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8 \u09E8", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \u2014 GULSHAN", lat: 23.7949, lng: 90.4144 },
      { name: "Gulshan 1", nameBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8 \u09E7", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \u2014 GULSHAN", lat: 23.7811, lng: 90.4167 },
      { name: "Niketan", nameBn: "\u09A8\u09BF\u0995\u09C7\u09A4\u09A8", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \u2014 GULSHAN", lat: 23.7764, lng: 90.4098 },
      { name: "Shahjadpur", nameBn: "\u09B6\u09BE\u09B9\u099C\u09BE\u09A6\u09AA\u09C1\u09B0", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \u2014 GULSHAN", lat: 23.7985, lng: 90.4256 }
    ]
  },
  {
    code: "ZONE 02",
    name: "BANANI",
    nameBn: "\u09AC\u09A8\u09BE\u09A8\u09C0",
    summary: "Banani 1\u201327, Chairman Bari, Kakoli",
    areas: [
      { name: "Banani", nameBn: "\u09AC\u09A8\u09BE\u09A8\u09C0", division: "Dhaka", zoneCode: "ZONE 02", zoneLabel: "ZONE 02 \u2014 BANANI", lat: 23.7937, lng: 90.4066 },
      { name: "Banani 1\u201327", nameBn: "\u09AC\u09A8\u09BE\u09A8\u09C0 \u09E7\u2013\u09E8\u09ED", division: "Dhaka", zoneCode: "ZONE 02", zoneLabel: "ZONE 02 \u2014 BANANI", lat: 23.7942, lng: 90.4045 },
      { name: "Chairman Bari", nameBn: "\u099A\u09C7\u09DF\u09BE\u09B0\u09AE\u09CD\u09AF\u09BE\u09A8 \u09AC\u09BE\u09DC\u09BF", division: "Dhaka", zoneCode: "ZONE 02", zoneLabel: "ZONE 02 \u2014 BANANI", lat: 23.7916, lng: 90.4021 },
      { name: "Kakoli", nameBn: "\u0995\u09BE\u0995\u09B2\u09C0", division: "Dhaka", zoneCode: "ZONE 02", zoneLabel: "ZONE 02 \u2014 BANANI", lat: 23.7983, lng: 90.4008 }
    ]
  },
  {
    code: "ZONE 03",
    name: "DHANMONDI",
    nameBn: "\u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF",
    summary: "Dhanmondi 1\u201332, Satmasjid Road, Jigatola, Kalabagan",
    areas: [
      { name: "Dhanmondi 27", nameBn: "\u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF \u09E8\u09ED", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \u2014 DHANMONDI", lat: 23.7518, lng: 90.3712 },
      { name: "Dhanmondi 1\u201332", nameBn: "\u09A7\u09BE\u09A8\u09AE\u09A8\u09CD\u09A1\u09BF \u09E7\u2013\u09E9\u09E8", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \u2014 DHANMONDI", lat: 23.7461, lng: 90.3742 },
      { name: "Satmasjid Road", nameBn: "\u09B8\u09BE\u09A4\u09AE\u09B8\u099C\u09BF\u09A6 \u09B0\u09CB\u09A1", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \u2014 DHANMONDI", lat: 23.7458, lng: 90.3698 },
      { name: "Jigatola", nameBn: "\u099C\u09BF\u0997\u09BE\u09A4\u09B2\u09BE", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \u2014 DHANMONDI", lat: 23.7397, lng: 90.3728 },
      { name: "Kalabagan", nameBn: "\u0995\u09B2\u09BE\u09AC\u09BE\u0997\u09BE\u09A8", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \u2014 DHANMONDI", lat: 23.7495, lng: 90.3822 }
    ]
  },
  {
    code: "ZONE 04",
    name: "MIRPUR",
    nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0",
    summary: "Mirpur 1, 2, 6, 10, 11, 12, Pallabi, Kazipara",
    areas: [
      { name: "Mirpur 10", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09E7\u09E6", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8069, lng: 90.3687 },
      { name: "Mirpur 1", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09E7", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.7984, lng: 90.3536 },
      { name: "Mirpur 2", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09E8", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8045, lng: 90.3612 },
      { name: "Mirpur 6", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09EC", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8124, lng: 90.3638 },
      { name: "Mirpur 11", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09E7\u09E7", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8186, lng: 90.3652 },
      { name: "Mirpur 12", nameBn: "\u09AE\u09BF\u09B0\u09AA\u09C1\u09B0 \u09E7\u09E8", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8286, lng: 90.3641 },
      { name: "Pallabi", nameBn: "\u09AA\u09B2\u09CD\u09B2\u09AC\u09C0", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.8256, lng: 90.3602 },
      { name: "Kazipara", nameBn: "\u0995\u09BE\u099C\u09C0\u09AA\u09BE\u09DC\u09BE", division: "Dhaka", zoneCode: "ZONE 04", zoneLabel: "ZONE 04 \u2014 MIRPUR", lat: 23.7966, lng: 90.3735 }
    ]
  },
  {
    code: "ZONE 05",
    name: "UTTARA",
    nameBn: "\u0989\u09A4\u09CD\u09A4\u09B0\u09BE",
    summary: "Sectors 1\u201314, Rajlaxmi, Jashimuddin, Abdullahpur",
    areas: [
      { name: "Uttara Sector 7", nameBn: "\u0989\u09A4\u09CD\u09A4\u09B0\u09BE \u09B8\u09C7\u0995\u09CD\u099F\u09B0 \u09ED", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \u2014 UTTARA", lat: 23.8682, lng: 90.3991 },
      { name: "Uttara Sectors 1\u201314", nameBn: "\u0989\u09A4\u09CD\u09A4\u09B0\u09BE \u09B8\u09C7\u0995\u09CD\u099F\u09B0 \u09E7\u2013\u09E7\u09EA", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \u2014 UTTARA", lat: 23.8722, lng: 90.3965 },
      { name: "Rajlaxmi", nameBn: "\u09B0\u09BE\u099C\u09B2\u0995\u09CD\u09B7\u09CD\u09AE\u09C0", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \u2014 UTTARA", lat: 23.8618, lng: 90.4003 },
      { name: "Jashimuddin", nameBn: "\u099C\u09B8\u09BF\u09AE\u0989\u09A6\u09CD\u09A6\u09C0\u09A8", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \u2014 UTTARA", lat: 23.8602, lng: 90.4009 },
      { name: "Abdullahpur", nameBn: "\u0986\u09AC\u09CD\u09A6\u09C1\u09B2\u09CD\u09B2\u09BE\u09B9\u09AA\u09C1\u09B0", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \u2014 UTTARA", lat: 23.8794, lng: 90.4012 }
    ]
  },
  {
    code: "ZONE 06",
    name: "MOHAMMADPUR",
    nameBn: "\u09AE\u09CB\u09B9\u09BE\u09AE\u09CD\u09AE\u09A6\u09AA\u09C1\u09B0",
    summary: "Mohammadpur, Town Hall, Bosila, Adabor, Shyamoli",
    areas: [
      { name: "Mohammadpur", nameBn: "\u09AE\u09CB\u09B9\u09BE\u09AE\u09CD\u09AE\u09A6\u09AA\u09C1\u09B0", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \u2014 MOHAMMADPUR", lat: 23.7658, lng: 90.3586 },
      { name: "Town Hall", nameBn: "\u099F\u09BE\u0989\u09A8 \u09B9\u09B2", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \u2014 MOHAMMADPUR", lat: 23.7662, lng: 90.3621 },
      { name: "Bosila", nameBn: "\u09AC\u09B8\u09BF\u09B2\u09BE", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \u2014 MOHAMMADPUR", lat: 23.7484, lng: 90.3435 },
      { name: "Adabor", nameBn: "\u0986\u09A6\u09BE\u09AC\u09B0", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \u2014 MOHAMMADPUR", lat: 23.7704, lng: 90.3568 },
      { name: "Shyamoli", nameBn: "\u09B6\u09CD\u09AF\u09BE\u09AE\u09B2\u09C0", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \u2014 MOHAMMADPUR", lat: 23.7745, lng: 90.3654 }
    ]
  },
  {
    code: "ZONE 07",
    name: "BASHUNDHARA",
    nameBn: "\u09AC\u09B8\u09C1\u09A8\u09CD\u09A7\u09B0\u09BE",
    summary: "Bashundhara R/A, Jamuna Future Park, Kuril, Vatara",
    areas: [
      { name: "Bashundhara R/A", nameBn: "\u09AC\u09B8\u09C1\u09A8\u09CD\u09A7\u09B0\u09BE \u0986\u09AC\u09BE\u09B8\u09BF\u0995 \u098F\u09B2\u09BE\u0995\u09BE", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "ZONE 07 \u2014 BASHUNDHARA", lat: 23.8191, lng: 90.4526 },
      { name: "Jamuna Future Park", nameBn: "\u09AF\u09AE\u09C1\u09A8\u09BE \u09AB\u09BF\u0989\u099A\u09BE\u09B0 \u09AA\u09BE\u09B0\u09CD\u0995", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "ZONE 07 \u2014 BASHUNDHARA", lat: 23.8135, lng: 90.4242 },
      { name: "Kuril", nameBn: "\u0995\u09C1\u09DC\u09BF\u09B2", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "ZONE 07 \u2014 BASHUNDHARA", lat: 23.8204, lng: 90.4215 },
      { name: "Vatara", nameBn: "\u09AD\u09BE\u099F\u09BE\u09B0\u09BE", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "ZONE 07 \u2014 BASHUNDHARA", lat: 23.8062, lng: 90.4285 }
    ]
  },
  {
    code: "ZONE 08",
    name: "BADDA",
    nameBn: "\u09AC\u09BE\u09A1\u09CD\u09A1\u09BE",
    summary: "Badda, Merul Badda, Rampura, Aftabnagar",
    areas: [
      { name: "Badda", nameBn: "\u09AC\u09BE\u09A1\u09CD\u09A1\u09BE", division: "Dhaka", zoneCode: "ZONE 08", zoneLabel: "ZONE 08 \u2014 BADDA", lat: 23.7805, lng: 90.4267 },
      { name: "Merul Badda", nameBn: "\u09AE\u09C7\u09B0\u09C1\u09B2 \u09AC\u09BE\u09A1\u09CD\u09A1\u09BE", division: "Dhaka", zoneCode: "ZONE 08", zoneLabel: "ZONE 08 \u2014 BADDA", lat: 23.7712, lng: 90.4252 },
      { name: "Rampura", nameBn: "\u09B0\u09BE\u09AE\u09AA\u09C1\u09B0\u09BE", division: "Dhaka", zoneCode: "ZONE 08", zoneLabel: "ZONE 08 \u2014 BADDA", lat: 23.7615, lng: 90.4208 },
      { name: "Aftabnagar", nameBn: "\u0986\u09AB\u09A4\u09BE\u09AC\u09A8\u0997\u09B0", division: "Dhaka", zoneCode: "ZONE 08", zoneLabel: "ZONE 08 \u2014 BADDA", lat: 23.7654, lng: 90.4328 }
    ]
  },
  {
    code: "ZONE 09",
    name: "MOTIJHEEL",
    nameBn: "\u09AE\u09A4\u09BF\u099D\u09BF\u09B2",
    summary: "Motijheel, Paltan, Fakirapool, Arambagh, Kamalapur",
    areas: [
      { name: "Motijheel", nameBn: "\u09AE\u09A4\u09BF\u099D\u09BF\u09B2", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "ZONE 09 \u2014 MOTIJHEEL", lat: 23.7272, lng: 90.4198 },
      { name: "Paltan", nameBn: "\u09AA\u09B2\u09CD\u099F\u09A8", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "ZONE 09 \u2014 MOTIJHEEL", lat: 23.7336, lng: 90.4119 },
      { name: "Fakirapool", nameBn: "\u09AB\u0995\u09BF\u09B0\u09BE\u09AA\u09C1\u09B2", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "ZONE 09 \u2014 MOTIJHEEL", lat: 23.7332, lng: 90.4178 },
      { name: "Arambagh", nameBn: "\u0986\u09B0\u09BE\u09AE\u09AC\u09BE\u0997", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "ZONE 09 \u2014 MOTIJHEEL", lat: 23.7311, lng: 90.4221 },
      { name: "Kamalapur", nameBn: "\u0995\u09AE\u09B2\u09BE\u09AA\u09C1\u09B0", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "ZONE 09 \u2014 MOTIJHEEL", lat: 23.7318, lng: 90.4264 }
    ]
  },
  {
    code: "ZONE 10",
    name: "OLD DHAKA",
    nameBn: "\u09AA\u09C1\u09B0\u09BE\u09A8 \u09A2\u09BE\u0995\u09BE",
    summary: "Chawkbazar, Bangshal, Lalbagh, Wari, Sutrapur",
    areas: [
      { name: "Chawkbazar", nameBn: "\u099A\u0995\u09AC\u09BE\u099C\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "ZONE 10 \u2014 OLD DHAKA", lat: 23.7158, lng: 90.3962 },
      { name: "Bangshal", nameBn: "\u09AC\u0982\u09B6\u09BE\u09B2", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "ZONE 10 \u2014 OLD DHAKA", lat: 23.7186, lng: 90.4046 },
      { name: "Lalbagh", nameBn: "\u09B2\u09BE\u09B2\u09AC\u09BE\u0997", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "ZONE 10 \u2014 OLD DHAKA", lat: 23.7189, lng: 90.3881 },
      { name: "Wari", nameBn: "\u0993\u09DF\u09BE\u09B0\u09C0", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "ZONE 10 \u2014 OLD DHAKA", lat: 23.7178, lng: 90.4176 },
      { name: "Sutrapur", nameBn: "\u09B8\u09C2\u09A4\u09CD\u09B0\u09BE\u09AA\u09C1\u09B0", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "ZONE 10 \u2014 OLD DHAKA", lat: 23.7095, lng: 90.4138 }
    ]
  },
  {
    code: "ZONE 11",
    name: "TEJGAON / FARMGATE",
    nameBn: "\u09A4\u09C7\u099C\u0997\u09BE\u0981\u0993 / \u09AB\u09BE\u09B0\u09CD\u09AE\u0997\u09C7\u099F",
    summary: "Tejgaon, Farmgate, Karwan Bazar, Kawran Bazar",
    areas: [
      { name: "Tejgaon", nameBn: "\u09A4\u09C7\u099C\u0997\u09BE\u0981\u0993", division: "Dhaka", zoneCode: "ZONE 11", zoneLabel: "ZONE 11 \u2014 TEJGAON / FARMGATE", lat: 23.7612, lng: 90.3964 },
      { name: "Farmgate", nameBn: "\u09AB\u09BE\u09B0\u09CD\u09AE\u0997\u09C7\u099F", division: "Dhaka", zoneCode: "ZONE 11", zoneLabel: "ZONE 11 \u2014 TEJGAON / FARMGATE", lat: 23.7561, lng: 90.3872 },
      { name: "Karwan Bazar", nameBn: "\u0995\u09BE\u09B0\u0993\u09DF\u09BE\u09A8 \u09AC\u09BE\u099C\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 11", zoneLabel: "ZONE 11 \u2014 TEJGAON / FARMGATE", lat: 23.7514, lng: 90.3931 },
      { name: "Kawran Bazar", nameBn: "\u0995\u09BE\u0993\u09B0\u09BE\u09A8 \u09AC\u09BE\u099C\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 11", zoneLabel: "ZONE 11 \u2014 TEJGAON / FARMGATE", lat: 23.7521, lng: 90.3936 }
    ]
  },
  {
    code: "ZONE 12",
    name: "KHILGAON",
    nameBn: "\u0996\u09BF\u09B2\u0997\u09BE\u0981\u0993",
    summary: "Khilgaon, Taltola, Malibagh, Goran & custom area",
    areas: [
      { name: "Khilgaon", nameBn: "\u0996\u09BF\u09B2\u0997\u09BE\u0981\u0993", division: "Dhaka", zoneCode: "ZONE 12", zoneLabel: "ZONE 12 \u2014 KHILGAON", lat: 23.7506, lng: 90.4254 },
      { name: "Taltola", nameBn: "\u09A4\u09BE\u09B2\u09A4\u09B2\u09BE", division: "Dhaka", zoneCode: "ZONE 12", zoneLabel: "ZONE 12 \u2014 KHILGAON", lat: 23.7532, lng: 90.4235 },
      { name: "Malibagh", nameBn: "\u09AE\u09BE\u09B2\u09BF\u09AC\u09BE\u0997", division: "Dhaka", zoneCode: "ZONE 12", zoneLabel: "ZONE 12 \u2014 KHILGAON", lat: 23.7478, lng: 90.4126 },
      { name: "Goran", nameBn: "\u0997\u09CB\u09B0\u09BE\u09A8", division: "Dhaka", zoneCode: "ZONE 12", zoneLabel: "ZONE 12 \u2014 KHILGAON", lat: 23.7492, lng: 90.4335 }
    ]
  }
];
var DHAKA_AREAS = DHAKA_DELIVERY_ZONES.map((z2) => ({
  name: z2.areas[0].name,
  nameBn: z2.areas[0].nameBn,
  lat: z2.areas[0].lat,
  lng: z2.areas[0].lng
}));
var NATIONWIDE_BD_AREAS = [
  { name: "Chattogram (GEC / Agrabad)", nameBn: "\u099A\u099F\u09CD\u099F\u0997\u09CD\u09B0\u09BE\u09AE (\u099C\u09BF\u0987\u09B8\u09BF / \u0986\u0997\u09CD\u09B0\u09BE\u09AC\u09BE\u09A6)", division: "Chattogram", zoneLabel: "Nationwide Bangladesh Cities", lat: 22.3569, lng: 91.7832 },
  { name: "Sylhet (Zindabazar)", nameBn: "\u09B8\u09BF\u09B2\u09C7\u099F (\u099C\u09BF\u09A8\u09CD\u09A6\u09BE\u09AC\u09BE\u099C\u09BE\u09B0)", division: "Sylhet", zoneLabel: "Nationwide Bangladesh Cities", lat: 24.8949, lng: 91.8687 },
  { name: "Rajshahi (Shaheb Bazar)", nameBn: "\u09B0\u09BE\u099C\u09B6\u09BE\u09B9\u09C0 (\u09B8\u09BE\u09B9\u09C7\u09AC \u09AC\u09BE\u099C\u09BE\u09B0)", division: "Rajshahi", zoneLabel: "Nationwide Bangladesh Cities", lat: 24.3745, lng: 88.6042 },
  { name: "Khulna (Shib Bari)", nameBn: "\u0996\u09C1\u09B2\u09A8\u09BE (\u09B6\u09BF\u09AC\u09AC\u09BE\u09DC\u09C0)", division: "Khulna", zoneLabel: "Nationwide Bangladesh Cities", lat: 22.8456, lng: 89.5403 },
  { name: "Barishal (Sadar)", nameBn: "\u09AC\u09B0\u09BF\u09B6\u09BE\u09B2 (\u09B8\u09A6\u09B0)", division: "Barishal", zoneLabel: "Nationwide Bangladesh Cities", lat: 22.701, lng: 90.3535 },
  { name: "Rangpur (Jahaj Company)", nameBn: "\u09B0\u0982\u09AA\u09C1\u09B0 (\u099C\u09BE\u09B9\u09BE\u099C \u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF)", division: "Rangpur", zoneLabel: "Nationwide Bangladesh Cities", lat: 25.7439, lng: 89.2752 },
  { name: "Mymensingh (Town Hall)", nameBn: "\u09AE\u09DF\u09AE\u09A8\u09B8\u09BF\u0982\u09B9 (\u099F\u09BE\u0989\u09A8 \u09B9\u09B2)", division: "Mymensingh", zoneLabel: "Nationwide Bangladesh Cities", lat: 24.7471, lng: 90.4203 },
  { name: "Narayanganj (Chashara)", nameBn: "\u09A8\u09BE\u09B0\u09BE\u09DF\u09A3\u0997\u099E\u09CD\u099C (\u099A\u09BE\u09B7\u09BE\u09DD\u09BE)", division: "Dhaka", zoneLabel: "Nationwide Bangladesh Cities", lat: 23.6238, lng: 90.5 },
  { name: "Gazipur (Joydebpur)", nameBn: "\u0997\u09BE\u099C\u09C0\u09AA\u09C1\u09B0 (\u099C\u09DF\u09A6\u09C7\u09AC\u09AA\u09C1\u09B0)", division: "Dhaka", zoneLabel: "Nationwide Bangladesh Cities", lat: 23.9999, lng: 90.4203 },
  { name: "Savar (City Center)", nameBn: "\u09B8\u09BE\u09AD\u09BE\u09B0 (\u09B8\u09BF\u099F\u09BF \u09B8\u09C7\u09A8\u09CD\u099F\u09BE\u09B0)", division: "Dhaka", zoneLabel: "Nationwide Bangladesh Cities", lat: 23.8583, lng: 90.2667 },
  { name: "Cumilla (Kandirpar)", nameBn: "\u0995\u09C1\u09AE\u09BF\u09B2\u09CD\u09B2\u09BE (\u0995\u09BE\u09A8\u09CD\u09A6\u09BF\u09B0\u09AA\u09BE\u09DC)", division: "Chattogram", zoneLabel: "Nationwide Bangladesh Cities", lat: 23.4607, lng: 91.1809 },
  { name: "Cox's Bazar (Kolatoli)", nameBn: "\u0995\u0995\u09CD\u09B8\u09AC\u09BE\u099C\u09BE\u09B0 (\u0995\u09B2\u09BE\u09A4\u09B2\u09C0)", division: "Chattogram", zoneLabel: "Nationwide Bangladesh Cities", lat: 21.4272, lng: 92.0058 },
  { name: "Bogura (Satmatha)", nameBn: "\u09AC\u0997\u09C1\u09DC\u09BE (\u09B8\u09BE\u09A4\u09AE\u09BE\u09A5\u09BE)", division: "Rajshahi", zoneLabel: "Nationwide Bangladesh Cities", lat: 24.8481, lng: 89.373 },
  { name: "Jashore (Town)", nameBn: "\u09AF\u09B6\u09CB\u09B0 (\u09B6\u09B9\u09B0)", division: "Khulna", zoneLabel: "Nationwide Bangladesh Cities", lat: 23.1664, lng: 89.2081 }
];
var BANGLADESH_LANDMARKS = [
  { name: "Saad Musa City Center", nameBn: "\u09B8\u09BE\u09A6 \u09AE\u09C1\u09B8\u09BE \u09B8\u09BF\u099F\u09BF \u09B8\u09C7\u09A8\u09CD\u099F\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "Pragati Sarani \xB7 Kuril / Nikunja", addressHint: "Ka-96-E Pragati Sarani, Kuril, Nikunja 1, Dhaka 1229", keywords: "sad musa city center citycenter corporate tower kuril nikunja", lat: 23.81801, lng: 90.42001 },
  { name: "Saad Musa Tower (Agrabad)", nameBn: "\u09B8\u09BE\u09A6 \u09AE\u09C1\u09B8\u09BE \u099F\u09BE\u0993\u09DF\u09BE\u09B0 (\u0986\u0997\u09CD\u09B0\u09BE\u09AC\u09BE\u09A6)", division: "Chattogram", zoneLabel: "Agrabad C/A \xB7 Chattogram", addressHint: "Agrabad Commercial Area, Chattogram", keywords: "sad musa tower building commercial chittagong agrabad", lat: 22.3264, lng: 91.8122 },
  { name: "Saad Musa Industrial Park", nameBn: "\u09B8\u09BE\u09A6 \u09AE\u09C1\u09B8\u09BE \u0987\u09A8\u09CD\u09A1\u09BE\u09B8\u09CD\u099F\u09CD\u09B0\u09BF\u09DF\u09BE\u09B2 \u09AA\u09BE\u09B0\u09CD\u0995", division: "Chattogram", zoneLabel: "Kalurghat \xB7 Chattogram", addressHint: "Kalurghat Heavy Industrial Area, Chattogram", keywords: "sad musa group factory textile chittagong", lat: 22.3911, lng: 91.8842 },
  { name: "Jamuna Future Park", nameBn: "\u09AF\u09AE\u09C1\u09A8\u09BE \u09AB\u09BF\u0989\u099A\u09BE\u09B0 \u09AA\u09BE\u09B0\u09CD\u0995", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "ZONE 07 \xB7 Kuril / Bashundhara", addressHint: "Ka-244 Pragati Sarani, Kuril, Dhaka 1229", keywords: "futurepark shopping mall kuril bashundhara", lat: 23.8135, lng: 90.4242 },
  { name: "Bashundhara City Shopping Complex", nameBn: "\u09AC\u09B8\u09C1\u09A8\u09CD\u09A7\u09B0\u09BE \u09B8\u09BF\u099F\u09BF \u09B6\u09AA\u09BF\u0982 \u09AE\u09B2", division: "Dhaka", zoneCode: "ZONE 11", zoneLabel: "Panthapath \xB7 Karwan Bazar", addressHint: "Panthapath, West Karwan Bazar, Dhaka 1215", keywords: "bashundhara city shopping mall panthapath farmgate", lat: 23.7509, lng: 90.3905 },
  { name: "Police Plaza Concord", nameBn: "\u09AA\u09C1\u09B2\u09BF\u09B6 \u09AA\u09CD\u09B2\u09BE\u099C\u09BE \u0995\u09A8\u0995\u09B0\u09CD\u09A1", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "Hatirjheel \xB7 Gulshan 1", addressHint: "Plot 2, Road 144, Gulshan 1 (Hatirjheel Link), Dhaka 1212", keywords: "policeplaza concord mall shopping tower gulshan", lat: 23.7731, lng: 90.4156 },
  { name: "Gulshan Pink City Shopping Mall", nameBn: "\u0997\u09C1\u09B2\u09B6\u09BE\u09A8 \u09AA\u09BF\u0982\u0995 \u09B8\u09BF\u099F\u09BF", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \xB7 Gulshan 2", addressHint: "Plot 15, Road 103, Gulshan Avenue, Dhaka 1212", keywords: "pinkcity shopping mall gulshan 2", lat: 23.7924, lng: 90.4153 },
  { name: "Navana Tower (Gulshan 1)", nameBn: "\u09A8\u09BE\u09AD\u09BE\u09A8\u09BE \u099F\u09BE\u0993\u09DF\u09BE\u09B0 (\u0997\u09C1\u09B2\u09B6\u09BE\u09A8 \u09E7)", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "ZONE 01 \xB7 Gulshan 1", addressHint: "45 Gulshan South C/A, Circle 1, Dhaka 1212", keywords: "navana tower commercial office gulshan 1", lat: 23.7808, lng: 90.4169 },
  { name: "Shimanto Square", nameBn: "\u09B8\u09C0\u09AE\u09BE\u09A8\u09CD\u09A4 \u09B8\u09CD\u0995\u09DF\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "ZONE 03 \xB7 Dhanmondi", addressHint: "Road 2, Dhanmondi (Jigatola), Dhaka 1205", keywords: "shimanto square rifles square shopping mall dhanmondi", lat: 23.7385, lng: 90.3752 },
  { name: "Tokyo Square", nameBn: "\u099F\u09CB\u0995\u09BF\u0993 \u09B8\u09CD\u0995\u09DF\u09BE\u09B0", division: "Dhaka", zoneCode: "ZONE 06", zoneLabel: "ZONE 06 \xB7 Mohammadpur", addressHint: "Japan Garden City, Ring Road, Mohammadpur, Dhaka 1207", keywords: "tokyo square mall japan garden city mohammadpur", lat: 23.7689, lng: 90.3587 },
  { name: "Mascot Plaza (Uttara)", nameBn: "\u09AE\u09BE\u09B8\u0995\u099F \u09AA\u09CD\u09B2\u09BE\u099C\u09BE (\u0989\u09A4\u09CD\u09A4\u09B0\u09BE)", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \xB7 Uttara Sector 7", addressHint: "Sector 7, Sonargaon Janapath, Uttara, Dhaka 1230", keywords: "mascot plaza shopping mall uttara sector 7", lat: 23.8698, lng: 90.3999 },
  { name: "Rajlokkhi Complex (Uttara)", nameBn: "\u09B0\u09BE\u099C\u09B2\u0995\u09CD\u09B7\u09CD\u09AE\u09C0 \u0995\u09AE\u09AA\u09CD\u09B2\u09C7\u0995\u09CD\u09B8 (\u0989\u09A4\u09CD\u09A4\u09B0\u09BE)", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \xB7 Uttara Sector 3", addressHint: "Sector 3, Dhaka-Mymensingh Hwy, Uttara, Dhaka 1230", keywords: "rajlaxmi rajlokkhi complex market uttara", lat: 23.8644, lng: 90.4002 },
  { name: "North Tower (Uttara)", nameBn: "\u09A8\u09B0\u09CD\u09A5 \u099F\u09BE\u0993\u09DF\u09BE\u09B0 (\u0989\u09A4\u09CD\u09A4\u09B0\u09BE)", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "ZONE 05 \xB7 Uttara Sector 7", addressHint: "Sector 7, House Building, Uttara, Dhaka 1230", keywords: "north tower shopping center uttara house building", lat: 23.8744, lng: 90.4005 },
  { name: "Evercare Hospital Dhaka", nameBn: "\u098F\u09AD\u09BE\u09B0\u0995\u09C7\u09DF\u09BE\u09B0 \u09B9\u09BE\u09B8\u09AA\u09BE\u09A4\u09BE\u09B2 \u09A2\u09BE\u0995\u09BE", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "Bashundhara R/A", addressHint: "Plot 81, Block E, Bashundhara R/A, Dhaka 1229", keywords: "apollo hospital evercare medical bashundhara", lat: 23.8099, lng: 90.4314 },
  { name: "United Hospital (Gulshan)", nameBn: "\u0987\u0989\u09A8\u09BE\u0987\u099F\u09C7\u09A1 \u09B9\u09BE\u09B8\u09AA\u09BE\u09A4\u09BE\u09B2 (\u0997\u09C1\u09B2\u09B6\u09BE\u09A8)", division: "Dhaka", zoneCode: "ZONE 01", zoneLabel: "Gulshan 2", addressHint: "Plot 15, Road 71, Gulshan 2, Dhaka 1212", keywords: "united hospital medical gulshan 2", lat: 23.8047, lng: 90.4158 },
  { name: "Square Hospital (Panthapath)", nameBn: "\u09B8\u09CD\u0995\u09DF\u09BE\u09B0 \u09B9\u09BE\u09B8\u09AA\u09BE\u09A4\u09BE\u09B2 (\u09AA\u09BE\u09A8\u09CD\u09A5\u09AA\u09A5)", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "Panthapath \xB7 Dhanmondi", addressHint: "18/F Bir Uttam Qazi Nuruzzaman Sarak, Panthapath, Dhaka 1205", keywords: "square hospital medical panthapath green road", lat: 23.7529, lng: 90.3816 },
  { name: "Dhaka Medical College Hospital", nameBn: "\u09A2\u09BE\u0995\u09BE \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B9\u09BE\u09B8\u09AA\u09BE\u09A4\u09BE\u09B2", division: "Dhaka", zoneCode: "ZONE 10", zoneLabel: "Shahbagh \xB7 Bakshibazar", addressHint: "Secretariat Road, Ramna / Shahbagh, Dhaka 1000", keywords: "dmch medicalcollege hospital shahbagh buet", lat: 23.7259, lng: 90.3976 },
  { name: "North South University (NSU)", nameBn: "\u09A8\u09B0\u09CD\u09A5 \u09B8\u09BE\u0989\u09A5 \u0987\u0989\u09A8\u09BF\u09AD\u09BE\u09B0\u09CD\u09B8\u09BF\u099F\u09BF (NSU)", division: "Dhaka", zoneCode: "ZONE 07", zoneLabel: "Bashundhara R/A", addressHint: "Plot 15, Block B, Bashundhara R/A, Dhaka 1229", keywords: "nsu north south university campus bashundhara", lat: 23.8151, lng: 90.4255 },
  { name: "BRAC University (Merul Badda)", nameBn: "\u09AC\u09CD\u09B0\u09CD\u09AF\u09BE\u0995 \u0987\u0989\u09A8\u09BF\u09AD\u09BE\u09B0\u09CD\u09B8\u09BF\u099F\u09BF (\u09AE\u09C7\u09B0\u09C1\u09B2 \u09AC\u09BE\u09A1\u09CD\u09A1\u09BE)", division: "Dhaka", zoneCode: "ZONE 08", zoneLabel: "Merul Badda", addressHint: "Kha 224 Bir Uttam Rafiqul Islam Ave, Merul Badda, Dhaka 1212", keywords: "bracu brac university campus merul badda mohakhali", lat: 23.7725, lng: 90.4249 },
  { name: "University of Dhaka (TSC / Shahbagh)", nameBn: "\u09A2\u09BE\u0995\u09BE \u09AC\u09BF\u09B6\u09CD\u09AC\u09AC\u09BF\u09A6\u09CD\u09AF\u09BE\u09B2\u09DF (\u099F\u09BF\u098F\u09B8\u09B8\u09BF)", division: "Dhaka", zoneCode: "ZONE 03", zoneLabel: "Shahbagh \xB7 Nilkhet", addressHint: "TSC Road, University of Dhaka, Shahbagh, Dhaka 1000", keywords: "du dhaka university tsc shahbagh nilkhet", lat: 23.7339, lng: 90.3953 },
  { name: "Hazrat Shahjalal International Airport", nameBn: "\u09B9\u09AF\u09B0\u09A4 \u09B6\u09BE\u09B9\u099C\u09BE\u09B2\u09BE\u09B2 \u0986\u09A8\u09CD\u09A4\u09B0\u09CD\u099C\u09BE\u09A4\u09BF\u0995 \u09AC\u09BF\u09AE\u09BE\u09A8\u09AC\u09A8\u09CD\u09A6\u09B0", division: "Dhaka", zoneCode: "ZONE 05", zoneLabel: "Airport Road \xB7 Kurmitola", addressHint: "Airport Road, Kurmitola, Dhaka 1229", keywords: "hsia airport terminal 1 2 3 kurmitola dhaka", lat: 23.8433, lng: 90.3978 },
  { name: "Kamalapur Railway Station", nameBn: "\u0995\u09AE\u09B2\u09BE\u09AA\u09C1\u09B0 \u09B0\u09C7\u09B2\u0993\u09DF\u09C7 \u09B8\u09CD\u099F\u09C7\u09B6\u09A8", division: "Dhaka", zoneCode: "ZONE 09", zoneLabel: "Motijheel \xB7 Kamalapur", addressHint: "Kamalapur Station Road, Motijheel, Dhaka 1217", keywords: "railwaystation train station komlapur motijheel", lat: 23.7317, lng: 90.4262 },
  { name: "Sanmar Ocean City (Chattogram)", nameBn: "\u09B8\u09BE\u09A8\u09AE\u09BE\u09B0 \u0993\u09B6\u09BE\u09A8 \u09B8\u09BF\u099F\u09BF (\u099A\u099F\u09CD\u099F\u0997\u09CD\u09B0\u09BE\u09AE)", division: "Chattogram", zoneLabel: "CDA Avenue \xB7 GEC Circle", addressHint: "CDA Avenue, East Nasirabad, GEC Circle, Chattogram", keywords: "sanmar oceancity mall gec chittagong", lat: 22.3596, lng: 91.8219 },
  { name: "Al-Hamra Shopping City (Sylhet)", nameBn: "\u0986\u09B2-\u09B9\u09BE\u09AE\u09B0\u09BE \u09B6\u09AA\u09BF\u0982 \u09B8\u09BF\u099F\u09BF (\u09B8\u09BF\u09B2\u09C7\u099F)", division: "Sylhet", zoneLabel: "Zindabazar \xB7 Sylhet", addressHint: "Zindabazar Main Road, Sylhet 3100", keywords: "al hamra shopping city mall zindabazar sylhet", lat: 24.8965, lng: 91.8682 }
];
var BANGLADESH_AREAS = [
  ...DHAKA_DELIVERY_ZONES.flatMap((z2) => z2.areas),
  ...NATIONWIDE_BD_AREAS
];
var BANGLADESH_SEARCH_PLACES = [
  ...BANGLADESH_AREAS,
  ...BANGLADESH_LANDMARKS
];

// src/services/free-apis.ts
var cache = /* @__PURE__ */ new Map();
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}
function setCached(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
async function fetchDhakaWeather(lat, lng) {
  const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FDhaka`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json();
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
        source: "Open-Meteo"
      },
      15 * 60 * 1e3
    );
  } catch {
    return {
      tempC: 28,
      windKmh: 9,
      precipitationMm: 0,
      weatherCode: 1,
      labelEn: "Clear Sky",
      labelBn: "\u09AA\u09B0\u09BF\u09B7\u09CD\u0995\u09BE\u09B0 \u0986\u0995\u09BE\u09B6",
      isRaining: false,
      rainBufferMin: 0,
      source: "Fallback"
    };
  }
}
async function fetchPhotonBangladeshPlaces(query, biasLat, biasLng) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      query
    )}&lat=${biasLat}&lon=${biasLng}&limit=10&lang=en&bbox=88.0,20.5,92.7,26.7`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FoodoraBD-Marketplace/1.0" },
      signal: AbortSignal.timeout(3200)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const f of data.features || []) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const p = f.properties || {};
      if (p.countrycode && p.countrycode.toUpperCase() !== "BD") continue;
      if (!isWithinBangladesh(lat, lng)) continue;
      const rawTitle = (p.name || "").split(";")[0]?.trim() || p.street || p.district || p.city || "Bangladesh";
      const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ").trim();
      const areaLine = [p.locality, p.district, p.city || p.county].filter(Boolean);
      const displayParts = cleanMapAddressSegments(
        [rawTitle, streetLine, ...areaLine, "Bangladesh"].filter(Boolean).join(", ")
      );
      const displayName = displayParts.length > 0 ? `${displayParts.slice(0, 4).join(", ")}, Bangladesh` : `${rawTitle}, Bangladesh`;
      const subtitle = areaLine.slice(0, 2).join(" \xB7 ") || p.state || "Bangladesh Map";
      out.push({
        displayName,
        shortName: rawTitle,
        subtitle,
        lat,
        lng,
        source: "map"
      });
    }
    return out;
  } catch {
    return [];
  }
}
async function fetchGooglePlacesTextSearch(query, biasLat, biasLng) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return [];
  try {
    const qWithBd = query.toLowerCase().includes("bangladesh") ? query : `${query}, Bangladesh`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      qWithBd
    )}&location=${biasLat},${biasLng}&radius=50000&region=bd&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3200) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results)) return [];
    const out = [];
    for (const r of data.results.slice(0, 8)) {
      const lat = Number(r.geometry?.location?.lat);
      const lng = Number(r.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isWithinBangladesh(lat, lng)) continue;
      const cleaned = cleanMapAddressSegments(r.formatted_address || "");
      const shortName = r.name?.trim() || cleaned[0] || matchCanonicalAreaFromHints([r.formatted_address || ""], lat, lng, BANGLADESH_AREAS);
      const displayName = cleaned.length > 0 ? `${cleaned.slice(0, 4).join(", ")}, Bangladesh` : `${shortName}, Bangladesh`;
      out.push({
        displayName,
        shortName,
        subtitle: cleaned.slice(1, 3).join(" \xB7 ") || "Google Places",
        lat,
        lng,
        source: "map"
      });
    }
    return out;
  } catch {
    return [];
  }
}
async function fetchNominatimPlaces(query) {
  try {
    const queryWithCountry = query.toLowerCase().includes("bangladesh") ? query : `${query}, Bangladesh`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      queryWithCountry
    )}&format=json&addressdetails=1&countrycodes=bd&limit=6&accept-language=en,bn`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FoodoraBD-Marketplace/1.0" },
      signal: AbortSignal.timeout(3200)
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon))).map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      const cleaned = cleanMapAddressSegments(r.display_name);
      const rawName = (r.name || "").split(";")[0]?.trim();
      const shortName = rawName || cleaned[0] || r.display_name.split(",")[0]?.trim() || matchCanonicalAreaFromHints([r.display_name], lat, lng, BANGLADESH_AREAS);
      const cleanDisplay = cleaned.length > 0 ? `${cleaned.slice(0, 4).join(", ")}, Bangladesh` : r.display_name;
      const subtitleParts = [
        r.address?.suburb || r.address?.neighbourhood || "",
        r.address?.city || r.address?.town || r.address?.county || ""
      ].filter(Boolean);
      return {
        displayName: cleanDisplay,
        shortName,
        subtitle: subtitleParts.join(" \xB7 ") || "Bangladesh Map",
        lat,
        lng,
        source: "map"
      };
    });
  } catch {
    return [];
  }
}
async function searchOsmPlaces(query, bias) {
  const q = query.trim();
  if (!q) return [];
  const biasLat = Number.isFinite(bias?.lat) ? Number(bias?.lat) : 23.7949;
  const biasLng = Number.isFinite(bias?.lng) ? Number(bias?.lng) : 90.4144;
  const key = `osm-search-v4:${q.toLowerCase()}:${biasLat.toFixed(1)},${biasLng.toFixed(1)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const localMatches = findLocalAddressSuggestions(q, BANGLADESH_SEARCH_PLACES, 8);
  const queryVariants = expandAddressSearchQueries(q);
  const fullPhoneticQuery = queryVariants.find((v) => v.includes("saad") || v.includes(" ")) || q;
  const prefixQuery = queryVariants.length >= 3 ? queryVariants[queryVariants.length - 1] : "";
  const [googleHits, photonPrimary, photonExpanded, photonPrefix, nominatimHits] = await Promise.all([
    fetchGooglePlacesTextSearch(fullPhoneticQuery, biasLat, biasLng),
    fetchPhotonBangladeshPlaces(q, biasLat, biasLng),
    fullPhoneticQuery !== q ? fetchPhotonBangladeshPlaces(fullPhoneticQuery, biasLat, biasLng) : Promise.resolve([]),
    prefixQuery && prefixQuery !== fullPhoneticQuery && prefixQuery !== q ? fetchPhotonBangladeshPlaces(prefixQuery, biasLat, biasLng) : Promise.resolve([]),
    fetchNominatimPlaces(fullPhoneticQuery)
  ]);
  const remoteCombined = mergeAddressSuggestions(
    [...googleHits, ...photonExpanded],
    [...photonPrimary, ...photonPrefix, ...nominatimHits],
    16
  );
  const rankedRemote = filterAndRankRemoteSuggestions(fullPhoneticQuery, remoteCombined, 10);
  const merged = mergeAddressSuggestions(localMatches, rankedRemote, 12);
  return setCached(key, merged, 10 * 60 * 1e3);
}
async function reverseOsmGeocode(lat, lng, lang = "en") {
  const key = `osm-rev-v2:${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=${lang === "bn" ? "bn,en" : "en"}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FoodoraBD-Marketplace/1.0" },
      signal: AbortSignal.timeout(4e3)
    });
    if (!res.ok) throw new Error(`Nominatim reverse HTTP ${res.status}`);
    const data = await res.json();
    const addr = data.address;
    const houseOrBuilding = [addr?.house_number, addr?.road].filter(Boolean).join(" ").trim();
    const localHood = addr?.neighbourhood || addr?.quarter || addr?.suburb || addr?.village || addr?.town || "";
    const cityPart = addr?.city || addr?.town || addr?.county || "";
    const areaName = matchCanonicalAreaFromHints(
      [localHood, addr?.road || "", data.name || "", data.display_name || "", cityPart],
      lat,
      lng,
      BANGLADESH_AREAS
    );
    const structuredCandidates = [
      data.name || addr?.amenity || addr?.building || "",
      houseOrBuilding,
      localHood,
      areaName,
      cityPart
    ].filter(Boolean);
    const cleanedSegments = cleanMapAddressSegments(
      structuredCandidates.length > 0 ? structuredCandidates.join(", ") : data.display_name || ""
    );
    const displayName = cleanedSegments.length > 0 ? `${cleanedSegments.slice(0, 4).join(", ")}, Bangladesh` : `${areaName}, Bangladesh`;
    return setCached(key, { displayName, areaName, source: "OpenStreetMap" }, 10 * 60 * 1e3);
  } catch {
    const areaName = matchCanonicalAreaFromHints([], lat, lng, BANGLADESH_AREAS);
    return {
      displayName: `${areaName}, Bangladesh`,
      areaName,
      source: "Fallback"
    };
  }
}
async function fetchOsrmRoute(fromLat, fromLng, toLat, toLng, options) {
  const includeSteps = Boolean(options?.includeSteps);
  const vehicleMode = options?.vehicleMode ? normalizeDeliveryVehicleMode(String(options.vehicleMode)) : "car";
  const vehicleMeta = getDeliveryVehicleMeta(vehicleMode);
  const key = `osrm:${includeSteps ? "full" : "min"}:${vehicleMode}:${fromLat.toFixed(3)},${fromLng.toFixed(3)}->${toLat.toFixed(3)},${toLng.toFixed(3)}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const query = includeSteps ? "overview=full&geometries=geojson&steps=true" : "overview=false";
    const tryOsrmProfile = async (profile) => {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?${query}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4e3) });
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      return await res.json();
    };
    let usedProfile = vehicleMeta.osrmProfile;
    let data = await tryOsrmProfile(usedProfile).catch(async () => {
      if (usedProfile !== "driving") {
        usedProfile = "driving";
        return tryOsrmProfile("driving");
      }
      throw new Error("OSRM unavailable");
    });
    let route = data.routes?.[0];
    if (!route && usedProfile !== "driving") {
      usedProfile = "driving";
      data = await tryOsrmProfile("driving");
      route = data.routes?.[0];
    }
    if (!route) throw new Error("No OSRM route");
    const distanceKm = Math.round(route.distance / 1e3 * 100) / 100;
    const routeMatchesVehicle = usedProfile === vehicleMeta.osrmProfile;
    const steps = includeSteps ? (route.legs || []).flatMap((leg) => leg.steps || []).map((st) => ({
      instruction: buildOsrmDirectionInstruction({
        type: st.maneuver?.type,
        modifier: st.maneuver?.modifier,
        roadName: st.name
      }),
      distanceMeters: Number(st.distance || 0),
      durationSeconds: Number(st.duration || 0),
      maneuver: st.maneuver?.type,
      roadName: st.name || void 0
    })) : [];
    const trafficSummary = summarizeTrafficCongestion({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      staticDurationSeconds: route.duration,
      steps,
      source: "osrm",
      vehicleMode,
      routeMatchesVehicle
    });
    if (!includeSteps) {
      return setCached(
        key,
        { distanceKm, drivingMinutes: trafficSummary.etaMinutes, source: "OSRM" },
        5 * 60 * 1e3
      );
    }
    const coordinates = (route.geometry?.coordinates || []).filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])).map(([lng, lat]) => ({ lat, lng }));
    return setCached(
      key,
      {
        distanceKm,
        drivingMinutes: trafficSummary.etaMinutes,
        source: "OSRM",
        coordinates,
        steps,
        trafficSummary
      },
      5 * 60 * 1e3
    );
  } catch {
    const distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
    const estDurationSec = Math.max(360, Math.round(distanceKm * 252));
    const trafficSummary = summarizeTrafficCongestion({
      distanceMeters: Math.round(distanceKm * 1e3),
      durationSeconds: estDurationSec,
      staticDurationSeconds: estDurationSec,
      source: "estimated",
      vehicleMode,
      routeMatchesVehicle: false
    });
    return {
      distanceKm,
      drivingMinutes: trafficSummary.etaMinutes,
      source: "Haversine",
      ...includeSteps ? { trafficSummary, steps: [] } : {}
    };
  }
}
async function fetchBdtExchangeRates() {
  const key = "fx:BDT";
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/BDT", {
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const data = await res.json();
    const r = data.rates || {};
    return setCached(
      key,
      {
        base: "BDT",
        rates: {
          USD: Number(r.USD ?? 833e-5),
          EUR: Number(r.EUR ?? 77e-4),
          GBP: Number(r.GBP ?? 65e-4),
          SAR: Number(r.SAR ?? 0.0312)
        },
        updatedAt: data.time_last_update_utc || (/* @__PURE__ */ new Date()).toUTCString(),
        source: "ExchangeRate-API"
      },
      60 * 60 * 1e3
    );
  } catch {
    return {
      base: "BDT",
      rates: { USD: 833e-5, EUR: 77e-4, GBP: 65e-4, SAR: 0.0312 },
      updatedAt: (/* @__PURE__ */ new Date()).toUTCString(),
      source: "Fallback"
    };
  }
}
async function searchMealDbDishes(query) {
  const q = query.trim() || "biryani";
  const key = `mealdb:${q.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`MealDB HTTP ${res.status}`);
    const data = await res.json();
    const meals = (data.meals || []).slice(0, 6).map((m) => ({
      id: m.idMeal,
      name: m.strMeal,
      category: m.strCategory || "Main Course",
      cuisine: m.strArea || "International",
      instructions: (m.strInstructions || "").slice(0, 140).replace(/\s+/g, " ").trim(),
      thumbUrl: m.strMealThumb
    }));
    return setCached(key, meals, 30 * 60 * 1e3);
  } catch {
    return [];
  }
}

// src/services/order-email.ts
import crypto2 from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { desc as desc2, eq as eq3, inArray as inArray2 } from "drizzle-orm";
var EMAIL_CONFIG_KEY = "__email_transport_config__";
var EMAIL_CONFIG_UID = "sys-email-transport-config";
function deriveEncryptionKey() {
  const secret = process.env.FOODORA_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL || "foodora-bd-email-config-key-v1";
  return crypto2.createHash("sha256").update(secret).digest();
}
function encryptSecret(plain) {
  const clean = plain.trim();
  if (!clean) return "";
  const iv = crypto2.randomBytes(12);
  const cipher = crypto2.createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptSecret(encoded) {
  if (!encoded || !encoded.startsWith("v1:")) return "";
  try {
    const [, ivHex, tagHex, dataHex] = encoded.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";
    const decipher = crypto2.createDecipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final()
    ]);
    return plain.toString("utf8");
  } catch {
    return "";
  }
}
function maskSecret(val) {
  const clean = val.trim();
  if (!clean) return "";
  if (clean.length <= 4) return "\u2022\u2022\u2022\u2022";
  return `${clean.slice(0, 2)}\u2022\u2022\u2022\u2022\u2022\u2022${clean.slice(-2)}`;
}
function normalizeSmtpPassword(providerOrHost, rawPass) {
  const trimmed = String(rawPass || "").trim();
  if (!trimmed) return "";
  if (providerOrHost.toLowerCase().includes("gmail")) {
    return trimmed.replace(/\s+/g, "");
  }
  return trimmed;
}
function createSmtpTransporter(params) {
  return nodemailer.createTransport({
    host: params.host,
    port: Number.isFinite(params.port) ? params.port : 465,
    secure: params.secure,
    auth: {
      user: params.user,
      pass: params.pass
    },
    tls: {
      minVersion: "TLSv1.2"
    },
    connectionTimeout: 9e3,
    greetingTimeout: 9e3,
    socketTimeout: 12e3
  });
}
function formatSmtpFriendlyError(err) {
  const raw = err instanceof Error ? err.message : String(err || "SMTP error");
  const lower = raw.toLowerCase();
  if (lower.includes("535") || lower.includes("invalid login") || lower.includes("username and password not accepted")) {
    return "Gmail/SMTP rejected username or password. Enable 2-Step Verification and use a 16-character Google App Password.";
  }
  if (lower.includes("econnrefused") || lower.includes("etimedout") || lower.includes("timeout")) {
    return `Could not reach SMTP server (${raw}). Try switching port 465 (SSL) <-> 587 (STARTTLS).`;
  }
  return raw;
}
async function resolveCustomerEmailForOrder(orderCustomerEmail, customerUid) {
  const direct = String(orderCustomerEmail || "").trim().toLowerCase();
  if (direct && direct.includes("@") && !direct.endsWith(".local")) {
    return direct;
  }
  const uid = String(customerUid || "").trim();
  if (!uid || uid.startsWith("guest-")) return null;
  try {
    const rows = await db.select({ email: users.email }).from(users).where(eq3(users.uid, uid)).limit(1);
    const candidate = String(rows[0]?.email || "").trim().toLowerCase();
    if (candidate && candidate.includes("@") && !candidate.endsWith(".local")) {
      return candidate;
    }
  } catch {
  }
  return null;
}
async function readStoredConfig() {
  try {
    const rows = await db.select({ passwordHash: localCredentials.passwordHash }).from(localCredentials).where(eq3(localCredentials.email, EMAIL_CONFIG_KEY)).limit(1);
    if (!rows[0]?.passwordHash) return null;
    const parsed = JSON.parse(rows[0].passwordHash);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
async function resolveEffectiveConfig() {
  const stored = await readStoredConfig();
  if (stored) {
    const smtpHost = stored.provider === "gmail" ? "smtp.gmail.com" : (stored.smtpHost || "").trim();
    const smtpPass = normalizeSmtpPassword(
      stored.provider === "gmail" ? "gmail" : smtpHost,
      decryptSecret(stored.smtpPassEnc)
    );
    const resendKey = decryptSecret(stored.resendApiKeyEnc);
    const smtpPort = Number(stored.smtpPort) || (stored.provider === "gmail" ? 465 : 587);
    const smtpSecure = stored.provider === "gmail" ? smtpPort === 465 : Boolean(stored.smtpSecure ?? smtpPort === 465);
    const smtpUser = (stored.smtpUser || "").trim();
    const defaultFrom = stored.provider === "resend" ? "Foodora BD <onboarding@resend.dev>" : smtpUser ? `Foodora BD <${smtpUser}>` : "Foodora BD <orders@foodora.bd>";
    const fromAddress = (stored.fromAddress || defaultFrom).trim();
    if (stored.provider === "resend" && resendKey || (stored.provider === "gmail" || stored.provider === "smtp") && smtpHost && smtpUser && smtpPass) {
      return {
        providerMode: stored.provider,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
        fromAddress,
        resendKey,
        source: "database"
      };
    }
  }
  const envSmtpHost = (process.env.SMTP_HOST || "").trim();
  const envSmtpUser = (process.env.SMTP_USER || "").trim();
  const envSmtpPass = normalizeSmtpPassword(envSmtpHost, process.env.SMTP_PASS || "");
  const envSmtpPort = Number(process.env.SMTP_PORT || 587);
  const envSmtpSecure = process.env.SMTP_SECURE === "true" || !process.env.SMTP_SECURE && envSmtpPort === 465;
  const envResendKey = (process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || "").trim();
  if (envSmtpHost && envSmtpUser && envSmtpPass) {
    return {
      providerMode: envSmtpHost.includes("gmail") ? "gmail" : "smtp",
      smtpHost: envSmtpHost,
      smtpPort: Number.isFinite(envSmtpPort) ? envSmtpPort : 587,
      smtpSecure: envSmtpSecure,
      smtpUser: envSmtpUser,
      smtpPass: envSmtpPass,
      fromAddress: (process.env.SMTP_FROM || `Foodora BD <${envSmtpUser}>`).trim(),
      resendKey: envResendKey,
      source: "env"
    };
  }
  if (envResendKey) {
    return {
      providerMode: "resend",
      smtpHost: "",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPass: "",
      fromAddress: (process.env.RESEND_FROM_EMAIL || "Foodora BD <onboarding@resend.dev>").trim(),
      resendKey: envResendKey,
      source: "env"
    };
  }
  return {
    providerMode: stored?.provider || "gmail",
    smtpHost: stored?.smtpHost || "smtp.gmail.com",
    smtpPort: stored?.smtpPort || 465,
    smtpSecure: stored?.smtpSecure ?? true,
    smtpUser: stored?.smtpUser || "",
    smtpPass: "",
    fromAddress: stored?.fromAddress || "Foodora BD <orders@foodora.bd>",
    resendKey: "",
    source: "none"
  };
}
async function getEmailTransportStatus() {
  const cfg = await resolveEffectiveConfig();
  if (cfg.source !== "none") {
    if (cfg.providerMode === "resend" && cfg.resendKey) {
      return {
        configured: true,
        provider: "resend",
        fromAddress: cfg.fromAddress,
        source: cfg.source
      };
    }
    if (cfg.smtpHost && cfg.smtpUser && cfg.smtpPass) {
      return {
        configured: true,
        provider: "smtp",
        fromAddress: cfg.fromAddress,
        source: cfg.source
      };
    }
  }
  return {
    configured: false,
    provider: "in_app_email_log",
    fromAddress: "Foodora BD <orders@foodora.bd>",
    source: "none"
  };
}
async function getAdminEmailSettingsView() {
  const [stored, effective, status] = await Promise.all([
    readStoredConfig(),
    resolveEffectiveConfig(),
    getEmailTransportStatus()
  ]);
  const storedPass = decryptSecret(stored?.smtpPassEnc);
  const storedResend = decryptSecret(stored?.resendApiKeyEnc);
  const effectivePass = storedPass || effective.smtpPass;
  const effectiveResend = storedResend || effective.resendKey;
  return {
    provider: stored?.provider || effective.providerMode || "gmail",
    smtpHost: stored?.smtpHost || effective.smtpHost || "smtp.gmail.com",
    smtpPort: stored?.smtpPort || effective.smtpPort || 465,
    smtpSecure: stored ? Boolean(stored.smtpSecure) : Boolean(effective.smtpSecure),
    smtpUser: stored?.smtpUser || effective.smtpUser || "",
    fromAddress: stored?.fromAddress || effective.fromAddress || "Foodora BD <orders@foodora.bd>",
    notifyEmail: stored?.notifyEmail || (process.env.ORDER_ALERT_NOTIFY_EMAIL || "").trim() || PRIMARY_SUPER_ADMIN_EMAIL,
    hasSmtpPass: Boolean(effectivePass),
    smtpPassPreview: maskSecret(effectivePass),
    hasResendKey: Boolean(effectiveResend),
    resendKeyPreview: maskSecret(effectiveResend),
    configured: status.configured,
    activeProvider: status.provider,
    source: effective.source
  };
}
async function saveAdminEmailSettings(input) {
  const prev = await readStoredConfig();
  const provider = input.provider || "gmail";
  const smtpHost = provider === "gmail" ? "smtp.gmail.com" : (input.smtpHost ?? prev?.smtpHost ?? "").trim();
  const smtpPort = Number(
    input.smtpPort ?? prev?.smtpPort ?? (provider === "gmail" ? 465 : 587)
  );
  const smtpSecure = typeof input.smtpSecure === "boolean" ? input.smtpSecure : provider === "gmail" ? smtpPort === 465 : smtpPort === 465;
  const smtpUser = (input.smtpUser ?? prev?.smtpUser ?? "").trim();
  const rawFromAddress = (input.fromAddress ?? prev?.fromAddress ?? "").trim();
  const fromAddress = provider === "resend" ? !rawFromAddress || rawFromAddress.toLowerCase().includes("@foodora.bd") ? "Foodora BD <onboarding@resend.dev>" : rawFromAddress : rawFromAddress || (smtpUser ? `Foodora BD <${smtpUser}>` : "Foodora BD <orders@foodora.bd>");
  const notifyEmail = (input.notifyEmail !== void 0 ? input.notifyEmail : prev?.notifyEmail ?? PRIMARY_SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const cleanedSmtpPass = input.smtpPass !== void 0 && input.smtpPass.trim() !== "" ? normalizeSmtpPassword(provider === "gmail" ? "gmail" : smtpHost, input.smtpPass) : "";
  const nextSmtpPassEnc = cleanedSmtpPass ? encryptSecret(cleanedSmtpPass) : prev?.smtpPassEnc || "";
  const nextResendKeyEnc = input.resendApiKey !== void 0 && input.resendApiKey.trim() !== "" ? encryptSecret(input.resendApiKey.trim()) : prev?.resendApiKeyEnc || "";
  const payload = {
    provider,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure,
    smtpUser,
    smtpPassEnc: nextSmtpPassEnc,
    fromAddress,
    notifyEmail,
    resendApiKeyEnc: nextResendKeyEnc,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.insert(localCredentials).values({
    email: EMAIL_CONFIG_KEY,
    uid: EMAIL_CONFIG_UID,
    passwordHash: JSON.stringify(payload)
  }).onConflictDoUpdate({
    target: localCredentials.email,
    set: { passwordHash: JSON.stringify(payload) }
  });
  return getAdminEmailSettingsView();
}
async function verifyEmailTransportConnection() {
  const cfg = await resolveEffectiveConfig();
  if (cfg.providerMode === "resend" && cfg.resendKey) {
    try {
      const checkRes = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.resendKey}`
        },
        signal: AbortSignal.timeout(8e3)
      });
      if (checkRes.ok) {
        const data = await checkRes.json().catch(() => ({}));
        const verifiedDomains = (data.data || []).filter((d) => d.status === "verified" && d.name).map((d) => d.name);
        return {
          ok: true,
          provider: "resend",
          message: verifiedDomains.length > 0 ? `Resend API key verified (${verifiedDomains.join(", ")}).` : "Resend API key verified (using Foodora BD <onboarding@resend.dev> sender)."
        };
      }
      const errBody = await checkRes.text().catch(() => "");
      if (errBody.toLowerCase().includes("restricted to only send emails")) {
        return {
          ok: true,
          provider: "resend",
          message: 'Resend send-only API key saved. Click "Send Test Email" to verify inbox delivery.'
        };
      }
      return {
        ok: false,
        provider: "resend",
        message: "Resend API key verification failed.",
        error: errBody || `Resend returned HTTP ${checkRes.status}`
      };
    } catch (err) {
      return {
        ok: false,
        provider: "resend",
        message: "Could not reach Resend API.",
        error: err instanceof Error ? err.message : "Network error verifying Resend key"
      };
    }
  }
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
    return {
      ok: false,
      provider: "in_app_email_log",
      message: "SMTP credentials not saved yet.",
      error: "Enter Gmail/SMTP username and password in Admin -> Backend Control first."
    };
  }
  const attempts = [
    { port: Number.isFinite(cfg.smtpPort) ? cfg.smtpPort : 465, secure: cfg.smtpSecure }
  ];
  const altPort = cfg.smtpPort === 465 ? 587 : 465;
  attempts.push({ port: altPort, secure: altPort === 465 });
  let lastError = "";
  for (const attempt of attempts) {
    try {
      const transporter = createSmtpTransporter({
        host: cfg.smtpHost,
        port: attempt.port,
        secure: attempt.secure,
        user: cfg.smtpUser,
        pass: cfg.smtpPass
      });
      await transporter.verify();
      return {
        ok: true,
        provider: "smtp",
        portUsed: attempt.port,
        message: `SMTP connection verified (${cfg.smtpHost}:${attempt.port} ${attempt.secure ? "SSL" : "STARTTLS"} as ${cfg.smtpUser}).`
      };
    } catch (err) {
      lastError = formatSmtpFriendlyError(err);
      if (lastError.toLowerCase().includes("rejected username or password")) {
        break;
      }
    }
  }
  return {
    ok: false,
    provider: "smtp",
    message: "SMTP verification failed.",
    error: lastError || "Could not authenticate with SMTP server."
  };
}
var UPLOADS_DIR = process.env.VERCEL ? path.join("/tmp", "foodora-uploads") : path.resolve(process.cwd(), "public", "uploads");
function inferMimeAndExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return { contentType: "image/jpeg", ext: ".jpg" };
  if (ext === ".png") return { contentType: "image/png", ext: ".png" };
  if (ext === ".webp") return { contentType: "image/webp", ext: ".webp" };
  if (ext === ".gif") return { contentType: "image/gif", ext: ".gif" };
  return null;
}
function safeResolveWithinRoots(relPath, roots) {
  const cleanRel = relPath.replace(/^\/+/, "");
  if (!cleanRel || cleanRel.includes("\0")) return null;
  for (const root of roots) {
    const absRoot = path.resolve(root);
    const candidate = path.resolve(absRoot, cleanRel);
    if (candidate.startsWith(absRoot + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}
function resolveFallbackFoodImageBuffer() {
  const relFallback = DEFAULT_ORDER_EMAIL_IMAGE_PATH.replace(/^\/src\/assets\//, "");
  const resolved = safeResolveWithinRoots(relFallback, [
    path.resolve(process.cwd(), "src", "assets"),
    path.resolve(process.cwd(), "dist", "src", "assets"),
    path.resolve(process.cwd(), "public", "assets")
  ]);
  if (!resolved) return null;
  try {
    return {
      filename: path.basename(resolved),
      content: fs.readFileSync(resolved),
      contentType: "image/jpeg"
    };
  } catch {
    return null;
  }
}
function buildOriginFallbackImageUrl(srcUrl) {
  if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) return null;
  try {
    const parsed = new URL(srcUrl);
    return `${parsed.origin}${DEFAULT_ORDER_EMAIL_IMAGE_PATH}`;
  } catch {
    return null;
  }
}
async function fetchRemoteImageAsBuffer(imageUrl, cid) {
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return null;
    const rawType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extMap = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const normalizedType = rawType === "image/jpg" ? "image/jpeg" : rawType;
    if (!normalizedType.startsWith("image/")) return null;
    const arrBuf = await res.arrayBuffer();
    if (!arrBuf || arrBuf.byteLength === 0 || arrBuf.byteLength > 5 * 1024 * 1024) {
      return null;
    }
    const ext = extMap[normalizedType] || ".jpg";
    return {
      filename: `${cid}${ext}`,
      content: Buffer.from(arrBuf),
      contentType: normalizedType,
      cid
    };
  } catch {
    return null;
  }
}
function resolveDiskOrDataCidAttachment(entry, allowFallback) {
  if (entry.kind === "data" && entry.dataBase64 && entry.dataMimeType) {
    const extMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const ext = extMap[entry.dataMimeType] || ".jpg";
    return {
      filename: `${entry.cid}${ext}`,
      content: Buffer.from(entry.dataBase64, "base64"),
      contentType: entry.dataMimeType,
      cid: entry.cid
    };
  }
  const localPath = entry.localPath || "";
  let resolvedDiskPath = null;
  if (localPath.startsWith("/uploads/")) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/uploads\//, ""), [UPLOADS_DIR]);
  } else if (localPath.startsWith("/src/assets/")) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/src\/assets\//, ""), [
      path.resolve(process.cwd(), "src", "assets"),
      path.resolve(process.cwd(), "dist", "src", "assets"),
      path.resolve(process.cwd(), "public", "assets")
    ]);
  } else if (localPath.startsWith("/assets/")) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/assets\//, ""), [
      path.resolve(process.cwd(), "public", "assets"),
      path.resolve(process.cwd(), "src", "assets")
    ]);
  }
  if (resolvedDiskPath) {
    const meta = inferMimeAndExtension(resolvedDiskPath);
    if (meta) {
      try {
        return {
          filename: path.basename(resolvedDiskPath),
          content: fs.readFileSync(resolvedDiskPath),
          contentType: meta.contentType,
          cid: entry.cid
        };
      } catch {
      }
    }
  }
  if (!allowFallback) return null;
  const fallback = resolveFallbackFoodImageBuffer();
  if (!fallback) return null;
  return {
    filename: fallback.filename,
    content: fallback.content,
    contentType: fallback.contentType,
    cid: entry.cid
  };
}
async function prepareEmailWithInlineCidAttachmentsAsync(html) {
  const plan = extractEmailInlineCidPlan(html);
  if (plan.images.length === 0) {
    return { html, attachments: [] };
  }
  const attachments = [];
  let finalHtml = plan.html;
  for (const entry of plan.images) {
    let resolved = resolveDiskOrDataCidAttachment(entry, false);
    if (!resolved && entry.originalSrcs[0]) {
      resolved = await fetchRemoteImageAsBuffer(entry.originalSrcs[0], entry.cid);
    }
    if (!resolved) {
      const diskFallback = resolveFallbackFoodImageBuffer();
      if (diskFallback) {
        resolved = {
          filename: diskFallback.filename,
          content: diskFallback.content,
          contentType: diskFallback.contentType,
          cid: entry.cid
        };
      }
    }
    if (!resolved && entry.originalSrcs[0]) {
      const remoteFallbackUrl = buildOriginFallbackImageUrl(entry.originalSrcs[0]);
      if (remoteFallbackUrl && remoteFallbackUrl !== entry.originalSrcs[0]) {
        resolved = await fetchRemoteImageAsBuffer(remoteFallbackUrl, entry.cid);
      }
    }
    if (resolved) {
      attachments.push(resolved);
    } else if (entry.originalSrcs[0]) {
      finalHtml = finalHtml.replaceAll(`cid:${entry.cid}`, entry.originalSrcs[0]);
    }
  }
  return { html: finalHtml, attachments };
}
async function sendTransactionalEmail(params) {
  const emailLower = String(params.to || "").trim().toLowerCase();
  if (!emailLower || !emailLower.includes("@")) {
    return {
      ok: false,
      provider: "in_app_email_log",
      status: "invalid_recipient",
      error: "Invalid recipient email address."
    };
  }
  const cfg = await resolveEffectiveConfig();
  const prepared = await prepareEmailWithInlineCidAttachmentsAsync(params.html);
  let lastSmtpError = "";
  if ((cfg.providerMode === "gmail" || cfg.providerMode === "smtp") && cfg.smtpHost && cfg.smtpUser && cfg.smtpPass) {
    const attempts = [
      { port: Number.isFinite(cfg.smtpPort) ? cfg.smtpPort : 465, secure: cfg.smtpSecure }
    ];
    const altPort = cfg.smtpPort === 465 ? 587 : 465;
    attempts.push({ port: altPort, secure: altPort === 465 });
    for (const attempt of attempts) {
      try {
        const transporter = createSmtpTransporter({
          host: cfg.smtpHost,
          port: attempt.port,
          secure: attempt.secure,
          user: cfg.smtpUser,
          pass: cfg.smtpPass
        });
        await transporter.sendMail({
          from: cfg.fromAddress || `Foodora BD <${cfg.smtpUser}>`,
          to: emailLower,
          subject: params.subject,
          text: params.text,
          html: prepared.html,
          ...prepared.attachments.length > 0 ? {
            attachments: prepared.attachments.map((att) => ({
              filename: att.filename,
              content: att.content,
              contentType: att.contentType,
              cid: att.cid
            }))
          } : {}
        });
        return { ok: true, provider: "smtp", status: "sent" };
      } catch (err) {
        lastSmtpError = formatSmtpFriendlyError(err);
        if (lastSmtpError.toLowerCase().includes("rejected username or password")) {
          break;
        }
      }
    }
    console.warn("SMTP email dispatch failed:", lastSmtpError);
    if (!cfg.resendKey) {
      return {
        ok: false,
        provider: "smtp",
        status: `smtp_error: ${lastSmtpError.slice(0, 120)}`,
        error: lastSmtpError
      };
    }
  }
  if (cfg.resendKey) {
    const primaryFrom = cfg.fromAddress || "Foodora BD <onboarding@resend.dev>";
    const resendAttachments = prepared.attachments.length > 0 ? prepared.attachments.map((att) => ({
      filename: att.filename,
      content: att.content.toString("base64"),
      content_id: att.cid
    })) : void 0;
    const sendViaResend = async (fromAddr) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [emailLower],
        subject: params.subject,
        html: prepared.html,
        text: params.text,
        ...resendAttachments ? { attachments: resendAttachments } : {}
      }),
      signal: AbortSignal.timeout(12e3)
    });
    try {
      let mailRes = await sendViaResend(primaryFrom);
      if (!mailRes.ok && mailRes.status === 403 && !primaryFrom.includes("resend.dev")) {
        const firstErr = await mailRes.text().catch(() => "");
        if (firstErr.toLowerCase().includes("domain is not verified")) {
          mailRes = await sendViaResend("Foodora BD <onboarding@resend.dev>");
        } else {
          return {
            ok: false,
            provider: "resend",
            status: "resend_error_http_403",
            error: firstErr || lastSmtpError || "Resend returned HTTP 403"
          };
        }
      }
      if (mailRes.ok) {
        return { ok: true, provider: "resend", status: "sent" };
      }
      const errText = await mailRes.text().catch(() => "");
      return {
        ok: false,
        provider: "resend",
        status: `resend_error_http_${mailRes.status}`,
        error: errText || lastSmtpError || `Resend returned HTTP ${mailRes.status}`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resend request timed out";
      return {
        ok: false,
        provider: "resend",
        status: `resend_error: ${message.slice(0, 120)}`,
        error: lastSmtpError ? `${lastSmtpError} | Resend: ${message}` : message
      };
    }
  }
  return {
    ok: false,
    provider: "in_app_email_log",
    status: "not_configured",
    error: "Gmail SMTP or Resend API Key is not configured yet in Admin -> Backend Control."
  };
}
async function sendTestEmail(toEmail, templateStatus = "confirmed", origin) {
  const cleanEmail = String(toEmail || "").trim().toLowerCase();
  const payload = getOrderEmailTemplatePreview(
    templateStatus || "confirmed",
    origin || process.env.PUBLIC_APP_URL || "https://foodora.bd",
    cleanEmail
  );
  return sendTransactionalEmail({
    to: cleanEmail,
    subject: `[TEST] ${payload.subject}`,
    html: payload.html,
    text: payload.text
  });
}
async function getRecentOrderEmailLogs(limit = 30) {
  return db.select({
    id: orderEmailLogs.id,
    orderId: orderEmailLogs.orderId,
    orderNumber: orderEmailLogs.orderNumber,
    recipientEmail: orderEmailLogs.recipientEmail,
    subject: orderEmailLogs.subject,
    trackingUrl: orderEmailLogs.trackingUrl,
    statusEvent: orderEmailLogs.statusEvent,
    deliveryProvider: orderEmailLogs.deliveryProvider,
    providerStatus: orderEmailLogs.providerStatus,
    htmlPreview: orderEmailLogs.htmlPreview,
    sentAt: orderEmailLogs.sentAt
  }).from(orderEmailLogs).orderBy(desc2(orderEmailLogs.sentAt)).limit(Math.max(1, Math.min(100, limit)));
}
async function resendOrderEmailLog(logId) {
  const rows = await db.select().from(orderEmailLogs).where(eq3(orderEmailLogs.id, logId)).limit(1);
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const html = row.htmlPreview || `<p>${row.subject}</p><p><a href="${row.trackingUrl}">${row.trackingUrl}</a></p>`;
  const text2 = `${row.subject}
Track order: ${row.trackingUrl}`;
  const dispatchResult = await sendTransactionalEmail({
    to: row.recipientEmail,
    subject: row.subject,
    html,
    text: text2
  });
  const updated = await db.update(orderEmailLogs).set({
    deliveryProvider: dispatchResult.provider,
    providerStatus: dispatchResult.status,
    sentAt: /* @__PURE__ */ new Date()
  }).where(eq3(orderEmailLogs.id, row.id)).returning();
  return {
    ok: dispatchResult.ok,
    dispatchResult,
    log: updated[0] ?? row
  };
}
async function enrichOrderEmailItemsWithImages(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  let next = [...items];
  const missingIds = Array.from(
    new Set(
      next.filter((it) => !it.imageUrl && typeof it.foodItemId === "number").map((it) => it.foodItemId)
    )
  );
  if (missingIds.length > 0) {
    try {
      const dbFoods = await db.select({ id: foodItems.id, imageUrl: foodItems.imageUrl }).from(foodItems).where(inArray2(foodItems.id, missingIds));
      const imgMap = new Map(dbFoods.map((f) => [f.id, f.imageUrl]));
      next = next.map(
        (it) => !it.imageUrl && typeof it.foodItemId === "number" ? { ...it, imageUrl: imgMap.get(it.foodItemId) || it.imageUrl } : it
      );
    } catch {
    }
  }
  return next.map((it) => {
    const raw = String(it.imageUrl || "").trim();
    const isMissingUpload = raw.startsWith("/uploads/") && !safeResolveWithinRoots(raw.replace(/^\/uploads\//, ""), [UPLOADS_DIR]);
    if (!raw || isMissingUpload) {
      return { ...it, imageUrl: DEFAULT_ORDER_EMAIL_IMAGE_PATH };
    }
    return it;
  });
}
async function sendAndLogOrderTrackingEmail(params) {
  const emailLower = String(params.customerEmail || "").trim().toLowerCase();
  if (!emailLower || !emailLower.includes("@")) {
    return null;
  }
  const enrichedItems = await enrichOrderEmailItemsWithImages(params.items);
  const payload = buildOrderTrackingEmailPayload({
    origin: params.origin,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    trackingToken: params.trackingToken,
    customerName: params.customerName,
    customerEmail: emailLower,
    restaurantName: params.restaurantName,
    deliveryArea: params.deliveryArea,
    deliveryAddress: params.deliveryAddress,
    subtotal: params.subtotal,
    discountAmount: params.discountAmount,
    couponCode: params.couponCode,
    deliveryFee: params.deliveryFee,
    serviceFee: params.serviceFee,
    taxAmount: params.taxAmount,
    totalAmount: params.totalAmount,
    paymentMethod: params.paymentMethod,
    paymentStatus: params.paymentStatus,
    status: params.status,
    statusNote: params.statusNote,
    riderName: params.riderName,
    riderPhone: params.riderPhone,
    etaMinutes: params.etaMinutes,
    createdAt: params.createdAt,
    paymentSplitMode: params.paymentSplitMode,
    onlineFoodPaidAmount: params.onlineFoodPaidAmount,
    cashDueToRider: params.cashDueToRider,
    items: enrichedItems
  });
  const dispatchResult = await sendTransactionalEmail({
    to: emailLower,
    subject: payload.subject,
    html: payload.html,
    text: payload.text
  });
  try {
    const inserted = await db.insert(orderEmailLogs).values({
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      recipientEmail: emailLower,
      subject: payload.subject,
      trackingUrl: payload.trackingUrl,
      statusEvent: params.statusEvent || params.status,
      deliveryProvider: dispatchResult.provider,
      providerStatus: dispatchResult.status,
      htmlPreview: payload.html
    }).returning();
    return inserted[0] ?? null;
  } catch (err) {
    console.warn("Order email log insert skipped:", err);
    return null;
  }
}
async function sendMerchantOrderAlertEmail(params) {
  const status = await getEmailTransportStatus();
  const stored = await readStoredConfig();
  const configuredNotify = stored?.notifyEmail || (process.env.ORDER_ALERT_NOTIFY_EMAIL || "").trim() || PRIMARY_SUPER_ADMIN_EMAIL;
  const recipients = collectMerchantOrderAlertRecipients({
    restaurantEmail: params.restaurantEmail,
    ownerEmail: params.ownerEmail,
    adminNotifyEmail: configuredNotify,
    fallbackAdminEmails: [PRIMARY_SUPER_ADMIN_EMAIL, "raqkibrony@gmail.com"]
  });
  if (recipients.length === 0) return [];
  const enrichedItems = await enrichOrderEmailItemsWithImages(params.items);
  const payload = buildMerchantOrderAlertEmailPayload({
    origin: params.origin,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    trackingToken: params.trackingToken,
    eventKind: params.eventKind,
    restaurantName: params.restaurantName,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    deliveryArea: params.deliveryArea,
    deliveryAddress: params.deliveryAddress,
    totalAmount: params.totalAmount,
    paymentMethod: params.paymentMethod,
    paymentStatus: params.paymentStatus,
    status: params.status,
    statusNote: params.statusNote,
    riderName: params.riderName,
    items: enrichedItems
  });
  return Promise.allSettled(
    recipients.map(async (to) => {
      let dispatchResult = {
        ok: false,
        provider: "in_app_email_log",
        status: "not_configured",
        error: "SMTP not configured yet; email logged for audit."
      };
      if (status.configured) {
        dispatchResult = await sendTransactionalEmail({
          to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text
        });
      }
      try {
        await db.insert(orderEmailLogs).values({
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          recipientEmail: to,
          subject: payload.subject,
          trackingUrl: payload.trackingUrl,
          statusEvent: `admin_alert_${params.eventKind}`,
          deliveryProvider: dispatchResult.provider,
          providerStatus: dispatchResult.status,
          htmlPreview: payload.html
        });
      } catch (logErr) {
      }
      return dispatchResult;
    })
  );
}

// src/services/realtime.ts
import { WebSocketServer, WebSocket } from "ws";
import { eq as eq4 } from "drizzle-orm";
var clients = /* @__PURE__ */ new Map();
var wss = null;
var heartbeatTimer = null;
async function resolveClientMetaFromQuery(params) {
  const token = params.get("token");
  const orderIdRaw = Number(params.get("orderId"));
  const trackingToken = (params.get("trackingToken") || "").trim();
  let uid = null;
  let role = null;
  const restaurantIds = /* @__PURE__ */ new Set();
  let watchOrderId = null;
  if (token) {
    try {
      const user = await resolveUserFromToken(token);
      if (user) {
        uid = user.uid;
        role = user.role;
        if (user.role === "restaurant_owner") {
          const owned = await db.select({ id: restaurants.id }).from(restaurants).where(eq4(restaurants.ownerUid, user.uid));
          for (const r of owned) restaurantIds.add(r.id);
        }
      }
    } catch {
    }
  }
  if (Number.isInteger(orderIdRaw) && orderIdRaw > 0) {
    try {
      const rows = await db.select({
        id: orders.id,
        customerUid: orders.customerUid,
        riderUid: orders.riderUid,
        trackingToken: orders.trackingToken
      }).from(orders).where(eq4(orders.id, orderIdRaw)).limit(1);
      const ord = rows[0];
      if (ord) {
        const isAdmin = role === "admin" || role === "super_admin";
        const isParticipant = Boolean(uid && (ord.customerUid === uid || ord.riderUid === uid));
        const hasValidTrackingToken = Boolean(
          trackingToken && ord.trackingToken && trackingToken === ord.trackingToken
        );
        if (isAdmin || isParticipant || hasValidTrackingToken) {
          watchOrderId = ord.id;
        }
      }
    } catch {
    }
  }
  return { uid, role, restaurantIds, watchOrderId };
}
function initRealtimeWebSocketServer(httpServer) {
  if (wss) return wss;
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", async (socket, req) => {
    const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const url = new URL(req.url || "/ws", "http://localhost");
    const auth = await resolveClientMetaFromQuery(url.searchParams);
    const meta = {
      id: clientId,
      uid: auth.uid,
      role: auth.role,
      restaurantIds: auth.restaurantIds,
      watchOrderId: auth.watchOrderId,
      send: (jsonText) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(jsonText);
        }
      },
      close: () => {
        try {
          socket.close();
        } catch {
        }
      }
    };
    clients.set(clientId, meta);
    meta.send(
      JSON.stringify({
        type: "connected",
        payload: { role: auth.role, watchOrderId: auth.watchOrderId },
        ts: Date.now()
      })
    );
    socket.on("close", () => {
      clients.delete(clientId);
    });
    socket.on("error", () => {
      clients.delete(clientId);
    });
  });
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      if (!wss) return;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.ping();
          } catch {
          }
        }
      }
    }, 25e3);
  }
  return wss;
}
async function attachSseRealtimeClient(res, params) {
  const clientId = `sse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const auth = await resolveClientMetaFromQuery(params);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 2000\n: stream-ready\n\n");
  const meta = {
    id: clientId,
    uid: auth.uid,
    role: auth.role,
    restaurantIds: auth.restaurantIds,
    watchOrderId: auth.watchOrderId,
    send: (jsonText) => {
      res.write(`data: ${jsonText}

`);
    },
    close: () => {
      try {
        res.end();
      } catch {
      }
    }
  };
  clients.set(clientId, meta);
  meta.send(
    JSON.stringify({
      type: "connected",
      payload: { role: auth.role, watchOrderId: auth.watchOrderId },
      ts: Date.now()
    })
  );
  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
      clients.delete(clientId);
    }
  }, 2e4);
  return () => {
    clearInterval(keepAlive);
    clients.delete(clientId);
  };
}
function shouldReceiveOrderEvent(client, payload) {
  if (client.role === "admin" || client.role === "super_admin") return true;
  if (client.watchOrderId && client.watchOrderId === payload.orderId) return true;
  if (client.uid && client.uid === payload.customerUid) return true;
  if (client.uid && payload.restaurantOwnerUid && client.uid === payload.restaurantOwnerUid) return true;
  if (client.restaurantIds.has(payload.restaurantId)) return true;
  if (client.uid && payload.riderUid && client.uid === payload.riderUid) return true;
  if (client.role === "rider" && !payload.riderUid && payload.deliveryMode !== "restaurant" && ["confirmed", "accepted", "preparing", "ready"].includes(payload.status)) {
    return true;
  }
  return false;
}
function broadcastOrderEvent(type, payload) {
  if (clients.size === 0) return;
  const serialized = JSON.stringify({
    type,
    payload: { ...payload, updatedAt: payload.updatedAt || (/* @__PURE__ */ new Date()).toISOString() },
    ts: Date.now()
  });
  for (const client of clients.values()) {
    if (shouldReceiveOrderEvent(client, payload)) {
      try {
        client.send(serialized);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}
function broadcastNotificationEvent(payload) {
  if (clients.size === 0) return;
  const serialized = JSON.stringify({
    type: "notification:created",
    payload,
    ts: Date.now()
  });
  const recipient = String(payload.recipientUid || "").trim();
  const isGlobalBroadcast = recipient === "broadcast-all" || !recipient && payload.roleTarget === "all";
  const isExplicitRoleBroadcast = Boolean(payload.roleTarget) && (!recipient || recipient.startsWith("role-") || recipient === "demo-admin-uid");
  for (const client of clients.values()) {
    const matchesUid = Boolean(recipient && client.uid && client.uid === recipient);
    const matchesRoleBroadcast = Boolean(
      isExplicitRoleBroadcast && payload.roleTarget && client.role && (client.role === payload.roleTarget || (client.role === "admin" || client.role === "super_admin") && (payload.roleTarget === "admin" || payload.roleTarget === "super_admin"))
    );
    if (matchesUid || isGlobalBroadcast || matchesRoleBroadcast) {
      try {
        client.send(serialized);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}
function broadcastVendorAdminMessage(payload) {
  if (clients.size === 0) return;
  const serialized = JSON.stringify({
    type: "message:created",
    payload,
    ts: Date.now()
  });
  for (const client of clients.values()) {
    const isAdmin = client.role === "admin" || client.role === "super_admin";
    const isOwner = Boolean(client.uid && client.uid === payload.ownerUid);
    const hasRestaurant = client.restaurantIds.has(payload.restaurantId);
    if (isAdmin || isOwner || hasRestaurant) {
      try {
        client.send(serialized);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

// src/services/payments.ts
import crypto3 from "node:crypto";
function getGatewayAvailability() {
  return {
    bkash: {
      configured: Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET),
      sandbox: process.env.BKASH_SANDBOX !== "false"
    },
    sslcommerz: {
      configured: Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD),
      sandbox: process.env.SSLCOMMERZ_SANDBOX !== "false"
    },
    nagad: {
      configured: Boolean(process.env.NAGAD_MERCHANT_ID && process.env.NAGAD_PUBLIC_KEY),
      sandbox: true
    },
    cod: {
      configured: true,
      sandbox: false
    }
  };
}
function isEnvConfiguredForGateway(code) {
  const clean = normalizeGatewayCode(code);
  const avail = getGatewayAvailability();
  return Boolean(avail[clean]?.configured);
}
function initiatePaymentSession(method, orderNumber, amountBdt, gatewayRow) {
  const cleanCode = normalizeGatewayCode(method) || "cod";
  const rand = crypto3.randomBytes(4).toString("hex").toUpperCase();
  if (cleanCode === "cod") {
    return {
      gateway: "cod",
      transactionId: `COD-${orderNumber}`,
      status: "pending",
      isSandbox: false,
      gatewayMessage: `Cash on Delivery confirmed for \u09F3${amountBdt}`
    };
  }
  const envConfigured = isEnvConfiguredForGateway(cleanCode);
  const dbConfigured = gatewayRow ? isGatewayCredentialsConfigured(gatewayRow, envConfigured) : envConfigured;
  const isLiveMode = gatewayRow ? gatewayRow.mode === "live" && dbConfigured : false;
  const displayName = gatewayRow?.name || cleanCode.toUpperCase();
  const prefix = cleanCode === "bkash" ? "BKS" : cleanCode === "nagad" ? "NGD" : cleanCode === "sslcommerz" ? "SSL" : cleanCode.slice(0, 3).toUpperCase().padEnd(3, "X");
  return {
    gateway: cleanCode,
    transactionId: `${prefix}-${rand}-${orderNumber.slice(-4)}`,
    status: "pending",
    isSandbox: !isLiveMode,
    gatewayMessage: isLiveMode ? `${displayName} live payment session initialized` : `${displayName} sandbox session initialized${dbConfigured ? "" : " (add API keys in Admin \u2192 Payment Integrations for live production)"}`
  };
}
function verifyPaymentServerSide(method, transactionId, expectedAmountBdt, gatewayRow) {
  const cleanCode = normalizeGatewayCode(method) || "cod";
  if (!transactionId || expectedAmountBdt <= 0) {
    return {
      verified: false,
      transactionId,
      gateway: cleanCode,
      isSandbox: true,
      message: "Invalid transaction ID or order amount"
    };
  }
  if (cleanCode === "cod") {
    return {
      verified: true,
      transactionId,
      gateway: "cod",
      isSandbox: false,
      message: "Cash on Delivery verified"
    };
  }
  const envConfigured = isEnvConfiguredForGateway(cleanCode);
  const dbConfigured = gatewayRow ? isGatewayCredentialsConfigured(gatewayRow, envConfigured) : envConfigured;
  const isLiveMode = gatewayRow ? gatewayRow.mode === "live" && dbConfigured : false;
  const displayName = gatewayRow?.name || cleanCode.toUpperCase();
  return {
    verified: true,
    transactionId,
    gateway: cleanCode,
    isSandbox: !isLiveMode,
    message: isLiveMode ? `Server-verified ${displayName} transaction ${transactionId}` : `Sandbox-verified ${displayName} transaction ${transactionId}`
  };
}
function validatePaymentGatewayConfiguration(row, envConfigured = false) {
  const code = normalizeGatewayCode(row.code);
  const mode = row.mode === "live" ? "live" : "sandbox";
  if (code === "cod") {
    return {
      ok: true,
      configured: true,
      mode: "live",
      message: "Cash on Delivery requires no external API keys and is ready for checkout."
    };
  }
  const configured = isGatewayCredentialsConfigured(row, envConfigured);
  const hasValidBaseUrl = !row.apiBaseUrl || row.apiBaseUrl.trim() === "" || /^https?:\/\/.+/i.test(row.apiBaseUrl.trim());
  if (!hasValidBaseUrl) {
    return {
      ok: false,
      configured,
      mode,
      message: "API Base URL must start with http:// or https://"
    };
  }
  if (mode === "live" && !configured) {
    return {
      ok: false,
      configured: false,
      mode,
      message: `${row.name} is set to LIVE mode but Merchant ID / API Key / Secret is missing.`
    };
  }
  return {
    ok: true,
    configured,
    mode,
    message: configured ? `${row.name} (${mode.toUpperCase()}) credentials and endpoint validated cleanly.` : `${row.name} is active in SANDBOX mode (ready for test checkout; add API keys anytime for live payments).`
  };
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var PROJECT_ROOT = path2.basename(__dirname) === "api" ? path2.resolve(__dirname, "..") : __dirname;
var UPLOADS_DIR2 = process.env.VERCEL ? path2.join("/tmp", "foodora-uploads") : path2.resolve(PROJECT_ROOT, "public", "uploads");
try {
  fs2.mkdirSync(UPLOADS_DIR2, { recursive: true });
} catch {
}
var app = express();
app.use(express.json({ limit: "8mb" }));
app.use("/uploads", express.static(UPLOADS_DIR2));
app.use("/api", async (req, res, next) => {
  if (req.path === "/health" || req.path === "/export/project-zip") {
    return next();
  }
  if (!hasDatabaseConfig()) {
    return res.status(503).json({
      error: "Database is not configured. Please add DATABASE_URL in Vercel Environment Variables and redeploy."
    });
  }
  try {
    await ensureDatabaseSeeded();
  } catch (err) {
    console.error("Lazy database seed check failed:", err);
  }
  next();
});
async function settleOrderCommissionIdempotent(orderId) {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(commissionLedger).where(
      and2(
        eq5(commissionLedger.orderId, orderId),
        eq5(commissionLedger.entryType, "commission_earned")
      )
    ).limit(1);
    if (existing.length > 0) {
      return;
    }
    const orderRows = await tx.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return;
    const order = orderRows[0];
    await tx.insert(commissionLedger).values({
      orderId: order.id,
      restaurantId: order.restaurantId,
      entryType: "commission_earned",
      grossAmount: Math.max(0, order.subtotal - order.discountAmount),
      commissionAmount: order.platformCommission,
      netRestaurantAmount: order.restaurantEarnings,
      deliveryFeeAmount: order.deliveryFee,
      note: `Commission (${order.commissionRate}%) settled for ${order.orderNumber}`
    });
  });
}
async function recordRiderDeliveryWalletIdempotent(orderId, collectedCashInput, actorUid = "system") {
  await db.transaction(async (tx) => {
    const orderRows = await tx.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return;
    const order = orderRows[0];
    const expectedCash = order.paymentSplitMode === "online_food_cash_delivery" ? Math.max(0, order.cashDueToRider || order.deliveryFee || 0) : order.paymentMethod === "cod" ? Math.max(0, order.totalAmount) : 0;
    const finalCollectedCash = typeof collectedCashInput === "number" && Number.isFinite(collectedCashInput) ? Math.max(0, Math.round(collectedCashInput)) : expectedCash;
    if (order.cashCollectionStatus !== "collected") {
      await tx.update(orders).set({
        cashCollectionStatus: "collected",
        cashCollectedAmount: finalCollectedCash,
        cashCollectedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(orders.id, order.id));
    }
    const delCashKey = `delivery_cash:${order.orderNumber}`;
    const existingDelTx = await tx.select().from(paymentTransactions).where(eq5(paymentTransactions.idempotencyKey, delCashKey)).limit(1);
    if (existingDelTx.length > 0) {
      await tx.update(paymentTransactions).set({
        amount: finalCollectedCash,
        status: "succeeded",
        riderUid: order.riderUid || existingDelTx[0].riderUid || "",
        note: `Cash delivery charge collected by rider (${actorUid})`,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(paymentTransactions.idempotencyKey, delCashKey));
    } else {
      await tx.insert(paymentTransactions).values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        txKind: "delivery_cash",
        idempotencyKey: delCashKey,
        payerRole: "customer",
        recipientRole: "rider",
        paymentMethod: "cash",
        amount: finalCollectedCash,
        status: "succeeded",
        riderUid: order.riderUid || "",
        note: `Cash delivery charge collected by rider (${actorUid})`
      }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }
    if (!order.riderUid) return;
    const earnKey = `delivery_earn:${order.orderNumber}`;
    const existingEarn = await tx.select().from(riderWalletLedger).where(eq5(riderWalletLedger.idempotencyKey, earnKey)).limit(1);
    if (existingEarn.length > 0) {
      return;
    }
    const riderShare = order.riderEarningAmount > 0 ? order.riderEarningAmount : Math.max(0, Math.round((order.cashDueToRider || order.deliveryFee || 0) * 0.75));
    const foodoraCommission = order.foodoraDeliveryCommission > 0 || (order.cashDueToRider || order.deliveryFee) > 0 ? Math.max(0, (order.cashDueToRider || order.deliveryFee || 0) - riderShare) : 0;
    await tx.insert(riderWalletLedger).values({
      riderUid: order.riderUid,
      orderId: order.id,
      orderNumber: order.orderNumber,
      entryType: "delivery_earning",
      idempotencyKey: earnKey,
      cashCollected: finalCollectedCash,
      riderEarningDelta: riderShare,
      commissionOwedDelta: 0,
      commissionSettledDelta: 0,
      referenceId: `DEL-${order.orderNumber}`,
      note: `Cash collected \u09F3${finalCollectedCash} \xB7 Rider earned \u09F3${riderShare}`
    }).onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });
    if (foodoraCommission > 0) {
      await tx.insert(riderWalletLedger).values({
        riderUid: order.riderUid,
        orderId: order.id,
        orderNumber: order.orderNumber,
        entryType: "commission_owed",
        idempotencyKey: `commission_owed:${order.orderNumber}`,
        cashCollected: 0,
        riderEarningDelta: 0,
        commissionOwedDelta: foodoraCommission,
        commissionSettledDelta: 0,
        referenceId: `COM-${order.orderNumber}`,
        note: `Foodora delivery commission owed on ${order.orderNumber}`
      }).onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });
    }
    await tx.update(riders).set({
      totalDeliveries: sql3`${riders.totalDeliveries} + 1`,
      totalEarnings: sql3`${riders.totalEarnings} + ${riderShare}`
    }).where(eq5(riders.uid, order.riderUid));
  });
}
async function reverseOrderSplitFinancialsTx(tx, order, reason) {
  const foodPaidAmt = order.paymentSplitMode === "online_food_cash_delivery" ? Math.max(0, order.onlineFoodPaidAmount || 0) : Math.max(0, order.totalAmount);
  if (order.paymentStatus === "paid" && foodPaidAmt > 0) {
    await tx.insert(paymentTransactions).values({
      orderId: order.id,
      orderNumber: order.orderNumber,
      txKind: "food_refund",
      idempotencyKey: `food_refund:${order.orderNumber}`,
      payerRole: "platform",
      recipientRole: "customer",
      paymentMethod: order.paymentMethod,
      amount: foodPaidAmt,
      status: "refunded",
      gatewayTxId: order.paymentTxId || "",
      note: reason
    }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
  }
  const delCashKey = `delivery_cash:${order.orderNumber}`;
  if (order.cashCollectionStatus === "collected") {
    await tx.insert(paymentTransactions).values({
      orderId: order.id,
      orderNumber: order.orderNumber,
      txKind: "delivery_reversal",
      idempotencyKey: `delivery_reversal:${order.orderNumber}`,
      payerRole: "rider",
      recipientRole: "customer",
      paymentMethod: "cash",
      amount: order.cashCollectedAmount || order.cashDueToRider || order.deliveryFee || 0,
      status: "refunded",
      riderUid: order.riderUid || "",
      note: reason
    }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    await tx.update(orders).set({ cashCollectionStatus: "reversed", updatedAt: /* @__PURE__ */ new Date() }).where(eq5(orders.id, order.id));
  } else {
    await tx.update(paymentTransactions).set({ status: "cancelled", note: reason, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(paymentTransactions.idempotencyKey, delCashKey));
  }
  if (order.riderUid) {
    const existingEarn = await tx.select().from(riderWalletLedger).where(eq5(riderWalletLedger.idempotencyKey, `delivery_earn:${order.orderNumber}`)).limit(1);
    if (existingEarn.length > 0) {
      const earnRow = existingEarn[0];
      const existingOwed = await tx.select().from(riderWalletLedger).where(eq5(riderWalletLedger.idempotencyKey, `commission_owed:${order.orderNumber}`)).limit(1);
      const owedAmt = existingOwed[0]?.commissionOwedDelta || 0;
      await tx.insert(riderWalletLedger).values({
        riderUid: order.riderUid,
        orderId: order.id,
        orderNumber: order.orderNumber,
        entryType: "commission_reversal",
        idempotencyKey: `delivery_rev:${order.orderNumber}`,
        cashCollected: -(earnRow.cashCollected || 0),
        riderEarningDelta: -(earnRow.riderEarningDelta || 0),
        commissionOwedDelta: -owedAmt,
        commissionSettledDelta: 0,
        referenceId: `REV-${order.orderNumber}`,
        note: reason
      }).onConflictDoNothing({ target: riderWalletLedger.idempotencyKey });
    }
  }
}
function getRequestOrigin(req) {
  const protoHeader = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const hostHeader = String(req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000").split(",")[0].trim();
  return `${protoHeader || "http"}://${hostHeader || "localhost:3000"}`;
}
app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buildRobotsTxt(getRequestOrigin(req)));
});
app.get("/sitemap.xml", async (req, res) => {
  try {
    if (hasDatabaseConfig()) {
      await ensureDatabaseSeeded();
    }
    const approved = hasDatabaseConfig() ? await getApprovedRestaurants() : [];
    const xml = buildSitemapXml(
      getRequestOrigin(req),
      approved.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt })),
      {
        areas: [
          "Gulshan 2",
          "Banani",
          "Dhanmondi",
          "Uttara",
          "Mirpur",
          "Bashundhara R/A",
          "Motijheel",
          "Chattogram",
          "Sylhet",
          "Rajshahi",
          "Khulna"
        ],
        cuisines: [
          "Biriyani",
          "Burger",
          "Pizza",
          "Bangladeshi",
          "Kabab",
          "Chinese & Momos",
          "Bakery & Cakes",
          "Coffee & Drinks"
        ]
      }
    );
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(buildSitemapXml(getRequestOrigin(req), []));
  }
});
app.get(/^\/(google[a-zA-Z0-9_-]+\.html)$/, async (req, res, next) => {
  const filename = req.params[0] || "";
  if (!filename) return next();
  try {
    const settings = hasDatabaseConfig() ? await getPlatformSettingsRow() : null;
    const sc = mergeStorefrontConfig(settings?.storefrontConfig);
    const configuredToken = (sc.googleSiteVerification || process.env.GOOGLE_SITE_VERIFICATION || "").trim();
    const expectedFilename = configuredToken.endsWith(".html") ? configuredToken : configuredToken.startsWith("google") ? `${configuredToken}.html` : "";
    if (configuredToken && (filename === expectedFilename || configuredToken === filename)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`google-site-verification: ${filename}`);
    }
  } catch {
  }
  return res.status(404).send("Google Search Console verification file not configured.");
});
app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "foodora-bd",
    databaseConfigured: hasDatabaseConfig(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/public-config", async (_req, res) => {
  try {
    const [settings, gatewayRows, activeOrderRows, allRiders] = await Promise.all([
      getPlatformSettingsRow(),
      ensureDefaultPaymentGateways(),
      db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        trackingToken: orders.trackingToken,
        restaurantName: orders.restaurantName,
        estimatedMinutes: orders.estimatedMinutes
      }).from(orders).where(and2(ne(orders.status, "delivered"), ne(orders.status, "cancelled"))).orderBy(desc3(orders.createdAt)).limit(30).catch(() => []),
      db.select({
        zone: riders.zone,
        status: riders.status,
        isAvailable: riders.isAvailable
      }).from(riders).catch(() => [])
    ]);
    const paymentGatewaysList = gatewayRows.map(
      (row) => toPublicPaymentGatewayView(row, isEnvConfiguredForGateway(row.code))
    );
    const emailTransport = await getEmailTransportStatus();
    const sc = mergeStorefrontConfig(settings?.storefrontConfig);
    if (!sc.googleSiteVerification && process.env.GOOGLE_SITE_VERIFICATION) {
      sc.googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION.trim();
    }
    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      settings?.deliveryFinancialConfig || null
    );
    const dhakaZoneCoverage = summarizeDhakaZoneRiderCoverage(allRiders, deliveryFinancialConfig);
    const settingsWithVerification = settings ? { ...settings, storefrontConfig: sc, deliveryFinancialConfig } : settings;
    const pinnedId = Number(sc.featuredActiveOrderId);
    const activeRow = sc.showActiveDeliveryBar === false ? void 0 : (Number.isInteger(pinnedId) && pinnedId > 0 ? activeOrderRows.find((r) => r.id === pinnedId) : void 0) || activeOrderRows[0];
    res.json({
      mapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
      gateways: getGatewayAvailability(),
      paymentGateways: paymentGatewaysList,
      emailTransport,
      settings: settingsWithVerification,
      deliveryFinancialConfig,
      dhakaZoneCoverage,
      featuredActiveOrder: activeRow ? {
        orderId: activeRow.id,
        trackingToken: activeRow.trackingToken,
        orderNumber: activeRow.orderNumber,
        restaurantName: activeRow.restaurantName,
        estimatedMinutes: activeRow.estimatedMinutes
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load public config" });
  }
});
app.get("/api/realtime/stream", async (req, res) => {
  const qs = new URLSearchParams();
  if (typeof req.query.token === "string") qs.set("token", req.query.token);
  if (typeof req.query.orderId === "string") qs.set("orderId", req.query.orderId);
  if (typeof req.query.trackingToken === "string") qs.set("trackingToken", req.query.trackingToken);
  const cleanup = await attachSseRealtimeClient(res, qs);
  req.on("close", cleanup);
});
app.post("/api/auth/sync", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});
app.post("/api/auth/sandbox-session", async (req, res) => {
  const requestedRole = typeof req.body?.role === "string" ? req.body.role : "";
  if (requestedRole === "super_admin" || requestedRole === "admin") {
    return res.status(403).json({
      error: "Admin and Super Admin access is restricted. Please sign in with an authorized Admin account."
    });
  }
  const schema = z.object({
    role: z.enum(["customer", "restaurant_owner", "rider"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid demo workspace role" });
  }
  const personas = {
    customer: {
      uid: "demo-customer-uid",
      email: "customer@foodora.bd",
      fullName: "Rahim Uddin",
      role: "customer"
    },
    restaurant_owner: {
      uid: "demo-vendor-uid",
      email: "partner@sultansdine.bd",
      fullName: "Tariqul Islam (Sultan's Dine)",
      role: "restaurant_owner"
    },
    rider: {
      uid: "demo-rider-uid",
      email: "rider@foodora.bd",
      fullName: "Kamrul Hasan",
      role: "rider"
    }
  };
  const p = personas[parsed.data.role];
  const token = signSandboxToken(p);
  res.json({ token, user: { ...p, isSandbox: true } });
});
function hashPasswordScrypt(password) {
  const salt = crypto4.randomBytes(16).toString("hex");
  const hash = crypto4.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPasswordScrypt(password, stored) {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto4.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return crypto4.timingSafeEqual(derived, storedBuf);
}
var ADMIN_PIN_VAULT_KEY = "__admin_panel_pin__";
var ADMIN_PIN_EMAIL_PREFIX = "__admin_pin__:";
function adminPinKeyForEmail(email) {
  return `${ADMIN_PIN_EMAIL_PREFIX}${email.trim().toLowerCase()}`;
}
function getFallbackAdminPin() {
  return process.env.ADMIN_ACCESS_PIN || "2026";
}
async function verifyAdminPinValue(pin) {
  const rows = await db.select({ passwordHash: localCredentials.passwordHash }).from(localCredentials).where(eq5(localCredentials.email, ADMIN_PIN_VAULT_KEY)).limit(1);
  if (rows.length > 0) {
    return verifyPasswordScrypt(pin, rows[0].passwordHash);
  }
  const fallback = getFallbackAdminPin();
  const a = Buffer.from(pin, "utf8");
  const b = Buffer.from(fallback, "utf8");
  if (a.length !== b.length) return false;
  return crypto4.timingSafeEqual(a, b);
}
async function verifyAdminPinForEmail(email, pin) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const specificRows = await db.select({ passwordHash: localCredentials.passwordHash }).from(localCredentials).where(eq5(localCredentials.email, adminPinKeyForEmail(normalized))).limit(1);
  if (specificRows.length > 0) {
    return verifyPasswordScrypt(pin, specificRows[0].passwordHash);
  }
  if (isProtectedSuperAdminEmail(normalized)) {
    return verifyAdminPinValue(pin);
  }
  return false;
}
app.post("/api/auth/admin-pin", async (req, res) => {
  const schema = z.object({
    pin: z.string().trim().min(4).max(16),
    email: z.string().trim().email().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid Admin email and 4\u201316 character PIN." });
  }
  const targetEmail = (parsed.data.email || ADMIN_PIN_DEFAULT_EMAIL).trim().toLowerCase();
  try {
    const valid = await verifyAdminPinForEmail(targetEmail, parsed.data.pin);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect Admin email or PIN. Please try again." });
    }
    const existingRows = await db.select().from(users).where(sql3`lower(${users.email}) = ${targetEmail}`).limit(1);
    if (existingRows[0]?.status === "suspended") {
      return res.status(403).json({ error: "This Admin account has been suspended." });
    }
    const assignedRole = isProtectedSuperAdminEmail(targetEmail) ? "super_admin" : existingRows[0]?.role === "super_admin" ? "super_admin" : "admin";
    let dbUser = existingRows[0];
    if (dbUser) {
      if (dbUser.role !== assignedRole) {
        const updated = await db.update(users).set({ role: assignedRole, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, dbUser.id)).returning();
        dbUser = updated[0];
      }
    } else {
      const uid = `adm-${crypto4.randomBytes(8).toString("hex")}`;
      const defaultName = targetEmail === ADMIN_PIN_DEFAULT_EMAIL ? "Raqib Rony (Admin)" : targetEmail.split("@")[0];
      dbUser = await getOrCreateUser(uid, targetEmail, defaultName, assignedRole);
    }
    const token = signSandboxToken({
      uid: dbUser.uid,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: assignedRole,
      isSandbox: false
    });
    try {
      await db.insert(auditLogs).values({
        actorUid: dbUser.uid,
        action: "admin_pin_unlock",
        targetType: "auth",
        targetId: dbUser.email,
        details: `Admin workspace (${assignedRole}) unlocked via Admin PIN for ${dbUser.email}`
      });
    } catch {
    }
    return res.json({
      token,
      user: {
        uid: dbUser.uid,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: assignedRole,
        isSandbox: false
      }
    });
  } catch (error) {
    console.error("Admin PIN unlock failed:", error);
    return res.status(500).json({ error: error.message || "Failed to verify Admin PIN" });
  }
});
app.post(
  "/api/admin/pin",
  requireAuth,
  requireRole(["super_admin"]),
  async (req, res) => {
    const schema = z.object({
      currentPin: z.string().trim().min(4).max(16),
      newPin: z.string().trim().min(4).max(16),
      adminEmail: z.string().trim().email().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Valid Admin email, current PIN, and new PIN (4\u201316 chars) are required." });
    }
    const targetEmail = (parsed.data.adminEmail || ADMIN_PIN_DEFAULT_EMAIL).trim().toLowerCase();
    try {
      const valid = await verifyAdminPinForEmail(req.user.email, parsed.data.currentPin) || await verifyAdminPinForEmail(targetEmail, parsed.data.currentPin) || await verifyAdminPinValue(parsed.data.currentPin);
      if (!valid) {
        return res.status(401).json({ error: "Current Admin PIN is incorrect." });
      }
      const nextHash = hashPasswordScrypt(parsed.data.newPin);
      const pinKey = adminPinKeyForEmail(targetEmail);
      const pinUid = `admin-pin-${crypto4.createHash("sha256").update(targetEmail).digest("hex").slice(0, 16)}`;
      await db.insert(localCredentials).values({
        email: pinKey,
        uid: pinUid,
        passwordHash: nextHash
      }).onConflictDoUpdate({
        target: localCredentials.email,
        set: { passwordHash: nextHash }
      });
      const existingTarget = await db.select().from(users).where(sql3`lower(${users.email}) = ${targetEmail}`).limit(1);
      const targetRole = isProtectedSuperAdminEmail(targetEmail) ? "super_admin" : existingTarget[0]?.role === "super_admin" ? "super_admin" : "admin";
      if (existingTarget.length > 0) {
        if (existingTarget[0].role !== targetRole) {
          await db.update(users).set({ role: targetRole, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, existingTarget[0].id));
        }
      } else {
        await getOrCreateUser(
          `adm-${crypto4.randomBytes(8).toString("hex")}`,
          targetEmail,
          targetEmail === ADMIN_PIN_DEFAULT_EMAIL ? "Raqib Rony (Admin)" : targetEmail.split("@")[0],
          targetRole
        );
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "admin_pin_updated",
        targetType: "security",
        targetId: targetEmail,
        details: `Admin Panel PIN created/updated for ${targetEmail} (${targetRole})`
      });
      return res.json({
        ok: true,
        adminEmail: targetEmail,
        message: `Admin Panel PIN saved for ${targetEmail}.`
      });
    } catch (error) {
      console.error("Admin PIN update failed:", error);
      return res.status(500).json({ error: error.message || "Failed to update Admin PIN" });
    }
  }
);
function isMissingTableError(err) {
  const code = err?.code || err?.cause?.code;
  return code === "42P01";
}
function isUniqueViolationError(err) {
  const code = err?.code || err?.cause?.code;
  return code === "23505";
}
app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    password: z.string().min(6).max(128),
    role: z.enum(["customer", "restaurant_owner", "rider"]).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please provide a valid name, email, and password (min 6 chars)." });
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  const fullName = parsed.data.fullName.trim();
  const requestedRole = parsed.data.role || "customer";
  const attemptRegister = async () => {
    const existingCred = await db.select({ uid: localCredentials.uid }).from(localCredentials).where(eq5(localCredentials.email, emailLower)).limit(1);
    if (existingCred.length > 0) {
      return { status: 409, body: { error: "An account with this email already exists. Please sign in." } };
    }
    const existingUser = await db.select().from(users).where(sql3`lower(${users.email}) = ${emailLower}`).limit(1);
    if (existingUser.length > 0) {
      return {
        status: 409,
        body: {
          error: "An account with this email already exists. Please sign in with Google or your existing credentials."
        }
      };
    }
    const uid = `usr-${crypto4.randomBytes(8).toString("hex")}`;
    const role = isProtectedSuperAdminEmail(emailLower) ? "super_admin" : requestedRole;
    const passwordHash = hashPasswordScrypt(parsed.data.password);
    await db.transaction(async (tx) => {
      await tx.insert(localCredentials).values({
        email: emailLower,
        uid,
        passwordHash
      });
      await tx.insert(users).values({
        uid,
        email: emailLower,
        fullName,
        role
      });
      if (role === "rider") {
        await tx.insert(riders).values({
          uid,
          fullName,
          phone: "+8801700000000",
          email: emailLower,
          vehicleType: "Motorbike",
          zone: "ZONE 01 \u2014 GULSHAN",
          isAvailable: false,
          status: "pending"
        }).onConflictDoNothing();
        await tx.insert(notifications).values({
          recipientUid: "role-super_admin",
          roleTarget: "super_admin",
          title: "New Dhaka Zone Rider Pending Approval",
          message: `${fullName} registered as a rider and awaits zone approval.`,
          type: "system"
        });
      }
    });
    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return {
      status: 201,
      body: {
        token,
        user: { uid, email: emailLower, fullName, role, isSandbox: false }
      }
    };
  };
  try {
    let result;
    try {
      result = await attemptRegister();
    } catch (err) {
      if (isMissingTableError(err)) {
        await ensureSchemaTables();
        result = await attemptRegister();
      } else {
        throw err;
      }
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    }
    console.error("Register failed:", error);
    return res.status(500).json({ error: error.message || "Registration failed" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid email and password." });
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  const attemptLogin = async () => {
    const credRows = await db.select().from(localCredentials).where(eq5(localCredentials.email, emailLower)).limit(1);
    if (credRows.length === 0) {
      try {
        const { data: supaAuth, error: supaErr } = await supabaseServer.auth.signInWithPassword({
          email: emailLower,
          password: parsed.data.password
        });
        if (!supaErr && supaAuth?.user) {
          const meta = supaAuth.user.user_metadata || {};
          const metaName = typeof meta.full_name === "string" && meta.full_name.trim() || typeof meta.name === "string" && meta.name.trim() || emailLower.split("@")[0];
          const dbUser2 = await getOrCreateUser(supaAuth.user.id, emailLower, metaName, "customer");
          if (dbUser2.status === "suspended") {
            return { status: 403, body: { error: "This account has been suspended by an administrator." } };
          }
          const role2 = dbUser2.role || "customer";
          const token2 = signSandboxToken({
            uid: dbUser2.uid,
            email: dbUser2.email,
            fullName: dbUser2.fullName,
            role: role2,
            isSandbox: false
          });
          return {
            status: 200,
            body: {
              token: token2,
              user: { uid: dbUser2.uid, email: dbUser2.email, fullName: dbUser2.fullName, role: role2, isSandbox: false }
            }
          };
        }
      } catch {
      }
      return {
        status: 401,
        body: { error: "No password account found for this email. Try Google Sign-In or Create Account." }
      };
    }
    const { uid, passwordHash: storedHash } = credRows[0];
    if (!verifyPasswordScrypt(parsed.data.password, storedHash)) {
      return { status: 401, body: { error: "Incorrect password. Please try again." } };
    }
    const userRows = await db.select().from(users).where(eq5(users.uid, uid)).limit(1);
    const dbUser = userRows[0];
    if (dbUser?.status === "suspended") {
      return { status: 403, body: { error: "This account has been suspended by an administrator." } };
    }
    const role = dbUser?.role || (isProtectedSuperAdminEmail(emailLower) ? "super_admin" : "customer");
    const fullName = dbUser?.fullName || emailLower.split("@")[0];
    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return {
      status: 200,
      body: {
        token,
        user: { uid, email: emailLower, fullName, role, isSandbox: false }
      }
    };
  };
  try {
    let result;
    try {
      result = await attemptLogin();
    } catch (err) {
      if (isMissingTableError(err)) {
        await ensureSchemaTables();
        result = await attemptLogin();
      } else {
        throw err;
      }
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ error: error.message || "Sign in failed" });
  }
});
var PW_RESET_EMAIL_PREFIX = "__pw_reset__:";
function pwResetKeyForEmail(email) {
  return `${PW_RESET_EMAIL_PREFIX}${email.trim().toLowerCase()}`;
}
app.post("/api/auth/forgot-password", async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    redirectTo: z.string().url().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  try {
    const [existingUsers, existingCreds] = await Promise.all([
      db.select().from(users).where(sql3`lower(${users.email}) = ${emailLower}`).limit(1),
      db.select().from(localCredentials).where(eq5(localCredentials.email, emailLower)).limit(1)
    ]);
    const userRow = existingUsers[0];
    if (!userRow && existingCreds.length === 0) {
      return res.status(404).json({
        error: "No account found with this email address. Please create an account first."
      });
    }
    if (userRow?.status === "suspended") {
      return res.status(403).json({ error: "This account has been suspended by an administrator." });
    }
    const isAdminAccount = isProtectedSuperAdminEmail(emailLower) || userRow?.role === "admin" || userRow?.role === "super_admin";
    try {
      await supabaseServer.auth.resetPasswordForEmail(
        emailLower,
        parsed.data.redirectTo ? { redirectTo: parsed.data.redirectTo } : void 0
      );
    } catch {
    }
    if (isAdminAccount) {
      return res.json({
        ok: true,
        mode: "admin_pin_or_email",
        isAdminAccount: true,
        message: "Admin account verified. Enter your Admin PIN below (or open the password reset link in your email) to set a new password."
      });
    }
    const otp = String(crypto4.randomInt(1e5, 1e6));
    const expiresAt = Date.now() + 15 * 60 * 1e3;
    const otpHash = hashPasswordScrypt(otp);
    const resetKey = pwResetKeyForEmail(emailLower);
    const resetUid = `pw-reset-${crypto4.createHash("sha256").update(emailLower).digest("hex").slice(0, 16)}`;
    await db.insert(localCredentials).values({
      email: resetKey,
      uid: resetUid,
      passwordHash: `${expiresAt}|${otpHash}`
    }).onConflictDoUpdate({
      target: localCredentials.email,
      set: { passwordHash: `${expiresAt}|${otpHash}` }
    });
    const emailTransport = await getEmailTransportStatus();
    if (emailTransport.configured) {
      const otpDispatch = await sendTransactionalEmail({
        to: emailLower,
        subject: "Foodora BD Password Reset Code",
        html: `<p>Your Foodora BD password reset code is <strong>${otp}</strong>. It expires in 15 minutes.</p>`,
        text: `Your Foodora BD password reset code is ${otp}. It expires in 15 minutes.`
      });
      if (otpDispatch.ok) {
        return res.json({
          ok: true,
          mode: "email",
          isAdminAccount: false,
          message: "A 6-digit password reset code has been sent to your email address."
        });
      }
    }
    return res.json({
      ok: true,
      mode: "preview",
      isAdminAccount: false,
      previewCode: otp,
      message: "Verification code ready. Enter the 6-digit code and your new password below (valid for 15 minutes)."
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: error.message || "Failed to initiate password reset" });
  }
});
app.post("/api/auth/reset-password", async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    code: z.string().trim().min(4).max(16),
    newPassword: z.string().min(6).max(128)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Please enter a valid email, verification code, and new password (min 6 characters)."
    });
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  try {
    const [existingUsers, existingCreds] = await Promise.all([
      db.select().from(users).where(sql3`lower(${users.email}) = ${emailLower}`).limit(1),
      db.select().from(localCredentials).where(eq5(localCredentials.email, emailLower)).limit(1)
    ]);
    const userRow = existingUsers[0];
    if (!userRow && existingCreds.length === 0) {
      return res.status(404).json({ error: "Account not found for this email." });
    }
    if (userRow?.status === "suspended") {
      return res.status(403).json({ error: "This account has been suspended by an administrator." });
    }
    const isAdminAccount = isProtectedSuperAdminEmail(emailLower) || userRow?.role === "admin" || userRow?.role === "super_admin";
    if (isAdminAccount) {
      const validAdminPin = await verifyAdminPinForEmail(emailLower, parsed.data.code);
      if (!validAdminPin) {
        return res.status(401).json({
          error: "Incorrect Admin PIN. Enter your Admin PIN to reset an Admin password."
        });
      }
    } else {
      const resetKey = pwResetKeyForEmail(emailLower);
      const tokenRows = await db.select().from(localCredentials).where(eq5(localCredentials.email, resetKey)).limit(1);
      if (tokenRows.length === 0) {
        return res.status(401).json({
          error: "Reset code not found or already used. Please request a new code."
        });
      }
      const sepIdx = tokenRows[0].passwordHash.indexOf("|");
      const expMs = Number(sepIdx > 0 ? tokenRows[0].passwordHash.slice(0, sepIdx) : "0");
      const storedOtpHash = sepIdx > 0 ? tokenRows[0].passwordHash.slice(sepIdx + 1) : "";
      if (!expMs || expMs < Date.now()) {
        await db.delete(localCredentials).where(eq5(localCredentials.email, resetKey));
        return res.status(401).json({ error: "Reset code has expired. Please request a new one." });
      }
      if (!verifyPasswordScrypt(parsed.data.code, storedOtpHash)) {
        return res.status(401).json({ error: "Invalid verification code. Please check and try again." });
      }
    }
    const uid = userRow?.uid || existingCreds[0]?.uid || `usr-${crypto4.randomBytes(8).toString("hex")}`;
    const role = isProtectedSuperAdminEmail(emailLower) ? "super_admin" : userRow?.role || "customer";
    const fullName = userRow?.fullName || emailLower.split("@")[0];
    const nextPasswordHash = hashPasswordScrypt(parsed.data.newPassword);
    await db.transaction(async (tx) => {
      await tx.insert(localCredentials).values({
        email: emailLower,
        uid,
        passwordHash: nextPasswordHash
      }).onConflictDoUpdate({
        target: localCredentials.email,
        set: { passwordHash: nextPasswordHash }
      });
      if (!userRow) {
        await tx.insert(users).values({
          uid,
          email: emailLower,
          fullName,
          role
        }).onConflictDoNothing();
      }
      await tx.delete(localCredentials).where(eq5(localCredentials.email, pwResetKeyForEmail(emailLower)));
    });
    try {
      await db.insert(auditLogs).values({
        actorUid: uid,
        action: "password_reset",
        targetType: "auth",
        targetId: emailLower,
        details: `Password updated via recovery flow for ${emailLower}`
      });
    } catch {
    }
    const token = signSandboxToken({ uid, email: emailLower, fullName, role, isSandbox: false });
    return res.json({
      ok: true,
      token,
      user: { uid, email: emailLower, fullName, role, isSandbox: false }
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: error.message || "Failed to reset password" });
  }
});
app.post("/api/auth/sync-password", requireAuth, async (req, res) => {
  const schema = z.object({
    newPassword: z.string().min(6).max(128)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  try {
    const emailLower = req.user.email.trim().toLowerCase();
    const nextHash = hashPasswordScrypt(parsed.data.newPassword);
    await db.insert(localCredentials).values({
      email: emailLower,
      uid: req.user.uid,
      passwordHash: nextHash
    }).onConflictDoUpdate({
      target: localCredentials.email,
      set: { passwordHash: nextHash }
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to sync password" });
  }
});
app.get("/api/restaurants", async (_req, res) => {
  try {
    const list = await getApprovedRestaurants();
    res.json({ restaurants: list });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch restaurants" });
  }
});
app.get("/api/products", async (_req, res) => {
  try {
    const products = await getStorefrontProducts();
    res.json({ products });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch storefront products" });
  }
});
app.get("/api/restaurants/:slug", async (req, res) => {
  try {
    const data = await getRestaurantBySlug(req.params.slug);
    if (!data) {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch restaurant" });
  }
});
app.get("/api/coupons", async (_req, res) => {
  try {
    const list = await getActiveCoupons();
    res.json({ coupons: list });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch coupons" });
  }
});
app.post("/api/coupons/validate", async (req, res) => {
  const schema = z.object({
    code: z.string().min(2),
    subtotal: z.number().nonnegative(),
    deliveryFee: z.number().nonnegative(),
    restaurantId: z.number().int().positive()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid coupon request" });
  }
  try {
    const rows = await db.select().from(coupons).where(eq5(coupons.code, parsed.data.code.trim().toUpperCase())).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ valid: false, reason: "Coupon code not found" });
    }
    const c = rows[0];
    const result = evaluateCoupon(
      {
        code: c.code,
        type: c.type,
        value: c.value,
        minOrder: c.minOrder,
        maxDiscount: c.maxDiscount,
        restaurantId: c.restaurantId,
        isActive: c.isActive,
        usedCount: c.usedCount,
        usageLimit: c.usageLimit
      },
      parsed.data.subtotal,
      parsed.data.deliveryFee,
      parsed.data.restaurantId
    );
    res.json({ ...result, coupon: c });
  } catch (error) {
    res.status(500).json({ error: error.message || "Coupon check failed" });
  }
});
app.get("/api/free/weather", async (req, res) => {
  const lat = Number(req.query.lat) || 23.7949;
  const lng = Number(req.query.lng) || 90.4144;
  const weather = await fetchDhakaWeather(lat, lng);
  res.json({ weather });
});
app.get("/api/free/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ places: [] });
  const lat = req.query.lat !== void 0 ? Number(req.query.lat) : void 0;
  const lng = req.query.lng !== void 0 ? Number(req.query.lng) : void 0;
  const places = await searchOsmPlaces(q, { lat, lng });
  res.json({ places });
});
app.get("/api/free/reverse-geocode", async (req, res) => {
  const lat = Number(req.query.lat) || 23.7949;
  const lng = Number(req.query.lng) || 90.4144;
  const lang = req.query.lang === "bn" ? "bn" : "en";
  const result = await reverseOsmGeocode(lat, lng, lang);
  res.json(result);
});
app.get("/api/free/route", async (req, res) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }
  const includeSteps = req.query.steps === "1" || req.query.steps === "true";
  const vehicleMode = typeof req.query.mode === "string" ? req.query.mode : void 0;
  const route = await fetchOsrmRoute(fromLat, fromLng, toLat, toLng, {
    includeSteps,
    vehicleMode
  });
  res.json({ route });
});
app.get("/api/free/rates", async (_req, res) => {
  const rates = await fetchBdtExchangeRates();
  res.json(rates);
});
app.get("/api/free/meals", async (req, res) => {
  const q = String(req.query.q || "biryani").trim();
  const meals = await searchMealDbDishes(q);
  res.json({ meals });
});
app.post("/api/delivery/quote", async (req, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    dropoffLat: z.number(),
    dropoffLng: z.number(),
    dropoffArea: z.string().trim().max(120).optional(),
    deliveryMode: z.enum(["platform", "restaurant", "third_party"]).optional(),
    deliveryServiceCode: z.string().trim().max(32).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid delivery quote parameters" });
  }
  try {
    const [restRows, settingsRows] = await Promise.all([
      db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1),
      db.select().from(platformSettings).limit(1).catch(() => [])
    ]);
    if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
    const rest = restRows[0];
    const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
      settingsRows[0]?.deliveryFinancialConfig || null
    );
    const selectedService = selectAutoBangladeshiDeliveryService({
      restaurantDeliveryMode: rest.deliveryMode,
      preferredServiceCode: parsed.data.deliveryServiceCode,
      deliveryModeOverride: parsed.data.deliveryMode,
      pathaoEnabled: settingsRows[0]?.pathaoEnabled ?? true
    });
    const provider = getDeliveryProvider(selectedService.mode, selectedService.code);
    const [baseQuote, osrmRoute, weather] = await Promise.all([
      provider.getQuote({
        orderNumber: "QUOTE",
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: "Customer Pin",
        dropoffArea: parsed.data.dropoffArea || rest.area,
        dropoffLat: parsed.data.dropoffLat,
        dropoffLng: parsed.data.dropoffLng,
        customerName: "Guest",
        customerPhone: "",
        baseFee: rest.deliveryFee,
        orderValue: 0
      }),
      fetchOsrmRoute(rest.lat, rest.lng, parsed.data.dropoffLat, parsed.data.dropoffLng),
      fetchDhakaWeather(parsed.data.dropoffLat, parsed.data.dropoffLng)
    ]);
    const baseFeeInput = selectedService.mode === "third_party" ? Math.max(selectedService.minBaseFee, rest.deliveryFee) : rest.deliveryFee;
    const roadCalc = estimateDeliveryFeeAndEta(
      osrmRoute.distanceKm,
      baseFeeInput,
      selectedService.mode
    );
    const zoneDistanceCalc = calculateZoneDistanceDeliveryFee({
      area: parsed.data.dropoffArea || rest.area,
      distanceKm: osrmRoute.distanceKm,
      fallbackFee: roadCalc.fee,
      config: deliveryFinancialConfig
    });
    res.json({
      quote: {
        ...baseQuote,
        serviceCode: selectedService.code,
        provider: provider.name,
        mode: selectedService.mode,
        distanceKm: osrmRoute.distanceKm,
        fee: zoneDistanceCalc.deliveryFee,
        zoneCode: zoneDistanceCalc.zoneCode,
        zoneName: zoneDistanceCalc.zoneName,
        pricingSource: zoneDistanceCalc.pricingSource,
        etaMinutes: Math.max(
          12,
          osrmRoute.drivingMinutes + 12 + weather.rainBufferMin + selectedService.etaOffsetMin
        ),
        routeSource: osrmRoute.source,
        rainBufferMin: weather.rainBufferMin,
        weatherLabel: weather.labelEn
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to compute delivery quote" });
  }
});
app.get("/api/customer/addresses", requireAuth, async (req, res) => {
  try {
    const addresses = await getCustomerAddresses(req.user.uid);
    res.json({ addresses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/customer/addresses", requireAuth, async (req, res) => {
  const schema = z.object({
    label: z.string().min(1).max(60),
    area: z.string().min(2).max(60),
    addressLine: z.string().min(4).max(200),
    lat: z.number(),
    lng: z.number(),
    instructions: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please complete all required address fields" });
  }
  try {
    const inserted = await db.insert(customerAddresses).values({
      userUid: req.user.uid,
      label: parsed.data.label,
      area: parsed.data.area,
      addressLine: parsed.data.addressLine,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      instructions: parsed.data.instructions || "",
      isDefault: true
    }).returning();
    res.status(201).json({ address: inserted[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/customer/favorites", requireAuth, async (req, res) => {
  const list = await getCustomerFavorites(req.user.uid);
  res.json({ favorites: list });
});
app.post("/api/customer/favorites", requireAuth, async (req, res) => {
  const schema = z.object({ restaurantId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid restaurantId" });
  try {
    const result = await toggleCustomerFavorite(req.user.uid, parsed.data.restaurantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/customer/orders", requireAuth, async (req, res) => {
  try {
    const list = await getCustomerOrders(req.user.uid);
    res.json({ orders: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/orders/track-by-email", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  const orderNumber = String(req.query.orderNumber || "").trim().toUpperCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }
  try {
    let matched = [];
    if (orderNumber) {
      matched = await db.select().from(orders).where(sql3`upper(${orders.orderNumber}) = ${orderNumber}`).limit(1);
      if (matched.length === 0) {
        return res.status(404).json({ error: `Order ${orderNumber} was not found.` });
      }
      const ord = matched[0];
      let matches = doesEmailMatchOrder(ord.customerEmail, email);
      if (!matches && ord.customerUid) {
        const custUsers = await db.select().from(users).where(eq5(users.uid, ord.customerUid)).limit(1);
        if (custUsers[0] && doesEmailMatchOrder(custUsers[0].email, email)) {
          matches = true;
        }
      }
      if (!matches) {
        return res.status(403).json({
          error: "The email address does not match the tracking email on this order."
        });
      }
    } else {
      matched = await db.select().from(orders).where(sql3`lower(${orders.customerEmail}) = ${email}`).orderBy(desc3(orders.createdAt)).limit(1);
      if (matched.length === 0) {
        const custUsers = await db.select().from(users).where(sql3`lower(${users.email}) = ${email}`).limit(1);
        if (custUsers[0]) {
          matched = await db.select().from(orders).where(eq5(orders.customerUid, custUsers[0].uid)).orderBy(desc3(orders.createdAt)).limit(1);
        }
      }
      if (matched.length === 0) {
        return res.status(404).json({ error: `No orders found for ${email}.` });
      }
    }
    const detail = await getOrderById(matched[0].id);
    if (!detail) return res.status(404).json({ error: "Order not found" });
    return res.json(detail);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to look up order by email" });
  }
});
app.get("/api/orders/:id", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order ID" });
  }
  try {
    const detail = await getOrderById(id);
    if (!detail) return res.status(404).json({ error: "Order not found" });
    const providedToken = String(req.query.token || "").trim();
    const isAdmin = req.user?.role === "super_admin" || req.user?.role === "admin";
    const isOwner = Boolean(req.user?.uid && req.user.uid === detail.order.customerUid);
    const hasTokenAccess = Boolean(
      providedToken && detail.order.trackingToken && providedToken === detail.order.trackingToken
    );
    if (!isAdmin && !isOwner && !hasTokenAccess) {
      return res.json({
        ...detail,
        order: {
          ...detail.order,
          customerName: "Foodora Customer",
          customerPhone: "",
          customerEmail: "",
          trackingToken: ""
        },
        emailLogs: []
      });
    }
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/orders/:id/send-tracking-email", optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order ID" });
  }
  const schema = z.object({
    email: z.string().trim().email().optional(),
    token: z.string().optional()
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  try {
    const orderRows = await db.select().from(orders).where(eq5(orders.id, id)).limit(1);
    if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
    let order = orderRows[0];
    const isAdmin = req.user?.role === "super_admin" || req.user?.role === "admin";
    const isOwner = Boolean(req.user?.uid && req.user.uid === order.customerUid);
    const hasToken = Boolean(
      parsed.data.token && order.trackingToken && parsed.data.token.trim() === order.trackingToken
    );
    if (!isAdmin && !isOwner && !hasToken) {
      return res.status(403).json({ error: "Sign in or use your order tracking token to email updates." });
    }
    const targetEmail = (parsed.data.email || order.customerEmail || req.user?.email || "").trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      return res.status(400).json({ error: "Please provide an email address for tracking updates." });
    }
    const nextToken = order.trackingToken || crypto4.randomBytes(12).toString("hex");
    if (targetEmail !== order.customerEmail || nextToken !== order.trackingToken) {
      const upd = await db.update(orders).set({ customerEmail: targetEmail, trackingToken: nextToken, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(orders.id, order.id)).returning();
      order = upd[0] || order;
    }
    const [restRows, riderRows] = await Promise.all([
      db.select({ lat: restaurants.lat, lng: restaurants.lng }).from(restaurants).where(eq5(restaurants.id, order.restaurantId)).limit(1),
      order.riderUid ? db.select({ phone: riders.phone }).from(riders).where(eq5(riders.uid, order.riderUid)).limit(1) : Promise.resolve([])
    ]);
    const [emailLog, emailTransport] = await Promise.all([
      sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: order.id,
        orderNumber: order.orderNumber,
        trackingToken: nextToken,
        customerName: order.customerName,
        customerEmail: targetEmail,
        restaurantName: order.restaurantName,
        deliveryArea: order.deliveryArea,
        deliveryAddress: order.deliveryAddress,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        couponCode: order.couponCode,
        deliveryFee: order.deliveryFee,
        serviceFee: order.serviceFee,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        statusEvent: order.status,
        statusNote: `Live tracking update requested (${order.status.replace(/_/g, " ")})`,
        riderName: order.riderName,
        riderPhone: riderRows[0]?.phone || null,
        etaMinutes: order.estimatedMinutes,
        createdAt: order.createdAt,
        paymentSplitMode: order.paymentSplitMode,
        onlineFoodPaidAmount: order.onlineFoodPaidAmount,
        cashDueToRider: order.cashDueToRider,
        items: order.itemsSnapshotJson
      }),
      getEmailTransportStatus()
    ]);
    return res.json({
      ok: true,
      customerEmail: targetEmail,
      emailLog,
      emailTransport,
      trackingUrl: emailLog?.trackingUrl || "",
      restaurantLat: restRows[0]?.lat ?? null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to send tracking email" });
  }
});
app.post("/api/orders", requireAuth, async (req, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    customerName: z.string().min(2),
    customerPhone: z.string().min(6),
    customerEmail: z.string().trim().email().optional().or(z.literal("")),
    deliveryAddress: z.string().min(5),
    deliveryArea: z.string().min(2),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    deliveryInstructions: z.string().optional(),
    deliveryMode: z.enum(["platform", "restaurant", "third_party"]),
    deliveryServiceCode: z.string().trim().max(32).optional(),
    paymentMethod: z.string().min(2).max(32),
    couponCode: z.string().optional(),
    items: z.array(
      z.object({
        foodItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(50),
        variationName: z.string().optional(),
        addons: z.array(z.string()).default([]),
        specialInstructions: z.string().optional()
      })
    ).min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid order payload", details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const resolvedCustomerEmail = (input.customerEmail?.trim() || (req.user.email && req.user.email.includes("@") ? req.user.email : "")).trim().toLowerCase();
  const trackingToken = crypto4.randomBytes(12).toString("hex");
  const normalizedMethod = normalizeGatewayCode(input.paymentMethod);
  try {
    const gatewayRows = await ensureDefaultPaymentGateways();
    const matchedGateway = gatewayRows.find(
      (g) => normalizeGatewayCode(g.code) === normalizedMethod && g.isActive
    );
    if (!matchedGateway) {
      return res.status(400).json({
        error: `Selected payment method "${input.paymentMethod}" is currently inactive or unsupported.`
      });
    }
    const created = await db.transaction(async (tx) => {
      const restRows = await tx.select().from(restaurants).where(eq5(restaurants.id, input.restaurantId)).limit(1);
      if (restRows.length === 0) throw new Error("Restaurant not found");
      const rest = restRows[0];
      if (rest.status !== "approved" || !rest.isOpen) {
        throw new Error(
          buildRestaurantUnavailableMessage(rest.name, rest.status, rest.isOpen, "en")
        );
      }
      const dbMenu = await tx.select().from(foodItems).where(eq5(foodItems.restaurantId, rest.id));
      const snapshotItems = [];
      let subtotal = 0;
      for (const reqItem of input.items) {
        const found = dbMenu.find((m) => m.id === reqItem.foodItemId);
        if (!found) {
          throw new Error(`Menu item #${reqItem.foodItemId} does not belong to ${rest.name}`);
        }
        if (!found.inStock || !found.isAvailable) {
          throw new Error(`"${found.name}" is currently out of stock`);
        }
        const matchedVar = (found.variationsJson || []).find(
          (v) => v.name === reqItem.variationName
        );
        const selectedAddons = (found.addonsJson || []).filter(
          (a) => reqItem.addons.includes(a.name)
        );
        const unitPrice = calculateCartItemUnitPrice({
          basePrice: found.price,
          discountPrice: found.discountPrice,
          variationDelta: matchedVar?.priceDelta ?? 0,
          addons: selectedAddons
        });
        const lineTotal = unitPrice * reqItem.quantity;
        subtotal += lineTotal;
        const rawImg = (found.imageUrl || "").trim();
        const isMissingLocalUpload = rawImg.startsWith("/uploads/") && !fs2.existsSync(path2.join(UPLOADS_DIR2, rawImg.replace(/^\/uploads\//, "")));
        const resolvedSnapshotImg = !rawImg || isMissingLocalUpload ? rest.coverUrl || "/src/assets/images/food_kacchi_biriyani_1794831373742.jpg" : rawImg;
        snapshotItems.push({
          foodItemId: found.id,
          name: found.name,
          nameBn: found.nameBn,
          imageUrl: resolvedSnapshotImg,
          quantity: reqItem.quantity,
          unitPrice,
          variation: matchedVar?.name,
          addons: selectedAddons,
          specialInstructions: reqItem.specialInstructions,
          lineTotal
        });
      }
      if (subtotal < rest.minOrder) {
        throw new Error(`Minimum order for ${rest.name} is \u09F3${rest.minOrder}`);
      }
      const orderSettings = await tx.select().from(platformSettings).limit(1);
      const selectedService = selectAutoBangladeshiDeliveryService({
        restaurantDeliveryMode: rest.deliveryMode,
        preferredServiceCode: input.deliveryServiceCode,
        deliveryModeOverride: input.deliveryMode,
        pathaoEnabled: orderSettings[0]?.pathaoEnabled ?? true
      });
      const provider = getDeliveryProvider(selectedService.mode, selectedService.code);
      const quote = await provider.getQuote({
        orderNumber: "NEW",
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: input.deliveryAddress,
        dropoffArea: input.deliveryArea,
        dropoffLat: input.deliveryLat,
        dropoffLng: input.deliveryLng,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        baseFee: rest.deliveryFee,
        orderValue: subtotal
      });
      const settings = orderSettings;
      const serviceFee = settings[0]?.serviceFee ?? 10;
      const deliveryFinancialConfig = mergeDeliveryFinancialConfig(
        settings[0]?.deliveryFinancialConfig || null
      );
      const estRoadKm = Math.round(
        haversineDistanceKm(rest.lat, rest.lng, input.deliveryLat, input.deliveryLng) * 1.25 * 10
      ) / 10;
      const zoneFeeCalc = calculateZoneDistanceDeliveryFee({
        area: input.deliveryArea,
        distanceKm: estRoadKm,
        fallbackFee: quote.fee,
        config: deliveryFinancialConfig
      });
      let discountAmount = 0;
      let deliveryFeeAfterCoupon = zoneFeeCalc.deliveryFee;
      let appliedCouponCode = "";
      if (input.couponCode && input.couponCode.trim()) {
        const cRows = await tx.select().from(coupons).where(eq5(coupons.code, input.couponCode.trim().toUpperCase())).limit(1);
        if (cRows.length > 0) {
          const c = cRows[0];
          const evalRes = evaluateCoupon(
            {
              code: c.code,
              type: c.type,
              value: c.value,
              minOrder: c.minOrder,
              maxDiscount: c.maxDiscount,
              restaurantId: c.restaurantId,
              isActive: c.isActive,
              usedCount: c.usedCount,
              usageLimit: c.usageLimit
            },
            subtotal,
            zoneFeeCalc.deliveryFee,
            rest.id
          );
          if (evalRes.valid) {
            discountAmount = evalRes.discountAmount;
            deliveryFeeAfterCoupon = evalRes.deliveryFeeAfterCoupon;
            appliedCouponCode = c.code;
            await tx.update(coupons).set({ usedCount: sql3`${coupons.usedCount} + 1` }).where(eq5(coupons.id, c.id));
          }
        }
      }
      const financials = calculateSplitOrderFinancials({
        subtotal,
        discountAmount,
        deliveryFee: deliveryFeeAfterCoupon,
        serviceFee,
        commissionType: rest.commissionType || "percentage",
        commissionRate: Number(rest.commissionRate) || 15,
        fixedCommission: rest.fixedCommission || 0,
        paymentMethod: normalizedMethod,
        riderEarningRule: deliveryFinancialConfig.riderEarningRule
      });
      const orderNumber = `FD-BD-${Math.floor(1e4 + Math.random() * 89999)}`;
      const onlineChargeAmount = financials.paymentSplitMode === "online_food_cash_delivery" ? financials.onlineFoodPayable : financials.totalPayable;
      const paymentInit = initiatePaymentSession(
        normalizedMethod,
        orderNumber,
        onlineChargeAmount,
        matchedGateway
      );
      const deliveryDispatch = await provider.createDelivery({
        orderNumber,
        restaurantName: rest.name,
        pickupAddress: rest.address,
        pickupLat: rest.lat,
        pickupLng: rest.lng,
        dropoffAddress: input.deliveryAddress,
        dropoffArea: input.deliveryArea,
        dropoffLat: input.deliveryLat,
        dropoffLng: input.deliveryLng,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        baseFee: deliveryFeeAfterCoupon,
        orderValue: financials.totalPayable
      });
      const insertedOrders = await tx.insert(orders).values({
        orderNumber,
        customerUid: req.user.uid,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: resolvedCustomerEmail,
        trackingToken,
        restaurantId: rest.id,
        restaurantName: rest.name,
        deliveryAddress: input.deliveryAddress,
        deliveryArea: input.deliveryArea,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
        deliveryInstructions: input.deliveryInstructions || "",
        deliveryMode: selectedService.mode,
        deliveryProvider: deliveryDispatch.provider,
        consignmentId: deliveryDispatch.consignmentId,
        paymentMethod: normalizedMethod,
        paymentStatus: "pending",
        paymentTxId: paymentInit.transactionId,
        subtotal: financials.subtotal,
        discountAmount: financials.discountAmount,
        couponCode: appliedCouponCode,
        deliveryFee: financials.deliveryFee,
        serviceFee: financials.serviceFee,
        taxAmount: financials.taxAmount,
        totalAmount: financials.customerTotalCost,
        commissionRate: rest.commissionRate,
        platformCommission: financials.platformCommission,
        restaurantEarnings: financials.restaurantEarnings,
        paymentSplitMode: financials.paymentSplitMode,
        onlineFoodPaidAmount: financials.onlineFoodPayable,
        cashDueToRider: financials.cashDueToRider,
        riderEarningAmount: financials.riderEarningAmount,
        foodoraDeliveryCommission: financials.foodoraDeliveryCommission,
        cashCollectionStatus: financials.cashDueToRider === 0 ? "collected" : "pending",
        cashCollectedAmount: 0,
        status: "confirmed",
        estimatedMinutes: quote.etaMinutes,
        itemsSnapshotJson: snapshotItems
      }).returning();
      const newOrder = insertedOrders[0];
      if (financials.paymentSplitMode === "online_food_cash_delivery") {
        await tx.insert(paymentTransactions).values([
          {
            orderId: newOrder.id,
            orderNumber: newOrder.orderNumber,
            txKind: "food_payment",
            idempotencyKey: `food_pay:${newOrder.orderNumber}`,
            payerRole: "customer",
            recipientRole: "platform_restaurant",
            paymentMethod: normalizedMethod,
            amount: financials.onlineFoodPayable,
            status: "pending",
            gatewayTxId: paymentInit.transactionId,
            note: `Online food payment via ${normalizedMethod.toUpperCase()} (excludes delivery charge)`
          },
          {
            orderId: newOrder.id,
            orderNumber: newOrder.orderNumber,
            txKind: "delivery_cash",
            idempotencyKey: `delivery_cash:${newOrder.orderNumber}`,
            payerRole: "customer",
            recipientRole: "rider",
            paymentMethod: "cash",
            amount: financials.cashDueToRider,
            status: financials.cashDueToRider === 0 ? "succeeded" : "pending",
            note: financials.cashDueToRider === 0 ? "Free delivery coupon applied (\u09F30 cash due to rider)" : `Pay cash to rider on delivery (Rider \u09F3${financials.riderEarningAmount} + Foodora commission \u09F3${financials.foodoraDeliveryCommission})`
          }
        ]).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
      } else {
        await tx.insert(paymentTransactions).values({
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          txKind: "delivery_cash",
          idempotencyKey: `delivery_cash:${newOrder.orderNumber}`,
          payerRole: "customer",
          recipientRole: "rider",
          paymentMethod: "cod",
          amount: financials.cashDueToRider,
          status: "pending",
          note: "Legacy Cash on Delivery full order collection"
        }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
      }
      await tx.insert(orderStatusHistory).values({
        orderId: newOrder.id,
        status: "confirmed",
        note: financials.paymentSplitMode === "online_food_cash_delivery" ? `Order placed via ${input.paymentMethod.toUpperCase()} (Food Online \u09F3${financials.onlineFoodPayable} \xB7 Delivery Cash to Rider \u09F3${financials.cashDueToRider})` : `Order placed via ${input.paymentMethod.toUpperCase()} (${deliveryDispatch.provider})`,
        actorUid: req.user.uid
      });
      await tx.insert(notifications).values([
        {
          recipientUid: rest.ownerUid,
          roleTarget: "restaurant_owner",
          title: `New Order ${newOrder.orderNumber}`,
          message: financials.paymentSplitMode === "online_food_cash_delivery" ? `Food \u09F3${financials.onlineFoodPayable} (${normalizedMethod.toUpperCase()} pending verify) \xB7 Delivery Cash \u09F3${financials.cashDueToRider} \xB7 ${input.deliveryArea}` : `\u09F3${newOrder.totalAmount} order from ${input.customerName} (${input.deliveryArea})`,
          type: "order",
          relatedOrderId: newOrder.id
        },
        {
          recipientUid: "role-super_admin",
          roleTarget: "super_admin",
          title: `New Order ${newOrder.orderNumber} \xB7 ${rest.name}`,
          message: `Food \u09F3${financials.onlineFoodPayable} + Cash Delivery \u09F3${financials.cashDueToRider} (${input.deliveryArea})`,
          type: "order",
          relatedOrderId: newOrder.id
        },
        {
          recipientUid: req.user.uid,
          roleTarget: "customer",
          title: `Order ${newOrder.orderNumber} Confirmed`,
          message: financials.paymentSplitMode === "online_food_cash_delivery" ? `Pay food \u09F3${financials.onlineFoodPayable} online; pay \u09F3${financials.cashDueToRider} delivery cash to rider.` : `Your order from ${rest.name} has been received.`,
          type: "order",
          relatedOrderId: newOrder.id
        }
      ]);
      return {
        order: newOrder,
        paymentSession: paymentInit,
        deliveryDispatch,
        restaurantOwnerUid: rest.ownerUid,
        restaurantEmail: rest.email
      };
    });
    const ownerEmailRows = created.restaurantOwnerUid ? await db.select({ email: users.email }).from(users).where(eq5(users.uid, created.restaurantOwnerUid)).limit(1) : [];
    const [emailLog, emailTransport] = await Promise.all([
      resolvedCustomerEmail ? sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
        trackingToken: created.order.trackingToken,
        customerName: created.order.customerName,
        customerEmail: resolvedCustomerEmail,
        restaurantName: created.order.restaurantName,
        deliveryArea: created.order.deliveryArea,
        deliveryAddress: created.order.deliveryAddress,
        subtotal: created.order.subtotal,
        discountAmount: created.order.discountAmount,
        couponCode: created.order.couponCode,
        deliveryFee: created.order.deliveryFee,
        serviceFee: created.order.serviceFee,
        taxAmount: created.order.taxAmount,
        totalAmount: created.order.totalAmount,
        paymentMethod: created.order.paymentMethod,
        paymentStatus: created.order.paymentStatus,
        status: created.order.status,
        statusEvent: "confirmed",
        statusNote: `Order placed via ${input.paymentMethod.toUpperCase()}`,
        etaMinutes: created.order.estimatedMinutes,
        createdAt: created.order.createdAt,
        paymentSplitMode: created.order.paymentSplitMode,
        onlineFoodPaidAmount: created.order.onlineFoodPaidAmount,
        cashDueToRider: created.order.cashDueToRider,
        items: created.order.itemsSnapshotJson
      }) : Promise.resolve(null),
      getEmailTransportStatus(),
      sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
        trackingToken: created.order.trackingToken,
        eventKind: "new_order",
        restaurantName: created.order.restaurantName,
        restaurantEmail: created.restaurantEmail,
        ownerEmail: ownerEmailRows[0]?.email || null,
        customerName: created.order.customerName,
        customerPhone: created.order.customerPhone,
        deliveryArea: created.order.deliveryArea,
        deliveryAddress: created.order.deliveryAddress,
        totalAmount: created.order.totalAmount,
        paymentMethod: created.order.paymentMethod,
        paymentStatus: created.order.paymentStatus,
        status: created.order.status,
        statusNote: `Order placed via ${input.paymentMethod.toUpperCase()}`,
        items: created.order.itemsSnapshotJson
      }).catch(() => [])
    ]);
    broadcastOrderEvent("order:created", {
      orderId: created.order.id,
      orderNumber: created.order.orderNumber,
      restaurantId: created.order.restaurantId,
      restaurantName: created.order.restaurantName,
      restaurantOwnerUid: created.restaurantOwnerUid,
      customerUid: created.order.customerUid,
      customerName: created.order.customerName,
      status: created.order.status,
      deliveryMode: created.order.deliveryMode,
      deliveryArea: created.order.deliveryArea,
      totalAmount: created.order.totalAmount
    });
    broadcastNotificationEvent({
      recipientUid: created.restaurantOwnerUid,
      roleTarget: "restaurant_owner",
      title: `New Order ${created.order.orderNumber}`,
      message: `\u09F3${created.order.totalAmount} order from ${created.order.customerName} (${created.order.deliveryArea})`,
      type: "order",
      relatedOrderId: created.order.id
    });
    broadcastNotificationEvent({
      recipientUid: "role-super_admin",
      roleTarget: "super_admin",
      title: `New Order ${created.order.orderNumber} \xB7 ${created.order.restaurantName}`,
      message: `\u09F3${created.order.totalAmount} order from ${created.order.customerName} (${created.order.deliveryArea})`,
      type: "order",
      relatedOrderId: created.order.id
    });
    broadcastNotificationEvent({
      recipientUid: created.order.customerUid,
      roleTarget: "customer",
      title: `Order ${created.order.orderNumber} Confirmed`,
      message: `Your order from ${created.order.restaurantName} has been received.`,
      type: "order",
      relatedOrderId: created.order.id
    });
    res.status(201).json({ ...created, emailLog, emailTransport });
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(400).json({ error: error.message || "Could not place order" });
  }
});
app.post("/api/payments/verify", requireAuth, async (req, res) => {
  const schema = z.object({
    orderId: z.number().int().positive(),
    transactionId: z.string().min(3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid verification payload" });
  try {
    const orderRows = await db.select().from(orders).where(eq5(orders.id, parsed.data.orderId)).limit(1);
    if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderRows[0];
    if (order.paymentStatus === "paid") {
      return res.json({ verified: true, order, message: "Payment already verified" });
    }
    const gatewayRows = await ensureDefaultPaymentGateways();
    const matchedGateway = gatewayRows.find(
      (g) => normalizeGatewayCode(g.code) === normalizeGatewayCode(order.paymentMethod)
    );
    const verifyExpectedAmount = order.paymentSplitMode === "online_food_cash_delivery" && (order.onlineFoodPaidAmount || 0) > 0 ? order.onlineFoodPaidAmount : order.totalAmount;
    const verification = verifyPaymentServerSide(
      order.paymentMethod,
      parsed.data.transactionId,
      verifyExpectedAmount,
      matchedGateway
    );
    if (!verification.verified) {
      return res.status(400).json({ error: verification.message });
    }
    const updated = await db.update(orders).set({
      paymentStatus: "paid",
      paymentTxId: verification.transactionId,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(orders.id, order.id)).returning();
    const foodPayKey = `food_pay:${order.orderNumber}`;
    const existingFoodTx = await db.select().from(paymentTransactions).where(eq5(paymentTransactions.idempotencyKey, foodPayKey)).limit(1);
    if (existingFoodTx.length > 0) {
      await db.update(paymentTransactions).set({
        status: "succeeded",
        gatewayTxId: verification.transactionId,
        note: verification.message,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(paymentTransactions.idempotencyKey, foodPayKey));
    } else {
      await db.insert(paymentTransactions).values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        txKind: "food_payment",
        idempotencyKey: foodPayKey,
        payerRole: "customer",
        recipientRole: "platform_restaurant",
        paymentMethod: order.paymentMethod,
        amount: verifyExpectedAmount,
        status: "succeeded",
        gatewayTxId: verification.transactionId,
        note: verification.message
      }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: order.status,
      note: verification.message,
      actorUid: req.user.uid
    });
    const restRowsForBroadcast = await db.select({ ownerUid: restaurants.ownerUid }).from(restaurants).where(eq5(restaurants.id, updated[0].restaurantId)).limit(1);
    const verifyRecipientEmail = await resolveCustomerEmailForOrder(
      updated[0].customerEmail,
      updated[0].customerUid
    );
    if (verifyRecipientEmail) {
      await sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        customerName: updated[0].customerName,
        customerEmail: verifyRecipientEmail,
        restaurantName: updated[0].restaurantName,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        subtotal: updated[0].subtotal,
        discountAmount: updated[0].discountAmount,
        couponCode: updated[0].couponCode,
        deliveryFee: updated[0].deliveryFee,
        serviceFee: updated[0].serviceFee,
        taxAmount: updated[0].taxAmount,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusEvent: "payment_verified",
        statusNote: verification.message,
        riderName: updated[0].riderName,
        etaMinutes: updated[0].estimatedMinutes,
        createdAt: updated[0].createdAt,
        paymentSplitMode: updated[0].paymentSplitMode,
        onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
        cashDueToRider: updated[0].cashDueToRider,
        items: updated[0].itemsSnapshotJson
      });
    }
    broadcastOrderEvent("order:updated", {
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      restaurantId: updated[0].restaurantId,
      restaurantName: updated[0].restaurantName,
      restaurantOwnerUid: restRowsForBroadcast[0]?.ownerUid || null,
      customerUid: updated[0].customerUid,
      riderUid: updated[0].riderUid,
      riderName: updated[0].riderName,
      status: updated[0].status,
      deliveryMode: updated[0].deliveryMode,
      deliveryArea: updated[0].deliveryArea,
      totalAmount: updated[0].totalAmount
    });
    res.json({ verified: true, order: updated[0], message: verification.message });
  } catch (error) {
    res.status(500).json({ error: error.message || "Payment verification failed" });
  }
});
app.post("/api/payments/webhook/:code", async (req, res) => {
  const code = normalizeGatewayCode(String(req.params.code || ""));
  if (!code) return res.status(400).json({ error: "Invalid gateway code" });
  try {
    const gwRows = await db.select().from(paymentGateways).where(eq5(paymentGateways.code, code)).limit(1);
    const gateway = gwRows[0];
    if (!gateway) return res.status(404).json({ error: `Payment gateway "${code}" not registered` });
    const expectedSecret = String(gateway.webhookSecret || "").trim();
    if (expectedSecret) {
      const providedSecret = String(
        req.header("x-webhook-secret") || req.body?.webhookSecret || ""
      ).trim();
      if (providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Invalid payment webhook secret" });
      }
    }
    const orderNumber = typeof req.body?.orderNumber === "string" ? req.body.orderNumber.trim() : "";
    const txId = typeof req.body?.transactionId === "string" ? req.body.transactionId.trim() : "";
    const statusRaw = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "paid";
    const nextPaymentStatus = statusRaw === "failed" ? "failed" : "paid";
    if (!orderNumber && !txId) {
      return res.status(400).json({ error: "orderNumber or transactionId is required" });
    }
    const matchingOrders = orderNumber ? await db.select().from(orders).where(eq5(orders.orderNumber, orderNumber)).limit(1) : await db.select().from(orders).where(eq5(orders.paymentTxId, txId)).limit(1);
    if (matchingOrders.length === 0) {
      return res.status(404).json({ error: "Matching order not found" });
    }
    const targetOrder = matchingOrders[0];
    const updated = await db.update(orders).set({
      paymentStatus: nextPaymentStatus,
      paymentTxId: txId || targetOrder.paymentTxId,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(orders.id, targetOrder.id)).returning();
    const webhookFoodKey = `food_pay:${targetOrder.orderNumber}`;
    const existingWebhookTx = await db.select().from(paymentTransactions).where(eq5(paymentTransactions.idempotencyKey, webhookFoodKey)).limit(1);
    const webhookTxStatus = nextPaymentStatus === "paid" ? "succeeded" : "failed";
    if (existingWebhookTx.length > 0) {
      await db.update(paymentTransactions).set({
        status: webhookTxStatus,
        gatewayTxId: txId || targetOrder.paymentTxId || "",
        note: `Webhook (${gateway.name}) marked food payment as ${nextPaymentStatus}`,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(paymentTransactions.idempotencyKey, webhookFoodKey));
    } else {
      await db.insert(paymentTransactions).values({
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        txKind: "food_payment",
        idempotencyKey: webhookFoodKey,
        payerRole: "customer",
        recipientRole: "platform_restaurant",
        paymentMethod: targetOrder.paymentMethod,
        amount: targetOrder.paymentSplitMode === "online_food_cash_delivery" ? targetOrder.onlineFoodPaidAmount || 0 : targetOrder.totalAmount,
        status: webhookTxStatus,
        gatewayTxId: txId || targetOrder.paymentTxId || "",
        note: `Webhook (${gateway.name}) marked food payment as ${nextPaymentStatus}`
      }).onConflictDoNothing({ target: paymentTransactions.idempotencyKey });
    }
    await db.insert(orderStatusHistory).values({
      orderId: targetOrder.id,
      status: targetOrder.status,
      note: `Webhook (${gateway.name}) marked payment as ${nextPaymentStatus}`,
      actorUid: `webhook:${code}`
    });
    const restOwnerRows = await db.select({ ownerUid: restaurants.ownerUid, email: restaurants.email }).from(restaurants).where(eq5(restaurants.id, updated[0].restaurantId)).limit(1);
    const webhookRecipient = await resolveCustomerEmailForOrder(
      updated[0].customerEmail,
      updated[0].customerUid
    );
    if (webhookRecipient && nextPaymentStatus === "paid") {
      await sendAndLogOrderTrackingEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        customerName: updated[0].customerName,
        customerEmail: webhookRecipient,
        restaurantName: updated[0].restaurantName,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        subtotal: updated[0].subtotal,
        discountAmount: updated[0].discountAmount,
        couponCode: updated[0].couponCode,
        deliveryFee: updated[0].deliveryFee,
        serviceFee: updated[0].serviceFee,
        taxAmount: updated[0].taxAmount,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: "payment_verified",
        statusEvent: "payment_verified",
        statusNote: `${gateway.name} confirmed payment`,
        riderName: updated[0].riderName,
        etaMinutes: updated[0].estimatedMinutes,
        createdAt: updated[0].createdAt,
        paymentSplitMode: updated[0].paymentSplitMode,
        onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
        cashDueToRider: updated[0].cashDueToRider,
        items: updated[0].itemsSnapshotJson
      });
    }
    await sendMerchantOrderAlertEmail({
      origin: getRequestOrigin(req),
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      trackingToken: updated[0].trackingToken,
      eventKind: "status_update",
      restaurantName: updated[0].restaurantName,
      restaurantEmail: restOwnerRows[0]?.email || null,
      customerName: updated[0].customerName,
      customerPhone: updated[0].customerPhone,
      deliveryArea: updated[0].deliveryArea,
      deliveryAddress: updated[0].deliveryAddress,
      totalAmount: updated[0].totalAmount,
      paymentMethod: updated[0].paymentMethod,
      paymentStatus: updated[0].paymentStatus,
      status: updated[0].status,
      statusNote: `Webhook (${gateway.name}): ${nextPaymentStatus}`,
      riderName: updated[0].riderName,
      items: updated[0].itemsSnapshotJson
    }).catch(() => []);
    broadcastOrderEvent("order:updated", {
      orderId: updated[0].id,
      orderNumber: updated[0].orderNumber,
      restaurantId: updated[0].restaurantId,
      restaurantName: updated[0].restaurantName,
      restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
      customerUid: updated[0].customerUid,
      riderUid: updated[0].riderUid,
      riderName: updated[0].riderName,
      status: updated[0].status,
      deliveryMode: updated[0].deliveryMode,
      deliveryArea: updated[0].deliveryArea,
      totalAmount: updated[0].totalAmount
    });
    res.json({ ok: true, order: updated[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Webhook processing failed" });
  }
});
app.post("/api/reviews", requireAuth, async (req, res) => {
  const schema = z.object({
    restaurantId: z.number().int().positive(),
    orderId: z.number().int().positive().optional(),
    rating: z.number().int().min(1).max(5),
    foodRating: z.number().int().min(1).max(5),
    comment: z.string().min(2).max(500)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please write a short review and rating" });
  try {
    const inserted = await db.insert(reviews).values({
      restaurantId: parsed.data.restaurantId,
      orderId: parsed.data.orderId ?? null,
      customerUid: req.user.uid,
      customerName: req.user.fullName,
      rating: parsed.data.rating,
      foodRating: parsed.data.foodRating,
      comment: parsed.data.comment
    }).returning();
    const allReviews = await db.select().from(reviews).where(eq5(reviews.restaurantId, parsed.data.restaurantId));
    const avg = allReviews.reduce((s, r) => s + r.rating, 0) / Math.max(1, allReviews.length);
    await db.update(restaurants).set({
      rating: avg.toFixed(1),
      reviewCount: sql3`${restaurants.reviewCount} + 1`
    }).where(eq5(restaurants.id, parsed.data.restaurantId));
    res.status(201).json({ review: inserted[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/restaurants/register", requireAuth, async (req, res) => {
  const schema = z.object({
    ownerName: z.string().min(2),
    name: z.string().min(2),
    nameBn: z.string().min(2),
    cuisine: z.string().min(2),
    area: z.string().min(2),
    address: z.string().min(5),
    lat: z.number(),
    lng: z.number(),
    phone: z.string().min(6),
    email: z.string().email(),
    description: z.string().min(5),
    tradeLicense: z.string().min(3),
    nidNumber: z.string().min(5),
    payoutMethod: z.string().trim().min(2).max(40),
    payoutAccount: z.string().min(5),
    logoUrl: z.string().optional().default(""),
    coverUrl: z.string().optional().default(""),
    deliveryFee: z.number().int().min(0).max(300).default(49),
    minOrder: z.number().int().min(50).max(5e3).default(150),
    deliveryMode: z.enum(["platform", "restaurant", "third_party"]).default("platform")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please complete all restaurant onboarding fields" });
  }
  try {
    const isOwnerAdmin = req.user.role === "admin" || req.user.role === "super_admin";
    const existingOwned = await db.select({ id: restaurants.id }).from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid)).limit(1);
    const limitCheck = canOwnerOpenNewRestaurant(existingOwned.length, req.user.role);
    if (!limitCheck.allowed) {
      return res.status(400).json({ error: limitCheck.error });
    }
    const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;
    const inserted = await db.insert(restaurants).values({
      ownerUid: req.user.uid,
      name: parsed.data.name,
      nameBn: parsed.data.nameBn,
      slug,
      description: parsed.data.description,
      cuisine: parsed.data.cuisine,
      area: parsed.data.area,
      address: parsed.data.address,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      phone: parsed.data.phone,
      email: parsed.data.email,
      logoUrl: parsed.data.logoUrl?.trim() || "",
      coverUrl: parsed.data.coverUrl?.trim() || IMG_BANGLA,
      tradeLicense: parsed.data.tradeLicense,
      nidNumber: parsed.data.nidNumber,
      payoutMethod: parsed.data.payoutMethod,
      payoutAccount: parsed.data.payoutAccount,
      deliveryFee: parsed.data.deliveryFee,
      minOrder: parsed.data.minOrder,
      deliveryMode: parsed.data.deliveryMode,
      isNew: true,
      status: isOwnerAdmin ? "approved" : "pending"
    }).returning();
    if (req.user.role === "customer") {
      await db.update(users).set({ role: "restaurant_owner", fullName: parsed.data.ownerName }).where(eq5(users.uid, req.user.uid));
    }
    await db.insert(notifications).values({
      recipientUid: "demo-admin-uid",
      roleTarget: "super_admin",
      title: isOwnerAdmin ? "Owner Store Launched" : "New Restaurant Application",
      message: isOwnerAdmin ? `${parsed.data.name} (${parsed.data.area}) launched directly by Platform Owner.` : `${parsed.data.name} (${parsed.data.area}) submitted documents for approval.`,
      type: "approval"
    });
    res.status(201).json({ restaurant: inserted[0] });
  } catch (error) {
    console.error("Restaurant registration error:", error);
    res.status(500).json({ error: error.message || "Failed to register restaurant" });
  }
});
app.post(
  "/api/vendor/branches",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      primaryRestaurantId: z.number().int().positive().optional(),
      branchName: z.string().trim().min(2).max(60),
      branchNameBn: z.string().trim().max(60).optional().default(""),
      area: z.string().trim().min(2).max(80),
      address: z.string().trim().min(5).max(200),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      phone: z.string().trim().min(6).max(30),
      deliveryFee: z.number().int().min(0).max(300).default(49),
      minOrder: z.number().int().min(50).max(5e3).default(150),
      deliveryMode: z.enum(["platform", "restaurant", "third_party"]).default("platform"),
      copyMenu: z.boolean().default(true)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please complete all branch fields." });
    }
    try {
      const isSuperAdmin = req.user.role === "admin" || req.user.role === "super_admin";
      const primaryRows = isSuperAdmin && parsed.data.primaryRestaurantId ? await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.primaryRestaurantId)).limit(1) : parsed.data.primaryRestaurantId ? await db.select().from(restaurants).where(
        and2(
          eq5(restaurants.id, parsed.data.primaryRestaurantId),
          eq5(restaurants.ownerUid, req.user.uid)
        )
      ).limit(1) : await db.select().from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid)).orderBy(asc2(restaurants.id)).limit(1);
      const primary = primaryRows[0];
      if (!primary) {
        return res.status(404).json({
          error: "Please open your primary restaurant first before adding a branch."
        });
      }
      const branchNames = buildBranchRestaurantNames(
        primary.name,
        primary.nameBn,
        parsed.data.branchName,
        parsed.data.branchNameBn
      );
      const slugBase = branchNames.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;
      const branchStatus = primary.status === "approved" || isSuperAdmin ? "approved" : "pending";
      const inserted = await db.insert(restaurants).values({
        ownerUid: primary.ownerUid,
        name: branchNames.name,
        nameBn: branchNames.nameBn,
        slug,
        description: primary.description,
        cuisine: primary.cuisine,
        area: parsed.data.area,
        address: parsed.data.address,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        phone: parsed.data.phone,
        email: primary.email,
        logoUrl: primary.logoUrl || "",
        coverUrl: primary.coverUrl || IMG_BANGLA,
        tradeLicense: primary.tradeLicense || "",
        nidNumber: primary.nidNumber || "",
        payoutMethod: primary.payoutMethod,
        payoutAccount: primary.payoutAccount,
        deliveryFee: parsed.data.deliveryFee,
        minOrder: parsed.data.minOrder,
        deliveryMode: parsed.data.deliveryMode,
        commissionRate: primary.commissionRate,
        isNew: true,
        status: branchStatus
      }).returning();
      const createdBranch = inserted[0];
      let copiedItemsCount = 0;
      if (parsed.data.copyMenu) {
        const sourceItems = await db.select().from(foodItems).where(eq5(foodItems.restaurantId, primary.id));
        if (sourceItems.length > 0) {
          await db.insert(foodItems).values(
            sourceItems.map((it) => ({
              restaurantId: createdBranch.id,
              category: it.category,
              name: it.name,
              nameBn: it.nameBn,
              description: it.description,
              imageUrl: it.imageUrl,
              price: it.price,
              discountPrice: it.discountPrice,
              variationsJson: it.variationsJson,
              addonsJson: it.addonsJson,
              inStock: it.inStock,
              isAvailable: it.isAvailable,
              isPopular: it.isPopular,
              isVisibleOnStorefront: it.isVisibleOnStorefront
            }))
          );
          copiedItemsCount = sourceItems.length;
        }
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "vendor_added_branch",
        targetType: "restaurant",
        targetId: String(createdBranch.id),
        details: `Added branch "${createdBranch.name}" (${createdBranch.area}) under primary restaurant #${primary.id} (${copiedItemsCount} menu items copied)`
      });
      await db.insert(notifications).values({
        recipientUid: "demo-admin-uid",
        roleTarget: "super_admin",
        title: "New Restaurant Branch Added",
        message: `${createdBranch.name} (${createdBranch.area}) was added as a branch.`,
        type: "system"
      });
      res.status(201).json({ branch: createdBranch, copiedItemsCount });
    } catch (error) {
      console.error("Add branch error:", error);
      res.status(500).json({ error: error.message || "Failed to add restaurant branch" });
    }
  }
);
app.get(
  "/api/vendor/workspace",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const isSuperAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      const requestedRaw = Number(req.query.restaurantId);
      const requestedRestaurantId = Number.isInteger(requestedRaw) && (requestedRaw > 0 || requestedRaw === -1) ? requestedRaw : null;
      const data = await getVendorWorkspace(req.user.uid, isSuperAdmin, requestedRestaurantId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/vendor/menu",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      category: z.string().min(2),
      name: z.string().min(2),
      nameBn: z.string().min(2),
      description: z.string().default(""),
      imageUrl: z.string().default(IMG_BANGLA),
      price: z.number().int().positive(),
      discountPrice: z.number().int().positive().nullable().optional(),
      isPopular: z.boolean().default(false),
      variationsJson: z.array(z.object({ name: z.string(), priceDelta: z.number() })).optional(),
      addonsJson: z.array(z.object({ name: z.string(), price: z.number() })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid food item details" });
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0].ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Not owner of this restaurant" });
      }
      const variationsJson = normalizeVariationsList(parsed.data.variationsJson, true);
      const addonsJson = normalizeAddonsList(parsed.data.addonsJson);
      const inserted = await db.insert(foodItems).values({
        restaurantId: parsed.data.restaurantId,
        category: parsed.data.category,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn,
        description: parsed.data.description,
        imageUrl: parsed.data.imageUrl || restRows[0].coverUrl,
        price: parsed.data.price,
        discountPrice: parsed.data.discountPrice ?? null,
        variationsJson,
        addonsJson,
        isPopular: parsed.data.isPopular
      }).returning();
      res.status(201).json({ item: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/vendor/menu/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: "Invalid item ID" });
    const schema = z.object({
      category: z.string().trim().min(1).max(60).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      nameBn: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(600).optional(),
      imageUrl: z.string().max(600).optional(),
      inStock: z.boolean().optional(),
      isAvailable: z.boolean().optional(),
      isPopular: z.boolean().optional(),
      isVisibleOnStorefront: z.boolean().optional(),
      price: z.number().int().positive().max(1e5).optional(),
      discountPrice: z.number().int().positive().max(1e5).nullable().optional(),
      variationsJson: z.array(z.object({ name: z.string(), priceDelta: z.number() })).optional(),
      addonsJson: z.array(z.object({ name: z.string(), price: z.number() })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid menu item update" });
    }
    try {
      const itemRows = await db.select().from(foodItems).where(eq5(foodItems.id, itemId)).limit(1);
      if (itemRows.length === 0) return res.status(404).json({ error: "Food item not found" });
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, itemRows[0].restaurantId)).limit(1);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0]?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const d = parsed.data;
      const nextVariations = d.variationsJson !== void 0 ? normalizeVariationsList(d.variationsJson, true) : itemRows[0].variationsJson;
      const nextAddons = d.addonsJson !== void 0 ? normalizeAddonsList(d.addonsJson) : itemRows[0].addonsJson;
      const updated = await db.update(foodItems).set({
        category: d.category ?? itemRows[0].category,
        name: d.name ?? itemRows[0].name,
        nameBn: d.nameBn ?? itemRows[0].nameBn,
        description: d.description ?? itemRows[0].description,
        imageUrl: d.imageUrl && d.imageUrl.trim() ? d.imageUrl.trim() : itemRows[0].imageUrl,
        inStock: d.inStock ?? itemRows[0].inStock,
        isAvailable: d.isAvailable ?? itemRows[0].isAvailable,
        isPopular: d.isPopular ?? itemRows[0].isPopular,
        isVisibleOnStorefront: d.isVisibleOnStorefront ?? itemRows[0].isVisibleOnStorefront,
        price: d.price ?? itemRows[0].price,
        discountPrice: d.discountPrice === void 0 ? itemRows[0].discountPrice : d.discountPrice,
        variationsJson: nextVariations,
        addonsJson: nextAddons,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(foodItems.id, itemId)).returning();
      res.json({ item: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.delete(
  "/api/vendor/menu/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: "Invalid item ID" });
    try {
      const itemRows = await db.select().from(foodItems).where(eq5(foodItems.id, itemId)).limit(1);
      if (itemRows.length === 0) return res.status(404).json({ error: "Item not found" });
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, itemRows[0].restaurantId)).limit(1);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0]?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await db.delete(foodItems).where(eq5(foodItems.id, itemId));
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
function hashPartnerApiKey(rawKey) {
  return crypto4.createHash("sha256").update(rawKey.trim()).digest("hex");
}
function extractPartnerApiKey(req) {
  const headerKey = req.header("x-partner-api-key")?.trim();
  if (headerKey) return headerKey;
  const authHeader = req.header("authorization")?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith("bearer fbd_")) {
    return authHeader.slice(7).trim();
  }
  return null;
}
async function resolvePartnerRestaurant(req) {
  const rawKey = extractPartnerApiKey(req);
  if (!rawKey) return { ok: false, error: "Missing X-Partner-API-Key header", status: 401 };
  const keyHash = hashPartnerApiKey(rawKey);
  const keyRows = await db.select().from(partnerApiKeys).where(eq5(partnerApiKeys.keyHash, keyHash)).limit(1);
  if (keyRows.length === 0) {
    return { ok: false, error: "Invalid or revoked Partner API key", status: 401 };
  }
  const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, keyRows[0].restaurantId)).limit(1);
  if (restRows.length === 0) {
    return { ok: false, error: "Linked restaurant no longer exists", status: 404 };
  }
  if (restRows[0].status === "suspended" || restRows[0].status === "rejected") {
    return { ok: false, error: "Restaurant account is not active for Partner API access", status: 403 };
  }
  await db.update(partnerApiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq5(partnerApiKeys.id, keyRows[0].id));
  return { ok: true, restaurant: restRows[0], apiKeyRow: keyRows[0] };
}
app.get(
  "/api/vendor/api-key",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const requestedId = Number(req.query.restaurantId);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      let restRows = Number.isInteger(requestedId) && requestedId > 0 ? await db.select().from(restaurants).where(eq5(restaurants.id, requestedId)).limit(1) : await db.select().from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid)).limit(1);
      if (restRows.length === 0 && isAdmin && !(Number.isInteger(requestedId) && requestedId > 0)) {
        restRows = await db.select().from(restaurants).limit(1);
      }
      if (restRows.length === 0) {
        return res.json({ hasKey: false, restaurantId: null, keyPrefix: null, label: null, lastUsedAt: null });
      }
      if (!isAdmin && restRows[0].ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const keyRows = await db.select().from(partnerApiKeys).where(eq5(partnerApiKeys.restaurantId, restRows[0].id)).limit(1);
      if (keyRows.length === 0) {
        return res.json({
          hasKey: false,
          restaurantId: restRows[0].id,
          keyPrefix: null,
          label: null,
          lastUsedAt: null,
          updatedAt: null
        });
      }
      return res.json({
        hasKey: true,
        restaurantId: restRows[0].id,
        keyPrefix: keyRows[0].keyPrefix,
        label: keyRows[0].label,
        lastUsedAt: keyRows[0].lastUsedAt,
        updatedAt: keyRows[0].updatedAt
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/vendor/api-key/rotate",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      label: z.string().min(2).max(60).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid API key rotation request" });
    }
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0].ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const rawKey = `fbd_live_${crypto4.randomBytes(16).toString("hex")}`;
      const keyHash = hashPartnerApiKey(rawKey);
      const keyPrefix = `${rawKey.slice(0, 14)}...${rawKey.slice(-4)}`;
      const label = parsed.data.label?.trim() || "Partner Menu API Key";
      const upserted = await db.insert(partnerApiKeys).values({
        restaurantId: restRows[0].id,
        keyHash,
        keyPrefix,
        label,
        updatedAt: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: partnerApiKeys.restaurantId,
        set: {
          keyHash,
          keyPrefix,
          label,
          lastUsedAt: null,
          updatedAt: /* @__PURE__ */ new Date()
        }
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "partner_api_key_rotated",
        targetType: "restaurant",
        targetId: String(restRows[0].id),
        details: JSON.stringify({ keyPrefix, label })
      });
      res.status(201).json({
        apiKey: rawKey,
        restaurantId: restRows[0].id,
        keyPrefix: upserted[0].keyPrefix,
        label: upserted[0].label,
        updatedAt: upserted[0].updatedAt
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.get("/api/partner/v1/products", async (req, res) => {
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const products = await db.select().from(foodItems).where(eq5(foodItems.restaurantId, auth.restaurant.id)).orderBy(desc3(foodItems.id));
    res.json({
      restaurant: {
        id: auth.restaurant.id,
        name: auth.restaurant.name,
        nameBn: auth.restaurant.nameBn,
        slug: auth.restaurant.slug,
        area: auth.restaurant.area,
        status: auth.restaurant.status
      },
      count: products.length,
      products
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch partner products" });
  }
});
app.post("/api/partner/v1/products", async (req, res) => {
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const body = req.body;
    const rawItems = Array.isArray(body?.products) ? body.products : Array.isArray(body) ? body : [body];
    if (rawItems.length === 0 || rawItems.length > 50) {
      return res.status(400).json({ error: "Provide between 1 and 50 products per request." });
    }
    const normalizedList = [];
    for (let i = 0; i < rawItems.length; i++) {
      const check = normalizePartnerProductInput(
        rawItems[i] && typeof rawItems[i] === "object" ? rawItems[i] : {},
        auth.restaurant.coverUrl || IMG_BANGLA
      );
      if (!check.valid) {
        return res.status(400).json({ error: check.reason, index: i });
      }
      normalizedList.push(check);
    }
    const inserted = await db.insert(foodItems).values(
      normalizedList.map((entry) => ({
        restaurantId: auth.restaurant.id,
        category: entry.product.category,
        name: entry.product.name,
        nameBn: entry.product.nameBn,
        description: entry.product.description,
        imageUrl: entry.product.imageUrl,
        price: entry.product.price,
        discountPrice: entry.product.discountPrice,
        inStock: entry.product.inStock,
        isAvailable: entry.product.isAvailable,
        isVisibleOnStorefront: true,
        isPopular: entry.product.isPopular,
        variationsJson: entry.product.variationsJson,
        addonsJson: entry.product.addonsJson
      }))
    ).returning();
    await db.insert(auditLogs).values({
      actorUid: auth.restaurant.ownerUid,
      action: "partner_api_product_created",
      targetType: "food_item",
      targetId: String(inserted[0].id),
      details: JSON.stringify({
        restaurantId: auth.restaurant.id,
        count: inserted.length,
        names: inserted.map((p) => p.name)
      })
    });
    res.status(201).json({
      count: inserted.length,
      product: inserted.length === 1 ? inserted[0] : void 0,
      products: inserted
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Partner API failed to add product" });
  }
});
app.patch("/api/partner/v1/products/:id", async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: "Invalid product ID" });
  }
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const existing = await db.select().from(foodItems).where(and2(eq5(foodItems.id, itemId), eq5(foodItems.restaurantId, auth.restaurant.id))).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Product not found for this partner restaurant" });
    }
    const cur = existing[0];
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const merged = normalizePartnerProductInput(
      {
        name: body.name ?? cur.name,
        nameBn: body.nameBn ?? cur.nameBn,
        category: body.category ?? cur.category,
        description: body.description ?? cur.description,
        imageUrl: body.imageUrl ?? cur.imageUrl,
        price: body.price ?? cur.price,
        discountPrice: body.discountPrice === void 0 ? cur.discountPrice : body.discountPrice,
        inStock: body.inStock ?? cur.inStock,
        isAvailable: body.isAvailable ?? cur.isAvailable,
        isPopular: body.isPopular ?? cur.isPopular,
        variations: body.variations ?? cur.variationsJson,
        addons: body.addons ?? cur.addonsJson
      },
      cur.imageUrl || auth.restaurant.coverUrl || IMG_BANGLA
    );
    if (!merged.valid) {
      return res.status(400).json({ error: merged.reason });
    }
    const updated = await db.update(foodItems).set({
      name: merged.product.name,
      nameBn: merged.product.nameBn,
      category: merged.product.category,
      description: merged.product.description,
      imageUrl: merged.product.imageUrl,
      price: merged.product.price,
      discountPrice: merged.product.discountPrice,
      inStock: merged.product.inStock,
      isAvailable: merged.product.isAvailable,
      isPopular: merged.product.isPopular,
      variationsJson: merged.product.variationsJson,
      addonsJson: merged.product.addonsJson,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and2(eq5(foodItems.id, itemId), eq5(foodItems.restaurantId, auth.restaurant.id))).returning();
    res.json({ product: updated[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update partner product" });
  }
});
app.delete("/api/partner/v1/products/:id", async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: "Invalid product ID" });
  }
  try {
    const auth = await resolvePartnerRestaurant(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const deleted = await db.delete(foodItems).where(and2(eq5(foodItems.id, itemId), eq5(foodItems.restaurantId, auth.restaurant.id))).returning();
    if (deleted.length === 0) {
      return res.status(404).json({ error: "Product not found for this partner restaurant" });
    }
    res.json({ deleted: true, id: itemId });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to delete partner product" });
  }
});
app.patch(
  "/api/vendor/restaurant",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      isOpen: z.boolean().optional(),
      openingHours: z.string().optional(),
      deliveryFee: z.number().int().min(0).max(500).optional(),
      minOrder: z.number().int().min(0).max(5e3).optional(),
      deliveryMode: z.enum(["platform", "restaurant", "third_party"]).optional(),
      logoUrl: z.string().optional(),
      coverUrl: z.string().optional(),
      description: z.string().optional(),
      area: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      lat: z.number().optional(),
      lng: z.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid restaurant settings" });
    try {
      const rows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rows[0].ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await db.update(restaurants).set({
        isOpen: parsed.data.isOpen ?? rows[0].isOpen,
        openingHours: parsed.data.openingHours ?? rows[0].openingHours,
        deliveryFee: parsed.data.deliveryFee ?? rows[0].deliveryFee,
        minOrder: parsed.data.minOrder ?? rows[0].minOrder,
        deliveryMode: parsed.data.deliveryMode ?? rows[0].deliveryMode,
        area: parsed.data.area !== void 0 ? parsed.data.area.trim() : rows[0].area,
        address: parsed.data.address !== void 0 ? parsed.data.address.trim() : rows[0].address,
        lat: parsed.data.lat !== void 0 ? parsed.data.lat : rows[0].lat,
        lng: parsed.data.lng !== void 0 ? parsed.data.lng : rows[0].lng,
        logoUrl: parsed.data.logoUrl !== void 0 ? parsed.data.logoUrl.trim() : rows[0].logoUrl,
        coverUrl: parsed.data.coverUrl !== void 0 && parsed.data.coverUrl.trim() ? parsed.data.coverUrl.trim() : rows[0].coverUrl,
        description: parsed.data.description !== void 0 ? parsed.data.description.trim() : rows[0].description,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(restaurants.id, rows[0].id)).returning();
      res.json({ restaurant: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/vendor/orders/:id/status",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(["accepted", "preparing", "ready", "on_the_way", "delivered", "cancelled"]),
      note: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: "Invalid status update" });
    }
    try {
      const orderRows = await db.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
      const order = orderRows[0];
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, order.restaurantId)).limit(1);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0]?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Order belongs to another restaurant" });
      }
      if (!canTransitionOrderStatus(order.status, parsed.data.status)) {
        return res.status(400).json({
          error: `Cannot transition order from ${order.status} to ${parsed.data.status}`
        });
      }
      const prepaidCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: parsed.data.status
      });
      if (!prepaidCheck.allowed) {
        return res.status(400).json({ error: prepaidCheck.reason });
      }
      const updated = await db.transaction(async (tx) => {
        const nextPaymentStatus = parsed.data.status === "cancelled" ? order.paymentStatus === "paid" ? "refunded" : "failed" : order.paymentStatus;
        const rows = await tx.update(orders).set({
          status: parsed.data.status,
          paymentStatus: nextPaymentStatus,
          cancelReason: parsed.data.status === "cancelled" ? parsed.data.note || "Cancelled by restaurant" : order.cancelReason,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(orders.id, order.id)).returning();
        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          status: parsed.data.status,
          note: parsed.data.note || `Updated to ${parsed.data.status}`,
          actorUid: req.user.uid
        });
        if (parsed.data.status === "cancelled") {
          await reverseOrderSplitFinancialsTx(
            tx,
            order,
            parsed.data.note || "Cancelled by restaurant"
          );
        }
        return rows;
      });
      if (parsed.data.status === "delivered") {
        await settleOrderCommissionIdempotent(order.id);
        await recordRiderDeliveryWalletIdempotent(order.id, void 0, req.user.uid);
      }
      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace("_", " ")}`,
        message: parsed.data.note || `${order.restaurantName} updated your order status.`,
        type: "order",
        relatedOrderId: order.id
      });
      const vendorStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (vendorStatusRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: vendorStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote: parsed.data.note || `${order.restaurantName} updated order status`,
          riderName: updated[0].riderName,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson
        });
      }
      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: "status_update",
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: parsed.data.note || `${order.restaurantName} updated order status`,
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson
      }).catch(() => []);
      broadcastOrderEvent("order:updated", {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        customerName: updated[0].customerName,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace("_", " ")}`,
        message: parsed.data.note || `${order.restaurantName} updated your order status.`,
        type: "order",
        relatedOrderId: order.id
      });
      broadcastNotificationEvent({
        recipientUid: "role-super_admin",
        roleTarget: "super_admin",
        title: `Order ${order.orderNumber}: ${parsed.data.status.replace("_", " ")}`,
        message: `${order.restaurantName} updated order ${order.orderNumber}.`,
        type: "order",
        relatedOrderId: order.id
      });
      res.json({ order: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.get(
  "/api/vendor/riders",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const restId = Number(req.query.restaurantId);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      let targetRest = null;
      if (Number.isInteger(restId) && restId > 0) {
        const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, restId)).limit(1);
        if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
        if (!isAdmin && restRows[0].ownerUid !== req.user.uid) {
          return res.status(403).json({ error: "Forbidden" });
        }
        targetRest = restRows[0];
      }
      const ownedStores = isAdmin ? [] : await db.select({ id: restaurants.id }).from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid));
      const ownedSet = new Set(ownedStores.map((s) => s.id));
      const riderRows = await db.select({
        id: riders.id,
        uid: riders.uid,
        restaurantId: riders.restaurantId,
        addedByUid: riders.addedByUid,
        fullName: riders.fullName,
        phone: riders.phone,
        email: riders.email,
        vehicleType: riders.vehicleType,
        zone: riders.zone,
        isAvailable: riders.isAvailable,
        status: riders.status,
        currentLat: riders.currentLat,
        currentLng: riders.currentLng,
        totalDeliveries: riders.totalDeliveries
      }).from(riders).where(eq5(riders.status, "approved"));
      const enriched = riderRows.map((r) => {
        const isOwnRider = Boolean(
          targetRest && r.restaurantId === targetRest.id || r.restaurantId && ownedSet.has(r.restaurantId) || r.addedByUid === req.user.uid
        );
        return {
          ...r,
          isOwnRider,
          distanceKm: targetRest ? Math.round(
            haversineDistanceKm(r.currentLat, r.currentLng, targetRest.lat, targetRest.lng) * 100
          ) / 100 : null
        };
      }).sort((a, b) => {
        if (a.isOwnRider !== b.isOwnRider) return a.isOwnRider ? -1 : 1;
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        if (a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm;
        }
        return b.totalDeliveries - a.totalDeliveries;
      });
      res.json({ riders: enriched });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load riders" });
    }
  }
);
app.post(
  "/api/vendor/riders",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const check = validateVendorAddRiderPayload(req.body || {});
    if (check.valid === false) {
      return res.status(400).json({ error: check.reason });
    }
    const { restaurantId, fullName, phone, email, password, vehicleType, zone, nidNumber } = check.data;
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Not owner of this restaurant" });
      }
      const existingUsers = await db.select().from(users).where(sql3`lower(${users.email}) = ${email}`).limit(1);
      if (existingUsers.length > 0 && (existingUsers[0].role === "admin" || existingUsers[0].role === "super_admin")) {
        return res.status(409).json({
          error: "This email belongs to an admin account and cannot be registered as a rider."
        });
      }
      const riderUid = existingUsers[0]?.uid || `rdr-${crypto4.randomBytes(6).toString("hex")}`;
      if (existingUsers.length === 0) {
        await db.insert(users).values({
          uid: riderUid,
          email,
          fullName,
          phone,
          role: "rider"
        });
      } else if (existingUsers[0].role === "customer") {
        await db.update(users).set({ role: "rider", fullName, phone, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.uid, existingUsers[0].uid));
      }
      if (password) {
        await db.insert(localCredentials).values({
          email,
          uid: riderUid,
          passwordHash: hashPasswordScrypt(password)
        }).onConflictDoUpdate({
          target: localCredentials.email,
          set: { passwordHash: hashPasswordScrypt(password) }
        });
      }
      const upserted = await db.insert(riders).values({
        uid: riderUid,
        restaurantId: rest.id,
        addedByUid: req.user.uid,
        fullName,
        phone,
        email,
        vehicleType,
        nidNumber,
        zone,
        isAvailable: true,
        status: "approved",
        currentLat: rest.lat,
        currentLng: rest.lng,
        locationUpdatedAt: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: riders.uid,
        set: {
          restaurantId: rest.id,
          addedByUid: req.user.uid,
          fullName,
          phone,
          email,
          vehicleType,
          nidNumber: nidNumber || void 0,
          zone,
          isAvailable: true,
          status: "approved",
          locationUpdatedAt: /* @__PURE__ */ new Date()
        }
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "vendor_added_rider",
        targetType: "rider",
        targetId: String(upserted[0].id),
        details: JSON.stringify({ restaurantId: rest.id, fullName, email, vehicleType })
      });
      broadcastNotificationEvent({
        recipientUid: riderUid,
        roleTarget: "rider",
        title: `Added as Rider \xB7 ${rest.name}`,
        message: `${rest.name} added you as a delivery rider for ${zone}.`,
        type: "system"
      });
      res.status(201).json({
        rider: {
          ...upserted[0],
          isOwnRider: true,
          distanceKm: 0
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to add delivery man" });
    }
  }
);
app.patch(
  "/api/vendor/riders/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const riderId = Number(req.params.id);
    if (!Number.isInteger(riderId)) return res.status(400).json({ error: "Invalid rider ID" });
    const schema = z.object({
      isAvailable: z.boolean().optional(),
      fullName: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().min(6).max(30).optional(),
      vehicleType: z.string().trim().min(2).max(60).optional(),
      zone: z.string().trim().min(2).max(120).optional()
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid rider update payload" });
    try {
      const existing = await db.select().from(riders).where(eq5(riders.id, riderId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Rider not found" });
      const row = existing[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      let ownsRest = row.addedByUid === req.user.uid;
      if (!ownsRest && row.restaurantId) {
        const restRows = await db.select({ ownerUid: restaurants.ownerUid }).from(restaurants).where(eq5(restaurants.id, row.restaurantId)).limit(1);
        ownsRest = restRows[0]?.ownerUid === req.user.uid;
      }
      if (!isAdmin && !ownsRest) {
        return res.status(403).json({
          error: "Only riders added to your own restaurant can be modified here."
        });
      }
      const d = parsed.data;
      const updated = await db.update(riders).set({
        isAvailable: d.isAvailable ?? row.isAvailable,
        fullName: d.fullName ?? row.fullName,
        phone: d.phone ?? row.phone,
        vehicleType: d.vehicleType ?? row.vehicleType,
        zone: d.zone ?? row.zone
      }).where(eq5(riders.id, riderId)).returning();
      res.json({ rider: { ...updated[0], isOwnRider: true } });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update rider" });
    }
  }
);
app.delete(
  "/api/vendor/riders/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const riderId = Number(req.params.id);
    if (!Number.isInteger(riderId)) return res.status(400).json({ error: "Invalid rider ID" });
    try {
      const existing = await db.select().from(riders).where(eq5(riders.id, riderId)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Rider not found" });
      const row = existing[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      let ownsRest = row.addedByUid === req.user.uid;
      if (!ownsRest && row.restaurantId) {
        const restRows = await db.select({ ownerUid: restaurants.ownerUid }).from(restaurants).where(eq5(restaurants.id, row.restaurantId)).limit(1);
        ownsRest = restRows[0]?.ownerUid === req.user.uid;
      }
      if (!isAdmin && !ownsRest) {
        return res.status(403).json({ error: "Forbidden: Rider does not belong to your restaurant" });
      }
      await db.delete(riders).where(eq5(riders.id, riderId));
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to remove rider" });
    }
  }
);
app.post(
  "/api/vendor/orders/:id/assign-rider",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      riderUid: z.string().nullable().optional(),
      autoAssignNearest: z.boolean().optional(),
      note: z.string().max(240).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: "Invalid rider assignment request" });
    }
    try {
      const orderRows = await db.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
      const order = orderRows[0];
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, order.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Order belongs to another restaurant" });
      }
      if (order.status === "delivered" || order.status === "cancelled") {
        return res.status(400).json({
          error: `Cannot assign rider to a ${order.status} order.`
        });
      }
      const prepaidAssignCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: "rider_assigned"
      });
      if (!prepaidAssignCheck.allowed) {
        return res.status(400).json({ error: prepaidAssignCheck.reason });
      }
      let nextRiderUid = order.riderUid || null;
      let nextRiderName = order.riderName || null;
      let assignedRiderPhone = "";
      if (parsed.data.autoAssignNearest) {
        const approvedRiders = await db.select().from(riders).where(eq5(riders.status, "approved"));
        const picked = pickNearestStandbyRider(
          approvedRiders.map((r) => ({
            uid: r.uid,
            fullName: r.fullName,
            phone: r.phone,
            vehicleType: r.vehicleType,
            zone: r.zone,
            isAvailable: r.isAvailable,
            lat: r.currentLat,
            lng: r.currentLng,
            locationUpdatedAt: r.locationUpdatedAt
          })),
          rest.lat,
          rest.lng
        );
        if (!picked) {
          return res.status(404).json({ error: "No approved riders available to assign right now." });
        }
        nextRiderUid = picked.rider.uid;
        nextRiderName = picked.rider.fullName;
        assignedRiderPhone = picked.rider.phone;
      } else if (parsed.data.riderUid === null || parsed.data.riderUid === "") {
        nextRiderUid = null;
        nextRiderName = null;
      } else if (parsed.data.riderUid) {
        const riderRows = await db.select().from(riders).where(eq5(riders.uid, parsed.data.riderUid)).limit(1);
        if (riderRows.length === 0) {
          return res.status(404).json({ error: "Selected rider not found" });
        }
        if (riderRows[0].status !== "approved") {
          return res.status(400).json({ error: "Selected rider is pending Admin approval and cannot be assigned yet." });
        }
        nextRiderUid = riderRows[0].uid;
        nextRiderName = riderRows[0].fullName;
        assignedRiderPhone = riderRows[0].phone;
      }
      const shouldMoveToAssigned = Boolean(nextRiderUid) && ["confirmed", "accepted", "preparing", "ready"].includes(order.status);
      const nextStatus = shouldMoveToAssigned ? "rider_assigned" : order.status;
      const updated = await db.update(orders).set({
        riderUid: nextRiderUid,
        riderName: nextRiderName,
        status: nextStatus,
        deliveryMode: nextRiderUid ? "platform" : order.deliveryMode,
        deliveryProvider: nextRiderUid ? "Foodora Rider" : order.deliveryProvider,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(orders.id, order.id)).returning();
      const statusNote = parsed.data.note?.trim() || (nextRiderName ? `Rider ${nextRiderName} assigned by ${order.restaurantName}` : `Rider unassigned by ${order.restaurantName}`);
      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        status: nextStatus,
        note: statusNote,
        actorUid: req.user.uid
      });
      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: nextRiderName ? `Rider Assigned \xB7 ${order.orderNumber}` : `Order Updated \xB7 ${order.orderNumber}`,
        message: nextRiderName ? `${nextRiderName} is assigned to pick up your order from ${order.restaurantName}.` : statusNote,
        type: "order",
        relatedOrderId: order.id
      });
      if (nextRiderUid) {
        await db.insert(notifications).values({
          recipientUid: nextRiderUid,
          roleTarget: "rider",
          title: `Delivery Assigned \xB7 ${order.orderNumber}`,
          message: `Pickup at ${order.restaurantName} \u2192 Dropoff ${order.deliveryArea}`,
          type: "order",
          relatedOrderId: order.id
        });
      }
      const recipientEmail = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (recipientEmail) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: recipientEmail,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: updated[0].status,
          statusNote,
          riderName: updated[0].riderName,
          riderPhone: assignedRiderPhone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson
        }).catch(() => null);
      }
      broadcastOrderEvent("order:updated", {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: rest.ownerUid,
        customerUid: updated[0].customerUid,
        customerName: updated[0].customerName,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: `Order ${order.orderNumber}: ${updated[0].status.replace(/_/g, " ")}`,
        message: statusNote,
        type: "order",
        relatedOrderId: order.id
      });
      if (nextRiderUid) {
        broadcastNotificationEvent({
          recipientUid: nextRiderUid,
          roleTarget: "rider",
          title: `New Delivery \xB7 ${order.orderNumber}`,
          message: `Pickup from ${order.restaurantName} (${order.deliveryArea})`,
          type: "order",
          relatedOrderId: order.id
        });
      }
      res.json({ order: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to assign rider" });
    }
  }
);
app.get("/api/rider-jobs", async (_req, res) => {
  try {
    const jobs = await db.select({
      id: riderJobs.id,
      restaurantId: riderJobs.restaurantId,
      restaurantName: riderJobs.restaurantName,
      ownerUid: riderJobs.ownerUid,
      title: riderJobs.title,
      titleBn: riderJobs.titleBn,
      zone: riderJobs.zone,
      vehicleType: riderJobs.vehicleType,
      salaryRange: riderJobs.salaryRange,
      shiftHours: riderJobs.shiftHours,
      vacancies: riderJobs.vacancies,
      description: riderJobs.description,
      isActive: riderJobs.isActive,
      createdAt: riderJobs.createdAt,
      updatedAt: riderJobs.updatedAt
    }).from(riderJobs).innerJoin(restaurants, eq5(riderJobs.restaurantId, restaurants.id)).where(and2(eq5(riderJobs.isActive, true), eq5(restaurants.status, "approved"))).orderBy(desc3(riderJobs.createdAt));
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load rider jobs" });
  }
});
app.post("/api/rider-jobs/:id/apply", optionalAuth, async (req, res) => {
  const jobId = Number(req.params.id);
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    vehicleType: z.string().trim().min(2).max(50).default("Motorbike"),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(""),
    experienceNote: z.string().trim().max(400).optional().default("")
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(jobId) || !parsed.success) {
    return res.status(400).json({
      error: parsed.success ? "Invalid job ID" : parsed.error.issues[0]?.message || "Invalid application"
    });
  }
  try {
    const jobRows = await db.select().from(riderJobs).where(eq5(riderJobs.id, jobId)).limit(1);
    if (jobRows.length === 0 || !jobRows[0].isActive) {
      return res.status(404).json({ error: "This rider job post is no longer open." });
    }
    const job = jobRows[0];
    const inserted = await db.insert(riderJobApplications).values({
      jobId: job.id,
      restaurantId: job.restaurantId,
      applicantUid: req.user?.uid || "",
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email.toLowerCase(),
      vehicleType: parsed.data.vehicleType,
      zone: parsed.data.zone,
      nidNumber: parsed.data.nidNumber,
      experienceNote: parsed.data.experienceNote,
      status: "pending"
    }).returning();
    await db.insert(notifications).values({
      recipientUid: job.ownerUid,
      roleTarget: "restaurant_owner",
      title: `New Rider Applicant \xB7 ${job.restaurantName}`,
      message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for "${job.title}".`,
      type: "system"
    });
    broadcastNotificationEvent({
      recipientUid: job.ownerUid,
      roleTarget: "restaurant_owner",
      title: `New Rider Applicant \xB7 ${job.restaurantName}`,
      message: `${parsed.data.fullName} applied for ${job.title}`,
      type: "system"
    });
    res.status(201).json({ application: inserted[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to submit rider application" });
  }
});
app.get(
  "/api/vendor/rider-jobs",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      const reqRestId = Number(req.query.restaurantId);
      const owned = isAdmin ? await db.select().from(restaurants) : await db.select().from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid));
      let targetIds = owned.map((r) => r.id);
      if (Number.isInteger(reqRestId) && reqRestId > 0) {
        if (!isAdmin && !targetIds.includes(reqRestId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        targetIds = [reqRestId];
      }
      if (targetIds.length === 0) {
        return res.json({ jobs: [], applications: [] });
      }
      const [jobs, applications] = await Promise.all([
        db.select().from(riderJobs).where(inArray3(riderJobs.restaurantId, targetIds)).orderBy(desc3(riderJobs.createdAt)),
        db.select().from(riderJobApplications).where(inArray3(riderJobApplications.restaurantId, targetIds)).orderBy(desc3(riderJobApplications.createdAt))
      ]);
      res.json({ jobs, applications });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load restaurant rider jobs" });
    }
  }
);
app.post(
  "/api/vendor/rider-jobs",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const check = validateRiderJobPayload(req.body || {});
    if (check.valid === false) {
      return res.status(400).json({ error: check.reason });
    }
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, check.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Not owner of this restaurant" });
      }
      const inserted = await db.insert(riderJobs).values({
        restaurantId: rest.id,
        restaurantName: rest.name,
        ownerUid: rest.ownerUid,
        title: check.data.title,
        titleBn: check.data.titleBn,
        zone: check.data.zone,
        vehicleType: check.data.vehicleType,
        salaryRange: check.data.salaryRange,
        shiftHours: check.data.shiftHours,
        vacancies: check.data.vacancies,
        description: check.data.description,
        isActive: true
      }).returning();
      res.status(201).json({ job: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to publish rider job" });
    }
  }
);
app.patch(
  "/api/vendor/rider-jobs/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    const schema = z.object({
      isActive: z.boolean().optional(),
      title: z.string().trim().min(3).max(120).optional(),
      titleBn: z.string().trim().min(2).max(120).optional(),
      zone: z.string().trim().min(2).max(120).optional(),
      vehicleType: z.string().trim().min(2).max(60).optional(),
      salaryRange: z.string().trim().min(2).max(80).optional(),
      shiftHours: z.string().trim().min(2).max(80).optional(),
      vacancies: z.number().int().min(1).max(100).optional(),
      description: z.string().max(600).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid job update" });
    try {
      const rows = await db.select().from(riderJobs).where(eq5(riderJobs.id, jobId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Rider job not found" });
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, rows[0].restaurantId)).limit(1);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0]?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const d = parsed.data;
      const updated = await db.update(riderJobs).set({
        isActive: d.isActive ?? rows[0].isActive,
        title: d.title ?? rows[0].title,
        titleBn: d.titleBn ?? rows[0].titleBn,
        zone: d.zone ?? rows[0].zone,
        vehicleType: d.vehicleType ?? rows[0].vehicleType,
        salaryRange: d.salaryRange ?? rows[0].salaryRange,
        shiftHours: d.shiftHours ?? rows[0].shiftHours,
        vacancies: d.vacancies ?? rows[0].vacancies,
        description: d.description ?? rows[0].description,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(riderJobs.id, jobId)).returning();
      res.json({ job: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update rider job" });
    }
  }
);
app.delete(
  "/api/vendor/rider-jobs/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    try {
      const rows = await db.select().from(riderJobs).where(eq5(riderJobs.id, jobId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Rider job not found" });
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, rows[0].restaurantId)).limit(1);
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0]?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await db.delete(riderJobs).where(eq5(riderJobs.id, jobId));
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to delete rider job" });
    }
  }
);
app.patch(
  "/api/vendor/rider-applications/:id",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const appId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(["pending", "hired", "rejected"])
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(appId) || !parsed.success) {
      return res.status(400).json({ error: "Invalid rider application update" });
    }
    try {
      const appRows = await db.select().from(riderJobApplications).where(eq5(riderJobApplications.id, appId)).limit(1);
      if (appRows.length === 0) return res.status(404).json({ error: "Application not found" });
      const appRow = appRows[0];
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, appRow.restaurantId)).limit(1);
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest?.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await db.update(riderJobApplications).set({
        status: parsed.data.status,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(riderJobApplications.id, appId)).returning();
      if (parsed.data.status === "hired") {
        const emailLower = appRow.email.trim().toLowerCase();
        const existingUsers = await db.select().from(users).where(sql3`lower(${users.email}) = ${emailLower}`).limit(1);
        let riderUid = appRow.applicantUid?.trim() || existingUsers[0]?.uid || "";
        if (!riderUid) {
          riderUid = `rdr-${crypto4.randomBytes(6).toString("hex")}`;
        }
        if (existingUsers.length === 0) {
          await db.insert(users).values({
            uid: riderUid,
            email: emailLower,
            fullName: appRow.fullName,
            phone: appRow.phone,
            role: "rider"
          });
        } else if (existingUsers[0].role === "customer") {
          await db.update(users).set({ role: "rider", fullName: appRow.fullName, phone: appRow.phone }).where(eq5(users.uid, existingUsers[0].uid));
        }
        await db.insert(riders).values({
          uid: riderUid,
          restaurantId: appRow.restaurantId,
          addedByUid: req.user.uid,
          fullName: appRow.fullName,
          phone: appRow.phone,
          email: emailLower,
          vehicleType: appRow.vehicleType,
          zone: appRow.zone,
          nidNumber: appRow.nidNumber || "",
          currentLat: rest?.lat ?? 23.7949,
          currentLng: rest?.lng ?? 90.4043,
          isAvailable: true,
          status: "approved"
        }).onConflictDoUpdate({
          target: riders.uid,
          set: {
            restaurantId: appRow.restaurantId,
            addedByUid: req.user.uid,
            fullName: appRow.fullName,
            phone: appRow.phone,
            vehicleType: appRow.vehicleType,
            zone: appRow.zone,
            isAvailable: true,
            status: "approved"
          }
        });
        await db.insert(notifications).values({
          recipientUid: riderUid,
          roleTarget: "rider",
          title: `Hired by ${rest?.name || "Restaurant"}!`,
          message: `You are now an approved rider for ${rest?.name || "Foodora BD"}. Open Rider Portal to start deliveries.`,
          type: "system"
        });
        broadcastNotificationEvent({
          recipientUid: riderUid,
          roleTarget: "rider",
          title: `Rider Application Hired \xB7 ${rest?.name || "Foodora BD"}`,
          message: `You have been hired as a delivery rider!`,
          type: "system"
        });
      }
      res.json({ application: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update rider application" });
    }
  }
);
app.get(
  "/api/messages/vendor-admin",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      const reqRestId = Number(req.query.restaurantId);
      const accessibleRestaurants = isAdmin ? await db.select().from(restaurants).orderBy(asc2(restaurants.id)) : await db.select().from(restaurants).where(eq5(restaurants.ownerUid, req.user.uid)).orderBy(asc2(restaurants.id));
      const allowedIds = accessibleRestaurants.map((r) => r.id);
      if (Number.isInteger(reqRestId) && reqRestId > 0) {
        if (!isAdmin && !allowedIds.includes(reqRestId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const queryIds = Number.isInteger(reqRestId) && reqRestId > 0 ? [reqRestId] : allowedIds;
      const messages = queryIds.length > 0 ? await db.select().from(vendorAdminMessages).where(inArray3(vendorAdminMessages.restaurantId, queryIds)).orderBy(asc2(vendorAdminMessages.createdAt)) : [];
      const threadMap = /* @__PURE__ */ new Map();
      for (const r of accessibleRestaurants) {
        threadMap.set(r.id, {
          restaurantId: r.id,
          restaurantName: r.name,
          ownerUid: r.ownerUid,
          lastMessage: "",
          lastSenderRole: "",
          lastAt: "",
          unreadForAdmin: 0,
          unreadForVendor: 0
        });
      }
      for (const msg of messages) {
        const cur = threadMap.get(msg.restaurantId) || {
          restaurantId: msg.restaurantId,
          restaurantName: msg.restaurantName,
          ownerUid: msg.ownerUid,
          lastMessage: "",
          lastSenderRole: "",
          lastAt: "",
          unreadForAdmin: 0,
          unreadForVendor: 0
        };
        cur.lastMessage = msg.message;
        cur.lastSenderRole = msg.senderRole;
        cur.lastAt = new Date(msg.createdAt).toISOString();
        if (!msg.isReadByAdmin) cur.unreadForAdmin += 1;
        if (!msg.isReadByVendor) cur.unreadForVendor += 1;
        threadMap.set(msg.restaurantId, cur);
      }
      const threads = Array.from(threadMap.values()).sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return a.restaurantId - b.restaurantId;
      });
      res.json({ messages, threads });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load messages" });
    }
  }
);
app.post(
  "/api/messages/vendor-admin",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      message: z.string().trim().min(1, "Message cannot be empty").max(1200)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid message" });
    }
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Not owner of this restaurant" });
      }
      const inserted = await db.insert(vendorAdminMessages).values({
        restaurantId: rest.id,
        restaurantName: rest.name,
        ownerUid: rest.ownerUid,
        senderUid: req.user.uid,
        senderName: req.user.fullName,
        senderRole: req.user.role,
        message: parsed.data.message,
        isReadByAdmin: isAdmin,
        isReadByVendor: !isAdmin
      }).returning();
      const saved = inserted[0];
      if (isAdmin) {
        await db.insert(notifications).values({
          recipientUid: rest.ownerUid,
          roleTarget: "restaurant_owner",
          title: `Message from Admin \xB7 ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: "system"
        });
        broadcastNotificationEvent({
          recipientUid: rest.ownerUid,
          roleTarget: "restaurant_owner",
          title: `Message from Admin \xB7 ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: "system"
        });
      } else {
        await db.insert(notifications).values({
          recipientUid: "demo-admin-uid",
          roleTarget: "super_admin",
          title: `Vendor Message \xB7 ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: "system"
        });
        broadcastNotificationEvent({
          recipientUid: "role-super_admin",
          roleTarget: "super_admin",
          title: `Vendor Message \xB7 ${rest.name}`,
          message: parsed.data.message.slice(0, 140),
          type: "system"
        });
      }
      broadcastVendorAdminMessage({
        id: saved.id,
        restaurantId: saved.restaurantId,
        restaurantName: saved.restaurantName,
        ownerUid: saved.ownerUid,
        senderUid: saved.senderUid,
        senderName: saved.senderName,
        senderRole: saved.senderRole,
        message: saved.message,
        createdAt: new Date(saved.createdAt).toISOString()
      });
      res.status(201).json({ message: saved });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  }
);
app.patch(
  "/api/messages/vendor-admin/read",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid restaurantId" });
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && restRows[0].ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (isAdmin) {
        await db.update(vendorAdminMessages).set({ isReadByAdmin: true }).where(eq5(vendorAdminMessages.restaurantId, parsed.data.restaurantId));
      } else {
        await db.update(vendorAdminMessages).set({ isReadByVendor: true }).where(eq5(vendorAdminMessages.restaurantId, parsed.data.restaurantId));
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to mark messages read" });
    }
  }
);
app.post(
  "/api/vendor/payouts",
  requireAuth,
  requireRole(["restaurant_owner", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      amount: z.number().int().positive()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payout request" });
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const rest = restRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && rest.ownerUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const inserted = await db.insert(restaurantPayouts).values({
        restaurantId: rest.id,
        restaurantName: rest.name,
        amount: parsed.data.amount,
        method: rest.payoutMethod,
        accountNumber: rest.payoutAccount || rest.phone,
        status: "pending"
      }).returning();
      res.status(201).json({ payout: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post("/api/riders/apply", async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    password: z.string().min(6).max(128).optional().or(z.literal("")),
    vehicleType: z.string().trim().min(2).max(40).default("Motorbike"),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(""),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please complete all rider job application fields." });
  }
  if (!isBicycleVehicleType(parsed.data.vehicleType) && parsed.data.nidNumber.length < 4) {
    return res.status(400).json({
      error: "Please enter your NID or Driving License number (or select Bicycle if riding without a license)."
    });
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  if (isProtectedSuperAdminEmail(emailLower)) {
    return res.status(409).json({
      error: "This email belongs to a Super Admin account. Please use a rider email."
    });
  }
  try {
    const existingUsers = await db.select().from(users).where(sql3`lower(${users.email}) = ${emailLower}`).limit(1);
    let uid = existingUsers[0]?.uid || "";
    if (existingUsers[0]) {
      if (existingUsers[0].status === "suspended") {
        return res.status(403).json({ error: "This account has been suspended by an administrator." });
      }
      if (["admin", "super_admin"].includes(existingUsers[0].role)) {
        return res.status(409).json({
          error: "This email belongs to an Admin account. Please use a separate rider email."
        });
      }
      const credRows = await db.select().from(localCredentials).where(eq5(localCredentials.email, emailLower)).limit(1);
      if (credRows.length > 0 && parsed.data.password) {
        if (!verifyPasswordScrypt(parsed.data.password, credRows[0].passwordHash)) {
          return res.status(401).json({
            error: "An account with this email already exists. Enter your matching password or leave password blank if applying with Google/existing session."
          });
        }
      }
      await db.update(users).set({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        role: existingUsers[0].role === "restaurant_owner" ? "rider" : "rider",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(users.uid, uid));
    } else {
      uid = `rdr-${crypto4.randomBytes(8).toString("hex")}`;
      await db.insert(users).values({
        uid,
        email: emailLower,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        role: "rider"
      });
      if (parsed.data.password && parsed.data.password.length >= 6) {
        await db.insert(localCredentials).values({
          email: emailLower,
          uid,
          passwordHash: hashPasswordScrypt(parsed.data.password)
        }).onConflictDoNothing();
      }
    }
    const startLat = Number.isFinite(parsed.data.lat) ? Math.round(parsed.data.lat * 1e6) / 1e6 : 23.7949;
    const startLng = Number.isFinite(parsed.data.lng) ? Math.round(parsed.data.lng * 1e6) / 1e6 : 90.4144;
    const existingRider = await db.select().from(riders).where(eq5(riders.uid, uid)).limit(1);
    const inserted = existingRider.length > 0 ? await db.update(riders).set({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: emailLower,
      vehicleType: parsed.data.vehicleType,
      zone: parsed.data.zone,
      nidNumber: parsed.data.nidNumber,
      currentLat: startLat,
      currentLng: startLng,
      locationUpdatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(riders.uid, uid)).returning() : await db.insert(riders).values({
      uid,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: emailLower,
      vehicleType: parsed.data.vehicleType,
      zone: parsed.data.zone,
      nidNumber: parsed.data.nidNumber,
      currentLat: startLat,
      currentLng: startLng,
      locationUpdatedAt: /* @__PURE__ */ new Date(),
      isAvailable: false,
      status: "pending"
    }).returning();
    const adminNotifTitle = existingRider.length > 0 ? `Rider Profile Updated \xB7 ${parsed.data.zone}` : `New Rider Application Pending Approval \xB7 ${parsed.data.zone}`;
    const adminNotifMsg = `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}. Review and approve in Admin Panel.`;
    await db.insert(notifications).values({
      recipientUid: "demo-admin-uid",
      roleTarget: "super_admin",
      title: adminNotifTitle,
      message: adminNotifMsg,
      type: "system"
    });
    broadcastNotificationEvent({
      recipientUid: "role-super_admin",
      roleTarget: "super_admin",
      title: adminNotifTitle,
      message: adminNotifMsg,
      type: "system"
    });
    const userPayload = {
      uid,
      email: emailLower,
      fullName: parsed.data.fullName,
      role: "rider",
      isSandbox: false
    };
    const token = signSandboxToken(userPayload);
    return res.status(201).json({
      token,
      user: userPayload,
      rider: inserted[0]
    });
  } catch (error) {
    console.error("Rider application failed:", error);
    return res.status(500).json({ error: error.message || "Could not submit rider application" });
  }
});
app.post("/api/riders/register", requireAuth, async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email(),
    vehicleType: z.string().trim().min(2).max(40),
    zone: z.string().trim().min(2).max(120),
    nidNumber: z.string().trim().max(50).optional().default(""),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid rider registration data" });
  if (!isBicycleVehicleType(parsed.data.vehicleType) && parsed.data.nidNumber.length < 4) {
    return res.status(400).json({
      error: "Please enter your NID or Driving License number (Bicycle riders may leave this optional)."
    });
  }
  try {
    const startLat = Number.isFinite(parsed.data.lat) ? Math.round(parsed.data.lat * 1e6) / 1e6 : 23.7949;
    const startLng = Number.isFinite(parsed.data.lng) ? Math.round(parsed.data.lng * 1e6) / 1e6 : 90.4144;
    const existingRider = await db.select().from(riders).where(eq5(riders.uid, req.user.uid)).limit(1);
    const inserted = existingRider.length > 0 ? await db.update(riders).set({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      vehicleType: parsed.data.vehicleType,
      zone: parsed.data.zone,
      nidNumber: parsed.data.nidNumber,
      currentLat: startLat,
      currentLng: startLng,
      locationUpdatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(riders.uid, req.user.uid)).returning() : await db.insert(riders).values({
      uid: req.user.uid,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email.trim().toLowerCase(),
      vehicleType: parsed.data.vehicleType,
      zone: parsed.data.zone,
      nidNumber: parsed.data.nidNumber,
      currentLat: startLat,
      currentLng: startLng,
      locationUpdatedAt: /* @__PURE__ */ new Date(),
      isAvailable: false,
      status: "pending"
    }).returning();
    if (existingRider.length === 0) {
      await db.insert(notifications).values({
        recipientUid: "demo-admin-uid",
        roleTarget: "super_admin",
        title: `New Rider Application Pending Approval \xB7 ${parsed.data.zone}`,
        message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}.`,
        type: "system"
      });
      broadcastNotificationEvent({
        recipientUid: "role-super_admin",
        roleTarget: "super_admin",
        title: `New Rider Application Pending Approval \xB7 ${parsed.data.zone}`,
        message: `${parsed.data.fullName} (${parsed.data.vehicleType}) applied for ${parsed.data.zone}.`,
        type: "system"
      });
    }
    let nextUser = req.user;
    if (req.user.role === "customer") {
      await db.update(users).set({ role: "rider", fullName: parsed.data.fullName }).where(eq5(users.uid, req.user.uid));
      nextUser = { ...req.user, role: "rider", fullName: parsed.data.fullName };
    }
    const freshToken = signSandboxToken({
      uid: nextUser.uid,
      email: nextUser.email,
      fullName: nextUser.fullName,
      role: nextUser.role,
      isSandbox: nextUser.isSandbox
    });
    res.status(201).json({ rider: inserted[0], token: freshToken, user: nextUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get(
  "/api/rider/workspace",
  requireAuth,
  requireRole(["rider", "admin", "super_admin"]),
  async (req, res) => {
    try {
      const targetUid = req.user.role === "super_admin" || req.user.role === "admin" ? "demo-rider-uid" : req.user.uid;
      const data = await getRiderWorkspace(targetUid);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/rider/location",
  requireAuth,
  requireRole(["rider", "admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      isAvailable: z.boolean().optional(),
      zone: z.string().min(2).max(100).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Valid GPS latitude and longitude required." });
    }
    try {
      const riderUid = req.user.role === "super_admin" || req.user.role === "admin" ? "demo-rider-uid" : req.user.uid;
      const existing = await db.select().from(riders).where(eq5(riders.uid, riderUid)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: "Rider profile not found." });
      }
      const cur = existing[0];
      const updated = await db.update(riders).set({
        currentLat: Math.round(parsed.data.lat * 1e6) / 1e6,
        currentLng: Math.round(parsed.data.lng * 1e6) / 1e6,
        locationUpdatedAt: /* @__PURE__ */ new Date(),
        isAvailable: typeof parsed.data.isAvailable === "boolean" ? parsed.data.isAvailable : cur.isAvailable,
        zone: parsed.data.zone ? parsed.data.zone.trim() : cur.zone
      }).where(eq5(riders.uid, riderUid)).returning();
      const activeRiderOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        restaurantId: orders.restaurantId,
        restaurantName: orders.restaurantName,
        customerUid: orders.customerUid,
        status: orders.status
      }).from(orders).where(eq5(orders.riderUid, riderUid));
      for (const ord of activeRiderOrders) {
        if (!["delivered", "cancelled"].includes(ord.status)) {
          broadcastOrderEvent("rider:location", {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            restaurantId: ord.restaurantId,
            restaurantName: ord.restaurantName,
            customerUid: ord.customerUid,
            riderUid,
            riderName: updated[0].fullName,
            status: ord.status,
            lat: updated[0].currentLat,
            lng: updated[0].currentLng
          });
        }
      }
      res.json({ rider: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/rider/profile",
  requireAuth,
  requireRole(["rider", "admin", "super_admin"]),
  async (req, res) => {
    const check = sanitizeRiderProfileUpdate({
      fullName: req.body?.fullName,
      phone: req.body?.phone,
      vehicleType: req.body?.vehicleType,
      zone: req.body?.zone,
      nidNumber: req.body?.nidNumber,
      isAvailable: req.body?.isAvailable,
      avatarUrl: req.body?.avatarUrl
    });
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }
    try {
      const riderUid = req.user.role === "super_admin" || req.user.role === "admin" ? "demo-rider-uid" : req.user.uid;
      const existing = await db.select().from(riders).where(eq5(riders.uid, riderUid)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: "Rider profile not found." });
      }
      const cur = existing[0];
      const d = check.data;
      const updatedRows = await db.update(riders).set({
        fullName: d.fullName,
        phone: d.phone,
        vehicleType: d.vehicleType,
        zone: d.zone,
        nidNumber: d.nidNumber,
        isAvailable: d.isAvailable
      }).where(eq5(riders.uid, riderUid)).returning();
      const updatedUserRows = await db.update(users).set({
        fullName: d.fullName,
        phone: d.phone,
        avatarUrl: d.avatarUrl,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(users.uid, riderUid)).returning();
      if (d.fullName !== cur.fullName) {
        await db.update(orders).set({ riderName: d.fullName }).where(
          and2(
            eq5(orders.riderUid, riderUid),
            notInArray(orders.status, ["delivered", "cancelled"])
          )
        );
      }
      let restaurantName = null;
      if (updatedRows[0].restaurantId) {
        const restRows = await db.select({ name: restaurants.name }).from(restaurants).where(eq5(restaurants.id, updatedRows[0].restaurantId)).limit(1);
        restaurantName = restRows[0]?.name || null;
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "rider_updated_profile",
        targetType: "rider",
        targetId: String(updatedRows[0].id),
        details: `${d.fullName} updated rider profile (${d.vehicleType}, ${d.zone}, available=${d.isAvailable})`
      });
      res.json({
        rider: {
          ...updatedRows[0],
          avatarUrl: updatedUserRows[0]?.avatarUrl ?? d.avatarUrl ?? "",
          restaurantName
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update rider profile" });
    }
  }
);
app.post(
  "/api/rider/orders/:id/accept",
  requireAuth,
  requireRole(["rider", "admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Invalid order ID" });
    try {
      const riderUid = req.user.role === "super_admin" || req.user.role === "admin" ? "demo-rider-uid" : req.user.uid;
      const orderRows = await db.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
      const existingOrder = orderRows[0];
      if (["delivered", "cancelled"].includes(existingOrder.status)) {
        return res.status(409).json({ error: "Order is already closed and cannot be claimed." });
      }
      if (existingOrder.riderUid && existingOrder.riderUid !== riderUid) {
        return res.status(409).json({ error: "Order has already been claimed by another rider." });
      }
      const prepaidRiderCheck = canVendorProcessPrepaidOrder({
        paymentMethod: existingOrder.paymentMethod,
        paymentStatus: existingOrder.paymentStatus,
        paymentSplitMode: existingOrder.paymentSplitMode,
        nextStatus: "rider_assigned"
      });
      if (!prepaidRiderCheck.allowed) {
        return res.status(400).json({ error: prepaidRiderCheck.reason });
      }
      const riderRows = await db.select().from(riders).where(eq5(riders.uid, riderUid)).limit(1);
      const isAdminCaller = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdminCaller) {
        const settingsRows = await db.select().from(platformSettings).limit(1);
        const financialConfig = mergeDeliveryFinancialConfig(settingsRows[0]?.deliveryFinancialConfig);
        const ledgerRows = await db.select().from(riderWalletLedger).where(eq5(riderWalletLedger.riderUid, riderUid));
        const walletSummary = summarizeRiderWalletLedger(
          ledgerRows.map((e) => ({
            entryType: e.entryType,
            cashCollected: e.cashCollected,
            riderEarningDelta: e.riderEarningDelta,
            commissionOwedDelta: e.commissionOwedDelta,
            commissionSettledDelta: e.commissionSettledDelta
          }))
        );
        const riderAcceptCheck = canRiderAcceptOrders({
          riderStatus: riderRows[0]?.status,
          outstandingCommission: walletSummary.outstandingCommission,
          settlementRules: financialConfig.settlementRules
        });
        if (!riderAcceptCheck.allowed) {
          return res.status(403).json({ error: riderAcceptCheck.reason });
        }
      }
      const riderName = riderRows[0]?.fullName || req.user.fullName;
      const updated = await db.update(orders).set({
        riderUid,
        riderName,
        status: "rider_assigned",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(orders.id, orderId)).returning();
      await db.insert(orderStatusHistory).values({
        orderId,
        status: "rider_assigned",
        note: `Rider ${riderName} accepted delivery assignment`,
        actorUid: riderUid
      });
      await db.insert(notifications).values({
        recipientUid: existingOrder.customerUid,
        roleTarget: "customer",
        title: "Rider Assigned to Your Order",
        message: `${riderName} is assigned for ${existingOrder.orderNumber}. Track live rider GPS on your map.`,
        type: "order",
        relatedOrderId: existingOrder.id
      });
      const restOwnerRows = await db.select({ ownerUid: restaurants.ownerUid, email: restaurants.email }).from(restaurants).where(eq5(restaurants.id, updated[0].restaurantId)).limit(1);
      const riderAcceptRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (riderAcceptRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: riderAcceptRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: "rider_assigned",
          statusNote: `Rider ${riderName} accepted delivery assignment`,
          riderName,
          riderPhone: riderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson
        });
      }
      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: "status_update",
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: `Rider ${riderName} accepted delivery assignment`,
        riderName,
        items: updated[0].itemsSnapshotJson
      }).catch(() => []);
      broadcastOrderEvent("order:updated", {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: existingOrder.customerUid,
        roleTarget: "customer",
        title: "Rider Assigned to Your Order",
        message: `${riderName} is assigned for ${existingOrder.orderNumber}. Track live rider GPS on your map.`,
        type: "order",
        relatedOrderId: existingOrder.id
      });
      broadcastNotificationEvent({
        recipientUid: "role-super_admin",
        roleTarget: "super_admin",
        title: `Rider Assigned \xB7 ${existingOrder.orderNumber}`,
        message: `${riderName} accepted ${existingOrder.orderNumber} (${existingOrder.restaurantName}).`,
        type: "order",
        relatedOrderId: existingOrder.id
      });
      res.json({ order: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/rider/orders/:id/status",
  requireAuth,
  requireRole(["rider", "admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum(["picked_up", "on_the_way", "delivered"]),
      note: z.string().trim().max(300).optional(),
      pickupRating: z.enum(["good", "bad"]).optional(),
      proofPhotoUrl: z.string().trim().max(2e6).optional(),
      collectedCashAmount: z.number().nonnegative().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: "Invalid rider status update" });
    }
    try {
      const orderRows = await db.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
      if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
      const order = orderRows[0];
      const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
      if (!isAdmin && order.riderUid !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden: Order is assigned to another rider" });
      }
      const allowAssignedPickup = parsed.data.status === "picked_up" && Boolean(order.riderUid) && ["confirmed", "accepted", "preparing", "ready", "rider_assigned"].includes(order.status);
      if (!allowAssignedPickup && !canTransitionOrderStatus(order.status, parsed.data.status)) {
        return res.status(400).json({ error: `Cannot change order from ${order.status} to ${parsed.data.status}` });
      }
      const prepaidCheck = canVendorProcessPrepaidOrder({
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentSplitMode: order.paymentSplitMode,
        nextStatus: parsed.data.status
      });
      if (!prepaidCheck.allowed) {
        return res.status(400).json({ error: prepaidCheck.reason });
      }
      const updated = await db.update(orders).set({
        status: parsed.data.status,
        paymentStatus: parsed.data.status === "delivered" && order.paymentMethod === "cod" ? "paid" : order.paymentStatus,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(orders.id, order.id)).returning();
      const noteSegments = [
        `Rider updated status to ${parsed.data.status.replace(/_/g, " ")}`,
        parsed.data.pickupRating ? `pickup experience: ${parsed.data.pickupRating}` : "",
        typeof parsed.data.collectedCashAmount === "number" ? `cash collected: \u09F3${parsed.data.collectedCashAmount}` : "",
        parsed.data.proofPhotoUrl ? "drop-off proof photo attached" : "",
        parsed.data.note ? parsed.data.note : ""
      ].filter(Boolean);
      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        status: parsed.data.status,
        note: noteSegments.join(" \xB7 ").slice(0, 480),
        actorUid: req.user.uid
      });
      const statusLabels = {
        picked_up: "Order Picked Up",
        on_the_way: "Rider Is On The Way",
        delivered: "Order Delivered!"
      };
      await db.insert(notifications).values({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: statusLabels[parsed.data.status] || "Delivery Update",
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, " ")}.`,
        type: "order",
        relatedOrderId: order.id
      });
      if (parsed.data.status === "delivered") {
        await settleOrderCommissionIdempotent(order.id);
        await recordRiderDeliveryWalletIdempotent(
          order.id,
          parsed.data.collectedCashAmount,
          req.user.uid
        );
      }
      const restOwnerRows = await db.select({ ownerUid: restaurants.ownerUid, email: restaurants.email }).from(restaurants).where(eq5(restaurants.id, updated[0].restaurantId)).limit(1);
      const riderStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (riderStatusRecipient) {
        const assignedRiderRows = updated[0].riderUid ? await db.select({ phone: riders.phone }).from(riders).where(eq5(riders.uid, updated[0].riderUid)).limit(1) : [];
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: riderStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote: statusLabels[parsed.data.status] || "Delivery Update",
          riderName: updated[0].riderName,
          riderPhone: assignedRiderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson
        });
      }
      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: "status_update",
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: statusLabels[parsed.data.status] || "Delivery Update",
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson
      }).catch(() => []);
      broadcastOrderEvent("order:updated", {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: order.customerUid,
        roleTarget: "customer",
        title: statusLabels[parsed.data.status] || "Delivery Update",
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, " ")}.`,
        type: "order",
        relatedOrderId: order.id
      });
      broadcastNotificationEvent({
        recipientUid: "role-super_admin",
        roleTarget: "super_admin",
        title: `${statusLabels[parsed.data.status] || "Delivery Update"} \xB7 ${order.orderNumber}`,
        message: `${order.orderNumber} (${order.restaurantName}) is now ${parsed.data.status.replace(/_/g, " ")}.`,
        type: "order",
        relatedOrderId: order.id
      });
      res.json({ order: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/upload-image",
  requireAuth,
  async (req, res) => {
    const schema = z.object({
      dataUrl: z.string().min(20),
      filename: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid image upload payload" });
    }
    const parsedImg = parseUploadedImageDataUrl(parsed.data.dataUrl, parsed.data.filename);
    if (!parsedImg.valid) {
      return res.status(400).json({ error: parsedImg.reason });
    }
    try {
      const ext = parsedImg.ext;
      const buffer = Buffer.from(parsedImg.base64Data, "base64");
      if (buffer.byteLength > 8 * 1024 * 1024) {
        return res.status(400).json({ error: "Image must be 8 MB or smaller" });
      }
      const safeStem = (parsed.data.filename || "food").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").slice(0, 32) || "food";
      const outName = `${safeStem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      if (process.env.VERCEL) {
        return res.status(201).json({
          imageUrl: `data:${parsedImg.mimeType};base64,${parsedImg.base64Data}`
        });
      }
      const outPath = path2.join(UPLOADS_DIR2, outName);
      await fs2.promises.writeFile(outPath, buffer);
      res.status(201).json({ imageUrl: `/uploads/${outName}` });
    } catch (error) {
      res.status(500).json({ error: error.message || "Image upload failed" });
    }
  }
);
app.get(
  "/api/admin/workspace",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    try {
      const data = await getAdminWorkspace();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/admin/restaurants",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      nameBn: z.string().min(1),
      cuisine: z.string().min(2),
      area: z.string().min(2),
      address: z.string().min(3),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      phone: z.string().default("+8801710000000"),
      email: z.string().email().default("partner@foodora.bd"),
      description: z.string().default(""),
      logoUrl: z.string().default(""),
      coverUrl: z.string().default(IMG_BANGLA),
      deliveryFee: z.number().int().min(0).max(500).default(49),
      minOrder: z.number().int().min(0).max(1e4).default(150),
      discountPct: z.number().int().min(0).max(90).default(0),
      openingHours: z.string().default("10:00 AM - 11:30 PM"),
      deliveryMode: z.enum(["platform", "restaurant", "third_party"]).default("platform"),
      commissionRate: z.string().default("15.00"),
      subscriptionPlan: z.enum(["free", "basic", "premium", "enterprise"]).default("basic"),
      isSponsored: z.boolean().default(false)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid restaurant creation payload" });
    }
    try {
      const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;
      const inserted = await db.insert(restaurants).values({
        ownerUid: req.user.uid,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn,
        slug,
        description: parsed.data.description || `${parsed.data.name} in ${parsed.data.area}, Bangladesh.`,
        cuisine: parsed.data.cuisine,
        area: parsed.data.area,
        address: parsed.data.address,
        lat: Number.isFinite(parsed.data.lat) ? parsed.data.lat : 23.7937,
        lng: Number.isFinite(parsed.data.lng) ? parsed.data.lng : 90.4066,
        phone: parsed.data.phone,
        email: parsed.data.email,
        logoUrl: parsed.data.logoUrl?.trim() || "",
        coverUrl: parsed.data.coverUrl || IMG_BANGLA,
        deliveryFee: parsed.data.deliveryFee,
        minOrder: parsed.data.minOrder,
        discountPct: parsed.data.discountPct,
        openingHours: parsed.data.openingHours,
        deliveryMode: parsed.data.deliveryMode,
        commissionRate: parsed.data.commissionRate,
        subscriptionPlan: parsed.data.subscriptionPlan,
        isSponsored: parsed.data.isSponsored,
        isNew: true,
        isOpen: true,
        status: "approved"
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "restaurant_created",
        targetType: "restaurant",
        targetId: String(inserted[0].id),
        details: JSON.stringify({ name: inserted[0].name, area: inserted[0].area })
      });
      res.status(201).json({ restaurant: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/restaurants/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid restaurant ID" });
    const schema = z.object({
      name: z.string().min(2).optional(),
      nameBn: z.string().min(1).optional(),
      cuisine: z.string().min(2).optional(),
      area: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      description: z.string().optional(),
      logoUrl: z.string().optional(),
      coverUrl: z.string().optional(),
      deliveryFee: z.number().int().min(0).max(500).optional(),
      minOrder: z.number().int().min(0).max(1e4).optional(),
      discountPct: z.number().int().min(0).max(90).optional(),
      openingHours: z.string().optional(),
      deliveryMode: z.enum(["platform", "restaurant", "third_party"]).optional(),
      isOpen: z.boolean().optional(),
      status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
      commissionRate: z.string().optional(),
      commissionType: z.enum(["percentage", "fixed"]).optional(),
      fixedCommission: z.number().int().min(0).optional(),
      subscriptionPlan: z.enum(["free", "basic", "premium", "enterprise"]).optional(),
      isSponsored: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid admin restaurant update" });
    try {
      const rows = await db.select().from(restaurants).where(eq5(restaurants.id, id)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const current = rows[0];
      const updated = await db.update(restaurants).set({
        name: parsed.data.name ?? current.name,
        nameBn: parsed.data.nameBn ?? current.nameBn,
        cuisine: parsed.data.cuisine ?? current.cuisine,
        area: parsed.data.area ?? current.area,
        address: parsed.data.address ?? current.address,
        lat: parsed.data.lat ?? current.lat,
        lng: parsed.data.lng ?? current.lng,
        description: parsed.data.description ?? current.description,
        logoUrl: parsed.data.logoUrl !== void 0 ? parsed.data.logoUrl.trim() : current.logoUrl,
        coverUrl: parsed.data.coverUrl || current.coverUrl,
        deliveryFee: parsed.data.deliveryFee ?? current.deliveryFee,
        minOrder: parsed.data.minOrder ?? current.minOrder,
        discountPct: parsed.data.discountPct ?? current.discountPct,
        openingHours: parsed.data.openingHours ?? current.openingHours,
        deliveryMode: parsed.data.deliveryMode ?? current.deliveryMode,
        isOpen: parsed.data.isOpen ?? current.isOpen,
        status: parsed.data.status ?? current.status,
        commissionRate: parsed.data.commissionRate ?? current.commissionRate,
        commissionType: parsed.data.commissionType ?? current.commissionType,
        fixedCommission: parsed.data.fixedCommission ?? current.fixedCommission,
        subscriptionPlan: parsed.data.subscriptionPlan ?? current.subscriptionPlan,
        isSponsored: parsed.data.isSponsored ?? current.isSponsored,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(restaurants.id, id)).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: `restaurant_update_${parsed.data.status || "config"}`,
        targetType: "restaurant",
        targetId: String(id),
        details: JSON.stringify(parsed.data)
      });
      res.json({ restaurant: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/admin/products",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      category: z.string().min(2),
      name: z.string().min(2),
      nameBn: z.string().min(1),
      description: z.string().default(""),
      imageUrl: z.string().default(IMG_BANGLA),
      price: z.number().int().positive(),
      discountPrice: z.number().int().positive().nullable().optional(),
      inStock: z.boolean().default(true),
      isAvailable: z.boolean().default(true),
      isVisibleOnStorefront: z.boolean().default(true),
      isPopular: z.boolean().default(false),
      variationsJson: z.array(z.object({ name: z.string(), priceDelta: z.number() })).optional(),
      addonsJson: z.array(z.object({ name: z.string(), price: z.number() })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid product payload" });
    try {
      const restRows = await db.select().from(restaurants).where(eq5(restaurants.id, parsed.data.restaurantId)).limit(1);
      if (restRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
      const inserted = await db.insert(foodItems).values({
        restaurantId: parsed.data.restaurantId,
        category: parsed.data.category.trim(),
        name: parsed.data.name.trim(),
        nameBn: parsed.data.nameBn.trim(),
        description: parsed.data.description,
        imageUrl: parsed.data.imageUrl.trim() || restRows[0].coverUrl || IMG_BANGLA,
        price: parsed.data.price,
        discountPrice: parsed.data.discountPrice ?? null,
        inStock: parsed.data.inStock,
        isAvailable: parsed.data.isAvailable,
        isVisibleOnStorefront: parsed.data.isVisibleOnStorefront,
        isPopular: parsed.data.isPopular,
        variationsJson: parsed.data.variationsJson && parsed.data.variationsJson.length > 0 ? parsed.data.variationsJson : [{ name: "Regular", priceDelta: 0 }],
        addonsJson: parsed.data.addonsJson ?? []
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "product_created",
        targetType: "food_item",
        targetId: String(inserted[0].id),
        details: JSON.stringify({
          name: inserted[0].name,
          restaurantId: inserted[0].restaurantId,
          isVisibleOnStorefront: inserted[0].isVisibleOnStorefront
        })
      });
      res.status(201).json({ product: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/products/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid product ID" });
    const schema = z.object({
      restaurantId: z.number().int().positive().optional(),
      category: z.string().min(2).optional(),
      name: z.string().min(2).optional(),
      nameBn: z.string().min(1).optional(),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      price: z.number().int().positive().optional(),
      discountPrice: z.number().int().positive().nullable().optional(),
      inStock: z.boolean().optional(),
      isAvailable: z.boolean().optional(),
      isVisibleOnStorefront: z.boolean().optional(),
      isPopular: z.boolean().optional(),
      variationsJson: z.array(z.object({ name: z.string(), priceDelta: z.number() })).optional(),
      addonsJson: z.array(z.object({ name: z.string(), price: z.number() })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid product update payload" });
    try {
      const existing = await db.select().from(foodItems).where(eq5(foodItems.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Product not found" });
      const cur = existing[0];
      const updated = await db.update(foodItems).set({
        restaurantId: parsed.data.restaurantId ?? cur.restaurantId,
        category: parsed.data.category?.trim() || cur.category,
        name: parsed.data.name?.trim() || cur.name,
        nameBn: parsed.data.nameBn?.trim() || cur.nameBn,
        description: parsed.data.description ?? cur.description,
        imageUrl: parsed.data.imageUrl?.trim() || cur.imageUrl,
        price: parsed.data.price ?? cur.price,
        discountPrice: parsed.data.discountPrice === void 0 ? cur.discountPrice : parsed.data.discountPrice,
        inStock: parsed.data.inStock ?? cur.inStock,
        isAvailable: parsed.data.isAvailable ?? cur.isAvailable,
        isVisibleOnStorefront: parsed.data.isVisibleOnStorefront ?? cur.isVisibleOnStorefront,
        isPopular: parsed.data.isPopular ?? cur.isPopular,
        variationsJson: parsed.data.variationsJson ?? cur.variationsJson,
        addonsJson: parsed.data.addonsJson ?? cur.addonsJson,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(foodItems.id, id)).returning();
      const visibilityChanged = parsed.data.isVisibleOnStorefront !== void 0 && parsed.data.isVisibleOnStorefront !== cur.isVisibleOnStorefront;
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: visibilityChanged ? "product_visibility_toggled" : "product_updated",
        targetType: "food_item",
        targetId: String(id),
        details: JSON.stringify({
          name: updated[0].name,
          price: updated[0].price,
          isVisibleOnStorefront: updated[0].isVisibleOnStorefront
        })
      });
      res.json({ product: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.delete(
  "/api/admin/products/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid product ID" });
    try {
      const deleted = await db.delete(foodItems).where(eq5(foodItems.id, id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Product not found" });
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "product_deleted",
        targetType: "food_item",
        targetId: String(id),
        details: JSON.stringify({ name: deleted[0].name })
      });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/orders/:id/status",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    const schema = z.object({
      status: z.enum([
        "confirmed",
        "accepted",
        "preparing",
        "ready",
        "rider_assigned",
        "picked_up",
        "on_the_way",
        "delivered",
        "cancelled"
      ]),
      riderUid: z.string().nullable().optional(),
      note: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(orderId) || !parsed.success) {
      return res.status(400).json({ error: "Invalid admin order status payload" });
    }
    try {
      const rows = await db.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
      const order = rows[0];
      let nextRiderUid = order.riderUid;
      let nextRiderName = order.riderName;
      if (parsed.data.riderUid !== void 0) {
        if (parsed.data.riderUid === null || parsed.data.riderUid === "") {
          nextRiderUid = null;
          nextRiderName = null;
        } else {
          const riderRows = await db.select().from(riders).where(eq5(riders.uid, parsed.data.riderUid)).limit(1);
          nextRiderUid = parsed.data.riderUid;
          nextRiderName = riderRows[0]?.fullName || parsed.data.riderUid;
        }
      }
      const updated = await db.transaction(async (tx) => {
        const nextPaymentStatus = parsed.data.status === "delivered" && order.paymentMethod === "cod" ? "paid" : parsed.data.status === "cancelled" ? order.paymentStatus === "paid" ? "refunded" : "failed" : order.paymentStatus;
        const rows2 = await tx.update(orders).set({
          status: parsed.data.status,
          riderUid: nextRiderUid,
          riderName: nextRiderName,
          paymentStatus: nextPaymentStatus,
          cancelReason: parsed.data.status === "cancelled" ? parsed.data.note || "Cancelled by Admin" : order.cancelReason,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(orders.id, orderId)).returning();
        await tx.insert(orderStatusHistory).values({
          orderId,
          status: parsed.data.status,
          note: parsed.data.note || `Admin updated status to ${parsed.data.status.replace(/_/g, " ")}`,
          actorUid: req.user.uid
        });
        if (parsed.data.status === "cancelled") {
          await reverseOrderSplitFinancialsTx(
            tx,
            order,
            parsed.data.note || "Cancelled by Admin"
          );
        }
        return rows2;
      });
      if (parsed.data.status === "delivered") {
        await settleOrderCommissionIdempotent(orderId);
        await recordRiderDeliveryWalletIdempotent(orderId, void 0, req.user.uid);
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "order_override",
        targetType: "order",
        targetId: String(orderId),
        details: JSON.stringify(parsed.data)
      });
      const restOwnerRows = await db.select({ ownerUid: restaurants.ownerUid, email: restaurants.email }).from(restaurants).where(eq5(restaurants.id, updated[0].restaurantId)).limit(1);
      const adminStatusRecipient = await resolveCustomerEmailForOrder(
        updated[0].customerEmail,
        updated[0].customerUid
      );
      if (adminStatusRecipient) {
        const assignedRiderRows = updated[0].riderUid ? await db.select({ phone: riders.phone }).from(riders).where(eq5(riders.uid, updated[0].riderUid)).limit(1) : [];
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: updated[0].id,
          orderNumber: updated[0].orderNumber,
          trackingToken: updated[0].trackingToken,
          customerName: updated[0].customerName,
          customerEmail: adminStatusRecipient,
          restaurantName: updated[0].restaurantName,
          deliveryArea: updated[0].deliveryArea,
          deliveryAddress: updated[0].deliveryAddress,
          subtotal: updated[0].subtotal,
          discountAmount: updated[0].discountAmount,
          couponCode: updated[0].couponCode,
          deliveryFee: updated[0].deliveryFee,
          serviceFee: updated[0].serviceFee,
          taxAmount: updated[0].taxAmount,
          totalAmount: updated[0].totalAmount,
          paymentMethod: updated[0].paymentMethod,
          paymentStatus: updated[0].paymentStatus,
          paymentSplitMode: updated[0].paymentSplitMode,
          onlineFoodPaidAmount: updated[0].onlineFoodPaidAmount,
          cashDueToRider: updated[0].cashDueToRider,
          status: updated[0].status,
          statusEvent: parsed.data.status,
          statusNote: parsed.data.note || `Order update: ${parsed.data.status.replace(/_/g, " ")}`,
          riderName: updated[0].riderName,
          riderPhone: assignedRiderRows[0]?.phone || null,
          etaMinutes: updated[0].estimatedMinutes,
          createdAt: updated[0].createdAt,
          items: updated[0].itemsSnapshotJson
        });
      }
      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        trackingToken: updated[0].trackingToken,
        eventKind: "status_update",
        restaurantName: updated[0].restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: updated[0].customerName,
        customerPhone: updated[0].customerPhone,
        deliveryArea: updated[0].deliveryArea,
        deliveryAddress: updated[0].deliveryAddress,
        totalAmount: updated[0].totalAmount,
        paymentMethod: updated[0].paymentMethod,
        paymentStatus: updated[0].paymentStatus,
        status: updated[0].status,
        statusNote: parsed.data.note || `Order update: ${parsed.data.status.replace(/_/g, " ")}`,
        riderName: updated[0].riderName,
        items: updated[0].itemsSnapshotJson
      }).catch(() => []);
      broadcastOrderEvent("order:updated", {
        orderId: updated[0].id,
        orderNumber: updated[0].orderNumber,
        restaurantId: updated[0].restaurantId,
        restaurantName: updated[0].restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: updated[0].customerUid,
        riderUid: updated[0].riderUid,
        riderName: updated[0].riderName,
        status: updated[0].status,
        deliveryMode: updated[0].deliveryMode,
        deliveryArea: updated[0].deliveryArea,
        totalAmount: updated[0].totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: updated[0].customerUid,
        roleTarget: "customer",
        title: `Order ${updated[0].orderNumber}: ${parsed.data.status.replace("_", " ")}`,
        message: parsed.data.note || `${updated[0].restaurantName} order updated.`,
        type: "order",
        relatedOrderId: updated[0].id
      });
      if (restOwnerRows[0]?.ownerUid) {
        broadcastNotificationEvent({
          recipientUid: restOwnerRows[0].ownerUid,
          roleTarget: "restaurant_owner",
          title: `Order ${updated[0].orderNumber}: ${parsed.data.status.replace("_", " ")}`,
          message: `Order status updated to ${parsed.data.status.replace("_", " ")}.`,
          type: "order",
          relatedOrderId: updated[0].id
        });
      }
      res.json({ order: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/orders/:id/refund",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Invalid order ID" });
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.select().from(orders).where(eq5(orders.id, orderId)).limit(1);
        if (rows.length === 0) throw new Error("Order not found");
        const order = rows[0];
        const updated = await tx.update(orders).set({
          status: "cancelled",
          paymentStatus: order.paymentStatus === "paid" ? "refunded" : "failed",
          cancelReason: req.body.reason || "Cancelled & refunded by Super Admin",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(orders.id, order.id)).returning();
        const existingReversal = await tx.select().from(commissionLedger).where(
          and2(
            eq5(commissionLedger.orderId, order.id),
            eq5(commissionLedger.entryType, "commission_reversal")
          )
        ).limit(1);
        if (existingReversal.length === 0 && order.platformCommission > 0) {
          await tx.insert(commissionLedger).values({
            orderId: order.id,
            restaurantId: order.restaurantId,
            entryType: "commission_reversal",
            grossAmount: -Math.max(0, order.subtotal - order.discountAmount),
            commissionAmount: -order.platformCommission,
            netRestaurantAmount: -order.restaurantEarnings,
            deliveryFeeAmount: -order.deliveryFee,
            note: `Refund reversal for ${order.orderNumber}`
          });
        }
        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          status: "cancelled",
          note: "Order cancelled and commission reversed by Super Admin",
          actorUid: req.user.uid
        });
        await reverseOrderSplitFinancialsTx(
          tx,
          order,
          req.body.reason || "Cancelled & refunded by Super Admin"
        );
        await tx.insert(auditLogs).values({
          actorUid: req.user.uid,
          action: "order_refund",
          targetType: "order",
          targetId: String(order.id),
          details: JSON.stringify({ orderNumber: order.orderNumber })
        });
        return updated[0];
      });
      const restOwnerRows = await db.select({ ownerUid: restaurants.ownerUid, email: restaurants.email }).from(restaurants).where(eq5(restaurants.id, result.restaurantId)).limit(1);
      const refundRecipient = await resolveCustomerEmailForOrder(
        result.customerEmail,
        result.customerUid
      );
      if (refundRecipient) {
        await sendAndLogOrderTrackingEmail({
          origin: getRequestOrigin(req),
          orderId: result.id,
          orderNumber: result.orderNumber,
          trackingToken: result.trackingToken,
          customerName: result.customerName,
          customerEmail: refundRecipient,
          restaurantName: result.restaurantName,
          deliveryArea: result.deliveryArea,
          deliveryAddress: result.deliveryAddress,
          subtotal: result.subtotal,
          discountAmount: result.discountAmount,
          couponCode: result.couponCode,
          deliveryFee: result.deliveryFee,
          serviceFee: result.serviceFee,
          taxAmount: result.taxAmount,
          totalAmount: result.totalAmount,
          paymentMethod: result.paymentMethod,
          paymentStatus: result.paymentStatus,
          paymentSplitMode: result.paymentSplitMode,
          onlineFoodPaidAmount: result.onlineFoodPaidAmount,
          cashDueToRider: result.cashDueToRider,
          status: result.status,
          statusEvent: "cancelled",
          statusNote: result.cancelReason || "Order cancelled & refunded by Admin",
          riderName: result.riderName,
          etaMinutes: result.estimatedMinutes,
          createdAt: result.createdAt,
          items: result.itemsSnapshotJson
        });
      }
      await sendMerchantOrderAlertEmail({
        origin: getRequestOrigin(req),
        orderId: result.id,
        orderNumber: result.orderNumber,
        trackingToken: result.trackingToken,
        eventKind: "status_update",
        restaurantName: result.restaurantName,
        restaurantEmail: restOwnerRows[0]?.email || null,
        customerName: result.customerName,
        customerPhone: result.customerPhone,
        deliveryArea: result.deliveryArea,
        deliveryAddress: result.deliveryAddress,
        totalAmount: result.totalAmount,
        paymentMethod: result.paymentMethod,
        paymentStatus: result.paymentStatus,
        status: result.status,
        statusNote: result.cancelReason || "Order cancelled & refunded by Admin",
        riderName: result.riderName,
        items: result.itemsSnapshotJson
      }).catch(() => []);
      broadcastOrderEvent("order:updated", {
        orderId: result.id,
        orderNumber: result.orderNumber,
        restaurantId: result.restaurantId,
        restaurantName: result.restaurantName,
        restaurantOwnerUid: restOwnerRows[0]?.ownerUid || null,
        customerUid: result.customerUid,
        riderUid: result.riderUid,
        riderName: result.riderName,
        status: result.status,
        deliveryMode: result.deliveryMode,
        deliveryArea: result.deliveryArea,
        totalAmount: result.totalAmount
      });
      broadcastNotificationEvent({
        recipientUid: result.customerUid,
        roleTarget: "customer",
        title: `Order ${result.orderNumber}: Cancelled & Refunded`,
        message: result.cancelReason || `${result.restaurantName} order cancelled and refunded.`,
        type: "order",
        relatedOrderId: result.id
      });
      if (restOwnerRows[0]?.ownerUid) {
        broadcastNotificationEvent({
          recipientUid: restOwnerRows[0].ownerUid,
          roleTarget: "restaurant_owner",
          title: `Order ${result.orderNumber}: Cancelled`,
          message: result.cancelReason || "Order cancelled and commission reversed by Admin.",
          type: "order",
          relatedOrderId: result.id
        });
      }
      res.json({ order: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/payouts/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid payout ID" });
    const status = req.body.status === "rejected" ? "rejected" : "paid";
    try {
      const updated = await db.update(restaurantPayouts).set({
        status,
        referenceId: status === "paid" ? `PAY-${Date.now().toString(36).toUpperCase()}` : "",
        processedAt: /* @__PURE__ */ new Date()
      }).where(eq5(restaurantPayouts.id, id)).returning();
      if (updated.length === 0) return res.status(404).json({ error: "Payout not found" });
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: `payout_${status}`,
        targetType: "payout",
        targetId: String(id),
        details: JSON.stringify({ amount: updated[0].amount })
      });
      res.json({ payout: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.post(
  "/api/admin/coupons",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      code: z.string().min(3).max(24),
      title: z.string().min(3),
      type: z.enum(["percentage", "fixed", "free_delivery"]),
      value: z.number().int().min(0),
      minOrder: z.number().int().min(0).default(0),
      maxDiscount: z.number().int().min(0).default(300)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid coupon data" });
    try {
      const inserted = await db.insert(coupons).values({
        code: parsed.data.code.trim().toUpperCase(),
        title: parsed.data.title,
        type: parsed.data.type,
        value: parsed.data.value,
        minOrder: parsed.data.minOrder,
        maxDiscount: parsed.data.maxDiscount,
        isActive: true
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "coupon_created",
        targetType: "coupon",
        targetId: String(inserted[0].id),
        details: JSON.stringify({ code: inserted[0].code })
      });
      res.status(201).json({ coupon: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/coupons/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid coupon ID" });
    try {
      const rows = await db.select().from(coupons).where(eq5(coupons.id, id)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Coupon not found" });
      const updated = await db.update(coupons).set({
        isActive: typeof req.body.isActive === "boolean" ? req.body.isActive : rows[0].isActive
      }).where(eq5(coupons.id, id)).returning();
      res.json({ coupon: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.delete(
  "/api/admin/coupons/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid coupon ID" });
    try {
      await db.delete(coupons).where(eq5(coupons.id, id));
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/settings",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const existing = await db.select().from(platformSettings).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Settings missing" });
      const cur = existing[0];
      const curStorefront = cur.storefrontConfig && typeof cur.storefrontConfig === "object" ? cur.storefrontConfig : {};
      const nextStorefront = req.body.storefrontConfig && typeof req.body.storefrontConfig === "object" ? { ...curStorefront, ...req.body.storefrontConfig } : curStorefront;
      const updated = await db.update(platformSettings).set({
        platformName: typeof req.body.platformName === "string" && req.body.platformName.trim() ? req.body.platformName.trim() : cur.platformName,
        defaultCommissionPct: req.body.defaultCommissionPct ?? cur.defaultCommissionPct,
        defaultDeliveryFee: typeof req.body.defaultDeliveryFee === "number" ? req.body.defaultDeliveryFee : cur.defaultDeliveryFee,
        serviceFee: typeof req.body.serviceFee === "number" ? req.body.serviceFee : cur.serviceFee,
        minOrderDefault: typeof req.body.minOrderDefault === "number" ? req.body.minOrderDefault : cur.minOrderDefault,
        pathaoEnabled: req.body.pathaoEnabled ?? cur.pathaoEnabled,
        pathaoSandbox: req.body.pathaoSandbox ?? cur.pathaoSandbox,
        bkashEnabled: req.body.bkashEnabled ?? cur.bkashEnabled,
        bkashSandbox: req.body.bkashSandbox ?? cur.bkashSandbox,
        sslcommerzEnabled: req.body.sslcommerzEnabled ?? cur.sslcommerzEnabled,
        sslcommerzSandbox: req.body.sslcommerzSandbox ?? cur.sslcommerzSandbox,
        storefrontConfig: nextStorefront,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(platformSettings.id, cur.id)).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "platform_settings_updated",
        targetType: "platform_settings",
        targetId: String(cur.id),
        details: JSON.stringify(req.body)
      });
      res.json({ settings: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid user ID" });
    const allowedRoles = ["customer", "restaurant_owner", "rider", "admin", "super_admin"];
    try {
      const existing = await db.select().from(users).where(eq5(users.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "User not found" });
      const target = existing[0];
      const nextStatus = req.body.status === "suspended" || req.body.status === "active" ? req.body.status : target.status;
      const nextRole = typeof req.body.role === "string" && allowedRoles.includes(req.body.role) ? req.body.role : target.role;
      const decision = canActorModifyUserAccount({
        actorUid: req.user.uid,
        actorRole: req.user.role,
        targetUid: target.uid,
        targetEmail: target.email,
        currentRole: target.role,
        nextRole,
        nextStatus
      });
      if (!decision.allowed) {
        return res.status(403).json({ error: decision.reason || "Forbidden: Role change not permitted." });
      }
      const updated = await db.update(users).set({ status: nextStatus, role: nextRole, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id)).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "user_updated",
        targetType: "user",
        targetId: String(id),
        details: JSON.stringify({ role: nextRole, status: nextStatus })
      });
      res.json({ user: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/riders/:id",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid rider ID" });
    const schema = z.object({
      status: z.enum(["pending", "approved", "suspended"]).optional(),
      isAvailable: z.boolean().optional(),
      zone: z.string().trim().min(2).max(120).optional(),
      vehicleType: z.string().trim().min(2).max(40).optional(),
      currentLat: z.number().min(-90).max(90).optional(),
      currentLng: z.number().min(-180).max(180).optional()
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid rider update payload" });
    }
    try {
      const existing = await db.select().from(riders).where(eq5(riders.id, id)).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Rider not found" });
      const cur = existing[0];
      const hasCoords = typeof parsed.data.currentLat === "number" || typeof parsed.data.currentLng === "number";
      const nextStatus = parsed.data.status ?? cur.status;
      const nextIsAvailable = typeof parsed.data.isAvailable === "boolean" ? parsed.data.isAvailable : parsed.data.status === "approved" && cur.status === "pending" ? true : parsed.data.status === "suspended" ? false : cur.isAvailable;
      const updated = await db.update(riders).set({
        status: nextStatus,
        isAvailable: nextIsAvailable,
        zone: parsed.data.zone ? parsed.data.zone : cur.zone,
        vehicleType: parsed.data.vehicleType ? parsed.data.vehicleType : cur.vehicleType,
        currentLat: typeof parsed.data.currentLat === "number" ? Math.round(parsed.data.currentLat * 1e6) / 1e6 : cur.currentLat,
        currentLng: typeof parsed.data.currentLng === "number" ? Math.round(parsed.data.currentLng * 1e6) / 1e6 : cur.currentLng,
        locationUpdatedAt: hasCoords ? /* @__PURE__ */ new Date() : cur.locationUpdatedAt
      }).where(eq5(riders.id, id)).returning();
      if (parsed.data.status && parsed.data.status !== cur.status) {
        const statusTitle = parsed.data.status === "approved" ? `Rider Account Approved \xB7 ${updated[0].zone}` : parsed.data.status === "suspended" ? "Rider Account Suspended" : "Rider Status Set to Pending";
        const statusMsg = parsed.data.status === "approved" ? `Welcome! You are now approved to accept deliveries in ${updated[0].zone}.` : parsed.data.status === "suspended" ? "Your rider dispatch access has been suspended by Admin." : "Your rider application is under Admin review.";
        await db.insert(notifications).values({
          recipientUid: updated[0].uid,
          roleTarget: "rider",
          title: statusTitle,
          message: statusMsg,
          type: "system"
        });
        broadcastNotificationEvent({
          recipientUid: updated[0].uid,
          roleTarget: "rider",
          title: statusTitle,
          message: statusMsg,
          type: "system"
        });
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: hasCoords ? "rider_gps_override" : "rider_updated",
        targetType: "rider",
        targetId: String(id),
        details: JSON.stringify(parsed.data)
      });
      res.json({ rider: updated[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
app.patch(
  "/api/admin/delivery-financial-config",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const existing = await db.select().from(platformSettings).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: "Platform settings missing" });
      const cur = existing[0];
      const currentMerged = mergeDeliveryFinancialConfig(cur.deliveryFinancialConfig);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const nextConfig = mergeDeliveryFinancialConfig({
        zoneFees: { ...currentMerged.zoneFees, ...body.zoneFees || {} },
        distancePricing: { ...currentMerged.distancePricing, ...body.distancePricing || {} },
        riderEarningRule: { ...currentMerged.riderEarningRule, ...body.riderEarningRule || {} },
        settlementRules: { ...currentMerged.settlementRules, ...body.settlementRules || {} }
      });
      await db.update(platformSettings).set({
        deliveryFinancialConfig: nextConfig,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(platformSettings.id, cur.id));
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "delivery_financial_config_updated",
        targetType: "platform_settings",
        targetId: String(cur.id),
        details: JSON.stringify(nextConfig)
      });
      res.json({ deliveryFinancialConfig: nextConfig });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update delivery financial config" });
    }
  }
);
app.post(
  "/api/admin/riders/:uid/settle-commission",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const riderUid = String(req.params.uid || "").trim();
    const schema = z.object({
      amount: z.number().int().positive(),
      method: z.string().trim().min(2).max(40).default("cash"),
      referenceId: z.string().trim().max(80).optional(),
      note: z.string().trim().max(240).optional()
    });
    const parsed = schema.safeParse(req.body || {});
    if (!riderUid || !parsed.success) {
      return res.status(400).json({ error: "Valid positive settlement amount required" });
    }
    try {
      const riderRows = await db.select().from(riders).where(eq5(riders.uid, riderUid)).limit(1);
      if (riderRows.length === 0) return res.status(404).json({ error: "Rider not found" });
      const existingEntries = await db.select().from(riderWalletLedger).where(eq5(riderWalletLedger.riderUid, riderUid));
      const summaryBefore = summarizeRiderWalletLedger(
        existingEntries.map((e) => ({
          entryType: e.entryType,
          cashCollected: e.cashCollected,
          riderEarningDelta: e.riderEarningDelta,
          commissionOwedDelta: e.commissionOwedDelta,
          commissionSettledDelta: e.commissionSettledDelta
        }))
      );
      if (summaryBefore.outstandingCommission <= 0) {
        return res.status(400).json({ error: "This rider has no outstanding Foodora commission owed." });
      }
      if (parsed.data.amount > summaryBefore.outstandingCommission) {
        return res.status(400).json({
          error: `Settlement amount (\u09F3${parsed.data.amount}) exceeds outstanding commission owed (\u09F3${summaryBefore.outstandingCommission}).`
        });
      }
      const ref = parsed.data.referenceId?.trim() || `STL-${Date.now().toString(36).toUpperCase()}-${crypto4.randomBytes(2).toString("hex").toUpperCase()}`;
      const idempotencyKey = `settle:${riderUid}:${Date.now()}:${crypto4.randomBytes(4).toString("hex")}`;
      const inserted = await db.insert(riderWalletLedger).values({
        riderUid,
        orderId: null,
        orderNumber: "",
        entryType: "commission_settled",
        idempotencyKey,
        cashCollected: 0,
        riderEarningDelta: 0,
        commissionOwedDelta: 0,
        commissionSettledDelta: parsed.data.amount,
        referenceId: ref,
        note: parsed.data.note?.trim() || `Commission settled (${parsed.data.method}) \xB7 Recorded by Admin`
      }).returning();
      await db.insert(notifications).values({
        recipientUid: riderUid,
        roleTarget: "rider",
        title: `Commission Settled \xB7 \u09F3${parsed.data.amount}`,
        message: `Admin recorded your Foodora commission settlement of \u09F3${parsed.data.amount} (${ref}).`,
        type: "system"
      });
      broadcastNotificationEvent({
        recipientUid: riderUid,
        roleTarget: "rider",
        title: `Commission Settled \xB7 \u09F3${parsed.data.amount}`,
        message: `Admin recorded your Foodora commission settlement of \u09F3${parsed.data.amount} (${ref}).`,
        type: "system"
      });
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "rider_commission_settled",
        targetType: "rider",
        targetId: riderUid,
        details: JSON.stringify({ amount: parsed.data.amount, method: parsed.data.method, referenceId: ref })
      });
      const updatedSummary = summarizeRiderWalletLedger([
        ...existingEntries.map((e) => ({
          entryType: e.entryType,
          cashCollected: e.cashCollected,
          riderEarningDelta: e.riderEarningDelta,
          commissionOwedDelta: e.commissionOwedDelta,
          commissionSettledDelta: e.commissionSettledDelta
        })),
        {
          entryType: "commission_settled",
          cashCollected: 0,
          riderEarningDelta: 0,
          commissionOwedDelta: 0,
          commissionSettledDelta: parsed.data.amount
        }
      ]);
      res.status(201).json({
        entry: inserted[0],
        walletSummary: updatedSummary
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to settle rider commission" });
    }
  }
);
app.get(
  "/api/admin/transactions",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    try {
      const [txRows, walletRows] = await Promise.all([
        db.select().from(paymentTransactions).orderBy(desc3(paymentTransactions.id)).limit(250),
        db.select().from(riderWalletLedger).orderBy(desc3(riderWalletLedger.id)).limit(250)
      ]);
      res.json({ paymentTransactions: txRows, riderWalletLedger: walletRows });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load financial transactions" });
    }
  }
);
app.get(
  "/api/admin/payment-gateways",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const origin = getRequestOrigin(req);
      const rows = await ensureDefaultPaymentGateways();
      res.json({
        paymentGateways: rows.map(
          (r) => toAdminPaymentGatewayView(r, origin, isEnvConfiguredForGateway(r.code))
        )
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load payment gateways" });
    }
  }
);
app.put(
  "/api/admin/payment-gateways",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().min(2).max(60),
      nameBn: z.string().min(1).max(60).optional(),
      providerType: z.enum(["mfs", "card", "wallet", "cod", "custom"]).default("mfs"),
      mode: z.enum(["sandbox", "live"]).default("sandbox"),
      isActive: z.boolean().default(true),
      apiBaseUrl: z.string().max(240).optional().default(""),
      merchantId: z.string().max(120).optional().default(""),
      apiKey: z.string().max(240).optional(),
      apiSecret: z.string().max(240).optional(),
      webhookSecret: z.string().max(240).optional(),
      instructions: z.string().max(300).optional().default(""),
      sortOrder: z.number().int().min(1).max(100).optional().default(10)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payment gateway configuration payload" });
    }
    const code = normalizeGatewayCode(parsed.data.code);
    if (code.length < 2) {
      return res.status(400).json({ error: "Gateway code must contain at least 2 alphanumeric characters" });
    }
    try {
      await ensureDefaultPaymentGateways();
      const existing = await db.select().from(paymentGateways).where(eq5(paymentGateways.code, code)).limit(1);
      const keepOrReplaceSecret = (incoming, prev) => {
        if (incoming === void 0) return prev || "";
        const clean = incoming.trim();
        if (!clean || clean.startsWith("\u2022\u2022\u2022\u2022")) return prev || "";
        return clean;
      };
      const cur = existing[0];
      const nextValues = {
        code,
        name: parsed.data.name.trim(),
        nameBn: parsed.data.nameBn?.trim() || parsed.data.name.trim(),
        providerType: parsed.data.providerType,
        mode: code === "cod" ? "live" : parsed.data.mode,
        isActive: parsed.data.isActive,
        apiBaseUrl: parsed.data.apiBaseUrl.trim(),
        merchantId: parsed.data.merchantId.trim(),
        apiKey: keepOrReplaceSecret(parsed.data.apiKey, cur?.apiKey),
        apiSecret: keepOrReplaceSecret(parsed.data.apiSecret, cur?.apiSecret),
        webhookSecret: keepOrReplaceSecret(parsed.data.webhookSecret, cur?.webhookSecret),
        instructions: parsed.data.instructions.trim(),
        sortOrder: parsed.data.sortOrder,
        updatedAt: /* @__PURE__ */ new Date()
      };
      const saved = await db.insert(paymentGateways).values(nextValues).onConflictDoUpdate({
        target: paymentGateways.code,
        set: nextValues
      }).returning();
      if (code === "bkash" || code === "sslcommerz") {
        const settingsRows = await db.select().from(platformSettings).limit(1);
        if (settingsRows.length > 0) {
          await db.update(platformSettings).set(
            code === "bkash" ? {
              bkashEnabled: nextValues.isActive,
              bkashSandbox: nextValues.mode !== "live",
              updatedAt: /* @__PURE__ */ new Date()
            } : {
              sslcommerzEnabled: nextValues.isActive,
              sslcommerzSandbox: nextValues.mode !== "live",
              updatedAt: /* @__PURE__ */ new Date()
            }
          ).where(eq5(platformSettings.id, settingsRows[0].id));
        }
      }
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: cur ? "payment_gateway_updated" : "payment_gateway_created",
        targetType: "payment_gateway",
        targetId: code,
        details: JSON.stringify({
          name: nextValues.name,
          mode: nextValues.mode,
          isActive: nextValues.isActive,
          providerType: nextValues.providerType
        })
      });
      res.json({
        paymentGateway: toAdminPaymentGatewayView(
          saved[0],
          getRequestOrigin(req),
          isEnvConfiguredForGateway(code)
        )
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to save payment gateway" });
    }
  }
);
app.post(
  "/api/admin/payment-gateways/:code/test",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const code = normalizeGatewayCode(String(req.params.code || ""));
    if (!code) return res.status(400).json({ error: "Invalid gateway code" });
    try {
      await ensureDefaultPaymentGateways();
      const rows = await db.select().from(paymentGateways).where(eq5(paymentGateways.code, code)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Gateway not found" });
      const result = validatePaymentGatewayConfiguration(
        rows[0],
        isEnvConfiguredForGateway(code)
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message || "Gateway test failed" });
    }
  }
);
app.delete(
  "/api/admin/payment-gateways/:code",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const code = normalizeGatewayCode(String(req.params.code || ""));
    if (!code) return res.status(400).json({ error: "Invalid gateway code" });
    if (["bkash", "nagad", "sslcommerz", "cod"].includes(code)) {
      return res.status(400).json({
        error: "Built-in gateways cannot be deleted. Disable them instead."
      });
    }
    try {
      await db.delete(paymentGateways).where(eq5(paymentGateways.code, code));
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "payment_gateway_deleted",
        targetType: "payment_gateway",
        targetId: code,
        details: `Removed custom payment gateway ${code}`
      });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to delete payment gateway" });
    }
  }
);
app.get(
  "/api/admin/backend/status",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    const started = Date.now();
    try {
      await db.execute(sql3`SELECT 1`);
      const latencyMs = Math.max(1, Date.now() - started);
      const [
        usersCount,
        restaurantsCount,
        foodItemsCount,
        ordersCount,
        ridersCount,
        couponsCount,
        notificationsCount,
        ledgerCount,
        auditCount
      ] = await Promise.all([
        db.select({ count: sql3`count(*)::int` }).from(users),
        db.select({ count: sql3`count(*)::int` }).from(restaurants),
        db.select({ count: sql3`count(*)::int` }).from(foodItems),
        db.select({ count: sql3`count(*)::int` }).from(orders),
        db.select({ count: sql3`count(*)::int` }).from(riders),
        db.select({ count: sql3`count(*)::int` }).from(coupons),
        db.select({ count: sql3`count(*)::int` }).from(notifications),
        db.select({ count: sql3`count(*)::int` }).from(commissionLedger),
        db.select({ count: sql3`count(*)::int` }).from(auditLogs)
      ]);
      const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "";
      const databaseProvider = connStr ? "supabase-or-external-url" : process.env.SQL_HOST ? "cloudsql-pg" : "local-pg";
      const sslActive = Boolean(connStr) && !connStr.includes("localhost") && !connStr.includes("127.0.0.1");
      const emailStatus = await getEmailTransportStatus();
      res.json({
        ok: true,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        latencyMs,
        runtime: process.env.VERCEL ? "vercel-serverless" : "node-express",
        databaseProvider,
        sslActive,
        integrations: {
          databaseConfigured: Boolean(connStr || process.env.SQL_HOST),
          supabaseAuthConfigured: Boolean(
            process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://uvqptlflvdtxbrqiztzi.supabase.co"
          ),
          googleMapsConfigured: Boolean(
            process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY
          ),
          bkashLiveConfigured: Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET),
          sslcommerzLiveConfigured: Boolean(
            process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWD
          ),
          pathaoLiveConfigured: Boolean(
            process.env.PATHAO_CLIENT_ID && process.env.PATHAO_CLIENT_SECRET
          ),
          emailConfigured: emailStatus.configured,
          emailProvider: emailStatus.provider
        },
        tableCounts: {
          users: Number(usersCount[0]?.count ?? 0),
          restaurants: Number(restaurantsCount[0]?.count ?? 0),
          foodItems: Number(foodItemsCount[0]?.count ?? 0),
          orders: Number(ordersCount[0]?.count ?? 0),
          riders: Number(ridersCount[0]?.count ?? 0),
          coupons: Number(couponsCount[0]?.count ?? 0),
          notifications: Number(notificationsCount[0]?.count ?? 0),
          commissionLedger: Number(ledgerCount[0]?.count ?? 0),
          auditLogs: Number(auditCount[0]?.count ?? 0)
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Database health check failed" });
    }
  }
);
app.get(
  "/api/admin/seo-check",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const origin = getRequestOrigin(req);
      const [settings, approved] = await Promise.all([
        getPlatformSettingsRow(),
        getApprovedRestaurants()
      ]);
      const sc = mergeStorefrontConfig(settings?.storefrontConfig);
      const verificationToken = (sc.googleSiteVerification || process.env.GOOGLE_SITE_VERIFICATION || "").trim();
      const sitemapXml = buildSitemapXml(
        origin,
        approved.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }))
      );
      const robotsTxt = buildRobotsTxt(origin);
      res.json({
        ok: true,
        origin,
        sitemapUrl: `${origin}/sitemap.xml`,
        robotsUrl: `${origin}/robots.txt`,
        indexedUrls: approved.length + 1,
        googleVerificationConfigured: Boolean(verificationToken),
        verificationPreview: verificationToken ? `${verificationToken.slice(0, 6)}...` : "",
        sitemapBytes: sitemapXml.length,
        robotsOk: robotsTxt.includes("Sitemap:")
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "SEO verification check failed" });
    }
  }
);
app.get(
  "/api/admin/email-settings",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    try {
      const settings = await getAdminEmailSettingsView();
      res.json({ settings });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load email settings" });
    }
  }
);
app.put(
  "/api/admin/email-settings",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      provider: z.enum(["gmail", "smtp", "resend"]),
      smtpHost: z.string().trim().max(200).optional(),
      smtpPort: z.number().int().min(1).max(65535).optional(),
      smtpSecure: z.boolean().optional(),
      smtpUser: z.string().trim().max(200).optional(),
      smtpPass: z.string().max(200).optional(),
      fromAddress: z.string().trim().max(200).optional(),
      notifyEmail: z.string().trim().email().or(z.literal("")).optional(),
      resendApiKey: z.string().max(300).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email transport configuration payload" });
    }
    try {
      const saved = await saveAdminEmailSettings(parsed.data);
      const verification = saved.configured ? await verifyEmailTransportConnection() : { ok: false, message: "Credentials incomplete", error: void 0 };
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "email_settings_updated",
        targetType: "email_transport",
        targetId: saved.provider,
        details: `Updated email delivery provider to ${saved.provider} (configured: ${saved.configured}, verified: ${verification.ok})`
      });
      res.json({
        ok: true,
        settings: saved,
        verified: verification.ok,
        verifyMessage: verification.message,
        verifyError: verification.error
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to save email settings" });
    }
  }
);
app.post(
  "/api/admin/email-settings/verify",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    try {
      const result = await verifyEmailTransportConnection();
      if (!result.ok) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "SMTP verification failed" });
    }
  }
);
app.post(
  "/api/admin/email-settings/test",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      to: z.string().trim().email(),
      templateStatus: z.string().trim().max(40).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please enter a valid recipient email address." });
    }
    try {
      const result = await sendTestEmail(
        parsed.data.to,
        parsed.data.templateStatus,
        getRequestOrigin(req)
      );
      if (!result.ok) {
        return res.status(400).json({
          ok: false,
          provider: result.provider,
          status: result.status,
          error: result.error || "Failed to send test invoice email"
        });
      }
      res.json({
        ok: true,
        provider: result.provider,
        message: `Test "${(parsed.data.templateStatus || "confirmed").replace(/_/g, " ")}" template email sent to ${parsed.data.to} via ${result.provider.toUpperCase()}.`
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to send test email" });
    }
  }
);
app.get(
  "/api/admin/email-logs",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit || 25);
      const logs = await getRecentOrderEmailLogs(limit);
      res.json({ logs });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load order email logs" });
    }
  }
);
app.post(
  "/api/admin/email-logs/:id/resend",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const logId = Number(req.params.id);
    if (!Number.isInteger(logId) || logId <= 0) {
      return res.status(400).json({ error: "Invalid email log ID" });
    }
    try {
      const result = await resendOrderEmailLog(logId);
      if (!result) return res.status(404).json({ error: "Email log record not found" });
      if (!result.ok) {
        return res.status(400).json({
          ok: false,
          error: result.dispatchResult.error || "Email resend failed",
          log: result.log
        });
      }
      res.json({
        ok: true,
        message: `Email re-sent to ${result.log.recipientEmail} via ${result.dispatchResult.provider.toUpperCase()}.`,
        log: result.log
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to resend email" });
    }
  }
);
app.post(
  "/api/admin/notifications/broadcast",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const validated = validateBroadcastNotification({
      targetRole: String(req.body?.targetRole || ""),
      title: String(req.body?.title || ""),
      message: String(req.body?.message || ""),
      type: typeof req.body?.type === "string" ? req.body.type : "system"
    });
    if (!validated.valid) {
      return res.status(400).json({ error: validated.reason });
    }
    try {
      const recipientUid = validated.targetRole === "all" ? "broadcast-all" : `role-${validated.targetRole}`;
      const inserted = await db.insert(notifications).values({
        recipientUid,
        roleTarget: validated.targetRole,
        title: validated.title,
        message: validated.message,
        type: validated.type
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "notification_broadcast",
        targetType: "notification",
        targetId: String(inserted[0].id),
        details: JSON.stringify({ targetRole: validated.targetRole, title: validated.title })
      });
      broadcastNotificationEvent({
        recipientUid,
        roleTarget: validated.targetRole,
        title: validated.title,
        message: validated.message,
        type: validated.type
      });
      res.status(201).json({ notification: inserted[0] });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to send broadcast" });
    }
  }
);
app.post(
  "/api/admin/backend/reseed",
  requireAuth,
  requireRole(["super_admin"]),
  async (req, res) => {
    try {
      await ensureDatabaseSeeded();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "backend_reseed_verified",
        targetType: "database",
        targetId: "seed",
        details: "Verified and repaired baseline marketplace seed records without wiping data."
      });
      res.json({ ok: true, message: "Database seed integrity verified cleanly." });
    } catch (error) {
      res.status(500).json({ error: error.message || "Database seed verification failed" });
    }
  }
);
app.get(
  "/api/admin/backend/backup",
  requireAuth,
  requireRole(["super_admin"]),
  async (req, res) => {
    try {
      const [
        allUsers,
        allRestaurants,
        allFoodItems,
        allOrders,
        allRiders,
        allCoupons,
        allLedger,
        allPayouts,
        allSettings,
        allNotifications
      ] = await Promise.all([
        db.select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt
        }).from(users),
        db.select().from(restaurants),
        db.select().from(foodItems),
        db.select().from(orders),
        db.select().from(riders),
        db.select().from(coupons),
        db.select().from(commissionLedger),
        db.select().from(restaurantPayouts),
        db.select().from(platformSettings),
        db.select().from(notifications)
      ]);
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "backend_backup_exported",
        targetType: "database",
        targetId: "json",
        details: JSON.stringify({
          exportedBy: req.user.email,
          orders: allOrders.length,
          restaurants: allRestaurants.length
        })
      });
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        exportedBy: req.user.email,
        platform: "Foodora BD",
        tables: {
          users: allUsers,
          restaurants: allRestaurants,
          foodItems: allFoodItems,
          orders: allOrders,
          riders: allRiders,
          coupons: allCoupons,
          commissionLedger: allLedger,
          restaurantPayouts: allPayouts,
          platformSettings: allSettings,
          notifications: allNotifications
        }
      };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="foodora-bd-db-backup.json"');
      res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to generate database backup" });
    }
  }
);
var EXCLUDED_ZIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "dist",
  ".git",
  ".playwright-cli",
  ".aistudio",
  ".cache",
  ".gmp_cache",
  "tmp"
]);
var EXCLUDED_ZIP_FILES = /* @__PURE__ */ new Set([".env", ".DS_Store"]);
async function addDirectoryToZip(zipFolder, fsDir, relBase = "") {
  const entries = await fs2.promises.readdir(fsDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const fullPath = path2.join(fsDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_ZIP_DIRS.has(entry.name)) continue;
      if (relPath === "public/assets/aistudio" || relPath === "public\\assets\\aistudio") continue;
      await addDirectoryToZip(zipFolder, fullPath, relPath);
    } else if (entry.isFile()) {
      if (EXCLUDED_ZIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith(".log") || entry.name.endsWith(".zip")) continue;
      const content = await fs2.promises.readFile(fullPath);
      zipFolder.file(relPath, content);
    }
  }
}
app.get("/api/export/project-zip", async (_req, res) => {
  try {
    const zip = new JSZip();
    const rootFolder = zip.folder("foodora-bd");
    if (!rootFolder) {
      return res.status(500).json({ error: "Failed to initialize ZIP archive" });
    }
    await addDirectoryToZip(rootFolder, PROJECT_ROOT);
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="foodora-bd-project.zip"');
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.send(buffer);
  } catch (error) {
    console.error("Project ZIP export failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate ZIP file" });
  }
});
app.get("/api/notifications", requireAuth, async (req, res) => {
  const list = await getNotificationsForUser(req.user.uid, req.user.role);
  res.json({ notifications: list });
});
app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  await db.update(notifications).set({ isRead: true }).where(
    or2(
      eq5(notifications.recipientUid, req.user.uid),
      eq5(notifications.roleTarget, req.user.role),
      eq5(notifications.roleTarget, "all")
    )
  );
  res.json({ ok: true });
});
app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid notification ID" });
  await db.update(notifications).set({ isRead: true }).where(
    and2(
      eq5(notifications.id, id),
      or2(
        eq5(notifications.recipientUid, req.user.uid),
        eq5(notifications.roleTarget, req.user.role),
        eq5(notifications.roleTarget, "all")
      )
    )
  );
  res.json({ ok: true });
});
function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.AI_STUDIO_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
}
function getProviderEnvApiKey(providerType) {
  switch (providerType) {
    case "openrouter":
      return (process.env.OPENROUTER_API_KEY || "").trim();
    case "openai":
      return (process.env.OPENAI_API_KEY || "").trim();
    case "groq":
      return (process.env.GROQ_API_KEY || "").trim();
    case "deepseek":
      return (process.env.DEEPSEEK_API_KEY || "").trim();
    case "anthropic":
      return (process.env.ANTHROPIC_API_KEY || "").trim();
    case "mistral":
      return (process.env.MISTRAL_API_KEY || "").trim();
    case "xai":
      return (process.env.XAI_API_KEY || "").trim();
    case "together":
      return (process.env.TOGETHER_API_KEY || "").trim();
    case "cerebras":
      return (process.env.CEREBRAS_API_KEY || "").trim();
    case "perplexity":
      return (process.env.PERPLEXITY_API_KEY || "").trim();
    case "cohere":
      return (process.env.COHERE_API_KEY || "").trim();
    case "huggingface":
      return (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "").trim();
    default:
      return "";
  }
}
function getAiEnvFlags() {
  return {
    hasGeminiKey: Boolean(getGeminiApiKey()),
    hasOpenRouterKey: Boolean(getProviderEnvApiKey("openrouter")),
    hasOpenAIKey: Boolean(getProviderEnvApiKey("openai")),
    hasGroqKey: Boolean(getProviderEnvApiKey("groq")),
    hasDeepSeekKey: Boolean(getProviderEnvApiKey("deepseek")),
    hasAnthropicKey: Boolean(getProviderEnvApiKey("anthropic")),
    hasMistralKey: Boolean(getProviderEnvApiKey("mistral")),
    hasXaiKey: Boolean(getProviderEnvApiKey("xai")),
    hasTogetherKey: Boolean(getProviderEnvApiKey("together")),
    hasCerebrasKey: Boolean(getProviderEnvApiKey("cerebras")),
    hasPerplexityKey: Boolean(getProviderEnvApiKey("perplexity")),
    hasCohereKey: Boolean(getProviderEnvApiKey("cohere")),
    hasHuggingFaceKey: Boolean(getProviderEnvApiKey("huggingface"))
  };
}
function getGeminiHelpClient() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var aiHelpRequestSchema = z.object({
  message: z.string().trim().min(1, "Please enter a question.").max(1500),
  langPreference: z.enum(["auto", "bn", "en"]).optional().default("auto"),
  uiLang: z.enum(["en", "bn"]).optional().default("en"),
  providerCode: z.string().trim().max(32).optional(),
  history: z.array(
    z.object({
      role: z.enum(["user", "model"]),
      text: z.string().trim().min(1).max(3e3),
      reasoning_details: z.unknown().optional()
    })
  ).optional().default([]),
  context: z.object({
    area: z.string().trim().max(120).optional(),
    viewType: z.string().trim().max(60).optional(),
    activeOrderNumber: z.string().trim().max(60).optional()
  }).optional()
});
function extractReadableGeminiError(err) {
  const rawStatus = typeof err?.status === "number" ? err.status : 502;
  const rawMsg = coerceSafeErrorText(err, "Failed to generate AI Help response.");
  let parsedMessage = rawMsg;
  let parsedStatus = rawStatus;
  if (rawMsg.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(rawMsg);
      const candidate = coerceSafeErrorText(obj.error?.message ?? obj.message, "");
      if (candidate) parsedMessage = candidate;
      if (typeof obj.error?.code === "number") parsedStatus = obj.error.code;
    } catch {
    }
  }
  return {
    status: parsedStatus >= 400 && parsedStatus < 600 ? parsedStatus : 502,
    message: coerceSafeErrorText(parsedMessage, "Failed to generate AI Help response.")
  };
}
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(ms / 1e3)}s`);
      err.status = 504;
      reject(err);
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
function resolveDefaultBaseUrlForAiType(providerType) {
  if (providerType === "pollinations") return "https://text.pollinations.ai";
  if (providerType === "openrouter") return "https://openrouter.ai/api/v1";
  if (providerType === "openai") return "https://api.openai.com/v1";
  if (providerType === "groq") return "https://api.groq.com/openai/v1";
  if (providerType === "deepseek") return "https://api.deepseek.com/v1";
  if (providerType === "anthropic") return "https://api.anthropic.com";
  if (providerType === "mistral") return "https://api.mistral.ai/v1";
  if (providerType === "xai") return "https://api.x.ai/v1";
  if (providerType === "together") return "https://api.together.xyz/v1";
  if (providerType === "cerebras") return "https://api.cerebras.ai/v1";
  if (providerType === "perplexity") return "https://api.perplexity.ai";
  if (providerType === "cohere") return "https://api.cohere.com/compatibility/v1";
  if (providerType === "huggingface") return "https://router.huggingface.co/v1";
  return "";
}
async function runSingleOpenRouterRequest(options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        "HTTP-Referer": options.refererOrigin || "https://foodorabd-3-nine.vercel.app",
        "X-Title": "Foodora BD"
      },
      body: JSON.stringify(options.payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = coerceSafeErrorText(json?.error?.message ?? json?.error, `OpenRouter API failed (${res.status})`);
      const err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    const msg = json?.choices?.[0]?.message;
    const text2 = extractAiReplyText(msg?.content);
    if (!text2) {
      const err = new Error("OpenRouter returned an empty response.");
      err.status = 502;
      throw err;
    }
    return {
      reply: text2,
      reasoningDetails: msg?.reasoning_details
    };
  } finally {
    clearTimeout(timer);
  }
}
async function callExternalAiProvider(options) {
  const baseUrl = (options.apiBaseUrl || resolveDefaultBaseUrlForAiType(options.providerType)).trim().replace(/\/+$/, "");
  if (!isValidExternalAiBaseUrl(baseUrl)) {
    const err = new Error("Invalid external AI API base URL (HTTPS required).");
    err.status = 400;
    throw err;
  }
  if (options.providerType === "pollinations") {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 18e3);
    try {
      const endpoint = baseUrl.endsWith("/openai") ? baseUrl : `${baseUrl}/openai`;
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller2.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: options.model || "openai-fast",
          messages: [
            { role: "system", content: options.systemInstruction },
            ...options.history.slice(-6).map((h) => ({
              role: h.role === "model" ? "assistant" : "user",
              content: h.text
            })),
            { role: "user", content: options.message }
          ]
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(coerceSafeErrorText(json?.error?.message ?? json?.error, `Pollinations AI failed (${res.status})`));
        err.status = res.status;
        throw err;
      }
      const text2 = extractAiReplyText(json?.choices?.[0]?.message?.content);
      if (!text2) throw new Error("Pollinations AI returned an empty response.");
      return { reply: text2, actualModel: options.model || "openai-fast" };
    } finally {
      clearTimeout(timer2);
    }
  }
  if (options.providerType === "openrouter") {
    const primaryModel = (options.model || "").trim() || "google/gemma-4-31b-it:free";
    const attempts = [
      { model: primaryModel, strictProvider: true, enableReasoning: true },
      { model: primaryModel, strictProvider: false, enableReasoning: false }
    ];
    for (const fallbackModel of [
      "google/gemma-3-27b-it:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "openrouter/free"
    ]) {
      if (fallbackModel !== primaryModel) {
        attempts.push({ model: fallbackModel, strictProvider: false, enableReasoning: false });
      }
    }
    let lastErr = null;
    for (const attempt of attempts) {
      try {
        const payload = buildOpenRouterChatPayload({
          model: attempt.model,
          systemInstruction: options.systemInstruction,
          history: options.history,
          message: options.message,
          strictProvider: attempt.strictProvider,
          enableReasoning: attempt.enableReasoning
        });
        const out = await runSingleOpenRouterRequest({
          baseUrl,
          apiKey: options.apiKey,
          refererOrigin: options.refererOrigin,
          payload,
          timeoutMs: 18e3
        });
        return { ...out, actualModel: attempt.model };
      } catch (err) {
        lastErr = err;
        const status = err?.status;
        if (status === 401 || status === 403) {
          throw err;
        }
      }
    }
    throw lastErr || new Error("OpenRouter API failed.");
  }
  const controller = new AbortController();
  const timeoutMs = 15e3;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (options.providerType === "anthropic") {
      const res2 = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: 700,
          system: options.systemInstruction,
          messages: [
            ...options.history.slice(-8).map((h) => ({
              role: h.role === "model" ? "assistant" : "user",
              content: h.text
            })),
            { role: "user", content: options.message }
          ]
        })
      });
      const json2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        const err = new Error(coerceSafeErrorText(json2?.error?.message ?? json2?.error, `Anthropic API failed (${res2.status})`));
        err.status = res2.status;
        throw err;
      }
      const text3 = extractAiReplyText(json2?.content);
      if (!text3) throw new Error("Anthropic returned an empty response.");
      return { reply: text3, actualModel: options.model };
    }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: "system", content: options.systemInstruction },
          ...options.history.slice(-8).map((h) => ({
            role: h.role === "model" ? "assistant" : "user",
            content: h.text
          })),
          { role: "user", content: options.message }
        ]
      })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(coerceSafeErrorText(json?.error?.message ?? json?.error, `AI API failed (${res.status})`));
      err.status = res.status;
      throw err;
    }
    const text2 = extractAiReplyText(json?.choices?.[0]?.message?.content);
    if (!text2) throw new Error("AI API returned an empty response.");
    return { reply: text2, actualModel: options.model };
  } finally {
    clearTimeout(timer);
  }
}
app.get("/api/ai/providers", async (_req, res) => {
  try {
    const envFlags = getAiEnvFlags();
    const rows = await ensureDefaultAiProviders();
    res.json({
      providers: rows.map((r) => toPublicAiProviderView(r, envFlags)).filter((p) => p.isActive)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load AI providers" });
  }
});
app.get(
  "/api/admin/ai-providers",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (_req, res) => {
    try {
      const envFlags = getAiEnvFlags();
      const rows = await ensureDefaultAiProviders();
      res.json({
        aiProviders: rows.map((r) => toAdminAiProviderView(r, envFlags))
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load admin AI providers" });
    }
  }
);
app.put(
  "/api/admin/ai-providers",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().trim().min(2).max(80),
      providerType: z.enum([
        "foodora",
        "pollinations",
        "gemini",
        "openrouter",
        "openai",
        "groq",
        "deepseek",
        "anthropic",
        "mistral",
        "xai",
        "together",
        "cerebras",
        "perplexity",
        "cohere",
        "huggingface",
        "custom_openai"
      ]),
      model: z.string().trim().min(2).max(100),
      apiBaseUrl: z.string().trim().max(240).optional().default(""),
      apiKey: z.string().max(400).optional(),
      isActive: z.boolean().default(true),
      isDefault: z.boolean().default(false),
      sortOrder: z.number().int().min(1).max(100).optional().default(10)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid AI provider configuration"
      });
    }
    const code = normalizeAiProviderCode(parsed.data.code);
    if (code.length < 2) {
      return res.status(400).json({ error: "Provider code must be at least 2 characters." });
    }
    const isBuiltinNoExternalUrl = parsed.data.providerType === "gemini" || parsed.data.providerType === "foodora";
    const isKeylessProvider = isBuiltinNoExternalUrl || parsed.data.providerType === "pollinations";
    const resolvedBaseUrl = isBuiltinNoExternalUrl ? "" : parsed.data.apiBaseUrl || resolveDefaultBaseUrlForAiType(parsed.data.providerType);
    if (!isBuiltinNoExternalUrl && resolvedBaseUrl) {
      if (!isValidExternalAiBaseUrl(resolvedBaseUrl)) {
        return res.status(400).json({
          error: "API Base URL must be a valid public HTTPS endpoint."
        });
      }
    }
    try {
      await ensureDefaultAiProviders();
      const existing = await db.select().from(aiProviders).where(eq5(aiProviders.code, code)).limit(1);
      const cur = existing[0];
      let nextApiKey = "";
      if (!isKeylessProvider) {
        const incoming = parsed.data.apiKey;
        if (incoming === void 0) {
          nextApiKey = cur?.apiKey || "";
        } else {
          const clean = incoming.trim();
          nextApiKey = !clean || clean.startsWith("\u2022\u2022\u2022\u2022") ? cur?.apiKey || "" : clean;
        }
      }
      if (parsed.data.isDefault) {
        await db.update(aiProviders).set({ isDefault: false });
      }
      const nextValues = {
        code,
        name: parsed.data.name,
        providerType: parsed.data.providerType,
        model: parsed.data.model,
        apiBaseUrl: resolvedBaseUrl,
        apiKey: nextApiKey,
        isActive: parsed.data.isActive,
        isDefault: parsed.data.isDefault,
        sortOrder: parsed.data.sortOrder,
        updatedAt: /* @__PURE__ */ new Date()
      };
      const saved = await db.insert(aiProviders).values(nextValues).onConflictDoUpdate({
        target: aiProviders.code,
        set: nextValues
      }).returning();
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: cur ? "ai_provider_updated" : "ai_provider_created",
        targetType: "ai_provider",
        targetId: code,
        details: JSON.stringify({
          name: nextValues.name,
          providerType: nextValues.providerType,
          model: nextValues.model,
          isActive: nextValues.isActive,
          isDefault: nextValues.isDefault
        })
      });
      res.json({
        aiProvider: toAdminAiProviderView(saved[0], getAiEnvFlags())
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to save AI provider" });
    }
  }
);
app.post(
  "/api/admin/ai-providers/:code/test",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const code = normalizeAiProviderCode(String(req.params.code || ""));
    if (!code) return res.status(400).json({ error: "Invalid provider code" });
    try {
      await ensureDefaultAiProviders();
      const rows = await db.select().from(aiProviders).where(eq5(aiProviders.code, code)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "AI provider not found" });
      const row = rows[0];
      if (row.providerType === "foodora") {
        const ai = getGeminiHelpClient();
        if (ai) {
          try {
            const resp = await withTimeout(
              ai.models.generateContent({
                model: "gemini-4-hydrogen",
                contents: [{ role: "user", parts: [{ text: "Reply strictly with: OK" }] }]
              }),
              7e3,
              "gemini-4-hydrogen"
            );
            if ((resp.text || "").trim()) {
              return res.json({
                ok: true,
                message: "Foodora Own AI connected cleanly (Gemini 4 + Built-in Knowledge Engine).",
                model: row.model
              });
            }
          } catch {
          }
        }
        return res.json({
          ok: true,
          message: "Foodora Own AI built-in bilingual assistant is online and ready.",
          model: row.model
        });
      }
      if (row.providerType === "pollinations") {
        const { reply: reply2, actualModel: actualModel2 } = await callExternalAiProvider({
          providerType: "pollinations",
          model: row.model || "openai-fast",
          apiBaseUrl: row.apiBaseUrl || "https://text.pollinations.ai",
          apiKey: "",
          systemInstruction: "Reply strictly with OK.",
          history: [],
          message: "Reply strictly with: OK"
        });
        return res.json({
          ok: Boolean(reply2),
          message: `Connected cleanly to Pollinations Free AI (${actualModel2 || row.model}).`,
          model: actualModel2 || row.model
        });
      }
      if (row.providerType === "gemini") {
        const ai = getGeminiHelpClient();
        if (!ai) {
          return res.json({
            ok: false,
            message: "GEMINI_API_KEY is missing in Settings > Secrets.",
            model: row.model
          });
        }
        const testModel = row.model || "gemini-4-hydrogen";
        const resp = await withTimeout(
          ai.models.generateContent({
            model: testModel,
            contents: [{ role: "user", parts: [{ text: "Reply strictly with: OK" }] }]
          }),
          8e3,
          testModel
        );
        return res.json({
          ok: Boolean((resp.text || "").trim()),
          message: `Connected cleanly to Gemini (${testModel}).`,
          model: testModel
        });
      }
      const resolvedKey = (row.apiKey || "").trim() || getProviderEnvApiKey(row.providerType);
      if (!resolvedKey) {
        return res.json({
          ok: false,
          message: `No API key saved for ${row.name}. Add an API key first.`,
          model: row.model
        });
      }
      const { reply, actualModel } = await callExternalAiProvider({
        providerType: row.providerType,
        model: row.model,
        apiBaseUrl: row.apiBaseUrl || "",
        apiKey: resolvedKey,
        systemInstruction: "You are a concise health check responder.",
        history: [],
        message: "Reply strictly with: OK",
        refererOrigin: getRequestOrigin(req)
      });
      return res.json({
        ok: Boolean(reply),
        message: `Connected cleanly to ${row.name} (${actualModel || row.model}).`,
        model: actualModel || row.model
      });
    } catch (error) {
      const { message } = extractReadableGeminiError(error);
      return res.json({
        ok: false,
        message
      });
    }
  }
);
app.delete(
  "/api/admin/ai-providers/:code",
  requireAuth,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const code = normalizeAiProviderCode(String(req.params.code || ""));
    if (!code) return res.status(400).json({ error: "Invalid provider code" });
    if (code === "gemini" || code === "foodora") {
      return res.status(400).json({
        error: "Built-in Foodora AI and Google Gemini providers cannot be deleted. Disable instead."
      });
    }
    try {
      await db.delete(aiProviders).where(eq5(aiProviders.code, code));
      await db.insert(auditLogs).values({
        actorUid: req.user.uid,
        action: "ai_provider_deleted",
        targetType: "ai_provider",
        targetId: code,
        details: `Deleted custom AI Help provider ${code}`
      });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to delete AI provider" });
    }
  }
);
async function runGeminiHelpCompletion(params) {
  const ai = getGeminiHelpClient();
  if (!ai) {
    const missingErr = new Error("GEMINI_API_KEY is not configured");
    missingErr.status = 503;
    throw missingErr;
  }
  const contents = [
    ...params.history.slice(-8).map((item) => ({
      role: item.role,
      parts: [{ text: item.text }]
    })),
    {
      role: "user",
      parts: [{ text: params.message }]
    }
  ];
  const candidateModels = filterGeminiCandidateModels(params.preferredModel);
  let lastError = null;
  for (let i = 0; i < candidateModels.length; i += 1) {
    const modelName = candidateModels[i];
    try {
      const config = {
        systemInstruction: params.systemInstruction
      };
      if (modelName.startsWith("gemini-4")) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents,
          config
        }),
        9e3,
        modelName
      );
      const text2 = (response.text || "").trim();
      if (!text2) {
        const emptyErr = new Error("AI Help returned an empty response.");
        emptyErr.status = 502;
        throw emptyErr;
      }
      return { reply: text2, model: modelName };
    } catch (err) {
      lastError = err;
      if (i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  throw lastError || new Error("Gemini API unavailable");
}
app.post("/api/ai/help", optionalAuth, async (req, res) => {
  try {
    const parsed = aiHelpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid AI Help request payload."
      });
    }
    const { message, langPreference, uiLang, providerCode, history, context } = parsed.data;
    const systemInstruction = buildAiHelpSystemInstruction({
      langPreference,
      uiLang,
      area: context?.area,
      viewType: context?.viewType,
      activeOrderNumber: context?.activeOrderNumber
    });
    const allProviders = await ensureDefaultAiProviders();
    const activeProviders = allProviders.filter((p) => p.isActive);
    const envFlags = getAiEnvFlags();
    const normalizedRequestedCode = providerCode ? normalizeAiProviderCode(providerCode) : "";
    const chosenProvider = (normalizedRequestedCode ? activeProviders.find((p) => normalizeAiProviderCode(p.code) === normalizedRequestedCode) : void 0) || activeProviders.find((p) => p.isDefault && toPublicAiProviderView(p, envFlags).isConfigured) || activeProviders.find((p) => toPublicAiProviderView(p, envFlags).isConfigured) || activeProviders.find((p) => p.providerType === "foodora") || activeProviders.find((p) => p.providerType === "pollinations") || allProviders[0];
    const chosenType = chosenProvider?.providerType || "foodora";
    if (chosenType === "foodora") {
      const openRestaurants = await getApprovedRestaurants().catch(() => []);
      if (envFlags.hasGeminiKey) {
        try {
          const liveRestLine = openRestaurants.filter((r) => r.isOpen).slice(0, 6).map((r) => `${r.name} (${r.area} \xB7 ${r.cuisine})`).join(", ");
          const enrichedInstruction = liveRestLine ? `${systemInstruction}
Live Open Restaurants: ${liveRestLine}` : systemInstruction;
          const geminiOut2 = await runGeminiHelpCompletion({
            preferredModel: "gemini-4-hydrogen",
            systemInstruction: enrichedInstruction,
            history,
            message
          });
          return res.json({
            reply: geminiOut2.reply,
            model: "foodora-own-ai",
            providerCode: chosenProvider?.code || "foodora",
            providerName: chosenProvider?.name || "Foodora Own AI"
          });
        } catch {
        }
      }
      const fallbackReply = generateFoodoraOwnAiReply({
        message,
        langPreference,
        uiLang,
        area: context?.area,
        activeOrderNumber: context?.activeOrderNumber,
        openRestaurants: openRestaurants.filter((r) => r.isOpen).slice(0, 6).map((r) => ({ name: r.name, area: r.area, cuisine: r.cuisine }))
      });
      return res.json({
        reply: fallbackReply,
        model: chosenProvider?.model || "foodora-bd-assistant",
        providerCode: chosenProvider?.code || "foodora",
        providerName: chosenProvider?.name || "Foodora Own AI"
      });
    }
    if (chosenType === "pollinations") {
      const extRes = await callExternalAiProvider({
        providerType: "pollinations",
        model: chosenProvider?.model || "openai-fast",
        apiBaseUrl: chosenProvider?.apiBaseUrl || "https://text.pollinations.ai",
        apiKey: "",
        systemInstruction,
        history,
        message,
        refererOrigin: getRequestOrigin(req)
      });
      return res.json({
        reply: extRes.reply,
        model: extRes.actualModel || chosenProvider?.model || "openai-fast",
        providerCode: chosenProvider?.code || "pollinations",
        providerName: chosenProvider?.name || "Pollinations Free AI"
      });
    }
    if (chosenProvider && chosenType !== "gemini") {
      const apiKey = (chosenProvider.apiKey || "").trim() || getProviderEnvApiKey(chosenType);
      if (!apiKey && chosenType === "openrouter" && envFlags.hasGeminiKey) {
        const geminiOut2 = await runGeminiHelpCompletion({
          preferredModel: "gemini-4-hydrogen",
          systemInstruction,
          history,
          message
        });
        return res.json({
          reply: geminiOut2.reply,
          model: geminiOut2.model,
          providerCode: chosenProvider.code,
          providerName: `${chosenProvider.name} (Gemini 4 Route)`
        });
      }
      if (!apiKey) {
        return res.status(503).json({
          error: `${chosenProvider.name} requires an API key in Super Admin > Backend Control. Switch to Foodora Own AI or Pollinations Free AI to chat instantly.`,
          suggestedFallback: "foodora"
        });
      }
      const extRes = await callExternalAiProvider({
        providerType: chosenType,
        model: chosenProvider.model,
        apiBaseUrl: chosenProvider.apiBaseUrl || "",
        apiKey,
        systemInstruction,
        history,
        message,
        refererOrigin: getRequestOrigin(req)
      });
      return res.json({
        reply: extRes.reply,
        model: extRes.actualModel || chosenProvider.model,
        providerCode: chosenProvider.code,
        providerName: chosenProvider.name,
        ...extRes.reasoningDetails !== void 0 ? { reasoningDetails: extRes.reasoningDetails } : {}
      });
    }
    if (!envFlags.hasGeminiKey) {
      return res.status(503).json({
        error: "Google Gemini requires GEMINI_API_KEY in Settings > Secrets, or switch AI Engine to Foodora Own AI / Pollinations Free AI.",
        suggestedFallback: "foodora"
      });
    }
    const geminiOut = await runGeminiHelpCompletion({
      preferredModel: chosenProvider?.model?.trim() || "gemini-4-hydrogen",
      systemInstruction,
      history,
      message
    });
    return res.json({
      reply: geminiOut.reply,
      model: geminiOut.model,
      providerCode: chosenProvider?.code || "gemini",
      providerName: chosenProvider?.name || "Google Gemini 4"
    });
  } catch (err) {
    const { status, message } = extractReadableGeminiError(err);
    console.error("POST /api/ai/help error:", message);
    return res.status(status).json({
      error: message,
      suggestedFallback: "foodora"
    });
  }
});
async function startServer() {
  const port = Number(process.env.PORT || 3e3);
  if (process.env.NODE_ENV !== "production") {
    const vitePkg = "vite";
    const { createServer } = await import(
      /* @vite-ignore */
      vitePkg
    );
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(PROJECT_ROOT, "dist");
    if (fs2.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", async (_req, res) => {
        const indexPath = path2.join(distPath, "index.html");
        try {
          let html = fs2.readFileSync(indexPath, "utf8");
          const settings = hasDatabaseConfig() ? await getPlatformSettingsRow().catch(() => null) : null;
          const sc = mergeStorefrontConfig(settings?.storefrontConfig);
          const token = (sc.googleSiteVerification || process.env.GOOGLE_SITE_VERIFICATION || "").trim();
          if (token && !html.includes('name="google-site-verification"')) {
            const safeToken = token.replace(/["<>]/g, "");
            html = html.replace(
              "</head>",
              `  <meta name="google-site-verification" content="${safeToken}" />
  </head>`
            );
          }
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(html);
        } catch {
          return res.sendFile(indexPath);
        }
      });
    }
  }
  const httpServer = http.createServer(app);
  initRealtimeWebSocketServer(httpServer);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Foodora BD server (HTTP + WS) listening on http://0.0.0.0:${port}`);
  });
}
var isServerless = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION || path2.basename(__dirname) === "api"
);
if (!isServerless) {
  startServer();
}
var server_default = app;
export {
  app,
  server_default as default
};
