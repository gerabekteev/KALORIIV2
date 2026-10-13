import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from '@zxing/library'

/**
 * Decodes a barcode or 2D code (EAN-13, EAN-8, UPC, DataMatrix, Code 128, QR)
 * from a File or Blob image object using ZXing.
 */
export async function decodeBarcodeFromImageFile(file: File): Promise<string | null> {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)

  const reader = new BrowserMultiFormatReader(hints, 500)
  const imageUrl = URL.createObjectURL(file)

  try {
    const result = await reader.decodeFromImageUrl(imageUrl)
    if (result && result.getText()) {
      return result.getText()
    }
    return null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}
