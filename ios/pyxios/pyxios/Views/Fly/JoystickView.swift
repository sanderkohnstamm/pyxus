//
//  JoystickView.swift
//  pyxios
//
//  Virtual dual-stick joystick overlay for manual control.
//  Sends ManualControl input at 10Hz via DroneManager.
//  Mode 2 (default): Left = throttle/yaw, Right = pitch/roll.
//  Mode 1: Left = pitch/yaw, Right = throttle/roll.
//

import SwiftUI

struct JoystickOverlay: View {
    let droneManager: DroneManager
    private let settings = AppSettings.shared

    private var isMode2: Bool { settings.joystickMode == .mode2 }

    var body: some View {
        HStack {
            // Left stick
            SingleJoystick(
                label: isMode2 ? "THR" : "PIT",
                springBack: isMode2 ? .horizontal : .both
            ) { x, y in
                if isMode2 {
                    // Left: throttle (Y) + yaw (X)
                    droneManager.manualZ = Float((y + 1) / 2) // map -1..1 → 0..1
                    droneManager.manualR = Float(x)
                } else {
                    // Mode 1 left: pitch (Y) + yaw (X)
                    droneManager.manualX = Float(y)
                    droneManager.manualR = Float(x)
                }
            }

            Spacer()

            // Right stick
            SingleJoystick(
                label: isMode2 ? "PIT" : "THR",
                springBack: isMode2 ? .both : .horizontal
            ) { x, y in
                if isMode2 {
                    // Right: pitch (Y) + roll (X)
                    droneManager.manualX = Float(y)
                    droneManager.manualY = Float(x)
                } else {
                    // Mode 1 right: throttle (Y) + roll (X)
                    droneManager.manualZ = Float((y + 1) / 2)
                    droneManager.manualY = Float(x)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
    }
}

// MARK: - Single Joystick

struct SingleJoystick: View {
    let label: String
    let springBack: SpringBackAxis
    var onChange: (CGFloat, CGFloat) -> Void

    enum SpringBackAxis {
        case both       // springs back to center on both axes
        case horizontal // only X springs back (throttle stays on Y)
    }

    @State private var position: CGSize = .zero
    @State private var isDragging = false

    private let outerRadius: CGFloat = 56
    private let innerRadius: CGFloat = 22

    var body: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(Color.white.opacity(isDragging ? 0.35 : 0.15), lineWidth: 1.5)
                .frame(width: outerRadius * 2, height: outerRadius * 2)

            // Cross hairs
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(width: 1, height: outerRadius * 2)
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(width: outerRadius * 2, height: 1)

            // Label
            Text(label)
                .font(.system(size: 8, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.15))
                .offset(y: outerRadius + 10)

            // Thumb
            Circle()
                .fill(Color.white.opacity(isDragging ? 0.4 : 0.2))
                .frame(width: innerRadius * 2, height: innerRadius * 2)
                .shadow(color: .cyan.opacity(isDragging ? 0.5 : 0), radius: 8)
                .offset(position)
        }
        .frame(width: outerRadius * 2, height: outerRadius * 2)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    isDragging = true
                    let dx = value.translation.width
                    let dy = value.translation.height
                    let dist = sqrt(dx * dx + dy * dy)
                    let maxDist = outerRadius - innerRadius
                    if dist > maxDist {
                        let scale = maxDist / dist
                        position = CGSize(width: dx * scale, height: dy * scale)
                    } else {
                        position = CGSize(width: dx, height: dy)
                    }
                    let maxR = outerRadius - innerRadius
                    let normX = position.width / maxR    // -1 to 1
                    let normY = -position.height / maxR  // -1 to 1 (up = positive)
                    onChange(normX, normY)
                }
                .onEnded { _ in
                    isDragging = false
                    // Always snap to center on release
                    position = .zero
                    onChange(0, 0)
                }
        )
    }
}
