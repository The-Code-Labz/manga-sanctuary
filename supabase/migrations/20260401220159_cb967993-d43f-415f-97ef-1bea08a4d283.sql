
-- Allow admins to update novels
CREATE POLICY "Admins can update novels"
ON public.novels
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete novels
CREATE POLICY "Admins can delete novels"
ON public.novels
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete novel_genres (needed for edit flow)
CREATE POLICY "Admins can delete novel_genres"
ON public.novel_genres
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete novel_tags (needed for edit flow)
CREATE POLICY "Admins can delete novel_tags"
ON public.novel_tags
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update chapters
CREATE POLICY "Admins can update chapters"
ON public.chapters
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete chapters
CREATE POLICY "Admins can delete chapters"
ON public.chapters
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert/delete genres
CREATE POLICY "Admins can insert genres"
ON public.genres
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete genres"
ON public.genres
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert/delete tags
CREATE POLICY "Admins can insert tags"
ON public.tags
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tags"
ON public.tags
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
