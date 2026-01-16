const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/employees - Get all employees
router.get('/', async (req, res) => {
    try {
        const { store_id } = req.query;

        let query = supabase
            .from('employees')
            .select('*')
            .order('created_at', { ascending: false });

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get employees error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/employees/:id - Get single employee
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Get employee error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
    try {
        const { store_id, name, email, phone, role, salary } = req.body;

        if (!store_id || !name) {
            return res.status(400).json({ error: 'store_id and name are required' });
        }

        const { data, error } = await supabase
            .from('employees')
            .insert([{
                store_id,
                name,
                email,
                phone,
                role: role || 'cashier',
                salary: salary || 0,
                is_active: true
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create employee error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, role, salary, is_active } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        if (salary !== undefined) updateData.salary = salary;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from('employees')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update employee error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Delete employee error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
