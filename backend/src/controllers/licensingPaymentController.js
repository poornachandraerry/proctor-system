const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Same lazy-init pattern as bankPaymentController.js — keeps the server
// bootable even before RAZORPAY_KEY_ID/SECRET are configured, since this
// feature is opt-in.
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

async function createInvoiceOrder(req, res) {
  try {
    const { id } = req.params;
    const invRes = await query('SELECT * FROM gst_invoices WHERE id=$1', [id]);
    if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invRes.rows[0];
    if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid' });

    let order;
    try {
      order = await getRazorpay().orders.create({
        amount: Math.round(parseFloat(invoice.total_amount) * 100), // paise
        currency: 'INR',
        receipt: `invoice_${id}_${Date.now()}`,
        notes: { invoiceId: id, orgId: invoice.org_id, invoiceNumber: invoice.invoice_number },
      });
    } catch (e) {
      logger.error('Razorpay order creation failed (invoice):', e.message);
      return res.status(503).json({ error: 'Payment gateway is not available right now. Please try again shortly.' });
    }

    await query('UPDATE gst_invoices SET razorpay_order_id=$1 WHERE id=$2', [order.id, id]);

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
      invoiceNumber: invoice.invoice_number,
    });
  } catch (err) {
    logger.error('createInvoiceOrder:', err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
}

async function verifyInvoicePayment(req, res) {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const invRes = await query('SELECT * FROM gst_invoices WHERE id=$1 AND razorpay_order_id=$2', [id, razorpay_order_id]);
    if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice/order not found' });
    const invoice = invRes.rows[0];
    if (invoice.status === 'paid') return res.json({ verified: true }); // idempotent retry

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed', verified: false });
    }

    await query(`
      UPDATE gst_invoices SET
        status='paid', paid_at=NOW(), payment_method='razorpay',
        payment_reference=$1, razorpay_payment_id=$1, razorpay_signature=$2
      WHERE id=$3
    `, [razorpay_payment_id, razorpay_signature, id]);

    // A verified payment activates the org's license and extends it — from
    // whichever is later, now or the current expiry, so paying early (a
    // renewal before the old term lapses) adds to the remaining term
    // instead of resetting it.
    const orgRes = await query('SELECT billing_cycle, license_expires_at FROM organizations WHERE id=$1', [invoice.org_id]);
    if (orgRes.rows.length) {
      const org = orgRes.rows[0];
      const days = org.billing_cycle === 'yearly' ? 365 : 30;
      const base = org.license_expires_at && new Date(org.license_expires_at) > new Date()
        ? new Date(org.license_expires_at) : new Date();
      const newExpiry = new Date(base.getTime() + days * 86400000);
      await query(
        "UPDATE organizations SET license_status='active', license_expires_at=$1, trial_ends_at=NULL WHERE id=$2",
        [newExpiry, invoice.org_id]
      );
    }

    res.json({ verified: true });
  } catch (err) {
    logger.error('verifyInvoicePayment:', err.message);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
}

module.exports = { createInvoiceOrder, verifyInvoicePayment };
