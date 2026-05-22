-- Allow 'pending' role for new user registrations awaiting admin approval.
-- The existing profiles_role_check constraint was created via dashboard and
-- didn't include 'pending', causing trigger to fail on signup.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role in ('developer','sales','consultant','contractor','subcontractor','pending')
  );
