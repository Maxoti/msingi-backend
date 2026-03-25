// src/modules/jobs/mpesa-reconciliation.job.js
/**
 * M-Pesa Auto-Reconciliation Job
 * 
 * Automatically reconciles M-Pesa payments to student invoices
 * based on account_reference matching admission_no
 * 
 * RUNS: Daily at 10:00 AM (configurable in scheduler.js)
 * 
 * FLOW:
 * 1. Find all COMPLETED but unreconciled M-Pesa transactions
 * 2. Match account_reference to student admission_no
 * 3. Find student's unpaid/partial invoice for current term
 * 4. Create payment record and link to invoice
 * 5. Update invoice status (UNPAID → PARTIAL → PAID)
 * 6. Send SMS confirmation to parent
 * 7. Mark transaction as RECONCILED
 * 
 * SAFETY:
 * - Only processes COMPLETED transactions
 * - Skips already RECONCILED transactions
 * - Validates student and invoice exist
 * - Uses database transactions for atomicity
 * - Logs all actions for audit trail
 */

const db = require('../../shared/database/client');

/**
 * Auto-reconcile M-Pesa payments to student invoices
 * @returns {Object} - Reconciliation results
 */
async function autoReconcileMpesaPayments() {
  console.log('[M-Pesa Auto-Reconcile] Starting auto-reconciliation job...');
  
  const results = {
    processed: 0,
    reconciled: 0,
    failed: 0,
    errors: []
  };

  try {
    // ========================================================================
    // STEP 1: Get all unreconciled COMPLETED M-Pesa transactions
    // ========================================================================
    const unreconciledTransactions = await db.queryAll(
      `SELECT 
         mt.id,
         mt.transaction_id,
         mt.mpesa_receipt_number,
         mt.phone_number,
         mt.amount,
         mt.account_reference,
         mt.transaction_date
       FROM mpesa_transactions mt
       WHERE mt.status = 'COMPLETED'
         AND mt.reconciled_at IS NULL
         AND mt.payment_id IS NULL
         AND mt.account_reference IS NOT NULL
         AND mt.account_reference != ''
       ORDER BY mt.transaction_date ASC
       LIMIT 50`
    );

    console.log(`[M-Pesa Auto-Reconcile] Found ${unreconciledTransactions.length} unreconciled transactions`);

    if (unreconciledTransactions.length === 0) {
      console.log('[M-Pesa Auto-Reconcile] No transactions to reconcile');
      return results;
    }

    // ========================================================================
    // STEP 2: Process each transaction
    // ========================================================================
    for (const tx of unreconciledTransactions) {
      results.processed++;
      
      try {
        console.log(`[M-Pesa Auto-Reconcile] Processing transaction ${tx.mpesa_receipt_number} (${tx.account_reference})`);

        // --------------------------------------------------------------------
        // STEP 2.1: Find student by admission number
        // --------------------------------------------------------------------
        const student = await db.queryOne(
          `SELECT id, admission_no, first_name, last_name, class_id
           FROM students
           WHERE admission_no = $1 AND is_active = TRUE`,
          [tx.account_reference]
        );

        if (!student) {
          console.warn(`[M-Pesa Auto-Reconcile] Student not found for admission_no: ${tx.account_reference}`);
          results.errors.push({
            transaction_id: tx.transaction_id,
            error: 'Student not found',
            account_reference: tx.account_reference
          });
          results.failed++;
          continue;
        }

        console.log(`[M-Pesa Auto-Reconcile] Found student: ${student.first_name} ${student.last_name} (ID: ${student.id})`);

        // --------------------------------------------------------------------
        // STEP 2.2: Find active term
        // --------------------------------------------------------------------
        const activeTerm = await db.queryOne(
          `SELECT id, year, term
           FROM academic_terms
           WHERE is_active = TRUE
           LIMIT 1`
        );

        if (!activeTerm) {
          console.warn('[M-Pesa Auto-Reconcile] No active term found');
          results.errors.push({
            transaction_id: tx.transaction_id,
            error: 'No active term',
            student_id: student.id
          });
          results.failed++;
          continue;
        }

        // --------------------------------------------------------------------
        // STEP 2.3: Find or create invoice for student in active term
        // --------------------------------------------------------------------
        let invoice = await db.queryOne(
          `SELECT id, total_amount, status
           FROM invoices
           WHERE student_id = $1 
             AND term_id = $2
             AND status IN ('UNPAID', 'PARTIAL')`,
          [student.id, activeTerm.id]
        );

        if (!invoice) {
          console.warn(`[M-Pesa Auto-Reconcile] No unpaid/partial invoice found for student ${student.admission_no}`);
          results.errors.push({
            transaction_id: tx.transaction_id,
            error: 'No unpaid invoice',
            student_id: student.id,
            term_id: activeTerm.id
          });
          results.failed++;
          continue;
        }

        console.log(`[M-Pesa Auto-Reconcile] Found invoice ${invoice.id} with total KES ${invoice.total_amount}`);

        // --------------------------------------------------------------------
        // STEP 2.4: Reconcile in a database transaction (atomic operation)
        // --------------------------------------------------------------------
        await db.transaction(async (client) => {
          // Create payment record
          const paymentResult = await client.query(
            `INSERT INTO payments (
               invoice_id, 
               amount, 
               payment_method, 
               payment_date, 
               reference_number
             ) VALUES ($1, $2, 'MPESA', $3, $4)
             RETURNING id`,
            [
              invoice.id,
              tx.amount,
              tx.transaction_date,
              tx.mpesa_receipt_number
            ]
          );

          const paymentId = paymentResult.rows[0].id;
          console.log(`[M-Pesa Auto-Reconcile] Created payment record ${paymentId}`);

          // Update M-Pesa transaction to RECONCILED
          await client.query(
            `UPDATE mpesa_transactions
             SET status = 'RECONCILED',
                 payment_id = $1,
                 reconciled_at = NOW(),
                 reconciled_by = NULL
             WHERE id = $2`,
            [paymentId, tx.id]
          );

          // Calculate new invoice status
          const invoiceSummary = await client.query(
            `SELECT 
               i.total_amount,
               COALESCE(SUM(p.amount), 0) as paid_amount
             FROM invoices i
             LEFT JOIN payments p ON p.invoice_id = i.id
             WHERE i.id = $1
             GROUP BY i.id, i.total_amount`,
            [invoice.id]
          );

          const { total_amount, paid_amount } = invoiceSummary.rows[0];
          let newStatus = 'UNPAID';
          
          if (parseFloat(paid_amount) >= parseFloat(total_amount)) {
            newStatus = 'PAID';
          } else if (parseFloat(paid_amount) > 0) {
            newStatus = 'PARTIAL';
          }

          // Update invoice status
          await client.query(
            `UPDATE invoices
             SET status = $1, updated_at = NOW()
             WHERE id = $2`,
            [newStatus, invoice.id]
          );

          console.log(`[M-Pesa Auto-Reconcile] Invoice ${invoice.id} status updated to ${newStatus}`);
          console.log(`[M-Pesa Auto-Reconcile] Balance: KES ${parseFloat(total_amount) - parseFloat(paid_amount)}`);

          // --------------------------------------------------------------------
          // STEP 2.5: Queue SMS notification to parent
          // --------------------------------------------------------------------
          try {
            await client.query(
              `INSERT INTO notification_queue (
                 type,
                 recipient,
                 message,
                 message_type,
                 student_id,
                 related_entity_type,
                 related_entity_id,
                 priority,
                 status
               )
               SELECT
                 'SMS',
                 pc.phone,
                 $1,
                 'PAYMENT_RECEIVED',
                 $2,
                 'PAYMENT',
                 $3,
                 5,
                 'PENDING'
               FROM parent_contacts pc
               WHERE pc.student_id = $2
                 AND pc.is_primary = TRUE
               LIMIT 1`,
              [
                `Payment of KES ${tx.amount} received for ${student.first_name} ${student.last_name}. ` +
                `Receipt: ${tx.mpesa_receipt_number}. Balance: KES ${parseFloat(total_amount) - parseFloat(paid_amount)}. Thank you!`,
                student.id,
                paymentId
              ]
            );

            console.log(`[M-Pesa Auto-Reconcile] SMS notification queued for student ${student.admission_no}`);
          } catch (smsError) {
            // Don't fail the whole reconciliation if SMS queueing fails
            console.error(`[M-Pesa Auto-Reconcile] Failed to queue SMS:`, smsError.message);
          }
        });

        results.reconciled++;
        console.log(`[M-Pesa Auto-Reconcile] ✅ Successfully reconciled ${tx.mpesa_receipt_number}`);

      } catch (error) {
        results.failed++;
        console.error(`[M-Pesa Auto-Reconcile] ❌ Error reconciling transaction ${tx.transaction_id}:`, error.message);
        results.errors.push({
          transaction_id: tx.transaction_id,
          error: error.message,
          mpesa_receipt: tx.mpesa_receipt_number
        });
      }
    }

    // ========================================================================
    // STEP 3: Log summary
    // ========================================================================
    console.log('[M-Pesa Auto-Reconcile] Job completed:');
    console.log(`  Processed: ${results.processed}`);
    console.log(`  Reconciled: ${results.reconciled}`);
    console.log(`  Failed: ${results.failed}`);
    
    if (results.errors.length > 0) {
      console.log(`  Errors:`);
      results.errors.forEach(err => {
        console.log(`    - ${err.transaction_id}: ${err.error}`);
      });
    }

  } catch (error) {
    console.error('[M-Pesa Auto-Reconcile] Fatal error:', error);
    throw error;
  }

  return results;
}

