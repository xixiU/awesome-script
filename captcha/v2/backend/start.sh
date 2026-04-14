#!/bin/bash
cd "$(dirname "$0")/.."
uvicorn backend.main:app --host 0.0.0.0 --port 9876 --reload
