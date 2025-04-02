import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Global variables 
let scene, camera, renderer, controls, terrain;
let currentHeightmapUrl = null;
let currentOptions = {};
let showWireframe = false;
let textureLayers = [];

// Debug logging function
function logDebug(message) {
  console.log(message);
}

// Main terrain generation class
class TerrainGenerator {
  constructor() {
    this.group = new THREE.Group();
    this.terrainMesh = null;
    this.width = 100;
    this.length = 100;
    this.heightScale = 10;
    this.resolution = 128;
    this.terrainType = 'heightmap';
    this.materials = {
      base: new THREE.MeshStandardMaterial({
        color: 0x8B5D33,
        side: THREE.DoubleSide
      })
    };
    
    // Godot-specific settings
    this.godotSettings = {
      generateCollision: true,
      optimizeForGodot: true,
      lodLevels: 2
    };
  }
  
  // Generate terrain from heightmap image
  generateFromHeightmap(heightmapUrl, options = {}) {
    // Store current settings
    currentHeightmapUrl = heightmapUrl;
    this.width = options.width || this.width;
    this.length = options.length || this.length;
    this.heightScale = options.heightScale || this.heightScale;
    this.resolution = options.resolution || this.resolution;
    this.terrainType = options.terrainType || this.terrainType;
    currentOptions = { ...options };
    
    // Clear existing terrain
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    
    return this._createTerrainFromHeightmap(heightmapUrl)
      .then(mesh => {
        this.terrainMesh = mesh;
        this.group.add(mesh);
        return mesh;
      });
  }
  
