/**
 * AWS S3 Configuration
 * Load credentials from environment variables
 */
require('dotenv').config();

module.exports = {
    // S3 credentials
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "YOUR_S3_ACCESS_KEY_ID", 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "YOUR_S3_SECRET_ACCESS_KEY",
    
    // S3 configuration
    region: process.env.AWS_REGION || "us-east-1",
    bucketName: process.env.AWS_BUCKET_NAME || "nft-generator",
    
    // Optional - Set to true to use S3 instead of Supabase
    useS3: process.env.USE_S3 === 'true'
};
