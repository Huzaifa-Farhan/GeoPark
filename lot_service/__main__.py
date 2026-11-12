"""Run one lot:  python -m lot_service   (configure with LOT_* environment variables)."""
import logging

from .app import create_app
from .config import LotConfig


def main():
    cfg = LotConfig.from_env()
    app = create_app(cfg, start_background=True)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    print(f"[{cfg.lot_id}] '{cfg.name}' listening on {cfg.public_url}  "
          f"(capacity {cfg.capacity}, db {cfg.db_path}, coordinator {cfg.coordinator_url})", flush=True)
    app.run(host=cfg.host, port=cfg.port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
