# NFT Generator Package

A flexible NFT generation package with support for Supabase and AWS S3 storage.

## Installation

```
npm install sb_generator
```

## Features

- Generate NFTs with customizable layers
- Support for both Supabase and AWS S3 storage
- Pixelation effects
- Transparency checking
- Flexible configuration

## Usage

### Basic Usage

```javascript
const { createGenerator, storage } = require('sb_generator');

async function generateNFTs() {
  // Create a storage provider
  const nftStorage = storage.createSupabaseStorage({
    url: 'YOUR_SUPABASE_URL',
    key: 'YOUR_SUPABASE_KEY',
    debug: true
  });
  
  // Initialize storage (creates buckets and folders)
  await nftStorage.initialize();
  
  // Create an NFT generator
  const generator = createGenerator({
    outputFolder: './output',
    species: ['indigo', 'green'],
    debug: true,
    storage: nftStorage
  });
  
  // Generate a single NFT
  const nft = await generator.generate(1, {
    species: 'indigo',
    includePixelated: true
  });
  
  console.log(`NFT generated: ${nft.nftUrl}`);
  
  // Generate multiple NFTs
  const nfts = await generator.generateMultiple(5, {
    species: 'random',
    includePixelated: true
  });
  
  console.log(`Generated ${nfts.length} NFTs`);
}

generateNFTs();
```

### Using with AWS S3

```javascript
const { createGenerator, storage } = require('sb_generator');

async function generateWithS3() {
  // Create an S3 storage provider
  const nftStorage = storage.createS3Storage({
    accessKeyId: 'YOUR_AWS_ACCESS_KEY',
    secretAccessKey: 'YOUR_AWS_SECRET_KEY',
    region: 'us-east-1',
    debug: true
  });
  
  // Initialize storage
  await nftStorage.initialize();
  
  // Create and use generator as before
  const generator = createGenerator({
    storage: nftStorage,
    // other options...
  });
  
  // Generate NFTs...
}
```

## API Reference

### Generator

#### `createGenerator(options)`

Creates a new NFT generator instance.

Options:
- `outputFolder`: Where to save generated images
- `width`: Image width (default: 512)
- `height`: Image height (default: 512)
- `debug`: Enable debug logging (default: false)
- `species`: Available species (default: ['indigo', 'green'])
- `pixelateSize`: Size for pixelation effect (default: 8)
- `storage`: Storage provider instance
- `layers`: Layer configuration (default: predefined layers)

#### `generator.generate(id, options)`

Generates a single NFT.

Parameters:
- `id`: NFT ID/number
- `options.species`: Species to generate ('indigo', 'green', or 'random')
- `options.includePixelated`: Whether to generate pixelated version (default: true)

Returns an object with:
- `id`: NFT ID
- `species`: Generated species
- `nftPath`: Local path to generated image
- `pixelatedPath`: Local path to pixelated version
- `nftUrl`: URL of uploaded image (if using storage)
- `pixelatedUrl`: URL of uploaded pixelated version (if using storage)
- `metadata`: NFT metadata

#### `generator.generateMultiple(count, options)`

Generates multiple NFTs with the given options.

### Storage

#### Supabase Storage

```javascript
const supabaseStorage = storage.createSupabaseStorage({
  url: 'YOUR_SUPABASE_URL',
  key: 'YOUR_SUPABASE_KEY',
  debug: true,
  componentsBucket: 'space-babiez', // Optional
  storageBucket: 'nft-storage'  // Optional
});
```

#### S3 Storage

```javascript
const s3Storage = storage.createS3Storage({
  accessKeyId: 'YOUR_AWS_ACCESS_KEY',
  secretAccessKey: 'YOUR_AWS_SECRET_KEY',
  region: 'us-east-1',
  debug: true,
  componentsBucket: 'space-babiez', // Optional
  storageBucket: 'nft-storage'  // Optional
});
```

### Utilities

#### Image Utilities

```javascript
const { utils } = require('sb_generator');

// Pixelate an image
await utils.image.pixelate('input.png', 'output.png', 8);

// Check image transparency
const transparency = await utils.image.checkTransparency('image.png');
console.log(`Transparency: ${transparency.transparencyPercent}%`);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
