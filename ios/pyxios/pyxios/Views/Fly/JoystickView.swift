//
//  JoystickView.swift
//  pyxios
//
//  Virtual dual-stick joystick overlay for manual control.
//  Sends ManualControl input at 10Hz via DroneManager.
//  Mode 2 (default): Left = throttle/yaw, Right = pitch/roll.
//  Mode 1: Left = pitch/yaw, Right = throttle/roll.
//  When a Bluetooth gamepad is connected, thumbs mirror controller input.
//

import SwiftUI

struct JoystickOverlay: View {
    let droneManager: DroneManager
    private let settings = AppSettings.shared
    private let gamepad = GamepadManager.shared

    private var isMode2: Bool { settings.joystickMode == .mode2 }

    var body: some View {
        HStack {
            // Left stick
            SingleJoystick(
                label: isMode2 ? "THR" : "PIT",
                externalX: CGFloat(gamepad.isConnected ? gamepad.leftX : 0),
                externalY: CGFloat(gamepad.isConnected ? gamepad.leftY : 0)
            ) { x, y in
                // Only apply touch input when no gamepad (gamepad writes directly to droneManager)
                guard !gamepad.isConnected else { return }
                if isMode2 {
                    droneManager.manualZ = settings.throttleCenter.mapThrottle(Float(y))
                    droneManager.manualR = Float(x)
                } else {
                    droneManager.manualX = Float(y)
                    droneManager.manualR = Float(x)
                }
            }

            Spacer()

            // Right stick
            SingleJoystick(
                label: isMode2 ? "PIT" : "THR",
                externalX: CGFloat(gamepad.isConnected ? gamepad.rightX : 0),
                externalY: CGFloat(gamepad.isConnected ? gamepad.rightY : 0)
            ) { x, y in
                guard !gamepad.isConnected else { return }
                if isMode2 {
                    droneManager.manualX = Float(y)
                    droneManager.manualY = Float(x)
                } else {
                    droneManager.manualZ = settings.throttleCenter.mapThrottle(Float(y))
                    droneManager.manualY = Float(x)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if gamepad.isConnected {
                Text(gamepad.controllerName)
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(.cyan.opacity(0.6))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 4)
            }
        }
    }
}

// MARK: - Single Joystick

struct SingleJoystick: View {
    let label: String
    /// External normalized input from gamepad (-1..1). Moves thumb visually.
    var externalX: CGFloat = 0
    var externalY: CGFloat = 0
    var onChange: (CGFloat, CGFloat) -> Void

    @State private var touchPosition: CGSize = .zero
    @State private var isDragging = false

    private let outerRadius: CGFloat = 75
    private let innerRadius: CGFloat = 28

    /// The displayed thumb offset — touch takes priority, otherwise external input.
    private var displayPosition: CGSize {
        if isDragging {
            return touchPosition
        }
        let maxR = outerRadius - innerRadius
        return CGSize(
            width: externalX * maxR,
            height: -externalY * maxR  // screen Y is inverted
        )
    }

    private var isActive: Bool {
        isDragging || externalX != 0 || externalY != 0
    }

    var body: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(Color.white.opacity(isActive ? 0.35 : 0.15), lineWidth: 1.5)
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
                .fill(Color.white.opacity(isActive ? 0.4 : 0.2))
                .frame(width: innerRadius * 2, height: innerRadius * 2)
                .shadow(color: .cyan.opacity(isActive ? 0.5 : 0), radius: 8)
                .offset(displayPosition)
                .animation(isDragging ? nil : .easeOut(duration: 0.08), value: displayPosition.width)
                .animation(isDragging ? nil : .easeOut(duration: 0.08), value: displayPosition.height)
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
                        touchPosition = CGSize(width: dx * scale, height: dy * scale)
                    } else {
                        touchPosition = CGSize(width: dx, height: dy)
                    }
                    let maxR = outerRadius - innerRadius
                    let normX = touchPosition.width / maxR
                    let normY = -touchPosition.height / maxR
                    onChange(normX, normY)
                }
                .onEnded { _ in
                    isDragging = false
                    touchPosition = .zero
                    onChange(0, 0)
                }
        )
    }
}
