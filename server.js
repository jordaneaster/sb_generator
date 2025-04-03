// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { SpaceBabyService } = require('./services/spaceBabyService');
const { UserService } = require('./services/userService');

// Initialize express app
const app = express();
app.use(cors());
app.use(express.json());

// Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Check if required environment variables are present
if (!supabaseUrl) {
  console.error('SUPABASE_URL environment variable is not defined');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_KEY environment variable is not defined');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize services
const spaceBabyService = new SpaceBabyService({ supabaseUrl, supabaseKey, supabase });
const userService = new UserService(supabase);

// API routes
app.post('/api/generate-space-baby', async (req, res) => {
  try {
    const { id, options } = req.body;
    const spaceBaby = await spaceBabyService.generate(id, options);
    return res.json(spaceBaby);
  } catch (error) {
    console.error('Error generating space baby:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/save-space-baby', async (req, res) => {
  try {
    const { userId, spaceBaby } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    const data = await spaceBabyService.save(userId, spaceBaby);
    return res.json(data);
  } catch (error) {
    console.error('Error saving space baby:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/wallet', async (req, res) => {
  try {
    const { wallet_address, wallet_type } = req.body;
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    const userData = await userService.authenticateWallet(wallet_address, wallet_type);
    return res.json(userData);
  } catch (error) {
    console.error('Error saving user:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = await userService.getUserByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Space Baby server running on port ${PORT}`);
});

// Initialize generator on startup
spaceBabyService.initialize().catch(console.error);
