"""Run the coordination service:  python -m coordinator"""
import logging
import os

from .app import create_app


def main():
    port = int(os.environ.get("COORD_PORT", 8000))
    host = os.environ.get("COORD_HOST", "127.0.0.1")
    app = create_app()
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    print(f"[coordinator] listening on http://{host}:{port}", flush=True)
    app.run(host=host, port=port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
