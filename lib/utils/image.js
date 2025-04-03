const Jimp = require('jimp');
const fs = require('fs');

/**
 * Image utility functions
 * @module ImageUtils
 */
module.exports = {
  /**
   * Pixelate an image
   * @param {string} inputPath - Path to input image
   * @param {string} outputPath - Path to save pixelated image
   * @param {number} pixelSize - Size of pixels (default: 8)
   * @returns {Promise<string>} Path to pixelated image
   */
  pixelate: async (inputPath, outputPath, pixelSize = 8) => {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    try {
      const image = await Jimp.read(inputPath);
      image.pixelate(pixelSize);
      await image.writeAsync(outputPath);
      return outputPath;
    } catch (error) {
      throw new Error(`Failed to pixelate image: ${error.message}`);
    }
  },
  
  /**
   * Create a texture from a heightmap
   * @param {Buffer|string} heightmap - Heightmap image buffer or path
   * @param {Object} options - Options for texture generation
   * @returns {Promise<Jimp>} Generated texture
   */
  createTextureFromHeightmap: async (heightmap, options = {}) => {
    try {
      const image = await Jimp.read(heightmap);
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Create a new image for the texture
      const texture = new Jimp(width, height);
      
      // Apply color gradient based on height
      image.scan(0, 0, width, height, function(x, y, idx) {
        // Get brightness (0-255)
        const r = this.bitmap.data[idx + 0];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const brightness = (r + g + b) / 3;
        
        // Normalize to 0-1
        const normalizedHeight = brightness / 255;
        
        // Apply color based on height ranges
        let color;
        if (normalizedHeight < 0.2) {
          // Water
          color = { r: 0, g: 50 + normalizedHeight * 150, b: 200, a: 255 };
        } else if (normalizedHeight < 0.3) {
          // Beach/sand
          color = { r: 240, g: 220, b: 130, a: 255 };
        } else if (normalizedHeight < 0.7) {
          // Grass/land
          color = { r: 50 + (normalizedHeight - 0.3) * 100, g: 100 + (normalizedHeight - 0.3) * 80, b: 50, a: 255 };
        } else {
          // Mountain
          const grey = 150 + (normalizedHeight - 0.7) * 420;
          color = { r: grey, g: grey, b: grey, a: 255 };
        }
        
        // Set pixel color in texture
        texture.setPixelColor(
          Jimp.rgbaToInt(color.r, color.g, color.b, color.a),
          x, y
        );
      });
      
      return texture;
    } catch (error) {
      throw new Error(`Failed to create texture: ${error.message}`);
    }
  },
  
  /**
   * Check if an image has transparency
   * @param {string} imagePath - Path to image file
   * @returns {Promise<Object>} Transparency information
   */
  checkTransparency: async (imagePath) => {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File does not exist: ${imagePath}`);
    }
    
    try {
      const image = await Jimp.read(imagePath);
      const width = image.getWidth();
      const height = image.getHeight();
      let transparentPixels = 0;
      let totalPixels = width * height;
      
      // Scan all pixels to count transparent ones
      image.scan(0, 0, width, height, function(x, y, idx) {
        const alpha = this.bitmap.data[idx + 3];
        if (alpha < 255) {
          transparentPixels++;
        }
      });
      
      const transparencyPercent = (transparentPixels / totalPixels) * 100;
      
      return {
        hasTransparency: transparentPixels > 0,
        transparentPixels,
        totalPixels,
        transparencyPercent,
        dimensions: { width, height }
      };
    } catch (error) {
      throw new Error(`Error analyzing image: ${error.message}`);
    }
  }
};
