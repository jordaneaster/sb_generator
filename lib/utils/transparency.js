const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

/**
 * Transparency checker for NFT component images
 * @module TransparencyChecker
 */
module.exports = {
  /**
   * Check transparency of an image file
   * @param {string} filePath - Path to image file
   * @param {string} layerType - Type of layer
   * @returns {Promise<Object>} Transparency analysis
   */
  checkImage: async (filePath, layerType) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Check if it's an SVG file
    if (filePath.toLowerCase().endsWith('.svg')) {
      return {
        file: path.basename(filePath),
        layer: layerType,
        width: "vector",
        height: "vector",
        isSvg: true,
        transparencySupported: true
      };
    }
    
    try {
      const image = await Jimp.read(filePath);
      const width = image.getWidth();
      const height = image.getHeight();
      
      let transparentPixels = 0;
      let totalPixels = width * height;
      
      // Count transparent pixels
      image.scan(0, 0, width, height, function(x, y, idx) {
        const alpha = this.bitmap.data[idx + 3];
        if (alpha < 255) {
          transparentPixels++;
        }
      });
      
      const transparencyPercent = (transparentPixels / totalPixels) * 100;
      
      // Determine if transparency level is appropriate for the layer type
      const appropriateTransparency = 
        (layerType === 'background' && transparencyPercent < 5) ||
        (layerType !== 'background' && transparencyPercent >= 30);
      
      return {
        file: path.basename(filePath),
        layer: layerType,
        width,
        height,
        transparentPixels,
        totalPixels,
        transparencyPercent,
        appropriateTransparency,
        warnings: getTransparencyWarnings(layerType, transparencyPercent)
      };
    } catch (error) {
      throw new Error(`Error analyzing ${filePath}: ${error.message}`);
    }
  }
};

/**
 * Get transparency warnings based on layer type and transparency percentage
 * @private
 */
function getTransparencyWarnings(layerType, transparencyPercent) {
  const warnings = [];
  
  if (layerType === 'background' && transparencyPercent > 5) {
    warnings.push(`Background image has ${transparencyPercent.toFixed(2)}% transparency. Background images should generally be fully opaque.`);
  } else if (layerType !== 'background' && transparencyPercent < 30) {
    warnings.push(`This ${layerType} has only ${transparencyPercent.toFixed(2)}% transparency. Non-background layers should have significant transparent areas to layer correctly.`);
  }
  
  return warnings;
}
