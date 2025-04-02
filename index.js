const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
// Import Jimp correctly
const Jimp = require("jimp");
const { createClient } = require("@supabase/supabase-js");
// Load environment variables
require('dotenv').config();

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service role key for full access
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Storage inspection functions
async function listAllBuckets() {
    console.log("\n[STORAGE INSPECTOR] Listing all available buckets...");
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
        console.error("[STORAGE INSPECTOR] Error listing buckets:", error);
        return;
    }
    
    console.log(`[STORAGE INSPECTOR] Found ${data.length} buckets:`);
    data.forEach(bucket => {
        console.log(`- ${bucket.name} (${bucket.id})`);
    });
    return data;
}

async function listBucketContents(bucketName, prefix = '') {
    console.log(`\n[STORAGE INSPECTOR] Listing contents of bucket '${bucketName}' with prefix '${prefix || 'root'}'...`);
    const { data, error } = await supabase.storage.from(bucketName).list(prefix);
    
    if (error) {
        console.error(`[STORAGE INSPECTOR] Error listing contents of bucket '${bucketName}':`, error);
        return;
    }
    
    // Log what was returned directly
    console.log(`[STORAGE INSPECTOR] Raw data returned from Supabase:`, JSON.stringify(data, null, 2));
    
    if (!data || data.length === 0) {
        console.log(`[STORAGE INSPECTOR] Bucket '${bucketName}${prefix ? '/' + prefix : ''}' is empty`);
        return;
    }
    
    // Format and display the contents
    console.log(`[STORAGE INSPECTOR] Contents of bucket '${bucketName}${prefix ? '/' + prefix : ''}':`);
    
    const folders = data.filter(item => item.id === null);
    const files = data.filter(item => item.id !== null);
    
    if (folders.length > 0) {
        console.log(`[STORAGE INSPECTOR] Folders (${folders.length}):`);
        folders.forEach(folder => {
            console.log(`- 📁 ${folder.name}`);
        });
    }
    
    if (files.length > 0) {
        console.log(`[STORAGE INSPECTOR] Files (${files.length}):`);
        files.forEach(file => {
            console.log(`- 📄 ${file.name} (${(file.metadata?.size / 1024).toFixed(2)} KB)`);
        });
    }
    
    // Recursively list contents of subfolders
    for (const folder of folders) {
        const newPrefix = prefix ? `${prefix}/${folder.name}` : folder.name;
        await listBucketContents(bucketName, newPrefix);
    }
    
    return data;
}

// Add the missing checkBucketPolicy function
async function checkBucketPolicy(bucketName) {
    console.log(`[STORAGE INSPECTOR] Checking policy for bucket '${bucketName}'...`);
    
    try {
        const { data, error } = await supabase.storage.getBucket(bucketName);
        
        if (error) {
            console.error(`[STORAGE INSPECTOR] Error getting bucket details: ${error.message}`);
            return;
        }
        
        console.log(`[STORAGE INSPECTOR] Bucket '${bucketName}' details:`, data);
        console.log(`[STORAGE INSPECTOR] Public access: ${data.public ? 'YES' : 'NO'}`);
        
        if (!data.public) {
            console.warn(`[WARNING] ⚠️ Bucket '${bucketName}' is NOT public. Uploaded files may not be accessible.`);
            console.warn(`[WARNING] Update bucket settings in Supabase dashboard or use the following API call:`);
            console.warn(`[WARNING] await supabase.storage.updateBucket('${bucketName}', { public: true });`);

            // Try to update bucket to public
            console.log(`[STORAGE INSPECTOR] Attempting to update bucket '${bucketName}' to public...`);
            const { error: updateError } = await supabase.storage.updateBucket(bucketName, { public: true });
            
            if (updateError) {
                console.error(`[STORAGE INSPECTOR] Failed to update bucket: ${updateError.message}`);
            } else {
                console.log(`[STORAGE INSPECTOR] ✅ Successfully updated bucket '${bucketName}' to public`);
            }
        }
    } catch (error) {
        console.error(`[STORAGE INSPECTOR] Exception checking bucket policy: ${error.message}`);
    }
}

// Canvas Setup
const width = 512, height = 512;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

// Add debugging options
const DEBUG = {
    SKIP_PIXELATION: process.env.SKIP_PIXELATION === 'true',
    INSPECT_BUCKET_POLICY: true,
    SAVE_INTERMEDIATE_LAYERS: process.env.DEBUG_LAYERS === 'true',
    SHOW_TRANSPARENCY_INFO: true
};

