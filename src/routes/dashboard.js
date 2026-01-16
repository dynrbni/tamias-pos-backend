const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const { store_id } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        // Call the database function
        const { data, error } = await supabase.rpc('get_dashboard_stats', {
            p_store_id: store_id
        });

        if (error) throw error;

        // Calculate percentage changes
        const stats = data || {};
        const todaySales = stats.today_sales || 0;
        const yesterdaySales = stats.yesterday_sales || 0;
        const todayTx = stats.today_transactions || 0;
        const yesterdayTx = stats.yesterday_transactions || 0;
        const todayItems = stats.today_items_sold || 0;
        const yesterdayItems = stats.yesterday_items_sold || 0;

        const salesChange = yesterdaySales > 0
            ? ((todaySales - yesterdaySales) / yesterdaySales * 100).toFixed(1)
            : todaySales > 0 ? 100 : 0;

        const txChange = yesterdayTx > 0
            ? todayTx - yesterdayTx
            : todayTx;

        const itemsChange = yesterdayItems > 0
            ? todayItems - yesterdayItems
            : todayItems;

        const avgTransaction = todayTx > 0 ? Math.round(todaySales / todayTx) : 0;
        const yesterdayAvg = yesterdayTx > 0 ? Math.round(yesterdaySales / yesterdayTx) : 0;
        const avgChange = yesterdayAvg > 0
            ? ((avgTransaction - yesterdayAvg) / yesterdayAvg * 100).toFixed(1)
            : 0;

        res.json({
            today_sales: todaySales,
            sales_change_percent: parseFloat(salesChange),
            today_transactions: todayTx,
            transactions_change: txChange,
            average_transaction: avgTransaction,
            average_change_percent: parseFloat(avgChange),
            today_items_sold: todayItems,
            items_change: itemsChange,
            total_products: stats.total_products || 0,
            low_stock_count: stats.low_stock_count || 0,
            total_customers: stats.total_customers || 0,
            total_employees: stats.total_employees || 0
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/dashboard/chart - Get sales chart data
router.get('/chart', async (req, res) => {
    try {
        const { store_id, days = 7 } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        const { data, error } = await supabase.rpc('get_sales_chart', {
            p_store_id: store_id,
            p_days: parseInt(days)
        });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/dashboard/top-products - Get top selling products
router.get('/top-products', async (req, res) => {
    try {
        const { store_id, limit = 5 } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        const { data, error } = await supabase.rpc('get_top_products', {
            p_store_id: store_id,
            p_limit: parseInt(limit)
        });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Top products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/dashboard/low-stock - Get low stock products
router.get('/low-stock', async (req, res) => {
    try {
        const { store_id, limit = 5 } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        const { data, error } = await supabase
            .from('products')
            .select('id, name, stock, min_stock, category')
            .eq('store_id', store_id)
            .eq('is_active', true)
            .lte('stock', supabase.raw('min_stock'))
            .order('stock', { ascending: true })
            .limit(parseInt(limit));

        if (error) {
            // Fallback query without raw
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('products')
                .select('id, name, stock, min_stock, category')
                .eq('store_id', store_id)
                .eq('is_active', true)
                .order('stock', { ascending: true })
                .limit(parseInt(limit));

            if (fallbackError) throw fallbackError;

            // Filter low stock in JS
            const lowStock = (fallbackData || []).filter(p => p.stock <= p.min_stock);
            return res.json(lowStock);
        }

        res.json(data || []);
    } catch (error) {
        console.error('Low stock error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/dashboard/recent-transactions - Get recent transactions
router.get('/recent-transactions', async (req, res) => {
    try {
        const { store_id, limit = 5 } = req.query;

        if (!store_id) {
            return res.status(400).json({ error: 'store_id is required' });
        }

        const { data, error } = await supabase
            .from('transactions')
            .select(`
                id,
                total,
                status,
                payment_method,
                items,
                created_at,
                customers (
                    id,
                    name
                )
            `)
            .eq('store_id', store_id)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        // Format response
        const formatted = (data || []).map(tx => ({
            id: tx.id.substring(0, 8).toUpperCase(),
            full_id: tx.id,
            customer: tx.customers?.name || 'Walk-in Customer',
            items_count: Array.isArray(tx.items) ? tx.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
            total: tx.total,
            status: tx.status,
            payment_method: tx.payment_method,
            created_at: tx.created_at
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Recent transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
