const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/categories - Get all categories
router.get('/', async (req, res) => {
    try {
        const { store_id } = req.query;

        let query = supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true });

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/categories - Create new category
router.post('/', async (req, res) => {
    try {
        const { store_id, name, color } = req.body;

        if (!store_id || !name) {
            return res.status(400).json({ error: 'store_id and name are required' });
        }

        const { data, error } = await supabase
            .from('categories')
            .insert([{
                store_id,
                name,
                color: color || '#10B981'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/categories/:id - Update category
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (color !== undefined) updateData.color = color;

        const { data, error } = await supabase
            .from('categories')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
