const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { email, password, full_name, role } = req.body;

        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError) throw authError;

        // Create profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: authData.user.id,
                full_name,
                role: role || 'cashier'
            }]);

        if (profileError) throw profileError;

        res.status(201).json({
            message: 'User registered successfully',
            user: authData.user
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Get user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        res.json({
            user: data.user,
            profile,
            session: data.session
        });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization header' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) throw error;

        // Get profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*, stores(*)')
            .eq('id', user.id)
            .single();

        res.json({ user, profile });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
