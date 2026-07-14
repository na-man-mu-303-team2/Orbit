from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
import os
from typing import Any, Literal


LogLevel = Literal["debug", "info", "warn", "error"]

_LOGGER_NAME = "orbit.python-worker.events"
_LEVELS: dict[LogLevel, int] = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warn": logging.WARNING,
    "error": logging.ERROR,
}


def _configured_logger() -> logging.Logger:
    logger = logging.getLogger(_LOGGER_NAME)
    if getattr(logger, "_orbit_configured", False):
        return logger

    configured_level = os.getenv("LOG_LEVEL", "info").casefold()
    if configured_level == "silent":
        logger.disabled = True
    else:
        level = {
            "trace": logging.DEBUG,
            "debug": logging.DEBUG,
            "info": logging.INFO,
            "warn": logging.WARNING,
            "error": logging.ERROR,
            "fatal": logging.CRITICAL,
        }.get(configured_level, logging.INFO)
        logger.setLevel(level)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.propagate = False

    setattr(logger, "_orbit_configured", True)
    return logger


def log_event(
    level: LogLevel,
    event: str,
    **fields: Any,
) -> None:
    payload = {
        "timestamp": datetime.now(UTC).isoformat(),
        "service": "python-worker",
        "appEnv": os.getenv("APP_ENV", "local"),
        "event": event,
        **fields,
    }
    _configured_logger().log(
        _LEVELS[level],
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )
