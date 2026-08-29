const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Razorpay's SDK throws at require-time if instantiated without keys, and
// this feature is opt-in (only priced banks need it) — so the client is
// built lazily on first real use rather than at module load, keeping the
// server bootable even before RAZORPAY_KEY_ID/SECRET are configured.
let razorpay = null;
function getRazorpay() {
  if (razorpay) return razorpay;
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }
  const Razorpay = require('razorpay');
  razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return razorpay;
}

// Create a Razorpay order for one practice attempt on a priced bank.
// Razorpay's standard checkout automatically offers UPI (including a QR
// code) alongside cards/netbanking/wallets — no separate QR integration
// is needed on top of this.
async function createBankCreditOrder(req, res) {
  try {
    const { bankId } = req.params;
    const bankRes = await query('SELECT id, name, price_per_attempt, is_public FROM question_banks WHERE id=$1', [bankId]);
    if (!bankRes.rows.length) return res.status(404).json({ error: 'Question bank not found' });
    const bank = bankRes.rows[0];
    const price = parseFloat(bank.price_per_attempt || 0);
    if (price <= 0) return res.status(400).json({ error: 'This question bank is free — no payment needed' });

    let order;
    try {
      order = await getRazorpay().orders.create({
        amount: Math.round(price * 100), // paise
        currency: 'INR',
        receipt: `bank_${bankId}_${Date.now()}`,
        notes: { bankId, userId: req.user.id, bankName: bank.name },
      });
    } catch (e) {
      logger.error('Razorpay order creation failed:', e.message);
      return res.status(503).json({ error: 'Payment gateway is not available right now. Please try again shortly.' });
    }

    const credit = await query(`
      INSERT INTO bank_payment_credits (user_id, bank_id, amount, currency, razorpay_order_id, status)
      VALUES ($1,$2,$3,'INR',$4,'created') RETURNING id
    `, [req.user.id, bankId, price, order.id]);

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
      creditId: credit.rows[0].id,
      bankName: bank.name,
    });
  } catch (err) {
    logger.error('createBankCreditOrder:', err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
}

// Verify the payment signature Razorpay's checkout returns after a
// successful payment. This is the standard Razorpay verification formula —
// HMAC-SHA256 of "order_id|payment_id" using the account's key secret must
// match the signature Razorpay sent, proving the payment wasn't forged
// client-side. Only on a verified match does the credit become usable.
async function verifyBankCreditPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const creditRes = await query(
      'SELECT * FROM bank_payment_credits WHERE razorpay_order_id=$1 AND user_id=$2',
      [razorpay_order_id, req.user.id]
    );
    if (!creditRes.rows.length) return res.status(404).json({ error: 'Payment record not found' });
    const credit = creditRes.rows[0];
    if (credit.status === 'paid') return res.json({ verified: true, creditId: credit.id }); // idempotent retry

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await query("UPDATE bank_payment_credits SET status='failed' WHERE id=$1", [credit.id]);
      return res.status(400).json({ error: 'Payment verification failed', verified: false });
    }

    await query(`
      UPDATE bank_payment_credits
      SET status='paid', razorpay_payment_id=$1, razorpay_signature=$2
      WHERE id=$3
    `, [razorpay_payment_id, razorpay_signature, credit.id]);

    res.json({ verified: true, creditId: credit.id });
  } catch (err) {
    logger.error('verifyBankCreditPayment:', err.message);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
}

module.exports = { createBankCreditOrder, verifyBankCreditPayment };