// Define available species folders
const availableSpecies = ["indigo", "green"];

// Get the specified species from environment variable or randomly choose
function getSpeciesToGenerate() {
    // If SPECIES env var is set, use that (indigo, green, or random)
    const speciesEnv = process.env.SPECIES?.toLowerCase();
    
    if (speciesEnv === "random") {
        // Randomly choose between available species
        const randomIndex = Math.floor(Math.random() * availableSpecies.length);
        const species = availableSpecies[randomIndex];
        console.log(`[SPECIES] Randomly selected species: ${species}`);
        return species;
    }
    else if (availableSpecies.includes(speciesEnv)) {
        console.log(`[SPECIES] Using specified species: ${speciesEnv}`);
        return speciesEnv;
    }
    
    // Default to indigo if not specified or invalid
    console.log(`[SPECIES] Using default species: indigo`);
    return "indigo";
}

// Updated NFT Layers structure to include binky and match the exact folder names in Supabase
const layerConfig = [
    { category: "background", type: "background" }, // Background is usually first
    { category: "head", type: "base" },            // Base head/bodies
    { category: "eyes", type: "feature" },         // Eyes
    { category: "clothing", type: "outfit" },      // Clothing/outfits
    { category: "neck", type: "accessory" },       // Neck accessories
    { category: "hats", type: "accessory" },       // Hats
    { category: "binky", type: "accessory", optional: true }, // Binky (pacifier)
    { category: "special", type: "special", optional: true }  // Special items (optional)
];

const outputFolder = "./output/";
if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);

// Create a tracking object to ensure we don't draw the same layer type twice
const layerTracker = {};

// Move the getRandomComponent function declaration above where it's first used
async function getRandomComponent(layerInfo, species) {
    const { category, type } = layerInfo;
    const fullPath = `${species}/${category}`; 
    console.log(`[getRandomComponent] Fetching components for layer: ${fullPath}...`);
    
    const { data, error } = await supabase.storage.from("space-babiez").list(fullPath);
    
    // Log the raw response for debugging
    console.log(`[getRandomComponent] Raw Supabase response for ${fullPath}:`, JSON.stringify(data, null, 2));
    
    if (error) {
        console.error(`[ERROR] Failed to fetch components for layer ${fullPath}:`, error);
        throw error;
    }
    
    console.log(`[getRandomComponent] Found ${data?.length || 0} components for layer: ${fullPath}`);
    
    // Check if there are no components for this layer
    if (!data || data.length === 0) {
        // If this is an optional layer, we can skip it
        if (layerInfo.optional) {
            console.log(`[getRandomComponent] No components found for optional layer: ${fullPath}, skipping...`);
            return null;
        }
        console.error(`[ERROR] No components found for required layer: ${fullPath}`);
        throw new Error(`No components found for layer: ${fullPath}. Please add image files to the ${fullPath} folder in your Supabase bucket.`);
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
                url: `${SUPABASE_URL}/storage/v1/object/public/space-babiez/${fullPath}/${file.name}`,
                type: fileType,
                name: file.name
            };
        });
    
    console.log(`[getRandomComponent] Filtered ${files.length} image files for layer: ${fullPath}`);
    
    if (files.length > 0) {
        // Log file types found
        const svgCount = files.filter(f => f.type === 'svg').length;
        const bitmapCount = files.filter(f => f.type === 'bitmap').length;
        console.log(`[getRandomComponent] Found ${svgCount} SVG and ${bitmapCount} bitmap files`);
    }
    
    if (files.length === 0) {
        // If this is an optional layer, we can skip it
        if (layerInfo.optional) {
            console.log(`[getRandomComponent] No image files found for optional layer: ${fullPath}, skipping...`);
            return null;
        }
        console.error(`[ERROR] No image files found for layer: ${fullPath}`);
        throw new Error(`No image files found for layer: ${fullPath}. Please ensure you have image files in the ${fullPath} folder.`);
    }
    
    // FIX: Decide which file type to use first, then select a random file from that subset
    let selectedFile;
    
    // For base (head) and feature layers, prefer SVG if available
    if ((type === "base" || type === "feature") && files.some(f => f.type === 'svg')) {
        const svgFiles = files.filter(f => f.type === 'svg');
        selectedFile = svgFiles[Math.floor(Math.random() * svgFiles.length)];
        console.log(`[getRandomComponent] Selected SVG for ${category} layer: ${selectedFile.name}`);
    } else {
        // For other layers or if no SVG is available, select any file type
        selectedFile = files[Math.floor(Math.random() * files.length)];
        console.log(`[getRandomComponent] Selected: ${selectedFile.name} (${selectedFile.type})`);
    }
    
    return {
        url: selectedFile.url, 
        name: selectedFile.name,
        category: category,
        type: type
    };
}

