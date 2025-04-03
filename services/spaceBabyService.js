const { createGenerator, storage } = require('sb_generator');

class SpaceBabyService {
  constructor({ supabaseUrl, supabaseKey, supabase }) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.supabase = supabase;
    this.generator = null;
    this.debug = process.env.NODE_ENV !== 'production';
  }

  async initialize() {
    try {
      // Create Supabase storage provider
      const nftStorage = storage.createSupabaseStorage({
        url: this.supabaseUrl,
        key: this.supabaseKey,
        debug: this.debug,
        componentsBucket: 'space-babiez',
        storageBucket: 'nft-storage'
      });
      
      // Initialize storage (creates buckets and folders)
      await nftStorage.initialize();
      
      // Create generator instance - removed outputFolder to avoid local file storage
      this.generator = createGenerator({
        species: ['indigo', 'green'],
        debug: this.debug,
        storage: nftStorage
      });
      
      console.log('Space Baby Generator initialized successfully');
      return this.generator;
    } catch (error) {
      console.error('Failed to initialize Space Baby Generator:', error);
      throw error;
    }
  }

  async generate(id, options = {}) {
    // Initialize generator if not already initialized
    if (!this.generator) {
      await this.initialize();
    }
    
    // Default options
    const { species = 'random', traits = [] } = options || {};
    
    // Generate the NFT
    const nft = await this.generator.generate(id, {
      species,
      includePixelated: true
    });
    
    // Add traits to metadata
    if (traits && traits.length > 0) {
      // Convert traits array to NFT attributes format
      const attributes = traits.map(trait => ({
        trait_type: trait.name,
        value: trait.description
      }));
      
      // Update the metadata with these attributes
      nft.metadata.attributes = [
        ...(nft.metadata.attributes || []),
        ...attributes
      ];
    }
    
    // Return space baby data
    return {
      id: nft.id,
      species: nft.species,
      image: nft.nftUrl,
      pixelatedImage: nft.pixelatedUrl,
      metadata: nft.metadata,
      createdAt: new Date().toISOString()
    };
  }

  async save(userId, spaceBaby) {
    // First verify the user exists in space_baby_users table
    const { data: userData, error: userError } = await this.supabase
      .from('space_baby_users')
      .select('id')
      .eq('id', userId)
      .single();
      
    if (userError) {
      throw new Error(`User verification failed: ${userError.message}`);
    }
    
    if (!userData) {
      throw new Error('User not found in space_baby_users table');
    }
    
    // Insert into the space_babies table
    const { data, error } = await this.supabase
      .from('space_babies')
      .insert({
        user_id: userId,
        nft_id: spaceBaby.id.toString(),
        species: spaceBaby.species,
        image_url: spaceBaby.image,
        pixelated_image_url: spaceBaby.pixelatedImage,
        metadata: spaceBaby.metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    
    // Save attributes separately if needed
    if (spaceBaby.metadata?.attributes?.length > 0) {
      const attributeRecords = spaceBaby.metadata.attributes.map(attr => ({
        space_baby_id: data.id,
        trait_type: attr.trait_type,
        value: attr.value
      }));
      
      const { error: attrError } = await this.supabase
        .from('space_baby_attributes')
        .insert(attributeRecords);
      
      if (attrError) {
        console.error('Error saving Space Baby attributes:', attrError);
      }
    }
    
    return data;
  }
}

module.exports = { SpaceBabyService };
