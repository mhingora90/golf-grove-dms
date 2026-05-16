-- Fix boq_bills UPDATE policy to include WITH CHECK

DROP POLICY IF EXISTS "boq_bills_update" ON boq_bills;

CREATE POLICY "boq_bills_update" ON boq_bills
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );
