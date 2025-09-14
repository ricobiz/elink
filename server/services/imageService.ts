import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

export interface CoordinateMark {
  x: number;
  y: number;
  label: string;
  description?: string;
}

export class ImageService {
  static async createMarkedImage(
    originalImagePath: string,
    marks: CoordinateMark[]
  ): Promise<string> {
    try {
      // Load the original image
      const image = await loadImage(originalImagePath);
      
      // Create canvas with same dimensions
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      
      // Draw the original image
      ctx.drawImage(image, 0, 0);
      
      // Draw coordinate marks
      marks.forEach((mark, index) => {
        const x = (mark.x / 100) * image.width;
        const y = (mark.y / 100) * image.height;
        
        // Draw circle for the mark
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Draw number in the circle
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((index + 1).toString(), x, y);
        
        // Draw label next to the mark
        if (mark.label) {
          const labelX = x + 20;
          const labelY = y - 10;
          
          // Background for label
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.font = '12px Arial';
          const textMetrics = ctx.measureText(mark.label);
          const padding = 4;
          ctx.fillRect(
            labelX - padding, 
            labelY - 12 - padding, 
            textMetrics.width + padding * 2, 
            16 + padding * 2
          );
          
          // Label text
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(mark.label, labelX, labelY - 12);
        }
      });
      
      // Save the marked image
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `marked-screenshot-${timestamp}.png`;
      const outputPath = path.join('public', 'screenshots', filename);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Save the image
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);
      
      return `/screenshots/${filename}`;
    } catch (error) {
      console.error('Error creating marked image:', error);
      throw new Error('Failed to create marked image');
    }
  }
}
