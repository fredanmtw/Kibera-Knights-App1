# Kibera Knights Chess Club app

Players, coaches, tournament results, leaderboard, with role-based login.
No dependencies: you only need Node.js 18 or newer (https://nodejs.org).

## Run
Easiest: double-click start.bat (Windows) or run ./start.sh (Mac/Linux); it opens the app in your browser.
Always use http://localhost:3000. Do NOT open public/index.html directly: login will fail with "failed to fetch".
    node server.js          # or: npm start
Open http://localhost:3000 and sign in with the admin account that ships with the app (see below).
Data is saved in data/db.json (back this file up regularly).

## Logo
The club logo is public/logo.jpg. To change it, replace that file (keep the name logo.jpg) or edit the <img> in public/index.html.

## Roles
- admin: everything, including deleting records and managing users
- coach: add and edit players, coaches, tournaments, results
- member: view only
Admins create accounts in the Users tab and give people their temporary password.

## Settings (environment variables)
PORT (default 3000), DATA_DIR (default ./data)

## Going live (full guide in DEPLOY.md)
- Host on any Node-capable server (a small VPS, Render, Railway, etc.) and keep data/ on persistent disk.
- Put it behind HTTPS (e.g. Caddy or nginx, or the host's built-in HTTPS). Passwords and sessions must not travel over plain HTTP on the internet.
- Sessions are kept in memory, so everyone is logged out when the server restarts.
- Storage is a JSON file: fine for a club (thousands of records), not for heavy traffic.

## First admin
The app ships with one admin account, username `admin`, with a temporary password given to the club.
At first login the admin must choose a new password. The admin then creates every other account in the
Users tab (name, username, temporary password, role); each person must also change their password at first login.
If the admin password is ever lost, run: `node create-admin.js admin` (prints a new temporary password).
Do not leave the original temporary password in chats or emails after changing it.

## Contact details
Players (own phone, email, parent/guardian name and phone), coaches and user accounts all store contact details. View-only members do not see players' or coaches' contact details; coaches and admins do.

## Schools
Players and coaches each have a School name field (players also have School level). The school name is visible to view-only members; contact details are not.
