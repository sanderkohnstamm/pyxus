#!/usr/bin/env python3
"""
MAVLink v2 Swift Code Generator

Reads MAVLink XML dialect files (e.g. ardupilotmega.xml) and generates:
  - MAVLinkEnums.swift     — enums + bitmask OptionSets
  - MAVLinkMessages.swift  — message structs with encode/decode
  - MAVLinkCRCExtras.swift — CRC extra byte table

Usage:
  python3 mavgen_swift.py --dialect ardupilotmega.xml --output ../ios/pyxios/pyxios/MAVLink/Generated/
"""

import argparse
import os
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

# MAVLink type → (Swift type, wire size in bytes, struct pack format)
TYPE_MAP = {
    "uint8_t":   ("UInt8",   1, "B"),
    "int8_t":    ("Int8",    1, "b"),
    "uint16_t":  ("UInt16",  2, "H"),
    "int16_t":   ("Int16",   2, "h"),
    "uint32_t":  ("UInt32",  4, "I"),
    "int32_t":   ("Int32",   4, "i"),
    "uint64_t":  ("UInt64",  8, "Q"),
    "int64_t":   ("Int64",   8, "q"),
    "float":     ("Float",   4, "f"),
    "double":    ("Double",  8, "d"),
    "uint8_t_mavlink_version": ("UInt8", 1, "B"),
    "char":      ("UInt8",   1, "B"),  # single char handled as byte
}


def wire_size(type_str):
    """Return wire size for a base type string (without array)."""
    base = type_str.split("[")[0]
    if base == "char":
        return 1
    info = TYPE_MAP.get(base)
    return info[1] if info else 1


def parse_field(field_elem):
    """Parse a <field> element into a dict."""
    raw_type = field_elem.get("type")
    name = field_elem.get("name")
    enum_name = field_elem.get("enum")
    description = (field_elem.text or "").strip()

    # Split array: e.g. "char[50]" → base="char", array_len=50
    base_type = raw_type
    array_len = 0
    if "[" in raw_type:
        base_type = raw_type.split("[")[0]
        array_len = int(raw_type.split("[")[1].rstrip("]"))

    return {
        "name": name,
        "raw_type": raw_type,
        "base_type": base_type,
        "array_len": array_len,
        "enum": enum_name,
        "description": description,
        "wire_size": wire_size(base_type),
        "total_wire_size": wire_size(base_type) * (array_len if array_len else 1),
    }


def swift_type_for_field(field):
    """Return Swift type string for a parsed field."""
    base = field["base_type"]
    arr = field["array_len"]

    if base == "char" and arr > 0:
        return "String"
    if arr > 0:
        swift_base = TYPE_MAP.get(base, ("UInt8",))[0]
        return f"[{swift_base}]"
    return TYPE_MAP.get(base, ("UInt8",))[0]


def swift_default_for_field(field):
    """Return Swift default value for a parsed field."""
    st = swift_type_for_field(field)
    if st == "String":
        return '""'
    if st.startswith("["):
        inner = st[1:-1]
        return f"[{inner}](repeating: 0, count: {field['array_len']})"
    if st in ("Float", "Double"):
        return "0"
    return "0"


# ---------------------------------------------------------------------------
# XML parsing with recursive includes
# ---------------------------------------------------------------------------

def resolve_xml(dialect_path):
    """Parse XML dialect, recursively resolving <include> tags.
    Returns (enums_list, messages_list)."""
    dialect_path = Path(dialect_path).resolve()
    return _parse_xml(dialect_path, set())


def _parse_xml(xml_path, visited):
    if xml_path in visited:
        return [], []
    visited.add(xml_path)

    tree = ET.parse(xml_path)
    root = tree.getroot()

    enums = []
    messages = []

    # Resolve includes first
    for inc in root.findall(".//include"):
        inc_path = xml_path.parent / inc.text
        inc_enums, inc_msgs = _parse_xml(inc_path, visited)
        enums.extend(inc_enums)
        messages.extend(inc_msgs)

    # Parse enums
    for enum_elem in root.findall(".//enums/enum"):
        e = _parse_enum(enum_elem)
        enums.append(e)

    # Parse messages
    for msg_elem in root.findall(".//messages/message"):
        m = _parse_message(msg_elem)
        messages.append(m)

    return enums, messages


