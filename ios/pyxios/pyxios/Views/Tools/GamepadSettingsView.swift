//
//  GamepadSettingsView.swift
//  pyxios
//
//  Controller settings: connection status, live stick visualization,
//  button mapping, dead zone, axis inversion.
//

import SwiftUI

struct GamepadSettingsView: View {
    private let gamepad = GamepadManager.shared

    var body: some View {
        List {
            // Connection status card
            connectionSection

            // Live input visualization
            if gamepad.isConnected {
                liveInputSection
            }

            // Button mappings
            buttonMappingSection

            // Stick settings
            stickSettingsSection

            // Reset
            Section {
                Button(role: .destructive) {
                    gamepad.resetToDefaults()
                } label: {
                    Label("Reset to Defaults", systemImage: "arrow.counterclockwise")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("Controller")
    }

    // MARK: - Connection

    private var connectionSection: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: gamepad.isConnected ? "gamecontroller.fill" : "gamecontroller")
                    .font(.title)
                    .foregroundStyle(gamepad.isConnected ? .cyan : .secondary)
                    .frame(width: 44)

                VStack(alignment: .leading, spacing: 3) {
                    Text(gamepad.isConnected ? gamepad.controllerName : "No Controller")
                        .font(.headline)
                    Text(gamepad.isConnected ? "Connected via Bluetooth" : "Connect a Bluetooth gamepad")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if gamepad.isConnected && gamepad.batteryLevel >= 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Image(systemName: batteryIcon)
                            .foregroundStyle(gamepad.batteryLevel > 0.2 ? .green : .red)
                        Text("\(Int(gamepad.batteryLevel * 100))%")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 6)
        } footer: {
            Text("Supports MFi, Xbox, PlayStation, and 8BitDo controllers. Pair in iOS Bluetooth settings.")
        }
    }

    private var batteryIcon: String {
        let level = gamepad.batteryLevel
        if level > 0.75 { return "battery.100" }
        if level > 0.5 { return "battery.75" }
        if level > 0.25 { return "battery.50" }
        return "battery.25"
    }

    // MARK: - Live Input

    private var liveInputSection: some View {
        Section("Live Input") {
            HStack(spacing: 20) {
                Spacer()
                stickVisualizer(label: "L", x: CGFloat(gamepad.leftX), y: CGFloat(gamepad.leftY))
                stickVisualizer(label: "R", x: CGFloat(gamepad.rightX), y: CGFloat(gamepad.rightY))
                Spacer()
            }
            .padding(.vertical, 8)

            // Button indicators
            buttonIndicatorRow
        }
    }

    private func stickVisualizer(label: String, x: CGFloat, y: CGFloat) -> some View {
        ZStack {
            // Background
            Circle()
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
                .frame(width: 80, height: 80)

            // Dead zone ring
            Circle()
                .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                .frame(width: 80 * CGFloat(gamepad.deadZone) * 2, height: 80 * CGFloat(gamepad.deadZone) * 2)

            // Crosshairs
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(width: 1, height: 80)
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(width: 80, height: 1)

            // Thumb dot
            Circle()
                .fill(x != 0 || y != 0 ? Color.cyan : Color.white.opacity(0.3))
                .frame(width: 14, height: 14)
                .shadow(color: .cyan.opacity(x != 0 || y != 0 ? 0.5 : 0), radius: 4)
                .offset(x: x * 33, y: -y * 33)

            // Label
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.3))
                .offset(y: 48)
        }
    }

    private var buttonIndicatorRow: some View {
        HStack(spacing: 8) {
            Spacer()
            ForEach(GamepadButton.allCases) { btn in
                let isPressed = gamepad.pressedButtons.contains(btn)
                Text(btn.rawValue)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(isPressed ? .white : .white.opacity(0.3))
                    .frame(width: 28, height: 28)
                    .background(isPressed ? Color.cyan : Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .animation(.easeOut(duration: 0.1), value: isPressed)
            }
            Spacer()
        }
    }

    // MARK: - Button Mappings

    private var buttonMappingSection: some View {
        Section("Button Mapping") {
            ForEach(GamepadButton.allCases) { btn in
                buttonMappingRow(btn)
            }
        }
    }

    private func buttonMappingRow(_ btn: GamepadButton) -> some View {
        let binding = Binding<GamepadAction>(
            get: { gamepad.buttonMappings[btn] ?? .none },
            set: { gamepad.buttonMappings[btn] = $0 }
        )

        return HStack(spacing: 12) {
            Image(systemName: btn.icon)
                .font(.title3)
                .foregroundStyle(.cyan)
                .frame(width: 30)

            Text(btn.rawValue)
                .font(.subheadline.weight(.medium))
                .frame(width: 28, alignment: .leading)

            Spacer()

            Picker("", selection: binding) {
                ForEach(GamepadAction.allCases) { action in
                    Label(action.rawValue, systemImage: action.icon)
                        .tag(action)
                }
            }
            .labelsHidden()
            .tint(.secondary)
        }
    }

    // MARK: - Stick Settings

    private var stickSettingsSection: some View {
        Section("Stick Settings") {
            VStack(alignment: .leading) {
                HStack {
                    Text("Dead Zone")
                    Spacer()
                    Text(String(format: "%.0f%%", gamepad.deadZone * 100))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Binding(
                        get: { Double(gamepad.deadZone) },
                        set: { gamepad.deadZone = Float($0) }
                    ),
                    in: 0.0...0.4,
                    step: 0.02
                )
                .tint(.orange)
            }

            Toggle(isOn: Binding(
                get: { gamepad.invertLeftY },
                set: { gamepad.invertLeftY = $0 }
            )) {
                Label("Invert Left Y", systemImage: "arrow.up.arrow.down")
            }

            Toggle(isOn: Binding(
                get: { gamepad.invertRightY },
                set: { gamepad.invertRightY = $0 }
            )) {
                Label("Invert Right Y", systemImage: "arrow.up.arrow.down")
            }
        }
    }
}
