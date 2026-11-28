import { sql } from 'drizzle-orm';
import { db } from './index.ts';

let schemaPromise: Promise<void> | null = null;

export async function ensureSchemaTables(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = runCreateTablesIfMissing().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

const EXPECTED_TABLES = [
  'users',
  'local_credentials',
  'customer_addresses',
  'restaurants',
  'food_items',
  'partner_api_keys',
  'payment_gateways',
  'coupons',
  'orders',
  'order_status_history',
  'order_email_logs',
  'commission_ledger',
  'restaurant_payouts',
  'riders',
  'reviews',
  'favorites',
  'notifications',
  'platform_settings',
  'audit_logs',
  'rider_jobs',
  'rider_job_applications',
  'vendor_admin_messages',
  'ai_providers',
  'payment_transactions',
  'rider_wallet_ledger',
] as const;

async function runCreateTablesIfMissing(): Promise<void> {
  const existingRes = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existingSet = new Set(
    ((existingRes as { rows?: Array<{ table_name?: string }> }).rows ?? []).map((r) =>
      String(r.table_name || '')
    )
  );

  const missingTables = EXPECTED_TABLES.filter((t) => !existingSet.has(t));
  try {
    if (missingTables.length > 0) {
      await createMissingTables(existingSet);
    }
    if (existingSet.has('food_items')) {
      await db.execute(sql`
        ALTER TABLE food_items
        ADD COLUMN IF NOT EXISTS is_visible_on_storefront BOOLEAN NOT NULL DEFAULT TRUE;
      `);
    }
    if (existingSet.has('orders')) {
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
    if (existingSet.has('platform_settings')) {
      await db.execute(sql`
        ALTER TABLE platform_settings
        ADD COLUMN IF NOT EXISTS delivery_financial_config JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);
    }
    if (existingSet.has('riders')) {
      await db.execute(sql`
        ALTER TABLE riders
        ADD COLUMN IF NOT EXISTS restaurant_id INTEGER,
        ADD COLUMN IF NOT EXISTS added_by_uid TEXT NOT NULL DEFAULT '';
      `);
    }
  } catch (err: any) {
    const code = err?.code || err?.cause?.code;
    if (code === '42501') {
      console.warn(
        `Skipping runtime DDL creation (role lacks CREATE/ALTER on schema public). Missing tables: ${missingTables.join(', ')}`
      );
      return;
    }
    throw err;
  }
}

async function createMissingTables(existingSet: Set<string>): Promise<void> {

  if (!existingSet.has('users')) {
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

  if (!existingSet.has('local_credentials')) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS local_credentials (
        email TEXT PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  if (!existingSet.has('customer_addresses')) {
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

  if (!existingSet.has('restaurants')) {
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

  if (!existingSet.has('food_items')) {
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

  if (!existingSet.has('partner_api_keys')) {
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

  if (!existingSet.has('payment_gateways')) {
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

  if (!existingSet.has('coupons')) {
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

  if (!existingSet.has('orders')) {
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

  if (!existingSet.has('order_status_history')) {
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

  if (!existingSet.has('order_email_logs')) {
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

  if (!existingSet.has('commission_ledger')) {
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

  if (!existingSet.has('restaurant_payouts')) {
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

  if (!existingSet.has('riders')) {
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

  if (!existingSet.has('reviews')) {
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

  if (!existingSet.has('favorites')) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        customer_uid TEXT NOT NULL,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  if (!existingSet.has('notifications')) {
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

  if (!existingSet.has('platform_settings')) {
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

  if (!existingSet.has('audit_logs')) {
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

  if (!existingSet.has('rider_jobs')) {
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

  if (!existingSet.has('rider_job_applications')) {
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

  if (!existingSet.has('vendor_admin_messages')) {
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

  if (!existingSet.has('ai_providers')) {
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

  if (!existingSet.has('payment_transactions')) {
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

  if (!existingSet.has('rider_wallet_ledger')) {
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
