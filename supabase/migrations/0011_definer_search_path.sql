-- 0011 — harden my_admin_org_ids(). Idempotent.
--
-- my_admin_org_ids() (0006) is SECURITY DEFINER but, unlike my_org_ids() and
-- handle_new_user(), it never pinned its search_path. A role able to create an
-- object in a schema earlier on the function's search_path could shadow
-- `public.memberships` and influence which org IDs are returned as "admin".
-- Pin it to `public` to match the project's other definer functions.
alter function public.my_admin_org_ids() set search_path = public;