// Define or fix the missing checkImageTransparency function
async function checkImageTransparency(imagePath, layerType) {
    if (!fs.existsSync(imagePath)) {
        console.error(`[TRANSPARENCY] File does not exist: ${imagePath}`);
        return false;
    }
    
    try {
        const image = await Jimp.read(imagePath);
        let hasTransparency = false;
        let transparentPixels = 0;
        let totalPixels = image.getWidth() * image.getHeight();
        
        image.scan(0, 0, image.getWidth(), image.getHeight(), function(x, y, idx) {
            // Get alpha value at this pixel position (idx+3 is alpha)
            const alpha = this.bitmap.data[idx + 3];
            if (alpha < 255) {
                hasTransparency = true;
                transparentPixels++;
            }
        });
        
        const transparencyPercent = (transparentPixels / totalPixels * 20).toFixed(2);
        console.log(`[TRANSPARENCY] ${path.basename(imagePath)} (${layerType}): ${hasTransparency ? '🔍 Has transparency' : '⬜ No transparency'} (${transparencyPercent}% transparent)`);
        
        return hasTransparency;
    } catch (error) {
        console.error(`[TRANSPARENCY] Error analyzing ${imagePath}: ${error.message}`);
        return false;
    }
}

// Modify generate2DImage function to fix the stacking/layering issue
async function generate2DImage(id) {
    console.log(`\n[generate2DImage] Starting image generation for NFT #${id}...`);
    
    try {
        if (!fs.existsSync(outputFolder)) {
            console.log(`[generate2DImage] Creating output folder: ${outputFolder}`);
            fs.mkdirSync(outputFolder, { recursive: true });
        }

        const species = getSpeciesToGenerate();
        console.log(`[generate2DImage] Generating NFT for species: ${species}`);
        
        // Make sure the canvas is completely cleared at the start
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        let attributes = [];
        let backgroundDrawn = false;
        
        // Track all categories that have been drawn to prevent duplicates
        const drawnCategories = new Set();
        
        attributes.push({
            trait_type: "species",
            value: species
        });
        console.log(`[generate2DImage] Added attribute: species=${species}`);
        
        // Process layers in the defined order
        for (let layerIndex = 0; layerIndex < layerConfig.length; layerIndex++) {
            const layerInfo = layerConfig[layerIndex];
            console.log(`[generate2DImage] Processing layer (${layerIndex + 1}/${layerConfig.length}): ${layerInfo.category}`);
            
            // Skip if we've already drawn this exact category
            if (drawnCategories.has(layerInfo.category)) {
                console.log(`[generate2DImage] Skipping ${layerInfo.category} - this category has already been processed`);
                continue;
            }
            
            try {
                const componentInfo = await getRandomComponent(layerInfo, species);
                
                if (!componentInfo) {
                    console.log(`[generate2DImage] No component selected for ${layerInfo.category}, skipping...`);
                    continue;
                }
                
                const fileName = componentInfo.name;
                const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                
                console.log(`[generate2DImage] Selected component: ${fileNameWithoutExt} for ${layerInfo.category}`);
                
                // Draw this layer
                const layerDrawn = await drawLayer(componentInfo, id);
                
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
                    console.log(`[generate2DImage] Added attribute: ${layerInfo.category}=${fileNameWithoutExt}`);
                    
                    // Save intermediate image if debugging is enabled
                    if (DEBUG.SAVE_INTERMEDIATE_LAYERS) {
                        const layerProgressPath = `${outputFolder}layer_${layerIndex + 1}_${layerInfo.category}_${id}.png`;
                        fs.writeFileSync(layerProgressPath, canvas.toBuffer("image/png"));
                        console.log(`[generate2DImage] 🔍 Saved progress after adding ${layerInfo.category} layer to ${layerProgressPath}`);
                    }
                } else {
                    console.log(`[generate2DImage] Layer ${layerInfo.category} was not drawn successfully, skipping attribute`);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to process layer ${layerInfo.category}:`, error);
            }
        }

        if (!backgroundDrawn) {
            console.log(`[generate2DImage] No background was successfully drawn, ensuring white background`);
        }

        const nftPath = `${outputFolder}${species}_nft_${id}.png`;
        console.log(`[generate2DImage] Saving final generated image to: ${nftPath}`);
        
        try {
            fs.writeFileSync(nftPath, canvas.toBuffer("image/png"));
            console.log(`[generate2DImage] ✅ Generated 2D NFT Image: ${nftPath}`);
        } catch (saveError) {
            console.error(`[ERROR] Failed to save image to ${nftPath}: ${saveError.message}`);
            const altPath = `${outputFolder}fallback_${species}_${id}.png`;
            fs.writeFileSync(altPath, canvas.toBuffer("image/png"));
            console.log(`[generate2DImage] ✅ Saved to alternative path: ${altPath}`);
            return { nftPath: altPath, attributes, species };
        }

        return { nftPath, attributes, species };
    } catch (error) {
        console.error(`[CRITICAL ERROR] Failed to generate image: ${error.message}`);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = 'black';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Error generating NFT #${id}`, width/2, height/2);
        
        const emergencyPath = `${outputFolder}emergency_${id}.png`;
        fs.writeFileSync(emergencyPath, canvas.toBuffer("image/png"));
        console.log(`[generate2DImage] ⚠️ Created emergency fallback image: ${emergencyPath}`);
        
        return { 
            nftPath: emergencyPath, 
            attributes: [{ trait_type: "error", value: "generation_failed" }],
            species: "error" 
        };
    }
}

// Fix the drawLayer function to prevent overlapping images
async function drawLayer(imageInfo, id) {
    if (!imageInfo || !imageInfo.url) return false; // Skip if no image (for optional layers)
    
    const { url: imageUrl, category, type } = imageInfo;
    console.log(`[drawLayer] Drawing ${category} from: ${imageUrl}`);
    
    try {
        // Check if it's an SVG based on URL
        const isSvg = imageUrl.toLowerCase().endsWith('.svg');
        console.log(`[drawLayer] File type: ${isSvg ? 'SVG' : 'PNG/JPG'}`);
        
        try {
            const image = await loadImage(imageUrl);
            console.log(`[drawLayer] Image dimensions: ${image.width}x${image.height}, Canvas: ${width}x${height}`);
            
            // Set composite mode to draw new layers on top of existing content
            ctx.globalCompositeOperation = 'source-over';
            
            // Calculate positioning based on layer type - SIMPLIFIED LOGIC
            let drawX = 0, drawY = 0, drawWidth, drawHeight;
            
            if (type === 'background') {
                // Background always covers the entire canvas
                drawWidth = width;
                drawHeight = height;
                console.log(`[drawLayer] Background will cover entire canvas`);
            } 
            else if (type === 'base') {
                // Base/head should be centered and take up most of the canvas
                // Calculate scaling to fit the canvas while maintaining aspect ratio
                const scale = Math.min(width / image.width, height / image.height);
                drawWidth = image.width * scale;
                drawHeight = image.height * scale;
                // Center horizontally
                drawX = (width - drawWidth) / 2;
                // Position slightly higher than center
                drawY = (height - drawHeight) * 0.4;
                console.log(`[drawLayer] Base positioned centered: scale=${scale.toFixed(2)}`);
            }
            else if (type === 'feature') {
                // Features (eyes) should be positioned relative to head size
                const scale = Math.min(width / image.width * 0.8, height / image.height * 0.5);
                drawWidth = image.width * scale;
                drawHeight = image.height * scale;
                drawX = (width - drawWidth) / 2;
                drawY = height * 0.3; // Position eyes higher on the face
                console.log(`[drawLayer] Feature positioned: scale=${scale.toFixed(2)}`);
            }
            else if (type === 'outfit') {
                // UPDATED: Make outfits wider to cover arms better while keeping them high enough
                const heightScale = Math.min(width / image.width * 0.9, height / image.height * 0.9);
                const widthScale = heightScale * 1.15; // Make width 15% wider to better cover arms
                
                drawWidth = image.width * widthScale;
                drawHeight = image.height * heightScale;
                
                // Ensure the outfit stays centered even with increased width
                drawX = (width - drawWidth) / 2;
                drawY = height * 0.1; // Keep the higher positioning
                
                console.log(`[drawLayer] Outfit positioned higher and wider: widthScale=${widthScale.toFixed(2)}, heightScale=${heightScale.toFixed(2)}, y=${drawY}`);
            }
            else {
                // Accessories and other items - keep them properly sized
                const scale = Math.min(width / image.width * 0.7, height / image.height * 0.5);
                drawWidth = image.width * scale;
                drawHeight = image.height * scale;
                drawX = (width - drawWidth) / 2;
                
                // Adjust Y position based on category
                if (category === 'hats') {
                    drawY = height * 0.05; // Hats go on top
                } else if (category === 'neck') {
                    drawY = height * 0.69; // UPDATED: Lowered neck items to where clothing meets head
                    console.log(`[drawLayer] Positioning neck layer at the clothing/head junction: y=${drawY}`);
                } else if (category === 'binky') {
                    drawY = height * 0.4; // Binky goes near mouth
                } else {
                    drawY = height * 0.2; // Default accessory position
                }
                
                console.log(`[drawLayer] Accessory (${category}) positioned: scale=${scale.toFixed(2)}, y=${drawY}`);
            }
            
            // Log detailed positioning information
            console.log(`[drawLayer] Drawing ${category} at: x=${drawX}, y=${drawY}, width=${drawWidth}, height=${drawHeight}`);
            
            // Draw the image with calculated positioning
            try {
                ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
                console.log(`[drawLayer] ✅ Successfully drew ${category}`);
                return true;
            } catch (drawError) {
                console.error(`[ERROR] Failed to draw ${category}:`, drawError.message);
                
                if (type === 'background') {
                    // Fallback for background
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    return true;
                }
                return false;
            }
        } catch (imageError) {
            console.error(`[ERROR] Failed to load image from ${imageUrl}: ${imageError.message}`);
            
            if (type === 'background') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                return true;
            }
            return false;
        }
    } catch (outerError) {
        console.error(`[ERROR] Unexpected error in drawLayer:`, outerError.message);
        return false;
    }
}

