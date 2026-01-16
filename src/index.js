require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const productsRouter = require('./routes/products');
const transactionsRouter = require('./routes/transactions');
const authRouter = require('./routes/auth');
const storesRouter = require('./routes/stores');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/products', productsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/auth', authRouter);
app.use('/api/stores', storesRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Tamias POS Backend running on http://localhost:${PORT}`);
});
