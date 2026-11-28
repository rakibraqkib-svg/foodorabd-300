import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { foodItems, localCredentials, orderEmailLogs, users } from '../db/schema.ts';
import {
  buildMerchantOrderAlertEmailPayload,
  buildOrderTrackingEmailPayload,
  collectMerchantOrderAlertRecipients,
  DEFAULT_ORDER_EMAIL_IMAGE_PATH,
  extractEmailInlineCidPlan,
  getOrderEmailTemplatePreview,
  PRIMARY_SUPER_ADMIN_EMAIL,
  type ExtractedEmailCidImage,
} from '../lib/marketplace-logic.ts';

const EMAIL_CONFIG_KEY = '__email_transport_config__';
const EMAIL_CONFIG_UID = 'sys-email-transport-config';

export interface EmailTransportStatus {
  configured: boolean;
  provider: 'smtp' | 'resend' | 'in_app_email_log';
  fromAddress: string;
  source?: 'database' | 'env' | 'none';
}

export interface AdminEmailSettingsView {
  provider: 'gmail' | 'smtp' | 'resend';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  fromAddress: string;
  notifyEmail?: string;
  hasSmtpPass: boolean;
  smtpPassPreview: string;
  hasResendKey: boolean;
  resendKeyPreview: string;
  configured: boolean;
  activeProvider: 'smtp' | 'resend' | 'in_app_email_log';
  source: 'database' | 'env' | 'none';
}

interface StoredEmailConfig {
  provider: 'gmail' | 'smtp' | 'resend';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassEnc?: string;
  fromAddress: string;
  notifyEmail?: string;
  resendApiKeyEnc?: string;
  updatedAt?: string;
}

interface ResolvedEmailConfig {
  providerMode: 'gmail' | 'smtp' | 'resend';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  resendKey: string;
  source: 'database' | 'env' | 'none';
}

