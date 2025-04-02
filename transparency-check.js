const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const { createClient } = require('@supabase/supabase-js');
// Load environment variables
require('dotenv').config();

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service role key for transparency checks
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// NFT Layers in Supabase - Reorder to ensure proper layering
const layers = ["background", "bodies", "eyes", "accessories"];
const outputFolder = "./output/";

async function checkImageTransparency(layer, filePath) {
    console.log(`Analyzing ${layer}/${path.basename(filePath)}...`);
    
    // Check if it's an SVG file
    if (filePath.toLowerCase().endsWith('.svg')) {
        console.log(`${layer}/${path.basename(filePath)} is an SVG file with natural transparency support`);
        
        // For SVG files, just report that they support transparency naturally
        return { 
            file: path.basename(filePath),
            layer,
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
        
        if (width !== 512 || height !== 512) {
            console.warn(`⚠️ WARNING: Image size is ${width}x${height}, but should be 512x512 for consistent layering`);
        }
        
        let transparentPixels = 0;
        let totalPixels = width * height;
        
        // Count transparent pixels
        image.scan(0, 0, width, height, function(x, y, idx) {
            // idx is the position of this pixel in the bitmap buffer
            // rgba values are sequential, so idx+3 is alpha
            const alpha = this.bitmap.data[idx + 3];
            if (alpha < 255) {
                transparentPixels++;
            }
        });
        
        const transparencyPercent = (transparentPixels / totalPixels) * 100;
        console.log(`${layer}/${path.basename(filePath)}: ${transparencyPercent.toFixed(2)}% transparency`);
        
        // Provide guidance based on layer and transparency level
        if (layer === 'background' && transparencyPercent > 5) {
            console.warn(`⚠️ WARNING: Background image has ${transparencyPercent.toFixed(2)}% transparency.`);
            console.warn(`   Background images should generally be fully opaque (0% transparency).`);
        } else if (layer !== 'background' && transparencyPercent < 30) {
            console.warn(`⚠️ WARNING: ${layer}/${path.basename(filePath)} has only ${transparencyPercent.toFixed(2)}% transparency.`);
            console.warn(`   Non-background layers should have significant transparent areas to layer correctly.`);
        }
        
        return { 
            file: path.basename(filePath),
            layer,
            width,
            height,
            transparentPixels,
            totalPixels,
            transparencyPercent
        };
    } catch (error) {
        console.error(`Error analyzing ${layer}/${path.basename(filePath)}:`, error);
        return null;
    }
}

async function checkAllComponents() {
    console.log("Checking transparency of all component images...");
    
    const results = [];
    
    for (let layer of layers) {
        console.log(`\nChecking layer: ${layer}`);
        
        const { data, error } = await supabase.storage.from("nft-components").list(layer);
        if (error) {
            console.error(`Error listing files in ${layer}:`, error);
            continue;
        }
        
        if (!data || data.length === 0) {
            console.log(`No files found in layer: ${layer}`);
            continue;
        }
        
        // Filter for both PNG and SVG files
        const imageFiles = data.filter(file => 
            file.name.toLowerCase().endsWith('.png') || 
            file.name.toLowerCase().endsWith('.svg')
        );
        console.log(`Found ${imageFiles.length} image files in ${layer} (${
            imageFiles.filter(f => f.name.toLowerCase().endsWith('.svg')).length
        } SVGs, ${
            imageFiles.filter(f => f.name.toLowerCase().endsWith('.png')).length
        } PNGs)`);
        
        for (const file of imageFiles) {
            // Download the file for analysis
            const { data: fileData, error: downloadError } = await supabase.storage
                .from("nft-components")
                .download(`${layer}/${file.name}`);
                
            if (downloadError) {
                console.error(`Error downloading ${layer}/${file.name}:`, downloadError);
                continue;
            }
            
            const tempFilePath = path.join(outputFolder, `temp_${file.name}`);
            try {
                fs.writeFileSync(tempFilePath, Buffer.from(await fileData.arrayBuffer()));
                const result = await checkImageTransparency(layer, tempFilePath);
                if (result) {
                    results.push(result);
                }
                // Clean up temp file
                fs.unlinkSync(tempFilePath);
            } catch (err) {
                console.error(`Error processing ${layer}/${file.name}:`, err);
            }
        }
    }
    
    // Print summary report
    console.log("\n=== TRANSPARENCY REPORT ===");
    console.log("Layer\tFile\tSize\tTransparency %");
    console.log("-".repeat(60));
    
    for (const result of results) {
        console.log(`${result.layer}\t${result.file}\t${result.width}x${result.height}\t${result.transparencyPercent ? result.transparencyPercent.toFixed(2) : "N/A"}%`);
    }
    
    return results;
}

module.exports = {
    checkTransparency: checkImageTransparency,
    checkAll: checkAllComponents
};

// Run directly if called from command line
if (require.main === module) {
    checkAllComponents()
        .then(() => console.log("Transparency check complete"))
        .catch(err => console.error("Error during transparency check:", err));
}
