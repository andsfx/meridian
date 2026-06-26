#!/usr/bin/env python3
"""Update TELEGRAM_BOT_TOKEN in .env"""
import re

OLD_TOKEN = "8405236892:AAHYDnv2yYxSAxjzfc0BX9BTOsvlEeFl9hDq1L0ONUQ"
NEW_TOKEN = "8405236892:AAHgapqbnLC9A18xN_TRNj4178oxgqf628c"

with open('/home/ubuntu/meridian/.env', 'r') as f:
    content = f.read()

if OLD_TOKEN in content:
    content = content.replace(OLD_TOKEN, NEW_TOKEN)
    print(f"Replaced old token with new")
elif NEW_TOKEN in content:
    print("Already has new token")
else:
    # Try regex
    content = re.sub(r'TELEGRAM_BOT_TOKEN=.*', f'TELEGRAM_BOT_TOKEN={NEW_TOKEN}', content)
    print("Used regex replacement")

with open('/home/ubuntu/meridian/.env', 'w') as f:
    f.write(content)

# Verify
with open('/home/ubuntu/meridian/.env', 'r') as f:
    for line in f:
        if 'TELEGRAM_BOT_TOKEN' in line:
            val = line.strip().split('=')[1]
            print(f"Token now: ...{val[-10:]} (len={len(val)})")
