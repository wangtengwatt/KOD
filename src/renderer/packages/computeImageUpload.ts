export const COMPUTE_IMAGE_UPLOAD_MAX_BYTES = 800 * 1024
export const COMPUTE_IMAGE_UPLOAD_RETRY_BYTES = 350 * 1024
export const COMPUTE_IMAGE_UPLOAD_MAX_LABEL = '800 KB'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

type ImageCompressor = (file: File, maxBytes: number) => Promise<Blob>

function maxSizeLabel(maxBytes: number) {
  return `${Math.max(1, Math.ceil(maxBytes / 1024))} KB`
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片压缩失败，请更换图片后重试'))
      },
      'image/jpeg',
      quality
    )
  })
}

async function compressImage(file: File, maxBytes: number) {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前设备无法自动压缩图片，请选择较小的 JPG/PNG 图片')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('图片无法读取，请重新导出为 JPG 或 PNG 后重试')
  }

  try {
    if (!bitmap.width || !bitmap.height) throw new Error('图片尺寸无效，请更换图片后重试')

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备无法自动压缩图片，请选择较小的 JPG/PNG 图片')

    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    let quality = 0.86

    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= maxBytes) return blob

      const estimatedScale = Math.sqrt(maxBytes / blob.size) * 0.92
      scale *= Math.min(0.88, Math.max(0.45, estimatedScale))
      quality = Math.max(0.62, quality - 0.06)
    }

    throw new Error(`图片自动压缩后仍超过 ${maxSizeLabel(maxBytes)}，请裁剪图片后重试`)
  } finally {
    bitmap.close()
  }
}

function compressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'image'
  return `${baseName}.jpg`
}

export async function prepareComputeImageUpload(
  file: File,
  maxBytes = COMPUTE_IMAGE_UPLOAD_MAX_BYTES,
  compressor: ImageCompressor = compressImage
) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('仅支持 JPG、JPEG 或 PNG 图片')
  }
  if (file.size <= maxBytes) return file

  const compressed = await compressor(file, maxBytes)
  if (compressed.size > maxBytes) {
    throw new Error(`图片自动压缩后仍超过 ${maxSizeLabel(maxBytes)}，请裁剪图片后重试`)
  }

  return new File([compressed], compressedFileName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}

export function isComputeUploadSizeExceeded(error: unknown) {
  if (!(error instanceof Error)) return false
  return /maximum upload size exceeded|payload too large|request entity too large|文件.{0,8}过大|上传.{0,8}过大/i.test(
    error.message
  )
}
