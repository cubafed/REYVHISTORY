#!/bin/bash
cd "$(dirname "$0")/project"
exec python3 serve.py 8000
