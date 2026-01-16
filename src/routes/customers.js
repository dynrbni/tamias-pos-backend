const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/customers - Get all customers
router.get('/', async (req, res) => {
    try {
        const { store_id, search } = req.query;

        let query = supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/customers/:id - Get single customer
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/customers - Create new customer
router.post('/', async (req, res) => {
    try {
        const { store_id, name, phone, email, address } = req.body;

        if (!store_id || !name) {
            return res.status(400).json({ error: 'store_id and name are required' });
        }

        const { data, error } = await supabase
            .from('customers')
            .insert([{
                store_id,
                name,
                phone,
                email,
                address,
                total_transactions: 0,
                total_spent: 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (address !== undefined) updateData.address = address;

        const { data, error } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/customers/:id/transactions - Get customer transactions
router.get('/:id/transactions', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10 } = req.query;

        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get customer transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
