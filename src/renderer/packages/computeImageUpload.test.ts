import { describe, expect, it, vi } from 'vitest'
import { isComputeUploadSizeExceeded, prepareComputeImageUpload } from './computeImageUpload'

function imageFile(size: number, name = 'proof.png', type = 'image/png') {
  return new File([new Uint8Array(size)], name, { type, lastModified: 123 })
}

describe('compute image upload preparation', () => {
  it('keeps an image that already fits the upload limit', async () => {
    const file = imageFile(100)
    const compressor = vi.fn()

    await expect(prepareComputeImageUpload(file, 200, compressor)).resolves.toBe(file)
    expect(compressor).not.toHaveBeenCalled()
  })

  it('compresses an oversized image and gives it a matching jpeg name', async () => {
    const file = imageFile(300)
    const compressor = vi.fn().mockResolvedValue(new Blob([new Uint8Array(120)], { type: 'image/jpeg' }))

    const result = await prepareComputeImageUpload(file, 200, compressor)

    expect(compressor).toHaveBeenCalledWith(file, 200)
    expect(result.name).toBe('proof.jpg')
    expect(result.type).toBe('image/jpeg')
    expect(result.size).toBe(120)
    expect(result.lastModified).toBe(123)
  })

  it('rejects unsupported files before uploading', async () => {
    await expect(prepareComputeImageUpload(imageFile(100, 'proof.gif', 'image/gif'))).rejects.toThrow(
      '仅支持 JPG、JPEG 或 PNG 图片'
    )
  })

  it('rejects a compressor result that still exceeds the target', async () => {
    const compressor = vi.fn().mockResolvedValue(new Blob([new Uint8Array(250)], { type: 'image/jpeg' }))

    await expect(prepareComputeImageUpload(imageFile(300), 200, compressor)).rejects.toThrow(
      '图片自动压缩后仍超过 1 KB'
    )
  })
})

describe('compute upload size errors', () => {
  it.each(['Maximum upload size exceeded', 'Payload Too Large', 'Request entity too large', '上传文件过大'])(
    'recognizes %s',
    (message) => {
      expect(isComputeUploadSizeExceeded(new Error(message))).toBe(true)
    }
  )

  it('does not hide unrelated upload errors', () => {
    expect(isComputeUploadSizeExceeded(new Error('没有权限'))).toBe(false)
  })
})
