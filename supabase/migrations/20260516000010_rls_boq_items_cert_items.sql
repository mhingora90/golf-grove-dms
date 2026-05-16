-- Scope boq_items and payment_certificate_items to user's projects
-- Use EXISTS+JOIN instead of subquery+ANY to avoid SRF-in-WHERE restriction

-- boq_items: scoped via boq_bills.project_id
DROP POLICY IF EXISTS "boq_items_select" ON boq_items;
DROP POLICY IF EXISTS "boq_items_insert" ON boq_items;
DROP POLICY IF EXISTS "boq_items_update" ON boq_items;
DROP POLICY IF EXISTS "boq_items_delete" ON boq_items;

CREATE POLICY "boq_items_select" ON boq_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boq_bills bb
      JOIN project_users pu ON pu.project_id = bb.project_id
      WHERE bb.id = bill_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "boq_items_insert" ON boq_items FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('developer','consultant')
    AND EXISTS (
      SELECT 1 FROM boq_bills bb
      JOIN project_users pu ON pu.project_id = bb.project_id
      WHERE bb.id = bill_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "boq_items_update" ON boq_items FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('developer','consultant')
    AND EXISTS (
      SELECT 1 FROM boq_bills bb
      JOIN project_users pu ON pu.project_id = bb.project_id
      WHERE bb.id = bill_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "boq_items_delete" ON boq_items FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('developer','consultant')
    AND EXISTS (
      SELECT 1 FROM boq_bills bb
      JOIN project_users pu ON pu.project_id = bb.project_id
      WHERE bb.id = bill_id AND pu.user_id = auth.uid()
    )
  );

-- payment_certificate_items: scoped via payment_certificates.project_id
DROP POLICY IF EXISTS "payment_cert_items_select" ON payment_certificate_items;
DROP POLICY IF EXISTS "payment_cert_items_insert" ON payment_certificate_items;
DROP POLICY IF EXISTS "payment_cert_items_update" ON payment_certificate_items;
DROP POLICY IF EXISTS "payment_cert_items_delete" ON payment_certificate_items;

CREATE POLICY "payment_cert_items_select" ON payment_certificate_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM payment_certificates pc
      JOIN project_users pu ON pu.project_id = pc.project_id
      WHERE pc.id = cert_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_cert_items_insert" ON payment_certificate_items FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('developer','contractor')
    AND EXISTS (
      SELECT 1 FROM payment_certificates pc
      JOIN project_users pu ON pu.project_id = pc.project_id
      WHERE pc.id = cert_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_cert_items_update" ON payment_certificate_items FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('developer','consultant','contractor')
    AND EXISTS (
      SELECT 1 FROM payment_certificates pc
      JOIN project_users pu ON pu.project_id = pc.project_id
      WHERE pc.id = cert_id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_cert_items_delete" ON payment_certificate_items FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('developer','contractor')
    AND EXISTS (
      SELECT 1 FROM payment_certificates pc
      JOIN project_users pu ON pu.project_id = pc.project_id
      WHERE pc.id = cert_id AND pu.user_id = auth.uid()
    )
  );
