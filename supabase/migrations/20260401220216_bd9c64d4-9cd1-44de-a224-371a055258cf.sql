
CREATE POLICY "Admins can view all novels"
ON public.novels
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
