-- Create workspaces through a narrow, authenticated database function.
-- Ownership is derived from the verified Supabase JWT, never trusted from client input.
CREATE OR REPLACE FUNCTION public.create_company_workspace(
  p_name text,
  p_industry text DEFAULT 'New workspace'
)
RETURNS TABLE(id uuid, name text, industry text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a workspace'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) < 2 OR char_length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Workspace name must be between 2 and 120 characters'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    INSERT INTO public.companies AS c (name, industry, created_by)
    VALUES (
      trim(p_name),
      coalesce(nullif(trim(p_industry), ''), 'New workspace'),
      v_user_id
    )
    RETURNING c.id, c.name, c.industry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_workspace(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_workspace(text, text) TO authenticated;
