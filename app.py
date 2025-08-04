from __future__ import annotations

import os
import time
import json
from typing import List, Tuple
from flask import Flask, request, jsonify
import requests
from functools import lru_cache

# Configuration (can be overridden via environment variables)
UPSTREAM_ENDPOINT = os.environ.get("OTD_ENDPOINT", "https://api.opentopodata.org/v1/ned10m")
BATCH_SIZE = int(os.environ.get("OTD_BATCH_SIZE", "100"))
TIMEOUT = float(os.environ.get("OTD_TIMEOUT", "8.0"))
RETRIES = int(os.environ.get("OTD_RETRIES", "2"))
BACKOFF_BASE = float(os.environ.get("OTD_BACKOFF_BASE", "0.6"))
MAX_POINTS = int(os.environ.get("OTD_MAX_POINTS", "2500"))  # server hard cap
USER_AGENT = os.environ.get("OTD_USER_AGENT", "LayflatModeler/1.0 (+pythonanywhere)")

app = Flask(__name__)

def _normalize_locations(raw: List[str]) -> List[str]:
    norm = []
    for item in raw:
        if not isinstance(item, str):
            continue
        s = item.strip()
        if not s:
            continue
        # Expect "lat,lon"
        parts = s.split(",")
        if len(parts) < 2:
            continue
        try:
            lat = float(parts[0].strip())
            lon = float(parts[1].strip())
        except Exception:
            continue
        # Clamp precision to 6 decimals to match client batching
        norm.append(f"{lat:.6f},{lon:.6f}")
    return norm

def _chunk(seq: List[str], n: int) -> List[List[str]]:
    return [seq[i:i+n] for i in range(0, len(seq), n)]

def _request_upstream(locations_chunk: List[str]) -> Tuple[bool, List[dict]]:
    params = {
        "locations": "|".join(locations_chunk)
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    url = UPSTREAM_ENDPOINT
    for attempt in range(RETRIES + 1):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
            if resp.status_code == 429:
                # Rate limited; backoff and retry
                raise requests.HTTPError("429 Too Many Requests")
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or data.get("status") != "OK" or not isinstance(data.get("results"), list):
                raise ValueError("Invalid upstream payload")
            return True, data["results"]
        except Exception:
            if attempt == RETRIES:
                return False, []
            time.sleep(BACKOFF_BASE * (attempt + 1))
    return False, []

@lru_cache(maxsize=256)
def _cached_batch(loc_key: str) -> Tuple[bool, List[dict]]:
    # loc_key is a pipe-joined list of "lat,lon"
    success, results = _request_upstream(loc_key.split("|"))
    return success, results

@app.route("/elevation", methods=["POST"])
def elevation():
    """
    Request body:
      { "locations": ["lat,lon", ...] }
    Response (mirrors OpenTopoData):
      { "status":"OK", "results":[ { "elevation": meters, "location": { "lat":.., "lng":.. } }, ... ] }
      or { "status":"ERROR", "error":"message" }
    """
    try:
        payload = request.get_json(force=True, silent=False)
    except Exception:
        return jsonify({"status": "ERROR", "error": "Invalid JSON"}), 400

    if not isinstance(payload, dict) or "locations" not in payload:
        return jsonify({"status": "ERROR", "error": "Missing 'locations' array"}), 400

    norm = _normalize_locations(payload.get("locations") or [])
    if not norm:
        return jsonify({"status": "ERROR", "error": "No valid coordinates provided"}), 400

    if len(norm) > MAX_POINTS:
        return jsonify({"status": "ERROR", "error": f"Request exceeds max points ({MAX_POINTS})"}), 400

    chunks = _chunk(norm, BATCH_SIZE)
    all_results: List[dict] = []
    for ch in chunks:
        key = "|".join(ch)
        # Use cached upstream calls per identical chunk
        ok, results = _cached_batch(key)
        if not ok or len(results) != len(ch):
            # Upstream failure; mark this batch with zeros to maintain length consistency
            all_results.extend([{"elevation": 0.0, "location": None}] * len(ch))
        else:
            all_results.extend(results)

    return jsonify({"status": "OK", "results": all_results})

@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"ok": True, "upstream": UPSTREAM_ENDPOINT})

if __name__ == "__main__":
    # For local debugging; on PythonAnywhere this is run by WSGI server.
    app.run(host="127.0.0.1", port=5000, debug=False)