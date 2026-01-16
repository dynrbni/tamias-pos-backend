const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/transactions - Get all transactions with filtering
router.get('/', async (req, res) => {
    try {
        const { store_id, date_from, date_to, status, payment_method, limit = 100 } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        let query = supabase
            .from('transactions')
            .select('*')
            .eq('store_id', store_id);

        if (date_from) {
            query = query.gte('created_at', date_from);
        }
        if (date_to) {
            query = query.lte('created_at', date_to);
        }
        if (status) {
            query = query.eq('status', status);
        }
        if (payment_method) {
            query = query.eq('payment_method', payment_method);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/transactions/:id - Get single transaction
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/transactions - Create transaction (checkout)
router.post('/', async (req, res) => {
    try {
        const {
            store_id,
            cashier_id,
            customer_id,
            items,
            subtotal,
            tax,
            discount,
            total,
            payment_method,
            payment_amount,
            notes
        } = req.body;

        // Validation
        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }
        if (total === undefined || total < 0) {
            return res.status(400).json({ error: 'Valid total is required' });
        }

        // Calculate change
        const changeAmount = payment_amount ? Math.max(0, payment_amount - total) : 0;

        // Create transaction
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert([{
                store_id,
                cashier_id,
                customer_id,
                items,
                subtotal: subtotal || total,
                tax: tax || 0,
                discount: discount || 0,
                total,
                payment_method: payment_method || 'cash',
                payment_amount: payment_amount || total,
                change_amount: changeAmount,
                status: 'completed',
                notes
            }])
            .select()
            .single();

        if (txError) throw txError;

        // Update product stock
        for (const item of items) {
            const productId = item.product_id || item.id;
            const quantity = item.quantity || item.qty || 1;

            if (productId) {
                const { error: stockError } = await supabase.rpc('decrement_stock', {
                    product_id: productId,
                    qty: quantity
                });

                if (stockError) {
                    console.error('Stock update error for product:', productId, stockError);
                }
            }
        }

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Create transaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/transactions/:id - Update transaction
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const updateData = {};
        if (status !== undefined) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const { data, error } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/transactions/:id/status - Update status only
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['completed', 'pending', 'cancelled', 'refunded'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Use: completed, pending, cancelled, refunded' });
        }

        const { data, error } = await supabase
            .from('transactions')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // If refunded or cancelled, restore stock
        if (status === 'refunded' || status === 'cancelled') {
            const items = data.items || [];
            for (const item of items) {
                const productId = item.product_id || item.id;
                const quantity = item.quantity || item.qty || 1;

                if (productId) {
                    // Add stock back
                    const { data: product } = await supabase
                        .from('products')
                        .select('stock')
                        .eq('id', productId)
                        .single();

                    if (product) {
                        await supabase
                            .from('products')
                            .update({ stock: (product.stock || 0) + quantity })
                            .eq('id', productId);
                    }
                }
            }
        }

        res.json(data);
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/transactions/:id - Delete transaction
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get transaction first to restore stock
        const { data: tx, error: getError } = await supabase
            .from('transactions')
            .select('items, status')
            .eq('id', id)
            .single();

        if (getError) throw getError;

        // Restore stock if transaction was completed
        if (tx && tx.status === 'completed') {
            const items = tx.items || [];
            for (const item of items) {
                const productId = item.product_id || item.id;
                const quantity = item.quantity || item.qty || 1;

                if (productId) {
                    const { data: product } = await supabase
                        .from('products')
                        .select('stock')
                        .eq('id', productId)
                        .single();

                    if (product) {
                        await supabase
                            .from('products')
                            .update({ stock: (product.stock || 0) + quantity })
                            .eq('id', productId);
                    }
                }
            }
        }

        // Delete transaction
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Delete transaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/transactions/summary/daily - Get daily summary
router.get('/summary/daily', async (req, res) => {
    try {
        const { store_id, date } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        const targetDate = date || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('transactions')
            .select('total, tax, discount, payment_method, status')
            .eq('store_id', store_id)
            .gte('created_at', `${targetDate}T00:00:00`)
            .lte('created_at', `${targetDate}T23:59:59`);

        if (error) throw error;

        const completed = (data || []).filter(t => t.status === 'completed' || !t.status);

        const summary = {
            date: targetDate,
            total_transactions: completed.length,
            total_sales: completed.reduce((sum, t) => sum + (t.total || 0), 0),
            total_tax: completed.reduce((sum, t) => sum + (t.tax || 0), 0),
            total_discount: completed.reduce((sum, t) => sum + (t.discount || 0), 0),
            by_payment_method: {},
            by_status: {}
        };

        (data || []).forEach(t => {
            // By payment method
            const method = t.payment_method || 'cash';
            if (!summary.by_payment_method[method]) {
                summary.by_payment_method[method] = { count: 0, total: 0 };
            }
            summary.by_payment_method[method].count++;
            summary.by_payment_method[method].total += t.total || 0;

            // By status
            const status = t.status || 'completed';
            if (!summary.by_status[status]) {
                summary.by_status[status] = 0;
            }
            summary.by_status[status]++;
        });

        res.json(summary);
    } catch (error) {
        console.error('Daily summary error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/transactions/summary/range - Get range summary
router.get('/summary/range', async (req, res) => {
    try {
        const { store_id, date_from, date_to } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        let query = supabase
            .from('transactions')
            .select('total, tax, discount, payment_method, status, created_at')
            .eq('store_id', store_id);

        if (date_from) {
            query = query.gte('created_at', date_from);
        }
        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        const { data, error } = await query;

        if (error) throw error;

        const completed = (data || []).filter(t => t.status === 'completed' || !t.status);

        res.json({
            date_from,
            date_to,
            total_transactions: completed.length,
            total_sales: completed.reduce((sum, t) => sum + (t.total || 0), 0),
            total_tax: completed.reduce((sum, t) => sum + (t.tax || 0), 0),
            total_discount: completed.reduce((sum, t) => sum + (t.discount || 0), 0),
            average_transaction: completed.length > 0
                ? Math.round(completed.reduce((sum, t) => sum + (t.total || 0), 0) / completed.length)
                : 0
        });
    } catch (error) {
        console.error('Range summary error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