// Fix the pixelateImage function to properly handle errors
async function pixelateImage(inputPath, outputPath) {
    console.log(`[pixelateImage] Pixelating image: ${inputPath}...`);
    
    if (!fs.existsSync(inputPath)) {
        console.error(`[ERROR] Input file does not exist: ${inputPath}`);
        return null;
    }
    
    // Log the file size to help with debugging
    const inputStats = fs.statSync(inputPath);
    console.log(`[pixelateImage] Input file size: ${inputStats.size} bytes`);
    
    if (DEBUG.SKIP_PIXELATION) {
        console.log(`[pixelateImage] Skipping pixelation (DEBUG.SKIP_PIXELATION=true)`);
        try {
            fs.copyFileSync(inputPath, outputPath);
            return outputPath;
        } catch (copyError) {
            console.error(`[ERROR] Failed to copy file: ${copyError.message}`);
            return null;
        }
    }
    
    try {
        // Read the file as a buffer first
        const buffer = fs.readFileSync(inputPath);
        console.log(`[pixelateImage] Successfully read file into buffer: ${buffer.length} bytes`);
        
        // Create Jimp image from buffer
        const image = await Jimp.read(buffer);
        console.log(`[pixelateImage] Successfully created Jimp image: ${image.getWidth()}x${image.getHeight()}`);
        
        // Apply pixelation effect
        const pixelSize = 8
        image.pixelate(pixelSize);
        console.log(`[pixelateImage] Applied pixelation effect with size ${pixelSize}`);
        
        // Save the pixelated image
        await image.writeAsync(outputPath);
        console.log(`[pixelateImage] ✅ Pixelated image saved to: ${outputPath}`);
        
        // Verify the file was created
        if (fs.existsSync(outputPath)) {
            const outputStats = fs.statSync(outputPath);
            console.log(`[pixelateImage] Output file size: ${outputStats.size} bytes`);
        } else {
            console.error(`[ERROR] Output file was not created: ${outputPath}`);
        }
        
        return outputPath;
    } catch (error) {
        console.error(`[ERROR] Failed to pixelate image: ${inputPath}`, error);
        
        // As a fallback, just copy the original file
        console.log(`[pixelateImage] ⚠️ Using original image as fallback`);
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

// Fix the uploadToSupabase function
async function uploadToSupabase(filePath, bucket, nftId) {
    if (!fs.existsSync(filePath)) {
        console.error(`[uploadToSupabase] ERROR: File does not exist: ${filePath}`);
        return null;
    }
    
    const fileName = path.basename(filePath);
    const species = fileName.startsWith("green_") ? "green" : 
                  fileName.startsWith("indigo_") ? "indigo" : "unknown";
    
    console.log(`[uploadToSupabase] Uploading ${fileName} to ${bucket}/nfts/${species}/${nftId}/...`);
    
    try {
        const fileContent = fs.readFileSync(filePath);
        console.log(`[uploadToSupabase] File size: ${fileContent.length} bytes`);
        
        // Ensure the folder exists
        const folderPath = `nfts/${species}/${nftId}`;
        await createFolderIfNotExists(bucket, folderPath);
        
        const { data, error } = await supabase.storage.from(bucket).upload(
            `${folderPath}/${fileName}`, 
            fileContent, 
            { contentType: "image/png", upsert: true }
        );
        
        if (error) {
            console.error(`[uploadToSupabase] Upload failed for ${fileName}:`, error);
            return null;
        }
        
        const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${folderPath}/${fileName}`;
        console.log(`[uploadToSupabase] ✅ Upload successful: ${fileUrl}`);
        
        return fileUrl;
    } catch (error) {
        console.error(`[uploadToSupabase] Exception during upload:`, error);
        return null;
    }
}

// Update the generateNFT function to better handle pixelation
async function generateNFT(id) {
    console.log(`\n======= GENERATING NFT #${id} =======`);
    
    ctx.clearRect(0, 0, width, height);
    
    console.log(`[generateNFT] Step 1: Generating 2D image...`);
    const { nftPath, attributes, species } = await generate2DImage(id);
    
    // Check if the output file was successfully created
    if (!fs.existsSync(nftPath)) {
        console.error(`[ERROR] 2D image was not created: ${nftPath}`);
        throw new Error(`Failed to create 2D image at ${nftPath}`);
    }
    
    console.log(`[generateNFT] Step 2: Creating pixelated version...`);
    const pixelatedPath = `${outputFolder}${species}_nft_${id}_pixelated.png`;
    let pixelatedImagePath;
    
    try {
        pixelatedImagePath = await pixelateImage(nftPath, pixelatedPath);
        if (!pixelatedImagePath || !fs.existsSync(pixelatedImagePath)) {
            console.error(`[ERROR] Pixelation failed. Falling back to original image.`);
            fs.copyFileSync(nftPath, pixelatedPath);
            pixelatedImagePath = pixelatedPath;
        }
    } catch (pixelateError) {
        console.error(`[ERROR] Exception during pixelation: ${pixelateError.message}`);
        console.log(`[generateNFT] Copying original as fallback...`);
        fs.copyFileSync(nftPath, pixelatedPath);
        pixelatedImagePath = pixelatedPath;
    }
    
    console.log(`[generateNFT] Step 3: Uploading 2D image to Supabase...`);
    const nftUrl = await uploadToSupabase(nftPath, "nft-storage", id);
    
    console.log(`[generateNFT] Step 4: Uploading pixelated image to Supabase...`);
    const pixelatedUrl = await uploadToSupabase(pixelatedImagePath, "nft-storage", id);

    console.log(`[generateNFT] Step 5: Creating and saving metadata...`);
    const metadata = {
        id,
        name: `${species.charAt(0).toUpperCase() + species.slice(1)} Babiez #${id}`,
        description: `Generated ${species} Space Babiez NFT with 2D and pixel art`,
        images: { "2D": nftUrl, "pixelated": pixelatedUrl },
        attributes
    };
    fs.writeFileSync(`${outputFolder}${species}_nft_${id}.json`, JSON.stringify(metadata, null, 2));
    console.log(`[generateNFT] ✅ Metadata saved: ${outputFolder}${species}_nft_${id}.json`);
    console.log(`======= NFT #${id} GENERATION COMPLETE =======\n`);
    
    return { id, species, nftUrl, pixelatedUrl, metadata };
}

async function createBucketIfNotExists(bucketName, isPublic = true) {
    console.log(`[STORAGE SETUP] Checking if bucket '${bucketName}' exists...`);
    
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
        console.error(`[STORAGE SETUP] Error listing buckets: ${listError.message}`);
        console.error("[STORAGE SETUP] This may be a permissions issue. Make sure your API key has storage admin privileges.");
        return false;
    }
    
    const bucketExists = buckets && buckets.some(bucket => bucket.name === bucketName);
    
    if (bucketExists) {
        console.log(`[STORAGE SETUP] Bucket '${bucketName}' already exists.`);
        return true;
    }
    
    console.log(`[STORAGE SETUP] Creating bucket '${bucketName}'...`);
    const { data, error } = await supabase.storage.createBucket(bucketName, {
        public: isPublic
    });
    
    if (error) {
        console.error(`[STORAGE SETUP] Error creating bucket '${bucketName}': ${error.message}`);
        console.error("[STORAGE SETUP] This may be a permissions issue. Make sure your API key has storage admin privileges.");
        return false;
    }
    
    console.log(`[STORAGE SETUP] ✅ Successfully created bucket '${bucketName}'`);
    return true;
}

async function createFolderIfNotExists(bucketName, folderPath) {
    console.log(`[STORAGE SETUP] Checking folder '${folderPath}' in bucket '${bucketName}'...`);
    
    try {
        const { data, error } = await supabase.storage.from(bucketName).list(folderPath);
        
        if (!error) {
            console.log(`[STORAGE SETUP] ✅ Folder '${folderPath}' already exists`);
            return true;
        }
        
        console.log(`[STORAGE SETUP] Creating folder '${folderPath}'...`);
        const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(`${folderPath}/.keep`, new Uint8Array(0), {
                contentType: 'text/plain',
                upsert: true
            });
        
        if (uploadError && uploadError.message !== 'The resource already exists') {
            console.error(`[STORAGE SETUP] Error creating folder '${folderPath}': ${uploadError.message}`);
            return false;
        }
        
        console.log(`[STORAGE SETUP] ✅ Folder '${folderPath}' is ready`);
        return true;
    } catch (error) {
        console.error(`[STORAGE SETUP] Exception for folder '${folderPath}': ${error.message}`);
        return false;
    }
}

async function initializeStorage() {
    console.log("\n======= INITIALIZING STORAGE =======");
    
    const componentsCreated = await createBucketIfNotExists("space-babiez", true);
    const storageCreated = await createBucketIfNotExists("nft-storage", true);
    
    if (!componentsCreated || !storageCreated) {
        console.error("[STORAGE SETUP] Failed to create required buckets. Check your Supabase permissions.");
        console.error("[STORAGE SETUP] Your API key needs to have storage admin privileges.");
        return false;
    }
    
    let allFoldersCreated = true;
    
    for (const species of availableSpecies) {
        console.log(`[STORAGE SETUP] Initializing folders for species: ${species}`);
        
        for (let layer of layerConfig) {
            const folderCreated = await createFolderIfNotExists("space-babiez", `${species}/${layer.category}`);
            if (!folderCreated) {
                allFoldersCreated = false;
                console.error(`[STORAGE SETUP] Failed to create folder '${species}/${layer.category}' in space-babiez bucket.`);
            }
        }
        
        const speciesNftFolderCreated = await createFolderIfNotExists("nft-storage", `nfts/${species}`);
        if (!speciesNftFolderCreated) {
            allFoldersCreated = false;
            console.error(`[STORAGE SETUP] Failed to create 'nfts/${species}' folder in nft-storage bucket.`);
        }
    }
    
    if (!allFoldersCreated) {
        console.error("[STORAGE SETUP] Some folders could not be created. Check your Supabase permissions.");
        return false;
    }
    
    console.log("[STORAGE SETUP] ✅ Storage initialization complete!");
    return true;
}

async function checkPermissions() {
    console.log("\n======= CHECKING SUPABASE PERMISSIONS =======");
    
    try {
        const { data, error } = await supabase.storage.listBuckets();
        
        if (error) {
            console.error("[PERMISSIONS] Error listing buckets:", error.message);
            console.error("[PERMISSIONS] ❌ Your API key may not have the necessary permissions.");
            return false;
        }
        
        console.log("[PERMISSIONS] ✅ Successfully listed buckets. Basic permissions check passed.");
        
        const testBucketName = `permission-test-${Date.now()}`;
        console.log(`[PERMISSIONS] Testing admin permissions by creating test bucket '${testBucketName}'...`);
        
        const { error: createError } = await supabase.storage.createBucket(testBucketName, {
            public: false
        });
        
        if (createError) {
            console.error("[PERMISSIONS] ❌ Failed to create test bucket:", createError.message);
            console.error("[PERMISSIONS] Your API key likely doesn't have storage admin privileges.");
            return false;
        }
        
        const { error: deleteError } = await supabase.storage.deleteBucket(testBucketName);
        
        if (deleteError) {
            console.error("[PERMISSIONS] ❌ Failed to delete test bucket:", deleteError.message);
            console.warn("[PERMISSIONS] A test bucket was created but could not be deleted. You may want to clean this up manually.");
            return false;
        }
        
        console.log("[PERMISSIONS] ✅ Successfully created and deleted test bucket. Admin permissions confirmed.");
        return true;
    } catch (error) {
        console.error("[PERMISSIONS] Exception during permissions check:", error.message);
        return false;
    }
}

async function checkComponentTransparency() {
    if (!DEBUG.SHOW_TRANSPARENCY_INFO) return;
    
    console.log("\n======= CHECKING COMPONENT TRANSPARENCY =======");
    
    for (const species of availableSpecies) {
        console.log(`[TRANSPARENCY-CHECK] Checking files for species: ${species}`);
        
        for (let layer of layerConfig) {
            const { data, error } = await supabase.storage.from("space-babiez").list(`${species}/${layer.category}`);
            if (error || !data || data.length === 0) continue;
            
            const pngFiles = data.filter(file => file.name.toLowerCase().endsWith('.png'));
            
            for (let file of pngFiles) {
                const fileUrl = `${outputFolder}temp_${file.name}`;
                
                try {
                    const { data: fileData } = await supabase.storage
                        .from("space-babiez")
                        .download(`${species}/${layer.category}/${file.name}`);
                    
                    if (fileData) {
                        fs.writeFileSync(fileUrl, Buffer.from(await fileData.arrayBuffer()));
                        await checkImageTransparency(fileUrl, layer.category);
                        fs.unlinkSync(fileUrl);
                    }
                } catch (err) {
                    console.error(`Error checking transparency for ${file.name}:`, err);
                }
            }
        }
    }
}

async function generateMultipleNFTs(count = 1) {
    console.log(`\n======= GENERATING ${count} NFTs =======`);
    
    const results = [];
    
    for (let i = 1; i <= count; i++) {
        console.log(`\n[Generator] Starting NFT #${i} of ${count}`);
        try {
            const result = await generateNFT(i);
            results.push(result);
            console.log(`[Generator] ✅ Completed NFT #${i} of ${count}`);
        } catch (error) {
            console.error(`[Generator] ❌ Failed to generate NFT #${i}:`, error);
        }
    }
    
    console.log(`\n======= COMPLETED GENERATING ${count} NFTs =======`);
    console.log(`Successfully generated: ${results.length}/${count} NFTs`);
    
    return results;
}

async function setupAndGenerateNFT() {
    try {
        const hasPermissions = await checkPermissions();
        if (!hasPermissions) {
            console.error("\n❌ PERMISSION CHECK FAILED");
            console.error("Your Supabase API key doesn't have the necessary permissions.");
            console.error("Please go to your Supabase dashboard > Settings > API and generate a service role key.");
            console.error("Make sure this key has full access to Storage.");
            return;
        }
        
        const initialized = await initializeStorage();
        if (!initialized) {
            console.error("\n❌ STORAGE INITIALIZATION FAILED");
            return;
        }
        
        console.log("\n======= STORAGE INSPECTION =======");
        await listAllBuckets();
        
        if (DEBUG.INSPECT_BUCKET_POLICY) {
            await checkBucketPolicy("space-babiez");
            await checkBucketPolicy("nft-storage");
        }
        
        await listBucketContents("space-babiez");
        
        await checkComponentTransparency();
        
        console.log("\n⚠️ IMPORTANT: Before generating NFTs, make sure your bucket has image files:");
        console.log("   1. Your Supabase bucket already has these folders:");
        for (const species of availableSpecies) {
            console.log(`      - ${species}: ${layerConfig.map(layer => layer.category).join(", ")}`);
        }
        console.log("   2. Make sure the bucket and files are set to public access");
        console.log("   3. Each folder should contain PNG or SVG image files");
        
        const proceed = process.env.FORCE_GENERATE === 'true';
        if (!proceed) {
            console.log("\n❌ NFT generation skipped. After uploading component files, set FORCE_GENERATE=true to proceed.");
            console.log("   Example: FORCE_GENERATE=true node index.js");
            console.log("   To specify a species: FORCE_GENERATE=true SPECIES=green node index.js");
            console.log("   Available species: indigo, green, random");
            return;
        }
        
        const count = process.env.COUNT ? parseInt(process.env.COUNT) : 1;
        
        if (count > 1) {
            await generateMultipleNFTs(count);
        } else {
            await generateNFT(1);
        }
    } catch (error) {
        console.error("Error during execution:", error);
        console.error("\n=== TROUBLESHOOTING GUIDE ===");
        console.error("1. Make sure you have uploaded PNG or SVG files to each layer folder in your Supabase bucket");
        console.error("2. Check the layer names in your code match exactly with your Supabase folder names");
        console.error("3. Verify your Supabase URL and API key are correct");
        console.error("4. Ensure your Supabase storage permissions allow listing and reading files");
        console.error("5. To skip pixelation (if that's causing issues): SKIP_PIXELATION=true FORCE_GENERATE=true node index.js");
    }
}

setupAndGenerateNFT();