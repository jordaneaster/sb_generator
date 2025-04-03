/**
 * Default layer configuration for NFT generation
 * @module defaultLayers
 */
module.exports = [
  { category: "background", type: "background" },     // Background is usually first
  { category: "head", type: "base" },                 // Base head/bodies
  { category: "eyes", type: "feature" },              // Eyes
  { category: "clothing", type: "outfit" },           // Clothing/outfits
  { category: "neck", type: "accessory" },            // Neck accessories
  { category: "hats", type: "accessory" },            // Hats
  { category: "binky", type: "accessory", optional: true }, // Binky (pacifier)
  { category: "special", type: "special", optional: true }  // Special items (optional)
];