/**
 * Get statistics on unreconciled transactions
 * @returns {Object} - Stats on pending reconciliations
 */
async function getReconciliationStats() {
  try {
    const stats = await db.queryOne(
      `SELECT 
         COUNT(*) as total_unreconciled,
         COALESCE(SUM(amount), 0) as total_amount,
         COUNT(CASE WHEN account_reference IS NOT NULL THEN 1 END) as with_reference,
         COUNT(CASE WHEN account_reference IS NULL THEN 1 END) as without_reference
       FROM mpesa_transactions
       WHERE status = 'COMPLETED'
         AND reconciled_at IS NULL
         AND payment_id IS NULL`
    );

    return {
      total_unreconciled: parseInt(stats.total_unreconciled),
      total_amount: parseFloat(stats.total_amount),
      with_reference: parseInt(stats.with_reference),
      without_reference: parseInt(stats.without_reference)
    };
  } catch (error) {
    console.error('[M-Pesa Auto-Reconcile] Error getting stats:', error);
    throw error;
  }
}

/**
 * Manually trigger reconciliation for a specific transaction
 * @param {number} transactionId - M-Pesa transaction ID
 * @returns {Object} - Reconciliation result
 */
async function reconcileSpecificTransaction(transactionId) {
  console.log(`[M-Pesa Auto-Reconcile] Manually reconciling transaction ${transactionId}...`);
  
  // This could be called from an API endpoint for manual reconciliation
  // Implementation would be similar to autoReconcileMpesaPayments
  // but for a single transaction
  
  throw new Error('Not yet implemented - use manual reconciliation API endpoint');
}

module.exports = {
  autoReconcileMpesaPayments,
  getReconciliationStats,
  reconcileSpecificTransaction
};