def _parse_enum(elem):
    name = elem.get("name")
    bitmask = elem.get("bitmask", "false").lower() == "true"
    description = ""
    desc_elem = elem.find("description")
    if desc_elem is not None and desc_elem.text:
        description = desc_elem.text.strip()

    entries = []
    for entry in elem.findall("entry"):
        val = entry.get("value")
        if val is None:
            continue
        # Parse value (may be hex)
        if val.startswith("0x") or val.startswith("0X"):
            val_int = int(val, 16)
        else:
            val_int = int(val)
        entry_desc = ""
        ed = entry.find("description")
        if ed is not None and ed.text:
            entry_desc = ed.text.strip()
        entries.append({
            "name": entry.get("name"),
            "value": val_int,
            "description": entry_desc,
        })

    return {
        "name": name,
        "bitmask": bitmask,
        "description": description,
        "entries": entries,
    }


def _parse_message(elem):
    msg_id = int(elem.get("id"))
    name = elem.get("name")
    description = ""
    desc_elem = elem.find("description")
    if desc_elem is not None and desc_elem.text:
        description = desc_elem.text.strip()

    fields = []
    extension_fields = []
    in_extensions = False

    for child in elem:
        if child.tag == "extensions":
            in_extensions = True
            continue
        if child.tag == "field":
            f = parse_field(child)
            f["is_extension"] = in_extensions
            if in_extensions:
                extension_fields.append(f)
            else:
                fields.append(f)

    return {
        "id": msg_id,
        "name": name,
        "description": description,
        "fields": fields,
        "extension_fields": extension_fields,
    }


# ---------------------------------------------------------------------------
# CRC extra calculation
# ---------------------------------------------------------------------------

def crc_wire_type(base_type):
    """Map XML type to wire type for CRC calculation.
    e.g. uint8_t_mavlink_version → uint8_t"""
    WIRE_TYPE_MAP = {
        "uint8_t_mavlink_version": "uint8_t",
    }
    return WIRE_TYPE_MAP.get(base_type, base_type)


def crc_extra(msg):
    """Calculate CRC extra byte for a message definition.
    Uses base fields only (not extensions), in wire order (sorted by type size desc)."""
    crc = crc_accumulate_str(msg["name"] + " ")

    # Fields sorted by wire size descending (stable sort)
    sorted_fields = sorted(msg["fields"], key=lambda f: f["wire_size"], reverse=True)

    for field in sorted_fields:
        crc = crc_accumulate_str(crc_wire_type(field["base_type"]) + " ", crc)
        crc = crc_accumulate_str(field["name"] + " ", crc)
        if field["array_len"] > 0:
            crc = crc_accumulate_byte(field["array_len"], crc)

    return (crc & 0xFF) ^ (crc >> 8)


def crc_accumulate_byte(b, crc=0xFFFF):
    tmp = b ^ (crc & 0xFF)
    tmp ^= (tmp << 4) & 0xFF
    crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)
    return crc & 0xFFFF


def crc_accumulate_str(s, crc=0xFFFF):
    for ch in s:
        crc = crc_accumulate_byte(ord(ch), crc)
    return crc


# ---------------------------------------------------------------------------
# Swift code generation
# ---------------------------------------------------------------------------

def to_swift_name(mavlink_name):
    """Convert SCREAMING_SNAKE to UpperCamelCase.
    e.g. MAV_CMD_NAV_WAYPOINT → MavCmdNavWaypoint"""
    parts = mavlink_name.lower().split("_")
    return "".join(p.capitalize() for p in parts)


