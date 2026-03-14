//
//  MAVLinkFrame.swift
//  pyxios
//
//  MAVLink v2 frame parser and builder.
//  Reference: https://mavlink.io/en/guide/serialization.html
//
//  Frame format (v2):
//    0xFD | len | incompat | compat | seq | sysid | compid | msgid(3) | payload | crc(2)
//

import Foundation

// MARK: - CRC-16/MCRF4XX (X.25)

/// MAVLink uses CRC-16/MCRF4XX for frame validation.
/// Each message type has a "CRC extra" seed byte for version checking.
struct MAVLinkCRC {
    private(set) var value: UInt16 = 0xFFFF

    mutating func accumulate(_ byte: UInt8) {
        var tmp = UInt16(byte) ^ (value & 0xFF)
        tmp ^= (tmp << 4) & 0xFF
        value = (value >> 8)
            ^ (tmp << 8)
            ^ (tmp << 3)
            ^ (tmp >> 4)
    }

    mutating func accumulate(_ data: Data) {
        for byte in data {
            accumulate(byte)
        }
    }

    mutating func accumulate(_ data: [UInt8]) {
        for byte in data {
            accumulate(byte)
        }
    }

    var lowByte: UInt8 { UInt8(value & 0xFF) }
    var highByte: UInt8 { UInt8(value >> 8) }
}

// MARK: - MAVLink v2 Constants

enum MAVLink {
    static let stxV2: UInt8 = 0xFD
    static let headerLength = 10     // bytes before payload
    static let checksumLength = 2
    static let signatureLength = 13  // optional signature

    // System/component IDs for our GCS
    static let gcsSystemID: UInt8 = 255
    static let gcsComponentID: UInt8 = 190  // MAV_COMP_ID_MISSIONPLANNER
}

// MARK: - Parsed Frame

struct MAVLinkFrame {
    let messageID: UInt32
    let systemID: UInt8
    let componentID: UInt8
    let sequence: UInt8
    let payload: Data
}

// MARK: - Streaming Parser

/// Accumulates bytes and emits complete MAVLink v2 frames.
/// Thread-safe: call `append` from receive loop, frames are returned synchronously.
struct MAVLinkParser {
    private var buffer = Data()

    /// Append received bytes and return any complete frames.
    mutating func parse(_ data: Data) -> [MAVLinkFrame] {
        buffer.append(data)
        var frames: [MAVLinkFrame] = []

        while true {
            // Find STX
            guard let stxOffset = buffer.firstIndex(of: MAVLink.stxV2) else {
                buffer.removeAll()
                break
            }

            // Discard bytes before STX
            if stxOffset > buffer.startIndex {
                buffer.removeSubrange(buffer.startIndex..<stxOffset)
            }

            guard buffer.count >= MAVLink.headerLength else { break }

            let bytes = Array(buffer)
            let payloadLength = Int(bytes[1])
                // Check for signature (incompat flag bit 0)
            let hasSig = (bytes[2] & 0x01) != 0
            let totalLength = MAVLink.headerLength + payloadLength + MAVLink.checksumLength
                + (hasSig ? MAVLink.signatureLength : 0)

            guard bytes.count >= totalLength else { break }

            // Parse header
            let sysID = bytes[5]
            let compID = bytes[6]
            let msgID = UInt32(bytes[7]) | (UInt32(bytes[8]) << 8) | (UInt32(bytes[9]) << 16)

            // Extract payload
            let payload = Data(bytes[MAVLink.headerLength..<MAVLink.headerLength + payloadLength])

            // Verify CRC
            var crc = MAVLinkCRC()
            for i in 1..<(MAVLink.headerLength + payloadLength) {
                crc.accumulate(bytes[i])
            }
            if let extra = MAVLinkCRCExtras.table[msgID] {
                crc.accumulate(extra)
            }

            let crcLow = bytes[MAVLink.headerLength + payloadLength]
            let crcHigh = bytes[MAVLink.headerLength + payloadLength + 1]

            if crc.lowByte == crcLow && crc.highByte == crcHigh {
                frames.append(MAVLinkFrame(
                    messageID: msgID,
                    systemID: sysID,
                    componentID: compID,
                    sequence: bytes[4],
                    payload: payload
                ))
                buffer.removeSubrange(buffer.startIndex..<buffer.startIndex + totalLength)
            } else {
                // CRC mismatch — skip this STX byte and try next
                buffer.removeFirst()
            }
        }

        return frames
    }

    /// Reset the parser state (e.g. on reconnect).
    mutating func reset() {
        buffer.removeAll()
    }
}

// MARK: - Frame Builder

struct MAVLinkFrameBuilder {
    private var sequenceCounter: UInt8 = 0

    mutating func build(
        messageID: UInt32,
        payload: [UInt8]
    ) -> Data {
        let seq = sequenceCounter
        sequenceCounter &+= 1

        // Trim trailing zeros from payload (MAVLink v2 zero-trimming)
        var trimmed = payload
        while trimmed.last == 0 && !trimmed.isEmpty {
            trimmed.removeLast()
        }

        var frame = Data()
        frame.reserveCapacity(MAVLink.headerLength + trimmed.count + MAVLink.checksumLength)
        frame.append(MAVLink.stxV2)
        frame.append(UInt8(trimmed.count))
        frame.append(0)  // incompat flags
        frame.append(0)  // compat flags
        frame.append(seq)
        frame.append(MAVLink.gcsSystemID)
        frame.append(MAVLink.gcsComponentID)
        frame.append(UInt8(messageID & 0xFF))
        frame.append(UInt8((messageID >> 8) & 0xFF))
        frame.append(UInt8((messageID >> 16) & 0xFF))
        frame.append(contentsOf: trimmed)

        // CRC (over bytes 1..end of payload, plus CRC extra)
        var crc = MAVLinkCRC()
        for i in 1..<frame.count {
            crc.accumulate(frame[i])
        }
        if let extra = MAVLinkCRCExtras.table[messageID] {
            crc.accumulate(extra)
        }
        frame.append(crc.lowByte)
        frame.append(crc.highByte)

        return frame
    }
}
