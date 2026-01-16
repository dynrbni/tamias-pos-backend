const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/products - Get all products with search and filtering
router.get('/', async (req, res) => {
    try {
        const { store_id, search, category, low_stock, is_active } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        let query = supabase
            .from('products')
            .select('*')
            .eq('store_id', store_id);

        // Filter by active status
        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }

        // Filter by category
        if (category) {
            query = query.eq('category', category);
        }

        // Search by name or barcode
        if (search) {
            query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Filter low stock in JS (since we need to compare stock with min_stock)
        let results = data || [];
        if (low_stock === 'true') {
            results = results.filter(p => p.stock <= (p.min_stock || 10));
        }

        res.json(results);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/products/:id - Get single product
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/products/barcode/:barcode - Search by barcode
router.get('/barcode/:barcode', async (req, res) => {
    try {
        const { barcode } = req.params;
        const { store_id } = req.query;

        let query = supabase
            .from('products')
            .select('*')
            .eq('barcode', barcode);

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        const { data, error } = await query.single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Product not found' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Barcode search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/products - Create product
router.post('/', async (req, res) => {
    try {
        const {
            store_id,
            name,
            price,
            cost,
            category,
            category_id,
            stock,
            min_stock,
            barcode,
            image_url,
            is_active
        } = req.body;

        // Validation
        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        if (price === undefined || price < 0) {
            return res.status(400).json({ error: 'Valid price is required' });
        }

        const { data, error } = await supabase
            .from('products')
            .insert([{
                store_id,
                name: name.trim(),
                price: parseInt(price),
                cost: parseInt(cost) || 0,
                category,
                category_id,
                stock: parseInt(stock) || 0,
                min_stock: parseInt(min_stock) || 10,
                barcode,
                image_url,
                is_active: is_active !== false
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/products/:id - Update product
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            price,
            cost,
            category,
            category_id,
            stock,
            min_stock,
            barcode,
            image_url,
            is_active
        } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (price !== undefined) updateData.price = parseInt(price);
        if (cost !== undefined) updateData.cost = parseInt(cost);
        if (category !== undefined) updateData.category = category;
        if (category_id !== undefined) updateData.category_id = category_id;
        if (stock !== undefined) updateData.stock = parseInt(stock);
        if (min_stock !== undefined) updateData.min_stock = parseInt(min_stock);
        if (barcode !== undefined) updateData.barcode = barcode;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/products/:id/stock - Update stock only
router.patch('/:id/stock', async (req, res) => {
    try {
        const { id } = req.params;
        const { stock, adjustment } = req.body;

        let updateQuery;

        if (adjustment !== undefined) {
            // Get current stock first
            const { data: product, error: getError } = await supabase
                .from('products')
                .select('stock')
                .eq('id', id)
                .single();

            if (getError) throw getError;

            const newStock = Math.max(0, (product.stock || 0) + parseInt(adjustment));
            updateQuery = supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', id)
                .select()
                .single();
        } else if (stock !== undefined) {
            updateQuery = supabase
                .from('products')
                .update({ stock: parseInt(stock) })
                .eq('id', id)
                .select()
                .single();
        } else {
            return res.status(400).json({ error: 'stock or adjustment is required' });
        }

        const { data, error } = await updateQuery;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/products/:id - Delete product (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent } = req.query;

        if (permanent === 'true') {
            // Hard delete
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } else {
            // Soft delete (set is_active to false)
            const { error } = await supabase
                .from('products')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/products/bulk - Bulk create products
router.post('/bulk', async (req, res) => {
    try {
        const { products } = req.body;

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ error: 'products array is required' });
        }

        const { data, error } = await supabase
            .from('products')
            .insert(products.map(p => ({
                store_id: p.store_id,
                name: p.name,
                price: parseInt(p.price),
                cost: parseInt(p.cost) || 0,
                category: p.category,
                stock: parseInt(p.stock) || 0,
                min_stock: parseInt(p.min_stock) || 10,
                barcode: p.barcode,
                image_url: p.image_url,
                is_active: true
            })))
            .select();

        if (error) throw error;

        res.status(201).json({
            message: `${data.length} products created`,
            products: data
        });
    } catch (error) {
        console.error('Bulk create error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