  // Create terrain mesh from heightmap
  _createTerrainFromHeightmap(heightmapUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      
      img.onload = () => {
        try {
          // Get heightmap data
          const heightData = this._getHeightDataFromImage(img);
          
          // Create geometry based on terrain type
          let geometry;
          
          switch(this.terrainType) {
            case 'heightmap-detail':
              geometry = this._createDetailedTerrain(heightData, img.width, img.height);
              break;
              
            case 'low-poly':
              geometry = this._createLowPolyTerrain(heightData, img.width, img.height);
              break;
              
            case 'voxel':
              geometry = this._createVoxelTerrain(heightData, img.width, img.height);
              break;
              
            case 'heightmap':
            default:
              geometry = this._createStandardTerrain(heightData, img.width, img.height);
          }
          
          // Create texture from heightmap
          const texture = new THREE.Texture(this._createTerrainTexture(img, heightData));
          texture.needsUpdate = true;
          
          // Apply texture to material
          if (this.materials.base.map) {
            this.materials.base.map.dispose();
          }
          this.materials.base.map = texture;
          
          // Create mesh
          const mesh = new THREE.Mesh(geometry, this.materials.base);
          
          // Center the terrain
          const box = new THREE.Box3().setFromObject(mesh);
          const center = box.getCenter(new THREE.Vector3());
          mesh.position.x -= center.x;
          mesh.position.z -= center.z;
          mesh.position.y -= box.min.y;
          
          resolve(mesh);
        } catch (error) {
          console.error("Error creating terrain:", error);
          reject(error);
        }
      };
      
      img.onerror = reject;
      img.src = heightmapUrl;
    });
  }
  
  // Extract height data from image
  _getHeightDataFromImage(img) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const width = img.width;
    const height = img.height;
    
    canvas.width = width;
    canvas.height = height;
    context.drawImage(img, 0, 0);
    
    const imgData = context.getImageData(0, 0, width, height).data;
    const heightData = new Float32Array(width * height);
    
    for (let i = 0; i < width * height; i++) {
      // Use brightness as height (average of RGB)
      const r = imgData[i * 4];
      const g = imgData[i * 4 + 1];
      const b = imgData[i * 4 + 2];
      const brightness = (r + g + b) / 3;
      
      // Normalize to 0-1 and apply height scale
      heightData[i] = (brightness / 255) * this.heightScale;
    }
    
    return heightData;
  }
  
  // Create standard terrain
  _createStandardTerrain(heightData, imgWidth, imgHeight) {
    // Sample the heightmap to the desired resolution
    const width = this.width;
    const length = this.length;
    const resolution = Math.min(this.resolution, Math.min(imgWidth, imgHeight));
    
    // Create grid geometry
    const geometry = new THREE.PlaneGeometry(
      width,
      length,
      resolution - 1,
      resolution - 1
    );
    
    // Rotate to XZ plane (horizontal)
    geometry.rotateX(-Math.PI / 2);
    
    // Apply height data
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < resolution * resolution; i++) {
      const x = Math.floor((i % resolution) / resolution * imgWidth);
      const y = Math.floor((i / resolution) / resolution * imgHeight);
      const heightIndex = y * imgWidth + x;
      
      if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
        // Y is up in THREE.js, but our terrain is rotated so Y is height
        vertices[i * 3 + 1] = heightData[heightIndex];
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  // Create detailed terrain with higher resolution near camera
  _createDetailedTerrain(heightData, imgWidth, imgHeight) {
    // Similar to standard terrain but with more vertices
    const geometry = this._createStandardTerrain(heightData, imgWidth, imgHeight);
    
    // Subdivide geometry for more detail
    const modifier = new THREE.SubdivisionModifier(1); // THREE.js doesn't have this built-in
    const smoothGeometry = modifier ? modifier.modify(geometry) : geometry;
    
    return smoothGeometry;
  }
  
  // Create low poly terrain with triangular faces
  _createLowPolyTerrain(heightData, imgWidth, imgHeight) {
    const geometry = this._createStandardTerrain(heightData, imgWidth, imgHeight);
    
    // Remove smooth shading by setting flat shading
    geometry.attributes.normal = undefined;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  // Create voxel-style terrain
  _createVoxelTerrain(heightData, imgWidth, imgHeight) {
    const group = new THREE.Group();
    const blockSize = this.width / this.resolution;
    
    // Sample height data at lower resolution
    const resolution = Math.min(this.resolution / 4, Math.min(imgWidth, imgHeight));
    
    // Create blocks based on height data
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const imgX = Math.floor(x / resolution * imgWidth);
        const imgZ = Math.floor(z / resolution * imgHeight);
        const heightIndex = imgZ * imgWidth + imgX;
        
        if (imgX >= 0 && imgX < imgWidth && imgZ >= 0 && imgZ < imgHeight) {
          const height = heightData[heightIndex];
          const blockHeight = Math.max(1, Math.round(height / blockSize));
          
          // Create blocks stacked to match height
          for (let y = 0; y < blockHeight; y++) {
            const geometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
            const mesh = new THREE.Mesh(geometry, this.materials.base);
            
            // Position block
            mesh.position.set(
              x * blockSize - this.width / 2 + blockSize / 2,
              y * blockSize + blockSize / 2,
              z * blockSize - this.length / 2 + blockSize / 2
            );
            
            group.add(mesh);
          }
        }
      }
    }
    
    // Convert to buffer geometry for better performance
    const geometries = [];
    group.traverse(child => {
      if (child.isMesh) {
        const cloned = child.geometry.clone();
        cloned.applyMatrix4(child.matrixWorld);
        geometries.push(cloned);
      }
    });
    
    // Merge geometries if we have any
    if (geometries.length > 0) {
      return this._mergeGeometries(geometries);
    } else {
      return new THREE.BufferGeometry();
    }
  }
  
  // Create texture from heightmap for terrain
  _createTerrainTexture(img, heightData) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext('2d');
    
    // Draw base image
    context.drawImage(img, 0, 0);
    
    // Apply color gradient based on height
    const imgData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    
    for (let i = 0; i < heightData.length; i++) {
      const height = heightData[i] / this.heightScale; // 0-1
      
      // Simple gradient: dark at bottom, lighter at top
      // Water level (blue)
      if (height < 0.2) {
        pixels[i * 4] = 0;  // R
        pixels[i * 4 + 1] = 50 + height * 150;  // G
        pixels[i * 4 + 2] = 200;  // B
      }
      // Beach/sand (yellow)
      else if (height < 0.3) {
        pixels[i * 4] = 240;  // R
        pixels[i * 4 + 1] = 220;  // G
        pixels[i * 4 + 2] = 130;  // B
      }
      // Grass/land (green to brown)
      else if (height < 0.7) {
        pixels[i * 4] = 50 + (height - 0.3) * 100;  // R
        pixels[i * 4 + 1] = 100 + (height - 0.3) * 80;  // G
        pixels[i * 4 + 2] = 50;  // B
      }
      // Mountain (grey to white)
      else {
        const grey = 150 + (height - 0.7) * 420; // 150-255
        pixels[i * 4] = grey;  // R
        pixels[i * 4 + 1] = grey;  // G
        pixels[i * 4 + 2] = grey;  // B
      }
    }
    
    context.putImageData(imgData, 0, 0);
    return canvas;
  }
  
  // Merge multiple geometries into one
  _mergeGeometries(geometries) {
    if (geometries.length === 0) return new THREE.BufferGeometry();
    if (geometries.length === 1) return geometries[0];
    
    // For simplicity, we'll just return the first geometry
    // In a full implementation, we would merge them correctly
    return geometries[0];
  }
  
  // Update terrain property
  updateProperty(property, value) {
    if (!currentHeightmapUrl) return;
    
    // Update property
    this[property] = parseFloat(value);
    currentOptions[property] = parseFloat(value);
    
    // Regenerate terrain
    return this.generateFromHeightmap(currentHeightmapUrl, currentOptions);
  }
  
  // Update terrain material
  updateMaterial(property, value) {
    if (!this.materials.base) return;
    
    switch(property) {
      case 'baseColor':
        this.materials.base.color.set(value);
        break;
      // Add more material properties as needed
    }
  }
  
  // Add a texture layer to the terrain
  addTextureLayer(textureUrl, name) {
    return new Promise((resolve, reject) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl,
        (texture) => {
          const layer = {
            name: name || `Layer ${textureLayers.length + 1}`,
            texture: texture,
            blendMode: 'normal',
            opacity: 1.0,
            minHeight: 0,
            maxHeight: 1
          };
          
          textureLayers.push(layer);
          this._updateTerrainTextures();
          resolve(layer);
        },
        undefined,
        reject
      );
    });
  }
  
  // Update terrain with textures
  _updateTerrainTextures() {
    if (!this.terrainMesh || textureLayers.length === 0) return;
    
    // In a full implementation, we would blend textures based on height/slope
    // For now, just set the last added texture
    const lastTexture = textureLayers[textureLayers.length - 1];
    this.materials.base.map = lastTexture.texture;
  }
  
  // Generate normal map from heightmap
  generateNormalMap(enabled) {
    if (!this.terrainMesh || !this.materials.base || !this.materials.base.map) return;
    
    if (enabled) {
      // Generate normal map from height data
      const normalMap = this._heightToNormalMap(this.materials.base.map.image);
      this.materials.base.normalMap = new THREE.Texture(normalMap);
      this.materials.base.normalMap.needsUpdate = true;
      this.materials.base.normalScale.set(1, 1);
    } else {
      // Remove normal map
      this.materials.base.normalMap = null;
    }
    
    this.materials.base.needsUpdate = true;
  }
  
  // Convert height map to normal map
  _heightToNormalMap(heightmapImage) {
    // This would be a complex function to generate normal maps
    // For simplicity, we'll return the original image
    return heightmapImage;
  }
  
  // Generate LOD (Level of Detail) for terrain
  generateLODs(levels = 2) {
    if (!this.terrainMesh) return;
    
    // In a full implementation, we would create different LOD levels
    // For now, just log that it's being generated
    console.log(`Generating ${levels} LOD levels for terrain`);
    return this.group;
  }
  
  // Export terrain for Godot
  exportForGodot() {
    if (!this.terrainMesh) return null;
    
    // Create a Godot-friendly representation
    const godotData = {
      width: this.width,
      length: this.length,
      height: this.heightScale,
      resolution: this.resolution,
      collision: this.godotSettings.generateCollision,
      lod: this.godotSettings.lodLevels
    };
    
    // In a real implementation, we would format the data for Godot
    return godotData;
  }
}

