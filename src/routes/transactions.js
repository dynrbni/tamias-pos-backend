const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get all transactions for a store
router.get('/', async (req, res) => {
    try {
        const { store_id, date_from, date_to } = req.query;

        let query = supabase.from('transactions').select('*');

        if (store_id) {
            query = query.eq('store_id', store_id);
        }
        if (date_from) {
            query = query.gte('created_at', date_from);
        }
        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single transaction
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create transaction (checkout)
router.post('/', async (req, res) => {
    try {
        const { store_id, cashier_id, items, total, tax, payment_method } = req.body;

        // Create transaction
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert([{ store_id, cashier_id, items, total, tax, payment_method }])
            .select()
            .single();

        if (txError) throw txError;

        // Update product stock
        for (const item of items) {
            const { error: stockError } = await supabase.rpc('decrement_stock', {
                product_id: item.id,
                qty: item.qty
            });

            if (stockError) console.error('Stock update error:', stockError);
        }

        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get daily summary
router.get('/summary/daily', async (req, res) => {
    try {
        const { store_id, date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('transactions')
            .select('total, tax, payment_method')
            .eq('store_id', store_id)
            .gte('created_at', `${targetDate}T00:00:00`)
            .lte('created_at', `${targetDate}T23:59:59`);

        if (error) throw error;

        const summary = {
            total_transactions: data.length,
            total_sales: data.reduce((sum, t) => sum + t.total, 0),
            total_tax: data.reduce((sum, t) => sum + t.tax, 0),
            by_payment_method: {}
        };

        data.forEach(t => {
            if (!summary.by_payment_method[t.payment_method]) {
                summary.by_payment_method[t.payment_method] = { count: 0, total: 0 };
            }
            summary.by_payment_method[t.payment_method].count++;
            summary.by_payment_method[t.payment_method].total += t.total;
        });

        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