def to_swift_case_name(entry_name, enum_prefix):
    """Convert enum entry to swift case name.
    Strip common prefix, then lowerCamelCase."""
    name = entry_name
    if name.startswith(enum_prefix + "_"):
        name = name[len(enum_prefix) + 1:]
    elif name.startswith(enum_prefix):
        name = name[len(enum_prefix):]

    if not name:
        name = entry_name

    parts = name.lower().split("_")
    result = parts[0] + "".join(p.capitalize() for p in parts[1:])

    # Avoid starting with a digit
    if result and result[0].isdigit():
        result = "_" + result

    # Avoid Swift keywords
    SWIFT_KEYWORDS = {
        "default", "return", "switch", "case", "break", "continue",
        "class", "struct", "enum", "protocol", "import", "true", "false",
        "static", "throw", "throws", "try", "catch", "in", "for", "while",
        "do", "if", "else", "guard", "let", "var", "func", "nil", "self",
        "super", "is", "as", "where", "repeat", "defer", "init", "deinit",
        "extension", "subscript", "typealias", "associatedtype", "operator",
        "precedencegroup", "internal", "public", "private", "fileprivate",
        "open", "mutating", "nonmutating", "override", "required", "final",
        "lazy", "weak", "unowned", "convenience", "dynamic", "indirect",
        "infix", "prefix", "postfix", "left", "right", "none", "some", "any",
        "async", "await", "rethrows", "yield", "consume", "copy", "borrowing",
        "sending", "nonisolated",
    }
    if result in SWIFT_KEYWORDS:
        result = "`" + result + "`"

    return result


def to_swift_msg_struct(name):
    """Convert MESSAGE_NAME to MsgMessageName."""
    parts = name.lower().split("_")
    return "Msg" + "".join(p.capitalize() for p in parts)


def generate_enums_swift(enums, out_path):
    """Generate MAVLinkEnums.swift."""
    lines = [
        "// MAVLinkEnums.swift",
        "// Auto-generated by mavgen_swift.py — DO NOT EDIT",
        "",
        "import Foundation",
        "",
    ]

    # Deduplicate enums by name (later definition wins)
    seen = {}
    for e in enums:
        seen[e["name"]] = e
    unique_enums = list(seen.values())

    for e in unique_enums:
        if e["bitmask"]:
            _gen_option_set(e, lines)
        else:
            _gen_enum(e, lines)
        lines.append("")

    Path(out_path).write_text("\n".join(lines))


def _sanitize_description(desc, max_len=120):
    """Sanitize a description for use in a Swift comment."""
    # Replace newlines and excessive whitespace with single spaces
    cleaned = " ".join(desc.split())
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len] + "..."
    return cleaned


def _gen_enum(e, lines):
    swift_name = to_swift_name(e["name"])
    prefix = e["name"]

    desc = _sanitize_description(e["description"]) if e["description"] else e["name"]
    lines.append(f"/// {desc}")
    lines.append(f"enum {swift_name}: UInt32, CaseIterable, Sendable {{")

    seen_values = set()
    seen_names = set()
    for entry in e["entries"]:
        val = entry["value"]
        if val in seen_values:
            continue
        seen_values.add(val)
        case_name = to_swift_case_name(entry["name"], prefix)
        # Disambiguate duplicate case names
        if case_name in seen_names:
            case_name = to_swift_case_name(entry["name"], prefix + "_DISAMBIG")
            if case_name in seen_names:
                case_name = f"{case_name}_{val}"
        seen_names.add(case_name)
        lines.append(f"    case {case_name} = {val}")

    lines.append("}")


def _gen_option_set(e, lines):
    swift_name = to_swift_name(e["name"])
    prefix = e["name"]

    desc = _sanitize_description(e["description"]) if e["description"] else e["name"]
    lines.append(f"/// {desc}")
    lines.append(f"struct {swift_name}: OptionSet, Sendable {{")
    lines.append(f"    let rawValue: UInt32")
    lines.append("")

    for entry in e["entries"]:
        case_name = to_swift_case_name(entry["name"], prefix)
        lines.append(f"    static let {case_name} = {swift_name}(rawValue: {entry['value']})")

    lines.append("}")


def generate_messages_swift(messages, out_path):
    """Generate MAVLinkMessages.swift."""
    lines = [
        "// MAVLinkMessages.swift",
        "// Auto-generated by mavgen_swift.py — DO NOT EDIT",
        "",
        "import Foundation",
        "",
    ]

    # Deduplicate by ID
    seen = {}
    for m in messages:
        seen[m["id"]] = m
    unique_msgs = sorted(seen.values(), key=lambda m: m["id"])

    for msg in unique_msgs:
        _gen_message_struct(msg, lines)
        lines.append("")

    Path(out_path).write_text("\n".join(lines))


