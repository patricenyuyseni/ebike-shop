"""OPTIONAL development helper: runs a throw-away local PostgreSQL WITHOUT installing PostgreSQL.
Run it in its own terminal and leave it open:   python scripts/dev_db.py
It prints the DATABASE_URL to paste into backend/.env. Press Ctrl+C to stop it.
Data is kept in backend/.pgdata. For production use a real managed PostgreSQL instead."""
import pathlib
import time

import pgserver

data = pathlib.Path(__file__).resolve().parents[1] / ".pgdata"
srv = pgserver.get_server(data, cleanup_mode="stop")
if "ebike_store" not in srv.psql("select datname from pg_database;"):
    srv.psql("create database ebike_store;")
url = srv.get_uri().replace("postgresql://", "postgresql+psycopg://").replace("/postgres?", "/ebike_store?")
print("\nPostgreSQL is running.\nPut this line in backend/.env :\n\nDATABASE_URL=" + url + "\n\nLeave this window open. Press Ctrl+C to stop.\n", flush=True)
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    pass
