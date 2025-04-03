const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

/**
 * AWS S3 storage provider for NFT generator
 */
class S3Storage {
  /**
   * Create a new S3 storage provider
   * @param {Object} config - S3 configuration
   */
  constructor(config = {}) {
    this.config = {
      debug: config.debug || false,
      componentsBucket: config.componentsBucket || 'space-babiez',
      storageBucket: config.storageBucket || 'nft-storage',
      region: config.region || 'us-east-1',
      ...config
    };
    
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('AWS credentials are required');
    }
    
    // Initialize AWS S3 client
    this.s3 = new AWS.S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region
    });
    
    if (config.debug) {
      console.log('Created S3 storage provider');
    }
  }
  
  /**
   * Get a random component for a layer
   * @param {Object} layerInfo - Layer information
   * @param {string} species - Species name
   * @returns {Promise<Object>} Component information
   */
  async getRandomComponent(layerInfo, species) {
    const { category, type, optional = false } = layerInfo;
    const prefix = `${species}/${category}/`;
    
    if (this.config.debug) {
      console.log(`Fetching components for ${prefix}`);
    }
    
    try {
      // List objects with the given prefix
      const { Contents } = await this.s3.listObjectsV2({
        Bucket: this.config.componentsBucket,
        Prefix: prefix
      }).promise();
      
      if (!Contents || Contents.length === 0) {
        if (optional) return null;
        throw new Error(`No components found for layer: ${prefix}`);
      }
      
      // Filter for image files and create component objects
      const files = Contents
        .filter(file => 
          file.Key.toLowerCase().endsWith('.png') || 
          file.Key.toLowerCase().endsWith('.svg') ||
          file.Key.toLowerCase().endsWith('.jpg') ||
          file.Key.toLowerCase().endsWith('.jpeg'))
        .map(file => {
          const fileName = path.basename(file.Key);
          const extension = path.extname(fileName).toLowerCase();
          const fileType = extension === '.svg' ? 'svg' : 'bitmap';
          return {
            url: `https://${this.config.componentsBucket}.s3.${this.config.region}.amazonaws.com/${file.Key}`,
            type: fileType,
            name: fileName
          };
        });
      
      if (files.length === 0) {
        if (optional) return null;
        throw new Error(`No image files found for layer: ${prefix}`);
      }
      
      // Select appropriate file based on type preference
      let selectedFile;
      
      if ((type === "base" || type === "feature") && files.some(f => f.type === 'svg')) {
        // Prefer SVG for base and feature layers
        const svgFiles = files.filter(f => f.type === 'svg');
        selectedFile = svgFiles[Math.floor(Math.random() * svgFiles.length)];
      } else {
        // For other layers or if no SVG is available, select any file type
        selectedFile = files[Math.floor(Math.random() * files.length)];
      }
      
      return {
        url: selectedFile.url,
        name: selectedFile.name,
        category,
        type
      };
    } catch (error) {
      if (this.config.debug) {
        console.error(`Error getting component for ${prefix}:`, error);
      }
      if (optional) return null;
      throw error;
    }
  }
  
  /**
   * Upload a file to storage
   * @param {string} filePath - Path to local file
   * @param {string} storageFolder - Folder path in storage
   * @returns {Promise<string>} Public URL of the uploaded file
   */
  async upload(filePath, storageFolder) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const fileName = path.basename(filePath);
    const folderPath = storageFolder.replace(/\/$/, '');
    const key = `${folderPath}/${fileName}`;
    
    if (this.config.debug) {
      console.log(`Uploading ${fileName} to ${this.config.storageBucket}/${key}`);
    }
    
    try {
      // Read file and upload to S3
      const fileContent = fs.readFileSync(filePath);
      await this.s3.putObject({
        Bucket: this.config.storageBucket,
        Key: key,
        Body: fileContent,
        ContentType: 'image/png',
        ACL: 'public-read'
      }).promise();
      
      // Build and return the public URL
      return `https://${this.config.storageBucket}.s3.${this.config.region}.amazonaws.com/${key}`;
    } catch (error) {
      if (this.config.debug) {
        console.error(`Error uploading ${fileName}:`, error);
      }
      throw error;
    }
  }
  
  /**
   * Initialize storage buckets
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.config.debug) {
      console.log('Checking S3 buckets');
    }
    
    try {
      // Check if buckets exist, create if they don't
      await this._createBucketIfNeeded(this.config.componentsBucket);
      await this._createBucketIfNeeded(this.config.storageBucket);
      
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('Error initializing S3 buckets:', error);
      }
      return false;
    }
  }
  
  /**
   * Create a bucket if it doesn't exist
   * @private
   */
  async _createBucketIfNeeded(bucketName) {
    try {
      // Check if bucket exists
      await this.s3.headBucket({ Bucket: bucketName }).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
        // Create bucket
        await this.s3.createBucket({
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: this.config.region
          }
        }).promise();
        
        // Set bucket public access
        await this.s3.putBucketPolicy({
          Bucket: bucketName,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'PublicRead',
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucketName}/*`]
              }
            ]
          })
        }).promise();
        
        return true;
      }
      
      throw error;
    }
  }
}

module.exports = S3Storage;
