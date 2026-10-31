from pathlib import Path
from flask import Flask, jsonify, request
import json
import math
import subprocess
import sys
import os

ROOT = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_folder=str(ROOT),
    static_url_path=""
)


@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    return jsonify({
        "status": "online",
        "application": "AI Ledger",
        "backend": "Flask"
    })

@app.post("/api/recalculate")
def recalculate():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Invalid JSON request."
        }), 400

    numeric_fields = [
        "hourly_rate",
        "ai_cost_per_task",
        "escaped_error_cost",
        "setup_cost",
        "target_review_minutes",
        "target_rework_minutes",
        "review_catch_rate"
    ]

    try:
        assumptions = {}

        for field in numeric_fields:
            value = float(data[field])

            if not math.isfinite(value):
                raise ValueError(f"{field} must be a finite number.")

            assumptions[field] = value

        if assumptions["hourly_rate"] <= 0:
            raise ValueError("Hourly rate must be greater than zero.")

        if assumptions["ai_cost_per_task"] < 0:
            raise ValueError("AI cost cannot be negative.")

        if assumptions["escaped_error_cost"] < 0:
            raise ValueError("Error cost cannot be negative.")

        if assumptions["setup_cost"] < 0:
            raise ValueError("Setup cost cannot be negative.")

        if assumptions["target_review_minutes"] <= 0:
            raise ValueError("Review minutes must be greater than zero.")

        if assumptions["target_rework_minutes"] <= 0:
            raise ValueError("Rework minutes must be greater than zero.")

        if not 0 <= assumptions["review_catch_rate"] <= 1:
            raise ValueError("Review catch rate must be between 0 and 1.")

        assumptions["configuration_label"] = "ASSUMPTION"
        assumptions["data_label"] = "SYNTHETIC SIMULATION"

        config_path = ROOT / "assumptions.json"

        config_path.write_text(
            json.dumps(assumptions, indent=4),
            encoding="utf-8"
        )

        results = {}
        process_env = os.environ.copy()
        process_env["PYTHONIOENCODING"] = "utf-8"

        for script in [
            "scripts/run_analysis.py",
            "scripts/simulation.py"
        ]:
            process = subprocess.run(
                [sys.executable, str(ROOT / script)],
                cwd=ROOT,
                capture_output=True,
text=True,
encoding="utf-8",
errors="replace",
env=process_env,
timeout=600
            )

            results[script] = process.stdout

            if process.returncode != 0:
                return jsonify({
                    "success": False,
                    "failed_script": script,
                    "error": process.stderr,
                    "output": process.stdout
                }), 500

        return jsonify({
            "success": True,
            "message": "AI Ledger model recalculated successfully.",
            "results": results
        })

    except (KeyError, TypeError, ValueError) as error:
        return jsonify({
            "success": False,
            "error": str(error)
        }), 400

    except subprocess.TimeoutExpired:
        return jsonify({
            "success": False,
            "error": "Model recalculation timed out."
        }), 504

    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
