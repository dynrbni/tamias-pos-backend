const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Get all stores
router.get('/', async (req, res) => {
    try {
        const { owner_id } = req.query;

        let query = supabase.from('stores').select('*');

        if (owner_id) {
            query = query.eq('owner_id', owner_id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single store
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create store
router.post('/', async (req, res) => {
    try {
        const { name, address, owner_id } = req.body;

        const { data, error } = await supabase
            .from('stores')
            .insert([{ name, address, owner_id }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update store
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address } = req.body;

        const { data, error } = await supabase
            .from('stores')
            .update({ name, address })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete store
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('stores')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Store deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get store stats
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        // Get product count
        const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('store_id', id);

        // Get today's transactions
        const today = new Date().toISOString().split('T')[0];
        const { data: todayTx } = await supabase
            .from('transactions')
            .select('total')
            .eq('store_id', id)
            .gte('created_at', `${today}T00:00:00`);

        res.json({
            total_products: productCount || 0,
            today_transactions: todayTx?.length || 0,
            today_sales: todayTx?.reduce((sum, t) => sum + t.total, 0) || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
