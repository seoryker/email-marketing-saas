import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from './client'

export function slugifyFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot).toLowerCase() : ''
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug}${ext}`
}

export function isValidImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function isValidFileSize(bytes: number): boolean {
  return bytes <= 5 * 1024 * 1024
}

export async function generatePresignedPutUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(r2Client, command, { expiresIn: 900 })
}

export function buildPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export function buildR2Key(orgId: string, filename: string): string {
  return `${orgId}/${Date.now()}-${slugifyFilename(filename)}`
}
