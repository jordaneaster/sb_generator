class UserService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async authenticateWallet(wallet_address, wallet_type) {
    // Check if user exists
    const { data: existingUser, error: lookupError } = await this.supabase
      .from('users')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();
    
    if (lookupError && lookupError.code !== 'PGRST116') { // PGRST116 means no rows returned
      throw lookupError;
    }

    let userData;
    
    if (existingUser) {
      // Update existing user
      const { data, error } = await this.supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          wallet_type: wallet_type || existingUser.wallet_type
        })
        .eq('id', existingUser.id)
        .select()
        .single();
        
      if (error) throw error;
      userData = data;
    } else {
      // Insert new user
      const { data, error } = await this.supabase
        .from('users')
        .insert({
          wallet_address,
          wallet_type: wallet_type || 'unknown',
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString()
        })
        .select()
        .single();
        
      if (error) throw error;
      userData = data;
    }
    
    return userData;
  }

  async getUserByWallet(walletAddress) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return null;
      }
      throw error;
    }
    
    return data;
  }
}

module.exports = { UserService };
