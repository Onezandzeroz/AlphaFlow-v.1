import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import {
  requirePermission,
  blockOversightMutation,
  requireNotDemoCompany,
  Permission,
} from '@/lib/rbac';

// Allowed image types for receipts
const ALLOWED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
];

// Max file size: 25 MB
const MAX_RECEIPT_SIZE = 25 * 1024 * 1024;

// POST /api/transactions/upload — Upload a receipt image for the active tenant
export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Permission checks ─────────────────────────────────────────────
    const permissionDenied = requirePermission(ctx, Permission.DATA_CREATE);
    if (permissionDenied) return permissionDenied;

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    // ── Require active company (tenant) ───────────────────────────────
    if (!ctx.activeCompanyId) {
      return NextResponse.json(
        { error: 'No active company selected' },
        { status: 400 }
      );
    }

    // ── Parse form data ───────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // ── Validate file type ────────────────────────────────────────────
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type "${file.type}". Allowed: JPEG, PNG, GIF, WebP, BMP, PDF.`,
        },
        { status: 400 }
      );
    }

    // ── Validate file size ────────────────────────────────────────────
    if (file.size > MAX_RECEIPT_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 25 MB.' },
        { status: 400 }
      );
    }

    // ── Tenant-scoped storage: uploads/receipts/{companyId}/ ──────────
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'receipts',
      ctx.activeCompanyId
    );
    await mkdir(uploadDir, { recursive: true });

    // Generate unique filename: timestamp-randomSuffix.ext
    const ext = path.extname(file.name) || '.jpg';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${randomSuffix}${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Relative path stored in the Transaction.receiptImage field.
    // Used later by /api/receipts/[...path] to serve the image.
    const relativePath = `receipts/${ctx.activeCompanyId}/${filename}`;

    logger.info(
      `Receipt uploaded: ${file.name} → ${relativePath} (company: ${ctx.activeCompanyName}, size: ${(file.size / 1024).toFixed(1)} KB)`
    );

    return NextResponse.json(
      { path: relativePath, filename },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Upload receipt error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
