// Simple component uploader for Supabase
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service role key for uploads
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadComponent(filePath, folder) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    
    const fileName = path.basename(filePath);
    console.log(`Uploading ${fileName} to ${folder}...`);
    
    const fileContent = fs.readFileSync(filePath);
    const contentType = fileName.toLowerCase().endsWith('.svg') ? 
        'image/svg+xml' : 'image/png';
    
    const { data, error } = await supabase.storage
        .from("nft-components")
        .upload(`${folder}/${fileName}`, fileContent, {
            contentType: contentType,
            upsert: true
        });
    
    if (error) {
        console.error(`Upload failed: ${error.message}`);
        return;
    }
    
    console.log(`✅ Upload successful!`);
    console.log(`URL: ${SUPABASE_URL}/storage/v1/object/public/nft-components/${folder}/${fileName}`);
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.log("Usage: node upload-component.js <file-path> <folder>");
        console.log("Example: node upload-component.js ./hat.png accessories");
        process.exit(1);
    }
    
    uploadComponent(args[0], args[1])
        .catch(err => console.error("Upload error:", err));
}

module.exports = { uploadComponent };
