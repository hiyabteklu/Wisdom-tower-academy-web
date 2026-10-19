# DO NOT RUN THE `.sql` FILES IN THIS FOLDER ON THE LIVE DATABASE

The live Supabase database is stricter than these scripts. Admin rights there come from `private.is_admin()` and a private admin list that only the database owner edits.

Several scripts here create policies such as `to authenticated using (true)`, `for all using (true)` or `select using (true)`. Policies ADD UP, so running one would let every signed-in student (or even a visitor who is not signed in) read or change orders, enrollments, access grants, content locks, free resources, rate limits and more.

These files are kept only as history of how the first version was built. Only the database owner changes the database, from the Supabase dashboard or through reviewed migrations.

Files covered: `supabase-master.sql`, `supabase-setup.sql`, `access-grants-setup.sql`, `catalog-setup.sql`, `content-locks-setup.sql`, `free-resources-setup.sql`, `free-resources-rls-fix.sql`, `leaderboard-setup.sql`, `learning-content-setup.sql`, `payment-receipts-setup.sql`.

If an app screen says a table is missing, tell the database owner. Do not paste these scripts into the SQL Editor.