function deriveEncryptionKey(): Buffer {
  const secret =
    process.env.FOODORA_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DATABASE_URL ||
    'foodora-bd-email-config-key-v1';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(plain: string): string {
  const clean = plain.trim();
  if (!clean) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(encoded?: string): string {
  if (!encoded || !encoded.startsWith('v1:')) return '';
  try {
    const [, ivHex, tagHex, dataHex] = encoded.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveEncryptionKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
}

function maskSecret(val: string): string {
  const clean = val.trim();
  if (!clean) return '';
  if (clean.length <= 4) return '••••';
  return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
}

function normalizeSmtpPassword(providerOrHost: string, rawPass: string): string {
  const trimmed = String(rawPass || '').trim();
  if (!trimmed) return '';
  if (providerOrHost.toLowerCase().includes('gmail')) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

function createSmtpTransporter(params: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}) {
  return nodemailer.createTransport({
    host: params.host,
    port: Number.isFinite(params.port) ? params.port : 465,
    secure: params.secure,
    auth: {
      user: params.user,
      pass: params.pass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 9000,
    greetingTimeout: 9000,
    socketTimeout: 12000,
  });
}

function formatSmtpFriendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'SMTP error');
  const lower = raw.toLowerCase();
  if (lower.includes('535') || lower.includes('invalid login') || lower.includes('username and password not accepted')) {
    return 'Gmail/SMTP rejected username or password. Enable 2-Step Verification and use a 16-character Google App Password.';
  }
  if (lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('timeout')) {
    return `Could not reach SMTP server (${raw}). Try switching port 465 (SSL) <-> 587 (STARTTLS).`;
  }
  return raw;
}

export async function resolveCustomerEmailForOrder(
  orderCustomerEmail?: string | null,
  customerUid?: string | null
): Promise<string | null> {
  const direct = String(orderCustomerEmail || '').trim().toLowerCase();
  if (direct && direct.includes('@') && !direct.endsWith('.local')) {
    return direct;
  }
  const uid = String(customerUid || '').trim();
  if (!uid || uid.startsWith('guest-')) return null;
  try {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    const candidate = String(rows[0]?.email || '').trim().toLowerCase();
    if (candidate && candidate.includes('@') && !candidate.endsWith('.local')) {
      return candidate;
    }
  } catch {
    // ignore lookup failures
  }
  return null;
}

async function readStoredConfig(): Promise<StoredEmailConfig | null> {
  try {
    const rows = await db
      .select({ passwordHash: localCredentials.passwordHash })
      .from(localCredentials)
      .where(eq(localCredentials.email, EMAIL_CONFIG_KEY))
      .limit(1);
    if (!rows[0]?.passwordHash) return null;
    const parsed = JSON.parse(rows[0].passwordHash) as StoredEmailConfig;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function resolveEffectiveConfig(): Promise<ResolvedEmailConfig> {
  const stored = await readStoredConfig();
  if (stored) {
    const smtpHost =
      stored.provider === 'gmail'
        ? 'smtp.gmail.com'
        : (stored.smtpHost || '').trim();
    const smtpPass = normalizeSmtpPassword(
      stored.provider === 'gmail' ? 'gmail' : smtpHost,
      decryptSecret(stored.smtpPassEnc)
    );
    const resendKey = decryptSecret(stored.resendApiKeyEnc);
    const smtpPort = Number(stored.smtpPort) || (stored.provider === 'gmail' ? 465 : 587);
    const smtpSecure =
      stored.provider === 'gmail' ? smtpPort === 465 : Boolean(stored.smtpSecure ?? smtpPort === 465);
    const smtpUser = (stored.smtpUser || '').trim();
    const defaultFrom =
      stored.provider === 'resend'
        ? 'Foodora BD <onboarding@resend.dev>'
        : smtpUser
        ? `Foodora BD <${smtpUser}>`
        : 'Foodora BD <orders@foodora.bd>';
    const fromAddress = (stored.fromAddress || defaultFrom).trim();

    if (
      (stored.provider === 'resend' && resendKey) ||
      ((stored.provider === 'gmail' || stored.provider === 'smtp') && smtpHost && smtpUser && smtpPass)
    ) {
      return {
        providerMode: stored.provider,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
        fromAddress,
        resendKey,
        source: 'database',
      };
    }
  }

  const envSmtpHost = (process.env.SMTP_HOST || '').trim();
  const envSmtpUser = (process.env.SMTP_USER || '').trim();
  const envSmtpPass = normalizeSmtpPassword(envSmtpHost, process.env.SMTP_PASS || '');
  const envSmtpPort = Number(process.env.SMTP_PORT || 587);
  const envSmtpSecure =
    process.env.SMTP_SECURE === 'true' || (!process.env.SMTP_SECURE && envSmtpPort === 465);
  const envResendKey = (
    process.env.RESEND_API_KEY ||
    process.env.EMAIL_PROVIDER_API_KEY ||
    ''
  ).trim();

  if (envSmtpHost && envSmtpUser && envSmtpPass) {
    return {
      providerMode: envSmtpHost.includes('gmail') ? 'gmail' : 'smtp',
      smtpHost: envSmtpHost,
      smtpPort: Number.isFinite(envSmtpPort) ? envSmtpPort : 587,
      smtpSecure: envSmtpSecure,
      smtpUser: envSmtpUser,
      smtpPass: envSmtpPass,
      fromAddress: (process.env.SMTP_FROM || `Foodora BD <${envSmtpUser}>`).trim(),
      resendKey: envResendKey,
      source: 'env',
    };
  }

  if (envResendKey) {
    return {
      providerMode: 'resend',
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      fromAddress: (process.env.RESEND_FROM_EMAIL || 'Foodora BD <onboarding@resend.dev>').trim(),
      resendKey: envResendKey,
      source: 'env',
    };
  }

  return {
    providerMode: stored?.provider || 'gmail',
    smtpHost: stored?.smtpHost || 'smtp.gmail.com',
    smtpPort: stored?.smtpPort || 465,
    smtpSecure: stored?.smtpSecure ?? true,
    smtpUser: stored?.smtpUser || '',
    smtpPass: '',
    fromAddress: stored?.fromAddress || 'Foodora BD <orders@foodora.bd>',
    resendKey: '',
    source: 'none',
  };
}

export async function getEmailTransportStatus(): Promise<EmailTransportStatus> {
  const cfg = await resolveEffectiveConfig();
  if (cfg.source !== 'none') {
    if (cfg.providerMode === 'resend' && cfg.resendKey) {
      return {
        configured: true,
        provider: 'resend',
        fromAddress: cfg.fromAddress,
        source: cfg.source,
      };
    }
    if (cfg.smtpHost && cfg.smtpUser && cfg.smtpPass) {
      return {
        configured: true,
        provider: 'smtp',
        fromAddress: cfg.fromAddress,
        source: cfg.source,
      };
    }
  }
  return {
    configured: false,
    provider: 'in_app_email_log',
    fromAddress: 'Foodora BD <orders@foodora.bd>',
    source: 'none',
  };
}

export async function getAdminEmailSettingsView(): Promise<AdminEmailSettingsView> {
  const [stored, effective, status] = await Promise.all([
    readStoredConfig(),
    resolveEffectiveConfig(),
    getEmailTransportStatus(),
  ]);
  const storedPass = decryptSecret(stored?.smtpPassEnc);
  const storedResend = decryptSecret(stored?.resendApiKeyEnc);
  const effectivePass = storedPass || effective.smtpPass;
  const effectiveResend = storedResend || effective.resendKey;

  return {
    provider: stored?.provider || effective.providerMode || 'gmail',
    smtpHost: stored?.smtpHost || effective.smtpHost || 'smtp.gmail.com',
    smtpPort: stored?.smtpPort || effective.smtpPort || 465,
    smtpSecure: stored ? Boolean(stored.smtpSecure) : Boolean(effective.smtpSecure),
    smtpUser: stored?.smtpUser || effective.smtpUser || '',
    fromAddress: stored?.fromAddress || effective.fromAddress || 'Foodora BD <orders@foodora.bd>',
    notifyEmail:
      stored?.notifyEmail ||
      (process.env.ORDER_ALERT_NOTIFY_EMAIL || '').trim() ||
      PRIMARY_SUPER_ADMIN_EMAIL,
    hasSmtpPass: Boolean(effectivePass),
    smtpPassPreview: maskSecret(effectivePass),
    hasResendKey: Boolean(effectiveResend),
    resendKeyPreview: maskSecret(effectiveResend),
    configured: status.configured,
    activeProvider: status.provider,
    source: effective.source,
  };
}

export async function saveAdminEmailSettings(input: {
  provider: 'gmail' | 'smtp' | 'resend';
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
  notifyEmail?: string;
  resendApiKey?: string;
}): Promise<AdminEmailSettingsView> {
  const prev = await readStoredConfig();
  const provider = input.provider || 'gmail';
  const smtpHost =
    provider === 'gmail'
      ? 'smtp.gmail.com'
      : (input.smtpHost ?? prev?.smtpHost ?? '').trim();
  const smtpPort = Number(
    input.smtpPort ?? prev?.smtpPort ?? (provider === 'gmail' ? 465 : 587)
  );
  const smtpSecure =
    typeof input.smtpSecure === 'boolean'
      ? input.smtpSecure
      : provider === 'gmail'
      ? smtpPort === 465
      : smtpPort === 465;
  const smtpUser = (input.smtpUser ?? prev?.smtpUser ?? '').trim();
  const rawFromAddress = (
    input.fromAddress ??
    prev?.fromAddress ??
    ''
  ).trim();
  const fromAddress =
    provider === 'resend'
      ? !rawFromAddress || rawFromAddress.toLowerCase().includes('@foodora.bd')
        ? 'Foodora BD <onboarding@resend.dev>'
        : rawFromAddress
      : rawFromAddress || (smtpUser ? `Foodora BD <${smtpUser}>` : 'Foodora BD <orders@foodora.bd>');
  const notifyEmail = (
    input.notifyEmail !== undefined
      ? input.notifyEmail
      : prev?.notifyEmail ?? PRIMARY_SUPER_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();

  const cleanedSmtpPass =
    input.smtpPass !== undefined && input.smtpPass.trim() !== ''
      ? normalizeSmtpPassword(provider === 'gmail' ? 'gmail' : smtpHost, input.smtpPass)
      : '';
  const nextSmtpPassEnc = cleanedSmtpPass
    ? encryptSecret(cleanedSmtpPass)
    : prev?.smtpPassEnc || '';
  const nextResendKeyEnc =
    input.resendApiKey !== undefined && input.resendApiKey.trim() !== ''
      ? encryptSecret(input.resendApiKey.trim())
      : prev?.resendApiKeyEnc || '';

  const payload: StoredEmailConfig = {
    provider,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure,
    smtpUser,
    smtpPassEnc: nextSmtpPassEnc,
    fromAddress,
    notifyEmail,
    resendApiKeyEnc: nextResendKeyEnc,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(localCredentials)
    .values({
      email: EMAIL_CONFIG_KEY,
      uid: EMAIL_CONFIG_UID,
      passwordHash: JSON.stringify(payload),
    })
    .onConflictDoUpdate({
      target: localCredentials.email,
      set: { passwordHash: JSON.stringify(payload) },
    });

  return getAdminEmailSettingsView();
}

export async function verifyEmailTransportConnection(): Promise<{
  ok: boolean;
  provider: 'smtp' | 'resend' | 'in_app_email_log';
  portUsed?: number;
  message: string;
  error?: string;
}> {
  const cfg = await resolveEffectiveConfig();
  if (cfg.providerMode === 'resend' && cfg.resendKey) {
    try {
      const checkRes = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.resendKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (checkRes.ok) {
        const data = (await checkRes.json().catch(() => ({}))) as {
          data?: Array<{ name?: string; status?: string }>;
        };
        const verifiedDomains = (data.data || [])
          .filter((d) => d.status === 'verified' && d.name)
          .map((d) => d.name as string);
        return {
          ok: true,
          provider: 'resend',
          message:
            verifiedDomains.length > 0
              ? `Resend API key verified (${verifiedDomains.join(', ')}).`
              : 'Resend API key verified (using Foodora BD <onboarding@resend.dev> sender).',
        };
      }
      const errBody = await checkRes.text().catch(() => '');
      if (errBody.toLowerCase().includes('restricted to only send emails')) {
        return {
          ok: true,
          provider: 'resend',
          message: 'Resend send-only API key saved. Click "Send Test Email" to verify inbox delivery.',
        };
      }
      return {
        ok: false,
        provider: 'resend',
        message: 'Resend API key verification failed.',
        error: errBody || `Resend returned HTTP ${checkRes.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'resend',
        message: 'Could not reach Resend API.',
        error: err instanceof Error ? err.message : 'Network error verifying Resend key',
      };
    }
  }
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
    return {
      ok: false,
      provider: 'in_app_email_log',
      message: 'SMTP credentials not saved yet.',
      error: 'Enter Gmail/SMTP username and password in Admin -> Backend Control first.',
    };
  }

  const attempts: Array<{ port: number; secure: boolean }> = [
    { port: Number.isFinite(cfg.smtpPort) ? cfg.smtpPort : 465, secure: cfg.smtpSecure },
  ];
  const altPort = cfg.smtpPort === 465 ? 587 : 465;
  attempts.push({ port: altPort, secure: altPort === 465 });

  let lastError = '';
  for (const attempt of attempts) {
    try {
      const transporter = createSmtpTransporter({
        host: cfg.smtpHost,
        port: attempt.port,
        secure: attempt.secure,
        user: cfg.smtpUser,
        pass: cfg.smtpPass,
      });
      await transporter.verify();
      return {
        ok: true,
        provider: 'smtp',
        portUsed: attempt.port,
        message: `SMTP connection verified (${cfg.smtpHost}:${attempt.port} ${attempt.secure ? 'SSL' : 'STARTTLS'} as ${cfg.smtpUser}).`,
      };
    } catch (err) {
      lastError = formatSmtpFriendlyError(err);
      if (lastError.toLowerCase().includes('rejected username or password')) {
        break;
      }
    }
  }

  return {
    ok: false,
    provider: 'smtp',
    message: 'SMTP verification failed.',
    error: lastError || 'Could not authenticate with SMTP server.',
  };
}

const UPLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'foodora-uploads')
  : path.resolve(process.cwd(), 'public', 'uploads');

export interface PreparedEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

function inferMimeAndExtension(filePath: string): { contentType: string; ext: string } | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return { contentType: 'image/jpeg', ext: '.jpg' };
  if (ext === '.png') return { contentType: 'image/png', ext: '.png' };
  if (ext === '.webp') return { contentType: 'image/webp', ext: '.webp' };
  if (ext === '.gif') return { contentType: 'image/gif', ext: '.gif' };
  return null;
}

function safeResolveWithinRoots(relPath: string, roots: string[]): string | null {
  const cleanRel = relPath.replace(/^\/+/, '');
  if (!cleanRel || cleanRel.includes('\0')) return null;
  for (const root of roots) {
    const absRoot = path.resolve(root);
    const candidate = path.resolve(absRoot, cleanRel);
    if (
      candidate.startsWith(absRoot + path.sep) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }
  return null;
}

function resolveFallbackFoodImageBuffer(): {
  filename: string;
  content: Buffer;
  contentType: string;
} | null {
  const relFallback = DEFAULT_ORDER_EMAIL_IMAGE_PATH.replace(/^\/src\/assets\//, '');
  const resolved = safeResolveWithinRoots(relFallback, [
    path.resolve(process.cwd(), 'src', 'assets'),
    path.resolve(process.cwd(), 'dist', 'src', 'assets'),
    path.resolve(process.cwd(), 'public', 'assets'),
  ]);
  if (!resolved) return null;
  try {
    return {
      filename: path.basename(resolved),
      content: fs.readFileSync(resolved),
      contentType: 'image/jpeg',
    };
  } catch {
    return null;
  }
}

function buildOriginFallbackImageUrl(srcUrl?: string): string | null {
  if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) return null;
  try {
    const parsed = new URL(srcUrl);
    return `${parsed.origin}${DEFAULT_ORDER_EMAIL_IMAGE_PATH}`;
  } catch {
    return null;
  }
}

async function fetchRemoteImageAsBuffer(
  imageUrl: string,
  cid: string
): Promise<PreparedEmailAttachment | null> {
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const rawType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    const normalizedType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
    if (!normalizedType.startsWith('image/')) return null;
    const arrBuf = await res.arrayBuffer();
    if (!arrBuf || arrBuf.byteLength === 0 || arrBuf.byteLength > 5 * 1024 * 1024) {
      return null;
    }
    const ext = extMap[normalizedType] || '.jpg';
    return {
      filename: `${cid}${ext}`,
      content: Buffer.from(arrBuf),
      contentType: normalizedType,
      cid,
    };
  } catch {
    return null;
  }
}

function resolveDiskOrDataCidAttachment(
  entry: ExtractedEmailCidImage,
  allowFallback: boolean
): PreparedEmailAttachment | null {
  if (entry.kind === 'data' && entry.dataBase64 && entry.dataMimeType) {
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    const ext = extMap[entry.dataMimeType] || '.jpg';
    return {
      filename: `${entry.cid}${ext}`,
      content: Buffer.from(entry.dataBase64, 'base64'),
      contentType: entry.dataMimeType,
      cid: entry.cid,
    };
  }

  const localPath = entry.localPath || '';
  let resolvedDiskPath: string | null = null;
  if (localPath.startsWith('/uploads/')) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/uploads\//, ''), [UPLOADS_DIR]);
  } else if (localPath.startsWith('/src/assets/')) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/src\/assets\//, ''), [
      path.resolve(process.cwd(), 'src', 'assets'),
      path.resolve(process.cwd(), 'dist', 'src', 'assets'),
      path.resolve(process.cwd(), 'public', 'assets'),
    ]);
  } else if (localPath.startsWith('/assets/')) {
    resolvedDiskPath = safeResolveWithinRoots(localPath.replace(/^\/assets\//, ''), [
      path.resolve(process.cwd(), 'public', 'assets'),
      path.resolve(process.cwd(), 'src', 'assets'),
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
          cid: entry.cid,
        };
      } catch {
        // fall through
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
    cid: entry.cid,
  };
}

export function prepareEmailWithInlineCidAttachments(html: string): {
  html: string;
  attachments: PreparedEmailAttachment[];
} {
  const plan = extractEmailInlineCidPlan(html);
  if (plan.images.length === 0) {
    return { html, attachments: [] };
  }
  const attachments: PreparedEmailAttachment[] = [];
  let finalHtml = plan.html;

  for (const entry of plan.images) {
    const resolved = resolveDiskOrDataCidAttachment(entry, true);
    if (resolved) {
      attachments.push(resolved);
    } else if (entry.originalSrcs[0]) {
      finalHtml = finalHtml.replaceAll(`cid:${entry.cid}`, entry.originalSrcs[0]);
    }
  }

  return { html: finalHtml, attachments };
}

export async function prepareEmailWithInlineCidAttachmentsAsync(html: string): Promise<{
  html: string;
  attachments: PreparedEmailAttachment[];
}> {
  const plan = extractEmailInlineCidPlan(html);
  if (plan.images.length === 0) {
    return { html, attachments: [] };
  }
  const attachments: PreparedEmailAttachment[] = [];
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
          cid: entry.cid,
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

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{
  ok: boolean;
  provider: 'smtp' | 'resend' | 'in_app_email_log';
  status: string;
  error?: string;
}> {
  const emailLower = String(params.to || '').trim().toLowerCase();
  if (!emailLower || !emailLower.includes('@')) {
    return {
      ok: false,
      provider: 'in_app_email_log',
      status: 'invalid_recipient',
      error: 'Invalid recipient email address.',
    };
  }

  const cfg = await resolveEffectiveConfig();
  const prepared = await prepareEmailWithInlineCidAttachmentsAsync(params.html);
  let lastSmtpError = '';

  if (
    (cfg.providerMode === 'gmail' || cfg.providerMode === 'smtp') &&
    cfg.smtpHost &&
    cfg.smtpUser &&
    cfg.smtpPass
  ) {
    const attempts: Array<{ port: number; secure: boolean }> = [
      { port: Number.isFinite(cfg.smtpPort) ? cfg.smtpPort : 465, secure: cfg.smtpSecure },
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
          pass: cfg.smtpPass,
        });
        await transporter.sendMail({
          from: cfg.fromAddress || `Foodora BD <${cfg.smtpUser}>`,
          to: emailLower,
          subject: params.subject,
          text: params.text,
          html: prepared.html,
          ...(prepared.attachments.length > 0
            ? {
                attachments: prepared.attachments.map((att) => ({
                  filename: att.filename,
                  content: att.content,
                  contentType: att.contentType,
                  cid: att.cid,
                })),
              }
            : {}),
        });
        return { ok: true, provider: 'smtp', status: 'sent' };
      } catch (err) {
        lastSmtpError = formatSmtpFriendlyError(err);
        if (lastSmtpError.toLowerCase().includes('rejected username or password')) {
          break;
        }
      }
    }
    console.warn('SMTP email dispatch failed:', lastSmtpError);
    if (!cfg.resendKey) {
      return {
        ok: false,
        provider: 'smtp',
        status: `smtp_error: ${lastSmtpError.slice(0, 120)}`,
        error: lastSmtpError,
      };
    }
  }

  if (cfg.resendKey) {
    const primaryFrom = cfg.fromAddress || 'Foodora BD <onboarding@resend.dev>';
    const resendAttachments =
      prepared.attachments.length > 0
        ? prepared.attachments.map((att) => ({
            filename: att.filename,
            content: att.content.toString('base64'),
            content_id: att.cid,
          }))
        : undefined;
    const sendViaResend = async (fromAddr: string) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [emailLower],
          subject: params.subject,
          html: prepared.html,
          text: params.text,
          ...(resendAttachments ? { attachments: resendAttachments } : {}),
        }),
        signal: AbortSignal.timeout(12000),
      });

    try {
      let mailRes = await sendViaResend(primaryFrom);
      if (!mailRes.ok && mailRes.status === 403 && !primaryFrom.includes('resend.dev')) {
        const firstErr = await mailRes.text().catch(() => '');
        if (firstErr.toLowerCase().includes('domain is not verified')) {
          mailRes = await sendViaResend('Foodora BD <onboarding@resend.dev>');
        } else {
          return {
            ok: false,
            provider: 'resend',
            status: 'resend_error_http_403',
            error: firstErr || lastSmtpError || 'Resend returned HTTP 403',
          };
        }
      }
      if (mailRes.ok) {
        return { ok: true, provider: 'resend', status: 'sent' };
      }
      const errText = await mailRes.text().catch(() => '');
      return {
        ok: false,
        provider: 'resend',
        status: `resend_error_http_${mailRes.status}`,
        error: errText || lastSmtpError || `Resend returned HTTP ${mailRes.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resend request timed out';
      return {
        ok: false,
        provider: 'resend',
        status: `resend_error: ${message.slice(0, 120)}`,
        error: lastSmtpError ? `${lastSmtpError} | Resend: ${message}` : message,
      };
    }
  }

  return {
    ok: false,
    provider: 'in_app_email_log',
    status: 'not_configured',
    error: 'Gmail SMTP or Resend API Key is not configured yet in Admin -> Backend Control.',
  };
}

export async function sendTestEmail(
  toEmail: string,
  templateStatus: string = 'confirmed',
  origin?: string
) {
  const cleanEmail = String(toEmail || '').trim().toLowerCase();
  const payload = getOrderEmailTemplatePreview(
    templateStatus || 'confirmed',
    origin || process.env.PUBLIC_APP_URL || 'https://foodora.bd',
    cleanEmail
  );

  return sendTransactionalEmail({
    to: cleanEmail,
    subject: `[TEST] ${payload.subject}`,
    html: payload.html,
    text: payload.text,
  });
}

export async function getRecentOrderEmailLogs(limit = 30) {
  return db
    .select({
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
      sentAt: orderEmailLogs.sentAt,
    })
    .from(orderEmailLogs)
    .orderBy(desc(orderEmailLogs.sentAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

export async function resendOrderEmailLog(logId: number) {
  const rows = await db
    .select()
    .from(orderEmailLogs)
    .where(eq(orderEmailLogs.id, logId))
    .limit(1);
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const html = row.htmlPreview || `<p>${row.subject}</p><p><a href="${row.trackingUrl}">${row.trackingUrl}</a></p>`;
  const text = `${row.subject}\nTrack order: ${row.trackingUrl}`;
  const dispatchResult = await sendTransactionalEmail({
    to: row.recipientEmail,
    subject: row.subject,
    html,
    text,
  });

  const updated = await db
    .update(orderEmailLogs)
    .set({
      deliveryProvider: dispatchResult.provider,
      providerStatus: dispatchResult.status,
      sentAt: new Date(),
    })
    .where(eq(orderEmailLogs.id, row.id))
    .returning();

  return {
    ok: dispatchResult.ok,
    dispatchResult,
    log: updated[0] ?? row,
  };
}

async function enrichOrderEmailItemsWithImages<
  T extends { foodItemId?: number; imageUrl?: string | null },
>(items?: T[]): Promise<T[] | undefined> {
  if (!Array.isArray(items) || items.length === 0) return items;
  let next = [...items];

  const missingIds = Array.from(
    new Set(
      next
        .filter((it) => !it.imageUrl && typeof it.foodItemId === 'number')
        .map((it) => it.foodItemId as number)
    )
  );
  if (missingIds.length > 0) {
    try {
      const dbFoods = await db
        .select({ id: foodItems.id, imageUrl: foodItems.imageUrl })
        .from(foodItems)
        .where(inArray(foodItems.id, missingIds));
      const imgMap = new Map(dbFoods.map((f) => [f.id, f.imageUrl]));
      next = next.map((it) =>
        !it.imageUrl && typeof it.foodItemId === 'number'
          ? { ...it, imageUrl: imgMap.get(it.foodItemId) || it.imageUrl }
          : it
      );
    } catch {
      // non-blocking
    }
  }

  return next.map((it) => {
    const raw = String(it.imageUrl || '').trim();
    const isMissingUpload =
      raw.startsWith('/uploads/') &&
      !safeResolveWithinRoots(raw.replace(/^\/uploads\//, ''), [UPLOADS_DIR]);
    if (!raw || isMissingUpload) {
      return { ...it, imageUrl: DEFAULT_ORDER_EMAIL_IMAGE_PATH };
    }
    return it;
  });
}

export async function sendAndLogOrderTrackingEmail(params: {
  origin: string;
  orderId: number;
  orderNumber: string;
  trackingToken?: string | null;
  customerName: string;
  customerEmail: string;
  restaurantName: string;
  deliveryArea: string;
  deliveryAddress?: string | null;
  subtotal?: number | null;
  discountAmount?: number | null;
  couponCode?: string | null;
  deliveryFee?: number | null;
  serviceFee?: number | null;
  taxAmount?: number | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string | null;
  status: string;
  statusEvent?: string;
  statusNote?: string;
  riderName?: string | null;
  riderPhone?: string | null;
  etaMinutes?: number | null;
  createdAt?: string | Date | null;
  paymentSplitMode?: string | null;
  onlineFoodPaidAmount?: number | null;
  cashDueToRider?: number | null;
  items?: Array<{
    foodItemId?: number;
    name: string;
    nameBn?: string;
    imageUrl?: string | null;
    quantity: number;
    unitPrice?: number;
    variation?: string;
    addons?: Array<{ name: string; price: number }>;
    lineTotal: number;
  }>;
}) {
  const emailLower = String(params.customerEmail || '').trim().toLowerCase();
  if (!emailLower || !emailLower.includes('@')) {
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
    items: enrichedItems,
  });

  const dispatchResult = await sendTransactionalEmail({
    to: emailLower,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  try {
    const inserted = await db
      .insert(orderEmailLogs)
      .values({
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        recipientEmail: emailLower,
        subject: payload.subject,
        trackingUrl: payload.trackingUrl,
        statusEvent: params.statusEvent || params.status,
        deliveryProvider: dispatchResult.provider,
        providerStatus: dispatchResult.status,
        htmlPreview: payload.html,
      })
      .returning();
    return inserted[0] ?? null;
  } catch (err) {
    console.warn('Order email log insert skipped:', err);
    return null;
  }
}

export async function sendMerchantOrderAlertEmail(params: {
  origin: string;
  orderId: number;
  orderNumber: string;
  trackingToken?: string | null;
  eventKind: 'new_order' | 'status_update';
  restaurantName: string;
  restaurantEmail?: string | null;
  ownerEmail?: string | null;
  customerName: string;
  customerPhone?: string | null;
  deliveryArea: string;
  deliveryAddress?: string | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string | null;
  status: string;
  statusNote?: string;
  riderName?: string | null;
  items?: Array<{
    foodItemId?: number;
    name: string;
    imageUrl?: string | null;
    quantity: number;
    variation?: string;
    lineTotal: number;
  }>;
}) {
  const status = await getEmailTransportStatus();
  const stored = await readStoredConfig();
  const configuredNotify =
    stored?.notifyEmail ||
    (process.env.ORDER_ALERT_NOTIFY_EMAIL || '').trim() ||
    PRIMARY_SUPER_ADMIN_EMAIL;

  const recipients = collectMerchantOrderAlertRecipients({
    restaurantEmail: params.restaurantEmail,
    ownerEmail: params.ownerEmail,
    adminNotifyEmail: configuredNotify,
    fallbackAdminEmails: [PRIMARY_SUPER_ADMIN_EMAIL, 'raqkibrony@gmail.com'],
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
    items: enrichedItems,
  });

  return Promise.allSettled(
    recipients.map(async (to) => {
      let dispatchResult: {
        ok: boolean;
        provider: 'smtp' | 'resend' | 'in_app_email_log';
        status: string;
        error?: string;
      } = {
        ok: false,
        provider: 'in_app_email_log',
        status: 'not_configured',
        error: 'SMTP not configured yet; email logged for audit.',
      };
      if (status.configured) {
        dispatchResult = await sendTransactionalEmail({
          to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
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
          htmlPreview: payload.html,
        });
      } catch (logErr) {
        // non-blocking
      }
      return dispatchResult;
    })
  );
}
