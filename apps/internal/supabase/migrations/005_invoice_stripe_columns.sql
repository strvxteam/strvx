-- Add Stripe integration columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Add Stripe customer ID to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
