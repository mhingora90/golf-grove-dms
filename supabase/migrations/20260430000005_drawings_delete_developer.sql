-- Developer can delete drawings and their revision history
create policy "drawings: developer deletes"
  on public.drawings for delete to authenticated
  using (get_user_role() = 'developer');

create policy "drawing_revisions: developer deletes"
  on public.drawing_revisions for delete to authenticated
  using (get_user_role() = 'developer');
