import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAttachments, isImageUrl, getAttachmentLabel } from './attachmentUtils.js'

describe('parseAttachments', () => {
  it('should return empty array for null/undefined/empty', () => {
    assert.deepEqual(parseAttachments(null), [])
    assert.deepEqual(parseAttachments(undefined), [])
    assert.deepEqual(parseAttachments(''), [])
    assert.deepEqual(parseAttachments('   '), [])
  })

  it('should return filtered array when given an array', () => {
    assert.deepEqual(parseAttachments(['a.png', '', 'b.jpg']), ['a.png', 'b.jpg'])
    assert.deepEqual(parseAttachments([null, undefined, 'c.gif']), ['c.gif'])
  })

  it('should wrap a single URL string in an array', () => {
    assert.deepEqual(parseAttachments('https://example.com/file.png'), ['https://example.com/file.png'])
  })

  it('should parse a JSON array string', () => {
    assert.deepEqual(parseAttachments('["a.png","b.jpg"]'), ['a.png', 'b.jpg'])
  })

  it('should filter falsy values from parsed JSON arrays', () => {
    assert.deepEqual(parseAttachments('["a.png", null, "", "b.jpg"]'), ['a.png', 'b.jpg'])
  })

  it('should treat invalid JSON starting with [ as a plain string', () => {
    assert.deepEqual(parseAttachments('[not-json'), ['[not-json'])
  })

  it('should return empty array for non-string non-array input', () => {
    assert.deepEqual(parseAttachments(42), [])
    assert.deepEqual(parseAttachments({}), [])
  })
})

describe('isImageUrl', () => {
  it('should return true for image file extensions', () => {
    assert.equal(isImageUrl('https://example.com/photo.png'), true)
    assert.equal(isImageUrl('https://example.com/photo.JPG'), true)
    assert.equal(isImageUrl('https://example.com/photo.jpeg'), true)
    assert.equal(isImageUrl('https://example.com/photo.gif'), true)
    assert.equal(isImageUrl('https://example.com/photo.webp'), true)
    assert.equal(isImageUrl('https://example.com/photo.svg'), true)
  })

  it('should return true for data:image/ URIs', () => {
    assert.equal(isImageUrl('data:image/png;base64,abc123'), true)
  })

  it('should return false for non-image URLs', () => {
    assert.equal(isImageUrl('https://example.com/file.pdf'), false)
    assert.equal(isImageUrl('https://example.com/file.doc'), false)
    assert.equal(isImageUrl('https://example.com/file.txt'), false)
  })

  it('should return false for null/undefined/empty/non-string', () => {
    assert.equal(isImageUrl(null), false)
    assert.equal(isImageUrl(undefined), false)
    assert.equal(isImageUrl(''), false)
    assert.equal(isImageUrl(123), false)
  })
})

describe('getAttachmentLabel', () => {
  it('should return "Attachment File" for null/undefined/empty/non-string', () => {
    assert.equal(getAttachmentLabel(null), 'Attachment File')
    assert.equal(getAttachmentLabel(undefined), 'Attachment File')
    assert.equal(getAttachmentLabel(''), 'Attachment File')
    assert.equal(getAttachmentLabel(42), 'Attachment File')
  })

  it('should extract short filenames from HTTP URLs', () => {
    assert.equal(getAttachmentLabel('https://cdn.example.com/uploads/report.pdf'), 'report.pdf')
  })

  it('should strip query params from HTTP URL filenames', () => {
    assert.equal(getAttachmentLabel('https://cdn.example.com/uploads/img.png?token=abc'), 'img.png')
  })

  it('should return "View Attached File" for long HTTP filenames', () => {
    const longName = 'a'.repeat(35) + '.pdf'
    assert.equal(getAttachmentLabel(`https://cdn.example.com/${longName}`), 'View Attached File')
  })

  it('should label data:application/pdf as "PDF Document"', () => {
    assert.equal(getAttachmentLabel('data:application/pdf;base64,abc'), 'PDF Document')
  })

  it('should label data:image/ as "Image Attachment"', () => {
    assert.equal(getAttachmentLabel('data:image/png;base64,abc'), 'Image Attachment')
  })

  it('should label other data: URIs as "Document Attachment"', () => {
    assert.equal(getAttachmentLabel('data:text/plain;base64,abc'), 'Document Attachment')
  })

  it('should return short non-URL strings as-is', () => {
    assert.equal(getAttachmentLabel('my-file.txt'), 'my-file.txt')
  })

  it('should return "Attached File" for long non-URL strings', () => {
    assert.equal(getAttachmentLabel('a'.repeat(31)), 'Attached File')
  })
})