def _wire_ordered_fields(fields):
    """Sort fields by wire size descending (stable sort) for encoding order."""
    return sorted(fields, key=lambda f: f["wire_size"], reverse=True)


def _gen_message_struct(msg, lines):
    struct_name = to_swift_msg_struct(msg["name"])
    all_fields = msg["fields"] + msg["extension_fields"]
    wire_fields = _wire_ordered_fields(msg["fields"])  # base fields in wire order
    wire_ext = msg["extension_fields"]  # extensions keep declaration order
    base_payload_size = sum(f["total_wire_size"] for f in msg["fields"])
    ext_payload_size = sum(f["total_wire_size"] for f in msg["extension_fields"])
    crc = crc_extra(msg)

    lines.append(f"/// {msg['name']} (#{msg['id']})")
    lines.append(f"struct {struct_name}: Sendable {{")
    lines.append(f"    static let id: UInt32 = {msg['id']}")
    lines.append(f"    static let crcExtra: UInt8 = {crc}")
    lines.append(f"    static let basePayloadSize: Int = {base_payload_size}")
    lines.append("")

    # Properties
    for f in all_fields:
        st = swift_type_for_field(f)
        lines.append(f"    var {f['name']}: {st} = {swift_default_for_field(f)}")

    # init(from payload: Data)
    lines.append("")
    lines.append("    init() {}")
    lines.append("")
    lines.append("    init(from payload: Data) {")
    lines.append("        let d = payload")
    lines.append("        var o = 0")

    # Decode base fields in wire order
    for f in wire_fields:
        _gen_decode_field(f, lines)

    # Decode extension fields (only if payload long enough)
    if wire_ext:
        lines.append(f"        // Extension fields (only present in longer payloads)")
        for f in wire_ext:
            lines.append(f"        guard o < d.count else {{ return }}")
            _gen_decode_field(f, lines)

    lines.append("    }")

    # encode() -> [UInt8]
    lines.append("")
    lines.append("    func encode() -> [UInt8] {")
    total_size = base_payload_size + ext_payload_size
    lines.append(f"        var p = [UInt8](repeating: 0, count: {total_size})")
    lines.append("        var o = 0")

    for f in wire_fields:
        _gen_encode_field(f, lines)

    for f in wire_ext:
        _gen_encode_field(f, lines)

    lines.append("        return p")
    lines.append("    }")

    lines.append("}")


def _gen_decode_field(f, lines):
    base = f["base_type"]
    arr = f["array_len"]
    name = f["name"]
    sz = f["wire_size"]

    if base == "char" and arr > 0:
        # String: read arr bytes, convert to UTF-8, trim nulls
        lines.append(f"        if o + {arr} <= d.count {{")
        lines.append(f"            {name} = String(bytes: d[d.startIndex+o..<d.startIndex+o+{arr}], encoding: .utf8)?.trimmingCharacters(in: CharacterSet([\"\\0\"])) ?? \"\"")
        lines.append(f"        }}")
        lines.append(f"        o += {arr}")
    elif arr > 0:
        # Typed array
        swift_t = TYPE_MAP.get(base, ("UInt8",))[0]
        lines.append(f"        if o + {arr * sz} <= d.count {{")
        lines.append(f"            {name} = (0..<{arr}).map {{ i in")
        _gen_single_read(base, f"d.startIndex+o+i*{sz}", "                return ", lines)
        lines.append(f"            }}")
        lines.append(f"        }}")
        lines.append(f"        o += {arr * sz}")
    else:
        # Single value
        lines.append(f"        if o + {sz} <= d.count {{")
        _gen_single_read(base, "d.startIndex+o", f"            {name} = ", lines)
        lines.append(f"        }}")
        lines.append(f"        o += {sz}")


