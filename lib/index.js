const Generator = require('./generator');
const SupabaseStorage = require('./storage/supabase');
const S3Storage = require('./storage/s3');
const ImageUtils = require('./utils/image');
const TransparencyChecker = require('./utils/transparency');

/**
 * NFT Generator Package
 * @module sb_generator
 */
module.exports = {
  /**
   * Create a new NFT generator instance
   * @param {Object} config - Configuration options
   */
  createGenerator: (config = {}) => new Generator(config),
  
  /**
   * Direct access to Generator class
   */
  Generator,
  
  /**
   * Storage providers
   */
  storage: {
    /**
     * Create a Supabase storage provider
     * @param {Object} config - Supabase configuration
     */
    createSupabaseStorage: (config = {}) => new SupabaseStorage(config),
    
    /**
     * Create an S3 storage provider
     * @param {Object} config - AWS S3 configuration
     */
    createS3Storage: (config = {}) => new S3Storage(config),
    
    /**
     * Direct access to storage classes
     */
    SupabaseStorage,
    S3Storage
  },
  
  /**
   * Utility functions
   */
  utils: {
    image: ImageUtils,
    transparency: TransparencyChecker
  }
};
