const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const Jimp = require("jimp");

class Generator {
  constructor(config = {}) {
    this.width = config.width || 512;
    this.height = config.height || 512;
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext("2d");
    this.outputFolder = config.outputFolder || "./output/";
    this.storage = config.storage;
    this.availableSpecies = config.availableSpecies || ["indigo", "green"];
    this.layerConfig = config.layerConfig || [
      { category: "background", type: "background" },
      { category: "head", type: "base" },
      { category: "eyes", type: "feature" },
      { category: "clothing", type: "outfit" },
      { category: "neck", type: "accessory" },
      { category: "hats", type: "accessory" },
      { category: "binky", type: "accessory", optional: true },
      { category: "special", type: "special", optional: true }
    ];
    
    // Ensure output folder exists
    if (!fs.existsSync(this.outputFolder)) {
      fs.mkdirSync(this.outputFolder, { recursive: true });
    }
    
    // Debug options
    this.debug = {
      skipPixelation: config.skipPixelation || false,
      saveIntermediateLayers: config.saveIntermediateLayers || false,
      showTransparencyInfo: config.showTransparencyInfo || false
    };
  }

  // Draw layer on canvas - CRITICAL function that was missing in exports
  async drawLayer(imageInfo, id) {
    if (!imageInfo || !imageInfo.url) return false;
    
    const { url: imageUrl, category, type } = imageInfo;
    console.log(`[drawLayer] Drawing ${category} from: ${imageUrl}`);
    
    try {
      const isSvg = imageUrl.toLowerCase().endsWith('.svg');
      console.log(`[drawLayer] File type: ${isSvg ? 'SVG' : 'PNG/JPG'}`);
      
      try {
        const image = await loadImage(imageUrl);
        console.log(`[drawLayer] Image dimensions: ${image.width}x${image.height}, Canvas: ${this.width}x${this.height}`);
        
        // Set composite mode to draw new layers on top of existing content
        this.ctx.globalCompositeOperation = 'source-over';
        
        let drawX = 0, drawY = 0, drawWidth, drawHeight;
        
        if (type === 'background') {
          drawWidth = this.width;
          drawHeight = this.height;
        } 
        else if (type === 'base') {
          const scale = Math.min(this.width / image.width, this.height / image.height);
          drawWidth = image.width * scale;
          drawHeight = image.height * scale;
          drawX = (this.width - drawWidth) / 2;
          drawY = (this.height - drawHeight) * 0.4;
        }
        else if (type === 'feature') {
          const scale = Math.min(this.width / image.width * 0.8, this.height / image.height * 0.5);
          drawWidth = image.width * scale;
          drawHeight = image.height * scale;
          drawX = (this.width - drawWidth) / 2;
          drawY = this.height * 0.3;
        }
        else if (type === 'outfit') {
          const heightScale = Math.min(this.width / image.width * 0.9, this.height / image.height * 0.9);
          const widthScale = heightScale * 1.15;
          
          drawWidth = image.width * widthScale;
          drawHeight = image.height * heightScale;
          drawX = (this.width - drawWidth) / 2;
          drawY = this.height * 0.1;
        }
        else {
          const scale = Math.min(this.width / image.width * 0.7, this.height / image.height * 0.5);
          drawWidth = image.width * scale;
          drawHeight = image.height * scale;
          drawX = (this.width - drawWidth) / 2;
          
          if (category === 'hats') {
            drawY = this.height * 0.05;
          } else if (category === 'neck') {
            drawY = this.height * 0.69;
          } else if (category === 'binky') {
            drawY = this.height * 0.4;
          } else {
            drawY = this.height * 0.2;
          }
        }
        
        console.log(`[drawLayer] Drawing ${category} at: x=${drawX}, y=${drawY}, width=${drawWidth}, height=${drawHeight}`);
        
        try {
          this.ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
          console.log(`[drawLayer] ✅ Successfully drew ${category}`);
          return true;
        } catch (drawError) {
          console.error(`[ERROR] Failed to draw ${category}:`, drawError.message);
          
          if (type === 'background') {
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillRect(0, 0, this.width, this.height);
            return true;
          }
          return false;
        }
      } catch (imageError) {
        console.error(`[ERROR] Failed to load image from ${imageUrl}: ${imageError.message}`);
        
        if (type === 'background') {
          this.ctx.fillStyle = '#FFFFFF';
          this.ctx.fillRect(0, 0, this.width, this.height);
          return true;
        }
        return false;
      }
    } catch (outerError) {
      console.error(`[ERROR] Unexpected error in drawLayer:`, outerError.message);
      return false;
    }
  }