def _gen_single_read(base_type, offset, prefix, lines):
    """Generate a single value read from Data."""
    sz = TYPE_MAP[base_type][1]
    swift_t = TYPE_MAP[base_type][0]

    if sz == 1:
        lines.append(f"{prefix}d[{offset}]")
        return

    if base_type == "float":
        lines.append(f"{prefix}Float(bitPattern: UInt32(d[{offset}]) | UInt32(d[{offset}+1]) << 8 | UInt32(d[{offset}+2]) << 16 | UInt32(d[{offset}+3]) << 24)")
    elif base_type == "double":
        lines.append(f"{prefix}Double(bitPattern: UInt64(d[{offset}]) | UInt64(d[{offset}+1]) << 8 | UInt64(d[{offset}+2]) << 16 | UInt64(d[{offset}+3]) << 24 | UInt64(d[{offset}+4]) << 32 | UInt64(d[{offset}+5]) << 40 | UInt64(d[{offset}+6]) << 48 | UInt64(d[{offset}+7]) << 56)")
    elif sz == 2:
        lines.append(f"{prefix}{swift_t}(d[{offset}]) | {swift_t}(d[{offset}+1]) << 8")
    elif sz == 4:
        lines.append(f"{prefix}{swift_t}(d[{offset}]) | {swift_t}(d[{offset}+1]) << 8 | {swift_t}(d[{offset}+2]) << 16 | {swift_t}(d[{offset}+3]) << 24")
    elif sz == 8:
        lines.append(f"{prefix}{swift_t}(d[{offset}]) | {swift_t}(d[{offset}+1]) << 8 | {swift_t}(d[{offset}+2]) << 16 | {swift_t}(d[{offset}+3]) << 24 | {swift_t}(d[{offset}+4]) << 32 | {swift_t}(d[{offset}+5]) << 40 | {swift_t}(d[{offset}+6]) << 48 | {swift_t}(d[{offset}+7]) << 56")


def _gen_encode_field(f, lines):
    base = f["base_type"]
    arr = f["array_len"]
    name = f["name"]
    sz = f["wire_size"]

    if base == "char" and arr > 0:
        # String → UTF-8 bytes, pad to arr
        lines.append(f"        do {{")
        lines.append(f"            let bytes = Array({name}.utf8)")
        lines.append(f"            for i in 0..<min(bytes.count, {arr}) {{ p[o+i] = bytes[i] }}")
        lines.append(f"        }}")
        lines.append(f"        o += {arr}")
    elif arr > 0:
        lines.append(f"        for i in 0..<{arr} {{")
        _gen_single_write(base, f, is_array=True, lines=lines)
        lines.append(f"        }}")
        lines.append(f"        o += {arr * sz}")
    else:
        _gen_single_write(base, f, is_array=False, lines=lines)
        lines.append(f"        o += {sz}")


def _gen_single_write(base_type, field, is_array, lines):
    sz = TYPE_MAP[base_type][1]
    name = field["name"]

    if is_array:
        val_expr = f"{name}[i]"
        off = f"o+i*{sz}"
    else:
        val_expr = name
        off = "o"

    if base_type == "float":
        bits = f"{val_expr}.bitPattern"
        lines.append(f"        do {{ let b = {bits}; p[{off}] = UInt8(b & 0xFF); p[{off}+1] = UInt8((b >> 8) & 0xFF); p[{off}+2] = UInt8((b >> 16) & 0xFF); p[{off}+3] = UInt8((b >> 24) & 0xFF) }}")
    elif base_type == "double":
        bits = f"{val_expr}.bitPattern"
        lines.append(f"        do {{ let b = {bits}; p[{off}] = UInt8(b & 0xFF); p[{off}+1] = UInt8((b >> 8) & 0xFF); p[{off}+2] = UInt8((b >> 16) & 0xFF); p[{off}+3] = UInt8((b >> 24) & 0xFF); p[{off}+4] = UInt8((b >> 32) & 0xFF); p[{off}+5] = UInt8((b >> 40) & 0xFF); p[{off}+6] = UInt8((b >> 48) & 0xFF); p[{off}+7] = UInt8((b >> 56) & 0xFF) }}")
    elif sz == 1:
        lines.append(f"        p[{off}] = UInt8(truncatingIfNeeded: {val_expr})")
    elif sz == 2:
        lines.append(f"        do {{ let v = UInt16(truncatingIfNeeded: {val_expr}); p[{off}] = UInt8(v & 0xFF); p[{off}+1] = UInt8((v >> 8) & 0xFF) }}")
    elif sz == 4:
        lines.append(f"        do {{ let v = UInt32(truncatingIfNeeded: {val_expr}); p[{off}] = UInt8(v & 0xFF); p[{off}+1] = UInt8((v >> 8) & 0xFF); p[{off}+2] = UInt8((v >> 16) & 0xFF); p[{off}+3] = UInt8((v >> 24) & 0xFF) }}")
    elif sz == 8:
        lines.append(f"        do {{ let v = UInt64(truncatingIfNeeded: {val_expr}); p[{off}] = UInt8(v & 0xFF); p[{off}+1] = UInt8((v >> 8) & 0xFF); p[{off}+2] = UInt8((v >> 16) & 0xFF); p[{off}+3] = UInt8((v >> 24) & 0xFF); p[{off}+4] = UInt8((v >> 32) & 0xFF); p[{off}+5] = UInt8((v >> 40) & 0xFF); p[{off}+6] = UInt8((v >> 48) & 0xFF); p[{off}+7] = UInt8((v >> 56) & 0xFF) }}")


