const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get all products for a store
router.get('/', async (req, res) => {
    try {
        const { store_id } = req.query;

        let query = supabase.from('products').select('*');

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single product
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create product
router.post('/', async (req, res) => {
    try {
        const { name, price, category, stock, barcode, image_url, store_id } = req.body;

        const { data, error } = await supabase
            .from('products')
            .insert([{ name, price, category, stock, barcode, image_url, store_id }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update product
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, category, stock, barcode, image_url } = req.body;

        const { data, error } = await supabase
            .from('products')
            .update({ name, price, category, stock, barcode, image_url })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete product
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search products by barcode
router.get('/barcode/:barcode', async (req, res) => {
    try {
        const { barcode } = req.params;
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('barcode', barcode)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
