const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

class SupabaseStorage {
  constructor(config = {}) {
    this.supabaseUrl = config.url || process.env.SUPABASE_URL;
    this.supabaseKey = config.key || process.env.SUPABASE_SERVICE_KEY;
    this.componentBucket = config.componentBucket || "space-babiez";
    this.storageBucket = config.storageBucket || "nft-storage";
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL and key are required. Provide them in config or as environment variables.');
    }
    
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }

  async getRandomComponent(layerInfo, species) {
    const { category, type } = layerInfo;
    const fullPath = `${species}/${category}`; 
    console.log(`[getRandomComponent] Fetching components for layer: ${fullPath}...`);
    
    const { data, error } = await this.supabase.storage.from(this.componentBucket).list(fullPath);
    
    if (error) {
      console.error(`[ERROR] Failed to fetch components for layer ${fullPath}:`, error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      if (layerInfo.optional) {
        console.log(`[getRandomComponent] No components found for optional layer: ${fullPath}, skipping...`);
        return null;
      }
      throw new Error(`No components found for layer: ${fullPath}`);
    }
    
    // Accept both PNG and SVG files
    const files = data
      .filter(file => 
        file.name.toLowerCase().endsWith('.png') || 
        file.name.toLowerCase().endsWith('.svg') ||
        file.name.toLowerCase().endsWith('.jpg') ||
        file.name.toLowerCase().endsWith('.jpeg'))
      .map(file => {
        const extension = path.extname(file.name).toLowerCase();
        const fileType = extension === '.svg' ? 'svg' : 'bitmap';
        return {
          url: `${this.supabaseUrl}/storage/v1/object/public/${this.componentBucket}/${fullPath}/${file.name}`,
          type: fileType,
          name: file.name
        };
      });
    
    if (files.length === 0) {
      if (layerInfo.optional) {
        return null;
      }
      throw new Error(`No image files found for layer: ${fullPath}`);
    }
    
    // For base (head) and feature layers, prefer SVG if available
    let selectedFile;
    
    if ((type === "base" || type === "feature") && files.some(f => f.type === 'svg')) {
      const svgFiles = files.filter(f => f.type === 'svg');
      selectedFile = svgFiles[Math.floor(Math.random() * svgFiles.length)];
    } else {
      selectedFile = files[Math.floor(Math.random() * files.length)];
    }
    
    return {
      url: selectedFile.url, 
      name: selectedFile.name,
      category: category,
      type: type
    };
  }

  async uploadFile(filePath, destinationPath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    try {
      const fileContent = fs.readFileSync(filePath);
      
      // Create folder structure if needed
      const folderPath = path.dirname(destinationPath);
      if (folderPath !== '.') {
        await this.createFolderIfNotExists(this.storageBucket, folderPath);
      }
      
      const { data, error } = await this.supabase.storage.from(this.storageBucket).upload(
        destinationPath, 
        fileContent, 
        { contentType: "image/png", upsert: true }
      );
      
      if (error) {
        throw error;
      }
      
      const fileUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${destinationPath}`;
      return fileUrl;
    } catch (error) {
      console.error(`[ERROR] Upload failed: ${error.message}`);
      throw error;
    }
  }

  async createFolderIfNotExists(bucketName, folderPath) {
    try {
      const { data, error } = await this.supabase.storage.from(bucketName).list(folderPath);
      
      if (!error) {
        return true;
      }
      
      const { error: uploadError } = await this.supabase.storage
        .from(bucketName)
        .upload(`${folderPath}/.keep`, new Uint8Array(0), {
          contentType: 'text/plain',
          upsert: true
        });
      
      if (uploadError && uploadError.message !== 'The resource already exists') {
        console.error(`[ERROR] Error creating folder '${folderPath}': ${uploadError.message}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`[ERROR] Exception for folder '${folderPath}': ${error.message}`);
      return false;
    }
  }

  // Add other storage-related functions as needed
}

module.exports = SupabaseStorage;