def generate_crc_extras_swift(messages, out_path):
    """Generate MAVLinkCRCExtras.swift."""
    # Deduplicate by ID
    seen = {}
    for m in messages:
        seen[m["id"]] = m
    unique_msgs = sorted(seen.values(), key=lambda m: m["id"])

    lines = [
        "// MAVLinkCRCExtras.swift",
        "// Auto-generated by mavgen_swift.py — DO NOT EDIT",
        "",
        "import Foundation",
        "",
        "/// CRC extra bytes for all MAVLink messages.",
        "/// Used by the frame parser/builder for message validation.",
        "enum MAVLinkCRCExtras {",
        "    static let table: [UInt32: UInt8] = [",
    ]

    for msg in unique_msgs:
        crc = crc_extra(msg)
        struct_name = to_swift_msg_struct(msg["name"])
        lines.append(f"        {msg['id']}: {crc},  // {msg['name']}")

    lines.append("    ]")
    lines.append("")

    # Also generate a message ID → struct type registry for decoding
    lines.append("    /// Map message ID to struct name for documentation.")
    lines.append("    static let messageNames: [UInt32: String] = [")
    for msg in unique_msgs:
        lines.append(f"        {msg['id']}: \"{msg['name']}\",")
    lines.append("    ]")

    lines.append("}")

    Path(out_path).write_text("\n".join(lines))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate Swift code from MAVLink XML")
    parser.add_argument("--dialect", required=True, help="Path to MAVLink dialect XML")
    parser.add_argument("--output", required=True, help="Output directory for generated Swift files")
    args = parser.parse_args()

    dialect_path = Path(args.dialect).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Parsing {dialect_path}...")
    enums, messages = resolve_xml(dialect_path)

    # Deduplicate
    enum_names = set()
    unique_enums = []
    for e in enums:
        if e["name"] not in enum_names:
            enum_names.add(e["name"])
            unique_enums.append(e)

    msg_ids = set()
    unique_msgs = []
    for m in messages:
        if m["id"] not in msg_ids:
            msg_ids.add(m["id"])
            unique_msgs.append(m)

    print(f"Found {len(unique_enums)} enums, {len(unique_msgs)} messages")

    enums_path = output_dir / "MAVLinkEnums.swift"
    msgs_path = output_dir / "MAVLinkMessages.swift"
    crc_path = output_dir / "MAVLinkCRCExtras.swift"

    print(f"Generating {enums_path.name}...")
    generate_enums_swift(unique_enums, enums_path)

    print(f"Generating {msgs_path.name}...")
    generate_messages_swift(unique_msgs, msgs_path)

    print(f"Generating {crc_path.name}...")
    generate_crc_extras_swift(unique_msgs, crc_path)

    print("Done!")


if __name__ == "__main__":
    main()
