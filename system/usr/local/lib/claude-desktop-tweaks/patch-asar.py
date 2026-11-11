#!/usr/bin/env python3
"""Make Claude Desktop's app.asar load claude-desktop-tweaks' loader before the real entry point.

Appends the loader and a rewritten package.json to the archive's data section and points the
header at them; nothing else in the archive changes. Safe to run repeatedly: an archive that is
already patched only gets its loader replaced when loader.js has changed since.
"""
import hashlib
import json
import os
import re
import struct
import sys

ASAR = sys.argv[1] if len(sys.argv) > 1 else "/usr/lib/claude-desktop/resources/app.asar"
LOADER_TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loader.js")
LOADER_NAME = "claude-desktop-tweaks.js"
BLOCK_SIZE = 4 * 1024 * 1024


def integrity(data):
    return {
        "algorithm": "SHA256",
        "hash": hashlib.sha256(data).hexdigest(),
        "blockSize": BLOCK_SIZE,
        "blocks": [hashlib.sha256(data[i:i + BLOCK_SIZE]).hexdigest() for i in range(0, max(len(data), 1), BLOCK_SIZE)],
    }


def read_entry(data, entry):
    offset = int(entry["offset"])
    return bytes(data[offset:offset + entry["size"]])


def main():
    with open(ASAR, "rb") as f:
        raw = f.read()
    header_size = struct.unpack_from("<I", raw, 4)[0]
    json_len = struct.unpack_from("<I", raw, 12)[0]
    header = json.loads(raw[16:16 + json_len])
    data = bytearray(raw[8 + header_size:])
    files = header["files"]

    with open(LOADER_TEMPLATE, "rb") as f:
        template = f.read()
    pkg = json.loads(read_entry(data, files["package.json"]))
    updates = []
    if pkg["main"] == LOADER_NAME:
        current = read_entry(data, files[LOADER_NAME])
        match = re.search(rb'require\("\./([^"]+)"\);?\s*$', current)
        if not match:
            sys.exit("claude-desktop-tweaks: cannot find the original entry point in the patched loader")
        loader = template.replace(b"__ORIGINAL_MAIN__", match.group(1))
        if loader == current:
            print("claude-desktop-tweaks: app.asar already patched")
            return
        updates.append((LOADER_NAME, loader))
    else:
        loader = template.replace(b"__ORIGINAL_MAIN__", pkg["main"].encode())
        pkg["main"] = LOADER_NAME
        updates.append(("package.json", json.dumps(pkg, indent=2).encode() + b"\n"))
        updates.append((LOADER_NAME, loader))

    for name, content in updates:
        files[name] = {"size": len(content), "offset": str(len(data)), "integrity": integrity(content)}
        data += content

    header_json = json.dumps(header, separators=(",", ":")).encode()
    payload = struct.pack("<I", len(header_json)) + header_json
    payload += b"\0" * (-len(payload) % 4)
    header_pickle = struct.pack("<I", len(payload)) + payload
    out = struct.pack("<II", 4, len(header_pickle)) + header_pickle + bytes(data)

    tmp = ASAR + ".tweaks-tmp"
    with open(tmp, "wb") as f:
        f.write(out)
    os.chmod(tmp, os.stat(ASAR).st_mode & 0o7777)
    os.replace(tmp, ASAR)
    print("claude-desktop-tweaks: " + ("updated the loader in" if len(updates) == 1 else "patched") + " app.asar")


if __name__ == "__main__":
    main()
