import { describe, it, expect } from 'vitest'
import { slugifyFilename, isValidImageType, isValidFileSize } from '../upload'

describe('slugifyFilename', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugifyFilename('My Hero Banner.jpg')).toBe('my-hero-banner.jpg')
  })
  it('removes special characters', () => {
    expect(slugifyFilename('image (1).png')).toBe('image-1.png')
  })
  it('preserves extension', () => {
    expect(slugifyFilename('photo.JPEG')).toBe('photo.jpeg')
  })
})

describe('isValidImageType', () => {
  it('accepts image types', () => {
    expect(isValidImageType('image/jpeg')).toBe(true)
    expect(isValidImageType('image/png')).toBe(true)
    expect(isValidImageType('image/webp')).toBe(true)
  })
  it('rejects non-image types', () => {
    expect(isValidImageType('application/pdf')).toBe(false)
  })
})

describe('isValidFileSize', () => {
  it('accepts files under 5MB', () => {
    expect(isValidFileSize(4 * 1024 * 1024)).toBe(true)
  })
  it('rejects files over 5MB', () => {
    expect(isValidFileSize(6 * 1024 * 1024)).toBe(false)
  })
})