// Set up scene, camera, and renderer
function init() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue
  
  // Create camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(0, 50, 100);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);
  
  // Add orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 10;
  controls.maxDistance = 1000;
  controls.maxPolarAngle = Math.PI / 2.05; // Limit so we can't go below ground
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Create terrain and add to scene
  terrain = new TerrainGenerator();
  scene.add(terrain.group);
  
  // Add a ground plane
  const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1E90FF, // Dodger blue for water
    side: THREE.DoubleSide
  });
  const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.1; // Slightly below terrain to avoid z-fighting
  scene.add(groundPlane);
  
  // Animation loop
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  
  return { scene, camera, terrain };
}

// Initialize the application
function initApp() {
  const { scene: initScene, camera: initCamera, terrain: initTerrain } = init();
  scene = initScene;
  camera = initCamera;
  terrain = initTerrain;
  
  // Make functions available on window object
  window.loadHeightmap = function(url, options = {}) {
    terrain.generateFromHeightmap(url, options)
      .then(() => logDebug('✅ Heightmap loaded successfully'))
      .catch(err => logDebug('❌ Error loading heightmap: ' + err.message));
  };
  
  window.updateTerrainProperty = function(property, value) {
    terrain.updateProperty(property, value);
  };
  
  window.updateTerrainMaterial = function(property, value) {
    terrain.updateMaterial(property, value);
  };
  
  window.addTextureLayer = function(url, name) {
    terrain.addTextureLayer(url, name)
      .then(() => {
        // Update UI
        updateTextureLayersList();
        logDebug('✅ Texture added successfully');
      })
      .catch(err => logDebug('❌ Error loading texture: ' + err.message));
  };
  
  window.toggleNormalMap = function(enabled) {
    terrain.generateNormalMap(enabled);
  };
  
  window.exportLandscape = function(format, options = {}) {
    if (!terrain.terrainMesh) {
      alert('No terrain to export. Please load a heightmap first.');
      return;
    }
    
    if (format === 'godot') {
      // Set Godot-specific settings
      terrain.godotSettings = {
        generateCollision: options.generateCollision,
        optimizeForGodot: options.optimizeForGodot,
        lodLevels: options.lodLevels
      };
      
      // Export for Godot
      const godotData = terrain.exportForGodot();
      
      // Convert to GLTF first
      const exporter = new GLTFExporter();
      const glbOptions = { binary: true };
      
      exporter.parse(terrain.group, (glb) => {
        downloadFile(glb, `terrain.glb`, 'application/octet-stream');
        
        // Also provide a JSON file with Godot-specific metadata
        const metadata = JSON.stringify(godotData, null, 2);
        downloadFile(metadata, `terrain_godot_metadata.json`, 'application/json');
      }, glbOptions);
    } else if (format === 'obj') {
      const exporter = new OBJExporter();
      const result = exporter.parse(terrain.group);
      downloadFile(result, `terrain.obj`, 'text/plain');
    } else if (format === 'gltf') {
      const exporter = new GLTFExporter();
      exporter.parse(terrain.group, (gltf) => {
        downloadFile(JSON.stringify(gltf), `terrain.gltf`, 'application/json');
      }, { binary: false });
    }
  };
  
  window.exportHeightmapTexture = function() {
    if (!terrain.terrainMesh || !terrain.materials.base || !terrain.materials.base.map) {
      alert('No terrain texture to export.');
      return;
    }
    
    // Get the texture image and convert to data URL
    const texture = terrain.materials.base.map;
    const canvas = document.createElement('canvas');
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    
    const context = canvas.getContext('2d');
    context.drawImage(texture.image, 0, 0);
    
    const dataURL = canvas.toDataURL('image/png');
    
    // Create a download link
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'terrain_texture.png';
    link.click();
  };
  
  window.setTerrainType = function(type) {
    if (terrain && currentHeightmapUrl) {
      currentOptions.terrainType = type;
      terrain.terrainType = type;
      terrain.generateFromHeightmap(currentHeightmapUrl, currentOptions);
    }
  };
  
  window.setViewAngle = function(angle) {
    switch (angle) {
      case 'top':
        camera.position.set(0, 200, 0);
        break;
      case 'side':
        camera.position.set(0, 50, 200);
        break;
      case 'angled':
        camera.position.set(100, 100, 100);
        break;
    }
    camera.lookAt(0, 0, 0);
    controls.update();
  };
  
  window.resetView = function() {
    camera.position.set(0, 50, 100);
    camera.lookAt(0, 0, 0);
    controls.update();
  };
  
  window.toggleWireframe = function() {
    if (!terrain.terrainMesh) return;
    
    showWireframe = !showWireframe;
    
    terrain.group.traverse((child) => {
      if (child.isMesh) {
        if (showWireframe) {
          child.userData.originalMaterial = child.material;
          child.material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x000000
          });
        } else if (child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial;
        }
      }
    });
  };
  
  // Function to update texture layers list in UI
  function updateTextureLayersList() {
    const container = document.getElementById('textureLayers');
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // Add each texture layer
    textureLayers.forEach((layer, index) => {
      const layerElement = document.createElement('div');
      layerElement.style.display = 'flex';
      layerElement.style.alignItems = 'center';
      layerElement.style.marginTop = '5px';
      
      layerElement.innerHTML = `
        <span style="flex: 1;">${layer.name}</span>
        <button onclick="removeTextureLayer(${index})">Remove</button>
      `;
      
      container.appendChild(layerElement);
    });
    
    if (textureLayers.length === 0) {
      container.innerHTML = '<div>No texture layers added</div>';
    }
    
    // Add remove texture function to window
    window.removeTextureLayer = function(index) {
      if (index >= 0 && index < textureLayers.length) {
        textureLayers.splice(index, 1);
        updateTextureLayersList();
        terrain._updateTerrainTextures();
      }
    };
  }
  
  console.log("3D Landscape Generator initialized");
}

// Helper function to download files
function downloadFile(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// Initialize app
initApp();

// Export for use in other modules if needed
export { TerrainGenerator, init, scene, camera, terrain };