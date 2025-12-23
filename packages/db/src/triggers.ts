import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * SQL to create the audit logging function and triggers.
 * This function captures OLD and NEW values on INSERT, UPDATE, DELETE operations.
 */
export const auditTriggerSQL = sql`
-- Create the audit logging function
CREATE OR REPLACE FUNCTION process_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by)
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      'INSERT',
      NULL,
      to_jsonb(NEW),
      current_setting('app.current_user_auth_id', true)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by)
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW),
      current_setting('app.current_user_auth_id', true)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by)
    VALUES (
      TG_TABLE_NAME,
      OLD.id,
      'DELETE',
      to_jsonb(OLD),
      NULL,
      current_setting('app.current_user_auth_id', true)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on transactions table
DROP TRIGGER IF EXISTS audit_transactions_trigger ON transactions;
CREATE TRIGGER audit_transactions_trigger
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

-- Create trigger on grocery_items table
DROP TRIGGER IF EXISTS audit_grocery_items_trigger ON grocery_items;
CREATE TRIGGER audit_grocery_items_trigger
AFTER INSERT OR UPDATE OR DELETE ON grocery_items
FOR EACH ROW EXECUTE FUNCTION process_audit_log();
`;

/**
 * Run this function to create the audit triggers in the database.
 * This should be called after the audit_logs table migration has been applied.
 */
export async function setupAuditTriggers(): Promise<void> {
  await db.execute(auditTriggerSQL);
  console.log("Audit triggers created successfully");
}

/**
 * SQL to drop the audit triggers and function (for cleanup/rollback)
 */
export const dropAuditTriggerSQL = sql`
DROP TRIGGER IF EXISTS audit_transactions_trigger ON transactions;
DROP TRIGGER IF EXISTS audit_grocery_items_trigger ON grocery_items;
DROP FUNCTION IF EXISTS process_audit_log();
`;

/**
 * Remove audit triggers from the database
 */
export async function removeAuditTriggers(): Promise<void> {
  await db.execute(dropAuditTriggerSQL);
  console.log("Audit triggers removed successfully");
}
