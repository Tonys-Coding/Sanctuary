import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../env';
import { HttpError } from '../http';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SAFE_NAME = /^[a-f0-9-]{36}\.(webp|png|pdf)$/;

export const filePath = (orgId: string, name: string) => {
  if (!SAFE_NAME.test(name)) throw new HttpError(404, 'not_found');
  return path.join(env.uploadDir, orgId, name);
};

/** Normalises any uploaded photo into a small square-ish image and stores it under the org's folder. */
export async function saveImage(orgId: string, file: Express.Multer.File | undefined, kind: 'avatar' | 'logo'): Promise<string> {
  if (!file) throw new HttpError(400, 'file_required');
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.mimetype)) throw new HttpError(400, 'file_not_image');
  const dir = path.join(env.uploadDir, orgId);
  await fs.mkdir(dir, { recursive: true });
  let out: Buffer;
  let ext: string;
  try {
    if (kind === 'avatar') {
      out = await sharp(file.buffer).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 86 }).toBuffer();
      ext = 'webp';
    } else {
      // PNG keeps transparency and can be embedded in PDFs.
      out = await sharp(file.buffer).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      ext = 'png';
    }
  } catch {
    throw new HttpError(400, 'file_not_image');
  }
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), out);
  return name;
}

/** Stores a receipt: photos are shrunk to a readable size, PDFs are kept as they are. */
export async function saveReceipt(orgId: string, file: Express.Multer.File | undefined): Promise<string> {
  if (!file) throw new HttpError(400, 'file_required');
  const dir = path.join(env.uploadDir, orgId);
  await fs.mkdir(dir, { recursive: true });
  let out: Buffer;
  let ext: string;
  if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') {
    out = file.buffer;
    ext = 'pdf';
  } else if (/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.mimetype)) {
    try {
      out = await sharp(file.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new HttpError(400, 'file_not_image');
    }
    ext = 'webp';
  } else throw new HttpError(400, 'file_not_receipt');
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), out);
  return name;
}

export async function removeFile(orgId: string, name: string | null | undefined) {
  if (!name || !SAFE_NAME.test(name)) return;
  await fs.rm(path.join(env.uploadDir, orgId, name), { force: true });
}
