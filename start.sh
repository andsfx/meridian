#!/bin/bash
cd /home/ubuntu/meridian
set -a
source .env
set +a
exec node index.js