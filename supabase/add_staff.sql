 INSERT INTO public.profiles (id, full_name, email, role)
    SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), email, 'admin'
    FROM auth.users
    WHERE email = 'hermarcentillas@gmail.com'
    ON CONFLICT (id) 
    DO UPDATE SET role = 'admin'