// Example usage of NFT Generator package
require('dotenv').config();
const { createGenerator, storage } = require('../lib');

async function run() {
  console.log('NFT Generator Example');
  
  try {
    // Create a storage provider (Supabase or S3)
    let nftStorage;
    
    if (process.env.USE_S3 === 'true') {
      console.log('Using S3 storage provider');
      nftStorage = storage.createS3Storage({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        componentsBucket: process.env.AWS_BUCKET_NAME,
        debug: true
      });
    } else {
      console.log('Using Supabase storage provider');
      nftStorage = storage.createSupabaseStorage({
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_SERVICE_KEY,
        debug: true
      });
    }
    
    // Initialize storage
    console.log('Initializing storage...');
    await nftStorage.initialize();
    
    // Create an NFT generator
    const generator = createGenerator({
      outputFolder: './output',
      species: ['indigo', 'green'],
      debug: true,
      storage: nftStorage
    });
    
    // Generate a single NFT
    console.log('Generating NFT...');
    const count = process.env.COUNT ? parseInt(process.env.COUNT) : 1;
    
    if (count > 1) {
      console.log(`Generating ${count} NFTs...`);
      const results = await generator.generateMultiple(count, {
        species: process.env.SPECIES || 'indigo',
        includePixelated: true
      });
      
      console.log(`Generated ${results.length} NFTs successfully`);
    } else {
      console.log('Generating single NFT...');
      const result = await generator.generate(1, {
        species: process.env.SPECIES || 'indigo',
        includePixelated: true
      });
      
      console.log('NFT generated successfully:');
      console.log(`ID: ${result.id}`);
      console.log(`Species: ${result.species}`);
      console.log(`Original: ${result.nftUrl || result.nftPath}`);
      console.log(`Pixelated: ${result.pixelatedUrl || result.pixelatedPath}`);
    }
    
    console.log('Finished!');
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
