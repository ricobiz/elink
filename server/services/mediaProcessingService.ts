import sharp from 'sharp';
import Jimp from 'jimp';
import { createWorker } from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';

export class MediaProcessingService {
  private tesseractWorker?: Awaited<ReturnType<typeof createWorker>>;

  constructor() {
    this.initTesseract();
  }

  private async initTesseract() {
    try {
      this.tesseractWorker = await createWorker();
      await this.tesseractWorker.loadLanguage('eng+rus');
      await this.tesseractWorker.initialize('eng+rus');
      console.log('✅ Tesseract OCR initialized');
    } catch (error) {
      console.warn('Failed to initialize Tesseract OCR:', error);
    }
  }

  // Image processing with Sharp (high performance)
  async processImage(inputBuffer: Buffer, options: {
    width?: number;
    height?: number;
    format?: 'jpeg' | 'png' | 'webp';
    quality?: number;
  } = {}): Promise<any> {
    try {
      const { width, height, format = 'jpeg', quality = 80 } = options;
      
      let pipeline = sharp(inputBuffer);
      
      if (width || height) {
        pipeline = pipeline.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      
      const processed = await pipeline
        .toFormat(format, { quality })
        .toBuffer();

      return {
        success: true,
        data: processed,
        metadata: await sharp(inputBuffer).metadata(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Image editing with Jimp (feature-rich)
  async editImage(inputBuffer: Buffer, operations: Array<{
    type: 'resize' | 'rotate' | 'blur' | 'brightness' | 'contrast' | 'crop';
    params: any;
  }>): Promise<any> {
    try {
      let image = await Jimp.read(inputBuffer);

      for (const op of operations) {
        switch (op.type) {
          case 'resize':
            image = image.resize(op.params.width, op.params.height);
            break;
          case 'rotate':
            image = image.rotate(op.params.angle);
            break;
          case 'blur':
            image = image.blur(op.params.radius || 1);
            break;
          case 'brightness':
            image = image.brightness(op.params.value || 0);
            break;
          case 'contrast':
            image = image.contrast(op.params.value || 0);
            break;
          case 'crop':
            image = image.crop(op.params.x, op.params.y, op.params.width, op.params.height);
            break;
        }
      }

      const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

      return {
        success: true,
        data: buffer,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // OCR text extraction
  async extractText(imageBuffer: Buffer, language: string = 'eng+rus'): Promise<any> {
    if (!this.tesseractWorker) {
      return {
        success: false,
        error: 'Tesseract OCR not initialized',
      };
    }

    try {
      const { data: { text } } = await this.tesseractWorker.recognize(imageBuffer);

      return {
        success: true,
        data: text.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Screenshot processing for browser automation
  async processScreenshot(screenshotPath: string, options: {
    extractText?: boolean;
    compress?: boolean;
    cropArea?: { x: number; y: number; width: number; height: number };
  } = {}): Promise<any> {
    try {
      const imageBuffer = await fs.readFile(screenshotPath);
      let processedBuffer = imageBuffer;

      // Crop if specified
      if (options.cropArea) {
        const { x, y, width, height } = options.cropArea;
        processedBuffer = await sharp(imageBuffer)
          .extract({ left: x, top: y, width, height })
          .toBuffer();
      }

      // Compress if needed
      if (options.compress) {
        processedBuffer = await sharp(processedBuffer)
          .jpeg({ quality: 70 })
          .toBuffer();
      }

      const result: any = {
        success: true,
        data: {
          processedImage: processedBuffer,
          originalSize: imageBuffer.length,
          processedSize: processedBuffer.length,
        },
      };

      // Extract text if requested
      if (options.extractText) {
        const textResult = await this.extractText(processedBuffer);
        if (textResult.success) {
          result.data.extractedText = textResult.data;
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Generate thumbnail
  async generateThumbnail(imageBuffer: Buffer, size: number = 200): Promise<any> {
    return this.processImage(imageBuffer, {
      width: size,
      height: size,
      quality: 85,
    });
  }

  // Clean up resources
  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = undefined;
    }
  }
}

export const mediaProcessingService = new MediaProcessingService();