  // Generate a 2D image based on randomly selected components
  async generate2DImage(id, species) {
    console.log(`[generate2DImage] Starting image generation for NFT #${id}...`);
    
    try {
      if (!fs.existsSync(this.outputFolder)) {
        console.log(`[generate2DImage] Creating output folder: ${this.outputFolder}`);
        fs.mkdirSync(this.outputFolder, { recursive: true });
      }

      species = species || this.getSpeciesToGenerate();
      console.log(`[generate2DImage] Generating NFT for species: ${species}`);
      
      // Make sure the canvas is completely cleared at the start
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      let attributes = [];
      let backgroundDrawn = false;
      
      // Track all categories that have been drawn to prevent duplicates
      const drawnCategories = new Set();
      
      attributes.push({
        trait_type: "species",
        value: species
      });
      
      // Process layers in the defined order
      for (let layerIndex = 0; layerIndex < this.layerConfig.length; layerIndex++) {
        const layerInfo = this.layerConfig[layerIndex];
        console.log(`[generate2DImage] Processing layer (${layerIndex + 1}/${this.layerConfig.length}): ${layerInfo.category}`);
        
        if (drawnCategories.has(layerInfo.category)) {
          console.log(`[generate2DImage] Skipping ${layerInfo.category} - this category has already been processed`);
          continue;
        }
        
        try {
          const componentInfo = await this.getRandomComponent(layerInfo, species);
          
          if (!componentInfo) {
            console.log(`[generate2DImage] No component selected for ${layerInfo.category}, skipping...`);
            continue;
          }
          
          const fileName = componentInfo.name;
          const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
          
          console.log(`[generate2DImage] Selected component: ${fileNameWithoutExt} for ${layerInfo.category}`);
          
          // Draw this layer
          const layerDrawn = await this.drawLayer(componentInfo, id);
          
          if (layerInfo.category === 'background') {
            backgroundDrawn = layerDrawn;
          }
          
          if (layerDrawn) {
            // Track that this category has been drawn
            drawnCategories.add(layerInfo.category);
            
            attributes.push({ 
              trait_type: layerInfo.category, 
              value: fileNameWithoutExt 
            });
            
            // Save intermediate image if debugging is enabled
            if (this.debug.saveIntermediateLayers) {
              const layerProgressPath = `${this.outputFolder}layer_${layerIndex + 1}_${layerInfo.category}_${id}.png`;
              fs.writeFileSync(layerProgressPath, this.canvas.toBuffer("image/png"));
              console.log(`[generate2DImage] 🔍 Saved progress after adding ${layerInfo.category} layer to ${layerProgressPath}`);
            }
          }
        } catch (error) {
          console.error(`[ERROR] Failed to process layer ${layerInfo.category}:`, error);
        }
      }

      if (!backgroundDrawn) {
        console.log(`[generate2DImage] No background was successfully drawn, ensuring white background`);
      }

      const nftPath = `${this.outputFolder}${species}_nft_${id}.png`;
      console.log(`[generate2DImage] Saving final generated image to: ${nftPath}`);
      
      try {
        fs.writeFileSync(nftPath, this.canvas.toBuffer("image/png"));
        console.log(`[generate2DImage] ✅ Generated 2D NFT Image: ${nftPath}`);
      } catch (saveError) {
        console.error(`[ERROR] Failed to save image to ${nftPath}: ${saveError.message}`);
        const altPath = `${this.outputFolder}fallback_${species}_${id}.png`;
        fs.writeFileSync(altPath, this.canvas.toBuffer("image/png"));
        console.log(`[generate2DImage] ✅ Saved to alternative path: ${altPath}`);
        return { nftPath: altPath, attributes, species };
      }

      return { nftPath, attributes, species };
    } catch (error) {
      console.error(`[CRITICAL ERROR] Failed to generate image: ${error.message}`);
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = '#FF00FF';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      this.ctx.fillStyle = 'black';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`Error generating NFT #${id}`, this.width/2, this.height/2);
      
      const emergencyPath = `${this.outputFolder}emergency_${id}.png`;
      fs.writeFileSync(emergencyPath, this.canvas.toBuffer("image/png"));
      console.log(`[generate2DImage] ⚠️ Created emergency fallback image: ${emergencyPath}`);
      
      return { 
        nftPath: emergencyPath, 
        attributes: [{ trait_type: "error", value: "generation_failed" }],
        species: "error" 
      };
    }
  }

  async getRandomComponent(layerInfo, species) {
    if (!this.storage) {
      throw new Error("Storage provider not configured. Please set up a storage provider.");
    }
    return await this.storage.getRandomComponent(layerInfo, species);
  }

  // Pixelate an image
  async pixelateImage(inputPath, outputPath, pixelSize = 8) {
    console.log(`[pixelateImage] Pixelating image: ${inputPath}...`);
    
    if (!fs.existsSync(inputPath)) {
      console.error(`[ERROR] Input file does not exist: ${inputPath}`);
      return null;
    }
    
    if (this.debug.skipPixelation) {
      console.log(`[pixelateImage] Skipping pixelation (debug.skipPixelation=true)`);
      try {
        fs.copyFileSync(inputPath, outputPath);
        return outputPath;
      } catch (copyError) {
        console.error(`[ERROR] Failed to copy file: ${copyError.message}`);
        return null;
      }
    }
    
    try {
      const buffer = fs.readFileSync(inputPath);
      const image = await Jimp.read(buffer);
      image.pixelate(pixelSize);
      await image.writeAsync(outputPath);
      console.log(`[pixelateImage] ✅ Pixelated image saved to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`[ERROR] Failed to pixelate image: ${inputPath}`, error);
      try {
        fs.copyFileSync(inputPath, outputPath);
        console.log(`[pixelateImage] Copied original file as fallback`);
        return outputPath;
      } catch (copyError) {
        console.error(`[ERROR] Failed to copy file as fallback: ${copyError.message}`);
        return null;
      }
    }
  }

  // Generate complete NFT with metadata
  async generateNFT(id, speciesOverride = null) {
    console.log(`\n======= GENERATING NFT #${id} =======`);
    
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    console.log(`[generateNFT] Step 1: Generating 2D image...`);
    const species = speciesOverride || this.getSpeciesToGenerate();
    const { nftPath, attributes } = await this.generate2DImage(id, species);
    
    // Check if the output file was successfully created
    if (!fs.existsSync(nftPath)) {
      console.error(`[ERROR] 2D image was not created: ${nftPath}`);
      throw new Error(`Failed to create 2D image at ${nftPath}`);
    }
    
    console.log(`[generateNFT] Step 2: Creating pixelated version...`);
    const pixelatedPath = `${this.outputFolder}${species}_nft_${id}_pixelated.png`;
    let pixelatedImagePath;
    
    try {
      pixelatedImagePath = await this.pixelateImage(nftPath, pixelatedPath);
      if (!pixelatedImagePath || !fs.existsSync(pixelatedImagePath)) {
        console.error(`[ERROR] Pixelation failed. Falling back to original image.`);
        fs.copyFileSync(nftPath, pixelatedPath);
        pixelatedImagePath = pixelatedPath;
      }
    } catch (pixelateError) {
      console.error(`[ERROR] Exception during pixelation: ${pixelateError.message}`);
      fs.copyFileSync(nftPath, pixelatedPath);
      pixelatedImagePath = pixelatedPath;
    }
    
    let nftUrl = nftPath;
    let pixelatedUrl = pixelatedImagePath;
    
    // Upload to storage if a provider is configured
    if (this.storage && typeof this.storage.uploadFile === 'function') {
      console.log(`[generateNFT] Step 3: Uploading images to storage...`);
      try {
        nftUrl = await this.storage.uploadFile(nftPath, `nfts/${species}/${id}/image.png`);
        pixelatedUrl = await this.storage.uploadFile(pixelatedImagePath, `nfts/${species}/${id}/image_pixelated.png`);
      } catch (uploadError) {
        console.error(`[ERROR] Upload failed: ${uploadError.message}`);
      }
    }

    console.log(`[generateNFT] Step 4: Creating and saving metadata...`);
    const metadata = {
      id,
      name: `${species.charAt(0).toUpperCase() + species.slice(1)} Babiez #${id}`,
      description: `Generated ${species} Space Babiez NFT with 2D and pixel art`,
      images: { "2D": nftUrl, "pixelated": pixelatedUrl },
      attributes
    };
    
    const metadataPath = `${this.outputFolder}${species}_nft_${id}.json`;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`[generateNFT] ✅ Metadata saved: ${metadataPath}`);
    console.log(`======= NFT #${id} GENERATION COMPLETE =======\n`);
    
    return { id, species, nftUrl, pixelatedUrl, metadata };
  }

  getSpeciesToGenerate() {
    // Basic implementation - can be overridden or extended
    if (this.availableSpecies.length === 0) {
      return "indigo"; // default
    }
    const randomIndex = Math.floor(Math.random() * this.availableSpecies.length);
    return this.availableSpecies[randomIndex];
  }

  // Get raw canvas for direct manipulation
  getCanvas() {
    return this.canvas;
  }

  // Get context for direct manipulation
  getContext() {
    return this.ctx;
  }
}

module.exports = Generator;
